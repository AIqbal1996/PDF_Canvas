import React, { useState } from "react";
import {
  X,
  Sliders,
  Crop,
  Heading,
  Check,
  Loader2,
  FileSpreadsheet,
} from "lucide-react";
import {
  resizePages,
  cropPages,
  applyHeaderFooter,
  HeaderFooterPayload,
} from "../services/api";

interface PageFormattingModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  currentPage: number;
  totalPages: number;
  onFormattingSuccess: (msg: string) => void;
}

type TabType = "resize" | "crop" | "header_footer";

export const PageFormattingModal: React.FC<PageFormattingModalProps> = ({
  isOpen,
  onClose,
  documentId,
  currentPage,
  totalPages,
  onFormattingSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>("resize");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resize tab states
  const [targetSize, setTargetSize] = useState("A4");
  const [resizeScope, setResizeScope] = useState<"current" | "all">("all");
  const [scaleContent, setScaleContent] = useState(true);

  // Crop tab states
  const [cropLeft, setCropLeft] = useState(0);
  const [cropTop, setCropTop] = useState(0);
  const [cropRight, setCropRight] = useState(0);
  const [cropBottom, setCropBottom] = useState(0);
  const [cropScope, setCropScope] = useState<"current" | "all">("current");

  // Header & Footer tab states
  const [headerLeft, setHeaderLeft] = useState("");
  const [headerCenter, setHeaderCenter] = useState("");
  const [headerRight, setHeaderRight] = useState("");
  const [footerLeft, setFooterLeft] = useState("");
  const [footerCenter, setFooterCenter] = useState("Page {page} of {total}");
  const [footerRight, setFooterRight] = useState("");
  const [fontSize, setFontSize] = useState(9);
  const [skipFirstPage, setSkipFirstPage] = useState(false);
  const [edgeMargin, setEdgeMargin] = useState(36);

  if (!isOpen) return null;

  const handleResize = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const pageIndices = resizeScope === "current" ? [currentPage - 1] : undefined;
      await resizePages(documentId, targetSize, pageIndices, scaleContent);
      onFormattingSuccess(
        `Resized ${resizeScope === "current" ? `Page ${currentPage}` : "all pages"} to ${targetSize}`
      );
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to resize pages");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCrop = async () => {
    if (cropLeft === 0 && cropTop === 0 && cropRight === 0 && cropBottom === 0) {
      setError("Please specify at least one crop margin greater than 0.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const pageIndices = cropScope === "current" ? [currentPage - 1] : undefined;
      await cropPages(
        documentId,
        cropLeft,
        cropTop,
        cropRight,
        cropBottom,
        pageIndices
      );
      onFormattingSuccess(
        `Cropped ${cropScope === "current" ? `Page ${currentPage}` : "all pages"}`
      );
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to crop pages");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleHeaderFooter = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const payload: HeaderFooterPayload = {
        header_left: headerLeft.trim() || null,
        header_center: headerCenter.trim() || null,
        header_right: headerRight.trim() || null,
        footer_left: footerLeft.trim() || null,
        footer_center: footerCenter.trim() || null,
        footer_right: footerRight.trim() || null,
        font_size: fontSize,
        margin: edgeMargin,
        skip_first_page: skipFirstPage,
      };
      await applyHeaderFooter(documentId, payload);
      onFormattingSuccess("Applied headers, footers & page numbers");
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to apply header/footer");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-100 text-sm">Page Layout & Formatting</h2>
              <p className="text-[11px] text-slate-400">Standardize sizes, crop margins, and apply page numbering</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-800 bg-slate-950/50 px-4 gap-1 text-xs font-medium">
          <button
            onClick={() => {
              setActiveTab("resize");
              setError(null);
            }}
            className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition ${
              activeTab === "resize"
                ? "border-sky-500 text-sky-400 font-semibold"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Resize Size
          </button>
          <button
            onClick={() => {
              setActiveTab("crop");
              setError(null);
            }}
            className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition ${
              activeTab === "crop"
                ? "border-sky-500 text-sky-400 font-semibold"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Crop className="w-3.5 h-3.5" /> Crop & Margins
          </button>
          <button
            onClick={() => {
              setActiveTab("header_footer");
              setError(null);
            }}
            className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition ${
              activeTab === "header_footer"
                ? "border-sky-500 text-sky-400 font-semibold"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Heading className="w-3.5 h-3.5" /> Headers & Footers
          </button>
        </div>

        {/* Body content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-red-950/50 border border-red-800 rounded-lg text-red-300">
              {error}
            </div>
          )}

          {/* TAB 1: RESIZE */}
          {activeTab === "resize" && (
            <div className="space-y-4">
              <div>
                <label className="block text-slate-300 font-medium mb-1.5">Standard Paper Size</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { id: "A4", name: "A4 Standard", dim: "210 x 297 mm" },
                    { id: "Letter", name: "US Letter", dim: "8.5 x 11 in" },
                    { id: "A3", name: "A3 Large", dim: "297 x 420 mm" },
                    { id: "Legal", name: "US Legal", dim: "8.5 x 14 in" },
                    { id: "Tabloid", name: "US Tabloid", dim: "11 x 17 in" },
                  ].map((sz) => (
                    <button
                      key={sz.id}
                      type="button"
                      onClick={() => setTargetSize(sz.id)}
                      className={`p-2.5 rounded-lg border text-left transition ${
                        targetSize === sz.id
                          ? "bg-sky-950/50 border-sky-500 text-sky-300 shadow-sm shadow-sky-500/20"
                          : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <div className="font-semibold text-slate-200">{sz.name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{sz.dim}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1.5">Apply Scope</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setResizeScope("all")}
                    className={`p-2 rounded-lg border text-center transition ${
                      resizeScope === "all"
                        ? "bg-sky-500/20 border-sky-500 text-sky-300"
                        : "bg-slate-950/60 border-slate-800 text-slate-400"
                    }`}
                  >
                    All Pages ({totalPages} pages)
                  </button>
                  <button
                    type="button"
                    onClick={() => setResizeScope("current")}
                    className={`p-2 rounded-lg border text-center transition ${
                      resizeScope === "current"
                        ? "bg-sky-500/20 border-sky-500 text-sky-300"
                        : "bg-slate-950/60 border-slate-800 text-slate-400"
                    }`}
                  >
                    Current Page Only (Page {currentPage})
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="scaleContent"
                  checked={scaleContent}
                  onChange={(e) => setScaleContent(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-sky-600 focus:ring-sky-500"
                />
                <label htmlFor="scaleContent" className="text-slate-300 select-none cursor-pointer">
                  Proportionally scale existing page content to fit new dimensions
                </label>
              </div>
            </div>
          )}

          {/* TAB 2: CROP & MARGINS */}
          {activeTab === "crop" && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-slate-300 font-medium">Crop Margins (Points, 72 pt = 1 inch)</label>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => {
                        setCropLeft(18);
                        setCropTop(18);
                        setCropRight(18);
                        setCropBottom(18);
                      }}
                      className="text-sky-400 hover:text-sky-300"
                    >
                      +0.25 in
                    </button>
                    <span className="text-slate-600">•</span>
                    <button
                      type="button"
                      onClick={() => {
                        setCropLeft(36);
                        setCropTop(36);
                        setCropRight(36);
                        setCropBottom(36);
                      }}
                      className="text-sky-400 hover:text-sky-300"
                    >
                      +0.5 in
                    </button>
                    <span className="text-slate-600">•</span>
                    <button
                      type="button"
                      onClick={() => {
                        setCropLeft(0);
                        setCropTop(0);
                        setCropRight(0);
                        setCropBottom(0);
                      }}
                      className="text-slate-400 hover:text-slate-300"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Top Margin (pt)</label>
                    <input
                      type="number"
                      min="0"
                      value={cropTop}
                      onChange={(e) => setCropTop(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Bottom Margin (pt)</label>
                    <input
                      type="number"
                      min="0"
                      value={cropBottom}
                      onChange={(e) => setCropBottom(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Left Margin (pt)</label>
                    <input
                      type="number"
                      min="0"
                      value={cropLeft}
                      onChange={(e) => setCropLeft(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">Right Margin (pt)</label>
                    <input
                      type="number"
                      min="0"
                      value={cropRight}
                      onChange={(e) => setCropRight(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500 font-mono text-xs"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1.5">Apply Scope</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCropScope("current")}
                    className={`p-2 rounded-lg border text-center transition ${
                      cropScope === "current"
                        ? "bg-sky-500/20 border-sky-500 text-sky-300"
                        : "bg-slate-950/60 border-slate-800 text-slate-400"
                    }`}
                  >
                    Current Page (Page {currentPage})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCropScope("all")}
                    className={`p-2 rounded-lg border text-center transition ${
                      cropScope === "all"
                        ? "bg-sky-500/20 border-sky-500 text-sky-300"
                        : "bg-slate-950/60 border-slate-800 text-slate-400"
                    }`}
                  >
                    All Pages ({totalPages} pages)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: HEADERS & FOOTERS */}
          {activeTab === "header_footer" && (
            <div className="space-y-4">
              <div>
                <label className="block text-slate-300 font-medium mb-1.5">Top Headers</label>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="Header Left"
                    value={headerLeft}
                    onChange={(e) => setHeaderLeft(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-sky-500 font-mono"
                  />
                  <input
                    type="text"
                    placeholder="Header Center"
                    value={headerCenter}
                    onChange={(e) => setHeaderCenter(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-sky-500 font-mono"
                  />
                  <input
                    type="text"
                    placeholder="Header Right"
                    value={headerRight}
                    onChange={(e) => setHeaderRight(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-sky-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1.5">
                  Bottom Footers & Page Numbering
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="Footer Left"
                    value={footerLeft}
                    onChange={(e) => setFooterLeft(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-sky-500 font-mono"
                  />
                  <input
                    type="text"
                    placeholder="Footer Center (e.g. Page {page} of {total})"
                    value={footerCenter}
                    onChange={(e) => setFooterCenter(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-sky-500 font-mono"
                  />
                  <input
                    type="text"
                    placeholder="Footer Right"
                    value={footerRight}
                    onChange={(e) => setFooterRight(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-sky-500 font-mono"
                  />
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-500">
                  <span>Dynamic Tokens:</span>
                  <code className="bg-slate-800 px-1 py-0.5 rounded text-sky-400">{"{page}"}</code>
                  <code className="bg-slate-800 px-1 py-0.5 rounded text-sky-400">{"{total}"}</code>
                  <code className="bg-slate-800 px-1 py-0.5 rounded text-sky-400">{"{title}"}</code>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">Font Size (pt)</label>
                  <select
                    value={fontSize}
                    onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs"
                  >
                    <option value="8">8 pt</option>
                    <option value="9">9 pt (Standard)</option>
                    <option value="10">10 pt</option>
                    <option value="12">12 pt</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">Margin from Edge (pt)</label>
                  <input
                    type="number"
                    min="15"
                    max="100"
                    value={edgeMargin}
                    onChange={(e) => setEdgeMargin(parseInt(e.target.value, 10) || 36)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="skipFirstPage"
                  checked={skipFirstPage}
                  onChange={(e) => setSkipFirstPage(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900 text-sky-600 focus:ring-sky-500"
                />
                <label htmlFor="skipFirstPage" className="text-slate-300 select-none cursor-pointer">
                  Skip headers and footers on first page (Cover page)
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-end gap-3 bg-slate-900/90">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-slate-400 hover:text-slate-200 text-xs font-medium hover:bg-slate-800 transition"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (activeTab === "resize") handleResize();
              else if (activeTab === "crop") handleCrop();
              else handleHeaderFooter();
            }}
            disabled={isSubmitting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium shadow-md shadow-sky-600/20 transition disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing...
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>
                  {activeTab === "resize"
                    ? "Apply Page Resize"
                    : activeTab === "crop"
                    ? "Apply Crop"
                    : "Apply Headers & Footers"}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
