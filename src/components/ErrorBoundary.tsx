import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleHardReset = async () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch (e) {
      console.warn("[ErrorBoundary] hard reset failed:", e);
    }
    const url = new URL(window.location.origin + "/");
    url.searchParams.set("_r", Date.now().toString());
    window.location.replace(url.toString());
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-4 p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {this.props.fallbackTitle || "Что-то пошло не так"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              {this.state.error?.message || "Произошла непредвиденная ошибка"}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <Button variant="outline" onClick={this.handleRetry} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Попробовать снова
            </Button>
            <Button variant="ghost" size="sm" onClick={this.handleHardReset} className="gap-2 text-muted-foreground">
              Очистить кэш и перезагрузить
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
