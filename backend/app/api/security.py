from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status

from ..config import settings
from ..engines.pdf_engine import PyPdfEngine
from ..engines.security_engine import LocalSecurityEngine, SecurityEngine
from ..models import (
    DecryptPdfRequest,
    DocumentSecurityInspection,
    EncryptPdfRequest,
    IngestionResult,
    RedactPdfRequest,
    SanitizeMetadataRequest,
)
from ..repository import SQLiteDocumentRepository
from ..services.document_service import DocumentNotFoundError, DocumentService
from ..storage import LocalImmutableFileStore

router = APIRouter(prefix="/api/security", tags=["security"])


def get_security_engine() -> SecurityEngine:
    return LocalSecurityEngine()


def get_document_service() -> DocumentService:
    store = LocalImmutableFileStore(settings.data_root, settings.max_upload_bytes)
    repo = SQLiteDocumentRepository(settings.database_path)
    engine = PyPdfEngine()
    return DocumentService(store=store, repository=repo, pdf_engine=engine)


@router.get("/documents/{document_id}/inspect", response_model=DocumentSecurityInspection)
def inspect_document_security(
    document_id: UUID,
    service: DocumentService = Depends(get_document_service),
    engine: SecurityEngine = Depends(get_security_engine),
) -> DocumentSecurityInspection:
    """Inspects encryption state, /Info metadata, XMP XML, attachments, and active JS/OpenAction triggers."""
    try:
        return service.inspect_security(document_id, security_engine=engine)
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Security inspection failed: {err}",
        )


@router.post("/documents/{document_id}/encrypt", response_model=IngestionResult)
def encrypt_document_pdf(
    document_id: UUID,
    request: EncryptPdfRequest,
    service: DocumentService = Depends(get_document_service),
    engine: SecurityEngine = Depends(get_security_engine),
) -> IngestionResult:
    """Encrypts the PDF with AES-256 passwords and granular permission restrictions as a child revision."""
    try:
        doc, rev = service.encrypt_document(
            document_id=document_id,
            request=request,
            security_engine=engine,
        )
        return IngestionResult(document=doc, revision=rev)
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PDF encryption failed: {err}",
        )


@router.post("/documents/{document_id}/decrypt", response_model=IngestionResult)
def decrypt_document_pdf(
    document_id: UUID,
    request: DecryptPdfRequest,
    service: DocumentService = Depends(get_document_service),
    engine: SecurityEngine = Depends(get_security_engine),
) -> IngestionResult:
    """Verifies user/owner password and generates an unencrypted child revision."""
    try:
        doc, rev = service.decrypt_document(
            document_id=document_id,
            password=request.password,
            security_engine=engine,
        )
        return IngestionResult(document=doc, revision=rev)
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PDF decryption failed: {err}",
        )


@router.post("/documents/{document_id}/redact", response_model=IngestionResult)
def redact_document_permanently(
    document_id: UUID,
    request: RedactPdfRequest,
    service: DocumentService = Depends(get_document_service),
    engine: SecurityEngine = Depends(get_security_engine),
) -> IngestionResult:
    """
    Irreversibly destroys underlying PDF text glyphs and intersecting raster image pixels inside target
    bounding boxes or matched search terms, garbage-collecting orphaned bytes.
    """
    try:
        doc, rev = service.redact_document(
            document_id=document_id,
            request=request,
            security_engine=engine,
        )
        return IngestionResult(document=doc, revision=rev)
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except (ValueError, IndexError) as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Permanent redaction failed: {err}",
        )


@router.post("/documents/{document_id}/sanitize", response_model=IngestionResult)
def sanitize_document_privacy(
    document_id: UUID,
    request: SanitizeMetadataRequest,
    service: DocumentService = Depends(get_document_service),
    engine: SecurityEngine = Depends(get_security_engine),
) -> IngestionResult:
    """Strips /Info metadata, XMP XML, embedded files, thumbnails, and active JavaScript triggers."""
    try:
        doc, rev = service.sanitize_document_metadata(
            document_id=document_id,
            request=request,
            security_engine=engine,
        )
        return IngestionResult(document=doc, revision=rev)
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Metadata sanitization failed: {err}",
        )
