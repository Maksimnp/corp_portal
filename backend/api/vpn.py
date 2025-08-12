import requests
import os
from fastapi import APIRouter, HTTPException, Response
from dotenv import load_dotenv
import logging

load_dotenv()

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

OPENVPN_HOST = os.getenv("OPENVPN_HOST", "[https://192.1.3.141](https://192.1.3.141):943")
OPENVPN_ADMIN_USERNAME = os.getenv("OPENVPN_ADMIN_USERNAME", "openvpn")
OPENVPN_ADMIN_PASSWORD = os.getenv("OPENVPN_ADMIN_PASSWORD", "openvpnsrv")

router = APIRouter(prefix="/api/vpn", tags=["vpn"])

session = requests.Session()
session.verify = False  # Enable SSL verification

def openvpn_login():
    try:
        login_url = f"{OPENVPN_HOST}/admin/"
        payload = {
            "username": OPENVPN_ADMIN_USERNAME,
            "password": OPENVPN_ADMIN_PASSWORD
        }
        logger.info(f"Попытка входа в OpenVPN AS по адресу {login_url}")
        resp = session.post(login_url, json=payload)
        logger.info(f"Получен ответ от OpenVPN AS: {resp.status_code} {resp.text}")
        if resp.status_code != 200:
            logger.error(f"Не удалось войти в OpenVPN AS: {resp.text}")
            raise HTTPException(status_code=500, detail="Не удалось войти в OpenVPN AS")
        logger.info("Успешный вход в OpenVPN AS")
    except requests.RequestException as e:
        logger.error(f"Ошибка входа в OpenVPN AS: {e}")
        raise HTTPException(status_code=500, detail="Не удалось войти в OpenVPN AS")
    except Exception as e:
        logger.error(f"Неожиданная ошибка входа в OpenVPN AS: {e}")
        raise HTTPException(status_code=500, detail="Не удалось войти в OpenVPN AS")
    
def openvpn_api_call(method: str, params: dict = None):
    try:
        url = f"{OPENVPN_HOST}/rest/{method}"
        resp = session.post(url, json=params or {})
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException as e:
        logger.error(f"API call error: {e}")
        raise HTTPException(status_code=500, detail=f"API error {method}")

# @router.on_event("startup")
# def startup_event():
    # openvpn_login()

# @router.get("/status")
# async def get_status():
#     try:
#         result = openvpn_api_call("status/users")
#         clients = [
#             {
#                 "commonName": c.get("username"),
#                 "realAddress": c.get("ip_address"),
#                 "bytesReceived": c.get("bytes_received"),
#                 "bytesSent": c.get("bytes_sent"),
#                 "connectedSince": c.get("connected_since"),
#             }
#             for c in result.get("users", [])
#         ]
#         return {"clients": clients}
#     except Exception as e:
#         logger.error(f"Error retrieving status: {e}")
#         raise HTTPException(status_code=500, detail=str(e))

# @router.post("/create-profile")
# async def create_profile(data: dict):
#     username = data.get("clientName", "").strip()
#     if not username:
#         raise HTTPException(status_code=400, detail="Client name not provided")
#     try:
#         openvpn_api_call("users/add", {"username": username})
#         openvpn_api_call("users/set_property", {"username": username, "property": "allow_web_login", "value": True})
#         profile = openvpn_api_call("users/get_profile", {"username": username})
#         ovpn_data = profile.get("profile")
#         if not ovpn_data:
#             raise HTTPException(status_code=500, detail="Profile is empty")
#         return Response(
#             content=ovpn_data,
#             media_type="application/x-openvpn-profile",
#             headers={"Content-Disposition": f"attachment; filename={username}.ovpn"},
#         )
#     except Exception as e:
#         logger.error(f"Profile creation error: {e}")
#         raise HTTPException(status_code=500, detail=str(e))
