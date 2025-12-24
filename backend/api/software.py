from fastapi import APIRouter, Depends, Form, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
import os
import json
from datetime import datetime
from services.jwt_utils import get_current_user
import logging
from typing import Optional
from dotenv import load_dotenv
import re
import pefile
import zipfile
import tempfile
import shutil
from fastapi.responses import StreamingResponse
from pathlib import Path
load_dotenv()

logging.basicConfig(
    level=logging.INFO if os.getenv("ENV") == "production" else logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

import requests

HF_TOKEN = os.getenv("HF_TOKEN")
if not HF_TOKEN:
    raise ValueError("HF_TOKEN not set in environment")

HF_CHAT_API_URL = "https://router.huggingface.co/v1/chat/completions"


logger = logging.getLogger("software")
router = APIRouter(prefix="/software", tags=["software"])

SOFTWARE_DIR = "/mnt/software_share/"

EXTENSION_CATEGORIES = {
    '.exe': 'Исполняемые файлы Windows(.exe)',
    '.msi': 'Установочные пакеты Windows Installer(.msi)',
    '.bat': 'Пакетные скрипты Windows(.bat)',
    '.zip': 'Архивы',
    '.7z': 'Архивы',
    '.rar': 'Архивы',
    '.iso': 'Образы дисков',
    '.tar': 'Архивы',
    '.tar.gz': 'Архивы'
}

SUPPORTED_EXTENSIONS = set(EXTENSION_CATEGORIES.keys())

class SoftwareItem(BaseModel):
    title: str
    product_name: str
    version: str
    architecture: str
    is_signed: str
    description: str
    filePath: str
    category: Optional[str] = None
    created_at: str
    downloads_count: int
    file_size: int

class SoftwareCategory(BaseModel):
    name: str
    count: int

class SoftwareStats(BaseModel):
    total_software: int
    total_downloads: int
    top_categories: List[dict]

@router.get("/", response_model=dict)
async def get_software(
    category: Optional[str] = None,
    search: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    try:
        software_list = []

        for root, dirs, files in os.walk(SOFTWARE_DIR):
            for file in files:
                if not file.endswith('.json'):
                    continue

                json_path = os.path.join(root, file)
                try:
                    with open(json_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        software_list.append(SoftwareItem(**data))
                except Exception as e:
                    logger.warning(f"Skipping invalid JSON file: {json_path} - {e}")
                    continue

        if category and category != 'all':
            software_list = [s for s in software_list if s.category == category]

        if search:
            search_lower = search.lower()
            software_list = [
                s for s in software_list
                if search_lower in s.title.lower() or search_lower in s.description.lower()
            ]

        categories = {}
        for s in software_list:
            if s.category:
                categories[s.category] = categories.get(s.category, 0) + 1
        categories_list = [SoftwareCategory(name=name, count=count) for name, count in categories.items()]
        
        return {"software": software_list, "categories": categories_list}

    except Exception as e:
        logger.exception("Error in get_software")
        raise HTTPException(status_code=500, detail=f"Failed to load software list: {str(e)}")

@router.get("/stats", response_model=SoftwareStats)
async def get_software_stats(current_user: Dict[str, Any] = Depends(get_current_user)):
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
    title: str = Form(...),
    product_name: str = Form(""),
    version: str = Form(""),
    description: str = Form(...),
    category: Optional[str] = Form(None),
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    if not current_user.get("isAdmin", False):
        raise HTTPException(status_code=403, detail="Access denied: Admins only")
    
    try:
        if not file.filename:
            raise HTTPException(status_code=400, detail="File must have a name")

        ext = file.filename.split('.')[-1].lower()
        allowed_exts = {'exe', 'msi', 'zip', '7z', 'iso', 'bat'}
        if ext not in allowed_exts:
            raise HTTPException(status_code=400, detail=f"File type .{ext} is not allowed")

        safe_title = "".join(c if c.isalnum() or c in "._-" else "_" for c in title)
        filename = f"{safe_title}.{ext}"
        full_file_path = os.path.join(SOFTWARE_DIR, filename)

        content = await file.read()

        if len(content) == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")
        with open(full_file_path, "wb") as f:
            f.write(content)

        software = SoftwareItem(
            title=title,
            product_name=product_name,
            version=version,
            architecture="",
            is_signed="",
            description=description,
            filePath=filename,
            category=category or "Разное",
            created_at=datetime.utcnow().isoformat(),
            downloads_count=0,
            file_size=len(content)
        )
        metadata_path = os.path.join(SOFTWARE_DIR, f"{safe_title}.json")
        with open(metadata_path, "w", encoding="utf-8") as f:
            json.dump(software.dict(), f, ensure_ascii=False, indent=2)

        return {"status": "Software uploaded successfully", "filename": filename}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload software: {str(e)}")

@router.get("/download/{file_path:path}")
async def download_software(file_path: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    if ".." in file_path or file_path.startswith("/") or file_path.startswith("\\"):
        raise HTTPException(status_code=400, detail="Invalid file path")

    full_file_path = os.path.join(SOFTWARE_DIR, file_path)
    full_file_path = os.path.normpath(full_file_path)

    if not full_file_path.startswith(os.path.abspath(SOFTWARE_DIR)):
        raise HTTPException(status_code=403, detail="Access denied")

    _, ext = os.path.splitext(full_file_path)
    if ext.lower() not in {'.exe', '.msi', '.zip', '.7z', '.iso', '.bat'}:
        raise HTTPException(status_code=400, detail="Unsupported file type")

    if not os.path.isfile(full_file_path):
        raise HTTPException(status_code=404, detail="File not found")

    metadata_path = os.path.splitext(full_file_path)[0] + ".json"
    if not os.path.exists(metadata_path):
        raise HTTPException(status_code=404, detail="Software metadata not found")

    with open(metadata_path, 'r', encoding='utf-8') as f:
        metadata = json.load(f)

    metadata["downloads_count"] += 1
    with open(metadata_path, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    return FileResponse(full_file_path, filename=os.path.basename(full_file_path))

def clean_software_name(raw_name: str) -> str:
    name = re.sub(r'[-_.]', ' ', raw_name)
    
    patterns = [
        r'\b(v|version|ver)\s*\d+(\.\d+)*',
        r'\b\d+(\.\d+)*\s*(x64|x86|win32|win64)?',
        r'\b(repack|final|portable|setup|installer|by\s+\w+|crack|patched|official)\b',
        r'\(.*?\)',
        r'\[.*?\]',
        r'\b\d{4}\b',
    ]
    
    for pattern in patterns:
        name = re.sub(pattern, '', name, flags=re.IGNORECASE)

    name = re.sub(r'\s+', ' ', name).strip()
    if not name:
        name = raw_name
    
    return name

def get_description_from_hf(title: str) -> str:
    clean_title = clean_software_name(title)
    
    headers = {
        "Authorization": f"Bearer {HF_TOKEN}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "Qwen/Qwen3-Coder-30B-A3B-Instruct:nebius",
        "messages": [
            {
                "role": "user",
                "content": f"Кратко опиши программу \"{clean_title}\" одним предложением на русском языке."
            }
        ],
        "max_tokens": 60,
        "temperature": 0.3,
        "stop": ["\n", "."]
    }

    try:
        response = requests.post(
            HF_CHAT_API_URL,
            headers=headers,
            json=payload,
            timeout=10
        )
        response.raise_for_status()
        data = response.json()

        if "choices" in data and len(data["choices"]) > 0:
            message = data["choices"][0].get("message", {})
            desc = message.get("content", "").strip()
            
            if desc:
                desc = desc.split(".")[0].strip()
                if 10 < len(desc) < 200:
                    return desc + "."
                    
    except Exception as e:
        logger.warning(f"Hugging Face Chat API error for '{clean_title}': {e}")
    
    return f"Программа: {clean_title}"

def get_product_info(exe_path):
    pe = pefile.PE(exe_path)
    try:
        file_info = pe.FileInfo[0][0].StringTable[0].entries
        product_name = file_info.get(b'ProductName', b'').decode()
        product_version = file_info.get(b'ProductVersion', b'').decode()
        return product_name, product_version
    except Exception:
        return None, None

def get_architecture(pe: pefile.PE) -> str:
    if pe.FILE_HEADER.Machine == pefile.MACHINE_TYPE['IMAGE_FILE_MACHINE_I386']:
        return "x86"
    elif pe.FILE_HEADER.Machine == pefile.MACHINE_TYPE['IMAGE_FILE_MACHINE_AMD64']:
        return "x64"
    elif pe.FILE_HEADER.Machine == pefile.MACHINE_TYPE['IMAGE_FILE_MACHINE_ARM']:
        return "ARM"
    elif pe.FILE_HEADER.Machine == pefile.MACHINE_TYPE['IMAGE_FILE_MACHINE_ARM64']:
        return "ARM64"
    else:
        return "Unknown"

def is_signed_file(pe: pefile.PE) -> bool:
    security_dir = pe.OPTIONAL_HEADER.DATA_DIRECTORY[pefile.DIRECTORY_ENTRY['IMAGE_DIRECTORY_ENTRY_SECURITY']]
    
    return security_dir.VirtualAddress != 0 and security_dir.Size > 0


@router.post("/sync")
async def sync_software(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    if not current_user.get("isAdmin", False):
        raise HTTPException(status_code=403, detail="Access denied: Admins only")

    try:
        created = 0
        skipped = 0

        for root, dirs, files in os.walk(SOFTWARE_DIR):
            for filename in files:
                name, ext = os.path.splitext(filename)
                ext_lower = ext.lower()

                if ext_lower not in SUPPORTED_EXTENSIONS:
                    continue

                file_path_full = os.path.join(root, filename)
                json_path = os.path.join(root, f"{name}.json")

                if os.path.exists(json_path):
                    skipped += 1
                    continue

                try:
                    file_size = os.path.getsize(file_path_full)
                except OSError:
                    file_size = 0

                category = EXTENSION_CATEGORIES.get(ext_lower, "Разное")

                product = version = architecture = is_signed = None
                if ext_lower in ('.exe', '.dll'):
                    try:
                        pe = pefile.PE(file_path_full)
                        product, version = get_product_info(file_path_full)
                        architecture = get_architecture(pe)
                        is_signed = is_signed_file(pe)
                    except Exception as pe_err:
                        logger.warning(f"Failed to parse PE file {file_path_full}: {pe_err}")

                rel_file_path = os.path.relpath(file_path_full, SOFTWARE_DIR).replace("\\", "/")

                manifest = {
                    "title": name,
                    "product_name": product or '',
                    "version": version or '',
                    "architecture": architecture or '',
                    "is_signed": str(is_signed) if is_signed is not None else '',
                    "description": get_description_from_hf(name),
                    "filePath": rel_file_path,
                    "category": category,
                    "created_at": datetime.fromtimestamp(
                        os.path.getmtime(file_path_full)
                    ).isoformat(),
                    "downloads_count": 0,
                    "file_size": file_size
                }

                with open(json_path, "w", encoding="utf-8") as f:
                    json.dump(manifest, f, ensure_ascii=False, indent=2)

                created += 1

        return {
            "status": "success",
            "created": created,
            "skipped": skipped,
            "message": f"Создано {created} JSON-манифестов, пропущено {skipped}"
        }

    except Exception as e:
        logger.exception("Sync failed")
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")

@router.get("/download-folder/{folder_path:path}")
async def download_folder(folder_path: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    if ".." in folder_path:
        raise HTTPException(status_code=400, detail="Invalid folder path")

    full_folder_path = os.path.join(SOFTWARE_DIR, folder_path)
    
    if not os.path.isdir(full_folder_path):
        raise HTTPException(status_code=404, detail="Folder not found")

    total_size = 0
    for dirpath, dirnames, filenames in os.walk(full_folder_path):
        for filename in filenames:
            file_path = os.path.join(dirpath, filename)
            total_size += os.path.getsize(file_path)

    temp_zip = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')
    
    try:
        with zipfile.ZipFile(temp_zip.name, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for root, dirs, files in os.walk(full_folder_path):
                for file in files:
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, full_folder_path)
                    zipf.write(file_path, arcname)
        
        def iterfile():
            with open(temp_zip.name, 'rb') as f:
                yield from f
            os.unlink(temp_zip.name)

        folder_name = os.path.basename(folder_path) or "software"
        headers = {
            'Content-Disposition': f'attachment; filename="{folder_name}.zip"'
        }
        
        return StreamingResponse(
            iterfile(),
            media_type='application/zip',
            headers=headers
        )
        
    except Exception as e:
        if os.path.exists(temp_zip.name):
            os.unlink(temp_zip.name)
        raise HTTPException(status_code=500, detail=f"Failed to create archive: {str(e)}")

@router.get("/folder-size/{folder_path:path}")
async def get_folder_size(folder_path: str, current_user: Dict[str, Any] = Depends(get_current_user)):
    if ".." in folder_path:
        raise HTTPException(status_code=400, detail="Invalid folder path")

    full_folder_path = os.path.join(SOFTWARE_DIR, folder_path)
    
    if not os.path.isdir(full_folder_path):
        raise HTTPException(status_code=404, detail="Folder not found")

    total_size = 0
    file_count = 0
    
    for dirpath, dirnames, filenames in os.walk(full_folder_path):
        for filename in filenames:
            file_path = os.path.join(dirpath, filename)
            total_size += os.path.getsize(file_path)
            file_count += 1

    return {
        "folder_path": folder_path,
        "folder_name": os.path.basename(folder_path) or "root",
        "total_size": total_size,
        "file_count": file_count
    }