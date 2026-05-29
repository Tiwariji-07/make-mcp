import {
    GENERATOR_CONTRACT_VERSION,
    GENERATOR_VERSION,
    type GenerationPlan,
    type GenerationTool,
    type GeneratorRequest,
    type GenerationParam,
    type GeneratorToolParameter,
} from "./types.ts";
import type { ApiMediaType, ApiModel, ApiOperation, ApiParameter } from "@/lib/api-model";
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

function getCanonicalOperation(apiModel: ApiModel | undefined, endpointId: string): ApiOperation | undefined {
    return apiModel?.operations.find((operation) => operation.id === endpointId);
}

function getCanonicalParameter(operation: ApiOperation | undefined, parameter: GeneratorToolParameter): ApiParameter | undefined {
    return operation?.parameters.find((candidate) =>
        candidate.name === parameter.originalName ||
        candidate.name === parameter.name
    );
}

function getCanonicalRequestMedia(operation: ApiOperation | undefined, preferredContentType?: string): ApiMediaType | undefined {
    if (!operation?.requestBody?.content.length) return undefined;

    return operation.requestBody.content.find((media) => media.mediaType === preferredContentType)
        || operation.requestBody.content[0];
}

function normalizeTool(
    tool: GeneratorRequest["tools"][number],
    toolIndex: number,
    warnings: string[],
    apiModel?: ApiModel
): GenerationTool {
    const canonicalOperation = getCanonicalOperation(apiModel, tool.endpointId);
    const parsedEndpoint = parseEndpointId(tool.endpointId);
    const method = canonicalOperation?.method || parsedEndpoint.method;
    const path = canonicalOperation?.path || parsedEndpoint.path;
    const seenArgs = new Set<string>();
    const displayName = tool.toolName.trim() || `tool_${toolIndex + 1}`;
    const functionName = makeUniqueIdentifier(displayName, new Set<string>(), `tool_${toolIndex + 1}`);
    const canonicalMedia = getCanonicalRequestMedia(canonicalOperation, tool.bodyContentType);

    if (displayName !== tool.toolName) {
        warnings.push(`Trimmed empty or padded tool name for ${tool.endpointId}`);
    }

    const params: GenerationParam[] = tool.parameters.map((parameter, parameterIndex) => {
        const canonicalParameter = getCanonicalParameter(canonicalOperation, parameter);
        const desired = parameter.name || parameter.originalName || `param_${parameterIndex + 1}`;
        const argName = makeUniqueIdentifier(desired, seenArgs, `param_${parameterIndex + 1}`);
        const location = canonicalParameter?.in || getParameterLocation(parameter, path, method);

        if (argName !== desired) {
            warnings.push(`Normalized parameter "${desired}" to "${argName}" for ${displayName}`);
        }

        return {
            argName,
            sourceName: canonicalParameter?.name || parameter.originalName || parameter.name,
            type: parameter.type,
            required: canonicalParameter?.required ?? parameter.required,
            description: parameter.description || canonicalParameter?.description || "",
            location,
            schema: canonicalParameter?.schema || parameter.schema,
        };
    });

    const bodyParams = params.filter((param) => param.location === "body");
    const bodySchema = canonicalMedia?.schema || tool.bodySchema;
    const bodyContentType = canonicalMedia?.mediaType || tool.bodyContentType;
    const contentKind = getBodyContentKind({ ...tool, bodySchema, bodyContentType }, params);
    const requestBody = contentKind
        ? {
            contentType: bodyContentType || "application/json",
            contentKind,
            schema: bodySchema,
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
        const normalized = normalizeTool(tool, index, warnings, request.spec.apiModel);
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
            baseUrl: request.spec.apiModel?.baseUrls[0] || request.spec.baseUrl,
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
