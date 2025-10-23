from datetime import datetime, timedelta
from typing import Optional, Dict, Union, Any
from jose import jwt
from fastapi import HTTPException, status, Depends, Header, WebSocketException
from fastapi.security import OAuth2PasswordBearer
import os
from dotenv import load_dotenv
import logging
import uuid

logger = logging.getLogger(__name__)

# Загрузка переменных окружения
load_dotenv()

# Конфигурация
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY не установлена в переменных окружения")

ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))  # 24 часа
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
ONLYOFFICE_SECRET = os.getenv("ONLYOFFICE_SECRET", SECRET_KEY)

logger.info(f"JWT Configuration: ALGORITHM={ALGORITHM}, ACCESS_TOKEN_EXPIRE_MINUTES={ACCESS_TOKEN_EXPIRE_MINUTES}")
logger.info(f"SECRET_KEY установлена: {'Да' if SECRET_KEY else 'Нет'}")

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
        if not data:
            raise ValueError("Данные для токена не могут быть пустыми")

        secret = ONLYOFFICE_SECRET if for_onlyoffice else SECRET_KEY
        to_encode = data.copy()
        expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
        to_encode.update({"exp": expire})
        to_encode["jti"] = str(uuid.uuid4())  # Добавлен уникальный идентификатор для обеспечения уникальности токена

        try:
            encoded_jwt = jwt.encode(to_encode, secret, algorithm=ALGORITHM)
            logger.info(f"Токен создан для {data.get('sub')}, истекает: {expire}, jti: {to_encode['jti']}")
            return encoded_jwt
        except Exception as e:
            logger.error(f"Ошибка создания токена: {e}")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Ошибка генерации токена")

    def create_refresh_token(self, data: Dict[str, Union[str, int, bool]]) -> str:
        to_encode = data.copy()
        expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        to_encode.update({"exp": expire, "type": "refresh"})
        to_encode["jti"] = str(uuid.uuid4())  # Добавлен уникальный идентификатор для обеспечения уникальности токена
        return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

    def verify_token(self, token: str, for_onlyoffice: bool = False, is_refresh: bool = False) -> Optional[Dict[str, Any]]:
        if not token:
            logger.warning("Пустой токен")
            return None

        # Унифицированная очистка Bearer
        clean_token = token
        if token.startswith("Bearer "):
            clean_token = token.split(" ", 1)[1].strip()

        secret = ONLYOFFICE_SECRET if for_onlyoffice else SECRET_KEY

        try:
            payload = jwt.decode(clean_token, secret, algorithms=[ALGORITHM])
            
            if is_refresh and payload.get("type") != "refresh":
                logger.warning("Не refresh-токен")
                return None

            username = payload.get("sub")
            if not username:
                logger.error("Отсутствует sub")
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
            logger.info(f"Токен верифицирован для {username}")
            return user_data

        except jwt.ExpiredSignatureError as e:
            logger.warning(f"Токен истёк: {e}")
            return None
        except jwt.InvalidTokenError as e:
            logger.error(f"Неверный токен: {e}")
            return None
        except Exception as e:
            logger.error(f"Ошибка верификации: {e}", exc_info=True)
            return None

    async def get_current_user(self, token: Optional[str] = Depends(oauth2_scheme)) -> Dict[str, Any]:
        credentials_exception = HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверные учетные данные",
            headers={"WWW-Authenticate": "Bearer"},
        )
        if not token:
            raise credentials_exception
        user = self.verify_token(token)
        if not user:
            raise credentials_exception
        return user

    async def get_current_user_optional(self, token: Optional[str] = Depends(oauth2_scheme)) -> Optional[Dict[str, Any]]:
        if not token:
            return None
        return self.verify_token(token)

    async def get_current_user_ws(self, token: str) -> Dict[str, Any]:
        if not token:
            raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION, reason="Токен не предоставлен")
        user = self.verify_token(token)
        if not user:
            raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION, reason="Неверный токен")
        return user

    def create_remote_desktop_token(self, user_data: Dict[str, Any]) -> str:
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
        return self.create_access_token(payload, timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))

    def debug_token(self, token: str) -> Dict[str, Any]:
        result = {
            "token_length": len(token) if token else 0,
            "starts_with_bearer": token.startswith("Bearer ") if token else False,
            "verification_success": False,
            "error": None,
            "payload": None,
            "user_data": None
        }
        if not token:
            result["error"] = "Пустой токен"
            return result

        clean_token = token.split(" ", 1)[1].strip() if " " in token else token

        try:
            payload = jwt.decode(clean_token, SECRET_KEY, algorithms=[ALGORITHM], options={"verify_exp": False})
            result["payload"] = payload
            user = self.verify_token(token)
            if user:
                result["verification_success"] = True
                result["user_data"] = user
            else:
                result["error"] = "Верификация failed"
        except Exception as e:
            result["error"] = str(e)
        return result


jwt_service = JWTService()

# Экспорты
create_access_token = jwt_service.create_access_token
verify_token = jwt_service.verify_token
debug_token = jwt_service.debug_token
get_current_user = jwt_service.get_current_user
get_current_user_optional = jwt_service.get_current_user_optional
get_current_user_ws = jwt_service.get_current_user_ws
create_remote_desktop_token = jwt_service.create_remote_desktop_token


def extract_token_from_header(authorization: Optional[str] = Header(None)) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return None


def create_user_session_token(user_info: Dict[str, Any]) -> str:
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


def verify_token_from_header(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Неверные учетные данные",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token = extract_token_from_header(authorization)
    if not token:
        raise credentials_exception
    user = verify_token(token)
    if not user:
        raise credentials_exception
    return user