import Archiver from "archiver";
import type { GeneratedProject } from "./types.ts";

// Defense-in-depth against Zip Slip / traversal (finding M1/R7). The caller
// derives rootFolder from user-controlled serverConfig.name, which request
// validation already restricts to a safe charset. We sanitize again here so
// the archive layer is safe regardless of how it is invoked: strip path
// separators and ".." segments, and fall back to a constant if nothing safe
// remains.
function sanitizeRootFolder(rootFolder: string): string {
    const cleaned = rootFolder
        .replace(/[\\/]+/g, "-")
        .replace(/\.\.+/g, "-")
        .replace(/[^a-zA-Z0-9._-]/g, "-")
        .replace(/^[.-]+/, "")
        .slice(0, 64);

    return cleaned.length > 0 ? cleaned : "mcp-server";
}

export async function archiveGeneratedProject(
    project: GeneratedProject,
    rootFolder: string
): Promise<Buffer> {
    const safeRootFolder = sanitizeRootFolder(rootFolder);
    const chunks: Uint8Array[] = [];
    const archive = Archiver("zip", { zlib: { level: 9 } });

    archive.on("data", (chunk) => chunks.push(chunk));

    const archiveFinished = new Promise<void>((resolve, reject) => {
        archive.on("end", resolve);
        archive.on("error", reject);
    });

    for (const [filePath, content] of project.files) {
        archive.append(content, { name: `${safeRootFolder}/${filePath}` });
    }

    await archive.finalize();
    await archiveFinished;

    return Buffer.concat(chunks);
}
