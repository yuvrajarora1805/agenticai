"""
Google Gemini LLM Integration Engine for WareSync AI.
Supports conversational order bot reasoning, discount negotiation, and CrewAI assistance.
Uses official google-genai / HTTP REST fallback so it works reliably in any environment.
"""

import os
import json
import time
import urllib.request
import urllib.error
from typing import Optional, Dict, Any, List
from dotenv import load_dotenv

# Ensure .env is loaded
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
PRIMARY_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
FALLBACK_MODELS = [PRIMARY_MODEL, "gemini-3.1-flash-lite-preview", "gemini-3.5-flash-lite"]


def call_gemini_api(prompt: str, system_instruction: Optional[str] = None) -> Optional[str]:
    """
    Direct HTTPS REST invocation to Google Gemini API (v1beta) using standard library.
    Features automatic model failover and retry on rate limits (429/503).
    """
    if not GEMINI_API_KEY or (len(GEMINI_API_KEY) < 20):
        return None

    contents = []
    if system_instruction:
        contents.append({
            "role": "user",
            "parts": [{"text": f"SYSTEM INSTRUCTIONS:\n{system_instruction}\n\nUSER PROMPT:\n{prompt}"}]
        })
    else:
        contents.append({
            "role": "user",
            "parts": [{"text": prompt}]
        })

    payload = {
        "contents": contents,
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 1024,
        }
    }

    for model in FALLBACK_MODELS:
        model_name = model.replace("models/", "")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={GEMINI_API_KEY}"
        for attempt in range(2):
            try:
                req = urllib.request.Request(
                    url,
                    data=json.dumps(payload).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                    method="POST"
                )
                with urllib.request.urlopen(req, timeout=5) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    candidates = data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if parts:
                            return parts[0].get("text", "").strip()
            except urllib.error.HTTPError as e:
                if e.code in (429, 503):
                    # If model quota exhausted, switch to next fallback model immediately
                    break
                print(f"Gemini API request note ({model_name}): {e}")
                break
            except Exception as e:
                print(f"Gemini API request note ({model_name}): {e}")
                break
                print(f"Gemini API request note: {e}")
                break

    return None


def generate_order_bot_response(
    sku: Optional[str] = None,
    item_name: Optional[str] = None,
    requested_qty: int = 0,
    available_qty: int = 0,
    unit_price: float = 0.0,
    subtotal: float = 0.0,
    total_with_tax: float = 0.0,
    user_note: Optional[str] = None,
    all_products: Optional[List[Dict[str, Any]]] = None,
    chat_history: Optional[List[Dict[str, str]]] = None
) -> str:
    """
    Uses Gemini LLM to answer customer questions accurately with full catalog awareness and multi-turn chat continuation.
    If sku is provided, handles active order calculations.
    If no sku is selected, acts as general sales assistant answering catalog/inventory questions.
    """
    catalog_summary = ""
    if all_products:
        catalog_summary = "CURRENT LIVE WAREHOUSE CATALOG & INVENTORY:\n"
        for p in all_products:
            catalog_summary += f"- {p.get('name')} (SKU: {p.get('sku')}): ${p.get('unit_price', 0):.2f}/unit | {p.get('available_qty', 0)} in stock.\n"

    # Multi-turn conversational memory summary
    history_summary = ""
    if chat_history and len(chat_history) > 0:
        history_summary = "\nRECENT CONVERSATION CONTEXT:\n"
        # Take the last 6 messages to keep context fresh without exceeding limits
        for turn in chat_history[-6:]:
            role = "Customer" if turn.get("role") == "user" else "Assistant"
            text = turn.get("text", "").replace("✨ [Gemini AI Assistant]:", "").strip()
            history_summary += f"{role}: {text}\n"

    system_prompt = (
        "You are WareSync AI's B2B Order Assistant. Be polite, helpful, and professional. "
        "Maintain conversational continuity across turns. If the customer responds to a previous question (e.g. saying 'yes', 'tell me more', or referring to an item previously discussed), "
        "understand the dialogue context and respond coherently rather than treating it like a brand-new generic session. "
        "Provide complete, informative, and well-rounded answers without cutting off mid-sentence. "
        "You have full visibility into the warehouse catalog and stock. If the customer asks questions about product specs, "
        "how items work, stock availability, pricing, or recommendations, answer thoroughly using the live catalog facts. "
        "Strictly adhere to the provided prices, quantities, and dollar totals (with 18% GST) without inventing prices. "
        "If the user asks questions unrelated to warehouse products, logistics, or ordering (such as programming, code, or off-topic tasks), "
        "politely explain that you are specialized in warehouse operations and inventory orders, and gently guide them back to your available products."
    )

    if sku and item_name:
        user_prompt = (
            f"{catalog_summary}\n"
            f"{history_summary}\n"
            f"Active item selected: {requested_qty} units of '{item_name}' (SKU: {sku})\n"
            f"- Currently available: {available_qty} units\n"
            f"- Unit price: ${unit_price:,.2f}\n"
            f"- Subtotal: ${subtotal:,.2f}\n"
            f"- Total (including 18% GST): ${total_with_tax:,.2f}\n"
            f"- Current Customer message: \"{user_note or 'I want to place an order'}\"\n\n"
            "Reply directly taking into account the conversation context. If they are confirming or inquiring about the order, "
            "explain availability, state the exact total, and invite them to confirm."
        )
    else:
        user_prompt = (
            f"{catalog_summary}\n"
            f"{history_summary}\n"
            f"No specific item currently locked for checkout.\n"
            f"Current Customer message: \"{user_note or 'Hello! What products do you have available?'}\"\n\n"
            "Respond naturally to the customer's message taking into account what was previously discussed in the conversation. "
            "If they answered 'yes' or follow up on a prior topic, fulfill that request directly."
        )

    ai_reply = call_gemini_api(user_prompt, system_instruction=system_prompt)
    if ai_reply:
        clean_reply = ai_reply.strip('"\n ')
        return f"✨ [Gemini AI Assistant]: {clean_reply}"

    # Deterministic fallback if API is unreachable
    if sku and item_name:
        if requested_qty == 0:
            return (
                f"✨ [Gemini AI Assistant]: We have {available_qty} units of '{item_name}' ({sku}) in stock at ${unit_price:,.2f} per unit (+18% GST). "
                f"How many units would you like to order today?"
            )
        elif available_qty >= requested_qty:
            return (
                f"Great news! We have all {requested_qty} units of '{item_name}' ({sku}) ready for dispatch. "
                f"The total amount is ${total_with_tax:,.2f} (including 18% GST). Would you like to confirm and place this order?"
            )
        elif available_qty > 0:
            deficit = requested_qty - available_qty
            partial_subtotal = round(available_qty * unit_price * 1.18, 2)
            return (
                f"We have {available_qty} units of '{item_name}' ({sku}) ready for immediate dispatch (${partial_subtotal:,.2f}), "
                f"with {deficit} units currently on backorder. You can confirm immediate dispatch, and our automated procurement system will restock the rest."
            )
        else:
            return (
                f"Notice: SKU '{sku}' is currently fully committed. Placing an order will automatically trigger an expedited "
                f"bulk replenishment purchase order to the factory."
            )
    else:
        items_str = ", ".join([f"{p.get('name')} (${p.get('unit_price'):.2f})" for p in (all_products or [])])
        return f"Hello! We currently carry: {items_str}. Select any item from the catalog to check immediate dispatch."
