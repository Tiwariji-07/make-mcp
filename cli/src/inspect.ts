// `mcpmint inspect <spec>` — summarize a spec without generating: endpoint
// count, per-method breakdown, detected upstream auth, and the token-budget
// estimate (mcpmint's context-cost differentiator) for both full and compact
// mode.

import type { ParsedSpec } from "../../src/lib/api-model/parsed-spec.ts";
import {
    estimateToolDefinitionTokens,
    estimateCompactModeTokens,
    formatTokens,
    type EstimatableTool,
} from "../../src/lib/token-estimate.ts";

const BAND_LABEL: Record<string, string> = {
    green: "lean",
    amber: "getting heavy",
    red: "heavy — consider compact mode or fewer tools",
};

function detectAuth(spec: ParsedSpec): string {
    const kinds = new Set<string>();
    for (const scheme of Object.values(spec.securitySchemes)) {
        const c = scheme as { type?: string; scheme?: string };
        if (c.type === "apiKey") kinds.add("API key");
        else if (c.type === "http" && c.scheme === "bearer") kinds.add("Bearer");
        else if (c.type === "http" && c.scheme === "basic") kinds.add("Basic");
        else if (c.type) kinds.add(c.type);
    }
    return kinds.size > 0 ? [...kinds].join(", ") : "none detected";
}

export function inspectSpec(spec: ParsedSpec): string {
    const lines: string[] = [];
    const title = spec.info.title || "(untitled)";

    lines.push(`${title}  v${spec.info.version || "?"}  (${spec.format || "openapi"})`);
    if (spec.baseUrl) lines.push(`Base URL: ${spec.baseUrl}`);
    lines.push(`Endpoints: ${spec.endpoints.length}`);

    const byMethod = new Map<string, number>();
    for (const endpoint of spec.endpoints) {
        byMethod.set(endpoint.method, (byMethod.get(endpoint.method) || 0) + 1);
    }
    const methodSummary = [...byMethod.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([method, count]) => `${method} ${count}`)
        .join("  ");
    if (methodSummary) lines.push(`  ${methodSummary}`);

    lines.push(`Upstream auth: ${detectAuth(spec)}`);

    const tools: EstimatableTool[] = spec.endpoints.map((endpoint) => ({
        enabled: true,
        toolName: endpoint.operationId || `${endpoint.method} ${endpoint.path}`,
        description: endpoint.summary || endpoint.description || "",
        parameters: endpoint.parameters.map((parameter) => ({
            name: parameter.name,
            type: parameter.type,
            required: parameter.required,
            description: parameter.description,
            location: parameter.in,
        })),
        bodySchema: endpoint.requestBody?.schema,
    }));

    const full = estimateToolDefinitionTokens(tools);
    const compact = estimateCompactModeTokens(spec.endpoints.length);

    lines.push("");
    lines.push("Context budget (estimated tool-definition tokens):");
    lines.push(`  All tools:    ~${formatTokens(full.totalTokens)} tokens  [${full.band}: ${BAND_LABEL[full.band]}]`);
    lines.push(`  Compact mode: ~${formatTokens(compact.totalTokens)} tokens  [${compact.band}] — 3 meta-tools, endpoints discovered on demand`);

    if (full.perTool.length > 0) {
        const heaviest = full.perTool.slice(0, 5);
        lines.push("");
        lines.push("Heaviest tools:");
        for (const tool of heaviest) {
            lines.push(`  ~${formatTokens(tool.tokens)}  ${tool.toolName}`);
        }
    }

    return lines.join("\n");
}
