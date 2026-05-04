import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { UndoProvider } from "@/hooks/useUndoStack";
import { usePrefetchData } from "@/hooks/usePrefetch";
import { useRealtimeSubscriptions } from "@/hooks/useRealtimeSubscriptions";
import ErrorBoundary from "@/components/ErrorBoundary";
import OnlineStatus from "./components/OnlineStatus";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
const PerfMetricsOverlay = lazy(() => import("@/components/PerfMetricsOverlay"));
import PendingSync from "./components/PendingSync";
import { Loader2 } from "lucide-react";

// Eagerly loaded (critical path)
import Index from "./pages/Index";
import Auth from "./pages/Auth";

// Lazy-loaded modules
const Settings = lazyWithRetry(() => import("./pages/Settings"));
const ResetPassword = lazyWithRetry(() => import("./pages/ResetPassword"));
const PendingApproval = lazyWithRetry(() => import("./pages/PendingApproval"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));
const Pmo = lazyWithRetry(() => import("./pages/Pmo"));
const Crm = lazyWithRetry(() => import("./pages/Crm"));
const Npd = lazyWithRetry(() => import("./pages/Npd"));
const NpdMatrix = lazyWithRetry(() => import("./pages/NpdMatrix"));
const StmMatrix = lazyWithRetry(() => import("./pages/StmMatrix"));
const ProjectPage = lazyWithRetry(() => import("./pages/ProjectPage"));
const WikiDemo = lazyWithRetry(() => import("./pages/WikiDemo"));
const PublicReport = lazyWithRetry(() => import("./pages/PublicReport"));
const Protocols = lazyWithRetry(() => import("./pages/Protocols"));
const ProtocolDetail = lazyWithRetry(() => import("./pages/ProtocolDetail"));
const MyDepartment = lazyWithRetry(() => import("./pages/MyDepartment"));
const ConsultantAreasDemo = lazyWithRetry(() => import("./pages/dev/ConsultantAreasDemo"));
const SwStatus = lazyWithRetry(() => import("./pages/dev/SwStatus"));

/**
 * Redirects consultants away from modules they are not allowed to see.
 * Non-consultants pass through unchanged.
 */
function ConsultantBlocked({ children }: { children: React.ReactNode }) {
  const { isConsultant, loading } = useAuth();
  if (loading) return <LazyFallback />;
  if (isConsultant) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// Sync onlineManager with browser online/offline events
onlineManager.setEventListener((setOnline) => {
  const onOnline = () => setOnline(true);
  const onOffline = () => setOnline(false);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  };
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
      staleTime: 1000 * 60 * 5, // 5 minutes
      networkMode: "online",
      // Gmail-style: при смене параметров запроса (фильтры, id, страницы)
      // мгновенно показываем предыдущие данные, новые подгружаются в фоне.
      // Это убирает «спиннер на пустом месте» по всему приложению.
      placeholderData: (prev: unknown) => prev,
    },
    mutations: {
      networkMode: "online",
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
    },
  },
});

function LazyFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

function AppContent() {
  usePrefetchData();
  useRealtimeSubscriptions();
  return (
    <>
      <Toaster />
      <Sonner />
      {import.meta.env.DEV && (
        <Suspense fallback={null}>
          <PerfMetricsOverlay />
        </Suspense>
      )}
      <BrowserRouter>
        <ErrorBoundary fallbackTitle="Ошибка приложения">
          <Suspense fallback={<LazyFallback />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/pending" element={<PendingApproval />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/pmo" element={<ConsultantBlocked><Pmo /></ConsultantBlocked>} />
              <Route path="/pmo/project/:id" element={<ConsultantBlocked><ProjectPage /></ConsultantBlocked>} />
              <Route path="/crm" element={<ConsultantBlocked><Crm /></ConsultantBlocked>} />
              <Route path="/npd" element={<ConsultantBlocked><Npd /></ConsultantBlocked>} />
              <Route path="/npd/matrix/:id" element={<ConsultantBlocked><NpdMatrix /></ConsultantBlocked>} />
              <Route path="/npd/stm" element={<ConsultantBlocked><StmMatrix /></ConsultantBlocked>} />
              <Route path="/protocols" element={<ConsultantBlocked><Protocols /></ConsultantBlocked>} />
              <Route path="/protocols/:id" element={<ConsultantBlocked><ProtocolDetail /></ConsultantBlocked>} />
              <Route path="/my-department" element={<ConsultantBlocked><MyDepartment /></ConsultantBlocked>} />
              <Route path="/wiki-demo" element={<ConsultantBlocked><WikiDemo /></ConsultantBlocked>} />
              <Route path="/report" element={<PublicReport />} />
              <Route path="/dev/consultant-areas" element={<ConsultantAreasDemo />} />
              <Route path="/dev/sw-status" element={<SwStatus />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
        <OnlineStatus />
        <PendingSync />
      </BrowserRouter>
    </>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <UndoProvider>
          <TooltipProvider>
            <AppContent />
          </TooltipProvider>
        </UndoProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
