// metrics_dashboard.js - Live Grafana & Prometheus Telemetry Controller
// Multi-color line graph for API Calls Over Time by Microservice (<230 lines)

const API_SERVICE_PALETTE = {
  "Storefront API": { color: "#00f0ff", label: "Storefront API (Customer)" },
  "Invoice Auditor": { color: "#ec4899", label: "Invoice Auditor & PDF" },
  "Fleet Registry": { color: "#f59e0b", label: "Fleet & Microservices" },
  "Supervisor & ADK": { color: "#8b5cf6", label: "Supervisor & Workflow" },
  "Blackboard Engine": { color: "#10b981", label: "Blackboard & Memory" },
  "Core Gateway": { color: "#64748b", label: "Core Gateway / Other" }
};

class MetricsDashboard {
  constructor() {
    this.pollInterval = 2000;
    this.timer = null;
    this.charts = {};
    this.initElements();
    this.initCharts();
    this.startPolling();
  }

  initElements() {
    this.elUptime = document.getElementById("stat-uptime");
    this.elFleetDetail = document.getElementById("stat-fleet-detail");
    this.elLatency = document.getElementById("stat-latency");
    this.elTokens = document.getElementById("stat-tokens");
    this.elExecs = document.getElementById("stat-runs");
    this.btnRefresh = document.getElementById("btn-refresh-metrics");
    if (this.btnRefresh) this.btnRefresh.addEventListener("click", () => this.fetchMetrics());
  }

  initCharts() {
    Chart.defaults.color = "#94a3b8";
    Chart.defaults.font.family = "'Inter', sans-serif";

    // 1. API Calls Over Time Chart (Multi-color Line per Microservice)
    const ctxCalls = document.getElementById("chart-api-calls")?.getContext("2d");
    if (ctxCalls) {
      const initialDatasets = Object.keys(API_SERVICE_PALETTE).map(svc => ({
        label: API_SERVICE_PALETTE[svc].label,
        data: [0, 0, 0, 0, 0, 0],
        borderColor: API_SERVICE_PALETTE[svc].color,
        backgroundColor: "transparent",
        borderWidth: 2,
        tension: 0.35,
        pointRadius: 3,
        pointHoverRadius: 5
      }));

      this.charts.calls = new Chart(ctxCalls, {
        type: "line",
        data: { labels: ["t-5m", "t-4m", "t-3m", "t-2m", "t-1m", "now"], datasets: initialDatasets },
        options: this.getChartOptions("calls")
      });
    }

    // 2. Workflow Execution Latency Timeseries Chart
    const ctxLat = document.getElementById("chart-latency")?.getContext("2d");
    if (ctxLat) {
      this.charts.latency = new Chart(ctxLat, {
        type: "line",
        data: {
          labels: ["t-5", "t-4", "t-3", "t-2", "t-1", "now"],
          datasets: [{
            label: "Workflow Latency (ms)",
            data: [0, 0, 0, 0, 0, 0],
            borderColor: "#00f0ff",
            backgroundColor: "rgba(0, 240, 255, 0.12)",
            borderWidth: 2,
            tension: 0.35,
            fill: true,
            pointRadius: 4,
            pointBackgroundColor: "#00f0ff"
          }]
        },
        options: this.getChartOptions("ms")
      });
    }

    // 3. Microservice Fleet Status Map (Horizontal Bar: Green=Active, Red=Down)
    const ctxFleet = document.getElementById("chart-fleet-status")?.getContext("2d");
    if (ctxFleet) {
      this.charts.fleet = new Chart(ctxFleet, {
        type: "bar",
        data: {
          labels: ["Blackboard", "Inventory Agent", "Invoice Auditor", "Supervisor", "Procurement", "Dispatch", "FastMCP", "A2A Bridge", "ReportLab PDF", "Langfuse", "Storefront"],
          datasets: [{
            label: "Status",
            data: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
            backgroundColor: Array(11).fill("#10b981"),
            borderWidth: 1,
            borderRadius: 4
          }]
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { min: 0, max: 1, ticks: { stepSize: 1, callback: (v) => v === 1 ? "ACTIVE" : "DOWN" }, grid: { color: "rgba(255,255,255,0.05)" } },
            y: { grid: { display: false }, ticks: { font: { size: 10 } } }
          },
          plugins: { legend: { display: false } }
        }
      });
    }

    // 4. Inventory Telemetry Bar Chart
    const ctxInv = document.getElementById("chart-inventory")?.getContext("2d");
    if (ctxInv) {
      this.charts.inventory = new Chart(ctxInv, {
        type: "bar",
        data: {
          labels: ["SKU-1001", "SKU-1002", "SKU-1003"],
          datasets: [
            { label: "Available Qty", data: [45, 8, 120], backgroundColor: "rgba(16, 185, 129, 0.65)", borderColor: "#10b981", borderWidth: 1.5, borderRadius: 4 },
            { label: "Safety Level", data: [15, 10, 30], backgroundColor: "rgba(239, 68, 68, 0.4)", borderColor: "#ef4444", borderWidth: 1.5, borderRadius: 4 }
          ]
        },
        options: this.getChartOptions("units")
      });
    }
  }

  getChartOptions(unit) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { grid: { color: "rgba(255, 255, 255, 0.05)" } },
        y: { beginAtZero: true, grid: { color: "rgba(255, 255, 255, 0.05)" }, ticks: { callback: (v) => `${v} ${unit}` } }
      },
      plugins: { legend: { labels: { boxWidth: 10, font: { size: 10 } } } }
    };
  }

  async fetchMetrics() {
    try {
      const res = await fetch("/api/metrics/summary");
      if (!res.ok) return;
      const data = await res.json();
      this.updateGauges(data);
      this.updateCharts(data);
    } catch (e) {
      console.warn("Metrics polling warning:", e);
    }
  }

  updateGauges(data) {
    if (data.fleet_health) {
      const fh = data.fleet_health;
      if (this.elUptime) {
        this.elUptime.textContent = `${fh.uptime_percent}%`;
        this.elUptime.style.color = fh.down > 0 ? "var(--accent-red, #ef4444)" : "var(--accent-emerald, #10b981)";
      }
      if (this.elFleetDetail) {
        this.elFleetDetail.textContent = `${fh.healthy} / ${fh.total} Active (${fh.down} Down)`;
      }
    }
    if (this.elLatency) this.elLatency.textContent = `${Math.round(data.avg_latency_ms || 0)}ms`;
    if (this.elTokens) this.elTokens.textContent = Number(data.total_tokens_consumed || 0).toLocaleString();
    if (this.elExecs) this.elExecs.textContent = Number(data.total_executions || 0).toLocaleString();
  }

  updateCharts(data) {
    // 1. API Calls Over Time Chart: Each microservice gets its own colored line
    if (this.charts.calls && data.api_traffic?.call_rate_timeline) {
      const tl = data.api_traffic.call_rate_timeline;
      const minutes = tl.map(t => t.minute);
      const services = Object.keys(API_SERVICE_PALETTE);

      const datasets = services.map(svc => {
        const conf = API_SERVICE_PALETTE[svc];
        const counts = tl.map(bucket => (bucket.services && bucket.services[svc]) || 0);
        return {
          label: conf.label,
          data: counts,
          borderColor: conf.color,
          backgroundColor: "transparent",
          borderWidth: 2,
          tension: 0.35,
          pointRadius: 3,
          pointBackgroundColor: conf.color
        };
      });

      this.charts.calls.data.labels = minutes;
      this.charts.calls.data.datasets = datasets;
      this.charts.calls.update("none");
    }

    // 2. Workflow Execution Latency Timeseries
    if (this.charts.latency && data.timeseries?.length > 0) {
      const labels = data.timeseries.map((p, idx) => p.timestamp ? p.timestamp.substring(11, 19) : `#${idx + 1}`);
      const lats = data.timeseries.map(p => p.latency_ms);
      this.charts.latency.data.labels = labels;
      this.charts.latency.data.datasets[0].data = lats;
      this.charts.latency.update("none");
    }

    // 3. Microservice Fleet Status Map: Highlights toggled service in distinct Red vs Green
    if (this.charts.fleet && data.fleet_health?.services) {
      const svcs = data.fleet_health.services;
      this.charts.fleet.data.labels = svcs.map(s => s.name);
      this.charts.fleet.data.datasets[0].data = svcs.map(s => s.status === "ACTIVE" ? 1 : 0);
      this.charts.fleet.data.datasets[0].backgroundColor = svcs.map(s => s.status === "ACTIVE" ? "#10b981" : "#ef4444");
      this.charts.fleet.data.datasets[0].borderColor = svcs.map(s => s.status === "ACTIVE" ? "rgba(16, 185, 129, 0.4)" : "#f43f5e");
      this.charts.fleet.update("none");
    }

    // 4. Warehouse Inventory
    if (this.charts.inventory && data.inventory_status) {
      const skus = Object.keys(data.inventory_status);
      this.charts.inventory.data.labels = skus;
      this.charts.inventory.data.datasets[0].data = skus.map(s => data.inventory_status[s].available || 0);
      this.charts.inventory.data.datasets[1].data = skus.map(s => data.inventory_status[s].safety || 0);
      this.charts.inventory.update("none");
    }
  }

  startPolling() {
    this.fetchMetrics();
    this.timer = setInterval(() => this.fetchMetrics(), this.pollInterval);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.metricsDashboard = new MetricsDashboard();
});
