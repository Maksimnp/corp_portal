import os
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Body, Query, UploadFile, File, Path
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean, UniqueConstraint, create_engine, desc, distinct, func
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import declarative_base, sessionmaker, Session, relationship
from sqlalchemy.sql import func
from pydantic import BaseModel, Field, ConfigDict
from uuid import UUID as UUIDType
from services.jwt_utils import get_current_user
import ldap3
from ldap3.utils.conv import escape_filter_chars
from ldap3 import Server, Connection, ALL_ATTRIBUTES, SUBTREE, AUTO_BIND_NO_TLS, SIMPLE
from ldap3.core.exceptions import LDAPException, LDAPBindError, LDAPSocketOpenError
import anyio
from sqlalchemy.orm.attributes import flag_modified
from starlette.websockets import WebSocketState
from fastapi.responses import FileResponse
from pathlib import Path as FilePath

# -----------------------------
# Логирование
# -----------------------------
logging.basicConfig(
    level=logging.INFO if os.getenv("ENV") == "production" else logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("chat")
router = APIRouter(prefix="/chat", tags=["chat"])

# -----------------------------
# Настройка БД
# -----------------------------
DB_USER = os.getenv("CHAT_DB_USER", "portal_admin")
DB_PASS = os.getenv("CHAT_DB_PASSWORD", "season")
DB_HOST = os.getenv("CHAT_DB_HOST", "localhost")
DB_NAME = os.getenv("CHAT_DB_DATABASE", "chat_app")

if not all([DB_USER, DB_PASS, DB_HOST, DB_NAME]):
    raise RuntimeError("CHAT_DB_* переменные окружения не заданы полностью")

DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASS}@{DB_HOST}/{DB_NAME}"
engine = create_engine(DATABASE_URL, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")

# -----------------------------
# Настройка Active Directory
# -----------------------------
LDAP_SERVER = os.getenv("LDAP_SERVER")
LDAP_USER = os.getenv("LDAP_USER", "ServiceReader")
LDAP_PASSWORD = os.getenv("LDAP_PASSWORD", "Season24")
BASE_DN = os.getenv("BASE_DN", "DC=mhp,DC=net")
BYPASS_AD_VALIDATION = os.getenv("BYPASS_AD_VALIDATION", "false").lower() == "true"
LDAP_VALIDATE_CERTS = os.getenv("LDAP_VALIDATE_CERTS")
LDAP_CA_CERT = os.getenv("LDAP_CA_CERT")

# -----------------------------
# МОДЕЛИ SQLAlchemy
# -----------------------------
class Channel(Base):
    __tablename__ = "channels"
    id = Column(UUID(as_uuid=True), primary_key=True, index=True, default=uuid.uuid4)
    name = Column(String, nullable=True)
    description = Column(String, nullable=True)
    is_group = Column(Boolean, default=False, nullable=False)
    is_channel = Column(Boolean, default=False, nullable=False)
    creator_username = Column(String, nullable=False)
    members = Column(ARRAY(String), nullable=False, default=[])
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    messages = relationship("Message", back_populates="channel", cascade="all, delete-orphan")
    user_statuses = relationship("UserChannelStatus", back_populates="channel", cascade="all, delete-orphan")
    font_name = Column(String, default="chat_font_1", nullable=False)

class Message(Base):
    __tablename__ = "messages"
    id = Column(UUID(as_uuid=True), primary_key=True, index=True, default=uuid.uuid4)
    channel_id = Column(UUID(as_uuid=True), ForeignKey("channels.id", ondelete="CASCADE"), index=True, nullable=False)
    sender = Column(String, index=True, nullable=False)
    content = Column(String, nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True, nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)
    file_url = Column(String, nullable=True)
    file_name = Column(String, nullable=True)
    edited = Column(Boolean, default=False, nullable=False)
    channel = relationship("Channel", back_populates="messages")
    quoted_message_id = Column(UUID(as_uuid=True), ForeignKey("messages.id", ondelete="SET NULL"), nullable=True)
    forward_message_id = Column(UUID(as_uuid=True), ForeignKey("messages.id", ondelete="SET NULL"), nullable=True)
    is_notification = Column(Boolean, default=False, nullable=False)

class UserChannelStatus(Base):
    __tablename__ = "user_channel_status"
    
    user_id = Column(String, primary_key=True, nullable=False)
    channel_id = Column(UUID(as_uuid=True), ForeignKey("channels.id", ondelete="CASCADE"), primary_key=True, nullable=False)
    last_read_message_id = Column(UUID(as_uuid=True), ForeignKey("messages.id", ondelete="SET NULL"), nullable=True)
    last_read_timestamp = Column(DateTime(timezone=True), nullable=True)
    unread_count = Column(Integer, default=0, nullable=False)
    
    # Relationships
    channel = relationship("Channel", back_populates="user_statuses")
    last_read_message = relationship("Message", foreign_keys=[last_read_message_id])

class User(Base):
    __tablename__ = "users"
    username = Column(String(100), primary_key=True, nullable=False)
    last_online_at = Column(DateTime(timezone=True))
    description = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

class Reaction(Base):
    __tablename__ = "reactions"

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(UUID(as_uuid=True), ForeignKey("messages.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, nullable=False)
    reaction = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    is_read = Column(Boolean, nullable=False, default=False)
    channel_id = Column(String, nullable=False)
    __table_args__ = (UniqueConstraint("message_id", "user_id", name="uq_user_message_reaction"),)

def initialize_user_statuses(db: Session):
    """Инициализирует статусы пользователей для существующих чатов"""
    try:
        logger.info("Initializing user statuses for existing chats...")
        
        channels = db.query(Channel).all()
        for channel in channels:
            for username in channel.members:
                existing_status = db.query(UserChannelStatus).filter(
                    UserChannelStatus.user_id == username,
                    UserChannelStatus.channel_id == channel.id
                ).first()
                
                if not existing_status:
                    unread_count = db.query(func.count(Message.id)).filter(
                        Message.channel_id == channel.id,
                        Message.is_read == False,
                        Message.sender != username
                    ).scalar()
                    
                    last_message = db.query(Message).filter(
                        Message.channel_id == channel.id
                    ).order_by(Message.timestamp.desc()).first()
                    
                    user_status = UserChannelStatus(
                        user_id=username,
                        channel_id=channel.id,
                        last_read_message_id=last_message.id if last_message else None,
                        last_read_timestamp=last_message.timestamp if last_message else None,
                        unread_count=unread_count
                    )
                    db.add(user_status)
                    logger.debug(f"Created status for user {username} in channel {channel.id}")
        
        db.commit()
        logger.info("User statuses initialized successfully")
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error initializing user statuses: {e}")
        raise

# Создание таблиц
def create_tables():
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Таблицы успешно созданы или уже существуют.")
        
        db = SessionLocal()
        try:
            initialize_user_statuses(db)
        finally:
            db.close()

    except Exception as e:
        logger.error(f"Ошибка при создании таблиц: {e}")
        raise

create_tables()

# -----------------------------
# Pydantic схемы
# -----------------------------
class ChatResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUIDType
    name: Optional[str] = None
    description: Optional[str] = None
    is_group: bool
    is_channel: bool
    creator_username: str
    members: List[str]
    unread_count: int = 0 
    font_name: str = "chat_font_1"

class ReactionInfo(BaseModel):
    emoji: str
    is_read: bool
    timestamp: Optional[datetime] = None

class MessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUIDType
    channel_id: UUIDType
    sender: str
    content: Optional[str] = None
    timestamp: datetime
    is_read: bool
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    edited: bool
    quoted_message_id: Optional[UUIDType] = None
    forward_message_id: Optional[UUIDType] = None
    is_notification: Optional[bool] = None
    reactions_by_user: Dict[str, ReactionInfo] = {}

class MessageCreate(BaseModel):
    channel_id: UUIDType
    content: Optional[str] = Field(None, min_length=1, max_length=10000)
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    quoted_message_id: Optional[UUIDType] = None
    forward_message_id: Optional[UUIDType] = None

class ChatUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class EditMessageRequest(BaseModel):
    message_id: UUIDType
    content: str = Field(min_length=1, max_length=10000)

class DeleteMessageRequest(BaseModel):
    message_id: UUIDType

class CreateGroupChatRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    members: List[str] = Field(min_length=1)

class CreateChannelRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)

class InviteToChannelRequest(BaseModel):
    members: List[str] = Field(min_length=1)

class KickFromChannelRequest(BaseModel):
    members: List[str] = Field(min_length=1)

class Contact(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    displayName: Optional[str] = None
    position: Optional[str] = None
    department: Optional[str] = None
    phone_internal: Optional[str] = None
    phone_city: Optional[str] = None
    phone_mobile: Optional[str] = None
    email: Optional[str] = None
    sam_account_name: Optional[str] = None

# -----------------------------
# Утилиты ldap3
# -----------------------------

def get_ldap_connection() -> Optional[Connection]:
    """
    Создает и возвращает подключение к LDAP серверу с использованием ldap3.
    """
    if not LDAP_SERVER:
        logger.error("LDAP_SERVER environment variable is not set.")
        raise HTTPException(status_code=500, detail="LDAP сервер не настроен")

    try:
        # Настройка TLS/SSL
        tls = None
        if LDAP_SERVER.lower().startswith("ldaps://"):
            import ssl
            tls_kwargs = {}
            if LDAP_VALIDATE_CERTS and LDAP_VALIDATE_CERTS.upper() in ("FALSE", "NEVER"):
                tls_kwargs['validate'] = ssl.CERT_NONE
                logger.warning("LDAPS certificate validation is disabled.")
            elif LDAP_CA_CERT and os.path.isfile(LDAP_CA_CERT):
                tls_kwargs['validate'] = ssl.CERT_REQUIRED
                tls_kwargs['ca_certs_file'] = LDAP_CA_CERT
                logger.debug(f"Using CA cert file for LDAPS: {LDAP_CA_CERT}")
            else:
                 # Если проверка включена, но сертификат не указан, используем системные
                 tls_kwargs['validate'] = ssl.CERT_REQUIRED
                 logger.debug("Using system CA certs for LDAPS validation.")
            
            tls = ldap3.Tls(**tls_kwargs)

        # Создание сервера
        server = Server(LDAP_SERVER, get_info=ALL_ATTRIBUTES, tls=tls)

        # Создание подключения
        conn = Connection(
            server,
            user=LDAP_USER,
            password=LDAP_PASSWORD,
            auto_bind=AUTO_BIND_NO_TLS,
            receive_timeout=10
        )
        
        logger.debug(f"Attempting to bind to LDAP server {LDAP_SERVER} as {LDAP_USER}")
        if not conn.bind():
            logger.error(f"LDAP bind failed for {LDAP_USER}: {conn.result}")
            raise LDAPBindError(f"Bind failed: {conn.result}")
            
        logger.debug("LDAP connection and bind successful.")
        return conn

    except LDAPSocketOpenError as e:
        logger.error(f"Cannot connect to LDAP server {LDAP_SERVER}: {e}")
        raise HTTPException(status_code=500, detail="LDAP сервер недоступен")
    except LDAPBindError as e:
        logger.error(f"LDAP bind error for {LDAP_USER}: {e}")
        raise HTTPException(status_code=500, detail="Ошибка аутентификации в Active Directory")
    except LDAPException as e:
        logger.error(f"LDAP error during connection setup: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка подключения к LDAP: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error setting up LDAP connection: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Неожиданная ошибка подключения к LDAP: {str(e)}")

def validate_ad_user(username: str) -> bool:
    """
    Проверяет существование пользователя в AD с помощью ldap3.
    """
    if BYPASS_AD_VALIDATION:
        logger.warning(f"Bypassing AD validation for {username}")
        return True
        
    conn = None
    try:
        logger.debug(f"Validating AD user: {username}")
        conn = get_ldap_connection()
        
        search_filter = f"(sAMAccountName={username})"
        logger.debug(f"Searching with filter: {search_filter} in base {BASE_DN}")
        
        conn.search(
            search_base=BASE_DN,
            search_filter=search_filter,
            search_scope=SUBTREE,
            attributes=['sAMAccountName']
        )
        
        found = len(conn.entries) > 0
        logger.debug(f"AD validation for {username}: {'Found' if found else 'Not found'}")
        return found
        
    except LDAPException as e:
        logger.error(f"LDAP error validating user {username}: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка проверки пользователя: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error validating AD user {username}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Неожиданная ошибка: {str(e)}")
    finally:
        if conn and conn.bound:
            conn.unbind()
            logger.debug("LDAP connection closed after validation.")

def search_ad_users(search_term: str = "") -> List[Dict[str, Any]]:
    """
    Поиск пользователей в AD через LDAP с использованием ldap3.
    """
    logger.info(f"Начало поиска в AD (ldap3). Запрос: '{search_term}'")
    conn = None
    try:
        conn = get_ldap_connection()
        
        # Базовый фильтр для активных пользователей
        base_filter = "(&(objectClass=user)(objectCategory=person)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))"
        
        if search_term:
            escaped_term = escape_filter_chars(search_term)
            search_filter = f"(&{base_filter}(|(displayName=*{escaped_term}*)(sAMAccountName=*{escaped_term}*)(mail=*{escaped_term}*)))"
        else:
            search_filter = base_filter
            
        logger.debug(f"Searching with filter: {search_filter} in base {BASE_DN}")
        
        # Атрибуты для поиска
        attributes = ['sAMAccountName', 'displayName', 'mail']
        
        conn.search(
            search_base=BASE_DN,
            search_filter=search_filter,
            search_scope=SUBTREE,
            attributes=attributes,
            size_limit=1000
        )
        
        users = []
        logger.debug(f"Found {len(conn.entries)} raw entries")
        
        for entry in conn.entries:
            logger.debug(f"Processing entry: {entry.entry_dn}")
            try:
                sam_account_name = entry.sAMAccountName.value if entry.sAMAccountName and entry.sAMAccountName.value else None
                if not sam_account_name:
                     logger.debug(f"Пропущена запись LDAP (нет sAMAccountName): dn={entry.entry_dn}")
                     continue
                
                display_name = entry.displayName.value if entry.displayName and entry.displayName.value else None
                email = entry.mail.value if entry.mail and entry.mail.value else None
                
                user_dict = {
                    'id': sam_account_name,
                    'displayName': display_name,
                    'email': email,
                    'position': None,
                    'department': None,
                    'phone_internal': None,
                    'phone_city': None,
                    'phone_mobile': None,
                }
                users.append(user_dict)
            except Exception as e:
                 logger.warning(f"Error processing LDAP entry {entry.entry_dn}: {e}")
                 continue
                 
        logger.debug(f"Найдено пользователей в AD (ldap3): {len(users)}")
        return users
        
    except LDAPSocketOpenError as e:
        logger.error(f"LDAP сервер {LDAP_SERVER} недоступен: {e}")
        raise HTTPException(status_code=500, detail="LDAP сервер недоступен")
    except LDAPBindError as e:
        logger.error(f"Неверные учетные данные LDAP для пользователя {LDAP_USER}: {e}")
        raise HTTPException(status_code=500, detail="Неверные учетные данные LDAP")
    except LDAPException as e:
        logger.error(f"Ошибка LDAP при поиске: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка поиска в LDAP: {e}")
    except Exception as e:
        logger.error(f"Неизвестная ошибка при поиске в LDAP (ldap3): {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера при поиске контактов")
    finally:
        if conn and conn.bound:
            try:
                conn.unbind()
                logger.debug("LDAP connection closed after search.")
            except Exception as e:
                logger.warning(f"Ошибка при закрытии LDAP соединения: {e}")

# -----------------------------
# DEPENDS
# -----------------------------
def get_db() -> Session:
    db = SessionLocal()
    logger.debug(f"New DB session created: {id(db)}")
    try:
        yield db
    finally:
        db.close()

# -----------------------------
# WEBSOCKET МЕНЕДЖЕР
# -----------------------------
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self.active_connections_users: Dict[str, str] = {}

    async def broadcast_user_status(self):
        users_to_remove = []
        for user, connections in self.active_connections.items():
            live_connections = [
                ws for ws in connections
                if ws.client_state == WebSocketState.CONNECTED
            ]
            if live_connections:
                self.active_connections[user] = live_connections
            else:
                users_to_remove.append(user)

        for user in users_to_remove:
            self.active_connections.pop(user, None)
            self.active_connections_users.pop(user, None)

        status_payload = {"type": "user_status", "data": self.active_connections_users.copy()}
        for connections in self.active_connections.values():
            for ws in connections:
                try:
                    if ws.client_state == WebSocketState.CONNECTED:
                        await ws.send_json(status_payload)
                except Exception as e:
                    logger.error(f"Failed to send user status to a WebSocket: {e}")

    async def connect(self, ws: WebSocket, username: str):
        logger.info(f"Connected to WebSocket")
        if username not in self.active_connections:
            self.active_connections[username] = []
        if username not in self.active_connections_users:
            self.active_connections_users[username] = "online"
        self.active_connections[username].append(ws)
        logger.debug(f"User {username} connected to WebSocket")
        await self.broadcast_user_status()           

    async def disconnect(self, ws: WebSocket, username: str):
        logger.info(f"Disconnected from WebSocket")
        if username in self.active_connections:
            conns = self.active_connections[username]
            if ws in conns:
                conns.remove(ws)
                logger.debug(f"User {username} disconnected from WebSocket")
            if not conns:
                del self.active_connections[username]
                if username in self.active_connections_users:
                    del self.active_connections_users[username]

        db = SessionLocal()
        try:
            user = db.query(User).filter(User.username == username).first()
            current_time = datetime.now(timezone.utc)

            if not user:
                user = User(
                    username=username,
                    last_online_at=current_time,
                    created_at=current_time,
                    updated_at=current_time
                )
                db.add(user)
                logger.info(f"Created new user record for {username}")
            else:
                user.last_online_at = current_time
                user.updated_at = current_time
                logger.info(f"Updated last_online_at for user {username}")

            db.commit()

        except Exception as e:
            db.rollback()
            logger.error(f"Error updating last_online_at for {username}: {e}")
        finally:
            db.close()
        
        await self.broadcast_user_status()

    async def broadcast_to_channel_members(self, payload: Dict[str, Any], channel_id: UUIDType, db: Session):
        invalid_user = ""
        if payload["type"] == "chat_deleted":
            usernames = payload["data"]["members"]
        # elif payload["type"] == "forward_message":
        #     usernames = payload["forward_members"] 
        #     logger.info(f"forward_members - {usernames}")
        elif payload["type"] == "channel_invite":
            usernames = payload["data"]["members"]
        else:
            channel = db.query(Channel).filter(Channel.id == channel_id).first()
            if not channel:
                logger.warning(f"Channel {channel_id} not found for broadcast")
                return
            usernames = channel.members
        if payload["type"] == "typing_start" or payload["type"] == "typing_stop":
            invalid_user = payload["data"]["user"]
        logger.info(f"usernames - {usernames}, type - {payload['type']}")
        for uname in usernames:
            if uname == invalid_user:
                continue 
            conns = self.active_connections.get(uname, [])
            for ws in conns:
                if ws.client_state != WebSocketState.CONNECTED:
                    conns.remove(ws)
                    logger.warning(f"Removed dead WebSocket for user {uname}")
                    continue
                try:
                    logger.info("send payload")
                    await ws.send_json(payload)
                except Exception as e:
                    logger.error(f"WS send error to {uname}: {e}")
    async def broadcast_to_user(self, payload: Dict[str, Any], username: str):
        conns = self.active_connections.get(username, [])
        for ws in conns:
            if ws.client_state == WebSocketState.CONNECTED:
                try:
                    await ws.send_json(payload)
                except Exception as e:
                    logger.error(f"Failed to send to {username}: {e}")

# Инициализация менеджера WebSocket
manager = ConnectionManager()

# -----------------------------
# УТИЛИТЫ
# -----------------------------

def assert_membership(db: Session, channel_id: UUIDType, username: str):
    channel = db.query(Channel).filter(Channel.id == channel_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Чат не найден")
    if username not in channel.members:
        raise HTTPException(status_code=403, detail="Вы не участник этого чата")

def serialize_chat(db: Session, chat: Channel, username: str) -> ChatResponse:
    unread_count = get_unread_count(db, username, chat.id)
    
    return ChatResponse(
        id=chat.id,
        name=chat.name or "",
        description=chat.description,
        is_group=chat.is_group,
        is_channel=chat.is_channel,
        creator_username=chat.creator_username,
        members=chat.members,
        unread_count=unread_count,
        font_name=chat.font_name
    )

def sanitize_filename(filename: str) -> str:
    """Sanitize filename to prevent path traversal and invalid characters."""
    import re
    filename = re.sub(r'[^a-zA-Z0-9._-]', '_', filename)
    filename = filename.replace('..', '').replace('/', '').replace('\\', '')
    return filename

def update_user_channel_status(db: Session, username: str, channel_id: UUIDType, 
                             last_read_message_id: Optional[UUIDType] = None, 
                             last_read_timestamp: Optional[datetime] = None):
    """Обновляет статус пользователя в канале"""
    user_status = db.query(UserChannelStatus).filter(
        UserChannelStatus.user_id == username,
        UserChannelStatus.channel_id == channel_id
    ).first()
    
    if user_status:
        if last_read_message_id:
            user_status.last_read_message_id = last_read_message_id
        if last_read_timestamp:
            user_status.last_read_timestamp = last_read_timestamp
        # При обновлении статуса сбрасываем счетчик непрочитанных
        user_status.unread_count = 0
    else:
        user_status = UserChannelStatus(
            user_id=username,
            channel_id=channel_id,
            last_read_message_id=last_read_message_id,
            last_read_timestamp=last_read_timestamp,
            unread_count=0
        )
        db.add(user_status)
    
    db.commit()
    return user_status

def get_unread_count(db: Session, username: str, channel_id: UUIDType) -> int:
    """Получает количество непрочитанных сообщений для конкретного канала"""
    user_status = db.query(UserChannelStatus).filter(
        UserChannelStatus.user_id == username,
        UserChannelStatus.channel_id == channel_id
    ).first()
    
    return user_status.unread_count if user_status else 0

def get_total_unread_count(db: Session, username: str) -> int:
    """Получает общее количество непрочитанных сообщений по всем чатам"""
    total = db.query(func.sum(UserChannelStatus.unread_count)).filter(
        UserChannelStatus.user_id == username
    ).scalar()
    
    return total or 0

def mark_messages_as_read(db: Session, username: str, message_ids: List[UUIDType]):
    """Помечает сообщения как прочитанные и обновляет счетчики"""
    if not message_ids:
        return
    
    messages = db.query(Message).filter(Message.id.in_(message_ids)).all()
    for message in messages:
        if not message.is_read and message.sender != username:
            message.is_read = True
    
    db.commit()
    
    channel_ids = set(msg.channel_id for msg in messages)
    for channel_id in channel_ids:
        unread_count = db.query(func.count(Message.id)).filter(
            Message.channel_id == channel_id,
            Message.is_read == False,
            Message.sender != username
        ).scalar()
        
        user_status = db.query(UserChannelStatus).filter(
            UserChannelStatus.user_id == username,
            UserChannelStatus.channel_id == channel_id
        ).first()
        
        if user_status:
            user_status.unread_count = unread_count
        else:
            user_status = UserChannelStatus(
                user_id=username,
                channel_id=channel_id,
                unread_count=unread_count
            )
            db.add(user_status)
    
    db.commit()

# -----------------------------
# REST МАРШРУТЫ
# -----------------------------
@router.get("/chats", response_model=List[ChatResponse])
def get_chats(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    username = current_user["username"]
    logger.debug(f"Fetching chats for user: {username}")
    try:
        chats = (
            db.query(Channel)
            .filter(Channel.members.contains([username]))
            .order_by(Channel.created_at.desc())
            .all()
        )
        return [serialize_chat(db, ch, username) for ch in chats]
    except Exception as e:
        logger.error(f"Error fetching chats for {username}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Не удалось загрузить чаты: {str(e)}")

@router.get("/messages/around/{message_id}", response_model=List[MessageResponse])
def get_messages_around(
    message_id: UUIDType,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    username = current_user["username"]
    logger.debug(f"Fetching messages around {message_id} for user {username}")

    target_message = db.query(Message).filter(Message.id == message_id).first()
    if not target_message:
        raise HTTPException(status_code=404, detail="Сообщение не найдено")

    assert_membership(db, target_message.channel_id, username)

    channel_id = target_message.channel_id

    BEFORE_COUNT = 25
    AFTER_COUNT = 25

    before_messages = (
        db.query(Message)
        .filter(
            Message.channel_id == channel_id,
            Message.timestamp <= target_message.timestamp,
            Message.id != target_message.id
        )
        .order_by(Message.timestamp.desc())
        .limit(BEFORE_COUNT)
        .all()
    )

    after_messages = (
        db.query(Message)
        .filter(
            Message.channel_id == channel_id,
            Message.timestamp > target_message.timestamp
        )
        .order_by(Message.timestamp.asc())
        .limit(AFTER_COUNT)
        .all()
    )

    all_messages = before_messages[::-1] + [target_message] + after_messages
    all_messages.sort(key=lambda m: m.timestamp)

    last_message = all_messages[-1] if all_messages else target_message
    if last_message:
        update_user_channel_status(
            db, username, channel_id,
            last_read_message_id=last_message.id,
            last_read_timestamp=last_message.timestamp
        )

    return all_messages

@router.get("/{channel_id}/messages/before/{message_id}", response_model=List[MessageResponse])
def get_messages_before(
    channel_id: UUIDType,
    message_id: UUIDType,
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    username = current_user["username"]
    assert_membership(db, channel_id, username)

    target = db.query(Message).filter(Message.id == message_id).first()
    if not target or target.channel_id != channel_id:
        raise HTTPException(status_code=404, detail="Сообщение не найдено")

    messages = (
        db.query(Message)
        .filter(
            Message.channel_id == channel_id,
            Message.timestamp <= target.timestamp,
            (Message.timestamp < target.timestamp) | (Message.id < target.id)
        )
        .order_by(Message.timestamp.desc(), Message.id.desc())
        .limit(limit)
        .all()
    )

    return list(reversed(messages))

@router.get("/{channel_id}/messages/after/{message_id}", response_model=List[MessageResponse])
def get_messages_after(
    channel_id: UUIDType,
    message_id: UUIDType,
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    username = current_user["username"]
    assert_membership(db, channel_id, username)

    target = db.query(Message).filter(Message.id == message_id).first()
    if not target or target.channel_id != channel_id:
        raise HTTPException(status_code=404, detail="Сообщение не найдено")

    messages = (
        db.query(Message)
        .filter(
            Message.channel_id == channel_id,
            (Message.timestamp > target.timestamp) | 
            ((Message.timestamp == target.timestamp) & (Message.id > target.id))
        )
        .order_by(Message.timestamp.asc(), Message.id.asc())
        .limit(limit)
        .all()
    )

    return messages

@router.get("/download/chat_file/{filename}")
async def download_chat_file(filename: str):
    file_path = os.path.join("templates", "static", "chat_file", sanitize_filename(filename))
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type="application/octet-stream"
    )

@router.get("/chats-with-last-message", response_model=List[dict])
def get_chats_with_last_message(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Возвращает список чатов пользователя с информацией о последнем сообщении в каждом.
    Использует DISTINCT ON для максимальной производительности.
    """
    username = current_user["username"]
    logger.debug(f"Fetching chats with last message for user: {username}")

    try:
        subq = (
            db.query(Message)
            .join(Channel, Message.channel_id == Channel.id)
            .filter(Channel.members.contains([username]))
            .distinct(Message.channel_id)
            .order_by(Message.channel_id, Message.timestamp.desc())
            .subquery()
        )
        result = (
            db.query(Channel)
            .outerjoin(subq, Channel.id == subq.c.channel_id)
            .add_columns(
                subq.c.id,
                subq.c.sender,
                subq.c.content,
                subq.c.timestamp,
                subq.c.is_read,
                subq.c.file_name,
                subq.c.file_url,
                subq.c.forward_message_id,
                subq.c.channel_id.label("last_msg_channel_id")
            )
            .filter(Channel.members.contains([username]))
            .order_by(desc(subq.c.timestamp) if subq.c.timestamp is not None else None)
            .all()
        )

        response = []
        for row in result:
            chat = row[0]
            chat_data = serialize_chat(db, chat, username).model_dump() if hasattr(serialize_chat(db, chat, username), 'model_dump') else serialize_chat(db, chat, username).dict()

            if row[1] is not None:
                chat_data['last_message'] = {
                    "id": str(row[1]),
                    "sender": row[2], 
                    "content": row[3],
                    "timestamp": row[4].isoformat() if row[4] else None,
                    "file_name": row[6],
                    "is_read": row[5],
                    "file_url": row[7],
                    "forward_message_id": row[8],
                }
            else:
                chat_data['last_message'] = None

            response.append(chat_data)

        return response

    except Exception as e:
        logger.error(f"Error fetching chats with last message for {username}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Не удалось загрузить чаты: {str(e)}")

@router.get("/unread/total")
def get_total_unread(
    current_user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    username = current_user["username"]
    try:
        total_unread = get_total_unread_count(db, username)
        return {"total_unread": total_unread}
    except Exception as e:
        logger.error(f"Error getting total unread count for {username}: {e}")
        raise HTTPException(status_code=500, detail="Не удалось получить количество непрочитанных сообщений")

@router.get("/{channel_id}/messages", response_model=List[MessageResponse])
def get_messages(
    channel_id: UUIDType,
    limit: int = Query(50, ge=1, le=500),
    offset: Optional[int] = Query(None, ge=0),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    username = current_user["username"]
    logger.debug(f"Fetching messages for channel {channel_id} by {username}")
    try:
        assert_membership(db, channel_id, username)

        query = db.query(Message).filter(Message.channel_id == channel_id)

        if offset is not None:
            messages = (
                query
                .order_by(Message.timestamp.desc())
                .offset(offset)
                .limit(limit)
                .all()
            )
            messages = list(reversed(messages))
        else:
            messages = (
                query
                .order_by(Message.timestamp.desc())
                .limit(limit)
                .all()
            )
            messages = list(reversed(messages))

        if not messages:
            return []

        message_ids = [m.id for m in messages]

        reaction_data = db.query(Reaction.message_id, Reaction.user_id, Reaction.reaction, Reaction.is_read, Reaction.channel_id).filter(
            Reaction.message_id.in_(message_ids)
        ).all()

        reactions_by_message = {}
        for r in reaction_data:
            if r.message_id not in reactions_by_message:
                reactions_by_message[r.message_id] = {}
            reactions_by_message[r.message_id][r.user_id] = {
                "emoji": r.reaction,
                "is_read": r.is_read,
            }

        result = []
        for msg in messages:
            msg_dict = {
                "id": msg.id,
                "channel_id": msg.channel_id,
                "sender": msg.sender,
                "content": msg.content,
                "timestamp": msg.timestamp,
                "is_read": msg.is_read,
                "file_url": msg.file_url,
                "file_name": msg.file_name,
                "edited": msg.edited,
                "quoted_message_id": msg.quoted_message_id,
                "forward_message_id": msg.forward_message_id,
                "is_notification": msg.is_notification,
                "reactions_by_user": reactions_by_message.get(msg.id, {})
            }
            result.append(MessageResponse(**msg_dict))

        if messages and offset == 0:
            last_message = messages[-1]
            update_user_channel_status(
                db, username, channel_id,
                last_message.id, last_message.timestamp
            )

        return result

    except HTTPException as e:
        logger.warning(f"Access denied for channel {channel_id} by {username}: {e}")
        raise
    except Exception as e:
        logger.error(f"Error fetching messages for channel {channel_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Не удалось загрузить сообщения: {str(e)}")

@router.post("/messages", response_model=MessageResponse)
def post_message(
    body: MessageCreate,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    username = current_user["username"]
    logger.debug(f"Posting message to channel {body.channel_id} by {username}")
    assert_membership(db, body.channel_id, username)
    if not body.content and not body.file_url:
        raise HTTPException(status_code=400, detail="Сообщение или файл обязательны")
    
    msg = Message(
        channel_id=body.channel_id,
        sender=username,
        content=body.content,
        is_read=False,
        file_url=body.file_url,
        file_name=body.file_name,
        quoted_message_id=body.quoted_message_id
    )
    
    try:
        db.add(msg)
        db.commit()
        db.refresh(msg)
        
        payload = {
            "type": "new_message",
            "data": {
                "id": str(msg.id),
                "channel_id": str(msg.channel_id),
                "sender": msg.sender,
                "content": msg.content,
                "timestamp": msg.timestamp.isoformat(),
                "is_read": msg.is_read,
                "file_url": msg.file_url,
                "file_name": msg.file_name,
                "edited": msg.edited,
                "quoted_message_id": str(msg.quoted_message_id) if msg.quoted_message_id else None,
            },
        }
        try:
            anyio.from_thread.run(manager.broadcast_to_channel_members, payload, msg.channel_id, db)
        except Exception as e:
            logger.warning(f"Failed to broadcast new_message: {e}")
            
        return msg
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error posting message: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Не удалось отправить сообщение: {str(e)}")

@router.post("/messages/batch_read")
async def mark_messages_read(
    body: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    username = current_user["username"]
    logger.debug(f"Marking messages as read by {username}: {body}")
    message_ids = [UUIDType(id) for id in body.get("message_ids", [])]
    msgs = [id for id in body.get("message_ids", [])]
    channel_id = body.get("channel_id")
    
    if not message_ids:
        raise HTTPException(status_code=400, detail="Не предоставлены ID сообщений")
    
    try:
        mark_messages_as_read(db, username, message_ids)
        payload = {
            "type": "batch_read",
            "data" : {
                "channel_id": channel_id,
                "message_ids": msgs,
            }
        }
        try:
            await manager.broadcast_to_channel_members(payload, channel_id, db)
        except Exception as e:
            logger.warning(f"Failed to broadcast private_chat_created: {e}")
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Error marking messages as read: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Не удалось пометить сообщения как прочитанные: {str(e)}")
    
@router.post("/reactions/batch_read")
def mark_reactions_read(
    body: Dict[str, List[str]],
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    message_ids = [str(m) for m in body.get("message_ids", [])]
    db.query(Reaction).filter(
        Reaction.message_id.in_(message_ids),
        Reaction.is_read == False,
    ).update({"is_read": True}, synchronize_session=False)
    db.commit()
    return {"status": "ok"}

@router.get("/reactions/unread")
def get_unread_reactions(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    reactions = db.query(Reaction).join(Message).filter(
        Reaction.is_read == False,
        Message.sender == current_user["username"]
    ).all()
    return [
        {
            "reaction_id": r.id,
            "message_id": str(r.message_id),
            "reaction": r.reaction,
            "channel_id": r.channel_id,
            "reactor": r.user_id,
            "timestamp": r.created_at.isoformat(),
            "message_content": r.message.content,
            "channel_id": str(r.message.channel_id),
        }
        for r in reactions
    ]
    
@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    username = current_user["username"]
    logger.debug(f"Uploading file by {username}: {file.filename}")
    allowed_extensions = {'.jpg', '.jpeg', '.png', '.pdf', '.txt', '.ogg', '.mp4', '.gif', '.tiff', '.webp', '.svg', '.doc', '.docx', '.rtf', '.zip', '.rar', '.7z', '.xls', '.xlsx', '.ppt'}
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail="Недопустимый тип файла")
    max_size = 10 * 1024 * 1024  # 10MB
    content = await file.read()
    file_size = len(content)
    if file_size > max_size:
        raise HTTPException(status_code=400, detail="Файл слишком большой (макс. 10 МБ)")
    try:
        upload_dir = os.getenv("UPLOAD_DIR", "uploads")
        os.makedirs(upload_dir, exist_ok=True)
        sanitized_filename = sanitize_filename(file.filename)
        unique_filename = f"{uuid.uuid4()}_{sanitized_filename}"
        file_path = os.path.join(upload_dir, unique_filename)
        with open(file_path, "wb") as buffer:
            buffer.write(content)
        file_url = f"/static/chat_file/{unique_filename}"
        logger.debug(f"File uploaded: {file_path}, URL: {file_url}")
        return {"url": file_url, "file_name": sanitized_filename}
    except Exception as e:
        logger.error(f"Error uploading file: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Не удалось загрузить файл: {str(e)}")

@router.post("/chats/private/{contact_username}", response_model=ChatResponse)
def create_private_chat(
    contact_username: str,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    username = current_user["username"]
    logger.debug(f"Creating private chat between {username} and {contact_username}")
    if contact_username == username:
        raise HTTPException(status_code=400, detail="Нельзя создать чат с самим собой")
    if not BYPASS_AD_VALIDATION and not validate_ad_user(contact_username):
        raise HTTPException(status_code=404, detail=f"Пользователь {contact_username} не найден в Active Directory")
    try:
        existing = (
            db.query(Channel)
            .filter(
                Channel.is_group.is_(False),
                Channel.is_channel.is_(False),
                Channel.members.contains([username]),
                Channel.members.contains([contact_username])
            )
            .first()
        )
        if existing:
            return serialize_chat(db, existing, username)
        chat = Channel(
            id=uuid.uuid4(),
            is_group=False,
            is_channel=False,
            name=None,
            creator_username=username,
            members=[username, contact_username]
        )
        db.add(chat)
        db.commit()
        db.refresh(chat)
        payload = {
            "type": "private_chat_created",
            "data": {
                "id": str(chat.id),
                "description": chat.description,
                "is_group": chat.is_group,
                "is_channel": chat.is_channel,
                "name": chat.name,
                "creator_username": chat.creator_username,
                "members": chat.members
            }
        }
        try:
            anyio.from_thread.run(manager.broadcast_to_channel_members, payload, chat.id, db)
        except Exception as e:
            logger.warning(f"Failed to broadcast private_chat_created: {e}")
        return serialize_chat(db, chat, username)
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating private chat: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Не удалось создать личный чат: {str(e)}")

@router.post("/chats/group", response_model=ChatResponse)
def create_group_chat(
    body: CreateGroupChatRequest,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    owner = current_user["username"]
    logger.debug(f"Request body for creating group chat: {body.dict()}")
    members = list(set(body.members + [owner]))
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Имя группы обязательно")
    if len(members) < 3:
        raise HTTPException(status_code=400, detail="Группа должна включать минимум 3 участников (включая создателя)")
    if db.query(Channel).filter(Channel.name == name, Channel.is_group.is_(True)).first():
        raise HTTPException(status_code=400, detail="Группа с таким именем уже существует")
    invalid_members = []
    for member in members:
        if not (BYPASS_AD_VALIDATION or validate_ad_user(member)):
            invalid_members.append(member)
    if invalid_members:
        logger.warning(f"Invalid AD users for group creation: {invalid_members}")
        raise HTTPException(status_code=404, detail=f"Пользователи не найдены в Active Directory: {', '.join(invalid_members)}")
    try:
        chat = Channel(
            id=uuid.uuid4(),
            is_group=True,
            is_channel=False,
            name=name,
            creator_username=owner,
            members=members
        )
        db.add(chat)
        db.commit()
        db.refresh(chat)
        payload = {
            "type": "group_created",
            "data": {
                "id": str(chat.id),
                "description": chat.description,
                "is_group": chat.is_group,
                "is_channel": chat.is_channel,
                "name": chat.name,
                "creator_username": owner,
                "members": chat.members
            }
        }
        for member in members:
                try:
                    msg = Message(
                        channel_id=chat.id,
                        sender=owner,
                        content=f"{member} добавлен(а) в группу",
                        is_read=False,
                        is_notification=True
                    )
                    db.add(msg)
                    db.commit()
                    db.refresh(msg)

                    payload_message = {
                        "type": "new_message",
                        "data": {
                            "id": str(msg.id),
                            "channel_id": str(msg.channel_id),
                            "sender": msg.sender,
                            "content": msg.content,
                            "timestamp": msg.timestamp.isoformat(),
                            "is_read": msg.is_read,
                            "file_url": msg.file_url,
                            "file_name": msg.file_name,
                            "edited": msg.edited,
                            "quoted_message_id": str(msg.quoted_message_id) if msg.quoted_message_id else None,
                            "is_notification": msg.is_notification,
                        },
                    }
                    anyio.from_thread.run(manager.broadcast_to_channel_members, payload_message, msg.channel_id, db)
                except Exception as e:
                    logger.warning(f"Failed to broadcast channel_invite: {e}")
        logger.debug(f"Broadcasting group_created: {payload}")
        try:
            anyio.from_thread.run(manager.broadcast_to_channel_members, payload, chat.id, db)
        except Exception as e:
            logger.warning(f"Failed to broadcast group_created: {e}")
        return serialize_chat(db, chat, owner)
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating group chat: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Не удалось создать групповой чат: {str(e)}")

@router.post("/chats/channel", response_model=ChatResponse)
def create_channel(
    body: CreateChannelRequest,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    owner = current_user["username"]
    logger.debug(f"Creating channel by {owner}: {body.name}")
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Имя канала обязательно")
    if db.query(Channel).filter(Channel.name == name, Channel.is_channel.is_(True)).first():
        raise HTTPException(status_code=400, detail="Канал с таким именем уже существует")
    try:
        chat = Channel(
            id=uuid.uuid4(),
            name=name,
            description=body.description,
            is_group=False,
            is_channel=True,
            creator_username=owner,
            members=[owner]
        )
        db.add(chat)
        db.commit()
        db.refresh(chat)
        payload = {
            "type": "channel_created",
            "data": {
                "channel_id": str(chat.id),
                "name": chat.name,
                "description": chat.description,
                "created_by": owner,
            }
        }
        logger.debug(f"Broadcasting channel_created: {payload}")
        try:
            anyio.from_thread.run(manager.broadcast_to_channel_members, payload, chat.id, db)
        except Exception as e:
            logger.warning(f"Failed to broadcast channel_created: {e}")
        return serialize_chat(db, chat, owner)
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating channel for {owner}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Не удалось создать канал: {str(e)}")

@router.post("/chats/{channel_id}/invite")
def invite_to_channel(
    channel_id: UUIDType,
    body: InviteToChannelRequest,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    username = current_user["username"]
    logger.debug(f"Inviting users to channel {channel_id} by {username}: {body.members}")
    assert_membership(db, channel_id, username)
    channel = db.query(Channel).filter(Channel.id == channel_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    if channel.creator_username != username:
        raise HTTPException(status_code=403, detail="Только создатель может приглашать пользователей")
    
    existing_members = set(channel.members)
    valid_members = []
    invalid_members = []
    for member in set(body.members):
        if member in existing_members:
            logger.debug(f"User {member} already in channel {channel_id}")
            continue
        if validate_ad_user(member):
            valid_members.append(member)
        else:
            invalid_members.append(member)
    
    if not valid_members and not invalid_members:
        raise HTTPException(status_code=400, detail="Нет новых пользователей для приглашения")
    
    try:
        if valid_members:
            channel.members = list(set(channel.members + valid_members))
            db.commit()
            db.refresh(channel)

            logger.info(f"Successfully invited {valid_members} to channel {channel_id}. New members: {channel.members}")
            payload_channel = {
                "type": "channel_invite",
                "data": {
                    "id": str(channel_id),
                    "name": channel.name,
                    "description": channel.description,
                    "is_group": channel.is_group,
                    "is_channel": channel.is_channel,
                    "creator_username": channel.creator_username,
                    "members": valid_members,
                }
            }
            
            for member in valid_members:
                try:
                    msg = Message(
                        channel_id=channel_id,
                        sender=username,
                        content=f"{member} добавлен(а) в группу",
                        is_read=False,
                        is_notification=True
                    )
                    db.add(msg)
                    db.commit()
                    db.refresh(msg)

                    payload_message = {
                        "type": "new_message",
                        "data": {
                            "id": str(msg.id),
                            "channel_id": str(msg.channel_id),
                            "sender": msg.sender,
                            "content": msg.content,
                            "timestamp": msg.timestamp.isoformat(),
                            "is_read": msg.is_read,
                            "file_url": msg.file_url,
                            "file_name": msg.file_name,
                            "edited": msg.edited,
                            "quoted_message_id": str(msg.quoted_message_id) if msg.quoted_message_id else None,
                            "is_notification": msg.is_notification,
                        },
                    }
                    anyio.from_thread.run(manager.broadcast_to_channel_members, payload_message, msg.channel_id, db)
                except Exception as e:
                    logger.warning(f"Failed to broadcast channel_invite: {e}")
            logger.info(f"Broadcasting channel_invite: {payload_channel}")
            try:
                anyio.from_thread.run(manager.broadcast_to_channel_members, payload_channel, channel_id, db)
            except Exception as e:
                logger.warning(f"Failed to broadcast channel_invite: {e}")
        if invalid_members:
            logger.warning(f"Some users not invited to channel {channel_id}: {invalid_members}")
        return {"status": "ok", "invited": valid_members, "not_found": invalid_members, "members": channel.members}
    except Exception as e:
        db.rollback()
        logger.error(f"Error inviting to channel {channel_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Не удалось пригласить пользователей: {str(e)}")

@router.post("/chats/{channel_id}/kick")
def kick_from_channel(
    channel_id: UUIDType,
    body: KickFromChannelRequest,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    username = current_user["username"]
    logger.debug(f"Kicking users from channel {channel_id} by {username}: {body.members}")
    assert_membership(db, channel_id, username)
    channel = db.query(Channel).filter(Channel.id == channel_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Канал не найден")
    if channel.creator_username != username:
        raise HTTPException(status_code=403, detail="Только создатель может выгонять пользователей")
    kicked = []
    not_found = []
    for member in body.members:
        if member == username:
            continue
        if member in channel.members:
            channel.members.remove(member)
            kicked.append(member)
            flag_modified(channel, "members")
        else:
            not_found.append(member)
    try:
        db.commit()
        db.refresh(channel)
        payload = {
            "type": "channel_kick",
            "data": {
                "channel_id": str(channel_id),
                "kicked_by": username,
                "members": kicked,
            }
        }
        logger.debug(f"Broadcasting channel_kick: {payload}")
        for member in body.members:
                try:
                    msg = Message(
                        channel_id=channel_id,
                        sender=username,
                        content=f"{member} исключен(а) из группу",
                        is_read=False,
                        is_notification=True
                    )
                    db.add(msg)
                    db.commit()
                    db.refresh(msg)

                    payload_message = {
                        "type": "new_message",
                        "data": {
                            "id": str(msg.id),
                            "channel_id": str(msg.channel_id),
                            "sender": msg.sender,
                            "content": msg.content,
                            "timestamp": msg.timestamp.isoformat(),
                            "is_read": msg.is_read,
                            "file_url": msg.file_url,
                            "file_name": msg.file_name,
                            "edited": msg.edited,
                            "quoted_message_id": str(msg.quoted_message_id) if msg.quoted_message_id else None,
                            "is_notification": msg.is_notification,
                        },
                    }
                    anyio.from_thread.run(manager.broadcast_to_channel_members, payload_message, msg.channel_id, db)
                except Exception as e:
                    logger.warning(f"Failed to broadcast channel_invite: {e}")
        try:
            anyio.from_thread.run(manager.broadcast_to_channel_members, payload, channel_id, db)
        except Exception as e:
            logger.warning(f"Failed to broadcast channel_kick: {e}")
        return {"status": "ok", "kicked": kicked, "not_found": not_found}
    except Exception as e:
        db.rollback()
        logger.error(f"Error kicking from channel {channel_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Не удалось исключить пользователей: {str(e)}")

@router.patch("/chats/{chat_id}", response_model=dict)
def update_chat(
    chat_id: UUIDType = Path(..., description="UUID чата для обновления"),
    chat_update: ChatUpdateRequest = Body(..., description="Поля для обновления чата"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Обновить информацию о чате (название, описание).

    - **chat_id**: UUID чата.
    - **chat_update**: Объект с полями `name` и/или `description` для обновления.
    """
    username = current_user["username"]
    logger.debug(f"User {username} attempting to update chat {chat_id} with data: {chat_update.model_dump(exclude_unset=True) if hasattr(chat_update, 'model_dump') else chat_update.dict(exclude_unset=True)}")

    try:
        chat = db.query(Channel).filter(Channel.id == chat_id).first()
        if not chat:
            logger.info(f"Chat {chat_id} not found for user {username}")
            raise HTTPException(status_code=404, detail="Чат не найден")

        if username not in chat.members:
             logger.warning(f"User {username} is not a member of chat {chat_id}")
             raise HTTPException(status_code=403, detail="Доступ запрещен")
        
        if (chat.is_group or chat.is_channel) and chat.creator_username != username:
            logger.warning(f"User {username} is not the creator of chat {chat_id} and cannot edit it")
            raise HTTPException(status_code=403, detail="Только создатель группы/канала может изменять её название и описание")

        update_data = chat_update.model_dump(exclude_unset=True) if hasattr(chat_update, 'model_dump') else chat_update.dict(exclude_unset=True)
        if not update_data:
            logger.debug(f"No data provided to update chat {chat_id} by user {username}")
            return {"id": str(chat.id), "name": chat.name, "description": chat.description}

        updated_fields = {}
        if 'name' in update_data:
            new_name = update_data['name'].strip() if update_data['name'] else None
            if new_name == "":
                 logger.warning(f"User {username} tried to set empty name for chat {chat_id}")
                 raise HTTPException(status_code=400, detail="Название чата не может быть пустым")
            chat.name = new_name
            updated_fields['name'] = chat.name
            
        if 'description' in update_data:
            new_description = update_data['description'].strip() if update_data['description'] else None
            chat.description = new_description
            updated_fields['description'] = chat.description
            
        db.commit()
        db.refresh(chat)
        logger.info(f"Chat {chat_id} successfully updated by user {username}. Updated fields: {updated_fields}")

        return {"id": str(chat.id), **updated_fields}

    except Exception as e:
        db.rollback()
        logger.error(f"Unexpected error updating chat {chat_id} by user {username}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")
    
@router.post("/chats/{channel_id}/leave")
def leave_chat(
    channel_id: UUIDType,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    username = current_user["username"]
    logger.debug(f"User {username} attempting to leave channel {channel_id}")
    assert_membership(db, channel_id, username)
    channel = db.query(Channel).filter(Channel.id == channel_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Чат не найден")
    if channel.creator_username == username:
        raise HTTPException(status_code=403, detail="Создатель не может покинуть чат; удалите его")
    try:
        channel.members.remove(username)
        flag_modified(channel, "members")
        db.commit()
        db.refresh(channel)
        payload = {
            "type": "user_left",
            "data": {
                "channel_id": str(channel_id),
                "username": username,
            }
        }
        logger.debug(f"Broadcasting user_left: {payload}")
        try:
            msg = Message(
                channel_id=channel_id,
                sender=username,
                content=f"{username} покинул(а) группу",
                is_read=False,
                is_notification=True
            )
            db.add(msg)
            db.commit()
            db.refresh(msg)

            payload_message = {
                "type": "new_message",
                "data": {
                    "id": str(msg.id),
                    "channel_id": str(msg.channel_id),
                    "sender": msg.sender,
                    "content": msg.content,
                    "timestamp": msg.timestamp.isoformat(),
                    "is_read": msg.is_read,
                    "file_url": msg.file_url,
                    "file_name": msg.file_name,
                    "edited": msg.edited,
                    "quoted_message_id": str(msg.quoted_message_id) if msg.quoted_message_id else None,
                    "is_notification": msg.is_notification,
                },
            }
            anyio.from_thread.run(manager.broadcast_to_channel_members, payload_message, msg.channel_id, db)
        except Exception as e:
            logger.warning(f"Failed to broadcast channel_invite: {e}")
        try:
            anyio.from_thread.run(manager.broadcast_to_channel_members, payload, channel_id, db)
        except Exception as e:
            logger.warning(f"Failed to broadcast user_left: {e}")
        return {"status": "ok"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error leaving channel {channel_id} by {username}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Не удалось покинуть чат: {str(e)}")

@router.delete("/chats/{channel_id}")
def delete_chat(
    channel_id: UUIDType,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    username = current_user["username"]
    logger.debug(f"User {username} attempting to delete channel {channel_id}")
    assert_membership(db, channel_id, username)
    channel = db.query(Channel).filter(Channel.id == channel_id).first()
    if not channel:
        raise HTTPException(status_code=404, detail="Чат не найден")
    if channel.creator_username != username:
        raise HTTPException(status_code=403, detail="Только создатель может удалить чат")
    try:
        db.delete(channel)
        db.commit()
        payload = {
            "type": "chat_deleted",
            "data": {
                "channel_id": str(channel_id),
                "members": channel.members
            }
        }
        logger.debug(f"Broadcasting chat_deleted: {payload}")
        try:
            anyio.from_thread.run(manager.broadcast_to_channel_members, payload, channel_id, db)
        except Exception as e:
            logger.warning(f"Failed to broadcast chat_deleted: {e}")
        return {"status": "ok"}
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting channel {channel_id} by {username}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Не удалось удалить чат: {str(e)}")
    
@router.delete("/message/{message_id}")
def delete_message(
    message_id: UUIDType = Path(..., description="ID сообщения для удаления"),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Удалить сообщение по его ID.

    - **message_id**: UUID сообщения.
    """
    username = current_user["username"]
    logger.debug(f"Попытка удаления сообщения {message_id} пользователем {username}")

    try:
        message = db.query(Message).filter(Message.id == message_id).first()

        if not message:
            logger.info(f"Сообщение {message_id} не найдено для пользователя {username}")
            raise HTTPException(status_code=404, detail="Сообщение не найдено")
        
        if message.sender != username:
            logger.warning(f"Пользователь {username} попытался удалить сообщение {message_id}, принадлежащее {message.sender}")
            raise HTTPException(status_code=403, detail="Вы можете удалять только свои сообщения")
        
        logger.info(f"file - {message.file_url}, rewrwe - {bool(message.file_url)}")
        if message.file_url:
            file_path = os.path.join("templates", "static", "chat_file", os.path.basename(message.file_url))
            logger.info(f"file_path - {file_path}")
            if os.path.isfile(file_path):
                try:
                    os.remove(file_path)
                    logger.info(f"Файл удалён: {file_path}")
                except Exception as e:
                    logger.error(f"Ошибка при удалении файла {file_path}: {e}")

        assert_membership(db, message.channel_id, username)
        db.delete(message)
        db.commit()
        logger.info(f"Сообщение {message_id} успешно удалено пользователем {username}")

        return {"status": "ok"}
    except Exception as e:
        db.rollback()
        logger.error(f"Неожиданная ошибка при удалении сообщения {message_id} пользователем {username}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Внутренняя ошибка сервера при удалении сообщения: {str(e)}")
    
@router.get("/contacts", response_model=List[Contact])
def search_contacts(
    query: str = Query(..., min_length=1),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    username = current_user["username"]
    logger.debug(f"Searching contacts by {username}: query={query}")
    
    # Если запрос короче 2 символов — ищем всех пользователей
    search_term = query if len(query) >= 2 else ""
    
    try:
        results = search_ad_users(search_term)
        return [
            Contact(
                id=user["id"],
                displayName=user["displayName"],
                position=user["position"],
                department=user["department"],
                phone_internal=user["phone_internal"],
                email=user["email"],
                sam_account_name=user["id"],
            )
            for user in results
        ]
    except Exception as e:
        logger.error(f"Error searching contacts: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Не удалось найти контакты: {str(e)}")

@router.get("/messages/{message_id}", response_model=MessageResponse)
def get_message(
    message_id: UUIDType = Path(..., description="ID сообщения"),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Получить информацию о конкретном сообщении по его ID.
    """
    username = current_user["username"]
    logger.debug(f"Fetching message {message_id} for user {username}")

    try:
        message = db.query(Message).filter(Message.id == message_id).first()
        if not message:
            logger.info(f"Message {message_id} not found")
            raise HTTPException(status_code=404, detail="Сообщение не найдено")

        logger.debug(f"Message {message_id} fetched successfully for user {username}")
        return message

    except Exception as e:
        logger.error(f"Unexpected error fetching message {message_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")

@router.post("/messages/edit")
async def edit_message(
    body: EditMessageRequest,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    username = current_user["username"]
    logger.debug(f"Editing message {body.message_id} by {username}")
    try:
        message = db.query(Message).filter(Message.id == body.message_id).first()
        if not message:
            raise HTTPException(status_code=404, detail="Сообщение не найдено")
        if message.sender != username:
            raise HTTPException(status_code=403, detail="Вы можете редактировать только свои сообщения")
        assert_membership(db, message.channel_id, username)
        message.content = body.content
        message.edited = True
        db.commit()
        db.refresh(message)
        payload = {
            "type": "message_edited",
            "data": {
                "id": str(message.id),
                "channel_id": str(message.channel_id),
                "content": message.content,
                "edited": True,
            },
        }
        await manager.broadcast_to_channel_members(payload, message.channel_id, db)
        return {"status": "ok"}
    except HTTPException as e:
        raise e
    except Exception as e:
        db.rollback()
        logger.error(f"Error editing message {body.message_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Не удалось отредактировать сообщение: {str(e)}")

@router.post("/messages/delete")
async def delete_message(
    body: DeleteMessageRequest,
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    username = current_user["username"]
    logger.debug(f"Deleting message {body.message_id} by {username}")
    try:
        message = db.query(Message).filter(Message.id == body.message_id).first()
        if not message:
            raise HTTPException(status_code=404, detail="Сообщение не найдено")
        if message.sender != username:
            raise HTTPException(status_code=403, detail="Вы можете удалять только свои сообщения")
        assert_membership(db, message.channel_id, username)
        db.delete(message)
        db.commit()
        payload = {
            "type": "message_deleted",
            "data": {
                "id": str(message.id),
                "channel_id": str(message.channel_id),
            },
        }
        await manager.broadcast_to_channel_members(payload, message.channel_id, db)
        return {"status": "ok"}
    except HTTPException as e:
        raise e
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting message {body.message_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Не удалось удалить сообщение: {str(e)}")

# -----------------------------
# WEBSOCKET
# -----------------------------
@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: Optional[str] = Query(None)):
    await websocket.accept()
    
    if not token:
        logger.error("WebSocket connection attempt without token")
        await websocket.send_json({"type": "error", "error": "Требуется токен"})
        await websocket.close(code=1008)
        return

    # Детальная диагностика токена
    logger.info(f"WebSocket token received (first 20 chars): {token[:20]}...")
    
    try:
        # ИСПРАВЛЕНИЕ: Используем правильную функцию из jwt_utils
        from services.jwt_utils import verify_token as jwt_verify_token
        
        user_data = jwt_verify_token(token)
        if not user_data:
            logger.error("verify_token returned None/False")
            await websocket.send_json({"type": "error", "error": "Недействительный токен"})
            await websocket.close(code=1008)
            return
            
        if "username" not in user_data:
            logger.error(f"Token missing username field. Token data: {user_data}")
            await websocket.send_json({"type": "error", "error": "Токен не содержит username"})
            await websocket.close(code=1008)
            return

        username: str = user_data["username"]
        logger.info(f"WebSocket authentication successful for user: {username}")

    except Exception as e:
        logger.error(f"Token verification error: {e}", exc_info=True)
        await websocket.send_json({"type": "error", "error": f"Ошибка проверки токена: {str(e)}"})
        await websocket.close(code=1008)
        return

    # Подключаем WebSocket
    await manager.connect(websocket, username)
    logger.info(f"WS connected: {username}")
    db = None

    try:
        db = SessionLocal()

        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                logger.error(f"Invalid JSON received from {username}")
                await websocket.send_json({"type": "error", "error": "Неверный формат JSON"})
                continue

            action = data.get("type")
            payload = data.get("data", {})

            if action == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            if action == "send_message":
                channel_id_str = payload.get("channel_id")
                content = payload.get("content", "").strip() if payload.get("content") else ""
                contacts = payload.get("members")
                forward_members = [contact["id"] for contact in contacts] if contacts else []
                logger.info(f"forward_members - {forward_members}")
                file_url = payload.get("file_url")
                file_name = payload.get("file_name")
                quoted_message_id_str = payload.get("quoted_message_id")
                forward_message_id_str = payload.get("forward_message_id")
                
                logger.info(f"quoted_message_id_str - {quoted_message_id_str}, forward_message_id_str - {forward_message_id_str}")
                
                forward_message_id = None
                if forward_message_id_str:
                    try:
                        forward_message_id = uuid.UUID(forward_message_id_str)
                        logger.debug(f"Forward message ID received: {forward_message_id}")
                    except ValueError:
                        logger.warning(f"Invalid quoted_message_id format received: {forward_message_id_str}")

                quoted_message_id = None
                if quoted_message_id_str:
                    try:
                        quoted_message_id = uuid.UUID(quoted_message_id_str)
                        logger.debug(f"Quoted message ID received: {quoted_message_id}")
                    except ValueError:
                        logger.warning(f"Invalid quoted_message_id format received: {quoted_message_id_str}")

                if not channel_id_str and not forward_members:
                    await websocket.send_json({"type": "error", "message": "Нужно указать либо channel_id, либо members для пересылки"})
                    continue
                
                if len(forward_members) == 0 and not content and not file_url:
                    await websocket.send_json({"type": "error", "message": "Пустое сообщение"})
                    continue
                type_message = "forward_message" if forward_members else "new_message"
                
                target_channels = []
                if forward_members:
                    if not isinstance(forward_members, list):
                        await websocket.send_json({"type": "error", "message": "members должен быть списком"})
                        continue

                    for member in forward_members:
                        if member == username:
                            continue
                        
                        channel = db.query(Channel).filter(
                            Channel.is_group == False,
                            Channel.members.contains([username, member])
                        ).first()

                        if channel:
                            target_channels.append(channel.id)
                        else:
                            logger.warning(f"No direct channel found between {username} and {member}")
                else:
                    try:
                        channel_id = uuid.UUID(channel_id_str)
                        target_channels = [channel_id]
                    except (ValueError, TypeError) as e:
                        logger.warning(f"WS send_message validation error for {username}: {e}")
                        await websocket.send_json({"type": "error", "message": "Неверный формат channel_id"})
                        continue
                
                logger.info(f"target_channels - {target_channels}, forward_members - {forward_members}")
                sent_messages = []
                for ch_id in target_channels:
                    msg = Message(
                        id=uuid.uuid4(),
                        channel_id=ch_id,
                        sender=username,
                        content=content or None,
                        is_read=False,
                        file_url=file_url,
                        file_name=file_name,
                        edited=False,
                        quoted_message_id=quoted_message_id,
                        forward_message_id=forward_message_id,
                        timestamp=datetime.now(timezone.utc)
                    )
                    try:
                        db.add(msg)
                        db.commit()
                        db.refresh(msg)
                        logger.debug(f"Message saved to DB in channel {ch_id}: {msg.id}")
                        sent_messages.append(msg)
                    except Exception as e:
                        db.rollback()
                        logger.error(f"Failed to save message in channel {ch_id} for {username}: {e}", exc_info=True)
                        continue

                for msg in sent_messages:
                    payload_response = {
                        "type": type_message,
                        "data": {
                            "id": str(msg.id),
                            "channel_id": str(msg.channel_id),
                            "sender": msg.sender,
                            "content": msg.content,
                            "timestamp": msg.timestamp.isoformat(),
                            "is_read": msg.is_read,
                            "file_url": msg.file_url,
                            "file_name": msg.file_name,
                            "edited": msg.edited,
                            "quoted_message_id": str(msg.quoted_message_id) if msg.quoted_message_id else None,
                            "forward_message_id": str(msg.forward_message_id) if msg.forward_message_id else None,
                        },
                    }
                    await manager.broadcast_to_channel_members(payload_response, msg.channel_id, db)

                await websocket.send_json({"type": "send_message", "status": "ok"})
                logger.debug(f"Forwarded message to {len(sent_messages)} channels for {username}")

            elif action == "typing_start" or action == "typing_stop":
                channel_id_str = payload.get("channel_id")
                if channel_id_str:
                    try:
                        channel_id = UUIDType(channel_id_str)
                        assert_membership(db, channel_id, username)
                        await manager.broadcast_to_channel_members({
                            "type": action,
                            "data": {"channel_id": str(channel_id), "user": username}
                        }, channel_id, db)
                    except (ValueError, HTTPException):
                        await websocket.send_json({"type": "error", "error": "Неверный канал или доступ запрещен"})

            elif action == "react":
                message_id_str = payload.get("message_id")
                reaction = payload.get("reaction")
                channel_id = payload.get("channel_id")
                message_sender = payload.get("messageSender")

                logger.info(f"message_id_str - {message_id_str}, reaction - {reaction}, reactor - {username}")

                if not message_id_str or (reaction is not None and (not isinstance(reaction, str) or len(reaction) > 10)):
                    await websocket.send_json({"type": "error", "error": "Неверные данные реакции"})
                    continue

                try:
                    message_id = UUIDType(message_id_str)
                    assert_membership(db, channel_id, username)

                    message = db.query(Message).filter(
                        Message.id == message_id,
                        Message.channel_id == channel_id
                    ).first()
                    if not message:
                        await websocket.send_json({"type": "error", "error": "Сообщение не найдено"})
                        continue

                    owner_username = message.sender

                    existing = db.query(Reaction).filter(
                        Reaction.message_id == message_id,
                        Reaction.user_id == username
                    ).first()

                    reaction_to_broadcast = None

                    if existing:
                        if reaction is None or reaction == "":
                            db.delete(existing)
                            reaction_to_broadcast = None
                        else:
                            existing.reaction = reaction
                            existing.is_read = False
                            existing.updated_at = datetime.utcnow()
                            reaction_to_broadcast = {
                                "emoji": existing.reaction,
                                "is_read": existing.is_read,
                                "timestamp": existing.updated_at.isoformat()
                            }
                    else:
                        if reaction is None or reaction == "":
                            pass
                        else:
                            new_reaction = Reaction(
                                message_id=message_id,
                                user_id=username,
                                reaction=reaction,
                                is_read=False,
                                channel_id=channel_id,
                                created_at=datetime.utcnow()
                            )
                            db.add(new_reaction)
                            reaction_to_broadcast = {
                                "emoji": new_reaction.reaction,
                                "is_read": new_reaction.is_read,
                                "timestamp": new_reaction.created_at.isoformat()
                            }

                            if owner_username != username:
                                notification_payload = {
                                    "type": "reaction_notification",
                                    "data": {
                                        "channel_id": channel_id,
                                        "message_id": str(message_id),
                                        "reaction": reaction,
                                        "reactor": username,
                                    }
                                }
                                await manager.broadcast_to_user(notification_payload, owner_username)

                    db.commit()

                    broadcast_data = {
                        "message_id": str(message_id),
                        "user_id": username,
                        "reaction": reaction_to_broadcast,
                        "channel_id": channel_id,
                    }

                    await manager.broadcast_to_channel_members({
                        "type": "reaction_update",
                        "data": broadcast_data
                    }, channel_id, db)

                except Exception as e:
                    db.rollback()
                    logger.error(f"Error handling reaction: {e}", exc_info=True)
                    await websocket.send_json({"type": "error", "error": "Не удалось поставить реакцию"})
                    
            elif action == "edit_message":
                message_id_str = payload.get("message_id")
                content = payload.get("content", "").strip()
                if not message_id_str or not content:
                    await websocket.send_json({"type": "error", "error": "Пустое содержимое или неверный ID"})
                    continue
                try:
                    message_id = UUIDType(message_id_str)
                    await edit_message(
                        body=EditMessageRequest(message_id=message_id, content=content),
                        db=db,
                        current_user={"username": username}
                    )
                except Exception as e:
                    logger.error(f"Error editing message via WS: {e}")
                    await websocket.send_json({"type": "error", "error": f"Ошибка редактирования: {str(e)}"})

            elif action == "delete_message":
                message_id_str = payload.get("message_id")
                if not message_id_str:
                    await websocket.send_json({"type": "error", "error": "Неверный ID сообщения"})
                    continue
                try:
                    message_id = UUIDType(message_id_str)
                    await delete_message(
                        body=DeleteMessageRequest(message_id=message_id),
                        db=db,
                        current_user={"username": username}
                    )
                except Exception as e:
                    logger.error(f"Error deleting message via WS: {e}")
                    await websocket.send_json({"type": "error", "error": f"Ошибка удаления: {str(e)}"})

    except WebSocketDisconnect:
        logger.info(f"WS disconnected: {username}")
    except Exception as e:
        logger.error(f"WS error for {username}: {e}", exc_info=True)
        await websocket.send_json({"type": "error", "error": f"Ошибка WebSocket: {str(e)}"})
    finally:
        logger.info("Disconnecting WebSocket")
        await manager.disconnect(websocket, username)
        if db:
            if db.in_transaction():
                db.rollback()
            db.close()