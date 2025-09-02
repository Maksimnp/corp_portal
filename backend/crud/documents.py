from sqlalchemy.orm import Session
from models.db_models import Document, SharedDocument, DocumentStatus, DocumentStatusModel
from schemas.document_schemas import DocumentCreate, SharedDocumentCreate, DocumentStatusCreate
import logging
logger = logging.getLogger(__name__)
def create_document(db: Session, document: DocumentCreate):
    db_document = Document(**document.dict())
    db.add(db_document)
    db.commit()
    db.refresh(db_document)
    return db_document

def get_user_documents(db: Session, username: str, search: str = None):
    query = db.query(Document).filter(Document.owner_username == username)
    if search:
        query = query.filter(Document.title.ilike(f"%{search}%"))
    return query.all()

def share_document(db: Session, shared_doc: SharedDocumentCreate):
    db_shared = SharedDocument(**shared_doc.dict())
    db.add(db_shared)
    db.commit()
    db.refresh(db_shared)
    return db_shared

def create_status_document(db: Session, status_doc: DocumentStatusCreate):
    db_status = DocumentStatusModel(**status_doc.dict())
    db.add(db_status)
    db.commit()
    db.refresh(db_status)
    return db_status

def get_shared_documents(db: Session, username: str, search: str = None):
    query = db.query(SharedDocument).filter(SharedDocument.recipient_username == username)
    if search:
        query = query.join(Document).filter(Document.title.ilike(f"%{search}%"))
        logger.info(query)
    return query.all()

def get_sended_documents(db: Session, username: str, search: str = None):
    query = db.query(SharedDocument).filter(SharedDocument.owner_username == username)
    if search:
        query = query.filter(SharedDocument.title.ilike(f"%{search}%"))
    return query.all()

def get_status_documents(db: Session, username: str, search: str):
    query = db.query(DocumentStatusModel).filter(DocumentStatusModel.recipient_username == username)
    if search:
        query = query.filter(DocumentStatusModel.document_id.ilike(f"%{search}%"))
    
    results = query.all()
    # Преобразуем в словарь {document_id: status}
    return {str(doc.document_id): doc.status for doc in results}

def update_shared_document_status(db: Session, document_id: str, username: str, status: DocumentStatus):
    shared_doc = db.query(DocumentStatusModel).filter(
        DocumentStatusModel.document_id == document_id,
        DocumentStatusModel.recipient_username == username
    ).first()
    if shared_doc:
        shared_doc.status = status
        db.commit()
        db.refresh(shared_doc)
    return shared_doc

def delete_document(db: Session, document_id: str):
    db_document = db.query(Document).filter(Document.id == document_id).first()
    if db_document:
        db.delete(db_document)
        db.commit()
        return True
    return False

def get_document(db: Session, document_id: str):
    return db.query(Document).filter(Document.id == document_id).first()

def get_shared_document(db: Session, document_id: str):
    return db.query(SharedDocument).filter(SharedDocument.document_id == document_id).first()