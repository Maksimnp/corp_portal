# backend/api/serverstat.py — исправленная версия
import json
import os
import asyncio
import aiohttp
import socket
import logging
import time
import threading
import uuid
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field, validator, ConfigDict, field_validator
from typing import List, Optional, Literal, Dict, Any
from enum import Enum
from collections import defaultdict
import ssl

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/servers", tags=["server-monitor"])

DATA_DIR = "data"
SERVERS_FILE = os.path.join(DATA_DIR, "servers.json")
MAX_SERVERS = 100  # Ограничение количества серверов
os.makedirs(DATA_DIR, exist_ok=True)

# === Безопасный кэш с блокировкой ===
class StatusCache:
    def __init__(self, ttl_seconds: int = 10):
        self.data = None
        self.timestamp = None
        self.expires_at = None
        self.ttl = ttl_seconds
        self.lock = threading.RLock()
    
    def get(self):
        with self.lock:
            if self.data is not None and self.expires_at is not None:
                now = datetime.now()
                if now < self.expires_at:
                    return self.data
            return None
    
    def set(self, data):
        with self.lock:
            self.data = data
            self.timestamp = datetime.now()
            self.expires_at = self.timestamp + timedelta(seconds=self.ttl)
    
    def clear(self):
        with self.lock:
            self.data = None
            self.timestamp = None
            self.expires_at = None

_status_cache = StatusCache(ttl_seconds=10)

# === Модели данных ===
class CheckType(str, Enum):
    HTTP = "http"
    HTTPS = "https"
    TCP = "tcp"

class ServerIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Название устройства")
    host: str = Field(..., description="IP адрес или доменное имя")
    port: int = Field(default=443, ge=1, le=65535, description="Порт устройства")
    check_type: CheckType = Field(default=CheckType.HTTPS, description="Тип проверки")
    path: str = Field(default="/", description="Путь для HTTP проверки")
    location: str = Field(default="Локальная сеть", description="Местоположение устройства")
    timeout: float = Field(default=5.0, ge=0.5, le=30.0, description="Таймаут в секундах")
    retries: int = Field(default=1, ge=1, le=5, description="Количество попыток")
    
    model_config = ConfigDict(from_attributes=True)
    
    @field_validator('host')
    def validate_host(cls, v):
        if not v or len(v.strip()) == 0:
            raise ValueError('Host не может быть пустым')
        if len(v) > 255:
            raise ValueError('Host слишком длинный')
        return v.strip()
    
    @field_validator('path')
    def validate_path(cls, v, info):
        check_type = info.data.get('check_type', CheckType.HTTPS)
        if check_type == CheckType.TCP:
            return ""  # Для TCP путь не используется
        if not v.startswith('/'):
            return '/' + v
        return v
    
    @field_validator('timeout')
    def validate_timeout(cls, v):
        return min(max(v, 0.5), 30.0)

class ServerStatus(BaseModel):
    id: str
    name: str
    host: str
    port: int
    check_type: CheckType
    path: str
    location: str
    status: Literal["online", "offline", "checking", "error"]
    latency: float = Field(ge=0, description="Задержка в миллисекундах")
    timestamp: str
    last_check: str
    message: Optional[str] = None

class StatusResponse(BaseModel):
    servers: List[ServerStatus]
    updated_at: str
    total_online: int
    total_offline: int
    total_checking: int
    statistics: Dict[str, Any]

class TestConnectionResponse(BaseModel):
    host: str
    port: int
    type: str
    latency: float
    status: Literal["online", "offline"]
    timestamp: str
    message: Optional[str] = None

class ServerListResponse(BaseModel):
    servers: List[Dict[str, Any]]
    count: int

# === Работа с файлом ===
def load_servers() -> List[Dict[str, Any]]:
    """Загрузка списка серверов из файла с валидацией"""
    try:
        if not os.path.exists(SERVERS_FILE):
            logger.info(f"Файл {SERVERS_FILE} не найден, создаем тестовые данные")
            default_servers = [
                {
                    "id": str(uuid.uuid4()),
                    "name": "Google",
                    "host": "google.com",
                    "port": 443,
                    "check_type": "https",
                    "path": "/",
                    "location": "Глобальный",
                    "timeout": 5.0,
                    "retries": 2
                },
                {
                    "id": str(uuid.uuid4()),
                    "name": "Yandex",
                    "host": "yandex.ru",
                    "port": 443,
                    "check_type": "https",
                    "path": "/",
                    "location": "Россия",
                    "timeout": 5.0,
                    "retries": 2
                },
                {
                    "id": str(uuid.uuid4()),
                    "name": "Локальный сервер",
                    "host": "localhost",
                    "port": 8080,
                    "check_type": "http",
                    "path": "/",
                    "location": "Локальная сеть",
                    "timeout": 2.0,
                    "retries": 3
                }
            ]
            save_servers(default_servers)
            return default_servers
        
        with open(SERVERS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            if not isinstance(data, list):
                logger.error(f"Неверный формат данных в {SERVERS_FILE}")
                return []
            
            validated_servers = []
            for server in data:
                if not isinstance(server, dict):
                    continue
                
                server_id = server.get("id")
                if not server_id:
                    server_id = str(uuid.uuid4())
                
                # Проверяем уникальность ID
                if any(s["id"] == server_id for s in validated_servers):
                    server_id = str(uuid.uuid4())
                
                # Валидация типа проверки
                check_type = server.get("check_type", "https")
                if check_type not in ["http", "https", "tcp"]:
                    check_type = "https"
                
                # Нормализуем данные
                validated_server = {
                    "id": str(server_id),
                    "name": str(server.get("name", "Без имени")).strip(),
                    "host": str(server.get("host", "")).strip(),
                    "port": int(server.get("port", 80 if check_type == "http" else 443)),
                    "check_type": check_type,
                    "path": str(server.get("path", "/")).strip(),
                    "location": str(server.get("location", "Неизвестно")).strip(),
                    "timeout": float(server.get("timeout", 5.0)),
                    "retries": int(server.get("retries", 1))
                }
                
                # Корректируем путь для TCP
                if validated_server["check_type"] == "tcp":
                    validated_server["path"] = ""
                elif not validated_server["path"].startswith('/'):
                    validated_server["path"] = '/' + validated_server["path"]
                
                # Валидация порта
                if not (1 <= validated_server["port"] <= 65535):
                    validated_server["port"] = 443 if check_type in ["https", "tcp"] else 80
                
                validated_servers.append(validated_server)
            
            logger.info(f"Загружено {len(validated_servers)} валидированных серверов")
            return validated_servers[:MAX_SERVERS]
            
    except json.JSONDecodeError as e:
        logger.error(f"Ошибка парсинга JSON в {SERVERS_FILE}: {e}")
        # Создаем новый файл с дефолтными данными
        default_servers = [
            {
                "id": str(uuid.uuid4()),
                "name": "Резервный сервер",
                "host": "google.com",
                "port": 443,
                "check_type": "https",
                "path": "/",
                "location": "Глобальный",
                "timeout": 5.0,
                "retries": 2
            }
        ]
        save_servers(default_servers)
        return default_servers
    except Exception as e:
        logger.error(f"Ошибка загрузки серверов: {e}", exc_info=True)
        return []

def save_servers(servers: List[Dict[str, Any]]) -> bool:
    """Сохранение списка серверов в файл"""
    try:
        if len(servers) > MAX_SERVERS:
            logger.warning(f"Количество серверов ({len(servers)}) превышает максимум {MAX_SERVERS}")
            servers = servers[:MAX_SERVERS]
        
        # Создаем временный файл для безопасного сохранения
        temp_file = SERVERS_FILE + ".tmp"
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(servers, f, ensure_ascii=False, indent=2)
        
        # Заменяем оригинальный файл
        if os.path.exists(SERVERS_FILE):
            os.replace(temp_file, SERVERS_FILE)
        else:
            os.rename(temp_file, SERVERS_FILE)
        
        logger.info(f"Сохранено {len(servers)} серверов в файл")
        return True
    except Exception as e:
        logger.error(f"Ошибка сохранения серверов: {e}")
        return False

# === Утилиты для работы с сетью ===
def is_local_network(host: str) -> bool:
    """Проверяет, является ли хост локальным адресом"""
    try:
        # Пробуем разрешить домен
        ip = socket.gethostbyname(host)
        
        # Проверяем локальные диапазоны
        if ip.startswith('192.168.'):
            return True
        if ip.startswith('10.'):
            return True
        if ip.startswith('172.') and 16 <= int(ip.split('.')[1]) <= 31:
            return True
        if ip.startswith('127.'):
            return True
        if ip == 'localhost':
            return True
        if ip == '::1':
            return True
            
        return False
    except (socket.gaierror, ValueError):
        # Если не удалось разрешить, проверяем по паттерну
        host_lower = host.lower()
        if host_lower in ['localhost', 'local']:
            return True
        if host_lower.startswith(('192.168.', '10.', '172.16.', '172.17.', '172.18.', '172.19.', 
                           '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.',
                           '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.',
                           '127.', 'localhost')):
            return True
        return False
    except Exception:
        return False

def get_port_description(port: int) -> str:
    """Возвращает описание порта"""
    port_descriptions = {
        80: "HTTP",
        443: "HTTPS",
        22: "SSH",
        3389: "RDP",
        21: "FTP",
        25: "SMTP",
        110: "POP3",
        143: "IMAP",
        3306: "MySQL",
        5432: "PostgreSQL",
        27017: "MongoDB",
        554: "RTSP (камера)",
        9100: "Принтер",
        515: "LPR (принтер)",
        161: "SNMP",
        389: "LDAP",
        636: "LDAPS",
        8080: "HTTP Alt",
        8443: "HTTPS Alt",
        5900: "VNC",
        23: "Telnet",
        53: "DNS",
        123: "NTP",
        445: "SMB",
        548: "AFP"
    }
    return port_descriptions.get(port, f"Порт {port}")

# === Проверка соединений ===
async def check_tcp_connection(host: str, port: int, timeout: float = 3.0) -> float:
    """Проверка TCP соединения с использованием time.perf_counter"""
    start_time = time.perf_counter()
    
    try:
        # Для локальных хостов уменьшаем таймаут
        if is_local_network(host):
            timeout = min(timeout, 1.5)
        
        # Используем asyncio.open_connection для асинхронной проверки
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port),
            timeout=timeout
        )
        
        writer.close()
        await writer.wait_closed()
        
        latency = round((time.perf_counter() - start_time) * 1000, 2)
        logger.debug(f"TCP {host}:{port} - успешно, задержка: {latency}мс")
        return max(1.0, latency)  # Минимум 1 мс
        
    except asyncio.TimeoutError:
        logger.debug(f"TCP {host}:{port} - таймаут ({timeout}с)")
        return -1
    except ConnectionRefusedError:
        logger.debug(f"TCP {host}:{port} - соединение отклонено")
        return -1
    except OSError as e:
        logger.debug(f"TCP {host}:{port} - ошибка ОС: {e}")
        return -1
    except Exception as e:
        logger.debug(f"TCP {host}:{port} - ошибка: {e}")
        return -1

async def check_http_connection(host: str, port: int, path: str = "/", timeout: float = 5.0, 
                              use_ssl: bool = True) -> float:
    """Проверка HTTP/HTTPS соединения"""
    start_time = time.perf_counter()
    
    try:
        scheme = "https" if use_ssl else "http"
        
        # Формируем URL
        if (use_ssl and port == 443) or (not use_ssl and port == 80):
            url = f"{scheme}://{host}{path}"
        else:
            url = f"{scheme}://{host}:{port}{path}"
        
        logger.info(f"HTTP проверка: {url}")
        
        # Специальные настройки для Google и других популярных сайтов
        ssl_context = None
        if use_ssl:
            import ssl
            
            # Создаем SSL контекст с современными настройками
            ssl_context = ssl.create_default_context(ssl.Purpose.SERVER_AUTH)
            
            # Отключаем старые небезопасные протоколы
            ssl_context.minimum_version = ssl.TLSVersion.TLSv1_2
            
            # Для Google устанавливаем свой User-Agent
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'close'
            }
            
            # Дополнительные настройки для популярных сайтов
            if host.lower() in ['google.com', 'www.google.com']:
                # Явно указываем доверенные корневые сертификаты
                ssl_context.load_default_certs()
                # Добавляем более широкий список шифров
                ssl_context.set_ciphers('ECDHE+AESGCM:ECDHE+CHACHA20:DHE+AESGCM:DHE+CHACHA20:ECDH+AESGCM:ECDH+CHACHA20:DH+AESGCM:DH+CHACHA20:RSA+AESGCM:RSA+AES:RSA+HIGH:!aNULL:!eNULL:!MD5:!DSS')
        else:
            headers = {
                'User-Agent': 'ServerMonitor/2.0',
                'Accept': '*/*',
                'Connection': 'close'
            }
        
        # Для локальных хостов уменьшаем таймаут
        if is_local_network(host):
            timeout = min(timeout, 2.0)
        
        timeout_obj = aiohttp.ClientTimeout(
            total=timeout,
            connect=2,
            sock_read=3,
            sock_connect=2
        )
        
        connector = aiohttp.TCPConnector(
            ssl=ssl_context if use_ssl else False,
            limit=1,
            force_close=True,
            enable_cleanup_closed=True
        )
        
        async with aiohttp.ClientSession(
            timeout=timeout_obj,
            headers=headers,
            connector=connector
        ) as session:
            
            try:
                async with session.get(url) as response:
                    # Принимаем любые коды ответа как успех соединения
                    # Главное - что сервер ответил
                    if response.status is not None:
                        latency = round((time.perf_counter() - start_time) * 1000, 2)
                        logger.info(f"HTTP {host}:{port} - статус {response.status}, задержка: {latency}мс")
                        return max(1.0, latency)
                    else:
                        return -1
                        
            except aiohttp.ClientSSLError as e:
                logger.warning(f"SSL ошибка для {host}: {e}")
                # Пробуем без SSL если с SSL не получилось
                if use_ssl and port == 443:
                    logger.info(f"Пробуем HTTP для {host} вместо HTTPS")
                    return await check_http_connection(host, 80, path, timeout, use_ssl=False)
                return -1
                
            except aiohttp.ClientConnectorError as e:
                logger.debug(f"Ошибка соединения с {host}: {e}")
                return -1
                
    except asyncio.TimeoutError:
        logger.debug(f"HTTP {host}:{port} - таймаут ({timeout}с)")
        return -1
    except Exception as e:
        logger.debug(f"HTTP {host}:{port} - общая ошибка: {e}")
        return -1
async def check_server_with_retry(server: Dict[str, Any]) -> ServerStatus:
    """Проверка одного сервера с повторными попытками"""
    server_id = server.get("id", str(uuid.uuid4()))
    server_name = server.get("name", "Без имени")
    host = server.get("host", "").strip()
    port = server.get("port", 443)
    check_type = server.get("check_type", "https")
    path = server.get("path", "/")
    location = server.get("location", "Локальная сеть")
    timeout = server.get("timeout", 5.0)
    retries = server.get("retries", 1)
    
    if not host:
        return ServerStatus(
            id=server_id,
            name=server_name,
            host=host,
            port=port,
            check_type=CheckType(check_type),
            path=path if check_type != "tcp" else "",
            location=location,
            status="error",
            latency=0,
            timestamp=datetime.now().isoformat(),
            last_check=datetime.now().isoformat(),
            message="Не указан host"
        )
    
    best_latency = -1
    last_error = None
    
    # Пробуем несколько раз
    for attempt in range(retries):
        try:
            latency = -1
            
            if check_type == "tcp":
                latency = await check_tcp_connection(host, port, timeout)
            elif check_type == "https":
                latency = await check_http_connection(host, port, path, timeout, use_ssl=True)
            else:  # http
                latency = await check_http_connection(host, port, path, timeout, use_ssl=False)
            
            if latency > 0:
                if best_latency == -1 or latency < best_latency:
                    best_latency = latency
                # Если успешно, выходим
                if attempt == 0:
                    break
            
            if attempt < retries - 1:
                await asyncio.sleep(0.5)  # Небольшая задержка между попытками
                
        except Exception as e:
            last_error = str(e)
            logger.warning(f"Попытка {attempt + 1} для {host}:{port} - ошибка: {e}")
    
    # Определяем статус
    status = "online" if best_latency > 0 else "offline"
    message = None
    
    if status == "online":
        message = f"Задержка: {best_latency}мс"
    else:
        message = last_error or "Не удалось установить соединение"
    
    return ServerStatus(
        id=server_id,
        name=server_name,
        host=host,
        port=port,
        check_type=CheckType(check_type),
        path=path if check_type != "tcp" else "",
        location=location,
        status=status,
        latency=max(0, best_latency),
        timestamp=datetime.now().isoformat(),
        last_check=datetime.now().isoformat(),
        message=message
    )

async def check_server(server: Dict[str, Any]) -> ServerStatus:
    """Проверка одного сервера (обертка для совместимости)"""
    return await check_server_with_retry(server)

# === Основные эндпоинты ===
@router.get("/status", response_model=StatusResponse)
async def get_status(background_tasks: BackgroundTasks):
    """
    Получение статуса всех серверов.
    Использует кэширование для уменьшения нагрузки.
    """
    try:
        # Проверяем кэш
        cached_data = _status_cache.get()
        if cached_data is not None:
            logger.debug("Возвращаем данные из кэша")
            return cached_data
        
        logger.info("=== Начало проверки статуса серверов ===")
        
        # Загружаем серверы
        servers_data = load_servers()
        logger.info(f"Загружено {len(servers_data)} серверов")
        
        if not servers_data:
            response = StatusResponse(
                servers=[],
                updated_at=datetime.now().strftime("%d.%m.%Y %H:%M:%S"),
                total_online=0,
                total_offline=0,
                total_checking=0,
                statistics={
                    "total_checks": 0,
                    "success_rate": 100,
                    "avg_response_time": 0,
                    "local_devices": 0,
                    "remote_devices": 0,
                    "port_distribution": {}
                }
            )
            _status_cache.set(response)
            return response
        
        # Ограничиваем одновременные проверки
        max_concurrent = min(20, len(servers_data))
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def check_with_semaphore(server):
            async with semaphore:
                return await check_server_with_retry(server)
        
        # Проверяем все серверы
        tasks = [check_with_semaphore(s) for s in servers_data]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        logger.info(f"results - {results}")
        # Обрабатываем результаты
        valid_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"Ошибка проверки сервера {i}: {result}")
                server = servers_data[i]
                valid_results.append(ServerStatus(
                    id=server.get("id", str(uuid.uuid4())),
                    name=server.get("name", "Ошибка"),
                    host=server.get("host", ""),
                    port=server.get("port", 0),
                    check_type=CheckType(server.get("check_type", "https")),
                    path=server.get("path", "/"),
                    location=server.get("location", "Локальная сеть"),
                    status="error",
                    latency=0,
                    timestamp=datetime.now().isoformat(),
                    last_check=datetime.now().isoformat(),
                    message=str(result)
                ))
            else:
                valid_results.append(result)
        
        # Рассчитываем статистику
        total_servers = len(valid_results)
        online_servers = sum(1 for r in valid_results if r.status == "online")
        offline_servers = sum(1 for r in valid_results if r.status == "offline")
        checking_servers = sum(1 for r in valid_results if r.status == "checking")
        error_servers = sum(1 for r in valid_results if r.status == "error")
        
        success_rate = round((online_servers / total_servers * 100), 2) if total_servers > 0 else 100
        
        # Средняя задержка для онлайн серверов
        online_latencies = [r.latency for r in valid_results if r.status == "online"]
        avg_latency = round(sum(online_latencies) / len(online_latencies), 2) if online_latencies else 0
        
        # Подсчет локальных устройств
        local_devices = sum(1 for s in servers_data if is_local_network(s.get('host', '')))
        
        # Распределение по портам
        port_distribution = defaultdict(int)
        for server in valid_results:
            port_desc = get_port_description(server.port)
            port_distribution[port_desc] += 1
        
        # Создаем ответ
        response = StatusResponse(
            servers=valid_results,
            updated_at=datetime.now().strftime("%d.%m.%Y %H:%M:%S"),
            total_online=online_servers,
            total_offline=offline_servers,
            total_checking=checking_servers,
            statistics={
                "total_checks": total_servers,
                "success_rate": success_rate,
                "avg_response_time": avg_latency,
                "local_devices": local_devices,
                "remote_devices": total_servers - local_devices,
                "port_distribution": dict(port_distribution),
                "error_devices": error_servers
            }
        )
        
        # Сохраняем в кэш
        _status_cache.set(response)
        
        # Запускаем фоновую задачу для логирования
        background_tasks.add_task(
            lambda: logger.info(f"=== Проверка завершена: {online_servers}/{total_servers} онлайн ===")
        )
        
        return response
        
    except Exception as e:
        logger.error(f"Критическая ошибка в /status: {e}", exc_info=True)
        return StatusResponse(
            servers=[],
            updated_at=datetime.now().strftime("%d.%m.%Y %H:%M:%S"),
            total_online=0,
            total_offline=0,
            total_checking=0,
            statistics={
                "total_checks": 0,
                "success_rate": 0,
                "avg_response_time": 0,
                "local_devices": 0,
                "remote_devices": 0,
                "port_distribution": {},
                "error": str(e)
            }
        )

@router.get("/test")
async def test_endpoint():
    """Тестовый эндпоинт для проверки работы API"""
    return {
        "message": "Server Monitor API работает",
        "version": "2.2",
        "timestamp": datetime.now().isoformat(),
        "features": [
            "Проверка HTTP/HTTPS/TCP серверов",
            "Поддержка локальных сетей",
            "Кэширование результатов",
            "Повторные попытки",
            "Детальная статистика",
            "Управление списком серверов"
        ],
        "endpoints": [
            "GET /servers/status - статус всех серверов",
            "GET /servers/list - список серверов",
            "GET /servers/check/{host}/{port} - проверка конкретного сервера",
            "GET /servers/test - этот эндпоинт",
            "GET /servers/statistics - статистика",
            "POST /servers/add - добавить сервер",
            "PUT /servers/edit/{id} - редактировать сервер",
            "DELETE /servers/delete/{id} - удалить сервер",
            "GET /servers/health - проверка здоровья сервиса",
            "POST /servers/clear-cache - очистить кэш"
        ]
    }

@router.get("/check/{host}/{port}", response_model=TestConnectionResponse)
async def check_single(
    host: str,
    port: int,
    check_type: CheckType = CheckType.HTTPS,
    path: str = "/",
    timeout: float = 5.0
):
    """
    Проверить конкретный хост и порт.
    Используется для тестирования соединения перед добавлением сервера.
    """
    try:
        logger.info(f"Тестирование соединения: {host}:{port} ({check_type})")
        
        latency = -1
        message = None
        
        if check_type == CheckType.TCP:
            latency = await check_tcp_connection(host, port, timeout)
            if latency > 0:
                message = f"TCP соединение успешно установлено. Задержка: {latency}мс"
            else:
                message = "Не удалось установить TCP соединение"
        elif check_type == CheckType.HTTPS:
            latency = await check_http_connection(host, port, path, timeout, use_ssl=True)
            if latency > 0:
                message = f"HTTPS запрос выполнен успешно. Задержка: {latency}мс"
            else:
                message = "Не удалось выполнить HTTPS запрос"
        else:  # HTTP
            latency = await check_http_connection(host, port, path, timeout, use_ssl=False)
            if latency > 0:
                message = f"HTTP запрос выполнен успешно. Задержка: {latency}мс"
            else:
                message = "Не удалось выполнить HTTP запрос"
        
        status = "online" if latency > 0 else "offline"
        
        return TestConnectionResponse(
            host=host,
            port=port,
            type=check_type.value,
            latency=latency if latency > 0 else 0,
            status=status,
            timestamp=datetime.now().isoformat(),
            message=message
        )
        
    except Exception as e:
        logger.error(f"Ошибка проверки {host}:{port}: {e}")
        return TestConnectionResponse(
            host=host,
            port=port,
            type=check_type.value,
            latency=0,
            status="offline",
            timestamp=datetime.now().isoformat(),
            message=f"Ошибка при проверке соединения: {str(e)}"
        )

@router.get("/list", response_model=ServerListResponse)
async def get_list():
    """Получить список всех серверов без проверки статуса"""
    try:
        servers = load_servers()
        return ServerListResponse(
            servers=servers,
            count=len(servers)
        )
    except Exception as e:
        logger.error(f"Ошибка получения списка серверов: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/add", response_model=Dict[str, Any])
async def add_server(server_in: ServerIn):
    """Добавить новый сервер в мониторинг"""
    try:
        servers = load_servers()
        
        # Проверяем лимит серверов
        if len(servers) >= MAX_SERVERS:
            raise HTTPException(
                status_code=400, 
                detail=f"Достигнут лимит серверов ({MAX_SERVERS}). Удалите некоторые серверы перед добавлением новых."
            )
        
        # Генерируем уникальный ID
        server_id = str(uuid.uuid4())
        
        # Проверяем уникальность имени
        existing_names = [s.get("name", "").lower() for s in servers]
        if server_in.name.lower() in existing_names:
            raise HTTPException(
                status_code=400,
                detail=f"Сервер с именем '{server_in.name}' уже существует"
            )
        
        # Создаем новый сервер
        new_server = {
            "id": server_id,
            **server_in.model_dump()
        }
        
        # Для TCP проверок очищаем путь
        if server_in.check_type == CheckType.TCP:
            new_server["path"] = ""
        
        servers.append(new_server)
        
        if save_servers(servers):
            # Очищаем кэш, так как данные изменились
            _status_cache.clear()
            
            logger.info(f"Добавлен новый сервер: {server_in.name} ({server_in.host}:{server_in.port})")
            
            return {
                "success": True,
                "server": new_server,
                "message": "Сервер успешно добавлен",
                "server_id": server_id
            }
        else:
            raise HTTPException(status_code=500, detail="Ошибка сохранения сервера")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка добавления сервера: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/edit/{server_id}", response_model=Dict[str, Any])
async def edit_server(server_id: str, server_in: ServerIn):
    """Редактировать существующий сервер"""
    try:
        servers = load_servers()
        
        found = False
        updated_server = None
        
        for i, s in enumerate(servers):
            if s.get("id") == server_id:
                # Проверяем уникальность имени (кроме текущего сервера)
                existing_names = [
                    serv.get("name", "").lower() 
                    for j, serv in enumerate(servers) 
                    if j != i
                ]
                if server_in.name.lower() in existing_names:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Сервер с именем '{server_in.name}' уже существует"
                    )
                
                # Обновляем сервер
                updated_server = {
                    "id": server_id,
                    **server_in.model_dump()
                }
                
                # Для TCP проверок очищаем путь
                if server_in.check_type == CheckType.TCP:
                    updated_server["path"] = ""
                
                servers[i] = updated_server
                found = True
                break
        
        if not found:
            raise HTTPException(status_code=404, detail="Сервер не найден")
        
        if save_servers(servers):
            # Очищаем кэш
            _status_cache.clear()
            
            logger.info(f"Отредактирован сервер ID {server_id}: {server_in.name}")
            
            return {
                "success": True,
                "server": updated_server,
                "message": "Сервер успешно обновлен"
            }
        else:
            raise HTTPException(status_code=500, detail="Ошибка сохранения изменений")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка редактирования сервера {server_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/delete/{server_id}", response_model=Dict[str, Any])
async def delete_server(server_id: str):
    """Удалить сервер из мониторинга"""
    try:
        servers = load_servers()
        initial_count = len(servers)
        
        # Находим сервер для удаления
        deleted_server_name = None
        for s in servers:
            if s.get("id") == server_id:
                deleted_server_name = s.get("name", "Неизвестный сервер")
                break
        
        new_servers = [s for s in servers if s.get("id") != server_id]
        
        if len(new_servers) == initial_count:
            raise HTTPException(status_code=404, detail="Сервер не найден")
        
        if save_servers(new_servers):
            # Очищаем кэш
            _status_cache.clear()
            
            logger.info(f"Удален сервер ID: {server_id} ({deleted_server_name})")
            
            return {
                "success": True,
                "message": f"Сервер '{deleted_server_name}' успешно удален",
                "deleted_id": server_id
            }
        else:
            raise HTTPException(status_code=500, detail="Ошибка сохранения изменений")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка удаления сервера {server_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/statistics")
async def get_statistics():
    """Получить дополнительную статистику"""
    try:
        cached_data = _status_cache.get()
        
        if cached_data is not None:
            data = cached_data
            cache_hit = True
        else:
            # Создаем фоновую задачу для проверки
            data = await get_status(BackgroundTasks())
            cache_hit = False
        
        servers = data.servers
        total = len(servers)
        online = data.total_online
        offline = data.total_offline
        
        if total == 0:
            return {
                "total_servers": 0,
                "online_servers": 0,
                "offline_servers": 0,
                "availability_rate": 100,
                "avg_response_time": 0,
                "check_types": {},
                "common_ports": {},
                "locations": {},
                "cache_hit": cache_hit,
                "last_updated": data.updated_at
            }
        
        # Статистика по типам проверок
        check_types = defaultdict(int)
        for server in servers:
            check_types[server.check_type.value] += 1
        
        # Статистика по портам
        common_ports = defaultdict(int)
        for server in servers:
            port_desc = get_port_description(server.port)
            common_ports[port_desc] += 1
        
        # Статистика по локациям
        locations = defaultdict(int)
        for server in servers:
            locations[server.location] += 1
        
        # Статистика по статусам
        statuses = defaultdict(int)
        for server in servers:
            statuses[server.status] += 1
        
        # Среднее время ответа
        online_servers = [s for s in servers if s.status == "online"]
        avg_response = round(
            sum(s.latency for s in online_servers) / len(online_servers), 2
        ) if online_servers else 0
        
        # Самый быстрый и самый медленный сервер
        fastest = min(online_servers, key=lambda x: x.latency, default=None)
        slowest = max(online_servers, key=lambda x: x.latency, default=None)
        
        return {
            "total_servers": total,
            "online_servers": online,
            "offline_servers": offline,
            "availability_rate": round((online / total) * 100, 2) if total > 0 else 0,
            "avg_response_time": avg_response,
            "check_types": dict(check_types),
            "common_ports": dict(sorted(common_ports.items(), key=lambda x: x[1], reverse=True)[:10]),
            "locations": dict(locations),
            "statuses": dict(statuses),
            "fastest_server": {
                "name": fastest.name if fastest else None,
                "latency": fastest.latency if fastest else None,
                "host": fastest.host if fastest else None
            },
            "slowest_server": {
                "name": slowest.name if slowest else None,
                "latency": slowest.latency if slowest else None,
                "host": slowest.host if slowest else None
            },
            "last_updated": data.updated_at,
            "cache_hit": cache_hit,
            "cache_ttl": _status_cache.ttl
        }
        
    except Exception as e:
        logger.error(f"Ошибка получения статистики: {e}")
        return {
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

@router.post("/clear-cache")
async def clear_cache():
    """Очистить кэш статуса серверов"""
    _status_cache.clear()
    
    return {
        "success": True,
        "message": "Кэш очищен",
        "timestamp": datetime.now().isoformat()
    }

@router.get("/health")
async def health_check():
    """Проверка здоровья сервиса"""
    try:
        # Проверяем доступность файла с данными
        file_exists = os.path.exists(SERVERS_FILE)
        
        # Проверяем возможность чтения/записи
        file_readable = False
        file_writable = False
        
        if file_exists:
            try:
                with open(SERVERS_FILE, "r", encoding="utf-8") as f:
                    json.load(f)
                file_readable = True
            except:
                file_readable = False
            
            try:
                with open(SERVERS_FILE, "a", encoding="utf-8") as f:
                    f.write("")
                file_writable = True
            except:
                file_writable = False
        
        # Проверяем наличие данных
        servers = load_servers()
        
        return {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "data_file": {
                "exists": file_exists,
                "readable": file_readable,
                "writable": file_writable,
                "path": SERVERS_FILE,
                "server_count": len(servers)
            },
            "cache": {
                "has_data": _status_cache.data is not None,
                "timestamp": _status_cache.timestamp.isoformat() if _status_cache.timestamp else None,
                "ttl": _status_cache.ttl
            },
            "system": {
                "max_servers": MAX_SERVERS,
                "data_dir": DATA_DIR,
                "python_version": os.sys.version
            }
        }
    except Exception as e:
        logger.error(f"Ошибка проверки здоровья: {e}")
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }

@router.get("/local-devices")
async def get_local_devices():
    """Получить список локальных устройств в сети"""
    try:
        servers = load_servers()
        local_servers = []
        
        for server in servers:
            host = server.get("host", "")
            if is_local_network(host):
                local_servers.append({
                    **server,
                    "is_local": True,
                    "port_description": get_port_description(server.get("port", 0))
                })
        
        return {
            "local_devices": local_servers,
            "count": len(local_servers),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Ошибка получения локальных устройств: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/refresh")
async def refresh_status(background_tasks: BackgroundTasks):
    """Принудительно обновить статус всех серверов"""
    # Очищаем кэш
    _status_cache.clear()
    
    # Запускаем фоновую задачу для проверки
    background_tasks.add_task(
        lambda: logger.info("Принудительное обновление статуса серверов")
    )
    
    return {
        "success": True,
        "message": "Кэш очищен, статус будет обновлен при следующем запросе",
        "timestamp": datetime.now().isoformat()
    }