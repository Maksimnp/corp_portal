import json
import re
import requests
from pathlib import Path as PathPath
from fastapi import APIRouter, Depends, HTTPException, Path, Query, status, File, UploadFile
from fastapi.responses import FileResponse
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
from api.auth import get_current_user, verify_token
from services.ad_auth import get_all_departments
from fastapi.responses import FileResponse, JSONResponse
from jose import jwt
from fastapi.security import OAuth2PasswordBearer

faq_router = APIRouter(tags=["faq"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

logger = logging.getLogger(__name__)
ONLYOFFICE_SERVER_URL = os.getenv("ONLYOFFICE_SERVER_URL")
PORTAL_API_BASE_URL = os.getenv("VITE_API_BASE_URL")
ONLYOFFICE_JWT_SECRET = os.getenv("ONLYOFFICE_SECRET", "your_strong_secret_key_here")
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://portal_admin:season@localhost/faq_database")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

SOFTWARE_DIR = PathPath("/mnt/faq_share/")
SUPPORTED_EXTENSIONS = ['.pdf', '.txt', '.docx', '.doc']
logger.info(f"SQLAlchemy version: {sqlalchemy.__version__}")
inspector = inspect(engine)
if 'faqs' in inspector.get_table_names():
    columns = [col['name'] for col in inspector.get_columns('faqs')]
    logger.info(f"Текущие столбцы таблицы faqs: {columns}")
else:
    logger.warning("Таблица faqs не существует в базе данных")

UPLOAD_DIR = "uploads/faq_images"
os.makedirs(UPLOAD_DIR, exist_ok=True)

class FAQItem(BaseModel):
    title: str
    filePath: str
    category: Optional[str] = None
    created_at: str
    downloads_count: int
    file_size: int

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

@faq_router.get("/files", response_model=dict)
async def get_software(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    try:
        software_list = []

        for root, dirs, files in os.walk(SOFTWARE_DIR):
            for file in files:
                if not file.endswith('.json'):
                    continue

                json_path = os.path.join(root, file)
                try:
                    with open(json_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        software_list.append(FAQItem(**data))
                except Exception as e:
                    logger.warning(f"Skipping invalid JSON file: {json_path} - {e}")
                    continue
        
        return {"software": software_list}

    except Exception as e:
        logger.exception("Error in get_software")
        raise HTTPException(status_code=500, detail=f"Failed to load software list: {str(e)}")

def clean_software_name(raw_name: str) -> str:
    name = re.sub(r'[-_.]', ' ', raw_name)
    
    patterns = [
        r'\b(v|version|ver)\s*\d+(\.\d+)*',
        r'\b\d+(\.\d+)*\s*(x64|x86|win32|win64)?',
        r'\b(repack|final|portable|setup|installer|by\s+\w+|crack|patched|official)\b',
        r'\(.*?\)',
        r'\[.*?\]',
        r'\b\d{4}\b',
    ]
    
    for pattern in patterns:
        name = re.sub(pattern, '', name, flags=re.IGNORECASE)

    name = re.sub(r'\s+', ' ', name).strip()
    if not name:
        name = raw_name
    
    return name

@faq_router.post("/sync")
async def sync_software(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    if not current_user.get("isAdmin", False):
        raise HTTPException(status_code=403, detail="Access denied: Admins only")

    try:
        created = 0
        skipped = 0

        for root, dirs, files in os.walk(SOFTWARE_DIR):
            for filename in files:
                name, ext = os.path.splitext(filename)
                ext_lower = ext.lower()

                if ext_lower not in SUPPORTED_EXTENSIONS:
                    continue

                file_path_full = os.path.join(root, filename)
                json_path = os.path.join(root, f"{name}.json")

                if os.path.exists(json_path):
                    skipped += 1
                    continue

                try:
                    file_size = os.path.getsize(file_path_full)
                except OSError:
                    file_size = 0

                rel_file_path = os.path.relpath(file_path_full, SOFTWARE_DIR).replace("\\", "/")

                manifest = {
                    "title": name,
                    "filePath": rel_file_path,
                    "created_at": datetime.fromtimestamp(
                        os.path.getmtime(file_path_full)
                    ).isoformat(),
                    "downloads_count": 0,
                    "file_size": file_size
                }

                with open(json_path, "w", encoding="utf-8") as f:
                    json.dump(manifest, f, ensure_ascii=False, indent=2)

                created += 1

        return {
            "status": "success",
            "created": created,
            "skipped": skipped,
            "message": f"Создано {created} JSON-манифестов, пропущено {skipped}"
        }

    except Exception as e:
        logger.exception("Sync failed")
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")
    
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
    
def get_document(document_id: str) -> Optional[Dict[str, Any]]:
    file_path = SOFTWARE_DIR / f"{document_id}.json"
    logger.info(f"get_document - file_path - {file_path}")
    if not file_path.exists():
        return None
    
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        required_fields = {"title", "filePath", "created_at", "file_size"}
        if not required_fields.issubset(data.keys()):
            return None
        
        if isinstance(data.get("file_size"), str):
            try:
                data["file_size"] = int(data["file_size"])
            except ValueError:
                data["file_size"] = 0
        
        data.setdefault("downloads_count", 0)
        logger.info(f"Успешно файл")
        return data

    except (json.JSONDecodeError, OSError, UnicodeDecodeError) as e:
        print(f"Error reading document metadata {document_id}: {e}")
        return None
    
@faq_router.get("/onlyoffice/config/{document_id}")
async def get_onlyoffice_config(
    document_id: str = Path(...),
    token: str = Depends(oauth2_scheme),
):
    """
    Генерирует конфигурацию для встраивания OnlyOffice редактора.
    """
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    document = get_document(document_id)
    
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
        
    file_path = document["filePath"]
    document_url = f"{PORTAL_API_BASE_URL}/faq/download/onlyoffice/{document_id}"
    callback_url = f"{PORTAL_API_BASE_URL}/faq/onlyoffice/callback"
    session_key = str(uuid.uuid4())

    document_type = get_document_type(document["filePath"])
    
    logger.info(f"file_path - {file_path}, document_url - {document_url}")

    file_ext = PathPath(file_path).suffix.lower().lstrip('.')

    config = {
        "document": {
            "fileType": file_ext,
            "key": document_id,
            "title": document["title"],
            "url": document_url,
        },
        "documentType": document_type,
        "editorConfig": {
            "callbackUrl": callback_url,
            "user": {
                "id": user['username'],
                "name": user.get('displayName', user['username']),
                "documentId": document_id
            },
            "lang": "ru"
        },
        "userdata": document_id
    }
    config["editorConfig"]["customization"] = {
        "forcesave": True,  # Включает принудительное сохранение по команде
        "autosave": True    # Убедитесь, что autosave включен (по умолчанию true)
    }
    
    token = jwt.encode(config, ONLYOFFICE_JWT_SECRET, algorithm="HS256")
    config["token"] = token
    return JSONResponse(content={"config": config, "token": token})

def get_document_type(file_ext: str) -> str:
    """Определяет тип документа для OnlyOffice по расширению файла."""
    word_exts = {'.doc', '.docx', '.dotx', '.docm', '.dotm', '.odt', '.ott', '.rtf', '.txt', '.html', '.htm', '.mht', '.pdf', '.djvu', '.fb2', '.epub', '.xps'}
    cell_exts = {'.xls', '.xlsx', '.xlsm', '.xlsb', '.xlt', '.xltx', '.xltm', '.ods', '.ots', '.csv'}
    slide_exts = {'.ppt', '.pptx', '.pptm', '.pot', '.potx', '.potm', '.pps', '.ppsx', '.ppsm', '.odp', '.otp'}

    ext = file_ext.lower()
    if ext in word_exts:
        return "word"
    elif ext in cell_exts:
        return "cell"
    elif ext in slide_exts:
        return "slide"
    else:
        return "word"

@faq_router.post("/onlyoffice/callback")
async def onlyoffice_callback(request: dict):
    """
    Callback URL для получения обновленного файла от OnlyOffice.
    ВАЖНО: Этот эндпоинт ДОЛЖЕН БЫТЬ доступен с сервера OnlyOffice без аутентификации!
    """
    try:
        callback_data = request
        print(f"Received OnlyOffice callback: {callback_data}")
        logger.info(f"callback_data - {callback_data}")
        status = callback_data.get("status", 0)
        
        if status in [2, 6]: 
            key = callback_data.get("key")
            if not key:
                return JSONResponse(content={"error": 1}) 
            
            download_url = callback_data.get("url")
            if not download_url:
                return JSONResponse(content={"error": 1})
            logger.info(f"download_url - {download_url}")
            document_id = key 
            document = get_document(document_id)
            if not document:
                return JSONResponse(content={"error": 1})

            response = requests.get(download_url, timeout=60)
            response.raise_for_status()
            full_file_path = SOFTWARE_DIR / document["filePath"]
            with open(full_file_path, 'wb') as f:
                f.write(response.content)

            print(f"Document {document_id} updated successfully.")
            return JSONResponse(content={"error": 0})

        elif status in [3, 7]:
            logger.error(f"Ошибка сохранения файла")
            return JSONResponse(content={"error": 1})
        elif status == 4:
            return JSONResponse(content={"error": 0})
        elif status == 1:
            return JSONResponse(content={"error": 0})
        else:
            return JSONResponse(content={"error": 0}) 
            
    except requests.exceptions.RequestException as e:
        print(f"Network error downloading file from OnlyOffice: {e}")
        return JSONResponse(content={"error": 1})
    except Exception as e:
        print(f"Error processing OnlyOffice callback: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(content={"error": 1})

@faq_router.get("/download/onlyoffice/{document_id}", response_class=FileResponse)
async def download_document(document_id: str):
    document = get_document(document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document metadata not found")

    # Используем "filePath", а не "file_path"
    rel_file_path = document.get("filePath")
    if not rel_file_path:
        raise HTTPException(status_code=400, detail="Missing filePath in metadata")

    # Защита от path traversal
    full_file_path = (SOFTWARE_DIR / rel_file_path).resolve()
    if not full_file_path.is_file() or not str(full_file_path).startswith(str(SOFTWARE_DIR.resolve())):
        raise HTTPException(status_code=403, detail="Access denied or invalid file path")

    logger.info(f"Serving document: {full_file_path}")

    return FileResponse(
        full_file_path,
        media_type='application/octet-stream',
        filename=document["title"]
    )

@faq_router.get("/download/{file_path:path}")
async def download_software(file_path: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    if ".." in file_path or file_path.startswith("/") or file_path.startswith("\\"):
        raise HTTPException(status_code=400, detail="Invalid file path")

    full_file_path = os.path.join(SOFTWARE_DIR, file_path)
    full_file_path = os.path.normpath(full_file_path)

    if not full_file_path.startswith(os.path.abspath(SOFTWARE_DIR)):
        raise HTTPException(status_code=403, detail="Access denied")

    _, ext = os.path.splitext(full_file_path)

    if not os.path.isfile(full_file_path):
        raise HTTPException(status_code=404, detail="File not found")

    metadata_path = os.path.splitext(full_file_path)[0] + ".json"
    if not os.path.exists(metadata_path):
        raise HTTPException(status_code=404, detail="Software metadata not found")

    with open(metadata_path, 'r', encoding='utf-8') as f:
        metadata = json.load(f)

    metadata["downloads_count"] += 1
    with open(metadata_path, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    return FileResponse(full_file_path, filename=os.path.basename(full_file_path))

def clean_software_name(raw_name: str) -> str:
    name = re.sub(r'[-_.]', ' ', raw_name)
    
    patterns = [
        r'\b(v|version|ver)\s*\d+(\.\d+)*',
        r'\b\d+(\.\d+)*\s*(x64|x86|win32|win64)?',
        r'\b(repack|final|portable|setup|installer|by\s+\w+|crack|patched|official)\b',
        r'\(.*?\)',
        r'\[.*?\]',
        r'\b\d{4}\b',
    ]
    
    for pattern in patterns:
        name = re.sub(pattern, '', name, flags=re.IGNORECASE)

    name = re.sub(r'\s+', ' ', name).strip()
    if not name:
        name = raw_name
    
    return name