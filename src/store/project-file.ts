import type {
    AuthConfig,
    ExportConfig,
    McpServerAuthConfig,
    ParsedSpec,
    ServerConfig,
    ToolConfig,
} from "./project-store";

export interface ProjectSnapshotData {
    spec: ParsedSpec;
    specSource: string;
    specFormat: string;
    tools: ToolConfig[];
    authConfig: AuthConfig;
    mcpServerAuthConfig: McpServerAuthConfig;
    serverConfig: ServerConfig;
    exportConfig: ExportConfig;
}

export interface PortableProjectFile {
    schemaVersion: 1;
    kind: "mcpmint-project";
    exportedAt: string;
    project: {
        id: string;
        name: string;
        source: string;
        format: string;
        endpointCount: number;
        savedAt: number;
    };
    data: ProjectSnapshotData;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function serializeProjectFile(file: PortableProjectFile): string {
    return `${JSON.stringify(file, null, 2)}\n`;
}

export function parseProjectFile(text: string): PortableProjectFile {
    let value: unknown;
    try {
        value = JSON.parse(text);
    } catch (error) {
        throw new Error(`Project file is not valid JSON${error instanceof Error ? `: ${error.message}` : ""}`);
    }
    if (!isRecord(value) || value.kind !== "mcpmint-project" || value.schemaVersion !== 1) {
        throw new Error("Unsupported project file. Expected a mcpmint-project with schemaVersion 1.");
    }
    if (!isRecord(value.project) || typeof value.project.id !== "string" || typeof value.project.name !== "string") {
        throw new Error("Project file metadata is missing a valid id or name.");
    }
    if (!isRecord(value.data) || !isRecord(value.data.spec) || !isRecord(value.data.spec.apiModel)) {
        throw new Error("Project file does not contain a canonical parsed API model.");
    }
    if (!Array.isArray(value.data.tools) || !isRecord(value.data.serverConfig) || !isRecord(value.data.exportConfig)) {
        throw new Error("Project file is missing tool or generation configuration.");
    }
    return value as unknown as PortableProjectFile;
}
