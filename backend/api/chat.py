# backend/api/chat.py
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from services.chat_service import chat_service
from api.auth import verify_token
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

@router.websocket("/ws/{channel}")
async def websocket_endpoint(websocket: WebSocket, channel: str):
    query_params = websocket.query_params
    token = query_params.get("token")

    if not token:
        await websocket.close(code=1008)
        return

    user = verify_token(token)
    if not user:
        await websocket.close(code=1008)
        return

    username = user["username"]
    display_name = user.get("full_name") or username  # Используем ФИО

    await chat_service.connect(websocket, channel, username)
    try:
        while True:
            data = await websocket.receive_text()
            await chat_service.broadcast(channel, f"{display_name}: {data}", username)
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        await chat_service.disconnect(websocket, channel)

@router.get("/channels")
async def get_channels(token: str = Depends(oauth2_scheme)):
    user = verify_token(token)
    if not user:
        logger.warning("Invalid or expired token for /channels")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    logger.info(f"User {user['username']} requested channels")
    channels = chat_service.get_channels()
    logger.debug(f"Returning channels: {channels}")
    return {"channels": channels}