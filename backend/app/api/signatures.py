from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status

from ..config import settings
from ..engines.pdf_engine import PyPdfEngine
from ..engines.signature_engine import LocalSignatureEngine, SignatureEngine
from ..models import (
    DigitalSignRequest,
    DocumentSignaturesReport,
    GenerateSelfSignedCertRequest,
    IngestionResult,
    LocalCertificateInfo,
    SavedSignature,
    SaveSignatureRequest,
    VisualSignatureStampRequest,
)
from ..repository import SQLiteDocumentRepository
from ..services.document_service import DocumentNotFoundError, DocumentService
from ..storage import LocalImmutableFileStore

router = APIRouter(prefix="/api/signatures", tags=["signatures"])


def get_signature_engine() -> SignatureEngine:
    return LocalSignatureEngine(
        signatures_dir=settings.signatures_path,
        certs_dir=settings.certs_path,
        temp_dir=settings.temp_path,
    )


def get_document_service() -> DocumentService:
    store = LocalImmutableFileStore(settings.data_root, settings.max_upload_bytes)
    repo = SQLiteDocumentRepository(settings.database_path)
    engine = PyPdfEngine()
    return DocumentService(store=store, repository=repo, pdf_engine=engine)


# --- Local Reusable Visual Signature Library ---


@router.get("/library", response_model=list[SavedSignature])
def list_saved_signatures(
    engine: SignatureEngine = Depends(get_signature_engine),
) -> list[SavedSignature]:
    """Lists locally stored transparent signature graphics (visual stamp presets)."""
    return engine.list_saved_signatures()


@router.post("/library", response_model=SavedSignature, status_code=status.HTTP_201_CREATED)
def save_signature_graphic(
    request: SaveSignatureRequest,
    engine: SignatureEngine = Depends(get_signature_engine),
) -> SavedSignature:
    """Validates and stores a drawn canvas or uploaded signature image locally."""
    try:
        return engine.save_signature(request)
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to store signature graphic: {err}",
        )


@router.delete("/library/{sig_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_saved_signature(
    sig_id: str,
    engine: SignatureEngine = Depends(get_signature_engine),
) -> None:
    """Deletes a locally saved visual signature stamp."""
    try:
        deleted = engine.delete_signature(sig_id)
        if not deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Signature not found")
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))


# --- Local X.509 / PKCS#12 Certificate Profiles ---


@router.get("/certs", response_model=list[LocalCertificateInfo])
def list_local_certificates(
    engine: SignatureEngine = Depends(get_signature_engine),
) -> list[LocalCertificateInfo]:
    """Lists locally generated PKCS#12 digital certificate metadata profiles."""
    return engine.list_certificates()


@router.post("/certs/self-signed", response_model=LocalCertificateInfo, status_code=status.HTTP_201_CREATED)
def create_self_signed_certificate(
    request: GenerateSelfSignedCertRequest,
    engine: SignatureEngine = Depends(get_signature_engine),
) -> LocalCertificateInfo:
    """Generates a local RSA 2048-bit self-signed X.509 certificate protected in encrypted PKCS#12 format."""
    try:
        return engine.generate_self_signed_certificate(request)
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate local certificate: {err}",
        )


@router.delete("/certs/{cert_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_local_certificate(
    cert_id: str,
    engine: SignatureEngine = Depends(get_signature_engine),
) -> None:
    """Deletes a stored local PKCS#12 certificate profile."""
    try:
        deleted = engine.delete_certificate(cert_id)
        if not deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate not found")
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))


# --- Document Signing & Offline Cryptographic Verification ---


@router.post("/documents/{document_id}/visual-stamp", response_model=IngestionResult)
def stamp_visual_signature(
    document_id: UUID,
    request: VisualSignatureStampRequest,
    service: DocumentService = Depends(get_document_service),
    engine: SignatureEngine = Depends(get_signature_engine),
) -> IngestionResult:
    """
    Applies a visual signature stamp overlay (drawn canvas / uploaded PNG + optional caption)
    onto a PDF page, creating an auditable child revision.
    NOTE: Visual stamps are graphical overlays and do NOT provide cryptographic tamper resistance.
    """
    try:
        doc, rev = service.apply_visual_signature_stamp(
            document_id=document_id,
            request=request,
            signature_engine=engine,
        )
        return IngestionResult(document=doc, revision=rev)
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except FileNotFoundError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err))
    except (ValueError, IndexError) as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Visual signature stamp failed: {err}",
        )


@router.post("/documents/{document_id}/digital-sign", response_model=IngestionResult)
def sign_document_cryptographically(
    document_id: UUID,
    request: DigitalSignRequest,
    service: DocumentService = Depends(get_document_service),
    engine: SignatureEngine = Depends(get_signature_engine),
) -> IngestionResult:
    """
    Applies a true PKCS#7 / PAdES cryptographic signature over the PDF byte range
    using a passphrase-protected PKCS#12 certificate, creating a verifiable child revision.
    """
    try:
        doc, rev = service.sign_document_digitally(
            document_id=document_id,
            request=request,
            signature_engine=engine,
        )
        return IngestionResult(document=doc, revision=rev)
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except FileNotFoundError as err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(err))
    except (ValueError, IndexError) as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Digital signature failed: {err}",
        )


@router.get("/documents/{document_id}/verify", response_model=DocumentSignaturesReport)
def verify_document_digital_signatures(
    document_id: UUID,
    service: DocumentService = Depends(get_document_service),
    engine: SignatureEngine = Depends(get_signature_engine),
) -> DocumentSignaturesReport:
    """Inspects and verifies all embedded PKCS#7 / PAdES digital signatures offline."""
    try:
        return service.verify_document_signatures(
            document_id=document_id,
            signature_engine=engine,
        )
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Signature verification failed: {err}",
        )
