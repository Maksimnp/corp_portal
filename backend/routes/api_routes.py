import asyncio
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from services.remote_desktop import remote_manager
from services.ad_auth import validate_token, get_username_from_token, get_user_role

logger = logging.getLogger(__name__)
router = APIRouter()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

@router.websocket("/api/remote/host")
async def websocket_host(websocket: WebSocket, token: str = Query(...)):
    """WebSocket для хоста с токеном из query"""
    logger.info(f"🔌 Host WebSocket connection attempt with token: {token[:10]}...")
    
    if not token or not validate_token(token):
        logger.warning("❌ Invalid or missing token for host WS")
        await websocket.close(code=1008, reason="Invalid token")
        return
    
    await websocket.accept()
    logger.info("✅ Host WebSocket accepted")

    pc_id = None
    try:
        auth_data = await websocket.receive_text()
        auth_message = json.loads(auth_data)

        if auth_message.get("type") == "auth":
            username = auth_message.get("username")
            system_info = auth_message.get("system_info", {})
            provided_pc_id = auth_message.get("pc_id")

            if username:
                pc_id = provided_pc_id or f"{username}_{system_info.get('hostname', 'pc')}"
                
                await remote_manager.register_pc(pc_id, username, websocket, system_info)

                await websocket.send_json({
                    "type": "auth_success",
                    "pc_id": pc_id,
                    "message": "Authentication successful"
                })
                logger.info(f"✅ Host authenticated: {pc_id}")

                while True:
                    try:
                        data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                        message = json.loads(data)
                        msg_type = message.get("type")
                        logger.debug(f"📨 Host message from {pc_id}: {msg_type}")

                        if msg_type == "ping":
                            await websocket.send_json({"type": "pong"})

                        
                        elif msg_type == "screen_data":
                            session_id = message.get("session_id")
                            screen_data = message.get("data", {})
                            await remote_manager.send_screen_data(session_id, screen_data)

                        elif msg_type == "session_ended":
                            session_id = message.get("session_id")
                            await remote_manager.end_session(session_id)

                        elif msg_type == "session_response":
                            await remote_manager.handle_session_response(pc_id, message)

                        elif msg_type == "request_screen":
                            session_id = message.get("session_id")
                            await websocket.send_json({
                                "type": "screen_requested",
                                "session_id": session_id
                            })

                        else:
                            logger.warning(f"❓ Unknown host message type: {msg_type}")

                    except asyncio.TimeoutError:
                        await websocket.send_json({"type": "ping"})
                        logger.debug("📡 Sent ping to host")

            else:
                await websocket.send_json({"type": "auth_error", "message": "Username required"})
                await websocket.close()
                return
        else:
            await websocket.send_json({"type": "auth_error", "message": "First message must be auth"})
            await websocket.close()
            return

    except WebSocketDisconnect:
        logger.info(f"🔌 Host disconnected: {pc_id}")
    except Exception as e:
        logger.error(f"💥 Host WS error for {pc_id}: {e}")
    finally:
        if pc_id:
            await remote_manager.unregister_pc(pc_id)
        try:
            await websocket.close()
        except:
            pass

@router.websocket("/api/remote/viewer")
async def websocket_viewer(websocket: WebSocket, token: str = Query(...)):
    """WebSocket для viewer с токеном из query"""
    logger.info(f"🔌 Viewer WebSocket connection attempt with token: {token[:10]}...")
    
    if not token or not validate_token(token):
        logger.warning("❌ Invalid or missing token for viewer WS")
        await websocket.close(code=1008, reason="Invalid token")
        return
    
    await websocket.accept()
    logger.info("✅ Viewer WebSocket accepted")

    session_id = None
    viewer_username = get_username_from_token(token)
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            msg_type = message.get("type")
            logger.debug(f"📨 Viewer message from {viewer_username}: {msg_type}")

            if msg_type == "create_session":
                target_pc_id = message.get("target_pc_id")
                session_type = message.get("session_type", "view")

                session_id = await remote_manager.create_session(
                    websocket, target_pc_id, session_type, viewer_username
                )
                
                if session_id:
                    await websocket.send_json({
                        "type": "session_created", 
                        "session_id": session_id,
                        "status": "pending"
                    })
                    logger.info(f"✅ Session created: {session_id}")
                else:
                    await websocket.send_json({
                        "type": "session_error", 
                        "message": "PC offline or not found"
                    })

            elif msg_type == "request_screen":
                session_id = message.get("session_id")
                await remote_manager.request_screen(session_id)

            elif msg_type == "remote_command":
                await remote_manager.relay_message(
                    message.get("session_id"), 
                    message,
                    from_viewer=True
                )

            elif msg_type == "end_session":
                session_id_to_end = message.get("session_id")
                await remote_manager.end_session(session_id_to_end)
                if session_id_to_end == session_id:
                    session_id = None

            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})

            else:
                logger.warning(f"❓ Unknown viewer message type: {msg_type}")

    except WebSocketDisconnect:
        logger.info(f"🔌 Viewer disconnected: {viewer_username}")
    except Exception as e:
        logger.error(f"💥 Viewer WS error for {viewer_username}: {e}")
    finally:
        if session_id:
            await remote_manager.end_session(session_id)
        try:
            await websocket.close()
        except:
            pass

@router.get("/api/remote/pcs")
async def get_pcs(token: str = Depends(oauth2_scheme)):
    """Получение ПК в зависимости от роли пользователя"""
    try:
        if not validate_token(token):
            raise HTTPException(status_code=401, detail="Invalid token")
            
        username = get_username_from_token(token)
        role = get_user_role(username)
        
        logger.info(f"📊 Getting PCs for user: {username}, role: {role}")
        
        if role == 'admin':
            pcs = await remote_manager.get_all_pcs()
            logger.info(f"👑 Admin {username} viewing all {len(pcs)} PCs")
        else:
            pcs = await remote_manager.get_user_pcs(username)
            logger.info(f"👤 User {username} viewing {len(pcs)} PCs")
        
        return {
            "pcs": pcs, 
            "status": "success", 
            "count": len(pcs),
            "user_role": role,
            "user": username
        }
    except Exception as e:
        logger.error(f"❌ Error getting PCs: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/api/remote/refresh-status")
async def refresh_pc_status(token: str = Depends(oauth2_scheme)):
    """Принудительное обновление статусов ПК"""
    try:
        if not validate_token(token):
            raise HTTPException(status_code=401, detail="Invalid token")
            
        username = get_username_from_token(token)
        role = get_user_role(username)
        
        if role != 'admin':
            raise HTTPException(status_code=403, detail="Admin access required")
        
        updated_count = await remote_manager.refresh_pc_statuses()
        
        logger.info(f"🔄 Admin {username} refreshed PC statuses: {updated_count} updated")
        
        return {
            "status": "success",
            "message": f"Updated {updated_count} PC statuses",
            "updated_count": updated_count,
            "user": username
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error refreshing PC status: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/api/remote/admin/stats")
async def get_admin_stats(token: str = Depends(oauth2_scheme)):
    """Получение расширенной статистики для администраторов"""
    try:
        if not validate_token(token):
            raise HTTPException(status_code=401, detail="Invalid token")
            
        username = get_username_from_token(token)
        role = get_user_role(username)
        
        if role != 'admin':
            raise HTTPException(status_code=403, detail="Admin access required")
        
        stats = await remote_manager.get_admin_stats()
        
        logger.info(f"📈 Admin {username} requested detailed stats")
        
        return {
            "stats": stats,
            "status": "success",
            "user": username
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error getting admin stats: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/api/remote/test")
async def test_remote(token: str = Depends(oauth2_scheme)):
    """Тестовый эндпоинт"""
    return {
        "status": "success", 
        "message": "Remote desktop API is working",
        "timestamp": asyncio.get_event_loop().time()
    }

@router.get("/api/remote/stats")
async def get_stats(token: str = Depends(oauth2_scheme)):
    """Получение статистики"""
    try:
        stats = await remote_manager.get_session_stats()
        return {
            "stats": stats, 
            "status": "success",
            "active_sessions": len(remote_manager.relay_connections),
            "registered_pcs": len(remote_manager.active_sessions)
        }
    except Exception as e:
        logger.error(f"❌ Error getting stats: {e}")
        return {"stats": {}, "status": "error"}

@router.post("/api/remote/session/{session_id}/end")
async def end_session(session_id: str, token: str = Depends(oauth2_scheme)):
    """Принудительное завершение сессии"""
    try:
        username = get_username_from_token(token)
        role = get_user_role(username)
        
        session_info = await remote_manager.get_session_info(session_id)
        if not session_info:
            raise HTTPException(status_code=404, detail="Session not found")
            
        if role != 'admin' and session_info.get('viewer_username') != username:
            raise HTTPException(status_code=403, detail="Not authorized to end this session")
        
        await remote_manager.end_session(session_id)
        return {"status": "success", "message": "Session ended"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error ending session: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")