import test from "node:test";
import assert from "node:assert/strict";
import { buildOpenAPIModel } from "../api-model/openapi.ts";
import { buildToolPlans } from "./planner.ts";
import { buildGenerationPlan } from "./normalize.ts";
import type { GeneratorRequest } from "./types.ts";

test("planner converts ApiModel operations into tool plans", () => {
    const apiModel = buildOpenAPIModel({
        openapi: "3.1.0",
        info: { title: "Billing", version: "1.0.0" },
        components: {
            securitySchemes: {
                bearerAuth: { type: "http", scheme: "bearer" },
            },
        },
        security: [{ bearerAuth: [] }],
        paths: {
            "/customers/{id}": {
                patch: {
                    operationId: "update-customer",
                    summary: "Update customer",
                    parameters: [
                        { name: "id", in: "path", required: true, schema: { type: "string" } },
                        { name: "include", in: "query", required: false, schema: { type: "string" } },
                    ],
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        email: { type: "string", format: "email" },
                                        active: { type: "boolean" },
                                    },
                                    required: ["email"],
                                },
                            },
                        },
                    },
                    responses: { "200": { description: "Updated" } },
                },
            },
        },
    });

    const [plan] = buildToolPlans(apiModel);

    assert.equal(plan.toolName, "update_customer");
    assert.equal(plan.description, "Update customer");
    assert.equal(plan.authStrategy.strategy, "bearer");
    assert.equal(plan.authStrategy.source, "global");
    assert.equal(plan.requestBodyStrategy.contentKind, "json-object");
    assert.equal(plan.requestBodyStrategy.required, true);
    assert.deepEqual(plan.serializationStrategy.path.map((param) => param.sourceName), ["id"]);
    assert.deepEqual(plan.serializationStrategy.query.map((param) => param.sourceName), ["include"]);
    assert.deepEqual(plan.serializationStrategy.requestBody?.parameterNames, ["email", "active"]);
    assert.deepEqual(plan.inputSchema.required, ["id", "email"]);
    assert.equal((plan.inputSchema.properties as Record<string, Record<string, unknown>>).email.format, "email");
});

test("planner flags binary request bodies and unsupported auth for manual review", () => {
    const apiModel = buildOpenAPIModel({
        openapi: "3.1.0",
        info: { title: "Files", version: "1.0.0" },
        components: {
            securitySchemes: {
                oauth: {
                    type: "oauth2",
                    flows: {
                        clientCredentials: {
                            tokenUrl: "https://auth.example.com/token",
                            scopes: {},
                        },
                    },
                },
            },
        },
        security: [{ oauth: [] }],
        paths: {
            "/files": {
                post: {
                    operationId: "uploadFile",
                    requestBody: {
                        required: true,
                        content: {
                            "application/octet-stream": {
                                schema: { type: "string", format: "binary" },
                            },
                        },
                    },
                    responses: { "201": { description: "Uploaded" } },
                },
            },
        },
    });

    const [plan] = buildToolPlans(apiModel);

    assert.equal(plan.toolName, "uploadFile");
    assert.equal(plan.requestBodyStrategy.contentKind, "binary");
    assert.equal(plan.authStrategy.source, "unsupported");
    assert.deepEqual(plan.manualReview.map((flag) => flag.code), [
        "binary-request-body",
        "unsupported-auth",
    ]);
});

test("generation plan consumes ToolPlan for canonical ApiModel operations", () => {
    const apiModel = buildOpenAPIModel({
        openapi: "3.1.0",
        info: { title: "Catalog", version: "1.0.0" },
        paths: {
            "/items/{itemId}": {
                post: {
                    operationId: "create-item",
                    parameters: [
                        { name: "itemId", in: "path", required: true, schema: { type: "string" } },
                    ],
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: { name: { type: "string" } },
                                    required: ["name"],
                                },
                            },
                        },
                    },
                    responses: { "201": { description: "Created" } },
                },
            },
        },
    });
    const request: GeneratorRequest = {
        spec: {
            info: apiModel.info,
            baseUrl: "https://catalog.example.com",
            apiModel,
        },
        tools: [{
            endpointId: "POST-/items/{itemId}",
            enabled: true,
            toolName: "create-item",
            description: "Create item",
            parameters: [],
        }],
        serverConfig: {
            name: "catalog",
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
        },
    };

    const [tool] = buildGenerationPlan(request).tools;

    assert.deepEqual(tool.params.map((param) => [param.argName, param.sourceName, param.location]), [
        ["itemId", "itemId", "path"],
        ["name", "name", "body"],
    ]);
    assert.equal(tool.requestBody?.contentKind, "json-object");
});
