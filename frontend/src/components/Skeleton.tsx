"use client";

import React from "react";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  rounded?: string | number;
}

export function Skeleton({ width, height, rounded, className = "", style, ...props }: SkeletonProps) {
  const styles: React.CSSProperties = {
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(rounded !== undefined ? { borderRadius: rounded } : {}),
    ...style,
  };

  return <div className={`skeleton-shimmer ${className}`} style={styles} {...props} />;
}

export function StatCardsSkeleton() {
  return (
    <div className="bento-stats-grid">
      {[1, 2, 3, 4].map((i) => (
        <div className="bento-stat-card skeleton-card" key={i}>
          <div className="bento-stat-icon-wrap">
            <Skeleton width={44} height={44} rounded={14} />
          </div>
          <div className="bento-stat-info">
            <Skeleton width={48} height={28} rounded={6} style={{ marginBottom: 6 }} />
            <Skeleton width={80} height={14} rounded={4} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MeetingTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="meeting-table-skeleton-wrap">
      {/* Desktop Table Skeleton */}
      <div className="desktop-table-wrap">
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
            {Array.from({ length: rows }).map((_, i) => (
              <tr key={i} className="mrow">
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Skeleton width={38} height={38} rounded={12} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                      <Skeleton width="65%" height={16} rounded={4} />
                      <Skeleton width="40%" height={12} rounded={4} />
                    </div>
                  </div>
                </td>
                <td>
                  <Skeleton width={76} height={24} rounded={12} />
                </td>
                <td>
                  <Skeleton width={60} height={20} rounded={6} />
                </td>
                <td>
                  <Skeleton width={110} height={14} rounded={4} />
                </td>
                <td style={{ textAlign: "right" }}>
                  <Skeleton width={70} height={30} rounded={10} style={{ marginLeft: "auto" }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card Skeleton */}
      <div className="mobile-meeting-cards">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="mobile-meeting-card skeleton-card">
            <div className="mobile-mc-top">
              <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                <Skeleton width={26} height={26} rounded={9} />
                <Skeleton width="55%" height={16} rounded={4} />
              </div>
              <Skeleton width={65} height={22} rounded={10} />
            </div>
            <div className="mobile-mc-bottom">
              <Skeleton width="60%" height={12} rounded={4} />
              <Skeleton width={65} height={28} rounded={8} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OrgGridSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="org-compact-list">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="org-compact-tile skeleton-card">
          <div className="row" style={{ alignItems: "center", gap: 12 }}>
            <Skeleton width={42} height={42} rounded={12} />
            <div style={{ flex: 1 }}>
              <Skeleton width="60%" height={16} rounded={4} style={{ marginBottom: 6 }} />
              <Skeleton width="40%" height={12} rounded={4} />
            </div>
            <Skeleton width={60} height={20} rounded={6} />
          </div>
          <div className="org-compact-metrics" style={{ marginTop: 12 }}>
            <Skeleton width="100%" height={24} rounded={6} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function OrgDetailSkeleton() {
  return (
    <div className="page-fade-in">
      <div className="topline" style={{ marginTop: 10, marginBottom: 20 }}>
        <Skeleton width={52} height={52} rounded={16} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
          <Skeleton width={220} height={26} rounded={6} />
          <Skeleton width={320} height={14} rounded={4} />
        </div>
        <Skeleton width={130} height={38} rounded={12} />
      </div>

      <div className="page-tabs" style={{ marginBottom: 20 }}>
        <Skeleton width={90} height={36} rounded={8} style={{ marginRight: 8 }} />
        <Skeleton width={90} height={36} rounded={8} style={{ marginRight: 8 }} />
        <Skeleton width={90} height={36} rounded={8} style={{ marginRight: 8 }} />
        <Skeleton width={90} height={36} rounded={8} />
      </div>

      <section className="card" style={{ padding: 20 }}>
        <MeetingTableSkeleton rows={4} />
      </section>
    </div>
  );
}

export function MinutesSkeleton() {
  return (
    <div className="page-fade-in" style={{ padding: "20px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <Skeleton width={280} height={28} rounded={6} style={{ marginBottom: 8 }} />
          <Skeleton width={180} height={14} rounded={4} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Skeleton width={110} height={36} rounded={10} />
          <Skeleton width={100} height={36} rounded={10} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="card" style={{ padding: 24 }}>
            <Skeleton width={160} height={20} rounded={4} style={{ marginBottom: 14 }} />
            <Skeleton width="100%" height={16} rounded={4} style={{ marginBottom: 8 }} />
            <Skeleton width="92%" height={16} rounded={4} style={{ marginBottom: 8 }} />
            <Skeleton width="85%" height={16} rounded={4} />
          </div>

          <div className="card" style={{ padding: 24 }}>
            <Skeleton width={140} height={20} rounded={4} style={{ marginBottom: 14 }} />
            <Skeleton width="100%" height={40} rounded={8} style={{ marginBottom: 10 }} />
            <Skeleton width="100%" height={40} rounded={8} />
          </div>
        </div>

        <div className="card" style={{ padding: 24, height: 320 }}>
          <Skeleton width={120} height={18} rounded={4} style={{ marginBottom: 16 }} />
          <Skeleton width="100%" height={24} rounded={6} style={{ marginBottom: 10 }} />
          <Skeleton width="100%" height={24} rounded={6} style={{ marginBottom: 10 }} />
          <Skeleton width="100%" height={24} rounded={6} />
        </div>
      </div>
    </div>
  );
}


export function RoomSkeleton() {
  return (
    <div className="room page-fade-in" style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: "var(--ink)", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <Skeleton width={180} height={20} rounded={6} style={{ background: "rgba(255,255,255,0.12)" }} />
        <Skeleton width={80} height={20} rounded={10} style={{ background: "rgba(255,255,255,0.12)" }} />
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Skeleton width={110} height={32} rounded={8} style={{ background: "rgba(255,255,255,0.15)" }} />
        </div>
      </div>
      <div style={{ display: "flex", flex: 1, padding: 12, gap: 12, minHeight: 0 }}>
        <div style={{ flex: 1, background: "var(--card)", borderRadius: "var(--r-lg)", border: "1px solid var(--line)", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <Skeleton width={200} height={24} rounded={6} />
          <Skeleton width="100%" height={240} rounded={12} />
          <Skeleton width="80%" height={16} rounded={4} />
        </div>
        <div style={{ width: 420, background: "var(--card)", borderRadius: "var(--r-lg)", border: "1px solid var(--line)", padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <Skeleton width={140} height={20} rounded={6} />
          <Skeleton width="100%" height={56} rounded={10} />
          <Skeleton width="100%" height={56} rounded={10} />
          <Skeleton width="100%" height={56} rounded={10} />
        </div>
      </div>
    </div>
  );
}
