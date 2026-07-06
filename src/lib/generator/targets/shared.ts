// Shared helpers for the Node and Python generator targets.
//
// Two categories live here:
//   1. Emitted-file builders that were byte-identical (or differ only by a literal)
//      across both targets: buildManifest, getEnvExample, renderDockerCompose.
//   2. A single test-expectation ORACLE that reimplements the OpenAPI style/explode
//      serialization algorithm in plain TypeScript. Both targets' behavior-test
//      emitters call this oracle to compute the strings/entries they assert the
//      GENERATED code produces. Previously each target carried its own byte-identical
//      copy of this oracle (node: expected*; python: pythonExpected*), so a shared bug
//      would have been masked. Collapsing them to one copy keeps the generated tests
//      as an independent check of the generated serialization templates.
//
// Nothing here emits language source that differs structurally between targets; the
// generated serialization.ts / serialization.py templates deliberately stay in their
// own files.

import type {
    GeneratedManifest,
    GenerationPlan,
    GenerationTool,
} from "../types.ts";
import { collectAuthSchemes } from "../strategies/auth.ts";

// ---------------------------------------------------------------------------
// Emitted-file builders shared across targets
// ---------------------------------------------------------------------------

export function buildManifest(plan: GenerationPlan, language: GeneratedManifest["language"]): GeneratedManifest {
    return {
        generatorVersion: plan.generatorVersion,
        contractVersion: plan.contractVersion,
        language,
        framework: plan.runtime.framework,
        features: plan.features,
        transport: plan.runtime.transport,
        serverName: plan.server.name,
        generatedAt: plan.generatedAt,
        toolCount: plan.tools.length,
    };
}

export function getEnvExample(plan: GenerationPlan): string {
    const authSchemes = collectAuthSchemes(plan);
    const lines = [`# Base URL for the API`, `API_BASE_URL=${plan.spec.baseUrl || "https://api.example.com"}`];

    if (authSchemes.length > 0) {
        lines.push("", "# Auth");
    }

    for (const auth of authSchemes) {
        if (auth.apiKeyEnvVar) lines.push(`${auth.apiKeyEnvVar}=your_api_key_here`);
        if (auth.bearerTokenEnvVar) lines.push(`${auth.bearerTokenEnvVar}=your_token_here`);
        if (auth.basicUsernameEnvVar) lines.push(`${auth.basicUsernameEnvVar}=your_username`);
        if (auth.basicPasswordEnvVar) lines.push(`${auth.basicPasswordEnvVar}=your_password`);
    }

    if (plan.runtime.transport !== "stdio") {
        lines.push("", "# MCP server access");
        if (plan.mcpServerAuth.type === "bearer") {
            lines.push(`${plan.mcpServerAuth.tokenEnvVar}=`);
        } else {
            lines.push(`# ${plan.mcpServerAuth.tokenEnvVar}=only_used_when_bearer_auth_is_selected`);
        }
        if (plan.mcpServerAuth.allowedOrigins.length > 0) {
            lines.push(`${plan.mcpServerAuth.allowedOriginsEnvVar}=${plan.mcpServerAuth.allowedOrigins.join(",")}`);
        } else {
            lines.push(`# ${plan.mcpServerAuth.allowedOriginsEnvVar}=https://client.example.com,http://localhost:3000`);
        }
    }

    return `${lines.join("\n")}\n`;
}

export function renderDockerCompose(plan: GenerationPlan): string {
    const ports = plan.runtime.transport === "stdio"
        ? ""
        : `    ports:\n      - "${plan.server.port}:${plan.server.port}"\n`;

    return `services:
  ${plan.server.name}:
    build: .
    env_file:
      - .env
${ports}    restart: unless-stopped
`;
}

// ---------------------------------------------------------------------------
// Test sample-value pickers shared across targets
// ---------------------------------------------------------------------------

function getSchemaType(schema?: Record<string, unknown>): string | undefined {
    const type = schema?.type;
    if (typeof type === "string") return type;
    if (Array.isArray(type)) return type.find((entry): entry is string => typeof entry === "string");
    return undefined;
}

export function getTestSampleValue(param: GenerationTool["params"][number]): unknown {
    const schemaType = getSchemaType(param.schema);

    if (param.schema?.format === "binary" || schemaType === "file") return "ZmlsZSBjb250ZW50";
    if (schemaType === "array") return ["alpha", "beta"];
    if (schemaType === "object") return { status: "open", owner: "team" };
    if (schemaType === "integer" || schemaType === "number") return 42;
    if (schemaType === "boolean") return true;

    return `${param.argName}-value`;
}

export function getTestArgs(tool: GenerationTool): Record<string, unknown> {
    return Object.fromEntries(tool.params.map((param) => [param.argName, getTestSampleValue(param)]));
}

export function getExpectedJsonBody(tool: GenerationTool, args: Record<string, unknown>): unknown {
    const requestBody = tool.requestBody;
    if (!requestBody) return undefined;

    if (requestBody.contentKind === "rawJsonObject" || requestBody.contentKind === "rawArray") {
        return args[requestBody.params[0]?.argName || "body"];
    }

    return Object.fromEntries(requestBody.params.map((param) => [param.sourceName, args[param.argName]]));
}

// ---------------------------------------------------------------------------
// Test-expectation oracle: a single plain-TS reimplementation of the OpenAPI
// style/explode serialization algorithm, used to compute the values the generated
// behavior tests assert against. Keep in sync with the generated serialization
// templates in node.ts (renderSerialization) and python.ts (renderSerialization).
// ---------------------------------------------------------------------------

export function scalarToExpectedString(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
    return JSON.stringify(value);
}

function expectedObjectEntries(value: unknown): [string, unknown][] {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    return Object.entries(value as Record<string, unknown>).filter(([, entryValue]) => entryValue !== undefined);
}

function expectedExplode(style: string, explode?: boolean): boolean {
    return explode ?? style === "form";
}

export function expectedSerializedParameterValue(
    name: string,
    value: unknown,
    options: { location: string; style?: string; explode?: boolean }
): string {
    const style = options.style || (options.location === "path" || options.location === "header" ? "simple" : "form");
    const explode = expectedExplode(style, options.explode);
    const delimiter = style === "spaceDelimited" ? " " : style === "pipeDelimited" ? "|" : ",";

    if (Array.isArray(value)) {
        return value.map(scalarToExpectedString).join(delimiter);
    }

    const entries = expectedObjectEntries(value);
    if (entries.length > 0) {
        if (explode) {
            return entries.map(([key, entryValue]) => `${key}=${scalarToExpectedString(entryValue)}`).join(delimiter);
        }
        return entries.flatMap(([key, entryValue]) => [key, scalarToExpectedString(entryValue)]).join(delimiter);
    }

    return scalarToExpectedString(value);
}

export function expectedPathParameter(
    name: string,
    value: unknown,
    options: { style?: string; explode?: boolean }
): string {
    const style = options.style || "simple";
    const explode = expectedExplode(style, options.explode);
    const encode = (entry: unknown) => encodeURIComponent(scalarToExpectedString(entry));
    const encodedName = encodeURIComponent(name);

    if (Array.isArray(value)) {
        const encodedValues = value.map(encode);
        if (style === "label") return `.${encodedValues.join(".")}`;
        if (style === "matrix") {
            return explode
                ? encodedValues.map((entry) => `;${encodedName}=${entry}`).join("")
                : `;${encodedName}=${encodedValues.join(",")}`;
        }
        return encodedValues.join(",");
    }

    const entries = expectedObjectEntries(value);
    if (entries.length > 0) {
        if (style === "label") {
            const values = explode
                ? entries.map(([key, entryValue]) => `${encodeURIComponent(key)}=${encode(entryValue)}`)
                : entries.flatMap(([key, entryValue]) => [encodeURIComponent(key), encode(entryValue)]);
            return `.${values.join(".")}`;
        }
        if (style === "matrix") {
            if (explode) {
                return entries.map(([key, entryValue]) => `;${encodeURIComponent(key)}=${encode(entryValue)}`).join("");
            }
            const values = entries.flatMap(([key, entryValue]) => [encodeURIComponent(key), encode(entryValue)]);
            return `;${encodedName}=${values.join(",")}`;
        }
        const values = explode
            ? entries.map(([key, entryValue]) => `${encodeURIComponent(key)}=${encode(entryValue)}`)
            : entries.flatMap(([key, entryValue]) => [encodeURIComponent(key), encode(entryValue)]);
        return values.join(",");
    }

    const encodedValue = encode(value);
    if (style === "label") return `.${encodedValue}`;
    if (style === "matrix") return `;${encodedName}=${encodedValue}`;
    return encodedValue;
}

export function expectedQueryEntries(
    name: string,
    value: unknown,
    options: { style?: string; explode?: boolean }
): [string, string][] {
    const style = options.style || "form";
    const explode = expectedExplode(style, options.explode);

    if (Array.isArray(value)) {
        if (style === "form" && explode) {
            return value.map((entry) => [name, scalarToExpectedString(entry)]);
        }
        return [[name, expectedSerializedParameterValue(name, value, { location: "query", style, explode })]];
    }

    const entries = expectedObjectEntries(value);
    if (entries.length > 0) {
        if (style === "deepObject") {
            return entries.map(([key, entryValue]) => [`${name}[${key}]`, scalarToExpectedString(entryValue)]);
        }
        if (style === "form" && explode) {
            return entries.map(([key, entryValue]) => [key, scalarToExpectedString(entryValue)]);
        }
        return [[name, expectedSerializedParameterValue(name, value, { location: "query", style, explode })]];
    }

    return [[name, scalarToExpectedString(value)]];
}

export function getExpectedPath(tool: GenerationTool, args: Record<string, unknown>): string {
    return tool.params
        .filter((param) => param.location === "path")
        .reduce((path, param) => {
            const replacement = expectedPathParameter(param.sourceName, args[param.argName], {
                style: param.style,
                explode: param.explode,
            });
            return path.replace(`{${param.sourceName}}`, replacement);
        }, tool.path);
}

export function getExpectedQueryEntries(tool: GenerationTool, args: Record<string, unknown>): [string, string][] {
    return tool.params
        .filter((entry) => entry.location === "query")
        .flatMap((param) => expectedQueryEntries(param.sourceName, args[param.argName], {
            style: param.style,
            explode: param.explode,
        }));
}
