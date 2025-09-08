from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime, timedelta
import logging
import os
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from services.jwt_utils import verify_token
from concurrent.futures import ThreadPoolExecutor
import asyncio
import routeros_api
import time

router = APIRouter(prefix="/serverstats", tags=["server-stats"])

logger = logging.getLogger(__name__)

# Модель данных для ответа
class ServerData(BaseModel):
    ip: str
    status: str
    onlineTime: str
    offlineTime: str
    trafficIn: str
    trafficOut: str
    failedTests: int = 0
    latency: str = "0ms"
    packetLoss: str = "0%"

# Модель для графиков
class TimeSeriesData(BaseModel):
    timestamp: str
    value: float

class TrafficData(BaseModel):
    ip: str
    bytesIn: List[TimeSeriesData]
    bytesOut: List[TimeSeriesData]
    packetsIn: List[TimeSeriesData]
    packetsOut: List[TimeSeriesData]

class LatencyData(BaseModel):
    ip: str
    latency: List[TimeSeriesData]
    packetLoss: List[TimeSeriesData]

# Модель для системной информации
class SystemInfo(BaseModel):
    cpuLoad: str
    memoryUsage: str
    uptime: str
    version: str

# Настройки MikroTik из переменных окружения
MIKROTIK_HOST = os.getenv("MIKROTIK_HOST", "192.1.3.154")
MIKROTIK_USERNAME = os.getenv("MIKROTIK_USERNAME", "mnp")
MIKROTIK_PASSWORD = os.getenv("MIKROTIK_PASSWORD", "Season24")
MIKROTIK_PORT = int(os.getenv("MIKROTIK_PORT", "8728"))

if not all([MIKROTIK_PASSWORD, MIKROTIK_USERNAME]):
    logger.critical("Переменные окружения MIKROTIK_PASSWORD или MIKROTIK_USERNAME не установлены")
    raise EnvironmentError("Переменные окружения MIKROTIK_PASSWORD или MIKROTIK_USERNAME не установлены")

# Пул потоков для синхронных операций
executor = ThreadPoolExecutor(max_workers=4)

# Проверка токена
security = HTTPBearer()

# Кэш для оптимизации запросов
cache = {}
CACHE_TTL = 300  # 5 минут

async def verify_token_dependency(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    user_data = verify_token(token)
    if not user_data:
        logger.warning(f"Недействительный или истёкший токен: {token[:10]}...")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный или истёкший токен")
    return user_data

def get_cached_data(key: str) -> Optional[Any]:
    """Получение данных из кэша"""
    if key in cache:
        data, timestamp = cache[key]
        if time.time() - timestamp < CACHE_TTL:
            return data
        else:
            del cache[key]
    return None

def set_cached_data(key: str, data: Any):
    """Сохранение данных в кэш"""
    cache[key] = (data, time.time())

def get_router_connection():
    """Создание подключения к роутеру"""
    return routeros_api.RouterOsApiPool(
        host=MIKROTIK_HOST,
        username=MIKROTIK_USERNAME,
        password=MIKROTIK_PASSWORD,
        port=MIKROTIK_PORT,
        plaintext_login=True
    )

def get_router_stats_sync(ips: List[str]):
    """Синхронное получение статистики"""
    connection = None
    try:
        # Проверяем кэш
        cache_key = f"stats_{','.join(ips)}"
        cached_data = get_cached_data(cache_key)
        if cached_data:
            return cached_data

        connection = get_router_connection()
        api = connection.get_api()

        logger.info("Получение данных Netwatch...")
        netwatch_data = api.get_resource('/tool/netwatch').get()

        logger.info("Получение данных о трафике...")
        queue_data = api.get_resource('/queue/simple').get()

        logger.info("Получение системной информации...")
        system_resource = api.get_resource('/system/resource').get()
        system_health = api.get_resource('/system/health').get()

        stats = []
        current_time = datetime.now()

        for ip in ips:
            status = 'offline'
            online_time = 0
            offline_time = 0
            traffic_in = 0.0
            traffic_out = 0.0
            failed_tests = 0
            latency = "0ms"
            packet_loss = "0%"

            # Поиск в Netwatch
            netwatch_entries = [entry for entry in netwatch_data if entry.get('host') == ip]
            if netwatch_entries:
                # Берем запись с самым поздним since
                netwatch_entries.sort(key=lambda e: parse_mikrotik_time(e.get('since', '1900-01-01 00:00:00')), reverse=True)
                entry = netwatch_entries[0]
                status_value = entry.get('status', '').lower()
                status = 'online' if status_value == 'up' else 'offline'
                failed_tests = int(entry.get('packet-count-lost', '0'))
                latency = entry.get('average-rtt', '0ms')
                packet_loss = entry.get('packet-loss', '0%')
                since = entry.get('since', '')
                if since:
                    try:
                        since_time = parse_mikrotik_time(since)
                        duration = (current_time - since_time).total_seconds()
                        if status == 'online':
                            online_time = duration
                        else:
                            offline_time = duration
                    except Exception as e:
                        logger.warning(f"Ошибка парсинга времени для IP {ip}: {e}")

            # Поиск в Queue
            queue_entry = next((entry for entry in queue_data if entry.get('target', '').split('/')[0] == ip), None)
            if queue_entry:
                try:
                    bytes_in = int(queue_entry.get('bytes-in', '0'))
                    bytes_out = int(queue_entry.get('bytes-out', '0'))
                    traffic_in = bytes_in / (1024 * 1024)
                    traffic_out = bytes_out / (1024 * 1024)
                except Exception as e:
                    logger.warning(f"Ошибка парсинга трафика для IP {ip}: {e}")

            stats.append(ServerData(
                ip=ip,
                status=status,
                onlineTime=format_duration(online_time),
                offlineTime=format_duration(offline_time),
                trafficIn=f"{traffic_in:.2f} MB",
                trafficOut=f"{traffic_out:.2f} MB",
                failedTests=failed_tests,
                latency=latency,
                packetLoss=packet_loss
            ))

        # Сохраняем в кэш
        set_cached_data(cache_key, stats)
        return stats

    except Exception as e:
        logger.error(f"Ошибка в get_router_stats_sync: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка подключения к роутеру: {str(e)}")
    finally:
        if connection:
            connection.disconnect()

def parse_limit(limit_str: str) -> int:
    """Парсинг лимита скорости (с суффиксами k, M, G)"""
    multipliers = {'k': 1000, 'M': 1000000, 'G': 1000000000}
    if limit_str[-1] in multipliers:
        return int(limit_str[:-1]) * multipliers[limit_str[-1]]
    return int(limit_str)

def get_traffic_history_sync(ip: str, hours: int = 24):
    """Получение истории трафика для IP"""
    connection = None
    try:
        cache_key = f"traffic_{ip}_{hours}"
        cached_data = get_cached_data(cache_key)
        if cached_data:
            return cached_data

        connection = get_router_connection()
        api = connection.get_api()

        # Получаем данные из интерфейсов (пример для ether1)
        interface_data = api.get_resource('/interface/monitor-traffic').get()
        
        # Получаем данные из очередей
        queue_data = api.get_resource('/queue/simple').get()
        
        # Формируем временные ряды
        bytes_in_data = []
        bytes_out_data = []
        packets_in_data = []
        packets_out_data = []

        # TODO: Для реальной истории трафика используйте внешнюю БД или скрипты для логирования данных со временем.
        # Здесь синтетические данные для демонстрации.
        now = datetime.now()
        for i in range(hours):
            timestamp = (now - timedelta(hours=i)).isoformat()
            bytes_in_data.append(TimeSeriesData(
                timestamp=timestamp,
                value=float(i * 1000000)  # 1MB/hour
            ))
            bytes_out_data.append(TimeSeriesData(
                timestamp=timestamp,
                value=float(i * 500000)   # 0.5MB/hour
            ))
            packets_in_data.append(TimeSeriesData(
                timestamp=timestamp,
                value=float(i * 1000)     # 1000 packets/hour
            ))
            packets_out_data.append(TimeSeriesData(
                timestamp=timestamp,
                value=float(i * 500)      # 500 packets/hour
            ))

        traffic_data = TrafficData(
            ip=ip,
            bytesIn=bytes_in_data,
            bytesOut=bytes_out_data,
            packetsIn=packets_in_data,
            packetsOut=packets_out_data
        )

        set_cached_data(cache_key, traffic_data)
        return traffic_data

    except Exception as e:
        logger.error(f"Ошибка в get_traffic_history_sync: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка получения истории трафика: {str(e)}")
    finally:
        if connection:
            connection.disconnect()

def get_latency_history_sync(ip: str, hours: int = 24):
    """Получение истории задержек для IP"""
    connection = None
    try:
        cache_key = f"latency_{ip}_{hours}"
        cached_data = get_cached_data(cache_key)
        if cached_data:
            return cached_data

        connection = get_router_connection()
        api = connection.get_api()

        # Получаем данные из Netwatch
        netwatch_data = api.get_resource('/tool/netwatch').get()
        
        # Формируем временные ряды
        latency_data = []
        packet_loss_data = []

        # TODO: Для реальной истории задержек используйте внешнюю БД или скрипты для логирования данных со временем.
        # Здесь синтетические данные для демонстрации.
        now = datetime.now()
        for i in range(hours):
            timestamp = (now - timedelta(hours=i)).isoformat()
            latency_data.append(TimeSeriesData(
                timestamp=timestamp,
                value=float(10 + i % 20)  # 10-30ms
            ))
            packet_loss_data.append(TimeSeriesData(
                timestamp=timestamp,
                value=float(i % 5)        # 0-5% packet loss
            ))

        latency_result = LatencyData(
            ip=ip,
            latency=latency_data,
            packetLoss=packet_loss_data
        )

        set_cached_data(cache_key, latency_result)
        return latency_result

    except Exception as e:
        logger.error(f"Ошибка в get_latency_history_sync: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка получения истории задержек: {str(e)}")
    finally:
        if connection:
            connection.disconnect()

def get_system_info_sync():
    """Получение системной информации роутера"""
    connection = None
    try:
        cache_key = "system_info"
        cached_data = get_cached_data(cache_key)
        if cached_data:
            return cached_data

        connection = get_router_connection()
        api = connection.get_api()

        system_resource = api.get_resource('/system/resource').get()
        system_health = api.get_resource('/system/health').get()

        if system_resource:
            resource = system_resource[0]
            total_memory = int(resource.get('total-memory', 1))
            free_memory = int(resource.get('free-memory', 0))
            memory_usage = f"{((total_memory - free_memory) / total_memory * 100):.1f}%" if total_memory > 0 else "0%"
            system_info = SystemInfo(
                cpuLoad=resource.get('cpu-load', '0') + '%',
                memoryUsage=memory_usage,
                uptime=resource.get('uptime', '0s'),
                version=resource.get('version', 'Unknown')
            )
            
            set_cached_data(cache_key, system_info)
            return system_info

        return SystemInfo(cpuLoad="0%", memoryUsage="0%", uptime="0s", version="Unknown")

    except Exception as e:
        logger.error(f"Ошибка в get_system_info_sync: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка получения системной информации: {str(e)}")
    finally:
        if connection:
            connection.disconnect()

def get_interface_stats_sync():
    """Получение статистики интерфейсов"""
    connection = None
    try:
        cache_key = "interface_stats"
        cached_data = get_cached_data(cache_key)
        if cached_data:
            return cached_data

        connection = get_router_connection()
        api = connection.get_api()

        interfaces = api.get_resource('/interface').get()
        interface_stats = []

        for interface in interfaces:
            if interface.get('running') == 'true':
                stats = {
                    'name': interface.get('name', ''),
                    'type': interface.get('type', ''),
                    'rx_bytes': interface.get('rx-byte', '0'),
                    'tx_bytes': interface.get('tx-byte', '0'),
                    'rx_packets': interface.get('rx-packet', '0'),
                    'tx_packets': interface.get('tx-packet', '0'),
                    'status': 'up' if interface.get('running') == 'true' else 'down'
                }
                interface_stats.append(stats)

        set_cached_data(cache_key, interface_stats)
        return interface_stats

    except Exception as e:
        logger.error(f"Ошибка в get_interface_stats_sync: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка получения статистики интерфейсов: {str(e)}")
    finally:
        if connection:
            connection.disconnect()

def format_duration(seconds: float) -> str:
    """Форматирование времени в читаемый формат"""
    if seconds <= 0:
        return "0s"
    
    parts = []
    days = int(seconds // 86400)
    if days > 0:
        parts.append(f"{days}d")
    seconds %= 86400

    hours = int(seconds // 3600)
    if hours > 0:
        parts.append(f"{hours}h")
    seconds %= 3600

    minutes = int(seconds // 60)
    if minutes > 0:
        parts.append(f"{minutes}m")
    seconds %= 60
    
    if seconds > 0 or not parts:
        parts.append(f"{int(seconds)}s")
    
    return " ".join(parts)

def parse_mikrotik_time(time_str: str) -> datetime:
    """Парсинг времени формата MikroTik"""
    try:
        time_str = time_str.strip()
        if not time_str:
            raise ValueError("Пустая строка времени")
        
        if '/' in time_str:
            # Формат: aug/28/2025 13:00:40
            date_part, time_part = time_str.split(' ', 1)
            month_str, day_str, year_str = date_part.lower().split('/')
            month_dict = {
                'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
                'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
            }
            month = month_dict.get(month_str)
            if month is None:
                raise ValueError(f"Недопустимый месяц: {month_str}")
            hour, minute, second = map(int, time_part.split(':'))
            return datetime(int(year_str), month, int(day_str), hour, minute, second)
        else:
            # Формат: 2025-08-28 13:00:40
            date_part, time_part = time_str.split(' ', 1)
            year_str, month_str, day_str = date_part.split('-')
            hour, minute, second = map(int, time_part.split(':'))
            return datetime(int(year_str), int(month_str), int(day_str), hour, minute, second)
    except Exception as e:
        logger.warning(f"Ошибка парсинга времени {time_str}: {e}")
        return datetime.now()

# Основные endpoints
@router.get("", response_model=List[ServerData])
async def get_server_stats(_: dict = Depends(verify_token_dependency)):
    """Получение статистики серверов"""
    try:
        monitored_ips = ['192.1.3.3', '192.1.3.11', '192.1.2.117', '192.1.12.99', '192.1.13.99']
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(executor, get_router_stats_sync, monitored_ips)
    except Exception as e:
        logger.error(f"Ошибка при получении статистики: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка сервера: {str(e)}")

@router.get("/traffic/{ip}", response_model=TrafficData)
async def get_traffic_history(ip: str, hours: int = 24, _: dict = Depends(verify_token_dependency)):
    """Получение истории трафика для конкретного IP"""
    try:
        if hours > 168:  # Ограничение на 1 неделю
            hours = 168
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(executor, get_traffic_history_sync, ip, hours)
    except Exception as e:
        logger.error(f"Ошибка при получении истории трафика: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка сервера: {str(e)}")

@router.get("/latency/{ip}", response_model=LatencyData)
async def get_latency_history(ip: str, hours: int = 24, _: dict = Depends(verify_token_dependency)):
    """Получение истории задержек для конкретного IP"""
    try:
        if hours > 168:  # Ограничение на 1 неделю
            hours = 168
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(executor, get_latency_history_sync, ip, hours)
    except Exception as e:
        logger.error(f"Ошибка при получении истории задержек: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка сервера: {str(e)}")

@router.get("/system", response_model=SystemInfo)
async def get_system_info(_: dict = Depends(verify_token_dependency)):
    """Получение системной информации роутера"""
    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(executor, get_system_info_sync)
    except Exception as e:
        logger.error(f"Ошибка при получении системной информации: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка сервера: {str(e)}")

@router.get("/interfaces")
async def get_interface_stats(_: dict = Depends(verify_token_dependency)):
    """Получение статистики интерфейсов"""
    try:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(executor, get_interface_stats_sync)
    except Exception as e:
        logger.error(f"Ошибка при получении статистики интерфейсов: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка сервера: {str(e)}")

@router.get("/health")
async def check_router_health(_: dict = Depends(verify_token_dependency)):
    """Проверка состояния соединения с роутером"""
    connection = None
    try:
        logger.info("=== ПРОВЕРКА СОСТОЯНИЯ СОЕДИНЕНИЯ ===")
        connection = get_router_connection()
        api = connection.get_api()
        result = api.get_resource('/system/identity').get()
        logger.info(f"Результат проверки: {result}")
        return {"status": "connected", "router_info": result[0] if result else {}}
    except Exception as e:
        logger.error(f"Ошибка проверки состояния: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}
    finally:
        if connection:
            connection.disconnect()

@router.get("/debug/netwatch")
async def debug_netwatch(_: dict = Depends(verify_token_dependency)):
    """Просмотр всех записей Netwatch для диагностики"""
    connection = None
    try:
        connection = get_router_connection()
        api = connection.get_api()
        netwatch_data = api.get_resource('/tool/netwatch').get()
        return {"netwatch_entries": netwatch_data}
    except Exception as e:
        logger.error(f"Ошибка при получении Netwatch: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if connection:
            connection.disconnect()

@router.get("/debug/queue")
async def debug_queue(_: dict = Depends(verify_token_dependency)):
    """Просмотр всех записей Queue для диагностики"""
    connection = None
    try:
        connection = get_router_connection()
        api = connection.get_api()
        queue_data = api.get_resource('/queue/simple').get()
        return {"queue_entries": queue_data}
    except Exception as e:
        logger.error(f"Ошибка при получении Queue: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if connection:
            connection.disconnect()

# Дополнительные endpoints для расширенного мониторинга
@router.get("/bandwidth")
async def get_bandwidth_usage(_: dict = Depends(verify_token_dependency)):
    """Получение использования пропускной способности"""
    connection = None
    try:
        connection = get_router_connection()
        api = connection.get_api()
        
        # Получаем данные о пропускной способности
        queues = api.get_resource('/queue/simple').get()
        
        total_bandwidth = 0
        used_bandwidth = 0
        
        for queue in queues:
            # Анализируем текущее использование (rate-in/out в bps)
            rate_in = int(queue.get('rate-in', '0'))
            rate_out = int(queue.get('rate-out', '0'))
            used_bandwidth += rate_in + rate_out
            
            # Получаем лимиты (если есть)
            max_limit = queue.get('max-limit', '')
            if max_limit:
                # Парсим максимальный лимит
                parts = max_limit.split('/')
                if len(parts) == 2:
                    try:
                        upload_limit = parse_limit(parts[0])
                        download_limit = parse_limit(parts[1])
                        total_bandwidth += upload_limit + download_limit
                    except:
                        pass
        
        utilization = f"{(used_bandwidth / total_bandwidth * 100) if total_bandwidth > 0 else 0:.2f}%"
        return {
            "total_bandwidth": f"{total_bandwidth / 1000000:.2f} Mbps",
            "used_bandwidth": f"{used_bandwidth / 1000000:.2f} Mbps",
            "utilization": utilization
        }
    except Exception as e:
        logger.error(f"Ошибка при получении использования пропускной способности: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if connection:
            connection.disconnect()

@router.get("/top-talkers")
async def get_top_talkers(_: dict = Depends(verify_token_dependency)):
    """Получение списка самых активных клиентов"""
    connection = None
    try:
        connection = get_router_connection()
        api = connection.get_api()
        
        queues = api.get_resource('/queue/simple').get()
        
        # Сортируем по трафику
        talkers = []
        for queue in queues:
            bytes_in = int(queue.get('bytes-in', '0'))
            bytes_out = int(queue.get('bytes-out', '0'))
            total_bytes = bytes_in + bytes_out
            
            if total_bytes > 0:
                talkers.append({
                    "target": queue.get('target', ''),
                    "bytes_in": bytes_in,
                    "bytes_out": bytes_out,
                    "total_bytes": total_bytes,
                    "comment": queue.get('comment', '')
                })
        
        # Сортируем по убыванию трафика
        talkers.sort(key=lambda x: x['total_bytes'], reverse=True)
        
        # Возвращаем топ-10
        return {"top_talkers": talkers[:10]}
    except Exception as e:
        logger.error(f"Ошибка при получении списка самых активных клиентов: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if connection:
            connection.disconnect()

@router.get("/alerts")
async def get_network_alerts(_: dict = Depends(verify_token_dependency)):
    """Получение сетевых оповещений"""
    connection = None
    try:
        connection = get_router_connection()
        api = connection.get_api()
        
        # Получаем логи
        logs = api.get_resource('/log').get()
        
        # Фильтруем важные события
        alerts = []
        for log in logs:
            topics = log.get('topics', '').split(',')
            if any(topic.strip() in ['error', 'warning', 'critical'] for topic in topics):
                alerts.append({
                    "time": log.get('time', ''),
                    "topics": log.get('topics', ''),
                    "message": log.get('message', '')
                })
        
        return {"alerts": alerts[:50]}  # Последние 50 событий
    except Exception as e:
        logger.error(f"Ошибка при получении сетевых оповещений: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if connection:
            connection.disconnect()