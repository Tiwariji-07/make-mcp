import test from "node:test";
import assert from "node:assert/strict";
import { createPreviewResponse, type GeneratorRequest } from "./index.ts";

function assertFullVerificationPassed(preview: ReturnType<typeof createPreviewResponse>) {
    assert.ok(preview.verification, "Expected generated project verification to run");
    assert.equal(preview.verification.mode, "full");
    assert.equal(
        preview.verification.status,
        "passed",
        preview.verification.checks
            .map((check) => `${check.name}: ${check.status}${check.details ? `\n${check.details}` : ""}`)
            .join("\n\n")
    );
    assert.deepEqual(
        preview.verification.checks.filter((check) => check.status !== "passed"),
        [],
        "Expected every full verification check to pass"
    );
}

const generatedNodeSample: GeneratorRequest = {
    spec: {
        info: {
            title: "CI Billing API",
            version: "1.0.0",
            description: "CI fixture for generated Node project verification",
        },
        baseUrl: "https://api.example.com",
    },
    tools: [
        {
            endpointId: "POST-/customers",
            enabled: true,
            toolName: "create-customer",
            description: "Create a customer",
            parameters: [
                {
                    name: "email",
                    originalName: "email",
                    type: "string",
                    required: true,
                    description: "Customer email",
                    location: "body",
                    schema: { type: "string", format: "email" },
                },
                {
                    name: "account_id",
                    originalName: "accountId",
                    type: "string",
                    required: false,
                    description: "Optional account reference",
                    location: "body",
                    schema: { type: "string" },
                },
            ],
            bodySchema: {
                type: "object",
                properties: {
                    email: { type: "string", format: "email" },
                    accountId: { type: "string" },
                },
                required: ["email"],
            },
            bodyContentType: "application/json",
        },
        {
            endpointId: "GET-/customers/{customerId}",
            enabled: true,
            toolName: "get-customer",
            description: "Fetch a customer",
            parameters: [
                {
                    name: "customer_id",
                    originalName: "customerId",
                    type: "string",
                    required: true,
                    description: "Customer id",
                    location: "path",
                },
                {
                    name: "include",
                    originalName: "include",
                    type: "array",
                    required: false,
                    description: "Related resources to include",
                    location: "query",
                    schema: { type: "array", items: { type: "string" } },
                },
            ],
        },
    ],
    serverConfig: {
        name: "ci-node-mcp",
        version: "1.0.0",
        host: "127.0.0.1",
        port: 8080,
        transport: "http",
    },
    authConfig: {
        type: "apiKey",
        apiKey: { name: "x-api-key", in: "header" },
    },
    exportConfig: {
        language: "node",
        framework: "mcp-ts-sdk",
        packageManager: "npm",
        verificationMode: "full",
        features: {
            documentation: true,
            docker: false,
            tests: true,
            verification: true,
        },
    },
};

const generatedPythonSample: GeneratorRequest = {
    spec: {
        info: {
            title: "CI Orders API",
            version: "1.0.0",
            description: "CI fixture for generated Python project verification",
        },
        baseUrl: "https://orders.example.com",
    },
    tools: [
        {
            endpointId: "GET-/orders/{orderId}",
            enabled: true,
            toolName: "get-order",
            description: "Fetch an order",
            parameters: [
                {
                    name: "order_id",
                    originalName: "orderId",
                    type: "string",
                    required: true,
                    description: "Order id",
                    location: "path",
                },
                {
                    name: "x_trace_id",
                    originalName: "X-Trace-Id",
                    type: "string",
                    required: false,
                    description: "Trace header",
                    location: "header",
                },
            ],
        },
        {
            endpointId: "PATCH-/orders/{orderId}",
            enabled: true,
            toolName: "update-order",
            description: "Update an order",
            parameters: [
                {
                    name: "order_id",
                    originalName: "orderId",
                    type: "string",
                    required: true,
                    description: "Order id",
                    location: "path",
                },
                {
                    name: "status",
                    originalName: "status",
                    type: "string",
                    required: true,
                    description: "New order status",
                    location: "body",
                    schema: { type: "string", enum: ["open", "closed"] },
                },
            ],
            bodySchema: {
                type: "object",
                properties: {
                    status: { type: "string", enum: ["open", "closed"] },
                },
                required: ["status"],
            },
            bodyContentType: "application/json",
        },
    ],
    serverConfig: {
        name: "ci-python-mcp",
        version: "1.0.0",
        host: "127.0.0.1",
        port: 8090,
        transport: "stdio",
    },
    authConfig: {
        type: "bearer",
    },
    exportConfig: {
        language: "python",
        framework: "fastmcp",
        packageManager: "npm",
        verificationMode: "full",
        features: {
            documentation: true,
            docker: false,
            tests: true,
            verification: true,
        },
    },
};

test("generated Node sample passes full verification", () => {
    assertFullVerificationPassed(createPreviewResponse(generatedNodeSample));
});

test("generated Python sample passes full verification", () => {
    assertFullVerificationPassed(createPreviewResponse(generatedPythonSample));
});
