import os
import logging
import uuid
from datetime import datetime
from typing import List, Optional, Dict
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, status, UploadFile, File, Form, Query
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from ldap3 import Server, Connection, ALL, SUBTREE, MODIFY_REPLACE
from dotenv import load_dotenv

load_dotenv()

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

router = APIRouter(tags=["Chat"])

# Настройки LDAP из .env
LDAP_SERVER = os.getenv("LDAP_SERVER", "ldap://192.1.3.6:389")
LDAP_USER = os.getenv("LDAP_USER", "ServiceReader@mhp.net")
LDAP_PASSWORD = os.getenv("LDAP_PASSWORD", "Season24")
BASE_DN = os.getenv("BASE_DN", "DC=mhp,DC=net")
SEARCH_TIMEOUT = int(os.getenv("SEARCH_TIMEOUT", 30))

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# Модели данных
class User(BaseModel):
    dn: str
    username: str
    full_name: str
    email: Optional[str]
    department: Optional[str]
    position: Optional[str]

class Channel(BaseModel):
    id: str
    name: str
    creator: str
    is_private: bool
    members: List[str]
    created_at: datetime

class Message(BaseModel):
    id: str
    channel_id: str
    sender: str
    content: str
    timestamp: datetime
    is_file: bool = False

class ChatService:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self.channels: Dict[str, Channel] = {}
        self.messages: Dict[str, List[Message]] = {}

    async def connect(self, websocket: WebSocket, channel_id: str, username: str):
        await websocket.accept()
        if channel_id not in self.active_connections:
            self.active_connections[channel_id] = []
        self.active_connections[channel_id].append(websocket)

    async def disconnect(self, websocket: WebSocket, channel_id: str, username: str):
        if channel_id in self.active_connections:
            self.active_connections[channel_id].remove(websocket)

    async def broadcast(self, channel_id: str, message: Message):
        if channel_id in self.active_connections:
            for connection in self.active_connections[channel_id]:
                try:
                    await connection.send_json(message.dict())
                except Exception as e:
                    logger.error(f"Error broadcasting message: {e}")

    async def create_channel(self, channel: Channel) -> Channel:
        self.channels[channel.id] = channel
        return channel

    async def get_user_channels(self, username: str) -> List[Channel]:
        return [channel for channel in self.channels.values() 
                if not channel.is_private or username in channel.members]

    async def can_access_channel(self, username: str, channel_id: str) -> bool:
        channel = self.channels.get(channel_id)
        if not channel:
            return False
        return not channel.is_private or username in channel.members

    async def save_message(self, message: Message):
        if message.channel_id not in self.messages:
            self.messages[message.channel_id] = []
        self.messages[message.channel_id].append(message)

    async def get_channel_messages(self, channel_id: str, limit: int, offset: int) -> List[Message]:
        if channel_id not in self.messages:
            return []
        return self.messages[channel_id][offset:offset+limit]

chat_service = ChatService()

# LDAP функции
def get_ldap_connection():
    try:
        server = Server(
            LDAP_SERVER, 
            get_info=ALL,
            connect_timeout=10
        )
        conn = Connection(
            server, 
            user=LDAP_USER, 
            password=LDAP_PASSWORD,
            auto_bind=True,
            receive_timeout=SEARCH_TIMEOUT
        )
        logger.info(f"Успешное подключение к {LDAP_SERVER}")
        return conn
    except Exception as e:
        logger.error(f"Ошибка подключения к LDAP: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Не удалось подключиться к серверу LDAP"
        )

async def get_ad_contacts(search: str = "", limit: int = 100) -> List[User]:
    conn = None
    try:
        conn = get_ldap_connection()
        
        search_filter = "(&(objectClass=user)(objectCategory=person))"
        if search:
            search_filter = f"(&{search_filter}(|(cn=*{search}*)(givenName=*{search}*)(sn=*{search}*)(mail=*{search}*)))"

        logger.info(f"Поиск контактов с фильтром: {search_filter}")
        
        attributes = [
            'dn', 'sAMAccountName', 'cn', 'givenName', 'sn', 'mail',
            'telephoneNumber', 'department', 'title'
        ]
        
        conn.search(
            search_base=BASE_DN,
            search_filter=search_filter,
            search_scope=SUBTREE,
            attributes=attributes,
            size_limit=limit
        )
        
        if not conn.entries:
            return []

        contacts = []
        for entry in conn.entries:
            contacts.append(User(
                dn=entry.entry_dn,
                username=entry.sAMAccountName.value,
                full_name=entry.cn.value,
                email=entry.mail.value if 'mail' in entry else None,
                department=entry.department.value if 'department' in entry else None,
                position=entry.title.value if 'title' in entry else None
            ))

        return contacts

    except Exception as e:
        logger.error(f"Ошибка при поиске контактов: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ошибка при получении контактов из AD"
        )
    finally:
        if conn:
            conn.unbind()

# WebSocket endpoint
@router.websocket("/ws/{channel_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    channel_id: str,
    token: str = Query(...)
):
    user = verify_token(token)
    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await chat_service.connect(websocket, channel_id, user['username'])
    try:
        while True:
            data = await websocket.receive_json()
            if data['type'] == 'message':
                message = Message(
                    id=str(uuid.uuid4()),
                    channel_id=channel_id,
                    sender=user['username'],
                    content=data['content'],
                    timestamp=datetime.now(),
                    is_file=data.get('is_file', False)
                )
                await chat_service.broadcast(channel_id, message)
    except WebSocketDisconnect:
        await chat_service.disconnect(websocket, channel_id, user['username'])
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await chat_service.disconnect(websocket, channel_id, user['username'])

# REST endpoints
@router.post("/channels", response_model=Channel)
async def create_channel(
    name: str = Form(...),
    is_private: bool = Form(False),
    members: List[str] = Form([]),
    token: str = Depends(oauth2_scheme)
):
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    
    channel = Channel(
        id=str(uuid.uuid4()),
        name=name,
        creator=user['username'],
        is_private=is_private,
        members=members + [user['username']],
        created_at=datetime.now()
    )
    
    return await chat_service.create_channel(channel)

@router.get("/channels", response_model=List[Channel])
async def get_user_channels(token: str = Depends(oauth2_scheme)):
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    
    return await chat_service.get_user_channels(user['username'])

@router.post("/messages", response_model=Message)
async def send_message(
    channel_id: str,
    content: str = Form(None),
    file: UploadFile = File(None),
    token: str = Depends(oauth2_scheme)
):
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    
    file_url = None
    if file:
        file_path = f"uploads/{channel_id}_{file.filename}"
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, "wb") as buffer:
            buffer.write(await file.read())
        file_url = f"/{file_path}"
    
    message = Message(
        id=str(uuid.uuid4()),
        channel_id=channel_id,
        sender=user['username'],
        content=content or file_url,
        timestamp=datetime.now(),
        is_file=bool(file)
    )
    
    await chat_service.save_message(message)
    await chat_service.broadcast(channel_id, message)
    return message

@router.get("/messages/{channel_id}", response_model=List[Message])
async def get_channel_messages(
    channel_id: str,
    limit: int = 100,
    offset: int = 0,
    token: str = Depends(oauth2_scheme)
):
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    
    if not await chat_service.can_access_channel(user['username'], channel_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    
    return await chat_service.get_channel_messages(channel_id, limit, offset)

@router.get("/contacts", response_model=List[User])
async def get_contacts(
    search: str = "",
    token: str = Depends(oauth2_scheme)
):
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    
    return await get_ad_contacts(search)