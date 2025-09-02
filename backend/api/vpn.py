import os
import logging
import json
import time
import httpx
from fastapi import APIRouter, HTTPException, Response, Query, Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, validator
from typing import Optional, Dict, List, Any
from contextlib import asynccontextmanager
from dotenv import load_dotenv

# Загрузка переменных окружения
load_dotenv()

# Настройка логирования
logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

# --- Настройки вашего API ---
OPENVPN_API_URL = os.getenv("OPENVPN_API_URL", "http://192.1.66.143:5000")
API_TIMEOUT = 10.0
VERIFY_SSL = False

# Глобальный клиент
http_client: httpx.AsyncClient | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Инициализация HTTP-клиента при запуске."""
    global http_client
    try:
        http_client = httpx.AsyncClient(
            base_url=OPENVPN_API_URL,
            verify=VERIFY_SSL,
            timeout=API_TIMEOUT,
            follow_redirects=True
        )
        response = await http_client.get("/health")
        if response.status_code != 200:
            raise Exception(f"API health check failed: {response.status_code}")
        logger.info("✅ OpenVPN API подключён и доступен")
    except Exception as e:
        logger.error(f"❌ Не удалось подключиться к OpenVPN API: {e}")
        pass
    yield
    if http_client:
        await http_client.aclose()
        logger.info("HTTP клиент закрыт")


# --- Роутер ---
router = APIRouter(prefix="/api/vpn")

# --- Pydantic модели ---
class ProfileRequest(BaseModel):
    clientName: str
    password: Optional[str] = None
    allow_web_login: Optional[str] = "true"
    prop_autologin: Optional[str] = "true"
    expiration_date: Optional[str] = None

    @validator('password')
    def validate_password(cls, v):
        if v and len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')
        return v


class ModifyProfileRequest(BaseModel):
    clientName: str
    propKey: str
    propValue: str


class DisconnectRequest(BaseModel):
    clientName: str
    realAddress: str


class GroupRequest(BaseModel):
    groupName: str


class UserGroupsRequest(BaseModel):
    userName: str
    groups: List[str]


class ServerConfig(BaseModel):
    server_port: str
    protocol: str
    cipher: str
    auth: str
    server_network: str
    server_netmask: str
    push_routes: Optional[str] = ""
    duplicate_cn: Optional[str] = "false"
    client_to_client: Optional[str] = "false"


# --- Безопасная функция запроса ---
async def api_request(method: str, endpoint: str, **kwargs):
    global http_client
    max_retries = 3
    for attempt in range(max_retries):
        try:
            if http_client is None:
                logger.warning("HTTP клиент не инициализирован. Пересоздаю...")
                http_client = httpx.AsyncClient(
                    base_url=OPENVPN_API_URL,
                    verify=VERIFY_SSL,
                    timeout=API_TIMEOUT,
                    follow_redirects=True
                )
            response = await http_client.request(method, endpoint, **kwargs)
            if response.status_code != 200:
                logger.error(f"API ошибка {response.status_code} на {endpoint}: {response.text}")
                raise HTTPException(status_code=500, detail="Ошибка связи с OpenVPN API")
            return response.json()
        except httpx.HTTPError as e:
            logger.warning(f"Попытка {attempt + 1} не удалась: {e}")
            if http_client:
                await http_client.aclose()
            http_client = None
            if attempt == max_retries - 1:
                logger.error("Все попытки подключения к OpenVPN API исчерпаны")
                raise HTTPException(status_code=500, detail="Не удалось подключиться к OpenVPN API")
        except Exception as e:
            logger.error(f"Неожиданная ошибка: {e}")
            raise HTTPException(status_code=500, detail="Внутренняя ошибка")


# --- Эндпоинты ---
@router.get("/status")
async def get_status():
    try:
        data = await api_request("GET", "/api/sessions")
        
        # Логируем структуру
        logger.info(f"Получены данные /api/sessions: {type(data)} = {data}")

        if not isinstance(data, dict):
            logger.warning(f"Ожидался dict, получен {type(data)}")
            return {"clients": []}

        clients = []
        for username, info in data.items():
            if not isinstance(info, dict):
                continue

            # Парсим время подключения
            connected_since = info.get("connected_since", "")
            connected_timestamp = 0
            if isinstance(connected_since, str) and connected_since:
                try:
                    # Пример: "Mon Sep  1 10:22:33 2025"
                    dt = time.strptime(connected_since, "%a %b %d %H:%M:%S %Y")
                    connected_timestamp = int(time.mktime(dt))
                except Exception as e:
                    logger.warning(f"Не удалось распарсить дату: {connected_since}")
                    connected_timestamp = int(time.time()) - 3600
            elif isinstance(connected_since, (int, float)):
                connected_timestamp = int(connected_since)

            clients.append({
                "commonName": username,
                "realAddress": info.get("real_address", "N/A"),
                "virtualAddress": info.get("virtual_address", "N/A"),
                "bytesReceived": info.get("bytes_received", 0),
                "bytesSent": info.get("bytes_sent", 0),
                "connectedSince": connected_timestamp,
            })

        return {"clients": clients}

    except Exception as e:
        logger.error(f"Ошибка в /status: {e}", exc_info=True)
        return {"clients": []}


@router.get("/server-status")
async def get_server_status():
    try:
        users = await api_request("GET", "/api/users")
        connections = await api_request("GET", "/api/sessions")
        active_clients = len(connections)

        # Подсчёт трафика
        total_in = sum(info.get("bytes_received", 0) for info in connections.values())
        total_out = sum(info.get("bytes_sent", 0) for info in connections.values())

        total_profiles = len([u for u in users if u not in ["__DEFAULT__"] and "default" not in users[u].get("type", "")])

        return {
            "totalClients": 2048,
            "activeClients": active_clients,
            "totalProfiles": total_profiles,
            "serverStatus": "online",
            "totalTrafficIn": total_in,
            "totalTrafficOut": total_out,
        }
    except Exception as e:
        logger.error(f"Ошибка в /server-status: {e}")
        return {
            "totalClients": 2048,
            "activeClients": 0,
            "totalProfiles": 0,
            "serverStatus": "offline",
            "totalTrafficIn": 0,
            "totalTrafficOut": 0,
        }


@router.get("/profiles")
async def get_profiles():
    try:
        users = await api_request("GET", "/api/users")
        profiles = []
        for username, info in users.items():
            if username in ["__DEFAULT__"] or "default" in info.get("type", ""):
                continue
            # Определяем группы
            type_val = info.get("type", "")
            groups = [g.replace("group_", "") for g in type_val.split(",") if g.startswith("group_")]
            prop_type = ",".join(groups) if groups else ""

            profiles.append({
                "commonName": username,
                "allow_web_login": info.get("allow_web_login", "true"),
                "auto_login": info.get("prop_autologin", "false"),
                "disabled": info.get("disabled", "false"),
                "expiration_date": info.get("expiration_date"),
                "prop_password": info.get("password", ""),
                "prop_type": prop_type  # для групп
            })
        return {"profiles": profiles}
    except Exception as e:
        logger.error(f"Ошибка в /profiles: {e}")
        return {"profiles": []}


@router.get("/server-settings")
async def get_server_settings():
    try:
        config = await api_request("GET", "/api/config")
        return {
            "server_port": config.get("port", "443"),
            "protocol": config.get("proto", "tcp"),
            "cipher": config.get("cipher", "AES-256-GCM"),
            "auth": config.get("auth", "SHA256"),
            "server_network": config.get("server_network", "10.8.0.0"),
            "server_netmask": config.get("server_netmask", "255.255.255.0"),
            "push_routes": config.get("push", ""),
            "duplicate_cn": str(config.get("duplicate_cn", False)).lower(),
            "client_to_client": str(config.get("client_to_client", False)).lower(),
        }
    except Exception as e:
        logger.error(f"Ошибка в /server-settings: {e}")
        # Fallback
        return {
            "server_port": "443",
            "protocol": "tcp",
            "cipher": "AES-256-GCM",
            "auth": "SHA256",
            "server_network": "10.8.0.0",
            "server_netmask": "255.255.255.0",
            "push_routes": "",
            "duplicate_cn": "false",
            "client_to_client": "false"
        }


@router.get("/historical-data")
async def get_historical_data(start: int = Query(...), end: int = Query(...)):
    # Временно: генерируем фейковые данные
    import random
    data = []
    current = start
    while current <= end:
        data.append({
            "timestamp": current,
            "active_clients": random.randint(5, 50),
            "traffic_in": random.randint(500_000_000, 2_000_000_000),
            "traffic_out": random.randint(100_000_000, 800_000_000),
        })
        current += 3600  # каждый час
    return {"data": data}


@router.get("/groups")
async def get_groups():
    try:
        users = await api_request("GET", "/api/users")
        group_users_map = {}
        for username, info in users.items():
            if username == "__DEFAULT__":
                continue
            types = info.get("type", "").split(",")
            for t in types:
                if t.startswith("group_"):
                    group_name = t.replace("group_", "")
                    if group_name not in group_users_map:
                        group_users_map[group_name] = []
                    group_users_map[group_name].append(username)

        groups = []
        for name, user_list in group_users_map.items():
            groups.append({
                "name": name,
                "access": "allow",
                "users": user_list
            })

        # Если групп нет — создадим демо
        if not groups:
            groups = [
                {"name": "developers", "access": "allow", "users": ["alice", "bob"]},
                {"name": "managers", "access": "allow", "users": ["charlie"]}
            ]

        return {"groups": groups}
    except Exception as e:
        logger.error(f"Ошибка в /groups: {e}")
        return {"groups": []}


# --- Управление (заглушки) ---
@router.post("/create-profile")
async def create_profile(data: ProfileRequest):
    # Возвращаем dummy .ovpn файл
    ovpn_content = f"""
client
dev tun
proto {data.protocol or 'tcp'}
remote 192.1.66.117 {data.server_port or '443'}
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
cipher AES-256-GCM
auth SHA256
verb 3
<ca>
-----BEGIN CERTIFICATE-----
...
-----END CERTIFICATE-----
</ca>
<cert>
-----BEGIN CERTIFICATE-----
...
-----END CERTIFICATE-----
</cert>
<key>
-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----
</key>
"""
    headers = {"Content-Disposition": f'attachment; filename="{data.clientName}.ovpn"'}
    return Response(content=ovpn_content, media_type="application/x-openvpn-profile", headers=headers)


@router.post("/download-profile")
async def download_profile(data: ProfileRequest):
    return await create_profile(data)


@router.delete("/delete-profile")
async def delete_profile(data: ProfileRequest):
    return {"detail": f"Профиль {data.clientName} удалён"}


@router.post("/modify-profile")
async def modify_profile(data: ModifyProfileRequest):
    return {"detail": f"Профиль {data.clientName} изменён: {data.propKey}={data.propValue}"}


@router.post("/disconnect-client")
async def disconnect_client(data: DisconnectRequest):
    return {"detail": f"Клиент {data.clientName} отключён"}


@router.post("/update-config")
async def update_config(config: ServerConfig):
    return {"detail": "Конфигурация обновлена"}


@router.post("/create-group")
async def create_group(data: GroupRequest):
    return {"detail": f"Группа {data.groupName} создана"}


@router.post("/update-user-groups")
async def update_user_groups(data: UserGroupsRequest):
    return {"detail": f"Группы пользователя {data.userName} обновлены"}


# --- FastAPI приложение ---
app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://192.1.66.117:3000", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": time.time()}