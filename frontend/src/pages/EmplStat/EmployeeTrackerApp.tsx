import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../AuthContext';
import { useNavigate } from 'react-router-dom'; // Assuming you're using React Router for navigation

// TypeScript interfaces
interface Employee {
    id: string;
    fio: string;
    organization: string;
    department: string;
    position: string;
    phone: string;
    state: string;
    date_hired: string;
    date_fired: string;
    changes?: string[];
    status_class: 'new' | 'moved' | 'fired' | 'existing';
    is_new: boolean;
}

interface InitialInfo {
    count: number;
    creation_date: string;
    last_update_date: string;
    file_path: string;
    auto_update_path: string;
    auto_update_enabled: boolean;
}

interface Stats {
    total: number;
    new: number;
    moved: number;
    fired: number;
    existing: number;
}

interface LastResultsResponse {
    results: Employee[];
    stats: Stats;
    comparison_date: string;
}

interface UploadResponse {
    message: string;
    initial_info: InitialInfo | null;
    detail?: string; // Added for error handling
}

interface ComparisonResponse {
    results: Employee[];
    stats: Stats;
    initial_updated: boolean;
    comparison_date: string;
    detail?: string; // Added for error handling
}

interface AutoUpdateResponse {
    message: string;
    detail?: string; // Added for error handling
}

const API_BASE_URL = 'http://192.1.66.117:8000'; // Update to match your FastAPI backend port

const EmployeeTrackerApp: React.FC = () => {
    // Component states
    const [initialInfo, setInitialInfo] = useState<InitialInfo | null>(null);
    const [allResults, setAllResults] = useState<Employee[]>([]);
    const [currentStats, setCurrentStats] = useState<Stats>({
        total: 0,
        new: 0,
        moved: 0,
        fired: 0,
        existing: 0
    });
    const { token } = useAuth();
    const [currentComparisonDate, setCurrentComparisonDate] = useState<string>("");
    const [currentFilter, setCurrentFilter] = useState<string>("all");
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [initialMessage, setInitialMessage] = useState<string>("");
    const [updateMessage, setUpdateMessage] = useState<string>("");
    const [manualAutoUpdateMessage, setManualAutoUpdateMessage] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string>("");
    const resultsPerPage = 50;
    const navigate = useNavigate(); // For navigation

    const authHeaders = (isJson: boolean = true) => {
        const headers: Record<string, string> = {
            Authorization: `Bearer ${token}`,
        };
        if (isJson) {
            headers['Content-Type'] = 'application/json';
        }
        return headers;
    };

    // Load last results on start
    const loadLastResultsOnStart = async () => {
        try {
            setLoading(true);
            const response = await fetch(`${API_BASE_URL}/emp/get-last-results`, {
                headers: authHeaders(),
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data: LastResultsResponse = await response.json();
            setAllResults(data.results || []);
            setCurrentStats(data.stats || {
                total: 0,
                new: 0,
                moved: 0,
                fired: 0,
                existing: 0
            });
            setCurrentComparisonDate(data.comparison_date || "неизвестно");
            updateResultsCount(data.results?.length || 0);
        } catch (error: any) {
            console.error('Ошибка загрузки последних результатов:', error);
            setError(`Ошибка загрузки последних результатов: ${error.message || 'Неизвестная ошибка'}`);
        } finally {
            setLoading(false);
        }
    };

    // Update initial info
    const updateInitialInfo = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/emp/initial-info`, {
                headers: authHeaders(),
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data: InitialInfo = await response.json();
            setInitialInfo(data || null);
        } catch (error: any) {
            console.error('Ошибка получения информации:', error);
            setError(`Ошибка получения информации о базовом файле: ${error.message || 'Неизвестная ошибка'}`);
        }
    };

    // Handle initial file upload
    const handleInitialFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setInitialMessage("Загрузка...");
        
        const formData = new FormData(e.currentTarget);
        
        try {
            const response = await fetch(`${API_BASE_URL}/emp/upload-initial`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData
            });
            
            const data: UploadResponse = await response.json();
            
            if (response.ok) {
                setInitialMessage(`✅ ${data.message}`);
                setInitialInfo(data.initial_info || null);
                await loadLastResultsOnStart();
            } else {
                setInitialMessage(`❌ ${data.detail || 'Ошибка загрузки'}`);
                showError(data.detail || 'Ошибка загрузки');
            }
        } catch (error: any) {
            setInitialMessage("❌ Ошибка соединения");
            showError(`Ошибка соединения: ${error.message || 'Неизвестная ошибка'}`);
        }
    };

    // Handle comparison
    const handleCompareFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setUpdateMessage("");
        
        const formData = new FormData(e.currentTarget);
        
        try {
            const response = await fetch(`${API_BASE_URL}/emp/compare`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData
            });
            
            const data: ComparisonResponse = await response.json();
            
            if (response.ok) {
                setAllResults(data.results || []);
                setCurrentStats(data.stats || {
                    total: 0,
                    new: 0,
                    moved: 0,
                    fired: 0,
                    existing: 0
                });
                setCurrentComparisonDate(data.comparison_date || "неизвестно");
                setCurrentFilter("all");
                
                if (data.initial_updated) {
                    setUpdateMessage("✅ Основной файл успешно обновлен");
                    await updateInitialInfo();
                }
            } else {
                setUpdateMessage(`❌ ${data.detail || 'Ошибка сравнения'}`);
                showError(data.detail || 'Ошибка сравнения');
            }
        } catch (error: any) {
            setUpdateMessage("❌ Ошибка соединения");
            showError(`Ошибка соединения: ${error.message || 'Неизвестная ошибка'}`);
        }
    };

    // Handle manual auto-update
    const handleManualAutoUpdate = async () => {
        if (!initialInfo) return;
        
        setManualAutoUpdateMessage("Выполнение обновления...");
        
        try {
            const response = await fetch(`${API_BASE_URL}/emp/manual-auto-update`, {
                method: 'POST',
                headers: authHeaders(),
            });
            
            const data: AutoUpdateResponse = await response.json();
            
            if (response.ok) {
                setManualAutoUpdateMessage(`✅ ${data.message}`);
                await loadLastResultsOnStart();
                await updateInitialInfo();
            } else {
                setManualAutoUpdateMessage(`❌ ${data.detail || 'Ошибка обновления'}`);
                showError(data.detail || 'Ошибка обновления');
            }
        } catch (error: any) {
            setManualAutoUpdateMessage("❌ Ошибка соединения");
            showError(`Ошибка при выполнении автообновления: ${error.message || 'Неизвестная ошибка'}`);
        }
    };

    // Filter results
    const filterResults = (status: string) => {
        setCurrentFilter(status);
        setCurrentPage(1);
        
        const filterStatusElement = document.getElementById('filterStatus');
        const currentStatusTextElement = document.getElementById('current-status-text');
        
        if (status !== 'all' && filterStatusElement && currentStatusTextElement) {
            filterStatusElement.style.display = 'flex';
            let statusText = '';
            switch(status) {
                case 'new': statusText = 'Новые сотрудники'; break;
                case 'moved': statusText = 'Измененные записи'; break;
                case 'fired': statusText = 'Уволенные сотрудники'; break;
                case 'existing': statusText = 'Работающие сотрудники'; break;
                default: statusText = 'Все записи';
            }
            currentStatusTextElement.textContent = statusText;
        } else if (filterStatusElement) {
            filterStatusElement.style.display = 'none';
        }
    };

    // Truncate text with line breaks at 15 characters
    const truncateText = (text: string, maxLength: number = 15): string[] => {
        if (!text) return ['-'];
        const lines: string[] = [];
        let remaining = text;
        
        while (remaining.length > 0) {
            if (remaining.length <= maxLength) {
                lines.push(remaining);
                break;
            } else {
                lines.push(remaining.substring(0, maxLength));
                remaining = remaining.substring(maxLength);
            }
        }
        return lines;
    };

    // Get filtered and paginated results
    const getFilteredAndPaginatedResults = useMemo(() => {
        let filteredResults = allResults;
        
        if (searchQuery) {
            filteredResults = allResults.filter(emp => 
                Object.values(emp).some(val => 
                    val && val.toString().toLowerCase().includes(searchQuery.toLowerCase())
                )
            );
        }
        
        if (currentFilter === 'new') {
            filteredResults = filteredResults.filter(r => r.is_new);
        } else if (currentFilter === 'moved') {
            filteredResults = filteredResults.filter(r => r.changes && r.changes.length > 0 && r.state !== 'Уволен');
        } else if (currentFilter === 'fired') {
            filteredResults = filteredResults.filter(r => r.state === 'Уволен');
        } else if (currentFilter === 'existing') {
            filteredResults = filteredResults.filter(r => r.state === 'Работает' && (!r.changes || r.changes.length === 0));
        }
        
        const totalResults = filteredResults.length;
        const totalPages = Math.ceil(totalResults / resultsPerPage);
        const clampedPage = Math.min(currentPage, Math.max(1, totalPages));
        
        const startIndex = (clampedPage - 1) * resultsPerPage;
        const endIndex = startIndex + resultsPerPage;
        const paginatedResults = filteredResults.slice(startIndex, endIndex);
        
        return {
            paginatedResults,
            totalResults,
            totalPages,
            currentPage: clampedPage
        };
    }, [allResults, currentFilter, searchQuery, currentPage]);

    // Update results count
    const updateResultsCount = (count: number) => {
        const resultsCountElement = document.getElementById('resultsCount');
        if (resultsCountElement) {
            resultsCountElement.textContent = `${count} записей`;
        }
    };

    // Handle search
    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value);
        setCurrentPage(1);
    };

    // Change page
    const changePage = (direction: number) => {
        const { totalPages } = getFilteredAndPaginatedResults;
        const newPage = currentPage + direction;
        if (newPage >= 1 && newPage <= totalPages) {
            setCurrentPage(newPage);
        }
    };

    // Show error
    const showError = (message: string) => {
        setError(message);
        setTimeout(() => {
            setError('');
        }, 5000);
    };

    // Clear filter
    const handleClearFilter = () => {
        setCurrentFilter("all");
        const filterStatusElement = document.getElementById('filterStatus');
        if (filterStatusElement) {
            filterStatusElement.style.display = 'none';
        }
    };

    // Effects
    useEffect(() => {
        updateInitialInfo();
        loadLastResultsOnStart();
    }, []);

    useEffect(() => {
        const { totalResults, totalPages } = getFilteredAndPaginatedResults;
        updateResultsCount(totalResults);
        
        const pageInfoElement = document.getElementById('pageInfo');
        const prevButton = document.getElementById('prevPage');
        const nextButton = document.getElementById('nextPage');
        
        if (pageInfoElement) {
            pageInfoElement.textContent = `Страница ${currentPage} из ${totalPages || 1}`;
        }
        
        if (prevButton instanceof HTMLButtonElement) {
            prevButton.disabled = currentPage === 1;
        }
        
        if (nextButton instanceof HTMLButtonElement) {
            nextButton.disabled = currentPage === totalPages || totalPages === 0;
        }
    }, [getFilteredAndPaginatedResults, currentPage]);

    const { paginatedResults, totalResults, totalPages } = getFilteredAndPaginatedResults;

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-indigo-700 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto"></div>
                    <span className="ml-3 text-white text-lg font-medium">Загрузка данных...</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-indigo-700 flex items-center justify-center">
                <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full mx-4">
                    <div className="text-red-500 text-4xl mb-4">⚠️</div>
                    <h3 className="font-bold text-xl text-gray-900 mb-2">Ошибка</h3>
                    <p className="text-gray-600 mb-4">{error}</p>
                    <button
                        onClick={() => {
                            setError('');
                            updateInitialInfo();
                            loadLastResultsOnStart();
                        }}
                        className="w-full bg-indigo-600 text-white px-4 py-3 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                    >
                        Попробовать снова
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-indigo-700 py-8">
            <div className="max-w-max mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center mb-8">
                    <button
                        onClick={() => navigate('/dashboard')} // Adjust '/dashboard' to your dashboard route
                        className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                    >
                        Вернуться на Dashboard
                    </button>
                    <div className="text-center">
                        <h1 className="text-4xl font-bold text-white mb-2">📊 Трекер изменений сотрудников</h1>
                        <p className="text-xl text-indigo-100">Мониторинг изменений в штате сотрудников</p>
                    </div>
                    <div></div> {/* Placeholder to balance the layout */}
                </div>

                {/* Initial data info */}
                <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">Информация о базовом файле</h2>
                    {initialInfo ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            <div className="flex justify-between items-center p-4 bg-indigo-50 rounded-lg border border-indigo-100">
                                <span className="font-medium text-gray-600">Статус:</span>
                                <span className="font-semibold text-green-600">Загружен</span>
                            </div>
                            <div className="flex justify-between items-center p-4 bg-indigo-50 rounded-lg border border-indigo-100">
                                <span className="font-medium text-gray-600">Записей:</span>
                                <span className="font-semibold text-gray-800">{initialInfo.count}</span>
                            </div>
                            <div className="flex justify-between items-center p-4 bg-indigo-50 rounded-lg border border-indigo-100">
                                <span className="font-medium text-gray-600">Создан:</span>
                                <span className="font-semibold text-gray-800">{initialInfo.creation_date}</span>
                            </div>
                            <div className="flex justify-between items-center p-4 bg-indigo-50 rounded-lg border border-indigo-100">
                                <span className="font-medium text-gray-600">Обновлен:</span>
                                <span className="font-semibold text-gray-800">{initialInfo.last_update_date}</span>
                            </div>
                            <div className="col-span-full flex justify-between items-center p-4 bg-indigo-50 rounded-lg border border-indigo-100">
                                <span className="font-medium text-gray-600">Автообновление:</span>
                                <span className="font-semibold text-gray-800">Каждый понедельник в 9:00</span>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-12">
                            <div className="text-6xl mb-4">📁</div>
                            <h3 className="text-2xl font-semibold text-gray-700 mb-2">Базовый файл не загружен</h3>
                            <p className="text-gray-600">Загрузите основной файл для начала работы</p>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                    {/* Upload initial file */}
                    <div className="bg-white rounded-xl shadow-lg p-6">
                        <h2 className="text-xl font-bold text-gray-900 mb-4">1. Загрузка базового файла</h2>
                        <form onSubmit={handleInitialFormSubmit} encType="multipart/form-data" className="space-y-4">
                            <div className="relative">
                                <input 
                                    type="file" 
                                    name="file" 
                                    accept=".json" 
                                    required 
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                                <label className="flex items-center justify-center p-4 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 hover:border-indigo-500 hover:bg-indigo-50 transition-all cursor-pointer text-center min-h-[60px]">
                                    Выберите JSON файл
                                </label>
                            </div>
                            <button 
                                type="submit" 
                                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transform hover:-translate-y-1 transition-all"
                            >
                                <span>💾</span>
                                Сохранить как основной
                            </button>
                        </form>
                        {initialMessage && (
                            <div className="mt-4 p-3 rounded-lg bg-gray-50 text-gray-700">
                                {initialMessage.includes('✅') ? (
                                    <span className="text-green-600 font-medium">{initialMessage}</span>
                                ) : initialMessage.includes('❌') ? (
                                    <span className="text-red-600 font-medium">{initialMessage}</span>
                                ) : (
                                    <span className="text-indigo-600 font-medium">{initialMessage}</span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Compare data */}
                    <div className="bg-white rounded-xl shadow-lg p-6">
                        <h2 className="text-xl font-bold text-gray-900 mb-4">2. Сравнение данных</h2>
                        <form onSubmit={handleCompareFormSubmit} encType="multipart/form-data" className="space-y-4">
                            <div className="relative">
                                <input 
                                    type="file" 
                                    name="file" 
                                    accept=".json" 
                                    required 
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    disabled={!initialInfo}
                                />
                                <label className={`flex items-center justify-center p-4 border-2 border-dashed rounded-lg bg-gray-50 text-center min-h-[60px] transition-all ${
                                    initialInfo 
                                        ? 'border-gray-300 hover:border-orange-500 hover:bg-orange-50 cursor-pointer' 
                                        : 'border-gray-300 bg-gray-100 cursor-not-allowed opacity-50'
                                }`}>
                                    Выберите JSON файл
                                </label>
                            </div>
                            <div className="flex items-center gap-2">
                                <input 
                                    type="checkbox" 
                                    id="updateInitial" 
                                    name="update_initial" 
                                    value="true" 
                                    disabled={!initialInfo}
                                    className={initialInfo ? '' : 'cursor-not-allowed'}
                                />
                                <label 
                                    htmlFor="updateInitial" 
                                    className={`text-sm ${
                                        initialInfo ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                                    }`}
                                >
                                    Обновить основной файл изменениями
                                </label>
                            </div>
                            <button 
                                type="submit" 
                                className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium transition-all ${
                                    initialInfo 
                                        ? 'bg-orange-500 text-white hover:bg-orange-600 transform hover:-translate-y-1' 
                                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                }`}
                                disabled={!initialInfo}
                            >
                                <span>🔍</span>
                                Сравнить с основным файлом
                            </button>
                        </form>
                        {!initialInfo && (
                            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-lg">
                                ⚠️ Сначала загрузите основной файл
                            </div>
                        )}
                    </div>

                    {/* Manual auto-update */}
                    <div className="bg-white rounded-xl shadow-lg p-6">
                        <h2 className="text-xl font-bold text-gray-900 mb-4">3. Ручное обновление</h2>
                        <p className="text-gray-600 mb-4">Запустите обновление вручную</p>
                        <button 
                            onClick={handleManualAutoUpdate} 
                            className={`w-full flex items-center justify-center gap-2 py-3 px-4 border-2 rounded-lg font-medium transition-all ${
                                initialInfo 
                                    ? 'border-indigo-500 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700' 
                                    : 'border-gray-300 text-gray-400 bg-gray-50 cursor-not-allowed'
                            }`}
                            disabled={!initialInfo}
                        >
                            <span>🔄</span>
                            Запустить автообновление
                        </button>
                        {manualAutoUpdateMessage && (
                            <div className="mt-4 p-3 rounded-lg bg-gray-50 text-gray-700">
                                {manualAutoUpdateMessage.includes('✅') ? (
                                    <span className="text-green-600 font-medium">{manualAutoUpdateMessage}</span>
                                ) : manualAutoUpdateMessage.includes('❌') ? (
                                    <span className="text-red-600 font-medium">{manualAutoUpdateMessage}</span>
                                ) : (
                                    <span className="text-indigo-600 font-medium">{manualAutoUpdateMessage}</span>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Update message */}
                {updateMessage && (
                    <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg">
                        {updateMessage}
                    </div>
                )}

                {/* Comparison statistics */}
                {allResults.length > 0 && (
                    <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
                        <h2 className="text-2xl font-bold text-gray-900 mb-4">📈 Статистика сравнения</h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
                            <div 
                                className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border-2 border-transparent hover:border-indigo-500 hover:shadow-md cursor-pointer transition-all"
                                onClick={() => filterResults('new')}
                            >
                                <div className="text-2xl">🟢</div>
                                <div>
                                    <div className="text-xs text-gray-500">Новые</div>
                                    <div className="text-xl font-bold text-green-600">{currentStats.new || 0}</div>
                                </div>
                            </div>
                            <div 
                                className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border-2 border-transparent hover:border-indigo-500 hover:shadow-md cursor-pointer transition-all"
                                onClick={() => filterResults('moved')}
                            >
                                <div className="text-2xl">🟠</div>
                                <div>
                                    <div className="text-xs text-gray-500">Измененные</div>
                                    <div className="text-xl font-bold text-orange-600">{currentStats.moved || 0}</div>
                                </div>
                            </div>
                            <div 
                                className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border-2 border-transparent hover:border-indigo-500 hover:shadow-md cursor-pointer transition-all"
                                onClick={() => filterResults('fired')}
                            >
                                <div className="text-2xl">🔴</div>
                                <div>
                                    <div className="text-xs text-gray-500">Уволенные</div>
                                    <div className="text-xl font-bold text-red-600">{currentStats.fired || 0}</div>
                                </div>
                            </div>
                            <div 
                                className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border-2 border-transparent hover:border-indigo-500 hover:shadow-md cursor-pointer transition-all"
                                onClick={() => filterResults('existing')}
                            >
                                <div className="text-2xl">🔵</div>
                                <div>
                                    <div className="text-xs text-gray-500">Работающие</div>
                                    <div className="text-xl font-bold text-blue-600">{currentStats.existing || 0}</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border-2 border-transparent">
                                <div className="text-2xl">📊</div>
                                <div>
                                    <div className="text-xs text-gray-500">Всего</div>
                                    <div className="text-xl font-bold text-gray-800">{currentStats.total || 0}</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border-2 border-transparent">
                                <div className="text-2xl">📅</div>
                                <div>
                                    <div className="text-xs text-gray-500">Дата сравнения</div>
                                    <div className="text-xl font-bold text-gray-800">{currentComparisonDate || '-'}</div>
                                </div>
                            </div>
                        </div>
                        
                        <div id="filterStatus" className="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-200 rounded-lg" style={{display: currentFilter !== 'all' ? 'flex' : 'none'}}>
                            <div className="text-sm text-gray-700">
                                <span>Показаны записи: </span>
                                <strong id="current-status-text" className="font-medium">
                                    {currentFilter === 'new' ? 'Новые сотрудники' :
                                     currentFilter === 'moved' ? 'Измененные записи' :
                                     currentFilter === 'fired' ? 'Уволенные сотрудники' :
                                     currentFilter === 'existing' ? 'Работающие сотрудники' : 'Все записи'}
                                </strong>
                            </div>
                            <button 
                                onClick={handleClearFilter} 
                                className="py-1 px-3 border border-gray-300 rounded text-sm hover:bg-gray-100 transition-colors"
                            >
                                Сбросить фильтр
                            </button>
                        </div>
                    </div>
                )}

                {/* Comparison results */}
                <div className="bg-white rounded-xl shadow-lg p-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
                        <h2 className="text-2xl font-bold text-gray-900">Результаты сравнения</h2>
                        <div className="flex items-center justify-center gap-4 mt-6 py-3">
                            <button 
                                id="prevPage" 
                                onClick={() => changePage(-1)}
                                disabled={currentPage === 1}
                                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Предыдущая
                            </button>
                            <span id="pageInfo" className="text-sm text-gray-600">Страница {currentPage} из {totalPages || 1}</span>
                            <button 
                                id="nextPage" 
                                onClick={() => changePage(1)}
                                disabled={currentPage === totalPages || totalPages === 0}
                                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Следующая
                            </button>
                        </div>
                        <span className="text-sm text-gray-600 font-medium" id="resultsCount">0 записей</span>
                    </div>
                    
                    <div className="mb-4">
                        <input 
                            type="text" 
                            id="searchInput" 
                            className="w-full max-w-xs p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="Поиск по всем полям..."
                            value={searchQuery}
                            onChange={handleSearchChange}
                        />
                    </div>
                    
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                        <table className="min-w-full divide-y divide-gray-200 w-full max-w-none">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Статус</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ФИО</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Организация</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Подразделение</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Должность</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Дата приема</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Дата увольнения</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Телефон</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Состояние</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Изменения</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {paginatedResults.length === 0 ? (
                                    <tr>
                                        <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                                            <div className="text-6xl mb-4">📋</div>
                                            <h3 className="text-xl font-semibold text-gray-700 mb-2">Нет данных для отображения</h3>
                                            <p>Попробуйте изменить фильтр или загрузить новые данные</p>
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedResults.map(emp => {
                                        const statusClass = emp.state === 'Уволен' ? 'fired' : 
                                                           emp.is_new ? 'new' : 
                                                           emp.changes && emp.changes.length > 0 ? 'moved' : 'existing';
                                        
                                        let bgColor = 'bg-blue-50';
                                        let hoverBgColor = 'hover:bg-blue-100';
                                        if (statusClass === 'new') {
                                            bgColor = 'bg-green-50';
                                            hoverBgColor = 'hover:bg-green-100';
                                        } else if (statusClass === 'moved') {
                                            bgColor = 'bg-yellow-50';
                                            hoverBgColor = 'hover:bg-yellow-100';
                                        } else if (statusClass === 'fired') {
                                            bgColor = 'bg-red-50';
                                            hoverBgColor = 'hover:bg-red-100';
                                        }
                                        
                                        return (
                                            <tr key={emp.id} className={`${bgColor} ${hoverBgColor} transition-colors`}>
                                                <td className="px-6 py-4 whitespace-pre-wrap">
                                                    {statusClass === 'new' ? '🟢' : 
                                                     statusClass === 'moved' ? '🟠' : 
                                                     statusClass === 'fired' ? '🔴' : '🔵'}
                                                </td>
                                                <td className="px-6 py-4 whitespace-pre-wrap">
                                                    {truncateText(emp.fio).map((line, index) => (
                                                        <div key={index}>{line}</div>
                                                    ))}
                                                </td>
                                                <td className="px-6 py-4 whitespace-pre-wrap">
                                                    {truncateText(emp.organization).map((line, index) => (
                                                        <div key={index}>{line}</div>
                                                    ))}
                                                </td>
                                                <td className="px-6 py-4 whitespace-pre-wrap">
                                                    {truncateText(emp.department).map((line, index) => (
                                                        <div key={index}>{line}</div>
                                                    ))}
                                                </td>
                                                <td className="px-6 py-4 whitespace-pre-wrap">
                                                    {truncateText(emp.position).map((line, index) => (
                                                        <div key={index}>{line}</div>
                                                    ))}
                                                </td>
                                                <td className="px-6 py-4 whitespace-pre-wrap">
                                                    {truncateText(emp.date_hired).map((line, index) => (
                                                        <div key={index}>{line}</div>
                                                    ))}
                                                </td>
                                                <td className="px-6 py-4 whitespace-pre-wrap">
                                                    {truncateText(emp.date_fired).map((line, index) => (
                                                        <div key={index}>{line}</div>
                                                    ))}
                                                </td>
                                                <td className="px-6 py-4 whitespace-pre-wrap">
                                                    {truncateText(emp.phone).map((line, index) => (
                                                        <div key={index}>{line}</div>
                                                    ))}
                                                </td>
                                                <td className="px-6 py-4 whitespace-pre-wrap">
                                                    {truncateText(emp.state).map((line, index) => (
                                                        <div key={index}>{line}</div>
                                                    ))}
                                                </td>
                                                <td className="px-6 py-4 whitespace-pre-wrap">
                                                    {emp.changes ? truncateText(emp.changes.join(', ')).map((line, index) => (
                                                        <div key={index}>{line}</div>
                                                    )) : 'Нет изменений'}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                    
                    <div className="flex items-center justify-center gap-4 mt-6 py-3">
                        <button 
                            id="prevPage" 
                            onClick={() => changePage(-1)}
                            disabled={currentPage === 1}
                            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            Предыдущая
                        </button>
                        <span id="pageInfo" className="text-sm text-gray-600">Страница {currentPage} из {totalPages || 1}</span>
                        <button 
                            id="nextPage" 
                            onClick={() => changePage(1)}
                            disabled={currentPage === totalPages || totalPages === 0}
                            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            Следующая
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EmployeeTrackerApp;