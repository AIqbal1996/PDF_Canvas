import {
  AIAnalysisResponse,
  AIChatMessage,
  AIConfigPublic,
  AIContextPreview,
  AIStructuredExtractionResponse,
  AITestConnectionResult,
  BatchUtilityRequest,
  BatchUtilityResponse,
  BookmarkItem,
  CompareDocumentsRequest,
  CompressionResult,
  ConversionCapabilities,
  CreateFormFieldRequest,
  DigitalSignRequest,
  Document,
  DocumentBookmarks,
  DocumentComparisonReport,
  DocumentDetail,
  DocumentFormsInspection,
  DocumentOcrInspection,
  DocumentSecurityInspection,
  DocumentSignaturesReport,
  EncryptPdfRequest,
  FillFormRequest,
  GenerateSelfSignedCertRequest,
  ImageInfo,
  IngestionResult,
  IntegrityAuditReport,
  LocalCertificateInfo,
  OcrStatus,
  PageOcrResult,
  PdfTemplate,
  RedactPdfRequest,
  RenderTemplateRequest,
  SanitizeMetadataRequest,
  SaveAISummaryPdfRequest,
  SavedSignature,
  ScannedReconstructionRequest,
  ScannedRegionCorrectionRequest,
  SystemDiagnosticsReport,
  TempCleanupReport,
  TemplateSummary,
  UpdateAIConfigRequest,
  VisualSignatureStampRequest,
  WatermarkRequest,
} from "../types";

const API_BASE = "/api/documents";
const CONVERT_BASE = "/api/convert";
const OCR_BASE = "/api/ocr";
const TEMPLATES_BASE = "/api/templates";
const SIGNATURES_BASE = "/api/signatures";
const SECURITY_BASE = "/api/security";
const UTILITIES_BASE = "/api/utilities";
const AI_BASE = "/api/ai";
const SYSTEM_BASE = "/api/system";

export async function fetchDocuments(
  limit: number = 50,
  offset: number = 0,
  search: string = ""
): Promise<Document[]> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (search.trim()) {
    params.set("search", search.trim());
  }
  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Failed to list documents: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchDocumentDetail(id: string): Promise<DocumentDetail> {
  const res = await fetch(`${API_BASE}/${id}`);
  if (!res.ok) {
    throw new Error(`Failed to get document detail: ${res.statusText}`);
  }
  return res.json();
}

export async function uploadDocument(file: File): Promise<IngestionResult> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(API_BASE, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    let errorMsg = `Upload failed (${res.status})`;
    try {
      const errJson = await res.json();
      if (errJson.detail) errorMsg = errJson.detail;
    } catch {
      // fallback to status
    }
    throw new Error(errorMsg);
  }

  return res.json();
}

export async function rotatePage(
  id: string,
  pageIndex: number,
  degrees: number
): Promise<IngestionResult> {
  const res = await fetch(`${API_BASE}/${id}/rotate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ page_index: pageIndex, degrees }),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Rotation failed");
  }

  return res.json();
}

export async function reorderPages(
  id: string,
  newOrder: number[]
): Promise<IngestionResult> {
  const res = await fetch(`${API_BASE}/${id}/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ new_order: newOrder }),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Reorder failed");
  }

  return res.json();
}

export async function deletePages(
  id: string,
  pages: number[]
): Promise<IngestionResult> {
  const res = await fetch(`${API_BASE}/${id}/delete-pages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pages }),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Delete pages failed");
  }

  return res.json();
}

export async function duplicatePage(
  id: string,
  pageIndex: number,
  count: number = 1
): Promise<IngestionResult> {
  const res = await fetch(`${API_BASE}/${id}/duplicate-page`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ page_index: pageIndex, count }),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Duplicate page failed");
  }

  return res.json();
}

export async function extractPages(
  id: string,
  pages: number[],
  title?: string
): Promise<IngestionResult> {
  const res = await fetch(`${API_BASE}/${id}/extract-pages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pages, title }),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Extract pages failed");
  }

  return res.json();
}

export async function mergeDocuments(
  documentIds: string[],
  title: string = "Merged.pdf"
): Promise<IngestionResult> {
  const res = await fetch(`${API_BASE}/merge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document_ids: documentIds, title }),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Merge failed");
  }

  return res.json();
}

export async function resizePages(
  id: string,
  targetSize: string,
  pageIndices?: number[],
  scaleContent: boolean = true
): Promise<IngestionResult> {
  const res = await fetch(`${API_BASE}/${id}/resize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target_size: targetSize,
      page_indices: pageIndices,
      scale_content: scaleContent,
    }),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Resize failed");
  }

  return res.json();
}

export async function cropPages(
  id: string,
  left: number,
  top: number,
  right: number,
  bottom: number,
  pageIndices?: number[]
): Promise<IngestionResult> {
  const res = await fetch(`${API_BASE}/${id}/crop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      left,
      top,
      right,
      bottom,
      page_indices: pageIndices,
    }),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Crop failed");
  }

  return res.json();
}

export interface HeaderFooterPayload {
  header_left?: string | null;
  header_center?: string | null;
  header_right?: string | null;
  footer_left?: string | null;
  footer_center?: string | null;
  footer_right?: string | null;
  font_size?: number;
  font_color?: string;
  margin?: number;
  skip_first_page?: boolean;
  start_number?: number;
  page_indices?: number[] | null;
}

export async function applyHeaderFooter(
  id: string,
  config: HeaderFooterPayload
): Promise<IngestionResult> {
  const res = await fetch(`${API_BASE}/${id}/header-footer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Header/footer application failed");
  }

  return res.json();
}

export interface TextAnnotationPayload {
  text: string;
  x: number;
  y: number;
  font_name?: string;
  font_size?: number;
  color?: string;
  background_color?: string | null;
  link_url?: string | null;
}

export interface ShapeAnnotationPayload {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  opacity?: number;
  stroke_width?: number;
  fill?: boolean;
}

export async function applyAnnotations(
  id: string,
  pageIndex: number,
  texts: TextAnnotationPayload[],
  shapes: ShapeAnnotationPayload[]
): Promise<IngestionResult> {
  const res = await fetch(`${API_BASE}/${id}/annotate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      page_index: pageIndex,
      texts,
      shapes,
    }),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Annotation failed");
  }

  return res.json();
}

export async function nativeTextEdit(
  id: string,
  pageIndex: number,
  targetText: string,
  replacementText: string
): Promise<IngestionResult> {
  const res = await fetch(`${API_BASE}/${id}/native-text-edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      page_index: pageIndex,
      target_text: targetText,
      replacement_text: replacementText,
    }),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Native text edit failed");
  }

  return res.json();
}

export function getRevisionContentUrl(docId: string, revId: string): string {
  return `${API_BASE}/${docId}/revisions/${revId}/content`;
}

export function getExportUrl(docId: string, revId?: string): string {
  if (revId) {
    return `${API_BASE}/${docId}/export?revision_id=${revId}`;
  }
  return `${API_BASE}/${docId}/export`;
}

export async function insertImage(
  id: string,
  pageIndex: number,
  file: File,
  x: number,
  y: number,
  width?: number,
  height?: number,
  rotation: number = 0,
  opacity: number = 1.0
): Promise<IngestionResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("page_index", pageIndex.toString());
  formData.append("x", x.toString());
  formData.append("y", y.toString());
  if (width !== undefined) formData.append("width", width.toString());
  if (height !== undefined) formData.append("height", height.toString());
  formData.append("rotation", rotation.toString());
  formData.append("opacity", opacity.toString());

  const res = await fetch(`${API_BASE}/${id}/insert-image`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Insert image failed");
  }

  return res.json();
}

export async function listImages(
  id: string,
  pageIndex: number
): Promise<ImageInfo[]> {
  const res = await fetch(`${API_BASE}/${id}/pages/${pageIndex}/images`);
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Failed to list images");
  }
  return res.json();
}

export function getImageExtractUrl(
  id: string,
  pageIndex: number,
  imageName: string
): string {
  return `${API_BASE}/${id}/pages/${pageIndex}/images/${encodeURIComponent(imageName)}`;
}

export async function replaceImage(
  id: string,
  pageIndex: number,
  imageName: string,
  file: File
): Promise<IngestionResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("page_index", pageIndex.toString());
  formData.append("image_name", imageName);

  const res = await fetch(`${API_BASE}/${id}/replace-image`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Replace image failed");
  }

  return res.json();
}

export async function deleteImage(
  id: string,
  pageIndex: number,
  imageName: string
): Promise<IngestionResult> {
  const res = await fetch(`${API_BASE}/${id}/delete-image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      page_index: pageIndex,
      image_name: imageName,
    }),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Delete image failed");
  }

  return res.json();
}

// --- Phase 6 Document Conversion Services ---

export async function fetchConversionStatus(): Promise<ConversionCapabilities> {
  const res = await fetch(`${CONVERT_BASE}/status`);
  if (!res.ok) {
    throw new Error("Failed to check conversion engine capabilities");
  }
  return res.json();
}

export async function convertImagesToPdf(
  files: File[],
  title: string = "Images.pdf",
  pageSize: string = "A4",
  fitToPage: boolean = true
): Promise<IngestionResult> {
  const formData = new FormData();
  files.forEach((f) => formData.append("files", f));
  formData.append("title", title);
  formData.append("page_size", pageSize);
  formData.append("fit_to_page", fitToPage.toString());

  const res = await fetch(`${CONVERT_BASE}/images-to-pdf`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Image to PDF conversion failed");
  }

  return res.json();
}

export async function convertTextToPdf(
  text: string,
  title: string = "Document.pdf",
  file?: File
): Promise<IngestionResult> {
  const formData = new FormData();
  if (file) {
    formData.append("file", file);
  }
  formData.append("text", text);
  formData.append("title", title);

  const res = await fetch(`${CONVERT_BASE}/text-to-pdf`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Text to PDF conversion failed");
  }

  return res.json();
}

export async function convertOfficeToPdf(file: File): Promise<IngestionResult> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${CONVERT_BASE}/office-to-pdf`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Office document conversion failed");
  }

  return res.json();
}

export function getRenderPageImageUrl(
  docId: string,
  pageIndex: number,
  scale: number = 2.0,
  fmt: string = "PNG"
): string {
  return `${CONVERT_BASE}/documents/${docId}/render-page/${pageIndex}?scale=${scale}&fmt=${fmt}`;
}

export function getExportImagesZipUrl(
  docId: string,
  scale: number = 2.0,
  fmt: string = "PNG",
  pages?: string
): string {
  let url = `${CONVERT_BASE}/documents/${docId}/export-images?scale=${scale}&fmt=${fmt}`;
  if (pages) {
    url += `&pages=${encodeURIComponent(pages)}`;
  }
  return url;
}

// --- Phase 7 Local OCR Services ---

export async function fetchOcrStatus(): Promise<OcrStatus> {
  const res = await fetch(`${OCR_BASE}/status`);
  if (!res.ok) {
    throw new Error("Failed to check OCR status");
  }
  return res.json();
}

export async function inspectDocumentOcr(docId: string): Promise<DocumentOcrInspection> {
  const res = await fetch(`${OCR_BASE}/documents/${docId}/inspect`);
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "OCR inspection failed");
  }
  return res.json();
}

export async function recognizePageText(
  docId: string,
  pageIndex: number,
  language: string = "eng",
  dpi: number = 150
): Promise<PageOcrResult> {
  const res = await fetch(
    `${OCR_BASE}/documents/${docId}/pages/${pageIndex}/recognize?language=${language}&dpi=${dpi}`
  );
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "OCR recognition failed");
  }
  return res.json();
}

export async function applyOcrSearchableLayer(
  docId: string,
  pageIndices?: number[],
  language: string = "eng",
  dpi: number = 150
): Promise<IngestionResult> {
  const res = await fetch(`${OCR_BASE}/documents/${docId}/apply-searchable-layer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      page_indices: pageIndices,
      language,
      dpi,
    }),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Searchable PDF layer creation failed");
  }

  return res.json();
}

export async function correctScannedRegion(
  docId: string,
  req: ScannedRegionCorrectionRequest
): Promise<IngestionResult> {
  const res = await fetch(`${OCR_BASE}/documents/${docId}/correct-scanned-region`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Scanned region correction failed");
  }

  return res.json();
}

export async function reconstructScannedDocument(
  docId: string,
  req: ScannedReconstructionRequest
): Promise<IngestionResult> {
  const res = await fetch(`${OCR_BASE}/documents/${docId}/reconstruct`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Document reconstruction failed");
  }

  return res.json();
}

export async function deleteDocument(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete document: ${res.statusText}`);
  }
}

// --- Phase 9 Template Studio Services ---

export async function fetchTemplates(): Promise<TemplateSummary[]> {
  const res = await fetch(TEMPLATES_BASE);
  if (!res.ok) {
    throw new Error("Failed to list templates");
  }
  return res.json();
}

export async function fetchTemplateDetail(id: string): Promise<PdfTemplate> {
  const res = await fetch(`${TEMPLATES_BASE}/${id}`);
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Failed to load template");
  }
  return res.json();
}

export async function createTemplate(template: PdfTemplate): Promise<PdfTemplate> {
  const res = await fetch(TEMPLATES_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(template),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Failed to create template");
  }
  return res.json();
}

export async function updateTemplate(id: string, template: PdfTemplate): Promise<PdfTemplate> {
  const res = await fetch(`${TEMPLATES_BASE}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(template),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Failed to update template");
  }
  return res.json();
}

export async function deleteTemplate(id: string): Promise<void> {
  const res = await fetch(`${TEMPLATES_BASE}/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Failed to delete template");
  }
}

export async function renderTemplateToDocument(
  templateId: string,
  req: RenderTemplateRequest
): Promise<IngestionResult> {
  const res = await fetch(`${TEMPLATES_BASE}/${templateId}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Template rendering failed");
  }
  return res.json();
}

export async function previewTemplatePdfUrl(
  req: RenderTemplateRequest
): Promise<string> {
  const res = await fetch(`${TEMPLATES_BASE}/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Failed to generate template preview");
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

// --- Phase 10 PDF Forms (AcroForms) Services ---

export async function inspectDocumentForms(
  docId: string
): Promise<DocumentFormsInspection> {
  const res = await fetch(`${API_BASE}/${docId}/forms`);
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Failed to inspect document forms");
  }
  return res.json();
}

export async function fillDocumentForms(
  docId: string,
  req: FillFormRequest
): Promise<IngestionResult> {
  const res = await fetch(`${API_BASE}/${docId}/forms/fill`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Failed to fill form fields");
  }
  return res.json();
}

export async function flattenDocumentForms(
  docId: string
): Promise<IngestionResult> {
  const res = await fetch(`${API_BASE}/${docId}/forms/flatten`, {
    method: "POST",
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Failed to flatten form fields");
  }
  return res.json();
}

export async function addDocumentFormField(
  docId: string,
  req: CreateFormFieldRequest
): Promise<IngestionResult> {
  const res = await fetch(`${API_BASE}/${docId}/forms/fields`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Failed to add form field");
  }
  return res.json();
}

// --- Phase 11 Electronic & Digital Signatures Services ---

export async function listSavedSignatures(): Promise<SavedSignature[]> {
  const res = await fetch(`${SIGNATURES_BASE}/library`);
  if (!res.ok) {
    throw new Error("Failed to load saved signatures");
  }
  return res.json();
}

export async function saveSignatureGraphic(
  name: string,
  imageBase64: string
): Promise<SavedSignature> {
  const res = await fetch(`${SIGNATURES_BASE}/library`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, image_base64: imageBase64 }),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Failed to save signature graphic");
  }
  return res.json();
}

export async function deleteSavedSignature(sigId: string): Promise<void> {
  const res = await fetch(`${SIGNATURES_BASE}/library/${encodeURIComponent(sigId)}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 404) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Failed to delete signature");
  }
}

export async function applyVisualSignatureStamp(
  docId: string,
  req: VisualSignatureStampRequest
): Promise<IngestionResult> {
  const res = await fetch(`${SIGNATURES_BASE}/documents/${docId}/visual-stamp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Failed to apply visual signature stamp");
  }
  return res.json();
}

export async function listLocalCertificates(): Promise<LocalCertificateInfo[]> {
  const res = await fetch(`${SIGNATURES_BASE}/certs`);
  if (!res.ok) {
    throw new Error("Failed to load local certificates");
  }
  return res.json();
}

export async function generateSelfSignedCert(
  req: GenerateSelfSignedCertRequest
): Promise<LocalCertificateInfo> {
  const res = await fetch(`${SIGNATURES_BASE}/certs/self-signed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Failed to generate certificate");
  }
  return res.json();
}

export async function deleteLocalCertificate(certId: string): Promise<void> {
  const res = await fetch(`${SIGNATURES_BASE}/certs/${encodeURIComponent(certId)}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 404) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Failed to delete certificate");
  }
}

export async function signDocumentDigitally(
  docId: string,
  req: DigitalSignRequest
): Promise<IngestionResult> {
  const res = await fetch(`${SIGNATURES_BASE}/documents/${docId}/digital-sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Digital signature failed");
  }
  return res.json();
}

export async function verifyDocumentSignatures(
  docId: string
): Promise<DocumentSignaturesReport> {
  const res = await fetch(`${SIGNATURES_BASE}/documents/${docId}/verify`);
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Signature verification failed");
  }
  return res.json();
}

// --- Phase 12 Security (Encryption, Redaction, Metadata Sanitization) ---

export async function inspectDocumentSecurity(
  docId: string
): Promise<DocumentSecurityInspection> {
  const res = await fetch(`${SECURITY_BASE}/documents/${docId}/inspect`);
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Security inspection failed");
  }
  return res.json();
}

export async function encryptDocumentPdf(
  docId: string,
  req: EncryptPdfRequest
): Promise<IngestionResult> {
  const res = await fetch(`${SECURITY_BASE}/documents/${docId}/encrypt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "PDF encryption failed");
  }
  return res.json();
}

export async function decryptDocumentPdf(
  docId: string,
  password: string
): Promise<IngestionResult> {
  const res = await fetch(`${SECURITY_BASE}/documents/${docId}/decrypt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "PDF decryption failed");
  }
  return res.json();
}

export async function redactDocumentPermanently(
  docId: string,
  req: RedactPdfRequest
): Promise<IngestionResult> {
  const res = await fetch(`${SECURITY_BASE}/documents/${docId}/redact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Permanent redaction failed");
  }
  return res.json();
}

export async function sanitizeDocumentMetadata(
  docId: string,
  req: SanitizeMetadataRequest
): Promise<IngestionResult> {
  const res = await fetch(`${SECURITY_BASE}/documents/${docId}/sanitize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Metadata sanitization failed");
  }
  return res.json();
}

// --- Phase 13 Advanced Utilities Services ---

export async function applyDocumentWatermark(
  docId: string,
  req: WatermarkRequest
): Promise<IngestionResult> {
  const res = await fetch(`${UTILITIES_BASE}/documents/${docId}/watermark`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Watermark application failed");
  }
  return res.json();
}

export async function compressDocumentPdf(
  docId: string,
  mode: "lossless" | "balanced" | "compact"
): Promise<CompressionResult> {
  const res = await fetch(`${UTILITIES_BASE}/documents/${docId}/compress`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "PDF compression failed");
  }
  return res.json();
}

export async function getDocumentBookmarks(docId: string): Promise<DocumentBookmarks> {
  const res = await fetch(`${UTILITIES_BASE}/documents/${docId}/bookmarks`);
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Failed to load bookmarks");
  }
  return res.json();
}

export async function suggestDocumentBookmarks(docId: string): Promise<BookmarkItem[]> {
  const res = await fetch(`${UTILITIES_BASE}/documents/${docId}/bookmarks/suggest`);
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Failed to suggest bookmarks");
  }
  return res.json();
}

export async function updateDocumentBookmarks(
  docId: string,
  bookmarks: BookmarkItem[]
): Promise<IngestionResult> {
  const res = await fetch(`${UTILITIES_BASE}/documents/${docId}/bookmarks`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookmarks }),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Failed to save bookmarks");
  }
  return res.json();
}

export async function compareDocuments(
  req: CompareDocumentsRequest
): Promise<DocumentComparisonReport> {
  const res = await fetch(`${UTILITIES_BASE}/compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Document comparison failed");
  }
  return res.json();
}

export function getComparePageDiffImageUrl(
  docAId: string,
  docBId: string,
  pageIndex: number,
  revAId?: string | null,
  revBId?: string | null,
  dpi: number = 120
): string {
  const params = new URLSearchParams({
    doc_a_id: docAId,
    doc_b_id: docBId,
    page_index: pageIndex.toString(),
    dpi: dpi.toString(),
  });
  if (revAId) params.set("rev_a_id", revAId);
  if (revBId) params.set("rev_b_id", revBId);
  return `${UTILITIES_BASE}/compare-page-image?${params.toString()}`;
}

export async function runBatchUtility(
  req: BatchUtilityRequest
): Promise<BatchUtilityResponse> {
  const res = await fetch(`${UTILITIES_BASE}/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Batch utility failed");
  }
  return res.json();
}

// --- Phase 14 AI Assistant (Euri API + Local Ollama) ---

export async function getAIConfig(): Promise<AIConfigPublic> {
  const res = await fetch(`${AI_BASE}/config`);
  if (!res.ok) {
    throw new Error("Failed to load AI configuration");
  }
  return res.json();
}

export async function updateAIConfig(
  req: UpdateAIConfigRequest
): Promise<AIConfigPublic> {
  const res = await fetch(`${AI_BASE}/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Failed to save AI settings");
  }
  return res.json();
}

export async function clearSavedAIKey(): Promise<AIConfigPublic> {
  const res = await fetch(`${AI_BASE}/config/key`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error("Failed to remove stored API key");
  }
  return res.json();
}

export async function testAIConnection(
  transientKey?: string
): Promise<AITestConnectionResult> {
  const headers: Record<string, string> = {};
  if (transientKey && transientKey.trim()) {
    headers["X-AI-Api-Key"] = transientKey.trim();
  }
  const res = await fetch(`${AI_BASE}/test-connection`, {
    method: "POST",
    headers,
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "AI connection test failed");
  }
  return res.json();
}

export async function previewAIContext(
  docId: string,
  pageIndices?: number[]
): Promise<AIContextPreview> {
  const qs =
    pageIndices && pageIndices.length > 0
      ? `?pages=${encodeURIComponent(pageIndices.join(","))}`
      : "";
  const res = await fetch(`${AI_BASE}/documents/${docId}/context-preview${qs}`);
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Context preview failed");
  }
  return res.json();
}

export async function summarizeDocumentWithAI(
  docId: string,
  style: "executive" | "bullet_points" | "action_items" | "detailed",
  pageIndices?: number[] | null,
  customFocus?: string
): Promise<AIAnalysisResponse> {
  const res = await fetch(`${AI_BASE}/documents/${docId}/summarize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      style,
      page_indices: pageIndices || null,
      custom_focus: customFocus || null,
    }),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "AI summarization failed");
  }
  return res.json();
}

export async function askDocumentWithAI(
  docId: string,
  question: string,
  history: AIChatMessage[],
  pageIndices?: number[] | null
): Promise<AIAnalysisResponse> {
  const res = await fetch(`${AI_BASE}/documents/${docId}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      history,
      page_indices: pageIndices || null,
    }),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "AI Q&A failed");
  }
  return res.json();
}

export async function extractStructuredDataWithAI(
  docId: string,
  fields: string[],
  pageIndices?: number[] | null,
  instructions?: string
): Promise<AIStructuredExtractionResponse> {
  const res = await fetch(`${AI_BASE}/documents/${docId}/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fields,
      page_indices: pageIndices || null,
      instructions: instructions || null,
    }),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Structured data extraction failed");
  }
  return res.json();
}

export async function saveAISummaryToPdf(
  docId: string,
  req: SaveAISummaryPdfRequest
): Promise<IngestionResult> {
  const res = await fetch(`${AI_BASE}/documents/${docId}/save-summary-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errJson.detail || "Failed to save AI summary PDF");
  }
  return res.json();
}

// --- Phase 15 Enterprise System Diagnostics & Integrity Services ---

export async function fetchSystemDiagnostics(): Promise<SystemDiagnosticsReport> {
  const res = await fetch(`${SYSTEM_BASE}/diagnostics`);
  if (!res.ok) {
    throw new Error(`Failed to fetch system diagnostics: ${res.statusText}`);
  }
  return res.json();
}

export async function verifyCatalogIntegrity(): Promise<IntegrityAuditReport> {
  const res = await fetch(`${SYSTEM_BASE}/verify-integrity`, { method: "POST" });
  if (!res.ok) {
    throw new Error(`Failed to run catalog integrity check: ${res.statusText}`);
  }
  return res.json();
}

export async function cleanupTempFiles(): Promise<TempCleanupReport> {
  const res = await fetch(`${SYSTEM_BASE}/cleanup-temp`, { method: "POST" });
  if (!res.ok) {
    throw new Error(`Failed to cleanup stale temp files: ${res.statusText}`);
  }
  return res.json();
}
