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
    assert.equal(plan.requestBodyStrategy.contentKind, "flattenedObject");
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

test("planner preserves global auth, operation auth, no-auth overrides, alternatives, and api key locations", () => {
    const apiModel = buildOpenAPIModel({
        openapi: "3.1.0",
        info: { title: "Auth", version: "1.0.0" },
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
            "/and": {
                get: {
                    operationId: "andAuth",
                    security: [{ headerKey: [], bearerAuth: [] }],
                    responses: { "200": { description: "OK" } },
                },
            },
            "/optional": {
                get: {
                    operationId: "optionalAuth",
                    security: [{}, { bearerAuth: [] }],
                    responses: { "200": { description: "OK" } },
                },
            },
        },
    });

    const plans = Object.fromEntries(buildToolPlans(apiModel).map((plan) => [plan.toolName, plan]));

    assert.equal(plans.globalAuth.authStrategy.strategy, "bearer");
    assert.equal(plans.globalAuth.authStrategy.source, "global");
    assert.deepEqual(plans.globalAuth.authStrategy.requirements?.[0].schemes.map((scheme) => scheme.schemeName), ["bearerAuth"]);

    assert.equal(plans.operationAuth.authStrategy.strategy, "apiKeyQuery");
    assert.equal(plans.operationAuth.authStrategy.source, "operation");
    assert.equal(plans.operationAuth.authStrategy.apiKeyName, "api_key");

    assert.equal(plans.publicOperation.authStrategy.strategy, "none");
    assert.equal(plans.publicOperation.authStrategy.source, "operation");
    assert.deepEqual(plans.publicOperation.authStrategy.requirements, []);

    assert.equal(plans.alternativeAuth.authStrategy.strategy, "apiKeyCookie");
    assert.equal(plans.alternativeAuth.authStrategy.apiKeyLocation, "cookie");
    assert.deepEqual(
        plans.alternativeAuth.authStrategy.requirements?.map((requirement) => requirement.schemes.map((scheme) => scheme.strategy)),
        [["apiKeyCookie"], ["basic"]]
    );

    assert.deepEqual(
        plans.andAuth.authStrategy.requirements?.[0].schemes.map((scheme) => scheme.strategy),
        ["apiKeyHeader", "bearer"]
    );

    assert.equal(plans.optionalAuth.authStrategy.strategy, "none");
    assert.equal(plans.optionalAuth.authStrategy.source, "operation");
    assert.deepEqual(
        plans.optionalAuth.authStrategy.requirements?.map((requirement) => requirement.schemes.map((scheme) => scheme.strategy)),
        [[], ["bearer"]]
    );
});

test("planner only flattens shallow simple JSON object bodies", () => {
    const apiModel = buildOpenAPIModel({
        openapi: "3.1.0",
        info: { title: "Bodies", version: "1.0.0" },
        paths: {
            "/nested": {
                post: {
                    operationId: "nestedBody",
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
                                },
                            },
                        },
                    },
                    responses: { "200": { description: "OK" } },
                },
            },
            "/union": {
                post: {
                    operationId: "unionBody",
                    requestBody: {
                        content: {
                            "application/json": {
                                schema: {
                                    oneOf: [
                                        { type: "object", properties: { email: { type: "string" } } },
                                        { type: "object", properties: { phone: { type: "string" } } },
                                    ],
                                },
                            },
                        },
                    },
                    responses: { "200": { description: "OK" } },
                },
            },
            "/map": {
                post: {
                    operationId: "mapBody",
                    requestBody: {
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    additionalProperties: { type: "string" },
                                },
                            },
                        },
                    },
                    responses: { "200": { description: "OK" } },
                },
            },
            "/array": {
                post: {
                    operationId: "arrayBody",
                    requestBody: {
                        content: {
                            "application/json": {
                                schema: {
                                    type: "array",
                                    items: { type: "string" },
                                },
                            },
                        },
                    },
                    responses: { "200": { description: "OK" } },
                },
            },
        },
    });

    const plans = buildToolPlans(apiModel);
    const byName = Object.fromEntries(plans.map((plan) => [plan.toolName, plan]));

    for (const name of ["nestedBody", "unionBody", "mapBody"]) {
        assert.equal(byName[name].requestBodyStrategy.contentKind, "rawJsonObject");
        assert.deepEqual(byName[name].parameters.map((param) => [param.argName, param.sourceName, param.location]), [
            ["body", "body", "body"],
        ]);
    }

    assert.equal(byName.arrayBody.requestBodyStrategy.contentKind, "rawArray");
    assert.deepEqual(byName.arrayBody.parameters.map((param) => [param.argName, param.sourceName, param.location]), [
        ["body", "body", "body"],
    ]);
});

test("planner classifies non-json request body strategies", () => {
    const apiModel = buildOpenAPIModel({
        openapi: "3.1.0",
        info: { title: "Media", version: "1.0.0" },
        paths: {
            "/text": {
                post: {
                    operationId: "textBody",
                    requestBody: {
                        content: {
                            "text/plain": {
                                schema: { type: "string" },
                            },
                        },
                    },
                    responses: { "200": { description: "OK" } },
                },
            },
            "/form": {
                post: {
                    operationId: "formBody",
                    requestBody: {
                        content: {
                            "application/x-www-form-urlencoded": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        username: { type: "string" },
                                        remember: { type: "boolean" },
                                    },
                                },
                            },
                        },
                    },
                    responses: { "200": { description: "OK" } },
                },
            },
            "/multipart": {
                post: {
                    operationId: "multipartBody",
                    requestBody: {
                        content: {
                            "multipart/form-data": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        file: { type: "string", format: "binary" },
                                        label: { type: "string" },
                                    },
                                },
                            },
                        },
                    },
                    responses: { "200": { description: "OK" } },
                },
            },
        },
    });

    const plans = buildToolPlans(apiModel);
    const byName = Object.fromEntries(plans.map((plan) => [plan.toolName, plan]));

    assert.equal(byName.textBody.requestBodyStrategy.contentKind, "text");
    assert.deepEqual(byName.textBody.parameters.map((param) => param.argName), ["body"]);
    assert.equal(byName.formBody.requestBodyStrategy.contentKind, "formUrlencoded");
    assert.deepEqual(byName.formBody.parameters.map((param) => param.argName), ["username", "remember"]);
    assert.equal(byName.multipartBody.requestBodyStrategy.contentKind, "multipart");
    assert.deepEqual(byName.multipartBody.parameters.map((param) => param.argName), ["file", "label"]);
    assert.equal(byName.multipartBody.parameters[0].description, "Base64-encoded file content.");
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

    const plan = buildGenerationPlan(request);
    const [tool] = plan.tools;

    assert.deepEqual(tool.params.map((param) => [param.argName, param.sourceName, param.location]), [
        ["itemId", "itemId", "path"],
        ["name", "name", "body"],
    ]);
    assert.equal(tool.requestBody?.contentKind, "flattenedObject");
});

test("generation merges UI choices onto canonical operations without replacing API metadata", () => {
    const apiModel = buildOpenAPIModel({
        openapi: "3.1.0",
        info: { title: "Catalog", version: "1.0.0" },
        paths: {
            "/items/{itemId}": {
                post: {
                    operationId: "create-item",
                    parameters: [
                        { name: "itemId", in: "path", required: true, schema: { type: "string" } },
                        { name: "include", in: "query", required: false, schema: { type: "array", items: { type: "string" } } },
                    ],
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        name: { type: "string", description: "Canonical name" },
                                        count: { type: "integer", description: "Canonical count" },
                                    },
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
            toolName: "createCatalogItem",
            description: "Create a catalog item from UI",
            bodyContentType: "text/plain",
            parameters: [
                {
                    name: "itemId",
                    originalName: "itemId",
                    type: "string",
                    required: true,
                    description: "Crafted hidden path id",
                    location: "path",
                    hidden: true,
                },
                {
                    name: "item",
                    originalName: "name",
                    type: "number",
                    required: false,
                    description: "UI item name",
                    location: "query",
                    schema: { type: "number" },
                },
                {
                    name: "include",
                    originalName: "include",
                    type: "string",
                    required: true,
                    description: "Hidden UI include",
                    location: "query",
                    hidden: true,
                },
            ],
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

    const plan = buildGenerationPlan(request);
    const [tool] = plan.tools;

    assert.equal(tool.displayName, "createCatalogItem");
    assert.equal(tool.description, "Create a catalog item from UI");
    assert.equal(tool.requestBody?.contentType, "application/json");
    assert.deepEqual(tool.params.map((param) => [param.argName, param.sourceName, param.location, param.type, param.required, param.description]), [
        ["itemId", "itemId", "path", "string", true, "Crafted hidden path id"],
        ["name", "name", "body", "string", true, "Canonical name"],
        ["count", "count", "body", "integer", false, "Canonical count"],
    ]);
    assert.match(plan.warnings.join("\n"), /Ignored hidden override for required path parameter "itemId"/);
    assert.match(plan.warnings.join("\n"), /Ignored UI parameter override with mismatched location for "name"/);
});

test("generation ignores ambiguous parameter override fallback matches", () => {
    const apiModel = buildOpenAPIModel({
        openapi: "3.1.0",
        info: { title: "Search", version: "1.0.0" },
        paths: {
            "/items": {
                get: {
                    operationId: "search-items",
                    parameters: [
                        {
                            name: "id",
                            in: "query",
                            required: false,
                            schema: { type: "string" },
                            description: "Canonical query id",
                        },
                    ],
                    responses: { "200": { description: "OK" } },
                },
            },
        },
    });
    const request: GeneratorRequest = {
        spec: {
            info: apiModel.info,
            baseUrl: "https://search.example.com",
            apiModel,
        },
        tools: [{
            endpointId: "GET-/items",
            enabled: true,
            toolName: "searchItems",
            description: "Search items",
            parameters: [
                {
                    name: "headerId",
                    originalName: "id",
                    type: "number",
                    required: true,
                    description: "Wrong header id",
                    hidden: true,
                },
                {
                    name: "cookieId",
                    originalName: "id",
                    type: "boolean",
                    required: true,
                    description: "Wrong cookie id",
                },
            ],
        }],
        serverConfig: {
            name: "search",
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

    const plan = buildGenerationPlan(request);
    const [tool] = plan.tools;

    assert.deepEqual(tool.params.map((param) => [param.argName, param.sourceName, param.location, param.type, param.required, param.description]), [
        ["id", "id", "query", "string", false, "Canonical query id"],
    ]);
    assert.match(plan.warnings.join("\n"), /Ignored ambiguous UI parameter override for "id"/);
});

test("generation ignores single wrong-location parameter override", () => {
    const apiModel = buildOpenAPIModel({
        openapi: "3.1.0",
        info: { title: "Search", version: "1.0.0" },
        paths: {
            "/items": {
                get: {
                    operationId: "search-items",
                    parameters: [
                        {
                            name: "id",
                            in: "query",
                            required: false,
                            schema: { type: "string" },
                            description: "Canonical query id",
                        },
                    ],
                    responses: { "200": { description: "OK" } },
                },
            },
        },
    });
    const request: GeneratorRequest = {
        spec: {
            info: apiModel.info,
            baseUrl: "https://search.example.com",
            apiModel,
        },
        tools: [{
            endpointId: "GET-/items",
            enabled: true,
            toolName: "searchItems",
            description: "Search items",
            parameters: [{
                name: "headerId",
                originalName: "id",
                type: "number",
                required: true,
                description: "Wrong header id",
                location: "header",
                hidden: true,
            }],
        }],
        serverConfig: {
            name: "search",
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

    const plan = buildGenerationPlan(request);
    const [tool] = plan.tools;

    assert.deepEqual(tool.params.map((param) => [param.argName, param.sourceName, param.location, param.type, param.required, param.description]), [
        ["id", "id", "query", "string", false, "Canonical query id"],
    ]);
    assert.match(plan.warnings.join("\n"), /Ignored UI parameter override with mismatched location for "id"/);
});

test("generation allows no-location legacy parameter override fallback", () => {
    const apiModel = buildOpenAPIModel({
        openapi: "3.1.0",
        info: { title: "Search", version: "1.0.0" },
        paths: {
            "/items": {
                get: {
                    operationId: "search-items",
                    parameters: [
                        {
                            name: "id",
                            in: "query",
                            required: false,
                            schema: { type: "string" },
                            description: "Canonical query id",
                        },
                    ],
                    responses: { "200": { description: "OK" } },
                },
            },
        },
    });
    const request: GeneratorRequest = {
        spec: {
            info: apiModel.info,
            baseUrl: "https://search.example.com",
            apiModel,
        },
        tools: [{
            endpointId: "GET-/items",
            enabled: true,
            toolName: "searchItems",
            description: "Search items",
            parameters: [{
                name: "searchId",
                originalName: "id",
                type: "number",
                required: true,
                description: "Legacy id",
            }],
        }],
        serverConfig: {
            name: "search",
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

    assert.deepEqual(tool.params.map((param) => [param.argName, param.sourceName, param.location, param.type, param.required, param.description]), [
        ["searchId", "id", "query", "string", false, "Legacy id"],
    ]);
});
