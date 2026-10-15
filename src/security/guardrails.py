"""
Security & Guardrails Layer for WareSync AI (Requirement #8).
Validates user inputs, intercepts prompt injection attempts, toxic instructions,
and ensures tool argument safety.
"""

import re
from typing import Tuple, Dict, Any


# Common prompt injection patterns and toxic commands
INJECTION_PATTERNS = [
    r"ignore (all )?previous instructions",
    r"disregard all instructions",
    r"you are now an? (evil|unrestricted|god mode)",
    r"drop table",
    r"delete from",
    r"--\s*$",
    r"system override",
    r"reveal (system|hidden) prompt",
]

TOXIC_KEYWORDS = [
    "harm", "sabotage", "steal", "destroy inventory", "bypass auth", "exploit"
]


class SecurityGuardrails:
    """
    Guardrails engine protecting the agentic system.
    """

    @classmethod
    def validate_user_prompt(cls, prompt: str) -> Tuple[bool, str]:
        """
        Scan incoming user or trigger prompts for injections or dangerous instructions.
        Returns: (is_safe: bool, reason_or_sanitized_prompt: str)
        """
        prompt_lower = prompt.lower()

        # 1. Prompt Injection Detection
        for pattern in INJECTION_PATTERNS:
            if re.search(pattern, prompt_lower):
                return False, f"SECURITY ALERT: Blocked suspected prompt injection pattern '{pattern}'"

        # 2. Harmful Intent / Sabotage Detection
        for toxic in TOXIC_KEYWORDS:
            if toxic in prompt_lower:
                return False, f"SECURITY ALERT: Blocked harmful or unauthorized keyword '{toxic}'"

        # 3. Clean prompt
        sanitized = prompt.strip()
        return True, sanitized

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
