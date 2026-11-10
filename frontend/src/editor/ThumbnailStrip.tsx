import React, { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import {
  RotateCw,
  ArrowUp,
  ArrowDown,
  Copy,
  Trash2,
} from "lucide-react";

const MAX_CACHED_THUMBNAILS = 60;

interface ThumbnailStripProps {
  pdfDocument: pdfjsLib.PDFDocumentProxy | null;
  currentPage: number;
  onPageSelect: (pageNumber: number) => void;
  onRotatePage?: (pageIndex: number) => void;
  onMovePage?: (pageIndex: number, direction: "up" | "down") => void;
  onDuplicatePage?: (pageIndex: number) => void;
  onDeletePage?: (pageIndex: number) => void;
  isOperating?: boolean;
}

export const ThumbnailStrip: React.FC<ThumbnailStripProps> = ({
  pdfDocument,
  currentPage,
  onPageSelect,
  onRotatePage,
  onMovePage,
  onDuplicatePage,
  onDeletePage,
  isOperating = false,
}) => {
  const [thumbMap, setThumbMap] = useState<Record<number, string>>({});
  const [jumpInput, setJumpInput] = useState("");

  const listRef = useRef<HTMLDivElement | null>(null);
  const cardElsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const visiblePagesRef = useRef<Set<number>>(new Set());
  const lruCacheRef = useRef<Map<number, string>>(new Map());
  const failedPagesRef = useRef<Set<number>>(new Set());
  const activeDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const workerRunningRef = useRef(false);
  const isMountedRef = useRef(true);
  const currentPageRef = useRef(currentPage);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  const pumpRenderQueue = useCallback(async () => {
    if (workerRunningRef.current) return;
    const doc = activeDocRef.current;
    if (!doc) return;

    workerRunningRef.current = true;
    try {
      while (isMountedRef.current && activeDocRef.current === doc) {
        const candidates: number[] = [];
        const cur = currentPageRef.current;
        if (
          cur >= 1 &&
          cur <= doc.numPages &&
          !lruCacheRef.current.has(cur) &&
          !failedPagesRef.current.has(cur)
        ) {
          candidates.push(cur);
        }

        const visibleSorted = Array.from(visiblePagesRef.current).sort((a, b) => a - b);
        for (const p of visibleSorted) {
          if (
            p >= 1 &&
            p <= doc.numPages &&
            p !== cur &&
            !lruCacheRef.current.has(p) &&
            !failedPagesRef.current.has(p)
          ) {
            candidates.push(p);
          }
        }

        if (candidates.length === 0) break;

        const targetPage = candidates[0];
        let canvas: HTMLCanvasElement | null = null;
        try {
          const page = await doc.getPage(targetPage);
          if (!isMountedRef.current || activeDocRef.current !== doc) break;

          const viewport = page.getViewport({ scale: 0.22 });
          canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d", { alpha: false });
          if (ctx) {
            canvas.height = Math.max(1, Math.floor(viewport.height));
            canvas.width = Math.max(1, Math.floor(viewport.width));
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({
              canvasContext: ctx,
              viewport,
            }).promise;

            if (!isMountedRef.current || activeDocRef.current !== doc) break;
            const url = canvas.toDataURL("image/jpeg", 0.65);

            // Insert into LRU cache and evict oldest non-visible pages beyond limit
            lruCacheRef.current.delete(targetPage);
            lruCacheRef.current.set(targetPage, url);

            while (lruCacheRef.current.size > MAX_CACHED_THUMBNAILS) {
              let evictedKey: number | null = null;
              for (const k of lruCacheRef.current.keys()) {
                if (k !== currentPageRef.current && !visiblePagesRef.current.has(k)) {
                  evictedKey = k;
                  break;
                }
              }
              if (evictedKey === null) {
                const firstKey = lruCacheRef.current.keys().next().value;
                if (firstKey === undefined) break;
                evictedKey = firstKey;
              }
              lruCacheRef.current.delete(evictedKey);
            }

            const snapshot: Record<number, string> = {};
            lruCacheRef.current.forEach((v, k) => {
              snapshot[k] = v;
            });
            setThumbMap(snapshot);
          }
        } catch (err) {
          console.error(`Failed rendering thumbnail for page ${targetPage}:`, err);
          failedPagesRef.current.add(targetPage);
        } finally {
          if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
            canvas = null;
          }
        }
      }
    } finally {
      workerRunningRef.current = false;
    }
  }, []);

  // Reset cache cleanly whenever pdfDocument changes
  useEffect(() => {
    isMountedRef.current = true;
    activeDocRef.current = pdfDocument;
    lruCacheRef.current.clear();
    failedPagesRef.current.clear();
    setThumbMap({});

    if (!pdfDocument) {
      visiblePagesRef.current.clear();
      return;
    }

    const initial = new Set<number>([currentPageRef.current]);
    for (let p = 1; p <= Math.min(8, pdfDocument.numPages); p++) {
      initial.add(p);
    }
    visiblePagesRef.current = initial;
    pumpRenderQueue();

    return () => {
      isMountedRef.current = false;
    };
  }, [pdfDocument, pumpRenderQueue]);

  // Setup IntersectionObserver over thumbnail list so 500+ page docs render lazily on scroll
  useEffect(() => {
    const rootEl = listRef.current;
    if (!rootEl || !pdfDocument) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let added = false;
        for (const entry of entries) {
          const attr = (entry.target as HTMLElement).dataset.page;
          if (!attr) continue;
          const pNum = parseInt(attr, 10);
          if (Number.isNaN(pNum)) continue;
          if (entry.isIntersecting) {
            if (!visiblePagesRef.current.has(pNum)) {
              visiblePagesRef.current.add(pNum);
              added = true;
            }
          } else {
            visiblePagesRef.current.delete(pNum);
          }
        }
        if (added) {
          pumpRenderQueue();
        }
      },
      {
        root: rootEl,
        rootMargin: "320px 0px",
        threshold: 0.01,
      }
    );

    cardElsRef.current.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
    };
  }, [pdfDocument, pumpRenderQueue]);

  // Ensure currentPage thumbnail renders and scrolls smoothly into view when user jumps pages
  useEffect(() => {
    if (!pdfDocument) return;
    visiblePagesRef.current.add(currentPage);
    if (!lruCacheRef.current.has(currentPage)) {
      pumpRenderQueue();
    }
    const card = cardElsRef.current.get(currentPage);
    if (card) {
      card.scrollIntoView({ block: "nearest" });
    }
  }, [currentPage, pdfDocument, pumpRenderQueue]);

  if (!pdfDocument) return null;

  const numPages = pdfDocument.numPages;

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(jumpInput.trim(), 10);
    if (!Number.isNaN(n) && n >= 1 && n <= numPages) {
      onPageSelect(n);
      setJumpInput("");
    }
  };

  return (
    <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-full select-none shrink-0">
      {/* Sidebar header */}
      <div className="p-3 border-b border-slate-800 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Pages ({numPages})
          </span>
          {onRotatePage && (
            <button
              onClick={() => onRotatePage(currentPage - 1)}
              disabled={isOperating}
              title="Rotate current page 90° clockwise"
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-sky-400 transition disabled:opacity-50 flex items-center gap-1 text-[11px]"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isOperating ? "animate-spin" : ""}`} />
              <span>Rotate</span>
            </button>
          )}
        </div>

        {numPages > 8 && (
          <form onSubmit={handleJumpSubmit} className="flex items-center gap-1.5">
            <input
              type="number"
              min={1}
              max={numPages}
              value={jumpInput}
              onChange={(e) => setJumpInput(e.target.value)}
              placeholder={`Go to page (1-${numPages})`}
              aria-label="Jump to page number"
              className="flex-1 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-200 focus:border-sky-500 focus:outline-none"
            />
            <button
              type="submit"
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-medium text-slate-200 transition"
            >
              Go
            </button>
          </form>
        )}
      </div>

      {/* Virtualized / lazy-rendered thumbnail list */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {Array.from({ length: numPages }, (_, index) => {
          const pageNum = index + 1;
          const isSelected = pageNum === currentPage;
          const url = thumbMap[pageNum];

          return (
            <div
              key={pageNum}
              data-page={pageNum}
              ref={(el) => {
                if (el) {
                  cardElsRef.current.set(pageNum, el);
                } else {
                  cardElsRef.current.delete(pageNum);
                }
              }}
              onClick={() => onPageSelect(pageNum)}
              className={`group cursor-pointer rounded-lg p-2 transition flex flex-col items-center border relative ${
                isSelected
                  ? "bg-sky-950/40 border-sky-500 shadow-md shadow-sky-500/20"
                  : "bg-slate-950/40 border-slate-800/80 hover:border-slate-700 hover:bg-slate-800/50"
              }`}
            >
              <div className="w-full flex items-center justify-between text-[11px] mb-1.5 px-0.5">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`font-mono font-medium ${
                      isSelected ? "text-sky-400 font-bold" : "text-slate-400"
                    }`}
                  >
                    P. {pageNum}
                  </span>
                  {isSelected && (
                    <span className="w-2 h-2 rounded-full bg-sky-400 ring-2 ring-sky-900"></span>
                  )}
                </div>

                {/* Per-page quick actions toolbar */}
                <div
                  className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition"
                  onClick={(e) => e.stopPropagation()}
                >
                  {onMovePage && (
                    <>
                      <button
                        onClick={() => onMovePage(index, "up")}
                        disabled={index === 0 || isOperating}
                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-20"
                        title="Move Page Up"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => onMovePage(index, "down")}
                        disabled={index === numPages - 1 || isOperating}
                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-20"
                        title="Move Page Down"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </>
                  )}
                  {onDuplicatePage && (
                    <button
                      onClick={() => onDuplicatePage(index)}
                      disabled={isOperating}
                      className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-20"
                      title="Duplicate Page"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  )}
                  {onDeletePage && (
                    <button
                      onClick={() => onDeletePage(index)}
                      disabled={numPages <= 1 || isOperating}
                      className="p-1 rounded hover:bg-red-950/50 text-slate-400 hover:text-red-400 disabled:opacity-20"
                      title={numPages <= 1 ? "Cannot delete the only page" : "Delete Page"}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              <div className="w-full bg-white rounded shadow flex items-center justify-center overflow-hidden h-[150px]">
                {url ? (
                  <img
                    src={url}
                    alt={`Thumbnail of page ${pageNum}`}
                    className="w-full h-full object-contain pointer-events-none"
                  />
                ) : (
                  <div className="text-slate-400 text-[11px] font-mono">Page {pageNum}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
