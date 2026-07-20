#!/usr/bin/env node
// mcpmint CLI — generate MCP servers from OpenAPI/Postman specs, locally.
// Your spec never leaves your machine: everything runs in this process.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { parseArgs } from "node:util";
import { parseOpenAPIFromContent } from "../../src/lib/parsers/openapi.ts";
import { buildGeneratorRequest, type BuildRequestOptions } from "./build-request.ts";
import { generateToDisk } from "./generate.ts";
import { inspectSpec } from "./inspect.ts";

const VERSION = "0.1.0";

const HELP = `mcpmint ${VERSION}
Generate MCP servers from OpenAPI and Postman specs — locally, in your terminal.
Your spec never leaves your machine.

USAGE
  mcpmint generate <spec> [options]
  mcpmint inspect  <spec>
  mcpmint --help | --version

  <spec> is a path to an OpenAPI/Swagger (JSON or YAML) or Postman collection file.

GENERATE OPTIONS
  --lang <node|python>          Target language              (default: node)
  --transport <stdio|http|sse>  MCP transport                (default: stdio)
  --out <dir>                   Output directory             (default: ./<server-name>)
  --name <name>                 Server name                  (default: derived from spec title)
  --compact                     Emit 3 meta-tools instead of one tool per endpoint
  --package-manager <npm|pnpm|yarn>  Node package manager    (default: npm)
  --host <host>                 HTTP/SSE bind host           (default: localhost)
  --port <port>                 HTTP/SSE port                (default: 8080)
  --verify <off|fast|full>      Verify generated output      (default: fast)
  --no-tests                    Skip generated smoke tests
  --no-docs                     Skip README/docs
  --docker                      Include Dockerfile + compose
  --force                       Overwrite a non-empty output directory

EXAMPLES
  mcpmint inspect ./petstore.json
  mcpmint generate ./petstore.json --lang python --transport http --out ./petstore-mcp
  mcpmint generate ./api.yaml --compact --verify full
`;

function fail(message: string): never {
    process.stderr.write(`mcpmint: ${message}\n`);
    process.exit(1);
}

async function loadSpec(specPath: string) {
    const resolved = resolve(specPath);
    if (!existsSync(resolved)) fail(`spec file not found: ${specPath}`);
    let content: string;
    try {
        content = readFileSync(resolved, "utf8");
    } catch (error) {
        fail(`could not read ${specPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
        return await parseOpenAPIFromContent(content, basename(resolved));
    } catch (error) {
        fail(error instanceof Error ? error.message : "failed to parse spec");
    }
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[], flag: string, fallback: T): T {
    if (value === undefined) return fallback;
    if (!(allowed as readonly string[]).includes(value)) {
        fail(`--${flag} must be one of: ${allowed.join(", ")} (got "${value}")`);
    }
    return value as T;
}

async function runGenerate(specPath: string, rawArgs: string[]) {
    const { values } = parseArgs({
        args: rawArgs,
        options: {
            lang: { type: "string" },
            transport: { type: "string" },
            out: { type: "string" },
            name: { type: "string" },
            compact: { type: "boolean", default: false },
            "package-manager": { type: "string" },
            host: { type: "string" },
            port: { type: "string" },
            verify: { type: "string" },
            "no-tests": { type: "boolean", default: false },
            "no-docs": { type: "boolean", default: false },
            docker: { type: "boolean", default: false },
            force: { type: "boolean", default: false },
        },
        allowPositionals: false,
    });

    const spec = await loadSpec(specPath);
    if (spec.endpoints.length === 0) fail("no supported endpoints found in the spec");

    const portNum = values.port ? Number(values.port) : 8080;
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
        fail(`--port must be an integer between 1 and 65535 (got "${values.port}")`);
    }

    const options: BuildRequestOptions = {
        language: oneOf(values.lang, ["node", "python"] as const, "lang", "node"),
        transport: oneOf(values.transport, ["stdio", "http", "sse"] as const, "transport", "stdio"),
        packageManager: oneOf(values["package-manager"], ["npm", "pnpm", "yarn"] as const, "package-manager", "npm"),
        compactMode: Boolean(values.compact),
        name: values.name,
        host: values.host || "localhost",
        port: portNum,
        verificationMode: values.verify === "full" ? "full" : "fast",
        features: {
            documentation: !values["no-docs"],
            docker: Boolean(values.docker),
            tests: !values["no-tests"],
            verification: values.verify !== "off",
        },
    };

    const verify = oneOf(values.verify, ["off", "fast", "full"] as const, "verify", "fast");

    let request;
    try {
        request = buildGeneratorRequest(spec, options);
    } catch (error) {
        fail(error instanceof Error ? error.message : "failed to build generation request");
    }

    const outDir = resolve(values.out || request.serverConfig.name);
    if (existsSync(outDir) && readdirSync(outDir).length > 0 && !values.force) {
        fail(`output directory "${outDir}" is not empty. Use --force to overwrite.`);
    }

    let result;
    try {
        result = generateToDisk(request, outDir, verify, Boolean(values.force));
    } catch (error) {
        fail(error instanceof Error ? error.message : "generation failed");
    }

    process.stdout.write(`\n  Generated ${result.fileCount} files to ${outDir}\n`);
    process.stdout.write(
        `  ${request.exportConfig.language} · ${request.serverConfig.transport} · ` +
            `${options.compactMode ? "compact (3 meta-tools)" : `${request.tools.length} tools`}\n`,
    );

    if (result.warnings.length > 0) {
        process.stdout.write(`\n  Warnings:\n`);
        for (const warning of result.warnings.slice(0, 10)) {
            process.stdout.write(`    - ${warning}\n`);
        }
        if (result.warnings.length > 10) {
            process.stdout.write(`    ... and ${result.warnings.length - 10} more\n`);
        }
    }

    if (result.verification) {
        const { status, mode, checks } = result.verification;
        process.stdout.write(`\n  Verification (${mode}): ${status}\n`);
        for (const check of checks) {
            const mark = check.status === "passed" ? "PASS" : check.status === "failed" ? "FAIL" : "skip";
            process.stdout.write(`    [${mark}] ${check.name}${check.details ? ` — ${check.details}` : ""}\n`);
        }
        if (status === "failed") {
            process.stderr.write(`\n  Generated output failed verification.\n`);
            process.exit(2);
        }
    }

    process.stdout.write(`\n  Next: cd ${outDir} && see README.md\n\n`);
}

async function runInspect(specPath: string) {
    const spec = await loadSpec(specPath);
    process.stdout.write(`\n${inspectSpec(spec)}\n\n`);
}

async function main() {
    const argv = process.argv.slice(2);

    if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h" || argv[0] === "help") {
        process.stdout.write(HELP);
        return;
    }
    if (argv[0] === "--version" || argv[0] === "-v") {
        process.stdout.write(`${VERSION}\n`);
        return;
    }

    const command = argv[0];
    const rest = argv.slice(1);

    if (command === "generate" || command === "inspect") {
        const specPath = rest[0];
        if (!specPath || specPath.startsWith("-")) fail(`${command} requires a <spec> file path`);
        if (command === "generate") await runGenerate(specPath, rest.slice(1));
        else await runInspect(specPath);
        return;
    }

    fail(`unknown command "${command}". Run "mcpmint --help".`);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
