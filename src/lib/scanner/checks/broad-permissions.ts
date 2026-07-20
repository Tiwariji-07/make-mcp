import type { Finding, ScanTool } from "../types.ts";

const DESTRUCTIVE_METHODS = new Set(["DELETE", "PATCH", "PUT"]);
const PRIVILEGED_TOOL = /\b(?:admin|root|sudo|shell|terminal|execute|exec|purge|delete_all|drop|filesystem|write_file)\b/i;
const BROAD_PARAMETER = /^(?:command|shell|script|path|file_path|url|endpoint|scope|permissions?)$/i;
const BROAD_VALUE = /^(?:\*|all|admin|root|full_access)$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectBroadParameters(schema: unknown): Array<{ path: string; evidence: string }> {
    const results: Array<{ path: string; evidence: string }> = [];
    function visit(value: unknown, path: string[]): void {
        if (!isRecord(value) || !isRecord(value.properties)) return;
        for (const [name, property] of Object.entries(value.properties)) {
            const nextPath = [...path, name];
            if (BROAD_PARAMETER.test(name)) {
                results.push({ path: nextPath.join("."), evidence: `unconstrained parameter "${name}"` });
            }
            if (isRecord(property)) {
                const values = Array.isArray(property.enum) ? property.enum : [];
                if (values.some((item) => typeof item === "string" && BROAD_VALUE.test(item))) {
                    results.push({ path: nextPath.join("."), evidence: `broad enum value in "${name}"` });
                }
                visit(property, nextPath);
                if (isRecord(property.items)) visit(property.items, nextPath);
            }
        }
    }
    visit(schema, []);
    return results;
}

export function checkBroadPermissions(tools: ScanTool[]): Finding[] {
    const findings: Finding[] = [];
    for (const tool of tools) {
        const method = tool.method?.toUpperCase();
        const privileged = PRIVILEGED_TOOL.test(`${tool.name.replace(/[_-]+/g, " ")} ${tool.description || ""}`);
        const destructive = tool.annotations?.destructiveHint || Boolean(method && DESTRUCTIVE_METHODS.has(method));
        const openWorld = tool.annotations?.openWorldHint;

        if (privileged || (destructive && openWorld)) {
            findings.push({
                check: "BROAD_PERMISSIONS",
                severity: privileged && destructive ? "red" : "yellow",
                toolName: tool.name,
                message: `broad ${privileged ? "privileged" : "destructive and open-world"} capability in "${tool.name}"`,
                explanation: "This tool can affect a wide resource set or execute high-impact behavior without a visibly narrow scope.",
                remediation: "Split the operation into narrowly scoped tools, constrain resource identifiers and allowed values, and require confirmation for destructive actions.",
                evidence: [method, tool.path, privileged ? "privileged language" : "destructive + open-world"].filter(Boolean).join(" "),
            });
        }

        for (const parameter of collectBroadParameters(tool.inputSchema)) {
            findings.push({
                check: "BROAD_PERMISSIONS",
                severity: destructive || privileged ? "red" : "yellow",
                toolName: tool.name,
                parameterPath: parameter.path,
                message: `${parameter.evidence} in "${tool.name}"`,
                explanation: "A model-controlled path, command, URL, or wildcard permission can expand the operation beyond the API route the user reviewed.",
                remediation: "Replace the free-form value with a bounded enum or validated identifier and keep the destination or command fixed in host configuration.",
                evidence: parameter.path,
            });
        }
    }
    return findings;
}
