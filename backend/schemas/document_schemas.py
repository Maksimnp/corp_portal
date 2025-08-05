from pydantic import BaseModel
from datetime import datetime
from models.db_models import DocumentStatus, DocumentPermission

class DocumentCreate(BaseModel):
    title: str
    owner: str
    file_path: str

class SharedDocumentCreate(BaseModel):
    document_id: str
    recipient: str
    permission: DocumentPermission

class DocumentResponse(BaseModel):
    id: str
    title: str
    owner: str
    file_path: str
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

    class Config:
        orm_mode = True  # Enable ORM mode