from sqlalchemy import Column, String, DateTime
from database import Base
import uuid

class Message(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True, default=str(uuid.uuid4()))
    identifier = Column(String, index=True)
    sender = Column(String)
    content = Column(String)
    file_url = Column(String, nullable=True)
    timestamp = Column(DateTime)