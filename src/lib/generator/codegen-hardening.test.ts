import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";

import { buildOpenAPIModel } from "../api-model/openapi.ts";
import { createPreviewResponse, type GeneratorRequest } from "./index.ts";

// ---------------------------------------------------------------------------
// Codegen hardening: push hostile strings through BOTH generator targets and
// assert the emitted code is syntactically valid.
//
// Background: we fixed a real bug of this class — toPythonStringLiteral did not
// escape \r, so CRLF descriptions produced Python SyntaxErrors (see the
// "python output escapes carriage returns from CRLF spec text" regression in
// generator.test.ts). These tests lock out the whole class: for every
// {node, python} x {compactMode false, true} combination we generate a preview
// then prove every emitted source file parses (Python via `py_compile`, TS via
// the TypeScript parser's parseDiagnostics), and that JSON files stay JSON.
//
// Hostile content is injected only into fields that survive the request layer
// (request.ts zod) verbatim to codegen — descriptions, summaries, parameter
// descriptions, enum values, default values, path segments, server URLs — never
// into fields that are sanitized to identifiers (tool/param names). Names stay
// clean so the endpoints resolve; the hostility lives in the text that reaches
// the string-literal emitters.
// ---------------------------------------------------------------------------

// U+202E RIGHT-TO-LEFT OVERRIDE, U+2028 LINE SEPARATOR, U+2029 PARAGRAPH
// SEPARATOR — written as escapes so this source file contains no literal
// invisible/bidi bytes of its own.
const RTL_OVERRIDE = "‮";
const LINE_SEP = " ";
const PARA_SEP = " ";

// A grab-bag of strings that have historically broken naive code emitters.
// Combined into single fields so a handful of generate calls cover the corpus
// without one test per string (keeps runtime sane).
//
// NOTE: C0 control characters (NUL \x00, vertical tab \x0b, ESC \x1b, form
// feed \f) are kept OUT of this corpus and asserted in their own dedicated
// regression test at the bottom of this file (they originally exposed a real
// escaping bug in the Python target, since fixed).
const HOSTILE_STRINGS = [
    "CRLF here\r\nsecond line",                 // CRLF (the original bug)
    "lone CR\rtail",                            // bare carriage return
    "trailing backslash\\",                     // backslash + trailing backslash
    "double \\\" and single ' quotes",          // embedded quotes
    'Python triple """ quotes""" inside',       // Python triple-quote breakout attempt
    "TS backtick ` and ${process.env.SECRET}",  // TS template interpolation attempt
    "interp ${\"7*7\"} and ${1+1}",             // more interpolation shapes
    `unicode emoji \u{1F600} and RTL ${RTL_OVERRIDE} override`, // astral + RTL override
    `line sep ${LINE_SEP} para sep ${PARA_SEP} end`,           // JS line terminators (legal in ES2019+ literals)
    "HTML </script> and JSX <div/>",            // markup breakout attempt
    "python comment # not a comment",           // leading-hash line
    "TS block comment */ end /* start",          // comment-close breakout attempt
    "tab\tvalue",                               // tab
].join(" | ");

// C0 controls and form feed, isolated in a dedicated regression test below.
const C0_CONTROL_STRING = "C0 controls NUL\x00 VT\x0b ESC\x1b FF\f end";

// A concentrated blob that lives specifically in enum/default values, which
// reach schema emission (z.enum([...]) in Node, JSON/Python literals in Python).
const HOSTILE_ENUM_VALUES = [
    'quote " value',
    "backtick ` value",
    "backslash \\ value",
    'triple """ value',
    "newline\nvalue",
    "carriage\rvalue",
    "interp ${x} value",
    "close */ comment",
    `unicode ${LINE_SEP} sep`,
];

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

// Assert a TypeScript source file parses with no syntax errors. We do NOT
// typecheck (imports won't resolve against node_modules); this is syntax-level
// only, matching the design constraint.
function assertTsParses(name: string, content: string): void {
    const sourceFile = ts.createSourceFile(name, content, ts.ScriptTarget.ES2022, true);
    const diagnostics = (sourceFile as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics ?? [];
    if (diagnostics.length > 0) {
        const messages = diagnostics
            .map((d) => `  - ${ts.flattenDiagnosticMessageText(d.messageText, "\n")} (pos ${d.start ?? "?"})`)
            .join("\n");
        assert.fail(`${name} has ${diagnostics.length} TypeScript parse diagnostic(s):\n${messages}`);
    }
}

// Assert every generated Python file compiles (parses) via py_compile, mirroring
// the CRLF regression test's pattern exactly (mkdtemp / mkdir / writeFile /
// execFileSync py_compile / rmSync).
function assertPythonFilesCompile(files: { name: string; content: string }[]): void {
    const pythonFiles = files.filter((file) => file.name.endsWith(".py"));
    assert.ok(pythonFiles.length > 0, "Expected generated Python files");
    // No raw carriage returns should survive to any .py file — a raw \r inside a
    // single-line "..." literal is a Python SyntaxError (the original bug).
    for (const file of pythonFiles) {
        assert.ok(!file.content.includes("\r"), `${file.name} contains a raw carriage return`);
    }
    const tempDir = mkdtempSync(join(tmpdir(), "mcpmint-hardening-"));
    try {
        for (const file of pythonFiles) {
            const target = join(tempDir, file.name);
            mkdirSync(dirname(target), { recursive: true });
            writeFileSync(target, file.content);
            execFileSync("python3", ["-m", "py_compile", target]);
        }
    } finally {
        rmSync(tempDir, { recursive: true, force: true });
    }
}

// Assert every generated JSON file (package.json / server.json / tsconfig.json /
// etc.) still round-trips through JSON.parse — a hostile string that broke out of
// its literal would corrupt the JSON structure, not just the value.
function assertJsonFilesParse(files: { name: string; content: string }[]): void {
    for (const file of files) {
        if (file.name.endsWith(".json")) {
            assert.doesNotThrow(() => JSON.parse(file.content), `${file.name} is not valid JSON`);
        }
    }
}

// Assert every generated TypeScript file parses.
function assertTsFilesParse(files: { name: string; content: string }[]): void {
    const tsFiles = files.filter((file) => file.name.endsWith(".ts") || file.name.endsWith(".tsx"));
    assert.ok(tsFiles.length > 0, "Expected generated TypeScript files");
    for (const file of tsFiles) {
        assertTsParses(file.name, file.content);
    }
}

// ---------------------------------------------------------------------------
// Build a request whose apiModel carries hostile path segments, server URL, and
// operation summary, and whose tool config carries a hostile description plus
// parameters with hostile descriptions, enums, and defaults. Names stay clean so
// the endpoint resolves; only the text that reaches the emitters is hostile.
//
// `text` is the hostile blob to thread through every free-text / value field.
// ---------------------------------------------------------------------------
function buildHostileRequest(text: string): Omit<GeneratorRequest, "exportConfig"> {
    const enumValues = HOSTILE_ENUM_VALUES;
    const apiModel = buildOpenAPIModel({
        openapi: "3.1.0",
        info: { title: "Hostile API", version: "1.0.0", description: text },
        // Hostile server URL — flows to baseUrl and is emitted via JSON.stringify.
        servers: [{ url: `https://api.example.com/${encodeURIComponent(text)}` }],
        paths: {
            // Hostile path segment (kept URL-ish but with a brace param and odd chars).
            // A double-quoted path gets its own dedicated regression test below
            // (it originally broke the generated Python behavior test, since fixed).
            "/items/{itemId}/x`y'z-w": {
                post: {
                    operationId: "createItem",
                    // Hostile summary -> becomes the MCP title.
                    summary: text,
                    description: text,
                    parameters: [
                        {
                            name: "itemId",
                            in: "path",
                            required: true,
                            description: text,
                            schema: { type: "string" },
                        },
                        {
                            name: "mode",
                            in: "query",
                            required: false,
                            description: text,
                            // Hostile enum + default reach schema emission.
                            schema: { type: "string", enum: enumValues, default: enumValues[0] },
                        },
                    ],
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        label: { type: "string", description: text, default: enumValues[0] },
                                        kind: { type: "string", enum: enumValues },
                                    },
                                    required: ["label"],
                                },
                            },
                        },
                    },
                    responses: {
                        "200": {
                            description: "OK",
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object",
                                        properties: {
                                            id: { type: "string", description: text },
                                            note: { type: "string", enum: enumValues },
                                        },
                                        required: ["id"],
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    return {
        spec: {
            info: { title: "Hostile API", version: "1.0.0", description: text },
            baseUrl: `https://api.example.com/${encodeURIComponent(text)}`,
            apiModel,
        },
        tools: [
            {
                endpointId: "POST-/items/{itemId}/x`y'z-w",
                enabled: true,
                // Clean tool name (request layer sanitizes to an identifier anyway).
                toolName: "create-item",
                // Hostile description survives verbatim (only capped at 8000 chars).
                description: text,
                // Hostile MCP title (name field capped at 200; hostile content fits).
                title: text.slice(0, 190),
                parameters: [
                    {
                        name: "item_id",
                        originalName: "itemId",
                        type: "string",
                        required: true,
                        description: text,
                        location: "path",
                        schema: { type: "string" },
                    },
                    {
                        name: "mode",
                        originalName: "mode",
                        type: "string",
                        required: false,
                        description: text,
                        location: "query",
                        schema: { type: "string", enum: enumValues, default: enumValues[0] },
                    },
                    {
                        name: "label",
                        originalName: "label",
                        type: "string",
                        required: true,
                        description: text,
                        location: "body",
                        schema: { type: "string", default: enumValues[0] },
                    },
                ],
                bodySchema: {
                    type: "object",
                    properties: {
                        label: { type: "string", description: text, default: enumValues[0] },
                        kind: { type: "string", enum: enumValues },
                    },
                    required: ["label"],
                },
                bodyContentType: "application/json",
            },
        ],
        serverConfig: {
            name: "hostile-mcp",
            version: "1.0.0",
            host: "localhost",
            port: 8080,
            transport: "http",
        },
        authConfig: {
            type: "apiKey",
            apiKey: { name: "x-api-key", in: "header" },
        },
    };
}

// ---------------------------------------------------------------------------
// Node / TypeScript target — full hostile corpus, both compact modes.
// ---------------------------------------------------------------------------

for (const compactMode of [false, true]) {
    test(`node target survives hostile strings (compactMode=${compactMode})`, () => {
        const preview = createPreviewResponse({
            ...buildHostileRequest(HOSTILE_STRINGS),
            exportConfig: {
                language: "node",
                framework: "mcp-ts-sdk",
                packageManager: "npm",
                compactMode,
                features: { documentation: true, docker: true, tests: true, verification: true },
            },
        });

        // Every emitted TS file must parse with zero syntax diagnostics.
        assertTsFilesParse(preview.files);
        // Every emitted JSON file must remain valid JSON.
        assertJsonFilesParse(preview.files);
    });
}

// ---------------------------------------------------------------------------
// Python / FastMCP target — full hostile corpus, both compact modes.
// ---------------------------------------------------------------------------

for (const compactMode of [false, true]) {
    test(`python target survives hostile strings (compactMode=${compactMode})`, () => {
        const preview = createPreviewResponse({
            ...buildHostileRequest(HOSTILE_STRINGS),
            exportConfig: {
                language: "python",
                framework: "fastmcp",
                packageManager: "npm",
                compactMode,
                features: { documentation: true, docker: true, tests: true, verification: true },
            },
        });

        // Every emitted .py file must compile (parse) via py_compile.
        assertPythonFilesCompile(preview.files);
        // Any JSON files bundled alongside must remain valid JSON.
        assertJsonFilesParse(preview.files);
    });
}

// ---------------------------------------------------------------------------
// Focused: the original CRLF class, generalized to lone \r and mixed line
// terminators, asserted directly on the emitted files of BOTH targets.
// ---------------------------------------------------------------------------

test("both targets survive mixed line terminators in every text field (CRLF, lone CR, LF)", () => {
    const text = "a\r\nb\rc\nd e f";

    const python = createPreviewResponse({
        ...buildHostileRequest(text),
        exportConfig: {
            language: "python",
            framework: "fastmcp",
            packageManager: "npm",
            features: { documentation: false, docker: false, tests: false, verification: true },
        },
    });
    assertPythonFilesCompile(python.files);

    const node = createPreviewResponse({
        ...buildHostileRequest(text),
        exportConfig: {
            language: "node",
            framework: "mcp-ts-sdk",
            packageManager: "npm",
            features: { documentation: false, docker: false, tests: false, verification: true },
        },
    });
    assertTsFilesParse(node.files);
});

// ---------------------------------------------------------------------------
// Regression: C0 control characters in Python string literals.
//
// toPythonStringLiteral (src/lib/generator/utils.ts) originally escaped \\, ",
// \n, \r, \t but NOT other C0 control characters. A description/summary/title containing a
// raw NUL (\x00) — or VT \x0b / ESC \x1b / form feed \f — is emitted verbatim
// into src/server.py (the @mcp.tool title= argument and the function docstring,
// python.ts lines ~259 and ~290). Python then refuses to compile the module:
//
//   SyntaxError: source code string cannot contain null bytes
//
// Exact reproducing input: any tool/operation description or summary equal to
//   "C0 controls NUL\x00 VT\x0b ESC\x1b FF\f end"
// (only \x00 is fatal to py_compile; VT/ESC/FF pass compile but are still emitted
// raw, which is undesirable — the emitter should escape all C0 controls).
//
// The Node target is NOT affected: toJsStringLiteral has the same escape gap, but
// the TypeScript parser accepts raw C0 controls inside string literals, so the
// generated .ts still parses. This is Python-specific.
//
// FIXED: toPythonStringLiteral now escapes all C0 controls as \xHH; this test
// is the live regression guard.
// ---------------------------------------------------------------------------

test(
    "python target escapes C0 control characters (NUL) in descriptions",
    () => {
        const preview = createPreviewResponse({
            ...buildHostileRequest(C0_CONTROL_STRING),
            exportConfig: {
                language: "python",
                framework: "fastmcp",
                packageManager: "npm",
                features: { documentation: false, docker: false, tests: false, verification: true },
            },
        });
        assertPythonFilesCompile(preview.files);
    }
);

// ---------------------------------------------------------------------------
// Regression: a double quote in an operation path used to break the generated Python
// behavior test.
//
// renderPythonOperationBehaviorTest (src/lib/generator/targets/python.ts ~1272)
// emits the expected URL assertion by raw string interpolation:
//
//   `    assert call["url"] == "https://unit.example.test${expectedPath}"`
//
// `expectedPath` comes straight from the operation's path template (with path
// params substituted) and is NOT escaped for the double-quoted Python literal it
// lands in. An operation path containing a `"` (e.g. `/items/x"w`) therefore emits
//
//   assert call["url"] == "https://unit.example.test/items/x"w"
//
// which is an unterminated Python string literal — tests/test_behavior.py fails
// py_compile with "SyntaxError: unterminated string literal". The runtime module
// src/operations.py is fine (it uses JSON.stringify for the path); only the
// generated test file is affected. The Node behavior test is NOT affected (it
// JSON.stringifies the URL).
//
// Exact reproducing input: any operation whose path contains a double quote.
// FIXED: the URL assertion now goes through toPythonStringLiteral; this test is
// the live regression guard.
// ---------------------------------------------------------------------------

function buildQuotedPathRequest(): Omit<GeneratorRequest, "exportConfig"> {
    const apiModel = buildOpenAPIModel({
        openapi: "3.1.0",
        info: { title: "Quote Path API", version: "1.0.0" },
        servers: [{ url: "https://api.example.com" }],
        paths: {
            '/items/x"w': {
                get: {
                    operationId: "quotedPath",
                    summary: "Quoted path",
                    responses: { "200": { description: "OK" } },
                },
            },
        },
    });
    return {
        spec: { info: { title: "Quote Path API", version: "1.0.0" }, baseUrl: "https://api.example.com", apiModel },
        tools: [
            {
                endpointId: 'GET-/items/x"w',
                enabled: true,
                toolName: "quoted-path",
                description: "Quoted path",
                parameters: [],
            },
        ],
        serverConfig: { name: "quote-mcp", version: "1.0.0", host: "localhost", port: 8080, transport: "http" },
        authConfig: { type: "none" },
    };
}

test(
    "python behavior test escapes a double quote in an operation path",
    () => {
        const preview = createPreviewResponse({
            ...buildQuotedPathRequest(),
            exportConfig: {
                language: "python",
                framework: "fastmcp",
                packageManager: "npm",
                // tests: true so tests/test_behavior.py is emitted.
                features: { documentation: false, docker: false, tests: true, verification: true },
            },
        });
        assertPythonFilesCompile(preview.files);
    }
);

// The Node side of the same input is expected to pass today (documents that the
// gap is Python-specific). Kept un-skipped as a live guard.
test("node target survives C0 control characters (documents the gap is python-specific)", () => {
    const preview = createPreviewResponse({
        ...buildHostileRequest(C0_CONTROL_STRING),
        exportConfig: {
            language: "node",
            framework: "mcp-ts-sdk",
            packageManager: "npm",
            features: { documentation: false, docker: false, tests: false, verification: true },
        },
    });
    assertTsFilesParse(preview.files);
});
