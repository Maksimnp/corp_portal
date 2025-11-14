# services/vnc_api.py
from fastapi import APIRouter, HTTPException, WebSocket, Depends
from typing import Dict, Any, List
import logging
from services.remote_desktop import remote_manager, vnc_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/vnc", tags=["vnc"])

@router.websocket("/ws/{session_id}")
async def vnc_websocket_endpoint(websocket: WebSocket, session_id: str):
    """WebSocket endpoint для VNC соединений"""
    await websocket.accept()
    await vnc_websocket_handler.handle_vnc_websocket(websocket, f"/vnc/{session_id}")

@router.post("/sessions/{session_id}/vnc-connection")
async def get_vnc_connection(session_id: str, connection_request: Dict[str, Any]):
    """Получение информации для VNC подключения"""
    try:
        viewer_ip = connection_request.get('viewer_ip', 'localhost')
        
        vnc_info = await remote_manager.handle_vnc_connection_request(session_id, viewer_ip)
        if not vnc_info:
            raise HTTPException(status_code=404, detail="VNC connection not available")
        
        return {
            "success": True,
            "vnc_connection": vnc_info,
            "viewer_download_url": "/downloads/ultravnc-viewer.zip"
        }
    
    except Exception as e:
        logger.error(f"Error getting VNC connection: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sessions/{session_id}/capabilities")
async def get_session_capabilities(session_id: str):
    """Получение возможностей сессии"""
    try:
        capabilities = await remote_manager.get_session_capabilities(session_id)
        return {
            "success": True,
            "capabilities": capabilities
        }
    
    except Exception as e:
        logger.error(f"Error getting session capabilities: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/downloads/ultravnc-viewer/generate")
async def generate_viewer_download():
    """Генерация пакета UltraVNC Viewer для скачивания"""
    try:
        # В реальной реализации здесь будет создание ZIP архива
        # с UltraVNC Viewer и конфигурационными файлами
        
        return {
            "success": True,
            "download_url": "/downloads/ultravnc-viewer.zip",
            "expires_in": 3600,
            "instructions": "Download and extract UltraVNC Viewer to connect"
        }
    
    except Exception as e:
        logger.error(f"Error generating viewer download: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/statistics")
async def get_vnc_statistics():
    """Получение статистики VNC сессий"""
    try:
        stats = await remote_manager.get_session_stats()
        
        vnc_stats = {
            "active_vnc_sessions": len([
                session for session in remote_manager.active_remote_sessions.values()
                if 'vnc_session' in session
            ]),
            "total_file_transfers": len(remote_manager.file_transfer_sessions),
            "active_chat_sessions": len(remote_manager.chat_sessions),
            "ultravnc_available": vnc_manager.uvnc_integration.setup_ultravnc()
        }
        
        return {
            "success": True,
            "general_stats": stats,
            "vnc_stats": vnc_stats
        }
    
    except Exception as e:
        logger.error(f"Error getting VNC statistics: {e}")
        raise HTTPException(status_code=500, detail=str(e))