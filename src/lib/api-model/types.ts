export type ApiSourceFormat = "openapi" | "postman";

export type ApiHttpMethod =
    | "GET"
    | "POST"
    | "PUT"
    | "PATCH"
    | "DELETE"
    | "OPTIONS"
    | "HEAD"
    | "TRACE";

export type ApiParameterLocation = "path" | "query" | "header" | "cookie";

export type ApiSchema = Record<string, unknown>;
export type ApiSecurityScheme = Record<string, unknown>;
export type ApiSecurityRequirement = Record<string, string[]>;

export interface ApiSourceMetadata {
    format: ApiSourceFormat;
    version?: string;
    name?: string;
    schemaUrl?: string;
    importedFrom?: string;
}

export interface ApiInfo {
    title: string;
    version: string;
    description?: string;
    termsOfService?: string;
    contact?: Record<string, unknown>;
    license?: Record<string, unknown>;
}

export interface ApiServerVariable {
    default: string;
    description?: string;
    enum?: string[];
}

export interface ApiServer {
    url: string;
    description?: string;
    variables?: Record<string, ApiServerVariable>;
}

export interface ApiExample {
    summary?: string;
    description?: string;
    value?: unknown;
    externalValue?: string;
}

export interface ApiMediaType {
    mediaType: string;
    schema?: ApiSchema;
    example?: unknown;
    examples?: Record<string, ApiExample>;
    encoding?: Record<string, unknown>;
}

export interface ApiParameter {
    name: string;
    in: ApiParameterLocation;
    required: boolean;
    schema?: ApiSchema;
    description?: string;
    deprecated?: boolean;
    allowEmptyValue?: boolean;
    style?: string;
    explode?: boolean;
    example?: unknown;
    examples?: Record<string, ApiExample>;
    source?: {
        level: "path" | "operation";
        raw?: Record<string, unknown>;
    };
}

export interface ApiRequestBody {
    description?: string;
    required: boolean;
    content: ApiMediaType[];
}

export interface ApiHeader {
    description?: string;
    required?: boolean;
    deprecated?: boolean;
    schema?: ApiSchema;
    style?: string;
    explode?: boolean;
    example?: unknown;
    examples?: Record<string, ApiExample>;
}

export interface ApiResponse {
    statusCode: string;
    description?: string;
    headers?: Record<string, ApiHeader>;
    content?: ApiMediaType[];
    links?: Record<string, unknown>;
}

export interface ApiOperation {
    id: string;
    method: ApiHttpMethod;
    path: string;
    operationId?: string;
    summary?: string;
    description?: string;
    tags?: string[];
    deprecated?: boolean;
    parameters: ApiParameter[];
    requestBody?: ApiRequestBody;
    responses: ApiResponse[];
    security?: ApiSecurityRequirement[];
    servers?: ApiServer[];
    pathServers?: ApiServer[];
    source?: {
        name?: string;
        folderPath?: string[];
        raw?: Record<string, unknown>;
    };
}

export interface ApiModel {
    source: ApiSourceMetadata;
    info: ApiInfo;
    servers: ApiServer[];
    baseUrls: string[];
    securitySchemes: Record<string, ApiSecurityScheme>;
    security: ApiSecurityRequirement[];
    operations: ApiOperation[];
}
