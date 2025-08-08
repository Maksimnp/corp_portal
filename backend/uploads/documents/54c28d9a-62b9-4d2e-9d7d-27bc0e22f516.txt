from fastapi import APIRouter, Depends
from typing import List, Dict, Any
import psycopg2
import os
from dotenv import load_dotenv
from services.auth import verify_token 

router = APIRouter()

load_dotenv()

const DB_CONFIG = {
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
}

def get_db_connection():
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        return conn
    except psycopg2.Error as e:
        print(f"Ошибка подключения к БД: {e}")
        return None

@router.get("/get_requests")
async def get_requests(token: str = Depends(verify_token)):
    if not token:
        return {"status": "error", "message": "Требуется авторизация"}

    username = token["username"]
    user_role = token.get("role", "user") 

    try:
        conn = get_db_connection()
        if not conn:
            return {"status": "error", "message": "Ошибка подключения к базе данных"}

        with conn:
            with conn.cursor() as cur:
                if user_role == "admin":
                    # админ видит всё
                    cur.execute("SELECT * FROM requests")
                else:
                    # пользователь только свои как отправитель
                    cur.execute("SELECT * FROM requests WHERE sender_fullname = %s", (username,))

                columns = [desc[0] for desc in cur.description]
                requests = cur.fetchall()
                requests_list = [dict(zip(columns, req)) for req in requests]

        return {"status": "success", "data": requests_list}

    except Exception as e:
        print(f"Ошибка получения запросов: {e}")
        return {"status": "error", "message": str(e)}

@router.post("/sort_requests")
async def sort_requests(token: str = Depends(verify_token)):
    try:
        field = request.args.get('field')
        order = request.args.get('order', 'asc')

        username = token["username"]
        user_role = token.get("role", "user")
        with get_db_connection() as conn:
            if not conn:
                return {'status': 'error', 'message': 'Ошибка подключения к базе данных'}
            with conn.cursor() as cur:
                if user_role == "admin":
                    base_query = "SELECT * FROM requests"
                    params = []
                elif user_role == "user":
                    base_query = "SELECT * FROM requests WHERE sender_fullname = %s"
                    params = [username]
                if field == 'date':
                    query = f"{base_query} ORDER BY send_date {'DESC' if order == 'desc' else 'ASC'}"
                elif field == 'status':
                    query = f"{base_query} ORDER BY CASE status WHEN 'не просмотрено' THEN 0 WHEN 'в обработке' THEN 1 WHEN 'завершено' THEN 2 ELSE 999 END {'DESC' if order == 'desc' else 'ASC'}"
                elif field == 'fio':
                    query = f"{base_query} ORDER BY sender_fullname {'DESC' if order == 'desc' else 'ASC'}"
                elif field == 'fioAdmin':
                    query = f"{base_query} ORDER BY owner_fullname {'DESC' if order == 'desc' else 'ASC'}"
                elif field == 'processing_depart':
                    query = f"{base_query} ORDER BY CASE processing_depart WHEN 'ТЭРиОВТ' THEN 0 WHEN 'АСУ' THEN 1 ELSE 999 END {'DESC' if order == 'desc' else 'ASC'}"
                else:
                    return {'status': 'error', 'message': 'Неизвестное поле для сортировки'}
                cur.execute(query, params)
                columns = [desc[0] for desc in cur.description]
                requests = cur.fetchall()
                sorted_requests = [dict(zip(columns, req)) for req in requests]

                return {'status': 'success', 'data': sorted_requests, 'order': order}
    except Exception as e:
        print(f"Ошибка сортировки запросов: {e}")
        return {'status': 'error', 'message': str(e)}

@router.post('/search_request_id')
async def search_request_id(token: str = Depends(verify_token)):
    try:
        query = request.args.get('query', '').lower()
        username = token["username"]
        user_role = token.get("role", "user")

        with get_db_connection() as conn:
            if not conn:
                return {'status': 'error', 'message': 'Ошибка подключения к базе данных'}
            with conn.cursor() as cur:
                if user_role == "admin":
                    base_query = "SELECT * FROM requests WHERE ("
                    params = []
                elif user_role == "user":
                    base_query = "SELECT * FROM requests WHERE sender_fullname = %s AND ("
                    params = [username]
                fields = ['request_id', 'status', 'comment', 'sender_fullname', 'sender_phone',
                         'sender_email', 'sender_job_title', 'sender_depart', 'send_date',
                         'owner', 'owner_fullname', 'theme', 'processing_depart']
                conditions = [f"{field} ILIKE %s" for field in fields]
                query_str = base_query + " OR ".join(conditions) + ")"
                params.extend([f"%{query}%"] * len(fields))
                cur.execute(query_str, params)
                columns = [desc[0] for desc in cur.description]
                requests = cur.fetchall()
                new_requests_list = [dict(zip(columns, req)) for req in requests]
                return {'status': 'success', 'list_requests': new_requests_list}
    except Exception as e:
        print(f"Ошибка поиска данных: {e}")
        return {'status': 'error', 'message': str(e)}