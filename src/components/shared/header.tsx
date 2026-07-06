"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useProjectStore } from "@/store/project-store";

const STEPS = [
  { key: "import", label: "IMPORT" },
  { key: "editor", label: "CONFIGURE" },
  { key: "export", label: "EXPORT" },
] as const;

export function Header() {
  const router = useRouter();
  const { spec, currentStep, reset } = useProjectStore();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const stepIndex = STEPS.findIndex((s) => s.key === currentStep);
  const progress = spec ? ((stepIndex + 1) / STEPS.length) * 100 : 0;

  const handleLogoClick = (e: React.MouseEvent) => {
    // No work loaded — navigate home freely.
    if (!spec) {
      reset();
      return;
    }
    // Work in progress — confirm before destroying it.
    e.preventDefault();
    setConfirmOpen(true);
  };

  const handleConfirmReset = () => {
    reset();
    setConfirmOpen(false);
    router.push("/");
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/95">
      <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link
          href="/"
          onClick={handleLogoClick}
          className="flex items-center gap-3 group border-draw"
        >
          <span
            className="text-base font-semibold tracking-tight"
            style={{ fontFamily: "'Clash Display', sans-serif" }}
          >
            MAKE<span className="text-primary">MCP</span>
          </span>
        </Link>

        {/* Confirm start-over dialog */}
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <DialogTitle
                style={{ fontFamily: "'Clash Display', sans-serif" }}
                className="tracking-tight"
              >
                Start over?
              </DialogTitle>
              <DialogDescription>
                This clears your current spec and endpoint selection.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConfirmOpen(false)}
                className="border-border text-xs tracking-wider"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmReset}
                className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold tracking-wider"
              >
                Start over
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Progress Bar — only when spec loaded */}
        {spec && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-6">
              {STEPS.map((step, i) => (
                <span
                  key={step.key}
                  className={`text-[11px] tracking-[0.15em] uppercase transition-colors ${
                    i <= stepIndex
                      ? "text-primary"
                      : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </span>
              ))}
            </div>
            <div className="w-24 h-[2px] bg-border overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Right */}
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button variant="ghost" size="icon" asChild>
            <a
              href="https://github.com/Tiwariji-07/make-mcp"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              <Github className="w-4 h-4" />
            </a>
          </Button>
        </div>
      </div>

      {/* Bottom line */}
      <div className="h-px bg-border" />
    </header>
  );
}
