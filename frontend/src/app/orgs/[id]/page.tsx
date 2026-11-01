"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { avatarClass, IconUsers, initials } from "@/components/Icons";
import { InviteBox } from "@/components/InviteBox";
import { api } from "@/lib/api";
import { useRequireUser } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import type { OrgDetail, OrgRole } from "@/lib/types";

const ROLE_LABEL: Record<OrgRole, string> = { owner: "Chủ sở hữu", admin: "Quản trị viên", member: "Thành viên" };

export default function OrgPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { user, logout } = useRequireUser();
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");

  const load = useCallback(
    () => api.getOrg(params.id).then(setOrg).catch((e) => setError(e instanceof Error ? e.message : "Không mở được tổ chức")),
    [params.id],
  );

  useEffect(() => {
    if (user) load();
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

  if (!user) return null;
  const manage = org?.role === "owner" || org?.role === "admin";
  const isOwner = org?.role === "owner";
  const inviteRoles = isOwner
    ? [{ value: "member", label: "Thành viên" }, { value: "admin", label: "Quản trị viên" }]
    : [{ value: "member", label: "Thành viên" }];

  return (
    <Shell user={user} onLogout={logout}>
      <div className="crumbs"><Link href="/">Phiên họp</Link> / <span>Tổ chức</span></div>
      {error && (
        <div className="card" style={{ padding: 28, marginTop: 14 }}>
          <h1>Không mở được tổ chức</h1>
          <p className="muted">{error}</p>
          <Link className="btn" href="/">Về danh sách phiên họp</Link>
        </div>
      )}
      {org && (
        <>
          <div className="topline" style={{ marginTop: 10 }}>
            <span className={`avatar ${avatarClass(org.name)}`} style={{ width: 48, height: 48, borderRadius: 15, fontSize: 16 }}>{initials(org.name)}</span>
            <div className="grow">
              <h1>{org.name}</h1>
              <p>{org.members.length} thành viên{manage ? ` · ${org.pending.length} lời mời đang chờ` : ""}</p>
            </div>
            <span className={`tag ${manage ? "accent" : ""}`}>{ROLE_LABEL[org.role]}</span>
          </div>

          {actionError && <div className="notice warn bordered" style={{ marginBottom: 14 }}>{actionError}</div>}

          <div className="split">
            <section className="card">
              <div className="panel-head"><h2 className="grow">Thành viên</h2><span className="count">{org.members.length}</span></div>
              {org.members.map((m) => {
                const self = m.user_id === user.id;
                const canRemove = self || (manage && (isOwner || m.role === "member"));
                return (
                  <div className="member-row" key={m.user_id}>
                    <span className={`avatar ${avatarClass(m.name)}`}>{initials(m.name)}</span>
                    <div className="grow">
                      <div className="truncate" style={{ fontWeight: 700 }}>{m.name}{self && <span className="muted"> (bạn)</span>}</div>
                      <div className="muted small truncate">{m.email}</div>
                    </div>
                    {isOwner ? (
                      <select className="select" value={m.role} aria-label={`Vai trò của ${m.name}`} onChange={(e) => act(() => api.setOrgRole(org.id, m.user_id, e.target.value))}>
                        {(Object.keys(ROLE_LABEL) as OrgRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                    ) : (
                      <span className={`tag ${m.role !== "member" ? "accent" : ""}`}>{ROLE_LABEL[m.role]}</span>
                    )}
                    {canRemove && (
                      <button
                        className="btn sm ghost danger"
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
                );
              })}
            </section>

            {manage && (
              <aside className="rail">
                <section className="card">
                  <div className="panel-head"><h2>Mời bằng email</h2></div>
                  <div style={{ padding: 16 }}>
                    <p className="muted small" style={{ marginTop: 0 }}>
                      Người đã có tài khoản được thêm ngay; người chưa có sẽ vào tổ chức khi đăng nhập lần đầu bằng đúng địa chỉ đó.
                    </p>
                    <InviteBox
                      roles={inviteRoles}
                      onInvite={async (emails, role) => {
                        const res = await api.inviteToOrg(org.id, emails, role);
                        await load();
                        return res;
                      }}
                    />
                  </div>
                </section>

                <section className="card">
                  <div className="panel-head"><h2 className="grow">Lời mời đang chờ</h2><span className="count">{org.pending.length}</span></div>
                  {org.pending.length === 0 && <div className="muted small" style={{ padding: 16 }}>Không có lời mời nào đang chờ.</div>}
                  {org.pending.map((p) => (
                    <div className="pending-row" key={p.id}>
                      <span className="avatar av-4">{initials(p.email)}</span>
                      <div className="grow">
                        <div className="truncate" style={{ fontWeight: 650 }}>{p.email}</div>
                        <div className="muted small">{ROLE_LABEL[p.role]} · {dateTime(p.created_at)}</div>
                      </div>
                      <button className="btn sm ghost danger" onClick={() => act(() => api.revokeOrgInvite(org.id, p.id))}>Thu hồi</button>
                    </div>
                  ))}
                </section>
              </aside>
            )}
          </div>
        </>
      )}
    </Shell>
  );
}
