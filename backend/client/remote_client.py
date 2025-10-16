import asyncio
import websockets
import json
import tkinter as tk
from tkinter import ttk
import socket
import platform
import requests

class RemoteDesktopClient:
    def __init__(self, api_url, auth_token):
        self.api_url = api_url
        self.auth_token = auth_token
        self.websocket = None
        self.pc_id = None
        
    async def connect_as_host(self):
        """Подключение как хост (управляемый ПК)"""
        try:
            ws_url = f"ws://{self.api_url}/remote/host?token={self.auth_token}"
            self.websocket = await websockets.connect(ws_url)
            
            # Регистрация завершена через WebSocket
            print("Connected as host")
            
            # Обработка входящих команд
            async for message in self.websocket:
                data = json.loads(message)
                await self.handle_host_command(data)
                
        except Exception as e:
            print(f"Host connection error: {e}")
            
    async def connect_as_viewer(self, target_pc_id):
        """Подключение как viewer (управляющий)"""
        try:
            ws_url = f"ws://{self.api_url}/remote/viewer?token={self.auth_token}"
            self.websocket = await websockets.connect(ws_url)
            
            # Создание сессии
            await self.websocket.send(json.dumps({
                "type": "create_session",
                "target_pc_id": target_pc_id,
                "session_type": "control"
            }))
            
            async for message in self.websocket:
                data = json.loads(message)
                await self.handle_viewer_message(data)
                
        except Exception as e:
            print(f"Viewer connection error: {e}")
            
    async def handle_host_command(self, data):
        """Обработка команд на стороне хоста"""
        if data.get("type") == "remote_command":
            command = data.get("command", {})
            cmd_type = command.get("type")
            
            if cmd_type == "mouse":
                # Обработка движения мыши
                x, y = command.get("x"), command.get("y")
                print(f"Mouse move to: {x}, {y}")
                
            elif cmd_type == "keyboard":
                # Обработка клавиатуры
                key = command.get("key")
                print(f"Key pressed: {key}")
                
    async def handle_viewer_message(self, data):
        """Обработка сообщений на стороне viewer"""
        if data.get("type") == "session_created":
            print(f"Session created: {data.get('session_id')}")
            
        elif data.get("type") == "screen_data":
            # Получение данных экрана
            screen_data = data.get("data")
            # Отображение экрана...
            
    async def send_mouse_command(self, session_id, x, y, action="move"):
        """Отправка команды мыши"""
        if self.websocket:
            await self.websocket.send(json.dumps({
                "type": "remote_command",
                "session_id": session_id,
                "command": {
                    "type": "mouse",
                    "x": x,
                    "y": y,
                    "action": action
                }
            }))
            
    async def send_keyboard_command(self, session_id, key):
        """Отправка команды клавиатуры"""
        if self.websocket:
            await self.websocket.send(json.dumps({
                "type": "remote_command", 
                "session_id": session_id,
                "command": {
                    "type": "keyboard",
                    "key": key
                }
            }))

def get_system_info():
    """Получение информации о системе"""
    return {
        "hostname": socket.gethostname(),
        "platform": platform.platform(),
        "processor": platform.processor()
    }

# Пример использования
async def main():
    client = RemoteDesktopClient("localhost:8000", "your_jwt_token_here")
    
    # Режим хоста
    # await client.connect_as_host()
    
    # Режим viewer
    # await client.connect_as_viewer("target_pc_id")

if __name__ == "__main__":
    asyncio.run(main())