import logging
import re
import os
from typing import List, Optional, Any
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, EmailStr, Field, ValidationError, model_validator, field_validator
from ldap3 import Server, Connection, NTLM, Tls, ALL, SUBTREE, MODIFY_REPLACE, MODIFY_ADD, MODIFY_DELETE, SIMPLE
from ldap3.core.exceptions import LDAPBindError, LDAPSocketOpenError, LDAPStartTLSError
import ssl
import certifi
from dotenv import load_dotenv
from contextlib import contextmanager
import signal
import time
import socket
from services.jwt_utils import get_current_user

# Логирование
logging.basicConfig(
    level=logging.INFO if os.getenv("ENV") == "production" else logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s',
    filename='contacts_api.log',
    filemode='a'
)
logger = logging.getLogger(__name__)

load_dotenv()
router = APIRouter(tags=["contacts"])

# Настройки
LDAP_SERVER = os.getenv("LDAP_SERVER", "ldaps://ns1.mhp.net:636")
BASE_DN = os.getenv("BASE_DN", "DC=mhp,DC=net")
LDAP_USER = os.getenv("LDAP_USER", "ServiceReader") 
LDAP_PASSWORD = os.getenv("LDAP_PASSWORD", "Season24")
AD_DOMAIN = str(os.getenv("AD_DOMAIN", "")).split('.')[0].upper()
LDAP_CA_CERT = os.getenv("LDAP_CA_CERT")
LDAP_VALIDATE_CERTS = os.getenv("LDAP_VALIDATE_CERTS", "true").lower() == "true"
LDAP_USE_SSL = os.getenv("LDAP_USE_SSL", "true").lower() == "true"
LDAP_CONNECTION_RETRIES = int(os.getenv("LDAP_CONNECTION_RETRIES", 3))
LDAP_RETRY_DELAY = float(os.getenv("LDAP_RETRY_DELAY", 1.0))
USER_CONTAINER = os.getenv("USER_CONTAINER", "CN=Users")
LDAP_SEARCH_USER = os.getenv("LDAP_SEARCH_USER", "mhp\\ServiceReader")
LDAP_SEARCH_PASSWORD = os.getenv("LDAP_SEARCH_PASSWORD", "Season24")

full_user = rf"{AD_DOMAIN}\{LDAP_USER}"

class OUDetail(BaseModel):
    name: str
    dn: str

def get_ad_connection():
    if not LDAP_USER or not LDAP_PASSWORD or not AD_DOMAIN:
        logger.error("LDAP_USER, LDAP_PASSWORD или AD_DOMAIN не заданы")
        raise HTTPException(status_code=500, detail="Ошибка конфигурации LDAP")

    logger.debug(f"Попытка подключения к {LDAP_SERVER} как {full_user!r}")

    tls_cfg = None
    if LDAP_USE_SSL:
        tls_cfg = Tls(
            ca_certs_file=LDAP_CA_CERT or certifi.where(),
            validate=ssl.CERT_REQUIRED if LDAP_VALIDATE_CERTS else ssl.CERT_NONE,
            version=ssl.PROTOCOL_TLSv1_2
        )
    server = Server(LDAP_SERVER, use_ssl=LDAP_USE_SSL, get_info=ALL, tls=tls_cfg)

    for attempt in range(1, LDAP_CONNECTION_RETRIES + 1):
        try:
            conn = Connection(
                server,
                user=full_user,
                password=LDAP_PASSWORD,
                authentication=SIMPLE,
                auto_bind=True
            )
            logger.info(f"Успешная привязка к LDAP (NTLM) на попытке {attempt}")
            yield conn
            conn.unbind()
            return
        except LDAPBindError as e:
            logger.error(f"[{attempt}] Ошибка аутентификации NTLM: {e}")
        except (LDAPSocketOpenError, LDAPStartTLSError) as e:
            logger.error(f"[{attempt}] Ошибка соединения/TLS: {e}")
        except Exception as e:
            logger.error(f"[{attempt}] Общая ошибка LDAP-подключения: {e}")
        time.sleep(LDAP_RETRY_DELAY)

    logger.critical("Не удалось подключиться к LDAP после нескольких попыток")
    raise HTTPException(status_code=500, detail="LDAP bind (NTLM) не удался")
# Проверка сертификата
def validate_ca_cert() -> None:
    """Проверка существования и валидности файла сертификата."""
    if not LDAP_VALIDATE_CERTS or not LDAP_USE_SSL:
        logger.warning("Проверка сертификатов отключена или используется LDAP без SSL")
        return
    if not LDAP_CA_CERT:
        logger.critical("Переменная LDAP_CA_CERT не задана")
        raise HTTPException(status_code=500, detail="Переменная LDAP_CA_CERT не задана")
    if not os.path.isfile(LDAP_CA_CERT):
        logger.critical(f"Файл сертификата {LDAP_CA_CERT} не найден")
        raise HTTPException(status_code=500, detail=f"Файл сертификата {LDAP_CA_CERT} не найден")
    try:
        with open(LDAP_CA_CERT, 'r') as f:
            cert_data = f.read()
        if not cert_data.startswith("-----BEGIN CERTIFICATE-----"):
            logger.critical(f"Файл {LDAP_CA_CERT} не является валидным PEM-сертификатом")
            raise HTTPException(status_code=500, detail="Файл сертификата не в формате PEM")
        logger.debug(f"Файл сертификата {LDAP_CA_CERT} успешно проверен")
    except Exception as e:
        logger.critical(f"Ошибка чтения файла сертификата {LDAP_CA_CERT}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Ошибка чтения сертификата: {str(e)}")

# Проверка доступности сервера
def validate_ldap_server_address(hostname: str, port: int) -> List[str]:
    """Проверка доступности IP-адресов для хоста LDAP."""
    try:
        logger.debug(f"Проверка доступности сервера {hostname}:{port}")
        ip_addresses = [addr[4][0] for addr in socket.getaddrinfo(hostname, port, socket.AF_INET, socket.SOCK_STREAM)]
        logger.debug(f"DNS-разрешение для {hostname}:{port}: {ip_addresses}")
        valid_ips = []
        
        for ip in ip_addresses:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(2)
            try:
                result = sock.connect_ex((ip, port))
                if result != 0:
                    logger.warning(f"IP {ip}:{port} недоступен, код ошибки: {result}")
                    continue
                if LDAP_USE_SSL and LDAP_VALIDATE_CERTS:
                    context = ssl.SSLContext(ssl.PROTOCOL_TLSv1_2)
                    context.verify_mode = ssl.CERT_REQUIRED
                    context.load_verify_locations(cafile=LDAP_CA_CERT or certifi.where())
                    ssl_sock = context.wrap_socket(socket.socket(socket.AF_INET), server_hostname=hostname)
                    ssl_sock.settimeout(2)
                    ssl_sock.connect((ip, port))
                    ssl_sock.close()
                    logger.debug(f"Сертификат для {ip}:{port} (имя хоста: {hostname}) успешно проверен")
                valid_ips.append(ip)
            except ssl.SSLError as e:
                logger.warning(f"Ошибка SSL для {ip}:{port}: {str(e)}")
            except Exception as e:
                logger.warning(f"Ошибка проверки IP {ip}:{port}: {str(e)}")
            finally:
                sock.close()
        
        if not valid_ips:
            logger.error(f"Ни один IP для {hostname}:{port} не доступен")
            raise HTTPException(status_code=500, detail=f"Ни один IP для {hostname}:{port} не доступен")
        return valid_ips
    except socket.gaierror as e:
        logger.error(f"Ошибка разрешения DNS для {hostname}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Ошибка разрешения DNS: {str(e)}")

# Модель контакта
class Contact(BaseModel):
    id: Optional[str] = None
    displayName: Optional[str] = None
    email: Optional[EmailStr] = None
    organizational_unit: Optional[str] = Field(None)
    phone_internal: Optional[str] = Field(None, pattern=r'^\d{4,}$|^(\+\d{1,3}\s?\(?[0-9]{3}\)?\s?[0-9]{3}-[0-9]{2}-[0-9]{1,2})$')
    phone_city: Optional[str] = Field(None, pattern=r'^\d{4,}$|^(\+\d{1,3}\s?\(?[0-9]{3}\)?\s?[0-9]{3}-[0-9]{2}-[0-9]{1,2})$')
    phone_mobile: Optional[str] = Field(None, pattern=r'^\d{4,}$|^(\+\d{1,3}\s?\(?[0-9]{2,3}\)?\s?[0-9]{3}-[0-9]{2}-[0-9]{1,2})$|^(\+\d{1,3}[0-9]{9})$')
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
            'phone_mobile': r'^\d{4,}$|^(\+\d{1,3}\s?\(?[0-9]{2,3}\)?\s?[0-9]{3}-[0-9]{2}-[0-9]{1,2})$|^(\+\d{1,3}[0-9]{9})$'
        }
        for field, pattern in patterns.items():
            value = getattr(self, field)
            if value and not re.match(pattern, value):
                setattr(self, field, None)
        return self

    @field_validator('organizational_unit')
    @classmethod
    def validate_ou(cls, v):
        if v and not v.upper().startswith("OU="):
            raise ValueError("Путь OU должен начинаться с 'OU='")
        return v

    @field_validator('displayName')
    @classmethod
    def validate_display_name(cls, v: str) -> str:
        # Разрешаем буквы, пробелы, дефисы, точки и подчеркивания
        if v and not re.fullmatch(r'[a-zA-Zа-яА-ЯёЁ0-9\s\.\-_()]+', v):
            # re.fullmatch требует совпадения всей строки
            raise ValueError("Отображаемое имя должно содержать только буквы, цифры, пробелы, точки, дефисы, подчеркивания и скобки")
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
    """Контекстный менеджер для установки таймаута операций."""
    def signal_handler(signum, frame):
        raise TimeoutError("LDAP operation timed out")
    signal.signal(signal.SIGALRM, signal_handler)
    signal.alarm(seconds)
    try:
        yield
    finally:
        signal.alarm(0)

def safe_decode_attr(attr_value: Any, attr_name: str = "") -> Optional[str]:
    """Безопасное декодирование атрибута LDAP."""
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
            logger.error(f"Не удалось декодировать атрибут {attr_name}")
            return None
        return str(attr_value)
    except Exception as e:
        logger.error(f"Ошибка при преобразовании атрибута {attr_name}: {e}")
        return None

def encode_password(password: str) -> bytes:
    """Кодирование пароля для Active Directory."""
    if not isinstance(password, str) or not password:
        raise ValueError("Пароль должен быть непустой строкой")
    quoted_password = f'"{password}"'
    return quoted_password.encode('utf-16-le')

def validate_password(password: str, display_name: str = "") -> bool:
    """Проверка пароля на соответствие политике AD."""
    if len(password) < 8 or not re.search(r'[A-Z]', password) or \
       not re.search(r'[0-9]', password) or not re.search(r'[!@#$%^&*(),.?":{}|<>]', password) or \
       (display_name and display_name.lower() in password.lower()):
        return False
    return True

def normalize_phone_number(phone: Optional[str]) -> Optional[str]:
    """Нормализация телефонного номера."""
    if not phone:
        return None
    cleaned = re.sub(r'[^\d+]', '', phone)
    if not cleaned or cleaned.startswith('+') and len(cleaned) == 1:
        return None
    digits = re.sub(r'^\+?(\d+)', r'\1', cleaned)
    if not digits or len(digits) < 4:
        return None
    if re.match(r'^\+\d{1,3}\s*\(\d{2,3}\)\s*\d{3}-\d{2}-\d{1,2}$', phone):
        return phone
    if len(digits) == 4:
        return digits
    elif len(digits) == 12 and digits.startswith('375'):
        return f"+375 ({digits[3:6]}) {digits[6:9]}-{digits[9:11]}-{digits[11:12]}"
    elif len(digits) == 12:
        return f"+{digits[0:3]} ({digits[3:6]}) {digits[6:9]}-{digits[9:11]}-{digits[11:12]}"
    return digits

def normalize_ldap_phone(phone: str) -> list:
    """Нормализация телефона для LDAP."""
    if not phone:
        return []
    digits = re.sub(r'[^\d]', '', phone)
    if not digits:
        return []
    if len(digits) <= 4:
        return [digits]
    return [normalize_phone_number(phone) or digits]

@contextmanager
def get_ad_connection():
    """Создание защищённого соединения с Active Directory."""
    if not LDAP_SEARCH_USER or not LDAP_SEARCH_PASSWORD:
        logger.error("Не настроены LDAP_SEARCH_USER и LDAP_SEARCH_PASSWORD")
        raise HTTPException(status_code=500, detail="Ошибка конфигурации LDAP")
    
    logger.debug(f"Конфигурация LDAP: server={LDAP_SERVER}, user={LDAP_SEARCH_USER}, use_ssl={LDAP_USE_SSL}, validate_certs={LDAP_VALIDATE_CERTS}, ca_cert={LDAP_CA_CERT}")
    
    if LDAP_USE_SSL and LDAP_VALIDATE_CERTS:
        validate_ca_cert()

    hostname = LDAP_SERVER.replace("ldaps://", "").replace("ldap://", "").split(":")[0]
    port = int(LDAP_SERVER.split(":")[-1]) if ":" in LDAP_SERVER else (636 if LDAP_USE_SSL else 389)
    valid_ips = validate_ldap_server_address(hostname, port)
    
    tls_config = None
    if LDAP_USE_SSL and LDAP_VALIDATE_CERTS:
        try:
            tls_config = Tls(
                validate=ssl.CERT_REQUIRED,
                version=ssl.PROTOCOL_TLSv1_2,
                ca_certs_file=LDAP_CA_CERT or certifi.where(),
                ciphers='ALL:@SECLEVEL=2'
            )
            logger.debug("TLS настроен с проверкой сертификатов")
        except Exception as e:
            logger.error(f"Ошибка настройки TLS: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Ошибка настройки TLS: {str(e)}")
    elif LDAP_USE_SSL:
        tls_config = Tls(validate=ssl.CERT_NONE, version=ssl.PROTOCOL_TLSv1_2)
        logger.warning("TLS используется без проверки сертификатов")

    server_url = LDAP_SERVER
    server = Server(server_url, use_ssl=LDAP_USE_SSL, get_info=ALL, tls=tls_config)
    
    for attempt in range(LDAP_CONNECTION_RETRIES):
        try:
            logger.debug(f"Попытка подключения к {server_url}, попытка {attempt + 1}/{LDAP_CONNECTION_RETRIES}")
            with Connection(
                server,
                user=LDAP_SEARCH_USER,
                password=LDAP_SEARCH_PASSWORD,
                authentication=SIMPLE,
                auto_bind=True
            ) as conn:
                logger.info(f"Успешное подключение к {server_url}")
                yield conn
            return
        except LDAPBindError as e:
            logger.error(f"Ошибка аутентификации LDAP для {server_url}: {str(e)}")
            if attempt == LDAP_CONNECTION_RETRIES - 1:
                raise HTTPException(status_code=500, detail=f"Ошибка аутентификации LDAP: {str(e)}")
        except LDAPSocketOpenError as e:
            logger.error(f"Ошибка соединения с LDAP-сервером {server_url}: {str(e)}")
            if attempt == LDAP_CONNECTION_RETRIES - 1:
                raise HTTPException(status_code=500, detail=f"Ошибка соединения с LDAP: {str(e)}")
        except LDAPStartTLSError as e:
            logger.error(f"Ошибка TLS при подключении к {server_url}: {str(e)}")
            if attempt == LDAP_CONNECTION_RETRIES - 1:
                raise HTTPException(status_code=500, detail=f"Ошибка TLS: {str(e)}")
        except Exception as e:
            logger.error(f"Общая ошибка при подключении к {server_url}: {str(e)}")
            if attempt == LDAP_CONNECTION_RETRIES - 1:
                raise HTTPException(status_code=500, detail=f"Ошибка подключения к LDAP: {str(e)}")
        time.sleep(LDAP_RETRY_DELAY)
    logger.error(f"Не удалось подключиться к LDAP после {LDAP_CONNECTION_RETRIES} попыток")
    raise HTTPException(status_code=500, detail="Не удалось установить соединение с LDAP после нескольких попыток")

def escape_ldap_filter_chars(search_term: str) -> str:
    """Экранирование специальных символов для LDAP-фильтров."""
    if not search_term or not search_term.strip():
        return ""
    search_term = search_term.strip()
    special_chars = r'([*()\\\x00])'
    return re.sub(special_chars, r'\\\1', search_term)

def search_ad_users(search_term: str = "", limit: int = 250) -> List[Contact]:
    """Поиск пользователей в Active Directory."""
    logger.info(f"Поиск в AD: запрос='{search_term}', лимит={limit}")
    try:
        with get_ad_connection() as conn:
            with timeout(15):
                base_filter = "(&(objectClass=user)(objectCategory=person)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))"
                if search_term and search_term.strip() != "*":
                    escaped_term = escape_ldap_filter_chars(search_term)
                    search_filter = f"(&{base_filter}(|(displayName=*{escaped_term}*)(sAMAccountName=*{escaped_term}*)(mail=*{escaped_term}*)(telephoneNumber=*{escaped_term}*)(otherTelephone=*{escaped_term}*)(department=*{escaped_term}*)(mobile=*{escaped_term}*)))"
                else:
                    search_filter = base_filter
                
                attributes = [
                    'sAMAccountName', 'displayName', 'mail', 'telephoneNumber',
                    'department', 'title', 'otherTelephone', 'mobile',
                    'userAccountControl', 'memberOf'
                ]
                conn.search(BASE_DN, search_filter, search_scope=SUBTREE, attributes=attributes)
                contacts = process_ldap_search_results(conn.entries[:limit])
                logger.info(f"Найдено {len(contacts)} контактов")
                return contacts
    except TimeoutError:
        logger.error("Превышен таймаут поиска LDAP")
        return []
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка поиска в AD: {str(e)}")
        return []

def get_all_groups() -> List[str]:
    """Получение списка групп из Active Directory."""
    logger.info("Получение списка групп из AD")
    try:
        with get_ad_connection() as conn:
            with timeout(15):
                search_filter = "(objectClass=group)"
                conn.search(BASE_DN, search_filter, search_scope=SUBTREE, attributes=['cn'])
                groups = {safe_decode_attr(entry.cn) for entry in conn.entries if entry.cn and safe_decode_attr(entry.cn) != 'Guests'}
                return sorted(list(groups))
    except TimeoutError:
        logger.error("Превышен таймаут получения групп")
        return []
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка получения групп: {str(e)}")
        return []

@router.get("/groups", response_model=List[str])
async def get_groups_endpoint(current_user: dict = Depends(get_current_user)):
    """Эндпоинт для получения списка групп."""
    logger.info("Обработка запроса на /contacts/groups")
    try:
        return get_all_groups()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка в /groups: {str(e)}")
        return []

@router.get("/check-username")
async def check_username_unique(
    username: str = Query(..., description="sAMAccountName для проверки"),
    current_user: dict = Depends(get_current_user)
):
    """Проверка уникальности имени пользователя."""
    logger.info(f"Проверка уникальности имени пользователя: {username}")
    try:
        with get_ad_connection() as conn:
            with timeout(15):
                search_filter = f"(sAMAccountName={escape_ldap_filter_chars(username)})"
                conn.search(BASE_DN, search_filter, search_scope=SUBTREE, attributes=['sAMAccountName'])
                user_exists = bool(conn.entries)
                return {"available": not user_exists}
    except TimeoutError:
        logger.error("Превышен таймаут проверки имени пользователя")
        raise HTTPException(status_code=500, detail="Таймаут проверки имени пользователя")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка проверки имени пользователя: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Ошибка проверки имени пользователя: {str(e)}")

def get_ous_with_dn() -> List[OUDetail]:
    """Получение списка organizationalUnit из AD с их полными DN."""
    logger.info("Получение списка OU из AD с DN")
    try:
        with get_ad_connection() as conn:
            conn.search(
                BASE_DN,
                "(objectClass=organizationalUnit)",
                search_scope=SUBTREE,
                attributes=['ou']
            )
            result = []
            for entry in conn.entries:
                name = safe_decode_attr(entry.ou) if entry.ou else "Без названия"
                dn = str(entry.entry_dn)
                result.append(OUDetail(name=name, dn=dn))
            return sorted(result, key=lambda x: x.name)
    except Exception as e:
        logger.error(f"Ошибка при получении OU из AD: {e}", exc_info=True)
        raise

def get_departments() -> List[str]:
    """Получение списка департаментов и групп из Active Directory."""
    logger.info("Получение списка департаментов и групп из AD")
    try:
        with get_ad_connection() as conn:
            departments = set()
            
            # Поиск organizationalUnit
            with timeout(15):
                conn.search(BASE_DN, "(objectClass=organizationalUnit)", search_scope=SUBTREE, attributes=['ou'])
                for entry in conn.entries:
                    if entry.ou:
                        departments.add(safe_decode_attr(entry.ou))
            
            # Поиск групп
            with timeout(15):
                conn.search(BASE_DN, "(&(objectClass=group)(!(groupType:1.2.840.113556.1.4.803:=2147483648)))", 
                           search_scope=SUBTREE, attributes=['cn'])
                builtin_groups = {'Users', 'Domain Users', 'Administrators', 'Guests'}
                for entry in conn.entries:
                    if entry.cn and safe_decode_attr(entry.cn) not in builtin_groups:
                        departments.add(safe_decode_attr(entry.entry_dn))
            
            # Поиск пользовательских департаментов
            with timeout(15):
                conn.search(BASE_DN, "(objectClass=user)", search_scope=SUBTREE, attributes=['department'])
                for entry in conn.entries:
                    if entry.department:
                        departments.add(safe_decode_attr(entry.department))
            
            return sorted(list(departments))
    except TimeoutError:
        logger.error("Превышен таймаут получения департаментов")
        return sorted([
            'АСУП', 'ТЭРиОВТ', 'Бухгалтерия', 'Отдел кадров',
            'Коммерческая служба', 'Отдел закупок', 'Юридический отдел',
            'Отдел труда и заработной платы', 'Отдел главного технолога'
        ])
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка получения департаментов: {str(e)}")
        return sorted([
            'АСУП', 'ТЭРиОВТ', 'Бухгалтерия', 'Отдел кадров',
            'Коммерческая служба', 'Отдел закупок', 'Юридический отдел',
            'Отдел труда и заработной платы', 'Отдел главного технолога'
        ])

@router.get("/departments", response_model=List[str])
async def get_departments_endpoint(current_user: dict = Depends(get_current_user)):
    """Эндпоинт для получения списка департаментов."""
    logger.info("Обработка запроса на /contacts/departments")
    try:
        return get_departments()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка в /departments: {str(e)}")
        return sorted([
            'АСУП', 'ТЭРиОВТ', 'Бухгалтерия', 'Отдел кадров',
            'Коммерческая служба', 'Отдел закупок', 'Юридический отдел',
            'Отдел труда и заработной платы', 'Отдел главного технолога'
        ])

@router.get("/{contact_id}", response_model=Contact)
async def get_contact(
    contact_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Получение информации о контакте по ID."""
    logger.info(f"Запрос контакта с ID: {contact_id}")
    try:
        contacts = search_ad_users(search_term=contact_id, limit=10)
        if not contacts:
            raise HTTPException(status_code=404, detail="Контакт не найден")
        return contacts[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка при получении контакта: {str(e)}")
        raise HTTPException(status_code=500, detail="Ошибка при получении контакта")

@router.put("/{contact_id}", response_model=Contact)
async def update_contact(
    contact_id: str,
    contact_data: Contact,
    current_user: dict = Depends(get_current_user)
):
    """Обновление данных контакта."""
    logger.info(f"Обновление контакта {contact_id} с данными: {contact_data.dict(exclude_unset=True)}")
    if not current_user.get("isAdmin"):
        raise HTTPException(status_code=403, detail="Только администратор может обновлять контакты")
    
    try:
        with get_ad_connection() as conn:
            with timeout(15):
                search_filter = f"(sAMAccountName={escape_ldap_filter_chars(contact_id)})"
                conn.search(BASE_DN, search_filter, search_scope=SUBTREE, attributes=['distinguishedName'])
                if not conn.entries:
                    raise HTTPException(status_code=404, detail="Контакт не найден в AD")
                # dn = conn.entries[0].distinguishedName.value
                dn = conn.entries[0].entry_dn

                mod_attrs = {}
                field_mapping = {
                    'displayName': ('displayName', lambda x: x.encode('utf-8') if x else None),
                    'email': ('mail', lambda x: x.encode('utf-8') if x else None),
                    'phone_internal': ('telephoneNumber', lambda x: normalize_ldap_phone(x)[0].encode('utf-8') if normalize_ldap_phone(x) else None),
                    'phone_city': ('otherTelephone', lambda x: normalize_ldap_phone(x)[0].encode('utf-8') if normalize_ldap_phone(x) else None),
                    'phone_mobile': ('mobile', lambda x: normalize_ldap_phone(x)[0].encode('utf-8') if normalize_ldap_phone(x) else None),
                    'department': ('department', lambda x: x.encode('utf-8') if x else None),
                    'position': ('title', lambda x: x.encode('utf-8') if x else None)
                }

                for field, (attr, transformer) in field_mapping.items():
                    if field in contact_data.dict(exclude_unset=True):
                        value = transformer(getattr(contact_data, field))
                        if value:
                            mod_attrs[attr] = [(MODIFY_REPLACE, [value])]
                        else:
                            mod_attrs[attr] = [(MODIFY_REPLACE, [])]

                if contact_data.groups is not None:
                    current_groups = get_current_groups(conn, dn)
                    group_changes = process_group_changes(conn, dn, current_groups, contact_data.groups)
                    for change in group_changes:
                        conn.modify(change['group_dn'], {'member': [change['operation']]})
                
                if contact_data.password:
                    if not validate_password(contact_data.password, contact_data.displayName or ""):
                        logger.error("Пароль не соответствует требованиям AD")
                        raise HTTPException(status_code=400, detail="Пароль должен быть >=8 символов, содержать заглавные буквы, цифры, спецсимволы и не содержать имя")
                    conn.modify(dn, {'unicodePwd': [(MODIFY_REPLACE, [encode_password(contact_data.password)])]})

                if mod_attrs:
                    conn.modify(dn, mod_attrs)
                
                logger.info(f"Контакт {contact_id} успешно обновлён")
                return Contact(**{**contact_data.dict(exclude_unset=True), "id": contact_id})
    except TimeoutError:
        logger.error("Превышен таймаут обновления контакта")
        raise HTTPException(status_code=500, detail="Таймаут обновления в LDAP")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка обновления в AD: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Ошибка обновления в AD: {str(e)}")

def get_current_groups(conn: Connection, user_dn: str) -> List[str]:
    """Получение текущих групп пользователя."""
    try:
        with timeout(15):
            search_filter = f"(member={escape_ldap_filter_chars(user_dn)})"
            conn.search(BASE_DN, search_filter, search_scope=SUBTREE, attributes=['cn'])
            return [safe_decode_attr(entry.cn) for entry in conn.entries if entry.cn]
    except TimeoutError:
        logger.error("Превышен таймаут получения групп пользователя")
        return []
    except Exception as e:
        logger.error(f"Ошибка получения групп пользователя: {str(e)}")
        return []

def process_group_changes(conn: Connection, user_dn: str, current_groups: List[str], new_groups: List[str]) -> List[dict]:
    """Обработка изменений в членстве групп."""
    changes = []
    current_set = set(current_groups)
    new_set = set(new_groups or [])
    
    for group in new_set - current_set:
        group_dn = find_group_dn(conn, group)
        if group_dn:
            members = get_group_members(conn, group_dn)
            if user_dn not in members:
                changes.append({'group_dn': group_dn, 'operation': (MODIFY_ADD, [user_dn])})
    
    for group in current_set - new_set:
        group_dn = find_group_dn(conn, group)
        if group_dn:
            members = get_group_members(conn, group_dn)
            if user_dn in members:
                changes.append({'group_dn': group_dn, 'operation': (MODIFY_DELETE, [user_dn])})
    
    return changes

def get_group_members(conn: Connection, group_dn: str) -> List[str]:
    """Получение членов группы."""
    try:
        with timeout(15):
            conn.search(group_dn, "(objectClass=group)", search_scope=SUBTREE, attributes=['member'])
            return [safe_decode_attr(m) for m in conn.entries[0].member] if conn.entries else []
    except TimeoutError:
        logger.error(f"Превышен таймаут получения членов группы {group_dn}")
        return []
    except Exception as e:
        logger.error(f"Ошибка получения членов группы {group_dn}: {str(e)}")
        return []

def find_group_dn(conn: Connection, group_name: str) -> Optional[str]:
    """Поиск DN группы по имени."""
    try:
        with timeout(15):
            search_filter = f"(&(objectClass=group)(cn={group_name}))"
            logger.debug(f"Поиск группы с фильтром: {search_filter}")
            conn.search(BASE_DN, search_filter, search_scope=SUBTREE, attributes=['distinguishedName'])
            if conn.entries:
                dn = conn.entries[0].entry_dn # или entry['distinguishedName'][0] 
                logger.debug(f"Найдена группа '{group_name}' с DN: {dn}")
                return dn
            else:
                 logger.info(f"Группа с именем '{group_name}' не найдена в AD.")
                 return None
    except TimeoutError:
        logger.error(f"Превышен таймаут поиска группы {group_name}")
        return None
    except Exception as e:
        logger.error(f"Ошибка поиска группы {group_name}: {str(e)}", exc_info=True)
        return None

@router.post("/", response_model=Contact)
async def create_contact(
    contact_data: Contact,
    current_user: dict = Depends(get_current_user)
):
    """Создание нового контакта в Active Directory."""
    logger.info(f"Создание контакта с данными: {contact_data.dict(exclude_unset=True)}")
    if not current_user.get("isAdmin"):
        raise HTTPException(status_code=403, detail="Только администратор может создавать контакты")
    
    if not contact_data.displayName or not contact_data.password or not contact_data.sam_account_name:
        raise HTTPException(status_code=400, detail="Требуются displayName, password и sam_account_name")
    
    if not validate_password(contact_data.password, contact_data.displayName):
        raise HTTPException(status_code=400, detail="Пароль должен быть >=8 символов, содержащий заглавные буквы, цифры, спецсимволы и не содержать имя")

    try:
        with get_ad_connection() as conn:
            with timeout(15):
                search_filter = f"(sAMAccountName={escape_ldap_filter_chars(contact_data.sam_account_name)})"
                conn.search(BASE_DN, search_filter, search_scope=SUBTREE, attributes=['sAMAccountName'])
                if conn.entries:
                    raise HTTPException(status_code=409, detail="Имя входа уже занято")
                
                ous = get_ous_with_dn()
                target_department = contact_data.department

                target_ou_dn = None
                for ou in ous:
                    if ou.name == target_department:
                        target_ou_dn = ou.dn
                        break

                dn = f"CN={escape_ldap_filter_chars(contact_data.displayName)},{target_ou_dn}"
                logger.info(f" dnПоиска {dn}")
                attributes = {
                    'objectClass': ['top', 'person', 'organizationalPerson', 'user'],
                    'sAMAccountName': contact_data.sam_account_name,
                    'userPrincipalName': f"{contact_data.sam_account_name}@{AD_DOMAIN}",
                    'displayName': contact_data.displayName,
                    'cn': contact_data.displayName,
                    'name': contact_data.displayName,
                    'mail': contact_data.email,
                    'telephoneNumber': normalize_ldap_phone(contact_data.phone_internal)[0] if contact_data.phone_internal else None,
                    'otherTelephone': normalize_ldap_phone(contact_data.phone_city)[0] if contact_data.phone_city else None,
                    'mobile': normalize_ldap_phone(contact_data.phone_mobile)[0] if contact_data.phone_mobile else None,
                    'department': contact_data.department,
                    'title': contact_data.position,
                    'userAccountControl': 544,
                    'pwdLastSet': -1,
                }
                attributes = {k: v for k, v in attributes.items() if v is not None}

                conn.add(dn, attributes=attributes)
                if not conn.result['result'] == 0:
                    logger.error(f"Ошибка создания пользователя {dn}: {conn.result}")
                    raise HTTPException(status_code=500, detail=f"Ошибка создания пользователя: {conn.result['description']}")

                conn.modify(dn, {'unicodePwd': [(MODIFY_REPLACE, [encode_password(contact_data.password)])]})
                if not conn.result['result'] == 0:
                    try:
                        conn.delete(dn)
                        logger.info(f"Пользователь {dn} удален из-за ошибки установки пароля.")
                    except Exception as del_err:
                        logger.warning(f"Не удалось удалить пользователя {dn} после ошибки установки пароля: {del_err}")
                    
                    logger.error(f"Ошибка установки пароля для {dn}: {conn.result}")
                    error_msg = conn.result['message'] or conn.result['description'] or str(conn.result)
                    # Проверяем специфичную ошибку
                    if "0000052D" in error_msg:
                        raise HTTPException(
                            status_code=400,
                            detail="Ошибка установки пароля. Проверьте требования к сложности пароля в AD (должен содержать символы минимум из 3 категорий: заглавные/строчные буквы, цифры, специальные символы) или попробуйте другой пароль."
                        )
                    raise HTTPException(status_code=500, detail=f"Ошибка установки пароля: {error_msg}")

                valid_groups = []
                if contact_data.groups:
                    for group in contact_data.groups:
                        group_dn = find_group_dn(conn, group)
                        if group_dn:
                            conn.modify(group_dn, {'member': [(MODIFY_ADD, [dn])]})
                            if conn.result['result'] == 0:
                                valid_groups.append(group)
                            else:
                                logger.warning(f"Ошибка добавления в группу {group}: {conn.result}")
                
                logger.info(f"Создан пользователь {dn}, sAMAccountName: {contact_data.sam_account_name}")
                return Contact(
                    id=contact_data.sam_account_name,
                    displayName=contact_data.displayName,
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
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка создания в AD: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Ошибка создания в AD: {str(e)}")

@router.patch("/{contact_id}")
async def freeze_contact(
    contact_id: str,
    freeze_request: FreezeRequest,
    current_user: dict = Depends(get_current_user)
):
    """Заморозка/разморозка контакта."""
    logger.info(f"Изменение статуса контакта {contact_id} на {'заморожен' if freeze_request.is_frozen else 'активен'}")
    if not current_user.get("isAdmin"):
        raise HTTPException(status_code=403, detail="Только администратор может управлять заморозкой")
    
    try:
        with get_ad_connection() as conn:
            with timeout(15):
                search_filter = f"(sAMAccountName={escape_ldap_filter_chars(contact_id)})"
                conn.search(BASE_DN, search_filter, search_scope=SUBTREE, attributes=['distinguishedName'])
                if not conn.entries:
                    raise HTTPException(status_code=404, detail="Контакт не найден в AD")
                # dn = conn.entries[0].distinguishedName.value
                dn = conn.entries[0].entry_dn
                
                user_account_control = 514 if freeze_request.is_frozen else 512
                conn.modify(dn, {'userAccountControl': [(MODIFY_REPLACE, [user_account_control])]})
                if conn.result['result'] != 0:
                    logger.error(f"Ошибка изменения статуса {dn}: {conn.result}")
                    raise HTTPException(status_code=500, detail=f"Ошибка изменения статуса: {conn.result['description']}")
                
                return {"status": "success", "isFrozen": freeze_request.is_frozen}
    except TimeoutError:
        logger.error("Превышен таймаут изменения статуса")
        raise HTTPException(status_code=500, detail="Таймаут изменения статуса в LDAP")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка изменения статуса в AD: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Ошибка изменения статуса в AD: {str(e)}")

def process_ldap_search_results(entries: List[Any]) -> List[Contact]:
    """Обработка результатов поиска LDAP."""
    contacts = []
    for entry in entries:
        try:
            # Проверка существования entry и его атрибутов
            if not entry or not hasattr(entry, 'entry_attributes_as_dict'):
                 logger.warning(f"Пропущена некорректная запись: {entry}")
                 continue

            # Получение атрибутов через entry_attributes_as_dict
            attrs = entry.entry_attributes_as_dict
            raw_attrs = entry  # Для доступа через entry['attr_name']

            # sAMAccountName - обязательный атрибут
            sam_account_list = attrs.get('sAMAccountName')
            sam_account = safe_decode_attr(sam_account_list[0] if sam_account_list else None) if sam_account_list else None
            if not sam_account:
                logger.warning(f"Пропущена запись без sAMAccountName: {getattr(entry, 'entry_dn', 'Unknown DN')}")
                continue

            # userAccountControl для определения статуса
            uac_list = attrs.get('userAccountControl')
            uac_value = safe_decode_attr(uac_list[0] if uac_list else None) if uac_list else None
            is_frozen = bool(int(uac_value) & 2 == 2) if uac_value else False

            # Группы из memberOf
            member_of_list = attrs.get('memberOf', [])
            groups = []
            for group_dn_bytes in member_of_list:
                group_dn_str = safe_decode_attr(group_dn_bytes)
                if group_dn_str:
                    cn_match = re.search(r'CN=([^,]+)', group_dn_str)
                    if cn_match:
                        groups.append(cn_match.group(1))

            # Формирование данных пользователя
            user_data = {
                "id": sam_account,
                "displayName": safe_decode_attr((attrs.get('displayName', [None]))[0] if attrs.get('displayName') else None),
                "email": safe_decode_attr((attrs.get('mail', [None]))[0] if attrs.get('mail') else None),
                # Телефоны
                "phone_internal": normalize_phone_number(safe_decode_attr((attrs.get('telephoneNumber', [None]))[0] if attrs.get('telephoneNumber') else None)),
                "phone_city": normalize_phone_number(safe_decode_attr((attrs.get('otherTelephone', [None]))[0] if attrs.get('otherTelephone') else None)),
                "phone_mobile": normalize_phone_number(safe_decode_attr((attrs.get('mobile', [None]))[0] if attrs.get('mobile') else None)),
                # Другая информация
                "department": safe_decode_attr((attrs.get('department', [None]))[0] if attrs.get('department') else None),
                "position": safe_decode_attr((attrs.get('title', [None]))[0] if attrs.get('title') else None),
                "isFrozen": is_frozen,
                "groups": groups
            }

            contacts.append(Contact(**{k: v for k, v in user_data.items() if v is not None}))
        except ValidationError as e:
            logger.warning(f"Ошибка валидации записи {getattr(entry, 'entry_dn', 'Unknown DN')}: {e}")
            continue
        except Exception as e:
            logger.warning(f"Ошибка обработки записи {getattr(entry, 'entry_dn', 'Unknown DN')}: {str(e)}", exc_info=True) # Добавлен exc_info для лучшей диагностики
            continue
    return contacts

@router.get("/", response_model=List[Contact], include_in_schema=True)
async def get_contacts(
    query: str = Query("", description="Поисковый запрос", max_length=100),
    department: Optional[str] = Query(None, description="Фильтр по департаменту"),
    current_user: dict = Depends(get_current_user)
):
    """Получение списка контактов с фильтрацией."""
    logger.info(f"Запрос контактов: query='{query}', department='{department}'")
    try:
        contacts = search_ad_users(query, limit=250)
        if department:
            contacts = [contact for contact in contacts if contact.department == department]
        logger.info(f"Найдено {len(contacts)} контактов")
        return contacts
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка получения контактов: {str(e)}")
        raise HTTPException(status_code=500, detail="Ошибка получения контактов")

@router.delete("/{contact_id}")
async def delete_contact(
    contact_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Удаление контакта (пользователя) из Active Directory по sAMAccountName.
    """
    logger.info(f"Запрос на удаление контакта с ID (sAMAccountName): {contact_id}")
    
    if not current_user.get("isAdmin"):
        logger.warning(f"Пользователь {current_user.get('username')} без прав администратора пытался удалить контакт {contact_id}")
        raise HTTPException(status_code=403, detail="Только администратор может удалять контакты")

    conn = None
    try:
        with get_ad_connection() as conn:
            with timeout(15):
                # 1. Найти DN пользователя по sAMAccountName
                search_filter = f"(sAMAccountName={escape_ldap_filter_chars(contact_id)})"
                logger.debug(f"Поиск пользователя для удаления с фильтром: {search_filter}")
                
                conn.search(
                    search_base=BASE_DN,
                    search_filter=search_filter,
                    search_scope=SUBTREE,
                    attributes=['distinguishedName'] # Нам нужен DN для удаления
                )

                if not conn.entries:
                    logger.info(f"Контакт с sAMAccountName '{contact_id}' не найден в AD для удаления")
                    raise HTTPException(status_code=404, detail="Контакт не найден в AD")

                user_dn = conn.entries[0].entry_dn
                logger.info(f"Найден DN пользователя для удаления: {user_dn}")

                # 2. Удалить пользователя по DN
                logger.debug(f"Попытка удаления пользователя с DN: {user_dn}")
                conn.delete(user_dn)

                # 3. Проверить результат операции удаления
                if conn.result['result'] == 0: # 0 означает успех
                    logger.info(f"Контакт {contact_id} (DN: {user_dn}) успешно удален из AD")
                    # FastAPI автоматически вернет 204 No Content, если функция ничего не возвращает и status_code=204
                    return # Успешное удаление, возвращаем пустое тело с кодом 204
                else:
                    error_code = conn.result['result']
                    error_desc = conn.result.get('description', 'Unknown error')
                    error_msg = conn.result.get('message', '')
                    logger.error(f"Ошибка удаления пользователя {user_dn} из AD: "
                                 f"Код {error_code}, Описание: {error_desc}, Сообщение: {error_msg}")
                    
                    # Примеры кодов ошибок:
                    # 50 - unwillingToPerform (например, не хватает прав, объект защищен)
                    # 32 - noSuchObject (объект не найден - маловероятен тут, так как мы его только что нашли)
                    # 19 - constraintViolation (нарушение ограничений)
                    
                    if error_code == 50: # unwillingToPerform
                         raise HTTPException(
                            status_code=500,
                            detail="Недостаточно прав для удаления пользователя или операция запрещена политикой AD."
                        )
                    elif error_code == 19: # constraintViolation
                         raise HTTPException(
                            status_code=500,
                            detail="Нарушение ограничений при удалении пользователя (constraint violation)."
                        )
                    else:
                         raise HTTPException(
                            status_code=500,
                            detail=f"Ошибка удаления пользователя из AD: {error_desc}. Код ошибки: {error_code}"
                        )

    except TimeoutError:
        logger.error("Превышен таймаут удаления контакта")
        raise HTTPException(status_code=500, detail="Таймаут удаления из LDAP")
    except HTTPException:
        # Пробрасываем HTTPException от поиска (404) или от обработки результата удаления (500)
        raise
    except Exception as e:
        logger.error(f"Ошибка удаления контакта {contact_id} из AD: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка удаления контакта из AD: {str(e)}")