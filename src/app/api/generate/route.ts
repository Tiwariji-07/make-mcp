import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
    createArchivedProject,
    createPreviewResponse,
} from "@/lib/generator";
import { parseGeneratorRequestPayload } from "@/lib/generator/request";
import type { GeneratorRequest } from "@/lib/generator/types";
import {
    checkRateLimit,
    isFullVerifyAllowed,
    isProcessVerificationAllowed,
    PayloadTooLargeError,
    readJsonBodyCapped,
} from "@/lib/api/request-guards";

// Reject oversized payloads before parsing. ~5MB is generous for realistic API
// specs; the body is streamed with a hard byte budget (not Content-Length alone).
const MAX_BODY_BYTES = 5 * 1024 * 1024;

// Keep generate/preview within a predictable serverless budget. Process-spawning
// verification is off by default on the public path, so this stays short.
export const maxDuration = 60;

// Mirror the request-validation charset so the value placed into the
// Content-Disposition header can never contain quotes, newlines or path
// separators (header-injection defense).
function sanitizeFilename(name: string): string {
    const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^[.-]+/, "").slice(0, 64);
    return cleaned.length > 0 ? cleaned : "mcp-server";
}

/**
 * On the public server path, never spawn tsc/npm/pip unless the operator has
 * explicitly opted in. Clients may still request verification; we strip it
 * server-side so it cannot be used as a free DoS.
 */
function applyPublicVerificationPolicy(body: GeneratorRequest): GeneratorRequest {
    const wantsFull = body.exportConfig.verificationMode === "full";
    if (wantsFull && !isFullVerifyAllowed()) {
        // Caller will reject with 400 before generation when full is requested
        // but disabled — keep mode intact so the check can fire.
        return body;
    }

    if (isProcessVerificationAllowed()) {
        return body;
    }

    return {
        ...body,
        exportConfig: {
            ...body.exportConfig,
            // Force off process-based verification on the public path.
            verificationMode: "fast",
            features: {
                ...body.exportConfig.features,
                verification: false,
            },
        },
    };
}

export async function POST(request: NextRequest) {
    const rate = await checkRateLimit(request, "generate");
    if (rate.limited) {
        return NextResponse.json(
            { error: "Too many requests. Please slow down and try again shortly." },
            { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } }
        );
    }

    let rawBody: unknown;
    try {
        rawBody = await readJsonBodyCapped(request, MAX_BODY_BYTES);
    } catch (error) {
        if (error instanceof PayloadTooLargeError) {
            return NextResponse.json({ error: "Request payload too large." }, { status: 413 });
        }
        return NextResponse.json(
            { error: "Invalid request payload." },
            { status: 400 }
        );
    }

    let body: GeneratorRequest;
    try {
        body = parseGeneratorRequestPayload(rawBody);
    } catch (error) {
        if (error instanceof ZodError) {
            return NextResponse.json(
                { error: "Invalid request payload." },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: "Invalid request payload." },
            { status: 400 }
        );
    }

    if (body.exportConfig.verificationMode === "full" && !isFullVerifyAllowed()) {
        return NextResponse.json(
            { error: "Full verification is not enabled on this server." },
            { status: 400 }
        );
    }

    body = applyPublicVerificationPolicy(body);

    try {
        const isPreview = request.nextUrl.searchParams.get("preview") === "true";

        if (isPreview) {
            return NextResponse.json(createPreviewResponse(body));
        }

        const { archive } = await createArchivedProject(body);

        return new NextResponse(new Uint8Array(archive), {
            headers: {
                "Content-Type": "application/zip",
                "Content-Disposition": `attachment; filename="${sanitizeFilename(body.serverConfig.name)}.zip"`,
            },
        });
    } catch (error) {
        // Do not leak raw internals (stack traces, multi-line errors).
        console.error("Generation error:", error);
        return NextResponse.json(
            { error: "Generation failed." },
            { status: 500 }
        );
    }
}
