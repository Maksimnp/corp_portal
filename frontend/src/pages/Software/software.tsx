import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftIcon, ComputerDesktopIcon, ChartBarIcon, CloudArrowUpIcon } from '@heroicons/react/24/outline';
import { useTheme } from '../../hooks/ThemeContext';
import { IoRefresh, IoDownload, IoStatsChart } from "react-icons/io5";
import { toast, ToastContainer } from 'react-toastify';
import { FiSearch, FiPlus, FiX } from 'react-icons/fi';
import { MdOutlineFolderZip } from "react-icons/md";
import { FaSpinner } from "react-icons/fa";
interface SoftwareItem {
  title: string;
  product_name: string;
  version: string;
  architecture: string;
  is_signed: string;
  description: string;
  filePath: string;
  category?: string;
  created_at: string;
  downloads_count: number;
  file_size: number;
}

interface SoftwareCategory {
  name: string;
  count: number;
}

interface SoftwareStats {
  total_software: number;
  total_downloads: number;
  top_categories: { name: string; count: number; downloads: number }[];
}

interface UserInfo {
  username: string;
  full_name: string;
  email: string;
  department?: string;
  isAdmin: boolean;
}

interface GroupedSoftware {
  product_name: string;
  versions: SoftwareItem[];
  latest_version: SoftwareItem;
  total_downloads: number;
  total_size: number;
  category?: string;
}

const Software: React.FC = () => {
  const { theme } = useTheme();
  const [softwareList, setSoftwareList] = useState<SoftwareItem[]>([]);
  const [allSoftware, setAllSoftware] = useState<SoftwareItem[]>([]);
  const [categories, setCategories] = useState<SoftwareCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [selectedVersions, setSelectedVersions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [stats, setStats] = useState<SoftwareStats | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [newSoftware, setNewSoftware] = useState({
    title: '',
    product_name: '',
    version: '',
    description: '',
    category: '' ,
    file: null as File | null,
  });
  const [showDownloadFolderModal, setShowDownloadFolderModal] = useState(false);
  const [currentFolderInfo, setCurrentFolderInfo] = useState<{
    path: string;
    name: string;
    size: number;
    fileCount: number;
  } | null>(null);
  const [loadingFolderInfo, setLoadingFolderInfo] = useState(false);

  const [ws, setWs] = useState<WebSocket | null>(null);
  const [currentPath, setCurrentPath] = useState<string>('');

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  useEffect(() => {
    fetchUserInfo();
  }, []);

  useEffect(() => {
    if (userInfo) {
      fetchSoftware();
      if (userInfo.isAdmin) {
        // fetchStats();
      }
      setupWebSocket();
    }
  }, [userInfo]);

  const groupedSoftware = useMemo(() => {
    const grouped: Record<string, GroupedSoftware> = {};

    allSoftware.forEach(software => {
      const key = software.product_name || software.title;
      
      if (!grouped[key]) {
        grouped[key] = {
          product_name: key,
          versions: [],
          latest_version: software,
          total_downloads: 0,
          total_size: 0,
          category: ''
        };
      }

      grouped[key].versions.push(software);
      grouped[key].total_downloads += software.downloads_count;
      grouped[key].total_size += software.file_size;
      grouped[key].category = software.category;

      if (new Date(software.created_at) > new Date(grouped[key].latest_version.created_at)) {
        grouped[key].latest_version = software;
      }
    });

    Object.values(grouped).forEach(group => {
      group.versions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    });

    return Object.values(grouped);
  }, [allSoftware]);

  const filteredSoftware = useMemo(() => {
    let filtered = groupedSoftware;

    if (selectedCategory !== 'all') {
      filtered = filtered.filter(group => 
        group.versions.some(version => version.category === selectedCategory)
      );
    }

    if (currentPath) {
      filtered = filtered.filter(group =>
        group.versions.some(version => {
          const filePath = version.filePath;
          if (!filePath.startsWith(currentPath + '/')) return false;

          const remaining = filePath.slice(currentPath.length + 1);
          return !remaining.includes('/');
        })
      );
    } else {
      filtered = filtered.filter(group =>
        group.versions.some(version => !version.filePath.includes('/'))
      );
    }

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(group =>
        group.product_name.toLowerCase().includes(searchLower) ||
        group.versions.some(version => 
          version.title.toLowerCase().includes(searchLower) ||
          version.description.toLowerCase().includes(searchLower) ||
          (version.category && version.category.toLowerCase().includes(searchLower)) ||
          version.version.toLowerCase().includes(searchLower)
        )
      );
    }

    return filtered;
  }, [groupedSoftware, selectedCategory, currentPath, searchTerm]);

  const currentSubdirs = useMemo(() => {
    const dirs = new Set<string>();

    allSoftware.forEach(item => {
      const path = item.filePath;

      if (currentPath && !path.startsWith(currentPath + '/')) {
        return;
      }
      if (!currentPath && path.includes('/')) {
        const firstDir = path.split('/')[0];
        dirs.add(firstDir);
      } else if (currentPath && path !== currentPath) {
        const relative = path.slice(currentPath.length + 1);
        if (relative.includes('/')) {
          const nextDir = relative.split('/')[0];
          dirs.add(currentPath + '/' + nextDir);
        }
      }
    });

    return Array.from(dirs).map(fullPath => {
      const displayName = fullPath.split('/').pop() || fullPath;
      return { displayName, fullPath };
    });
  }, [allSoftware, currentPath]);

  const displayedCategories = useMemo(() => {
    const categoryCounts = allSoftware.reduce((acc, software) => {
      const category = software.category || 'Без категории';
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(categoryCounts).map(([name, count]) => ({
      name,
      count
    }));
  }, [allSoftware]);
  // console.log(allSoftware);
  const fetchUserInfo = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Токен аутентификации не найден');
      }
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
        mode: 'cors',
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Ошибка получения данных пользователя: ${response.status} - ${errorData.detail || 'Неизвестная ошибка'}`);
      }
      const userData = await response.json();
      setUserInfo(userData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить информацию о пользователе.');
    } finally {
      setLoading(false);
    }
  };

  const fetchSoftware = async () => {
    try {
      setLoading(true);
      setError('');
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Токен аутентификации не найден');
      }

      const response = await fetch(`${API_BASE_URL}/software`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
        mode: 'cors',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Ошибка получения ПО: ${response.status} - ${errorData.detail || 'Неизвестная ошибка'}`);
      }

      const data = await response.json();
      setAllSoftware(data.software || []);
      setSoftwareList(data.software || []);
      setCategories(data.categories || []);
    } catch (err) {
      console.error('Ошибка получения ПО:', err);
      setError(err instanceof Error ? err.message : 'Не удалось загрузить список ПО');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Токен аутентификации не найден');
      }
      const response = await fetch(`${API_BASE_URL}/software/stats`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
        mode: 'cors',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Ошибка получения статистики: ${response.status} - ${errorData.detail || 'Неизвестная ошибка'}`);
      }

      const statsData = await response.json();
      setStats(statsData);
    } catch (err) {
      console.error('Ошибка получения статистики:', err);
      setError(err instanceof Error ? err.message : 'Не удалось загрузить статистику ПО');
      setStats(null);
    }
  };

  const setupWebSocket = () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const wsUrl = `ws://${window.location.hostname}:8000/software/ws?token=${encodeURIComponent(token)}`;
    const websocket = new WebSocket(wsUrl);

    websocket.onopen = () => {
      console.log('WebSocket for software connected');
    };

    websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'software_updated') {
          fetchSoftware();
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    websocket.onclose = () => {
      console.log('WebSocket for software disconnected');
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    setWs(websocket);

    return () => {
      websocket.close();
    };
  };
  
  const getFileIcon = (fileCategory: string) => {
    if (!fileCategory) {
      return;
    }

    if (fileCategory === 'Архивы') {
      return <MdOutlineFolderZip className="h-6 w-6"/>;
    }

    return <ComputerDesktopIcon className="h-6 w-6"/>;
  };
  const handleUploadSoftware = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Токен аутентификации не найден');
      }
      const formData = new FormData();
      formData.append('title', newSoftware.title);
      formData.append('product_name', newSoftware.product_name);
      formData.append('version', newSoftware.version);
      formData.append('description', newSoftware.description);
      formData.append('category', newSoftware.category || '');
      if (newSoftware.file) {
        formData.append('file', newSoftware.file);
      }

      const response = await fetch(`${API_BASE_URL}/software/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
        mode: 'cors',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Ошибка загрузки ПО: ${response.status} - ${errorData.detail || 'Неизвестная ошибка'}`);
      }

      setNewSoftware({ title: '', product_name: '', version: '', description: '', category: '', file: null });
      setShowUploadForm(false);
      fetchSoftware();
      toast.success('ПО успешно загружено!');
    } catch (err) {
      toast.error('Ошибка при загрузке ПО');
    }
  };

  const handleDownload = async (filePath: string, title: string) => {
    try {
      console.log('filePath',filePath)
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Токен аутентификации не найден');
      }
      
      toast.info(`Начинаем загрузку: ${title}`);
      
      const response = await fetch(`${API_BASE_URL}/software/download/${encodeURIComponent(filePath)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Ошибка скачивания: ${response.status} - ${errorData.detail || 'Неизвестная ошибка'}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filePath.split('/').pop() || 'software';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success(`${title} успешно скачан!`);
      fetchSoftware();
    } catch (err) {
      toast.error('Ошибка при скачивании');
    }
  };

  const handleSyncMetadata = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Токен не найден');

      toast.info('Синхронизация данных...');
      
      const response = await fetch(`${API_BASE_URL}/software/sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        }
      });

      const result = await response.json();
      const syncFiles = result.created;
      toast.success(`Успешно обновлено файлов: ${syncFiles}`);
      fetchSoftware();
    } catch (err) {
      console.error('Ошибка синхронизации:', err);
      toast.error('Ошибка синхронизации');
    }
  };

  const fetchFolderInfo = async (folderPath: string) => {
    try {
      setLoadingFolderInfo(true);
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Токен аутентификации не найден');
      }

      const response = await fetch(
        `${API_BASE_URL}/software/folder-size/${encodeURIComponent(folderPath)}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Ошибка получения информации о папке: ${response.status} - ${errorData.detail || 'Неизвестная ошибка'}`);
      }

      const folderInfo = await response.json();
      setCurrentFolderInfo({
        path: folderPath,
        name: folderInfo.folder_name,
        size: folderInfo.total_size,
        fileCount: folderInfo.file_count
      });
      setShowDownloadFolderModal(true);
    } catch (err) {
      toast.error('Ошибка при получении информации о папке');
      console.error('Error fetching folder info:', err);
    } finally {
      setLoadingFolderInfo(false);
    }
  };

  const handleDownloadFolder = async () => {
    if (!currentFolderInfo) return;

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Токен аутентификации не найден');
      }

      const toastId = toast.info(
        <div className="flex items-center gap-3">
          <FaSpinner color='#42AAFF' className='w-15 h-15 text-blue animate-spin'/>
          <span>Подождите, пока файл не будет загружен: {currentFolderInfo.name}</span>
        </div>,
        {
          autoClose: false,
          closeButton: false,
          icon: false,
        }
      );
      
      const response = await fetch(
        `${API_BASE_URL}/software/download-folder/${encodeURIComponent(currentFolderInfo.path)}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Ошибка скачивания папки: ${response.status} - ${errorData.detail || 'Неизвестная ошибка'}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${currentFolderInfo.name}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.update(toastId, {
        render: `Папка "${currentFolderInfo.name}" успешно скачана!`,
        type: 'success',
        autoClose: 3000,
        closeButton: true,
      });
      setShowDownloadFolderModal(false);
      setCurrentFolderInfo(null);
    } catch (err) {
      toast.error('Ошибка при скачивании папки');
      console.error('Error downloading folder:', err);
    }
  };

  const toggleItem = (productName: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(productName)) {
      newExpanded.delete(productName);
    } else {
      newExpanded.add(productName);
    }
    setExpandedItems(newExpanded);
  };

  const toggleVersion = (versionId: string) => {
    const newSelected = new Set(selectedVersions);
    if (newSelected.has(versionId)) {
      newSelected.delete(versionId);
    } else {
      newSelected.add(versionId);
    }
    setSelectedVersions(newSelected);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Б';

    const k = 1024;
    const sizes = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    const value = parseFloat((bytes / Math.pow(k, i)).toFixed(2));
    return `${value} ${sizes[i]}`;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const themeClasses = {
    background: theme === 'dark' 
      ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900' 
      : 'bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50',
    card: theme === 'dark' 
      ? 'bg-gray-800/80 backdrop-blur-sm border-gray-700/50 text-white' 
      : 'bg-white/80 backdrop-blur-sm border-gray-200/50 text-gray-900',
    glass: theme === 'dark'
      ? 'bg-gray-800/60 backdrop-blur-md border-gray-700/30'
      : 'bg-white/60 backdrop-blur-md border-gray-200/30',
    text: {
      primary: theme === 'dark' ? 'text-white' : 'text-gray-900',
      secondary: theme === 'dark' ? 'text-gray-300' : 'text-gray-600',
      muted: theme === 'dark' ? 'text-gray-400' : 'text-gray-500',
    },
    button: {
      primary: theme === 'dark' 
        ? 'bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white shadow-lg shadow-blue-500/25' 
        : 'bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white shadow-lg shadow-blue-500/25',
      secondary: theme === 'dark' 
        ? 'bg-gray-700/50 hover:bg-gray-600/50 text-white border border-gray-600/50' 
        : 'bg-white/50 hover:bg-gray-100/50 text-gray-700 border border-gray-300/50',
      success: theme === 'dark'
        ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white shadow-lg shadow-green-500/25'
        : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white shadow-lg shadow-green-500/25',
    },
    input: theme === 'dark' 
      ? 'bg-gray-700/50 border-gray-600/50 text-white placeholder-gray-400 backdrop-blur-sm' 
      : 'bg-white/50 border-gray-300/50 text-gray-800 placeholder-gray-500 backdrop-blur-sm',
    badge: {
      category: theme === 'dark' 
        ? 'bg-gradient-to-r from-blue-500/20 to-violet-500/20 text-blue-300 border border-blue-500/30' 
        : 'bg-gradient-to-r from-blue-100 to-violet-100 text-blue-700 border border-blue-200',
      stats: theme === 'dark'
        ? 'bg-gradient-to-r from-blue-500/10 to-violet-500/10 border border-blue-500/20'
        : 'bg-gradient-to-r from-blue-50 to-violet-50 border border-blue-200',
      version: theme === 'dark'
        ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 text-green-300 border border-green-500/30'
        : 'bg-gradient-to-r from-green-100 to-emerald-100 text-green-700 border border-green-200',
    },
  };

  const hasActiveFilters = selectedCategory !== 'all' || searchTerm !== '';

  if (loading) {
    return (
      <div className={`min-h-screen ${themeClasses.background} flex items-center justify-center`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className={`text-lg font-medium ${themeClasses.text.secondary}`}>Загрузка ПО...</div>
          <div className={`text-sm ${themeClasses.text.muted} mt-2`}>Подготавливаем ваш каталог</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`min-h-screen ${themeClasses.background} flex items-center justify-center p-4`}>
        <div className={`rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center ${themeClasses.glass} border`}>
          <div className="text-6xl mb-4">⚠️</div>
          <h3 className="font-bold text-xl mb-3">Ошибка загрузки</h3>
          <p className={`mb-6 leading-relaxed ${themeClasses.text.secondary}`}>{error}</p>
          <button
            onClick={() => {
              setError('');
              fetchUserInfo();
            }}
            className={`w-full px-6 py-3 rounded-xl transition-all duration-200 font-medium ${themeClasses.button.primary} hover:scale-105 transform`}
          >
            Попробовать снова
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${themeClasses.background} py-8`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6">
          <div className="flex items-center gap-4">
            <Link
              to="/dashboard"
              className={`inline-flex ${theme === 'light' ? 'text-black':'text-white'} items-center gap-2 px-4 py-3 rounded-xl transition-all duration-200 hover:scale-105 ${themeClasses.glass} border shadow-lg`}
            >
              <ArrowLeftIcon className="h-5 w-5" />
              <span className="font-medium">Назад</span>
            </Link>
            <div>
              <h1 className={`text-4xl font-bold mb-2 bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent`}>
                Программное обеспечение
              </h1>
              <p className={`text-lg ${themeClasses.text.secondary}`}>
                {hasActiveFilters 
                  ? `Найдено: ${filteredSoftware.length} продуктов из ${groupedSoftware.length}` 
                  : `Всего продуктов: ${groupedSoftware.length}`
                }
              </p>
            </div>
          </div>

          {userInfo && (
            <div className={`px-6 py-4 rounded-2xl ${themeClasses.glass} border shadow-lg`}>
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-full bg-gradient-to-r from-blue-500 to-violet-500 flex items-center justify-center text-white font-bold text-lg`}>
                  {userInfo.full_name.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <p className={`font-semibold ${themeClasses.text.primary}`}>{userInfo.full_name}</p>
                  {userInfo.department && (
                    <p className={`text-sm ${themeClasses.text.muted}`}>{userInfo.department}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Admin Controls */}
        {userInfo?.isAdmin && (
          <div className="flex flex-wrap gap-3 mb-8">
            <button
              onClick={() => setShowStats(!showStats)}
              className={`flex items-center gap-3 px-6 py-3 rounded-xl transition-all duration-200 ${themeClasses.button.primary} hover:scale-105`}
            >
              <IoStatsChart size={20} />
              {showStats ? 'Скрыть статистику' : 'Показать статистику'}
            </button>
            <button
              onClick={() => setShowUploadForm(true)}
              className={`flex items-center gap-3 px-6 py-3 rounded-xl transition-all duration-200 ${themeClasses.button.success} hover:scale-105`}
            >
              <FiPlus size={20} />
              Добавить ПО
            </button>
            <button
              onClick={handleSyncMetadata}
              className={`flex items-center gap-3 px-6 py-3 rounded-xl transition-all duration-200 ${themeClasses.button.secondary} hover:scale-105`}
            >
              <IoRefresh size={20} />
              Обновить данные
            </button>
          </div>
        )}

        {/* Statistics */}
        {showStats && userInfo?.isAdmin && (
          <div className={`rounded-2xl p-8 mb-8 ${themeClasses.glass} border shadow-xl`}>
            <div className="flex items-center gap-3 mb-6">
              <ChartBarIcon className="h-8 w-8 text-blue-500" />
              <h2 className={`text-2xl font-bold ${themeClasses.text.primary}`}>Статистика ПО</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className={`p-6 rounded-2xl ${themeClasses.badge.stats} border`}>
                <div className={`text-3xl font-bold mb-2 ${theme === 'dark' ? 'text-blue-300' : 'text-blue-600'}`}>
                  {allSoftware.length}
                </div>
                <div className={`font-medium ${themeClasses.text.secondary}`}>Всего версий</div>
              </div>
              <div className={`p-6 rounded-2xl ${themeClasses.badge.stats} border`}>
                <div className={`text-3xl font-bold mb-2 ${theme === 'dark' ? 'text-green-300' : 'text-green-600'}`}>
                  {allSoftware.reduce((sum, el) => sum + el.downloads_count, 0)}
                </div>
                <div className={`font-medium ${themeClasses.text.secondary}`}>Всего скачиваний</div>
              </div>
              <div className={`p-6 rounded-2xl ${themeClasses.badge.stats} border`}>
                <div className={`text-3xl font-bold mb-2 ${theme === 'dark' ? 'text-purple-300' : 'text-purple-600'}`}>
                  {groupedSoftware.length}
                </div>
                <div className={`font-medium ${themeClasses.text.secondary}`}>Уникальных продуктов</div>
              </div>
            </div>
          </div>
        )}

        {/* Upload Form */}
        {showUploadForm && userInfo?.isAdmin && (
          <div className={`rounded-2xl p-8 mb-8 ${themeClasses.glass} border shadow-xl`}>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <CloudArrowUpIcon className="h-8 w-8 text-green-500" />
                <h3 className={`text-2xl font-bold ${themeClasses.text.primary}`}>Загрузить новое ПО</h3>
              </div>
              <button
                onClick={() => setShowUploadForm(false)}
                className={`p-2 rounded-lg ${themeClasses.button.secondary}`}
              >
                <FiX size={20} />
              </button>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${themeClasses.text.secondary}`}>
                    Название *
                  </label>
                  <input
                    type="text"
                    placeholder="Введите название программы"
                    value={newSoftware.title}
                    onChange={e => setNewSoftware({ ...newSoftware, title: e.target.value })}
                    className={`w-full px-4 py-3 border-2 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${themeClasses.input}`}
                    required
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${themeClasses.text.secondary}`}>
                    Название продукта *
                  </label>
                  <input
                    type="text"
                    placeholder="Введите название продукта (для группировки)"
                    value={newSoftware.product_name}
                    onChange={e => setNewSoftware({ ...newSoftware, product_name: e.target.value })}
                    className={`w-full px-4 py-3 border-2 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${themeClasses.input}`}
                    required
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${themeClasses.text.secondary}`}>
                    Версия *
                  </label>
                  <input
                    type="text"
                    placeholder="Введите версию (например: 1.0.0)"
                    value={newSoftware.version}
                    onChange={e => setNewSoftware({ ...newSoftware, version: e.target.value })}
                    className={`w-full px-4 py-3 border-2 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${themeClasses.input}`}
                    required
                  />
                </div>
                
                <div>
                  <label className={`block text-sm font-medium mb-2 ${themeClasses.text.secondary}`}>
                    Категория
                  </label>
                  <select
                    value={newSoftware.category || ''}
                    onChange={e => setNewSoftware({ ...newSoftware, category: e.target.value })}
                    className={`w-full px-4 py-3 border-2 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${themeClasses.input}`}
                  >
                    <option value="">Авто (по расширению файла)</option>
                    <option value="Исполняемые файлы Windows(.exe)">Исполняемые файлы Windows (.exe)</option>
                    <option value="Установочные пакеты Windows Installer(.msi)">Установочные пакеты Windows Installer (.msi)</option>
                    <option value="Пакетные скрипты Windows(.bat)">Пакетные скрипты Windows (.bat)</option>
                    <option value="Архивы">Архивы (.zip, .7z, .rar, .tar, .tar.gz)</option>
                    <option value="Образы дисков">Образы дисков (.iso)</option>
                  </select>
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${themeClasses.text.secondary}`}>
                    Файл *
                  </label>
                  <input
                    type="file"
                    onChange={e => {
                      const file = e.target.files ? e.target.files[0] : null;
                      let autoCategory = '';

                      if (file && !newSoftware.category) {
                        const ext = file.name.split('.').pop()?.toLowerCase();
                        if (ext) {
                          const extToCat: Record<string, string> = {
                            exe: 'Исполняемые файлы Windows(.exe)',
                            msi: 'Установочные пакеты Windows Installer(.msi)',
                            bat: 'Пакетные скрипты Windows(.bat)',
                            zip: 'Архивы',
                            '7z': 'Архивы',
                            rar: 'Архивы',
                            iso: 'Образы дисков',
                            tar: 'Архивы',
                          };

                          autoCategory = ext ? extToCat[ext] || '' : '';
                        }
                      }

                      setNewSoftware({
                        ...newSoftware,
                        file,
                        ...(newSoftware.category === '' && { category: autoCategory })
                      });
                    }}
                    className={`w-full px-4 py-3 border-2 rounded-xl file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold transition-all ${
                      theme === 'dark' 
                        ? 'file:bg-blue-600 file:text-white' 
                        : 'file:bg-blue-600 file:text-white'
                    } ${themeClasses.input}`}
                    required
                  />
                </div>
              </div>
              
              <div>
                <label className={`block text-sm font-medium mb-2 ${themeClasses.text.secondary}`}>
                  Описание *
                </label>
                <textarea
                  placeholder="Подробное описание программы..."
                  value={newSoftware.description}
                  onChange={e => setNewSoftware({ ...newSoftware, description: e.target.value })}
                  className={`w-full h-40 px-4 py-3 border-2 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-all ${themeClasses.input}`}
                  required
                />
              </div>
            </div>
            
            <div className="flex gap-3 pt-6">
              <button
                onClick={handleUploadSoftware}
                disabled={!newSoftware.title || !newSoftware.product_name || !newSoftware.version || !newSoftware.description || !newSoftware.file}
                className={`flex-1 px-6 py-3 rounded-xl transition-all duration-200 font-medium ${
                  !newSoftware.title || !newSoftware.product_name || !newSoftware.version || !newSoftware.description || !newSoftware.file
                    ? 'bg-gray-400 cursor-not-allowed'
                    : `${themeClasses.button.success} hover:scale-105`
                }`}
              >
                Загрузить ПО
              </button>
              <button
                onClick={() => setShowUploadForm(false)}
                className={`px-8 py-3 rounded-xl transition-all duration-200 font-medium ${themeClasses.button.secondary} hover:scale-105`}
              >
                Отмена
              </button>
            </div>
          </div>
        )}

        {/* Search and Filters */}
        <div className={`rounded-2xl p-6 mb-8 ${themeClasses.glass} border shadow-lg`}>
          {/* Categories */}
            <div className="mb-6 border-gray-200/50">
              <h4 className={`text-sm font-semibold mb-4 uppercase tracking-wide ${themeClasses.text.muted}`}>
                Категории
              </h4>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    selectedCategory === 'all' 
                      ? 'bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-lg shadow-blue-500/25' 
                      : themeClasses.button.secondary
                  } hover:scale-105`}
                >
                  Все ({groupedSoftware.length})
                </button>
                {displayedCategories.map(category => (
                  <button
                    key={category.name}
                    onClick={() => setSelectedCategory(category.name)}
                    className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                      selectedCategory === category.name
                        ? 'bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-lg shadow-blue-500/25'
                        : themeClasses.button.secondary
                    } hover:scale-105`}
                  >
                    {category.name} ({category.count})
                  </button>
                ))}
              </div>
            </div>
          {currentPath && (
            <div className="flex justify-between mb-4">
              <button
                onClick={() => {
                  const parent = currentPath.split('/').slice(0, -1).join('/');
                  setCurrentPath(parent);
                }}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg ${themeClasses.button.secondary} hover:scale-105`}
              >
                <ArrowLeftIcon className="h-4 w-4" />
                Назад к {currentPath.split('/').slice(0, -1).join('/') || 'корню'}
              </button>
              <button
                onClick={() => fetchFolderInfo(currentPath)}
                disabled={loadingFolderInfo}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 font-medium ${
                  loadingFolderInfo
                    ? 'bg-gray-400 cursor-not-allowed'
                    : `${themeClasses.button.primary} hover:scale-105`
                }`}
              >
                <MdOutlineFolderZip size={20} />
                {loadingFolderInfo ? 'Загрузка...' : `Скачать папку "${currentPath.split('/').pop() || currentPath}"`}
              </button>
            </div>
          )}

          {currentSubdirs.length > 0 && (
            <div className="mb-6">
              <h4 className={`text-sm font-semibold mb-2 uppercase tracking-wide ${themeClasses.text.muted}`}>
                Папки
              </h4>
              <div className="flex flex-wrap gap-2">
                {currentSubdirs.map(dir => (
                  <button
                    key={dir.fullPath}
                    onClick={() => setCurrentPath(dir.fullPath)}
                    className={`px-4 py-2 text-sm font-medium rounded-lg ${themeClasses.button.secondary} hover:scale-105`}
                  >
                    📁 {dir.displayName}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <FiSearch className={`h-5 w-5 ${themeClasses.text.muted}`} />
              </div>
              <input
                type="text"
                placeholder="Поиск по названию, описанию, категории или версии..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className={`w-full pl-12 pr-4 py-3 border-2 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${themeClasses.input}`}
              />
            </div>
          </div>
        </div>

        {/* Active Filters Info */}
        {hasActiveFilters && (
          <div className={`rounded-2xl p-4 mb-6 ${themeClasses.glass} border shadow-lg`}>
            <div className="flex items-center gap-3">
              <span className={`text-sm font-medium ${themeClasses.text.primary}`}>Активные фильтры:</span>
              {selectedCategory !== 'all' && (
                <span className={`px-3 py-1 text-xs font-medium rounded-full ${themeClasses.badge.category}`}>
                  Категория: {selectedCategory}
                </span>
              )}
              {searchTerm && (
                <span className={`px-3 py-1 text-xs font-medium rounded-full ${themeClasses.badge.category}`}>
                  Поиск: "{searchTerm}"
                </span>
              )}
              <span className={`text-sm ${themeClasses.text.muted} ml-auto`}>
                Показано: {filteredSoftware.length} из {groupedSoftware.length}
              </span>
            </div>
          </div>
        )}

        {/* Software List */}
        <div className="space-y-4">
          {filteredSoftware.length === 0 ? (
            <div className={`text-center py-16 rounded-2xl ${themeClasses.glass} border shadow-lg`}>
              <div className="text-7xl mb-4">🔍</div>
              <h3 className={`text-2xl font-bold mb-3 ${themeClasses.text.primary}`}>
                {hasActiveFilters ? 'По вашему запросу ничего не найдено' : 'Программы не найдены'}
              </h3>
              <p className={`text-lg ${themeClasses.text.secondary} mb-6`}>
                {hasActiveFilters 
                  ? 'Попробуйте изменить параметры поиска или сбросить фильтры' 
                  : 'В каталоге пока нет программного обеспечения'
                }
              </p>
            </div>
          ) : (
            filteredSoftware.map(group => (
              <div 
                key={group.product_name} 
                className={`rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-2xl ${
                  theme === 'dark' 
                    ? 'bg-gray-800/60 backdrop-blur-sm border-gray-700/30 hover:border-gray-600/50' 
                    : 'bg-white/60 backdrop-blur-sm border-gray-200/30 hover:border-gray-300/50'
                } border`}
              >
                <button
                  onClick={() => toggleItem(group.product_name)}
                  className={`w-full px-8 py-6 text-left focus:outline-none transition-all duration-200 ${
                    theme === 'dark' ? 'hover:bg-gray-700/30' : 'hover:bg-gray-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-xl ${
                        theme === 'dark' 
                          ? 'bg-blue-500/20 text-blue-300' 
                          : 'bg-blue-100 text-blue-600'
                      }`}>
                        {getFileIcon(group.category || '')}
                      </div>
                      <div className="text-left">
                        <h3 className={`text-xl font-semibold mb-2 ${themeClasses.text.primary}`}>
                          {group.product_name}
                        </h3>
                        <div className="flex items-center gap-3">
                          {group.latest_version.category && (
                            <span className={`px-3 py-1 text-xs font-medium rounded-full ${themeClasses.badge.category}`}>
                              {group.latest_version.category}
                            </span>
                          )}
                          <span className={`px-3 py-1 text-xs font-medium rounded-full ${themeClasses.badge.version}`}>
                            {group.versions.length} версий
                          </span>
                          <span className={`text-sm ${themeClasses.text.muted}`}>
                            {formatFileSize(group.total_size)}
                          </span>
                          <span className={`text-sm ${themeClasses.text.muted}`}>
                            {group.total_downloads} скачиваний
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className={`text-right ${themeClasses.text.muted}`}>
                        <div className="text-sm">Последняя версия: {group.latest_version.version}</div>
                        <div className="text-sm">{formatDate(group.latest_version.created_at)}</div>
                      </div>
                      <div className={`p-2 rounded-lg transition-transform ${
                        expandedItems.has(group.product_name) ? 'rotate-180' : ''
                      } ${themeClasses.button.secondary}`}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </button>

                {expandedItems.has(group.product_name) && (
                  <div className={`px-8 py-6 border-t ${
                    theme === 'dark' ? 'border-gray-700/50' : 'border-gray-200/50'
                  }`}>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <div className="lg:col-span-2">
                        <h4 className={`font-semibold mb-3 ${themeClasses.text.secondary}`}>Описание продукта</h4>
                        <p className={`leading-relaxed mb-6 ${themeClasses.text.primary}`}>
                          {group.latest_version.description}
                        </p>

                        <h4 className={`font-semibold mb-3 ${themeClasses.text.secondary}`}>Доступные версии</h4>
                        <div className="space-y-3">
                          {group.versions.map(version => (
                            <div 
                              key={`${version.product_name}-${version.version}`}
                              className={`p-4 rounded-xl border transition-all duration-200 ${
                                selectedVersions.has(`${version.product_name}-${version.version}`)
                                  ? theme === 'dark' 
                                    ? 'bg-blue-500/10 border-blue-500/30' 
                                    : 'bg-blue-50 border-blue-200'
                                  : theme === 'dark'
                                    ? 'bg-gray-700/30 border-gray-600/30 hover:border-gray-500/50'
                                    : 'bg-gray-50/50 border-gray-200/50 hover:border-gray-300/50'
                              }`}
                            >
                              <button
                                onClick={() => toggleVersion(`${version.product_name}-${version.version}`)}
                                className="w-full text-left"
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <h5 className={`font-semibold ${themeClasses.text.primary}`}>
                                      Версия {version.version}
                                    </h5>
                                    <div className="flex items-center gap-3 mt-2">
                                      <span className={`text-sm ${themeClasses.text.muted}`}>
                                        {formatFileSize(version.file_size)}
                                      </span>
                                      {/* <span className={`text-sm ${themeClasses.text.muted}`}>
                                        {version.downloads_count} скачиваний
                                      </span> */}
                                      <span className={`text-sm ${themeClasses.text.muted}`}>
                                        {formatDate(version.created_at)}
                                      </span>
                                      {version.is_signed !== undefined && (
                                      <span
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                                          version.is_signed
                                            ? theme === 'dark'
                                              ? 'bg-emerald-500/20 text-emerald-300'
                                              : 'bg-emerald-100 text-emerald-800'
                                            : theme === 'dark'
                                              ? 'bg-amber-500/20 text-amber-300'
                                              : 'bg-amber-100 text-amber-800'
                                        }`}
                                        title={version.is_signed ? 'Файл подписан цифровой подписью' : 'Файл не подписан (возможен риск)'}
                                      >
                                        {version.is_signed ? (
                                          <>
                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.7a1 1 0 00-1.4 0L9 11.6l-1.3-1.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0L11 12.4l3.7 3.7a1 1 0 001.4-1.4l-4-4z" clipRule="evenodd" />
                                            </svg>
                                            Подписан
                                          </>
                                        ) : (
                                          <>
                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 10-2 0v1a1 1 0 102 0v-1zm-4-2a1 1 0 112 0v2a1 1 0 11-2 0v-2z" clipRule="evenodd" />
                                            </svg>
                                            Без подписи
                                          </>
                                        )}
                                      </span>
                                    )}
                                    </div>
                                  </div>
                                  <div className={`p-1 rounded transition-transform ${
                                    selectedVersions.has(`${version.product_name}-${version.version}`) ? 'rotate-180' : ''
                                  } ${themeClasses.button.secondary}`}>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </div>
                                </div>
                              </button>

                              {selectedVersions.has(`${version.product_name}-${version.version}`) && (
                                <div className="mt-4 pt-4 border-t border-gray-200/30">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <p className={`text-base ${themeClasses.text.secondary}`}>
                                        Полное название: {version.title}
                                      </p>
                                      <p className={`text-base ${themeClasses.text.muted}`}>
                                        Описание: {version.description}
                                      </p>
                                    </div>
                                    <button
                                      onClick={() => handleDownload(version.filePath, `${group.product_name} v${version.version}`)}
                                      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 font-medium ${themeClasses.button.primary} hover:scale-105`}
                                    >
                                      <IoDownload size={16} />
                                      Скачать
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col gap-4">
                        <button
                          onClick={() => handleDownload(group.latest_version.filePath, `${group.product_name} v${group.latest_version.version}`)}
                          className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl transition-all duration-200 font-medium ${themeClasses.button.primary} hover:scale-105`}
                        >
                          <IoDownload size={18} />
                          Скачать последнюю версию
                        </button>
                        <div className={`p-4 rounded-xl ${themeClasses.badge.stats} border`}>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className={themeClasses.text.muted}>Всего версий:</span>
                              <span className={themeClasses.text.primary}>{group.versions.length}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className={themeClasses.text.muted}>Общий размер:</span>
                              <span className={themeClasses.text.primary}>{formatFileSize(group.total_size)}</span>
                            </div>
                            {/* <div className="flex justify-between">
                              <span className={themeClasses.text.muted}>Всего скачиваний:</span>
                              <span className={themeClasses.text.primary}>{group.total_downloads}</span>
                            </div> */}
                            <div className="flex justify-between">
                              <span className={themeClasses.text.muted}>Последнее обновление:</span>
                              <span className={themeClasses.text.primary}>{formatDate(group.latest_version.created_at)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
      {showDownloadFolderModal && currentFolderInfo && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className={`rounded-2xl p-8 max-w-md w-full mx-auto ${themeClasses.glass} border shadow-2xl`}>
            <div className="flex items-center gap-3 mb-6">
              <MdOutlineFolderZip className="h-8 w-8 text-blue-500" />
              <h3 className={`text-2xl font-bold ${themeClasses.text.primary}`}>
                Скачать папку
              </h3>
            </div>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className={`block text-sm font-medium mb-1 ${themeClasses.text.muted}`}>
                  Название папки
                </label>
                <p className={`font-semibold ${themeClasses.text.primary}`}>
                  {currentFolderInfo.name}
                </p>
              </div>
              
              <div>
                <label className={`block text-sm font-medium mb-1 ${themeClasses.text.muted}`}>
                  Полный путь
                </label>
                <p className={`text-sm ${themeClasses.text.secondary} break-all`}>
                  {currentFolderInfo.path}
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium mb-1 ${themeClasses.text.muted}`}>
                    Размер
                  </label>
                  <p className={`font-semibold ${themeClasses.text.primary}`}>
                    {formatFileSize(currentFolderInfo.size)}
                  </p>
                </div>
                
                <div>
                  <label className={`block text-sm font-medium mb-1 ${themeClasses.text.muted}`}>
                    Файлов
                  </label>
                  <p className={`font-semibold ${themeClasses.text.primary}`}>
                    {currentFolderInfo.fileCount}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={handleDownloadFolder}
                className={`flex-1 px-6 py-3 rounded-xl transition-all duration-200 font-medium ${themeClasses.button.primary} hover:scale-105`}
              >
                Скачать как ZIP
              </button>
              <button
                onClick={() => {
                  setShowDownloadFolderModal(false);
                  setCurrentFolderInfo(null);
                }}
                className={`px-8 py-3 rounded-xl transition-all duration-200 font-medium ${themeClasses.button.secondary} hover:scale-105`}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
      <ToastContainer />
    </div>
  );
};

export default Software;