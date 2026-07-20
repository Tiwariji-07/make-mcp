export interface McpClientConfigInput {
    serverName: string;
    transport: "stdio" | "http" | "sse";
    transportUrl?: string;
    stdioCommand?: string;
    stdioArgs?: string[];
    env?: Record<string, string>;
}

export const ABSOLUTE_PROJECT_PATH_PLACEHOLDER = "/absolute/path/to/generated-project";

export function joinProjectPath(projectDirectory: string, relativePath: string): string {
    const separator = projectDirectory.includes("\\") ? "\\" : "/";
    const root = projectDirectory.replace(/[\\/]+$/, "");
    const child = relativePath.replace(/^[\\/]+/, "").replace(/[\\/]+/g, separator);
    return `${root}${separator}${child}`;
}

export function renderMcpClientConfig(input: McpClientConfigInput): string {
    const server = input.transport === "stdio"
        ? {
            command: input.stdioCommand,
            args: input.stdioArgs || [],
            env: input.env || {},
        }
        : { url: input.transportUrl };

    return JSON.stringify({
        mcpServers: {
            [input.serverName]: server,
        },
    }, null, 2);
}

function quoteShellArgument(value: string): string {
    if (/^[a-zA-Z0-9_./:\\-]+$/.test(value)) return value;
    return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function renderClaudeCodeCommand(input: McpClientConfigInput): string {
    const name = quoteShellArgument(input.serverName);
    if (input.transport === "stdio") {
        const command = [input.stdioCommand || "", ...(input.stdioArgs || [])]
            .filter(Boolean)
            .map(quoteShellArgument)
            .join(" ");
        return `claude mcp add ${name} -- ${command}`;
    }

    const transport = input.transport === "sse" ? "sse" : "http";
    return `claude mcp add --transport ${transport} ${name} ${quoteShellArgument(input.transportUrl || "")}`;
}
