import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  Shield,
  Lock,
  Unlock,
  EyeOff,
  FileWarning,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Plus,
  Trash2,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { DocumentSecurityInspection, RedactionRegion } from "../types";
import {
  decryptDocumentPdf,
  encryptDocumentPdf,
  inspectDocumentSecurity,
  redactDocumentPermanently,
  sanitizeDocumentMetadata,
} from "../services/api";

interface SecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  currentPage: number;
  totalPages: number;
  onSecuritySuccess: (message: string) => void;
}

export const SecurityModal: React.FC<SecurityModalProps> = ({
  isOpen,
  onClose,
  documentId,
  currentPage,
  totalPages,
  onSecuritySuccess,
}) => {
  const [activeTab, setActiveTab] = useState<"encrypt" | "redact" | "sanitize">("encrypt");
  const [inspection, setInspection] = useState<DocumentSecurityInspection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Encryption / Decryption states
  const [userPassword, setUserPassword] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [allowPrinting, setAllowPrinting] = useState(true);
  const [allowCopying, setAllowCopying] = useState(true);
  const [allowModifying, setAllowModifying] = useState(false);
  const [allowAnnotations, setAllowAnnotations] = useState(false);
  const [decryptPassword, setDecryptPassword] = useState("");
  const [isEncrypting, setIsEncrypting] = useState(false);

  // Permanent Redaction states
  const [searchTermsRaw, setSearchTermsRaw] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [redactScope, setRedactScope] = useState<"all" | "current">("all");
  const [overlayText, setOverlayText] = useState("[REDACTED]");
  const [fillColor, setFillColor] = useState("#000000");
  const [textColor, setTextColor] = useState("#FFFFFF");
  const [queuedRegions, setQueuedRegions] = useState<RedactionRegion[]>([]);
  const [boxPage, setBoxPage] = useState<number>(currentPage - 1);
  const [boxX0, setBoxX0] = useState<number>(50);
  const [boxY0, setBoxY0] = useState<number>(100);
  const [boxX1, setBoxX1] = useState<number>(250);
  const [boxY1, setBoxY1] = useState<number>(130);
  const [isRedacting, setIsRedacting] = useState(false);

  // Metadata & Privacy Sanitization states
  const [stripInfo, setStripInfo] = useState(true);
  const [stripXmp, setStripXmp] = useState(true);
  const [stripEmbeddedFiles, setStripEmbeddedFiles] = useState(true);
  const [stripJavaScript, setStripJavaScript] = useState(true);
  const [stripThumbnails, setStripThumbnails] = useState(true);
  const [stripAnnotations, setStripAnnotations] = useState(false);
  const [stripLinks, setStripLinks] = useState(false);
  const [stripHiddenText, setStripHiddenText] = useState(false);
  const [isSanitizing, setIsSanitizing] = useState(false);

  const loadInspection = useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await inspectDocumentSecurity(documentId);
      setInspection(data);
    } catch (err: any) {
      setError(err.message || "Failed to inspect document security");
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setBoxPage(currentPage - 1);
      loadInspection();
    }
  }, [isOpen, currentPage, loadInspection]);

  // --- Encrypt ---
  const handleEncrypt = async () => {
    if (!userPassword && !ownerPassword) {
      setError("Enter a User Open Password, an Owner Permissions Password, or both.");
      return;
    }
    setIsEncrypting(true);
    setError(null);
    try {
      const res = await encryptDocumentPdf(documentId, {
        user_password: userPassword,
        owner_password: ownerPassword,
        permissions: {
          allow_printing: allowPrinting,
          allow_copying: allowCopying,
          allow_modifying: allowModifying,
          allow_annotations: allowAnnotations,
        },
      });
      setUserPassword("");
      setOwnerPassword("");
      onSecuritySuccess(`Encrypted PDF with AES-256 (Child rev ${res.revision.id.slice(0, 8)})`);
      onClose();
    } catch (err: any) {
      setError(err.message || "Encryption failed");
    } finally {
      setIsEncrypting(false);
    }
  };

  // --- Decrypt ---
  const handleDecrypt = async () => {
    if (!decryptPassword) {
      setError("Enter the password to decrypt/unlock this document.");
      return;
    }
    setIsEncrypting(true);
    setError(null);
    try {
      const res = await decryptDocumentPdf(documentId, decryptPassword);
      setDecryptPassword("");
      onSecuritySuccess(`Decrypted PDF protection (Child rev ${res.revision.id.slice(0, 8)})`);
      onClose();
    } catch (err: any) {
      setError(err.message || "Decryption failed");
    } finally {
      setIsEncrypting(false);
    }
  };

  // --- Queue Redaction Bounding Box ---
  const handleAddRegion = () => {
    if (boxX1 <= boxX0 || boxY1 <= boxY0) {
      setError("Bounding box requires X1 > X0 and Y1 > Y0.");
      return;
    }
    setError(null);
    setQueuedRegions((prev) => [
      ...prev,
      {
        page_index: boxPage,
        rect: [boxX0, boxY0, boxX1, boxY1],
        overlay_text: overlayText,
        fill_color: fillColor,
        text_color: textColor,
      },
    ]);
  };

  // --- Execute Permanent Redaction ---
  const handleApplyRedaction = async () => {
    const terms = searchTermsRaw
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (terms.length === 0 && queuedRegions.length === 0) {
      setError("Add at least one sensitive search term or bounding box to redact.");
      return;
    }

    if (
      !confirm(
        "Permanent Redaction Warning:\nUnderlying PDF text characters and image pixels will be irreversibly destroyed in the new revision. Proceed?"
      )
    ) {
      return;
    }

    setIsRedacting(true);
    setError(null);
    try {
      const res = await redactDocumentPermanently(documentId, {
        search_terms: terms,
        case_sensitive: caseSensitive,
        page_indices: redactScope === "current" ? [currentPage - 1] : null,
        regions: queuedRegions,
        overlay_text: overlayText,
        fill_color: fillColor,
        text_color: textColor,
      });
      setQueuedRegions([]);
      setSearchTermsRaw("");
      onSecuritySuccess(
        `Applied permanent irreversible redaction (Child rev ${res.revision.id.slice(0, 8)})`
      );
      onClose();
    } catch (err: any) {
      setError(err.message || "Permanent redaction failed");
    } finally {
      setIsRedacting(false);
    }
  };

  // --- Execute Metadata Sanitization ---
  const handleSanitize = async () => {
    setIsSanitizing(true);
    setError(null);
    try {
      const res = await sanitizeDocumentMetadata(documentId, {
        strip_info_dict: stripInfo,
        strip_xmp_metadata: stripXmp,
        strip_embedded_files: stripEmbeddedFiles,
        strip_javascript: stripJavaScript,
        strip_thumbnails: stripThumbnails,
        strip_annotations: stripAnnotations,
        strip_links: stripLinks,
        strip_hidden_text: stripHiddenText,
      });
      onSecuritySuccess(`Sanitized PDF metadata & hidden streams (Child rev ${res.revision.id.slice(0, 8)})`);
      onClose();
    } catch (err: any) {
      setError(err.message || "Metadata sanitization failed");
    } finally {
      setIsSanitizing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-100 text-sm">
                PDF Security, Encryption & Sanitization
              </h2>
              <p className="text-[11px] text-slate-400">
                Page {currentPage} of {totalPages} • AES-256 Encryption, Permanent Redaction & Metadata Scrubbing
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

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-4 pt-2 gap-2 text-xs">
          <button
            type="button"
            onClick={() => {
              setActiveTab("encrypt");
              setError(null);
            }}
            className={`pb-2 px-3 border-b-2 font-medium flex items-center gap-1.5 transition ${
              activeTab === "encrypt"
                ? "border-rose-500 text-rose-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Password & AES-256</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("redact");
              setError(null);
            }}
            className={`pb-2 px-3 border-b-2 font-medium flex items-center gap-1.5 transition ${
              activeTab === "redact"
                ? "border-rose-500 text-rose-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <EyeOff className="w-3.5 h-3.5" />
            <span>Permanent Redaction</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("sanitize");
              setError(null);
            }}
            className={`pb-2 px-3 border-b-2 font-medium flex items-center gap-1.5 transition ${
              activeTab === "sanitize"
                ? "border-rose-500 text-rose-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Metadata & Privacy Audit</span>
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

          {/* Status Summary Pill */}
          <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin text-rose-400" />
              ) : inspection?.is_encrypted ? (
                <Lock className="w-4 h-4 text-amber-400" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              )}
              <span className="font-medium text-slate-200">
                {loading
                  ? "Inspecting document security attributes..."
                  : inspection?.is_encrypted
                  ? `Encrypted (${inspection.encryption_scheme || "AES"})`
                  : "Unencrypted Standard PDF"}
              </span>
            </div>
            {inspection && !inspection.requires_open_password && (
              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                <span>Meta: {inspection.metadata_field_count}</span>
                <span>•</span>
                <span>Attachments: {inspection.embedded_files.length}</span>
                {inspection.has_javascript_or_open_action && (
                  <>
                    <span>•</span>
                    <span className="text-red-400 font-semibold">JS Trigger!</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* TAB 1: Encryption & Decryption */}
          {activeTab === "encrypt" && (
            <div className="space-y-4">
              {inspection?.is_encrypted ? (
                <div className="p-4 bg-amber-950/20 border border-amber-800/50 rounded-xl space-y-3">
                  <div className="flex items-start gap-2.5">
                    <Unlock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-amber-200">Document Is Encrypted</h3>
                      <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                        {inspection.requires_open_password
                          ? "Enter the User Open Password or Owner Password to create a decrypted child revision."
                          : "Document has an Owner permissions lock. Enter the Owner Password to remove permission restrictions."}
                      </p>
                    </div>
                  </div>
                  <input
                    type="password"
                    value={decryptPassword}
                    onChange={(e) => setDecryptPassword(e.target.value)}
                    placeholder={
                      inspection.requires_open_password
                        ? "Enter User or Owner password..."
                        : "Enter Owner permissions password..."
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-xs focus:border-amber-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleDecrypt}
                    disabled={isEncrypting}
                    className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50"
                  >
                    {isEncrypting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Unlock className="w-4 h-4" />
                    )}
                    <span>Unlock & Create Unencrypted Revision</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                          Document Open Password (User)
                        </label>
                        <input
                          type="password"
                          value={userPassword}
                          onChange={(e) => setUserPassword(e.target.value)}
                          placeholder="Leave empty for view-without-password..."
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:border-rose-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                          Permissions Lock Password (Owner)
                        </label>
                        <input
                          type="password"
                          value={ownerPassword}
                          onChange={(e) => setOwnerPassword(e.target.value)}
                          placeholder="Admin password to enforce restrictions..."
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:border-rose-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                      <span className="text-[11px] font-semibold text-slate-300 block">
                        AES-256 Usage Permissions
                      </span>
                      <div className="grid grid-cols-2 gap-2 text-slate-300">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={allowPrinting}
                            onChange={(e) => setAllowPrinting(e.target.checked)}
                            className="rounded border-slate-700 bg-slate-900 text-rose-500"
                          />
                          <span>Allow Printing</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={allowCopying}
                            onChange={(e) => setAllowCopying(e.target.checked)}
                            className="rounded border-slate-700 bg-slate-900 text-rose-500"
                          />
                          <span>Allow Copy / Extract Text</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={allowModifying}
                            onChange={(e) => setAllowModifying(e.target.checked)}
                            className="rounded border-slate-700 bg-slate-900 text-rose-500"
                          />
                          <span>Allow Page Modification</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={allowAnnotations}
                            onChange={(e) => setAllowAnnotations(e.target.checked)}
                            className="rounded border-slate-700 bg-slate-900 text-rose-500"
                          />
                          <span>Allow Comments & Form Fill</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleEncrypt}
                    disabled={isEncrypting}
                    className="w-full py-2.5 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20 transition disabled:opacity-50"
                  >
                    {isEncrypting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Lock className="w-4 h-4" />
                    )}
                    <span>Encrypt PDF with AES-256 (New Revision)</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Permanent Content Redaction */}
          {activeTab === "redact" && (
            <div className="space-y-4">
              <div className="p-3 bg-red-950/30 border border-red-800/60 rounded-xl flex items-start gap-2.5 text-red-200">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <span className="font-semibold text-red-300">True Irreversible Redaction: </span>
                  Permanently purges matching PDF character glyphs and raster pixels from underlying page
                  streams before garbage-collecting orphaned objects. Unlike highlight/rectangle overlays,
                  redacted text cannot be copied or extracted after saving.
                </div>
              </div>

              {inspection?.is_encrypted && (
                <div className="p-3 bg-amber-950/30 border border-amber-800/50 rounded-xl text-amber-200 text-[11px]">
                  This document is encrypted. Unlock/decrypt it in the first tab before running redactions.
                </div>
              )}

              {/* Search & Redact Terms */}
              <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-200 text-[11px]">
                    Search & Redact Sensitive Words / Phrases (comma or newline separated)
                  </label>
                  <select
                    value={redactScope}
                    onChange={(e) => setRedactScope(e.target.value as any)}
                    className="bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-[10px] text-slate-300"
                  >
                    <option value="all">All Pages</option>
                    <option value="current">Current Page ({currentPage})</option>
                  </select>
                </div>
                <textarea
                  rows={2}
                  value={searchTermsRaw}
                  onChange={(e) => setSearchTermsRaw(e.target.value)}
                  placeholder="e.g. 123-45-6789, Confidential Project, john.doe@company.com"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:border-rose-500 focus:outline-none"
                />
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 text-[11px]">
                  <input
                    type="checkbox"
                    checked={caseSensitive}
                    onChange={(e) => setCaseSensitive(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-rose-500"
                  />
                  <span>Exact Case-Sensitive Match</span>
                </label>
              </div>

              {/* Explicit Bounding Boxes */}
              <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200 text-[11px]">
                    Optional Rectangular Regions (PDF Points, Top-Left Origin)
                  </span>
                  <button
                    type="button"
                    onClick={handleAddRegion}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-rose-300 rounded text-[10px] font-medium flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Queue Box</span>
                  </button>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  <div>
                    <span className="text-[9px] text-slate-500 block">Page</span>
                    <select
                      value={boxPage}
                      onChange={(e) => setBoxPage(parseInt(e.target.value, 10))}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs"
                    >
                      {Array.from({ length: totalPages }).map((_, i) => (
                        <option key={i} value={i}>
                          Page {i + 1}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 block">X0</span>
                    <input
                      type="number"
                      value={boxX0}
                      onChange={(e) => setBoxX0(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 block">Y0</span>
                    <input
                      type="number"
                      value={boxY0}
                      onChange={(e) => setBoxY0(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 block">X1</span>
                    <input
                      type="number"
                      value={boxX1}
                      onChange={(e) => setBoxX1(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 block">Y1</span>
                    <input
                      type="number"
                      value={boxY1}
                      onChange={(e) => setBoxY1(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs"
                    />
                  </div>
                </div>

                {queuedRegions.length > 0 && (
                  <div className="space-y-1 pt-1">
                    {queuedRegions.map((r, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between px-2.5 py-1 bg-slate-900 border border-slate-800 rounded text-[11px] font-mono text-slate-300"
                      >
                        <span>
                          Page {r.page_index + 1}: [{r.rect.join(", ")}]
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setQueuedRegions((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="text-slate-400 hover:text-red-400"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-800/70">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">
                      Replacement Text
                    </label>
                    <input
                      type="text"
                      value={overlayText}
                      onChange={(e) => setOverlayText(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">Fill Color</label>
                    <input
                      type="color"
                      value={fillColor}
                      onChange={(e) => setFillColor(e.target.value)}
                      className="w-full h-7 bg-slate-900 border border-slate-800 rounded cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">Label Color</label>
                    <input
                      type="color"
                      value={textColor}
                      onChange={(e) => setTextColor(e.target.value)}
                      className="w-full h-7 bg-slate-900 border border-slate-800 rounded cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleApplyRedaction}
                disabled={isRedacting || inspection?.is_encrypted}
                className="w-full py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-red-600/20 transition disabled:opacity-50"
              >
                {isRedacting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <EyeOff className="w-4 h-4" />
                )}
                <span>Apply Permanent Redactions (Irreversible)</span>
              </button>
            </div>
          )}

          {/* TAB 3: Metadata & Privacy Sanitization */}
          {activeTab === "sanitize" && (
            <div className="space-y-4">
              {inspection?.warnings && inspection.warnings.length > 0 && (
                <div className="p-3 bg-amber-950/25 border border-amber-800/50 rounded-xl space-y-1.5">
                  <div className="flex items-center gap-2 font-semibold text-amber-300 text-[11px]">
                    <FileWarning className="w-4 h-4 text-amber-400" />
                    <span>Detected Metadata & Hidden Content</span>
                  </div>
                  <ul className="list-disc list-inside text-[11px] text-amber-200/90 space-y-0.5">
                    {inspection.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {inspection && Object.keys(inspection.metadata).length > 0 && (
                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1.5">
                  <span className="text-[11px] font-semibold text-slate-300 block">
                    Current PDF /Info Properties
                  </span>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-mono">
                    {Object.entries(inspection.metadata).map(([k, v]) => (
                      <div key={k} className="truncate">
                        <span className="text-slate-500">{k}: </span>
                        <span className="text-slate-200">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2.5">
                <span className="text-[11px] font-semibold text-slate-200 block">
                  Privacy Sanitization Targets
                </span>
                <div className="grid grid-cols-2 gap-2 text-slate-300 text-[11px]">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={stripInfo}
                      onChange={(e) => setStripInfo(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-rose-500"
                    />
                    <span>Strip /Info Metadata (Author, Creator)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={stripXmp}
                      onChange={(e) => setStripXmp(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-rose-500"
                    />
                    <span>Strip XMP XML Stream ({inspection?.xmp_bytes ?? 0} B)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={stripEmbeddedFiles}
                      onChange={(e) => setStripEmbeddedFiles(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-rose-500"
                    />
                    <span>Remove Embedded Attachments ({inspection?.embedded_files.length ?? 0})</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={stripJavaScript}
                      onChange={(e) => setStripJavaScript(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-rose-500"
                    />
                    <span>Remove JavaScript & OpenAction Triggers</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={stripThumbnails}
                      onChange={(e) => setStripThumbnails(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-rose-500"
                    />
                    <span>Strip Embedded Page Thumbnails</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={stripAnnotations}
                      onChange={(e) => setStripAnnotations(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-rose-500"
                    />
                    <span>Remove Page Annotations ({inspection?.annotation_count ?? 0})</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={stripLinks}
                      onChange={(e) => setStripLinks(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-rose-500"
                    />
                    <span>Remove Hyperlinks</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={stripHiddenText}
                      onChange={(e) => setStripHiddenText(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-rose-500"
                    />
                    <span>Scrub Invisible Text (OCR Layer)</span>
                  </label>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSanitize}
                disabled={isSanitizing || inspection?.is_encrypted}
                className="w-full py-2.5 bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20 transition disabled:opacity-50"
              >
                {isSanitizing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span>Sanitize & Purge Privacy Data (New Revision)</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-900/90">
          <span className="text-[10px] text-slate-500 font-mono">
            Engine: pypdf AES-256 • PyMuPDF Redaction & Scrub • Original Preserved
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
