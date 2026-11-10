import React from "react";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

interface ErrorBoundaryProps {
  onResetHome?: () => void;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: "",
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || "Unexpected rendering failure",
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("PDF Canvas UI ErrorBoundary caught:", error, info.componentStack);
  }

  private handleReturnHome = () => {
    this.setState({ hasError: false, errorMessage: "" });
    if (this.props.onResetHome) {
      this.props.onResetHome();
    }
  };

  private handleReload = () => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md w-full bg-slate-900 border border-red-900/60 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-xl bg-red-500/15 text-red-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">
                Workspace Recovery Mode
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                An unexpected client-side error occurred. Your local files and SQLite revisions remain completely safe on disk.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-red-300 break-words text-left">
              {this.state.errorMessage}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={this.handleReturnHome}
                className="flex-1 py-2 px-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium flex items-center justify-center gap-1.5 transition"
              >
                <Home className="w-3.5 h-3.5" />
                <span>Dashboard</span>
              </button>
              <button
                onClick={this.handleReload}
                className="flex-1 py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 flex items-center justify-center gap-1.5 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reload UI</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
