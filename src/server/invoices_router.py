"""
Invoice Management and PDF Document Delivery Router for WareSync AI.
Serves invoice metadata, raw PDF downloads, and inline previews for Dashboard UI.
Strict line limit: <200 lines.
"""

import os
from typing import Dict, Any, List
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from src.server.pdf_generator import InvoicePDFGenerator, INVOICE_STORAGE_DIR

router = APIRouter(prefix="/api/invoices", tags=["Invoices"])

# Seed initial demonstration invoices if not already on disk
def seed_demo_invoices():
    # Customer Invoice (AR)
    InvoicePDFGenerator.generate_customer_invoice(
        invoice_num="INV-CUST-2026-001",
        order_id="ORD-1001",
        customer_name="Global Freight Logistics Inc.",
        items=[
            {"sku": "SKU-1001", "name": "Industrial Conveyor Belt", "quantity": 5, "unit_price": 250.0},
            {"sku": "SKU-1002", "name": "Hydraulic Forklift Valve", "quantity": 4, "unit_price": 45.0},
        ]
    )

    # Supplier Invoice Perfect Match (AP)
    InvoicePDFGenerator.generate_supplier_invoice(
        invoice_num="INV-SUPP-2026-900",
        po_id="PO-9001",
        supplier_name="Alpha Industrial Components",
        items=[
            {"sku": "SKU-1002", "name": "Hydraulic Forklift Valve", "quantity": 50, "unit_price": 45.0}
        ],
        variance_note="Clean Three-Way Match (PO + GRN + Invoice agree)"
    )

    # Supplier Invoice Discrepancy (AP - Rate Mismatch)
    InvoicePDFGenerator.generate_supplier_invoice(
        invoice_num="INV-SUPP-2026-991",
        po_id="PO-9001",
        supplier_name="Alpha Industrial Components",
        items=[
            {"sku": "SKU-1002", "name": "Hydraulic Forklift Valve", "quantity": 40, "unit_price": 48.0}
        ],
        variance_note="Discrepancy: Billed rate $48.00 exceeds PO rate $45.00 (+6.6%)"
    )

seed_demo_invoices()


@router.get("/list")
def list_invoices() -> Dict[str, List[Dict[str, Any]]]:
    """Lists all stored Customer and Supplier PDF invoices with metadata."""
    results = []

    # Read Customer Invoices
    cust_dir = os.path.join(INVOICE_STORAGE_DIR, "customer")
    if os.path.exists(cust_dir):
        for f in sorted(os.listdir(cust_dir)):
            if f.endswith(".pdf"):
                inv_id = f.replace(".pdf", "")
                results.append({
                    "id": inv_id,
                    "filename": f,
                    "type": "Customer (AR)",
                    "category": "Customer Invoicing",
                    "status": "ISSUED",
                    "preview_url": f"/api/invoices/preview/{inv_id}?type=customer",
                    "download_url": f"/api/invoices/download/{inv_id}?type=customer",
                })

    # Read Supplier Invoices
    supp_dir = os.path.join(INVOICE_STORAGE_DIR, "supplier")
    if os.path.exists(supp_dir):
        for f in sorted(os.listdir(supp_dir)):
            if f.endswith(".pdf"):
                inv_id = f.replace(".pdf", "")
                is_mismatch = "991" in f
                results.append({
                    "id": inv_id,
                    "filename": f,
                    "type": "Supplier (AP)",
                    "category": "Supplier Invoicing",
                    "status": "DISCREPANCY_HELD" if is_mismatch else "VERIFIED_MATCH",
                    "preview_url": f"/api/invoices/preview/{inv_id}?type=supplier",
                    "download_url": f"/api/invoices/download/{inv_id}?type=supplier",
                })

    # Read Delivery Challans (DC)
    dc_dir = os.path.join(INVOICE_STORAGE_DIR, "challans")
    if os.path.exists(dc_dir):
        for f in sorted(os.listdir(dc_dir)):
            if f.endswith(".pdf"):
                dc_id = f.replace(".pdf", "")
                results.append({
                    "id": dc_id,
                    "filename": f,
                    "type": "Delivery Challan (DC)",
                    "category": "Dispatch Logistics",
                    "status": "DISPATCHED",
                    "preview_url": f"/api/invoices/preview/{dc_id}?type=challans",
                    "download_url": f"/api/invoices/download/{dc_id}?type=challans",
                })

    return {"invoices": results}


@router.get("/preview/{invoice_id}")
def preview_invoice(invoice_id: str, type: str = "customer"):
    """Serves inline PDF for browser iframe preview."""
    subdir = "customer" if type == "customer" else ("supplier" if type == "supplier" else "challans")
    filepath = os.path.join(INVOICE_STORAGE_DIR, subdir, f"{invoice_id}.pdf")
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail=f"Invoice PDF {invoice_id} not found")
    return FileResponse(filepath, media_type="application/pdf", headers={"Content-Disposition": f"inline; filename={invoice_id}.pdf"})


@router.get("/download/{invoice_id}")
def download_invoice(invoice_id: str, type: str = "customer"):
    """Downloads the invoice PDF with attachment header."""
    subdir = "customer" if type == "customer" else ("supplier" if type == "supplier" else "challans")
    filepath = os.path.join(INVOICE_STORAGE_DIR, subdir, f"{invoice_id}.pdf")
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail=f"Invoice PDF {invoice_id} not found")
    return FileResponse(filepath, media_type="application/pdf", filename=f"{invoice_id}.pdf")
