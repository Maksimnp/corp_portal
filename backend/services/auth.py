from datetime import datetime, timedelta
from typing import Optional, Dict
from jose import jwt, JWTError
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import os
from dotenv import load_dotenv
import logging

logger = logging.getLogger(__name__)

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30))

if not SECRET_KEY:
    logger.error("SECRET_KEY not found in environment variables")
    raise ValueError("SECRET_KEY not found in environment variables")
if not ALGORITHM:
    logger.error("ALGORITHM not found in environment variables, using default HS256")
if ACCESS_TOKEN_EXPIRE_MINUTES <= 0:
    logger.error("ACCESS_TOKEN_EXPIRE_MINUTES must be positive, using default 30")
    ACCESS_TOKEN_EXPIRE_MINUTES = 30

router = APIRouter(tags=["auth"])  

security = HTTPBearer()

def create_access_token(data: Dict[str, str], expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    try:
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        logger.debug(f"Created JWT token for user: {to_encode.get('sub')}")
        return encoded_jwt
    except Exception as e:
        logger.error(f"Failed to create JWT token: {e}")
        raise

def verify_token(token: str) -> Optional[Dict[str, str]]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not username:
            logger.warning("Token verification failed: No username in token")
            return None
        result = {
            "username": username,
            "full_name": payload.get("full_name", "Не указано"),
            "role": payload.get("role", None),
            "department": payload.get("department", "ТЭРиОВТ")
        }
        logger.debug(f"Token verified for user: {username}")
        return result
    except JWTError as e:
        logger.warning(f"Token verification error: {e}")
        return None

@router.get("/me")
async def get_user_info(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        user_data = verify_token(credentials.credentials)
        if not user_data:
            logger.warning(f"Недействительный или истёкший токен: {credentials.credentials[:10]}...")
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный или истёкший токен")
        
        user_info = {
            "username": user_data.get("username"),
            "full_name": user_data.get("full_name", user_data.get("username")),
            "role": user_data.get("role", "user"),
            "isAdmin": user_data.get("role") == "admin",
            "department": user_data.get("department", "ТЭРиОВТ")
        }
        logger.info(f"User info retrieved for {user_info['username']}")
        return user_info
    except Exception as e:
        logger.error(f"Ошибка в /auth/me: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка сервера: {str(e)}")
