import type {
    ApiMediaType,
    ApiModel,
    ApiOperation,
    ApiParameter,
    ApiSecurityRequirement,
    ApiSecurityScheme,
} from "@/lib/api-model";
import type {
    ParamLocation,
    ToolAuthPlan,
    ToolManualReviewFlag,
    ToolPlan,
    ToolPlanParameter,
    ToolRequestBodyPlan,
    ToolSerializationPlan,
    ToolSerializedParameter,
} from "./types.ts";
import { getBodyContentKind, isBinarySchema, isShallowSimpleObjectSchema, makeUniqueIdentifier, toSafeIdentifier } from "./utils.ts";

function operationFallbackName(operation: ApiOperation): string {
    return `${operation.method.toLowerCase()}_${operation.path.replace(/[{}]/g, "")}`;
}

function getToolName(operation: ApiOperation, seen: Set<string>, index: number): string {
    const desired = operation.operationId || operation.source?.name || operation.summary || operationFallbackName(operation);
    return makeUniqueIdentifier(desired, seen, `tool_${index + 1}`);
}

function getDescription(operation: ApiOperation): string {
    if (operation.description?.trim()) return operation.description.trim();
    if (operation.summary?.trim()) return operation.summary.trim();
    return `${operation.method} ${operation.path}`;
}

function chooseRequestMedia(operation: ApiOperation): ApiMediaType | undefined {
    const content = operation.requestBody?.content || [];
    if (content.length === 0) return undefined;

    return content.find((media) => media.mediaType === "application/json")
        || content.find((media) => media.mediaType.includes("+json"))
        || content.find((media) => media.mediaType === "application/x-www-form-urlencoded")
        || content.find((media) => media.mediaType === "multipart/form-data")
        || content[0];
}

function isObjectWithNamedProperties(schema?: Record<string, unknown>): boolean {
    return Boolean(schema?.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties));
}

function getSchemaProperties(schema: Record<string, unknown>): Record<string, Record<string, unknown>> {
    return (schema.properties || {}) as Record<string, Record<string, unknown>>;
}

function getBodyParameterDescription(schema: Record<string, unknown>, contentKind: ToolRequestBodyPlan["contentKind"]): string {
    const description = typeof schema.description === "string" ? schema.description : "";
    if (contentKind !== "multipart" || !isBinarySchema(schema)) return description;

    const multipartDescription = "Base64-encoded file content.";
    return description ? `${description} ${multipartDescription}` : multipartDescription;
}

function buildParameterPlans(parameters: ApiParameter[], seenArgs: Set<string>): ToolPlanParameter[] {
    return parameters.map((parameter, index) => ({
        argName: makeUniqueIdentifier(parameter.name, seenArgs, `param_${index + 1}`),
        sourceName: parameter.name,
        location: parameter.in,
        required: parameter.required,
        description: parameter.description || "",
        schema: parameter.schema,
        style: parameter.style,
        explode: parameter.explode,
    }));
}

function buildBodyParameterPlans(
    media: ApiMediaType | undefined,
    requiredBody: boolean,
    seenArgs: Set<string>,
    contentKind: ToolRequestBodyPlan["contentKind"]
): ToolPlanParameter[] {
    if (!media?.schema) return [];

    if (
        (contentKind === "flattenedObject" && isShallowSimpleObjectSchema(media.schema)) ||
        (["formUrlencoded", "multipart"].includes(contentKind || "") && isObjectWithNamedProperties(media.schema))
    ) {
        const requiredFields = new Set((media.schema.required || []) as string[]);
        return Object.entries(getSchemaProperties(media.schema)).map(([name, schema], index) => ({
            argName: makeUniqueIdentifier(name, seenArgs, `body_${index + 1}`),
            sourceName: name,
            location: "body",
            required: requiredBody && requiredFields.has(name),
            description: getBodyParameterDescription(schema, contentKind),
            schema,
        }));
    }

    return [{
        argName: makeUniqueIdentifier("body", seenArgs, "body"),
        sourceName: "body",
        location: "body",
        required: requiredBody,
        description: media.schema.description as string || "",
        schema: media.schema,
    }];
}

function buildInputSchema(parameters: ToolPlanParameter[]): Record<string, unknown> {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const parameter of parameters) {
        properties[parameter.argName] = {
            ...(parameter.schema || { type: "string" }),
            description: parameter.description || undefined,
        };

        if (parameter.required) {
            required.push(parameter.argName);
        }
    }

    return {
        type: "object",
        properties,
        required,
        additionalProperties: false,
    };
}

function getEffectiveSecurity(operation: ApiOperation, apiModel: ApiModel): {
    source: ToolAuthPlan["source"];
    requirements: ApiSecurityRequirement[];
} {
    if (operation.security !== undefined) {
        return { source: "operation", requirements: operation.security };
    }

    return { source: apiModel.security.length > 0 ? "global" : "none", requirements: apiModel.security };
}

function getAuthStrategyFromScheme(
    schemeName: string,
    scheme: ApiSecurityScheme | undefined
): Pick<ToolAuthPlan, "strategy" | "apiKeyName" | "apiKeyLocation"> | undefined {
    if (!scheme) return undefined;

    if (scheme.type === "apiKey") {
        const location = scheme.in === "query" ? "query" : "header";
        return {
            strategy: location === "query" ? "apiKeyQuery" : "apiKeyHeader",
            apiKeyName: typeof scheme.name === "string" ? scheme.name : schemeName,
            apiKeyLocation: location,
        };
    }

    if (scheme.type === "http" && scheme.scheme === "bearer") {
        return { strategy: "bearer" };
    }

    if (scheme.type === "http" && scheme.scheme === "basic") {
        return { strategy: "basic" };
    }

    return undefined;
}

function buildAuthPlan(
    operation: ApiOperation,
    apiModel: ApiModel,
    warnings: string[],
    manualReview: ToolManualReviewFlag[]
): ToolAuthPlan {
    const { source, requirements } = getEffectiveSecurity(operation, apiModel);
    const nonEmptyRequirements = requirements.filter((requirement) => Object.keys(requirement).length > 0);

    if (nonEmptyRequirements.length === 0) {
        return { strategy: "none", source: "none" };
    }

    if (nonEmptyRequirements.length > 1) {
        warnings.push("Multiple alternative security requirements were found; the first supported requirement was selected.");
    }

    for (const requirement of nonEmptyRequirements) {
        for (const schemeName of Object.keys(requirement)) {
            const auth = getAuthStrategyFromScheme(schemeName, apiModel.securitySchemes[schemeName]);
            if (auth) {
                return {
                    ...auth,
                    source,
                    schemeName,
                    requirement,
                };
            }
        }
    }

    manualReview.push({
        code: "unsupported-auth",
        severity: "warning",
        message: "No supported auth strategy could be inferred from this operation's security requirements.",
    });

    return { strategy: "none", source: "unsupported", requirement: nonEmptyRequirements[0] };
}

function getRequestBodyStrategy(
    operation: ApiOperation,
    media: ApiMediaType | undefined
): ToolRequestBodyPlan {
    if (!media) {
        return { required: false };
    }

    const contentKind = getBodyContentKind(
        {
            endpointId: operation.id,
            enabled: true,
            toolName: operation.operationId || operation.summary || operation.id,
            description: getDescription(operation),
            parameters: [],
            bodySchema: media.schema,
            bodyContentType: media.mediaType,
        },
        []
    );

    return {
        required: operation.requestBody?.required || false,
        contentType: media.mediaType,
        contentKind,
        schema: media.schema,
    };
}

function serializeParameters(parameters: ToolPlanParameter[], location: Exclude<ParamLocation, "body">): ToolSerializedParameter[] {
    return parameters
        .filter((parameter) => parameter.location === location)
        .map((parameter) => ({
            argName: parameter.argName,
            sourceName: parameter.sourceName,
            required: parameter.required,
            style: parameter.style,
            explode: parameter.explode,
        }));
}

function buildSerializationStrategy(
    parameters: ToolPlanParameter[],
    requestBody: ToolRequestBodyPlan
): ToolSerializationPlan {
    const bodyParams = parameters.filter((parameter) => parameter.location === "body");

    return {
        path: serializeParameters(parameters, "path"),
        query: serializeParameters(parameters, "query"),
        header: serializeParameters(parameters, "header"),
        cookie: serializeParameters(parameters, "cookie"),
        requestBody: requestBody.contentType && requestBody.contentKind
            ? {
                contentType: requestBody.contentType,
                contentKind: requestBody.contentKind,
                parameterNames: bodyParams.map((parameter) => parameter.argName),
            }
            : undefined,
    };
}

function pushRequestBodyReviewFlags(
    requestBody: ToolRequestBodyPlan,
    manualReview: ToolManualReviewFlag[]
) {
    if (requestBody.contentKind === "binary") {
        manualReview.push({
            code: "binary-request-body",
            severity: "warning",
            message: "Binary request body serialization needs manual review for the target runtime.",
        });
    }

    if (requestBody.contentType && !requestBody.contentKind) {
        manualReview.push({
            code: "unknown-request-body",
            severity: "warning",
            message: `Request body content type "${requestBody.contentType}" could not be mapped to a serialization strategy.`,
        });
    }
}

export function planToolFromOperation(
    apiModel: ApiModel,
    operation: ApiOperation,
    options: { toolName?: string; description?: string; preferredContentType?: string; index?: number; seenToolNames?: Set<string> } = {}
): ToolPlan {
    const warnings: string[] = [];
    const manualReview: ToolManualReviewFlag[] = [];
    const seenArgs = new Set<string>();
    const toolName = options.toolName
        ? toSafeIdentifier(options.toolName, `tool_${(options.index || 0) + 1}`)
        : getToolName(operation, options.seenToolNames || new Set<string>(), options.index || 0);
    const media = options.preferredContentType
        ? operation.requestBody?.content.find((candidate) => candidate.mediaType === options.preferredContentType) || chooseRequestMedia(operation)
        : chooseRequestMedia(operation);
    const requestBodyStrategy = getRequestBodyStrategy(operation, media);
    const parameters = [
        ...buildParameterPlans(operation.parameters, seenArgs),
        ...buildBodyParameterPlans(media, operation.requestBody?.required || false, seenArgs, requestBodyStrategy.contentKind),
    ];

    pushRequestBodyReviewFlags(requestBodyStrategy, manualReview);

    return {
        id: operation.id,
        operationId: operation.operationId,
        method: operation.method,
        path: operation.path,
        toolName,
        inputSchema: buildInputSchema(parameters),
        description: options.description?.trim() || getDescription(operation),
        authStrategy: buildAuthPlan(operation, apiModel, warnings, manualReview),
        requestBodyStrategy,
        serializationStrategy: buildSerializationStrategy(parameters, requestBodyStrategy),
        parameters,
        warnings,
        manualReview,
    };
}

export function buildToolPlans(apiModel: ApiModel): ToolPlan[] {
    const seenToolNames = new Set<string>();

    return apiModel.operations.map((operation, index) =>
        planToolFromOperation(apiModel, operation, { index, seenToolNames })
    );
}
