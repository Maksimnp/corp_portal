import os
import logging
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from ldap3 import Server, Connection, ALL, SUBTREE
from typing import List, Dict

load_dotenv()

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

# Настройки LDAP из .env
LDAP_SERVER = os.getenv("LDAP_SERVER", "ldap://192.1.3.6:389")
LDAP_USER = os.getenv("LDAP_USER", "ServiceReader@mhp.net")
LDAP_PASSWORD = os.getenv("LDAP_PASSWORD", "Season24")
BASE_DN = os.getenv("BASE_DN", "DC=mhp,DC=net")

# Функция для подключения к LDAP
def get_ldap_connection():
    server = Server(LDAP_SERVER, get_info=ALL)
    conn = Connection(server, user=LDAP_USER, password=LDAP_PASSWORD, auto_bind=True)
    logger.info(f"Успешное подключение к {LDAP_SERVER}")
    return conn

@router.get("/api/contacts")
async def get_contacts() -> List[Dict]:
    """Получение списка всех контактов из AD"""
    conn = get_ldap_connection()
    try:
        logger.info(f"Выполнение поиска в {BASE_DN} с фильтром (objectClass=contact)")
        conn.search(BASE_DN, "(objectClass=contact)", SUBTREE, attributes=["*"])
        logger.info(f"Найдено записей: {len(conn.entries)}")
        if not conn.entries:
            logger.warning("Нет записей с objectClass=contact")
            return []
        contacts = [
            {
                attr: entry[attr][0] if entry[attr] else None
                for attr in entry["attributes"]
            }
            for entry in conn.entries
        ]
        return contacts
    except Exception as e:
        logger.error(f"Ошибка при поиске контактов: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Ошибка при получении контактов из AD")
    finally:
        conn.unbind()

@router.get("/api/contact/{dn}")
async def get_contact(dn: str) -> Dict:
    """Получение конкретного контакта по DN"""
    conn = get_ldap_connection()
    try:
        logger.info(f"Поиск контакта по DN: {dn}")
        conn.search(dn, "(objectClass=contact)", SUBTREE, attributes=["*"])
        if not conn.entries:
            logger.warning(f"Контакт с DN {dn} не найден")
            raise HTTPException(status_code=404, detail="Contact not found")
        return {
            attr: conn.entries[0][attr][0] if conn.entries[0][attr] else None
            for attr in conn.entries[0]["attributes"]
        }
    finally:
        conn.unbind()

@router.put("/api/contact/{dn}")
async def update_contact(dn: str, updates: Dict) -> Dict:
    """Обновление контакта в AD"""
    conn = get_ldap_connection()
    try:
        logger.info(f"Попытка обновления контакта по DN: {dn}")
        conn.search(dn, "(objectClass=contact)", SUBTREE, attributes=["*"])
        if not conn.entries:
            logger.warning(f"Контакт с DN {dn} не найден")
            raise HTTPException(status_code=404, detail="Contact not found")
        modify_ops = [(ldap3.MODIFY_REPLACE, attr, [str(updates[attr])]) for attr in updates]
        if modify_ops:
            conn.modify(dn, modify_ops)
            if conn.result["result"] != 0:
                logger.error(f"Ошибка модификации: {conn.result['message']}")
                raise HTTPException(status_code=400, detail=conn.result["message"])
        conn.search(dn, "(objectClass=contact)", SUBTREE, attributes=["*"])
        return {
            attr: conn.entries[0][attr][0] if conn.entries[0][attr] else None
            for attr in conn.entries[0]["attributes"]
        }
    finally:
        conn.unbind()