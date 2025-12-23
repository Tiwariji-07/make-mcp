"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles, Code2, FileJson } from "lucide-react";
import { Header } from "@/components/shared/header";
import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/store/project-store";

export default function HomePage() {
  const router = useRouter();
  const { spec } = useProjectStore();

  // Navigate to editor when spec is already loaded
  useEffect(() => {
    if (spec) {
      router.push("/editor");
    }
  }, [spec, router]);

  return (
    <div className="min-h-screen">
      <Header />

      <main className="pt-24 px-6">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center min-h-[calc(100vh-200px)]">

          {/* Left Column: Hero */}
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 glass rounded-full border-primary/20 text-xs font-medium text-primary">
                <Sparkles className="w-3 h-3" />
                <span>VERSION 1.0 RELEASED</span>
              </div>

              <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-[1.1]">
                Bridge APIs to <br />
                <span className="text-gradient">LLM Context</span>
              </h1>

              <p className="text-xl text-muted-foreground/80 leading-relaxed max-w-lg">
                Transform Swagger specs and Postman Collections into type-safe
                Model Context Protocol servers. Enable LLMs to interact with your data instantly.
              </p>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-wrap gap-4">
              <Button
                size="lg"
                className="bg-primary hover:bg-primary/90 px-8 py-6 text-lg"
                onClick={() => router.push("/import")}
              >
                Import API
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="px-8 py-6 text-lg border-white/10 hover:bg-white/5"
              >
                View Docs
              </Button>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
              <div className="flex bg-white/5 border border-white/10 rounded overflow-hidden">
                <div className="px-2 py-1 border-r border-white/10 bg-white/5">TS</div>
                <div className="px-2 py-1 border-r border-white/10">PY</div>
                <div className="px-2 py-1">GO</div>
              </div>
              <span>Compatible with major languages</span>
            </div>
          </div>

          {/* Right Column: Code Preview */}
          <div className="hidden lg:block">
            <div className="glass rounded-xl overflow-hidden border border-white/10 shadow-2xl">
              {/* Window Controls */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-white/20" />
                  <div className="w-3 h-3 rounded-full bg-white/20" />
                  <div className="w-3 h-3 rounded-full bg-white/20" />
                </div>
                <div className="text-xs font-mono text-muted-foreground">server_config.json</div>
              </div>

              {/* Code Content */}
              <div className="p-6 font-mono text-sm relative">
                <div className="flex">
                  <div className="w-10 text-muted-foreground/30 text-right pr-4 select-none">
                    01<br />02<br />03<br />04<br />05<br />06
                  </div>
                  <div className="text-blue-100/90">
                    <span className="text-purple-400">import</span> {"{ Server }"} <span className="text-purple-400">from</span> <span className="text-green-400">"@modelcontextprotocol/sdk"</span>;<br /><br />
                    <span className="text-purple-400">const</span> server = <span className="text-purple-400">new</span> <span className="text-yellow-400">Server</span>({"{"}<br />
                    &nbsp;&nbsp;name: <span className="text-green-400">"stripe-mcp-server"</span>,<br />
                    &nbsp;&nbsp;version: <span className="text-green-400">"1.0.0"</span><br />
                    {"});"}
                  </div>
                </div>

                {/* Progress Overlay */}
                <div className="mt-8 bg-blue-500/10 border border-blue-500/20 rounded p-3 flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                  <span className="text-xs font-mono text-blue-400 uppercase tracking-wider">Generating Schemas...</span>
                </div>

                <div className="mt-6 flex flex-col gap-2 opacity-50">
                  <div className="flex items-center gap-2 text-blue-400/50 text-xs">
                    <FileJson className="w-4 h-4" />
                    <span>src</span>
                  </div>
                  <div className="pl-6 flex items-center gap-2 text-muted-foreground text-xs">
                    <FileJson className="w-3 h-3" />
                    <span>index.ts</span>
                  </div>
                  <div className="pl-6 flex items-center gap-2 text-muted-foreground text-xs">
                    <FileJson className="w-3 h-3" />
                    <span>types.ts</span>
                  </div>
                </div>

              </div>
            </div>
          </div>

        </div>

        {/* Features Grid */}
        <div className="max-w-6xl mx-auto mt-24 grid md:grid-cols-3 gap-6 pb-20">
          <FeatureCard
            icon={<div className="w-4 h-4 rounded-full bg-blue-500 box-shadow-glow" />}
            title="Standard Compliant"
            description="Built strictly following the Model Context Protocol specification. Compatible with Claude Desktop, Zed, and other MCP clients out of the box."
          />
          <FeatureCard
            icon={<Code2 className="w-5 h-5" />}
            title="Zero Boilerplate"
            description="We handle transport, error handling, and type definitions. You get a clean, type-safe, and ready-to-deploy server codebase instantly."
          />
          <FeatureCard
            icon={<Sparkles className="w-5 h-5" />}
            title="AI Optimized Context"
            description="Automatically extracts descriptions and schemas to create rich context prompts, maximizing LLM reasoning capabilities on your data."
          />
        </div>
      </main>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="glass p-8 group hover:bg-white/[0.04] transition-colors relative overflow-hidden">
      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-white/5 to-transparent rounded-bl-full opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="w-10 h-10 bg-white/5 border border-white/10 flex items-center justify-center text-foreground mb-6 rounded">
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-3">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}
