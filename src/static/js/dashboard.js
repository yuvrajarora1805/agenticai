/**
 * WareSync AI - Interactive Dashboard Controller
 * Handles WebSocket communication, DOM mutations, scenario triggers, and real-time Blackboard updates.
 */

class DashboardController {
  constructor() {
    this.ws = null;
    this.state = null;
    this.initElements();
    this.attachEventListeners();
    this.connectWebSocket();
  }

  initElements() {
    this.wsStatusText = document.getElementById("ws-status-text");
    this.promptInput = document.getElementById("prompt-input");
    this.selectArchitecture = document.getElementById("select-architecture");
    this.selectPersona = document.getElementById("select-persona");
    this.btnRun = document.getElementById("btn-run-workflow");
    this.btnReset = document.getElementById("btn-reset-state");

    this.blackboardSessionId = document.getElementById("blackboard-session-id");
    this.systemStatusBadge = document.getElementById("system-status-badge");
    this.activeAgentBadge = document.getElementById("active-agent-badge");
    this.inventoryTbody = document.getElementById("inventory-tbody");
    this.poInvoicesContainer = document.getElementById("po-invoices-container");
    this.a2aMessageStream = document.getElementById("a2a-message-stream");

    this.kpiLatency = document.getElementById("kpi-latency");
    this.kpiTokens = document.getElementById("kpi-tokens");
    this.kpiSteps = document.getElementById("kpi-steps");
    this.kpiCost = document.getElementById("kpi-cost");
    this.structuredOutputJson = document.getElementById("structured-output-json");

    this.logContainer = document.getElementById("log-container");
    this.logCount = document.getElementById("log-count");
    this.guardrailAlertBanner = document.getElementById("guardrail-alert-banner");
    this.guardrailMsg = document.getElementById("guardrail-msg");

    // Scenario Selectors
    this.selectCategoryFilter = document.getElementById("select-category-filter");
    this.selectScenario = document.getElementById("select-scenario");
    this.btnLoadScenario = document.getElementById("btn-load-scenario");
    this.btnRunBatch = document.getElementById("btn-run-batch");
    this.allScenarios = [];
    this.fetchScenarios();
  }

  attachEventListeners() {
    this.btnRun.addEventListener("click", () => this.handleRunWorkflow());
    this.btnReset.addEventListener("click", () => this.handleResetState());

    this.selectCategoryFilter.addEventListener("change", () => this.populateScenarioDropdown());
    this.btnLoadScenario.addEventListener("click", () => this.handleLoadSelectedScenario());
    this.btnRunBatch.addEventListener("click", () => this.handleRunBatchBenchmark());
  }

  async fetchScenarios() {
    try {
      const res = await fetch("/api/scenarios");
      const data = await res.json();
      this.allScenarios = data.scenarios || [];
      this.populateScenarioDropdown();
    } catch (err) {
      console.error("Failed to fetch scenarios:", err);
    }
  }

  populateScenarioDropdown() {
    const selectedCat = this.selectCategoryFilter.value;
    this.selectScenario.innerHTML = "";
    const filtered = selectedCat === "ALL" 
      ? this.allScenarios 
      : this.allScenarios.filter(s => s.category === selectedCat);

    filtered.forEach((sc) => {
      const opt = document.createElement("option");
      opt.value = sc.id;
      opt.textContent = `[${sc.id}] ${sc.title}`;
      this.selectScenario.appendChild(opt);
    });
  }

  handleLoadSelectedScenario() {
    const selectedId = this.selectScenario.value;
    const sc = this.allScenarios.find(s => s.id === selectedId);
    if (!sc) return;

    this.promptInput.value = sc.prompt;
    this.selectArchitecture.value = sc.architecture;
    this.selectPersona.value = sc.persona;
  }

  async handleRunBatchBenchmark() {
    this.btnRunBatch.textContent = "Running 42 Scenarios...";
    this.btnRunBatch.disabled = true;

    try {
      const res = await fetch("/api/run-batch-benchmark", { method: "POST" });
      const data = await res.json();
      this.structuredOutputJson.textContent = JSON.stringify(data.summary, null, 2);
      this.kpiLatency.textContent = `${data.summary.total_benchmark_time_ms} ms`;
      this.kpiSteps.textContent = `${data.summary.total_executed} TCs`;
      alert(`Batch Benchmark Complete!\n• Total Tests Executed: ${data.summary.total_executed}\n• Pass Rate: ${data.summary.pass_rate_pct}%\n• Benchmark Time: ${data.summary.total_benchmark_time_ms} ms`);
    } catch (err) {
      console.error("Batch error:", err);
    } finally {
      this.btnRunBatch.textContent = "⚡ Run All 42 (Batch)";
      this.btnRunBatch.disabled = false;
    }
  }

  connectWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/stream`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.wsStatusText.textContent = "Blackboard Connected";
      this.wsStatusText.style.color = "var(--accent-emerald)";
    };

    this.ws.onmessage = (event) => {
      try {
        const packet = JSON.parse(event.data);
        this.handleWebSocketPacket(packet);
      } catch (err) {
        console.error("WS Parse Error:", err);
      }
    };

    this.ws.onclose = () => {
      this.wsStatusText.textContent = "Disconnected (Reconnecting...)";
      this.wsStatusText.style.color = "var(--accent-rose)";
      setTimeout(() => this.connectWebSocket(), 3000);
    };
  }

  handleWebSocketPacket(packet) {
    if (packet.type === "init" || packet.type === "blackboard_event") {
      const state = packet.full_state;
      if (state) {
        this.updateBlackboardView(state);
      }
    }

    if (packet.type === "guardrail_alert") {
      this.showGuardrailAlert(packet.message);
    }
  }

  async handleRunWorkflow(scenarioType = "custom") {
    const prompt = this.promptInput.value.trim();
    if (!prompt) {
      alert("Please enter a prompt or select a preset scenario.");
      return;
    }

    this.hideGuardrailAlert();
    this.btnRun.textContent = "Running Multi-Agent Workflow...";
    this.btnRun.disabled = true;

    try {
      const res = await fetch("/api/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt,
          scenario_type: scenarioType,
          prompt_architecture: this.selectArchitecture.value,
          persona: this.selectPersona.value,
        }),
      });

      const data = await res.json();
      if (data.status === "blocked_by_guardrails") {
        this.showGuardrailAlert(data.reason);
      } else {
        this.structuredOutputJson.textContent = JSON.stringify(data.result, null, 2);
        this.kpiLatency.textContent = `${data.latency_ms} ms`;
      }
    } catch (err) {
      console.error("API Error:", err);
    } finally {
      this.btnRun.textContent = "Execute Workflow";
      this.btnRun.disabled = false;
    }
  }

  async handleResetState() {
    await fetch("/api/reset", { method: "POST" });
    this.hideGuardrailAlert();
    this.structuredOutputJson.textContent = "// State reset. Waiting for new workflow...";
    this.kpiLatency.textContent = "0 ms";
    this.kpiTokens.textContent = "0";
    this.kpiSteps.textContent = "0";
    this.kpiCost.textContent = "$0.000";
    this.logContainer.innerHTML = '<div class="log-entry" style="color: var(--text-dim);">Blackboard state reset to baseline.</div>';
  }

  updateBlackboardView(state) {
    this.state = state;
    this.blackboardSessionId.textContent = state.session_id;

    // Status Badge
    this.systemStatusBadge.textContent = state.status;
    this.systemStatusBadge.className = `badge-status ${state.status.toLowerCase()}`;

    // Active Agent Badge
    if (state.active_agent) {
      this.activeAgentBadge.textContent = state.active_agent;
      const isADK = state.active_agent.includes("Inventory") || state.active_agent.includes("Invoice");
      this.activeAgentBadge.className = `framework-tag ${isADK ? "adk" : "crewai"}`;
    }

    // Render Inventory Table
    this.renderInventoryTable(state.inventory_cache);

    // Render Active POs and Invoices
    this.renderPOsAndInvoices(state.purchase_orders, state.invoices);

    // Render A2A Channel
    this.renderA2AMessages(state.pending_events);

    // Render Execution Trace & Callbacks
    this.renderExecutionTrace(state.execution_trace);

    // Update Telemetry KPIs
    this.updateTelemetry(state.execution_trace);
  }

  renderInventoryTable(inventoryCache) {
    this.inventoryTbody.innerHTML = "";
    Object.values(inventoryCache || {}).forEach((item) => {
      const tr = document.createElement("tr");
      const isLow = item.available_qty <= item.safety_stock;
      tr.innerHTML = `
        <td><strong style="color: var(--accent-cyan);">${item.sku}</strong></td>
        <td>${item.name}</td>
        <td><span style="color: ${isLow ? 'var(--accent-rose)' : 'var(--accent-emerald)'}; font-weight: bold;">${item.available_qty}</span></td>
        <td>${item.reserved_qty}</td>
        <td>${item.safety_stock}</td>
        <td>$${item.unit_price.toFixed(2)}</td>
      `;
      this.inventoryTbody.appendChild(tr);
    });
  }

  renderPOsAndInvoices(purchaseOrders, invoices) {
    this.poInvoicesContainer.innerHTML = "";
    const poList = Object.values(purchaseOrders || {});
    const invList = Object.values(invoices || {});

    if (poList.length === 0 && invList.length === 0) {
      this.poInvoicesContainer.innerHTML = '<div style="font-size: 0.8rem; color: var(--text-dim); padding: 8px;">No pending purchase orders or discrepancies in blackboard.</div>';
      return;
    }

    poList.forEach((po) => {
      const card = document.createElement("div");
      card.style.cssText = "background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: var(--radius-sm); padding: 10px;";
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: 600;">
          <span>📦 Purchase Order: ${po.po_id}</span>
          <span style="color: var(--accent-blue);">$${po.total_cost}</span>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">
          Supplier: ${po.supplier_name} | Qty: ${po.quantity} units of ${po.sku}
        </div>
      `;
      this.poInvoicesContainer.appendChild(card);
    });

    invList.forEach((inv) => {
      const isMismatch = inv.status !== "VERIFIED";
      const card = document.createElement("div");
      card.style.cssText = `background: rgba(${isMismatch ? '244, 63, 94' : '16, 185, 129'}, 0.08); border: 1px solid rgba(${isMismatch ? '244, 63, 94' : '16, 185, 129'}, 0.3); border-radius: var(--radius-sm); padding: 10px;`;
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: 600;">
          <span>📑 Invoice Audit: ${inv.invoice_number}</span>
          <span style="color: ${isMismatch ? 'var(--accent-rose)' : 'var(--accent-emerald)'};">${inv.status}</span>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">
          PO Ref: ${inv.po_id} | ${inv.audit_notes}
        </div>
      `;
      this.poInvoicesContainer.appendChild(card);
    });
  }

  renderA2AMessages(events) {
    if (!events || events.length === 0) {
      this.a2aMessageStream.innerHTML = '<div style="font-size: 0.8rem; color: var(--text-dim);">Awaiting cross-framework agent triggers (CrewAI ↔ ADK)...</div>';
      return;
    }
    this.a2aMessageStream.innerHTML = "";
    events.slice(-4).forEach((evt) => {
      const card = document.createElement("div");
      card.style.cssText = "background: rgba(0, 0, 0, 0.3); border: 1px solid var(--border-glass); border-radius: var(--radius-sm); padding: 8px;";
      card.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.75rem;">
          <span style="color: var(--accent-cyan); font-weight: 600;">⚡ ${evt.intent}</span>
          <span style="font-size: 0.7rem; color: var(--text-dim);">${evt.message_id}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 6px; font-size: 0.75rem; margin-top: 4px;">
          <span class="framework-tag ${evt.sender_framework.toLowerCase()}">${evt.sender_agent} (${evt.sender_framework})</span>
          <span>➔</span>
          <span class="framework-tag ${evt.receiver_framework.toLowerCase()}">${evt.receiver_agent} (${evt.receiver_framework})</span>
        </div>
      `;
      this.a2aMessageStream.appendChild(card);
    });
  }

  renderExecutionTrace(traces) {
    if (!traces) return;
    this.logCount.textContent = `${traces.length} steps`;
    this.logContainer.innerHTML = "";
    traces.slice(-25).forEach((t) => {
      const div = document.createElement("div");
      div.className = "log-entry";
      const timeStr = t.timestamp ? t.timestamp.split("T")[1]?.slice(0, 8) : "";
      div.innerHTML = `
        <span class="log-time">[${timeStr}]</span>
        <span class="framework-tag ${t.framework.toLowerCase()}">${t.framework}</span>
        <span class="log-agent">${t.agent_name}:</span>
        <span class="log-action">${t.action}</span>
        <span style="color: var(--text-dim); font-size: 0.7rem;">(${t.latency_ms.toFixed(1)}ms | ${t.tokens_used} tok)</span>
      `;
      this.logContainer.appendChild(div);
    });
    this.logContainer.scrollTop = this.logContainer.scrollHeight;
  }

  updateTelemetry(traces) {
    if (!traces || traces.length === 0) return;
    let totalTokens = 0;
    let totalLatency = 0;
    traces.forEach((t) => {
      totalTokens += t.tokens_used || 0;
      totalLatency += t.latency_ms || 0;
    });
    this.kpiTokens.textContent = totalTokens.toLocaleString();
    this.kpiSteps.textContent = traces.length;
    // Estimated cost: ~$0.0015 per 1k tokens
    const cost = (totalTokens / 1000) * 0.0015;
    this.kpiCost.textContent = `$${cost.toFixed(4)}`;
  }

  showGuardrailAlert(msg) {
    this.guardrailMsg.textContent = msg;
    this.guardrailAlertBanner.style.display = "block";
  }

  hideGuardrailAlert() {
    this.guardrailAlertBanner.style.display = "none";
  }
}

// Initialize when DOM ready
document.addEventListener("DOMContentLoaded", () => {
  window.dashboard = new DashboardController();
});
