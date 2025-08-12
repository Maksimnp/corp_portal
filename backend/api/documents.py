import os
import uuid
import asyncpg
from datetime import datetime, timedelta
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer
from fastapi.responses import FileResponse, JSONResponse
from typing import List
from models.document_models import Document, SharedDocument, DocumentStatus, DocumentPermission
from services.jwt_utils import verify_token
from services.ad_auth import authenticate_user
import logging
from jose import jwt, JWTError
import requests

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Documents"])

# Загрузка конфигурации
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

DB_CONFIG = {
    "host": os.getenv("DOCUMENTS_DB_HOST"),
    "database": os.getenv("DOCUMENTS_DB_DATABASE"),
    "user": os.getenv("DOCUMENTS_DB_USER"),
    "password": os.getenv("DOCUMENTS_DB_PASSWORD"),
}

# Настройки из .env
ONLYOFFICE_SECRET = os.getenv("ONLYOFFICE_SECRET")
if not ONLYOFFICE_SECRET:
    raise RuntimeError("ONLYOFFICE_SECRET не установлена в переменных окружения")

BASE_URL = os.getenv("BASE_URL", "http://192.1.66.117:8000")
ONLYOFFICE_SERVER_URL = "http://192.1.66.117"

async def get_db_connection():
    try:
        conn = await asyncpg.connect(**DB_CONFIG)
        logger.debug("Database connection established")
        return conn
    except asyncpg.PostgresError as e:
        logger.error(f"Database connection error: {e}")
        raise HTTPException(status_code=500, detail="Database connection failed")

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

    with open(file_path, "wb") as buffer:
        buffer.write(file_content)

    document = Document(
        id=file_id,
        title=title,
        owner_username=user['username'],
        file_path=file_path,
        file_type=file_ext,
        status=DocumentStatus.EDITED,
        created_at=datetime.now()
    )

    conn = await get_db_connection()
    try:
        await conn.execute(
            """
            INSERT INTO documents (
                id, title, owner_username, file_path, file_size, file_type, created_at, updated_at, status, description
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            """,
            file_id, title, user['username'], file_path, file_size, file_ext,
            datetime.now(), datetime.now(), DocumentStatus.EDITED, ''
        )
        return document
    except asyncpg.PostgresError as e:
        logger.error(f"Database error: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        await conn.close()

@router.post("/documents/share", response_model=SharedDocument)
async def share_document(
    document_id: str = Form(...),
    recipient: str = Form(...),
    permission: str = Form(...),
    file_type: str = Form(...), 
    title: str = Form(...),
    token: str = Depends(oauth2_scheme)
):
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    conn = await get_db_connection()
    try:
        document = await conn.fetchrow(
            "SELECT id, owner_username FROM documents WHERE id = $1",
            document_id
        )
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        if document['owner_username'] != user['username']:
            raise HTTPException(status_code=403, detail="Not the document owner")

        recipient_user = authenticate_user(recipient)
        if not recipient_user:
            raise HTTPException(status_code=404, detail="Recipient not found")

        try:
            doc_permission = DocumentPermission[permission.upper()]
        except KeyError:
            raise HTTPException(status_code=400, detail="Invalid permission value. Must be 'VIEW' or 'EDIT'")

        shared_doc = SharedDocument(
            document_id=document_id,
            recipient=recipient,
            permission=doc_permission,
            shared_at=datetime.now(),
            status=DocumentStatus.PENDING,
            title=title,
            owner_username=user['username'],
            file_path=f"{UPLOAD_DIR}/{document_id}{file_type}",
            file_type=file_type
        )

        await conn.execute(
            """
            INSERT INTO shared_documents (
                document_id, recipient, permission, shared_at, status, title, owner_username, file_path, file_type
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            """,
            document_id, recipient, shared_doc.permission, shared_doc.shared_at,
            shared_doc.status, title, user['username'], shared_doc.file_path, file_type
        )

        return shared_doc
    except asyncpg.PostgresError as e:
        logger.error(f"Database error: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        await conn.close()

@router.get("/documents/my", response_model=List[Document])
async def get_my_documents(search: str = "", token: str = Depends(oauth2_scheme)):
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    conn = await get_db_connection()
    try:
        query = "SELECT * FROM documents WHERE owner_username = $1"
        params = [user['username']]
        if search:
            query += " AND title ILIKE $2"
            params.append(f"%{search}%")

        documents = await conn.fetch(query, *params)
        return [
            Document(
                id=str(doc['id']),
                title=doc['title'],
                owner_username=doc['owner_username'],
                file_path=doc['file_path'],
                file_type=doc['file_type'],
                status=doc['status'],
                created_at=doc['created_at']
            ) for doc in documents
        ]
    except asyncpg.PostgresError as e:
        logger.error(f"Database error: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        await conn.close()

@router.get("/documents/shared", response_model=List[SharedDocument])
async def get_shared_documents(search: str = "", token: str = Depends(oauth2_scheme)):
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    conn = await get_db_connection()
    try:
        query = "SELECT * FROM shared_documents WHERE recipient = $1"
        params = [user['username']]
        if search:
            query += " AND title ILIKE $2"
            params.append(f"%{search}%")

        shared_docs = await conn.fetch(query, *params)
        return [
            SharedDocument(
                document_id=str(doc['document_id']),
                recipient=doc['recipient'],
                permission=doc['permission'],
                shared_at=doc['shared_at'],
                status=doc['status'],
                title=doc['title'],
                owner_username=doc['owner_username'],
                file_path=doc['file_path'],
                file_type=doc['file_type'],
                can_edit=doc['permission'] == DocumentPermission.EDIT
            ) for doc in shared_docs
        ]
    except asyncpg.PostgresError as e:
        logger.error(f"Database error: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        await conn.close()

@router.put("/documents/status/{document_id}", response_model=SharedDocument)
async def update_document_status(
    document_id: str,
    status: DocumentStatus,
    token: str = Depends(oauth2_scheme)
):
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    conn = await get_db_connection()
    try:
        shared_doc = await conn.fetchrow(
            "SELECT * FROM shared_documents WHERE document_id = $1 AND recipient = $2",
            document_id, user['username']
        )
        if not shared_doc:
            raise HTTPException(status_code=404, detail="Shared document not found")

        await conn.execute(
            "UPDATE shared_documents SET status = $1 WHERE document_id = $2 AND recipient = $3",
            status, document_id, user['username']
        )

        return SharedDocument(
            document_id=str(shared_doc['document_id']),
            recipient=shared_doc['recipient'],
            permission=shared_doc['permission'],
            shared_at=shared_doc['shared_at'],
            status=status,
            title=shared_doc['title'],
            owner_username=shared_doc['owner_username'],
            file_path=shared_doc['file_path'],
            file_type=shared_doc['file_type'],
            can_edit=shared_doc['permission'] == DocumentPermission.EDIT
        )
    except asyncpg.PostgresError as e:
        logger.error(f"Database error: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        await conn.close()

@router.get("/documents/download/{docId}")
async def download_document(
    docId: str,
    token: str = Depends(oauth2_scheme)
):
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    conn = await get_db_connection()
    try:
        document = await conn.fetchrow(
            "SELECT file_path, title, file_type FROM documents WHERE id = $1 AND owner_username = $2",
            docId, user['username']
        )
        if not document:
            shared_doc = await conn.fetchrow(
                "SELECT file_path, title, file_type FROM shared_documents WHERE document_id = $1 AND recipient = $2",
                docId, user['username']
            )
            if not shared_doc:
                raise HTTPException(status_code=404, detail="Document not found or access denied")
            document = shared_doc

        file_path = document['file_path']
        file_name = f"{document['title']}{document['file_type']}"

        if not os.path.exists(file_path):
            logger.error(f"File {file_path} not found for document {docId}")
            raise HTTPException(status_code=404, detail="File not found")

        return FileResponse(
            path=file_path,
            filename=file_name,
            media_type='application/octet-stream',
        )
    except asyncpg.PostgresError as e:
        logger.error(f"Database error: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        await conn.close()

@router.delete("/documents/{docId}")
async def delete_document(
    docId: str,
    token: str = Depends(oauth2_scheme)
):
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    conn = await get_db_connection()
    try:
        document = await conn.fetchrow(
            "SELECT file_path, owner_username FROM documents WHERE id = $1",
            docId
        )
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        if document['owner_username'] != user['username']:
            raise HTTPException(status_code=403, detail="Not the document owner")

        await conn.execute("DELETE FROM shared_documents WHERE document_id = $1", docId)
        await conn.execute("DELETE FROM documents WHERE id = $1", docId)

        file_path = document['file_path']
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
                logger.info(f"File {file_path} deleted for document {docId}")
            except OSError as e:
                logger.error(f"Error deleting file {file_path}: {e}")

        return {"status": "success"}
    except asyncpg.PostgresError as e:
        logger.error(f"Database error: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        await conn.close()

@router.post("/documents/onlyoffice/callback")
async def onlyoffice_callback(request: Request):
    """Обработчик callback от OnlyOffice для сохранения изменений"""
    try:
        data = await request.json()
        logger.info(f"OnlyOffice callback received: {data}")
        status = data.get('status')
        if status == 2:
            key = data.get('key', '')
            if '_' not in key:
                logger.warning(f"Invalid key format: {key}")
                return JSONResponse({"error": 1})
            document_id = key.split('_')[0]

            url = data.get('url')
            if url:
                response = requests.get(url, timeout=10)
                if response.status_code == 200:
                    conn = await get_db_connection()
                    try:
                        document = await conn.fetchrow(
                            "SELECT file_path FROM documents WHERE id = $1",
                            document_id
                        )
                        if document:
                            file_path = document['file_path']
                            with open(file_path, 'wb') as f:
                                f.write(response.content)
                            await conn.execute(
                                "UPDATE documents SET updated_at = $1 WHERE id = $2",
                                datetime.now(), document_id
                            )
                            logger.info(f"Document {document_id} saved successfully")
                        else:
                            logger.error(f"Document {document_id} not found for callback")
                    except asyncpg.PostgresError as e:
                        logger.error(f"Database error during callback: {e}")
                    finally:
                        await conn.close()
        return JSONResponse({"error": 0})
    except Exception as e:
        logger.error(f"Error in OnlyOffice callback: {str(e)}", exc_info=True)
        return JSONResponse({"error": 1})

@router.get("/documents/onlyoffice/config/{docId}")
async def get_onlyoffice_config(docId: str, token: str = Depends(oauth2_scheme)):
    """Генерация конфигурации для интеграции с OnlyOffice"""
    try:
        user = verify_token(token)
        if not user:
            raise HTTPException(status_code=401, detail="Требуется авторизация")

        conn = await get_db_connection()
        try:
            document = await conn.fetchrow(
                """SELECT d.file_path, d.title, d.file_type, d.owner_username,
                          sd.permission
                   FROM documents d
                   LEFT JOIN shared_documents sd ON d.id = sd.document_id
                   WHERE d.id = $1 AND (d.owner_username = $2 OR sd.recipient = $2)""",
                docId, user['username']
            )
            if not document:
                raise HTTPException(status_code=404, detail="Документ не найден или нет доступа")

            is_owner = document['owner_username'] == user['username']
            can_edit = is_owner or (document.get('permission') == DocumentPermission.EDIT)

            file_path = document['file_path']
            if not os.path.exists(file_path):
                raise HTTPException(status_code=404, detail="Файл документа не найден")

            file_mod_time = int(os.path.getmtime(file_path))
            doc_key = f"{docId}_{file_mod_time}"

            file_ext = document['file_type'].lower().lstrip('.')
            doc_type = (
                "text" if file_ext in ['docx', 'doc', 'odt', 'txt', 'rtf'] else
                "spreadsheet" if file_ext in ['xlsx', 'xls', 'ods', 'csv'] else
                "presentation" if file_ext in ['pptx', 'ppt', 'odp'] else
                "text"
            )

            editor_config = {
                "callbackUrl": f"{BASE_URL}/api/documents/onlyoffice/callback",
                "mode": "edit" if can_edit else "view",
                "lang": "ru",
                "user": {
                    "id": user['username'],
                    "name": user.get('full_name', user['username'])
                },
                "customization": {
                    "autosave": True,
                    "forcesave": True,
                    "comments": True,
                    "compactToolbar": False
                }
            }

            document_config = {
                "title": document['title'],
                "url": f"{BASE_URL}/api/documents/download/{docId}",
                "fileType": file_ext,
                "key": doc_key,
                "permissions": {
                    "edit": can_edit,
                    "download": True,
                    "print": True,
                    "review": can_edit
                }
            }

            payload = {
                "document": document_config,
                "editorConfig": editor_config,
                "iat": int(datetime.utcnow().timestamp()),
                "exp": int((datetime.utcnow() + timedelta(hours=24)).timestamp())
            }

            try:
                jwt_token = jwt.encode(
                    payload,
                    ONLYOFFICE_SECRET,
                    algorithm="HS256"
                )
            except Exception as e:
                logger.error(f"JWT encode error: {e}")
                raise HTTPException(status_code=500, detail="Ошибка генерации JWT токена")

            config = {
                "document": document_config,
                "documentType": doc_type,
                "editorConfig": editor_config,
                "token": jwt_token,
                "type": "embedded",
                "width": "100%",
                "height": "100%"
            }

            logger.debug(f"Generated OnlyOffice config: {config}")
            return {"config": config}

        except asyncpg.PostgresError as e:
            logger.error(f"Database error: {e}")
            raise HTTPException(status_code=500, detail="Ошибка базы данных")
        finally:
            await conn.close()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")