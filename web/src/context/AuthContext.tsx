import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, WhitelistStatus } from '../types';
import { api } from '../services/api';
import { signInWithGoogle, isFirebaseConfigured, signOutFirebase } from '../services/firebase';

interface AuthContextType {
  user: User | null;
  whitelist: WhitelistStatus | null;
  isLoading: boolean;
  error: string | null;
  isFirebaseReady: boolean;
  loginWithDev: (email: string, displayName?: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => void;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [whitelist, setWhitelist] = useState<WhitelistStatus | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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
    } catch (err: any) {
      console.warn('Session refresh failed:', err.message);
      if (err.status === 401) {
        api.setToken(null);
        setUser(null);
        setWhitelist(null);
      } else if (err.status === 403 && err.body?.whitelistActive) {
        // Whitelisted mode blocked
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

  const loginWithDev = async (email: string, displayName?: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.devLogin(email, displayName);
      setUser(data.user);
      setWhitelist(data.whitelist);
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
      // Exchange cryptographically verified Google ID token with server
      const data = await api.loginWithGoogle(googleUser.idToken);
      setUser(data.user);
      setWhitelist(data.whitelist);
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

  return (
    <AuthContext.Provider
      value={{
        user,
        whitelist,
        isLoading,
        error,
        isFirebaseReady: isFirebaseConfigured,
        loginWithDev,
        loginWithGoogle,
        logout,
        refreshSession,
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
