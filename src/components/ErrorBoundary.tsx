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

const CHUNK_RELOAD_KEY = "eb-chunk-reload-attempted";
const CHUNK_RELOAD_COOLDOWN_MS = 10_000;

function canAttemptChunkRecovery() {
  const lastAttempt = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 0);
  return !lastAttempt || Date.now() - lastAttempt > CHUNK_RELOAD_COOLDOWN_MS;
}

async function recoverFromStaleChunk() {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations();
    await Promise.allSettled((regs ?? []).map((reg) => reg.unregister()));
  } catch {
    // Continue with cache cleanup and a cache-busted reload.
  }

  try {
    if ("caches" in window) {
      const names = await window.caches.keys();
      await Promise.allSettled(names.map((name) => window.caches.delete(name)));
    }
  } catch {
    // Reload even if Cache Storage is unavailable.
  }

  const url = new URL(window.location.href);
  url.searchParams.set("_v", Date.now().toString(36));
  window.location.replace(url.toString());
}

function isStaleChunkError(error: unknown): boolean {
  const msg = String((error as any)?.message ?? error ?? "");
  return (
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("Loading chunk") ||
    msg.includes("Loading CSS chunk") ||
    /Cannot read propert(y|ies) of undefined \(reading ['"]default['"]\)/i.test(msg)
  );
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
    // A stale-chunk render error means the served build no longer matches the
    // cached HTML (new deploy / stale SW / proxy). A single hard reload pulls
    // a consistent build. Guard against an infinite reload loop.
    if (isStaleChunkError(error)) {
      try {
        if (canAttemptChunkRecovery()) {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
          void recoverFromStaleChunk();
        }
      } catch {
        void recoverFromStaleChunk();
      }
    }
  }

  handleRetry = () => {
    try { sessionStorage.removeItem(CHUNK_RELOAD_KEY); } catch {
      // Retry should still work if sessionStorage is unavailable.
    }
    if (isStaleChunkError(this.state.error)) {
      void recoverFromStaleChunk();
      return;
    }
    this.setState({ hasError: false, error: null });
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
          <Button variant="outline" onClick={this.handleRetry} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Попробовать снова
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
