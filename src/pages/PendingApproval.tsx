import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Clock, LogOut } from "lucide-react";

export default function PendingApproval() {
  const { user, loading, isApproved, signOut } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (isApproved) return <Navigate to="/" replace />;

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
        <div className="pt-2">
          <Button variant="outline" onClick={signOut} className="gap-2">
            <LogOut className="h-4 w-4" />
            Выйти
          </Button>
        </div>
      </div>
    </div>
  );
}
