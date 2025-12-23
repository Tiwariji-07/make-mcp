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
    in: "query" | "path" | "header" | "cookie";
    required?: boolean;
    schema?: { type?: string };
    type?: string;
    description?: string;
}

// Parse OpenAPI/Swagger spec
export async function parseOpenAPISpec(input: string | object): Promise<ParsedSpec> {
    try {
        // Parse and dereference the spec
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

                const parameters: ParsedParameter[] = (operation.parameters || []).map((p) => ({
                    name: p.name,
                    in: p.in,
                    required: p.required || false,
                    type: p.schema?.type || p.type || "string",
                    description: p.description,
                }));

                // Handle request body for POST/PUT/PATCH
                let requestBody = undefined;
                if (operation.requestBody) {
                    const content = operation.requestBody.content;
                    const contentType = content ? Object.keys(content)[0] : "application/json";
                    requestBody = {
                        required: operation.requestBody.required || false,
                        contentType,
                        schema: content?.[contentType]?.schema || {},
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

// Parse from file content
export async function parseOpenAPIFromContent(content: string, filename: string): Promise<ParsedSpec> {
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

        return parseOpenAPISpec(parsed);
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
