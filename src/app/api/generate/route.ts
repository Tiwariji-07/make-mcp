import { NextRequest, NextResponse } from "next/server";
import Handlebars from "handlebars";
import Archiver from "archiver";
import { Readable } from "stream";

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
    }[];
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
    const [method, ...pathParts] = id.split("-");
    return { method, path: pathParts.join("-") };
}

// Convert type to Zod type
function toZodType(type: string): string {
    const map: Record<string, string> = {
        string: "z.string()",
        integer: "z.number()",
        number: "z.number()",
        boolean: "z.boolean()",
        array: "z.array(z.unknown())",
        object: "z.object({})",
    };
    return map[type.toLowerCase()] || "z.string()";
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
    const toolsData = tools.map((tool) => {
        const { method, path } = parseEndpointId(tool.endpointId);
        const isPathParam = (name: string) => path.includes(`{${name}}`);
        const pathParams = tool.parameters.filter(p => isPathParam(p.name));
        const queryParams = tool.parameters.filter(p => !isPathParam(p.name) && !["POST", "PUT", "PATCH"].includes(method));
        const bodyParams = tool.parameters.filter(p => !isPathParam(p.name) && ["POST", "PUT", "PATCH"].includes(method));

        return {
            ...tool,
            method,
            path,
            hasQueryParams: queryParams.length > 0,
            zodParams: tool.parameters.map((p) => ({
                name: p.name,
                zodType: toZodType(p.type),
                required: p.required,
                description: p.description,
                isPathParam: isPathParam(p.name),
                isQueryParam: queryParams.some(q => q.name === p.name),
            })),
        };
    });

    // src/index.ts
    const indexTemplate = `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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
function getHeaders(): Record<string, string> {
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
  return headers;
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
  "{{description}}",
  {
{{#each zodParams}}
    {{name}}: {{zodType}}{{#unless required}}.optional(){{/unless}}{{#if description}}.describe("{{description}}"){{/if}},
{{/each}}
  },
  async (args) => {
    try {
      let url = \`\${API_BASE_URL}{{path}}\`;
      {{#each zodParams}}
      {{#if isPathParam}}
      url = url.replace("{{curlyOpen}}{{name}}{{curlyClose}}", String(args.{{name}}));
      {{/if}}
      {{/each}}
      {{#if hasQueryParams}}
      const queryParams = new URLSearchParams();
      {{#each zodParams}}
      {{#if isQueryParam}}
      if (args.{{name}} !== undefined) queryParams.append("{{name}}", String(args.{{name}}));
      {{/if}}
      {{/each}}
      if (queryParams.toString()) url += \`?\${queryParams.toString()}\`;
      {{/if}}
      
      const response = await fetch(url, {
        method: "{{method}}",
        headers: getHeaders(),
{{#if (isBodyMethod method)}}
        body: JSON.stringify(args),
{{/if}}
      });
      
      const data = await response.json();
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
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
    const toolsData = tools.map((tool) => {
        const { method, path } = parseEndpointId(tool.endpointId);
        const isPathParam = (name: string) => path.includes(`{${name}}`);
        const isBodyMethod = ["POST", "PUT", "PATCH"].includes(method);

        // Categorize params
        const allParams = tool.parameters.map((p) => ({
            name: p.name,
            pythonType: toPythonType(p.type),
            required: p.required,
            description: p.description,
            isPathParam: isPathParam(p.name),
            isQueryParam: !isPathParam(p.name) && !isBodyMethod,
            isBodyParam: !isPathParam(p.name) && isBodyMethod,
        }));

        // Sort: required first, then optional (Python syntax requirement)
        const sortedParams = [...allParams].sort((a, b) => {
            if (a.required && !b.required) return -1;
            if (!a.required && b.required) return 1;
            return 0;
        });

        const queryParams = allParams.filter(p => p.isQueryParam);
        const bodyParams = allParams.filter(p => p.isBodyParam);

        return {
            ...tool,
            method,
            path,
            hasQueryParams: queryParams.length > 0,
            hasBodyParams: bodyParams.length > 0,
            pythonParams: sortedParams,
            queryParams,
            bodyParams,
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
client = httpx.Client()


def get_headers() -> dict:
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
    return headers


{{#each tools}}
@mcp.tool()
def {{toolName}}({{#each pythonParams}}{{name}}: {{pythonType}}{{#unless required}} = None{{/unless}}{{#unless @last}}, {{/unless}}{{/each}}) -> dict:
    """{{description}}"""
    url = f"{API_BASE_URL}{{path}}"
{{#each pythonParams}}
{{#if isPathParam}}
    url = url.replace("{{curlyOpen}}{{name}}{{curlyClose}}", str({{name}}))
{{/if}}
{{/each}}
{{#if hasQueryParams}}
    params = {}
{{#each queryParams}}
    if {{name}} is not None:
        params["{{name}}"] = {{name}}
{{/each}}
{{/if}}
    
    response = client.request(
        method="{{method}}",
        url=url,
        headers=get_headers(),
{{#if hasQueryParams}}
        params=params,
{{/if}}
{{#if hasBodyParams}}
        json={
{{#each bodyParams}}
            "{{name}}": {{name}},
{{/each}}
        },
{{/if}}
    )
    return response.json()


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


// Register Handlebars helpers
function registerHelpers() {
    Handlebars.registerHelper("isPathParam", (path: string, paramName: string) => {
        return path.includes(`{${paramName}}`);
    });

    Handlebars.registerHelper("isBodyMethod", (method: string) => {
        return ["POST", "PUT", "PATCH"].includes(method);
    });
}

export async function POST(request: NextRequest) {
    try {
        const body: GenerateRequest = await request.json();

        // Validate request
        if (!body.tools || body.tools.length === 0) {
            return NextResponse.json(
                { error: "No tools selected" },
                { status: 400 }
            );
        }

        // Register helpers
        registerHelpers();

        // Generate files based on language
        let files: Map<string, string>;
        if (body.exportConfig.language === "node") {
            files = generateNodeProject(body);
        } else {
            files = generatePythonProject(body);
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
