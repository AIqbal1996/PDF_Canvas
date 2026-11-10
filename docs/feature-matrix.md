# Feature Matrix: 100% Local Enterprise PDF Editor

| Module / Feature | Phase | Local Tech Engine | License Status | Implementation State | Verification Method |
|---|---|---|---|---|---|
| **Document Dashboard & Catalog** | Phase 1 | React + Vite + Tailwind | MIT | **Phase 1 Complete** | Component & visual tests |
| **PDF Ingestion & Validation** | Phase 1 | FastAPI + pypdf | BSD-3-Clause | **Phase 1 Complete** | Pytest structural validation |
| **Immutable Original Storage** | Phase 1 | Local File System (SHA-256) | N/A | **Phase 1 Complete** | SHA-256 hash invariant tests |
| **PDF Preview Canvas** | Phase 1 | PDF.js | Apache-2.0 | **Phase 1 Complete** | Multi-page render tests |
| **Thumbnail Navigation Bar** | Phase 1 | PDF.js / Canvas thumbnails | Apache-2.0 | **Phase 1 Complete** | Dynamic thumbnail test |
| **File Export & Download** | Phase 1 | FastAPI StreamingResponse | BSD / MIT | **Phase 1 Complete** | Download integrity test |
| **Revision History & Tracking** | Phase 1 | SQLite + Revision DAG | Public Domain | **Phase 1 Complete** | Parent-child lineage test |
| **Page Rotation (Single/All)** | Phase 1/2 | pypdf | BSD-3-Clause | **Phase 1/2 Complete** | Orientation & degree verify |
| **Page Reordering & Insertion** | Phase 2 | pypdf | BSD-3-Clause | **Phase 2 Complete** | Array permutation tests |
| **Page Merge** | Phase 2 | pypdf | BSD-3-Clause | **Phase 2 Complete** | Multi-document merge tests |
| **Page Extraction & Deletion** | Phase 2 | pypdf | BSD-3-Clause | **Phase 2 Complete** | Sub-document & removal tests |
| **Page Duplication** | Phase 2 | pypdf | BSD-3-Clause | **Phase 2 Complete** | In-place duplication tests |
| **Page Size / Resizing (A4/Letter)** | Phase 3 | pypdf | BSD-3-Clause | **Phase 3 Complete** | MediaBox dimension tests |
| **Page Crop & Margins** | Phase 3 | pypdf CropBox | BSD-3-Clause | **Phase 3 Complete** | CropBox geometry tests |
| **Headers, Footers & Numbering** | Phase 3 | ReportLab + pypdf overlay | BSD / BSD | **Phase 3 Complete** | Dynamic overlay tests |
| **Text Annotations & Overlays** | Phase 4 | ReportLab + pypdf overlay | BSD / BSD | **Phase 4 Complete** | Coordinate & link tests |
| **Shapes, Highlighting & Callouts**| Phase 4 | ReportLab + pypdf overlay | BSD / BSD | **Phase 4 Complete** | Alpha & shape tests |
| **Native Text Stream Editing** | Phase 4 | pypdf stream decode/replace | BSD-3-Clause | **Phase 4 Complete** | Decoded stream token replace |
| **Image Insertion & Manipulation** | Phase 5 | Pillow + ReportLab + pypdf | MIT / BSD | **Phase 5 Complete** | Image placement & alpha tests |
| **Image Extraction & Replacement** | Phase 5 | pypdf XObject Stream Engine | BSD-3-Clause | **Phase 5 Complete** | Raster replacement & delete tests |
| **Office Conversion (DOCX/XLSX)** | Phase 6 | LibreOffice Headless (Local) | LGPL-3.0 / MPL | **Phase 6 Complete** | Isolated subprocess & diagnostic tests |
| **PDF to Image Conversion** | Phase 6 | pypdfium2 + Pillow | Apache-2.0 / HPND | **Phase 6 Complete** | High-DPI raster & ZIP package tests |
| **Scanned PDF Text Detection** | Phase 7 | PyMuPDF Embedded Tesseract | Apache-2.0 / MPL | **Phase 7 Complete** | Scanned detection & token tests |
| **Searchable PDF Generation** | Phase 7 | PyMuPDF Invisible Text Layer | Apache-2.0 / MPL | **Phase 7 Complete** | Invisible font layer tests |
| **Advanced OCR Layout Correction** | Phase 8 | PyMuPDF Inpainting & Vector Overlay | Apache-2.0 / MPL | **Phase 8 Complete** | Region patch & clean vector tests |
| **Drag & Drop Template Studio** | Phase 9 | React + Live PDF Preview Studio | MIT | **Phase 9 Complete** | Dynamic token & schema tests |
| **Invoice / Resume Templates** | Phase 9 | ReportLab Vector Synthesis | BSD-3-Clause | **Phase 9 Complete** | PDF synthesis & catalog tests |
| **Interactive AcroForms** | Phase 10 | PyMuPDF AcroForm Engine | Apache-2.0 / MPL | **Phase 10 Complete** | Form field inspect, add & fill tests |
| **Form Flattening** | Phase 10 | PyMuPDF bake() Engine | Apache-2.0 / MPL | **Phase 10 Complete** | Flattened stream check & text tests |
| **Drawn / Uploaded Signatures** | Phase 11 | HTML5 Canvas + Pillow + ReportLab | MIT / BSD | **Phase 11 Complete** | Image validation & visual stamp tests |
| **Certificate Digital Signatures** | Phase 11 | pyHanko + cryptography (PKCS#12/PAdES) | MIT / Apache-2.0 | **Phase 11 Complete** | Multisig & tamper verify tests |
| **Password Protection & AES Enc** | Phase 12 | pypdf (AES-256) | BSD-3-Clause | **Phase 12 Complete** | AES-256, permissions & owner lock tests |
| **True Content Redaction** | Phase 12 | PyMuPDF Permanent Redact + garbage=4 | Apache-2.0 / MPL | **Phase 12 Complete** | Stream glyph purge & pixel wipe tests |
| **Metadata Sanitization** | Phase 12 | PyMuPDF Scrub + Catalog JS Clear | Apache-2.0 / MPL | **Phase 12 Complete** | Info, XMP, attachment & OpenAction tests |
| **Watermarking & Stamps** | Phase 13 | ReportLab + pypdf | BSD / BSD | **Phase 13 Complete** | Placement, layer & opacity tests |
| **Lossless & Balanced Compression** | Phase 13 | PyMuPDF garbage=4 + Deflate | Apache-2.0 / MPL | **Phase 13 Complete** | Deflate & image downsample ratio tests |
| **Hierarchical Bookmarks & TOC** | Phase 13 | PyMuPDF TOC + Font Heuristics | Apache-2.0 / MPL | **Phase 13 Complete** | Hierarchy validation & heading detect |
| **Document Visual & Text Diff** | Phase 13 | difflib + Pillow ImageChops | PSF / HPND | **Phase 13 Complete** | Unified text & red PNG delta tests |
| **Batch Document Processing** | Phase 13 | DocumentService Batch Runner | MIT | **Phase 13 Complete** | Multi-doc & partial failure tests |
| **AI Document Assistant (BYOK/Ollama)** | Phase 14 | Euri API (`gpt-5.3-instant`) / Ollama + httpx | MIT / BYOK | **Phase 14 Complete** | Mock transport, SSRF & token tests |
| **Enterprise Stress & Scale** | Phase 15 | SQLite WAL, Range Stream, Lazy LRU Thumbs & Pytest | MIT / Public Domain | **Phase 15 Complete** | 500-page PDF, WAL concurrency & SHA-256 audit |
