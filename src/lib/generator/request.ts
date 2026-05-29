import { z } from "zod";
import type { GeneratorRequest } from "./types.ts";
import type { ApiModel } from "@/lib/api-model";

const parameterLocationSchema = z.enum(["path", "query", "header", "cookie", "body"]);

const toolParameterSchema = z.object({
    name: z.string().trim().min(1),
    originalName: z.string().trim().min(1),
    type: z.string().trim().min(1),
    required: z.boolean(),
    description: z.string().default(""),
    location: parameterLocationSchema.optional(),
    schema: z.record(z.string(), z.unknown()).optional(),
    hidden: z.boolean().optional(),
});

const toolSchema = z.object({
    endpointId: z.string().trim().min(1),
    enabled: z.boolean().default(true),
    toolName: z.string().trim().min(1),
    description: z.string().default(""),
    parameters: z.array(toolParameterSchema),
    bodySchema: z.record(z.string(), z.unknown()).optional(),
    bodyContentType: z.string().trim().min(1).optional(),
});

const authSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("none") }),
    z.object({
        type: z.literal("apiKey"),
        apiKey: z.object({
            name: z.string().trim().min(1),
            in: z.enum(["header", "query"]),
        }),
    }),
    z.object({ type: z.literal("bearer") }),
    z.object({ type: z.literal("basic") }),
]);

const exportSchema = z.object({
    language: z.enum(["node", "python"]),
    framework: z.enum(["mcp-ts-sdk", "fastmcp"]),
    packageManager: z.enum(["npm", "pnpm", "yarn"]),
    features: z.object({
        documentation: z.boolean().optional(),
        docker: z.boolean().optional(),
        tests: z.boolean().optional(),
        verification: z.boolean().optional(),
    }).optional(),
});

const requestSchema = z.object({
    spec: z.object({
        info: z.object({
            title: z.string().trim().min(1),
            version: z.string().trim().min(1),
            description: z.string().optional(),
        }),
        baseUrl: z.string().default(""),
        apiModel: z.custom<ApiModel>().optional(),
    }),
    tools: z.array(toolSchema),
    serverConfig: z.object({
        name: z.string().trim().min(1),
        version: z.string().trim().min(1),
        host: z.string().trim().min(1),
        port: z.number().int().min(1).max(65535),
        transport: z.enum(["stdio", "sse", "http"]).default("http"),
    }),
    authConfig: authSchema,
    exportConfig: exportSchema,
});

export function parseGeneratorRequestPayload(input: unknown): GeneratorRequest {
    return requestSchema.parse(input);
}
