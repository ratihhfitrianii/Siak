import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiRequest, ApiError, getAccessToken, setTokens } from '../lib/api';

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
  /** null untuk non-mahasiswa; dipakai transkrip mandiri (T1.11b). */
  studentId: number | null;
  /** daftar permission (RBAC UI — sumber menu) */
  menu: string[];
}

interface AuthContextValue {
  user: MeUser | null;
  /** true saat restore sesi dari localStorage masih berjalan */
  booting: boolean;
  login: (identifier: string, password: string) => Promise<MeUser>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Refresh profil /users/me (dipakai setelah edit profil agar header ikut ter-update). */
  refreshMe: () => Promise<void>;
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
      } catch (err) {
        // T5.1 session recovery: hanya buang sesi saat token benar-benar ditolak (401/403).
        // Error jaringan/5xx → pertahankan token; restore berikutnya (mis. sudah online) bisa sukses.
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          setTokens(null, null);
        }
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

  const login = useCallback(async (identifier: string, password: string): Promise<MeUser> => {
    const data = await apiRequest<{
      accessToken: string;
      refreshToken: string;
      user: { mustChangePassword: boolean };
    }>('/auth/login', { method: 'POST', body: { identifier, password }, auth: false });

    setTokens(data.accessToken, data.refreshToken);
    const me = await apiRequest<MeUser>('/users/me');
    const merged = {
      ...me,
      mustChangePassword: me.mustChangePassword || data.user.mustChangePassword,
    };
    setUser(merged);
    return merged;
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

  const refreshMe = useCallback(async () => {
    const me = await apiRequest<MeUser>('/users/me');
    setUser((u) =>
      u ? { ...me, mustChangePassword: u.mustChangePassword || me.mustChangePassword } : me,
    );
  }, []);

  const value = useMemo(
    () => ({ user, booting, login, changePassword, logout, refreshMe }),
    [user, booting, login, changePassword, logout, refreshMe],
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
