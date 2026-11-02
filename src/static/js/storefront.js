/**
 * Storefront & Invoicing Client for WareSync AI Dashboard.
 * Handles customer conversations, order placement, PDF modal, and factory restocks.
 * Strict line limit: <120 lines.
 */

export class StorefrontClient {
  constructor(elements, renderer, onInvoiceChange) {
    this.el = elements;
    this.renderer = renderer;
    this.onInvoiceChange = onInvoiceChange;
    this.currentInquiry = null;
    this.invoicesList = [];
    this.attachEvents();
    this.fetchInvoices();
  }

  attachEvents() {
    if (this.el.btnCustCheckStock) this.el.btnCustCheckStock.addEventListener("click", () => this.handleInquire());
    if (this.el.btnCustConfirmYes) this.el.btnCustConfirmYes.addEventListener("click", () => this.handleConfirm());
    if (this.el.btnCustCancel) this.el.btnCustCancel.addEventListener("click", () => {
      this.el.custChatResponseBox.style.display = "none";
    });
    if (this.el.btnFactoryRestock) this.el.btnFactoryRestock.addEventListener("click", () => this.handleFactoryRestock());
    if (this.el.btnRefreshInvoices) this.el.btnRefreshInvoices.addEventListener("click", () => this.fetchInvoices());
    if (this.el.btnCloseModal) this.el.btnCloseModal.addEventListener("click", () => this.closeModal());
    if (this.el.pdfModalBackdrop) {
      this.el.pdfModalBackdrop.addEventListener("click", (e) => {
        if (e.target === this.el.pdfModalBackdrop) this.closeModal();
      });
    }
  }

  async fetchInvoices() {
    try {
      const res = await fetch("/api/invoices/list");
      const data = await res.json();
      this.invoicesList = data.invoices || [];
      this.renderer.renderInvoicesGallery(this.invoicesList, (inv) => this.openModal(inv));
    } catch (err) {
      console.error("Fetch invoices error:", err);
    }
  }

  openModal(inv) {
    if (!this.el.pdfModalBackdrop) return;
    this.el.modalInvoiceTitle.textContent = `${inv.type}: ${inv.id}`;
    this.el.modalInvoiceBadge.textContent = inv.status;
    this.el.modalInvoiceBadge.className = `framework-tag ${inv.status.includes('DISCREPANCY') ? 'adk' : 'crewai'}`;
    this.el.modalDownloadLink.href = inv.download_url;
    this.el.pdfPreviewIframe.src = inv.preview_url;
    this.el.pdfModalBackdrop.style.display = "flex";
  }

  closeModal() {
    if (!this.el.pdfModalBackdrop) return;
    this.el.pdfModalBackdrop.style.display = "none";
    this.el.pdfPreviewIframe.src = "about:blank";
  }

  async handleInquire() {
    const sku = this.el.custSkuSelect.value;
    const qty = parseInt(this.el.custQtyInput.value, 10) || 1;
    this.el.btnCustCheckStock.textContent = "Checking...";
    try {
      const res = await fetch("/api/customer/inquire", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku, requested_qty: qty }),
      });
      const data = await res.json();
      this.currentInquiry = data;
      this.el.custChatMessageText.textContent = data.agent_response;
      this.el.custChatResponseBox.style.display = "block";
      this.el.btnCustConfirmYes.style.display = "block";
    } catch (e) {
      console.error(e);
    } finally {
      this.el.btnCustCheckStock.textContent = "🔍 1. Inquire & Check Stock";
    }
  }

  async handleConfirm() {
    if (!this.currentInquiry) return;
    this.el.btnCustConfirmYes.textContent = "Placing...";
    const qty = this.currentInquiry.available_qty > 0 ? this.currentInquiry.available_qty : this.currentInquiry.requested_qty;
    try {
      const res = await fetch("/api/customer/confirm-and-dispatch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: this.currentInquiry.sku, confirmed_qty: qty }),
      });
      const data = await res.json();
      this.el.custChatMessageText.innerHTML = `✅ <strong>${data.message}</strong>`;
      this.el.btnCustConfirmYes.style.display = "none";
      this.fetchInvoices();
      if (this.onInvoiceChange) this.onInvoiceChange();
    } catch (e) {
      console.error(e);
    }
  }

  async handleFactoryRestock() {
    this.el.btnFactoryRestock.textContent = "Ordering...";
    try {
      const sku = this.el.custSkuSelect.value;
      const res = await fetch(`/api/customer/factory-bulk-restock?sku=${sku}&restock_qty=50`, { method: "POST" });
      const data = await res.json();
      this.el.structuredOutputJson.textContent = JSON.stringify(data, null, 2);
      this.fetchInvoices();
      if (this.onInvoiceChange) this.onInvoiceChange();
    } catch (e) {
      console.error(e);
    } finally {
      this.el.btnFactoryRestock.textContent = "🏭 2. Place Bulk Factory Restock (+50 Units)";
    }
  }
}
