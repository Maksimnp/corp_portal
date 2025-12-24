# api/remote_desktop.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Header, HTTPException, Query
from services.remote_desktop_manager import remote_manager
from services.jwt_utils import verify_token
from services.admin_manager import admin_manager
import asyncio
import json
import logging
from datetime import datetime
from typing import Optional

router = APIRouter(prefix="/api/remote", tags=["remote-desktop"])
logger = logging.getLogger(__name__)

async def get_current_user(authorization: str = Header(...)):
    """Получение текущего пользователя"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization required")
    
    token = authorization[7:]
    user_data = verify_token(token)
    if not user_data:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    username = user_data.get("username")
    
    # Проверяем роль администратора
    admin = admin_manager.get_admin_by_username(username)
    if admin and admin.get('is_active'):
        user_data["role"] = "admin"
    else:
        user_data["role"] = "user"
    
    return user_data

# ==================== WebSocket Endpoints ====================

@router.websocket("/host")
async def websocket_host(websocket: WebSocket, token: str = Query(...)):
    """WebSocket для агента на ПК"""
    await websocket.accept()
    logger.info("Host WebSocket connection accepted")
    
    # Аутентификация
    user_data = verify_token(token)
    if not user_data:
        await websocket.send_json({"type": "auth_error", "message": "Invalid token"})
        await websocket.close(code=1008)
        return
    
    pc_id = None
    username = user_data.get("username")
    
    try:
        # Ожидаем регистрационное сообщение
        auth_data = await asyncio.wait_for(websocket.receive_text(), timeout=10.0)
        auth_message = json.loads(auth_data)
        
        if auth_message.get("type") == "register":
            system_info = auth_message.get("system_info", {})
            hostname = system_info.get("hostname", "unknown")
            pc_id = f"{username}_{hostname}"
            
            # Регистрируем хост
            await remote_manager.register_host(pc_id, username, websocket, system_info)
            
            await websocket.send_json({
                "type": "registered",
                "pc_id": pc_id,
                "message": "Host registered successfully"
            })
            
            logger.info(f"Host registered: {pc_id}")
        else:
            await websocket.send_json({"type": "error", "message": "First message must be register"})
            await websocket.close(code=1008)
            return
        
        # Основной цикл обработки сообщений
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                message = json.loads(data)
                message_type = message.get("type")
                
                if message_type == "screen_data":
                    # Пересылаем данные экрана viewer'у
                    session_id = message.get("session_id")
                    if session_id:
                        await remote_manager.relay_message(session_id, message, from_viewer=False)
                
                elif message_type == "session_response":
                    # Ответ на запрос сессии
                    await remote_manager.handle_session_response(pc_id, message)
                
                elif message_type == "heartbeat":
                    # Обновляем время последней активности
                    if pc_id in remote_manager.active_hosts:
                        remote_manager.active_hosts[pc_id]["last_seen"] = datetime.now()
                    await websocket.send_json({"type": "heartbeat_ack"})
                
                elif message_type == "ping":
                    await websocket.send_json({"type": "pong"})
                
            except asyncio.TimeoutError:
                # Отправляем ping
                await websocket.send_json({"type": "ping"})
                
    except WebSocketDisconnect:
        logger.info(f"Host disconnected: {pc_id}")
    except Exception as e:
        logger.error(f"Host WebSocket error: {e}")
    finally:
        if pc_id:
            await remote_manager.unregister_host(pc_id)

@router.websocket("/viewer")
async def websocket_viewer(websocket: WebSocket, token: str = Query(...)):
    """WebSocket для просмотрщика (браузер)"""
    await websocket.accept()
    logger.info("Viewer WebSocket connection accepted")
    
    # Аутентификация
    user_data = verify_token(token)
    if not user_data:
        await websocket.send_json({"type": "auth_error", "message": "Invalid token"})
        await websocket.close(code=1008)
        return
    
    session_id = None
    username = user_data.get("username")
    
    try:
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                message = json.loads(data)
                message_type = message.get("type")
                
                if message_type == "create_session":
                    target_pc_id = message.get("target_pc_id")
                    session_type = message.get("session_type", "view")
                    
                    session_id = await remote_manager.create_session(
                        websocket, 
                        target_pc_id, 
                        session_type, 
                        username
                    )
                    
                    if session_id:
                        await websocket.send_json({
                            "type": "session_created",
                            "session_id": session_id,
                            "status": "pending"
                        })
                    else:
                        await websocket.send_json({
                            "type": "error",
                            "message": "Failed to create session"
                        })
                
                elif message_type == "remote_command":
                    # Пересылаем команду хосту
                    sess_id = message.get("session_id")
                    if sess_id:
                        await remote_manager.relay_message(sess_id, message, from_viewer=True)
                
                elif message_type == "end_session":
                    sess_id = message.get("session_id")
                    if sess_id:
                        await remote_manager.end_session(sess_id)
                        session_id = None
                
                elif message_type == "ping":
                    await websocket.send_json({"type": "pong"})
                
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "ping"})
                
    except WebSocketDisconnect:
        logger.info(f"Viewer disconnected: {username}")
    except Exception as e:
        logger.error(f"Viewer WebSocket error: {e}")
    finally:
        if session_id:
            await remote_manager.end_session(session_id)

# ==================== HTTP Endpoints ====================

@router.get("/pcs")
async def get_available_pcs(current_user: dict = Depends(get_current_user)):
    """Получение списка доступных ПК"""
    try:
        username = current_user.get("username")
        user_role = current_user.get("role", "user")
        
        pcs = await remote_manager.get_user_pcs(username, user_role)
        
        return {
            "pcs": pcs,
            "count": len(pcs),
            "user_role": user_role
        }
    except Exception as e:
        logger.error(f"Error getting PCs: {e}")
        raise HTTPException(status_code=500, detail="Failed to get PCs")

@router.get("/admin/settings")
async def get_admin_settings(current_user: dict = Depends(get_current_user)):
    """Получение настроек (только админ)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    return {"settings": remote_manager.get_settings()}

@router.post("/settings/all-users-see-all-pcs")
async def toggle_visibility(
    enabled: bool = Query(...),
    current_user: dict = Depends(get_current_user)
):
    """Переключение видимости ПК (только админ)"""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = remote_manager.toggle_all_users_see_all_pcs(enabled)
    
    return {
        "message": "Настройка обновлена",
        "all_users_see_all_pcs": result
    }