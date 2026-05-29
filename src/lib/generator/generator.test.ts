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

type NodeSerializationHelpers = {
    serializePathParameter: (name: string, value: unknown, options: Record<string, unknown>) => string;
    appendSerializedParameter: (
        params: URLSearchParams,
        name: string,
        value: unknown,
        options: Record<string, unknown>
    ) => void;
};

type NodeAuthHelpers = {
    applyAuth: (
        params: URLSearchParams,
        headers: Record<string, string>,
        cookies: string[],
        requirements: Array<{ schemes: Record<string, unknown>[] }>
    ) => void;
};

function loadNodeSerializationHelpers(serializationFile: string): NodeSerializationHelpers {
    const output = ts.transpileModule(`${serializationFile}
(globalThis as any).__serializationHelpers = { serializePathParameter, appendSerializedParameter };`, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
        },
    }).outputText;
    const context = {
        URLSearchParams,
        encodeURIComponent,
        exports: {},
    } as Record<string, unknown>;

    vm.runInNewContext(output, context);
    return context.__serializationHelpers as NodeSerializationHelpers;
}

function loadNodeAuthHelpers(clientFile: string): NodeAuthHelpers {
    const source = clientFile.replace('import { API_BASE_URL } from "../config.js";', 'const API_BASE_URL = "https://example.com";');
    const output = ts.transpileModule(`${source}
(globalThis as any).__authHelpers = { applyAuth };`, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
        },
    }).outputText;
    const context = {
        URLSearchParams,
        Buffer,
        encodeURIComponent,
        exports: {},
    } as Record<string, unknown>;

    vm.runInNewContext(output, context);
    return context.__authHelpers as NodeAuthHelpers;
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

function runPythonSerializationCases(serializationFile: string): Record<string, string> {
    const script = `${serializationFile}
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

function runPythonAuthCases(apiClientFile: string): Record<string, unknown> {
    const source = apiClientFile.replace(
        "import httpx\nfrom config import API_BASE_URL",
        `class _Client:
    def __init__(self, *args, **kwargs):
        pass


class _Httpx:
    Client = _Client


httpx = _Httpx()
API_BASE_URL = "https://example.com"`
    );
    const script = `${source}
import json

def apply_case(requirements):
    params = []
    headers = {}
    cookies = {}
    apply_auth(params=params, headers=headers, cookies=cookies, auth_requirements=requirements)
    return {"params": params, "headers": headers, "cookies": cookies}

print(json.dumps({
    "optional": apply_case([
        {"schemes": []},
        {"schemes": [{"type": "bearer", "token": "secret"}]},
    ]),
    "partial_and": apply_case([
        {"schemes": [
            {"type": "apiKey", "in": "header", "name": "X-API-Key", "value": "key"},
            {"type": "bearer", "token": ""},
        ]},
    ]),
}))
`;

    return JSON.parse(execFileSync("python3", ["-c", script], { encoding: "utf8" })) as Record<string, unknown>;
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
    assert.ok(preview.files.some((file) => file.name === "src/config.ts"));
    assert.ok(preview.files.some((file) => file.name === "src/mcp/server.ts"));
    assert.ok(preview.files.some((file) => file.name === "src/api/client.ts"));
    assert.ok(preview.files.some((file) => file.name === "src/api/operations.ts"));
    assert.ok(preview.files.some((file) => file.name === "src/api/serialization.ts"));

    const serverFile = getFileContent(preview, "src/mcp/server.ts");
    const clientFile = getFileContent(preview, "src/api/client.ts");
    const configFile = getFileContent(preview, "src/config.ts");
    const operationsFile = getFileContent(preview, "src/api/operations.ts");
    const indexFile = getFileContent(preview, "src/index.ts");
    assert.match(serverFile, /server\.tool\(\s*"create-customer"/);
    assert.match(configFile, /"apiKey:apiKeyHeader:header:x-api-key": \{ type: "apiKey", in: "header", name: "x-api-key", value: process\.env\.API_KEY \|\| "" \}/);
    assert.match(clientFile, /headers\[scheme\.name\] = scheme\.value/);
    assert.match(clientFile, /hasHeader\(headers, scheme\.name\)/);
    assert.match(operationsFile, /AUTH_SCHEMES\["apiKey:apiKeyHeader:header:x-api-key"\]/);
    assert.match(operationsFile, /"accountId": args\["account_id"\]/);
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
    assert.ok(preview.files.some((file) => file.name === "src/config.py"));
    assert.ok(preview.files.some((file) => file.name === "src/api_client.py"));
    assert.ok(preview.files.some((file) => file.name === "src/operations.py"));
    assert.ok(preview.files.some((file) => file.name === "src/serialization.py"));

    const pyprojectFile = getFileContent(preview, "pyproject.toml");
    const serverFile = getFileContent(preview, "src/server.py");
    const apiClientFile = getFileContent(preview, "src/api_client.py");
    const configFile = getFileContent(preview, "src/config.py");
    const operationsFile = getFileContent(preview, "src/operations.py");
    assert.match(pyprojectFile, /"fastmcp==3\.3\.1"/);
    assert.match(serverFile, /@mcp\.tool\(name="create-customer"\)/);
    assert.match(configFile, /"apiKey:apiKeyHeader:header:x-api-key": \{"type": "apiKey", "in": "header", "name": "x-api-key", "value": os\.getenv\("API_KEY", ""\)\}/);
    assert.match(apiClientFile, /headers\[name\] = str\(scheme\["value"\]\)/);
    assert.match(apiClientFile, /has_header\(headers, name\)/);
    assert.match(operationsFile, /AUTH_SCHEMES\["apiKey:apiKeyHeader:header:x-api-key"\]/);
    assert.match(operationsFile, /json_body\["accountId"\] = account_id/);
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

    const serverFile = getFileContent(preview, "src/mcp/server.ts");
    const operationsFile = getFileContent(preview, "src/api/operations.ts");
    assert.match(serverFile, /"body": z\.object/);
    assert.match(operationsFile, /body: JSON\.stringify\(args\["body"\]\)/);
    assert.doesNotMatch(operationsFile, /"profile": args\["profile"\]/);
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
    const clientFile = getFileContent(preview, "src/api/client.ts");
    const configFile = getFileContent(preview, "src/config.ts");
    const operationsFile = getFileContent(preview, "src/api/operations.ts");
    assert.match(configFile, /"bearer:bearer::": \{ type: "bearer", token: process\.env\.BEARER_TOKEN \|\| "" \}/);
    assert.match(clientFile, /headers\["Authorization"\] = `Bearer \$\{scheme\.token\}`/);
    assert.match(operationsFile, /AUTH_SCHEMES\["bearer:bearer::"\]/);
    assert.match(operationsFile, /path = path\.replace\("\{orderId\}", serializePathParameter\("orderId", args\["order_id"\]/);
    assert.match(operationsFile, /requestHeaders\["X-Trace-Id"\] = serializeParameterValue\("X-Trace-Id", args\["x_trace_id"\]/);
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
    const apiClientFile = getFileContent(preview, "src/api_client.py");
    const configFile = getFileContent(preview, "src/config.py");
    const operationsFile = getFileContent(preview, "src/operations.py");
    assert.match(serverFile, /@mcp\.tool\(name="get-order"\)/);
    assert.match(serverFile, /mcp\.run\(transport="stdio"\)/);
    assert.match(configFile, /"bearer:bearer::": \{"type": "bearer", "token": os\.getenv\("BEARER_TOKEN", ""\)\}/);
    assert.match(apiClientFile, /headers\["Authorization"\] = f"Bearer \{scheme\['token'\]\}"/);
    assert.match(operationsFile, /AUTH_SCHEMES\["bearer:bearer::"\]/);
    assert.match(operationsFile, /path = path\.replace\("\{orderId\}", serialize_path_parameter\("orderId", order_id/);
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
    const nodeOperations = getFileContent(nodePreview, "src/api/operations.ts");
    assert.match(nodeOperations, /serializePathParameter\("ids", args\["ids"\], \{ location: "path", style: "simple", explode: false \}\)/);
    assert.match(nodeOperations, /appendSerializedParameter\(queryString, "filter", args\["filter"\], \{ location: "query", style: "deepObject", explode: true \}\)/);
    assert.match(nodeOperations, /appendSerializedParameter\(queryString, "tags", args\["tags"\], \{ location: "query", style: "pipeDelimited", explode: false \}\)/);
    assert.match(nodeOperations, /requestHeaders\["X-Fields"\] = serializeParameterValue\("X-Fields", args\["X_Fields"\], \{ location: "header", style: "simple", explode: false \}\)/);
    assert.match(nodeOperations, /cookiePairs\.push\(`prefs=\$\{encodeURIComponent\(serializeParameterValue\("prefs", args\["prefs"\], \{ location: "cookie", style: "form", explode: false \}\)\)\}`\)/);

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
    const operationsFile = getFileContent(pythonPreview, "src/operations.py");
    assert.match(operationsFile, /serialize_path_parameter\("ids", ids, \{ "location": "path", "style": "simple", "explode": False \}\)/);
    assert.match(operationsFile, /append_serialized_parameter\(params, "filter", filter, \{ "location": "query", "style": "deepObject", "explode": True \}\)/);
    assert.match(operationsFile, /append_serialized_parameter\(params, "tags", tags, \{ "location": "query", "style": "pipeDelimited", "explode": False \}\)/);
    assert.match(operationsFile, /request_headers\["X-Fields"\] = serialize_parameter_value\("X-Fields", X_Fields, \{ "location": "header", "style": "simple", "explode": False \}\)/);
    assert.match(operationsFile, /cookies\["prefs"\] = serialize_parameter_value\("prefs", prefs, \{ "location": "cookie", "style": "form", "explode": False \}\)/);
});

test("node preview emits per-operation auth requirements and skips duplicate auth headers", () => {
    const apiModel = buildOpenAPIModel({
        openapi: "3.1.0",
        info: { title: "Auth API", version: "1.0.0" },
        components: {
            securitySchemes: {
                bearerAuth: { type: "http", scheme: "bearer" },
                basicAuth: { type: "http", scheme: "basic" },
                headerKey: { type: "apiKey", in: "header", name: "X-API-Key" },
                queryKey: { type: "apiKey", in: "query", name: "api_key" },
                cookieKey: { type: "apiKey", in: "cookie", name: "session" },
            },
        },
        security: [{ bearerAuth: [] }],
        paths: {
            "/global": {
                get: {
                    operationId: "globalAuth",
                    responses: { "200": { description: "OK" } },
                },
            },
            "/operation": {
                get: {
                    operationId: "operationAuth",
                    security: [{ queryKey: [] }],
                    responses: { "200": { description: "OK" } },
                },
            },
            "/public": {
                get: {
                    operationId: "publicOperation",
                    security: [],
                    responses: { "200": { description: "OK" } },
                },
            },
            "/alternatives": {
                get: {
                    operationId: "alternativeAuth",
                    security: [{ cookieKey: [] }, { basicAuth: [] }],
                    responses: { "200": { description: "OK" } },
                },
            },
            "/duplicate": {
                get: {
                    operationId: "duplicateHeaderAuth",
                    security: [{ headerKey: [] }],
                    parameters: [
                        { name: "X-API-Key", in: "header", schema: { type: "string" } },
                    ],
                    responses: { "200": { description: "OK" } },
                },
            },
        },
    });
    const preview = createPreviewResponse({
        spec: {
            info: apiModel.info,
            baseUrl: "https://auth.example.com",
            apiModel,
        },
        tools: apiModel.operations.map((operation) => ({
            endpointId: operation.id,
            enabled: true,
            toolName: operation.operationId || operation.id,
            description: operation.summary || operation.id,
            parameters: [],
        })),
        serverConfig: {
            name: "auth-mcp",
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

    const configFile = getFileContent(preview, "src/config.ts");
    const clientFile = getFileContent(preview, "src/api/client.ts");
    const operationsFile = getFileContent(preview, "src/api/operations.ts");

    assert.match(configFile, /BEARER_AUTH_TOKEN/);
    assert.match(configFile, /QUERY_KEY_API_KEY/);
    assert.match(configFile, /COOKIE_KEY_API_KEY/);
    assert.match(configFile, /BASIC_AUTH_USERNAME/);
    assert.match(clientFile, /queryString\.has\(scheme\.name\)/);
    assert.match(clientFile, /hasCookie\(cookiePairs, scheme\.name\)/);
    assert.match(clientFile, /hasHeader\(headers, scheme\.name\)/);
    assert.match(operationsFile, /AUTH_SCHEMES\["bearerAuth:bearer::"\]/);
    assert.match(operationsFile, /AUTH_SCHEMES\["queryKey:apiKeyQuery:query:api_key"\]/);
    assert.match(operationsFile, /applyAuth\(queryString, requestHeaders, cookiePairs, \[\]\)/);
    assert.match(operationsFile, /AUTH_SCHEMES\["cookieKey:apiKeyCookie:cookie:session"\]/);
    assert.match(operationsFile, /AUTH_SCHEMES\["basicAuth:basic::"\]/);
    assert.match(operationsFile, /requestHeaders\["X-API-Key"\] = serializeParameterValue\("X-API-Key", args\["X_API_Key"\]/);
    assert.match(operationsFile, /AUTH_SCHEMES\["headerKey:apiKeyHeader:header:X-API-Key"\]/);
});

test("generated auth helpers treat anonymous alternatives as no-op and do not partially apply AND auth", () => {
    const apiModel = buildOpenAPIModel({
        openapi: "3.1.0",
        info: { title: "Runtime Auth API", version: "1.0.0" },
        components: {
            securitySchemes: {
                bearerAuth: { type: "http", scheme: "bearer" },
            },
        },
        paths: {
            "/optional": {
                get: {
                    operationId: "optionalAuth",
                    security: [{}, { bearerAuth: [] }],
                    responses: { "200": { description: "OK" } },
                },
            },
        },
    });
    const baseRequest: Omit<GeneratorRequest, "exportConfig"> = {
        spec: {
            info: apiModel.info,
            baseUrl: "https://auth.example.com",
            apiModel,
        },
        tools: [{
            endpointId: "GET-/optional",
            enabled: true,
            toolName: "optionalAuth",
            description: "Optional auth",
            parameters: [],
        }],
        serverConfig: {
            name: "runtime-auth-mcp",
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
    const nodeAuth = loadNodeAuthHelpers(getFileContent(nodePreview, "src/api/client.ts"));
    const optionalQuery = new URLSearchParams();
    const optionalHeaders: Record<string, string> = {};
    const optionalCookies: string[] = [];
    nodeAuth.applyAuth(optionalQuery, optionalHeaders, optionalCookies, [
        { schemes: [] },
        { schemes: [{ type: "bearer", token: "secret" }] },
    ]);
    assert.equal(optionalQuery.toString(), "");
    assert.deepEqual(optionalHeaders, {});
    assert.deepEqual(optionalCookies, []);

    const partialQuery = new URLSearchParams();
    const partialHeaders: Record<string, string> = {};
    const partialCookies: string[] = [];
    nodeAuth.applyAuth(partialQuery, partialHeaders, partialCookies, [{
        schemes: [
            { type: "apiKey", in: "header", name: "X-API-Key", value: "key" },
            { type: "bearer", token: "" },
        ],
    }]);
    assert.equal(partialQuery.toString(), "");
    assert.deepEqual(partialHeaders, {});
    assert.deepEqual(partialCookies, []);

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
    const pythonCases = runPythonAuthCases(getFileContent(pythonPreview, "src/api_client.py"));
    assert.deepEqual(pythonCases, {
        optional: { params: [], headers: {}, cookies: {} },
        partial_and: { params: [], headers: {}, cookies: {} },
    });
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
    const nodeHelpers = loadNodeSerializationHelpers(getFileContent(nodePreview, "src/api/serialization.ts"));
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
    const pythonCases = runPythonSerializationCases(getFileContent(pythonPreview, "src/serialization.py"));
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
    const operationsFile = getFileContent(preview, "src/api/operations.ts");
    assert.match(operationsFile, /const formBody = new URLSearchParams\(\);/);
    assert.match(operationsFile, /requestHeaders\["Content-Type"\] = "application\/x-www-form-urlencoded"/);
    assert.match(operationsFile, /cookiePairs\.push\(`sessionId=/);
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
    const nodeServer = getFileContent(nodePreview, "src/mcp/server.ts");
    const nodeOperations = getFileContent(nodePreview, "src/api/operations.ts");
    assert.match(nodeServer, /"file": z\.string\(\)\.describe\("Base64-encoded file content\."\)/);
    assert.match(nodeOperations, /const fileBytes = Buffer\.from\(String\(args\["file"\]\), "base64"\);/);
    assert.match(nodeOperations, /formBody\.append\("file", new Blob\(\[fileBytes\]\), "file"\);/);
    assert.match(nodeOperations, /formBody\.append\("label", String\(args\["label"\]\)\);/);

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
    const operationsFile = getFileContent(pythonPreview, "src/operations.py");
    assert.match(operationsFile, /import base64/);
    assert.match(operationsFile, /multipart_files\["file"\] = \("file", base64\.b64decode\(file\), "application\/octet-stream"\)/);
    assert.match(operationsFile, /multipart_files\["label"\] = \(None, str\(label\)\)/);
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
