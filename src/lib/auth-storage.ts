type StorageBackend = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type AuthCleanup = {
  stopAutoRefresh: () => Promise<void>;
  signOut: (options?: { scope: "local" }) => Promise<unknown>;
};
type AuthRefresh = AuthCleanup & { startAutoRefresh: () => Promise<void> };

const pending = new WeakMap<StorageBackend, Map<string, Promise<unknown>>>();

export function isExplicitAuthCallback(href: string) {
  const url = new URL(href);
  if (url.pathname !== "/auth") return false;
  const parameters = new URLSearchParams(url.search);
  new URLSearchParams(url.hash.slice(1)).forEach((value, name) =>
    parameters.set(name, value),
  );
  return !!(
    parameters.get("code")?.trim() ||
    (parameters.get("access_token")?.trim() &&
      parameters.get("refresh_token")?.trim())
  );
}

export function createAuthStorage(key: string, backend: StorageBackend) {
  const marker = `${key}-signed-out`,
    epochKey = `${key}-epoch`;
  let epoch = backend.getItem(epochKey);
  let operations = pending.get(backend);
  if (!operations) pending.set(backend, (operations = new Map()));
  const queue = operations;
  const owned = new Set([key, `${key}-user`, `${key}-code-verifier`]);
  const isSignedOut = () =>
    backend.getItem(marker) !== null || backend.getItem(epochKey) !== epoch;
  const clear = () => owned.forEach((name) => backend.removeItem(name));
  const beginSignIn = () => {
    epoch = crypto.randomUUID();
    backend.setItem(epochKey, epoch);
    backend.removeItem(marker);
  };
  const block = () => {
    epoch = crypto.randomUUID();
    backend.setItem(epochKey, epoch);
    backend.setItem(marker, "true");
    clear();
  };
  const storage: StorageBackend = {
    getItem: (name) =>
      owned.has(name) && isSignedOut() ? null : backend.getItem(name),
    setItem: (name, value) => {
      if (!owned.has(name) || !isSignedOut()) backend.setItem(name, value);
    },
    removeItem: (name) => {
      if (backend.getItem(epochKey) === epoch) backend.removeItem(name);
    },
  };
  return {
    storage,
    isSignedOut,
    acceptRedirect: beginSignIn,
    signOut(auth: AuthCleanup) {
      // Persist the fence before yielding to SDK/network work, including other tabs.
      block();
      const logoutEpoch = epoch;
      const previous = queue.get(key);
      const operation = (async () => {
        await previous?.catch(() => {});
        try {
          await auth.stopAutoRefresh();
        } catch {
          /* Local logout still wins. */
        }
        try {
          await auth.signOut({ scope: "local" });
        } catch {
          /* Offline cleanup is best effort. */
        }
        if (backend.getItem(epochKey) === logoutEpoch && isSignedOut()) clear();
      })();
      queue.set(key, operation);
      return operation;
    },
    signIn<T>(auth: AuthRefresh, enter: () => Promise<T>) {
      const previous = queue.get(key);
      const requestedEpoch = backend.getItem(epochKey);
      const operation = (async () => {
        await previous?.catch(() => {});
        await auth.stopAutoRefresh();
        if (backend.getItem(epochKey) !== requestedEpoch)
          throw new Error(
            "Entrada cancelada por uma nova alteracao de sessao.",
          );
        beginSignIn();
        try {
          const result = await enter();
          if (!isSignedOut()) await auth.startAutoRefresh();
          return result;
        } catch (error) {
          if (!isSignedOut()) block();
          throw error;
        }
      })();
      queue.set(key, operation);
      return operation;
    },
  };
}
