import test from "node:test";
import assert from "node:assert/strict";
import { getClientIp, type ClientIpSource } from "./request-guards.ts";

function fakeRequest(headers: Record<string, string>, ip?: string | null): ClientIpSource {
    const normalized = Object.fromEntries(
        Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
    );
    return {
        headers: {
            get(name: string) {
                return normalized[name.toLowerCase()] ?? null;
            },
        },
        ip: ip ?? null,
    };
}

test("getClientIp prefers request.ip over spoofable headers", () => {
    assert.equal(
        getClientIp(
            fakeRequest(
                {
                    "x-real-ip": "1.2.3.4",
                    "x-forwarded-for": "9.9.9.9, 8.8.8.8",
                    "x-vercel-forwarded-for": "198.51.100.1",
                },
                "203.0.113.77"
            )
        ),
        "203.0.113.77"
    );
});

test("getClientIp uses x-vercel-forwarded-for before XFF and x-real-ip", () => {
    const ip = getClientIp(
        fakeRequest({
            "x-vercel-forwarded-for": "198.51.100.20",
            "x-forwarded-for": "spoofed.client, 10.0.0.1",
            "x-real-ip": "1.2.3.4",
        })
    );
    assert.equal(ip, "198.51.100.20");
});

test("getClientIp uses rightmost X-Forwarded-For hop (platform-appended)", () => {
    const ip = getClientIp(
        fakeRequest({
            "x-forwarded-for": "spoofed.left, 203.0.113.50",
            "x-real-ip": "1.2.3.4",
        })
    );
    assert.equal(ip, "203.0.113.50");
});

test("getClientIp ignores x-real-ip by default (spoofable)", () => {
    assert.equal(
        getClientIp(fakeRequest({ "x-real-ip": "203.0.113.9" })),
        "unknown"
    );
});

test("getClientIp trusts x-real-ip only when MCPMINT_TRUST_X_REAL_IP=1", () => {
    const prev = process.env.MCPMINT_TRUST_X_REAL_IP;
    try {
        process.env.MCPMINT_TRUST_X_REAL_IP = "1";
        assert.equal(
            getClientIp(fakeRequest({ "x-real-ip": "203.0.113.9" })),
            "203.0.113.9"
        );
    } finally {
        if (prev === undefined) delete process.env.MCPMINT_TRUST_X_REAL_IP;
        else process.env.MCPMINT_TRUST_X_REAL_IP = prev;
    }
});

test("getClientIp falls back to unknown when no headers", () => {
    assert.equal(getClientIp(fakeRequest({})), "unknown");
});
