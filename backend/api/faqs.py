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
from services.ad_auth import get_all_departments

faq_router = APIRouter(tags=["faq"])

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://portal_admin:season@localhost/faq_database")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

logger.info(f"SQLAlchemy version: {sqlalchemy.__version__}")
inspector = inspect(engine)
if 'faqs' in inspector.get_table_names():
    columns = [col['name'] for col in inspector.get_columns('faqs')]
    logger.info(f"Текущие столбцы таблицы faqs: {columns}")
else:
    logger.warning("Таблица faqs не существует в базе данных")

UPLOAD_DIR = "uploads/faq_images"
os.makedirs(UPLOAD_DIR, exist_ok=True)

class FAQ(Base):
    __tablename__ = "faqs"
    
    id = Column(Integer, primary_key=True, index=True)
    question = Column(String, nullable=False)
    content_html = Column(Text)
    category = Column(String, index=True, nullable=True)
    department = Column(String, index=True, nullable=True)
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

def get_faqs_sync(db: Session, category: Optional[str] = None, search_query: Optional[str] = None, department: Optional[str] = None, user_data: dict = None):
    try:
        cache_key = f"faqs_{category}_{search_query}_{department}_{user_data.get('username')}"
        cached_data = cache.get(cache_key)
        if cached_data:
            logger.debug(f"Возвращены кэшированные данные для ключа: {cache_key}")
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
        
        # Фильтрация для не-администраторов
        if not user_data.get('isAdmin', False):
            user_department = user_data.get('department') or None
            query = query.filter(
                (FAQ.is_general == True) | 
                ((FAQ.department == user_department) & (FAQ.department.isnot(None)))
            )
        elif department and department != 'all' and department != 'general':
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
        logger.debug(f"Кэшированы данные для ключа: {cache_key}")
        return result
    except Exception as e:
        logger.error(f"Ошибка в get_faqs_sync: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка получения FAQ: {str(e)}")

def get_faq_stats_sync(db: Session, user_data: dict):
    try:
        if not user_data.get('isAdmin', False):
            logger.warning(f"Попытка доступа к статистике FAQ неадминистратором: {user_data.get('username')}")
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ к статистике FAQ разрешён только администраторам")
        
        cache_key = "faq_stats"
        cached_data = cache.get(cache_key)
        if cached_data:
            logger.debug("Возвращены кэшированные данные статистики FAQ")
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
        logger.debug("Кэшированы данные статистики FAQ")
        return stats
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка в get_faq_stats_sync: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка получения статистики FAQ: {str(e)}")

def get_all_departments_endpoint_sync(user_data: dict):
    try:
        if not user_data.get('isAdmin', False):
            logger.warning(f"Попытка доступа к списку отделов неадминистратором: {user_data.get('username')}")
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ к списку отделов разрешён только администраторам")
        
        departments = get_all_departments()
        if not departments:
            logger.warning("Список отделов пуст или не удалось получить данные из LDAP")
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Не удалось получить список отделов: LDAP сервис недоступен")
        
        return {"departments": departments}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка получения списка отделов: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Не удалось получить список отделов: {str(e)}")

@faq_router.get("/all-departments")
async def get_all_departments_endpoint(user_data: dict = Depends(verify_token_dependency)):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, get_all_departments_endpoint_sync, user_data)

@faq_router.get("/stats-overview", response_model=FAQStatsResponse)
async def get_faq_stats(
    user_data: dict = Depends(verify_token_dependency),
    db: Session = Depends(get_db_session)
):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, get_faq_stats_sync, db, user_data)

@faq_router.get("/", response_model=FAQListResponse)
async def get_faqs(
    category: Optional[str] = None,
    search: Optional[str] = None,
    department: Optional[str] = None,
    user_data: dict = Depends(verify_token_dependency),
    db: Session = Depends(get_db_session)
):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, get_faqs_sync, db, category, search, department, user_data)

@faq_router.get("/{faq_id}", response_model=FAQResponse)
async def get_faq(
    faq_id: int,
    user_data: dict = Depends(verify_token_dependency),
    db: Session = Depends(get_db_session)
):
    try:
        faq = db.query(FAQ).filter(FAQ.id == faq_id).first()
        if not faq:
            logger.warning(f"FAQ с id {faq_id} не найден")
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="FAQ не найден")
        
        if faq.department and not faq.is_general:
            if not user_data.get('isAdmin', False) and faq.department != user_data.get('department'):
                logger.warning(f"Пользователь {user_data.get('username')} пытался получить доступ к FAQ с id {faq_id} из чужого отдела")
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ к этому FAQ ограничен вашим отделом")
        
        faq.views_count += 1
        db.commit()
        db.refresh(faq)
        logger.info(f"FAQ с id {faq_id} просмотрен пользователем {user_data.get('username')}")
        return FAQResponse.from_orm(faq)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка получения FAQ с id {faq_id}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка получения FAQ: {str(e)}")

@faq_router.post("/", response_model=FAQResponse)
async def create_faq(
    faq: FAQCreate,
    user_data: dict = Depends(verify_token_dependency),
    db: Session = Depends(get_db_session)
):
    try:
        if not user_data.get('isAdmin', False):
            logger.warning(f"Попытка создания FAQ неадминистратором: {user_data.get('username')}")
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Создание FAQ разрешено только администраторам")
        
        if not faq.question.strip():
            logger.warning("Попытка создания FAQ с пустым вопросом")
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Вопрос не может быть пустым")
        
        if not faq.is_general and not faq.department:
            logger.warning("Попытка создания FAQ с is_general=false без указания отдела")
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Для не-общего FAQ необходимо указать отдел")
        
        db_faq = FAQ(
            question=faq.question.strip(),
            content_html=faq.content_html.strip() if faq.content_html else None,
            category=faq.category.strip() if faq.category else None,
            department=faq.department.strip() if faq.department and not faq.is_general else None,
            is_general=faq.is_general
        )
        db.add(db_faq)
        db.commit()
        db.refresh(db_faq)
        cache.clear()
        logger.info(f"FAQ создан пользователем {user_data.get('username')}: {faq.question}")
        return FAQResponse.from_orm(db_faq)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка создания FAQ: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка создания FAQ: {str(e)}")

@faq_router.put("/{faq_id}", response_model=FAQResponse)
async def update_faq(
    faq_id: int,
    faq: FAQUpdate,
    user_data: dict = Depends(verify_token_dependency),
    db: Session = Depends(get_db_session)
):
    try:
        if not user_data.get('isAdmin', False):
            logger.warning(f"Попытка обновления FAQ с id {faq_id} неадминистратором: {user_data.get('username')}")
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Обновление FAQ разрешено только администраторам")
        
        db_faq = db.query(FAQ).filter(FAQ.id == faq_id).first()
        if not db_faq:
            logger.warning(f"FAQ с id {faq_id} не найден")
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="FAQ не найден")
        
        if not faq.question.strip():
            logger.warning("Попытка обновления FAQ с пустым вопросом")
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Вопрос не может быть пустым")
        
        if not faq.is_general and not faq.department:
            logger.warning("Попытка обновления FAQ с is_general=false без указания отдела")
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Для не-общего FAQ необходимо указать отдел")
        
        db_faq.question = faq.question.strip()
        db_faq.content_html = faq.content_html.strip() if faq.content_html else None
        db_faq.category = faq.category.strip() if faq.category else None
        db_faq.department = faq.department.strip() if faq.department and not faq.is_general else None
        db_faq.is_general = faq.is_general
        db_faq.updated_at = func.now()
        
        db.commit()
        db.refresh(db_faq)
        cache.clear()
        logger.info(f"FAQ с id {faq_id} обновлён пользователем {user_data.get('username')}")
        return FAQResponse.from_orm(db_faq)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка обновления FAQ с id {faq_id}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка обновления FAQ: {str(e)}")

@faq_router.delete("/{faq_id}")
async def delete_faq(
    faq_id: int,
    user_data: dict = Depends(verify_token_dependency),
    db: Session = Depends(get_db_session)
):
    try:
        if not user_data.get('isAdmin', False):
            logger.warning(f"Попытка удаления FAQ с id {faq_id} неадминистратором: {user_data.get('username')}")
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Удаление FAQ разрешено только администраторам")
        
        db_faq = db.query(FAQ).filter(FAQ.id == faq_id).first()
        if not db_faq:
            logger.warning(f"FAQ с id {faq_id} не найден")
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="FAQ не найден")
        
        db.delete(db_faq)
        db.commit()
        cache.clear()
        logger.info(f"FAQ с id {faq_id} удалён пользователем {user_data.get('username')}")
        return {"detail": "FAQ успешно удалён"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка удаления FAQ с id {faq_id}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка удаления FAQ: {str(e)}")

@faq_router.post("/{faq_id}/feedback")
async def submit_feedback(
    faq_id: int,
    feedback: FeedbackRequest,
    user_data: dict = Depends(verify_token_dependency),
    db: Session = Depends(get_db_session)
):
    try:
        db_faq = db.query(FAQ).filter(FAQ.id == faq_id).first()
        if not db_faq:
            logger.warning(f"FAQ с id {faq_id} не найден")
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="FAQ не найден")
        
        if db_faq.department and not db_faq.is_general:
            if not user_data.get('isAdmin', False) and db_faq.department != user_data.get('department'):
                logger.warning(f"Пользователь {user_data.get('username')} пытался отправить отзыв на FAQ с id {faq_id} из чужого отдела")
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ к этому FAQ ограничен вашим отделом")
        
        if feedback.helpful:
            db_faq.helpful_count += 1
        else:
            db_faq.not_helpful_count += 1
        
        db_faq.updated_at = func.now()
        db.commit()
        db.refresh(db_faq)
        cache.clear()
        logger.info(f"Отзыв отправлен для FAQ с id {faq_id} пользователем {user_data.get('username')}: helpful={feedback.helpful}")
        return {"detail": "Отзыв успешно отправлен"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка отправки отзыва для FAQ с id {faq_id}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка отправки отзыва: {str(e)}")

@faq_router.post("/{faq_id}/upload-image")
async def upload_image(
    faq_id: int,
    file: UploadFile = File(...),
    user_data: dict = Depends(verify_token_dependency),
    db: Session = Depends(get_db_session)
):
    try:
        if not user_data.get('isAdmin', False):
            logger.warning(f"Попытка загрузки изображения для FAQ с id {faq_id} неадминистратором: {user_data.get('username')}")
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Загрузка изображений разрешена только администраторам")
        
        db_faq = db.query(FAQ).filter(FAQ.id == faq_id).first()
        if not db_faq:
            logger.warning(f"FAQ с id {faq_id} не найден")
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="FAQ не найден")
        
        file_extension = file.filename.split('.')[-1].lower()
        if file_extension not in ['jpg', 'jpeg', 'png', 'gif']:
            logger.warning(f"Недопустимый формат файла: {file.filename}")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Допустимы только файлы .jpg, .jpeg, .png, .gif")
        
        file_name = f"{uuid.uuid4()}.{file_extension}"
        file_path = os.path.join(UPLOAD_DIR, file_name)
        
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        relative_path = f"/{UPLOAD_DIR}/{file_name}"
        logger.info(f"Изображение загружено для FAQ с id {faq_id} пользователем {user_data.get('username')}: {relative_path}")
        return {"url": relative_path}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка загрузки изображения для FAQ с id {faq_id}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка загрузки изображения: {str(e)}")