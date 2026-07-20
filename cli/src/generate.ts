// Generate a project to disk from a GeneratorRequest.
//
// Imports the granular generator pieces directly (not ../../src/lib/generator
// index, which pulls in archiver via archive.ts) — same approach the browser
// path takes. Post-generation verification IS available here (unlike the
// browser), since the CLI can shell out to tsc / npm / python locally.

import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    renameSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import type { GeneratorRequest, VerificationReport } from "../../src/lib/generator/types.ts";
import { buildGenerationPlan } from "../../src/lib/generator/normalize.ts";
import { validateGenerationPlan } from "../../src/lib/generator/validate.ts";
import { generateNodeProject } from "../../src/lib/generator/targets/node.ts";
import { generatePythonProject } from "../../src/lib/generator/targets/python.ts";
import { verifyGeneratedProject } from "../../src/lib/generator/verify.ts";

export interface GenerateResult {
    fileCount: number;
    files: ReadonlyMap<string, string>;
    warnings: string[];
    verification?: VerificationReport;
}

export function generateProject(
    request: GeneratorRequest,
    verify: "off" | "fast" | "full",
): GenerateResult {
    const plan = buildGenerationPlan(request);
    const validation = validateGenerationPlan(plan);
    if (validation.errors.length > 0) {
        throw new Error(validation.errors.map((error) => error.message).join("\n"));
    }
    const project = plan.runtime.language === "node" ? generateNodeProject(plan) : generatePythonProject(plan);
    const verification = verify !== "off" ? verifyGeneratedProject(project, verify) : undefined;
    return { fileCount: project.files.size, files: project.files, warnings: plan.warnings, verification };
}

export function writeProjectAtomically(
    files: ReadonlyMap<string, string>,
    outDir: string,
    replaceExisting: boolean,
): void {
    const parentDirectory = dirname(outDir);
    mkdirSync(parentDirectory, { recursive: true });

    if (existsSync(outDir) && readdirSync(outDir).length > 0 && !replaceExisting) {
        throw new Error(`output directory "${outDir}" is not empty`);
    }

    const stagingDirectory = mkdtempSync(join(parentDirectory, `.${basename(outDir)}-mcpmint-`));
    const backupDirectory = `${stagingDirectory}.previous`;
    let movedExisting = false;

    try {
        for (const [filePath, content] of files) {
            const target = join(stagingDirectory, filePath);
            mkdirSync(dirname(target), { recursive: true });
            writeFileSync(target, content);
        }

        if (existsSync(outDir)) {
            renameSync(outDir, backupDirectory);
            movedExisting = true;
        }
        renameSync(stagingDirectory, outDir);
        if (movedExisting) rmSync(backupDirectory, { recursive: true, force: true });
    } catch (error) {
        rmSync(stagingDirectory, { recursive: true, force: true });
        if (movedExisting && !existsSync(outDir) && existsSync(backupDirectory)) {
            renameSync(backupDirectory, outDir);
        }
        throw error;
    }
}

export function generateToDisk(
    request: GeneratorRequest,
    outDir: string,
    verify: "off" | "fast" | "full",
    replaceExisting = false,
): GenerateResult {
    const result = generateProject(request, verify);
    writeProjectAtomically(result.files, outDir, replaceExisting);
    return result;
}
