import assert from "node:assert/strict";
import test from "node:test";
import nextConfig from "./next.config.ts";

test("production security headers exclude eval and lock down browser capabilities", async () => {
    const groups = await nextConfig.headers?.();
    const headers = groups?.flatMap((group) => group.headers) || [];
    const values = new Map(headers.map((header) => [header.key, header.value]));
    const csp = values.get("Content-Security-Policy") || "";

    assert.doesNotMatch(csp, /unsafe-eval/);
    assert.match(csp, /upgrade-insecure-requests/);
    assert.equal(values.get("Cross-Origin-Opener-Policy"), "same-origin");
    assert.equal(values.get("X-Content-Type-Options"), "nosniff");
    assert.match(values.get("Permissions-Policy") || "", /camera=\(\)/);
});
