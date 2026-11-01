"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { DocumentInfo } from "@/lib/types";

export interface ViewState {
  page: number;
  y_ratio: number;
  zoom: number;
}

const DEFAULT_VIEW: ViewState = { page: 1, y_ratio: 0, zoom: 1 };

interface Saved {
  open: string[];
  active: string | null;
  views: Record<string, ViewState>;
}

function read(key: string): Saved | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

/**
 * Open document tabs and, for each document, where this reader stopped.
 * Positions live in a ref (they change on every scroll event and must not re-render the room);
 * they are restored whenever a tab's viewer is mounted again, so switching tabs never jumps to the top.
 */
export function useDocTabs(meetingId: string, documents: DocumentInfo[]) {
  const storageKey = `meetmind.tabs.${meetingId}`;
  const [open, setOpen] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const views = useRef<Record<string, ViewState>>({});
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const hydrated = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const latest = useRef({ open, active });
  latest.current = { open, active };

  const persist = useCallback(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        const saved: Saved = { ...latest.current, views: views.current };
        localStorage.setItem(storageKey, JSON.stringify(saved));
      } catch {
        /* storage unavailable: tabs simply are not remembered */
      }
    }, 300);
  }, [storageKey]);

  // restore what this reader had open
  useEffect(() => {
    if (hydrated.current) return;
    const saved = read(storageKey);
    if (saved) {
      views.current = saved.views ?? {};
      setOpen(saved.open ?? []);
      setActive(saved.active ?? null);
    }
    hydrated.current = true;
  }, [storageKey]);

  // forget tabs whose document was deleted
  useEffect(() => {
    if (!hydrated.current) return;
    const ids = new Set(documents.map((d) => d.id));
    setOpen((prev) => (prev.every((id) => ids.has(id)) ? prev : prev.filter((id) => ids.has(id))));
    setActive((prev) => (prev && !ids.has(prev) ? null : prev));
  }, [documents]);

  useEffect(() => {
    if (!active && open.length) setActive(open[open.length - 1]);
  }, [active, open]);

  useEffect(() => {
    if (hydrated.current) persist();
  }, [open, active, persist]);

  const openDoc = useCallback((id: string) => {
    setOpen((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setActive(id);
  }, []);

  const close = useCallback((id: string) => {
    setOpen((prev) => {
      const next = prev.filter((x) => x !== id);
      setActive((cur) => (cur === id ? (next[next.length - 1] ?? null) : cur));
      return next;
    });
  }, []);

  const getView = useCallback((id: string): ViewState => views.current[id] ?? DEFAULT_VIEW, []);

  const setView = useCallback(
    (id: string, view: ViewState, redraw = false) => {
      views.current[id] = view;
      persist();
      if (redraw) rerender();
    },
    [persist],
  );

  return { open, active, openDoc, close, activate: setActive, getView, setView };
}
