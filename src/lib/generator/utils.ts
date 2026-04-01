import type {
    GenerationFeatureFlags,
    GeneratorExportConfig,
    GeneratorToolParameter,
    GeneratorToolConfig,
    ParamLocation,
    RequestBodyContentKind,
    Transport,
    TransportStrategy,
} from "./types.ts";

export function parseEndpointId(id: string): { method: string; path: string } {
    if (id.includes("::")) {
        const [method, path] = id.split("::");
        return { method, path };
    }

    const postmanMatch = id.match(/^(GET|POST|PUT|DELETE|PATCH)-(.+)-(\d+)$/);
    if (postmanMatch) {
        return {
            method: postmanMatch[1],
            path: postmanMatch[2],
        };
    }

    const [method, ...pathParts] = id.split("-");
    return { method, path: pathParts.join("-") };
}

export function toSafeIdentifier(value: string, fallback: string): string {
    const normalized = value
        .trim()
        .replace(/[^a-zA-Z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "");

    const safeValue = normalized || fallback;
    return /^[a-zA-Z_]/.test(safeValue) ? safeValue : `${fallback}_${safeValue}`;
}

export function makeUniqueIdentifier(
    desired: string,
    existing: Set<string>,
    fallback: string
): string {
    const base = toSafeIdentifier(desired, fallback);

    if (!existing.has(base)) {
        existing.add(base);
        return base;
    }

    let counter = 2;
    while (existing.has(`${base}_${counter}`)) {
        counter += 1;
    }

    const unique = `${base}_${counter}`;
    existing.add(unique);
    return unique;
}

export function toJsStringLiteral(str: string): string {
    if (!str) return '""';

    const escaped = str
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t");

    return `"${escaped}"`;
}

export function toPythonStringLiteral(str: string): string {
    if (!str) return '""';

    const escaped = str
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n");

    return `"${escaped}"`;
}

export function getParameterLocation(
    parameter: GeneratorToolParameter,
    path: string,
    method: string
): ParamLocation {
    if (parameter.location) {
        return parameter.location;
    }

    if (path.includes(`{${parameter.originalName || parameter.name}}`)) {
        return "path";
    }

    if (["POST", "PUT", "PATCH"].includes(method)) {
        return "body";
    }

    return "query";
}

export function getBodyContentKind(
    tool: GeneratorToolConfig,
    params: { location: ParamLocation; sourceName: string }[]
): RequestBodyContentKind | undefined {
    const bodyParams = params.filter((param) => param.location === "body");
    if (bodyParams.length === 0 && !tool.bodySchema) {
        return undefined;
    }

    const contentType = (tool.bodyContentType || "application/json").toLowerCase();
    const bodyType = tool.bodySchema?.type;
    const isRawBody =
        bodyParams.length === 1 &&
        (
            bodyParams[0].sourceName === "body" ||
            bodyType === "array" ||
            bodyType === "string" ||
            bodyType === "number" ||
            bodyType === "integer" ||
            bodyType === "boolean"
        );

    if (contentType.includes("application/x-www-form-urlencoded")) {
        return "form-urlencoded";
    }

    if (contentType.includes("multipart/form-data")) {
        return "multipart";
    }

    if (contentType.startsWith("text/")) {
        return "text";
    }

    if (
        contentType.includes("application/octet-stream") ||
        contentType.includes("application/pdf") ||
        contentType.startsWith("image/")
    ) {
        return "binary";
    }

    return isRawBody ? "json-raw" : "json-object";
}

export function getTransportStrategy(transport: Transport): TransportStrategy {
    if (transport === "http") {
        return "streamableHttp";
    }

    return transport;
}

export function getDefaultFeatures(exportConfig: GeneratorExportConfig): GenerationFeatureFlags {
    return {
        documentation: exportConfig.features?.documentation ?? true,
        docker: exportConfig.features?.docker ?? false,
        tests: exportConfig.features?.tests ?? true,
        verification: exportConfig.features?.verification ?? true,
    };
}

export function getNodeInstallCommand(packageManager: string): string {
    return `${packageManager} install`;
}

export function getNodeScriptCommand(packageManager: string, script: string): string {
    return packageManager === "npm"
        ? `npm run ${script}`
        : `${packageManager} ${script}`;
}
