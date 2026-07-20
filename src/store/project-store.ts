import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { getBodyContentKind, isBinarySchema, isShallowSimpleObjectSchema } from "@/lib/generator/utils";
import { projectStorageKey, upsertProjectHistory } from "./project-history";

// Parsed API spec types now live in the lib layer (api-model). Re-exported here
// so existing store consumers keep importing them from the store unchanged.
export type { ParsedParameter, ParsedEndpoint, ParsedSpec } from "@/lib/api-model/parsed-spec";
import type { ParsedEndpoint, ParsedSpec } from "@/lib/api-model/parsed-spec";

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
        hidden?: boolean;
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
        in: "header" | "query" | "cookie";
    };
}

export interface McpServerAuthConfig {
    type: "none" | "bearer";
    allowedOrigins: string[];
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
    verificationMode: "fast" | "full";
    // Compact mode (meta-tools). When true the generated server exposes just
    // three meta-tools (list_api_endpoints / get_api_endpoint_schema /
    // invoke_api_endpoint) instead of one tool per operation, which keeps large
    // APIs from bloating the model's context window. Matches the generator's
    // `compactMode` field on the export config.
    compactMode: boolean;
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

    // MCP server access configuration for HTTP/SSE transports
    mcpServerAuthConfig: McpServerAuthConfig;

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
    setMcpServerAuthConfig: (config: Partial<McpServerAuthConfig>) => void;
    setServerConfig: (config: Partial<ServerConfig>) => void;
    setExportConfig: (config: ExportConfigUpdate) => void;

    // Project history actions
    saveCurrentProject: () => boolean;
    loadProject: (id: string) => boolean;
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
                    in: candidate.in === "query" || candidate.in === "cookie" ? candidate.in : "header",
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
            hidden: parameter.hidden || false,
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
    let description = endpoint.summary || endpoint.description || `${endpoint.method} ${endpoint.path}`;

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

        const bodyKind = getBodyContentKind(
            {
                endpointId: endpoint.id,
                enabled: true,
                toolName: endpoint.operationId || endpoint.summary || endpoint.id,
                description,
                parameters: [],
                bodySchema,
                bodyContentType,
            },
            []
        );
        const exposeProperties =
            (bodyKind === "flattenedObject" && isShallowSimpleObjectSchema(schema)) ||
            (["formUrlencoded", "multipart"].includes(bodyKind || "") && Boolean(schema.properties));

        if (schema.properties && exposeProperties) {
            for (const [propName, propSchema] of Object.entries(schema.properties)) {
                bodyParams.push({
                    name: sanitizeIdentifier(propName, `body_${bodyParams.length + 1}`),
                    originalName: propName,
                    type: getTypeFromSchema(propSchema),
                    required: requiredFields.includes(propName),
                    description: [
                        (propSchema.description as string) || "",
                        bodyKind === "multipart" && isBinarySchema(propSchema) ? "Base64-encoded file content." : "",
                    ].filter(Boolean).join(" "),
                    location: "body",
                    schema: propSchema,
                });
            }
        } else if (bodyKind) {
            bodyParams.push({
                name: "body",
                originalName: "body",
                type: getTypeFromSchema(schema),
                required: endpoint.requestBody.required,
                description: schema.type === "array" ? "Request body array" : "Request body",
                location: "body",
                schema: schema,
            });
        }
    }

    // Build enhanced description with example if available
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
    mcpServerAuthConfig: { type: "none" as const, allowedOrigins: [] },
    serverConfig: {
        name: "my-mcp-server",
        version: "1.0.0",
        host: "localhost",
        port: 8080,
        transport: "http" as const,
    },
    exportConfig: {
        language: "node" as const,
        framework: "mcp-ts-sdk" as const,
        packageManager: "npm" as const,
        verificationMode: "fast" as const,
        compactMode: false,
        features: {
            documentation: true,
            docker: false,
            tests: true,
            // Off by default: process-spawning verify is a server DoS risk and
            // is stripped on the public API unless MCPMINT_ALLOW_PROCESS_VERIFY=1.
            verification: false,
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

function normalizeMcpServerAuthConfig(
    config?: Partial<McpServerAuthConfig> | null
): McpServerAuthConfig {
    return {
        type: config?.type === "bearer" ? "bearer" : "none",
        allowedOrigins: Array.isArray(config?.allowedOrigins)
            ? config.allowedOrigins.map((origin) => origin.trim()).filter(Boolean)
            : [],
    };
}

// Generate unique ID
function generateId(): string {
    return Math.random().toString(36).substring(2, 9);
}

// localStorage-backed storage that fails gracefully when a very large spec
// exceeds the quota, so persistence never throws and breaks the app.
const safeLocalStorage = {
    getItem: (name: string): string | null => {
        try {
            return localStorage.getItem(name);
        } catch {
            return null;
        }
    },
    setItem: (name: string, value: string): void => {
        try {
            localStorage.setItem(name, value);
        } catch (e) {
            // Quota exceeded (e.g. an oversized spec) or storage unavailable.
            // Keep the in-memory session working; just skip persistence.
            console.warn("mcpmint: unable to persist session (storage full or unavailable)", e);
        }
    },
    removeItem: (name: string): void => {
        try {
            localStorage.removeItem(name);
        } catch {
            /* no-op */
        }
    },
};

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

            setMcpServerAuthConfig: (config) => set((state) => ({
                mcpServerAuthConfig: normalizeMcpServerAuthConfig({
                    ...state.mcpServerAuthConfig,
                    ...config,
                }),
            })),

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
                if (!state.spec) return false;

                const existing = state.savedProjects.find(
                    (candidate) => candidate.source === (state.specSource || "unknown")
                );

                const project: SavedProject = {
                    id: existing?.id || generateId(),
                    name: state.spec.info.title,
                    source: state.specSource || "unknown",
                    format: state.specFormat || "openapi",
                    endpointCount: state.spec.endpoints.length,
                    savedAt: Date.now(),
                };

                // Store project data separately.
                // NOTE: the "makemcp-project-*" key prefix is kept deliberately so
                // existing users' saved projects survive the mcpmint rebrand.
                try {
                    localStorage.setItem(
                        projectStorageKey(project.id),
                        JSON.stringify({
                            spec: state.spec,
                            tools: state.tools,
                            authConfig: state.authConfig,
                            mcpServerAuthConfig: state.mcpServerAuthConfig,
                            serverConfig: state.serverConfig,
                            exportConfig: state.exportConfig,
                        })
                    );
                } catch (e) {
                    console.error("Failed to save project:", e);
                    set({ error: "Your download succeeded, but this project could not be saved to browser history. Check private-browsing or storage settings." });
                    return false;
                }

                const update = upsertProjectHistory(state.savedProjects, project);
                for (const evicted of update.evicted) {
                    try {
                        localStorage.removeItem(projectStorageKey(evicted.id));
                    } catch (e) {
                        console.warn("Failed to remove evicted project data:", e);
                    }
                }
                set({ savedProjects: update.projects, error: null });
                return true;
            },

            loadProject: (id) => {
                try {
                    const data = localStorage.getItem(projectStorageKey(id));
                    if (!data) {
                        set({ error: "This saved project is no longer available. It may have been cleared by the browser." });
                        return false;
                    }

                    const { spec, tools, authConfig, mcpServerAuthConfig, serverConfig, exportConfig } = JSON.parse(data);

                    // Projects saved before the canonical migration lack
                    // spec.apiModel, which generation now requires.
                    if (!spec?.apiModel) {
                        set({ error: "This saved project was created by an older version of mcpmint. Re-import the spec to continue." });
                        return false;
                    }

                    set({
                        spec,
                        specSource: spec?.info?.title || "Loaded Project",
                        specFormat: spec?.format || "openapi",
                        tools: Array.isArray(tools) ? tools.map(sanitizeToolConfig) : [],
                        authConfig,
                        mcpServerAuthConfig: normalizeMcpServerAuthConfig(mcpServerAuthConfig),
                        serverConfig,
                        exportConfig: normalizeExportConfig(exportConfig),
                        currentStep: "editor",
                        error: null,
                    });
                    return true;
                } catch (e) {
                    console.error("Failed to load project:", e);
                    set({ error: "This saved project is damaged or unreadable. Re-import the original specification." });
                    return false;
                }
            },

            deleteProject: (id) => {
                try {
                    localStorage.removeItem(projectStorageKey(id));
                } catch (e) {
                    console.error("Failed to delete project:", e);
                }
                set((state) => ({
                    savedProjects: state.savedProjects.filter((p) => p.id !== id),
                }));
            },

            clearSavedProjects: () => {
                try {
                    const keys: string[] = [];
                    for (let index = 0; index < localStorage.length; index += 1) {
                        const key = localStorage.key(index);
                        if (key?.startsWith("makemcp-project-")) keys.push(key);
                    }
                    for (const key of keys) localStorage.removeItem(key);
                } catch (e) {
                    console.error("Failed to clear project history:", e);
                    set({ error: "Project history could not be fully cleared. Check your browser storage settings." });
                    return;
                }

                set({ savedProjects: [], error: null });
            },

            setLoading: (isLoading) => set({ isLoading }),

            setError: (error) => set({ error }),

            reset: () => set({
                ...initialState,
                savedProjects: get().savedProjects, // Keep saved projects
            }),
        }),
        {
            // Legacy persist key kept intentionally so existing users' sessions survive the mcpmint rebrand.
            name: "makemcp-storage",
            storage: createJSONStorage(() => safeLocalStorage),
            // v2: the generator requires spec.apiModel (the canonical path is the
            // only path). Sessions persisted before the canonical migration have a
            // spec without apiModel and would throw deep inside generation, so
            // migrate drops the stale working session and keeps only config/history.
            version: 2,
            migrate: (persistedState, version) => {
                const persisted = (persistedState as PersistedProjectState | undefined) || {};

                if (version < 2 && persisted.spec && !persisted.spec.apiModel) {
                    return {
                        ...persisted,
                        spec: null,
                        specSource: null,
                        specFormat: null,
                        tools: [],
                        currentStep: "import" as const,
                    };
                }

                return persisted;
            },
            merge: (persistedState, currentState) => {
                const persisted = (persistedState as PersistedProjectState | undefined) || {};

                const spec = persisted.spec ?? currentState.spec;

                return {
                    ...currentState,
                    ...persisted,
                    // Restore the in-progress working session if one was persisted.
                    spec,
                    tools: Array.isArray(persisted.tools)
                        ? persisted.tools.map(sanitizeToolConfig)
                        : currentState.tools,
                    authConfig: persisted.authConfig ?? currentState.authConfig,
                    serverConfig: persisted.serverConfig ?? currentState.serverConfig,
                    // Only trust a persisted step when there is actually a spec to resume.
                    currentStep: spec ? (persisted.currentStep ?? currentState.currentStep) : "import",
                    exportConfig: normalizeExportConfig(persisted.exportConfig),
                    mcpServerAuthConfig: normalizeMcpServerAuthConfig(persisted.mcpServerAuthConfig),
                    savedProjects: Array.isArray(persisted.savedProjects)
                        ? persisted.savedProjects
                        : currentState.savedProjects,
                };
            },
            partialize: (state) => ({
                // Persisted config + history
                savedProjects: state.savedProjects,
                exportConfig: state.exportConfig,
                // In-progress working session so a refresh mid-edit restores the user's work.
                spec: state.spec,
                specSource: state.specSource,
                specFormat: state.specFormat,
                tools: state.tools,
                authConfig: state.authConfig,
                mcpServerAuthConfig: state.mcpServerAuthConfig,
                serverConfig: state.serverConfig,
                currentStep: state.currentStep,
            }),
        }
    )
);
