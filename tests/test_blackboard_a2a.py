"""
Unit tests for Blackboard Engine and A2A Protocol Bridge.
"""

from src.blackboard.engine import HoverBlackboard
from src.a2a.bridge import A2ABridge
from src.schemas.models import StockItem, SystemStatus, AgentFramework


def test_blackboard_state_and_trace():
    bb = HoverBlackboard(session_id="test_session_1")
    assert bb.state.status == SystemStatus.IDLE

    # Update Stock
    item = StockItem(
        sku="SKU-TEST-01",
        name="Industrial Motor",
        available_qty=50,
        reserved_qty=10,
        safety_stock=15,
        unit_price=120.0,
        reorder_point=25,
    )
    bb.update_stock_item(item)
    fetched = bb.get_stock_item("SKU-TEST-01")
    assert fetched is not None
    assert fetched.available_qty == 50

    # Log Trace
    bb.log_trace(
        agent_name="InventoryAgent",
        framework=AgentFramework.ADK,
        action="STOCK_CHECK",
        details={"sku": "SKU-TEST-01"},
        tokens_used=120,
        latency_ms=45.2,
    )
    state = bb.get_full_state()
    assert len(state.execution_trace) == 1
    assert state.execution_trace[0].agent_name == "InventoryAgent"


def test_a2a_bridge_interoperability():
    bb = HoverBlackboard(session_id="test_session_2")
    bridge = A2ABridge(blackboard=bb)

    received_messages = []

    def mock_procurement_receiver(msg):
        received_messages.append(msg)

    # Register CrewAI Procurement agent
    bridge.register_agent_handler("ProcurementAgent", mock_procurement_receiver)

    # ADK Inventory agent sends message to CrewAI Procurement agent
    bridge.send_message(
        sender_agent="InventoryAgent",
        sender_framework=AgentFramework.ADK,
        receiver_agent="ProcurementAgent",
        receiver_framework=AgentFramework.CREWAI,
        intent="LOW_STOCK_ALERT",
        payload={"sku": "SKU-TEST-01", "shortage": 10},
        correlation_id="order_123",
    )

    assert len(received_messages) == 1
    assert received_messages[0].intent == "LOW_STOCK_ALERT"
    assert received_messages[0].sender_framework == AgentFramework.ADK
    assert received_messages[0].receiver_framework == AgentFramework.CREWAI

    # Verify Blackboard recorded event
    state = bb.get_full_state()
    assert len(state.pending_events) == 1
    assert state.pending_events[0].receiver_agent == "ProcurementAgent"
