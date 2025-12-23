"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowLeft, Search, CheckSquare, Square, X, Pencil } from "lucide-react";
import { Header } from "@/components/shared/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
    const [selectedEndpointId, setSelectedEndpointId] = useState<string | null>(null);

    // Redirect if no spec loaded
    useEffect(() => {
        if (!spec) {
            router.push("/");
        }
    }, [spec, router]);

    if (!spec) return null;

    // Filter endpoints
    const filteredEndpoints = spec.endpoints.filter((endpoint) => {
        const matchesSearch =
            !searchQuery ||
            endpoint.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
            endpoint.summary?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            endpoint.operationId?.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesMethod =
            selectedMethodFilters.length === 0 ||
            selectedMethodFilters.includes(endpoint.method);

        return matchesSearch && matchesMethod;
    });

    const selectedCount = tools.filter((t) => t.enabled).length;
    const allSelected = tools.every((t) => t.enabled);

    const handleContinue = () => {
        setCurrentStep("export");
        router.push("/export");
    };

    const toggleMethodFilter = (method: string) => {
        setSelectedMethodFilters((prev) =>
            prev.includes(method)
                ? prev.filter((m) => m !== method)
                : [...prev, method]
        );
    };

    const selectedEndpoint = selectedEndpointId
        ? spec.endpoints.find((e) => e.id === selectedEndpointId)
        : null;
    const selectedTool = selectedEndpointId
        ? tools.find((t) => t.endpointId === selectedEndpointId)
        : null;

    return (
        <div className="min-h-screen">
            <Header />

            <main className="pt-24 pb-20 px-6">
                <div className="max-w-7xl mx-auto flex gap-6">
                    {/* Main Content */}
                    <div className={`flex-1 transition-all ${selectedEndpointId ? 'max-w-[calc(100%-400px)]' : ''}`}>
                        {/* Header */}
                        <div className="mb-8">
                            <h1 className="text-3xl font-bold mb-2">Select Endpoints</h1>
                            <p className="text-muted-foreground">
                                Choose which API endpoints to expose as MCP tools.
                                Found <span className="text-foreground font-medium">{spec.endpoints.length}</span> endpoints
                                in <span className="text-foreground font-medium">{spec.info.title}</span>.
                            </p>
                        </div>

                        {/* Toolbar */}
                        <div className="glass p-4 mb-6 flex flex-wrap items-center gap-4">
                            {/* Search */}
                            <div className="relative flex-1 min-w-[200px]">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    type="text"
                                    placeholder="Search endpoints..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10 bg-white/5 border-white/10"
                                />
                            </div>

                            {/* Method Filters */}
                            <div className="flex items-center gap-2">
                                {["GET", "POST", "PUT", "PATCH", "DELETE"].map((method) => (
                                    <button
                                        key={method}
                                        onClick={() => toggleMethodFilter(method)}
                                        className={`
                                            px-3 py-1.5 text-xs font-medium border transition-colors
                                            ${selectedMethodFilters.includes(method)
                                                ? getMethodClasses(method as ParsedEndpoint["method"])
                                                : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
                                            }
                                        `}
                                    >
                                        {method}
                                    </button>
                                ))}
                            </div>

                            {/* Select All */}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => toggleAllTools(!allSelected)}
                                className="border-white/10 hover:bg-white/10"
                            >
                                {allSelected ? (
                                    <>
                                        <Square className="w-4 h-4 mr-2" />
                                        Deselect All
                                    </>
                                ) : (
                                    <>
                                        <CheckSquare className="w-4 h-4 mr-2" />
                                        Select All
                                    </>
                                )}
                            </Button>
                        </div>

                        {/* Endpoint List */}
                        <div className="space-y-2 mb-8">
                            {filteredEndpoints.map((endpoint) => {
                                const tool = tools.find((t) => t.endpointId === endpoint.id);
                                if (!tool) return null;

                                return (
                                    <EndpointItem
                                        key={endpoint.id}
                                        endpoint={endpoint}
                                        tool={tool}
                                        isSelected={selectedEndpointId === endpoint.id}
                                        onToggle={() => toggleTool(endpoint.id)}
                                        onSelect={() => setSelectedEndpointId(
                                            selectedEndpointId === endpoint.id ? null : endpoint.id
                                        )}
                                    />
                                );
                            })}

                            {filteredEndpoints.length === 0 && (
                                <div className="glass p-12 text-center">
                                    <p className="text-muted-foreground">No endpoints match your filters.</p>
                                </div>
                            )}
                        </div>

                        {/* Footer Actions */}
                        <div className="flex items-center justify-between glass p-4">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setCurrentStep("import");
                                    router.push("/");
                                }}
                                className="border-white/10 hover:bg-white/10"
                            >
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Back
                            </Button>

                            <div className="flex items-center gap-4">
                                <span className="text-sm text-muted-foreground">
                                    {selectedCount} of {tools.length} endpoints selected
                                </span>
                                <Button
                                    onClick={handleContinue}
                                    disabled={selectedCount === 0}
                                    className="bg-primary hover:bg-primary/90"
                                >
                                    Continue
                                    <ArrowRight className="w-4 h-4 ml-2" />
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Sidebar Panel */}
                    {selectedEndpoint && selectedTool && (
                        <ToolConfigSidebar
                            endpoint={selectedEndpoint}
                            tool={selectedTool}
                            onClose={() => setSelectedEndpointId(null)}
                            onUpdate={(config) => updateToolConfig(selectedTool.endpointId, config)}
                        />
                    )}
                </div>
            </main>
        </div>
    );
}

function EndpointItem({
    endpoint,
    tool,
    isSelected,
    onToggle,
    onSelect,
}: {
    endpoint: ParsedEndpoint;
    tool: ToolConfig;
    isSelected: boolean;
    onToggle: () => void;
    onSelect: () => void;
}) {
    return (
        <div
            className={`
                glass p-4 flex items-start gap-4 cursor-pointer transition-all
                ${isSelected ? "border-primary/50 ring-1 ring-primary/30" : ""}
                ${tool.enabled ? "border-primary/30 bg-primary/5" : "hover:bg-white/[0.02]"}
            `}
            onClick={onSelect}
        >
            <Checkbox
                checked={tool.enabled}
                onCheckedChange={onToggle}
                onClick={(e) => e.stopPropagation()}
                className="mt-1"
            />

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                    <Badge className={getMethodClasses(endpoint.method)}>
                        {endpoint.method}
                    </Badge>
                    <code className="text-sm text-foreground font-mono truncate">
                        {endpoint.path}
                    </code>
                </div>

                {(endpoint.summary || endpoint.description) && (
                    <p className="text-sm text-muted-foreground truncate">
                        {endpoint.summary || endpoint.description}
                    </p>
                )}

                {tool.enabled && (
                    <div className="mt-2 pt-2 border-t border-white/5">
                        <div className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground">Tool name:</span>
                            <code className="px-1.5 py-0.5 bg-white/5 text-primary font-mono">
                                {tool.toolName}
                            </code>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-2">
                {endpoint.parameters.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                        {endpoint.parameters.length} param{endpoint.parameters.length > 1 ? "s" : ""}
                    </div>
                )}
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                        e.stopPropagation();
                        onSelect();
                    }}
                >
                    <Pencil className="w-4 h-4" />
                </Button>
            </div>
        </div>
    );
}

function ToolConfigSidebar({
    endpoint,
    tool,
    onClose,
    onUpdate,
}: {
    endpoint: ParsedEndpoint;
    tool: ToolConfig;
    onClose: () => void;
    onUpdate: (config: Partial<ToolConfig>) => void;
}) {
    return (
        <div className="w-[380px] shrink-0">
            <div className="glass sticky top-24 p-6 space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Pencil className="w-4 h-4 text-primary" />
                        Configure Tool
                    </h2>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={onClose}
                    >
                        <X className="w-4 h-4" />
                    </Button>
                </div>

                {/* Endpoint Info */}
                <div className="p-3 bg-white/5 rounded border border-white/5">
                    <div className="flex items-center gap-2 mb-1">
                        <Badge className={getMethodClasses(endpoint.method)}>
                            {endpoint.method}
                        </Badge>
                        <code className="text-xs font-mono text-muted-foreground truncate">
                            {endpoint.path}
                        </code>
                    </div>
                </div>

                {/* Tool Name */}
                <div className="space-y-2">
                    <Label className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">
                        Tool Name
                    </Label>
                    <Input
                        value={tool.toolName}
                        onChange={(e) => onUpdate({ toolName: e.target.value })}
                        className="bg-white/5 border-white/10 font-mono"
                        placeholder="e.g., getPetById"
                    />
                    <p className="text-xs text-muted-foreground">
                        This is how the tool appears to the LLM.
                    </p>
                </div>

                {/* Tool Description */}
                <div className="space-y-2">
                    <Label className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">
                        Description
                    </Label>
                    <Textarea
                        value={tool.description}
                        onChange={(e) => onUpdate({ description: e.target.value })}
                        className="bg-white/5 border-white/10 min-h-[80px] resize-none"
                        placeholder="Describe what this tool does..."
                    />
                    <p className="text-xs text-muted-foreground">
                        Clear descriptions help the LLM understand when to use this tool.
                    </p>
                </div>

                {/* Parameters */}
                {tool.parameters.length > 0 && (
                    <div className="space-y-3">
                        <Label className="text-xs uppercase text-muted-foreground font-semibold tracking-wider">
                            Parameters ({tool.parameters.length})
                        </Label>
                        <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                            {tool.parameters.map((param, idx) => (
                                <div
                                    key={`${param.originalName}-${idx}`}
                                    className="p-3 bg-white/5 rounded border border-white/5 space-y-2"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Badge
                                                variant="outline"
                                                className={`text-[10px] px-1.5 py-0 ${getLocationClasses(param.location)}`}
                                            >
                                                {param.location}
                                            </Badge>
                                            <code className="text-xs font-mono text-foreground">
                                                {param.originalName}
                                            </code>
                                            <span className="text-xs text-muted-foreground">
                                                {param.type}
                                            </span>
                                        </div>
                                        {param.required && (
                                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-yellow-500/30 text-yellow-500">
                                                required
                                            </Badge>
                                        )}
                                    </div>
                                    <Input
                                        value={param.name}
                                        onChange={(e) => {
                                            const newParams = [...tool.parameters];
                                            newParams[idx] = { ...param, name: e.target.value };
                                            onUpdate({ parameters: newParams });
                                        }}
                                        className="h-8 text-sm bg-white/5 border-white/10 font-mono"
                                        placeholder="Parameter name"
                                    />
                                    <Input
                                        value={param.description}
                                        onChange={(e) => {
                                            const newParams = [...tool.parameters];
                                            newParams[idx] = { ...param, description: e.target.value };
                                            onUpdate({ parameters: newParams });
                                        }}
                                        className="h-8 text-sm bg-white/5 border-white/10"
                                        placeholder="Description for LLM..."
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Enable/Disable */}
                <div className="pt-4 border-t border-white/5">
                    <Button
                        variant={tool.enabled ? "outline" : "default"}
                        className={`w-full ${tool.enabled ? "border-white/10" : ""}`}
                        onClick={() => onUpdate({ enabled: !tool.enabled })}
                    >
                        {tool.enabled ? "Disable Tool" : "Enable Tool"}
                    </Button>
                </div>
            </div>
        </div>
    );
}

function getMethodClasses(method: ParsedEndpoint["method"]): string {
    const classes = {
        GET: "method-get",
        POST: "method-post",
        PUT: "method-put",
        PATCH: "method-patch",
        DELETE: "method-delete",
    };
    return classes[method] || "bg-white/10";
}

function getLocationClasses(location: string): string {
    const classes: Record<string, string> = {
        path: "border-purple-500/30 text-purple-400",
        query: "border-blue-500/30 text-blue-400",
        header: "border-orange-500/30 text-orange-400",
        body: "border-green-500/30 text-green-400",
    };
    return classes[location] || "border-white/20 text-muted-foreground";
}
