# api/chat.py
import json
import logging
from datetime import datetime
from typing import List, Dict, Optional
import asyncpg
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from api.auth import get_current_user_ws, get_current_user # Для WebSockets и обычных запросов
from api.contacts import search_ad_users # Для поиска пользователей в AD

logger = logging.getLogger(__name__)

# --- Модели ---
class MessageCreate(BaseModel):
    channel_id: int
    text: str

class ChannelCreate(BaseModel):
    name: str
    members: List[str] # Список sAMAccountName

class Channel(BaseModel):
    id: int
    name: str
    created_at: datetime

class Message(BaseModel):
    id: int
    channel_id: int
    username: str # sAMAccountName отправителя
    display_name: str # Отображаемое имя отправителя
    text: str
    timestamp: datetime

# --- Соединение с БД ---
async def get_db_pool():
    # Предполагается, что вы настроили подключение к Postgres
    # В идеале, пул должен быть создан один раз при запуске приложения
    # Здесь мы создаем его временно для демонстрации
    pool = await asyncpg.create_pool(
        host=os.getenv("DB_HOST"),
        database=os.getenv("DB_DATABASE"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        min_size=1,
        max_size=10
    )
    return pool

# --- Менеджер подключений WebSocket ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {} # sAMAccountName -> список соединений

    async def connect(self, websocket: WebSocket, user_id: str): # user_id это sAMAccountName
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
        logger.info(f"User {user_id} connected. Total connections for user: {len(self.active_connections[user_id])}")

    def disconnect(self, websocket: WebSocket, user_id: str):
        if user_id in self.active_connections:
            self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        logger.info(f"User {user_id} disconnected.")

    async def send_personal_message(self, message: str, user_id: str):
        if user_id in self.active_connections:
            for connection in self.active_connections[user_id]:
                if connection.client_state == WebSocketState.CONNECTED:
                    await connection.send_text(message)

    async def broadcast(self, message: str, exclude_user: Optional[str] = None):
        # В реальном приложении, вы бы транслировали только в нужный канал
        # Пока просто для демонстрации
        for user_id, connections in self.active_connections.items():
            if user_id == exclude_user:
                continue
            for connection in connections:
                 if connection.client_state == WebSocketState.CONNECTED:
                    await connection.send_text(message)

    async def disconnect_all(self):
        for connections in self.active_connections.values():
            for connection in connections:
                await connection.close()
        self.active_connections.clear()

manager = ConnectionManager()

# --- Роутер ---
chat_router = APIRouter(prefix="/chat", tags=["chat"])

# --- Эндпоинты ---

# Получение списка пользователей из AD для создания чата
@chat_router.get("/users")
async def get_users_for_chat(query: str = "", current_user: dict = Depends(get_current_user)):
    try:
        # Используем существующую функцию из contacts.py
        users = search_ad_users(search_term=query, limit=50)
        # Фильтруем, чтобы не показывать текущего пользователя
        filtered_users = [u for u in users if u.id != current_user["username"]]
        return filtered_users
    except Exception as e:
        logger.error(f"Error fetching users for chat: {e}")
        raise HTTPException(status_code=500, detail="Ошибка получения пользователей")

# Создание нового канала (приватного чата или группы)
@chat_router.post("/channels", response_model=Channel)
async def create_channel(channel: ChannelCreate, current_user: dict = Depends(get_current_user)):
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        try:
            # Создаем канал
            channel_row = await conn.fetchrow(
                "INSERT INTO channels (name, created_by) VALUES ($1, $2) RETURNING id, name, created_at",
                channel.name, current_user["username"]
            )
            new_channel = Channel(id=channel_row['id'], name=channel_row['name'], created_at=channel_row['created_at'])

            # Добавляем членов в канал
            # Проверяем, что текущий пользователь тоже в списке
            members_to_add = list(set(channel.members))
            if current_user["username"] not in members_to_add:
                 members_to_add.append(current_user["username"])

            for member in members_to_add:
                await conn.execute(
                    "INSERT INTO channel_members (channel_id, username) VALUES ($1, $2)",
                    new_channel.id, member
                )
            
            # Отправляем уведомление участникам, если они онлайн
            notification = json.dumps({
                "type": "new_channel",
                "channel": new_channel.dict(),
                "initiator": current_user["username"]
            })
            for member in members_to_add:
                 await manager.send_personal_message(notification, member)

            return new_channel
        except Exception as e:
            logger.error(f"Error creating channel: {e}")
            raise HTTPException(status_code=500, detail="Ошибка создания канала")
        finally:
            await pool.close()

# Получение списка каналов пользователя
@chat_router.get("/channels", response_model=List[Channel])
async def get_user_channels(current_user: dict = Depends(get_current_user)):
     pool = await get_db_pool()
     async with pool.acquire() as conn:
        try:
            rows = await conn.fetch(
                """
                SELECT DISTINCT c.id, c.name, c.created_at
                FROM channels c
                JOIN channel_members cm ON c.id = cm.channel_id
                WHERE cm.username = $1
                ORDER BY c.created_at DESC
                """,
                current_user["username"]
            )
            return [Channel(**row) for row in rows]
        except Exception as e:
             logger.error(f"Error fetching user channels: {e}")
             raise HTTPException(status_code=500, detail="Ошибка получения каналов")
        finally:
             await pool.close()

# Получение сообщений канала
@chat_router.get("/channels/{channel_id}/messages", response_model=List[Message])
async def get_channel_messages(channel_id: int, current_user: dict = Depends(get_current_user)):
     pool = await get_db_pool()
     async with pool.acquire() as conn:
        try:
            # Проверяем, является ли пользователь членом канала
            is_member = await conn.fetchval(
                "SELECT 1 FROM channel_members WHERE channel_id = $1 AND username = $2",
                channel_id, current_user["username"]
            )
            if not is_member:
                 raise HTTPException(status_code=403, detail="Вы не являетесь участником этого канала")

            rows = await conn.fetch(
                """
                SELECT m.id, m.channel_id, m.username, u.displayName as display_name, m.text, m.timestamp
                FROM messages m
                LEFT JOIN (SELECT sAMAccountName, displayName FROM contacts_cache) u ON m.username = u.sAMAccountName -- Предполагаем кэш контактов
                WHERE m.channel_id = $1
                ORDER BY m.timestamp ASC
                """,
                channel_id
            )
            # Если кэш контактов не используется, можно сделать дополнительный запрос к AD для каждого сообщения, но это неэффективно
            # Лучше использовать кэш или передавать sAMAccountName и запрашивать displayName на фронтенде при необходимости
            messages = []
            for row in rows:
                 # Если кэш не дал результат, используем sAMAccountName как fallback
                 display_name = row['display_name'] if row['display_name'] else row['username']
                 messages.append(Message(
                      id=row['id'], channel_id=row['channel_id'], username=row['username'],
                      display_name=display_name, text=row['text'], timestamp=row['timestamp']
                 ))
            return messages
        except HTTPException:
             raise
        except Exception as e:
             logger.error(f"Error fetching channel messages: {e}")
             raise HTTPException(status_code=500, detail="Ошибка получения сообщений")
        finally:
             await pool.close()

# Отправка сообщения
@chat_router.post("/messages", response_model=Message)
async def send_message(message: MessageCreate, current_user: dict = Depends(get_current_user)):
     pool = await get_db_pool()
     async with pool.acquire() as conn:
        try:
            # Проверяем, является ли пользователь членом канала
            is_member = await conn.fetchval(
                "SELECT 1 FROM channel_members WHERE channel_id = $1 AND username = $2",
                message.channel_id, current_user["username"]
            )
            if not is_member:
                 raise HTTPException(status_code=403, detail="Вы не являетесь участником этого канала")

            # Вставляем сообщение
            msg_row = await conn.fetchrow(
                """
                INSERT INTO messages (channel_id, username, text)
                VALUES ($1, $2, $3)
                RETURNING id, channel_id, username, text, timestamp
                """,
                message.channel_id, current_user["username"], message.text
            )

            # Получаем displayName отправителя (из кэша или AD)
            # Для простоты возьмем из кэша, если он есть
            display_name = current_user.get("displayName", current_user["username"]) # Предполагаем, что в токене есть displayName

            new_message = Message(
                 id=msg_row['id'], channel_id=msg_row['channel_id'], username=msg_row['username'],
                 display_name=display_name, text=msg_row['text'], timestamp=msg_row['timestamp']
            )

            # Отправляем сообщение всем участникам канала через WebSocket
            # Получаем список участников канала
            member_rows = await conn.fetch(
                "SELECT username FROM channel_members WHERE channel_id = $1",
                message.channel_id
            )
            members = [row['username'] for row in member_rows]

            message_data = json.dumps({
                "type": "new_message",
                "message": new_message.dict()
            })

            for member in members:
                 await manager.send_personal_message(message_data, member)

            return new_message
        except HTTPException:
             raise
        except Exception as e:
             logger.error(f"Error sending message: {e}")
             raise HTTPException(status_code=500, detail="Ошибка отправки сообщения")
        finally:
             await pool.close()


# --- WebSocket Endpoint ---
@chat_router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # Аутентификация через токен в параметрах URL или cookie (пример с параметром)
    # В реальном приложении используйте более безопасный метод
    token = websocket.query_params.get("token") or websocket.cookies.get("access_token")
    if not token:
         await websocket.close(code=4001, reason="Токен не предоставлен")
         return

    try:
        # Используем существующую функцию аутентификации для WS
        user_data = await get_current_user_ws(token)
        user_id = user_data["username"] # sAMAccountName
    except HTTPException as e:
         await websocket.close(code=4002, reason=e.detail)
         return
    except Exception as e:
         logger.error(f"WS Auth error: {e}")
         await websocket.close(code=4003, reason="Ошибка аутентификации")
         return

    await manager.connect(websocket, user_id)
    try:
        # Отправляем подтверждение подключения
        await websocket.send_text(json.dumps({"type": "connected", "user": user_id}))
        while True:
            data = await websocket.receive_text()
            # Обработка входящих сообщений от клиента (если нужно)
            # Например, клиент может отправлять heartbeat
            # logger.debug(f"Received from {user_id}: {data}")
            pass
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)
        logger.info(f"WebSocket disconnected for user {user_id}")
    except Exception as e:
         logger.error(f"WebSocket error for user {user_id}: {e}")
         manager.disconnect(websocket, user_id)
