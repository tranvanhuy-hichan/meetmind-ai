"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { InviteBox } from "./InviteBox";
import { avatarClass, initials } from "./Icons";
import { ROLE_LABEL } from "@/lib/format";
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
  meetRooms: boolean;
}

export function ParticipantsPanel({ meeting, meId, isHost, canManage, participants, online, presenter, onChanged, onMeetUrl, meetRooms }: Props) {
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

  return (
    <div style={{ overflowY: "auto", minHeight: 0 }}>
      <div className="col" style={{ padding: 14, borderBottom: "1px solid var(--border)" }}>
        {canManage && meeting.invite_code && (
          <div className="field">
            <label>Mã tham gia (dự phòng, không cần khi mời bằng email)</label>
            <div className="row">
              <code className="num grow" style={{ fontSize: 16, letterSpacing: "0.08em" }}>{meeting.invite_code}</code>
              <button className="btn sm" onClick={copyCode}>{copied ? "Đã chép" : "Sao chép"}</button>
            </div>
          </div>
        )}
        {canManage && (
          <div className="field">
            <label>Mời tham gia bằng email</label>
            <InviteBox
              placeholder="ten@congty.com"
              onInvite={async (emails) => {
                const res = await api.inviteToMeeting(meeting.id, emails);
                onChanged();
                return res;
              }}
            />
          </div>
        )}
        <div className="field">
          <label htmlFor="meet-url">Link Google Meet</label>
          {canManage ? (
            <>
              <div className="row">
                <input id="meet-url" className="input" placeholder="https://meet.google.com/…" value={url} onChange={(e) => { setUrl(e.target.value); setUrlState("idle"); }} />
                <button className="btn sm" disabled={urlState === "saving" || url === (meeting.meet_url ?? "")} onClick={saveUrl}>Lưu</button>
              </div>
              {meetRooms ? (
                <button type="button" className="btn sm" disabled={roomBusy} onClick={createRoom}>
                  {roomBusy ? "Đang mở Google…" : meeting.meet_url ? "Tạo phòng Meet mới" : "Tạo phòng Meet tự động"}
                </button>
              ) : (
                !meeting.meet_url && <a href="https://meet.new" target="_blank" rel="noopener noreferrer" className="small">Tạo phòng Google Meet mới (mở tab mới)</a>
              )}
              {roomError && <span className="error">{roomError}</span>}
              {urlState === "saved" && <span className="muted small">Đã lưu.</span>}
              {urlState !== "idle" && urlState !== "saved" && urlState !== "saving" && <span className="error">{urlState}</span>}
            </>
          ) : (
            <span className="truncate">{meeting.meet_url ?? "Chưa có"}</span>
          )}
        </div>
      </div>

      <div className="panel-head" style={{ borderTop: "1px solid var(--border)" }}>
        <h3 className="grow">Người tham gia ({participants.length})</h3>
        <span className="muted small">{online.size} đang trực tuyến</span>
      </div>
      {participants.map((p) => (
        <div className="person" key={p.user_id}>
          <span className={`avatar ${avatarClass(p.name)}`} style={{ position: "relative" }}>
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
