# Architecture Document: 100% Local Enterprise PDF Editor

## 1. High-Level Architecture Overview

PDF Canvas is designed as a local-first modular monolith. All components run directly on the user's workstation without requiring external cloud accounts, databases, or API keys.

```
┌─────────────────────────────────────────────────────────────────┐
│                    User Web Browser                             │
│       (React 18 + Vite + TypeScript + PDF.js + Tailwind)        │
│                    http://localhost:5173                        │
└────────────────────────────────┬────────────────────────────────┘
                                 │ REST API / Static Streams
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                   FastAPI Local Backend                         │
│                    http://127.0.0.1:8000                        │
│                                                                 │
│   ┌──────────────┐     ┌───────────────┐     ┌──────────────┐   │
│   │ API Layer    │◄───►│ Document Svc  │◄───►│ Revision Svc │   │
│   └──────────────┘     └───────┬───────┘     └──────────────┘   │
│                                │                                │
│   ┌────────────────────────────┼────────────────────────────┐   │
│   │                PDF Engine Abstraction                   │   │
│   │   ┌───────────────────┐        ┌───────────────────┐    │   │
│   │   │  PyPDF Adapter    │        │  PikePDF Adapter  │    │   │
│   │   │  (Free/BSD Core)  │        │  (MPL-2.0 Mod)    │    │   │
│   │   └───────────────────┘        └───────────────────┘    │   │
│   └────────────────────────────┬────────────────────────────┘   │
│                                │                                │
│   ┌────────────────────────────▼────────────────────────────┐   │
│   │            Local Persistence & Storage Layer            │   │
│   │   ┌───────────────────┐        ┌───────────────────┐    │   │
│   │   │   SQLite Database │        │ Local File Store  │    │   │
│   │   │  (local_data/app.db)│      │(local_data/* dirs)│    │   │
│   │   └───────────────────┘        └───────────────────┘    │   │
│   └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Architectural Principles & Invariants

1. **Original Immutability**:
   - Uploaded PDF source files are written once to `local_data/originals/` and marked read-only.
   - The SHA-256 digest of the original file is recorded upon ingest and verified before and after operations.
2. **Revision-Based Mutations**:
   - Every modification (page rotation, reordering, split, merge, annotation, redaction) creates an immutable child revision stored in `local_data/working/` or `local_data/history/`.
   - The document's `current_revision_id` pointer advances to the new revision.
   - History preserves the full directed acyclic graph (DAG) of edits, enabling lossless multi-step undo/redo.
3. **Engine Isolation Behind Typed Protocols**:
   - All PDF parsing, manipulation, extraction, and rendering operate strictly through typed Python protocols (`PdfEngine`).
   - The application does not couple domain logic to any specific library syntax.
   - Default operations use permissive open-source libraries (`pypdf` BSD-3-Clause). Copyleft libraries (e.g. `PyMuPDF` AGPL) are isolated in dedicated optional adapters requiring explicit administrative enablement.
4. **Untrusted Input Treatment**:
   - All uploaded files are treated as untrusted binary payloads.
   - Ingestion enforces file size limits, `%PDF-` signature detection, and deep structural parsing before database registration.
   - Storage uses deterministic UUID identifiers instead of user-supplied filenames to eliminate directory traversal risks.
5. **Atomic File Operations**:
   - All disk writes use a write-to-temporary-then-atomic-replace pattern (`os.replace` / `Path.replace`) backed by `fsync` to guarantee zero file corruption during power failures or process interruptions.

---

## 3. Directory Layout & Local Data Storage Structure

```
PDF_Canvas/
├── backend/
│   ├── app/
│   │   ├── api/             # FastAPI routers (documents, revisions, pages, exports)
│   │   ├── engines/         # Typed PDF processing engine protocols & implementations
│   │   │   ├── pdf_engine.py       # Engine protocol & PyPDF engine adapter
│   │   │   ├── editing_engine.py   # Future content editing abstraction
│   │   │   ├── ocr_engine.py       # Offline Tesseract OCR & scanned reconstruction
│   │   │   ├── template_engine.py  # ReportLab template synthesis & JSON storage
│   │   │   ├── form_engine.py      # AcroForm inspect/fill/flatten adapter
│   │   │   ├── signature_engine.py # Visual stamps & PKCS#12/PKCS#7 pyHanko adapter
│   │   │   ├── security_engine.py  # AES-256 encryption, redaction & metadata sanitize
│   │   │   ├── utilities_engine.py # Watermarks, compression, bookmarks, diff & batch
│   │   │   ├── ai_engine.py        # BYOK Euri API & Local Ollama AI analysis adapter
│   │   │   ├── diagnostics_engine.py # SQLite WAL stats, SHA-256 audit & temp cleanup
│   │   │   └── conversion_engine.py# Local LibreOffice, Pillow & pypdfium2 adapter
│   │   ├── models/          # Domain dataclasses and Pydantic schemas
│   │   ├── services/        # Business logic: DocumentService, RevisionService
│   │   ├── storage.py       # Local immutable filesystem adapter
│   │   ├── repository.py    # SQLite repository persistence
│   │   ├── config.py        # Settings and environment configuration
│   │   └── main.py          # FastAPI application entrypoint and lifespan handlers
│   ├── tests/               # Pytest automated test suite
│   ├── pyproject.toml
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── components/      # UI components: Topbar, Sidebar, Properties, Modals
│   │   ├── pages/           # DashboardPage, EditorPage
│   │   ├── editor/          # PDF Canvas viewer (PDF.js integration), Thumbnail strip
│   │   ├── services/        # Local API client, state management
│   │   ├── styles/          # Styling definitions
│   │   ├── App.tsx          # Main React router/view coordinator
│   │   └── main.tsx         # React root
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── local_data/              # Local data root (excluded from Git)
│   ├── originals/           # Immutable uploaded source PDFs
│   ├── working/             # Active working revisions
│   ├── exports/             # Exported artifacts
│   ├── templates/           # User & system templates
│   ├── signatures/          # Reusable drawn/uploaded transparent PNG stamps
│   ├── certs/               # Local passphrase-encrypted PKCS#12 (.p12) profiles
│   ├── thumbnails/          # Pre-rendered page thumbnails (JPEG/PNG)
│   ├── history/             # Historical revisions archive
│   ├── temp/                # Transient staging buffers
│   └── app.db               # SQLite metadata database
│
├── docs/                    # Architecture, requirements, feature tracking, testing
├── scripts/                 # PowerShell automated setup, start, and stop utilities
└── README.md
```

---

## 4. Data Model & SQLite Schema

The metadata layer uses SQLite 3 (`local_data/app.db`) for transactionally safe, zero-configuration local persistence:

```sql
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'application/pdf',
    page_count INTEGER NOT NULL DEFAULT 0,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    original_revision_id TEXT NOT NULL,
    current_revision_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS revisions (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    parent_revision_id TEXT REFERENCES revisions(id),
    operation TEXT NOT NULL,          -- 'upload', 'rotate_page', 'reorder', etc.
    storage_path TEXT NOT NULL,        -- Relative path under local_data/
    sha256 TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    page_count INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_updated ON documents(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_revisions_doc_created ON revisions(document_id, created_at ASC);
```

SQLite connections run with `PRAGMA journal_mode = WAL`, `PRAGMA busy_timeout = 5000`, `PRAGMA synchronous = NORMAL`, and `PRAGMA foreign_keys = ON`.

---

## 5. Security & Isolation Model

- **Localhost Binding**: FastAPI binds to `127.0.0.1:8000`; Vite dev server binds to `127.0.0.1:5173`. Neither exposes open ports on public network interfaces.
- **Path Traversal Protection**: All file access requests are validated against resolved boundary roots (`local_data/`). Any path escaping the directory raises an immediate security error.
- **Revision Authorization**: Content streaming (`GET /api/documents/{document_id}/revisions/{revision_id}/content`), comparison, and export verify that `revision.document_id == document_id` before resolving storage paths.
- **CORS Scope**: Backend CORS policy is restricted to local development origins and exposes `Accept-Ranges`, `Content-Range`, `Content-Length`, and `ETag` headers for chunked PDF streaming.
- **Untrusted File Hardening**: Uploaded files undergo structural inspection using safe parsing modes before execution of downstream operations.

---

## 6. Large-File Streaming, Reliability & Diagnostics

- **Byte-Range Streaming & Immutable Cache**: Revision content endpoints stream partial byte ranges (`206 Partial Content`, `256 KB` chunks in PDF.js) with `Cache-Control: private, max-age=86400, immutable`.
- **Zero-Cloud Offline PDF.js Assets**: `vite.config.ts` serves and bundles `pdfjs-dist` CMaps and standard fonts locally under `/pdfjs/cmaps/` and `/pdfjs/standard_fonts/`.
- **Lazy Virtualized Thumbnails**: `ThumbnailStrip` uses `IntersectionObserver` + a concurrency-1 render worker and bounded 60-page LRU cache so 500+ page documents open without UI blocking or canvas memory exhaustion.
- **Catalog Audit & Hygiene**: `/api/system/diagnostics`, `/api/system/verify-integrity`, and `/api/system/cleanup-temp` monitor WAL integrity, verify recorded SHA-256 checksums across all revisions, and reclaim stale temp buffers without touching `originals/` or active revisions.
