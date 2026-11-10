import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  Image as ImageIcon,
  Upload,
  Download,
  Trash2,
  RefreshCw,
  Layers,
  AlertCircle,
  Check,
  Loader2,
} from "lucide-react";
import { ImageInfo } from "../types";
import {
  insertImage,
  listImages,
  getImageExtractUrl,
  replaceImage,
  deleteImage,
} from "../services/api";

interface ImageEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  currentPage: number;
  onSuccess: (message: string) => void;
}

type TabType = "insert" | "manage";

export const ImageEditorModal: React.FC<ImageEditorModalProps> = ({
  isOpen,
  onClose,
  documentId,
  currentPage,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>("insert");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Insert Tab States ---
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [naturalWidth, setNaturalWidth] = useState<number>(0);
  const [naturalHeight, setNaturalHeight] = useState<number>(0);
  const [posX, setPosX] = useState<number>(72);
  const [posY, setPosY] = useState<number>(500);
  const [renderWidth, setRenderWidth] = useState<number>(200);
  const [renderHeight, setRenderHeight] = useState<number>(150);
  const [lockAspectRatio, setLockAspectRatio] = useState<boolean>(true);
  const [rotation, setRotation] = useState<number>(0);
  const [opacity, setOpacity] = useState<number>(1.0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Manage Tab States ---
  const [pageImages, setPageImages] = useState<ImageInfo[]>([]);
  const [loadingImages, setLoadingImages] = useState<boolean>(false);
  const [replacingTarget, setReplacingTarget] = useState<string | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  // Load existing images on page
  const loadImages = useCallback(async () => {
    if (!documentId) return;
    setLoadingImages(true);
    try {
      const list = await listImages(documentId, currentPage - 1);
      setPageImages(list);
    } catch (err: any) {
      console.error("Failed to list page images:", err);
    } finally {
      setLoadingImages(false);
    }
  }, [documentId, currentPage]);

  useEffect(() => {
    if (isOpen) {
      loadImages();
      setError(null);
    }
  }, [isOpen, loadImages]);

  // Handle file selection for Insert
  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file (PNG, JPEG, WebP, etc.).");
      return;
    }
    setError(null);
    setSelectedFile(file);

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    // Read natural dimensions
    const img = new Image();
    img.onload = () => {
      setNaturalWidth(img.naturalWidth);
      setNaturalHeight(img.naturalHeight);

      // Default proportional size scaled to max 250 pt
      const maxSide = 250;
      const scale = Math.min(1.0, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      setRenderWidth(w);
      setRenderHeight(h);
    };
    img.src = objectUrl;
  };

  const handleWidthChange = (val: number) => {
    setRenderWidth(val);
    if (lockAspectRatio && naturalWidth > 0 && naturalHeight > 0) {
      const newH = Math.round((val / naturalWidth) * naturalHeight);
      setRenderHeight(newH);
    }
  };

  const handleHeightChange = (val: number) => {
    setRenderHeight(val);
    if (lockAspectRatio && naturalWidth > 0 && naturalHeight > 0) {
      const newW = Math.round((val / naturalHeight) * naturalWidth);
      setRenderWidth(newW);
    }
  };

  const handlePresetPosition = (preset: "center" | "topleft" | "bottomright") => {
    // Assuming standard page approx 612 x 792
    if (preset === "center") {
      setPosX(Math.max(36, Math.round((612 - renderWidth) / 2)));
      setPosY(Math.max(36, Math.round((792 - renderHeight) / 2)));
    } else if (preset === "topleft") {
      setPosX(72);
      setPosY(Math.round(792 - 72 - renderHeight));
    } else if (preset === "bottomright") {
      setPosX(Math.round(612 - 72 - renderWidth));
      setPosY(72);
    }
  };

  // Submit Insert Image
  const handleInsertSubmit = async () => {
    if (!selectedFile) {
      setError("Please select an image file to insert.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await insertImage(
        documentId,
        currentPage - 1,
        selectedFile,
        posX,
        posY,
        renderWidth,
        renderHeight,
        rotation,
        opacity
      );
      onSuccess(`Inserted image onto Page ${currentPage}`);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to insert image");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Replace Image
  const handleReplaceSubmit = async (file: File) => {
    if (!replacingTarget) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await replaceImage(documentId, currentPage - 1, replacingTarget, file);
      onSuccess(`Replaced image '${replacingTarget}' on Page ${currentPage}`);
      setReplacingTarget(null);
      await loadImages();
    } catch (err: any) {
      setError(err.message || "Failed to replace image");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Delete Image
  const handleDeleteSubmit = async (imageName: string) => {
    if (!confirm(`Are you sure you want to remove image '${imageName}' from Page ${currentPage}?`)) {
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await deleteImage(documentId, currentPage - 1, imageName);
      onSuccess(`Removed image from Page ${currentPage}`);
      await loadImages();
    } catch (err: any) {
      setError(err.message || "Failed to remove image");
    } finally {
      setIsSubmitting(false);
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
              <ImageIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-100 text-sm">Image Editing Suite</h2>
              <p className="text-[11px] text-slate-400">
                Page {currentPage} • Insert, Replace, Scale, Rotate, and Delete Embedded Images
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
            onClick={() => setActiveTab("insert")}
            className={`pb-2.5 px-3 font-medium border-b-2 flex items-center gap-1.5 transition ${
              activeTab === "insert"
                ? "border-sky-500 text-sky-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Insert New Image</span>
          </button>

          <button
            onClick={() => {
              setActiveTab("manage");
              loadImages();
            }}
            className={`pb-2.5 px-3 font-medium border-b-2 flex items-center gap-1.5 transition ${
              activeTab === "manage"
                ? "border-sky-500 text-sky-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Embedded Page Images</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] font-mono text-sky-300">
              {pageImages.length}
            </span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 bg-red-950/40 border border-red-900 rounded-xl flex items-start gap-2.5 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* TAB 1: INSERT NEW IMAGE */}
          {activeTab === "insert" && (
            <div className="space-y-4 text-xs">
              {/* File Upload Box */}
              {!previewUrl ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handleFileSelect(e.dataTransfer.files[0]);
                    }
                  }}
                  className="border-2 border-dashed border-slate-700 hover:border-sky-500/60 rounded-xl p-8 flex flex-col items-center justify-center gap-2 cursor-pointer bg-slate-950/40 hover:bg-slate-950/70 transition"
                >
                  <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                    <Upload className="w-5 h-5 text-sky-400" />
                  </div>
                  <p className="font-medium text-slate-300 text-xs">Click or drag image to upload</p>
                  <p className="text-[10px] text-slate-500 font-mono">PNG, JPEG, WebP, BMP up to 20MB</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileSelect(e.target.files[0]);
                      }
                    }}
                    className="hidden"
                  />
                </div>
              ) : (
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="w-14 h-14 object-contain rounded-lg border border-slate-700 bg-slate-900"
                    />
                    <div>
                      <p className="font-semibold text-slate-200 text-xs truncate max-w-xs">
                        {selectedFile?.name}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono">
                        {naturalWidth} × {naturalHeight} px •{" "}
                        {Math.round((selectedFile?.size || 0) / 1024)} KB
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      setPreviewUrl(null);
                    }}
                    className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                  >
                    Change Image
                  </button>
                </div>
              )}

              {/* Placement & Dimension Controls */}
              {previewUrl && (
                <div className="space-y-3 bg-slate-950/40 p-3.5 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200 text-xs">Dimensions & Scale</span>
                    <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-400">
                      <input
                        type="checkbox"
                        checked={lockAspectRatio}
                        onChange={(e) => setLockAspectRatio(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-900 text-sky-600 focus:ring-sky-500"
                      />
                      <span>Lock Aspect Ratio</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 text-[10px] mb-1">Render Width (pt)</label>
                      <input
                        type="number"
                        min="10"
                        max="1000"
                        value={renderWidth}
                        onChange={(e) => handleWidthChange(parseFloat(e.target.value) || 10)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 text-[10px] mb-1">Render Height (pt)</label>
                      <input
                        type="number"
                        min="10"
                        max="1000"
                        value={renderHeight}
                        onChange={(e) => handleHeightChange(parseFloat(e.target.value) || 10)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs"
                      />
                    </div>
                  </div>

                  {/* Position Coordinates */}
                  <div className="pt-2 border-t border-slate-800/80">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-slate-200 text-xs">Position (pt from bottom-left)</span>
                      <div className="flex items-center gap-1 text-[10px]">
                        <button
                          type="button"
                          onClick={() => handlePresetPosition("topleft")}
                          className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
                        >
                          Top-Left
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePresetPosition("center")}
                          className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
                        >
                          Center
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePresetPosition("bottomright")}
                          className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
                        >
                          Bottom-Right
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 text-[10px] mb-1">X Position (pt)</label>
                        <input
                          type="number"
                          value={posX}
                          onChange={(e) => setPosX(parseFloat(e.target.value) || 0)}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 text-[10px] mb-1">Y Position (pt)</label>
                        <input
                          type="number"
                          value={posY}
                          onChange={(e) => setPosY(parseFloat(e.target.value) || 0)}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Rotation & Opacity */}
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800/80">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-slate-400 text-[10px]">Rotation ({rotation}°)</label>
                        <div className="flex gap-1">
                          {[0, 90, 180, 270].map((deg) => (
                            <button
                              key={deg}
                              type="button"
                              onClick={() => setRotation(deg)}
                              className={`px-1.5 py-0.5 text-[9px] rounded font-mono ${
                                rotation === deg ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"
                              }`}
                            >
                              {deg}°
                            </button>
                          ))}
                        </div>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="360"
                        step="5"
                        value={rotation}
                        onChange={(e) => setRotation(parseInt(e.target.value, 10))}
                        className="w-full accent-sky-500"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 text-[10px] mb-1">
                        Opacity ({Math.round(opacity * 100)}%)
                      </label>
                      <input
                        type="range"
                        min="0.1"
                        max="1.0"
                        step="0.05"
                        value={opacity}
                        onChange={(e) => setOpacity(parseFloat(e.target.value))}
                        className="w-full accent-sky-500"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: MANAGE EMBEDDED PAGE IMAGES */}
          {activeTab === "manage" && (
            <div className="space-y-3">
              <input
                ref={replaceInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleReplaceSubmit(e.target.files[0]);
                  }
                }}
                className="hidden"
              />

              {loadingImages ? (
                <div className="py-10 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
                  <span className="text-xs">Inspecting embedded raster objects...</span>
                </div>
              ) : pageImages.length === 0 ? (
                <div className="py-10 text-center text-slate-500 bg-slate-950/30 rounded-xl border border-slate-800/80 p-6">
                  <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-xs font-medium text-slate-400">No embedded raster images detected on Page {currentPage}</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    You can insert images on this page using the "Insert New Image" tab above.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <p className="text-[11px] text-slate-400">
                    Found {pageImages.length} embedded image XObject{pageImages.length > 1 ? "s" : ""} on Page {currentPage}:
                  </p>
                  {pageImages.map((img) => {
                    const extractUrl = getImageExtractUrl(documentId, currentPage - 1, img.name);
                    return (
                      <div
                        key={img.name}
                        className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3 hover:border-slate-700 transition"
                      >
                        <div className="flex items-center gap-3">
                          <img
                            src={extractUrl}
                            alt={img.name}
                            className="w-16 h-16 object-contain rounded-lg border border-slate-700 bg-slate-900 shrink-0"
                            onError={(e) => {
                              // Fallback placeholder icon if browser preview fails
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                          <div>
                            <p className="font-mono text-xs font-semibold text-slate-200 truncate max-w-[220px]">
                              {img.name}
                            </p>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                              <span className="px-1.5 py-0.2 rounded bg-slate-800 text-sky-300">
                                {img.format}
                              </span>
                              <span>
                                {img.width} × {img.height} px
                              </span>
                              <span>•</span>
                              <span>{Math.round(img.size_bytes / 1024)} KB</span>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5">
                          {/* Download */}
                          <a
                            href={extractUrl}
                            download={img.name}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                            title="Extract / Download Image"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>

                          {/* Replace */}
                          <button
                            type="button"
                            onClick={() => {
                              setReplacingTarget(img.name);
                              replaceInputRef.current?.click();
                            }}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition"
                            title="Replace this image stream with new image"
                          >
                            <RefreshCw className="w-3 h-3 text-sky-400" />
                            <span>Replace</span>
                          </button>

                          {/* Delete */}
                          <button
                            type="button"
                            onClick={() => handleDeleteSubmit(img.name)}
                            className="p-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-200 transition"
                            title="Delete this image from page"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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

          {activeTab === "insert" && (
            <button
              type="button"
              onClick={handleInsertSubmit}
              disabled={!selectedFile || isSubmitting}
              className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 shadow-lg shadow-sky-600/20 transition disabled:opacity-40"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Stamping Image...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Insert onto Page {currentPage}</span>
                </>
              )}
            </button>
          )}

          {activeTab === "manage" && (
            <button
              type="button"
              onClick={() => loadImages()}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl flex items-center gap-1.5 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh List</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
