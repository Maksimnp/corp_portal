import ldap
import os
from dotenv import load_dotenv

load_dotenv()

LDAP_SERVER = os.getenv("LDAP_SERVER")
LDAP_USER = os.getenv("LDAP_USER")
LDAP_PASSWORD = os.getenv("LDAP_PASSWORD")

print(f"Тест подключения к {LDAP_SERVER} с DN: {LDAP_USER}")

try:
    conn = ldap.initialize(LDAP_SERVER)
    conn.set_option(ldap.OPT_REFERRALS, 0)
    conn.set_option(ldap.OPT_NETWORK_TIMEOUT, 10.0)
    conn.protocol_version = ldap.VERSION3
    conn.simple_bind_s(LDAP_USER, LDAP_PASSWORD)
    print(">>> УСПЕХ: Привязка выполнена успешно!")

    # Простой тестовый поиск
    base_dn = os.getenv("BASE_DN")
    search_filter = "(sAMAccountName=ServiceReader)"  # Ищем саму учетку
    attrs = ["sAMAccountName", "displayName"]
    result = conn.search_s(base_dn, ldap.SCOPE_SUBTREE, search_filter, attrs)
    if result:
        print(f">>> Найдена учетка: {result[0][1]}")
    else:
        print(">>> Учетка не найдена при поиске (странный случай)")

except ldap.INVALID_CREDENTIALS:
    print(">>> ОШИБКА: Неверные учетные данные!")
except ldap.SERVER_DOWN as e:
    print(f">>> ОШИБКА: Сервер недоступен: {e}")
except ldap.LDAPError as e:
    print(f">>> ОШИБКА LDAP: {e}")
except Exception as e:
    print(f">>> НЕОЖИДАННАЯ ОШИБКА: {e}")
finally:
    if 'conn' in locals():
        conn.unbind()