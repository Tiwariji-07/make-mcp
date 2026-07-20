import type { ApiModel } from "@/lib/api-model";
import type { ToolConfig } from "@/store/project-store";
import type { ScanTool } from "./types.ts";

function typeSchema(type: string): Record<string, unknown> {
    if (type.endsWith("[]")) return { type: "array", items: typeSchema(type.slice(0, -2)) };
    if (type === "integer" || type === "number" || type === "boolean" || type === "object") {
        return { type };
    }
    return { type: "string" };
}

export function projectToolsToScanTools(apiModel: ApiModel | undefined, tools: ToolConfig[]): ScanTool[] {
    const operations = new Map(apiModel?.operations.map((operation) => [operation.id, operation]) || []);
    return tools.map((tool) => {
        const operation = operations.get(tool.endpointId);
        const method = operation?.method || tool.endpointId.split("-", 1)[0];
        const normalizedMethod = method?.toUpperCase();
        const properties = Object.fromEntries(tool.parameters
            .filter((parameter) => !parameter.hidden)
            .map((parameter) => [parameter.name, {
                ...(parameter.schema || typeSchema(parameter.type)),
                description: parameter.description || undefined,
            }]));
        const required = tool.parameters
            .filter((parameter) => parameter.required && !parameter.hidden)
            .map((parameter) => parameter.name);

        return {
            name: tool.toolName,
            description: tool.description,
            inputSchema: {
                type: "object",
                properties,
                ...(required.length > 0 ? { required } : {}),
            },
            method: normalizedMethod,
            path: operation?.path,
            tags: operation?.tags,
            annotations: {
                readOnlyHint: normalizedMethod === "GET" || normalizedMethod === "HEAD",
                destructiveHint: normalizedMethod === "DELETE",
                idempotentHint: ["GET", "HEAD", "PUT", "DELETE"].includes(normalizedMethod || ""),
                openWorldHint: true,
            },
        };
    });
}
