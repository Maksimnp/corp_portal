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

# Конфигурация
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY не установлена в переменных окружения")

ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "3600"))
ONLYOFFICE_SECRET = os.getenv("ONLYOFFICE_SECRET", SECRET_KEY)

# OAuth2 схема
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


class JWTService:
    def __init__(self):
        self.oauth2_scheme = oauth2_scheme

    def create_access_token(
        self,
        data: Dict[str, Union[str, int]],
        expires_delta: Optional[timedelta] = None,
        for_onlyoffice: bool = False
    ) -> str:
        """Создание JWT токена"""
        if not data:
            raise ValueError("Данные для токена не могут быть пустыми")

        secret = ONLYOFFICE_SECRET if for_onlyoffice else SECRET_KEY
        to_encode = data.copy()
        expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
        to_encode.update({"exp": expire})

        try:
            return jwt.encode(to_encode, secret, algorithm=ALGORITHM)
        except Exception as e:
            logger.error(f"Ошибка создания токена: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Ошибка генерации токена"
            )

    def verify_token(self, token: str, for_onlyoffice: bool = False) -> Optional[Dict[str, str]]:
        """Верификация JWT токена"""
        secret = ONLYOFFICE_SECRET if for_onlyoffice else SECRET_KEY

        try:
            payload = jwt.decode(token, secret, algorithms=[ALGORITHM])
            if not payload:
                logger.warning("Пустой payload в токене")
                return None

            username = payload.get("sub")
            if not username:
                logger.warning("Отсутствует subject (sub) в токене")
                return None

            return {
                "username": username,
                "full_name": payload.get("full_name", username),
                "role": str(payload.get("role", "user")),
                "isAdmin": str(payload.get("role", "user")).lower() == "admin"
            }
        except JWTError as e:
            logger.warning(f"JWTError при верификации токена: {e}")
            return None
        except Exception as e:
            logger.error(f"Неожиданная ошибка при верификации токена: {e}")
            return None

    async def get_current_user(self, token: str = Depends(oauth2_scheme)) -> Dict[str, str]:
        """FastAPI-зависимость: получение текущего пользователя"""
        credentials_exception = HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверные учетные данные",
            headers={"WWW-Authenticate": "Bearer"},
        )

        user_data = self.verify_token(token)
        if not user_data:
            raise credentials_exception

        logger.info(f"Успешная аутентификация пользователя: {user_data['username']}")
        return user_data

    def generate_onlyoffice_token(
        self,
        document_key: str,
        user_info: Dict[str, str],
        permissions: Dict[str, bool],
        expires_minutes: int = 60
    ) -> str:
        """Генерация токена для OnlyOffice"""
        payload = {
            "document": {"key": document_key, "permissions": permissions},
            "user": {
                "id": user_info["username"],
                "name": user_info.get("full_name", user_info["username"])
            },
            "iat": datetime.utcnow(),
            "exp": datetime.utcnow() + timedelta(minutes=expires_minutes)
        }
        return self.create_access_token(payload, for_onlyoffice=True)


# === ИНИЦИАЛИЗАЦИЯ СЕРВИСА ===
jwt_service = JWTService()


# === ЭКСПОРТ ФУНКЦИЙ ДЛЯ ИМПОРТА В ДРУГИХ МОДУЛЯХ ===
# Теперь можно: from services.jwt_utils import create_access_token, verify_token, get_current_user

def create_access_token(
    data: Dict[str, Union[str, int]],
    expires_delta: Optional[timedelta] = None,
    for_onlyoffice: bool = False
) -> str:
    """Экспортируемая обёртка для создания токена."""
    return jwt_service.create_access_token(data, expires_delta, for_onlyoffice)


def verify_token(token: str, for_onlyoffice: bool = False) -> Optional[Dict[str, str]]:
    """Экспортируемая обёртка для верификации токена."""
    return jwt_service.verify_token(token, for_onlyoffice)


# FastAPI-зависимость
get_current_user = jwt_service.get_current_user


# Опционально: экспорт generate_onlyoffice_token, если используется вне класса
def generate_onlyoffice_token(
    document_key: str,
    user_info: Dict[str, str],
    permissions: Dict[str, bool],
    expires_minutes: int = 60
) -> str:
    """Экспортируемая обёртка для генерации OnlyOffice токена."""
    return jwt_service.generate_onlyoffice_token(document_key, user_info, permissions, expires_minutes)