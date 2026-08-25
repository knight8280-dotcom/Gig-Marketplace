import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearTokens, getTokens, setTokens } from '../api/client';
import type { Me, TokenPair } from '../api/types';

interface AuthState {
  loading: boolean;
  user: Me | null;
  /** Active app mode for dual-role accounts. */
  mode: 'CUSTOMER' | 'WORKER' | null;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, role: 'CUSTOMER' | 'WORKER'): Promise<void>;
  signOut(): Promise<void>;
  refreshMe(): Promise<void>;
  setMode(mode: 'CUSTOMER' | 'WORKER'): void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<Me | null>(null);
  const [mode, setMode] = useState<'CUSTOMER' | 'WORKER' | null>(null);

  const loadMe = useCallback(async (): Promise<Me | null> => {
    try {
      const me = await api<Me>('/me');
      setUser(me);
      setMode((current) => {
        if (current && me.roles.includes(current)) return current;
        return me.roles.includes('WORKER') ? 'WORKER' : 'CUSTOMER';
      });
      return me;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { refresh } = await getTokens();
      if (refresh) await loadMe();
      setLoading(false);
    })();
  }, [loadMe]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const res = await api<{ tokens: TokenPair }>('/auth/login', {
        method: 'POST',
        body: { email, password },
        auth: false,
      });
      await setTokens(res.tokens.access_token, res.tokens.refresh_token);
      await loadMe();
    },
    [loadMe],
  );

  const signUp = useCallback(
    async (email: string, password: string, role: 'CUSTOMER' | 'WORKER') => {
      const res = await api<{ tokens: TokenPair }>('/auth/register', {
        method: 'POST',
        body: { email, password, role },
        auth: false,
      });
      await setTokens(res.tokens.access_token, res.tokens.refresh_token);
      await loadMe();
      setMode(role);
    },
    [loadMe],
  );

  const signOut = useCallback(async () => {
    const { refresh } = await getTokens();
    if (refresh) {
      await api('/auth/logout', { method: 'POST', body: { refresh_token: refresh }, auth: false }).catch(
        () => undefined,
      );
    }
    await clearTokens();
    setUser(null);
    setMode(null);
  }, []);

  const value = useMemo(
    () => ({ loading, user, mode, signIn, signUp, signOut, refreshMe: async () => void (await loadMe()), setMode }),
    [loading, user, mode, signIn, signUp, signOut, loadMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
