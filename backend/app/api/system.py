from fastapi import APIRouter, Depends
from ..config import settings
from ..engines.diagnostics_engine import DiagnosticsEngine, LocalDiagnosticsEngine
from ..models import (
    IntegrityAuditReport,
    SystemDiagnosticsReport,
    TempCleanupReport,
)
from ..repository import SQLiteDocumentRepository
from ..storage import LocalImmutableFileStore

router = APIRouter(prefix="/api/system", tags=["system"])


def get_diagnostics_engine() -> DiagnosticsEngine:
    store = LocalImmutableFileStore(settings.data_root, settings.max_upload_bytes)
    repo = SQLiteDocumentRepository(settings.database_path)
    return LocalDiagnosticsEngine(store=store, repository=repo, cfg=settings)


@router.get("/diagnostics", response_model=SystemDiagnosticsReport)
def get_system_diagnostics(
    engine: DiagnosticsEngine = Depends(get_diagnostics_engine),
) -> SystemDiagnosticsReport:
    return engine.get_diagnostics()


@router.post("/verify-integrity", response_model=IntegrityAuditReport)
def verify_catalog_integrity(
    engine: DiagnosticsEngine = Depends(get_diagnostics_engine),
) -> IntegrityAuditReport:
    return engine.verify_catalog_integrity()


@router.post("/cleanup-temp", response_model=TempCleanupReport)
def cleanup_stale_temp_files(
    engine: DiagnosticsEngine = Depends(get_diagnostics_engine),
) -> TempCleanupReport:
    return engine.cleanup_stale_temp_files()
