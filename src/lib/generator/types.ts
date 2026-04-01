export const GENERATOR_VERSION = "2.1.0";
export const GENERATOR_CONTRACT_VERSION = 2;

export type Transport = "stdio" | "sse" | "http";
export type TransportStrategy = "stdio" | "sse" | "streamableHttp";
export type ExportLanguage = "node" | "python";
export type ExportFramework = "mcp-ts-sdk" | "fastmcp";
export type PackageManager = "npm" | "pnpm" | "yarn";
export type ParamLocation = "path" | "query" | "header" | "cookie" | "body";
export type AuthStrategy = "none" | "apiKeyHeader" | "apiKeyQuery" | "bearer" | "basic";
export type RequestBodyContentKind =
    | "json-object"
    | "json-raw"
    | "form-urlencoded"
    | "multipart"
    | "text"
    | "binary";

export interface GeneratorRequest {
    spec: {
        info: { title: string; version: string; description?: string };
        baseUrl: string;
    };
    tools: GeneratorToolConfig[];
    serverConfig: GeneratorServerConfig;
    authConfig: GeneratorAuthConfig;
    exportConfig: GeneratorExportConfig;
}

export interface GeneratorToolConfig {
    endpointId: string;
    enabled: boolean;
    toolName: string;
    description: string;
    parameters: GeneratorToolParameter[];
    bodySchema?: Record<string, unknown>;
    bodyContentType?: string;
}

export interface GeneratorToolParameter {
    name: string;
    originalName: string;
    type: string;
    required: boolean;
    description: string;
    location?: ParamLocation;
    schema?: Record<string, unknown>;
}

export interface GeneratorServerConfig {
    name: string;
    version: string;
    host: string;
    port: number;
    transport: Transport;
}

export interface GeneratorAuthConfig {
    type: "none" | "apiKey" | "bearer" | "basic";
    apiKey?: { name: string; in: "header" | "query" };
}

export interface GenerationFeatureFlags {
    documentation: boolean;
    docker: boolean;
    tests: boolean;
    verification: boolean;
}

export interface GeneratorExportConfig {
    language: ExportLanguage;
    framework: ExportFramework;
    packageManager: PackageManager;
    features?: Partial<GenerationFeatureFlags>;
}

export interface GenerationPlan {
    generatorVersion: string;
    contractVersion: number;
    generatedAt: string;
    spec: {
        title: string;
        version: string;
        description?: string;
        baseUrl: string;
    };
    server: GeneratorServerConfig;
    runtime: {
        language: ExportLanguage;
        framework: ExportFramework;
        packageManager: PackageManager;
        transport: Transport;
        transportStrategy: TransportStrategy;
    };
    auth: NormalizedAuth;
    features: GenerationFeatureFlags;
    tools: GenerationTool[];
    warnings: string[];
}

export interface NormalizedAuth {
    strategy: AuthStrategy;
    type: GeneratorAuthConfig["type"];
    apiKeyName?: string;
    apiKeyLocation?: "header" | "query";
}

export interface GenerationTool {
    id: string;
    displayName: string;
    functionName: string;
    description: string;
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    path: string;
    params: GenerationParam[];
    requestBody?: GenerationRequestBody;
}

export interface GenerationParam {
    argName: string;
    sourceName: string;
    type: string;
    required: boolean;
    description: string;
    location: ParamLocation;
    schema?: Record<string, unknown>;
}

export interface GenerationRequestBody {
    contentType: string;
    contentKind: RequestBodyContentKind;
    schema?: Record<string, unknown>;
    params: GenerationParam[];
}

export interface GeneratedProject {
    manifest: GeneratedManifest;
    files: Map<string, string>;
}

export interface GeneratedManifest {
    generatorVersion: string;
    contractVersion: number;
    language: ExportLanguage;
    framework: ExportFramework;
    features: GenerationFeatureFlags;
    transport: Transport;
    serverName: string;
    generatedAt: string;
    toolCount: number;
}

export interface GenerationIssue {
    severity: "error" | "warning" | "info";
    message: string;
    path?: string;
}

export interface ValidationResult {
    errors: GenerationIssue[];
    warnings: GenerationIssue[];
    info: GenerationIssue[];
}

export interface VerificationCheck {
    name: string;
    status: "passed" | "failed" | "skipped";
    details?: string;
}

export interface VerificationReport {
    status: "passed" | "failed";
    checks: VerificationCheck[];
}

export interface GeneratedPreviewResponse {
    files: Array<{ name: string; content: string }>;
    manifest: GeneratedManifest;
    validation: ValidationResult;
    verification?: VerificationReport;
}
