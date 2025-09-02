# services/ad_service.py
import logging
import os
import ssl
from typing import Optional, Dict, List
from ldap3 import Server, Connection, Tls, ALL, SUBTREE, SIMPLE
from ldap3.core.exceptions import LDAPException, LDAPInvalidCredentialsResult
import certifi
from dotenv import load_dotenv

# Загрузка переменных окружения
load_dotenv()

# Настройка логирования
logger = logging.getLogger(__name__)

# --- Настройки из .env ---
LDAP_SERVER = os.getenv("LDAP_SERVER", "ldaps://ns1.mhp.net:636")
BASE_DN = os.getenv("BASE_DN", "DC=mhp,DC=net")
LDAP_SEARCH_USER = os.getenv("LDAP_SEARCH_USER")  # Например, ServiceReader@mhp.net
LDAP_SEARCH_PASSWORD = os.getenv("LDAP_SEARCH_PASSWORD")
AD_DOMAIN = os.getenv("AD_DOMAIN", "mhp.net") # Для формирования UPN
LDAP_CA_CERT = os.getenv("LDAP_CA_CERT")
LDAP_VALIDATE_CERTS = os.getenv("LDAP_VALIDATE_CERTS", "true").lower() == "true"
LDAP_USE_SSL = os.getenv("LDAP_USE_SSL", "true").lower() == "true"
USER_CONTAINER = os.getenv("USER_CONTAINER", "CN=Users")
ADMIN_USERS_STR = os.getenv("ADMIN_USERS", "")
ADMIN_USERS = [user.strip().lower() for user in ADMIN_USERS_STR.split(",") if user.strip()]

def get_tls_config() -> Optional[Tls]:
    """Создание конфигурации TLS для LDAPS."""
    if not LDAP_USE_SSL:
        logger.debug("LDAPS не используется.")
        return None

    try:
        if LDAP_VALIDATE_CERTS:
            if LDAP_CA_CERT and os.path.exists(LDAP_CA_CERT):
                logger.debug(f"Используется CA сертификат: {LDAP_CA_CERT}")
                tls_config = Tls(
                    validate=ssl.CERT_REQUIRED,
                    version=ssl.PROTOCOL_TLSv1_2,
                    ca_certs_file=LDAP_CA_CERT
                )
            else:
                logger.warning("LDAP_CA_CERT не задан или файл не найден, используя certifi.")
                tls_config = Tls(
                    validate=ssl.CERT_REQUIRED,
                    version=ssl.PROTOCOL_TLSv1_2,
                    ca_certs_file=certifi.where() # Используем системные/пакетные сертификаты
                )
        else:
            logger.warning("Проверка сертификатов LDAPS отключена.")
            tls_config = Tls(
                validate=ssl.CERT_NONE,
                version=ssl.PROTOCOL_TLSv1_2
            )
        return tls_config
    except Exception as e:
        logger.error(f"Ошибка настройки TLS: {e}")
        # В случае ошибки настройки, попробуем без проверки (небезопасно)
        return Tls(validate=ssl.CERT_NONE, version=ssl.PROTOCOL_TLSv1_2)

def get_ad_connection(user: Optional[str] = None, password: Optional[str] = None) -> Connection:
    """
    Создание подключения к AD.
    Если user/password не указаны, используется LDAP_SEARCH_USER.
    """
    try:
        tls_config = get_tls_config()
        server = Server(LDAP_SERVER, use_ssl=LDAP_USE_SSL, get_info=ALL, tls=tls_config)
        
        bind_user = user or LDAP_SEARCH_USER
        bind_password = password or LDAP_SEARCH_PASSWORD

        # Определяем тип аутентификации
        auth_type = SIMPLE

        logger.debug(f"Попытка подключения к {LDAP_SERVER} как {bind_user}")
        conn = Connection(
            server,
            user=bind_user,
            password=bind_password,
            authentication=auth_type,
            auto_bind=True,
            receive_timeout=10,
            auto_referrals=False
        )
        logger.info(f"Успешное подключение к AD как {bind_user}")
        return conn
    except LDAPInvalidCredentialsResult:
        logger.warning(f"Неверные учетные данные для пользователя: {user or LDAP_SEARCH_USER}")
        raise
    except LDAPException as e:
        logger.error(f"Ошибка LDAP при подключении: {e}")
        raise
    except Exception as e:
        logger.error(f"Неизвестная ошибка при подключении к AD: {e}")
        raise

def authenticate_user(username: str, password: str) -> Optional[Dict[str, str]]:
    """
    Аутентификация пользователя в AD.
    Возвращает информацию о пользователе или None.
    """
    if not username or not password:
        logger.debug("Имя пользователя или пароль не предоставлены")
        return None

    # Формируем UPN для аутентификации
    # Предполагаем, что имя пользователя без домена
    user_principal = f"{username}@{AD_DOMAIN}"
    logger.debug(f"Попытка аутентификации пользователя: {user_principal}")

    conn = None
    try:
        # Подключаемся с учетными данными пользователя
        conn = get_ad_connection(user_principal, password)
        
        # Если подключение успешно, ищем детали пользователя
        # Используем то же соединение или открываем новое от имени сервиса?
        # Лучше открыть новое, чтобы не мешать сессии пользователя.
        # Но для простоты используем текущее соединение.
         
        # Экранируем имя пользователя для поиска (ldap3 делает это автоматически для фильтров)
        search_filter = f"(sAMAccountName={username})"
        logger.debug(f"Поиск пользователя с фильтром: {search_filter}")
        
        conn.search(
            search_base=BASE_DN,
            search_filter=search_filter,
            search_scope=SUBTREE,
            attributes=["displayName", "givenName", "sn", "mail", "department"]
        )
        
        if not conn.entries:
            logger.debug(f"Пользователь {username} не найден в AD после аутентификации")
            return None

        entry = conn.entries[0]
        logger.debug(f"Найдена запись пользователя: {entry.entry_dn}")

        # Извлекаем атрибуты
        attrs = entry.entry_attributes_as_dict
        
        given_name_list = attrs.get("givenName", [""])
        sn_list = attrs.get("sn", [""])
        display_name_list = attrs.get("displayName", [""])
        mail_list = attrs.get("mail", [""])
        department_list = attrs.get("department", [""])

        given_name = given_name_list[0] if given_name_list else ""
        sn = sn_list[0] if sn_list else ""
        display_name = display_name_list[0] if display_name_list else ""
        mail = mail_list[0] if mail_list else ""
        department = department_list[0] if department_list else ""

        full_name = display_name or f"{given_name} {sn}".strip() or username
        
        logger.info(f"Успешная аутентификация и получение данных для пользователя: {username}")
        return {
            "username": username,
            "full_name": full_name,
            "email": mail,
            "department": department
        }
    except LDAPInvalidCredentialsResult:
        logger.warning(f"Неверные учетные данные для пользователя (LDAP): {username}")
        return None
    except LDAPException as e:
        logger.error(f"Ошибка LDAP при аутентификации пользователя {username}: {e}")
        return None
    except Exception as e:
        logger.error(f"Неизвестная ошибка при аутентификации пользователя {username}: {e}", exc_info=True)
        return None
    finally:
        if conn and conn.bound:
            try:
                conn.unbind()
                logger.debug("Соединение LDAP закрыто после аутентификации.")
            except Exception as e:
                logger.warning(f"Ошибка при закрытии LDAP соединения: {e}")


def get_user_details(username: str) -> Optional[Dict[str, str]]:
    """Получение информации о пользователе из AD (от имени сервиса)."""
    conn = None
    try:
        if not LDAP_SEARCH_USER or not LDAP_SEARCH_PASSWORD:
             logger.error("Учетные данные для поиска (LDAP_SEARCH_USER/PASSWORD) не заданы.")
             return None

        conn = get_ad_connection() # Подключается от имени сервиса
        
        search_filter = f"(sAMAccountName={username})"
        logger.debug(f"Поиск деталей пользователя с фильтром: {search_filter}")
        
        conn.search(
            search_base=BASE_DN,
            search_filter=search_filter,
            search_scope=SUBTREE,
            attributes=["displayName", "mail", "department"]
        )
        
        if not conn.entries:
            logger.debug(f"Пользователь {username} не найден в AD при поиске деталей")
            return None

        entry = conn.entries[0]
        attrs = entry.entry_attributes_as_dict
        
        display_name_list = attrs.get("displayName", [""])
        mail_list = attrs.get("mail", [""])
        department_list = attrs.get("department", [""])

        display_name = display_name_list[0] if display_name_list else ""
        mail = mail_list[0] if mail_list else ""
        department = department_list[0] if department_list else ""
        
        full_name = display_name or username
        
        logger.debug(f"Получены детали для пользователя {username}")
        return {
            "username": username,
            "full_name": full_name,
            "email": mail,
            "department": department
        }
    except LDAPException as e:
        logger.error(f"Ошибка LDAP при получении деталей пользователя {username}: {e}")
        return None
    except Exception as e:
        logger.error(f"Неизвестная ошибка при получении деталей пользователя {username}: {e}", exc_info=True)
        return None
    finally:
        if conn and conn.bound:
            try:
                conn.unbind()
                logger.debug("Соединение LDAP закрыто после получения деталей.")
            except Exception as e:
                logger.warning(f"Ошибка при закрытии LDAP соединения: {e}")


def search_users(search_term: str = "", max_results: int = 50) -> List[Dict[str, str]]:
    """Поиск пользователей в AD (от имени сервиса)."""
    conn = None
    try:
        if not LDAP_SEARCH_USER or not LDAP_SEARCH_PASSWORD:
             logger.error("Учетные данные для поиска (LDAP_SEARCH_USER/PASSWORD) не заданы.")
             return []

        conn = get_ad_connection() # Подключается от имени сервиса
        
        if search_term:
            # ldap3 автоматически экранирует спецсимволы в фильтрах
            search_filter = f"(|(displayName=*{search_term}*)(sAMAccountName=*{search_term}*)(mail=*{search_term}*))" 
        else:
            search_filter = "(objectClass=user)"
        
        # Исключаем отключенные учетные записи
        search_filter = f"(&{search_filter}(!(userAccountControl:1.2.840.113556.1.4.803:=2)))"
        logger.debug(f"Поиск пользователей с фильтром: {search_filter}")
        
        conn.search(
            search_base=BASE_DN,
            search_filter=search_filter,
            search_scope=SUBTREE,
            attributes=["sAMAccountName", "displayName", "mail", "department"],
            size_limit=max_results # Ограничиваем количество результатов на стороне сервера
        )
        
        users = []
        for entry in conn.entries:
            attrs = entry.entry_attributes_as_dict
            
            # sAMAccountName обязателен
            sam_account_list = attrs.get("sAMAccountName")
            if not sam_account_list:
                continue
            username = sam_account_list[0]

            display_name_list = attrs.get("displayName", [""])
            mail_list = attrs.get("mail", [""])
            department_list = attrs.get("department", [""])

            display_name = display_name_list[0] if display_name_list else ""
            mail = mail_list[0] if mail_list else ""
            department = department_list[0] if department_list else ""
            
            full_name = display_name or username
            
            users.append({
                "username": username,
                "full_name": full_name,
                "email": mail,
                "department": department
            })
            
        logger.debug(f"Найдено {len(users)} пользователей")
        return users
    except LDAPException as e:
        logger.error(f"Ошибка LDAP при поиске пользователей: {e}")
        return []
    except Exception as e:
        logger.error(f"Неизвестная ошибка при поиске пользователей: {e}", exc_info=True)
        return []
    finally:
        if conn and conn.bound:
            try:
                conn.unbind()
                logger.debug("Соединение LDAP закрыто после поиска.")
            except Exception as e:
                logger.warning(f"Ошибка при закрытии LDAP соединения: {e}")


def get_user_role(username: str) -> str:
    """Определение роли пользователя."""
    normalized_username = username.strip().lower()
    role = "admin" if normalized_username in ADMIN_USERS else "user"
    logger.debug(f"Роль пользователя {username}: {role}")
    return role
