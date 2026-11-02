"use client";

import Link from "next/link";
import { avatarClass, IconVideo } from "./Icons";
import { dateTime, PLATFORM_LABEL, ROLE_LABEL, STATUS_LABEL } from "@/lib/format";
import type { MeetingSummary } from "@/lib/types";
import { MeetingTableSkeleton } from "./Skeleton";

export const isLive = (m: MeetingSummary) => m.status === "live" || m.status === "bot_joining";

interface Props {
  meetings: MeetingSummary[] | null;
  orgName?: Map<string, string>;
  empty?: string;
  skeletonRows?: number;
}

export function MeetingTable({ meetings, orgName, empty = "Chưa có phiên họp nào.", skeletonRows = 4 }: Props) {
  if (meetings === null) {
    return <MeetingTableSkeleton rows={skeletonRows} />;
  }

  const rows = [...meetings.filter(isLive), ...meetings.filter((m) => !isLive(m))];

  if (rows.length === 0) {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--muted)" }}>
        <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 28, opacity: 0.6 }}>☕</span>
          <span style={{ fontSize: 13.5 }}>{empty}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="meeting-table-container">
      {/* Desktop Table View */}
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
            {rows.map((m) => (
              <tr key={m.id} className={`mrow ${isLive(m) ? "live" : ""}`}>
                <td>
                  <Link href={`/meetings/${m.id}`} className="title">
                    <span className={`avatar ${avatarClass(m.title)}`}>
                      <IconVideo size={16} />
                    </span>
                    <span className="truncate">
                      <span style={{ display: "block", fontWeight: 650 }}>{m.title}</span>
                      <span className="muted small" style={{ fontWeight: 500 }}>
                        {[
                          PLATFORM_LABEL[m.platform ?? "meet"],
                          orgName?.get(m.org_id) ?? (orgName ? "Khách mời" : ""),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </Link>
                </td>
                <td>
                  <span className={`status ${m.status}`}>
                    {isLive(m) && <span className="live-dot" />}
                    {STATUS_LABEL[m.status]}
                  </span>
                </td>
                <td>
                  <span className="tag">{ROLE_LABEL[m.role]}</span>
                </td>
                <td className="num muted">{dateTime(m.created_at)}</td>
                <td style={{ textAlign: "right" }}>
                  <Link href={`/meetings/${m.id}`} className={`btn sm ${isLive(m) ? "primary" : ""}`}>
                    {isLive(m) ? "Vào phòng" : "Mở"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card-Row View (Aligned 2-row layout, never wraps jaggedly) */}
      <div className="mobile-meeting-cards">
        {rows.map((m) => (
          <div key={m.id} className={`mobile-meeting-card ${isLive(m) ? "live" : ""}`}>
            {/* Row 1: Avatar + Title + Status */}
            <div className="mobile-mc-top">
              <Link href={`/meetings/${m.id}`} className="mobile-mc-title-group">
                <span className={`avatar sm ${avatarClass(m.title)}`} style={{ flexShrink: 0 }}>
                  <IconVideo size={13} />
                </span>
                <span className="mobile-mc-title truncate">{m.title}</span>
              </Link>
              <span className={`status ${m.status}`} style={{ flexShrink: 0 }}>
                {isLive(m) && <span className="live-dot" />}
                {STATUS_LABEL[m.status]}
              </span>
            </div>

            {/* Row 2: Metadata (Platform, Org, Time) + Action Button */}
            <div className="mobile-mc-bottom">
              <div className="mobile-mc-meta truncate">
                <span className="platform-tag">{PLATFORM_LABEL[m.platform ?? "meet"]}</span>
                {orgName?.get(m.org_id) && <span className="truncate">· {orgName.get(m.org_id)}</span>}
                <span>· {dateTime(m.created_at)}</span>
              </div>
              <Link
                href={`/meetings/${m.id}`}
                className={`btn sm ${isLive(m) ? "primary" : ""}`}
                style={{ flexShrink: 0 }}
              >
                {isLive(m) ? "Vào phòng" : "Mở"}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
