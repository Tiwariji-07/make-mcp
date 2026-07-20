import type { Finding, Severity } from "./types.ts";

export function computeScore(findings: Finding[]): number {
    const deductions = findings.reduce((total, finding) => {
        if (finding.severity === "red") return total + 25;
        if (finding.severity === "yellow") return total + 8;
        return total;
    }, 0);
    return Math.max(0, 100 - deductions);
}

export function computeVerdict(findings: Finding[]): Severity {
    if (findings.some((finding) => finding.severity === "red")) return "red";
    if (findings.some((finding) => finding.severity === "yellow")) return "yellow";
    return "green";
}
