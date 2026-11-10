from pathlib import Path
from typing import Protocol

from pydantic import BaseModel, Field


class PdfInspection(BaseModel):
    valid: bool
    version: str | None = None
    warnings: list[str] = Field(default_factory=list)


class PdfEngine(Protocol):
    def inspect(self, source: Path) -> PdfInspection: ...

    def rotate_page(self, source: Path, destination: Path, page: int, degrees: int) -> None: ...

    def validate(self, source: Path) -> PdfInspection: ...


class SignatureOnlyPdfEngine:
    """Initial safety boundary, not a complete structural PDF validator."""

    def inspect(self, source: Path) -> PdfInspection:
        with source.open("rb") as file:
            header = file.read(16)
        if not header.startswith(b"%PDF-"):
            return PdfInspection(valid=False, warnings=["Missing PDF signature"])
        version = header[5:8].decode("ascii", errors="replace")
        return PdfInspection(valid=True, version=version)

    def rotate_page(self, source: Path, destination: Path, page: int, degrees: int) -> None:
        raise NotImplementedError("A production PDF engine must be selected before mutation")

    def validate(self, source: Path) -> PdfInspection:
        return self.inspect(source)

