# Module Dependency Map

## 1. Architectural Layers & Flow

The following map defines the separation of concerns and dependency directions for the local-first application. All dependencies point inward; higher-level presentation layers depend on service interfaces, which depend on typed protocol definitions, never concrete low-level engine details.

```
┌────────────────────────────────────────────────────────┐
│                   Web Presentation                     │
│         (React, Vite, PDF.js, Tailwind, Lucide)        │
└───────────────────────────┬────────────────────────────┘
                            │ HTTP / JSON API
                            ▼
┌────────────────────────────────────────────────────────┐
│                    API Layer                           │
│  (FastAPI Routes: /api/documents, /api/revisions, etc) │
└───────────────────────────┬────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
┌───────────────────────────┐ ┌───────────────────────────┐
│     Document Service      │ │     Revision Service      │
└─────────────┬─────────────┘ └───────────┬───────────────┘
              │                           │
              ├───────────────────────────┤
              │                           │
              ▼                           ▼
┌───────────────────────────┐ ┌───────────────────────────┐
│    Local Storage Layer    │ │     Metadata Storage      │
│ (LocalImmutableFileStore) │ │    (SQLiteRepository)     │
└─────────────┬─────────────┘ └───────────┬───────────────┘
              │                           │
              └─────────────┬─────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│           PDF Engine Protocol (`PdfEngine`)            │
└───────────────────────────┬────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
┌─────────────────┐┌─────────────────┐┌─────────────────┐
│  PyPdfEngine    ││  PikePdfEngine  ││ PyMuPdfAdapter  │
│ (Core Operations││ (Advanced QPDF) ││ (Licensed AGPL) │
└─────────────────┘└─────────────────┘└─────────────────┘
```

---

## 2. Module Interdependence Matrix

| Module | Depends On | Used By | Decoupling Strategy |
|---|---|---|---|
| **Storage (`storage.py`)** | Local Filesystem (`Path`), SHA-256 | Document Service, Revision Service | Strict path containment assertions |
| **Repository (`repository.py`)** | SQLite3, Pydantic Models | API layer, Document Service | Interface protocol `DocumentRepository` |
| **Engine Protocol (`pdf_engine.py`)**| Standard Library, Typing Protocols | All PDF mutators & validators | Pure Protocol definitions |
| **PyPDF Engine Adapter** | `pypdf`, `io`, `pathlib` | Backend engine registry | Implements `PdfEngine` protocol |
| **Document Service** | Storage, Repository, PDF Engine | API Routers | Encapsulates immutable document workflow |
| **FastAPI App (`main.py`)** | API Routers, Lifespan | Frontend HTTP Client | Stateless REST endpoints |
| **Frontend Viewer (`PdfViewer`)**| `pdfjs-dist`, HTML5 Canvas | Editor Page | WebWorker-based background PDF rasterization |
| **OCR Service (Phase 7)** | Subprocess (Tesseract), Pillow | Engine Registry | Optional async background worker |
| **Conversion Service (Phase 6)**| Subprocess (LibreOffice) | Engine Registry | Isolated CLI subprocess invocation |
| **AI Assistant (Phase 14)** | HTTP (Ollama Local API) | Editor Toolbar | Optional local REST client |
