from io import BytesIO
from pathlib import Path
import shutil
import tempfile
import pytest
from fastapi.testclient import TestClient
import pymupdf as fitz
import pypdf

from app.config import settings
from app.main import app
from app.storage import LocalImmutableFileStore


@pytest.fixture(autouse=True)
def isolated_storage():
    temp_dir = Path(tempfile.mkdtemp(prefix="pdf_canvas_form_test_"))
    old_root = settings.data_root
    settings.data_root = temp_dir
    settings.ensure_directories()

    yield temp_dir
    settings.data_root = old_root
    shutil.rmtree(temp_dir, ignore_errors=True)


client = TestClient(app)


def create_blank_pdf_bytes() -> bytes:
    doc = fitz.open()
    p = doc.new_page(width=400, height=400)
    p.insert_text((40, 40), "Plain Document For Forms Test", fontsize=12)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def test_inspect_document_without_forms() -> None:
    pdf_bytes = create_blank_pdf_bytes()
    upload_res = client.post(
        "/api/documents",
        files={"file": ("no_forms.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    assert upload_res.status_code == 201
    doc_id = upload_res.json()["document"]["id"]

    res = client.get(f"/api/documents/{doc_id}/forms")
    assert res.status_code == 200
    data = res.json()
    assert data["total_fields"] == 0
    assert data["has_form"] is False
    assert len(data["fields"]) == 0


def test_add_and_inspect_form_fields() -> None:
    pdf_bytes = create_blank_pdf_bytes()
    upload_res = client.post(
        "/api/documents",
        files={"file": ("form_doc.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    doc_id = upload_res.json()["document"]["id"]

    # 1. Add text field
    r1 = client.post(
        f"/api/documents/{doc_id}/forms/fields",
        json={
            "page_index": 0,
            "field_name": "employee_name",
            "field_type": "text",
            "rect": [50.0, 60.0, 250.0, 85.0],
            "default_value": "John Doe",
            "font_size": 11.0,
        },
    )
    assert r1.status_code == 201
    assert r1.json()["revision"]["operation"] == "form_field_create"

    # 2. Add checkbox
    r2 = client.post(
        f"/api/documents/{doc_id}/forms/fields",
        json={
            "page_index": 0,
            "field_name": "terms_agreed",
            "field_type": "checkbox",
            "rect": [50.0, 100.0, 70.0, 120.0],
            "default_value": False,
        },
    )
    assert r2.status_code == 201

    # 3. Add combobox/dropdown
    r3 = client.post(
        f"/api/documents/{doc_id}/forms/fields",
        json={
            "page_index": 0,
            "field_name": "department",
            "field_type": "combobox",
            "rect": [50.0, 140.0, 200.0, 165.0],
            "default_value": "Engineering",
            "options": ["Engineering", "Design", "Marketing"],
        },
    )
    assert r3.status_code == 201

    # Inspect form fields
    insp_res = client.get(f"/api/documents/{doc_id}/forms")
    assert insp_res.status_code == 200
    inspection = insp_res.json()
    assert inspection["total_fields"] == 3
    assert inspection["has_form"] is True

    field_map = {f["name"]: f for f in inspection["fields"]}
    assert "employee_name" in field_map
    assert field_map["employee_name"]["field_type"] == "text"
    assert field_map["employee_name"]["value"] == "John Doe"

    assert "terms_agreed" in field_map
    assert field_map["terms_agreed"]["field_type"] == "checkbox"

    assert "department" in field_map
    assert field_map["department"]["field_type"] == "combobox"
    assert "Engineering" in field_map["department"]["options"]


def test_fill_and_flatten_form_workflow() -> None:
    pdf_bytes = create_blank_pdf_bytes()
    upload_res = client.post(
        "/api/documents",
        files={"file": ("full_form_flow.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    doc_id = upload_res.json()["document"]["id"]
    original_path = settings.data_root / upload_res.json()["revision"]["storage_path"]
    original_sha256 = upload_res.json()["revision"]["sha256"]

    # Add text field and checkbox
    client.post(
        f"/api/documents/{doc_id}/forms/fields",
        json={
            "page_index": 0,
            "field_name": "client_title",
            "field_type": "text",
            "rect": [50.0, 60.0, 250.0, 85.0],
            "default_value": "Old Title",
        },
    )
    client.post(
        f"/api/documents/{doc_id}/forms/fields",
        json={
            "page_index": 0,
            "field_name": "verified",
            "field_type": "checkbox",
            "rect": [50.0, 100.0, 70.0, 120.0],
            "default_value": False,
        },
    )

    # 1. Fill fields
    fill_res = client.post(
        f"/api/documents/{doc_id}/forms/fill",
        json={
            "values": {
                "client_title": "Senior Solutions Architect",
                "verified": True,
            },
            "flatten": False,
        },
    )
    assert fill_res.status_code == 200
    assert fill_res.json()["revision"]["operation"] == "form_fill"

    # Verify filled values in inspection
    insp1 = client.get(f"/api/documents/{doc_id}/forms").json()
    field_map = {f["name"]: f for f in insp1["fields"]}
    assert field_map["client_title"]["value"] == "Senior Solutions Architect"

    # 2. Flatten forms (baking into static vector stream)
    flat_res = client.post(f"/api/documents/{doc_id}/forms/flatten")
    assert flat_res.status_code == 200
    data = flat_res.json()
    new_rev = data["revision"]
    assert new_rev["operation"] == "form_flatten"

    # Verify interactive widgets count dropped to 0
    insp2 = client.get(f"/api/documents/{doc_id}/forms").json()
    assert insp2["total_fields"] == 0

    # Verify that the text "Senior Solutions Architect" is permanently baked into the PDF text stream
    flat_path = settings.data_root / new_rev["storage_path"]
    doc = fitz.open(str(flat_path))
    baked_text = doc[0].get_text()
    doc.close()
    assert "Senior Solutions Architect" in baked_text

    # Invariant: Original file remains byte-level immutable
    assert LocalImmutableFileStore.calculate_sha256(original_path) == original_sha256


def test_add_form_field_invalid_inputs() -> None:
    pdf_bytes = create_blank_pdf_bytes()
    upload_res = client.post(
        "/api/documents",
        files={"file": ("invalid_inputs.pdf", BytesIO(pdf_bytes), "application/pdf")},
    )
    doc_id = upload_res.json()["document"]["id"]

    # Invalid bounding box (x0 >= x1)
    r1 = client.post(
        f"/api/documents/{doc_id}/forms/fields",
        json={
            "page_index": 0,
            "field_name": "bad_rect",
            "field_type": "text",
            "rect": [200.0, 50.0, 50.0, 75.0],
        },
    )
    assert r1.status_code == 400

    # Out of range page index
    r2 = client.post(
        f"/api/documents/{doc_id}/forms/fields",
        json={
            "page_index": 10,
            "field_name": "bad_page",
            "field_type": "text",
            "rect": [50.0, 50.0, 200.0, 75.0],
        },
    )
    assert r2.status_code == 400
