# config.py
import os
from dotenv import load_dotenv
from pydantic_settings import BaseSettings
# Загружаем переменные окружения из .env
load_dotenv()

# Проверка SECRET_KEY
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("SECRET_KEY не найден в .env")

ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30))

# Настройки базы данных
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_DATABASE = os.getenv("DB_DATABASE", "requirements_db")
DB_USER = os.getenv("DB_USER", "portal_admin")
DB_PASSWORD = os.getenv("DB_PASSWORD", "season")
DB_PORT = int(os.getenv("DB_PORT", 5432))

# Настройки LDAP
LDAP_SERVER = os.getenv("LDAP_SERVER", "ldap://192.1.3.6:389")
LDAP_DOMAIN = os.getenv("LDAP_DOMAIN", "mhp.net")
BASE_DN = os.getenv("BASE_DN", "DC=mhp,DC=net")

# Список администраторов
ADMIN_USERS = os.getenv("ADMIN_USERS", "mnp,k.dyatel").split(",")
class Settings(BaseSettings):
    DOCUMENTS_DB_USER: str = "portal_admin"
    DOCUMENTS_DB_PASSWORD: str = "season"
    DOCUMENTS_DB_HOST: str = "localhost"
    DB_PORT: str = "5432"
    DOCUMENTS_DB_DATABASE: str = "documents_db"

settings = Settings()