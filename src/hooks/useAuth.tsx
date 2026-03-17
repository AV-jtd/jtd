import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isApproved: boolean;
  isAdmin: boolean;
  signUp: (email: string, password: string, displayName: string, telegramUsername?: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isApproved, setIsApproved] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const fetchProfile = async (userId: string) => {
    const [profileRes, roleRes, adminCountRes] = await Promise.all([
      supabase.from("profiles").select("is_approved").eq("id", userId).single(),
      supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle(),
      supabase.from("user_roles").select("id", { count: "exact", head: true }),
    ]);
    
    // If no admins exist, first user becomes admin
    const noAdminsExist = (adminCountRes.count ?? 0) === 0;
    if (noAdminsExist) {
      await supabase.from("user_roles").insert({ user_id: userId, role: "admin" } as any);
      setIsAdmin(true);
      // Auto-approve the first admin
      await supabase.from("profiles").update({ is_approved: true } as any).eq("id", userId);
      setIsApproved(true);
      return;
    }
    
    setIsApproved((profileRes.data as any)?.is_approved ?? false);
    setIsAdmin(!!roleRes.data);
  };

  useEffect(() => {
    let isMounted = true;

    // Restore session first, then listen for changes
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => {
          if (isMounted) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        // Set loading while profile is being fetched to prevent premature redirects
        setLoading(true);
        setTimeout(() => {
          fetchProfile(session.user.id).finally(() => {
            if (isMounted) setLoading(false);
          });
        }, 0);
      } else {
        setIsApproved(false);
        setIsAdmin(false);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, displayName: string, telegramUsername?: string) => {
    const cleanUsername = telegramUsername?.replace(/^@/, "").toLowerCase().trim() || undefined;
    const { data: signUpData, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName, telegram_username: cleanUsername },
        emailRedirectTo: window.location.origin,
      },
    });
    
    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, isApproved, isAdmin, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
