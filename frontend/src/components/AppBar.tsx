"use client";

import Link from "next/link";
import { IconMeetMark, initials } from "./Icons";
import type { User } from "@/lib/types";

interface Props {
  user: User | null;
  onLogout: () => void;
  children?: React.ReactNode;
}

/** Header of the meeting room: logo > Phiên họp > title, then whatever the page puts in it. */
export function AppBar({ user, children }: Props) {
  return (
    <header className="roomhead">
      <Link href="/" className="rh-logo" title="Về trang chủ"><IconMeetMark /></Link>
      <Link href="/meetings" className="rh-back">Phiên họp</Link>
      <span className="rh-sep" aria-hidden>›</span>
      {children}
      {user && <span className="avatar" style={{ marginLeft: "auto" }} title={`${user.name} · ${user.email}`}>{initials(user.name)}</span>}
    </header>
  );
}
