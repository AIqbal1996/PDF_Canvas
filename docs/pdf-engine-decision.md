# ADR-001: PDF engine selection

Status: Proposed

## Decision

Use an engine abstraction immediately. Do not select a native-content editing engine until the proof-of-concept corpus is evaluated.

## Candidates

1. Commercial Web SDK: preferred when high-fidelity native text/image editing is a launch requirement.
2. Open-source server operations: suitable for merge, split, rotate, page insertion, metadata, and selected export workflows after license review.
3. PDF.js: rendering/viewer foundation only, not the native editing engine.

## Proof-of-concept gates

- Text editing with embedded, subset, and missing fonts.
- Image replacement and transparency preservation.
- Forms, redaction, signatures, PDF/A, OCR, and malformed input.
- 500+ page performance and browser memory behavior.
- Export fidelity measured by raster and structural comparison.
- Deployment, licensing, support, and five-year cost.

No candidate passes merely because its demo can add overlay text.

