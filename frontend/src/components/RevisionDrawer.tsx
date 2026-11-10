import React from "react";
import { X, GitCommit, ArrowRight, Download, Calendar, HardDrive, CheckCircle2 } from "lucide-react";
import { DocumentDetail, Revision } from "../types";
import { getExportUrl } from "../services/api";

interface RevisionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  documentDetail: DocumentDetail | null;
  onSelectRevision?: (rev: Revision) => void;
  activeRevisionId?: string;
}

export const RevisionDrawer: React.FC<RevisionDrawerProps> = ({
  isOpen,
  onClose,
  documentDetail,
  activeRevisionId,
}) => {
  if (!isOpen || !documentDetail) return null;

  const { document, revisions } = documentDetail;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatDate = (isoStr: string) => {
    const d = new Date(isoStr);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-96 bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col transform transition-transform duration-300">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 backdrop-blur">
        <div className="flex items-center gap-2">
          <GitCommit className="w-5 h-5 text-sky-400" />
          <h2 className="font-semibold text-slate-100 text-sm">Revision Lineage History</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Document info banner */}
      <div className="px-4 py-3 bg-slate-950/60 border-b border-slate-800/80 text-xs text-slate-400">
        <div className="font-medium text-slate-200 truncate">{document.title}</div>
        <div className="mt-1 flex items-center gap-3">
          <span>{revisions.length} total revisions</span>
          <span>•</span>
          <span className="text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 inline" /> Invariant Protected
          </span>
        </div>
      </div>

      {/* Lineage Timeline */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {revisions.map((rev, index) => {
          const isCurrent = rev.id === (activeRevisionId || document.current_revision_id);
          const isOriginal = rev.id === document.original_revision_id;

          return (
            <div
              key={rev.id}
              className={`relative rounded-lg p-3.5 border transition text-xs ${
                isCurrent
                  ? "bg-sky-950/30 border-sky-500/60 shadow-sm shadow-sky-500/10"
                  : "bg-slate-950/40 border-slate-800 hover:border-slate-700"
              }`}
            >
              {/* Top badge */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 font-medium">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                      isOriginal
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                    }`}
                  >
                    {isOriginal ? "Immutable Original" : rev.operation.replace(/_/g, " ")}
                  </span>
                  {isCurrent && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                      Current Head
                    </span>
                  )}
                </div>
                <span className="text-slate-500 font-mono text-[11px]">
                  #{index + 1}
                </span>
              </div>

              {/* Revision ID */}
              <div className="text-slate-300 font-mono text-[11px] mb-2 truncate">
                Rev: {rev.id}
              </div>

              {/* Parent pointer if child */}
              {rev.parent_revision_id && (
                <div className="text-[11px] text-slate-400 flex items-center gap-1 mb-2 font-mono truncate">
                  <ArrowRight className="w-3 h-3 text-sky-400 shrink-0" />
                  Parent: {rev.parent_revision_id.slice(0, 8)}...
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2 text-slate-400 mb-2.5">
                <div className="flex items-center gap-1">
                  <HardDrive className="w-3 h-3 text-slate-500" />
                  <span>{formatBytes(rev.size_bytes)}</span>
                </div>
                <div>{rev.page_count} {rev.page_count === 1 ? "page" : "pages"}</div>
                <div className="flex items-center gap-1 col-span-2 text-slate-500">
                  <Calendar className="w-3 h-3" />
                  <span>{formatDate(rev.created_at)}</span>
                </div>
              </div>

              {/* SHA-256 fingerprint */}
              <div className="bg-slate-900/90 rounded p-1.5 border border-slate-800 text-[10px] text-slate-400 font-mono break-all mb-2.5">
                <span className="text-slate-500 select-none">SHA256: </span>
                {rev.sha256}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-800/60">
                <a
                  href={getExportUrl(document.id, rev.id)}
                  download
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition"
                  title="Download this exact revision file"
                >
                  <Download className="w-3 h-3" /> Export Revision
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
