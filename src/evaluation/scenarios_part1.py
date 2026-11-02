"""
Scenarios Part 1: Normal Fulfillment (TC-01 to TC-08) and Shortage & Procurement (TC-09 to TC-18).
"""

SCENARIOS_PART_1 = [
    # --- Category 1: Normal Stock & Order Fulfillment (Scenarios 1 - 8) ---
    {
        "id": "TC-01",
        "category": "Order Fulfillment",
        "title": "Standard Dispatch for Conveyor Belt",
        "prompt": "Dispatch 5 units of SKU-1001 to Logistics Hub North",
        "expected_agent": "DispatchAgent (CrewAI)",
        "expected_status": "DISPATCHED",
        "architecture": "react",
        "persona": "logistics_operator"
    },
    {
        "id": "TC-02",
        "category": "Order Fulfillment",
        "title": "Single Unit Hydraulic Valve Order",
        "prompt": "Fulfill priority order for 1 unit of SKU-1002 to Maintenance Dept",
        "expected_agent": "DispatchAgent (CrewAI)",
        "expected_status": "DISPATCHED",
        "architecture": "few_shot",
        "persona": "logistics_operator"
    },
    {
        "id": "TC-03",
        "category": "Order Fulfillment",
        "title": "Bulk Barcode Scanner Dispatch",
        "prompt": "Ship 25 units of SKU-1003 to Regional Distribution Center",
        "expected_agent": "DispatchAgent (CrewAI)",
        "expected_status": "DISPATCHED",
        "architecture": "react",
        "persona": "logistics_operator"
    },
    {
        "id": "TC-04",
        "category": "Order Fulfillment",
        "title": "Routine Inventory Check SKU-1001",
        "prompt": "Check current available and reserved inventory for SKU-1001",
        "expected_agent": "InventoryAgent (ADK)",
        "expected_status": "COMPLETED",
        "architecture": "few_shot",
        "persona": "logistics_operator"
    },
    {
        "id": "TC-05",
        "category": "Order Fulfillment",
        "title": "Multi-unit Scanner Allocation",
        "prompt": "Allocate 10 units of SKU-1003 for outbound truck #402",
        "expected_agent": "DispatchAgent (CrewAI)",
        "expected_status": "DISPATCHED",
        "architecture": "react",
        "persona": "logistics_operator"
    },
    {
        "id": "TC-06",
        "category": "Order Fulfillment",
        "title": "Stock Verification for Valve SKU-1002",
        "prompt": "Verify current stock and safety buffer for SKU-1002",
        "expected_agent": "InventoryAgent (ADK)",
        "expected_status": "COMPLETED",
        "architecture": "react",
        "persona": "auditor"
    },
    {
        "id": "TC-07",
        "category": "Order Fulfillment",
        "title": "Standard Order with Delivery Tracking",
        "prompt": "Dispatch 8 units of SKU-1001 with expedited carrier tracking",
        "expected_agent": "DispatchAgent (CrewAI)",
        "expected_status": "DISPATCHED",
        "architecture": "few_shot",
        "persona": "logistics_operator"
    },
    {
        "id": "TC-08",
        "category": "Order Fulfillment",
        "title": "Warehouse Internal Transfer",
        "prompt": "Process stock release for 12 units of SKU-1003 to Zone B",
        "expected_agent": "InventoryAgent (ADK)",
        "expected_status": "COMPLETED",
        "architecture": "react",
        "persona": "logistics_operator"
    },

    # --- Category 2: Stock Shortage, Safety Breach & A2A PO Cascade (Scenarios 9 - 18) ---
    {
        "id": "TC-09",
        "category": "Shortage & Procurement",
        "title": "Severe Deficit SKU-1002 (Order 20 units)",
        "prompt": "Dispatch urgent order for 20 units of SKU-1002 to Apex Motors",
        "expected_agent": "ProcurementAgent (CrewAI)",
        "expected_status": "PARTIAL / PO_GENERATED",
        "architecture": "react",
        "persona": "logistics_operator"
    },
    {
        "id": "TC-10",
        "category": "Shortage & Procurement",
        "title": "Safety Threshold Breach on Valves",
        "prompt": "Fulfill 6 units of SKU-1002 causing safety stock alert",
        "expected_agent": "ProcurementAgent (CrewAI)",
        "expected_status": "PARTIAL / PO_GENERATED",
        "architecture": "react",
        "persona": "logistics_operator"
    },
    {
        "id": "TC-11",
        "category": "Shortage & Procurement",
        "title": "Conveyor Belt Stock Depletion (Order 50 units)",
        "prompt": "Order 50 units of SKU-1001 for automated assembly line expansion",
        "expected_agent": "ProcurementAgent (CrewAI)",
        "expected_status": "PARTIAL / PO_GENERATED",
        "architecture": "react",
        "persona": "auditor"
    },
    {
        "id": "TC-12",
        "category": "Shortage & Procurement",
        "title": "Emergency Valve Replenishment Request",
        "prompt": "Request immediate supplier replenishment quote for 30 units of SKU-1002",
        "expected_agent": "ProcurementAgent (CrewAI)",
        "expected_status": "PO_GENERATED",
        "architecture": "few_shot",
        "persona": "logistics_operator"
    },
    {
        "id": "TC-13",
        "category": "Shortage & Procurement",
        "title": "Zero-stock Out of Stock Trigger",
        "prompt": "Attempt dispatch for 100 units of SKU-1002 with automatic purchase order trigger",
        "expected_agent": "ProcurementAgent (CrewAI)",
        "expected_status": "PO_GENERATED",
        "architecture": "react",
        "persona": "logistics_operator"
    },
    {
        "id": "TC-14",
        "category": "Shortage & Procurement",
        "title": "A2A Cross-Framework Deficit Handshake",
        "prompt": "Trigger ADK inventory audit on SKU-1002 and auto-delegate shortage to CrewAI Procurement",
        "expected_agent": "ProcurementAgent (CrewAI)",
        "expected_status": "PO_GENERATED",
        "architecture": "react",
        "persona": "auditor"
    },
    {
        "id": "TC-15",
        "category": "Shortage & Procurement",
        "title": "Bulk Scanner Reorder (Order 150 units)",
        "prompt": "Dispatch 150 units of SKU-1003 triggering supplier wholesale quotation",
        "expected_agent": "ProcurementAgent (CrewAI)",
        "expected_status": "PARTIAL / PO_GENERATED",
        "architecture": "react",
        "persona": "logistics_operator"
    },
    {
        "id": "TC-16",
        "category": "Shortage & Procurement",
        "title": "Automated Restock Threshold Check",
        "prompt": "Scan all warehouse items below reorder points and post PO proposals to Blackboard",
        "expected_agent": "ProcurementAgent (CrewAI)",
        "expected_status": "COMPLETED",
        "architecture": "few_shot",
        "persona": "auditor"
    },
    {
        "id": "TC-17",
        "category": "Shortage & Procurement",
        "title": "Split Backorder Handling",
        "prompt": "Process split order for 12 units SKU-1002: ship available and backorder remainder",
        "expected_agent": "DispatchAgent (CrewAI)",
        "expected_status": "PARTIAL",
        "architecture": "react",
        "persona": "logistics_operator"
    },
    {
        "id": "TC-18",
        "category": "Shortage & Procurement",
        "title": "Supplier Lead-Time Evaluation",
        "prompt": "Calculate estimated delivery lead-time and unit cost for 40 units of SKU-1002",
        "expected_agent": "ProcurementAgent (CrewAI)",
        "expected_status": "COMPLETED",
        "architecture": "few_shot",
        "persona": "logistics_operator"
    },
]
