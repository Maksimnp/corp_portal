# services/admin_manager.py
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
import json
import logging
import os
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.handlers.RotatingFileHandler("admin_manager.log", maxBytes=10485760, backupCount=5),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class AdminManager:
    def __init__(self):
        # Используем portaladmins_db, где реально есть таблицы admins и reset_tokens
        DB_HOST = os.getenv("DB_HOST", "localhost")
        DB_DATABASE = "portaladmins_db"  # База с таблицами admins и reset_tokens
        DB_USER = os.getenv("DB_USER", "postgres")
        DB_PASSWORD = os.getenv("DB_PASSWORD", "")
        DB_PORT = os.getenv("DB_PORT", "5432")
        
        self.database_url = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_DATABASE}"
        logger.info(f"🔧 AdminManager using database: {DB_DATABASE} at {DB_HOST}:{DB_PORT}")
        self.engine = create_engine(self.database_url)
        
        # Проверим структуру таблиц
        self._check_table_structure()
        
    def _check_table_structure(self):
        """Проверка структуры таблиц admins и reset_tokens"""
        try:
            with Session(self.engine) as session:
                # Проверка таблицы admins
                result = session.execute(text("""
                    SELECT column_name, data_type 
                    FROM information_schema.columns 
                    WHERE table_name = 'admins' 
                    ORDER BY ordinal_position
                """))
                columns = [row[0] for row in result]
                if not columns:
                    logger.warning("Таблица 'admins' не найдена в базе данных")
                else:
                    logger.info(f"📋 Admin table columns: {columns}")
                
                # Проверка таблицы reset_tokens
                result = session.execute(text("""
                    SELECT column_name, data_type 
                    FROM information_schema.columns 
                    WHERE table_name = 'reset_tokens' 
                    ORDER BY ordinal_position
                """))
                columns = [row[0] for row in result]
                if not columns:
                    logger.warning("Таблица 'reset_tokens' не найдена в базе данных")
                else:
                    logger.info(f"📋 Reset tokens table columns: {columns}")
                
        except Exception as e:
            logger.error(f"❌ Ошибка при проверке структуры таблиц: {e}")

    def add_admin(
        self,
        username: str,
        service_id: int,
        permissions: Dict[str, Any],
        is_active: bool = True,
        email: str = None
    ) -> bool:
        """Добавить нового администратора"""
        try:
            with Session(self.engine) as session:
                # Проверяем существование администратора (включая неактивных)
                existing = session.execute(
                    text("SELECT id, is_active FROM admins WHERE username = :username"),
                    {"username": username}
                ).fetchone()

                if existing:
                    logger.warning(f"Админ '{username}' уже существует (ID: {existing[0]}, активен: {existing[1]})")
                    return False

                # Устанавливаем email по умолчанию если не указан
                if not email:
                    email = f"{username}@minskhleb.by"

                session.execute(
                    text("""
                        INSERT INTO admins (username, service_id, is_active, permissions, email, created_at, updated_at)
                        VALUES (:username, :service_id, :is_active, :permissions, :email, :created_at, :updated_at)
                    """),
                    {
                        "username": username,
                        "service_id": service_id,
                        "is_active": is_active,
                        "permissions": json.dumps(permissions),
                        "email": email,
                        "created_at": datetime.now(),
                        "updated_at": datetime.now()
                    }
                )
                session.commit()
                logger.info(f"✅ Админ '{username}' успешно добавлен (email: {email})")
                return True

        except Exception as e:
            logger.error(f"❌ Ошибка добавления админа '{username}': {e}")
            return False
    
    def update_admin(self, admin_id: int, **kwargs) -> bool:
        """Обновить данные администратора"""
        try:
            with Session(self.engine) as session:
                result = session.execute(
                    text("SELECT 1 FROM admins WHERE id = :admin_id"),
                    {"admin_id": admin_id}
                )
                exists = result.fetchone()

                if not exists:
                    logger.warning(f"Админ с ID {admin_id} не найден")
                    return False

                update_data = {}
                for key, value in kwargs.items():
                    if key == "permissions" and isinstance(value, dict):
                        value = json.dumps(value)
                    update_data[key] = value

                # Добавляем updated_at
                update_data["updated_at"] = datetime.now()

                # Формируем динамический SQL-запрос для обновления
                set_clause = ", ".join(f"{key} = :{key}" for key in update_data)
                query = text(f"UPDATE admins SET {set_clause} WHERE id = :admin_id")
                update_data["admin_id"] = admin_id

                session.execute(query, update_data)
                session.commit()
                logger.info(f"✅ Админ с ID {admin_id} успешно обновлен: {list(kwargs.keys())}")
                return True

        except Exception as e:
            logger.error(f"❌ Ошибка обновления админа с ID {admin_id}: {e}")
            return False
    
    def delete_admin(self, admin_id: int) -> bool:
        """Удалить администратора"""
        try:
            with Session(self.engine) as session:
                result = session.execute(
                    text("SELECT username FROM admins WHERE id = :admin_id"),
                    {"admin_id": admin_id}
                )
                admin = result.fetchone()

                if not admin:
                    logger.warning(f"Админ с ID {admin_id} не найден")
                    return False

                session.execute(
                    text("DELETE FROM admins WHERE id = :admin_id"),
                    {"admin_id": admin_id}
                )
                session.commit()
                logger.info(f"✅ Админ '{admin[0]}' (ID: {admin_id}) успешно удален")
                return True

        except Exception as e:
            logger.error(f"❌ Ошибка удаления админа с ID {admin_id}: {e}")
            return False
        
    def get_admin_by_username(self, username: str, include_inactive: bool = False) -> Optional[Dict[str, Any]]:
        """Получение администратора по имени пользователя"""
        try:
            with Session(self.engine) as session:
                logger.info(f"🔍 Поиск админа: {username} (включая неактивных: {include_inactive})")
                
                if include_inactive:
                    query = text("""
                        SELECT id, username, service_id, is_active, permissions, created_at, updated_at, email
                        FROM admins 
                        WHERE username = :username
                    """)
                else:
                    query = text("""
                        SELECT id, username, service_id, is_active, permissions, created_at, updated_at, email
                        FROM admins 
                        WHERE username = :username AND is_active = true
                    """)
                
                result = session.execute(query, {"username": username})
                
                row = result.fetchone()
                if row:
                    permissions = row[4]
                    if isinstance(permissions, str):
                        try:
                            permissions = json.loads(permissions)
                        except json.JSONDecodeError:
                            permissions = {"read": True, "write": True, "delete": True, "manage_admins": False}
                    elif permissions is None:
                        permissions = {"read": True, "write": True, "delete": True, "manage_admins": False}
                    
                    admin_data = {
                        'id': row[0],
                        'username': row[1],
                        'service_id': row[2],
                        'is_active': row[3],
                        'permissions': permissions,
                        'created_at': row[5].isoformat() if row[5] else None,
                        'updated_at': row[6].isoformat() if row[6] else None,
                        'email': row[7] or f"{row[1]}@minskhleb.by"
                    }
                    logger.info(f"✅ Админ найден: {username} (активен: {row[3]}) с правами: {permissions}")
                    return admin_data
                
                logger.warning(f"❌ Админ не найден: {username}")
                return None
                
        except Exception as e:
            logger.error(f"❌ Ошибка получения админа {username}: {e}")
            return None

    def get_all_admins(self, include_inactive: bool = False) -> List[Dict[str, Any]]:
        """Получение всех администраторов"""
        try:
            with Session(self.engine) as session:
                if include_inactive:
                    query = text("""
                        SELECT id, username, service_id, is_active, permissions, created_at, updated_at, email
                        FROM admins 
                        ORDER BY created_at DESC
                    """)
                else:
                    query = text("""
                        SELECT id, username, service_id, is_active, permissions, created_at, updated_at, email
                        FROM admins 
                        WHERE is_active = true
                        ORDER BY created_at DESC
                    """)
                
                result = session.execute(query)
                
                admins = []
                for row in result:
                    permissions = row[4]
                    if isinstance(permissions, str):
                        try:
                            permissions = json.loads(permissions)
                        except json.JSONDecodeError:
                            permissions = {"read": True, "write": True, "delete": True, "manage_admins": False}
                    elif permissions is None:
                        permissions = {"read": True, "write": True, "delete": True, "manage_admins": False}
                    
                    admins.append({
                        'id': row[0],
                        'username': row[1],
                        'service_id': row[2],
                        'is_active': row[3],
                        'permissions': permissions,
                        'created_at': row[5].isoformat() if row[5] else None,
                        'updated_at': row[6].isoformat() if row[6] else None,
                        'email': row[7] or f"{row[1]}@minskhleb.by"
                    })
                
                status_filter = "всех" if include_inactive else "активных"
                logger.info(f"✅ Загружено {len(admins)} {status_filter} админов из portaladmins_db")
                return admins
                
        except Exception as e:
            logger.error(f"❌ Ошибка получения админов: {e}")
            return []

    def get_services(self) -> List[Dict[str, Any]]:
        """Получение списка сервисов"""
        try:
            with Session(self.engine) as session:
                try:
                    result = session.execute(text("""
                        SELECT id, name, description, status, version, endpoint_url, 
                               health_check_url, category, is_active
                        FROM services 
                        WHERE is_active = true
                        ORDER BY name
                    """))
                    
                    services = []
                    for row in result:
                        services.append({
                            'id': row[0],
                            'name': row[1],
                            'description': row[2],
                            'status': row[3],
                            'version': row[4],
                            'endpoint_url': row[5],
                            'health_check_url': row[6],
                            'category': row[7],
                            'is_active': row[8]
                        })
                    
                    logger.info(f"✅ Загружено {len(services)} сервисов из portaladmins_db")
                    return services
                except Exception as e:
                    logger.warning(f"Таблица services не найдена в portaladmins_db: {e}")
                    return self._get_services_from_portal_db()
                
        except Exception as e:
            logger.error(f"❌ Ошибка получения сервисов: {e}")
            return self._get_default_services()
    
    def _get_services_from_portal_db(self) -> List[Dict[str, Any]]:
        """Получение сервисов из portal_db"""
        try:
            DB_HOST = os.getenv("DB_HOST", "localhost")
            DB_DATABASE = "portal_db"
            DB_USER = os.getenv("DB_USER", "postgres")
            DB_PASSWORD = os.getenv("DB_PASSWORD", "")
            DB_PORT = os.getenv("DB_PORT", "5432")
            
            portal_db_url = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_DATABASE}"
            engine = create_engine(portal_db_url)
            
            with Session(engine) as session:
                result = session.execute(text("""
                    SELECT id, name, description, status, version, endpoint_url, 
                           health_check_url, category, is_active
                    FROM services 
                    WHERE is_active = true
                    ORDER BY name
                """))
                
                services = []
                for row in result:
                    services.append({
                        'id': row[0],
                        'name': row[1],
                        'description': row[2],
                        'status': row[3],
                        'version': row[4],
                        'endpoint_url': row[5],
                        'health_check_url': row[6],
                        'category': row[7],
                        'is_active': row[8]
                    })
                
                logger.info(f"✅ Загружено {len(services)} сервисов из portal_db")
                return services
                
        except Exception as e:
            logger.warning(f"Не удалось загрузить сервисы из portal_db: {e}")
            return self._get_default_services()
    
    def _get_default_services(self) -> List[Dict[str, Any]]:
        """Возвращает список сервисов по умолчанию"""
        return [
            {
                "id": 1,
                "name": "Корпоративный портал",
                "description": "Основной портал сотрудников",
                "status": "active",
                "version": "1.0.0",
                "endpoint_url": None,
                "health_check_url": None,
                "category": None,
                "is_active": True
            },
            {
                "id": 2,
                "name": "Удаленный рабочий стол",
                "description": "Система удаленного доступа к рабочим станциям",
                "status": "active",
                "version": "1.0.0",
                "endpoint_url": None,
                "health_check_url": None,
                "category": None,
                "is_active": True
            }
        ]

    def load_reset_tokens(self) -> Dict[str, Any]:
        """Загрузка токенов сброса пароля из базы данных"""
        try:
            with Session(self.engine) as session:
                result = session.execute(text("""
                    SELECT token, username, email, expires, used 
                    FROM reset_tokens
                """))
                tokens = {}
                for row in result:
                    tokens[row[0]] = {
                        "username": row[1],
                        "email": row[2],
                        "expires": row[3],
                        "used": row[4]
                    }
                logger.info(f"✅ Загружено {len(tokens)} токенов сброса из portaladmins_db")
                return tokens
        except Exception as e:
            logger.error(f"❌ Ошибка загрузки токенов сброса: {e}")
            return {}

    def add_reset_token(self, token: str, token_data: Dict[str, Any]) -> None:
        """Добавление токена сброса пароля в базу данных"""
        try:
            with Session(self.engine) as session:
                session.execute(
                    text("""
                        INSERT INTO reset_tokens (token, username, email, expires, used)
                        VALUES (:token, :username, :email, :expires, :used)
                    """),
                    {
                        "token": token,
                        "username": token_data["username"],
                        "email": token_data["email"],
                        "expires": token_data["expires"],
                        "used": token_data["used"]
                    }
                )
                session.commit()
                logger.info(f"✅ Добавлен токен сброса для {token_data['email']}")
        except Exception as e:
            logger.error(f"❌ Ошибка добавления токена сброса: {e}")

    def remove_reset_token(self, token: str) -> None:
        """Удаление токена сброса пароля"""
        try:
            with Session(self.engine) as session:
                session.execute(
                    text("DELETE FROM reset_tokens WHERE token = :token"),
                    {"token": token}
                )
                session.commit()
                logger.info(f"✅ Удален токен сброса: {token}")
        except Exception as e:
            logger.error(f"❌ Ошибка удаления токена сброса: {e}")

    def cleanup_expired_tokens(self) -> None:
        """Удаление истекших или использованных токенов сброса"""
        try:
            with Session(self.engine) as session:
                result = session.execute(
                    text("DELETE FROM reset_tokens WHERE expires < :current_time OR used = true"),
                    {"current_time": datetime.now()}
                )
                deleted_count = result.rowcount
                session.commit()
                logger.info(f"✅ Удалено {deleted_count} истекших или использованных токенов сброса")
        except Exception as e:
            logger.error(f"❌ Ошибка очистки токенов сброса: {e}")

# Глобальный экземпляр
admin_manager = AdminManager()