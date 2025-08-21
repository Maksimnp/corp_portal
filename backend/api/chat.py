import os
import json
import logging
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Any
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query, UploadFile, File
from sqlalchemy import Column, String, ForeignKey, DateTime, Boolean, create_engine, inspect, text
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import declarative_base, sessionmaker, Session, relationship
from sqlalchemy.sql import func
from pydantic import BaseModel, Field, ConfigDict
from uuid import UUID as UUIDType
from services.jwt_utils import get_current_user, verify_token
import ldap
import anyio

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

# -----------------------------
# Настройка Active Directory
# -----------------------------
LDAP_SERVER = os.getenv("LDAP_SERVER", "ldap://192.1.3.6:389")
LDAP_USER = os.getenv("LDAP_USER", "ServiceReader")
LDAP_PASSWORD = os.getenv("LDAP_PASSWORD", "Season24")
LDAP_BASE_DN = os.getenv("LDAP_BASE_DN", "DC=mhp,DC=net")
BYPASS_AD_VALIDATION = os.getenv("BYPASS_AD_VALIDATION", "false").lower() == "true"

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

class Message(Base):
    __tablename__ = "messages"
    id = Column(UUID(as_uuid=True), primary_key=True, index=True, default=uuid.uuid4)
    channel_id = Column(UUID(as_uuid=True), ForeignKey("channels.id", ondelete="CASCADE"), index=True, nullable=False)
    sender = Column(String, index=True, nullable=False)
    content = Column(String, nullable=True)  # Allow null for file-only messages
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True, nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)
    file_url = Column(String, nullable=True)
    file_name = Column(String, nullable=True)
    channel = relationship("Channel", back_populates="messages")

# Создание таблиц и миграция


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

class MessageCreate(BaseModel):
    channel_id: UUIDType
    content: Optional[str] = Field(None, min_length=1, max_length=10000)
    file_url: Optional[str] = None
    file_name: Optional[str] = None

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
# Active Directory утилиты
# -----------------------------
def validate_ad_user(username: str) -> bool:
    if BYPASS_AD_VALIDATION:
        logger.warning(f"Bypassing AD validation for {username} (BYPASS_AD_VALIDATION=true)")
        return True
    try:
        logger.debug(f"Attempting to validate AD user: {username}, LDAP_SERVER={LDAP_SERVER}, LDAP_BASE_DN={LDAP_BASE_DN}")
        conn = ldap.initialize(LDAP_SERVER)
        conn.set_option(ldap.OPT_REFERRALS, 0)
        conn.set_option(ldap.OPT_PROTOCOL_VERSION, 3)
        logger.debug(f"Binding with LDAP_USER={LDAP_USER}")
        conn.simple_bind_s(LDAP_USER, LDAP_PASSWORD)
        search_filter = f"(sAMAccountName={username})"
        logger.debug(f"Searching with filter: {search_filter}")
        result = conn.search_s(LDAP_BASE_DN, ldap.SCOPE_SUBTREE, search_filter, ["sAMAccountName"])
        conn.unbind_s()
        found = len([r for r in result if r[0] is not None]) > 0
        logger.debug(f"AD validation for {username}: {'Found' if found else 'Not found'}")
        return found
    except ldap.INVALID_CREDENTIALS:
        logger.error(f"LDAP bind failed for {LDAP_USER}: Invalid credentials")
        raise HTTPException(status_code=500, detail="Ошибка аутентификации в Active Directory: неверные учетные данные")
    except ldap.SERVER_DOWN:
        logger.error(f"LDAP server {LDAP_SERVER} is down or unreachable")
        raise HTTPException(status_code=500, detail=f"LDAP сервер {LDAP_SERVER} недоступен")
    except ldap.LDAPError as e:
        logger.error(f"LDAP error validating user {username}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка проверки пользователя в Active Directory: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error validating AD user {username}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Неожиданная ошибка при проверке пользователя: {str(e)}")

def search_ad_users(query: str) -> List[Dict[str, Any]]:
    if BYPASS_AD_VALIDATION:
        logger.warning(f"Bypassing AD search for query '{query}' (BYPASS_AD_VALIDATION=true)")
        return [{"id": query, "displayName": query, "position": "", "department": "", "phone_internal": "", "email": ""}]
    try:
        query = query.encode('utf-8').decode('utf-8')
        logger.debug(f"Searching AD users with query: '{query}', LDAP_SERVER={LDAP_SERVER}, LDAP_BASE_DN={LDAP_BASE_DN}")
        conn = ldap.initialize(LDAP_SERVER)
        conn.set_option(ldap.OPT_REFERRALS, 0)
        conn.set_option(ldap.OPT_PROTOCOL_VERSION, 3)
        conn.simple_bind_s(LDAP_USER, LDAP_PASSWORD)
        search_filter = f"(|(sAMAccountName=*{query}*)(displayName=*{query}*)(mail=*{query}*))"
        logger.debug(f"LDAP search filter: {search_filter}")
        results = conn.search_s(
            LDAP_BASE_DN,
            ldap.SCOPE_SUBTREE,
            search_filter,
            ["sAMAccountName", "displayName", "title", "department", "telephoneNumber", "mail"]
        )
        users = []
        for dn, entry in results:
            if dn is None:
                continue  # Skip None DN entries
            user_dict = {
                "id": entry.get("sAMAccountName", [b""])[0].decode("utf-8", errors="ignore") or "",
                "displayName": entry.get("displayName", [b""])[0].decode("utf-8", errors="ignore") or "",
                "position": entry.get("title", [b""])[0].decode("utf-8", errors="ignore") or "",
                "department": entry.get("department", [b""])[0].decode("utf-8", errors="ignore") or "",
                "phone_internal": entry.get("telephoneNumber", [b""])[0].decode("utf-8", errors="ignore") or "",
                "email": entry.get("mail", [b""])[0].decode("utf-8", errors="ignore") or "",
            }
            logger.debug(f"Processed LDAP entry: DN={dn}, user={user_dict}")
            users.append(user_dict)
        conn.unbind_s()
        logger.info(f"Found {len(users)} users in AD for query: '{query}'")
        return users[:20]
    except ldap.INVALID_CREDENTIALS:
        logger.error(f"LDAP bind failed for {LDAP_USER}: Invalid credentials")
        raise HTTPException(status_code=500, detail="Ошибка аутентификации в Active Directory: неверные учетные данные")
    except ldap.SERVER_DOWN:
        logger.error(f"LDAP server {LDAP_SERVER} is down or unreachable")
        raise HTTPException(status_code=500, detail=f"LDAP сервер {LDAP_SERVER} недоступен")
    except ldap.LDAPError as e:
        logger.error(f"LDAP error searching users: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка поиска пользователей в Active Directory: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error searching AD users for query '{query}': {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Неожиданная ошибка при поиске пользователей: {str(e)}")

# -----------------------------
# DEPENDS
# -----------------------------
def get_db() -> Session:
    db = SessionLocal()
    logger.debug(f"New DB session created: {id(db)}, in_transaction: {db.in_transaction()}")
    try:
        if db.in_transaction():
            logger.warning("Session already in transaction, rolling back")
            db.rollback()
        yield db
    finally:
        db.close()

# -----------------------------
# WEBSOCKET МЕНЕДЖЕР
# -----------------------------
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, ws: WebSocket, username: str):
        if username not in self.active_connections:
            self.active_connections[username] = []
        self.active_connections[username].append(ws)
        logger.debug(f"User {username} connected to WebSocket")

    def disconnect(self, ws: WebSocket, username: str):
        if username in self.active_connections:
            conns = self.active_connections[username]
            if ws in conns:
                conns.remove(ws)
                logger.debug(f"User {username} disconnected from WebSocket")
            if not conns:
                del self.active_connections[username]
                logger.debug(f"No active connections for {username}")

    async def broadcast_to_channel_members(self, payload: Dict[str, Any], channel_id: UUIDType, db: Session):
        channel = db.query(Channel).filter(Channel.id == channel_id).first()
        if not channel:
            logger.warning(f"Channel {channel_id} not found for broadcast")
            return
        usernames = channel.members
        for uname in usernames:
            conns = self.active_connections.get(uname, [])
            for ws in conns:
                try:
                    await ws.send_json(payload)
                except Exception as e:
                    logger.error(f"WS send error to {uname}: {e}")

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

def serialize_chat(db: Session, chat: Channel) -> ChatResponse:
    return ChatResponse(
        id=chat.id,
        name=chat.name or "",
        description=chat.description,
        is_group=chat.is_group,
        is_channel=chat.is_channel,
        creator_username=chat.creator_username,
        members=chat.members
    )

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
        return [serialize_chat(db, ch) for ch in chats]
    except Exception as e:
        logger.error(f"Error fetching chats for {username}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Не удалось загрузить чаты: {str(e)}")

@router.get("/{channel_id}/messages", response_model=List[MessageResponse])
def get_messages(
    channel_id: UUIDType,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    username = current_user["username"]
    logger.debug(f"Fetching messages for channel {channel_id} by {username}")
    try:
        assert_membership(db, channel_id, username)
        messages = (
            db.query(Message)
            .filter(Message.channel_id == channel_id)
            .order_by(Message.timestamp.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        return messages
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
        file_name=body.file_name
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
    body: Dict[str, List[str]],
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    username = current_user["username"]
    logger.debug(f"Marking messages as read by {username}: {body}")
    message_ids = [UUIDType(id) for id in body.get("message_ids", [])]
    if not message_ids:
        raise HTTPException(status_code=400, detail="Не предоставлены ID сообщений")
    try:
        messages = db.query(Message).filter(Message.id.in_(message_ids)).all()
        updated = []
        for message in messages:
            try:
                assert_membership(db, message.channel_id, username)
                if not message.is_read and message.sender != username:
                    message.is_read = True
                    updated.append(message)
            except HTTPException:
                continue
        if updated:
            db.commit()
            for message in updated:
                await manager.broadcast_to_channel_members(
                    {
                        "type": "message_read",
                        "data": {"message_id": str(message.id), "channel_id": str(message.channel_id)},
                    },
                    message.channel_id,
                    db,
                )
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Error marking messages as read: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Не удалось пометить сообщения как прочитанные: {str(e)}")

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    username = current_user["username"]
    logger.debug(f"Uploading file by {username}: {file.filename}")
    max_size = 10 * 1024 * 1024  # 10MB
    if file.size > max_size:
        raise HTTPException(status_code=400, detail="Файл слишком большой (макс. 10 МБ)")
    try:
        upload_dir = "uploads"
        os.makedirs(upload_dir, exist_ok=True)
        file_path = os.path.join(upload_dir, f"{uuid.uuid4()}_{file.filename}")
        with open(file_path, "wb") as buffer:
            buffer.write(await file.read())
        file_url = f"/static/{os.path.basename(file_path)}"
        return {"url": file_url, "file_name": file.filename}
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
            return serialize_chat(db, existing)
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
                "channel_id": str(chat.id),
                "members": chat.members,
                "created_by": username,
            }
        }
        try:
            anyio.from_thread.run(manager.broadcast_to_channel_members, payload, chat.id, db)
        except Exception as e:
            logger.warning(f"Failed to broadcast private_chat_created: {e}")
        return serialize_chat(db, chat)
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
                "channel_id": str(chat.id),
                "name": chat.name,
                "created_by": owner,
            }
        }
        logger.debug(f"Broadcasting group_created: {payload}")
        try:
            anyio.from_thread.run(manager.broadcast_to_channel_members, payload, chat.id, db)
        except Exception as e:
            logger.warning(f"Failed to broadcast group_created: {e}")
        return serialize_chat(db, chat)
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
    logger.debug(f"Creating channel by {owner}: {body.name}, description: {body.description}")
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
        return serialize_chat(db, chat)
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
    if not channel.is_channel:
        raise HTTPException(status_code=400, detail="Это не канал")
    if channel.creator_username != username:
        raise HTTPException(status_code=403, detail="Только создатель может приглашать пользователей")
    existing_members = set(channel.members)
    valid_members = []
    invalid_members = []
    for member in body.members:
        if member in existing_members:
            continue
        if validate_ad_user(member):
            valid_members.append(member)
        else:
            invalid_members.append(member)
    try:
        if valid_members:
            channel.members.extend(valid_members)
            db.commit()
            db.refresh(channel)
            payload = {
                "type": "channel_invite",
                "data": {
                    "channel_id": str(channel_id),
                    "channel_name": channel.name,
                    "invited_by": username,
                    "members": valid_members,
                }
            }
            logger.debug(f"Broadcasting channel_invite: {payload}")
            try:
                anyio.from_thread.run(manager.broadcast_to_channel_members, payload, channel_id, db)
            except Exception as e:
                logger.warning(f"Failed to broadcast channel_invite: {e}")
        if invalid_members:
            logger.warning(f"Some users not invited to channel {channel_id}: {invalid_members}")
        return {"status": "ok", "invited": len(valid_members), "not_found": invalid_members}
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
        try:
            anyio.from_thread.run(manager.broadcast_to_channel_members, payload, channel_id, db)
        except Exception as e:
            logger.warning(f"Failed to broadcast channel_kick: {e}")
        return {"status": "ok", "kicked": kicked, "not_found": not_found}
    except Exception as e:
        db.rollback()
        logger.error(f"Error kicking from channel {channel_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Не удалось исключить пользователей: {str(e)}")

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

@router.get("/contacts", response_model=List[Contact])
def search_contacts(
    query: str = Query(..., min_length=1),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    username = current_user["username"]
    logger.debug(f"Searching contacts by {username}: query={query}")
    if len(query) < 2:
        return []
    try:
        results = search_ad_users(query)
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
    user_data = verify_token(token)
    if not user_data or "username" not in user_data:
        logger.error(f"Invalid or expired token for WebSocket: {token[:10]}...")
        await websocket.send_json({"type": "error", "error": "Недействительный или истекший токен"})
        await websocket.close(code=1008)
        return
    username: str = user_data["username"]
    await manager.connect(websocket, username)
    logger.info(f"WS connected: {username}")

    db = SessionLocal()
    try:
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
                content = payload.get("content", "").strip()
                if not channel_id_str or (not content and not payload.get("file_url")):
                    await websocket.send_json({"type": "error", "error": "Пустое сообщение или неверный канал"})
                    continue
                try:
                    channel_id = UUIDType(channel_id_str)
                    assert_membership(db, channel_id, username)
                except (ValueError, HTTPException):
                    await websocket.send_json({"type": "error", "error": "Неверный канал или доступ запрещен"})
                    continue
                msg = Message(
                    id=uuid.uuid4(),
                    channel_id=channel_id,
                    sender=username,
                    content=content or None,
                    is_read=False,
                    file_url=payload.get("file_url"),
                    file_name=payload.get("file_name"),
                )
                try:
                    db.add(msg)
                    db.commit()
                    db.refresh(msg)
                    await manager.broadcast_to_channel_members({
                        "type": "new_message",
                        "data": {
                            "id": str(msg.id),
                            "channel_id": str(msg.channel_id),
                            "sender": username,
                            "content": msg.content,
                            "timestamp": msg.timestamp.isoformat(),
                            "is_read": False,
                            "file_url": msg.file_url,
                            "file_name": msg.file_name,
                        },
                    }, msg.channel_id, db)
                except Exception as e:
                    db.rollback()
                    logger.error(f"Error sending message via WS: {e}", exc_info=True)
                    await websocket.send_json({"type": "error", "error": f"Ошибка отправки сообщения: {str(e)}"})

            elif action == "typing":
                channel_id_str = payload.get("channel_id")
                if channel_id_str:
                    try:
                        channel_id = UUIDType(channel_id_str)
                        assert_membership(db, channel_id, username)
                        await manager.broadcast_to_channel_members({
                            "type": "typing",
                            "data": {"channel_id": str(channel_id), "user": username}
                        }, channel_id, db)
                    except (ValueError, HTTPException):
                        await websocket.send_json({"type": "error", "error": "Неверный канал или доступ запрещен"})

    except WebSocketDisconnect:
        logger.info(f"WS disconnected: {username}")
    except Exception as e:
        logger.error(f"WS error for {username}: {e}", exc_info=True)
        await websocket.send_json({"type": "error", "error": f"Ошибка WebSocket: {str(e)}"})
    finally:
        manager.disconnect(websocket, username)
        if db.in_transaction():
            db.rollback()
        db.close()