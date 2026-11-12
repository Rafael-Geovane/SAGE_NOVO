import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { authStorage, supabase } from "../../lib/supabase";
export type Profile = {
  id: string;
  display_name: string;
  role: "admin" | "caregiver";
  last_seen_at: string | null;
};
type AuthState = {
  status: "loading" | "anonymous" | "authenticated" | "error";
  session: Session | null;
  profile: Profile | null;
  recovery: boolean;
};
const initial: AuthState = {
  status: supabase ? "loading" : "anonymous",
  session: null,
  profile: null,
  recovery: false,
};
const Context = createContext<
  AuthState & { signOut: () => Promise<void>; retry: () => void }
>(null!);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(initial),
    [attempt, setAttempt] = useState(0);
  const cache = useQueryClient(),
    generation = useRef(0),
    identity = useRef<string | null>(null),
    profileRole = useRef<Profile["role"] | null>(null),
    recoveryMode = useRef(false);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const client = supabase;
    const apply = async (session: Session | null, recovery = false) => {
      if (!active) return;
      if (authStorage?.isSignedOut()) session = null;
      const ticket = ++generation.current;
      const id = session?.user.id ?? null;
      if (identity.current !== id) {
        cache.clear();
        identity.current = id;
        profileRole.current = null;
      }
      if (
        !session ||
        !session.expires_at ||
        session.expires_at * 1000 <= Date.now()
      ) {
        if (active) {
          identity.current = null;
          profileRole.current = null;
          recoveryMode.current = false;
          cache.clear();
          setState({
            status: "anonymous",
            session: null,
            profile: null,
            recovery: false,
          });
        }
        return;
      }
      recoveryMode.current = recovery;
      setState((previous) =>
        previous.status === "authenticated" &&
        previous.profile?.id === id &&
        previous.session?.user.id === id &&
        (previous.session.expires_at ?? 0) * 1000 > Date.now()
          ? { ...previous, session, recovery }
          : { status: "loading", session, profile: null, recovery },
      );
      try {
        const { data, error } = await client
          .from("profiles")
          .select("id,display_name,role,last_seen_at")
          .eq("id", id!)
          .single();
        if (!active || ticket !== generation.current) return;
        if (error || !data) throw error;
        if (profileRole.current && profileRole.current !== data.role)
          cache.clear();
        profileRole.current = data.role;
        setState({
          status: "authenticated",
          session,
          profile: data as Profile,
          recovery,
        });
        void client.rpc("touch_activity");
      } catch {
        if (active && ticket === generation.current) {
          cache.clear();
          setState({ status: "error", session, profile: null, recovery });
        }
      }
    };
    const initialTicket = generation.current;
    void client.auth.getSession().then(({ data, error }) => {
      if (!active || initialTicket !== generation.current) return;
      if (error) {
        cache.clear();
        setState({ ...initial, status: "error" });
      } else void apply(data.session);
    });
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      // Invalidate profile reads immediately, before the deferred revalidation.
      const ticket = ++generation.current;
      if (authStorage?.isSignedOut()) session = null;
      const recovery =
        event === "PASSWORD_RECOVERY" ||
        (!!session &&
          identity.current === session.user.id &&
          recoveryMode.current);
      setTimeout(() => {
        if (!active || ticket !== generation.current) return;
        // Broadcast events may belong to an older session in another tab.
        void client.auth.getSession().then(({ data }) => {
          if (active && ticket === generation.current)
            void apply(data.session, recovery);
        });
      }, 0);
    });
    const onStorage = () => {
      if (authStorage?.isSignedOut()) void apply(null);
    };
    window.addEventListener("storage", onStorage);
    return () => {
      active = false;
      generation.current++;
      subscription.unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, [attempt, cache]);
  useEffect(() => {
    if (!state.session) return;
    let timer: ReturnType<typeof setTimeout>;
    const expire = () => {
      const remaining = (state.session?.expires_at ?? 0) * 1000 - Date.now();
      if (remaining > 0) {
        timer = setTimeout(expire, Math.min(remaining, 2_147_483_647));
        return;
      }
      generation.current++;
      identity.current = null;
      profileRole.current = null;
      recoveryMode.current = false;
      cache.clear();
      setState({ ...initial, status: "anonymous" });
    };
    expire();
    return () => clearTimeout(timer);
  }, [state.session, cache]);
  return (
    <Context.Provider
      value={{
        ...state,
        retry: () => setAttempt((x) => x + 1),
        signOut: async () => {
          const cleanup =
            supabase && authStorage
              ? authStorage.signOut(supabase.auth)
              : Promise.resolve();
          generation.current++;
          cache.clear();
          identity.current = null;
          profileRole.current = null;
          recoveryMode.current = false;
          setState({ ...initial, status: "anonymous" });
          await cleanup;
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useAuth = () => useContext(Context);
