from sqlalchemy import Column, String, Integer, Enum, DateTime, ForeignKey, BigInteger, text
from sqlalchemy.dialects.postgresql import UUID
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
    id = Column(UUID(as_uuid=True), primary_key=True, index=True)
    title = Column(String, index=True)
    owner_username = Column(String, index=True)
    file_path = Column(String)
    file_size = Column(BigInteger)
    file_type = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    status = Column(Enum(DocumentStatus), default=DocumentStatus.PENDING)
    permission = Column(Enum(DocumentPermission), default=DocumentPermission.EDIT)

class SharedDocument(Base):
    __tablename__ = "document_shares"
    id = Column(UUID(as_uuid=True), primary_key=True, index=True, server_default=text("gen_random_uuid()"))
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id"), index=True)
    recipient_username = Column(String, index=True)
    file_type = Column(String)
    permission = Column(Enum(DocumentPermission))
    shared_at = Column(DateTime, default=datetime.utcnow)
    status = Column(Enum(DocumentStatus), default=DocumentStatus.PENDING)
    owner_username = Column(String)
    title = Column(String)