from enum import Enum
from pydantic import BaseModel
from datetime import datetime

class DocumentStatus(str, Enum):
    PENDING = "PENDING"
    VIEWED = "VIEWED"
    EDITED = "EDITED"

class DocumentPermission(str, Enum):
    VIEW = "VIEW"
    EDIT = "EDIT"

class DocumentBase(BaseModel):
    title: str
    owner: str
    file_path: str

class DocumentCreate(DocumentBase):
    pass

class Document(DocumentBase):
    id: str
    created_at: datetime
    status: DocumentStatus
    
    class Config:
        from_attributes = True

class SharedDocumentBase(BaseModel):
    document_id: str
    recipient: str
    permission: DocumentPermission

class SharedDocumentCreate(SharedDocumentBase):
    pass

class SharedDocument(SharedDocumentBase):
    shared_at: datetime
    status: DocumentStatus
    
    class Config:
        from_attributes = True