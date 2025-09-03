#!/usr/bin/env python3
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
import asyncio

# Загрузка переменных окружения
load_dotenv()

# Настройка логирования
logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

# --- Настройки вашего API ---
VPN_STATUS_API_URL = os.getenv("VPN_STATUS_API_URL", "http://192.1.66.143:8081")
API_TIMEOUT = 10.0
VERIFY_SSL = False

# Глобальный клиент
http_client: httpx.AsyncClient | None = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global http_client
    try:
        http_client = httpx.AsyncClient(
            verify=VERIFY_SSL,
            timeout=API_TIMEOUT,
            follow_redirects=True
        )
        logger.info("✅ HTTP клиент инициализирован")
    except Exception as e:
        logger.critical(f"❌ Не удалось инициализировать HTTP клиент: {e}")
        raise
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
    realAddress: Optional[str] = None

class GroupRequest(BaseModel):
    groupName: str

class UserGroupsRequest(BaseModel):
    userName: str
    groups: List[str]

class ServerConfig(BaseModel):
    server_port: Optional[str] = "943"
    protocol: Optional[str] = "tcp"
    cipher: Optional[str] = "AES-256-GCM"
    auth: Optional[str] = "SHA256"
    server_network: Optional[str] = "10.8.0.0"
    server_netmask: Optional[str] = "255.255.255.0"
    push_routes: Optional[str] = ""
    duplicate_cn: Optional[str] = "false"
    client_to_client: Optional[str] = "false"

class SacliRequest(BaseModel):
    params: Dict[str, Any] = {}

# --- Безопасная функция запроса ---
async def vpn_api_request(endpoint: str = "/status", method: str = "GET", params: Dict[str, Any] = None):
    global http_client
    max_retries = 3
    for attempt in range(max_retries):
        try:
            if http_client is None:
                http_client = httpx.AsyncClient(
                    verify=VERIFY_SSL,
                    timeout=API_TIMEOUT,
                    follow_redirects=True
                )
            
            url = f"{VPN_STATUS_API_URL}{endpoint}"
            if method == "GET":
                response = await http_client.get(url, params=params)
            elif method == "POST":
                response = await http_client.post(url, json=params)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            if response.status_code != 200:
                logger.error(f"API ошибка {response.status_code} на {url}: {response.text}")
                raise HTTPException(status_code=500, detail=f"Ошибка связи с VPN API: {response.text}")
            
            data = response.json()
            if not data.get("success", True):  # Для /sacli/<command> success может отсутствовать
                raise HTTPException(status_code=500, detail=data.get("error", "Unknown error"))
            
            return data
            
        except httpx.HTTPError as e:
            logger.warning(f"Попытка {attempt + 1} не удалась: {e}")
            if attempt == max_retries - 1:
                logger.error("Все попытки подключения к VPN API исчерпаны")
                raise HTTPException(status_code=500, detail="Не удалось подключиться к VPN API")
            await asyncio.sleep(1)  # Wait before retry
        except Exception as e:
            logger.error(f"Неожиданная ошибка: {e}")
            raise HTTPException(status_code=500, detail="Внутренняя ошибка")

# --- Эндпоинты ---
@router.get("/status")
async def get_status():
    try:
        data = await vpn_api_request("/status")
        return {
            "clients": data.get("clients", []),
            "serverStats": data.get("serverStats", {})
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Ошибка в /status: {e}")
        return {"clients": [], "serverStats": {}}

@router.get("/server-status")
async def get_server_status():
    try:
        data = await vpn_api_request("/status")
        return data.get("serverStats", {})
    except HTTPException as e:
        raise e
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
        data = await vpn_api_request("/status")
        return {"profiles": data.get("profiles", [])}
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Ошибка в /profiles: {e}")
        return {"profiles": []}

@router.get("/server-settings")
async def get_server_settings():
    try:
        data = await vpn_api_request("/status")
        return data.get("serverConfig", {})
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Ошибка в /server-settings: {e}")
        return {
            "server_port": "943",
            "protocol": "tcp",
            "cipher": "AES-256-GCM",
            "auth": "SHA256",
            "server_network": "10.8.0.0",
            "server_netmask": "255.255.255.0",
            "push_routes": "",
            "duplicate_cn": "false",
            "client_to_client": "false"
        }

@router.get("/groups")
async def get_groups():
    try:
        data = await vpn_api_request("/status")
        return {"groups": data.get("groups", [])}
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Ошибка в /groups: {e}")
        return {"groups": []}

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

@router.post("/create-profile")
async def create_profile(data: ProfileRequest):
    try:
        # Установка свойств пользователя
        params = {
            "user": data.clientName,
            "key": "prop_autologin",
            "value": data.prop_autologin
        }
        if data.allow_web_login:
            params["allow_web_login"] = data.allow_web_login
        if data.expiration_date:
            params["expiration_date"] = data.expiration_date
        
        # Выполняем команду UserPropPut для создания/обновления профиля
        result = await vpn_api_request(f"/sacli/UserPropPut", method="POST", params=params)
        
        # Если есть пароль, устанавливаем его
        if data.password:
            password_params = {
                "user": data.clientName,
                "new_pass": data.password
            }
            await vpn_api_request(f"/sacli/SetLocalPassword", method="POST", params=password_params)
        
        return {"detail": f"Profile for {data.clientName} created successfully", "result": result}
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Ошибка в /create-profile: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка создания профиля: {str(e)}")

@router.post("/download-profile")
async def download_profile(data: ProfileRequest):
    try:
        # Получение профиля пользователя
        params = {"user": data.clientName}
        if data.prop_autologin == "true":
            endpoint = "/sacli/GetAutologin"
        else:
            endpoint = "/sacli/GetUserlogin"
        
        result = await vpn_api_request(endpoint, method="GET", params=params)
        
        # Предполагается, что результат содержит текстовую конфигурацию
        return Response(
            content=result.get("result", ""),
            media_type="application/x-openvpn-profile",
            headers={"Content-Disposition": f"attachment; filename={data.clientName}.ovpn"}
        )
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Ошибка в /download-profile: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка скачивания профиля: {str(e)}")

@router.delete("/delete-profile")
async def delete_profile(data: ProfileRequest):
    try:
        # Удаление профиля пользователя
        params = {"user": data.clientName}
        result = await vpn_api_request("/sacli/RevokeUser", method="POST", params=params)
        return {"detail": f"Profile for {data.clientName} deleted successfully", "result": result}
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Ошибка в /delete-profile: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка удаления профиля: {str(e)}")

@router.post("/disconnect-client")
async def disconnect_client(data: DisconnectRequest):
    try:
        params = {"user": data.clientName}
        if data.realAddress:
            params["real_address"] = data.realAddress
        
        result = await vpn_api_request("/sacli/DisconnectUser", method="POST", params=params)
        return {"detail": f"Client {data.clientName} disconnected successfully", "result": result}
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Ошибка в /disconnect-client: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка отключения клиента: {str(e)}")

@router.post("/update-config")
async def update_config(config: ServerConfig):
    try:
        # Обновление конфигурации сервера
        params = {}
        for key, value in config.dict(exclude_unset=True).items():
            params[key] = value
        
        result = await vpn_api_request("/sacli/ConfigPut", method="POST", params=params)
        return {"detail": "Server configuration updated successfully", "result": result}
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Ошибка в /update-config: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка обновления конфигурации: {str(e)}")

@router.post("/create-group")
async def create_group(data: GroupRequest):
    try:
        # Создание группы (добавление в user properties с type=group_<name>)
        params = {
            "key": "type",
            "value": f"group_{data.groupName}"
        }
        result = await vpn_api_request("/sacli/UserPropPut", method="POST", params=params)
        return {"detail": f"Group {data.groupName} created successfully", "result": result}
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Ошибка в /create-group: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка создания группы: {str(e)}")

@router.post("/update-user-groups")
async def update_user_groups(data: UserGroupsRequest):
    try:
        # Обновление групп пользователя
        params = {
            "user": data.userName,
            "key": "type",
            "value": ",".join([f"group_{group}" for group in data.groups])
        }
        result = await vpn_api_request("/sacli/UserPropPut", method="POST", params=params)
        return {"detail": f"Groups for user {data.userName} updated successfully", "result": result}
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Ошибка в /update-user-groups: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка обновления групп: {str(e)}")

@router.get("/sacli/{command}")
async def sacli_get(command: str, params: Dict[str, Any] = Depends(lambda: dict(Query(...)))):
    try:
        result = await vpn_api_request(f"/sacli/{command}", method="GET", params=params)
        return {"detail": f"Command {command} executed successfully", "result": result}
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Ошибка в /sacli/{command}: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка выполнения команды {command}: {str(e)}")

@router.post("/sacli/{command}")
async def sacli_post(command: str, data: SacliRequest):
    try:
        result = await vpn_api_request(f"/sacli/{command}", method="POST", params=data.params)
        return {"detail": f"Command {command} executed successfully", "result": result}
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Ошибка в /sacli/{command}: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка выполнения команды {command}: {str(e)}")

# --- Инициализация приложения ---
app = FastAPI(lifespan=lifespan)
app.include_router(router)

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)