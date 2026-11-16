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

# Seed initial demonstration supplier invoices if not already on disk
def seed_demo_invoices():
    # Keep customer invoice storage empty until actual orders are placed by the customer

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
    """Lists all stored Customer and Supplier PDF invoices sorted with most recent on top."""
    results = []

    def get_sorted_files(directory: str):
        if not os.path.exists(directory):
            return []
        files = [f for f in os.listdir(directory) if f.endswith(".pdf")]
        # Sort by creation/modification timestamp descending (newest first)
        files.sort(key=lambda f: os.path.getmtime(os.path.join(directory, f)), reverse=True)
        return files

    # Read Customer Invoices (Most recent first)
    cust_dir = os.path.join(INVOICE_STORAGE_DIR, "customer")
    for f in get_sorted_files(cust_dir):
        inv_id = f.replace(".pdf", "")
        results.append({
            "id": inv_id,
            "filename": f,
            "type": "Customer (AR)",
            "category": "Customer Invoicing",
            "status": "ISSUED",
            "mtime": os.path.getmtime(os.path.join(cust_dir, f)),
            "preview_url": f"/api/invoices/preview/{inv_id}?type=customer",
            "download_url": f"/api/invoices/download/{inv_id}?type=customer",
        })

    # Read Delivery Challans (DC) (Most recent first)
    dc_dir = os.path.join(INVOICE_STORAGE_DIR, "challans")
    for f in get_sorted_files(dc_dir):
        dc_id = f.replace(".pdf", "")
        results.append({
            "id": dc_id,
            "filename": f,
            "type": "Delivery Challan (DC)",
            "category": "Dispatch Logistics",
            "status": "DISPATCHED",
            "mtime": os.path.getmtime(os.path.join(dc_dir, f)),
            "preview_url": f"/api/invoices/preview/{dc_id}?type=challans",
            "download_url": f"/api/invoices/download/{dc_id}?type=challans",
        })

    # Read Supplier Invoices (Most recent first)
    supp_dir = os.path.join(INVOICE_STORAGE_DIR, "supplier")
    for f in get_sorted_files(supp_dir):
        inv_id = f.replace(".pdf", "")
        is_mismatch = "991" in f
        results.append({
            "id": inv_id,
            "filename": f,
            "type": "Supplier (AP)",
            "category": "Supplier Invoicing",
            "status": "DISCREPANCY_HELD" if is_mismatch else "VERIFIED_MATCH",
            "mtime": os.path.getmtime(os.path.join(supp_dir, f)),
            "preview_url": f"/api/invoices/preview/{inv_id}?type=supplier",
            "download_url": f"/api/invoices/download/{inv_id}?type=supplier",
        })

    return {"invoices": results}


@router.get("/preview/{invoice_id}")
def preview_invoice(invoice_id: str, type: str = "customer"):
    """Serves inline PDF for browser iframe preview."""
    clean_id = invoice_id.replace(".pdf", "")
    subdir = "customer" if type == "customer" else ("supplier" if type == "supplier" else "challans")
    filepath = os.path.join(INVOICE_STORAGE_DIR, subdir, f"{clean_id}.pdf")
    if not os.path.exists(filepath):
        # Fallback check across all subdirs
        for sd in ["customer", "challans", "supplier"]:
            candidate = os.path.join(INVOICE_STORAGE_DIR, sd, f"{clean_id}.pdf")
            if os.path.exists(candidate):
                filepath = candidate
                break
        else:
            raise HTTPException(status_code=404, detail=f"Invoice PDF {clean_id} not found")

    return FileResponse(
        filepath,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"inline; filename={clean_id}.pdf",
            "Access-Control-Allow-Origin": "*",
            "X-Frame-Options": "SAMEORIGIN",
        }
    )


@router.get("/download/{invoice_id}")
def download_invoice(invoice_id: str, type: str = "customer"):
    """Downloads the invoice PDF with attachment header."""
    clean_id = invoice_id.replace(".pdf", "")
    subdir = "customer" if type == "customer" else ("supplier" if type == "supplier" else "challans")
    filepath = os.path.join(INVOICE_STORAGE_DIR, subdir, f"{clean_id}.pdf")
    if not os.path.exists(filepath):
        for sd in ["customer", "challans", "supplier"]:
            candidate = os.path.join(INVOICE_STORAGE_DIR, sd, f"{clean_id}.pdf")
            if os.path.exists(candidate):
                filepath = candidate
                break
        else:
            raise HTTPException(status_code=404, detail=f"Invoice PDF {clean_id} not found")

    return FileResponse(filepath, media_type="application/pdf", filename=f"{clean_id}.pdf")
