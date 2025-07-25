# services/jwt_utils.py
from datetime import datetime, timedelta
from typing import Optional, Dict, Union
from jose import jwt, JWTError
# Импортируем нужные компоненты из FastAPI для Depends и обработки ошибок
from fastapi import HTTPException, status, Depends
from fastapi.security import OAuth2PasswordBearer
# Импортируем конфигурационные переменные
# Предполагается, что config.py находится на том же уровне или в родительском каталоге
try:
    from config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES
except ImportError:
    # Если config.py не найден, попробуем загрузить из .env
    import os
    from dotenv import load_dotenv
    load_dotenv()
    SECRET_KEY = os.getenv("SECRET_KEY")
    ALGORITHM = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 60))

import logging

logger = logging.getLogger(__name__)

# Определение схемы OAuth2 для получения токена из заголовка Authorization: Bearer <token>
# URL "auth/login" должен совпадать с вашим эндпоинтом аутентификации
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

def create_access_token(data: Dict[str, Union[str, int]], expires_delta: Optional[timedelta] = None) -> str:
    """
    Создание JWT токена доступа.
    
    Args:
        data: Словарь с данными для кодирования в токене
        expires_delta: Время жизни токена (опционально)
        
    Returns:
        str: Закодированный JWT токен
    """
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(token: str) -> Optional[Dict[str, str]]:
    """
    Проверка и декодирование JWT токена.
    
    Args:
        token: JWT токен для проверки
        
    Returns:
        Optional[Dict[str, str]]: Словарь с данными из токена или None при ошибке
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not username:
            logger.warning("Токен не содержит имя пользователя (sub)")
            return None
        return {
            "username": username,
            "full_name": payload.get("full_name", username),
            "role": str(payload.get("role", "user")) # Убедимся, что роль - строка
        }
    except JWTError as e:
        logger.warning(f"Ошибка декодирования JWT токена: {e}")
        return None
    except Exception as e:
        logger.error(f"Неожиданная ошибка при проверке токена: {e}")
        return None

# --- НОВАЯ ФУНКЦИЯ ДЛЯ ЗАЩИТЫ ЭНДПОИНТОВ ---
async def get_current_user(token: str = Depends(oauth2_scheme)) -> Dict[str, str]:
    """
    Зависимость FastAPI для получения текущего пользователя из JWT токена.
    Используется для защиты эндпоинтов, требующих аутентификации.
    
    Args:
        token: JWT токен, полученный из заголовка Authorization
        
    Returns:
        Dict[str, str]: Информация о пользователе из токена
        
    Raises:
        HTTPException: Если токен недействителен или отсутствует
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Не удалось подтвердить учетные данные",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        # Проверяем и декодируем токен
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        
        if username is None:
            logger.warning("Токен не содержит имя пользователя (sub)")
            raise credentials_exception
            
        # Получаем дополнительные данные из токена
        user_data = {
            "username": username,
            "full_name": payload.get("full_name", username),
            "role": str(payload.get("role", "user")) # Убедимся, что роль - строка
        }
        
        logger.info(f"Пользователь {username} аутентифицирован через токен")
        return user_data
        
    except JWTError as e:
        logger.warning(f"Ошибка декодирования JWT: {e}")
        raise credentials_exception
    except Exception as e:
        logger.error(f"Неожиданная ошибка в get_current_user: {e}")
        raise credentials_exception
# ------------------------------------------------
