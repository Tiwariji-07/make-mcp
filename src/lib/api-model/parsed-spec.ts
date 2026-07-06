import type { ApiModel } from "./types";

// Types for parsed API spec
export interface ParsedParameter {
    name: string;
    in: "query" | "path" | "header" | "cookie";
    required: boolean;
    type: string;
    description?: string;
}

export interface ParsedEndpoint {
    id: string;
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    path: string;
    operationId?: string;
    summary?: string;
    description?: string;
    tags?: string[];
    parameters: ParsedParameter[];
    requestBody?: {
        required: boolean;
        contentType: string;
        schema: Record<string, unknown>;
    };
}

export interface ParsedSpec {
    info: {
        title: string;
        version: string;
        description?: string;
    };
    baseUrl: string;
    endpoints: ParsedEndpoint[];
    securitySchemes: Record<string, unknown>;
    format?: string;
    apiModel?: ApiModel;
}
