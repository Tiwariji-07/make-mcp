"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  Link as LinkIcon,
  ArrowRight,
  FileCode2,
  Clock,
  ChevronRight,
  ChevronUp,
  Loader2,
  X,
  Sparkles,
} from "lucide-react";
import { Header } from "@/components/shared/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useProjectStore, type ParsedSpec } from "@/store/project-store";
import {
  parseOpenAPIFromContent,
  parseOpenAPIFromURL,
  buildValidationSummary,
  stashValidationSummary,
} from "@/lib/parsers/openapi";
import { useDropzone } from "react-dropzone";

type ImportTab = "file" | "url" | "paste";
const MAX_LOCAL_SPEC_BYTES = 5 * 1024 * 1024;

export default function ImportPage() {
  const router = useRouter();
  const {
    setSpec,
    setCurrentStep,
    setLoading,
    setError,
    error,
    savedProjects,
    loadProject,
    clearSavedProjects,
  } = useProjectStore();

  const [activeTab, setActiveTab] = useState<ImportTab>("file");
  const [specUrl, setSpecUrl] = useState("");
  const [pastedContent, setPastedContent] = useState("");
  const [isUrlFetching, setIsUrlFetching] = useState(false);
  const [isFileParsing, setIsFileParsing] = useState(false);
  const [isPasteParsing, setIsPasteParsing] = useState(false);
  const [isSampleLoading, setIsSampleLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Shared post-parse step for EVERY import path (file / url / paste / sample):
  // run validateSpec() via buildValidationSummary(), stash the concise summary
  // for the editor banner, commit the spec to the store, and advance.
  const finishImport = (parsedSpec: ParsedSpec, source: string, label?: string) => {
    const summary = buildValidationSummary(parsedSpec, label);
    stashValidationSummary(summary);
    setSpec(parsedSpec, source);
    setCurrentStep("editor");
    router.push("/editor");
  };

  const handleTrySample = async () => {
    setIsSampleLoading(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/samples/petstore.json");
      if (!res.ok) throw new Error("Could not load the sample spec");
      const content = await res.text();
      const parsedSpec = await parseOpenAPIFromContent(content, "petstore.json");
      finishImport(parsedSpec, "Petstore (sample)", "Petstore (sample)");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sample");
      setIsSampleLoading(false);
      setLoading(false);
    }
  };

  const onDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];
    if (file.size > MAX_LOCAL_SPEC_BYTES) {
      setError("This specification is larger than 5 MB. Split or reduce it before importing to keep browser generation responsive.");
      return;
    }
    setIsFileParsing(true);
    setLoading(true);
    setError(null);
    try {
      const content = await file.text();
      const parsedSpec = await parseOpenAPIFromContent(content, file.name);
      finishImport(parsedSpec, file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse file");
      setLoading(false);
      setIsFileParsing(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/json": [".json"],
      "application/x-yaml": [".yaml", ".yml"],
      "text/yaml": [".yaml", ".yml"],
      "text/x-yaml": [".yaml", ".yml"],
    },
    maxFiles: 1,
    maxSize: MAX_LOCAL_SPEC_BYTES,
    noClick: false,
    onDropRejected: (rejections) => {
      const tooLarge = rejections.some((rejection) =>
        rejection.errors.some((candidate) => candidate.code === "file-too-large")
      );
      setError(tooLarge
        ? "This specification is larger than 5 MB. Split or reduce it before importing."
        : "Choose one OpenAPI, Swagger, or Postman JSON/YAML file.");
    },
  });

  const handleUrlFetch = async () => {
    if (!specUrl.trim()) return;
    setIsUrlFetching(true);
    setLoading(true);
    setError(null);
    try {
      const parsedSpec = await parseOpenAPIFromURL(specUrl);
      finishImport(parsedSpec, specUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch spec");
      setIsUrlFetching(false);
      setLoading(false);
    }
  };

  const handlePasteParse = async () => {
    if (!pastedContent.trim()) return;
    if (new TextEncoder().encode(pastedContent).byteLength > MAX_LOCAL_SPEC_BYTES) {
      setError("Pasted specifications are limited to 5 MB to keep browser generation responsive.");
      return;
    }
    setIsPasteParsing(true);
    setLoading(true);
    setError(null);
    try {
      const parsedSpec = await parseOpenAPIFromContent(pastedContent, "pasted-spec");
      finishImport(parsedSpec, "Pasted Content");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse content");
      setIsPasteParsing(false);
      setLoading(false);
    }
  };

  const isProcessing = isFileParsing || isUrlFetching || isPasteParsing;

  const handleLoadProject = (id: string) => {
    if (loadProject(id)) router.push("/editor");
  };

  const handleClearHistory = () => {
    if (window.confirm("Clear every saved project from this browser? This cannot be undone.")) {
      clearSavedProjects();
    }
  };

  return (
    <div className="min-h-screen relative">
      <Header />

      {/* Processing overlay */}
      {isProcessing && (
        <div className="fixed inset-0 bg-background/90 z-50 flex items-center justify-center">
          <div className="text-center space-y-4">
            <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
            <p className="text-sm tracking-[0.15em] uppercase text-muted-foreground">
              {isUrlFetching ? "Fetching specification..." : "Parsing file..."}
            </p>
          </div>
        </div>
      )}

      <main className="pt-14 relative z-10 min-h-screen flex flex-col">
        {/* Tab bar */}
        <div className="border-b border-border">
          <div className="max-w-[1400px] mx-auto px-6 flex items-center justify-between">
            <div className="flex">
              {(["file", "url", "paste"] as ImportTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`
                    px-6 py-4 text-[11px] tracking-[0.2em] uppercase transition-colors relative
                    ${activeTab === tab
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                    }
                  `}
                >
                  {tab}
                  {activeTab === tab && (
                    <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary" />
                  )}
                </button>
              ))}
            </div>

            {/* History toggle */}
            {savedProjects.length > 0 && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center gap-2 text-[11px] tracking-[0.15em] uppercase text-muted-foreground hover:text-primary transition-colors"
              >
                <Clock className="w-3.5 h-3.5" />
                History ({savedProjects.length})
                <ChevronUp className={`w-3 h-3 transition-transform ${showHistory ? "" : "rotate-180"}`} />
              </button>
            )}
          </div>
        </div>

        {/* History drawer */}
        {showHistory && savedProjects.length > 0 && (
          <div className="border-b border-border bg-surface animate-slide-down">
            <div className="max-w-[1400px] mx-auto px-6 py-4">
              <div className="flex gap-3 overflow-x-auto pb-1">
                {savedProjects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => handleLoadProject(project.id)}
                    className="shrink-0 flex items-center gap-3 px-4 py-3 border border-border hover:border-primary/30 bg-background transition-colors group"
                  >
                    <div className="text-left">
                      <p className="text-xs font-semibold truncate max-w-[180px]">{project.name}</p>
                      <p className="text-[10px] text-muted-foreground tracking-wider uppercase mt-0.5">
                        {project.format} · {project.endpointCount} endpoints
                      </p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary" />
                  </button>
                ))}
                <button
                  onClick={handleClearHistory}
                  className="shrink-0 px-3 py-3 text-[10px] text-muted-foreground hover:text-red tracking-wider uppercase transition-colors"
                >
                  Clear All
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Content area — fills remaining space ═══ */}
        <div className="flex-1 flex flex-col">
          {/* FILE tab — full-page dropzone */}
          {activeTab === "file" && (
            <div
              {...getRootProps()}
              className={`
                flex-1 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 relative
                ${isDragActive ? "bg-primary/[0.03]" : ""}
              `}
            >
              <input {...getInputProps({ "aria-label": "Choose an OpenAPI, Swagger, or Postman specification file" })} />

              {/* Corner brackets on drag */}
              {isDragActive && (
                <>
                  <div className="absolute top-8 left-8 w-12 h-12 border-l-2 border-t-2 border-primary" />
                  <div className="absolute top-8 right-8 w-12 h-12 border-r-2 border-t-2 border-primary" />
                  <div className="absolute bottom-8 left-8 w-12 h-12 border-l-2 border-b-2 border-primary" />
                  <div className="absolute bottom-8 right-8 w-12 h-12 border-r-2 border-b-2 border-primary" />
                </>
              )}

              <div className="text-center space-y-6">
                {isDragActive ? (
                  <h2
                    className="text-6xl md:text-8xl font-bold text-primary tracking-tight"
                    style={{ fontFamily: "'Clash Display', sans-serif" }}
                  >
                    DROP
                  </h2>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-muted-foreground mx-auto" />
                    <h2
                      className="text-3xl md:text-4xl font-semibold tracking-tight"
                      style={{ fontFamily: "'Clash Display', sans-serif" }}
                    >
                      Drop your spec here
                    </h2>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto">
                      Swagger 2.0+ / OpenAPI 3.x / Postman v2.1 — JSON or YAML
                    </p>
                    <div className="flex items-center justify-center gap-3">
                      <Button
                        variant="outline"
                        className="border-border hover:border-primary/40 hover:text-primary"
                      >
                        Or select file
                      </Button>
                      <button
                        type="button"
                        onClick={(e) => {
                          // Don't let the click bubble to the dropzone root (which opens the file picker).
                          e.stopPropagation();
                          handleTrySample();
                        }}
                        disabled={isSampleLoading}
                        className="inline-flex items-center gap-2 px-4 h-9 text-xs tracking-wider text-muted-foreground hover:text-primary border border-transparent hover:border-primary/30 transition-colors disabled:opacity-60"
                      >
                        {isSampleLoading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5" />
                        )}
                        Try a sample API
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* URL tab — clean single input */}
          {activeTab === "url" && (
            <div className="flex-1 flex items-center justify-center px-6">
              <div className="w-full max-w-2xl space-y-6">
                <h2
                  className="text-2xl font-semibold tracking-tight"
                  style={{ fontFamily: "'Clash Display', sans-serif" }}
                >
                  Import from URL
                </h2>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="spec-url"
                      aria-label="Specification URL"
                      value={specUrl}
                      onChange={(e) => setSpecUrl(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleUrlFetch()}
                      placeholder="https://api.example.com/swagger.json"
                      className="pl-11 py-6 bg-surface border-border text-sm focus:border-primary"
                    />
                  </div>
                  <Button
                    onClick={handleUrlFetch}
                    disabled={isUrlFetching || !specUrl.trim()}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-6 font-semibold"
                  >
                    {isUrlFetching ? "Fetching..." : "Import"}
                    {!isUrlFetching && <ArrowRight className="w-4 h-4 ml-2" />}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground tracking-wider">
                  OpenAPI, Swagger or Postman — fetched securely server-side to avoid CORS.
                  Press <kbd className="px-1.5 py-0.5 border border-border bg-background text-[10px]">Enter</kbd> to import.
                </p>
              </div>
            </div>
          )}

          {/* PASTE tab — terminal textarea */}
          {activeTab === "paste" && (
            <div className="flex-1 flex flex-col max-w-[1400px] mx-auto w-full px-6 py-8">
              <div className="flex items-center justify-between mb-4">
                <h2
                  className="text-2xl font-semibold tracking-tight"
                  style={{ fontFamily: "'Clash Display', sans-serif" }}
                >
                  Paste content
                </h2>
                <Button
                  onClick={handlePasteParse}
                  disabled={isPasteParsing || !pastedContent.trim()}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                >
                  {isPasteParsing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Parsing...
                    </>
                  ) : (
                    <>
                      Parse
                      <FileCode2 className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
              <Textarea
                id="pasted-specification"
                aria-label="Pasted API specification"
                value={pastedContent}
                onChange={(e) => setPastedContent(e.target.value)}
                placeholder={'{"openapi":"3.0.0","info":{"title":"My API"}, ...}'}
                className="flex-1 min-h-[400px] bg-background border-border text-sm resize-none focus:border-primary leading-6"
              />
            </div>
          )}
        </div>

        {/* Error bar */}
        {error && (
          <div role="alert" className="fixed bottom-0 left-0 right-0 bg-red/10 border-t-2 border-red px-6 py-3 flex items-center justify-between z-30">
            <span className="text-sm text-red">
              <span className="font-bold tracking-wider uppercase">Error: </span>
              {error}
            </span>
            <button aria-label="Dismiss error" onClick={() => setError(null)} className="text-red hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
