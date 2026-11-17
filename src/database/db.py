"""
Persistent SQLite Database Engine for WareSync AI.
Stores inventory, orders, purchase orders, and audit logs permanently in data/warehouse.db.
Thread-safe and ACID compliant.
"""

import os
import json
import sqlite3
import threading
from typing import Dict, Any, List, Optional
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "warehouse.db")

_db_lock = threading.RLock()


def get_connection() -> sqlite3.Connection:
    """Returns a SQLite connection with row dict access."""
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False, timeout=15.0)
    conn.row_factory = sqlite3.Row
    return conn


def init_database():
    """Creates tables if they do not exist and seeds initial inventory idempotently."""
    with _db_lock:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            CREATE TABLE IF NOT EXISTS inventory (
                sku TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                available_qty INTEGER NOT NULL,
                reserved_qty INTEGER NOT NULL DEFAULT 0,
                safety_stock INTEGER NOT NULL DEFAULT 10,
                unit_price REAL NOT NULL,
                reorder_point INTEGER NOT NULL DEFAULT 20,
                last_updated TEXT NOT NULL
            );
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS orders (
                order_id TEXT PRIMARY KEY,
                customer_id TEXT,
                status TEXT NOT NULL,
                sku TEXT,
                quantity INTEGER,
                tracking_number TEXT,
                details_json TEXT,
                created_at TEXT NOT NULL
            );
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS purchase_orders (
                po_id TEXT PRIMARY KEY,
                supplier_id TEXT,
                supplier_name TEXT,
                sku TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                unit_cost REAL NOT NULL,
                total_cost REAL NOT NULL,
                status TEXT NOT NULL DEFAULT 'COMMITTED',
                created_at TEXT NOT NULL
            );
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS invoices (
                invoice_number TEXT PRIMARY KEY,
                po_id TEXT,
                supplier_id TEXT,
                status TEXT NOT NULL,
                total_amount REAL NOT NULL,
                approved_for_payment INTEGER NOT NULL DEFAULT 0,
                discrepancies_json TEXT,
                created_at TEXT NOT NULL
            );
        """)

        # Check if inventory is empty, seed initial stock if so
        cur.execute("SELECT COUNT(*) FROM inventory;")
        count = cur.fetchone()[0]
        if count == 0:
            now = datetime.utcnow().isoformat()
            initial_stocks = [
                ("SKU-1001", "Industrial Conveyor Belt", 45, 10, 15, 250.0, 20, now),
                ("SKU-1002", "Hydraulic Forklift Valve", 8, 4, 10, 45.0, 10, now),
                ("SKU-1003", "Barcode Scanner Unit", 120, 20, 30, 85.0, 40, now),
            ]
            cur.executemany("""
                INSERT INTO inventory (sku, name, available_qty, reserved_qty, safety_stock, unit_price, reorder_point, last_updated)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """, initial_stocks)

        conn.commit()
        conn.close()


def get_all_inventory() -> List[Dict[str, Any]]:
    with _db_lock:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM inventory;")
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return rows


def get_inventory_item(sku: str) -> Optional[Dict[str, Any]]:
    with _db_lock:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT * FROM inventory WHERE sku = ?;", (sku,))
        row = cur.fetchone()
        conn.close()
        return dict(row) if row else None


def update_inventory_item(sku: str, available_qty: int, reserved_qty: int) -> bool:
    with _db_lock:
        conn = get_connection()
        cur = conn.cursor()
        now = datetime.utcnow().isoformat()
        cur.execute("""
            UPDATE inventory 
            SET available_qty = ?, reserved_qty = ?, last_updated = ?
            WHERE sku = ?;
        """, (available_qty, reserved_qty, now, sku))
        conn.commit()
        success = cur.rowcount > 0
        conn.close()
        return success


def reserve_inventory_stock(sku: str, quantity: int) -> bool:
    with _db_lock:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT available_qty, reserved_qty FROM inventory WHERE sku = ?;", (sku,))
        row = cur.fetchone()
        if not row:
            conn.close()
            return False
        avail, res = row["available_qty"], row["reserved_qty"]
        if avail < quantity:
            conn.close()
            return False
        now = datetime.utcnow().isoformat()
        cur.execute("""
            UPDATE inventory 
            SET available_qty = available_qty - ?, reserved_qty = reserved_qty + ?, last_updated = ?
            WHERE sku = ?;
        """, (quantity, quantity, now, sku))
        conn.commit()
        conn.close()
        return True


def restock_inventory_stock(sku: str, quantity: int) -> bool:
    with _db_lock:
        conn = get_connection()
        cur = conn.cursor()
        now = datetime.utcnow().isoformat()
        cur.execute("""
            UPDATE inventory 
            SET available_qty = available_qty + ?, last_updated = ?
            WHERE sku = ?;
        """, (quantity, now, sku))
        conn.commit()
        conn.close()
        return True


def save_customer_order(order_id: str, customer_id: str, status: str, sku: str, quantity: int, tracking_number: str = "", details: Optional[Dict] = None):
    with _db_lock:
        conn = get_connection()
        cur = conn.cursor()
        now = datetime.utcnow().isoformat()
        cur.execute("""
            INSERT OR REPLACE INTO orders (order_id, customer_id, status, sku, quantity, tracking_number, details_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        """, (order_id, customer_id, status, sku, quantity, tracking_number, json.dumps(details or {}), now))
        conn.commit()
        conn.close()


def save_purchase_order(po_id: str, supplier_id: str, supplier_name: str, sku: str, quantity: int, unit_cost: float, total_cost: float):
    with _db_lock:
        conn = get_connection()
        cur = conn.cursor()
        now = datetime.utcnow().isoformat()
        cur.execute("""
            INSERT OR REPLACE INTO purchase_orders (po_id, supplier_id, supplier_name, sku, quantity, unit_cost, total_cost, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        """, (po_id, supplier_id, supplier_name, sku, quantity, unit_cost, total_cost, now))
        conn.commit()
        conn.close()


def save_invoice_audit(invoice_number: str, po_id: str, supplier_id: str, status: str, total_amount: float, approved: bool, discrepancies: Optional[List] = None):
    with _db_lock:
        conn = get_connection()
        cur = conn.cursor()
        now = datetime.utcnow().isoformat()
        cur.execute("""
            INSERT OR REPLACE INTO invoices (invoice_number, po_id, supplier_id, status, total_amount, approved_for_payment, discrepancies_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
        """, (invoice_number, po_id, supplier_id, status, total_amount, 1 if approved else 0, json.dumps(discrepancies or []), now))
        conn.commit()
        conn.close()


def reset_database():
    """Wipes and re-initializes baseline records."""
    with _db_lock:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("DROP TABLE IF EXISTS inventory;")
        cur.execute("DROP TABLE IF EXISTS orders;")
        cur.execute("DROP TABLE IF EXISTS purchase_orders;")
        cur.execute("DROP TABLE IF EXISTS invoices;")
        conn.commit()
        conn.close()
        init_database()


# Auto-initialize database tables and data on module load
init_database()
