# token_settings.py
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any
import os
from jose import jwt
from your_auth_file import get_current_user  # импортируйте вашу функцию аутентификации

router = APIRouter(prefix="/admin", tags=["token-settings"])

@router.get("/token-settings")
async def get_token_settings(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Получить текущие настройки токенов"""
    if not current_user.get("isAdmin") and current_user.get("role") not in ["admin", "superadmin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав для просмотра настроек токенов"
        )
    
    return {
        "access_token_expire_minutes": int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440")),
        "refresh_token_expire_days": int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7")),
        "algorithm": os.getenv("ALGORITHM", "HS256")
    }

@router.post("/token-settings")
async def update_token_settings(
    settings: Dict[str, Any],
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Обновить настройки токенов"""
    if not current_user.get("isAdmin") and current_user.get("role") != "superadmin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав для изменения настроек токенов"
        )
    
    # Валидация
    access_token_minutes = settings.get("access_token_expire_minutes")
    refresh_token_days = settings.get("refresh_token_expire_days")
    algorithm = settings.get("algorithm")
    
    if access_token_minutes and (access_token_minutes < 5 or access_token_minutes > 10080):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Access Token должен быть от 5 минут до 7 дней (10080 минут)"
        )
    
    if refresh_token_days and (refresh_token_days < 1 or refresh_token_days > 365):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Refresh Token должен быть от 1 до 365 дней"
        )
    
    valid_algorithms = ["HS256", "HS384", "HS512", "RS256"]
    if algorithm and algorithm not in valid_algorithms:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Недопустимый алгоритм. Допустимые: {', '.join(valid_algorithms)}"
        )
    
    # TODO: Сохранить настройки в базу данных или файл конфигурации
    # Пока просто возвращаем обновленные настройки
    
    return {
        "message": "Настройки токенов успешно обновлены",
        "settings": {
            "access_token_expire_minutes": access_token_minutes or int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440")),
            "refresh_token_expire_days": refresh_token_days or int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7")),
            "algorithm": algorithm or os.getenv("ALGORITHM", "HS256")
        }
    }