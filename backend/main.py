from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import HTTPException
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.staticfiles import StaticFiles
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
load_dotenv()

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

# Проверка переменных окружения
def check_env_vars():
    required_vars = [
        "DB_HOST",
        "DB_DATABASE",
        "DB_USER",
        "DB_PASSWORD",
        "SECRET_KEY",
        "LDAP_SERVER",
        "LDAP_DOMAIN",
        "BASE_DN",
    ]
    missing = [var for var in required_vars if not os.getenv(var)]
    if missing:
        error_msg = f"Отсутствуют переменные окружения: {', '.join(missing)}"
        logger.critical(error_msg)
        raise EnvironmentError(error_msg)

# Получение CORS origins
def get_cors_origins():
    origins_str = os.getenv("CORS_ORIGINS", "http://192.1.66.117:3000,http://localhost:3000,https://portal.minskhleb.by")
    origins = [origin.strip() for origin in origins_str.split(",") if origin.strip()]
    return origins

# Инициализация приложения FastAPI
app = FastAPI(
    title="Employee Portal API",
    description="API для корпоративного портала: аутентификация, чат, заявки, контакты, документы",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
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

@app.get("/health", include_in_schema=False)
async def health_check():
    return {"status": "healthy", "timestamp": __import__("datetime").datetime.utcnow()}

@app.get("/", include_in_schema=False)
async def root():
    return {"message": "Добро пожаловать в Employee Portal", "redirect": "/dashboard"}

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