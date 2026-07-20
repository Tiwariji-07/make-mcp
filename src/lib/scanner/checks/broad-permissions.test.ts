import assert from "node:assert/strict";
import test from "node:test";
import { checkBroadPermissions } from "./broad-permissions.ts";

test("flags destructive privileged tools and model-controlled commands", () => {
    const findings = checkBroadPermissions([{
        name: "admin_exec",
        method: "DELETE",
        path: "/resources/{id}",
        inputSchema: { type: "object", properties: { command: { type: "string" } } },
        annotations: { destructiveHint: true, openWorldHint: true },
    }]);

    assert.ok(findings.length >= 2);
    assert.ok(findings.every((finding) => finding.severity === "red"));
    assert.equal(findings.find((finding) => finding.parameterPath)?.parameterPath, "command");
});

test("does not flag bounded read-only operations", () => {
    assert.deepEqual(checkBroadPermissions([{
        name: "get_invoice",
        method: "GET",
        path: "/invoices/{id}",
        inputSchema: { type: "object", properties: { id: { type: "string" } } },
        annotations: { readOnlyHint: true, openWorldHint: false },
    }]), []);
});
