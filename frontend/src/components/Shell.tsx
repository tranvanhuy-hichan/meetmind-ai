"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { avatarClass, IconMeetMark, IconVideo, initials } from "./Icons";
import type { OrgSummary, User } from "@/lib/types";

interface Props {
  user: User | null;
  onLogout: () => void;
  /** Pass the list when the page already has it; otherwise the shell loads it. */
  orgs?: OrgSummary[];
  children: React.ReactNode;
}

/** Sidebar + full-width content: the frame of every page except the meeting room. */
export function Shell({ user, onLogout, orgs, children }: Props) {
  const path = usePathname();
  const [loaded, setLoaded] = useState<OrgSummary[]>([]);

  useEffect(() => {
    if (user && !orgs) api.listOrgs().then(setLoaded).catch(() => {});
  }, [user, orgs]);
  const list = orgs ?? loaded;

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <IconMeetMark />
          MeetMind
        </Link>
        <nav className="col" style={{ gap: 2 }}>
          <Link href="/" className={`nav-item ${path === "/" ? "active" : ""}`}>
            <IconVideo />
            Phiên họp
          </Link>
          {list.length > 0 && <div className="nav-label">Tổ chức</div>}
          {list.map((o) => (
            <Link key={o.id} href={`/orgs/${o.id}`} className={`nav-item ${path === `/orgs/${o.id}` ? "active" : ""}`}>
              <span className={`avatar sm ${avatarClass(o.name)}`}>{initials(o.name)}</span>
              <span className="truncate">{o.name}</span>
            </Link>
          ))}
        </nav>
        <div className="grow" />
        {user && (
          <div className="side-user">
            <span className="avatar on-dark">{initials(user.name)}</span>
            <div className="grow">
              <div className="truncate" style={{ fontWeight: 700 }}>{user.name}</div>
              <div className="truncate small" style={{ color: "#9a93bf" }}>{user.email}</div>
            </div>
            <button className="btn sm on-dark" onClick={onLogout} title="Đăng xuất">Thoát</button>
          </div>
        )}
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
