import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { debounce } from 'lodash';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {  DocumentStatus, DocumentPermission } from '../../models/documentModels';
import { Modal, Tooltip, Popover, Button, List, Tag } from 'antd';
import type { PopoverProps } from 'antd';
import screenfull from 'screenfull';
import { CloseOutlined, FileOutlined, FullscreenExitOutlined, FullscreenOutlined } from '@ant-design/icons';

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

  const navigate = useNavigate();
  const token = localStorage.getItem('token');

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
        setStatusDoc(result); // Это уже будет объект { [document_id]: status }
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
  
  const showBrowserNotification = (title: string, options?: NotificationOptions) => {
    // Проверяем поддержку браузером
    if (!("Notification" in window)) {
      console.log("Браузер не поддерживает уведомления.");
      toast.info("Браузер не поддерживает уведомления на рабочем столе.");
      return;
    }

    // Если разрешение уже получено, показываем уведомление
    if (Notification.permission === "granted") {
      new Notification(title, options);
    }
    // Если разрешение не запрашивали, запрашиваем его
    else if (Notification.permission !== "denied") {
      Notification.requestPermission().then((permission) => {
        // Если пользователь дал разрешение, показываем уведомление
        if (permission === "granted") {
          new Notification(title, options);
        } else {
          // Пользователь запретил уведомления
          console.log("Пользователь запретил уведомления.");
          toast.info("Уведомления на рабочем столе отключены пользователем.");
        }
      }).catch((err) => {
        console.error("Ошибка запроса разрешения на уведомления:", err);
        toast.error("Ошибка при запросе разрешения на уведомления.");
      });
    }
    // Если пользователь запретил уведомления
    else {
      console.log("Уведомления заблокированы пользователем.");
      toast.info("Уведомления на рабочем столе отключены. Проверьте настройки браузера.");
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!selectedFile) {
    toast.error('Выберите файл для загрузки');
    return;
  }
  toast.info('Начало загрузки документа...');

  showBrowserNotification("Загрузка документа", {
    body: `Началась загрузка файла: ${selectedFile.name || title}`,
    icon: "/favicon.ico" 
  });
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
      showBrowserNotification("Загрузка завершена", {
        body: `Файл "${title || selectedFile.name}" успешно загружен.`,
        icon: "/favicon.ico"
      });
      fetchMyDocuments();
      setTitle('');
      setSelectedFile(null);
    } else {
      const errorData = await response.json().catch(() => ({}));
      toast.error(`Ошибка загрузки документа: ${errorData.detail || response.statusText}`);
      showBrowserNotification("Ошибка загрузки", {
        body: `Не удалось загрузить файл "${title || selectedFile.name}".`,
        icon: "/favicon.ico"
      });
    }
  } catch (error) {
    toast.error('Ошибка сети при загрузке документа');
    showBrowserNotification("Ошибка сети", {
        body: `Ошибка сети при загрузке файла "${title || selectedFile.name}".`,
        icon: "/favicon.ico" 
    });
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
      //создаем элемент в таблице document_shared
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
      //создаем элемент в таблице documents_status
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
        // toast.success('Статус документа обновлён');
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
  // ---------------------------------------
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
    // const myHeaders = new Headers();
    // myHeaders.append("Content-Type", "multipart/form-data");
    // myHeaders.append("Accept", "application/json");

    // const formdata = new FormData();
    // formdata.append("Forcesave", "true");
    // // formdata.append("File", fileInput.files[0], "file");
    // formdata.append("FileExtension", ".docx");
    // formdata.append("DownloadUri", `http://192.1.66.117:8000/api/documents/download/${onlyOfficeConfig["document"]["key"]}`);

    // const requestOptions:RequestInit = {
    //   method: "PUT",
    //   headers: myHeaders,
    //   body: formdata,
    //   redirect: "follow"
    // };

    // fetch(`${onlyOfficeServerUrl}/2.0/files/file/7b5761f9-311e-4e75-ba89-4e28edffb3e0/saveediting`, requestOptions)
    //   .then((response) => response.text())
    //   .then((result) => console.log(result))
    //   .catch((error) => console.error(error));
    setIsOnlyOfficeModalOpen(false);
    fetchSharedDocuments();
    setOnlyOfficeConfig(null);
    setOnlyOfficeJwtToken(undefined);
  }
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <ToastContainer position="top-right" autoClose={3000} />
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <div className="flex justify-between items-start">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <svg className="h-5 w-5 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Назад в Dashboard
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-800">Документы</h1>
              <p className="text-gray-600">Управляйте вашими документами и доступом</p>
            </div>
          </div>
        </header>

        <div className="bg-white rounded-xl shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Загрузить новый документ</h2>
          <form onSubmit={handleFileUpload} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Название документа</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Введите название"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Выберите файл</label>
              <div className="flex items-center space-x-4">
                <label className="flex-1 cursor-pointer">
                  <div className="flex flex-col items-center justify-center px-6 py-8 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 transition-colors">
                    {selectedFile ? (
                      <span className="text-sm font-medium text-gray-700">{selectedFile.name}</span>
                    ) : (
                      <>
                        <svg className="w-10 h-10 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <span className="text-sm text-gray-500">Перетащите файл или кликните для выбора</span>
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
              className={`w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isUploading ? 'Загрузка...' : 'Загрузить документ'}
            </button>
          </form>
        </div>

        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              className={`border-b-2 px-4 py-3 text-sm font-medium 
                ${isOpenMyDocument ? 'border-blue-500 text-blue-600' 
                : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'}
                `}
              onClick={() => {setIsOpenMyDocument(true);setIsOpenSharedDocument(false)}}
            >
              Мои документы
            </button>
            <button 
              className={`border-b-2 px-4 py-3 text-sm font-medium 
                ${isOpenSharedDocument ? 'border-blue-500 text-blue-600' 
                : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'}
                `}
              onClick={() => {setIsOpenMyDocument(false);setIsOpenSharedDocument(true)}}
            >
              Доступные мне
            </button>
          </nav>
        </div>

        {isOpenMyDocument && (<div className="mb-10">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Мои документы</h2>
            <div className="relative w-64">
              <input
                type="text"
                placeholder="Поиск документов..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <svg className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {myDocuments.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-8 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">Нет документов</h3>
              <p className="mt-1 text-sm text-gray-500">Загрузите свой первый документ, используя форму выше.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Название</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Дата создания</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Статус</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Действия</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {myDocuments.map((doc) => (
                    <tr key={doc.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 bg-blue-100 rounded-lg flex items-center justify-center">
                            <svg className="h-6 w-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">{doc.title}</div>
                            <div className="text-sm text-gray-500">Владелец: {doc.owner_username}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{new Date(doc.created_at).toLocaleDateString()}</div>
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
                        <button className="text-blue-500 hover:text-blue-700 focus:outline-none">
                          Просмотреть<FileOutlined />
                        </button>
                      </Popover> 
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => downloadDocument(doc.id, doc.title, doc.file_type)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            Скачать
                          </button>
                          <button
                            onClick={() => {
                              setCurrentDoc(doc);
                              setShareModalOpen(true);
                            }}
                            className="text-indigo-600 hover:text-indigo-900"
                          >
                            Поделиться
                          </button>
                          <button
                            onClick={() => openInOnlyOffice(doc.id, doc.status, 'self')}
                            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            Открыть
                          </button>
                          <button
                            onClick={() => handleDeleteDocument(doc.id)}
                            className="text-red-600 hover:text-red-900"
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
        </div>)}

        {isOpenSharedDocument && (<div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Доступные мне документы</h2>
            <div className="relative w-64">
              <input
                type="text"
                placeholder="Поиск документов..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <svg className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>

          {sharedDocuments.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm p-8 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">Нет доступных документов</h3>
              <p className="mt-1 text-sm text-gray-500">Вам пока не предоставили доступ к документам.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sharedDocuments.map((item, index) => (
                <div key={`${item.document_id}_${item.recipient_username}_${index}`} className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100 hover:shadow-md transition-shadow">
                  <div className="p-5">
                    <div className="flex items-start">
                      <div className="flex-shrink-0 h-10 w-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                        <svg className="h-6 w-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                        </svg>
                      </div>
                      <div className="ml-4 flex-1">
                        <h3 className="text-lg font-medium text-gray-900">{item.title}</h3>
                        <p className="text-sm text-gray-500 mt-1">От: <strong>{item.owner_username}</strong></p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            statusDoc[item.document_id] === DocumentStatus.PENDING ? 'bg-yellow-100 text-yellow-800' :
                            statusDoc[item.document_id] === DocumentStatus.VIEWED ? 'bg-green-100 text-green-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {statusDoc[item.document_id] === DocumentStatus.PENDING ? 'Не просмотрено' : 
                             statusDoc[item.document_id] === DocumentStatus.VIEWED ? 'Просмотрено' : 'Отредактировано'}
                          </span>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            item.permission === DocumentPermission.EDIT ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {item.permission === DocumentPermission.EDIT ? 'Редактирование' : item.permission === DocumentPermission.REVIEW ? 'Рецензирование': 'Только просмотр'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-between">
                    <span className="text-xs text-gray-500">
                      Доступ предоставлен: {new Date(item.shared_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end space-x-2">
                    <button
                      onClick={() => downloadDocument(item.document_id, item.title, item.file_type)}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Скачать
                    </button>
                    <button
                      onClick={() => updateDocumentStatus(
                        item.document_id, 
                        item.permission === DocumentPermission.EDIT ? DocumentStatus.EDITED : DocumentStatus.VIEWED
                      )}
                      className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      {item.permission === DocumentPermission.EDIT ? 'Отметить как отредактировано' : 'Отметить как просмотрено'}
                    </button>
                    <button
                      onClick={() => openInOnlyOffice(item.document_id, item.status, 'get')}
                      className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      Открыть
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>)}

        {shareModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
              <div className="p-6">
                <div className="flex justify-between items-start">
                  <h2 className="text-xl font-semibold text-gray-900">Поделиться документом</h2>
                  <button
                    onClick={() => setShareModalOpen(false)}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                <div className="mt-4">
                  <p className="text-sm text-gray-500">Документ:</p>
                  <p className="font-medium text-gray-900">{currentDoc?.title}</p>
                </div>
                
                <div className="mt-6">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Выберите пользователя</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={searchQueryContacts}
                      onChange={(e) => {
                        setSearchQueryContacts(e.target.value);
                        debouncedFetchContacts();
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Начните вводить имя"
                    />
                    <svg className="absolute right-3 top-2.5 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  
                  <div className="mt-2 max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
                    {contacts.length > 0 ? (
                      contacts.map((contact) => (
                        <div 
                          key={contact.id}
                          onClick={() => setRecipient(contact.id)}
                          className={`p-3 cursor-pointer hover:bg-gray-100 ${
                            recipient === contact.id ? 'bg-blue-100' : ''
                          }`}
                        >
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10 bg-gray-200 rounded-full flex items-center justify-center text-gray-600">
                              {/* {contact.displayName || ''} */}
                            </div>
                            <div className="ml-3">
                              <p className="text-sm font-medium text-gray-900">{contact.displayName}</p>
                              <p className="text-sm text-gray-500">@{contact.id}</p>
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
                    <span className="ml-2 text-sm text-gray-700">Разрешить <strong>рецензирование</strong></span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={canEdit}
                      onChange={(e) => setCanEdit(e.target.checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">Разрешить <strong>редактирование</strong></span>
                  </label>
                </div>
              </div>
              
              <div className="px-6 py-4 bg-gray-50 rounded-b-2xl flex justify-end space-x-3">
                <button
                  onClick={() => setShareModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Отмена
                </button>
                <button
                  onClick={handleShareDocument}
                  disabled={!recipient}
                  className={`px-4 py-2 rounded-lg text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                    recipient ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-300 cursor-not-allowed'
                  }`}
                >
                  Поделиться
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
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