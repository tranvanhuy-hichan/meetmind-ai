"use client";

import Link from "next/link";
import { IconMeetMark, initials } from "./Icons";
import type { OrgSummary, User } from "@/lib/types";

interface Props {
  user: User | null;
  onLogout: () => void;
  orgs?: OrgSummary[];
  children?: React.ReactNode;
}

export function AppBar({ user, onLogout, orgs = [], children }: Props) {
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        <IconMeetMark />
        MeetMind
      </Link>
      {orgs.length > 0 && (
        <>
          <div className="sep" />
          <span className="muted small truncate" style={{ maxWidth: 220 }}>
            {orgs.length === 1 ? orgs[0].name : `${orgs.length} tổ chức`}
          </span>
        </>
      )}
      {children}
      <div className="grow" />
      {user && (
        <>
          <span className="avatar on-dark" title={user.email}>{initials(user.name)}</span>
          <span className="truncate" style={{ maxWidth: 160 }} title={user.email}>{user.name}</span>
          <button className="btn sm on-dark" onClick={onLogout}>Đăng xuất</button>
        </>
      )}
    </header>
  );
}
