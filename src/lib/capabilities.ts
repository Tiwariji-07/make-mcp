import type { ApiModel, ApiOperation } from "./api-model/index.ts";
import { buildToolPlans } from "./generator/planner.ts";

export type CapabilityStatus = "supported" | "manual-review" | "unsupported";
export type CapabilityRisk = "low" | "medium" | "high";

export interface OperationCapability {
  operationId: string;
  method: ApiOperation["method"];
  path: string;
  label: string;
  status: CapabilityStatus;
  risk: CapabilityRisk;
  auth: string;
  reasons: string[];
  recommended: boolean;
}

export interface CapabilityReport {
  operations: OperationCapability[];
  supported: number;
  manualReview: number;
  unsupported: number;
  recommended: number;
}

const GENERATED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

function operationRisk(operation: ApiOperation): CapabilityRisk {
  if (["PUT", "PATCH", "DELETE"].includes(operation.method)) return "high";
  if (operation.method === "POST") return "medium";
  return "low";
}

export function analyzeCapabilities(apiModel: ApiModel): CapabilityReport {
  const plans = new Map(buildToolPlans(apiModel).map((plan) => [plan.id, plan]));
  const operations = apiModel.operations.map((operation): OperationCapability => {
    const plan = plans.get(operation.id);
    const reasons = [
      ...(plan?.manualReview.map((flag) => flag.message) || []),
      ...(plan?.warnings || []),
    ];
    const unsupportedMethod = !GENERATED_METHODS.has(operation.method);
    if (unsupportedMethod) reasons.unshift(`${operation.method} operations are not emitted by the current generator.`);
    const status: CapabilityStatus = unsupportedMethod
      ? "unsupported"
      : reasons.length > 0
        ? "manual-review"
        : "supported";
    const risk = operationRisk(operation);
    const auth = plan?.authStrategy.strategy || "none";
    return {
      operationId: operation.id,
      method: operation.method,
      path: operation.path,
      label: operation.summary || operation.operationId || `${operation.method} ${operation.path}`,
      status,
      risk,
      auth,
      reasons,
      recommended: status === "supported" && risk === "low" && !operation.deprecated,
    };
  });

  return {
    operations,
    supported: operations.filter((item) => item.status === "supported").length,
    manualReview: operations.filter((item) => item.status === "manual-review").length,
    unsupported: operations.filter((item) => item.status === "unsupported").length,
    recommended: operations.filter((item) => item.recommended).length,
  };
}

export type SelectionPreset = "recommended" | "read-only" | "crud" | "all-supported" | "none";

export function selectOperationIds(report: CapabilityReport, preset: SelectionPreset): Set<string> {
  if (preset === "none") return new Set();
  return new Set(report.operations.filter((operation) => {
    if (operation.status === "unsupported") return false;
    if (preset === "recommended") return operation.recommended;
    if (preset === "read-only") return operation.method === "GET";
    if (preset === "crud") return ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(operation.method);
    return true;
  }).map((operation) => operation.operationId));
}
