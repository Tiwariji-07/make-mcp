import test from "node:test";
import assert from "node:assert/strict";
import { buildOpenAPIModel } from "../api-model/openapi.ts";
import { parseGeneratorRequestPayload } from "./request.ts";
import { createPreviewResponse } from "./index.ts";

test("openapi model applies operation parameter overrides and preserves path servers", () => {
    const model = buildOpenAPIModel({
        openapi: "3.1.0",
        info: { title: "Inventory", version: "1.0.0" },
        servers: [{ url: "https://api.example.com" }],
        paths: {
            "/items/{id}": {
                servers: [{ url: "https://regional.example.com" }],
                parameters: [
                    { name: "id", in: "path", required: true, schema: { type: "string" }, description: "Path id" },
                    { name: "include", in: "query", schema: { type: "string" }, description: "Path-level include" },
                ],
                get: {
                    parameters: [
                        {
                            name: "include",
                            in: "query",
                            schema: { type: "array", items: { type: "string" } },
                            style: "form",
                            explode: false,
                            description: "Operation-level include",
                        },
                    ],
                    responses: {
                        "200": {
                            description: "OK",
                            headers: {
                                "X-Rate-Limit": {
                                    description: "Remaining requests",
                                    schema: { type: "integer", default: 10 },
                                    example: 9,
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    const operation = model.operations[0];
    const includeParameters = operation.parameters.filter((parameter) =>
        parameter.in === "query" && parameter.name === "include"
    );

    assert.equal(includeParameters.length, 1);
    assert.equal(includeParameters[0].description, "Operation-level include");
    assert.deepEqual(includeParameters[0].schema, { type: "array", items: { type: "string" } });
    assert.equal(includeParameters[0].explode, false);
    assert.equal(operation.pathServers?.[0]?.url, "https://regional.example.com");
    assert.deepEqual(operation.responses[0].headers?.["X-Rate-Limit"], {
        description: "Remaining requests",
        required: undefined,
        deprecated: undefined,
        schema: { type: "integer", default: 10 },
        style: undefined,
        explode: undefined,
        example: 9,
        examples: undefined,
    });
});

test("generator request preserves apiModel and plans from canonical operation metadata", () => {
    const apiModel = buildOpenAPIModel({
        openapi: "3.1.0",
        info: { title: "Billing", version: "1.0.0" },
        servers: [{ url: "https://canonical.example.com" }],
        paths: {
            "/canonical/{id}": {
                parameters: [
                    { name: "id", in: "path", required: true, schema: { type: "string" } },
                ],
                post: {
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: { amount: { type: "number" } },
                                    required: ["amount"],
                                },
                            },
                        },
                    },
                    responses: { "201": { description: "Created" } },
                },
            },
        },
    });

    const payload = parseGeneratorRequestPayload({
        spec: {
            info: { title: "Billing", version: "1.0.0" },
            baseUrl: "https://legacy.example.com",
            apiModel,
        },
        tools: [{
            endpointId: "POST-/canonical/{id}",
            enabled: true,
            toolName: "charge",
            description: "Charge customer",
            parameters: [
                {
                    name: "id",
                    originalName: "id",
                    type: "string",
                    required: true,
                    description: "Customer id",
                    location: "query",
                },
                {
                    name: "amount",
                    originalName: "amount",
                    type: "number",
                    required: true,
                    description: "Charge amount",
                    location: "body",
                    schema: { type: "number" },
                },
            ],
            bodyContentType: "text/plain",
        }],
        serverConfig: {
            name: "billing",
            version: "1.0.0",
            host: "localhost",
            port: 8080,
            transport: "stdio",
        },
        authConfig: { type: "none" },
        exportConfig: {
            language: "node",
            framework: "mcp-ts-sdk",
            packageManager: "npm",
            features: { verification: true },
        },
    });

    const preview = createPreviewResponse(payload);
    const indexFile = preview.files.find((file) => file.name === "src/index.ts")?.content || "";
    const envFile = preview.files.find((file) => file.name === ".env.example")?.content || "";

    assert.match(envFile, /API_BASE_URL=https:\/\/canonical\.example\.com/);
    assert.match(indexFile, /url = url\.replace\("\{id\}"/);
    assert.match(indexFile, /requestHeaders\["Content-Type"\] = "application\/json"/);
});
