import { checkBroadPermissions } from "./checks/broad-permissions.ts";
import { checkExfiltrationCombinations } from "./checks/exfiltration-combo.ts";
import { checkHiddenInstructions } from "./checks/hidden-instructions.ts";
import { checkSuspiciousParams } from "./checks/suspicious-params.ts";
import { checkToolPoisoning } from "./checks/tool-poisoning.ts";
import { computeScore, computeVerdict } from "./score.ts";
import type { CheckId, Finding, ScanAttestation, ScanReport, ScanTool, Severity } from "./types.ts";

const CHECKS: Array<{ id: CheckId; run: (tools: ScanTool[]) => Finding[] }> = [
    { id: "HIDDEN_INSTRUCTIONS", run: checkHiddenInstructions },
    { id: "SUSPICIOUS_PARAMS", run: checkSuspiciousParams },
    { id: "TOOL_POISONING", run: checkToolPoisoning },
    { id: "BROAD_PERMISSIONS", run: checkBroadPermissions },
    { id: "EXFIL_COMBO", run: checkExfiltrationCombinations },
];

function worstSeverity(findings: Finding[]): Severity {
    return computeVerdict(findings);
}

export function scanTools(tools: ScanTool[]): ScanReport {
    const findingsByCheck = CHECKS.map((check) => ({ ...check, findings: check.run(tools) }));
    const findings = findingsByCheck.flatMap((check) => check.findings);
    return {
        schemaVersion: 1,
        score: computeScore(findings),
        verdict: computeVerdict(findings),
        toolCount: tools.length,
        checks: findingsByCheck.map((check) => ({
            check: check.id,
            severity: worstSeverity(check.findings),
            summary: check.findings.length === 0
                ? "No findings"
                : `${check.findings.length} finding${check.findings.length === 1 ? "" : "s"}`,
        })),
        findings,
    };
}

async function sha256(value: string): Promise<string> {
    const data = new TextEncoder().encode(value);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createScanAttestation(input: {
    projectName: string;
    source: string;
    subject: string;
    report: ScanReport;
    riskAccepted: boolean;
    generatedAt?: string;
}): Promise<ScanAttestation> {
    return {
        schemaVersion: 1,
        kind: "mcpmint-trust-attestation",
        generatedAt: input.generatedAt || new Date().toISOString(),
        subject: {
            projectName: input.projectName,
            source: input.source,
            sha256: await sha256(input.subject),
        },
        riskAccepted: input.riskAccepted,
        report: input.report,
    };
}

export type { CheckId, Finding, ScanAttestation, ScanReport, ScanTool, Severity } from "./types.ts";
