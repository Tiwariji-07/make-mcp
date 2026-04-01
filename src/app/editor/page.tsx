"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowLeft, Search, CheckSquare, Square, ChevronDown, ChevronRight } from "lucide-react";
import { Header } from "@/components/shared/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useProjectStore, ParsedEndpoint, ToolConfig } from "@/store/project-store";

export default function EditorPage() {
  const router = useRouter();
  const {
    spec,
    tools,
    toggleTool,
    toggleAllTools,
    updateToolConfig,
    setCurrentStep,
  } = useProjectStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMethodFilters, setSelectedMethodFilters] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!spec) router.push("/");
  }, [spec, router]);

  if (!spec) return null;

  const filteredEndpoints = spec.endpoints.filter((ep) => {
    const matchesSearch =
      !searchQuery ||
      ep.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ep.summary?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ep.operationId?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMethod =
      selectedMethodFilters.length === 0 || selectedMethodFilters.includes(ep.method);
    return matchesSearch && matchesMethod;
  });

  const selectedCount = tools.filter((t) => t.enabled).length;
  const allSelected = tools.every((t) => t.enabled);

  const toggleMethodFilter = (m: string) =>
    setSelectedMethodFilters((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
    );

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="pt-14 flex-1 flex flex-col relative z-10">
        {/* Toolbar */}
        <div className="border-b border-border bg-surface sticky top-14 z-20">
          <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center gap-4 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search endpoints..."
                className="pl-9 h-8 bg-background border-border text-xs focus:border-primary"
              />
            </div>

            {/* Method filters */}
            <div className="flex gap-1">
              {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                <button
                  key={m}
                  onClick={() => toggleMethodFilter(m)}
                  className={`
                    px-2.5 py-1 text-[10px] font-semibold tracking-wider transition-all
                    ${selectedMethodFilters.includes(m)
                      ? getMethodClasses(m as ParsedEndpoint["method"])
                      : "text-muted-foreground hover:text-foreground bg-transparent border border-transparent hover:border-border"
                    }
                  `}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Select all */}
            <button
              onClick={() => toggleAllTools(!allSelected)}
              className="flex items-center gap-1.5 text-[11px] tracking-wider text-muted-foreground hover:text-primary transition-colors"
            >
              {allSelected ? <Square className="w-3.5 h-3.5" /> : <CheckSquare className="w-3.5 h-3.5" />}
              {allSelected ? "NONE" : "ALL"}
            </button>
          </div>
        </div>

        {/* Table header */}
        <div className="border-b border-border bg-surface/50">
          <div className="max-w-[1400px] mx-auto px-6">
            <div className="grid grid-cols-[40px_70px_1fr_180px_80px_40px] gap-4 py-2 text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
              <span></span>
              <span>Method</span>
              <span>Path</span>
              <span>Tool Name</span>
              <span>Params</span>
              <span></span>
            </div>
          </div>
        </div>

        {/* Endpoint rows */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[1400px] mx-auto px-6">
            {filteredEndpoints.map((ep) => {
              const tool = tools.find((t) => t.endpointId === ep.id);
              if (!tool) return null;
              const isExpanded = expandedId === ep.id;

              return (
                <div key={ep.id} className="border-b border-border">
                  {/* Row */}
                  <div
                    className={`
                      grid grid-cols-[40px_70px_1fr_180px_80px_40px] gap-4 py-3 items-center cursor-pointer transition-colors
                      ${tool.enabled ? "bg-primary/[0.03]" : "hover:bg-surface/50"}
                      ${isExpanded ? "bg-surface" : ""}
                    `}
                    onClick={() => setExpandedId(isExpanded ? null : ep.id)}
                  >
                    {/* Checkbox */}
                    <div className="flex justify-center">
                      <Checkbox
                        checked={tool.enabled}
                        onCheckedChange={() => toggleTool(ep.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>

                    {/* Method */}
                    <Badge className={`${getMethodClasses(ep.method)} text-[10px] font-bold tracking-wider w-fit`}>
                      {ep.method}
                    </Badge>

                    {/* Path */}
                    <div className="min-w-0">
                      <code className="text-xs truncate block">{ep.path}</code>
                      {ep.summary && (
                        <span className="text-[10px] text-muted-foreground truncate block mt-0.5">
                          {ep.summary}
                        </span>
                      )}
                    </div>

                    {/* Tool name */}
                    <code className={`text-[11px] truncate ${tool.enabled ? "text-primary" : "text-muted-foreground"}`}>
                      {tool.toolName}
                    </code>

                    {/* Params */}
                    <span className="text-[11px] text-muted-foreground">
                      {tool.parameters.length} param{tool.parameters.length !== 1 ? "s" : ""}
                    </span>

                    {/* Expand arrow */}
                    <div className="flex justify-center">
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      />
                    </div>
                  </div>

                  {/* Inline expansion */}
                  {isExpanded && (
                    <div className="animate-expand bg-surface border-t border-border px-6 py-5">
                      <div className="grid md:grid-cols-2 gap-6 max-w-3xl">
                        {/* Tool Name */}
                        <div className="space-y-1.5">
                          <Label className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
                            Tool Name
                          </Label>
                          <Input
                            value={tool.toolName}
                            onChange={(e) => updateToolConfig(ep.id, { toolName: e.target.value })}
                            className="h-8 bg-background border-border text-xs focus:border-primary"
                          />
                        </div>

                        {/* Enable */}
                        <div className="space-y-1.5">
                          <Label className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
                            Status
                          </Label>
                          <Button
                            variant={tool.enabled ? "default" : "outline"}
                            size="sm"
                            className={`w-full text-xs ${tool.enabled ? "bg-primary text-primary-foreground" : "border-border"}`}
                            onClick={() => updateToolConfig(ep.id, { enabled: !tool.enabled })}
                          >
                            {tool.enabled ? "Enabled" : "Disabled"}
                          </Button>
                        </div>

                        {/* Description */}
                        <div className="space-y-1.5 md:col-span-2">
                          <Label className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
                            Description
                          </Label>
                          <Textarea
                            value={tool.description}
                            onChange={(e) => updateToolConfig(ep.id, { description: e.target.value })}
                            className="min-h-[60px] bg-background border-border text-xs resize-none focus:border-primary"
                          />
                        </div>

                        {/* Parameters */}
                        {tool.parameters.length > 0 && (
                          <div className="md:col-span-2 space-y-2">
                            <Label className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
                              Parameters ({tool.parameters.length})
                            </Label>
                            <div className="space-y-2 max-h-[250px] overflow-y-auto">
                              {tool.parameters.map((param, idx) => (
                                <div key={`${param.originalName}-${idx}`} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                                  <Badge
                                    variant="outline"
                                    className={`text-[9px] w-12 justify-center ${getLocationClasses(param.location)}`}
                                  >
                                    {param.location}
                                  </Badge>
                                  <Input
                                    value={param.name}
                                    onChange={(e) => {
                                      const newParams = [...tool.parameters];
                                      newParams[idx] = { ...param, name: e.target.value };
                                      updateToolConfig(ep.id, { parameters: newParams });
                                    }}
                                    className="h-7 w-32 bg-background border-border text-[11px] focus:border-primary"
                                  />
                                  <span className="text-[10px] text-muted-foreground">{param.type}</span>
                                  {param.required && (
                                    <span className="text-[9px] text-amber tracking-wider uppercase">req</span>
                                  )}
                                  <Input
                                    value={param.description}
                                    onChange={(e) => {
                                      const newParams = [...tool.parameters];
                                      newParams[idx] = { ...param, description: e.target.value };
                                      updateToolConfig(ep.id, { parameters: newParams });
                                    }}
                                    className="h-7 flex-1 bg-background border-border text-[11px] focus:border-primary"
                                    placeholder="Description..."
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {filteredEndpoints.length === 0 && (
              <div className="py-20 text-center text-sm text-muted-foreground">
                No endpoints match your filters.
              </div>
            )}
          </div>
        </div>

        {/* Sticky bottom bar */}
        <div className="sticky bottom-0 border-t-2 border-primary bg-background z-20">
          <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => { setCurrentStep("import"); router.push("/"); }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-2" />
              Back
            </Button>

            <div className="flex items-center gap-6">
              <span className="text-xs text-muted-foreground">
                <span className="text-primary font-semibold">{selectedCount}</span>
                <span className="mx-1">/</span>
                <span>{tools.length}</span>
                <span className="ml-1.5 tracking-wider uppercase text-[10px]">selected</span>
              </span>

              <Button
                onClick={() => { setCurrentStep("export"); router.push("/export"); }}
                disabled={selectedCount === 0}
                className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 font-semibold text-xs tracking-wider"
              >
                Continue
                <ArrowRight className="w-3.5 h-3.5 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function getMethodClasses(method: ParsedEndpoint["method"]): string {
  const m: Record<string, string> = {
    GET: "method-get",
    POST: "method-post",
    PUT: "method-put",
    PATCH: "method-patch",
    DELETE: "method-delete",
  };
  return m[method] || "";
}

function getLocationClasses(loc: string): string {
  const c: Record<string, string> = {
    path: "border-purple-500/40 text-purple-400",
    query: "border-blue/40 text-blue",
    header: "border-amber/40 text-amber",
    body: "border-green/40 text-green",
  };
  return c[loc] || "border-border text-muted-foreground";
}
