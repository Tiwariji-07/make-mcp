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

    return `| Variable | Purpose | Default / Notes |
| --- | --- | --- |
${rows.join("\n")}`;
}

function renderAuthNotes(plan: GenerationPlan): string {
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

${buildSection}${renderRuntimeDependencies(runtime)}## Tools

${plan.tools.map((tool) => `- \`${tool.displayName}\`: ${tool.description}`).join("\n")}

## Auth Notes

${renderAuthNotes(plan)}

## Known Warnings

${renderWarnings(plan)}

## Example MCP Client Config

${getClientConfigNote(plan)}

\`\`\`json
${renderClientConfig(plan, runtime)}
\`\`\`
`;
}
