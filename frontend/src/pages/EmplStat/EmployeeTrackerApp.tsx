import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../AuthContext';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, DocumentArrowUpIcon, ArrowsRightLeftIcon, ArrowPathIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';

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
    detail?: string;
}

interface ComparisonResponse {
    results: Employee[];
    stats: Stats;
    initial_updated: boolean;
    comparison_date: string;
    detail?: string;
}

interface AutoUpdateResponse {
    message: string;
    detail?: string;
}

const API_BASE_URL = 'http://192.1.66.117:8000';

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
    const navigate = useNavigate();

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
    };

    // Truncate text with line breaks at 20 characters (увеличено для лучшего отображения)
    const truncateText = (text: string, maxLength: number = 20): string[] => {
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
    };

    // Effects
    useEffect(() => {
        updateInitialInfo();
        loadLastResultsOnStart();
    }, []);

    useEffect(() => {
        const { totalResults, totalPages } = getFilteredAndPaginatedResults;
        updateResultsCount(totalResults);
    }, [getFilteredAndPaginatedResults, currentPage]);

    const { paginatedResults, totalResults, totalPages } = getFilteredAndPaginatedResults;

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-cyan-400 mx-auto"></div>
                    <span className="ml-3 text-cyan-100 text-lg font-medium">Загрузка данных...</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
                <div className="bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-2xl p-8 max-w-md w-full mx-4 border border-white/20">
                    <div className="text-red-400 text-4xl mb-4">⚠️</div>
                    <h3 className="font-bold text-xl text-white mb-2">Ошибка</h3>
                    <p className="text-gray-300 mb-6">{error}</p>
                    <button
                        onClick={() => {
                            setError('');
                            updateInitialInfo();
                            loadLastResultsOnStart();
                        }}
                        className="w-full bg-cyan-600 text-white px-4 py-3 rounded-2xl hover:bg-cyan-700 transition-all duration-300 font-medium hover:shadow-2xl hover:-translate-y-1"
                    >
                        Попробовать снова
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 py-8 px-4">
            {/* Увеличил максимальную ширину контейнера */}
            <div className="max-w-[95rem] mx-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <button
                        onClick={() => navigate('/dashboard')}
                        className="flex items-center gap-2 bg-gray-800/80 backdrop-blur-xl text-white px-6 py-3 rounded-2xl hover:bg-gray-700/80 transition-all duration-300 border border-white/20 hover:border-cyan-600 hover:shadow-2xl hover:-translate-y-1"
                    >
                        <ArrowLeftIcon className="h-5 w-5" />
                        Вернуться на главную
                    </button>
                    <div className="text-center">
                        <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent mb-2">
                            📊 Трекер изменений сотрудников
                        </h1>
                        <p className="text-xl text-gray-300">Мониторинг изменений в штате сотрудников</p>
                    </div>
                    <div></div>
                </div>

                {/* Initial data info - сделал шире */}
                <div className="bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-2xl p-8 mb-8 border border-white/20 transition-all duration-500 hover:shadow-3xl">
                    <h2 className="text-2xl font-bold text-white mb-6">Информация о базовом файле</h2>
                    {initialInfo ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {[
                                { label: 'Статус', value: 'Загружен', color: 'text-green-400' },
                                { label: 'Записей', value: initialInfo.count.toString(), color: 'text-cyan-400' },
                                { label: 'Создан', value: initialInfo.creation_date, color: 'text-gray-300' },
                                { label: 'Обновлен', value: initialInfo.last_update_date, color: 'text-gray-300' },
                            ].map((item, index) => (
                                <div 
                                    key={index}
                                    className="flex justify-between items-center p-4 bg-gray-700/50 rounded-2xl border border-white/10 hover:border-cyan-500/50 transition-all duration-300"
                                >
                                    <span className="font-medium text-gray-400">{item.label}:</span>
                                    <span className={`font-semibold ${item.color}`}>{item.value}</span>
                                </div>
                            ))}
                            <div className="col-span-full flex justify-between items-center p-4 bg-gray-700/50 rounded-2xl border border-white/10 hover:border-blue-500/50 transition-all duration-300">
                                <span className="font-medium text-gray-400">Автообновление:</span>
                                <span className="font-semibold text-blue-400">Каждый понедельник в 9:00</span>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-12">
                            <div className="text-6xl mb-4 text-gray-500">📁</div>
                            <h3 className="text-2xl font-semibold text-gray-300 mb-2">Базовый файл не загружен</h3>
                            <p className="text-gray-400">Загрузите основной файл для начала работы</p>
                        </div>
                    )}
                </div>

                {/* Action Cards - растянул на всю ширину */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                    {/* Upload initial file */}
                    <div className="bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-2xl p-6 border border-white/20 transition-all duration-500 hover:shadow-3xl hover:-translate-y-1">
                        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                            <DocumentArrowUpIcon className="h-6 w-6 text-cyan-400" />
                            1. Загрузка базового файла
                        </h2>
                        <form onSubmit={handleInitialFormSubmit} encType="multipart/form-data" className="space-y-4">
                            <div className="relative">
                                <input 
                                    type="file" 
                                    name="file" 
                                    accept=".json" 
                                    required 
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                                <label className="flex items-center justify-center p-6 border-2 border-dashed border-gray-600 rounded-2xl bg-gray-700/50 hover:border-cyan-500 hover:bg-cyan-500/10 transition-all cursor-pointer text-center min-h-[80px] text-gray-300 hover:text-cyan-300">
                                    Выберите JSON файл
                                </label>
                            </div>
                            <button 
                                type="submit" 
                                className="w-full flex items-center justify-center gap-2 py-4 px-4 bg-cyan-600 text-white rounded-2xl font-medium hover:bg-cyan-700 transform hover:-translate-y-1 transition-all duration-300 hover:shadow-2xl"
                            >
                                <DocumentArrowUpIcon className="h-5 w-5" />
                                Сохранить как основной
                            </button>
                        </form>
                        {initialMessage && (
                            <div className={`mt-4 p-4 rounded-2xl backdrop-blur-sm ${
                                initialMessage.includes('✅') 
                                    ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                                    : initialMessage.includes('❌')
                                    ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                    : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                            }`}>
                                {initialMessage}
                            </div>
                        )}
                    </div>

                    {/* Compare data */}
                    <div className="bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-2xl p-6 border border-white/20 transition-all duration-500 hover:shadow-3xl hover:-translate-y-1">
                        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                            <ArrowsRightLeftIcon className="h-6 w-6 text-orange-400" />
                            2. Сравнение данных
                        </h2>
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
                                <label className={`flex items-center justify-center p-6 border-2 border-dashed rounded-2xl text-center min-h-[80px] transition-all ${
                                    initialInfo 
                                        ? 'border-gray-600 bg-gray-700/50 hover:border-orange-500 hover:bg-orange-500/10 text-gray-300 hover:text-orange-300 cursor-pointer' 
                                        : 'border-gray-600 bg-gray-700/30 text-gray-500 cursor-not-allowed'
                                }`}>
                                    Выберите JSON файл
                                </label>
                            </div>
                            <div className="flex items-center gap-3">
                                <input 
                                    type="checkbox" 
                                    id="updateInitial" 
                                    name="update_initial" 
                                    value="true" 
                                    disabled={!initialInfo}
                                    className={`w-4 h-4 rounded border-gray-600 bg-gray-700 ${
                                        initialInfo ? 'text-orange-500 cursor-pointer' : 'cursor-not-allowed'
                                    }`}
                                />
                                <label 
                                    htmlFor="updateInitial" 
                                    className={`text-sm ${
                                        initialInfo ? 'text-gray-300 cursor-pointer' : 'text-gray-500 cursor-not-allowed'
                                    }`}
                                >
                                    Обновить основной файл изменениями
                                </label>
                            </div>
                            <button 
                                type="submit" 
                                className={`w-full flex items-center justify-center gap-2 py-4 px-4 rounded-2xl font-medium transition-all duration-300 ${
                                    initialInfo 
                                        ? 'bg-orange-600 text-white hover:bg-orange-700 transform hover:-translate-y-1 hover:shadow-2xl' 
                                        : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                                }`}
                                disabled={!initialInfo}
                            >
                                <ArrowsRightLeftIcon className="h-5 w-5" />
                                Сравнить с основным файлом
                            </button>
                        </form>
                        {!initialInfo && (
                            <div className="mt-4 p-4 bg-yellow-500/20 border border-yellow-500/30 text-yellow-300 rounded-2xl">
                                ⚠️ Сначала загрузите основной файл
                            </div>
                        )}
                    </div>

                    {/* Manual auto-update */}
                    <div className="bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-2xl p-6 border border-white/20 transition-all duration-500 hover:shadow-3xl hover:-translate-y-1">
                        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                            <ArrowPathIcon className="h-6 w-6 text-purple-400" />
                            3. Ручное обновление
                        </h2>
                        <p className="text-gray-400 mb-6">Запустите обновление вручную</p>
                        <button 
                            onClick={handleManualAutoUpdate} 
                            className={`w-full flex items-center justify-center gap-2 py-4 px-4 border-2 rounded-2xl font-medium transition-all duration-300 ${
                                initialInfo 
                                    ? 'border-purple-500 text-purple-400 hover:bg-purple-500/10 hover:text-purple-300 hover:border-purple-400 transform hover:-translate-y-1 hover:shadow-2xl' 
                                    : 'border-gray-600 text-gray-500 bg-gray-700/30 cursor-not-allowed'
                            }`}
                            disabled={!initialInfo}
                        >
                            <ArrowPathIcon className="h-5 w-5" />
                            Запустить автообновление
                        </button>
                        {manualAutoUpdateMessage && (
                            <div className={`mt-4 p-4 rounded-2xl backdrop-blur-sm ${
                                manualAutoUpdateMessage.includes('✅') 
                                    ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                                    : manualAutoUpdateMessage.includes('❌')
                                    ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                    : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                            }`}>
                                {manualAutoUpdateMessage}
                            </div>
                        )}
                    </div>
                </div>

                {/* Update message */}
                {updateMessage && (
                    <div className="mb-6 p-4 bg-green-500/20 border border-green-500/30 text-green-300 rounded-2xl">
                        {updateMessage}
                    </div>
                )}

                {/* Comparison statistics */}
                {allResults.length > 0 && (
                    <div className="bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-2xl p-8 mb-8 border border-white/20 transition-all duration-500 hover:shadow-3xl">
                        <h2 className="text-2xl font-bold text-white mb-6">📈 Статистика сравнения</h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
                            {[
                                { type: 'new', label: 'Новые', count: currentStats.new || 0, color: 'green', icon: '🟢' },
                                { type: 'moved', label: 'Измененные', count: currentStats.moved || 0, color: 'orange', icon: '🟠' },
                                { type: 'fired', label: 'Уволенные', count: currentStats.fired || 0, color: 'red', icon: '🔴' },
                                { type: 'existing', label: 'Работающие', count: currentStats.existing || 0, color: 'blue', icon: '🔵' },
                                { type: 'total', label: 'Всего', count: currentStats.total || 0, color: 'gray', icon: '📊' },
                                { type: 'date', label: 'Дата сравнения', value: currentComparisonDate || '-', color: 'gray', icon: '📅' }
                            ].map((stat, index) => (
                                <div 
                                    key={index}
                                    className={`flex items-center gap-3 p-4 bg-gray-700/50 rounded-2xl border-2 border-transparent hover:border-${stat.color}-500 hover:shadow-lg cursor-pointer transition-all duration-300 ${
                                        stat.type !== 'total' && stat.type !== 'date' ? 'hover:-translate-y-1' : ''
                                    }`}
                                    onClick={() => stat.type !== 'total' && stat.type !== 'date' && filterResults(stat.type)}
                                >
                                    <div className="text-2xl">{stat.icon}</div>
                                    <div>
                                        <div className="text-xs text-gray-400">{stat.label}</div>
                                        <div className={`text-xl font-bold text-${stat.color}-400`}>
                                            {stat.value || stat.count}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        
                        {currentFilter !== 'all' && (
                            <div className="flex items-center justify-between p-4 bg-cyan-500/20 border border-cyan-500/30 rounded-2xl">
                                <div className="text-sm text-cyan-300">
                                    <span>Показаны записи: </span>
                                    <strong className="font-medium">
                                        {currentFilter === 'new' ? 'Новые сотрудники' :
                                         currentFilter === 'moved' ? 'Измененные записи' :
                                         currentFilter === 'fired' ? 'Уволенные сотрудники' :
                                         currentFilter === 'existing' ? 'Работающие сотрудники' : 'Все записи'}
                                    </strong>
                                </div>
                                <button 
                                    onClick={handleClearFilter} 
                                    className="py-2 px-4 border border-gray-600 rounded-xl text-sm text-gray-300 hover:bg-gray-700/50 transition-colors"
                                >
                                    Сбросить фильтр
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Comparison results - убрал overflow-x-auto и сделал таблицу адаптивной */}
                <div className="bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/20 transition-all duration-500 hover:shadow-3xl">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
                        <h2 className="text-2xl font-bold text-white mb-4 sm:mb-0">Результаты сравнения</h2>
                        <div className="flex items-center gap-4">
                            <div className="relative">
                                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                                <input 
                                    type="text" 
                                    className="pl-10 pr-4 py-3 bg-gray-700/50 border border-gray-600 rounded-2xl text-white placeholder-gray-400 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all w-80"
                                    placeholder="Поиск по всем полям..."
                                    value={searchQuery}
                                    onChange={handleSearchChange}
                                />
                            </div>
                            <span className="text-sm text-gray-400 font-medium px-3 py-2 bg-gray-700/50 rounded-2xl border border-gray-600" id="resultsCount">
                                {totalResults} записей
                            </span>
                        </div>
                    </div>
                    
                    {/* Убрал overflow-x-auto и сделал таблицу на всю ширину */}
                    <div className="rounded-2xl border border-gray-600 w-full">
                        <table className="w-full divide-y divide-gray-600">
                            <thead className="bg-gray-700/50">
                                <tr>
                                    {['Статус', 'ФИО', 'Организация', 'Подразделение', 'Должность', 'Дата приема', 'Дата увольнения', 'Состояние', 'Изменения'].map((header, index) => (
                                        <th key={index} scope="col" className="px-4 py-4 text-left text-xs font-medium text-gray-300 uppercase tracking-wider whitespace-nowrap">
                                            {header}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="bg-gray-800/30 divide-y divide-gray-700">
                                {paginatedResults.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="px-6 py-12 text-center text-gray-400">
                                            <div className="text-6xl mb-4">📋</div>
                                            <h3 className="text-xl font-semibold text-gray-300 mb-2">Нет данных для отображения</h3>
                                            <p>Попробуйте изменить фильтр или загрузить новые данные</p>
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedResults.map(emp => {
                                        const statusClass = emp.state === 'Уволен' ? 'fired' : 
                                                           emp.is_new ? 'new' : 
                                                           emp.changes && emp.changes.length > 0 ? 'moved' : 'existing';
                                        
                                        let bgColor = 'bg-blue-500/10';
                                        let hoverBgColor = 'hover:bg-blue-500/20';
                                        if (statusClass === 'new') {
                                            bgColor = 'bg-green-500/10';
                                            hoverBgColor = 'hover:bg-green-500/20';
                                        } else if (statusClass === 'moved') {
                                            bgColor = 'bg-orange-500/10';
                                            hoverBgColor = 'hover:bg-orange-500/20';
                                        } else if (statusClass === 'fired') {
                                            bgColor = 'bg-red-500/10';
                                            hoverBgColor = 'hover:bg-red-500/20';
                                        }
                                        
                                        return (
                                            <tr key={emp.id} className={`${bgColor} ${hoverBgColor} transition-colors duration-300`}>
                                                <td className="px-4 py-4 whitespace-pre-wrap">
                                                    {statusClass === 'new' ? '🟢' : 
                                                     statusClass === 'moved' ? '🟠' : 
                                                     statusClass === 'fired' ? '🔴' : '🔵'}
                                                </td>
                                                {['fio', 'organization', 'department', 'position', 'date_hired', 'date_fired', 'state'].map((field, index) => (
                                                    <td key={index} className="px-4 py-4 whitespace-pre-wrap text-gray-300">
                                                        {truncateText(emp[field as keyof Employee] as string).map((line, index) => (
                                                            <div key={index}>{line}</div>
                                                        ))}
                                                    </td>
                                                ))}
                                                <td className="px-4 py-4 whitespace-pre-wrap text-gray-300">
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
                    
                    <div className="flex items-center justify-center gap-4 mt-6 py-4">
                        <button 
                            onClick={() => changePage(-1)}
                            disabled={currentPage === 1}
                            className="px-6 py-3 border border-gray-600 rounded-2xl text-gray-300 hover:bg-gray-700/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 hover:-translate-y-1"
                        >
                            Предыдущая
                        </button>
                        <span className="text-sm text-gray-400 px-4 py-2 bg-gray-700/50 rounded-2xl border border-gray-600">
                            Страница {currentPage} из {totalPages || 1}
                        </span>
                        <button 
                            onClick={() => changePage(1)}
                            disabled={currentPage === totalPages || totalPages === 0}
                            className="px-6 py-3 border border-gray-600 rounded-2xl text-gray-300 hover:bg-gray-700/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 hover:-translate-y-1"
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