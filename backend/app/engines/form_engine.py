from pathlib import Path
from typing import Any, Protocol
import pymupdf as fitz

from ..models import (
    CreateFormFieldRequest,
    DocumentFormsInspection,
    FormField,
)


class FormEngine(Protocol):
    def inspect_forms(self, source: Path) -> DocumentFormsInspection:
        """Inspects all pages in a document and returns details of all interactive AcroForm fields."""
        ...

    def fill_forms(
        self,
        source: Path,
        destination: Path,
        values: dict[str, Any],
        flatten: bool = False,
    ) -> int:
        """Fills AcroForm fields with provided values and writes updated PDF to destination."""
        ...

    def flatten_forms(self, source: Path, destination: Path) -> int:
        """Bakes/flattens interactive AcroForm widgets into static vector content streams."""
        ...

    def add_form_field(
        self,
        source: Path,
        destination: Path,
        req: CreateFormFieldRequest,
    ) -> FormField:
        """Adds a new interactive form field widget onto a specific document page."""
        ...


class LocalFormEngine:
    """Production local AcroForm engine using PyMuPDF (fitz.Widget & doc.bake)."""

    WIDGET_TYPE_NAMES = {
        fitz.PDF_WIDGET_TYPE_TEXT: "text",
        fitz.PDF_WIDGET_TYPE_CHECKBOX: "checkbox",
        fitz.PDF_WIDGET_TYPE_RADIOBUTTON: "radio",
        fitz.PDF_WIDGET_TYPE_COMBOBOX: "combobox",
        fitz.PDF_WIDGET_TYPE_LISTBOX: "listbox",
        fitz.PDF_WIDGET_TYPE_SIGNATURE: "signature",
        fitz.PDF_WIDGET_TYPE_BUTTON: "button",
    }

    TYPE_STRING_MAP = {
        "text": fitz.PDF_WIDGET_TYPE_TEXT,
        "checkbox": fitz.PDF_WIDGET_TYPE_CHECKBOX,
        "radio": fitz.PDF_WIDGET_TYPE_RADIOBUTTON,
        "combobox": fitz.PDF_WIDGET_TYPE_COMBOBOX,
        "choice": fitz.PDF_WIDGET_TYPE_COMBOBOX,
        "dropdown": fitz.PDF_WIDGET_TYPE_COMBOBOX,
        "listbox": fitz.PDF_WIDGET_TYPE_LISTBOX,
        "signature": fitz.PDF_WIDGET_TYPE_SIGNATURE,
    }

    def inspect_forms(self, source: Path) -> DocumentFormsInspection:
        if not source.exists():
            raise FileNotFoundError(f"Source PDF does not exist: {source}")

        doc = fitz.open(str(source))
        fields: list[FormField] = []

        try:
            for p_idx, page in enumerate(doc):
                for w in page.widgets():
                    field_name = w.field_name or f"unnamed_{p_idx}_{len(fields)}"
                    raw_type = w.field_type
                    type_str = self.WIDGET_TYPE_NAMES.get(raw_type, "text")

                    # Extract options for combobox/listbox
                    options: list[str] = []
                    if w.choice_values:
                        options = list(w.choice_values)

                    # Extract bounding box
                    r = w.rect
                    bbox = (round(r.x0, 2), round(r.y0, 2), round(r.x1, 2), round(r.y1, 2))

                    is_read_only = bool(w.field_flags & 1) if w.field_flags is not None else False
                    is_required = bool(w.field_flags & 2) if w.field_flags is not None else False

                    fields.append(
                        FormField(
                            name=field_name,
                            field_type=type_str,
                            value=w.field_value,
                            default_value=w.field_value,
                            page_index=p_idx,
                            rect=bbox,
                            read_only=is_read_only,
                            required=is_required,
                            options=options,
                            text_fontsize=w.text_fontsize,
                        )
                    )

            return DocumentFormsInspection(
                total_fields=len(fields),
                has_form=len(fields) > 0,
                fields=fields,
            )
        finally:
            doc.close()

    def fill_forms(
        self,
        source: Path,
        destination: Path,
        values: dict[str, Any],
        flatten: bool = False,
    ) -> int:
        if not source.exists():
            raise FileNotFoundError(f"Source PDF does not exist: {source}")

        destination.parent.mkdir(parents=True, exist_ok=True)
        temp_dest = destination.parent / f"{destination.stem}_form_fill.tmp"

        doc = fitz.open(str(source))
        updated_count = 0

        # Create case-insensitive lookup
        lookup = {k.strip().lower(): (k, v) for k, v in values.items()}

        try:
            for page in doc:
                for w in page.widgets():
                    name_key = (w.field_name or "").strip().lower()
                    if name_key in lookup:
                        _, val = lookup[name_key]
                        raw_type = w.field_type

                        # Handle checkboxes
                        if raw_type == fitz.PDF_WIDGET_TYPE_CHECKBOX:
                            if isinstance(val, bool):
                                w.field_value = val
                            elif str(val).lower() in ("true", "yes", "1", "on"):
                                w.field_value = True
                            else:
                                w.field_value = False
                        else:
                            # Handle text, combobox, radio
                            w.field_value = str(val) if val is not None else ""

                        w.update()
                        updated_count += 1

            if flatten:
                doc.bake()

            doc.save(str(temp_dest), garbage=3, deflate=True)
            doc.close()
            temp_dest.replace(destination)
            return updated_count
        finally:
            if temp_dest.exists():
                temp_dest.unlink(missing_ok=True)

    def flatten_forms(self, source: Path, destination: Path) -> int:
        if not source.exists():
            raise FileNotFoundError(f"Source PDF does not exist: {source}")

        destination.parent.mkdir(parents=True, exist_ok=True)
        temp_dest = destination.parent / f"{destination.stem}_form_flat.tmp"

        doc = fitz.open(str(source))
        widget_count = 0

        try:
            for page in doc:
                widget_count += len(list(page.widgets()))

            doc.bake()
            doc.save(str(temp_dest), garbage=3, deflate=True)
            doc.close()
            temp_dest.replace(destination)
            return widget_count
        finally:
            if temp_dest.exists():
                temp_dest.unlink(missing_ok=True)

    def add_form_field(
        self,
        source: Path,
        destination: Path,
        req: CreateFormFieldRequest,
    ) -> FormField:
        if not source.exists():
            raise FileNotFoundError(f"Source PDF does not exist: {source}")

        if req.rect[0] >= req.rect[2] or req.rect[1] >= req.rect[3]:
            raise ValueError(
                f"Invalid bounding box [x0={req.rect[0]}, y0={req.rect[1]}, x1={req.rect[2]}, y1={req.rect[3]}]: "
                "x1 must be greater than x0 and y1 must be greater than y0."
            )

        destination.parent.mkdir(parents=True, exist_ok=True)
        temp_dest = destination.parent / f"{destination.stem}_add_field.tmp"

        doc = fitz.open(str(source))
        total_pages = len(doc)
        if req.page_index < 0 or req.page_index >= total_pages:
            doc.close()
            raise IndexError(f"Page index {req.page_index} out of range (0..{total_pages - 1})")

        page = doc[req.page_index]
        widget = fitz.Widget()
        widget.field_name = req.field_name
        widget.field_type = self.TYPE_STRING_MAP.get(req.field_type.lower(), fitz.PDF_WIDGET_TYPE_TEXT)
        widget.rect = fitz.Rect(req.rect[0], req.rect[1], req.rect[2], req.rect[3])
        widget.text_fontsize = req.font_size

        if req.read_only:
            widget.field_flags = 1

        if req.options and widget.field_type in (
            fitz.PDF_WIDGET_TYPE_COMBOBOX,
            fitz.PDF_WIDGET_TYPE_LISTBOX,
        ):
            widget.choice_values = req.options

        if req.default_value is not None:
            if widget.field_type == fitz.PDF_WIDGET_TYPE_CHECKBOX:
                widget.field_value = bool(req.default_value)
            else:
                widget.field_value = str(req.default_value)

        try:
            page.add_widget(widget)
            doc.save(str(temp_dest), garbage=3, deflate=True)
            doc.close()
            temp_dest.replace(destination)

            return FormField(
                name=req.field_name,
                field_type=req.field_type.lower(),
                value=req.default_value,
                default_value=req.default_value,
                page_index=req.page_index,
                rect=req.rect,
                read_only=req.read_only,
                options=req.options,
                text_fontsize=req.font_size,
            )
        finally:
            if temp_dest.exists():
                temp_dest.unlink(missing_ok=True)
