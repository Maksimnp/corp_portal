from datetime import datetime, timedelta
from typing import Optional, Dict
from jose import jwt, JWTError
import os
from dotenv import load_dotenv
import ldap

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30))

if not SECRET_KEY:
    raise ValueError("SECRET_KEY not found in environment variables")

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        full_name: str = payload.get("full_name", "Не указано")  # Добавляем ФИО из токена
        if username is None:
            print("Token verification failed: No username in token")
            return None
        return {"username": username, "full_name": full_name}
    except JWTError as e:
        print(f"Token verification error: {e}")
        return None