from fastapi import APIRouter, Query, HTTPException, Request
from fastapi.responses import FileResponse
import asyncpg
import os
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
    "host": os.getenv("DB_HOST"),
    "database": os.getenv("DB_DATABASE"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
}

USERS_ROVT = [user.strip() for user in os.getenv("USERS_ROVT", "").split(",") if user.strip()]

for key, value in DB_CONFIG.items():
    if not value:
        logger.error(f"Missing environment variable for {key}")
        raise ValueError(f"Missing environment variable for {key}")

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
async def get_requests(request: Request):
    """
    Получает список запросов. Админы видят все запросы, пользователи — только свои.

    Args:
        token: Данные токена, содержащие username, full_name, role.

    Returns:
        Dict: Статус и список запросов.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Токен не предоставлен")

    token_header = auth_header[7:]

    token = verify_token(token_header)


    if not token:
        logger.warning("Unauthorized access attempt")
        raise HTTPException(status_code=401, detail="Требуется авторизация")

    username = token["username"]
    user_role = token.get("role")
    full_name = token.get("full_name")
    if not user_role:
        logger.warning(f"No role found in token for user: {username}")
        raise HTTPException(status_code=401, detail="Роль пользователя не указана")

    conn = await get_db_connection()
    if not conn:
        logger.error("Failed to connect to database")
        raise HTTPException(status_code=500, detail="Ошибка подключения к базе данных")
    try:
        if user_role == "admin":
            logger.info("Пользователь - админ, выбираем все запросы")
            requests = await conn.fetch("SELECT * FROM requests")
            # Добавим лог для админа, чтобы увидеть общее количество
            total_count = await conn.fetchval("SELECT COUNT(*) FROM requests")
            logger.info(f"Всего записей в таблице requests: {total_count}")
        else:
            logger.info(f"Пользователь - обычный, выбираем запросы по sender_fullname='{full_name}'")
            requests = await conn.fetch("SELECT * FROM requests WHERE sender_fullname = $1", full_name)
            # Добавим лог для обычного пользователя
            user_count = await conn.fetchval("SELECT COUNT(*) FROM requests WHERE sender_fullname = $1", full_name)
            logger.info(f"Записей от пользователя '{username}': {user_count}")

        requests_list = [dict(request) for request in requests]
         
        get_requests = await conn.fetch("SELECT * FROM requests WHERE owner_fullname = $1", full_name)
        get_requests_list = [dict(request) for request in get_requests]
        return {"status": "success","data": requests_list, "list_requests": get_requests_list}
    except asyncpg.PostgresError as e:
        logger.error(f"Error fetching requests: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка получения запросов: {str(e)}")
    finally:
        await conn.close()

@router.post("/sort_requests")
async def sort_requests(
    request: Request,
    field: str = Query(...),
    order: str = Query("asc"),
    list_type: str = Query(...)
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
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Токен не предоставлен")

    token_header = auth_header[7:]

    token = verify_token(token_header)

    if not token:
        logger.warning("Unauthorized access attempt")
        raise HTTPException(status_code=401, detail="Требуется авторизация")

    username = token["username"]
    user_role = token.get("role")
    full_name = token.get("full_name")
    if not user_role:
        logger.warning(f"No role found in token for user: {username}")
        raise HTTPException(status_code=401, detail="Роль пользователя не указана")

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

        if (list_type == "my_requests"):
            base_query += " WHERE sender_fullname = $1"
        elif (list_type == "get_requests"):
            base_query += " WHERE owner_fullname = $1"
        params.append(full_name)

        order_direction = "DESC" if order == "desc" else "ASC"
        if field == "date":
            query = f"{base_query} ORDER BY TO_DATE(send_date, 'DD.MM.YYYY') {order_direction}"
        elif field == "status":
            query = f"{base_query} ORDER BY CASE status WHEN 'не просмотрено' THEN 0 WHEN 'в обработке' THEN 1 WHEN 'завершено' THEN 2 ELSE 999 END {order_direction}"
        elif field == "fio":
            query = f"{base_query} ORDER BY sender_fullname {order_direction}"
        elif field == "fioAdmin":
            query = f"{base_query} ORDER BY owner_fullname {order_direction}"
        elif field == "processing_depart":
            query = f"{base_query} ORDER BY CASE processing_depart WHEN 'ТЭРиОВТ' THEN 0 WHEN 'АСУ' THEN 1 ELSE 999 END {order_direction}"
        logger.info(f"Запрос в бд {query}")
        requests = await conn.fetch(query, *params)
        sorted_requests = [dict(req) for req in requests]
        logger.info(f"Запрос в бд {requests} {params}")
        return {"status": "success", "data": sorted_requests, "order": order}

    except asyncpg.PostgresError as e:
        logger.error(f"Error sorting requests: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка сортировки запросов: {str(e)}")
    finally:
        await conn.close()

@router.get("/search_request_id")
async def search_request_id(
    request: Request,
    query: str = Query("")
):
    """
    Ищет запросы по строке в указанных полях.

    Args:
        query: Строка для поиска.
        token: Данные токена, содержащие username, full_name, role.

    Returns:
        Dict: Статус и список найденных запросов.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Токен не предоставлен")

    token_header = auth_header[7:]

    token = verify_token(token_header)

    if not token:
        logger.warning("Unauthorized access attempt")
        raise HTTPException(status_code=401, detail="Требуется авторизация")

    username = token["username"]
    user_role = token.get("role")
    if not user_role:
        logger.warning(f"No role found in token for user: {username}")
        raise HTTPException(status_code=401, detail="Роль пользователя не указана")

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
        columns = requests[0].keys() if requests else []
        requests_list = [dict(req) for req in requests]

        return {"status": "success", "list_requests": requests_list}

    except asyncpg.PostgresError as e:
        logger.error(f"Error searching requests: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка поиска данных: {str(e)}")
    finally:
        await conn.close()

@router.post('/request_repair')
async def request_repair(
    request: Request     # ← Получаем файлы из FormData
):
    """
    Создание нового запроса на ремонт
    
    Args:
        comment: Комментарий к запросу
        service: Тема/услуга запроса
        depart: Отдел
        images: Список прикрепленных изображений
        
    Returns:
        Response: Статус операции
    """

    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Токен не предоставлен")

    token_header = auth_header[7:]

    token = verify_token(token_header)
    if not token:
        logger.warning("Unauthorized access attempt")
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    
    username = token["username"]
    user_role = token.get("role")
    full_name = token.get("full_name")

    contacts = search_ad_users(search_term=full_name, limit=1)
    contact = contacts[0]
    logger.info(f"Данные контакта получены: {contact.email}, {contact.phone_mobile}")
    now_time = datetime.now()

    image_folder = transliterate_fio_to_latin('Дятел Кирилл Дмитриевич') #FIX fullname user
    images_base_path = f'templates/static/images/{image_folder}'

    try:
        os.makedirs(images_base_path, exist_ok=True)
        logger.info(f"Создана папка для изображений: {images_base_path}")
    except Exception as e:
        logger.error(f"Ошибка при создании папки для изображений: {e}")
        raise HTTPException(status_code=500, detail="Ошибка создания папки для изображений")
    
    form = await request.form()

    service = form.get("serviceType")
    comment = form.get("comment") 
    depart = form.get("department")
    images = form.getlist("images")
    logger.info(images)
    if not comment:
        logger.warning("Не указан комментарий")
        raise HTTPException(status_code=400, detail="Комментарий обязателен для заполнения")

    images_path = []

    if images and any(hasattr(img, 'filename') and img.filename for img in images):
        for image in images:
            if hasattr(image, 'filename') and image.filename:
                logger.info(f"Обрабатывается файл: {image.filename}")
                
                if not allowed_file(image.filename):
                    logger.warning(f"Недопустимый тип файла: {image.filename}")
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
                    logger.error(f"Ошибка при сохранении файла {image.filename}: {e}", exc_info=True)
                    raise HTTPException(status_code=500, detail=f"Ошибка сохранения файла {image.filename}")
            else:
                logger.warning("Получен элемент, который не является файлом или не имеет имени")
    else:
        logger.info("Изображения не прикреплены")
    
    request_id = f"mhp{now_time.strftime('%d%m%Y')}-{'-'.join(str(uuid.uuid4()).split('-')[:1])}"
    conn = await get_db_connection()
    if not conn:
        logger.error("Не удалось подключиться к базе данных")
        raise HTTPException(status_code=500, detail="Ошибка подключения к базе данных")
    
    try:
        await conn.execute( #FIX поднять данные из contacts
            """
            INSERT INTO requests (
                request_id, status, comment, sender_fullname, sender_phone, sender_email,
                sender_job_title, sender_depart, send_date, owner, owner_fullname,
                theme, processing_depart, images_path
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            """,
            request_id, 'не просмотрено', comment, full_name, contact.phone_mobile or 'none',
            contact.email or 'none', contact.position or 'none', contact.department or 'none', now_time.strftime("%d.%m.%Y"),
            'none', 'нет', service, depart, 
            images_path if images_path else None
        )
        await conn.close()

        return {'status': 'success', 'data': request_id}
    except asyncpg.PostgresError as e:
        logger.error(f"Ошибка добавления элемента в БД: {e}")
        await conn.close()
        raise HTTPException(status_code=500, detail=f"Ошибка добавления в базу данных: {str(e)}")
    except Exception as e:
        logger.error(f"Ошибка при создании запроса: {e}", exc_info=True)
        await conn.close()
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")

@router.get("/images/{filename}")
async def get_image(filename: str):
    """
    Отдаёт изображение по запросу
    """
    image_path = f"templates/static/images/{filename}"
    
    if os.path.exists(image_path):
        return FileResponse(image_path)
    else:
        raise HTTPException(status_code=404, detail="Изображение не найдено")
    
@router.get("/admins")
async def get_admins(request: Request):
    """
    Возвращает список администраторов.
    Доступ: только для пользователей с ролью 'admin'.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Токен не предоставлен")

    token_header = auth_header[7:]

    token = verify_token(token_header)
    if not token:
        logger.warning("Unauthorized access attempt")
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    
    username = token["username"]
    user_role = token.get("role")

    if user_role != "admin":
        logger.warning(
            f"Доступ запрещён: пользователь {username} "
            f"пытался получить список админов"
        )
        raise HTTPException(status_code=403, detail="Доступ запрещён")

    if not isinstance(USERS_ROVT, list):
        logger.error("USERS_ROVT должен быть списком")
        raise HTTPException(status_code=500, detail="Ошибка сервера: некорректные данные")

    logger.info(f"Пользователь {username} получил список админов - {USERS_ROVT}")
    return {"status": "success", "data": USERS_ROVT}

@router.put("/send_admin")
async def send_to_admin(
        request: Request,
        admin: str = Query(..., description="Логин администратора"),
        request_id: str = Query(..., description="ID запроса")
    ):
    """
    Изменяет владельца запроса
    Доступ: только для пользователей с ролью 'admin'.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Токен не предоставлен")

    token_header = auth_header[7:]

    token = verify_token(token_header)
    if not token:
        logger.warning("Unauthorized access attempt")
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    
    username = token["username"]
    user_role = token.get("role")

    if user_role != "admin":
        logger.warning(
            f"Доступ запрещён: пользователь {username} "
            f"пытался изменить администратора запроса"
        )
        raise HTTPException(status_code=403, detail="Доступ запрещён")

    try:
        logger.info(f"Получаем ФИО администратора")
        contacts = search_ad_users(search_term=admin, limit=1)
        owner = contacts[0]
    except Exception as e: 
        logger.error(f"Ошибка получение данных о администраторе: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")
    
    conn = await get_db_connection()

    if not conn:
        logger.error("Не удалось подключиться к базе данных")
        raise HTTPException(status_code=500, detail="Ошибка подключения к базе данных")

    try:
        result = await conn.execute(
            """
            UPDATE requests 
            SET owner = $1, owner_fullname = $2 
            WHERE request_id = $3
            """,
            admin, owner.displayName, request_id
        )

        await conn.close()

        if "UPDATE 0" in result:
            logger.warning(f"Запрос с ID {request_id} не найден")
            raise HTTPException(status_code=404, detail="Запрос не найден")

        logger.info(f"Запрос {request_id} назначен на {owner.displayName}")
        return {"status": "success"}

    except asyncpg.PostgresError as e:
        logger.error(f"Ошибка базы данных при назначении владельца: {e}", exc_info=True)
        await conn.close()
        raise HTTPException(status_code=500, detail="Ошибка при обновлении данных в базе")
    except Exception as e:
        logger.error(f"Неожиданная ошибка при назначении владельца: {e}", exc_info=True)
        await conn.close()
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")
    
@router.put('/change_status')
async def change_status_request(
    request: Request,
    new_status: str = Query(..., description="Логин администратора"),
    request_id: str = Query(..., description="ID запроса")
):
    """
    Изменяет статус запроса
    Доступ: только для пользователей .
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Токен не предоставлен")

    token_header = auth_header[7:]

    token = verify_token(token_header)
    if not token:
        logger.warning("Unauthorized access attempt")
        raise HTTPException(status_code=401, detail="Требуется авторизация")

    conn = await get_db_connection()

    if not conn:
        logger.error("Не удалось подключиться к базе данных")
        raise HTTPException(status_code=500, detail="Ошибка подключения к базе данных")

    try:
        result = await conn.execute(
            """
            UPDATE requests 
            SET status = $1
            WHERE request_id = $2
            """,
            new_status, request_id
        )

        await conn.close()

        if "UPDATE 0" in result:
            logger.warning(f"Запрос с ID {request_id} не найден")
            raise HTTPException(status_code=404, detail="Запрос не найден")

        return {"status": "success"}

    except asyncpg.PostgresError as e:
        logger.error(f"Ошибка базы данных при изменении статуса запроса: {e}", exc_info=True)
        await conn.close()
        raise HTTPException(status_code=500, detail="Ошибка при изменении статуса запроса")
    except Exception as e:
        logger.error(f"Неожиданная ошибка при назначении владельца: {e}", exc_info=True)
        await conn.close()
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")