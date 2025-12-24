from sqlalchemy import Column, String, Boolean, DateTime
from sqlalchemy.sql import func
from database.database import Base

class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    token = Column(String(64), primary_key=True, index=True)
    username = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    is_used = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, server_default=func.now())