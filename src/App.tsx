import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, onlineManager } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { idbPersister } from "@/lib/queryPersist";
import { usePrefetchData } from "@/hooks/usePrefetch";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Settings from "./pages/Settings";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import Pmo from "./pages/Pmo";
import Crm from "./pages/Crm";
import Npd from "./pages/Npd";
import NpdMatrix from "./pages/NpdMatrix";
import OnlineStatus from "./components/OnlineStatus";
import PendingSync from "./components/PendingSync";

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

function AppContent() {
  usePrefetchData();
  return (
    <>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/pmo" element={<Pmo />} />
          <Route path="/crm" element={<Crm />} />
          <Route path="/npd" element={<Npd />} />
          <Route path="/npd/matrix/:id" element={<NpdMatrix />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
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
        <TooltipProvider>
          <AppContent />
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </PersistQueryClientProvider>
);

export default App;
