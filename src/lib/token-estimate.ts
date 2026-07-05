/**
 * Context-budget estimation for MCP tool definitions.
 *
 * When an MCP server is connected to an LLM, the definitions of every tool it
 * exposes (name + description + input JSON schema) are injected into the
 * model's context window on every request, before any real work happens. A
 * spec with hundreds of endpoints can produce tens of thousands of tokens of
 * tool definitions that permanently occupy the window and degrade agent
 * accuracy. This module gives a live, client-side estimate of that cost so the
 * user can curate their selection down.
 *
 * IMPORTANT: this is a HEURISTIC estimate, not an exact token count. We do not
 * run a real tokenizer (that would require a large dependency and per-model
 * vocabularies). Instead we serialize each tool definition the way it would be
 * sent to the model and apply the common rule-of-thumb of ~1 token per 4
 * characters of JSON. Real counts vary by model and content, but this is more
 * than accurate enough to guide "do I have too many tools?" decisions.
 */

/** Rough characters-per-token ratio used across the estimate. */
export const CHARS_PER_TOKEN = 4;

/**
 * Threshold bands for the context-budget meter, in estimated tokens.
 *   - GREEN:  < 10K   healthy, plenty of headroom
 *   - AMBER:  10K-25K  getting heavy, consider trimming
 *   - RED:    > 25K   bloated, tool definitions dominate the context window
 */
export const TOKEN_THRESHOLDS = {
    green: 10_000,
    amber: 25_000,
} as const;

export type BudgetBand = "green" | "amber" | "red";

/**
 * Minimal shape this estimator needs from a tool config. Kept structurally
 * compatible with the store's `ToolConfig` (name/description/parameters/schema)
 * without importing it, so the util stays pure and dependency-free.
 */
export interface EstimatableTool {
    enabled: boolean;
    toolName: string;
    description: string;
    parameters?: Array<{
        name: string;
        type?: string;
        required?: boolean;
        description?: string;
        location?: string;
        schema?: Record<string, unknown>;
        hidden?: boolean;
    }>;
    bodySchema?: Record<string, unknown>;
}

export interface ToolTokenBreakdown {
    toolName: string;
    tokens: number;
    /** Characters of serialized tool-definition JSON (pre-division). */
    chars: number;
}

export interface TokenEstimate {
    /** Total estimated tokens across all enabled tools' definitions. */
    totalTokens: number;
    /** Number of enabled tools included in the estimate. */
    enabledCount: number;
    /** Per-tool breakdown, largest first, for enabled tools only. */
    perTool: ToolTokenBreakdown[];
    /** Threshold band the total falls into. */
    band: BudgetBand;
}

/** Map a token total to its threshold band. */
export function bandForTokens(totalTokens: number): BudgetBand {
    if (totalTokens < TOKEN_THRESHOLDS.green) return "green";
    if (totalTokens <= TOKEN_THRESHOLDS.amber) return "amber";
    return "red";
}

/** ~1 token per 4 characters, rounded up so anything non-empty costs >= 1. */
function charsToTokens(chars: number): number {
    return Math.ceil(chars / CHARS_PER_TOKEN);
}

/**
 * Build the object that approximates the JSON-Schema tool definition sent to
 * the model: name, description, and an input schema derived from the tool's
 * visible parameters. Hidden params are excluded because they are not exposed
 * to the LLM. This mirrors the definition surface without depending on the
 * generator's exact serialization.
 */
function serializeToolDefinition(tool: EstimatableTool): string {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const param of tool.parameters ?? []) {
        if (param.hidden) continue;
        // Prefer the resolved schema when present (nested objects / bodies),
        // otherwise fall back to a simple typed property.
        properties[param.name] = param.schema ?? {
            type: param.type || "string",
            ...(param.description ? { description: param.description } : {}),
        };
        if (param.required) required.push(param.name);
    }

    const definition = {
        name: tool.toolName,
        description: tool.description,
        inputSchema: {
            type: "object",
            properties,
            ...(required.length > 0 ? { required } : {}),
        },
    };

    return JSON.stringify(definition);
}

/**
 * Estimate the token cost of the MCP tool DEFINITIONS for the given tools.
 * Only ENABLED tools are counted, since only those are exposed to the model.
 */
export function estimateToolDefinitionTokens(tools: EstimatableTool[]): TokenEstimate {
    const perTool: ToolTokenBreakdown[] = [];
    let totalTokens = 0;

    for (const tool of tools) {
        if (!tool.enabled) continue;
        const serialized = serializeToolDefinition(tool);
        const chars = serialized.length;
        const tokens = charsToTokens(chars);
        totalTokens += tokens;
        perTool.push({ toolName: tool.toolName, tokens, chars });
    }

    perTool.sort((a, b) => b.tokens - a.tokens);

    return {
        totalTokens,
        enabledCount: perTool.length,
        perTool,
        band: bandForTokens(totalTokens),
    };
}

/**
 * Fixed token cost of the three meta-tool definitions the generator emits in
 * COMPACT MODE (list_api_endpoints / get_api_endpoint_schema /
 * invoke_api_endpoint). Instead of one tool per operation, the model only ever
 * sees these three, so the context cost is constant regardless of how many
 * endpoints the API has. We approximate their definitions the same way as any
 * other tool (name + description + input schema serialized to JSON, ~1 token /
 * 4 chars) so the meter stays consistent across modes.
 */
const COMPACT_META_TOOLS: EstimatableTool[] = [
    {
        enabled: true,
        toolName: "list_api_endpoints",
        description:
            "List the available API endpoints this server can call, optionally filtered by a search query. Returns each endpoint's id, method, path, and a short summary so you can discover what is available before fetching its full schema.",
        parameters: [
            {
                name: "query",
                type: "string",
                required: false,
                description: "Optional case-insensitive filter matched against endpoint path, summary, and tags.",
            },
        ],
    },
    {
        enabled: true,
        toolName: "get_api_endpoint_schema",
        description:
            "Get the full input schema for a single API endpoint by its id: its parameters, request body schema, required fields, and descriptions. Call this after list_api_endpoints to learn exactly what invoke_api_endpoint expects.",
        parameters: [
            {
                name: "endpoint_id",
                type: "string",
                required: true,
                description: "The id of the endpoint, as returned by list_api_endpoints.",
            },
        ],
    },
    {
        enabled: true,
        toolName: "invoke_api_endpoint",
        description:
            "Invoke a single API endpoint by its id, passing the arguments described by its schema. Use get_api_endpoint_schema first to learn the required parameters and body shape, then call this with matching arguments.",
        parameters: [
            {
                name: "endpoint_id",
                type: "string",
                required: true,
                description: "The id of the endpoint to invoke, as returned by list_api_endpoints.",
            },
            {
                name: "arguments",
                type: "object",
                required: false,
                description: "An object of arguments matching the endpoint's schema (path/query/header params and request body).",
            },
        ],
    },
];

/**
 * Estimate the token cost of COMPACT MODE: the three fixed meta-tool
 * definitions. Independent of how many endpoints are enabled, since the model
 * only ever sees the three meta-tools. `enabledCount` reflects the number of
 * endpoints the meta-tools can reach (informational only).
 */
export function estimateCompactModeTokens(reachableEndpointCount: number): TokenEstimate {
    const perTool: ToolTokenBreakdown[] = [];
    let totalTokens = 0;

    for (const tool of COMPACT_META_TOOLS) {
        const serialized = serializeToolDefinition(tool);
        const chars = serialized.length;
        const tokens = charsToTokens(chars);
        totalTokens += tokens;
        perTool.push({ toolName: tool.toolName, tokens, chars });
    }

    perTool.sort((a, b) => b.tokens - a.tokens);

    return {
        totalTokens,
        enabledCount: reachableEndpointCount,
        perTool,
        band: bandForTokens(totalTokens),
    };
}

/** Compact human-readable token count, e.g. 42350 -> "42.4K". */
export function formatTokens(tokens: number): string {
    if (tokens < 1000) return String(tokens);
    return `${(tokens / 1000).toFixed(1)}K`;
}
