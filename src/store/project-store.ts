import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

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
        location: "path" | "query" | "header" | "cookie" | "body";
        // For nested objects, store the full schema
        schema?: Record<string, unknown>;
    }[];
    // Full request body schema (resolved)
    bodySchema?: Record<string, unknown>;
    bodyContentType?: string;
    // Example request body JSON
    bodyExample?: string;
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
    features: {
        documentation: boolean;
        docker: boolean;
        tests: boolean;
        verification: boolean;
    };
}

type ExportConfigUpdate = Partial<Omit<ExportConfig, "features">> & {
    features?: Partial<ExportConfig["features"]>;
};

type PersistedProjectState = Partial<ProjectState>;

// Saved project for history
export interface SavedProject {
    id: string;
    name: string;
    source: string;
    format: string;
    endpointCount: number;
    savedAt: number;
}

// Project state
export interface ProjectState {
    // Current step
    currentStep: "import" | "editor" | "export";

    // Parsed spec
    spec: ParsedSpec | null;
    specSource: string | null; // filename or URL
    specFormat: string | null; // openapi or postman

    // Tool configurations
    tools: ToolConfig[];

    // Auth configuration
    authConfig: AuthConfig;

    // Server configuration
    serverConfig: ServerConfig;

    // Export configuration
    exportConfig: ExportConfig;

    // Saved projects history
    savedProjects: SavedProject[];

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
    setExportConfig: (config: ExportConfigUpdate) => void;

    // Project history actions
    saveCurrentProject: () => void;
    loadProject: (id: string) => void;
    deleteProject: (id: string) => void;
    clearSavedProjects: () => void;

    // State actions
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    reset: () => void;
}

function sanitizeIdentifier(value: string, fallback: string): string {
    const normalized = value
        .trim()
        .replace(/[^a-zA-Z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "");

    const safeValue = normalized || fallback;
    return /^[a-zA-Z_]/.test(safeValue) ? safeValue : `${fallback}_${safeValue}`;
}

function inferAuthConfig(securitySchemes: ParsedSpec["securitySchemes"]): AuthConfig {
    for (const scheme of Object.values(securitySchemes)) {
        const candidate = scheme as {
            type?: string;
            scheme?: string;
            in?: string;
            name?: string;
        };

        if (candidate.type === "apiKey") {
            return {
                type: "apiKey",
                apiKey: {
                    name: candidate.name || "X-API-Key",
                    in: candidate.in === "query" ? "query" : "header",
                },
            };
        }

        if (candidate.type === "http" && candidate.scheme === "bearer") {
            return { type: "bearer" };
        }

        if (candidate.type === "http" && candidate.scheme === "basic") {
            return { type: "basic" };
        }
    }

    return { type: "none" };
}

function sanitizeToolConfig(tool: ToolConfig): ToolConfig {
    return {
        ...tool,
        toolName: sanitizeIdentifier(tool.toolName, "tool"),
        parameters: tool.parameters.map((parameter, index) => ({
            ...parameter,
            name: sanitizeIdentifier(parameter.name, `param_${index + 1}`),
        })),
    };
}

// Generate a human-readable type string from schema
function getTypeFromSchema(schema: Record<string, unknown>): string {
    if (!schema) return "any";

    const type = schema.type as string;

    if (type === "array") {
        const items = schema.items as Record<string, unknown>;
        if (items) {
            return `${getTypeFromSchema(items)}[]`;
        }
        return "any[]";
    }

    if (type === "object" || schema.properties) {
        // Return a summary of the object structure
        const props = schema.properties as Record<string, Record<string, unknown>>;
        if (props) {
            const keys = Object.keys(props).slice(0, 3);
            const suffix = Object.keys(props).length > 3 ? ", ..." : "";
            return `{${keys.join(", ")}${suffix}}`;
        }
        return "object";
    }

    return type || "string";
}

// Generate example value from schema (recursively resolves nested objects)
function generateExampleFromSchema(schema: Record<string, unknown>): unknown {
    if (!schema) return null;

    const type = schema.type as string;
    const example = schema.example;
    const defaultVal = schema.default;

    // Use example or default if provided
    if (example !== undefined) return example;
    if (defaultVal !== undefined) return defaultVal;

    // Handle enums
    if (schema.enum && Array.isArray(schema.enum) && schema.enum.length > 0) {
        return schema.enum[0];
    }

    // Generate based on type
    switch (type) {
        case "string":
            if (schema.format === "date") return "2024-01-15";
            if (schema.format === "date-time") return "2024-01-15T10:30:00Z";
            if (schema.format === "email") return "user@example.com";
            if (schema.format === "uri" || schema.format === "url") return "https://example.com";
            if (schema.format === "uuid") return "550e8400-e29b-41d4-a716-446655440000";
            return "string";

        case "integer":
        case "number":
            if (schema.minimum !== undefined) return schema.minimum;
            return 0;

        case "boolean":
            return true;

        case "array":
            const items = schema.items as Record<string, unknown>;
            if (items) {
                return [generateExampleFromSchema(items)];
            }
            return [];

        case "object":
        default:
            const properties = schema.properties as Record<string, Record<string, unknown>>;
            if (properties) {
                const obj: Record<string, unknown> = {};
                for (const [key, propSchema] of Object.entries(properties)) {
                    obj[key] = generateExampleFromSchema(propSchema);
                }
                return obj;
            }
            // If no type but has properties, treat as object
            if (!type && schema.properties) {
                const props = schema.properties as Record<string, Record<string, unknown>>;
                const obj: Record<string, unknown> = {};
                for (const [key, propSchema] of Object.entries(props)) {
                    obj[key] = generateExampleFromSchema(propSchema);
                }
                return obj;
            }
            return {};
    }
}

// Generate tool name from endpoint
function generateToolName(endpoint: ParsedEndpoint): string {
    if (endpoint.operationId) {
        return sanitizeIdentifier(endpoint.operationId, "tool");
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
    return sanitizeIdentifier(methodPrefix + pathParts.join(""), "tool");
}

// Create tool config from endpoint
function createToolConfig(endpoint: ParsedEndpoint): ToolConfig {
    // URL parameters (path, query, header)
    const urlParams = endpoint.parameters.map((p, index) => ({
        name: sanitizeIdentifier(p.name, `param_${index + 1}`),
        originalName: p.name,
        type: p.type,
        required: p.required,
        description: p.description || "",
        location: p.in as "path" | "query" | "header" | "cookie" | "body",
    }));

    // Request body parameters (for POST/PUT/PATCH)
    const bodyParams: ToolConfig["parameters"] = [];
    let bodySchema: Record<string, unknown> | undefined;
    let bodyContentType: string | undefined;
    let bodyExample: string | undefined;

    if (endpoint.requestBody?.schema) {
        const schema = endpoint.requestBody.schema as {
            type?: string;
            properties?: Record<string, Record<string, unknown>>;
            required?: string[];
            items?: Record<string, unknown>;
        };

        // Store the full schema
        bodySchema = endpoint.requestBody.schema;
        bodyContentType = endpoint.requestBody.contentType;

        // Generate example JSON
        const example = generateExampleFromSchema(endpoint.requestBody.schema);
        bodyExample = JSON.stringify(example, null, 2);

        const requiredFields = schema.required || [];

        if (schema.properties) {
            for (const [propName, propSchema] of Object.entries(schema.properties)) {
                bodyParams.push({
                    name: sanitizeIdentifier(propName, `body_${bodyParams.length + 1}`),
                    originalName: propName,
                    type: getTypeFromSchema(propSchema),
                    required: requiredFields.includes(propName),
                    description: (propSchema.description as string) || "",
                    location: "body",
                    schema: propSchema,
                });
            }
        } else if (schema.type === "array") {
            // Handle array body
            bodyParams.push({
                name: "body",
                originalName: "body",
                type: getTypeFromSchema(schema),
                required: true,
                description: "Request body array",
                location: "body",
                schema: schema,
            });
        } else if (schema.type) {
            bodyParams.push({
                name: "body",
                originalName: "body",
                type: getTypeFromSchema(schema),
                required: true,
                description: "Request body",
                location: "body",
                schema,
            });
        }
    }

    // Build enhanced description with example if available
    let description = endpoint.summary || endpoint.description || `${endpoint.method} ${endpoint.path}`;
    if (bodyExample && bodyParams.length > 0) {
        description = `${description}\n\nRequest body example:\n${bodyExample}`;
    }

    return {
        endpointId: endpoint.id,
        enabled: false,
        toolName: generateToolName(endpoint),
        description,
        parameters: [...urlParams, ...bodyParams],
        bodySchema,
        bodyContentType,
        bodyExample,
    };
}

// Initial state
const initialState = {
    currentStep: "import" as const,
    spec: null,
    specSource: null,
    specFormat: null,
    tools: [],
    authConfig: { type: "none" as const },
    serverConfig: {
        name: "my-mcp-server",
        version: "1.0.0",
        host: "localhost",
        port: 8080,
        transport: "stdio" as const,
    },
    exportConfig: {
        language: "node" as const,
        framework: "mcp-ts-sdk" as const,
        packageManager: "npm" as const,
        features: {
            documentation: true,
            docker: false,
            tests: true,
            verification: true,
        },
    },
    savedProjects: [] as SavedProject[],
    isLoading: false,
    error: null,
};

function normalizeExportConfig(
    exportConfig?: Partial<ExportConfig> | null
): ExportConfig {
    return {
        ...initialState.exportConfig,
        ...exportConfig,
        features: {
            ...initialState.exportConfig.features,
            ...(exportConfig?.features || {}),
        },
    };
}

// Generate unique ID
function generateId(): string {
    return Math.random().toString(36).substring(2, 9);
}

export const useProjectStore = create<ProjectState>()(
    persist(
        (set, get) => ({
            ...initialState,

            setSpec: (spec, source) => set({
                spec,
                specSource: source,
                specFormat: spec.format || "openapi",
                tools: spec.endpoints.map(createToolConfig),
                authConfig: inferAuthConfig(spec.securitySchemes),
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
                specFormat: null,
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
                    t.endpointId === endpointId
                        ? sanitizeToolConfig({ ...t, ...config })
                        : t
                ),
            })),

            setAuthConfig: (config) => set({ authConfig: config }),

            setServerConfig: (config) => set((state) => ({
                serverConfig: { ...state.serverConfig, ...config },
            })),

            setExportConfig: (config) => set((state) => ({
                exportConfig: {
                    ...state.exportConfig,
                    ...config,
                    features: {
                        ...state.exportConfig.features,
                        ...config.features,
                    },
                },
            })),

            saveCurrentProject: () => {
                const state = get();
                if (!state.spec) return;

                const project: SavedProject = {
                    id: generateId(),
                    name: state.spec.info.title,
                    source: state.specSource || "unknown",
                    format: state.specFormat || "openapi",
                    endpointCount: state.spec.endpoints.length,
                    savedAt: Date.now(),
                };

                // Store project data separately
                try {
                    localStorage.setItem(
                        `makemcp-project-${project.id}`,
                        JSON.stringify({
                            spec: state.spec,
                            tools: state.tools,
                            authConfig: state.authConfig,
                            serverConfig: state.serverConfig,
                            exportConfig: state.exportConfig,
                        })
                    );
                } catch (e) {
                    console.error("Failed to save project:", e);
                    return;
                }

                set((state) => ({
                    savedProjects: [project, ...state.savedProjects].slice(0, 10), // Keep last 10
                }));
            },

            loadProject: (id) => {
                try {
                    const data = localStorage.getItem(`makemcp-project-${id}`);
                    if (!data) return;

                    const { spec, tools, authConfig, serverConfig, exportConfig } = JSON.parse(data);

                    set({
                        spec,
                        specSource: spec?.info?.title || "Loaded Project",
                        specFormat: spec?.format || "openapi",
                        tools: Array.isArray(tools) ? tools.map(sanitizeToolConfig) : [],
                        authConfig,
                        serverConfig,
                        exportConfig: normalizeExportConfig(exportConfig),
                        currentStep: "editor",
                        error: null,
                    });
                } catch (e) {
                    console.error("Failed to load project:", e);
                }
            },

            deleteProject: (id) => {
                try {
                    localStorage.removeItem(`makemcp-project-${id}`);
                } catch (e) {
                    console.error("Failed to delete project:", e);
                }
                set((state) => ({
                    savedProjects: state.savedProjects.filter((p) => p.id !== id),
                }));
            },

            clearSavedProjects: () => {
                const savedProjects = get().savedProjects;

                for (const project of savedProjects) {
                    try {
                        localStorage.removeItem(`makemcp-project-${project.id}`);
                    } catch (e) {
                        console.error("Failed to delete project:", e);
                    }
                }

                set({ savedProjects: [] });
            },

            setLoading: (isLoading) => set({ isLoading }),

            setError: (error) => set({ error }),

            reset: () => set({
                ...initialState,
                savedProjects: get().savedProjects, // Keep saved projects
            }),
        }),
        {
            name: "makemcp-storage",
            storage: createJSONStorage(() => localStorage),
            merge: (persistedState, currentState) => {
                const persisted = (persistedState as PersistedProjectState | undefined) || {};

                return {
                    ...currentState,
                    ...persisted,
                    exportConfig: normalizeExportConfig(persisted.exportConfig),
                    savedProjects: Array.isArray(persisted.savedProjects)
                        ? persisted.savedProjects
                        : currentState.savedProjects,
                };
            },
            partialize: (state) => ({
                // Only persist these fields
                savedProjects: state.savedProjects,
                exportConfig: state.exportConfig,
            }),
        }
    )
);
