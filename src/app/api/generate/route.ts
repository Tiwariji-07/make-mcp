import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
    createArchivedProject,
    createPreviewResponse,
} from "@/lib/generator";
import { parseGeneratorRequestPayload } from "@/lib/generator/request";

// Reject oversized payloads before parsing (finding H2/R1). request.json() is
// otherwise unbounded; a huge body can exhaust memory during parse. ~5MB is
// generous for realistic API specs.
const MAX_BODY_BYTES = 5 * 1024 * 1024;

// --- Best-effort in-memory rate limiter (finding H2) -----------------------
// Fixed-window per-IP counter. This is BEST-EFFORT and PER-INSTANCE only: it
// does not survive restarts and is not shared across serverless instances or
// horizontally-scaled replicas. For production-grade, durable limiting use a
// shared store (e.g. Upstash Redis / Vercel KV) keyed by IP.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;

interface RateWindow {
    count: number;
    resetAt: number;
}

const rateLimitBuckets = new Map<string, RateWindow>();

function getClientIp(request: NextRequest): string {
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
        // First hop is the originating client.
        const firstHop = forwardedFor.split(",")[0]?.trim();
        if (firstHop) {
            return firstHop;
        }
    }

    return "unknown";
}

function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const existing = rateLimitBuckets.get(ip);

    if (!existing || now >= existing.resetAt) {
        rateLimitBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });

        // Opportunistically evict expired buckets so the map does not grow
        // unbounded on a busy instance.
        if (rateLimitBuckets.size > 10_000) {
            for (const [key, window] of rateLimitBuckets) {
                if (now >= window.resetAt) {
                    rateLimitBuckets.delete(key);
                }
            }
        }

        return false;
    }

    existing.count += 1;
    return existing.count > RATE_LIMIT_MAX_REQUESTS;
}

// Full verification runs npm install/build/test or a Python venv + pip install
// synchronously in the request path (verify.ts) — a trivial DoS. It is gated
// off unless explicitly enabled on the server (finding R1).
function isFullVerifyAllowed(): boolean {
    return process.env.MAKEMCP_ALLOW_FULL_VERIFY === "1";
}

// Mirror the request-validation charset so the value placed into the
// Content-Disposition header can never contain quotes, newlines or path
// separators (header-injection defense, finding M1/R7).
function sanitizeFilename(name: string): string {
    const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^[.-]+/, "").slice(0, 64);
    return cleaned.length > 0 ? cleaned : "mcp-server";
}

export async function POST(request: NextRequest) {
    const clientIp = getClientIp(request);
    if (isRateLimited(clientIp)) {
        return NextResponse.json(
            { error: "Too many requests. Please slow down and try again shortly." },
            { status: 429 }
        );
    }

    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
        return NextResponse.json(
            { error: "Request payload too large." },
            { status: 413 }
        );
    }

    let body;
    try {
        body = parseGeneratorRequestPayload(await request.json());
    } catch (error) {
        if (error instanceof ZodError) {
            return NextResponse.json(
                { error: "Invalid request payload." },
                { status: 400 }
            );
        }

        // Malformed JSON etc.
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
