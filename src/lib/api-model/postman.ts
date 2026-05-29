import type {
    ApiMediaType,
    ApiModel,
    ApiOperation,
    ApiParameter,
    ApiRequestBody,
    ApiResponse,
    ApiSecurityRequirement,
    ApiSourceMetadata,
} from "./types";

export interface PostmanCollection {
    info: {
        name: string;
        description?: string;
        schema: string;
        version?: string | { major?: number; minor?: number; patch?: number; identifier?: string };
    };
    item: PostmanItem[];
    variable?: PostmanVariable[];
    auth?: PostmanAuth;
}

export interface PostmanItem {
    name: string;
    description?: string;
    request?: PostmanRequest;
    item?: PostmanItem[];
    response?: PostmanResponse[];
}

export interface PostmanRequest {
    method: string;
    header?: PostmanHeader[];
    body?: PostmanBody;
    url: PostmanUrl | string;
    description?: string;
    auth?: PostmanAuth;
}

export interface PostmanUrl {
    raw?: string;
    protocol?: string;
    host?: string[];
    path?: string[];
    query?: PostmanQuery[];
    variable?: PostmanVariable[];
}

interface PostmanHeader {
    key: string;
    value?: string;
    description?: string;
    disabled?: boolean;
}

interface PostmanQuery {
    key: string;
    value?: string;
    description?: string;
    disabled?: boolean;
}

interface PostmanVariable {
    key: string;
    value?: string;
    description?: string;
}

interface PostmanBody {
    mode: "raw" | "formdata" | "urlencoded" | "file" | "graphql";
    raw?: string;
    formdata?: Array<{ key: string; value?: string; type?: string; description?: string; disabled?: boolean }>;
    urlencoded?: Array<{ key: string; value?: string; description?: string; disabled?: boolean }>;
    file?: { src?: string | string[] };
    graphql?: { query?: string; variables?: string };
    options?: { raw?: { language?: string } };
}

interface PostmanAuth {
    type: string;
    apikey?: { key: string; value: string }[];
    bearer?: { key: string; value: string }[];
    basic?: { key: string; value: string }[];
}

interface PostmanResponse {
    name: string;
    status?: string;
    code?: number;
    header?: PostmanHeader[];
    body?: string;
}

function versionToString(version?: PostmanCollection["info"]["version"]): string {
    if (!version) return "1.0.0";
    if (typeof version === "string") return version;

    const parts = [version.major, version.minor, version.patch]
        .filter((part): part is number => typeof part === "number");
    return parts.length > 0 ? parts.join(".") : version.identifier || "1.0.0";
}

function inferSchema(value: unknown): Record<string, unknown> {
    if (Array.isArray(value)) {
        return { type: "array", items: value.length > 0 ? inferSchema(value[0]) : { type: "string" } };
    }

    if (typeof value === "object" && value !== null) {
        const properties: Record<string, unknown> = {};
        const required: string[] = [];
        for (const [key, nested] of Object.entries(value)) {
            properties[key] = inferSchema(nested);
            required.push(key);
        }
        return { type: "object", properties, required };
    }

    if (typeof value === "number") return { type: Number.isInteger(value) ? "integer" : "number", example: value };
    if (typeof value === "boolean") return { type: "boolean", example: value };
    return { type: "string", example: value };
}

function extractBaseUrl(collection: PostmanCollection): string {
    const baseUrlVar = collection.variable?.find((variable) =>
        ["baseUrl", "base_url", "host"].includes(variable.key)
    );
    if (baseUrlVar?.value) return baseUrlVar.value;

    const firstRequest = findFirstRequest(collection.item);
    if (!firstRequest?.request?.url) return "";

    const url = firstRequest.request.url;
    if (typeof url === "string") {
        try {
            const parsed = new URL(url);
            return `${parsed.protocol}//${parsed.host}`;
        } catch {
            return url.split("/").slice(0, 3).join("/");
        }
    }

    if (url.host) {
        return `${url.protocol || "https"}://${url.host.join(".")}`;
    }

    return "";
}

function findFirstRequest(items: PostmanItem[]): PostmanItem | null {
    for (const item of items) {
        if (item.request) return item;
        if (item.item) {
            const found = findFirstRequest(item.item);
            if (found) return found;
        }
    }
    return null;
}

function normalizePath(path: string): { path: string; params: ApiParameter[] } {
    const params: ApiParameter[] = [];
    let normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const matches = normalizedPath.match(/[:{}]([^/}]+)[}]?/g) || [];

    for (const match of matches) {
        const name = match.replace(/[:{}/]/g, "");
        if (!params.some((param) => param.name === name)) {
            params.push({
                name,
                in: "path",
                required: true,
                schema: { type: "string" },
                style: "simple",
                explode: false,
                source: { level: "operation" },
            });
        }
        normalizedPath = normalizedPath.replace(match, `{${name}}`);
    }

    return { path: normalizedPath, params };
}

function parseUrl(url: PostmanUrl | string): { path: string; parameters: ApiParameter[] } {
    const queryParameters: ApiParameter[] = [];
    let path = "/";

    if (typeof url === "string") {
        try {
            const parsed = new URL(url);
            path = parsed.pathname || "/";
            parsed.searchParams.forEach((value, key) => {
                queryParameters.push({
                    name: key,
                    in: "query",
                    required: false,
                    schema: { type: "string", example: value },
                    style: "form",
                    explode: true,
                    source: { level: "operation" },
                });
            });
        } catch {
            const [pathPart, queryPart] = url.split("?");
            path = pathPart || "/";
            if (queryPart) {
                for (const part of queryPart.split("&")) {
                    const [key, value] = part.split("=");
                    if (!key) continue;
                    queryParameters.push({
                        name: key,
                        in: "query",
                        required: false,
                        schema: { type: "string", example: value },
                        style: "form",
                        explode: true,
                        source: { level: "operation" },
                    });
                }
            }
        }
    } else {
        path = url.path ? `/${url.path.join("/")}` : "/";
        for (const query of url.query || []) {
            if (query.disabled) continue;
            queryParameters.push({
                name: query.key,
                in: "query",
                required: false,
                description: query.description,
                schema: { type: "string", example: query.value },
                style: "form",
                explode: true,
                source: { level: "operation" },
            });
        }
    }

    const normalized = normalizePath(path);
    return { path: normalized.path, parameters: [...normalized.params, ...queryParameters] };
}

function mediaTypeFromBody(body: PostmanBody): ApiMediaType {
    if (body.mode === "raw") {
        const language = body.options?.raw?.language;
        if (language === "json" && body.raw) {
            try {
                const parsed = JSON.parse(body.raw);
                return { mediaType: "application/json", schema: inferSchema(parsed), example: parsed };
            } catch {
                return { mediaType: "application/json", schema: { type: "string" }, example: body.raw };
            }
        }

        return { mediaType: language === "text" ? "text/plain" : "text/plain", schema: { type: "string" }, example: body.raw };
    }

    if (body.mode === "urlencoded") {
        const properties: Record<string, unknown> = {};
        const required: string[] = [];
        for (const field of body.urlencoded || []) {
            if (field.disabled) continue;
            properties[field.key] = { type: "string", description: field.description, example: field.value };
            required.push(field.key);
        }
        return { mediaType: "application/x-www-form-urlencoded", schema: { type: "object", properties, required } };
    }

    if (body.mode === "formdata") {
        const properties: Record<string, unknown> = {};
        const required: string[] = [];
        for (const field of body.formdata || []) {
            if (field.disabled) continue;
            properties[field.key] = {
                type: "string",
                format: field.type === "file" ? "binary" : undefined,
                description: field.description,
                example: field.value,
            };
            required.push(field.key);
        }
        return { mediaType: "multipart/form-data", schema: { type: "object", properties, required } };
    }

    if (body.mode === "file") {
        return { mediaType: "application/octet-stream", schema: { type: "string", format: "binary" }, example: body.file?.src };
    }

    return {
        mediaType: "application/json",
        schema: {
            type: "object",
            properties: { query: { type: "string" }, variables: { type: "string" } },
            required: ["query"],
        },
        example: body.graphql,
    };
}

function normalizeRequestBody(body?: PostmanBody): ApiRequestBody | undefined {
    if (!body) return undefined;
    return {
        required: true,
        content: [mediaTypeFromBody(body)],
    };
}

function normalizeResponses(responses?: PostmanResponse[]): ApiResponse[] {
    return (responses || []).map((response) => ({
        statusCode: String(response.code || "default"),
        description: response.status || response.name,
        headers: response.header
            ? Object.fromEntries(response.header.filter((header) => !header.disabled).map((header) => [
                header.key,
                {
                    description: header.description,
                    schema: { type: "string", example: header.value },
                },
            ]))
            : undefined,
        content: response.body
            ? [{ mediaType: "application/json", schema: { type: "string" }, example: response.body }]
            : undefined,
    }));
}

function securityFromAuth(auth?: PostmanAuth): {
    schemes: ApiModel["securitySchemes"];
    requirements: ApiSecurityRequirement[];
} {
    if (!auth) return { schemes: {}, requirements: [] };

    if (auth.type === "apikey") {
        return {
            schemes: {
                apiKey: {
                    type: "apiKey",
                    in: auth.apikey?.find((item) => item.key === "in")?.value || "header",
                    name: auth.apikey?.find((item) => item.key === "key")?.value || "X-API-Key",
                },
            },
            requirements: [{ apiKey: [] }],
        };
    }

    if (auth.type === "bearer") {
        return { schemes: { bearer: { type: "http", scheme: "bearer" } }, requirements: [{ bearer: [] }] };
    }

    if (auth.type === "basic") {
        return { schemes: { basic: { type: "http", scheme: "basic" } }, requirements: [{ basic: [] }] };
    }

    return { schemes: {}, requirements: [] };
}

function operationId(method: string, path: string, name: string): string {
    const cleanName = name
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .map((word, index) => index === 0 ? word : `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
        .join("");

    if (cleanName) return cleanName;

    return `${method.toLowerCase()}${path.split("/").filter(Boolean).map((part) =>
        part.startsWith("{") ? `By${part.slice(1, -1)}` : `${part.charAt(0).toUpperCase()}${part.slice(1)}`
    ).join("")}`;
}

export function buildPostmanApiModel(
    collection: PostmanCollection,
    source: Partial<ApiSourceMetadata> = {}
): ApiModel {
    const baseUrl = extractBaseUrl(collection);
    const collectionAuth = securityFromAuth(collection.auth);
    const operations: ApiOperation[] = [];
    let id = 0;

    function visit(item: PostmanItem, folderPath: string[] = []) {
        if (item.item) {
            for (const child of item.item) visit(child, [...folderPath, item.name]);
            return;
        }

        if (!item.request) return;

        const method = item.request.method.toUpperCase();
        if (!["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD", "TRACE"].includes(method)) return;

        const url = parseUrl(item.request.url);
        const headerParameters: ApiParameter[] = (item.request.header || [])
            .filter((header) => !header.disabled)
            .map((header) => ({
                name: header.key,
                in: "header",
                required: false,
                description: header.description,
                schema: { type: "string", example: header.value },
                style: "simple",
                explode: false,
                source: { level: "operation" },
            }));
        const requestAuth = securityFromAuth(item.request.auth);

        operations.push({
            id: `${method}::${url.path}::${id++}`,
            method: method as ApiOperation["method"],
            path: url.path,
            operationId: operationId(method, url.path, item.name),
            summary: item.name,
            description: item.description || item.request.description,
            tags: folderPath.length > 0 ? [folderPath[folderPath.length - 1]] : undefined,
            parameters: [...url.parameters, ...headerParameters],
            requestBody: normalizeRequestBody(item.request.body),
            responses: normalizeResponses(item.response),
            security: item.request.auth ? requestAuth.requirements : undefined,
            source: {
                name: item.name,
                folderPath,
            },
        });
    }

    for (const item of collection.item) visit(item);

    return {
        source: {
            format: "postman",
            version: versionToString(collection.info.version),
            name: collection.info.name,
            schemaUrl: collection.info.schema,
            ...source,
        },
        info: {
            title: collection.info.name,
            version: versionToString(collection.info.version),
            description: collection.info.description,
        },
        servers: baseUrl
            ? [{
                url: baseUrl,
                variables: Object.fromEntries((collection.variable || []).map((variable) => [
                    variable.key,
                    { default: variable.value || "", description: variable.description },
                ])),
            }]
            : [],
        baseUrls: baseUrl ? [baseUrl] : [],
        securitySchemes: collectionAuth.schemes,
        security: collectionAuth.requirements,
        operations,
    };
}
