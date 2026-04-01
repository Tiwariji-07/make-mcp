import {
    GENERATOR_CONTRACT_VERSION,
    GENERATOR_VERSION,
    type GenerationPlan,
    type GenerationTool,
    type GeneratorRequest,
    type GenerationParam,
} from "./types.ts";
import {
    getBodyContentKind,
    getDefaultFeatures,
    getParameterLocation,
    getTransportStrategy,
    makeUniqueIdentifier,
    parseEndpointId,
} from "./utils.ts";

function makeUniqueDisplayName(desired: string, existing: Set<string>, fallback: string): string {
    const base = desired.trim() || fallback;

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

function normalizeAuth(input: GeneratorRequest["authConfig"]): GenerationPlan["auth"] {
    if (input.type === "apiKey") {
        return {
            strategy: input.apiKey?.in === "query" ? "apiKeyQuery" : "apiKeyHeader",
            type: "apiKey",
            apiKeyName: input.apiKey?.name || "X-API-Key",
            apiKeyLocation: input.apiKey?.in || "header",
        };
    }

    if (input.type === "bearer") {
        return { strategy: "bearer", type: input.type };
    }

    if (input.type === "basic") {
        return { strategy: "basic", type: input.type };
    }

    return { strategy: "none", type: input.type };
}

function normalizeTool(tool: GeneratorRequest["tools"][number], toolIndex: number, warnings: string[]): GenerationTool {
    const { method, path } = parseEndpointId(tool.endpointId);
    const seenArgs = new Set<string>();
    const displayName = tool.toolName.trim() || `tool_${toolIndex + 1}`;
    const functionName = makeUniqueIdentifier(displayName, new Set<string>(), `tool_${toolIndex + 1}`);

    if (displayName !== tool.toolName) {
        warnings.push(`Trimmed empty or padded tool name for ${tool.endpointId}`);
    }

    const params: GenerationParam[] = tool.parameters.map((parameter, parameterIndex) => {
        const desired = parameter.name || parameter.originalName || `param_${parameterIndex + 1}`;
        const argName = makeUniqueIdentifier(desired, seenArgs, `param_${parameterIndex + 1}`);
        const location = getParameterLocation(parameter, path, method);

        if (argName !== desired) {
            warnings.push(`Normalized parameter "${desired}" to "${argName}" for ${displayName}`);
        }

        return {
            argName,
            sourceName: parameter.originalName || parameter.name,
            type: parameter.type,
            required: parameter.required,
            description: parameter.description,
            location,
            schema: parameter.schema,
        };
    });

    const bodyParams = params.filter((param) => param.location === "body");
    const contentKind = getBodyContentKind(tool, params);
    const requestBody = contentKind
        ? {
            contentType: tool.bodyContentType || "application/json",
            contentKind,
            schema: tool.bodySchema,
            params: bodyParams,
        }
        : undefined;

    if (requestBody?.contentKind === "binary") {
        warnings.push(`Binary request bodies for ${displayName} require manual review in generated clients`);
    }

    return {
        id: tool.endpointId,
        displayName,
        functionName,
        description: tool.description || `${method} ${path}`,
        method: method as GenerationTool["method"],
        path,
        params,
        requestBody,
    };
}

export function buildGenerationPlan(request: GeneratorRequest): GenerationPlan {
    const warnings: string[] = [];
    const seenToolNames = new Set<string>();
    const seenFunctionNames = new Set<string>();

    const tools = request.tools.map((tool, index) => {
        const normalized = normalizeTool(tool, index, warnings);
        const uniqueDisplayName = makeUniqueDisplayName(
            normalized.displayName,
            seenToolNames,
            `tool_${index + 1}`
        );
        const uniqueFunctionName = makeUniqueIdentifier(
            normalized.functionName,
            seenFunctionNames,
            `tool_${index + 1}`
        );

        if (uniqueDisplayName !== normalized.displayName) {
            warnings.push(`Renamed duplicate tool "${normalized.displayName}" to "${uniqueDisplayName}"`);
        }

        if (uniqueFunctionName !== normalized.functionName) {
            warnings.push(`Adjusted generated function name for "${normalized.displayName}" to "${uniqueFunctionName}"`);
        }

        return {
            ...normalized,
            displayName: uniqueDisplayName,
            functionName: uniqueFunctionName,
        };
    });

    return {
        generatorVersion: GENERATOR_VERSION,
        contractVersion: GENERATOR_CONTRACT_VERSION,
        generatedAt: new Date().toISOString(),
        spec: {
            title: request.spec.info.title,
            version: request.spec.info.version,
            description: request.spec.info.description,
            baseUrl: request.spec.baseUrl,
        },
        server: request.serverConfig,
        runtime: {
            language: request.exportConfig.language,
            framework: request.exportConfig.framework,
            packageManager: request.exportConfig.packageManager,
            transport: request.serverConfig.transport,
            transportStrategy: getTransportStrategy(request.serverConfig.transport),
        },
        auth: normalizeAuth(request.authConfig),
        features: getDefaultFeatures(request.exportConfig),
        tools,
        warnings,
    };
}
