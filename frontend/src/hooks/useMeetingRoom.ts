"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, socketUrl } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type {
  DocumentInfo,
  MeetingDetail,
  MeetingStatus,
  Participant,
  Position,
  PresenterRef,
  Segment,
} from "@/lib/types";

type ServerEvent = { type: string } & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function upsert(list: Segment[], seg: Segment): Segment[] {
  const i = list.findIndex((s) => s.id === seg.id);
  if (i === -1) return [...list, seg];
  const copy = list.slice();
  copy[i] = { ...copy[i], ...seg };
  return copy;
}

function translationMap(segments: Segment[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const s of segments) if (s.translation) map[s.id] = s.translation;
  return map;
}

/** Everything the meeting room shows: REST snapshot first, then live updates over the socket. */
export function useMeetingRoom(meetingId: string) {
  const [detail, setDetail] = useState<MeetingDetail | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [status, setStatus] = useState<MeetingStatus>("created");
  const [botNote, setBotNote] = useState("");
  const [connected, setConnected] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [lang, setLangState] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [presenter, setPresenter] = useState<PresenterRef | null>(null);
  const [position, setPosition] = useState<{ position: Position; seq: number } | null>(null);
  const [requests, setRequests] = useState<PresenterRef[]>([]);
  const [hasMinutes, setHasMinutes] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const langRef = useRef<string | null>(null);

  const loadTranscript = useCallback(
    async (target: string | null) => {
      const res = await api.transcript(meetingId, target);
      if (langRef.current !== target) return; // reader switched language meanwhile
      setSegments(res.segments);
      setTranslations(translationMap(res.segments));
    },
    [meetingId],
  );

  // initial snapshot
  useEffect(() => {
    if (!meetingId) return; // not signed in yet
    let cancelled = false;
    (async () => {
      try {
        const d = await api.getMeeting(meetingId);
        if (cancelled) return;
        langRef.current = d.me.display_lang;
        setDetail(d);
        setStatus(d.meeting.status);
        setParticipants(d.participants);
        setDocuments(d.documents);
        setOnline(new Set(d.online.map((o) => o.user_id)));
        setPresenter(d.presenter ? { user_id: d.presenter.user_id, name: d.presenter.name } : null);
        if (d.presenter?.position) setPosition({ position: d.presenter.position, seq: d.presenter.seq });
        setLangState(d.me.display_lang);
        setHasMinutes(d.has_minutes);
        await loadTranscript(d.me.display_lang);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Không mở được phiên họp");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [meetingId, loadTranscript]);

  const loaded = detail !== null;

  // live socket with automatic reconnect
  useEffect(() => {
    const token = getToken();
    if (!loaded || !token) return;
    let closed = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const handle = (e: ServerEvent) => {
      switch (e.type) {
        case "hello":
          setStatus(e.status);
          setPresenter(e.presenter ? { user_id: e.presenter.user_id, name: e.presenter.name } : null);
          if (e.presenter?.position) setPosition({ position: e.presenter.position, seq: e.presenter.seq });
          setOnline(new Set((e.online as { user_id: string }[]).map((o) => o.user_id)));
          break;
        case "presence":
          setOnline(new Set((e.online as { user_id: string }[]).map((o) => o.user_id)));
          break;
        case "status":
          setStatus(e.status);
          if (e.status === "live") setBotNote("");
          break;
        case "bot.waiting":
          setBotNote(e.detail || "Bot đang đứng ở phòng chờ của Meet. Trong cuộc họp, bấm Cho phép (Admit) để bot vào.");
          break;
        case "segment.partial":
        case "segment.final":
          setSegments((prev) => upsert(prev, e.segment));
          break;
        case "segment.translation":
          if (e.lang === langRef.current) setTranslations((prev) => ({ ...prev, [e.segment_id]: e.text }));
          break;
        case "participants.changed":
          api.getMeeting(meetingId).then((d) => setParticipants(d.participants)).catch(() => {});
          break;
        case "doc.added":
          setDocuments((prev) => (prev.some((d) => d.id === e.document.id) ? prev : [...prev, e.document]));
          break;
        case "doc.updated":
          setDocuments((prev) => prev.map((d) => (d.id === e.document.id ? e.document : d)));
          break;
        case "doc.removed":
          setDocuments((prev) => prev.filter((d) => d.id !== e.doc_id));
          break;
        case "presenter.changed":
          setPresenter(e.presenter);
          setRequests([]);
          if (!e.presenter) setPosition(null);
          break;
        case "presenter.position":
          setPosition({ position: e.position, seq: e.seq });
          break;
        case "presenter.request":
          setRequests((prev) => (prev.some((r) => r.user_id === e.user_id) ? prev : [...prev, { user_id: e.user_id, name: e.name }]));
          break;
        case "minutes.ready":
          setHasMinutes(true);
          break;
        case "error":
          setNotice(e.message);
          break;
      }
    };

    const connect = () => {
      const ws = new WebSocket(socketUrl(meetingId, token));
      wsRef.current = ws;
      ws.onopen = () => {
        setConnected(true);
        if (retry > 0) loadTranscript(langRef.current).catch(() => {}); // fill what was missed while offline
        retry = 0;
      };
      ws.onmessage = (m) => handle(JSON.parse(m.data));
      ws.onclose = (ev) => {
        setConnected(false);
        if (closed || ev.code === 4401) return;
        timer = setTimeout(connect, Math.min(1000 * 2 ** retry++, 10000));
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      wsRef.current?.close();
    };
  }, [loaded, meetingId, loadTranscript]);

  const send = useCallback((msg: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  const changeLang = useCallback(
    (next: string | null) => {
      langRef.current = next;
      setLangState(next);
      setTranslations({});
      send({ type: "set_lang", lang: next });
      loadTranscript(next).catch(() => {});
    },
    [send, loadTranscript],
  );

  const refreshParticipants = useCallback(
    () => api.getMeeting(meetingId).then((d) => setParticipants(d.participants)),
    [meetingId],
  );

  return {
    detail,
    error,
    notice,
    clearNotice: () => setNotice(""),
    status,
    botNote,
    connected,
    segments,
    translations,
    lang,
    changeLang,
    participants,
    refreshParticipants,
    documents,
    online,
    presenter,
    position,
    requests,
    dismissRequest: (userId: string) => setRequests((prev) => prev.filter((r) => r.user_id !== userId)),
    hasMinutes,
    setMeetUrl: (url: string | null) =>
      api.setMeetUrl(meetingId, url).then((m) => setDetail((d) => (d ? { ...d, meeting: m } : d))),
    claim: () => send({ type: "presenter.claim" }),
    release: () => send({ type: "presenter.release" }),
    grant: (userId: string) => send({ type: "presenter.grant", user_id: userId }),
    move: (p: Position) => send({ type: "presenter.move", position: p }),
  };
}
