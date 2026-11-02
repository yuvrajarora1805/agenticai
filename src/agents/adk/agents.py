"""
ADK (Agent Development Kit) Specialized Agents for WareSync AI:
1. InventoryAgent (Inventory Custodian & Threshold Verifier)
2. InvoiceAgent (Supplier Invoice OCR & Three-Way Match Engine)
Strict line limit: <250 lines.
"""

from typing import Dict, Any, List, Optional
from src.schemas.models import (
    InventoryCheckResult,
    InvoiceAuditResult,
    AgentFramework,
)
from src.mcp_server.tools import WarehouseMCPServer


class ADKOperationsSuite:
    """Manages the 2 Google ADK agents for inventory custody and invoice intelligence."""

    def __init__(self, callback_handler=None):
        self.callback = callback_handler

    # --- 1. Inventory Agent (ADK) ---
    def check_stock_availability(self, sku: str, requested_qty: int) -> InventoryCheckResult:
        """Queries the warehouse database via MCP to verify stock balances and safety levels."""
        res: InventoryCheckResult = WarehouseMCPServer.db_check_inventory(
            sku=sku,
            requested_qty=requested_qty
        )
        return res

    def reserve_stock(self, sku: str, qty: int) -> bool:
        """Transactionally locks inventory for an accepted customer order."""
        return WarehouseMCPServer.db_reserve_inventory(sku=sku, quantity=qty)

    # --- 2. Invoice Processing Agent (ADK) ---
    def audit_supplier_invoice(
        self,
        invoice_number: str,
        po_id: str,
        supplier_id: str,
        invoice_items: List[Dict[str, Any]],
        invoice_total: float
    ) -> InvoiceAuditResult:
        """Decodes invoice line items and executes 3-way match against authorized PO & GRN."""
        audit_res: InvoiceAuditResult = WarehouseMCPServer.parse_and_audit_invoice(
            invoice_number=invoice_number,
            po_id=po_id,
            supplier_id=supplier_id,
            invoice_items=invoice_items,
            invoice_total=invoice_total
        )
        return audit_res


_adk_suite = None

def get_adk_suite() -> ADKOperationsSuite:
    global _adk_suite
    if _adk_suite is None:
        _adk_suite = ADKOperationsSuite()
    return _adk_suite
