import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  FileCheck2,
  CheckSquare,
  Loader2,
  AlertCircle,
  Plus,
  Flame,
  ShieldCheck,
  Check,
} from "lucide-react";
import { DocumentFormsInspection } from "../types";
import {
  inspectDocumentForms,
  fillDocumentForms,
  flattenDocumentForms,
  addDocumentFormField,
} from "../services/api";

interface FormEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  currentPage: number;
  totalPages: number;
  onFormSuccess: (message: string) => void;
}

export const FormEditorModal: React.FC<FormEditorModalProps> = ({
  isOpen,
  onClose,
  documentId,
  currentPage,
  totalPages,
  onFormSuccess,
}) => {
  const [inspection, setInspection] = useState<DocumentFormsInspection | null>(null);
  const [loading, setLoading] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [activeTab, setActiveTab] = useState<"fill" | "add">("fill");
  const [isSaving, setIsSaving] = useState(false);
  const [isFlattening, setIsFlattening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add field form state
  const [newFieldName, setNewFieldName] = useState<string>("");
  const [newFieldType, setNewFieldType] = useState<"text" | "checkbox" | "combobox">("text");
  const [newFieldPage, setNewFieldPage] = useState<number>(currentPage - 1);
  const [newFieldX0, setNewFieldX0] = useState<number>(50);
  const [newFieldY0, setNewFieldY0] = useState<number>(100);
  const [newFieldX1, setNewFieldX1] = useState<number>(250);
  const [newFieldY1, setNewFieldY1] = useState<number>(125);
  const [newFieldDefault, setNewFieldDefault] = useState<string>("");
  const [newFieldOptions, setNewFieldOptions] = useState<string>("Option 1, Option 2, Option 3");
  const [newFieldReadOnly, setNewFieldReadOnly] = useState<boolean>(false);
  const [newFieldFontSize, setNewFieldFontSize] = useState<number>(11);
  const [isAddingField, setIsAddingField] = useState<boolean>(false);

  // Load form inspection
  const loadInspection = useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await inspectDocumentForms(documentId);
      setInspection(data);

      // Populate form values
      const initialVals: Record<string, any> = {};
      for (const f of data.fields) {
        if (f.field_type === "checkbox") {
          initialVals[f.name] =
            typeof f.value === "boolean"
              ? f.value
              : String(f.value).toLowerCase() === "yes" || String(f.value).toLowerCase() === "true";
        } else {
          initialVals[f.name] = f.value ?? "";
        }
      }
      setFormValues(initialVals);
    } catch (err: any) {
      setError(err.message || "Failed to inspect document forms");
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (isOpen) {
      loadInspection();
      setNewFieldPage(currentPage - 1);
      setError(null);
    }
  }, [isOpen, loadInspection, currentPage]);

  const handleValueChange = (fieldName: string, val: any) => {
    setFormValues((prev) => ({ ...prev, [fieldName]: val }));
  };

  // Submit fill form values
  const handleSaveFormValues = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fillDocumentForms(documentId, {
        values: formValues,
        flatten: false,
      });
      onFormSuccess(`Updated form values (Child rev ${res.revision.id.slice(0, 8)})`);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save form values");
    } finally {
      setIsSaving(false);
    }
  };

  // Flatten forms
  const handleFlattenForms = async () => {
    if (
      !confirm(
        "Flattening burns all interactive form fields into permanent static page content. Interactive inputs will be removed. Proceed?"
      )
    ) {
      return;
    }

    setIsFlattening(true);
    setError(null);
    try {
      const res = await flattenDocumentForms(documentId);
      onFormSuccess(`Flattened form fields into static content (Child rev ${res.revision.id.slice(0, 8)})`);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to flatten form fields");
    } finally {
      setIsFlattening(false);
    }
  };

  // Add new form field
  const handleAddNewField = async () => {
    if (!newFieldName.trim()) {
      setError("Field name cannot be empty.");
      return;
    }
    if (newFieldX1 <= newFieldX0 || newFieldY1 <= newFieldY0) {
      setError("Bounding box dimensions must be positive (X1 > X0, Y1 > Y0).");
      return;
    }

    setIsAddingField(true);
    setError(null);
    try {
      const opts =
        newFieldType === "combobox"
          ? newFieldOptions
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : [];

      const res = await addDocumentFormField(documentId, {
        page_index: newFieldPage,
        field_name: newFieldName.trim(),
        field_type: newFieldType,
        rect: [newFieldX0, newFieldY0, newFieldX1, newFieldY1],
        default_value: newFieldDefault.trim() || undefined,
        options: opts,
        read_only: newFieldReadOnly,
        font_size: newFieldFontSize,
      });

      onFormSuccess(
        `Added new ${newFieldType} field "${newFieldName}" to Page ${newFieldPage + 1} (Child rev ${res.revision.id.slice(
          0,
          8
        )})`
      );
      setNewFieldName("");
      await loadInspection();
      setActiveTab("fill");
    } catch (err: any) {
      setError(err.message || "Failed to add form field");
    } finally {
      setIsAddingField(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Top Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center">
              <FileCheck2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-100 text-sm">Interactive PDF Forms (AcroForms)</h2>
              <p className="text-[11px] text-slate-400">
                Page {currentPage} of {totalPages} • Inspect, Fill, Flatten & Add Fillable Fields
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
            type="button"
            onClick={() => setActiveTab("fill")}
            className={`pb-2 px-3 border-b-2 font-medium flex items-center gap-1.5 transition ${
              activeTab === "fill"
                ? "border-teal-500 text-teal-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>Fill Form Fields ({inspection?.total_fields || 0})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("add")}
            className={`pb-2 px-3 border-b-2 font-medium flex items-center gap-1.5 transition ${
              activeTab === "add"
                ? "border-teal-500 text-teal-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Form Field</span>
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

          {/* Form Status Card */}
          <div className="p-3 bg-slate-950/50 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  inspection?.has_form ? "bg-emerald-400 animate-pulse" : "bg-slate-600"
                }`}
              />
              <span className="text-slate-300 font-medium">
                {loading
                  ? "Inspecting document AcroForm dictionary..."
                  : inspection?.has_form
                  ? `Interactive AcroForm Detected (${inspection.total_fields} fillable fields)`
                  : "No interactive AcroForm fields in this document."}
              </span>
            </div>

            {inspection && inspection.total_fields > 0 && (
              <button
                type="button"
                onClick={handleFlattenForms}
                disabled={isFlattening}
                className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-[11px] font-medium flex items-center gap-1 transition disabled:opacity-50"
                title="Bake all interactive widgets into permanent vector text"
              >
                {isFlattening ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Flame className="w-3 h-3 text-amber-400" />
                )}
                <span>Flatten Form</span>
              </button>
            )}
          </div>

          {/* TAB 1: Fill Existing Form Fields */}
          {activeTab === "fill" && (
            <>
              {loading ? (
                <div className="py-12 flex justify-center items-center text-slate-500 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-teal-400" />
                  <span>Loading form fields...</span>
                </div>
              ) : !inspection || inspection.total_fields === 0 ? (
                <div className="p-8 text-center rounded-xl border border-slate-800/80 bg-slate-950/40 space-y-3">
                  <FileCheck2 className="w-10 h-10 text-slate-600 mx-auto opacity-60" />
                  <div>
                    <h3 className="font-semibold text-slate-200 text-sm">No Fillable Form Fields</h3>
                    <p className="text-[11px] text-slate-400 max-w-sm mx-auto mt-1">
                      This document doesn't contain interactive AcroForm fields. You can add new fillable text fields,
                      checkboxes, or dropdowns using the "Add Form Field" tab above.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("add")}
                    className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add First Form Field</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2.5">
                    {inspection.fields.map((field) => (
                      <div
                        key={field.name}
                        className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-200">{field.name}</span>
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-teal-400 capitalize">
                              {field.field_type}
                            </span>
                            {field.read_only && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[10px] font-mono">
                                Read-Only
                              </span>
                            )}
                          </div>
                          <span className="text-slate-500 font-mono text-[10px]">
                            Page {field.page_index + 1} • ({Math.round(field.rect[0])}, {Math.round(field.rect[1])})
                          </span>
                        </div>

                        {/* Interactive Input based on field type */}
                        {field.field_type === "checkbox" ? (
                          <label className="flex items-center gap-2 cursor-pointer pt-1 text-slate-300 hover:text-white">
                            <input
                              type="checkbox"
                              checked={!!formValues[field.name]}
                              disabled={field.read_only}
                              onChange={(e) => handleValueChange(field.name, e.target.checked)}
                              className="rounded border-slate-700 bg-slate-900 text-teal-500 focus:ring-teal-500 w-4 h-4"
                            />
                            <span className="text-xs">
                              {formValues[field.name] ? "Checked (Yes)" : "Unchecked (Off)"}
                            </span>
                          </label>
                        ) : field.field_type === "combobox" && field.options.length > 0 ? (
                          <select
                            value={formValues[field.name] ?? ""}
                            disabled={field.read_only}
                            onChange={(e) => handleValueChange(field.name, e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:border-teal-500 focus:outline-none"
                          >
                            <option value="">-- Select an option --</option>
                            {field.options.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={formValues[field.name] ?? ""}
                            disabled={field.read_only}
                            onChange={(e) => handleValueChange(field.name, e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:border-teal-500 focus:outline-none"
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveFormValues}
                    disabled={isSaving}
                    className="w-full py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-teal-600/20 transition disabled:opacity-50 mt-2"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Saving Form Values (Creating Child Revision)...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Save & Update Form Values</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          )}

          {/* TAB 2: Add New Form Field */}
          {activeTab === "add" && (
            <div className="space-y-3.5">
              <div className="p-3 bg-slate-950/70 border border-teal-900/60 rounded-xl flex items-start gap-2.5 text-slate-300">
                <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <span className="font-semibold text-teal-300">Interactive Form Field Placement: </span>
                  Injects an interactive AcroForm widget into the document at the target coordinates.
                  The generated field is fillable in standard PDF viewers, PDF.js, and web browsers.
                </div>
              </div>

              <div className="space-y-3 bg-slate-950/40 p-3.5 rounded-xl border border-slate-800">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold text-[11px] mb-1">
                      Field Identifier Name
                    </label>
                    <input
                      type="text"
                      value={newFieldName}
                      onChange={(e) => setNewFieldName(e.target.value)}
                      placeholder="e.g. employee_signature"
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:border-teal-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold text-[11px] mb-1">Field Type</label>
                    <select
                      value={newFieldType}
                      onChange={(e) => setNewFieldType(e.target.value as any)}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-mono text-xs"
                    >
                      <option value="text">Text Field (Single/Multi-line)</option>
                      <option value="checkbox">Checkbox (Boolean)</option>
                      <option value="combobox">Combobox / Dropdown Choice</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 text-[10px] mb-1">Target Page</label>
                    <select
                      value={newFieldPage}
                      onChange={(e) => setNewFieldPage(parseInt(e.target.value, 10))}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-mono text-xs"
                    >
                      {Array.from({ length: totalPages }).map((_, i) => (
                        <option key={i} value={i}>
                          Page {i + 1}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 text-[10px] mb-1">Initial / Default Value</label>
                    <input
                      type="text"
                      value={newFieldDefault}
                      onChange={(e) => setNewFieldDefault(e.target.value)}
                      placeholder="Optional default..."
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-mono text-xs"
                    />
                  </div>
                </div>

                {newFieldType === "combobox" && (
                  <div>
                    <label className="block text-slate-400 text-[10px] mb-1">
                      Dropdown Options (Comma separated)
                    </label>
                    <input
                      type="text"
                      value={newFieldOptions}
                      onChange={(e) => setNewFieldOptions(e.target.value)}
                      placeholder="e.g. Option 1, Option 2, Option 3"
                      className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 font-mono text-xs"
                    />
                  </div>
                )}

                {/* Bounding Box Coordinates */}
                <div>
                  <label className="block text-slate-400 text-[10px] mb-1">
                    Widget Bounding Box Coordinates (PDF Points)
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <span className="text-[9px] text-slate-500 block">X0 (Left)</span>
                      <input
                        type="number"
                        value={newFieldX0}
                        onChange={(e) => setNewFieldX0(parseFloat(e.target.value) || 0)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs"
                      />
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 block">Y0 (Bottom/Top)</span>
                      <input
                        type="number"
                        value={newFieldY0}
                        onChange={(e) => setNewFieldY0(parseFloat(e.target.value) || 0)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs"
                      />
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 block">X1 (Right)</span>
                      <input
                        type="number"
                        value={newFieldX1}
                        onChange={(e) => setNewFieldX1(parseFloat(e.target.value) || 0)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs"
                      />
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-500 block">Y1 (Top/Bottom)</span>
                      <input
                        type="number"
                        value={newFieldY1}
                        onChange={(e) => setNewFieldY1(parseFloat(e.target.value) || 0)}
                        className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 font-mono text-xs"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                      <input
                        type="checkbox"
                        checked={newFieldReadOnly}
                        onChange={(e) => setNewFieldReadOnly(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-900 text-teal-500"
                      />
                      <span className="text-[11px]">Mark as Read-Only</span>
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400">Font size:</span>
                    <input
                      type="number"
                      min="6"
                      max="72"
                      value={newFieldFontSize}
                      onChange={(e) => setNewFieldFontSize(parseFloat(e.target.value) || 11)}
                      className="w-14 bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-slate-200 font-mono text-xs"
                    />
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAddNewField}
                disabled={isAddingField}
                className="w-full py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-teal-600/20 transition disabled:opacity-50 text-xs"
              >
                {isAddingField ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Adding Field (Creating Child Revision)...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>Add Interactive Form Field to Document</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-900/90">
          <span className="text-[10px] text-slate-500 font-mono">
            Engine: PyMuPDF AcroForm Engine • ISO 32000-1 Form Dictionary • 100% Offline
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
