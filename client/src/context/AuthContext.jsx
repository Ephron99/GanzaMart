// Who is signed in, everywhere in the app, without prop-drilling (spec §7:
// React Context for global state).
//
// The rule this file exists to enforce: the token is the credential, the `user`
// object is a CACHE of what the API said. Never trust a stale role — every
// permission decision is made by the server on each request, the client only
// decides which menu items to draw.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken, clearToken, setUnauthorizedHandler } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // `initializing` distinguishes "we do not know yet" from "nobody is signed in".
  // Without it the header flashes "Sign in" for a moment on every page reload.
  const [initializing, setInitializing] = useState(true);

  const signOutLocal = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  // The axios interceptor calls this when ANY request comes back 401, so an expired
  // token cannot leave the UI showing a logged-in menu that every click rejects.
  useEffect(() => {
    setUnauthorizedHandler(signOutLocal);
    return () => setUnauthorizedHandler(() => {});
  }, [signOutLocal]);

  // Restore the session on a hard refresh: the token lives in storage, but the
  // identity must come from the server, not from whatever we cached before.
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      try {
        // The guard is INSIDE the try on purpose: a `return` before the try block
        // would skip the finally and leave the app spinning in "initializing".
        if (!getToken()) return;
        const envelope = await api.auth.me();
        if (!cancelled) setUser(envelope.data.user);
      } catch {
        // Expired/revoked: the interceptor already cleared it; make it certain.
        if (!cancelled) signOutLocal();
      } finally {
        if (!cancelled) setInitializing(false);
      }
    }

    restore();
    return () => { cancelled = true; };
  }, [signOutLocal]);

  const login = useCallback(async (credentials) => {
    const envelope = await api.auth.login(credentials);
    setToken(envelope.data.token);
    setUser(envelope.data.user);
    return envelope.data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const envelope = await api.auth.register(payload);
    setToken(envelope.data.token);
    setUser(envelope.data.user);
    return envelope.data.user;
  }, []);

  // The server bumps its token_version so the stolen/old token stops working —
  // dropping it locally is the other half of a real logout.
  const logout = useCallback(async () => {
    try { await api.auth.logout(); } catch { /* the local session ends either way */ }
    signOutLocal();
  }, [signOutLocal]);

  const value = useMemo(() => ({
    user,
    initializing,
    isAuthenticated: Boolean(user),
    // Used only to decide what to RENDER. The API decides what is ALLOWED.
    isAdmin: user?.role === 'admin',
    login,
    register,
    logout,
  }), [user, initializing, login, register, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() must be used inside <AuthProvider>.');
  return ctx;
}
