import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  Wrench,
  Droplets,
  Gauge,
  Bookmark,
  GitCompare,
  Plus,
  Trash2,
  Sparkles,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import {
  BookmarkItem,
  CompressionResult,
  Document,
  DocumentComparisonReport,
  Revision,
} from "../types";
import {
  applyDocumentWatermark,
  compareDocuments,
  compressDocumentPdf,
  fetchDocuments,
  getComparePageDiffImageUrl,
  getDocumentBookmarks,
  suggestDocumentBookmarks,
  updateDocumentBookmarks,
} from "../services/api";

interface UtilitiesModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  documentTitle: string;
  currentPage: number;
  totalPages: number;
  revisions: Revision[];
  onUtilitySuccess: (message: string) => void;
}

const WATERMARK_FONTS = [
  "Helvetica-Bold",
  "Helvetica",
  "Times-Bold",
  "Times-Roman",
  "Courier-Bold",
  "Courier",
];

export const UtilitiesModal: React.FC<UtilitiesModalProps> = ({
  isOpen,
  onClose,
  documentId,
  documentTitle,
  currentPage,
  totalPages,
  revisions,
  onUtilitySuccess,
}) => {
  const [activeTab, setActiveTab] = useState<
    "watermark" | "compress" | "bookmarks" | "compare"
  >("watermark");
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // --- Watermark State ---
  const [wmText, setWmText] = useState("CONFIDENTIAL");
  const [wmFont, setWmFont] = useState("Helvetica-Bold");
  const [wmSize, setWmSize] = useState(54);
  const [wmColor, setWmColor] = useState("#64748b");
  const [wmOpacity, setWmOpacity] = useState(0.22);
  const [wmRotation, setWmRotation] = useState(45);
  const [wmPosition, setWmPosition] = useState<"center" | "top" | "bottom" | "tile">(
    "center"
  );
  const [wmLayer, setWmLayer] = useState<"over" | "under">("over");
  const [wmScope, setWmScope] = useState<"all" | "current">("all");
  const [isApplyingWm, setIsApplyingWm] = useState(false);

  // --- Compression State ---
  const [compressMode, setCompressMode] = useState<"lossless" | "balanced" | "compact">(
    "lossless"
  );
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressResult, setCompressResult] = useState<CompressionResult | null>(null);

  // --- Bookmarks State ---
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [isLoadingBookmarks, setIsLoadingBookmarks] = useState(false);
  const [isSavingBookmarks, setIsSavingBookmarks] = useState(false);

  // --- Compare State ---
  const [catalogDocs, setCatalogDocs] = useState<Document[]>([]);
  const [compareMode, setCompareMode] = useState<"document" | "revision">("revision");
  const [revAId, setRevAId] = useState<string>("");
  const [revBId, setRevBId] = useState<string>("");
  const [targetDocBId, setTargetDocBId] = useState<string>("");
  const [isComparing, setIsComparing] = useState(false);
  const [compareReport, setCompareReport] = useState<DocumentComparisonReport | null>(
    null
  );
  const [selectedDiffPage, setSelectedDiffPage] = useState<number>(0);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const loadBookmarks = useCallback(async () => {
    if (!documentId) return;
    setIsLoadingBookmarks(true);
    setError(null);
    try {
      const data = await getDocumentBookmarks(documentId);
      setBookmarks(data.bookmarks);
    } catch (err: any) {
      setError(err.message || "Failed to load document bookmarks");
    } finally {
      setIsLoadingBookmarks(false);
    }
  }, [documentId]);

  const loadCatalogForCompare = useCallback(async () => {
    try {
      const docs = await fetchDocuments();
      setCatalogDocs(docs);
      const other = docs.find((d) => d.id !== documentId);
      if (other) {
        setTargetDocBId((prev) => prev || other.id);
      } else {
        setTargetDocBId(documentId);
      }
    } catch {
      // ignore catalog load failures when modal opens
    }
  }, [documentId]);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setStatusMsg(null);
    if (revisions.length > 0) {
      setRevAId(revisions[0].id);
      setRevBId(revisions[revisions.length - 1].id);
    }
    loadBookmarks();
    loadCatalogForCompare();
  }, [isOpen, revisions, loadBookmarks, loadCatalogForCompare]);

  if (!isOpen) return null;

  // --- Watermark Handlers ---
  const handleApplyWatermark = async () => {
    if (!wmText.trim()) {
      setError("Watermark text cannot be empty.");
      return;
    }
    setIsApplyingWm(true);
    setError(null);
    setStatusMsg(null);
    try {
      await applyDocumentWatermark(documentId, {
        text: wmText.trim(),
        font_name: wmFont,
        font_size: wmSize,
        color: wmColor,
        opacity: wmOpacity,
        rotation: wmRotation,
        position: wmPosition,
        layer: wmLayer,
        page_indices: wmScope === "current" ? [currentPage - 1] : null,
      });
      onUtilitySuccess(`Applied "${wmText.trim()}" watermark (${wmPosition})`);
      setStatusMsg(`Watermark revision created (${wmPosition}, ${wmLayer} layer).`);
    } catch (err: any) {
      setError(err.message || "Failed to apply watermark");
    } finally {
      setIsApplyingWm(false);
    }
  };

  // --- Compression Handlers ---
  const handleCompress = async () => {
    setIsCompressing(true);
    setError(null);
    setStatusMsg(null);
    try {
      const res = await compressDocumentPdf(documentId, compressMode);
      setCompressResult(res);
      onUtilitySuccess(
        `Optimized (${res.mode}): ${formatBytes(res.original_bytes)} -> ${formatBytes(
          res.compressed_bytes
        )}`
      );
    } catch (err: any) {
      setError(err.message || "PDF compression failed");
    } finally {
      setIsCompressing(false);
    }
  };

  // --- Bookmark Handlers ---
  const handleSuggestBookmarks = async () => {
    setIsLoadingBookmarks(true);
    setError(null);
    try {
      const suggested = await suggestDocumentBookmarks(documentId);
      setBookmarks(suggested);
      setStatusMsg(
        `Detected ${suggested.length} heading entries. Review and click "Save Outline" to apply.`
      );
    } catch (err: any) {
      setError(err.message || "Auto-detect headings failed");
    } finally {
      setIsLoadingBookmarks(false);
    }
  };

  const handleAddBookmark = () => {
    setBookmarks((prev) => [
      ...prev,
      {
        level: 1,
        title: `Section ${prev.length + 1}`,
        page_index: Math.max(0, Math.min(totalPages - 1, currentPage - 1)),
      },
    ]);
  };

  const handleSaveBookmarks = async () => {
    setIsSavingBookmarks(true);
    setError(null);
    setStatusMsg(null);
    try {
      await updateDocumentBookmarks(documentId, bookmarks);
      onUtilitySuccess(`Saved ${bookmarks.length} document outline bookmarks`);
      setStatusMsg("Document bookmarks saved to a new child revision.");
    } catch (err: any) {
      setError(err.message || "Failed to save bookmarks");
    } finally {
      setIsSavingBookmarks(false);
    }
  };

  const moveBookmark = (idx: number, dir: -1 | 1) => {
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= bookmarks.length) return;
    const copy = [...bookmarks];
    const tmp = copy[idx];
    copy[idx] = copy[nextIdx];
    copy[nextIdx] = tmp;
    setBookmarks(copy);
  };

  // --- Compare Handlers ---
  const handleRunCompare = async () => {
    setIsComparing(true);
    setError(null);
    setCompareReport(null);
    try {
      const req =
        compareMode === "revision"
          ? {
              document_a_id: documentId,
              revision_a_id: revAId || null,
              document_b_id: documentId,
              revision_b_id: revBId || null,
              max_pages: 25,
            }
          : {
              document_a_id: documentId,
              document_b_id: targetDocBId || documentId,
              max_pages: 25,
            };
      const rep = await compareDocuments(req);
      setCompareReport(rep);
      const firstChanged = rep.page_diffs.find((p) => p.text_changed || p.visual_changed);
      setSelectedDiffPage(firstChanged ? firstChanged.page_index : 0);
    } catch (err: any) {
      setError(err.message || "Document comparison failed");
    } finally {
      setIsComparing(false);
    }
  };

  const activeDiffPage =
    compareReport?.page_diffs.find((p) => p.page_index === selectedDiffPage) ||
    compareReport?.page_diffs[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/95">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-100 text-sm">
                Advanced PDF Utilities
              </h2>
              <p className="text-[11px] text-slate-400">
                100% Local Watermarks, Compression, Hierarchical Bookmarks & Visual/Text Diff
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 px-4 gap-2 text-xs overflow-x-auto">
          <button
            onClick={() => {
              setActiveTab("watermark");
              setError(null);
            }}
            className={`py-2.5 px-3 border-b-2 font-medium flex items-center gap-1.5 whitespace-nowrap transition ${
              activeTab === "watermark"
                ? "border-amber-400 text-amber-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Droplets className="w-3.5 h-3.5" /> Watermark
          </button>
          <button
            onClick={() => {
              setActiveTab("compress");
              setError(null);
            }}
            className={`py-2.5 px-3 border-b-2 font-medium flex items-center gap-1.5 whitespace-nowrap transition ${
              activeTab === "compress"
                ? "border-sky-400 text-sky-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Gauge className="w-3.5 h-3.5" /> Compress / Optimize
          </button>
          <button
            onClick={() => {
              setActiveTab("bookmarks");
              setError(null);
            }}
            className={`py-2.5 px-3 border-b-2 font-medium flex items-center gap-1.5 whitespace-nowrap transition ${
              activeTab === "bookmarks"
                ? "border-indigo-400 text-indigo-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" /> Bookmarks ({bookmarks.length})
          </button>
          <button
            onClick={() => {
              setActiveTab("compare");
              setError(null);
            }}
            className={`py-2.5 px-3 border-b-2 font-medium flex items-center gap-1.5 whitespace-nowrap transition ${
              activeTab === "compare"
                ? "border-emerald-400 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <GitCompare className="w-3.5 h-3.5" /> Compare Diff
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800 rounded-lg text-red-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {statusMsg && (
            <div className="p-3 bg-emerald-950/50 border border-emerald-800 rounded-lg text-emerald-200 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{statusMsg}</span>
            </div>
          )}

          {/* TAB 1: WATERMARK */}
          {activeTab === "watermark" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-slate-400">Presets:</span>
                {["CONFIDENTIAL", "DRAFT", "APPROVED", "DO NOT DISTRIBUTE"].map(
                  (preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setWmText(preset)}
                      className={`px-2.5 py-1 rounded-md border text-[11px] font-medium transition ${
                        wmText === preset
                          ? "bg-amber-500/20 border-amber-500/60 text-amber-300"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {preset}
                    </button>
                  )
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950/50 border border-slate-800 rounded-xl p-4">
                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      Watermark Text
                    </label>
                    <input
                      type="text"
                      value={wmText}
                      onChange={(e) => setWmText(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 mb-1">Font</label>
                      <select
                        value={wmFont}
                        onChange={(e) => setWmFont(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200"
                      >
                        {WATERMARK_FONTS.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Font Size (pt)</label>
                      <input
                        type="number"
                        min={10}
                        max={160}
                        value={wmSize}
                        onChange={(e) => setWmSize(Number(e.target.value) || 48)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 mb-1">Text Color</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={wmColor}
                          onChange={(e) => setWmColor(e.target.value)}
                          className="h-8 w-10 rounded border border-slate-700 bg-slate-900"
                        />
                        <input
                          type="text"
                          value={wmColor}
                          onChange={(e) => setWmColor(e.target.value)}
                          className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-300 font-mono text-[11px]"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">
                        Opacity ({Math.round(wmOpacity * 100)}%)
                      </label>
                      <input
                        type="range"
                        min={0.05}
                        max={0.95}
                        step={0.05}
                        value={wmOpacity}
                        onChange={(e) => setWmOpacity(Number(e.target.value))}
                        className="w-full mt-2 accent-amber-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      Placement Layout
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(["center", "top", "bottom", "tile"] as const).map((pos) => (
                        <button
                          key={pos}
                          type="button"
                          onClick={() => setWmPosition(pos)}
                          className={`py-1.5 rounded-lg border text-[11px] capitalize font-medium transition ${
                            wmPosition === pos
                              ? "bg-amber-500/20 border-amber-500 text-amber-300"
                              : "bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          {pos}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">
                      Rotation Angle ({wmRotation}°)
                    </label>
                    <input
                      type="range"
                      min={-90}
                      max={90}
                      step={5}
                      value={wmRotation}
                      onChange={(e) => setWmRotation(Number(e.target.value))}
                      className="w-full accent-amber-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 mb-1">Layer Depth</label>
                      <select
                        value={wmLayer}
                        onChange={(e) =>
                          setWmLayer(e.target.value as "over" | "under")
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200"
                      >
                        <option value="over">Over Content (Foreground)</option>
                        <option value="under">Under Content (Background)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Page Scope</label>
                      <select
                        value={wmScope}
                        onChange={(e) =>
                          setWmScope(e.target.value as "all" | "current")
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200"
                      >
                        <option value="all">All Pages ({totalPages})</option>
                        <option value="current">Current Page ({currentPage})</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleApplyWatermark}
                  disabled={isApplyingWm}
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  {isApplyingWm ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Droplets className="w-3.5 h-3.5" />
                  )}
                  Apply Watermark Revision
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: COMPRESS / OPTIMIZE */}
          {activeTab === "compress" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  {
                    id: "lossless" as const,
                    title: "Lossless Stream Deflate",
                    badge: "Zero Quality Loss",
                    desc: "Deduplicates identical objects, purges orphaned bytes (garbage=4), and compresses streams with zlib + object streams.",
                  },
                  {
                    id: "balanced" as const,
                    title: "Balanced Web (120 DPI)",
                    badge: "Recommended",
                    desc: "Preserves crisp vector text while downsampling embedded high-DPI images above 150 DPI to 120 DPI JPEG (78% quality).",
                  },
                  {
                    id: "compact" as const,
                    title: "Compact Archival (80 DPI)",
                    badge: "Smallest Size",
                    desc: "Aggressively optimizes raster images above 100 DPI down to 80 DPI JPEG (58% quality) for minimal disk footprint.",
                  },
                ].map((opt) => {
                  const selected = compressMode === opt.id;
                  return (
                    <div
                      key={opt.id}
                      onClick={() => setCompressMode(opt.id)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition space-y-1.5 ${
                        selected
                          ? "bg-sky-950/40 border-sky-500 text-slate-100"
                          : "bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-100">{opt.title}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                          {opt.badge}
                        </span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-slate-400">
                        {opt.desc}
                      </p>
                    </div>
                  );
                })}
              </div>

              {compressResult && (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase">Original</div>
                    <div className="text-sm font-semibold text-slate-200 mt-0.5">
                      {formatBytes(compressResult.original_bytes)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase">Optimized</div>
                    <div className="text-sm font-semibold text-sky-400 mt-0.5">
                      {formatBytes(compressResult.compressed_bytes)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase">Delta</div>
                    <div className="text-sm font-semibold text-emerald-400 mt-0.5">
                      {compressResult.saved_bytes >= 0
                        ? `-${formatBytes(compressResult.saved_bytes)}`
                        : `+${formatBytes(Math.abs(compressResult.saved_bytes))}`}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase">Reduction</div>
                    <div className="text-sm font-semibold text-emerald-300 mt-0.5">
                      {compressResult.reduction_percent}%
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={handleCompress}
                  disabled={isCompressing}
                  className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  {isCompressing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Gauge className="w-3.5 h-3.5" />
                  )}
                  Optimize & Create Child Revision
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: BOOKMARKS / OUTLINE */}
          {activeTab === "bookmarks" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                <div className="text-[11px] text-slate-400">
                  First bookmark must be <strong className="text-slate-200">Level 1</strong>; child levels can step down at most +1 level at a time.
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSuggestBookmarks}
                    disabled={isLoadingBookmarks}
                    className="px-3 py-1.5 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-700/60 text-indigo-300 font-medium flex items-center gap-1.5 transition"
                  >
                    {isLoadingBookmarks ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    Auto-Detect Headings
                  </button>
                  <button
                    onClick={handleAddBookmark}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-medium flex items-center gap-1 transition"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Item
                  </button>
                </div>
              </div>

              {bookmarks.length === 0 ? (
                <div className="p-8 text-center border border-slate-800 rounded-xl bg-slate-950/30 text-slate-400">
                  No bookmarks found in this PDF. Click <strong>Auto-Detect Headings</strong> or{" "}
                  <strong>Add Item</strong> to create an interactive document outline.
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {bookmarks.map((bm, idx) => (
                    <div
                      key={idx}
                      className="flex flex-wrap sm:flex-nowrap items-center gap-2 p-2.5 rounded-lg bg-slate-950/70 border border-slate-800"
                    >
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] text-slate-500">Lvl</span>
                        <select
                          value={bm.level}
                          onChange={(e) => {
                            const lvl = Number(e.target.value);
                            setBookmarks((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, level: lvl } : item
                              )
                            );
                          }}
                          className="bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-200 text-[11px]"
                        >
                          {[1, 2, 3, 4, 5, 6].map((l) => (
                            <option key={l} value={l}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </div>

                      <input
                        type="text"
                        value={bm.title}
                        onChange={(e) => {
                          const title = e.target.value;
                          setBookmarks((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, title } : item
                            )
                          );
                        }}
                        style={{ paddingLeft: `${Math.min(bm.level - 1, 4) * 10 + 8}px` }}
                        className="flex-1 min-w-[160px] bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
                        placeholder="Bookmark title..."
                      />

                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] text-slate-500">Page</span>
                        <input
                          type="number"
                          min={1}
                          max={totalPages}
                          value={bm.page_index + 1}
                          onChange={(e) => {
                            const p1 = Math.max(
                              1,
                              Math.min(totalPages, Number(e.target.value) || 1)
                            );
                            setBookmarks((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, page_index: p1 - 1 } : item
                              )
                            );
                          }}
                          className="w-14 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 text-center"
                        />
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => moveBookmark(idx, -1)}
                          disabled={idx === 0}
                          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30"
                          title="Move Up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => moveBookmark(idx, 1)}
                          disabled={idx === bookmarks.length - 1}
                          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30"
                          title="Move Down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() =>
                            setBookmarks((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="p-1 rounded hover:bg-red-950/60 text-slate-400 hover:text-red-400"
                          title="Remove Bookmark"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end pt-1">
                <button
                  onClick={handleSaveBookmarks}
                  disabled={isSavingBookmarks}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  {isSavingBookmarks ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Bookmark className="w-3.5 h-3.5" />
                  )}
                  Save Outline Revision
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: COMPARE DOCUMENTS / REVISIONS */}
          {activeTab === "compare" && (
            <div className="space-y-4">
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCompareMode("revision")}
                      className={`px-3 py-1 rounded-lg border text-[11px] font-medium transition ${
                        compareMode === "revision"
                          ? "bg-emerald-500/20 border-emerald-500 text-emerald-300"
                          : "bg-slate-900 border-slate-700 text-slate-400"
                      }`}
                    >
                      Compare Revisions ({revisions.length})
                    </button>
                    <button
                      onClick={() => setCompareMode("document")}
                      className={`px-3 py-1 rounded-lg border text-[11px] font-medium transition ${
                        compareMode === "document"
                          ? "bg-emerald-500/20 border-emerald-500 text-emerald-300"
                          : "bg-slate-900 border-slate-700 text-slate-400"
                      }`}
                    >
                      Compare vs Another PDF
                    </button>
                  </div>

                  <button
                    onClick={handleRunCompare}
                    disabled={isComparing}
                    className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-1.5 transition disabled:opacity-50"
                  >
                    {isComparing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <GitCompare className="w-3.5 h-3.5" />
                    )}
                    Run Diff Comparison
                  </button>
                </div>

                {compareMode === "revision" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 mb-1">
                        Baseline Revision (A)
                      </label>
                      <select
                        value={revAId}
                        onChange={(e) => setRevAId(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-[11px]"
                      >
                        {revisions.map((r, i) => (
                          <option key={r.id} value={r.id}>
                            #{i + 1} {r.operation.replace(/_/g, " ")} ({r.id.slice(0, 8)})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">
                        Target Revision (B)
                      </label>
                      <select
                        value={revBId}
                        onChange={(e) => setRevBId(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-[11px]"
                      >
                        {revisions.map((r, i) => (
                          <option key={r.id} value={r.id}>
                            #{i + 1} {r.operation.replace(/_/g, " ")} ({r.id.slice(0, 8)})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 mb-1">Source PDF (A)</label>
                      <div className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-300 truncate">
                        {documentTitle}
                      </div>
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Target PDF (B)</label>
                      <select
                        value={targetDocBId}
                        onChange={(e) => setTargetDocBId(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs"
                      >
                        {catalogDocs.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.title} ({d.page_count}p)
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Comparison Output */}
              {compareReport && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center bg-slate-950 border border-slate-800 rounded-xl p-3">
                    <div>
                      <div className="text-[10px] text-slate-500">PAGES (A / B)</div>
                      <div className="font-semibold text-slate-200">
                        {compareReport.pages_a} / {compareReport.pages_b}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500">COMPARED</div>
                      <div className="font-semibold text-slate-200">
                        {compareReport.pages_compared}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500">IDENTICAL</div>
                      <div className="font-semibold text-emerald-400">
                        {compareReport.identical_pages}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500">CHANGED</div>
                      <div className="font-semibold text-rose-400">
                        {compareReport.changed_pages}
                      </div>
                    </div>
                  </div>

                  {/* Page Picker */}
                  <div className="flex flex-wrap gap-1.5">
                    {compareReport.page_diffs.map((p) => {
                      const hasDiff = p.text_changed || p.visual_changed;
                      const isSel = selectedDiffPage === p.page_index;
                      return (
                        <button
                          key={p.page_index}
                          onClick={() => setSelectedDiffPage(p.page_index)}
                          className={`px-2.5 py-1 rounded-md border text-[11px] font-medium transition ${
                            isSel
                              ? "ring-1 ring-sky-400 border-sky-400 bg-sky-950/60 text-white"
                              : hasDiff
                              ? "border-rose-700/60 bg-rose-950/30 text-rose-300"
                              : "border-emerald-800/50 bg-emerald-950/20 text-emerald-300"
                          }`}
                        >
                          Page {p.page_index + 1}{" "}
                          {hasDiff ? `(${p.visual_diff_percent}% px)` : "✓"}
                        </button>
                      );
                    })}
                  </div>

                  {/* Active Page Unified Diff + Pixel Diff Image */}
                  {activeDiffPage && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-slate-200">
                            Text Diff — Page {activeDiffPage.page_index + 1}
                          </span>
                          <span className="text-[11px] text-slate-400 font-mono">
                            Similarity {Math.round(activeDiffPage.text_similarity * 100)}% • +
                            {activeDiffPage.added_lines} / -{activeDiffPage.removed_lines}
                          </span>
                        </div>
                        <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 font-mono text-[11px] max-h-64 overflow-y-auto space-y-0.5">
                          {activeDiffPage.diff_lines.length === 0 ? (
                            <div className="text-emerald-400">
                              Identical extracted text on this page.
                            </div>
                          ) : (
                            activeDiffPage.diff_lines.map((line, i) => (
                              <div
                                key={i}
                                className={
                                  line.startsWith("+") && !line.startsWith("+++")
                                    ? "bg-emerald-950/60 text-emerald-300 px-1 rounded"
                                    : line.startsWith("-") && !line.startsWith("---")
                                    ? "bg-rose-950/60 text-rose-300 px-1 rounded"
                                    : line.startsWith("@@")
                                    ? "text-sky-400"
                                    : "text-slate-400"
                                }
                              >
                                {line}
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-slate-200">
                            Visual Pixel Overlay (Red = Delta)
                          </span>
                          <span className="text-[11px] text-rose-300 font-mono">
                            {activeDiffPage.visual_diff_percent}% pixels changed
                          </span>
                        </div>
                        <div className="bg-slate-900 border border-slate-800 rounded-lg p-2 flex items-center justify-center max-h-64 overflow-auto">
                          <img
                            src={getComparePageDiffImageUrl(
                              compareReport.document_a_id,
                              compareReport.document_b_id,
                              activeDiffPage.page_index,
                              compareMode === "revision" ? revAId : null,
                              compareMode === "revision" ? revBId : null,
                              120
                            )}
                            alt={`Visual diff page ${activeDiffPage.page_index + 1}`}
                            className="max-h-56 w-auto rounded shadow border border-slate-700"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-900/95 text-xs">
          <span className="text-[11px] text-slate-500">
            All transformations preserve originals and record deterministic child revisions.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
