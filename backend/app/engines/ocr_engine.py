from pathlib import Path
import os
from typing import Protocol
import pymupdf as fitz
from ..models import DocumentOcrInspection, OcrBlock, OcrWord, PageOcrResult


class OcrDependencyMissingError(RuntimeError):
    """Raised when local OCR traineddata or Tesseract library is unavailable."""
    pass


class OcrEngine(Protocol):
    def is_ocr_available(self) -> bool:
        """Returns True if local OCR traineddata and engine are ready."""
        ...

    def inspect_scanned_pages(self, source: Path) -> DocumentOcrInspection:
        """Inspects document pages to detect which pages are scanned raster images vs. native text."""
        ...

    def recognize_page_text(
        self,
        source: Path,
        page_index: int,
        language: str = "eng",
        dpi: int = 150,
    ) -> PageOcrResult:
        """Runs OCR on a specific page, returning extracted text, word bounding boxes, and blocks."""
        ...

    def make_searchable_pdf(
        self,
        source: Path,
        destination: Path,
        page_indices: list[int] | None = None,
        language: str = "eng",
        dpi: int = 150,
    ) -> int:
        """Injects an invisible searchable text layer aligned with the scanned image and writes to destination."""
        ...

    def correct_scanned_region(
        self,
        source: Path,
        destination: Path,
        page_index: int,
        bbox: tuple[float, float, float, float],
        replacement_text: str,
        font_name: str = "Helvetica",
        font_size: float | None = None,
        text_color: str = "#000000",
        background_color: str = "#FFFFFF",
        cleanup_raster: bool = True,
    ) -> None:
        """Corrects text in a scanned region: redacts/patches raster background and overlays clean vector text."""
        ...

    def reconstruct_scanned_page(
        self,
        source: Path,
        destination: Path,
        page_indices: list[int] | None = None,
        mode: str = "clean_vector",
        font_name: str = "Helvetica",
        language: str = "eng",
        dpi: int = 150,
    ) -> int:
        """Reconstructs scanned pages into editable clean vector layouts."""
        ...


class LocalOcrEngine:
    """Production local OCR engine using PyMuPDF's embedded Tesseract C++ engine with local tessdata."""

    FONT_MAP = {
        "helvetica": "helv",
        "helvetica-bold": "hebo",
        "times": "times-roman",
        "times-roman": "times-roman",
        "times-bold": "times-bold",
        "courier": "courier",
        "courier-bold": "courier-bold",
    }

    def __init__(self, tessdata_dir: Path | None = None) -> None:
        if tessdata_dir is not None:
            self.tessdata_dir = tessdata_dir
        else:
            # Default to local_data/tessdata in project root
            self.tessdata_dir = Path(__file__).resolve().parent.parent.parent.parent / "local_data" / "tessdata"

    def _resolve_tessdata(self) -> str | None:
        # 1. Check self.tessdata_dir
        if self.tessdata_dir.exists() and (self.tessdata_dir / "eng.traineddata").exists():
            return str(self.tessdata_dir.resolve())

        # 2. Check TESSDATA_PREFIX environment variable
        env_prefix = os.environ.get("TESSDATA_PREFIX")
        if env_prefix and Path(env_prefix).exists():
            return env_prefix

        # 3. Check Program Files Tesseract-OCR
        prog_files = Path(r"C:\Program Files\Tesseract-OCR\tessdata")
        if prog_files.exists():
            return str(prog_files)

        return None

    @staticmethod
    def _hex_to_rgb(hex_str: str) -> tuple[float, float, float]:
        cleaned = hex_str.lstrip("#")
        if len(cleaned) == 3:
            cleaned = "".join(c * 2 for c in cleaned)
        if len(cleaned) != 6:
            return (0.0, 0.0, 0.0)
        try:
            r = int(cleaned[0:2], 16) / 255.0
            g = int(cleaned[2:4], 16) / 255.0
            b = int(cleaned[4:6], 16) / 255.0
            return (r, g, b)
        except ValueError:
            return (0.0, 0.0, 0.0)

    @classmethod
    def _insert_text_into_rect(
        cls,
        page: fitz.Page,
        rect: fitz.Rect,
        text: str,
        fontsize: float | None = None,
        fontname: str = "helv",
        color: tuple[float, float, float] = (0.0, 0.0, 0.0),
    ) -> None:
        """Inserts text into a bounding box, automatically auto-scaling font size to ensure a perfect fit."""
        target_rect = fitz.Rect(rect) + (-1.0, -1.0, 4.0, 3.0)
        start_fs = fontsize if (fontsize is not None and fontsize > 0) else max(6.0, min(36.0, target_rect.height * 0.75))
        curr_fs = start_fs
        fitted = False
        for _ in range(8):
            res = page.insert_textbox(
                target_rect,
                text,
                fontsize=curr_fs,
                fontname=fontname,
                color=color,
            )
            if res >= 0:
                fitted = True
                break
            curr_fs = max(5.0, curr_fs - 1.0)

        if not fitted:
            # Fallback to direct insertion at target origin if tight textbox overflows
            page.insert_text(
                (target_rect.x0, target_rect.y0 + start_fs),
                text,
                fontsize=start_fs,
                fontname=fontname,
                color=color,
            )

    def is_ocr_available(self) -> bool:
        return self._resolve_tessdata() is not None

    def inspect_scanned_pages(self, source: Path) -> DocumentOcrInspection:
        if not source.exists():
            raise FileNotFoundError(f"Source PDF does not exist: {source}")

        doc = fitz.open(str(source))
        total_pages = len(doc)
        scanned_pages: list[int] = []
        text_pages: list[int] = []

        for idx, page in enumerate(doc):
            native_chars = len(page.get_text().strip())
            images = page.get_images()
            # If native text is negligible (< 25 characters) and at least one raster image exists
            if native_chars < 25 and len(images) > 0:
                scanned_pages.append(idx)
            else:
                text_pages.append(idx)

        doc.close()
        return DocumentOcrInspection(
            total_pages=total_pages,
            scanned_pages=scanned_pages,
            text_pages=text_pages,
        )

    def recognize_page_text(
        self,
        source: Path,
        page_index: int,
        language: str = "eng",
        dpi: int = 150,
    ) -> PageOcrResult:
        if not source.exists():
            raise FileNotFoundError(f"Source PDF does not exist: {source}")

        tess_path = self._resolve_tessdata()
        if not tess_path:
            raise OcrDependencyMissingError(
                "Local OCR requires Tesseract traineddata. "
                f"Missing eng.traineddata in {self.tessdata_dir}. "
                "Ensure local_data/tessdata/eng.traineddata is installed."
            )

        doc = fitz.open(str(source))
        total_pages = len(doc)
        if page_index < 0 or page_index >= total_pages:
            doc.close()
            raise IndexError(f"Page index {page_index} out of range (0..{total_pages - 1})")

        page = doc[page_index]
        native_text = page.get_text().strip()
        has_native = len(native_text) >= 25
        is_scanned = len(native_text) < 25 and len(page.get_images()) > 0

        # Perform OCR
        clamped_dpi = max(72, min(300, dpi))
        textpage = page.get_textpage_ocr(
            tessdata=tess_path,
            language=language,
            dpi=clamped_dpi,
            full=True,
        )

        extracted_text = page.get_text(textpage=textpage)
        raw_words = page.get_text("words", textpage=textpage)
        raw_blocks = page.get_text("blocks", textpage=textpage)

        ocr_words: list[OcrWord] = []
        for w in raw_words:
            # (x0, y0, x1, y1, word, block_no, line_no, word_no)
            ocr_words.append(
                OcrWord(
                    text=w[4],
                    bbox=(round(w[0], 2), round(w[1], 2), round(w[2], 2), round(w[3], 2)),
                )
            )

        ocr_blocks: list[OcrBlock] = []
        for b in raw_blocks:
            # (x0, y0, x1, y1, text, block_no, block_type)
            if b[6] == 0:  # Text block
                block_txt = b[4].strip()
                if block_txt:
                    ocr_blocks.append(
                        OcrBlock(
                            block_no=b[5],
                            bbox=(round(b[0], 2), round(b[1], 2), round(b[2], 2), round(b[3], 2)),
                            text=block_txt,
                            lines=[ln.strip() for ln in b[4].splitlines() if ln.strip()],
                        )
                    )

        doc.close()
        return PageOcrResult(
            page_index=page_index,
            has_native_text=has_native,
            is_scanned=is_scanned,
            extracted_text=extracted_text,
            word_count=len(ocr_words),
            words=ocr_words,
            blocks=ocr_blocks,
        )

    def make_searchable_pdf(
        self,
        source: Path,
        destination: Path,
        page_indices: list[int] | None = None,
        language: str = "eng",
        dpi: int = 150,
    ) -> int:
        if not source.exists():
            raise FileNotFoundError(f"Source PDF does not exist: {source}")

        tess_path = self._resolve_tessdata()
        if not tess_path:
            raise OcrDependencyMissingError(
                "Local OCR requires Tesseract traineddata. "
                f"Missing eng.traineddata in {self.tessdata_dir}."
            )

        destination.parent.mkdir(parents=True, exist_ok=True)
        temp_dest = destination.parent / f"{destination.stem}_ocr_atomic.tmp"

        doc = fitz.open(str(source))
        total_pages = len(doc)

        target_pages: list[int]
        if page_indices is not None:
            target_pages = [p for p in page_indices if 0 <= p < total_pages]
        else:
            inspection = self.inspect_scanned_pages(source)
            target_pages = inspection.scanned_pages if inspection.scanned_pages else list(range(total_pages))

        clamped_dpi = max(72, min(300, dpi))
        processed_count = 0

        try:
            for p_idx in target_pages:
                page = doc[p_idx]
                textpage = page.get_textpage_ocr(
                    tessdata=tess_path,
                    language=language,
                    dpi=clamped_dpi,
                    full=True,
                )
                raw_words = page.get_text("words", textpage=textpage)

                # Inject invisible text layer (render_mode=3: neither fill nor stroke)
                for w in raw_words:
                    x0, y0, x1, y1, word = w[0], w[1], w[2], w[3], w[4]
                    font_height = max(5.0, (y1 - y0) * 0.9)
                    page.insert_text(
                        (x0, y1),
                        word,
                        fontsize=font_height,
                        render_mode=3,
                    )

                processed_count += 1

            doc.save(str(temp_dest), garbage=3, deflate=True)
            doc.close()
            temp_dest.replace(destination)
            return processed_count
        finally:
            if temp_dest.exists():
                temp_dest.unlink(missing_ok=True)

    def correct_scanned_region(
        self,
        source: Path,
        destination: Path,
        page_index: int,
        bbox: tuple[float, float, float, float],
        replacement_text: str,
        font_name: str = "Helvetica",
        font_size: float | None = None,
        text_color: str = "#000000",
        background_color: str = "#FFFFFF",
        cleanup_raster: bool = True,
    ) -> None:
        """Corrects a region in a scanned PDF by cleaning/patching raster pixels and overlaying crisp vector text."""
        if not source.exists():
            raise FileNotFoundError(f"Source PDF does not exist: {source}")

        if bbox[0] >= bbox[2] or bbox[1] >= bbox[3]:
            raise ValueError(
                f"Invalid bounding box [x0={bbox[0]}, y0={bbox[1]}, x1={bbox[2]}, y1={bbox[3]}]: "
                "x1 must be greater than x0 and y1 must be greater than y0."
            )

        destination.parent.mkdir(parents=True, exist_ok=True)
        temp_dest = destination.parent / f"{destination.stem}_region_atomic.tmp"

        doc = fitz.open(str(source))
        total_pages = len(doc)
        if page_index < 0 or page_index >= total_pages:
            doc.close()
            raise IndexError(f"Page index {page_index} out of range (0..{total_pages - 1})")

        page = doc[page_index]
        rect = fitz.Rect(bbox[0], bbox[1], bbox[2], bbox[3])
        bg_rgb = self._hex_to_rgb(background_color)
        txt_rgb = self._hex_to_rgb(text_color)
        fitz_font = self.FONT_MAP.get(font_name.lower(), "helv")

        try:
            # 1. Clean or patch raster background
            if cleanup_raster:
                # Add redaction annotation to physically clean the underlying raster pixels
                page.add_redact_annot(rect, fill=bg_rgb)
                page.apply_redactions()
            else:
                # Opaque vector rectangle fill overlay
                page.draw_rect(rect, color=None, fill=bg_rgb)

            # 2. Render replacement vector typography
            if replacement_text.strip():
                self._insert_text_into_rect(
                    page=page,
                    rect=rect,
                    text=replacement_text,
                    fontsize=font_size,
                    fontname=fitz_font,
                    color=txt_rgb,
                )

            doc.save(str(temp_dest), garbage=3, deflate=True)
            doc.close()
            temp_dest.replace(destination)
        finally:
            if temp_dest.exists():
                temp_dest.unlink(missing_ok=True)

    def reconstruct_scanned_page(
        self,
        source: Path,
        destination: Path,
        page_indices: list[int] | None = None,
        mode: str = "clean_vector",
        font_name: str = "Helvetica",
        language: str = "eng",
        dpi: int = 150,
    ) -> int:
        """Reconstructs scanned pages into editable clean vector layouts."""
        if not source.exists():
            raise FileNotFoundError(f"Source PDF does not exist: {source}")

        tess_path = self._resolve_tessdata()
        if not tess_path:
            raise OcrDependencyMissingError(
                "Local OCR requires Tesseract traineddata. "
                f"Missing eng.traineddata in {self.tessdata_dir}."
            )

        destination.parent.mkdir(parents=True, exist_ok=True)
        temp_dest = destination.parent / f"{destination.stem}_recon_atomic.tmp"

        src_doc = fitz.open(str(source))
        total_pages = len(src_doc)
        target_pages = (
            [p for p in page_indices if 0 <= p < total_pages]
            if page_indices is not None
            else list(range(total_pages))
        )

        clamped_dpi = max(72, min(300, dpi))
        fitz_font = self.FONT_MAP.get(font_name.lower(), "helv")
        processed_count = 0

        try:
            if mode == "clean_vector":
                # Create a fresh clean vector document with identical page dimensions and clean white canvas
                out_doc = fitz.open()
                for p_idx in range(total_pages):
                    src_page = src_doc[p_idx]
                    if p_idx in target_pages:
                        new_page = out_doc.new_page(
                            width=src_page.rect.width,
                            height=src_page.rect.height,
                        )
                        textpage = src_page.get_textpage_ocr(
                            tessdata=tess_path,
                            language=language,
                            dpi=clamped_dpi,
                            full=True,
                        )
                        raw_blocks = src_page.get_text("blocks", textpage=textpage)
                        for b in raw_blocks:
                            if b[6] == 0:  # Text block
                                block_text = b[4].strip()
                                if block_text:
                                    rect = fitz.Rect(b[0], b[1], b[2], b[3])
                                    self._insert_text_into_rect(
                                        page=new_page,
                                        rect=rect,
                                        text=block_text,
                                        fontsize=None,
                                        fontname=fitz_font,
                                        color=(0.0, 0.0, 0.0),
                                    )
                        processed_count += 1
                    else:
                        # Copy native page as-is
                        out_doc.insert_pdf(src_doc, from_page=p_idx, to_page=p_idx)

                out_doc.save(str(temp_dest), garbage=3, deflate=True)
                out_doc.close()
            else:
                # In-place overlay_redact mode: clean raster pixels under each block and re-render vector text
                for p_idx in target_pages:
                    page = src_doc[p_idx]
                    textpage = page.get_textpage_ocr(
                        tessdata=tess_path,
                        language=language,
                        dpi=clamped_dpi,
                        full=True,
                    )
                    raw_blocks = page.get_text("blocks", textpage=textpage)
                    for b in raw_blocks:
                        if b[6] == 0:
                            block_text = b[4].strip()
                            if block_text:
                                rect = fitz.Rect(b[0], b[1], b[2], b[3])
                                page.add_redact_annot(rect, fill=(1.0, 1.0, 1.0))
                    page.apply_redactions()

                    for b in raw_blocks:
                        if b[6] == 0:
                            block_text = b[4].strip()
                            if block_text:
                                rect = fitz.Rect(b[0], b[1], b[2], b[3])
                                self._insert_text_into_rect(
                                    page=page,
                                    rect=rect,
                                    text=block_text,
                                    fontsize=None,
                                    fontname=fitz_font,
                                    color=(0.0, 0.0, 0.0),
                                )
                    processed_count += 1

                src_doc.save(str(temp_dest), garbage=3, deflate=True)

            src_doc.close()
            temp_dest.replace(destination)
            return processed_count
        finally:
            if temp_dest.exists():
                temp_dest.unlink(missing_ok=True)
