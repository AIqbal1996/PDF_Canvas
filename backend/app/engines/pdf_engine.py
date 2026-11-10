from io import BytesIO
import os
from pathlib import Path
from typing import Protocol
from pydantic import BaseModel, Field
import pypdf
from pypdf.errors import PdfReadError
from pypdf.generic import DecodedStreamObject, NameObject
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas as rl_canvas


PAPER_SIZES: dict[str, tuple[float, float]] = {
    "A4": (595.28, 841.89),
    "A3": (841.89, 1190.55),
    "LETTER": (612.0, 792.0),
    "LEGAL": (612.0, 1008.0),
    "TABLOID": (792.0, 1224.0),
}


class PdfInspection(BaseModel):
    valid: bool
    page_count: int = 0
    version: str | None = None
    is_encrypted: bool = False
    warnings: list[str] = Field(default_factory=list)


class PdfEngine(Protocol):
    def inspect(self, source: Path) -> PdfInspection:
        """Inspects and validates PDF structure, returning page count and metadata."""
        ...

    def rotate_page(self, source: Path, destination: Path, page_index: int, degrees: int) -> None:
        """Rotates a specific page by degrees and writes to destination atomically."""
        ...

    def reorder_pages(self, source: Path, destination: Path, new_order: list[int]) -> None:
        """Reorders document pages according to new_order permutation."""
        ...

    def delete_pages(self, source: Path, destination: Path, pages_to_delete: list[int]) -> None:
        """Deletes specified 0-indexed pages from source and writes to destination."""
        ...

    def duplicate_page(self, source: Path, destination: Path, page_index: int, count: int = 1) -> None:
        """Duplicates a specific page and inserts the copies immediately following it."""
        ...

    def extract_pages(self, source: Path, destination: Path, page_indices: list[int]) -> None:
        """Extracts specified 0-indexed pages into a new standalone PDF."""
        ...

    def merge_documents(self, sources: list[Path], destination: Path) -> None:
        """Combines multiple source PDFs in order into destination."""
        ...

    def resize_pages(
        self,
        source: Path,
        destination: Path,
        target_size: str,
        page_indices: list[int] | None = None,
        scale_content: bool = True,
    ) -> None:
        """Resizes pages to standard dimensions (A4, A3, Letter, Legal, Tabloid)."""
        ...

    def crop_pages(
        self,
        source: Path,
        destination: Path,
        left: float,
        top: float,
        right: float,
        bottom: float,
        page_indices: list[int] | None = None,
    ) -> None:
        """Crops page margins by points."""
        ...

    def apply_header_footer(
        self,
        source: Path,
        destination: Path,
        header_left: str | None = None,
        header_center: str | None = None,
        header_right: str | None = None,
        footer_left: str | None = None,
        footer_center: str | None = None,
        footer_right: str | None = None,
        font_size: float = 9.0,
        font_color: str = "#333333",
        margin: float = 36.0,
        skip_first_page: bool = False,
        start_number: int = 1,
        page_indices: list[int] | None = None,
        document_title: str = "",
    ) -> None:
        """Applies dynamic header, footer, and page numbers via lossless vector overlays."""
        ...

    def apply_annotations(
        self,
        source: Path,
        destination: Path,
        page_index: int,
        texts: list[dict],
        shapes: list[dict],
    ) -> None:
        """Applies styled text overlays, shapes, highlights, and hyperlinks."""
        ...

    def replace_native_text(
        self,
        source: Path,
        destination: Path,
        page_index: int,
        target_text: str,
        replacement_text: str,
    ) -> bool:
        """Modifies existing content stream text where encoding permits."""
        ...

    def validate(self, source: Path) -> PdfInspection:
        """Validates that a generated or existing file is a valid PDF."""
        ...

    def get_page_count(self, source: Path) -> int:
        """Returns the total number of pages in the PDF."""
        ...


class PyPdfEngine:
    """Production local PDF engine implementation using pypdf (BSD-3-Clause) and ReportLab."""

    def inspect(self, source: Path) -> PdfInspection:
        if not source.exists():
            return PdfInspection(valid=False, warnings=["File does not exist"])

        # Check %PDF- signature
        try:
            with source.open("rb") as f:
                header = f.read(1024)
            if not header.startswith(b"%PDF-"):
                return PdfInspection(valid=False, warnings=["Missing %PDF- header signature"])
            version_str = header[5:8].decode("ascii", errors="replace")
        except Exception as err:
            return PdfInspection(valid=False, warnings=[f"Failed reading header: {err}"])

        # Structural parse
        try:
            reader = pypdf.PdfReader(str(source))
            is_encrypted = reader.is_encrypted
            if is_encrypted:
                return PdfInspection(
                    valid=True,
                    page_count=0,
                    version=version_str,
                    is_encrypted=True,
                    warnings=["PDF is password-protected/encrypted"],
                )

            page_count = len(reader.pages)
            if page_count < 1:
                return PdfInspection(
                    valid=False,
                    warnings=["PDF contains zero pages"],
                )

            # Touch first page to verify xref integrity
            _ = reader.pages[0].mediabox
            return PdfInspection(
                valid=True,
                page_count=page_count,
                version=version_str,
                is_encrypted=False,
            )
        except (PdfReadError, Exception) as err:
            return PdfInspection(valid=False, warnings=[f"Structural parsing error: {err}"])

    def validate(self, source: Path) -> PdfInspection:
        return self.inspect(source)

    def get_page_count(self, source: Path) -> int:
        inspection = self.inspect(source)
        if not inspection.valid:
            raise ValueError(f"Cannot count pages of invalid PDF: {inspection.warnings}")
        return inspection.page_count

    def _write_atomic(self, writer: pypdf.PdfWriter, destination: Path) -> None:
        destination.parent.mkdir(parents=True, exist_ok=True)
        temp_dest = destination.with_suffix(".tmp_op")
        try:
            with temp_dest.open("wb") as out_f:
                writer.write(out_f)
                out_f.flush()
                os.fsync(out_f.fileno())
            temp_dest.replace(destination)
        except Exception:
            temp_dest.unlink(missing_ok=True)
            raise

    def rotate_page(self, source: Path, destination: Path, page_index: int, degrees: int) -> None:
        if not source.exists():
            raise FileNotFoundError(f"Source PDF does not exist: {source}")

        if degrees % 90 != 0:
            raise ValueError(f"Rotation degrees must be a multiple of 90: got {degrees}")

        reader = pypdf.PdfReader(str(source))
        if reader.is_encrypted:
            raise ValueError("Cannot rotate pages of an encrypted PDF without password")

        total_pages = len(reader.pages)
        if page_index < 0 or page_index >= total_pages:
            raise IndexError(f"Page index {page_index} out of range (0..{total_pages - 1})")

        writer = pypdf.PdfWriter()
        for i, page in enumerate(reader.pages):
            if i == page_index:
                page.rotate(degrees)
            writer.add_page(page)

        self._write_atomic(writer, destination)

    def reorder_pages(self, source: Path, destination: Path, new_order: list[int]) -> None:
        if not source.exists():
            raise FileNotFoundError(f"Source PDF does not exist: {source}")

        reader = pypdf.PdfReader(str(source))
        if reader.is_encrypted:
            raise ValueError("Cannot reorder pages of an encrypted PDF")

        total_pages = len(reader.pages)
        if len(new_order) != total_pages:
            raise ValueError(
                f"New page order count ({len(new_order)}) must equal total pages ({total_pages})"
            )

        if sorted(new_order) != list(range(total_pages)):
            raise ValueError(f"New page order must be a valid permutation of 0..{total_pages - 1}")

        writer = pypdf.PdfWriter()
        for page_idx in new_order:
            writer.add_page(reader.pages[page_idx])

        self._write_atomic(writer, destination)

    def delete_pages(self, source: Path, destination: Path, pages_to_delete: list[int]) -> None:
        if not source.exists():
            raise FileNotFoundError(f"Source PDF does not exist: {source}")

        reader = pypdf.PdfReader(str(source))
        if reader.is_encrypted:
            raise ValueError("Cannot delete pages of an encrypted PDF")

        total_pages = len(reader.pages)
        delete_set = set(pages_to_delete)

        for p in delete_set:
            if p < 0 or p >= total_pages:
                raise IndexError(f"Delete page index {p} out of range (0..{total_pages - 1})")

        if len(delete_set) >= total_pages:
            raise ValueError("Cannot delete all pages of a PDF document; at least 1 page must remain")

        writer = pypdf.PdfWriter()
        for i, page in enumerate(reader.pages):
            if i not in delete_set:
                writer.add_page(page)

        self._write_atomic(writer, destination)

    def duplicate_page(self, source: Path, destination: Path, page_index: int, count: int = 1) -> None:
        if not source.exists():
            raise FileNotFoundError(f"Source PDF does not exist: {source}")

        reader = pypdf.PdfReader(str(source))
        if reader.is_encrypted:
            raise ValueError("Cannot duplicate pages of an encrypted PDF")

        total_pages = len(reader.pages)
        if page_index < 0 or page_index >= total_pages:
            raise IndexError(f"Page index {page_index} out of range (0..{total_pages - 1})")

        writer = pypdf.PdfWriter()
        for i, page in enumerate(reader.pages):
            writer.add_page(page)
            if i == page_index:
                for _ in range(count):
                    writer.add_page(reader.pages[page_index])

        self._write_atomic(writer, destination)

    def extract_pages(self, source: Path, destination: Path, page_indices: list[int]) -> None:
        if not source.exists():
            raise FileNotFoundError(f"Source PDF does not exist: {source}")

        if not page_indices:
            raise ValueError("Page indices to extract cannot be empty")

        reader = pypdf.PdfReader(str(source))
        if reader.is_encrypted:
            raise ValueError("Cannot extract pages of an encrypted PDF")

        total_pages = len(reader.pages)
        for p in page_indices:
            if p < 0 or p >= total_pages:
                raise IndexError(f"Extract page index {p} out of range (0..{total_pages - 1})")

        writer = pypdf.PdfWriter()
        for idx in page_indices:
            writer.add_page(reader.pages[idx])

        self._write_atomic(writer, destination)

    def merge_documents(self, sources: list[Path], destination: Path) -> None:
        if len(sources) < 2:
            raise ValueError("At least 2 source PDF documents are required to merge")

        writer = pypdf.PdfWriter()
        for src in sources:
            if not src.exists():
                raise FileNotFoundError(f"Source PDF does not exist: {src}")
            reader = pypdf.PdfReader(str(src))
            if reader.is_encrypted:
                raise ValueError(f"Cannot merge encrypted PDF: {src.name}")
            for page in reader.pages:
                writer.add_page(page)

        self._write_atomic(writer, destination)

    def resize_pages(
        self,
        source: Path,
        destination: Path,
        target_size: str,
        page_indices: list[int] | None = None,
        scale_content: bool = True,
    ) -> None:
        if not source.exists():
            raise FileNotFoundError(f"Source PDF does not exist: {source}")

        norm_size = target_size.strip().upper()
        if norm_size not in PAPER_SIZES:
            valid_sizes = ", ".join(PAPER_SIZES.keys())
            raise ValueError(f"Unsupported target size '{target_size}'. Choose from: {valid_sizes}")

        target_width, target_height = PAPER_SIZES[norm_size]
        reader = pypdf.PdfReader(str(source))
        if reader.is_encrypted:
            raise ValueError("Cannot resize encrypted PDF")

        total_pages = len(reader.pages)
        target_set = set(page_indices) if page_indices is not None else set(range(total_pages))

        for p in target_set:
            if p < 0 or p >= total_pages:
                raise IndexError(f"Page index {p} out of range (0..{total_pages - 1})")

        writer = pypdf.PdfWriter()
        for i, page in enumerate(reader.pages):
            if i in target_set:
                if scale_content:
                    page.scale_to(target_width, target_height)
                else:
                    page.mediabox.upper_right = (target_width, target_height)
            writer.add_page(page)

        self._write_atomic(writer, destination)

    def crop_pages(
        self,
        source: Path,
        destination: Path,
        left: float,
        top: float,
        right: float,
        bottom: float,
        page_indices: list[int] | None = None,
    ) -> None:
        if not source.exists():
            raise FileNotFoundError(f"Source PDF does not exist: {source}")

        reader = pypdf.PdfReader(str(source))
        if reader.is_encrypted:
            raise ValueError("Cannot crop encrypted PDF")

        total_pages = len(reader.pages)
        target_set = set(page_indices) if page_indices is not None else set(range(total_pages))

        for p in target_set:
            if p < 0 or p >= total_pages:
                raise IndexError(f"Page index {p} out of range (0..{total_pages - 1})")

        writer = pypdf.PdfWriter()
        for i, page in enumerate(reader.pages):
            if i in target_set:
                cb = page.cropbox
                width = float(cb.width)
                height = float(cb.height)

                if left + right >= width or top + bottom >= height:
                    raise ValueError(
                        f"Crop margins (left={left}, right={right}, top={top}, bottom={bottom}) "
                        f"exceed page dimensions ({width:.1f} x {height:.1f} pt)"
                    )

                cb.lower_left = (float(cb.lower_left[0]) + left, float(cb.lower_left[1]) + bottom)
                cb.upper_right = (float(cb.upper_right[0]) - right, float(cb.upper_right[1]) - top)
            writer.add_page(page)

        self._write_atomic(writer, destination)

    def apply_header_footer(
        self,
        source: Path,
        destination: Path,
        header_left: str | None = None,
        header_center: str | None = None,
        header_right: str | None = None,
        footer_left: str | None = None,
        footer_center: str | None = None,
        footer_right: str | None = None,
        font_size: float = 9.0,
        font_color: str = "#333333",
        margin: float = 36.0,
        skip_first_page: bool = False,
        start_number: int = 1,
        page_indices: list[int] | None = None,
        document_title: str = "",
    ) -> None:
        if not source.exists():
            raise FileNotFoundError(f"Source PDF does not exist: {source}")

        reader = pypdf.PdfReader(str(source))
        if reader.is_encrypted:
            raise ValueError("Cannot apply headers/footers to encrypted PDF")

        total_pages = len(reader.pages)
        target_set = set(page_indices) if page_indices is not None else set(range(total_pages))

        try:
            color = HexColor(font_color)
        except Exception:
            color = HexColor("#333333")

        writer = pypdf.PdfWriter()

        for i, page in enumerate(reader.pages):
            if i in target_set and not (i == 0 and skip_first_page):
                page_width = float(page.mediabox.width)
                page_height = float(page.mediabox.height)

                page_num = start_number + i
                total_num = total_pages

                def format_token(text: str | None) -> str:
                    if not text:
                        return ""
                    return (
                        text.replace("{page}", str(page_num))
                        .replace("{total}", str(total_num))
                        .replace("{title}", document_title)
                    )

                hl = format_token(header_left)
                hc = format_token(header_center)
                hr = format_token(header_right)
                fl = format_token(footer_left)
                fc = format_token(footer_center)
                fr = format_token(footer_right)

                overlay_buf = BytesIO()
                canv = rl_canvas.Canvas(overlay_buf, pagesize=(page_width, page_height))
                canv.setFont("Helvetica", font_size)
                canv.setFillColor(color)

                header_y = page_height - margin
                footer_y = margin

                if hl:
                    canv.drawString(margin, header_y, hl)
                if hc:
                    canv.drawCentredString(page_width / 2.0, header_y, hc)
                if hr:
                    canv.drawRightString(page_width - margin, header_y, hr)

                if fl:
                    canv.drawString(margin, footer_y, fl)
                if fc:
                    canv.drawCentredString(page_width / 2.0, footer_y, fc)
                if fr:
                    canv.drawRightString(page_width - margin, footer_y, fr)

                canv.showPage()
                canv.save()
                overlay_buf.seek(0)

                overlay_reader = pypdf.PdfReader(overlay_buf)
                target_page = writer.add_page(page)
                target_page.merge_page(overlay_reader.pages[0])
            else:
                writer.add_page(page)

        self._write_atomic(writer, destination)

    def apply_annotations(
        self,
        source: Path,
        destination: Path,
        page_index: int,
        texts: list[dict],
        shapes: list[dict],
    ) -> None:
        """Applies styled text overlays, shapes, highlights, and hyperlinks."""
        if not source.exists():
            raise FileNotFoundError(f"Source PDF does not exist: {source}")

        reader = pypdf.PdfReader(str(source))
        if reader.is_encrypted:
            raise ValueError("Cannot annotate encrypted PDF")

        total_pages = len(reader.pages)
        if page_index < 0 or page_index >= total_pages:
            raise IndexError(f"Page index {page_index} out of range (0..{total_pages - 1})")

        writer = pypdf.PdfWriter()

        for i, page in enumerate(reader.pages):
            if i == page_index:
                page_width = float(page.mediabox.width)
                page_height = float(page.mediabox.height)

                overlay_buf = BytesIO()
                canv = rl_canvas.Canvas(overlay_buf, pagesize=(page_width, page_height))

                # 1. Render shapes & highlights
                for s in shapes:
                    color_hex = s.get("color", "#fde047")
                    try:
                        color = HexColor(color_hex)
                    except Exception:
                        color = HexColor("#fde047")

                    opacity = float(s.get("opacity", 0.4))
                    canv.setFillAlpha(opacity)
                    canv.setStrokeAlpha(min(1.0, opacity + 0.3))
                    canv.setFillColor(color)
                    canv.setStrokeColor(color)
                    canv.setLineWidth(float(s.get("stroke_width", 1.0)))

                    sx = float(s.get("x", 0))
                    sy = float(s.get("y", 0))
                    sw = float(s.get("width", 50))
                    sh = float(s.get("height", 20))
                    stype = s.get("type", "highlight")

                    if stype == "line":
                        canv.line(sx, sy, sx + sw, sy + sh)
                    else:
                        canv.rect(sx, sy, sw, sh, fill=int(s.get("fill", True)), stroke=1)

                # 2. Render text annotations & hyperlinks
                for t in texts:
                    canv.setFillAlpha(1.0)
                    canv.setStrokeAlpha(1.0)

                    tx = float(t.get("x", 50))
                    ty = float(t.get("y", 50))
                    text_str = str(t.get("text", ""))
                    font_name = t.get("font_name", "Helvetica")
                    font_size = float(t.get("font_size", 12.0))

                    if font_name not in ["Helvetica", "Times-Roman", "Courier"]:
                        font_name = "Helvetica"

                    canv.setFont(font_name, font_size)

                    color_hex = t.get("color", "#000000")
                    try:
                        text_color = HexColor(color_hex)
                    except Exception:
                        text_color = HexColor("#000000")

                    # Background rectangle if specified
                    bg_hex = t.get("background_color")
                    if bg_hex:
                        try:
                            canv.setFillColor(HexColor(bg_hex))
                            str_w = canv.stringWidth(text_str, font_name, font_size)
                            canv.rect(tx - 2, ty - 2, str_w + 4, font_size + 4, fill=1, stroke=0)
                        except Exception:
                            pass

                    canv.setFillColor(text_color)
                    canv.drawString(tx, ty, text_str)

                    # Hyperlink support
                    link_url = t.get("link_url")
                    if link_url:
                        str_w = canv.stringWidth(text_str, font_name, font_size)
                        canv.linkURL(link_url, (tx, ty - 2, tx + str_w, ty + font_size + 2))

                canv.showPage()
                canv.save()
                overlay_buf.seek(0)

                overlay_reader = pypdf.PdfReader(overlay_buf)
                target_page = writer.add_page(page)
                target_page.merge_page(overlay_reader.pages[0])
            else:
                writer.add_page(page)

        self._write_atomic(writer, destination)

    def replace_native_text(
        self,
        source: Path,
        destination: Path,
        page_index: int,
        target_text: str,
        replacement_text: str,
    ) -> bool:
        """Modifies existing content stream text where encoding permits."""
        if not source.exists():
            raise FileNotFoundError(f"Source PDF does not exist: {source}")

        reader = pypdf.PdfReader(str(source))
        if reader.is_encrypted:
            raise ValueError("Cannot edit encrypted PDF")

        total_pages = len(reader.pages)
        if page_index < 0 or page_index >= total_pages:
            raise IndexError(f"Page index {page_index} out of range (0..{total_pages - 1})")

        writer = pypdf.PdfWriter()
        found = False

        for i, page in enumerate(reader.pages):
            added_page = writer.add_page(page)
            if i == page_index:
                contents = page.get_contents()
                if contents is not None:
                    data = contents.get_data()
                    target_b = target_text.encode("utf-8")
                    repl_b = replacement_text.encode("utf-8")

                    if target_b in data:
                        new_data = data.replace(target_b, repl_b)
                        new_stream = DecodedStreamObject()
                        new_stream.set_data(new_data)
                        added_page[NameObject("/Contents")] = new_stream
                        found = True
                    else:
                        # Try ascii/latin-1
                        target_l = target_text.encode("latin-1", errors="ignore")
                        repl_l = replacement_text.encode("latin-1", errors="ignore")
                        if target_l in data:
                            new_data = data.replace(target_l, repl_l)
                            new_stream = DecodedStreamObject()
                            new_stream.set_data(new_data)
                            added_page[NameObject("/Contents")] = new_stream
                            found = True

        if not found:
            raise ValueError(
                f"Target text '{target_text}' could not be matched directly in the page's uncompressed stream. "
                "PDFs with subset-embedded fonts or glyph-mapped TJ arrays require text overlays or OCR reconstruction."
            )

        self._write_atomic(writer, destination)
        return True
