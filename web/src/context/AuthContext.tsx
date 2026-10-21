import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { User, WhitelistStatus } from '../types';
import { api } from '../services/api';
import { signInWithGoogle, isFirebaseConfigured, signOutFirebase } from '../services/firebase';
import { probeBackendWithWakeup } from '../services/health';

interface AuthContextType {
  user: User | null;
  whitelist: WhitelistStatus | null;
  isLoading: boolean;
  isWakingServer: boolean;
  serverStatusMessage: string | null;
  error: string | null;
  isFirebaseReady: boolean;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  loginWithDev: (email: string, displayName?: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => void;
  refreshSession: () => Promise<void>;
  retrySession: () => Promise<void>;
  cancelWakeUp: () => void;
  clearError: () => void;
  updateUser: (updatedUser: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [whitelist, setWhitelist] = useState<WhitelistStatus | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isWakingServer, setIsWakingServer] = useState<boolean>(false);
  const [serverStatusMessage, setServerStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wakeupControllerRef = useRef<AbortController | null>(null);

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('xxq_theme') : null;
    return saved === 'light' ? 'light' : 'dark';
  });

  // Apply theme to document element
  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (theme === 'light') {
        document.documentElement.classList.add('light');
        document.documentElement.classList.remove('dark');
      } else {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      }
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('xxq_theme', theme);
    }
  }, [theme]);

  const cancelWakeUp = useCallback(() => {
    if (wakeupControllerRef.current) {
      wakeupControllerRef.current.abort();
      wakeupControllerRef.current = null;
    }
    setIsWakingServer(false);
    setServerStatusMessage(null);
  }, []);

  const refreshSession = useCallback(async () => {
    const token = api.getToken();
    if (!token) {
      setUser(null);
      setWhitelist(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const data = await api.getSession();
      setUser(data.user);
      setWhitelist(data.whitelist);

      if (data.user.themePreference) {
        setTheme(data.user.themePreference);
      }
    } catch (err: any) {
      console.warn('Session refresh failed:', err.message);
      if (err.status === 401) {
        api.setToken(null);
        setUser(null);
        setWhitelist(null);
      } else if (err.status === 403 && err.body?.whitelistActive) {
        setWhitelist({
          modeActive: true,
          isApproved: false,
          canAccessApp: false,
        });
      } else {
        setError(err.message || 'Kimlik doğrulanamadı.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  /**
   * Bounded manual retry with cold-start server wakeup handling.
   */
  const retrySession = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    setIsWakingServer(true);

    const controller = new AbortController();
    wakeupControllerRef.current = controller;

    try {
      await probeBackendWithWakeup({
        maxAttempts: 6,
        signal: controller.signal,
        onProgress: (p) => {
          setServerStatusMessage(p.message);
        },
      });

      // Server is confirmed online, now refresh or attempt session
      setServerStatusMessage('Sunucu bağlandı. Oturum yenileniyor...');
      await refreshSession();
    } catch (err: any) {
      if (err.code === 'ABORTED') {
        setError('Sunucu bağlantısı iptal edildi.');
      } else {
        setError(err.message || 'Sunucuya bağlanılamadı.');
      }
    } finally {
      setIsWakingServer(false);
      setServerStatusMessage(null);
      setIsLoading(false);
      wakeupControllerRef.current = null;
    }
  }, [refreshSession]);

  const toggleTheme = useCallback(() => {
    const nextTheme: 'dark' | 'light' = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    if (user) {
      api.updateMe({ themePreference: nextTheme }).catch((err) => {
        console.warn('Failed to save theme preference:', err);
      });
      setUser((prev) => (prev ? { ...prev, themePreference: nextTheme } : null));
    }
  }, [theme, user]);

  const loginWithDev = async (email: string, displayName?: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.devLogin(email, displayName);
      setUser(data.user);
      setWhitelist(data.whitelist);
      if (data.user.themePreference) {
        setTheme(data.user.themePreference);
      }
    } catch (err: any) {
      setError(err.message || 'Giriş yapılamadı.');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithGoogle = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const googleUser = await signInWithGoogle();
      const data = await api.loginWithGoogle(googleUser.idToken);
      setUser(data.user);
      setWhitelist(data.whitelist);
      if (data.user.themePreference) {
        setTheme(data.user.themePreference);
      }
    } catch (err: any) {
      setError(err.message || 'Google ile giriş yapılamadı.');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    api.setToken(null);
    signOutFirebase().catch(() => {});
    setUser(null);
    setWhitelist(null);
  };

  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
    if (updatedUser.themePreference) {
      setTheme(updatedUser.themePreference);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        whitelist,
        isLoading,
        isWakingServer,
        serverStatusMessage,
        error,
        isFirebaseReady: isFirebaseConfigured,
        theme,
        toggleTheme,
        loginWithDev,
        loginWithGoogle,
        logout,
        refreshSession,
        retrySession,
        cancelWakeUp,
        clearError: () => setError(null),
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
