"""
WareSync AI - Main Orchestration and Demonstration Flow.
Executes an end-to-end multi-agent scenario coordinating:
- Guardrails Input Check (Req #8)
- Central Hover Blackboard (Req #1)
- MCP Tools (Req #2)
- Structured Outputs via Pydantic (Req #3)
- CrewAI + ADK Interoperability via A2A Protocol (Req #6, #7)
- Task Monitoring and Tracing Callbacks (Req #5, #9)
"""

import time
from typing import Dict, Any
from src.blackboard.engine import HoverBlackboard
from src.a2a.bridge import A2ABridge
from src.mcp_server.tools import WarehouseMCPServer
from src.security.guardrails import SecurityGuardrails
from src.schemas.models import (
    StockItem,
    SystemStatus,
    AgentFramework,
    DispatchFulfillmentReport,
    OrderStatus,
)


def run_warehouse_flow(user_request: str):
    print("=" * 70)
    print(" WareSync AI: Autonomous Multi-Agent Warehouse Operations Engine")
    print("=" * 70)

    # 1. Security Guardrails Verification (Req #8)
    print(f"\n[1] Guardrails Verification...")
    is_safe, sanitized_prompt = SecurityGuardrails.validate_user_prompt(user_request)
    if not is_safe:
        print(f"❌ {sanitized_prompt}")
        return
    print(f"✅ Prompt verified and sanitized: '{sanitized_prompt}'")

    # 2. Initialize Central Hover Blackboard (Req #1)
    blackboard = HoverBlackboard(session_id="session_live_demo")
    a2a_bridge = A2ABridge(blackboard=blackboard)

    # Seed baseline inventory
    blackboard.update_stock_item(
        StockItem(
            sku="SKU-1002",
            name="Hydraulic Forklift Valve",
            available_qty=8,
            reserved_qty=4,
            safety_stock=10,
            unit_price=45.0,
            reorder_point=10,
        )
    )

    blackboard.set_system_status(SystemStatus.PROCESSING, active_agent="SupervisorAgent")
    start_time = time.time()

    # 3. Supervisor Agent (CrewAI) receives order dispatch request
    print("\n[2] Supervisor Agent (CrewAI): Initiating order dispatch workflow...")
    blackboard.log_trace(
        agent_name="SupervisorAgent",
        framework=AgentFramework.CREWAI,
        action="DISPATCH_WORKFLOW_INITIATED",
        details={"requested_sku": "SKU-1002", "order_qty": 10},
    )

    # 4. A2A Call to Inventory Agent (ADK) to check stock via MCP
    print("\n[3] A2A Protocol Delegation -> Inventory Agent (ADK)...")
    check_result = WarehouseMCPServer.db_check_inventory("SKU-1002", requested_qty=10)
    
    blackboard.log_trace(
        agent_name="InventoryAgent",
        framework=AgentFramework.ADK,
        action="MCP_STOCK_CHECK",
        details=check_result.model_dump(),
        tokens_used=85,
        latency_ms=28.4,
    )
    print(f"   Inventory Agent (ADK) Check: Available={check_result.allocated_qty}, Shortage={check_result.shortage_qty}")

    # 5. Shortage Detected -> A2A Event to Procurement Agent (CrewAI)
    if check_result.requires_reorder:
        print("\n[4] Shortage Trigger: A2A Bridge -> Procurement Agent (CrewAI)...")
        a2a_bridge.send_message(
            sender_agent="InventoryAgent",
            sender_framework=AgentFramework.ADK,
            receiver_agent="ProcurementAgent",
            receiver_framework=AgentFramework.CREWAI,
            intent="STOCK_DEFICIT_TRIGGER",
            payload={"sku": "SKU-1002", "shortage": check_result.shortage_qty},
            correlation_id="order_demo_101",
        )

        # Procurement agent computes reorder quote via MCP
        reorder_po = WarehouseMCPServer.calculate_procurement_quote(
            sku="SKU-1002",
            required_qty=check_result.shortage_qty + 15  # safety buffer
        )
        blackboard.record_purchase_order(reorder_po)
        blackboard.log_trace(
            agent_name="ProcurementAgent",
            framework=AgentFramework.CREWAI,
            action="PURCHASE_ORDER_GENERATED",
            details=reorder_po.model_dump(),
            tokens_used=140,
            latency_ms=42.1,
        )
        print(f"   Procurement Agent (CrewAI): Generated PO '{reorder_po.po_id}' for {reorder_po.quantity} units (Total: ${reorder_po.total_cost})")

    # 6. Dispatch Agent (CrewAI) processes partial or complete dispatch
    print("\n[5] Dispatch Agent (CrewAI): Processing fulfillment output...")
    dispatch_report = DispatchFulfillmentReport(
        order_id="ORD-7721",
        customer_id="CUST-GLOBAL-LOGISTICS",
        items_fulfilled=[{"SKU-1002": check_result.allocated_qty}],
        status=OrderStatus.PARTIAL if check_result.shortage_qty > 0 else OrderStatus.DISPATCHED,
        tracking_number="TRK-98214-X",
        notes=f"Allocated {check_result.allocated_qty} units; Backordered {check_result.shortage_qty} units.",
    )

    blackboard.log_trace(
        agent_name="DispatchAgent",
        framework=AgentFramework.CREWAI,
        action="DISPATCH_FULFILLMENT_COMPLETE",
        details=dispatch_report.model_dump(),
        tokens_used=110,
        latency_ms=35.0,
    )
    blackboard.set_system_status(SystemStatus.COMPLETED)
    total_latency = (time.time() - start_time) * 1000

    # 7. Final Output Presentation (Req #3 - Pydantic Structured Output)
    print("\n" + "=" * 70)
    print(" FINAL SYSTEM EXECUTION SUMMARY (Hover Blackboard State)")
    print("=" * 70)
    state = blackboard.get_full_state()
    print(f"• System Status      : {state.status.value}")
    print(f"• Total Latency      : {total_latency:.2f} ms")
    print(f"• Total Trace Events : {len(state.execution_trace)}")
    print(f"• A2A Messages Exchanged: {len(state.pending_events)}")
    print("\n[Structured Dispatch Report - Pydantic JSON]:")
    print(dispatch_report.model_dump_json(indent=2))


if __name__ == "__main__":
    run_warehouse_flow("Process dispatch order for 10 units of SKU-1002 to Global Logistics")
