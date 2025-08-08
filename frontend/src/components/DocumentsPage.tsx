import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { debounce } from 'lodash';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { DocumentStatus, DocumentPermission } from '/home/msa/corp_portal/frontend/models/documentModels';
import { Modal } from 'antd';

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
  recipient: string;
  permission: DocumentPermission;
  shared_at: string;
  status: DocumentStatus;
  title: string;
  owner_username: string;
  file_path: string;
  file_type: string;
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://192.1.66.117:8000'; // Изменено на порт 8000

const DocumentsPage: React.FC = () => {
  const [myDocuments, setMyDocuments] = useState<Document[]>([]);
  const [sharedDocuments, setSharedDocuments] = useState<SharedDocument[]>([]);
  const [contacts, setContacts] = useState<User[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [currentDoc, setCurrentDoc] = useState<Document | null>(null);
  const [recipient, setRecipient] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchQueryContacts, setSearchQueryContacts] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isOpenMyDocument, setIsOpenMyDocument] = useState(true);
  const [isOpenSharedDocument, setIsOpenSharedDocument] = useState(false);
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
        toast.error(`Ошибка получения общих документов: ${errorData.detail || response.statusText}`);
      }
    } catch (error) {
      toast.error('Ошибка сети при получении общих документов');
      console.error('Ошибка получения общих документов:', error);
    }
  };

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
          permission: canEdit ? 'EDIT': 'VIEW',
          fil_type: currentDoc.file_type,
          title: currentDoc.title
        })
      });

      if (response.ok) {
        toast.success('Документ успешно отправлен');
        setShareModalOpen(false);
        setRecipient('');
        setCanEdit(false);
        fetchSharedDocuments();
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
      console.log(status);
      const response = await fetch(`${BASE_URL}/api/documents/status/${docId}`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(status)
      });

      if (response.ok) {
        toast.success('Статус документа обновлён');
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
    // window.open(`${BASE_URL}/api/documents/download/${docId}`, '_blank');
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

  useEffect(() => {
    if (token) {
      fetchMyDocuments();
      fetchSharedDocuments();
      fetchContacts();
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

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <ToastContainer position="top-right" autoClose={3000} />
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">Документы</h1>
              <p className="text-gray-600">Управляйте вашими документами и доступом</p>
            </div>
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <svg className="h-5 w-5 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Назад в Dashboard
            </button>
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
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          doc.status === DocumentStatus.PENDING ? 'bg-yellow-100 text-yellow-800' :
                          doc.status === DocumentStatus.VIEWED ? 'bg-green-100 text-green-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {doc.status === DocumentStatus.PENDING ? 'Не просмотрено' : 
                           doc.status === DocumentStatus.VIEWED ? 'Просмотрено' : 'Отредактировано'}
                        </span>
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
              {sharedDocuments.map((item) => (
                <div key={`${item.document_id}_${item.recipient}`} className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100 hover:shadow-md transition-shadow">
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
                            item.status === DocumentStatus.PENDING ? 'bg-yellow-100 text-yellow-800' :
                            item.status === DocumentStatus.VIEWED ? 'bg-green-100 text-green-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {item.status === DocumentStatus.PENDING ? 'Не просмотрено' : 
                             item.status === DocumentStatus.VIEWED ? 'Просмотрено' : 'Отредактировано'}
                          </span>
                          <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                            item.permission === DocumentPermission.EDIT ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {item.permission === DocumentPermission.EDIT ? 'Редактирование' : 'Только просмотр'}
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
                      checked={canEdit}
                      onChange={(e) => setCanEdit(e.target.checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700">Разрешить редактирование</span>
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
    </div>
  );
};

export default DocumentsPage;