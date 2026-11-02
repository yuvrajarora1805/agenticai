"""
Deterministic PDF Invoice Generator for WareSync AI.
Builds real, auditable PDF documents for Supplier Invoices (AP) and Customer Invoices (AR).
Complies with strict modular line limit (<250 lines).
"""

import os
import hashlib
from datetime import datetime
from typing import Dict, Any, List
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
INVOICE_STORAGE_DIR = os.path.join(BASE_DIR, "data", "invoices")
os.makedirs(os.path.join(INVOICE_STORAGE_DIR, "customer"), exist_ok=True)
os.makedirs(os.path.join(INVOICE_STORAGE_DIR, "supplier"), exist_ok=True)
os.makedirs(os.path.join(INVOICE_STORAGE_DIR, "challans"), exist_ok=True)


class InvoicePDFGenerator:
    """Generates professional, compliant PDF invoices with SHA-256 checksums."""

    @staticmethod
    def _create_pdf(filepath: str, title: str, meta: Dict[str, str], items: List[List[Any]], totals: Dict[str, float]) -> str:
        doc = SimpleDocTemplate(filepath, pagesize=letter, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
        story = []
        styles = getSampleStyleSheet()

        title_style = ParagraphStyle("InvTitle", parent=styles["Heading1"], fontSize=20, textColor=colors.HexColor("#0f172a"), spaceAfter=10)
        hdr_style = ParagraphStyle("InvHdr", parent=styles["Normal"], fontSize=9, textColor=colors.HexColor("#475569"))
        body_style = ParagraphStyle("InvBody", parent=styles["Normal"], fontSize=9, textColor=colors.HexColor("#1e293b"))

        # Header Title
        story.append(Paragraph(title, title_style))
        story.append(Spacer(1, 8))

        # Metadata grid
        meta_data = [[Paragraph(f"<b>{k}:</b> {v}", hdr_style) for k, v in list(meta.items())[i:i+2]] for i in range(0, len(meta), 2)]
        meta_table = Table(meta_data, colWidths=[270, 270])
        meta_table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")), ("PADDING", (0, 0), (-1, -1), 6)]))
        story.append(meta_table)
        story.append(Spacer(1, 15))

        # Line Items Table
        table_data = [["SKU", "Description", "Qty", "Unit Price", "Total"]]
        for row in items:
            table_data.append([
                Paragraph(str(row[0]), body_style),
                Paragraph(str(row[1]), body_style),
                Paragraph(str(row[2]), body_style),
                f"${float(row[3]):,.2f}",
                f"${float(row[4]):,.2f}",
            ])

        item_table = Table(table_data, colWidths=[90, 210, 50, 95, 95])
        item_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0284c7")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ]))
        story.append(item_table)
        story.append(Spacer(1, 15))

        # Totals Summary Table
        totals_data = [
            ["Subtotal:", f"${totals.get('subtotal', 0.0):,.2f}"],
            ["Tax (GST/VAT):", f"${totals.get('tax', 0.0):,.2f}"],
            ["Grand Total:", f"${totals.get('grand_total', 0.0):,.2f}"],
        ]
        tot_table = Table(totals_data, colWidths=[120, 100], hAlign="RIGHT")
        tot_table.setStyle(TableStyle([
            ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ("TEXTCOLOR", (0, -1), (-1, -1), colors.HexColor("#0369a1")),
            ("LINEABOVE", (0, -1), (-1, -1), 1, colors.HexColor("#0f172a")),
            ("PADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(tot_table)

        doc.build(story)

        with open(filepath, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()

    @classmethod
    def generate_customer_invoice(cls, invoice_num: str, order_id: str, customer_name: str, items: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Generates real Customer Sales Invoice (AR)."""
        filename = f"{invoice_num}.pdf"
        filepath = os.path.join(INVOICE_STORAGE_DIR, "customer", filename)
        subtotal = sum(it.get("quantity", 1) * it.get("unit_price", 0.0) for it in items)
        tax = round(subtotal * 0.18, 2)
        grand_total = round(subtotal + tax, 2)

        meta = {
            "Invoice Number": invoice_num,
            "Issue Date": datetime.utcnow().strftime("%Y-%m-%d"),
            "Customer Order ID": order_id,
            "Billed To": customer_name,
            "Document Type": "Customer Sales Invoice (AR)",
            "Payment Status": "UNPAID (Net 30)",
        }
        rows = [[it.get("sku", "SKU-000"), it.get("name", "Item"), it.get("quantity", 1), it.get("unit_price", 0.0), it.get("quantity", 1) * it.get("unit_price", 0.0)] for it in items]
        checksum = cls._create_pdf(filepath, "CUSTOMER SALES INVOICE", meta, rows, {"subtotal": subtotal, "tax": tax, "grand_total": grand_total})

        return {
            "invoice_number": invoice_num,
            "type": "customer",
            "order_id": order_id,
            "filepath": filepath,
            "filename": filename,
            "checksum": checksum,
            "grand_total": grand_total,
            "status": "ISSUED",
        }

    @classmethod
    def generate_supplier_invoice(cls, invoice_num: str, po_id: str, supplier_name: str, items: List[Dict[str, Any]], variance_note: str = "") -> Dict[str, Any]:
        """Generates Supplier Billing Invoice (AP) for 3-Way Matching audits."""
        filename = f"{invoice_num}.pdf"
        filepath = os.path.join(INVOICE_STORAGE_DIR, "supplier", filename)
        subtotal = sum(it.get("quantity", 1) * it.get("unit_price", 0.0) for it in items)
        tax = round(subtotal * 0.18, 2)
        grand_total = round(subtotal + tax, 2)

        meta = {
            "Invoice Number": invoice_num,
            "Supplier Name": supplier_name,
            "PO Reference": po_id,
            "Document Date": datetime.utcnow().strftime("%Y-%m-%d"),
            "Document Type": "Supplier Commercial Invoice (AP)",
            "Discrepancy Note": variance_note or "None (Clean PO Match)",
        }
        rows = [[it.get("sku", "SKU-000"), it.get("name", "Supplier Item"), it.get("quantity", 1), it.get("unit_price", 0.0), it.get("quantity", 1) * it.get("unit_price", 0.0)] for it in items]
        checksum = cls._create_pdf(filepath, "SUPPLIER COMMERCIAL INVOICE", meta, rows, {"subtotal": subtotal, "tax": tax, "grand_total": grand_total})

        return {
            "invoice_number": invoice_num,
            "type": "supplier",
            "po_id": po_id,
            "supplier_name": supplier_name,
            "filepath": filepath,
            "filename": filename,
            "checksum": checksum,
            "grand_total": grand_total,
            "variance_note": variance_note,
        }

    @classmethod
    def generate_delivery_challan(cls, challan_num: str, order_id: str, recipient: str, carrier: str, tracking_num: str, items: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Generates official Delivery Challan (DC) for physical dispatch movement."""
        filename = f"{challan_num}.pdf"
        filepath = os.path.join(INVOICE_STORAGE_DIR, "challans", filename)
        meta = {
            "Delivery Challan No": challan_num,
            "Dispatch Date": datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
            "Customer Order Ref": order_id,
            "Consignee / Recipient": recipient,
            "Assigned Logistics Carrier": carrier,
            "Carrier Tracking Barcode": tracking_num,
        }
        rows = [[it.get("sku", "SKU-000"), it.get("name", "Item"), it.get("quantity", 1), 0.0, 0.0] for it in items]
        checksum = cls._create_pdf(filepath, "OFFICIAL GOODS DELIVERY CHALLAN", meta, rows, {"subtotal": 0.0, "tax": 0.0, "grand_total": 0.0})

        return {
            "challan_number": challan_num,
            "order_id": order_id,
            "filepath": filepath,
            "filename": filename,
            "checksum": checksum,
            "carrier": carrier,
            "tracking_number": tracking_num,
            "status": "DISPATCHED",
        }

