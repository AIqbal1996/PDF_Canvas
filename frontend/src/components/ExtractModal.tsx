import React, { useState } from "react";
import { X, Scissors, Check, Loader2 } from "lucide-react";
import { extractPages } from "../services/api";

interface ExtractModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  documentTitle: string;
  totalPages: number;
  currentPage: number;
  onExtractSuccess: (newDocumentId: string) => void;
}

export const ExtractModal: React.FC<ExtractModalProps> = ({
  isOpen,
  onClose,
  documentId,
  documentTitle,
  totalPages,
  currentPage,
  onExtractSuccess,
}) => {
  const [selectedPages, setSelectedPages] = useState<number[]>([currentPage - 1]);
  const [newTitle, setNewTitle] = useState(
    `Extracted from ${documentTitle.replace(/\.pdf$/i, "")}.pdf`
  );
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const togglePage = (index: number) => {
    if (selectedPages.includes(index)) {
      setSelectedPages((prev) => prev.filter((p) => p !== index));
    } else {
      setSelectedPages((prev) => [...prev, index].sort((a, b) => a - b));
    }
  };

  const selectAll = () => {
    setSelectedPages(Array.from({ length: totalPages }, (_, i) => i));
  };

  const clearSelection = () => {
    setSelectedPages([]);
  };

  const handleExtract = async () => {
    if (selectedPages.length === 0) {
      setError("Please select at least 1 page to extract.");
      return;
    }
    setError(null);
    setIsExtracting(true);
    try {
      const res = await extractPages(documentId, selectedPages, newTitle.trim());
      onExtractSuccess(res.document.id);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to extract pages");
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center">
              <Scissors className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-100 text-sm">Extract Pages</h2>
              <p className="text-[11px] text-slate-400">Save selected pages into a new standalone document</p>
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
            <label className="block text-slate-300 font-medium mb-1">New Document Title</label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-sky-500 font-mono text-xs"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-slate-300 font-medium">
                Select Pages ({selectedPages.length} of {totalPages} selected)
              </label>
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-sky-400 hover:text-sky-300"
                >
                  Select All
                </button>
                <span className="text-slate-600">•</span>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-slate-400 hover:text-slate-300"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-48 overflow-y-auto p-1 bg-slate-950/60 rounded-xl border border-slate-800">
              {Array.from({ length: totalPages }, (_, i) => {
                const isSelected = selectedPages.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => togglePage(i)}
                    className={`p-2 rounded-lg border font-mono font-medium transition flex flex-col items-center justify-center gap-1 ${
                      isSelected
                        ? "bg-sky-500/20 border-sky-500 text-sky-300 shadow-sm shadow-sky-500/20"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <span>P. {i + 1}</span>
                    {isSelected && <Check className="w-3 h-3 text-sky-400" />}
                  </button>
                );
              })}
            </div>
          </div>
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
            onClick={handleExtract}
            disabled={isExtracting || selectedPages.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium shadow-md shadow-sky-600/20 transition disabled:opacity-50"
          >
            {isExtracting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Extracting...
              </>
            ) : (
              <>
                <Scissors className="w-3.5 h-3.5" /> Extract {selectedPages.length} {selectedPages.length === 1 ? "Page" : "Pages"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
