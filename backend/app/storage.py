import hashlib
import os
from pathlib import Path
from typing import BinaryIO, Union
from uuid import UUID


class UploadTooLargeError(ValueError):
    pass


class StorageError(Exception):
    pass


class LocalImmutableFileStore:
    def __init__(self, root: Path, limit: int = 100 * 1024 * 1024) -> None:
        self.root = root.resolve()
        self.limit = limit
        self.root.mkdir(parents=True, exist_ok=True)

    def put_original(self, document_id: UUID, stream: BinaryIO) -> tuple[str, str, int]:
        """Saves an immutable original document. Raises FileExistsError if already exists."""
        relative_path = f"originals/{document_id}/original.pdf"
        destination = (self.root / relative_path).resolve()

        if self.root not in destination.parents:
            raise StorageError("Path traversal attempted")
        if destination.exists():
            raise FileExistsError(f"Original for document {document_id} already exists")

        destination.parent.mkdir(parents=True, exist_ok=True)
        temp_file = destination.with_suffix(".upload")
        digest = hashlib.sha256()
        size = 0

        try:
            with temp_file.open("xb") as out:
                while chunk := stream.read(1024 * 1024):
                    size += len(chunk)
                    if size > self.limit:
                        raise UploadTooLargeError(f"Upload exceeds maximum limit of {self.limit} bytes")
                    digest.update(chunk)
                    out.write(chunk)
                out.flush()
                os.fsync(out.fileno())
            temp_file.replace(destination)
        except Exception:
            temp_file.unlink(missing_ok=True)
            raise

        return relative_path, digest.hexdigest(), size

    def put_revision(
        self, document_id: UUID, revision_id: UUID, source: Union[BinaryIO, Path]
    ) -> tuple[str, str, int]:
        """Saves a mutation child revision into the working directory."""
        relative_path = f"working/{document_id}/{revision_id}.pdf"
        destination = (self.root / relative_path).resolve()

        if self.root not in destination.parents:
            raise StorageError("Path traversal attempted")
        if destination.exists():
            raise FileExistsError(f"Revision {revision_id} already exists")

        destination.parent.mkdir(parents=True, exist_ok=True)
        temp_file = destination.with_suffix(".tmp_rev")
        digest = hashlib.sha256()
        size = 0

        try:
            if isinstance(source, Path):
                with source.open("rb") as src_f, temp_file.open("xb") as out:
                    while chunk := src_f.read(1024 * 1024):
                        size += len(chunk)
                        digest.update(chunk)
                        out.write(chunk)
                    out.flush()
                    os.fsync(out.fileno())
            else:
                with temp_file.open("xb") as out:
                    while chunk := source.read(1024 * 1024):
                        size += len(chunk)
                        digest.update(chunk)
                        out.write(chunk)
                    out.flush()
                    os.fsync(out.fileno())

            temp_file.replace(destination)
        except Exception:
            temp_file.unlink(missing_ok=True)
            raise

        return relative_path, digest.hexdigest(), size

    def path_for(self, relative_path: str) -> Path:
        """Resolves relative storage path under root, rejecting traversal attempts."""
        candidate = (self.root / relative_path).resolve()
        if candidate != self.root and self.root not in candidate.parents:
            raise StorageError(f"Forbidden path outside storage root: {relative_path}")
        return candidate

    @staticmethod
    def calculate_sha256(path: Path) -> str:
        """Calculates SHA-256 hash of an existing file."""
        digest = hashlib.sha256()
        with path.open("rb") as f:
            while chunk := f.read(1024 * 1024):
                digest.update(chunk)
        return digest.hexdigest()
