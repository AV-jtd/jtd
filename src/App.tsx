import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, onlineManager } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { UndoProvider } from "@/hooks/useUndoStack";
import { idbPersister } from "@/lib/queryPersist";
import { usePrefetchData } from "@/hooks/usePrefetch";
import { useRealtimeSubscriptions } from "@/hooks/useRealtimeSubscriptions";
import ErrorBoundary from "@/components/ErrorBoundary";
import OnlineStatus from "./components/OnlineStatus";
const PerfMetricsOverlay = lazy(() => import("@/components/PerfMetricsOverlay"));
import PendingSync from "./components/PendingSync";
import { Loader2 } from "lucide-react";

// Eagerly loaded (critical path)
import Index from "./pages/Index";
import Auth from "./pages/Auth";

// Lazy-loaded modules
const Settings = lazy(() => import("./pages/Settings"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const PendingApproval = lazy(() => import("./pages/PendingApproval"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Pmo = lazy(() => import("./pages/Pmo"));
const Crm = lazy(() => import("./pages/Crm"));
const Npd = lazy(() => import("./pages/Npd"));
const NpdMatrix = lazy(() => import("./pages/NpdMatrix"));
const StmMatrix = lazy(() => import("./pages/StmMatrix"));
const ProjectPage = lazy(() => import("./pages/ProjectPage"));
const WikiDemo = lazy(() => import("./pages/WikiDemo"));
const PublicReport = lazy(() => import("./pages/PublicReport"));
const Protocols = lazy(() => import("./pages/Protocols"));
const ProtocolDetail = lazy(() => import("./pages/ProtocolDetail"));
const MyDepartment = lazy(() => import("./pages/MyDepartment"));

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
      networkMode: "offlineFirst",
    },
    mutations: {
      networkMode: "offlineFirst",
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
              <Route path="/pmo" element={<Pmo />} />
              <Route path="/pmo/project/:id" element={<ProjectPage />} />
              <Route path="/crm" element={<Crm />} />
              <Route path="/npd" element={<Npd />} />
              <Route path="/npd/matrix/:id" element={<NpdMatrix />} />
              <Route path="/npd/stm" element={<StmMatrix />} />
              <Route path="/protocols" element={<Protocols />} />
              <Route path="/protocols/:id" element={<ProtocolDetail />} />
              <Route path="/my-department" element={<MyDepartment />} />
              <Route path="/wiki-demo" element={<WikiDemo />} />
              <Route path="/report" element={<PublicReport />} />
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
  <PersistQueryClientProvider
    client={queryClient}
    persistOptions={{ persister: idbPersister, maxAge: 1000 * 60 * 60 * 24 }}
  >
    <ThemeProvider>
      <AuthProvider>
        <UndoProvider>
          <TooltipProvider>
            <AppContent />
          </TooltipProvider>
        </UndoProvider>
      </AuthProvider>
    </ThemeProvider>
  </PersistQueryClientProvider>
);

export default App;
