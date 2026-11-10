import React, { useState, useEffect, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  Copy,
  Trash2,
  Scissors,
  Sliders,
  GitCommit,
  Download,
  Sidebar,
  CheckCircle2,
  Loader2,
  Type,
  Image as ImageIcon,
  FileSpreadsheet,
  Scan,
  FileCheck2,
  PenTool,
  Shield,
  Wrench,
  Sparkles,
} from "lucide-react";
import { DocumentDetail } from "../types";
import {
  fetchDocumentDetail,
  rotatePage,
  reorderPages,
  deletePages,
  duplicatePage,
  getRevisionContentUrl,
  getExportUrl,
} from "../services/api";
import { PdfViewer } from "../editor/PdfViewer";
import { ThumbnailStrip } from "../editor/ThumbnailStrip";
import { RevisionDrawer } from "../components/RevisionDrawer";
import { ExtractModal } from "../components/ExtractModal";
import { PageFormattingModal } from "../components/PageFormattingModal";
import { ContentEditorModal } from "../components/ContentEditorModal";
import { ImageEditorModal } from "../components/ImageEditorModal";
import { ExportImagesModal } from "../components/ExportImagesModal";
import { OcrModal } from "../components/OcrModal";
import { FormEditorModal } from "../components/FormEditorModal";
import { SignatureModal } from "../components/SignatureModal";
import { SecurityModal } from "../components/SecurityModal";
import { UtilitiesModal } from "../components/UtilitiesModal";
import { AIAssistantModal } from "../components/AIAssistantModal";

interface EditorPageProps {
  documentId: string;
  onBackToDashboard: () => void;
  onOpenDocument?: (docId: string) => void;
}

export const EditorPage: React.FC<EditorPageProps> = ({
  documentId,
  onBackToDashboard,
  onOpenDocument,
}) => {
  const [docDetail, setDocDetail] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editor states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [zoomScale, setZoomScale] = useState(1.2);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [isOperating, setIsOperating] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isExtractModalOpen, setIsExtractModalOpen] = useState(false);
  const [isFormattingModalOpen, setIsFormattingModalOpen] = useState(false);
  const [isContentModalOpen, setIsContentModalOpen] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [isExportImagesModalOpen, setIsExportImagesModalOpen] = useState(false);
  const [isOcrModalOpen, setIsOcrModalOpen] = useState(false);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [isUtilitiesModalOpen, setIsUtilitiesModalOpen] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [statusNotification, setStatusNotification] = useState<string | null>(null);

  const loadDocument = useCallback(async () => {
    try {
      setLoading(true);
      const detail = await fetchDocumentDetail(documentId);
      setDocDetail(detail);
      setError(null);
    } catch (err: any) {
      console.error("Failed to load document detail:", err);
      setError(err.message || "Failed to load document");
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    loadDocument();
  }, [loadDocument]);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  const handleDocumentLoaded = useCallback((pdf: pdfjsLib.PDFDocumentProxy) => {
    setPdfDoc(pdf);
    setCurrentPage((prev) => (prev > pdf.numPages ? Math.max(1, pdf.numPages) : prev));
  }, []);

  const notify = (msg: string) => {
    setStatusNotification(msg);
    setTimeout(() => setStatusNotification(null), 4000);
  };

  // Rotate
  const handleRotatePage = async (pageIndex: number, degrees: number = 90) => {
    if (!docDetail || isOperating) return;
    setIsOperating(true);
    try {
      const res = await rotatePage(documentId, pageIndex, degrees);
      const updatedDetail = await fetchDocumentDetail(documentId);
      setDocDetail(updatedDetail);
      notify(
        `Page ${pageIndex + 1} rotated ${degrees}° • Child rev ${res.revision.id.slice(0, 8)}`
      );
    } catch (err: any) {
      alert("Page rotation failed: " + (err.message || err));
    } finally {
      setIsOperating(false);
    }
  };

  // Duplicate
  const handleDuplicatePage = async (pageIndex: number) => {
    if (!docDetail || isOperating) return;
    setIsOperating(true);
    try {
      const res = await duplicatePage(documentId, pageIndex, 1);
      const updatedDetail = await fetchDocumentDetail(documentId);
      setDocDetail(updatedDetail);
      notify(
        `Duplicated page ${pageIndex + 1} • New total: ${res.document.page_count} pages`
      );
    } catch (err: any) {
      alert("Page duplication failed: " + (err.message || err));
    } finally {
      setIsOperating(false);
    }
  };

  // Delete
  const handleDeletePage = async (pageIndex: number) => {
    if (!docDetail || isOperating) return;
    const total = pdfDoc ? pdfDoc.numPages : docDetail.document.page_count;
    if (total <= 1) {
      alert("Cannot delete the only page in a document.");
      return;
    }
    if (!confirm(`Are you sure you want to delete page ${pageIndex + 1}?`)) {
      return;
    }
    setIsOperating(true);
    try {
      const res = await deletePages(documentId, [pageIndex]);
      const updatedDetail = await fetchDocumentDetail(documentId);
      setDocDetail(updatedDetail);
      if (currentPage > res.document.page_count) {
        setCurrentPage(Math.max(1, res.document.page_count));
      }
      notify(`Deleted page ${pageIndex + 1} • New total: ${res.document.page_count} pages`);
    } catch (err: any) {
      alert("Page deletion failed: " + (err.message || err));
    } finally {
      setIsOperating(false);
    }
  };

  // Move / Reorder
  const handleMovePage = async (pageIndex: number, direction: "up" | "down") => {
    if (!docDetail || isOperating) return;
    const total = pdfDoc ? pdfDoc.numPages : docDetail.document.page_count;
    const targetIndex = direction === "up" ? pageIndex - 1 : pageIndex + 1;
    if (targetIndex < 0 || targetIndex >= total) return;

    const newOrder = Array.from({ length: total }, (_, i) => i);
    newOrder[pageIndex] = targetIndex;
    newOrder[targetIndex] = pageIndex;

    setIsOperating(true);
    try {
      await reorderPages(documentId, newOrder);
      const updatedDetail = await fetchDocumentDetail(documentId);
      setDocDetail(updatedDetail);
      setCurrentPage(targetIndex + 1);
      notify(`Moved page ${pageIndex + 1} to position ${targetIndex + 1}`);
    } catch (err: any) {
      alert("Reorder failed: " + (err.message || err));
    } finally {
      setIsOperating(false);
    }
  };

  const maxPageCount = pdfDoc ? pdfDoc.numPages : docDetail?.document.page_count || 1;

  const handlePrevPage = useCallback(() => {
    setCurrentPage((p) => Math.max(1, p - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage((p) => Math.min(maxPageCount, p + 1));
  }, [maxPageCount]);

  const handleZoomIn = useCallback(() => {
    setZoomScale((z) => Math.min(3.0, Number((z + 0.2).toFixed(2))));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomScale((z) => Math.max(0.4, Number((z - 0.2).toFixed(2))));
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoomScale(1.2);
  }, []);

  // Keyboard shortcuts & Escape modal closing
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsAiModalOpen(false);
        setIsUtilitiesModalOpen(false);
        setIsSecurityModalOpen(false);
        setIsSignatureModalOpen(false);
        setIsFormModalOpen(false);
        setIsOcrModalOpen(false);
        setIsExportImagesModalOpen(false);
        setIsImageModalOpen(false);
        setIsContentModalOpen(false);
        setIsFormattingModalOpen(false);
        setIsExtractModalOpen(false);
        setIsDrawerOpen(false);
        return;
      }

      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName?.toUpperCase();
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        active?.isContentEditable
      ) {
        return;
      }

      const anyModalOpen =
        isAiModalOpen ||
        isUtilitiesModalOpen ||
        isSecurityModalOpen ||
        isSignatureModalOpen ||
        isFormModalOpen ||
        isOcrModalOpen ||
        isExportImagesModalOpen ||
        isImageModalOpen ||
        isContentModalOpen ||
        isFormattingModalOpen ||
        isExtractModalOpen;
      if (anyModalOpen) return;

      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        handlePrevPage();
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        handleNextPage();
      } else if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === "-") {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        handleZoomReset();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    handlePrevPage,
    handleNextPage,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    isAiModalOpen,
    isUtilitiesModalOpen,
    isSecurityModalOpen,
    isSignatureModalOpen,
    isFormModalOpen,
    isOcrModalOpen,
    isExportImagesModalOpen,
    isImageModalOpen,
    isContentModalOpen,
    isFormattingModalOpen,
    isExtractModalOpen,
  ]);

  if (loading && !docDetail) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300">
        <Loader2 className="w-8 h-8 text-sky-400 animate-spin mb-3" />
        <span className="text-sm">Loading document workspace...</span>
      </div>
    );
  }

  if (error || !docDetail) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="p-6 bg-red-950/40 border border-red-900 rounded-2xl max-w-md">
          <h2 className="text-base font-semibold text-red-200 mb-2">Error Loading Document</h2>
          <p className="text-xs text-red-300 mb-4">{error || "Document not found"}</p>
          <button
            onClick={onBackToDashboard}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs rounded-lg font-medium transition"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const { document: doc, revisions } = docDetail;
  const currentRevision =
    revisions.find((r) => r.id === doc.current_revision_id) || revisions[revisions.length - 1];
  const pdfUrl = getRevisionContentUrl(doc.id, currentRevision.id);
  const totalPages = pdfDoc ? pdfDoc.numPages : doc.page_count;

  return (
    <div className="h-screen w-screen bg-slate-950 flex flex-col overflow-hidden">
      {/* Top Enterprise Toolbar */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between shrink-0 select-none z-20">
        {/* Left: Back & Document info */}
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToDashboard}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsSidebarOpen((v) => !v)}
            className={`p-1.5 rounded-lg transition ${
              isSidebarOpen ? "bg-slate-800 text-sky-400" : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
            title="Toggle Page Thumbnails"
          >
            <Sidebar className="w-4 h-4" />
          </button>

          <div className="h-5 w-px bg-slate-800" />

          <div className="flex flex-col">
            <span className="font-semibold text-slate-200 text-xs truncate max-w-[180px] md:max-w-xs">
              {doc.title}
            </span>
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              <span className="font-mono text-sky-400">Rev: {currentRevision.id.slice(0, 8)}</span>
              <span>•</span>
              <span>
                {totalPages} {totalPages === 1 ? "page" : "pages"}
              </span>
            </div>
          </div>
        </div>

        {/* Center: Page Navigation & Zoom controls */}
        <div className="flex items-center gap-1.5 bg-slate-950/70 border border-slate-800 rounded-lg p-1">
          <button
            onClick={handlePrevPage}
            disabled={currentPage <= 1}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-30"
            title="Previous Page (Left Arrow / PageUp)"
            aria-label="Previous Page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const n = parseInt(pageInput.trim(), 10);
              if (!Number.isNaN(n) && n >= 1 && n <= totalPages) {
                setCurrentPage(n);
              } else {
                setPageInput(String(currentPage));
              }
            }}
            className="flex items-center gap-1 px-1.5 text-xs font-mono text-slate-300"
          >
            <input
              type="text"
              inputMode="numeric"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={() => {
                const n = parseInt(pageInput.trim(), 10);
                if (!Number.isNaN(n) && n >= 1 && n <= totalPages) {
                  setCurrentPage(n);
                } else {
                  setPageInput(String(currentPage));
                }
              }}
              aria-label="Current page number"
              className="w-11 text-center bg-slate-900 border border-slate-700 rounded py-0.5 text-xs text-slate-100 focus:border-sky-500 focus:outline-none"
            />
            <span className="text-slate-500 select-none">/ {totalPages}</span>
          </form>
          <button
            onClick={handleNextPage}
            disabled={currentPage >= totalPages}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-30"
            title="Next Page (Right Arrow / PageDown)"
            aria-label="Next Page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-slate-800 mx-1" />

          <button
            onClick={handleZoomOut}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomReset}
            className="px-1.5 py-0.5 rounded text-[11px] font-mono text-slate-300 hover:bg-slate-800 transition"
            title="Reset Zoom"
          >
            {Math.round(zoomScale * 100)}%
          </button>
          <button
            onClick={handleZoomIn}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>

        {/* Right Actions: Page Operations, Formatting (Phase 3), Revisions, Export */}
        <div className="flex items-center gap-2">
          {/* Page Tools Group */}
          <div className="flex items-center gap-1 bg-slate-950/60 border border-slate-800 rounded-lg p-0.5">
            <button
              onClick={() => handleRotatePage(currentPage - 1, 270)}
              disabled={isOperating}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-sky-400 transition disabled:opacity-30"
              title="Rotate Page -90° (CCW)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleRotatePage(currentPage - 1, 90)}
              disabled={isOperating}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-sky-400 transition disabled:opacity-30"
              title="Rotate Page +90° (CW)"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleDuplicatePage(currentPage - 1)}
              disabled={isOperating}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-sky-400 transition disabled:opacity-30"
              title="Duplicate Current Page"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleDeletePage(currentPage - 1)}
              disabled={totalPages <= 1 || isOperating}
              className="p-1.5 rounded hover:bg-red-950/50 text-slate-300 hover:text-red-400 transition disabled:opacity-20"
              title={totalPages <= 1 ? "Cannot delete the only page" : "Delete Current Page"}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsExtractModalOpen(true)}
              disabled={isOperating}
              className="p-1.5 rounded hover:bg-slate-800 text-slate-300 hover:text-sky-400 transition disabled:opacity-30"
              title="Extract Pages to New Document"
            >
              <Scissors className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Phase 3 Page Formatting Tool Button */}
          <button
            onClick={() => setIsFormattingModalOpen(true)}
            disabled={isOperating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
            title="Page Formatting (Resize, Crop, Headers & Footers)"
          >
            <Sliders className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">Format</span>
          </button>

          {/* Phase 4 Content Editing & Overlays Tool Button */}
          <button
            onClick={() => setIsContentModalOpen(true)}
            disabled={isOperating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
            title="PDF Content Editor (Text & Shape Overlays, Hyperlinks, Native Text Stream Edit)"
          >
            <Type className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">Annotate</span>
          </button>

          {/* Phase 5 Image Editing Tool Button */}
          <button
            onClick={() => setIsImageModalOpen(true)}
            disabled={isOperating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
            title="Image Editing Suite (Insert, Replace, Crop, Scale, Rotate, Delete Images)"
          >
            <ImageIcon className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">Images</span>
          </button>

          {/* Phase 7 Local OCR Studio Button */}
          <button
            onClick={() => setIsOcrModalOpen(true)}
            disabled={isOperating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
            title="Local OCR Studio (Detect Scanned Pages, Extract Text, Make PDF Searchable)"
          >
            <Scan className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">OCR</span>
          </button>

          {/* Phase 10 Interactive PDF Forms Button */}
          <button
            onClick={() => setIsFormModalOpen(true)}
            disabled={isOperating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
            title="Interactive PDF Forms (Inspect, Fill, Flatten & Add Fillable Form Fields)"
          >
            <FileCheck2 className="w-3.5 h-3.5 text-teal-400" />
            <span className="hidden sm:inline">Forms</span>
          </button>

          {/* Phase 11 Electronic & Digital Signatures Button */}
          <button
            onClick={() => setIsSignatureModalOpen(true)}
            disabled={isOperating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
            title="Electronic & Digital Signatures (Draw/Upload Stamp, PKCS#12 Cert Signing & Verify)"
          >
            <PenTool className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Sign</span>
          </button>

          {/* Phase 12 Security (Encryption, Redaction, Metadata Sanitization) */}
          <button
            onClick={() => setIsSecurityModalOpen(true)}
            disabled={isOperating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
            title="Security Suite (AES-256 Encryption, Permanent Redaction & Metadata Sanitization)"
          >
            <Shield className="w-3.5 h-3.5 text-rose-400" />
            <span className="hidden sm:inline">Security</span>
          </button>

          {/* Phase 13 Advanced Utilities */}
          <button
            onClick={() => setIsUtilitiesModalOpen(true)}
            disabled={isOperating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
            title="Advanced Utilities (Watermarks, Compress, Bookmarks & Document Diff)"
          >
            <Wrench className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden lg:inline">Utilities</span>
          </button>

          {/* Phase 14 AI Assistant (Euri API + Ollama) */}
          <button
            onClick={() => setIsAiModalOpen(true)}
            disabled={isOperating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-950/60 hover:bg-violet-900/60 text-violet-200 text-xs font-medium border border-violet-700/60 transition"
            title="AI Document Assistant (Summarize, Q&A & Extract JSON via Euri API / Local Ollama)"
          >
            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            <span className="hidden lg:inline">Ask AI</span>
          </button>

          {/* Revision History */}
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
            title="View Revision History & Lineage"
          >
            <GitCommit className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Revisions</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-700 text-[10px] font-bold text-amber-300">
              {revisions.length}
            </span>
          </button>

          {/* Export / Download PDF */}
          <a
            href={getExportUrl(doc.id, currentRevision.id)}
            download
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium shadow-md shadow-sky-600/20 transition"
            title="Download Validated PDF Revision"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export</span>
          </a>

          {/* Phase 6 Export as Images Button */}
          <button
            onClick={() => setIsExportImagesModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
            title="Export PDF Pages as Images (PNG, JPEG, ZIP)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden md:inline">To Images</span>
          </button>
        </div>
      </header>

      {/* Status banner */}
      {statusNotification && (
        <div className="bg-sky-950/80 border-b border-sky-800/80 px-4 py-1.5 text-xs text-sky-300 flex items-center justify-center gap-2 shadow-sm animate-fadeIn">
          <CheckCircle2 className="w-3.5 h-3.5 text-sky-400" />
          <span>{statusNotification}</span>
        </div>
      )}

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Collapsible Left Thumbnail Sidebar */}
        {isSidebarOpen && (
          <ThumbnailStrip
            pdfDocument={pdfDoc}
            currentPage={currentPage}
            onPageSelect={(p) => setCurrentPage(p)}
            onRotatePage={(idx) => handleRotatePage(idx, 90)}
            onMovePage={handleMovePage}
            onDuplicatePage={handleDuplicatePage}
            onDeletePage={handleDeletePage}
            isOperating={isOperating}
          />
        )}

        {/* Center PDF Canvas Viewer */}
        <PdfViewer
          pdfUrl={pdfUrl}
          currentPage={currentPage}
          zoomScale={zoomScale}
          onDocumentLoaded={handleDocumentLoaded}
          onOpenSecurity={() => setIsSecurityModalOpen(true)}
        />

        {/* Right Revision Lineage Drawer */}
        <RevisionDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          documentDetail={docDetail}
          activeRevisionId={currentRevision.id}
        />

        {/* Extract Pages Modal */}
        <ExtractModal
          isOpen={isExtractModalOpen}
          onClose={() => setIsExtractModalOpen(false)}
          documentId={doc.id}
          documentTitle={doc.title}
          totalPages={totalPages}
          currentPage={currentPage}
          onExtractSuccess={(newId) => {
            notify("Pages extracted successfully into new document!");
            if (onOpenDocument && confirm("Extract complete! Would you like to open the new document?")) {
              onOpenDocument(newId);
            }
          }}
        />

        {/* Phase 3: Page Formatting Modal */}
        <PageFormattingModal
          isOpen={isFormattingModalOpen}
          onClose={() => setIsFormattingModalOpen(false)}
          documentId={doc.id}
          currentPage={currentPage}
          totalPages={totalPages}
          onFormattingSuccess={(msg) => {
            loadDocument();
            notify(msg);
          }}
        />

        {/* Phase 4: Content Editing & Annotations Modal */}
        <ContentEditorModal
          isOpen={isContentModalOpen}
          onClose={() => setIsContentModalOpen(false)}
          documentId={doc.id}
          currentPage={currentPage}
          onSuccess={(msg) => {
            loadDocument();
            notify(msg);
          }}
        />

        {/* Phase 5: Image Editing Suite Modal */}
        <ImageEditorModal
          isOpen={isImageModalOpen}
          onClose={() => setIsImageModalOpen(false)}
          documentId={doc.id}
          currentPage={currentPage}
          onSuccess={(msg) => {
            loadDocument();
            notify(msg);
          }}
        />

        {/* Phase 6: Export Images Modal */}
        <ExportImagesModal
          isOpen={isExportImagesModalOpen}
          onClose={() => setIsExportImagesModalOpen(false)}
          documentId={doc.id}
          documentTitle={doc.title}
          currentPage={currentPage}
          totalPages={totalPages}
        />

        {/* Phase 7: Local OCR Studio Modal */}
        <OcrModal
          isOpen={isOcrModalOpen}
          onClose={() => setIsOcrModalOpen(false)}
          documentId={doc.id}
          currentPage={currentPage}
          totalPages={totalPages}
          onOcrSuccess={(msg) => {
            loadDocument();
            notify(msg);
          }}
        />

        {/* Phase 10: Interactive PDF Forms Modal */}
        <FormEditorModal
          isOpen={isFormModalOpen}
          onClose={() => setIsFormModalOpen(false)}
          documentId={doc.id}
          currentPage={currentPage}
          totalPages={totalPages}
          onFormSuccess={(msg) => {
            loadDocument();
            notify(msg);
          }}
        />

        {/* Phase 11: Electronic & Digital Signatures Modal */}
        <SignatureModal
          isOpen={isSignatureModalOpen}
          onClose={() => setIsSignatureModalOpen(false)}
          documentId={doc.id}
          currentPage={currentPage}
          totalPages={totalPages}
          onSignatureSuccess={(msg) => {
            loadDocument();
            notify(msg);
          }}
        />

        {/* Phase 12: Security, Encryption & Sanitization Modal */}
        <SecurityModal
          isOpen={isSecurityModalOpen}
          onClose={() => setIsSecurityModalOpen(false)}
          documentId={doc.id}
          currentPage={currentPage}
          totalPages={totalPages}
          onSecuritySuccess={(msg) => {
            loadDocument();
            notify(msg);
          }}
        />

        {/* Phase 13: Advanced Utilities Modal */}
        <UtilitiesModal
          isOpen={isUtilitiesModalOpen}
          onClose={() => setIsUtilitiesModalOpen(false)}
          documentId={doc.id}
          documentTitle={doc.title}
          currentPage={currentPage}
          totalPages={totalPages}
          revisions={revisions}
          onUtilitySuccess={(msg) => {
            loadDocument();
            notify(msg);
          }}
        />

        {/* Phase 14: AI Document Assistant Modal */}
        <AIAssistantModal
          isOpen={isAiModalOpen}
          onClose={() => setIsAiModalOpen(false)}
          documentId={doc.id}
          documentTitle={doc.title}
          currentPage={currentPage}
          totalPages={totalPages}
          onRevisionCreated={(msg) => {
            loadDocument();
            notify(msg);
          }}
          onOpenDocument={onOpenDocument}
        />
      </div>
    </div>
  );
};
