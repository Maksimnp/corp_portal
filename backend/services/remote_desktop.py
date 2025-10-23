# services/remote_desktop.py
import asyncio
import json
import socket
import platform
import logging
import websockets
import requests
from datetime import datetime, timedelta
import sqlite3
from typing import Dict, Optional, List, Any
import uuid
import time
import os
import sys

logger = logging.getLogger(__name__)


class RemoteDesktopManager:
    def __init__(self):
        self.active_sessions: Dict[str, Any] = {}
        self.user_sessions: Dict[str, str] = {}
        self.relay_connections: Dict[str, Dict] = {}
        self.pending_auth: Dict[str, Dict] = {}
        self.create_cooldown: Dict[str, float] = {}
        self.cleanup_task: Optional[asyncio.Task] = None
        
        self.active_remote_sessions: Dict[str, Dict] = {}
        self.admin_connections: Dict[str, Any] = {}
        self.rest_hosts: Dict[str, Dict] = {}
        self.user_info_cache: Dict[str, Dict] = {}
        
        # НАСТРОЙКА: Включить/выключить видимость всех ПК для всех пользователей
        self.ALL_USERS_SEE_ALL_PCS = True  # True - все видят все ПК, False - только свои
        
        self.init_database()
        self.migrate_database()
    
    def init_database(self):
        """Инициализация базы данных"""
        try:
            conn = sqlite3.connect('remote_desktop.db')
            c = conn.cursor()
            
            c.execute('''
                CREATE TABLE IF NOT EXISTS remote_pcs (
                    pc_id TEXT PRIMARY KEY,
                    username TEXT NOT NULL,
                    pc_name TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'offline',
                    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    system_info TEXT,
                    ip_address TEXT,
                    connection_type TEXT DEFAULT 'ws',
                    capabilities TEXT
                )
            ''')
            
            c.execute('''
                CREATE TABLE IF NOT EXISTS remote_sessions (
                    session_id TEXT PRIMARY KEY,
                    viewer_username TEXT NOT NULL,
                    host_pc_id TEXT NOT NULL,
                    session_type TEXT NOT NULL,
                    status TEXT NOT NULL,
                    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    end_time TIMESTAMP,
                    duration INTEGER,
                    capabilities TEXT
                )
            ''')
            
            c.execute('CREATE INDEX IF NOT EXISTS idx_username ON remote_pcs(username)')
            c.execute('CREATE INDEX IF NOT EXISTS idx_status ON remote_pcs(status)')
            c.execute('CREATE INDEX IF NOT EXISTS idx_pc_id ON remote_pcs(pc_id)')
            
            conn.commit()
            conn.close()
            logger.info("Remote desktop database initialized")
        except Exception as e:
            logger.error(f"Error initializing database: {e}")

    def migrate_database(self):
        """Миграция базы данных"""
        try:
            conn = sqlite3.connect('remote_desktop.db')
            c = conn.cursor()
            
            c.execute("PRAGMA table_info(remote_pcs)")
            columns = [column[1] for column in c.fetchall()]
            
            if 'connection_type' not in columns:
                c.execute("ALTER TABLE remote_pcs ADD COLUMN connection_type TEXT DEFAULT 'ws'")
            if 'capabilities' not in columns:
                c.execute("ALTER TABLE remote_pcs ADD COLUMN capabilities TEXT")
                
            conn.commit()
            conn.close()
            logger.info("Database migration completed")
            
        except Exception as e:
            logger.error(f"Error during database migration: {e}")

    async def start_background_tasks(self):
        """Запуск фоновых задач"""
        if self.cleanup_task is None or self.cleanup_task.done():
            self.cleanup_task = asyncio.create_task(self.background_cleanup())
            logger.info("Background tasks started")

    async def background_cleanup(self):
        """Фоновая очистка"""
        while True:
            try:
                await self.cleanup_old_sessions()
                await self.cleanup_offline_pcs()
                await self.cleanup_rest_hosts()
                await self.cleanup_cooldowns()
                await asyncio.sleep(60)
            except Exception as e:
                logger.error(f"Background cleanup error: {e}")
                await asyncio.sleep(60)

    async def register_host(self, pc_id: str, username: str, websocket: Any, system_info: Dict = None, capabilities: Dict = None):
        """Регистрация хоста"""
        try:
            if pc_id in self.active_sessions:
                try:
                    old_ws = self.active_sessions[pc_id]
                    await old_ws.close(code=1000, reason="Replaced by new connection")
                except Exception:
                    pass
            
            self.active_sessions[pc_id] = websocket
            self.user_sessions[username] = pc_id
            
            await self.update_pc_status(pc_id, username, 'online', system_info, capabilities, 'ws')
            
            logger.info(f"Host registered: {pc_id} for user {username}")
            
            await self.broadcast_to_admins({
                'type': 'host_online',
                'pc_id': pc_id,
                'username': username,
                'system_info': system_info,
                'timestamp': datetime.now().isoformat()
            })
            
        except Exception as e:
            logger.error(f"Error registering host: {e}")

    async def update_pc_status(self, pc_id: str, username: Optional[str], status: str, 
                             system_info: Dict = None, capabilities: Dict = None, connection_type: str = 'ws'):
        """Обновление статуса ПК"""
        try:
            conn = sqlite3.connect('remote_desktop.db')
            c = conn.cursor()
            
            system_info_json = json.dumps(system_info) if system_info else '{}'
            capabilities_json = json.dumps(capabilities) if capabilities else '{}'
            ip_address = system_info.get('ip_address') if system_info else None
            
            c.execute('''SELECT * FROM remote_pcs WHERE pc_id=?''', (pc_id,))
            existing = c.fetchone()
            
            if existing:
                c.execute('''UPDATE remote_pcs 
                           SET status=?, last_seen=datetime('now'), system_info=?, ip_address=?, capabilities=?, connection_type=?
                           WHERE pc_id=?''', 
                         (status, system_info_json, ip_address, capabilities_json, connection_type, pc_id))
            else:
                pc_name = system_info.get('hostname', f"{username}_PC") if system_info else f"{username}_PC"
                c.execute('''INSERT INTO remote_pcs 
                           (pc_id, username, pc_name, status, system_info, ip_address, capabilities, connection_type) 
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
                         (pc_id, username, pc_name, status, system_info_json, ip_address, capabilities_json, connection_type))
            
            conn.commit()
            conn.close()
            
        except Exception as e:
            logger.error(f"Error updating PC status: {e}")

    async def unregister_host(self, pc_id: str):
        """Удаление хоста"""
        try:
            if pc_id in self.active_sessions:
                del self.active_sessions[pc_id]
                
            username = None
            for user, pid in list(self.user_sessions.items()):
                if pid == pc_id:
                    username = user
                    del self.user_sessions[user]
                    break
                    
            await self.update_pc_status(pc_id, username, 'offline')
            logger.info(f"Host unregistered: {pc_id}")

            await self.broadcast_to_admins({
                'type': 'host_offline',
                'pc_id': pc_id,
                'timestamp': datetime.now().isoformat()
            })

        except Exception as e:
            logger.error(f"Error unregistering host: {e}")

    async def register_rest_host(self, pc_id: str, username: str, system_info: Dict, capabilities: Dict = None):
        """Регистрация REST хоста"""
        try:
            self.rest_hosts[pc_id] = {
                'username': username,
                'system_info': system_info,
                'capabilities': capabilities or {},
                'last_heartbeat': time.time(),
                'ip_address': system_info.get('ip_address')
            }
            
            await self.update_pc_status(pc_id, username, 'online', system_info, capabilities, 'rest')
            logger.info(f"REST host registered: {pc_id}")
            
        except Exception as e:
            logger.error(f"Error registering REST host: {e}")

    async def handle_rest_heartbeat(self, pc_id: str):
        """Обработка heartbeat от REST хоста"""
        try:
            if pc_id in self.rest_hosts:
                self.rest_hosts[pc_id]['last_heartbeat'] = time.time()
                return True
            return False
        except Exception as e:
            logger.error(f"Error handling heartbeat: {e}")
            return False

    async def create_session(self, viewer_ws: Any, target_pc_id: str, session_type: str = "view", 
                           viewer_username: str = "viewer", requested_capabilities: Dict = None):
        """Создание сессии"""
        try:
            now = time.time()
            if viewer_username in self.create_cooldown and now - self.create_cooldown[viewer_username] < 3:
                logger.warning(f"Rate limit exceeded for {viewer_username}")
                return None
            self.create_cooldown[viewer_username] = now

            logger.info(f"Creating session: target={target_pc_id}, type={session_type}, viewer={viewer_username}")
            
            # Проверяем доступность ПК
            pc_available = False
            host_ws = None
            
            if target_pc_id in self.active_sessions:
                pc_available = True
                host_ws = self.active_sessions[target_pc_id]
            elif target_pc_id in self.rest_hosts:
                pc_available = True
            
            if not pc_available:
                logger.warning(f"Target PC {target_pc_id} not available")
                return None
            
            session_id = f"session_{int(time.time())}_{uuid.uuid4().hex[:8]}"
            
            # Информация о сессии
            session_info = {
                'session_id': session_id,
                'viewer_username': viewer_username,
                'target_pc_id': target_pc_id,
                'session_type': session_type,
                'status': 'pending',
                'start_time': datetime.now().isoformat(),
                'requested_capabilities': requested_capabilities or {}
            }
            
            self.active_remote_sessions[session_id] = session_info
            
            session_request = {
                'type': 'session_request',
                'session_id': session_id,
                'session_type': session_type,
                'viewer_username': viewer_username,
                'requested_capabilities': requested_capabilities
            }
            
            if host_ws:
                # WebSocket сессия
                self.relay_connections[session_id] = {
                    'viewer': viewer_ws,
                    'host': host_ws,
                    'target_pc_id': target_pc_id,
                    'session_type': session_type,
                    'created_at': time.time(),
                    'status': 'pending',
                    'is_rest_session': False
                }
                
                # Отправляем запрос хосту
                try:
                    await host_ws.send_json(session_request)
                except Exception as e:
                    logger.error(f"Error sending session request: {e}")
                    del self.active_remote_sessions[session_id]
                    return None
            else:
                # REST сессия
                self.relay_connections[session_id] = {
                    'viewer': viewer_ws,
                    'target_pc_id': target_pc_id,
                    'session_type': session_type,
                    'created_at': time.time(),
                    'status': 'pending',
                    'is_rest_session': True,
                    'pending_requests': [session_request],
                    'rest_messages': []
                }
            
            await self.save_session_to_db(session_id, viewer_username, target_pc_id, session_type)
            
            # Уведомляем администраторов
            await self.broadcast_to_admins({
                'type': 'session_created',
                'session': session_info
            })
            
            logger.info(f"Session created: {session_id}")
            return session_id
            
        except Exception as e:
            logger.error(f"Error creating session: {e}")
            return None

    async def save_session_to_db(self, session_id: str, viewer_username: str, host_pc_id: str, session_type: str):
        """Сохранение сессии в БД"""
        try:
            conn = sqlite3.connect('remote_desktop.db')
            c = conn.cursor()
            c.execute('''INSERT INTO remote_sessions 
                       (session_id, viewer_username, host_pc_id, session_type, status) 
                       VALUES (?, ?, ?, ?, 'active')''',
                     (session_id, viewer_username, host_pc_id, session_type))
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error(f"Error saving session to DB: {e}")

    async def handle_session_response(self, pc_id: str, message: dict):
        """Обработка ответа на запрос сессии"""
        try:
            session_id = message.get("session_id")
            accepted = message.get("accepted", False)
            reason = message.get("reason", "")
            allowed_capabilities = message.get("allowed_capabilities", {})
            
            if session_id not in self.relay_connections:
                logger.warning(f"Session {session_id} not found for response")
                return
                
            session = self.relay_connections[session_id]
            
            if accepted:
                session["status"] = "connected"
                
                if session_id in self.active_remote_sessions:
                    self.active_remote_sessions[session_id]['status'] = 'connected'
                    self.active_remote_sessions[session_id]['allowed_capabilities'] = allowed_capabilities
                
                # Уведомляем viewer
                if "viewer" in session and hasattr(session["viewer"], "send_json"):
                    try:
                        await session["viewer"].send_json({
                            "type": "session_accepted",
                            "session_id": session_id,
                            "allowed_capabilities": allowed_capabilities
                        })
                    except Exception as e:
                        logger.error(f"Error notifying viewer: {e}")
                
                logger.info(f"Session accepted: {session_id}")
                
                await self.broadcast_to_admins({
                    'type': 'session_status_changed',
                    'session_id': session_id,
                    'status': 'connected',
                    'target_pc_id': pc_id
                })
                
            else:
                # Сессия отклонена
                if "viewer" in session and hasattr(session["viewer"], "send_json"):
                    try:
                        await session["viewer"].send_json({
                            "type": "session_rejected", 
                            "session_id": session_id,
                            "message": reason
                        })
                    except Exception as e:
                        logger.error(f"Error notifying viewer of rejection: {e}")
                
                await self.end_session(session_id)
                logger.info(f"Session rejected: {session_id} - {reason}")
                
        except Exception as e:
            logger.error(f"Error handling session response: {e}")

    async def end_session(self, session_id: str):
        """Завершение сессии"""
        try:
            if session_id not in self.relay_connections:
                return

            session_data = self.relay_connections.pop(session_id)
            
            if session_id in self.active_remote_sessions:
                session_info = self.active_remote_sessions.pop(session_id)
                session_info['status'] = 'ended'
                session_info['end_time'] = datetime.now().isoformat()
                
                await self.broadcast_to_admins({
                    'type': 'session_ended',
                    'session_id': session_id,
                    'session_info': session_info
                })

            # Закрываем WebSocket соединения
            for key in ['viewer', 'host']:
                ws = session_data.get(key)
                if ws and hasattr(ws, 'close'):
                    try:
                        await ws.close(code=1000, reason="Session ended")
                    except Exception:
                        pass

            # Обновляем БД
            conn = sqlite3.connect('remote_desktop.db')
            c = conn.cursor()
            c.execute('''UPDATE remote_sessions 
                       SET status='ended', end_time=datetime('now'),
                       duration = CAST((julianday('now') - julianday(start_time)) * 86400 AS INTEGER)
                       WHERE session_id=?''', (session_id,))
            conn.commit()
            conn.close()
            
            logger.info(f"Session ended: {session_id}")
            
        except Exception as e:
            logger.error(f"Error ending session: {e}")
    
    async def relay_message(self, session_id: str, message: dict, from_viewer: bool = True):
        """Пересылка сообщения между viewer и host"""
        try:
            if session_id not in self.relay_connections:
                logger.warning(f"Session {session_id} not found for relay")
                return False

            session = self.relay_connections[session_id]

            if session.get('is_rest_session'):
                if from_viewer:
                    session['pending_requests'].append(message)
                    return True
                else:
                    # От хоста к viewer
                    if 'viewer' in session and hasattr(session['viewer'], 'send_json'):
                        await session['viewer'].send_json(message)
                    return True
            else:
                # WebSocket сессия: пересылаем напрямую
                target_ws = session['host'] if from_viewer else session['viewer']
                if hasattr(target_ws, 'send_json'):
                    await target_ws.send_json(message)
                    return True
                else:
                    logger.error("Target WebSocket missing send_json method")
                    return False

        except Exception as e:
            logger.error(f"Error relaying message in session {session_id}: {e}")
            return False

    async def poll_messages_for_rest(self, pc_id: str) -> List[Dict]:
        """Получение pending сообщений для REST хоста"""
        try:
            pending = []
            for session_id, session in list(self.relay_connections.items()):
                if session.get('is_rest_session') and session['target_pc_id'] == pc_id:
                    pending.extend(session['pending_requests'])
                    session['pending_requests'] = []
            return pending
        except Exception as e:
            logger.error(f"Error polling messages for {pc_id}: {e}")
            return []

    async def post_messages_from_rest(self, pc_id: str, messages: List[Dict]):
        """Обработка сообщений от REST хоста"""
        try:
            for msg in messages:
                session_id = msg.get('session_id')
                if session_id in self.relay_connections:
                    session = self.relay_connections[session_id]
                    if session.get('is_rest_session') and session['target_pc_id'] == pc_id:
                        if msg.get('type') == 'session_response':
                            await self.handle_session_response(pc_id, msg)
                        else:
                            await self.relay_message(session_id, msg, from_viewer=False)
            return True
        except Exception as e:
            logger.error(f"Error posting messages from rest for {pc_id}: {e}")
            return False

    async def register_admin_connection(self, admin_id: str, websocket: Any):
        """Регистрация подключения администратора"""
        try:
            self.admin_connections[admin_id] = websocket
            logger.info(f"Admin connection registered: {admin_id}")
            
            # Отправляем текущее состояние
            active_sessions = await self.get_active_sessions_info()
            try:
                await websocket.send_json({
                    'type': 'initial_state',
                    'active_sessions': active_sessions,
                    'total_sessions': len(active_sessions),
                    'timestamp': datetime.now().isoformat()
                })
            except Exception as e:
                logger.error(f"Error sending initial state: {e}")
                
        except Exception as e:
            logger.error(f"Error registering admin connection: {e}")

    async def unregister_admin_connection(self, admin_id: str):
        """Удаление подключения администратора"""
        try:
            if admin_id in self.admin_connections:
                del self.admin_connections[admin_id]
                logger.info(f"Admin connection unregistered: {admin_id}")
        except Exception as e:
            logger.error(f"Error unregistering admin connection: {e}")

    async def broadcast_to_admins(self, message: dict):
        """Рассылка сообщения администраторам"""
        try:
            disconnected_admins = []
            
            for admin_id, websocket in list(self.admin_connections.items()):
                try:
                    if hasattr(websocket, 'send_json'):
                        await websocket.send_json(message)
                except Exception as e:
                    logger.error(f"Error sending to admin {admin_id}: {e}")
                    disconnected_admins.append(admin_id)
                    
            for admin_id in disconnected_admins:
                await self.unregister_admin_connection(admin_id)
                
        except Exception as e:
            logger.error(f"Error broadcasting to admins: {e}")

    async def get_user_pcs(self, username: str, user_role: str = "user") -> List[Dict]:
        """Получение ПК пользователя с учетом настроек видимости"""
        try:
            conn = sqlite3.connect('remote_desktop.db')
            c = conn.cursor()
            
            # Если включена настройка ALL_USERS_SEE_ALL_PCS или пользователь администратор
            if self.ALL_USERS_SEE_ALL_PCS or user_role == "admin":
                # Все пользователи видят все ПК или администратор
                c.execute("SELECT * FROM remote_pcs ORDER BY status DESC, last_seen DESC")
                logger.debug(f"Showing all PCs to user {username} (role: {user_role}, setting: {self.ALL_USERS_SEE_ALL_PCS})")
            else:
                # Обычные пользователи видят только свои ПК
                c.execute("SELECT * FROM remote_pcs WHERE username=? ORDER BY status DESC, last_seen DESC", (username,))
                logger.debug(f"Showing only own PCs to user {username}")
            
            pcs = c.fetchall()
            conn.close()
            
            result = []
            for pc in pcs:
                system_info = self.parse_json_field(pc[6])
                capabilities = self.parse_json_field(pc[9]) if len(pc) > 9 else {}
                
                pc_data = {
                    'pc_id': pc[0],
                    'username': pc[1],
                    'pc_name': pc[2],
                    'status': pc[3],
                    'last_seen': pc[4],
                    'system_info': system_info,
                    'ip_address': pc[7] if len(pc) > 7 else None,
                    'connection_type': pc[8] if len(pc) > 8 else 'ws',
                    'capabilities': capabilities,
                    'is_owner': pc[1] == username,  # Флаг владельца
                    'can_view': True  # Все ПК в списке доступны для просмотра
                }
                result.append(pc_data)
            
            logger.info(f"Returned {len(result)} PCs for user {username} (role: {user_role})")
            return result
        except Exception as e:
            logger.error(f"Error getting user PCs: {e}")
            return []

    async def get_all_pcs(self, username: str = None, user_role: str = "user") -> List[Dict]:
        """Получение всех ПК с учетом прав доступа"""
        return await self.get_user_pcs(username or "", user_role)

    def parse_json_field(self, field_value):
        """Парсинг JSON поля"""
        try:
            if field_value and field_value != '{}':
                return json.loads(field_value)
            return {}
        except (json.JSONDecodeError, TypeError):
            return {}

    async def get_active_sessions_info(self) -> List[Dict]:
        """Получение информации об активных сессиях"""
        try:
            active_sessions = []
            
            for session_id, session_info in self.active_remote_sessions.items():
                if session_id in self.relay_connections:
                    relay_info = self.relay_connections[session_id]
                    session_info['connection_status'] = relay_info.get('status', 'unknown')
                    session_info['duration'] = time.time() - relay_info.get('created_at', time.time())
                    session_info['is_rest_session'] = relay_info.get('is_rest_session', False)
                    
                active_sessions.append(session_info)
            
            return active_sessions
        except Exception as e:
            logger.error(f"Error getting active sessions info: {e}")
            return []

    async def cleanup_old_sessions(self):
        """Очистка старых сессий"""
        try:
            current_time = time.time()
            sessions_to_remove = []
            
            for session_id, session_data in self.relay_connections.items():
                if current_time - session_data.get('created_at', 0) > 7200:  # 2 часа
                    sessions_to_remove.append(session_id)
            
            for session_id in sessions_to_remove:
                await self.end_session(session_id)
                
        except Exception as e:
            logger.error(f"Error cleaning up old sessions: {e}")

    async def cleanup_offline_pcs(self, hours: int = 24):
        """Очистка оффлайн ПК"""
        try:
            conn = sqlite3.connect('remote_desktop.db')
            c = conn.cursor()
            c.execute("DELETE FROM remote_pcs WHERE status='offline' AND last_seen < datetime('now', ?)", 
                     (f'-{hours} hours',))
            deleted_count = c.rowcount
            conn.commit()
            conn.close()
            logger.info(f"Cleaned up {deleted_count} offline PCs")
        except Exception as e:
            logger.error(f"Error cleaning up offline PCs: {e}")

    async def cleanup_rest_hosts(self):
        """Очистка REST хостов"""
        try:
            current_time = time.time()
            offline_hosts = []
            
            for pc_id, info in self.rest_hosts.items():
                if current_time - info['last_heartbeat'] > 60:
                    offline_hosts.append(pc_id)
                    await self.update_pc_status(pc_id, info['username'], 'offline')
            
            for pc_id in offline_hosts:
                del self.rest_hosts[pc_id]
                
            if offline_hosts:
                logger.info(f"Cleaned up {len(offline_hosts)} offline REST hosts")
        except Exception as e:
            logger.error(f"Error cleaning up REST hosts: {e}")

    async def cleanup_cooldowns(self):
        """Очистка cooldown записей"""
        try:
            current_time = time.time()
            cooldowns_to_remove = [user for user, ts in self.create_cooldown.items() if current_time - ts > 3600]
            for user in cooldowns_to_remove:
                del self.create_cooldown[user]
        except Exception as e:
            logger.error(f"Error cleaning up cooldowns: {e}")

    async def get_session_stats(self) -> Dict[str, Any]:
        """Получение статистики сессий"""
        try:
            conn = sqlite3.connect('remote_desktop.db')
            c = conn.cursor()
            
            c.execute("SELECT COUNT(*) FROM remote_sessions WHERE status='active'")
            active_sessions = c.fetchone()[0]
            
            c.execute("SELECT COUNT(*) FROM remote_sessions")
            total_sessions = c.fetchone()[0]
            
            c.execute("SELECT COUNT(*) FROM remote_pcs WHERE status='online'")
            online_pcs = c.fetchone()[0]
            
            conn.close()
            
            return {
                'active_sessions': active_sessions,
                'total_sessions': total_sessions,
                'online_pcs': online_pcs,
                'connected_hosts': len(self.active_sessions) + len(self.rest_hosts),
                'all_users_see_all_pcs': self.ALL_USERS_SEE_ALL_PCS
            }
        except Exception as e:
            logger.error(f"Error getting session stats: {e}")
            return {}

    async def refresh_pc_statuses(self):
        """Обновление статусов ПК"""
        try:
            updated_count = 0
            all_pcs = await self.get_all_pcs()
            
            for pc in all_pcs:
                pc_id = pc['pc_id']
                is_online = pc_id in self.active_sessions or pc_id in self.rest_hosts
                
                if is_online and pc['status'] != 'online':
                    await self.update_pc_status(pc_id, pc['username'], 'online')
                    updated_count += 1
                elif not is_online and pc['status'] == 'online':
                    await self.update_pc_status(pc_id, pc['username'], 'offline')
                    updated_count += 1
            
            logger.info(f"PC statuses refreshed: {updated_count} updated")
            return updated_count
            
        except Exception as e:
            logger.error(f"Error refreshing PC statuses: {e}")
            return 0

    def toggle_all_users_see_all_pcs(self, enabled: bool = None) -> bool:
        """Включить/выключить видимость всех ПК для всех пользователей"""
        if enabled is not None:
            self.ALL_USERS_SEE_ALL_PCS = enabled
        else:
            self.ALL_USERS_SEE_ALL_PCS = not self.ALL_USERS_SEE_ALL_PCS
        
        logger.info(f"ALL_USERS_SEE_ALL_PCS setting changed to: {self.ALL_USERS_SEE_ALL_PCS}")
        return self.ALL_USERS_SEE_ALL_PCS

    def get_settings(self) -> Dict[str, Any]:
        """Получение текущих настроек"""
        return {
            'all_users_see_all_pcs': self.ALL_USERS_SEE_ALL_PCS,
            'active_sessions_count': len(self.active_remote_sessions),
            'connected_hosts_count': len(self.active_sessions) + len(self.rest_hosts),
            'admin_connections_count': len(self.admin_connections)
        }


# Глобальный экземпляр менеджера
remote_manager = RemoteDesktopManager()