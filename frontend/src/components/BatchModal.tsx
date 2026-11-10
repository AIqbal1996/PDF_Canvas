import React, { useState } from "react";
import {
  X,
  Layers,
  Check,
  Loader2,
  Droplets,
  Gauge,
  Shield,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { BatchUtilityResponse, Document } from "../types";
import { runBatchUtility } from "../services/api";

interface BatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableDocuments: Document[];
  onBatchComplete: () => void;
}

export const BatchModal: React.FC<BatchModalProps> = ({
  isOpen,
  onClose,
  availableDocuments,
  onBatchComplete,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [action, setAction] = useState<"watermark" | "compress" | "sanitize">("compress");

  // Options
  const [wmText, setWmText] = useState("CONFIDENTIAL");
  const [wmPosition, setWmPosition] = useState<"center" | "tile">("center");
  const [compressMode, setCompressMode] = useState<"lossless" | "balanced" | "compact">(
    "lossless"
  );
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<BatchUtilityResponse | null>(null);

  if (!isOpen) return null;

  const toggleDoc = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedIds.length === availableDocuments.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(availableDocuments.map((d) => d.id));
    }
  };

  const handleRunBatch = async () => {
    if (selectedIds.length === 0) {
      setError("Select at least 1 document.");
      return;
    }
    if (action === "watermark" && !wmText.trim()) {
      setError("Watermark text cannot be empty.");
      return;
    }

    setError(null);
    setReport(null);
    setIsRunning(true);
    try {
      const res = await runBatchUtility({
        document_ids: selectedIds,
        action,
        watermark:
          action === "watermark"
            ? { text: wmText.trim(), position: wmPosition, opacity: 0.25 }
            : undefined,
        compress: action === "compress" ? { mode: compressMode } : undefined,
        sanitize:
          action === "sanitize"
            ? {
                strip_info_dict: true,
                strip_xmp_metadata: true,
                strip_embedded_files: true,
                strip_javascript: true,
                strip_thumbnails: true,
                strip_annotations: false,
                strip_links: false,
                strip_hidden_text: false,
              }
            : undefined,
      });
      setReport(res);
      onBatchComplete();
    } catch (err: any) {
      setError(err.message || "Batch execution failed");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/95">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-100 text-sm">
                Batch PDF Processing
              </h2>
              <p className="text-[11px] text-slate-400">
                Apply watermarks, compression, or metadata sanitization across multiple PDFs
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

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-red-950/50 border border-red-800 rounded-lg text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Action Picker */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setAction("compress")}
              className={`p-2.5 rounded-xl border text-left transition ${
                action === "compress"
                  ? "bg-sky-950/50 border-sky-500 text-sky-300"
                  : "bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700"
              }`}
            >
              <Gauge className="w-4 h-4 mb-1" />
              <div className="font-semibold text-slate-200">Compress</div>
              <div className="text-[10px] text-slate-400">Optimize file sizes</div>
            </button>
            <button
              onClick={() => setAction("watermark")}
              className={`p-2.5 rounded-xl border text-left transition ${
                action === "watermark"
                  ? "bg-amber-950/40 border-amber-500 text-amber-300"
                  : "bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700"
              }`}
            >
              <Droplets className="w-4 h-4 mb-1" />
              <div className="font-semibold text-slate-200">Watermark</div>
              <div className="text-[10px] text-slate-400">Stamp text overlays</div>
            </button>
            <button
              onClick={() => setAction("sanitize")}
              className={`p-2.5 rounded-xl border text-left transition ${
                action === "sanitize"
                  ? "bg-rose-950/40 border-rose-500 text-rose-300"
                  : "bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700"
              }`}
            >
              <Shield className="w-4 h-4 mb-1" />
              <div className="font-semibold text-slate-200">Sanitize</div>
              <div className="text-[10px] text-slate-400">Scrub metadata & JS</div>
            </button>
          </div>

          {/* Operation Settings */}
          {action === "compress" && (
            <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3">
              <span className="text-slate-300 font-medium">Optimization Mode:</span>
              <select
                value={compressMode}
                onChange={(e) =>
                  setCompressMode(e.target.value as "lossless" | "balanced" | "compact")
                }
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200"
              >
                <option value="lossless">Lossless Stream Deflate</option>
                <option value="balanced">Balanced (120 DPI @78)</option>
                <option value="compact">Compact (80 DPI @58)</option>
              </select>
            </div>
          )}

          {action === "watermark" && (
            <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">Watermark Text</label>
                <input
                  type="text"
                  value={wmText}
                  onChange={(e) => setWmText(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Placement</label>
                <select
                  value={wmPosition}
                  onChange={(e) =>
                    setWmPosition(e.target.value as "center" | "tile")
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200"
                >
                  <option value="center">Center Diagonal</option>
                  <option value="tile">Tiled Grid</option>
                </select>
              </div>
            </div>
          )}

          {action === "sanitize" && (
            <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-400">
              Strips <strong className="text-slate-200">/Info dictionary</strong>,{" "}
              <strong className="text-slate-200">XMP XML</strong>,{" "}
              <strong className="text-slate-200">embedded attachments</strong>,{" "}
              <strong className="text-slate-200">thumbnails</strong>, and{" "}
              <strong className="text-slate-200">JavaScript/OpenAction triggers</strong> from each selected PDF.
            </div>
          )}

          {/* Document Selection */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-slate-300 font-medium">
                Select Target Documents ({selectedIds.length} / {availableDocuments.length})
              </label>
              <button
                onClick={selectAll}
                className="text-[11px] text-sky-400 hover:text-sky-300 font-medium"
              >
                {selectedIds.length === availableDocuments.length
                  ? "Deselect All"
                  : "Select All"}
              </button>
            </div>
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {availableDocuments.map((doc) => {
                const isSelected = selectedIds.includes(doc.id);
                return (
                  <div
                    key={doc.id}
                    onClick={() => toggleDoc(doc.id)}
                    className={`p-2 rounded-lg border transition flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? "bg-sky-950/40 border-sky-500/60 text-slate-100"
                        : "bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                          isSelected
                            ? "bg-sky-500 border-sky-400 text-white"
                            : "border-slate-700 bg-slate-900"
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <span className="truncate font-medium">{doc.title}</span>
                    </div>
                    <span className="text-[11px] text-slate-500 shrink-0">
                      {doc.page_count}p
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Per-document Results Report */}
          {report && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-medium">
                <span className="text-slate-200">
                  Batch Summary ({report.action})
                </span>
                <span className="text-emerald-400">
                  {report.succeeded} succeeded • {report.failed} failed
                </span>
              </div>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {report.results.map((r) => (
                  <div
                    key={r.document_id}
                    className="flex items-center justify-between text-[11px] p-1.5 rounded bg-slate-900/90 border border-slate-800/80"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      {r.success ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      )}
                      <span className="text-slate-200 truncate">{r.title}</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 ml-2 shrink-0">
                      {r.success
                        ? `rev ${r.new_revision_id?.slice(0, 8)}`
                        : r.error || "Error"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-end gap-3 bg-slate-900/95">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-slate-400 hover:text-slate-200 text-xs font-medium hover:bg-slate-800 transition"
          >
            Close
          </button>
          <button
            onClick={handleRunBatch}
            disabled={isRunning || selectedIds.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition disabled:opacity-50"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Running Batch...
              </>
            ) : (
              <>
                <Layers className="w-3.5 h-3.5" /> Run on {selectedIds.length} PDF
                {selectedIds.length === 1 ? "" : "s"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
