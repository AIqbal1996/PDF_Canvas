from uuid import UUID

from .domain import Document, Revision


class InMemoryDocumentRepository:
    """Temporary Phase 1 adapter; replace with PostgreSQL before deployment."""

    def __init__(self) -> None:
        self.documents: dict[UUID, Document] = {}
        self.revisions: dict[UUID, Revision] = {}

    def add(self, document: Document, revision: Revision) -> None:
        self.documents[document.id] = document
        self.revisions[revision.id] = revision

    def get_document(self, document_id: UUID, organization_id: UUID) -> Document | None:
        document = self.documents.get(document_id)
        if document is None or document.organization_id != organization_id:
            return None
        return document

