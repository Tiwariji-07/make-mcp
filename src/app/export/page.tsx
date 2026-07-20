"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  Loader2,
  Check,
  Terminal,
  Code2,
  Eye,
  ArrowLeft,
  Layers3,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  FileText,
  ShieldCheck,
  PartyPopper,
  Github,
  Lock,
  Settings2,
} from "lucide-react";
import Link from "next/link";
import { Header } from "@/components/shared/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyButton } from "@/components/ui/copy-button";
import { AuthConfig, ExportConfig, McpServerAuthConfig, ParsedSpec, ServerConfig, useProjectStore } from "@/store/project-store";
import { buildToolPlans } from "@/lib/generator/planner";
import { generateProjectInBrowser, previewProjectInBrowser } from "@/lib/client-generate";
import {
  joinProjectPath,
  renderClaudeCodeCommand,
  renderMcpClientConfig,
} from "@/lib/generator/client-config";

interface PreviewFile {
  name: string;
  content: string;
}

interface PreviewData {
  files: PreviewFile[];
  manifest?: {
    generatorVersion: string;
    language?: string;
    framework?: string;
    transport?: string;
    toolCount: number;
    features: {
      documentation?: boolean;
      docker?: boolean;
      tests?: boolean;
      verification?: boolean;
      [key: string]: boolean | undefined;
    };
  };
  validation?: {
    errors: PreviewIssue[];
    warnings: PreviewIssue[];
    info: PreviewIssue[];
  };
}

interface PreviewIssue {
  severity: "error" | "warning" | "info";
  message: string;
  path?: string;
}

interface EndpointReviewItem {
  id: string;
  label: string;
  toolName: string;
  reasons: string[];
}

type AuthType = AuthConfig["type"];
type McpServerAuthType = McpServerAuthConfig["type"];
type Transport = ServerConfig["transport"];

const defaultExportFeatures = {
  documentation: true,
  docker: false,
  tests: true,
  verification: false,
};

function getDetectedAuthOptions(spec: ParsedSpec): AuthConfig[] {
  const options: AuthConfig[] = [];
  for (const scheme of Object.values(spec.securitySchemes)) {
    const c = scheme as { type?: string; scheme?: string; in?: string; name?: string };
    if (c.type === "apiKey") {
      options.push({
        type: "apiKey",
        apiKey: { name: c.name || "X-API-Key", in: c.in === "query" || c.in === "cookie" ? c.in : "header" },
      });
    } else if (c.type === "http" && c.scheme === "bearer") {
      options.push({ type: "bearer" });
    } else if (c.type === "http" && c.scheme === "basic") {
      options.push({ type: "basic" });
    }
  }
  return options;
}

function getAuthLabel(type: AuthType): string {
  return { none: "None", apiKey: "API Key", bearer: "Bearer", basic: "Basic" }[type];
}

function getTransportLabel(transport: Transport): string {
  return {
    stdio: "stdio",
    http: "Streamable HTTP",
    sse: "SSE",
  }[transport];
}

function getRuntimeLabel(config: {
  language: "node" | "python";
  framework: "mcp-ts-sdk" | "fastmcp";
  packageManager: "npm" | "pnpm" | "yarn";
}): string {
  if (config.language === "node") {
    return `Node.js / TypeScript · ${config.framework} · ${config.packageManager}`;
  }

  return `Python · ${config.framework}`;
}

function getEndpointLabel(spec: ParsedSpec, endpointId: string): string {
  const endpoint = spec.endpoints.find((candidate) => candidate.id === endpointId);
  if (endpoint) return `${endpoint.method} ${endpoint.path}`;

  const operation = spec.apiModel?.operations.find((candidate) => candidate.id === endpointId);
  if (operation) return `${operation.method} ${operation.path}`;

  return endpointId;
}

function getManualReviewEndpoints(spec: ParsedSpec, selectedTools: { id: string; toolName: string }[]): EndpointReviewItem[] {
  const selectedIds = new Set(selectedTools.map((tool) => tool.id));
  const toolNames = new Map(selectedTools.map((tool) => [tool.id, tool.toolName]));

  if (spec.apiModel) {
    return buildToolPlans(spec.apiModel)
      .filter((plan) => selectedIds.has(plan.id))
      .map((plan) => ({
        id: plan.id,
        label: `${plan.method} ${plan.path}`,
        toolName: toolNames.get(plan.id) || plan.toolName,
        reasons: [
          ...plan.manualReview.map((flag) => flag.message),
          ...plan.warnings,
          ...(plan.authStrategy.source === "unsupported" ? ["Unsupported authentication requirements need manual review."] : []),
        ],
      }))
      .filter((item) => item.reasons.length > 0);
  }

  return selectedTools
    .map((tool) => {
      const endpoint = spec.endpoints.find((candidate) => candidate.id === tool.id);
      const reasons: string[] = [];

      if (endpoint?.requestBody?.contentType && ![
        "application/json",
        "application/x-www-form-urlencoded",
        "multipart/form-data",
      ].some((contentType) => endpoint.requestBody?.contentType.includes(contentType))) {
        reasons.push(`Request body content type "${endpoint.requestBody.contentType}" may require manual serialization review.`);
      }

      return {
        id: tool.id,
        label: endpoint ? `${endpoint.method} ${endpoint.path}` : tool.id,
        toolName: tool.toolName,
        reasons,
      };
    })
    .filter((item) => item.reasons.length > 0);
}

function formatAuthConfig(config: AuthConfig): string {
  if (config.type === "apiKey") {
    return `API Key · ${config.apiKey?.name || "unnamed"} in ${config.apiKey?.in || "header"}`;
  }

  return getAuthLabel(config.type);
}

function formatMcpServerAuthConfig(config: McpServerAuthConfig, transport: Transport): string {
  if (transport === "stdio") return "Not applicable";
  // Node and Python both emit access middleware: optional bearer (MCP_AUTH_TOKEN)
  // plus Origin allow-list with localhost-only deny-by-default when empty.
  const auth = config.type === "bearer" ? "Bearer via MCP_AUTH_TOKEN" : "None";
  const origins = config.allowedOrigins.length > 0
    ? `${config.allowedOrigins.length} origin${config.allowedOrigins.length === 1 ? "" : "s"}`
    : "localhost only (deny-by-default)";
  return `${auth} · ${origins}`;
}

const GITHUB_REPO_URL = "https://github.com/mcpmint/mcpmint";

// Snapshot of the exact config used for a completed generation, so the success
// screen stays correct even if the user tweaks fields afterwards.
interface GeneratedSnapshot {
  serverName: string;
  language: ExportConfig["language"];
  packageManager: ExportConfig["packageManager"];
  transport: Transport;
  host: string;
  port: number;
  authType: AuthType;
  apiKeyName?: string;
  baseUrl: string;
  compactMode: boolean;
  toolCount: number;
}

// Mirrors readme.ts getTransportUrl: stdio has no URL; SSE gets /sse suffix.
function getSnapshotTransportUrl(snapshot: GeneratedSnapshot): string {
  if (snapshot.transport === "stdio") return "";
  if (snapshot.transport === "sse") return `http://${snapshot.host}:${snapshot.port}/sse`;
  return `http://${snapshot.host}:${snapshot.port}`;
}

// Mirrors targets/node.ts + targets/python.ts renderReadme(): the stdio client
// command/args the generator ships in the README's Example MCP Client Config.
function getSnapshotStdioClient(snapshot: GeneratedSnapshot, projectDirectory: string): { command: string; args: string[] } {
  if (snapshot.language === "python") {
    return { command: "python", args: [joinProjectPath(projectDirectory, "src/server.py")] };
  }
  return { command: "node", args: [joinProjectPath(projectDirectory, "dist/src/index.js")] };
}

// Mirrors readme.ts getClientConfigEnv() for the single upstream-auth scheme the
// UI configures. Env var names follow the generator's single-scheme fast path
// (schemeName "apiKey"/"bearer"/"basic"); the generated .env.example / README is
// the source of truth for multi-scheme specs.
function getSnapshotClientEnv(snapshot: GeneratedSnapshot): Record<string, string> {
  const env: Record<string, string> = {
    API_BASE_URL: snapshot.baseUrl || "https://api.example.com",
  };

  if (snapshot.authType === "apiKey") {
    env.API_KEY = "your_api_key_here";
  } else if (snapshot.authType === "bearer") {
    env.BEARER_TOKEN = "your_token_here";
  } else if (snapshot.authType === "basic") {
    env.BASIC_USERNAME = "your_username";
    env.BASIC_PASSWORD = "your_password";
  }

  return env;
}

// Mirrors readme.ts renderClientConfig(): the mcpServers JSON block that ships in
// the generated README. stdio uses command/args/env; HTTP/SSE uses a url.
function buildMcpServersConfig(snapshot: GeneratedSnapshot, projectDirectory: string): string {
  if (snapshot.transport === "stdio") {
    const { command, args } = getSnapshotStdioClient(snapshot, projectDirectory);
    return renderMcpClientConfig({
      serverName: snapshot.serverName,
      transport: "stdio",
      stdioCommand: command,
      stdioArgs: args,
      env: getSnapshotClientEnv(snapshot),
    });
  }

  return renderMcpClientConfig({
    serverName: snapshot.serverName,
    transport: snapshot.transport,
    transportUrl: getSnapshotTransportUrl(snapshot),
  });
}

// Cursor's mcp.json uses the same mcpServers shape as Claude Desktop.
function buildCursorConfig(snapshot: GeneratedSnapshot, projectDirectory: string): string {
  return buildMcpServersConfig(snapshot, projectDirectory);
}

// `claude mcp add` CLI form. For stdio the server entry is `-- <command> <args>`;
// for HTTP/SSE it is `--transport <t> <url>`.
function buildClaudeCliCommand(snapshot: GeneratedSnapshot, projectDirectory: string): string {
  if (snapshot.transport === "stdio") {
    const { command, args } = getSnapshotStdioClient(snapshot, projectDirectory);
    return renderClaudeCodeCommand({
      serverName: snapshot.serverName,
      transport: "stdio",
      stdioCommand: command,
      stdioArgs: args,
    });
  }
  return renderClaudeCodeCommand({
    serverName: snapshot.serverName,
    transport: snapshot.transport,
    transportUrl: getSnapshotTransportUrl(snapshot),
  });
}

function getInstallCommand(snapshot: GeneratedSnapshot): string {
  if (snapshot.language === "python") return "pip install -e .";
  return `${snapshot.packageManager} install`;
}

function getRunCommand(snapshot: GeneratedSnapshot): string {
  if (snapshot.language === "python") return "python src/server.py";
  return snapshot.packageManager === "npm" ? "npm run dev" : `${snapshot.packageManager} dev`;
}

export default function ExportPage() {
  const router = useRouter();
  const {
    spec,
    tools,
    serverConfig,
    exportConfig,
    authConfig,
    mcpServerAuthConfig,
    setServerConfig,
    setExportConfig,
    setAuthConfig,
    setMcpServerAuthConfig,
    setCurrentStep,
    saveCurrentProject,
  } = useProjectStore();

  const [isGenerating, setIsGenerating] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewResult, setPreviewResult] = useState<{
    signature: string;
    data: PreviewData;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [portValue, setPortValue] = useState(serverConfig.port.toString());
  const [generated, setGenerated] = useState<GeneratedSnapshot | null>(null);
  // Privacy mode: generate entirely in the browser so the spec never leaves the
  // machine. Default ON. Switching off uses the server route for generation,
  // but process-spawning verification remains a local CLI-only operation.
  const [browserMode, setBrowserMode] = useState(true);

  useEffect(() => {
    if (!spec) router.push("/");
  }, [spec, router]);

  useEffect(() => {
    const n = parseInt(portValue);
    if (!isNaN(n) && n > 0 && n <= 65535) setServerConfig({ port: n });
  }, [portValue, setServerConfig]);

  if (!spec) return null;

  const selectedTools = tools.filter((t) => t.enabled);
  const generatorPayload = {
    spec: {
      info: spec.info,
      baseUrl: spec.baseUrl,
      apiModel: spec.apiModel,
    },
    // Schemas are always derived from spec.apiModel (the generator's sole
    // supported path), so tool/parameter schema blobs are not sent.
    tools: selectedTools.map((tool) => ({
      endpointId: tool.endpointId,
      enabled: tool.enabled,
      toolName: tool.toolName,
      description: tool.description,
      bodyContentType: tool.bodyContentType,
      parameters: tool.parameters.map((parameter) => ({
        name: parameter.name,
        originalName: parameter.originalName,
        type: parameter.type,
        required: parameter.required,
        description: parameter.description,
        location: parameter.location,
        hidden: parameter.hidden,
      })),
    })),
    serverConfig,
    authConfig,
    mcpServerAuthConfig,
    exportConfig: {
      ...exportConfig,
      verificationMode: "fast" as const,
      features: { ...exportConfig.features, verification: false },
    },
  };
  const generatorSignature = JSON.stringify(generatorPayload);
  const previewData = previewResult?.signature === generatorSignature ? previewResult.data : null;
  const previewFiles = previewData?.files || [];
  const exportFeatures = { ...defaultExportFeatures, ...(exportConfig.features ?? {}) };
  const detectedAuth = getDetectedAuthOptions(spec);
  const detectedApiKey = detectedAuth.find((o) => o.type === "apiKey");
  const selectedEndpointItems = selectedTools.map((tool) => ({
    id: tool.endpointId,
    label: getEndpointLabel(spec, tool.endpointId),
    toolName: tool.toolName,
  }));
  const manualReviewEndpoints = getManualReviewEndpoints(spec, selectedEndpointItems);
  const port = parseInt(portValue, 10);
  const isPortValid = !isNaN(port) && port > 0 && port <= 65535;
  const isAuthValid = authConfig.type !== "apiKey" || Boolean(authConfig.apiKey?.name?.trim());
  const isHttpTransport = serverConfig.transport !== "stdio";
  const isWildcardHost = serverConfig.host.trim() === "0.0.0.0";
  const duplicateToolNames = selectedTools
    .map((tool) => tool.toolName.trim())
    .filter((name, index, names) => name && names.indexOf(name) !== index);
  const preGenerationWarnings = [
    ...(selectedTools.length === 0 ? ["Select at least one endpoint before generating."] : []),
    ...(!isPortValid ? ["Server port must be between 1 and 65535."] : []),
    ...(!isAuthValid ? ["API key authentication needs a key name."] : []),
    ...(isHttpTransport && mcpServerAuthConfig.type === "none" ? [
      "HTTP/SSE MCP server access has no bearer token configured. Generated servers still deny non-localhost Origin headers by default; bind to localhost, or select bearer auth and set MCP_AUTH_TOKEN before exposing this server.",
    ] : []),
    ...(isHttpTransport && isWildcardHost && mcpServerAuthConfig.type === "none" ? ["Host is 0.0.0.0 and MCP server access auth is none. This can expose the MCP server to the network."] : []),
    ...(duplicateToolNames.length > 0 ? [`Duplicate tool names will be renamed during generation: ${[...new Set(duplicateToolNames)].join(", ")}.`] : []),
    ...(manualReviewEndpoints.length > 0 ? [`${manualReviewEndpoints.length} selected endpoint${manualReviewEndpoints.length === 1 ? "" : "s"} need manual review.`] : []),
    ...(spec.baseUrl ? [] : ["No base URL was detected; generated code will use the configured fallback."]),
  ];
  const previewWarnings = [
    ...(previewData?.validation?.warnings || []),
    ...(previewData?.validation?.info || []),
  ];

  const isFormValid =
    serverConfig.name.trim() !== "" &&
    serverConfig.version.trim() !== "" &&
    serverConfig.host.trim() !== "" &&
    portValue.trim() !== "" &&
    isPortValid &&
    selectedTools.length > 0 &&
    isAuthValid;

  const handleAuthTypeChange = (v: AuthType) => {
    if (v === "apiKey") {
      setAuthConfig(detectedApiKey || { type: "apiKey", apiKey: { name: "X-API-Key", in: "header" } });
      return;
    }
    setAuthConfig({ type: v });
  };

  const handleMcpServerAuthTypeChange = (v: McpServerAuthType) => {
    setMcpServerAuthConfig({ type: v });
  };

  const handleAllowedOriginsChange = (value: string) => {
    setMcpServerAuthConfig({
      allowedOrigins: value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    });
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      if (browserMode) {
        // Privacy mode: run the pure generator + zip entirely in the browser.
        // The spec never touches the network. Process verification is a local
        // CLI-only operation, so it is not run by either web generation path.
        const { blob, filename } = await generateProjectInBrowser(generatorPayload);
        triggerDownload(blob, filename);
      } else {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(generatorPayload),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
        const blob = await res.blob();
        triggerDownload(blob, `${serverConfig.name}.zip`);
      }
      if (!saveCurrentProject()) {
        setError("The download succeeded, but this project could not be saved to browser history.");
      }
      setGenerated({
        serverName: serverConfig.name,
        language: exportConfig.language,
        packageManager: exportConfig.packageManager,
        transport: serverConfig.transport,
        host: serverConfig.host,
        port: serverConfig.port,
        authType: authConfig.type,
        apiKeyName: authConfig.apiKey?.name,
        baseUrl: spec.baseUrl,
        compactMode: exportConfig.compactMode,
        toolCount: selectedTools.length,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadAgain = () => {
    void handleGenerate();
  };

  const handleBackToConfig = () => {
    setGenerated(null);
    setError(null);
  };

  const handlePreview = async () => {
    setIsPreviewing(true);
    setError(null);
    try {
      if (browserMode) {
        // Privacy mode: preview entirely in-browser so the apiModel never uploads.
        const data = previewProjectInBrowser(generatorPayload);
        setPreviewResult({
          signature: generatorSignature,
          data: {
            files: data.files,
            manifest: data.manifest
              ? {
                  generatorVersion: data.manifest.generatorVersion,
                  language: data.manifest.language,
                  framework: data.manifest.framework,
                  transport: data.manifest.transport,
                  toolCount: data.manifest.toolCount,
                  features: { ...data.manifest.features },
                }
              : undefined,
            validation: data.validation,
          },
        });
      } else {
        const res = await fetch("/api/generate?preview=true", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(generatorPayload),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
        const data = await res.json() as PreviewData;
        setPreviewResult({ signature: generatorSignature, data });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setIsPreviewing(false);
    }
  };

  if (generated) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="pt-14 flex-1 flex flex-col relative z-10">
          <SuccessView
            snapshot={generated}
            onBackToConfig={handleBackToConfig}
            onDownloadAgain={handleDownloadAgain}
            isGenerating={isGenerating}
            error={error}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="pt-14 flex-1 flex flex-col relative z-10">
        {/* ═══ Split view ═══ */}
        <div className="flex-1 flex">

          {/* ─── Left: Configuration ─── */}
          <div className="flex-1 overflow-y-auto border-r border-border">
            <div className="max-w-2xl mx-auto px-4 sm:px-8 py-8 sm:py-10 space-y-0">

              {/* Language Selection */}
              <Section title="Language">
                <div className="grid grid-cols-2 gap-3">
                  <LangCard
                    label="Node.js"
                    tag="TS"
                    tagColor="#339933"
                    selected={exportConfig.language === "node"}
                    onClick={() => setExportConfig({ language: "node", framework: "mcp-ts-sdk", packageManager: "npm" })}
                  />
                  <LangCard
                    label="Python"
                    tag="PY"
                    tagColor="#3776AB"
                    selected={exportConfig.language === "python"}
                    onClick={() => setExportConfig({ language: "python", framework: "fastmcp" })}
                  />
                </div>

                {exportConfig.language === "node" && (
                  <div className="mt-4">
                    <Label className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase mb-2 block">
                      Package Manager
                    </Label>
                    <div className="flex border border-border">
                      {(["npm", "yarn", "pnpm"] as const).map((pm) => (
                        <button
                          key={pm}
                          className={`flex-1 py-2 text-xs font-semibold tracking-wider transition-colors ${
                            exportConfig.packageManager === pm
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                          onClick={() => setExportConfig({ packageManager: pm })}
                        >
                          {pm}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </Section>

              {/* Server Details */}
              <Section title="Server">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Name" value={serverConfig.name} onChange={(v) => setServerConfig({ name: v })} />
                  <Field label="Version" value={serverConfig.version} onChange={(v) => setServerConfig({ version: v })} />
                  <Field label="Host" value={serverConfig.host} onChange={(v) => setServerConfig({ host: v })} />
                  <div className="space-y-1.5">
                    <Label htmlFor="server-port" className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">Port</Label>
                    <Input
                      id="server-port"
                      inputMode="numeric"
                      value={portValue}
                      onChange={(e) => setPortValue(e.target.value)}
                      className="h-8 bg-background border-border text-xs focus:border-primary"
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <Label htmlFor="server-transport" className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase mb-2 block">
                    Transport
                  </Label>
                  <Select
                    value={serverConfig.transport}
                    onValueChange={(v) => setServerConfig({ transport: v as Transport })}
                  >
                    <SelectTrigger id="server-transport" className="h-9 bg-background border-border text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stdio">stdio (local clients)</SelectItem>
                      <SelectItem value="http">Streamable HTTP (recommended remote)</SelectItem>
                      <SelectItem value="sse">SSE (legacy)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </Section>

              <Section title="Output">
                <div className="space-y-3">
                  <FeatureToggle
                    label="Compact mode (meta-tools)"
                    description="Expose 3 meta-tools (list / get-schema / invoke) instead of one tool per endpoint. Keeps large APIs from bloating the model's context window."
                    checked={exportConfig.compactMode}
                    onCheckedChange={(checked) => setExportConfig({ compactMode: checked })}
                  />
                  <FeatureToggle
                    label="Documentation"
                    description="Include README and usage notes"
                    checked={exportFeatures.documentation}
                    onCheckedChange={(checked) => setExportConfig({ features: { documentation: checked } })}
                  />
                  <FeatureToggle
                    label="Docker"
                    description="Add Dockerfile, compose, and ignore rules"
                    checked={exportFeatures.docker}
                    onCheckedChange={(checked) => setExportConfig({ features: { docker: checked } })}
                  />
                  <FeatureToggle
                    label="Tests"
                    description="Include generated smoke tests"
                    checked={exportFeatures.tests}
                    onCheckedChange={(checked) => setExportConfig({ features: { tests: checked } })}
                  />
                </div>
              </Section>

              {/* Upstream API Authentication */}
              <Section title="Upstream API Auth">
                <Label htmlFor="upstream-auth-type" className="sr-only">Upstream authentication type</Label>
                <Select value={authConfig.type} onValueChange={(v) => handleAuthTypeChange(v as AuthType)}>
                  <SelectTrigger id="upstream-auth-type" className="h-9 bg-background border-border text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="apiKey">API Key</SelectItem>
                    <SelectItem value="bearer">Bearer Token</SelectItem>
                    <SelectItem value="basic">Basic Auth</SelectItem>
                  </SelectContent>
                </Select>

                {authConfig.type === "apiKey" && (
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <Field
                      label="Key Name"
                      value={authConfig.apiKey?.name || ""}
                      onChange={(v) => setAuthConfig({ type: "apiKey", apiKey: { name: v, in: authConfig.apiKey?.in || "header" } })}
                    />
                    <div className="space-y-1.5">
                      <Label htmlFor="api-key-location" className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">Location</Label>
                      <Select
                        value={authConfig.apiKey?.in || "header"}
                        onValueChange={(v) => setAuthConfig({ type: "apiKey", apiKey: { name: authConfig.apiKey?.name || "X-API-Key", in: v as "header" | "query" | "cookie" } })}
                      >
                        <SelectTrigger id="api-key-location" className="h-9 bg-background border-border text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="header">Header</SelectItem>
                          <SelectItem value="query">Query</SelectItem>
                          <SelectItem value="cookie">Cookie</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {detectedAuth.length > 0 && (
                  <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground tracking-wider">
                    <span className="uppercase">Detected:</span>
                    {detectedAuth.map((o, i) => (
                      <Badge key={i} variant="outline" className="text-[9px] border-border px-1.5 py-0">
                        {getAuthLabel(o.type)}
                      </Badge>
                    ))}
                  </div>
                )}
              </Section>

              <Section title="MCP Server Access">
                {serverConfig.transport === "stdio" ? (
                  <div className="border border-border px-4 py-3 text-xs text-muted-foreground leading-relaxed">
                    MCP server access auth is not applicable for stdio because the client talks to the server over local process stdin/stdout. Keep stdio for local-only use.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="mcp-server-auth" className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">Server Auth</Label>
                      <Select value={mcpServerAuthConfig.type} onValueChange={(v) => handleMcpServerAuthTypeChange(v as McpServerAuthType)}>
                        <SelectTrigger id="mcp-server-auth" className="h-9 bg-background border-border text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No MCP auth</SelectItem>
                          <SelectItem value="bearer">Bearer token from MCP_AUTH_TOKEN</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="allowed-origins" className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">Allowed Origins</Label>
                      <Input
                        id="allowed-origins"
                        value={mcpServerAuthConfig.allowedOrigins.join(", ")}
                        onChange={(event) => handleAllowedOriginsChange(event.target.value)}
                        placeholder="https://client.example.com, http://localhost:3000"
                        className="h-8 bg-background border-border text-xs focus:border-primary"
                      />
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        Generated HTTP/SSE servers reject disallowed Origin headers (Node and Python) and answer CORS preflight for allowed origins.
                        Leave blank to allow only localhost origins (deny-by-default). Non-localhost browser clients must set MCP_ALLOWED_ORIGINS
                        (comma-separated full origins such as https://client.example.com).
                      </p>
                    </div>

                    {mcpServerAuthConfig.type === "bearer" && (
                      <div className="border border-primary/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                        Set MCP_AUTH_TOKEN in the generated server environment. HTTP/SSE requests must send Authorization: Bearer &lt;token&gt;.
                        Node and Python both enforce this with a constant-time compare.
                      </div>
                    )}

                    {mcpServerAuthConfig.type === "none" && (
                      <div className="border border-amber-500/30 px-3 py-2 text-[11px] leading-relaxed text-amber-500">
                        HTTP/SSE MCP server access has no bearer token configured. Prefer localhost binding unless another layer authenticates clients.
                      </div>
                    )}

                    {isWildcardHost && mcpServerAuthConfig.type === "none" && (
                      <div className="border border-red/30 px-3 py-2 text-[11px] leading-relaxed text-red">
                        Host 0.0.0.0 with no MCP server auth can expose this server to the network.
                      </div>
                    )}
                  </div>
                )}
              </Section>

              <Section title="Generation">
                <div className="space-y-3">
                  <FeatureToggle
                    label="Generate in your browser"
                    description="Privacy mode: generate, preview, and zip locally. Your spec never leaves your browser."
                    checked={browserMode}
                    onCheckedChange={setBrowserMode}
                  />
                  <div className="flex items-start gap-2 border border-border px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
                    {browserMode ? (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
                        <p>
                          Generation and file preview run entirely on this device. The spec is never uploaded.
                        </p>
                      </>
                    ) : (
                      <>
                        <Cpu className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground/70" />
                        <p>
                          Server mode sends the spec to this app&rsquo;s server to build the zip or preview.
                          The public server validates structure but never installs dependencies or starts
                          generated processes.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </Section>

              <Section title="Export Readiness">
                <div className="grid gap-3">
                  <StatusRow
                    icon={<FileText className="w-4 h-4" />}
                    label="Selected endpoints"
                    value={`${selectedEndpointItems.length} of ${spec.endpoints.length}`}
                    tone={selectedEndpointItems.length > 0 ? "success" : "warning"}
                  />
                  <StatusRow
                    icon={<ShieldCheck className="w-4 h-4" />}
                    label="Detected upstream auth"
                    value={detectedAuth.length > 0 ? detectedAuth.map((item) => getAuthLabel(item.type)).join(", ") : "None detected"}
                    tone={detectedAuth.length > 0 ? "success" : "muted"}
                  />
                  <StatusRow
                    icon={<ShieldCheck className="w-4 h-4" />}
                    label="MCP server access"
                    value={formatMcpServerAuthConfig(mcpServerAuthConfig, serverConfig.transport)}
                    tone={serverConfig.transport === "stdio" ? "muted" : exportConfig.language === "python" ? "warning" : mcpServerAuthConfig.type === "none" ? "warning" : "success"}
                  />
                  <StatusRow
                    icon={<Cpu className="w-4 h-4" />}
                    label="Chosen runtime"
                    value={`${getRuntimeLabel(exportConfig)} · ${getTransportLabel(serverConfig.transport)}`}
                    tone="success"
                  />
                  <StatusRow
                    icon={<CheckCircle2 className="w-4 h-4" />}
                    label="Generation checks"
                    value="Structure validated · full verification via CLI"
                    tone="muted"
                  />
                </div>

                <div className="mt-5 space-y-2">
                  <div className="flex items-center gap-2 text-[10px] tracking-[0.18em] uppercase text-muted-foreground">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Warnings before generation
                  </div>
                  {preGenerationWarnings.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No blocking readiness warnings detected.</p>
                  ) : (
                    <ul className="space-y-2">
                      {preGenerationWarnings.map((warning) => (
                        <li key={warning} className="border border-border px-3 py-2 text-xs text-muted-foreground leading-relaxed">
                          {warning}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Section>
            </div>
          </div>

          {/* ─── Right: Preview Panel ─── */}
          <div className="w-[45%] hidden lg:flex flex-col bg-surface">
            {/* Preview header */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-primary" />
                <span className="text-[11px] tracking-[0.15em] uppercase text-muted-foreground">
                  Preview
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePreview}
                disabled={isPreviewing || !isFormValid}
                className="text-[11px] h-7 tracking-wider text-muted-foreground hover:text-primary"
              >
                {isPreviewing ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                    Loading
                  </>
                ) : (
                  <>
                    <Eye className="w-3 h-3 mr-1.5" />
                    Refresh
                  </>
                )}
              </Button>
            </div>

            {/* Preview content */}
            <div className="flex-1 overflow-y-auto">
              {previewFiles.length === 0 ? (
                <div className="h-full overflow-y-auto px-6 py-6">
                  <div className="mb-6">
                    <h2 className="text-sm font-semibold tracking-tight">Selected endpoints</h2>
                    <div className="mt-3 space-y-2">
                      {selectedEndpointItems.slice(0, 8).map((endpoint) => (
                        <EndpointRow key={endpoint.id} label={endpoint.label} toolName={endpoint.toolName} />
                      ))}
                      {selectedEndpointItems.length > 8 && (
                        <p className="text-[11px] text-muted-foreground">+{selectedEndpointItems.length - 8} more selected</p>
                      )}
                    </div>
                  </div>

                  <div className="mb-6">
                    <h2 className="text-sm font-semibold tracking-tight">Unsupported / manual review</h2>
                    <ManualReviewList items={manualReviewEndpoints} />
                  </div>

                  <div className="flex items-center justify-center text-center py-14 border-t border-border">
                    <div className="space-y-3">
                    <Terminal className="w-8 h-8 text-muted-foreground/30 mx-auto" />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Click &ldquo;Refresh&rdquo; to generate<br />
                      a live file preview{browserMode ? " (in-browser, private)" : ""}
                    </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full flex-col">
                  {previewData?.manifest && (
                    <div className="border-b border-border px-6 py-4 text-[10px] tracking-wider uppercase text-muted-foreground space-y-3">
                      <div className="flex items-center gap-2 text-foreground">
                        <Layers3 className="w-3.5 h-3.5 text-primary" />
                        <span>Generator v{previewData.manifest.generatorVersion}</span>
                        <span className="text-primary/20">·</span>
                        <span>{previewData.manifest.toolCount} tools</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(previewData.manifest.features).map(([feature, enabled]) => (
                          <Badge
                            key={feature}
                            variant="outline"
                            className={`text-[9px] border px-1.5 py-0 ${enabled ? "border-primary/40 text-primary" : "border-border text-muted-foreground"}`}
                          >
                            {feature}
                          </Badge>
                        ))}
                      </div>
                      {previewWarnings.length > 0 && (
                        <div className="space-y-1">
                          <div className="text-amber-500">Warnings</div>
                          {previewWarnings.slice(0, 5).map((issue, index) => (
                            <div key={`${issue.message}-${index}`} className="normal-case tracking-normal text-[11px] leading-relaxed">
                              {issue.path ? `${issue.path}: ` : ""}{issue.message}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="border-b border-border px-6 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h2 className="text-[10px] tracking-[0.18em] uppercase text-muted-foreground mb-2">Selected endpoints</h2>
                        <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                          {selectedEndpointItems.map((endpoint) => (
                            <EndpointRow key={endpoint.id} label={endpoint.label} toolName={endpoint.toolName} compact />
                          ))}
                        </div>
                      </div>
                      <div>
                        <h2 className="text-[10px] tracking-[0.18em] uppercase text-muted-foreground mb-2">Unsupported / manual review</h2>
                        <ManualReviewList items={manualReviewEndpoints} compact />
                      </div>
                    </div>
                  </div>
                <Tabs defaultValue={previewFiles[0]?.name} className="flex flex-col h-full">
                  <TabsList className="flex-wrap h-auto gap-0 bg-background border-b border-border px-4 py-0 rounded-none">
                    {previewFiles.map((f) => (
                      <TabsTrigger
                        key={f.name}
                        value={f.name}
                        className="text-[10px] px-3 py-2.5 tracking-wider data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
                      >
                        {f.name}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {previewFiles.map((f) => (
                    <TabsContent key={f.name} value={f.name} className="flex-1 m-0">
                      <div className="relative h-full">
                        <div className="absolute right-3 top-3 z-10">
                          <CopyButton value={f.content} />
                        </div>
                        <pre className="p-4 overflow-auto h-full text-[11px] leading-5 bg-background">
                          <code>{f.content}</code>
                        </pre>
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
                </div>
              )}
            </div>

            {/* Summary strip */}
            <div className="px-6 py-3 border-t border-border flex items-center gap-4 text-[10px] text-muted-foreground tracking-wider uppercase">
              <span>{exportConfig.language === "node" ? "TypeScript" : "Python"}</span>
              <span className="text-primary/20">·</span>
              <span>{getTransportLabel(serverConfig.transport)}</span>
              <span className="text-primary/20">·</span>
              <span>
                {exportConfig.compactMode
                  ? `compact · 3 meta-tools`
                  : `${selectedTools.length} tools`}
              </span>
              <span className="text-primary/20">·</span>
              <span>{formatAuthConfig(authConfig)}</span>
              <span className="text-primary/20">·</span>
              <span>{formatMcpServerAuthConfig(mcpServerAuthConfig, serverConfig.transport)}</span>
              <span className="text-primary/20">·</span>
              <span>{previewData?.manifest?.generatorVersion ? `v${previewData.manifest.generatorVersion}` : "preview"}</span>
            </div>
          </div>
        </div>

        {/* ─── Bottom action bar ─── */}
        <div className="border-t-2 border-primary bg-background z-20">
          <div className="max-w-[1400px] mx-auto px-6 pt-2.5 flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
            <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground/70" />
            {browserMode ? (
              <p>
                Privacy mode is on. Your spec is processed entirely in your browser to generate the code and build the zip &mdash; it is never sent to any server. Nothing is uploaded, stored, or shared.
              </p>
            ) : (
              <p>
                Your spec is sent to this app&rsquo;s server only to generate the code, processed in memory, and returned as a zip. It is not stored or persisted server-side. Generation runs entirely on our server; nothing is shared with third parties.
              </p>
            )}
          </div>
          <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => { setCurrentStep("editor"); router.push("/editor"); }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-2" />
              Back
            </Button>

            <div className="flex items-center gap-4">
              {error && (
                <span className="text-[11px] text-red tracking-wider">{error}</span>
              )}

              {!isFormValid && !isGenerating && (
                <span className="text-[10px] text-muted-foreground tracking-wider uppercase">
                  {selectedTools.length === 0
                    ? "No tools selected"
                    : !isAuthValid
                      ? "Authentication settings are incomplete"
                      : "Complete all fields"}
                </span>
              )}

              <Button
                onClick={handleGenerate}
                disabled={isGenerating || !isFormValid}
                className="bg-primary text-primary-foreground hover:bg-primary/90 px-10 font-semibold text-xs tracking-wider"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                    Generating
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5 mr-2" />
                    Generate & Download
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ─── Reusable sub-components ─── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-8 border-b-2 border-primary/20">
      <h2
        className="text-lg font-semibold tracking-tight mb-5"
        style={{ fontFamily: "'Clash Display', sans-serif" }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 bg-background border-border text-xs focus:border-primary"
      />
    </div>
  );
}

function LangCard({
  label,
  tag,
  tagColor,
  selected,
  onClick,
}: {
  label: string;
  tag: string;
  tagColor: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`
        p-5 border-2 text-left transition-all relative
        ${selected
          ? "border-primary bg-primary/[0.04]"
          : "border-border hover:border-muted-foreground"
        }
      `}
    >
      {selected && (
        <div className="absolute top-3 right-3 text-primary">
          <Check className="w-4 h-4" />
        </div>
      )}
      <div
        className="text-sm font-bold mb-1 tracking-wide"
        style={{ color: tagColor }}
      >
        {tag}
      </div>
      <div
        className="text-base font-semibold tracking-tight"
        style={{ fontFamily: "'Clash Display', sans-serif" }}
      >
        {label}
      </div>
    </button>
  );
}

function FeatureToggle({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = useId();
  const descriptionId = `${id}-description`;
  return (
    <div className="flex items-center justify-between gap-4 border border-border px-4 py-3">
      <div className="space-y-1">
        <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
        <p id={descriptionId} className="text-[11px] text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} aria-describedby={descriptionId} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function StatusRow({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "success" | "warning" | "danger" | "muted";
}) {
  const toneClass = {
    success: "text-primary border-primary/30",
    warning: "text-amber-500 border-amber-500/30",
    danger: "text-red border-red/30",
    muted: "text-muted-foreground border-border",
  }[tone];

  return (
    <div className={`flex items-start gap-3 border px-3 py-3 ${toneClass}`}>
      <div className="mt-0.5">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] tracking-[0.18em] uppercase text-muted-foreground">{label}</p>
        <p className="text-xs text-foreground mt-1 leading-relaxed break-words">{value}</p>
      </div>
    </div>
  );
}

function EndpointRow({
  label,
  toolName,
  compact = false,
}: {
  label: string;
  toolName: string;
  compact?: boolean;
}) {
  const [method, ...pathParts] = label.split(" ");
  const methodTone = {
    GET: "text-primary border-primary/30",
    POST: "text-blue-500 border-blue-500/30",
    PUT: "text-amber-500 border-amber-500/30",
    PATCH: "text-amber-500 border-amber-500/30",
    DELETE: "text-red border-red/30",
  }[method] || "text-muted-foreground border-border";

  return (
    <div className={`border border-border ${compact ? "px-2 py-1.5" : "px-3 py-2"}`}>
      <div className="flex items-center gap-2 min-w-0">
        <span className={`shrink-0 border px-1.5 py-0.5 text-[9px] font-semibold tracking-wider ${methodTone}`}>
          {method}
        </span>
        <span className="truncate text-xs text-foreground">{pathParts.join(" ") || label}</span>
      </div>
      <p className="mt-1 truncate text-[10px] text-muted-foreground">{toolName}</p>
    </div>
  );
}

function ManualReviewList({
  items,
  compact = false,
}: {
  items: EndpointReviewItem[];
  compact?: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className={`border border-border text-muted-foreground ${compact ? "px-2 py-2 text-[10px]" : "px-3 py-3 text-xs"}`}>
        No selected endpoints require manual review.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className={`border border-amber-500/30 ${compact ? "px-2 py-2" : "px-3 py-3"}`}>
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
            <p className="truncate text-xs text-foreground">{item.label}</p>
          </div>
          <p className="mt-1 truncate text-[10px] text-muted-foreground">{item.toolName}</p>
          <ul className="mt-2 space-y-1">
            {item.reasons.slice(0, compact ? 1 : 3).map((reason) => (
              <li key={reason} className="text-[10px] leading-relaxed text-muted-foreground">
                {reason}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* ─── Post-download success experience ─── */

function ConfigSnippet({
  title,
  hint,
  language,
  value,
}: {
  title: string;
  hint: string;
  language: "json" | "bash";
  value: string;
}) {
  return (
    <div className="border border-border">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">{title}</p>
          <p className="text-[10px] text-muted-foreground truncate">{hint}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[9px] tracking-[0.15em] uppercase text-muted-foreground border border-border px-1.5 py-0.5">
            {language}
          </span>
          <CopyButton value={value} />
        </div>
      </div>
      <pre className="p-3 overflow-x-auto text-[11px] leading-5 bg-background">
        <code>{value}</code>
      </pre>
    </div>
  );
}

function StepItem({ index, title, children }: { index: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 w-6 h-6 rounded-full border border-primary/40 text-primary text-[11px] font-semibold flex items-center justify-center">
        {index}
      </span>
      <div className="min-w-0 pt-0.5">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <div className="mt-1 text-xs text-muted-foreground leading-relaxed">{children}</div>
      </div>
    </li>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="text-[11px] bg-surface border border-border px-1 py-0.5 text-foreground">{children}</code>
  );
}

function SuccessView({
  snapshot,
  onBackToConfig,
  onDownloadAgain,
  isGenerating,
  error,
}: {
  snapshot: GeneratedSnapshot;
  onBackToConfig: () => void;
  onDownloadAgain: () => void;
  isGenerating: boolean;
  error: string | null;
}) {
  const isStdio = snapshot.transport === "stdio";
  const [projectDirectory, setProjectDirectory] = useState(`/absolute/path/to/${snapshot.serverName}`);
  const install = getInstallCommand(snapshot);
  const run = getRunCommand(snapshot);
  const claudeDesktopConfig = buildMcpServersConfig(snapshot, projectDirectory);
  const cursorConfig = buildCursorConfig(snapshot, projectDirectory);
  const claudeCli = buildClaudeCliCommand(snapshot, projectDirectory);
  const transportUrl = getSnapshotTransportUrl(snapshot);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-12 space-y-10">
        {/* Success header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 text-primary">
            <PartyPopper className="w-7 h-7" />
          </div>
          <h1
            className="text-3xl font-semibold tracking-tight"
            style={{ fontFamily: "'Clash Display', sans-serif" }}
          >
            Your MCP server is ready
          </h1>
          <p className="text-sm text-muted-foreground">
            <span className="text-foreground font-medium">{snapshot.serverName}.zip</span> is downloading to your machine.
            Follow the steps below to connect it to an MCP client.
          </p>
          <div className="flex items-center justify-center gap-3 pt-1 text-[10px] tracking-[0.15em] uppercase text-muted-foreground">
            <span>{snapshot.language === "node" ? "Node.js / TypeScript" : "Python"}</span>
            <span className="text-primary/20">·</span>
            <span>{getTransportLabel(snapshot.transport)}</span>
            <span className="text-primary/20">·</span>
            <span>
              {snapshot.compactMode
                ? "Compact · 3 meta-tools"
                : `${snapshot.toolCount} tool${snapshot.toolCount === 1 ? "" : "s"}`}
            </span>
          </div>
          {snapshot.compactMode && (
            <p className="text-[11px] text-muted-foreground leading-relaxed max-w-lg mx-auto">
              Compact mode is on: the server exposes <InlineCode>list_api_endpoints</InlineCode>,{" "}
              <InlineCode>get_api_endpoint_schema</InlineCode>, and{" "}
              <InlineCode>invoke_api_endpoint</InlineCode> — the model discovers and calls your{" "}
              {snapshot.toolCount} endpoint{snapshot.toolCount === 1 ? "" : "s"} on demand instead of
              loading them all into context.
            </p>
          )}
        </div>

        {/* Client config */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-primary" />
            <h2 className="text-lg font-semibold tracking-tight" style={{ fontFamily: "'Clash Display', sans-serif" }}>
              Connect your client
            </h2>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {isStdio
              ? "Local clients need an absolute entrypoint path. Enter the folder where you extracted the project, then fill the env values before copying a config."
              : "Client config formats vary, but the shape matches the generated README. Start the server first, then point your client at its URL. Configure .env on the machine where the server runs."}
          </p>

          {isStdio && (
            <div className="space-y-1.5">
              <Label htmlFor="generated-project-directory" className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
                Extracted project folder
              </Label>
              <Input
                id="generated-project-directory"
                value={projectDirectory}
                onChange={(event) => setProjectDirectory(event.target.value)}
                placeholder={`/absolute/path/to/${snapshot.serverName}`}
                className="h-9 bg-background border-border text-xs focus:border-primary"
              />
              {projectDirectory.startsWith("/absolute/path/to/") && (
                <p className="text-[11px] text-amber-500">
                  Replace the placeholder with the absolute path on your machine before using this config.
                </p>
              )}
            </div>
          )}

          <ConfigSnippet
            title="Claude Desktop"
            hint="Add to claude_desktop_config.json"
            language="json"
            value={claudeDesktopConfig}
          />
          <ConfigSnippet
            title="Cursor"
            hint="Add to .cursor/mcp.json (or the global mcp.json)"
            language="json"
            value={cursorConfig}
          />
          <ConfigSnippet
            title="Claude Code CLI"
            hint="Register the server from your terminal"
            language="bash"
            value={claudeCli}
          />

          {!isStdio && (
            <p className="text-[11px] text-muted-foreground leading-relaxed border border-border px-3 py-2">
              HTTP/SSE clients connect to <InlineCode>{transportUrl}</InlineCode>. Env vars such as
              upstream API auth and <InlineCode>MCP_AUTH_TOKEN</InlineCode> belong in the server&rsquo;s
              <InlineCode>.env</InlineCode>, not in the client config.
            </p>
          )}
        </section>

        {/* Next steps */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-primary" />
            <h2 className="text-lg font-semibold tracking-tight" style={{ fontFamily: "'Clash Display', sans-serif" }}>
              Next steps
            </h2>
          </div>
          <ol className="space-y-4">
            <StepItem index={1} title="Unzip the download">
              Extract <InlineCode>{snapshot.serverName}.zip</InlineCode> to a working folder.
            </StepItem>
            <StepItem index={2} title="Install dependencies">
              From the project root, run <InlineCode>{install}</InlineCode>
              {snapshot.language === "python" && (
                <> (or <InlineCode>uv pip install -e .</InlineCode> if you use uv)</>
              )}
              .
            </StepItem>
            <StepItem index={3} title="Configure secrets">
              Copy <InlineCode>.env.example</InlineCode> to <InlineCode>.env</InlineCode> with{" "}
              <InlineCode>cp .env.example .env</InlineCode>, then fill in the required values
              {snapshot.authType !== "none" && <> (including your upstream API credentials)</>}.
            </StepItem>
            <StepItem index={4} title={isStdio ? "Add to your client" : "Start the server, then add it to your client"}>
              {isStdio ? (
                <>Use the client config above. Local clients launch the server with <InlineCode>{getSnapshotStdioClient(snapshot, projectDirectory).command}</InlineCode> over stdio using the absolute entrypoint path you provided.</>
              ) : (
                <>Run <InlineCode>{run}</InlineCode> to start the server, then point your client at <InlineCode>{transportUrl}</InlineCode> using the config above.</>
              )}
            </StepItem>
          </ol>
        </section>

        {/* Star CTA */}
        <section className="border border-primary/30 bg-primary/[0.04] px-5 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Enjoying mcpmint?</p>
            <p className="text-xs text-muted-foreground">A star helps other developers find it.</p>
          </div>
          <Button asChild variant="outline" className="shrink-0 text-xs">
            <Link href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
              <Github className="w-3.5 h-3.5 mr-2" />
              Star on GitHub
            </Link>
          </Button>
        </section>

        {error && (
          <p className="text-[11px] text-red tracking-wider text-center">{error}</p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between border-t border-border pt-6">
          <Button
            variant="ghost"
            onClick={onBackToConfig}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-2" />
            Back to configuration
          </Button>
          <Button
            onClick={onDownloadAgain}
            disabled={isGenerating}
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 font-semibold text-xs tracking-wider"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                Generating
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5 mr-2" />
                Download again
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
