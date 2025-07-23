from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from services.ad_auth import authenticate_user, get_user_role
from fastapi.security import OAuth2PasswordBearer

router = APIRouter()

class LoginRequest(BaseModel):
    username: str
    password: str

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

@router.post("/login")
async def login(login_data: LoginRequest):
    user = authenticate_user(login_data.username, login_data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Неверные учетные данные")
    return {
        "access_token": user["username"],
        "token_type": "bearer",
        "role": get_user_role(user["username"])
    }