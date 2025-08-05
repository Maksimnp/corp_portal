from sqlalchemy import Column, String, Integer, Enum, DateTime, ForeignKey
from db.database import Base
from datetime import datetime
import enum

class DocumentStatus(enum.Enum):
    PENDING = "pending"
    VIEWED = "viewed"
    EDITED = "edited"

class DocumentPermission(enum.Enum):
    VIEW = "view"
    EDIT = "edit"

class Document(Base):
    __tablename__ = "documents"
    id = Column(String, primary_key=True, index=True)
    title = Column(String, index=True)
    owner = Column(String, index=True)
    file_path = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    status = Column(Enum(DocumentStatus), default=DocumentStatus.PENDING)

class SharedDocument(Base):
    __tablename__ = "shared_documents"
    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(String, ForeignKey("documents.id"), index=True)
    recipient = Column(String, index=True)
    permission = Column(Enum(DocumentPermission))
    shared_at = Column(DateTime, default=datetime.utcnow)
    status = Column(Enum(DocumentStatus), default=DocumentStatus.PENDING)