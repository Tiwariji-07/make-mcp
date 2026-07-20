import assert from "node:assert/strict";
import test from "node:test";
import type { ParsedSpec } from "../../src/lib/api-model/parsed-spec.ts";
import { buildGeneratorRequest } from "./build-request.ts";
import { scanRequest, testRequest } from "./workflows.ts";

const spec: ParsedSpec = {
    info: { title: "Pets", version: "1" },
    baseUrl: "https://api.example.com",
    format: "openapi",
    securitySchemes: {},
    endpoints: [{ id: "listPets", method: "GET", path: "/pets", operationId: "listPets", parameters: [] }],
    apiModel: {
        source: { format: "openapi" }, info: { title: "Pets", version: "1" }, servers: [], baseUrls: ["https://api.example.com"], securitySchemes: {}, security: [],
        operations: [{ id: "listPets", method: "GET", path: "/pets", operationId: "listPets", parameters: [], responses: [] }],
    },
};

const request = buildGeneratorRequest(spec, {
    language: "node", transport: "stdio", packageManager: "npm", compactMode: false,
    host: "localhost", port: 8080, verificationMode: "fast",
    features: { documentation: true, docker: false, tests: true, verification: false },
});

test("CLI trust scan uses the generated tool contract", () => {
    const { report } = scanRequest(request);
    assert.equal(report.toolCount, 1);
    assert.ok(report.score >= 0);
});

test("CLI request test defaults to a no-network mock", async () => {
    const result = await testRequest({ request, operationId: "listPets", live: false, allowMutation: false });
    assert.deepEqual(result.request, { method: "GET", url: "https://api.example.com/pets", headers: { Accept: "application/json" }, body: undefined });
    assert.equal((result.response as { http: { mode: string } }).http.mode, "mock");
});
