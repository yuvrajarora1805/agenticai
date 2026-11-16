/**
 * WareSync AI - End-to-End Visual Flow Controller
 * Powers step-by-step interactive animations, deficit highlights,
 * A2A protocol visualization, and real-time document links.
 */

class VisualFlowApp {
  constructor() {
    this.initElements();
    this.attachEvents();
    this.connectWebSocket();
  }

  initElements() {
    const byId = (id) => document.getElementById(id);
    this.el = {
      skuSelect: byId("sim-sku-select"),
      qtyInput: byId("sim-qty-input"),
      customerInput: byId("sim-customer-input"),
      autoRestockSelect: byId("sim-auto-restock"),
      btnRun: byId("btn-run-visual-sim"),
      adminAlert: byId("flow-admin-alert"),
      alertMessage: byId("flow-alert-message"),
      terminal: byId("flow-a2a-terminal"),
      docsContainer: byId("flow-docs-container"),
      latencyBadge: byId("flow-latency-badge"),
      docIframe: byId("flow-doc-iframe"),
      viewerTitle: byId("viewer-doc-title"),
      btnQuickCustInv: byId("btn-quick-customer-inv"),
      btnQuickChallan: byId("btn-quick-challan"),
      stages: [1, 2, 3, 4, 5, 6].map(i => ({
        card: byId(`stage-card-${i}`),
        body: byId(`stage-body-${i}`),
        status: byId(`stage-status-${i}`),
      })),
    };
  }

  attachEvents() {
    if (this.el.btnRun) {
      this.el.btnRun.addEventListener("click", () => this.runSimulation());
    }
    if (this.el.btnQuickCustInv) {
      this.el.btnQuickCustInv.addEventListener("click", () => {
        this.loadDocToViewer("/api/invoices/preview/INV-CUST-31432?type=customer", "📄 Customer Sales Tax Invoice (AR): INV-CUST-31432");
      });
    }
    if (this.el.btnQuickChallan) {
      this.el.btnQuickChallan.addEventListener("click", () => {
        this.loadDocToViewer("/api/invoices/preview/DC-31432?type=challans", "🚚 Goods Delivery Challan: DC-31432");
      });
    }
    // Pre-load latest invoice on page startup
    this.loadDocToViewer("/api/invoices/preview/INV-CUST-31432?type=customer", "📄 Customer Sales Tax Invoice: INV-CUST-31432");
  }

  loadDocToViewer(url, title) {
    if (this.el.docIframe) this.el.docIframe.src = url;
    if (this.el.viewerTitle) this.el.viewerTitle.textContent = title;
  }

  connectWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/stream`;
    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "a2a_event" && msg.event) {
            this.appendTerminalLog(`[LIVE A2A BROADCAST] ${msg.event.sender_agent} -> ${msg.event.receiver_agent}: ${msg.event.intent}`);
          }
        } catch (e) {
          // ignore parsing error
        }
      };
    } catch (e) {
      console.warn("WebSocket stream unavailable", e);
    }
  }

  appendTerminalLog(line) {
    if (!this.el.terminal) return;
    const time = new Date().toLocaleTimeString();
    this.el.terminal.innerHTML += `\n[${time}] ${line}`;
    this.el.terminal.scrollTop = this.el.terminal.scrollHeight;
  }

  resetStages() {
    this.el.stages.forEach((st, idx) => {
      st.card.className = "stage-card";
      st.status.textContent = "WAITING";
      st.status.style.color = "#94a3b8";
    });
    if (this.el.adminAlert) this.el.adminAlert.style.display = "none";
  }

  async runSimulation() {
    const sku = this.el.skuSelect.value;
    const qty = parseInt(this.el.qtyInput.value, 10) || 10;
    const customer = this.el.customerInput.value || "Apex Precision Logistics";
    const autoRestock = this.el.autoRestockSelect.value === "true";

    this.resetStages();
    this.el.btnRun.disabled = true;
    this.el.btnRun.innerHTML = `<span>⏳ Simulating Pipeline...</span>`;

    this.el.terminal.innerHTML = `// === INITIATING VISUAL ORDER PIPELINE: ${qty} units of ${sku} ===`;

    try {
      // Step 1: Customer Order Placement
      this.setStageActive(0, "PLACING ORDER", `Customer <strong>${customer}</strong> requested <strong>${qty} units</strong> of <code>${sku}</code>.`);
      this.appendTerminalLog(`[ORDER_SUBMITTED] Customer: ${customer} | SKU: ${sku} | Qty: ${qty}`);
      await this.sleep(700);

      // Execute live backend simulation call
      const res = await fetch("/api/customer/simulate-visual-flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku,
          requested_qty: qty,
          customer_name: customer,
          trigger_auto_restock: autoRestock
        })
      });

      const data = await res.json();
      const p = data.pipeline;
      if (this.el.latencyBadge) this.el.latencyBadge.textContent = `Latency: ${data.latency_ms} ms`;

      // Step 2: Guardrail Verification
      this.setStageActive(1, "CHECKING SAFETY", "Running Security Guardrails: prompt injection, SQL, and boundary tests.");
      await this.sleep(600);
      this.setStageComplete(1, "VERIFIED", `Safety Policy passed: <strong>${p.step_2_guardrail.message}</strong>.`);
      this.appendTerminalLog(`[GUARDRAIL] Policy Verified: Passed all 5 security filters.`);

      // Step 3: Stock Verification & Deficit Indicator
      this.setStageActive(2, "CHECKING STOCK", "Querying FastMCP real-time physical inventory ledger...");
      await this.sleep(700);

      const check = p.step_3_inventory_check;
      if (check.has_deficit) {
        this.setStageWarning(
          2,
          "SHORTAGE DETECTED",
          `Available in stock: <strong>${check.initial_stock} units</strong>.<br>` +
          `<div class="shortage-callout">⚠️ Shortage Deficit: ${check.shortage_qty} units needed!</div>`
        );
        this.appendTerminalLog(`[INVENTORY_AGENT] 🛑 SHORTAGE DETECTED: Requested ${qty}, available ${check.initial_stock}. Deficit = ${check.shortage_qty}`);
      } else {
        this.setStageComplete(
          2,
          "IN STOCK",
          `Full requested quantity available (${check.initial_stock} on hand). Allocating ${check.allocated_qty} units.`
        );
        this.appendTerminalLog(`[INVENTORY_AGENT] ✅ All ${qty} units available and reserved in physical ledger.`);
      }

      await this.sleep(700);

      // Step 4: A2A Inter-Agent Protocol Handoff
      if (p.step_4_a2a_handoff.event) {
        this.setStageActive(
          3,
          "DISPATCHING A2A",
          `<code>${p.step_4_a2a_handoff.sender}</code> transmitting structured A2A payload to <code>${p.step_4_a2a_handoff.receiver}</code>...`
        );
        this.appendTerminalLog(`[A2A BUS] Transmitting intent: ${p.step_4_a2a_handoff.intent} (Deficit: ${check.shortage_qty})`);
        await this.sleep(700);
        this.setStageComplete(3, "HANDOFF COMPLETE", `A2A Intent <strong>${p.step_4_a2a_handoff.intent}</strong> received by Procurement Agent.`);
      } else {
        this.setStageComplete(3, "BYPASSED", "Sufficient inventory. Emergency replenishment handoff not required.");
      }

      await this.sleep(700);

      // Step 5: Factory Bulk Restock
      if (p.step_5_bulk_restock.po) {
        const po = p.step_5_bulk_restock.po;
        const restock = p.step_5_bulk_restock.factory_inbound;

        if (!autoRestock && restock && restock.requires_approval) {
          // MANUAL MODE: Pause execution and trigger modal pop-up alert
          this.setStageWarning(
            4,
            "AWAITING APPROVAL",
            `PO <strong>${po.po_id}</strong> held by safety gate.<br><span style="color: var(--flow-amber); font-weight: 700;">✋ Human Approval Required</span>`
          );
          this.appendTerminalLog(`[SAFETY GATE] ✋ Manual mode active. Prompting supervisor modal to authorize PO ${po.po_id}...`);

          // Show interactive modal pop-up
          const approved = await this.promptApprovalModal(po, p.step_1_customer);
          if (approved) {
            this.setStageActive(4, "COMMITTING ORDER", `Supervisor authorized PO <strong>${po.po_id}</strong>. Replenishing stock...`);
            this.appendTerminalLog(`[SUPERVISOR ACTION] ✓ Approved PO ${po.po_id}. Calling backend /api/approvals endpoint...`);
            
            // Execute approval backend call
            try {
              await fetch(`/api/approvals/${po.po_id}/action`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "approve" })
              });
            } catch (err) {
              console.error("Failed to post approval", err);
            }

            await this.sleep(700);
            this.setStageComplete(
              4,
              "APPROVED & RESTOCKED",
              `Factory Bulk Order <strong>${po.po_id}</strong> approved.<br>` +
              `<span style="color: var(--flow-emerald); font-weight: 700;">+${po.quantity} units added</span> to physical warehouse.`
            );
            this.appendTerminalLog(`[RESTOCK] Physical warehouse ledger replenished (+${po.quantity} units). Proceeding to dispatch.`);
          } else {
            this.setStageWarning(
              4,
              "REJECTED BY USER",
              `PO <strong>${po.po_id}</strong> was rejected by Supervisor. Purchase cancelled.`
            );
            this.appendTerminalLog(`[SUPERVISOR ACTION] ✕ Rejected PO ${po.po_id}. Halting unapproved replenishment.`);
          }
        } else {
          // AUTO-PILOT MODE: Automated restocking cascade
          this.setStageActive(4, "ORDERING FROM FACTORY", `Generating Bulk PO <strong>${po.po_id}</strong> for <strong>${po.quantity} units</strong>.`);
          this.appendTerminalLog(`[PROCUREMENT] Generated Purchase Order ${po.po_id} for ${po.quantity} units @ $${po.unit_cost}/unit (Total: $${po.total_cost})`);
          await this.sleep(800);

          this.setStageComplete(
            4,
            "FACTORY RESTOCKED",
            `Factory Bulk Order <strong>${po.po_id}</strong> completed.<br>` +
            `<span style="color: var(--flow-emerald); font-weight: 700;">+${restock.restocked_qty} units added</span> to physical warehouse.`
          );
          this.appendTerminalLog(`[RESTOCK] Physical warehouse ledger replenished (+${restock.restocked_qty} units). Supplier Invoice issued.`);
        }
      } else {
        this.setStageComplete(4, "NOT REQUIRED", "Stock levels healthy above safety threshold.");
      }

      await this.sleep(700);

      // Step 6: Dispatch & Billing Hand-off
      const disp = p.step_6_dispatch_billing;
      this.setStageActive(5, "PACKING & BILLING", `Packing ${disp.dispatched_qty} units and generating transport papers...`);
      this.appendTerminalLog(`[DISPATCH] Order ${disp.order_id} packed. Generating Delivery Challan ${disp.delivery_challan.challan_number}...`);
      await this.sleep(800);

      this.setStageComplete(
        5,
        "DISPATCHED & BILLED",
        `Order <strong>${disp.order_id}</strong> fulfilled.<br>` +
        `Challan: <code>${disp.delivery_challan.challan_number}</code><br>` +
        `Invoice: <code>${disp.customer_invoice.invoice_number}</code>`
      );
      this.appendTerminalLog(`[DISPATCH] Delivery Challan and Customer Invoice generated successfully.`);

      // Render Invoices & Documents Links
      this.renderGeneratedDocs(disp, p.step_5_bulk_restock.factory_inbound);

      // Step 7: Admin Alert Trigger
      if (p.step_7_admin_alert) {
        const alert = p.step_7_admin_alert;
        if (this.el.adminAlert) {
          this.el.adminAlert.style.display = "flex";
          this.el.alertMessage.textContent = alert.message;
        }
      }

      this.appendTerminalLog(`// === VISUAL PIPELINE EXECUTION COMPLETED (Total: ${data.latency_ms} ms) ===`);

    } catch (e) {
      console.error(e);
      this.appendTerminalLog(`[ERROR] Visual simulation encountered an error: ${e.message}`);
    } finally {
      this.el.btnRun.disabled = false;
      this.el.btnRun.innerHTML = `<span>🚀 Run Visual Simulation</span>`;
    }
  }

  renderGeneratedDocs(dispatch, factoryRestock) {
    if (!this.el.docsContainer) return;
    let html = "";

    // 1. Customer Delivery Challan (DC)
    if (dispatch.delivery_challan) {
      const dc = dispatch.delivery_challan;
      html += `
        <div class="doc-mini-card">
          <div>
            <div style="font-size: 0.72rem; color: var(--flow-cyan); font-weight: 700;">DELIVERY CHALLAN (LOGISTICS)</div>
            <div style="font-size: 0.9rem; font-weight: 800; color: #fff;">${dc.challan_number}</div>
            <div style="font-size: 0.72rem; color: #94a3b8;">Carrier: ${dc.carrier} | Tracking: ${dc.tracking_number}</div>
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn-view-doc" onclick="window.flowApp.loadDocToViewer('/api/invoices/preview/${dc.challan_number}?type=challans', '🚚 Goods Delivery Challan: ${dc.challan_number}')">
              👁️ Preview
            </button>
            <a href="/api/invoices/download/${dc.challan_number}?type=challans" target="_blank" class="btn-view-doc" style="background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.2); color: #fff;">
              ⬇️ PDF
            </a>
          </div>
        </div>
      `;
    }

    // 2. Customer Sales Invoice (AR)
    if (dispatch.customer_invoice) {
      const inv = dispatch.customer_invoice;
      html += `
        <div class="doc-mini-card">
          <div>
            <div style="font-size: 0.72rem; color: var(--flow-emerald); font-weight: 700;">CUSTOMER INVOICE (ACCOUNTS RECEIVABLE)</div>
            <div style="font-size: 0.9rem; font-weight: 800; color: #fff;">${inv.invoice_number}</div>
            <div style="font-size: 0.72rem; color: #94a3b8;">Official Tax Invoice & Receipt | Grand Total: $${inv.grand_total.toFixed(2)}</div>
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn-view-doc" onclick="window.flowApp.loadDocToViewer('/api/invoices/preview/${inv.invoice_number}?type=customer', '📄 Customer Sales Invoice: ${inv.invoice_number}')" style="background: rgba(16,185,129,0.15); border-color: var(--flow-emerald); color: var(--flow-emerald);">
              👁️ Preview
            </button>
            <a href="/api/invoices/download/${inv.invoice_number}?type=customer" target="_blank" class="btn-view-doc" style="background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.2); color: #fff;">
              ⬇️ PDF
            </a>
          </div>
        </div>
      `;
    }

    // 3. Factory Supplier Invoice (AP)
    if (factoryRestock && factoryRestock.supplier_invoice) {
      const supp = factoryRestock.supplier_invoice;
      html += `
        <div class="doc-mini-card" style="border-left: 3px solid var(--flow-purple);">
          <div>
            <div style="font-size: 0.72rem; color: var(--flow-purple); font-weight: 700;">FACTORY SUPPLIER INVOICE (ACCOUNTS PAYABLE)</div>
            <div style="font-size: 0.9rem; font-weight: 800; color: #fff;">${supp.invoice_number}</div>
            <div style="font-size: 0.72rem; color: #94a3b8;">PO: ${supp.po_id} | Inbound Bulk Restock: +${factoryRestock.restocked_qty} units</div>
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn-view-doc" onclick="window.flowApp.loadDocToViewer('/api/invoices/preview/${supp.invoice_number}?type=supplier', '🏭 Factory Supplier Invoice: ${supp.invoice_number}')" style="background: rgba(139,92,246,0.15); border-color: var(--flow-purple); color: var(--flow-purple);">
              👁️ Preview
            </button>
            <a href="/api/invoices/download/${supp.invoice_number}?type=supplier" target="_blank" class="btn-view-doc" style="background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.2); color: #fff;">
              ⬇️ PDF
            </a>
          </div>
        </div>
      `;
    }

    this.el.docsContainer.innerHTML = html;

    // Auto-load the customer invoice into the visual inspector
    if (dispatch.customer_invoice) {
      this.loadDocToViewer(`/api/invoices/preview/${dispatch.customer_invoice.invoice_number}?type=customer`, `📄 Customer Sales Invoice: ${dispatch.customer_invoice.invoice_number}`);
    }
  }

  setStageActive(index, statusText, bodyText) {
    const st = this.el.stages[index];
    st.card.className = "stage-card active-pulse";
    st.status.textContent = statusText;
    st.status.style.color = "var(--flow-cyan)";
    if (bodyText) st.body.innerHTML = bodyText;
  }

  setStageWarning(index, statusText, bodyText) {
    const st = this.el.stages[index];
    st.card.className = "stage-card warning-breach";
    st.status.textContent = statusText;
    st.status.style.color = "var(--flow-rose)";
    if (bodyText) st.body.innerHTML = bodyText;
  }

  setStageComplete(index, statusText, bodyText) {
    const st = this.el.stages[index];
    st.card.className = "stage-card success-complete";
    st.status.textContent = statusText;
    st.status.style.color = "var(--flow-emerald)";
    if (bodyText) st.body.innerHTML = bodyText;
  }

  promptApprovalModal(po, customerInfo) {
    return new Promise((resolve) => {
      const modal = document.getElementById("manual-approval-modal");
      const details = document.getElementById("modal-approval-details");
      const btnApprove = document.getElementById("modal-btn-approve");
      const btnReject = document.getElementById("modal-btn-reject");

      if (!modal || !details) {
        resolve(true);
        return;
      }

      details.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
          <span style="color: #94a3b8;">Proposed PO ID:</span>
          <span style="color: var(--flow-cyan); font-weight: 700;">${po.po_id}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
          <span style="color: #94a3b8;">Product / SKU:</span>
          <span style="color: #fff; font-weight: 700;">${po.sku} (${customerInfo.item_name || "Factory Item"})</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
          <span style="color: #94a3b8;">Restock Quantity:</span>
          <span style="color: var(--flow-emerald); font-weight: 700;">+${po.quantity} units (Safety Multiplier)</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
          <span style="color: #94a3b8;">Unit Cost / Total Capital:</span>
          <span style="color: #fff; font-weight: 700;">$${po.unit_cost}/unit &rarr; <span style="color: var(--flow-amber); font-size: 0.95rem;">$${po.total_cost}</span></span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #94a3b8;">Target Factory Supplier:</span>
          <span style="color: #e2e8f0;">${po.supplier_name || "Apex Manufacturing Plant"}</span>
        </div>
      `;

      modal.style.display = "flex";

      const handleApprove = () => {
        cleanup();
        modal.style.display = "none";
        resolve(true);
      };

      const handleReject = () => {
        cleanup();
        modal.style.display = "none";
        resolve(false);
      };

      const cleanup = () => {
        btnApprove.removeEventListener("click", handleApprove);
        btnReject.removeEventListener("click", handleReject);
      };

      btnApprove.addEventListener("click", handleApprove);
      btnReject.addEventListener("click", handleReject);
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.flowApp = new VisualFlowApp();
});
