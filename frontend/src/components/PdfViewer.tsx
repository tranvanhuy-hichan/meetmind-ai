"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { api } from "@/lib/api";

const GAP = 12; // space above every page; also the page cell's padding
const PRELOAD = 1200; // px of pages rendered above and below the visible area

export interface ViewerPosition {
  page: number;
  y_ratio: number;
}

export interface Jump extends ViewerPosition {
  nonce: number;
}

interface Props {
  docId: string;
  zoom: number;
  initial: ViewerPosition;
  jump: Jump | null;
  /** `byUser` is false for moves the viewer made itself (restore, jump, relayout). */
  onPosition: (pos: ViewerPosition, byUser: boolean) => void;
}

const documents = new Map<string, Promise<PDFDocumentProxy>>();

function loadPdf(docId: string): Promise<PDFDocumentProxy> {
  let promise = documents.get(docId);
  if (!promise) {
    promise = (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
      const data = await api.fetchPdf(docId);
      return pdfjs.getDocument({ data }).promise;
    })();
    promise.catch(() => documents.delete(docId));
    documents.set(docId, promise);
  }
  return promise;
}

export function forgetPdf(docId: string): void {
  documents.delete(docId);
}

/**
 * Pages are laid out by their aspect ratio, so the layout is known before any page is drawn and
 * a position (page + fraction of the page cell) means the same place at any width or zoom.
 */
export function PdfViewer({ docId, zoom, initial, jump, onPosition }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState("");
  const [ratios, setRatios] = useState<number[]>([]);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [scroll, setScroll] = useState({ top: 0 });

  const desired = useRef<ViewerPosition>(initial);
  const ignoreUntil = useRef(0);
  const frame = useRef(0);
  const reported = useRef(false);
  const onPositionRef = useRef(onPosition);
  onPositionRef.current = onPosition;

  useEffect(() => {
    let cancelled = false;
    loadPdf(docId)
      .then(async (doc) => {
        if (cancelled) return;
        setPdf(doc);
        const first = await doc.getPage(1);
        const v = first.getViewport({ scale: 1 });
        if (cancelled) return;
        const all = new Array<number>(doc.numPages).fill(v.height / v.width);
        setRatios(all);
        // measure the other pages in the background so the layout becomes exact
        for (let start = 2; start <= doc.numPages; start += 25) {
          const end = Math.min(start + 24, doc.numPages);
          const pages = await Promise.all(Array.from({ length: end - start + 1 }, (_, i) => doc.getPage(start + i)));
          if (cancelled) return;
          pages.forEach((p, i) => {
            const vp = p.getViewport({ scale: 1 });
            all[start - 1 + i] = vp.height / vp.width;
          });
          setRatios(all.slice());
        }
      })
      .catch(() => !cancelled && setError("Không mở được tài liệu này"));
    return () => {
      cancelled = true;
    };
  }, [docId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setBox({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pageWidth = Math.max(160, (box.width - GAP * 2) * zoom);
  const innerWidth = Math.max(box.width, pageWidth + GAP * 2);
  const layout = useMemo(() => {
    const tops: number[] = [];
    const heights: number[] = [];
    let y = GAP;
    for (const r of ratios) {
      tops.push(y);
      heights.push(pageWidth * r);
      y += pageWidth * r + GAP;
    }
    return { tops, heights, total: y };
  }, [ratios, pageWidth]);

  const cell = (i: number) => ({ start: layout.tops[i] - GAP, size: layout.heights[i] + GAP });

  const scrollToPosition = (pos: ViewerPosition) => {
    const el = scrollRef.current;
    if (!el || !layout.tops.length) return;
    const i = Math.min(Math.max(pos.page - 1, 0), layout.tops.length - 1);
    const c = cell(i);
    ignoreUntil.current = performance.now() + 300;
    el.scrollTop = c.start + Math.min(Math.max(pos.y_ratio, 0), 1) * c.size;
  };

  const positionAt = (top: number): ViewerPosition | null => {
    if (!layout.tops.length) return null;
    let i = 0;
    while (i + 1 < layout.tops.length && cell(i + 1).start <= top) i++;
    const c = cell(i);
    return { page: i + 1, y_ratio: Math.min(Math.max((top - c.start) / c.size, 0), 1) };
  };

  // keep the reader where they were whenever the layout changes (zoom, resize, exact page sizes arriving)
  useLayoutEffect(() => {
    if (!layout.tops.length || box.width === 0) return;
    scrollToPosition(desired.current);
    if (!reported.current) {
      reported.current = true;
      onPositionRef.current(desired.current, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, box.width]);

  useEffect(() => {
    if (!jump) return;
    desired.current = { page: jump.page, y_ratio: jump.y_ratio };
    scrollToPosition(desired.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump?.nonce]);

  const onScroll = () => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const el = scrollRef.current;
      if (!el) return;
      setScroll({ top: el.scrollTop });
      const pos = positionAt(el.scrollTop);
      if (!pos) return;
      desired.current = pos;
      onPositionRef.current(pos, performance.now() > ignoreUntil.current);
    });
  };

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  if (error) return <div className="empty">{error}</div>;

  return (
    <div className="viewer-scroll" ref={scrollRef} onScroll={onScroll}>
      {!pdf && <div className="empty">Đang tải tài liệu…</div>}
      {pdf && (
        <div style={{ position: "relative", width: innerWidth, height: layout.total }}>
          {layout.tops.map((top, i) => {
            const visible = top + layout.heights[i] > scroll.top - PRELOAD && top < scroll.top + box.height + PRELOAD;
            return (
              <PdfPage
                key={i}
                pdf={pdf}
                pageNo={i + 1}
                left={(innerWidth - pageWidth) / 2}
                top={top}
                width={pageWidth}
                height={layout.heights[i]}
                visible={visible}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

interface PageProps {
  pdf: PDFDocumentProxy;
  pageNo: number;
  left: number;
  top: number;
  width: number;
  height: number;
  visible: boolean;
}

const PdfPage = memo(function PdfPage({ pdf, pageNo, left, top, width, height, visible }: PageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!visible) {
      canvas.width = 0; // release the bitmap of pages that scrolled far away
      canvas.height = 0;
      return;
    }
    let cancelled = false;
    let task: RenderTask | null = null;
    (async () => {
      const page = await pdf.getPage(pageNo);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / base.width });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      task = page.render({ canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
      try {
        await task.promise;
      } catch {
        /* render cancelled because the page scrolled away or was resized */
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, pageNo, width, visible]);

  return (
    <div className="pdf-page" style={{ left, top, width, height }}>
      <canvas ref={canvasRef} />
    </div>
  );
});
