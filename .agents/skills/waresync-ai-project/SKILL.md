---
name: waresync-ai-project
description: Build and maintain WareSync, an agentic warehouse, procurement, invoice-processing, dispatch, and finance reconciliation system. Use when planning, implementing, testing, reviewing, or deploying this project.
---

# WareSync AI: Complete Warehouse, Procurement, Invoice and Dispatch Workflow

The system operates like a real warehouse business: stock is monitored continuously, low stock triggers replenishment, supplier purchase orders are tracked until delivery, incoming goods are verified against purchase orders and invoices, payments are reconciled, and customer orders are fulfilled and dispatched.

These are not separate AI demonstrations. They are connected workflows sharing one database, one Hover Blackboard, and a traceable transaction history.

The system is built around two connected business cycles:

## Cycle A — Procure and replenish
Stock monitoring → Reorder decision → Supplier PO → Supplier delivery → Goods receipt → Invoice matching → Stock update → Accounts payable reconciliation
*(Shared inventory, supplier, finance, and workflow records)*

## Cycle B — Customer fulfilment
Customer order → Stock availability → Reservation → Picking and packing → Dispatch → Customer invoice → Payment tracking

If Cycle B detects a shortage, it requests replenishment through Cycle A. Once goods are received and quality-checked, waiting customer orders resume automatically, subject to configured fulfilment and approval rules.

**Key Distinction:** Supplier invoices and customer invoices are fundamentally different documents:
- **Supplier Invoice**: Records money your business owes (Accounts Payable).
- **Customer Invoice**: Records money your customer owes (Accounts Receivable).
They must be processed separately, even though both connect to inventory and order records.

---

## Mandatory Review Requirements
The finished project must demonstrate all 11 requirements:

1. **Shared context/state**: Agents publish state updates and consume intermediate outputs from other agents. Use the required **Hover Blackboard** as the shared agent context/state mechanism; do not substitute a different blackboard.
2. **At least two external MCP tools**: Integrate at least two real external tools through MCP (PostgreSQL business tools, Document/OCR processing tools, ERP/Supplier API, email/carrier tracking). Mock tools may be used in tests, but never present mocks as live integrations.
3. **Structured outputs**: Use Pydantic v2 models for agent requests/results and business data boundaries. Return useful Markdown summaries and/or validated JSON; never rely on free-form model text for financial or inventory writes.
4. **Agentic patterns**: Select appropriate patterns and document trade-offs against alternatives (Supervisor/delegation, sequential pipeline, event-driven workflow, human approval gates, ReAct, evaluator-optimizer).
5. **Callbacks and logging**: Capture intermediate outputs, task start/end, tool execution, retries, exceptions, and final outcomes using callbacks or equivalent supported hooks.
6. **A2A interoperability**: Implement and test Agent-to-Agent (A2A) handoffs between an ADK agent and a CrewAI agent with explicit task/result schemas.
7. **Framework restriction**: Use **Google ADK** and **CrewAI** only. Do not introduce LangChain, LangGraph, AutoGen, Semantic Kernel, or other agentic frameworks.
8. **Guardrails**: Validate input/output types and business constraints; defend against prompt injection and malicious document content; check model output; compare prompt variants (ReAct vs. few-shot vs. persona instructions). Never expose hidden chain-of-thought; log concise decisions, evidence, and actions instead.
9. **Observability and provenance**: Implement trace IDs, workflow/task IDs, audit events, source-document references, tool-call records, timestamps, and actor/agent identity.
10. **End-to-end evaluation**: Test complete business flows and report success rate, exception rate, latency/runtime, token usage/cost where available, and outcomes across multiple runs and prompt variants.
11. **Cloud deployment**: Provide reproducible containerized deployment, documented cloud configuration, health checks, secrets handling, migrations, and rollback guidance.

---

## 1. End-to-End Business Process

### The 10 Workflow Steps
1. **01 Stock and order monitoring**: Read stock, reservations, open POs, and incoming deliveries.
2. **02 Replenishment decision**: Calculate reorder quantity and avoid duplicate orders.
3. **03 Supplier selection and PO**: Select a supplier, check price and lead time, create an authorized PO.
4. **04 Supplier fulfilment tracking**: Track acknowledgement, expected arrival, and shipment milestones.
5. **05 Goods receipt and inspection**: Scan received SKUs and quantities; record damaged or missing items in a Goods Receipt Note (GRN).
6. **06 Supplier invoice decoding**: Extract invoice number, supplier, lines, tax, totals, and references.
7. **07 Three-way matching**: Match purchase order, goods receipt, and supplier invoice.
8. **08 Stock and finance posting**: Update accepted stock and record the payable or discrepancy.
9. **09 Customer order fulfilment**: Reserve stock, pick, pack, and dispatch customer orders.
10. **10 Customer invoice and payment**: Generate the sales invoice, record receivables, and reconcile payment.

*Note: Stock arithmetic, invoice totals, tax calculations, reservation locks, payment posting, and accounting balances must be deterministic application logic. Agents coordinate work and handle exceptions—they do not replace the transaction engine.*

---

## 2. Step 1 — Monitor Warehouse Stock and Predict Shortages

### What the system monitors per SKU and warehouse location
- Physical on-hand quantity ($H$)
- Reserved quantity for confirmed customer orders ($R$)
- Available stock: $\text{Available stock} = \text{On-hand} - \text{Reserved} - \text{Quarantined}$
- Quantity on approved POs not yet received ($I$)
- Reorder point ($ROP$), safety stock ($SS$), and target stock level ($T$)
- Supplier lead time ($L$) and minimum order quantity ($MOQ$)
- Pending customer demand and outstanding backorders ($B$)
- Damaged, quarantined, or rejected stock ($Q$)

### Calculations
- **Inventory Position**:
  $$\text{Inventory position} = \text{On-hand} + \text{Open inbound} - \text{Reserved} - \text{Backorders}$$
  *(Open inbound represents expected quantities not yet received; avoid double counting).*
- **Demand-based Reorder Point**:
  $$\text{Reorder point} = \text{Average daily demand} \times \text{Lead time} + \text{Safety stock}$$

### Triggering Mechanisms
1. **Transaction-triggered**: After a sale, reservation, return, stock adjustment, or goods receipt, recalculate inventory position.
2. **Scheduled reconciliation**: Periodic cron/job to detect low stock, stale POs, and missed events.
3. **Demand-triggered**: Evaluate forecast demand, backorders, and incoming customer orders.

Durable event queues or DB-backed job mechanisms ensure temporary agent failures never drop replenishment requests.

---

## 3. Step 2 — Calculate Replenishment (How Much to Reorder)

### Replenishment Formula
$$Q = \max(0, T - H + R - I + B)$$
Adjusted by:
- Supplier pack size / minimum order multiples (round up to nearest pack multiple).
- Supplier Minimum Order Quantity ($MOQ$).
- Warehouse storage limits and budget constraints.

### Pre-Approval Checks by Procurement Agent
1. Open PO already covering the shortage?
2. Selected supplier quantity availability?
3. Alternative supplier offering better landed cost or delivery schedule?
4. Estimated arrival date meeting demand?
5. Budget or authorization threshold limits?
6. Active replenishment workflow deduplication?

Quantity calculation is deterministic; agent provides context, comparison, and workflow progression.

---

## 4. Step 3 — Automatically Create and Place Supplier Order

### Purchasing Policy & Approvals
- Orders $\le$ configured threshold: eligible for auto-approval.
- Orders $>$ threshold: requires human purchasing manager approval gate.
- New supplier or changed banking details: mandatory human verification.
- Supplier unavailable: trigger alternative-supplier evaluation.
- No external transmission until approval criteria are satisfied.

### Purchase Order Lifecycle
`DRAFT -> VALIDATED -> PENDING_APPROVAL -> APPROVED -> SENT -> ACKNOWLEDGED -> IN_TRANSIT -> PARTIALLY_RECEIVED -> RECEIVED -> CLOSED` (plus exception states: `CANCELLED`, `DISPUTED`).

### Order Placement Business Service & MCP Tool
Procurement Agent invokes MCP tool `create_purchase_order`, calling deterministic backend service to:
1. Validate PO payload with Pydantic.
2. Verify purchasing permissions.
3. Check idempotency keys to prevent duplicate supplier orders.
4. Persist PO and line items in PostgreSQL with transaction boundaries.
5. Record approval and audit history.
6. Submit order via supplier integration (API/EDI/Email).
7. Record external confirmation reference and change status from `SENT` to `ACKNOWLEDGED` once confirmed.

---

## 5. Step 4 — Track Supplier Order Until Goods Arrive

### Arrival Monitoring & Goods Receipt
- Poll/webhook supplier carrier milestones (`IN_TRANSIT`, `ARRIVAL_EXPECTED`).
- Missed ETA alerts procurement owner, calculates customer order impact, but does not auto-create duplicate POs.
- **Physical Receipt $\ne$ Invoiced Quantity**: Available inventory is only incremented via physical inspection and Goods Receipt Note (GRN).
- Upon physical arrival:
  - Scan PO and SKUs.
  - Record quantities: Ordered, Received, Accepted, Damaged/Quarantined, Outstanding.
  - Generate GRN. Damaged goods are isolated in quarantine.

---

## 6. Step 5 — Decode Supplier Invoice Automatically

### Hybrid Ingestion Pipeline
1. **Document Received**: Upload / email / API $\rightarrow$ assign document ID.
2. **File Validation**: MIME type, size, file signature, malware scan, SHA-256 hash check.
3. **Classification**: Invoice, Credit Note, Quotation, Delivery Challan.
4. **Text Extraction**: PDF text extraction for digital PDFs; PaddleOCR / layout-aware OCR for scans and tables.
5. **Field Extraction & Normalization**: Header fields, lines, prices, taxes, discounts, currency, and date formats.
6. **Validation**: Pydantic schema + deterministic arithmetic check ($Subtotal + Tax + Freight = Total$).
7. **Duplicate Check**: Supplier identity + invoice number + date + content hash.

### Structured Invoice Pydantic Schema
```python
from decimal import Decimal
from typing import Optional, List
from datetime import date
from pydantic import BaseModel, Field

class InvoiceLine(BaseModel):
    supplier_sku: Optional[str] = None
    internal_sku: Optional[str] = None
    description: str
    quantity: Decimal = Field(gt=0)
    unit_price: Decimal = Field(ge=0)
    tax_rate: Decimal = Field(ge=0)
    tax_amount: Decimal = Field(ge=0)
    discount: Decimal = Field(default=Decimal("0.00"), ge=0)
    line_total: Decimal = Field(ge=0)

class SupplierInvoice(BaseModel):
    supplier_id: str
    supplier_name: str
    supplier_tax_id: Optional[str] = None
    invoice_number: str
    invoice_date: date
    purchase_order_number: Optional[str] = None
    currency: str = "INR"
    subtotal: Decimal = Field(ge=0)
    tax_total: Decimal = Field(ge=0)
    freight: Decimal = Field(default=Decimal("0.00"), ge=0)
    invoice_total: Decimal = Field(ge=0)
    lines: List[InvoiceLine]
    extraction_confidence: float = Field(ge=0.0, le=1.0)
    requires_review: bool = False
    review_reasons: List[str] = []
```

---

## 7. Step 6 — Three-Way Matching

Matches three independent sources:
1. **Purchase Order (PO)**: Authorized quantity and price.
2. **Goods Receipt Note (GRN)**: Accepted physical quantity.
3. **Supplier Invoice**: Billed quantity and rate.

### Matching Rules & Discrepancy Handling
- **Quantity Check**: Invoiced quantity $\le$ Accepted GRN quantity.
- **Price Check**: Invoiced unit price matches PO within approved tolerance.
- **Arithmetic Check**: Line items sum to subtotal; taxes and freight compute correctly.
- **Match Decision**:
  - Full Match $\rightarrow$ Eligible for posting to Accounts Payable.
  - Discrepancy $\rightarrow$ Route to review queue with reason (price variance, quantity shortage, missing PO/GRN, duplicate). Never auto-pay or silently modify invoice numbers.

---

## 8. Step 7 — Inventory Posting & Financial Reconciliation

- **Physical Stock Ledger**: Increment sellable stock by *accepted* units only. Damaged goods go to quarantine ledger.
- **Accounts Payable (AP)**:
  - If 100 units billed @ ₹250, but 93 accepted, 3 damaged, 4 short:
    - Stock ledger: +93 sellable, +3 quarantined.
    - AP posting: Post accepted portion (₹23,250) or hold for supplier credit note/corrected invoice per finance policy.
    - Never silently alter the invoice total or fabricate GRN records.
- Invoices are immutable. Adjustments are handled via Debit Notes, Credit Notes, or Reversals.

---

## 9. Step 8 — Customer Order Fulfilment (Order-to-Cash)

### Order Lifecycle
`RECEIVED -> VALIDATED -> RESERVED/PARTIALLY_RESERVED -> PICKING -> PACKED -> DISPATCHED -> INVOICED -> PARTIALLY_PAID/PAID -> CLOSED`

### Shortage Handling (Connecting Cycle B to Cycle A)
- Order requests 15 units; 10 available:
  1. Transactionally reserve 10 units (pessimistic lock on inventory ledger).
  2. Create backorder for 5 units.
  3. Publish shortage event to Hover Blackboard.
  4. Cycle A evaluates replenishment; PO issued and tracked.
  5. When inbound goods arrive and pass GRN inspection, inventory service allocates 5 units to the waiting order.
  6. Order advances to Picking $\rightarrow$ Packing $\rightarrow$ Dispatch $\rightarrow$ Customer Invoicing.

---

## 10. Step 9 — Customer Invoice Generation

- Deterministically generated from approved dispatch/order records and tax rules (Decimal arithmetic, never float).
- Unique concurrency-safe invoice sequence (`INV-YYYY-XXXX`).
- Generates compliant PDF document, stores in object storage, computes checksum, and posts to Accounts Receivable (AR).

---

## 11. Step 10 — Payment Reconciliation & Outstanding Balances

- **AP (Supplier side)**: Reconcile outgoing bank payments/adjustments against accepted supplier invoices.
- **AR (Customer side)**: Match incoming customer payments (full or partial) against open customer invoices.
- **Approval Gate**: Agents never initiate bank disbursements directly. Payment execution requires explicit human approval and authorized finance service calls.

---

## 12. Agent Roles, Boundaries & Coordination

Five specialized agents with strict separation of concerns:

| Agent | Framework | Responsibilities | Cannot Do Independently |
| :--- | :--- | :--- | :--- |
| **Supervisor** | CrewAI | Coordinates end-to-end workflows, delegates tasks, manages exceptions, summarizes state. | Bypass business rules or approve payments. |
| **Inventory Custodian** | ADK | Queries inventory, calculates stock positions, proposes reservations/replenishments. | Mutate stock balances directly (service does all mutations). |
| **Procurement Agent** | CrewAI | Proposes replenishment quantities, selects suppliers, prepares POs, tracks shipment milestones. | Exceed approval limits or bypass duplicate PO checks. |
| **Invoice Processing** | ADK | Ingests documents, extracts invoice data via OCR, executes 3-way match, identifies discrepancies. | Approve payments or alter financial ledger records. |
| **Dispatch Agent** | CrewAI | Coordinates picking, packing, dispatch verification, and billing triggers. | Dispatch unallocated stock or fabricate tracking numbers. |

### Handoff Sequence
1. **Inventory Agent (ADK)**: Detects shortage $\rightarrow$ publishes event to Hover Blackboard.
2. **Supervisor (CrewAI)**: Consumes Blackboard event $\rightarrow$ delegates replenishment to Procurement via A2A.
3. **Procurement Agent (CrewAI)**: Evaluates suppliers, creates PO proposal $\rightarrow$ invokes MCP tool.
4. **Goods Receipt Service**: Receives physical goods $\rightarrow$ writes GRN and updates stock ledger.
5. **Invoice Agent (ADK)**: Decodes invoice $\rightarrow$ matches PO/GRN $\rightarrow$ publishes matching result to Blackboard.
6. **Dispatch Agent (CrewAI)**: Resumes backordered customer order $\rightarrow$ picks, packs, and dispatches $\rightarrow$ triggers customer invoice.

---

## 13. Shared State, Envelopes & Database Schema

### Typed Envelope Schema for All A2A / Blackboard Handoffs
```python
from datetime import datetime
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field

class AgentEnvelope(BaseModel):
    workflow_id: str
    task_id: str
    correlation_id: str
    sender: str
    recipient: str
    message_type: str
    schema_version: str = "1.0.0"
    created_at: datetime
    payload: Dict[str, Any]
    source_refs: list[str] = []
    status: str
    idempotency_key: Optional[str] = None
```

### Authoritative Database Tables (PostgreSQL)
- **Inventory & Catalog**: `products`, `inventory`, `inventory_ledger`, `stock_reservations`
- **Procurement & Receiving**: `suppliers`, `supplier_products`, `purchase_orders`, `purchase_order_items`, `shipments_inbound`, `goods_receipts`, `goods_receipt_items`
- **Invoices & Finance**: `supplier_invoices`, `supplier_invoice_items`, `invoice_discrepancies`, `accounts_payable`, `customer_invoices`, `accounts_receivable`, `payments`, `payment_allocations`, `credit_notes`
- **Customer Fulfilment**: `customer_orders`, `customer_order_items`, `dispatches`
- **Agent Coordination & Provenance**: `workflows`, `workflow_events`, `agent_tasks`, `tool_calls`, `audit_events`, `approvals`, `documents`

---

## 14. Exception Handling Matrix

| Situation | System Action | Human Gate |
| :--- | :--- | :--- |
| **Stock below threshold** | Calculate reorder proposal, check active POs to avoid duplicates. | Only if PO value exceeds auto-approval limit. |
| **Supplier delayed** | Alert procurement, update ETA, check customer order risk. | Yes, if delay requires alternative supplier. |
| **Short shipment / Damage** | Create partial GRN, quarantine damaged items, retain open PO quantity. | Physical inspection sign-off. |
| **Invoice extraction low confidence** | Bounded retry with layout OCR; route to review queue. | Yes, operator field verification. |
| **Price / Quantity mismatch** | Hold automatic AP posting; log discrepancy record. | Finance review / Credit note required. |
| **Prompt injection in invoice** | Strict regex/type validation; isolate untrusted text; reject system prompt overrides. | Log security audit event. |
| **A2A agent timeout** | Bounded exponential backoff retry; recover from persisted Blackboard state. | Alert if max retries exceeded. |

---

## 15. Implementation Milestones & Definition of Done

- **Milestone 1 — Warehouse Core**: Inventory ledger, reservations, PO lifecycle, GRN, customer orders with deterministic business services and unit tests.
- **Milestone 2 — Document & Finance Core**: PaddleOCR invoice extraction pipeline, 3-way matching engine, customer invoice PDF generator, payment ledger.
- **Milestone 3 — Agentic Coordination**: 5 agents (3 CrewAI, 2 ADK), Hover Blackboard shared state, MCP tool adapters, and A2A inter-agent protocol.
- **Milestone 4 — Automated Replenishment**: Low stock triggers proposal $\rightarrow$ approval $\rightarrow$ supplier PO $\rightarrow$ inbound tracking $\rightarrow$ GRN $\rightarrow$ stock update.
- **Milestone 5 — Automated Fulfilment**: Shortage requests replenishment $\rightarrow$ receipt resumes backorder $\rightarrow$ dispatch $\rightarrow$ billing.
- **Milestone 6 — Evaluation & Cloud Deployment**: E2E business flow evaluation, prompt variant comparisons (ReAct vs Few-shot vs Persona), cost/latency metrics, containerized deployment with health checks.

---

## 16. Work Protocol & Code Modularity Rules
1. **Strict File Size Limit**: No file must exceed 200 to 250 lines at maximum. If a module approaches ~200 lines, decompose it cleanly into cohesive submodules, controllers, routers, or utility files.
2. **Modular Architecture**: Separate routing/endpoints (`routes/`), business services (`services/`), database/schema models (`schemas/`), and UI logic (`components/` or separate JS files).
3. **Inspect First**: Inspect repository before modifying code to preserve working conventions.
4. **Deterministic Business Services**: Maintain business rules in deterministic services; agents propose, route, and explain.
5. **Pydantic v2 Everywhere**: Validate all inputs, outputs, blackboard state, and A2A messages with Pydantic v2 schemas.
6. **Idempotence & Safety**: Ensure idempotent operations, explicit state transitions, and append-only audit/ledger logs.
7. **Observability & Callbacks**: Log every step to the Hover Blackboard and Langfuse tracer with tokens, latency, and cost metadata.
8. **Documentation & Tests**: Provide tests, documentation, and migration steps with every code change.

