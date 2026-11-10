import React, { useState } from "react";
import {
  X,
  Type,
  Edit3,
  AlertCircle,
  Check,
  Loader2,
} from "lucide-react";
import {
  applyAnnotations,
  nativeTextEdit,
  TextAnnotationPayload,
  ShapeAnnotationPayload,
} from "../services/api";

interface ContentEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  currentPage: number;
  onSuccess: (message: string) => void;
}

type TabType = "overlay" | "native";

export const ContentEditorModal: React.FC<ContentEditorModalProps> = ({
  isOpen,
  onClose,
  documentId,
  currentPage,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>("overlay");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Overlay state: text annotation
  const [textVal, setTextVal] = useState("Confidential — Draft Review");
  const [textX, setTextX] = useState(72);
  const [textY, setTextY] = useState(750);
  const [fontName, setFontName] = useState("Helvetica");
  const [fontSize, setFontSize] = useState(14);
  const [textColor, setTextColor] = useState("#0284c7");
  const [linkUrl, setLinkUrl] = useState("");
  const [includeText, setIncludeText] = useState(true);

  // Overlay state: shape / highlight
  const [shapeType, setShapeType] = useState("highlight");
  const [shapeX, setShapeX] = useState(70);
  const [shapeY, setShapeY] = useState(745);
  const [shapeWidth, setShapeWidth] = useState(240);
  const [shapeHeight, setShapeHeight] = useState(22);
  const [shapeColor, setShapeColor] = useState("#fde047");
  const [shapeOpacity, setShapeOpacity] = useState(0.4);
  const [includeShape, setIncludeShape] = useState(false);

  // Native text edit state
  const [targetText, setTargetText] = useState("");
  const [replacementText, setReplacementText] = useState("");

  if (!isOpen) return null;

  const handleApplyOverlay = async () => {
    setError(null);
    const texts: TextAnnotationPayload[] = [];
    const shapes: ShapeAnnotationPayload[] = [];

    if (includeText && textVal.trim()) {
      texts.push({
        text: textVal.trim(),
        x: textX,
        y: textY,
        font_name: fontName,
        font_size: fontSize,
        color: textColor,
        link_url: linkUrl.trim() || null,
      });
    }

    if (includeShape) {
      shapes.push({
        type: shapeType,
        x: shapeX,
        y: shapeY,
        width: shapeWidth,
        height: shapeHeight,
        color: shapeColor,
        opacity: shapeOpacity,
      });
    }

    if (texts.length === 0 && shapes.length === 0) {
      setError("Please enable and configure at least one text or shape annotation.");
      return;
    }

    setIsSubmitting(true);
    try {
      await applyAnnotations(documentId, currentPage - 1, texts, shapes);
      onSuccess(`Applied annotations to Page ${currentPage}`);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to apply annotations");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApplyNativeEdit = async () => {
    if (!targetText.trim()) {
      setError("Please specify the exact target text to find in the native content stream.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await nativeTextEdit(documentId, currentPage - 1, targetText, replacementText);
      onSuccess(`Replaced native text on Page ${currentPage}`);
      onClose();
    } catch (err: any) {
      setError(err.message || "Native text edit failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center">
              <Type className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-100 text-sm">PDF Content & Text Editor</h2>
              <p className="text-[11px] text-slate-400">
                Editing Page {currentPage} • Separate Overlay Annotations & Native Stream Editing
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

        {/* Tab switcher */}
        <div className="flex border-b border-slate-800 bg-slate-950/50 px-4 gap-1 text-xs font-medium">
          <button
            onClick={() => {
              setActiveTab("overlay");
              setError(null);
            }}
            className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition ${
              activeTab === "overlay"
                ? "border-sky-500 text-sky-400 font-semibold"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Type className="w-3.5 h-3.5" /> Text & Shape Overlays
          </button>
          <button
            onClick={() => {
              setActiveTab("native");
              setError(null);
            }}
            className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition ${
              activeTab === "native"
                ? "border-sky-500 text-sky-400 font-semibold"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" /> Native Text Stream Edit
          </button>
        </div>

        {/* Body content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-red-950/50 border border-red-800 rounded-lg text-red-300">
              {error}
            </div>
          )}

          {/* TAB 1: OVERLAY ANNOTATIONS */}
          {activeTab === "overlay" && (
            <div className="space-y-4">
              {/* Text Overlay Section */}
              <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="incText"
                      checked={includeText}
                      onChange={(e) => setIncludeText(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-sky-600 focus:ring-sky-500"
                    />
                    <label htmlFor="incText" className="font-semibold text-slate-200 select-none cursor-pointer">
                      Add Styled Text Overlay
                    </label>
                  </div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">
                    Overlay Layer
                  </span>
                </div>

                {includeText && (
                  <div className="space-y-2.5 pt-1">
                    <div>
                      <label className="block text-slate-400 text-[11px] mb-1">Text Content</label>
                      <input
                        type="text"
                        value={textVal}
                        onChange={(e) => setTextVal(e.target.value)}
                        placeholder="Type text to overlay..."
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500 font-mono text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <label className="block text-slate-400 text-[10px] mb-1">X Position (pt)</label>
                        <input
                          type="number"
                          value={textX}
                          onChange={(e) => setTextX(parseFloat(e.target.value) || 0)}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 text-[10px] mb-1">Y Position (pt)</label>
                        <input
                          type="number"
                          value={textY}
                          onChange={(e) => setTextY(parseFloat(e.target.value) || 0)}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 text-[10px] mb-1">Font Family</label>
                        <select
                          value={fontName}
                          onChange={(e) => setFontName(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs"
                        >
                          <option value="Helvetica">Helvetica</option>
                          <option value="Times-Roman">Times New Roman</option>
                          <option value="Courier">Courier Monospace</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-slate-400 text-[10px] mb-1">Size (pt)</label>
                        <select
                          value={fontSize}
                          onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs"
                        >
                          <option value="10">10 pt</option>
                          <option value="12">12 pt</option>
                          <option value="14">14 pt</option>
                          <option value="18">18 pt</option>
                          <option value="24">24 pt</option>
                          <option value="36">36 pt</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <label className="block text-slate-400 text-[10px] mb-1">Text Color</label>
                        <div className="flex items-center gap-1.5">
                          {["#000000", "#0284c7", "#dc2626", "#16a34a", "#d97706", "#ffffff"].map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setTextColor(c)}
                              className={`w-5 h-5 rounded-full border transition ${
                                textColor === c ? "ring-2 ring-sky-400 scale-110" : "border-slate-700"
                              }`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-slate-400 text-[10px] mb-1">Clickable Link URL (Optional)</label>
                        <input
                          type="url"
                          placeholder="https://example.com"
                          value={linkUrl}
                          onChange={(e) => setLinkUrl(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Shape / Highlight Section */}
              <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="incShape"
                      checked={includeShape}
                      onChange={(e) => setIncludeShape(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-sky-600 focus:ring-sky-500"
                    />
                    <label htmlFor="incShape" className="font-semibold text-slate-200 select-none cursor-pointer">
                      Add Vector Highlight / Shape
                    </label>
                  </div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">
                    Vector Shape
                  </span>
                </div>

                {includeShape && (
                  <div className="space-y-2.5 pt-1">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-slate-400 text-[10px] mb-1">Shape Type</label>
                        <select
                          value={shapeType}
                          onChange={(e) => setShapeType(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs"
                        >
                          <option value="highlight">Highlight Box (Semi-transparent)</option>
                          <option value="rect">Rectangle Frame</option>
                          <option value="line">Horizontal Line</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-slate-400 text-[10px] mb-1">
                          Highlight Color & Opacity ({Math.round(shapeOpacity * 100)}%)
                        </label>
                        <div className="flex items-center gap-2 pt-1">
                          <div className="flex items-center gap-1.5">
                            {["#fde047", "#86efac", "#93c5fd", "#fca5a5", "#c084fc"].map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setShapeColor(c)}
                                className={`w-5 h-5 rounded-full border transition ${
                                  shapeColor === c ? "ring-2 ring-sky-400 scale-110" : "border-slate-700"
                                }`}
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                          <input
                            type="range"
                            min="0.1"
                            max="1.0"
                            step="0.05"
                            value={shapeOpacity}
                            onChange={(e) => setShapeOpacity(parseFloat(e.target.value))}
                            className="w-20 accent-sky-500"
                            title="Opacity"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <label className="block text-slate-400 text-[10px] mb-1">X (pt)</label>
                        <input
                          type="number"
                          value={shapeX}
                          onChange={(e) => setShapeX(parseFloat(e.target.value) || 0)}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 text-[10px] mb-1">Y (pt)</label>
                        <input
                          type="number"
                          value={shapeY}
                          onChange={(e) => setShapeY(parseFloat(e.target.value) || 0)}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 text-[10px] mb-1">Width (pt)</label>
                        <input
                          type="number"
                          value={shapeWidth}
                          onChange={(e) => setShapeWidth(parseFloat(e.target.value) || 0)}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 text-[10px] mb-1">Height (pt)</label>
                        <input
                          type="number"
                          value={shapeHeight}
                          onChange={(e) => setShapeHeight(parseFloat(e.target.value) || 0)}
                          className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: NATIVE TEXT STREAM EDIT */}
          {activeTab === "native" && (
            <div className="space-y-4">
              {/* Mandatory Architecture & Technology Disclaimer */}
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-200 flex items-start gap-2.5 text-xs">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-amber-300">
                    Engine Boundary: Native Text Stream Modification
                  </p>
                  <p className="text-[11px] text-amber-200/80 leading-relaxed">
                    This tool searches and edits the decompressed bytecode stream of Page {currentPage} directly.
                    If the source PDF embeds a custom subset font without glyph mappings for new characters, the stream cannot render missing characters. In those cases, use <strong>Text Overlays</strong> instead.
                  </p>
                </div>
              </div>

              <div className="space-y-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Exact Target Text to Replace
                  </label>
                  <input
                    type="text"
                    value={targetText}
                    onChange={(e) => setTargetText(e.target.value)}
                    placeholder="Enter exact string in existing PDF text..."
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-sky-500 font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Replacement Text
                  </label>
                  <input
                    type="text"
                    value={replacementText}
                    onChange={(e) => setReplacementText(e.target.value)}
                    placeholder="Enter new replacement text..."
                    className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-sky-500 font-mono text-xs"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-end gap-3 bg-slate-900/90">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-slate-400 hover:text-slate-200 text-xs font-medium hover:bg-slate-800 transition"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (activeTab === "overlay") handleApplyOverlay();
              else handleApplyNativeEdit();
            }}
            disabled={isSubmitting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium shadow-md shadow-sky-600/20 transition disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing...
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>
                  {activeTab === "overlay" ? "Apply Overlay Annotations" : "Replace Native Text"}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

