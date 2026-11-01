"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { fileSize } from "@/lib/format";
import { IconFile, IconUpload } from "./Icons";
import type { DocumentInfo } from "@/lib/types";

interface Props {
  meetingId: string;
  documents: DocumentInfo[];
  openIds: string[];
  canManage: boolean;
  onOpen: (id: string) => void;
}

export function DocumentList({ meetingId, documents, openIds, canManage, onOpen }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    try {
      for (const file of Array.from(files)) {
        const doc = await api.uploadDocument(meetingId, file);
        onOpen(doc.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải lên được");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <aside className="doc-list" aria-label="Danh sách tài liệu">
      <div className="panel-head" style={{ borderBottomColor: "var(--border)" }}>
        <h3 className="grow">Tài liệu ({documents.length})</h3>
        {canManage && (
          <>
            <button className="btn sm" disabled={busy} onClick={() => input.current?.click()}>
              <IconUpload />
              {busy ? "Đang tải…" : "Tải lên"}
            </button>
            <input
              ref={input}
              type="file"
              hidden
              multiple
              accept=".pdf,.doc,.docx,.odt,.ppt,.pptx,.odp"
              onChange={(e) => upload(e.target.files)}
            />
          </>
        )}
      </div>
      {error && <div className="notice warn error">{error}</div>}
      <div className="doc-list-items">
        {documents.length === 0 && (
          <div className="muted small" style={{ padding: 12 }}>
            {canManage ? "Tải lên PDF, Word hoặc PowerPoint để chia sẻ cho mọi người trong phiên." : "Chủ trì chưa chia sẻ tài liệu nào."}
          </div>
        )}
        {documents.map((d) => (
          <button key={d.id} className={`doc-item ${openIds.includes(d.id) ? "open" : ""}`} onClick={() => onOpen(d.id)}>
            <IconFile />
            <span className="grow">
              <div className="truncate" style={{ fontWeight: 500 }} title={d.name}>{d.name}</div>
              <div className="muted small num">{d.page_count} trang · {fileSize(d.size)}</div>
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
