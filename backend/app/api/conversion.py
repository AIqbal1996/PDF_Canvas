from io import BytesIO
from pathlib import Path
from tempfile import NamedTemporaryFile
from uuid import UUID
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from ..engines.conversion_engine import (
    ConversionCapabilities,
    ConversionEngine,
    LibreOfficeNotFoundError,
    LocalConversionEngine,
)
from ..engines.pdf_engine import PyPdfEngine
from ..models import DocumentDetail, IngestionResult
from ..repository import SQLiteDocumentRepository
from ..services.document_service import DocumentNotFoundError, DocumentService, InvalidPdfError
from ..storage import LocalImmutableFileStore
from ..config import settings

router = APIRouter(prefix="/api/convert", tags=["conversion"])


def get_conversion_engine() -> ConversionEngine:
    return LocalConversionEngine()


def get_document_service() -> DocumentService:
    store = LocalImmutableFileStore(settings.data_root, settings.max_upload_bytes)
    repo = SQLiteDocumentRepository(settings.database_path)
    engine = PyPdfEngine()
    return DocumentService(store=store, repository=repo, pdf_engine=engine)


@router.get("/status", response_model=ConversionCapabilities)
def get_conversion_status(
    engine: ConversionEngine = Depends(get_conversion_engine),
) -> ConversionCapabilities:
    """Returns local conversion engine capabilities and tool availability."""
    return engine.get_capabilities()


@router.post("/images-to-pdf", response_model=IngestionResult, status_code=status.HTTP_201_CREATED)
async def convert_images_to_pdf(
    files: list[UploadFile] = File(...),
    title: str = Form(default="Images.pdf"),
    page_size: str = Form(default="A4"),
    fit_to_page: bool = Form(default=True),
    conv_engine: ConversionEngine = Depends(get_conversion_engine),
    doc_service: DocumentService = Depends(get_document_service),
) -> IngestionResult:
    """Converts one or more uploaded raster images into a single PDF document in the catalog."""
    if not files:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No image files uploaded")

    image_payloads: list[tuple[str, bytes]] = []
    for f in files:
        content = await f.read()
        image_payloads.append((f.filename or "image.png", content))

    with NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_pdf:
        tmp_path = Path(tmp_pdf.name)

    try:
        conv_engine.convert_images_to_pdf(
            images=image_payloads,
            destination=tmp_path,
            page_size=page_size,
            fit_to_page=fit_to_page,
        )

        safe_title = Path(title or "Images.pdf").name
        if not safe_title.lower().endswith(".pdf"):
            safe_title += ".pdf"

        with tmp_path.open("rb") as f_in:
            doc, rev = doc_service.import_document(safe_title, f_in)

        return IngestionResult(document=doc, revision=rev)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Image conversion failed: {e}")
    finally:
        tmp_path.unlink(missing_ok=True)


@router.post("/text-to-pdf", response_model=IngestionResult, status_code=status.HTTP_201_CREATED)
async def convert_text_to_pdf(
    file: UploadFile | None = File(default=None),
    text: str | None = Form(default=None),
    title: str = Form(default="Notes.pdf"),
    conv_engine: ConversionEngine = Depends(get_conversion_engine),
    doc_service: DocumentService = Depends(get_document_service),
) -> IngestionResult:
    """Converts raw text or an uploaded text/markdown file into a PDF document."""
    raw_content = text or ""
    if file:
        file_bytes = await file.read()
        raw_content = file_bytes.decode("utf-8", errors="replace")

    if not raw_content.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No text content provided for conversion")

    with NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_pdf:
        tmp_path = Path(tmp_pdf.name)

    try:
        safe_title = Path(title or "Notes.pdf").name
        if not safe_title.lower().endswith(".pdf"):
            safe_title += ".pdf"

        conv_engine.convert_text_to_pdf(raw_content, tmp_path, title=safe_title)

        with tmp_path.open("rb") as f_in:
            doc, rev = doc_service.import_document(safe_title, f_in)

        return IngestionResult(document=doc, revision=rev)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Text conversion failed: {e}")
    finally:
        tmp_path.unlink(missing_ok=True)


@router.post("/office-to-pdf", response_model=IngestionResult, status_code=status.HTTP_201_CREATED)
async def convert_office_to_pdf(
    file: UploadFile = File(...),
    conv_engine: ConversionEngine = Depends(get_conversion_engine),
    doc_service: DocumentService = Depends(get_document_service),
) -> IngestionResult:
    """Converts a Microsoft Office document (DOCX, XLSX, PPTX) to PDF using local LibreOffice."""
    caps = conv_engine.get_capabilities()
    if not caps.libreoffice_available:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "LibreOffice is not installed locally. "
                "Local Office document conversion (DOCX, XLSX, PPTX) requires LibreOffice. "
                "Install LibreOffice from https://www.libreoffice.org or run 'winget install LibreOffice.LibreOffice' on your PC."
            ),
        )

    file_suffix = Path(file.filename or "doc.docx").suffix.lower()
    with NamedTemporaryFile(suffix=file_suffix, delete=False) as tmp_src:
        tmp_src_path = Path(tmp_src.name)
        content = await file.read()
        tmp_src.write(content)

    with NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_dst:
        tmp_dst_path = Path(tmp_dst.name)

    try:
        conv_engine.convert_office_to_pdf(tmp_src_path, tmp_dst_path)

        safe_title = Path(file.filename or "Converted.pdf").stem + ".pdf"
        with tmp_dst_path.open("rb") as f_in:
            doc, rev = doc_service.import_document(safe_title, f_in)

        return IngestionResult(document=doc, revision=rev)
    except LibreOfficeNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Office conversion failed: {e}")
    finally:
        tmp_src_path.unlink(missing_ok=True)
        tmp_dst_path.unlink(missing_ok=True)


@router.get("/documents/{document_id}/render-page/{page_index}")
def render_pdf_page(
    document_id: UUID,
    page_index: int,
    scale: float = Query(default=2.0, ge=0.5, le=4.0),
    fmt: str = Query(default="PNG"),
    conv_engine: ConversionEngine = Depends(get_conversion_engine),
    doc_service: DocumentService = Depends(get_document_service),
):
    """Renders a specific page of a PDF document to a raster image (PNG or JPEG)."""
    try:
        doc = doc_service.get_document(document_id)
        rev = doc_service.get_revision(doc.current_revision_id)
        source_path = doc_service.store.path_for(rev.storage_path)

        img_bytes, mime = conv_engine.render_pdf_page_to_image(
            source=source_path,
            page_index=page_index,
            scale=scale,
            fmt=fmt,
        )

        ext = "jpg" if "jpeg" in mime.lower() else "png"
        filename = f"{Path(doc.title).stem}_page_{page_index + 1}.{ext}"
        return Response(
            content=img_bytes,
            media_type=mime,
            headers={"Content-Disposition": f'inline; filename="{filename}"'},
        )
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except IndexError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Rendering failed: {e}")


@router.get("/documents/{document_id}/export-images")
def export_pdf_images(
    document_id: UUID,
    revision_id: UUID | None = Query(default=None),
    pages: str | None = Query(default=None, description="Comma-separated 0-based page indices e.g. 0,1,2"),
    scale: float = Query(default=2.0, ge=0.5, le=4.0),
    fmt: str = Query(default="PNG"),
    conv_engine: ConversionEngine = Depends(get_conversion_engine),
    doc_service: DocumentService = Depends(get_document_service),
):
    """Renders all or selected pages into raster images and returns a downloadable ZIP archive."""
    try:
        doc = doc_service.get_document(document_id)
        target_rev_id = revision_id if revision_id is not None else doc.current_revision_id
        rev = doc_service.get_revision(target_rev_id)
        source_path = doc_service.store.path_for(rev.storage_path)

        page_indices = None
        if pages:
            page_indices = [int(p.strip()) for p in pages.split(",") if p.strip().isdigit()]

        zip_bytes = conv_engine.render_pdf_to_zip(
            source=source_path,
            page_indices=page_indices,
            scale=scale,
            fmt=fmt,
        )

        zip_name = f"{Path(doc.title).stem}_images.zip"
        return Response(
            content=zip_bytes,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{zip_name}"'},
        )
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except (IndexError, ValueError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Exporting images failed: {e}")
