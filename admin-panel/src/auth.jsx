import { createContext, useContext, useEffect, useState } from 'react';
import { api, setToken, getToken } from './api.js';

const AuthContext = createContext(null);

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
      .catch(() => setToken(''))
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const data = await api('/login', { method: 'POST', body: { email, password } });
    setToken(data.token);
    setAdmin(data.admin);
    return data.admin;
  }

  async function logout() {
    try {
      await api('/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    setToken('');
    setAdmin(null);
  }

  return (
    <AuthContext.Provider value={{ admin, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
