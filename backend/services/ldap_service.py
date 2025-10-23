import logging
import os
import ssl
from typing import Optional, Dict, List, Any
from ldap3 import Server, Connection, Tls, ALL, SUBTREE, SIMPLE, MODIFY_REPLACE  
from ldap3.core.exceptions import LDAPException, LDAPInvalidCredentialsResult
import certifi
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

LDAP_SERVER = os.getenv("LDAP_SERVER", "ldaps://ns1.mhp.net:636")
BASE_DN = os.getenv("BASE_DN", "DC=mhp,DC=net")
LDAP_SEARCH_USER = os.getenv("LDAP_SEARCH_USER")
LDAP_SEARCH_PASSWORD = os.getenv("LDAP_SEARCH_PASSWORD")
AD_DOMAIN = os.getenv("AD_DOMAIN", "mhp.net")
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
                    ca_certs_file=certifi.where()
                )
        else:
            logger.warning("Проверка сертификатов LDAPS отключена.")
            tls_config = Tls(
                validate=ssl.CERT_NONE,
                version=ssl.PROTOCOL_TLSv1_2
            )
        return tls_config
    except Exception as e:
        logger.error(f"Ошибка настройки TLS: {e}", exc_info=True)
        return Tls(validate=ssl.CERT_NONE, version=ssl.PROTOCOL_TLSv1_2)

def get_ad_connection(user: Optional[str] = None, password: Optional[str] = None) -> Connection:
    """
    Создание подключения к AD.
    Если user/password не указаны, используется LDAP_SEARCH_USER.
    """
    if not LDAP_SEARCH_USER or not LDAP_SEARCH_PASSWORD:
        logger.error("Учетные данные для поиска (LDAP_SEARCH_USER или LDAP_SEARCH_PASSWORD) не заданы")
        raise ValueError("LDAP_SEARCH_USER или LDAP_SEARCH_PASSWORD не заданы")

    try:
        tls_config = get_tls_config()
        server = Server(LDAP_SERVER, use_ssl=LDAP_USE_SSL, get_info=ALL, tls=tls_config)
        
        bind_user = user or LDAP_SEARCH_USER
        bind_password = password or LDAP_SEARCH_PASSWORD

        logger.debug(f"Попытка подключения к {LDAP_SERVER} как {bind_user}")
        conn = Connection(
            server,
            user=bind_user,
            password=bind_password,
            authentication=SIMPLE,
            auto_bind=True,
            receive_timeout=10,
            auto_referrals=False
        )
        logger.info(f"Успешное подключение к AD как {bind_user}")
        return conn
    except LDAPInvalidCredentialsResult:
        logger.error(f"Неверные учетные данные для пользователя: {bind_user}")
        raise
    except LDAPException as e:
        logger.error(f"Ошибка LDAP при подключении: {e}", exc_info=True)
        raise
    except Exception as e:
        logger.error(f"Неизвестная ошибка при подключении к AD: {e}", exc_info=True)
        raise

def authenticate_user(username: str, password: str) -> Optional[Dict[str, str]]:
    """
    Аутентификация пользователя в AD и получение его деталей.
    """
    if not username or not password:
        logger.debug("Имя пользователя или пароль не предоставлены")
        return None

    user_principal = f"{username}@{AD_DOMAIN}"
    logger.debug(f"Попытка аутентификации пользователя: {user_principal}")

    conn = None
    try:
        conn = get_ad_connection(user_principal, password)
        
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
        attrs = entry.entry_attributes_as_dict
        
        def safe_get_first(attr_dict, attr_name, default=""):
            """Безопасно получить первое значение атрибута из словаря атрибутов ldap3."""
            value_list = attr_dict.get(attr_name, [])
            if value_list and value_list[0] is not None:
                return str(value_list[0])
            return default

        given_name = safe_get_first(attrs, "givenName")
        sn = safe_get_first(attrs, "sn")
        display_name = safe_get_first(attrs, "displayName")
        mail = safe_get_first(attrs, "mail")
        department = safe_get_first(attrs, "department")

        full_name = display_name or f"{given_name} {sn}".strip() or username
        
        logger.info(f"Успешная аутентификация для пользователя: {username}")
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
        logger.error(f"Ошибка LDAP при аутентификации пользователя {username}: {e}", exc_info=True)
        return None
    except Exception as e:
        logger.error(f"Неизвестная ошибка при аутентификации пользователя {username}: {e}", exc_info=True)
        return None
    finally:
        if conn is not None and conn.bound:
            try:
                conn.unbind()
                logger.debug("Соединение LDAP закрыто после аутентификации.")
            except Exception as e:
                logger.warning(f"Ошибка при закрытии LDAP соединения: {e}")

def find_user_by_email(email: str) -> Optional[Dict[str, str]]:
    """
    Поиск пользователя в AD по email адресу.
    
    Args:
        email: Email адрес пользователя
        
    Returns:
        dict: Информация о пользователе или None если не найден
    """
    conn = None
    try:
        logger.info(f"Поиск пользователя по email: {email}")
        conn = get_ad_connection()
        
        # Пробуем разные атрибуты для поиска по email
        search_filters = [
            f"(&(objectClass=user)(mail={email}))",
            f"(&(objectClass=user)(userPrincipalName={email}))",
            f"(&(objectClass=user)(proxyAddresses=SMTP:{email}))",
            f"(&(objectClass=user)(proxyAddresses=smtp:{email}))"
        ]
        
        for search_filter in search_filters:
            try:
                logger.debug(f"Попытка поиска с фильтром: {search_filter}")
                conn.search(
                    search_base=BASE_DN,
                    search_filter=search_filter,
                    search_scope=SUBTREE,
                    attributes=["sAMAccountName", "displayName", "mail", "department", "userPrincipalName"]
                )
                
                if conn.entries:
                    entry = conn.entries[0]
                    attrs = entry.entry_attributes_as_dict
                    
                    username = attrs.get("sAMAccountName", [""])[0] if attrs.get("sAMAccountName") else ""
                    display_name = attrs.get("displayName", [""])[0] if attrs.get("displayName") else ""
                    mail = attrs.get("mail", [""])[0] if attrs.get("mail") else email
                    department = attrs.get("department", [""])[0] if attrs.get("department") else ""
                    
                    full_name = display_name or username
                    
                    user_info = {
                        "username": username,
                        "full_name": full_name,
                        "email": mail,
                        "department": department
                    }
                    
                    logger.info(f"Пользователь найден по email {email}: {username}")
                    return user_info
                    
            except Exception as filter_error:
                logger.warning(f"Ошибка поиска с фильтром {search_filter}: {filter_error}")
                continue
        
        logger.warning(f"Пользователь с email {email} не найден в AD")
        return None

    except Exception as e:
        logger.error(f"Ошибка поиска пользователя по email {email}: {str(e)}")
        return None
    finally:
        if conn and conn.bound:
            try:
                conn.unbind()
                logger.debug("Соединение LDAP закрыто после поиска по email.")
            except Exception as e:
                logger.warning(f"Ошибка при закрытии LDAP соединения: {e}")

def get_user_details(username: str) -> Optional[Dict[str, str]]:
    """Получение информации о пользователе из AD (от имени сервиса)."""
    conn = None
    try:
        if not LDAP_SEARCH_USER or not LDAP_SEARCH_PASSWORD:
            logger.error("Учетные данные для поиска (LDAP_SEARCH_USER или LDAP_SEARCH_PASSWORD) не заданы")
            return None

        conn = get_ad_connection()
        
        search_filter = f"(sAMAccountName={username})"
        logger.debug(f"Поиск деталей пользователя с фильтром: {search_filter}")
        
        conn.search(
            search_base=BASE_DN,
            search_filter=search_filter,
            search_scope=SUBTREE,
            attributes=["displayName", "mail", "department", "title", "company", "telephoneNumber"]
        )
        
        if not conn.entries:
            logger.debug(f"Пользователь {username} не найден в AD при поиске деталей")
            return None

        entry = conn.entries[0]
        attrs = entry.entry_attributes_as_dict
        
        def safe_get_attr(attr_name, default=""):
            value_list = attrs.get(attr_name, [])
            return str(value_list[0]) if value_list and value_list[0] else default

        display_name = safe_get_attr("displayName", username)
        mail = safe_get_attr("mail", f"{username}@minskhleb.by")
        department = safe_get_attr("department", "Не указан")
        title = safe_get_attr("title", "Не указана")
        company = safe_get_attr("company")
        phone = safe_get_attr("telephoneNumber")
        
        logger.debug(f"Получены детали для пользователя {username}")
        return {
            "username": username,
            "full_name": display_name,
            "email": mail,
            "department": department,
            "title": title,
            "company": company,
            "phone": phone
        }
    except LDAPException as e:
        logger.error(f"Ошибка LDAP при получении деталей пользователя {username}: {e}", exc_info=True)
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

def get_all_departments() -> List[str]:
    """Получение списка всех отделов из AD."""
    conn = None
    try:
        if not LDAP_SEARCH_USER or not LDAP_SEARCH_PASSWORD:
            logger.error("Учетные данные для поиска (LDAP_SEARCH_USER или LDAP_SEARCH_PASSWORD) не заданы")
            raise ValueError("LDAP_SEARCH_USER или LDAP_SEARCH_PASSWORD не заданы")

        conn = get_ad_connection()
        
        search_filter = "(&(objectClass=user)(department=*)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))"
        logger.debug(f"Поиск всех отделов с фильтром: {search_filter}")

        conn.search(
            search_base=BASE_DN,
            search_filter=search_filter,
            search_scope=SUBTREE,
            attributes=["department"],
            size_limit=0
        )

        if not conn.entries:
            logger.warning("Не найдено пользователей с атрибутом department в AD")
            return []

        departments_set = set()
        for entry in conn.entries:
            attrs = entry.entry_attributes_as_dict
            dept_list = attrs.get("department", [])
            if dept_list and dept_list[0] and str(dept_list[0]).strip():
                departments_set.add(str(dept_list[0]).strip())

        departments_list = sorted(list(departments_set))
        logger.info(f"Найдено {len(departments_list)} уникальных отделов: {departments_list}")
        return departments_list
    except ValueError as e:
        logger.error(f"Ошибка конфигурации LDAP: {e}", exc_info=True)
        return []
    except LDAPException as e:
        logger.error(f"Ошибка LDAP при получении списка отделов: {e}", exc_info=True)
        return []
    except Exception as e:
        logger.error(f"Неизвестная ошибка при получении списка отделов: {e}", exc_info=True)
        return []
    finally:
        if conn and conn.bound:
            try:
                conn.unbind()
                logger.debug("Соединение LDAP закрыто после получения списка отделов.")
            except Exception as e:
                logger.warning(f"Ошибка при закрытии LDAP соединения: {e}")

def search_users(search_term: str = "", max_results: int = 100) -> List[Dict[str, Any]]:
    """Поиск пользователей в AD для админ-панели."""
    conn = None
    try:
        if not LDAP_SEARCH_USER or not LDAP_SEARCH_PASSWORD:
            logger.error("Учетные данные для поиска (LDAP_SEARCH_USER или LDAP_SEARCH_PASSWORD) не заданы")
            return []

        conn = get_ad_connection()
        
        # Базовый фильтр для активных пользователей
        base_filter = "(&(objectClass=user)(objectCategory=person)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))"
        
        if search_term:
            search_filter = f"(&{base_filter}(|(displayName=*{search_term}*)(sAMAccountName=*{search_term}*)(mail=*{search_term}*)(givenName=*{search_term}*)(sn=*{search_term}*)))"
        else:
            search_filter = base_filter
        
        logger.info(f"Поиск пользователей в AD: '{search_term}', лимит: {max_results}")
        
        attributes = [
            "sAMAccountName", "displayName", "mail", "department", 
            "title", "company", "telephoneNumber", "mobile",
            "physicalDeliveryOfficeName"
        ]
        
        conn.search(
            search_base=BASE_DN,
            search_filter=search_filter,
            search_scope=SUBTREE,
            attributes=attributes,
            size_limit=max_results
        )
        
        users = []
        for entry in conn.entries:
            attrs = entry.entry_attributes_as_dict
            
            sam_account_list = attrs.get("sAMAccountName")
            if not sam_account_list:
                continue
                
            username = sam_account_list[0]

            # Безопасное извлечение атрибутов
            def safe_get_attr(attr_name, default=""):
                value_list = attrs.get(attr_name, [])
                return str(value_list[0]) if value_list and value_list[0] else default

            display_name = safe_get_attr("displayName", username)
            mail = safe_get_attr("mail", f"{username}@minskhleb.by")
            department = safe_get_attr("department", "Не указан")
            title = safe_get_attr("title", "Не указана")
            company = safe_get_attr("company")
            phone = safe_get_attr("telephoneNumber")
            mobile = safe_get_attr("mobile")
            office = safe_get_attr("physicalDeliveryOfficeName")
            
            user_data = {
                "username": username,
                "display_name": display_name,
                "email": mail,
                "department": department,
                "title": title,
                "company": company,
                "phone": phone,
                "mobile": mobile,
                "office": office
            }
            
            # Убираем пустые значения
            user_data = {k: v for k, v in user_data.items() if v}
            
            users.append(user_data)
            
        logger.info(f"Найдено {len(users)} пользователей в AD")
        return users
        
    except Exception as e:
        logger.error(f"Ошибка поиска пользователей в AD: {str(e)}")
        return []
    finally:
        if conn and conn.bound:
            try:
                conn.unbind()
                logger.debug("Соединение LDAP закрыто после поиска пользователей.")
            except Exception as e:
                logger.warning(f"Ошибка при закрытии LDAP соединения: {e}")

def change_user_password(username: str, new_password: str) -> bool:
    """
    Изменяет пароль пользователя в Active Directory.
    
    Args:
        username: Имя пользователя
        new_password: Новый пароль
        
    Returns:
        bool: True если пароль успешно изменен, False в случае ошибки
    """
    conn = None
    try:
        logger.info(f"Попытка изменения пароля для пользователя: {username}")
        
        # Для изменения пароля нужен административный доступ
        # Используем сервисного пользователя с правами на изменение паролей
        conn = get_ad_connection()
        
        # Сначала находим DN пользователя
        search_filter = f"(sAMAccountName={username})"
        conn.search(
            search_base=BASE_DN,
            search_filter=search_filter,
            search_scope=SUBTREE,
            attributes=["distinguishedName", "userAccountControl"]
        )
        
        if not conn.entries:
            logger.error(f"Пользователь {username} не найден для изменения пароля")
            return False
            
        user_dn = conn.entries[0].distinguishedName.value
        logger.info(f"Найден DN пользователя: {user_dn}")
        
        # Формируем новое значение пароля в правильном формате
        # Пароль должен быть в Unicode с префиксом
        unicode_password = f'"{new_password}"'.encode('utf-16-le')
        
        # Изменение пароля
        changes = {
            'unicodePwd': [(MODIFY_REPLACE, [unicode_password])]
        }
        
        success = conn.modify(user_dn, changes)
        
        if success:
            logger.info(f"Пароль успешно изменен для пользователя {username}")
            return True
        else:
            logger.error(f"Не удалось изменить пароль для пользователя {username}")
            logger.error(f"Результат LDAP: {conn.result}")
            return False
            
    except Exception as e:
        logger.error(f"Ошибка при изменении пароля для {username}: {str(e)}")
        return False
    finally:
        if conn and conn.bound:
            try:
                conn.unbind()
                logger.debug("Соединение LDAP закрыто после изменения пароля.")
            except Exception as e:
                logger.warning(f"Ошибка при закрытии LDAP соединения: {e}")

def get_user_role(username: str) -> str:
    """Определение роли пользователя."""
    if not username:
        logger.warning("Пустое имя пользователя при определении роли")
        return "user"
    normalized_username = username.strip().lower()
    role = "admin" if normalized_username in ADMIN_USERS else "user"
    logger.debug(f"Роль пользователя {username}: {role}")
    return role

# Экспортируем функции для использования в других модулях
__all__ = [
    'get_ad_connection',
    'authenticate_user', 
    'find_user_by_email',
    'get_user_details',
    'get_all_departments',
    'search_users',
    'change_user_password',
    'get_user_role'
]