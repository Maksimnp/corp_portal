import asyncio
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from services.remote_desktop import remote_manager
from services.ad_auth import validate_token  # Функция валидации JWT (должна возвращать True/False или username)

logger = logging.getLogger(__name__)
router = APIRouter()

@router.websocket("/api/remote/host")
async def websocket_host(websocket: WebSocket, token: str = Query(None)):
    """WebSocket для хоста с токеном из query"""
    if not token or not validate_token(token):
        logger.warning("Invalid or missing token for host WS")
        await websocket.close(code=1008, reason="Invalid token")
        return
    
    await websocket.accept()
    logger.info(f"Host WebSocket accepted with token: {token[:10]}...")  # Лог для отладки

    pc_id = None
    try:
        auth_data = await websocket.receive_text()
        auth_message = json.loads(auth_data)

        if auth_message.get("type") == "auth":
            username = auth_message.get("username")
            system_info = auth_message.get("system_info", {})

            if username:
                pc_id = f"{username}_{system_info.get('hostname', 'pc')}"
                await remote_manager.register_pc(pc_id, username, websocket, system_info)

                await websocket.send_json({
                    "type": "auth_success",
                    "pc_id": pc_id,
                    "message": "Authentication successful"
                })
                logger.info(f"Host authenticated: {pc_id}")
            else:
                await websocket.send_json({"type": "auth_error", "message": "Username required"})
                await websocket.close()
                return
        else:
            await websocket.send_json({"type": "auth_error", "message": "First message must be auth"})
            await websocket.close()
            return

        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                message = json.loads(data)
                msg_type = message.get("type")
                logger.debug(f"Host message: {msg_type}")  # Более детальный лог

                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})

                elif msg_type == "session_response":
                    session_id = message.get("session_id")
                    await remote_manager.handle_session_response(pc_id, message)  # Используем новый метод

                elif msg_type == "screen_data":
                    session_id = message.get("session_id")
                    await remote_manager.send_screen_data(session_id, message.get("data", ""))

            except asyncio.TimeoutError:
                await websocket.send_json({"type": "ping"})

    except WebSocketDisconnect:
        logger.info(f"Host disconnected: {pc_id}")
    except Exception as e:
        logger.error(f"Host WS error: {e}")
    finally:
        if pc_id:
            await remote_manager.unregister_pc(pc_id)
        await websocket.close()

@router.websocket("/api/remote/viewer")
async def websocket_viewer(websocket: WebSocket, token: str = Query(None)):
    """WebSocket для viewer с токеном из query"""
    if not token or not validate_token(token):
        logger.warning("Invalid or missing token for viewer WS")
        await websocket.close(code=1008, reason="Invalid token")
        return
    
    await websocket.accept()
    logger.info(f"Viewer WebSocket accepted with token: {token[:10]}...")  # Лог

    session_id = None
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            msg_type = message.get("type")
            logger.debug(f"Viewer message: {msg_type}")

            if msg_type == "create_session":
                target_pc_id = message.get("target_pc_id")
                session_type = message.get("session_type", "view")
                viewer_username = validate_token(token)  # Предполагаем, возвращает username или из токена

                session_id = await remote_manager.create_session(websocket, target_pc_id, session_type, viewer_username)
                if session_id:
                    await websocket.send_json({"type": "session_created", "session_id": session_id})
                else:
                    await websocket.send_json({"type": "session_error", "message": "PC offline or not found"})

            elif msg_type == "remote_command":
                await remote_manager.relay_message(message.get("session_id"), message, from_viewer=True)

            elif msg_type == "end_session":
                await remote_manager.end_session(message.get("session_id"))

            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        logger.info("Viewer disconnected")
    except Exception as e:
        logger.error(f"Viewer WS error: {e}")
    finally:
        if session_id:
            await remote_manager.end_session(session_id)
        await websocket.close()