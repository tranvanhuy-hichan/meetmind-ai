"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CreateDialog, JoinDialog } from "@/components/dialogs";
import { IconPlus, IconSearch } from "@/components/Icons";
import { MeetingTable } from "@/components/MeetingTable";
import { Shell } from "@/components/Shell";
import { api, NO_ROOMS } from "@/lib/api";
import { useRequireUser } from "@/lib/auth";
import type { MeetingSummary, OrgSummary } from "@/lib/types";

const FILTER_KEY = "meetmind.org";

export default function MeetingsPage() {
  const router = useRouter();
  const { user, logout, orgs: authOrgs } = useRequireUser();
  const [meetings, setMeetings] = useState<MeetingSummary[] | null>(null);
  const [orgs, setOrgs] = useState<OrgSummary[] | null>(authOrgs.length > 0 ? authOrgs : null);
  const [orgId, setOrgId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
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

  useEffect(() => {
    if (authOrgs.length > 0 && !orgs) {
      setOrgs(authOrgs);
    }
  }, [authOrgs, orgs]);

  const orgName = useMemo(() => new Map((orgs ?? []).map((o) => [o.id, o.name])), [orgs]);

  const filtered = useMemo(() => {
    if (meetings === null) return null;
    let list = meetings.filter((m) => !orgId || m.org_id === orgId);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((m) => {
        const titleMatch = m.title.toLowerCase().includes(q);
        const orgMatch = (orgName.get(m.org_id) ?? "").toLowerCase().includes(q);
        return titleMatch || orgMatch;
      });
    }
    return list;
  }, [meetings, orgId, searchQuery, orgName]);

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
        <div className="topline-greeting">
          <h1>Tất cả phiên họp</h1>
          <p>{filtered !== null ? `${filtered.length} phiên họp` : "Đang đồng bộ dữ liệu…"}</p>
        </div>

        <div className="topline-actions">
          <button className="btn" onClick={() => setDialog("join")}>
            Tham gia bằng mã
          </button>
          <button className="btn primary" disabled={!orgs?.length} onClick={() => setDialog("create")}>
            <IconPlus size={16} />
            Tạo phiên họp
          </button>
        </div>
      </div>

      <section className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="table-toolbar">
          <div className="table-toolbar-row" style={{ width: "100%", justifyContent: "space-between", gap: 10 }}>
            <div className="search-input-wrap" style={{ flex: 1, maxWidth: 320 }}>
              <span className="search-input-icon">
                <IconSearch size={14} />
              </span>
              <input
                type="text"
                placeholder="Tìm theo tên phiên…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {orgs && orgs.length > 1 && (
              <select
                className="select"
                value={orgId}
                onChange={(e) => pick(e.target.value)}
                aria-label="Lọc theo tổ chức"
                style={{ height: 34, fontSize: 13 }}
              >
                <option value="">Tất cả tổ chức</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <MeetingTable
          meetings={filtered}
          orgName={orgName}
          skeletonRows={6}
          empty={
            searchQuery
              ? `Không tìm thấy cuộc họp nào phù hợp với từ khóa "${searchQuery}".`
              : "Chưa có phiên họp nào. Tạo phiên mới, hoặc đợi lời mời gửi tới email của bạn."
          }
        />
      </section>

      {dialog === "create" && orgs && (
        <CreateDialog
          orgs={orgs}
          initialOrg={orgId}
          meetRooms={meetRooms}
          onClose={() => setDialog(null)}
          onDone={(m) => router.push(`/meetings/${m.id}`)}
        />
      )}
      {dialog === "join" && <JoinDialog onClose={() => setDialog(null)} onDone={(m) => router.push(`/meetings/${m.id}`)} />}
    </Shell>
  );
}
