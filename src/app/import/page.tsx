"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
    Upload,
    Link as LinkIcon,
    ArrowRight,
    FileJson,
    Clock,
    ChevronRight
} from "lucide-react";
import { Header } from "@/components/shared/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useProjectStore } from "@/store/project-store";
import { parseOpenAPIFromContent, parseOpenAPIFromURL } from "@/lib/parsers/openapi";
import { useDropzone } from "react-dropzone";

export default function ImportPage() {
    const router = useRouter();
    const { spec, setSpec, setCurrentStep, setLoading, setError, isLoading, error } = useProjectStore();

    const [specUrl, setSpecUrl] = useState("");
    const [isUrlFetching, setIsUrlFetching] = useState(false);

    // Navigate to editor when spec is loaded
    useEffect(() => {
        if (spec) {
            setCurrentStep("editor");
            router.push("/editor");
        }
    }, [spec, setCurrentStep, router]);

    // Handle file drop
    const onDrop = async (acceptedFiles: File[]) => {
        if (acceptedFiles.length === 0) return;

        const file = acceptedFiles[0];
        setLoading(true);
        setError(null);

        try {
            const content = await file.text();
            const parsedSpec = await parseOpenAPIFromContent(content, file.name);
            setSpec(parsedSpec, file.name);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to parse file");
        } finally {
            setLoading(false);
        }
    };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            "application/json": [".json"],
            "application/x-yaml": [".yaml", ".yml"],
        },
        maxFiles: 1,
    });

    // Handle URL fetch
    const handleUrlFetch = async () => {
        if (!specUrl.trim()) return;

        setIsUrlFetching(true);
        setError(null);

        try {
            const parsedSpec = await parseOpenAPIFromURL(specUrl);
            setSpec(parsedSpec, specUrl);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to fetch spec");
        } finally {
            setIsUrlFetching(false);
        }
    };

    // Mock recent projects for UI (can be persisted later)
    const recentProjects = [
        { name: "Stripe Gateway", type: "POSTMAN", time: "2h ago" },
        { name: "Users API v2", type: "SWAGGER", time: "1d ago" },
        { name: "Auth Service", type: "OPENAPI", time: "3d ago" },
    ];

    return (
        <div className="min-h-screen">
            <Header />

            <main className="pt-24 pb-20 px-6">
                <div className="max-w-5xl mx-auto">

                    {/* Page Header */}
                    <div className="mb-8 flex items-start justify-between">
                        <div>
                            <h1 className="text-3xl font-bold mb-2">Import Collection</h1>
                            <p className="text-muted-foreground">
                                Generate an MCP server configuration from your existing OpenAPI or Postman definitions.
                            </p>
                        </div>
                        <button className="flex items-center gap-2 text-sm text-primary hover:underline">
                            <Clock className="w-4 h-4" />
                            View History
                        </button>
                    </div>

                    {/* Main Content Grid */}
                    <div className="grid lg:grid-cols-3 gap-6">

                        {/* Left: Import Options */}
                        <div className="lg:col-span-2 glass p-8 space-y-8">

                            {/* File Dropzone */}
                            <div
                                {...getRootProps()}
                                className={`
                  border-2 border-dashed rounded-lg p-12 text-center cursor-pointer
                  transition-colors
                  ${isDragActive
                                        ? "border-primary bg-primary/5"
                                        : "border-white/10 hover:border-white/20"
                                    }
                `}
                            >
                                <input {...getInputProps()} />
                                <div className="w-16 h-16 mx-auto mb-6 bg-white/5 rounded-lg flex items-center justify-center">
                                    <Upload className="w-8 h-8 text-muted-foreground" />
                                </div>
                                <h3 className="text-lg font-semibold mb-2">
                                    {isDragActive ? "Drop file here" : "Drag definition file here"}
                                </h3>
                                <p className="text-sm text-muted-foreground mb-6">
                                    JSON or YAML (Swagger 2.0+, Postman v2.1)
                                </p>
                                <Button variant="outline" className="border-white/20">
                                    Select File
                                </Button>
                            </div>

                            {/* Divider */}
                            <div className="flex items-center gap-4">
                                <div className="flex-1 border-t border-white/10" />
                                <span className="text-xs text-muted-foreground bg-card px-3 py-1 rounded border border-white/10">OR</span>
                                <div className="flex-1 border-t border-white/10" />
                            </div>

                            {/* URL Import */}
                            <div className="space-y-3">
                                <label className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">
                                    Import via URL
                                </label>
                                <div className="flex gap-3">
                                    <div className="relative flex-1">
                                        <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                        <Input
                                            value={specUrl}
                                            onChange={(e) => setSpecUrl(e.target.value)}
                                            placeholder="https://api.example.com/swagger.json"
                                            className="pl-10 bg-white/5 border-white/10"
                                        />
                                    </div>
                                    <Button
                                        onClick={handleUrlFetch}
                                        disabled={isUrlFetching || !specUrl.trim()}
                                        className="bg-primary hover:bg-primary/90 px-6"
                                    >
                                        {isUrlFetching ? "Fetching..." : (
                                            <>
                                                Import
                                                <ArrowRight className="w-4 h-4 ml-2" />
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>

                            {/* Error Display */}
                            {error && (
                                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-sm">
                                    {error}
                                </div>
                            )}

                            {/* Supported Formats Footer */}
                            <div className="flex items-center justify-between pt-4 border-t border-white/5">
                                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                                    Supported Formats
                                </span>
                                <div className="flex gap-2">
                                    <Badge variant="secondary" className="bg-white/5 text-muted-foreground border-white/10">
                                        JSON
                                    </Badge>
                                    <Badge variant="secondary" className="bg-white/5 text-muted-foreground border-white/10">
                                        YAML
                                    </Badge>
                                </div>
                            </div>
                        </div>

                        {/* Right: Recent Projects */}
                        <div className="glass p-6">
                            <div className="flex items-center gap-2 mb-6">
                                <Clock className="w-4 h-4 text-muted-foreground" />
                                <span className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">
                                    Recent
                                </span>
                            </div>

                            <div className="space-y-2">
                                {recentProjects.map((project, idx) => (
                                    <button
                                        key={idx}
                                        className="w-full p-4 bg-white/5 hover:bg-white/10 rounded border border-white/5 flex items-center justify-between transition-colors group"
                                    >
                                        <div className="text-left">
                                            <p className="font-medium text-sm">{project.name}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {project.type} • {project.time}
                                            </p>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                                    </button>
                                ))}
                            </div>

                            <button className="w-full mt-6 text-xs text-muted-foreground hover:text-foreground text-center py-2 transition-colors">
                                View All Imports
                            </button>
                        </div>

                    </div>
                </div>
            </main>
        </div>
    );
}
