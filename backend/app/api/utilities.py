from io import BytesIO
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from ..config import settings
from ..engines.pdf_engine import PyPdfEngine
from ..engines.security_engine import LocalSecurityEngine, SecurityEngine
from ..engines.utilities_engine import LocalUtilitiesEngine, UtilitiesEngine
from ..models import (
    BatchUtilityRequest,
    BatchUtilityResponse,
    BookmarkItem,
    CompareDocumentsRequest,
    CompressionResult,
    CompressPdfRequest,
    DocumentBookmarks,
    DocumentComparisonReport,
    IngestionResult,
    UpdateBookmarksRequest,
    WatermarkRequest,
)
from ..repository import SQLiteDocumentRepository
from ..services.document_service import DocumentNotFoundError, DocumentService
from ..storage import LocalImmutableFileStore

router = APIRouter(prefix="/api/utilities", tags=["utilities"])


def get_utilities_engine() -> UtilitiesEngine:
    return LocalUtilitiesEngine()


def get_security_engine() -> SecurityEngine:
    return LocalSecurityEngine()


def get_document_service() -> DocumentService:
    store = LocalImmutableFileStore(settings.data_root, settings.max_upload_bytes)
    repo = SQLiteDocumentRepository(settings.database_path)
    engine = PyPdfEngine()
    return DocumentService(store=store, repository=repo, pdf_engine=engine)


@router.post("/documents/{document_id}/watermark", response_model=IngestionResult)
def apply_document_watermark(
    document_id: UUID,
    request: WatermarkRequest,
    service: DocumentService = Depends(get_document_service),
    engine: UtilitiesEngine = Depends(get_utilities_engine),
) -> IngestionResult:
    """Applies a transparent or tiled vector watermark overlay across selected or all pages."""
    try:
        doc, rev = service.apply_watermark(
            document_id=document_id,
            request=request,
            utilities_engine=engine,
        )
        return IngestionResult(document=doc, revision=rev)
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except (ValueError, IndexError) as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Watermark application failed: {err}",
        )


@router.post("/documents/{document_id}/compress", response_model=CompressionResult)
def compress_document_pdf(
    document_id: UUID,
    request: CompressPdfRequest,
    service: DocumentService = Depends(get_document_service),
    engine: UtilitiesEngine = Depends(get_utilities_engine),
) -> CompressionResult:
    """Optimizes PDF size using stream deduplication, deflate, and optional raster downsampling."""
    try:
        return service.compress_document(
            document_id=document_id,
            mode=request.mode,
            utilities_engine=engine,
        )
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PDF compression failed: {err}",
        )


@router.get("/documents/{document_id}/bookmarks", response_model=DocumentBookmarks)
def get_document_bookmarks(
    document_id: UUID,
    service: DocumentService = Depends(get_document_service),
    engine: UtilitiesEngine = Depends(get_utilities_engine),
) -> DocumentBookmarks:
    """Reads hierarchical PDF Table of Contents / outline bookmarks."""
    try:
        return service.get_bookmarks(document_id=document_id, utilities_engine=engine)
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Bookmark inspection failed: {err}",
        )


@router.get("/documents/{document_id}/bookmarks/suggest", response_model=list[BookmarkItem])
def suggest_document_bookmarks(
    document_id: UUID,
    service: DocumentService = Depends(get_document_service),
    engine: UtilitiesEngine = Depends(get_utilities_engine),
) -> list[BookmarkItem]:
    """Deterministically detects prominent headings across pages as draft bookmark entries."""
    try:
        return service.suggest_bookmarks(document_id=document_id, utilities_engine=engine)
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Bookmark auto-detection failed: {err}",
        )


@router.put("/documents/{document_id}/bookmarks", response_model=IngestionResult)
def update_document_bookmarks(
    document_id: UUID,
    request: UpdateBookmarksRequest,
    service: DocumentService = Depends(get_document_service),
    engine: UtilitiesEngine = Depends(get_utilities_engine),
) -> IngestionResult:
    """Replaces the PDF outline / bookmarks with a validated hierarchical TOC revision."""
    try:
        doc, rev = service.update_bookmarks(
            document_id=document_id,
            bookmarks=request.bookmarks,
            utilities_engine=engine,
        )
        return IngestionResult(document=doc, revision=rev)
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except (ValueError, IndexError) as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Bookmark update failed: {err}",
        )


@router.post("/compare", response_model=DocumentComparisonReport)
def compare_pdf_documents(
    request: CompareDocumentsRequest,
    service: DocumentService = Depends(get_document_service),
    engine: UtilitiesEngine = Depends(get_utilities_engine),
) -> DocumentComparisonReport:
    """Compares two PDFs (or two revisions of the same PDF) by text diff and pixel delta."""
    try:
        return service.compare_documents(request=request, utilities_engine=engine)
    except DocumentNotFoundError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err))
    except (ValueError, IndexError) as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Document comparison failed: {err}",
        )


@router.get("/compare-page-image")
def get_compare_page_diff_image(
    doc_a_id: UUID = Query(...),
    doc_b_id: UUID = Query(...),
    page_index: int = Query(ge=0),
    rev_a_id: UUID | None = Query(default=None),
    rev_b_id: UUID | None = Query(default=None),
    dpi: int = Query(default=120, ge=50, le=200),
    service: DocumentService = Depends(get_document_service),
    engine: UtilitiesEngine = Depends(get_utilities_engine),
):
    """Generates a PNG visual overlay highlighting pixel differences between two PDF pages."""
    try:
        png_bytes = service.render_diff_page_image(
            doc_a_id=doc_a_id,
            doc_b_id=doc_b_id,
            page_index=page_index,
            rev_a_id=rev_a_id,
            rev_b_id=rev_b_id,
            dpi=dpi,
            utilities_engine=engine,
        )
        return StreamingResponse(BytesIO(png_bytes), media_type="image/png")
    except DocumentNotFoundError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err))
    except (ValueError, IndexError) as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Visual diff image rendering failed: {err}",
        )


@router.post("/batch", response_model=BatchUtilityResponse)
def run_batch_utility_jobs(
    request: BatchUtilityRequest,
    service: DocumentService = Depends(get_document_service),
    u_engine: UtilitiesEngine = Depends(get_utilities_engine),
    s_engine: SecurityEngine = Depends(get_security_engine),
) -> BatchUtilityResponse:
    """Runs batch watermarking, compression, or metadata sanitization across multiple PDFs cleanly."""
    try:
        return service.run_batch_utility(
            request=request,
            utilities_engine=u_engine,
            security_engine=s_engine,
        )
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Batch utility run failed: {err}",
        )
