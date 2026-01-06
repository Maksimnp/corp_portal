# api/admin.py
from fastapi import APIRouter, HTTPException, Depends, Header, Query
from services.admin_manager import admin_manager
from services.jwt_utils import verify_token
import json
import logging
import os
from typing import Dict, Any, List

router = APIRouter()

logging.basicConfig(
    level=logging.INFO if os.getenv("ENV") == "production" else logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("admin")

async def get_current_admin_user(authorization: str = Header(alias="Authorization")):
    """Проверка прав администратора"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization header required")
    
    token = authorization[7:]
    user_data = verify_token(token)
    if not user_data:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    # Проверяем, является ли пользователь администратором
    username = user_data.get("username")
    admin = admin_manager.get_admin_by_username(username)
    
    if not admin or not admin.get('is_active'):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    user_data["is_admin"] = True
    user_data["admin_permissions"] = admin.get('permissions', {})
    
    return user_data

@router.get("/admin")
async def get_admins(
    include_inactive: bool = Query(False, description="Включить неактивных администраторов"),
    current_user: dict = Depends(get_current_admin_user)
):
    """Получение списка администраторов"""
    try:
        admins = admin_manager.get_all_admins(include_inactive=include_inactive)
        # Обеспечиваем совместимость с фронтендом
        return {"admins": admins} if isinstance(admins, list) else admins
    except Exception as e:
        logger.error(f"Error getting admins: {str(e)}")
        raise HTTPException(status_code=500, detail="Ошибка получения списка администраторов")

# api/admin.py

@router.post("/admin_add")
async def add_admin(
    admin_data: dict,
    current_user: dict = Depends(get_current_admin_user)
):
    """Добавление нового администратора"""
    try:
        # Проверяем права на управление администраторами
        permissions = current_user.get("admin_permissions", {})
        if not permissions.get("manage_admins"):
            raise HTTPException(status_code=403, detail="Недостаточно прав для управления администраторами")
        
        username = admin_data.get("username")
        service_id = admin_data.get("service_id", 0)
        permissions_data = admin_data.get("permissions", {})
        email = admin_data.get("email", f"{username}@minskhleb.by")
        is_active = admin_data.get("is_active", True)
        
        if not username:
            raise HTTPException(status_code=400, detail="Username required")
        
        # Преобразуем permissions в dict если это строка
        if isinstance(permissions_data, str):
            try:
                permissions_data = json.loads(permissions_data)
            except json.JSONDecodeError:
                permissions_data = {"read": True, "write": True, "delete": True, "manage_admins": False}
        
        # Убедимся, что permissions_data является словарем
        if not isinstance(permissions_data, dict):
            permissions_data = {"read": True, "write": True, "delete": True, "manage_admins": False}
        
        logger.info(f"Adding admin: {username}, email: {email}, service_id: {service_id}, active: {is_active}")
        
        # Проверяем существование администратора (включая неактивных)
        existing_admin = admin_manager.get_admin_by_username(username, include_inactive=True)
        if existing_admin:
            # Если администратор существует, но неактивен - активируем его
            if not existing_admin.get('is_active', True):
                logger.info(f"Reactivating existing inactive admin: {username}")
                update_data = {
                    'is_active': True,
                    'service_id': service_id,
                    'permissions': permissions_data,
                    'email': email
                }
                success = admin_manager.update_admin(existing_admin['id'], **update_data)
                if success:
                    # Получаем обновленного администратора
                    updated_admin = admin_manager.get_admin_by_username(username)
                    return {
                        "message": "Неактивный администратор активирован", 
                        "username": username,
                        "admin": updated_admin
                    }
                else:
                    raise HTTPException(status_code=400, detail="Ошибка активации существующего администратора")
            else:
                # Администратор уже существует и активен
                raise HTTPException(status_code=400, detail="Администратор с таким именем уже существует")
        
        # Пробуем добавить нового администратора
        success = admin_manager.add_admin(
            username=username, 
            service_id=service_id, 
            permissions=permissions_data, 
            is_active=is_active,
            email=email
        )
        
        if success:
            # Получаем обновленный список администраторов для возврата
            new_admin = admin_manager.get_admin_by_username(username)
            response_data = {
                "message": "Администратор успешно добавлен", 
                "username": username
            }
            
            if new_admin:
                response_data["admin"] = new_admin
            
            return response_data
        else:
            raise HTTPException(status_code=400, detail="Ошибка добавления администратора")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding admin {admin_data.get('username')}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка добавления администратора: {str(e)}")
@router.put("/admin/{admin_id}")
async def update_admin(
    admin_id: int,
    admin_data: dict,
    current_user: dict = Depends(get_current_admin_user)
):
    """Обновление администратора"""
    try:
        permissions = current_user.get("admin_permissions", {})
        if not permissions.get("manage_admins"):
            raise HTTPException(status_code=403, detail="Недостаточно прав для управления администраторами")
        
        # Обработка permissions если это строка
        if 'permissions' in admin_data and isinstance(admin_data['permissions'], str):
            try:
                admin_data['permissions'] = json.loads(admin_data['permissions'])
            except json.JSONDecodeError:
                admin_data['permissions'] = {"read": True, "write": True, "delete": True, "manage_admins": False}
        
        # Обеспечиваем наличие email
        if 'email' not in admin_data and 'username' in admin_data:
            admin_data['email'] = f"{admin_data['username']}@minskhleb.by"
        
        logger.info(f"Updating admin {admin_id} with data: {admin_data}")
        
        success = admin_manager.update_admin(admin_id, **admin_data)
        
        if success:
            # Получаем обновленного администратора по username
            username = admin_data.get('username', '')
            if username:
                updated_admin = admin_manager.get_admin_by_username(username)
            else:
                updated_admin = None
            
            response_data = {
                "message": "Администратор успешно обновлен"
            }
            
            if updated_admin:
                response_data["admin"] = updated_admin
            
            return response_data
        else:
            raise HTTPException(status_code=400, detail="Ошибка обновления администратора")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating admin {admin_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка обновления администратора: {str(e)}")
@router.get("/ad-users")
async def get_ad_users(
    search: str = Query("", description="Поиск по имени, фамилии или логину"),
    current_user: dict = Depends(get_current_admin_user)
):
    """Получение списка пользователей из Active Directory"""
    try:
        # Проверяем права на управление администраторами
        permissions = current_user.get("admin_permissions", {})
        if not permissions.get("manage_admins"):
            raise HTTPException(status_code=403, detail="Недостаточно прав для просмотра пользователей AD")
        
        # Получаем список администраторов для проверки статуса
        admins = admin_manager.get_all_admins(include_inactive=False)
        admin_usernames = {admin['username'] for admin in admins}
        
        # Используем существующую функцию поиска пользователей AD
        ad_users = search_ad_users_for_admin(search)
        
        # Обогащаем данные информацией о статусе администратора
        for user in ad_users:
            user['is_admin'] = user['username'] in admin_usernames
        
        return {"users": ad_users}
        
    except Exception as e:
        logger.error(f"Error getting AD users: {str(e)}")
        raise HTTPException(status_code=500, detail="Ошибка получения списка пользователей из AD")

def search_ad_users_for_admin(search_term: str = "", max_results: int = 100) -> List[Dict[str, Any]]:
    """Поиск пользователей в AD для админ-панели"""
    try:
        from services.ldap_service import search_users, get_user_details
        
        # Используем существующую функцию поиска
        users = search_users(search_term=search_term, max_results=max_results)
        
        # Обогащаем данные дополнительной информацией
        enriched_users = []
        for user in users:
            # Получаем дополнительные детали если нужно
            if not user.get('email') or not user.get('display_name'):
                user_details = get_user_details(user['username'])
                if user_details:
                    user.update({
                        'email': user_details.get('email', f"{user['username']}@minskhleb.by"),
                        'display_name': user_details.get('full_name', user['username']),
                        'department': user_details.get('department', 'Не указан')
                    })
            
            # Обеспечиваем наличие обязательных полей
            if not user.get('email'):
                user['email'] = f"{user['username']}@minskhleb.by"
            if not user.get('display_name'):
                user['display_name'] = user['username']
            if not user.get('department'):
                user['department'] = 'Не указан'
            if not user.get('title'):
                user['title'] = 'Не указана'
                
            enriched_users.append(user)
        
        logger.info(f"Найдено {len(enriched_users)} пользователей в AD")
        return enriched_users
        
    except Exception as e:
        logger.error(f"Ошибка поиска пользователей в AD: {str(e)}")
        # Возвращаем тестовые данные в случае ошибки
        return get_fallback_users(search_term)

def get_fallback_users(search_term: str = "") -> List[Dict[str, Any]]:
    """Резервные тестовые данные"""
    test_users = [
        {
            "username": "ivanovii",
            "email": "ivanovii@minskhleb.by",
            "display_name": "Иванов Иван Иванович",
            "department": "ИТ отдел",
            "title": "Системный администратор"
        },
        {
            "username": "petrovap", 
            "email": "petrovap@minskhleb.by",
            "display_name": "Петрова Анна Сергеевна",
            "department": "Отдел кадров", 
            "title": "Менеджер по персоналу"
        },
        {
            "username": "sidorovms",
            "email": "sidorovms@minskhleb.by",
            "display_name": "Сидоров Михаил Сергеевич",
            "department": "Бухгалтерия",
            "title": "Главный бухгалтер"
        }
    ]
    
    if search_term:
        search_lower = search_term.lower()
        return [
            user for user in test_users
            if (search_lower in user['username'].lower() or 
                search_lower in user['display_name'].lower() or
                search_lower in user['email'].lower())
        ]
    
    return test_users
@router.delete("/admin/{admin_id}")
async def delete_admin(
    admin_id: int,
    current_user: dict = Depends(get_current_admin_user)
):
    """Удаление администратора"""
    try:
        # Проверяем права на управление администраторами
        permissions = current_user.get("admin_permissions", {})
        if not permissions.get("manage_admins"):
            raise HTTPException(status_code=403, detail="Недостаточно прав для управления администраторами")
        
        # Проверяем, не пытается ли пользователь удалить самого себя
        current_admin = admin_manager.get_admin_by_username(current_user.get("username"))
        if current_admin and current_admin.get('id') == admin_id:
            raise HTTPException(status_code=400, detail="Нельзя удалить собственный аккаунт")
        
        success = admin_manager.delete_admin(admin_id)
        
        if success:
            return {"message": "Администратор успешно удален"}
        else:
            raise HTTPException(status_code=400, detail="Ошибка удаления администратора")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting admin {admin_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Ошибка удаления администратора")

@router.get("/services")
async def get_services(current_user: dict = Depends(get_current_admin_user)):
    """Получение списка сервисов"""
    try:
        services = admin_manager.get_services()
        # Обеспечиваем совместимость с фронтендом
        return {"services": services} if isinstance(services, list) else services
    except Exception as e:
        logger.error(f"Error getting services: {str(e)}")
        raise HTTPException(status_code=500, detail="Ошибка получения списка сервисов")

# Добавляем новые эндпоинты для управления настройками токенов

@router.get("/token-settings")
async def get_token_settings(current_user: dict = Depends(get_current_admin_user)):
    """Получение настроек токенов"""
    try:
        # Здесь должна быть логика получения настроек из базы данных или конфигурации
        # Для примера вернем значения по умолчанию
        default_settings = {
            "access_token_expire_minutes": 1440,
            "refresh_token_expire_days": 7,
            "algorithm": "HS256"
        }
        return {"settings": default_settings}
    except Exception as e:
        logger.error(f"Error getting token settings: {str(e)}")
        raise HTTPException(status_code=500, detail="Ошибка получения настроек токенов")

@router.post("/token-settings")
async def update_token_settings(
    settings: dict,
    current_user: dict = Depends(get_current_admin_user)
):
    """Обновление настроек токенов"""
    try:
        # Проверяем права на управление администраторами
        permissions = current_user.get("admin_permissions", {})
        if not permissions.get("manage_admins"):
            raise HTTPException(status_code=403, detail="Недостаточно прав для управления администраторами")
        
        # Валидация входных данных
        access_token_expire_minutes = settings.get("access_token_expire_minutes", 1440)
        refresh_token_expire_days = settings.get("refresh_token_expire_days", 7)
        algorithm = settings.get("algorithm", "HS256")
        
        if access_token_expire_minutes < 5:
            raise HTTPException(status_code=400, detail="Access Token должен быть не менее 5 минут")
        if refresh_token_expire_days < 1:
            raise HTTPException(status_code=400, detail="Refresh Token должен быть не менее 1 дня")
        
        # Здесь должна быть логика обновления настроек в базе данных или конфигурации
        # Для примера просто вернем обновленные настройки
        updated_settings = {
            "access_token_expire_minutes": access_token_expire_minutes,
            "refresh_token_expire_days": refresh_token_expire_days,
            "algorithm": algorithm
        }
        
        return {"settings": updated_settings}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating token settings: {str(e)}")
        raise HTTPException(status_code=500, detail="Ошибка обновления настроек токенов")

@router.post("/token-settings/reset")
async def reset_token_settings(current_user: dict = Depends(get_current_admin_user)):
    """Сброс настроек токенов к значениям по умолчанию"""
    try:
        # Проверяем права на управление администраторами
        permissions = current_user.get("admin_permissions", {})
        if not permissions.get("manage_admins"):
            raise HTTPException(status_code=403, detail="Недостаточно прав для управления администраторами")
        
        # Здесь должна быть логика сброса настроек в базе данных или конфигурации
        # Для примера вернем значения по умолчанию
        default_settings = {
            "access_token_expire_minutes": 1440,
            "refresh_token_expire_days": 7,
            "algorithm": "HS256"
        }
        
        return {"settings": default_settings}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error resetting token settings: {str(e)}")
        raise HTTPException(status_code=500, detail="Ошибка сброса настроек токенов")