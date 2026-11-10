import difflib
from io import BytesIO
from pathlib import Path
from typing import Protocol

from PIL import Image, ImageChops, ImageEnhance
import pymupdf as fitz
import pypdf
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas as rl_canvas

from ..models import (
    BookmarkItem,
    DocumentBookmarks,
    DocumentComparisonReport,
    PageDiffSummary,
    WatermarkRequest,
)


SUPPORTED_WATERMARK_FONTS = {
    "Helvetica",
    "Helvetica-Bold",
    "Times-Roman",
    "Times-Bold",
    "Courier",
    "Courier-Bold",
}


class UtilitiesEngine(Protocol):
    def apply_watermark(
        self, source: Path, destination: Path, req: WatermarkRequest
    ) -> None:
        """Applies transparent text watermarks in center, banner, or tiled grid layouts."""
        ...

    def compress_pdf(
        self, source: Path, destination: Path, mode: str = "lossless"
    ) -> tuple[int, int]:
        """Optimizes PDF size via deflate/object streams and optional image downsampling; returns (orig, new) bytes."""
        ...

    def get_bookmarks(self, source: Path, document_id: str) -> DocumentBookmarks:
        """Reads hierarchical PDF Table of Contents bookmarks (0-based page indices)."""
        ...

    def set_bookmarks(
        self, source: Path, destination: Path, bookmarks: list[BookmarkItem]
    ) -> None:
        """Validates hierarchy and updates the PDF document outline / bookmarks atomically."""
        ...

    def suggest_bookmarks(self, source: Path) -> list[BookmarkItem]:
        """Deterministically detects likely section headings across pages as bookmark suggestions."""
        ...

    def compare_pdfs(
        self,
        path_a: Path,
        path_b: Path,
        doc_a_id: str,
        doc_b_id: str,
        title_a: str,
        title_b: str,
        max_pages: int = 25,
    ) -> DocumentComparisonReport:
        """Compares two PDFs page-by-page using unified text diff and visual pixel delta."""
        ...

    def render_diff_page_image(
        self,
        path_a: Path,
        path_b: Path,
        page_index: int,
        dpi: int = 120,
    ) -> bytes:
        """Generates a PNG visual diff image highlighting pixel deltas in red."""
        ...


class LocalUtilitiesEngine:
    """100% local PDF utilities engine powered by ReportLab, pypdf, PyMuPDF, Pillow & difflib."""

    # --- 1. Watermarks ---

    def apply_watermark(
        self, source: Path, destination: Path, req: WatermarkRequest
    ) -> None:
        if not source.exists():
            raise FileNotFoundError(f"Source PDF does not exist: {source}")

        text = req.text.strip()
        if not text:
            raise ValueError("Watermark text cannot be empty")

        pos = req.position.strip().lower()
        if pos not in {"center", "top", "bottom", "tile"}:
            raise ValueError("position must be 'center', 'top', 'bottom', or 'tile'")

        layer = req.layer.strip().lower()
        if layer not in {"over", "under"}:
            raise ValueError("layer must be 'over' or 'under'")

        font_name = req.font_name if req.font_name in SUPPORTED_WATERMARK_FONTS else "Helvetica-Bold"
        try:
            color = HexColor(req.color)
        except Exception:
            color = HexColor("#64748b")

        reader = pypdf.PdfReader(str(source))
        if reader.is_encrypted:
            raise ValueError("Cannot watermark an encrypted PDF without unlocking it first")

        total_pages = len(reader.pages)
        target_set = (
            set(req.page_indices)
            if req.page_indices is not None and len(req.page_indices) > 0
            else set(range(total_pages))
        )
        for p in target_set:
            if p < 0 or p >= total_pages:
                raise IndexError(f"Page index {p} out of range (0..{total_pages - 1})")

        writer = pypdf.PdfWriter()
        over_flag = layer != "under"

        for i, page in enumerate(reader.pages):
            if i in target_set:
                ox = float(page.mediabox.left)
                oy = float(page.mediabox.bottom)
                pw = float(page.mediabox.width)
                ph = float(page.mediabox.height)

                buf = BytesIO()
                canv = rl_canvas.Canvas(buf, pagesize=(ox + pw, oy + ph))
                canv.saveState()
                canv.setFillColor(color)
                canv.setFillAlpha(req.opacity)

                if pos == "tile":
                    tile_size = min(req.font_size, 28.0)
                    canv.setFont(font_name, tile_size)
                    cols = 3
                    rows = 4
                    for r in range(rows):
                        for c in range(cols):
                            cx = ox + pw * (c + 0.5) / cols
                            cy = oy + ph * (r + 0.5) / rows
                            canv.saveState()
                            canv.translate(cx, cy)
                            canv.rotate(req.rotation)
                            canv.drawCentredString(0, -tile_size * 0.3, text)
                            canv.restoreState()
                else:
                    canv.setFont(font_name, req.font_size)
                    if pos == "top":
                        cx, cy = ox + pw / 2.0, oy + ph - max(36.0, req.font_size * 0.9)
                    elif pos == "bottom":
                        cx, cy = ox + pw / 2.0, oy + max(28.0, req.font_size * 0.6)
                    else:
                        cx, cy = ox + pw / 2.0, oy + ph / 2.0

                    canv.translate(cx, cy)
                    canv.rotate(req.rotation)
                    canv.drawCentredString(0, -req.font_size * 0.35, text)

                canv.restoreState()
                canv.showPage()
                canv.save()
                buf.seek(0)

                overlay_page = pypdf.PdfReader(buf).pages[0]
                added = writer.add_page(page)
                added.merge_page(overlay_page, expand=False, over=over_flag)
            else:
                writer.add_page(page)

        destination.parent.mkdir(parents=True, exist_ok=True)
        temp_dest = destination.with_suffix(".tmp_wm")
        try:
            with temp_dest.open("wb") as f:
                writer.write(f)
            temp_dest.replace(destination)
        finally:
            temp_dest.unlink(missing_ok=True)

    # --- 2. Lossless & Image-Optimized PDF Compression ---

    def compress_pdf(
        self, source: Path, destination: Path, mode: str = "lossless"
    ) -> tuple[int, int]:
        if not source.exists():
            raise FileNotFoundError(f"Source PDF does not exist: {source}")

        norm_mode = mode.strip().lower()
        if norm_mode not in {"lossless", "balanced", "compact"}:
            raise ValueError("Compression mode must be 'lossless', 'balanced', or 'compact'")

        reader = pypdf.PdfReader(str(source))
        if reader.is_encrypted:
            raise ValueError("Cannot compress an encrypted PDF without unlocking it first")

        orig_bytes = source.stat().st_size
        doc = fitz.open(str(source))

        destination.parent.mkdir(parents=True, exist_ok=True)
        temp_dest = destination.with_suffix(".tmp_cmp")

        try:
            if norm_mode == "balanced":
                doc.rewrite_images(dpi_threshold=150, dpi_target=120, quality=78)
            elif norm_mode == "compact":
                doc.rewrite_images(dpi_threshold=100, dpi_target=80, quality=58)

            doc.save(
                str(temp_dest),
                garbage=4,
                deflate=True,
                deflate_images=True,
                deflate_fonts=True,
                use_objstms=1,
            )
            doc.close()

            new_bytes = temp_dest.stat().st_size
            temp_dest.replace(destination)
            return orig_bytes, new_bytes
        finally:
            if not doc.is_closed:
                doc.close()
            temp_dest.unlink(missing_ok=True)

    # --- 3. Bookmarks / Outline Management ---

    def get_bookmarks(self, source: Path, document_id: str) -> DocumentBookmarks:
        if not source.exists():
            raise FileNotFoundError(f"Source PDF does not exist: {source}")

        reader = pypdf.PdfReader(str(source))
        if reader.is_encrypted:
            raise ValueError("Cannot inspect bookmarks of an encrypted PDF without unlocking")

        doc = fitz.open(str(source))
        try:
            total_pages = len(doc)
            raw_toc = doc.get_toc(simple=True) or []
            items: list[BookmarkItem] = []
            for entry in raw_toc:
                if len(entry) >= 3:
                    lvl = max(1, min(6, int(entry[0])))
                    title = str(entry[1]).strip() or "Untitled"
                    page_idx = max(0, min(total_pages - 1, int(entry[2]) - 1))
                    items.append(BookmarkItem(level=lvl, title=title, page_index=page_idx))
            return DocumentBookmarks(
                document_id=document_id,
                total_pages=total_pages,
                bookmarks=items,
            )
        finally:
            doc.close()

    def set_bookmarks(
        self, source: Path, destination: Path, bookmarks: list[BookmarkItem]
    ) -> None:
        if not source.exists():
            raise FileNotFoundError(f"Source PDF does not exist: {source}")

        reader = pypdf.PdfReader(str(source))
        if reader.is_encrypted:
            raise ValueError("Cannot update bookmarks on an encrypted PDF")

        doc = fitz.open(str(source))
        total_pages = len(doc)
        toc_entries: list[list] = []

        try:
            prev_level = 0
            for idx, item in enumerate(bookmarks):
                title = item.title.strip()
                if not title:
                    raise ValueError(f"Bookmark #{idx + 1} title cannot be empty")
                if item.page_index < 0 or item.page_index >= total_pages:
                    raise IndexError(
                        f"Bookmark '{title}' page_index {item.page_index} out of range (0..{total_pages - 1})"
                    )
                if idx == 0 and item.level != 1:
                    raise ValueError("First bookmark must be top-level (level 1)")
                if item.level > prev_level + 1:
                    raise ValueError(
                        f"Bookmark '{title}' jumps from level {prev_level} to {item.level}"
                    )
                prev_level = item.level
                toc_entries.append([item.level, title, item.page_index + 1])

            doc.set_toc(toc_entries)
            destination.parent.mkdir(parents=True, exist_ok=True)
            temp_dest = destination.with_suffix(".tmp_toc")
            try:
                doc.save(str(temp_dest), garbage=3, deflate=True)
                doc.close()
                temp_dest.replace(destination)
            finally:
                temp_dest.unlink(missing_ok=True)
        finally:
            if not doc.is_closed:
                doc.close()

    def suggest_bookmarks(self, source: Path) -> list[BookmarkItem]:
        if not source.exists():
            raise FileNotFoundError(f"Source PDF does not exist: {source}")

        if pypdf.PdfReader(str(source)).is_encrypted:
            raise ValueError("Cannot inspect encrypted PDF for bookmark suggestions without unlocking")

        doc = fitz.open(str(source))
        suggestions: list[BookmarkItem] = []
        try:
            for p_idx, page in enumerate(doc):
                d = page.get_text("dict")
                best_line = None
                best_size = 0.0
                for block in d.get("blocks", []):
                    if block.get("type") != 0:
                        continue
                    for line in block.get("lines", []):
                        spans = line.get("spans", [])
                        if not spans:
                            continue
                        max_span_sz = max(float(s.get("size", 0.0)) for s in spans)
                        line_txt = "".join(str(s.get("text", "")) for s in spans).strip()
                        if (
                            line_txt
                            and len(line_txt) >= 3
                            and max_span_sz >= 13.0
                            and max_span_sz > best_size
                        ):
                            best_size = max_span_sz
                            best_line = line_txt[:120]
                if best_line:
                    suggestions.append(
                        BookmarkItem(level=1, title=best_line, page_index=p_idx)
                    )
                else:
                    suggestions.append(
                        BookmarkItem(level=1, title=f"Page {p_idx + 1}", page_index=p_idx)
                    )
            return suggestions
        finally:
            doc.close()

    # --- 4. Document Comparison (Text Diff + Visual Pixel Diff) ---

    @staticmethod
    def _render_normalized_pair(
        page_a: fitz.Page | None,
        page_b: fitz.Page | None,
        dpi: int = 100,
    ) -> tuple[Image.Image, Image.Image]:
        img_a = (
            Image.open(BytesIO(page_a.get_pixmap(dpi=dpi, alpha=False).tobytes("png"))).convert("RGB")
            if page_a is not None
            else None
        )
        img_b = (
            Image.open(BytesIO(page_b.get_pixmap(dpi=dpi, alpha=False).tobytes("png"))).convert("RGB")
            if page_b is not None
            else None
        )

        w_a, h_a = img_a.size if img_a else (1, 1)
        w_b, h_b = img_b.size if img_b else (1, 1)
        target_w = max(w_a, w_b)
        target_h = max(h_a, h_b)

        canvas_a = Image.new("RGB", (target_w, target_h), (255, 255, 255))
        if img_a is not None:
            canvas_a.paste(img_a, (0, 0))

        canvas_b = Image.new("RGB", (target_w, target_h), (255, 255, 255))
        if img_b is not None:
            canvas_b.paste(img_b, (0, 0))

        return canvas_a, canvas_b

    def compare_pdfs(
        self,
        path_a: Path,
        path_b: Path,
        doc_a_id: str,
        doc_b_id: str,
        title_a: str,
        title_b: str,
        max_pages: int = 25,
    ) -> DocumentComparisonReport:
        if not path_a.exists() or not path_b.exists():
            raise FileNotFoundError("One or both documents for comparison could not be found")

        for p in (path_a, path_b):
            if pypdf.PdfReader(str(p)).is_encrypted:
                raise ValueError("Cannot compare encrypted PDFs without unlocking them first")

        doc_a = fitz.open(str(path_a))
        doc_b = fitz.open(str(path_b))
        try:
            pages_a = len(doc_a)
            pages_b = len(doc_b)
            compare_limit = min(max_pages, max(pages_a, pages_b))

            page_diffs: list[PageDiffSummary] = []
            identical_count = 0
            changed_count = 0

            for idx in range(compare_limit):
                pa = doc_a[idx] if idx < pages_a else None
                pb = doc_b[idx] if idx < pages_b else None

                lines_a = pa.get_text("text").splitlines() if pa is not None else []
                lines_b = pb.get_text("text").splitlines() if pb is not None else []

                text_a = "\n".join(lines_a)
                text_b = "\n".join(lines_b)
                sim = round(difflib.SequenceMatcher(None, text_a, text_b).ratio(), 4)
                raw_diff = list(
                    difflib.unified_diff(
                        lines_a,
                        lines_b,
                        fromfile=f"{title_a} (p.{idx + 1})",
                        tofile=f"{title_b} (p.{idx + 1})",
                        lineterm="",
                    )
                )

                added = sum(1 for ln in raw_diff if ln.startswith("+") and not ln.startswith("+++"))
                removed = sum(1 for ln in raw_diff if ln.startswith("-") and not ln.startswith("---"))
                text_changed = (text_a != text_b) or (pa is None) != (pb is None)

                # Visual pixel delta (O(256) C histogram count of grayscale intensities > 14)
                img_a, img_b = self._render_normalized_pair(pa, pb, dpi=96)
                diff_img = ImageChops.difference(img_a, img_b).convert("L")
                diff_pixels = sum(diff_img.histogram()[15:])
                total_pixels = max(1, diff_img.width * diff_img.height)
                visual_pct = round((diff_pixels / total_pixels) * 100.0, 3)
                visual_changed = visual_pct > 0.01

                if not text_changed and not visual_changed:
                    identical_count += 1
                else:
                    changed_count += 1

                page_diffs.append(
                    PageDiffSummary(
                        page_index=idx,
                        text_changed=text_changed,
                        text_similarity=sim,
                        added_lines=added,
                        removed_lines=removed,
                        diff_lines=raw_diff[:120],
                        visual_diff_percent=visual_pct,
                        visual_changed=visual_changed,
                    )
                )

            return DocumentComparisonReport(
                document_a_id=doc_a_id,
                document_b_id=doc_b_id,
                document_a_title=title_a,
                document_b_title=title_b,
                pages_a=pages_a,
                pages_b=pages_b,
                pages_compared=compare_limit,
                identical_pages=identical_count,
                changed_pages=changed_count,
                page_diffs=page_diffs,
            )
        finally:
            doc_a.close()
            doc_b.close()

    def render_diff_page_image(
        self,
        path_a: Path,
        path_b: Path,
        page_index: int,
        dpi: int = 120,
    ) -> bytes:
        if not path_a.exists() or not path_b.exists():
            raise FileNotFoundError("One or both comparison PDFs missing")

        for p in (path_a, path_b):
            if pypdf.PdfReader(str(p)).is_encrypted:
                raise ValueError("Cannot render visual diff for encrypted PDFs without unlocking them first")

        doc_a = fitz.open(str(path_a))
        doc_b = fitz.open(str(path_b))
        try:
            total = max(len(doc_a), len(doc_b))
            if page_index < 0 or page_index >= total:
                raise IndexError(f"Page index {page_index} out of range (0..{total - 1})")

            pa = doc_a[page_index] if page_index < len(doc_a) else None
            pb = doc_b[page_index] if page_index < len(doc_b) else None

            img_a, img_b = self._render_normalized_pair(pa, pb, dpi=dpi)
            delta_gray = ImageChops.difference(img_a, img_b).convert("L")
            # Build crisp highlight mask for differing pixels
            mask = delta_gray.point(lambda p: 255 if p > 14 else 0)

            # Dim base document B slightly so red difference overlays pop cleanly
            faded_base = ImageEnhance.Brightness(img_b.convert("L").convert("RGB")).enhance(0.92)
            highlight_layer = Image.new("RGB", img_b.size, (239, 68, 68))
            result = Image.composite(highlight_layer, faded_base, mask)

            out = BytesIO()
            result.save(out, format="PNG")
            return out.getvalue()
        finally:
            doc_a.close()
            doc_b.close()
