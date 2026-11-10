import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  Scan,
  Copy,
  Check,
  Search,
  AlertCircle,
  Loader2,
  Sparkles,
  Layers,
  FileText,
  Eye,
  Edit3,
  Wand2,
  ShieldCheck,
  Type,
  MousePointer,
} from "lucide-react";
import { DocumentOcrInspection, PageOcrResult } from "../types";
import {
  inspectDocumentOcr,
  recognizePageText,
  applyOcrSearchableLayer,
  correctScannedRegion,
  reconstructScannedDocument,
} from "../services/api";

interface OcrModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  currentPage: number;
  totalPages: number;
  onOcrSuccess: (message: string) => void;
}

export const OcrModal: React.FC<OcrModalProps> = ({
  isOpen,
  onClose,
  documentId,
  currentPage,
  totalPages,
  onOcrSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<"searchable" | "correction" | "reconstruct">("searchable");
  const [inspection, setInspection] = useState<DocumentOcrInspection | null>(null);
  const [loadingInspection, setLoadingInspection] = useState(false);
  const [pageOcrResult, setPageOcrResult] = useState<PageOcrResult | null>(null);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [isApplyingLayer, setIsApplyingLayer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [layerScope, setLayerScope] = useState<"current" | "all">("all");
  const [dpi, setDpi] = useState<number>(150);

  // Region correction state
  const [bboxX0, setBboxX0] = useState<number>(50);
  const [bboxY0, setBboxY0] = useState<number>(50);
  const [bboxX1, setBboxX1] = useState<number>(200);
  const [bboxY1, setBboxY1] = useState<number>(80);
  const [replacementText, setReplacementText] = useState<string>("");
  const [fontName, setFontName] = useState<string>("Helvetica");
  const [autoFontSize, setAutoFontSize] = useState<boolean>(true);
  const [fontSize, setFontSize] = useState<number>(12);
  const [textColor, setTextColor] = useState<string>("#000000");
  const [backgroundColor, setBackgroundColor] = useState<string>("#FFFFFF");
  const [cleanupRaster, setCleanupRaster] = useState<boolean>(true);
  const [isCorrecting, setIsCorrecting] = useState<boolean>(false);

  // Reconstruction state
  const [reconMode, setReconMode] = useState<"clean_vector" | "overlay_redact">("clean_vector");
  const [reconScope, setReconScope] = useState<"current" | "all">("current");
  const [reconFont, setReconFont] = useState<string>("Helvetica");
  const [reconDpi, setReconDpi] = useState<number>(150);
  const [reconCreateNewDoc, setReconCreateNewDoc] = useState<boolean>(false);
  const [reconNewTitle, setReconNewTitle] = useState<string>("");
  const [isReconstructing, setIsReconstructing] = useState<boolean>(false);

  // Load document OCR inspection
  const loadInspection = useCallback(async () => {
    if (!documentId) return;
    setLoadingInspection(true);
    try {
      const data = await inspectDocumentOcr(documentId);
      setInspection(data);
    } catch (err: any) {
      console.error("Failed to inspect document for OCR:", err);
    } finally {
      setLoadingInspection(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (isOpen) {
      loadInspection();
      setPageOcrResult(null);
      setError(null);
      setCopied(false);
      setSearchFilter("");
    }
  }, [isOpen, loadInspection, currentPage]);

  const currentPageIndex = currentPage - 1;
  const isCurrentPageScanned = inspection?.scanned_pages.includes(currentPageIndex);

  // Recognize text on current page
  const handleRecognizeText = async () => {
    setError(null);
    setIsRecognizing(true);
    try {
      const result = await recognizePageText(documentId, currentPageIndex, "eng", dpi);
      setPageOcrResult(result);
    } catch (err: any) {
      setError(err.message || "OCR recognition failed");
    } finally {
      setIsRecognizing(false);
    }
  };

  // Copy recognized text
  const handleCopyText = async () => {
    if (!pageOcrResult?.extracted_text) return;
    try {
      await navigator.clipboard.writeText(pageOcrResult.extracted_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  };

  // Apply invisible searchable layer
  const handleApplyLayer = async () => {
    setError(null);
    setIsApplyingLayer(true);
    try {
      const targetIndices =
        layerScope === "current"
          ? [currentPageIndex]
          : inspection?.scanned_pages && inspection.scanned_pages.length > 0
          ? inspection.scanned_pages
          : undefined;

      const res = await applyOcrSearchableLayer(documentId, targetIndices, "eng", dpi);
      onOcrSuccess(
        `Applied searchable OCR layer to ${
          layerScope === "current" ? `Page ${currentPage}` : "all scanned pages"
        } (Child rev ${res.revision.id.slice(0, 8)})`
      );
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to generate searchable layer");
    } finally {
      setIsApplyingLayer(false);
    }
  };

  // Select token to auto-populate region correction inputs
  const handleSelectToken = (tokenText: string, bbox: [number, number, number, number]) => {
    setBboxX0(bbox[0]);
    setBboxY0(bbox[1]);
    setBboxX1(bbox[2]);
    setBboxY1(bbox[3]);
    setReplacementText(tokenText);
  };

  // Submit region correction
  const handleApplyRegionCorrection = async () => {
    if (bboxX1 <= bboxX0 || bboxY1 <= bboxY0) {
      setError("Bounding box width and height must be positive (X1 > X0, Y1 > Y0).");
      return;
    }
    setError(null);
    setIsCorrecting(true);
    try {
      const res = await correctScannedRegion(documentId, {
        page_index: currentPageIndex,
        bbox: [bboxX0, bboxY0, bboxX1, bboxY1],
        replacement_text: replacementText,
        font_name: fontName,
        font_size: autoFontSize ? undefined : fontSize,
        text_color: textColor,
        background_color: backgroundColor,
        cleanup_raster: cleanupRaster,
      });
      onOcrSuccess(
        `Corrected scanned region on Page ${currentPage} (Child rev ${res.revision.id.slice(0, 8)})`
      );
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to correct scanned region");
    } finally {
      setIsCorrecting(false);
    }
  };

  // Submit layout reconstruction
  const handleApplyReconstruction = async () => {
    setError(null);
    setIsReconstructing(true);
    try {
      const targetIndices =
        reconScope === "current"
          ? [currentPageIndex]
          : inspection?.scanned_pages && inspection.scanned_pages.length > 0
          ? inspection.scanned_pages
          : undefined;

      const res = await reconstructScannedDocument(documentId, {
        page_indices: targetIndices,
        mode: reconMode,
        font_name: reconFont,
        language: "eng",
        dpi: reconDpi,
        create_new_document: reconCreateNewDoc,
        new_title: reconCreateNewDoc ? reconNewTitle || "Reconstructed Document.pdf" : undefined,
      });

      if (reconCreateNewDoc) {
        onOcrSuccess(`Created reconstructed document: "${res.document.title}"`);
      } else {
        onOcrSuccess(
          `Reconstructed layout for ${
            reconScope === "current" ? `Page ${currentPage}` : "all scanned pages"
          } (Child rev ${res.revision.id.slice(0, 8)})`
        );
      }
      onClose();
    } catch (err: any) {
      setError(err.message || "Layout reconstruction failed");
    } finally {
      setIsReconstructing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center">
              <Scan className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-100 text-sm">Local OCR & Scanned Document Studio</h2>
              <p className="text-[11px] text-slate-400">
                Page {currentPage} of {totalPages} • 100% Offline Optical Character Recognition
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-4 pt-2 gap-2 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("searchable")}
            className={`pb-2 px-3 border-b-2 font-medium flex items-center gap-1.5 transition ${
              activeTab === "searchable"
                ? "border-sky-500 text-sky-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Searchable Layer</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("correction")}
            className={`pb-2 px-3 border-b-2 font-medium flex items-center gap-1.5 transition ${
              activeTab === "correction"
                ? "border-sky-500 text-sky-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Scanned Region Correction</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("reconstruct")}
            className={`pb-2 px-3 border-b-2 font-medium flex items-center gap-1.5 transition ${
              activeTab === "reconstruct"
                ? "border-sky-500 text-sky-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span>Page Reconstruction</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1 text-xs">
          {error && (
            <div className="p-3 bg-red-950/40 border border-red-900 rounded-xl flex items-start gap-2.5 text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Scanned Page Diagnostic Banner */}
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
              isCurrentPageScanned
                ? "bg-amber-950/30 border-amber-900/80 text-amber-300"
                : "bg-slate-950/40 border-slate-800 text-slate-300"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                  isCurrentPageScanned ? "bg-amber-500/20 text-amber-400" : "bg-sky-500/10 text-sky-400"
                }`}
              >
                {isCurrentPageScanned ? <Scan className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
              </div>
              <div>
                <p className="font-semibold text-xs">
                  {loadingInspection
                    ? "Inspecting document raster layers..."
                    : isCurrentPageScanned
                    ? `Page ${currentPage} is a Scanned Raster Image`
                    : `Page ${currentPage} Contains Native Vector Text`}
                </p>
                <p className="text-[10px] opacity-80">
                  {inspection && (
                    <span>
                      {inspection.scanned_pages.length} of {inspection.total_pages} pages detected as
                      scanned images.
                    </span>
                  )}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRecognizeText}
              disabled={isRecognizing}
              className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-semibold flex items-center gap-1.5 shadow-md shadow-sky-600/20 transition disabled:opacity-50"
            >
              {isRecognizing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Scanning...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Run OCR</span>
                </>
              )}
            </button>
          </div>

          {/* TAB 1: Searchable OCR Layer */}
          {activeTab === "searchable" && (
            <>
              {pageOcrResult && (
                <div className="space-y-2 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-200">Extracted Text</span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] font-mono text-sky-400">
                        {pageOcrResult.word_count} words recognized
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleCopyText}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-300">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-slate-400" />
                          <span>Copy Text</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Keyword Filter */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Filter extracted words..."
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1 text-slate-200 text-xs font-mono"
                    />
                  </div>

                  {/* Text content area */}
                  <div className="bg-slate-900 border border-slate-800/80 rounded-lg p-3 max-h-40 overflow-y-auto font-mono text-[11px] text-slate-300 whitespace-pre-wrap select-text leading-relaxed">
                    {pageOcrResult.extracted_text.trim() ? (
                      searchFilter.trim() ? (
                        pageOcrResult.extracted_text
                          .split(new RegExp(`(${searchFilter})`, "gi"))
                          .map((part, i) =>
                            part.toLowerCase() === searchFilter.toLowerCase() ? (
                              <mark key={i} className="bg-amber-400 text-slate-950 font-bold px-0.5 rounded">
                                {part}
                              </mark>
                            ) : (
                              part
                            )
                          )
                      ) : (
                        pageOcrResult.extracted_text
                      )
                    ) : (
                      <span className="text-slate-500 italic">No text recognized on this page.</span>
                    )}
                  </div>
                </div>
              )}

              {/* Inject Invisible Searchable Text Layer */}
              <div className="space-y-3 bg-slate-950/40 p-3.5 rounded-xl border border-slate-800">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-sky-400" />
                  <div>
                    <h3 className="font-semibold text-slate-200 text-xs">Generate Searchable PDF (Invisible Layer)</h3>
                    <p className="text-[10px] text-slate-400">
                      Injects an invisible vector text layer (<code className="text-sky-300">renderMode=3</code>) exactly aligned with the scan.
                      Text becomes selectable, searchable via Ctrl+F, and copyable without altering image quality.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-slate-400 text-[10px] mb-1">OCR Processing Scope</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setLayerScope("current")}
                        className={`py-1.5 px-2 rounded-lg border text-center text-[11px] transition ${
                          layerScope === "current"
                            ? "bg-sky-600/20 border-sky-500 text-sky-300 font-medium"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        Page {currentPage}
                      </button>

                      <button
                        type="button"
                        onClick={() => setLayerScope("all")}
                        className={`py-1.5 px-2 rounded-lg border text-center text-[11px] transition ${
                          layerScope === "all"
                            ? "bg-sky-600/20 border-sky-500 text-sky-300 font-medium"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        All Scanned ({inspection?.scanned_pages.length || totalPages})
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-400 text-[10px] mb-1">OCR Sampling Resolution</label>
                    <select
                      value={dpi}
                      onChange={(e) => setDpi(parseInt(e.target.value, 10))}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs font-mono"
                    >
                      <option value="150">150 DPI (Balanced Speed & Accuracy)</option>
                      <option value="300">300 DPI (High Resolution Scan)</option>
                      <option value="72">72 DPI (Fast Draft)</option>
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleApplyLayer}
                  disabled={isApplyingLayer}
                  className="w-full py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-sky-600/20 transition disabled:opacity-50 mt-1"
                >
                  {isApplyingLayer ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Injecting Searchable Layer (Creating Child Revision)...</span>
                    </>
                  ) : (
                    <>
                      <Layers className="w-3.5 h-3.5" />
                      <span>
                        Make PDF Searchable & Selectable (
                        {layerScope === "current" ? "1 Page" : `${inspection?.scanned_pages.length || totalPages} Pages`})
                      </span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {/* TAB 2: Scanned Region Correction */}
          {activeTab === "correction" && (
            <div className="space-y-4">
              {/* Architecture Alert / Transparency */}
              <div className="p-3 bg-slate-950/70 border border-sky-900/60 rounded-xl flex items-start gap-2.5 text-slate-300">
                <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <span className="font-semibold text-sky-300">Scanned Document Correction: </span>
                  Cleans/redacts the underlying raster scan pixels within the target bounding box and stamps sharp vector typography over the patch.
                  Original source files remain immutable; creates an auditable child revision.
                </div>
              </div>

              {/* Detected Token Cloud */}
              {pageOcrResult && pageOcrResult.words.length > 0 && (
                <div className="space-y-2 bg-slate-950/40 p-3 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                      <MousePointer className="w-3.5 h-3.5 text-sky-400" />
                      Click an OCR token to auto-fill bounding box:
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {pageOcrResult.words.length} tokens available
                    </span>
                  </div>
                  <div className="max-h-24 overflow-y-auto flex flex-wrap gap-1.5 p-1">
                    {pageOcrResult.words.slice(0, 50).map((w, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectToken(w.text, w.bbox)}
                        className="px-2 py-0.5 bg-slate-800 hover:bg-sky-700/40 hover:text-sky-200 text-slate-300 rounded font-mono text-[10px] border border-slate-700/60 transition"
                      >
                        {w.text}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Bounding Box Coordinates */}
              <div className="space-y-2 bg-slate-950/40 p-3.5 rounded-xl border border-slate-800">
                <label className="block text-slate-300 font-semibold text-xs">
                  Target Bounding Box Coordinates (PDF Points)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-0.5">X0 (Left)</span>
                    <input
                      type="number"
                      step="1"
                      value={bboxX0}
                      onChange={(e) => setBboxX0(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-0.5">Y0 (Top)</span>
                    <input
                      type="number"
                      step="1"
                      value={bboxY0}
                      onChange={(e) => setBboxY0(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-0.5">X1 (Right)</span>
                    <input
                      type="number"
                      step="1"
                      value={bboxX1}
                      onChange={(e) => setBboxX1(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-0.5">Y1 (Bottom)</span>
                    <input
                      type="number"
                      step="1"
                      value={bboxY1}
                      onChange={(e) => setBboxY1(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs"
                    />
                  </div>
                </div>
                <div className="text-[10px] text-slate-500 font-mono pt-0.5">
                  Region Dimensions: {Math.max(0, Math.round(bboxX1 - bboxX0))} pt width × {Math.max(0, Math.round(bboxY1 - bboxY0))} pt height
                </div>
              </div>

              {/* Replacement Text & Typography */}
              <div className="space-y-3 bg-slate-950/40 p-3.5 rounded-xl border border-slate-800">
                <div>
                  <label className="block text-slate-300 font-semibold text-xs mb-1">
                    Corrected / Replacement Text
                  </label>
                  <input
                    type="text"
                    value={replacementText}
                    onChange={(e) => setReplacementText(e.target.value)}
                    placeholder="Enter corrected text string..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-100 text-xs font-mono focus:border-sky-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 text-[10px] mb-1">Font Family</label>
                    <select
                      value={fontName}
                      onChange={(e) => setFontName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-slate-200 text-xs font-mono"
                    >
                      <option value="Helvetica">Helvetica (Standard Sans)</option>
                      <option value="Helvetica-Bold">Helvetica Bold</option>
                      <option value="Times-Roman">Times-Roman (Serif)</option>
                      <option value="Times-Bold">Times Bold</option>
                      <option value="Courier">Courier (Monospace)</option>
                      <option value="Courier-Bold">Courier Bold</option>
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-slate-400 text-[10px]">Font Size (pt)</label>
                      <label className="flex items-center gap-1 text-[10px] text-sky-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={autoFontSize}
                          onChange={(e) => setAutoFontSize(e.target.checked)}
                          className="rounded border-slate-700 bg-slate-900 text-sky-500"
                        />
                        <span>Auto-fit to box</span>
                      </label>
                    </div>
                    <input
                      type="number"
                      min="6"
                      max="72"
                      disabled={autoFontSize}
                      value={fontSize}
                      onChange={(e) => setFontSize(parseFloat(e.target.value) || 12)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs disabled:opacity-40"
                    />
                  </div>
                </div>

                {/* Colors & Raster Cleanup */}
                <div className="grid grid-cols-3 gap-3 pt-1">
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-1">Text Color</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={textColor}
                        onChange={(e) => setTextColor(e.target.value)}
                        className="w-7 h-7 rounded border border-slate-700 bg-transparent cursor-pointer shrink-0"
                      />
                      <input
                        type="text"
                        value={textColor}
                        onChange={(e) => setTextColor(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-slate-300 font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block mb-1">Background Patch</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={backgroundColor}
                        onChange={(e) => setBackgroundColor(e.target.value)}
                        className="w-7 h-7 rounded border border-slate-700 bg-transparent cursor-pointer shrink-0"
                      />
                      <input
                        type="text"
                        value={backgroundColor}
                        onChange={(e) => setBackgroundColor(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-slate-300 font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col justify-end">
                    <label className="flex items-center gap-2 p-1.5 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer text-slate-300 hover:text-white">
                      <input
                        type="checkbox"
                        checked={cleanupRaster}
                        onChange={(e) => setCleanupRaster(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-950 text-sky-500 shrink-0"
                      />
                      <span className="text-[10px] leading-tight font-medium">Clean/Redact Underlying Scan Pixels</span>
                    </label>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleApplyRegionCorrection}
                disabled={isCorrecting}
                className="w-full py-2.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-sky-600/20 transition disabled:opacity-50"
              >
                {isCorrecting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Applying Correction (Creating Child Revision)...</span>
                  </>
                ) : (
                  <>
                    <Edit3 className="w-4 h-4" />
                    <span>Apply Scanned Region Correction</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* TAB 3: Page Reconstruction */}
          {activeTab === "reconstruct" && (
            <div className="space-y-4">
              <div className="p-3 bg-slate-950/70 border border-indigo-900/60 rounded-xl flex items-start gap-2.5 text-slate-300">
                <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <span className="font-semibold text-indigo-300">Document Layout Reconstruction: </span>
                  Extracts all OCR layout blocks and synthesizes crisp, selectable vector typography at detected coordinates.
                  Ideal for converting blurry or faded scanned documents into clean, modern PDFs.
                </div>
              </div>

              <div className="space-y-3 bg-slate-950/40 p-3.5 rounded-xl border border-slate-800">
                <div>
                  <label className="block text-slate-300 font-semibold text-xs mb-1.5">Reconstruction Mode</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setReconMode("clean_vector")}
                      className={`p-3 rounded-xl border text-left transition ${
                        reconMode === "clean_vector"
                          ? "bg-indigo-600/20 border-indigo-500 text-indigo-200"
                          : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      <div className="font-semibold text-xs flex items-center gap-1.5 mb-1">
                        <Type className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Clean Vector Document</span>
                      </div>
                      <p className="text-[10px] opacity-75">
                        Removes noisy background scan image completely; reconstructs all text blocks onto a pure white canvas.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setReconMode("overlay_redact")}
                      className={`p-3 rounded-xl border text-left transition ${
                        reconMode === "overlay_redact"
                          ? "bg-indigo-600/20 border-indigo-500 text-indigo-200"
                          : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      <div className="font-semibold text-xs flex items-center gap-1.5 mb-1">
                        <Layers className="w-3.5 h-3.5 text-indigo-400" />
                        <span>In-Place Vector Overlay</span>
                      </div>
                      <p className="text-[10px] opacity-75">
                        Wipes raster pixels underneath each detected block and typesets sharp vector fonts at their exact coordinates.
                      </p>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-1">
                  <div>
                    <label className="block text-slate-400 text-[10px] mb-1">Target Scope</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setReconScope("current")}
                        className={`py-1.5 px-2 rounded-lg border text-center text-[11px] transition ${
                          reconScope === "current"
                            ? "bg-indigo-600/20 border-indigo-500 text-indigo-300 font-medium"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        Page {currentPage}
                      </button>

                      <button
                        type="button"
                        onClick={() => setReconScope("all")}
                        className={`py-1.5 px-2 rounded-lg border text-center text-[11px] transition ${
                          reconScope === "all"
                            ? "bg-indigo-600/20 border-indigo-500 text-indigo-300 font-medium"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        All ({inspection?.scanned_pages.length || totalPages})
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-400 text-[10px] mb-1">Font Family</label>
                    <select
                      value={reconFont}
                      onChange={(e) => setReconFont(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-slate-200 text-xs font-mono"
                    >
                      <option value="Helvetica">Helvetica</option>
                      <option value="Times-Roman">Times-Roman</option>
                      <option value="Courier">Courier</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 text-[10px] mb-1">OCR Resolution</label>
                    <select
                      value={reconDpi}
                      onChange={(e) => setReconDpi(parseInt(e.target.value, 10))}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-slate-200 text-xs font-mono"
                    >
                      <option value="150">150 DPI</option>
                      <option value="300">300 DPI</option>
                      <option value="72">72 DPI</option>
                    </select>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800/80">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white mb-2">
                    <input
                      type="checkbox"
                      checked={reconCreateNewDoc}
                      onChange={(e) => setReconCreateNewDoc(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-950 text-indigo-500"
                    />
                    <span className="text-xs font-medium">Create as a new standalone document in catalog</span>
                  </label>

                  {reconCreateNewDoc && (
                    <input
                      type="text"
                      placeholder="Title for reconstructed document..."
                      value={reconNewTitle}
                      onChange={(e) => setReconNewTitle(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-100 text-xs font-mono"
                    />
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={handleApplyReconstruction}
                disabled={isReconstructing}
                className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition disabled:opacity-50"
              >
                {isReconstructing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Reconstructing Document Layout...</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4" />
                    <span>
                      Reconstruct {reconScope === "current" ? `Page ${currentPage}` : "All Scanned Pages"} Layout
                    </span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-900/90">
          <span className="text-[10px] text-slate-500 font-mono">
            Engine: PyMuPDF Embedded Tesseract • English (eng) • 100% Offline
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
