# Automated Testing Strategy

## 1. Objectives & Scope

PDF Canvas requires enterprise-grade automated testing that validates:
- Input safety and rejection of malformed/corrupted files.
- Original file immutability (byte-level SHA-256 equivalence).
- Revision chain integrity (every mutation creates a valid child revision).
- Accurate page transformation (rotation, extraction, reordering).
- Local persistence consistency (SQLite database state reflects disk storage).
- Zero external network dependencies (100% offline executable).

---

## 2. Test Corpus Generation (Synthetic Files)

All tests rely on programmatic synthetic PDF generation to guarantee deterministic, legally unencumbered, and repeatable testing without external file dependencies:

1. **Minimal Valid PDF**: Standard 1-page PDF stream conforming to PDF 1.4 - 1.7.
2. **Multi-Page Synthetic PDF**: Multi-page document with known page counts (e.g. 5 pages) and varying orientations.
3. **Corrupted File**: Byte stream beginning with `%PDF-` but containing truncated, missing EOF, or invalid cross-reference tables.
4. **Non-PDF Binary**: Binary files (e.g. PNG headers, random byte blobs, plain text) mimicking PDF extensions.
5. **Oversized Stream**: Synthetic streams exceeding the configured maximum upload threshold (`max_upload_bytes`).
6. **Encrypted / Password PDF**: PDFs with standard encryption filters.

---

## 3. Test Layers

### A. Unit Tests (Engine & Storage)
- **`PyPdfEngine`**: Validates structural inspection, page count retrieval, and rotation operations on synthetic streams.
- **`LocalImmutableFileStore`**: Validates atomic write operations, SHA-256 hashing, path traversal prevention, and collision rejection.

### B. Integration Tests (API & Database)
- **Document Upload API**: Tests valid upload response, document + revision creation, and file persistence.
- **Rejection Tests**: 415 on non-PDF, 413 on oversized file, 400 on malformed structure.
- **Immutability Invariant**: Asserts that after page rotation, the original file's SHA-256 digest on disk remains identical to its ingest digest.
- **Revision History API**: Validates that parent-child relationships and operation history are accurately recorded and queryable.
- **Content Streaming & Export**: Validates HTTP range and file download integrity for any historical revision.

### C. End-to-End & UI Verification
- Browser preview validation using local Vite dev server and PDF.js.
- Visual thumbnail rendering and page navigation verification.
