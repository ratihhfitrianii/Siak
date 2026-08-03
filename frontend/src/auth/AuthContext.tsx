import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiRequest, getAccessToken, setTokens } from '../lib/api';

/** Shape /users/me (rbac) + mustChangePassword (T1.11a). */
export interface MeUser {
  id: number;
  email: string;
  fullName: string;
  role: string;
  roleName: string;
  isWali: boolean;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  /** daftar permission (RBAC UI — sumber menu) */
  menu: string[];
}

interface AuthContextValue {
  user: MeUser | null;
  /** true saat restore sesi dari localStorage masih berjalan */
  booting: boolean;
  login: (email: string, password: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeUser | null>(null);
  const [booting, setBooting] = useState(true);

  // Restore sesi saat mount: ada token → ambil profil + menu
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      if (!getAccessToken()) {
        if (!cancelled) setBooting(false);
        return;
      }
      try {
        const me = await apiRequest<MeUser>('/users/me');
        if (!cancelled) setUser(me);
      } catch {
        // token tidak valid / expired & refresh gagal → sesi bersih
        setTokens(null, null);
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setBooting(false);
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiRequest<{
      accessToken: string;
      refreshToken: string;
      user: { mustChangePassword: boolean };
    }>('/auth/login', { method: 'POST', body: { email, password }, auth: false });

    setTokens(data.accessToken, data.refreshToken);
    const me = await apiRequest<MeUser>('/users/me');
    setUser({ ...me, mustChangePassword: me.mustChangePassword || data.user.mustChangePassword });
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await apiRequest<{ message: string }>('/auth/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    });
    setUser((u) => (u ? { ...u, mustChangePassword: false } : u));
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiRequest<{ message: string }>('/auth/logout', { method: 'POST' });
    } catch {
      // best-effort; token lokal tetap dibersihkan
    } finally {
      setTokens(null, null);
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, booting, login, changePassword, logout }),
    [user, booting, login, changePassword, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- hook + provider di satu file (pola context umum)
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth harus dipakai di dalam <AuthProvider>');
  }
  return ctx;
}
