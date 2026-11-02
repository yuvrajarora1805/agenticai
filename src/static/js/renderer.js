/**
 * UI Renderer for WareSync AI Dashboard.
 * Handles DOM rendering for Inventory tables, PO/Invoices, A2A messages, and Execution Traces.
 */

export class DashboardRenderer {
  constructor(elements) {
    this.el = elements;
  }

  renderInventoryTable(inventoryCache) {
    this.el.inventoryTbody.innerHTML = "";
    Object.values(inventoryCache || {}).forEach((item) => {
      const tr = document.createElement("tr");
      const isLow = item.available_qty <= item.safety_stock;
      const pct = Math.min(100, Math.round((item.available_qty / (item.safety_stock * 3)) * 100));
      tr.innerHTML = `
        <td><strong style="color: var(--accent-cyan); font-family: var(--font-mono);">${item.sku}</strong></td>
        <td style="font-weight: 500;">${item.name}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="color: ${isLow ? 'var(--accent-rose)' : 'var(--accent-emerald)'}; font-weight: 700; font-family: var(--font-mono);">${item.available_qty}</span>
            <div style="width: 50px; height: 5px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden;">
              <div style="width: ${pct}%; height: 100%; background: ${isLow ? 'var(--accent-rose)' : 'var(--accent-emerald)'};"></div>
            </div>
          </div>
        </td>
        <td style="color: var(--text-muted); font-family: var(--font-mono);">${item.reserved_qty}</td>
        <td style="color: var(--text-dim); font-family: var(--font-mono);">${item.safety_stock}</td>
        <td style="font-family: var(--font-mono); color: #fff; font-weight: 600;">$${item.unit_price.toFixed(2)}</td>
      `;
      this.el.inventoryTbody.appendChild(tr);
    });
  }

  renderPOsAndInvoices(purchaseOrders, invoices, activeOrders) {
    this.el.poInvoicesContainer.innerHTML = "";
    const poList = Object.values(purchaseOrders || {});
    const invList = Object.values(invoices || {});
    const ordList = Object.values(activeOrders || {});

    if (poList.length === 0 && invList.length === 0 && ordList.length === 0) {
      this.el.poInvoicesContainer.innerHTML = '<div style="font-size: 0.8rem; color: var(--text-dim); padding: 8px;">No pending customer orders, purchase orders, or discrepancies.</div>';
      return;
    }

    // Render Active Customer Orders
    ordList.forEach((ord) => {
      const card = document.createElement("div");
      card.style.cssText = "background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: var(--radius-sm); padding: 10px;";
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: 600;">
          <span>🛒 Customer Order: ${ord.order_id}</span>
          <span style="color: var(--accent-emerald); font-weight: 700;">$${ord.total_amount || 0}</span>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">
          Customer: ${ord.customer} | ${ord.quantity}x ${ord.sku} | Challan: ${ord.challan_number || 'N/A'} | Status: <strong style="color: var(--accent-emerald);">${ord.status}</strong>
        </div>
      `;
      this.el.poInvoicesContainer.appendChild(card);
    });

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
      this.el.poInvoicesContainer.appendChild(card);
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
      this.el.poInvoicesContainer.appendChild(card);
    });
  }

  renderA2AMessages(events) {
    if (!events || events.length === 0) {
      this.el.a2aMessageStream.innerHTML = '<div style="font-size: 0.8rem; color: var(--text-dim);">Awaiting cross-framework agent triggers (CrewAI ↔ ADK)...</div>';
      return;
    }
    this.el.a2aMessageStream.innerHTML = "";
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
      this.el.a2aMessageStream.appendChild(card);
    });
  }

  renderExecutionTrace(traces) {
    if (!traces) return;
    this.el.logCount.textContent = `${traces.length} steps`;
    this.el.logContainer.innerHTML = "";
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
      this.el.logContainer.appendChild(div);
    });
  }

  renderInvoicesGallery(invoices, onPreviewClick) {
    if (!this.el.invoiceCardsContainer) return;
    this.el.invoiceCardsContainer.innerHTML = "";
    if (!invoices || invoices.length === 0) {
      this.el.invoiceCardsContainer.innerHTML = '<div style="font-size: 0.8rem; color: var(--text-dim); padding: 8px;">No generated PDF invoices yet.</div>';
      return;
    }
    invoices.forEach((inv) => {
      const card = document.createElement("div");
      const isDC = inv.type.includes("Delivery Challan") || inv.id.startsWith("DC-");
      const isCust = inv.type.includes("Customer") || inv.id.includes("CUST");
      const isMismatch = inv.status.includes("DISCREPANCY");
      const badgeClass = isDC ? 'mcp' : (isCust ? 'crewai' : 'adk');
      const badgeIcon = isDC ? '📋 ' : '📄 ';
      const borderColor = isMismatch ? 'rgba(244, 63, 94, 0.5)' : (isDC ? 'rgba(16, 185, 129, 0.4)' : 'rgba(56, 189, 248, 0.4)');

      card.style.cssText = `background: rgba(255, 255, 255, 0.03); border: 1px solid ${borderColor}; border-radius: var(--radius-sm); padding: 10px; display: flex; flex-direction: column; justify-content: space-between; gap: 6px;`;
      card.innerHTML = `
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem;">
            <span class="framework-tag ${badgeClass}" style="font-size: 0.65rem;">${badgeIcon}${inv.type}</span>
            <span style="font-size: 0.65rem; color: ${isMismatch ? 'var(--accent-rose)' : 'var(--accent-emerald)'}; font-weight: 700;">${inv.status}</span>
          </div>
          <div style="font-size: 0.85rem; font-weight: 700; margin-top: 4px; color: #fff;">${inv.id}</div>
          <div style="font-size: 0.68rem; color: var(--text-dim); margin-top: 2px;">${inv.category || 'Dispatch Logistics'}</div>
        </div>
        <div style="display: flex; gap: 6px; margin-top: 6px;">
          <button class="btn btn-primary btn-preview-pdf" style="flex: 1; padding: 4px 6px; font-size: 0.7rem;">👁️ View ${isDC ? 'Challan' : 'PDF'}</button>
          <a href="${inv.download_url}" target="_blank" class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.7rem; text-decoration: none;" title="Download PDF">⬇️</a>
        </div>
      `;
      card.querySelector(".btn-preview-pdf").addEventListener("click", () => onPreviewClick(inv));
      this.el.invoiceCardsContainer.appendChild(card);
    });
  }

  renderMicroservices(services) {
    if (!this.el.microservicesGrid) return;
    this.el.microservicesGrid.innerHTML = "";
    (services || []).forEach((ms) => {
      const card = document.createElement("div");
      const isADK = ms.framework.includes("ADK"), isCrew = ms.framework.includes("CrewAI");
      const tagClass = isADK ? "adk" : (isCrew ? "crewai" : "mcp");
      const isDown = ms.status === "DOWN";
      card.style.cssText = `background: rgba(255, 255, 255, 0.02); border: 1px solid ${isDown ? "rgba(244,63,94,0.5)" : "var(--border-glass)"}; border-radius: var(--radius-sm); padding: 8px; display: flex; flex-direction: column; justify-content: space-between; gap: 4px;`;
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 700; font-size: 0.75rem; color: #fff;">${ms.name}</span>
          <span class="framework-tag ${tagClass}" style="font-size: 0.6rem; padding: 1px 5px;">${ms.framework}</span>
        </div>
        <div style="font-size: 0.7rem; color: var(--text-dim);">${ms.type}</div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; font-size: 0.65rem;">
          <span style="color: ${isDown ? "var(--accent-rose)" : "var(--accent-emerald)"}; font-weight: 700;">${isDown ? "🔴 DOWN" : "● ACTIVE"}</span>
          <button onclick="window.toggleServiceStatus('${ms.id}')" style="background: ${isDown ? "rgba(16,185,129,0.15)" : "rgba(244,63,94,0.15)"}; border: 1px solid ${isDown ? "var(--accent-emerald)" : "rgba(244,63,94,0.4)"}; color: ${isDown ? "var(--accent-emerald)" : "var(--accent-rose)"}; cursor: pointer; border-radius: 3px; font-size: 0.6rem; padding: 2px 6px; font-weight: 700;">${isDown ? "Restore" : "Kill"}</button>
        </div>
      `;
      this.el.microservicesGrid.appendChild(card);
    });
  }
  renderPendingApprovals(approvals, onAction) {
    const card = document.getElementById("pending-approvals-card");
    const list = document.getElementById("pending-approvals-list");
    const badge = document.getElementById("pending-count-badge");
    if (!card || !list) return;
    if (!approvals || approvals.length === 0) {
      card.style.display = "none";
      return;
    }
    card.style.display = "block";
    badge.textContent = `${approvals.length} Pending`;
    list.innerHTML = "";
    approvals.forEach((appr) => {
      const row = document.createElement("div");
      row.style.cssText = "display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.3); padding: 8px 12px; border-radius: var(--radius-sm); font-size: 0.75rem;";
      row.innerHTML = `
        <div>
          <span style="font-weight: 700; color: #fff;">${appr.id}</span>
          <span style="color: var(--text-dim); margin-left: 6px;">${appr.replenish_qty}x ${appr.sku} ($${appr.cost})</span>
          <div style="font-size: 0.65rem; color: var(--accent-amber);">${appr.status} (${appr.created_at})</div>
        </div>
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-primary btn-approve-act" style="font-size: 0.65rem; padding: 3px 8px; margin: 0; background: var(--accent-emerald);">Approve</button>
          <button class="btn btn-preset btn-reject-act" style="font-size: 0.65rem; padding: 3px 8px; margin: 0; border-color: var(--accent-rose); color: var(--accent-rose);">Reject</button>
        </div>
      `;
      row.querySelector(".btn-approve-act").addEventListener("click", () => onAction(appr.id, "approve"));
      row.querySelector(".btn-reject-act").addEventListener("click", () => onAction(appr.id, "reject"));
      list.appendChild(row);
    });
  }
}
