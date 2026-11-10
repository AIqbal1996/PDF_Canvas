from uuid import UUID
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from ..config import settings
from ..engines.ai_engine import (
    AIConfigurationError,
    AIEngine,
    AIProviderError,
    LocalAndEuriAIEngine,
)
from ..engines.pdf_engine import PyPdfEngine
from ..models import (
    AIAnalysisResponse,
    AIAskRequest,
    AIConfigPublic,
    AIContextPreview,
    AIExtractRequest,
    AIStructuredExtractionResponse,
    AISummarizeRequest,
    AITestConnectionResult,
    IngestionResult,
    SaveAISummaryPdfRequest,
    UpdateAIConfigRequest,
)
from ..repository import SQLiteDocumentRepository
from ..services.document_service import DocumentNotFoundError, DocumentService
from ..storage import LocalImmutableFileStore

router = APIRouter(prefix="/api/ai", tags=["ai"])


def get_ai_engine() -> AIEngine:
    return LocalAndEuriAIEngine()


def get_document_service() -> DocumentService:
    store = LocalImmutableFileStore(settings.data_root, settings.max_upload_bytes)
    repo = SQLiteDocumentRepository(settings.database_path)
    engine = PyPdfEngine()
    return DocumentService(store=store, repository=repo, pdf_engine=engine)


@router.get("/config", response_model=AIConfigPublic)
def get_ai_config(
    engine: AIEngine = Depends(get_ai_engine),
) -> AIConfigPublic:
    """Returns active AI provider configuration, token counter, privacy notice, and masked API key hint."""
    return engine.get_config()


@router.put("/config", response_model=AIConfigPublic)
def update_ai_config(
    request: UpdateAIConfigRequest,
    engine: AIEngine = Depends(get_ai_engine),
) -> AIConfigPublic:
    """Updates provider ('euri' or 'ollama'), model, URL, token budget, or BYOK API key locally."""
    try:
        return engine.update_config(request)
    except AIConfigurationError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))


@router.delete("/config/key", response_model=AIConfigPublic)
def clear_saved_ai_key(
    engine: AIEngine = Depends(get_ai_engine),
) -> AIConfigPublic:
    """Removes locally persisted API key from config file."""
    return engine.clear_api_key()


@router.post("/test-connection", response_model=AITestConnectionResult)
def test_ai_connection(
    x_ai_api_key: str | None = Header(default=None, alias="X-AI-Api-Key"),
    engine: AIEngine = Depends(get_ai_engine),
) -> AITestConnectionResult:
    """Tests connectivity and auth against Euri API or local Ollama."""
    try:
        return engine.test_connection(override_api_key=x_ai_api_key)
    except AIConfigurationError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
    except AIProviderError as err:
        raise HTTPException(status_code=err.status_code, detail=str(err))


@router.get("/documents/{document_id}/context-preview", response_model=AIContextPreview)
def preview_document_ai_context(
    document_id: UUID,
    pages: str | None = Query(default=None, description="Comma-separated 0-based page indices"),
    max_context_chars: int = Query(default=36000, ge=1000, le=120000),
    service: DocumentService = Depends(get_document_service),
    engine: AIEngine = Depends(get_ai_engine),
) -> AIContextPreview:
    """Previews exact page scope and character/token volume before sending text to an AI provider."""
    page_indices: list[int] | None = None
    if pages is not None and pages.strip():
        try:
            page_indices = [int(p.strip()) for p in pages.split(",") if p.strip()]
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="pages must be comma-separated integers",
            )
    try:
        return service.preview_ai_context(
            document_id=document_id,
            page_indices=page_indices,
            max_context_chars=max_context_chars,
            ai_engine=engine,
        )
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except (ValueError, IndexError) as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))


@router.post("/documents/{document_id}/summarize", response_model=AIAnalysisResponse)
def summarize_document_with_ai(
    document_id: UUID,
    request: AISummarizeRequest,
    x_ai_api_key: str | None = Header(default=None, alias="X-AI-Api-Key"),
    service: DocumentService = Depends(get_document_service),
    engine: AIEngine = Depends(get_ai_engine),
) -> AIAnalysisResponse:
    """Summarizes document pages via Euri API or local Ollama with untrusted prompt boundaries."""
    try:
        return service.ai_summarize_document(
            document_id=document_id,
            request=request,
            override_api_key=x_ai_api_key,
            ai_engine=engine,
        )
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except (AIConfigurationError, ValueError, IndexError) as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
    except AIProviderError as err:
        raise HTTPException(status_code=err.status_code, detail=str(err))


@router.post("/documents/{document_id}/ask", response_model=AIAnalysisResponse)
def ask_document_with_ai(
    document_id: UUID,
    request: AIAskRequest,
    x_ai_api_key: str | None = Header(default=None, alias="X-AI-Api-Key"),
    service: DocumentService = Depends(get_document_service),
    engine: AIEngine = Depends(get_ai_engine),
) -> AIAnalysisResponse:
    """Answers grounded multi-turn questions against selected PDF pages with page citations."""
    try:
        return service.ai_ask_document(
            document_id=document_id,
            request=request,
            override_api_key=x_ai_api_key,
            ai_engine=engine,
        )
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except (AIConfigurationError, ValueError, IndexError) as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
    except AIProviderError as err:
        raise HTTPException(status_code=err.status_code, detail=str(err))


@router.post("/documents/{document_id}/extract", response_model=AIStructuredExtractionResponse)
def extract_structured_data_with_ai(
    document_id: UUID,
    request: AIExtractRequest,
    x_ai_api_key: str | None = Header(default=None, alias="X-AI-Api-Key"),
    service: DocumentService = Depends(get_document_service),
    engine: AIEngine = Depends(get_ai_engine),
) -> AIStructuredExtractionResponse:
    """Extracts requested fields into structured JSON from the PDF's text content."""
    try:
        return service.ai_extract_structured_data(
            document_id=document_id,
            request=request,
            override_api_key=x_ai_api_key,
            ai_engine=engine,
        )
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except (AIConfigurationError, ValueError, IndexError) as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
    except AIProviderError as err:
        raise HTTPException(status_code=err.status_code, detail=str(err))


@router.post("/documents/{document_id}/save-summary-pdf", response_model=IngestionResult)
def save_ai_summary_as_pdf(
    document_id: UUID,
    request: SaveAISummaryPdfRequest,
    service: DocumentService = Depends(get_document_service),
    engine: AIEngine = Depends(get_ai_engine),
) -> IngestionResult:
    """Saves an AI summary either as a standalone catalog PDF or prepended as a child revision cover page."""
    try:
        doc, rev = service.ai_save_summary_pdf(
            document_id=document_id,
            request=request,
            ai_engine=engine,
        )
        return IngestionResult(document=doc, revision=rev)
    except DocumentNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
