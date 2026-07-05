import type { GenerationPlan } from "./types.ts";
import { collectAuthSchemes } from "./strategies/auth.ts";

export interface ReadmeRuntimeDetails {
    installCommand: string;
    runCommand: string;
    buildCommands?: string[];
    stdioClientCommand: string;
    stdioClientArgs: string[];
    runtimeDependencies?: Array<{
        name: string;
        version: string;
    }>;
}

function getTransportName(plan: GenerationPlan): string {
    if (plan.runtime.transport === "http") return "Streamable HTTP";
    if (plan.runtime.transport === "stdio") return "stdio";
    return "SSE";
}

function getTransportUrl(plan: GenerationPlan): string {
    if (plan.runtime.transport === "stdio") return "";
    if (plan.runtime.transport === "sse") return `http://${plan.server.host}:${plan.server.port}/sse`;
    return `http://${plan.server.host}:${plan.server.port}`;
}

function renderEnvVars(plan: GenerationPlan): string {
    const authSchemes = collectAuthSchemes(plan);
    const rows = [
        `| \`API_BASE_URL\` | Base URL for upstream API requests. | \`${plan.spec.baseUrl || "https://api.example.com"}\` |`,
    ];

    for (const auth of authSchemes) {
        const scheme = auth.scheme;
        const location = scheme.apiKeyLocation || "header";
        const name = scheme.apiKeyName || "X-API-Key";

        if (auth.apiKeyEnvVar) {
            rows.push(`| \`${auth.apiKeyEnvVar}\` | API key for \`${name}\` ${location} authentication. | Required when this auth scheme is used. |`);
        }
        if (auth.bearerTokenEnvVar) {
            rows.push(`| \`${auth.bearerTokenEnvVar}\` | Bearer token for authenticated requests. | Required when this auth scheme is used. |`);
        }
        if (auth.basicUsernameEnvVar) {
            rows.push(`| \`${auth.basicUsernameEnvVar}\` | Basic auth username. | Required when basic auth is used. |`);
        }
        if (auth.basicPasswordEnvVar) {
            rows.push(`| \`${auth.basicPasswordEnvVar}\` | Basic auth password. | Required when basic auth is used. |`);
        }
    }

    if (plan.runtime.transport !== "stdio") {
        const tokenNotes = plan.mcpServerAuth.type === "bearer"
            ? "Required; set to a long random value."
            : "Ignored unless bearer auth is selected.";
        const originNotes = plan.mcpServerAuth.allowedOrigins.length > 0
            ? `\`${plan.mcpServerAuth.allowedOrigins.join(",")}\``
            : "Optional; unset allows only localhost origins (deny-by-default).";
        rows.push(`| \`${plan.mcpServerAuth.tokenEnvVar}\` | Bearer token for MCP server access over HTTP/SSE. This protects MCP server access, not upstream API calls. | ${tokenNotes} |`);
        rows.push(`| \`${plan.mcpServerAuth.allowedOriginsEnvVar}\` | Comma-separated origins allowed to call this MCP server. Generated Node also answers CORS preflight requests for allowed origins. | ${originNotes} |`);
    }

    return `| Variable | Purpose | Default / Notes |
| --- | --- | --- |
${rows.join("\n")}`;
}

function renderUpstreamAuthNotes(plan: GenerationPlan): string {
    const authSchemes = collectAuthSchemes(plan);

    if (authSchemes.length === 0) {
        return "No auth schemes were generated for this server.";
    }

    return authSchemes.map((auth) => {
        const scheme = auth.scheme;

        if (scheme.strategy === "apiKeyHeader" || scheme.strategy === "apiKeyQuery" || scheme.strategy === "apiKeyCookie") {
            return `- \`${scheme.schemeName}\`: sends \`${scheme.apiKeyName || "X-API-Key"}\` via ${scheme.apiKeyLocation || "header"} from \`${auth.apiKeyEnvVar}\`.`;
        }

        if (scheme.strategy === "bearer") {
            return `- \`${scheme.schemeName}\`: sends an Authorization bearer token from \`${auth.bearerTokenEnvVar}\`.`;
        }

        return `- \`${scheme.schemeName}\`: sends HTTP Basic credentials from \`${auth.basicUsernameEnvVar}\` and \`${auth.basicPasswordEnvVar}\`.`;
    }).join("\n");
}

function renderMcpServerAccessNotes(plan: GenerationPlan): string {
    if (plan.runtime.transport === "stdio") {
        return "MCP server access auth is not applicable to stdio because the client communicates over local process stdin/stdout streams.";
    }

    const notes = [
        "MCP server access auth protects the generated MCP endpoint itself. It is separate from upstream API auth, which is used only when tools call the upstream API.",
    ];

    if (plan.runtime.language === "python") {
        notes.push("Generated Python FastMCP output enforces MCP server access in `src/access.py`, an ASGI middleware installed on the FastMCP HTTP app. It validates the `Origin` header (deny-by-default: only localhost origins are accepted when no allow-list is set) and, when bearer auth is enabled, requires `Authorization: Bearer <token>` using a constant-time comparison.");
        if (plan.mcpServerAuth.type === "bearer") {
            notes.push("Set `MCP_AUTH_TOKEN`; HTTP/SSE requests must include `Authorization: Bearer <token>`. The server refuses to start when bearer auth is enabled but the token is unset.");
        } else {
            notes.push("Bearer auth is disabled. Select bearer auth during generation before relying on `MCP_AUTH_TOKEN`.");
        }
    } else if (plan.mcpServerAuth.type === "bearer") {
        notes.push("Set `MCP_AUTH_TOKEN`; HTTP/SSE requests must include `Authorization: Bearer <token>`.");
    } else {
        notes.push("Bearer auth is disabled. Select bearer auth during generation before relying on `MCP_AUTH_TOKEN`.");
    }

    if (plan.mcpServerAuth.allowedOrigins.length > 0) {
        notes.push(`Requests with an \`Origin\` header must match one of: ${plan.mcpServerAuth.allowedOrigins.map((origin) => `\`${origin}\``).join(", ")}. Override with \`MCP_ALLOWED_ORIGINS\`.`);
    } else {
        notes.push("No allowed-origin list is configured. Set `MCP_ALLOWED_ORIGINS` to restrict browser-origin requests.");
    }

    if (plan.server.host === "0.0.0.0") {
        notes.push("This server is configured to bind `0.0.0.0`. Do not expose HTTP/SSE publicly without MCP server access auth and TLS termination.");
    } else {
        notes.push("For local-only HTTP/SSE development, prefer binding to `localhost` or `127.0.0.1`.");
    }

    return notes.map((note) => `- ${note}`).join("\n");
}

function renderWarnings(plan: GenerationPlan): string {
    if (plan.warnings.length === 0) {
        return "- None.";
    }

    return plan.warnings.map((warning) => `- ${warning}`).join("\n");
}

function getClientConfigEnv(plan: GenerationPlan): Record<string, string> {
    const env: Record<string, string> = {
        API_BASE_URL: plan.spec.baseUrl || "https://api.example.com",
    };

    for (const auth of collectAuthSchemes(plan)) {
        if (auth.apiKeyEnvVar) env[auth.apiKeyEnvVar] = "your_api_key_here";
        if (auth.bearerTokenEnvVar) env[auth.bearerTokenEnvVar] = "your_token_here";
        if (auth.basicUsernameEnvVar) env[auth.basicUsernameEnvVar] = "your_username";
        if (auth.basicPasswordEnvVar) env[auth.basicPasswordEnvVar] = "your_password";
    }

    return env;
}

function renderClientConfig(plan: GenerationPlan, runtime: ReadmeRuntimeDetails): string {
    const serverKey = plan.server.name;

    if (plan.runtime.transport === "stdio") {
        return JSON.stringify({
            mcpServers: {
                [serverKey]: {
                    command: runtime.stdioClientCommand,
                    args: runtime.stdioClientArgs,
                    env: getClientConfigEnv(plan),
                },
            },
        }, null, 2);
    }

    return JSON.stringify({
        mcpServers: {
            [serverKey]: {
                url: getTransportUrl(plan),
            },
        },
    }, null, 2);
}

function getClientConfigNote(plan: GenerationPlan): string {
    if (plan.runtime.transport === "stdio") {
        return "Client configuration formats vary by MCP client. Use this as a starting point:";
    }

    return "Client configuration formats vary by MCP client. Use this as a starting point, and configure `.env` on the server process where this MCP server runs:";
}

// Deploy section for the generated server, gated by language. Node ships one-click
// deploy buttons; Python (FastMCP) ships FastMCP Cloud + Docker instructions. Owners
// replace OWNER/REPO (and the Railway template id) with their own before publishing.
function renderDeploySection(plan: GenerationPlan): string {
    if (plan.runtime.language === "python") {
        return `## Deploy

Replace \`OWNER/REPO\` with your published repository before deploying.

### FastMCP Cloud

The fastest path for FastMCP servers. Push this project to GitHub, then create a project at [fastmcp.cloud](https://fastmcp.cloud) pointed at your repository. FastMCP Cloud detects the \`mcp\` object in \`src/server.py\`, installs \`pyproject.toml\`, and hosts a remote Streamable HTTP endpoint. Set the environment variables from the table above in the project settings.

### Docker

The generated \`Dockerfile\` builds a self-contained image (stdio by default, Streamable HTTP via \`MCP_TRANSPORT=http\`).

\`\`\`bash
docker build -t ${plan.server.name} .
# stdio (keep stdin open, no TTY):
docker run -i --rm --env-file .env ${plan.server.name}
# Streamable HTTP:
docker run -p ${plan.server.port}:${plan.server.port} -e MCP_TRANSPORT=http --env-file .env ${plan.server.name}
\`\`\`

> Cloudflare Workers one-click deploy is Node-only and is not offered for the Python target.

`;
    }

    return `## Deploy

Replace \`OWNER/REPO\` (and the Railway template id) with your published repository before using these buttons.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/OWNER/REPO)
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/OWNER/REPO)
[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template/YOUR_TEMPLATE_ID?utm_medium=integration&utm_source=button&utm_campaign=generic)

`;
}

function renderRuntimeDependencies(runtime: ReadmeRuntimeDetails): string {
    if (!runtime.runtimeDependencies?.length) return "";

    const rows = runtime.runtimeDependencies
        .map((dependency) => `| \`${dependency.name}\` | \`${dependency.version}\` | Exact version emitted by this generator. |`)
        .join("\n");

    return `## Tested Runtime Versions

| Package | Tested version | Notes |
| --- | --- | --- |
${rows}

`;
}

export function renderGeneratedReadme(plan: GenerationPlan, runtime: ReadmeRuntimeDetails): string {
    const transportName = getTransportName(plan);
    const transportUrl = getTransportUrl(plan);
    const buildSection = runtime.buildCommands?.length
        ? `## Build

\`\`\`bash
${runtime.buildCommands.join("\n")}
\`\`\`

`
        : "";
    const runContext = plan.runtime.transport === "stdio"
        ? "The selected transport is stdio, so the server communicates over the process stdin/stdout streams."
        : `The selected transport is ${transportName}. Start the server and connect clients to \`${transportUrl}\`.`;

    return `# ${plan.server.name}

Generated by MakeMCP ${plan.generatorVersion}.

## Install

\`\`\`bash
${runtime.installCommand}
\`\`\`

## Configure

Copy \`.env.example\` to \`.env\` and provide the required values.

\`\`\`bash
cp .env.example .env
\`\`\`

## Environment Variables

${renderEnvVars(plan)}

## Run With Selected Transport

${runContext}

\`\`\`bash
${runtime.runCommand}
\`\`\`

## Transport

This server is configured for ${transportName}.

- \`stdio\`: best for local MCP clients.
- \`http\`: Streamable HTTP, recommended for remote or server deployments.
- \`sse\`: legacy option for older clients.

${buildSection}${renderDeploySection(plan)}${renderRuntimeDependencies(runtime)}## Tools

${plan.tools.map((tool) => `- \`${tool.displayName}\`: ${tool.description}`).join("\n")}

## Upstream API Auth

${renderUpstreamAuthNotes(plan)}

## MCP Server Access

${renderMcpServerAccessNotes(plan)}

## HTTP Transport Security

For HTTP/SSE deployments, terminate TLS before traffic reaches this server and avoid binding to a public interface unless bearer auth or an authenticated gateway is in place.

## Known Warnings

${renderWarnings(plan)}

## Example MCP Client Config

${getClientConfigNote(plan)}

\`\`\`json
${renderClientConfig(plan, runtime)}
\`\`\`
`;
}
