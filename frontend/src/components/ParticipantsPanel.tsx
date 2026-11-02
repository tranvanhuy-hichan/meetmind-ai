"use client";

import { useState } from "react";
import { api, type Rooms } from "@/lib/api";
import { InviteBox } from "./InviteBox";
import { avatarClass, IconCheck, IconCopy, IconEdit, IconExternal, initials } from "./Icons";
import { PLATFORM_LABEL, ROLE_LABEL } from "@/lib/format";
import type { MeetingSummary, Participant, PresenterRef } from "@/lib/types";

interface Props {
  meeting: MeetingSummary;
  meId: string;
  isHost: boolean;
  canManage: boolean;
  participants: Participant[];
  online: Set<string>;
  presenter: PresenterRef | null;
  onChanged: () => void;
  onMeetUrl: (url: string | null) => Promise<unknown>;
  meetRooms: Rooms;
  speaking?: string[];
}

export function ParticipantsPanel({ meeting, meId, isHost, canManage, participants, online, presenter, onChanged, onMeetUrl, meetRooms, speaking = [] }: Props) {
  const isZoom = meeting.platform === "zoom";
  const platformName = PLATFORM_LABEL[meeting.platform ?? "meet"];
  const [url, setUrl] = useState(meeting.meet_url ?? "");
  const [urlState, setUrlState] = useState<"idle" | "saving" | "saved" | string>("idle");
  const [copied, setCopied] = useState(false);
  const [roomBusy, setRoomBusy] = useState(false);
  const [roomError, setRoomError] = useState("");

  async function createRoom() {
    setRoomBusy(true);
    setRoomError("");
    try {
      window.location.href = (await api.createMeetRoom(meeting.id)).authorize_url;
    } catch (e) {
      setRoomError(e instanceof Error ? e.message : "Không tạo được phòng");
      setRoomBusy(false);
    }
  }

  async function saveUrl() {
    setUrlState("saving");
    try {
      await onMeetUrl(url.trim() || null);
      setUrlState("saved");
    } catch (e) {
      setUrlState(e instanceof Error ? e.message : "Không lưu được");
    }
  }

  async function copyCode() {
    if (!meeting.invite_code) return;
    try {
      await navigator.clipboard.writeText(meeting.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the code is still visible to copy by hand */
    }
  }

  const platformKey = meeting.platform ?? "meet";
  const canCreate = meetRooms[platformKey];
  const hasLink = !!meeting.meet_url;
  const [editing, setEditing] = useState(!hasLink && canManage);
  const [linkCopied, setLinkCopied] = useState(false);

  async function copyLink() {
    if (!meeting.meet_url) return;
    try {
      await navigator.clipboard.writeText(meeting.meet_url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      /* clipboard blocked: the link is still visible to copy by hand */
    }
  }

  async function save() {
    await saveUrl();
    setEditing(false);
  }

  return (
    <div className="pp">
      <section className="pp-section">
        <div className="pp-title">
          <span>Link {platformName}</span>
          {urlState === "saved" && <span className="pp-ok"><IconCheck size={13} />Đã lưu</span>}
        </div>

        {editing && canManage ? (
          <div className="col" style={{ gap: 8 }}>
            <input
              id="meet-url"
              className="input"
              autoFocus
              placeholder={isZoom ? "https://zoom.us/j/…" : "https://meet.google.com/…"}
              value={url}
              onChange={(e) => { setUrl(e.target.value); setUrlState("idle"); }}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            />
            <div className="row" style={{ gap: 8 }}>
              <button className="btn sm primary" disabled={urlState === "saving" || url === (meeting.meet_url ?? "")} onClick={save}>Lưu</button>
              {hasLink && <button className="btn sm" onClick={() => { setUrl(meeting.meet_url ?? ""); setEditing(false); setUrlState("idle"); }}>Hủy</button>}
            </div>
          </div>
        ) : hasLink ? (
          <div className="pp-link">
            <span className="pp-link-text truncate" title={meeting.meet_url ?? ""}>{meeting.meet_url}</span>
            <button className="pp-icon" onClick={copyLink} title="Chép link" aria-label="Chép link">
              {linkCopied ? <IconCheck size={15} /> : <IconCopy size={15} />}
            </button>
            <a className="pp-icon" href={meeting.meet_url ?? "#"} target="_blank" rel="noopener noreferrer" title={`Mở ${platformName}`} aria-label={`Mở ${platformName}`}>
              <IconExternal size={15} />
            </a>
            {canManage && (
              <button className="pp-icon" onClick={() => setEditing(true)} title="Sửa link" aria-label="Sửa link">
                <IconEdit size={15} />
              </button>
            )}
          </div>
        ) : (
          <div className="muted small">Chưa có link{canManage ? "" : "; chủ trì sẽ thêm"}</div>
        )}

        {canManage && (
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            {canCreate ? (
              <button type="button" className="btn sm" disabled={roomBusy} onClick={createRoom}>
                {roomBusy ? (isZoom ? "Đang mở Zoom…" : "Đang mở Google…") : hasLink ? `Tạo ${isZoom ? "cuộc họp Zoom" : "phòng Meet"} mới` : `Tạo ${isZoom ? "cuộc họp Zoom" : "phòng Meet"} tự động`}
              </button>
            ) : (
              !isZoom && !hasLink && <a href="https://meet.new" target="_blank" rel="noopener noreferrer" className="small">Tạo phòng Google Meet mới (mở tab mới)</a>
            )}
          </div>
        )}
        {roomError && <span className="error small">{roomError}</span>}
        {urlState !== "idle" && urlState !== "saved" && urlState !== "saving" && <span className="error small">{urlState}</span>}
      </section>

      {canManage && (
        <section className="pp-section">
          <div className="pp-title">
            <span>Mời tham gia</span>
            {meeting.invite_code && (
              <button className="pp-code" onClick={copyCode} title="Mã tham gia dự phòng, không cần khi mời bằng email. Bấm để chép">
                <span className="muted">Mã</span>
                <code className="num">{meeting.invite_code}</code>
                {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
              </button>
            )}
          </div>
          <InviteBox
            compact
            placeholder="Email người cần mời"
            onInvite={async (emails) => {
              const res = await api.inviteToMeeting(meeting.id, emails);
              onChanged();
              return res;
            }}
          />
        </section>
      )}

      <div className="pp-title pp-people-head">
        <span>Người tham gia ({participants.length})</span>
        <span className="pp-online"><span className="dot on" />{online.size} trực tuyến</span>
      </div>
      {participants.map((p) => (
        <div className="person" key={p.user_id}>
          <span className={`avatar ${avatarClass(p.name)} ${speaking.some((n) => n.toLowerCase() === p.name.toLowerCase()) ? "speaking" : ""}`} style={{ position: "relative" }}>
            {initials(p.name)}
            <span className={`dot ${online.has(p.user_id) ? "on" : ""}`} title={online.has(p.user_id) ? "Đang trực tuyến" : "Ngoại tuyến"} style={{ position: "absolute", right: -3, bottom: -3, border: "2px solid #fff", width: 11, height: 11 }} />
          </span>
          <div className="grow">
            <div className="truncate">
              {p.name}
              {p.user_id === meId && <span className="muted"> (bạn)</span>}
            </div>
            <div className="muted small truncate">{p.email}</div>
          </div>
          {presenter?.user_id === p.user_id && <span className="tag accent">Trình bày</span>}
          {isHost && p.role !== "host" ? (
            <select
              className="select"
              style={{ height: 26 }}
              value={p.role}
              aria-label={`Vai trò của ${p.name}`}
              onChange={async (e) => {
                await api.setRole(meeting.id, p.user_id, e.target.value);
                onChanged();
              }}
            >
              <option value="cohost">{ROLE_LABEL.cohost}</option>
              <option value="member">{ROLE_LABEL.member}</option>
            </select>
          ) : (
            <span className="tag">{ROLE_LABEL[p.role]}</span>
          )}
        </div>
      ))}
    </div>
  );
}
