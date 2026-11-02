"""
Consolidated Scenarios Loader for WareSync AI.
Aggregates modular scenario packs (Part 1 and Part 2) while keeping each file under 250 lines.
"""

from typing import List, Dict, Any
from src.evaluation.scenarios_part1 import SCENARIOS_PART_1
from src.evaluation.scenarios_part2 import SCENARIOS_PART_2

# Unified 42 scenarios list
SCENARIOS: List[Dict[str, Any]] = SCENARIOS_PART_1 + SCENARIOS_PART_2

def get_scenarios_by_category(category: str) -> List[Dict[str, Any]]:
    """Filter scenarios by category or return all if 'ALL'."""
    if category == "ALL":
        return SCENARIOS
    return [s for s in SCENARIOS if s.get("category") == category]
