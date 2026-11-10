from datetime import UTC, datetime
from pathlib import Path
import sqlite3
from typing import Any, Protocol
from uuid import UUID
from .models import Document, Revision


class DocumentRepository(Protocol):
    def add(self, document: Document, revision: Revision) -> None: ...
    def get_document(self, document_id: UUID) -> Document | None: ...
    def list_documents(
        self, limit: int = 50, offset: int = 0, search: str | None = None
    ) -> list[Document]: ...
    def add_revision(self, revision: Revision) -> None: ...
    def get_revision(self, revision_id: UUID) -> Revision | None: ...
    def list_revisions_for_document(self, document_id: UUID) -> list[Revision]: ...
    def list_all_revisions(self) -> list[Revision]: ...
    def get_db_stats(self) -> dict[str, Any]: ...
    def update_current_revision(
        self, document_id: UUID, revision_id: UUID, page_count: int, size_bytes: int
    ) -> None: ...
    def delete_document(self, document_id: UUID) -> bool: ...


class SQLiteDocumentRepository:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=10.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA busy_timeout = 5000;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        return conn

    def _init_db(self) -> None:
        with self._get_connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS documents (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    mime_type TEXT NOT NULL,
                    page_count INTEGER NOT NULL,
                    size_bytes INTEGER NOT NULL,
                    original_revision_id TEXT NOT NULL,
                    current_revision_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS revisions (
                    id TEXT PRIMARY KEY,
                    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                    parent_revision_id TEXT,
                    operation TEXT NOT NULL,
                    storage_path TEXT NOT NULL,
                    sha256 TEXT NOT NULL,
                    size_bytes INTEGER NOT NULL,
                    page_count INTEGER NOT NULL,
                    created_at TEXT NOT NULL
                );
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_documents_updated ON documents(updated_at DESC);"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_revisions_doc_created ON revisions(document_id, created_at ASC);"
            )
            conn.commit()

    def add(self, document: Document, revision: Revision) -> None:
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO documents (
                    id, title, mime_type, page_count, size_bytes,
                    original_revision_id, current_revision_id, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(document.id),
                    document.title,
                    document.mime_type,
                    document.page_count,
                    document.size_bytes,
                    str(document.original_revision_id),
                    str(document.current_revision_id),
                    document.created_at.isoformat(),
                    document.updated_at.isoformat(),
                ),
            )
            conn.execute(
                """
                INSERT INTO revisions (
                    id, document_id, parent_revision_id, operation,
                    storage_path, sha256, size_bytes, page_count, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(revision.id),
                    str(revision.document_id),
                    str(revision.parent_revision_id) if revision.parent_revision_id else None,
                    revision.operation,
                    revision.storage_path,
                    revision.sha256,
                    revision.size_bytes,
                    revision.page_count,
                    revision.created_at.isoformat(),
                ),
            )
            conn.commit()

    def get_document(self, document_id: UUID) -> Document | None:
        with self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT * FROM documents WHERE id = ?", (str(document_id),)
            )
            row = cursor.fetchone()
            if not row:
                return None
            return Document(
                id=UUID(row["id"]),
                title=row["title"],
                mime_type=row["mime_type"],
                page_count=row["page_count"],
                size_bytes=row["size_bytes"],
                original_revision_id=UUID(row["original_revision_id"]),
                current_revision_id=UUID(row["current_revision_id"]),
                created_at=datetime.fromisoformat(row["created_at"]),
                updated_at=datetime.fromisoformat(row["updated_at"]),
            )

    def list_documents(
        self, limit: int = 50, offset: int = 0, search: str | None = None
    ) -> list[Document]:
        with self._get_connection() as conn:
            term = (search or "").strip()
            if term:
                escaped = (
                    term.lower()
                    .replace("!", "!!")
                    .replace("%", "!%")
                    .replace("_", "!_")
                )
                pattern = f"%{escaped}%"
                cursor = conn.execute(
                    """
                    SELECT * FROM documents
                    WHERE LOWER(title) LIKE ? ESCAPE '!'
                    ORDER BY updated_at DESC
                    LIMIT ? OFFSET ?
                    """,
                    (pattern, limit, offset),
                )
            else:
                cursor = conn.execute(
                    "SELECT * FROM documents ORDER BY updated_at DESC LIMIT ? OFFSET ?",
                    (limit, offset),
                )
            results: list[Document] = []
            for row in cursor.fetchall():
                results.append(
                    Document(
                        id=UUID(row["id"]),
                        title=row["title"],
                        mime_type=row["mime_type"],
                        page_count=row["page_count"],
                        size_bytes=row["size_bytes"],
                        original_revision_id=UUID(row["original_revision_id"]),
                        current_revision_id=UUID(row["current_revision_id"]),
                        created_at=datetime.fromisoformat(row["created_at"]),
                        updated_at=datetime.fromisoformat(row["updated_at"]),
                    )
                )
            return results

    def add_revision(self, revision: Revision) -> None:
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO revisions (
                    id, document_id, parent_revision_id, operation,
                    storage_path, sha256, size_bytes, page_count, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(revision.id),
                    str(revision.document_id),
                    str(revision.parent_revision_id) if revision.parent_revision_id else None,
                    revision.operation,
                    revision.storage_path,
                    revision.sha256,
                    revision.size_bytes,
                    revision.page_count,
                    revision.created_at.isoformat(),
                ),
            )
            conn.commit()

    def get_revision(self, revision_id: UUID) -> Revision | None:
        with self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT * FROM revisions WHERE id = ?", (str(revision_id),)
            )
            row = cursor.fetchone()
            if not row:
                return None
            return Revision(
                id=UUID(row["id"]),
                document_id=UUID(row["document_id"]),
                parent_revision_id=UUID(row["parent_revision_id"]) if row["parent_revision_id"] else None,
                operation=row["operation"],
                storage_path=row["storage_path"],
                sha256=row["sha256"],
                size_bytes=row["size_bytes"],
                page_count=row["page_count"],
                created_at=datetime.fromisoformat(row["created_at"]),
            )

    def list_revisions_for_document(self, document_id: UUID) -> list[Revision]:
        with self._get_connection() as conn:
            cursor = conn.execute(
                "SELECT * FROM revisions WHERE document_id = ? ORDER BY created_at ASC",
                (str(document_id),),
            )
            results: list[Revision] = []
            for row in cursor.fetchall():
                results.append(
                    Revision(
                        id=UUID(row["id"]),
                        document_id=UUID(row["document_id"]),
                        parent_revision_id=UUID(row["parent_revision_id"]) if row["parent_revision_id"] else None,
                        operation=row["operation"],
                        storage_path=row["storage_path"],
                        sha256=row["sha256"],
                        size_bytes=row["size_bytes"],
                        page_count=row["page_count"],
                        created_at=datetime.fromisoformat(row["created_at"]),
                    )
                )
            return results

    def update_current_revision(
        self, document_id: UUID, revision_id: UUID, page_count: int, size_bytes: int
    ) -> None:
        with self._get_connection() as conn:
            conn.execute(
                """
                UPDATE documents
                SET current_revision_id = ?, page_count = ?, size_bytes = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    str(revision_id),
                    page_count,
                    size_bytes,
                    datetime.now(UTC).isoformat(),
                    str(document_id),
                ),
            )
            conn.commit()

    def delete_document(self, document_id: UUID) -> bool:
        with self._get_connection() as conn:
            cursor = conn.execute(
                "DELETE FROM documents WHERE id = ?", (str(document_id),)
            )
            conn.commit()
            return cursor.rowcount > 0

    def list_all_revisions(self) -> list[Revision]:
        with self._get_connection() as conn:
            cursor = conn.execute("SELECT * FROM revisions ORDER BY created_at ASC")
            results: list[Revision] = []
            for row in cursor.fetchall():
                results.append(
                    Revision(
                        id=UUID(row["id"]),
                        document_id=UUID(row["document_id"]),
                        parent_revision_id=UUID(row["parent_revision_id"]) if row["parent_revision_id"] else None,
                        operation=row["operation"],
                        storage_path=row["storage_path"],
                        sha256=row["sha256"],
                        size_bytes=row["size_bytes"],
                        page_count=row["page_count"],
                        created_at=datetime.fromisoformat(row["created_at"]),
                    )
                )
            return results

    def get_db_stats(self) -> dict[str, Any]:
        with self._get_connection() as conn:
            integrity_row = conn.execute("PRAGMA integrity_check;").fetchone()
            integrity_val = str(integrity_row[0]).lower() if integrity_row else "unknown"
            jm_row = conn.execute("PRAGMA journal_mode;").fetchone()
            journal_mode = str(jm_row[0]).lower() if jm_row else "unknown"
            doc_count = int(conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0])
            rev_count = int(conn.execute("SELECT COUNT(*) FROM revisions").fetchone()[0])

        db_size = self.db_path.stat().st_size if self.db_path.exists() else 0
        wal_path = self.db_path.with_name(f"{self.db_path.name}-wal")
        if wal_path.exists():
            db_size += wal_path.stat().st_size
        return {
            "integrity_ok": integrity_val == "ok",
            "journal_mode": journal_mode,
            "document_count": doc_count,
            "revision_count": rev_count,
            "db_size_bytes": db_size,
        }
