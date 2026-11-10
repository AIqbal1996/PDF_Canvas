import React, { useState } from "react";
import {
  X,
  Download,
  Image as ImageIcon,
  Archive,
  Layers,
} from "lucide-react";
import { getRenderPageImageUrl, getExportImagesZipUrl } from "../services/api";

interface ExportImagesModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  documentTitle: string;
  currentPage: number;
  totalPages: number;
}

export const ExportImagesModal: React.FC<ExportImagesModalProps> = ({
  isOpen,
  onClose,
  documentId,
  documentTitle,
  currentPage,
  totalPages,
}) => {
  const [exportScope, setExportScope] = useState<"current" | "all">("all");
  const [format, setFormat] = useState<"PNG" | "JPEG">("PNG");
  const [scale, setScale] = useState<number>(2.0); // 2.0 = 150 DPI approx, 4.0 = 300 DPI

  if (!isOpen) return null;

  const handleDownload = () => {
    let url = "";
    if (exportScope === "current") {
      url = getRenderPageImageUrl(documentId, currentPage - 1, scale, format);
    } else {
      url = getExportImagesZipUrl(documentId, scale, format);
    }

    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center">
              <ImageIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-100 text-sm">Export PDF to Images</h2>
              <p className="text-[11px] text-slate-400 truncate max-w-xs">
                Export {documentTitle} to high-resolution PNG or JPEG
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

        {/* Body */}
        <div className="p-4 space-y-4 text-xs">
          {/* Export Scope */}
          <div>
            <label className="block text-slate-400 text-[10px] uppercase tracking-wider font-mono mb-1.5">
              Scope
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setExportScope("current")}
                className={`p-2.5 rounded-xl border text-left transition flex items-center gap-2 ${
                  exportScope === "current"
                    ? "bg-sky-500/10 border-sky-500 text-sky-300"
                    : "bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                <Layers className="w-4 h-4 shrink-0" />
                <div>
                  <div className="font-semibold text-xs">Current Page</div>
                  <div className="text-[10px] opacity-70">Page {currentPage} of {totalPages}</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setExportScope("all")}
                className={`p-2.5 rounded-xl border text-left transition flex items-center gap-2 ${
                  exportScope === "all"
                    ? "bg-sky-500/10 border-sky-500 text-sky-300"
                    : "bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                <Archive className="w-4 h-4 shrink-0" />
                <div>
                  <div className="font-semibold text-xs">All Pages (ZIP)</div>
                  <div className="text-[10px] opacity-70">{totalPages} pages packaged</div>
                </div>
              </button>
            </div>
          </div>

          {/* Format & Resolution */}
          <div className="grid grid-cols-2 gap-3 bg-slate-950/40 p-3 rounded-xl border border-slate-800">
            <div>
              <label className="block text-slate-400 text-[10px] mb-1">Image Format</label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as "PNG" | "JPEG")}
                className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs"
              >
                <option value="PNG">PNG (Lossless)</option>
                <option value="JPEG">JPEG (Compressed)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 text-[10px] mb-1">Resolution / Quality</label>
              <select
                value={scale}
                onChange={(e) => setScale(parseFloat(e.target.value))}
                className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 text-xs font-mono"
              >
                <option value="1.0">Standard 72 DPI (1x)</option>
                <option value="2.0">Sharp 150 DPI (2x)</option>
                <option value="3.0">Print Quality 216 DPI (3x)</option>
                <option value="4.0">Ultra HD 288 DPI (4x)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-900/90">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 shadow-lg shadow-sky-600/20 transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download {exportScope === "all" ? "ZIP Package" : `${format} Image`}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
