from fastapi import APIRouter, HTTPException, Request, Body, status, Depends
from pydantic import BaseModel, field_validator
import logging
from services.jwt_utils import create_access_token, verify_token
from services.ad_auth import authenticate_user, get_user_role
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.security import OAuth2PasswordBearer
from services.ad_auth import get_user_details
# Настройка логирования
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

router = APIRouter()
security = HTTPBearer()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login") # Убедитесь, что URL правильный

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
    Получает информацию о текущем пользователе из JWT токена.
    Используется для аутентификации в WebSocket эндпоинтах,
    где токен передается, например, в query-параметрах или cookies.
    """
    logger.debug(f"Attempting to verify WebSocket token: {token[:10]}...") # Логируем начало токена
    if not token:
        logger.warning("No token provided for WebSocket authentication")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Токен доступа не предоставлен",
        )

    user = verify_token(token)
    if not user:
        logger.warning("WebSocket token verification failed or user not found")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный или истекший токен доступа",
            # Примечание: Заголовки WWW-Authenticate не отправляются через WebSocket
        )
    
    logger.debug(f"WebSocket user authenticated: {user.get('username', 'Unknown')}")
    # Дополнительная проверка активности пользователя может быть здесь
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
    Аутентификация через AD.
    """
    # Логирование тела запроса (опционально, для отладки)
    try:
        body = await request.json()
        logger.info(f"Получено тело запроса: {body}")
    except Exception as e:
        logger.warning(f"Не удалось распарсить тело запроса: {e}")
        body = None

    if not login_data:
        logger.warning("Данные для входа не предоставлены")
        raise HTTPException(
            status_code=422,
            detail="Требуются username и password в теле запроса"
        )

    username = login_data.username
    password = login_data.password

    logger.info(f"Попытка входа для пользователя: {username}")

    # Аутентификация через AD с использованием нового сервиса
    try:
        user_info = authenticate_user(username, password)
        if not user_info:
            logger.warning(f"Аутентификация в AD не удалась для пользователя: {username}")
            # ВАЖНО: Возвращаем 401, а не 500, если учетные данные неверны
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, 
                detail="Неверный логин или пароль"
            )
    except HTTPException:
        # Пробрасываем HTTPException от authenticate_user (например, 401)
        raise
    except Exception as e:
        # Любая другая ошибка (проблемы с подключением и т.д.) - это 500
        logger.error(f"Ошибка аутентификации через AD: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Внутренняя ошибка сервера при аутентификации. Проверьте логи."
        )

    # Получаем роль
    try:
        role = get_user_role(username)
    except Exception as e:
        logger.error(f"Ошибка получения роли пользователя {username}: {str(e)}")
        # Это не критично, можно продолжить с ролью "user"
        role = "user" 

    # Проверка наличия full_name
    full_name = user_info.get("full_name", username)
    department = user_info.get("department")
    logger.info(f"Отдел пользователя - {department}")
    logger.info(f"Пользователь {username} успешно аутентифицирован с ролью: {role}")

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
        "full_name": full_name,
        "department": department
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
            "isAdmin": user_data.get("role") == "admin",
            "department": user_data.get("department", "ТЭРиОВТ")
        }
        logger.info(f"User info retrieved for {user_info['username']}")
        return user_info
    except Exception as e:
        logger.error(f"Ошибка в /auth/me: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка сервера: {str(e)}")

@router.get("/user-departments")
async def get_user_departments(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:

        user_data = verify_token(credentials.credentials)
        if not user_data:
            logger.warning("Invalid or expired token in /user-departments")
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный или истёкший токен")

        current_username = user_data.get("username")
        if not current_username:
            logger.warning("Token does not contain username")
            raise HTTPException(status_code=400, detail="Invalid token: username not found")

        ad_user_info = get_user_details(current_username)
        if not ad_user_info:
            logger.error(f"Не удалось получить информацию о пользователе {current_username} из AD")
            departments = []
        else:
            main_department = ad_user_info.get("department", "").strip()
            departments = []
            if main_department:
                departments.append(main_department)

        logger.info(f"Departments retrieved for user {current_username}: {departments}")
        return {"departments": departments}
    except Exception as e:
        logger.error(f"Ошибка получения отделов для пользователя {current_username}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Ошибка получения отделов")