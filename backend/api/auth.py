from fastapi import APIRouter, HTTPException, Request, Body
from pydantic import BaseModel, validator
from typing import Optional
import logging

# Настройка логирования
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

router = APIRouter()

# Импорт утилит
from services.jwt_utils import create_access_token
from services.ad_auth import authenticate_user, get_user_role

class LoginData(BaseModel):
    username: str
    password: str

    @validator('username', 'password')
    def not_empty(cls, v):
        if not v or v.strip() == "":
            raise ValueError('Поле не может быть пустым')
        return v

@router.post("/login")
async def login(request: Request, login_data: LoginData = Body(...)):
    """
    Аутентификация через AD.
    Принимает только JSON в формате:
    {
        "username": "string",
        "password": "string"
    }
    """
    # Логирование тела запроса для отладки
    try:
        body = await request.json()
        logger.info(f"Received request body: {body}")
    except Exception as e:
        logger.warning(f"Failed to parse request body: {e}")
        body = None

    if not login_data:
        logger.warning("No login data provided")
        raise HTTPException(
            status_code=422,
            detail="Требуются username и password в теле запроса"
        )

    username = login_data.username
    password = login_data.password

    logger.info(f"Login attempt for user: {username}")

    # Аутентификация через AD
    try:
        user_info = authenticate_user(username, password)
        if not user_info:
            logger.warning(f"AD authentication failed for username: {username}")
            raise HTTPException(
                status_code=401,
                detail="Неверный логин или пароль"
            )
    except Exception as e:
        logger.error(f"AD authentication error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Ошибка аутентификации через AD. Проверьте логи."
        )

    # Получаем роль
    try:
        role = get_user_role(username)
    except Exception as e:
        logger.error(f"Error getting user role for {username}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Ошибка получения роли пользователя. Проверьте логи."
        )

    # Проверка наличия full_name
    full_name = user_info.get("full_name", username)
    logger.info(f"User {username} authenticated successfully with role: {role}")

    # Создаём токен
    access_token = create_access_token(
        data={
            "sub": username,
            "role": role,
            "full_name": full_name
        }
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": role,
        "full_name": full_name
    }