from fastapi import APIRouter, Depends
from pydantic import BaseModel
from fastapi.security import OAuth2PasswordBearer
from db.database import get_db_connection
from sqlalchemy.orm import Session

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

class TicketCreate(BaseModel):
    title: str
    description: str
    priority: str

@router.post("/tickets")
async def create_ticket(ticket: TicketCreate, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    # Реализация создания тикетов в службе поддержки
    pass