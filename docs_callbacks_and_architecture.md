# WareSync AI: Callback Functions & Architecture Reference Guide

This document provides a technical reference for the **Callback Mechanisms** and **System Architecture Patterns** implemented in WareSync AI.

---

## 1. Callback Functions & Mechanisms Table

| Callback Function / Mechanism | Where Defined | Role in the System |
| :--- | :--- | :--- |
| **`blackboard_change_listener`** | [`src/server/app.py:L68`](file:///media/yuvraj/New%20Volume/xamp/htdocs/agentiai/src/server/app.py#L68) | Subscribed to the central blackboard; broadcasts every state mutation over WebSocket (`/ws/stream`) to connected browser dashboards in real-time. |
| **`_notify(event_type, data)`** | [`src/blackboard/engine.py:L37`](file:///media/yuvraj/New%20Volume/xamp/htdocs/agentiai/src/blackboard/engine.py#L37) | Invokes all registered subscriber callbacks whenever an agent writes to inventory, updates status, generates POs, or logs a trace entry. |
| **`register_agent_handler`** | [`src/a2a/bridge.py:L22`](file:///media/yuvraj/New%20Volume/xamp/htdocs/agentiai/src/a2a/bridge.py#L22) | Registers agent-specific receiver callbacks to consume incoming A2A (Agent-to-Agent) messages across Google ADK and CrewAI runtimes. |
| **`callback_handler` (Langfuse)** | [`src/monitoring/tracing.py:L24`](file:///media/yuvraj/New%20Volume/xamp/htdocs/agentiai/src/monitoring/tracing.py#L24) | Intercepts agent step events, tool invocations, and LLM reasoning steps to calculate latencies, token consumption, and cost telemetry. |

---

## 2. In-Depth Callback Implementations

### A. Real-Time WebSocket Streaming Callback (`blackboard_change_listener`)
* **File:** `src/server/app.py`
* **Purpose:** Ensures the frontend Admin Cockpit and Visual Flow stay synchronized with backend memory without HTTP polling.
```python
def blackboard_change_listener(event_type: str, data: Any):
    manager.threadsafe_broadcast({
        "type": "state_update",
        "event_type": event_type,
        "full_state": blackboard.get_full_state().model_dump()
    })

# Registering callback with blackboard singleton
blackboard.subscribe(blackboard_change_listener)
```

---

### B. Observer Notification Callback Engine (`_notify`)
* **File:** `src/blackboard/engine.py`
* **Purpose:** Core pub/sub mechanism of the shared-memory Blackboard. Whenever an agent changes state, all registered callbacks execute safely inside an `RLock`.
```python
def subscribe(self, callback: Callable[[str, Any], None]) -> None:
    """Register a callback for state changes."""
    self._subscribers.append(callback)

def _notify(self, event_type: str, data: Any) -> None:
    for sub in self._subscribers:
        try:
            sub(event_type, data)
        except Exception as e:
            self.record_error(f"Subscriber error on event {event_type}: {e}")
```

---

### C. Cross-Framework A2A Callback Router (`register_agent_handler`)
* **File:** `src/a2a/bridge.py`
* **Purpose:** Routes structured inter-agent messages between Google ADK and CrewAI. When a message is sent, the bridge dynamically executes the receiver's callback hook.
```python
def register_agent_handler(self, agent_name: str, handler: Callable[[A2AMessage], Any]) -> None:
    """Register an agent's receiver hook."""
    self._handlers[agent_name] = handler

def send_message(self, ..., receiver_agent: str, ...):
    # Log transaction on the Blackboard
    self.blackboard.post_a2a_event(msg)
    
    # Dispatch callback to registered agent handler
    if receiver_agent in self._handlers:
        self._handlers[receiver_agent](msg)
```

---

### D. Observability & Tracing Callback (`LangfuseTracer`)
* **File:** `src/monitoring/tracing.py`
* **Purpose:** Tracks agent thoughts, tool executions, and step-by-step latencies. Both `CrewAIOperationsSuite` and `ADKOperationsSuite` accept this callback handler.
```python
class LangfuseTracer:
    def log_span(self, trace_id, name, agent_name, framework, input_data, output_data, tokens_used, latency_ms):
        ...
    def finish_trace(self, trace_id):
        ...
```

---

## 3. Which Architecture Type is Getting Used?

WareSync AI uses a **Hybrid: Hierarchical Supervisor Multi-Agent Architecture backed by an Event-Driven Hover Blackboard (Hub-and-Spoke)**.

```mermaid
graph TD
    User([Customer / Operator Prompt]) --> Supervisor[SupervisorAgent (CrewAI)<br><b>Hierarchical Manager</b>]

    subgraph CentralStateEngine ["Hover Blackboard Shared State Engine (Hub-and-Spoke)"]
        BB[(Thread-Safe Shared State:<br>Inventory Cache, Active Orders, POs, Telemetry)]
    end

    Supervisor -->|1. Hierarchical Task Delegation| InvAgent[InventoryAgent (Google ADK)]
    InvAgent <-->|MCP Database Lookup| BB

    InvAgent -.->|2. Event-Driven Trigger (STOCK_DEFICIT_TRIGGER)| ProcAgent[ProcurementAgent (CrewAI)]
    ProcAgent <-->|Commits PO-BULK & Supplier Invoice| BB

    InvAgent -->|3. State Handoff| DispAgent[DispatchAgent (CrewAI)]
    DispAgent <-->|Fulfills & Allocates Stock| BB
    DispAgent --> Docs[Generates Delivery Challan & Customer Invoice]

    BB -- 4. WebSocket Change Listener Callback --> UI[Realtime Admin Cockpit & Visual Flow]
```

### Breakdown of Architectural Layers:

1. **Hierarchical (Supervisor Pattern) — Top Level:**
   * **`SupervisorAgent` (CrewAI)** acts as the orchestrator.
   * Analyzes high-level requests and delegates subtasks to specialized subordinate agents (`InventoryAgent`, `ProcurementAgent`, `DispatchAgent`) based on domain responsibilities.
   * Prevents uncoordinated, chaotic agent loops.

2. **Blackboard Architecture (Hub-and-Spoke) — State Layer:**
   * **`HoverBlackboard`** serves as the central shared truth.
   * Agents across disparate frameworks (Google ADK vs CrewAI) do not tightly couple their memory. Instead, they read inputs from and write intermediate artifacts directly to the Blackboard.

3. **Event-Driven / Reactive — Inter-Agent Protocol (A2A):**
   * Workflow execution is reactive: Downstream agents only engage when specific state thresholds are triggered.
   * Example: If inventory is fully available, the `ProcurementAgent` is bypassed entirely. If a deficit occurs, an A2A event (`STOCK_DEFICIT_TRIGGER`) reactively fires the procurement restocking cycle.

4. **Sequential Processing — Sub-Task Pipelines:**
   * Inside each stage, execution follows an ordered sequence:
     `Guardrail Check` &rarr; `FastMCP DB Verification` &rarr; `A2A Deficit Hand-off` &rarr; `PO Calculation` &rarr; `Dispatch Manifest & Billing`.
