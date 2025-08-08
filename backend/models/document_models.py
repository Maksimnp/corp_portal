from enum import Enum
import uuid
from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class DocumentStatus(str, Enum):
    PENDING = "PENDING"
    VIEWED = "VIEWED"
    EDITED = "EDITED"

class DocumentPermission(str, Enum):
    VIEW = "VIEW"
    EDIT = "EDIT"

class DocumentBase(BaseModel):
    title: str
    owner_username: str
    file_path: str
    file_size: Optional[int] = None
    file_type: Optional[str] = None
    description: Optional[str] = None 

class DocumentCreate(DocumentBase):
    pass

class Document(DocumentBase):
    id: uuid.UUID
    created_at: datetime
    status: DocumentStatus
    
    class Config:
        from_attributes = True

class SharedDocumentBase(BaseModel):
    document_id: uuid.UUID
    recipient_username: str
    permission: DocumentPermission
    file_type: str
    title: str
    owner_username: str

class SharedDocumentCreate(SharedDocumentBase):
    pass

class SharedDocument(SharedDocumentBase):
    shared_at: datetime
    status: DocumentStatus
    
    class Config:
        from_attributes = True