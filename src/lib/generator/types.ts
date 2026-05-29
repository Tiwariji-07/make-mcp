import type { ApiModel } from "@/lib/api-model";

export const GENERATOR_VERSION = "2.1.0";
export const GENERATOR_CONTRACT_VERSION = 2;

export type Transport = "stdio" | "sse" | "http";
export type TransportStrategy = "stdio" | "sse" | "streamableHttp";
export type ExportLanguage = "node" | "python";
export type ExportFramework = "mcp-ts-sdk" | "fastmcp";
export type PackageManager = "npm" | "pnpm" | "yarn";
export type VerificationMode = "fast" | "full";
export type ParamLocation = "path" | "query" | "header" | "cookie" | "body";
export type AuthStrategy = "none" | "apiKeyHeader" | "apiKeyQuery" | "apiKeyCookie" | "bearer" | "basic";
export type ToolAuthSource = "operation" | "global" | "none" | "unsupported";
export type ToolManualReviewSeverity = "warning" | "error";
export type RequestBodyContentKind =
    | "flattenedObject"
    | "rawJsonObject"
    | "rawArray"
    | "formUrlencoded"
    | "multipart"
    | "text"
    | "binary";

export interface GeneratorRequest {
    spec: {
        info: { title: string; version: string; description?: string };
        baseUrl: string;
        apiModel?: ApiModel;
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
    hidden?: boolean;
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
    apiKey?: { name: string; in: "header" | "query" | "cookie" };
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
    verificationMode?: VerificationMode;
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
    verificationMode: VerificationMode;
    tools: GenerationTool[];
    warnings: string[];
}

export interface ToolPlan {
    id: string;
    operationId?: string;
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS" | "HEAD" | "TRACE";
    path: string;
    toolName: string;
    inputSchema: Record<string, unknown>;
    description: string;
    authStrategy: ToolAuthPlan;
    requestBodyStrategy: ToolRequestBodyPlan;
    serializationStrategy: ToolSerializationPlan;
    parameters: ToolPlanParameter[];
    warnings: string[];
    manualReview: ToolManualReviewFlag[];
}

export interface ToolAuthPlan {
    strategy: AuthStrategy;
    source: ToolAuthSource;
    schemeName?: string;
    apiKeyName?: string;
    apiKeyLocation?: "header" | "query" | "cookie";
    requirement?: Record<string, string[]>;
    requirements?: ToolAuthRequirementPlan[];
}

export interface ToolAuthRequirementPlan {
    requirement: Record<string, string[]>;
    schemes: ToolAuthSchemePlan[];
}

export interface ToolAuthSchemePlan {
    strategy: Exclude<AuthStrategy, "none">;
    schemeName: string;
    apiKeyName?: string;
    apiKeyLocation?: "header" | "query" | "cookie";
}

export interface ToolRequestBodyPlan {
    required: boolean;
    contentType?: string;
    contentKind?: RequestBodyContentKind;
    schema?: Record<string, unknown>;
}

export interface ToolSerializationPlan {
    path: ToolSerializedParameter[];
    query: ToolSerializedParameter[];
    header: ToolSerializedParameter[];
    cookie: ToolSerializedParameter[];
    requestBody?: {
        contentType: string;
        contentKind: RequestBodyContentKind;
        parameterNames: string[];
    };
}

export interface ToolSerializedParameter {
    argName: string;
    sourceName: string;
    required: boolean;
    style?: string;
    explode?: boolean;
}

export interface ToolPlanParameter {
    argName: string;
    sourceName: string;
    location: ParamLocation;
    required: boolean;
    description: string;
    schema?: Record<string, unknown>;
    style?: string;
    explode?: boolean;
}

export interface ToolManualReviewFlag {
    code: string;
    severity: ToolManualReviewSeverity;
    message: string;
}

export interface NormalizedAuth {
    strategy: AuthStrategy;
    type: GeneratorAuthConfig["type"];
    apiKeyName?: string;
    apiKeyLocation?: "header" | "query" | "cookie";
}

export interface GenerationTool {
    id: string;
    displayName: string;
    functionName: string;
    description: string;
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    path: string;
    params: GenerationParam[];
    authStrategy: ToolAuthPlan;
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
    style?: string;
    explode?: boolean;
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
    mode: VerificationMode;
    checks: VerificationCheck[];
}

export interface GeneratedPreviewResponse {
    files: Array<{ name: string; content: string }>;
    manifest: GeneratedManifest;
    validation: ValidationResult;
    verification?: VerificationReport;
}
