import socket
import threading
import sqlite3
import hashlib
import time
import asyncio
import json
from typing import Dict, Optional, List, Any
from fastapi import WebSocket, HTTPException
import logging
from datetime import datetime, timedelta
from services.ad_auth import get_user_role

logger = logging.getLogger(__name__)

class RemoteDesktopManager:
    def __init__(self):
        self.active_sessions: Dict[str, WebSocket] = {}  # pc_id -> WebSocket
        self.user_sessions: Dict[str, str] = {}  # username -> pc_id
        self.relay_connections: Dict[str, Dict] = {}  # session_id -> connections
        self.pending_auth: Dict[str, Dict] = {}  # pending authentication requests
        self.create_cooldown: Dict[str, float] = {}  # viewer_username -> last_create_time
        self.cleanup_task: Optional[asyncio.Task] = None
        
        # Новые атрибуты для отслеживания активных сессий
        self.active_remote_sessions: Dict[str, Dict] = {}  # session_id -> session_info
        self.admin_connections: Dict[str, WebSocket] = {}  # admin_id -> WebSocket
        
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
                    ip_address TEXT
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
                    duration INTEGER
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
        """Миграция базы данных до актуальной схемы"""
        try:
            conn = sqlite3.connect('remote_desktop.db')
            c = conn.cursor()
            
            c.execute("PRAGMA table_info(remote_pcs)")
            columns = [column[1] for column in c.fetchall()]
            
            if 'system_info' not in columns:
                c.execute("ALTER TABLE remote_pcs ADD COLUMN system_info TEXT")
                logger.info("Added system_info column to remote_pcs table")
            
            if 'ip_address' not in columns:
                c.execute("ALTER TABLE remote_pcs ADD COLUMN ip_address TEXT")
                logger.info("Added ip_address column to remote_pcs table")
            
            c.execute("PRAGMA table_info(remote_sessions)")
            session_columns = [column[1] for column in c.fetchall()]
            
            if 'duration' not in session_columns:
                c.execute("ALTER TABLE remote_sessions ADD COLUMN duration INTEGER")
                logger.info("Added duration column to remote_sessions table")
            
            conn.commit()
            conn.close()
            logger.info("Database migration completed successfully")
            
        except Exception as e:
            logger.error(f"Error during database migration: {e}")

    async def authenticate_host(self, username: str, password: str, system_info: Dict) -> bool:
        """Аутентификация хоста через AD"""
        try:
            from .ad_auth import authenticate_user
            
            user_info = authenticate_user(username, password)
            if user_info:
                pc_id = f"{username}_{system_info.get('hostname', 'pc')}"
                await self.update_system_info(pc_id, username, system_info)
                return True
                
            return False
        except Exception as e:
            logger.error(f"Authentication error: {e}")
            return False  # No fallback

    async def register_pc(self, pc_id: str, username: str, websocket: WebSocket, system_info: Dict = None):
        """Регистрация ПК в системе"""
        if pc_id in self.active_sessions:
            try:
                old_ws = self.active_sessions[pc_id]
                await old_ws.close(code=1000, reason="Replaced by new connection")
            except:
                pass
            del self.active_sessions[pc_id]
        
        self.active_sessions[pc_id] = websocket
        self.user_sessions[username] = pc_id
        
        await self.update_pc_status(pc_id, username, 'online', system_info)
        logger.info(f"PC registered: {pc_id} for user {username}")
        logger.info(f"Total active PC sessions: {len(self.active_sessions)}")
    
    async def unregister_pc(self, pc_id: str):
        """Удаление ПК из системы"""
        if pc_id in self.active_sessions:
            del self.active_sessions[pc_id]
            
        username = None
        for user, pid in self.user_sessions.items():
            if pid == pc_id:
                username = user
                break
                
        if username and username in self.user_sessions:
            del self.user_sessions[username]
            
        await self.update_pc_status(pc_id, username, 'offline')
        logger.info(f"PC unregistered: {pc_id}")

    async def update_pc_status(self, pc_id: str, username: Optional[str], status: str, system_info: Dict = None):
        """Обновление статуса ПК в базе данных"""
        try:
            conn = sqlite3.connect('remote_desktop.db')
            c = conn.cursor()
            
            system_info_json = json.dumps(system_info) if system_info else '{}'
            ip_address = system_info.get('ip_address') if system_info else None
            
            if username:
                c.execute("SELECT * FROM remote_pcs WHERE pc_id=?", (pc_id,))
                existing = c.fetchone()
                
                if existing:
                    try:
                        c.execute('''UPDATE remote_pcs 
                                   SET status=?, last_seen=datetime('now'), system_info=?, ip_address=?
                                   WHERE pc_id=?''', 
                                 (status, system_info_json, ip_address, pc_id))
                    except sqlite3.OperationalError as e:
                        if "no such column" in str(e):
                            logger.warning("System_info column not found, updating without it")
                            c.execute('''UPDATE remote_pcs 
                                       SET status=?, last_seen=datetime('now')
                                       WHERE pc_id=?''', 
                                     (status, pc_id))
                        else:
                            raise e
                else:
                    pc_name = system_info.get('hostname', f"{username}_PC") if system_info else f"{username}_PC"
                    try:
                        c.execute('''INSERT INTO remote_pcs 
                                   (pc_id, username, pc_name, status, last_seen, system_info, ip_address) 
                                   VALUES (?, ?, ?, ?, datetime('now'), ?, ?)''',
                                 (pc_id, username, pc_name, status, system_info_json, ip_address))
                    except sqlite3.OperationalError as e:
                        if "no such column" in str(e):
                            c.execute('''INSERT INTO remote_pcs 
                                       (pc_id, username, pc_name, status, last_seen) 
                                       VALUES (?, ?, ?, ?, datetime('now'))''',
                                     (pc_id, username, pc_name, status))
                        else:
                            raise e
            else:
                c.execute('''UPDATE remote_pcs SET status=?, last_seen=datetime('now') 
                           WHERE pc_id=?''', (status, pc_id))
            
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error(f"Error updating PC status: {e}")

    async def register_admin_connection(self, admin_id: str, websocket: WebSocket):
        """Регистрация подключения администратора для получения обновлений"""
        self.admin_connections[admin_id] = websocket
        logger.info(f"Admin connection registered: {admin_id}")
        
        # Отправляем текущее состояние при подключении
        active_sessions = await self.get_active_sessions_info()
        try:
            await websocket.send_json({
                'type': 'initial_state',
                'active_sessions': active_sessions,
                'total_sessions': len(active_sessions),
                'timestamp': datetime.now().isoformat()
            })
        except Exception as e:
            logger.error(f"Error sending initial state to admin {admin_id}: {e}")

    async def unregister_admin_connection(self, admin_id: str):
        """Удаление подключения администратора"""
        if admin_id in self.admin_connections:
            del self.admin_connections[admin_id]
            logger.info(f"Admin connection unregistered: {admin_id}")

    async def broadcast_to_admins(self, message: dict):
        """Рассылка сообщения всем подключенным администраторам"""
        disconnected_admins = []
        
        for admin_id, websocket in self.admin_connections.items():
            try:
                if getattr(websocket, 'client_state', None) == websocket.client_state.CONNECTED:
                    await websocket.send_json(message)
                else:
                    disconnected_admins.append(admin_id)
            except Exception as e:
                logger.error(f"Error sending to admin {admin_id}: {e}")
                disconnected_admins.append(admin_id)
                
        # Очистка отключенных администраторов
        for admin_id in disconnected_admins:
            await self.unregister_admin_connection(admin_id)

    async def update_system_info(self, pc_id: str, username: str, system_info: Dict):
        """Обновление информации о системе"""
        try:
            conn = sqlite3.connect('remote_desktop.db')
            c = conn.cursor()
            
            system_info_json = json.dumps(system_info) if system_info else '{}'
            ip_address = system_info.get('ip_address')
            pc_name = system_info.get('hostname', f"{username}_PC")
            
            c.execute('''INSERT OR REPLACE INTO remote_pcs 
                       (pc_id, username, pc_name, status, last_seen, system_info, ip_address) 
                       VALUES (?, ?, ?, 'online', datetime('now'), ?, ?)''',
                     (pc_id, username, pc_name, system_info_json, ip_address))
            
            conn.commit()
            conn.close()
            logger.info(f"System info updated for PC: {pc_id}")
        except Exception as e:
            logger.error(f"Error updating system info: {e}")
            await self.fallback_update_system_info(pc_id, username, system_info)

    async def fallback_update_system_info(self, pc_id: str, username: str, system_info: Dict):
        """Альтернативный метод обновления информации о системе"""
        try:
            conn = sqlite3.connect('remote_desktop.db')
            c = conn.cursor()
            
            pc_name = system_info.get('hostname', f"{username}_PC") if system_info else f"{username}_PC"
            
            c.execute('''INSERT OR REPLACE INTO remote_pcs 
                       (pc_id, username, pc_name, status, last_seen) 
                       VALUES (?, ?, ?, 'online', datetime('now'))''',
                     (pc_id, username, pc_name))
            
            conn.commit()
            conn.close()
            logger.info(f"Basic system info updated for PC: {pc_id}")
        except Exception as e:
            logger.error(f"Error in fallback system info update: {e}")

    async def get_user_pcs(self, username: str) -> List[Dict]:
        """Получение списка ПК пользователя"""
        try:
            conn = sqlite3.connect('remote_desktop.db')
            c = conn.cursor()
            c.execute("SELECT * FROM remote_pcs WHERE username=? ORDER BY status DESC, last_seen DESC", (username,))
            pcs = c.fetchall()
            conn.close()
            
            result = []
            for pc in pcs:
                try:
                    system_info = json.loads(pc[5]) if pc[5] and pc[5] != '{}' else {}
                except (json.JSONDecodeError, TypeError):
                    system_info = {}
                
                pc_data = {
                    'pc_id': pc[0],
                    'username': pc[1],
                    'pc_name': pc[2],
                    'status': pc[3],
                    'last_seen': pc[4],
                    'system_info': system_info,
                    'ip_address': pc[6] if len(pc) > 6 else None
                }
                result.append(pc_data)
            
            return result
        except Exception as e:
            logger.error(f"Error getting user PCs: {e}")
            return []
    
    async def get_all_online_pcs(self) -> List[Dict]:
        """Получение всех онлайн ПК"""
        try:
            conn = sqlite3.connect('remote_desktop.db')
            c = conn.cursor()
            c.execute("SELECT * FROM remote_pcs WHERE status='online' ORDER BY last_seen DESC")
            pcs = c.fetchall()
            conn.close()
            
            result = []
            for pc in pcs:
                try:
                    system_info = json.loads(pc[5]) if pc[5] and pc[5] != '{}' else {}
                except (json.JSONDecodeError, TypeError):
                    system_info = {}
                
                pc_data = {
                    'pc_id': pc[0],
                    'username': pc[1],
                    'pc_name': pc[2],
                    'status': pc[3],
                    'last_seen': pc[4],
                    'system_info': system_info,
                    'ip_address': pc[6] if len(pc) > 6 else None
                }
                result.append(pc_data)
            
            return result
        except Exception as e:
            logger.error(f"Error getting online PCs: {e}")
            return []

    async def get_all_pcs(self) -> List[Dict]:
        """Получение всех ПК (для админов)"""
        try:
            conn = sqlite3.connect('remote_desktop.db')
            c = conn.cursor()
            c.execute("SELECT * FROM remote_pcs ORDER BY status DESC, last_seen DESC")
            pcs = c.fetchall()
            conn.close()
            
            result = []
            for pc in pcs:
                try:
                    system_info = json.loads(pc[5]) if pc[5] and pc[5] != '{}' else {}
                except (json.JSONDecodeError, TypeError):
                    system_info = {}
                
                pc_data = {
                    'pc_id': pc[0],
                    'username': pc[1],
                    'pc_name': pc[2],
                    'status': pc[3],
                    'last_seen': pc[4],
                    'system_info': system_info,
                    'ip_address': pc[6] if len(pc) > 6 else None
                }
                result.append(pc_data)
            
            logger.info(f"Admin view: retrieved {len(result)} PCs from database")
            return result
        except Exception as e:
            logger.error(f"Error getting all PCs: {e}")
            return []

    async def save_session_to_db(self, session_id: str, viewer_username: str, host_pc_id: str, session_type: str):
        """Сохранение сессии в базу данных"""
        try:
            conn = sqlite3.connect('remote_desktop.db')
            c = conn.cursor()
            c.execute('''INSERT INTO remote_sessions 
                       (session_id, viewer_username, host_pc_id, session_type, status) 
                       VALUES (?, ?, ?, ?, 'active')''',
                     (session_id, viewer_username, host_pc_id, session_type))
            conn.commit()
            conn.close()
            logger.info(f"Session saved to DB: {session_id}")
        except Exception as e:
            logger.error(f"Error saving session to DB: {e}")

    async def end_session(self, session_id: str):
        """Завершение сессии (idempotent)"""
        if session_id not in self.relay_connections:
            logger.debug(f"Ignoring end for non-existent session {session_id}")
            return

        try:
            session_data = self.relay_connections.pop(session_id)
            
            # Удаляем из активных сессий и уведомляем администраторов
            if session_id in self.active_remote_sessions:
                session_info = self.active_remote_sessions.pop(session_id)
                session_info['status'] = 'ended'
                session_info['end_time'] = datetime.now().isoformat()
                
                # Уведомляем администраторов о завершении сессии
                await self.broadcast_to_admins({
                    'type': 'session_ended',
                    'session_id': session_id,
                    'session_info': session_info
                })

            # Close WS safely
            for key in ['viewer', 'host']:
                ws = session_data.get(key)
                if ws and getattr(ws, 'client_state', None) == ws.client_state.CONNECTED:
                    try:
                        await ws.close(code=1000, reason="Session ended")
                    except Exception as e:
                        logger.debug(f"WS close error in end_session: {e}")

            # DB update
            conn = sqlite3.connect('remote_desktop.db')
            c = conn.cursor()
            c.execute('''UPDATE remote_sessions 
                       SET status='ended', end_time=datetime('now'),
                       duration = CAST((julianday('now') - julianday(start_time)) * 24 * 60 * 60 AS INTEGER)
                       WHERE session_id=?''', (session_id,))
            conn.commit()
            conn.close()
            
            logger.info(f"Session ended: {session_id}")
        except Exception as e:
            logger.error(f"Error ending session: {e}")

    async def create_session(self, viewer_ws: WebSocket, target_pc_id: str, session_type: str = "view", viewer_username: str = "viewer_user") -> Optional[str]:
        """Создание сессии с rate-limit"""
        now = time.time()
        if viewer_username in self.create_cooldown and now - self.create_cooldown[viewer_username] < 5:
            logger.warning(f"Rate limit exceeded for {viewer_username} on create_session")
            return None
        self.create_cooldown[viewer_username] = now

        logger.info(f"Creating session: target_pc={target_pc_id}, type={session_type}, viewer={viewer_username}")
        
        if target_pc_id not in self.active_sessions:
            logger.warning(f"Target PC {target_pc_id} not found in active sessions")
            return None
            
        host_ws = self.active_sessions[target_pc_id]
        if getattr(host_ws, 'client_state', None) != host_ws.client_state.CONNECTED:
            logger.warning(f"Host WS for {target_pc_id} is not connected")
            return None

        session_id = f"session_{int(time.time())}_{target_pc_id}"
        
        # Создаем информацию о сессии для отслеживания
        session_info = {
            'session_id': session_id,
            'viewer_username': viewer_username,
            'target_pc_id': target_pc_id,
            'session_type': session_type,
            'status': 'pending',
            'start_time': datetime.now().isoformat(),
            'viewer_info': await self.get_user_info(viewer_username)
        }
        
        # Сохраняем в активные сессии
        self.active_remote_sessions[session_id] = session_info
        
        try:
            request_message = {
                'type': 'session_request',
                'session_id': session_id,
                'session_type': session_type,
                'viewer_username': viewer_username
            }
            await host_ws.send_json(request_message)
        except Exception as e:
            logger.error(f"Error sending session request to host: {e}")
            # Удаляем сессию при ошибке
            if session_id in self.active_remote_sessions:
                del self.active_remote_sessions[session_id]
            return None
        
        self.relay_connections[session_id] = {
            'viewer': viewer_ws,
            'host': host_ws,
            'target_pc_id': target_pc_id,
            'session_type': session_type,
            'created_at': time.time(),
            'status': 'pending'
        }
        
        await self.save_session_to_db(session_id, viewer_username, target_pc_id, session_type)
        
        # Уведомляем администраторов о новой сессии
        await self.broadcast_to_admins({
            'type': 'session_created',
            'session': session_info
        })
        
        logger.info(f"Remote session created: {session_id} for PC {target_pc_id}")
        return session_id

    async def relay_message(self, session_id: str, message: dict, from_viewer: bool = True) -> bool:
        """Безопасный relay"""
        if session_id not in self.relay_connections:
            logger.debug(f"Session {session_id} not found for relay")
            return False
            
        session = self.relay_connections[session_id]
        target_ws = session['viewer'] if not from_viewer else session['host']
        
        if getattr(target_ws, 'client_state', None) != target_ws.client_state.CONNECTED:
            logger.debug(f"Target WS closed for session {session_id}, ending session")
            await self.end_session(session_id)
            return False
        
        try:
            if isinstance(message, str):
                message = json.loads(message)
            
            await target_ws.send_json(message)
            return True
        except Exception as e:
            logger.error(f"Error relaying message: {e}")
            await self.end_session(session_id)
            return False
        
    async def send_screen_data(self, session_id: str, screen_data: str):
        """Отправка данных экрана viewer'у"""
        if session_id in self.relay_connections:
            message = {"type": "screen_data", "data": {"image": screen_data}}
            await self.relay_message(session_id, message, False)

    async def request_screen(self, session_id: str):
        """Запрос обновления экрана от хоста"""
        if session_id not in self.relay_connections:
            return False
            
        session = self.relay_connections[session_id]
        host_ws = session['host']
        
        if getattr(host_ws, 'client_state', None) != host_ws.client_state.CONNECTED:
            await self.end_session(session_id)
            return False
        
        try:
            await host_ws.send_json({
                'type': 'request_screen',
                'session_id': session_id
            })
            return True
        except Exception as e:
            logger.error(f"Error requesting screen: {e}")
            return False

    async def handle_session_accepted(self, session_id: str, pc_id: str):
        """Обработка принятия сессии хостом"""
        if session_id not in self.relay_connections:
            logger.debug(f"Session {session_id} not found for acceptance")
            return

        session = self.relay_connections[session_id]
        if session["target_pc_id"] != pc_id:
            logger.warning(f"PC {pc_id} tried to accept session for {session['target_pc_id']}")
            return

        session["status"] = "connected"
        
        # Обновляем информацию о сессии
        if session_id in self.active_remote_sessions:
            self.active_remote_sessions[session_id]['status'] = 'connected'
            self.active_remote_sessions[session_id]['host_accepted_at'] = datetime.now().isoformat()
        
        viewer_ws = session["viewer"]
        
        if getattr(viewer_ws, 'client_state', None) == viewer_ws.client_state.CONNECTED:
            await viewer_ws.send_json({
                "type": "session_accepted",
                "session_id": session_id
            })
            
            # Уведомляем администраторов об изменении статуса сессии
            await self.broadcast_to_admins({
                'type': 'session_status_changed',
                'session_id': session_id,
                'status': 'connected',
                'target_pc_id': pc_id
            })
        else:
            await self.end_session(session_id)
        logger.info(f"Session {session_id} accepted by host {pc_id}")

    async def handle_session_response(self, pc_id: str, message: dict):
        """Обработка ответа от хоста на запрос сессии"""
        session_id = message.get("session_id")
        if session_id not in self.relay_connections:
            logger.debug(f"Session {session_id} not found for response from {pc_id}")
            return

        session = self.relay_connections[session_id]
        if session["target_pc_id"] != pc_id:
            logger.warning(f"PC {pc_id} tried to respond to session for {session['target_pc_id']}")
            return

        viewer_ws = session["viewer"]

        accepted = message.get("accepted", False)
        reason = message.get("reason", "")

        if accepted:
            session["status"] = "connected"
            
            # Обновляем информацию о сессии
            if session_id in self.active_remote_sessions:
                self.active_remote_sessions[session_id]['status'] = 'connected'
                self.active_remote_sessions[session_id]['host_accepted_at'] = datetime.now().isoformat()
            
            if getattr(viewer_ws, 'client_state', None) == viewer_ws.client_state.CONNECTED:
                await viewer_ws.send_json({
                    "type": "session_accepted",
                    "session_id": session_id
                })
                
                # Уведомляем администраторов об изменении статуса сессии
                await self.broadcast_to_admins({
                    'type': 'session_status_changed',
                    'session_id': session_id,
                    'status': 'connected',
                    'target_pc_id': pc_id
                })
            else:
                await self.end_session(session_id)
            logger.info(f"Session {session_id} accepted by host {pc_id}")
        else:
            if getattr(viewer_ws, 'client_state', None) == viewer_ws.client_state.CONNECTED:
                await viewer_ws.send_json({
                    "type": "session_rejected",
                    "session_id": session_id,
                    "message": reason
                })
            
            # Уведомляем администраторов об отклонении сессии
            if session_id in self.active_remote_sessions:
                session_info = self.active_remote_sessions.pop(session_id)
                session_info['status'] = 'rejected'
                session_info['rejection_reason'] = reason
                
                await self.broadcast_to_admins({
                    'type': 'session_rejected',
                    'session_id': session_id,
                    'session_info': session_info
                })
            
            await self.end_session(session_id)
            logger.info(f"Session {session_id} rejected by host {pc_id}: {reason}")

    def get_active_sessions_count(self) -> int:
        """Получение количества активных сессий"""
        return len(self.relay_connections)

    async def start_background_tasks(self):
        """Запуск фоновых задач"""
        if self.cleanup_task is None or self.cleanup_task.done():
            self.cleanup_task = asyncio.create_task(self.background_cleanup())

    async def background_cleanup(self):
        """Фоновая очистка старых сессий и оффлайн ПК"""
        while True:
            try:
                await self.cleanup_old_sessions()
                await self.cleanup_offline_pcs(hours=24)
                await self.refresh_pc_statuses()
            except Exception as e:
                logger.error(f"Background cleanup error: {e}")
            await asyncio.sleep(60)

    async def cleanup_old_sessions(self):
        """Очистка старых сессий"""
        try:
            current_time = time.time()
            sessions_to_remove = []
            
            for session_id, session_data in self.relay_connections.items():
                if current_time - session_data['created_at'] > 3600:
                    sessions_to_remove.append(session_id)
            
            for session_id in sessions_to_remove:
                await self.end_session(session_id)
                
        except Exception as e:
            logger.error(f"Error cleaning up old sessions: {e}")

    async def get_session_stats(self) -> Dict[str, Any]:
        """Получение статистики по сессиям"""
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
                'connected_hosts': len(self.active_sessions)
            }
        except Exception as e:
            logger.error(f"Error getting session stats: {e}")
            return {}

    async def get_pc_by_id(self, pc_id: str) -> Optional[Dict]:
        """Получение информации о ПК по ID"""
        try:
            conn = sqlite3.connect('remote_desktop.db')
            c = conn.cursor()
            c.execute("SELECT * FROM remote_pcs WHERE pc_id=?", (pc_id,))
            pc = c.fetchone()
            conn.close()
            
            if pc:
                try:
                    system_info = json.loads(pc[5]) if pc[5] and pc[5] != '{}' else {}
                except (json.JSONDecodeError, TypeError):
                    system_info = {}
                
                return {
                    'pc_id': pc[0],
                    'username': pc[1],
                    'pc_name': pc[2],
                    'status': pc[3],
                    'last_seen': pc[4],
                    'system_info': system_info,
                    'ip_address': pc[6] if len(pc) > 6 else None
                }
            return None
        except Exception as e:
            logger.error(f"Error getting PC by ID: {e}")
            return None

    async def cleanup_offline_pcs(self, hours: int = 24):
        """Очистка ПК, которые были офлайн больше указанного времени"""
        try:
            conn = sqlite3.connect('remote_desktop.db')
            c = conn.cursor()
            
            cutoff_time = f"datetime('now', '-{hours} hours')"
            c.execute(f"DELETE FROM remote_pcs WHERE status='offline' AND last_seen < {cutoff_time}")
            
            deleted_count = c.rowcount
            conn.commit()
            conn.close()
            
            logger.info(f"Cleaned up {deleted_count} offline PCs older than {hours} hours")
            return deleted_count
        except Exception as e:
            logger.error(f"Error cleaning up offline PCs: {e}")
            return 0

    async def refresh_pc_statuses(self):
        """Принудительное обновление статусов ПК на основе активных сессий"""
        try:
            updated_count = 0
            all_pcs = await self.get_all_pcs()
            
            for pc in all_pcs:
                pc_id = pc['pc_id']
                is_online = pc_id in self.active_sessions
                
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

    async def get_admin_stats(self) -> Dict[str, Any]:
        """Получение расширенной статистики для администраторов"""
        try:
            basic_stats = await self.get_session_stats()
            all_pcs = await self.get_all_pcs()
            online_pcs = [pc for pc in all_pcs if pc['status'] == 'online']
            offline_pcs = [pc for pc in all_pcs if pc['status'] == 'offline']
            
            unique_users = list(set(pc['username'] for pc in all_pcs))
            
            # Добавляем информацию об активных сессиях
            active_sessions_info = await self.get_active_sessions_info()
            
            return {
                "basic": basic_stats,
                "detailed": {
                    "active_pc_sessions": list(self.active_sessions.keys()),
                    "active_pc_count": len(self.active_sessions),
                    "user_sessions_count": len(self.user_sessions),
                    "active_remote_sessions": active_sessions_info,
                    "active_remote_sessions_count": len(active_sessions_info),
                    "total_pcs_in_db": len(all_pcs),
                    "online_pcs_in_db": len(online_pcs),
                    "offline_pcs_in_db": len(offline_pcs),
                    "unique_users": unique_users,
                    "unique_users_count": len(unique_users),
                    "connected_admins": len(self.admin_connections)
                }
            }
        except Exception as e:
            logger.error(f"Error getting admin stats: {e}")
            return {}

    async def get_active_sessions_info(self) -> List[Dict]:
        """Получение информации о всех активных сессиях"""
        active_sessions = []
        
        for session_id, session_info in self.active_remote_sessions.items():
            # Добавляем дополнительную информацию о ПК
            pc_info = await self.get_pc_by_id(session_info['target_pc_id'])
            if pc_info:
                session_info['pc_info'] = pc_info
                
            # Добавляем информацию о подключении
            if session_id in self.relay_connections:
                relay_info = self.relay_connections[session_id]
                session_info['connection_status'] = relay_info.get('status', 'unknown')
                session_info['duration'] = time.time() - relay_info.get('created_at', time.time())
                
            active_sessions.append(session_info)
        
        return active_sessions

    async def get_user_info(self, username: str) -> Dict[str, Any]:
        """Получение информации о пользователе"""
        try:
            # Здесь можно добавить получение дополнительной информации о пользователе
            # из AD или другой системы
            return {
                'username': username,
                'display_name': username,  # Можно получить из AD
                'role': await get_user_role(username)  # Функция из вашего ad_auth
            }
        except Exception as e:
            logger.error(f"Error getting user info for {username}: {e}")
            return {'username': username, 'display_name': username, 'role': 'user'}

# Глобальный экземпляр менеджера
remote_manager = RemoteDesktopManager()