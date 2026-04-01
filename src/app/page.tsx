"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { Header } from "@/components/shared/header";
import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/store/project-store";

export default function HomePage() {
  const router = useRouter();
  const { spec } = useProjectStore();
  const [isNavigating, setIsNavigating] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (spec) router.push("/editor");
  }, [spec, router]);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  const handleImport = () => {
    setIsNavigating(true);
    router.push("/import");
  };

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
                <span>v1.0.0 — stable</span>
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
                Import OpenAPI or Postman specs. Select endpoints.
                Export production-ready Model Context Protocol servers
                in TypeScript or Python.
              </p>

              {/* CTA */}
              <div className="flex items-center gap-6 pt-4">
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

                <Link
                  href="https://github.com/Tiwariji-07/make-mcp#readme"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors border-draw pb-1"
                >
                  Read docs →
                </Link>
              </div>

              {/* Keyboard hint */}
              <div className="pt-4 text-[11px] text-muted-foreground tracking-wider">
                <kbd className="px-2 py-1 border border-border bg-surface text-xs">⌘V</kbd>
                <span className="ml-2">to paste spec directly</span>
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
                      {"// auto-generated by makemcp"}<br />
                      <span className="text-blue">import</span>{" {Server} "}<span className="text-blue">from</span>{" "}<span className="text-green">&quot;@mcp/sdk&quot;</span>;<br />
                      <br />
                      <span className="text-blue">const</span>{" server = "}<span className="text-blue">new</span>{" "}<span className="text-amber">Server</span>{"({"}<br />
                      {"  name: "}<span className="text-green">&quot;petstore&quot;</span>,<br />
                      {"  version: "}<span className="text-green">&quot;1.0.0&quot;</span>,<br />
                      {"  tools: "}<span className="text-primary">14</span>,<br />
                      {"});"}<br />
                      <span className="text-muted-foreground cursor-blink">server.start()</span>
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
                    stdio / SSE
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
              MakeMCP — MIT Licensed
            </span>
            <div className="flex gap-6 text-[11px] text-muted-foreground tracking-wider">
              <a href="https://github.com/Tiwariji-07/make-mcp" target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">
                GitHub
              </a>
              <a href="https://github.com/Tiwariji-07/make-mcp#readme" target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">
                Docs
              </a>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
