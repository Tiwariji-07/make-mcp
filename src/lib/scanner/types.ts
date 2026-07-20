export type CheckId =
    | "HIDDEN_INSTRUCTIONS"
    | "SUSPICIOUS_PARAMS"
    | "TOOL_POISONING"
    | "BROAD_PERMISSIONS"
    | "EXFIL_COMBO";

export interface ScanTool {
    name: string;
    description?: string;
    inputSchema?: unknown;
}

export type Severity = "green" | "yellow" | "red";

export interface Finding {
    check: CheckId;
    severity: Severity;
    toolName?: string;
    message: string;
}

export interface CheckResult {
    check: CheckId;
    severity: Severity;
    summary: string;
}

export interface ScanReport {
    score: number;
    verdict: Severity;
    toolCount: number;
    checks: CheckResult[];
    findings: Finding[];
}
