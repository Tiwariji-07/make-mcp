"use client";

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends React.Component<
    ErrorBoundaryProps,
    ErrorBoundaryState
> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("Error caught by boundary:", error, errorInfo);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="min-h-[400px] flex items-center justify-center p-8">
                    <div className="glass p-8 max-w-md text-center space-y-4">
                        <div className="w-12 h-12 mx-auto bg-destructive/20 rounded-full flex items-center justify-center">
                            <AlertTriangle className="w-6 h-6 text-destructive" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold mb-2">
                                Something went wrong
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                An unexpected error occurred. Please try again.
                            </p>
                        </div>
                        {this.state.error && (
                            <div className="p-3 bg-muted rounded text-xs text-left font-mono overflow-auto max-h-32">
                                {this.state.error.message}
                            </div>
                        )}
                        <Button onClick={this.handleReset} className="gap-2">
                            <RefreshCw className="w-4 h-4" />
                            Try Again
                        </Button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

// Hook for using error boundary programmatically
export function useErrorHandler() {
    const [error, setError] = React.useState<Error | null>(null);

    React.useEffect(() => {
        if (error) {
            throw error;
        }
    }, [error]);

    return setError;
}
