# services/notification_service.py
import logging
from typing import Dict, List
from api.websocket_manager import websocket_manager

logger = logging.getLogger(__name__)

class NotificationService:
    def __init__(self):
        self.user_notifications: Dict[str, List[Dict]] = {}
    
    async def send_service_notification(self, username: str, service_id: str, notification_data: Dict):
        """Отправляет уведомление для конкретного сервиса если он включен у пользователя"""
        try:
            await websocket_manager.send_notification(username, {
                "type": "service_notification",
                "service_id": service_id,
                "data": notification_data,
                "timestamp": ...  
            })
        except Exception as e:
            logger.error(f"Error sending service notification to {username}: {str(e)}")

notification_service = NotificationService()