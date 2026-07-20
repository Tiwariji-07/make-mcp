import test from "node:test";
import assert from "node:assert/strict";
import { computeScore, computeVerdict } from "./score.ts";
import type { Finding } from "./types.ts";

function finding(severity: Finding["severity"]): Finding {
    return {
        check: "HIDDEN_INSTRUCTIONS",
        severity,
        message: `${severity} test finding`,
        explanation: "test explanation",
        remediation: "test remediation",
    };
}

test("scores findings and chooses the worst verdict", () => {
    const findings = [finding("red"), finding("yellow"), finding("green")];

    assert.equal(computeScore(findings), 67);
    assert.equal(computeVerdict(findings), "red");
    assert.equal(computeScore([]), 100);
    assert.equal(computeVerdict([]), "green");
    assert.equal(computeVerdict([finding("yellow")]), "yellow");
});

test("floors the trust score at zero", () => {
    assert.equal(computeScore(Array.from({ length: 5 }, () => finding("red"))), 0);
});
