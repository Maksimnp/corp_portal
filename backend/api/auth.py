from fastapi import APIRouter, HTTPException, Request, Body, status, Depends, BackgroundTasks
from pydantic import BaseModel, field_validator, EmailStr
import logging
from datetime import datetime, timedelta
import uuid
from typing import Optional
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
import json
from pathlib import Path

from services.jwt_utils import create_access_token, verify_token
from services.ad_auth import authenticate_user, get_user_role, get_user_details, change_user_password, find_user_by_email
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.security import OAuth2PasswordBearer

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

router = APIRouter()
security = HTTPBearer()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

TOKENS_FILE = Path("reset_tokens.json")

def load_tokens():
    try:
        if TOKENS_FILE.exists():
            with open(TOKENS_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                for token, token_data in data.items():
                    if 'expires' in token_data:
                        data[token]['expires'] = datetime.fromisoformat(token_data['expires'])
                return data
        return {}
    except Exception as e:
        logger.error(f"Error loading tokens from file: {str(e)}")
        return {}

def save_tokens():
    try:
        tokens_to_save = {}
        for token, token_data in reset_tokens_store.items():
            tokens_to_save[token] = token_data.copy()
            if 'expires' in tokens_to_save[token]:
                tokens_to_save[token]['expires'] = tokens_to_save[token]['expires'].isoformat()
        
        with open(TOKENS_FILE, 'w', encoding='utf-8') as f:
            json.dump(tokens_to_save, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"Error saving tokens to file: {str(e)}")

reset_tokens_store = load_tokens()
logger.info(f"Loaded {len(reset_tokens_store)} reset tokens from storage")

class EmailService:
    def __init__(self):
        self.smtp_host = os.getenv('SMTP_HOST', 'smail1.hoster.by')
        self.smtp_port = int(os.getenv('SMTP_PORT', 465))
        self.smtp_user = os.getenv('SMTP_USER', 'portal@minskhleb.by')
        self.smtp_password = os.getenv('SMTP_PASSWORD')
        
    async def send_password_reset_email(self, email: str, reset_token: str) -> bool:
        try:
            frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
            reset_link = f"{frontend_url}/reset-password?token={reset_token}"
            
            message = MIMEMultipart("alternative")
            message["Subject"] = "Восстановление пароля - Корпоративный портал Минскхлебпром"
            message["From"] = f"portal@minskhleb.by"
            message["To"] = email
            message["Reply-To"] = self.smtp_user
            
            html_content = self._generate_password_reset_template(reset_link)
            
            message.attach(MIMEText(html_content, "html"))
            
            text_content = f"""ВОССТАНОВЛЕНИЕ ПАРОЛЯ

Здравствуйте!

Мы получили запрос на восстановление пароля для вашей учетной записи в корпоративном портале Минскхлебпром.

Для восстановления пароля перейдите по ссылке:
{reset_link}

Ссылка действительна в течение 1 часа.

ВНИМАНИЕ: Если вы не запрашивали восстановление пароля, проигнорируйте это письмо.

---
С уважением,
Команда корпоративного портала Минскхлебпром
portal@minskhleb.by
"""
            message.attach(MIMEText(text_content, "plain"))
            
            logger.info(f"Attempting to send email to {email} from {self.smtp_user}")
            
            with smtplib.SMTP_SSL(self.smtp_host, self.smtp_port) as server:
                server.login(self.smtp_user, self.smtp_password)
                server.send_message(message)
            
            logger.info(f"Password reset email successfully sent to: {email}")
            return True
            
        except smtplib.SMTPException as e:
            logger.error(f"SMTP error sending email to {email}: {str(e)}")
            return False
        except Exception as e:
            logger.error(f"Error sending password reset email to {email}: {str(e)}")
            return False
    
    def _generate_password_reset_template(self, reset_link: str) -> str:
        return f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        
        body {{
            font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif;
            line-height: 1.6;
            color: #333333;
            background-color: #f5f5f5;
            margin: 0;
            padding: 0;
        }}
        
        .email-container {{
            max-width: 600px;
            margin: 0 auto;
            background: #ffffff;
        }}
        
        .header {{
            background: linear-gradient(135deg, #1e3c72, #2a5298);
            color: white;
            padding: 40px 30px;
            text-align: center;
        }}
        
        .logo {{
            font-size: 28px;
            font-weight: bold;
            margin-bottom: 10px;
        }}
        
        .subtitle {{
            font-size: 16px;
            opacity: 0.9;
        }}
        
        .content {{
            padding: 40px 30px;
        }}
        
        .title {{
            color: #1e3c72;
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 20px;
        }}
        
        .message {{
            color: #555555;
            margin-bottom: 20px;
            line-height: 1.6;
        }}
        
        .button-container {{
            text-align: center;
            margin: 30px 0;
        }}
        
        .reset-button {{
            display: inline-block;
            background: linear-gradient(135deg, #1e3c72, #2a5298);
            color: white;
            padding: 16px 40px;
            text-decoration: none;
            border-radius: 8px;
            font-weight: bold;
            font-size: 16px;
            transition: all 0.3s ease;
        }}
        
        .reset-button:hover {{
            background: linear-gradient(135deg, #2a5298, #1e3c72);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(42, 82, 152, 0.3);
        }}
        
        .warning {{
            background: #fff3e0;
            border-left: 4px solid #ff9800;
            padding: 16px;
            margin: 25px 0;
            border-radius: 4px;
        }}
        
        .warning strong {{
            color: #e65100;
        }}
        
        .link-box {{
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            padding: 15px;
            border-radius: 6px;
            margin: 20px 0;
            word-break: break-all;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            color: #495057;
        }}
        
        .footer {{
            background: #f8f9fa;
            padding: 30px;
            text-align: center;
            border-top: 1px solid #e9ecef;
            color: #6c757d;
            font-size: 14px;
        }}
        
        .contact {{
            margin: 15px 0;
            color: #495057;
        }}
        
        .copyright {{
            margin-top: 20px;
            font-size: 12px;
            color: #adb5bd;
        }}
        
        @media only screen and (max-width: 600px) {{
            .header {{
                padding: 30px 20px;
            }}
            
            .content {{
                padding: 30px 20px;
            }}
            
            .reset-button {{
                display: block;
                margin: 0 auto;
            }}
        }}
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <div class="logo">Минскхлебпром</div>
            <div class="subtitle">Корпоративный портал</div>
        </div>
        
        <div class="content">
            <h1 class="title">Восстановление пароля</h1>
            
            <p class="message">Здравствуйте!</p>
            
            <p class="message">Мы получили запрос на восстановление пароля для вашей учетной записи в корпоративном портале Минскхлебпром.</p>
            
            <div class="button-container">
                <a href="{reset_link}" class="reset-button">Восстановить пароль</a>
            </div>
            
            <div class="warning">
                <strong>Внимание:</strong> Если вы не запрашивали восстановление пароля, проигнорируйте это письмо.
            </div>
            
            <p class="message">Ссылка действительна в течение <strong>1 часа</strong>.</p>
            
            <p class="message">Если кнопка не работает, скопируйте и вставьте следующую ссылку в браузер:</p>
            
            <div class="link-box">
                {reset_link}
            </div>
        </div>
        
        <div class="footer">
            <p><strong>С уважением,</strong></p>
            <p class="contact">Команда корпоративного портала Минскхлебпром</p>
            <p class="contact">portal@minskhleb.by</p>
            <p class="copyright">© {datetime.now().year} Минскхлебпром. Все права защищены.</p>
        </div>
    </div>
</body>
</html>"""

email_service = EmailService()

def cleanup_expired_tokens():
    current_time = datetime.now()
    expired_tokens = [
        token for token, data in reset_tokens_store.items() 
        if current_time > data["expires"]
    ]
    for token in expired_tokens:
        del reset_tokens_store[token]
    
    if expired_tokens:
        logger.info(f"Cleaned up {len(expired_tokens)} expired reset tokens")
        save_tokens()

def add_reset_token(token: str, token_data: dict):
    reset_tokens_store[token] = token_data
    save_tokens()
    logger.info(f"Added reset token for {token_data['email']}")

def remove_reset_token(token: str):
    if token in reset_tokens_store:
        del reset_tokens_store[token]
        save_tokens()
        logger.info(f"Removed reset token: {token}")

async def get_current_user(token: str = Depends(oauth2_scheme)):
    logger.debug(f"Попытка проверки токена: {token[:10]}...")
    user = verify_token(token)
    if not user:
        logger.warning("Проверка токена не удалась или пользователь не найден")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный или истекший токен доступа",
            headers={"WWW-Authenticate": "Bearer"},
        )
    logger.debug(f"Пользователь аутентифицирован: {user.get('username', 'Unknown')}")
    return user

async def get_current_user_ws(token: str):
    logger.debug(f"Попытка проверки WebSocket токена: {token[:10]}...")
    if not token:
        logger.warning("Токен не предоставлен для WebSocket аутентификации")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Токен доступа не предоставлен",
        )

    user = verify_token(token)
    if not user:
        logger.warning("Проверка WebSocket токена не удалась или пользователь не найден")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный или истекший токен доступа",
        )
    
    logger.debug(f"WebSocket пользователь аутентифицирован: {user.get('username', 'Unknown')}")
    return user

class LoginData(BaseModel):
    username: str
    password: str

    @field_validator('username', 'password')
    @classmethod
    def not_empty(cls, v):
        if not v or v.strip() == "":
            raise ValueError('Поле не может быть пустым')
        return v.strip()

class ForgotPasswordRequest(BaseModel):
    email: str

    @field_validator('email')
    @classmethod
    def validate_email_domain(cls, v):
        if not v.endswith('@minskhleb.by'):
            raise ValueError('Только корпоративная почта @minskhleb.by разрешена')
        return v

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator('new_password')
    @classmethod
    def validate_password(cls, v):
        if len(v) < 6:
            raise ValueError('Пароль должен содержать минимум 6 символов')
        return v

@router.post("/login")
async def login(request: Request, login_data: LoginData = Body(...)):
    try:
        body = await request.json()
        logger.debug(f"Получено тело запроса: {body}")
    except Exception as e:
        logger.warning(f"Не удалось распарсить тело запроса: {e}", exc_info=True)
        body = None

    if not login_data:
        logger.warning("Данные для входа не предоставлены")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Требуются username и password в теле запроса"
        )

    username = login_data.username
    password = login_data.password

    logger.info(f"Попытка входа для пользователя: {username}")

    try:
        user_info = authenticate_user(username, password)
        if not user_info:
            logger.warning(f"Аутентификация в AD не удалась для пользователя: {username}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, 
                detail="Неверный логин или пароль"
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка аутентификации через AD: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Внутренняя ошибка сервера при аутентификации. Проверьте логи."
        )

    try:
        role = get_user_role(username)
    except Exception as e:
        logger.error(f"Ошибка получения роли пользователя {username}: {str(e)}", exc_info=True)
        role = "user"

    try:
        ad_user_info = get_user_details(username)
        if not ad_user_info:
            logger.warning(f"Не удалось получить данные пользователя {username} из AD")
            ad_user_info = {"full_name": username, "email": "", "department": ""}
    except Exception as e:
        logger.error(f"Ошибка получения данных пользователя {username} из AD: {str(e)}", exc_info=True)
        ad_user_info = {"full_name": username, "email": "", "department": ""}

    full_name = ad_user_info.get("full_name", username)
    department = ad_user_info.get("department", "")
    isAdmin = role == "admin"

    logger.info(f"Пользователь {username} успешно аутентифицирован с ролью: {role}, отдел: {department}")

    access_token = create_access_token(
        data={
            "sub": username,
            "role": role,
            "full_name": full_name,
            "department": department,
            "isAdmin": isAdmin
        }
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": role,
        "full_name": full_name,
        "department": department,
        "isAdmin": isAdmin
    }

@router.post("/forgot-password")
async def forgot_password(
    background_tasks: BackgroundTasks,
    request_data: ForgotPasswordRequest
):
    try:
        email = request_data.email.lower()
        logger.info(f"=== FORGOT PASSWORD REQUEST ===")
        logger.info(f"Поиск пользователя с email: {email}")
        
        user_info = find_user_by_email(email)
        
        if not user_info:
            logger.warning(f"Пользователь с email {email} не найден в AD")
            return {
                "message": "Если email зарегистрирован в системе, инструкции по восстановлению будут отправлены",
                "success": True
            }
        
        username = user_info['username']
        logger.info(f"Найден пользователь: {username} для email: {email}")

        reset_token = str(uuid.uuid4())
        token_expiry = datetime.now() + timedelta(hours=1)
        
        token_data = {
            "email": email,
            "username": username,
            "expires": token_expiry,
            "used": False
        }
        add_reset_token(reset_token, token_data)
        
        logger.info(f"Сгенерирован токен восстановления для {email} (пользователь: {username})")
        
        background_tasks.add_task(
            email_service.send_password_reset_email,
            email,
            reset_token
        )
        
        return {
            "message": "Если email зарегистрирован в системе, инструкции по восстановлению будут отправлены",
            "success": True
        }
        
    except Exception as e:
        logger.error(f"Error in forgot-password for {request_data.email}: {str(e)}", exc_info=True)
        return {
            "message": "Если email зарегистрирован в системе, инструкции по восстановлению будут отправлены",
            "success": True
        }

@router.post("/reset-password")
async def reset_password(reset_data: ResetPasswordRequest):
    try:
        token = reset_data.token
        new_password = reset_data.new_password
        
        token_data = reset_tokens_store.get(token)
        
        if not token_data:
            logger.warning(f"Invalid reset token used: {token}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Недействительный или истекший токен сброса"
            )
        
        if token_data["used"]:
            logger.warning(f"Already used reset token: {token}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Токен сброса уже был использован"
            )
        
        if datetime.now() > token_data["expires"]:
            logger.warning(f"Expired reset token: {token}")
            remove_reset_token(token)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Срок действия токена истек"
            )
        
        username = token_data["username"]
        email = token_data["email"]
        
        logger.info(f"Попытка сброса пароля для пользователя: {username} ({email})")
        
        try:
            success = change_user_password(username, new_password)
            
            if not success:
                logger.error(f"Failed to change password for user {username}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Ошибка при изменении пароля. Обратитесь к администратору."
                )
            
            token_data["used"] = True
            reset_tokens_store[token] = token_data
            save_tokens()
            
            logger.info(f"Password successfully reset for user {username}")
            
            return {
                "message": "Пароль успешно изменен",
                "success": True
            }
            
        except Exception as e:
            logger.error(f"Error changing password for {username}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Ошибка при изменении пароля в системе"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in reset-password: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Внутренняя ошибка сервера"
        )

@router.get("/validate-reset-token/{token}")
async def validate_reset_token(token: str):
    try:
        cleanup_expired_tokens()
        
        token_data = reset_tokens_store.get(token)
        
        if not token_data:
            logger.warning(f"Token not found: {token}")
            return {"valid": False, "message": "Токен не найден"}
        
        if token_data["used"]:
            logger.warning(f"Token already used: {token}")
            return {"valid": False, "message": "Токен уже использован"}
        
        if datetime.now() > token_data["expires"]:
            logger.warning(f"Token expired: {token}")
            remove_reset_token(token)
            return {"valid": False, "message": "Срок действия токена истек"}
        
        logger.info(f"Token valid: {token} for {token_data['email']}")
        return {
            "valid": True, 
            "message": "Токен действителен",
            "email": token_data["email"]
        }
        
    except Exception as e:
        logger.error(f"Error validating reset token: {str(e)}")
        return {"valid": False, "message": "Ошибка проверки токена"}

@router.get("/debug-tokens")
async def debug_tokens():
    cleanup_expired_tokens()
    
    tokens_info = {}
    for token, data in reset_tokens_store.items():
        tokens_info[token] = {
            "email": data["email"],
            "username": data["username"],
            "expires": data["expires"].isoformat(),
            "used": data["used"],
            "valid": datetime.now() <= data["expires"] and not data["used"]
        }
    
    return {
        "total_tokens": len(reset_tokens_store),
        "tokens": tokens_info
    }
@router.get("/user-details")
async def get_extended_user_details(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        user_data = verify_token(credentials.credentials)
        if not user_data:
            logger.warning(f"Недействительный или истёкший токен: {credentials.credentials[:10]}...")
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный или истёкший токен")
        
        username = user_data.get("username")
        if not username:
            logger.warning("Токен не содержит имени пользователя")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Недействительный токен: имя пользователя не найдено")

        # Получаем расширенную информацию из Active Directory
        ad_user_info = get_user_details(username)
        if not ad_user_info:
            logger.warning(f"Не удалось получить информацию о пользователе {username} из AD")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Информация о пользователе не найдена в Active Directory"
            )

        # Форматируем ответ с полной информацией
        user_info = {
            "username": username,
            "full_name": ad_user_info.get("full_name", username),
            "display_name": ad_user_info.get("display_name", ""),
            "job_title": ad_user_info.get("title", ""),
            "department": ad_user_info.get("department", ""),
            "company": ad_user_info.get("company", ""),
            "office": ad_user_info.get("physical_delivery_office_name", ""),
            "telephone_number": ad_user_info.get("telephone_number", ""),
            "mobile": ad_user_info.get("mobile", ""),
            "mail": ad_user_info.get("mail", ""),
            "manager": ad_user_info.get("manager", ""),
            "distinguished_name": ad_user_info.get("distinguished_name", ""),
            "when_created": ad_user_info.get("when_created", ""),
            "when_changed": ad_user_info.get("when_changed", ""),
            "role": user_data.get("role", "user"),
            "is_admin": user_data.get("isAdmin", False)
        }

        logger.info(f"Расширенная информация о пользователе получена для {username}")
        return user_info
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка получения расширенной информации о пользователе: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail=f"Ошибка получения информации из Active Directory: {str(e)}"
        )
@router.get("/me")
async def get_user_info(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        user_data = verify_token(credentials.credentials)
        if not user_data:
            logger.warning(f"Недействительный или истёкший токен: {credentials.credentials[:10]}...")
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный или истёкший токен")
        
        user_info = {
            "username": user_data.get("username"),
            "full_name": user_data.get("full_name", user_data.get("username")),
            "role": user_data.get("role", "user"),
            "isAdmin": user_data.get("isAdmin", False),
            "department": user_data.get("department", "")
        }
        logger.info(f"Информация о пользователе получена для {user_info['username']}")
        return user_info
    except Exception as e:
        logger.error(f"Ошибка в /auth/me: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка сервера: {str(e)}")

@router.get("/user-departments")
async def get_user_departments(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        user_data = verify_token(credentials.credentials)
        if not user_data:
            logger.warning("Недействительный или истёкший токен в /user-departments")
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный или истёкший токен")

        current_username = user_data.get("username")
        if not current_username:
            logger.warning("Токен не содержит имени пользователя")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Недействительный токен: имя пользователя не найдено")

        ad_user_info = get_user_details(current_username)
        if not ad_user_info:
            logger.warning(f"Не удалось получить информацию о пользователе {current_username} из AD")
            departments = []
        else:
            main_department = ad_user_info.get("department", "").strip()
            departments = [main_department] if main_department else []

        logger.info(f"Отделы получены для пользователя {current_username}: {departments}")
        return {"departments": departments}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка получения отделов для пользователя {current_username}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Ошибка получения отделов: {str(e)}")