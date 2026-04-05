import { useState, useEffect, useRef, createContext, useContext, ReactNode } from "react";
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
  const fetchIdRef = useRef(0); // Track latest fetch to avoid stale updates
  const currentUserIdRef = useRef<string | null>(null);

  const fetchProfile = async (userId: string, fetchId: number, isMounted: () => boolean) => {
    const [profileRes, roleRes, adminExistsRes] = await Promise.all([
      supabase.from("profiles").select("is_approved").eq("id", userId).single(),
      supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle(),
      supabase.rpc("admin_exists"),
    ]);

    // Only apply results if this is still the latest fetch and component is mounted
    if (fetchIdRef.current !== fetchId || !isMounted()) return;

    // If no admins exist, first user becomes admin
    const noAdminsExist = adminExistsRes.data === false;
    if (noAdminsExist) {
      await supabase.from("user_roles").insert({ user_id: userId, role: "admin" } as any);
      if (fetchIdRef.current !== fetchId || !isMounted()) return;
      setIsAdmin(true);
      await supabase.from("profiles").update({ is_approved: true } as any).eq("id", userId);
      if (fetchIdRef.current !== fetchId || !isMounted()) return;
      setIsApproved(true);
      setLoading(false);
      return;
    }

    setIsApproved((profileRes.data as any)?.is_approved ?? false);
    setIsAdmin(!!roleRes.data);
    setLoading(false);
  };

  useEffect(() => {
    let mounted = true;
    const isMounted = () => mounted;
    let initialSessionHandled = false;

    // Set up onAuthStateChange FIRST — it fires INITIAL_SESSION synchronously
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return;

      setSession(newSession);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
        const previousUserId = currentUserIdRef.current;
        const isInitialSession = event === "INITIAL_SESSION";
        const isUserChanged = previousUserId !== newSession.user.id;
        currentUserIdRef.current = newSession.user.id;

        // Only block the app on first load or real user switch, not on tab refocus/token refresh
        if (isInitialSession || isUserChanged) {
          setLoading(true);
        }

        const id = ++fetchIdRef.current;
        setTimeout(() => {
          fetchProfile(newSession.user.id, id, isMounted);
        }, 0);
      } else {
        currentUserIdRef.current = null;
        setIsApproved(false);
        setIsAdmin(false);
        setLoading(false);
      }

      initialSessionHandled = true;
    });

    // Fallback: if onAuthStateChange didn't fire synchronously (shouldn't happen, but just in case)
    setTimeout(() => {
      if (!initialSessionHandled && mounted) {
        supabase.auth.getSession().then(({ data: { session: s } }) => {
          if (!mounted || initialSessionHandled) return;
          setSession(s);
          setUser(s?.user ?? null);
          if (s?.user) {
            const id = ++fetchIdRef.current;
            fetchProfile(s.user.id, id, isMounted);
          } else {
            setLoading(false);
          }
        });
      }
    }, 100);

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, displayName: string, telegramUsername?: string) => {
    const cleanUsername = telegramUsername?.replace(/^@/, "").toLowerCase().trim() || undefined;
    const { error } = await supabase.auth.signUp({
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
