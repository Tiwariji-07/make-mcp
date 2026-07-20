import { FASTMCP_VERSION, NODE_MCP_SDK_VERSION } from "./runtime-versions.ts";
import type { GeneratedManifest, GenerationPlan } from "./types.ts";

interface Component {
  type: "library";
  name: string;
  version: string;
  purl: string;
  scope: "required" | "optional";
}

function components(plan: GenerationPlan): Component[] {
  if (plan.runtime.language === "node") {
    return [
      { type: "library", name: "@modelcontextprotocol/sdk", version: NODE_MCP_SDK_VERSION, purl: `pkg:npm/%40modelcontextprotocol/sdk@${NODE_MCP_SDK_VERSION}`, scope: "required" },
      { type: "library", name: "dotenv", version: "^16.4.7", purl: "pkg:npm/dotenv@16.4.7", scope: "required" },
      { type: "library", name: "zod", version: "^3.22.0", purl: "pkg:npm/zod@3.22.0", scope: "required" },
    ];
  }
  return [
    { type: "library", name: "fastmcp", version: FASTMCP_VERSION, purl: `pkg:pypi/fastmcp@${FASTMCP_VERSION}`, scope: "required" },
    { type: "library", name: "httpx", version: ">=0.25.0", purl: "pkg:pypi/httpx@0.25.0", scope: "required" },
    { type: "library", name: "python-dotenv", version: ">=1.0.0", purl: "pkg:pypi/python-dotenv@1.0.0", scope: "required" },
  ];
}

export function renderSbom(plan: GenerationPlan): string {
  return `${JSON.stringify({
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    version: 1,
    metadata: {
      timestamp: plan.generatedAt,
      tools: [{ vendor: "mcpmint", name: "mcpmint", version: plan.generatorVersion }],
      component: { type: "application", name: plan.server.name, version: plan.server.version },
    },
    components: components(plan),
  }, null, 2)}\n`;
}

export function renderProvenance(plan: GenerationPlan, manifest: GeneratedManifest): string {
  return `${JSON.stringify({
    schemaVersion: 1,
    predicateType: "https://slsa.dev/provenance/v1",
    subject: { name: plan.server.name, version: plan.server.version },
    buildDefinition: {
      buildType: "https://mcpmint.dev/build/v1",
      externalParameters: {
        source: { title: plan.spec.title, version: plan.spec.version, baseUrl: plan.spec.baseUrl },
        language: plan.runtime.language,
        framework: plan.runtime.framework,
        transport: plan.runtime.transport,
        compactMode: plan.runtime.compactMode,
        operationIds: plan.tools.map((tool) => tool.id),
      },
      resolvedDependencies: components(plan).map(({ name, version, purl }) => ({ name, version, purl })),
    },
    runDetails: {
      builder: { id: `mcpmint@${plan.generatorVersion}` },
      metadata: { invocationId: `${plan.server.name}@${plan.generatedAt}`, startedOn: plan.generatedAt },
    },
    manifest,
    reproducibility: {
      command: "Re-run mcpmint with the same source spec, operation selection, and export configuration.",
      note: "Timestamps and invocation IDs are expected to differ; dependency constraints and operation IDs should match.",
    },
  }, null, 2)}\n`;
}
