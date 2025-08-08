import os
import uuid
import asyncpg
import mimetypes
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from fastapi.responses import FileResponse
from typing import List
from models.document_models import Document, SharedDocument, DocumentStatus, DocumentPermission
from services.jwt_utils import verify_token
from services.ad_auth import authenticate_user
import logging

router = APIRouter(tags=["Documents"])
logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# Хранилище документов (в production замените на базу данных)
documents_db = {}

DB_CONFIG = {
    "host": os.getenv("DOCUMENTS_DB_HOST"),
    "database": os.getenv("DOCUMENTS_DB_DATABASE"),
    "user": os.getenv("DOCUMENTS_DB_USER"),
    "password": os.getenv("DOCUMENTS_DB_PASSWORD"),
}

async def get_db_connection():
    try:
        conn = await asyncpg.connect(**DB_CONFIG)
        logger.debug("Database connection established")
        return conn
    except asyncpg.PostgresError as e:
        logger.error(f"Database connection error: {e}")
        return None
    
shared_documents_db = {}

UPLOAD_DIR = "uploads/documents"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/documents", response_model=Document)
async def upload_document(
    file: UploadFile = File(...),
    title: str = Form(...),
    token: str = Depends(oauth2_scheme)
):
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    file_id = str(uuid.uuid4())
    file_ext = os.path.splitext(file.filename)[1] if file.filename else ""
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}{file_ext}")

    file_content = await file.read()
    file_size = len(file_content)
    
    root, extension = os.path.splitext(file_path)

    os.makedirs(UPLOAD_DIR, exist_ok=True) 
    with open(file_path, "wb") as buffer:
        buffer.write(file_content)
    
    # Создаем запись о документе
    document = Document(
        id=file_id,
        title=title,
        owner_username=user['username'],
        file_path=file_path,
        status=DocumentStatus.EDITED,
        created_at=datetime.now()
    )
    
    conn = await get_db_connection()

    if not conn:
        logger.error("Не удалось подключиться к базе данных")
        raise HTTPException(status_code=500, detail="Ошибка подключения к базе данных")
    
    try:
        await conn.execute(
            """
            INSERT INTO documents (
                id, title, owner_username, file_path, file_size, file_type, created_at, updated_at, status, description
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            """,
            file_id, title, user['username'], file_path, file_size, extension,  datetime.now(), datetime.now(), DocumentStatus.EDITED, ''
        )
        await conn.close()

        return document
    except asyncpg.PostgresError as e:
        logger.error(f"Ошибка добавления элемента в БД: {e}")
        await conn.close()
        raise HTTPException(status_code=500, detail=f"Ошибка добавления в базу данных: {str(e)}")
    except Exception as e:
        logger.error(f"Ошибка при создании запроса: {e}", exc_info=True)
        await conn.close()
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")

@router.post("/documents/share", response_model=SharedDocument)
async def share_document(
    document_id: str = Form(...),
    recipient_username: str = Form(...),
    can_edit: bool = Form(False),
    token: str = Depends(oauth2_scheme)
):
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    # Проверяем существование документа
    if document_id not in documents_db:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Проверяем права владельца
    if documents_db[document_id].owner != user['username']:
        raise HTTPException(status_code=403, detail="Not the document owner")
    
    # Проверяем существование получателя в AD
    recipient = authenticate_user(recipient_username)
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")
    
    # Создаем запись о shared документе
    shared_doc = SharedDocument(
        document_id=document_id,
        recipient=recipient_username,
        permission=DocumentPermission.EDIT if can_edit else DocumentPermission.VIEW,
        shared_at=datetime.now()
    )
    
    shared_key = f"{document_id}_{recipient_username}"
    shared_documents_db[shared_key] = shared_doc
    
    return shared_doc

@router.get("/documents/my", response_model=List[Document])
async def get_my_documents(token: str = Depends(oauth2_scheme)):
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    conn = await get_db_connection()
    if not conn:
        logger.error("Не удалось подключиться к бд")
        raise HTTPException(status_code=500, detail="Не удалось подключиться к базе данных")
    
    try:
        documents = await conn.fetch("""SELECT * FROM documents WHERE owner_username=$1""", user['username'])

        documents_list = []
        for doc_record in documents:
            doc_dict = dict(doc_record)
            if isinstance(doc_dict.get('id'), uuid.UUID):
                doc_dict['id'] = str(doc_dict['id'])
            documents_list.append(doc_dict)

        return documents_list
    except asyncpg.PostgresError as e:
        logger.error(f"Ошибка извлечения данных из БД: {e}")
        await conn.close()
        raise HTTPException(status_code=500, detail=f"Ошибка извлечения данных из базы данных: {str(e)}")
    except Exception as e:
        logger.error(f"Ошибка извлечения данных из БД: {e}", exc_info=True)
        await conn.close()
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")
    finally:
        await conn.close()

@router.get("/documents/shared", response_model=List[dict])
async def get_shared_documents(token: str = Depends(oauth2_scheme)):
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    result = []
    for shared in shared_documents_db.values():
        if shared.recipient == user['username']:
            doc = documents_db.get(shared.document_id)
            if doc:
                result.append({
                    **doc.dict(),
                    "shared_info": shared.dict(),
                    "can_edit": shared.permission == DocumentPermission.EDIT
                })
    
    return result

@router.put("/documents/status/{document_id}", response_model=SharedDocument)
async def update_document_status(
    document_id: str,
    status: DocumentStatus,
    token: str = Depends(oauth2_scheme)
):
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    shared_key = None
    for key, shared in shared_documents_db.items():
        if shared.document_id == document_id and shared.recipient == user['username']:
            shared_key = key
            break
    
    if not shared_key:
        raise HTTPException(status_code=404, detail="Shared document not found")
    
    shared_documents_db[shared_key].status = status
    return shared_documents_db[shared_key]

@router.get("/documents/download/{docId}")
async def download_document(
    docId:str,
    token: str = Depends(oauth2_scheme)
):
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        conn = await get_db_connection()

        if not conn:
            logger.error("Не удалось подключиться к бд")
            raise HTTPException(status_code=500, detail="Не удалось подключиться к базе данных")
        
        document_permission = await conn.fetchrow(
            "SELECT file_path, title FROM documents WHERE id=$1 AND owner_username = $2",
            docId, user['username']
        )
        if not document_permission:
            logger.error("Документ не найден или доступ запрещен")
            raise HTTPException(status_code=404, detail="Документ не найден или доступ запрещен")
        file_path = document_permission['file_path']
        file_name = f"{document_permission['title']}.txt"

        logger.info(f"filename - {file_name}")
        if not os.path.exists(file_path):
            logger.error(f"Файла с id - {docId} в директории - {UPLOAD_DIR} не существует")
            raise HTTPException(status_code=500, detail="Данного файла не существует, обратитесь к администратору")

        return FileResponse(
            path=file_path,
            filename=file_name,
            media_type='application/octet-stream',
        )
    except HTTPException:
        raise
    except asyncpg.PostgresError as e:
        logger.error(f"Ошибка запроса к БД при скачивании документа {docId}: {e}")
        raise HTTPException(status_code=500, detail="Ошибка доступа к базе данных")
    except Exception as e:
        logger.error(f"Неожиданная ошибка при скачивании документа {docId}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")
    finally:
        conn.close()

@router.delete("/documents/{docId}")
async def delete_document(
    docId: str,
    token: str = Depends(oauth2_scheme)
):
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        # 2. Подключение к базе данных
        conn = await get_db_connection()
        if not conn:
            logger.error("Не удалось подключиться к базе данных при удалении документа")
            raise HTTPException(status_code=500, detail="Ошибка подключения к базе данных")

        document_data = await conn.fetchrow(
            """
            SELECT file_path, owner_username 
            FROM documents 
            WHERE id = $1
            """,
            docId
        )

        if not document_data:
            raise HTTPException(status_code=404, detail="Документ не найден")
        file_path = document_data['file_path']
        
        await conn.execute(
            "DELETE FROM documents WHERE id = $1",
            docId
        )

        file_deleted = False
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
                file_deleted = True
                logger.info(f"Файл {file_path} для документа {docId} успешно удален с диска")
            except OSError as e:
                logger.error(f"Ошибка при удалении файла {file_path} для документа {docId}: {e}")
        else:
            logger.warning(f"Файл {file_path} не найден")

        logger.info(f"Документ {docId} удален пользователем {user['username']}.")

        return {"status": "success"}
    except asyncpg.PostgresError as e:
        logger.error(f"Ошибка базы данных при удалении документа {docId}: {e}")
        raise HTTPException(status_code=500, detail="Ошибка удаления документа из базы данных")
    finally:
        await conn.close()