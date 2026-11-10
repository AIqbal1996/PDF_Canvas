from datetime import UTC, datetime
from pathlib import Path
import json
import re
from typing import Any, Protocol
import pypdf
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4, LETTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import Paragraph, Table, TableStyle

from ..models import PdfTemplate, TemplateElement, TemplateSummary, TemplateVariable


class TemplateNotFoundError(Exception):
    """Raised when a requested template does not exist."""
    pass


class BuiltInTemplateProtectedError(ValueError):
    """Raised when attempting to modify or delete a read-only built-in template."""
    pass


class TemplateEngine(Protocol):
    def list_templates(self) -> list[TemplateSummary]:
        """Lists summaries of all built-in and user-saved templates."""
        ...

    def get_template(self, template_id: str) -> PdfTemplate:
        """Retrieves a full template schema by its identifier."""
        ...

    def save_template(self, template: PdfTemplate) -> PdfTemplate:
        """Saves or updates a custom template JSON schema on local disk."""
        ...

    def delete_template(self, template_id: str) -> bool:
        """Deletes a user-saved custom template (built-in templates cannot be deleted)."""
        ...

    def render_to_pdf(
        self,
        template: PdfTemplate,
        variables: dict[str, Any],
        destination: Path,
    ) -> tuple[int, int]:
        """Renders the template with substituted variables into a vector PDF file."""
        ...


class LocalTemplateEngine:
    """Production local template engine synthesizing vector-sharp PDFs via ReportLab."""

    PAGE_SIZES = {
        "A4": A4,
        "LETTER": LETTER,
    }

    FONT_MAP = {
        "helvetica": "Helvetica",
        "helvetica-bold": "Helvetica-Bold",
        "times-roman": "Times-Roman",
        "times": "Times-Roman",
        "times-bold": "Times-Bold",
        "courier": "Courier",
        "courier-bold": "Courier-Bold",
    }

    def __init__(self, templates_dir: Path) -> None:
        self.templates_dir = templates_dir
        self.templates_dir.mkdir(parents=True, exist_ok=True)
        self._built_in_templates: dict[str, PdfTemplate] = self._create_built_in_templates()

    @staticmethod
    def _interpolate(text: str | None, variables: dict[str, Any], defaults: dict[str, str]) -> str:
        if not text:
            return ""

        def repl(match: re.Match) -> str:
            key = match.group(1).strip()
            val = variables.get(key)
            if val is not None:
                return str(val)
            return defaults.get(key, "")

        # Replaces {{key}} or {key}
        res = re.sub(r"\{\{\s*(\w+)\s*\}\}", repl, text)
        res = re.sub(r"\{\s*(\w+)\s*\}", repl, res)
        return res

    def list_templates(self) -> list[TemplateSummary]:
        summaries: list[TemplateSummary] = []

        # 1. Built-in templates
        for t in self._built_in_templates.values():
            summaries.append(
                TemplateSummary(
                    id=t.id,
                    name=t.name,
                    category=t.category,
                    description=t.description,
                    page_size=t.page_size,
                    orientation=t.orientation,
                    element_count=len(t.elements),
                    variable_count=len(t.variables),
                    is_built_in=True,
                )
            )

        # 2. Local custom templates from templates_dir
        for p in self.templates_dir.glob("*.json"):
            try:
                with p.open("r", encoding="utf-8") as f:
                    data = json.load(f)
                    template = PdfTemplate.model_validate(data)
                    summaries.append(
                        TemplateSummary(
                            id=template.id,
                            name=template.name,
                            category=template.category,
                            description=template.description,
                            page_size=template.page_size,
                            orientation=template.orientation,
                            element_count=len(template.elements),
                            variable_count=len(template.variables),
                            is_built_in=False,
                        )
                    )
            except Exception:
                continue

        return summaries

    def get_template(self, template_id: str) -> PdfTemplate:
        # Check built-in first
        if template_id in self._built_in_templates:
            return self._built_in_templates[template_id].model_copy(deep=True)

        # Check local filesystem
        file_path = self.templates_dir / f"{template_id}.json"
        if not file_path.exists():
            raise TemplateNotFoundError(f"Template '{template_id}' not found.")

        with file_path.open("r", encoding="utf-8") as f:
            data = json.load(f)
            return PdfTemplate.model_validate(data)

    def save_template(self, template: PdfTemplate) -> PdfTemplate:
        if template.id in self._built_in_templates:
            raise BuiltInTemplateProtectedError(
                f"Cannot overwrite built-in template '{template.id}'. Save under a new ID instead."
            )

        template.is_built_in = False
        template.updated_at = datetime.now(UTC)
        file_path = self.templates_dir / f"{template.id}.json"

        temp_path = self.templates_dir / f"{template.id}.tmp"
        with temp_path.open("w", encoding="utf-8") as f:
            json.dump(template.model_dump(mode="json"), f, indent=2)
        temp_path.replace(file_path)

        return template

    def delete_template(self, template_id: str) -> bool:
        if template_id in self._built_in_templates:
            raise BuiltInTemplateProtectedError(
                f"Cannot delete built-in template '{template_id}'. Built-in templates are read-only."
            )

        file_path = self.templates_dir / f"{template_id}.json"
        if not file_path.exists():
            return False

        file_path.unlink(missing_ok=True)
        return True

    def render_to_pdf(
        self,
        template: PdfTemplate,
        variables: dict[str, Any],
        destination: Path,
    ) -> tuple[int, int]:
        destination.parent.mkdir(parents=True, exist_ok=True)
        temp_dest = destination.parent / f"{destination.stem}_tpl_render.tmp"

        # Determine page size and orientation
        base_size = self.PAGE_SIZES.get(template.page_size.upper(), A4)
        if template.orientation.lower() == "landscape":
            page_w, page_h = max(base_size), min(base_size)
        else:
            page_w, page_h = min(base_size), max(base_size)

        defaults = {v.key: v.default_value for v in template.variables}
        canv = rl_canvas.Canvas(str(temp_dest), pagesize=(page_w, page_h))

        try:
            for elem in template.elements:
                self._render_element(canv, elem, page_w, page_h, variables, defaults)

            canv.showPage()
            canv.save()

            # Validate generated PDF using pypdf
            reader = pypdf.PdfReader(str(temp_dest))
            page_count = len(reader.pages)
            size_bytes = temp_dest.stat().st_size

            temp_dest.replace(destination)
            return page_count, size_bytes
        finally:
            if temp_dest.exists():
                temp_dest.unlink(missing_ok=True)

    def _render_element(
        self,
        canv: rl_canvas.Canvas,
        elem: TemplateElement,
        page_w: float,
        page_h: float,
        variables: dict[str, Any],
        defaults: dict[str, str],
    ) -> None:
        # Convert coordinates: template x, y is top-down (0,0 is top-left)
        # PDF point system: y is from bottom (0,0 is bottom-left)
        x_pt = elem.x
        y_pt = page_h - elem.y - elem.height
        w_pt = elem.width
        h_pt = elem.height

        font_name = self.FONT_MAP.get(elem.font_name.lower(), "Helvetica")
        text_color = HexColor(elem.font_color) if elem.font_color else HexColor("#000000")

        if elem.type in ("rect", "badge"):
            fill_val = 1 if elem.fill_color else 0
            stroke_val = 1 if (elem.stroke_color and elem.stroke_width > 0) else 0

            if fill_val:
                canv.setFillColor(HexColor(elem.fill_color))
            if stroke_val:
                canv.setStrokeColor(HexColor(elem.stroke_color))
                canv.setLineWidth(elem.stroke_width)

            if elem.border_radius > 0:
                canv.roundRect(x_pt, y_pt, w_pt, h_pt, elem.border_radius, fill=fill_val, stroke=stroke_val)
            else:
                canv.rect(x_pt, y_pt, w_pt, h_pt, fill=fill_val, stroke=stroke_val)

            # If badge has text inside, draw centered text
            if elem.type == "badge" and elem.text:
                interpolated = self._interpolate(elem.text, variables, defaults)
                canv.setFillColor(text_color)
                canv.setFont(font_name, elem.font_size)
                canv.drawCentredString(x_pt + w_pt / 2.0, y_pt + (h_pt - elem.font_size) / 2.0 + 1, interpolated)

        elif elem.type == "line":
            stroke_c = HexColor(elem.stroke_color or elem.font_color or "#000000")
            canv.setStrokeColor(stroke_c)
            canv.setLineWidth(elem.stroke_width or 1.0)
            mid_y = y_pt + h_pt / 2.0
            canv.line(x_pt, mid_y, x_pt + w_pt, mid_y)

        elif elem.type in ("heading", "text"):
            if not elem.text:
                return
            interpolated = self._interpolate(elem.text, variables, defaults)

            # Check if multi-line or long paragraph wrapping is needed
            if "\n" in interpolated or len(interpolated) > 40:
                align_code = 0  # left
                if elem.align == "center":
                    align_code = 1
                elif elem.align == "right":
                    align_code = 2

                style = ParagraphStyle(
                    name=f"style_{elem.id}",
                    fontName=font_name,
                    fontSize=elem.font_size,
                    leading=elem.font_size * 1.3,
                    textColor=text_color,
                    alignment=align_code,
                )
                # Escape html-like characters for reportlab Paragraph
                safe_text = interpolated.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")
                para = Paragraph(safe_text, style)
                _, p_height = para.wrap(w_pt, h_pt)
                para.drawOn(canv, x_pt, y_pt + h_pt - p_height)
            else:
                canv.setFillColor(text_color)
                canv.setFont(font_name, elem.font_size)
                baseline_y = y_pt + (h_pt - elem.font_size) / 2.0
                if elem.align == "center":
                    canv.drawCentredString(x_pt + w_pt / 2.0, baseline_y, interpolated)
                elif elem.align == "right":
                    canv.drawRightString(x_pt + w_pt, baseline_y, interpolated)
                else:
                    canv.drawString(x_pt, baseline_y, interpolated)

        elif elem.type == "table":
            if not elem.table_columns and not elem.table_rows:
                return

            # Build rows matrix
            table_data: list[list[str]] = []
            if elem.table_columns:
                table_data.append([self._interpolate(c, variables, defaults) for c in elem.table_columns])

            for row in elem.table_rows:
                table_data.append([self._interpolate(cell, variables, defaults) for cell in row])

            col_widths = elem.table_col_widths if elem.table_col_widths else None
            tbl = Table(table_data, colWidths=col_widths)

            header_bg = HexColor(elem.fill_color or "#1E3A8A")
            grid_c = HexColor(elem.stroke_color or "#CBD5E1")
            tbl.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), header_bg),
                        ("TEXTCOLOR", (0, 0), (-1, 0), white),
                        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                        ("FONTSIZE", (0, 0), (-1, -1), max(8.0, elem.font_size * 0.85)),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                        ("TOPPADDING", (0, 0), (-1, -1), 4),
                        ("GRID", (0, 0), (-1, -1), 0.5, grid_c),
                        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [HexColor("#FFFFFF"), HexColor("#F8FAFC")]),
                    ]
                )
            )

            tbl.wrapOn(canv, w_pt, h_pt)
            tbl.drawOn(canv, x_pt, y_pt)

    def _create_built_in_templates(self) -> dict[str, PdfTemplate]:
        templates: dict[str, PdfTemplate] = {}

        # 1. Modern Tax Invoice
        inv_tpl = PdfTemplate(
            id="invoice_modern",
            name="Professional Tax Invoice",
            category="invoice",
            description="Clean corporate tax invoice with header accents, client info card, line items table, and totals.",
            page_size="A4",
            orientation="portrait",
            is_built_in=True,
            variables=[
                TemplateVariable(key="invoice_no", label="Invoice Number", default_value="INV-2026-0042"),
                TemplateVariable(key="invoice_date", label="Invoice Date", default_value="2026-11-09"),
                TemplateVariable(key="due_date", label="Due Date", default_value="2026-11-23"),
                TemplateVariable(key="company_name", label="Company Name", default_value="Antigravity Systems LLC"),
                TemplateVariable(key="company_address", label="Company Address", default_value="100 Innovation Way, Suite 400"),
                TemplateVariable(key="company_tax_id", label="Tax ID / VAT", default_value="VAT-US-9918274"),
                TemplateVariable(key="client_name", label="Client Name", default_value="Acme Global Corporation"),
                TemplateVariable(key="client_address", label="Client Address", default_value="742 Evergreen Terrace, Springfield"),
                TemplateVariable(key="item_1_desc", label="Item 1 Description", default_value="Enterprise PDF Canvas Engine Development"),
                TemplateVariable(key="item_1_qty", label="Item 1 Qty", default_value="40 hrs"),
                TemplateVariable(key="item_1_rate", label="Item 1 Rate", default_value="$125.00"),
                TemplateVariable(key="item_1_total", label="Item 1 Total", default_value="$5,000.00"),
                TemplateVariable(key="item_2_desc", label="Item 2 Description", default_value="Offline OCR & Template Studio Integration"),
                TemplateVariable(key="item_2_qty", label="Item 2 Qty", default_value="25 hrs"),
                TemplateVariable(key="item_2_rate", label="Item 2 Rate", default_value="$140.00"),
                TemplateVariable(key="item_2_total", label="Item 2 Total", default_value="$3,500.00"),
                TemplateVariable(key="subtotal", label="Subtotal", default_value="$8,500.00"),
                TemplateVariable(key="tax_amount", label="Tax (10%)", default_value="$850.00"),
                TemplateVariable(key="grand_total", label="Grand Total", default_value="$9,350.00"),
                TemplateVariable(key="payment_terms", label="Payment Notes", default_value="Payment is due within 14 days via Direct Bank Transfer."),
            ],
            elements=[
                # Top header bar
                TemplateElement(type="rect", x=0, y=0, width=595.27, height=8, fill_color="#1E3A8A"),
                # Brand title
                TemplateElement(type="heading", x=40, y=35, width=300, height=26, text="{{company_name}}", font_name="Helvetica-Bold", font_size=20, font_color="#1E3A8A"),
                TemplateElement(type="text", x=40, y=65, width=300, height=14, text="{{company_address}} • {{company_tax_id}}", font_size=9, font_color="#64748B"),
                # Invoice Badge & Number
                TemplateElement(type="badge", x=440, y=35, width=115, height=22, text="TAX INVOICE", font_name="Helvetica-Bold", font_size=10, fill_color="#1E3A8A", font_color="#FFFFFF", border_radius=4),
                TemplateElement(type="text", x=400, y=65, width=155, height=14, text="Invoice #: {{invoice_no}}", align="right", font_name="Helvetica-Bold", font_size=10, font_color="#0F172A"),
                TemplateElement(type="text", x=400, y=80, width=155, height=14, text="Date: {{invoice_date}}", align="right", font_size=9, font_color="#475569"),
                TemplateElement(type="text", x=400, y=95, width=155, height=14, text="Due Date: {{due_date}}", align="right", font_size=9, font_color="#475569"),
                # Divider
                TemplateElement(type="line", x=40, y=118, width=515, height=1, stroke_color="#E2E8F0", stroke_width=1),
                # Billed To card
                TemplateElement(type="rect", x=40, y=130, width=515, height=54, fill_color="#F8FAFC", stroke_color="#E2E8F0", stroke_width=1, border_radius=6),
                TemplateElement(type="text", x=55, y=138, width=200, height=12, text="BILLED TO:", font_name="Helvetica-Bold", font_size=8, font_color="#64748B"),
                TemplateElement(type="text", x=55, y=152, width=350, height=14, text="{{client_name}}", font_name="Helvetica-Bold", font_size=11, font_color="#0F172A"),
                TemplateElement(type="text", x=55, y=168, width=400, height=12, text="{{client_address}}", font_size=9, font_color="#475569"),
                # Line Items Table
                TemplateElement(
                    type="table",
                    x=40,
                    y=200,
                    width=515,
                    height=120,
                    fill_color="#1E3A8A",
                    stroke_color="#E2E8F0",
                    font_size=9,
                    table_columns=["Description", "Qty", "Unit Rate", "Total Amount"],
                    table_rows=[
                        ["{{item_1_desc}}", "{{item_1_qty}}", "{{item_1_rate}}", "{{item_1_total}}"],
                        ["{{item_2_desc}}", "{{item_2_qty}}", "{{item_2_rate}}", "{{item_2_total}}"],
                    ],
                    table_col_widths=[275, 60, 90, 90],
                ),
                # Totals Card
                TemplateElement(type="rect", x=335, y=340, width=220, height=80, fill_color="#F1F5F9", stroke_color="#CBD5E1", stroke_width=1, border_radius=6),
                TemplateElement(type="text", x=350, y=348, width=100, height=14, text="Subtotal:", font_size=9, font_color="#475569"),
                TemplateElement(type="text", x=450, y=348, width=90, height=14, text="{{subtotal}}", align="right", font_name="Helvetica-Bold", font_size=9, font_color="#0F172A"),
                TemplateElement(type="text", x=350, y=366, width=100, height=14, text="Tax (10%):", font_size=9, font_color="#475569"),
                TemplateElement(type="text", x=450, y=366, width=90, height=14, text="{{tax_amount}}", align="right", font_size=9, font_color="#0F172A"),
                TemplateElement(type="line", x=350, y=384, width=190, height=1, stroke_color="#CBD5E1", stroke_width=1),
                TemplateElement(type="text", x=350, y=392, width=100, height=16, text="Grand Total:", font_name="Helvetica-Bold", font_size=11, font_color="#1E3A8A"),
                TemplateElement(type="text", x=450, y=392, width=90, height=16, text="{{grand_total}}", align="right", font_name="Helvetica-Bold", font_size=12, font_color="#1E3A8A"),
                # Payment notes & footer
                TemplateElement(type="text", x=40, y=440, width=515, height=20, text="{{payment_terms}}", font_size=9, font_color="#64748B"),
                TemplateElement(type="line", x=40, y=800, width=515, height=1, stroke_color="#E2E8F0", stroke_width=1),
                TemplateElement(type="text", x=40, y=810, width=515, height=14, text="Generated securely via Antigravity 100% Local Enterprise PDF Canvas Studio.", align="center", font_size=8, font_color="#94A3B8"),
            ],
        )
        templates[inv_tpl.id] = inv_tpl

        # 2. Classic Certificate of Achievement
        cert_tpl = PdfTemplate(
            id="certificate_classic",
            name="Certificate of Achievement",
            category="certificate",
            description="Formal, ornate certificate layout suitable for course completions, awards, and credentials.",
            page_size="A4",
            orientation="landscape",
            is_built_in=True,
            variables=[
                TemplateVariable(key="recipient_name", label="Recipient Name", default_value="Sarah M. Jenkins"),
                TemplateVariable(key="award_title", label="Certificate Heading", default_value="CERTIFICATE OF ACHIEVEMENT"),
                TemplateVariable(key="course_name", label="Course / Credential Name", default_value="Advanced Enterprise PDF Architecture & Engineering"),
                TemplateVariable(key="completion_date", label="Completion Date", default_value="November 9, 2026"),
                TemplateVariable(key="issuer_name", label="Issuer / Instructor Name", default_value="Dr. Alexander Vance"),
                TemplateVariable(key="issuer_title", label="Issuer Title", default_value="Chief Architect & Principal Director"),
                TemplateVariable(key="cert_id", label="Certificate ID", default_value="AGY-CERT-2026-9921"),
            ],
            elements=[
                # Outer and Inner Borders
                TemplateElement(type="rect", x=20, y=20, width=801.89, height=555.27, stroke_color="#D97706", stroke_width=3, fill_color="#FFFDF7", border_radius=8),
                TemplateElement(type="rect", x=30, y=30, width=781.89, height=535.27, stroke_color="#1E293B", stroke_width=1, border_radius=4),
                # Header Accent Emblem
                TemplateElement(type="badge", x=370, y=55, width=100, height=22, text="HONORIS", font_name="Times-Bold", font_size=10, fill_color="#D97706", font_color="#FFFFFF", border_radius=11),
                # Title
                TemplateElement(type="heading", x=60, y=95, width=720, height=36, text="{{award_title}}", align="center", font_name="Times-Bold", font_size=26, font_color="#1E293B"),
                TemplateElement(type="text", x=60, y=145, width=720, height=18, text="THIS IS PROUDLY PRESENTED TO", align="center", font_name="Helvetica", font_size=10, font_color="#64748B"),
                # Recipient Name
                TemplateElement(type="heading", x=60, y=180, width=720, height=45, text="{{recipient_name}}", align="center", font_name="Times-Bold", font_size=32, font_color="#D97706"),
                TemplateElement(type="line", x=220, y=235, width=400, height=1, stroke_color="#D97706", stroke_width=1.5),
                # Body
                TemplateElement(
                    type="text",
                    x=120,
                    y=255,
                    width=600,
                    height=40,
                    text="In recognition of outstanding performance, technical excellence, and successful completion of the specialized curriculum in\n{{course_name}}.",
                    align="center",
                    font_name="Times-Roman",
                    font_size=13,
                    font_color="#334155",
                ),
                # Date and ID
                TemplateElement(type="text", x=120, y=340, width=600, height=16, text="Conferred on this day: {{completion_date}} • ID: {{cert_id}}", align="center", font_size=10, font_color="#64748B"),
                # Signature Line
                TemplateElement(type="line", x=320, y=440, width=200, height=1, stroke_color="#475569", stroke_width=1),
                TemplateElement(type="text", x=220, y=450, width=400, height=16, text="{{issuer_name}}", align="center", font_name="Times-Bold", font_size=12, font_color="#0F172A"),
                TemplateElement(type="text", x=220, y=468, width=400, height=14, text="{{issuer_title}}", align="center", font_size=9, font_color="#64748B"),
            ],
        )
        templates[cert_tpl.id] = cert_tpl

        # 3. Modern Executive Resume
        resume_tpl = PdfTemplate(
            id="resume_modern",
            name="Executive Professional Resume",
            category="resume",
            description="Polished modern resume format featuring header summary card, experience blocks, and skills section.",
            page_size="LETTER",
            orientation="portrait",
            is_built_in=True,
            variables=[
                TemplateVariable(key="full_name", label="Full Name", default_value="Alex Rivera"),
                TemplateVariable(key="job_title", label="Professional Headline", default_value="Staff Systems & Full-Stack Engineer"),
                TemplateVariable(key="contact_bar", label="Contact Info Bar", default_value="alex.rivera@example.com  •  +1 (555) 019-2834  •  Seattle, WA  •  github.com/alexrivera"),
                TemplateVariable(key="summary", label="Executive Summary", default_value="Senior Software Architect with 9+ years experience delivering scalable, local-first enterprise applications. Proven expertise in document processing engines, high-reliability microservices, and high-performance UI engineering."),
                TemplateVariable(key="role_1_title", label="Role 1 Title", default_value="Lead Systems Architect  —  Nexus Core Solutions"),
                TemplateVariable(key="role_1_date", label="Role 1 Dates", default_value="2022 – Present"),
                TemplateVariable(key="role_1_desc", label="Role 1 Description", default_value="• Architected an offline-first enterprise PDF processing platform handling 50,000+ operations/sec with immutable revision DAG tracking.\n• Eliminated cloud SaaS dependencies, saving $450k annually while maintaining zero data leaks.\n• Mentored 12 engineers in TypeScript, Python FastAPI, and vector graphic synthesis."),
                TemplateVariable(key="role_2_title", label="Role 2 Title", default_value="Senior Backend Engineer  —  Vertex Analytics"),
                TemplateVariable(key="role_2_date", label="Role 2 Dates", default_value="2018 – 2022"),
                TemplateVariable(key="role_2_desc", label="Role 2 Description", default_value="• Developed high-speed document indexing and full-text search pipelines with SQLite and embedded C++ OCR engines.\n• Optimized PDF rendering and serialization throughput by 3.8x using automated caching."),
                TemplateVariable(key="education", label="Education", default_value="B.S. in Computer Science  •  University of Washington  •  Summa Cum Laude"),
                TemplateVariable(key="skills", label="Core Competencies", default_value="Python, FastAPI, TypeScript, React, PDF.js, ReportLab, SQLite, Tesseract OCR, PyMuPDF, Distributed Systems"),
            ],
            elements=[
                # Top header card
                TemplateElement(type="rect", x=36, y=36, width=540, height=80, fill_color="#0F172A", border_radius=6),
                TemplateElement(type="heading", x=55, y=50, width=500, height=26, text="{{full_name}}", font_name="Helvetica-Bold", font_size=20, font_color="#F8FAFC"),
                TemplateElement(type="text", x=55, y=78, width=500, height=14, text="{{job_title}}", font_name="Helvetica-Bold", font_size=10, font_color="#38BDF8"),
                TemplateElement(type="text", x=55, y=94, width=500, height=12, text="{{contact_bar}}", font_size=8, font_color="#94A3B8"),
                # Summary Section
                TemplateElement(type="heading", x=36, y=130, width=540, height=16, text="EXECUTIVE SUMMARY", font_name="Helvetica-Bold", font_size=10, font_color="#1E3A8A"),
                TemplateElement(type="line", x=36, y=148, width=540, height=1, stroke_color="#CBD5E1", stroke_width=1),
                TemplateElement(type="text", x=36, y=156, width=540, height=40, text="{{summary}}", font_size=9, font_color="#334155"),
                # Experience Section
                TemplateElement(type="heading", x=36, y=210, width=540, height=16, text="PROFESSIONAL EXPERIENCE", font_name="Helvetica-Bold", font_size=10, font_color="#1E3A8A"),
                TemplateElement(type="line", x=36, y=228, width=540, height=1, stroke_color="#CBD5E1", stroke_width=1),
                # Job 1
                TemplateElement(type="text", x=36, y=238, width=380, height=14, text="{{role_1_title}}", font_name="Helvetica-Bold", font_size=9, font_color="#0F172A"),
                TemplateElement(type="text", x=430, y=238, width=146, height=14, text="{{role_1_date}}", align="right", font_size=8.5, font_color="#64748B"),
                TemplateElement(type="text", x=36, y=254, width=540, height=52, text="{{role_1_desc}}", font_size=8.5, font_color="#334155"),
                # Job 2
                TemplateElement(type="text", x=36, y=320, width=380, height=14, text="{{role_2_title}}", font_name="Helvetica-Bold", font_size=9, font_color="#0F172A"),
                TemplateElement(type="text", x=430, y=320, width=146, height=14, text="{{role_2_date}}", align="right", font_size=8.5, font_color="#64748B"),
                TemplateElement(type="text", x=36, y=336, width=540, height=44, text="{{role_2_desc}}", font_size=8.5, font_color="#334155"),
                # Education Section
                TemplateElement(type="heading", x=36, y=395, width=540, height=16, text="EDUCATION", font_name="Helvetica-Bold", font_size=10, font_color="#1E3A8A"),
                TemplateElement(type="line", x=36, y=413, width=540, height=1, stroke_color="#CBD5E1", stroke_width=1),
                TemplateElement(type="text", x=36, y=422, width=540, height=14, text="{{education}}", font_name="Helvetica", font_size=9, font_color="#0F172A"),
                # Skills Section
                TemplateElement(type="heading", x=36, y=450, width=540, height=16, text="TECHNICAL SKILLS & COMPETENCIES", font_name="Helvetica-Bold", font_size=10, font_color="#1E3A8A"),
                TemplateElement(type="line", x=36, y=468, width=540, height=1, stroke_color="#CBD5E1", stroke_width=1),
                TemplateElement(type="text", x=36, y=478, width=540, height=24, text="{{skills}}", font_size=8.5, font_color="#334155"),
            ],
        )
        templates[resume_tpl.id] = resume_tpl

        # 4. Modern Corporate Letterhead
        letterhead_tpl = PdfTemplate(
            id="letterhead_minimal",
            name="Corporate Formal Letterhead",
            category="letterhead",
            description="Official corporate communication layout with header banner, recipient card, and signature block.",
            page_size="A4",
            orientation="portrait",
            is_built_in=True,
            variables=[
                TemplateVariable(key="company_name", label="Company Name", default_value="VERTEX INTELLIGENCE LLC"),
                TemplateVariable(key="company_tagline", label="Tagline", default_value="Secure Enterprise Local Document Architecture"),
                TemplateVariable(key="letter_date", label="Date", default_value="November 9, 2026"),
                TemplateVariable(key="recipient_name", label="Recipient Name", default_value="Jane Doe"),
                TemplateVariable(key="recipient_title", label="Recipient Title", default_value="Vice President of Engineering"),
                TemplateVariable(key="recipient_company", label="Recipient Company", default_value="Global Dynamics Corporation"),
                TemplateVariable(key="subject", label="Subject Line", default_value="RE: Implementation of Local-First Enterprise PDF Processing Suite"),
                TemplateVariable(key="letter_body", label="Letter Body", default_value="We are pleased to inform you that the deployment and verification of the 100% offline, local-first PDF processing platform has been accomplished in full compliance with all enterprise criteria.\n\nAll cryptographic validation, immutable source preservation, and parent-child revision tracking mechanisms are operating reliably across our infrastructure. No external cloud dependencies, API tokens, or remote storage services are utilized at any stage.\n\nPlease review the attached technical documentation, and feel free to contact our engineering team with any additional customization inquiries."),
                TemplateVariable(key="sender_name", label="Sender Name", default_value="Marcus Thorne"),
                TemplateVariable(key="sender_title", label="Sender Title", default_value="Managing Director of Engineering"),
                TemplateVariable(key="footer_info", label="Footer Contact", default_value="Vertex Intelligence LLC  •  500 Innovation Park, Suite 800  •  contact@vertex.local  •  www.vertex.local"),
            ],
            elements=[
                # Top accent bar
                TemplateElement(type="rect", x=0, y=0, width=595.27, height=10, fill_color="#0F172A"),
                TemplateElement(type="heading", x=50, y=40, width=350, height=22, text="{{company_name}}", font_name="Helvetica-Bold", font_size=16, font_color="#0F172A"),
                TemplateElement(type="text", x=50, y=65, width=350, height=14, text="{{company_tagline}}", font_size=9, font_color="#64748B"),
                TemplateElement(type="line", x=50, y=90, width=495, height=1, stroke_color="#E2E8F0", stroke_width=1),
                # Date & Recipient
                TemplateElement(type="text", x=50, y=110, width=200, height=14, text="Date: {{letter_date}}", font_size=9.5, font_color="#64748B"),
                TemplateElement(type="text", x=50, y=135, width=400, height=14, text="{{recipient_name}}", font_name="Helvetica-Bold", font_size=10, font_color="#0F172A"),
                TemplateElement(type="text", x=50, y=150, width=400, height=14, text="{{recipient_title}}", font_size=9, font_color="#475569"),
                TemplateElement(type="text", x=50, y=165, width=400, height=14, text="{{recipient_company}}", font_size=9, font_color="#475569"),
                # Subject line
                TemplateElement(type="text", x=50, y=195, width=495, height=16, text="{{subject}}", font_name="Helvetica-Bold", font_size=10, font_color="#0F172A"),
                # Letter Body
                TemplateElement(type="text", x=50, y=225, width=495, height=180, text="{{letter_body}}", font_size=10, font_color="#334155"),
                # Sign off
                TemplateElement(type="text", x=50, y=430, width=200, height=14, text="Sincerely,", font_size=10, font_color="#334155"),
                TemplateElement(type="text", x=50, y=475, width=300, height=16, text="{{sender_name}}", font_name="Helvetica-Bold", font_size=11, font_color="#0F172A"),
                TemplateElement(type="text", x=50, y=493, width=300, height=14, text="{{sender_title}}", font_size=9, font_color="#64748B"),
                # Footer bar
                TemplateElement(type="line", x=50, y=780, width=495, height=1, stroke_color="#E2E8F0", stroke_width=1),
                TemplateElement(type="text", x=50, y=792, width=495, height=14, text="{{footer_info}}", align="center", font_size=8, font_color="#94A3B8"),
            ],
        )
        templates[letterhead_tpl.id] = letterhead_tpl

        return templates
