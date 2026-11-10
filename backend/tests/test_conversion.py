from io import BytesIO
import shutil
import tempfile
import zipfile
from pathlib import Path
from PIL import Image as PILImage
import pytest
from fastapi.testclient import TestClient
import pypdf

from app.config import settings
from app.main import app


@pytest.fixture(autouse=True)
def isolated_storage():
    temp_dir = Path(tempfile.mkdtemp(prefix="pdf_canvas_conv_test_"))
    old_root = settings.data_root
    settings.data_root = temp_dir
    settings.ensure_directories()
    yield temp_dir
    settings.data_root = old_root
    shutil.rmtree(temp_dir, ignore_errors=True)


client = TestClient(app)


def make_test_image(w: int = 150, h: int = 100, color=(255, 0, 0)) -> bytes:
    buf = BytesIO()
    im = PILImage.new("RGB", (w, h), color=color)
    im.save(buf, format="PNG")
    return buf.getvalue()


def test_conversion_status() -> None:
    res = client.get("/api/convert/status")
    assert res.status_code == 200
    data = res.json()
    assert data["images_to_pdf"] is True
    assert data["pdf_to_images"] is True
    assert data["text_to_pdf"] is True
    assert "supported_office_formats" in data
    assert ".docx" in data["supported_office_formats"]


def test_images_to_pdf_conversion() -> None:
    img1 = make_test_image(200, 150, color=(255, 50, 50))
    img2 = make_test_image(180, 220, color=(50, 100, 255))

    res = client.post(
        "/api/convert/images-to-pdf",
        data={"title": "PhotoBook.pdf", "page_size": "A4", "fit_to_page": "true"},
        files=[
            ("files", ("photo1.png", BytesIO(img1), "image/png")),
            ("files", ("photo2.png", BytesIO(img2), "image/png")),
        ],
    )
    assert res.status_code == 201
    data = res.json()
    doc = data["document"]
    rev = data["revision"]

    assert doc["title"] == "PhotoBook.pdf"
    assert doc["page_count"] == 2
    assert rev["page_count"] == 2

    # Verify PDF is valid and has 2 pages
    pdf_path = settings.data_root / rev["storage_path"]
    reader = pypdf.PdfReader(str(pdf_path))
    assert len(reader.pages) == 2


def test_text_to_pdf_conversion() -> None:
    text_content = (
        "Enterprise PDF Editor\n\n"
        "This is an automated conversion of plain text into a structured PDF document.\n"
        "Testing multi-line formatting, page breaks, and standard typography."
    )

    res = client.post(
        "/api/convert/text-to-pdf",
        data={"title": "ReportNotes.pdf", "text": text_content},
    )
    assert res.status_code == 201
    data = res.json()
    doc = data["document"]
    rev = data["revision"]

    assert doc["title"] == "ReportNotes.pdf"
    assert doc["page_count"] >= 1

    pdf_path = settings.data_root / rev["storage_path"]
    reader = pypdf.PdfReader(str(pdf_path))
    extracted = reader.pages[0].extract_text()
    assert "Enterprise PDF Editor" in extracted


def test_render_pdf_page_to_image() -> None:
    # 1. Create a PDF with text
    text_res = client.post(
        "/api/convert/text-to-pdf",
        data={"title": "RenderTest.pdf", "text": "Visual Rendering Verification"},
    )
    doc_id = text_res.json()["document"]["id"]

    # 2. Render page 0 as PNG
    png_res = client.get(f"/api/convert/documents/{doc_id}/render-page/0?scale=2.0&fmt=PNG")
    assert png_res.status_code == 200
    assert png_res.headers["content-type"] == "image/png"
    assert "inline" in png_res.headers.get("content-disposition", "")

    # Verify valid PNG with Pillow
    im = PILImage.open(BytesIO(png_res.content))
    assert im.size[0] > 0
    assert im.size[1] > 0

    # 3. Render page 0 as JPEG
    jpg_res = client.get(f"/api/convert/documents/{doc_id}/render-page/0?scale=1.5&fmt=JPEG")
    assert jpg_res.status_code == 200
    assert jpg_res.headers["content-type"] == "image/jpeg"
    im_jpg = PILImage.open(BytesIO(jpg_res.content))
    assert im_jpg.size[0] > 0


def test_export_pdf_images_zip() -> None:
    # Create 2-page PDF from images
    img1 = make_test_image(100, 100)
    img2 = make_test_image(100, 100)
    conv_res = client.post(
        "/api/convert/images-to-pdf",
        data={"title": "ZipExport.pdf"},
        files=[
            ("files", ("p1.png", BytesIO(img1), "image/png")),
            ("files", ("p2.png", BytesIO(img2), "image/png")),
        ],
    )
    doc_id = conv_res.json()["document"]["id"]

    # Export all pages as ZIP
    zip_res = client.get(f"/api/convert/documents/{doc_id}/export-images?scale=1.0&fmt=PNG")
    assert zip_res.status_code == 200
    assert zip_res.headers["content-type"] == "application/zip"

    # Verify ZIP contents
    zf = zipfile.ZipFile(BytesIO(zip_res.content))
    names = zf.namelist()
    assert "page_1.png" in names
    assert "page_2.png" in names


def test_office_conversion_when_missing_libreoffice() -> None:
    status_res = client.get("/api/convert/status")
    lo_available = status_res.json()["libreoffice_available"]

    dummy_docx = b"PK\x03\x04DummyDocxData"
    res = client.post(
        "/api/convert/office-to-pdf",
        files={"file": ("sample.docx", BytesIO(dummy_docx), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
    )

    if not lo_available:
        assert res.status_code == 503
        assert "libreoffice is not installed" in res.json()["detail"].lower()
    else:
        # If installed, would attempt conversion
        assert res.status_code in [201, 400]
