import React, { useState } from "react";
import { X, Layers, ArrowUp, ArrowDown, Check, Loader2, FileText } from "lucide-react";
import { Document } from "../types";
import { mergeDocuments } from "../services/api";

interface MergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableDocuments: Document[];
  onMergeSuccess: (newDocumentId: string) => void;
}

export const MergeModal: React.FC<MergeModalProps> = ({
  isOpen,
  onClose,
  availableDocuments,
  onMergeSuccess,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mergedTitle, setMergedTitle] = useState("Merged_Document.pdf");
  const [isMerging, setIsMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds((prev) => prev.filter((item) => item !== id));
    } else {
      setSelectedIds((prev) => [...prev, id]);
    }
  };

  const moveUp = (index: number) => {
    if (index <= 0) return;
    const next = [...selectedIds];
    const temp = next[index];
    next[index] = next[index - 1];
    next[index - 1] = temp;
    setSelectedIds(next);
  };

  const moveDown = (index: number) => {
    if (index >= selectedIds.length - 1) return;
    const next = [...selectedIds];
    const temp = next[index];
    next[index] = next[index + 1];
    next[index + 1] = temp;
    setSelectedIds(next);
  };

  const handleMerge = async () => {
    if (selectedIds.length < 2) {
      setError("Please select at least 2 documents to merge.");
      return;
    }
    setError(null);
    setIsMerging(true);
    try {
      const res = await mergeDocuments(selectedIds, mergedTitle.trim() || "Merged_Document.pdf");
      onMergeSuccess(res.document.id);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to merge documents");
    } finally {
      setIsMerging(false);
    }
  };

  const selectedDocs = selectedIds
    .map((id) => availableDocuments.find((d) => d.id === id))
    .filter(Boolean) as Document[];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-100 text-sm">Merge Local Documents</h2>
              <p className="text-[11px] text-slate-400">Combine multiple PDFs into a single new document</p>
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
            <div className="p-3 bg-red-950/50 border border-red-800 rounded-lg text-red-300">
              {error}
            </div>
          )}

          <div>
            <label className="block text-slate-300 font-medium mb-1">Merged Document Title</label>
            <input
              type="text"
              value={mergedTitle}
              onChange={(e) => setMergedTitle(e.target.value)}
              placeholder="Merged_Document.pdf"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-sky-500 font-mono text-xs"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-2">
              Select Documents to Merge (Select 2 or more)
            </label>
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {availableDocuments.map((doc) => {
                const isSelected = selectedIds.includes(doc.id);
                return (
                  <div
                    key={doc.id}
                    onClick={() => toggleSelect(doc.id)}
                    className={`p-2.5 rounded-lg border transition flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? "bg-sky-950/40 border-sky-500/60 text-slate-100"
                        : "bg-slate-950/50 border-slate-800/80 text-slate-400 hover:border-slate-700"
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
                      <span className="font-medium truncate">{doc.title}</span>
                    </div>
                    <span className="text-[11px] text-slate-500 shrink-0">
                      {doc.page_count} {doc.page_count === 1 ? "page" : "pages"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Merge Order Preview */}
          {selectedDocs.length > 0 && (
            <div>
              <label className="block text-slate-300 font-medium mb-1.5">
                Merge Sequence (Order {selectedDocs.length} parts)
              </label>
              <div className="space-y-1.5 bg-slate-950/60 border border-slate-800 rounded-xl p-2.5">
                {selectedDocs.map((doc, idx) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-2 rounded bg-slate-900/90 border border-slate-800 text-[11px]"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-mono text-sky-400 font-bold w-4">{idx + 1}.</span>
                      <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="text-slate-200 truncate">{doc.title}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => moveUp(idx)}
                        disabled={idx === 0}
                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30"
                        title="Move Up"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => moveDown(idx)}
                        disabled={idx === selectedDocs.length - 1}
                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30"
                        title="Move Down"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
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
            onClick={handleMerge}
            disabled={isMerging || selectedIds.length < 2}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium shadow-md shadow-sky-600/20 transition disabled:opacity-50"
          >
            {isMerging ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Merging Documents...
              </>
            ) : (
              <>
                <Layers className="w-3.5 h-3.5" /> Merge {selectedIds.length} PDFs
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
