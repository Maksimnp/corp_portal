import logging
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional, Any
import ldap
import os
import re
from dotenv import load_dotenv
from services.jwt_utils import get_current_user
from pydantic import BaseModel, EmailStr, Field, model_validator, field_validator, ValidationError
from contextlib import contextmanager
import signal

# Настройка логирования
logging.basicConfig(level=logging.INFO if os.getenv("ENV") == "production" else logging.DEBUG)
logger = logging.getLogger(__name__)

# Загрузка переменных окружения
load_dotenv()

# Роутер
router = APIRouter(tags=["contacts"])

# Настройки AD
LDAP_SERVER = os.getenv("LDAP_SERVER", "ldaps://192.1.3.6:636")
BASE_DN = os.getenv("BASE_DN", "DC=mhp,DC=net")
LDAP_SEARCH_USER = os.getenv("LDAP_USER")
LDAP_SEARCH_PASSWORD = os.getenv("LDAP_PASSWORD")
AD_DOMAIN = os.getenv("AD_DOMAIN", "mhp.net")
USER_CONTAINER = os.getenv("USER_CONTAINER", "CN=Users")
LDAP_CA_CERT = os.getenv("LDAP_CA_CERT")

# Модель контакта
class Contact(BaseModel):
    id: Optional[str] = None
    full_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone_internal: Optional[str] = Field(None, pattern=r'^\d{4,}$|^(\+\d{1,3}\s?\(?[0-9]{3}\)?\s?[0-9]{3}-[0-9]{2}-[0-9]{1,2})$')
    phone_city: Optional[str] = Field(None, pattern=r'^\d{4,}$|^(\+\d{1,3}\s?\(?[0-9]{3}\)?\s?[0-9]{3}-[0-9]{2}-[0-9]{1,2})$')
    phone_mobile: Optional[str] = Field(None, pattern=r'^\d{4,}$|^(\+\d{1,3}\s?\(?[0-9]{3}\)?\s?[0-9]{3}-[0-9]{2}-[0-9]{1,2})$|^(\+\d{1,3}[0-9]{9})$')
    department: Optional[str] = None
    position: Optional[str] = None
    password: Optional[str] = None
    isFrozen: Optional[bool] = None
    groups: Optional[List[str]] = None
    sam_account_name: Optional[str] = None

    class Config:
        extra = "ignore"

    @model_validator(mode='after')
    def validate_phone_numbers(self) -> 'Contact':
        patterns = {
            'phone_internal': r'^\d{4,}$|^(\+\d{1,3}\s?\(?[0-9]{3}\)?\s?[0-9]{3}-[0-9]{2}-[0-9]{1,2})$',
            'phone_city': r'^\d{4,}$|^(\+\d{1,3}\s?\(?[0-9]{3}\)?\s?[0-9]{3}-[0-9]{2}-[0-9]{1,2})$',
            'phone_mobile': r'^\d{4,}$|^(\+\d{1,3}\s?\(?[0-9]{3}\)?\s?[0-9]{3}-[0-9]{2}-[0-9]{1,2})$|^(\+\d{1,3}[0-9]{9})$'
        }
        for field, pattern in patterns.items():
            value = getattr(self, field)
            if value and not re.match(pattern, value):
                setattr(self, field, None)
        return self

    @field_validator('first_name', 'last_name')
    @classmethod
    def validate_names(cls, v: str) -> str:
        if v and not re.match(r'^[A-Za-zА-Яа-яЁё\s\-]+$', v):
            raise ValueError("Имя и фамилия должны содержать только буквы, пробелы или дефисы")
        return v

    @field_validator('password')
    @classmethod
    def validate_password_field(cls, v: str) -> str:
        if v and not re.match(r'^[A-Za-z0-9!@#$%^&*(),.?":{}|<>]+$', v):
            raise ValueError("Пароль содержит недопустимые символы")
        return v

# Модель для PATCH-запроса (заморозка контакта)
class FreezeRequest(BaseModel):
    is_frozen: bool

    @field_validator('is_frozen')
    @classmethod
    def is_frozen_must_be_boolean(cls, v):
        if not isinstance(v, bool):
            raise ValueError("is_frozen должен быть булевым значением")
        return v

@contextmanager
def timeout(seconds):
    def signal_handler(signum, frame):
        raise TimeoutError("LDAP operation timed out")
    signal.signal(signal.SIGALRM, signal_handler)
    signal.alarm(seconds)
    try:
        yield
    finally:
        signal.alarm(0)
router.get("/groups", response_model=List[str])
async def get_groups_endpoint(current_user: dict = Depends(get_current_user)):
    logger.info("Обработка запроса на /contacts/groups")
    try:
        groups = get_all_groups()
        logger.debug(f"Возвращены группы: {groups}")
        return groups
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка в /groups: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Ошибка сервера при получении групп")
def safe_decode_attr(attr_value: Any, attr_name: str = "") -> Optional[str]:
    if not attr_value:
        return None
    try:
        if isinstance(attr_value, list) and attr_value:
            attr_value = attr_value[0]
        if isinstance(attr_value, bytes):
            for encoding in ['utf-8', 'utf-16-le', 'cp1251', 'iso-8859-1']:
                try:
                    return attr_value.decode(encoding)
                except UnicodeDecodeError:
                    continue
            logger.error(f"Не удалось декодировать атрибут {attr_name} с известными кодировками")
            return None
        return str(attr_value)
    except Exception as e:
        logger.error(f"Ошибка при преобразовании атрибута {attr_name} ({attr_value}): {e}")
        return None

def encode_password(password: str) -> bytes:
    """Кодирует пароль в формат unicodePwd для Active Directory."""
    if not password:
        return None
    quoted_password = f'"{password}"'.encode('utf-16-le')
    return quoted_password

def validate_password(password: str, first_name: str = "", last_name: str = "") -> bool:
    """Проверяет пароль на соответствие требованиям AD."""
    if len(password) < 8:
        return False
    if not re.search(r'[A-Z]', password):
        return False
    if not re.search(r'[0-9]', password):
        return False
    if not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
        return False
    if first_name and first_name.lower() in password.lower():
        return False
    if last_name and last_name.lower() in password.lower():
        return False
    return True

def get_ad_search_connection():
    if not LDAP_SEARCH_USER or not LDAP_SEARCH_PASSWORD:
        logger.error("Не настроены LDAP_USER и LDAP_PASSWORD")
        raise HTTPException(status_code=500, detail="Ошибка конфигурации LDAP")
    try:
        with timeout(15):
            conn = ldap.initialize(LDAP_SERVER)
            conn.set_option(ldap.OPT_REFERRALS, 0)
            conn.set_option(ldap.OPT_NETWORK_TIMEOUT, 15.0)
            conn.set_option(ldap.OPT_TIMEOUT, 15.0)
            conn.protocol_version = ldap.VERSION3
            if LDAP_SERVER.startswith("ldaps://"):
                if LDAP_CA_CERT and os.path.exists(LDAP_CA_CERT):
                    conn.set_option(ldap.OPT_X_TLS_CACERTFILE, LDAP_CA_CERT)
                    conn.set_option(ldap.OPT_X_TLS_REQUIRE_CERT, ldap.OPT_X_TLS_DEMAND)
                else:
                    logger.warning("LDAP_CA_CERT не указан или файл отсутствует, отключаем проверку сертификата")
                    conn.set_option(ldap.OPT_X_TLS_REQUIRE_CERT, ldap.OPT_X_TLS_NEVER)
            conn.simple_bind_s(LDAP_SEARCH_USER, LDAP_SEARCH_PASSWORD)
            conn.search_s(f"{USER_CONTAINER},{BASE_DN}", ldap.SCOPE_BASE, "(objectClass=container)")
            return conn
    except TimeoutError:
        logger.error("Превышен таймаут подключения к LDAP")
        raise HTTPException(status_code=500, detail="Таймаут подключения к LDAP")
    except ldap.INVALID_CREDENTIALS:
        logger.error(f"Неверные учетные данные: {LDAP_SEARCH_USER}")
        raise HTTPException(status_code=500, detail="Ошибка аутентификации LDAP")
    except ldap.SERVER_DOWN as e:
        logger.error(f"Сервер LDAP недоступен: {e}")
        raise HTTPException(status_code=500, detail=f"Сервер LDAP недоступен: {str(e)}")
    except ldap.LDAPError as e:
        logger.error(f"Ошибка LDAP: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка подключения к LDAP: {str(e)}")
    except Exception as e:
        logger.error(f"Неизвестная ошибка подключения к LDAP: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка подключения к LDAP: {str(e)}")

def escape_ldap_filter_chars(search_term: str) -> str:
    if not search_term or not search_term.strip():
        return ""
    search_term = search_term.strip()
    special_chars = r'([*()\\\x00])'
    def escape_match(match):
        return '\\' + match.group(1)
    return re.sub(special_chars, escape_match, search_term)

def normalize_phone_number(phone: Optional[str]) -> Optional[str]:
    if not phone:
        return None
    cleaned = re.sub(r'[^\d+]', '', phone)
    if not cleaned or cleaned.startswith('+') and len(cleaned) == 1:
        return None
    digits = re.sub(r'^\+?(\d+)', r'\1', cleaned)
    if not digits or len(digits) < 4:
        return None
    if re.match(r'^\+\d{1,3}\s*\(\d{3}\)\s*\d{3}-\d{2}-\d{1,2}$', phone):
        return phone
    if len(digits) == 4:
        return digits
    elif len(digits) == 10:
        return f"+7 ({digits[0:3]}) {digits[3:6]}-{digits[6:8]}-{digits[8:10]}"
    elif len(digits) == 11:
        return f"+{digits[0]} ({digits[1:4]}) {digits[4:7]}-{digits[7:9]}-{digits[9:11]}"
    elif len(digits) == 12 and digits.startswith('375'):
        return f"+375 ({digits[3:6]}) {digits[6:9]}-{digits[9:11]}-{digits[11:12]}"
    elif len(digits) == 12:
        return f"+{digits[0:3]} ({digits[3:6]}) {digits[6:9]}-{digits[9:11]}-{digits[11:12]}"
    return digits

def normalize_ldap_phone(phone: str) -> list:
    if not phone:
        return []
    digits = re.sub(r'[^\d]', '', phone)
    if not digits:
        return []
    if len(digits) == 4:
        return [digits]
    return [digits]

def search_ad_users(search_term: str = "", limit: int = 250) -> List[Contact]:
    logger.info(f"Начало поиска в AD. Запрос: '{search_term}', Лимит: {limit}")
    conn = get_ad_search_connection()
    try:
        base_filter = "(&(objectClass=user)(objectCategory=person)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))"
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
            'otherTelephone', 'mobile', 'userAccountControl', 'memberOf'
        ]
        with timeout(15):
            result = conn.search_s(BASE_DN, ldap.SCOPE_SUBTREE, search_filter, attributes)
        logger.debug(f"Найдено записей: {len(result)}")

        contacts = process_ldap_search_results(result[:limit])
        logger.info(f"Поиск завершен. Найдено {len(contacts)} контактов")
        return contacts
    except TimeoutError:
        logger.error("Превышен таймаут поиска LDAP")
        raise HTTPException(status_code=500, detail="Таймаут поиска в LDAP")
    except ldap.LDAPError as e:
        logger.error(f"Ошибка LDAP: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка поиска в Active Directory: {str(e)}")
    finally:
        try:
            conn.unbind()
        except Exception as e:
            logger.warning(f"Ошибка при отключении от LDAP: {e}")



def get_all_groups() -> List[str]:
    logger.info("Начало получения списка групп из AD")
    conn = get_ad_search_connection()
    try:
        search_filter = "(objectClass=group)"
        attributes = ['cn']
        with timeout(15):
            result = conn.search_s(BASE_DN, ldap.SCOPE_SUBTREE, search_filter, attributes)
        groups = set()
        for dn, attrs in result:
            if not isinstance(attrs, dict):
                continue
            cn = attrs.get('cn', [None])[0]
            if cn:
                cn = cn.decode('utf-8') if isinstance(cn, bytes) else cn
                if cn not in {'Guests'}:
                    groups.add(cn)
        logger.info(f"Получено групп: {len(groups)}")
        return sorted(list(groups))
    except Exception as e:
        logger.error(f"Ошибка при получении групп: {e}", exc_info=True)
        raise  
    finally:
        try:
            conn.unbind()
        except Exception as e:
            logger.warning(f"Ошибка при отключении от LDAP: {e}")
@router.get("/check-username")
async def check_username_unique(
    username: str = Query(..., description="sAMAccountName для проверки"),
    current_user: dict = Depends(get_current_user)
):
    conn = None
    try:
        conn = get_ad_search_connection()
        search_filter = f"(sAMAccountName={escape_ldap_filter_chars(username)})"
        with timeout(15):
            result = conn.search_s(BASE_DN, ldap.SCOPE_SUBTREE, search_filter)
        return {"available": not bool(result)}
    except TimeoutError:
        logger.error("Превышен таймаут проверки имени пользователя")
        raise HTTPException(status_code=500, detail="Таймаут проверки имени пользователя")
    except ldap.LDAPError as e:
        logger.error(f"Ошибка LDAP при проверке имени пользователя: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка проверки имени пользователя: {str(e)}")
    finally:
        if conn:
            try:
                conn.unbind()
            except Exception as e:
                logger.warning(f"Ошибка при отключении от LDAP: {e}")
def get_departments() -> List[str]:
    logger.info("Начало получения списка организационных подразделений и групп из AD")
    conn = get_ad_search_connection()
    try:
        departments = set()

        ou_filter = "(objectClass=organizationalUnit)"
        ou_attributes = ['ou']
        with timeout(15):
            result = conn.search_s(BASE_DN, ldap.SCOPE_SUBTREE, ou_filter, ou_attributes)
        
        for dn, attrs in result:
            if not attrs or not isinstance(attrs, dict):
                continue
            ou = safe_decode_attr(attrs.get('ou', [None])[0])
            if ou:
                departments.add(ou)

        group_filter = "(&(objectClass=group)(!(groupType:1.2.840.113556.1.4.803:=2147483648)))"
        group_attributes = ['cn']
        with timeout(15):
            result = conn.search_s(BASE_DN, ldap.SCOPE_SUBTREE, group_filter, group_attributes)
        
        builtin_groups = {'Users', 'Domain Users', 'Administrators', 'Guests'}
        for dn, attrs in result:
            if not attrs or not isinstance(attrs, dict):
                continue
            cn = safe_decode_attr(attrs.get('cn', [None])[0])
            if cn and cn not in builtin_groups:
                departments.add(cn)

        user_filter = "(objectClass=user)"
        user_attributes = ['department']
        with timeout(15):
            result = conn.search_s(BASE_DN, ldap.SCOPE_SUBTREE, user_filter, user_attributes)
        
        for dn, attrs in result:
            if not attrs or not isinstance(attrs, dict):
                continue
            dept = safe_decode_attr(attrs.get('department', [None])[0])
            if dept:
                departments.add(dept)

        logger.info(f"Получено организационных единиц: {len(departments)}")
        return sorted(list(departments))
    except TimeoutError:
        logger.error("Превышен таймаут получения подразделений LDAP")
        raise HTTPException(status_code=500, detail="Таймаут получения подразделений")
    except ldap.LDAPError as e:
        logger.error(f"Ошибка LDAP при получении подразделений: {e}", exc_info=True)
        return sorted([
            'АСУП', 'ТЭРиОВТ', 'Бухгалтерия', 'Отдел кадров',
            'Коммерческая служба', 'Отдел закупок', 'Юридический отдел',
            'Отдел труда и заработной платы', 'Отдел главного технолога'
        ])
    finally:
        try:
            conn.unbind()
        except Exception as e:
            logger.warning(f"Ошибка при отключении от LDAP: {e}")

@router.get("/departments", response_model=List[str])
async def get_departments_endpoint(current_user: dict = Depends(get_current_user)):
    logger.info("Обработка запроса на /contacts/departments")
    try:
        departments = get_departments()
        logger.info(f"Департаменты: {departments}")
        return departments
    except HTTPException as e:
        logger.error(f"HTTP ошибка в /departments: {e.detail}")
        raise
    except Exception as e:
        logger.error(f"Ошибка в /departments: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Ошибка сервера")

@router.get("/check-username")
async def check_username_unique(
    username: str = Query(..., description="sAMAccountName для проверки"),
    current_user: dict = Depends(get_current_user)
):
    conn = None
    try:
        conn = get_ad_search_connection()
        search_filter = f"(sAMAccountName={escape_ldap_filter_chars(username)})"
        with timeout(15):
            result = conn.search_s(BASE_DN, ldap.SCOPE_SUBTREE, search_filter)
        return {"available": not bool(result)}
    except TimeoutError:
        logger.error("Превышен таймаут проверки имени пользователя")
        raise HTTPException(status_code=500, detail="Таймаут проверки имени пользователя")
    except ldap.LDAPError as e:
        logger.error(f"Ошибка LDAP при проверке имени пользователя: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка проверки имени пользователя: {str(e)}")
    finally:
        if conn:
            try:
                conn.unbind()
            except Exception as e:
                logger.warning(f"Ошибка при отключении от LDAP: {e}")

@router.get("/{contact_id}", response_model=Contact)
async def get_contact(
    contact_id: str,
    current_user: dict = Depends(get_current_user)
):
    try:
        logger.info(f"Запрос контакта с ID: {contact_id}")
        contacts = search_ad_users(search_term=contact_id, limit=10)
        if not contacts:
            raise HTTPException(status_code=404, detail="Контакт не найден")
        return contacts[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка при получении контакта: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Ошибка при получении контакта")

@router.put("/{contact_id}", response_model=Contact)
async def update_contact(
    contact_id: str,
    contact_data: Contact,
    current_user: dict = Depends(get_current_user)
):
    conn = None
    try:
        logger.info(f"Обновление контакта {contact_id} с данными: {contact_data.dict(exclude_unset=True)}")
        
        if not current_user.get("isAdmin"):
            raise HTTPException(status_code=403, detail="Только администратор может обновлять контакты")
        
        conn = get_ad_search_connection()
        
        search_filter = f"(sAMAccountName={escape_ldap_filter_chars(contact_id)})"
        with timeout(15):
            result = conn.search_s(BASE_DN, ldap.SCOPE_SUBTREE, search_filter)
        
        if not result or not result[0][0]:
            raise HTTPException(status_code=404, detail="Контакт не найден в AD")
        
        dn = result[0][0]

        mod_attrs = []
        
        field_mapping = {
            'first_name': ('givenName', lambda x: [x.encode('utf-8')] if x else []),
            'last_name': ('sn', lambda x: [x.encode('utf-8')] if x else []),
            'email': ('mail', lambda x: [x.encode('utf-8')] if x else []),
            'phone_internal': ('telephoneNumber', lambda x: [p.encode('utf-8') for p in normalize_ldap_phone(x)]),
            'phone_city': ('otherTelephone', lambda x: [p.encode('utf-8') for p in normalize_ldap_phone(x)]),
            'phone_mobile': ('mobile', lambda x: [normalize_ldap_phone(x)[0].encode('utf-8')] if normalize_ldap_phone(x) else []),
            'department': ('department', lambda x: [x.encode('utf-8')] if x else []),
            'position': ('title', lambda x: [x.encode('utf-8')] if x else [])
        }
        
        if contact_data.groups is not None:
            current_groups = get_current_groups(conn, dn)
            group_changes = process_group_changes(conn, dn, current_groups, contact_data.groups)
            if group_changes:
                try:
                    with timeout(15):
                        for change in group_changes:
                            group_dn = change[2][0].decode('utf-8') if isinstance(change[2][0], bytes) else change[2][0]
                            conn.modify_s(group_dn, [change])
                except ldap.LDAPError as e:
                    logger.error(f"Ошибка обновления групп для {dn}: {e}")
                    raise HTTPException(status_code=500, detail=f"Ошибка обновления групп: {str(e)}")
        
        for field, (attr, transformer) in field_mapping.items():
            if field in contact_data.dict(exclude_unset=True):
                value = getattr(contact_data, field)
                transformed = transformer(value)
                if transformed:
                    mod_attrs.append((ldap.MOD_REPLACE, attr, transformed))
                else:
                    mod_attrs.append((ldap.MOD_REPLACE, attr, []))
        
        if contact_data.password:
            if not validate_password(contact_data.password, contact_data.first_name or "", contact_data.last_name or ""):
                logger.error("Пароль не соответствует требованиям политики безопасности AD")
                raise HTTPException(status_code=400, detail="Пароль должен быть не менее 8 символов, содержать заглавные буквы, цифры, специальные символы и не содержать имя или фамилию")
            try:
                with timeout(15):
                    conn.passwd_s(dn, None, encode_password(contact_data.password))
            except ldap.UNWILLING_TO_PERFORM as e:
                logger.error(f"Ошибка установки пароля для {dn}: {e}")
                raise HTTPException(status_code=500, detail="Сервер AD требует защищённое соединение для установки пароля")
        
        if not mod_attrs and not contact_data.password:
            raise HTTPException(status_code=400, detail="Нет данных для обновления")

        if mod_attrs:
            try:
                with timeout(15):
                    conn.modify_s(dn, mod_attrs)
            except ldap.LDAPError as e:
                logger.error(f"Ошибка LDAP при обновлении {dn}: {e}")
                raise HTTPException(status_code=500, detail=f"Ошибка обновления в AD: {str(e)}")
        logger.info(f"Контакт {contact_id} успешно обновлён в AD")
        
        return Contact(**{**contact_data.dict(exclude_unset=True), "id": contact_id})
    except TimeoutError:
        logger.error("Превышен таймаут обновления контакта")
        raise HTTPException(status_code=500, detail="Таймаут обновления в LDAP")
    except ldap.LDAPError as e:
        logger.error(f"Ошибка LDAP: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка обновления в AD: {str(e)}")
    finally:
        if conn:
            try:
                conn.unbind()
            except Exception as e:
                logger.warning(f"Ошибка при отключении от LDAP: {e}")

def get_current_groups(conn, user_dn: str) -> List[str]:
    try:
        search_filter = f"(member={escape_ldap_filter_chars(user_dn)})"
        with timeout(15):
            result = conn.search_s(
                BASE_DN,
                ldap.SCOPE_SUBTREE,
                search_filter,
                ['cn']
            )
        
        groups = []
        for entry in result:
            if isinstance(entry, tuple) and len(entry) == 2:
                dn, attrs = entry
                if isinstance(attrs, dict):
                    cn = safe_decode_attr(attrs.get('cn', [None])[0])
                    if cn:
                        groups.append(cn)
        return groups
    except TimeoutError:
        logger.error("Превышен таймаут получения групп пользователя")
        return []
    except ldap.LDAPError as e:
        logger.error(f"Ошибка получения групп пользователя: {e}", exc_info=True)
        return []

def process_group_changes(conn, user_dn: str, current_groups: List[str], new_groups: List[str]) -> list:
    changes = []
    current_set = set(current_groups)
    new_set = set(new_groups or [])
    
    for group in new_set - current_set:
        group_dn = find_group_dn(conn, group)
        if group_dn:
            try:
                members = get_group_members(conn, group_dn)
                if user_dn not in members:
                    changes.append((ldap.MOD_ADD, 'member', [user_dn.encode('utf-8')]))
            except ldap.LDAPError as e:
                logger.warning(f"Ошибка проверки членства в группе {group}: {e}")
    
    for group in current_set - new_set:
        group_dn = find_group_dn(conn, group)
        if group_dn:
            try:
                members = get_group_members(conn, group_dn)
                if user_dn in members:
                    changes.append((ldap.MOD_DELETE, 'member', [user_dn.encode('utf-8')]))
            except ldap.LDAPError as e:
                logger.warning(f"Ошибка проверки членства в группе {group}: {e}")
    
    return changes

def get_group_members(conn, group_dn: str) -> List[str]:
    try:
        with timeout(15):
            result = conn.search_s(
                group_dn,
                ldap.SCOPE_BASE,
                "(objectClass=group)",
                ['member']
            )
        if result and result[0][1]:
            return [safe_decode_attr(m) for m in result[0][1].get('member', [])]
        return []
    except TimeoutError:
        logger.error(f"Превышен таймаут получения членов группы {group_dn}")
        return []
    except ldap.LDAPError as e:
        logger.error(f"Ошибка получения членов группы {group_dn}: {e}")
        return []

def find_group_dn(conn, group_name: str) -> Optional[str]:
    try:
        search_filter = f"(&(objectClass=group)(cn={escape_ldap_filter_chars(group_name)}))"
        with timeout(15):
            result = conn.search_s(BASE_DN, ldap.SCOPE_SUBTREE, search_filter)
        return result[0][0] if result else None
    except TimeoutError:
        logger.error(f"Превышен таймаут поиска группы {group_name}")
        return None
    except ldap.LDAPError as e:
        logger.error(f"Ошибка поиска группы {group_name}: {e}")
        return None

@router.post("/", response_model=Contact)
async def create_contact(
    contact_data: Contact,
    current_user: dict = Depends(get_current_user)
):
    conn = None
    try:
        if not current_user.get("isAdmin"):
            raise HTTPException(status_code=403, detail="Только администратор может создавать контакты")
        
        if not contact_data.first_name or not contact_data.last_name or not contact_data.password or not contact_data.sam_account_name:
            raise HTTPException(status_code=400, detail="Требуются first_name, last_name, password и sam_account_name")
        
        if not validate_password(contact_data.password, contact_data.first_name or "", contact_data.last_name or ""):
            logger.error("Пароль не соответствует требованиям политики безопасности AD")
            raise HTTPException(status_code=400, detail="Пароль должен быть не менее 8 символов, содержать заглавные буквы, цифры, специальные символы и не содержать имя или фамилию")

        conn = get_ad_search_connection()
        
        # Проверка уникальности sAMAccountName
        search_filter = f"(sAMAccountName={escape_ldap_filter_chars(contact_data.sam_account_name)})"
        with timeout(15):
            result = conn.search_s(BASE_DN, ldap.SCOPE_SUBTREE, search_filter)
        if result:
            raise HTTPException(status_code=409, detail="Имя входа уже занято. Выберите другое.")

        full_name = contact_data.full_name or f"{contact_data.first_name} {contact_data.last_name}".strip()
        if not full_name:
            raise HTTPException(status_code=400, detail="Полное имя не может быть пустым")
        
        dn = f"CN={full_name},{USER_CONTAINER},{BASE_DN}"

        attrs = {
            'objectClass': [b'top', b'person', b'organizationalPerson', b'user'],
            'sAMAccountName': contact_data.sam_account_name.encode('utf-8'),
            'userPrincipalName': f"{contact_data.sam_account_name}@{AD_DOMAIN}".encode('utf-8'),
            'givenName': contact_data.first_name.encode('utf-8') if contact_data.first_name else None,
            'sn': contact_data.last_name.encode('utf-8') if contact_data.last_name else None,
            'displayName': full_name.encode('utf-8'),
            'cn': full_name.encode('utf-8'),
            'name': full_name.encode('utf-8'),
            'mail': contact_data.email.encode('utf-8') if contact_data.email else None,
            'telephoneNumber': normalize_ldap_phone(contact_data.phone_internal)[0].encode('utf-8') if contact_data.phone_internal else None,
            'department': contact_data.department.encode('utf-8') if contact_data.department else None,
            'title': contact_data.position.encode('utf-8') if contact_data.position else None,
            'userAccountControl': str(512).encode('utf-8')
        }
        
        attrs = {k: v for k, v in attrs.items() if v is not None}
        
        logger.debug(f"Создание пользователя с DN: {dn}, атрибуты: {attrs}")
        try:
            with timeout(15):
                conn.add_s(dn, list(attrs.items()))
        except ldap.LDAPError as e:
            logger.error(f"Ошибка LDAP при создании пользователя {dn}: {e}")
            raise HTTPException(status_code=500, detail=f"Ошибка создания пользователя в AD: {str(e)}")
        
        try:
            with timeout(15):
                conn.passwd_s(dn, None, encode_password(contact_data.password))
        except ldap.UNWILLING_TO_PERFORM as e:
            logger.error(f"Ошибка установки пароля для {dn}: {e}")
            try:
                conn.delete_s(dn)
            except Exception as cleanup_err:
                logger.warning(f"Не удалось удалить пользователя {dn} после ошибки: {cleanup_err}")
            raise HTTPException(status_code=500, detail="Сервер AD требует защищённое соединение для установки пароля")
        except ldap.LDAPError as e:
            logger.error(f"Ошибка LDAP при установке пароля для {dn}: {e}")
            try:
                conn.delete_s(dn)
            except Exception as cleanup_err:
                logger.warning(f"Не удалось удалить пользователя {dn} после ошибки: {cleanup_err}")
            raise HTTPException(status_code=500, detail=f"Ошибка установки пароля в AD: {str(e)}")
        
        valid_groups = []
        if contact_data.groups:
            for group in contact_data.groups:
                group_dn = find_group_dn(conn, group)
                if not group_dn:
                    logger.warning(f"Группа {group} не найдена в AD, пропускается")
                    continue
                try:
                    with timeout(15):
                        conn.modify_s(group_dn, [(ldap.MOD_ADD, 'member', [dn.encode('utf-8')])])
                    valid_groups.append(group)
                except ldap.LDAPError as e:
                    logger.warning(f"Ошибка добавления в группу {group}: {e}")
        
        logger.info(f"Создан новый пользователь в AD: {dn}, sAMAccountName: {contact_data.sam_account_name}")
        
        return Contact(
            id=contact_data.sam_account_name,
            full_name=full_name,
            first_name=contact_data.first_name,
            last_name=contact_data.last_name,
            email=contact_data.email,
            phone_internal=contact_data.phone_internal,
            phone_city=contact_data.phone_city,
            phone_mobile=contact_data.phone_mobile,
            department=contact_data.department,
            position=contact_data.position,
            isFrozen=False,
            groups=valid_groups
        )
    except TimeoutError:
        logger.error("Превышен таймаут создания контакта")
        raise HTTPException(status_code=500, detail="Таймаут создания в LDAP")
    except ldap.LDAPError as e:
        logger.error(f"Ошибка LDAP при создании: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка создания в AD: {str(e)}")
    finally:
        if conn:
            try:
                conn.unbind()
            except Exception as e:
                logger.warning(f"Ошибка при отключении от LDAP: {e}")
@router.patch("/{contact_id}")
async def freeze_contact(
    contact_id: str,
    freeze_request: FreezeRequest,
    current_user: dict = Depends(get_current_user)
):
    conn = None
    try:
        if not current_user.get("isAdmin"):
            raise HTTPException(status_code=403, detail="Только администратор может управлять заморозкой")
        
        conn = get_ad_search_connection()
        
        search_filter = f"(sAMAccountName={escape_ldap_filter_chars(contact_id)})"
        with timeout(15):
            result = conn.search_s(BASE_DN, ldap.SCOPE_SUBTREE, search_filter)
        
        if not result or not result[0][0]:
            raise HTTPException(status_code=404, detail="Контакт не найден в AD")
        
        dn = result[0][0]
        
        user_account_control = 514 if freeze_request.is_frozen else 512
        
        try:
            with timeout(15):
                conn.modify_s(dn, [(ldap.MOD_REPLACE, 'userAccountControl', [str(user_account_control).encode('utf-8')])])
        except ldap.LDAPError as e:
            logger.error(f"Ошибка LDAP при изменении статуса {dn}: {e}")
            raise HTTPException(status_code=500, detail=f"Ошибка изменения статуса в AD: {str(e)}")
        
        logger.info(f"Статус контакта {contact_id} изменён на {'заморожен' if freeze_request.is_frozen else 'активен'}")
        
        return {"status": "success", "isFrozen": freeze_request.is_frozen}
    except TimeoutError:
        logger.error("Превышен таймаут изменения статуса")
        raise HTTPException(status_code=500, detail="Таймаут изменения статуса в LDAP")
    except ldap.LDAPError as e:
        logger.error(f"Ошибка LDAP при изменении статуса: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка изменения статуса в AD: {str(e)}")
    finally:
        if conn:
            try:
                conn.unbind()
            except Exception as e:
                logger.warning(f"Ошибка при отключении от LDAP: {e}")

def process_ldap_search_results(ldap_results: list) -> List[Contact]:
    contacts = []
    for dn, attrs in ldap_results:
        if not attrs or not isinstance(attrs, dict):
            logger.warning(f"Пропущена пустая или некорректная запись для DN: {dn}")
            continue

        try:
            sam_account = safe_decode_attr(attrs.get('sAMAccountName', [None])[0])
            if not sam_account:
                logger.warning(f"Пропущена запись без sAMAccountName для DN: {dn}")
                continue

            display_name = safe_decode_attr(attrs.get('displayName', [None])[0])
            given_name = safe_decode_attr(attrs.get('givenName', [None])[0])
            surname = safe_decode_attr(attrs.get('sn', [None])[0])
            mail = safe_decode_attr(attrs.get('mail', [None])[0])
            telephone = safe_decode_attr(attrs.get('telephoneNumber', [None])[0])
            other_phone = safe_decode_attr(attrs.get('otherTelephone', [None])[0])
            mobile = safe_decode_attr(attrs.get('mobile', [None])[0])
            department = safe_decode_attr(attrs.get('department', [None])[0])
            title = safe_decode_attr(attrs.get('title', [None])[0])
            user_account_control = safe_decode_attr(attrs.get('userAccountControl', [None])[0])
            is_frozen = False
            if user_account_control:
                try:
                    is_frozen = int(user_account_control) & 2 == 2
                except (ValueError, TypeError):
                    logger.warning(f"Некорректное значение userAccountControl для DN: {dn}")
                    is_frozen = False

            groups = []
            member_of = attrs.get('memberOf', [])
            for group_dn in member_of:
                group_name = safe_decode_attr(group_dn)
                if group_name:
                    cn_match = re.match(r'CN=([^,]+)', group_name)
                    if cn_match:
                        groups.append(cn_match.group(1))

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
                "isFrozen": is_frozen,
                "groups": groups
            }

            if user_data["id"]:
                try:
                    contacts.append(Contact(**user_data))
                except ValidationError as e:
                    logger.warning(f"Ошибка обработки записи {dn}: {e.errors()}")
                    continue
        except Exception as e:
            logger.warning(f"Ошибка обработки записи {dn}: {e}")
            continue

    return contacts

@router.get("/", response_model=List[Contact])
async def get_contacts(
    query: str = Query("", description="Поисковый запрос (имя, email, телефон и т.д.)", max_length=100),
    department: Optional[str] = Query(None, description="Фильтр по департаменту"),
    current_user: dict = Depends(get_current_user)
):
    try:
        logger.info(f"Запрос контактов с фильтром: '{query}', department: '{department}'")
        
        base_filter = "(&(objectClass=user)(objectCategory=person))"
        
        if query and query.strip() != "*":
            escaped_term = escape_ldap_filter_chars(query.strip())
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
        
        if department:
            search_filter = f"(&{search_filter}(department={escape_ldap_filter_chars(department)}))"
        
        conn = get_ad_search_connection()
        attributes = [
            'sAMAccountName', 'displayName', 'givenName', 'sn', 'mail',
            'telephoneNumber', 'department', 'title', 'otherTelephone',
            'mobile', 'userAccountControl', 'memberOf'
        ]
        
        try:
            with timeout(15):
                result = conn.search_s(BASE_DN, ldap.SCOPE_SUBTREE, search_filter, attributes)
            contacts = process_ldap_search_results(result)
            logger.info(f"Найдено {len(contacts)} контактов")
            return contacts
        except ldap.LDAPError as e:
            logger.error(f"Ошибка LDAP при получении контактов: {e}")
            raise HTTPException(status_code=500, detail=f"Ошибка получения контактов: {str(e)}")
    except TimeoutError:
        logger.error("Превышен таймаут получения контактов")
        raise HTTPException(status_code=500, detail="Таймаут получения контактов")
    except Exception as e:
        logger.error(f"Ошибка при обработке запроса: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка при получении контактов: {str(e)}")
    finally:
        if conn:
            try:
                conn.unbind()
            except Exception as e:
                logger.warning(f"Ошибка при отключении от LDAP: {e}")