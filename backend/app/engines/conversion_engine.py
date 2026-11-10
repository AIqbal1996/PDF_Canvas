from io import BytesIO
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from typing import Protocol
import zipfile
from PIL import Image as PILImage, ImageOps
import pypdfium2 as pdfium
from pydantic import BaseModel, Field
from reportlab.lib.pagesizes import A4, LETTER, A3, LEGAL
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as rl_canvas


PAGE_SIZES: dict[str, tuple[float, float]] = {
    "A4": A4,
    "LETTER": LETTER,
    "A3": A3,
    "LEGAL": LEGAL,
}


class LibreOfficeNotFoundError(RuntimeError):
    """Raised when LibreOffice CLI binary is required for Office document conversion but missing."""
    pass


class ConversionCapabilities(BaseModel):
    images_to_pdf: bool = True
    pdf_to_images: bool = True
    text_to_pdf: bool = True
    office_to_pdf: bool = False
    libreoffice_available: bool = False
    libreoffice_path: str | None = None
    supported_office_formats: list[str] = Field(
        default_factory=lambda: [".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".odt", ".rtf"]
    )
    supported_image_formats: list[str] = Field(
        default_factory=lambda: [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff"]
    )


class ConversionEngine(Protocol):
    def get_capabilities(self) -> ConversionCapabilities:
        """Returns the conversion capabilities and availability of external local tools."""
        ...

    def convert_images_to_pdf(
        self,
        images: list[tuple[str, bytes]],
        destination: Path,
        page_size: str = "A4",
        margin: float = 36.0,
        fit_to_page: bool = True,
    ) -> None:
        """Converts one or more image files into a single unified PDF."""
        ...

    def convert_text_to_pdf(
        self,
        text: str,
        destination: Path,
        title: str = "Document",
    ) -> None:
        """Converts raw text or markdown into a structured PDF."""
        ...

    def convert_office_to_pdf(
        self,
        source: Path,
        destination: Path,
    ) -> None:
        """Converts an Office document (DOCX, XLSX, PPTX, etc.) to PDF using local LibreOffice."""
        ...

    def render_pdf_page_to_image(
        self,
        source: Path,
        page_index: int,
        scale: float = 2.0,
        fmt: str = "PNG",
    ) -> tuple[bytes, str]:
        """Renders a single PDF page into a high-resolution raster image."""
        ...

    def render_pdf_to_zip(
        self,
        source: Path,
        page_indices: list[int] | None = None,
        scale: float = 2.0,
        fmt: str = "PNG",
    ) -> bytes:
        """Renders multiple or all pages into raster images and bundles them in a ZIP archive."""
        ...


class LocalConversionEngine:
    """Production local-first conversion engine implementation using pypdfium2, Pillow, ReportLab, and LibreOffice."""

    @staticmethod
    def _find_libreoffice() -> str | None:
        """Finds the local LibreOffice soffice binary across PATH and typical installation directories."""
        # 1. Check PATH
        for bin_name in ["soffice", "libreoffice"]:
            found = shutil.which(bin_name)
            if found:
                return found

        # 2. Check standard Windows directories
        candidates = [
            Path(r"C:\Program Files\LibreOffice\program\soffice.exe"),
            Path(r"C:\Program Files (x86)\LibreOffice\program\soffice.exe"),
        ]
        local_app_data = os.environ.get("LOCALAPPDATA")
        if local_app_data:
            candidates.append(Path(local_app_data) / "Programs" / "LibreOffice" / "program" / "soffice.exe")

        for path in candidates:
            if path.exists() and path.is_file():
                return str(path)

        return None

    def get_capabilities(self) -> ConversionCapabilities:
        lo_path = self._find_libreoffice()
        is_lo = lo_path is not None
        return ConversionCapabilities(
            images_to_pdf=True,
            pdf_to_images=True,
            text_to_pdf=True,
            office_to_pdf=is_lo,
            libreoffice_available=is_lo,
            libreoffice_path=lo_path,
        )

    def convert_images_to_pdf(
        self,
        images: list[tuple[str, bytes]],
        destination: Path,
        page_size: str = "A4",
        margin: float = 36.0,
        fit_to_page: bool = True,
    ) -> None:
        """Converts one or more image files into a single unified PDF."""
        if not images:
            raise ValueError("No images provided for conversion")

        destination.parent.mkdir(parents=True, exist_ok=True)
        temp_dest = destination.parent / f"{destination.stem}_atomic.tmp"

        try:
            target_pagesize = PAGE_SIZES.get(page_size.upper(), A4)
            c = rl_canvas.Canvas(str(temp_dest), pagesize=target_pagesize)

            for filename, img_bytes in images:
                # Open with Pillow for untrusted input validation & orientation fix
                try:
                    pil_img = PILImage.open(BytesIO(img_bytes))
                    pil_img = ImageOps.exif_transpose(pil_img) or pil_img
                except Exception as e:
                    raise ValueError(f"File '{filename}' is not a valid or readable image: {e}")

                img_w, img_h = pil_img.size

                if fit_to_page:
                    # Scale to fit standard page dimensions within margins
                    avail_w = target_pagesize[0] - (2 * margin)
                    avail_h = target_pagesize[1] - (2 * margin)
                    scale = min(avail_w / img_w, avail_h / img_h)
                    draw_w = img_w * scale
                    draw_h = img_h * scale
                    draw_x = margin + (avail_w - draw_w) / 2.0
                    draw_y = margin + (avail_h - draw_h) / 2.0

                    c.setPageSize(target_pagesize)
                    c.drawImage(
                        ImageReader(pil_img),
                        draw_x,
                        draw_y,
                        width=draw_w,
                        height=draw_h,
                        mask="auto",
                    )
                else:
                    # Page size exactly matches image dimensions (72 pt per inch standard)
                    page_w = float(img_w)
                    page_h = float(img_h)
                    c.setPageSize((page_w, page_h))
                    c.drawImage(
                        ImageReader(pil_img),
                        0,
                        0,
                        width=page_w,
                        height=page_h,
                        mask="auto",
                    )

                c.showPage()

            c.save()
            temp_dest.replace(destination)
        finally:
            if temp_dest.exists():
                temp_dest.unlink(missing_ok=True)

    def convert_text_to_pdf(
        self,
        text: str,
        destination: Path,
        title: str = "Document",
    ) -> None:
        """Converts raw text or markdown into a structured PDF."""
        destination.parent.mkdir(parents=True, exist_ok=True)
        temp_dest = destination.parent / f"{destination.stem}_atomic.tmp"

        try:
            c = rl_canvas.Canvas(str(temp_dest), pagesize=A4)
            page_w, page_h = A4
            margin = 54.0  # 0.75 in
            y = page_h - margin
            line_height = 14.0

            # Title
            c.setFont("Helvetica-Bold", 14)
            c.drawString(margin, y, title)
            y -= 24.0

            c.setFont("Helvetica", 10)
            for line in text.splitlines():
                if y < margin + 20:
                    c.showPage()
                    c.setFont("Helvetica", 10)
                    y = page_h - margin

                # Clean line
                clean_line = line.replace("\t", "    ")
                # Wrap line if too wide
                max_chars = 85
                while len(clean_line) > max_chars:
                    chunk = clean_line[:max_chars]
                    clean_line = clean_line[max_chars:]
                    c.drawString(margin, y, chunk)
                    y -= line_height
                    if y < margin + 20:
                        c.showPage()
                        c.setFont("Helvetica", 10)
                        y = page_h - margin

                c.drawString(margin, y, clean_line)
                y -= line_height

            c.showPage()
            c.save()
            temp_dest.replace(destination)
        finally:
            if temp_dest.exists():
                temp_dest.unlink(missing_ok=True)

    def convert_office_to_pdf(
        self,
        source: Path,
        destination: Path,
    ) -> None:
        """Converts an Office document (DOCX, XLSX, PPTX, etc.) to PDF using local LibreOffice."""
        if not source.exists():
            raise FileNotFoundError(f"Source Office document does not exist: {source}")

        lo_binary = self._find_libreoffice()
        if not lo_binary:
            raise LibreOfficeNotFoundError(
                "Local Office conversion requires LibreOffice. "
                "LibreOffice was not found on your system PATH or standard install directories. "
                "Please install LibreOffice locally (e.g. from https://www.libreoffice.org or run 'winget install LibreOffice.LibreOffice') "
                "to enable automated conversion of DOCX, XLSX, and PPTX files."
            )

        destination.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="pdf_canvas_lo_") as tmpdir:
            tmp_path = Path(tmpdir)
            cmd = [
                lo_binary,
                "--headless",
                "--convert-to",
                "pdf",
                "--outdir",
                str(tmp_path),
                str(source),
            ]

            try:
                proc = subprocess.run(
                    cmd,
                    check=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    timeout=120,
                )
            except subprocess.TimeoutExpired:
                raise TimeoutError("Office document conversion timed out after 120 seconds")
            except subprocess.CalledProcessError as e:
                err_msg = e.stderr.decode("utf-8", errors="ignore")
                raise RuntimeError(f"LibreOffice conversion failed: {err_msg}")

            # LibreOffice outputs with same stem and .pdf
            expected_pdf = tmp_path / f"{source.stem}.pdf"
            if not expected_pdf.exists():
                # Check if any .pdf was created
                found_pdfs = list(tmp_path.glob("*.pdf"))
                if not found_pdfs:
                    raise RuntimeError("LibreOffice process finished but no output PDF was created")
                expected_pdf = found_pdfs[0]

            shutil.copy2(expected_pdf, destination)

    def render_pdf_page_to_image(
        self,
        source: Path,
        page_index: int,
        scale: float = 2.0,
        fmt: str = "PNG",
    ) -> tuple[bytes, str]:
        """Renders a single PDF page into a raster image (PNG or JPEG)."""
        if not source.exists():
            raise FileNotFoundError(f"Source PDF does not exist: {source}")

        doc = pdfium.PdfDocument(str(source))
        total_pages = len(doc)
        if page_index < 0 or page_index >= total_pages:
            raise IndexError(f"Page index {page_index} out of range (0..{total_pages - 1})")

        clamped_scale = max(0.5, min(4.0, scale))
        page = doc[page_index]
        pil_image = page.render(scale=clamped_scale).to_pil()

        fmt_upper = fmt.upper()
        if fmt_upper not in ["PNG", "JPEG", "JPG"]:
            fmt_upper = "PNG"

        buf = BytesIO()
        if fmt_upper in ["JPEG", "JPG"]:
            pil_image.convert("RGB").save(buf, format="JPEG", quality=90)
            mime = "image/jpeg"
        else:
            pil_image.save(buf, format="PNG")
            mime = "image/png"

        return buf.getvalue(), mime

    def render_pdf_to_zip(
        self,
        source: Path,
        page_indices: list[int] | None = None,
        scale: float = 2.0,
        fmt: str = "PNG",
    ) -> bytes:
        """Renders multiple or all pages into raster images and bundles them in a ZIP archive."""
        if not source.exists():
            raise FileNotFoundError(f"Source PDF does not exist: {source}")

        doc = pdfium.PdfDocument(str(source))
        total_pages = len(doc)

        target_pages = page_indices if page_indices is not None else list(range(total_pages))
        for p in target_pages:
            if p < 0 or p >= total_pages:
                raise IndexError(f"Page index {p} out of range (0..{total_pages - 1})")

        fmt_upper = fmt.upper()
        ext = "jpg" if fmt_upper in ["JPEG", "JPG"] else "png"
        clamped_scale = max(0.5, min(4.0, scale))

        zip_buf = BytesIO()
        with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for p_idx in target_pages:
                page = doc[p_idx]
                pil_im = page.render(scale=clamped_scale).to_pil()
                im_buf = BytesIO()
                if ext == "jpg":
                    pil_im.convert("RGB").save(im_buf, format="JPEG", quality=90)
                else:
                    pil_im.save(im_buf, format="PNG")
                zf.writestr(f"page_{p_idx + 1}.{ext}", im_buf.getvalue())

        return zip_buf.getvalue()
