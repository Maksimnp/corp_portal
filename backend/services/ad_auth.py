# services/ldap_service.py
import ldap
from typing import Optional, Dict, List
import os
from dotenv import load_dotenv
import logging

load_dotenv()
logger = logging.getLogger(__name__)

# Настройки AD
LDAP_SERVER = os.getenv("LDAP_SERVER")
BASE_DN = os.getenv("BASE_DN")
ADMIN_USERS = os.getenv("ADMIN_USERS", "").split(",")

def get_ldap_connection():
    """Создание подключения к LDAP"""
    conn = ldap.initialize(LDAP_SERVER)
    conn.set_option(ldap.OPT_REFERRALS, 0)
    conn.set_option(ldap.OPT_NETWORK_TIMEOUT, 10.0)
    conn.protocol_version = ldap.VERSION3
    return conn

def authenticate_user(username: str, password: str) -> Optional[Dict[str, str]]:
    """Аутентификация пользователя в AD"""
    if not username or not password:
        return None

    conn = None
    try:
        conn = get_ldap_connection()
        conn.simple_bind_s(f"{username}@{BASE_DN.split(',')[0].split('=')[1]}.{BASE_DN.split(',')[1].split('=')[1]}", password)
        
        search_filter = f"(sAMAccountName={username})"
        result = conn.search_s(BASE_DN, ldap.SCOPE_SUBTREE, search_filter, 
                              ["displayName", "givenName", "sn", "mail", "department"])
        
        if not result:
            return None

        attrs = result[0][1]
        full_name = (
            attrs.get("displayName", [b""])[0].decode('utf-8') or
            f"{attrs.get('givenName', [b''])[0].decode('utf-8')} {attrs.get('sn', [b''])[0].decode('utf-8')}".strip()
        )
        
        return {
            "username": username,
            "full_name": full_name or username,
            "email": attrs.get("mail", [b""])[0].decode('utf-8'),
            "department": attrs.get("department", [b""])[0].decode('utf-8') if attrs.get("department") else ""
        }
    except ldap.INVALID_CREDENTIALS:
        return None
    except Exception as e:
        logger.error(f"LDAP error: {str(e)}")
        return None
    finally:
        if conn:
            conn.unbind()

def get_user_details(username: str) -> Optional[Dict[str, str]]:
    """Получение информации о пользователе из AD"""
    conn = None
    try:
        conn = get_ldap_connection()
        conn.simple_bind_s()  # Анонимное связывание, если разрешено
        
        search_filter = f"(sAMAccountName={username})"
        result = conn.search_s(BASE_DN, ldap.SCOPE_SUBTREE, search_filter, 
                              ["displayName", "mail", "department"])
        
        if not result:
            return None

        attrs = result[0][1]
        return {
            "username": username,
            "full_name": attrs.get("displayName", [b""])[0].decode('utf-8'),
            "email": attrs.get("mail", [b""])[0].decode('utf-8'),
            "department": attrs.get("department", [b""])[0].decode('utf-8') if attrs.get("department") else ""
        }
    except Exception as e:
        logger.error(f"LDAP error: {str(e)}")
        return None
    finally:
        if conn:
            conn.unbind()

def search_users(search_term: str = "", max_results: int = 50) -> List[Dict[str, str]]:
    """Поиск пользователей в AD"""
    conn = None
    try:
        conn = get_ldap_connection()
        conn.simple_bind_s()  # Анонимное связывание
        
        search_filter = f"(|(displayName=*{search_term}*)(sAMAccountName=*{search_term}*)(mail=*{search_term}*))" if search_term else "(objectClass=user)"
        result = conn.search_s(BASE_DN, ldap.SCOPE_SUBTREE, search_filter, 
                              ["sAMAccountName", "displayName", "mail", "department"])
        
        users = []
        for dn, entry in result:
            if not isinstance(entry, dict):
                continue
                
            username = entry.get("sAMAccountName", [b""])[0].decode('utf-8')
            if not username:
                continue
                
            users.append({
                "username": username,
                "full_name": entry.get("displayName", [b""])[0].decode('utf-8'),
                "email": entry.get("mail", [b""])[0].decode('utf-8'),
                "department": entry.get("department", [b""])[0].decode('utf-8') if entry.get("department") else ""
            })
            
            if len(users) >= max_results:
                break
                
        return users
    except Exception as e:
        logger.error(f"LDAP search error: {str(e)}")
        return []
    finally:
        if conn:
            conn.unbind()

def get_user_role(username: str) -> str:
    """Определение роли пользователя"""
    return "admin" if username in ADMIN_USERS else "user"