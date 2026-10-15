"""
Hover Blackboard State Engine for WareSync AI.
Implements the shared-memory Blackboard Architecture (Requirement #1).
Allows agents across frameworks (CrewAI and ADK) to read, update state, and emit traces.
"""

from typing import Dict, Any, Optional, Callable, List
from datetime import datetime
import threading
from src.schemas.models import (
    BlackboardState,
    BlackboardTraceEntry,
    StockItem,
    PurchaseOrderProposal,
    InvoiceAuditResult,
    A2AMessage,
    SystemStatus,
    AgentFramework,
)


class HoverBlackboard:
    """
    Central Hover Blackboard.
    Provides thread-safe state access, event hooks, and execution audit logging.
    """

    def __init__(self, session_id: str):
        self.lock = threading.RLock()
        self.state = BlackboardState(session_id=session_id)
        self._subscribers: List[Callable[[str, Any], None]] = []

    def subscribe(self, callback: Callable[[str, Any], None]) -> None:
        """Register a callback for state changes."""
        self._subscribers.append(callback)

    def _notify(self, event_type: str, data: Any) -> None:
        for sub in self._subscribers:
            try:
                sub(event_type, data)
            except Exception as e:
                self.record_error(f"Subscriber error on event {event_type}: {e}")

    # --- State Read/Write Methods ---

    def set_system_status(self, status: SystemStatus, active_agent: Optional[str] = None) -> None:
        with self.lock:
            self.state.status = status
            self.state.active_agent = active_agent
            self.state.last_updated = datetime.utcnow()
            self._notify("status_change", {"status": status, "active_agent": active_agent})

    def update_stock_item(self, item: StockItem) -> None:
        with self.lock:
            self.state.inventory_cache[item.sku] = item
            self.state.last_updated = datetime.utcnow()
            self._notify("inventory_update", item.model_dump())

    def get_stock_item(self, sku: str) -> Optional[StockItem]:
        with self.lock:
            return self.state.inventory_cache.get(sku)

    def record_purchase_order(self, po: PurchaseOrderProposal) -> None:
        with self.lock:
            self.state.purchase_orders[po.po_id] = po
            self.state.last_updated = datetime.utcnow()
            self._notify("purchase_order_posted", po.model_dump())

    def record_invoice_audit(self, audit: InvoiceAuditResult) -> None:
        with self.lock:
            self.state.invoices[audit.invoice_number] = audit
            self.state.last_updated = datetime.utcnow()
            self._notify("invoice_audited", audit.model_dump())

    def post_a2a_event(self, event: A2AMessage) -> None:
        with self.lock:
            self.state.pending_events.append(event)
            self.state.last_updated = datetime.utcnow()
            self._notify("a2a_event", event.model_dump())

    def log_trace(
        self,
        agent_name: str,
        framework: AgentFramework,
        action: str,
        details: Optional[Dict[str, Any]] = None,
        tokens_used: int = 0,
        latency_ms: float = 0.0,
    ) -> None:
        """Requirement #5: Task monitoring & intermediate step recording."""
        entry = BlackboardTraceEntry(
            agent_name=agent_name,
            framework=framework,
            action=action,
            details=details or {},
            tokens_used=tokens_used,
            latency_ms=latency_ms,
        )
        with self.lock:
            self.state.execution_trace.append(entry)
            self.state.last_updated = datetime.utcnow()
            self._notify("trace_entry", entry.model_dump())

    def record_error(self, error_msg: str) -> None:
        with self.lock:
            self.state.errors.append(error_msg)
            self.state.status = SystemStatus.ERROR
            self.state.last_updated = datetime.utcnow()
            self._notify("error_logged", error_msg)

    def get_full_state(self) -> BlackboardState:
        with self.lock:
            return self.state.model_copy(deep=True)


# Singleton factory for global blackboard session access
_blackboards: Dict[str, HoverBlackboard] = {}

def get_blackboard(session_id: str = "default_session") -> HoverBlackboard:
    if session_id not in _blackboards:
        _blackboards[session_id] = HoverBlackboard(session_id=session_id)
    return _blackboards[session_id]
