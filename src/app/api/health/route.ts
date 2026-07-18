import { NextResponse } from "next/server";

/**
 * Lightweight liveness probe for operators / load balancers.
 * Does not check downstream services (there are none required at runtime).
 */
export async function GET() {
    return NextResponse.json(
        {
            ok: true,
            service: "mcpmint",
            timestamp: new Date().toISOString(),
        },
        {
            headers: {
                "Cache-Control": "no-store",
            },
        }
    );
}
