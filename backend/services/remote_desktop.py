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
import subprocess
import threading
from pathlib import Path

logger = logging.getLogger(__name__)

class UltraVNCIntegration:
    """Интеграция с UltraVNC компонентами"""
    
    def __init__(self, vnc_directory: str = "./ultravnc"):
        self.vnc_directory = Path(vnc_directory)
        self.uvnc_processes: Dict[str, subprocess.Pprocess] = {}
        self.uvnc_ports: Dict[str, int] = {}
        self.next_port = 5900
        
    def setup_ultravnc(self):
        """Настройка UltraVNC компонентов"""
        try:
            # Создаем директорию для UltraVNC если не существует
            self.vnc_directory.mkdir(exist_ok=True)
            
            # Проверяем наличие необходимых файлов
            required_files = {
                'winvnc.exe': 'UltraVNC Server',
                'vncconfig.exe': 'UltraVNC Configuration',
                'vncviewer.exe': 'UltraVNC Viewer'
            }
            
            missing_files = []
            for file, description in required_files.items():
                if not (self.vnc_directory / file).exists():
                    missing_files.append(f"{file} ({description})")
            
            if missing_files:
                logger.warning(f"Missing UltraVNC files: {', '.join(missing_files)}")
                return False
                
            logger.info("UltraVNC components are available")
            return True
            
        except Exception as e:
            logger.error(f"Error setting up UltraVNC: {e}")
            return False
    
    def get_available_port(self) -> int:
        """Получение свободного порта"""
        port = self.next_port
        while True:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                try:
                    s.bind(('localhost', port))
                    self.next_port = port + 1
                    return port
                except OSError:
                    port += 1
    
    async def start_uvnc_server(self, pc_id: str, password: str = None) -> Optional[int]:
        """Запуск UltraVNC сервера (эмуляция для демонстрации)"""
        try:
            # В реальной реализации здесь будет запуск winvnc.exe
            port = self.get_available_port()
            
            # Для демонстрации создаем mock процесс
            # В продакшене здесь будет:
            # process = subprocess.Popen([
            #     self.vnc_directory / 'winvnc.exe',
            #     '-run',
            #     f'-port {port}',
            #     f'-password {password}' if password else ''
            # ])
            
            logger.info(f"Starting UltraVNC server for {pc_id} on port {port}")
            self.uvnc_ports[pc_id] = port
            # self.uvnc_processes[pc_id] = process
            
            # Ждем запуска сервиса
            await asyncio.sleep(2)
            return port
            
        except Exception as e:
            logger.error(f"Error starting UltraVNC server: {e}")
            return None
    
    async def stop_uvnc_server(self, pc_id: str):
        """Остановка UltraVNC сервера"""
        try:
            if pc_id in self.uvnc_processes:
                process = self.uvnc_processes[pc_id]
                process.terminate()
                process.wait()
                del self.uvnc_processes[pc_id]
            
            if pc_id in self.uvnc_ports:
                del self.uvnc_ports[pc_id]
                
            logger.info(f"Stopped UltraVNC server for {pc_id}")
            
        except Exception as e:
            logger.error(f"Error stopping UltraVNC server: {e}")
    
    def generate_vnc_connection_info(self, pc_id: str, host: str = "localhost") -> Dict[str, Any]:
        """Генерация информации для VNC подключения"""
        port = self.uvnc_ports.get(pc_id, 5900)
        return {
            'host': host,
            'port': port,
            'display': 0,
            'password_required': True,
            'encryption_supported': True
        }
    
    def create_vnc_viewer_connection(self, target_host: str, port: int, password: str = None) -> bool:
        """Создание VNC подключения через UltraVNC Viewer"""
        try:
            # В реальной реализации здесь будет запуск vncviewer.exe
            # command = [self.vnc_directory / 'vncviewer.exe', f'{target_host}:{port}']
            # if password:
            #     command.extend(['-password', password])
            # 
            # process = subprocess.Popen(command)
            # return process.poll() is None
            
            logger.info(f"Creating VNC connection to {target_host}:{port}")
            return True
            
        except Exception as e:
            logger.error(f"Error creating VNC connection: {e}")
            return False

class VNCSessionManager:
    """Менеджер VNC сессий"""
    
    def __init__(self):
        self.vnc_sessions: Dict[str, Dict] = {}
        self.session_passwords: Dict[str, str] = {}
        self.uvnc_integration = UltraVNCIntegration()
        
    async def initialize(self):
        """Инициализация менеджера VNC сессий"""
        return self.uvnc_integration.setup_ultravnc()
    
    async def create_vnc_session(self, pc_id: str, username: str, capabilities: Dict = None) -> Optional[Dict]:
        """Создание VNC сессии"""
        try:
            # Генерируем одноразовый пароль
            password = str(uuid.uuid4())[:8]
            
            # Запускаем VNC сервер
            port = await self.uvnc_integration.start_uvnc_server(pc_id, password)
            if not port:
                return None
            
            session_id = f"vnc_{int(time.time())}_{uuid.uuid4().hex[:8]}"
            
            session_info = {
                'session_id': session_id,
                'pc_id': pc_id,
                'username': username,
                'port': port,
                'status': 'active',
                'created_at': datetime.now().isoformat(),
                'capabilities': capabilities or {},
                'security_level': 'standard'
            }
            
            self.vnc_sessions[session_id] = session_info
            self.session_passwords[session_id] = password
            
            logger.info(f"VNC session created: {session_id} for PC {pc_id}")
            return session_info
            
        except Exception as e:
            logger.error(f"Error creating VNC session: {e}")
            return None
    
    async def get_vnc_connection_string(self, session_id: str, viewer_ip: str) -> Optional[Dict]:
        """Получение строки подключения VNC"""
        try:
            if session_id not in self.vnc_sessions:
                return None
                
            session = self.vnc_sessions[session_id]
            password = self.session_passwords.get(session_id)
            
            connection_info = self.uvnc_integration.generate_vnc_connection_info(
                session['pc_id'], 
                viewer_ip
            )
            
            return {
                'type': 'vnc_connection',
                'session_id': session_id,
                'host': connection_info['host'],
                'port': connection_info['port'],
                'password': password,
                'display': connection_info['display'],
                'security_info': {
                    'encryption_supported': connection_info['encryption_supported'],
                    'password_required': connection_info['password_required']
                },
                'viewer_download_url': '/downloads/ultravnc-viewer.zip'
            }
            
        except Exception as e:
            logger.error(f"Error getting VNC connection string: {e}")
            return None
    
    async def close_vnc_session(self, session_id: str):
        """Закрытие VNC сессии"""
        try:
            if session_id in self.vnc_sessions:
                session = self.vnc_sessions[session_id]
                await self.uvnc_integration.stop_uvnc_server(session['pc_id'])
                
                del self.vnc_sessions[session_id]
                if session_id in self.session_passwords:
                    del self.session_passwords[session_id]
                
                logger.info(f"VNC session closed: {session_id}")
                
        except Exception as e:
            logger.error(f"Error closing VNC session: {e}")
class RemoteDesktopManager:
    """Базовый менеджер удаленного рабочего стола"""
    
    def __init__(self):
        self.active_remote_sessions: Dict[str, Dict] = {}
        self.connection_stats: Dict[str, Any] = {}
        
    async def start_background_tasks(self):
        """Запуск фоновых задач"""
        logger.info("Starting background tasks")
        
    async def create_session(self, viewer_ws: Any, target_pc_id: str, session_type: str = "view", 
                           viewer_username: str = "viewer", requested_capabilities: Dict = None) -> Optional[str]:
        """Создание сессии (базовая реализация)"""
        try:
            session_id = f"session_{int(time.time())}_{uuid.uuid4().hex[:8]}"
            
            self.active_remote_sessions[session_id] = {
                'viewer_ws': viewer_ws,
                'target_pc_id': target_pc_id,
                'session_type': session_type,
                'viewer_username': viewer_username,
                'capabilities': requested_capabilities or {},
                'created_at': datetime.now().isoformat(),
                'status': 'active'
            }
            
            logger.info(f"Session created: {session_id}")
            return session_id
            
        except Exception as e:
            logger.error(f"Error creating session: {e}")
            return None
    
    async def relay_message(self, session_id: str, message: Dict):
        """Пересылка сообщений (базовая реализация)"""
        try:
            if session_id in self.active_remote_sessions:
                session = self.active_remote_sessions[session_id]
                # В реальной реализации здесь будет пересылка сообщений
                logger.info(f"Relaying message for session {session_id}: {message.get('type', 'unknown')}")
        except Exception as e:
            logger.error(f"Error relaying message: {e}")
    
    async def end_session(self, session_id: str):
        """Завершение сессии (базовая реализация)"""
        try:
            if session_id in self.active_remote_sessions:
                del self.active_remote_sessions[session_id]
                logger.info(f"Session ended: {session_id}")
        except Exception as e:
            logger.error(f"Error ending session: {e}")

class EnhancedRemoteDesktopManager(RemoteDesktopManager):
    """Расширенный менеджер удаленного рабочего стола с UltraVNC поддержкой"""
    
    def __init__(self):
        super().__init__()
        self.vnc_manager = VNCSessionManager()
        self.file_transfer_sessions: Dict[str, Dict] = {}
        self.chat_sessions: Dict[str, List] = {}
class EnhancedRemoteDesktopManager(RemoteDesktopManager):
    """Расширенный менеджер удаленного рабочего стола с UltraVNC поддержкой"""
    
    def __init__(self):
        super().__init__()
        self.vnc_manager = VNCSessionManager()
        self.file_transfer_sessions: Dict[str, Dict] = {}
        self.chat_sessions: Dict[str, List] = {}
        
    async def start_background_tasks(self):
        """Запуск фоновых задач"""
        await super().start_background_tasks()
        await self.vnc_manager.initialize()
        
    async def create_enhanced_session(self, viewer_ws: Any, target_pc_id: str, session_type: str = "view", 
                                    viewer_username: str = "viewer", requested_capabilities: Dict = None):
        """Создание расширенной сессии с поддержкой VNC"""
        try:
            # Стандартное создание сессии
            session_id = await super().create_session(
                viewer_ws, target_pc_id, session_type, viewer_username, requested_capabilities
            )
            
            if not session_id:
                return None
            
            # Добавляем VNC возможности если запрошено
            if requested_capabilities and requested_capabilities.get('vnc_support', False):
                vnc_session = await self.vnc_manager.create_vnc_session(
                    target_pc_id, viewer_username, requested_capabilities
                )
                
                if vnc_session:
                    self.active_remote_sessions[session_id]['vnc_session'] = vnc_session
                    logger.info(f"VNC session attached: {vnc_session['session_id']}")
            
            return session_id
            
        except Exception as e:
            logger.error(f"Error creating enhanced session: {e}")
            return None
    
    async def handle_vnc_connection_request(self, session_id: str, viewer_ip: str):
        """Обработка запроса на VNC подключение"""
        try:
            if session_id not in self.active_remote_sessions:
                return None
            
            session = self.active_remote_sessions[session_id]
            if 'vnc_session' not in session:
                return None
            
            vnc_connection = await self.vnc_manager.get_vnc_connection_string(
                session['vnc_session']['session_id'], viewer_ip
            )
            
            return vnc_connection
            
        except Exception as e:
            logger.error(f"Error handling VNC connection request: {e}")
            return None
    
    async def handle_file_transfer_request(self, session_id: str, file_info: Dict):
        """Обработка запроса на передачу файлов"""
        try:
            if session_id not in self.active_remote_sessions:
                return {'success': False, 'error': 'Session not found'}
            
            transfer_id = f"transfer_{int(time.time())}_{uuid.uuid4().hex[:8]}"
            
            self.file_transfer_sessions[transfer_id] = {
                'session_id': session_id,
                'file_info': file_info,
                'status': 'pending',
                'progress': 0,
                'created_at': datetime.now().isoformat()
            }
            
            # Уведомляем хоста о запросе передачи файла
            await self.relay_message(session_id, {
                'type': 'file_transfer_request',
                'transfer_id': transfer_id,
                'file_info': file_info
            })
            
            return {'success': True, 'transfer_id': transfer_id}
            
        except Exception as e:
            logger.error(f"Error handling file transfer request: {e}")
            return {'success': False, 'error': str(e)}
    
    async def handle_chat_message(self, session_id: str, message: str, sender: str):
        """Обработка сообщений чата"""
        try:
            if session_id not in self.chat_sessions:
                self.chat_sessions[session_id] = []
            
            chat_message = {
                'id': str(uuid.uuid4()),
                'session_id': session_id,
                'sender': sender,
                'message': message,
                'timestamp': datetime.now().isoformat()
            }
            
            self.chat_sessions[session_id].append(chat_message)
            
            # Ограничиваем историю чата
            if len(self.chat_sessions[session_id]) > 100:
                self.chat_sessions[session_id] = self.chat_sessions[session_id][-50:]
            
            # Пересылаем сообщение другой стороне
            await self.relay_message(session_id, {
                'type': 'chat_message',
                'chat_data': chat_message
            })
            
            return chat_message
            
        except Exception as e:
            logger.error(f"Error handling chat message: {e}")
            return None
    
    async def get_session_capabilities(self, session_id: str) -> Dict[str, Any]:
        """Получение возможностей сессии"""
        try:
            if session_id not in self.active_remote_sessions:
                return {}
            
            session = self.active_remote_sessions[session_id]
            capabilities = {
                'vnc_available': 'vnc_session' in session,
                'file_transfer': True,
                'chat': True,
                'remote_control': True,
                'session_type': session.get('session_type', 'view')
            }
            
            if 'vnc_session' in session:
                capabilities['vnc_info'] = session['vnc_session']
            
            return capabilities
            
        except Exception as e:
            logger.error(f"Error getting session capabilities: {e}")
            return {}
    
    async def end_session(self, session_id: str):
        """Завершение сессии с очисткой VNC"""
        try:
            # Закрываем VNC сессию если есть
            if (session_id in self.active_remote_sessions and 
                'vnc_session' in self.active_remote_sessions[session_id]):
                
                vnc_session_id = self.active_remote_sessions[session_id]['vnc_session']['session_id']
                await self.vnc_manager.close_vnc_session(vnc_session_id)
            
            # Очищаем чат сессии
            if session_id in self.chat_sessions:
                del self.chat_sessions[session_id]
            
            # Очищаем файловые трансферы
            transfers_to_remove = [
                tid for tid, transfer in self.file_transfer_sessions.items() 
                if transfer['session_id'] == session_id
            ]
            for transfer_id in transfers_to_remove:
                del self.file_transfer_sessions[transfer_id]
            
            # Стандартное завершение сессии
            await super().end_session(session_id)
            
        except Exception as e:
            logger.error(f"Error ending enhanced session: {e}")

# Глобальные экземпляры
remote_manager = EnhancedRemoteDesktopManager()
vnc_manager = VNCSessionManager()