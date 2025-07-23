from sqlalchemy import Column, String, Text, ForeignKey, UUID
from uuid import uuid4
from sqlalchemy.orm import relationship
from .contact import Base

class Ticket(Base):
    __tablename__ = 'tickets'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    title = Column(String)
    description = Column(Text)
    status = Column(String, default="новая")
    assigned_to = Column(UUID(as_uuid=True), ForeignKey('contacts.id'))

    assignee = relationship("Contact")
