# PDF Canvas (100% Local Enterprise PDF Platform)

PDF Canvas is a local-first, enterprise-grade PDF workspace built for Windows without external cloud infrastructure, subscriptions, hosted databases, or third-party API keys.

All PDF files, revision histories, SQLite metadata, and processing services remain 100% on your local PC.

---

## 1. Quick Start

### Step 1: Initial Setup
Run the automated environment setup script from PowerShell:
```powershell
.\scripts\setup.ps1
```
This verifies Python and Node.js, initializes the `local_data` storage hierarchy, installs backend dependencies, and installs frontend npm packages.

### Step 2: Start the Local Workspace
Launch both the FastAPI backend (`127.0.0.1:8000`) and the Vite React frontend (`127.0.0.1:5173`):
```powershell
.\scripts\start.ps1
```
This starts the local services and automatically opens `http://localhost:5173` in your browser.

To stop the background services at any time:
```powershell
.\scripts\stop.ps1
```

---

## 2. Phase 1 Capabilities (Delivered)

- **Document Dashboard**: Catalog displaying recent files, page counts, file sizes, and timestamps.
- **Upload & Safety Ingestion**: Drag-and-drop or file picker ingestion with strict `%PDF-` signature detection and structural parsing.
- **Immutable Originals**: Source PDFs are stored write-once in `local_data/originals/` with verified SHA-256 digests.
- **Embedded SQLite Catalog**: All document records and revision lineage trees persist in `local_data/app.db` with zero configuration.
- **High-Fidelity PDF Preview**: Built-in offline PDF.js viewer with high-DPI canvas rendering, page navigation, and zoom controls (40% - 300%).
- **Thumbnail Navigation Strip**: Collapsible thumbnail sidebar with fast page jump.
- **Page Rotation & Child Revision**: In-place page rotation (90° clockwise) powered by `pypdf`. Never mutates the original; creates an immutable child revision in `local_data/working/` and updates the active head.
- **Revision Lineage Drawer**: Visual audit trail showing parent-child revision lineages, operation types, timestamps, and SHA-256 hashes.
- **Revision Export**: Download validated current or historical revisions directly to your local file system.

---

## 3. Technology Stack & Licensing

| Component | Technology | License | Local Role |
|---|---|---|---|
| Frontend | React 18 + TypeScript + Vite | MIT | Desktop-grade browser interface |
| Styling | Tailwind CSS | MIT | Modern dark-mode UI |
| PDF Viewer | PDF.js | Apache-2.0 | Offline page rendering & thumbnails |
| Backend | Python 3.12 + FastAPI | MIT | Local REST API on `127.0.0.1:8000` |
| PDF Engine | pypdf | BSD-3-Clause | Inspection, page count, rotations |
| Metadata | SQLite 3 | Public Domain | Embedded in `local_data/app.db` |
| Storage | Windows Filesystem | N/A | `local_data/` directory hierarchy |

---

## 4. Running Verification Tests

Run the backend Pytest test suite:
```powershell
python -m pytest backend/tests/test_api.py -v
```

All tests run on synthetic in-memory PDF fixtures and an isolated temporary directory, verifying upload validation, size limits, original file immutability, revision lineage generation, and export integrity.

---

## 5. Architecture & Documentation

- [Requirements Specification](docs/requirements.md)
- [Architecture & Design Invariants](docs/architecture.md)
- [Feature Matrix (Phases 1-15)](docs/feature-matrix.md)
- [Module Dependency Map](docs/module-dependencies.md)
- [Phased Development Backlog](docs/feature-tracker.md)
- [Automated Testing Strategy](docs/testing.md)
- [PDF Engine ADR](docs/pdf-engine-decision.md)
