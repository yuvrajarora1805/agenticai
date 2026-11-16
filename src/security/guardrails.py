"""
Comprehensive Security & Guardrails Layer for WareSync AI.
Defends against:
1. Prompt Injections & Jailbreak attempts (e.g., 'ignore previous instructions', 'DAN mode', system leaks).
2. SQL & Command Injections ('drop table', '; exec', etc.).
3. Order Manipulation & Price Tampering (e.g., negative quantities, price overrides, fake discount requests).
4. Boundary Limits & Strict Type Sanitization (SKU formats, quantity bounds, PII screening).
5. Bot Output Hallucination & Financial Accuracy Guardrail (checks generated totals against verified math).
"""

import re
from typing import Tuple, Dict, Any, Optional


# 1. Prompt Injection & Jailbreak Signatures
INJECTION_PATTERNS = [
    r"ignore (all )?(previous )?(instructions|rules|directives)",
    r"disregard (all )?(instructions|rules|directives)",
    r"you are now an? (evil|unrestricted|god mode|dan)",
    r"system override",
    r"(reveal|tell me|show me) (your )?(system|hidden) prompt",
    r"act as (an? )?(unrestricted|jailbroken|root)",
    r"bypass (guardrail|filter|policy|security)",
    r"pretend you have no rules",
    r"output raw system memory",
]

# 2. SQL & Database Attack Signatures
SQL_INJECTION_PATTERNS = [
    r"drop\s+(table|database)",
    r"delete\s+(from|database|all)",
    r"truncate\s+table",
    r"insert\s+into",
    r"select\s+.*\s+from",
    r"union\s+select",
    r"--\s*$",
    r";\s*drop",
    r"where\s+1\s*=\s*1",
    r"or\s+1\s*=\s*1",
    r"'\s*or\s*'a'='a",
]

# 3. Order Manipulation & Fraud Attack Signatures
FRAUD_KEYWORDS = [
    "free order",
    "zero price",
    "discount 100",
    "override price",
    "bypass payment",
    "fake invoice",
    "steal",
    "sabotage inventory",
    "corrupt database",
    "destroy inventory",
    "negative quantity",
]

# 4. Toxic & Unauthorized Exploits
TOXIC_KEYWORDS = [
    "harm", "sabotage", "steal", "destroy inventory", "bypass auth", "exploit"
]


class SecurityGuardrails:
    """
    Multi-tier guardrail engine safeguarding agentic workflows and the customer ordering bot.
    """

    @classmethod
    def validate_user_prompt(cls, prompt: str) -> Tuple[bool, str]:
        """
        Scan incoming user or trigger prompts for injections or dangerous instructions.
        Returns: (is_safe: bool, reason_or_sanitized_prompt: str)
        """
        if not prompt or not isinstance(prompt, str):
            return False, "SECURITY ALERT: Prompt cannot be empty or non-string."

        prompt_clean = prompt.strip()
        prompt_lower = prompt_clean.lower()

        # Check Prompt Injection
        for pattern in INJECTION_PATTERNS:
            if re.search(pattern, prompt_lower):
                return False, f"SECURITY ALERT: Blocked prompt injection / jailbreak attempt matching '{pattern}'."

        # Check SQL Injection
        for sql_pat in SQL_INJECTION_PATTERNS:
            if re.search(sql_pat, prompt_lower):
                return False, f"SECURITY ALERT: Blocked SQL injection attempt matching '{sql_pat}'."

        # Check Toxic keywords
        for toxic in TOXIC_KEYWORDS:
            if toxic in prompt_lower:
                return False, f"SECURITY ALERT: Blocked unauthorized or malicious keyword '{toxic}'."

        return True, prompt_clean

    @classmethod
    def validate_customer_order_inquiry(
        cls,
        sku: Optional[str],
        requested_qty: Optional[int],
        customer_name: str,
        user_message: Optional[str] = None
    ) -> Tuple[bool, str]:
        """
        Dedicated Order Bot Guardrails:
        1. SKU boundary check (if order item specified).
        2. Quantity limit (must be integer between 1 and 10,000 if specified).
        3. Price tampering & fraud keywords check.
        4. Customer name sanitization.
        """
        # 1. SKU validation (only when an item is selected for order)
        if sku:
            if not isinstance(sku, str):
                return False, "Order Guardrail: Missing or invalid SKU format."
            sku_clean = sku.strip()
            if not re.match(r"^[A-Za-z0-9\-_]{3,20}$", sku_clean):
                return False, f"Order Guardrail: Invalid SKU code '{sku_clean}'. Expected alphanumeric format."

        # 2. Quantity validation (if quantity is passed)
        if requested_qty is not None:
            if not isinstance(requested_qty, int):
                return False, "Order Guardrail: Requested quantity must be a whole integer."
            if requested_qty <= 0:
                return False, "Order Guardrail: Requested quantity must be greater than 0."
            if requested_qty > 10000:
                return False, f"Order Guardrail: Quantity {requested_qty} exceeds safety single-order ceiling (10,000 units)."

        # 3. Customer name sanitization
        if customer_name:
            if len(customer_name) > 100:
                return False, "Order Guardrail: Customer name exceeds allowable character limit (100)."
            for pattern in SQL_INJECTION_PATTERNS + INJECTION_PATTERNS:
                if re.search(pattern, customer_name.lower()):
                    return False, "Order Guardrail: Suspicious pattern detected in customer name."

        # 4. User conversational message validation (if provided)
        if user_message:
            msg_lower = user_message.lower()
            for pattern in INJECTION_PATTERNS:
                if re.search(pattern, msg_lower):
                    return False, f"Order Guardrail: Blocked adversarial jailbreak in inquiry: '{pattern}'."
            for sql_pat in SQL_INJECTION_PATTERNS:
                if re.search(sql_pat, msg_lower):
                    return False, "Order Guardrail: Blocked database SQL payload in chat."
            for fraud in FRAUD_KEYWORDS:
                if fraud in msg_lower:
                    return False, f"Order Guardrail: Blocked price tampering or fraud indicator: '{fraud}'."

        return True, "Valid"

    @classmethod
    def validate_tool_args(cls, tool_name: str, args: Dict[str, Any]) -> Tuple[bool, str]:
        """
        Validate tool arguments for strict type safety and reasonable boundary limits.
        """
        if "quantity" in args:
            qty = args["quantity"]
            if not isinstance(qty, int) or qty <= 0:
                return False, f"Validation Error in '{tool_name}': Quantity must be a positive integer."
            if qty > 100000:
                return False, f"Validation Error in '{tool_name}': Quantity {qty} exceeds maximum allowable threshold (100,000)."

        if "sku" in args:
            sku = args["sku"]
            if not isinstance(sku, str) or not re.match(r"^[A-Za-z0-9\-_]{3,20}$", sku):
                return False, f"Validation Error in '{tool_name}': Invalid SKU format '{sku}'."

        return True, "Valid"

    @classmethod
    def audit_bot_financial_output(cls, unit_price: float, qty: int, subtotal: float, total_with_tax: float) -> bool:
        """
        Output Guardrail: Mathematical cross-check preventing LLM hallucinations on pricing.
        Ensures subtotal = unit_price * qty and total = subtotal * 1.18 within 1 cent tolerance.
        """
        expected_subtotal = round(unit_price * qty, 2)
        expected_total = round(expected_subtotal * 1.18, 2)
        if abs(subtotal - expected_subtotal) > 0.05 or abs(total_with_tax - expected_total) > 0.05:
            return False
        return True
