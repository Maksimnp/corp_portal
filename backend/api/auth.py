from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from fastapi.security import OAuth2PasswordBearer
from services.auth import create_access_token, verify_token
from services.ad_auth import authenticate_user, get_user_role

router = APIRouter()

class LoginRequest(BaseModel):
    username: str
    password: str

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

@router.post("/login")
async def login(login_data: LoginRequest):
    user = authenticate_user(login_data.username, login_data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access_token = create_access_token(data={"sub": user["username"], "full_name": user.get("full_name", "Не указано")})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": get_user_role(user["username"]),
        "full_name": user.get("full_name", "Не указано")  # Возвращаем ФИО в ответе
    }