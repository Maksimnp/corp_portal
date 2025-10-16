from datetime import datetime, timedelta
from typing import Optional, Dict, Union, Any
from jose import jwt, JWTError
from fastapi import HTTPException, status, Depends, Header, WebSocketException
from fastapi.security import OAuth2PasswordBearer
import os
from dotenv import load_dotenv
import logging

logger = logging.getLogger(__name__)

# Загрузка переменных окружения
load_dotenv()

# Конфигурация - УВЕЛИЧИВАЕМ ВРЕМЯ ЖИЗНИ ТОКЕНОВ
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY не установлена в переменных окружения")

ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))  # 24 часа
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))  # Новый: refresh на 7 дней
ONLYOFFICE_SECRET = os.getenv("ONLYOFFICE_SECRET", SECRET_KEY)

# OAuth2 схема
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login", auto_error=False)


class JWTService:
    def __init__(self):
        self.oauth2_scheme = oauth2_scheme

    def create_access_token(
        self,
        data: Dict[str, Union[str, int, bool]],
        expires_delta: Optional[timedelta] = None,
        for_onlyoffice: bool = False
    ) -> str:
        """Создание JWT токена"""
        if not data:
            raise ValueError("Данные для токена не могут быть пустыми")

        secret = ONLYOFFICE_SECRET if for_onlyoffice else SECRET_KEY
        to_encode = data.copy()
        
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
            
        to_encode.update({"exp": expire})

        try:
            encoded_jwt = jwt.encode(to_encode, secret, algorithm=ALGORITHM)
            logger.debug(f"Токен создан для пользователя: {data.get('sub')}, expires: {expire}")
            return encoded_jwt
        except Exception as e:
            logger.error(f"Ошибка создания токена: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Ошибка генерации токена"
            )

    def create_refresh_token(self, data: Dict[str, Union[str, int, bool]]) -> str:
        """Создание refresh токена (долгий expire)"""
        to_encode = data.copy()
        expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        to_encode.update({"exp": expire, "type": "refresh"})
        return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

    def verify_token(self, token: str, for_onlyoffice: bool = False, is_refresh: bool = False) -> Optional[Dict[str, Any]]:
        """Верификация JWT токена (тише логи для expired)"""
        if not token:
            logger.debug("Пустой токен")  # Изменено на DEBUG
            return None

        if token.startswith('Bearer '):
            token = token[7:]
            logger.debug("Убрали 'Bearer ' из токена")

        secret = ONLYOFFICE_SECRET if for_onlyoffice else SECRET_KEY

        try:
            payload = jwt.decode(token, secret, algorithms=[ALGORITHM])
            if not payload:
                logger.debug("Пустой payload в токене")
                return None

            username = payload.get("sub")
            if not username:
                logger.debug("Отсутствует subject (sub) в токене")
                return None

            # Проверяем expiration (тихо)
            exp = payload.get("exp")
            if exp and datetime.utcnow() > datetime.fromtimestamp(exp):
                logger.debug(f"Токен истек: {datetime.fromtimestamp(exp)}")  # DEBUG вместо WARNING
                return None

            user_data = {
                "username": username,
                "full_name": payload.get("full_name", username),
                "role": str(payload.get("role", "user")),
                "isAdmin": bool(payload.get("isAdmin", False)),
                "department": payload.get("department", ""),
                "user_id": payload.get("user_id", username),
                "email": payload.get("email", ""),
            }
            
            logger.debug(f"Токен верифицирован для пользователя: {username}")
            return user_data
            
        except JWTError as e:
            logger.debug(f"JWTError при верификации токена: {e}")  # DEBUG вместо WARNING
            return None
        except Exception as e:
            logger.error(f"Неожиданная ошибка при верификации токена: {e}", exc_info=True)
            return None

    async def get_current_user(self, token: str = Depends(oauth2_scheme)) -> Dict[str, Any]:
        """FastAPI-зависимость: получение текущего пользователя"""
        credentials_exception = HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверные учетные данные",
            headers={"WWW-Authenticate": "Bearer"},
        )

        if not token:
            logger.warning("Токен не предоставлен в заголовке Authorization")
            raise credentials_exception

        user_data = self.verify_token(token)
        if not user_data:
            logger.warning(f"Не удалось верифицировать токен")
            raise credentials_exception

        logger.info(f"Успешная аутентификация пользователя: {user_data['username']}")
        return user_data

    async def get_current_user_optional(self, token: str = Depends(oauth2_scheme)) -> Optional[Dict[str, Any]]:
        """Опциональная зависимость - возвращает пользователя или None"""
        if not token:
            return None

        return self.verify_token(token)

    async def get_current_user_ws(self, token: str) -> Dict[str, Any]:
        """WebSocket-зависимость с auto-reconnect советом"""
        if not token:
            logger.debug("WebSocket: токен не предоставлен")
            raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION, reason="Токен доступа не предоставлен")

        user_data = self.verify_token(token)
        if not user_data:
            logger.debug("WebSocket: не удалось верифицировать токен (возможно истек - запросите refresh)")
            raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION, reason="Неверный или истекший токен доступа. Обновите токен.")

        logger.info(f"WebSocket: успешная аутентификация пользователя: {user_data['username']}")
        return user_data

    def create_remote_desktop_token(self, user_data: Dict[str, Any]) -> str:
        """Создание токена для удаленного рабочего стола (24ч)"""
        import socket
        
        pc_id = f"{user_data['username']}_{socket.gethostname()}"
        
        payload = {
            "sub": user_data["username"],
            "full_name": user_data.get("full_name", user_data["username"]),
            "role": user_data.get("role", "user"),
            "isAdmin": user_data.get("isAdmin", False),
            "department": user_data.get("department", ""),
            "user_id": user_data.get("user_id", user_data["username"]),
            "email": user_data.get("email", ""),
            "pc_id": pc_id,
            "token_type": "remote_desktop"
        }
        
        expires_delta = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)  # 24ч
        return self.create_access_token(payload, expires_delta)


# === ИНИЦИАЛИЗАЦИЯ СЕРВИСА ===
jwt_service = JWTService()


# === ЭКСПОРТ ФУНКЦИЙ ДЛЯ ИМПОРТА В ДРУГИХ МОДУЛЯХ ===
def create_access_token(
    data: Dict[str, Union[str, int, bool]],
    expires_delta: Optional[timedelta] = None,
    for_onlyoffice: bool = False
) -> str:
    """Экспортируемая обёртка для создания токена."""
    return jwt_service.create_access_token(data, expires_delta, for_onlyoffice)


def verify_token(token: str, for_onlyoffice: bool = False) -> Optional[Dict[str, Any]]:
    """Экспортируемая обёртка для верификации токена."""
    return jwt_service.verify_token(token, for_onlyoffice)


# FastAPI-зависимости
get_current_user = jwt_service.get_current_user
get_current_user_optional = jwt_service.get_current_user_optional
get_current_user_ws = jwt_service.get_current_user_ws


def create_remote_desktop_token(user_data: Dict[str, Any]) -> str:
    """Экспортируемая обёртка для генерации токена удаленного рабочего стола."""
    return jwt_service.create_remote_desktop_token(user_data)


# Утилиты для работы с токенами
def extract_token_from_header(authorization: str = Header(None)) -> Optional[str]:
    """Извлечение токена из заголовка Authorization"""
    if not authorization:
        logger.debug("Authorization header is missing")
        return None
        
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            logger.warning(f"Invalid authorization scheme: {scheme}")
            return None
        
        logger.debug(f"Token extracted successfully, length: {len(token)}")
        return token
        
    except ValueError as e:
        logger.warning(f"Error parsing authorization header: {e}")
        return None


def create_user_session_token(user_info: Dict[str, Any]) -> str:
    """Создание сессионного токена для пользователя"""
    payload = {
        "sub": user_info["username"],
        "full_name": user_info.get("full_name", user_info["username"]),
        "role": user_info.get("role", "user"),
        "isAdmin": user_info.get("isAdmin", False),
        "department": user_info.get("department", ""),
        "user_id": user_info.get("user_id", user_info["username"]),
        "email": user_info.get("email", ""),
        "token_type": "session"
    }
    
    return create_access_token(payload)


# Простая функция для прямой проверки токена из заголовка
def verify_token_from_header(authorization: str = Header(None)) -> Dict[str, Any]:
    """Прямая проверка токена из заголовка Authorization"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Неверные учетные данные",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    if not authorization:
        logger.warning("Authorization header is required")
        raise credentials_exception
    
    token = extract_token_from_header(authorization)
    if not token:
        logger.warning("Failed to extract token from header")
        raise credentials_exception
    
    user_data = verify_token(token)
    if not user_data:
        logger.warning("Token verification failed")
        raise credentials_exception
    
    return user_data

