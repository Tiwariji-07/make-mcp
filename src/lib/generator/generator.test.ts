import test from "node:test";
import assert from "node:assert/strict";
import { createPreviewResponse, type GeneratorRequest } from "./index.ts";

const openApiBase: Omit<GeneratorRequest, "exportConfig"> = {
    spec: {
        info: {
            title: "Billing API",
            version: "1.0.0",
            description: "Example OpenAPI fixture",
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
    ],
    serverConfig: {
        name: "billing-mcp",
        version: "1.0.0",
        host: "localhost",
        port: 8080,
        transport: "http",
    },
    authConfig: {
        type: "apiKey",
        apiKey: { name: "x-api-key", in: "header" },
    },
};

const postmanBase: Omit<GeneratorRequest, "exportConfig"> = {
    spec: {
        info: {
            title: "Postman Fixture",
            version: "1.0.0",
            description: "Example Postman fixture",
        },
        baseUrl: "https://postman.example.com",
    },
    tools: [
        {
            endpointId: "GET::/orders/{orderId}::1",
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
    ],
    serverConfig: {
        name: "orders-mcp",
        version: "2.1.0",
        host: "127.0.0.1",
        port: 9000,
        transport: "stdio",
    },
    authConfig: {
        type: "bearer",
    },
};

function getFileContent(preview: ReturnType<typeof createPreviewResponse>, fileName: string): string {
    const file = preview.files.find((entry) => entry.name === fileName);
    assert.ok(file, `Expected generated file ${fileName}`);
    return file.content;
}

test("openapi -> node preview matches golden contract", () => {
    const preview = createPreviewResponse({
        ...openApiBase,
        exportConfig: {
            language: "node",
            framework: "mcp-ts-sdk",
            packageManager: "npm",
            features: {
                documentation: true,
                docker: true,
                tests: true,
                verification: true,
            },
        },
    });

    assert.equal(preview.manifest.language, "node");
    assert.equal(preview.manifest.serverName, "billing-mcp");
    assert.equal(preview.manifest.features.docker, true);
    assert.equal(preview.verification?.status, "passed");
    assert.ok(preview.files.some((file) => file.name === "Dockerfile"));
    assert.ok(preview.files.some((file) => file.name === "tests/manifest.test.ts"));

    const indexFile = getFileContent(preview, "src/index.ts");
    assert.match(indexFile, /server\.tool\(\s*"create-customer"/);
    assert.match(indexFile, /headers\["x-api-key"\] = API_KEY/);
    assert.match(indexFile, /"accountId": args\["account_id"\]/);
  });

test("openapi -> python preview matches golden contract", () => {
    const preview = createPreviewResponse({
        ...openApiBase,
        exportConfig: {
            language: "python",
            framework: "fastmcp",
            packageManager: "npm",
            features: {
                documentation: true,
                docker: false,
                tests: true,
                verification: true,
            },
        },
    });

    assert.equal(preview.manifest.language, "python");
    assert.equal(preview.verification?.status, "passed");
    assert.ok(preview.files.some((file) => file.name === "tests/test_manifest.py"));

    const serverFile = getFileContent(preview, "src/server.py");
    assert.match(serverFile, /@mcp\.tool\(name="create-customer"\)/);
    assert.match(serverFile, /headers\["x-api-key"\] = API_KEY/);
    assert.match(serverFile, /json_body\["accountId"\] = account_id/);
});

test("postman -> node preview preserves path and headers", () => {
    const preview = createPreviewResponse({
        ...postmanBase,
        exportConfig: {
            language: "node",
            framework: "mcp-ts-sdk",
            packageManager: "pnpm",
            features: {
                documentation: true,
                docker: false,
                tests: false,
                verification: true,
            },
        },
    });

    assert.equal(preview.manifest.language, "node");
    const indexFile = getFileContent(preview, "src/index.ts");
    assert.match(indexFile, /Authorization"\] = `Bearer \$\{BEARER_TOKEN\}`/);
    assert.match(indexFile, /url = url\.replace\("\{orderId\}", String\(args\["order_id"\]\)\)/);
    assert.match(indexFile, /requestHeaders\["X-Trace-Id"\] = String\(args\["x_trace_id"\]\)/);
});

test("postman -> python preview preserves tool name and stdio transport", () => {
    const preview = createPreviewResponse({
        ...postmanBase,
        exportConfig: {
            language: "python",
            framework: "fastmcp",
            packageManager: "npm",
            features: {
                documentation: false,
                docker: false,
                tests: true,
                verification: true,
            },
        },
    });

    assert.equal(preview.manifest.language, "python");
    assert.equal(preview.manifest.features.documentation, false);
    const serverFile = getFileContent(preview, "src/server.py");
    assert.match(serverFile, /@mcp\.tool\(name="get-order"\)/);
    assert.match(serverFile, /mcp\.run\(transport="stdio"\)/);
});

test("node preview preserves cookie params and form encoded bodies", () => {
    const preview = createPreviewResponse({
        spec: {
            info: {
                title: "Forms API",
                version: "1.0.0",
            },
            baseUrl: "https://forms.example.com",
        },
        tools: [
            {
                endpointId: "POST-/sessions",
                enabled: true,
                toolName: "create-session",
                description: "Create a session",
                parameters: [
                    {
                        name: "session_id",
                        originalName: "sessionId",
                        type: "string",
                        required: false,
                        description: "Session cookie",
                        location: "cookie",
                    },
                    {
                        name: "username",
                        originalName: "username",
                        type: "string",
                        required: true,
                        description: "User name",
                        location: "body",
                    },
                    {
                        name: "password",
                        originalName: "password",
                        type: "string",
                        required: true,
                        description: "Password",
                        location: "body",
                    },
                ],
                bodySchema: {
                    type: "object",
                    properties: {
                        username: { type: "string" },
                        password: { type: "string" },
                    },
                    required: ["username", "password"],
                },
                bodyContentType: "application/x-www-form-urlencoded",
            },
        ],
        serverConfig: {
            name: "forms-mcp",
            version: "1.0.0",
            host: "localhost",
            port: 8080,
            transport: "http",
        },
        authConfig: {
            type: "none",
        },
        exportConfig: {
            language: "node",
            framework: "mcp-ts-sdk",
            packageManager: "npm",
            features: {
                documentation: true,
                docker: false,
                tests: true,
                verification: true,
            },
        },
    });

    assert.equal(preview.verification?.status, "passed");
    const indexFile = getFileContent(preview, "src/index.ts");
    assert.match(indexFile, /const formBody = new URLSearchParams\(\);/);
    assert.match(indexFile, /requestHeaders\["Content-Type"\] = "application\/x-www-form-urlencoded"/);
    assert.match(indexFile, /cookiePairs\.push\(`sessionId=/);
});
