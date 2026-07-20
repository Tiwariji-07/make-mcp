"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Sparkles, X } from "lucide-react";
import { Header } from "@/components/shared/header";
import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/store/project-store";
import { parseOpenAPIFromContent } from "@/lib/parsers/openapi";

// Light heuristic: does this pasted blob look like an API spec we can parse?
// Actual parsing/validation is delegated to parseOpenAPIFromContent — this only
// guards against hijacking arbitrary clipboard pastes (e.g. copied prose).
function looksLikeSpec(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return false;
  const head = t.slice(0, 4000).toLowerCase();
  return (
    /["']?(openapi|swagger)["']?\s*:/.test(head) || // OpenAPI / Swagger (JSON or YAML)
    (head.includes("info") && (head.includes("paths") || head.includes("schema"))) ||
    head.includes("_postman_id") || // Postman collection
    head.includes("postman_collection")
  );
}

export default function HomePage() {
  const router = useRouter();
  const { spec, setSpec, setCurrentStep, setError, error } = useProjectStore();
  const [isNavigating, setIsNavigating] = useState(false);
  const [isSampleLoading, setIsSampleLoading] = useState(false);
  const [isPasteParsing, setIsPasteParsing] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Do NOT auto-redirect when a persisted/in-memory spec exists. Persistence is
  // now on, so bouncing returning users into the editor would trap them here.
  // Instead we surface a "Continue where you left off" CTA below.
  const hasSession = Boolean(spec);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  const handleImport = () => {
    setIsNavigating(true);
    router.push("/import");
  };

  const handleContinue = () => {
    setIsNavigating(true);
    setCurrentStep("editor");
    router.push("/editor");
  };

  // Mirrors import/page.tsx's handleTrySample: fetch the bundled sample spec,
  // parse it through the shared parser, store it, and advance to the editor.
  const handleTrySample = async () => {
    setIsSampleLoading(true);
    setError(null);
    try {
      const res = await fetch("/samples/petstore.json");
      if (!res.ok) throw new Error("Could not load the sample spec");
      const content = await res.text();
      const parsedSpec = await parseOpenAPIFromContent(content, "petstore.json");
      setSpec(parsedSpec, "Petstore (sample)");
      setCurrentStep("editor");
      router.push("/editor");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sample");
      setIsSampleLoading(false);
    }
  };

  // Global ⌘V / Ctrl+V paste — reuse the shared parser, then jump to the editor.
  const handleGlobalPaste = useCallback(
    async (e: ClipboardEvent) => {
      // Don't hijack paste while the user is typing into an input/textarea/editable.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (!looksLikeSpec(text)) return;

      e.preventDefault();
      setIsPasteParsing(true);
      setError(null);
      try {
        const parsedSpec = await parseOpenAPIFromContent(text, "pasted-spec");
        setSpec(parsedSpec, "Pasted Content");
        setCurrentStep("editor");
        router.push("/editor");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "That didn't look like a valid spec",
        );
        setIsPasteParsing(false);
      }
    },
    [router, setSpec, setCurrentStep, setError],
  );

  useEffect(() => {
    window.addEventListener("paste", handleGlobalPaste);
    return () => window.removeEventListener("paste", handleGlobalPaste);
  }, [handleGlobalPaste]);

  return (
    <div className="min-h-screen relative">
      <Header />

      <main className="pt-14 relative z-10">
        {/* ═══ HERO — Full viewport, asymmetric ═══ */}
        <section className="min-h-[calc(100vh-56px)] flex">
          {/* Left — Oversized headline */}
          <div className="flex-1 flex flex-col justify-center px-8 md:px-16 lg:px-24 py-20">
            <div
              className={`space-y-8 max-w-2xl transition-all duration-700 ${
                mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              }`}
            >
              {/* Status pill */}
              <div className="flex items-center gap-3 text-[11px] tracking-[0.2em] uppercase text-muted-foreground">
                <span className="w-1.5 h-1.5 bg-primary animate-subtle-pulse" />
                <span>v0.1.0 — beta</span>
              </div>

              {/* Headline — stacked, oversized */}
              <h1
                className="text-[clamp(3rem,8vw,7rem)] font-bold leading-[0.95] tracking-[-0.03em]"
                style={{ fontFamily: "'Clash Display', sans-serif" }}
              >
                <span className="block">Transform</span>
                <span className="block">your APIs</span>
                <span className="block">
                  into{" "}
                  <span className="text-primary">MCP</span>
                </span>
              </h1>

              {/* Description */}
              <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
                File and paste imports stay on this device, and browser generation
                is the privacy-first default. URL imports use a hardened server
                fetch; optional server-side verification is clearly opt-in.
              </p>

              {/* Continue where you left off — only when a session is persisted */}
              {hasSession && (
                <button
                  onClick={handleContinue}
                  disabled={isNavigating}
                  className="flex items-center gap-3 w-full max-w-md border border-primary/40 bg-primary/[0.04] hover:bg-primary/[0.08] hover:border-primary/60 px-4 py-3 transition-colors text-left group"
                >
                  <div className="flex-1">
                    <div className="text-[10px] text-muted-foreground tracking-[0.15em] uppercase">
                      Resume session
                    </div>
                    <div className="text-sm font-semibold text-foreground">
                      Continue where you left off
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-primary transition-transform group-hover:translate-x-1" />
                </button>
              )}

              {/* CTA */}
              <div className="flex flex-wrap items-center gap-4 pt-4">
                <Button
                  onClick={handleImport}
                  disabled={isNavigating}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-6 text-sm font-semibold tracking-wide transition-all duration-200 hover:translate-x-1"
                >
                  {isNavigating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading
                    </>
                  ) : (
                    <>
                      Start Building
                      <ArrowRight className="w-4 h-4 ml-3" />
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  onClick={handleTrySample}
                  disabled={isSampleLoading || isNavigating}
                  className="border-border hover:border-primary/60 hover:text-primary px-8 py-6 text-sm font-semibold tracking-wide"
                >
                  {isSampleLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading sample
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2 text-primary" />
                      Try a sample API
                    </>
                  )}
                </Button>

                <Link
                  href="https://github.com/mcpmint/mcpmint#readme"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors border-draw pb-1"
                >
                  Read docs →
                </Link>
              </div>

              {/* Keyboard hint */}
              <div className="pt-4 text-[11px] text-muted-foreground tracking-wider flex items-center">
                {isPasteParsing ? (
                  <span className="flex items-center text-primary">
                    <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                    Parsing pasted spec...
                  </span>
                ) : (
                  <>
                    <kbd className="px-2 py-1 border border-border bg-surface text-xs">⌘V</kbd>
                    <span className="ml-2">to paste spec directly</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right — Terminal animation */}
          <div
            className={`hidden lg:flex w-[45%] border-l border-border bg-surface items-center justify-center p-12 transition-all duration-700 delay-200 ${
              mounted ? "opacity-100" : "opacity-0"
            }`}
          >
            <div className="w-full max-w-lg">
              {/* Terminal window */}
              <div className="border border-border">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-background">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 bg-red/60" />
                    <div className="w-2.5 h-2.5 bg-amber/60" />
                    <div className="w-2.5 h-2.5 bg-green/60" />
                  </div>
                  <span className="text-[10px] text-muted-foreground tracking-[0.15em] uppercase">
                    mcp-server.ts
                  </span>
                  <div className="w-12" />
                </div>

                <div className="p-5 text-[13px] leading-7 bg-background/50">
                  <div className="flex">
                    <div className="w-8 text-right pr-4 text-muted-foreground/30 select-none text-[11px]">
                      1<br />2<br />3<br />4<br />5<br />6<br />7<br />8<br />9
                    </div>
                    <div>
                      {"// auto-generated by mcpmint"}<br />
                      <span className="text-blue">import</span>{" {McpServer} "}<span className="text-blue">from</span>{" "}<span className="text-green">&quot;@modelcontextprotocol/sdk/server/mcp.js&quot;</span>;<br />
                      <br />
                      <span className="text-blue">const</span>{" server = "}<span className="text-blue">new</span>{" "}<span className="text-amber">McpServer</span>{"({"}<br />
                      {"  name: "}<span className="text-green">&quot;petstore&quot;</span>,<br />
                      {"  version: "}<span className="text-green">&quot;1.0.0&quot;</span>,<br />
                      {"});"}<br />
                      <span className="text-muted-foreground cursor-blink">server.registerTool(...)</span>
                    </div>
                  </div>
                </div>

                {/* Status bar */}
                <div className="px-4 py-2 border-t border-border flex items-center justify-between text-[10px] text-muted-foreground tracking-[0.1em] uppercase">
                  <span>TypeScript</span>
                  <span className="text-primary">● ready</span>
                </div>
              </div>

              {/* Output labels */}
              <div className="mt-6 flex gap-3">
                <div className="flex-1 border border-border p-3 text-center">
                  <div className="text-[10px] text-muted-foreground tracking-[0.15em] uppercase mb-1">Output</div>
                  <div className="text-sm font-semibold" style={{ fontFamily: "'Clash Display', sans-serif" }}>
                    TS / PY
                  </div>
                </div>
                <div className="flex-1 border border-border p-3 text-center">
                  <div className="text-[10px] text-muted-foreground tracking-[0.15em] uppercase mb-1">Transport</div>
                  <div className="text-sm font-semibold" style={{ fontFamily: "'Clash Display', sans-serif" }}>
                    stdio / HTTP
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ FEATURES — Numbered blocks with thick borders ═══ */}
        <section className="border-t-2 border-primary">
          <div className="max-w-[1400px] mx-auto">
            {[
              {
                num: "01",
                title: "Standard Compliant",
                desc: "Built strictly following the Model Context Protocol specification. Compatible with Claude Desktop, Zed, Cursor, and any MCP client.",
              },
              {
                num: "02",
                title: "Zero Boilerplate",
                desc: "We handle transport layers, error handling, input validation, and type definitions. You get a clean, deployable server codebase instantly.",
              },
              {
                num: "03",
                title: "AI-Optimized Context",
                desc: "Automatically extracts descriptions, schemas, and examples to create rich tool annotations that maximize LLM reasoning over your data.",
              },
            ].map((feature, i) => (
              <div
                key={feature.num}
                className={`flex items-start gap-8 md:gap-16 px-8 md:px-16 lg:px-24 py-16 relative overflow-hidden ${
                  i < 2 ? "border-b border-border" : ""
                }`}
              >
                {/* Watermark number */}
                <div className="watermark">{feature.num}</div>

                {/* Number */}
                <div
                  className="text-5xl md:text-7xl font-bold text-primary/20 shrink-0 w-20 md:w-28"
                  style={{ fontFamily: "'Clash Display', sans-serif" }}
                >
                  {feature.num}
                </div>

                {/* Content */}
                <div className="pt-2 md:pt-4 max-w-xl">
                  <h3
                    className="text-xl md:text-2xl font-semibold mb-3 tracking-tight"
                    style={{ fontFamily: "'Clash Display', sans-serif" }}
                  >
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {feature.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ═══ FOOTER ═══ */}
        <footer className="border-t border-border px-8 md:px-16 lg:px-24 py-8">
          <div className="max-w-[1400px] mx-auto flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground tracking-[0.15em] uppercase">
              mcpmint — MIT Licensed
            </span>
            <div className="flex gap-6 text-[11px] text-muted-foreground tracking-wider">
              <a href="https://github.com/mcpmint/mcpmint" target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">
                GitHub
              </a>
              <a href="https://github.com/mcpmint/mcpmint#readme" target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">
                Docs
              </a>
            </div>
          </div>
        </footer>

        {/* Error bar — mirrors the import page */}
        {error && (
          <div className="fixed bottom-0 left-0 right-0 bg-red/10 border-t-2 border-red px-6 py-3 flex items-center justify-between z-30">
            <span className="text-sm text-red">
              <span className="font-bold tracking-wider uppercase">Error: </span>
              {error}
            </span>
            <button onClick={() => setError(null)} className="text-red hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
