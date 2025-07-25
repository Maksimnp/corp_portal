# api/utils.py
import ldap
from ldap import LDAPError
import logging

logger = logging.getLogger(__name__)

def get_ad_search_connection():
    """Устанавливает соединение с Active Directory."""
    try:
        # Замените на реальные параметры вашего AD
        ldap_server = "ldap://mhp.net"  # Замените на ваш LDAP-сервер
        username = "ServiceReader@mhp.net"  # Учетная запись с правами на поиск
        password = "Season24"  # Замените на реальный пароль
        conn = ldap.initialize(ldap_server)
        conn.set_option(ldap.OPT_REFERRALS, 0)  # Отключаем реферальные запросы
        conn.simple_bind_s(username, password)
        logger.info("Успешная привязка сервисной учетки")
        return conn
    except LDAPError as e:
        logger.error(f"Ошибка подключения к AD: {e}")
        raise

def safe_decode_attr(attr_value, attr_name):
    """Безопасно декодирует атрибут LDAP."""
    if not attr_value or not isinstance(attr_value, (list, str)):
        return None
    if isinstance(attr_value, list):
        attr_value = attr_value[0]
    try:
        return attr_value.decode('utf-8') if isinstance(attr_value, bytes) else str(attr_value)
    except (UnicodeDecodeError, AttributeError):
        logger.warning(f"Ошибка декодирования атрибута {attr_name}: {attr_value}")
        return None

def escape_ldap_filter_chars(search_term):
    """Экранирует специальные символы в поисковом запросе для LDAP."""
    if not search_term:
        return ""
    special_chars = "*()\\"
    for char in special_chars:
        search_term = search_term.replace(char, f"\\{char}")
    return search_term