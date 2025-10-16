import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { debounce } from 'lodash';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { DocumentStatus, DocumentPermission } from '../../models/documentModels';
import { Modal, Tooltip, Popover, Button, List, Tag } from 'antd';
import type { PopoverProps } from 'antd';
import screenfull from 'screenfull';
import { CloseOutlined, FileOutlined, FullscreenExitOutlined, FullscreenOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { ArrowLeft, Moon, Sun } from 'phosphor-react';

interface User {
  displayName: string;
  department: string;
  email?: string;
  id: string;
}

interface Document {
  id: string;
  title: string;
  owner_username: string;
  file_path: string;
  file_type: string,
  created_at: string;
  status: DocumentStatus;
}

interface SharedDocument {
  document_id: string;
  recipient_username: string;
  permission: DocumentPermission;
  shared_at: string;
  status: DocumentStatus;
  title: string;
  owner_username: string;
  file_path: string;
  file_type: string;
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL;
const onlyOfficeServerUrl = import.meta.env.VITE_ONLYOFFICE_SERVER_URL;

const DocumentsPage: React.FC = () => {
  const [myDocuments, setMyDocuments] = useState<Document[]>([]);
  const [sharedDocuments, setSharedDocuments] = useState<SharedDocument[]>([]);
  const [sendedDocuments, setSendedDocuments] = useState<SharedDocument[]>([]);
  const [statusDoc, setStatusDoc] = useState<Record<string, string>>({});
  const [contacts, setContacts] = useState<User[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [currentDoc, setCurrentDoc] = useState<Document | null>(null);
  const [recipient, setRecipient] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [canReview, setCanReview] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchQueryContacts, setSearchQueryContacts] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isOpenMyDocument, setIsOpenMyDocument] = useState(true);
  const [isOpenSharedDocument, setIsOpenSharedDocument] = useState(false);

  const [isOnlyOfficeModalOpen, setIsOnlyOfficeModalOpen] = useState(false);
  const [onlyOfficeConfig, setOnlyOfficeConfig] = useState<any>(null);
  const [onlyOfficeJwtToken, setOnlyOfficeJwtToken] = useState<string | undefined>(undefined);

  // Получение темы из localStorage
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
  });

  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  // Слушатель изменений темы
  useEffect(() => {
    const handleStorageChange = () => {
      const currentTheme = (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
      setTheme(currentTheme);
    };

    window.addEventListener('storage', handleStorageChange);
    
    const interval = setInterval(() => {
      const currentTheme = (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
      if (currentTheme !== theme) {
        setTheme(currentTheme);
      }
    }, 1000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [theme]);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    window.dispatchEvent(new Event('storage'));
  };

  // Стили для темной темы
  const themeClasses = {
    background: theme === 'dark' 
      ? 'bg-gradient-to-br from-gray-900 to-gray-950' 
      : 'bg-gradient-to-br from-blue-50 to-gray-100',
    card: theme === 'dark' 
      ? 'bg-gray-800 border-gray-700 text-white' 
      : 'bg-white border-gray-200 text-gray-900',
    text: {
      primary: theme === 'dark' ? 'text-white' : 'text-gray-900',
      secondary: theme === 'dark' ? 'text-gray-300' : 'text-gray-600',
      muted: theme === 'dark' ? 'text-gray-400' : 'text-gray-500',
    },
    button: {
      primary: theme === 'dark' 
        ? 'bg-blue-600 hover:bg-blue-700 text-white' 
        : 'bg-blue-600 hover:bg-blue-700 text-white',
      secondary: theme === 'dark' 
        ? 'bg-gray-700 hover:bg-gray-600 text-white' 
        : 'bg-gray-200 hover:bg-gray-300 text-gray-700',
      danger: theme === 'dark' 
        ? 'bg-red-600 hover:bg-red-700 text-white' 
        : 'bg-red-600 hover:bg-red-700 text-white',
    },
    input: theme === 'dark' 
      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
      : 'bg-white border-gray-300 text-gray-800 placeholder-gray-500',
    table: {
      header: theme === 'dark' 
        ? 'bg-gray-700 text-gray-300 border-gray-600' 
        : 'bg-gray-100 text-gray-700 border-gray-200',
      row: theme === 'dark' 
        ? 'border-gray-700 hover:bg-gray-700' 
        : 'border-gray-200 hover:bg-gray-50',
    },
    modal: theme === 'dark'
      ? 'bg-gray-800 border-gray-700 text-white'
      : 'bg-white border-gray-200 text-gray-900'
  };

  const fetchMyDocuments = async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/documents/my${searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : ''}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const result = await response.json(); 
        setMyDocuments(result);
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast.error(`Ошибка получения документов: ${errorData.detail || response.statusText}`);
      }
    } catch (error) {
      toast.error('Ошибка сети при получении документов');
      console.error('Ошибка получения документов:', error);
    }
  };

  const fetchSharedDocuments = async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/documents/shared${searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : ''}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setSharedDocuments(await response.json());
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast.error(`Ошибка получения доступных документов: ${errorData.detail || response.statusText}`);
      }
    } catch (error) {
      toast.error('Ошибка сети при получении доступных документов');
      console.error('Ошибка получения доступных документов:', error);
    }
  };

  const fetchStatusDocument = async () => {
    try {
      const url = `${BASE_URL}/api/documents/doc_status`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const result = await response.json();
        console.log('123');
        console.log(result);
        setStatusDoc(result);
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast.error(`Ошибка получения отправленных документов: ${errorData.detail || response.statusText}`);
      }
    } catch (error) {
      toast.error('Ошибка сети при получении отправленных документов');
      console.error('Ошибка получения отправленных документов:', error);
    }
  };

  const fetchSendedDocuments = async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/documents/sended${searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : ''}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const result = await response.json();
        console.log('123');
        console.log(result);
        setSendedDocuments(result);
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast.error(`Ошибка получения отправленных документов: ${errorData.detail || response.statusText}`);
      }
    } catch (error) {
      toast.error('Ошибка сети при получении отправленных документов');
      console.error('Ошибка получения отправленных документов:', error);
    }
  }

  useEffect(() => {
    if (token) {
      fetchSendedDocuments();
    } else {
      console.warn('Токен отсутствует, невозможно загрузить документы.');
    }
  }, [sharedDocuments, myDocuments]);

  const fetchContacts = async () => {
    try {
      const searchParams = new URLSearchParams({ query: searchQueryContacts.trim() });
      const response = await fetch(`${BASE_URL}/contacts?${searchParams.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setContacts(await response.json());
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast.error(`Ошибка получения контактов: ${errorData.detail || response.statusText}`);
      }
    } catch (error) {
      toast.error('Ошибка сети при получении контактов');
      console.error('Ошибка получения контактов:', error);
    }
  };

  const debouncedFetchMyDocuments = debounce(fetchMyDocuments, 300);
  const debouncedFetchSharedDocuments = debounce(fetchSharedDocuments, 300);
  const debouncedFetchContacts = debounce(fetchContacts, 300);

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      toast.error('Выберите файл для загрузки');
      return;
    }
    toast.info('Начало загрузки документа...');

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('title', title);
    try {
      const response = await fetch(`${BASE_URL}/api/documents/documents`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });
      if (response.ok) {
        toast.success('Документ успешно загружен');
        fetchMyDocuments();
        setTitle('');
        setSelectedFile(null);
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast.error(`Ошибка загрузки документа: ${errorData.detail || response.statusText}`);
      }
    } catch (error) {
      toast.error('Ошибка сети при загрузке документа');
      console.error('Ошибка загрузки документа:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleShareDocument = async () => {
    if (!currentDoc || !recipient) {
      toast.error('Выберите документ и получателя');
      return;
    }

    try {
      const response = await fetch(`${BASE_URL}/api/documents/share`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`
        },
        body: new URLSearchParams({
          document_id: currentDoc.id,
          recipient: recipient,
          permission: canEdit ? 'EDIT': canReview ? 'REVIEW': 'VIEW',
          fil_type: currentDoc.file_type,
          title: currentDoc.title
        })
      });
      const response_stat = await fetch(`${BASE_URL}/api/documents/doc_status`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`
        },
        body: new URLSearchParams({
          document_id: currentDoc.id,
          recipient: recipient
        })
      });
      if (response.ok && response_stat.ok) {
        toast.success('Документ успешно отправлен');
        setShareModalOpen(false);
        setRecipient('');
        setCanEdit(false);
        setCanReview(false);
        fetchSharedDocuments();
        fetchSendedDocuments();
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast.error(`Ошибка шаринга документа: ${errorData.detail || response.statusText}`);
      }
    } catch (error) {
      toast.error('Ошибка сети при шаринге документа');
      console.error('Ошибка шаринга документа:', error);
    }
  };

  const updateDocumentStatus = async (docId: string, status: DocumentStatus) => {
    try {
      const response = await fetch(`${BASE_URL}/api/documents/status/${docId}`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(status)
      });

      if (response.ok) {
        fetchSharedDocuments();
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast.error(`Ошибка обновления статуса: ${errorData.detail || response.statusText}`);
      }
    } catch (error) {
      toast.error('Ошибка сети при обновлении статуса');
      console.error('Ошибка обновления статуса:', error);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    Modal.confirm({
        title: 'Подтверждение удаления',
        content: 'Вы уверены, что хотите удалить этот документ?',
        okText: 'Удалить',
        okType: 'danger',
        cancelText: 'Отмена',
        onOk: async () => {
          try {
            const response = await fetch(`${BASE_URL}/api/documents/${docId}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}` },
            });

            if (response.ok) {
              toast.success('Документ успешно удалён');
              fetchMyDocuments();
            } else {
              const errorData = await response.json().catch(() => ({}));
              toast.error(`Ошибка удаления документа: ${errorData.detail || response.statusText}`);
            }
          } catch (error) {
            toast.error('Ошибка сети при удалении документа');
            console.error('Ошибка удаления документа:', error);
          }
        }
      }
    );
  };

  const downloadDocument = async (docId: string, fileName: string, extension: string) => {
    const response = await fetch(`${BASE_URL}/api/documents/download/${docId}`, {
      headers: {'Authorization': `Bearer ${token}`}
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      toast.error(`Ошибка скачивания документа: ${errorData.detail || response.statusText}`);
      return;
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${fileName}${extension}` || docId);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success('Подвердите скачивание в вашем браузере');
    window.URL.revokeObjectURL(url);
  };

  const openInOnlyOffice = async (docId: string, status: DocumentStatus, typeDoc: string) => {
    try {
      typeDoc === 'self' ? '': status === DocumentStatus.PENDING ? updateDocumentStatus(docId, DocumentStatus.VIEWED): '';
      const response = await fetch(`${BASE_URL}/api/documents/onlyoffice/config/${docId}?type_doc=${typeDoc}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Ошибка получения конфигурации OnlyOffice: ${errorData.detail || response.statusText}`);
      }

      const { config, jwtToken } = await response.json();
      
      setOnlyOfficeConfig(config);
      setIsOnlyOfficeModalOpen(true);
      setOnlyOfficeJwtToken(jwtToken);
    }
    catch (error) {
      console.error("Ошибка открытия документа в OnlyOffice:", error);
      toast.error('Не удалось открыть документ в OnlyOffice.');
    }
  };

  const OnlyOfficeModal = ({ 
    isOpen, 
    onClose, 
    config,
    jwtToken 
  }: { 
    isOpen: boolean; 
    onClose: () => void; 
    config: any;
    jwtToken?: string | undefined; 
  }) => {
    const modalContainerRef = useRef<HTMLDivElement>(null);
    const [isFullscreenActive, setIsFullscreenActive] = useState(false);

    useEffect(() => {
      if (!isOpen || !config) return;

      let editorInstance: any = null;

      const initEditor = () => {
        if (window.DocsAPI) {
          try {
            editorInstance = new window.DocsAPI.DocEditor("onlyoffice-editor-container", config, jwtToken );
            console.log("OnlyOffice editor initialized", editorInstance);
          } catch (initError) {
            console.error("Error initializing OnlyOffice editor:", initError);
            toast.error("Ошибка инициализации редактора OnlyOffice");
            onClose();
          }
        } else {
          console.error("OnlyOffice DocsAPI not loaded");
          toast.error("Не удалось загрузить API OnlyOffice");
          onClose();
        }
      };
      const script = document.createElement('script');
      script.src = `${onlyOfficeServerUrl}/web-apps/apps/api/documents/api.js`;
      script.async = true;
      script.onload = () => {
        initEditor();
      };
      script.onerror = () => {
        console.error("Failed to load OnlyOffice API script");
        toast.error("Не удалось загрузить скрипт OnlyOffice");
        onClose();
      };

      document.body.appendChild(script);

      return () => {
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
        if (editorInstance && typeof editorInstance.destroy === 'function') {
          editorInstance.destroy();
          console.log("OnlyOffice editor destroyed");
        }
      };
    }, [isOpen, config, jwtToken]);

  useEffect(() => {
    if (!screenfull.isEnabled) {
      console.warn('Fullscreen mode is not supported by this browser.');
      return;
    }

    const handleFullscreenChange = () => {
      setIsFullscreenActive(screenfull.isEnabled ? screenfull.isFullscreen : false);
    };

    screenfull.on('change', handleFullscreenChange);
    handleFullscreenChange();

    return () => {
      screenfull.off('change', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    if (!screenfull.isEnabled) {
      toast.error('Полноэкранный режим не поддерживается вашим браузером.');
      console.warn('Fullscreen is not enabled/supported.');
      return;
    }

    try {
      await screenfull.toggle();
    } catch (error) {
      console.error('Failed to toggle fullscreen mode:', error);
      toast.error('Не удалось переключить полноэкранный режим.');
    }
  };

    return (
    <div ref={modalContainerRef}>
      <Modal
        title={
          <div className="flex justify-between items-center w-full">
            <span>Редактор OnlyOffice</span>
            <div className="flex items-center space-x-2">
              {screenfull.isEnabled && (
                <Tooltip title={isFullscreenActive ? "Выйти из полноэкранного режима" : "На весь экран"}>
                  <button
                    onClick={toggleFullscreen}
                    className="p-1 -mt-2 rounded mr-5 hover:bg-gray-200 focus:outline-none focus:ring-1 focus:ring-gray-400"
                  >
                    {isFullscreenActive ? (
                      <FullscreenExitOutlined style={{ fontSize: '18px', padding: '0' }}/>
                      
                    ) : (
                      <FullscreenOutlined style={{ fontSize: '18px', padding: '0' }}/>
                    )}
                  </button>
                </Tooltip>
              )}
            </div>
          </div>
        }
        open={isOpen}
        onCancel={onClose}
        footer={null}
        width="calc(100vw - 20px)"
        style={{ top: 10 }}
        styles={{
          body: {
            height: "93vh",
            padding: 0,
            margin: 0,
            overflow: "hidden",
          },
        }}
      >
        <div id="onlyoffice-editor-container" style={{ width: "100%", height: "100%" }}></div>
      </Modal>
    </div>
  );
  };

  const getStatusColor = (status: DocumentStatus) => {
    switch (status) {
      case DocumentStatus.PENDING: return 'orange';
      case DocumentStatus.VIEWED: return 'green';
      case DocumentStatus.EDITED: return 'blue';
      default: return 'default';
    }
  };

  const getStatusText = (status: DocumentStatus) => {
    switch (status) {
      case DocumentStatus.PENDING: return 'Ожидает';
      case DocumentStatus.VIEWED: return 'Просмотрен';
      case DocumentStatus.EDITED: return 'Отредактирован';
      default: return status;
    }
  };

  const getPermissionColor = (permission: DocumentPermission) => {
    switch (permission) {
      case DocumentPermission.VIEW: return 'default';
      case DocumentPermission.EDIT: return 'purple';
      case DocumentPermission.REVIEW: return 'gold';
      default: return 'default';
    }
  };

  const getPermissionText = (permission: DocumentPermission) => {
    switch (permission) {
      case DocumentPermission.VIEW: return 'Просмотр';
      case DocumentPermission.EDIT: return 'Редактирование';
      case DocumentPermission.REVIEW: return 'Рецензирование';
      default: return permission;
    }
  };
  
  useEffect(() => {
    if (token) {
      fetchMyDocuments();
      fetchSharedDocuments();
      fetchContacts();
      fetchStatusDocument();
    } else {
      toast.error('Требуется авторизация');
      navigate('/login');
    }
  }, []);

  useEffect(() => {
    debouncedFetchMyDocuments();
    debouncedFetchSharedDocuments();
  }, [searchQuery]);

  useEffect(() => {
    debouncedFetchContacts();
  }, [searchQueryContacts]);

  const closeOnlyModal = async () => {
    setIsOnlyOfficeModalOpen(false);
    fetchSharedDocuments();
    setOnlyOfficeConfig(null);
    setOnlyOfficeJwtToken(undefined);
  }

  return (
    <div className={`min-h-screen transition-colors duration-300 ${themeClasses.background}`}>
      <ToastContainer position="top-right" autoClose={3000} theme={theme} />
      
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <header className="mb-8">
          <div className="flex justify-between items-start">
            <Link
                to="/dashboard"
                className={`flex text-sm items-center rounded-lg gap-2 px-4 py-2  transition-colors ${theme === 'light' ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'} shadow-lg`}
              >
                <ArrowLeft size={16} />Вернуться на главную
              </Link>
            
            <div className="flex gap-4">
              <div className='text-right'>
                <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Документы</h1>
                <p className={themeClasses.text.secondary}>Управляйте вашими документами и доступом</p>
              </div>
              <button
                onClick={toggleTheme}
                className={`w-12 h-12 rounded-2xl transition-all duration-300 flex items-center justify-center ${
                  theme === 'dark'
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300 hover:text-gray-900'
                }`}
                title={theme === 'dark' ? 'Светлая тема' : 'Темная тема'}
              >
                {theme === 'dark' ? <Sun size={24} weight="regular" /> : <Moon size={24} weight="regular" />}
              </button>
            </div>
          </div>
        </header>

        {/* Upload Section */}
        <div className={`rounded-xl shadow-md p-6 mb-8 ${themeClasses.card}`}>
          <h2 className={`text-xl font-semibold mb-4 ${themeClasses.text.primary}`}>Загрузить новый документ</h2>
          <form onSubmit={handleFileUpload} className="space-y-4">
            <div>
              <label className={`block text-sm font-medium mb-1 ${themeClasses.text.secondary}`}>Название документа</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${themeClasses.input}`}
                placeholder="Введите название"
                required
              />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-1 ${themeClasses.text.secondary}`}>Выберите файл</label>
              <div className="flex items-center space-x-4">
                <label className="flex-1 cursor-pointer">
                  <div className={`flex flex-col items-center justify-center px-6 py-8 border-2 border-dashed rounded-lg transition-colors ${
                    theme === 'dark' 
                      ? 'border-gray-600 hover:border-gray-500' 
                      : 'border-gray-300 hover:border-gray-400'
                  }`}>
                    {selectedFile ? (
                      <span className={`text-sm font-medium ${themeClasses.text.primary}`}>{selectedFile.name}</span>
                    ) : (
                      <>
                        <svg className={`w-10 h-10 mb-2 ${themeClasses.text.muted}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <span className={`text-sm ${themeClasses.text.muted}`}>Перетащите файл или кликните для выбора</span>
                      </>
                    )}
                  </div>
                  <input
                    type="file"
                    onChange={(e) => {
                      setSelectedFile(e.target.files?.[0] || null);
                      setTitle(e.target.files?.[0].name.split('.')[0] || '');
                    }}
                    className="hidden"
                    required
                  />
                </label>
              </div>
            </div>
            <button
              type="submit"
              disabled={isUploading}
              className={`w-full font-medium py-2 px-4 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                isUploading ? 'opacity-50 cursor-not-allowed' : ''
              } ${themeClasses.button.primary}`}
            >
              {isUploading ? 'Загрузка...' : 'Загрузить документ'}
            </button>
          </form>
        </div>

        {/* Navigation Tabs */}
        <div className={`mb-6 border-b ${
          theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
        }`}>
          <nav className="-mb-px flex space-x-8">
            <button
              className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                isOpenMyDocument 
                  ? theme === 'dark'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-blue-500 text-blue-600'
                  : themeClasses.text.muted
              }`}
              onClick={() => {setIsOpenMyDocument(true);setIsOpenSharedDocument(false)}}
            >
              Мои документы
            </button>
            <button 
              className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                isOpenSharedDocument 
                  ? theme === 'dark'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-blue-500 text-blue-600'
                  : themeClasses.text.muted
              }`}
              onClick={() => {setIsOpenMyDocument(false);setIsOpenSharedDocument(true)}}
            >
              Доступные мне
            </button>
          </nav>
        </div>

        {/* My Documents Section */}
        {isOpenMyDocument && (
          <div className="mb-10">
            <div className="flex justify-between items-center mb-4">
              <h2 className={`text-xl font-semibold ${themeClasses.text.primary}`}>Мои документы</h2>
              <div className="relative w-64">
                <input
                  type="text"
                  placeholder="Поиск документов..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${themeClasses.input}`}
                />
                <svg className={`absolute left-3 top-2.5 h-5 w-5 ${themeClasses.text.muted}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {myDocuments.length === 0 ? (
              <div className={`rounded-xl shadow-sm p-8 text-center ${themeClasses.card}`}>
                <svg className={`mx-auto h-12 w-12 ${themeClasses.text.muted}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className={`mt-2 text-sm font-medium ${themeClasses.text.primary}`}>Нет документов</h3>
                <p className={`mt-1 text-sm ${themeClasses.text.secondary}`}>Загрузите свой первый документ, используя форму выше.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className={themeClasses.table.header}>
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Название</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Дата создания</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Статус</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider">Действия</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${theme === 'dark' ? 'divide-gray-700' : 'divide-gray-200'}`}>
                    {myDocuments.map((doc) => (
                      <tr key={doc.id} className={themeClasses.table.row}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className={`flex-shrink-0 h-10 w-10 rounded-lg flex items-center justify-center ${
                              theme === 'dark' ? 'bg-blue-900' : 'bg-blue-100'
                            }`}>
                              <svg className={`h-6 w-6 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            </div>
                            <div className="ml-4">
                              <div className={`text-sm font-medium ${themeClasses.text.primary}`}>{doc.title}</div>
                              <div className={`text-sm ${themeClasses.text.secondary}`}>Владелец: {doc.owner_username}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className={`text-sm ${themeClasses.text.primary}`}>{new Date(doc.created_at).toLocaleDateString()}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Popover
                            placement="right"
                            title={<span className="font-medium">Переданные файлы</span>}
                            content={
                              sendedDocuments && sendedDocuments.length > 0 ? (
                              <div className="max-h-96 overflow-y-auto w-80">
                                <List
                                  dataSource={sendedDocuments.filter((sendDoc) => sendDoc.document_id === doc.id)}
                                  renderItem={(sendDoc) => (
                                    <List.Item className="!px-0 !py-1 flex-col items-start hover:bg-gray-100">
                                      <div className="flex items-start w-full">
                                        <FileOutlined className="mt-1 mr-2 flex-shrink-0 text-gray-500" />
                                        <div className="flex-1 min-w-0">
                                          <div className="flex justify-between items-start w-full">
                                              {sendDoc.title}
                                            <Tag color={getStatusColor(sendDoc.status)} className="flex-shrink-0 ml-1">
                                              {getStatusText(sendDoc.status)}
                                            </Tag>  
                                          </div>
                                          <div className="flex justify-between items-center w-full text-xs text-gray-500 mt-1">
                                            <span className="truncate mr-2">@{sendDoc.recipient_username}</span>
                                            <Tag color={getPermissionColor(sendDoc.permission)} className="flex-shrink-0 ml-1">
                                              {getPermissionText(sendDoc.permission)}
                                            </Tag>
                                          </div>
                                            {new Date(sendDoc.shared_at).toLocaleString('ru-RU')}
                                        </div>
                                      </div>
                                    </List.Item>
                                  )}
                                />
                              </div>
                            ) : (
                              <div className="text-center py-4 text-gray-500">
                                Нет отправленных документов
                              </div>
                            )
                          }
                            trigger="hover"
                          >
                            <button className={`${theme === 'dark' ? 'text-blue-400 hover:text-blue-300' : 'text-blue-500 hover:text-blue-700'} focus:outline-none`}>
                              Просмотреть<FileOutlined />
                            </button>
                          </Popover>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => downloadDocument(doc.id, doc.title, doc.file_type)}
                              className={`${theme === 'dark' ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-900'}`}
                            >
                              Скачать
                            </button>
                            <button
                              onClick={() => {
                                setCurrentDoc(doc);
                                setShareModalOpen(true);
                              }}
                              className={`${theme === 'dark' ? 'text-indigo-400 hover:text-indigo-300' : 'text-indigo-600 hover:text-indigo-900'}`}
                            >
                              Поделиться
                            </button>
                            <button
                              onClick={() => openInOnlyOffice(doc.id, doc.status, 'self')}
                              className={`text-sm font-medium ${
                                theme === 'dark' ? 'text-indigo-400 hover:text-indigo-300' : 'text-indigo-600 hover:text-indigo-800'
                              }`}
                            >
                              Открыть
                            </button>
                            <button
                              onClick={() => handleDeleteDocument(doc.id)}
                              className={`${theme === 'dark' ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-900'}`}
                            >
                              Удалить
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Shared Documents Section */}
        {isOpenSharedDocument && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className={`text-xl font-semibold ${themeClasses.text.primary}`}>Доступные мне документы</h2>
              <div className="relative w-64">
                <input
                  type="text"
                  placeholder="Поиск документов..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${themeClasses.input}`}
                />
                <svg className={`absolute left-3 top-2.5 h-5 w-5 ${themeClasses.text.muted}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {sharedDocuments.length === 0 ? (
              <div className={`rounded-xl shadow-sm p-8 text-center ${themeClasses.card}`}>
                <svg className={`mx-auto h-12 w-12 ${themeClasses.text.muted}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                </svg>
                <h3 className={`mt-2 text-sm font-medium ${themeClasses.text.primary}`}>Нет доступных документов</h3>
                <p className={`mt-1 text-sm ${themeClasses.text.secondary}`}>Вам пока не предоставили доступ к документам.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sharedDocuments.map((item, index) => (
                  <div key={`${item.document_id}_${item.recipient_username}_${index}`} className={`rounded-xl shadow-sm overflow-hidden border hover:shadow-md transition-shadow ${
                    theme === 'dark' 
                      ? 'bg-gray-800 border-gray-700 hover:border-gray-600' 
                      : 'bg-white border-gray-100 hover:border-gray-200'
                  }`}>
                    <div className="p-5">
                      <div className="flex items-start">
                        <div className={`flex-shrink-0 h-10 w-10 rounded-lg flex items-center justify-center ${
                          theme === 'dark' ? 'bg-indigo-900' : 'bg-indigo-100'
                        }`}>
                          <svg className={`h-6 w-6 ${theme === 'dark' ? 'text-indigo-400' : 'text-indigo-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                          </svg>
                        </div>
                        <div className="ml-4 flex-1">
                          <h3 className={`text-lg font-medium ${themeClasses.text.primary}`}>{item.title}</h3>
                          <p className={`text-sm mt-1 ${themeClasses.text.secondary}`}>От: <strong>{item.owner_username}</strong></p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                              statusDoc[item.document_id] === DocumentStatus.PENDING ? 
                                theme === 'dark' ? 'bg-yellow-900 text-yellow-200' : 'bg-yellow-100 text-yellow-800' :
                              statusDoc[item.document_id] === DocumentStatus.VIEWED ? 
                                theme === 'dark' ? 'bg-green-900 text-green-200' : 'bg-green-100 text-green-800' :
                                theme === 'dark' ? 'bg-blue-900 text-blue-200' : 'bg-blue-100 text-blue-800'
                            }`}>
                              {statusDoc[item.document_id] === DocumentStatus.PENDING ? 'Не просмотрено' : 
                               statusDoc[item.document_id] === DocumentStatus.VIEWED ? 'Просмотрено' : 'Отредактировано'}
                            </span>
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                              item.permission === DocumentPermission.EDIT ? 
                                theme === 'dark' ? 'bg-purple-900 text-purple-200' : 'bg-purple-100 text-purple-800' :
                              item.permission === DocumentPermission.REVIEW ?
                                theme === 'dark' ? 'bg-yellow-900 text-yellow-200' : 'bg-yellow-100 text-yellow-800' :
                                theme === 'dark' ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {item.permission === DocumentPermission.EDIT ? 'Редактирование' : item.permission === DocumentPermission.REVIEW ? 'Рецензирование': 'Только просмотр'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className={`px-5 py-3 border-t ${
                      theme === 'dark' ? 'bg-gray-750 border-gray-700' : 'bg-gray-50 border-gray-100'
                    }`}>
                      <span className={`text-xs ${themeClasses.text.muted}`}>
                        Доступ предоставлен: {new Date(item.shared_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className={`px-5 py-3 border-t ${
                      theme === 'dark' ? 'bg-gray-750 border-gray-700' : 'bg-gray-50 border-gray-100'
                    } flex justify-end space-x-2`}>
                      <button
                        onClick={() => downloadDocument(item.document_id, item.title, item.file_type)}
                        className={`text-sm font-medium ${
                          theme === 'dark' ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-800'
                        }`}
                      >
                        Скачать
                      </button>
                      <button
                        onClick={() => updateDocumentStatus(
                          item.document_id, 
                          item.permission === DocumentPermission.EDIT ? DocumentStatus.EDITED : DocumentStatus.VIEWED
                        )}
                        className={`text-sm font-medium ${
                          theme === 'dark' ? 'text-indigo-400 hover:text-indigo-300' : 'text-indigo-600 hover:text-indigo-800'
                        }`}
                      >
                        {item.permission === DocumentPermission.EDIT ? 'Отметить как отредактировано' : 'Отметить как просмотрено'}
                      </button>
                      <button
                        onClick={() => openInOnlyOffice(item.document_id, item.status, 'get')}
                        className={`text-sm font-medium ${
                          theme === 'dark' ? 'text-indigo-400 hover:text-indigo-300' : 'text-indigo-600 hover:text-indigo-800'
                        }`}
                      >
                        Открыть
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Share Modal */}
        {shareModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className={`rounded-2xl shadow-xl w-full max-w-md ${themeClasses.modal}`}>
              <div className="p-6">
                <div className="flex justify-between items-start">
                  <h2 className={`text-xl font-semibold ${themeClasses.text.primary}`}>Поделиться документом</h2>
                  <button
                    onClick={() => setShareModalOpen(false)}
                    className={themeClasses.text.muted}
                  >
                    <CloseOutlined className="h-6 w-6" />
                  </button>
                </div>
                
                <div className="mt-4">
                  <p className={`text-sm ${themeClasses.text.secondary}`}>Документ:</p>
                  <p className={`font-medium ${themeClasses.text.primary}`}>{currentDoc?.title}</p>
                </div>
                
                <div className="mt-6">
                  <label className={`block text-sm font-medium mb-1 ${themeClasses.text.secondary}`}>Выберите пользователя</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQueryContacts}
                      onChange={(e) => {
                        setSearchQueryContacts(e.target.value);
                        debouncedFetchContacts();
                      }}
                      className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${themeClasses.input}`}
                      placeholder="Начните вводить имя"
                    />
                    <svg className={`absolute right-3 top-2.5 h-5 w-5 ${themeClasses.text.muted}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  
                  <div className={`mt-2 max-h-60 overflow-y-auto border rounded-lg ${
                    theme === 'dark' ? 'border-gray-600 bg-gray-700' : 'border-gray-200 bg-white'
                  }`}>
                    {contacts.length > 0 ? (
                      contacts.map((contact) => (
                        <div 
                          key={contact.id}
                          onClick={() => setRecipient(contact.id)}
                          className={`p-3 cursor-pointer ${
                            recipient === contact.id 
                              ? theme === 'dark' ? 'bg-blue-900' : 'bg-blue-100'
                              : theme === 'dark' ? 'hover:bg-gray-600' : 'hover:bg-gray-100'
                          }`}
                        >
                          <div className="flex items-center">
                            <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${
                              theme === 'dark' ? 'bg-gray-600 text-gray-300' : 'bg-gray-200 text-gray-600'
                            }`}>
                              {contact.displayName?.charAt(0) || ''}
                            </div>
                            <div className="ml-3">
                              <p className={`text-sm font-medium ${themeClasses.text.primary}`}>{contact.displayName}</p>
                              <p className={`text-sm ${themeClasses.text.secondary}`}>@{contact.id}</p>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-4 text-center text-sm text-gray-500">
                        Пользователи не найдены
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="mt-6">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={canReview}
                      onChange={(e) => setCanReview(e.target.checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className={`ml-2 text-sm ${themeClasses.text.secondary}`}>Разрешить <strong>рецензирование</strong></span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={canEdit}
                      onChange={(e) => setCanEdit(e.target.checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className={`ml-2 text-sm ${themeClasses.text.secondary}`}>Разрешить <strong>редактирование</strong></span>
                  </label>
                </div>
              </div>
              
              <div className={`px-6 py-4 rounded-b-2xl flex justify-end space-x-3 ${
                theme === 'dark' ? 'bg-gray-750' : 'bg-gray-50'
              }`}>
                <button
                  onClick={() => setShareModalOpen(false)}
                  className={`px-4 py-2 border rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                    theme === 'dark'
                      ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  Отмена
                </button>
                <button
                  onClick={handleShareDocument}
                  disabled={!recipient}
                  className={`px-4 py-2 rounded-lg text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                    recipient ? themeClasses.button.primary : 'bg-blue-300 cursor-not-allowed'
                  }`}
                >
                  Поделиться
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* OnlyOffice Modal */}
      {isOnlyOfficeModalOpen && (
        <OnlyOfficeModal
          isOpen={isOnlyOfficeModalOpen}
          onClose={closeOnlyModal}
          config={onlyOfficeConfig}
          jwtToken={onlyOfficeJwtToken}
        />
      )}
    </div>
  );
};

export default DocumentsPage;