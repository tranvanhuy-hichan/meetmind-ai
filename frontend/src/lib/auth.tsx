"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { OrgSummary, User } from "./types";
import { api } from "./api";

const TOKEN_KEY = "meetmind.token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage unavailable: the session lasts until the page is closed */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** Where to send someone who is not signed in; they return to the page they asked for. */
export function loginUrl(email?: string): string {
  const params = new URLSearchParams();
  if (email) params.set("email", email);
  const here = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
  if (here !== "/" && !here.startsWith("/login")) params.set("next", here);
  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}

/** Only same-site paths are followed after sign-in, never another address. */
export function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

interface AuthContextValue {
  user: User | null;
  orgs: OrgSummary[];
  loadingUser: boolean;
  loadingOrgs: boolean;
  refreshUser: () => Promise<void>;
  refreshOrgs: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingOrgs, setLoadingOrgs] = useState(true);

  const refreshUser = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setLoadingUser(false);
      return;
    }
    try {
      const u = await api.me();
      setUser(u);
    } catch {
      setUser(null);
      clearToken();
      if (pathname !== "/login") {
        router.replace(loginUrl());
      }
    } finally {
      setLoadingUser(false);
    }
  }, [router, pathname]);

  const refreshOrgs = useCallback(async () => {
    try {
      const list = await api.listOrgs();
      setOrgs(list);
    } catch {
      // keep current or empty
    } finally {
      setLoadingOrgs(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    if (user) {
      refreshOrgs();
    }
  }, [user, refreshOrgs]);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    setOrgs([]);
    router.replace("/login");
  }, [router]);

  const value = useMemo(
    () => ({
      user,
      orgs,
      loadingUser,
      loadingOrgs,
      refreshUser,
      refreshOrgs,
      logout,
    }),
    [user, orgs, loadingUser, loadingOrgs, refreshUser, refreshOrgs, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

/** Loads the signed-in user, or sends the browser to /login. */
export function useRequireUser(): {
  user: User | null;
  logout: () => void;
  orgs: OrgSummary[];
  loadingUser: boolean;
  refreshOrgs: () => Promise<void>;
} {
  const router = useRouter();
  const ctx = useContext(AuthContext);

  // If inside AuthProvider, return context state
  if (ctx) {
    useEffect(() => {
      if (!ctx.loadingUser && !ctx.user && typeof window !== "undefined") {
        const token = getToken();
        if (!token) {
          router.replace(loginUrl());
        }
      }
    }, [ctx.loadingUser, ctx.user, router]);

    return {
      user: ctx.user,
      logout: ctx.logout,
      orgs: ctx.orgs,
      loadingUser: ctx.loadingUser,
      refreshOrgs: ctx.refreshOrgs,
    };
  }

  // Fallback if not inside AuthProvider
  const [fallbackUser, setFallbackUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace(loginUrl());
      return;
    }
    api
      .me()
      .then((u) => {
        setFallbackUser(u);
        setLoading(false);
      })
      .catch(() => {
        router.replace(loginUrl());
      });
  }, [router]);

  const logout = () => {
    clearToken();
    router.replace("/login");
  };

  return {
    user: fallbackUser,
    logout,
    orgs: [],
    loadingUser: loading,
    refreshOrgs: async () => {},
  };
}

