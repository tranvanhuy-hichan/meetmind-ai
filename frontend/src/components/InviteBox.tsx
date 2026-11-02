"use client";

import { useState } from "react";
import type { InviteResult } from "@/lib/types";

export function parseEmails(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter(Boolean);
}

interface Props {
  onInvite: (emails: string[], role: string) => Promise<InviteResult>;
  /** Role choices; omit when the invitation has a single fixed role. */
  roles?: { value: string; label: string }[];
  placeholder?: string;
  /** One line: an input and a button, for tight places. */
  compact?: boolean;
}

/** Invite people by email. Whoever has no account yet gets access at their first sign-in. */
export function InviteBox({ onInvite, roles, placeholder = "ten@congty.com, ten2@congty.com", compact = false }: Props) {
  const [text, setText] = useState("");
  const [role, setRole] = useState(roles?.[0]?.value ?? "member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<InviteResult | null>(null);

  async function submit() {
    const emails = parseEmails(text);
    if (!emails.length) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setResult(await onInvite(emails, role));
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không gửi được lời mời");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="col" style={{ gap: 8 }}>
      {compact ? (
        <form
          className="row"
          style={{ gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            className="input grow"
            value={text}
            placeholder={placeholder}
            aria-label="Địa chỉ email cần mời"
            onChange={(e) => setText(e.target.value)}
          />
          <button className="btn primary" disabled={busy || parseEmails(text).length === 0}>
            {busy ? "Đang gửi…" : "Mời"}
          </button>
        </form>
      ) : (
        <textarea
          className="textarea"
          rows={3}
          value={text}
          placeholder={placeholder}
          aria-label="Địa chỉ email cần mời"
          onChange={(e) => setText(e.target.value)}
        />
      )}
      <div className="row" style={compact ? { display: "none" } : undefined}>
        {roles && (
          <select className="select" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Vai trò">
            {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        )}
        <div className="grow" />
        <button className="btn primary" disabled={busy || parseEmails(text).length === 0} onClick={submit}>
          {busy ? "Đang gửi…" : "Gửi lời mời"}
        </button>
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      {result && (
        <div className="small col" style={{ gap: 2 }} role="status">
          {result.added.length > 0 && <div>Đã thêm (đã có tài khoản): {result.added.join(", ")}</div>}
          {result.invited.length > 0 && <div>Đã gửi lời mời, sẽ vào khi họ đăng nhập: {result.invited.join(", ")}</div>}
          {result.skipped.length > 0 && <div className="muted">Đã có sẵn: {result.skipped.join(", ")}</div>}
          {result.email_failed.length > 0 && (
            <div className="error">Không gửi được email tới: {result.email_failed.join(", ")} (lời mời vẫn được lưu)</div>
          )}
        </div>
      )}
    </div>
  );
}
