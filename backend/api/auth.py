from fastapi import APIRouter, HTTPException, Request, Body, status, Depends
from pydantic import BaseModel, field_validator
import logging
from services.jwt_utils import create_access_token, verify_token
from services.ad_auth import authenticate_user, get_user_role, get_user_details
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.security import OAuth2PasswordBearer

# Настройка логирования
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

router = APIRouter()
security = HTTPBearer()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

async def get_current_user(token: str = Depends(oauth2_scheme)):
    """Получает информацию о текущем пользователе из JWT токена."""
    logger.debug(f"Попытка проверки токена: {token[:10]}...")
    user = verify_token(token)
    if not user:
        logger.warning("Проверка токена не удалась или пользователь не найден")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный или истекший токен доступа",
            headers={"WWW-Authenticate": "Bearer"},
        )
    logger.debug(f"Пользователь аутентифицирован: {user.get('username', 'Unknown')}")
    return user

# --- Функция для WebSocket соединений ---
async def get_current_user_ws(token: str):
    """
    Получает информацию о текущем пользователе из JWT токена для WebSocket.
    """
    logger.debug(f"Попытка проверки WebSocket токена: {token[:10]}...")
    if not token:
        logger.warning("Токен не предоставлен для WebSocket аутентификации")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Токен доступа не предоставлен",
        )

    user = verify_token(token)
    if not user:
        logger.warning("Проверка WebSocket токена не удалась или пользователь не найден")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный или истекший токен доступа",
        )
    
    logger.debug(f"WebSocket пользователь аутентифицирован: {user.get('username', 'Unknown')}")
    return user

class LoginData(BaseModel):
    username: str
    password: str

    @field_validator('username', 'password')
    @classmethod
    def not_empty(cls, v):
        if not v or v.strip() == "":
            raise ValueError('Поле не может быть пустым')
        return v.strip()

@router.post("/login")
async def login(request: Request, login_data: LoginData = Body(...)):
    """
    Аутентификация через AD и выдача JWT токена.
    """
    try:
        body = await request.json()
        logger.debug(f"Получено тело запроса: {body}")
    except Exception as e:
        logger.warning(f"Не удалось распарсить тело запроса: {e}", exc_info=True)
        body = None

    if not login_data:
        logger.warning("Данные для входа не предоставлены")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Требуются username и password в теле запроса"
        )

    username = login_data.username
    password = login_data.password

    logger.info(f"Попытка входа для пользователя: {username}")

    # Аутентификация через AD
    try:
        user_info = authenticate_user(username, password)
        if not user_info:
            logger.warning(f"Аутентификация в AD не удалась для пользователя: {username}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, 
                detail="Неверный логин или пароль"
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка аутентификации через AD: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Внутренняя ошибка сервера при аутентификации. Проверьте логи."
        )

    # Получаем роль
    try:
        role = get_user_role(username)
    except Exception as e:
        logger.error(f"Ошибка получения роли пользователя {username}: {str(e)}", exc_info=True)
        role = "user"

    # Получаем полные данные пользователя
    try:
        ad_user_info = get_user_details(username)
        if not ad_user_info:
            logger.warning(f"Не удалось получить данные пользователя {username} из AD")
            ad_user_info = {"full_name": username, "email": "", "department": ""}
    except Exception as e:
        logger.error(f"Ошибка получения данных пользователя {username} из AD: {str(e)}", exc_info=True)
        ad_user_info = {"full_name": username, "email": "", "department": ""}

    full_name = ad_user_info.get("full_name", username)
    department = ad_user_info.get("department", "")
    isAdmin = role == "admin"

    logger.info(f"Пользователь {username} успешно аутентифицирован с ролью: {role}, отдел: {department}")

    # Создаём токен с дополнительными данными
    access_token = create_access_token(
        data={
            "sub": username,
            "role": role,
            "full_name": full_name,
            "department": department,
            "isAdmin": isAdmin
        }
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": role,
        "full_name": full_name,
        "department": department,
        "isAdmin": isAdmin
    }

@router.get("/me")
async def get_user_info(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        user_data = verify_token(credentials.credentials)
        if not user_data:
            logger.warning(f"Недействительный или истёкший токен: {credentials.credentials[:10]}...")
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный или истёкший токен")
        
        user_info = {
            "username": user_data.get("username"),
            "full_name": user_data.get("full_name", user_data.get("username")),
            "role": user_data.get("role", "user"),
            "isAdmin": user_data.get("isAdmin", False),
            "department": user_data.get("department", "")
        }
        logger.info(f"Информация о пользователе получена для {user_info['username']}")
        return user_info
    except Exception as e:
        logger.error(f"Ошибка в /auth/me: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка сервера: {str(e)}")

@router.get("/user-departments")
async def get_user_departments(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        user_data = verify_token(credentials.credentials)
        if not user_data:
            logger.warning("Недействительный или истёкший токен в /user-departments")
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный или истёкший токен")

        current_username = user_data.get("username")
        if not current_username:
            logger.warning("Токен не содержит имени пользователя")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Недействительный токен: имя пользователя не найдено")

        ad_user_info = get_user_details(current_username)
        if not ad_user_info:
            logger.warning(f"Не удалось получить информацию о пользователе {current_username} из AD")
            departments = []
        else:
            main_department = ad_user_info.get("department", "").strip()
            departments = [main_department] if main_department else []

        logger.info(f"Отделы получены для пользователя {current_username}: {departments}")
        return {"departments": departments}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка получения отделов для пользователя {current_username}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка получения отделов: {str(e)}")