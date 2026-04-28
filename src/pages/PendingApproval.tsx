import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Clock, LogOut, RefreshCw } from "lucide-react";

export default function PendingApproval() {
  const { user, loading, isApproved, signOut } = useAuth();
  const navigate = useNavigate();

  const checkApproval = async (uid: string) => {
    const { data, error } = await supabase.rpc("get_my_profile_approval");
    if (error) {
      console.warn("[Pending] poll failed:", error);
      return false;
    }
    if (data === true) {
      // Force refresh of JWT/session so any cached client state picks up new role/approval
      try { await supabase.auth.refreshSession(); } catch {}
      navigate("/", { replace: true });
      return true;
    }
    return false;
  };

  // Immediate check on mount + poll every 5 seconds
  useEffect(() => {
    if (!user || isApproved) return;
    // Run once immediately so users who were just approved don't wait 5s
    checkApproval(user.id);
    const interval = setInterval(() => {
      checkApproval(user.id);
    }, 5000);
    return () => clearInterval(interval);
  }, [user, isApproved]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (isApproved) return <Navigate to="/" replace />;

  const handleRefresh = async () => {
    await checkApproval(user.id);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-sm w-full text-center space-y-6">
        <div className="mx-auto h-16 w-16 rounded-full bg-muted flex items-center justify-center">
          <Clock className="h-8 w-8 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground mb-2">Ожидание подтверждения</h1>
          <p className="text-muted-foreground text-sm">
            Ваша заявка на регистрацию отправлена. Администратор рассмотрит её в ближайшее время.
          </p>
        </div>
        <div className="pt-2 flex items-center justify-center gap-2">
          <Button variant="default" onClick={handleRefresh} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Проверить статус
          </Button>
          <Button variant="outline" onClick={signOut} className="gap-2">
            <LogOut className="h-4 w-4" />
            Выйти
          </Button>
        </div>
      </div>
    </div>
  );
}
