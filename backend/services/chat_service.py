from typing import Dict, List
from fastapi import WebSocket
from collections import defaultdict
import asyncio
from models.chat_models import Channel, Message

class ChatService:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = defaultdict(list)
        self.channels: Dict[str, Channel] = {}
        self.messages: Dict[str, List[Message]] = defaultdict(list)
        self.lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, channel_id: str, username: str):
        await websocket.accept()
        async with self.lock:
            self.active_connections[channel_id].append(websocket)
        
        # Send channel history
        if channel_id in self.messages:
            last_messages = self.messages[channel_id][-10:]
            for message in last_messages:
                await websocket.send_json(message.dict())

    async def disconnect(self, websocket: WebSocket, channel_id: str, username: str):
        async with self.lock:
            if websocket in self.active_connections[channel_id]:
                self.active_connections[channel_id].remove(websocket)

    async def broadcast(self, channel_id: str, message: Message):
        if channel_id not in self.active_connections:
            return
            
        for connection in self.active_connections[channel_id]:
            try:
                await connection.send_json(message.dict())
            except Exception as e:
                print(f"Error broadcasting message: {e}")
                await self.disconnect(connection, channel_id, message.sender)

    async def create_channel(self, channel: Channel):
        async with self.lock:
            self.channels[channel.id] = channel
        return channel

    async def get_user_channels(self, username: str) -> List[Channel]:
        return [channel for channel in self.channels.values() 
                if not channel.is_private or username in channel.members]

    async def can_access_channel(self, username: str, channel_id: str) -> bool:
        if channel_id not in self.channels:
            return False
        return not self.channels[channel_id].is_private or username in self.channels[channel_id].members

    async def save_message(self, message: Message):
        async with self.lock:
            self.messages[message.channel_id].append(message)

    async def get_channel_messages(self, channel_id: str, limit: int, offset: int) -> List[Message]:
        if channel_id not in self.messages:
            return []
        return self.messages[channel_id][offset:offset+limit]