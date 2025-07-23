# backend/main.py
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from api import auth, chat, helpdesk, contacts, admin, request_list
import uvicorn
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Employee Portal API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://192.1.66.117:3000", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Логирование запросов
@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"Request: {request.method} {request.url} Headers: {request.headers}")
    response = await call_next(request)
    logger.info(f"Response Headers: {response.headers}")
    return response

# Подключение маршрутов
app.include_router(auth.router, prefix="/auth")
app.include_router(chat.router, prefix="/chat")
app.include_router(helpdesk.router, prefix="/helpdesk")
app.include_router(contacts.router, prefix="/contacts")
app.include_router(admin.router, prefix="/admin")
app.include_router(request_list.router, prefix="request_list")

# Запуск сервера
if __name__ == "__main__":
    try:
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=8000,
            log_level="info",
            ws_max_size=1000000,
            ws_ping_interval=20,
            ws_ping_timeout=60,
        )
    except Exception as e:
        logger.error(f"Failed to start server: {e}")
        raise