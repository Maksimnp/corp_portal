from pydantic import BaseModel
from datetime import datetime
from models.db_models import DocumentStatus, DocumentPermission
import uuid

class DocumentCreate(BaseModel):
    id: str
    title: str
    owner_username: str
    file_path: str
    file_size: int
    file_type: str

class SharedDocumentCreate(BaseModel):
    id: str
    document_id: str
    recipient_username: str
    permission: DocumentPermission
    file_type: str
    owner_username: str
    title: str

class DocumentStatusCreate(BaseModel):
    document_id: str
    recipient_username: str
    owner_username: str
    status: DocumentStatus

class DocumentResponse(BaseModel):
    id: str
    title: str
    owner_username: str
    file_path: str
    file_size: int
    file_type: str
    created_at: datetime
    status: DocumentStatus
    permission: DocumentPermission

    class Config:
        orm_mode = True  # Enable ORM mode to convert SQLAlchemy objects to Pydantic

class SharedDocumentResponse(BaseModel):
    id: int
    document_id: str
    recipient: str
    permission: DocumentPermission
    shared_at: datetime
    status: DocumentStatus
    owner_username: str

    class Config:
        orm_mode = True  # Enable ORM mode