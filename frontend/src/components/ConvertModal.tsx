import React, { useState, useEffect, useRef } from "react";
import {
  X,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  ArrowUpDown,
  Trash2,
  Upload,
  Check,
  AlertCircle,
  Loader2,
  ExternalLink,
  Info,
} from "lucide-react";
import { ConversionCapabilities } from "../types";
import {
  fetchConversionStatus,
  convertImagesToPdf,
  convertOfficeToPdf,
  convertTextToPdf,
} from "../services/api";

interface ConvertModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConversionSuccess: (newDocumentId: string) => void;
}

type TabType = "images" | "office" | "text";

export const ConvertModal: React.FC<ConvertModalProps> = ({
  isOpen,
  onClose,
  onConversionSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>("images");
  const [capabilities, setCapabilities] = useState<ConversionCapabilities | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Images to PDF State ---
  const [imageFiles, setImageFiles] = useState<{ id: string; file: File; preview: string }[]>([]);
  const [imageDocTitle, setImageDocTitle] = useState("Photo_Collection.pdf");
  const [imagePageSize, setImagePageSize] = useState("A4");
  const [imageFitToPage, setImageFitToPage] = useState(true);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // --- Office to PDF State ---
  const [officeFile, setOfficeFile] = useState<File | null>(null);
  const officeInputRef = useRef<HTMLInputElement>(null);

  // --- Text to PDF State ---
  const [textDocTitle, setTextDocTitle] = useState("Notes.pdf");
  const [textContent, setTextContent] = useState("");
  const textFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      fetchConversionStatus()
        .then((caps) => setCapabilities(caps))
        .catch((err) => console.error("Error loading conversion status:", err));
      setError(null);
    }
  }, [isOpen]);

  // Handle image files added
  const handleAddImages = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const added = Array.from(newFiles)
      .filter((f) => f.type.startsWith("image/"))
      .map((f) => ({
        id: Math.random().toString(36).substring(2, 9),
        file: f,
        preview: URL.createObjectURL(f),
      }));

    setImageFiles((prev) => [...prev, ...added]);
  };

  const handleMoveImage = (idx: number, dir: -1 | 1) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= imageFiles.length) return;
    const copy = [...imageFiles];
    const [moved] = copy.splice(idx, 1);
    copy.splice(targetIdx, 0, moved);
    setImageFiles(copy);
  };

  const handleRemoveImage = (idx: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  // Convert Images to PDF Submit
  const handleImagesSubmit = async () => {
    if (imageFiles.length === 0) {
      setError("Please select at least one image file to convert.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const files = imageFiles.map((item) => item.file);
      const res = await convertImagesToPdf(
        files,
        imageDocTitle,
        imagePageSize,
        imageFitToPage
      );
      onClose();
      onConversionSuccess(res.document.id);
    } catch (err: any) {
      setError(err.message || "Image conversion failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Convert Office to PDF Submit
  const handleOfficeSubmit = async () => {
    if (!officeFile) {
      setError("Please select an Office document to convert.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await convertOfficeToPdf(officeFile);
      onClose();
      onConversionSuccess(res.document.id);
    } catch (err: any) {
      setError(err.message || "Office conversion failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Convert Text to PDF Submit
  const handleTextSubmit = async () => {
    if (!textContent.trim()) {
      setError("Please enter or upload text content to convert.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await convertTextToPdf(textContent, textDocTitle);
      onClose();
      onConversionSuccess(res.document.id);
    } catch (err: any) {
      setError(err.message || "Text conversion failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-100 text-sm">Document Conversion Suite</h2>
              <p className="text-[11px] text-slate-400">
                100% Local Conversion: Images, Office Documents, & Text to PDF
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
            onClick={() => setActiveTab("images")}
            className={`pb-2.5 px-3 font-medium border-b-2 flex items-center gap-1.5 transition ${
              activeTab === "images"
                ? "border-sky-500 text-sky-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Images to PDF</span>
          </button>

          <button
            onClick={() => setActiveTab("office")}
            className={`pb-2.5 px-3 font-medium border-b-2 flex items-center gap-1.5 transition ${
              activeTab === "office"
                ? "border-sky-500 text-sky-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Office (DOCX/XLSX)</span>
          </button>

          <button
            onClick={() => setActiveTab("text")}
            className={`pb-2.5 px-3 font-medium border-b-2 flex items-center gap-1.5 transition ${
              activeTab === "text"
                ? "border-sky-500 text-sky-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Text to PDF</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1 text-xs">
          {error && (
            <div className="p-3 bg-red-950/40 border border-red-900 rounded-xl flex items-start gap-2.5 text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* TAB 1: IMAGES TO PDF */}
          {activeTab === "images" && (
            <div className="space-y-3">
              {/* Drop area */}
              <div
                onClick={() => imageInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleAddImages(e.dataTransfer.files);
                }}
                className="border-2 border-dashed border-slate-700 hover:border-sky-500/60 rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer bg-slate-950/40 hover:bg-slate-950/70 transition"
              >
                <Upload className="w-6 h-6 text-sky-400" />
                <p className="font-medium text-slate-300 text-xs">Click or drag images to add (PNG, JPG, WebP)</p>
                <p className="text-[10px] text-slate-500">Multiple images will be merged into a multi-page PDF</p>
                <input
                  ref={imageInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => handleAddImages(e.target.files)}
                  className="hidden"
                />
              </div>

              {/* Selected Images List */}
              {imageFiles.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-slate-400 text-[11px]">
                    <span>{imageFiles.length} image{imageFiles.length > 1 ? "s" : ""} in page sequence:</span>
                    <button
                      type="button"
                      onClick={() => setImageFiles([])}
                      className="text-red-400 hover:underline"
                    >
                      Clear all
                    </button>
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                    {imageFiles.map((item, idx) => (
                      <div
                        key={item.id}
                        className="bg-slate-950/60 border border-slate-800 rounded-lg p-2 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="font-mono text-[10px] text-slate-500 w-4">{idx + 1}.</span>
                          <img
                            src={item.preview}
                            alt=""
                            className="w-8 h-8 object-cover rounded bg-slate-900 border border-slate-700"
                          />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-200 text-xs truncate max-w-xs">
                              {item.file.name}
                            </p>
                            <p className="text-[10px] text-slate-500 font-mono">
                              {Math.round(item.file.size / 1024)} KB
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleMoveImage(idx, -1)}
                            disabled={idx === 0}
                            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-20"
                            title="Move Up"
                          >
                            <ArrowUpDown className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(idx)}
                            className="p-1 rounded hover:bg-red-950/40 text-slate-400 hover:text-red-400"
                            title="Remove"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Options */}
                  <div className="grid grid-cols-2 gap-3 pt-2 bg-slate-950/40 p-3 rounded-xl border border-slate-800">
                    <div>
                      <label className="block text-slate-400 text-[10px] mb-1">Document Title</label>
                      <input
                        type="text"
                        value={imageDocTitle}
                        onChange={(e) => setImageDocTitle(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 text-[10px] mb-1">Page Dimensions</label>
                      <select
                        value={imagePageSize}
                        onChange={(e) => setImagePageSize(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-slate-200 text-xs"
                      >
                        <option value="A4">A4 Standard (210 × 297 mm)</option>
                        <option value="LETTER">US Letter (8.5 × 11 in)</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                        <input
                          type="checkbox"
                          checked={imageFitToPage}
                          onChange={(e) => setImageFitToPage(e.target.checked)}
                          className="rounded border-slate-700 bg-slate-900 text-sky-600 focus:ring-sky-500"
                        />
                        <span>Fit images proportionally with standard 0.5 in margins</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: OFFICE TO PDF */}
          {activeTab === "office" && (
            <div className="space-y-3">
              {/* LibreOffice Status Banner */}
              {capabilities && (
                <div
                  className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
                    capabilities.libreoffice_available
                      ? "bg-emerald-950/30 border-emerald-900 text-emerald-300"
                      : "bg-amber-950/30 border-amber-900 text-amber-300"
                  }`}
                >
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold">
                      {capabilities.libreoffice_available
                        ? "Local LibreOffice Engine Detected"
                        : "LibreOffice Engine Not Detected"}
                    </p>
                    {capabilities.libreoffice_available ? (
                      <p className="text-[11px] opacity-80 font-mono truncate max-w-md">
                        Binary: {capabilities.libreoffice_path}
                      </p>
                    ) : (
                      <div className="text-[11px] opacity-90 space-y-1">
                        <p>
                          To maintain 100% offline local privacy without cloud SaaS APIs, DOCX/XLSX/PPTX
                          conversion relies on local LibreOffice.
                        </p>
                        <p className="font-mono bg-black/40 px-2 py-1 rounded select-all">
                          winget install LibreOffice.LibreOffice
                        </p>
                        <p>Or install from <a href="https://www.libreoffice.org" target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-0.5">libreoffice.org <ExternalLink className="w-2.5 h-2.5" /></a></p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Upload Dropzone */}
              <div
                onClick={() => officeInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    setOfficeFile(e.dataTransfer.files[0]);
                  }
                }}
                className="border-2 border-dashed border-slate-700 hover:border-sky-500/60 rounded-xl p-8 flex flex-col items-center justify-center gap-2 cursor-pointer bg-slate-950/40 hover:bg-slate-950/70 transition"
              >
                <FileSpreadsheet className="w-8 h-8 text-sky-400" />
                <p className="font-medium text-slate-300 text-xs">
                  {officeFile ? officeFile.name : "Click or drag Office document to convert"}
                </p>
                <p className="text-[10px] text-slate-500 font-mono">
                  Supported formats: .docx, .doc, .xlsx, .xls, .pptx, .ppt, .odt
                </p>
                <input
                  ref={officeInputRef}
                  type="file"
                  accept=".docx,.doc,.xlsx,.xls,.pptx,.ppt,.odt,.rtf"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setOfficeFile(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />
              </div>

              {officeFile && (
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-sky-400" />
                    <span className="font-semibold text-slate-200">{officeFile.name}</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      ({Math.round(officeFile.size / 1024)} KB)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOfficeFile(null)}
                    className="text-xs text-red-400 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: TEXT TO PDF */}
          {activeTab === "text" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-slate-400 text-[10px] mb-1">Document Title</label>
                  <input
                    type="text"
                    value={textDocTitle}
                    onChange={(e) => setTextDocTitle(e.target.value)}
                    className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-slate-200 text-xs w-64"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => textFileInputRef.current?.click()}
                  className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                >
                  Import .txt / .md File
                </button>
                <input
                  ref={textFileInputRef}
                  type="file"
                  accept=".txt,.md"
                  onChange={async (e) => {
                    if (e.target.files && e.target.files[0]) {
                      const f = e.target.files[0];
                      const txt = await f.text();
                      setTextContent(txt);
                      setTextDocTitle(f.name.replace(/\.[^/.]+$/, "") + ".pdf");
                    }
                  }}
                  className="hidden"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[10px] mb-1">Content</label>
                <textarea
                  rows={8}
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  placeholder="Type or paste plain text or markdown here..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-slate-200 font-mono text-xs focus:ring-1 focus:ring-sky-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-900/90">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl transition"
          >
            Cancel
          </button>

          {activeTab === "images" && (
            <button
              type="button"
              onClick={handleImagesSubmit}
              disabled={imageFiles.length === 0 || isSubmitting}
              className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 shadow-lg shadow-sky-600/20 transition disabled:opacity-40"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Converting Images...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Convert & Open PDF ({imageFiles.length} pages)</span>
                </>
              )}
            </button>
          )}

          {activeTab === "office" && (
            <button
              type="button"
              onClick={handleOfficeSubmit}
              disabled={!officeFile || isSubmitting}
              className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 shadow-lg shadow-sky-600/20 transition disabled:opacity-40"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Converting Office File...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Convert to PDF</span>
                </>
              )}
            </button>
          )}

          {activeTab === "text" && (
            <button
              type="button"
              onClick={handleTextSubmit}
              disabled={!textContent.trim() || isSubmitting}
              className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 shadow-lg shadow-sky-600/20 transition disabled:opacity-40"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Converting Text...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Generate PDF Document</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
