import ldap
from typing import Dict, Optional
import os
from dotenv import load_dotenv
import logging

# Настройка логирования
logger = logging.getLogger(__name__)

load_dotenv()

# Проверка переменных окружения
LDAP_SERVER = os.getenv("LDAP_SERVER", "ldap://192.1.3.6:389")
LDAP_DOMAIN = os.getenv("LDAP_DOMAIN", "mhp.net")
BASE_DN = os.getenv("BASE_DN", "DC=mhp,DC=net")

for key, value in [("LDAP_SERVER", LDAP_SERVER), ("LDAP_DOMAIN", LDAP_DOMAIN), ("BASE_DN", BASE_DN)]:
    if not value:
        logger.error(f"Missing environment variable for {key}")
        raise ValueError(f"Missing environment variable for {key}")

def authenticate_user(username: str, password: str) -> Optional[Dict[str, str]]:
    try:
        conn = ldap.initialize(LDAP_SERVER)
        conn.set_option(ldap.OPT_REFERRALS, 0)
        bind_dn = f"{username}@{LDAP_DOMAIN}"
        conn.simple_bind_s(bind_dn, password)

        search_filter = f"(sAMAccountName={username})"
        attrs = ["displayName", "sAMAccountName"]
        result = conn.search_s(BASE_DN, ldap.SCOPE_SUBTREE, search_filter, attrs)

        if result and len(result) > 0:
            user_dn, user_attrs = result[0]
            full_name = (
                user_attrs.get("displayName", [b""])[0].decode("utf-8")
                if user_attrs.get("displayName")
                else username
            )
            logger.info(f"Successfully authenticated user: {username}, Full Name: {full_name}")
            return {"username": username, "full_name": full_name}
        else:
            logger.warning(f"No user found for username: {username}")
            return None

    except ldap.INVALID_CREDENTIALS:
        logger.warning(f"Invalid credentials for user: {username}")
        return None
    except ldap.SERVER_DOWN:
        logger.error(f"LDAP server is down: {LDAP_SERVER}")
        return None
    except ldap.LDAPError as e:
        logger.error(f"LDAP error for user {username}: {e}")
        return None
    finally:
        if "conn" in locals():
            conn.unbind_s()

def get_user_role(username: str) -> str:
    role = "admin" if username in ["mnp", "k.dyatel"] else "user"
    logger.debug(f"Role for user {username}: {role}")
    return role