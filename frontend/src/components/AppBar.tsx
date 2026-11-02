"use client";

import Link from "next/link";
import { IconMeetMark, initials } from "./Icons";
import type { User } from "@/lib/types";

interface Props {
  user: User | null;
  onLogout: () => void;
  children?: React.ReactNode;
}

/** Simple 1-row header for the meeting room. */
export function AppBar({ user, children }: Props) {
  return (
    <header className="roomhead">
      <Link href="/" className="rh-logo" title="Về trang chủ">
        <IconMeetMark />
      </Link>
      {children}
      {user && (
        <span
          className="avatar sm"
          style={{ flexShrink: 0, marginLeft: 4 }}
          title={`${user.name} · ${user.email}`}
        >
          {initials(user.name)}
        </span>
      )}
    </header>
  );
}
