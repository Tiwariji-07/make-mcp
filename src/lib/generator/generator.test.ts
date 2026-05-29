import test from "node:test";
import assert from "node:assert/strict";
import { buildOpenAPIModel } from "../api-model/openapi.ts";
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
    assert.match(indexFile, /if \(req\.method !== "POST"\)/);
    assert.match(indexFile, /const server = createServer\(\);\n    const transport = new StreamableHTTPServerTransport\(\{ sessionIdGenerator: undefined \}\);/);
    assert.match(indexFile, /message: "Method not allowed\."/);
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

test("node preview keeps complex json bodies as a single body argument", () => {
    const apiModel = buildOpenAPIModel({
        openapi: "3.1.0",
        info: { title: "Profiles API", version: "1.0.0" },
        paths: {
            "/profiles": {
                post: {
                    operationId: "createProfile",
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        name: { type: "string" },
                                        profile: {
                                            type: "object",
                                            properties: { city: { type: "string" } },
                                        },
                                    },
                                    required: ["name", "profile"],
                                },
                            },
                        },
                    },
                    responses: { "201": { description: "Created" } },
                },
            },
        },
    });
    const preview = createPreviewResponse({
        spec: {
            info: apiModel.info,
            baseUrl: "https://profiles.example.com",
            apiModel,
        },
        tools: [{
            endpointId: "POST-/profiles",
            enabled: true,
            toolName: "createProfile",
            description: "Create profile",
            parameters: [],
        }],
        serverConfig: {
            name: "profiles-mcp",
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
            features: {
                documentation: false,
                docker: false,
                tests: false,
                verification: true,
            },
        },
    });

    const indexFile = getFileContent(preview, "src/index.ts");
    assert.match(indexFile, /"body": z\.object/);
    assert.match(indexFile, /body: JSON\.stringify\(args\["body"\]\)/);
    assert.doesNotMatch(indexFile, /"profile": args\["profile"\]/);
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

test("previews render multipart binary fields as file uploads", () => {
    const apiModel = buildOpenAPIModel({
        openapi: "3.1.0",
        info: { title: "Assets API", version: "1.0.0" },
        paths: {
            "/assets": {
                post: {
                    operationId: "uploadAsset",
                    requestBody: {
                        required: true,
                        content: {
                            "multipart/form-data": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        file: { type: "string", format: "binary" },
                                        label: { type: "string" },
                                    },
                                    required: ["file"],
                                },
                            },
                        },
                    },
                    responses: { "201": { description: "Uploaded" } },
                },
            },
        },
    });
    const baseRequest: Omit<GeneratorRequest, "exportConfig"> = {
        spec: {
            info: apiModel.info,
            baseUrl: "https://assets.example.com",
            apiModel,
        },
        tools: [{
            endpointId: "POST-/assets",
            enabled: true,
            toolName: "uploadAsset",
            description: "Upload asset",
            parameters: [],
        }],
        serverConfig: {
            name: "assets-mcp",
            version: "1.0.0",
            host: "localhost",
            port: 8080,
            transport: "stdio",
        },
        authConfig: { type: "none" },
    };

    const nodePreview = createPreviewResponse({
        ...baseRequest,
        exportConfig: {
            language: "node",
            framework: "mcp-ts-sdk",
            packageManager: "npm",
            features: {
                documentation: false,
                docker: false,
                tests: false,
                verification: true,
            },
        },
    });
    const nodeIndex = getFileContent(nodePreview, "src/index.ts");
    assert.match(nodeIndex, /"file": z\.string\(\)\.describe\("Base64-encoded file content\."\)/);
    assert.match(nodeIndex, /const fileBytes = Buffer\.from\(String\(args\["file"\]\), "base64"\);/);
    assert.match(nodeIndex, /formBody\.append\("file", new Blob\(\[fileBytes\]\), "file"\);/);
    assert.match(nodeIndex, /formBody\.append\("label", String\(args\["label"\]\)\);/);

    const pythonPreview = createPreviewResponse({
        ...baseRequest,
        exportConfig: {
            language: "python",
            framework: "fastmcp",
            packageManager: "npm",
            features: {
                documentation: false,
                docker: false,
                tests: false,
                verification: true,
            },
        },
    });
    const serverFile = getFileContent(pythonPreview, "src/server.py");
    assert.match(serverFile, /import base64/);
    assert.match(serverFile, /multipart_files\["file"\] = \("file", base64\.b64decode\(file\), "application\/octet-stream"\)/);
    assert.match(serverFile, /multipart_files\["label"\] = \(None, str\(label\)\)/);
});

test("node sse preview exposes message endpoint and per-session server", () => {
    const preview = createPreviewResponse({
        ...postmanBase,
        serverConfig: {
            ...postmanBase.serverConfig,
            transport: "sse",
        },
        exportConfig: {
            language: "node",
            framework: "mcp-ts-sdk",
            packageManager: "npm",
            features: {
                documentation: true,
                docker: false,
                tests: false,
                verification: true,
            },
        },
    });

    assert.equal(preview.verification?.status, "passed");
    const indexFile = getFileContent(preview, "src/index.ts");
    assert.match(indexFile, /const sessions: Record<string, \{ transport: SSEServerTransport; server: McpServer \}> = \{\};/);
    assert.match(indexFile, /const transport = new SSEServerTransport\("\/messages", res\);/);
    assert.match(indexFile, /const server = createServer\(\);/);
    assert.match(indexFile, /await session\.transport\.handlePostMessage\(req, res\);/);
    assert.match(indexFile, /Missing sessionId parameter/);
});
