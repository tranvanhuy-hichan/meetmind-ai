"use client";

import Link from "next/link";
import { avatarClass, IconVideo } from "./Icons";
import { dateTime, PLATFORM_LABEL, ROLE_LABEL, STATUS_LABEL } from "@/lib/format";
import type { MeetingSummary } from "@/lib/types";

export const isLive = (m: MeetingSummary) => m.status === "live" || m.status === "bot_joining";

interface Props {
  meetings: MeetingSummary[] | null;
  orgName?: Map<string, string>; // shows the organization under the title when given
  empty?: string;
}

/** Meetings as rows: live ones first and highlighted. */
export function MeetingTable({ meetings, orgName, empty = "Chưa có phiên họp nào." }: Props) {
  const rows = meetings ? [...meetings.filter(isLive), ...meetings.filter((m) => !isLive(m))] : [];
  return (
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
        {meetings && rows.length === 0 && <tr><td colSpan={5} className="muted" style={{ padding: 28, textAlign: "center" }}>{empty}</td></tr>}
        {rows.map((m) => (
          <tr key={m.id} className={`mrow ${isLive(m) ? "live" : ""}`}>
            <td>
              <Link href={`/meetings/${m.id}`} className="title">
                <span className={`avatar ${avatarClass(m.title)}`}><IconVideo /></span>
                <span>
                  <span style={{ display: "block" }}>{m.title}</span>
                  <span className="muted small" style={{ fontWeight: 500 }}>{[PLATFORM_LABEL[m.platform ?? "meet"], orgName?.get(m.org_id) ?? (orgName ? "Khách mời" : "")].filter(Boolean).join(" · ")}</span>
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
  );
}
