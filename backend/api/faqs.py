from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime
import logging
import os
import uuid
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, func, Boolean, inspect
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from cachetools import TTLCache
from concurrent.futures import ThreadPoolExecutor
import asyncio
import sqlalchemy
from api.auth import verify_token
# Создаём маршрутизатор только для FAQ
faq_router = APIRouter(tags=["faq"])

logger = logging.getLogger(__name__)

# Конфигурация базы данных
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://portal_admin:season@localhost/faq_database")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Логирование версии SQLAlchemy и схемы таблицы
logger.info(f"SQLAlchemy version: {sqlalchemy.__version__}")
inspector = inspect(engine)
if 'faqs' in inspector.get_table_names():
    columns = [col['name'] for col in inspector.get_columns('faqs')]
    logger.info(f"Текущие столбцы таблицы faqs: {columns}")
else:
    logger.warning("Таблица faqs не существует в базе данных")

# Директория для загрузки изображений
UPLOAD_DIR = "uploads/faq_images"
os.makedirs(UPLOAD_DIR, exist_ok=True)

class FAQ(Base):
    __tablename__ = "faqs"
    
    id = Column(Integer, primary_key=True, index=True)
    question = Column(String, nullable=False)
    content_html = Column(Text)
    category = Column(String, index=True, nullable=True)
    department = Column(String, index=True, nullable=True)  # Опциональный столбец
    is_general = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    views_count = Column(Integer, default=0)
    helpful_count = Column(Integer, default=0)
    not_helpful_count = Column(Integer, default=0)

class FAQBase(BaseModel):
    question: str
    content_html: Optional[str] = None
    category: Optional[str] = None
    department: Optional[str] = None
    is_general: Optional[bool] = False

class FAQCreate(FAQBase):
    pass

class FAQUpdate(FAQBase):
    pass

class FAQResponse(FAQBase):
    id: int
    created_at: datetime
    updated_at: datetime
    views_count: int
    helpful_count: int
    not_helpful_count: int
    
    class Config:
        from_attributes = True

class FAQListResponse(BaseModel):
    faqs: List[FAQResponse]
    categories: List[dict]
    total_count: int

class FAQStatsResponse(BaseModel):
    total_faqs: int
    total_views: int
    total_helpful: int
    total_not_helpful: int
    top_categories: List[dict]
    recent_activity: List[dict]

class SearchRequest(BaseModel):
    query: str
    category: Optional[str] = None
    limit: int = 20
    offset: int = 0

class FeedbackRequest(BaseModel):
    helpful: bool
    comment: Optional[str] = None

executor = ThreadPoolExecutor(max_workers=4)
security = HTTPBearer()
CACHE_TTL = 300
cache = TTLCache(maxsize=1000, ttl=CACHE_TTL)

async def verify_token_dependency(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    user_data = verify_token(token)
    if not user_data:
        logger.warning(f"Недействительный или истёкший токен: {token[:10]}...")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный или истёкший токен")
    return user_data

def get_db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_faqs_sync(db: Session, category: Optional[str] = None, search_query: Optional[str] = None, department: Optional[str] = None):
    try:
        cache_key = f"faqs_{category}_{search_query}_{department}"
        cached_data = cache.get(cache_key)
        if cached_data:
            return cached_data

        query = db.query(FAQ)
        
        if category and category != 'all':
            query = query.filter(FAQ.category == category)
        
        if search_query:
            search_filter = f"%{search_query}%"
            query = query.filter(
                (FAQ.question.ilike(search_filter)) | 
                (FAQ.content_html.ilike(search_filter))
            )
        
        if department and department != 'all':
            if department == 'general':
                query = query.filter(FAQ.is_general == True)
            else:
                query = query.filter(
                    (FAQ.department == department) | (FAQ.is_general == True)
                )
        
        faqs = query.order_by(FAQ.created_at.desc()).all()
        
        categories_result = db.query(
            FAQ.category, 
            func.count(FAQ.id).label('count')
        ).filter(FAQ.category.isnot(None)).group_by(FAQ.category).all()
        
        categories = [{"name": cat[0], "count": cat[1]} for cat in categories_result]
        
        result = {
            "faqs": [FAQResponse.from_orm(faq) for faq in faqs],
            "categories": categories,
            "total_count": len(faqs)
        }
        
        cache[cache_key] = result
        return result

    except Exception as e:
        logger.error(f"Ошибка в get_faqs_sync: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка получения FAQ: {str(e)}")

def get_faq_by_id_sync(db: Session, faq_id: int):
    try:
        faq = db.query(FAQ).filter(FAQ.id == faq_id).first()
        if not faq:
            raise HTTPException(status_code=404, detail="FAQ не найден")
        
        faq.views_count += 1
        db.commit()
        db.refresh(faq)
        
        return FAQResponse.from_orm(faq)

    except Exception as e:
        logger.error(f"Ошибка в get_faq_by_id_sync: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка получения FAQ: {str(e)}")

def create_faq_sync(db: Session, faq_data: FAQCreate):
    try:
        db_faq = FAQ(**faq_data.dict())
        db.add(db_faq)
        db.commit()
        db.refresh(db_faq)
        
        clear_faq_cache()
        
        return FAQResponse.from_orm(db_faq)
    except Exception as e:
        db.rollback()
        logger.error(f"Ошибка в create_faq_sync: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))

def update_faq_sync(db: Session, faq_id: int, faq_data: FAQUpdate):
    try:
        db_faq = db.query(FAQ).filter(FAQ.id == faq_id).first()
        if not db_faq:
            raise HTTPException(status_code=404, detail="FAQ не найден")
        
        for key, value in faq_data.dict(exclude_unset=True).items():
            if value is not None:
                setattr(db_faq, key, value)
        
        db.commit()
        db.refresh(db_faq)
        
        clear_faq_cache()
        
        return FAQResponse.from_orm(db_faq)
    except Exception as e:
        db.rollback()
        logger.error(f"Ошибка в update_faq_sync: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))

def delete_faq_sync(db: Session, faq_id: int):
    try:
        db_faq = db.query(FAQ).filter(FAQ.id == faq_id).first()
        if not db_faq:
            raise HTTPException(status_code=404, detail="FAQ не найден")
        
        db.delete(db_faq)
        db.commit()
        
        clear_faq_cache()
        
        return {"message": "FAQ успешно удалён"}
    except Exception as e:
        db.rollback()
        logger.error(f"Ошибка в delete_faq_sync: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))

def search_faqs_sync(db: Session, search_data: SearchRequest):
    try:
        cache_key = f"search_{search_data.query}_{search_data.category}_{search_data.limit}_{search_data.offset}"
        cached_data = cache.get(cache_key)
        if cached_data:
            return cached_data

        query = db.query(FAQ)
        
        if search_data.query:
            search_filter = f"%{search_data.query}%"
            query = query.filter(
                (FAQ.question.ilike(search_filter)) | 
                (FAQ.content_html.ilike(search_filter))
            )
        
        if search_data.category and search_data.category != 'all':
            query = query.filter(FAQ.category == search_data.category)
        
        total_count = query.count()
        faqs = query.order_by(FAQ.created_at.desc()).offset(search_data.offset).limit(search_data.limit).all()
        
        result = {
            "faqs": [FAQResponse.from_orm(faq) for faq in faqs],
            "total_count": total_count,
            "has_more": (search_data.offset + len(faqs)) < total_count
        }
        
        cache[cache_key] = result
        return result

    except Exception as e:
        logger.error(f"Ошибка в search_faqs_sync: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка поиска FAQ: {str(e)}")

def submit_feedback_sync(db: Session, faq_id: int, feedback_data: FeedbackRequest):
    try:
        db_faq = db.query(FAQ).filter(FAQ.id == faq_id).first()
        if not db_faq:
            raise HTTPException(status_code=404, detail="FAQ не найден")
        
        if feedback_data.helpful:
            db_faq.helpful_count += 1
        else:
            db_faq.not_helpful_count += 1
        
        db.commit()
        db.refresh(db_faq)
        
        clear_faq_cache()
        
        return {
            "message": "Отзыв успешно отправлен",
            "helpful_count": db_faq.helpful_count,
            "not_helpful_count": db_faq.not_helpful_count
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Ошибка в submit_feedback_sync: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))

def get_faq_stats_sync(db: Session):
    try:
        cache_key = "faq_stats"
        cached_data = cache.get(cache_key)
        if cached_data:
            return cached_data

        total_faqs = db.query(func.count(FAQ.id)).scalar()
        total_views = db.query(func.sum(FAQ.views_count)).scalar() or 0
        total_helpful = db.query(func.sum(FAQ.helpful_count)).scalar() or 0
        total_not_helpful = db.query(func.sum(FAQ.not_helpful_count)).scalar() or 0
        
        top_categories = db.query(
            FAQ.category,
            func.count(FAQ.id).label('count'),
            func.sum(FAQ.views_count).label('views')
        ).filter(FAQ.category.isnot(None)).group_by(FAQ.category).order_by(func.count(FAQ.id).desc()).limit(10).all()
        
        recent_activity = db.query(FAQ).order_by(FAQ.updated_at.desc()).limit(10).all()
        
        stats = FAQStatsResponse(
            total_faqs=total_faqs,
            total_views=total_views,
            total_helpful=total_helpful,
            total_not_helpful=total_not_helpful,
            top_categories=[{"name": cat[0], "count": cat[1], "views": cat[2]} for cat in top_categories],
            recent_activity=[{"id": faq.id, "question": faq.question, "updated_at": faq.updated_at} for faq in recent_activity]
        )
        
        cache[cache_key] = stats
        return stats

    except Exception as e:
        logger.error(f"Ошибка в get_faq_stats_sync: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка получения статистики FAQ: {str(e)}")

def clear_faq_cache():
    keys_to_remove = [key for key in list(cache.keys()) if key.startswith(('faqs_', 'faq_', 'search_', 'faq_stats'))]
    for key in keys_to_remove:
        del cache[key]

@faq_router.post("/upload-image")
async def upload_faq_image(
    file: UploadFile = File(...),
    _: dict = Depends(verify_token_dependency)
):
    try:
        if not file.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="Разрешены только изображения")
        
        max_size = 5 * 1024 * 1024  # 5MB
        content = await file.read()
        if len(content) > max_size:
            raise HTTPException(status_code=400, detail="Размер файла превышает 5MB")
        
        file_extension = file.filename.split(".")[-1] if "." in file.filename else "jpg"
        if file_extension.lower() not in ["jpg", "jpeg", "png", "gif"]:
            raise HTTPException(status_code=400, detail="Разрешены только JPG, PNG или GIF")
        
        filename = f"{uuid.uuid4()}.{file_extension}"
        filepath = os.path.join(UPLOAD_DIR, filename)
        
        with open(filepath, "wb") as buffer:
            buffer.write(content)
        
        image_url = f"/static/uploads/faq_images/{filename}"
        return {"url": image_url}
    except Exception as e:
        logger.error(f"Ошибка загрузки изображения: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Ошибка загрузки изображения")

@faq_router.get("", response_model=FAQListResponse)
async def get_faqs(
    category: Optional[str] = None,
    search: Optional[str] = None,
    department: Optional[str] = None,
    _: dict = Depends(verify_token_dependency),
    db: Session = Depends(get_db_session)
):
    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(executor, get_faqs_sync, db, category, search, department)
    except Exception as e:
        logger.error(f"Ошибка получения FAQ: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка сервера: {str(e)}")

@faq_router.get("/{faq_id}", response_model=FAQResponse)
async def get_faq(
    faq_id: int,
    _: dict = Depends(verify_token_dependency),
    db: Session = Depends(get_db_session)
):
    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(executor, get_faq_by_id_sync, db, faq_id)
    except Exception as e:
        logger.error(f"Ошибка получения FAQ: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка сервера: {str(e)}")

@faq_router.post("", response_model=FAQResponse)
async def create_faq(
    faq: FAQCreate,
    _: dict = Depends(verify_token_dependency),
    db: Session = Depends(get_db_session)
):
    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(executor, create_faq_sync, db, faq)
    except Exception as e:
        logger.error(f"Ошибка создания FAQ: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка сервера: {str(e)}")

@faq_router.put("/{faq_id}", response_model=FAQResponse)
async def update_faq(
    faq_id: int,
    faq: FAQUpdate,
    _: dict = Depends(verify_token_dependency),
    db: Session = Depends(get_db_session)
):
    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(executor, update_faq_sync, db, faq_id, faq)
    except Exception as e:
        logger.error(f"Ошибка обновления FAQ: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка сервера: {str(e)}")

@faq_router.delete("/{faq_id}")
async def delete_faq(
    faq_id: int,
    _: dict = Depends(verify_token_dependency),
    db: Session = Depends(get_db_session)
):
    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(executor, delete_faq_sync, db, faq_id)
    except Exception as e:
        logger.error(f"Ошибка удаления FAQ: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка сервера: {str(e)}")

@faq_router.post("/search")
async def search_faqs(
    search_data: SearchRequest,
    _: dict = Depends(verify_token_dependency),
    db: Session = Depends(get_db_session)
):
    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(executor, search_faqs_sync, db, search_data)
    except Exception as e:
        logger.error(f"Ошибка поиска FAQ: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка сервера: {str(e)}")

@faq_router.post("/{faq_id}/feedback")
async def submit_feedback(
    faq_id: int,
    feedback: FeedbackRequest,
    _: dict = Depends(verify_token_dependency),
    db: Session = Depends(get_db_session)
):
    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(executor, submit_feedback_sync, db, faq_id, feedback)
    except Exception as e:
        logger.error(f"Ошибка отправки отзыва: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка сервера: {str(e)}")

@faq_router.get("/stats-overview", response_model=FAQStatsResponse)
async def get_faq_stats(
    _: dict = Depends(verify_token_dependency),
    db: Session = Depends(get_db_session)
):
    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(executor, get_faq_stats_sync, db)
    except Exception as e:
        logger.error(f"Ошибка получения статистики FAQ: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка сервера: {str(e)}")

@faq_router.get("/health/check")
async def health_check(db: Session = Depends(get_db_session)):
    try:
        db.execute("SELECT 1")
        faq_count = db.query(func.count(FAQ.id)).scalar()
        return {
            "status": "healthy",
            "database": "connected",
            "faq_count": faq_count,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Ошибка проверки состояния: {e}", exc_info=True)
        return {
            "status": "unhealthy",
            "database": "disconnected",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

@faq_router.post("/cache/clear")
async def clear_cache(_: dict = Depends(verify_token_dependency)):
    try:
        count = len(cache)
        clear_faq_cache()
        return {"message": "Кэш успешно очищен", "cleared_items": count}
    except Exception as e:
        logger.error(f"Ошибка очистки кэша: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка сервера: {str(e)}")

# Создание таблиц в базе данных
try:
    Base.metadata.create_all(bind=engine)
except Exception as e:
    logger.error(f"Ошибка создания таблиц: {e}", exc_info=True)
    raise