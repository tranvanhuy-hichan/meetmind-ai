"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreateDialog, JoinDialog, OrgDialog } from "@/components/dialogs";
import {
  avatarClass,
  IconBuilding,
  IconCaption,
  IconCheck,
  IconDoc,
  IconPlus,
  IconSearch,
  IconSparkles,
  IconTranslate,
  IconUsers,
  IconVideo,
  initials,
} from "@/components/Icons";
import { isLive, MeetingTable } from "@/components/MeetingTable";
import { Shell } from "@/components/Shell";
import { StatCardsSkeleton, OrgGridSkeleton } from "@/components/Skeleton";
import { api, NO_ROOMS } from "@/lib/api";
import { useRequireUser } from "@/lib/auth";
import { dateShort, PLATFORM_LABEL } from "@/lib/format";
import type { MeetingSummary, OrgSummary } from "@/lib/types";

const ROLE: Record<string, string> = { owner: "Chủ sở hữu", admin: "Quản trị viên", member: "Thành viên" };

function greeting(hour: number): string {
  return hour < 11 ? "Chào buổi sáng" : hour < 18 ? "Chào buổi chiều" : "Chào buổi tối";
}

type MeetingTab = "recent" | "ready" | "all";

export default function HomePage() {
  const router = useRouter();
  const { user, logout, orgs: authOrgs, refreshOrgs } = useRequireUser();
  const [meetings, setMeetings] = useState<MeetingSummary[] | null>(null);
  const [orgs, setOrgs] = useState<OrgSummary[] | null>(authOrgs.length > 0 ? authOrgs : null);
  const [demo, setDemo] = useState(false);
  const [meetRooms, setMeetRooms] = useState(NO_ROOMS);
  const [hello, setHello] = useState("Xin chào");
  const [dialog, setDialog] = useState<"create" | "join" | "org" | null>(null);
  const [activeTab, setActiveTab] = useState<MeetingTab>("recent");
  const [searchQuery, setSearchQuery] = useState("");

  const load = useCallback(() => {
    api.listMeetings().then(setMeetings).catch(() => setMeetings([]));
    api
      .listOrgs()
      .then((res) => {
        setOrgs(res);
      })
      .catch(() => setOrgs([]));
  }, []);

  useEffect(() => {
    if (!user) return;
    setHello(greeting(new Date().getHours()));
    load();
    api
      .config()
      .then((c) => {
        setDemo(c.demo);
        setMeetRooms({ meet: c.meet_rooms, zoom: c.zoom_rooms });
      })
      .catch(() => {});
  }, [user, load]);

  // Keep orgs in sync if auth context updates
  useEffect(() => {
    if (authOrgs.length > 0 && !orgs) {
      setOrgs(authOrgs);
    }
  }, [authOrgs, orgs]);

  const all = useMemo(() => meetings ?? [], [meetings]);
  const live = useMemo(() => all.filter(isLive), [all]);
  const readyMeetings = useMemo(() => all.filter((m) => m.status === "ready"), [all]);
  const recentMeetings = useMemo(() => all.filter((m) => !isLive(m)).slice(0, 10), [all]);

  const orgName = useMemo(() => new Map((orgs ?? []).map((o) => [o.id, o.name])), [orgs]);
  const firstName = user?.name ? user.name.trim().split(/\s+/).slice(-1)[0] : "";
  const noOrg = orgs !== null && orgs.length === 0;

  // Filtered meetings according to tab and search query
  const displayedMeetings = useMemo(() => {
    if (meetings === null) return null;
    let list: MeetingSummary[] = [];
    if (activeTab === "recent") {
      list = live.length > 0 ? [...live, ...recentMeetings.filter((m) => !isLive(m))] : recentMeetings;
    } else if (activeTab === "ready") {
      list = readyMeetings;
    } else {
      list = all;
    }

    if (!searchQuery.trim()) return list;

    const q = searchQuery.toLowerCase().trim();
    return list.filter((m) => {
      const matchTitle = m.title.toLowerCase().includes(q);
      const matchOrg = (orgName.get(m.org_id) ?? "").toLowerCase().includes(q);
      return matchTitle || matchOrg;
    });
  }, [meetings, activeTab, live, recentMeetings, readyMeetings, all, searchQuery, orgName]);

  const stats = [
    { label: "Tổ chức", value: orgs?.length ?? 0, icon: <IconBuilding />, tone: "av-3" },
    { label: "Tổng phiên họp", value: all.length, icon: <IconVideo />, tone: "av-0" },
    { label: "Đang diễn ra", value: live.length, icon: <IconCaption />, tone: "av-5", isLive: live.length > 0 },
    { label: "Đã có biên bản", value: readyMeetings.length, icon: <IconDoc />, tone: "av-4" },
  ];

  const handleOrgCreated = (o: OrgSummary) => {
    setDialog(null);
    refreshOrgs();
    load();
    router.push(`/orgs/${o.id}`);
  };

  return (
    <Shell user={user} onLogout={logout}>
      {demo && (
        <div className="notice warn bordered" style={{ marginBottom: 20 }}>
          Đang chạy ở chế độ demo: bot được giả lập bằng một cuộc họp mẫu, chưa kết nối Google Meet.
        </div>
      )}

      {/* Top Header & Quick Actions */}
      <div className="topline">
        <div className="topline-greeting">
          <h1>
            {hello}, {firstName || "bạn"}
            <IconSparkles size={18} style={{ color: "var(--violet)", display: "inline-block", verticalAlign: "middle", marginLeft: 8 }} />
          </h1>
          <p style={{ marginTop: 4 }}>
            {orgs === null || meetings === null ? (
              "Đang đồng bộ dữ liệu cuộc họp…"
            ) : noOrg ? (
              "Tạo một tổ chức để bắt đầu các phiên họp AI."
            ) : live.length ? (
              <>
                <span className="live-dot" style={{ display: "inline-block", marginRight: 6 }} />
                <b>{live.length}</b> phiên họp đang diễn ra ngay lúc này.
              </>
            ) : (
              "Chưa có phiên nào đang diễn ra · Trợ lý AI sẵn sàng hỗ trợ."
            )}
          </p>
        </div>
        <div className="topline-actions">
          <button className="btn" onClick={() => setDialog("join")}>
            Tham gia bằng mã
          </button>
          <button className="btn primary" disabled={noOrg} onClick={() => setDialog("create")}>
            <IconPlus size={16} />
            Tạo phiên họp
          </button>
        </div>
      </div>

      {/* 4 Bento Stat Cards */}
      {meetings === null || orgs === null ? (
        <StatCardsSkeleton />
      ) : (
        <div className="bento-stats-grid">
          {stats.map((s) => (
            <div className="bento-stat-card" key={s.label}>
              <div className={`bento-stat-icon-wrap ${s.tone}`}>{s.icon}</div>
              <div className="bento-stat-info grow">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="bento-stat-num num">{s.value}</span>
                  {s.isLive && (
                    <span className="live-pulse-badge" style={{ padding: "2px 8px", fontSize: 11 }}>
                      <span className="pulse-dot" /> Live
                    </span>
                  )}
                </div>
                <span className="bento-stat-label">{s.label}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Live Meeting Spotlight (if any is currently live) */}
      {live.length > 0 && (
        <div className="live-spotlight-card">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span className="live-pulse-badge">
              <span className="pulse-dot" /> ĐANG HỌP TRỰC TIẾP
            </span>
            <div>
              <strong style={{ fontSize: 16, display: "block" }}>{live[0].title}</strong>
              <span className="muted small">
                {PLATFORM_LABEL[live[0].platform ?? "meet"]} · {orgName.get(live[0].org_id) ?? "Cuộc họp"}
              </span>
            </div>
          </div>
          <Link href={`/meetings/${live[0].id}`} className="btn primary" style={{ whiteSpace: "nowrap", gap: 6 }}>
            <IconVideo size={15} />
            <span>Vào phòng ngay</span>
          </Link>
        </div>
      )}

      {/* Main 70:30 Bento Grid */}
      <div className="home-grid-layout">
        {/* Left Column (70%): Meeting Hub */}
        <div className="home-main-col">
          <section className="card" style={{ padding: 0, overflow: "hidden" }}>
            {/* Table Header Toolbar (Straight, responsive, non-wrapping) */}
            <div className="table-toolbar">
              <div className="table-toolbar-row">
                <div className="table-toolbar-title">
                  <h2>Danh sách cuộc họp</h2>
                  <span className="count">{displayedMeetings ? displayedMeetings.length : 0}</span>
                </div>

                {/* Search Input */}
                <div className="search-input-wrap">
                  <span className="search-input-icon">
                    <IconSearch size={14} />
                  </span>
                  <input
                    type="text"
                    placeholder="Tìm cuộc họp…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {/* Filter Pills Bar (Swipeable / straight on mobile) */}
              <div className="table-toolbar-filters">
                <div className="filter-pills" role="tablist">
                  <button
                    className={`filter-pill-btn ${activeTab === "recent" ? "active" : ""}`}
                    onClick={() => setActiveTab("recent")}
                  >
                    Gần đây
                  </button>
                  <button
                    className={`filter-pill-btn ${activeTab === "ready" ? "active" : ""}`}
                    onClick={() => setActiveTab("ready")}
                  >
                    Đã có biên bản
                  </button>
                  <button
                    className={`filter-pill-btn ${activeTab === "all" ? "active" : ""}`}
                    onClick={() => setActiveTab("all")}
                  >
                    Tất cả ({all.length})
                  </button>
                </div>
              </div>
            </div>

            {/* Meeting Table */}
            <MeetingTable
              meetings={displayedMeetings}
              orgName={orgName}
              skeletonRows={5}
              empty={
                searchQuery
                  ? `Không tìm thấy cuộc họp nào phù hợp với "${searchQuery}".`
                  : activeTab === "ready"
                  ? "Chưa có phiên họp nào có biên bản hoàn tất."
                  : "Chưa có phiên họp nào. Hãy tạo phiên mới hoặc đợi lời mời."
              }
            />

            {all.length > 10 && activeTab !== "all" && (
              <div style={{ padding: "12px 20px", textAlign: "center", borderTop: "1px solid var(--line)" }}>
                <Link href="/meetings" className="small" style={{ fontWeight: 700 }}>
                  Xem toàn bộ {all.length} phiên họp ›
                </Link>
              </div>
            )}
          </section>
        </div>

        {/* Right Column (30%): Organizations & AI Assistant Widget */}
        <div className="home-side-col">
          {/* Organizations Widget */}
          <div className="side-widget-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h2 style={{ fontSize: 15 }}>Tổ chức của bạn</h2>
                <span className="count">{orgs?.length ?? 0}</span>
              </div>
              <button
                className="btn sm ghost icon-only"
                title="Thêm tổ chức"
                onClick={() => setDialog("org")}
                style={{ padding: "4px 8px" }}
              >
                <IconPlus />
              </button>
            </div>

            {orgs === null ? (
              <OrgGridSkeleton count={2} />
            ) : noOrg ? (
              <div style={{ textAlign: "center", padding: "18px 10px" }}>
                <div
                  className="avatar av-0"
                  style={{ width: 44, height: 44, margin: "0 auto 10px", borderRadius: 14 }}
                >
                  <IconBuilding />
                </div>
                <strong style={{ display: "block", marginBottom: 4 }}>Chưa có tổ chức</strong>
                <p className="muted small" style={{ marginBottom: 14 }}>
                  Tạo tổ chức để kết nối đồng nghiệp và lưu trữ phiên họp nhóm.
                </p>
                <button className="btn primary sm" onClick={() => setDialog("org")}>
                  <IconPlus /> Tạo tổ chức
                </button>
              </div>
            ) : (
              <div className="org-compact-list">
                {orgs.map((o) => {
                  const mine = all.filter((m) => m.org_id === o.id);
                  const liveCount = mine.filter(isLive).length;
                  return (
                    <Link key={o.id} href={`/orgs/${o.id}`} className="org-compact-tile">
                      <div className="row" style={{ alignItems: "center", gap: 10 }}>
                        <span className={`avatar sm ${avatarClass(o.name)}`}>{initials(o.name)}</span>
                        <div className="grow truncate">
                          <strong className="truncate" style={{ display: "block", fontSize: 14 }}>
                            {o.name}
                          </strong>
                          <span className="muted small">Tạo {dateShort(o.created_at)}</span>
                        </div>
                        <span className={`tag ${o.role !== "member" ? "accent" : ""}`}>{ROLE[o.role]}</span>
                      </div>
                      <div className="org-compact-metrics">
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <IconUsers size={14} style={{ color: "var(--brand)" }} />
                          <span>
                            <b className="num">{o.member_count}</b> thành viên
                          </span>
                        </span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <IconVideo size={14} style={{ color: "var(--brand)" }} />
                          <span>
                            <b className="num">{mine.length}</b> phiên
                          </span>
                        </span>
                        {liveCount > 0 && (
                          <span
                            style={{
                              color: "var(--ok)",
                              fontWeight: 700,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                            }}
                          >
                            <span className="live-dot" />
                            <span>{liveCount} đang họp</span>
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}

                <button className="org-compact-add-btn" onClick={() => setDialog("org")}>
                  <IconPlus />
                  <span>Thêm tổ chức mới</span>
                </button>
              </div>
            )}
          </div>

          {/* AI Meeting Assistant Capabilities Widget */}
          <div className="ai-assistant-widget">
            <div className="ai-widget-header">
              <span className="ai-widget-badge">AI Assistant</span>
              <strong style={{ fontSize: 14 }}>Trợ lý MeetMind</strong>
            </div>
            <p className="muted small" style={{ marginBottom: 14 }}>
              Đồng hành tự động cùng Google Meet & Zoom của bạn.
            </p>
            <ul className="ai-feature-list">
              <li className="ai-feature-item">
                <span className="ai-feature-dot" />
                <div>
                  <strong>Phụ đề thời gian thực</strong>
                  <div className="muted small">Nhận diện chính xác từng người phát biểu</div>
                </div>
              </li>
              <li className="ai-feature-item">
                <span className="ai-feature-dot" />
                <div>
                  <strong>Dịch trực tiếp đa ngôn ngữ</strong>
                  <div className="muted small">Mỗi thành viên xem theo ngôn ngữ riêng</div>
                </div>
              </li>
              <li className="ai-feature-item">
                <span className="ai-feature-dot" />
                <div>
                  <strong>Biên bản & Đầu việc tự động</strong>
                  <div className="muted small">Tóm tắt quyết định và công việc ngay sau họp</div>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      {dialog === "create" && orgs && (
        <CreateDialog
          orgs={orgs}
          initialOrg=""
          meetRooms={meetRooms}
          onClose={() => setDialog(null)}
          onDone={(m) => router.push(`/meetings/${m.id}`)}
        />
      )}
      {dialog === "join" && <JoinDialog onClose={() => setDialog(null)} onDone={(m) => router.push(`/meetings/${m.id}`)} />}
      {dialog === "org" && <OrgDialog onClose={() => setDialog(null)} onDone={handleOrgCreated} />}
    </Shell>
  );
}
