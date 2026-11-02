"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AppBar } from "@/components/AppBar";
import { avatarClass, IconCheck, IconDoc, IconPlus, IconUsers, initials } from "@/components/Icons";
import { MinutesSkeleton } from "@/components/Skeleton";
import { TranscriptList } from "@/components/TranscriptPanel";
import { api } from "@/lib/api";
import { useRequireUser } from "@/lib/auth";
import { canManage as canManageRole, clock, dateTime } from "@/lib/format";
import type { ActionItem, Decision, Language, MeetingDetail, MinutesData, Segment } from "@/lib/types";

const EMPTY: MinutesData = { summary: "", topics: [], decisions: [], action_items: [] };

export default function MinutesPage({ params }: { params: { id: string } }) {
  const { user, logout } = useRequireUser();
  const [detail, setDetail] = useState<MeetingDetail | null>(null);
  const [minutes, setMinutes] = useState<MinutesData | null>(null);
  const [status, setStatus] = useState<"draft" | "final">("draft");
  const [dirty, setDirty] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [tab, setTab] = useState<"minutes" | "transcript">("minutes");
  const [lang, setLang] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const poll = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const loadTranscript = useCallback(
    (target: string | null) => api.transcript(params.id, target).then((r) => setSegments(r.segments)),
    [params.id],
  );

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.getMeeting(params.id).then(setDetail).catch((e) => setError(e.message)),
      api.languages().then(setLanguages).catch(() => {}),
      api
        .getMinutes(params.id)
        .then((m) => {
          if (m) {
            setMinutes(m.minutes);
            setStatus(m.status);
            setUpdatedAt(m.updated_at);
          }
        })
        .catch((e) => setError(e.message)),
      loadTranscript(null).catch(() => {}),
    ]).finally(() => setLoading(false));

    return () => clearInterval(poll.current);
  }, [user, params.id, loadTranscript]);

  const manage = detail ? canManageRole(detail.me.role) : false;
  const title = detail?.meeting.title ?? "";
  const byId = useMemo(() => new Map(segments.map((s) => [s.id, s])), [segments]);
  const translations = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of segments) if (s.translation) map[s.id] = s.translation;
    return map;
  }, [segments]);

  const edit = (patch: Partial<MinutesData>) => {
    setMinutes((m) => ({ ...(m ?? EMPTY), ...patch }));
    setDirty(true);
  };

  async function run(name: string, action: () => Promise<void>) {
    setBusy(name);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Thao tác không thành công");
    } finally {
      setBusy("");
    }
  }

  const generate = () =>
    run("generate", async () => {
      if (dirty && !window.confirm("Tạo lại sẽ thay thế các chỉnh sửa chưa lưu. Tiếp tục?")) return;
      const r = await api.generateMinutes(params.id);
      setMinutes(r.minutes);
      setStatus(r.status);
      setUpdatedAt(r.updated_at);
      setDirty(false);
    });

  const save = (next: "draft" | "final") =>
    run("save", async () => {
      const r = await api.saveMinutes(params.id, minutes ?? EMPTY, next);
      setMinutes(r.minutes);
      setStatus(r.status);
      setUpdatedAt(r.updated_at);
      setDirty(false);
    });

  const changeLang = (next: string | null) => {
    setLang(next);
    clearInterval(poll.current);
    if (!next) return void loadTranscript(null);
    loadTranscript(next).then(() => api.translateTranscript(params.id, next));
    let rounds = 0;
    poll.current = setInterval(async () => {
      await loadTranscript(next);
      if (++rounds >= 30) clearInterval(poll.current);
    }, 2500);
  };

  if (!user) return null;

  const evidenceLine = (id: string | null) => {
    const s = id ? byId.get(id) : undefined;
    return s ? (
      <div className="evidence">
        [{clock(s.start_ms)}] {s.speaker}: “{s.text}”
      </div>
    ) : null;
  };

  const people = detail?.participants ?? [];

  return (
    <div className="room minutes-page">
      <AppBar user={user} onLogout={logout}>
        <Link href={`/meetings/${params.id}`} className="rh-title truncate" title="Về phòng họp">{title || "Phiên họp"}</Link>
        <span className="rh-sep" aria-hidden>›</span>
        <strong className="rh-title">Biên bản</strong>
        {minutes && <span className={`status ${status === "final" ? "ready" : ""}`}>{status === "final" ? "Đã chốt" : "Bản nháp"}</span>}
        {dirty && <span className="status processing">Chưa lưu</span>}
        <div className="grow" />
        {minutes && (
          <>
            <button className="btn sm on-dark" onClick={() => api.exportMinutes(params.id, "docx", title)} disabled={dirty} title={dirty ? "Lưu trước khi xuất" : ""}>Xuất Word</button>
            <button className="btn sm on-dark" onClick={() => api.exportMinutes(params.id, "md", title)} disabled={dirty} title={dirty ? "Lưu trước khi xuất" : ""}>Markdown</button>
          </>
        )}
        {manage && (
          <button className="btn sm on-dark" onClick={generate} disabled={!!busy}>
            {busy === "generate" ? "Đang tạo…" : minutes ? "Tạo lại bằng AI" : "Tạo biên bản bằng AI"}
          </button>
        )}
        {manage && minutes && (
          <>
            <button className="btn sm on-dark" onClick={() => save("draft")} disabled={!!busy || !dirty}>Lưu nháp</button>
            <button className="btn sm on-dark primary" onClick={() => save("final")} disabled={!!busy || (status === "final" && !dirty)}>Chốt biên bản</button>
          </>
        )}
      </AppBar>

      <div className="mn-bar">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "minutes"} className={`tab ${tab === "minutes" ? "active" : ""}`} onClick={() => setTab("minutes")}>Biên bản</button>
          <button role="tab" aria-selected={tab === "transcript"} className={`tab ${tab === "transcript" ? "active" : ""}`} onClick={() => setTab("transcript")}>Toàn văn ({segments.length})</button>
        </div>
        <div className="grow" />
        <span className="muted small">
          {detail?.meeting.started_at ? `Bắt đầu ${dateTime(detail.meeting.started_at)}` : "Biên bản cuộc họp"}
          {updatedAt && ` · cập nhật ${dateTime(updatedAt)}`}
        </span>
      </div>

      <div className="mn-body">
      {error && <div className="notice warn bordered" style={{ marginBottom: 14 }}>{error}</div>}

      {loading && <MinutesSkeleton />}

      {!loading && tab === "minutes" && !minutes && (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <div className="avatar av-0" style={{ width: 56, height: 56, borderRadius: 18, margin: "0 auto 14px" }}><IconDoc /></div>
          <h2>Chưa có biên bản</h2>
          <p className="muted" style={{ margin: "6px 0 18px" }}>
            {segments.length ? "AI sẽ đọc toàn văn cuộc họp và soạn tóm tắt, quyết định và công việc." : "Chưa có nội dung cuộc họp để lập biên bản."}
          </p>
          {manage && segments.length > 0 && <button className="btn primary" onClick={generate} disabled={!!busy}>Tạo biên bản bằng AI</button>}
        </div>
      )}

      {!loading && tab === "minutes" && minutes && (
        <div className="split">
          <div>
            <section className="card min-section summary-card">
              <h2><span className="icon-chip av-0"><IconDoc /></span>Tóm tắt</h2>
              {manage ? (
                <textarea className="textarea" rows={5} value={minutes.summary} onChange={(e) => edit({ summary: e.target.value })} />
              ) : (
                <p style={{ margin: 0 }}>{minutes.summary || "—"}</p>
              )}
            </section>

            <section className="card min-section">
              <h2><span className="icon-chip av-2"><IconCheck /></span>Kết luận và quyết định</h2>
              <Decisions items={minutes.decisions} editable={manage} onChange={(decisions) => edit({ decisions })} evidence={evidenceLine} />
            </section>

            <section className="card min-section">
              <h2><span className="icon-chip av-4"><IconCheck /></span>Công việc được giao</h2>
              <Tasks
                items={minutes.action_items}
                editable={manage}
                names={people.map((p) => p.name)}
                onChange={(action_items) => edit({ action_items })}
                evidence={evidenceLine}
              />
            </section>
          </div>

          <aside className="rail">
            <section className="card min-section" style={{ marginBottom: 0 }}>
              <h2><span className="icon-chip av-3"><IconUsers /></span>Người tham dự</h2>
              <div className="col" style={{ gap: 10 }}>
                {people.map((p) => (
                  <div className="row" key={p.user_id}>
                    <span className={`avatar sm ${avatarClass(p.name)}`}>{initials(p.name)}</span>
                    <span className="grow truncate">{p.name}</span>
                  </div>
                ))}
              </div>
            </section>
            <section className="card min-section" style={{ marginBottom: 0 }}>
              <h2><span className="icon-chip av-1"><IconCheck /></span>Nội dung thảo luận</h2>
              <Topics items={minutes.topics} editable={manage} onChange={(topics) => edit({ topics })} />
            </section>
          </aside>
        </div>
      )}

      {tab === "transcript" && (
        <div className="card">
          <div className="side-toolbar">
            <label htmlFor="tl" className="muted small">Hiển thị bằng</label>
            <select id="tl" className="select" value={lang ?? ""} onChange={(e) => changeLang(e.target.value || null)}>
              <option value="">Ngôn ngữ gốc</option>
              {languages.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
            {lang && <span className="muted small">Phần chưa có bản dịch sẽ được dịch dần.</span>}
          </div>
          <div style={{ padding: "8px 0 14px" }}>
            {segments.length === 0 ? (
              <div className="empty">Chưa có nội dung.</div>
            ) : (
              <TranscriptList segments={segments} translations={translations} lang={lang} languages={languages} />
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

function Topics({ items, editable, onChange }: { items: string[]; editable: boolean; onChange: (items: string[]) => void }) {
  if (!editable) {
    return items.length ? (
      <div className="topic-chips">
        {items.map((t, i) => <span key={i} className={`topic av-${i % 8}`}>{t}</span>)}
      </div>
    ) : (
      <p className="muted" style={{ margin: 0 }}>Không ghi nhận chủ đề.</p>
    );
  }
  return (
    <div className="col" style={{ gap: 8 }}>
      {items.map((t, i) => (
        <div className="row" key={i}>
          <input className="input" value={t} placeholder="Chủ đề" onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
          <button className="btn sm ghost" aria-label="Xóa dòng" onClick={() => onChange(items.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <div><button className="btn sm" onClick={() => onChange([...items, ""])}><IconPlus />Thêm chủ đề</button></div>
    </div>
  );
}

function Decisions({
  items,
  editable,
  onChange,
  evidence,
}: {
  items: Decision[];
  editable: boolean;
  onChange: (d: Decision[]) => void;
  evidence: (id: string | null) => React.ReactNode;
}) {
  if (!items.length && !editable) return <p className="muted" style={{ margin: 0 }}>Không có quyết định được ghi nhận.</p>;
  return (
    <div>
      {items.map((d, i) => (
        <div className="decision" key={i}>
          <span className="num-badge">{i + 1}</span>
          <div className="grow">
            {editable ? (
              <div className="row">
                <input className="input" value={d.text} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                <button className="btn sm ghost" aria-label="Xóa quyết định" onClick={() => onChange(items.filter((_, j) => j !== i))}>×</button>
              </div>
            ) : (
              <div style={{ fontWeight: 650 }}>{d.text}</div>
            )}
            {evidence(d.evidence_segment_id)}
          </div>
        </div>
      ))}
      {editable && <div style={{ marginTop: 10 }}><button className="btn sm" onClick={() => onChange([...items, { text: "", evidence_segment_id: null }])}><IconPlus />Thêm quyết định</button></div>}
    </div>
  );
}

function Tasks({
  items,
  editable,
  names,
  onChange,
  evidence,
}: {
  items: ActionItem[];
  editable: boolean;
  names: string[];
  onChange: (items: ActionItem[]) => void;
  evidence: (id: string | null) => React.ReactNode;
}) {
  const set = (i: number, patch: Partial<ActionItem>) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  if (!items.length && !editable) return <p className="muted" style={{ margin: 0 }}>Không có công việc nào được giao.</p>;
  return (
    <>
      <datalist id="people">{names.map((n) => <option key={n} value={n} />)}</datalist>
      <div className="task-grid">
        {items.map((a, i) => (
          <div className="task-card" key={i}>
            {editable ? (
              <>
                <div className="row">
                  <input className="input" list="people" placeholder="Người phụ trách" value={a.owner} onChange={(e) => set(i, { owner: e.target.value })} />
                  <input className="input" style={{ maxWidth: 110 }} placeholder="Thời hạn" value={a.due_date} onChange={(e) => set(i, { due_date: e.target.value })} />
                  <button className="btn sm ghost" aria-label="Xóa công việc" onClick={() => onChange(items.filter((_, j) => j !== i))}>×</button>
                </div>
                <textarea className="textarea" rows={2} placeholder="Công việc" value={a.task} onChange={(e) => set(i, { task: e.target.value })} />
              </>
            ) : (
              <>
                <div className="who">
                  {a.owner ? <span className={`avatar ${avatarClass(a.owner)}`}>{initials(a.owner)}</span> : <span className="avatar av-7">?</span>}
                  <span className="grow truncate">{a.owner || "Chưa có người phụ trách"}</span>
                  <span className={`due ${a.due_date ? "" : "none"}`}>{a.due_date || "Không thời hạn"}</span>
                </div>
                <div style={{ fontWeight: 600 }}>{a.task}</div>
              </>
            )}
            {evidence(a.evidence_segment_id)}
          </div>
        ))}
      </div>
      {editable && (
        <div style={{ marginTop: 12 }}>
          <button className="btn sm" onClick={() => onChange([...items, { task: "", owner: "", due_date: "", evidence_segment_id: null }])}><IconPlus />Thêm công việc</button>
        </div>
      )}
    </>
  );
}
