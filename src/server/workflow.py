"""Warehouse Workflow Execution Engine: Orchestrates ADK and CrewAI cycles."""

import time
from typing import Dict, Any
from pydantic import BaseModel

from src.blackboard.engine import HoverBlackboard
from src.a2a.bridge import A2ABridge
from src.mcp_server.tools import WarehouseMCPServer
from src.security.guardrails import SecurityGuardrails
from src.monitoring.tracing import LangfuseTracer
from src.agents.crewai.agents import get_crewai_suite
from src.agents.adk.agents import get_adk_suite
from src.schemas.models import (
    StockItem,
    SystemStatus,
    AgentFramework,
    DispatchFulfillmentReport,
    OrderStatus,
)
from src.server.microservices_registry import is_service_healthy


class WorkflowRequest(BaseModel):
    prompt: str
    scenario_type: str = "order_fulfillment"
    prompt_architecture: str = "react"
    persona: str = "logistics_operator"


class WorkflowEngine:
    """Executes warehouse workflows across ADK and CrewAI with full telemetry."""

    def __init__(self, blackboard: HoverBlackboard, a2a_bridge: A2ABridge, tracer: LangfuseTracer):
        self.blackboard = blackboard
        self.a2a = a2a_bridge
        self.tracer = tracer
        self.crewai = get_crewai_suite()
        self.adk = get_adk_suite()

    def execute(self, req: WorkflowRequest) -> Dict[str, Any]:
        start_time = time.time()

        # 1. Security Guardrails Verification (Requirement #8)
        is_safe, sanitized = SecurityGuardrails.validate_user_prompt(req.prompt)
        if not is_safe:
            self.blackboard.record_error(f"Security Alert: {sanitized}")
            return {
                "status": "blocked_by_guardrails",
                "reason": sanitized,
                "latency_ms": round((time.time() - start_time) * 1000, 2),
            }

        # Start Langfuse Trace (Requirement #9)
        tr = self.tracer.create_trace(
            name=f"Workflow_{req.scenario_type or 'fulfillment'}",
            session_id="dashboard_session",
            user_id=req.persona,
            metadata={"architecture": req.prompt_architecture, "prompt": sanitized},
            tags=["waresync", req.prompt_architecture, req.persona],
        )

        # 2. Update Blackboard Status
        self.blackboard.set_system_status(SystemStatus.PROCESSING, active_agent="SupervisorAgent")

        # 3. Supervisor Agent (CrewAI) step
        sup_tokens = 65 if req.prompt_architecture == "few_shot" else 145
        self.blackboard.log_trace(
            agent_name="SupervisorAgent",
            framework=AgentFramework.CREWAI,
            action="ORCHESTRATION_STARTED",
            details={"prompt": sanitized, "architecture": req.prompt_architecture, "persona": req.persona},
            tokens_used=sup_tokens,
            latency_ms=18.5,
        )
        self.tracer.log_span(trace_id=tr["id"], name="SupervisorAgent Orchestration", agent_name="SupervisorAgent", framework="CrewAI", input_data={"prompt": sanitized, "architecture": req.prompt_architecture}, output_data={"delegation_status": "DISPATCHING"}, tokens_used=sup_tokens, latency_ms=18.5, span_type="agent_step")

        result_data = {}

        # 4. Check whether it's an Invoice Audit flow or Fulfillment flow
        if req.scenario_type == "invoice_audit" or "invoice" in req.prompt.lower():
            result_data = self._handle_invoice_audit(tr["id"])
        else:
            result_data = self._handle_order_fulfillment(req, sanitized, tr["id"])

        self.blackboard.set_system_status(SystemStatus.COMPLETED)
        total_time_ms = round((time.time() - start_time) * 1000, 2)
        finished_trace = self.tracer.finish_trace(tr["id"])

        return {
            "status": "success",
            "latency_ms": total_time_ms,
            "prompt_architecture": req.prompt_architecture,
            "result": result_data,
            "trace_count": len(self.blackboard.state.execution_trace),
            "langfuse_trace": finished_trace,
        }

    def _handle_invoice_audit(self, trace_id: str) -> Dict[str, Any]:
        """ADK Invoice Agent + MCP Tool audit flow with Circuit-Breaker."""
        if not is_service_healthy("ms-adk-invoice"):
            self.blackboard.record_error("⚠️ CIRCUIT-BREAKER: Microservice [ms-adk-invoice] is DOWN! Three-way invoice audit failed over.")
            return {"status": "degraded_service_down", "error": "ms-adk-invoice is DOWN (Circuit Breaker active)"}
        self.blackboard.set_system_status(SystemStatus.PROCESSING, active_agent="InvoiceAgent")
        audit_res = self.adk.audit_supplier_invoice(
            invoice_number="INV-2026-991",
            po_id="PO-9001",
            supplier_id="SUPP-ALPHA",
            invoice_items=[{"sku": "SKU-1002", "quantity": 40, "unit_price": 48.0}],
            invoice_total=1920.0,
        )
        self.blackboard.record_invoice_audit(audit_res)
        self.blackboard.log_trace(
            agent_name="InvoiceAgent",
            framework=AgentFramework.ADK,
            action="MCP_INVOICE_AUDIT",
            details=audit_res.model_dump(),
            tokens_used=130,
            latency_ms=34.0,
        )
        self.tracer.log_span(
            trace_id=trace_id,
            name="ADK Invoice Audit & Three-Way Match",
            agent_name="InvoiceAgent",
            framework="ADK",
            input_data={"invoice_number": "INV-2026-991", "po_id": "PO-9001"},
            output_data=audit_res.model_dump(),
            tokens_used=130,
            latency_ms=34.0,
            span_type="mcp_tool",
        )
        return audit_res.model_dump()

    def _handle_order_fulfillment(self, req: WorkflowRequest, sanitized: str, trace_id: str) -> Dict[str, Any]:
        """ADK Inventory check + CrewAI Procurement + CrewAI Dispatch."""
        if not is_service_healthy("ms-adk-inventory"):
            self.blackboard.record_error("⚠️ CIRCUIT-BREAKER: Microservice [ms-adk-inventory] is DOWN! FastMCP tool unavailable, using cached state.")
        sku = "SKU-1002" if "sku-1002" in req.prompt.lower() else "SKU-1001"
        requested_qty = 15 if "15" in req.prompt else (10 if "10" in req.prompt else 5)

        self.blackboard.set_system_status(SystemStatus.PROCESSING, active_agent="InventoryAgent")
        check_result = self.adk.check_stock_availability(sku, requested_qty=requested_qty)
        self.blackboard.log_trace(
            agent_name="InventoryAgent",
            framework=AgentFramework.ADK,
            action="MCP_STOCK_CHECK",
            details=check_result.model_dump(),
            tokens_used=75,
            latency_ms=22.0,
        )
        self.tracer.log_span(
            trace_id=trace_id,
            name="ADK MCP Stock Verification",
            agent_name="InventoryAgent",
            framework="ADK",
            input_data={"sku": sku, "requested_qty": requested_qty},
            output_data=check_result.model_dump(),
            tokens_used=75,
            latency_ms=22.0,
            span_type="mcp_tool",
        )

        if check_result.requires_reorder:
            self.blackboard.set_system_status(SystemStatus.PROCESSING, active_agent="ProcurementAgent")
            a2a_msg = self.a2a.send_message(
                sender_agent="InventoryAgent",
                sender_framework=AgentFramework.ADK,
                receiver_agent="ProcurementAgent",
                receiver_framework=AgentFramework.CREWAI,
                intent="STOCK_DEFICIT_TRIGGER",
                payload={"sku": sku, "shortage": check_result.shortage_qty},
                correlation_id=f"order_{int(time.time())}",
            )
            self.tracer.log_span(
                trace_id=trace_id,
                name="A2A Handoff (ADK -> CrewAI)",
                agent_name="A2ABridge",
                framework="A2A Protocol",
                input_data={"sender": "InventoryAgent", "receiver": "ProcurementAgent"},
                output_data=a2a_msg.model_dump(),
                tokens_used=0,
                latency_ms=5.0,
                span_type="a2a_handoff",
            )

            po = self.crewai.create_replenishment_proposal(sku, shortage_qty=check_result.shortage_qty)
            self.blackboard.record_purchase_order(po)
            self.blackboard.log_trace(
                agent_name="ProcurementAgent",
                framework=AgentFramework.CREWAI,
                action="PO_GENERATED",
                details=po.model_dump(),
                tokens_used=125,
                latency_ms=31.0,
            )
            self.tracer.log_span(trace_id=trace_id, name="CrewAI Procurement PO Generation", agent_name="ProcurementAgent", framework="CrewAI", input_data={"sku": sku, "required_qty": check_result.shortage_qty + 10}, output_data=po.model_dump(), tokens_used=125, latency_ms=31.0, span_type="agent_step")

        self.blackboard.set_system_status(SystemStatus.PROCESSING, active_agent="DispatchAgent")
        dispatch_report = self.crewai.fulfill_and_dispatch(sku=sku, allocated_qty=check_result.allocated_qty, shortage_qty=check_result.shortage_qty, order_id=f"ORD-{int(time.time()) % 10000}")
        self.blackboard.log_trace(agent_name="DispatchAgent", framework=AgentFramework.CREWAI, action="DISPATCH_ORDER_FULFILLED", details=dispatch_report.model_dump(), tokens_used=95, latency_ms=25.0)
        self.tracer.log_span(trace_id=trace_id, name="CrewAI Dispatch Order Fulfilment", agent_name="DispatchAgent", framework="CrewAI", input_data={"order_id": dispatch_report.order_id}, output_data=dispatch_report.model_dump(), tokens_used=95, latency_ms=25.0, span_type="agent_step")
        fulfilled_qty = check_result.allocated_qty
        stock_it = self.blackboard.get_stock_item(sku)
        unit_price = stock_it.unit_price if stock_it else 45.0
        item_name = stock_it.name if stock_it else "Component"

        if stock_it and fulfilled_qty > 0:
            stock_it.available_qty = max(0, stock_it.available_qty - fulfilled_qty)
            stock_it.reserved_qty += fulfilled_qty
            self.blackboard.update_stock_item(stock_it)

        from src.server.pdf_generator import InvoicePDFGenerator
        dc_no, inv_no = f"DC-{dispatch_report.order_id}", f"INV-{dispatch_report.order_id}"
        InvoicePDFGenerator.generate_delivery_challan(dc_no, dispatch_report.order_id, req.persona.replace("_", " ").title(), "Apex Logistics", dispatch_report.tracking_number or f"TRK-{dispatch_report.order_id}", [{"sku": sku, "name": item_name, "quantity": fulfilled_qty, "unit_price": unit_price}])
        InvoicePDFGenerator.generate_customer_invoice(inv_no, dispatch_report.order_id, req.persona.replace("_", " ").title(), [{"sku": sku, "name": item_name, "quantity": fulfilled_qty, "unit_price": unit_price}])

        self.blackboard.record_customer_order(dispatch_report.order_id, {
            "order_id": dispatch_report.order_id,
            "customer": req.persona.replace("_", " ").title(),
            "sku": sku,
            "quantity": fulfilled_qty,
            "status": str(dispatch_report.status.value if hasattr(dispatch_report.status, 'value') else dispatch_report.status),
            "challan_number": dc_no,
            "invoice_number": inv_no,
            "tracking_number": dispatch_report.tracking_number or f"TRK-{dispatch_report.order_id}",
            "total_amount": round(fulfilled_qty * unit_price * 1.18, 2),
        })
        return dispatch_report.model_dump()
