"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/Dialog";
import { Shell } from "@/components/Shell";
import { avatarClass, IconBuilding, IconCaption, IconDoc, IconPlus, IconVideo, initials } from "@/components/Icons";
import { api } from "@/lib/api";
import { useRequireUser } from "@/lib/auth";
import { dateTime, ROLE_LABEL, STATUS_LABEL } from "@/lib/format";
import type { MeetingSummary, OrgSummary } from "@/lib/types";

const FILTER_KEY = "meetmind.org";

function greeting(hour: number): string {
  return hour < 11 ? "Chào buổi sáng" : hour < 18 ? "Chào buổi chiều" : "Chào buổi tối";
}

export default function MeetingsPage() {
  const router = useRouter();
  const { user, logout } = useRequireUser();
  const [meetings, setMeetings] = useState<MeetingSummary[] | null>(null);
  const [orgs, setOrgs] = useState<OrgSummary[] | null>(null);
  const [orgId, setOrgId] = useState<string>("");
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
    try {
      setOrgId(localStorage.getItem(FILTER_KEY) ?? "");
    } catch {
      /* no remembered filter */
    }
  }, [user, load]);

  const orgName = useMemo(() => new Map((orgs ?? []).map((o) => [o.id, o.name])), [orgs]);
  const shown = (meetings ?? []).filter((m) => !orgId || m.org_id === orgId);
  const isLive = (m: MeetingSummary) => m.status === "live" || m.status === "bot_joining";
  const live = shown.filter(isLive);
  const rest = shown.filter((m) => !isLive(m));
  const firstName = user?.name.trim().split(/\s+/).slice(-1)[0] ?? "";
  const noOrg = orgs !== null && orgs.length === 0;

  const pickOrg = (id: string) => {
    setOrgId(id);
    try {
      localStorage.setItem(FILTER_KEY, id);
    } catch {
      /* ignore */
    }
  };

  const stats = [
    { label: "Phiên họp", value: shown.length, icon: <IconVideo />, tone: "av-0" },
    { label: "Đang diễn ra", value: live.length, icon: <IconCaption />, tone: "av-5" },
    { label: "Đã có biên bản", value: shown.filter((m) => m.status === "ready").length, icon: <IconDoc />, tone: "av-4" },
    { label: "Tổ chức", value: orgs?.length ?? 0, icon: <IconBuilding />, tone: "av-3" },
  ];

  return (
    <Shell user={user} onLogout={logout} orgs={orgs ?? undefined}>
      {demo && <div className="notice warn bordered" style={{ marginBottom: 16 }}>Đang chạy ở chế độ demo: bot được giả lập bằng một cuộc họp mẫu, chưa kết nối Google Meet.</div>}

      <div className="topline">
        <div className="grow">
          <h1>{hello}, {firstName}</h1>
          <p>{noOrg ? "Tạo một tổ chức để bắt đầu." : live.length ? `${live.length} phiên đang diễn ra.` : "Chưa có phiên nào đang diễn ra."}</p>
        </div>
        {orgs && orgs.length > 1 && (
          <select className="select" value={orgId} onChange={(e) => pickOrg(e.target.value)} aria-label="Lọc theo tổ chức">
            <option value="">Tất cả tổ chức</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
        <button className="btn" onClick={() => setDialog("join")}>Tham gia bằng mã</button>
        {noOrg ? (
          <button className="btn primary" onClick={() => setDialog("org")}><IconPlus />Tạo tổ chức</button>
        ) : (
          <button className="btn primary" onClick={() => setDialog("create")}><IconPlus />Tạo phiên họp</button>
        )}
      </div>

      {noOrg ? (
        <div className="card" style={{ padding: 36 }}>
          <div className="avatar av-0" style={{ width: 52, height: 52, borderRadius: 16, marginBottom: 14 }}><IconBuilding /></div>
          <h2 style={{ fontSize: 20 }}>Bắt đầu bằng một tổ chức</h2>
          <p className="muted" style={{ maxWidth: 560 }}>
            Tổ chức là nơi gom thành viên và các phiên họp của công ty hay nhóm bạn. Tạo tổ chức, mời đồng nghiệp bằng email, rồi tạo phiên họp.
            Đang chờ lời mời? Nhờ quản trị viên gửi tới {user?.email}.
          </p>
        </div>
      ) : (
        <>
          <div className="statbar">
            {stats.map((s) => (
              <div className="stat" key={s.label}>
                <span className={`chip ${s.tone}`}>{s.icon}</span>
                <div><b className="num">{s.value}</b><span>{s.label}</span></div>
              </div>
            ))}
          </div>

          <div className="split">
            <section className="card">
              <div className="panel-head">
                <h2 className="grow">Tất cả phiên họp</h2>
                <span className="count">{shown.length}</span>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Phiên họp</th>
                    <th>Trạng thái</th>
                    <th>Vai trò</th>
                    <th>Tạo lúc</th>
                    <th style={{ width: 110 }} />
                  </tr>
                </thead>
                <tbody>
                  {meetings === null && <tr><td colSpan={5} className="muted">Đang tải…</td></tr>}
                  {meetings && shown.length === 0 && (
                    <tr><td colSpan={5} className="muted" style={{ padding: 28, textAlign: "center" }}>Chưa có phiên họp nào. Tạo phiên mới, hoặc đợi lời mời gửi tới email của bạn.</td></tr>
                  )}
                  {[...live, ...rest].map((m) => (
                    <tr key={m.id} className={`mrow ${isLive(m) ? "live" : ""}`}>
                      <td>
                        <Link href={`/meetings/${m.id}`} className="title">
                          <span className={`avatar ${avatarClass(m.title)}`}><IconVideo /></span>
                          <span>
                            <span style={{ display: "block" }}>{m.title}</span>
                            <span className="muted small" style={{ fontWeight: 500 }}>{orgName.get(m.org_id) ?? "Khách mời"}</span>
                          </span>
                        </Link>
                      </td>
                      <td><span className={`status ${m.status}`}>{STATUS_LABEL[m.status]}</span></td>
                      <td><span className="tag">{ROLE_LABEL[m.role]}</span></td>
                      <td className="num muted">{dateTime(m.created_at)}</td>
                      <td style={{ textAlign: "right" }}>
                        <Link href={`/meetings/${m.id}`} className={`btn sm ${isLive(m) ? "primary" : ""}`}>{isLive(m) ? "Vào phòng" : "Mở"}</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <aside className="rail">
              <section className="card">
                <div className="panel-head"><h2 className="grow">Tổ chức của bạn</h2><span className="count">{orgs?.length ?? 0}</span></div>
                {orgs?.map((o) => (
                  <Link key={o.id} href={`/orgs/${o.id}`} className="rail-row">
                    <span className={`avatar ${avatarClass(o.name)}`}>{initials(o.name)}</span>
                    <div className="grow">
                      <div className="truncate" style={{ fontWeight: 700 }}>{o.name}</div>
                      <div className="muted small">{(meetings ?? []).filter((m) => m.org_id === o.id).length} phiên · {o.role === "owner" ? "Chủ sở hữu" : o.role === "admin" ? "Quản trị viên" : "Thành viên"}</div>
                    </div>
                  </Link>
                ))}
                <button className="rail-row" style={{ width: "100%", border: 0, background: "transparent", cursor: "pointer", color: "var(--violet)", fontWeight: 700 }} onClick={() => setDialog("org")}>
                  <IconPlus />Tạo tổ chức mới
                </button>
              </section>
            </aside>
          </div>
        </>
      )}

      {dialog === "create" && orgs && (
        <CreateDialog orgs={orgs} initialOrg={orgId} meetRooms={meetRooms} onClose={() => setDialog(null)} onDone={(m) => router.push(`/meetings/${m.id}`)} />
      )}
      {dialog === "join" && <JoinDialog onClose={() => setDialog(null)} onDone={(m) => router.push(`/meetings/${m.id}`)} />}
      {dialog === "org" && <OrgDialog onClose={() => setDialog(null)} onDone={(o) => router.push(`/orgs/${o.id}`)} />}
    </Shell>
  );
}

function CreateDialog({ orgs, initialOrg, meetRooms, onClose, onDone }: { orgs: OrgSummary[]; initialOrg: string; meetRooms: boolean; onClose: () => void; onDone: (m: MeetingSummary) => void }) {
  const [org, setOrg] = useState(orgs.some((o) => o.id === initialOrg) ? initialOrg : orgs[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [makeRoom, setMakeRoom] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const wantRoom = meetRooms && makeRoom && !url.trim();

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const meeting = await api.createMeeting(org, title, url.trim() || null, null);
      if (wantRoom) {
        try {
          window.location.href = (await api.createMeetRoom(meeting.id)).authorize_url; // Google asks once, then sends the user back to the room
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
        <label htmlFor="u">Link Google Meet</label>
        <input id="u" className="input" placeholder="https://meet.google.com/abc-defg-hij" value={url} onChange={(e) => setUrl(e.target.value)} />
        {meetRooms ? (
          <label className="row small" style={{ gap: 8 }}>
            <input type="checkbox" checked={makeRoom} disabled={!!url.trim()} onChange={(e) => setMakeRoom(e.target.checked)} />
            Để MeetMind tạo phòng Google Meet cho tôi (Google sẽ hỏi quyền một lần)
          </label>
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

function OrgDialog({ onClose, onDone }: { onClose: () => void; onDone: (o: OrgSummary) => void }) {
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

function JoinDialog({ onClose, onDone }: { onClose: () => void; onDone: (m: MeetingSummary) => void }) {
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
