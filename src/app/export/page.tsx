"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  Loader2,
  Check,
  Terminal,
  FileJson,
  Code2,
  Eye,
  Shield,
  ArrowLeft,
} from "lucide-react";
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
import { AuthConfig, ParsedSpec, useProjectStore } from "@/store/project-store";

interface PreviewFile {
  name: string;
  content: string;
}

type AuthType = AuthConfig["type"];

function getDetectedAuthOptions(spec: ParsedSpec): AuthConfig[] {
  const options: AuthConfig[] = [];
  for (const scheme of Object.values(spec.securitySchemes)) {
    const c = scheme as { type?: string; scheme?: string; in?: string; name?: string };
    if (c.type === "apiKey") {
      options.push({
        type: "apiKey",
        apiKey: { name: c.name || "X-API-Key", in: c.in === "query" ? "query" : "header" },
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

export default function ExportPage() {
  const router = useRouter();
  const {
    spec,
    tools,
    serverConfig,
    exportConfig,
    authConfig,
    setServerConfig,
    setExportConfig,
    setAuthConfig,
    setCurrentStep,
    saveCurrentProject,
  } = useProjectStore();

  const [isGenerating, setIsGenerating] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewFiles, setPreviewFiles] = useState<PreviewFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [portValue, setPortValue] = useState(serverConfig.port.toString());

  useEffect(() => {
    if (!spec) router.push("/");
  }, [spec, router]);

  useEffect(() => {
    const n = parseInt(portValue);
    if (!isNaN(n) && n > 0 && n <= 65535) setServerConfig({ port: n });
  }, [portValue, setServerConfig]);

  if (!spec) return null;

  const selectedTools = tools.filter((t) => t.enabled);
  const detectedAuth = getDetectedAuthOptions(spec);
  const detectedApiKey = detectedAuth.find((o) => o.type === "apiKey");
  const port = parseInt(portValue, 10);
  const isPortValid = !isNaN(port) && port > 0 && port <= 65535;
  const isAuthValid = authConfig.type !== "apiKey" || Boolean(authConfig.apiKey?.name?.trim());

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

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec, tools: selectedTools, serverConfig, authConfig, exportConfig }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${serverConfig.name}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      saveCurrentProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePreview = async () => {
    setIsPreviewing(true);
    setError(null);
    try {
      const res = await fetch("/api/generate?preview=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec, tools: selectedTools, serverConfig, authConfig, exportConfig }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      const data = await res.json();
      setPreviewFiles(data.files || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setIsPreviewing(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="pt-14 flex-1 flex flex-col relative z-10">
        {/* ═══ Split view ═══ */}
        <div className="flex-1 flex">

          {/* ─── Left: Configuration ─── */}
          <div className="flex-1 overflow-y-auto border-r border-border">
            <div className="max-w-2xl mx-auto px-8 py-10 space-y-0">

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
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Name" value={serverConfig.name} onChange={(v) => setServerConfig({ name: v })} />
                  <Field label="Version" value={serverConfig.version} onChange={(v) => setServerConfig({ version: v })} />
                  <Field label="Host" value={serverConfig.host} onChange={(v) => setServerConfig({ host: v })} />
                  <div className="space-y-1.5">
                    <Label className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">Port</Label>
                    <Input
                      value={portValue}
                      onChange={(e) => setPortValue(e.target.value)}
                      className="h-8 bg-background border-border text-xs focus:border-primary"
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <Label className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase mb-2 block">
                    Transport
                  </Label>
                  <Select
                    value={serverConfig.transport}
                    onValueChange={(v) => setServerConfig({ transport: v as "stdio" | "sse" | "http" })}
                  >
                    <SelectTrigger className="h-8 bg-background border-border text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stdio">stdio</SelectItem>
                      <SelectItem value="sse">SSE</SelectItem>
                      <SelectItem value="http">HTTP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </Section>

              {/* Authentication */}
              <Section title="Auth">
                <Select value={authConfig.type} onValueChange={(v) => handleAuthTypeChange(v as AuthType)}>
                  <SelectTrigger className="h-8 bg-background border-border text-xs">
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
                      <Label className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">Location</Label>
                      <Select
                        value={authConfig.apiKey?.in || "header"}
                        onValueChange={(v) => setAuthConfig({ type: "apiKey", apiKey: { name: authConfig.apiKey?.name || "X-API-Key", in: v as "header" | "query" } })}
                      >
                        <SelectTrigger className="h-8 bg-background border-border text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="header">Header</SelectItem>
                          <SelectItem value="query">Query</SelectItem>
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
                <div className="flex items-center justify-center h-full text-center px-8">
                  <div className="space-y-3">
                    <Terminal className="w-8 h-8 text-muted-foreground/30 mx-auto" />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Click &ldquo;Refresh&rdquo; to generate<br />a live code preview
                    </p>
                  </div>
                </div>
              ) : (
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
              )}
            </div>

            {/* Summary strip */}
            <div className="px-6 py-3 border-t border-border flex items-center gap-4 text-[10px] text-muted-foreground tracking-wider uppercase">
              <span>{exportConfig.language === "node" ? "TypeScript" : "Python"}</span>
              <span className="text-primary/20">·</span>
              <span>{serverConfig.transport}</span>
              <span className="text-primary/20">·</span>
              <span>{selectedTools.length} tools</span>
              <span className="text-primary/20">·</span>
              <span>{getAuthLabel(authConfig.type)}</span>
            </div>
          </div>
        </div>

        {/* ─── Bottom action bar ─── */}
        <div className="border-t-2 border-primary bg-background z-20">
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
                  {selectedTools.length === 0 ? "No tools selected" : "Complete all fields"}
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
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">{label}</Label>
      <Input
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
