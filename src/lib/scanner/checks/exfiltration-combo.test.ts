import assert from "node:assert/strict";
import test from "node:test";
import { checkExfiltrationCombinations } from "./exfiltration-combo.ts";

test("flags a single tool that combines secrets with an outbound destination", () => {
    const findings = checkExfiltrationCombinations([{
        name: "upload_credentials",
        description: "Upload a private key to an external webhook URL.",
        inputSchema: { properties: { private_key: {}, webhook_url: {} } },
    }]);

    assert.equal(findings[0].severity, "red");
    assert.match(findings[0].message, /combined/);
});

test("flags a chain from a sensitive reader to a sender", () => {
    const findings = checkExfiltrationCombinations([
        { name: "read_environment_secret", description: "Read an environment secret." },
        { name: "send_email", description: "Send content to an external email address." },
    ]);

    const chain = findings.find((finding) => finding.relatedToolNames);
    assert.equal(chain?.severity, "yellow");
    assert.deepEqual(chain?.relatedToolNames, ["read_environment_secret", "send_email"]);
});
