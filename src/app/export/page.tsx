"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
    ArrowLeft,
    Download,
    Loader2,
    Check,
    Terminal,
    FileJson,
    Box,
    Layers,
    Settings,
    Code2,
    ChevronRight
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
import { Separator } from "@/components/ui/separator";
import { useProjectStore } from "@/store/project-store";

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
    } = useProjectStore();

    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Redirect if no spec loaded
    useEffect(() => {
        if (!spec) {
            router.push("/");
        }
    }, [spec, router]);

    if (!spec) return null;

    const selectedTools = tools.filter((t) => t.enabled);

    const handleGenerate = async () => {
        setIsGenerating(true);
        setError(null);

        try {
            const response = await fetch("/api/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    spec,
                    tools: selectedTools,
                    serverConfig,
                    authConfig,
                    exportConfig,
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || "Failed to generate code");
            }

            // Download the zip file
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${serverConfig.name}.zip`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Generation failed");
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="min-h-screen">
            <Header />

            <main className="pt-24 pb-20 px-6">
                <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* Left Column: Configuration */}
                    <div className="lg:col-span-2 space-y-8">

                        <div className="space-y-2">
                            <h1 className="text-3xl font-bold">Server Configuration</h1>
                            <p className="text-muted-foreground">
                                Configure the technical stack, framework settings, and deployment options.
                            </p>
                        </div>

                        {/* Core Stack Section */}
                        <div>
                            <div className="flex items-center gap-2 mb-4">
                                <Layers className="w-5 h-5 text-primary" />
                                <h2 className="text-lg font-semibold">Core Stack</h2>
                            </div>

                            <div className="grid md:grid-cols-2 gap-4 mb-6">
                                {/* Node.js Card */}
                                <div
                                    className={`
                    glass p-6 cursor-pointer transition-all relative
                    ${exportConfig.language === "node"
                                            ? "border-primary/50 bg-primary/5 ring-1 ring-primary/50"
                                            : "hover:bg-white/[0.02]"
                                        }
                  `}
                                    onClick={() => setExportConfig({
                                        language: "node",
                                        framework: "mcp-ts-sdk",
                                        packageManager: "npm"
                                    })}
                                >
                                    {exportConfig.language === "node" && (
                                        <div className="absolute top-4 right-4 text-primary">
                                            <Check className="w-5 h-5" />
                                        </div>
                                    )}
                                    <div className="w-10 h-10 bg-[#339933]/20 flex items-center justify-center rounded mb-4">
                                        <span className="font-bold text-[#339933]">JS</span>
                                    </div>
                                    <h3 className="font-semibold text-lg mb-1">Node.js</h3>
                                    <p className="text-sm text-muted-foreground">
                                        JavaScript runtime built on Chrome's V8 engine.
                                    </p>
                                </div>

                                {/* Python Card */}
                                <div
                                    className={`
                    glass p-6 cursor-pointer transition-all relative
                    ${exportConfig.language === "python"
                                            ? "border-primary/50 bg-primary/5 ring-1 ring-primary/50"
                                            : "hover:bg-white/[0.02]"
                                        }
                  `}
                                    onClick={() => setExportConfig({
                                        language: "python",
                                        framework: "fastmcp"
                                    })}
                                >
                                    {exportConfig.language === "python" && (
                                        <div className="absolute top-4 right-4 text-primary">
                                            <Check className="w-5 h-5" />
                                        </div>
                                    )}
                                    <div className="w-10 h-10 bg-[#3776AB]/20 flex items-center justify-center rounded mb-4">
                                        <span className="font-bold text-[#3776AB]">PY</span>
                                    </div>
                                    <h3 className="font-semibold text-lg mb-1">Python</h3>
                                    <p className="text-sm text-muted-foreground">
                                        High-level, interpreted programming language.
                                    </p>
                                </div>
                            </div>

                            {/* Sub-options */}
                            <div className="glass p-6 grid md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">Framework</Label>
                                    <Select
                                        value={exportConfig.framework}
                                        onValueChange={(value) =>
                                            setExportConfig({ framework: value as "mcp-ts-sdk" | "fastmcp" })
                                        }
                                    >
                                        <SelectTrigger className="bg-white/5 border-white/10">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {exportConfig.language === "node" ? (
                                                <SelectItem value="mcp-ts-sdk">Express.js (MCP SDK)</SelectItem>
                                            ) : (
                                                <SelectItem value="fastmcp">FastMCP</SelectItem>
                                            )}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {exportConfig.language === "node" && (
                                    <div className="space-y-2">
                                        <Label className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">Package Manager</Label>
                                        <div className="flex bg-white/5 border border-white/10 p-1">
                                            {["npm", "yarn", "pnpm"].map((pm) => (
                                                <button
                                                    key={pm}
                                                    className={`
                            flex-1 py-1.5 text-sm font-medium transition-colors
                            ${exportConfig.packageManager === pm
                                                            ? "bg-primary/20 text-primary"
                                                            : "text-muted-foreground hover:text-foreground"
                                                        }
                          `}
                                                    onClick={() => setExportConfig({ packageManager: pm as "npm" | "yarn" | "pnpm" })}
                                                >
                                                    {pm}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Server Details Section */}
                        <div>
                            <div className="flex items-center gap-2 mb-4">
                                <Settings className="w-5 h-5 text-primary" />
                                <h2 className="text-lg font-semibold">Server Details</h2>
                            </div>

                            <div className="glass p-6 grid md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">Server Name</Label>
                                    <Input
                                        value={serverConfig.name}
                                        onChange={(e) => setServerConfig({ name: e.target.value })}
                                        className="bg-white/5 border-white/10 font-mono"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">Version</Label>
                                    <Input
                                        value={serverConfig.version}
                                        onChange={(e) => setServerConfig({ version: e.target.value })}
                                        className="bg-white/5 border-white/10 font-mono"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">Base Host</Label>
                                    <Input
                                        value={serverConfig.host}
                                        onChange={(e) => setServerConfig({ host: e.target.value })}
                                        className="bg-white/5 border-white/10 font-mono"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">Port</Label>
                                    <Input
                                        value={serverConfig.port}
                                        onChange={(e) => setServerConfig({ port: parseInt(e.target.value) || 3000 })}
                                        className="bg-white/5 border-white/10 font-mono"
                                    />
                                </div>

                                <div className="space-y-2 md:col-span-2">
                                    <Label className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">Transport</Label>
                                    <Select
                                        value={serverConfig.transport}
                                        onValueChange={(value) =>
                                            setServerConfig({ transport: value as "stdio" | "sse" | "http" })
                                        }
                                    >
                                        <SelectTrigger className="bg-white/5 border-white/10">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="stdio">stdio (Local / Claude Desktop)</SelectItem>
                                            <SelectItem value="sse">SSE (Server-Sent Events)</SelectItem>
                                            <SelectItem value="http">HTTP (Streamable HTTP)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>

                        {/* Project Settings */}
                        <div>
                            <div className="flex items-center gap-2 mb-4">
                                <Box className="w-5 h-5 text-primary" />
                                <h2 className="text-lg font-semibold">Project Settings</h2>
                            </div>

                            <div className="glass divide-y divide-white/5">
                                <div className="p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded bg-blue-500/20 flex items-center justify-center text-blue-400">
                                            <FileJson className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="font-medium">Documentation</p>
                                            <p className="text-xs text-muted-foreground">Include README.md with setup instructions</p>
                                        </div>
                                    </div>
                                    <Switch checked={true} />
                                </div>

                                <div className="p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded bg-purple-500/20 flex items-center justify-center text-purple-400">
                                            <Terminal className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="font-medium">TypeScript</p>
                                            <p className="text-xs text-muted-foreground">Generate project with TypeScript configuration</p>
                                        </div>
                                    </div>
                                    <Switch
                                        checked={exportConfig.language === "node"}
                                        disabled={exportConfig.language !== "node"}
                                        onCheckedChange={(c) => { if (!c) setExportConfig({ language: 'node' }) }} // Fake alignment
                                    />
                                </div>

                                <div className="p-4 flex items-center justify-between opacity-50">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded bg-orange-500/20 flex items-center justify-center text-orange-400">
                                            <Box className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="font-medium">Docker Support</p>
                                            <p className="text-xs text-muted-foreground">Generate Dockerfile and docker-compose.yml</p>
                                        </div>
                                    </div>
                                    <Switch disabled />
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* Right Column: Preview */}
                    <div className="lg:col-span-1">
                        <div className="sticky top-24 space-y-6">

                            <div className="glass p-6">
                                <div className="flex items-center gap-2 mb-6 text-primary">
                                    <FileJson className="w-5 h-5" />
                                    <h2 className="font-semibold">Review</h2>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-center py-2 border-b border-white/5">
                                        <span className="text-sm text-muted-foreground">Language</span>
                                        <div className="flex items-center gap-2">
                                            <span className={`w-2 h-2 rounded-full ${exportConfig.language === 'node' ? 'bg-[#339933]' : 'bg-[#3776AB]'}`}></span>
                                            <span className="text-sm font-medium">{exportConfig.language === 'node' ? 'Node.js' : 'Python'}</span>
                                        </div>
                                    </div>

                                    <div className="flex justify-between items-center py-2 border-b border-white/5">
                                        <span className="text-sm text-muted-foreground">Framework</span>
                                        <span className="text-sm font-medium">{exportConfig.framework === 'mcp-ts-sdk' ? 'Express.js' : 'FastMCP'}</span>
                                    </div>

                                    <div className="flex justify-between items-center py-2 border-b border-white/5">
                                        <span className="text-sm text-muted-foreground">Port</span>
                                        <span className="text-sm font-mono bg-white/5 px-2 py-0.5 rounded">{serverConfig.port}</span>
                                    </div>

                                    <div className="flex justify-between items-center py-2 border-b border-white/5">
                                        <span className="text-sm text-muted-foreground">Manager</span>
                                        <span className="text-sm font-medium">{exportConfig.packageManager}</span>
                                    </div>

                                    <div className="py-2">
                                        <span className="text-sm text-muted-foreground block mb-2">Enabled Features</span>
                                        <div className="flex flex-wrap gap-2">
                                            <Badge variant="secondary" className="bg-blue-500/10 text-blue-400 border-blue-500/20">Docs</Badge>
                                            {exportConfig.language === 'node' && (
                                                <Badge variant="secondary" className="bg-purple-500/10 text-purple-400 border-purple-500/20">TypeScript</Badge>
                                            )}
                                            <Badge variant="secondary" className="bg-green-500/10 text-green-400 border-green-500/20">{serverConfig.transport}</Badge>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-8 space-y-3">
                                    <Button
                                        onClick={handleGenerate}
                                        disabled={isGenerating || selectedTools.length === 0}
                                        className="w-full bg-primary hover:bg-primary/90 py-6"
                                    >
                                        {isGenerating ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                Generating...
                                            </>
                                        ) : (
                                            <>
                                                <Download className="w-4 h-4 mr-2" />
                                                Generate Server
                                            </>
                                        )}
                                    </Button>

                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            setCurrentStep("editor");
                                            router.push("/editor");
                                        }}
                                        className="w-full border-white/10 hover:bg-white/10"
                                    >
                                        Back
                                    </Button>
                                </div>
                            </div>

                            <div className="glass p-6 border-l-4 border-l-yellow-500/50">
                                <div className="flex gap-3">
                                    <div className="mt-1">
                                        <Code2 className="w-5 h-5 text-yellow-500" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-sm text-yellow-500 mb-1">Did you know?</h3>
                                        <p className="text-xs text-muted-foreground">
                                            You can customize the generated templates later by editing the
                                            <code className="mx-1 px-1 bg-white/10 rounded">config.ts</code> file in your project root.
                                        </p>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>

                </div>
            </main>
        </div>
    );
}
