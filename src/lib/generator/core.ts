import { buildGenerationPlan } from "./normalize.ts";
import { generateNodeProject } from "./targets/node.ts";
import { generatePythonProject } from "./targets/python.ts";
import type { GeneratedProject, GenerationPlan, GeneratorRequest, ValidationResult } from "./types.ts";
import { validateGenerationPlan } from "./validate.ts";

export interface PreparedGeneratedProject {
    plan: GenerationPlan;
    project: GeneratedProject;
    validation: ValidationResult;
}

export function prepareGeneratedProject(request: GeneratorRequest): PreparedGeneratedProject {
    const plan = buildGenerationPlan(request);
    const validation = validateGenerationPlan(plan);
    if (validation.errors.length > 0) {
        throw new Error(validation.errors.map((error) => error.message).join("\n"));
    }

    const project = plan.runtime.language === "node"
        ? generateNodeProject(plan)
        : generatePythonProject(plan);
    return { plan, project, validation };
}
