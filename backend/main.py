from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, status, Depends, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import HTTPException
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.staticfiles import StaticFiles
from fastapi import WebSocket, WebSocketDisconnect
import uvicorn
import logging
import logging.config
from dotenv import load_dotenv
import os
from api.contacts import get_all_groups
from api.routes.documents import router as documents_router
from api.auth import router as auth_router
from api.contacts import router as contacts_router
from api.admin import router as admin_router
from api.request_list import router as request_list_router
from api.chat import router as chat_router
from api.serverstats import router as serverstats_router
from api.faqs import faq_router
from api.emp import employee_tracker_router as employee_tracker_router
from api.software import router as software_router
from api.websocket_manager import websocket_manager
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from fastapi import APIRouter
from services.jwt_utils import verify_token
import asyncio
import json
from datetime import datetime, timedelta
import time

load_dotenv()
URL_FONTS = os.getenv("URL_FONTS")
rest_hosts: Dict[str, Dict[str, Any]] = {}
# Настройка логирования
LOGGING_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "default": {
            "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        },
    },
    "handlers": {
        "file": {
            "class": "logging.handlers.RotatingFileHandler",
            "filename": "app.log",
            "maxBytes": 10_000_000,
            "backupCount": 5,
            "formatter": "default",
            "level": "INFO",
        },
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "default",
            "level": "INFO",
        },
    },
    "root": {
        "level": "INFO",
        "handlers": ["file", "console"],
    },
    "loggers": {
        "uvicorn": {"level": "INFO"},
        "uvicorn.error": {"level": "INFO"},
        "uvicorn.access": {"level": "INFO"},
    },
}

logging.config.dictConfig(LOGGING_CONFIG)
logger = logging.getLogger(__name__)

class EndpointFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if hasattr(record, 'request_path'):
            if record.request_path == '/chat/unread/total':
                return False
        return True

logging.getLogger("uvicorn.access").addFilter(EndpointFilter())

# Проверка переменных окружения
def check_env_vars():
    required_vars = [
        "DB_HOST",
        "DB_DATABASE",
        "DB_USER",
        "DB_PASSWORD",
        "SECRET_KEY",
        "LDAP_SERVER",
        "LDAP_SERVER",
        "BASE_DN",
    ]
    missing = [var for var in required_vars if not os.getenv(var)]
    if missing:
        error_msg = f"Отсутствуют переменные окружения: {', '.join(missing)}"
        logger.critical(error_msg)
        raise EnvironmentError(error_msg)

# Получение CORS origins (добавьте 'null' или IP клиента для теста)
def get_cors_origins():
    origins_str = os.getenv("CORS_ORIGINS", "http://185.179.82.238:3000,http://185.179.82.238/,http://192.1.66.117:3000,http://localhost:3000,https://portal.minskhleb.by,null")
    origins = [origin.strip() for origin in origins_str.split(",") if origin.strip()]
    return origins

# Инициализация приложения FastAPI
app = FastAPI(
    title="Employee Portal API",
    description="API для корпоративного портала: аутентификация, чат, заявки, контакты, документы, удаленный рабочий стол",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Дополнительные CORS headers для WebSocket
@app.middleware("http")
async def add_cors_headers(request: Request, call_next):
    response = await call_next(request)
    origin = request.headers.get('origin')
    if origin in get_cors_origins():
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Allow-Methods'] = '*'
        response.headers['Access-Control-Allow-Headers'] = '*'
    return response

# HTTP маршруты
@app.get("/contacts/groups")
async def list_groups():
    return get_all_groups()

app.mount("/static", StaticFiles(directory="templates/static"), name="static")
app.mount("/static_chat", StaticFiles(directory="templates/static/chat_file"), name="static_chat")

@app.middleware("http")
async def log_requests(request: Request, call_next):
    safe_headers = {
        k: v for k, v in request.headers.items()
        if k.lower() not in ["authorization", "cookie", "set-cookie"]
    }
    logger.info(f"Request: {request.method} {request.url.path} | Origin: {request.headers.get('origin')} | Headers: {safe_headers}")

    try:
        response = await call_next(request)
        logger.info(f"Response: {response.status_code} for {request.url.path}")
        return response
    except HTTPException as e:
        logger.warning(f"HTTPException {e.status_code} on {request.url.path}: {e.detail}")
        raise
    except Exception as e:
        logger.error(f"Unhandled error on {request.url.path}: {e}", exc_info=True)
        raise

# Модель для уведомления
class Notification(BaseModel):
    id: str
    title: str
    description: str
    type: str
    date: str
    isRead: bool
    roles: List[str] = ["user", "admin"]

# Пример базы данных уведомлений (замените на реальную базу, например, PostgreSQL)
notifications_db = []

# Роутер для уведомлений
notification_router = APIRouter(prefix="/notifications", tags=["notifications"])

@notification_router.get("/", response_model=List[Notification])
async def get_notifications(authorization: str = Header(None)):
    user_data = verify_token(authorization.replace("Bearer ", "") if authorization else None)
    if not user_data:
        raise HTTPException(status_code=401, detail="Invalid token")
    return notifications_db

@notification_router.post("/")
async def create_notification(notification: Notification, authorization: str = Header(None)):
    user_data = verify_token(authorization.replace("Bearer ", "") if authorization else None)
    if not user_data:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    notifications_db.append(notification)
    payload = {
        "type": "notification",
        "data": notification.dict()
    }
    await websocket_manager.broadcast_notification(payload, roles=notification.roles)
    logger.info(f"Notification created: {notification.title}")
    return {"status": "Notification sent"}

# WebSocket для software
@app.websocket("/software/ws")
async def websocket_software(websocket: WebSocket, token: str):
    try:
        user = verify_token(token)
        await websocket.accept()
        await websocket_manager.connect(websocket, user.get("roles", ["user"]))
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            websocket_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
        await websocket.close(code=1008)

# ========== REMOTE DESKTOP WEB SOCKET ROUTES ==========

# Импортируем менеджер удаленного рабочего стола
try:
    from services.remote_desktop import remote_manager
    logger.info("Remote Desktop Desktop Manager loaded successfully")
except ImportError as e:
    logger.error(f"Failed to load Remote Desktop Manager: {e}")
    remote_manager = None

async def authenticate_websocket_jwt(websocket: WebSocket, token: str = None, authorization: str = Header(None)) -> Optional[dict]:
    """JWT аутентификация для WebSocket соединений с поддержкой query и header"""
    try:
        auth_token = token
        if authorization and authorization.startswith("Bearer "):
            auth_token = authorization[7:]
            logger.info("WS auth: Using token from Authorization header")
        if not auth_token:
            logger.warning("WebSocket: No token provided (query or header)")
            await websocket.send_json({"type": "auth_error", "message": "Authentication token required"})
            await websocket.close(code=1008, reason="Authentication token required")
            return None
        
        # JWT проверка
        user_data = verify_token(auth_token)
        if user_data:
            logger.info(f"WebSocket JWT authentication successful for user: {user_data.get('username')}. Claims: {user_data}")
            return user_data
        else:
            logger.warning("WebSocket: Invalid JWT token")
            await websocket.send_json({"type": "auth_error", "message": "Invalid or expired token"})
            await websocket.close(code=1008, reason="Invalid or expired token")
            return None
            
    except Exception as e:
        logger.error(f"WebSocket JWT authentication error: {e}")
        await websocket.send_json({"type": "auth_error", "message": "Authentication failed"})
        await websocket.close(code=1008, reason="Authentication failed")
        return None

async def get_current_user(authorization: str = Header(None), token: str = Query(None)):
    """Получение текущего пользователя из JWT токена"""
    auth_token = None
    if authorization and authorization.startswith("Bearer "):
        auth_token = authorization[7:]
    elif token:
        auth_token = token
    
    if not auth_token:
        raise HTTPException(status_code=401, detail="Authentication token required")
    
    user_data = verify_token(auth_token)
    if not user_data:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    return user_data

async def get_current_admin_user(authorization: str = Header(None)):
    """Проверка прав администратора"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization header required")
    
    token = authorization[7:]
    user_data = verify_token(token)
    if not user_data:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    user_role = user_data.get("role", "user")
    if user_role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    return user_data

@app.websocket("/api/remote/host")
async def websocket_host(websocket: WebSocket, token: str = Query(None), authorization: str = Header(None)):
    """WebSocket для хоста (host) - удаленный рабочий стол"""
    # Логируем headers для отладки
    logger.debug(f"WS Host headers: {websocket.headers}")
    
    # Убрана проверка origin для host-клиента (доверенный, не браузер). Добавьте в CORS_ORIGINS если нужно.
    
    await websocket.accept()
    logger.info(f"Host WebSocket connection accepted from headers: {dict(websocket.headers)}")
    
    # JWT аутентификация
    user_data = await authenticate_websocket_jwt(websocket, token, authorization)
    if not user_data:
        return
    
    pc_id = None
    jwt_username = user_data.get("username")
    
    try:
        # Ожидаем аутентификационные данные от хоста с timeout
        auth_data = await asyncio.wait_for(websocket.receive_text(), timeout=10.0)
        
        # Безопасный парсинг JSON
        try:
            auth_message = json.loads(auth_data)
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in auth message: {e}")
            await websocket.send_json({
                "type": "auth_error", 
                "message": "Invalid JSON format"
            })
            await websocket.close(code=1007, reason="Invalid JSON")
            return
        
        # ОБРАБОТКА AUTH СООБЩЕНИЯ ОТ ХОСТА
        if auth_message.get("type") == "auth":
            username = auth_message.get("username")
            system_info = auth_message.get("system_info", {})
            
            if not username:
                await websocket.send_json({
                    "type": "auth_error",
                    "message": "Username required"
                })
                await websocket.close(code=1008, reason="Username required")
                return
            
            # Проверяем, что username из JWT совпадает с username из сообщения
            if username != jwt_username:
                await websocket.send_json({
                    "type": "auth_error",
                    "message": f"Username mismatch. JWT: {jwt_username}, provided: {username}"
                })
                await websocket.close(code=1008, reason="Username mismatch")
                return
            
            # Регистрируем ПК в системе
            if remote_manager:
                pc_id = f"{username}_{system_info.get('hostname', 'pc')}"
                await remote_manager.register_pc(
                    pc_id,
                    username,
                    websocket,
                    system_info
                )
                
                await websocket.send_json({
                    "type": "auth_success",
                    "pc_id": pc_id,
                    "message": "Host registered successfully"
                })
                logger.info(f"Host registered: {pc_id}")
            else:
                await websocket.send_json({
                    "type": "auth_error", 
                    "message": "Remote desktop service unavailable"
                })
                await websocket.close(code=1008, reason="Service unavailable")
                return
        else:
            await websocket.send_json({
                "type": "auth_error", 
                "message": "First message must be auth"
            })
            await websocket.close(code=1008, reason="Authentication required")
            return
        
        # Основной цикл обработки сообщений от хоста
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                
                # Безопасный парсинг JSON
                try:
                    message = json.loads(data)
                except json.JSONDecodeError as e:
                    logger.error(f"Invalid JSON in message: {e}")
                    await websocket.send_json({
                        "type": "error",
                        "message": "Invalid JSON format"
                    })
                    continue
                
                message_type = message.get("type")
                logger.debug(f"Host message: {message_type} | Full data: {message}")
                
                # ОБРАБОТКА СООБЩЕНИЙ
                if message_type == "screen_data":
                    session_id = message.get("session_id")
                    if session_id and remote_manager:
                        await remote_manager.relay_message(session_id, message, from_viewer=False)
                        logger.debug(f"Screen data relayed for session: {session_id}")
                        
                elif message_type == "session_response":
                    session_id = message.get("session_id")
                    if session_id and remote_manager:
                        await remote_manager.handle_session_response(pc_id, message)
                        logger.info(f"Session response handled for session: {session_id}")
                        
                elif message_type == "ping":
                    await websocket.send_json({"type": "pong"})
                    logger.debug("Pong sent to host")
                    
                elif message_type == "pong":
                    logger.debug("Pong received from host")
                    
                else:
                    logger.warning(f"Unknown host message type: {message_type}")
                    
            except asyncio.TimeoutError:
                # Таймаут - отправляем ping
                logger.debug("Host receive timeout, sending ping...")
                try:
                    await websocket.send_json({"type": "ping"})
                except Exception as e:
                    logger.error(f"Error sending ping: {e}")
                    break
                
    except WebSocketDisconnect:
        logger.info(f"Host WebSocket disconnected: {pc_id}")
    except asyncio.TimeoutError:
        logger.warning(f"Auth timeout for host: {pc_id}")
    except Exception as e:
        logger.error(f"Host WebSocket error: {e}", exc_info=True)
        try:
            await websocket.close(code=1011, reason="Internal server error")
        except:
            pass
    finally:
        if pc_id and remote_manager:
            await remote_manager.unregister_pc(pc_id)

@app.websocket("/api/remote/viewer")
async def websocket_viewer(websocket: WebSocket, token: str = Query(None), authorization: str = Header(None)):
    """WebSocket для просмотрщика (viewer) - удаленный рабочий стол"""
    # Проверка origin для CORS в WS (оставлена для браузерного viewer)
    origin = websocket.headers.get('origin')
    if origin not in get_cors_origins():
        logger.warning(f"WS Viewer rejected: Invalid origin {origin}")
        await websocket.close(code=1008, reason="Invalid origin")
        return
    
    await websocket.accept()
    logger.info(f"Viewer WebSocket connection accepted from origin: {origin}")
    
    # JWT аутентификация
    user_data = await authenticate_websocket_jwt(websocket, token, authorization)
    if not user_data:
        return
    
    session_id = None
    username = user_data.get("username")
    
    try:
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                
                # Безопасный парсинг JSON
                try:
                    message = json.loads(data)
                except json.JSONDecodeError as e:
                    logger.error(f"Invalid JSON in viewer message: {e}")
                    await websocket.send_json({
                        "type": "error",
                        "message": "Invalid JSON format"
                    })
                    continue
                
                message_type = message.get("type")
                logger.debug(f"Viewer message from {username}: {message_type} | Full data: {message}")
                
                if message_type == "create_session":
                    target_pc_id = message.get("target_pc_id")
                    session_type = message.get("session_type", "view")
                    
                    if not target_pc_id:
                        await websocket.send_json({
                            "type": "session_error",
                            "message": "Target PC ID required"
                        })
                        continue
                    
                    if not remote_manager:
                        await websocket.send_json({
                            "type": "session_error",
                            "message": "Remote desktop service unavailable"
                        })
                        continue
                    
                    # Создаем сессию
                    session_id = await remote_manager.create_session(
                        websocket, 
                        target_pc_id,
                        session_type,
                        username
                    )
                    
                    if session_id:
                        await websocket.send_json({
                            "type": "session_created",
                            "session_id": session_id,
                            "status": "pending"
                        })
                        logger.info(f"Remote session requested by {username}: {session_id}")
                    else:
                        await websocket.send_json({
                            "type": "session_error",
                            "message": "Failed to create session. Target PC may be offline."
                        })
                        
                elif message_type == "remote_command":
                    sess_id = message.get("session_id")
                    if sess_id and remote_manager:
                        success = await remote_manager.relay_message(
                            sess_id,
                            message,
                            from_viewer=True
                        )
                        if not success:
                            await websocket.send_json({
                                "type": "session_error",
                                "message": "Session not found or disconnected"
                            })
                    else:
                        await websocket.send_json({
                            "type": "session_error", 
                            "message": "Session ID required"
                        })
                        
                elif message_type == "end_session":
                    sess_id = message.get("session_id")
                    if sess_id and remote_manager:
                        await remote_manager.end_session(sess_id)
                        await websocket.send_json({"type": "session_ended"})
                        logger.info(f"Session ended by viewer {username}: {sess_id}")
                        session_id = None
                        
                elif message_type == "ping":
                    await websocket.send_json({"type": "pong"})
                    logger.debug("Pong sent to viewer")
                    
                elif message_type == "pong":
                    logger.debug("Pong received from viewer")
                    
                else:
                    logger.warning(f"Unknown viewer message type: {message_type}")
                    
            except asyncio.TimeoutError:
                logger.debug("Viewer receive timeout, sending ping...")
                await websocket.send_json({"type": "ping"})
                
    except WebSocketDisconnect:
        logger.info(f"Viewer WebSocket disconnected: {username}")
    except Exception as e:
        logger.error(f"Viewer WebSocket error: {e}", exc_info=True)
        try:
            await websocket.close(code=1011, reason="Internal server error")
        except:
            pass
    finally:
        if session_id and remote_manager:
            await remote_manager.end_session(session_id)

@app.websocket("/api/remote/admin/ws")
async def websocket_admin(websocket: WebSocket, token: str = Query(None), authorization: str = Header(None)):
    """WebSocket для администраторов для получения обновлений о сессиях в реальном времени"""
    # Проверка origin для CORS
    origin = websocket.headers.get('origin')
    if origin not in get_cors_origins():
        logger.warning(f"WS Admin rejected: Invalid origin {origin}")
        await websocket.close(code=1008, reason="Invalid origin")
        return
    
    await websocket.accept()
    logger.info(f"Admin WebSocket connection accepted from origin: {origin}")
    
    # JWT аутентификация
    user_data = await authenticate_websocket_jwt(websocket, token, authorization)
    if not user_data:
        return
    
    # Проверка прав администратора
    user_role = user_data.get("role", "user")
    if user_role != "admin":
        logger.warning(f"Access denied: User {user_data.get('username')} is not admin")
        await websocket.send_json({
            "type": "auth_error", 
            "message": "Admin access required"
        })
        await websocket.close(code=1008, reason="Admin access required")
        return
    
    username = user_data.get("username")
    admin_id = f"admin_{username}_{int(time.time())}"
    
    try:
        # Регистрируем подключение администратора
        if remote_manager:
            await remote_manager.register_admin_connection(admin_id, websocket)
            logger.info(f"Admin WebSocket registered: {admin_id}")
        else:
            await websocket.send_json({
                "type": "error",
                "message": "Remote desktop service unavailable"
            })
            await websocket.close(code=1011, reason="Service unavailable")
            return
        
        # Основной цикл обработки сообщений от администратора
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                
                # Безопасный парсинг JSON
                try:
                    message = json.loads(data)
                except json.JSONDecodeError as e:
                    logger.error(f"Invalid JSON in admin message: {e}")
                    await websocket.send_json({
                        "type": "error",
                        "message": "Invalid JSON format"
                    })
                    continue
                
                message_type = message.get("type")
                logger.debug(f"Admin message from {username}: {message_type}")
                
                # Обработка команд от администратора
                if message_type == "ping":
                    await websocket.send_json({"type": "pong"})
                    logger.debug("Pong sent to admin")
                    
                elif message_type == "get_active_sessions":
                    # Отправляем текущий список активных сессий
                    if remote_manager:
                        active_sessions = await remote_manager.get_active_sessions_info()
                        await websocket.send_json({
                            "type": "active_sessions",
                            "sessions": active_sessions,
                            "count": len(active_sessions),
                            "timestamp": datetime.now().isoformat()
                        })
                        
                elif message_type == "end_session":
                    # Администратор может завершить любую сессию
                    session_id = message.get("session_id")
                    if session_id and remote_manager:
                        await remote_manager.end_session(session_id)
                        await websocket.send_json({
                            "type": "session_ended",
                            "session_id": session_id,
                            "message": "Session terminated by admin"
                        })
                        logger.info(f"Session {session_id} terminated by admin {username}")
                        
                elif message_type == "get_stats":
                    # Получение статистики
                    if remote_manager:
                        stats = await remote_manager.get_admin_stats()
                        await websocket.send_json({
                            "type": "admin_stats",
                            "stats": stats,
                            "timestamp": datetime.now().isoformat()
                        })
                        
                else:
                    logger.warning(f"Unknown admin message type: {message_type}")
                    
            except asyncio.TimeoutError:
                logger.debug("Admin receive timeout, sending ping...")
                await websocket.send_json({"type": "ping"})
                
    except WebSocketDisconnect:
        logger.info(f"Admin WebSocket disconnected: {admin_id}")
    except Exception as e:
        logger.error(f"Admin WebSocket error: {e}", exc_info=True)
        try:
            await websocket.close(code=1011, reason="Internal server error")
        except:
            pass
    finally:
        if remote_manager:
            await remote_manager.unregister_admin_connection(admin_id)

# API маршруты для удаленного рабочего стола
remote_desktop_router = APIRouter(prefix="/api/remote", tags=["remote-desktop"])

@remote_desktop_router.get("/pcs")
async def get_remote_pcs(
    authorization: str = Header(None),
    token: str = Query(None)
):
    """Получение списка ПК (WebSocket + REST)"""
    try:
        if not remote_manager:
            raise HTTPException(status_code=503, detail="Remote desktop service unavailable")
        
        auth_token = None
        if authorization and authorization.startswith("Bearer "):
            auth_token = authorization[7:]
        elif token:
            auth_token = token
        
        if not auth_token:
            raise HTTPException(status_code=401, detail="Authentication token required")
        
        user_data = verify_token(auth_token)
        if not user_data:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        
        username = user_data.get("username")
        user_role = user_data.get("role", "user")
        
        logger.info(f"PCs requested by {username}, role: {user_role}")
        
        # Получаем WebSocket хосты
        if user_role == "admin":
            ws_pcs = await remote_manager.get_all_pcs()
        else:
            ws_pcs = await remote_manager.get_user_pcs(username)
        
        # Получаем REST хосты
        expired_time = datetime.now() - timedelta(minutes=2)
        expired_hosts = [
            pc_id for pc_id, host in rest_hosts.items()
            if host["last_heartbeat"] < expired_time
        ]
        
        for pc_id in expired_hosts:
            del rest_hosts[pc_id]
            logger.info(f"Removed expired REST host: {pc_id}")
        
        # Фильтруем REST хосты по роли
        if user_role == 'admin':
            rest_pcs_list = list(rest_hosts.values())
        else:
            rest_pcs_list = [
                host for host in rest_hosts.values()
                if host["username"] == username
            ]
        
        # Форматируем REST хосты
        formatted_rest_pcs = []
        for host in rest_pcs_list:
            formatted_rest_pcs.append({
                "pc_id": f"{host['username']}_{host['hostname']}",
                "username": host["username"],
                "pc_name": host["hostname"],
                "status": "online" if host["status"] == "online" else "offline",
                "last_seen": host["last_heartbeat"].isoformat(),
                "system_info": {
                    "hostname": host["hostname"],
                    "os": host["os"],
                    "ip_address": host["ip_address"],
                    "platform": host["platform"]
                },
                "connection_type": "REST"
            })
        
        # Объединяем списки
        all_pcs = ws_pcs + formatted_rest_pcs
        
        logger.info(f"Returning {len(all_pcs)} PCs ({len(ws_pcs)} WS, {len(formatted_rest_pcs)} REST)")
        
        return {
            "pcs": all_pcs, 
            "status": "success", 
            "count": len(all_pcs),
            "user": username,
            "user_role": user_role
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting PCs: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
@remote_desktop_router.get("/pcs/online")
async def get_online_pcs(authorization: str = Header(None)):
    try:
        if not remote_manager:
            raise HTTPException(status_code=503, detail="Remote desktop service unavailable")
        
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Authorization header required")
        
        token = authorization[7:]
        user_data = verify_token(token)
        if not user_data:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        pcs = await remote_manager.get_all_online_pcs()
        return {"pcs": pcs, "status": "success", "count": len(pcs)}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting online PCs: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@remote_desktop_router.get("/stats")
async def get_remote_stats(authorization: str = Header(None)):
    try:
        if not remote_manager:
            raise HTTPException(status_code=503, detail="Remote desktop service unavailable")
        
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Authorization header required")
        
        token = authorization[7:]
        user_data = verify_token(token)
        if not user_data:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        stats = await remote_manager.get_session_stats()
        return {"stats": stats, "status": "success"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting remote stats: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@remote_desktop_router.get("/admin/active-sessions")
async def get_active_sessions_admin(
    authorization: str = Header(None)
):
    """Получение списка активных сессий для администратора"""
    try:
        if not remote_manager:
            raise HTTPException(status_code=503, detail="Remote desktop service unavailable")
        
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Authorization header required")
        
        token = authorization[7:]
        user_data = verify_token(token)
        if not user_data:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user_role = user_data.get("role", "user")
        if user_role != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
        
        active_sessions = await remote_manager.get_active_sessions_info()
        return {
            'active_sessions': active_sessions,
            'total_count': len(active_sessions),
            'timestamp': datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting active sessions for admin: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@remote_desktop_router.get("/admin/stats")
async def get_admin_stats(
    authorization: str = Header(None)
):
    """Получение расширенной статистики для администраторов"""
    try:
        if not remote_manager:
            raise HTTPException(status_code=503, detail="Remote desktop service unavailable")
        
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Authorization header required")
        
        token = authorization[7:]
        user_data = verify_token(token)
        if not user_data:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user_role = user_data.get("role", "user")
        if user_role != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
        
        stats = await remote_manager.get_admin_stats()
        return {
            "stats": stats,
            "status": "success",
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting admin stats: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@remote_desktop_router.post("/admin/refresh-status")
async def refresh_pc_statuses(
    authorization: str = Header(None)
):
    """Принудительное обновление статусов ПК"""
    try:
        if not remote_manager:
            raise HTTPException(status_code=503, detail="Remote desktop service unavailable")
        
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Authorization header required")
        
        token = authorization[7:]
        user_data = verify_token(token)
        if not user_data:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user_role = user_data.get("role", "user")
        if user_role != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
        
        updated_count = await remote_manager.refresh_pc_statuses()
        return {
            "status": "success",
            "message": f"Statuses refreshed, {updated_count} PCs updated",
            "updated_count": updated_count
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error refreshing PC statuses: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@remote_desktop_router.post("/admin/end-session/{session_id}")
async def admin_end_session(
    session_id: str,
    authorization: str = Header(None)
):
    """Завершение сессии администратором"""
    try:
        if not remote_manager:
            raise HTTPException(status_code=503, detail="Remote desktop service unavailable")
        
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Authorization header required")
        
        token = authorization[7:]
        user_data = verify_token(token)
        if not user_data:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user_role = user_data.get("role", "user")
        if user_role != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
        
        await remote_manager.end_session(session_id)
        return {
            "status": "success",
            "message": f"Session {session_id} terminated by admin",
            "session_id": session_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error ending session {session_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@remote_desktop_router.get("/debug/connections")
async def debug_connections():
    if not remote_manager:
        return {"error": "Remote manager not available"}
    
    active_pcs = list(remote_manager.active_sessions.keys())
    relay_sessions = list(remote_manager.relay_connections.keys())
    
    return {
        "active_pcs": active_pcs,
        "active_pcs_count": len(active_pcs),
        "relay_sessions": relay_sessions,
        "relay_sessions_count": len(relay_sessions)
    }

@remote_desktop_router.get("/test")
async def test_remote_desktop():
    return {
        "status": "success", 
        "message": "Remote desktop API is working",
        "websocket_endpoints": {
            "host": "/api/remote/host",
            "viewer": "/api/remote/viewer",
            "admin": "/api/remote/admin/ws"
        }
    }
# === REST API ENDPOINTS FOR WINDOWS XP ===

@app.post("/api/remote/host/register")
async def register_host_rest(
    host_data: dict,
    authorization: str = Header(None)
):
    """REST endpoint для регистрации хоста (для Windows XP)"""
    try:
        logger.info(f"🔌 REST host registration attempt")
        
        if not authorization or not authorization.startswith("Bearer "):
            logger.warning("❌ No authorization header for REST host registration")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authorization header required"
            )
        
        token = authorization[7:]
        user_data = verify_token(token)
        if not user_data:
            logger.warning("❌ Invalid token for REST host registration")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )
        
        username = user_data.get("username")
        hostname = host_data.get("hostname", "unknown")
        ip_address = host_data.get("ip_address", "127.0.0.1")
        
        # Создаем уникальный ID для хоста
        pc_id = f"{username}_{hostname}"
        
        # Сохраняем информацию о хосте
        rest_hosts[pc_id] = {
            "username": username,
            "hostname": hostname,
            "ip_address": ip_address,
            "os": host_data.get("os", "Unknown"),
            "platform": host_data.get("platform", ""),
            "status": "online",
            "last_heartbeat": datetime.now(),
            "system_info": host_data,
            "is_rest_client": True,  # Помечаем как REST клиент
            "registered_at": datetime.now().isoformat()
        }
        
        logger.info(f"✅ REST host registered: {pc_id} ({ip_address}) - OS: {host_data.get('os', 'Unknown')}")
        
        return {
            "status": "success",
            "pc_id": pc_id,
            "message": "Host registered successfully",
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ REST host registration error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration failed"
        )

@app.post("/api/remote/host/heartbeat")
async def host_heartbeat(
    heartbeat_data: dict,
    authorization: str = Header(None)
):
    """Heartbeat для REST хостов (для Windows XP)"""
    try:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authorization header required"
            )
        
        token = authorization[7:]
        user_data = verify_token(token)
        if not user_data:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )
        
        username = user_data.get("username")
        pc_id = heartbeat_data.get("pc_id")
        
        if not pc_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="pc_id is required"
            )
        
        if pc_id not in rest_hosts:
            logger.warning(f"❌ REST host not found: {pc_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Host not found. Please register first."
            )
        
        # Обновляем время последнего heartbeat
        rest_hosts[pc_id]["last_heartbeat"] = datetime.now()
        rest_hosts[pc_id]["status"] = "online"
        
        # Проверяем наличие ожидающих сессий
        pending_sessions = []  # Можно добавить логику для сессий позже
        
        response = {
            "status": "success",
            "message": "Heartbeat received",
            "pc_id": pc_id,
            "has_pending_sessions": len(pending_sessions) > 0,
            "timestamp": datetime.now().isoformat()
        }
        
        # Если есть ожидающие сессии, отправляем информацию о них
        if pending_sessions:
            response["pending_sessions"] = pending_sessions
            
        logger.debug(f"💓 REST heartbeat from {pc_id}")
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ REST heartbeat error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Heartbeat failed"
        )

@app.get("/api/remote/rest/pcs")
async def get_rest_pcs(authorization: str = Header(None)):
    """Получение списка REST хостов"""
    try:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authorization header required"
            )
        
        token = authorization[7:]
        user_data = verify_token(token)
        if not user_data:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )
        
        username = user_data.get("username")
        user_role = user_data.get("role", "user")
        
        # Очищаем устаревшие хосты (более 2 минут без heartbeat)
        expired_time = datetime.now() - timedelta(minutes=2)
        expired_hosts = [
            pc_id for pc_id, host in rest_hosts.items()
            if host["last_heartbeat"] < expired_time
        ]
        
        for pc_id in expired_hosts:
            del rest_hosts[pc_id]
            logger.info(f"🧹 Removed expired REST host: {pc_id}")
        
        # Фильтруем хосты по роли
        if user_role == 'admin':
            available_pcs = list(rest_hosts.values())
        else:
            available_pcs = [
                host for host in rest_hosts.values()
                if host["username"] == username
            ]
        
        # Форматируем ответ
        formatted_pcs = []
        for host in available_pcs:
            formatted_pcs.append({
                "pc_id": f"{host['username']}_{host['hostname']}",
                "hostname": host["hostname"],
                "username": host["username"],
                "ip_address": host["ip_address"],
                "os": host["os"],
                "platform": host["platform"],
                "status": host["status"],
                "last_seen": host["last_heartbeat"].isoformat(),
                "connection_type": "REST",
                "is_online": host["status"] == "online"
            })
        
        logger.info(f"📊 REST PCs requested by {username}: {len(formatted_pcs)} hosts")
        
        return {
            "pcs": formatted_pcs,
            "status": "success",
            "count": len(formatted_pcs),
            "user_role": user_role,
            "connection_type": "REST"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Get REST PCs error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get PCs"
        )
@remote_desktop_router.get("/pcs/combined")
async def get_combined_pcs(
    authorization: str = Header(None),
    token: str = Query(None)
):
    """Получение объединенного списка WebSocket и REST хостов"""
    try:
        if not remote_manager:
            raise HTTPException(status_code=503, detail="Remote desktop service unavailable")
        
        auth_token = None
        if authorization and authorization.startswith("Bearer "):
            auth_token = authorization[7:]
        elif token:
            auth_token = token
        
        if not auth_token:
            raise HTTPException(status_code=401, detail="Authentication token required")
        
        user_data = verify_token(auth_token)
        if not user_data:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        
        username = user_data.get("username")
        user_role = user_data.get("role", "user")
        
        logger.info(f"Combined PCs requested by {username}, role: {user_role}")
        
        # Получаем WebSocket хосты
        if user_role == "admin":
            ws_pcs = await remote_manager.get_all_pcs()
        else:
            ws_pcs = await remote_manager.get_user_pcs(username)
        
        # Получаем REST хосты
        expired_time = datetime.now() - timedelta(minutes=2)
        expired_hosts = [
            pc_id for pc_id, host in rest_hosts.items()
            if host["last_heartbeat"] < expired_time
        ]
        
        for pc_id in expired_hosts:
            del rest_hosts[pc_id]
            logger.info(f"Removed expired REST host: {pc_id}")
        
        # Фильтруем REST хосты по роли
        if user_role == 'admin':
            rest_pcs_list = list(rest_hosts.values())
        else:
            rest_pcs_list = [
                host for host in rest_hosts.values()
                if host["username"] == username
            ]
        
        # Форматируем REST хосты в тот же формат что и WebSocket
        formatted_rest_pcs = []
        for host in rest_pcs_list:
            formatted_rest_pcs.append({
                "pc_id": f"{host['username']}_{host['hostname']}",
                "username": host["username"],
                "pc_name": host["hostname"],
                "status": "online" if host["status"] == "online" else "offline",
                "last_seen": host["last_heartbeat"].isoformat(),
                "system_info": {
                    "hostname": host["hostname"],
                    "os": host["os"],
                    "ip_address": host["ip_address"],
                    "platform": host["platform"]
                },
                "connection_type": "REST"
            })
        
        # Объединяем списки
        all_pcs = ws_pcs + formatted_rest_pcs
        
        # Убираем дубликаты по pc_id (если есть и WS и REST версия одного хоста)
        seen = set()
        unique_pcs = []
        for pc in all_pcs:
            if pc["pc_id"] not in seen:
                seen.add(pc["pc_id"])
                unique_pcs.append(pc)
        
        logger.info(f"Combined PCs: {len(ws_pcs)} WS + {len(formatted_rest_pcs)} REST = {len(unique_pcs)} total")
        
        return {
            "pcs": unique_pcs, 
            "status": "success", 
            "count": len(unique_pcs),
            "user": username,
            "user_role": user_role,
            "breakdown": {
                "websocket": len(ws_pcs),
                "rest": len(formatted_rest_pcs),
                "total": len(unique_pcs)
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting combined PCs: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
@app.get("/api/remote/rest/test")
async def test_rest_endpoint(authorization: str = Header(None)):
    """Тестовый endpoint для проверки REST API"""
    try:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authorization header required"
            )
        
        token = authorization[7:]
        user_data = verify_token(token)
        if not user_data:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token"
            )
        
        return {
            "status": "success",
            "message": "REST API is working",
            "user": user_data.get("username"),
            "timestamp": datetime.now().isoformat(),
            "rest_hosts_count": len(rest_hosts)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ REST test error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Test failed"
        )
# Подключение роутеров
app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(contacts_router, prefix="/contacts", tags=["contacts"])
app.include_router(admin_router, prefix="/admin", tags=["admin"])
app.include_router(request_list_router, prefix="/request_list", tags=["requests"])
app.include_router(documents_router, prefix="/api", tags=["documents"])
app.include_router(chat_router)
app.include_router(serverstats_router)
app.include_router(faq_router, prefix="/faq")
app.include_router(employee_tracker_router, prefix="/emp")
app.include_router(notification_router)
app.include_router(software_router)
app.include_router(remote_desktop_router)

@app.get("/health", include_in_schema=False)
async def health_check():
    remote_status = "available" if remote_manager else "unavailable"
    return {
        "status": "healthy", 
        "timestamp": datetime.utcnow(),
        "remote_desktop": remote_status
    }

@app.get("/", include_in_schema=False)
async def root():
    return {"message": "Добро пожаловать в Employee Portal", "redirect": "/dashboard"}

@app.on_event("startup")
async def startup_event():
    if remote_manager:
        await remote_manager.start_background_tasks()
    logger.info("Remote manager background tasks started")

@app.on_event("shutdown")
async def shutdown_event():
    if remote_manager and remote_manager.cleanup_task:
        remote_manager.cleanup_task.cancel()
    logger.info("Remote manager background tasks stopped")

# Запуск сервера
if __name__ == "__main__":
    try:
        check_env_vars()
        logger.info("Запуск сервера FastAPI...")
        logger.info("Remote Desktop WebSocket endpoints:")
        logger.info("   - Host: ws://0.0.0.0:8000/api/remote/host")
        logger.info("   - Viewer: ws://0.0.0.0:8000/api/remote/viewer")
        logger.info("   - Admin: ws://0.0.0.0:8000/api/remote/admin/ws")
        
        uvicorn.run(
            "main:app",
            host="0.0.0.0",
            port=8000,
            reload=False,
            log_level="info",
            workers=1,
            ws_max_size=10 * 1024 * 1024,
            ws_ping_interval=20,
            ws_ping_timeout=60,
            ws="websockets",
            timeout_keep_alive=60,
        )
    except EnvironmentError as e:
        logger.critical(f"Ошибка окружения: {e}")
    except (OSError, RuntimeError) as e:
        logger.critical(f"Не удалось запустить сервер: {e}")
    except KeyboardInterrupt:
        logger.info("Сервер остановлен вручную.")