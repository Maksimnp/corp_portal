from fastapi import APIRouter, Query, HTTPException, Request
from fastapi.responses import FileResponse
import aiomysql  # ← замена asyncpg
import os
import json  # ← добавлено для images_path
from dotenv import load_dotenv
import logging
from services.jwt_utils import verify_token
import uuid
from datetime import datetime
from api.contacts import search_ad_users
router = APIRouter()

# Настройка логирования
logger = logging.getLogger(__name__)
load_dotenv()

# Проверка переменных окружения
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "db": os.getenv("DB_DATABASE"),  # ← db вместо database
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "charset": "utf8mb4",
    "autocommit": False,
}

USERS_ROVT = [user.strip() for user in os.getenv("USERS_ROVT", "").split(",") if user.strip()]

# for key, value in DB_CONFIG.items():
#     if not value:
#         logger.error(f"Missing environment variable for {key}")
#         raise ValueError(f"Missing environment variable for {key}")

def allowed_file(filename: str) -> bool:
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'}
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def transliterate_fio_to_latin(fullname: str) -> str:
    translit_dict = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
        'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
        'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
        'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
        'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
        ' ': '_', '-': '_'
    }
    result = ""
    for char in fullname.lower():
        if char in translit_dict:
            result += translit_dict[char]
        elif char.isalnum():
            result += char
    return result

async def get_db_connection():
    try:
        logger.info("Start connect to MySQL")
        # Добавляем таймаут 10 секунд
        conn = await aiomysql.connect(
            **DB_CONFIG
        )
        logger.info("✅ MySQL connection established successfully")
        return conn
    except Exception as e:
        logger.error(f"❌ MySQL connection FAILED: {type(e).__name__}: {e}")
        return None
    
@router.get("/get_requests")
async def get_requests(request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Токен не предоставлен")
    token_header = auth_header[7:]
    token = verify_token(token_header)
    if not token:
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    username = token["username"]
    user_role = token.get("role")
    full_name = token.get("full_name")
    if not user_role:
        raise HTTPException(status_code=401, detail="Роль пользователя не указана")
    conn = await get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Ошибка подключения к базе данных")
    logger.info(f"Подключение к Mysql {conn}")
    try:
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            logger.info(f"Подключение к Mysql step2 {user_role}")
            if user_role == "admin":
                await cursor.execute("SELECT * FROM requests")
                requests = await cursor.fetchall()
                logger.info(f"Подключение к Mysql step3 {requests}")
            else:
                await cursor.execute("SELECT * FROM requests WHERE sender_fullname = %s", (full_name,))
                requests = await cursor.fetchall()
            await cursor.execute("SELECT * FROM requests WHERE owner_fullname = %s", (full_name,))
            get_requests = await cursor.fetchall()
            logger.info(f"Подключение к Mysql step {requests}")
            return {
                "status": "success",
                "data": requests,
                "list_requests": get_requests
            }
    except Exception as e:
        logger.error(f"Error fetching requests: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка получения запросов: {str(e)}")
    finally:
        if conn:
            try:
                await conn.close()
                logger.info("Соединение с MySQL закрыто успешно")
            except Exception as e:
                logger.error(f"Ошибка при закрытии соединения: {e}")

@router.post("/sort_requests")
async def sort_requests(
    request: Request,
    field: str = Query(...),
    order: str = Query("asc"),
    list_type: str = Query(...)
):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Токен не предоставлен")
    token_header = auth_header[7:]
    token = verify_token(token_header)
    if not token:
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    username = token["username"]
    user_role = token.get("role")
    full_name = token.get("full_name")
    if not user_role:
        raise HTTPException(status_code=401, detail="Роль пользователя не указана")
    valid_fields = ["date", "status", "fio", "fioAdmin", "processing_depart"]
    if field not in valid_fields:
        raise HTTPException(status_code=400, detail="Неизвестное поле для сортировки")
    if order not in ["asc", "desc"]:
        raise HTTPException(status_code=400, detail="Недопустимый порядок сортировки")
    conn = await get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Ошибка подключения к базе данных")
    try:
        base_query = "SELECT * FROM requests"
        params = []
        if list_type == "my_requests" and user_role != "admin":
            base_query += " WHERE sender_fullname = %s"
            params.append(full_name)
        elif list_type == "get_requests":
            base_query += " WHERE owner_fullname = %s"
            params.append(full_name)
        order_direction = "DESC" if order == "desc" else "ASC"
        if field == "date":
            query = f"{base_query} ORDER BY STR_TO_DATE(send_date, '%%d.%%m.%%Y') {order_direction}"
        elif field == "status":
            query = f"{base_query} ORDER BY CASE status WHEN 'не просмотрено' THEN 0 WHEN 'в обработке' THEN 1 WHEN 'завершено' THEN 2 ELSE 999 END {order_direction}"
        elif field == "fio":
            query = f"{base_query} ORDER BY sender_fullname {order_direction}"
        elif field == "fioAdmin":
            query = f"{base_query} ORDER BY owner_fullname {order_direction}"
        elif field == "processing_depart":
            query = f"{base_query} ORDER BY CASE processing_depart WHEN 'ТЭРиОВТ' THEN 0 WHEN 'АСУ' THEN 1 ELSE 999 END {order_direction}"
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            await cursor.execute(query, params)
            requests = await cursor.fetchall()
        return {"status": "success", "data": requests, "order": order}
    except Exception as e:
        logger.error(f"Error sorting requests: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка сортировки запросов: {str(e)}")
    finally:
        if conn:
            try:
                await conn.close()
                logger.info("Соединение с MySQL закрыто успешно")
            except Exception as e:
                logger.error(f"Ошибка при закрытии соединения: {e}")

@router.get("/search_request_id")
async def search_request_id(
    request: Request,
    query: str = Query("")
):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Токен не предоставлен")
    token_header = auth_header[7:]
    token = verify_token(token_header)
    if not token:
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    username = token["username"]
    user_role = token.get("role")
    if not user_role:
        raise HTTPException(status_code=401, detail="Роль пользователя не указана")
    conn = await get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Ошибка подключения к базе данных")
    try:
        base_query = "SELECT * FROM requests WHERE ("
        params = []
        if user_role != "admin":
            base_query = "SELECT * FROM requests WHERE sender_fullname = %s AND ("
            params.append(username)
        fields = [
            "request_id", "status", "comment", "sender_fullname", "sender_phone",
            "sender_email", "sender_job_title", "sender_depart", "send_date",
            "owner", "owner_fullname", "theme", "processing_depart"
        ]
        conditions = [f"{field} LIKE %s" for field in fields]  # ← ILIKE → LIKE
        query_str = base_query + " OR ".join(conditions) + ")"
        params.extend([f"%{query}%"] * len(fields))
        async with conn.cursor(aiomysql.DictCursor) as cursor:
            await cursor.execute(query_str, params)
            requests = await cursor.fetchall()
        return {"status": "success", "list_requests": requests}
    except Exception as e:
        logger.error(f"Error searching requests: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка поиска данных: {str(e)}")
    finally:
        if conn:
            try:
                await conn.close()
                logger.info("Соединение с MySQL закрыто успешно")
            except Exception as e:
                logger.error(f"Ошибка при закрытии соединения: {e}")

@router.post('/request_repair')
async def request_repair(request: Request):
    auth_header = request.headers.get("Authorization")

    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Токен не предоставлен")
    
    token_header = auth_header[7:]
    token = verify_token(token_header)
    if not token:
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    
    full_name = token.get("full_name")

    contacts = search_ad_users(search_term=full_name, limit=1)
    if not contacts:
        logger.error(f"User not found in AD: {full_name}")
        raise HTTPException(status_code=400, detail="Ваши контактные данные не найдены в системе. Обратитесь к администратору.")
    contact = contacts[0]
    image_folder = transliterate_fio_to_latin(full_name)

    images_base_path = f'templates/static/images/{image_folder}'

    try:
        os.makedirs(images_base_path, exist_ok=True)
    except Exception as e:
        logger.error(f"Ошибка при создании папки: {e}")
        raise HTTPException(status_code=500, detail="Ошибка создания папки")
    
    form = await request.form()
    service = form.get("serviceType")
    comment = form.get("comment")
    depart = form.get("department")
    images = form.getlist("images")
    now_time = datetime.now()
    if not comment:
        raise HTTPException(status_code=400, detail="Комментарий обязателен")
    images_path = []

    if images and any(hasattr(img, 'filename') and img.filename for img in images):
        for image in images:
            if hasattr(image, 'filename') and image.filename:
                if not allowed_file(image.filename):
                    raise HTTPException(status_code=400, detail=f"Недопустимый тип файла: {image.filename}")
                
                file_extension = image.filename.rsplit(".", 1)[1].lower()
                unique_name = f'mhpImage{str(uuid.uuid4()).split("-")[0]}.{file_extension}'
                image_path = os.path.join(images_base_path, unique_name)
                
                try:
                    contents = await image.read()
                    
                    with open(image_path, "wb") as f:
                        f.write(contents)
                    images_path.append(f'{image_folder}/{unique_name}')
                except Exception as e:
                    logger.error(f"Ошибка сохранения файла: {e}")
                    raise HTTPException(status_code=500, detail=f"Ошибка сохранения файла")
            else:
                logger.warning("Получен элемент, который не является файлом")
    else:
        logger.info("Изображения не прикреплены")
    request_id = f"mhp{now_time.strftime('%d%m%Y')}-{'-'.join(str(uuid.uuid4()).split('-')[:1])}"
    conn = await get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Ошибка подключения к базе данных")
    try:
        async with conn.cursor() as cursor:
            await cursor.execute(
                """
                INSERT INTO requests (
                    request_id, status, comment, sender_fullname, sender_phone, sender_email,
                    sender_job_title, sender_depart, send_date, owner, owner_fullname,
                    theme, processing_depart, images_path
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (request_id, 'не просмотрено', comment, full_name,
                contact.phone_mobile or 'none', contact.email or 'none',
                contact.position or 'none', contact.department or 'none',
                now_time.strftime("%d.%m.%Y"), 'none', 'нет', service, depart,
                json.dumps(images_path) if images_path else None)  # ← JSON в MySQL
            )
            await conn.commit()
        return {'status': 'success', 'data': request_id}
    except Exception as e:
        logger.error(f"Ошибка добавления в БД: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка добавления в базу данных: {str(e)}")
    finally:
        if conn:
            try:
                await conn.close()
                logger.info("Соединение с MySQL закрыто успешно")
            except Exception as e:
                logger.error(f"Ошибка при закрытии соединения: {e}")

@router.get("/images/{filename}")
async def get_image(filename: str):
    image_path = f"templates/static/images/{filename}"
    if os.path.exists(image_path):
        return FileResponse(image_path)
    else:
        raise HTTPException(status_code=404, detail="Изображение не найдено")
    
@router.get("/admins")
async def get_admins(request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Токен не предоставлен")
    token_header = auth_header[7:]
    token = verify_token(token_header)
    if not token:
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    username = token["username"]
    user_role = token.get("role")
    if user_role != "admin":
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    if not isinstance(USERS_ROVT, list):
        raise HTTPException(status_code=500, detail="Ошибка сервера")
    return {"status": "success", "data": USERS_ROVT}

@router.put("/send_admin")
async def send_to_admin(
    request: Request,
    admin: str = Query(...),
    request_id: str = Query(...)
):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Токен не предоставлен")
    token_header = auth_header[7:]
    token = verify_token(token_header)
    if not token:
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    username = token["username"]
    user_role = token.get("role")
    if user_role != "admin":
        raise HTTPException(status_code=403, detail="Доступ запрещён")
    try:
        contacts = search_ad_users(search_term=admin, limit=1)
        owner = contacts[0]
    except Exception as e:
        logger.error(f"Ошибка получения данных админа: {e}")
        raise HTTPException(status_code=500, detail="Ошибка получения данных админа")
    conn = await get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Ошибка подключения к базе данных")
    try:
        async with conn.cursor() as cursor:
            await cursor.execute(
                "UPDATE requests SET owner = %s, owner_fullname = %s WHERE request_id = %s",
                (admin, owner.displayName, request_id)
            )
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Запрос не найден")
            await conn.commit()
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Ошибка обновления владельца: {e}")
        raise HTTPException(status_code=500, detail="Ошибка обновления данных")
    finally:
        if conn:
            try:
                await conn.close()
                logger.info("Соединение с MySQL закрыто успешно")
            except Exception as e:
                logger.error(f"Ошибка при закрытии соединения: {e}")

@router.put('/change_status')
async def change_status_request(
    request: Request,
    new_status: str = Query(...),
    request_id: str = Query(...)
):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Токен не предоставлен")
    token_header = auth_header[7:]
    token = verify_token(token_header)
    if not token:
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    conn = await get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Ошибка подключения к базе данных")
    try:
        async with conn.cursor() as cursor:
            await cursor.execute(
                "UPDATE requests SET status = %s WHERE request_id = %s",
                (new_status, request_id)
            )
            if cursor.rowcount == 0:
                raise HTTPException(status_code=404, detail="Запрос не найден")
            await conn.commit()
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Ошибка изменения статуса: {e}")
        raise HTTPException(status_code=500, detail="Ошибка изменения статуса")
    finally:
        if conn:
            try:
                await conn.close()
                logger.info("Соединение с MySQL закрыто успешно")
            except Exception as e:
                logger.error(f"Ошибка при закрытии соединения: {e}")