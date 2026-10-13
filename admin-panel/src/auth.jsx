import { createContext, useContext, useEffect, useState } from 'react';
import { api, setToken, getToken, setImpersonate } from './api.js';

const AuthContext = createContext(null);

/** Decode (not verify) the JWT payload; the server still verifies every call. */
function readTokenClaims(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
    const claims = JSON.parse(json);
    return claims.exp * 1000 > Date.now() ? claims : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session on load if a token exists.
  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api('/me')
      .then((data) => setAdmin(data.admin))
      .catch((err) => {
        if (err.status === 401) return setToken('');
        // Server/DB trouble (503, network) — not a bad session. Stay logged in
        // from the token's claims so the panel can show what's wrong.
        const claims = readTokenClaims(getToken());
        if (claims) setAdmin({ _id: claims.sub, name: claims.name, role: claims.role, degraded: true });
        else setToken('');
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const data = await api('/login', { method: 'POST', body: { email, password } });
    setToken(data.token);
    setAdmin(data.admin);
    return data.admin;
  }

  /** Create a new tenant account and sign the owner in. */
  async function signup(payload) {
    const data = await api('/signup', { method: 'POST', body: payload });
    setToken(data.token);
    const me = await api('/me').catch(() => null);
    setAdmin(me?.admin || null);
    return data; // { subdomain, funnelUrl, account, ... }
  }

  async function logout() {
    try {
      await api('/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    setToken('');
    setImpersonate('');
    setAdmin(null);
  }

  return (
    <AuthContext.Provider value={{ admin, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
