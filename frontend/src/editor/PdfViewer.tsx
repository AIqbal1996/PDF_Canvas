import React, { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Loader2, AlertCircle, Lock, Unlock } from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfViewerProps {
  pdfUrl: string;
  currentPage: number;
  zoomScale: number;
  onDocumentLoaded?: (pdf: pdfjsLib.PDFDocumentProxy) => void;
  onError?: (error: Error) => void;
  onOpenSecurity?: () => void;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  pdfUrl,
  currentPage,
  zoomScale,
  onDocumentLoaded,
  onError,
  onOpenSecurity,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [unlockInput, setUnlockInput] = useState("");

  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const renderGenRef = useRef(0);
  const passwordCallbackRef = useRef<((pw: string) => void) | null>(null);

  // Stabilize parent callbacks so page changes never re-trigger document download/parsing
  const onDocumentLoadedRef = useRef(onDocumentLoaded);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onDocumentLoadedRef.current = onDocumentLoaded;
  }, [onDocumentLoaded]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  // Load PDF document strictly when pdfUrl changes (uses 100% local offline CMaps + byte-range chunks)
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setError(null);
    setNeedsPassword(false);
    setPasswordError(null);
    setUnlockInput("");
    passwordCallbackRef.current = null;

    const loadingTask = pdfjsLib.getDocument({
      url: pdfUrl,
      cMapUrl: "/pdfjs/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/pdfjs/standard_fonts/",
      rangeChunkSize: 262144, // 256 KB byte-range chunks for fast large-PDF streaming
    });

    loadingTask.onPassword = (updatePassword: (pw: string) => void, reason: number) => {
      if (isCancelled) return;
      passwordCallbackRef.current = updatePassword;
      setLoading(false);
      setNeedsPassword(true);
      if (reason === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD) {
        setPasswordError("Incorrect password. Please try again.");
      } else {
        setPasswordError(null);
      }
    };

    loadingTask.promise
      .then((pdf) => {
        if (isCancelled) {
          pdf.destroy();
          return;
        }
        setNeedsPassword(false);
        setPasswordError(null);
        pdfDocRef.current = pdf;
        setLoading(false);
        if (onDocumentLoadedRef.current) {
          onDocumentLoadedRef.current(pdf);
        }
      })
      .catch((err) => {
        if (isCancelled) return;
        console.error("Error loading PDF document:", err);
        setNeedsPassword(false);
        setError(err.message || "Failed to load PDF");
        setLoading(false);
        if (onErrorRef.current) {
          onErrorRef.current(err);
        }
      });

    return () => {
      isCancelled = true;
      renderGenRef.current += 1;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
      loadingTask.destroy().catch(() => {});
      if (pdfDocRef.current) {
        pdfDocRef.current.destroy().catch(() => {});
        pdfDocRef.current = null;
      }
    };
  }, [pdfUrl]);

  const handleSubmitViewerPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordCallbackRef.current || !unlockInput) return;
    setLoading(true);
    setPasswordError(null);
    passwordCallbackRef.current(unlockInput);
  };

  // Render current page when page or scale changes
  const renderPage = useCallback(async () => {
    const doc = pdfDocRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas) return;

    const myGen = ++renderGenRef.current;

    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    try {
      const safePage = Math.max(1, Math.min(currentPage, doc.numPages));
      const page = await doc.getPage(safePage);
      if (myGen !== renderGenRef.current) return;

      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;

      const viewport = page.getViewport({ scale: zoomScale });
      const pixelRatio = window.devicePixelRatio || 1;

      canvas.width = Math.floor(viewport.width * pixelRatio);
      canvas.height = Math.floor(viewport.height * pixelRatio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      ctx.save();
      ctx.scale(pixelRatio, pixelRatio);

      const renderTask = page.render({
        canvasContext: ctx,
        viewport: viewport,
      });
      renderTaskRef.current = renderTask;

      await renderTask.promise;
      if (myGen === renderGenRef.current) {
        ctx.restore();
      }
    } catch (err: any) {
      if (err?.name === "RenderingCancelledException") {
        return;
      }
      if (myGen === renderGenRef.current) {
        console.error("Page render error:", err);
      }
    }
  }, [currentPage, zoomScale]);

  useEffect(() => {
    if (!loading && pdfDocRef.current) {
      renderPage();
    }
  }, [loading, currentPage, zoomScale, renderPage]);

  return (
    <div
      ref={containerRef}
      className="flex-1 h-full overflow-auto bg-slate-950 flex items-center justify-center p-8 relative select-none"
    >
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 z-20">
          <Loader2 className="w-8 h-8 text-sky-400 animate-spin mb-3" />
          <span className="text-slate-300 text-sm font-medium">Loading document...</span>
        </div>
      )}

      {needsPassword && (
        <form
          onSubmit={handleSubmitViewerPassword}
          className="flex flex-col items-center justify-center p-6 bg-slate-900 border border-amber-700/50 rounded-2xl text-center max-w-sm shadow-2xl space-y-3"
        >
          <div className="w-11 h-11 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Password-Protected PDF</h3>
            <p className="text-xs text-slate-400 mt-1">
              Enter the document open password to decrypt and preview this revision in your browser.
            </p>
          </div>
          {passwordError && (
            <div className="text-xs text-red-400 font-medium">{passwordError}</div>
          )}
          <input
            type="password"
            value={unlockInput}
            onChange={(e) => setUnlockInput(e.target.value)}
            placeholder="Enter PDF password..."
            autoFocus
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
          />
          <div className="flex items-center gap-2 w-full">
            <button
              type="submit"
              className="flex-1 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>Unlock Preview</span>
            </button>
            {onOpenSecurity && (
              <button
                type="button"
                onClick={onOpenSecurity}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition"
              >
                Security Tools
              </button>
            )}
          </div>
        </form>
      )}

      {error && !needsPassword && (
        <div className="flex flex-col items-center justify-center p-6 bg-red-950/40 border border-red-900 rounded-xl text-center max-w-md">
          <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
          <h3 className="text-sm font-semibold text-red-200 mb-1">Failed to Render PDF</h3>
          <p className="text-xs text-red-300/80 mb-4">{error}</p>
        </div>
      )}

      {/* Render Canvas with Drop Shadow */}
      <div className={`transition-all duration-200 ${loading || error || needsPassword ? "hidden" : "block"}`}>
        <canvas
          ref={canvasRef}
          className="shadow-2xl rounded-sm ring-1 ring-slate-800 bg-white"
        />
      </div>
    </div>
  );
};
