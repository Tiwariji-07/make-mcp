import { NextRequest, NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { isIP, BlockList } from "node:net";

// ---------------------------------------------------------------------------
// Server-side spec-fetch proxy (Wave 2)
// ---------------------------------------------------------------------------
// PURPOSE: Fetch a user-supplied OpenAPI/Swagger/Postman spec URL SERVER-SIDE
// so the browser is not blocked by CORS. We return the RAW spec TEXT to the
// client; parsing stays client-side (same pipeline as the file/paste tabs).
//
// SECURITY (SSRF): This route makes outbound requests to attacker-controllable
// URLs, so it is an SSRF sink and is hardened accordingly:
//   1. Scheme allowlist  — only http/https. file:, gopher:, data:, etc. rejected.
//   2. IP validation     — the hostname is resolved to its IP(s) and EVERY
//      resolved address is checked against a blocklist of private/reserved
//      ranges (loopback, RFC1918, link-local incl. 169.254.169.254 cloud
//      metadata, IPv6 ULA, 0.0.0.0, etc.). Literal-IP hosts are validated too.
//      Validating the RESOLVED address (not just the literal host) defends
//      against hostnames that point at internal IPs.
//   3. Redirects         — automatic following is DISABLED (redirect:"manual").
//      Each redirect hop's Location is re-validated through the same anti-SSRF
//      check before we follow it, and hops are capped. This closes the
//      "public host 302-redirects to 169.254.169.254" bypass. A residual TOCTOU
//      / DNS-rebinding window remains (we validate the resolved IP, then fetch
//      by hostname which re-resolves); the redirect cap + per-hop revalidation
//      keep the blast radius small without pinning the socket to the IP, which
//      the platform fetch does not support.
//   4. Size cap          — the response body is streamed and aborted once it
//      exceeds MAX_SPEC_BYTES, so a malicious/huge upstream cannot exhaust memory.
//   5. Timeout           — a per-request AbortController caps total time.
//   6. Clean errors      — blocked/invalid URLs => 400, upstream problems =>
//      502/504, without leaking internal hostnames/IPs/stack traces.
// ---------------------------------------------------------------------------

const MAX_SPEC_BYTES = 5 * 1024 * 1024; // 5MB
const REQUEST_TIMEOUT_MS = 10_000; // 10s
const MAX_REDIRECTS = 5;
const MAX_INCOMING_BODY_BYTES = 16 * 1024; // the incoming { url } body is tiny

// Blocklist of private / reserved / internal IP ranges. Any resolved address
// that falls inside these is rejected.
const blockedV4 = new BlockList();
blockedV4.addSubnet("0.0.0.0", 8, "ipv4"); // "this" network / 0.0.0.0
blockedV4.addSubnet("10.0.0.0", 8, "ipv4"); // RFC1918
blockedV4.addSubnet("100.64.0.0", 10, "ipv4"); // CGNAT (RFC6598)
blockedV4.addSubnet("127.0.0.0", 8, "ipv4"); // loopback
blockedV4.addSubnet("169.254.0.0", 16, "ipv4"); // link-local incl. 169.254.169.254 metadata
blockedV4.addSubnet("172.16.0.0", 12, "ipv4"); // RFC1918
blockedV4.addSubnet("192.0.0.0", 24, "ipv4"); // IETF protocol assignments
blockedV4.addSubnet("192.168.0.0", 16, "ipv4"); // RFC1918
blockedV4.addSubnet("198.18.0.0", 15, "ipv4"); // benchmarking
blockedV4.addSubnet("224.0.0.0", 4, "ipv4"); // multicast
blockedV4.addSubnet("240.0.0.0", 4, "ipv4"); // reserved

const blockedV6 = new BlockList();
blockedV6.addAddress("::", "ipv6"); // unspecified
blockedV6.addAddress("::1", "ipv6"); // loopback
blockedV6.addSubnet("fc00::", 7, "ipv6"); // unique-local (ULA)
blockedV6.addSubnet("fe80::", 10, "ipv6"); // link-local
blockedV6.addSubnet("ff00::", 8, "ipv6"); // multicast

/** True if the given IP literal is inside a blocked private/reserved range. */
function isBlockedIp(ip: string): boolean {
    const family = isIP(ip);
    if (family === 4) {
        return blockedV4.check(ip, "ipv4");
    }
    if (family === 6) {
        // IPv4-mapped IPv6 (::ffff:127.0.0.1) — extract and re-check as v4.
        const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
        if (mapped && isIP(mapped[1]) === 4) {
            return blockedV4.check(mapped[1], "ipv4");
        }
        return blockedV6.check(ip, "ipv6");
    }
    // Not a valid IP literal — treat as blocked (fail closed).
    return true;
}

class BlockedUrlError extends Error {}

/**
 * Validate a URL for SSRF safety: scheme allowlist + resolve host and reject if
 * any resolved address is private/reserved. Throws BlockedUrlError on rejection.
 */
async function assertUrlIsSafe(rawUrl: string): Promise<URL> {
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        throw new BlockedUrlError("Invalid URL.");
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new BlockedUrlError("Only http and https URLs are allowed.");
    }

    const hostname = url.hostname;
    if (!hostname) {
        throw new BlockedUrlError("URL is missing a host.");
    }

    // If the host is already an IP literal, validate it directly.
    const literalFamily = isIP(hostname) || isIP(hostname.replace(/^\[|\]$/g, ""));
    if (literalFamily) {
        const literal = hostname.replace(/^\[|\]$/g, "");
        if (isBlockedIp(literal)) {
            throw new BlockedUrlError("URL resolves to a blocked address.");
        }
        return url;
    }

    // Otherwise resolve the hostname to its IP(s) and validate EVERY one.
    let addresses: { address: string }[];
    try {
        addresses = await lookup(hostname, { all: true });
    } catch {
        throw new BlockedUrlError("Could not resolve the host.");
    }

    if (addresses.length === 0) {
        throw new BlockedUrlError("Could not resolve the host.");
    }

    for (const { address } of addresses) {
        if (isBlockedIp(address)) {
            throw new BlockedUrlError("URL resolves to a blocked address.");
        }
    }

    return url;
}

/** Detect a content hint from the URL/content-type to help the client. */
function detectContentHint(contentType: string | null, url: string): "json" | "yaml" | "unknown" {
    const ct = (contentType || "").toLowerCase();
    if (ct.includes("json")) return "json";
    if (ct.includes("yaml") || ct.includes("yml")) return "yaml";
    const lower = url.toLowerCase();
    if (lower.endsWith(".json")) return "json";
    if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "yaml";
    return "unknown";
}

/** Read a response body, aborting if it exceeds the size cap. */
async function readCappedBody(response: Response): Promise<string> {
    // Fast reject on an honest Content-Length that already exceeds the cap.
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_SPEC_BYTES) {
        throw new BlockedUrlError("Spec is too large.");
    }

    const body = response.body;
    if (!body) {
        return "";
    }

    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
                total += value.byteLength;
                if (total > MAX_SPEC_BYTES) {
                    throw new BlockedUrlError("Spec is too large.");
                }
                chunks.push(value);
            }
        }
    } finally {
        reader.cancel().catch(() => {});
    }

    return Buffer.concat(chunks).toString("utf-8");
}

/**
 * Fetch a URL with manual redirect handling. Each hop is anti-SSRF-validated
 * before being followed; redirects are capped.
 */
async function safeFetch(startUrl: URL, signal: AbortSignal): Promise<Response> {
    let currentUrl = startUrl;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const response = await fetch(currentUrl, {
            method: "GET",
            redirect: "manual",
            signal,
            headers: {
                // Ask upstream for a spec; many servers content-negotiate.
                Accept: "application/json, application/yaml, text/yaml, text/plain, */*",
                "User-Agent": "MakeMCP-SpecFetcher/1.0",
            },
        });

        const status = response.status;
        const isRedirect = status === 301 || status === 302 || status === 303 || status === 307 || status === 308;

        if (!isRedirect) {
            return response;
        }

        const location = response.headers.get("location");
        // Drain the redirect response body so the connection can be reused/closed.
        await response.body?.cancel().catch(() => {});

        if (!location) {
            throw new BlockedUrlError("Upstream returned a redirect without a location.");
        }
        if (hop === MAX_REDIRECTS) {
            throw new BlockedUrlError("Too many redirects.");
        }

        // Resolve relative redirect targets against the current URL, then
        // re-validate the destination before following it.
        const nextUrl = new URL(location, currentUrl);
        currentUrl = await assertUrlIsSafe(nextUrl.toString());
    }

    // Unreachable (loop returns or throws), but satisfies the type checker.
    throw new BlockedUrlError("Too many redirects.");
}

export async function POST(request: NextRequest) {
    // Guard against oversized incoming bodies before parsing JSON.
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_INCOMING_BODY_BYTES) {
        return NextResponse.json({ error: "Request body too large." }, { status: 413 });
    }

    let url: string;
    try {
        const body = (await request.json()) as { url?: unknown };
        if (typeof body.url !== "string" || !body.url.trim()) {
            return NextResponse.json({ error: "A spec URL is required." }, { status: 400 });
        }
        url = body.url.trim();
    } catch {
        return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    // 1 + 2: scheme allowlist + resolved-IP validation.
    let safeUrl: URL;
    try {
        safeUrl = await assertUrlIsSafe(url);
    } catch (error) {
        const message = error instanceof BlockedUrlError ? error.message : "This URL cannot be fetched.";
        return NextResponse.json({ error: message }, { status: 400 });
    }

    // 5: timeout via AbortController.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        // 3: manual redirects, each hop revalidated.
        const response = await safeFetch(safeUrl, controller.signal);

        if (!response.ok) {
            // Upstream reachable but returned an error status. Surface a clean
            // 502 without leaking internal detail.
            await response.body?.cancel().catch(() => {});
            return NextResponse.json(
                { error: `The spec URL responded with status ${response.status}.` },
                { status: 502 }
            );
        }

        // 4: size-capped body read.
        const text = await readCappedBody(response);

        if (!text.trim()) {
            return NextResponse.json({ error: "The spec URL returned an empty response." }, { status: 502 });
        }

        const hint = detectContentHint(response.headers.get("content-type"), safeUrl.toString());
        return NextResponse.json({ content: text, contentHint: hint });
    } catch (error) {
        if (error instanceof BlockedUrlError) {
            // A blocked redirect target or size overflow — treat as a bad request.
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        if (error instanceof Error && error.name === "AbortError") {
            return NextResponse.json({ error: "The spec URL timed out." }, { status: 504 });
        }
        // Network-level failure (DNS mid-flight, connection refused, TLS, etc.).
        return NextResponse.json({ error: "Could not fetch the spec URL." }, { status: 502 });
    } finally {
        clearTimeout(timeout);
    }
}
