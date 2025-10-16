# test_viewer_simple.py
import asyncio
import websockets
import json
import requests
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("TestViewer")

async def test_create_session():
    """Тестовый viewer для создания сессии"""
    
    # 1. Получаем JWT токен
    auth_url = "http://192.1.66.117:8000/auth/login"
    auth_data = {
        "username": "mnp",
        "password": "Season24"
    }
    
    try:
        response = requests.post(auth_url, json=auth_data)
        if response.status_code != 200:
            logger.error(f"❌ Auth failed: {response.status_code}")
            return
            
        token = response.json().get("access_token")
        if not token:
            logger.error("❌ No token received")
            return
            
        logger.info("✅ Got JWT token")
        
        # 2. Получаем список ПК
        headers = {"Authorization": f"Bearer {token}"}
        pcs_response = requests.get("http://192.1.66.117:8000/api/remote/pcs", headers=headers)
        pcs_data = pcs_response.json()
        
        logger.info(f"📊 PCs available: {pcs_data}")
        
        if not pcs_data.get('pcs'):
            logger.error("❌ No PCs available")
            return
            
        target_pc = pcs_data['pcs'][0]
        target_pc_id = target_pc['pc_id']
        logger.info(f"🎯 Target PC: {target_pc_id} (status: {target_pc['status']})")
        
        # 3. Подключаемся как viewer и создаем сессию
        ws_url = f"ws://192.1.66.117:8000/api/remote/viewer?token={token}"
        
        async with websockets.connect(ws_url) as websocket:
            logger.info("✅ Connected as viewer")
            
            # Создаем сессию
            create_msg = {
                "type": "create_session",
                "target_pc_id": target_pc_id,
                "session_type": "view"
            }
            
            logger.info(f"📤 Sending: {create_msg}")
            await websocket.send(json.dumps(create_msg))
            
            # Ждем ответ
            response = await websocket.recv()
            data = json.loads(response)
            logger.info(f"📥 Received: {data}")
            
            if data.get('type') == 'session_created':
                session_id = data['session_id']
                logger.info(f"🎉 Session created successfully: {session_id}")
                
                # Ждем подтверждение от хоста
                response = await websocket.recv()
                data = json.loads(response)
                logger.info(f"📥 Host response: {data}")
                
                if data.get('type') == 'session_accepted':
                    logger.info("✅ Session accepted by host!")
                    
                    # Теперь ждем данные экрана
                    logger.info("👀 Waiting for screen data...")
                    try:
                        while True:
                            message = await asyncio.wait_for(websocket.recv(), timeout=10.0)
                            data = json.loads(message)
                            logger.info(f"📥 Message: {data.get('type')}")
                            
                            if data.get('type') == 'screen_data':
                                logger.info(f"🖥️ SCREEN DATA RECEIVED! Frame: {data['data'].get('frame_number', 'unknown')}")
                                break  # Получили данные - выходим
                                
                    except asyncio.TimeoutError:
                        logger.warning("⏰ Timeout waiting for screen data")
                        
            else:
                logger.error(f"❌ Failed to create session: {data}")
                
    except Exception as e:
        logger.error(f"💥 Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_create_session())