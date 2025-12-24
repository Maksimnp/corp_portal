from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, status, Depends, Header, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import HTTPException
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.staticfiles import StaticFiles
from fastapi import WebSocket, WebSocketDisconnect, Form
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from services.admin_manager import admin_manager
import uvicorn
import base64
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
from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
from services.jwt_utils import jwt_service, verify_token
from pathlib import Path
load_dotenv()
URL_FONTS = os.getenv("URL_FONTS")

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

class TokenSettings(BaseModel):
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    secret_key: str
    algorithm: str = "HS256"
    issuer: Optional[str] = None
    audience: Optional[str] = None

class TokenSettingsUpdate(BaseModel):
    access_token_expire_minutes: Optional[int] = None
    refresh_token_expire_days: Optional[int] = None
    secret_key: Optional[str] = None
    algorithm: Optional[str] = None
    issuer: Optional[str] = None
    audience: Optional[str] = None

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

# Получение CORS origins
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
        smtp_host = os.getenv("SMTP_HOST", "smail1.hoster.by")
        smtp_port = int(os.getenv("SMTP_PORT", "465"))
        smtp_user = os.getenv("SMTP_USER", "portal@minskhleb.by")
        smtp_password = os.getenv("SMTP_PASSWORD", "H54eU0XP")
        
        msg = MIMEMultipart()
        msg['From'] = smtp_user
        msg['To'] = "portal@minskhleb.by"
        msg['Subject'] = f"Запрос в поддержку от {support_data['user_info'].get('user_name', 'Неизвестный пользователь')}"
        
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
        
        logger.info(f"📧 Connecting to SMTP server: {smtp_host}:{smtp_port}")
        
        if smtp_port == 465:
            server = smtplib.SMTP_SSL(smtp_host, smtp_port)
        else:
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
app.mount("/chat-fonts", StaticFiles(directory="templates/static/chat-fonts"), name="/chat-fonts")

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

# Пример базы данных уведомлений
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

AVATARS_DIR = Path("templates/static/avatars")
AVATARS_DIR.mkdir(parents=True, exist_ok=True)

@app.post("/api/users/avatar")
async def upload_avatar(
    userId: str = Form(...),
    avatar: UploadFile = File(...),
):
    if avatar.content_type not in ["image/jpeg", "image/png", "image/gif"]:
        raise HTTPException(status_code=400, detail="Только JPG/PNG/GIF разрешены")

    ext = avatar.filename.split('.')[-1] if '.' in avatar.filename else 'jpg'
    safe_filename = f"{userId}.{ext}"
    file_path = AVATARS_DIR / safe_filename

    with open(file_path, "wb") as f:
        f.write(await avatar.read())

    avatar_url = f"/static/avatars/{safe_filename}"
    return {"avatarUrl": avatar_url}

@app.get("/api/users/{user_id}/avatar")
async def get_avatar(user_id: str):
    file_path = Path("templates/static/avatars") / f"{user_id}.jpg"
    if not file_path.exists():
        return {"avatar": None}
    
    with open(file_path, "rb") as f:
        encoded = base64.b64encode(f.read()).decode('utf-8')
        mime = "image/jpeg"
        return {"avatar": f"data:{mime};base64,{encoded}"}

@app.get("/api/users/backgrounds/{bcg_id}")
async def get_background_chat_data(bcg_id: str):
    file_path = Path("templates/static/chat-fonts") / f"{bcg_id}.png"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Фон не найден")
    
    with open(file_path, "rb") as f:
        encoded = base64.b64encode(f.read()).decode('utf-8')
        mime = "image/png"
        return {"background": f"data:{mime};base64,{encoded}"}


async def authenticate_websocket_jwt(websocket: WebSocket, token: str = None, authorization: str = Header(None)) -> Optional[dict]:
    """JWT аутентификация для WebSocket соединений"""
    try:
        auth_token = token
        if authorization and authorization.startswith("Bearer "):
            auth_token = authorization[7:]
            logger.info("WS auth: Using token from Authorization header")
        if not auth_token:
            logger.warning("WebSocket: No token provided")
            await websocket.send_json({"type": "auth_error", "message": "Authentication token required"})
            await websocket.close(code=1008, reason="Authentication token required")
            return None
        
        user_data = verify_token(auth_token)
        if user_data:
            logger.info(f"WebSocket JWT authentication successful for user: {user_data.get('username')}")
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
    
    username = user_data.get("username")
    try:
        from services.ad_auth import get_user_details, get_user_role
        
        ad_details = get_user_details(username)
        if ad_details:
            user_data["full_name"] = ad_details.get("full_name", username)
            user_data["email"] = ad_details.get("email", f"{username}@mhp.net")
            user_data["department"] = ad_details.get("department", "Не указан")
            user_data["position"] = ad_details.get("title", "Не указана")
            user_data["phone"] = ad_details.get("telephoneNumber", "Не указан")
            user_data["mobile"] = ad_details.get("mobile", "Не указан")
            user_data["otherTelephone"] = ad_details.get("otherTelephone", "Не указан")
            user_data["company"] = ad_details.get("company", "МХП")
            user_data["office"] = ad_details.get("physicalDeliveryOfficeName", "Не указан")
        else:
            user_data["full_name"] = username
            user_data["email"] = f"{username}@mhp.net"
            user_data["department"] = "Не указан"
            user_data["position"] = "Не указана"
            user_data["phone"] = "Не указан"
            user_data["mobile"] = "Не указан"
            user_data["otherTelephone"] = "Не указан"
            user_data["company"] = "МХП"
            user_data["office"] = "Не указан"
        
    except Exception as e:
        logger.warning(f"⚠️ Failed to get AD details for {username}: {e}")
        user_data["full_name"] = username
        user_data["email"] = f"{username}@mhp.net"
        user_data["department"] = "Не указан"
        user_data["position"] = "Не указана"
        user_data["phone"] = "Не указан"
        user_data["mobile"] = "Не указан"
        user_data["otherTelephone"] = "Не указан"
        user_data["company"] = "МХП"
        user_data["office"] = "Не указан"
    
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
# Эндпоинт для службы поддержки
@app.post("/support/request")
async def create_support_request(support_request: SupportRequest):
    """Создание запроса в службу поддержки"""
    try:
        user_name = support_request.user_info.get('user_name', 'Неизвестный пользователь')
        logger.info(f"🆘 New support request from: {user_name}")
        
        safe_user_info = {
            k: v for k, v in support_request.user_info.items() 
            if k not in ['password', 'token', 'authorization']
        }
        logger.info(f"Support request - User: {safe_user_info}")
        logger.info(f"Support request - System: {support_request.system_info}")
        logger.info(f"Support request - Message length: {len(support_request.request_info.get('message', ''))} chars")
        
        email_sent = send_support_email(support_request.dict())
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
        
        os.makedirs("support_requests", exist_ok=True)
        
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(support_data, f, ensure_ascii=False, indent=2)
        
        logger.info(f"✅ Support request saved to file: {filename}")
        return True
        
    except Exception as e:
        logger.error(f"❌ Failed to save support request to file: {e}")
        return False

# User router
user_router = APIRouter(prefix="/api/user", tags=["user"])

@user_router.get("/profile")
async def get_user_profile(current_user: dict = Depends(get_current_user)):
    """Получение профиля пользователя из Active Directory"""
    try:
        username = current_user.get("username")
        if not username:
            raise HTTPException(status_code=400, detail="Username not found in token")
        
        logger.info(f"🔍 Fetching AD profile for user: {username}")
        
        try:
            from services.ad_auth import get_user_details, get_user_role
            user_details = get_user_details(username)
        except ImportError as e:
            logger.error(f"❌ Failed to import AD auth functions: {e}")
            user_details = None
        
        if not user_details:
            logger.warning(f"⚠️ User {username} not found in Active Directory or AD unavailable")
            profile_data = {
                "id": current_user.get("user_id", ""),
                "username": username,
                "full_name": current_user.get("full_name", username),
                "email": current_user.get("email", f"{username}@mhp.net"),
                "role": current_user.get("role", "user"),
                "department": current_user.get("department", "Не указан"),
                "title": current_user.get("position", "Не указана"),
                "phone": current_user.get("phone", "Не указан"),
                "lastLogin": current_user.get("last_login", ""),
                "createdAt": current_user.get("created_at", ""),
                "source": "token_fallback"
            }
        else:
            try:
                role = get_user_role(username)
            except:
                role = current_user.get("role", "user")
            
            profile_data = {
                "id": current_user.get("user_id", ""),
                "username": username,
                "full_name": user_details.get("full_name", username),
                "email": user_details.get("email", f"{username}@mhp.net"),
                "role": role,
                "department": user_details.get("department", "Не указан"),
                "title": user_details.get("title", "Не указана"),
                "phone": user_details.get("telephoneNumber", "Не указан"),
                "mobile": user_details.get("mobile", "Не указан"),
                "otherTelephone": user_details.get("otherTelephone", "Не указан"),
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

@user_router.post("/avatar")
async def update_user_avatar(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """Загрузка аватара пользователя"""
    try:
        username = current_user.get("username")
        logger.info(f"Avatar upload requested by: {username}")
        
        if not file.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="File must be an image")
        
        max_size = 5 * 1024 * 1024
        file.file.seek(0, 2)
        file_size = file.file.tell()
        file.file.seek(0)
        
        if file_size > max_size:
            raise HTTPException(status_code=400, detail="File size must be less than 5MB")
        
        avatars_dir = "templates/static/avatars"
        os.makedirs(avatars_dir, exist_ok=True)
        
        file_extension = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
        filename = f"{username}_{int(datetime.now().timestamp())}.{file_extension}"
        file_path = os.path.join(avatars_dir, filename)
        
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        avatar_url = f"/static/avatars/{filename}"
        
        logger.info(f"Avatar uploaded successfully for {username}: {filename}")
        
        return {
            "status": "success",
            "message": "Avatar uploaded successfully",
            "avatar_url": avatar_url,
            "filename": filename
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Avatar upload error for {username}: {str(e)}")
        raise HTTPException(status_code=500, detail="Avatar upload failed")

@user_router.get("/search")
async def search_users(
    query: str = Query(..., min_length=2, description="Search term"),
    current_user: dict = Depends(get_current_user)
):
    """Поиск пользователей в Active Directory"""
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

@user_router.get("/departments")
async def get_departments(current_user: dict = Depends(get_current_user)):
    """Получение списка всех отделов из Active Directory"""
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
app.include_router(user_router)  

# Добавьте статическую папку для аватаров
app.mount("/static/avatars", StaticFiles(directory="templates/static/avatars"), name="avatars")

@app.get("/health", include_in_schema=False)
async def health_check():
    return {
        "status": "healthy", 
        "timestamp": datetime.utcnow()
    }

@app.get("/", include_in_schema=False)
async def root():
    return {"message": "Добро пожаловать в Employee Portal", "redirect": "/dashboard"}

@app.on_event("startup")
async def startup_event():
    logger.info("AdminManager initialized")
    logger.info("Background tasks started")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Background tasks stopped")


# Запуск сервера
if __name__ == "__main__":
    try:
        check_env_vars()
        logger.info("Запуск сервера FastAPI...")
        
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