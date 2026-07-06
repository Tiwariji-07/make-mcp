// Build a validated GeneratorRequest from a parsed spec.
//
// This mirrors what the web app's store does on import (createToolConfig,
// inferAuthConfig, server-name slug) but minimally: the canonical apiModel path
// derives all parameter/body schemas from the operation, so a tool entry only
// needs { endpointId, toolName, description }. The planner fills the rest.

import type { ParsedSpec, ParsedEndpoint } from "../../src/lib/api-model/parsed-spec.ts";
import type { GeneratorRequest } from "../../src/lib/generator/types.ts";
import { parseGeneratorRequestPayload } from "../../src/lib/generator/request.ts";

export interface BuildRequestOptions {
    language: "node" | "python";
    transport: "stdio" | "http" | "sse";
    packageManager: "npm" | "pnpm" | "yarn";
    compactMode: boolean;
    name?: string;
    host: string;
    port: number;
    verificationMode: "fast" | "full";
    features: {
        documentation: boolean;
        docker: boolean;
        tests: boolean;
        verification: boolean;
    };
}

// Mirror of the store's sanitizeIdentifier.
function sanitizeIdentifier(value: string, fallback: string): string {
    const normalized = value
        .trim()
        .replace(/[^a-zA-Z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "");
    const safeValue = normalized || fallback;
    return /^[a-zA-Z_]/.test(safeValue) ? safeValue : `${fallback}_${safeValue}`;
}

// Mirror of the store's generateToolName.
function deriveToolName(endpoint: ParsedEndpoint): string {
    if (endpoint.operationId) {
        return sanitizeIdentifier(endpoint.operationId, "tool");
    }
    const pathParts = endpoint.path
        .split("/")
        .filter(Boolean)
        .map((part) => {
            if (part.startsWith("{") && part.endsWith("}")) {
                return "By" + part.slice(1, -1).charAt(0).toUpperCase() + part.slice(2, -1);
            }
            return part.charAt(0).toUpperCase() + part.slice(1);
        });
    return sanitizeIdentifier(endpoint.method.toLowerCase() + pathParts.join(""), "tool");
}

// Mirror of the store's inferAuthConfig.
function inferAuthConfig(securitySchemes: ParsedSpec["securitySchemes"]): GeneratorRequest["authConfig"] {
    for (const scheme of Object.values(securitySchemes)) {
        const candidate = scheme as { type?: string; scheme?: string; in?: string; name?: string };
        if (candidate.type === "apiKey") {
            return {
                type: "apiKey",
                apiKey: {
                    name: candidate.name || "X-API-Key",
                    in: candidate.in === "query" || candidate.in === "cookie" ? candidate.in : "header",
                },
            };
        }
        if (candidate.type === "http" && candidate.scheme === "bearer") return { type: "bearer" };
        if (candidate.type === "http" && candidate.scheme === "basic") return { type: "basic" };
    }
    return { type: "none" };
}

// Mirror of the store's setSpec server-name slug.
function slugifyServerName(title: string): string {
    return (
        title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "") || "my-mcp-server"
    );
}

export function buildGeneratorRequest(spec: ParsedSpec, options: BuildRequestOptions): GeneratorRequest {
    const framework = options.language === "node" ? "mcp-ts-sdk" : "fastmcp";

    const tools = spec.endpoints.map((endpoint) => ({
        endpointId: endpoint.id,
        enabled: true,
        toolName: deriveToolName(endpoint),
        description: endpoint.summary || endpoint.description || `${endpoint.method} ${endpoint.path}`,
        parameters: [] as never[],
    }));

    const payload = {
        spec: {
            info: spec.info,
            baseUrl: spec.baseUrl,
            apiModel: spec.apiModel,
        },
        tools,
        serverConfig: {
            name: options.name?.trim() || slugifyServerName(spec.info.title),
            version: spec.info.version || "1.0.0",
            host: options.host,
            port: options.port,
            transport: options.transport,
        },
        authConfig: inferAuthConfig(spec.securitySchemes),
        mcpServerAuthConfig: { type: "none", allowedOrigins: [] },
        exportConfig: {
            language: options.language,
            framework,
            packageManager: options.packageManager,
            verificationMode: options.verificationMode,
            compactMode: options.compactMode,
            features: options.features,
        },
    };

    // Validate + normalize through the SAME zod schema the web app and API use,
    // so CLI output is identical to the app for identical input.
    return parseGeneratorRequestPayload(payload);
}
