/**
 * Customer Portal Controller for WareSync AI.
 * Powers product browsing, conversation with Gemini Order Bot,
 * guardrail-verified order placement, and Customer Invoices (AR).
 */

class CustomerPortalApp {
  constructor() {
    this.catalog = [];
    this.selectedSku = null;
    this.selectedQty = 1;
    this.currentInquiry = null;
    this.conversationHistory = [];

    this.initElements();
    this.fetchLiveCatalog();
    this.attachEvents();
    this.fetchCustomerDocuments();
  }

  initElements() {
    const byId = (id) => document.getElementById(id);
    this.el = {
      catalogGrid: byId("customer-catalog-grid"),
      botItemLabel: byId("bot-selected-item-label"),
      chatHistory: byId("bot-chat-history"),
      userNoteInput: byId("bot-user-note-input"),
      btnSendInquiry: byId("btn-bot-send-inquiry"),
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
    // Hide confirm button until an item is actively selected
    if (this.el.btnConfirmOrder) this.el.btnConfirmOrder.style.display = "none";
  }

  async fetchLiveCatalog() {
    try {
      const res = await fetch("/api/customer/catalog");
      if (res.ok) {
        const data = await res.json();
        this.catalog = data.catalog || [];
        this.renderCatalog();
      }
    } catch (e) {
      console.warn("Failed to load live catalog", e);
    }
  }

  attachEvents() {
    if (this.el.btnSendInquiry) {
      this.el.btnSendInquiry.addEventListener("click", () => {
        const note = this.el.userNoteInput ? this.el.userNoteInput.value.trim() : "";
        if (note) {
          this.handleChatInquiry(note);
          if (this.el.userNoteInput) this.el.userNoteInput.value = "";
        }
      });
    }
    if (this.el.userNoteInput) {
      this.el.userNoteInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const note = this.el.userNoteInput.value.trim();
          if (note) {
            this.handleChatInquiry(note);
            this.el.userNoteInput.value = "";
          }
        }
      });
    }
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
    if (!this.el.catalogGrid) return;
    this.el.catalogGrid.innerHTML = "";
    this.catalog.forEach((item) => {
      const card = document.createElement("div");
      card.className = "product-card";
      const stockBadge = item.available_qty > 0 
        ? `<span style="font-size: 0.72rem; color: var(--accent-emerald); font-weight: 700;">● ${item.available_qty} In Stock</span>`
        : `<span style="font-size: 0.72rem; color: var(--accent-rose); font-weight: 700;">● Backorder Only</span>`;

      card.innerHTML = `
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span class="stock-pill" style="background: rgba(0, 240, 255, 0.12); color: var(--accent-cyan); font-weight: 700;">${item.sku}</span>
            ${stockBadge}
          </div>
          <h4 style="font-size: 1.05rem; font-weight: 700; color: #fff; margin-top: 10px;">${item.name}</h4>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 6px; line-height: 1.4;">${item.desc}</p>
        </div>
        <div>
          <div class="product-price">$${item.price.toFixed(2)} <span style="font-size: 0.75rem; font-weight: 400; color: var(--text-dim);">/ unit</span></div>
          <div style="display: flex; gap: 8px; margin-top: 10px;">
            <input type="number" id="qty-${item.sku}" class="input-box" value="5" min="1" max="500" style="width: 70px; padding: 6px; font-size: 0.8rem;">
            <button class="btn btn-primary btn-inquire" style="flex: 1; font-size: 0.8rem; font-weight: 700;" data-sku="${item.sku}">
              💬 Ask Bot & Order
            </button>
          </div>
        </div>
      `;
      card.querySelector(".btn-inquire").addEventListener("click", (e) => {
        const sku = e.target.getAttribute("data-sku");
        const qty = parseInt(document.getElementById(`qty-${sku}`).value, 10) || 1;
        this.selectedSku = sku;
        this.selectedQty = qty;
        this.startInquiry(sku, qty);
      });
      this.el.catalogGrid.appendChild(card);
    });
  }

  async handleChatInquiry(userNote) {
    const noteLower = userNote.toLowerCase();
    // Check if the user is explicitly naming a product in their message
    let mentionedProduct = this.catalog.find(c => 
      c.sku.toLowerCase() === noteLower ||
      noteLower.includes(c.sku.toLowerCase()) ||
      noteLower.includes(c.name.toLowerCase()) ||
      c.name.toLowerCase().split(" ").some(w => w.length > 3 && noteLower.includes(w))
    );

    if (mentionedProduct) {
      // User switched products or explicitly requested a new item
      this.selectedSku = mentionedProduct.sku;
      // Extract quantity from message if present, otherwise 0
      const qtyMatch = userNote.match(/\b(\d{1,3})\s*(?:units?|pieces?|pcs?|items?|orders?|qty)?\b/i);
      this.selectedQty = qtyMatch ? parseInt(qtyMatch[1], 10) : 0;
      await this.startInquiry(this.selectedSku, this.selectedQty, userNote);
      return;
    }

    // If an item is already selected and user is replying (e.g. providing a quantity like "5" or "continue")
    if (this.selectedSku) {
      const qtyMatch = userNote.match(/\b(\d{1,3})\s*(?:units?|pieces?|pcs?|items?|orders?|qty)?\b/i);
      if (qtyMatch) {
        this.selectedQty = parseInt(qtyMatch[1], 10);
      }
      await this.startInquiry(this.selectedSku, this.selectedQty, userNote);
    } else {
      // General RAG inquiry over the live warehouse database
      await this.startGeneralInquiry(userNote);
    }
  }

  async startGeneralInquiry(userNote) {
    if (this.el.orderSuccessBox) this.el.orderSuccessBox.style.display = "none";
    if (this.el.botItemLabel) {
      this.el.botItemLabel.textContent = "None (General Inquiry)";
      this.el.botItemLabel.style.color = "var(--accent-cyan)";
    }
    if (this.el.btnConfirmOrder) this.el.btnConfirmOrder.style.display = "none";

    // Track user message in conversation history
    this.conversationHistory.push({ role: "user", text: userNote });

    // Append customer message and thinking indicator
    this.el.chatHistory.innerHTML += `
      <div class="chat-bubble" style="background: rgba(255,255,255,0.06); text-align: right; color: #fff;">👤 <strong>You:</strong> ${userNote}</div>
      <div class="chat-bubble bot" id="bot-loading-indicator">🤖 <strong>Gemini Order Bot:</strong> Checking live warehouse stock and catalog...</div>
    `;
    this.el.chatHistory.scrollTop = this.el.chatHistory.scrollHeight;

    try {
      const res = await fetch("/api/customer/inquire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: "Customer Enterprise Logistics",
          customer_message: userNote,
          chat_history: this.conversationHistory.slice(-6)
        })
      });
      const data = await res.json();
      const loader = document.getElementById("bot-loading-indicator");
      if (loader) loader.remove();

      if (!res.ok) {
        this.el.chatHistory.innerHTML += `
          <div class="chat-bubble" style="background: rgba(244, 63, 94, 0.15); border-left: 3px solid var(--accent-rose); color: #fca5a5;">
            🛑 <strong>Guardrail Intercepted:</strong> ${data.detail || 'Request blocked by safety policy.'}
          </div>
        `;
        return;
      }

      // Track assistant response in conversation history
      this.conversationHistory.push({ role: "assistant", text: data.agent_response });

      // If backend detected an item and calculated totals, enable the order checkout state
      if (data.sku && data.requested_qty > 0) {
        this.selectedSku = data.sku;
        this.selectedQty = data.requested_qty;
        this.currentInquiry = data;
        if (this.el.botItemLabel) {
          this.el.botItemLabel.textContent = `${data.sku} (${data.item_name}) - ${data.requested_qty} units`;
          this.el.botItemLabel.style.color = "#fff";
        }
        if (this.el.btnConfirmOrder) {
          this.el.btnConfirmOrder.style.display = "block";
          this.el.btnConfirmOrder.innerHTML = `✅ Confirm & Place Order: ${data.requested_qty}x ${data.sku} ($${data.total_with_tax.toFixed(2)})`;
        }
      }

      // Check if user confirmed the order via conversational text (e.g. "continue", "yes", "proceed", "place order")
      const lowerNote = userNote.trim().toLowerCase();
      const isAffirmative = ["continue", "yes", "confirm", "proceed", "place order", "order now", "ok", "okay"].includes(lowerNote) ||
                            lowerNote.startsWith("place the order") || lowerNote.startsWith("confirm order");

      if (isAffirmative && this.currentInquiry && this.currentInquiry.sku) {
        this.el.chatHistory.innerHTML += `
          <div class="chat-bubble bot">
            ${this.formatBotText(data.agent_response)}
            <div style="margin-top: 10px; padding: 10px; background: rgba(16, 185, 129, 0.15); border: 1px solid var(--accent-emerald); border-radius: 6px;">
              <div style="font-weight: 700; color: var(--accent-emerald);">🚀 Order Confirmation Detected!</div>
              <div style="font-size: 0.78rem; color: #fff; margin-top: 2px;">Placing and dispatching your ${this.currentInquiry.requested_qty} units of ${this.currentInquiry.item_name}...</div>
            </div>
          </div>
        `;
        this.el.chatHistory.scrollTop = this.el.chatHistory.scrollHeight;
        // Automatically dispatch order
        await this.handleConfirmOrder();
        return;
      }

      this.el.chatHistory.innerHTML += `
        <div class="chat-bubble bot">
          ${this.formatBotText(data.agent_response)}
          ${data.sku ? `
            <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.08); font-size: 0.72rem; color: var(--text-dim); display: flex; justify-content: space-between;">
              <span>Subtotal: $${data.subtotal.toFixed(2)}</span>
              <span style="color: var(--accent-cyan); font-weight: 700;">Total (with 18% GST): $${data.total_with_tax.toFixed(2)}</span>
            </div>
            <div style="margin-top: 8px;">
              <button class="btn btn-primary btn-in-chat-confirm" style="padding: 6px 14px; font-size: 0.78rem; font-weight: 700; width: 100%; background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
                ⚡ Click to Place Order ($${data.total_with_tax.toFixed(2)})
              </button>
            </div>
          ` : ''}
        </div>
      `;

      // Attach in-chat button click listener
      const inChatBtn = this.el.chatHistory.querySelector(".btn-in-chat-confirm:last-of-type");
      if (inChatBtn) {
        inChatBtn.addEventListener("click", () => this.handleConfirmOrder());
      }

      this.el.chatHistory.scrollTop = this.el.chatHistory.scrollHeight;
    } catch (err) {
      const loader = document.getElementById("bot-loading-indicator");
      if (loader) loader.remove();
      this.el.chatHistory.innerHTML += `<div class="chat-bubble" style="color: var(--accent-rose);">Error connecting to Order Bot. Please try again.</div>`;
    }
  }

  formatBotText(text) {
    if (!text) return "";
    // 1. Convert code blocks ```code```
    let formatted = text.replace(/```([\s\S]*?)```/g, '<pre style="background: rgba(0,0,0,0.4); padding: 8px; border-radius: 4px; overflow-x: auto; font-family: monospace; font-size: 0.8rem; margin: 6px 0;">$1</pre>');
    // 2. Convert inline backticks `code`
    formatted = formatted.replace(/`([^`]+)`/g, '<code style="background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 3px; font-family: monospace; color: var(--accent-cyan); font-size: 0.82rem;">$1</code>');
    // 3. Convert bold **text**
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // 4. Convert italics *text* (excluding lone bullets)
    formatted = formatted.replace(/(^|[^\*])\*([^\*\n]+)\*([^\*]|$)/g, '$1<em>$2</em>$3');
    // 5. Convert bullet points (* item or - item)
    formatted = formatted.replace(/^\s*[\*\-]\s+/gm, '• ');
    return formatted;
  }

  async startInquiry(sku, qty, userNote = "") {
    if (this.el.orderSuccessBox) this.el.orderSuccessBox.style.display = "none";
    if (this.el.btnConfirmOrder) this.el.btnConfirmOrder.style.display = "block";
    const foundItem = this.catalog.find(c => c.sku === sku);
    const itemName = foundItem ? foundItem.name : sku;
    if (this.el.botItemLabel) {
      this.el.botItemLabel.textContent = `${sku} (${itemName}) - ${qty} units`;
      this.el.botItemLabel.style.color = "#fff";
    }

    if (userNote) {
      this.conversationHistory.push({ role: "user", text: userNote });
      this.el.chatHistory.innerHTML += `<div class="chat-bubble" style="background: rgba(255,255,255,0.06); text-align: right; color: #fff;">👤 <strong>You:</strong> ${userNote}</div>`;
    }
    this.el.chatHistory.innerHTML += `<div class="chat-bubble bot" id="bot-order-loader">🤖 <strong>Gemini Order Bot:</strong> Checking warehouse inventory for ${sku} and calculating quote...</div>`;
    this.el.chatHistory.scrollTop = this.el.chatHistory.scrollHeight;

    try {
      const res = await fetch("/api/customer/inquire", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku,
          requested_qty: qty,
          customer_name: "Customer Enterprise Logistics",
          customer_message: userNote || undefined,
          chat_history: this.conversationHistory.slice(-6)
        }),
      });
      const data = await res.json();
      const loader = document.getElementById("bot-order-loader");
      if (loader) loader.remove();

      if (!res.ok) {
        this.el.chatHistory.innerHTML += `
          <div class="chat-bubble" style="background: rgba(244, 63, 94, 0.15); border-left: 3px solid var(--accent-rose); color: #fca5a5;">
            🛑 <strong>Guardrail Intercepted:</strong> ${data.detail || 'Request blocked by safety policy.'}
          </div>
        `;
        if (this.el.btnConfirmOrder) this.el.btnConfirmOrder.style.display = "none";
        this.el.chatHistory.scrollTop = this.el.chatHistory.scrollHeight;
        return;
      }

      this.conversationHistory.push({ role: "assistant", text: data.agent_response });
      this.currentInquiry = data;
      this.el.chatHistory.innerHTML += `
        <div class="chat-bubble bot">
          ${this.formatBotText(data.agent_response)}
          <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.08); font-size: 0.72rem; color: var(--text-dim); display: flex; justify-content: space-between;">
            <span>Subtotal: $${data.subtotal.toFixed(2)}</span>
            <span style="color: var(--accent-cyan); font-weight: 700;">Total (with 18% GST): $${data.total_with_tax.toFixed(2)}</span>
          </div>
        </div>
      `;
      this.el.chatHistory.scrollTop = this.el.chatHistory.scrollHeight;
    } catch (err) {
      const loader = document.getElementById("bot-order-loader");
      if (loader) loader.remove();
      this.el.chatHistory.innerHTML += `<div class="chat-bubble" style="color: var(--accent-rose);">Error connecting to Order Bot. Please try again.</div>`;
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
      if (this.el.successMsg) this.el.successMsg.textContent = `Order ${data.customer_invoice.invoice_number} successfully placed & issued!`;
      if (this.el.docsRow) {
        this.el.docsRow.innerHTML = `
          <button class="btn btn-primary btn-preview-doc" data-url="/api/invoices/preview/${data.customer_invoice.invoice_number}?type=customer" data-name="${data.customer_invoice.invoice_number}">
            👁️ View My Invoice (${data.customer_invoice.invoice_number})
          </button>
        `;
        this.el.docsRow.querySelectorAll(".btn-preview-doc").forEach((btn) => {
          btn.addEventListener("click", () => this.openPdfModal(btn.getAttribute("data-name"), btn.getAttribute("data-url")));
        });
      }
      if (this.el.orderSuccessBox) {
        this.el.orderSuccessBox.style.display = "block";
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
      const allDocs = data.invoices || [];
      const docs = allDocs.filter((doc) => {
        return doc.type.includes("Customer") || doc.id.startsWith("INV-CUST") || doc.id.startsWith("INV-ORD");
      });

      this.el.invoicesGrid.innerHTML = "";
      if (docs.length === 0) {
        this.el.invoicesGrid.innerHTML = '<div style="color: var(--text-dim); font-size: 0.85rem; padding: 20px; grid-column: 1 / -1; text-align: center;">No customer order invoices issued yet. Ask the bot above to place an order and generate your official tax invoice!</div>';
        return;
      }
      docs.forEach((doc) => {
        const card = document.createElement("div");
        card.className = "glass-panel";
        card.style.cssText = "padding: 14px; display: flex; flex-direction: column; justify-content: space-between; gap: 8px; border-left: 3px solid var(--accent-blue);";
        card.innerHTML = `
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span class="framework-tag crewai" style="font-size: 0.65rem;">📄 Customer Invoice (AR)</span>
              <span style="font-size: 0.7rem; color: var(--accent-emerald); font-weight: 700;">${doc.status}</span>
            </div>
            <div style="font-weight: 700; font-size: 0.95rem; margin-top: 6px; font-family: var(--font-mono);">${doc.id}</div>
            <div style="font-size: 0.72rem; color: var(--text-dim); margin-top: 2px;">Official Tax Invoice & Receipt</div>
          </div>
          <div style="display: flex; gap: 6px; margin-top: 6px;">
            <button class="btn btn-primary btn-open-doc" style="flex: 1; font-size: 0.75rem; padding: 6px;">👁️ View Invoice</button>
            <a href="${doc.download_url}" target="_blank" class="btn btn-secondary" style="text-decoration: none; font-size: 0.75rem; padding: 6px 10px;" title="Download PDF">⬇️</a>
          </div>
        `;
        card.querySelector(".btn-open-doc").addEventListener("click", () => this.openPdfModal(doc.id, doc.preview_url, doc.download_url));
        this.el.invoicesGrid.appendChild(card);
      });
    } catch (e) {
      console.error(e);
    }
  }

  openPdfModal(id, previewUrl, downloadUrl = "#") {
    if (!this.el.modalBackdrop) return;
    this.el.modalTitle.textContent = `Invoice Preview: ${id}`;
    this.el.modalDownloadBtn.href = downloadUrl || previewUrl;
    this.el.modalIframe.src = previewUrl;
    this.el.modalBackdrop.style.display = "flex";
  }

  closePdfModal() {
    if (!this.el.modalBackdrop) return;
    this.el.modalBackdrop.style.display = "none";
    this.el.modalIframe.src = "about:blank";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new CustomerPortalApp();
});
