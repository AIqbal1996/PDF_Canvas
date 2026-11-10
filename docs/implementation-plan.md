# Implementation Plan: Local Enterprise PDF Editor

## Strategic Direction
The PDF Canvas architecture is 100% local-first. All runtime requirements are met on the host PC using free and open-source software (FastAPI, pypdf, SQLite, React, Vite, PDF.js). Hosted cloud dependencies (AWS, GCP, Supabase, external S3) are eliminated.

## Phased Progression

### Phase 1: Local Foundation (Active)
1. **Local Backend**: FastAPI server running on `127.0.0.1:8000`.
2. **Local Storage**: Immutable file hierarchy under `local_data/` with SHA-256 verification.
3. **Local Database**: Embedded SQLite (`local_data/app.db`) for documents and revisions.
4. **Engine Abstraction**: Typed `PdfEngine` protocol backed by `pypdf` (BSD-3-Clause).
5. **Local Frontend**: React + Vite + TypeScript application running on `localhost:5173`.
6. **Core UX Workflow**: Upload -> Validate -> Store Immutable Original -> PDF Preview -> Thumbnails -> Rotate Page -> Create Child Revision -> Export / Download.
7. **Automated Verification**: Comprehensive Pytest suite asserting immutability, revision history, and validation.

### Phase 2: Complete Page Management
- Multi-page operations: Reorder via drag & drop, delete, insert blank pages, duplicate.
- Merge multiple local PDFs.
- Split by range / extract pages.

### Phase 3: Page Formatting & Layout
- A4/A3/Letter page normalization.
- CropBox manipulation.
- Margins and header/footer dynamic overlays.

### Phase 4: PDF Content Editing
- Text annotation overlays with full styling.
- Drawing, rectangles, highlighting, callouts.
- Native content stream editing (where structurally feasible) with clear disclaimers separating native modification from overlay annotations.

### Phase 5: Image Editing
- Image insertion, transformation, and aspect-ratio locking.
- Raster image extraction and replacement.

### Phase 6: Document Conversion
- Local LibreOffice headless bridge (Word, Excel, PPT -> PDF).
- PDF to raster image export.

### Phase 7: Local OCR Engine
- Tesseract and OCRmyPDF integration for offline searchable PDF generation.

### Phase 8: Advanced Scanned Layout Correction
- Bounding-box text correction on scanned documents.

### Phase 9: Template Studio
- Fabric.js visual template designer with invoice and certificate generation.

### Phase 10: PDF Forms
- AcroForms editing, validation, and stream flattening.

### Phase 11: Electronic Signatures
- Signature drawing, stamp placement, and PKCS#12 certificate signing.

### Phase 12: Security & Privacy
- Password protection, AES-256 encryption, true permanent redaction, metadata scrubbing.

### Phase 13: Advanced Utilities
- Watermarks, Deflate compression, and revision diffing.

### Phase 14: Offline AI
- Local Ollama connection for private document summarization and Q&A.

### Phase 15: Enterprise Hardening
- 500+ page stress tests, memory limits, and complete accessibility compliance.
