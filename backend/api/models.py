# api/models.py
from pydantic import BaseModel
from typing import Optional

class Contact(BaseModel):
    id: str
    full_name: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone_internal: Optional[str] = None
    phone_city: Optional[str] = None
    phone_mobile: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None

    class Config:
        from_attributes = True 