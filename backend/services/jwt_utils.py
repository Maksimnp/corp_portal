from datetime import datetime, timedelta
from typing import Optional, Dict, Union
from jose import jwt, JWTError
from fastapi import HTTPException, status, Depends
from fastapi.security import OAuth2PasswordBearer
import os
from dotenv import load_dotenv
import logging

logger = logging.getLogger(__name__)

# Загрузка переменных окружения
load_dotenv()
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 60))

# Определение схемы OAuth2
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

def create_access_token(data: Dict[str, Union[str, int]], expires_delta: Optional[timedelta] = None) -> str:
    if not data:
        raise ValueError("data cannot be empty")
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    if expire is None:
        raise ValueError("expire cannot be empty")
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(token: str) -> Optional[Dict[str, str]]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload is None:
            logger.warning("Токен не содержит данных")
            return None
        username = payload.get("sub")
        if username is None:
            logger.warning("Токен не содержит имя пользователя (sub)")
            return None
        user_data = {
            "username": username,
            "full_name": payload.get("full_name", username),
            "role": str(payload.get("role", "user")),
            "isAdmin": str(payload.get("role", "user")).lower() == "admin"  
        }
        return user_data
    except JWTError as e:
        logger.warning(f"Ошибка декодирования JWT токена: {e}")
        return None
    except Exception as e:
        logger.error(f"Неожиданная ошибка при проверке токена: {e}")
        return None

async def get_current_user(token: str = Depends(oauth2_scheme)) -> Dict[str, str]:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Не удалось подтвердить учетные данные",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload is None:
            logger.warning("Токен не содержит данных")
            raise credentials_exception
        username: str = payload.get("sub")
        if username is None:
            logger.warning("Токен не содержит имя пользователя (sub)")
            raise credentials_exception
            
        user_data = {
            "username": username,
            "full_name": payload.get("full_name", username),
            "role": str(payload.get("role", "user")),
            "isAdmin": str(payload.get("role", "user")).lower() == "admin"  
        }
        
        logger.info(f"Пользователь {username} аутентифицирован через токен")
        return user_data
    except JWTError as e:
        logger.warning(f"Ошибка декодирования JWT: {e}")
        raise credentials_exception
    except Exception as e:
        logger.error(f"Неожиданная ошибка в get_current_user: {e}")
        raise credentials_exception