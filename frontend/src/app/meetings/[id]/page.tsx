"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppBar } from "@/components/AppBar";
import { DocumentPane } from "@/components/DocumentPane";
import { ParticipantsPanel } from "@/components/ParticipantsPanel";
import { ZoomEmbed } from "@/components/ZoomEmbed";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { Equalizer, IconBot, IconCaption, IconDoc, IconStop, IconUsers, IconVideo } from "@/components/Icons";
import { RoomSkeleton } from "@/components/Skeleton";
import { useMeetingRoom } from "@/hooks/useMeetingRoom";
import { api, NO_ROOMS } from "@/lib/api";
import { useRequireUser } from "@/lib/auth";
import { canManage as canManageRole, PLATFORM_LABEL, STATUS_LABEL } from "@/lib/format";
import type { Language } from "@/lib/types";

/** Opens the meeting (Meet or Zoom) in its own window, on the left, so the room can sit beside it. */
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
  const [mobileTab, setMobileTab] = useState<"transcript" | "stage" | "people">("transcript");
  const [busy, setBusy] = useState(false);
  const [sideW, setSideW] = useState(420);
  const [stageTab, setStageTab] = useState<"zoom" | "docs">("zoom");
  const dragging = useRef(false);

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem("meetmind.sideW"));
      if (saved >= 300) setSideW(saved);
    } catch {}
  }, []);

  function startResize(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    dragging.current = true;
    let width = sideW;
    document.body.classList.add("resizing");
    const move = (ev: PointerEvent) => {
      width = Math.round(Math.min(Math.max(window.innerWidth - ev.clientX - 12 - 6, 300), Math.min(900, window.innerWidth - 420)));
      setSideW(width);
    };
    const up = () => {
      dragging.current = false;
      document.body.classList.remove("resizing");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      try { localStorage.setItem("meetmind.sideW", String(width)); } catch {}
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  const [actionError, setActionError] = useState("");
  const [meetRooms, setMeetRooms] = useState(NO_ROOMS);
  const [roomNote, setRoomNote] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (user) {
      api.languages().then(setLanguages).catch(() => {});
      api.config().then((c) => setMeetRooms({ meet: c.meet_rooms, zoom: c.zoom_rooms })).catch(() => {});
    }
  }, [user]);

  // Google sends the browser back here with ?meet=ok or ?meet=error&msg=...
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const result = q.get("meet");
    if (!result) return;
    setRoomNote(result === "ok" ? { ok: true, text: "Đã tạo phòng họp cho phiên này. Link đã được lưu." } : { ok: false, text: q.get("msg") || "Không tạo được phòng Meet" });
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
    return <RoomSkeleton />;
  }

  const { meeting, me } = room.detail;
  const myRole = room.participants.find((p) => p.user_id === me.user_id)?.role ?? me.role;
  const manage = canManageRole(myRole);
  const live = room.status === "bot_joining" || room.status === "live";
  const canCallBot = room.status === "created" || room.status === "bot_failed";
  const meetUrl = room.detail.meeting.meet_url;
  const hasZoom = meeting.platform === "zoom" && !!room.detail.meeting.meet_url;
  const platformName = PLATFORM_LABEL[meeting.platform ?? "meet"];
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
        <strong className="rh-title truncate">{meeting.title}</strong>
        <span className={`status ${room.status}`}>{STATUS_LABEL[room.status]}</span>
        <span className="muted small row" style={{ gap: 5 }} title="Số người đang mở phiên họp này">
          <IconUsers size={14} />
          {room.online.size} trực tuyến
        </span>
        {room.speaking.length > 0 && (
          <span className="speaking-chip" title="Đang nói">
            <Equalizer />
            <span className="truncate">{room.speaking.join(", ")}</span>
          </span>
        )}
        <div className="grow" />
        <div className="room-nav-actions">
          {meetUrl && (
            <button
              className="btn sm on-dark primary"
              onClick={() => openMeet(meetUrl)}
              title={`Mở ${platformName} ở cửa sổ riêng.`}
            >
              <IconVideo size={14} /> Mở {platformName}
            </button>
          )}
          {showMinutes && (
            <Link className="btn sm on-dark" href={`/meetings/${meeting.id}/minutes`}>
              <IconDoc size={14} /> Biên bản
            </Link>
          )}
          {manage && canCallBot && (
            <button
              className="btn sm on-dark"
              disabled={busy || !meetUrl}
              onClick={() => run(() => api.startMeeting(meeting.id))}
            >
              <IconBot size={14} /> Gọi bot
            </button>
          )}
          {manage && live && (
            <button
              className="btn sm on-dark danger"
              disabled={busy}
              onClick={() =>
                window.confirm("Kết thúc cuộc họp và tạo biên bản?") && run(() => api.endMeeting(meeting.id))
              }
            >
              <IconStop size={14} /> Kết thúc
            </button>
          )}
        </div>
      </AppBar>

      {/* Mobile Tab Switcher */}
      <div className="mobile-room-tab-bar" role="tablist">
        <button
          role="tab"
          aria-selected={mobileTab === "transcript"}
          className={`mobile-rtab ${mobileTab === "transcript" ? "active" : ""}`}
          onClick={() => {
            setMobileTab("transcript");
            setSide("transcript");
          }}
        >
          <IconCaption size={15} />
          <span>Phụ đề</span>
        </button>
        <button
          role="tab"
          aria-selected={mobileTab === "stage"}
          className={`mobile-rtab ${mobileTab === "stage" ? "active" : ""}`}
          onClick={() => setMobileTab("stage")}
        >
          <IconDoc size={15} />
          <span>Tài liệu {room.documents.length > 0 ? `(${room.documents.length})` : ""}</span>
        </button>
        <button
          role="tab"
          aria-selected={mobileTab === "people"}
          className={`mobile-rtab ${mobileTab === "people" ? "active" : ""}`}
          onClick={() => {
            setMobileTab("people");
            setSide("people");
          }}
        >
          <IconUsers size={15} />
          <span>Thành viên ({room.participants.length})</span>
        </button>
      </div>

      <div>
        {!room.connected && <div className="notice warn">Mất kết nối với máy chủ, đang thử kết nối lại…</div>}
        {room.botNote && <div className="notice">{room.botNote}</div>}
        {roomNote && (
          <div className={`notice ${roomNote.ok ? "" : "warn"} row`}>
            <span className="grow">{roomNote.text}</span>
            <button className="btn sm ghost" onClick={() => setRoomNote(null)}>
              Đóng
            </button>
          </div>
        )}
        {actionError && (
          <div className="notice warn row">
            <span className="grow error">{actionError}</span>
            <button className="btn sm ghost" onClick={() => setActionError("")}>
              Đóng
            </button>
          </div>
        )}
        {room.notice && (
          <div className="notice warn row">
            <span className="grow">{room.notice}</span>
            <button className="btn sm ghost" onClick={room.clearNotice}>
              Đóng
            </button>
          </div>
        )}
      </div>

      <div className="room-body" style={{ "--side-w": `${sideW}px` } as React.CSSProperties}>
        <div className={`stage ${mobileTab !== "stage" ? "mobile-room-pane-hide" : ""}`}>
          {hasZoom && (
            <div className="tabs stage-tabs" role="tablist">
              <button
                role="tab"
                aria-selected={stageTab === "zoom"}
                className={`tab ${stageTab === "zoom" ? "active" : ""}`}
                onClick={() => setStageTab("zoom")}
              >
                Zoom
              </button>
              <button
                role="tab"
                aria-selected={stageTab === "docs"}
                className={`tab ${stageTab === "docs" ? "active" : ""}`}
                onClick={() => setStageTab("docs")}
              >
                Tài liệu{room.documents.length > 0 ? ` (${room.documents.length})` : ""}
              </button>
            </div>
          )}
          {hasZoom && meetUrl && (
            // stays mounted while the documents tab is open, so the video does not drop out of the meeting
            <section className="zoom-pane" hidden={stageTab !== "zoom"} aria-label="Cuộc họp Zoom">
              <ZoomEmbed meetingId={meeting.id} url={meetUrl} />
            </section>
          )}
          <div className="stage-docs" hidden={hasZoom && stageTab !== "docs"}>
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
          </div>
        </div>

        <div
          className="splitter"
          role="separator"
          aria-orientation="vertical"
          aria-label="Kéo để đổi kích thước"
          title="Kéo để đổi kích thước"
          onPointerDown={startResize}
          onDoubleClick={() => {
            setSideW(420);
            try {
              localStorage.removeItem("meetmind.sideW");
            } catch {}
          }}
        />

        <section
          className={`side-pane ${mobileTab === "stage" ? "mobile-room-pane-hide" : ""}`}
          aria-label="Phụ đề và người tham gia"
        >
          <div className="tabs desktop-side-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={side === "transcript"}
              className={`tab ${side === "transcript" ? "active" : ""}`}
              onClick={() => setSide("transcript")}
            >
              Phụ đề
            </button>
            <button
              role="tab"
              aria-selected={side === "people"}
              className={`tab ${side === "people" ? "active" : ""}`}
              onClick={() => setSide("people")}
            >
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
              speaking={room.speaking}
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
              speaking={room.speaking}
            />
          )}
        </section>
      </div>
    </div>
  );
}
