"""
Microservices Fleet Registry & Fault Tolerance Outage Simulator.
Manages the health status and simulated downtime/circuit-breaking of all 11 microservices.
"""

from typing import List, Dict, Any

_MICROSERVICES_FLEET: List[Dict[str, Any]] = [
    {
        "id": "ms-blackboard",
        "name": "Hover Blackboard State Engine",
        "type": "Shared Memory Engine",
        "framework": "Core Architecture",
        "status": "ACTIVE",
        "port": 8000,
        "endpoints": ["/api/state", "/api/reset", "/ws/stream"],
    },
    {
        "id": "ms-adk-inventory",
        "name": "Inventory Custodian Agent",
        "type": "Autonomous Agent",
        "framework": "Google ADK",
        "status": "ACTIVE",
        "tools": ["db_check_inventory", "db_reserve_inventory"],
    },
    {
        "id": "ms-adk-invoice",
        "name": "Invoice Auditor Agent",
        "type": "Autonomous Agent",
        "framework": "Google ADK",
        "status": "ACTIVE",
        "tools": ["parse_and_audit_invoice"],
    },
    {
        "id": "ms-crewai-supervisor",
        "name": "Supervisor Orchestrator Agent",
        "type": "Multi-Agent Coordinator",
        "framework": "CrewAI",
        "status": "ACTIVE",
        "role": "Planning & Delegation",
    },
    {
        "id": "ms-crewai-procurement",
        "name": "Procurement Reorder Agent",
        "type": "Autonomous Agent",
        "framework": "CrewAI",
        "status": "ACTIVE",
        "tools": ["calculate_procurement_quote"],
    },
    {
        "id": "ms-crewai-dispatch",
        "name": "Dispatch & Packing Agent",
        "type": "Autonomous Agent",
        "framework": "CrewAI",
        "status": "ACTIVE",
        "tools": ["fulfill_and_dispatch"],
    },
    {
        "id": "ms-mcp-server",
        "name": "Warehouse FastMCP Server",
        "type": "Model Context Protocol Tool Server",
        "framework": "FastMCP / stdio / REST",
        "status": "ACTIVE",
        "tools": ["db_check_inventory", "parse_and_audit_invoice", "calculate_procurement_quote"],
    },
    {
        "id": "ms-a2a-bridge",
        "name": "A2A Cross-Framework Router",
        "type": "Inter-Agent Protocol Bus",
        "framework": "A2A Protocol v1.0",
        "status": "ACTIVE",
        "channels": ["ADK -> CrewAI", "CrewAI -> ADK"],
    },
    {
        "id": "ms-pdf-generator",
        "name": "ReportLab Document Intelligence",
        "type": "Cryptographic PDF Engine",
        "framework": "ReportLab + SHA-256",
        "status": "ACTIVE",
        "endpoints": ["/api/invoices/preview/{id}", "/api/invoices/download/{id}"],
    },
    {
        "id": "ms-langfuse-telemetry",
        "name": "Langfuse Observability & Tracing",
        "type": "Distributed Tracing Service",
        "framework": "Langfuse v2",
        "status": "ACTIVE",
        "endpoints": ["/api/traces", "/api/traces/{trace_id}"],
    },
    {
        "id": "ms-customer-portal",
        "name": "B2B Customer Storefront API",
        "type": "Conversational Ordering Microservice",
        "framework": "FastAPI Sub-App",
        "status": "ACTIVE",
        "endpoints": ["/api/customer/inquire", "/api/customer/confirm-and-dispatch", "/api/customer/factory-bulk-restock"],
    },
]


def get_microservices_fleet() -> List[Dict[str, Any]]:
    """Returns the full fleet registry."""
    return _MICROSERVICES_FLEET


def is_service_healthy(service_id: str) -> bool:
    """Check if a microservice is healthy and active."""
    for s in _MICROSERVICES_FLEET:
        if s["id"] == service_id or service_id in s["id"]:
            return s.get("status") == "ACTIVE"
    return True


def toggle_microservice(service_id: str) -> Dict[str, Any]:
    """Toggle a microservice between ACTIVE and DOWN to simulate outages."""
    for s in _MICROSERVICES_FLEET:
        if s["id"] == service_id:
            curr = s.get("status", "ACTIVE")
            s["status"] = "DOWN" if curr == "ACTIVE" else "ACTIVE"
            return s
    return {"id": service_id, "status": "UNKNOWN", "error": "Service not found"}


def reset_microservices_fleet() -> List[Dict[str, Any]]:
    """Restores all microservices to ACTIVE."""
    for s in _MICROSERVICES_FLEET:
        s["status"] = "ACTIVE"
    return _MICROSERVICES_FLEET
