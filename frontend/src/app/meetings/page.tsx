"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CreateDialog, JoinDialog } from "@/components/dialogs";
import { IconPlus } from "@/components/Icons";
import { MeetingTable } from "@/components/MeetingTable";
import { Shell } from "@/components/Shell";
import { api, NO_ROOMS } from "@/lib/api";
import { useRequireUser } from "@/lib/auth";
import type { MeetingSummary, OrgSummary } from "@/lib/types";

const FILTER_KEY = "meetmind.org";

export default function MeetingsPage() {
  const router = useRouter();
  const { user, logout } = useRequireUser();
  const [meetings, setMeetings] = useState<MeetingSummary[] | null>(null);
  const [orgs, setOrgs] = useState<OrgSummary[] | null>(null);
  const [orgId, setOrgId] = useState("");
  const [meetRooms, setMeetRooms] = useState(NO_ROOMS);
  const [dialog, setDialog] = useState<"create" | "join" | null>(null);

  const load = useCallback(() => {
    api.listMeetings().then(setMeetings).catch(() => setMeetings([]));
    api.listOrgs().then(setOrgs).catch(() => setOrgs([]));
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
    api.config().then((c) => setMeetRooms({ meet: c.meet_rooms, zoom: c.zoom_rooms })).catch(() => {});
    try {
      setOrgId(localStorage.getItem(FILTER_KEY) ?? "");
    } catch {
      /* no remembered filter */
    }
  }, [user, load]);

  const orgName = useMemo(() => new Map((orgs ?? []).map((o) => [o.id, o.name])), [orgs]);
  const shown = meetings === null ? null : meetings.filter((m) => !orgId || m.org_id === orgId);

  const pick = (id: string) => {
    setOrgId(id);
    try {
      localStorage.setItem(FILTER_KEY, id);
    } catch {
      /* ignore */
    }
  };

  return (
    <Shell user={user} onLogout={logout}>
      <div className="topline">
        <div className="grow">
          <h1>Phiên họp</h1>
          <p>{shown ? `${shown.length} phiên` : "Đang tải…"}</p>
        </div>
        {orgs && orgs.length > 1 && (
          <select className="select" value={orgId} onChange={(e) => pick(e.target.value)} aria-label="Lọc theo tổ chức">
            <option value="">Tất cả tổ chức</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
        <button className="btn" onClick={() => setDialog("join")}>Tham gia bằng mã</button>
        <button className="btn primary" disabled={!orgs?.length} onClick={() => setDialog("create")}><IconPlus />Tạo phiên họp</button>
      </div>

      <section className="card">
        <MeetingTable meetings={shown} orgName={orgName} empty="Chưa có phiên họp nào. Tạo phiên mới, hoặc đợi lời mời gửi tới email của bạn." />
      </section>

      {dialog === "create" && orgs && <CreateDialog orgs={orgs} initialOrg={orgId} meetRooms={meetRooms} onClose={() => setDialog(null)} onDone={(m) => router.push(`/meetings/${m.id}`)} />}
      {dialog === "join" && <JoinDialog onClose={() => setDialog(null)} onDone={(m) => router.push(`/meetings/${m.id}`)} />}
    </Shell>
  );
}
