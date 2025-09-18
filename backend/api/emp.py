from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime
import logging
import os
import json
import shutil
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from cachetools import TTLCache
from concurrent.futures import ThreadPoolExecutor
import asyncio
from api.auth import verify_token 

logger = logging.getLogger(__name__)

# Создаем роутер
employee_tracker_router = APIRouter(tags=["employee_tracker"])

# Конфигурация директорий / файлов
INITIAL_DATA_DIR = 'initial_data'
CURRENT_DATA_DIR = 'current_data'
AUTO_UPDATE_DIR = 'auto_update'
AUTO_UPDATE_FILE_PATH = os.path.join(AUTO_UPDATE_DIR, 'current_data.json')
LAST_RESULTS_FILE = 'last_results.json'

# Создаем директории
os.makedirs(INITIAL_DATA_DIR, exist_ok=True)
os.makedirs(CURRENT_DATA_DIR, exist_ok=True)
os.makedirs(AUTO_UPDATE_DIR, exist_ok=True)

# Настройка кэша и ThreadPoolExecutor
CACHE_TTL = 300
cache = TTLCache(maxsize=1000, ttl=CACHE_TTL)
executor = ThreadPoolExecutor(max_workers=4)
security = HTTPBearer()

# Pydantic модели
class EmployeeBase(BaseModel):
    id: str
    fio: str
    organization: str
    department: str
    position: str
    phone: str
    state: str
    date_hired: str
    date_fired: str
    changes: Optional[List[str]] = None
    status_class: str
    is_new: bool

    class Config:
        from_attributes = True

class EmployeeComparisonResult(BaseModel):
    results: List[EmployeeBase]
    stats: Dict[str, int]
    initial_updated: bool
    comparison_date: str

class InitialInfoResponse(BaseModel):
    count: int
    creation_date: str
    last_update_date: str
    file_path: str
    auto_update_path: str
    auto_update_enabled: bool

class LastResultsResponse(BaseModel):
    results: List[EmployeeBase]
    stats: Dict[str, int]
    comparison_date: str

class UploadResponse(BaseModel):
    message: str
    initial_info: Optional[InitialInfoResponse] = None

class AutoUpdateResponse(BaseModel):
    message: str

# Модель для Employee (аналог dataclass)
class Employee:
    def __init__(self, **kwargs):
        self.id = kwargs.get('id', '')
        self.fio = kwargs.get('fio', '')
        self.organization = kwargs.get('organization', '')
        self.department = kwargs.get('department', '')
        self.position = kwargs.get('position', '')
        self.phone = kwargs.get('phone', '')
        self.state = kwargs.get('state', 'Работает')
        self.date_hired = kwargs.get('date_hired', '')
        self.date_fired = kwargs.get('date_fired', '')

class EmployeeTracker:
    def __init__(self):
        self.initial_file = os.path.join(INITIAL_DATA_DIR, 'initial_data.json')
        
    def generate_employee_id(self, employee_data: Dict) -> str:
        # Защита от отсутствующих полей
        fio = employee_data.get('ФИО', '')
        org = employee_data.get('Организация', '')
        date_hired = employee_data.get('ДатаПриема', '')
        position = employee_data.get('Должность', '')
        return f"{fio}_{org}_{date_hired}_{position}"
    
    def load_employees_from_json(self, file_path: str) -> List[Employee]:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            if not isinstance(data, list):
                raise Exception("Формат файла неверный: ожидается список записей")
            
            employees = []
            for item in data:
                try:
                    employee_id = self.generate_employee_id(item)
                except Exception:
                    employee_id = item.get('id', '') or ''
                employee = Employee(
                    id=employee_id,
                    fio=item.get('ФИО', ''),
                    organization=item.get('Организация', ''),
                    department=item.get('Подразделение', ''),
                    position=item.get('Должность', ''),
                    phone=item.get('Телефон', ''),
                    state=item.get('Состояние', 'Работает'),
                    date_hired=item.get('ДатаПриема', ''),
                    date_fired=item.get('ДатаУвольнения', '')
                )
                employees.append(employee)
            return employees
        except Exception as e:
            raise Exception(f"Ошибка загрузки файла: {e}")
    
    def save_employees_to_json(self, employees: List[Employee], file_path: str):
        data = []
        for emp in employees:
            data.append({
                'ФИО': emp.fio,
                'Организация': emp.organization,
                'Подразделение': emp.department,
                'Должность': emp.position,
                'Телефон': emp.phone,
                'Состояние': emp.state,
                'ДатаПриема': emp.date_hired,
                'ДатаУвольнения': emp.date_fired
            })
        
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    
    def save_initial_data(self, file_path: str):
        # Загружаем сотрудников из переданного файла и формируем initial_data.json
        employees = self.load_employees_from_json(file_path)
        
        initial_data = []
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        for emp in employees:
            initial_data.append({
                'id': emp.id,
                'ФИО': emp.fio,
                'Организация': emp.organization,
                'Подразделение': emp.department,
                'Должность': emp.position,
                'Телефон': emp.phone,
                'Состояние': emp.state,
                'ДатаПриема': emp.date_hired,
                'ДатаУвольнения': emp.date_fired,
                'дата_создания': now,
                'дата_последнего_обновления': now
            })
        
        with open(self.initial_file, 'w', encoding='utf-8') as f:
            json.dump(initial_data, f, ensure_ascii=False, indent=2)
        
        # Сохраняем резервную копию загруженного файла
        history_file = os.path.join(INITIAL_DATA_DIR, f'initial_backup_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json')
        shutil.copy2(file_path, history_file)
    
    def update_initial_data(self, current_employees: List[Employee]):
        if not self.has_initial_data():
            raise Exception("Начальные данные не найдены")
        
        with open(self.initial_file, 'r', encoding='utf-8') as f:
            initial_data = json.load(f)
        
        current_dict = {emp.id: emp for emp in current_employees}
        updated = False
        
        for item in initial_data:
            emp_id = item.get('id')
            if emp_id in current_dict:
                current_emp = current_dict[emp_id]
                if (item.get('Организация') != current_emp.organization or
                    item.get('Подразделение') != current_emp.department or
                    item.get('Должность') != current_emp.position or
                    item.get('Телефон') != current_emp.phone or
                    item.get('Состояние') != current_emp.state or
                    item.get('ДатаПриема') != current_emp.date_hired or
                    item.get('ДатаУвольнения') != current_emp.date_fired):
                    
                    item['Организация'] = current_emp.organization
                    item['Подразделение'] = current_emp.department
                    item['Должность'] = current_emp.position
                    item['Телефон'] = current_emp.phone
                    item['Состояние'] = current_emp.state
                    item['ДатаПриема'] = current_emp.date_hired
                    item['ДатаУвольнения'] = current_emp.date_fired
                    updated = True
        
        for current_emp in current_employees:
            if not any(item.get('id') == current_emp.id for item in initial_data):
                initial_data.append({
                    'id': current_emp.id,
                    'ФИО': current_emp.fio,
                    'Организация': current_emp.organization,
                    'Подразделение': current_emp.department,
                    'Должность': current_emp.position,
                    'Телефон': current_emp.phone,
                    'Состояние': current_emp.state,
                    'ДатаПриема': current_emp.date_hired,
                    'ДатаУвольнения': current_emp.date_fired,
                    'дата_добавления': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                })
                updated = True
        
        if updated:
            now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            for item in initial_data:
                item['дата_последнего_обновления'] = now
            
            backup_file = os.path.join(INITIAL_DATA_DIR, f'backup_before_update_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json')
            shutil.copy2(self.initial_file, backup_file)
            
            with open(self.initial_file, 'w', encoding='utf-8') as f:
                json.dump(initial_data, f, ensure_ascii=False, indent=2)
            
            return True
        return False
    
    def has_initial_data(self) -> bool:
        return os.path.exists(self.initial_file)
    
    def get_initial_info(self) -> Optional[Dict]:
        if not self.has_initial_data():
            return None
        
        try:
            with open(self.initial_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            if data:
                creation_date = None
                last_update_date = None
                
                for item in data:
                    if 'дата_создания' in item and not creation_date:
                        creation_date = item['дата_создания']
                    if 'дата_последнего_обновления' in item:
                        if not last_update_date or item['дата_последнего_обновления'] > last_update_date:
                            last_update_date = item['дата_последнего_обновления']
                
                return {
                    'count': len(data),
                    'creation_date': creation_date or 'неизвестно',
                    'last_update_date': last_update_date or 'неизвестно',
                    'file_path': self.initial_file,
                    'auto_update_path': AUTO_UPDATE_FILE_PATH,
                    'auto_update_enabled': True
                }
        except Exception as e:
            logger.error(f"Ошибка получения информации о начальных данных: {e}")
            pass
        return None
    
    def compare_with_initial(self, current_file_path: str, update_initial: bool = False) -> Dict:
        if not self.has_initial_data():
            raise Exception("Начальные данные не найдены. Сначала загрузите начальный файл.")
        
        initial_employees = self.load_employees_from_json(self.initial_file)
        current_employees = self.load_employees_from_json(current_file_path)
        
        current_filename = f'current_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
        current_history_path = os.path.join(CURRENT_DATA_DIR, current_filename)
        shutil.copy2(current_file_path, current_history_path)
        
        results = self._compare_employees(initial_employees, current_employees)
        
        updated = False
        if update_initial:
            updated = self.update_initial_data(current_employees)
        
        return {
            'results': results,
            'initial_updated': updated
        }
    
    def _compare_employees(self, initial_employees: List[Employee], current_employees: List[Employee]) -> List[Dict]:
        results = []
        
        initial_dict = {emp.id: emp for emp in initial_employees}
        current_dict = {emp.id: emp for emp in current_employees}
        
        for emp_id, current_emp in current_dict.items():
            if emp_id in initial_dict:
                initial_emp = initial_dict[emp_id]
                
                changes = []
                if current_emp.organization != initial_emp.organization:
                    changes.append(f"Организация: {initial_emp.organization} → {current_emp.organization}")
                if current_emp.department != initial_emp.department:
                    changes.append(f"Подразделение: {initial_emp.department} → {current_emp.department}")
                if current_emp.position != initial_emp.position:
                    changes.append(f"Должность: {initial_emp.position} → {current_emp.position}")
                if current_emp.phone != initial_emp.phone:
                    changes.append(f"Телефон: {initial_emp.phone} → {current_emp.phone}")
                if current_emp.state != initial_emp.state:
                    changes.append(f"Состояние: {initial_emp.state} → {current_emp.state}")
                if current_emp.date_hired != initial_emp.date_hired:
                    changes.append(f"Дата приема: {initial_emp.date_hired} → {current_emp.date_hired}")
                if current_emp.date_fired != initial_emp.date_fired:
                    changes.append(f"Дата увольнения: {initial_emp.date_fired} → {current_emp.date_fired}")
                
                status_class = 'existing'
                if current_emp.state == 'Уволен':
                    status_class = 'fired'
                elif changes:
                    status_class = 'moved'
                
                results.append({
                    'id': current_emp.id,
                    'fio': current_emp.fio,
                    'organization': current_emp.organization,
                    'department': current_emp.department,
                    'position': current_emp.position,
                    'phone': current_emp.phone,
                    'state': current_emp.state,
                    'date_hired': current_emp.date_hired,
                    'date_fired': current_emp.date_fired,
                    'changes': changes,
                    'status_class': status_class,
                    'is_new': False
                })
            else:
                results.append({
                    'id': current_emp.id,
                    'fio': current_emp.fio,
                    'organization': current_emp.organization,
                    'department': current_emp.department,
                    'position': current_emp.position,
                    'phone': current_emp.phone,
                    'state': current_emp.state,
                    'date_hired': current_emp.date_hired,
                    'date_fired': current_emp.date_fired,
                    'changes': ['Новый сотрудник'],
                    'status_class': 'new',
                    'is_new': True
                })
        
        for emp_id, initial_emp in initial_dict.items():
            if emp_id not in current_dict:
                results.append({
                    'id': initial_emp.id,
                    'fio': initial_emp.fio,
                    'organization': initial_emp.organization,
                    'department': initial_emp.department,
                    'position': initial_emp.position,
                    'phone': initial_emp.phone,
                    'state': 'Уволен',
                    'date_hired': initial_emp.date_hired,
                    'date_fired': initial_emp.date_fired or datetime.now().strftime('%Y-%m-%d'),
                    'changes': ['Сотрудник уволен'],
                    'status_class': 'fired',
                    'is_new': False
                })
        
        results.sort(key=lambda x: (
            x.get('organization') or "",
            0 if x.get('status_class') == 'new' else
            1 if x.get('status_class') == 'moved' else
            2 if x.get('status_class') == 'fired' else
            3
        ))
        
        return results

    def save_last_results(self, results: List[Dict], stats: Dict, comparison_date: str):
        data = {
            'results': results,
            'stats': stats,
            'comparison_date': comparison_date
        }
        with open(LAST_RESULTS_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def load_last_results(self) -> Optional[Dict]:
        if not os.path.exists(LAST_RESULTS_FILE):
            return None
        try:
            with open(LAST_RESULTS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Ошибка загрузки последних результатов: {e}")
            return None

    def auto_update_from_file(self):
        try:
            if not os.path.exists(AUTO_UPDATE_FILE_PATH):
                logger.warning(f"Файл для автоматического обновления не найден: {AUTO_UPDATE_FILE_PATH}")
                return False
                
            if not self.has_initial_data():
                logger.warning("Начальные данные не найдены для автоматического обновления")
                return False
            
            logger.info(f"Запуск автоматического обновления из {AUTO_UPDATE_FILE_PATH}")
            
            current_employees = self.load_employees_from_json(AUTO_UPDATE_FILE_PATH)
            updated = self.update_initial_data(current_employees)
            
            if updated:
                logger.info(f"Автоматическое обновление успешно завершено в {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            else:
                logger.info("Автоматическое обновление: изменений не обнаружено")
                
            return updated
        except Exception as e:
            logger.error(f"Ошибка при автоматическом обновлении: {e}")
            return False

# Создаем экземпляр трекера
tracker = EmployeeTracker()

# Зависимости
async def verify_token_dependency(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    user_data = verify_token(token)
    if not user_data:
        logger.warning(f"Недействительный или истёкший токен: {token[:10]}...")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный или истёкший токен")
    return user_data

# Вспомогательная функция — формирует results+stats из списка Employee
def build_results_and_stats_from_employees(employees: List[Employee]) -> Dict[str, Any]:
    results = []
    for emp in employees:
        results.append({
            'id': emp.id,
            'fio': emp.fio,
            'organization': emp.organization,
            'department': emp.department,
            'position': emp.position,
            'phone': emp.phone,
            'state': emp.state,
            'date_hired': emp.date_hired,
            'date_fired': emp.date_fired,
            'changes': [],
            'status_class': 'existing',
            'is_new': False
        })
    stats = {
        'total': len(results),
        'new': 0,
        'moved': 0,
        'fired': sum(1 for r in results if r['state'] == 'Уволен'),
        'existing': sum(1 for r in results if r['state'] != 'Уволен')
    }
    return {'results': results, 'stats': stats}

# Вспомогательные синхронные функции для выполнения в ThreadPoolExecutor
def upload_initial_sync(file_path: str) -> Dict:
    try:
        # Сохраняем как initial_data.json
        tracker.save_initial_data(file_path)
        initial_info = tracker.get_initial_info()

        # Подготовим last_results.json на основе только что загруженного initial файла
        employees = tracker.load_employees_from_json(tracker.initial_file)
        built = build_results_and_stats_from_employees(employees)
        comparison_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        tracker.save_last_results(built['results'], built['stats'], comparison_date)

        return {
            'message': 'Начальные данные успешно сохранены и last_results сформирован',
            'initial_info': initial_info
        }
    except Exception as e:
        logger.error(f"Ошибка при сохранении начальных данных: {e}")
        raise

def compare_sync(current_file_path: str, update_initial: bool) -> Dict:
    try:
        result = tracker.compare_with_initial(current_file_path, update_initial)
        
        stats = {
            'total': len(result['results']),
            'new': sum(1 for r in result['results'] if r['status_class'] == 'new'),
            'moved': sum(1 for r in result['results'] if r['status_class'] == 'moved'),
            'fired': sum(1 for r in result['results'] if r['status_class'] == 'fired'),
            'existing': sum(1 for r in result['results'] if r['status_class'] == 'existing')
        }
        
        comparison_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        tracker.save_last_results(result['results'], stats, comparison_date)
        
        return {
            'results': result['results'],
            'stats': stats,
            'initial_updated': result['initial_updated'],
            'comparison_date': comparison_date
        }
    except Exception as e:
        logger.error(f"Ошибка при сравнении данных: {e}")
        raise

def get_initial_info_sync() -> Optional[Dict]:
    try:
        return tracker.get_initial_info()
    except Exception as e:
        logger.error(f"Ошибка при получении информации о начальных данных: {e}")
        raise

def get_last_results_sync() -> Optional[Dict]:
    try:
        # Попытка загрузить last_results.json
        last = tracker.load_last_results()
        if last:
            return last
        
        # Если нет last_results.json, но есть initial — сформируем на его основе и сохраним
        if tracker.has_initial_data():
            employees = tracker.load_employees_from_json(tracker.initial_file)
            built = build_results_and_stats_from_employees(employees)
            comparison_date = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            tracker.save_last_results(built['results'], built['stats'], comparison_date)
            return {
                'results': built['results'],
                'stats': built['stats'],
                'comparison_date': comparison_date
            }
        # Если нет и initial, возвращаем None
        return None
    except Exception as e:
        logger.error(f"Ошибка при загрузке последних результатов: {e}")
        raise

def manual_auto_update_sync() -> bool:
    try:
        return tracker.auto_update_from_file()
    except Exception as e:
        logger.error(f"Ошибка при ручном автообновлении: {e}")
        raise

# Роуты API
@employee_tracker_router.post("/upload-initial", response_model=UploadResponse)
async def upload_initial(
    file: UploadFile = File(...),
    user_data: dict = Depends(verify_token_dependency)
):
    """Загрузка базового файла сотрудников"""
    try:
        if not file.filename.endswith('.json'):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Неверный формат файла. Требуется JSON")
        
        # Сохраняем файл временно
        file_path = f"temp_initial_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Выполняем операцию в фоновом потоке
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(executor, upload_initial_sync, file_path)
        
        # Удаляем временный файл
        try:
            os.remove(file_path)
        except Exception:
            pass
        
        logger.info(f"Базовый файл успешно загружен пользователем {user_data.get('username')}")
        return UploadResponse(**result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка при загрузке базового файла: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@employee_tracker_router.post("/compare", response_model=EmployeeComparisonResult)
async def compare(
    file: UploadFile = File(...),
    update_initial: bool = False,
    user_data: dict = Depends(verify_token_dependency)
):
    """Сравнение текущего файла с базовым"""
    try:
        if not file.filename.endswith('.json'):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Неверный формат файла. Требуется JSON")
        
        # Проверяем наличие начальных данных
        initial_info = tracker.get_initial_info()
        if not initial_info:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Начальные данные не найдены. Сначала загрузите начальный файл.")
        
        # Сохраняем файл временно
        file_path = f"temp_current_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        # Выполняем операцию в фоновом потоке
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(executor, compare_sync, file_path, update_initial)
        
        # Удаляем временный файл
        try:
            os.remove(file_path)
        except Exception:
            pass
        
        logger.info(f"Сравнение выполнено пользователем {user_data.get('username')}, update_initial={update_initial}")
        return EmployeeComparisonResult(**result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка при сравнении данных: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@employee_tracker_router.get("/initial-info", response_model=InitialInfoResponse)
async def get_initial_info(
    user_data: dict = Depends(verify_token_dependency)
):
    """Получение информации о базовом файле"""
    try:
        loop = asyncio.get_event_loop()
        initial_info = await loop.run_in_executor(executor, get_initial_info_sync)
        
        if not initial_info:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Начальные данные не найдены")
        
        logger.info(f"Информация о базовом файле запрошена пользователем {user_data.get('username')}")
        return InitialInfoResponse(**initial_info)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка при получении информации о начальных данных: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@employee_tracker_router.get("/get-last-results", response_model=LastResultsResponse)
async def get_last_results(
    user_data: dict = Depends(verify_token_dependency)
):
    """Получение последних результатов сравнения"""
    try:
        loop = asyncio.get_event_loop()
        last_results = await loop.run_in_executor(executor, get_last_results_sync)
        
        if not last_results:
            logger.info("Запрос /get-last-results: сохранённых результатов и initial_data нет")
            # Возвращаем пустую структуру с нулями
            return LastResultsResponse(results=[], stats={'total':0,'new':0,'moved':0,'fired':0,'existing':0}, comparison_date="неизвестно")
        
        logger.info(f"Последние результаты запрошены пользователем {user_data.get('username')}")
        # Валидация/нормализация: убедимся, что в stats есть все ключи
        stats = last_results.get('stats') or {}
        stats = {
            'total': stats.get('total', len(last_results.get('results', []))),
            'new': stats.get('new', 0),
            'moved': stats.get('moved', 0),
            'fired': stats.get('fired', 0),
            'existing': stats.get('existing', 0),
        }
        return LastResultsResponse(results=last_results.get('results', []), stats=stats, comparison_date=last_results.get('comparison_date', 'неизвестно'))
        
    except Exception as e:
        logger.error(f"Ошибка при получении последних результатов: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@employee_tracker_router.post("/manual-auto-update", response_model=AutoUpdateResponse)
async def manual_auto_update(
    user_data: dict = Depends(verify_token_dependency)
):
    """Ручной запуск автообновления"""
    try:
        # Проверяем наличие начальных данных
        initial_info = tracker.get_initial_info()
        if not initial_info:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Начальные данные не найдены для автоматического обновления")
        
        # Проверяем наличие файла для автообновления
        if not os.path.exists(AUTO_UPDATE_FILE_PATH):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Файл для автоматического обновления не найден: {AUTO_UPDATE_FILE_PATH}")
        
        # Выполняем операцию в фоновом потоке
        loop = asyncio.get_event_loop()
        updated = await loop.run_in_executor(executor, manual_auto_update_sync)
        
        message = "Автообновление успешно выполнено" if updated else "Автообновление: изменений не обнаружено"
        logger.info(f"Ручное автообновление выполнено пользователем {user_data.get('username')}: {message}")
        
        return AutoUpdateResponse(message=message)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ошибка при ручном автообновлении: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
