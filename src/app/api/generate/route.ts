import { NextRequest, NextResponse } from "next/server";
import Handlebars from "handlebars";
import Archiver from "archiver";

// Types
interface GenerateRequest {
    spec: {
        info: { title: string; version: string; description?: string };
        baseUrl: string;
    };
    tools: ToolConfig[];
    serverConfig: ServerConfig;
    authConfig: AuthConfig;
    exportConfig: ExportConfig;
}

interface ToolConfig {
    endpointId: string;
    enabled: boolean;
    toolName: string;
    description: string;
    parameters: {
        name: string;
        originalName: string;
        type: string;
        required: boolean;
        description: string;
        location?: "path" | "query" | "header" | "body";
        schema?: Record<string, unknown>;
    }[];
    bodySchema?: Record<string, unknown>;
}

interface ServerConfig {
    name: string;
    version: string;
    host: string;
    port: number;
    transport: "stdio" | "sse" | "http";
}

interface AuthConfig {
    type: "none" | "apiKey" | "bearer" | "basic";
    apiKey?: { name: string; in: "header" | "query" };
}

interface ExportConfig {
    language: "node" | "python";
    framework: "mcp-ts-sdk" | "fastmcp";
    packageManager: "npm" | "pnpm" | "yarn";
}

// Parse endpoint ID to get method and path
function parseEndpointId(id: string): { method: string; path: string } {
    if (id.includes("::")) {
        const [method, path] = id.split("::");
        return { method, path };
    }

    const postmanMatch = id.match(/^(GET|POST|PUT|DELETE|PATCH)-(.+)-(\d+)$/);
    if (postmanMatch) {
        return {
            method: postmanMatch[1],
            path: postmanMatch[2],
        };
    }

    const [method, ...pathParts] = id.split("-");
    return { method, path: pathParts.join("-") };
}

// Convert type to Zod type - handles simple types and resolved schemas
function toZodType(type: string, schema?: Record<string, unknown>): string {
    // If we have a full schema, use it to generate proper Zod type
    if (schema) {
        return schemaToZodType(schema);
    }

    // Fallback for simple types
    const map: Record<string, string> = {
        string: "z.string()",
        integer: "z.number()",
        number: "z.number()",
        boolean: "z.boolean()",
        array: "z.array(z.unknown())",
        object: "z.record(z.unknown())",
    };
    return map[type.toLowerCase()] || "z.string()";
}

// Generate proper Zod schema from OpenAPI schema (recursively resolves nested objects)
function schemaToZodType(schema: Record<string, unknown>): string {
    if (!schema) return "z.unknown()";

    const type = schema.type as string;

    // Handle enums
    if (schema.enum && Array.isArray(schema.enum)) {
        const enumVals = schema.enum.map(v => typeof v === "string" ? `"${v}"` : String(v)).join(", ");
        return `z.enum([${enumVals}])`;
    }

    switch (type) {
        case "string":
            let strType = "z.string()";
            if (schema.format === "email") strType = "z.string().email()";
            if (schema.format === "uri" || schema.format === "url") strType = "z.string().url()";
            if (schema.format === "uuid") strType = "z.string().uuid()";
            if (schema.format === "date" || schema.format === "date-time") strType = "z.string()";
            return strType;

        case "integer":
            return "z.number().int()";

        case "number":
            return "z.number()";

        case "boolean":
            return "z.boolean()";

        case "array":
            const items = schema.items as Record<string, unknown>;
            if (items) {
                return `z.array(${schemaToZodType(items)})`;
            }
            return "z.array(z.unknown())";

        case "object":
        default:
            const properties = schema.properties as Record<string, Record<string, unknown>>;
            const required = (schema.required || []) as string[];

            if (properties) {
                const props = Object.entries(properties).map(([key, propSchema]) => {
                    const zodType = schemaToZodType(propSchema);
                    const isRequired = required.includes(key);
                    const desc = propSchema.description as string;
                    let prop = `${key}: ${zodType}`;
                    if (!isRequired) prop += ".optional()";
                    if (desc) prop += `.describe("${desc.replace(/"/g, '\\"').replace(/\n/g, ' ')}")`;
                    return prop;
                });
                return `z.object({\n    ${props.join(",\n    ")}\n  })`;
            }

            // No properties defined, accept any object
            return "z.record(z.unknown())";
    }
}

// Convert type to Python type
function toPythonType(type: string): string {
    const map: Record<string, string> = {
        string: "str",
        integer: "int",
        number: "float",
        boolean: "bool",
        array: "list",
        object: "dict",
    };
    return map[type.toLowerCase()] || "str";
}

function toSafeIdentifier(value: string, fallback: string): string {
    const normalized = value
        .trim()
        .replace(/[^a-zA-Z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "");

    const safeValue = normalized || fallback;
    return /^[a-zA-Z_]/.test(safeValue) ? safeValue : `${fallback}_${safeValue}`;
}

function toJsStringLiteral(str: string): string {
    if (!str) return '""';

    const escaped = str
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t");

    return `"${escaped}"`;
}

function toPythonStringLiteral(str: string): string {
    if (!str) return '""';

    const escaped = str
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n");

    return `"${escaped}"`;
}

function getParameterLocation(
    parameter: ToolConfig["parameters"][number],
    path: string,
    method: string
): "path" | "query" | "header" | "body" {
    if (parameter.location) {
        return parameter.location;
    }

    if (path.includes(`{${parameter.originalName || parameter.name}}`)) {
        return "path";
    }

    if (["POST", "PUT", "PATCH"].includes(method)) {
        return "body";
    }

    return "query";
}

// Generate Node.js MCP server
function generateNodeProject(req: GenerateRequest): Map<string, string> {
    const files = new Map<string, string>();
    const { tools, serverConfig, authConfig, exportConfig, spec } = req;

    // package.json
    const packageJson = {
        name: serverConfig.name,
        version: serverConfig.version,
        type: "module",
        scripts: {
            build: "tsc",
            start: "node dist/index.js",
            dev: "tsx src/index.ts",
        },
        dependencies: {
            "@modelcontextprotocol/sdk": "^1.0.0",
            dotenv: "^16.4.7",
            zod: "^3.22.0",
        },
        devDependencies: {
            "@types/node": "^20.0.0",
            tsx: "^4.7.0",
            typescript: "^5.3.0",
        },
    };
    files.set("package.json", JSON.stringify(packageJson, null, 2));

    // tsconfig.json
    const tsConfig = {
        compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "bundler",
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            outDir: "./dist",
            rootDir: "./src",
        },
        include: ["src/**/*"],
    };
    files.set("tsconfig.json", JSON.stringify(tsConfig, null, 2));

    // .env.example
    let envExample = `# Base URL for the API\nAPI_BASE_URL=${spec.baseUrl || "https://api.example.com"}\n`;
    if (authConfig.type === "apiKey") {
        envExample += `\n# API Key\nAPI_KEY=your_api_key_here\n`;
    } else if (authConfig.type === "bearer") {
        envExample += `\n# Bearer Token\nBEARER_TOKEN=your_token_here\n`;
    } else if (authConfig.type === "basic") {
        envExample += `\n# Basic Auth\nBASIC_USERNAME=your_username\nBASIC_PASSWORD=your_password\n`;
    }
    files.set(".env.example", envExample);

    // Generate tools array for template
    const toolsData = tools.map((tool, toolIndex) => {
        const { method, path } = parseEndpointId(tool.endpointId);
        const normalizedParams = tool.parameters.map((parameter, parameterIndex) => {
            const argName = toSafeIdentifier(
                parameter.name || parameter.originalName,
                `param_${parameterIndex + 1}`
            );
            const apiName = parameter.originalName || parameter.name;
            const location = getParameterLocation(parameter, path, method);

            return {
                ...parameter,
                argName,
                apiName,
                apiNameLiteral: JSON.stringify(apiName),
                location,
                jsPropertyKey: JSON.stringify(argName),
                jsArgAccessor: `args[${JSON.stringify(argName)}]`,
                zodType: toZodType(parameter.type, parameter.schema),
                descriptionLiteral: parameter.description
                    ? toJsStringLiteral(parameter.description)
                    : "",
            };
        });

        const pathParams = normalizedParams.filter((parameter) => parameter.location === "path");
        const queryParams = normalizedParams.filter((parameter) => parameter.location === "query");
        const headerParams = normalizedParams.filter((parameter) => parameter.location === "header");
        const bodyParams = normalizedParams.filter((parameter) => parameter.location === "body");
        const bodyType = tool.bodySchema?.type;
        const isRawBody =
            bodyParams.length === 1 &&
            (bodyParams[0].apiName === "body" || bodyType === "array" || bodyType === "string" || bodyType === "number" || bodyType === "integer" || bodyType === "boolean");
        const hasQueryAuth = authConfig.type === "apiKey" && authConfig.apiKey?.in === "query";

        return {
            ...tool,
            functionName: toSafeIdentifier(tool.toolName, `tool_${toolIndex + 1}`),
            method,
            path,
            descriptionLiteral: toJsStringLiteral(tool.description),
            hasQueryParams: queryParams.length > 0 || hasQueryAuth,
            hasApiKeyQuery: hasQueryAuth,
            queryApiKeyName: authConfig.apiKey?.name || "api_key",
            hasHeaderParams: headerParams.length > 0,
            hasBodyParams: bodyParams.length > 0,
            isRawBody,
            isObjectBody: bodyParams.length > 0 && !isRawBody,
            rawBodyAccessor: bodyParams[0]?.jsArgAccessor,
            pathParams,
            queryParams,
            headerParams,
            bodyParams: bodyParams.map((parameter) => ({
                apiNameLiteral: JSON.stringify(parameter.apiName),
                jsArgAccessor: parameter.jsArgAccessor,
            })),
            zodParams: normalizedParams.map((parameter) => ({
                propertyKey: JSON.stringify(parameter.argName),
                zodType: parameter.zodType,
                required: parameter.required,
                descriptionLiteral: parameter.descriptionLiteral,
                apiNameLiteral: JSON.stringify(parameter.apiName),
                jsArgAccessor: parameter.jsArgAccessor,
                location: parameter.location,
            })),
        };
    });

    // src/index.ts
    const indexTemplate = `import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
{{#if isStdio}}
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
{{else if isSse}}
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import http from "http";
{{else}}
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import http from "http";
{{/if}}
import { z } from "zod";

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || "{{baseUrl}}";
{{#if hasApiKey}}
const API_KEY = process.env.API_KEY || "";
{{/if}}
{{#if hasBearer}}
const BEARER_TOKEN = process.env.BEARER_TOKEN || "";
{{/if}}
{{#if hasBasic}}
const BASIC_USERNAME = process.env.BASIC_USERNAME || "";
const BASIC_PASSWORD = process.env.BASIC_PASSWORD || "";
{{/if}}

// Create headers with auth
function getHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
{{#if hasApiKey}}
{{#if apiKeyInHeader}}
  headers["{{apiKeyName}}"] = API_KEY;
{{/if}}
{{/if}}
{{#if hasBearer}}
  headers["Authorization"] = \`Bearer \${BEARER_TOKEN}\`;
{{/if}}
{{#if hasBasic}}
  headers["Authorization"] = \`Basic \${Buffer.from(\`\${BASIC_USERNAME}:\${BASIC_PASSWORD}\`).toString("base64")}\`;
{{/if}}
  return { ...headers, ...extraHeaders };
}

// Initialize MCP server
const server = new McpServer({
  name: "{{serverName}}",
  version: "{{serverVersion}}",
});

// Register tools
{{#each tools}}
server.tool(
  "{{toolName}}",
  {{{descriptionLiteral}}},
  {
{{#each zodParams}}
    {{{propertyKey}}}: {{{zodType}}}{{#unless required}}.optional(){{/unless}}{{#if descriptionLiteral}}.describe({{{descriptionLiteral}}}){{/if}},
{{/each}}
  },
  async (args) => {
    try {
      let url = \`\${API_BASE_URL}{{path}}\`;
      {{#each pathParams}}
      url = url.replace("{{curlyOpen}}{{apiName}}{{curlyClose}}", String({{{jsArgAccessor}}}));
      {{/each}}
      {{#if hasQueryParams}}
      const queryParams = new URLSearchParams();
      {{#each queryParams}}
      if ({{{jsArgAccessor}}} !== undefined) queryParams.append({{{apiNameLiteral}}}, String({{{jsArgAccessor}}}));
      {{/each}}
      {{#if hasApiKeyQuery}}
      if (API_KEY) queryParams.append("{{queryApiKeyName}}", API_KEY);
      {{/if}}
      if (queryParams.toString()) url += \`?\${queryParams.toString()}\`;
      {{/if}}
      {{#if hasHeaderParams}}
      const requestHeaders: Record<string, string> = {};
      {{#each headerParams}}
      if ({{{jsArgAccessor}}} !== undefined) requestHeaders[{{{apiNameLiteral}}}] = String({{{jsArgAccessor}}});
      {{/each}}
      {{/if}}
      
      const response = await fetch(url, {
        method: "{{method}}",
        headers: getHeaders({{#if hasHeaderParams}}requestHeaders{{else}}{}{{/if}}),
{{#if hasBodyParams}}
{{#if isRawBody}}
        body: JSON.stringify({{{rawBodyAccessor}}}),
{{/if}}
{{#if isObjectBody}}
        body: JSON.stringify({
{{#each bodyParams}}
          {{{apiNameLiteral}}}: {{{jsArgAccessor}}},
{{/each}}
        }),
{{/if}}
{{/if}}
      });

      if (!response.ok) {
        throw new Error(\`HTTP \${response.status}: \${await response.text()}\`);
      }

      const responseText = await response.text();
      const formatted = (() => {
        if (!responseText) return "OK";
        try {
          return JSON.stringify(JSON.parse(responseText), null, 2);
        } catch {
          return responseText;
        }
      })();

      return {
        content: [{ type: "text", text: formatted }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: \`Error: \${error instanceof Error ? error.message : "Unknown error"}\` }],
        isError: true,
      };
    }
  }
);

{{/each}}
// Start server
async function main() {
{{#if isStdio}}
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("{{serverName}} MCP server running on stdio");
{{else if isSse}}
  const httpServer = http.createServer(async (req, res) => {
    if (req.url === "/sse") {
      const transport = new SSEServerTransport("/messages", res);
      await server.connect(transport);
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  httpServer.listen({{port}}, "{{host}}", () => {
    console.log("{{serverName}} MCP server running on http://{{host}}:{{port}}");
  });
{{else}}
  const httpServer = http.createServer(async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  });
  httpServer.listen({{port}}, "{{host}}", () => {
    console.log("{{serverName}} MCP server running on http://{{host}}:{{port}}");
  });
{{/if}}
}

main().catch(console.error);
`;

    // Helpers registered globally now

    const indexContent = Handlebars.compile(indexTemplate)({
        serverName: serverConfig.name,
        serverVersion: serverConfig.version,
        host: serverConfig.host,
        port: serverConfig.port,
        baseUrl: spec.baseUrl,
        curlyOpen: "{",
        curlyClose: "}",
        isStdio: serverConfig.transport === "stdio",
        isSse: serverConfig.transport === "sse",
        isHttp: serverConfig.transport === "http",
        hasApiKey: authConfig.type === "apiKey",
        hasApiKeyQuery: authConfig.type === "apiKey" && authConfig.apiKey?.in === "query",
        hasBearer: authConfig.type === "bearer",
        hasBasic: authConfig.type === "basic",
        apiKeyName: authConfig.apiKey?.name,
        apiKeyInHeader: authConfig.apiKey?.in === "header",
        tools: toolsData,
    });
    files.set("src/index.ts", indexContent);

    // README.md
    const readme = `# ${serverConfig.name}

An MCP server generated by MakeMCP.

## Installation

\`\`\`bash
${exportConfig.packageManager} install
\`\`\`

## Configuration

Copy \`.env.example\` to \`.env\` and fill in your values:

\`\`\`bash
cp .env.example .env
\`\`\`

## Usage

### Development

\`\`\`bash
${exportConfig.packageManager}${exportConfig.packageManager === "npm" ? " run" : ""} dev
\`\`\`

### Production

\`\`\`bash
${exportConfig.packageManager}${exportConfig.packageManager === "npm" ? " run" : ""} build
${exportConfig.packageManager}${exportConfig.packageManager === "npm" ? " run" : ""} start
\`\`\`

## Available Tools

${tools.map((t) => `- **${t.toolName}**: ${t.description}`).join("\n")}

## Generated by MakeMCP
`;
    files.set("README.md", readme);

    return files;
}

// Generate Python FastMCP server
function generatePythonProject(req: GenerateRequest): Map<string, string> {
    const files = new Map<string, string>();
    const { tools, serverConfig, authConfig, spec } = req;

    // pyproject.toml
    const pyproject = `[project]
name = "${serverConfig.name}"
version = "${serverConfig.version}"
description = "MCP server generated by MakeMCP"
requires-python = ">=3.10"
dependencies = [
    "fastmcp>=0.1.0",
    "httpx>=0.25.0",
    "python-dotenv>=1.0.0",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
`;
    files.set("pyproject.toml", pyproject);

    // .env.example
    let envExample = `# Base URL for the API\nAPI_BASE_URL=${spec.baseUrl || "https://api.example.com"}\n`;
    if (authConfig.type === "apiKey") {
        envExample += `\n# API Key\nAPI_KEY=your_api_key_here\n`;
    } else if (authConfig.type === "bearer") {
        envExample += `\n# Bearer Token\nBEARER_TOKEN=your_token_here\n`;
    } else if (authConfig.type === "basic") {
        envExample += `\n# Basic Auth\nBASIC_USERNAME=your_username\nBASIC_PASSWORD=your_password\n`;
    }
    files.set(".env.example", envExample);

    // Generate tools data with proper param ordering (required first for Python)
    const toolsData = tools.map((tool, toolIndex) => {
        const { method, path } = parseEndpointId(tool.endpointId);
        const allParams = tool.parameters.map((parameter, parameterIndex) => {
            const argName = toSafeIdentifier(
                parameter.name || parameter.originalName,
                `param_${parameterIndex + 1}`
            );
            const apiName = parameter.originalName || parameter.name;
            const location = getParameterLocation(parameter, path, method);

            return {
                ...parameter,
                argName,
                apiName,
                location,
                pythonType: toPythonType(parameter.type),
            };
        });

        // Sort: required first, then optional (Python syntax requirement)
        const sortedParams = [...allParams].sort((a, b) => {
            if (a.required && !b.required) return -1;
            if (!a.required && b.required) return 1;
            return 0;
        });

        const pathParams = allParams.filter((parameter) => parameter.location === "path");
        const queryParams = allParams.filter((parameter) => parameter.location === "query");
        const headerParams = allParams.filter((parameter) => parameter.location === "header");
        const bodyParams = allParams.filter((parameter) => parameter.location === "body");
        const bodyType = tool.bodySchema?.type;
        const isRawBody =
            bodyParams.length === 1 &&
            (bodyParams[0].apiName === "body" || bodyType === "array" || bodyType === "string" || bodyType === "number" || bodyType === "integer" || bodyType === "boolean");
        const hasQueryAuth = authConfig.type === "apiKey" && authConfig.apiKey?.in === "query";

        return {
            ...tool,
            functionName: toSafeIdentifier(tool.toolName, `tool_${toolIndex + 1}`),
            toolNameLiteral: toPythonStringLiteral(tool.toolName),
            descriptionDocstring: tool.description.replace(/"""/g, "'''"),
            method,
            path,
            hasQueryParams: queryParams.length > 0 || hasQueryAuth,
            hasApiKeyQuery: hasQueryAuth,
            queryApiKeyName: authConfig.apiKey?.name || "api_key",
            hasHeaderParams: headerParams.length > 0,
            hasBodyParams: bodyParams.length > 0,
            isRawBody,
            isObjectBody: bodyParams.length > 0 && !isRawBody,
            rawBodyArgName: bodyParams[0]?.argName,
            pythonParams: sortedParams,
            pathParams,
            queryParams,
            headerParams,
            bodyParams: bodyParams.map((parameter) => ({
                apiName: parameter.apiName,
                argName: parameter.argName,
            })),
        };
    });

    // src/server.py
    const serverTemplate = `"""${serverConfig.name} - MCP server generated by MakeMCP"""

import os
import httpx
from dotenv import load_dotenv
from fastmcp import FastMCP

load_dotenv()

# Configuration
API_BASE_URL = os.getenv("API_BASE_URL", "{{baseUrl}}")
{{#if hasApiKey}}
API_KEY = os.getenv("API_KEY", "")
{{/if}}
{{#if hasBearer}}
BEARER_TOKEN = os.getenv("BEARER_TOKEN", "")
{{/if}}
{{#if hasBasic}}
BASIC_USERNAME = os.getenv("BASIC_USERNAME", "")
BASIC_PASSWORD = os.getenv("BASIC_PASSWORD", "")
{{/if}}

# Initialize FastMCP
mcp = FastMCP("{{serverName}}")

# HTTP client
client = httpx.Client(timeout=30.0)


def get_headers(extra_headers: dict | None = None) -> dict:
    """Get request headers with authentication."""
    headers = {"Content-Type": "application/json"}
{{#if hasApiKey}}
{{#if apiKeyInHeader}}
    headers["{{apiKeyName}}"] = API_KEY
{{/if}}
{{/if}}
{{#if hasBearer}}
    headers["Authorization"] = f"Bearer {BEARER_TOKEN}"
{{/if}}
{{#if hasBasic}}
    import base64
    auth = base64.b64encode(f"{BASIC_USERNAME}:{BASIC_PASSWORD}".encode()).decode()
    headers["Authorization"] = f"Basic {auth}"
{{/if}}
    if extra_headers:
        headers.update(extra_headers)
    return headers


{{#each tools}}
@mcp.tool(name={{{toolNameLiteral}}})
def {{functionName}}({{#each pythonParams}}{{argName}}: {{pythonType}}{{#unless required}} | None = None{{/unless}}{{#unless @last}}, {{/unless}}{{/each}}) -> dict:
    """{{{descriptionDocstring}}}"""
    url = f"{API_BASE_URL}{{path}}"
{{#each pathParams}}
    url = url.replace("{{curlyOpen}}{{apiName}}{{curlyClose}}", str({{argName}}))
{{/each}}
{{#if hasQueryParams}}
    params = {}
{{#each queryParams}}
    if {{argName}} is not None:
        params["{{apiName}}"] = {{argName}}
{{/each}}
{{#if hasApiKeyQuery}}
    if API_KEY:
        params["{{queryApiKeyName}}"] = API_KEY
{{/if}}
{{/if}}
{{#if hasHeaderParams}}
    request_headers = {}
{{#each headerParams}}
    if {{argName}} is not None:
        request_headers["{{apiName}}"] = str({{argName}})
{{/each}}
{{/if}}
    
    response = client.request(
        method="{{method}}",
        url=url,
        headers=get_headers({{#if hasHeaderParams}}request_headers{{else}}None{{/if}}),
{{#if hasQueryParams}}
        params=params,
{{/if}}
{{#if hasBodyParams}}
{{#if isRawBody}}
        json={{rawBodyArgName}},
{{/if}}
{{#if isObjectBody}}
        json={
{{#each bodyParams}}
            "{{apiName}}": {{argName}},
{{/each}}
        },
{{/if}}
{{/if}}
    )
    response.raise_for_status()

    if "application/json" in response.headers.get("content-type", ""):
        return response.json()
    return {"text": response.text}


{{/each}}
if __name__ == "__main__":
    mcp.run(transport="{{transport}}"{{#unless isStdio}}, host="{{host}}", port={{port}}{{/unless}})
`;

    const serverContent = Handlebars.compile(serverTemplate)({
        serverName: serverConfig.name,
        host: serverConfig.host,
        port: serverConfig.port,
        baseUrl: spec.baseUrl,
        curlyOpen: "{",
        curlyClose: "}",
        transport: serverConfig.transport,
        isStdio: serverConfig.transport === "stdio",
        hasApiKey: authConfig.type === "apiKey",
        hasApiKeyQuery: authConfig.type === "apiKey" && authConfig.apiKey?.in === "query",
        hasBearer: authConfig.type === "bearer",
        hasBasic: authConfig.type === "basic",
        apiKeyName: authConfig.apiKey?.name,
        apiKeyInHeader: authConfig.apiKey?.in === "header",
        tools: toolsData,
    });
    files.set("src/server.py", serverContent);
    files.set("src/__init__.py", "");

    // README.md
    const readme = `# ${serverConfig.name}

An MCP server generated by MakeMCP using FastMCP.

## Installation

\`\`\`bash
pip install -e .
\`\`\`

Or with uv:

\`\`\`bash
uv sync
\`\`\`

## Configuration

Copy \`.env.example\` to \`.env\` and fill in your values:

\`\`\`bash
cp .env.example .env
\`\`\`

## Usage

\`\`\`bash
python src/server.py
\`\`\`

## Available Tools

${tools.map((t) => `- **${t.toolName}**: ${t.description}`).join("\n")}

## Generated by MakeMCP
`;
    files.set("README.md", readme);

    return files;
}

export async function POST(request: NextRequest) {
    try {
        const body: GenerateRequest = await request.json();
        const isPreview = request.nextUrl.searchParams.get("preview") === "true";

        // Validate request
        if (!body.tools || body.tools.length === 0) {
            return NextResponse.json(
                { error: "No tools selected" },
                { status: 400 }
            );
        }

        // Generate files based on language
        let files: Map<string, string>;
        if (body.exportConfig.language === "node") {
            files = generateNodeProject(body);
        } else {
            files = generatePythonProject(body);
        }

        // If preview mode, return files as JSON
        if (isPreview) {
            const filesArray = Array.from(files.entries()).map(([name, content]) => ({
                name,
                content,
            }));
            return NextResponse.json({ files: filesArray });
        }

        // Create zip archive
        const chunks: Uint8Array[] = [];
        const archive = Archiver("zip", { zlib: { level: 9 } });

        archive.on("data", (chunk) => chunks.push(chunk));

        const archiveFinished = new Promise<void>((resolve, reject) => {
            archive.on("end", resolve);
            archive.on("error", reject);
        });

        // Add files to archive
        for (const [path, content] of files) {
            archive.append(content, { name: `${body.serverConfig.name}/${path}` });
        }

        await archive.finalize();
        await archiveFinished;

        // Return zip file
        const zipBuffer = Buffer.concat(chunks);

        return new NextResponse(zipBuffer, {
            headers: {
                "Content-Type": "application/zip",
                "Content-Disposition": `attachment; filename="${body.serverConfig.name}.zip"`,
            },
        });
    } catch (error) {
        console.error("Generation error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Generation failed" },
            { status: 500 }
        );
    }
}
