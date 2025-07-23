from fastapi import WebSocket
from starlette.websockets import WebSocketState
from typing import Dict, List
import logging

logger = logging.getLogger(__name__)

class ChatService:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {'general': []}  # Инициализация с каналом 'general'
        self.default_channels = ['general']  # Список предопределенных каналов

    async def connect(self, websocket: WebSocket, channel: str, username: str):
        if channel not in self.active_connections:
            self.active_connections[channel] = []
        self.active_connections[channel] = [
            conn for conn in self.active_connections[channel]
            if conn.client_state == WebSocketState.CONNECTED
        ]
        self.active_connections[channel].append(websocket)
        logger.info(f"User {username} connected to channel {channel}. Total connections: {len(self.active_connections[channel])}")
        logger.debug(f"Active channels: {list(self.active_connections.keys())}")

    async def disconnect(self, websocket: WebSocket, channel: str):
        if channel in self.active_connections:
            if websocket in self.active_connections[channel]:
                self.active_connections[channel].remove(websocket)
                logger.info(f"User disconnected from channel {channel}. Remaining connections: {len(self.active_connections[channel])}")
            # Не удаляем канал, даже если он пуст
            logger.debug(f"Active channels after disconnect: {list(self.active_connections.keys())}")

    async def broadcast(self, channel: str, message: str, username: str):
        if channel in self.active_connections:
            connections = self.active_connections[channel][:]  # Копия списка
            for connection in connections:
                try:
                    if connection.client_state == WebSocketState.CONNECTED:
                        await connection.send_text(message)
                        logger.info(f"Sent message to {username} in channel {channel}: {message}")
                    else:
                        logger.warning(f"Removing closed connection for {username} in channel {channel}")
                        self.active_connections[channel].remove(connection)
                except Exception as e:
                    logger.error(f"Error sending message to {username} in channel {channel}: {e}")
                    if connection in self.active_connections[channel]:
                        self.active_connections[channel].remove(connection)
        else:
            logger.warning(f"No active connections for channel {channel}")

    def get_channels(self) -> List[str]:
        channels = list(self.active_connections.keys())
        for default_channel in self.default_channels:
            if default_channel not in channels:
                channels.append(default_channel)
        logger.debug(f"Returning channels: {channels}")
        return channels

chat_service = ChatService()