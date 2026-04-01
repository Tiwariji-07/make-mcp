import { ParsedSpec, ParsedEndpoint, ParsedParameter } from "@/store/project-store";

// Postman Collection v2.1 Types
interface PostmanCollection {
    info: {
        name: string;
        description?: string;
        schema: string;
    };
    item: PostmanItem[];
    variable?: PostmanVariable[];
    auth?: PostmanAuth;
}

interface PostmanItem {
    name: string;
    description?: string;
    request?: PostmanRequest;
    item?: PostmanItem[]; // Nested folders
    response?: PostmanResponse[];
}

interface PostmanRequest {
    method: string;
    header?: PostmanHeader[];
    body?: PostmanBody;
    url: PostmanUrl | string;
    description?: string;
    auth?: PostmanAuth;
}

interface PostmanUrl {
    raw?: string;
    protocol?: string;
    host?: string[];
    path?: string[];
    query?: PostmanQuery[];
    variable?: PostmanVariable[];
}

interface PostmanHeader {
    key: string;
    value: string;
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
    options?: {
        raw?: {
            language?: string;
        };
    };
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
}

// Check if content is a Postman Collection
export function isPostmanCollection(content: unknown): content is PostmanCollection {
    if (typeof content !== "object" || content === null) return false;
    const obj = content as Record<string, unknown>;

    // Check for Postman schema identifier
    if (obj.info && typeof obj.info === "object") {
        const info = obj.info as Record<string, unknown>;
        if (typeof info.schema === "string" && info.schema.includes("postman")) {
            return true;
        }
    }

    // Check for item array (Postman structure)
    if (Array.isArray(obj.item) && obj.info) {
        return true;
    }

    return false;
}

// Parse Postman Collection to ParsedSpec format
export function parsePostmanCollection(collection: PostmanCollection): ParsedSpec {
    const endpoints: ParsedEndpoint[] = [];
    let idCounter = 0;

    // Extract base URL from collection variables
    const baseUrl = extractBaseUrl(collection);

    // Recursively process items
    function processItem(item: PostmanItem, parentPath: string[] = []) {
        if (item.item) {
            // This is a folder, process children
            const folderPath = [...parentPath, item.name];
            for (const child of item.item) {
                processItem(child, folderPath);
            }
        } else if (item.request) {
            // This is a request
            const endpoint = parseRequest(item, parentPath, idCounter++);
            if (endpoint) {
                endpoints.push(endpoint);
            }
        }
    }

    for (const item of collection.item) {
        processItem(item);
    }

    // Extract security schemes from auth
    const securitySchemes = extractSecuritySchemes(collection.auth);

    return {
        info: {
            title: collection.info.name,
            version: "1.0.0",
            description: collection.info.description,
        },
        baseUrl,
        endpoints,
        securitySchemes,
    };
}

function extractBaseUrl(collection: PostmanCollection): string {
    // Try to find base URL from variables
    if (collection.variable) {
        const baseUrlVar = collection.variable.find(
            (v) => v.key === "baseUrl" || v.key === "base_url" || v.key === "host"
        );
        if (baseUrlVar?.value) {
            return baseUrlVar.value;
        }
    }

    // Try to extract from first request
    if (collection.item.length > 0) {
        const firstRequest = findFirstRequest(collection.item);
        if (firstRequest?.request?.url) {
            const url = firstRequest.request.url;
            if (typeof url === "string") {
                try {
                    const parsed = new URL(url);
                    return `${parsed.protocol}//${parsed.host}`;
                } catch {
                    return url.split("/").slice(0, 3).join("/");
                }
            } else if (url.host) {
                const protocol = url.protocol || "https";
                return `${protocol}://${url.host.join(".")}`;
            }
        }
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

function parseRequest(
    item: PostmanItem,
    parentPath: string[],
    id: number
): ParsedEndpoint | null {
    if (!item.request) return null;

    const request = item.request;
    const method = request.method?.toUpperCase() || "GET";

    // Skip non-standard HTTP methods
    if (!["GET", "POST", "PUT", "DELETE", "PATCH"].includes(method)) {
        return null;
    }

    // Parse URL
    const { path, pathParams, queryParams } = parseUrl(request.url);

    // Parse headers
    const headerParams: ParsedParameter[] = (request.header || [])
        .filter((h) => !h.disabled)
        .map((h) => ({
            name: h.key,
            in: "header" as const,
            required: false,
            type: "string",
            description: h.description,
        }));

    // Combine parameters
    const parameters: ParsedParameter[] = [
        ...pathParams,
        ...queryParams,
        ...headerParams,
    ];

    // Parse request body
    let requestBody = undefined;
    if (request.body && ["POST", "PUT", "PATCH"].includes(method)) {
        requestBody = parseBody(request.body);
    }

    // Generate operation ID from path and method
    const operationId = generateOperationId(method, path, item.name);

    return {
        id: `${method}::${path}::${id}`,
        method: method as ParsedEndpoint["method"],
        path,
        operationId,
        summary: item.name,
        description: item.description || request.description,
        tags: parentPath.length > 0 ? [parentPath[parentPath.length - 1]] : undefined,
        parameters,
        requestBody,
    };
}

function parseUrl(url: PostmanUrl | string): {
    path: string;
    pathParams: ParsedParameter[];
    queryParams: ParsedParameter[];
} {
    const pathParams: ParsedParameter[] = [];
    const queryParams: ParsedParameter[] = [];

    let path = "/";

    if (typeof url === "string") {
        // Parse string URL
        try {
            const parsed = new URL(url);
            path = parsed.pathname || "/";

            // Extract query params
            parsed.searchParams.forEach((value, key) => {
                queryParams.push({
                    name: key,
                    in: "query",
                    required: false,
                    type: "string",
                    description: undefined,
                });
            });
        } catch {
            // Handle relative URLs or malformed URLs
            const [pathPart, queryPart] = url.split("?");
            path = pathPart.startsWith("/") ? pathPart : `/${pathPart}`;

            if (queryPart) {
                queryPart.split("&").forEach((param) => {
                    const [key] = param.split("=");
                    if (key) {
                        queryParams.push({
                            name: key,
                            in: "query",
                            required: false,
                            type: "string",
                        });
                    }
                });
            }
        }
    } else {
        // Parse structured URL object
        if (url.path) {
            path = "/" + url.path.join("/");
        }

        // Extract path variables (in Postman format :id or {{id}})
        if (url.variable) {
            for (const v of url.variable) {
                pathParams.push({
                    name: v.key,
                    in: "path",
                    required: true,
                    type: "string",
                    description: v.description,
                });
            }
        }

        // Extract query params
        if (url.query) {
            for (const q of url.query) {
                if (!q.disabled) {
                    queryParams.push({
                        name: q.key,
                        in: "query",
                        required: false,
                        type: "string",
                        description: q.description,
                    });
                }
            }
        }
    }

    // Extract path params from path string (e.g., :id or {{id}})
    const pathParamMatches = path.match(/[:{}]([^/}]+)[}]?/g);
    if (pathParamMatches) {
        for (const match of pathParamMatches) {
            const paramName = match.replace(/[:{}/]/g, "");
            if (!pathParams.some((p) => p.name === paramName)) {
                pathParams.push({
                    name: paramName,
                    in: "path",
                    required: true,
                    type: "string",
                });
            }
            // Normalize path to OpenAPI format
            path = path.replace(match, `{${paramName}}`);
        }
    }

    return { path, pathParams, queryParams };
}

function parseBody(body: PostmanBody): ParsedEndpoint["requestBody"] {
    if (body.mode === "raw" && body.raw) {
        const language = body.options?.raw?.language;

        if (language === "text") {
            return {
                required: true,
                contentType: "text/plain",
                schema: { type: "string" },
            };
        }

        try {
            const parsed = JSON.parse(body.raw);
            const schema = inferSchema(parsed);
            return {
                required: true,
                contentType: "application/json",
                schema,
            };
        } catch {
            return {
                required: true,
                contentType: "text/plain",
                schema: { type: "string" },
            };
        }
    }

    if (body.mode === "urlencoded") {
        const properties: Record<string, unknown> = {};
        const required: string[] = [];

        for (const field of body.urlencoded || []) {
            if (field.disabled) continue;
            properties[field.key] = {
                type: "string",
                description: field.description,
            };
            required.push(field.key);
        }

        return {
            required: required.length > 0,
            contentType: "application/x-www-form-urlencoded",
            schema: { type: "object", properties, required },
        };
    }

    if (body.mode === "formdata") {
        const properties: Record<string, unknown> = {};
        const required: string[] = [];

        for (const field of body.formdata || []) {
            if (field.disabled) continue;
            properties[field.key] = {
                type: field.type === "file" ? "string" : "string",
                description: field.description,
            };
            required.push(field.key);
        }

        return {
            required: required.length > 0,
            contentType: "multipart/form-data",
            schema: { type: "object", properties, required },
        };
    }

    if (body.mode === "file") {
        return {
            required: true,
            contentType: "application/octet-stream",
            schema: { type: "string" },
        };
    }

    if (body.mode === "graphql") {
        return {
            required: true,
            contentType: "application/json",
            schema: {
                type: "object",
                properties: {
                    query: { type: "string" },
                    variables: { type: "string" },
                },
                required: ["query"],
            },
        };
    }

    return {
        required: false,
        contentType: "application/json",
        schema: { type: "object" },
    };
}

function inferSchema(obj: unknown): Record<string, unknown> {
    if (Array.isArray(obj)) {
        return {
            type: "array",
            items: obj.length > 0 ? inferSchema(obj[0]) : { type: "string" },
        };
    }

    if (typeof obj === "object" && obj !== null) {
        const properties: Record<string, unknown> = {};
        const required: string[] = [];

        for (const [key, value] of Object.entries(obj)) {
            properties[key] = inferSchema(value);
            required.push(key);
        }

        return { type: "object", properties, required };
    }

    // Primitive types
    if (typeof obj === "number") {
        return { type: Number.isInteger(obj) ? "integer" : "number" };
    }
    if (typeof obj === "boolean") {
        return { type: "boolean" };
    }
    return { type: "string" };
}

function generateOperationId(method: string, path: string, name: string): string {
    // Clean up the name to create an operation ID
    const cleanName = name
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .map((word, i) => (i === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
        .join("");

    if (cleanName) {
        return cleanName;
    }

    // Fallback: generate from method and path
    const pathParts = path
        .split("/")
        .filter(Boolean)
        .map((part) => {
            if (part.startsWith("{")) {
                return "By" + part.slice(1, -1).charAt(0).toUpperCase() + part.slice(2, -1);
            }
            return part.charAt(0).toUpperCase() + part.slice(1);
        });

    return method.toLowerCase() + pathParts.join("");
}

function extractSecuritySchemes(auth?: PostmanAuth): Record<string, unknown> {
    if (!auth) return {};

    const schemes: Record<string, unknown> = {};

    switch (auth.type) {
        case "apikey":
            schemes.apiKey = {
                type: "apiKey",
                in: auth.apikey?.find((a) => a.key === "in")?.value || "header",
                name: auth.apikey?.find((a) => a.key === "key")?.value || "X-API-Key",
            };
            break;
        case "bearer":
            schemes.bearer = {
                type: "http",
                scheme: "bearer",
            };
            break;
        case "basic":
            schemes.basic = {
                type: "http",
                scheme: "basic",
            };
            break;
    }

    return schemes;
}
