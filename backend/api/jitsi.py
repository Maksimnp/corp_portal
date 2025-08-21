from fastapi import APIRouter, Depends, HTTPException
from services.jwt_utils import get_current_user
from jose import jwt
from datetime import datetime, timedelta
import os
from typing import Optional, Dict
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# Настройки Jitsi из переменных окружения
JITSI_JWT_SECRET = os.getenv("JITSI_JWT_SECRET")
JITSI_APP_ID = os.getenv("JITSI_APP_ID")
JITSI_DOMAIN = os.getenv("JITSI_DOMAIN")

# Проверка наличия переменных окружения
if not all([JITSI_JWT_SECRET, JITSI_APP_ID, JITSI_DOMAIN]):
    logger.error("Jitsi environment variables are not set")
    raise EnvironmentError("Jitsi environment variables (JITSI_JWT_SECRET, JITSI_APP_ID, JITSI_DOMAIN) must be set")

def create_jitsi_jwt(user: Dict[str, str], room: Optional[str] = "*") -> str:
    """
    Создаёт JWT для Jitsi Meet.
    :param user: Данные пользователя (username, full_name, role)
    :param room: Название комнаты (или "*" для доступа ко всем комнатам)
    :return: JWT-токен для Jitsi
    """
    payload = {
        "context": {
            "user": {
                "id": user["username"],
                "name": user.get("full_name", user["username"]),
                "email": f"{user['username']}@yourdomain.com",  # Замените на реальный домен
                "moderator": user["role"].lower() == "admin"
            },
            "group": "default"  # Можно настроить, если требуется группировка
        },
        "aud": "jitsi",
        "iss": JITSI_APP_ID,
        "sub": JITSI_DOMAIN,
        "room": room,
        "exp": int((datetime.utcnow() + timedelta(hours=24)).timestamp())
    }
    try:
        return jwt.encode(payload, JITSI_JWT_SECRET, algorithm="HS256")
    except Exception as e:
        logger.error(f"Error creating Jitsi JWT: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Ошибка генерации Jitsi JWT"
        )

@router.get("/generate-jitsi-token")
async def generate_jitsi_token(room: Optional[str] = "*", current_user: Dict[str, str] = Depends(get_current_user)):
    """
    Генерирует JWT для Jitsi Meet на основе данных авторизованного пользователя.
    :param room: Название комнаты (по умолчанию "*")
    :param current_user: Данные текущего пользователя из JWT
    :return: JWT для Jitsi Meet
    """
    logger.info(f"Generating Jitsi JWT for user: {current_user['username']}, room: {room}")
    jitsi_token = create_jitsi_jwt(current_user, room)
    return {
        "jitsi_token": jitsi_token,
        "domain": JITSI_DOMAIN,
        "room": room
    }