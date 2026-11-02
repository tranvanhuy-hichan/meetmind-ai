"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { OrgDialog } from "./dialogs";
import { avatarClass, IconHome, IconMeetMark, IconMenu, IconPlus, IconVideo, initials } from "./Icons";
import { useAuth } from "@/lib/auth";
import type { OrgSummary, User } from "@/lib/types";

function crumbs(path: string, orgs: OrgSummary[]): { label: string; href?: string }[] {
  const home = { label: "Trang chủ", href: "/" };
  if (path === "/") return [{ label: "Trang chủ" }];
  if (path === "/meetings") return [home, { label: "Phiên họp" }];
  const org = path.match(/^\/orgs\/([^/]+)/);
  if (org) return [home, { label: orgs.find((o) => o.id === org[1])?.name ?? "Tổ chức" }];
  if (path.includes("/minutes")) return [home, { label: "Phiên họp", href: "/meetings" }, { label: "Biên bản" }];
  return [home];
}

/** Sidebar + header layout around a full-width page. */
export function Shell({
  user: userProp,
  onLogout: onLogoutProp,
  children,
}: {
  user?: User | null;
  onLogout?: () => void;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();

  // Try reading from AuthContext
  let authCtx: ReturnType<typeof useAuth> | null = null;
  try {
    authCtx = useAuth();
  } catch {
    /* not in provider */
  }

  const user = userProp !== undefined ? userProp : authCtx?.user ?? null;
  const onLogout = onLogoutProp ?? authCtx?.logout ?? (() => {});
  const orgs = authCtx?.orgs ?? [];

  const [menu, setMenu] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [adding, setAdding] = useState(false);
  const head = useRef<HTMLElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => head.current && !head.current.contains(e.target as Node) && setMenu(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  useEffect(() => {
    setMenu(false);
    setDrawer(false);
  }, [path]);

  const trail = crumbs(path, orgs);

  return (
    <div className="zshell">
      <aside className={`sidebar ${drawer ? "open" : ""}`} aria-label="Điều hướng chính">
        <Link href="/" className="sb-brand">
          <IconMeetMark />
          <span>
            <b>MeetMind</b>
            <small>Trợ lý họp AI</small>
          </span>
        </Link>
        <nav className="sb-nav">
          <Link href="/" className={`sb-item ${path === "/" ? "active" : ""}`}>
            <IconHome />
            Trang chủ
          </Link>
          <div className="sb-group">Làm việc</div>
          <Link href="/meetings" className={`sb-item ${path === "/meetings" ? "active" : ""}`}>
            <IconVideo />
            Phiên họp
          </Link>
          <div className="sb-group">Tổ chức</div>
          {orgs.length === 0 && !authCtx?.loadingOrgs && <div className="sb-empty">Chưa thuộc tổ chức nào</div>}
          {orgs.map((o) => (
            <Link key={o.id} href={`/orgs/${o.id}`} className={`sb-item ${path.startsWith(`/orgs/${o.id}`) ? "active" : ""}`}>
              <span className={`avatar sm ${avatarClass(o.name)}`}>{initials(o.name)}</span>
              <span className="truncate">{o.name}</span>
            </Link>
          ))}
          <button className="sb-item sb-add" onClick={() => setAdding(true)}>
            <IconPlus />
            Thêm tổ chức
          </button>
        </nav>
        {user && (
          <div className="sb-foot">
            <span className="truncate" style={{ display: "block" }}>
              {user.name}
            </span>
            <small className="muted truncate" style={{ display: "block" }}>
              {user.email}
            </small>
          </div>
        )}
      </aside>
      {drawer && <div className="sb-scrim" onClick={() => setDrawer(false)} />}

      <div className="zmain">
        <header className="zhead" ref={head}>
          <button className="sb-toggle btn icon-only ghost" aria-label="Mở menu" onClick={() => setDrawer(true)}>
            <IconMenu size={18} />
          </button>
          <nav className="crumbs" aria-label="Vị trí">
            {trail.map((c, i) => (
              <span key={i} className="crumb">
                {i > 0 && <span aria-hidden>›</span>}
                {c.href ? <Link href={c.href}>{c.label}</Link> : <span className="here">{c.label}</span>}
              </span>
            ))}
          </nav>
          <div className="grow" />
          {user ? (
            <div className="menu-wrap">
              <button className="who" aria-expanded={menu} onClick={() => setMenu(!menu)}>
                <span className="avatar sm av-0">{initials(user.name)}</span>
                <span className="who-text">
                  <b className="truncate">{user.name}</b>
                  <small>{user.email}</small>
                </span>
              </button>
              {menu && (
                <div className="menu right" role="menu">
                  <div className="menu-label">Tài khoản</div>
                  <div style={{ padding: "4px 14px 10px" }}>
                    <div style={{ fontWeight: 700 }}>{user.name}</div>
                    <div className="muted small">{user.email}</div>
                  </div>
                  <button className="menu-item" role="menuitem" onClick={onLogout}>
                    Đăng xuất
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="who skeleton-card" style={{ opacity: 0.6, pointerEvents: "none", width: 140, height: 38 }} />
          )}
        </header>
        <main className="content page-fade-in">{children}</main>
      </div>

      {adding && (
        <OrgDialog
          onClose={() => setAdding(false)}
          onDone={(o) => {
            setAdding(false);
            authCtx?.refreshOrgs();
            router.push(`/orgs/${o.id}`);
          }}
        />
      )}
    </div>
  );
}
