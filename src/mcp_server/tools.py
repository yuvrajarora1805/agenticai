"""
Mock FastMCP Server for WareSync AI.
Exposes at least 2 external tools required by Requirement #2:
- Tool 1: Warehouse DB (Inventory Lookup & Stock Allocation)
- Tool 2: Invoice Document Intelligence (PDF Parser & PO Matching)
- Tool 3: Procurement Reorder & Pricing Calculator
"""

import json
from typing import Dict, Any, List
from src.schemas.models import (
    InventoryCheckResult,
    InvoiceAuditResult,
    InvoiceAuditStatus,
    InvoiceDiscrepancy,
    PurchaseOrderProposal,
)

# Mock persistent database records
_MOCK_WAREHOUSE_DB = {
    "SKU-1001": {"name": "Industrial Conveyor Belt", "stock": 45, "reserved": 10, "safety": 15, "price": 250.0},
    "SKU-1002": {"name": "Hydraulic Forklift Valve", "stock": 8, "reserved": 4, "safety": 10, "price": 45.0},
    "SKU-1003": {"name": "Barcode Scanner Unit", "stock": 120, "reserved": 20, "safety": 30, "price": 85.0},
}

_MOCK_PO_DB = {
    "PO-9001": {
        "po_id": "PO-9001",
        "supplier_id": "SUPP-ALPHA",
        "sku": "SKU-1002",
        "quantity": 50,
        "unit_price": 45.0,
        "total_amount": 2250.0,
    }
}


class WarehouseMCPServer:
    """
    MCP Server Tool endpoints.
    Can be run as an MCP server via stdio/SSE or imported directly by agents.
    """

    # --- Tool 1: Database Operations (Requirement #2) ---

    @staticmethod
    def db_check_inventory(sku: str, requested_qty: int) -> InventoryCheckResult:
        """Query DB to verify current available stock and identify deficits."""
        item = _MOCK_WAREHOUSE_DB.get(sku)
        if not item:
            return InventoryCheckResult(
                sku=sku,
                is_available=False,
                requested_qty=requested_qty,
                allocated_qty=0,
                shortage_qty=requested_qty,
                requires_reorder=True,
            )

        available = item["stock"] - item["reserved"]
        if available >= requested_qty:
            return InventoryCheckResult(
                sku=sku,
                is_available=True,
                requested_qty=requested_qty,
                allocated_qty=requested_qty,
                shortage_qty=0,
                requires_reorder=(item["stock"] - requested_qty) < item["safety"],
            )
        else:
            shortage = requested_qty - max(0, available)
            return InventoryCheckResult(
                sku=sku,
                is_available=False,
                requested_qty=requested_qty,
                allocated_qty=max(0, available),
                shortage_qty=shortage,
                requires_reorder=True,
            )

    @staticmethod
    def db_reserve_inventory(sku: str, quantity: int) -> bool:
        """Reserve inventory in the database."""
        item = _MOCK_WAREHOUSE_DB.get(sku)
        if not item:
            return False
        available = item["stock"] - item["reserved"]
        if available >= quantity:
            item["reserved"] += quantity
            return True
        return False

    # --- Tool 2: Invoice Document Intelligence (Requirement #2) ---

    @staticmethod
    def parse_and_audit_invoice(
        invoice_number: str,
        po_id: str,
        supplier_id: str,
        invoice_items: List[Dict[str, Any]],
        invoice_total: float,
    ) -> InvoiceAuditResult:
        """
        Parses invoice data and compares against Purchase Order records.
        Detects price mismatches, quantity deviations, or invalid POs.
        """
        po = _MOCK_PO_DB.get(po_id)
        if not po:
            return InvoiceAuditResult(
                invoice_number=invoice_number,
                po_id=po_id,
                supplier_id=supplier_id,
                status=InvoiceAuditStatus.INVALID_PO,
                total_amount=invoice_total,
                approved_for_payment=False,
                audit_notes=f"PO '{po_id}' not found in warehouse records.",
            )

        discrepancies: List[InvoiceDiscrepancy] = []
        status = InvoiceAuditStatus.VERIFIED

        # Check PO item match
        matched = False
        for item in invoice_items:
            sku = item.get("sku")
            qty = item.get("quantity", 0)
            price = item.get("unit_price", 0.0)

            if sku == po["sku"]:
                matched = True
                if qty != po["quantity"]:
                    status = InvoiceAuditStatus.QUANTITY_MISMATCH
                    discrepancies.append(
                        InvoiceDiscrepancy(
                            sku=sku,
                            field_name="quantity",
                            invoice_value=qty,
                            po_value=po["quantity"],
                            description="Billed quantity differs from ordered quantity",
                        )
                    )
                if abs(price - po["unit_price"]) > 0.01:
                    status = InvoiceAuditStatus.PRICE_MISMATCH
                    discrepancies.append(
                        InvoiceDiscrepancy(
                            sku=sku,
                            field_name="unit_price",
                            invoice_value=price,
                            po_value=po["unit_price"],
                            description="Unit price does not match purchase agreement",
                        )
                    )

        if not matched:
            status = InvoiceAuditStatus.REJECTED
            discrepancies.append(
                InvoiceDiscrepancy(
                    sku="UNKNOWN",
                    field_name="sku",
                    invoice_value="Non-matching",
                    po_value=po["sku"],
                    description="No ordered SKUs found on invoice",
                )
            )

        is_approved = (len(discrepancies) == 0 and status == InvoiceAuditStatus.VERIFIED)

        return InvoiceAuditResult(
            invoice_number=invoice_number,
            po_id=po_id,
            supplier_id=supplier_id,
            status=status,
            total_amount=invoice_total,
            discrepancies=discrepancies,
            approved_for_payment=is_approved,
            audit_notes="Audit passed." if is_approved else f"Discrepancies found: {len(discrepancies)}",
        )

    # --- Tool 3: Procurement Quote Calculator ---

    @staticmethod
    def calculate_procurement_quote(sku: str, required_qty: int) -> PurchaseOrderProposal:
        """Compute optimal reorder quantity, cost, and vendor lead-time."""
        item = _MOCK_WAREHOUSE_DB.get(sku, {"price": 100.0, "name": "General Item"})
        unit_cost = item.get("price", 100.0) * 0.85  # Bulk wholesale rate
        total_cost = unit_cost * required_qty

        return PurchaseOrderProposal(
            po_id=f"PO-{abs(hash(sku + str(required_qty))) % 10000:04d}",
            supplier_id="SUPP-PREFERRED",
            supplier_name="Industrial Supply Logistics Co.",
            sku=sku,
            quantity=required_qty,
            unit_cost=round(unit_cost, 2),
            total_cost=round(total_cost, 2),
            estimated_delivery_days=3,
            approval_required=total_cost > 5000.0,
        )
