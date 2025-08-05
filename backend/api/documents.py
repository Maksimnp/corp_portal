import os
import uuid
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
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
    
    # Сохраняем файл
    file_id = str(uuid.uuid4())
    file_ext = os.path.splitext(file.filename)[1]
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}{file_ext}")
    
    with open(file_path, "wb") as buffer:
        buffer.write(await file.read())
    
    # Создаем запись о документе
    document = Document(
        id=file_id,
        title=title,
        owner=user['username'],
        file_path=file_path,
        created_at=datetime.now()
    )
    
    documents_db[file_id] = document
    return document

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
    
    return [doc for doc in documents_db.values() if doc.owner == user['username']]

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