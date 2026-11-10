from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from ..config import settings
from ..engines.ocr_engine import LocalOcrEngine, OcrDependencyMissingError, OcrEngine
from ..engines.pdf_engine import PyPdfEngine
from ..models import (
    ApplyOcrRequest,
    DocumentOcrInspection,
    IngestionResult,
    PageOcrResult,
    ScannedReconstructionRequest,
    ScannedRegionCorrectionRequest,
)
from ..repository import SQLiteDocumentRepository
from ..services.document_service import DocumentNotFoundError, DocumentService
from ..storage import LocalImmutableFileStore

router = APIRouter(prefix="/api/ocr", tags=["ocr"])


def get_ocr_engine() -> OcrEngine:
    return LocalOcrEngine(settings.tessdata_path)


def get_document_service() -> DocumentService:
    store = LocalImmutableFileStore(settings.data_root, settings.max_upload_bytes)
    repo = SQLiteDocumentRepository(settings.database_path)
    engine = PyPdfEngine()
    return DocumentService(store=store, repository=repo, pdf_engine=engine)


@router.get("/status")
def get_ocr_status(
    engine: OcrEngine = Depends(get_ocr_engine),
) -> dict:
    """Returns local OCR status and traineddata availability."""
    available = engine.is_ocr_available()
    return {
        "ocr_available": available,
        "tessdata_path": str(settings.tessdata_path.resolve()),
        "engine": "PyMuPDF Local Embedded Tesseract Engine",
        "supported_languages": ["eng"],
    }


@router.get("/documents/{document_id}/inspect", response_model=DocumentOcrInspection)
def inspect_document_ocr(
    document_id: UUID,
    service: DocumentService = Depends(get_document_service),
    engine: OcrEngine = Depends(get_ocr_engine),
) -> DocumentOcrInspection:
    """Inspects all pages in a document to detect which pages are scanned raster images vs. native text."""
    try:
        return service.inspect_scanned_pages(document_id, ocr_engine=engine)
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"OCR inspection failed: {e}")


@router.get("/documents/{document_id}/pages/{page_index}/recognize", response_model=PageOcrResult)
def recognize_page_text(
    document_id: UUID,
    page_index: int,
    language: str = Query(default="eng"),
    dpi: int = Query(default=150, ge=72, le=300),
    service: DocumentService = Depends(get_document_service),
    engine: OcrEngine = Depends(get_ocr_engine),
) -> PageOcrResult:
    """Runs local OCR on a specific page, returning extracted text and word coordinates."""
    try:
        return service.recognize_page_text(
            document_id=document_id,
            page_index=page_index,
            language=language,
            dpi=dpi,
            ocr_engine=engine,
        )
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except IndexError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except OcrDependencyMissingError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"OCR recognition failed: {e}")


@router.post("/documents/{document_id}/apply-searchable-layer", response_model=IngestionResult)
def apply_searchable_layer(
    document_id: UUID,
    request: ApplyOcrRequest,
    service: DocumentService = Depends(get_document_service),
    engine: OcrEngine = Depends(get_ocr_engine),
) -> IngestionResult:
    """Injects an invisible searchable text layer into scanned pages, creating a child revision."""
    try:
        updated_doc, new_rev = service.apply_ocr_searchable_layer(
            document_id=document_id,
            page_indices=request.page_indices,
            language=request.language,
            dpi=request.dpi,
            ocr_engine=engine,
        )
        return IngestionResult(document=updated_doc, revision=new_rev)
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except (IndexError, ValueError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except OcrDependencyMissingError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"OCR layer creation failed: {e}")


@router.post("/documents/{document_id}/correct-scanned-region", response_model=IngestionResult)
def correct_scanned_region(
    document_id: UUID,
    request: ScannedRegionCorrectionRequest,
    service: DocumentService = Depends(get_document_service),
    engine: OcrEngine = Depends(get_ocr_engine),
) -> IngestionResult:
    """Corrects a region in a scanned PDF by cleaning/patching raster pixels and overlaying crisp vector text."""
    try:
        updated_doc, new_rev = service.correct_scanned_region(
            document_id=document_id,
            request=request,
            ocr_engine=engine,
        )
        return IngestionResult(document=updated_doc, revision=new_rev)
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except (IndexError, ValueError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except OcrDependencyMissingError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Scanned region correction failed: {e}")


@router.post("/documents/{document_id}/reconstruct", response_model=IngestionResult)
def reconstruct_scanned_document(
    document_id: UUID,
    request: ScannedReconstructionRequest,
    service: DocumentService = Depends(get_document_service),
    engine: OcrEngine = Depends(get_ocr_engine),
) -> IngestionResult:
    """Reconstructs scanned pages into editable clean vector layouts, either as a child revision or new document."""
    try:
        doc, rev = service.reconstruct_scanned_pages(
            document_id=document_id,
            request=request,
            ocr_engine=engine,
        )
        return IngestionResult(document=doc, revision=rev)
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except (IndexError, ValueError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except OcrDependencyMissingError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Document reconstruction failed: {e}")
