import { useState, useEffect, useRef, createContext, useContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  readAuthMeta,
  writeAuthMeta,
  clearAuthMeta,
  acquireFetchLock,
  releaseFetchLock,
  subscribeAuthMeta,
} from "@/lib/authCache";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isApproved: boolean;
  /** True only after we have a confirmed approval status from DB or fresh cache.
   *  While false, callers MUST NOT redirect to /pending — the value of `isApproved`
   *  is the safe default (false) and may be stale. */
  approvalKnown: boolean;
  isAdmin: boolean;
  isRealAdmin: boolean;
  isConsultant: boolean;
  /** Реальная роль consultant из БД (без учёта симуляции). */
  isRealConsultant: boolean;
  /** Активная симулированная роль (только для admin, чисто визуально). */
  simulatedRole: "consultant" | "employee" | null;
  setSimulatedRole: (role: "consultant" | "employee" | null) => void;
  adminModeDisabled: boolean;
  setAdminModeDisabled: (disabled: boolean) => void;
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
  const [approvalKnown, setApprovalKnown] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isConsultant, setIsConsultant] = useState(false);
  const [adminModeDisabled, setAdminModeDisabledState] = useState<boolean>(() => {
    try { return localStorage.getItem("admin_mode_disabled") === "1"; } catch { return false; }
  });
  const [simulatedRole, setSimulatedRoleState] = useState<"consultant" | "employee" | null>(() => {
    try {
      const v = localStorage.getItem("simulated_role");
      return v === "consultant" || v === "employee" ? v : null;
    } catch { return null; }
  });
  const fetchIdRef = useRef(0); // Track latest fetch to avoid stale updates
  const currentUserIdRef = useRef<string | null>(null);
  const qc = useQueryClient();

  // Cross-tab broadcast: when another tab finishes loading auth meta for the
  // current user, apply its snapshot here too — avoids redundant network calls.
  useEffect(() => {
    if (!user?.id) return;
    const off = subscribeAuthMeta(user.id, (snap) => {
      setIsApproved(snap.isApproved);
      setApprovalKnown(true);
      setIsAdmin(snap.isAdmin);
      setIsConsultant(snap.isConsultant);
      setAdminModeDisabledState(snap.adminModeDisabled);
      setLoading(false);
    });
    return off;
  }, [user?.id]);

  // Sync across tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "admin_mode_disabled") {
        setAdminModeDisabledState(e.newValue === "1");
      }
      if (e.key === "simulated_role") {
        const v = e.newValue;
        setSimulatedRoleState(v === "consultant" || v === "employee" ? v : null);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const fetchProfile = async (userId: string, fetchId: number, isMounted: () => boolean, attempt = 0) => {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2500;
    const HARD_TIMEOUT_MS = 8000;

    // 1. Hot path: a sibling tab (or this tab on a previous mount) already
    //    fetched auth meta within the TTL — apply it instantly so the UI
    //    doesn't have to wait on the network at all.
    const cached = readAuthMeta(userId);
    if (cached && fetchIdRef.current === fetchId && isMounted()) {
      setIsApproved(cached.isApproved);
      setApprovalKnown(true);
      setIsAdmin(cached.isAdmin);
      setIsConsultant(cached.isConsultant);
      setAdminModeDisabledState(cached.adminModeDisabled);
      setLoading(false);
      // Cache is fresh enough — skip the network round-trip entirely.
      return;
    }

    // 2. Dedup: if another tab is already fetching, wait briefly for its
    //    broadcast instead of duplicating the request. The subscription in
    //    the effect above will fire setLoading(false) when the snapshot
    //    arrives. If nothing comes within the grace period, fall through and
    //    fetch ourselves (the lock will have expired by then).
    let ownsLock = acquireFetchLock(userId);
    if (!ownsLock) {
      // Wait up to LOCK_TTL_MS for the sibling tab's broadcast.
      await new Promise((r) => setTimeout(r, 1500));
      const fresh = readAuthMeta(userId);
      if (fresh && fetchIdRef.current === fetchId && isMounted()) {
        setIsApproved(fresh.isApproved);
        setApprovalKnown(true);
        setIsAdmin(fresh.isAdmin);
        setIsConsultant(fresh.isConsultant);
        setAdminModeDisabledState(fresh.adminModeDisabled);
        setLoading(false);
        return;
      }
      // No broadcast — try to become the owner; if the old lock is still
      // present, fetch anyway but don't release another tab's lock in finally.
      ownsLock = acquireFetchLock(userId);
    }

    // Hard cap: if anything in Promise.all hangs (network glitch, RLS deadlock,
    // RPC stuck), we MUST clear the loading state so the UI is not stuck on a
    // spinner forever. The user can still use the app even if some role flags
    // are temporarily wrong; they'll be corrected on the next successful fetch.
    const safetyTimer = setTimeout(() => {
      if (fetchIdRef.current === fetchId && isMounted()) {
        console.warn("[Auth] fetchProfile hard timeout — clearing loading state");
        setLoading(false);
      }
    }, HARD_TIMEOUT_MS);

    try {
      // Approval is the routing-critical bit. Load it first so a slow role/admin
      // request cannot leave an approved user with stale `isApproved=false` and
      // bounce them back to /pending.
      const profileRes = await supabase
        .from("profiles")
        .select("is_approved")
        .eq("id", userId)
        .maybeSingle();

      if (fetchIdRef.current !== fetchId || !isMounted()) return;

      let approvedNext = isApproved;
      if (profileRes.error) {
        console.warn("[Auth] profiles fetch failed, keeping previous isApproved:", profileRes.error);
        // Do NOT mark approval as known on failure — otherwise a transient
        // statement timeout would bounce an already-approved user to /pending.
      } else {
        approvedNext = (profileRes.data as any)?.is_approved ?? false;
        setIsApproved(approvedNext);
        setApprovalKnown(true);
      }

      const [roleRes, consultantRes, adminExistsRes, modeRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "consultant" as any).maybeSingle(),
        supabase.rpc("admin_exists"),
        supabase.from("admin_mode_state" as any).select("admin_disabled").eq("user_id", userId).maybeSingle(),
      ]);

      clearTimeout(safetyTimer);
      if (fetchIdRef.current !== fetchId || !isMounted()) return;

      const noAdminsExist = adminExistsRes.data === false;
      if (noAdminsExist) {
        await supabase.from("user_roles").insert({ user_id: userId, role: "admin" } as any);
        if (fetchIdRef.current !== fetchId || !isMounted()) return;
        setIsAdmin(true);
        await supabase.from("profiles").update({ is_approved: true } as any).eq("id", userId);
        if (fetchIdRef.current !== fetchId || !isMounted()) return;
        setIsApproved(true);
        setApprovalKnown(true);
        setLoading(false);
        writeAuthMeta(userId, {
          isApproved: true,
          isAdmin: true,
          isConsultant: false,
          adminModeDisabled: false,
        });
        return;
      }

      const adminNext = !!roleRes.data;
      const consultantNext = !!consultantRes.data;
      setIsAdmin(adminNext);
      setIsConsultant(consultantNext);

      // Sync admin_mode_disabled from server (source of truth)
      const serverDisabled = !!(modeRes.data as any)?.admin_disabled;
      setAdminModeDisabledState(serverDisabled);
      try {
        if (serverDisabled) localStorage.setItem("admin_mode_disabled", "1");
        else localStorage.removeItem("admin_mode_disabled");
      } catch {}

      setLoading(false);

      // Persist + broadcast so sibling tabs don't re-fetch.
      writeAuthMeta(userId, {
        isApproved: approvedNext,
        isAdmin: adminNext,
        isConsultant: consultantNext,
        adminModeDisabled: serverDisabled,
      });
    } catch (err) {
      clearTimeout(safetyTimer);
      console.error(`[Auth] fetchProfile failed (attempt ${attempt + 1}/${MAX_RETRIES}):`, err);
      if (fetchIdRef.current !== fetchId || !isMounted()) return;

      if (attempt < MAX_RETRIES - 1) {
        setTimeout(() => {
          if (fetchIdRef.current === fetchId && isMounted()) {
            fetchProfile(userId, fetchId, isMounted, attempt + 1);
          }
        }, RETRY_DELAY);
      } else {
        console.error("[Auth] All retries exhausted, clearing loading state");
        setLoading(false);
      }
    } finally {
      clearTimeout(safetyTimer);
      if (ownsLock) releaseFetchLock(userId);
    }
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
        setIsConsultant(false);
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
    try { clearAuthMeta(); } catch {}
    await supabase.auth.signOut();
  };

  const setAdminModeDisabled = (disabled: boolean) => {
    try {
      if (disabled) localStorage.setItem("admin_mode_disabled", "1");
      else localStorage.removeItem("admin_mode_disabled");
    } catch {}
    setAdminModeDisabledState(disabled);

    // Persist to server so RLS sees the change
    if (user?.id) {
      // Update cross-tab cache so other tabs pick up the change without a refetch.
      writeAuthMeta(user.id, {
        isApproved,
        isAdmin,
        isConsultant,
        adminModeDisabled: disabled,
      });
      supabase
        .from("admin_mode_state" as any)
        .upsert({ user_id: user.id, admin_disabled: disabled, updated_at: new Date().toISOString() } as any, { onConflict: "user_id" })
        .then(({ error }) => {
          if (error) console.error("[Auth] Failed to persist admin mode:", error);
          // Invalidate all cached queries so data is refetched under new RLS context
          qc.invalidateQueries();
        });
    }
  };

  const effectiveIsAdmin = isAdmin && !adminModeDisabled;

  // Симуляция роли — только клиентская (визуальная) и доступна только реальным админам.
  // RLS на сервере остаётся как есть; цель — проверять, как UI выглядит для consultant.
  const canSimulate = isAdmin;
  const activeSimulation = canSimulate ? simulatedRole : null;
  const effectiveIsConsultant = activeSimulation
    ? activeSimulation === "consultant"
    : isConsultant;

  const setSimulatedRole = (role: "consultant" | "employee" | null) => {
    try {
      if (role) localStorage.setItem("simulated_role", role);
      else localStorage.removeItem("simulated_role");
    } catch {}
    setSimulatedRoleState(role);
    // Перерисовать виды, зависящие от RLS-кэша (визуально), и обновить guard'ы.
    qc.invalidateQueries();
  };

  return (
    <AuthContext.Provider value={{
      user, session, loading, isApproved, approvalKnown,
      isAdmin: effectiveIsAdmin,
      isRealAdmin: isAdmin,
      isConsultant: effectiveIsConsultant,
      isRealConsultant: isConsultant,
      simulatedRole: activeSimulation,
      setSimulatedRole,
      adminModeDisabled,
      setAdminModeDisabled,
      signUp, signIn, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
