from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import OAuth2PasswordBearer
from typing import List, Optional
from services.jwt_utils import verify_token
from services.ad_auth import search_ad_users
import logging
from sqlalchemy.orm import Session
from db.database import get_db_connection as get_db

router = APIRouter(tags=["Contacts"])

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

@router.get("/", response_model=List[dict])
async def get_contacts(
    search: Optional[str] = Query(None),
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    user = verify_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        contacts = search_ad_users(search) if search else search_ad_users()
        return [
            {
                "username": contact["username"],
                "full_name": contact["full_name"],
                "email": contact.get("email")
            }
            for contact in contacts
        ]
    except Exception as e:
        logger.error(f"Error fetching contacts: {e}")
        raise HTTPException(status_code=500, detail="Error fetching contacts")