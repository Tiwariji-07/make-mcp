import {
    GENERATOR_CONTRACT_VERSION,
    GENERATOR_VERSION,
    type GenerationPlan,
    type GenerationTool,
    type GeneratorRequest,
    type GenerationParam,
    type GeneratorToolParameter,
    type ToolPlan,
    type ToolAuthPlan,
    type ToolAuthSchemePlan,
    type ToolPlanParameter,
} from "./types.ts";
import type { ApiMediaType, ApiModel, ApiOperation, ApiParameter } from "@/lib/api-model";
import { planToolFromOperation } from "./planner.ts";
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
        const location = input.apiKey?.in || "header";
        return {
            strategy: location === "query"
                ? "apiKeyQuery"
                : location === "cookie"
                    ? "apiKeyCookie"
                    : "apiKeyHeader",
            type: "apiKey",
            apiKeyName: input.apiKey?.name || "X-API-Key",
            apiKeyLocation: location,
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

function authPlanFromNormalizedAuth(auth: GenerationPlan["auth"]): ToolAuthPlan {
    if (auth.strategy === "none") {
        return { strategy: "none", source: "none", requirements: [] };
    }

    const schemeName = auth.strategy === "apiKeyHeader" || auth.strategy === "apiKeyQuery" || auth.strategy === "apiKeyCookie"
        ? "apiKey"
        : auth.strategy;
    const scheme: ToolAuthSchemePlan = {
        strategy: auth.strategy,
        schemeName,
        apiKeyName: auth.apiKeyName,
        apiKeyLocation: auth.apiKeyLocation,
    };
    const requirement = { [schemeName]: [] };

    return {
        strategy: auth.strategy,
        source: "global",
        schemeName,
        apiKeyName: auth.apiKeyName,
        apiKeyLocation: auth.apiKeyLocation,
        requirement,
        requirements: [{ requirement, schemes: [scheme] }],
    };
}

function mergeFallbackAuthPlan(toolAuth: ToolAuthPlan, fallbackAuth: GenerationPlan["auth"]): ToolAuthPlan {
    if (toolAuth.strategy !== "none" || toolAuth.source !== "none" || fallbackAuth.strategy === "none") {
        return toolAuth;
    }

    return authPlanFromNormalizedAuth(fallbackAuth);
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

function getTypeFromSchema(schema?: Record<string, unknown>): string {
    if (!schema) return "string";
    if (schema.type === "array") return "array";
    if (schema.type === "object" || schema.properties) return "object";
    return typeof schema.type === "string" ? schema.type : "string";
}

function findConfiguredParameter(
    planParameter: ToolPlanParameter,
    configuredParameters: GeneratorToolParameter[],
    warnings?: string[],
    toolName?: string
): GeneratorToolParameter | undefined {
    const matchesIdentity = (parameter: GeneratorToolParameter) =>
        parameter.originalName === planParameter.sourceName ||
        parameter.name === planParameter.sourceName ||
        parameter.name === planParameter.argName;
    const locationMatch = configuredParameters.find((parameter) =>
        parameter.location === planParameter.location && matchesIdentity(parameter)
    );

    if (locationMatch) {
        return locationMatch;
    }

    const explicitWrongLocationMatches = configuredParameters.filter((parameter) =>
        parameter.location !== undefined &&
        parameter.location !== planParameter.location &&
        matchesIdentity(parameter)
    );
    if (explicitWrongLocationMatches.length > 0) {
        warnings?.push(`Ignored UI parameter override with mismatched location for "${planParameter.sourceName}" in ${toolName || "tool"}`);
    }

    const fallbackMatches = configuredParameters.filter((parameter) =>
        parameter.location === undefined && matchesIdentity(parameter)
    );
    if (fallbackMatches.length === 1) {
        return fallbackMatches[0];
    }

    if (fallbackMatches.length > 1) {
        warnings?.push(`Ignored ambiguous UI parameter override for "${planParameter.sourceName}" in ${toolName || "tool"}`);
    }

    return undefined;
}

function isParameterHidden(
    planParameter: ToolPlanParameter,
    configuredParameters: GeneratorToolParameter[],
    warnings: string[],
    toolName: string
): boolean {
    if (!findConfiguredParameter(planParameter, configuredParameters)?.hidden) {
        return false;
    }

    if (planParameter.location === "path" && planParameter.required) {
        warnings.push(`Ignored hidden override for required path parameter "${planParameter.sourceName}" in ${toolName}`);
        return false;
    }

    return true;
}

function toGenerationToolFromToolPlan(
    toolPlan: ToolPlan,
    tool: GeneratorRequest["tools"][number],
    warnings: string[],
    fallbackAuth: GenerationPlan["auth"]
): GenerationTool {
    const seenArgs = new Set<string>();
    const visibleParameters = toolPlan.parameters.filter((parameter) =>
        !isParameterHidden(parameter, tool.parameters, warnings, toolPlan.toolName)
    );
    const params: GenerationParam[] = visibleParameters.map((parameter, parameterIndex) => {
        const configuredParameter = findConfiguredParameter(parameter, tool.parameters, warnings, toolPlan.toolName);
        const desired = configuredParameter?.name || parameter.argName;
        const argName = makeUniqueIdentifier(desired, seenArgs, `param_${parameterIndex + 1}`);

        if (argName !== desired) {
            warnings.push(`Normalized parameter "${desired}" to "${argName}" for ${toolPlan.toolName}`);
        }

        return {
            argName,
            sourceName: parameter.sourceName,
            type: getTypeFromSchema(parameter.schema),
            required: parameter.required,
            description: configuredParameter?.description || parameter.description,
            location: parameter.location,
            schema: parameter.schema,
            style: parameter.style,
            explode: parameter.explode,
        };
    });
    const bodyParams = params.filter((param) => param.location === "body");
    const requestBody = toolPlan.requestBodyStrategy.contentKind
        ? {
            contentType: toolPlan.requestBodyStrategy.contentType || "application/json",
            contentKind: toolPlan.requestBodyStrategy.contentKind,
            schema: toolPlan.requestBodyStrategy.schema,
            params: bodyParams,
        }
        : undefined;

    warnings.push(...toolPlan.warnings);
    warnings.push(...toolPlan.manualReview.map((flag) => flag.message));

    return {
        id: toolPlan.id,
        displayName: toolPlan.toolName,
        functionName: makeUniqueIdentifier(toolPlan.toolName, new Set<string>(), "tool"),
        description: toolPlan.description,
        method: toolPlan.method as GenerationTool["method"],
        path: toolPlan.path,
        params,
        authStrategy: mergeFallbackAuthPlan(toolPlan.authStrategy, fallbackAuth),
        requestBody,
    };
}

function normalizeTool(
    tool: GeneratorRequest["tools"][number],
    toolIndex: number,
    warnings: string[],
    apiModel: ApiModel | undefined,
    fallbackAuth: GenerationPlan["auth"]
): GenerationTool {
    const canonicalOperation = getCanonicalOperation(apiModel, tool.endpointId);
    if (apiModel && canonicalOperation) {
        const displayName = tool.toolName.trim() || `tool_${toolIndex + 1}`;

        if (displayName !== tool.toolName) {
            warnings.push(`Trimmed empty or padded tool name for ${tool.endpointId}`);
        }

        return toGenerationToolFromToolPlan(
            planToolFromOperation(apiModel, canonicalOperation, {
                toolName: displayName,
                description: tool.description,
                preferredContentType: tool.bodyContentType,
                index: toolIndex,
            }),
            tool,
            warnings,
            fallbackAuth
        );
    }

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

    const params: GenerationParam[] = tool.parameters.filter((parameter) => !parameter.hidden).map((parameter, parameterIndex) => {
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
            style: canonicalParameter?.style,
            explode: canonicalParameter?.explode,
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
        authStrategy: authPlanFromNormalizedAuth(fallbackAuth),
        requestBody,
    };
}

export function buildGenerationPlan(request: GeneratorRequest): GenerationPlan {
    const warnings: string[] = [];
    const seenToolNames = new Set<string>();
    const seenFunctionNames = new Set<string>();
    const auth = normalizeAuth(request.authConfig);

    const tools = request.tools.map((tool, index) => {
        const normalized = normalizeTool(tool, index, warnings, request.spec.apiModel, auth);
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
        auth,
        features: getDefaultFeatures(request.exportConfig),
        verificationMode: request.exportConfig.verificationMode || "fast",
        tools,
        warnings,
    };
}
