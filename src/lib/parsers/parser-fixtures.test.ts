import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseOpenAPIFromContent } from "./openapi.ts";
import type { ApiModel, ApiOperation } from "../api-model/types.ts";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

async function parseFixture(filename: string) {
    const content = await readFile(join(fixturesDir, filename), "utf8");
    const parsed = await parseOpenAPIFromContent(content, filename);
    assert.ok(parsed.apiModel);
    return {
        parsed,
        model: parsed.apiModel as ApiModel,
    };
}

function operation(model: ApiModel, operationId: string): ApiOperation {
    const found = model.operations.find((candidate) => candidate.operationId === operationId);
    assert.ok(found, `Expected operation ${operationId}`);
    return found;
}

test("parser fixture: simple REST API", async () => {
    const { parsed, model } = await parseFixture("simple-rest-api.openapi.json");

    assert.equal(parsed.format, "openapi");
    assert.equal(parsed.info.title, "Acme Users API");
    assert.equal(parsed.baseUrl, "https://api.acme.test/v1");
    assert.deepEqual(
        parsed.endpoints.map((endpoint) => endpoint.operationId),
        ["listUsers", "getUser"]
    );
    assert.equal(operation(model, "listUsers").parameters[0].schema?.default, 25);
});

test("parser fixture: nested JSON body", async () => {
    const { parsed, model } = await parseFixture("nested-json-body.openapi.json");
    const createOrder = operation(model, "createOrder");
    const schema = createOrder.requestBody?.content[0].schema;
    const properties = schema?.properties as Record<string, Record<string, unknown>>;
    const customer = properties.customer as Record<string, unknown>;
    const customerProperties = customer.properties as Record<string, Record<string, unknown>>;

    assert.equal(parsed.endpoints[0].requestBody?.contentType, "application/json");
    assert.equal(createOrder.requestBody?.required, true);
    assert.deepEqual(schema?.required, ["customer", "items"]);
    assert.equal(customerProperties.address.type, "object");
    assert.equal((properties.items as Record<string, unknown>).type, "array");
});

test("parser fixture: path-level params", async () => {
    const { model } = await parseFixture("path-level-params.openapi.json");
    const getProject = operation(model, "getProject");
    const deleteProject = operation(model, "deleteProject");

    assert.deepEqual(
        getProject.parameters.map((parameter) => [parameter.name, parameter.in, parameter.source?.level]),
        [
            ["orgId", "path", "path"],
            ["projectId", "path", "path"],
            ["include", "query", "operation"],
        ]
    );
    assert.deepEqual(
        deleteProject.parameters.map((parameter) => parameter.name),
        ["orgId", "projectId"]
    );
});

test("parser fixture: array query params", async () => {
    const { parsed, model } = await parseFixture("array-query-params.openapi.json");
    const search = operation(model, "searchCatalog");
    const tags = search.parameters.find((parameter) => parameter.name === "tags");
    const ids = search.parameters.find((parameter) => parameter.name === "ids");

    assert.equal(parsed.endpoints[0].parameters.find((parameter) => parameter.name === "tags")?.type, "string[]");
    assert.equal(parsed.endpoints[0].parameters.find((parameter) => parameter.name === "ids")?.type, "integer[]");
    assert.equal(tags?.style, "form");
    assert.equal(tags?.explode, true);
    assert.equal(ids?.explode, false);
});

test("parser fixture: bearer auth", async () => {
    const { model } = await parseFixture("bearer-auth.openapi.json");

    assert.deepEqual(model.security, [{ bearerAuth: [] }]);
    assert.equal(model.securitySchemes.bearerAuth.type, "http");
    assert.equal(model.securitySchemes.bearerAuth.scheme, "bearer");
    assert.equal(operation(model, "getCurrentUser").security, undefined);
});

test("parser fixture: API key auth", async () => {
    const { model } = await parseFixture("api-key-auth.openapi.json");

    assert.equal(model.securitySchemes.headerKey.in, "header");
    assert.equal(model.securitySchemes.headerKey.name, "X-API-Key");
    assert.equal(model.securitySchemes.queryKey.in, "query");
    assert.deepEqual(operation(model, "listReports").security, [{ headerKey: [] }]);
    assert.deepEqual(operation(model, "getPublicStatus").security, []);
});

test("parser fixture: multipart upload", async () => {
    const { parsed, model } = await parseFixture("multipart-upload.openapi.json");
    const upload = operation(model, "uploadAsset");
    const media = upload.requestBody?.content[0];
    const properties = media?.schema?.properties as Record<string, Record<string, unknown>>;

    assert.equal(parsed.endpoints[0].requestBody?.contentType, "multipart/form-data");
    assert.equal(media?.mediaType, "multipart/form-data");
    assert.equal(properties.file.format, "binary");
    assert.deepEqual(media?.encoding?.metadata, { contentType: "application/json" });
});

test("parser fixture: Postman collection with variables", async () => {
    const { parsed, model } = await parseFixture("postman-variables.collection.json");
    const getOrder = operation(model, "getOrder");

    assert.equal(parsed.format, "postman");
    assert.equal(parsed.baseUrl, "https://postman.acme.test");
    assert.equal(getOrder.path, "/v2/orders/{orderId}");
    assert.deepEqual(
        getOrder.parameters.map((parameter) => [parameter.name, parameter.in, parameter.schema?.example]),
        [
            ["orderId", "path", undefined],
            ["include", "query", "items"],
            ["tenant", "query", "acme"],
            ["expand", "query", "customer"],
        ]
    );
});

test("parser fixture: Postman collection with folder auth", async () => {
    const { model } = await parseFixture("postman-folder-auth.collection.json");
    const listAdminUsers = operation(model, "listAdminUsers");
    const publicPing = operation(model, "publicPing");

    assert.deepEqual(model.security, [{ apiKey: [] }]);
    assert.equal(model.securitySchemes.apiKey.name, "X-Collection-Key");
    assert.equal(model.securitySchemes.bearer.scheme, "bearer");
    assert.deepEqual(listAdminUsers.security, [{ bearer: [] }]);
    assert.deepEqual(listAdminUsers.tags, ["Admin"]);
    assert.equal(listAdminUsers.parameters.some((parameter) => parameter.name === "Authorization"), false);
    assert.equal(listAdminUsers.parameters.find((parameter) => parameter.name === "X-Trace-Id")?.schema?.example, "trace_123");
    assert.deepEqual(publicPing.security, []);
});

test("parser fixture: Swagger 2.0 body param", async () => {
    const { parsed, model } = await parseFixture("swagger2-body-param.swagger.json");
    const createPet = operation(model, "createPet");
    const response = createPet.responses[0];

    assert.equal(parsed.format, "openapi");
    assert.equal(model.source.version, "2.0");
    assert.equal(parsed.baseUrl, "https://legacy-pets.acme.test/api");
    assert.equal(createPet.requestBody?.content[0].mediaType, "application/json");
    assert.deepEqual(createPet.requestBody?.content[0].schema?.required, ["name"]);
    assert.equal(response.content?.[0].mediaType, "application/json");
});
