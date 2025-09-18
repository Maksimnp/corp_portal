from sqlalchemy import Column, String, Enum, DateTime, ForeignKey, BigInteger, text
from db.database import Base
from datetime import datetime
import enum

class DocumentStatus(enum.Enum):
    PENDING = "PENDING"
    VIEWED = "VIEWED"
    EDITED = "EDITED"

class DocumentPermission(str, enum.Enum):
    VIEW = "VIEW"
    EDIT = "EDIT"
    REVIEW = "REVIEW"

class Document(Base):
    __tablename__ = "documents"
    
    id = Column(String(36), primary_key=True, index=True)
    title = Column(String(255), index=True, nullable=False)
    owner_username = Column(String(100), index=True, nullable=False)
    file_path = Column(String(512), nullable=False)
    file_size = Column(BigInteger, nullable=False)
    file_type = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    status = Column(Enum(DocumentStatus), default=DocumentStatus.PENDING, nullable=False)
    description = Column(String)
    permission = Column(Enum(DocumentPermission), default=DocumentPermission.EDIT)

class SharedDocument(Base):
    __tablename__ = "document_shares"
    
    id = Column(String(36), primary_key=True, index=True)
    document_id = Column(String(36), ForeignKey("documents.id", ondelete="CASCADE"), index=True, nullable=False)
    recipient_username = Column(String(100), index=True, nullable=False)
    file_type = Column(String(20))
    permission = Column(Enum(DocumentPermission), nullable=False)
    shared_at = Column(DateTime, default=datetime.utcnow)
    status = Column(Enum(DocumentStatus), default=DocumentStatus.PENDING, nullable=False)
    owner_username = Column(String(255))
    title = Column(String(255))

class DocumentStatusModel(Base):
    __tablename__ = "documents_status"
    
    document_id = Column(String(36), ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True, nullable=False)
    owner_username = Column(String(255), primary_key=True, nullable=False)
    recipient_username = Column(String(100), primary_key=True, nullable=False)
    status = Column(Enum(DocumentStatus), default=DocumentStatus.PENDING, nullable=False)