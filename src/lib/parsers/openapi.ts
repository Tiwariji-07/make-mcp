import SwaggerParser from "@apidevtools/swagger-parser";
import { ParsedSpec, ParsedEndpoint, ParsedParameter } from "@/store/project-store";

interface OpenAPISpec {
    openapi?: string;
    swagger?: string;
    info: {
        title: string;
        version: string;
        description?: string;
    };
    servers?: Array<{ url: string }>;
    host?: string;
    basePath?: string;
    schemes?: string[];
    paths: Record<string, Record<string, OpenAPIOperation>>;
    components?: {
        securitySchemes?: Record<string, unknown>;
    };
    securityDefinitions?: Record<string, unknown>;
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

        // Extract base URL
        let baseUrl = "";
        if (api.servers && api.servers.length > 0) {
            baseUrl = api.servers[0].url;
        } else if (api.host) {
            const scheme = api.schemes?.[0] || "https";
            baseUrl = `${scheme}://${api.host}${api.basePath || ""}`;
        }

        // Parse endpoints
        const endpoints: ParsedEndpoint[] = [];
        const methods = ["get", "post", "put", "patch", "delete"] as const;

        for (const [path, pathItem] of Object.entries(api.paths || {})) {
            for (const method of methods) {
                const operation = pathItem[method];
                if (!operation) continue;

                // Separate body params from other params (Swagger 2.0 style)
                const bodyParam = (operation.parameters || []).find(p => p.in === "body") as OpenAPIParameter | undefined;
                const otherParams = (operation.parameters || []).filter(p => p.in !== "body");

                const parameters: ParsedParameter[] = otherParams.map((p) => ({
                    name: p.name,
                    in: p.in as ParsedParameter["in"],
                    required: p.required || false,
                    type: (p.schema as { type?: string })?.type || p.type || "string",
                    description: p.description,
                }));

                // Handle request body - either from OpenAPI 3.0 requestBody or Swagger 2.0 body param
                let requestBody = undefined;

                if (operation.requestBody) {
                    // OpenAPI 3.0 style
                    const content = operation.requestBody.content;
                    const contentType = content ? Object.keys(content)[0] : "application/json";
                    requestBody = {
                        required: operation.requestBody.required || false,
                        contentType,
                        schema: content?.[contentType]?.schema || {},
                    };
                } else if (bodyParam && bodyParam.schema) {
                    // Swagger 2.0 style - body param with full dereferenced schema
                    requestBody = {
                        required: bodyParam.required || false,
                        contentType: "application/json",
                        schema: bodyParam.schema, // Full resolved schema from dereference!
                    };
                }

                endpoints.push({
                    id: `${method.toUpperCase()}-${path}`,
                    method: method.toUpperCase() as ParsedEndpoint["method"],
                    path,
                    operationId: operation.operationId,
                    summary: operation.summary,
                    description: operation.description,
                    tags: operation.tags,
                    parameters,
                    requestBody,
                });
            }
        }

        // Extract security schemes
        const securitySchemes = api.components?.securitySchemes || api.securityDefinitions || {};

        return {
            info: {
                title: api.info.title,
                version: api.info.version,
                description: api.info.description,
            },
            baseUrl,
            endpoints,
            securitySchemes,
        };
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
