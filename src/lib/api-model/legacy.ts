import type { ParsedEndpoint, ParsedParameter, ParsedSpec } from "./parsed-spec.ts";
import type { ApiMediaType, ApiModel, ApiOperation, ApiParameter, ApiSchema } from "./types";

export function getTypeFromApiSchema(schema?: ApiSchema): string {
    if (!schema) return "string";

    const allOf = schema.allOf as ApiSchema[] | undefined;
    if (Array.isArray(allOf) && allOf.length > 0) {
        return getTypeFromApiSchema(allOf.find((item) => item.type || item.properties) || allOf[0]);
    }

    const oneOf = schema.oneOf as ApiSchema[] | undefined;
    const anyOf = schema.anyOf as ApiSchema[] | undefined;
    const alternatives = oneOf || anyOf;
    if (Array.isArray(alternatives) && alternatives.length > 0) {
        const types = [...new Set(alternatives.map((item) => getTypeFromApiSchema(item)))];
        return types.length === 1 ? types[0] : types.join(" | ");
    }

    if (schema.type === "array") {
        const items = schema.items as ApiSchema | undefined;
        return items ? `${getTypeFromApiSchema(items)}[]` : "any[]";
    }

    if (schema.type === "object" || schema.properties) return "object";

    return typeof schema.type === "string" ? schema.type : "string";
}

function firstMediaType(content?: ApiMediaType[]): ParsedEndpoint["requestBody"] | undefined {
    const media = content?.[0];
    if (!media) return undefined;

    return {
        required: false,
        contentType: media.mediaType,
        schema: media.schema || {},
    };
}

function toParsedParameter(parameter: ApiParameter): ParsedParameter {
    return {
        name: parameter.name,
        in: parameter.in,
        required: parameter.required,
        type: getTypeFromApiSchema(parameter.schema),
        description: parameter.description,
    };
}

function toParsedEndpoint(operation: ApiOperation): ParsedEndpoint {
    const requestBody = firstMediaType(operation.requestBody?.content);

    return {
        id: operation.id,
        method: operation.method as ParsedEndpoint["method"],
        path: operation.path,
        operationId: operation.operationId,
        summary: operation.summary,
        description: operation.description,
        tags: operation.tags,
        parameters: operation.parameters.map(toParsedParameter),
        requestBody: requestBody
            ? { ...requestBody, required: operation.requestBody?.required || false }
            : undefined,
    };
}

export function apiModelToParsedSpec(apiModel: ApiModel): ParsedSpec {
    const supportedMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

    return {
        info: {
            title: apiModel.info.title,
            version: apiModel.info.version,
            description: apiModel.info.description,
        },
        baseUrl: apiModel.baseUrls[0] || "",
        endpoints: apiModel.operations
            .filter((operation) => supportedMethods.has(operation.method))
            .map(toParsedEndpoint),
        securitySchemes: apiModel.securitySchemes,
        format: apiModel.source.format,
        apiModel,
    };
}
