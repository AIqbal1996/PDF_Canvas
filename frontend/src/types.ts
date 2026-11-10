export interface Document {
  id: string;
  title: string;
  mime_type: string;
  page_count: number;
  size_bytes: number;
  original_revision_id: string;
  current_revision_id: string;
  created_at: string;
  updated_at: string;
}

export interface Revision {
  id: string;
  document_id: string;
  parent_revision_id: string | null;
  operation: string;
  storage_path: string;
  sha256: string;
  size_bytes: number;
  page_count: number;
  created_at: string;
}

export interface DocumentDetail {
  document: Document;
  revisions: Revision[];
}

export interface IngestionResult {
  document: Document;
  revision: Revision;
}

export interface ImageInfo {
  name: string;
  width: number;
  height: number;
  format: string;
  size_bytes: number;
}

export interface ConversionCapabilities {
  images_to_pdf: boolean;
  pdf_to_images: boolean;
  text_to_pdf: boolean;
  office_to_pdf: boolean;
  libreoffice_available: boolean;
  libreoffice_path: string | null;
  supported_office_formats: string[];
  supported_image_formats: string[];
}

export interface OcrWord {
  text: string;
  bbox: [number, number, number, number];
}

export interface OcrBlock {
  block_no: number;
  bbox: [number, number, number, number];
  text: string;
  lines: string[];
}

export interface PageOcrResult {
  page_index: number;
  has_native_text: boolean;
  is_scanned: boolean;
  extracted_text: string;
  word_count: number;
  words: OcrWord[];
  blocks: OcrBlock[];
}

export interface DocumentOcrInspection {
  total_pages: number;
  scanned_pages: number[];
  text_pages: number[];
}

export interface OcrStatus {
  ocr_available: boolean;
  tessdata_path: string;
  engine: string;
  supported_languages: string[];
}

export interface ScannedRegionCorrectionRequest {
  page_index: number;
  bbox: [number, number, number, number];
  replacement_text: string;
  font_name?: string;
  font_size?: number;
  text_color?: string;
  background_color?: string;
  cleanup_raster?: boolean;
}

export interface ScannedReconstructionRequest {
  page_indices?: number[];
  mode?: "clean_vector" | "overlay_redact";
  font_name?: string;
  language?: string;
  dpi?: number;
  create_new_document?: boolean;
  new_title?: string;
}

export interface TemplateVariable {
  key: string;
  label: string;
  default_value: string;
  description: string;
}

export interface TemplateElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string | null;
  font_name?: string;
  font_size?: number;
  font_color?: string;
  align?: string;
  fill_color?: string | null;
  stroke_color?: string | null;
  stroke_width?: number;
  border_radius?: number;
  table_columns?: string[];
  table_rows?: string[][];
  table_col_widths?: number[];
}

export interface PdfTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  page_size: string;
  orientation: string;
  elements: TemplateElement[];
  variables: TemplateVariable[];
  is_built_in: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface TemplateSummary {
  id: string;
  name: string;
  category: string;
  description: string;
  page_size: string;
  orientation: string;
  element_count: number;
  variable_count: number;
  is_built_in: boolean;
}

export interface RenderTemplateRequest {
  template_id?: string | null;
  template?: PdfTemplate | null;
  variables: Record<string, any>;
  title?: string | null;
}

export interface FormField {
  name: string;
  field_type: string;
  value: any;
  default_value: any;
  page_index: number;
  rect: [number, number, number, number];
  read_only: boolean;
  required: boolean;
  options: string[];
  text_fontsize?: number | null;
}

export interface DocumentFormsInspection {
  total_fields: number;
  has_form: boolean;
  fields: FormField[];
}

export interface FillFormRequest {
  values: Record<string, any>;
  flatten?: boolean;
}

export interface CreateFormFieldRequest {
  page_index: number;
  field_name: string;
  field_type: string;
  rect: [number, number, number, number];
  default_value?: any;
  options?: string[];
  read_only?: boolean;
  font_size?: number;
}

// --- Phase 11 Electronic & Digital Signatures ---

export interface SavedSignature {
  id: string;
  name: string;
  image_data_url: string;
  width: number;
  height: number;
  created_at: string;
}

export interface VisualSignatureStampRequest {
  page_index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  saved_signature_id?: string | null;
  signature_image_base64?: string | null;
  signer_name?: string | null;
  reason?: string | null;
  include_timestamp?: boolean;
  opacity?: number;
}

export interface LocalCertificateInfo {
  id: string;
  label: string;
  common_name: string;
  organization: string;
  email: string;
  serial_number: string;
  fingerprint_sha256: string;
  not_valid_before: string;
  not_valid_after: string;
  self_signed: boolean;
  created_at: string;
}

export interface GenerateSelfSignedCertRequest {
  label: string;
  common_name: string;
  organization: string;
  email: string;
  validity_days: number;
  password: string;
}

export interface DigitalSignRequest {
  cert_id?: string | null;
  pkcs12_base64?: string | null;
  password: string;
  reason?: string | null;
  location?: string | null;
  contact_info?: string | null;
  field_name?: string | null;
  visible?: boolean;
  page_index?: number;
  rect?: [number, number, number, number] | null;
}

export interface CryptographicSignatureStatus {
  field_name: string;
  signer_name: string;
  signer_subject: string;
  issuer_subject: string;
  self_signed: boolean;
  digest_intact: boolean;
  cryptographically_valid: boolean;
  trusted_ca: boolean;
  coverage: string;
  modification_level: string;
  signing_time?: string | null;
  reason?: string | null;
  location?: string | null;
  summary: string;
  error?: string | null;
}

export interface DocumentSignaturesReport {
  document_id: string;
  has_digital_signatures: boolean;
  digital_signature_count: number;
  all_signatures_intact: boolean;
  signatures: CryptographicSignatureStatus[];
  architecture_note: string;
}

// --- Phase 12 Security (Encryption, Redaction, Sanitization) ---

export interface PdfPermissionsConfig {
  allow_printing: boolean;
  allow_copying: boolean;
  allow_modifying: boolean;
  allow_annotations: boolean;
}

export interface EncryptPdfRequest {
  user_password: string;
  owner_password: string;
  permissions: PdfPermissionsConfig;
}

export interface RedactionRegion {
  page_index: number;
  rect: [number, number, number, number];
  overlay_text?: string;
  fill_color?: string;
  text_color?: string;
}

export interface RedactPdfRequest {
  regions?: RedactionRegion[];
  search_terms?: string[];
  case_sensitive?: boolean;
  page_indices?: number[] | null;
  overlay_text?: string;
  fill_color?: string;
  text_color?: string;
}

export interface SanitizeMetadataRequest {
  strip_info_dict: boolean;
  strip_xmp_metadata: boolean;
  strip_embedded_files: boolean;
  strip_javascript: boolean;
  strip_thumbnails: boolean;
  strip_annotations: boolean;
  strip_links: boolean;
  strip_hidden_text: boolean;
}

export interface DocumentSecurityInspection {
  document_id: string;
  is_encrypted: boolean;
  requires_open_password: boolean;
  encryption_scheme?: string | null;
  metadata: Record<string, string>;
  metadata_field_count: number;
  has_xmp_metadata: boolean;
  xmp_bytes: number;
  embedded_files: string[];
  has_javascript_or_open_action: boolean;
  annotation_count: number;
  warnings: string[];
}

// --- Phase 13 Advanced Utilities (Watermark, Compress, Bookmarks, Compare, Batch) ---

export interface WatermarkRequest {
  text: string;
  font_name?: string;
  font_size?: number;
  color?: string;
  opacity?: number;
  rotation?: number;
  position?: "center" | "top" | "bottom" | "tile";
  layer?: "over" | "under";
  page_indices?: number[] | null;
}

export interface CompressPdfRequest {
  mode: "lossless" | "balanced" | "compact";
}

export interface CompressionResult {
  document: Document;
  revision: Revision;
  original_bytes: number;
  compressed_bytes: number;
  saved_bytes: number;
  reduction_percent: number;
  mode: string;
}

export interface BookmarkItem {
  level: number;
  title: string;
  page_index: number;
}

export interface DocumentBookmarks {
  document_id: string;
  total_pages: number;
  bookmarks: BookmarkItem[];
}

export interface CompareDocumentsRequest {
  document_a_id: string;
  revision_a_id?: string | null;
  document_b_id: string;
  revision_b_id?: string | null;
  max_pages?: number;
}

export interface PageDiffSummary {
  page_index: number;
  text_changed: boolean;
  text_similarity: number;
  added_lines: number;
  removed_lines: number;
  diff_lines: string[];
  visual_diff_percent: number;
  visual_changed: boolean;
}

export interface DocumentComparisonReport {
  document_a_id: string;
  document_b_id: string;
  document_a_title: string;
  document_b_title: string;
  pages_a: number;
  pages_b: number;
  pages_compared: number;
  identical_pages: number;
  changed_pages: number;
  page_diffs: PageDiffSummary[];
}

export interface BatchUtilityRequest {
  document_ids: string[];
  action: "watermark" | "compress" | "sanitize";
  watermark?: WatermarkRequest;
  compress?: CompressPdfRequest;
  sanitize?: SanitizeMetadataRequest;
}

export interface BatchDocumentResult {
  document_id: string;
  title: string;
  success: boolean;
  new_revision_id?: string | null;
  error?: string | null;
}

export interface BatchUtilityResponse {
  action: string;
  total: number;
  succeeded: number;
  failed: number;
  results: BatchDocumentResult[];
}

// --- Phase 14 AI Assistant (Euri API + Local Ollama) ---

export interface AIConfigPublic {
  provider: "euri" | "ollama" | string;
  euri_base_url: string;
  euri_model: string;
  ollama_base_url: string;
  ollama_model: string;
  has_api_key: boolean;
  api_key_hint?: string | null;
  api_key_source: string;
  token_budget: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens_used: number;
  privacy_notice: string;
}

export interface UpdateAIConfigRequest {
  provider?: "euri" | "ollama";
  euri_base_url?: string;
  euri_model?: string;
  ollama_base_url?: string;
  ollama_model?: string;
  api_key?: string;
  token_budget?: number;
}

export interface AITestConnectionResult {
  ok: boolean;
  provider: string;
  model: string;
  latency_ms: number;
  message: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface AIContextPreview {
  document_id: string;
  total_pages: number;
  included_pages: number[];
  char_count: number;
  estimated_tokens: number;
  truncated: boolean;
  has_selectable_text: boolean;
}

export interface AIChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AIAnalysisResponse {
  document_id: string;
  provider: string;
  model: string;
  pages_analyzed: number[];
  truncated: boolean;
  answer: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface AIStructuredExtractionResponse {
  document_id: string;
  provider: string;
  model: string;
  pages_analyzed: number[];
  truncated: boolean;
  extracted_json: Record<string, any>;
  raw_text: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface SaveAISummaryPdfRequest {
  heading: string;
  content: string;
  model_used: string;
  mode: "new_document" | "prepend_cover_page";
  title?: string;
}

// --- Phase 15 Enterprise Reliability, Diagnostics & Storage Integrity ---

export interface StorageDirectoryStats {
  name: string;
  file_count: number;
  total_bytes: number;
}

export interface SystemDiagnosticsReport {
  status: "healthy" | "degraded" | string;
  sqlite_integrity_ok: boolean;
  sqlite_journal_mode: string;
  sqlite_db_bytes: number;
  document_count: number;
  revision_count: number;
  total_storage_bytes: number;
  directories: StorageDirectoryStats[];
  temp_reclaimable_files: number;
  temp_reclaimable_bytes: number;
  pdf_engine: string;
  max_upload_bytes: number;
  checked_at: string;
}

export interface IntegrityIssue {
  document_id: string;
  document_title: string;
  revision_id: string;
  operation: string;
  storage_path: string;
  issue_type: string;
  detail: string;
}

export interface IntegrityAuditReport {
  checked_documents: number;
  checked_revisions: number;
  verified_revisions: number;
  originals_intact: number;
  healthy: boolean;
  issues: IntegrityIssue[];
  checked_at: string;
}

export interface TempCleanupReport {
  removed_files: number;
  freed_bytes: number;
  removed_paths: string[];
  preserved_originals: number;
  preserved_revisions: number;
  cleaned_at: string;
}
