/**
 * WareSync AI - Interactive Dashboard Controller
 * Handles WebSocket communication, scenario triggers, and orchestration.
 * Strict line limit: <250 lines.
 */

import { DashboardRenderer } from "./renderer.js";
import { StorefrontClient } from "./storefront.js";

class DashboardController {
  constructor() {
    this.ws = null;
    this.state = null;
    this.initElements();
    this.renderer = new DashboardRenderer(this.el);
    this.storefront = new StorefrontClient(this.el, this.renderer, () => this.fetchInitialState());
    this.attachEventListeners();
    this.fetchInitialState();
    this.connectWebSocket();
  }

  async fetchInitialState() {
    try {
      const res = await fetch("/api/state");
      const data = await res.json();
      if (data) this.updateBlackboardView(data);
    } catch (e) {
      console.warn("Initial state fetch error:", e);
    }
  }

  initElements() {
    const byId = (id) => document.getElementById(id);
    this.el = {
      wsStatusText: byId("ws-status-text"), promptInput: byId("prompt-input"), selectArchitecture: byId("select-architecture"),
      selectPersona: byId("select-persona"), btnRun: byId("btn-run-workflow"), btnReset: byId("btn-reset-state"),
      blackboardSessionId: byId("blackboard-session-id"), systemStatusBadge: byId("system-status-badge"),
      activeAgentBadge: byId("active-agent-badge"), inventoryTbody: byId("inventory-tbody"),
      poInvoicesContainer: byId("po-invoices-container"), a2aMessageStream: byId("a2a-message-stream"),
      kpiLatency: byId("kpi-latency"), kpiTokens: byId("kpi-tokens"), kpiSteps: byId("kpi-steps"),
      kpiCost: byId("kpi-cost"), structuredOutputJson: byId("structured-output-json"),
      logContainer: byId("log-container"), logCount: byId("log-count"),
      guardrailAlertBanner: byId("guardrail-alert-banner"), guardrailMsg: byId("guardrail-msg"),
      selectCategoryFilter: byId("select-category-filter"), selectScenario: byId("select-scenario"),
      btnLoadScenario: byId("btn-load-scenario"), btnRunBatch: byId("btn-run-batch"),
      invoiceCardsContainer: byId("invoice-cards-container"), btnRefreshInvoices: byId("btn-refresh-invoices"),
      pdfModalBackdrop: byId("pdf-modal-backdrop"), pdfPreviewIframe: byId("pdf-preview-iframe"),
      modalInvoiceTitle: byId("modal-invoice-title"), modalInvoiceBadge: byId("modal-invoice-badge"),
      modalDownloadLink: byId("modal-download-link"), btnCloseModal: byId("btn-close-modal"),
      custSkuSelect: byId("cust-sku-select"), custQtyInput: byId("cust-qty-input"),
      btnCustCheckStock: byId("btn-cust-check-stock"), custChatResponseBox: byId("cust-chat-response-box"),
      custChatMessageText: byId("cust-chat-message-text"), btnCustConfirmYes: byId("btn-cust-confirm-yes"),
      btnCustCancel: byId("btn-cust-cancel"), btnFactoryRestock: byId("btn-factory-restock"), microservicesGrid: byId("microservices-grid"),
    };
    this.allScenarios = []; this.fetchScenarios(); this.fetchMicroservices();
  }

  attachEventListeners() {
    this.el.btnRun.addEventListener("click", () => this.handleRunWorkflow());
    this.el.btnReset.addEventListener("click", () => this.handleResetState());
    this.el.selectCategoryFilter.addEventListener("change", () => this.populateScenarioDropdown());
    this.el.btnLoadScenario.addEventListener("click", () => this.handleLoadSelectedScenario());
    this.el.btnRunBatch.addEventListener("click", () => this.handleRunBatchBenchmark());
    const btnToggleMode = document.getElementById("btn-toggle-approval-mode");
    if (btnToggleMode) {
      btnToggleMode.addEventListener("click", async () => {
        const nextMode = btnToggleMode.textContent.includes("Auto") ? "MANUAL" : "AUTO";
        const res = await fetch("/api/settings/mode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: nextMode }) });
        const data = await res.json();
        this.updateApprovalModeButton(data.mode);
      });
    }
    const tgl = document.getElementById("sidebar-toggle-btn"), sb = document.getElementById("app-sidebar");
    if (tgl && sb) {
      tgl.addEventListener("click", () => sb.classList.toggle("expanded"));
      document.addEventListener("click", (e) => { if (!sb.contains(e.target) && !tgl.contains(e.target)) sb.classList.remove("expanded"); });
    }
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        const target = document.getElementById(btn.getAttribute("data-tab"));
        if (target) target.classList.add("active");
      });
    });
  }

  updateApprovalModeButton(mode) {
    const btn = document.getElementById("btn-toggle-approval-mode");
    if (!btn) return;
    const isMan = mode === "MANUAL";
    btn.textContent = isMan ? "✋ Manual Mode" : "⚡ Auto-Pilot";
    btn.style.borderColor = isMan ? "var(--accent-amber)" : "var(--accent-emerald)";
    btn.style.color = isMan ? "var(--accent-amber)" : "var(--accent-emerald)";
    btn.style.background = isMan ? "rgba(245, 158, 11, 0.15)" : "rgba(16, 185, 129, 0.15)";
  }

  async handleApprovalAction(id, action) {
    await fetch(`/api/approvals/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
  }

  async fetchMicroservices() {
    try {
      const res = await fetch("/api/microservices");
      const data = await res.json();
      this.renderer.renderMicroservices(data.microservices || []);
    } catch (e) { console.warn("Microservices error:", e); }
  }

  async fetchScenarios() {
    try {
      const res = await fetch("/api/scenarios");
      const data = await res.json();
      this.allScenarios = data.scenarios || [];
      this.populateScenarioDropdown();
    } catch (err) { console.error("Scenarios error:", err); }
  }

  populateScenarioDropdown() {
    const selectedCat = this.el.selectCategoryFilter.value;
    this.el.selectScenario.innerHTML = "";
    const filtered = selectedCat === "ALL" ? this.allScenarios : this.allScenarios.filter((s) => s.category === selectedCat);
    filtered.forEach((sc) => {
      const opt = document.createElement("option");
      opt.value = sc.id;
      opt.textContent = `[${sc.id}] ${sc.title}`;
      this.el.selectScenario.appendChild(opt);
    });
  }

  handleLoadSelectedScenario() {
    const sc = this.allScenarios.find((s) => s.id === this.el.selectScenario.value);
    if (!sc) return;
    this.el.promptInput.value = sc.prompt;
    this.el.selectArchitecture.value = sc.architecture;
    this.el.selectPersona.value = sc.persona;
  }

  async handleRunBatchBenchmark() {
    this.el.btnRunBatch.textContent = "Running 42 Scenarios...";
    this.el.btnRunBatch.disabled = true;
    try {
      const res = await fetch("/api/run-batch-benchmark", { method: "POST" });
      const data = await res.json();
      this.el.structuredOutputJson.textContent = JSON.stringify(data.summary, null, 2);
      this.el.kpiLatency.textContent = `${data.summary.total_benchmark_time_ms} ms`;
      this.el.kpiSteps.textContent = `${data.summary.passed} / ${data.summary.total_executed}`;
    } catch (err) { console.error("Batch error:", err); }
    finally { this.el.btnRunBatch.textContent = "⚡ Run All 42 (Batch)"; this.el.btnRunBatch.disabled = false; }
  }

  connectWebSocket() {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    this.ws = new WebSocket(`${proto}//${window.location.host}/ws/stream`);
    this.ws.onopen = () => { this.el.wsStatusText.textContent = "Hover Blackboard: Connected"; this.el.wsStatusText.style.color = "var(--accent-emerald)"; };
    this.ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.full_state) this.updateBlackboardView(payload.full_state);
      } catch (e) { console.error("WS Parse error:", e); }
    };
    this.ws.onclose = () => {
      this.el.wsStatusText.textContent = "Hover Blackboard: Reconnecting...";
      this.el.wsStatusText.style.color = "var(--accent-amber)";
      setTimeout(() => this.connectWebSocket(), 3000);
    };
  }

  async handleRunWorkflow() {
    const prompt = this.el.promptInput.value.trim();
    if (!prompt) return;
    this.hideGuardrailAlert();
    this.el.btnRun.textContent = "Processing...";
    this.el.btnRun.disabled = true;
    try {
      const scenarioType = prompt.toLowerCase().includes("invoice") ? "invoice_audit" : "order_fulfillment";
      const res = await fetch("/api/trigger-workflow", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, scenario_type: scenarioType, prompt_architecture: this.el.selectArchitecture.value, persona: this.el.selectPersona.value }),
      });
      const data = await res.json();
      if (data.status === "blocked_by_guardrails") this.showGuardrailAlert(data.reason);
      else {
        this.el.structuredOutputJson.textContent = JSON.stringify(data.result, null, 2);
        this.el.kpiLatency.textContent = `${data.latency_ms} ms`;
        if (data.langfuse_trace) {
          const tid = document.getElementById("current-trace-id"), tlink = document.getElementById("btn-view-langfuse-trace");
          if (tid) tid.textContent = data.langfuse_trace.id;
          if (tlink) tlink.href = `/api/traces/${data.langfuse_trace.id}`;
        }
        this.storefront.fetchInvoices();
      }
    } catch (err) { console.error("API Error:", err); }
    finally { this.el.btnRun.textContent = "Execute Workflow"; this.el.btnRun.disabled = false; }
  }

  async handleResetState() {
    await fetch("/api/reset", { method: "POST" });
    this.hideGuardrailAlert();
    this.el.structuredOutputJson.textContent = "// State reset. Waiting for new workflow...";
    this.el.kpiLatency.textContent = "0 ms"; this.el.kpiTokens.textContent = "0"; this.el.kpiSteps.textContent = "0"; this.el.kpiCost.textContent = "$0.000";
    this.el.logContainer.innerHTML = '<div class="log-entry" style="color: var(--text-dim);">Blackboard state reset to baseline.</div>';
  }

  updateBlackboardView(state) {
    this.state = state;
    this.el.blackboardSessionId.textContent = state.session_id;
    this.el.systemStatusBadge.textContent = state.status;
    this.el.systemStatusBadge.className = `badge-status ${state.status.toLowerCase()}`;

    if (state.active_agent) {
      this.el.activeAgentBadge.textContent = state.active_agent;
      const isADK = state.active_agent.includes("Inventory") || state.active_agent.includes("Invoice");
      this.el.activeAgentBadge.className = `framework-tag ${isADK ? "adk" : "crewai"}`;
    }

    if (state.approval_mode) this.updateApprovalModeButton(state.approval_mode);
    this.renderer.renderPendingApprovals(state.pending_approvals, (id, act) => this.handleApprovalAction(id, act));
    this.renderer.renderInventoryTable(state.inventory_cache);
    this.renderer.renderPOsAndInvoices(state.purchase_orders, state.invoices, state.active_orders);
    this.renderer.renderA2AMessages(state.pending_events);
    this.renderer.renderExecutionTrace(state.execution_trace);
    this.updateTelemetry(state.execution_trace);
  }

  updateTelemetry(traces) {
    if (!traces || traces.length === 0) return;
    const totalTokens = traces.reduce((acc, t) => acc + (t.tokens_used || 0), 0);
    this.el.kpiTokens.textContent = totalTokens.toLocaleString();
    this.el.kpiSteps.textContent = traces.length;
    this.el.kpiCost.textContent = `$${((totalTokens / 1000) * 0.0015).toFixed(4)}`;
  }

  showGuardrailAlert(msg) { this.el.guardrailMsg.textContent = msg; this.el.guardrailAlertBanner.style.display = "block"; }
  hideGuardrailAlert() { this.el.guardrailAlertBanner.style.display = "none"; }
}

document.addEventListener("DOMContentLoaded", () => {
  window.dashboard = new DashboardController();
  window.toggleServiceStatus = async (id) => {
    await fetch(`/api/microservices/${id}/toggle`, { method: "POST" });
    window.dashboard.fetchMicroservices();
  };
});
