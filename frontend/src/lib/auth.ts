"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "./types";

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

/** Loads the signed-in user, or sends the browser to /login. */
export function useRequireUser(): { user: User | null; logout: () => void } {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace(loginUrl());
      return;
    }
    import("./api").then(({ api }) =>
      api
        .me()
        .then(setUser)
        .catch(() => router.replace(loginUrl())),
    );
  }, [router]);

  const logout = () => {
    clearToken();
    router.replace("/login");
  };
  return { user, logout };
}
