"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { fileSize } from "@/lib/format";
import { IconFile, IconPlus, IconUpload } from "./Icons";
import type { DocumentInfo } from "@/lib/types";

interface Props {
  meetingId: string;
  documents: DocumentInfo[];
  openIds: string[];
  canManage: boolean;
  onOpen: (id: string) => void;
}

/** The "+ Tài liệu" button at the end of the tab strip: pick a shared document to open, or upload a new one. */
export function DocumentList({ meetingId, documents, openIds, canManage, onOpen }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const closed = documents.filter((d) => !openIds.includes(d.id));

  useEffect(() => {
    const away = (e: MouseEvent) => wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    try {
      for (const file of Array.from(files)) {
        const doc = await api.uploadDocument(meetingId, file);
        onOpen(doc.id);
      }
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải lên được");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  if (!canManage && documents.length === 0) return null;
  return (
    <div className="menu-wrap doc-add" ref={wrap}>
      <button className="btn sm ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
        <IconPlus />Tài liệu{documents.length ? ` (${documents.length})` : ""}
      </button>
      {open && (
        <div className="menu" role="menu">
          {closed.length > 0 && <div className="menu-label">Đang chia sẻ</div>}
          {closed.map((d) => (
            <button key={d.id} className="menu-item" role="menuitem" onClick={() => { onOpen(d.id); setOpen(false); }}>
              <IconFile />
              <span className="grow">
                <span className="truncate" style={{ display: "block", fontWeight: 600 }} title={d.name}>{d.name}</span>
                <span className="muted small num">{d.page_count} trang · {fileSize(d.size)}</span>
              </span>
            </button>
          ))}
          {closed.length === 0 && documents.length > 0 && <div className="menu-empty">Mọi tài liệu đều đang mở.</div>}
          {canManage && (
            <>
              <button className="menu-item add" role="menuitem" disabled={busy} onClick={() => input.current?.click()}>
                <IconUpload />{busy ? "Đang tải…" : "Tải tài liệu lên (PDF, Word, PowerPoint)"}
              </button>
              <input ref={input} type="file" hidden multiple accept=".pdf,.doc,.docx,.odt,.ppt,.pptx,.odp" onChange={(e) => upload(e.target.files)} />
            </>
          )}
          {error && <div className="menu-empty error">{error}</div>}
        </div>
      )}
    </div>
  );
}
