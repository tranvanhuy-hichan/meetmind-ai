"use client";

import { useState } from "react";
import { Dialog } from "./Dialog";
import { api, type Rooms } from "@/lib/api";
import { PLATFORM_LABEL } from "@/lib/format";
import type { MeetingSummary, OrgSummary, Platform } from "@/lib/types";

export function CreateDialog({ orgs, initialOrg, meetRooms, onClose, onDone }: { orgs: OrgSummary[]; initialOrg: string; meetRooms: Rooms; onClose: () => void; onDone: (m: MeetingSummary) => void }) {
  const [org, setOrg] = useState(orgs.some((o) => o.id === initialOrg) ? initialOrg : orgs[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState<Platform>("meet");
  const [url, setUrl] = useState("");
  const [makeRoom, setMakeRoom] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const canMakeRoom = meetRooms[platform];
  const wantRoom = canMakeRoom && makeRoom && !url.trim();

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const meeting = await api.createMeeting(org, title, url.trim() || null, null, platform);
      if (wantRoom) {
        try {
          window.location.href = (await api.createMeetRoom(meeting.id)).authorize_url; // Google or Zoom asks once, then sends the user back to the room
          return;
        } catch {
          /* could not start it: the meeting exists, the room page lets them try again */
        }
      }
      onDone(meeting);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tạo được phiên họp");
      setBusy(false);
    }
  }

  return (
    <Dialog
      title="Tạo phiên họp"
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Hủy</button>
          <button className="btn primary" disabled={busy || !title.trim() || !org}>Tạo phiên</button>
        </>
      }
    >
      {orgs.length > 1 && (
        <div className="field">
          <label htmlFor="o">Tổ chức</label>
          <select id="o" className="select" style={{ width: "100%", height: 40 }} value={org} onChange={(e) => setOrg(e.target.value)}>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      )}
      <div className="field">
        <label htmlFor="t">Tên phiên họp</label>
        <input id="t" className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <label>Nền tảng họp</label>
        <div className="row" style={{ gap: 16 }}>
          {(["meet", "zoom"] as const).map((p) => (
            <label key={p} className="row small" style={{ gap: 6 }}>
              <input type="radio" name="platform" checked={platform === p} onChange={() => { setPlatform(p); setUrl(""); }} />
              {PLATFORM_LABEL[p]}
            </label>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="u">Link {PLATFORM_LABEL[platform]}</label>
        <input id="u" className="input" placeholder={platform === "zoom" ? "https://zoom.us/j/123456789" : "https://meet.google.com/abc-defg-hij"} value={url} onChange={(e) => setUrl(e.target.value)} />
        {canMakeRoom ? (
          <label className="row small" style={{ gap: 8 }}>
            <input type="checkbox" checked={makeRoom} disabled={!!url.trim()} onChange={(e) => setMakeRoom(e.target.checked)} />
            Để MeetMind tạo {platform === "zoom" ? "cuộc họp Zoom" : "phòng Google Meet"} cho tôi ({platform === "zoom" ? "Zoom" : "Google"} sẽ hỏi quyền một lần)
          </label>
        ) : platform === "zoom" ? (
          <span className="muted small">
            Tạo cuộc họp trong Zoom rồi dán link mời vào đây. Có thể bổ sung sau; cần có link trước khi gọi bot vào họp.
          </span>
        ) : (
          <span className="muted small">
            Tạo phòng ở <a href="https://meet.new" target="_blank" rel="noopener noreferrer">meet.new</a> rồi dán link vào đây. Có thể bổ sung sau; cần có link trước khi gọi bot vào họp.
          </span>
        )}
      </div>
      {error && <div className="error">{error}</div>}
    </Dialog>
  );
}

export function OrgDialog({ onClose, onDone }: { onClose: () => void; onDone: (o: OrgSummary) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      onDone(await api.createOrg(name));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tạo được tổ chức");
      setBusy(false);
    }
  }

  return (
    <Dialog
      title="Tạo tổ chức"
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Hủy</button>
          <button className="btn primary" disabled={busy || !name.trim()}>Tạo tổ chức</button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="n">Tên tổ chức</label>
        <input id="n" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      {error && <div className="error">{error}</div>}
    </Dialog>
  );
}

export function JoinDialog({ onClose, onDone }: { onClose: () => void; onDone: (m: MeetingSummary) => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      onDone(await api.joinMeeting(code));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tham gia được");
      setBusy(false);
    }
  }

  return (
    <Dialog
      title="Tham gia bằng mã"
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Hủy</button>
          <button className="btn primary" disabled={busy || !code.trim()}>Tham gia</button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="c">Mã tham gia do chủ trì cung cấp</label>
        <input id="c" className="input num" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoFocus />
      </div>
      {error && <div className="error">{error}</div>}
    </Dialog>
  );
}
