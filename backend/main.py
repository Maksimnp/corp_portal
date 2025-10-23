from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, status, Depends, Header, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import HTTPException
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.staticfiles import StaticFiles
from fastapi import WebSocket, WebSocketDisconnect
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from services.remote_desktop import remote_manager
from services.admin_manager import admin_manager
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
from db.database import get_db_connection 
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

class SupportRequest(BaseModel):
    user_info: Dict[str, Any]
    system_info: Dict[str, Any]
    request_info: Dict[str, Any]

def send_support_email(support_data: Dict[str, Any]) -> bool:
    """Отправка email в службу поддержки"""
    try:
        # Получаем настройки SMTP из переменных окружения
        smtp_host = os.getenv("SMTP_HOST", "smail1.hoster.by")
        smtp_port = int(os.getenv("SMTP_PORT", "465"))
        smtp_user = os.getenv("SMTP_USER", "portal@minskhleb.by")
        smtp_password = os.getenv("SMTP_PASSWORD", "H54eU0XP")
        
        # Создаем сообщение
        msg = MIMEMultipart()
        msg['From'] = smtp_user
        msg['To'] = "portal@minskhleb.by"
        msg['Subject'] = f"Запрос в поддержку от {support_data['user_info'].get('user_name', 'Неизвестный пользователь')}"
        
        # Формируем тело письма
        body = f"""
НОВЫЙ ЗАПРОС В СЛУЖБУ ПОДДЕРЖКИ

=== ИНФОРМАЦИЯ О ПОЛЬЗОВАТЕЛЕ ===
ФИО: {support_data['user_info'].get('user_name', 'Не указано')}
Логин AD: {support_data['user_info'].get('ad_username', 'Не указано')}
ID пользователя: {support_data['user_info'].get('user_id', 'Не указано')}
Роль: {support_data['user_info'].get('user_role', 'Не указано')}
Администратор: {'Да' if support_data['user_info'].get('is_admin') else 'Нет'}

Должность: {support_data['user_info'].get('job_title', 'Не указана')}
Отдел: {support_data['user_info'].get('department', 'Не указан')}
Компания: {support_data['user_info'].get('company', 'Не указана')}

Email: {support_data['user_info'].get('email', 'Не указан')}
Рабочий телефон: {support_data['user_info'].get('telephone_number', 'Не указан')}
Мобильный телефон: {support_data['user_info'].get('mobile_phone', 'Не указан')}

=== СИСТЕМНАЯ ИНФОРМАЦИЯ ===
Браузер: {support_data['system_info'].get('browser', 'Не указан')[:100]}
Платформа: {support_data['system_info'].get('platform', 'Не указана')}
Язык: {support_data['system_info'].get('language', 'Не указан')}
Разрешение экрана: {support_data['system_info'].get('screen_resolution', 'Не указано')}
Часовой пояс: {support_data['system_info'].get('timezone', 'Не указан')}
Текущий URL: {support_data['system_info'].get('current_url', 'Не указан')}

=== ЗАПРОС ===
Сообщение:
{support_data['request_info'].get('message', 'Сообщение отсутствует')}

Время отправки: {support_data['request_info'].get('local_time', 'Не указано')}
Timestamp: {support_data['request_info'].get('timestamp', 'Не указано')}

---
Автоматическое уведомление от Корпоративного Портала
"""
        
        msg.attach(MIMEText(body, 'plain', 'utf-8'))
        
        # Подключаемся к SMTP серверу и отправляем
        logger.info(f"📧 Connecting to SMTP server: {smtp_host}:{smtp_port}")
        
        if smtp_port == 465:
            # SSL соединение
            server = smtplib.SMTP_SSL(smtp_host, smtp_port)
        else:
            # TLS соединение
            server = smtplib.SMTP(smtp_host, smtp_port)
            server.starttls()
        
        server.login(smtp_user, smtp_password)
        text = msg.as_string()
        server.sendmail(smtp_user, "portal@minskhleb.by", text)
        server.quit()
        
        logger.info(f"✅ Support email sent successfully for user: {support_data['user_info'].get('user_name')}")
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to send support email: {e}")
        return False

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
    """Получение текущего пользователя из JWT токена с проверкой администратора"""
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
    
    # Получаем дополнительные данные из AD
    username = user_data.get("username")
    try:
        # ИСПРАВЛЕННЫЙ ИМПОРТ - используем правильный путь
        from services.ad_auth import get_user_details, get_user_role
        
        ad_details = get_user_details(username)
        if ad_details:
            user_data["full_name"] = ad_details.get("full_name", username)
            user_data["email"] = ad_details.get("email", f"{username}@mhp.net")
            user_data["department"] = ad_details.get("department", "Не указан")
            user_data["position"] = ad_details.get("title", "Не указана")
            user_data["phone"] = ad_details.get("telephoneNumber", "Не указан")
            user_data["company"] = ad_details.get("company", "МХП")
            user_data["office"] = ad_details.get("physicalDeliveryOfficeName", "Не указан")
        else:
            # Заполняем базовыми значениями если AD недоступен
            user_data["full_name"] = username
            user_data["email"] = f"{username}@mhp.net"
            user_data["department"] = "Не указан"
            user_data["position"] = "Не указана"
            user_data["phone"] = "Не указан"
            user_data["company"] = "МХП"
            user_data["office"] = "Не указан"
        
    except Exception as e:
        logger.warning(f"⚠️ Failed to get AD details for {username}: {e}")
        # Продолжаем с базовыми данными
        user_data["full_name"] = username
        user_data["email"] = f"{username}@mhp.net"
        user_data["department"] = "Не указан"
        user_data["position"] = "Не указана"
        user_data["phone"] = "Не указан"
        user_data["company"] = "МХП"
        user_data["office"] = "Не указан"
    
    # Проверяем, является ли пользователь администратором
    admin = admin_manager.get_admin_by_username(username)
    
    if admin and admin.get('is_active'):
        user_data["role"] = "admin"
        user_data["admin_permissions"] = admin.get('permissions', {})
    else:
        try:
            from services.ad_auth import get_user_role
            user_data["role"] = get_user_role(username)
        except:
            user_data["role"] = "user"
    
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
                await remote_manager.register_host(
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
                        
                elif message_type == "remote_command":
                    # НОВЫЙ ОБРАБОТЧИК ДЛЯ КОМАНД УПРАВЛЕНИЯ
                    session_id = message.get("session_id")
                    command = message.get("command", {})
                    cmd_type = command.get("type")
                    
                    logger.info(f"Remote command received from host: {cmd_type} for session {session_id}")
                    
                    if session_id and remote_manager:
                        # Пересылаем команду обратно на viewer (если нужно)
                        # Или обрабатываем на сервере
                        await remote_manager.relay_message(session_id, message, from_viewer=False)
                        logger.debug(f"Remote command relayed for session: {session_id}")
                        
                elif message_type == "file_transfer_response":
                    session_id = message.get("session_id")
                    if session_id and remote_manager:
                        await remote_manager.relay_message(session_id, message, from_viewer=False)
                        logger.debug(f"File transfer response relayed for session: {session_id}")
                        
                elif message_type == "remote_shell_response":
                    session_id = message.get("session_id")
                    if session_id and remote_manager:
                        await remote_manager.relay_message(session_id, message, from_viewer=False)
                        logger.debug(f"Remote shell response relayed for session: {session_id}")
                        
                elif message_type == "clipboard_response":
                    session_id = message.get("session_id")
                    if session_id and remote_manager:
                        await remote_manager.relay_message(session_id, message, from_viewer=False)
                        logger.debug(f"Clipboard response relayed for session: {session_id}")
                        
                elif message_type == "clipboard_update":
                    session_id = message.get("session_id")
                    if session_id and remote_manager:
                        await remote_manager.relay_message(session_id, message, from_viewer=False)
                        logger.debug(f"Clipboard update relayed for session: {session_id}")
                        
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

# === REST SESSION MANAGEMENT ===

@app.post("/api/remote/host/session/create")
async def create_rest_session(
    session_data: dict,
    authorization: str = Header(None)
):
    """Создание сессии для REST хоста"""
    try:
        logger.info("🔄 Creating REST session")
        
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
        
        target_pc_id = session_data.get("target_pc_id")
        session_type = session_data.get("session_type", "view")
        viewer_username = user_data.get("username")
        
        if not target_pc_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="target_pc_id is required"
            )
        
        # Проверяем, существует ли REST хост
        if target_pc_id not in rest_hosts:
            logger.warning(f"❌ REST host not found: {target_pc_id}. Available hosts: {list(rest_hosts.keys())}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"REST host not found: {target_pc_id}. Available: {list(rest_hosts.keys())}"
            )
        
        # Создаем сессию через remote_manager
        if remote_manager:
            session_id = await remote_manager.create_rest_session(
                target_pc_id,
                session_type,
                viewer_username
            )
            
            if session_id:
                logger.info(f"✅ REST session created: {session_id}")
                return {
                    "status": "success",
                    "session_id": session_id,
                    "message": "Session created successfully",
                    "is_rest_host": True
                }
            else:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to create session"
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Remote desktop service unavailable"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ REST session creation error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Session creation failed"
        )

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
    """Получение списка ПК с проверкой прав администратора через PostgreSQL"""
    try:
        logger.info("🔍 Getting PCs list...")
        
        if not remote_manager:
            logger.error("❌ Remote manager not available")
            raise HTTPException(status_code=503, detail="Remote desktop service unavailable")
        
        # Получаем токен
        auth_token = None
        if authorization and authorization.startswith("Bearer "):
            auth_token = authorization[7:]
        elif token:
            auth_token = token
        
        if not auth_token:
            logger.warning("❌ No authentication token provided")
            raise HTTPException(status_code=401, detail="Authentication token required")
        
        # Проверяем токен
        user_data = verify_token(auth_token)
        if not user_data:
            logger.warning("❌ Invalid token")
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        
        username = user_data.get("username")
        logger.info(f"📋 PCs requested by: {username}")
        
        # Определяем роль пользователя
        user_role = "user"
        try:
            admin = admin_manager.get_admin_by_username(username)
            if admin and admin.get('is_active'):
                user_role = "admin"
                logger.info(f"👤 User {username} is admin")
            else:
                logger.info(f"👤 User {username} is regular user")
        except Exception as admin_error:
            logger.warning(f"⚠️ Admin check failed for {username}: {admin_error}")
            # Продолжаем как обычный пользователь
        
        # Получаем ПК с учетом прав доступа
        try:
            logger.info(f"🖥️ Getting PCs for user {username} with role {user_role}")
            pcs = await remote_manager.get_user_pcs(username, user_role)
            logger.info(f"✅ Found {len(pcs)} PCs for user {username}")
            
        except Exception as pc_error:
            logger.error(f"❌ Error getting PCs from remote_manager: {pc_error}", exc_info=True)
            # Возвращаем пустой список вместо ошибки
            pcs = []
        
        # Получаем REST хосты если нужно
        rest_pcs = []
        try:
            # Фильтруем REST хосты по роли
            if user_role == 'admin':
                rest_pcs_list = list(rest_hosts.values())
            else:
                rest_pcs_list = [
                    host for host in rest_hosts.values()
                    if host["username"] == username
                ]
            
            # Форматируем REST хосты
            for host in rest_pcs_list:
                rest_pcs.append({
                    "pc_id": f"{host['username']}_{host['hostname']}",
                    "username": host["username"],
                    "pc_name": host["hostname"],
                    "status": "online" if host["status"] == "online" else "offline",
                    "last_seen": host["last_heartbeat"].isoformat() if host.get("last_heartbeat") else None,
                    "system_info": {
                        "hostname": host["hostname"],
                        "os": host.get("os", "Unknown"),
                        "ip_address": host.get("ip_address", "unknown"),
                        "platform": host.get("platform", "")
                    },
                    "connection_type": "REST"
                })
            
            logger.info(f"🔗 Found {len(rest_pcs)} REST hosts")
            
        except Exception as rest_error:
            logger.warning(f"⚠️ Error getting REST hosts: {rest_error}")
            rest_pcs = []
        
        # Объединяем списки
        all_pcs = pcs + rest_pcs
        
        # Убираем дубликаты по pc_id
        seen = set()
        unique_pcs = []
        for pc in all_pcs:
            if pc["pc_id"] not in seen:
                seen.add(pc["pc_id"])
                unique_pcs.append(pc)
        
        logger.info(f"🎯 Total unique PCs: {len(unique_pcs)} ({len(pcs)} WebSocket + {len(rest_pcs)} REST)")
        
        return {
            "pcs": unique_pcs, 
            "status": "success", 
            "count": len(unique_pcs),
            "user": username,
            "user_role": user_role,
            "breakdown": {
                "websocket": len(pcs),
                "rest": len(rest_pcs),
                "total": len(unique_pcs)
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Unexpected error in get_remote_pcs: {e}", exc_info=True)
        # Возвращаем пустой список вместо ошибки 500
        return {
            "pcs": [],
            "status": "success",
            "count": 0,
            "message": "Temporarily unavailable, please try again later"
        }
    
@remote_desktop_router.get("/settings")
async def get_remote_settings(
    current_user: dict = Depends(get_current_user)
):
    """Получение текущих настроек удаленного доступа"""
    try:
        settings = remote_manager.get_settings()
        return {
            "settings": settings,
            "user_role": current_user.get("role", "user")
        }
    except Exception as e:
        logger.error(f"Error getting settings: {e}")
        raise HTTPException(status_code=500, detail="Ошибка получения настроек")

@remote_desktop_router.post("/settings/all-users-see-all-pcs")
async def toggle_all_users_see_all_pcs(
    enabled: bool,
    current_user: dict = Depends(get_current_admin_user)
):
    """Включить/выключить видимость всех ПК для всех пользователей (только для администраторов)"""
    try:
        new_setting = remote_manager.toggle_all_users_see_all_pcs(enabled)
        return {
            "message": f"Настройка 'Все пользователи видят все ПК' {'включена' if new_setting else 'выключена'}",
            "all_users_see_all_pcs": new_setting,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error changing setting: {e}")
        raise HTTPException(status_code=500, detail="Ошибка изменения настройки")

@remote_desktop_router.get("/admin/settings")
async def get_admin_settings(
    current_user: dict = Depends(get_current_admin_user)
):
    """Получение административных настроек (только для администраторов)"""
    try:
        settings = remote_manager.get_settings()
        stats = await remote_manager.get_session_stats()
        
        return {
            "settings": settings,
            "stats": stats,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting admin settings: {e}")
        raise HTTPException(status_code=500, detail="Ошибка получения настроек")

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

@remote_desktop_router.post("/host/heartbeat")
async def host_heartbeat_rest(
    heartbeat_data: dict,
    authorization: str = Header(None)
):
    """Heartbeat для REST хостов с поддержкой сессий"""
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
        
        pc_id = heartbeat_data.get("pc_id")
        session_data = heartbeat_data.get("sessions", {})
        
        if not pc_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="pc_id is required"
            )
        
        # Авто-регистрация, если хост не найден
        if pc_id not in rest_hosts:
            logger.info(f"Auto-registering missing REST host via heartbeat: {pc_id}")
            # Извлекаем данные из heartbeat (предполагаем, что клиент отправляет system_info в heartbeat_data)
            system_info = heartbeat_data.get("system_info", {})
            username = user_data.get("username")
            hostname = system_info.get("hostname", pc_id.split("_")[-1])
            rest_hosts[pc_id] = {
                "username": username,
                "hostname": hostname,
                "ip_address": system_info.get("ip_address", "unknown"),
                "os": system_info.get("os", "Unknown"),
                "platform": system_info.get("platform", ""),
                "status": "online",
                "last_heartbeat": datetime.now(),
                "system_info": system_info,
                "is_rest_client": True,
                "registered_at": datetime.now().isoformat()
            }
        
        # Обновляем время последнего heartbeat для REST хоста
        rest_hosts[pc_id]["last_heartbeat"] = datetime.now()
        rest_hosts[pc_id]["status"] = "online"
        
        # Получаем ожидающие сессии через remote_manager
        pending_sessions = []
        if remote_manager:
            # Получаем все активные сессии для этого PC
            for session_id, session_info in remote_manager.active_remote_sessions.items():
                if (session_info['target_pc_id'] == pc_id and 
                    session_info['status'] == 'pending' and
                    session_info.get('is_rest_session', False)):
                    
                    pending_sessions.append({
                        "session_id": session_id,
                        "viewer_username": session_info.get('viewer_username', 'unknown'),
                        "session_type": session_info.get('session_type', 'view'),
                        "created_at": session_info.get('start_time'),
                        "viewer_info": session_info.get('viewer_info', {})
                    })
            
            # Обновляем статус активных сессий из heartbeat данных
            for session_id, session_info in session_data.items():
                if session_id in remote_manager.relay_connections:
                    remote_manager.relay_connections[session_id]['status'] = session_info.get('status', 'active')
        
        response = {
            "status": "success",
            "message": "Heartbeat received",
            "pc_id": pc_id,
            "pending_sessions": pending_sessions,
            "pending_sessions_count": len(pending_sessions),
            "timestamp": datetime.now().isoformat()
        }
        
        logger.info(f"💓 REST heartbeat from {pc_id}, {len(pending_sessions)} pending sessions")
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ REST heartbeat error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Heartbeat failed"
        )

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
        hostname = host_data.get("hostname", "unknown").replace('-', '_')  # Нормализация hostname
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
    """Heartbeat для REST хостов с поддержкой сессий"""
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
        
        # Получаем ожидающие сессии
        pending_sessions = []
        if remote_manager:
            for session_id, session_info in remote_manager.active_sessions.items():
                if (session_info.get('pc_id') == pc_id and 
                    session_info.get('status') == 'pending'):
                    pending_sessions.append({
                        "session_id": session_id,
                        "viewer_username": session_info.get('viewer_username', 'unknown'),
                        "session_type": session_info.get('session_type', 'view'),
                        "created_at": session_info.get('created_at').isoformat() if session_info.get('created_at') else None
                    })
        
        response = {
            "status": "success",
            "message": "Heartbeat received",
            "pc_id": pc_id,
            "has_pending_sessions": len(pending_sessions) > 0,
            "pending_sessions": pending_sessions,
            "timestamp": datetime.now().isoformat()
        }
        
        logger.debug(f"💓 REST heartbeat from {pc_id}, {len(pending_sessions)} pending sessions")
        
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
        
        # Очищаем устаревшие хосты (более 5 минут без heartbeat)
        expired_time = datetime.now() - timedelta(minutes=5)
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
        expired_time = datetime.now() - timedelta(minutes=5)
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

# ДОБАВЬТЕ ЭТОТ ИМПОРТ ПОСЛЕ ДРУГИХ ИМПОРТОВ
#rom app.auth.ad_auth import get_user_details, get_user_role

# ДОБАВЬТЕ ЭТОТ РОУТЕР ПОСЛЕ ДРУГИХ РОУТЕРОВ
user_router = APIRouter(prefix="/api/user", tags=["user"])

@user_router.get("/profile")
async def get_user_profile(current_user: dict = Depends(get_current_user)):
    """
    Получение профиля пользователя из Active Directory
    """
    try:
        username = current_user.get("username")
        if not username:
            raise HTTPException(status_code=400, detail="Username not found in token")
        
        logger.info(f"🔍 Fetching AD profile for user: {username}")
        
        # Получаем данные из AD - ИСПРАВЛЕННЫЙ ИМПОРТ
        try:
            from services.ad_auth import get_user_details, get_user_role
            user_details = get_user_details(username)
        except ImportError as e:
            logger.error(f"❌ Failed to import AD auth functions: {e}")
            user_details = None
        
        if not user_details:
            logger.warning(f"⚠️ User {username} not found in Active Directory or AD unavailable")
            # Возвращаем базовую информацию из токена
            profile_data = {
                "id": current_user.get("user_id", ""),
                "username": username,
                "full_name": current_user.get("full_name", username),
                "email": current_user.get("email", f"{username}@mhp.net"),
                "role": current_user.get("role", "user"),
                "department": current_user.get("department", "Не указан"),
                "position": current_user.get("position", "Не указана"),
                "phone": current_user.get("phone", "Не указан"),
                "lastLogin": current_user.get("last_login", ""),
                "createdAt": current_user.get("created_at", ""),
                "source": "token_fallback"
            }
        else:
            # Получаем роль пользователя
            try:
                role = get_user_role(username)
            except:
                role = current_user.get("role", "user")
            
            # Формируем полный профиль из AD
            profile_data = {
                "id": current_user.get("user_id", ""),
                "username": username,
                "full_name": user_details.get("full_name", username),
                "email": user_details.get("email", f"{username}@mhp.net"),
                "role": role,
                "department": user_details.get("department", "Не указан"),
                "position": user_details.get("title", "Не указана"),
                "phone": user_details.get("telephoneNumber", "Не указан"),
                "lastLogin": current_user.get("last_login", ""),
                "createdAt": current_user.get("created_at", ""),
                "company": user_details.get("company", "МХП"),
                "office": user_details.get("physicalDeliveryOfficeName", "Не указан"),
                "distinguishedName": user_details.get("distinguishedName", ""),
                "manager": user_details.get("manager", ""),
                "source": "active_directory"
            }
        
        logger.info(f"✅ Profile data retrieved for {username}: {profile_data['source']}")
        
        return profile_data
        
    except Exception as e:
        logger.error(f"❌ Error fetching user profile for {username}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching user profile: {str(e)}")

# Добавьте этот эндпоинт для обновления аватара
@user_router.post("/avatar")
async def update_user_avatar(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Загрузка аватара пользователя
    """
    try:
        username = current_user.get("username")
        logger.info(f"🖼️ Avatar upload requested by: {username}")
        
        # Проверяем тип файла
        if not file.content_type.startswith('image/'):
            raise HTTPException(
                status_code=400, 
                detail="File must be an image"
            )
        
        # Проверяем размер файла (максимум 5MB)
        max_size = 5 * 1024 * 1024  # 5MB
        file.file.seek(0, 2)  # Перемещаемся в конец файла
        file_size = file.file.tell()
        file.file.seek(0)  # Возвращаемся в начало
        
        if file_size > max_size:
            raise HTTPException(
                status_code=400,
                detail="File size must be less than 5MB"
            )
        
        # Создаем папку для аватаров если не существует
        avatars_dir = "templates/static/avatars"
        os.makedirs(avatars_dir, exist_ok=True)
        
        # Генерируем уникальное имя файла
        file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
        filename = f"{username}_{int(datetime.now().timestamp())}.{file_extension}"
        file_path = os.path.join(avatars_dir, filename)
        
        # Сохраняем файл
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Генерируем URL для доступа к файлу
        avatar_url = f"/static/avatars/{filename}"
        
        logger.info(f"✅ Avatar uploaded successfully for {username}: {filename}")
        
        return {
            "status": "success",
            "message": "Avatar uploaded successfully",
            "avatar_url": avatar_url,
            "filename": filename
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Avatar upload error for {username}: {str(e)}")
        raise HTTPException(status_code=500, detail="Avatar upload failed")
# Добавьте этот эндпоинт для поиска пользователей
@user_router.get("/search")
async def search_users(
    query: str = Query(..., min_length=2, description="Search term"),
    current_user: dict = Depends(get_current_user)
):
    """
    Поиск пользователей в Active Directory
    """
    try:
        logger.info(f"🔍 User search by {current_user.get('username')}: {query}")
        
        try:
            from services.ad_auth import search_users as ad_search_users
            users = ad_search_users(query)
        except ImportError as e:
            logger.error(f"❌ Failed to import AD search functions: {e}")
            users = []
        
        logger.info(f"✅ Search found {len(users)} users for query: {query}")
        
        return {
            "status": "success",
            "query": query,
            "users": users,
            "count": len(users)
        }
        
    except Exception as e:
        logger.error(f"❌ User search error: {str(e)}")
        raise HTTPException(status_code=500, detail="Search failed")

# Добавьте этот эндпоинт для получения отделов
@user_router.get("/departments")
async def get_departments(current_user: dict = Depends(get_current_user)):
    """
    Получение списка всех отделов из Active Directory
    """
    try:
        logger.info(f"🏢 Departments list requested by: {current_user.get('username')}")
        
        try:
            from services.ad_auth import get_all_departments
            departments = get_all_departments()
        except ImportError as e:
            logger.error(f"❌ Failed to import AD departments functions: {e}")
            departments = []
        
        logger.info(f"✅ Retrieved {len(departments)} departments")
        
        return {
            "status": "success",
            "departments": departments,
            "count": len(departments)
        }
        
    except Exception as e:
        logger.error(f"❌ Departments retrieval error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get departments")

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
app.include_router(user_router)  

# Добавьте статическую папку для аватаров
app.mount("/static/avatars", StaticFiles(directory="templates/static/avatars"), name="avatars")

@app.get("/health", include_in_schema=False)
async def health_check():
    remote_status = "available" if remote_manager else "unavailable"
    return {
        "status": "healthy", 
        "timestamp": datetime.utcnow(),
        "remote_desktop": remote_status
    }

@app.post("/api/remote/host/session/response")
async def host_session_response(
    response_data: dict,
    authorization: str = Header(None)
):
    """Обработка ответа хоста на запрос сессии (для Windows XP)"""
    try:
        logger.info("🔄 REST host session response received")
        
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
        
        session_id = response_data.get("session_id")
        accepted = response_data.get("accepted", False)
        pc_id = response_data.get("pc_id")
        
        if not session_id or not pc_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="session_id and pc_id are required"
            )
        
        # Если есть remote_manager, обрабатываем через WebSocket
        if remote_manager:
            await remote_manager.handle_session_response(pc_id, {
                "session_id": session_id,
                "accepted": accepted
            })
            logger.info(f"✅ REST session response handled: {session_id} - accepted: {accepted}")
        else:
            logger.warning("Remote manager not available for session response")
        
        return {
            "status": "success",
            "message": "Session response processed",
            "session_id": session_id,
            "accepted": accepted
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ REST session response error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Session response failed"
        )

@app.post("/api/remote/host/session/screen")
async def host_send_screen(
    screen_data: dict,
    authorization: str = Header(None)
):
    """Получение данных экрана от хоста (для Windows XP)"""
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
        
        session_id = screen_data.get("session_id")
        image_data = screen_data.get("image_data")
        
        if not session_id or not image_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="session_id and image_data are required"
            )
        
        # Пересылаем данные через WebSocket менеджер
        if remote_manager:
            await remote_manager.relay_message(session_id, {
                "type": "screen_data",
                "session_id": session_id,
                "data": {
                    "image": image_data,
                    "format": "jpeg",
                    "timestamp": screen_data.get("timestamp")
                }
            }, from_viewer=False)
            logger.debug(f"📺 REST screen data relayed for session: {session_id}")
        else:
            logger.warning("Remote manager not available for screen data")
        
        return {
            "status": "success",
            "message": "Screen data received",
            "session_id": session_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ REST screen data error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Screen data upload failed"
        )

@app.get("/api/remote/host/sessions/pending")
async def get_pending_sessions(
    authorization: str = Header(None),
    pc_id: str = Query(...)
):
    """Получение ожидающих сессий для REST хоста"""
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
        
        # Получаем ожидающие сессии из remote_manager
        pending_sessions = []
        if remote_manager:
            # Ищем сессии для этого PC
            for session_id, session_info in remote_manager.active_sessions.items():
                if (session_info.get('pc_id') == pc_id and 
                    session_info.get('status') == 'pending'):
                    pending_sessions.append({
                        "session_id": session_id,
                        "viewer_username": session_info.get('viewer_username', 'unknown'),
                        "session_type": session_info.get('session_type', 'view'),
                        "created_at": session_info.get('created_at').isoformat() if session_info.get('created_at') else None
                    })
        
        logger.info(f"📋 REST pending sessions for {pc_id}: {len(pending_sessions)} sessions")
        
        return {
            "status": "success",
            "sessions": pending_sessions,
            "count": len(pending_sessions),
            "pc_id": pc_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Get pending sessions error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get pending sessions"
        )

# Эндпоинт для службы поддержки
@app.post("/support/request")
async def create_support_request(support_request: SupportRequest):
    """Создание запроса в службу поддержки"""
    try:
        user_name = support_request.user_info.get('user_name', 'Неизвестный пользователь')
        logger.info(f"🆘 New support request from: {user_name}")
        
        # Логируем полученные данные (без чувствительной информации)
        safe_user_info = {
            k: v for k, v in support_request.user_info.items() 
            if k not in ['password', 'token', 'authorization']
        }
        logger.info(f"Support request - User: {safe_user_info}")
        logger.info(f"Support request - System: {support_request.system_info}")
        logger.info(f"Support request - Message length: {len(support_request.request_info.get('message', ''))} chars")
        
        # Пытаемся отправить email
        email_sent = send_support_email(support_request.dict())
        
        # Всегда сохраняем в файл для резервного копирования
        file_saved = save_support_request_to_file(support_request.dict())
        
        if email_sent:
            return {
                "status": "success",
                "message": "Запрос успешно отправлен в службу поддержки",
                "request_id": f"SR-{int(datetime.now().timestamp())}",
                "timestamp": datetime.now().isoformat(),
                "delivery_method": "email"
            }
        elif file_saved:
            return {
                "status": "success", 
                "message": "Запрос сохранен и будет обработан в ближайшее время",
                "request_id": f"SR-{int(datetime.now().timestamp())}",
                "timestamp": datetime.now().isoformat(),
                "delivery_method": "file",
                "note": "Email временно недоступен, запрос сохранен в системе"
            }
        else:
            return {
                "status": "error", 
                "message": "Не удалось обработать запрос. Попробуйте позже."
            }
            
    except Exception as e:
        logger.error(f"❌ Support request processing error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Ошибка при обработке запроса поддержки"
        )

def save_support_request_to_file(support_data: Dict[str, Any]) -> bool:
    """Сохранение запроса поддержки в файл"""
    try:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"support_requests/support_{timestamp}.json"
        
        # Создаем папку если не существует
        os.makedirs("support_requests", exist_ok=True)
        
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(support_data, f, ensure_ascii=False, indent=2)
        
        logger.info(f"✅ Support request saved to file: {filename}")
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to save support request to file: {e}")
        return False

# Эндпоинт для получения списка администраторов
@app.get("/admin")
async def get_admins(authorization: str = Header(None)):
    """Получение списка администраторов"""
    try:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Authorization header required")
        
        token = authorization[7:]
        user_data = verify_token(token)
        if not user_data:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        username = user_data.get("username")
        logger.info(f"Admin list requested by: {username}")
        
        # Проверяем права администратора
        admin = admin_manager.get_admin_by_username(username)
        if not admin or not admin.get('is_active'):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        # Получаем всех администраторов
        admins = admin_manager.get_all_admins()
        
        logger.info(f"Admin list returned: {len(admins)} admins")
        
        return {
            "status": "success",
            "admins": admins,
            "count": len(admins),
            "requested_by": username,
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting admins: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

# Эндпоинт для получения списка сервисов (упрощенная версия)
@app.get("/services")
async def get_services(authorization: str = Header(None)):
    """Получение списка сервисов/услуг"""
    try:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Authorization header required")
        
        token = authorization[7:]
        user_data = verify_token(token)
        if not user_data:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        username = user_data.get("username")
        logger.info(f"Services list requested by: {username}")
        
        # Проверяем права администратора
        admin = admin_manager.get_admin_by_username(username)
        if not admin or not admin.get('is_active'):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        # Получаем сервисы
        services = admin_manager.get_services()
        
        return {
            "status": "success",
            "services": services,
            "count": len(services),
            "requested_by": username,
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting services: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/debug/admin-check")
async def debug_admin_check(authorization: str = Header(None)):
    """Проверка администратора"""
    try:
        if not authorization or not authorization.startswith("Bearer "):
            return {"status": "error", "message": "No authorization header"}
        
        token = authorization[7:]
        user_data = verify_token(token)
        if not user_data:
            return {"status": "error", "message": "Invalid token"}
        
        username = user_data.get("username")
        
        # Проверяем через admin_manager
        admin = admin_manager.get_admin_by_username(username)
        
        # Проверяем напрямую в базе
        from sqlalchemy import text
        from db.database import get_db_connection
        
        db = next(get_db_connection())
        result = db.execute(
            text("SELECT username, is_active, permissions FROM admins WHERE username = :username"),
            {"username": username}
        )
        direct_result = result.fetchone()
        
        return {
            "current_user": username,
            "admin_manager_result": admin,
            "direct_db_result": {
                "username": direct_result[0] if direct_result else None,
                "is_active": direct_result[1] if direct_result else None,
                "permissions": direct_result[2] if direct_result else None
            } if direct_result else None,
            "admin_manager_db_url": admin_manager.database_url if hasattr(admin_manager, 'database_url') else "unknown"
        }
        
    except Exception as e:
        return {"status": "error", "message": str(e)}

def get_basic_services():
    """Возвращает базовый список сервисов"""
    return [
        {
            "id": 1,
            "name": "Корпоративный портал",
            "description": "Основной портал сотрудников",
            "status": "active",
            "version": "1.0.0",
            "endpoint_url": "http://192.1.66.117:8000",
            "health_check_url": "http://192.1.66.117:8000/health",
            "category": "portal",
            "is_active": True
        },
        {
            "id": 2,
            "name": "Удаленный рабочий стол", 
            "description": "Система удаленного доступа к рабочим станциям",
            "status": "active",
            "version": "1.0.0",
            "endpoint_url": "ws://192.1.66.117:8000/api/remote",
            "health_check_url": "http://192.1.66.117:8000/api/remote/test",
            "category": "remote_access",
            "is_active": True
        },
        {
            "id": 3,
            "name": "Чат система",
            "description": "Внутренняя система обмена сообщениями",
            "status": "active", 
            "version": "1.0.0",
            "endpoint_url": "ws://192.1.66.117:8000/chat/ws",
            "health_check_url": "http://192.1.66.117:8000/chat/health",
            "category": "communication",
            "is_active": True
        },
        {
            "id": 4,
            "name": "Система документов",
            "description": "Хранение и управление корпоративными документами",
            "status": "active",
            "version": "1.0.0", 
            "endpoint_url": "http://192.1.66.117:8000/api/documents",
            "health_check_url": "http://192.1.66.117:8000/api/documents/health",
            "category": "documents",
            "is_active": True
        },
        {
            "id": 5,
            "name": "База контактов",
            "description": "Корпоративная база контактов сотрудников",
            "status": "active",
            "version": "1.0.0",
            "endpoint_url": "http://192.1.66.117:8000/contacts",
            "health_check_url": "http://192.1.66.117:8000/contacts/health", 
            "category": "contacts",
            "is_active": True
        },
        {
            "id": 6,
            "name": "Система заявок",
            "description": "Система управления заявками и обращениями",
            "status": "active",
            "version": "1.0.0",
            "endpoint_url": "http://192.1.66.117:8000/request_list",
            "health_check_url": "http://192.1.66.117:8000/request_list/health",
            "category": "requests",
            "is_active": True
        },
        {
            "id": 7,
            "name": "Трекер сотрудников",
            "description": "Система отслеживания рабочего времени",
            "status": "active",
            "version": "1.0.0",
            "endpoint_url": "http://192.1.66.117:8000/emp",
            "health_check_url": "http://192.1.66.117:8000/emp/health",
            "category": "tracking",
            "is_active": True
        }
    ]

@app.get("/debug/current-user")
async def debug_current_user(authorization: str = Header(None)):
    """Отладочный эндпоинт для проверки текущего пользователя"""
    try:
        if not authorization or not authorization.startswith("Bearer "):
            return {"status": "error", "message": "No authorization header"}
        
        token = authorization[7:]
        user_data = verify_token(token)
        if not user_data:
            return {"status": "error", "message": "Invalid token"}
        
        username = user_data.get("username")
        admin = admin_manager.get_admin_by_username(username)
        
        return {
            "status": "success",
            "current_user": {
                "username": username,
                "role": user_data.get("role", "user"),
                "is_admin": admin is not None,
                "admin_data": admin
            },
            "available_admins": admin_manager.get_all_admins()
        }
        
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/", include_in_schema=False)
async def root():
    return {"message": "Добро пожаловать в Employee Portal", "redirect": "/dashboard"}

@app.on_event("startup")
async def startup_event():
    logger.info("AdminManager initialized")
    
    if remote_manager:
        await remote_manager.start_background_tasks()
    logger.info("Remote manager background tasks started")

@app.on_event("shutdown")
async def shutdown_event():
    if remote_manager and remote_manager.cleanup_task:
        remote_manager.cleanup_task.cancel()
    logger.info("Remote manager background tasks stopped")

@app.on_event("startup")
async def startup_event():
    # Инициализация базы данных администраторов (таблицы создаются автоматически)
    
    logger.info("Admin database initialized")
    
    if remote_manager:
        await remote_manager.start_background_tasks()
    logger.info("Remote manager background tasks started")

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