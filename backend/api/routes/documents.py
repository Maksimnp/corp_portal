import os
import uuid
import requests
from jose import jwt
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, Query, Body, Path
from fastapi.responses import FileResponse, JSONResponse
from fastapi.security import OAuth2PasswordBearer
from typing import List, Optional
from models.document_models import Document, SharedDocument, DocumentStatus, DocumentPermission, DocumentStatusMod
from schemas.document_schemas import DocumentCreate,DocumentResponse, SharedDocumentCreate, DocumentStatusCreate
from services.jwt_utils import verify_token
import logging
from typing import Dict
from pathlib import Path as PathLib
from sqlalchemy.orm import Session
from db.database import get_db_connection as get_db
from crud.documents import (
    create_document, get_user_documents, share_document,
    get_shared_documents, update_shared_document_status,
    delete_document, get_document, get_shared_document,
    get_sended_documents, create_status_document, get_status_documents
)

router = APIRouter(prefix="/documents", tags=["Documents"])

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# Конфигурация
UPLOAD_DIR = os.getenv("DOCUMENTS_UPLOAD_DIR", "uploads/documents")
ALLOWED_EXTENSIONS = os.getenv("DOCUMENTS_ALLOWED_TYPES", ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt").split(",")
MAX_FILE_SIZE = int(os.getenv("DOCUMENTS_MAX_SIZE_MB", 50)) * 1024 * 1024  # в байтах
ONLYOFFICE_SERVER_URL = os.getenv("ONLYOFFICE_SERVER_URL")
YOUR_PORTAL_API_BASE_URL = os.getenv("VITE_API_BASE_URL")
ONLYOFFICE_JWT_SECRET = os.getenv("ONLYOFFICE_SECRET", "your_strong_secret_key_here")
# Создаем директорию для загрузок
PathLib(UPLOAD_DIR).mkdir(parents=True, exist_ok=True)

@router.post("/documents", response_model=DocumentResponse)
async def upload_document(
    file: UploadFile = File(...),
    title: str = Form(...),
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    # Проверка расширения файла
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    # Проверка размера файла
    file_size = 0
    for chunk in file.file:
        file_size += len(chunk)
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Max size: {MAX_FILE_SIZE // (1024 * 1024)}MB"
            )
    await file.seek(0)
    # Сохраняем файл
    file_id = uuid.uuid4()
    file_path = os.path.join(UPLOAD_DIR, f"{str(file_id)}{file_ext}")
    
    try:
        with open(file_path, "wb") as buffer:
            buffer.write(await file.read())
    except Exception as e:
        logger.error(f"Error saving file: {e}")
        raise HTTPException(status_code=500, detail="Error saving file")
    
    # Создаем запись о документе в БД
    try:
        document = create_document(db, DocumentCreate(
            id=file_id,
            title=title,
            owner_username=user['username'],
            file_path=file_path,
            file_size=file_size,
            file_type=file_ext
        ))
    except Exception as e:
        logger.error(f"Error creating document record: {e}")
        os.remove(file_path)  # Удаляем файл, если не удалось создать запись
        raise HTTPException(status_code=500, detail="Error creating document record")
    
    return document

@router.get("/my", response_model=List[Document])
async def get_my_documents(
    token: str = Depends(oauth2_scheme),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    try:
        return get_user_documents(db, user['username'], search)
    except Exception as e:
        logger.error(f"Error getting user documents: {e}")
        raise HTTPException(status_code=500, detail="Error getting documents")

@router.get("/shared", response_model=List[SharedDocument])
async def get_shared_doc(
    token: str = Depends(oauth2_scheme),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    try:
        return get_shared_documents(db, user['username'], search)
    except Exception as e:
        logger.error(f"Error getting shared documents: {e}")
        raise HTTPException(status_code=500, detail="Error getting shared documents")

@router.get("/sended", response_model=List[SharedDocument])
async def get_sended_doc(
    token: str = Depends(oauth2_scheme),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    try:
        return get_sended_documents(db, user['username'], search)
    except Exception as e:
        logger.error(f"Error getting shared documents: {e}")
        raise HTTPException(status_code=500, detail="Error getting shared documents")
    
@router.post("/share", response_model=SharedDocument)
async def share_document_endpoint(
    document_id: str = Form(...),
    recipient: str = Form(...),
    permission: DocumentPermission = Form(...),
    fil_type: str = Form(...),
    title: str = Form(...),
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    # Проверяем, существует ли документ и принадлежит ли он пользователю
    document = get_document(db, document_id)
    if not document or document.owner_username != user['username']:
        raise HTTPException(status_code=404, detail="Document not found or access denied")
    
    try:
        logger.info(f"типа файла - {fil_type}")
        shared_doc = share_document(db, SharedDocumentCreate(
            document_id=document_id,
            recipient_username=recipient,
            permission=permission,
            file_type=fil_type,
            owner_username=user["username"],
            title=title
        ))
        return shared_doc
    except Exception as e:
        logger.error(f"Error sharing document: {e}")
        raise HTTPException(status_code=500, detail="Error sharing document")

@router.post("/doc_status", response_model=DocumentStatusMod)
async def share_document_endpoint(
    document_id: str = Form(...),
    recipient: str = Form(...),
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    # Проверяем, существует ли документ и принадлежит ли он пользователю
    document = get_document(db, document_id)
    if not document or document.owner_username != user['username']:
        raise HTTPException(status_code=404, detail="Document not found or access denied")
    
    try:
        status_doc = create_status_document(db, DocumentStatusCreate(
            document_id=document_id,
            recipient_username=recipient,
            owner_username=user["username"],
            status=DocumentStatus.PENDING
        ))
        return status_doc
    except Exception as e:
        logger.error(f"Error sharing document: {e}")
        raise HTTPException(status_code=500, detail="Error sharing document")

@router.get("/doc_status", response_model=Dict[str, str])
async def share_document_endpoint(
    token: str = Depends(oauth2_scheme),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    try:
        return get_status_documents(db, user['username'], search)
    except Exception as e:
        logger.error(f"Error getting shared documents: {e}")
        raise HTTPException(status_code=500, detail="Error getting shared documents")
    
@router.put("/status/{document_id}", response_model=DocumentStatusMod)
async def update_document_status(
    document_id: str,
    status: DocumentStatus = Body(...),
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    try:
        updated_doc = update_shared_document_status(db, document_id, user['username'], status)
        if not updated_doc:
            raise HTTPException(status_code=404, detail="Shared document not found")
        return updated_doc
    except Exception as e:
        logger.error(f"Error updating document status: {e}  ")
        raise HTTPException(status_code=500, detail="Error updating document status")
        

@router.get("/download/{document_id}", response_class=FileResponse)
async def download_document(
    document_id: str,
    db: Session = Depends(get_db)
):    
    document = get_document(db, document_id)
 
    if not os.path.exists(document.file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    return FileResponse(
        document.file_path,
        media_type='application/octet-stream',
        filename=document.title
    )

@router.delete("/{document_id}", status_code=204)
async def delete_document_endpoint(
    document_id: str,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    document = get_document(db, document_id)
    if not document or document.owner_username != user['username']:
        raise HTTPException(status_code=404, detail="Document not found or access denied")
    
    try:
        if delete_document(db, document_id):
            if os.path.exists(document.file_path):
                os.remove(document.file_path)
        else:
            raise HTTPException(status_code=404, detail="Document not found")
    except Exception as e:
        logger.error(f"Error deleting document: {e}")
        raise HTTPException(status_code=500, detail="Error deleting document")
    

@router.get("/onlyoffice/config/{document_id}")
async def get_onlyoffice_config(
    document_id: str = Path(...),
    type_doc: str = Query(...),
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """
    Генерирует конфигурацию для встраивания OnlyOffice редактора.
    """
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    document = get_document(db, document_id)
    share_doc = get_shared_document(db, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    document_url = f"{YOUR_PORTAL_API_BASE_URL}/api/documents/download/{document_id}"
    callback_url = f"{YOUR_PORTAL_API_BASE_URL}/api/documents/onlyoffice/callback"
    session_key = str(uuid.uuid4())
    combined_key = f"{session_key}.{document_id}"
    document_type = get_document_type(document.file_type)
    
    config = {
        "document": {
            "fileType": document.file_type.lstrip('.').lower(),
            "key": document_id,
            "title": document.title,
            "url": document_url,
        },
        "documentType": document_type,
        "editorConfig": {
            "callbackUrl": callback_url,
            "mode": (share_doc.permission.lower() if (type_doc == 'get') else document.permission.lower()),
            "user": {
                "id": user['username'],
                "name": user.get('displayName', user['username']),
                "documentId": document_id
            },
            "lang": "ru"
        },
        "userdata": document_id
    }
    config["editorConfig"]["customization"] = {
        "forcesave": True,  # Включает принудительное сохранение по команде
        "autosave": True    # Убедитесь, что autosave включен (по умолчанию true)
    }
    if (share_doc and share_doc.permission == 'REVIEW'):
        config["document"]["permissions"] = { "edit": False, "review": True }
    
    token = jwt.encode(config, ONLYOFFICE_JWT_SECRET, algorithm="HS256")
    config["token"] = token
    return JSONResponse(content={"config": config, "token": token})

def get_document_type(file_ext: str) -> str:
    """Определяет тип документа для OnlyOffice по расширению файла."""
    word_exts = {'.doc', '.docx', '.dotx', '.docm', '.dotm', '.odt', '.ott', '.rtf', '.txt', '.html', '.htm', '.mht', '.pdf', '.djvu', '.fb2', '.epub', '.xps'}
    cell_exts = {'.xls', '.xlsx', '.xlsm', '.xlsb', '.xlt', '.xltx', '.xltm', '.ods', '.ots', '.csv'}
    slide_exts = {'.ppt', '.pptx', '.pptm', '.pot', '.potx', '.potm', '.pps', '.ppsx', '.ppsm', '.odp', '.otp'}

    ext = file_ext.lower()
    if ext in word_exts:
        return "word"
    elif ext in cell_exts:
        return "cell"
    elif ext in slide_exts:
        return "slide"
    else:
        return "word"

# @router.post("/onlyoffice/callback")
# async def onlyoffice_callback(request: dict, db: Session = Depends(get_db)):
#     """
#     Callback URL для получения обновленного файла от OnlyOffice.
#     ВАЖНО: Этот эндпоинт ДОЛЖЕН БЫТЬ доступен с сервера OnlyOffice без аутентификации!
#     """
#     try:
#         callback_data = request
#         print(f"Received OnlyOffice callback: {callback_data}")

#         status = callback_data.get("status", 0)
#         key = callback_data.get("key")
#         # Ключ теперь имеет формат session_key.document_id
#         if not key or '.' not in key:
#              print("Invalid key format received.")
#              return JSONResponse(content={"error": 1}) 
#         document_id = key.split('.')[-1] # Берем последнюю часть как ID документа
        
#         print(f"Callback Status: {status}, Document ID: {document_id}")

#         # --- Обработка статусов ---
#         if status == 1: # Документ загружается
#             print("Document is being loaded.")
#             return JSONResponse(content={"error": 0})

#         elif status == 2: # Документ готов (пользователь открыл, autosave может быть)
#             print("Document is ready for editing.")
#             return JSONResponse(content={"error": 0})

#         elif status == 3: # Изменения сохранены (autosave завершен)
#             print("Changes saved (autosave).")
#             # Здесь можно обновить статус документа в БД, если нужно
#             return JSONResponse(content={"error": 0})

#         elif status == 4: # Документ закрыт пользователем (без forceSave)
#             print("Document closed by user (no forceSave requested).")
#             return JSONResponse(content={"error": 0})

#         elif status == 6: # ForceSave завершен успешно
#             print("ForceSave completed successfully.")
#             download_url = callback_data.get("url")
#             if not download_url:
#                 print("No download URL provided for forceSave.")
#                 return JSONResponse(content={"error": 1})
            
#             # Скачиваем обновленный файл
#             try:
#                 response = requests.get(download_url, timeout=60)
#                 response.raise_for_status()

#                 document = get_document(db, document_id)
#                 if not document:
#                     print(f"Document with ID {document_id} not found in DB.")
#                     return JSONResponse(content={"error": 1})

#                 # Перезаписываем файл
#                 with open(document.file_path, 'wb') as f:
#                     f.write(response.content)
                
#                 print(f"Document {document_id} updated successfully via forceSave.")
#                 # Опционально: обновляем статус в БД
#                 # update_shared_document_status(db, document_id, ..., DocumentStatus.EDITED)
#                 return JSONResponse(content={"error": 0})

#             except requests.exceptions.RequestException as e:
#                 print(f"Network error downloading file from OnlyOffice: {e}")
#                 return JSONResponse(content={"error": 1})
#             except Exception as e:
#                 print(f"Error saving updated document: {e}")
#                 return JSONResponse(content={"error": 1})

#         elif status == 7: # Ошибка при сохранении (включая forceSave)
#             print("Error occurred during saving (including forceSave).")
#             # Можно залогировать ошибку из callback_data.get('error')
#             error_details = callback_data.get('error', 'Unknown error')
#             print(f"Save error details: {error_details}")
#             return JSONResponse(content={"error": 1})

#         else:
#             print(f"Unknown or unhandled status: {status}")
#             return JSONResponse(content={"error": 0}) 
            
#     except Exception as e:
#         print(f"Error processing OnlyOffice callback: {e}")
#         import traceback
#         traceback.print_exc()
#         return JSONResponse(content={"error": 1})

@router.post("/onlyoffice/callback")
async def onlyoffice_callback(request: dict, db: Session = Depends(get_db)):
    """
    Callback URL для получения обновленного файла от OnlyOffice.
    ВАЖНО: Этот эндпоинт ДОЛЖЕН БЫТЬ доступен с сервера OnlyOffice без аутентификации!
    """
    try:
        callback_data = request
        print(f"Received OnlyOffice callback: {callback_data}")

        status = callback_data.get("status", 0)
        
        if status in [2, 6]: 
            key = callback_data.get("key")
            if not key:
                return JSONResponse(content={"error": 1}) 
            
            download_url = callback_data.get("url")
            if not download_url:
                return JSONResponse(content={"error": 1})
            
            document_id = key 
            document = get_document(db, document_id)
            if not document:
                return JSONResponse(content={"error": 1})

            response = requests.get(download_url, timeout=60)
            response.raise_for_status()

            with open(document.file_path, 'wb') as f:
                f.write(response.content)

            print(f"Document {document_id} updated successfully.")
            return JSONResponse(content={"error": 0})

        elif status in [3, 7]:
            logger.error(f"Ошибка сохранения файла")
            return JSONResponse(content={"error": 1})
        elif status == 4:
            return JSONResponse(content={"error": 0})
        elif status == 1:
            return JSONResponse(content={"error": 0})
        else:
            return JSONResponse(content={"error": 0}) 
            
    except requests.exceptions.RequestException as e:
        print(f"Network error downloading file from OnlyOffice: {e}")
        return JSONResponse(content={"error": 1})
    except Exception as e:
        print(f"Error processing OnlyOffice callback: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(content={"error": 1})
