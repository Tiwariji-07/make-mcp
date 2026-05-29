import { archiveGeneratedProject } from "./archive.ts";
import { buildGenerationPlan } from "./normalize.ts";
import { generateNodeProject } from "./targets/node.ts";
import { generatePythonProject } from "./targets/python.ts";
import type {
    GeneratedPreviewResponse,
    GeneratedProject,
    GeneratorRequest,
    ValidationResult,
    VerificationReport,
} from "./types.ts";
import { validateGenerationPlan } from "./validate.ts";
import { verifyGeneratedProject } from "./verify.ts";

function generateProject(planLanguage: ReturnType<typeof buildGenerationPlan>): GeneratedProject {
    return planLanguage.runtime.language === "node"
        ? generateNodeProject(planLanguage)
        : generatePythonProject(planLanguage);
}

function ensureValid(validation: ValidationResult) {
    if (validation.errors.length > 0) {
        throw new Error(validation.errors.map((error) => error.message).join("\n"));
    }
}

function prepareGeneratedProject(request: GeneratorRequest): {
    project: GeneratedProject;
    validation: ValidationResult;
    verification?: VerificationReport;
} {
    const plan = buildGenerationPlan(request);
    const validation = validateGenerationPlan(plan);
    ensureValid(validation);

    const project = generateProject(plan);
    const verification = plan.features.verification
        ? verifyGeneratedProject(project)
        : undefined;

    return { project, validation, verification };
}

export function createPreviewResponse(request: GeneratorRequest): GeneratedPreviewResponse {
    const { project, validation, verification } = prepareGeneratedProject(request);

    return {
        files: Array.from(project.files.entries()).map(([name, content]) => ({ name, content })),
        manifest: project.manifest,
        validation,
        verification,
    };
}

export async function createArchivedProject(request: GeneratorRequest): Promise<{
    archive: Buffer;
    project: GeneratedProject;
    validation: ValidationResult;
    verification?: VerificationReport;
}> {
    const { project, validation, verification } = prepareGeneratedProject(request);

    if (verification?.status === "failed") {
        throw new Error(
            verification.checks
                .filter((check) => check.status === "failed")
                .map((check) => `${check.name}: ${check.details || "failed"}`)
                .join("\n")
        );
    }

    const archive = await archiveGeneratedProject(project, request.serverConfig.name);

    return { archive, project, validation, verification };
}

export type {
    GeneratedProject,
    GeneratedPreviewResponse,
    GeneratorRequest,
    ToolPlan,
    ValidationResult,
    VerificationReport,
} from "./types.ts";
export { buildToolPlans, planToolFromOperation } from "./planner.ts";
