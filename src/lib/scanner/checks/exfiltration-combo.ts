import type { Finding, ScanTool } from "../types.ts";

const SENSITIVE = /\b(?:secret|credential|password|token|private[_ -]?key|seed[_ -]?phrase|mnemonic|environment|clipboard|file|database|customer|user[_ -]?data)\b/i;
const SINK = /\b(?:send|upload|forward|post|webhook|email|publish|export|external|remote|url|endpoint)\b/i;
const SOURCE = /\b(?:read|get|list|fetch|search|download|load)\b/i;

function schemaText(schema: unknown): string {
    try {
        return JSON.stringify(schema) || "";
    } catch {
        return "";
    }
}

function context(tool: ScanTool): string {
    return `${tool.name} ${tool.description || ""} ${tool.path || ""} ${schemaText(tool.inputSchema)}`;
}

export function checkExfiltrationCombinations(tools: ScanTool[]): Finding[] {
    const findings: Finding[] = [];
    const sourceTools = tools.filter((tool) => SOURCE.test(context(tool)) && SENSITIVE.test(context(tool)));
    const sinkTools = tools.filter((tool) => SINK.test(context(tool)));

    for (const tool of tools) {
        const text = context(tool);
        if (!SENSITIVE.test(text) || !SINK.test(text)) continue;
        findings.push({
            check: "EXFIL_COMBO",
            severity: "red",
            toolName: tool.name,
            message: `sensitive-data and external-destination capability combined in "${tool.name}"`,
            explanation: "A single model-callable tool can receive or access sensitive material and transmit it to an external destination.",
            remediation: "Separate data access from transmission, remove model-controlled destinations, redact sensitive fields, and require a user confirmation boundary before sending.",
            evidence: "sensitive data vocabulary + transmission vocabulary",
        });
    }

    if (sourceTools.length > 0 && sinkTools.length > 0) {
        const sourceNames = sourceTools.map((tool) => tool.name);
        const sinkNames = sinkTools.map((tool) => tool.name);
        const distinct = sourceNames.some((name) => !sinkNames.includes(name));
        if (distinct) {
            findings.push({
                check: "EXFIL_COMBO",
                severity: "yellow",
                relatedToolNames: [...new Set([...sourceNames, ...sinkNames])],
                message: "tool set combines sensitive-data access with an external transmission path",
                explanation: "An agent could chain one tool that reads sensitive data with another tool that sends data outside the system.",
                remediation: "Disable unnecessary source or sink tools, apply least privilege, and require approval between sensitive reads and outbound writes.",
                evidence: `sources: ${sourceNames.join(", ")}; sinks: ${sinkNames.join(", ")}`,
            });
        }
    }

    return findings;
}
