from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional

class User(BaseModel):
    username: str
    full_name: str
    email: Optional[str] = None
    department: Optional[str] = None

class Channel(BaseModel):
    id: str
    name: str
    creator: str
    is_private: bool
    members: List[str]
    created_at: datetime

class Message(BaseModel):
    id: str
    channel_id: str
    sender: str
    content: str
    timestamp: datetime
    is_file: bool = False