import hashlib
import os
from pathlib import Path
from typing import BinaryIO
from uuid import UUID


class UploadTooLargeError(ValueError):
    pass


class LocalImmutableObjectStore:
    def __init__(self, root: Path, max_upload_bytes: int) -> None:
        self.root = root.resolve()
        self.max_upload_bytes = max_upload_bytes

    def put_original(self, organization_id: UUID, document_id: UUID, stream: BinaryIO) -> tuple[str, str, int]:
        object_key = f"organizations/{organization_id}/documents/{document_id}/original.pdf"
        destination = (self.root / object_key).resolve()
        if self.root not in destination.parents:
            raise ValueError("Invalid object path")
        if destination.exists():
            raise FileExistsError("Original object already exists")

        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_suffix(".upload")
        digest = hashlib.sha256()
        size = 0

        try:
            with temporary.open("xb") as output:
                while chunk := stream.read(1024 * 1024):
                    size += len(chunk)
                    if size > self.max_upload_bytes:
                        raise UploadTooLargeError("Upload exceeds configured limit")
                    digest.update(chunk)
                    output.write(chunk)
                output.flush()
                os.fsync(output.fileno())
            temporary.replace(destination)
        except Exception:
            temporary.unlink(missing_ok=True)
            raise

        return object_key, digest.hexdigest(), size

    def path_for(self, object_key: str) -> Path:
        candidate = (self.root / object_key).resolve()
        if self.root not in candidate.parents:
            raise ValueError("Invalid object key")
        return candidate

