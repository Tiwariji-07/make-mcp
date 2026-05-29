import type {
    ApiMediaType,
    ApiModel,
    ApiOperation,
    ApiParameter,
    ApiResponse,
    ApiHeader,
    ApiSecurityRequirement,
    ApiServer,
    ApiSourceMetadata,
} from "./types";

type OpenAPISpec = Record<string, unknown> & {
    openapi?: string;
    swagger?: string;
    info?: Record<string, unknown>;
    servers?: unknown[];
    host?: string;
    basePath?: string;
    schemes?: string[];
    paths?: Record<string, Record<string, unknown>>;
    components?: { securitySchemes?: Record<string, Record<string, unknown>> };
    securityDefinitions?: Record<string, Record<string, unknown>>;
    security?: ApiSecurityRequirement[];
};

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "options", "head", "trace"]);

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
}

function asString(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
    return typeof value === "boolean" ? value : undefined;
}

function normalizeServers(api: OpenAPISpec): ApiServer[] {
    if (Array.isArray(api.servers) && api.servers.length > 0) {
        return api.servers.flatMap((server) => {
            const record = asRecord(server);
            const url = asString(record?.url);
            if (!record || !url) return [];

            const variables = asRecord(record.variables);
            return [{
                url,
                description: asString(record.description),
                variables: variables
                    ? Object.fromEntries(Object.entries(variables).flatMap(([key, variable]) => {
                        const variableRecord = asRecord(variable);
                        const defaultValue = asString(variableRecord?.default);
                        if (!variableRecord || defaultValue === undefined) return [];

                        return [[key, {
                            default: defaultValue,
                            description: asString(variableRecord.description),
                            enum: Array.isArray(variableRecord.enum)
                                ? variableRecord.enum.filter((item): item is string => typeof item === "string")
                                : undefined,
                        }]];
                    }))
                    : undefined,
            }];
        });
    }

    if (api.host) {
        const scheme = api.schemes?.[0] || "https";
        return [{
            url: `${scheme}://${api.host}${api.basePath || ""}`,
        }];
    }

    return [];
}

function normalizeMediaTypes(content: unknown): ApiMediaType[] {
    const contentRecord = asRecord(content);
    if (!contentRecord) return [];

    return Object.entries(contentRecord).map(([mediaType, media]) => {
        const mediaRecord = asRecord(media) || {};
        return {
            mediaType,
            schema: asRecord(mediaRecord.schema),
            example: mediaRecord.example,
            examples: asRecord(mediaRecord.examples) as ApiMediaType["examples"],
            encoding: asRecord(mediaRecord.encoding),
        };
    });
}

function normalizeParameter(value: unknown, level: "path" | "operation"): ApiParameter | undefined {
    const parameter = asRecord(value);
    const name = asString(parameter?.name);
    const location = parameter?.in;

    if (!parameter || !name || !["path", "query", "header", "cookie"].includes(String(location))) {
        return undefined;
    }

    const schema = asRecord(parameter.schema)
        || (parameter.type ? {
            type: parameter.type,
            format: parameter.format,
            default: parameter.default,
            enum: parameter.enum,
            example: parameter.example,
        } : undefined);

    return {
        name,
        in: location as ApiParameter["in"],
        required: location === "path" ? true : Boolean(parameter.required),
        schema,
        description: asString(parameter.description),
        deprecated: asBoolean(parameter.deprecated),
        allowEmptyValue: asBoolean(parameter.allowEmptyValue),
        style: asString(parameter.style),
        explode: asBoolean(parameter.explode),
        example: parameter.example,
        examples: asRecord(parameter.examples) as ApiParameter["examples"],
        source: { level, raw: parameter },
    };
}

function mergeParameters(pathParameters: ApiParameter[], operationParameters: ApiParameter[]): ApiParameter[] {
    const byLocationAndName = new Map<string, number>();
    const merged: ApiParameter[] = [];

    for (const parameter of pathParameters) {
        byLocationAndName.set(`${parameter.in}:${parameter.name}`, merged.length);
        merged.push(parameter);
    }

    for (const parameter of operationParameters) {
        const key = `${parameter.in}:${parameter.name}`;
        const existingIndex = byLocationAndName.get(key);

        if (existingIndex === undefined) {
            byLocationAndName.set(key, merged.length);
            merged.push(parameter);
        } else {
            merged[existingIndex] = parameter;
        }
    }

    return merged;
}

function normalizeRequestBody(operation: Record<string, unknown>): ApiOperation["requestBody"] {
    const requestBody = asRecord(operation.requestBody);
    if (requestBody) {
        return {
            description: asString(requestBody.description),
            required: Boolean(requestBody.required),
            content: normalizeMediaTypes(requestBody.content),
        };
    }

    const bodyParameter = Array.isArray(operation.parameters)
        ? operation.parameters
            .map((parameter) => asRecord(parameter))
            .find((parameter) => parameter?.in === "body")
        : undefined;

    if (!bodyParameter) return undefined;

    return {
        description: asString(bodyParameter.description),
        required: Boolean(bodyParameter.required),
        content: [{
            mediaType: "application/json",
            schema: asRecord(bodyParameter.schema),
            example: bodyParameter.example,
            examples: asRecord(bodyParameter.examples) as ApiMediaType["examples"],
        }],
    };
}

function normalizeResponses(responses: unknown): ApiResponse[] {
    const responseRecords = asRecord(responses);
    if (!responseRecords) return [];

    return Object.entries(responseRecords).map(([statusCode, response]) => {
        const responseRecord = asRecord(response) || {};
        return {
            statusCode,
            description: asString(responseRecord.description),
            headers: normalizeHeaders(responseRecord.headers),
            content: normalizeMediaTypes(responseRecord.content),
            links: asRecord(responseRecord.links),
        };
    });
}

function normalizeHeaders(headers: unknown): Record<string, ApiHeader> | undefined {
    const headerRecords = asRecord(headers);
    if (!headerRecords) return undefined;

    return Object.fromEntries(Object.entries(headerRecords).flatMap(([name, header]) => {
        const headerRecord = asRecord(header);
        if (!headerRecord) return [];

        return [[name, {
            description: asString(headerRecord.description),
            required: asBoolean(headerRecord.required),
            deprecated: asBoolean(headerRecord.deprecated),
            schema: asRecord(headerRecord.schema),
            style: asString(headerRecord.style),
            explode: asBoolean(headerRecord.explode),
            example: headerRecord.example,
            examples: asRecord(headerRecord.examples) as ApiHeader["examples"],
        }]];
    }));
}

function operationIdFor(method: string, path: string, operation: Record<string, unknown>): string {
    return asString(operation.operationId) || `${method.toUpperCase()}-${path}`;
}

export function buildOpenAPIModel(api: OpenAPISpec, source: Partial<ApiSourceMetadata> = {}): ApiModel {
    const servers = normalizeServers(api);
    const globalSecurity = Array.isArray(api.security) ? api.security : [];
    const operations: ApiOperation[] = [];

    for (const [path, pathItemValue] of Object.entries(api.paths || {})) {
        const pathItem = asRecord(pathItemValue) || {};
        const pathServers = normalizeServers(pathItem as OpenAPISpec);
        const pathParameters = Array.isArray(pathItem.parameters)
            ? pathItem.parameters
                .map((parameter) => normalizeParameter(parameter, "path"))
                .filter((parameter): parameter is ApiParameter => Boolean(parameter))
            : [];

        for (const [method, operationValue] of Object.entries(pathItem)) {
            if (!HTTP_METHODS.has(method)) continue;

            const operation = asRecord(operationValue) || {};
            const operationParameters = Array.isArray(operation.parameters)
                ? operation.parameters
                    .map((parameter) => normalizeParameter(parameter, "operation"))
                    .filter((parameter): parameter is ApiParameter => Boolean(parameter))
                : [];

            operations.push({
                id: `${method.toUpperCase()}-${path}`,
                method: method.toUpperCase() as ApiOperation["method"],
                path,
                operationId: asString(operation.operationId),
                summary: asString(operation.summary),
                description: asString(operation.description),
                tags: Array.isArray(operation.tags)
                    ? operation.tags.filter((tag): tag is string => typeof tag === "string")
                    : undefined,
                deprecated: asBoolean(operation.deprecated),
                parameters: mergeParameters(pathParameters, operationParameters),
                requestBody: normalizeRequestBody(operation),
                responses: normalizeResponses(operation.responses),
                security: Array.isArray(operation.security) ? operation.security as ApiSecurityRequirement[] : undefined,
                servers: normalizeServers(operation as OpenAPISpec),
                pathServers,
                source: { raw: operation },
            });
        }
    }

    const version = api.openapi || api.swagger;
    const info = api.info || {};

    return {
        source: {
            format: "openapi",
            version,
            ...source,
        },
        info: {
            title: asString(info.title) || "Untitled API",
            version: asString(info.version) || "1.0.0",
            description: asString(info.description),
            termsOfService: asString(info.termsOfService),
            contact: asRecord(info.contact),
            license: asRecord(info.license),
        },
        servers,
        baseUrls: servers.map((server) => server.url),
        securitySchemes: api.components?.securitySchemes || api.securityDefinitions || {},
        security: globalSecurity,
        operations: operations.map((operation) => ({
            ...operation,
            operationId: operation.operationId || operationIdFor(operation.method, operation.path, operation.source?.raw || {}),
        })),
    };
}
