# backend/services/chat_service.py
from fastapi import WebSocket
from starlette.websockets import WebSocketState
from typing import Dict, List
import logging

logger = logging.getLogger(__name__)


class ChatService:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self.default_channels = ['general']

    async def connect(self, websocket: WebSocket, identifier: str, username: str):
        if identifier not in self.active_connections:
            self.active_connections[identifier] = []
        self.active_connections[identifier] = [
            conn for conn in self.active_connections[identifier]
            if conn.client_state == WebSocketState.CONNECTED
        ]
        self.active_connections[identifier].append(websocket)

    async def disconnect(self, websocket: WebSocket, identifier: str):
        if identifier in self.active_connections:
            if websocket in self.active_connections[identifier]:
                self.active_connections[identifier].remove(websocket)

    async def broadcast(self, identifier: str, message: dict):
        if identifier in self.active_connections:
            for conn in self.active_connections[identifier]:
                try:
                    if conn.client_state == WebSocketState.CONNECTED:
                        await conn.send_json(message)
                except Exception:
                    if conn in self.active_connections[identifier]:
                        self.active_connections[identifier].remove(conn)

    def get_channels(self) -> List[str]:
        channels = set(self.active_connections.keys())
        channels.update(self.default_channels)
        return sorted(list(channels))


chat_service = ChatService()