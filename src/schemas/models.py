"""
WareSync AI - Core Pydantic Schemas.
Enforces structured outputs, blackboard state definitions, and A2A messages.
"""

from enum import Enum
from typing import List, Dict, Optional, Any
from datetime import datetime
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class SystemStatus(str, Enum):
    IDLE = "IDLE"
    PROCESSING = "PROCESSING"
    WAITING_APPROVAL = "WAITING_APPROVAL"
    COMPLETED = "COMPLETED"
    ERROR = "ERROR"


class AgentFramework(str, Enum):
    CREWAI = "CrewAI"
    ADK = "ADK"


class OrderStatus(str, Enum):
    RECEIVED = "RECEIVED"
    STOCK_CHECKED = "STOCK_CHECKED"
    RESERVED = "RESERVED"
    PARTIAL = "PARTIAL"
    BACKORDERED = "BACKORDERED"
    DISPATCHED = "DISPATCHED"
    CANCELLED = "CANCELLED"


class InvoiceAuditStatus(str, Enum):
    PENDING = "PENDING"
    VERIFIED = "VERIFIED"
    QUANTITY_MISMATCH = "QUANTITY_MISMATCH"
    PRICE_MISMATCH = "PRICE_MISMATCH"
    INVALID_PO = "INVALID_PO"
    REJECTED = "REJECTED"


# ---------------------------------------------------------------------------
# Agent Structured Outputs (Pydantic Requirement #3)
# ---------------------------------------------------------------------------

class StockItem(BaseModel):
    sku: str
    name: str
    available_qty: int
    reserved_qty: int
    safety_stock: int
    unit_price: float
    reorder_point: int


class InventoryCheckResult(BaseModel):
    sku: str
    is_available: bool
    requested_qty: int
    allocated_qty: int
    shortage_qty: int = 0
    requires_reorder: bool = False


class PurchaseOrderProposal(BaseModel):
    po_id: str
    supplier_id: str
    supplier_name: str
    sku: str
    quantity: int
    unit_cost: float
    total_cost: float
    estimated_delivery_days: int
    created_at: datetime = Field(default_factory=datetime.utcnow)
    approval_required: bool = False


class DispatchFulfillmentReport(BaseModel):
    order_id: str
    customer_id: str
    items_fulfilled: List[Dict[str, int]]
    status: OrderStatus
    tracking_number: Optional[str] = None
    notes: str = ""
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class InvoiceDiscrepancy(BaseModel):
    sku: str
    field_name: str
    invoice_value: Any
    po_value: Any
    description: str


class InvoiceAuditResult(BaseModel):
    invoice_number: str
    po_id: str
    supplier_id: str
    status: InvoiceAuditStatus
    total_amount: float
    discrepancies: List[InvoiceDiscrepancy] = Field(default_factory=list)
    approved_for_payment: bool = False
    audit_notes: str = ""


# ---------------------------------------------------------------------------
# A2A Message Envelope (Protocol Requirement #6)
# ---------------------------------------------------------------------------

class A2AMessage(BaseModel):
    message_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    sender_agent: str
    sender_framework: AgentFramework
    receiver_agent: str
    receiver_framework: AgentFramework
    intent: str
    correlation_id: str
    payload: Dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Central Hover Blackboard State (Blackboard Requirement #1)
# ---------------------------------------------------------------------------

class BlackboardTraceEntry(BaseModel):
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    agent_name: str
    framework: AgentFramework
    action: str
    details: Dict[str, Any] = Field(default_factory=dict)
    tokens_used: int = 0
    latency_ms: float = 0.0


class BlackboardState(BaseModel):
    session_id: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_updated: datetime = Field(default_factory=datetime.utcnow)
    status: SystemStatus = SystemStatus.IDLE
    active_agent: Optional[str] = None

    # Operational Contexts
    inventory_cache: Dict[str, StockItem] = Field(default_factory=dict)
    active_orders: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    purchase_orders: Dict[str, PurchaseOrderProposal] = Field(default_factory=dict)
    invoices: Dict[str, InvoiceAuditResult] = Field(default_factory=dict)

    # Cross-Agent Event Queue & Traces
    pending_events: List[A2AMessage] = Field(default_factory=list)
    execution_trace: List[BlackboardTraceEntry] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)
