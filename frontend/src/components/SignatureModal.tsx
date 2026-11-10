import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  PenTool,
  ShieldCheck,
  ShieldAlert,
  FileCheck,
  Loader2,
  AlertCircle,
  Trash2,
  Upload,
  BookmarkPlus,
  KeyRound,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Eraser,
} from "lucide-react";
import {
  DocumentSignaturesReport,
  LocalCertificateInfo,
  SavedSignature,
} from "../types";
import {
  applyVisualSignatureStamp,
  deleteLocalCertificate,
  deleteSavedSignature,
  generateSelfSignedCert,
  listLocalCertificates,
  listSavedSignatures,
  saveSignatureGraphic,
  signDocumentDigitally,
  verifyDocumentSignatures,
} from "../services/api";

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  currentPage: number;
  totalPages: number;
  onSignatureSuccess: (message: string) => void;
}

export const SignatureModal: React.FC<SignatureModalProps> = ({
  isOpen,
  onClose,
  documentId,
  currentPage,
  totalPages,
  onSignatureSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<"visual" | "digital" | "verify">("visual");
  const [error, setError] = useState<string | null>(null);

  // Library & certs state
  const [savedSignatures, setSavedSignatures] = useState<SavedSignature[]>([]);
  const [certificates, setCertificates] = useState<LocalCertificateInfo[]>([]);
  const [verificationReport, setVerificationReport] = useState<DocumentSignaturesReport | null>(null);
  const [loadingVerify, setLoadingVerify] = useState(false);

  // Canvas drawing state (Visual Stamp)
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawnInk, setHasDrawnInk] = useState(false);
  const [inkColor, setInkColor] = useState<string>("#0f172a");
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [uploadedSigB64, setUploadedSigB64] = useState<string | null>(null);
  const [selectedSavedSigId, setSelectedSavedSigId] = useState<string | null>(null);
  const [newSigName, setNewSigName] = useState<string>("My Signature");
  const [isSavingSig, setIsSavingSig] = useState(false);

  // Visual stamp placement options
  const [stampPage, setStampPage] = useState<number>(currentPage - 1);
  const [stampX, setStampX] = useState<number>(360);
  const [stampY, setStampY] = useState<number>(48);
  const [stampW, setStampW] = useState<number>(180);
  const [stampH, setStampH] = useState<number>(64);
  const [stampSignerName, setStampSignerName] = useState<string>("");
  const [stampReason, setStampReason] = useState<string>("Approved");
  const [stampTimestamp, setStampTimestamp] = useState<boolean>(true);
  const [stampOpacity, setStampOpacity] = useState<number>(1.0);
  const [isStamping, setIsStamping] = useState(false);

  // Digital signature (PKCS#12) state
  const [certMode, setCertMode] = useState<"stored" | "upload">("stored");
  const [selectedCertId, setSelectedCertId] = useState<string>("");
  const [uploadedP12B64, setUploadedP12B64] = useState<string | null>(null);
  const [uploadedP12Name, setUploadedP12Name] = useState<string>("");
  const [signPassword, setSignPassword] = useState<string>("");
  const [signReason, setSignReason] = useState<string>("Document Approval");
  const [signLocation, setSignLocation] = useState<string>("Local Workstation");
  const [signContact, setSignContact] = useState<string>("");
  const [signVisible, setSignVisible] = useState<boolean>(true);
  const [signPage, setSignPage] = useState<number>(currentPage - 1);
  const [signRect, setSignRect] = useState<[number, number, number, number]>([36, 36, 260, 96]);
  const [isSigningDigital, setIsSigningDigital] = useState(false);

  // Generate local self-signed cert form
  const [showCertWizard, setShowCertWizard] = useState(false);
  const [newCertLabel, setNewCertLabel] = useState("Personal Signing Cert");
  const [newCertCN, setNewCertCN] = useState("Jane Doe");
  const [newCertOrg, setNewCertOrg] = useState("PDF Canvas Local");
  const [newCertEmail, setNewCertEmail] = useState("signer@local.invalid");
  const [newCertDays, setNewCertDays] = useState(365);
  const [newCertPassword, setNewCertPassword] = useState("");
  const [isGeneratingCert, setIsGeneratingCert] = useState(false);

  const loadLibraries = useCallback(async () => {
    try {
      const [sigs, certs] = await Promise.all([
        listSavedSignatures(),
        listLocalCertificates(),
      ]);
      setSavedSignatures(sigs);
      setCertificates(certs);
      if (certs.length > 0 && !selectedCertId) {
        setSelectedCertId(certs[0].id);
      }
      if (certs.length === 0) {
        setShowCertWizard(true);
      }
    } catch (err: any) {
      console.error("Failed to load signature libraries:", err);
    }
  }, [selectedCertId]);

  const loadVerification = useCallback(async () => {
    if (!documentId) return;
    setLoadingVerify(true);
    try {
      const report = await verifyDocumentSignatures(documentId);
      setVerificationReport(report);
    } catch (err: any) {
      setError(err.message || "Failed to inspect document signatures");
    } finally {
      setLoadingVerify(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setStampPage(currentPage - 1);
      setSignPage(currentPage - 1);
      loadLibraries();
      loadVerification();
    }
  }, [isOpen, currentPage, loadLibraries, loadVerification]);

  // --- HTML5 Canvas Drawing Handlers ---
  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = getCanvasPoint(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    setIsDrawing(true);
    setHasDrawnInk(true);
    setSelectedSavedSigId(null);
    setUploadedSigB64(null);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCanvasPoint(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (canvas && canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    setIsDrawing(false);
  };

  const handleClearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasDrawnInk(false);
    setUploadedSigB64(null);
  };

  const handleUploadSignatureImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setUploadedSigB64(reader.result);
        setSelectedSavedSigId(null);
        setHasDrawnInk(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const getActiveSignatureBase64 = (): string | null => {
    if (uploadedSigB64) return uploadedSigB64;
    if (hasDrawnInk && canvasRef.current) {
      return canvasRef.current.toDataURL("image/png");
    }
    return null;
  };

  const handleSaveToLibrary = async () => {
    const imgB64 = getActiveSignatureBase64();
    if (!imgB64) {
      setError("Draw a signature on the pad or upload an image before saving.");
      return;
    }
    if (!newSigName.trim()) {
      setError("Enter a name for the saved signature.");
      return;
    }
    setIsSavingSig(true);
    setError(null);
    try {
      const saved = await saveSignatureGraphic(newSigName.trim(), imgB64);
      setSavedSignatures((prev) => [saved, ...prev]);
      setSelectedSavedSigId(saved.id);
      setUploadedSigB64(null);
      handleClearCanvas();
    } catch (err: any) {
      setError(err.message || "Failed to save signature to local library");
    } finally {
      setIsSavingSig(false);
    }
  };

  const handleDeleteSavedSig = async (sigId: string) => {
    try {
      await deleteSavedSignature(sigId);
      setSavedSignatures((prev) => prev.filter((s) => s.id !== sigId));
      if (selectedSavedSigId === sigId) {
        setSelectedSavedSigId(null);
      }
    } catch (err: any) {
      setError(err.message || "Failed to delete saved signature");
    }
  };

  // --- Apply Visual Stamp ---
  const handleApplyVisualStamp = async () => {
    const inlineImg = getActiveSignatureBase64();
    if (!selectedSavedSigId && !inlineImg) {
      setError("Select a saved signature, draw on the pad, or upload an image first.");
      return;
    }
    setIsStamping(true);
    setError(null);
    try {
      const res = await applyVisualSignatureStamp(documentId, {
        page_index: stampPage,
        x: stampX,
        y: stampY,
        width: stampW,
        height: stampH,
        saved_signature_id: selectedSavedSigId || undefined,
        signature_image_base64: !selectedSavedSigId ? inlineImg : undefined,
        signer_name: stampSignerName.trim() || undefined,
        reason: stampReason.trim() || undefined,
        include_timestamp: stampTimestamp,
        opacity: stampOpacity,
      });
      onSignatureSuccess(
        `Applied visual signature stamp on Page ${stampPage + 1} (Child rev ${res.revision.id.slice(0, 8)})`
      );
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to apply visual signature stamp");
    } finally {
      setIsStamping(false);
    }
  };

  // --- Local Certificate Generation & Deletion ---
  const handleGenerateCert = async () => {
    if (!newCertLabel.trim() || !newCertCN.trim()) {
      setError("Profile Label and Signer Common Name are required.");
      return;
    }
    if (newCertPassword.length < 4) {
      setError("Certificate passphrase must be at least 4 characters.");
      return;
    }
    setIsGeneratingCert(true);
    setError(null);
    try {
      const created = await generateSelfSignedCert({
        label: newCertLabel.trim(),
        common_name: newCertCN.trim(),
        organization: newCertOrg.trim(),
        email: newCertEmail.trim(),
        validity_days: newCertDays,
        password: newCertPassword,
      });
      setCertificates((prev) => [created, ...prev]);
      setSelectedCertId(created.id);
      setSignPassword(newCertPassword);
      setNewCertPassword("");
      setShowCertWizard(false);
    } catch (err: any) {
      setError(err.message || "Failed to generate PKCS#12 certificate");
    } finally {
      setIsGeneratingCert(false);
    }
  };

  const handleDeleteCert = async (certId: string) => {
    if (!confirm("Delete this local PKCS#12 certificate profile?")) return;
    try {
      await deleteLocalCertificate(certId);
      setCertificates((prev) => {
        const remaining = prev.filter((c) => c.id !== certId);
        if (selectedCertId === certId) {
          setSelectedCertId(remaining[0]?.id || "");
        }
        return remaining;
      });
    } catch (err: any) {
      setError(err.message || "Failed to delete certificate");
    }
  };

  const handleUploadP12 = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedP12Name(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setUploadedP12B64(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // --- Apply Cryptographic PKCS#7 Signature ---
  const handleDigitalSign = async () => {
    if (certMode === "stored" && !selectedCertId) {
      setError("Select or generate a local PKCS#12 certificate first.");
      return;
    }
    if (certMode === "upload" && !uploadedP12B64) {
      setError("Upload a .p12 or .pfx certificate bundle first.");
      return;
    }
    if (!signPassword) {
      setError("Enter the certificate passphrase to unlock the private key.");
      return;
    }
    if (signVisible && (signRect[0] >= signRect[2] || signRect[1] >= signRect[3])) {
      setError("Signature box bounding coordinates must have X1 > X0 and Y1 > Y0.");
      return;
    }

    setIsSigningDigital(true);
    setError(null);
    try {
      const res = await signDocumentDigitally(documentId, {
        cert_id: certMode === "stored" ? selectedCertId : undefined,
        pkcs12_base64: certMode === "upload" ? uploadedP12B64 : undefined,
        password: signPassword,
        reason: signReason.trim() || undefined,
        location: signLocation.trim() || undefined,
        contact_info: signContact.trim() || undefined,
        visible: signVisible,
        page_index: signPage,
        rect: signVisible ? signRect : undefined,
      });
      setSignPassword("");
      onSignatureSuccess(
        `Digitally signed PDF with PKCS#7 (Child rev ${res.revision.id.slice(0, 8)})`
      );
      onClose();
    } catch (err: any) {
      setError(err.message || "Cryptographic signing failed");
    } finally {
      setIsSigningDigital(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <PenTool className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-100 text-sm">
                Electronic & Digital Signatures
              </h2>
              <p className="text-[11px] text-slate-400">
                Page {currentPage} of {totalPages} • Visual Stamp Overlays & PKCS#12 Cryptographic Signing
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
              setActiveTab("visual");
              setError(null);
            }}
            className={`pb-2 px-3 border-b-2 font-medium flex items-center gap-1.5 transition ${
              activeTab === "visual"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
            <span>Visual Stamp (Draw / Upload)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("digital");
              setError(null);
            }}
            className={`pb-2 px-3 border-b-2 font-medium flex items-center gap-1.5 transition ${
              activeTab === "digital"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Certificate Digital Sign (PKCS#12)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("verify");
              setError(null);
              loadVerification();
            }}
            className={`pb-2 px-3 border-b-2 font-medium flex items-center gap-1.5 transition ${
              activeTab === "verify"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileCheck className="w-3.5 h-3.5" />
            <span>
              Verify Signatures ({verificationReport?.digital_signature_count ?? 0})
            </span>
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

          {/* TAB 1: Visual Electronic Signature Stamp */}
          {activeTab === "visual" && (
            <div className="space-y-4">
              <div className="p-3 bg-amber-950/25 border border-amber-800/50 rounded-xl flex items-start gap-2.5 text-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <span className="font-semibold text-amber-300">Visual Electronic Stamp: </span>
                  Places a drawn or uploaded PNG signature graphic onto the page as a flat overlay.
                  It does not embed a cryptographic PKCS#7 signature or prevent document modification.
                  Use <span className="font-semibold">Certificate Digital Sign</span> for cryptographic integrity.
                </div>
              </div>

              {/* Saved Signature Library */}
              {savedSignatures.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-slate-300 block">
                    Saved Local Signatures ({savedSignatures.length})
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {savedSignatures.map((sig) => (
                      <div
                        key={sig.id}
                        onClick={() => {
                          setSelectedSavedSigId(sig.id);
                          setUploadedSigB64(null);
                        }}
                        className={`relative p-2 rounded-xl border cursor-pointer transition flex flex-col items-center gap-1 ${
                          selectedSavedSigId === sig.id
                            ? "border-indigo-500 bg-indigo-950/30 ring-1 ring-indigo-500/40"
                            : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
                        }`}
                      >
                        <div className="w-full h-12 bg-white rounded-lg flex items-center justify-center p-1 overflow-hidden">
                          <img
                            src={sig.image_data_url}
                            alt={sig.name}
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                        <span className="text-[10px] text-slate-300 truncate max-w-full">
                          {sig.name}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSavedSig(sig.id);
                          }}
                          className="absolute top-1 right-1 p-1 rounded bg-slate-900/80 text-slate-400 hover:text-red-400 transition"
                          title="Delete saved signature"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Draw Pad or Upload Image */}
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-200 text-[11px]">
                    Draw Handwritten Signature (or Upload Image)
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      {[
                        { color: "#0f172a", label: "Black Ink" },
                        { color: "#1d4ed8", label: "Blue Ink" },
                        { color: "#b91c1c", label: "Red Ink" },
                      ].map((swatch) => (
                        <button
                          key={swatch.color}
                          type="button"
                          onClick={() => setInkColor(swatch.color)}
                          title={swatch.label}
                          className={`w-4 h-4 rounded-full border-2 transition ${
                            inkColor === swatch.color
                              ? "border-indigo-400 scale-110"
                              : "border-slate-600"
                          }`}
                          style={{ backgroundColor: swatch.color }}
                        />
                      ))}
                    </div>

                    <select
                      value={strokeWidth}
                      onChange={(e) => setStrokeWidth(parseInt(e.target.value, 10))}
                      className="bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] text-slate-300"
                      title="Pen Stroke Width"
                    >
                      <option value={2}>Fine (2px)</option>
                      <option value={3}>Medium (3px)</option>
                      <option value={5}>Bold (5px)</option>
                    </select>

                    <label className="cursor-pointer px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[10px] font-medium flex items-center gap-1 transition">
                      <Upload className="w-3 h-3 text-sky-400" />
                      <span>Upload PNG/JPG</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleUploadSignatureImage}
                        className="hidden"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={handleClearCanvas}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] flex items-center gap-1 transition"
                    >
                      <Eraser className="w-3 h-3" />
                      <span>Clear</span>
                    </button>
                  </div>
                </div>

                {uploadedSigB64 ? (
                  <div className="h-32 bg-white rounded-xl border border-slate-700 flex flex-col items-center justify-center p-2 relative">
                    <img
                      src={uploadedSigB64}
                      alt="Uploaded signature"
                      className="max-h-24 object-contain"
                    />
                    <span className="text-[10px] text-slate-500 mt-1">Uploaded image selected</span>
                  </div>
                ) : (
                  <div className="relative">
                    <canvas
                      ref={canvasRef}
                      width={560}
                      height={150}
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerLeave={handlePointerUp}
                      className="w-full h-32 bg-white rounded-xl border border-slate-700 cursor-crosshair touch-none"
                    />
                    {!hasDrawnInk && (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-slate-400 text-xs">
                        Sign here with mouse or touch...
                      </div>
                    )}
                  </div>
                )}

                {/* Save to local library row */}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={newSigName}
                    onChange={(e) => setNewSigName(e.target.value)}
                    placeholder="Signature label..."
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleSaveToLibrary}
                    disabled={isSavingSig || (!hasDrawnInk && !uploadedSigB64)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/30 rounded-lg text-[11px] font-medium flex items-center gap-1.5 disabled:opacity-40 transition"
                  >
                    {isSavingSig ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <BookmarkPlus className="w-3.5 h-3.5" />
                    )}
                    <span>Save to Local Library</span>
                  </button>
                </div>
              </div>

              {/* Placement & Caption Controls */}
              <div className="p-3.5 bg-slate-950/50 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200 text-[11px]">
                    Stamp Position & Caption (PDF Bottom-Left Coordinates in Points)
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setStampX(36);
                        setStampY(48);
                      }}
                      className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-[10px] text-slate-300"
                    >
                      Bottom-Left
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setStampX(360);
                        setStampY(48);
                      }}
                      className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-[10px] text-slate-300"
                    >
                      Bottom-Right
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">Page</label>
                    <select
                      value={stampPage}
                      onChange={(e) => setStampPage(parseInt(e.target.value, 10))}
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
                    <label className="text-[10px] text-slate-400 block mb-0.5">X (pt)</label>
                    <input
                      type="number"
                      value={stampX}
                      onChange={(e) => setStampX(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">Y (pt)</label>
                    <input
                      type="number"
                      value={stampY}
                      onChange={(e) => setStampY(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">Width (pt)</label>
                    <input
                      type="number"
                      value={stampW}
                      onChange={(e) => setStampW(parseFloat(e.target.value) || 120)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">Height (pt)</label>
                    <input
                      type="number"
                      value={stampH}
                      onChange={(e) => setStampH(parseFloat(e.target.value) || 50)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">
                      Signer Name Caption (Optional)
                    </label>
                    <input
                      type="text"
                      value={stampSignerName}
                      onChange={(e) => setStampSignerName(e.target.value)}
                      placeholder="e.g. Jane Doe"
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-0.5">
                      Reason / Label (Optional)
                    </label>
                    <input
                      type="text"
                      value={stampReason}
                      onChange={(e) => setStampReason(e.target.value)}
                      placeholder="e.g. Approved"
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={stampTimestamp}
                      onChange={(e) => setStampTimestamp(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-indigo-500"
                    />
                    <span className="text-[11px]">Include UTC Timestamp Caption</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400">
                      Opacity: {Math.round(stampOpacity * 100)}%
                    </span>
                    <input
                      type="range"
                      min="0.2"
                      max="1"
                      step="0.05"
                      value={stampOpacity}
                      onChange={(e) => setStampOpacity(parseFloat(e.target.value))}
                      className="w-24 accent-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleApplyVisualStamp}
                disabled={isStamping}
                className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition disabled:opacity-50"
              >
                {isStamping ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Applying Visual Stamp (Creating Revision)...</span>
                  </>
                ) : (
                  <>
                    <PenTool className="w-4 h-4" />
                    <span>Apply Visual Signature Stamp</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* TAB 2: Cryptographic PKCS#12 Digital Sign */}
          {activeTab === "digital" && (
            <div className="space-y-4">
              <div className="p-3 bg-emerald-950/25 border border-emerald-800/50 rounded-xl flex items-start gap-2.5 text-emerald-200">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <span className="font-semibold text-emerald-300">
                    True PKCS#7 / PAdES Cryptographic Signature:{" "}
                  </span>
                  Uses an X.509 RSA-2048 PKCS#12 certificate via pyHanko to compute a SHA-256 byte-range
                  digest over the PDF. Supports multiple countersignatures and tamper detection offline.
                </div>
              </div>

              {/* Certificate Source Switcher */}
              <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCertMode("stored")}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition ${
                        certMode === "stored"
                          ? "bg-indigo-600/20 border-indigo-500 text-indigo-300"
                          : "bg-slate-900 border-slate-800 text-slate-400"
                      }`}
                    >
                      Local Certificates ({certificates.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setCertMode("upload")}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition ${
                        certMode === "upload"
                          ? "bg-indigo-600/20 border-indigo-500 text-indigo-300"
                          : "bg-slate-900 border-slate-800 text-slate-400"
                      }`}
                    >
                      Upload .p12 / .pfx
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowCertWizard((v) => !v)}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 rounded-lg text-[11px] font-medium transition"
                  >
                    {showCertWizard ? "Hide Cert Generator" : "+ New Self-Signed Cert"}
                  </button>
                </div>

                {/* Inline Self-Signed Cert Generator */}
                {showCertWizard && (
                  <div className="p-3 bg-slate-900/90 border border-slate-700 rounded-xl space-y-2.5">
                    <div className="text-[11px] font-semibold text-emerald-300">
                      Generate Local Self-Signed RSA-2048 X.509 Certificate (PKCS#12)
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Profile Label</label>
                        <input
                          type="text"
                          value={newCertLabel}
                          onChange={(e) => setNewCertLabel(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Common Name (CN)</label>
                        <input
                          type="text"
                          value={newCertCN}
                          onChange={(e) => setNewCertCN(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Organization</label>
                        <input
                          type="text"
                          value={newCertOrg}
                          onChange={(e) => setNewCertOrg(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Email</label>
                        <input
                          type="email"
                          value={newCertEmail}
                          onChange={(e) => setNewCertEmail(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Validity (Days)</label>
                        <input
                          type="number"
                          min={1}
                          max={3650}
                          value={newCertDays}
                          onChange={(e) => setNewCertDays(parseInt(e.target.value, 10) || 365)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">
                          Protect Key With Passphrase (min 4 chars)
                        </label>
                        <input
                          type="password"
                          value={newCertPassword}
                          onChange={(e) => setNewCertPassword(e.target.value)}
                          placeholder="Enter private key passphrase..."
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleGenerateCert}
                      disabled={isGeneratingCert}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                    >
                      {isGeneratingCert ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <KeyRound className="w-3.5 h-3.5" />
                      )}
                      <span>Create Encrypted .p12 Certificate</span>
                    </button>
                  </div>
                )}

                {certMode === "stored" ? (
                  certificates.length === 0 ? (
                    <div className="p-4 text-center text-slate-400 border border-dashed border-slate-800 rounded-lg">
                      No local certificates yet. Generate a self-signed certificate above.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {certificates.map((cert) => (
                        <div
                          key={cert.id}
                          onClick={() => setSelectedCertId(cert.id)}
                          className={`p-2.5 rounded-xl border cursor-pointer flex items-center justify-between transition ${
                            selectedCertId === cert.id
                              ? "border-indigo-500 bg-indigo-950/30"
                              : "border-slate-800 bg-slate-900/50 hover:border-slate-700"
                          }`}
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-200">{cert.label}</span>
                              <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] text-amber-300">
                                Self-Signed
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400">
                              CN: {cert.common_name} • Org: {cert.organization} • SHA256:{" "}
                              <span className="font-mono">{cert.fingerprint_sha256.slice(0, 16)}…</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCert(cert.id);
                            }}
                            className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-slate-800 transition"
                            title="Delete certificate"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  <div className="p-3 bg-slate-900 border border-dashed border-slate-700 rounded-xl flex items-center justify-between">
                    <span className="text-slate-300 text-[11px]">
                      {uploadedP12Name ? `Selected: ${uploadedP12Name}` : "Choose external .p12 or .pfx bundle"}
                    </span>
                    <label className="cursor-pointer px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-300 rounded-lg text-[11px] font-medium flex items-center gap-1.5">
                      <Upload className="w-3.5 h-3.5" />
                      <span>Browse File</span>
                      <input type="file" accept=".p12,.pfx" onChange={handleUploadP12} className="hidden" />
                    </label>
                  </div>
                )}
              </div>

              {/* Signing Metadata & Passphrase */}
              <div className="p-3.5 bg-slate-950/50 border border-slate-800 rounded-xl space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-300 font-semibold block mb-1">
                      Certificate Passphrase *
                    </label>
                    <input
                      type="password"
                      value={signPassword}
                      onChange={(e) => setSignPassword(e.target.value)}
                      placeholder="Unlock PKCS#12 private key..."
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Reason</label>
                    <input
                      type="text"
                      value={signReason}
                      onChange={(e) => setSignReason(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Location</label>
                    <input
                      type="text"
                      value={signLocation}
                      onChange={(e) => setSignLocation(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Contact Info (Optional)</label>
                    <input
                      type="text"
                      value={signContact}
                      onChange={(e) => setSignContact(e.target.value)}
                      placeholder="e.g. legal@company.local"
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs"
                    />
                  </div>
                </div>

                <div className="pt-1 border-t border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={signVisible}
                        onChange={(e) => setSignVisible(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-900 text-indigo-500"
                      />
                      <span className="text-[11px] font-medium">
                        Render Visible Signature Annotation Box on Page
                      </span>
                    </label>
                    {signVisible && (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setSignRect([36, 36, 260, 96])}
                          className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-[10px] text-slate-300"
                        >
                          Bottom-Left
                        </button>
                        <button
                          type="button"
                          onClick={() => setSignRect([335, 36, 559, 96])}
                          className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 rounded text-[10px] text-slate-300"
                        >
                          Bottom-Right
                        </button>
                      </div>
                    )}
                  </div>

                  {signVisible && (
                    <div className="grid grid-cols-5 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-400 block">Page</label>
                        <select
                          value={signPage}
                          onChange={(e) => setSignPage(parseInt(e.target.value, 10))}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs"
                        >
                          {Array.from({ length: totalPages }).map((_, i) => (
                            <option key={i} value={i}>
                              Page {i + 1}
                            </option>
                          ))}
                        </select>
                      </div>
                      {(["X0", "Y0", "X1", "Y1"] as const).map((lbl, idx) => (
                        <div key={lbl}>
                          <label className="text-[10px] text-slate-400 block">{lbl} (pt)</label>
                          <input
                            type="number"
                            value={signRect[idx]}
                            onChange={(e) => {
                              const next = [...signRect] as [number, number, number, number];
                              next[idx] = parseFloat(e.target.value) || 0;
                              setSignRect(next);
                            }}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={handleDigitalSign}
                disabled={isSigningDigital}
                className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition disabled:opacity-50"
              >
                {isSigningDigital ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Computing SHA-256 Digest & Signing PDF...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Sign PDF Cryptographically (PKCS#7 / PAdES)</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* TAB 3: Offline Signature Verification */}
          {activeTab === "verify" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                <div className="flex items-center gap-2.5">
                  {loadingVerify ? (
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                  ) : !verificationReport?.has_digital_signatures ? (
                    <AlertCircle className="w-4 h-4 text-slate-400" />
                  ) : verificationReport.all_signatures_intact ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <ShieldAlert className="w-4 h-4 text-red-400" />
                  )}
                  <div>
                    <div className="font-semibold text-slate-200">
                      {loadingVerify
                        ? "Verifying embedded PKCS#7 signatures..."
                        : !verificationReport?.has_digital_signatures
                        ? "No Cryptographic Digital Signatures Embedded"
                        : verificationReport.all_signatures_intact
                        ? `All ${verificationReport.digital_signature_count} Digital Signature(s) Intact`
                        : "Signature Tampering or Corruption Detected"}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Offline byte-range hash & RSA/ECDSA signature inspection via pyHanko
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={loadVerification}
                  disabled={loadingVerify}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-[11px] flex items-center gap-1 transition"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingVerify ? "animate-spin" : ""}`} />
                  <span>Re-Verify</span>
                </button>
              </div>

              {verificationReport && verificationReport.signatures.length > 0 && (
                <div className="space-y-2.5">
                  {verificationReport.signatures.map((sig) => (
                    <div
                      key={sig.field_name}
                      className={`p-3.5 rounded-xl border space-y-2 ${
                        sig.cryptographically_valid
                          ? "bg-slate-950/60 border-emerald-800/60"
                          : "bg-red-950/25 border-red-800/70"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-100">{sig.signer_name}</span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-[10px] text-slate-300">
                            {sig.field_name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              sig.cryptographically_valid
                                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                                : "bg-red-500/20 text-red-300 border border-red-500/30"
                            }`}
                          >
                            {sig.cryptographically_valid ? "Byte-Range Intact" : "TAMPERED / INVALID"}
                          </span>
                          {sig.self_signed && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              Self-Signed (No External CA)
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-400">
                        <div>
                          <span className="text-slate-500">Subject: </span>
                          <span className="text-slate-300">{sig.signer_subject}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Coverage: </span>
                          <span className="font-mono text-slate-300">{sig.coverage}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Modifications: </span>
                          <span className="font-mono text-slate-300">{sig.modification_level}</span>
                        </div>
                        {sig.signing_time && (
                          <div>
                            <span className="text-slate-500">Signing Time: </span>
                            <span className="font-mono text-slate-300">{sig.signing_time}</span>
                          </div>
                        )}
                        {sig.reason && (
                          <div>
                            <span className="text-slate-500">Reason: </span>
                            <span className="text-slate-300">{sig.reason}</span>
                          </div>
                        )}
                        {sig.location && (
                          <div>
                            <span className="text-slate-500">Location: </span>
                            <span className="text-slate-300">{sig.location}</span>
                          </div>
                        )}
                      </div>

                      {sig.error && (
                        <div className="text-[11px] text-red-300 font-mono bg-red-950/50 p-2 rounded">
                          {sig.error}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {verificationReport?.architecture_note && (
                <div className="p-3 bg-slate-950/50 border border-slate-800 rounded-xl text-[11px] text-slate-400 leading-relaxed">
                  {verificationReport.architecture_note}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-900/90">
          <span className="text-[10px] text-slate-500 font-mono">
            Engine: Pillow + ReportLab Stamps • Cryptography + pyHanko PKCS#7 • 100% Offline
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
