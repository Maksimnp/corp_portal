from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime
import logging
import os
from typing import List, Optional
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, Boolean, ForeignKey, func, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.exc import SQLAlchemyError
from cachetools import TTLCache
from concurrent.futures import ThreadPoolExecutor
import asyncio
from api.auth import verify_token
from sqlalchemy.orm import relationship

router = APIRouter(tags=["admin"])

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://portal_admin:season@localhost/portalAdmins_db")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

executor = ThreadPoolExecutor(max_workers=4)
security = HTTPBearer()
CACHE_TTL = 300
cache = TTLCache(maxsize=1000, ttl=CACHE_TTL)

# Модели базы данных
class Admin(Base):
    __tablename__ = "admins"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    service_id = Column(Integer, ForeignKey('services.id'), nullable=True)
    permissions = Column(String, nullable=False, default='{"read": true, "write": true, "delete": true}')
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

class Service(Base):
    __tablename__ = "services"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    description = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=func.now())
    
    admins = relationship("Admin", backref="service")

# Pydantic модели
class AdminBase(BaseModel):
    username: str
    service_id: Optional[int] = None
    permissions: str = '{"read": true, "write": true, "delete": true}'

class AdminCreate(AdminBase):
    pass

class AdminResponse(AdminBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class ServiceBase(BaseModel):
    name: str
    description: Optional[str] = None

class ServiceCreate(ServiceBase):
    pass

class ServiceResponse(ServiceBase):
    id: int
    is_active: bool
    created_at: datetime
    admin_count: Optional[int] = 0
    
    class Config:
        from_attributes = True

class AdminListResponse(BaseModel):
    admins: List[AdminResponse]
    total_count: int

class ServiceListResponse(BaseModel):
    services: List[ServiceResponse]
    total_count: int

# Зависимости
async def verify_token_dependency(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    user_data = verify_token(token)
    if not user_data:
        logger.warning(f"Недействительный или истёкший токен: {token[:10]}...")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный или истёкший токен")

    if not user_data.get('is_global_admin', False):
        logger.warning(f"Попытка доступа к админ-панели без прав глобального администратора: {user_data.get('username')}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ разрешен только глобальным администраторам")
    
    return user_data

def get_db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_admins_sync(db: Session, user_data: dict):
    try:
        cache_key = "admins_list"
        cached_data = cache.get(cache_key)
        if cached_data:
            logger.debug("Возвращены кэшированные данные списка администраторов")
            return cached_data

        admins = db.query(Admin).filter(Admin.is_active == True).order_by(Admin.created_at.desc()).all()
        
        result = {
            "admins": admins,
            "total_count": len(admins)
        }
        
        cache[cache_key] = result
        return result
    except SQLAlchemyError as e:
        logger.error(f"Ошибка базы данных при получении списка администраторов: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Ошибка получения списка администраторов")
    except Exception as e:
        logger.error(f"Неожиданная ошибка при получении списка администраторов: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Внутренняя ошибка сервера")

def get_services_sync(db: Session, user_data: dict):
    try:
        cache_key = "services_list"
        cached_data = cache.get(cache_key)
        if cached_data:
            logger.debug("Возвращены кэшированные данные списка сервисов")
            return cached_data

        services = db.query(Service).filter(Service.is_active == True).order_by(Service.name).all()
        
        # Добавляем количество администраторов для каждого сервиса
        services_with_count = []
        for service in services:
            admin_count = db.query(Admin).filter(
                Admin.service_id == service.id, 
                Admin.is_active == True
            ).count()
            services_with_count.append({
                **service.__dict__,
                "admin_count": admin_count
            })
        
        result = {
            "services": services_with_count,
            "total_count": len(services)
        }
        
        cache[cache_key] = result
        return result
    except SQLAlchemyError as e:
        logger.error(f"Ошибка базы данных при получении списка сервисов: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Ошибка получения списка сервисов")
    except Exception as e:
        logger.error(f"Неожиданная ошибка при получении списка сервисов: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Внутренняя ошибка сервера")

def create_admin_sync(db: Session, admin_data: AdminCreate, user_data: dict):
    try:
        existing_admin = db.query(Admin).filter(Admin.username == admin_data.username).first()
        if existing_admin:
            logger.warning(f"Попытка создания администратора с существующим username: {admin_data.username}")
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Администратор с таким username уже существует")
        try:
            import json
            permissions = json.loads(admin_data.permissions)
            if not isinstance(permissions, dict):
                raise ValueError("Permissions должен быть JSON объектом")
        except (json.JSONDecodeError, ValueError) as e:
            logger.warning(f"Невалидный формат permissions: {admin_data.permissions}")
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Невалидный формат permissions. Должен быть валидный JSON объект")

        if admin_data.service_id:
            service = db.query(Service).filter(Service.id == admin_data.service_id, Service.is_active == True).first()
            if not service:
                logger.warning(f"Попытка создания администратора с несуществующим service_id: {admin_data.service_id}")
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Указанный сервис не существует")

        new_admin = Admin(
            username=admin_data.username,
            service_id=admin_data.service_id,
            permissions=admin_data.permissions
        )
        
        db.add(new_admin)
        db.commit()
        db.refresh(new_admin)
        

        cache.clear()
        
        logger.info(f"Администратор создан пользователем {user_data.get('username')}: {admin_data.username}")
        return new_admin
        
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Ошибка базы данных при создании администратора: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Ошибка создания администратора")
    except Exception as e:
        db.rollback()
        logger.error(f"Неожиданная ошибка при создании администратора: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Внутренняя ошибка сервера")

def delete_admin_sync(db: Session, admin_id: int, user_data: dict):
    try:

        admin = db.query(Admin).filter(Admin.id == admin_id, Admin.is_active == True).first()
        if not admin:
            logger.warning(f"Попытка удаления несуществующего администратора с id: {admin_id}")
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Администратор не найден")


        admin.is_active = False
        admin.updated_at = func.now()
        
        db.commit()

        cache.clear()
        
        logger.info(f"Администратор удален пользователем {user_data.get('username')}: {admin.username} (id: {admin_id})")
        return {"detail": "Администратор успешно удален"}
        
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Ошибка базы данных при удалении администратора: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Ошибка удаления администратора")
    except Exception as e:
        db.rollback()
        logger.error(f"Неожиданная ошибка при удалении администратора: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Внутренняя ошибка сервера")

def create_service_sync(db: Session, service_data: ServiceCreate, user_data: dict):
    try:

        existing_service = db.query(Service).filter(Service.name == service_data.name).first()
        if existing_service:
            logger.warning(f"Попытка создания сервиса с существующим именем: {service_data.name}")
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Сервис с таким именем уже существует")


        new_service = Service(
            name=service_data.name,
            description=service_data.description
        )
        
        db.add(new_service)
        db.commit()
        db.refresh(new_service)

        cache.clear()
        
        logger.info(f"Сервис создан пользователем {user_data.get('username')}: {service_data.name}")
        return new_service
        
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Ошибка базы данных при создании сервиса: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Ошибка создания сервиса")
    except Exception as e:
        db.rollback()
        logger.error(f"Неожиданная ошибка при создании сервиса: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Внутренняя ошибка сервера")

@router.get("/", response_model=AdminListResponse)
async def get_admins(
    user_data: dict = Depends(verify_token_dependency),
    db: Session = Depends(get_db_session)
):
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(executor, get_admins_sync, db, user_data)
    return result

@router.get("/services", response_model=ServiceListResponse)
async def get_services(
    user_data: dict = Depends(verify_token_dependency),
    db: Session = Depends(get_db_session)
):
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(executor, get_services_sync, db, user_data)
    return result

@router.post("/", response_model=AdminResponse)
async def create_admin(
    admin: AdminCreate,
    user_data: dict = Depends(verify_token_dependency),
    db: Session = Depends(get_db_session)
):
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(executor, create_admin_sync, db, admin, user_data)
    return result

@router.delete("/{admin_id}")
async def delete_admin(
    admin_id: int,
    user_data: dict = Depends(verify_token_dependency),
    db: Session = Depends(get_db_session)
):
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(executor, delete_admin_sync, db, admin_id, user_data)
    return result

@router.post("/services", response_model=ServiceResponse)
async def create_service(
    service: ServiceCreate,
    user_data: dict = Depends(verify_token_dependency),
    db: Session = Depends(get_db_session)
):
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(executor, create_service_sync, db, service, user_data)
    return result


@router.delete("/services/{service_id}")
async def delete_service(
    service_id: int,
    user_data: dict = Depends(verify_token_dependency),
    db: Session = Depends(get_db_session)
):
    try:

        service = db.query(Service).filter(Service.id == service_id, Service.is_active == True).first()
        if not service:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сервис не найден")

        active_admins = db.query(Admin).filter(Admin.service_id == service_id, Admin.is_active == True).count()
        if active_admins > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, 
                detail="Невозможно удалить сервис, так как у него есть активные администраторы"
            )

        service.is_active = False
        
        db.commit()
        cache.clear()
        
        logger.info(f"Сервис удален пользователем {user_data.get('username')}: {service.name}")
        return {"detail": "Сервис успешно удален"}
        
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Ошибка базы данных при удалении сервиса: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Ошибка удаления сервиса")
    except Exception as e:
        db.rollback()
        logger.error(f"Неожиданная ошибка при удалении сервиса: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Внутренняя ошибка сервера")

@router.get("/stats")
async def get_admin_stats(
    user_data: dict = Depends(verify_token_dependency),
    db: Session = Depends(get_db_session)
):
    try:
        total_admins = db.query(Admin).filter(Admin.is_active == True).count()
        global_admins = db.query(Admin).filter(Admin.service_id == None, Admin.is_active == True).count()
        service_admins = total_admins - global_admins

        total_services = db.query(Service).filter(Service.is_active == True).count()
        services_with_admins = db.query(Service).filter(
            Service.is_active == True,
            Service.id.in_(
                db.query(Admin.service_id).filter(Admin.is_active == True).distinct()
            )
        ).count()
        
        return {
            "total_admins": total_admins,
            "global_admins": global_admins,
            "service_admins": service_admins,
            "total_services": total_services,
            "services_with_admins": services_with_admins,
            "services_without_admins": total_services - services_with_admins
        }
        
    except SQLAlchemyError as e:
        logger.error(f"Ошибка базы данных при получении статистики: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Ошибка получения статистики")
    except Exception as e:
        logger.error(f"Неожиданная ошибка при получении статистики: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Внутренняя ошибка сервера")