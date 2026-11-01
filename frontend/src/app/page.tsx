"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreateDialog, JoinDialog, OrgDialog } from "@/components/dialogs";
import { avatarClass, IconBuilding, IconCaption, IconDoc, IconPlus, IconVideo, initials } from "@/components/Icons";
import { isLive, MeetingTable } from "@/components/MeetingTable";
import { Shell } from "@/components/Shell";
import { api } from "@/lib/api";
import { useRequireUser } from "@/lib/auth";
import { dateShort } from "@/lib/format";
import type { MeetingSummary, OrgSummary } from "@/lib/types";

const ROLE: Record<string, string> = { owner: "Chủ sở hữu", admin: "Quản trị viên", member: "Thành viên" };

function greeting(hour: number): string {
  return hour < 11 ? "Chào buổi sáng" : hour < 18 ? "Chào buổi chiều" : "Chào buổi tối";
}

export default function HomePage() {
  const router = useRouter();
  const { user, logout } = useRequireUser();
  const [meetings, setMeetings] = useState<MeetingSummary[] | null>(null);
  const [orgs, setOrgs] = useState<OrgSummary[] | null>(null);
  const [demo, setDemo] = useState(false);
  const [meetRooms, setMeetRooms] = useState(false);
  const [hello, setHello] = useState("Xin chào"); // the time of day is only known in the browser
  const [dialog, setDialog] = useState<"create" | "join" | "org" | null>(null);

  const load = useCallback(() => {
    api.listMeetings().then(setMeetings).catch(() => setMeetings([]));
    api.listOrgs().then(setOrgs).catch(() => setOrgs([]));
  }, []);

  useEffect(() => {
    if (!user) return;
    setHello(greeting(new Date().getHours()));
    load();
    api.config().then((c) => { setDemo(c.demo); setMeetRooms(c.meet_rooms); }).catch(() => {});
  }, [user, load]);

  const all = meetings ?? [];
  const live = all.filter(isLive);
  const recent = all.filter((m) => !isLive(m)).slice(0, 6);
  const orgName = useMemo(() => new Map((orgs ?? []).map((o) => [o.id, o.name])), [orgs]);
  const firstName = user?.name.trim().split(/\s+/).slice(-1)[0] ?? "";
  const noOrg = orgs !== null && orgs.length === 0;

  const stats = [
    { label: "Tổ chức", value: orgs?.length ?? 0, icon: <IconBuilding />, tone: "av-3" },
    { label: "Phiên họp", value: all.length, icon: <IconVideo />, tone: "av-0" },
    { label: "Đang diễn ra", value: live.length, icon: <IconCaption />, tone: "av-5" },
    { label: "Đã có biên bản", value: all.filter((m) => m.status === "ready").length, icon: <IconDoc />, tone: "av-4" },
  ];

  return (
    <Shell user={user} onLogout={logout}>
      {demo && <div className="notice warn bordered" style={{ marginBottom: 16 }}>Đang chạy ở chế độ demo: bot được giả lập bằng một cuộc họp mẫu, chưa kết nối Google Meet.</div>}

      <div className="topline">
        <div className="grow">
          <h1>{hello}, {firstName}</h1>
          <p>{noOrg ? "Tạo một tổ chức để bắt đầu." : live.length ? `${live.length} phiên đang diễn ra.` : "Chưa có phiên nào đang diễn ra."}</p>
        </div>
        <button className="btn" onClick={() => setDialog("join")}>Tham gia bằng mã</button>
        <button className="btn primary" disabled={noOrg} onClick={() => setDialog("create")}><IconPlus />Tạo phiên họp</button>
      </div>

      <div className="statbar">
        {stats.map((s) => (
          <div className="stat" key={s.label}>
            <span className={`chip ${s.tone}`}>{s.icon}</span>
            <div><b className="num">{s.value}</b><span>{s.label}</span></div>
          </div>
        ))}
      </div>

      <div className="section-head">
        <h2>Tổ chức của bạn</h2>
        <span className="count">{orgs?.length ?? 0}</span>
        <div className="grow" />
        <button className="btn sm" onClick={() => setDialog("org")}><IconPlus />Thêm tổ chức</button>
      </div>

      {noOrg ? (
        <div className="card" style={{ padding: 36 }}>
          <div className="avatar av-0" style={{ width: 52, height: 52, borderRadius: 16, marginBottom: 14 }}><IconBuilding /></div>
          <h2 style={{ fontSize: 20 }}>Bắt đầu bằng một tổ chức</h2>
          <p className="muted" style={{ maxWidth: 560 }}>
            Tổ chức là nơi gom thành viên và các phiên họp của công ty hay nhóm bạn. Tạo tổ chức, mời đồng nghiệp bằng email, rồi tạo phiên họp.
            Đang chờ lời mời? Nhờ quản trị viên gửi tới {user?.email}.
          </p>
          <button className="btn primary" onClick={() => setDialog("org")}><IconPlus />Tạo tổ chức</button>
        </div>
      ) : (
        <div className="org-grid">
          {orgs?.map((o) => {
            const mine = all.filter((m) => m.org_id === o.id);
            const liveCount = mine.filter(isLive).length;
            return (
              <Link key={o.id} href={`/orgs/${o.id}`} className="org-tile">
                <div className="row">
                  <span className={`avatar lg ${avatarClass(o.name)}`}>{initials(o.name)}</span>
                  <div className="grow">
                    <strong className="clamp2" style={{ fontSize: 16, lineHeight: 1.25 }}>{o.name}</strong>
                    <span className="muted small">Tạo ngày {dateShort(o.created_at)}</span>
                  </div>
                  <span className={`tag ${o.role !== "member" ? "accent" : ""}`}>{ROLE[o.role]}</span>
                </div>
                <div className="org-facts">
                  <div><b className="num">{o.member_count}</b><span>Thành viên</span></div>
                  <div><b className="num">{mine.length}</b><span>Phiên họp</span></div>
                  <div><b className={`num ${liveCount ? "live" : ""}`}>{liveCount}</b><span>Đang họp</span></div>
                </div>
              </Link>
            );
          })}
          <button className="org-tile add" onClick={() => setDialog("org")}>
            <IconPlus />
            <span>Thêm tổ chức mới</span>
          </button>
        </div>
      )}

      {!noOrg && (
        <div className="grid-2" style={{ marginTop: 24 }}>
          <section className="card">
            <div className="panel-head"><h2 className="grow">Đang diễn ra</h2><span className="count">{live.length}</span></div>
            <MeetingTable meetings={meetings === null ? null : live} orgName={orgName} empty="Không có phiên nào đang diễn ra." />
          </section>
          <section className="card">
            <div className="panel-head">
              <h2 className="grow">Gần đây</h2>
              <Link href="/meetings" className="small" style={{ fontWeight: 700 }}>Xem tất cả</Link>
            </div>
            <MeetingTable meetings={meetings === null ? null : recent} orgName={orgName} empty="Chưa có phiên họp nào." />
          </section>
        </div>
      )}

      {dialog === "create" && orgs && <CreateDialog orgs={orgs} initialOrg="" meetRooms={meetRooms} onClose={() => setDialog(null)} onDone={(m) => router.push(`/meetings/${m.id}`)} />}
      {dialog === "join" && <JoinDialog onClose={() => setDialog(null)} onDone={(m) => router.push(`/meetings/${m.id}`)} />}
      {dialog === "org" && <OrgDialog onClose={() => setDialog(null)} onDone={(o) => router.push(`/orgs/${o.id}`)} />}
    </Shell>
  );
}
