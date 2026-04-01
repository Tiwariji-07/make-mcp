import Archiver from "archiver";
import type { GeneratedProject } from "./types.ts";

export async function archiveGeneratedProject(
    project: GeneratedProject,
    rootFolder: string
): Promise<Buffer> {
    const chunks: Uint8Array[] = [];
    const archive = Archiver("zip", { zlib: { level: 9 } });

    archive.on("data", (chunk) => chunks.push(chunk));

    const archiveFinished = new Promise<void>((resolve, reject) => {
        archive.on("end", resolve);
        archive.on("error", reject);
    });

    for (const [filePath, content] of project.files) {
        archive.append(content, { name: `${rootFolder}/${filePath}` });
    }

    await archive.finalize();
    await archiveFinished;

    return Buffer.concat(chunks);
}
