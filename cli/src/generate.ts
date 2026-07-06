// Generate a project to disk from a GeneratorRequest.
//
// Imports the granular generator pieces directly (not ../../src/lib/generator
// index, which pulls in archiver via archive.ts) — same approach the browser
// path takes. Post-generation verification IS available here (unlike the
// browser), since the CLI can shell out to tsc / npm / python locally.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { GeneratorRequest, VerificationReport } from "../../src/lib/generator/types.ts";
import { buildGenerationPlan } from "../../src/lib/generator/normalize.ts";
import { validateGenerationPlan } from "../../src/lib/generator/validate.ts";
import { generateNodeProject } from "../../src/lib/generator/targets/node.ts";
import { generatePythonProject } from "../../src/lib/generator/targets/python.ts";
import { verifyGeneratedProject } from "../../src/lib/generator/verify.ts";

export interface GenerateResult {
    fileCount: number;
    warnings: string[];
    verification?: VerificationReport;
}

export function generateToDisk(
    request: GeneratorRequest,
    outDir: string,
    verify: "off" | "fast" | "full",
): GenerateResult {
    const plan = buildGenerationPlan(request);

    const validation = validateGenerationPlan(plan);
    if (validation.errors.length > 0) {
        throw new Error(validation.errors.map((error) => error.message).join("\n"));
    }

    const project =
        plan.runtime.language === "node" ? generateNodeProject(plan) : generatePythonProject(plan);

    for (const [filePath, content] of project.files) {
        const target = join(outDir, filePath);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, content);
    }

    let verification: VerificationReport | undefined;
    if (verify !== "off") {
        verification = verifyGeneratedProject(project, verify);
    }

    return {
        fileCount: project.files.size,
        warnings: plan.warnings,
        verification,
    };
}
