import io
from pathlib import Path
import shutil
import tempfile
import pytest
from fastapi.testclient import TestClient
import pypdf

from app.config import settings
from app.main import app
from app.models import PdfTemplate, TemplateElement, TemplateVariable
from app.storage import LocalImmutableFileStore


@pytest.fixture(autouse=True)
def isolated_storage():
    temp_dir = Path(tempfile.mkdtemp(prefix="pdf_canvas_tpl_test_"))
    old_root = settings.data_root
    settings.data_root = temp_dir
    settings.ensure_directories()

    yield temp_dir
    settings.data_root = old_root
    shutil.rmtree(temp_dir, ignore_errors=True)


client = TestClient(app)


def test_list_templates() -> None:
    res = client.get("/api/templates")
    assert res.status_code == 200
    templates = res.json()
    assert len(templates) >= 4
    ids = [t["id"] for t in templates]
    assert "invoice_modern" in ids
    assert "certificate_classic" in ids
    assert "resume_modern" in ids
    assert "letterhead_minimal" in ids


def test_get_template_details() -> None:
    res = client.get("/api/templates/invoice_modern")
    assert res.status_code == 200
    tpl = res.json()
    assert tpl["id"] == "invoice_modern"
    assert tpl["name"] == "Professional Tax Invoice"
    assert tpl["is_built_in"] is True
    assert len(tpl["elements"]) > 0
    assert len(tpl["variables"]) > 0


def test_get_nonexistent_template_returns_404() -> None:
    res = client.get("/api/templates/nonexistent_xyz")
    assert res.status_code == 404


def test_create_and_delete_custom_template() -> None:
    custom_tpl = {
        "id": "custom_award_99",
        "name": "Custom Honor Award",
        "category": "certificate",
        "description": "User created custom honor certificate",
        "page_size": "A4",
        "orientation": "landscape",
        "variables": [
            {"key": "student_name", "label": "Student Name", "default_value": "John Doe", "description": ""}
        ],
        "elements": [
            {
                "type": "heading",
                "x": 50.0,
                "y": 50.0,
                "width": 500.0,
                "height": 30.0,
                "text": "AWARD TO {{student_name}}",
                "font_name": "Helvetica-Bold",
                "font_size": 20.0,
                "font_color": "#D97706",
                "align": "center",
            }
        ],
    }

    # 1. Create custom template
    res = client.post("/api/templates", json=custom_tpl)
    assert res.status_code == 201
    created = res.json()
    assert created["id"] == "custom_award_99"
    assert created["is_built_in"] is False

    # Verify custom template appears in listing
    list_res = client.get("/api/templates")
    assert any(t["id"] == "custom_award_99" for t in list_res.json())

    # 2. Delete custom template
    del_res = client.delete("/api/templates/custom_award_99")
    assert del_res.status_code == 200

    # Verify deleted
    get_res = client.get("/api/templates/custom_award_99")
    assert get_res.status_code == 404


def test_protect_built_in_templates_from_deletion() -> None:
    res = client.delete("/api/templates/invoice_modern")
    assert res.status_code == 400
    assert "Cannot delete built-in template" in res.json()["detail"]


def test_render_template_to_document_in_catalog() -> None:
    render_req = {
        "variables": {
            "company_name": "Wayne Enterprises Tech",
            "invoice_no": "INV-WAYNE-9999",
            "client_name": "LexCorp Industries",
            "subtotal": "$50,000.00",
            "tax_amount": "$5,000.00",
            "grand_total": "$55,000.00",
        },
        "title": "Wayne_Enterprises_Invoice.pdf",
    }

    res = client.post("/api/templates/invoice_modern/render", json=render_req)
    assert res.status_code == 201
    data = res.json()
    doc = data["document"]
    rev = data["revision"]

    assert doc["title"] == "Wayne_Enterprises_Invoice.pdf"
    assert doc["page_count"] == 1
    assert rev["operation"] == "template_render"

    # Verify rendered PDF file on disk
    file_path = settings.data_root / rev["storage_path"]
    assert file_path.exists()
    reader = pypdf.PdfReader(str(file_path))
    assert len(reader.pages) == 1

    extracted_text = reader.pages[0].extract_text()
    assert "Wayne Enterprises Tech" in extracted_text
    assert "INV-WAYNE-9999" in extracted_text
    assert "LexCorp Industries" in extracted_text
    assert "$55,000.00" in extracted_text

    # Verify SHA-256 calculation matches stored revision
    assert LocalImmutableFileStore.calculate_sha256(file_path) == rev["sha256"]


def test_preview_template_endpoint() -> None:
    preview_req = {
        "template_id": "certificate_classic",
        "variables": {
            "recipient_name": "Bruce Wayne",
            "course_name": "Cybernetics & Cryptography",
        },
    }

    res = client.post("/api/templates/preview", json=preview_req)
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert len(res.content) > 1000

    reader = pypdf.PdfReader(io.BytesIO(res.content))
    assert len(reader.pages) == 1
    text = reader.pages[0].extract_text()
    assert "Bruce Wayne" in text
    assert "Cybernetics & Cryptography" in text
