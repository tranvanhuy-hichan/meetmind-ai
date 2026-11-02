"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

/** The Zoom meeting itself, inside the room page (Zoom Meeting SDK, component view). Everyone joins as a
 *  participant under their MeetMind name; the meeting is created with "join before host" so no one has to start it. */
export function ZoomEmbed({ meetingId, url }: { meetingId: string; url: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "joined" | "error">("loading");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    setState("loading");
    setError("");
    (async () => {
      try {
        const info = await api.zoomSdk(meetingId);
        const { default: Zoom } = await import("@zoom/meetingsdk/embedded");
        if (cancelled || !root.current) return;
        const client = Zoom.createClient();
        destroy = () => {
          try {
            client.leaveMeeting();
          } catch {
            /* not in the meeting yet */
          }
          try {
            Zoom.destroyClient();
          } catch {
            /* already gone */
          }
        };
        const box = root.current;
        await client.init({
          zoomAppRoot: box,
          language: "en-US",
          patchJsMedia: true,
          customize: { video: { isResizable: false, viewSizes: { default: { width: box.clientWidth, height: Math.max(box.clientHeight - 56, 240) } } } },
        });
        await client.join({
          signature: info.signature,
          sdkKey: info.sdk_key,
          meetingNumber: info.meeting_number,
          password: info.password,
          userName: info.user_name,
        });
        if (!cancelled) setState("joined");
      } catch (e) {
        if (cancelled) return;
        const reason = e && typeof e === "object" && "reason" in e ? String((e as { reason: unknown }).reason) : e instanceof Error ? e.message : "";
        setError(reason || "Không vào được cuộc họp Zoom");
        setState("error");
      }
    })();
    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [meetingId, url, attempt]);

  return (
    <div className="zoom-embed">
      <div ref={root} className="zoom-root" />
      {state === "loading" && <div className="zoom-note muted">Đang kết nối Zoom…</div>}
      {state === "error" && (
        <div className="zoom-note">
          <div className="error">{error}</div>
          <div className="row" style={{ gap: 8, justifyContent: "center", marginTop: 10 }}>
            <button className="btn sm" onClick={() => setAttempt((n) => n + 1)}>Thử lại</button>
            <a className="btn sm" href={url} target="_blank" rel="noopener noreferrer">Mở bằng ứng dụng Zoom</a>
          </div>
        </div>
      )}
    </div>
  );
}
