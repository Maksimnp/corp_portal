from sqlalchemy.orm import Session
from models.db_models import Document, SharedDocument, DocumentStatus, DocumentPermission
from schemas.document_schemas import DocumentCreate, SharedDocumentCreate

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

def get_shared_documents(db: Session, username: str, search: str = None):
    query = db.query(SharedDocument).filter(SharedDocument.recipient_username == username)
    if search:
        query = query.join(Document).filter(Document.title.ilike(f"%{search}%"))
    return query.all()

def update_shared_document_status(db: Session, document_id: str, username: str, status: DocumentStatus):
    shared_doc = db.query(SharedDocument).filter(
        SharedDocument.document_id == document_id,
        SharedDocument.recipient_username == username
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