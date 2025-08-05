from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, status, Depends, UploadFile, File, Form
from fastapi.responses import FileResponse
from datetime import datetime
from typing import List, Optional
import uuid
import os
from pathlib import Path
from ..services.chat import ChatService
from ..db.models.chat import Channel, Message, ChannelCreate
from ..core.security import get_current_user
from ..db.session import get_db
from sqlalchemy.orm import Session

router = APIRouter()
chat_service = ChatService()

UPLOAD_DIR = "uploads"
Path(UPLOAD_DIR).mkdir(exist_ok=True)

@router.websocket("/ws/{channel_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    channel_id: str,
    token: str,
    db: Session = Depends(get_db)
):
    user = await get_current_user(token, db)
    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await chat_service.connect(websocket, channel_id, user.username)
    
    try:
        while True:
            data = await websocket.receive_json()
            
            if data.get("type") == "message":
                message = Message(
                    id=str(uuid.uuid4()),
                    channel_id=channel_id,
                    sender=user.username,
                    content=data["content"],
                    timestamp=datetime.now(),
                    is_file=data.get("is_file", False)
                )
                
                await chat_service.broadcast(channel_id, message)
                await chat_service.save_message(db, message)

    except WebSocketDisconnect:
        await chat_service.disconnect(websocket, channel_id, user.username)
    except Exception as e:
        print(f"WebSocket error: {e}")
        await websocket.close()

@router.post("/channels", response_model=Channel)
async def create_channel(
    channel_data: ChannelCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    channel = await chat_service.create_channel(db, user.username, channel_data)
    return channel

@router.get("/channels", response_model=List[Channel])
async def get_user_channels(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    return await chat_service.get_user_channels(db, user.username)

@router.delete("/channels/{channel_id}")
async def delete_channel(
    channel_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    await chat_service.delete_channel(db, channel_id, user.username)
    return {"status": "success"}

@router.post("/messages/{channel_id}/upload")
async def upload_file(
    channel_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    if not await chat_service.can_access_channel(db, channel_id, user.username):
        raise HTTPException(status_code=403, detail="Access denied")
    
    file_ext = Path(file.filename).suffix
    file_id = str(uuid.uuid4())
    file_path = Path(UPLOAD_DIR) / f"{file_id}{file_ext}"
    
    with open(file_path, "wb") as buffer:
        buffer.write(await file.read())
    
    return {"file_url": f"/uploads/{file_id}{file_ext}"}

@router.get("/uploads/{file_id}")
async def get_uploaded_file(file_id: str, ext: str):
    file_path = Path(UPLOAD_DIR) / f"{file_id}{ext}"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path)