# Phased Development Backlog & Feature Tracker

## Phase Status Summary

- **Phase 1: Foundation (Dashboard, Preview, Storage, Revisions, Export, Rotate)** — **COMPLETE**
- **Phase 2: Page Operations (Merge, Split, Extract, Duplicate, Delete, Reorder, Rotate)** — **COMPLETE**
- **Phase 3: Page Formatting (A4/Letter/A3/Legal, Crop, Margins, Headers & Footers)** — **COMPLETE**
- **Phase 4: PDF Content Editing (Text overlays, Shapes, Annotations, Native text)** — **COMPLETE**
- **Phase 5: Image Editing (Insert, Crop, Scale, Rotate, Replace, Extract)** — **COMPLETE**
- **Phase 6: PDF Conversion (Word/Excel/PPT to PDF, PDF to Image/Word)** — **COMPLETE**
- **Phase 7: Local OCR (Tesseract / Embedded C++ OCR, Searchable text layer)** — **COMPLETE**
- **Phase 8: Advanced Scanned-Document Layout Correction (Region patching & Document reconstruction)** — **COMPLETE**
- **Phase 9: Template Studio (Vector synthesis, Reusable JSON schema, Invoices & Certificates)** — **COMPLETE**
- **Phase 10: PDF Forms (AcroForms inspect, fill, flatten, and field placement)** — **COMPLETE**
- **Phase 11: Electronic & Digital Signatures (Draw, Stamp, PKCS#12, Verification)** — **COMPLETE**
- **Phase 12: Security (Password encryption, True permanent redaction, Sanitization)** — **COMPLETE**
- **Phase 13: Advanced Utilities (Watermarks, Compression, Bookmarks, Document Diff & Batch)** — **COMPLETE**
- **Phase 14: AI Document Assistant (Euri API `gpt-5.3-instant` BYOK + Optional Offline Ollama)** — **COMPLETE**
- **Phase 15: Enterprise Reliability & Large-File Optimization** — **COMPLETE**

---

## Detailed Phase 1 Checklist (Complete)

- [x] Architectural documentation updated for 100% local development without cloud services.
- [x] Local storage directory structure defined (`local_data/originals`, `local_data/working`, etc.).
- [x] Typed `PdfEngine` protocol and `PyPdfEngine` implementation with pypdf (permissive BSD license).
- [x] Embedded SQLite repository (`local_data/app.db`) for documents and revisions metadata.
- [x] Safe local immutable storage adapter with atomic writes and SHA-256 validation.
- [x] FastAPI REST endpoints: upload, list, detail, content streaming, rotate, export, delete.
- [x] React + Vite + TypeScript frontend with PDF.js preview, zoom, and revision history drawer.
- [x] Automated test suite verifying validation, invariants, and SQLite persistence.

---

## Detailed Phase 2 Checklist (Complete)

- [x] **Page Reordering**:
  - `PyPdfEngine.reorder_pages` atomic execution with permutation validation.
  - `POST /api/documents/{id}/reorder` creating child revision.
  - Per-page Move Up / Move Down buttons on thumbnail strip and keyboard flow.
- [x] **Page Deletion**:
  - `PyPdfEngine.delete_pages` with protection ensuring at least 1 page remains.
  - `POST /api/documents/{id}/delete-pages` creating child revision.
  - Trash button on thumbnail cards and top page toolbar with confirmation prompt.
- [x] **Page Duplication**:
  - `PyPdfEngine.duplicate_page` inserting exact duplicate pages directly following target.
  - `POST /api/documents/{id}/duplicate-page` creating child revision.
  - Copy button on thumbnail cards and top page toolbar.
- [x] **Page Extraction**:
  - `PyPdfEngine.extract_pages` creating standalone PDF from arbitrary page selections.
  - `POST /api/documents/{id}/extract-pages` creating a new standalone Document in local SQLite catalog.
  - Interactive `ExtractModal` allowing multi-page picking and custom title.
- [x] **Document Merge**:
  - `PyPdfEngine.merge_documents` combining 2+ documents in user-specified sequence.
  - `POST /api/documents/merge` creating a new standalone Document in local SQLite catalog.
  - Interactive `MergeModal` on Dashboard with drag/arrow ordering and merge execution.
- [x] **Page Rotation (Both Clockwise & Counter-Clockwise)**:
  - 90° CW and 270° CCW page rotation controls in editor toolbar and thumbnails.
- [x] **Automated Test Coverage**:
  - 16 passing pytest tests verifying all page operations, boundaries, rejection of empty documents, and byte-level original file immutability.

---

## Detailed Phase 3 Checklist (Complete)

- [x] **Page Resizing & Normalization**:
  - Supported standard sizes: A4 (210 x 297 mm), Letter (8.5 x 11 in), A3 (297 x 420 mm), Legal (8.5 x 14 in), Tabloid (11 x 17 in).
  - Proportional content scaling (`scale_to`) and canvas expansion modes.
  - Configurable scope: all pages or target page.
  - `POST /api/documents/{id}/resize` endpoint creating child revision.
- [x] **Page Crop & Margins**:
  - Directional crop margins in points (left, right, top, bottom).
  - Validation ensuring crop margins never exceed page dimensions.
  - Configurable scope: current page or all pages.
  - `POST /api/documents/{id}/crop` endpoint creating child revision.
- [x] **Headers, Footers & Dynamic Page Numbering**:
  - Multi-position text layout: Header Left, Center, Right; Footer Left, Center, Right.
  - Dynamic template token expansion: `{page}`, `{total}`, `{title}`.
  - In-memory vector overlay rendering using ReportLab (BSD license) merged via `pypdf`.
  - Configurable font size, color, margin from edge, and optional skip for cover page.
  - `POST /api/documents/{id}/header-footer` endpoint creating child revision.
- [x] **Frontend Page Formatting Modal**:
  - Tabbed interface in `frontend/src/components/PageFormattingModal.tsx` for Resize, Crop, and Header/Footer.
  - Integrated into `EditorPage` toolbar via the "Format" tool button.
- [x] **Automated Testing Suite**:
  - 20 comprehensive passing pytest tests verifying resize dimension accuracy, cropbox boundary validation, and dynamic page numbering overlay generation while guaranteeing original file immutability.

---

## Detailed Phase 4 Checklist (Complete)

- [x] **Strict Separation of Overlays vs. Native Text Editing (`AGENTS.md`)**:
  - Dedicated architecture models and distinct endpoints separating ReportLab vector overlays from native content-stream replacements.
  - Transparent user disclaimer and technical documentation explaining glyph ID mappings, subset font limitations, and safe stream editing.
- [x] **Vector Text & Shape Overlays**:
  - Dynamic overlay synthesis using ReportLab: custom coordinates (pt), typography (`Helvetica`, `Times-Roman`, `Courier`), sizes, hex colors.
  - Interactive clickable hyperlinks using PDF annotation links (`canv.linkURL`).
  - Semi-transparent highlight boxes (`setFillAlpha`), stroke rectangle frames, and horizontal separator lines.
  - `POST /api/documents/{id}/annotate` creating an auditable child revision.
- [x] **Native Content Stream Text Replacement**:
  - Direct decompress and decode of page `/Contents` stream objects.
  - Exact token replacement preserving binary stream integrity.
  - Error reporting with guidance when target string is not located in the decodable text stream.
  - `POST /api/documents/{id}/native-text-edit` creating an auditable child revision.
- [x] **Frontend Content & Annotation Suite**:
  - Two-mode tabbed modal in `frontend/src/components/ContentEditorModal.tsx`.
  - Color pickers, opacity sliders, font pickers, and coordinate inputs.
  - Integrated into `EditorPage` top navigation bar via "Annotate".
- [x] **Automated Test Coverage**:
  - 23 passing pytest tests verifying overlay application, hyperlinks, native token replacement, and original file immutability.

---

## Detailed Phase 5 Checklist (Complete)

- [x] **Image Placement & Stamping**:
  - Pillow-backed validation defending against corrupted files, invalid formats, and decompression bombs (`MAX_IMAGE_PIXELS`).
  - Position coordinates `(X, Y)` in PDF points from origin.
  - Proportional scaling, locked aspect ratio calculation, custom width and height.
  - Arbitrary degree rotation (0°, 90°, 180°, 270°) around center of bounding box.
  - Semi-transparent opacity controls (`setFillAlpha`, `setStrokeAlpha`).
  - Lossless ReportLab canvas overlay synthesis merged via `pypdf`.
  - `POST /api/documents/{id}/insert-image` creating an auditable child revision (`RevisionOperation.IMAGE_INSERT`).
- [x] **Page Image Inspection & Extraction**:
  - `GET /api/documents/{id}/pages/{page_index}/images` returning structured raster metadata (`ImageInfo`: name, pixel dimensions, format, byte size).
  - `GET /api/documents/{id}/pages/{page_index}/images/{image_name}` streaming raw image payload with inline download headers.
- [x] **In-Place Image Stream Replacement**:
  - `POST /api/documents/{id}/replace-image` replaces embedded XObject image streams in-place.
  - Updates PDF `/Filter` (`/DCTDecode`), `/Width`, `/Height`, `/ColorSpace`, `/BitsPerComponent` while preserving document geometry and page layout.
  - Creates an auditable child revision (`RevisionOperation.IMAGE_REPLACE`).
- [x] **Image Deletion & Content Stream Sanitization**:
  - `POST /api/documents/{id}/delete-image` removes image XObject references and strips `/{image_name} Do` invocation from the decompressed `/Contents` stream.
  - Creates an auditable child revision (`RevisionOperation.IMAGE_DELETE`).
- [x] **Frontend Image Editing Suite**:
  - Tabbed modal `ImageEditorModal.tsx` for "Insert New Image" and "Embedded Page Images".
  - Live upload preview, resolution detector, position presets (Center, Top-Left, Bottom-Right), rotation, and opacity slider.
  - Visual cards for all existing embedded images on page with thumbnail preview, Download, Replace, and Delete actions.
  - Integrated into top editor navigation toolbar via "Images" button.
- [x] **Automated Test Suite**:
  - 28 passing pytest tests verifying insertion, listing, extraction, in-place replacement, stream deletion, corrupted file rejection, and byte-level original file immutability.

---

## Detailed Phase 6 Checklist (Complete)

- [x] **Typed Conversion Protocol & Modular Architecture**:
  - `ConversionEngine` protocol defined in `backend/app/engines/conversion_engine.py` decoupling all conversion mechanisms behind typed interfaces (`AGENTS.md`).
  - `LocalConversionEngine` implementation combining `pypdfium2` (permissive Apache-2.0 / BSD), `Pillow`, `ReportLab`, and local headless `LibreOffice`.
- [x] **Images to PDF Conversion**:
  - Multi-image ingestion with drag-and-drop sequencing and reordering.
  - Proportional scaling, locked margins, and EXIF orientation normalization.
  - Standard paper dimension templates (A4, Letter) or native image canvas dimensions.
  - `POST /api/convert/images-to-pdf` creating an immutable document and original revision.
- [x] **Text & Markdown to PDF Conversion**:
  - Direct conversion of raw text or `.txt` / `.md` file payloads into clean, paginated PDF documents with Helvetica typography and margin wrapping.
  - `POST /api/convert/text-to-pdf` endpoint with custom document title support.
- [x] **Local Headless Office Conversion Bridge**:
  - System discovery for local LibreOffice (`soffice.exe`) across PATH and standard Windows program directories.
  - Isolated subprocess execution (`--headless --convert-to pdf`) with execution timeouts and temporary directory staging.
  - Informative dependency diagnostics via `GET /api/convert/status` and `503 Service Unavailable` with installation command (`winget install LibreOffice.LibreOffice`) when LibreOffice is not installed.
  - `POST /api/convert/office-to-pdf` endpoint.
- [x] **PDF to Raster Images & ZIP Packaging**:
  - High-performance, high-DPI rasterization using `pypdfium2` without requiring system Poppler binaries.
  - `GET /api/convert/documents/{id}/render-page/{page_index}` for inline page previews (PNG/JPEG).
  - `GET /api/convert/documents/{id}/export-images` packaging all or selected pages into a compressed ZIP file with customizable DPI (72, 150, 216, 288 DPI).
- [x] **Frontend Conversion UI Suite**:
  - `ConvertModal.tsx` on Dashboard with tabs for Images to PDF, Office to PDF, and Text to PDF.
  - `ExportImagesModal.tsx` in Editor toolbar ("To Images") enabling single-page image export or multi-page ZIP downloads.
- [x] **Automated Test Coverage**:
  - 6 dedicated pytest tests in `backend/tests/test_conversion.py` verifying status reporting, image-to-PDF compilation, text-to-PDF layout, page rasterization to PNG/JPEG, ZIP archive compression, and graceful handling of missing LibreOffice.

---

## Detailed Phase 7 Checklist (Complete)

- [x] **Typed OCR Protocol & Embedded Offline Engine**:
  - `OcrEngine` protocol defined in `backend/app/engines/ocr_engine.py` decoupling all OCR functionality behind typed interfaces (`AGENTS.md`).
  - `LocalOcrEngine` implementation using PyMuPDF's embedded C++ Tesseract engine with local `local_data/tessdata/eng.traineddata`.
  - Zero external cloud APIs, zero global administrator installations, and 100% offline local execution.
- [x] **Scanned-Page Diagnostic Inspection**:
  - `GET /api/ocr/documents/{id}/inspect` analyzes all pages to identify raster-heavy or scanned pages (< 25 native text characters).
  - Reports scanned status, character counts, image counts, and dimensions per page.
- [x] **Text Recognition & Bounding Box Tokenization**:
  - `GET /api/ocr/documents/{id}/pages/{page_index}/recognize` performs optical character recognition on target page.
  - Returns raw recognized text along with word-level bounding boxes `[x0, y0, x1, y1]` and confidence scores.
- [x] **Searchable PDF Generation (`render_mode=3`)**:
  - `POST /api/ocr/documents/{id}/apply-searchable-layer` synthesizes an invisible text layer overlay stamped precisely onto scanned pages.
  - Text is selectable, searchable via `Ctrl+F`, and copyable while preserving the original visual scan unchanged.
  - Creates an auditable child revision (`RevisionOperation.OCR_SEARCHABLE`) preserving DAG lineage.
- [x] **Frontend OCR Studio**:
  - `OcrModal.tsx` in `frontend/src/components/OcrModal.tsx` integrated into `EditorPage.tsx` via the "OCR" toolbar button.
  - Features scanned-page diagnostic banner, extracted text view, search/filter input, copy-to-clipboard button, and one-click "Make Document Searchable" action.
- [x] **Automated Test Coverage**:
  - 4 dedicated pytest tests in `backend/tests/test_ocr.py` verifying OCR service status, scanned page detection, text extraction with word tokens, child revision creation, and byte-level original immutability (33/33 tests passing project-wide).

---

## Detailed Phase 8 Checklist (Complete)

- [x] **Strict Architectural Compliance (`AGENTS.md`)**:
  - Scanned text correction is explicitly distinguished from native vector text editing.
  - Implements raster background inpainting/redaction and vector typography overlays without corrupting embedded font programs.
  - Guarantees byte-level original file immutability and generates child revisions with `RevisionOperation.SCANNED_REGION_CORRECTION` and `RevisionOperation.SCANNED_RECONSTRUCTION`.
- [x] **Scanned Region Correction Engine**:
  - `LocalOcrEngine.correct_scanned_region` supports bounds-checked bounding boxes `[x0, y0, x1, y1]`.
  - Underlying raster image pixel cleaning/redaction via PyMuPDF redaction engine (`add_redact_annot` + `apply_redactions`) preventing ghost pixels from bleeding through.
  - Multi-font vector rendering (`Helvetica`, `Helvetica-Bold`, `Times-Roman`, `Times-Bold`, `Courier`, `Courier-Bold`) with iterative auto-fit font size scaling and custom hex text/background colors.
  - `POST /api/ocr/documents/{document_id}/correct-scanned-region` endpoint.
- [x] **Document Layout Reconstruction**:
  - `LocalOcrEngine.reconstruct_scanned_page` reconstructs scanned pages into editable clean vector layouts.
  - Mode 1: `clean_vector` creates a pristine white page with all detected OCR blocks typeset with crisp vector fonts (eliminating background scan noise completely).
  - Mode 2: `overlay_redact` performs in-place redaction and vector typography overlay on the existing document page.
  - Option to create a child revision on the current document OR spawn a brand new standalone document in the catalog (`create_new_document=True`).
  - `POST /api/ocr/documents/{document_id}/reconstruct` endpoint.
- [x] **Frontend Scanned Document Correction Studio**:
  - Enhanced `OcrModal.tsx` with a 3-tab workflow: "Searchable Layer", "Scanned Region Correction", and "Page Reconstruction".
  - Interactive token cloud allowing one-click auto-fill of bounding boxes and text from OCR results.
  - Full typography controls (Font family, auto-fit or custom pt size, text color picker, background patch color picker, raster cleaning toggle).
  - Clear user-facing architectural notices distinguishing raster patching from native PDF stream editing.
- [x] **Automated Test Coverage**:
  - 8 dedicated pytest tests in `backend/tests/test_ocr.py` verifying region correction, underlying pixel redaction, invalid bounding box rejection, clean vector reconstruction, standalone document creation, and source file immutability (37/37 tests passing project-wide).

---

## Detailed Phase 9 Checklist (Complete)

- [x] **Typed Template Engine Protocol & Storage (`AGENTS.md`)**:
  - `TemplateEngine` protocol defined in `backend/app/engines/template_engine.py` decoupling template operations behind typed interfaces.
  - `LocalTemplateEngine` implementation synthesizing vector-sharp PDFs using ReportLab (BSD license).
  - Versioned JSON schema persistence in local directory `local_data/templates/` with read-only protection for built-in templates.
- [x] **Pre-Built Professional Templates**:
  - **Tax Invoice (`invoice_modern`)**: Corporate layout with header bar, invoice details, billed-to card, dynamic line items table with zebra striping, subtotal/tax/totals, and terms.
  - **Certificate of Achievement (`certificate_classic`)**: Formal landscape layout with gold/navy dual borders, honoris badge, recipient name, course description, and instructor signature line.
  - **Executive Resume (`resume_modern`)**: Modern dark header card, executive summary, work experience timeline, education, and technical competency badges.
  - **Corporate Formal Letterhead (`letterhead_minimal`)**: Corporate header bar, metadata, recipient info, body paragraphs, and professional signature block.
- [x] **Dynamic Token Interpolation & Vector Synthesis**:
  - Safe placeholder interpolation replacing `{{token}}` and `{token}` variables.
  - ReportLab `Paragraph` and `Table` integration with automatic text wrapping, line spacing (`leading`), and styling.
  - Generates immutable original documents in catalog with `RevisionOperation.TEMPLATE_RENDER` and SHA-256 verification.
- [x] **FastAPI REST Endpoints**:
  - `GET /api/templates`: List all template summaries.
  - `GET /api/templates/{id}`: Retrieve full template definition and variables.
  - `POST /api/templates`: Save custom user template.
  - `PUT /api/templates/{id}`: Update custom template.
  - `DELETE /api/templates/{id}`: Delete custom template.
  - `POST /api/templates/{id}/render`: Render template with variables and register as a document in catalog.
  - `POST /api/templates/preview`: Stream in-memory rendered PDF for live visual preview.
- [x] **Frontend Template Studio**:
  - `TemplateStudioModal.tsx` integrated into `DashboardPage.tsx` with category filters (Invoices, Certificates, Resumes, Letterheads, Custom).
  - Two-column live studio: variable inputs on the left with debounced updates, real-time PDF iframe preview on the right.
  - Direct catalog creation ("Create Document & Open in Editor") and one-click PDF download.
- [x] **Automated Test Coverage**:
  - 7 dedicated pytest tests in `backend/tests/test_templates.py` verifying template listing, retrieval, custom template lifecycle, built-in template protection, catalog document creation, and live preview streaming (44/44 tests passing project-wide).

---

## Detailed Phase 10 Checklist (Complete)

- [x] **Typed AcroForm Protocol & PyMuPDF Engine (`AGENTS.md`)**:
  - `FormEngine` protocol defined in `backend/app/engines/form_engine.py` decoupling form inspections, field filling, flattening, and additions.
  - `LocalFormEngine` implementation utilizing PyMuPDF `fitz.Widget` and `doc.bake()`.
  - Zero external cloud services, 100% offline local execution, and byte-level original source immutability.
- [x] **Form Field Inspection**:
  - `GET /api/documents/{id}/forms` analyzes all pages to discover fillable AcroForm widgets.
  - Returns structured `FormField` objects: field name, field type (`text`, `checkbox`, `combobox`, `radio`, `listbox`, `signature`), current value, default value, bounding box coordinates, page index, read-only flag, and dropdown choice options.
- [x] **Form Value Filling**:
  - `POST /api/documents/{id}/forms/fill` updates AcroForm field values with automatic type coercion (handling booleans for checkboxes and strings for text/comboboxes).
  - Updates widget appearances in accordance with ISO 32000-1 specifications.
  - Creates an auditable child revision (`RevisionOperation.FORM_FILL`).
- [x] **Form Flattening (`doc.bake()`)**:
  - `POST /api/documents/{id}/forms/flatten` bakes interactive form fields into permanent static vector content streams.
  - Interactive annotations and the `/AcroForm` catalog dictionary are cleanly removed to prevent post-signature/archival tampering.
  - Creates an auditable child revision (`RevisionOperation.FORM_FLATTEN`).
- [x] **Interactive Field Placement**:
  - `POST /api/documents/{id}/forms/fields` allows stamping new fillable fields (Text, Checkbox, Dropdown/Combobox) onto any page at custom bounding coordinates.
  - Supports initial values, read-only flags, custom font sizes, and dropdown choices.
  - Creates an auditable child revision (`RevisionOperation.FORM_FIELD_CREATE`).
- [x] **Frontend Interactive Form Studio**:
  - `FormEditorModal.tsx` integrated into `EditorPage.tsx` via the "Forms" toolbar button.
  - Tab 1 ("Fill Form Fields"): Interactive dynamic form inputs (text inputs, checkbox toggles, dropdown select boxes) with page location badges, field saving, and one-click flattening action.
  - Tab 2 ("Add Form Field"): Placement studio for adding new fillable text, checkbox, and combobox widgets at custom coordinates.
- [x] **Automated Test Coverage**:
  - 4 dedicated pytest tests in `backend/tests/test_forms.py` verifying inspection of empty documents, adding text/checkbox/combobox widgets, filling form fields, form flattening with permanent text persistence, invalid bounding box rejection, and source file immutability (48/48 tests passing project-wide).

---

## Detailed Phase 11 Checklist (Complete)

- [x] **Typed Signature Engine Protocol & Separation of Concerns (`AGENTS.md`)**:
  - `SignatureEngine` protocol defined in `backend/app/engines/signature_engine.py` decoupling visual electronic stamps, reusable graphic storage, local certificate profiles, cryptographic signing, and verification behind typed interfaces.
  - Explicitly distinguishes **Visual Electronic Signature Stamps** (transparent PNG graphic overlays) from **Cryptographic PKCS#7 / PAdES Digital Signatures** in API contracts, verification reports, and frontend warnings.
- [x] **Local Saved Signatures & Visual Electronic Stamp Overlays**:
  - Local signature library stored in `local_data/signatures/` with strict ID regex validation, path-traversal prevention, Pillow decompression bomb defense (`MAX_IMAGE_PIXELS`), and RGBA PNG normalization.
  - `GET/POST/DELETE /api/signatures/library` endpoints for managing reusable drawn/uploaded signatures.
  - `POST /api/signatures/documents/{id}/visual-stamp` renders transparent PNG graphic + optional signer name, reason, and UTC timestamp caption via ReportLab onto target PDF pages, creating a child revision (`RevisionOperation.VISUAL_SIGNATURE_STAMP`).
- [x] **Local X.509 / PKCS#12 Self-Signed Certificate Store**:
  - Offline RSA-2048 X.509 v3 certificate generation (`cryptography`) stored as passphrase-encrypted PKCS#12 bundles in `local_data/certs/` without ever persisting private key passphrases.
  - `GET/POST/DELETE /api/signatures/certs` and `/certs/self-signed` endpoints.
- [x] **Cryptographic PKCS#7 / PAdES Digital Signing & Multi-Signature Incremental Updates (`pyhanko`)**:
  - `POST /api/signatures/documents/{id}/digital-sign` supports both stored local `.p12` profiles and inline uploaded `.p12`/`.pfx` bundles (`pkcs12_base64`).
  - Uses `IncrementalPdfFileWriter` with optional visible `/Sig` widget annotations (`TextStampStyle`) so sequential countersignatures preserve prior signature integrity and byte ranges (`RevisionOperation.DIGITAL_SIGNATURE`).
- [x] **Offline Cryptographic Verification & Tamper Detection**:
  - `GET /api/signatures/documents/{id}/verify` inspects all embedded PKCS#7 `/Sig` dictionaries offline via `pyhanko.sign.validation`.
  - Accurately verifies SHA-256 byte-range digests (`digest_intact`), cryptographic RSA validity (`cryptographically_valid`), honest self-signed CA status (`self_signed=True`, `trusted_ca=False`), modification level, and document tampering detection.
- [x] **Frontend Signature Studio (`SignatureModal.tsx`)**:
  - Integrated into `EditorPage.tsx` via the "Sign" toolbar button.
  - 3-tab workflow: HTML5 Canvas ink signature pad + image upload + local library ("Visual Stamp"), local certificate wizard + PKCS#12 cryptographic signer ("Certificate Digital Sign"), and live signature verification dashboard ("Verify Signatures").
- [x] **Automated Test Coverage**:
  - 4 dedicated pytest tests in `backend/tests/test_signatures.py` verifying signature image validation, path traversal rejection, visual stamp child revisions, PKCS#12 generation, wrong-passphrase handling (`400`), multi-signature incremental signing, byte-flip tamper detection, temp credential cleanup, and original file SHA-256 immutability (52/52 tests passing project-wide).

---

## Detailed Phase 12 Checklist (Complete)

- [x] **Typed Security Engine Protocol (`AGENTS.md`)**:
  - `SecurityEngine` protocol defined in `backend/app/engines/security_engine.py` with `LocalSecurityEngine` using `pypdf` 7.0.0 (BSD-3-Clause AES-256 encryption) and `PyMuPDF` (irreversible stream redaction & privacy scrubbing).
  - Never treats visual overlays as redactions, and preserves uploaded originals as immutable files.
- [x] **AES-256 Encryption, Owner Permissions & Decryption**:
  - `POST /api/security/documents/{id}/encrypt` applies PDF 2.0 / ISO 32000-2 AES-256 encryption (`algorithm="AES-256"`) with separate optional `user_password` (open lock) and `owner_password` (admin permissions lock) plus granular permission flags (`allow_printing`, `allow_copying`, `allow_modifying`, `allow_annotations`).
  - `POST /api/security/documents/{id}/decrypt` verifies passwords strictly (requiring `OWNER_PASSWORD` to remove owner permissions locks), creating an unencrypted child revision.
  - Enhanced `DocumentService._apply_mutation` so encrypted revisions preserve accurate `page_count`, and enhanced `PdfViewer.tsx` with `onPassword` interactive unlock prompt.
- [x] **Permanent Irreversible Content Redaction**:
  - `POST /api/security/documents/{id}/redact` physically purges character glyphs and overlapping raster image pixels (`PDF_REDACT_IMAGE_PIXELS`) across explicit bounding boxes and search terms (optional `case_sensitive` match) before running `garbage=4` stream pruning (`RevisionOperation.REDACT`).
- [x] **Metadata, XMP, Attachment & JavaScript Sanitization**:
  - `GET /api/security/documents/{id}/inspect` audits encryption state, `/Info` dictionary fields, XMP XML bytes, embedded file names, active `/OpenAction` / `/AA` / `/Names/JavaScript` triggers, and annotation counts.
  - `POST /api/security/documents/{id}/sanitize` scrubs `/Info` metadata, XMP XML streams, embedded file attachments, thumbnails, and catalog/page JavaScript actions cleanly (`RevisionOperation.SANITIZE_METADATA`).
- [x] **Frontend Security Suite (`SecurityModal.tsx`)**:
  - Integrated into `EditorPage.tsx` via the "Security" toolbar button with tabs for AES-256 Encryption/Unlock, Permanent Redaction, and Metadata & Privacy Audit.
- [x] **Automated Test Coverage**:
  - 3 dedicated pytest tests in `backend/tests/test_security.py` verifying AES-256 encryption/permissions/owner-lock enforcement, wrong-password rejection (`400`), permanent glyph + raster pixel destruction at PDF stream level, deep metadata/XMP/attachment/JavaScript scrubbing, encrypted redaction/sanitize guards, and source file SHA-256 immutability (55/55 tests passing project-wide).

---

## Detailed Phase 13 Checklist (Complete)

- [x] **Typed Utilities Engine Protocol (`AGENTS.md`)**:
  - `UtilitiesEngine` protocol defined in `backend/app/engines/utilities_engine.py` with `LocalUtilitiesEngine` backed by ReportLab (BSD), `pypdf` (BSD-3-Clause), PyMuPDF, Pillow, and stdlib `difflib`.
- [x] **Vector Watermarks & Layer Placement**:
  - `POST /api/utilities/documents/{id}/watermark` stamps configurable text watermarks (fonts, sizes, hex color, alpha opacity, rotation `-90..90`, `center`/`top`/`bottom`/`tile` layouts) either `over` content or `under` background across targeted or all pages (`RevisionOperation.WATERMARK`).
- [x] **Lossless & Raster-Downsampled PDF Compression**:
  - `POST /api/utilities/documents/{id}/compress` provides 3 offline optimization profiles: `lossless` (garbage collection, stream deduplication, zlib deflate, object streams), `balanced` (120 DPI @78 JPEG raster downsampling), and `compact` (80 DPI @58 JPEG raster downsampling), returning exact before/after byte savings (`RevisionOperation.COMPRESS`).
- [x] **Hierarchical Bookmarks / Outline Editor & Auto-Detection**:
  - `GET /api/utilities/documents/{id}/bookmarks` reads PDF outline TOC items mapped to 0-based page indices.
  - `GET /api/utilities/documents/{id}/bookmarks/suggest` scans page typography deterministically for prominent headings (`>= 13 pt`) with page-label fallbacks.
  - `PUT /api/utilities/documents/{id}/bookmarks` enforces hierarchical outline nesting rules and persists updates cleanly (`RevisionOperation.BOOKMARKS_UPDATE`).
- [x] **Document & Revision Diff (Unified Text + Pixel Delta PNG)**:
  - `POST /api/utilities/compare` computes per-page `difflib` similarity scores, `+`/`-` line diffs, and O(256) histogram pixel difference percentages across documents or two revisions of the same document.
  - `GET /api/utilities/compare-page-image` renders PNG visual comparison overlays highlighting differing regions in bright red (`(239, 68, 68)`).
- [x] **Resilient Batch Processing Runner**:
  - `POST /api/utilities/batch` runs `watermark`, `compress`, or `sanitize` jobs across up to 50 catalog documents with isolated per-document error capture so individual locked/missing PDFs do not abort valid documents.
- [x] **Frontend Advanced Utilities & Batch UI (`UtilitiesModal.tsx`, `BatchModal.tsx`)**:
  - `UtilitiesModal.tsx` mounted in `EditorPage.tsx` via the "Utilities" button with 4 dedicated tabs (Watermark, Compress / Optimize, Bookmarks, Compare Diff with live red pixel-diff preview).
  - `BatchModal.tsx` mounted in `DashboardPage.tsx` via "Batch Tools" for multi-document batch execution and per-item audit reporting.
- [x] **Automated Test Coverage**:
  - 5 dedicated pytest tests in `backend/tests/test_utilities.py` verifying watermark positioning/layers, lossless & compact image-downsampling size reduction, bookmark hierarchy validation & heading auto-suggest, text & PNG visual diff generation, cross-document revision authorization checks, batch partial-failure resilience, and original SHA-256 immutability (60/60 tests passing project-wide).

---

## Detailed Phase 14 Checklist (Complete)

- [x] **Typed AI Engine Protocol & Dual Provider Support (`AGENTS.md`)**:
  - `AIEngine` protocol defined in `backend/app/engines/ai_engine.py` with `LocalAndEuriAIEngine`.
  - Supports **Euri OpenAI-compatible Chat Completions API** (`https://api.euron.one/api/v1/euri/chat/completions`, default model `gpt-5.3-instant`) using BYOK bearer tokens (`EURI_API_KEY` env var, `local_data/ai_config.json`, or transient `X-AI-Api-Key` header) AND **100% Offline Local Ollama** (`http://127.0.0.1:11434`).
- [x] **Secrets Hygiene, SSRF Guard & Prompt Injection Delimiters**:
  - API keys are never echoed in public config responses (`has_api_key` + masked `api_key_hint` only) and never exposed in upstream error messages.
  - Endpoint validation restricts plain `http://` strictly to loopback (`127.0.0.1` / `localhost`) and blocks link-local metadata endpoints (`169.254.*`).
  - Extracted PDF text is isolated inside `<UNTRUSTED_PDF_DOCUMENT page="N">` XML boundaries with an explicit system prompt instructing the model never to execute instructions inside PDF content.
  - Pre-send `GET /api/ai/documents/{id}/context-preview` shows exact pages, character count, and estimated token volume prior to inference.
- [x] **AI Document Workflows & Token Budget Tracking**:
  - `POST /api/ai/documents/{id}/summarize`: Generates `executive`, `bullet_points`, `action_items`, or `detailed` summaries with page citations (`[Page N]`).
  - `POST /api/ai/documents/{id}/ask`: Multi-turn grounded document Q&A.
  - `POST /api/ai/documents/{id}/extract`: Structured JSON entity/field extraction with fenced-JSON parsing.
  - `POST /api/ai/documents/{id}/save-summary-pdf`: Synthesizes XML-escaped ReportLab PDF summary either prepended as an auditable cover-page child revision (`RevisionOperation.AI_SUMMARY_COVER`) or saved as a standalone catalog report (`RevisionOperation.AI_SUMMARY_REPORT`).
  - Cumulative token counter tracks usage locally against user quota (default 300,000 / 3 Lakh tokens).
- [x] **Frontend AI Document Assistant Studio (`AIAssistantModal.tsx`)**:
  - Mounted in `EditorPage.tsx` via **Ask AI** button with live token quota meter, explicit data-residency notice, page scope filter, Summarize & Save PDF tab, Q&A chat thread, JSON extraction viewer, and Provider & Euri Key configuration panel.
- [x] **Automated Test Coverage**:
  - 4 comprehensive pytest tests in `backend/tests/test_ai.py` with mocked HTTP transport covering key masking, SSRF URL blocking, Euri API request/auth contract & untrusted delimiters, Ollama local inference, upstream 401/429/timeout/scanned/encrypted error handling, token accumulation, summary cover-page revisions, standalone report generation, and source SHA-256 immutability (64/64 tests passing project-wide).

---

## Detailed Phase 15 Checklist (Complete)

- [x] **SQLite Concurrency, Indexing & Search Pagination (`backend/app/repository.py`)**:
  - Enabled SQLite WAL mode (`PRAGMA journal_mode = WAL`), `PRAGMA busy_timeout = 5000`, `PRAGMA synchronous = NORMAL`, and `timeout=10.0` for safe multi-reader / writer concurrency.
  - Added SQLite B-tree indexes `idx_documents_updated` and `idx_revisions_doc_created`.
  - Extended `list_documents` & `GET /api/documents` with safe wildcard-escaped case-insensitive `search` filtering and `limit`/`offset` pagination.
- [x] **HTTP Byte-Range Streaming, Caching & Revision Authorization (`backend/app/api/documents.py`, `backend/app/main.py`)**:
  - `GET /api/documents/{id}/revisions/{rev}/content` serves `206 Partial Content` HTTP byte ranges (`Accept-Ranges: bytes`), exposes range headers via CORS, and sets `Cache-Control: private, max-age=86400, immutable` for content-addressed revisions.
  - Enforced strict document-to-revision authorization (`get_revision_file_path_for_document` and `export_revision` ownership check) blocking cross-document revision enumeration (`404`).
- [x] **Typed Diagnostics Protocol, SHA-256 Catalog Audit & Safe Temp Hygiene (`backend/app/engines/diagnostics_engine.py`, `backend/app/api/system.py`)**:
  - `DiagnosticsEngine` protocol & `LocalDiagnosticsEngine` implementation providing `GET /api/system/diagnostics`, `POST /api/system/verify-integrity`, and `POST /api/system/cleanup-temp`.
  - Deep SHA-256 & byte-length audit over all SQLite-recorded revisions and originals without mutating files.
  - Safe temp-buffer cleanup removes stale files in `local_data/temp/` and staging `.tmp*` suffixes in `working/` while preserving all `originals/` and active revisions.
- [x] **500+ Page PDF Viewer & Lazy Virtualized Thumbnails (`PdfViewer.tsx`, `ThumbnailStrip.tsx`, `vite.config.ts`)**:
  - Fixed page-turn PDF reload regression by stabilizing parent callbacks via refs in `PdfViewer.tsx` + monotonic render-generation cancellation preventing canvas races during rapid scrolling.
  - Replaced external CDN CMaps URL with zero-cloud local `/pdfjs/cmaps/` & `/pdfjs/standard_fonts/` served and bundled locally by Vite.
  - Replaced sequential eager thumbnail loop in `ThumbnailStrip.tsx` with `IntersectionObserver` lazy visible-window rendering, jump-to-page bar, and bounded 60-page LRU thumbnail cache.
- [x] **Enterprise UI Reliability & Keyboard Accessibility (`ErrorBoundary.tsx`, `SystemHealthModal.tsx`, `EditorPage.tsx`, `DashboardPage.tsx`, `App.tsx`)**:
  - Added top-level React `ErrorBoundary` recovery shell and wired `onOpenDocument` transitions cleanly from `EditorPage`.
  - Added keyboard navigation (`ArrowLeft`/`PageUp`, `ArrowRight`/`PageDown`, `+`/`-`/`0` zoom, `Escape` modal dismissal), inline toolbar page jump input, catalog search/pagination bar, and **System Health** modal.
- [x] **Automated Stress, Concurrency & Integrity Test Suite (`backend/tests/test_reliability_stress.py`)**:
  - 4 dedicated pytest benchmarks & tests verifying **500-page PDF** ingestion, page-250 rotation, bookmark reads, `206 Partial Content` byte-range streaming (`bytes=0-1023`), SQLite `LIKE` wildcard escaping + pagination + cross-document authorization boundaries, 8-thread SQLite WAL concurrency, and catalog SHA-256 integrity/tamper detection & safe temp cleanup (68/68 tests passing project-wide).
