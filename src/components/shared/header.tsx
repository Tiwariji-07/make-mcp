"use client";

import Link from "next/link";
import { Zap, Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/store/project-store";

export function Header() {
    const { spec, currentStep, reset } = useProjectStore();

    return (
        <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/5">
            <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                {/* Logo */}
                <Link href="/" onClick={() => reset()} className="flex items-center gap-2 group">
                    <div className="w-8 h-8 bg-primary/20 border border-primary/30 flex items-center justify-center group-hover:bg-primary/30 transition-colors">
                        <Zap className="w-4 h-4 text-primary" />
                    </div>
                    <span className="text-lg font-semibold text-foreground">
                        Make<span className="text-primary">MCP</span>
                    </span>
                </Link>

                {/* Stepper */}
                {spec && (
                    <div className="flex items-center gap-2">
                        <Step
                            number={1}
                            label="Import"
                            active={currentStep === "import"}
                            completed={currentStep !== "import"}
                        />
                        <div className="w-8 h-px bg-white/10" />
                        <Step
                            number={2}
                            label="Configure"
                            active={currentStep === "editor"}
                            completed={currentStep === "export"}
                        />
                        <div className="w-8 h-px bg-white/10" />
                        <Step
                            number={3}
                            label="Export"
                            active={currentStep === "export"}
                            completed={false}
                        />
                    </div>
                )}

                {/* GitHub Link */}
                <Button variant="ghost" size="icon" asChild>
                    <a
                        href="https://github.com/Tiwariji-07/make-mcp"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                    >
                        <Github className="w-5 h-5" />
                    </a>
                </Button>
            </div>
        </header>
    );
}

function Step({
    number,
    label,
    active,
    completed
}: {
    number: number;
    label: string;
    active: boolean;
    completed: boolean
}) {
    return (
        <div className="flex items-center gap-2">
            <div
                className={`
          w-6 h-6 flex items-center justify-center text-xs font-medium
          ${active
                        ? "bg-primary text-primary-foreground"
                        : completed
                            ? "bg-primary/20 text-primary border border-primary/30"
                            : "bg-white/5 text-muted-foreground border border-white/10"
                    }
        `}
            >
                {completed ? "✓" : number}
            </div>
            <span
                className={`text-sm ${active ? "text-foreground" : "text-muted-foreground"
                    }`}
            >
                {label}
            </span>
        </div>
    );
}
