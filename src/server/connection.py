"""
WebSocket Connection Manager for WareSync AI Dashboard.
"""

import json
from typing import List, Dict, Any
from fastapi import WebSocket


class ConnectionManager:
    """Manages active browser WebSocket connections and broadcasts state events."""

    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.loop = None

    def set_loop(self, loop):
        self.loop = loop

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: Dict[str, Any]):
        for connection in list(self.active_connections):
            try:
                await connection.send_text(json.dumps(message, default=str))
            except Exception:
                self.disconnect(connection)

    def threadsafe_broadcast(self, message: Dict[str, Any]):
        if self.loop and self.loop.is_running() and self.active_connections:
            import asyncio
            asyncio.run_coroutine_threadsafe(self.broadcast(message), self.loop)


manager = ConnectionManager()
