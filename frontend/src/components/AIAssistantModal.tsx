import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  Sparkles,
  MessageSquare,
  FileText,
  Braces,
  Settings,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Copy,
  FilePlus2,
  Key,
  Send,
  Trash2,
  ShieldAlert,
} from "lucide-react";
import {
  AIAnalysisResponse,
  AIChatMessage,
  AIConfigPublic,
  AIContextPreview,
  AIStructuredExtractionResponse,
} from "../types";
import {
  askDocumentWithAI,
  clearSavedAIKey,
  extractStructuredDataWithAI,
  getAIConfig,
  previewAIContext,
  saveAISummaryToPdf,
  summarizeDocumentWithAI,
  testAIConnection,
  updateAIConfig,
} from "../services/api";

interface AIAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  documentTitle: string;
  currentPage: number;
  totalPages: number;
  onRevisionCreated: (message: string) => void;
  onOpenDocument?: (docId: string) => void;
}

export const AIAssistantModal: React.FC<AIAssistantModalProps> = ({
  isOpen,
  onClose,
  documentId,
  documentTitle,
  currentPage,
  totalPages,
  onRevisionCreated,
  onOpenDocument,
}) => {
  const [activeTab, setActiveTab] = useState<
    "summarize" | "qa" | "extract" | "settings"
  >("summarize");
  const [config, setConfig] = useState<AIConfigPublic | null>(null);
  const [contextPreview, setContextPreview] = useState<AIContextPreview | null>(
    null
  );
  const [pageScope, setPageScope] = useState<"all" | "current">("all");
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // --- Summarize State ---
  const [summaryStyle, setSummaryStyle] = useState<
    "executive" | "bullet_points" | "action_items" | "detailed"
  >("executive");
  const [customFocus, setCustomFocus] = useState("");
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryResult, setSummaryResult] = useState<AIAnalysisResponse | null>(
    null
  );
  const [isSavingPdf, setIsSavingPdf] = useState(false);

  // --- Q&A Chat State ---
  const [questionInput, setQuestionInput] = useState("");
  const [chatHistory, setChatHistory] = useState<AIChatMessage[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [lastQaTokens, setLastQaTokens] = useState<number | null>(null);

  // --- Extract State ---
  const [fieldsInput, setFieldsInput] = useState(
    "title, dates, parties, monetary_amounts, key_obligations"
  );
  const [extractNotes, setExtractNotes] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractResult, setExtractResult] =
    useState<AIStructuredExtractionResponse | null>(null);

  // --- Settings State ---
  const [providerInput, setProviderInput] = useState<"euri" | "ollama">("euri");
  const [euriUrlInput, setEuriUrlInput] = useState(
    "https://api.euron.one/api/v1/euri/chat/completions"
  );
  const [euriModelInput, setEuriModelInput] = useState("gpt-5.3-instant");
  const [ollamaUrlInput, setOllamaUrlInput] = useState("http://127.0.0.1:11434");
  const [ollamaModelInput, setOllamaModelInput] = useState("llama3.2");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [tokenBudgetInput, setTokenBudgetInput] = useState(300000);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isTestingConn, setIsTestingConn] = useState(false);

  const loadConfigAndPreview = useCallback(async () => {
    try {
      const cfg = await getAIConfig();
      setConfig(cfg);
      setProviderInput(cfg.provider === "ollama" ? "ollama" : "euri");
      setEuriUrlInput(cfg.euri_base_url);
      setEuriModelInput(cfg.euri_model);
      setOllamaUrlInput(cfg.ollama_base_url);
      setOllamaModelInput(cfg.ollama_model);
      setTokenBudgetInput(cfg.token_budget);
    } catch {
      // ignore initial settings read issues
    }

    if (documentId) {
      try {
        const scoped = pageScope === "current" ? [currentPage - 1] : undefined;
        const prev = await previewAIContext(documentId, scoped);
        setContextPreview(prev);
      } catch {
        setContextPreview(null);
      }
    }
  }, [documentId, pageScope, currentPage]);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setStatusMsg(null);
    loadConfigAndPreview();
  }, [isOpen, loadConfigAndPreview]);

  if (!isOpen) return null;

  const targetPageIndices = pageScope === "current" ? [currentPage - 1] : null;
  const budgetPct = config
    ? Math.min(
        100,
        Math.round((config.total_tokens_used / Math.max(1, config.token_budget)) * 100)
      )
    : 0;

  // --- Handlers ---
  const handleSummarize = async () => {
    setError(null);
    setStatusMsg(null);
    setIsSummarizing(true);
    try {
      const res = await summarizeDocumentWithAI(
        documentId,
        summaryStyle,
        targetPageIndices,
        customFocus
      );
      setSummaryResult(res);
      await loadConfigAndPreview();
    } catch (err: any) {
      setError(err.message || "Summarization failed");
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleSaveSummaryPdf = async (
    mode: "new_document" | "prepend_cover_page"
  ) => {
    if (!summaryResult) return;
    setError(null);
    setStatusMsg(null);
    setIsSavingPdf(true);
    try {
      const res = await saveAISummaryToPdf(documentId, {
        heading: `AI ${summaryStyle.replace(/_/g, " ").toUpperCase()} — ${documentTitle}`,
        content: summaryResult.answer,
        model_used: `${summaryResult.provider} / ${summaryResult.model}`,
        mode,
      });
      if (mode === "prepend_cover_page") {
        onRevisionCreated("Prepended AI Executive Summary cover page revision!");
        setStatusMsg(
          `Cover page prepended (child rev ${res.revision.id.slice(0, 8)}).`
        );
      } else {
        setStatusMsg(`Saved standalone PDF "${res.document.title}" to catalog.`);
        if (
          onOpenDocument &&
          confirm(`Created "${res.document.title}". Open the new report document now?`)
        ) {
          onClose();
          onOpenDocument(res.document.id);
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to save AI summary PDF");
    } finally {
      setIsSavingPdf(false);
    }
  };

  const handleAsk = async (promptOverride?: string) => {
    const q = (promptOverride ?? questionInput).trim();
    if (!q) return;
    setError(null);
    setStatusMsg(null);
    const prevHistory = [...chatHistory];
    setChatHistory((h) => [...h, { role: "user", content: q }]);
    if (!promptOverride) setQuestionInput("");
    setIsAsking(true);
    try {
      const res = await askDocumentWithAI(
        documentId,
        q,
        prevHistory,
        targetPageIndices
      );
      setChatHistory((h) => [...h, { role: "assistant", content: res.answer }]);
      setLastQaTokens(res.total_tokens);
      await loadConfigAndPreview();
    } catch (err: any) {
      setChatHistory(prevHistory);
      setError(err.message || "AI query failed");
    } finally {
      setIsAsking(false);
    }
  };

  const handleExtract = async () => {
    const parsedFields = fieldsInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parsedFields.length === 0) {
      setError("Enter at least one field name to extract.");
      return;
    }
    setError(null);
    setStatusMsg(null);
    setIsExtracting(true);
    try {
      const res = await extractStructuredDataWithAI(
        documentId,
        parsedFields,
        targetPageIndices,
        extractNotes
      );
      setExtractResult(res);
      await loadConfigAndPreview();
    } catch (err: any) {
      setError(err.message || "Structured extraction failed");
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSaveSettingsAndTest = async (runTest: boolean) => {
    setError(null);
    setStatusMsg(null);
    setIsSavingConfig(true);
    try {
      const updated = await updateAIConfig({
        provider: providerInput,
        euri_base_url: euriUrlInput,
        euri_model: euriModelInput,
        ollama_base_url: ollamaUrlInput,
        ollama_model: ollamaModelInput,
        api_key: apiKeyInput.trim() ? apiKeyInput.trim() : undefined,
        token_budget: tokenBudgetInput,
      });
      setConfig(updated);
      setApiKeyInput("");

      if (runTest) {
        setIsTestingConn(true);
        const testRes = await testAIConnection();
        setStatusMsg(
          `${testRes.message} Latency: ${testRes.latency_ms}ms${
            testRes.total_tokens > 0 ? ` (${testRes.total_tokens} tokens)` : ""
          }`
        );
        await loadConfigAndPreview();
      } else {
        setStatusMsg("AI provider configuration saved locally.");
      }
    } catch (err: any) {
      setError(err.message || "Failed saving or testing AI settings");
    } finally {
      setIsSavingConfig(false);
      setIsTestingConn(false);
    }
  };

  const handleClearKey = async () => {
    setError(null);
    setStatusMsg(null);
    try {
      const cfg = await clearSavedAIKey();
      setConfig(cfg);
      setStatusMsg("Cleared stored Euri API key.");
    } catch (err: any) {
      setError(err.message || "Failed to clear key");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/95">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-500/20 text-violet-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-100 text-sm flex items-center gap-2">
                AI Document Assistant
                {config && (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                      config.provider === "ollama"
                        ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                        : "bg-violet-500/15 text-violet-300 border-violet-500/30"
                    }`}
                  >
                    {config.provider === "ollama"
                      ? `Local Ollama • ${config.ollama_model}`
                      : `Euri API • ${config.euri_model}`}
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-slate-400">
                Summarize PDFs, cite-verified Q&A, structured JSON extraction & token budget tracking
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

        {/* Status / Budget Bar */}
        <div className="px-4 py-2.5 bg-slate-950/80 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-[11px]">
          <div className="flex items-center gap-2 text-slate-300">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate max-w-lg">
              {config?.privacy_notice || "Loading AI configuration..."}
            </span>
          </div>

          {config && (
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">Tokens Used:</span>
                <span className="font-mono text-violet-300 font-semibold">
                  {config.total_tokens_used.toLocaleString()} /{" "}
                  {config.token_budget.toLocaleString()}
                </span>
                <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-500"
                    style={{ width: `${budgetPct}%` }}
                  />
                </div>
              </div>
              <select
                value={pageScope}
                onChange={(e) =>
                  setPageScope(e.target.value as "all" | "current")
                }
                className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-slate-200 text-[11px]"
                title="Control which pages are included in AI prompts"
              >
                <option value="all">
                  Scope: All Pages ({totalPages})
                </option>
                <option value="current">
                  Scope: Current Page ({currentPage})
                </option>
              </select>
            </div>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-4 gap-2 text-xs overflow-x-auto">
          <button
            onClick={() => setActiveTab("summarize")}
            className={`py-2.5 px-3 border-b-2 font-medium flex items-center gap-1.5 whitespace-nowrap transition ${
              activeTab === "summarize"
                ? "border-violet-400 text-violet-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileText className="w-3.5 h-3.5" /> Summarize & Export
          </button>
          <button
            onClick={() => setActiveTab("qa")}
            className={`py-2.5 px-3 border-b-2 font-medium flex items-center gap-1.5 whitespace-nowrap transition ${
              activeTab === "qa"
                ? "border-sky-400 text-sky-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" /> Ask PDF (Q&A)
          </button>
          <button
            onClick={() => setActiveTab("extract")}
            className={`py-2.5 px-3 border-b-2 font-medium flex items-center gap-1.5 whitespace-nowrap transition ${
              activeTab === "extract"
                ? "border-emerald-400 text-emerald-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Braces className="w-3.5 h-3.5" /> Extract JSON
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`py-2.5 px-3 border-b-2 font-medium flex items-center gap-1.5 whitespace-nowrap transition ${
              activeTab === "settings"
                ? "border-amber-400 text-amber-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Settings className="w-3.5 h-3.5" /> Provider & Key
            {config?.provider === "euri" && !config.has_api_key && (
              <span className="w-2 h-2 rounded-full bg-rose-500" />
            )}
          </button>
        </div>

        {/* Main Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
          {config?.provider === "euri" && !config.has_api_key && activeTab !== "settings" && (
            <div className="p-3 bg-amber-950/40 border border-amber-700/60 rounded-xl text-amber-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Euri API key not configured yet. Add your key in{" "}
                  <strong>Provider & Key</strong> or switch to Local Ollama.
                </span>
              </div>
              <button
                onClick={() => setActiveTab("settings")}
                className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium shrink-0"
              >
                Configure Key
              </button>
            </div>
          )}

          {contextPreview && !contextPreview.has_selectable_text && activeTab !== "settings" && (
            <div className="p-3 bg-rose-950/50 border border-rose-800 rounded-xl text-rose-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>
                No selectable text detected on target pages (likely a scanned image PDF). Run{" "}
                <strong>OCR &rarr; Make Searchable</strong> first so AI can read page text.
              </span>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-950/60 border border-red-800 rounded-lg text-red-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {statusMsg && (
            <div className="p-3 bg-emerald-950/50 border border-emerald-800 rounded-lg text-emerald-200 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{statusMsg}</span>
            </div>
          )}

          {/* TAB 1: SUMMARIZE */}
          {activeTab === "summarize" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(
                  [
                    { id: "executive", label: "Executive Summary" },
                    { id: "bullet_points", label: "Key Bullet Takeaways" },
                    { id: "action_items", label: "Action Items & Risks" },
                    { id: "detailed", label: "Detailed Breakdown" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSummaryStyle(item.id)}
                    className={`p-2.5 rounded-xl border font-medium transition text-center ${
                      summaryStyle === item.id
                        ? "bg-violet-500/20 border-violet-500 text-violet-200"
                        : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={customFocus}
                  onChange={(e) => setCustomFocus(e.target.value)}
                  placeholder="Optional focus (e.g. Focus on payment deadlines, penalties & IP clauses)..."
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-violet-500"
                />
                <button
                  onClick={handleSummarize}
                  disabled={isSummarizing}
                  className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-medium flex items-center justify-center gap-1.5 transition disabled:opacity-50 shrink-0"
                >
                  {isSummarizing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  Generate Summary
                </button>
              </div>

              {contextPreview && (
                <div className="text-[11px] text-slate-500 flex items-center justify-between">
                  <span>
                    Context ready: {contextPreview.included_pages.length} page(s),{" "}
                    {contextPreview.char_count.toLocaleString()} chars (~
                    {contextPreview.estimated_tokens.toLocaleString()} est. tokens)
                  </span>
                  {contextPreview.truncated && (
                    <span className="text-amber-400">
                      Context capped to 36k chars for token efficiency
                    </span>
                  )}
                </div>
              )}

              {summaryResult && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800/80 text-[11px] text-slate-400">
                    <span>
                      Analyzed pages:{" "}
                      {summaryResult.pages_analyzed.map((p) => p + 1).join(", ")} • Model:{" "}
                      <strong className="text-slate-200">{summaryResult.model}</strong>
                    </span>
                    <span className="font-mono text-violet-300">
                      {summaryResult.prompt_tokens} in + {summaryResult.completion_tokens} out ={" "}
                      {summaryResult.total_tokens} tokens
                    </span>
                  </div>

                  <div className="text-slate-200 whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto pr-1">
                    {summaryResult.answer}
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-800/80">
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(summaryResult.answer);
                        setStatusMsg("Copied summary to clipboard.");
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium flex items-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copy
                    </button>
                    <button
                      onClick={() => handleSaveSummaryPdf("prepend_cover_page")}
                      disabled={isSavingPdf}
                      className="px-3 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-600 text-white font-medium flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <FilePlus2 className="w-3.5 h-3.5" /> Prepend Summary Cover Revision
                    </button>
                    <button
                      onClick={() => handleSaveSummaryPdf("new_document")}
                      disabled={isSavingPdf}
                      className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-medium flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <FileText className="w-3.5 h-3.5" /> Save as New PDF Report
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: MULTI-TURN DOCUMENT Q&A */}
          {activeTab === "qa" && (
            <div className="space-y-3 flex flex-col">
              <div className="flex flex-wrap gap-1.5">
                {[
                  "What are the primary key figures or financial amounts?",
                  "Summarize key deadlines, obligations, and termination terms.",
                  "Are there any hidden risks or unusual clauses?",
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => handleAsk(q)}
                    disabled={isAsking}
                    className="px-2.5 py-1 rounded-md bg-slate-950 border border-slate-800 hover:border-sky-500/60 text-slate-300 text-[11px] transition"
                  >
                    {q}
                  </button>
                ))}
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 h-64 overflow-y-auto space-y-3">
                {chatHistory.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center">
                    <MessageSquare className="w-7 h-7 mb-2 text-slate-600" />
                    <p>Ask any question grounded in this document's pages.</p>
                  </div>
                ) : (
                  chatHistory.map((msg, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-xl text-xs whitespace-pre-wrap leading-relaxed ${
                        msg.role === "user"
                          ? "bg-sky-950/50 border border-sky-800/60 text-sky-100 ml-8"
                          : "bg-slate-900 border border-slate-800 text-slate-200 mr-8"
                      }`}
                    >
                      <div className="text-[10px] uppercase tracking-wider font-semibold mb-1 text-slate-400">
                        {msg.role === "user" ? "You" : "AI Assistant"}
                      </div>
                      {msg.content}
                    </div>
                  ))
                )}
                {isAsking && (
                  <div className="flex items-center gap-2 text-sky-400 text-xs p-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing document pages...
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={questionInput}
                  onChange={(e) => setQuestionInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleAsk();
                    }
                  }}
                  placeholder="Ask a question about this PDF..."
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-sky-500"
                />
                {chatHistory.length > 0 && (
                  <button
                    onClick={() => {
                      setChatHistory([]);
                      setLastQaTokens(null);
                    }}
                    className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
                    title="Clear Chat"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => handleAsk()}
                  disabled={isAsking || !questionInput.trim()}
                  className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" /> Ask
                </button>
              </div>
              {lastQaTokens !== null && (
                <div className="text-[11px] text-slate-500 text-right font-mono">
                  Last reply consumed {lastQaTokens} tokens
                </div>
              )}
            </div>
          )}

          {/* TAB 3: STRUCTURED JSON EXTRACTION */}
          {activeTab === "extract" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-slate-400">Schema Presets:</span>
                {[
                  {
                    label: "Contract Terms",
                    fields: "parties, effective_date, expiration_date, total_value, termination_notice, governing_law",
                  },
                  {
                    label: "Invoice Fields",
                    fields: "invoice_number, vendor_name, client_name, invoice_date, due_date, subtotal, tax, total_amount, line_items",
                  },
                  {
                    label: "Resume Profile",
                    fields: "candidate_name, email, phone, years_experience, skills, recent_roles, education",
                  },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => setFieldsInput(preset.fields)}
                    className="px-2.5 py-1 rounded-md bg-slate-950 border border-slate-800 hover:border-emerald-500/60 text-slate-300 text-[11px] transition"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Target Fields (comma-separated JSON keys)
                  </label>
                  <input
                    type="text"
                    value={fieldsInput}
                    onChange={(e) => setFieldsInput(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono text-xs"
                  />
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={extractNotes}
                    onChange={(e) => setExtractNotes(e.target.value)}
                    placeholder="Optional extraction formatting guidance (e.g. Format dates as YYYY-MM-DD)..."
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200"
                  />
                  <button
                    onClick={handleExtract}
                    disabled={isExtracting}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                  >
                    {isExtracting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Braces className="w-3.5 h-3.5" />
                    )}
                    Extract JSON
                  </button>
                </div>
              </div>

              {extractResult && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Extracted Structured Data ({extractResult.model})</span>
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(
                          JSON.stringify(extractResult.extracted_json, null, 2)
                        );
                        setStatusMsg("Copied structured JSON to clipboard.");
                      }}
                      className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" /> Copy JSON
                    </button>
                  </div>
                  <pre className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-emerald-300 font-mono text-[11px] overflow-x-auto max-h-64">
                    {JSON.stringify(extractResult.extracted_json, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: PROVIDER & KEY SETTINGS */}
          {activeTab === "settings" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div
                  onClick={() => setProviderInput("euri")}
                  className={`p-3.5 rounded-xl border cursor-pointer transition space-y-1 ${
                    providerInput === "euri"
                      ? "bg-violet-950/40 border-violet-500 text-slate-100"
                      : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <div className="font-semibold text-slate-100 flex items-center justify-between">
                    <span>Euri API (OpenAI-Compatible)</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">
                      Recommended
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Uses your BYOK Euri API key over TLS HTTPS (`gpt-5.3-instant`). Tracks cumulative token usage against your 3 Lakh (300,000) quota.
                  </p>
                </div>

                <div
                  onClick={() => setProviderInput("ollama")}
                  className={`p-3.5 rounded-xl border cursor-pointer transition space-y-1 ${
                    providerInput === "ollama"
                      ? "bg-emerald-950/40 border-emerald-500 text-slate-100"
                      : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <div className="font-semibold text-slate-100 flex items-center justify-between">
                    <span>Local Ollama Runtime</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      100% Offline
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Connects strictly to local loopback (`http://127.0.0.1:11434`) with zero external network traffic.
                  </p>
                </div>
              </div>

              {providerInput === "euri" ? (
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-slate-300 font-medium">
                        Euri API Key (stored locally in <code className="text-sky-300">local_data/ai_config.json</code>)
                      </label>
                      {config?.has_api_key && (
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="text-emerald-400 font-mono">
                            Active ({config.api_key_hint} via {config.api_key_source})
                          </span>
                          {config.api_key_source === "local_config" && (
                            <button
                              onClick={handleClearKey}
                              className="text-rose-400 hover:text-rose-300 underline"
                            >
                              Clear Key
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <input
                      type="password"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder={
                        config?.has_api_key
                          ? "Leave blank to keep existing saved key, or paste new key to replace"
                          : "Paste your Euri API Bearer key (never logged or returned in API responses)"
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-slate-400 mb-1">Endpoint URL</label>
                      <input
                        type="text"
                        value={euriUrlInput}
                        onChange={(e) => setEuriUrlInput(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 font-mono text-[11px]"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Model Name</label>
                      <input
                        type="text"
                        value={euriModelInput}
                        onChange={(e) => setEuriModelInput(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 font-mono text-[11px]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">
                      Token Budget Display Cap (default 3 Lakh = 300,000)
                    </label>
                    <input
                      type="number"
                      min={1000}
                      value={tokenBudgetInput}
                      onChange={(e) =>
                        setTokenBudgetInput(Number(e.target.value) || 300000)
                      }
                      className="w-48 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 font-mono text-xs"
                    />
                  </div>
                </div>
              ) : (
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">
                      Local Ollama Base URL
                    </label>
                    <input
                      type="text"
                      value={ollamaUrlInput}
                      onChange={(e) => setOllamaUrlInput(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Ollama Model</label>
                    <input
                      type="text"
                      value={ollamaModelInput}
                      onChange={(e) => setOllamaModelInput(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 font-mono text-xs"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => handleSaveSettingsAndTest(false)}
                  disabled={isSavingConfig || isTestingConn}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition disabled:opacity-50"
                >
                  Save Settings Only
                </button>
                <button
                  onClick={() => handleSaveSettingsAndTest(true)}
                  disabled={isSavingConfig || isTestingConn}
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  {(isSavingConfig || isTestingConn) && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                  Save & Test Connection
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-900/95 text-xs">
          <span className="text-[11px] text-slate-500">
            AI prompt context is explicitly bounded and never overwrites immutable source PDFs.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
