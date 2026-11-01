"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { DocumentList } from "./DocumentList";
import { IconClose, IconDoc, IconDownload, IconMinus, IconPlus, IconPresent, IconTrash } from "./Icons";
import { Jump, PdfViewer, ViewerPosition, forgetPdf } from "./PdfViewer";
import { useDocTabs, ViewState } from "@/hooks/useDocTabs";
import type { DocumentInfo, Participant, Position, PresenterRef } from "@/lib/types";

interface Props {
  meetingId: string;
  meId: string;
  canManage: boolean;
  documents: DocumentInfo[];
  participants: Participant[];
  presenter: PresenterRef | null;
  position: { position: Position; seq: number } | null;
  requests: PresenterRef[];
  onClaim: () => void;
  onRelease: () => void;
  onGrant: (userId: string) => void;
  onMove: (p: Position) => void;
  onDismissRequest: (userId: string) => void;
}

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const MOVE_INTERVAL_MS = 100;

/** Document tabs + viewer + following the presenter. */
export function DocumentPane(props: Props) {
  const { meetingId, meId, canManage, documents, participants, presenter, position, requests } = props;
  const tabs = useDocTabs(meetingId, documents);
  const [following, setFollowing] = useState(true);
  const [jump, setJump] = useState<(Jump & { docId: string }) | null>(null);
  const [page, setPage] = useState(1);
  const nonce = useRef(0);
  const lastPresenterPos = useRef<Position | null>(null);
  const personal = useRef<Record<string, ViewState>>({}); // where this reader was before following
  const pending = useRef<Position | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isPresenter = presenter?.user_id === meId;
  const activeDoc = documents.find((d) => d.id === tabs.active) ?? null;
  const view = activeDoc ? tabs.getView(activeDoc.id) : null;
  const following_ = following && !!presenter && !isPresenter;

  // --- follow the presenter -------------------------------------------------------------------
  const goTo = (p: Position) => {
    if (!personal.current[p.doc_id]) personal.current[p.doc_id] = tabs.getView(p.doc_id);
    tabs.setView(p.doc_id, { page: p.page, y_ratio: p.y_ratio, zoom: p.zoom }, true);
    tabs.openDoc(p.doc_id);
    setJump({ page: p.page, y_ratio: p.y_ratio, nonce: ++nonce.current, docId: p.doc_id });
  };
  const goToRef = useRef(goTo);
  goToRef.current = goTo;

  useEffect(() => {
    if (!position || isPresenter) return;
    lastPresenterPos.current = position.position;
    if (following) goToRef.current(position.position);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position]);

  useEffect(() => {
    if (!presenter) personal.current = {};
  }, [presenter]);

  // when this reader becomes the presenter, tell everyone where they are right now
  useEffect(() => {
    if (isPresenter && activeDoc) {
      const v = tabs.getView(activeDoc.id);
      props.onMove({ doc_id: activeDoc.id, ...v });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresenter]);

  const sendMove = (p: Position) => {
    pending.current = p;
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      if (pending.current) props.onMove(pending.current);
      pending.current = null;
    }, MOVE_INTERVAL_MS);
  };

  const onPosition = (pos: ViewerPosition, byUser: boolean) => {
    if (!activeDoc) return;
    const zoom = tabs.getView(activeDoc.id).zoom;
    tabs.setView(activeDoc.id, { ...pos, zoom });
    setPage(pos.page);
    if (isPresenter) {
      sendMove({ doc_id: activeDoc.id, ...pos, zoom });
    } else if (byUser && following_) {
      const target = lastPresenterPos.current;
      const moved =
        !target || target.doc_id !== activeDoc.id || Math.abs(pos.page + pos.y_ratio - (target.page + target.y_ratio)) > 0.05;
      if (moved) leaveFollow();
    }
  };

  const leaveFollow = () => {
    setFollowing(false);
    personal.current = {};
  };

  const startFollow = () => {
    setFollowing(true);
    if (lastPresenterPos.current) goTo(lastPresenterPos.current);
  };

  const backToMyPlace = () => {
    if (!activeDoc) return;
    const mine = personal.current[activeDoc.id];
    leaveFollow();
    if (mine) {
      tabs.setView(activeDoc.id, mine, true);
      setJump({ page: mine.page, y_ratio: mine.y_ratio, nonce: ++nonce.current, docId: activeDoc.id });
    }
  };

  const activate = (id: string) => {
    if (following_ && lastPresenterPos.current && lastPresenterPos.current.doc_id !== id) leaveFollow();
    tabs.activate(id);
  };

  const openFromList = (id: string) => {
    if (following_ && lastPresenterPos.current && lastPresenterPos.current.doc_id !== id) leaveFollow();
    tabs.openDoc(id);
  };

  const setZoom = (zoom: number) => {
    if (!activeDoc) return;
    const v = tabs.getView(activeDoc.id);
    tabs.setView(activeDoc.id, { ...v, zoom }, true);
    if (isPresenter) sendMove({ doc_id: activeDoc.id, page: v.page, y_ratio: v.y_ratio, zoom });
  };
  const stepZoom = (dir: 1 | -1) => {
    if (!view) return;
    const idx = ZOOM_STEPS.findIndex((z) => z >= view.zoom - 0.001);
    const next = ZOOM_STEPS[Math.min(Math.max((idx === -1 ? ZOOM_STEPS.length - 1 : idx) + dir, 0), ZOOM_STEPS.length - 1)];
    setZoom(next);
  };

  const closeTab = (id: string) => {
    tabs.close(id);
    forgetPdf(id);
  };

  const myJump = jump && jump.docId === activeDoc?.id ? jump : null;
  const others = participants.filter((p) => p.user_id !== meId);

  return (
    <section className="docs-pane" aria-label="Tài liệu">
      {(isPresenter || canManage) && requests.length > 0 && (
        <div className="notice">
          {requests.map((r) => (
            <div key={r.user_id} className="row" style={{ marginBottom: 2 }}>
              <span className="grow"><strong>{r.name}</strong> xin được trình bày</span>
              <button className="btn sm primary" onClick={() => { props.onGrant(r.user_id); props.onDismissRequest(r.user_id); }}>Đồng ý</button>
              <button className="btn sm" onClick={() => props.onDismissRequest(r.user_id)}>Bỏ qua</button>
            </div>
          ))}
        </div>
      )}

      <div className="docs-main">
        <div className="viewer-col">
          <div className="tabbar">
          <div className="tabs" role="tablist">
            {tabs.open.map((id) => {
              const doc = documents.find((d) => d.id === id);
              if (!doc) return null;
              return (
                <div key={id} role="tab" aria-selected={id === tabs.active} className={`tab ${id === tabs.active ? "active" : ""}`} onClick={() => activate(id)} title={doc.name}>
                  <IconDoc />
                  <span className="truncate">{doc.name}</span>
                  <button className="x" aria-label={`Đóng ${doc.name}`} onClick={(e) => { e.stopPropagation(); closeTab(id); }}><IconClose /></button>
                </div>
              );
            })}
          </div>
          <DocumentList meetingId={meetingId} documents={documents} openIds={tabs.open} canManage={canManage} onOpen={openFromList} />
          </div>

          <div className="viewer-toolbar">
            {activeDoc && view ? (
              <>
                <span className="num" style={{ fontWeight: 600 }}>Trang {page} <span className="muted" style={{ fontWeight: 400 }}>/ {activeDoc.page_count}</span></span>
                <div className="toolbar-sep" />
                <div className="toolbar-group">
                  <button className="btn sm icon-only ghost" onClick={() => stepZoom(-1)} aria-label="Thu nhỏ" title="Thu nhỏ"><IconMinus /></button>
                  <span className="num" style={{ minWidth: 46, textAlign: "center" }}>{Math.round(view.zoom * 100)}%</span>
                  <button className="btn sm icon-only ghost" onClick={() => stepZoom(1)} aria-label="Phóng to" title="Phóng to"><IconPlus /></button>
                  <button className="btn sm ghost" onClick={() => setZoom(1)}>Vừa ngang</button>
                </div>
                {(activeDoc.allow_download || canManage) && (
                  <button className="btn sm ghost" onClick={() => api.downloadOriginal(activeDoc.id, activeDoc.name)}><IconDownload />Tải về</button>
                )}
                {canManage && (
                  <>
                    <label className="row small" style={{ gap: 4 }}>
                      <input type="checkbox" checked={activeDoc.allow_download} onChange={(e) => api.setAllowDownload(activeDoc.id, e.target.checked)} />
                      Cho phép tải
                    </label>
                    <button className="btn sm ghost danger" onClick={() => window.confirm(`Xóa "${activeDoc.name}" khỏi phiên họp?`) && api.deleteDocument(activeDoc.id)}><IconTrash />Xóa</button>
                  </>
                )}
              </>
            ) : (
              <span className="muted">Chưa mở tài liệu nào</span>
            )}
            <div className="grow" />

            {!presenter && <span className="muted small">Chưa có người trình bày</span>}
            {!isPresenter && presenter && <span className="muted">{following_ ? `Đang theo dõi ${presenter.name}` : `${presenter.name} đang trình bày`}</span>}
            <div className="grow" />
            {isPresenter && (
              <>
                {others.length > 0 && (
                  <select className="select" style={{ height: 26 }} value="" aria-label="Trao quyền trình bày" onChange={(e) => e.target.value && props.onGrant(e.target.value)}>
                    <option value="">Trao quyền cho…</option>
                    {others.map((p) => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
                  </select>
                )}
                <button className="btn sm" onClick={props.onRelease}>Dừng trình bày</button>
              </>
            )}
            {!isPresenter && presenter && (
              <>
                {following_ ? (
                  <>
                    <button className="btn sm" onClick={backToMyPlace}>Về chỗ đọc của tôi</button>
                    <button className="btn sm" onClick={leaveFollow}>Tự đọc</button>
                  </>
                ) : (
                  <button className="btn sm primary" onClick={startFollow}>Theo dõi {presenter.name}</button>
                )}
                <button className="btn sm" onClick={props.onClaim}>{canManage ? "Tiếp quản" : "Xin trình bày"}</button>
              </>
            )}
            {!presenter && <button className="btn sm" onClick={props.onClaim} disabled={!activeDoc}><IconPresent />Trình bày cho mọi người</button>}
                    </div>

          {activeDoc && view ? (
            <PdfViewer
              key={activeDoc.id}
              docId={activeDoc.id}
              zoom={view.zoom}
              initial={{ page: view.page, y_ratio: view.y_ratio }}
              jump={myJump}
              onPosition={onPosition}
            />
          ) : (
            <div className="empty">
              <IconDoc size={30} />
              {documents.length ? "Chọn một tài liệu trong danh sách để mở." : "Tài liệu chia sẻ trong cuộc họp sẽ hiển thị ở đây."}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
