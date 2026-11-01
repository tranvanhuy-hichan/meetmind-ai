"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppBar } from "@/components/AppBar";
import { DocumentPane } from "@/components/DocumentPane";
import { ParticipantsPanel } from "@/components/ParticipantsPanel";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { IconBot, IconDoc, IconStop, IconUsers, IconVideo } from "@/components/Icons";
import { useMeetingRoom } from "@/hooks/useMeetingRoom";
import { api } from "@/lib/api";
import { useRequireUser } from "@/lib/auth";
import { canManage as canManageRole, STATUS_LABEL } from "@/lib/format";
import type { Language } from "@/lib/types";

/** Opens Meet in its own window, on the left, so the room can sit beside it. */
function openMeet(url: string) {
  const width = Math.round(window.screen.availWidth * 0.55);
  const popup = window.open(url, "meetmind-meet", `popup=yes,width=${width},height=${window.screen.availHeight},left=0,top=0`);
  if (!popup) window.open(url, "_blank", "noopener");
}

export default function RoomPage({ params }: { params: { id: string } }) {
  const { user, logout } = useRequireUser();
  const room = useMeetingRoom(user ? params.id : "");
  const [languages, setLanguages] = useState<Language[]>([]);
  const [side, setSide] = useState<"transcript" | "people">("transcript");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [meetRooms, setMeetRooms] = useState(false);
  const [roomNote, setRoomNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (user) {
      api.languages().then(setLanguages).catch(() => {});
      api.config().then((c) => setMeetRooms(c.meet_rooms)).catch(() => {});
    }
  }, [user]);

  // Google sends the browser back here with ?meet=ok or ?meet=error&msg=...
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const result = q.get("meet");
    if (!result) return;
    setRoomNote(result === "ok" ? { ok: true, text: "Đã tạo phòng Google Meet cho phiên họp này. Link đã được lưu." } : { ok: false, text: q.get("msg") || "Không tạo được phòng Meet" });
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  if (!user) return null;
  if (room.error) {
    return (
      <>
        <AppBar user={user} onLogout={logout} />
        <main className="page">
          <div className="panel" style={{ padding: 20 }}>
            <h1>Không mở được phiên họp</h1>
            <p className="muted">{room.error}</p>
            <Link href="/">← Về danh sách phiên họp</Link>
          </div>
        </main>
      </>
    );
  }
  if (!room.detail) {
    return (
      <>
        <AppBar user={user} onLogout={logout} />
        <main className="page muted">Đang mở phiên họp…</main>
      </>
    );
  }

  const { meeting, me } = room.detail;
  const myRole = room.participants.find((p) => p.user_id === me.user_id)?.role ?? me.role;
  const manage = canManageRole(myRole);
  const live = room.status === "bot_joining" || room.status === "live";
  const canCallBot = room.status === "created" || room.status === "bot_failed";
  const meetUrl = room.detail.meeting.meet_url;
  const showMinutes = room.hasMinutes || ["ended", "processing", "ready"].includes(room.status);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setActionError("");
    try {
      await action();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Thao tác không thành công");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="room">
      <AppBar user={user} onLogout={logout}>
        <div className="sep" />
        <strong className="truncate" style={{ maxWidth: 360, fontSize: 15 }}>{meeting.title}</strong>
        <span className={`status ${room.status}`}>{STATUS_LABEL[room.status]}</span>
        <span className="muted small row" style={{ gap: 5 }} title="Số người đang mở phiên họp này">
          <IconUsers />{room.online.size} trực tuyến
        </span>
        <div className="grow" />
        {meetUrl && (
          <button className="btn sm on-dark primary" onClick={() => openMeet(meetUrl)} title="Mở Meet ở cửa sổ riêng. Dùng Win + ←/→ để xếp hai cửa sổ cạnh nhau.">
            <IconVideo />Mở Google Meet
          </button>
        )}
        {manage && canCallBot && (
          <button className="btn sm on-dark" disabled={busy || !meetUrl} title={meetUrl ? "Cho bot vào phòng Meet để lấy phụ đề" : "Cần nhập link Google Meet trước"} onClick={() => run(() => api.startMeeting(meeting.id))}>
            <IconBot />Gọi bot vào họp
          </button>
        )}
        {manage && live && (
          <button className="btn sm on-dark danger" disabled={busy} onClick={() => window.confirm("Kết thúc cuộc họp và tạo biên bản?") && run(() => api.endMeeting(meeting.id))}>
            <IconStop />Kết thúc họp
          </button>
        )}
        {showMinutes && (
          <Link className="btn sm on-dark" href={`/meetings/${meeting.id}/minutes`}><IconDoc />Biên bản</Link>
        )}
      </AppBar>

      <div>
        {!room.connected && <div className="notice warn">Mất kết nối với máy chủ, đang thử kết nối lại…</div>}
        {room.botNote && <div className="notice">{room.botNote}</div>}
        {roomNote && (
          <div className={`notice ${roomNote.ok ? "" : "warn"} row`}>
            <span className="grow">{roomNote.text}</span>
            <button className="btn sm ghost" onClick={() => setRoomNote(null)}>Đóng</button>
          </div>
        )}
        {actionError && (
          <div className="notice warn row">
            <span className="grow error">{actionError}</span>
            <button className="btn sm ghost" onClick={() => setActionError("")}>Đóng</button>
          </div>
        )}
        {room.notice && (
          <div className="notice warn row">
            <span className="grow">{room.notice}</span>
            <button className="btn sm ghost" onClick={room.clearNotice}>Đóng</button>
          </div>
        )}
      </div>

      <div className="room-body">
        <DocumentPane
          meetingId={meeting.id}
          meId={me.user_id}
          canManage={manage}
          documents={room.documents}
          participants={room.participants}
          presenter={room.presenter}
          position={room.position}
          requests={room.requests}
          onClaim={room.claim}
          onRelease={room.release}
          onGrant={room.grant}
          onMove={room.move}
          onDismissRequest={room.dismissRequest}
        />

        <section className="side-pane" aria-label="Phụ đề và người tham gia">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={side === "transcript"} className={`tab ${side === "transcript" ? "active" : ""}`} onClick={() => setSide("transcript")}>
              Phụ đề
            </button>
            <button role="tab" aria-selected={side === "people"} className={`tab ${side === "people" ? "active" : ""}`} onClick={() => setSide("people")}>
              Người tham gia ({room.participants.length})
            </button>
          </div>
          {side === "transcript" ? (
            <TranscriptPanel
              segments={room.segments}
              translations={room.translations}
              lang={room.lang}
              languages={languages}
              status={room.status}
              onLang={room.changeLang}
            />
          ) : (
            <ParticipantsPanel
              meeting={room.detail.meeting}
              meId={me.user_id}
              isHost={myRole === "host"}
              canManage={manage}
              participants={room.participants}
              online={room.online}
              presenter={room.presenter}
              onChanged={room.refreshParticipants}
              onMeetUrl={room.setMeetUrl}
              meetRooms={meetRooms}
            />
          )}
        </section>
      </div>
    </div>
  );
}
