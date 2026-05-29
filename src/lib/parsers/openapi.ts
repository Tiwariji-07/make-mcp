import SwaggerParser from "@apidevtools/swagger-parser";
import { ParsedSpec } from "@/store/project-store";
import { buildOpenAPIModel } from "@/lib/api-model";
import { apiModelToParsedSpec } from "@/lib/api-model/legacy";

interface OpenAPISpec extends Record<string, unknown> {
    openapi?: string;
    swagger?: string;
    info: {
        title: string;
        version: string;
        description?: string;
    };
    servers?: Array<{ url: string; description?: string; variables?: Record<string, unknown> }>;
    host?: string;
    basePath?: string;
    schemes?: string[];
    paths: Record<string, Record<string, OpenAPIOperation>>;
    components?: {
        securitySchemes?: Record<string, Record<string, unknown>>;
    };
    securityDefinitions?: Record<string, Record<string, unknown>>;
    security?: Record<string, string[]>[];
}

interface OpenAPIOperation {
    operationId?: string;
    summary?: string;
    description?: string;
    tags?: string[];
    parameters?: OpenAPIParameter[];
    requestBody?: {
        required?: boolean;
        content?: Record<string, { schema?: Record<string, unknown> }>;
    };
}

interface OpenAPIParameter {
    name: string;
    in: "query" | "path" | "header" | "cookie" | "body"; // Swagger 2.0 includes "body"
    required?: boolean;
    schema?: Record<string, unknown>; // Full schema for body params
    type?: string;
    description?: string;
}

// Parse OpenAPI/Swagger spec
export async function parseOpenAPISpec(input: string | object): Promise<ParsedSpec> {
    try {
        // Parse and dereference the spec - this resolves all $refs!
        const api = (await SwaggerParser.dereference(input as string)) as OpenAPISpec;
        return apiModelToParsedSpec(buildOpenAPIModel(api));
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to parse OpenAPI spec";
        throw new Error(`OpenAPI parsing error: ${message}`);
    }
}

// Parse from file content - supports both OpenAPI and Postman
export async function parseOpenAPIFromContent(content: string, filename: string): Promise<ParsedSpec & { format?: string }> {
    try {
        // Try to parse as JSON first
        let parsed: object;
        try {
            parsed = JSON.parse(content);
        } catch {
            // Try YAML
            const yaml = await import("yaml");
            parsed = yaml.parse(content);
        }

        // Detect format and parse accordingly
        const { isPostmanCollection, parsePostmanCollection } = await import("./postman");

        if (isPostmanCollection(parsed)) {
            const spec = parsePostmanCollection(parsed);
            return { ...spec, format: "postman" };
        }

        // Default to OpenAPI
        const spec = await parseOpenAPISpec(parsed);
        return { ...spec, format: "openapi" };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to parse file";
        throw new Error(`Failed to parse ${filename}: ${message}`);
    }
}

// Parse from URL
export async function parseOpenAPIFromURL(url: string): Promise<ParsedSpec> {
    try {
        return parseOpenAPISpec(url);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch spec";
        throw new Error(`Failed to fetch from ${url}: ${message}`);
    }
}

// Validation types
export interface ValidationMessage {
    type: "error" | "warning" | "info";
    message: string;
    path?: string; // e.g., "POST /pet" or "GET /users/{id}.userId"
}

export interface ValidationResult {
    isValid: boolean;
    errors: ValidationMessage[];
    warnings: ValidationMessage[];
    info: ValidationMessage[];
}

// Validate a parsed spec and return detailed feedback
export function validateSpec(spec: ParsedSpec): ValidationResult {
    const errors: ValidationMessage[] = [];
    const warnings: ValidationMessage[] = [];
    const info: ValidationMessage[] = [];

    // Check API info
    if (!spec.info.title) {
        errors.push({ type: "error", message: "API title is missing" });
    }
    if (!spec.info.version) {
        warnings.push({ type: "warning", message: "API version is not specified" });
    }
    if (!spec.info.description) {
        info.push({ type: "info", message: "API description is not provided" });
    }

    // Check base URL
    if (!spec.baseUrl) {
        warnings.push({ type: "warning", message: "No base URL defined - you'll need to configure it manually" });
    } else if (spec.baseUrl.includes("{") || spec.baseUrl.includes("localhost")) {
        info.push({ type: "info", message: `Base URL "${spec.baseUrl}" may need to be updated for production` });
    }

    // Check endpoints
    if (spec.endpoints.length === 0) {
        errors.push({ type: "error", message: "No endpoints found in the specification" });
    }

    for (const endpoint of spec.endpoints) {
        const endpointPath = `${endpoint.method} ${endpoint.path}`;

        // Check for missing description
        if (!endpoint.summary && !endpoint.description) {
            warnings.push({
                type: "warning",
                message: `Missing description for endpoint`,
                path: endpointPath,
            });
        }

        // Check for missing operationId
        if (!endpoint.operationId) {
            info.push({
                type: "info",
                message: `No operationId - tool name will be auto-generated`,
                path: endpointPath,
            });
        }

        // Check parameters
        for (const param of endpoint.parameters) {
            if (!param.description) {
                info.push({
                    type: "info",
                    message: `Parameter "${param.name}" has no description`,
                    path: endpointPath,
                });
            }

            // Check for path params that might be missing in path
            if (param.in === "path" && !endpoint.path.includes(`{${param.name}}`)) {
                warnings.push({
                    type: "warning",
                    message: `Path parameter "${param.name}" not found in path "${endpoint.path}"`,
                    path: endpointPath,
                });
            }
        }

        // Check request body for POST/PUT/PATCH
        if (["POST", "PUT", "PATCH"].includes(endpoint.method)) {
            if (!endpoint.requestBody) {
                info.push({
                    type: "info",
                    message: `No request body defined for ${endpoint.method} request`,
                    path: endpointPath,
                });
            } else if (!endpoint.requestBody.schema || Object.keys(endpoint.requestBody.schema).length === 0) {
                warnings.push({
                    type: "warning",
                    message: `Request body schema is empty or undefined`,
                    path: endpointPath,
                });
            }
        }
    }

    // Check security schemes
    if (Object.keys(spec.securitySchemes).length === 0) {
        info.push({ type: "info", message: "No authentication schemes defined" });
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings,
        info,
    };
}
