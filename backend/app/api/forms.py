from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status

from ..config import settings
from ..engines.form_engine import FormEngine, LocalFormEngine
from ..engines.pdf_engine import PyPdfEngine
from ..models import (
    CreateFormFieldRequest,
    DocumentFormsInspection,
    FillFormRequest,
    IngestionResult,
)
from ..repository import SQLiteDocumentRepository
from ..services.document_service import DocumentNotFoundError, DocumentService
from ..storage import LocalImmutableFileStore

router = APIRouter(prefix="/api/documents", tags=["forms"])


def get_form_engine() -> FormEngine:
    return LocalFormEngine()


def get_document_service() -> DocumentService:
    store = LocalImmutableFileStore(settings.data_root, settings.max_upload_bytes)
    repo = SQLiteDocumentRepository(settings.database_path)
    engine = PyPdfEngine()
    return DocumentService(store=store, repository=repo, pdf_engine=engine)


@router.get("/{document_id}/forms", response_model=DocumentFormsInspection)
def inspect_document_forms(
    document_id: UUID,
    service: DocumentService = Depends(get_document_service),
    engine: FormEngine = Depends(get_form_engine),
) -> DocumentFormsInspection:
    """Inspects all pages in a document and returns details of all interactive AcroForm fields."""
    try:
        return service.inspect_forms(document_id, form_engine=engine)
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Form inspection failed: {e}",
        )


@router.post("/{document_id}/forms/fill", response_model=IngestionResult)
def fill_document_forms(
    document_id: UUID,
    request: FillFormRequest,
    service: DocumentService = Depends(get_document_service),
    engine: FormEngine = Depends(get_form_engine),
) -> IngestionResult:
    """Fills interactive AcroForm fields with provided values, creating a child revision."""
    try:
        doc, rev = service.fill_forms(
            document_id=document_id,
            values=request.values,
            flatten=request.flatten,
            form_engine=engine,
        )
        return IngestionResult(document=doc, revision=rev)
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except (ValueError, IndexError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Form filling failed: {e}",
        )


@router.post("/{document_id}/forms/flatten", response_model=IngestionResult)
def flatten_document_forms(
    document_id: UUID,
    service: DocumentService = Depends(get_document_service),
    engine: FormEngine = Depends(get_form_engine),
) -> IngestionResult:
    """Flattens all interactive form fields into static vector content streams, creating a child revision."""
    try:
        doc, rev = service.flatten_forms(
            document_id=document_id,
            form_engine=engine,
        )
        return IngestionResult(document=doc, revision=rev)
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Form flattening failed: {e}",
        )


@router.post("/{document_id}/forms/fields", response_model=IngestionResult, status_code=status.HTTP_201_CREATED)
def add_document_form_field(
    document_id: UUID,
    request: CreateFormFieldRequest,
    service: DocumentService = Depends(get_document_service),
    engine: FormEngine = Depends(get_form_engine),
) -> IngestionResult:
    """Adds a new interactive fillable form field widget onto a document page, creating a child revision."""
    try:
        doc, rev = service.add_form_field(
            document_id=document_id,
            request=request,
            form_engine=engine,
        )
        return IngestionResult(document=doc, revision=rev)
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except (ValueError, IndexError) as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Form field creation failed: {e}",
        )
