import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  FileText,
  ArrowLeft,
  Loader2,
  Sparkles,
  Download,
  RefreshCw,
  AlertCircle,
  Layout,
  Tag,
  Sliders,
  Check,
} from "lucide-react";
import { PdfTemplate, TemplateSummary } from "../types";
import {
  fetchTemplates,
  fetchTemplateDetail,
  renderTemplateToDocument,
  previewTemplatePdfUrl,
} from "../services/api";

interface TemplateStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDocumentCreated: (documentId: string, message: string) => void;
}

export const TemplateStudioModal: React.FC<TemplateStudioModalProps> = ({
  isOpen,
  onClose,
  onDocumentCreated,
}) => {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [currentTemplate, setCurrentTemplate] = useState<PdfTemplate | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [customTitle, setCustomTitle] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"form" | "elements">("form");

  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load template gallery
  const loadTemplates = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const data = await fetchTemplates();
      setTemplates(data);
    } catch (err: any) {
      setError(err.message || "Failed to load templates");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
      setSelectedTemplateId(null);
      setCurrentTemplate(null);
      setPreviewUrl(null);
      setVariableValues({});
      setCustomTitle("");
      setError(null);
    }
  }, [isOpen, loadTemplates]);

  // Load selected template details
  const handleSelectTemplate = async (id: string) => {
    setSelectedTemplateId(id);
    setLoadingDetail(true);
    setError(null);
    try {
      const tpl = await fetchTemplateDetail(id);
      setCurrentTemplate(tpl);
      setCustomTitle(`${tpl.name}.pdf`);

      // Initialize default values
      const initialVars: Record<string, string> = {};
      for (const v of tpl.variables) {
        initialVars[v.key] = v.default_value;
      }
      setVariableValues(initialVars);

      // Generate initial preview
      refreshPreview(id, initialVars);
    } catch (err: any) {
      setError(err.message || "Failed to load template details");
    } finally {
      setLoadingDetail(false);
    }
  };

  // Generate live PDF preview
  const refreshPreview = async (templateId: string, vars: Record<string, string>) => {
    setLoadingPreview(true);
    try {
      const url = await previewTemplatePdfUrl({
        template_id: templateId,
        variables: vars,
      });
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
    } catch (err: any) {
      console.error("Preview generation error:", err);
    } finally {
      setLoadingPreview(false);
    }
  };

  // Handle variable change with debounce
  const handleVariableChange = (key: string, value: string) => {
    const updated = { ...variableValues, [key]: value };
    setVariableValues(updated);

    if (selectedTemplateId) {
      if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);
      previewTimeoutRef.current = setTimeout(() => {
        refreshPreview(selectedTemplateId, updated);
      }, 500);
    }
  };

  // Render to local catalog
  const handleCreateDocument = async () => {
    if (!selectedTemplateId || !currentTemplate) return;
    setIsRendering(true);
    setError(null);
    try {
      const res = await renderTemplateToDocument(selectedTemplateId, {
        variables: variableValues,
        title: customTitle.trim() || `${currentTemplate.name}.pdf`,
      });
      onDocumentCreated(
        res.document.id,
        `Created document "${res.document.title}" from template "${currentTemplate.name}"!`
      );
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to render document from template");
    } finally {
      setIsRendering(false);
    }
  };

  const categories = ["all", "invoice", "certificate", "resume", "letterhead", "custom"];
  const filteredTemplates = templates.filter(
    (t) => selectedCategory === "all" || t.category.toLowerCase() === selectedCategory.toLowerCase()
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col h-[90vh]">
        {/* Top Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            {selectedTemplateId && (
              <button
                type="button"
                onClick={() => {
                  setSelectedTemplateId(null);
                  setCurrentTemplate(null);
                  if (previewUrl) URL.revokeObjectURL(previewUrl);
                  setPreviewUrl(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition mr-1"
                title="Back to Template Gallery"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Layout className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-100 text-sm">
                {currentTemplate ? currentTemplate.name : "Local PDF Template Studio"}
              </h2>
              <p className="text-[11px] text-slate-400">
                {currentTemplate
                  ? `${currentTemplate.page_size} • ${currentTemplate.orientation} • ${currentTemplate.variables.length} Dynamic Variables`
                  : "Synthesize high-fidelity vector PDF documents from customizable templates"}
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

        {/* Global Error Banner */}
        {error && (
          <div className="mx-4 mt-3 p-3 bg-red-950/40 border border-red-900 rounded-xl flex items-start gap-2.5 text-red-300 text-xs">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* VIEW 1: Template Selection Gallery */}
        {!selectedTemplateId && (
          <div className="flex-1 overflow-y-auto p-5 flex flex-col">
            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 mb-5 flex-wrap">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium capitalize transition ${
                    selectedCategory === cat
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                      : "bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                  }`}
                >
                  {cat === "all" ? "All Templates" : cat}
                </button>
              ))}
            </div>

            {loadingList ? (
              <div className="flex-1 flex items-center justify-center text-slate-400 gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                <span className="text-xs">Loading local templates...</span>
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 py-12">
                <FileText className="w-10 h-10 mb-2 opacity-50" />
                <p className="text-xs font-medium">No templates found in this category.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredTemplates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="p-4 bg-slate-950/60 border border-slate-800 hover:border-indigo-500/60 rounded-2xl flex flex-col justify-between transition-all group shadow-sm hover:shadow-indigo-500/10"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 font-mono text-[10px] capitalize font-medium">
                          {tpl.category}
                        </span>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 font-mono">
                            {tpl.page_size}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 font-mono capitalize">
                            {tpl.orientation}
                          </span>
                        </div>
                      </div>

                      <h3 className="font-semibold text-slate-100 text-sm group-hover:text-indigo-300 transition">
                        {tpl.name}
                      </h3>
                      <p className="text-slate-400 text-xs mt-1 leading-relaxed line-clamp-2">
                        {tpl.description}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                      <div className="text-[10px] text-slate-500 font-mono flex items-center gap-2">
                        <span>{tpl.element_count} elements</span>
                        <span>•</span>
                        <span>{tpl.variable_count} fields</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSelectTemplate(tpl.id)}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Use Template</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Loading detail indicator */}
        {loadingDetail && (
          <div className="flex-1 flex items-center justify-center text-slate-400 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
            <span className="text-xs">Loading template schema & design...</span>
          </div>
        )}

        {/* VIEW 2: Template Customizer & Live Preview Studio */}
        {!loadingDetail && selectedTemplateId && currentTemplate && (
          <div className="flex-1 flex overflow-hidden">
            {/* Left Panel: Variable Form & Properties */}
            <div className="w-1/2 border-r border-slate-800 flex flex-col h-full bg-slate-900/60">
              {/* Studio Tabs */}
              <div className="flex border-b border-slate-800 px-4 pt-2 gap-2 text-xs bg-slate-950/40">
                <button
                  type="button"
                  onClick={() => setActiveTab("form")}
                  className={`pb-2 px-3 border-b-2 font-medium flex items-center gap-1.5 transition ${
                    activeTab === "form"
                      ? "border-indigo-500 text-indigo-400"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Fill Template Variables</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("elements")}
                  className={`pb-2 px-3 border-b-2 font-medium flex items-center gap-1.5 transition ${
                    activeTab === "elements"
                      ? "border-indigo-500 text-indigo-400"
                      : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>Elements ({currentTemplate.elements.length})</span>
                </button>
              </div>

              {/* Tab 1: Fill Variables Form */}
              {activeTab === "form" && (
                <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-slate-400 text-[11px] leading-relaxed">
                    Editing fields below will instantly re-render the vector preview in real-time.
                  </div>

                  {currentTemplate.variables.map((v) => (
                    <div key={v.key} className="space-y-1">
                      <label className="block text-slate-300 font-medium text-[11px]">
                        {v.label}
                        <span className="text-slate-500 font-mono text-[9px] ml-1.5">
                          {"{{"}
                          {v.key}
                          {"}}"}
                        </span>
                      </label>
                      {v.default_value.length > 50 || v.key.includes("desc") || v.key.includes("body") || v.key.includes("summary") ? (
                        <textarea
                          rows={3}
                          value={variableValues[v.key] ?? ""}
                          onChange={(e) => handleVariableChange(v.key, e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono text-xs focus:border-indigo-500 focus:outline-none"
                        />
                      ) : (
                        <input
                          type="text"
                          value={variableValues[v.key] ?? ""}
                          onChange={(e) => handleVariableChange(v.key, e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono text-xs focus:border-indigo-500 focus:outline-none"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Tab 2: Elements Schema Overview */}
              {activeTab === "elements" && (
                <div className="flex-1 overflow-y-auto p-4 space-y-2 text-xs">
                  {currentTemplate.elements.map((elem, idx) => (
                    <div
                      key={elem.id || idx}
                      className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-slate-200 capitalize flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-indigo-500" />
                          {elem.type}
                        </span>
                        <span className="text-slate-500 font-mono text-[10px]">
                          x:{Math.round(elem.x)}, y:{Math.round(elem.y)}, w:{Math.round(elem.width)}, h:{Math.round(elem.height)}
                        </span>
                      </div>
                      {elem.text && (
                        <p className="text-slate-400 text-[10px] font-mono truncate">{elem.text}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right Panel: Live PDF Preview & Document Export */}
            <div className="w-1/2 flex flex-col h-full bg-slate-950/90">
              {/* Preview Bar */}
              <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-200">Live Vector Preview</span>
                  {loadingPreview && <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => refreshPreview(selectedTemplateId, variableValues)}
                    disabled={loadingPreview}
                    className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition"
                    title="Refresh Preview"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>

                  {previewUrl && (
                    <a
                      href={previewUrl}
                      download={customTitle || `${currentTemplate.name}.pdf`}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium flex items-center gap-1 transition"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Iframe Preview Container */}
              <div className="flex-1 p-3 bg-slate-950/80 overflow-hidden flex items-center justify-center relative">
                {previewUrl ? (
                  <iframe
                    src={`${previewUrl}#toolbar=0&navpanes=0`}
                    title="Template Preview"
                    className="w-full h-full rounded-xl border border-slate-800 shadow-inner bg-white"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-slate-500 gap-2">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                    <span className="text-xs">Generating vector preview...</span>
                  </div>
                )}
              </div>

              {/* Bottom Catalog Action Bar */}
              <div className="p-4 border-t border-slate-800 bg-slate-900/90 space-y-3">
                <div>
                  <label className="block text-slate-400 text-[10px] mb-1">Document Title in Catalog</label>
                  <input
                    type="text"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="Enter document title..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 text-xs font-mono"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleCreateDocument}
                  disabled={isRendering}
                  className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition disabled:opacity-50 text-xs"
                >
                  {isRendering ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Synthesizing Document (Saving to Catalog)...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Create Document & Open in Editor</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
