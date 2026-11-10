from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4
from pydantic import BaseModel, Field


class RevisionOperation(StrEnum):
    UPLOAD = "upload"
    ROTATE_PAGE = "rotate_page"
    REORDER = "reorder"
    DELETE_PAGES = "delete_pages"
    DUPLICATE_PAGE = "duplicate_page"
    EXTRACT_PAGES = "extract_pages"
    MERGE = "merge"
    SPLIT = "split"
    RESIZE_PAGES = "resize_pages"
    CROP_PAGES = "crop_pages"
    HEADER_FOOTER = "header_footer"
    ANNOTATE = "annotate"
    NATIVE_TEXT_EDIT = "native_text_edit"
    IMAGE_INSERT = "image_insert"
    IMAGE_REPLACE = "image_replace"
    IMAGE_DELETE = "image_delete"
    OCR_SEARCHABLE = "ocr_searchable"
    SCANNED_REGION_CORRECTION = "scanned_region_correction"
    SCANNED_RECONSTRUCTION = "scanned_reconstruction"
    TEMPLATE_RENDER = "template_render"
    FORM_FILL = "form_fill"
    FORM_FLATTEN = "form_flatten"
    FORM_FIELD_CREATE = "form_field_create"
    VISUAL_SIGNATURE_STAMP = "visual_signature_stamp"
    DIGITAL_SIGNATURE = "digital_signature"
    ENCRYPT = "encrypt"
    DECRYPT = "decrypt"
    REDACT = "redact"
    SANITIZE_METADATA = "sanitize_metadata"
    WATERMARK = "watermark"
    COMPRESS = "compress"
    BOOKMARKS_UPDATE = "bookmarks_update"
    AI_SUMMARY_COVER = "ai_summary_cover"
    AI_SUMMARY_REPORT = "ai_summary_report"
    EXPORT = "export"


class Revision(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    document_id: UUID
    parent_revision_id: UUID | None = None
    operation: str = RevisionOperation.UPLOAD
    storage_path: str
    sha256: str
    size_bytes: int
    page_count: int = 1
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class Document(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    title: str
    mime_type: str = "application/pdf"
    page_count: int = 1
    size_bytes: int = 0
    original_revision_id: UUID
    current_revision_id: UUID
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class DocumentDetail(BaseModel):
    document: Document
    revisions: list[Revision]


class PageRotateRequest(BaseModel):
    page_index: int = Field(ge=0, description="0-indexed page number to rotate")
    degrees: int = Field(description="Rotation degrees clockwise: 90, 180, 270")


class ReorderPagesRequest(BaseModel):
    new_order: list[int] = Field(
        min_length=1,
        description="0-based list of page indices in their desired order (e.g. [1, 0, 2])",
    )


class DeletePagesRequest(BaseModel):
    pages: list[int] = Field(
        min_length=1,
        description="0-based list of page indices to delete",
    )


class DuplicatePageRequest(BaseModel):
    page_index: int = Field(ge=0, description="0-based page index to duplicate")
    count: int = Field(default=1, ge=1, le=10, description="Number of copies to insert")


class ExtractPagesRequest(BaseModel):
    pages: list[int] = Field(
        min_length=1,
        description="0-based list of page indices to extract into a new document",
    )
    title: str | None = Field(default=None, description="Title for the newly created document")


class MergeDocumentsRequest(BaseModel):
    document_ids: list[UUID] = Field(
        min_length=2,
        description="List of document IDs to merge in sequential order",
    )
    title: str = Field(default="Merged.pdf", description="Title for the merged document")


class ResizePagesRequest(BaseModel):
    target_size: str = Field(
        default="A4",
        description="Standard paper size: A4, A3, Letter, Legal, Tabloid",
    )
    page_indices: list[int] | None = Field(
        default=None,
        description="0-based page indices to resize, or null/empty to apply to all pages",
    )
    scale_content: bool = Field(
        default=True,
        description="Whether to scale content proportionally to fit the new page dimensions",
    )


class CropPagesRequest(BaseModel):
    left: float = Field(default=0.0, ge=0.0, description="Crop left margin in points (1/72 inch)")
    top: float = Field(default=0.0, ge=0.0, description="Crop top margin in points")
    right: float = Field(default=0.0, ge=0.0, description="Crop right margin in points")
    bottom: float = Field(default=0.0, ge=0.0, description="Crop bottom margin in points")
    page_indices: list[int] | None = Field(
        default=None,
        description="0-based page indices to crop, or null/empty to apply to all pages",
    )


class HeaderFooterRequest(BaseModel):
    header_left: str | None = Field(default=None, description="Text for top-left header")
    header_center: str | None = Field(default=None, description="Text for top-center header")
    header_right: str | None = Field(default=None, description="Text for top-right header")
    footer_left: str | None = Field(default=None, description="Text for bottom-left footer")
    footer_center: str | None = Field(
        default="Page {page} of {total}",
        description="Text for bottom-center footer with dynamic tokens: {page}, {total}, {title}",
    )
    footer_right: str | None = Field(default=None, description="Text for bottom-right footer")
    font_size: float = Field(default=9.0, ge=6.0, le=24.0, description="Font size in points")
    font_color: str = Field(default="#333333", description="Hex color for text e.g. #333333")
    margin: float = Field(default=36.0, ge=10.0, le=100.0, description="Distance from page edge in points")
    skip_first_page: bool = Field(default=False, description="Whether to omit headers/footers on page 1")
    start_number: int = Field(default=1, ge=1, description="Starting page number for numbering")
    page_indices: list[int] | None = Field(
        default=None,
        description="0-based page indices to apply, or null/empty for all",
    )


class TextAnnotation(BaseModel):
    text: str = Field(description="Content of text annotation")
    x: float = Field(description="X coordinate in points from page left edge")
    y: float = Field(description="Y coordinate in points from page bottom edge")
    font_name: str = Field(default="Helvetica", description="Font name: Helvetica, Times-Roman, Courier")
    font_size: float = Field(default=12.0, ge=6.0, le=72.0)
    color: str = Field(default="#000000", description="Hex text color e.g. #000000")
    background_color: str | None = Field(default=None, description="Optional background color e.g. #ffffff")
    link_url: str | None = Field(default=None, description="Optional clickable hyperlink URL")


class ShapeAnnotation(BaseModel):
    type: str = Field(default="highlight", description="Shape type: highlight, rect, line")
    x: float = Field(description="X coordinate in points")
    y: float = Field(description="Y coordinate in points")
    width: float = Field(description="Width in points")
    height: float = Field(description="Height in points")
    color: str = Field(default="#fde047", description="Hex color")
    opacity: float = Field(default=0.4, ge=0.0, le=1.0)
    stroke_width: float = Field(default=1.0, ge=0.5, le=10.0)
    fill: bool = Field(default=True)


class ApplyAnnotationsRequest(BaseModel):
    page_index: int = Field(ge=0, description="0-based page index to annotate")
    texts: list[TextAnnotation] = Field(default_factory=list)
    shapes: list[ShapeAnnotation] = Field(default_factory=list)


class NativeTextEditRequest(BaseModel):
    page_index: int = Field(ge=0, description="0-based page index to edit")
    target_text: str = Field(min_length=1, description="Exact target text to replace in native stream")
    replacement_text: str = Field(description="Replacement text string")


class ImageInfo(BaseModel):
    name: str = Field(description="Internal XObject or image identifier")
    width: int = Field(description="Pixel width")
    height: int = Field(description="Pixel height")
    format: str = Field(description="Image format e.g. PNG, JPEG")
    size_bytes: int = Field(description="Raw compressed size in bytes")


class DeleteImageRequest(BaseModel):
    page_index: int = Field(ge=0, description="0-based page index")
    image_name: str = Field(min_length=1, description="Name or identifier of the image to remove")


class OcrWord(BaseModel):
    text: str
    bbox: tuple[float, float, float, float] = Field(description="Bounding box (x0, y0, x1, y1)")


class OcrBlock(BaseModel):
    block_no: int
    bbox: tuple[float, float, float, float] = Field(description="Bounding box (x0, y0, x1, y1)")
    text: str
    lines: list[str] = Field(default_factory=list)


class PageOcrResult(BaseModel):
    page_index: int
    has_native_text: bool
    is_scanned: bool
    extracted_text: str
    word_count: int
    words: list[OcrWord] = Field(default_factory=list)
    blocks: list[OcrBlock] = Field(default_factory=list)


class DocumentOcrInspection(BaseModel):
    total_pages: int
    scanned_pages: list[int]
    text_pages: list[int]


class ApplyOcrRequest(BaseModel):
    page_indices: list[int] | None = Field(
        default=None,
        description="0-based page indices to process with OCR, or null for all scanned pages",
    )
    language: str = Field(default="eng")
    dpi: int = Field(default=150, ge=72, le=300)


class ScannedRegionCorrectionRequest(BaseModel):
    page_index: int = Field(ge=0, description="0-based page index to correct")
    bbox: tuple[float, float, float, float] = Field(description="Bounding box [x0, y0, x1, y1] in points")
    replacement_text: str = Field(description="Text to place in the corrected region")
    font_name: str = Field(default="Helvetica", description="Font name: Helvetica, Times-Roman, Courier")
    font_size: float | None = Field(default=None, ge=4.0, le=72.0, description="Optional font size in points; auto-fit if None")
    text_color: str = Field(default="#000000", description="Hex color for replacement text e.g. #000000")
    background_color: str = Field(default="#FFFFFF", description="Hex color for background patch e.g. #FFFFFF")
    cleanup_raster: bool = Field(default=True, description="Whether to redact/clean raster image pixels beneath the bounding box")


class ScannedReconstructionRequest(BaseModel):
    page_indices: list[int] | None = Field(
        default=None,
        description="0-based page indices to reconstruct, or None for all scanned pages",
    )
    mode: str = Field(
        default="clean_vector",
        description="'clean_vector' (fresh vector page) or 'overlay_redact' (in-place raster patch)",
    )
    font_name: str = Field(default="Helvetica")
    language: str = Field(default="eng")
    dpi: int = Field(default=150, ge=72, le=300)
    create_new_document: bool = Field(
        default=False,
        description="If True, creates a new standalone document; if False, creates a child revision",
    )
    new_title: str | None = Field(default=None, description="Title if creating a new document")


class IngestionResult(BaseModel):
    document: Document
    revision: Revision


class TemplateVariable(BaseModel):
    key: str = Field(description="Unique variable identifier, e.g. client_name")
    label: str = Field(description="User-friendly display label, e.g. Client Name")
    default_value: str = Field(default="", description="Default or placeholder value")
    description: str = Field(default="", description="Helpful hint for user filling variable")


class TemplateElement(BaseModel):
    id: str = Field(default_factory=lambda: uuid4().hex[:8])
    type: str = Field(description="Element type: text, heading, rect, line, badge, table")
    x: float = Field(description="X coordinate from left margin in points")
    y: float = Field(description="Y coordinate from top margin in points")
    width: float = Field(description="Element width in points")
    height: float = Field(description="Element height in points")
    text: str | None = Field(default=None, description="Text content with optional {{token}} placeholders")
    font_name: str = Field(default="Helvetica", description="Helvetica, Helvetica-Bold, Times-Roman, Times-Bold, Courier, Courier-Bold")
    font_size: float = Field(default=12.0, ge=4.0, le=72.0)
    font_color: str = Field(default="#000000", description="Hex color for text e.g. #000000")
    align: str = Field(default="left", description="Alignment: left, center, right")
    fill_color: str | None = Field(default=None, description="Optional fill color for shapes e.g. #F3F4F6")
    stroke_color: str | None = Field(default=None, description="Optional border color e.g. #CBD5E1")
    stroke_width: float = Field(default=1.0, ge=0.0, le=10.0)
    border_radius: float = Field(default=0.0, ge=0.0, le=50.0)
    table_columns: list[str] = Field(default_factory=list, description="Column header titles")
    table_rows: list[list[str]] = Field(default_factory=list, description="Matrix of cell values with {{tokens}}")
    table_col_widths: list[float] = Field(default_factory=list, description="Column widths in points")


class PdfTemplate(BaseModel):
    id: str = Field(default_factory=lambda: uuid4().hex[:12])
    name: str = Field(description="Template name e.g. Corporate Tax Invoice")
    category: str = Field(default="custom", description="invoice, certificate, resume, letterhead, receipt, custom")
    description: str = Field(default="")
    page_size: str = Field(default="A4", description="A4 or LETTER")
    orientation: str = Field(default="portrait", description="portrait or landscape")
    elements: list[TemplateElement] = Field(default_factory=list)
    variables: list[TemplateVariable] = Field(default_factory=list)
    is_built_in: bool = Field(default=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class TemplateSummary(BaseModel):
    id: str
    name: str
    category: str
    description: str
    page_size: str
    orientation: str
    element_count: int
    variable_count: int
    is_built_in: bool


class RenderTemplateRequest(BaseModel):
    template_id: str | None = Field(default=None, description="ID of saved template to render")
    template: PdfTemplate | None = Field(default=None, description="Unsaved template schema draft to render")
    variables: dict[str, Any] = Field(default_factory=dict, description="Values for {{variables}} in template")
    title: str | None = Field(default=None, description="Custom document title when creating in catalog")


class FormField(BaseModel):
    name: str = Field(description="Unique field name/key in the AcroForm")
    field_type: str = Field(description="text, checkbox, radio, combobox, listbox, signature, button")
    value: Any = Field(default=None, description="Current field value")
    default_value: Any = Field(default=None, description="Default initial field value")
    page_index: int = Field(description="0-based page index containing this form field")
    rect: tuple[float, float, float, float] = Field(description="Bounding box [x0, y0, x1, y1] in PDF points")
    read_only: bool = Field(default=False)
    required: bool = Field(default=False)
    options: list[str] = Field(default_factory=list, description="Choice options for combobox/listbox")
    text_fontsize: float | None = Field(default=None)


class DocumentFormsInspection(BaseModel):
    total_fields: int
    has_form: bool
    fields: list[FormField] = Field(default_factory=list)


class FillFormRequest(BaseModel):
    values: dict[str, Any] = Field(description="Key-value mapping of field names to values")
    flatten: bool = Field(default=False, description="Whether to bake/flatten the form into static vector text")


class CreateFormFieldRequest(BaseModel):
    page_index: int = Field(ge=0, description="0-based page index where the widget will be placed")
    field_name: str = Field(min_length=1, description="Field name (e.g. employee_name)")
    field_type: str = Field(default="text", description="text, checkbox, combobox")
    rect: tuple[float, float, float, float] = Field(description="Bounding box [x0, y0, x1, y1] in PDF points")
    default_value: Any = Field(default=None, description="Initial default value")
    options: list[str] = Field(default_factory=list, description="Available options for dropdowns/comboboxes")
    read_only: bool = Field(default=False)
    font_size: float = Field(default=11.0, ge=6.0, le=72.0)


# --- Phase 11 Electronic & Digital Signature Models ---


class SavedSignature(BaseModel):
    id: str
    name: str
    image_data_url: str
    width: int
    height: int
    created_at: datetime


class SaveSignatureRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100, description="Display label for saved signature stamp")
    image_base64: str = Field(
        min_length=16,
        description="Base64 encoded PNG/JPEG/WEBP image (optionally prefixed with data:image/...;base64,)",
    )


class VisualSignatureStampRequest(BaseModel):
    page_index: int = Field(ge=0, description="0-based target page index")
    x: float = Field(ge=0.0, description="Bottom-left X coordinate in PDF points")
    y: float = Field(ge=0.0, description="Bottom-left Y coordinate in PDF points")
    width: float = Field(default=180.0, gt=0.0, le=2000.0, description="Stamp width in PDF points")
    height: float = Field(default=64.0, gt=0.0, le=2000.0, description="Stamp height in PDF points")
    saved_signature_id: str | None = Field(default=None, description="ID of reusable signature from local library")
    signature_image_base64: str | None = Field(
        default=None,
        description="Inline base64 PNG/JPEG graphic if not selecting from library",
    )
    signer_name: str | None = Field(default=None, max_length=120, description="Optional signer name caption")
    reason: str | None = Field(default=None, max_length=200, description="Optional reason caption")
    include_timestamp: bool = Field(default=True, description="Include local UTC timestamp caption under image")
    opacity: float = Field(default=1.0, ge=0.1, le=1.0, description="Visual overlay opacity")


class LocalCertificateInfo(BaseModel):
    id: str
    label: str
    common_name: str
    organization: str
    email: str
    serial_number: str
    fingerprint_sha256: str
    not_valid_before: datetime
    not_valid_after: datetime
    self_signed: bool = True
    created_at: datetime


class GenerateSelfSignedCertRequest(BaseModel):
    label: str = Field(min_length=1, max_length=100, description="Friendly profile label")
    common_name: str = Field(min_length=1, max_length=120, description="Signer Common Name (CN)")
    organization: str = Field(default="PDF Canvas Local", max_length=120)
    email: str = Field(default="signer@local.invalid", max_length=120)
    validity_days: int = Field(default=365, ge=1, le=3650)
    password: str = Field(min_length=4, max_length=128, description="Passphrase protecting the PKCS#12 private key")


class DigitalSignRequest(BaseModel):
    cert_id: str | None = Field(default=None, description="Stored local PKCS#12 certificate ID")
    pkcs12_base64: str | None = Field(default=None, description="Base64 encoded external .p12/.pfx certificate bundle")
    password: str = Field(min_length=1, max_length=128, description="Passphrase for unlocking PKCS#12 key")
    reason: str | None = Field(default="Document Approval", max_length=250)
    location: str | None = Field(default="Local Workstation", max_length=120)
    contact_info: str | None = Field(default=None, max_length=120)
    field_name: str | None = Field(default=None, max_length=64, description="Optional /Sig AcroForm field name")
    visible: bool = Field(default=True, description="Whether to render a visible cryptographic signature box")
    page_index: int = Field(default=0, ge=0, description="0-based page index when visible=True")
    rect: tuple[float, float, float, float] | None = Field(
        default=(36.0, 36.0, 260.0, 96.0),
        description="Bounding box [x0, y0, x1, y1] in PDF points from bottom-left when visible=True",
    )


class CryptographicSignatureStatus(BaseModel):
    field_name: str
    signer_name: str
    signer_subject: str
    issuer_subject: str
    self_signed: bool
    digest_intact: bool
    cryptographically_valid: bool
    trusted_ca: bool
    coverage: str
    modification_level: str
    signing_time: str | None = None
    reason: str | None = None
    location: str | None = None
    summary: str
    error: str | None = None


class DocumentSignaturesReport(BaseModel):
    document_id: str
    has_digital_signatures: bool
    digital_signature_count: int
    all_signatures_intact: bool
    signatures: list[CryptographicSignatureStatus] = Field(default_factory=list)
    architecture_note: str = (
        "Visual drawn/uploaded signature stamps are flat graphic overlays rendered onto the PDF page "
        "and provide no cryptographic tamper protection. Only PKCS#7 / PAdES signature entries listed "
        "above bind the document byte range to an X.509 certificate."
    )


# --- Phase 12 Security Models (Encryption, Redaction, Sanitization) ---


class PdfPermissionsConfig(BaseModel):
    allow_printing: bool = True
    allow_copying: bool = True
    allow_modifying: bool = False
    allow_annotations: bool = False


class EncryptPdfRequest(BaseModel):
    user_password: str = Field(default="", max_length=128, description="Password required to open/view PDF (optional if only locking permissions)")
    owner_password: str = Field(default="", max_length=128, description="Admin password required to change permissions or strip protection")
    permissions: PdfPermissionsConfig = Field(default_factory=PdfPermissionsConfig)


class DecryptPdfRequest(BaseModel):
    password: str = Field(min_length=1, max_length=128, description="User open password or owner permissions password")


class RedactionRegion(BaseModel):
    page_index: int = Field(ge=0, description="0-based page index")
    rect: tuple[float, float, float, float] = Field(description="Bounding box [x0, y0, x1, y1] in points")
    overlay_text: str = Field(default="[REDACTED]", max_length=80)
    fill_color: str = Field(default="#000000")
    text_color: str = Field(default="#FFFFFF")


class RedactPdfRequest(BaseModel):
    regions: list[RedactionRegion] = Field(default_factory=list, description="Explicit coordinate redaction boxes")
    search_terms: list[str] = Field(default_factory=list, description="Case/exact terms to search and permanently redact")
    case_sensitive: bool = Field(default=False)
    page_indices: list[int] | None = Field(default=None, description="Target 0-based pages for search_terms, or null for all pages")
    overlay_text: str = Field(default="[REDACTED]", max_length=80)
    fill_color: str = Field(default="#000000")
    text_color: str = Field(default="#FFFFFF")


class SanitizeMetadataRequest(BaseModel):
    strip_info_dict: bool = True
    strip_xmp_metadata: bool = True
    strip_embedded_files: bool = True
    strip_javascript: bool = True
    strip_thumbnails: bool = True
    strip_annotations: bool = False
    strip_links: bool = False
    strip_hidden_text: bool = False


class DocumentSecurityInspection(BaseModel):
    document_id: str
    is_encrypted: bool
    requires_open_password: bool
    encryption_scheme: str | None = None
    metadata: dict[str, str] = Field(default_factory=dict)
    metadata_field_count: int = 0
    has_xmp_metadata: bool = False
    xmp_bytes: int = 0
    embedded_files: list[str] = Field(default_factory=list)
    has_javascript_or_open_action: bool = False
    annotation_count: int = 0
    warnings: list[str] = Field(default_factory=list)


# --- Phase 13 Advanced Utilities (Watermark, Compression, Bookmarks, Diff, Batch) ---


class WatermarkRequest(BaseModel):
    text: str = Field(min_length=1, max_length=120, description="Watermark text e.g. CONFIDENTIAL")
    font_name: str = Field(default="Helvetica-Bold")
    font_size: float = Field(default=54.0, ge=10.0, le=160.0)
    color: str = Field(default="#64748b", description="Hex text color e.g. #dc2626")
    opacity: float = Field(default=0.22, ge=0.05, le=0.95)
    rotation: float = Field(default=45.0, ge=-90.0, le=90.0)
    position: str = Field(default="center", description="center, top, bottom, or tile")
    layer: str = Field(default="over", description="'over' (foreground) or 'under' (behind page content)")
    page_indices: list[int] | None = Field(default=None, description="0-based pages or null for all")


class CompressPdfRequest(BaseModel):
    mode: str = Field(
        default="lossless",
        description="'lossless' (deflate + stream dedup only), 'balanced' (120 DPI JPEG @78), or 'compact' (80 DPI JPEG @58)",
    )


class CompressionResult(BaseModel):
    document: Document
    revision: Revision
    original_bytes: int
    compressed_bytes: int
    saved_bytes: int
    reduction_percent: float
    mode: str


class BookmarkItem(BaseModel):
    level: int = Field(ge=1, le=6, description="Hierarchy depth starting at 1")
    title: str = Field(min_length=1, max_length=200)
    page_index: int = Field(ge=0, description="0-based target page index")


class DocumentBookmarks(BaseModel):
    document_id: str
    total_pages: int
    bookmarks: list[BookmarkItem] = Field(default_factory=list)


class UpdateBookmarksRequest(BaseModel):
    bookmarks: list[BookmarkItem] = Field(default_factory=list)


class CompareDocumentsRequest(BaseModel):
    document_a_id: UUID
    revision_a_id: UUID | None = None
    document_b_id: UUID
    revision_b_id: UUID | None = None
    max_pages: int = Field(default=25, ge=1, le=100)


class PageDiffSummary(BaseModel):
    page_index: int
    text_changed: bool
    text_similarity: float
    added_lines: int
    removed_lines: int
    diff_lines: list[str] = Field(default_factory=list)
    visual_diff_percent: float
    visual_changed: bool


class DocumentComparisonReport(BaseModel):
    document_a_id: str
    document_b_id: str
    document_a_title: str
    document_b_title: str
    pages_a: int
    pages_b: int
    pages_compared: int
    identical_pages: int
    changed_pages: int
    page_diffs: list[PageDiffSummary] = Field(default_factory=list)


class BatchUtilityRequest(BaseModel):
    document_ids: list[UUID] = Field(min_length=1, max_length=50)
    action: str = Field(description="'watermark', 'compress', or 'sanitize'")
    watermark: WatermarkRequest | None = None
    compress: CompressPdfRequest | None = None
    sanitize: SanitizeMetadataRequest | None = None


class BatchDocumentResult(BaseModel):
    document_id: str
    title: str
    success: bool
    new_revision_id: str | None = None
    error: str | None = None


class BatchUtilityResponse(BaseModel):
    action: str
    total: int
    succeeded: int
    failed: int
    results: list[BatchDocumentResult] = Field(default_factory=list)


# --- Phase 14 AI Assistant Models (Euri API + Local Ollama) ---


class AIConfigPublic(BaseModel):
    provider: str = Field(default="euri", description="'euri' (Euron HTTPS API) or 'ollama' (127.0.0.1 local)")
    euri_base_url: str
    euri_model: str
    ollama_base_url: str
    ollama_model: str
    has_api_key: bool
    api_key_hint: str | None = None
    api_key_source: str = Field(default="none", description="'none', 'env', or 'local_config'")
    token_budget: int = Field(default=300000, ge=1000)
    total_prompt_tokens: int = 0
    total_completion_tokens: int = 0
    total_tokens_used: int = 0
    privacy_notice: str


class UpdateAIConfigRequest(BaseModel):
    provider: str | None = Field(default=None, description="'euri' or 'ollama'")
    euri_base_url: str | None = None
    euri_model: str | None = None
    ollama_base_url: str | None = None
    ollama_model: str | None = None
    api_key: str | None = Field(default=None, description="Optional Euri API key saved locally (never echoed back)")
    token_budget: int | None = Field(default=None, ge=1000, le=50000000)


class AITestConnectionResult(BaseModel):
    ok: bool
    provider: str
    model: str
    latency_ms: int
    message: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class AIContextPreview(BaseModel):
    document_id: str
    total_pages: int
    included_pages: list[int]
    char_count: int
    estimated_tokens: int
    truncated: bool
    has_selectable_text: bool


class AIChatMessage(BaseModel):
    role: str = Field(description="'user' or 'assistant'")
    content: str = Field(min_length=1, max_length=16000)


class AISummarizeRequest(BaseModel):
    style: str = Field(
        default="executive",
        description="'executive', 'bullet_points', 'action_items', or 'detailed'",
    )
    page_indices: list[int] | None = Field(default=None, description="0-based pages to analyze or null for auto/all")
    custom_focus: str | None = Field(default=None, max_length=500)
    max_context_chars: int = Field(default=36000, ge=1000, le=120000)


class AIAskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    history: list[AIChatMessage] = Field(default_factory=list, max_length=20)
    page_indices: list[int] | None = Field(default=None, description="0-based pages or null for auto/all")
    max_context_chars: int = Field(default=36000, ge=1000, le=120000)


class AIExtractRequest(BaseModel):
    fields: list[str] = Field(
        default_factory=lambda: ["title", "dates", "parties", "monetary_amounts", "key_obligations"],
        min_length=1,
        max_length=25,
    )
    page_indices: list[int] | None = Field(default=None)
    instructions: str | None = Field(default=None, max_length=500)
    max_context_chars: int = Field(default=36000, ge=1000, le=120000)


class AIAnalysisResponse(BaseModel):
    document_id: str
    provider: str
    model: str
    pages_analyzed: list[int]
    truncated: bool
    answer: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class AIStructuredExtractionResponse(BaseModel):
    document_id: str
    provider: str
    model: str
    pages_analyzed: list[int]
    truncated: bool
    extracted_json: dict[str, Any]
    raw_text: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class SaveAISummaryPdfRequest(BaseModel):
    heading: str = Field(default="AI Document Summary", min_length=1, max_length=150)
    content: str = Field(min_length=1, max_length=60000)
    model_used: str = Field(default="gpt-5.3-instant", max_length=120)
    mode: str = Field(
        default="new_document",
        description="'new_document' (standalone catalog PDF) or 'prepend_cover_page' (child revision cover page)",
    )
    title: str | None = Field(default=None, max_length=150)


# --- Phase 15 Enterprise Reliability, Diagnostics & Storage Integrity Models ---


class StorageDirectoryStats(BaseModel):
    name: str
    file_count: int
    total_bytes: int


class SystemDiagnosticsReport(BaseModel):
    status: str = Field(description="'healthy' or 'degraded'")
    sqlite_integrity_ok: bool
    sqlite_journal_mode: str
    sqlite_db_bytes: int
    document_count: int
    revision_count: int
    total_storage_bytes: int
    directories: list[StorageDirectoryStats] = Field(default_factory=list)
    temp_reclaimable_files: int
    temp_reclaimable_bytes: int
    pdf_engine: str = "pypdf + PyMuPDF + pypdfium2 + ReportLab"
    max_upload_bytes: int
    checked_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class IntegrityIssue(BaseModel):
    document_id: str
    document_title: str
    revision_id: str
    operation: str
    storage_path: str
    issue_type: str = Field(description="'missing_file', 'sha256_mismatch', 'size_mismatch', or 'path_error'")
    detail: str


class IntegrityAuditReport(BaseModel):
    checked_documents: int
    checked_revisions: int
    verified_revisions: int
    originals_intact: int
    healthy: bool
    issues: list[IntegrityIssue] = Field(default_factory=list)
    checked_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class TempCleanupReport(BaseModel):
    removed_files: int
    freed_bytes: int
    removed_paths: list[str] = Field(default_factory=list)
    preserved_originals: int
    preserved_revisions: int
    cleaned_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
