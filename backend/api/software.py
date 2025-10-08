from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
import os
import json
import uuid
from datetime import datetime
from services.jwt_utils import verify_token

router = APIRouter(prefix="/software", tags=["software"])

SOFTWARE_DIR = "software"

# Убедимся, что папка software существует
if not os.path.exists(SOFTWARE_DIR):
    os.makedirs(SOFTWARE_DIR)

class SoftwareItem(BaseModel):
    id: str
    title: str
    description: str
    filePath: str
    category: Optional[str] = None
    created_at: str
    downloads_count: int

class SoftwareCategory(BaseModel):
    name: str
    count: int

class SoftwareStats(BaseModel):
    total_software: int
    total_downloads: int
    top_categories: List[dict]

@router.get("/", response_model=dict)
async def get_software(category: Optional[str] = None, search: Optional[str] = None, current_user: dict = Depends(verify_token)):
    try:
        files = [f for f in os.listdir(SOFTWARE_DIR) if f.endswith('.json')]
        software_list = []
        
        for file in files:
            with open(os.path.join(SOFTWARE_DIR, file), 'r', encoding='utf-8') as f:
                data = json.load(f)
                software_list.append(SoftwareItem(**data))
        
        # Фильтрация по категории
        if category and category != 'all':
            software_list = [s for s in software_list if s.category == category]
        
        # Поиск по названию и описанию
        if search:
            search_lower = search.lower()
            software_list = [
                s for s in software_list
                if search_lower in s.title.lower() or search_lower in s.description.lower()
            ]
        
        # Формирование списка категорий
        categories = {}
        for s in software_list:
            if s.category:
                categories[s.category] = categories.get(s.category, 0) + 1
        categories_list = [SoftwareCategory(name=name, count=count) for name, count in categories.items()]
        
        return {"software": software_list, "categories": categories_list}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load software list: {str(e)}")

@router.get("/stats", response_model=SoftwareStats)
async def get_software_stats(current_user: dict = Depends(verify_token)):
    if not current_user.get("isAdmin", False):
        raise HTTPException(status_code=403, detail="Access denied: Admins only")
    
    try:
        files = [f for f in os.listdir(SOFTWARE_DIR) if f.endswith('.json')]
        software_list = []
        
        for file in files:
            with open(os.path.join(SOFTWARE_DIR, file), 'r', encoding='utf-8') as f:
                data = json.load(f)
                software_list.append(SoftwareItem(**data))
        
        categories = {}
        for s in software_list:
            if s.category:
                if s.category not in categories:
                    categories[s.category] = {"count": 0, "downloads": 0}
                categories[s.category]["count"] += 1
                categories[s.category]["downloads"] += s.downloads_count
        
        stats = {
            "total_software": len(software_list),
            "total_downloads": sum(s.downloads_count for s in software_list),
            "top_categories": [
                {"name": name, "count": data["count"], "downloads": data["downloads"]}
                for name, data in categories.items()
            ]
        }
        
        return SoftwareStats(**stats)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load software stats: {str(e)}")

@router.post("/upload")
async def upload_software(
    title: str,
    description: str,
    category: Optional[str] = None,
    file: UploadFile = File(...),
    current_user: dict = Depends(verify_token)
):
    if not current_user.get("isAdmin", False):
        raise HTTPException(status_code=403, detail="Access denied: Admins only")
    
    try:
        # Сохранение файла
        file_extension = file.filename.split('.')[-1]
        file_id = str(uuid.uuid4())
        file_path = os.path.join(SOFTWARE_DIR, f"{file_id}.{file_extension}")
        
        with open(file_path, "wb") as f:
            f.write(await file.read())
        
        # Создание метаданных
        software = SoftwareItem(
            id=file_id,
            title=title,
            description=description,
            filePath=file_path,
            category=category,
            created_at=datetime.utcnow().isoformat(),
            downloads_count=0
        )
        
        # Сохранение метаданных в JSON
        metadata_path = os.path.join(SOFTWARE_DIR, f"{file_id}.json")
        with open(metadata_path, 'w', encoding='utf-8') as f:
            json.dump(software.dict(), f, ensure_ascii=False, indent=2)
        
        # Уведомление через WebSocket
        from api.websocket_manager import websocket_manager
        payload = {
            "type": "software_updated",
            "data": software.dict()
        }
        await websocket_manager.broadcast_notification(payload, roles=["user", "admin"])
        
        return {"status": "Software uploaded successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload software: {str(e)}")

@router.get("/{id}/download")
async def download_software(id: str, current_user: dict = Depends(verify_token)):
    try:
        metadata_path = os.path.join(SOFTWARE_DIR, f"{id}.json")
        if not os.path.exists(metadata_path):
            raise HTTPException(status_code=404, detail="Software not found")
        
        with open(metadata_path, 'r', encoding='utf-8') as f:
            metadata = json.load(f)
        
        file_path = metadata["filePath"]
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="File not found")
        
        # Увеличение счетчика скачиваний
        metadata["downloads_count"] += 1
        with open(metadata_path, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2)
        
        return FileResponse(file_path, filename=os.path.basename(file_path))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to download software: {str(e)}")