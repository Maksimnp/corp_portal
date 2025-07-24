import ldap
from typing import Optional, Dict
from dotenv import load_dotenv
import os
import logging

# Настройка логирования
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
load_dotenv()

# Настройки AD
LDAP_SERVER = os.getenv("LDAP_SERVER", "ldap://192.1.3.6:389")
LDAP_DOMAIN = os.getenv("LDAP_DOMAIN", "mhp.net")
BASE_DN = os.getenv("BASE_DN", "DC=mhp,DC=net")
ADMIN_USERS = os.getenv("ADMIN_USERS", "mnp,k.dyatel").split(",")

def authenticate_user(username: str, password: str) -> Optional[Dict[str, str]]:
    if not username or not password:
        logger.warning("Пустые учётные данные")
        return None

    conn = None
    try:
        clean_username = username.split('\\')[-1].split('@')[0]
        
        # Инициализация подключения
        conn = ldap.initialize(LDAP_SERVER)
        conn.set_option(ldap.OPT_REFERRALS, 0)
        conn.set_option(ldap.OPT_NETWORK_TIMEOUT, 10.0)
        conn.set_option(ldap.OPT_TIMEOUT, 10.0)
        conn.protocol_version = ldap.VERSION3

        # Привязка с userPrincipalName
        user_principal_name = f"{clean_username}@{LDAP_DOMAIN}"
        logger.info(f"Попытка привязки с userPrincipalName: {user_principal_name}")
        conn.simple_bind_s(user_principal_name, password)

        # Поиск информации о пользователе по всему домену
        search_filter = f"(sAMAccountName={clean_username})"
        search_base = BASE_DN  # Используем только BASE_DN с SCOPE_SUBTREE
        logger.info(f"Поиск пользователя в: {search_base}")
        
        result = conn.search_s(
            search_base,
            ldap.SCOPE_SUBTREE,
            search_filter,
            ["displayName", "givenName", "sn", "mail"]
        )

        if not result:
            logger.warning(f"Информация о пользователе {clean_username} не найдена в {search_base}")
            return None

        # Извлечение атрибутов с обработкой кодировки
        attrs = result[0][1]
        try:
            full_name = (
                attrs.get("displayName", [""])[0].decode('utf-8-sig') or  # Используем utf-8-sig для кириллицы
                f"{attrs.get('givenName', [''])[0].decode('utf-8-sig') or ''} {attrs.get('sn', [''])[0].decode('utf-8-sig') or ''}".strip() or
                clean_username
            )
            email = attrs.get("mail", [""])[0].decode('utf-8-sig') if attrs.get("mail") else ""
        except UnicodeDecodeError as e:
            logger.error(f"Ошибка декодирования атрибутов для {clean_username}: {e}")
            full_name = clean_username
            email = ""

        logger.info(f"Успешная аутентификация: {clean_username} ({full_name})")
        return {
            "username": clean_username,
            "full_name": full_name,
            "email": email
        }

    except ldap.INVALID_CREDENTIALS:
        logger.warning(f"Неверные учётные данные для {username}")
        return None
    except ldap.NO_SUCH_OBJECT:
        logger.error(f"Ошибка поиска: неверный BASE_DN (current: {BASE_DN})")
        return None
    except ldap.SERVER_DOWN as e:
        logger.error(f"Сервер LDAP недоступен: {e}")
        return None
    except ldap.LDAPError as e:
        logger.error(f"Ошибка LDAP: {str(e)}", exc_info=True)
        return None
    except Exception as e:
        logger.error(f"Неожиданная ошибка при аутентификации: {str(e)}", exc_info=True)
        return None
    finally:
        if conn:
            try:
                conn.unbind()
            except ldap.LDAPError as e:
                logger.warning(f"Ошибка при закрытии соединения LDAP: {e}")

def get_user_role(username: str) -> str:
    if not username:
        logger.warning("Пустое имя пользователя при проверке роли")
        return "user"
    
    clean_username = username.split('\\')[-1].split('@')[0]
    role = "admin" if clean_username in ADMIN_USERS else "user"
    logger.info(f"Определена роль '{role}' для пользователя '{clean_username}'")
    return role