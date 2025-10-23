# models/admin_models.py
from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime, ForeignKey, Table
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import JSONB, UUID
import json
import uuid

Base = declarative_base()

# Ассоциативная таблица для многих-ко-многим между Admin и Service
admin_service_association = Table(
    'admin_services',
    Base.metadata,
    Column('admin_id', Integer, ForeignKey('admins.id', ondelete='CASCADE')),
    Column('service_id', Integer, ForeignKey('services.id', ondelete='CASCADE')),
    Column('created_at', DateTime(timezone=True), server_default=func.now())
)

class Service(Base):
    __tablename__ = "services"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(Text)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Связи
    admins = relationship("Admin", secondary=admin_service_association, back_populates="services")

class Admin(Base):
    __tablename__ = "admins"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, index=True, nullable=True)
    service_id = Column(Integer, ForeignKey('services.id'), default=0)  # Основной сервис
    
    # Права доступа
    permissions = Column(JSONB, default=lambda: json.dumps({
        "read": True,
        "write": True, 
        "delete": True,
        "manage_admins": False,
        "role": "admin"
    }))
    
    # Статус и метаданные
    is_active = Column(Boolean, default=True)
    is_superadmin = Column(Boolean, default=False)
    last_login = Column(DateTime(timezone=True), nullable=True)
    login_attempts = Column(Integer, default=0)
    locked_until = Column(DateTime(timezone=True), nullable=True)
    
    # Аудит
    created_by = Column(String(100), nullable=True)  # Кто создал администратора
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Связи
    services = relationship("Service", secondary=admin_service_association, back_populates="admins")
    primary_service = relationship("Service", foreign_keys=[service_id])
    audit_logs = relationship("AdminAuditLog", back_populates="admin")

class AdminAuditLog(Base):
    __tablename__ = "admin_audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    admin_id = Column(Integer, ForeignKey('admins.id', ondelete='CASCADE'), nullable=False, index=True)
    action = Column(String(100), nullable=False)  # CREATE, UPDATE, DELETE, LOGIN, etc.
    resource_type = Column(String(100))  # admin, service, user, etc.
    resource_id = Column(String(100))  # ID изменяемого ресурса
    old_values = Column(JSONB)  # Старые значения
    new_values = Column(JSONB)  # Новые значения
    ip_address = Column(String(45))  # IPv6 support
    user_agent = Column(Text)
    performed_by = Column(String(100), nullable=False)  # Кто выполнил действие
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Связи
    admin = relationship("Admin", back_populates="audit_logs")

class SystemSettings(Base):
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(JSONB, nullable=False)
    description = Column(Text)
    is_public = Column(Boolean, default=False)
    updated_by = Column(String(100))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())