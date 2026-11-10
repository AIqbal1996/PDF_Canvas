from pathlib import Path
from typing import Protocol
from ..config import Settings, settings
from ..models import (
    IntegrityAuditReport,
    IntegrityIssue,
    StorageDirectoryStats,
    SystemDiagnosticsReport,
    TempCleanupReport,
)
from ..repository import DocumentRepository
from ..storage import LocalImmutableFileStore, StorageError


TEMP_STAGE_SUFFIXES = {".tmp", ".tmp_rev", ".tmp_op", ".upload"}

STORAGE_SUBDIRS = [
    "originals",
    "working",
    "temp",
    "signatures",
    "certs",
    "templates",
    "exports",
    "history",
    "thumbnails",
]


class DiagnosticsEngine(Protocol):
    def get_diagnostics(self) -> SystemDiagnosticsReport: ...
    def verify_catalog_integrity(self) -> IntegrityAuditReport: ...
    def cleanup_stale_temp_files(self) -> TempCleanupReport: ...


class LocalDiagnosticsEngine:
    """Enterprise diagnostics, SHA-256 catalog audit, and safe temp-buffer hygiene."""

    def __init__(
        self,
        store: LocalImmutableFileStore,
        repository: DocumentRepository,
        cfg: Settings | None = None,
    ) -> None:
        self.store = store
        self.repository = repository
        self.cfg = cfg or settings

    @staticmethod
    def _dir_stats(directory: Path, name: str) -> StorageDirectoryStats:
        if not directory.exists():
            return StorageDirectoryStats(name=name, file_count=0, total_bytes=0)
        count = 0
        total = 0
        for p in directory.rglob("*"):
            if p.is_file():
                try:
                    total += p.stat().st_size
                    count += 1
                except OSError:
                    pass
        return StorageDirectoryStats(name=name, file_count=count, total_bytes=total)

    def _referenced_paths(self) -> set[Path]:
        referenced: set[Path] = set()
        for rev in self.repository.list_all_revisions():
            try:
                referenced.add(self.store.path_for(rev.storage_path).resolve())
            except StorageError:
                continue
        return referenced

    def _find_cleanable_temp_files(self) -> tuple[list[Path], int, int]:
        """Collects stale temp files strictly outside originals/ and referenced revisions."""
        referenced = self._referenced_paths()
        candidates: list[Path] = []

        temp_dir = (self.store.root / "temp").resolve()
        if temp_dir.exists() and self.store.root in temp_dir.parents:
            for item in temp_dir.rglob("*"):
                if item.is_file() and item.resolve() not in referenced:
                    candidates.append(item)

        working_dir = (self.store.root / "working").resolve()
        if working_dir.exists() and self.store.root in working_dir.parents:
            for item in working_dir.rglob("*"):
                if (
                    item.is_file()
                    and item.suffix.lower() in TEMP_STAGE_SUFFIXES
                    and item.resolve() not in referenced
                ):
                    candidates.append(item)

        originals_dir = (self.store.root / "originals").resolve()
        orig_count = 0
        if originals_dir.exists():
            orig_count = sum(1 for p in originals_dir.rglob("*") if p.is_file())

        # Guarantee nothing in originals/ ever enters candidates
        safe_candidates = [
            p for p in candidates if originals_dir not in p.resolve().parents
        ]
        return safe_candidates, orig_count, len(referenced)

    def get_diagnostics(self) -> SystemDiagnosticsReport:
        db_stats = self.repository.get_db_stats()
        dir_stats: list[StorageDirectoryStats] = []
        total_storage = 0
        for name in STORAGE_SUBDIRS:
            st = self._dir_stats(self.store.root / name, name)
            dir_stats.append(st)
            total_storage += st.total_bytes

        cleanable, _, _ = self._find_cleanable_temp_files()
        reclaimable_bytes = 0
        for p in cleanable:
            try:
                reclaimable_bytes += p.stat().st_size
            except OSError:
                pass

        return SystemDiagnosticsReport(
            status="healthy" if db_stats["integrity_ok"] else "degraded",
            sqlite_integrity_ok=bool(db_stats["integrity_ok"]),
            sqlite_journal_mode=str(db_stats["journal_mode"]),
            sqlite_db_bytes=int(db_stats["db_size_bytes"]),
            document_count=int(db_stats["document_count"]),
            revision_count=int(db_stats["revision_count"]),
            total_storage_bytes=total_storage,
            directories=dir_stats,
            temp_reclaimable_files=len(cleanable),
            temp_reclaimable_bytes=reclaimable_bytes,
            max_upload_bytes=self.cfg.max_upload_bytes,
        )

    def verify_catalog_integrity(self) -> IntegrityAuditReport:
        docs = self.repository.list_documents(limit=100_000, offset=0)
        doc_map = {str(d.id): d for d in docs}
        revisions = self.repository.list_all_revisions()

        issues: list[IntegrityIssue] = []
        verified = 0
        originals_intact = 0

        for rev in revisions:
            doc = doc_map.get(str(rev.document_id))
            doc_title = doc.title if doc else "<orphaned>"

            try:
                file_path = self.store.path_for(rev.storage_path)
            except StorageError as err:
                issues.append(
                    IntegrityIssue(
                        document_id=str(rev.document_id),
                        document_title=doc_title,
                        revision_id=str(rev.id),
                        operation=rev.operation,
                        storage_path=rev.storage_path,
                        issue_type="path_error",
                        detail=str(err),
                    )
                )
                continue

            if not file_path.exists():
                issues.append(
                    IntegrityIssue(
                        document_id=str(rev.document_id),
                        document_title=doc_title,
                        revision_id=str(rev.id),
                        operation=rev.operation,
                        storage_path=rev.storage_path,
                        issue_type="missing_file",
                        detail=f"Referenced file does not exist on disk: {rev.storage_path}",
                    )
                )
                continue

            actual_size = file_path.stat().st_size
            if actual_size != rev.size_bytes:
                issues.append(
                    IntegrityIssue(
                        document_id=str(rev.document_id),
                        document_title=doc_title,
                        revision_id=str(rev.id),
                        operation=rev.operation,
                        storage_path=rev.storage_path,
                        issue_type="size_mismatch",
                        detail=f"Expected {rev.size_bytes} bytes, found {actual_size} bytes",
                    )
                )
                continue

            actual_sha = LocalImmutableFileStore.calculate_sha256(file_path)
            if actual_sha != rev.sha256:
                issues.append(
                    IntegrityIssue(
                        document_id=str(rev.document_id),
                        document_title=doc_title,
                        revision_id=str(rev.id),
                        operation=rev.operation,
                        storage_path=rev.storage_path,
                        issue_type="sha256_mismatch",
                        detail=f"Expected SHA-256 {rev.sha256[:12]}..., found {actual_sha[:12]}...",
                    )
                )
                continue

            verified += 1
            if doc is not None and rev.id == doc.original_revision_id:
                originals_intact += 1

        return IntegrityAuditReport(
            checked_documents=len(docs),
            checked_revisions=len(revisions),
            verified_revisions=verified,
            originals_intact=originals_intact,
            healthy=len(issues) == 0,
            issues=issues,
        )

    def cleanup_stale_temp_files(self) -> TempCleanupReport:
        cleanable, orig_count, rev_count = self._find_cleanable_temp_files()
        removed = 0
        freed = 0
        removed_rel_paths: list[str] = []

        for path in cleanable:
            try:
                size = path.stat().st_size
                rel = str(path.resolve().relative_to(self.store.root)).replace("\\", "/")
                path.unlink(missing_ok=True)
                removed += 1
                freed += size
                if len(removed_rel_paths) < 100:
                    removed_rel_paths.append(rel)
            except OSError:
                continue

        return TempCleanupReport(
            removed_files=removed,
            freed_bytes=freed,
            removed_paths=removed_rel_paths,
            preserved_originals=orig_count,
            preserved_revisions=rev_count,
        )
