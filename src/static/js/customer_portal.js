/**
 * Customer Portal Controller for WareSync AI.
 * Powers product browsing, conversation with ADK Inventory agent,
 * order confirmation, Delivery Challans (DC), and Customer Invoices (AR).
 * Strict line limit: <220 lines.
 */

class CustomerPortalApp {
  constructor() {
    this.catalog = [
      { sku: "SKU-1002", name: "Hydraulic Forklift Valve", price: 45.0, desc: "High-pressure hydraulic flow control valve for industrial forklifts and lifting equipment." },
      { sku: "SKU-1001", name: "Industrial Conveyor Belt", price: 250.0, desc: "Reinforced 3-ply rubber conveyor belt built for heavy distribution sorting hubs." },
      { sku: "SKU-1003", name: "Barcode Scanner Unit", price: 85.0, desc: "Ruggedized wireless handheld barcode and QR code optical scanner terminal." },
    ];
    this.currentInquiry = null;
    this.initElements();
    this.renderCatalog();
    this.attachEvents();
    this.fetchCustomerDocuments();
  }

  initElements() {
    const byId = (id) => document.getElementById(id);
    this.el = {
      catalogGrid: byId("customer-catalog-grid"),
      orderDrawer: byId("customer-order-drawer"),
      drawerItemTitle: byId("drawer-item-title"),
      drawerChatBubble: byId("drawer-chat-bubble"),
      btnCloseDrawer: byId("btn-close-drawer"),
      btnConfirmOrder: byId("btn-drawer-confirm-order"),
      orderSuccessBox: byId("drawer-order-success"),
      successMsg: byId("drawer-success-msg"),
      docsRow: byId("drawer-docs-row"),
      invoicesGrid: byId("customer-invoices-grid"),
      btnRefreshInvoices: byId("btn-cust-refresh-invoices"),
      modalBackdrop: byId("cust-pdf-modal-backdrop"),
      modalTitle: byId("cust-modal-doc-title"),
      modalDownloadBtn: byId("cust-modal-download-btn"),
      modalIframe: byId("cust-modal-iframe"),
      btnCloseModal: byId("btn-cust-close-modal"),
    };
  }

  attachEvents() {
    if (this.el.btnCloseDrawer) this.el.btnCloseDrawer.addEventListener("click", () => {
      this.el.orderDrawer.style.display = "none";
    });
    if (this.el.btnConfirmOrder) this.el.btnConfirmOrder.addEventListener("click", () => this.handleConfirmOrder());
    if (this.el.btnRefreshInvoices) this.el.btnRefreshInvoices.addEventListener("click", () => this.fetchCustomerDocuments());
    if (this.el.btnCloseModal) this.el.btnCloseModal.addEventListener("click", () => this.closePdfModal());
    if (this.el.modalBackdrop) {
      this.el.modalBackdrop.addEventListener("click", (e) => {
        if (e.target === this.el.modalBackdrop) this.closePdfModal();
      });
    }
  }

  renderCatalog() {
    this.el.catalogGrid.innerHTML = "";
    this.catalog.forEach((item) => {
      const card = document.createElement("div");
      card.className = "glass-panel product-card";
      card.innerHTML = `
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 0.75rem; color: var(--accent-cyan); font-weight: 700;">${item.sku}</span>
            <span class="stock-pill" style="background: rgba(59, 130, 246, 0.15); color: var(--accent-blue);">In Stock</span>
          </div>
          <h3 style="font-size: 1.1rem; font-weight: 700; margin-top: 6px;">${item.name}</h3>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 6px; line-height: 1.4;">${item.desc}</p>
        </div>
        <div>
          <div class="product-price">$${item.price.toFixed(2)} <span style="font-size: 0.75rem; font-weight: 400; color: var(--text-dim);">/ unit</span></div>
          <div style="display: flex; gap: 8px; margin-top: 10px;">
            <input type="number" id="qty-${item.sku}" class="input-box" value="10" min="1" max="500" style="width: 70px; padding: 6px; font-size: 0.8rem;">
            <button class="btn btn-primary btn-inquire" style="flex: 1; font-size: 0.8rem;" data-sku="${item.sku}">
              Inquire & Buy
            </button>
          </div>
        </div>
      `;
      card.querySelector(".btn-inquire").addEventListener("click", (e) => {
        const sku = e.target.getAttribute("data-sku");
        const qty = parseInt(document.getElementById(`qty-${sku}`).value, 10) || 1;
        this.startInquiry(sku, qty);
      });
      this.el.catalogGrid.appendChild(card);
    });
  }

  async startInquiry(sku, qty) {
    if (this.el.orderSuccessBox) this.el.orderSuccessBox.style.display = "none";
    if (this.el.btnConfirmOrder) this.el.btnConfirmOrder.style.display = "block";
    if (this.el.drawerItemTitle) this.el.drawerItemTitle.textContent = `Inquiry: ${sku} (${qty} units)`;
    if (this.el.drawerChatBubble) this.el.drawerChatBubble.textContent = "Checking warehouse inventory with the ADK Inventory Agent...";
    if (this.el.orderDrawer) {
      this.el.orderDrawer.style.display = "block";
      this.el.orderDrawer.scrollIntoView({ behavior: "smooth" });
    }

    try {
      const res = await fetch("/api/customer/inquire", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku, requested_qty: qty, customer_name: "Customer Enterprise Logistics" }),
      });
      const data = await res.json();
      this.currentInquiry = data;
      this.el.drawerChatBubble.innerHTML = `<strong>ADK Inventory Custodian:</strong><br>${data.agent_response}`;
    } catch (err) {
      this.el.drawerChatBubble.textContent = "Error checking inventory. Please try again.";
    }
  }

  async handleConfirmOrder() {
    if (!this.currentInquiry) return;
    if (this.el.btnConfirmOrder) this.el.btnConfirmOrder.textContent = "Processing Order...";
    const qty = this.currentInquiry.available_qty > 0 ? this.currentInquiry.available_qty : this.currentInquiry.requested_qty;
    try {
      const res = await fetch("/api/customer/confirm-and-dispatch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: this.currentInquiry.sku, confirmed_qty: qty, customer_name: "Customer Enterprise Logistics" }),
      });
      const data = await res.json();
      if (this.el.btnConfirmOrder) this.el.btnConfirmOrder.style.display = "none";
      if (this.el.successMsg) this.el.successMsg.textContent = data.message;
      if (this.el.docsRow) {
        this.el.docsRow.innerHTML = `
          <button class="btn btn-primary btn-preview-doc" data-url="/api/invoices/preview/${data.delivery_challan.challan_number}?type=challans" data-name="${data.delivery_challan.challan_number}" data-dl="${data.delivery_challan.filepath}">
            📋 View Delivery Challan
          </button>
          <button class="btn btn-secondary btn-preview-doc" data-url="/api/invoices/preview/${data.customer_invoice.invoice_number}?type=customer" data-name="${data.customer_invoice.invoice_number}" data-dl="${data.customer_invoice.filepath}">
            📄 View Customer Invoice (AR)
          </button>
        `;
        this.el.docsRow.querySelectorAll(".btn-preview-doc").forEach((btn) => {
          btn.addEventListener("click", () => this.openPdfModal(btn.getAttribute("data-name"), btn.getAttribute("data-url")));
        });
      }
      if (this.el.orderSuccessBox) {
        this.el.orderSuccessBox.style.display = "block";
        this.el.orderSuccessBox.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      this.fetchCustomerDocuments();
    } catch (err) {
      console.error(err);
    } finally {
      if (this.el.btnConfirmOrder) this.el.btnConfirmOrder.textContent = "✅ Confirm & Place Order Now";
    }
  }

  async fetchCustomerDocuments() {
    try {
      const res = await fetch("/api/invoices/list");
      const data = await res.json();
      const docs = data.invoices || [];
      this.el.invoicesGrid.innerHTML = "";
      if (docs.length === 0) {
        this.el.invoicesGrid.innerHTML = '<div style="color: var(--text-dim); font-size: 0.85rem;">No documents issued yet. Place an order to see your Challan & Invoice!</div>';
        return;
      }
      docs.forEach((doc) => {
        const isChallan = doc.type.includes("Challan");
        const card = document.createElement("div");
        card.className = "glass-panel";
        card.style.cssText = "padding: 14px; display: flex; flex-direction: column; justify-content: space-between; gap: 8px;";
        card.innerHTML = `
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span class="framework-tag ${isChallan ? 'crewai' : 'mcp'}" style="font-size: 0.65rem;">${doc.type}</span>
              <span style="font-size: 0.7rem; color: var(--accent-emerald); font-weight: 700;">${doc.status}</span>
            </div>
            <div style="font-weight: 700; font-size: 0.9rem; margin-top: 6px;">${doc.id}</div>
          </div>
          <div style="display: flex; gap: 6px; margin-top: 6px;">
            <button class="btn btn-primary btn-open-doc" style="flex: 1; font-size: 0.75rem; padding: 6px;">👁️ View PDF</button>
            <a href="${doc.download_url}" target="_blank" class="btn btn-secondary" style="text-decoration: none; font-size: 0.75rem; padding: 6px 10px;">⬇️</a>
          </div>
        `;
        card.querySelector(".btn-open-doc").addEventListener("click", () => this.openPdfModal(doc.id, doc.preview_url, doc.download_url));
        this.el.invoicesGrid.appendChild(card);
      });
    } catch (e) {
      console.error(e);
    }
  }

  openPdfModal(title, previewUrl, downloadUrl) {
    this.el.modalTitle.textContent = title;
    this.el.modalIframe.src = previewUrl;
    this.el.modalDownloadBtn.href = downloadUrl || previewUrl;
    this.el.modalBackdrop.style.display = "flex";
  }

  closePdfModal() {
    this.el.modalBackdrop.style.display = "none";
    this.el.modalIframe.src = "about:blank";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.customerPortal = new CustomerPortalApp();
});
