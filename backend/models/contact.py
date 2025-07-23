from sqlalchemy import Column, Integer, String, Text
from db.database import Base
router = APIRouter(
class Contact(Base):
    __tablename__ = "contacts"
    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String)
    position = Column(String)
    department = Column(String)
    internal_phone = Column(String)
    city_phone = Column(String)
    mobile_phone = Column(String)
    email = Column(String)