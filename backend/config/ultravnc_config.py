# config/ultravnc_config.py
"""
Конфигурация для интеграции с UltraVNC
"""

ULTRAVNC_CONFIG = {
    "components": {
        "server": "winvnc.exe",
        "viewer": "vncviewer.exe", 
        "config": "vncconfig.exe"
    },
    "default_ports": {
        "start": 5900,
        "end": 6000
    },
    "security": {
        "password_length": 8,
        "session_timeout": 7200,
        "max_connection_attempts": 3
    },
    "features": {
        "file_transfer": True,
        "chat": True,
        "remote_control": True,
        "encryption": True
    },
    "viewer_download": {
        "package_name": "ultravnc-viewer.zip",
        "include_files": [
            "vncviewer.exe",
            "vncviewer64.exe", 
            "vncconfig.exe",
            "readme.txt"
        ]
    }
}