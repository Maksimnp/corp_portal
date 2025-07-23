from sqlalchemy import Column, Integer, String, ForeignKey
from db.database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    full_name = Column(String)
    avatar_url = Column(String, default="/default-avatar.png")