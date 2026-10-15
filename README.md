# WareSync AI: Autonomous Multi-Agent Operations System

WareSync AI is a standardized, enterprise-grade multi-agent warehouse operations and document intelligence platform built to satisfy all 11 core agentic requirements:
- **Hover Blackboard Architecture**: Shared state and memory machine for real-time state mutation and event propagation.
- **Framework Interoperability**: Built strictly using **CrewAI** and **ADK (Agent Development Kit)**.
- **A2A (Agent-to-Agent) Protocol**: Standardized message envelope for cross-framework communication.
- **MCP (Model Context Protocol) Server**: Integrated warehouse database operations, invoice OCR auditing, and quote calculation tools.
- **Structured Outputs via Pydantic**: Strict data models for all intermediate and final outputs.
- **Security Guardrails**: Prompt injection defense, input sanitization, and tool argument validation.
- **Task Monitoring & Callbacks**: Lifecycle callbacks logging execution flow and errors.
- **Prompt Variance Benchmarking**: 42 test scenarios evaluating ReAct vs. Few-Shot architectures and persona variations.
- **Interactive Command Dashboard**: Real-time operations console powered by FastAPI and WebSockets.

---

## Architecture Overview

```
                        [ User / Operational Trigger ]
                                      │
                                      ▼
                           [ Security Guardrails ]
                                      │
                                      ▼
                        [ Supervisor Agent (CrewAI) ]
                                      │
              ┌───────────────────────┴───────────────────────┐
              ▼                                               ▼
    [ Hover Blackboard ] ◄───────── [ A2A Bridge ] ─────────► [ MCP Server Tools ]
    • Inventory Cache                • ADK ↔ CrewAI            • DB Lookup/Reserve
    • Orders & Invoices              • Event Router            • Invoice Document OCR
    • Execution Traces                                         • Procurement Quotes
              │                                               │
              ├───────────────────────────────────────────────┤
              ▼                                               ▼
    [ ADK Agents ]                                  [ CrewAI Agents ]
    • Inventory Agent                               • Dispatch Agent
    • Invoice Agent                                 • Procurement Agent
```

---

## Quickstart

### 1. Installation

```bash
# Clone the repository
git clone https://github.com/yuvrajarora1805/agenticai.git
cd agenticai

# Install dependencies
pip install -r requirements.txt
```

### 2. Run Tests

```bash
pytest tests/
```

### 3. Run Standalone CLI Demo

```bash
PYTHONPATH=. python3 src/main_demo.py
```

### 4. Launch Interactive Web Dashboard

```bash
PYTHONPATH=. python3 -m uvicorn src.server.app:app --host 0.0.0.0 --port 8000
```

Open your browser at `http://localhost:8000`.

---

## 42 Test Scenarios & Benchmark Suite

The test suite covers:
1. **Order Fulfillment** (TC-01 to TC-08)
2. **Shortage & Procurement Cascade** (TC-09 to TC-18)
3. **Invoice Intelligence & Audit** (TC-19 to TC-28)
4. **Complex Logistics** (TC-29 to TC-34)
5. **Security & Prompt Injection Defense** (TC-35 to TC-42)

You can run individual test cases or execute the entire 42-scenario batch benchmark directly from the web dashboard.
