from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
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
        raise HTTPException(status_code=401, detail="Неверные учетные данные")

    role = get_user_role(user["username"])
    access_token = create_access_token(
        data={
            "sub": user["username"],
            "full_name": user.get("full_name", "Не указано"),
            "role": role
        }
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": role,
        "full_name": user.get("full_name", "Не указано")
    }

@router.get("/verify")
async def verify(token: str = Depends(oauth2_scheme)):
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Недействительный токен")

    username = payload.get("username")
    if not username:
        raise HTTPException(status_code=401, detail="Недействительный токен: отсутствует username")

    return {
        "status": "success",
        "username": username,
        "role": payload.get("role", get_user_role(username)),  # Запасной вызов get_user_role
        "full_name": payload.get("full_name", "Не указано")
    }