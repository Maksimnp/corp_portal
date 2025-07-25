# api/contacts.py
import logging
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional, Any
import ldap
import os
import re
from dotenv import load_dotenv
from services.jwt_utils import get_current_user
from pydantic import BaseModel

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Загрузка переменных окружения
load_dotenv()

# Роутер
router = APIRouter(tags=["contacts"])

# Настройки AD
LDAP_SERVER = os.getenv("LDAP_SERVER", "ldap://192.1.3.6:389")
BASE_DN = os.getenv("BASE_DN", "DC=mhp,DC=net")
LDAP_SEARCH_USER = os.getenv("LDAP_USER")
LDAP_SEARCH_PASSWORD = os.getenv("LDAP_PASSWORD")

# Модель контакта
class Contact(BaseModel):
    id: Optional[str] = None
    full_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone_internal: Optional[str] = None
    phone_city: Optional[str] = None
    phone_mobile: Optional[str] = None
    department: Optional[str] = None
    position: Optional[str] = None

def safe_decode_attr(attr_value: Any, attr_name: str = "") -> Optional[str]:
    if not attr_value:
        return None
    try:
        if isinstance(attr_value, bytes):
            for encoding in ['utf-8', 'utf-16-le', 'cp1251', 'iso-8859-1']:
                try:
                    return attr_value.decode(encoding)
                except UnicodeDecodeError:
                    continue
            logger.warning(f"Не удалось декодировать атрибут {attr_name}. Используется 'replace'.")
            return attr_value.decode('utf-8', errors='replace')
        return str(attr_value)
    except Exception as e:
        logger.error(f"Ошибка при преобразовании атрибута {attr_name} ({attr_value}): {e}")
        return str(attr_value) if attr_value else None

def get_ad_search_connection():
    if not LDAP_SEARCH_USER or not LDAP_SEARCH_PASSWORD:
        logger.error("Не настроены LDAP_USER и LDAP_PASSWORD")
        raise HTTPException(status_code=500, detail="Ошибка конфигурации LDAP")
    try:
        logger.debug(f"Инициализация подключения к LDAP: {LDAP_SERVER}")
        conn = ldap.initialize(LDAP_SERVER)
        conn.set_option(ldap.OPT_REFERRALS, 0)
        conn.set_option(ldap.OPT_NETWORK_TIMEOUT, 15.0)
        conn.set_option(ldap.OPT_TIMEOUT, 15.0)
        conn.protocol_version = ldap.VERSION3
        logger.info(f"Попытка привязки: {LDAP_SEARCH_USER}")
        conn.simple_bind_s(LDAP_SEARCH_USER, LDAP_SEARCH_PASSWORD)
        logger.info("Успешная привязка сервисной учетки")
        return conn
    except ldap.INVALID_CREDENTIALS as e:
        logger.error(f"Неверные учетные данные: {LDAP_SEARCH_USER}")
        raise HTTPException(status_code=500, detail="Ошибка аутентификации LDAP")
    except ldap.SERVER_DOWN as e:
        logger.error(f"Сервер LDAP недоступен: {e}")
        raise HTTPException(status_code=500, detail="Сервер LDAP недоступен")
    except Exception as e:
        logger.error(f"Ошибка подключения к LDAP: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Ошибка подключения к LDAP")

def escape_ldap_filter_chars(search_term: str) -> str:
    if not search_term:
        return ""
    # Экранируем специальные символы LDAP
    special_chars = r'([*()\\\x00])'
    def escape_match(match):
        return '\\' + match.group(1)
    return re.sub(special_chars, escape_match, search_term)

def normalize_phone_number(phone: Optional[str]) -> Optional[str]:
    if not phone:
        return None
    # Удаляем все нецифровые символы
    digits = re.sub(r'[^\d]', '', phone)
    if not digits:
        return None
    # Форматируем номер телефона
    if len(digits) == 4:  # Внутренний номер
        return digits
    elif len(digits) == 11:  # Мобильный номер
        return f"+{digits[0]} ({digits[1:4]}) {digits[4:7]}-{digits[7:9]}-{digits[9:11]}"
    elif len(digits) == 10:  # Городской номер
        return f"+7 ({digits[0:3]}) {digits[3:6]}-{digits[6:8]}-{digits[8:10]}"
    return phone

def search_ad_users(search_term: str = "", limit: int = 50) -> List[Contact]:
    logger.info(f"Начало поиска в AD. Запрос: '{search_term}', Лимит: {limit}")
    
    conn = get_ad_search_connection()
    
    try:
        # Базовый фильтр для активных пользователей
        base_filter = "(&(objectClass=user)(objectCategory=person)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))"
        
        # Формируем фильтр поиска
        if search_term and search_term.strip() != "*":
            escaped_term = escape_ldap_filter_chars(search_term.strip())
            search_filter = f"(&{base_filter}(|" \
                          f"(displayName=*{escaped_term}*)" \
                          f"(sAMAccountName=*{escaped_term}*)" \
                          f"(mail=*{escaped_term}*)" \
                          f"(telephoneNumber=*{escaped_term}*)" \
                          f"(otherTelephone=*{escaped_term}*)" \
                          f"(mobile=*{escaped_term}*)" \
                          f"(givenName=*{escaped_term}*)" \
                          f"(sn=*{escaped_term}*)))"
        else:
            search_filter = base_filter
        
        logger.debug(f"Используемый фильтр: {search_filter}")

        attributes = [
            'sAMAccountName', 'displayName', 'givenName', 'sn',
            'mail', 'telephoneNumber', 'department', 'title',
            'otherTelephone', 'mobile'
        ]

        logger.debug("Выполняем поиск в LDAP")
        result = conn.search_s(BASE_DN, ldap.SCOPE_SUBTREE, search_filter, attributes)
        logger.debug(f"Найдено записей: {len(result)}")

        users = []
        for i, (dn, attrs) in enumerate(result):
            if i >= limit:
                logger.debug(f"Достигнут лимит {limit}")
                break
            if not attrs:
                continue

            try:
                sam_account = safe_decode_attr(attrs.get('sAMAccountName', [None])[0])
                display_name = safe_decode_attr(attrs.get('displayName', [None])[0])
                given_name = safe_decode_attr(attrs.get('givenName', [None])[0])
                surname = safe_decode_attr(attrs.get('sn', [None])[0])
                mail = safe_decode_attr(attrs.get('mail', [None])[0])
                telephone = safe_decode_attr(attrs.get('telephoneNumber', [None])[0])
                other_phone = safe_decode_attr(attrs.get('otherTelephone', [None])[0])
                mobile = safe_decode_attr(attrs.get('mobile', [None])[0])
                department = safe_decode_attr(attrs.get('department', [None])[0])
                title = safe_decode_attr(attrs.get('title', [None])[0])

                full_name = display_name or f"{given_name or ''} {surname or ''}".strip()

                user_data = {
                    "id": sam_account,
                    "full_name": full_name,
                    "first_name": given_name,
                    "last_name": surname,
                    "email": mail,
                    "phone_internal": normalize_phone_number(telephone),
                    "phone_city": normalize_phone_number(other_phone),
                    "phone_mobile": normalize_phone_number(mobile),
                    "department": department,
                    "position": title,
                }

                if user_data["id"]:
                    users.append(Contact(**user_data))
            except Exception as e:
                logger.warning(f"Ошибка обработки записи {dn}: {e}", exc_info=True)
                continue

        logger.info(f"Поиск завершен. Найдено {len(users)} контактов")
        return users
    except ldap.LDAPError as e:
        logger.error(f"Ошибка LDAP: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Ошибка поиска в Active Directory")
    except Exception as e:
        logger.error(f"Неожиданная ошибка: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Внутренняя ошибка сервера")
    finally:
        try:
            if conn:
                conn.unbind()
        except Exception:
            pass

@router.get("/", response_model=List[Contact])
async def get_contacts(
    query: str = Query("", description="Поисковый запрос (имя, email, телефон и т.д.)", max_length=100),
    current_user: dict = Depends(get_current_user)
):
    try:
        logger.info(f"Запрос контактов с фильтром: '{query}'")
        contacts = search_ad_users(search_term=query, limit=50)
        return contacts
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка при обработке запроса: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Ошибка при получении контактов")