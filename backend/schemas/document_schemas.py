from pydantic import BaseModel
from datetime import datetime
from models.db_models import DocumentStatus, DocumentPermission
import uuid

class DocumentCreate(BaseModel):
    id: uuid.UUID
    title: str
    owner_username: str
    file_path: str
    file_size: int
    file_type: str

class SharedDocumentCreate(BaseModel):
    document_id: str
    recipient_username: str
    permission: DocumentPermission
    file_type: str
    owner_username: str
    title: str

class DocumentResponse(BaseModel):
    id: uuid.UUID
    title: str
    owner_username: str
    file_path: str
    file_size: int
    file_type: str
    created_at: datetime
    status: DocumentStatus

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