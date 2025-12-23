import { create } from "zustand";

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
}

// Tool configuration
export interface ToolConfig {
    endpointId: string;
    enabled: boolean;
    toolName: string;
    description: string;
    parameters: {
        name: string;
        originalName: string;
        type: string;
        required: boolean;
        description: string;
        location: "path" | "query" | "header" | "body";
    }[];
}

// Auth configuration
export interface AuthConfig {
    type: "apiKey" | "bearer" | "basic" | "none";
    apiKey?: {
        name: string;
        in: "header" | "query";
    };
}

// Server configuration
export interface ServerConfig {
    name: string;
    version: string;
    host: string;
    port: number;
    transport: "stdio" | "sse" | "http";
}

// Export configuration
export interface ExportConfig {
    language: "node" | "python";
    framework: "mcp-ts-sdk" | "fastmcp";
    packageManager: "npm" | "pnpm" | "yarn";
}

// Project state
export interface ProjectState {
    // Current step
    currentStep: "import" | "editor" | "export";

    // Parsed spec
    spec: ParsedSpec | null;
    specSource: string | null; // filename or URL

    // Tool configurations
    tools: ToolConfig[];

    // Auth configuration
    authConfig: AuthConfig;

    // Server configuration
    serverConfig: ServerConfig;

    // Export configuration
    exportConfig: ExportConfig;

    // Loading states
    isLoading: boolean;
    error: string | null;

    // Actions
    setSpec: (spec: ParsedSpec, source: string) => void;
    clearSpec: () => void;
    setCurrentStep: (step: "import" | "editor" | "export") => void;

    // Tool actions
    toggleTool: (endpointId: string) => void;
    toggleAllTools: (enabled: boolean) => void;
    updateToolConfig: (endpointId: string, config: Partial<ToolConfig>) => void;

    // Config actions
    setAuthConfig: (config: AuthConfig) => void;
    setServerConfig: (config: Partial<ServerConfig>) => void;
    setExportConfig: (config: Partial<ExportConfig>) => void;

    // State actions
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    reset: () => void;
}

// Generate tool name from endpoint
function generateToolName(endpoint: ParsedEndpoint): string {
    if (endpoint.operationId) {
        return endpoint.operationId;
    }

    // Generate from method + path
    const pathParts = endpoint.path
        .split("/")
        .filter(Boolean)
        .map((part) => {
            if (part.startsWith("{") && part.endsWith("}")) {
                return "By" + part.slice(1, -1).charAt(0).toUpperCase() + part.slice(2, -1);
            }
            return part.charAt(0).toUpperCase() + part.slice(1);
        });

    const methodPrefix = endpoint.method.toLowerCase();
    return methodPrefix + pathParts.join("");
}

// Create tool config from endpoint
function createToolConfig(endpoint: ParsedEndpoint): ToolConfig {
    // URL parameters (path, query, header)
    const urlParams = endpoint.parameters.map((p) => ({
        name: p.name,
        originalName: p.name,
        type: p.type,
        required: p.required,
        description: p.description || "",
        location: p.in as "path" | "query" | "header" | "body",
    }));

    // Request body parameters (for POST/PUT/PATCH)
    const bodyParams: ToolConfig["parameters"] = [];
    if (endpoint.requestBody?.schema) {
        const schema = endpoint.requestBody.schema as {
            properties?: Record<string, { type?: string; description?: string }>;
            required?: string[];
        };
        const requiredFields = schema.required || [];

        if (schema.properties) {
            for (const [propName, propSchema] of Object.entries(schema.properties)) {
                bodyParams.push({
                    name: propName,
                    originalName: propName,
                    type: propSchema.type || "object",
                    required: requiredFields.includes(propName),
                    description: propSchema.description || "",
                    location: "body",
                });
            }
        }
    }

    return {
        endpointId: endpoint.id,
        enabled: false,
        toolName: generateToolName(endpoint),
        description: endpoint.summary || endpoint.description || `${endpoint.method} ${endpoint.path}`,
        parameters: [...urlParams, ...bodyParams],
    };
}

// Initial state
const initialState = {
    currentStep: "import" as const,
    spec: null,
    specSource: null,
    tools: [],
    authConfig: { type: "none" as const },
    serverConfig: {
        name: "my-mcp-server",
        version: "1.0.0",
        host: "localhost",
        port: 3000,
        transport: "stdio" as const,
    },
    exportConfig: {
        language: "node" as const,
        framework: "mcp-ts-sdk" as const,
        packageManager: "npm" as const,
    },
    isLoading: false,
    error: null,
};

export const useProjectStore = create<ProjectState>((set) => ({
    ...initialState,

    setSpec: (spec, source) => set({
        spec,
        specSource: source,
        tools: spec.endpoints.map(createToolConfig),
        serverConfig: {
            ...initialState.serverConfig,
            name: spec.info.title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/(^-|-$)/g, "") || "my-mcp-server",
        },
        error: null,
    }),

    clearSpec: () => set({
        spec: null,
        specSource: null,
        tools: [],
        currentStep: "import",
    }),

    setCurrentStep: (step) => set({ currentStep: step }),

    toggleTool: (endpointId) => set((state) => ({
        tools: state.tools.map((t) =>
            t.endpointId === endpointId ? { ...t, enabled: !t.enabled } : t
        ),
    })),

    toggleAllTools: (enabled) => set((state) => ({
        tools: state.tools.map((t) => ({ ...t, enabled })),
    })),

    updateToolConfig: (endpointId, config) => set((state) => ({
        tools: state.tools.map((t) =>
            t.endpointId === endpointId ? { ...t, ...config } : t
        ),
    })),

    setAuthConfig: (config) => set({ authConfig: config }),

    setServerConfig: (config) => set((state) => ({
        serverConfig: { ...state.serverConfig, ...config },
    })),

    setExportConfig: (config) => set((state) => ({
        exportConfig: { ...state.exportConfig, ...config },
    })),

    setLoading: (isLoading) => set({ isLoading }),

    setError: (error) => set({ error }),

    reset: () => set(initialState),
}));
