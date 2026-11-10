import React, { useEffect, useState } from "react";
import {
  X,
  Activity,
  Database,
  HardDrive,
  ShieldCheck,
  AlertTriangle,
  Trash2,
  RefreshCw,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import {
  IntegrityAuditReport,
  SystemDiagnosticsReport,
  TempCleanupReport,
} from "../types";
import {
  cleanupTempFiles,
  fetchSystemDiagnostics,
  verifyCatalogIntegrity,
} from "../services/api";

interface SystemHealthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SystemHealthModal: React.FC<SystemHealthModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [diag, setDiag] = useState<SystemDiagnosticsReport | null>(null);
  const [audit, setAudit] = useState<IntegrityAuditReport | null>(null);
  const [cleanupResult, setCleanupResult] = useState<TempCleanupReport | null>(null);
  const [loadingDiag, setLoadingDiag] = useState(false);
  const [runningAudit, setRunningAudit] = useState(false);
  const [runningCleanup, setRunningCleanup] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDiag = async () => {
    setLoadingDiag(true);
    setError(null);
    try {
      const report = await fetchSystemDiagnostics();
      setDiag(report);
    } catch (err: any) {
      setError(err.message || "Failed to load diagnostics");
    } finally {
      setLoadingDiag(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadDiag();
      setAudit(null);
      setCleanupResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const handleRunIntegrityAudit = async () => {
    setRunningAudit(true);
    setError(null);
    try {
      const result = await verifyCatalogIntegrity();
      setAudit(result);
    } catch (err: any) {
      setError(err.message || "Integrity check failed");
    } finally {
      setRunningAudit(false);
    }
  };

  const handleCleanupTemp = async () => {
    setRunningCleanup(true);
    setError(null);
    try {
      const res = await cleanupTempFiles();
      setCleanupResult(res);
      await loadDiag();
    } catch (err: any) {
      setError(err.message || "Temp cleanup failed");
    } finally {
      setRunningCleanup(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">
                System Diagnostics & Catalog Integrity
              </h2>
              <p className="text-[11px] text-slate-400">
                SQLite WAL concurrency status, immutable SHA-256 verification, and temp storage hygiene
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadDiag}
              disabled={loadingDiag}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Refresh Diagnostics"
            >
              <RefreshCw className={`w-4 h-4 ${loadingDiag ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              aria-label="Close System Health Modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-red-950/50 border border-red-800 text-red-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loadingDiag && !diag ? (
            <div className="py-12 flex items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
              <span>Inspecting SQLite WAL & local_data directories...</span>
            </div>
          ) : diag ? (
            <>
              {/* Top Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide flex items-center gap-1">
                    <Database className="w-3 h-3 text-emerald-400" />
                    <span>SQLite Status</span>
                  </div>
                  <div className="mt-1 font-bold text-slate-100 flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        diag.sqlite_integrity_ok ? "bg-emerald-400" : "bg-red-400"
                      }`}
                    />
                    <span>{diag.sqlite_integrity_ok ? "OK" : "ERROR"}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-sky-300 uppercase">
                      {diag.sqlite_journal_mode}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                    Catalog Records
                  </div>
                  <div className="mt-1 font-bold text-slate-100">
                    {diag.document_count} docs / {diag.revision_count} revs
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    DB {formatBytes(diag.sqlite_db_bytes)}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide flex items-center gap-1">
                    <HardDrive className="w-3 h-3 text-sky-400" />
                    <span>Total Local Data</span>
                  </div>
                  <div className="mt-1 font-bold text-slate-100">
                    {formatBytes(diag.total_storage_bytes)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Max Upload {formatBytes(diag.max_upload_bytes)}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                    Reclaimable Temp
                  </div>
                  <div className="mt-1 font-bold text-amber-300">
                    {formatBytes(diag.temp_reclaimable_bytes)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {diag.temp_reclaimable_files} temp files
                  </div>
                </div>
              </div>

              {/* Storage Breakdown */}
              <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-4 space-y-2">
                <div className="font-semibold text-slate-200 mb-2">
                  Local Storage Breakdown (`local_data/*`)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {diag.directories.map((d) => (
                    <div
                      key={d.name}
                      className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-900 border border-slate-800/80"
                    >
                      <span className="font-mono text-slate-300">{d.name}/</span>
                      <span className="text-slate-400">
                        {d.file_count} files •{" "}
                        <strong className="text-slate-200">{formatBytes(d.total_bytes)}</strong>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions Row */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleRunIntegrityAudit}
                  disabled={runningAudit}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-2 transition disabled:opacity-50"
                >
                  {runningAudit ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-4 h-4" />
                  )}
                  <span>Verify All SHA-256 Originals & Revisions</span>
                </button>

                <button
                  onClick={handleCleanupTemp}
                  disabled={runningCleanup}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 font-semibold flex items-center gap-2 transition disabled:opacity-50"
                >
                  {runningCleanup ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  <span>Clean Stale Temp Files (Preserves Originals)</span>
                </button>
              </div>

              {/* Audit Result */}
              {audit && (
                <div
                  className={`p-4 rounded-xl border space-y-2 ${
                    audit.healthy
                      ? "bg-emerald-950/30 border-emerald-800/60"
                      : "bg-red-950/40 border-red-800"
                  }`}
                >
                  <div className="flex items-center gap-2 font-semibold text-slate-100">
                    {audit.healthy ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                    )}
                    <span>
                      {audit.healthy
                        ? "Catalog Integrity Audit Passed"
                        : `Integrity Audit Detected ${audit.issues.length} Issue(s)`}
                    </span>
                  </div>
                  <div className="text-slate-300">
                    Checked <strong>{audit.checked_documents}</strong> documents and{" "}
                    <strong>{audit.checked_revisions}</strong> revisions •{" "}
                    <strong>{audit.verified_revisions}</strong> SHA-256 verified •{" "}
                    <strong>{audit.originals_intact}</strong> immutable originals intact.
                  </div>
                  {audit.issues.length > 0 && (
                    <div className="space-y-1.5 pt-2">
                      {audit.issues.map((issue) => (
                        <div
                          key={issue.revision_id}
                          className="p-2 rounded bg-slate-950/80 border border-red-900/50 text-[11px] font-mono text-red-300"
                        >
                          [{issue.issue_type}] {issue.document_title} ({issue.revision_id.slice(0, 8)}):{" "}
                          {issue.detail}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Cleanup Result */}
              {cleanupResult && (
                <div className="p-4 rounded-xl bg-sky-950/30 border border-sky-800/60 space-y-1 text-slate-200">
                  <div className="font-semibold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-sky-400" />
                    <span>Temp Cleanup Complete</span>
                  </div>
                  <p className="text-slate-300">
                    Removed <strong>{cleanupResult.removed_files}</strong> stale temp file(s) and freed{" "}
                    <strong>{formatBytes(cleanupResult.freed_bytes)}</strong>.{" "}
                    Preserved <strong>{cleanupResult.preserved_originals}</strong> original(s) and{" "}
                    <strong>{cleanupResult.preserved_revisions}</strong> referenced revision(s).
                  </p>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
