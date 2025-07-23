from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.security import OAuth2PasswordBearer
from typing import List, Dict, Any, Optional
import asyncpg
import os
from dotenv import load_dotenv
import logging
from services.auth import verify_token

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# Настройка логирования
logger = logging.getLogger(__name__)

load_dotenv()

# Проверка переменных окружения
DB_CONFIG = {
    "host": os.getenv("DB_HOST"),
    "database": os.getenv("DB_DATABASE"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
}

for key, value in DB_CONFIG.items():
    if not value:
        logger.error(f"Missing environment variable for {key}")
        raise ValueError(f"Missing environment variable for {key}")

async def get_db_connection():
    """
    Создаёт асинхронное подключение к базе данных.

    Returns:
        asyncpg.Connection: Объект подключения или None при ошибке.
    """
    try:
        conn = await asyncpg.connect(**DB_CONFIG)
        logger.debug("Database connection established")
        return conn
    except asyncpg.PostgresError as e:
        logger.error(f"Database connection error: {e}")
        return None

@router.get("/get_requests")
async def get_requests(token: Dict[str, str] = Depends(verify_token)):
    """
    Получает список запросов. Админы видят все запросы, пользователи — только свои.

    Args:
        token: Данные токена, содержащие username, full_name, role.

    Returns:
        Dict: Статус и список запросов.
    """
    if not token:
        logger.warning("Unauthorized access attempt")
        raise HTTPException(status_code=401, detail="Требуется авторизация")

    username = token.get("username")
    user_role = token.get("role")
    if not username or not user_role:
        logger.warning(f"Invalid token data: username={username}, role={user_role}")
        raise HTTPException(status_code=401, detail="Недействительный токен")

    conn = await get_db_connection()
    if not conn:
        logger.error("Failed to connect to database")
        raise HTTPException(status_code=500, detail="Ошибка подключения к базе данных")

    try:
        if user_role == "admin":
            requests = await conn.fetch("SELECT * FROM requests")
        else:
            requests = await conn.fetch("SELECT * FROM requests WHERE sender_fullname = $1", username)

        if not requests:
            logger.debug(f"No requests found for user: {username}, role: {user_role}")
            return {"status": "success", "data": []}

        requests_list = [dict(req) for req in requests]
        return {"status": "success", "data": requests_list}

    except asyncpg.PostgresError as e:
        logger.error(f"Error fetching requests: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка получения запросов: {str(e)}")
    finally:
        await conn.close()

@router.post("/sort_requests")
async def sort_requests(
    field: str = Query(...),
    order: str = Query("asc"),
    token: Dict[str, str] = Depends(verify_token)
):
    """
    Сортирует запросы по указанному полю и порядку.

    Args:
        field: Поле для сортировки (date, status, fio, fioAdmin, processing_depart).
        order: Порядок сортировки (asc, desc).
        token: Данные токена, содержащие username, full_name, role.

    Returns:
        Dict: Статус, отсортированные запросы и порядок сортировки.
    """
    if not token:
        logger.warning("Unauthorized access attempt")
        raise HTTPException(status_code=401, detail="Требуется авторизация")

    username = token.get("username")
    user_role = token.get("role")
    if not username or not user_role:
        logger.warning(f"Invalid token data: username={username}, role={user_role}")
        raise HTTPException(status_code=401, detail="Недействительный токен")

    valid_fields = ["date", "status", "fio", "fioAdmin", "processing_depart"]
    if field not in valid_fields:
        logger.warning(f"Invalid sort field: {field}")
        raise HTTPException(status_code=400, detail="Неизвестное поле для сортировки")

    if order not in ["asc", "desc"]:
        logger.warning(f"Invalid sort order: {order}")
        raise HTTPException(status_code=400, detail="Недопустимый порядок сортировки")

    conn = await get_db_connection()
    if not conn:
        logger.error("Failed to connect to database")
        raise HTTPException(status_code=500, detail="Ошибка подключения к базе данных")

    try:
        base_query = "SELECT * FROM requests"
        params = []
        if user_role != "admin":
            base_query += " WHERE sender_fullname = $1"
            params.append(username)

        order_direction = "DESC" if order == "desc" else "ASC"
        field_mapping = {
            "date": "send_date",
            "status": "CASE status WHEN 'не просмотрено' THEN 0 WHEN 'в обработке' THEN 1 WHEN 'завершено' THEN 2 ELSE 999 END",
            "fio": "sender_fullname",
            "fioAdmin": "owner_fullname",
            "processing_depart": "CASE processing_depart WHEN 'ТЭРиОВТ' THEN 0 WHEN 'АСУ' THEN 1 ELSE 999 END"
        }
        query = f"{base_query} ORDER BY {field_mapping[field]} {order_direction}"

        requests = await conn.fetch(query, *params)
        if not requests:
            logger.debug(f"No requests found for user: {username}, role: {user_role}")
            return {"status": "success", "data": [], "order": order}

        requests_list = [dict(req) for req in requests]
        return {"status": "success", "data": requests_list, "order": order}

    except asyncpg.PostgresError as e:
        logger.error(f"Error sorting requests: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка сортировки запросов: {str(e)}")
    finally:
        await conn.close()

@router.post("/search_request_id")
async def search_request_id(
    query: str = Query(""),
    token: Dict[str, str] = Depends(verify_token)
):
    """
    Ищет запросы по строке в указанных полях.

    Args:
        query: Строка для поиска.
        token: Данные токена, содержащие username, full_name, role.

    Returns:
        Dict: Статус и список найденных запросов.
    """
    if not token:
        logger.warning("Unauthorized access attempt")
        raise HTTPException(status_code=401, detail="Требуется авторизация")

    username = token.get("username")
    user_role = token.get("role")
    if not username or not user_role:
        logger.warning(f"Invalid token data: username={username}, role={user_role}")
        raise HTTPException(status_code=401, detail="Недействительный токен")

    conn = await get_db_connection()
    if not conn:
        logger.error("Failed to connect to database")
        raise HTTPException(status_code=500, detail="Ошибка подключения к базе данных")

    try:
        base_query = "SELECT * FROM requests WHERE ("
        params = []
        if user_role != "admin":
            base_query = "SELECT * FROM requests WHERE sender_fullname = $1 AND ("
            params.append(username)

        fields = [
            "request_id", "status", "comment", "sender_fullname", "sender_phone",
            "sender_email", "sender_job_title", "sender_depart", "send_date",
            "owner", "owner_fullname", "theme", "processing_depart"
        ]
        conditions = [f"CAST({field} AS TEXT) ILIKE ${i + len(params) + 1}" for i, field in enumerate(fields)]
        query_str = base_query + " OR ".join(conditions) + ")"
        params.extend([f"%{query}%"] * len(fields))

        requests = await conn.fetch(query_str, *params)
        if not requests:
            logger.debug(f"No requests found for search query: {query}, user: {username}")
            return {"status": "success", "list_requests": []}

        requests_list = [dict(req) for req in requests]
        return {"status": "success", "list_requests": requests_list}

    except asyncpg.PostgresError as e:
        logger.error(f"Error searching requests: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка поиска данных: {str(e)}")
    finally:
        await conn.close()