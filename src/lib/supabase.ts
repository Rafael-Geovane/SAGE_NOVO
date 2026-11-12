import { createClient } from "@supabase/supabase-js";
import { createAuthStorage, isExplicitAuthCallback } from "./auth-storage";
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
export const configured = !!url && !!key && /^https?:\/\//.test(url);
const storageKey = configured
  ? `sb-${new URL(url!).hostname.split(".")[0]}-auth-token`
  : "";
export const authStorage =
  configured && typeof window !== "undefined"
    ? createAuthStorage(storageKey, window.localStorage)
    : null;
// Open the fence before SDK initialization can consume a recovery/PKCE callback.
if (
  typeof window !== "undefined" &&
  authStorage &&
  isExplicitAuthCallback(window.location.href)
)
  authStorage.acceptRedirect();
export const supabase = configured
  ? createClient(url!, key!, {
      auth: {
        storageKey,
        ...(authStorage ? { storage: authStorage.storage } : {}),
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      global: {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            signal: init?.signal
              ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)])
              : AbortSignal.timeout(15000),
          }),
      },
    })
  : null;
export function db() {
  if (!supabase)
    throw new Error("Configure o Supabase para acessar sua conta.");
  return supabase;
}
