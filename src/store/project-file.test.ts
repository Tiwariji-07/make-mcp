import assert from "node:assert/strict";
import test from "node:test";
import { parseProjectFile, serializeProjectFile, type PortableProjectFile } from "./project-file.ts";

const fixture = {
    schemaVersion: 1,
    kind: "mcpmint-project",
    exportedAt: "2026-07-20T00:00:00.000Z",
    project: { id: "p1", name: "Billing", source: "billing.yaml", format: "openapi", endpointCount: 0, savedAt: 1 },
    data: {
        spec: {
            info: { title: "Billing", version: "1" },
            baseUrl: "https://api.example.com",
            endpoints: [],
            securitySchemes: {},
            apiModel: {
                source: { format: "openapi" },
                info: { title: "Billing", version: "1" },
                servers: [],
                baseUrls: [],
                securitySchemes: {},
                security: [],
                operations: [],
            },
        },
        specSource: "billing.yaml",
        specFormat: "openapi",
        tools: [],
        authConfig: { type: "none" },
        mcpServerAuthConfig: { type: "none", allowedOrigins: [] },
        serverConfig: { name: "billing", version: "1.0.0", host: "localhost", port: 8080, transport: "stdio" },
        exportConfig: { language: "node", framework: "mcp-ts-sdk", packageManager: "npm", verificationMode: "fast", compactMode: false, features: { documentation: true, docker: false, tests: true, verification: false } },
    },
} satisfies PortableProjectFile;

test("round trips a portable project file", () => {
    assert.deepEqual(parseProjectFile(serializeProjectFile(fixture)), fixture);
});

test("rejects malformed, unsupported, and legacy project files", () => {
    assert.throws(() => parseProjectFile("not json"), /not valid JSON/);
    assert.throws(() => parseProjectFile('{"kind":"other","schemaVersion":1}'), /Unsupported project file/);
    assert.throws(() => parseProjectFile('{"kind":"mcpmint-project","schemaVersion":1,"project":{},"data":{}}'), /metadata/);
});
