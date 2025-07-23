from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from api import auth, chat, contacts, admin, request_list
import uvicorn
import logging
import logging.handlers
from os import getenv

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.handlers.RotatingFileHandler("app.log", maxBytes=10_000_000, backupCount=5),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Employee Portal API", docs_url="/docs", redoc_url="/redoc")

# CORS
CORS_ORIGINS = getenv("CORS_ORIGINS", "http://192.1.66.117:3000,http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

# Логирование запросов
@app.middleware("http")
async def log_requests(request: Request, call_next):
    safe_headers = {k: v for k, v in request.headers.items() if k.lower() not in ["authorization", "cookie"]}
    logger.info(f"Request: {request.method} {request.url} Headers: {safe_headers}")
    try:
        response = await call_next(request)
        logger.info(f"Response Status: {response.status_code} Headers: {response.headers}")
        return response
    except Exception as e:
        logger.error(f"Error processing request: {e}")
        raise

# Подключение маршрутов
app.include_router(auth.router, prefix="/auth")
app.include_router(chat.router, prefix="/chat")
app.include_router(contacts.router, prefix="/contacts")
app.include_router(admin.router, prefix="/admin")
app.include_router(request_list.router, prefix="/request_list")

# Запуск сервера
if __name__ == "__main__":
    try:
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=8000,
            log_level="debug",  
            ws_max_size=1000000,
            ws_ping_interval=20,
            ws_ping_timeout=60,
        )
    except (OSError, RuntimeError) as e:
        logger.error(f"Failed to start server: {e}")
        raise