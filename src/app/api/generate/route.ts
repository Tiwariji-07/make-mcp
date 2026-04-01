import { NextRequest, NextResponse } from "next/server";
import {
    createArchivedProject,
    createPreviewResponse,
} from "@/lib/generator";
import { parseGeneratorRequestPayload } from "@/lib/generator/request";

export async function POST(request: NextRequest) {
    try {
        const body = parseGeneratorRequestPayload(await request.json());
        const isPreview = request.nextUrl.searchParams.get("preview") === "true";

        if (isPreview) {
            return NextResponse.json(createPreviewResponse(body));
        }

        const { archive } = await createArchivedProject(body);

        return new NextResponse(new Uint8Array(archive), {
            headers: {
                "Content-Type": "application/zip",
                "Content-Disposition": `attachment; filename="${body.serverConfig.name}.zip"`,
            },
        });
    } catch (error) {
        console.error("Generation error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Generation failed" },
            { status: 500 }
        );
    }
}
