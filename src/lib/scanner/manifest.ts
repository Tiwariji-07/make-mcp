import type { ScanTool } from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toolsArray(value: unknown): unknown[] | undefined {
    if (Array.isArray(value)) return value;
    if (!isRecord(value)) return undefined;
    if (Array.isArray(value.tools)) return value.tools;
    if (isRecord(value.result) && Array.isArray(value.result.tools)) return value.result.tools;
    return undefined;
}

export function loadToolsFromManifest(jsonText: string): ScanTool[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonText);
    } catch (error) {
        const detail = error instanceof Error ? `: ${error.message}` : "";
        throw new Error(`Could not parse tools manifest as JSON${detail}`);
    }

    const candidates = toolsArray(parsed);
    if (!candidates) {
        throw new Error(
            "Unrecognized tools manifest shape. Expected a tools array, an object with \"tools\", or a JSON-RPC result with \"result.tools\".",
        );
    }

    return candidates.map((candidate, index) => {
        if (!isRecord(candidate)) {
            throw new Error(
                `Tool at index ${index} must be an object with a non-empty string \"name\".`,
            );
        }
        if (typeof candidate.name !== "string" || candidate.name.trim().length === 0) {
            throw new Error(`Tool at index ${index} must have a non-empty string \"name\".`);
        }

        const tool: ScanTool = { name: candidate.name };
        if (typeof candidate.description === "string") tool.description = candidate.description;
        if (Object.hasOwn(candidate, "inputSchema")) tool.inputSchema = candidate.inputSchema;
        return tool;
    });
}
