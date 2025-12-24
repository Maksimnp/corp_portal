from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any
from datetime import datetime

class UserBase(BaseModel):
    username: str
    email: EmailStr
    full_name: Optional[str] = None
    is_active: Optional[bool] = True
    is_admin: Optional[bool] = False

class UserInDB(UserBase):
    hashed_password: str
    role: str = "user"
    department: Optional[str] = None
    admin_permissions: Optional[Dict[str, Any]] = None
    last_login: Optional[datetime] = None
    created_at: Optional[datetime] = None

class UserInResponse(BaseModel):
    username: str
    email: EmailStr
    full_name: Optional[str] = None
    role: str
    is_admin: bool
    department: Optional[str] = None