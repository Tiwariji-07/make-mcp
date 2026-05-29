import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import ts from "typescript";
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

function extractBlock(source: string, start: string, end: string): string {
    const startIndex = source.indexOf(start);
    const endIndex = source.indexOf(end, startIndex);
    assert.notEqual(startIndex, -1, `Expected block start ${start}`);
    assert.notEqual(endIndex, -1, `Expected block end ${end}`);
    return source.slice(startIndex, endIndex);
}

type NodeSerializationHelpers = {
    serializePathParameter: (name: string, value: unknown, options: Record<string, unknown>) => string;
    appendSerializedParameter: (
        params: URLSearchParams,
        name: string,
        value: unknown,
        options: Record<string, unknown>
    ) => void;
};

function loadNodeSerializationHelpers(indexFile: string): NodeSerializationHelpers {
    const helperSource = extractBlock(indexFile, "type SerializedParameterOptions", "function getHeaders");
    const output = ts.transpileModule(`${helperSource}
(globalThis as any).__serializationHelpers = { serializePathParameter, appendSerializedParameter };`, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
        },
    }).outputText;
    const context = {
        URLSearchParams,
        encodeURIComponent,
    } as Record<string, unknown>;

    vm.runInNewContext(output, context);
    return context.__serializationHelpers as NodeSerializationHelpers;
}

function nodeQueryString(
    helpers: NodeSerializationHelpers,
    name: string,
    value: unknown,
    options: Record<string, unknown>
): string {
    const params = new URLSearchParams();
    helpers.appendSerializedParameter(params, name, value, options);
    return params.toString();
}

function runPythonSerializationCases(serverFile: string): Record<string, string> {
    const helperSource = extractBlock(serverFile, "def default_parameter_style", "def get_headers");
    const script = `from urllib.parse import quote
${helperSource}
import json

def query_string(name, value, options):
    from urllib.parse import urlencode
    params = []
    append_serialized_parameter(params, name, value, options)
    return urlencode(params)

print(json.dumps({
    "form_array_explode": query_string("tags", ["a", "b"], {"location": "query", "style": "form", "explode": True}),
    "form_object_explode": query_string("filter", {"role": "admin", "active": True}, {"location": "query", "style": "form", "explode": True}),
    "deep_object": query_string("filter", {"status": "open"}, {"location": "query", "style": "deepObject", "explode": True}),
    "space_delimited": query_string("tags", ["a", "b"], {"location": "query", "style": "spaceDelimited", "explode": False}),
    "pipe_delimited": query_string("tags", ["a", "b"], {"location": "query", "style": "pipeDelimited", "explode": False}),
    "simple_path": serialize_path_parameter("ids", ["a", "b"], {"location": "path", "style": "simple", "explode": False}),
    "label_path": serialize_path_parameter("ids", ["a", "b"], {"location": "path", "style": "label", "explode": True}),
    "matrix_path": serialize_path_parameter("ids", ["a", "b"], {"location": "path", "style": "matrix", "explode": False}),
    "matrix_path_explode": serialize_path_parameter("ids", ["a", "b"], {"location": "path", "style": "matrix", "explode": True}),
}))
`;

    return JSON.parse(execFileSync("python3", ["-c", script], { encoding: "utf8" })) as Record<string, string>;
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
    assert.match(indexFile, /url = url\.replace\("\{orderId\}", serializePathParameter\("orderId", args\["order_id"\]/);
    assert.match(indexFile, /requestHeaders\["X-Trace-Id"\] = serializeParameterValue\("X-Trace-Id", args\["x_trace_id"\]/);
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

test("previews serialize OpenAPI path, query, header, and cookie parameters with style metadata", () => {
    const apiModel = buildOpenAPIModel({
        openapi: "3.1.0",
        info: { title: "Search API", version: "1.0.0" },
        paths: {
            "/reports/{ids}": {
                get: {
                    operationId: "searchReports",
                    parameters: [
                        {
                            name: "ids",
                            in: "path",
                            required: true,
                            style: "simple",
                            explode: false,
                            schema: { type: "array", items: { type: "string" } },
                        },
                        {
                            name: "filter",
                            in: "query",
                            style: "deepObject",
                            explode: true,
                            schema: {
                                type: "object",
                                properties: {
                                    status: { type: "string" },
                                    owner: { type: "string" },
                                },
                            },
                        },
                        {
                            name: "tags",
                            in: "query",
                            style: "pipeDelimited",
                            explode: false,
                            schema: { type: "array", items: { type: "string" } },
                        },
                        {
                            name: "X-Fields",
                            in: "header",
                            style: "simple",
                            explode: false,
                            schema: { type: "array", items: { type: "string" } },
                        },
                        {
                            name: "prefs",
                            in: "cookie",
                            style: "form",
                            explode: false,
                            schema: {
                                type: "object",
                                properties: {
                                    theme: { type: "string" },
                                },
                            },
                        },
                    ],
                    responses: { "200": { description: "OK" } },
                },
            },
        },
    });
    const baseRequest: Omit<GeneratorRequest, "exportConfig"> = {
        spec: {
            info: apiModel.info,
            baseUrl: "https://search.example.com",
            apiModel,
        },
        tools: [{
            endpointId: "GET-/reports/{ids}",
            enabled: true,
            toolName: "searchReports",
            description: "Search reports",
            parameters: [],
        }],
        serverConfig: {
            name: "search-mcp",
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
    assert.match(nodeIndex, /serializePathParameter\("ids", args\["ids"\], \{ location: "path", style: "simple", explode: false \}\)/);
    assert.match(nodeIndex, /appendSerializedParameter\(queryString, "filter", args\["filter"\], \{ location: "query", style: "deepObject", explode: true \}\)/);
    assert.match(nodeIndex, /appendSerializedParameter\(queryString, "tags", args\["tags"\], \{ location: "query", style: "pipeDelimited", explode: false \}\)/);
    assert.match(nodeIndex, /requestHeaders\["X-Fields"\] = serializeParameterValue\("X-Fields", args\["X_Fields"\], \{ location: "header", style: "simple", explode: false \}\)/);
    assert.match(nodeIndex, /cookiePairs\.push\(`prefs=\$\{encodeURIComponent\(serializeParameterValue\("prefs", args\["prefs"\], \{ location: "cookie", style: "form", explode: false \}\)\)\}`\)/);

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
    assert.match(serverFile, /serialize_path_parameter\("ids", ids, \{ "location": "path", "style": "simple", "explode": False \}\)/);
    assert.match(serverFile, /append_serialized_parameter\(params, "filter", filter, \{ "location": "query", "style": "deepObject", "explode": True \}\)/);
    assert.match(serverFile, /append_serialized_parameter\(params, "tags", tags, \{ "location": "query", "style": "pipeDelimited", "explode": False \}\)/);
    assert.match(serverFile, /request_headers\["X-Fields"\] = serialize_parameter_value\("X-Fields", X_Fields, \{ "location": "header", "style": "simple", "explode": False \}\)/);
    assert.match(serverFile, /cookies\["prefs"\] = serialize_parameter_value\("prefs", prefs, \{ "location": "cookie", "style": "form", "explode": False \}\)/);
});

test("generated serialization helpers produce golden OpenAPI array and object encodings", () => {
    const apiModel = buildOpenAPIModel({
        openapi: "3.1.0",
        info: { title: "Serialization API", version: "1.0.0" },
        paths: {
            "/reports/{ids}": {
                get: {
                    operationId: "serializeReports",
                    parameters: [
                        {
                            name: "ids",
                            in: "path",
                            required: true,
                            style: "simple",
                            explode: false,
                            schema: { type: "array", items: { type: "string" } },
                        },
                        {
                            name: "tags",
                            in: "query",
                            style: "form",
                            explode: true,
                            schema: { type: "array", items: { type: "string" } },
                        },
                    ],
                    responses: { "200": { description: "OK" } },
                },
            },
        },
    });
    const baseRequest: Omit<GeneratorRequest, "exportConfig"> = {
        spec: {
            info: apiModel.info,
            baseUrl: "https://serialization.example.com",
            apiModel,
        },
        tools: [{
            endpointId: "GET-/reports/{ids}",
            enabled: true,
            toolName: "serializeReports",
            description: "Serialize reports",
            parameters: [],
        }],
        serverConfig: {
            name: "serialization-mcp",
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
    const nodeHelpers = loadNodeSerializationHelpers(getFileContent(nodePreview, "src/index.ts"));
    assert.equal(nodeQueryString(nodeHelpers, "tags", ["a", "b"], { location: "query", style: "form", explode: true }), "tags=a&tags=b");
    assert.equal(nodeQueryString(nodeHelpers, "filter", { role: "admin", active: true }, { location: "query", style: "form", explode: true }), "role=admin&active=true");
    assert.equal(nodeQueryString(nodeHelpers, "filter", { status: "open" }, { location: "query", style: "deepObject", explode: true }), "filter%5Bstatus%5D=open");
    assert.equal(nodeQueryString(nodeHelpers, "tags", ["a", "b"], { location: "query", style: "spaceDelimited", explode: false }), "tags=a+b");
    assert.equal(nodeQueryString(nodeHelpers, "tags", ["a", "b"], { location: "query", style: "pipeDelimited", explode: false }), "tags=a%7Cb");
    assert.equal(nodeHelpers.serializePathParameter("ids", ["a", "b"], { location: "path", style: "simple", explode: false }), "a,b");
    assert.equal(nodeHelpers.serializePathParameter("ids", ["a", "b"], { location: "path", style: "label", explode: true }), ".a.b");
    assert.equal(nodeHelpers.serializePathParameter("ids", ["a", "b"], { location: "path", style: "matrix", explode: false }), ";ids=a,b");
    assert.equal(nodeHelpers.serializePathParameter("ids", ["a", "b"], { location: "path", style: "matrix", explode: true }), ";ids=a;ids=b");

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
    const pythonCases = runPythonSerializationCases(getFileContent(pythonPreview, "src/server.py"));
    assert.deepEqual(pythonCases, {
        form_array_explode: "tags=a&tags=b",
        form_object_explode: "role=admin&active=true",
        deep_object: "filter%5Bstatus%5D=open",
        space_delimited: "tags=a+b",
        pipe_delimited: "tags=a%7Cb",
        simple_path: "a,b",
        label_path: ".a.b",
        matrix_path: ";ids=a,b",
        matrix_path_explode: ";ids=a;ids=b",
    });
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
