#!/usr/bin/env python3
"""
Скрипт для получения данных пользователей с OpenVPN AS через sacli по SSH.
"""
import os
import subprocess
import json
import sys
from typing import Dict, Any
import paramiko
from getpass import getpass

# Настройки
OPENVPN_HOST = "192.1.66.143"
SSH_USERNAME = os.getenv("SSH_USERNAME", "openvpn")
SSH_KEY_PATH = os.getenv("SSH_KEY_PATH", "/home/msa/.ssh/id_rsa")
SSH_PASSWORD = os.getenv("SSH_PASSWORD", None)
SUDO_PASSWORD = os.getenv("SUDO_PASSWORD", None)
SACL_PATH = "/usr/local/openvpn_as/scripts/sacli"

def run_sacli_command(command: list) -> Dict[Any, Any]:
    """
    Выполняет sacli команду через SSH и возвращает результат в формате JSON.
    """
    try:
        # Инициализация SSH клиента
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        # Попытка подключения с ключом или паролем
        if os.path.exists(SSH_KEY_PATH):
            print(f"🔑 Использование SSH ключа: {SSH_KEY_PATH}")
            ssh.connect(
                hostname=OPENVPN_HOST,
                username=SSH_USERNAME,
                key_filename=SSH_KEY_PATH,
                timeout=10
            )
        else:
            print(f"🔐 Ключ {SSH_KEY_PATH} не найден, использование пароля")
            password = SSH_PASSWORD or getpass(f"Введите пароль для {SSH_USERNAME}@{OPENVPN_HOST}: ")
            ssh.connect(
                hostname=OPENVPN_HOST,
                username=SSH_USERNAME,
                password=password,
                timeout=10
            )

        # Формирование команды с sudo -S
        cmd = ["sudo", "-S", *command]
        cmd_str = " ".join(cmd)
        print(f"📡 Выполнение команды: {cmd_str}")

        # Создание SSH канала для команды
        transport = ssh.get_transport()
        channel = transport.open_session()
        channel.exec_command(cmd_str)

        # Если требуется пароль для sudo, отправляем его
        if SUDO_PASSWORD:
            channel.send(SUDO_PASSWORD + "\n")
            print("🔐 Отправлен пароль для sudo")

        # Чтение вывода
        output = ""
        error = ""
        while not channel.exit_status_ready():
            if channel.recv_ready():
                output += channel.recv(4096).decode()
            if channel.recv_stderr_ready():
                error += channel.recv_stderr(4096).decode()
        
        # Получение оставшегося вывода
        output += channel.recv(4096).decode()
        error += channel.recv_stderr(4096).decode()
        
        exit_status = channel.recv_exit_status()
        ssh.close()

        if exit_status != 0 or error:
            print(f"❌ Ошибка выполнения команды: {error}")
            return {"error": "command_error", "details": error}

        try:
            return json.loads(output) if output else {}
        except json.JSONDecodeError as e:
            print(f"❌ Ошибка парсинга JSON: {e}")
            print(f"Тело ответа: {output[:500]}")
            return {"error": "invalid_json", "raw": output}

    except paramiko.AuthenticationException:
        print("❌ Ошибка аутентификации SSH. Проверьте SSH-ключ или пароль.")
        print(f"💡 Убедитесь, что ключ {SSH_KEY_PATH} существует или пароль верный.")
        print(f"💡 Проверьте: ssh -i {SSH_KEY_PATH} {SSH_USERNAME}@{OPENVPN_HOST}")
        return {"error": "ssh_auth_error"}
    except paramiko.SSHException as e:
        print("❌ Ошибка SSH подключения.")
        print("Проверьте:")
        print(f"   - Доступность сервера {OPENVPN_HOST} (ping {OPENVPN_HOST})")
        print(f"   - SSH ключ ({SSH_KEY_PATH}) или пароль")
        print(f"   - Открыт ли порт 22 (nc -zv {OPENVPN_HOST} 22)")
        print(f"Детали: {e}")
        return {"error": "ssh_error", "details": str(e)}
    except TimeoutError:
        print("❌ Таймаут подключения SSH. Сервер не ответил за 10 секунд.")
        return {"error": "timeout"}
    except Exception as e:
        print(f"❌ Неизвестная ошибка: {e}")
        return {"error": "unknown", "details": str(e)}

def fetch_users() -> Dict:
    """Получает список пользователей через sacli UserPropGet."""
    return run_sacli_command([SACL_PATH, "UserPropGet"])

def fetch_status() -> Dict:
    """Получает статус сервера через sacli Status."""
    return run_sacli_command([SACL_PATH, "Status"])

def fetch_sessions() -> Dict:
    """Получает активные сессии через sacli VPNStatus."""
    return run_sacli_command([SACL_PATH, "VPNStatus"])

def display_users(users_data: Dict):
    """Отображает список пользователей."""
    if "error" in users_data:
        print("❌ Не удалось загрузить пользователей.")
        return

    print("\n📋 Список пользователей OpenVPN:")
    print("-" * 60)
    for username, info in users_data.items():
        if username.startswith("group_") or username == "__DEFAULT__":
            continue
        user_type = info.get("type", "N/A")
        if user_type != "user_connect":
            continue
        status = "active" if info.get("prop_deny", "false") == "false" else "denied"
        last_login = info.get("last_login", "never")  # sacli не возвращает last_login
        groups = info.get("prop_type", "").split(",") if info.get("prop_type") else []
        groups = ", ".join([g.replace("group_", "") for g in groups if g]) or "—"

        print(f"👤 {username}")
        print(f"   Статус: {status}")
        print(f"   Тип: {user_type}")
        print(f"   Группы: {groups}")
        print(f"   Последний вход: {last_login}")
        print()

def display_status(status_data: Dict):
    """Отображает статус сервера."""
    if "error" in status_data:
        return
    print("\n📊 Статус OpenVPN AS:")
    for k, v in status_data.items():
        if isinstance(v, dict):
            print(f"{k}:")
            for sub_k, sub_v in v.items():
                print(f"   {sub_k}: {sub_v}")
        else:
            print(f"{k}: {v}")

def display_sessions(sessions_data: Dict):
    """Отображает активные сессии."""
    if "error" in sessions_data or not isinstance(sessions_data, dict):
        print("❌ Нет данных об активных сессиях.")
        return

    clients = sessions_data.get("clients", [])
    active = [client for client in clients if client.get("status") == "connected"]
    if active:
        print(f"\n🟢 Активные подключения: {len(active)}")
        for client in active:
            username = client.get("common_name", "unknown")
            print(f"  • {username}")
    else:
        print("\n🟢 Нет активных подключений")

def main():
    print("🔍 Получение данных с OpenVPN Access Server...\n")

    # 1. Пользователи
    users = fetch_users()
    if "error" not in users:
        print("✅ Пользователи успешно получены")
    display_users(users)

    # 2. Статус сервера
    status = fetch_status()
    display_status(status)

    # 3. Активные сессии
    sessions = fetch_sessions()
    display_sessions(sessions)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n👋 Прервано пользователем.")
        sys.exit(0)