import type { Finding, ScanTool } from "../types.ts";

const SECRET_PARAMETER = /^(?:api_key|apikey|access_token|auth_token|token|secret|password|passwd|credentials?|private_key|seed_phrase|mnemonic|ssn|credit_card|card_number|wallet)$/;
const AUTH_VOCABULARY =
    /\b(?:auth|authentication|authorization|authenticate|login|credentials?|tokens?|vault|secrets?)\b|\bkey\s+management\b/i;

interface ParameterLocation {
    name: string;
    path: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeParameterName(name: string): string {
    return name
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .replace(/[\s-]+/g, "_")
        .toLowerCase();
}

function secretParameters(schema: unknown): ParameterLocation[] {
    const matches: ParameterLocation[] = [];

    function visit(value: unknown, path: string[]): void {
        if (!isRecord(value) || !isRecord(value.properties)) return;
        for (const [name, propertySchema] of Object.entries(value.properties)) {
            const propertyPath = [...path, name];
            if (SECRET_PARAMETER.test(normalizeParameterName(name))) {
                matches.push({ name, path: propertyPath.join(".") });
            }
            if (isRecord(propertySchema)) {
                visit(propertySchema, propertyPath);
                if (isRecord(propertySchema.items)) visit(propertySchema.items, propertyPath);
            }
        }
    }

    visit(schema, []);
    return matches;
}

function isAuthenticationTool(tool: ScanTool): boolean {
    const context = `${tool.name.replace(/[_-]+/g, " ")} ${tool.description || ""}`;
    return AUTH_VOCABULARY.test(context);
}

export function checkSuspiciousParams(tools: ScanTool[]): Finding[] {
    const findings: Finding[] = [];
    for (const tool of tools) {
        const authRelated = isAuthenticationTool(tool);
        for (const parameter of secretParameters(tool.inputSchema)) {
            const pathDetail = parameter.path === parameter.name ? "" : ` at "${parameter.path}"`;
            findings.push({
                check: "SUSPICIOUS_PARAMS",
                severity: authRelated ? "yellow" : "red",
                toolName: tool.name,
                message:
                    `suspicious parameter "${parameter.name}"${pathDetail} in tool "${tool.name}"` +
                    (authRelated
                        ? " should be reviewed in its authentication context"
                        : " is not explained by an authentication-related purpose"),
            });
        }
    }
    return findings;
}
