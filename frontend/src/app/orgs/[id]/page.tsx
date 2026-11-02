"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CreateDialog } from "@/components/dialogs";
import { Dialog } from "@/components/Dialog";
import { avatarClass, IconCaption, IconDoc, IconMail, IconPlus, IconSearch, IconUsers, IconVideo, initials } from "@/components/Icons";
import { InviteBox } from "@/components/InviteBox";
import { isLive, MeetingTable } from "@/components/MeetingTable";
import { Shell } from "@/components/Shell";
import { OrgDetailSkeleton } from "@/components/Skeleton";
import { api, NO_ROOMS } from "@/lib/api";
import { useRequireUser } from "@/lib/auth";
import { dateShort, dateTime } from "@/lib/format";
import type { MeetingSummary, OrgDetail, OrgRole, OrgSummary } from "@/lib/types";

const ROLE_LABEL: Record<OrgRole, string> = { owner: "Chủ sở hữu", admin: "Quản trị viên", member: "Thành viên" };
type Tab = "overview" | "members" | "meetings" | "settings";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Tổng quan" },
  { id: "members", label: "Thành viên" },
  { id: "meetings", label: "Phiên họp" },
  { id: "settings", label: "Cài đặt" },
];

export default function OrgPage({ params }: { params: { id: string } }) {
  return (
    <Suspense>
      <OrgView id={params.id} />
    </Suspense>
  );
}

function OrgView({ id }: { id: string }) {
  const router = useRouter();
  const query = useSearchParams();
  const { user, logout } = useRequireUser();
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [meetings, setMeetings] = useState<MeetingSummary[] | null>(null);
  const [allOrgs, setAllOrgs] = useState<OrgSummary[]>([]);
  const [meetRooms, setMeetRooms] = useState(NO_ROOMS);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [dialog, setDialog] = useState<"invite" | "meeting" | null>(null);
  const [search, setSearch] = useState("");

  const tab: Tab = TABS.some((t) => t.id === query.get("tab")) ? (query.get("tab") as Tab) : "overview";
  const goTab = (t: Tab) => router.replace(`/orgs/${id}?tab=${t}`, { scroll: false });

  const load = useCallback(
    () => api.getOrg(id).then(setOrg).catch((e) => setError(e instanceof Error ? e.message : "Không mở được tổ chức")),
    [id],
  );

  useEffect(() => {
    if (!user) return;
    load();
    api.listMeetings().then(setMeetings).catch(() => setMeetings([]));
    api.listOrgs().then(setAllOrgs).catch(() => {});
    api.config().then((c) => setMeetRooms({ meet: c.meet_rooms, zoom: c.zoom_rooms })).catch(() => {});
  }, [user, load]);

  async function act(action: () => Promise<unknown>) {
    setActionError("");
    try {
      await action();
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Thao tác không thành công");
    }
  }

  const mine = useMemo(() => (meetings ?? []).filter((m) => m.org_id === id), [meetings, id]);

  const manage = org?.role === "owner" || org?.role === "admin";
  const isOwner = org?.role === "owner";
  const inviteRoles = isOwner
    ? [{ value: "member", label: "Thành viên" }, { value: "admin", label: "Quản trị viên" }]
    : [{ value: "member", label: "Thành viên" }];

  return (
    <Shell user={user} onLogout={logout}>
      {error && (
        <div className="card" style={{ padding: 28, marginTop: 14 }}>
          <h1>Không mở được tổ chức</h1>
          <p className="muted">{error}</p>
          <Link className="btn" href="/">Về trang chủ</Link>
        </div>
      )}

      {!org && !error && <OrgDetailSkeleton />}

      {org && (
        <>
          <div className="topline" style={{ marginTop: 10, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 }}>
              <span className={`avatar lg ${avatarClass(org.name)}`} style={{ flexShrink: 0 }}>
                {initials(org.name)}
              </span>
              <div className="grow truncate">
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <h1 className="truncate" style={{ fontSize: 22 }}>
                    {org.name}
                  </h1>
                  <span className={`tag ${manage ? "accent" : ""}`}>{ROLE_LABEL[org.role]}</span>
                </div>
                <p style={{ marginTop: 2 }}>
                  {org.members.length} thành viên · {mine.length} phiên họp · tạo ngày {dateShort(org.created_at)}
                </p>
              </div>
            </div>

            <div className="topline-actions">
              {manage && (
                <button className="btn" onClick={() => setDialog("invite")}>
                  <IconUsers size={16} />
                  Mời thành viên
                </button>
              )}
              <button className="btn primary" onClick={() => setDialog("meeting")}>
                <IconPlus size={16} />
                Tạo phiên họp
              </button>
            </div>
          </div>

          <div className="page-tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "active" : ""} onClick={() => goTab(t.id)}>
                {t.label}
                {t.id === "members" && <span className="count">{org.members.length}</span>}
                {t.id === "meetings" && <span className="count">{mine.length}</span>}
              </button>
            ))}
          </div>

          {actionError && <div className="notice warn bordered" style={{ margin: "14px 0" }}>{actionError}</div>}

          {tab === "overview" && (
            <div className="split" style={{ marginTop: 18 }}>
              <div className="col" style={{ gap: 18 }}>
                <div className="statbar" style={{ marginBottom: 0 }}>
                  <div className="stat"><span className="chip av-3"><IconUsers /></span><div><b className="num">{org.members.length}</b><span>Thành viên</span></div></div>
                  <div className="stat"><span className="chip av-0"><IconVideo /></span><div><b className="num">{mine.length}</b><span>Phiên họp</span></div></div>
                  <div className="stat"><span className="chip av-5"><IconCaption /></span><div><b className="num">{mine.filter(isLive).length}</b><span>Đang diễn ra</span></div></div>
                  <div className="stat"><span className="chip av-4"><IconDoc /></span><div><b className="num">{mine.filter((m) => m.status === "ready").length}</b><span>Đã có biên bản</span></div></div>
                </div>

                <section className="card">
                  <div className="panel-head"><h2 className="grow">Phiên họp gần đây</h2><button className="btn sm ghost" onClick={() => goTab("meetings")}>Xem tất cả</button></div>
                  <MeetingTable meetings={meetings === null ? null : mine.slice(0, 5)} empty="Tổ chức này chưa có phiên họp nào." />
                </section>
              </div>

              <aside className="rail">
                <section className="card">
                  <div className="panel-head"><h2>Thông tin cơ bản</h2></div>
                  <dl className="dl">
                    <div><dt>Tên tổ chức</dt><dd>{org.name}</dd></div>
                    <div><dt>Chủ sở hữu</dt><dd>{org.members.filter((m) => m.role === "owner").map((m) => m.name).join(", ") || "—"}</dd></div>
                    <div><dt>Ngày tạo</dt><dd>{dateShort(org.created_at)}</dd></div>
                    <div><dt>Vai trò của bạn</dt><dd>{ROLE_LABEL[org.role]}</dd></div>
                    <div><dt>Quản trị viên</dt><dd>{org.members.filter((m) => m.role !== "member").length}</dd></div>
                    {manage && <div><dt>Lời mời đang chờ</dt><dd>{org.pending.length}</dd></div>}
                  </dl>
                </section>

                <section className="card">
                  <div className="panel-head"><h2 className="grow">Thành viên</h2><button className="btn sm ghost" onClick={() => goTab("members")}>Xem tất cả</button></div>
                  <div style={{ padding: 16 }}>
                    <div className="avatar-stack" style={{ marginBottom: 12 }}>
                      {org.members.slice(0, 8).map((m) => <span key={m.user_id} className={`avatar ${avatarClass(m.name)}`} title={m.name}>{initials(m.name)}</span>)}
                    </div>
                    {manage && <button className="btn sm" onClick={() => setDialog("invite")}><IconUsers />Mời thành viên</button>}
                  </div>
                </section>
              </aside>
            </div>
          )}

          {tab === "members" && (
            <div className="col" style={{ gap: 18, marginTop: 18 }}>
              <section className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div className="table-toolbar" style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", justifyContent: "space-between" }}>
                    <div className="search-input-wrap" style={{ flex: 1, maxWidth: 320 }}>
                      <span className="search-input-icon">
                        <IconSearch size={14} />
                      </span>
                      <input
                        type="text"
                        placeholder="Tìm theo tên hoặc email…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        aria-label="Tìm thành viên"
                      />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <span className="count" title="Tổng số thành viên">{org.members.length}</span>
                      {manage && (
                        <button className="btn primary sm" onClick={() => setDialog("invite")}>
                          <IconUsers size={15} />
                          <span>Mời</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {org.members
                  .filter((m) => !search.trim() || `${m.name} ${m.email}`.toLowerCase().includes(search.trim().toLowerCase()))
                  .map((m) => {
                    const self = user ? m.user_id === user.id : false;
                    const canRemove = self || (manage && (isOwner || m.role === "member"));
                    return (
                      <div className="member-row" key={m.user_id}>
                        <div className="member-row-profile">
                          <span className={`avatar ${avatarClass(m.name)}`} style={{ flexShrink: 0 }}>
                            {initials(m.name)}
                          </span>
                          <div className="grow truncate">
                            <div className="member-name truncate">
                              <b>{m.name}</b>
                              {self && <span className="muted small"> (bạn)</span>}
                            </div>
                            <div className="muted small truncate">{m.email}</div>
                          </div>
                        </div>

                        <div className="member-row-actions">
                          {isOwner ? (
                            <select
                              className="select sm member-role-select"
                              value={m.role}
                              aria-label={`Vai trò của ${m.name}`}
                              onChange={(e) => act(() => api.setOrgRole(org.id, m.user_id, e.target.value))}
                            >
                              {(Object.keys(ROLE_LABEL) as OrgRole[]).map((r) => (
                                <option key={r} value={r}>
                                  {ROLE_LABEL[r]}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className={`tag ${m.role !== "member" ? "accent" : ""}`}>{ROLE_LABEL[m.role]}</span>
                          )}
                          {canRemove && (
                            <button
                              className="btn sm ghost danger"
                              style={{ height: 32, padding: "0 12px", fontSize: 12.5 }}
                              onClick={() => {
                                if (!window.confirm(self ? `Rời tổ chức "${org.name}"?` : `Xóa ${m.name} khỏi tổ chức?`)) return;
                                act(async () => {
                                  await api.removeOrgMember(org.id, m.user_id);
                                  if (self) router.push("/");
                                });
                              }}
                            >
                              {self ? "Rời" : "Xóa"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </section>

              {manage && (
                <section className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <div className="panel-head" style={{ borderBottom: "1px solid var(--line)", padding: "14px 18px" }}>
                    <h2 className="grow" style={{ fontSize: 15.5 }}>Lời mời đang chờ</h2>
                    <span className="count">{org.pending.length}</span>
                  </div>
                  {org.pending.length === 0 ? (
                    <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--muted)" }}>
                      <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                        <IconMail size={28} style={{ opacity: 0.5, color: "var(--muted)" }} />
                        <strong style={{ fontSize: 14 }}>Không có lời mời nào đang chờ</strong>
                        <span className="small muted" style={{ maxWidth: 360 }}>
                          Người được mời sẽ tự động tham gia tổ chức khi đăng nhập bằng đúng địa chỉ email đã mời.
                        </span>
                      </div>
                    </div>
                  ) : (
                    org.pending.map((p) => (
                      <div className="pending-row" key={p.id}>
                        <span className="avatar av-4">{initials(p.email)}</span>
                        <div className="grow">
                          <div className="truncate" style={{ fontWeight: 650 }}>{p.email}</div>
                          <div className="muted small">{ROLE_LABEL[p.role]} · mời lúc {dateTime(p.created_at)}</div>
                        </div>
                        <button className="btn sm ghost danger" onClick={() => act(() => api.revokeOrgInvite(org.id, p.id))}>Thu hồi</button>
                      </div>
                    ))
                  )}
                </section>
              )}
            </div>
          )}

          {tab === "meetings" && (
            <section className="card" style={{ marginTop: 18 }}>
              <MeetingTable meetings={meetings === null ? null : mine} empty="Tổ chức này chưa có phiên họp nào. Bấm “Tạo phiên họp” để bắt đầu." />
            </section>
          )}

          {tab === "settings" && <Settings org={org} manage={manage} onRenamed={load} onLeave={() => act(async () => { if (user) { await api.removeOrgMember(org.id, user.id); } router.push("/"); })} />}
        </>
      )}

      {dialog === "invite" && org && (
        <Dialog title="Mời thành viên" onClose={() => setDialog(null)} footer={<button type="button" className="btn" onClick={() => setDialog(null)}>Xong</button>}>
          <p className="muted small" style={{ margin: 0 }}>
            Nhập một hoặc nhiều email. Người đã có tài khoản được thêm ngay; người chưa có sẽ vào tổ chức khi đăng nhập lần đầu bằng đúng địa chỉ đó.
          </p>
          <InviteBox
            roles={inviteRoles}
            onInvite={async (emails, role) => {
              const res = await api.inviteToOrg(org.id, emails, role);
              await load();
              return res;
            }}
          />
        </Dialog>
      )}
      {dialog === "meeting" && org && (
        <CreateDialog
          orgs={allOrgs.length ? allOrgs : [{ id: org.id, name: org.name, role: org.role, created_at: org.created_at, member_count: org.members.length }]}
          initialOrg={org.id}
          meetRooms={meetRooms}
          onClose={() => setDialog(null)}
          onDone={(m) => router.push(`/meetings/${m.id}`)}
        />
      )}
    </Shell>
  );
}

function Settings({ org, manage, onRenamed, onLeave }: { org: OrgDetail; manage: boolean; onRenamed: () => void; onLeave: () => void }) {
  const [name, setName] = useState(org.name);
  const [state, setState] = useState<"idle" | "saving" | "saved" | string>("idle");

  async function save() {
    setState("saving");
    try {
      await api.renameOrg(org.id, name);
      await onRenamed();
      setState("saved");
    } catch (e) {
      setState(e instanceof Error ? e.message : "Không lưu được");
    }
  }

  return (
    <div className="col" style={{ gap: 18, marginTop: 18, maxWidth: 720 }}>
      <section className="card">
        <div className="panel-head"><h2>Thông tin tổ chức</h2></div>
        <div style={{ padding: 18 }} className="col">
          <div className="field">
            <label htmlFor="org-name">Tên tổ chức</label>
            <div className="row">
              <input id="org-name" className="input" value={name} disabled={!manage} onChange={(e) => { setName(e.target.value); setState("idle"); }} />
              {manage && <button className="btn primary" disabled={state === "saving" || !name.trim() || name.trim() === org.name} onClick={save}>Lưu</button>}
            </div>
            {!manage && <span className="muted small">Chỉ chủ sở hữu hoặc quản trị viên đổi được tên.</span>}
            {state === "saved" && <span className="muted small">Đã lưu.</span>}
            {state !== "idle" && state !== "saved" && state !== "saving" && <span className="error">{state}</span>}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="panel-head"><h2>Rời tổ chức</h2></div>
        <div style={{ padding: 18 }}>
          <p className="muted" style={{ marginTop: 0 }}>
            Bạn sẽ không còn thấy tổ chức này. Tổ chức phải còn ít nhất một chủ sở hữu, nên chủ sở hữu cuối cùng không rời được.
          </p>
          <button className="btn danger" onClick={() => window.confirm(`Rời tổ chức "${org.name}"?`) && onLeave()}>Rời tổ chức</button>
        </div>
      </section>
    </div>
  );
}
