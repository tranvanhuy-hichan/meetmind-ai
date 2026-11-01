"use client";

import { useEffect, useRef, useState } from "react";
import { clock } from "@/lib/format";
import { avatarClass, Equalizer, IconCaption, initials } from "./Icons";
import type { Language, MeetingStatus, Segment } from "@/lib/types";

interface Props {
  segments: Segment[];
  translations: Record<string, string>;
  lang: string | null;
  languages: Language[];
  status: MeetingStatus;
  onLang: (lang: string | null) => void;
  /** Names of the people speaking right now. */
  speaking?: string[];
}

const EMPTY: Record<MeetingStatus, string> = {
  created: "Phụ đề sẽ hiển thị tại đây khi bot vào cuộc họp.",
  bot_joining: "Đang chờ bot vào phòng Google Meet…",
  live: "Đang lắng nghe. Lời nói sẽ xuất hiện ngay khi có người phát biểu.",
  ended: "Cuộc họp không có nội dung được ghi nhận.",
  processing: "Đang xử lý…",
  ready: "Cuộc họp không có nội dung được ghi nhận.",
  bot_failed: "Bot không vào được cuộc họp. Kiểm tra link Meet; nếu cuộc họp chỉ cho người trong tổ chức Google tham gia thì bot (khách bên ngoài) bị từ chối.",
};

export function langLabel(languages: Language[], code: string): string {
  return languages.find((l) => l.code === code)?.label ?? code;
}

export function TranscriptList({
  segments,
  translations,
  lang,
  languages,
}: Pick<Props, "segments" | "translations" | "lang" | "languages">) {
  return (
    <>
      {segments.map((s, i) => {
        const prev = segments[i - 1];
        const header = !prev || prev.speaker !== s.speaker || s.start_ms - prev.end_ms > 30000;
        const translated = lang && s.lang !== lang;
        const shown = translated ? translations[s.id] : s.text;
        return (
          <div key={s.id} className={`line ${header ? "new-speaker" : ""} ${s.is_final ? "" : "partial"}`}>
            <div className="gutter">{header && <span className={`avatar ${avatarClass(s.speaker)} ${s.is_final ? "" : "speaking"}`} title={s.speaker}>{initials(s.speaker)}</span>}</div>
            <div>
              {header && (
                <div className="who">
                  <span>{s.speaker}</span>
                  <span className="time num">{clock(s.start_ms)}</span>
                </div>
              )}
              <div className="text">
                {shown ?? <span className="muted">Đang dịch…</span>}
                {!s.is_final && <span className="typing" aria-hidden><i /><i /><i /></span>}
              </div>
              {translated && translations[s.id] && (
                <div className="orig">{langLabel(languages, s.lang)}: {s.text}</div>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

export function TranscriptPanel({ segments, translations, lang, languages, status, onLang, speaking = [] }: Props) {
  const roster = Array.from(new Set(segments.map((s) => s.speaker)));
  const live = status === "live" || status === "bot_joining";
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [behind, setBehind] = useState(false);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (stick.current) el.scrollTop = el.scrollHeight;
    else setBehind(true);
  }, [segments, translations]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (stick.current) setBehind(false);
  };

  const toBottom = () => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
    stick.current = true;
    setBehind(false);
  };

  return (
    <>
      <div className="side-toolbar">
        <div className={`talk ${speaking.length ? "on" : ""}`} aria-live="polite">
          {speaking.length ? (
            <>
              <Equalizer />
              <span className="truncate"><b>{speaking.join(", ")}</b> đang nói</span>
            </>
          ) : (
            <span className="muted truncate">{live ? "Chưa ai đang nói" : roster.length ? `${roster.length} người đã phát biểu` : ""}</span>
          )}
        </div>
        <label htmlFor="lang" className="muted small">Dịch sang</label>
        <select id="lang" className="select" value={lang ?? ""} onChange={(e) => onLang(e.target.value || null)} aria-label="Ngôn ngữ hiển thị">
          <option value="">Ngôn ngữ gốc</option>
          {languages.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
      </div>
      <div className="transcript" ref={scroller} onScroll={onScroll} aria-live="polite">
        {segments.length === 0 ? (
          <div className="empty"><IconCaption />{EMPTY[status]}</div>
        ) : (
          <TranscriptList segments={segments} translations={translations} lang={lang} languages={languages} />
        )}
        {behind && (
          <button className="btn sm primary jump" onClick={toBottom}>Nội dung mới ↓</button>
        )}
      </div>
    </>
  );
}
