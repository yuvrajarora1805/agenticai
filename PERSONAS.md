# 🎭 WareSync AI — System Personas & Role-Based Access Guide

This document outlines the **User Personas**, their **Role-Based Access Control (RBAC)** scopes, and how they interact with the multi-agent system, telemetry auditing, and security guardrails.

---

## 👥 Overview of System Personas

WareSync AI evaluates agent behaviors across **three operational personas** representing different enterprise actors:

| Persona Name | Internal Identifier | Domain Scope | Primary Framework / Agents | Associated Test Cases |
| :--- | :--- | :--- | :--- | :--- |
| **Logistics Operator** | `logistics_operator` | Warehouse floor operations, picking, dispatch, stock transfers | **CrewAI**: SupervisorAgent, DispatchAgent<br>**ADK**: InventoryAgent | `TC-01` to `TC-10`<br>`TC-29` to `TC-34` |
| **Financial Auditor** | `auditor` | 3-way invoice matching, price/quantity discrepancy detection, ledger approval | **Google ADK**: InvoiceAgent<br>**CrewAI**: ProcurementAgent | `TC-11` to `TC-28` |
| **Adversarial Red-Teamer** | `adversarial` | Penetration testing, prompt injections, jailbreaks, data exfiltration | **Security Guardrails** (pre-agent intercept) | `TC-35` to `TC-42` |

---

## 🔍 Detailed Persona Specifications

### 1. 📦 Logistics Operator (`logistics_operator`)
* **Role**: Warehouse Floor Manager & Logistics Coordinator.
* **Responsibilities**:
  * Checking real-time inventory balances and bin locations.
  * Triggering order fulfillment and reserve locks.
  * Generating packing slips and **Delivery Challans (DC)**.
  * Assigning carrier tracking numbers (`Apex Logistics`, `Regional Distribution Hub`).
* **Permissions**:
  * ✅ `db_check_inventory`
  * ✅ `db_reserve_inventory`
  * ✅ `generate_delivery_challan`
  * ❌ Cannot bypass financial discrepancy holds or override invoice approvals.

### 2. 📑 Financial Auditor (`auditor`)
* **Role**: Accounts Payable (AP) Compliance Officer & Inventory Controller.
* **Responsibilities**:
  * Executing **Three-Way Matching** (Purchase Order vs Goods Received Note vs Supplier Invoice).
  * Flagging price variances (e.g., $48.00 billed vs $45.00 contracted).
  * Detecting quantity discrepancies (overbilling).
  * Reviewing automated factory replenishment proposals.
* **Permissions**:
  * ✅ `parse_and_audit_invoice`
  * ✅ `calculate_procurement_quote`
  * ✅ `approve_for_payment`
  * ❌ Cannot directly dispatch physical stock without operational confirmation.

### 3. 🛡️ Adversarial Red-Teamer (`adversarial`)
* **Role**: Security Penetration Tester & Prompt Injection Evaluator.
* **Responsibilities**:
  * Testing system resilience against DAN (Do Anything Now) jailbreaks.
  * Attempting SQL injection (`'; DROP TABLE inventory;--`).
  * Attempting to coerce agents into leaking confidential pricing or bypassing approval gates.
* **Zero-Trust Policy**:
  * All prompts submitted under the `adversarial` persona (or containing malicious syntax) are evaluated by **`SecurityGuardrails`**.
  * Threats are blocked with **0 LLM token cost** and instant latency (~0.25 ms), preventing any database mutation.

---

## 📊 How Personas are Audited in Telemetry

Every workflow execution stamps the active persona across the monitoring stack:

### 1. Langfuse Distributed Tracing
*(From `src/server/workflow.py`)*
```python
tr = self.tracer.create_trace(
    name=f"Workflow_{req.scenario_type}",
    session_id="dashboard_session",
    user_id=req.persona,        # Attributed to 'logistics_operator', 'auditor', or 'adversarial'
    tags=["waresync", req.prompt_architecture, req.persona]
)
```

### 2. PDF Document Branding
Delivery Challans and Customer Invoices dynamically reflect the persona entity:
```python
InvoicePDFGenerator.generate_delivery_challan(
    dc_no=dc_id,
    order_id=order_id,
    customer_name=req.persona.replace("_", " ").title(),  # e.g., "Logistics Operator"
    ...
)
```

### 3. Hover Blackboard Trace Logs
Every step record in the Hover Blackboard logs `details={"persona": req.persona}`, providing an immutable audit trail for evaluators.

---

## 🧪 Testing Personas in the Interactive Simulator
In the **[42 Scenarios Simulator](https://agentic.yarora.dev/simulator.html)**:
1. Every scenario card includes a **Persona Dropdown** (`Operator`, `Auditor`, `Adversarial`).
2. You can switch any scenario's persona on the fly to observe how the agents and guardrails respond.
3. For example, change an adversarial prompt's persona to `Operator` — the **Zero-Trust Guardrail** will still catch and block the malicious prompt, proving that security is not bypassed by claiming a friendly persona.
