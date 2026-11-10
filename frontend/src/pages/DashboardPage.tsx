import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  FileText,
  UploadCloud,
  HardDrive,
  Calendar,
  Layers,
  ArrowRight,
  Trash2,
  Download,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  FileSpreadsheet,
  Layout,
  Wrench,
  Search,
  Activity,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Document } from "../types";
import { fetchDocuments, uploadDocument, deleteDocument, getExportUrl } from "../services/api";
import { MergeModal } from "../components/MergeModal";
import { ConvertModal } from "../components/ConvertModal";
import { TemplateStudioModal } from "../components/TemplateStudioModal";
import { BatchModal } from "../components/BatchModal";
import { SystemHealthModal } from "../components/SystemHealthModal";

const PAGE_SIZE = 24;

interface DashboardPageProps {
  onOpenDocument: (documentId: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onOpenDocument }) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [pageOffset, setPageOffset] = useState(0);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [isHealthModalOpen, setIsHealthModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadDocuments = useCallback(async (offset: number = pageOffset, search: string = searchQuery) => {
    try {
      setLoading(true);
      const docs = await fetchDocuments(PAGE_SIZE, offset, search);
      setDocuments(docs);
    } catch (err: any) {
      console.error("Failed to load documents:", err);
    } finally {
      setLoading(false);
    }
  }, [pageOffset, searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadDocuments(pageOffset, searchQuery);
    }, 150);
    return () => clearTimeout(timer);
  }, [loadDocuments, pageOffset, searchQuery]);

  const handleFileUpload = async (file: File) => {
    setUploadError(null);
    setIsUploading(true);
    try {
      const result = await uploadDocument(file);
      await loadDocuments();
      // Directly open newly uploaded document
      onOpenDocument(result.document.id);
    } catch (err: any) {
      setUploadError(err.message || "Failed to upload document");
    } finally {
      setIsUploading(false);
    }
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleDelete = async (e: React.MouseEvent, docId: string) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to remove this document from the local catalog?")) {
      return;
    }
    try {
      await deleteDocument(docId);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } catch (err: any) {
      alert("Failed to delete document: " + err.message);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatDate = (isoStr: string) => {
    const d = new Date(isoStr);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Top Navigation */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-30 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-slate-100 text-base tracking-tight flex items-center gap-2">
              PDF Canvas <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/30">Local Edition</span>
            </h1>
            <p className="text-[11px] text-slate-400">Enterprise Local-First PDF Workspace</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsHealthModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium transition"
            title="Inspect SQLite WAL Diagnostics, SHA-256 Catalog Integrity & Temp Cleanup"
          >
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>System Health</span>
          </button>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>100% Local PC • Zero Cloud Dependency</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6 md:p-8 space-y-8">
        {/* Error message */}
        {uploadError && (
          <div className="p-4 rounded-xl bg-red-950/50 border border-red-800 text-red-200 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{uploadError}</span>
            </div>
            <button
              onClick={() => setUploadError(null)}
              className="text-red-400 hover:text-white font-medium"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Upload Zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 md:p-12 text-center cursor-pointer transition-all ${
            dragOver
              ? "border-sky-400 bg-sky-950/20 shadow-xl shadow-sky-500/10 scale-[1.01]"
              : "border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/60"
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={onFileInputChange}
            accept=".pdf,application/pdf"
            className="hidden"
          />

          <div className="max-w-md mx-auto flex flex-col items-center">
            <div className="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 mb-4 shadow-inner">
              {isUploading ? (
                <Loader2 className="w-7 h-7 animate-spin" />
              ) : (
                <UploadCloud className="w-7 h-7" />
              )}
            </div>

            <h3 className="text-base font-semibold text-slate-100 mb-1">
              {isUploading ? "Validating & Ingesting PDF..." : "Upload or Drop PDF Document"}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Stored safely in <code className="bg-slate-800 px-1 py-0.5 rounded text-sky-300">local_data/originals</code> as an immutable original.
            </p>

            <button
              type="button"
              disabled={isUploading}
              className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium shadow-md shadow-sky-600/20 transition disabled:opacity-50"
            >
              {isUploading ? "Processing..." : "Select Local PDF File"}
            </button>
          </div>
        </div>

        {/* Recent Documents Section */}
        <section className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-100">Local Documents</h2>
              <p className="text-xs text-slate-400">
                Documents and revisions stored in your local SQLite catalog
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setPageOffset(0);
                  }}
                  placeholder="Search catalog..."
                  aria-label="Search documents by title"
                  className="bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none w-44 sm:w-56"
                />
              </div>
              <button
                onClick={() => setIsTemplateModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow-md shadow-indigo-600/20 transition"
                title="Create documents from customizable vector templates"
              >
                <Layout className="w-3.5 h-3.5" />
                <span>Template Studio</span>
              </button>
              <button
                onClick={() => setIsConvertModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
                title="Convert Images, Office files, or Text to PDF"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-400" />
                <span>Convert to PDF</span>
              </button>
              <button
                onClick={() => setIsBatchModalOpen(true)}
                disabled={documents.length < 1}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition disabled:opacity-40"
                title="Batch watermark, compress, or sanitize multiple PDFs"
              >
                <Wrench className="w-3.5 h-3.5 text-amber-400" />
                <span>Batch Tools</span>
              </button>
              <button
                onClick={() => setIsMergeModalOpen(true)}
                disabled={documents.length < 2}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium shadow-md shadow-sky-600/20 transition disabled:opacity-40"
                title={documents.length < 2 ? "Upload at least 2 documents to merge" : "Merge PDFs into a new document"}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Merge PDFs</span>
              </button>
              <span className="text-xs text-slate-500">{documents.length} shown</span>
            </div>
          </div>

          {loading ? (
            <div className="py-12 flex justify-center text-slate-500 text-xs">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading local documents...
            </div>
          ) : documents.length === 0 ? (
            <div className="p-12 text-center rounded-xl border border-slate-800/80 bg-slate-900/20">
              <Layers className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-300 font-medium">
                {searchQuery.trim()
                  ? `No documents matching "${searchQuery.trim()}"`
                  : "No documents uploaded yet"}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {searchQuery.trim()
                  ? "Clear the search filter to browse all local documents."
                  : "Upload your first PDF above to preview, rotate pages, and track revisions."}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => onOpenDocument(doc.id)}
                  className="group bg-slate-900/70 border border-slate-800 rounded-xl p-4 hover:border-sky-500/50 hover:bg-slate-900 transition-all cursor-pointer flex flex-col justify-between shadow-sm hover:shadow-lg hover:shadow-sky-500/5"
                >
                  <div>
                    {/* Card Header */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-sky-400" />
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                        <a
                          href={getExportUrl(doc.id)}
                          download
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                          title="Download PDF"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                        <button
                          onClick={(e) => handleDelete(e, doc.id)}
                          className="p-1.5 rounded hover:bg-red-950/50 text-slate-400 hover:text-red-400"
                          title="Delete from Catalog"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Title */}
                    <h3 className="font-semibold text-slate-200 text-sm mb-1 truncate group-hover:text-sky-400 transition">
                      {doc.title}
                    </h3>

                    {/* Meta info */}
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 mt-3 pt-3 border-t border-slate-800/60">
                      <div className="flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-slate-500" />
                        <span>{doc.page_count} {doc.page_count === 1 ? "page" : "pages"}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <HardDrive className="w-3.5 h-3.5 text-slate-500" />
                        <span>{formatBytes(doc.size_bytes)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 col-span-2 text-slate-500">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Modified {formatDate(doc.updated_at)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Open Link */}
                  <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs font-medium text-sky-400 group-hover:text-sky-300">
                    <span>Open in Editor</span>
                    <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition" />
                  </div>
                </div>
              ))}
              </div>

              {(pageOffset > 0 || documents.length === PAGE_SIZE) && (
                <div className="flex items-center justify-between pt-2 text-xs text-slate-400">
                  <span>
                    Showing {pageOffset + 1} – {pageOffset + documents.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPageOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
                      disabled={pageOffset === 0}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 disabled:opacity-40 flex items-center gap-1 transition"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Previous</span>
                    </button>
                    <button
                      onClick={() => setPageOffset((prev) => prev + PAGE_SIZE)}
                      disabled={documents.length < PAGE_SIZE}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 disabled:opacity-40 flex items-center gap-1 transition"
                    >
                      <span>Next</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      {/* Merge PDFs Modal */}
      <MergeModal
        isOpen={isMergeModalOpen}
        onClose={() => setIsMergeModalOpen(false)}
        availableDocuments={documents}
        onMergeSuccess={(newDocId) => onOpenDocument(newDocId)}
      />

      {/* Convert to PDF Modal */}
      <ConvertModal
        isOpen={isConvertModalOpen}
        onClose={() => setIsConvertModalOpen(false)}
        onConversionSuccess={(newDocId) => onOpenDocument(newDocId)}
      />

      {/* Template Studio Modal */}
      <TemplateStudioModal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        onDocumentCreated={(newDocId) => onOpenDocument(newDocId)}
      />

      {/* Batch Processing Modal */}
      <BatchModal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        availableDocuments={documents}
        onBatchComplete={() => loadDocuments()}
      />

      {/* Phase 15 System Health & Integrity Modal */}
      <SystemHealthModal
        isOpen={isHealthModalOpen}
        onClose={() => setIsHealthModalOpen(false)}
      />
    </div>
  );
};
