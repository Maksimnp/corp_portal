from fastapi import WebSocket
from typing import Dict, List, Optional
import logging

logger = logging.getLogger(__name__)

class WebSocketManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
        logger.info(f"WebSocket подключён для {user_id}")

    def disconnect(self, websocket: WebSocket, user_id: str):
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
            logger.info(f"WebSocket отключён для {user_id}")

    async def send_notification(self, user_id: str, notification: dict):
        if user_id not in self.active_connections:
            return
        dead_conns: List[WebSocket] = []
        for conn in self.active_connections[user_id]:
            try:
                await conn.send_json(notification)
            except Exception as e:
                logger.error(f"Ошибка отправки {user_id}: {e}")
                dead_conns.append(conn)
        for dead in dead_conns:
            self.active_connections[user_id].remove(dead)
        if not self.active_connections[user_id]:
            del self.active_connections[user_id]

    async def broadcast_notification(self, notification: dict, roles: Optional[List[str]] = None):
        dead_keys: List[str] = []
        for user_id, conns in self.active_connections.items():
            user_role = user_id.split(":")[1] if ":" in user_id else "user"
            if roles is None or user_role in roles:
                dead_conns: List[WebSocket] = []
                for conn in conns:
                    try:
                        await conn.send_json(notification)
                    except Exception as e:
                        logger.error(f"Ошибка broadcast {user_id}: {e}")
                        dead_conns.append(conn)
                for dead in dead_conns:
                    conns.remove(dead)
                if not conns:
                    dead_keys.append(user_id)
        for key in dead_keys:
            del self.active_connections[key]

websocket_manager = WebSocketManager()