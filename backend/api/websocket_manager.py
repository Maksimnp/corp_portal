from fastapi import WebSocket
import logging

logger = logging.getLogger(__name__)

class WebSocketManager:
    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
        logger.info(f"WebSocket connected for user {user_id}")

    def disconnect(self, websocket: WebSocket, user_id: str):
        if user_id in self.active_connections:
            self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
            logger.info(f"WebSocket disconnected for user {user_id}")

    async def send_notification(self, user_id: str, notification: dict):
        if user_id in self.active_connections:
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_json(notification)
                except Exception as e:
                    logger.error(f"Error sending notification to {user_id}: {e}")
                    self.active_connections[user_id].remove(connection)

    async def broadcast_notification(self, notification: dict, roles: list[str] = None):
        for user_id, connections in self.active_connections.items():
            user_role = user_id.split(":")[1] if ":" in user_id else "user"
            if roles is None or user_role in roles:
                for connection in connections:
                    try:
                        await connection.send_json(notification)
                    except Exception as e:
                        logger.error(f"Error broadcasting to {user_id}: {e}")
                        connections.remove(connection)
    
websocket_manager = WebSocketManager()