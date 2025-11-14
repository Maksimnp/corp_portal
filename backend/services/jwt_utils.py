from datetime import datetime, timedelta
from typing import Optional, Dict, Union, Any
from jose import jwt
from jose.exceptions import JWTError, ExpiredSignatureError
from fastapi import HTTPException, status, Depends, Header, WebSocketException
from fastapi.security import OAuth2PasswordBearer
import os
import logging
import uuid
import json
from pathlib import Path
from dotenv import load_dotenv
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

# Файл для хранения настроек токенов
SETTINGS_FILE = Path("token_settings.json")


def load_token_settings() -> Dict[str, Any]:
    """Загрузить настройки токенов из файла"""
    default_settings = {
        "access_token_expire_minutes": ACCESS_TOKEN_EXPIRE_MINUTES,
        "refresh_token_expire_days": REFRESH_TOKEN_EXPIRE_DAYS,
        "algorithm": ALGORITHM
    }

    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
                saved_settings = json.load(f)
                return {**default_settings, **saved_settings}
        except Exception as e:
            logger.error(f"Ошибка загрузки настроек токенов: {e}")

    return default_settings


def save_token_settings(settings: Dict[str, Any]) -> bool:
    """Сохранить настройки токенов в файл"""
    try:
        validated_settings = {
            "access_token_expire_minutes": max(5, min(10080, settings.get("access_token_expire_minutes", ACCESS_TOKEN_EXPIRE_MINUTES))),
            "refresh_token_expire_days": max(1, min(365, settings.get("refresh_token_expire_days", REFRESH_TOKEN_EXPIRE_DAYS))),
            "algorithm": settings.get("algorithm", ALGORITHM)
        }

        with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
            json.dump(validated_settings, f, indent=2, ensure_ascii=False)

        logger.info(f"Настройки токенов сохранены: {validated_settings}")
        return True
    except Exception as e:
        logger.error(f"Ошибка сохранения настроек токенов: {e}")
        return False


def get_current_token_settings() -> Dict[str, Any]:
    """Получить текущие настройки токенов"""
    return load_token_settings()


class JWTService:
    def __init__(self):
        self.oauth2_scheme = oauth2_scheme
        self.settings = load_token_settings()
        logger.info(f"JWTService инициализирован с настройками: {self.settings}")

    def reload_settings(self):
        """Перезагрузить настройки из файла"""
        self.settings = load_token_settings()
        logger.info(f"Настройки JWTService перезагружены: {self.settings}")

    def update_settings(self, new_settings: Dict[str, Any]):
        """Обновить настройки и сохранить в файл"""
        if save_token_settings(new_settings):
            self.settings = load_token_settings()
            logger.info(f"Настройки JWTService обновлены: {self.settings}")
            return True
        return False

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

        access_token_expire_minutes = self.settings["access_token_expire_minutes"]
        expire = datetime.utcnow() + (expires_delta or timedelta(minutes=access_token_expire_minutes))
        to_encode.update({"exp": expire})
        to_encode["jti"] = str(uuid.uuid4())

        try:
            algorithm = self.settings["algorithm"]
            encoded_jwt = jwt.encode(to_encode, secret, algorithm=algorithm)
            logger.info(f"Токен создан для {data.get('sub')}, истекает: {expire}, алгоритм: {algorithm}, jti: {to_encode['jti']}")
            return encoded_jwt
        except Exception as e:
            logger.error(f"Ошибка создания токена: {e}")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Ошибка генерации токена")

    def create_refresh_token(self, data: Dict[str, Union[str, int, bool]]) -> str:
        to_encode = data.copy()
        refresh_token_expire_days = self.settings["refresh_token_expire_days"]
        expire = datetime.utcnow() + timedelta(days=refresh_token_expire_days)
        to_encode.update({"exp": expire, "type": "refresh"})
        to_encode["jti"] = str(uuid.uuid4())

        algorithm = self.settings["algorithm"]
        return jwt.encode(to_encode, SECRET_KEY, algorithm=algorithm)

    def verify_token(self, token: str, for_onlyoffice: bool = False, is_refresh: bool = False) -> Optional[Dict[str, Any]]:
        if not token:
            logger.warning("Пустой токен")
            return None

        clean_token = token
        if token.startswith("Bearer "):
            clean_token = token.split(" ", 1)[1].strip()

        secret = ONLYOFFICE_SECRET if for_onlyoffice else SECRET_KEY

        try:
            algorithm = self.settings["algorithm"]
            payload = jwt.decode(clean_token, secret, algorithms=[algorithm])

            if is_refresh and payload.get("type") != "refresh":
                logger.warning("Предоставлен не refresh-токен")
                return None

            username = payload.get("sub")
            if not username:
                logger.error("Отсутствует обязательное поле 'sub' в токене")
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
            logger.info(f"Токен верифицирован для {username}, алгоритм: {algorithm}")
            return user_data

        except ExpiredSignatureError as e:
            logger.warning(f"Токен истёк: {e}")
            return None
        except JWTError as e:
            logger.error(f"Неверный или повреждённый токен: {e}")
            return None
        except Exception as e:
            logger.error(f"Неожиданная ошибка при верификации токена: {e}", exc_info=True)
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
        access_token_expire_minutes = self.settings["access_token_expire_minutes"]
        return self.create_access_token(payload, timedelta(minutes=access_token_expire_minutes))

    def debug_token(self, token: str) -> Dict[str, Any]:
        result = {
            "token_length": len(token) if token else 0,
            "starts_with_bearer": token.startswith("Bearer ") if token else False,
            "verification_success": False,
            "error": None,
            "payload": None,
            "user_data": None,
            "algorithm_used": self.settings["algorithm"]
        }
        if not token:
            result["error"] = "Пустой токен"
            return result

        clean_token = token.split(" ", 1)[1].strip() if " " in token else token

        try:
            algorithm = self.settings["algorithm"]
            payload = jwt.decode(clean_token, SECRET_KEY, algorithms=[algorithm], options={"verify_exp": False})
            result["payload"] = payload
            user = self.verify_token(token)
            if user:
                result["verification_success"] = True
                result["user_data"] = user
            else:
                result["error"] = "Верификация не удалась"
        except Exception as e:
            result["error"] = str(e)
        return result

    def get_token_settings(self) -> Dict[str, Any]:
        return self.settings.copy()

    def validate_token_settings(self, settings: Dict[str, Any]) -> Dict[str, str]:
        errors = {}

        access_token_minutes = settings.get("access_token_expire_minutes")
        if access_token_minutes is not None:
            if not isinstance(access_token_minutes, int) or access_token_minutes < 5 or access_token_minutes > 10080:
                errors["access_token_expire_minutes"] = "Access Token должен быть целым числом от 5 до 10080 минут"

        refresh_token_days = settings.get("refresh_token_expire_days")
        if refresh_token_days is not None:
            if not isinstance(refresh_token_days, int) or refresh_token_days < 1 or refresh_token_days > 365:
                errors["refresh_token_expire_days"] = "Refresh Token должен быть целым числом от 1 до 365 дней"

        algorithm = settings.get("algorithm")
        if algorithm is not None:
            valid_algorithms = ["HS256", "HS384", "HS512", "RS256"]
            if algorithm not in valid_algorithms:
                errors["algorithm"] = f"Недопустимый алгоритм. Допустимые: {', '.join(valid_algorithms)}"

        return errors


# Экземпляр сервиса
jwt_service = JWTService()

# Экспорты для удобства
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