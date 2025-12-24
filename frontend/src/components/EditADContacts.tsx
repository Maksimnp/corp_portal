import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Card, Spin, Form, Modal, Table, Space, message, Select } from 'antd';
import { ArrowLeftOutlined, SaveOutlined, CheckCircleOutlined, CloseCircleOutlined, EditOutlined, SearchOutlined, PlusOutlined, DeleteOutlined, PauseOutlined } from '@ant-design/icons';
import { useAuth } from '../pages/AuthContext';
import { useTheme } from '../hooks/ThemeContext';

interface Contact {
  id: string;
  displayName?: string;
  email?: string;
  phone_internal?: string;
  phone_city?: string;
  phone_mobile?: string;
  department?: string;
  position?: string;
  password?: string;
  isFrozen?: boolean;
  groups?: string[];
  sam_account_name?: string;
}

// Улучшенная функция для форматирования номера телефона для отображения
const formatPhoneNumber = (phone: string | undefined, minLength = 8): string | null => {
  if (!phone) return null;
  
  // Удаляем все нецифровые символы
  const cleaned = phone.replace(/\D/g, '');
  
  // Форматируем только если введено достаточно цифр
  if (cleaned.length >= minLength) {
    if (cleaned.startsWith('375') && cleaned.length === 12) {
      return `+375 (${cleaned.slice(3, 5)}) ${cleaned.slice(5, 8)}-${cleaned.slice(8, 10)}-${cleaned.slice(10, 12)}`;
    } else if (cleaned.startsWith('80') && cleaned.length === 11) {
      return `+375 (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7, 9)}-${cleaned.slice(9, 11)}`;
    } else if (cleaned.startsWith('+375') && cleaned.length === 13) {
      return `+375 (${cleaned.slice(4, 6)}) ${cleaned.slice(6, 9)}-${cleaned.slice(9, 11)}-${cleaned.slice(11, 13)}`;
    }
  }
  
  return phone;
};

const formatPhoneNumberForServer = (phone: string | undefined): string | null => {
  if (!phone) return null;
  
  // Удаляем все нецифровые символы
  const cleaned = phone.replace(/\D/g, '');
  
  // Преобразуем разные форматы в +375XXXXXXXXX
  if (cleaned.startsWith('80') && cleaned.length === 11) {
    return `+375${cleaned.slice(2)}`;
  } else if (cleaned.startsWith('375') && cleaned.length === 12) {
    return `+${cleaned}`;
  } else if (cleaned.startsWith('+375') && cleaned.length === 13) {
    return cleaned;
  } else if (cleaned.length >= 4) { // Минимум 4 цифры для внутренних номеров
    return cleaned;
  }
  
  return phone;
};

// Функция для получения инициалов
const getInitials = (contact: Contact): string => {
  return contact.displayName?.[0]?.toUpperCase() || '';
};

const EditADContacts: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [departments, setDepartments] = useState<string[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [modal, setModal] = useState<{
    visible: boolean;
    type: 'success' | 'error' | 'info' | 'edit' | 'create';
    message?: string;
    contact?: Contact;
  }>({ visible: false, type: 'info', message: '', contact: undefined });
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { token, isAdmin, logout } = useAuth();

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  useEffect(() => {
    if (token) {
      fetchContacts();
      fetchDepartments();
      fetchGroups();
    } else {
      setModal({
        visible: true,
        type: 'error',
        message: 'Токен аутентификации не найден. Пожалуйста, войдите снова.',
      });
      logout();
      setTimeout(() => navigate('/'), 2000);
    }
  }, [token, navigate, logout]);

  useEffect(() => {
    const filtered = contacts
      .filter((contact) =>
        [contact.displayName, contact.email, contact.sam_account_name]
          .filter(Boolean)
          .some((field) => field?.toLowerCase().includes(searchQuery.toLowerCase()))
      )
      .sort((a, b) => {
        const nameA = a.displayName || '';
        const nameB = b.displayName || '';
        return nameA.localeCompare(nameB, 'ru', { sensitivity: 'base' });
      });
    setFilteredContacts(filtered);
  }, [searchQuery, contacts]);

  const showModal = (type: 'success' | 'error' | 'info' | 'edit' | 'create', message?: string, contact?: Contact) => {
    setModal({ visible: true, type, message, contact });
    
    if (type === 'edit' && contact) {
      console.log('ontact.sam_account_name', contact)
      form.setFieldsValue({
        displayName: contact.displayName || '',
        email: contact.email || '',
        phone_internal: formatPhoneNumber(contact.phone_internal),
        phone_city: formatPhoneNumber(contact.phone_city),
        phone_mobile: formatPhoneNumber(contact.phone_mobile),
        department: contact.department || '',
        position: contact.position || '',
        groups: contact.groups || [],
        sam_account_name: contact.id || '',
      });
    } else if (type === 'create') {
      form.resetFields();
    }
  };

  const hideModal = () => {
    setModal({ ...modal, visible: false, contact: undefined });
    form.resetFields();
  };

  const fetchContacts = async () => {
    setIsLoading(true);
    try {
      if (!token) {
        throw new Error('Токен аутентификации не найден.');
      }

      const response = await fetch(`${API_BASE_URL}/contacts?query=*`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        let errorMessage = `Ошибка HTTP: ${response.status}`;
        let errorDetail = null;
        try {
          const errorData = await response.json();
          errorDetail = errorData.detail || errorData.message || null;
        } catch (e) {}

        if (response.status === 401) {
          errorMessage = 'Сессия истекла. Пожалуйста, войдите снова.';
          logout();
          setTimeout(() => navigate('/'), 2000);
        } else if (response.status === 403) {
          errorMessage = 'Доступ запрещен.';
        } else if (response.status === 500) {
          errorMessage = 'Внутренняя ошибка сервера. Попробуйте позже.';
        } else if (errorDetail) {
          errorMessage = `Ошибка: ${errorDetail}`;
        }

        throw new Error(errorMessage);
      }

      const data: Contact[] = await response.json();
      setContacts(data);
      setFilteredContacts(data.sort((a, b) => {
        const nameA = a.displayName || '';
        const nameB = b.displayName || '';
        return nameA.localeCompare(nameB, 'ru', { sensitivity: 'base' });
      }));
    } catch (err: any) {
      console.error('[EditADContacts] Ошибка при загрузке контактов:', err);
      showModal('error', err.message || 'Неизвестная ошибка при загрузке контактов.');
      setContacts([]);
      setFilteredContacts([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDepartments = async () => {
    try {
      if (!token) {
        throw new Error('Токен аутентификации не найден.');
      }

      const response = await fetch(`${API_BASE_URL}/contacts/departments`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        let errorMessage = `Ошибка HTTP: ${response.status}`;
        if (response.status === 401) {
          errorMessage = 'Сессия истекла. Пожалуйста, войдите снова.';
          logout();
          setTimeout(() => navigate('/'), 2000);
        } else if (response.status === 404) {
          errorMessage = 'Эндпоинт /contacts/departments не найден. Используйте ручной ввод.';
          setDepartments([]);
          return;
        } else if (response.status === 500) {
          errorMessage = 'Внутренняя ошибка сервера при загрузке департаментов.';
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      if (!Array.isArray(data)) {
        throw new Error('Получены неверные данные о департаментах');
      }
      setDepartments(data.filter(dept => dept && typeof dept === 'string'));
    } catch (err: any) {
      console.error('[EditADContacts] Ошибка при загрузке департаментов:', err);
      showModal('error', err.message || 'Неизвестная ошибка при загрузке департаментов.');
      setDepartments([]);
    }
  };

  const fetchGroups = async () => {
    try {
      if (!token) {
        throw new Error('Токен аутентификации не найден.');
      }
      const response = await fetch(`${API_BASE_URL}/contacts/groups`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        let errorMessage = `Ошибка HTTP: ${response.status}`;
        if (response.status === 401) {
          errorMessage = 'Сессия истекла. Пожалуйста, войдите снова.';
          logout();
          setTimeout(() => navigate('/'), 2000);
        } else if (response.status === 404) {
          setGroups([]);
          return;
        } else if (response.status === 500) {
          errorMessage = 'Внутренняя ошибка сервера при загрузке групп.';
        }
        throw new Error(errorMessage);
      }
      const data = await response.json();
      if (!Array.isArray(data)) {
        throw new Error('Получены неверные данные о группах');
      }
      setGroups(data.filter(group => group && typeof group === 'string'));
    } catch (err: any) {
      console.error('[EditADContacts] Ошибка при загрузке групп:', err);
      showModal('error', err.message || 'Неизвестная ошибка при загрузке групп.');
      setGroups([]);
    }
  };

  const checkUsernameAvailability = async (username: string) => {
    try {
      if (!token) throw new Error('Токен аутентификации не найден.');
      const response = await fetch(`${API_BASE_URL}/contacts/check-username?username=${encodeURIComponent(username)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`Ошибка проверки имени: ${response.status}`);
      const data = await response.json();
      return data.available;
    } catch (err: any) {
      console.error('[EditADContacts] Ошибка проверки уникальности имени:', err);
      showModal('error', err.message || 'Не удалось проверить уникальность имени.');
      return false;
    }
  };

  const validatePassword = (password: string, displayName: string) => {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    const hasNoName = !displayName || !password.toLowerCase().includes(displayName.toLowerCase());

    if (password.length < minLength) {
      return 'Пароль должен содержать не менее 8 символов';
    }
    if (!hasUpperCase) {
      return 'Пароль должен содержать хотя бы одну заглавную букву';
    }
    if (!hasNumber) {
      return 'Пароль должен содержать хотя бы одну цифру';
    }
    if (!hasSpecialChar) {
      return 'Пароль должен содержать хотя бы один специальный символ';
    }
    if (!hasNoName) {
      return 'Пароль не должен содержать отображаемое имя';
    }
    return null;
  };

  const createContact = async (values: any) => {
    if (!isAdmin) {
      showModal('error', 'Только администратор может создавать контакты');
      return;
    }

    setIsLoading(true);
    try {
      if (!token) {
        throw new Error('Токен аутентификации не найден.');
      }

      const passwordError = validatePassword(values.password, values.displayName);
      if (passwordError) {
        throw new Error(passwordError);
      }

      const contactData: Contact = {
        id: values.sam_account_name?.trim(),
        displayName: values.displayName?.trim(),
        email: values.email?.trim() || null,
        phone_internal: (values.phone_internal) || null,
        phone_city: (values.phone_city) || null,
        phone_mobile: (values.phone_mobile) || null,
        department: values.department?.trim() || null,
        position: values.position?.trim() || null,
        password: values.password,
        isFrozen: false,
        groups: values.groups || [],
        sam_account_name: values.sam_account_name?.trim(),
      };
      console.log(contactData);
      const response = await fetch(`${API_BASE_URL}/contacts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(contactData),
      });

      if (!response.ok) {
        let errorMessage = `Ошибка HTTP: ${response.status}`;
        let errorDetail: string | { field: string; error: string }[] | null = null;
        try {
          const errorData = await response.json();
          errorDetail = errorData.detail || errorData.message || null;
          if (response.status === 400 && errorDetail) {
            if (Array.isArray(errorDetail)) {
              errorMessage = errorDetail.map(err => `${err.field}: ${err.error}`).join('; ');
            } else if (typeof errorDetail === 'string' && errorDetail.includes('Пароль')) {
              errorMessage = errorDetail;
            } else if (errorDetail) {
              errorMessage = `Ошибка: ${errorDetail}`;
            }
          } else if (response.status === 500) {
            let errorMessageDetail = 'Внутренняя ошибка сервера.';
            if (typeof errorDetail === 'string' && errorDetail.includes('WILL_NOT_PERFORM')) {
              errorMessageDetail = 'Ошибка создания пользователя в Active Directory. Проверьте настройки сервера или политику паролей.';
            }
            throw new Error(errorMessageDetail);
          }
        } catch (e) {}

        if (response.status === 401) {
          errorMessage = 'Сессия истекла. Пожалуйста, войдите снова.';
          logout();
          setTimeout(() => navigate('/'), 2000);
        }

        throw new Error(errorMessage);
      }

      const newContact: Contact = await response.json();
      setContacts([...contacts, newContact]);
      setFilteredContacts([...filteredContacts, newContact]);
      showModal('success', 'Контакт успешно создан');
      hideModal();
    } catch (err: any) {
      console.error('[EditADContacts] Ошибка при создании контакта:', err);
      showModal('error', err.message || 'Неизвестная ошибка при создании контакта');
    } finally {
      setIsLoading(false);
    }
  };

  const updateContact = async (values: any) => {
    if (!isAdmin) {
      showModal('error', 'Только администратор может редактировать контакты');
      return;
    }

    if (!modal.contact?.id) {
      showModal('error', 'Не удалось определить контакт для редактирования.');
      return;
    }

    const passwordError = values.password ? validatePassword(values.password, values.displayName) : null;
    if (passwordError) {
      showModal('error', passwordError);
      return;
    }

    // Форматируем данные для отправки
    const requestData = {
      displayName: values.displayName?.trim(),
      email: values.email?.trim() || null,
      phone_internal: formatPhoneNumberForServer(values.phone_internal) || null,
      phone_city: formatPhoneNumberForServer(values.phone_city) || null,
      phone_mobile: formatPhoneNumberForServer(values.phone_mobile) || null,
      department: values.department?.trim() || null,
      position: values.position?.trim() || null,
      ...(values.password && { password: values.password }),
      groups: values.groups || [],
    };

    Modal.confirm({
      title: 'Подтверждение редактирования',
      content: 'Вы уверены, что хотите сохранить изменения для этого контакта?',
      okText: 'Сохранить',
      cancelText: 'Отмена',
      onOk: async () => {
        setIsLoading(true);
        try {
          if (!token) {
            throw new Error('Токен аутентификации не найден.');
          }

          const response = await fetch(`${API_BASE_URL}/contacts/${modal.contact?.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(requestData),
          });

          if (!response.ok) {
            let errorMessage = `Ошибка HTTP: ${response.status}`;
            let errorDetail: any = null;
            
            try {
              const errorData = await response.json();
              errorDetail = errorData.detail || errorData.message || null;
              
              // Обработка ошибок валидации
              if (response.status === 422 && errorDetail) {
                if (Array.isArray(errorDetail)) {
                  // Ошибки валидации Pydantic
                  errorMessage = errorDetail.map(err => {
                    const field = err.loc?.[err.loc.length - 1] || 'неизвестное поле';
                    return `${field}: ${err.msg}`;
                  }).join('; ');
                } else if (typeof errorDetail === 'string') {
                  errorMessage = errorDetail;
                }
              }
            } catch (e) {
              console.error('Ошибка при разборе ответа сервера:', e);
            }

            if (response.status === 401) {
              errorMessage = 'Сессия истекла. Пожалуйста, войдите снова.';
              logout();
              setTimeout(() => navigate('/'), 2000);
            }

            throw new Error(errorMessage);
          }

          const updatedContact: Contact = await response.json();
          setContacts(contacts.map(contact => contact.id === updatedContact.id ? updatedContact : contact));
          setFilteredContacts(filteredContacts.map(contact => contact.id === updatedContact.id ? updatedContact : contact));
          showModal('success', 'Контакт успешно обновлён');
          hideModal();
        } catch (err: any) {
          console.error('[EditADContacts] Ошибка при обновлении контакта:', err);
          showModal('error', err.message || 'Неизвестная ошибка при обновлении контакта.');
        } finally {
          setIsLoading(false);
        }
      },
    });
  };

  const deleteContact = async (id: string) => {
    if (!isAdmin) {
      showModal('error', 'Только администратор может удалять контакты');
      return;
    }

    Modal.confirm({
      title: 'Подтверждение удаления',
      content: 'Вы уверены, что хотите удалить этот контакт?',
      okText: 'Удалить',
      okType: 'danger',
      cancelText: 'Отмена',
      onOk: async () => {
        setIsLoading(true);
        try {
          if (!token) {
            throw new Error('Токен аутентификации не найден.');
          }

          const response = await fetch(`${API_BASE_URL}/contacts/${id}`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (!response.ok) {
            let errorMessage = `Ошибка HTTP: ${response.status}`;
            let errorDetail: string | { field: string; error: string }[] | null = null;
            try {
              const errorData = await response.json();
              errorDetail = errorData.detail || errorData.message || null;
              if (errorDetail) {
                if (Array.isArray(errorDetail)) {
                  errorMessage = errorDetail.map(err => `${err.field}: ${err.error}`).join('; ');
                } else {
                  errorMessage = `Ошибка: ${errorDetail}`;
                }
              }
            } catch (e) {}

            if (response.status === 401) {
              errorMessage = 'Сессия истекла. Пожалуйста, войдите снова.';
              logout();
              setTimeout(() => navigate('/'), 2000);
            }

            throw new Error(errorMessage);
          }

          setContacts(contacts.filter(contact => contact.id !== id));
          setFilteredContacts(filteredContacts.filter(contact => contact.id !== id));
          message.success('Контакт успешно удалён');
        } catch (err: any) {
          console.error('[EditADContacts] Ошибка при удалении контакта:', err);
          showModal('error', err.message || 'Неизвестная ошибка при удалении контакта.');
        } finally {
          setIsLoading(false);
        }
      },
    });
  };

  const toggleFreezeContact = async (id: string, isFrozen: boolean) => {
    if (!isAdmin) {
      showModal('error', 'Только администратор может управлять заморозкой контактов');
      return;
    }

    Modal.confirm({
      title: `Подтверждение ${isFrozen ? 'разморозки' : 'заморозки'}`,
      content: `Вы уверены, что хотите ${isFrozen ? 'разморозить' : 'заморозить'} этот контакт?`,
      okText: isFrozen ? 'Разморозить' : 'Заморозить',
      okType: isFrozen ? 'primary' : 'danger',
      cancelText: 'Отмена',
      onOk: async () => {
        setIsLoading(true);
        try {
          if (!token) {
            throw new Error('Токен аутентификации не найден.');
          }

          const response = await fetch(`${API_BASE_URL}/contacts/${id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ is_frozen: !isFrozen }),
          });

          if (!response.ok) {
            let errorMessage = `Ошибка HTTP: ${response.status}`;
            let errorDetail: string | { field: string; error: string }[] | null = null;
            try {
              const errorData = await response.json();
              errorDetail = errorData.detail || errorData.message || null;
              if (errorDetail) {
                if (Array.isArray(errorDetail)) {
                  errorMessage = errorDetail.map(err => `${err.field}: ${err.error}`).join('; ');
                } else {
                  errorMessage = `Ошибка: ${errorDetail}`;
                }
              }
            } catch (e) {}

            if (response.status === 401) {
              errorMessage = 'Сессия истекла. Пожалуйста, войдите снова.';
              logout();
              setTimeout(() => navigate('/'), 2000);
            }

            throw new Error(errorMessage);
          }

          const updatedContact = await response.json();
          setContacts(contacts.map(contact => contact.id === id ? { ...contact, isFrozen: !isFrozen } : contact));
          setFilteredContacts(filteredContacts.map(contact => contact.id === id ? { ...contact, isFrozen: !isFrozen } : contact));
          message.success(`Контакт ${!isFrozen ? 'заморожен' : 'разморожен'} успешно`);
        } catch (err: any) {
          console.error('[EditADContacts] Ошибка при изменении статуса контакта:', err);
          showModal('error', err.message || 'Неизвестная ошибка при изменении статуса контакта.');
        } finally {
          setIsLoading(false);
        }
      },
    });
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const columns = [
    {
      title: 'Отображаемое имя',
      dataIndex: 'displayName',
      key: 'displayName',
      sorter: (a: Contact, b: Contact) => {
        const nameA = a.displayName || '';
        const nameB = b.displayName || '';
        return nameA.localeCompare(nameB, 'ru', { sensitivity: 'base' });
      },
      render: (text: string, record: Contact) => (
        <div className="flex items-center gap-2">
          <div className={`rounded-full w-8 h-8 flex items-center justify-center text-base font-semibold ${isAdmin ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}`}>
            {getInitials(record)}
          </div>
          <span>{text || 'Не указано'}</span>
        </div>
      ),
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      sorter: (a: Contact, b: Contact) => (a.email || '').localeCompare(b.email || '', 'ru', { sensitivity: 'base' }),
      render: (text: string) => text ? <a href={`mailto:${text}`} title="Отправить письмо">{text}</a> : 'Нет email',
    },
    {
      title: 'Департамент',
      dataIndex: 'department',
      key: 'department',
      sorter: (a: Contact, b: Contact) => (a.department || '').localeCompare(b.department || '', 'ru', { sensitivity: 'base' }),
      render: (text: string) => text || 'Не указано',
    },
    {
      title: 'Статус',
      key: 'isFrozen',
      render: (_: any, record: Contact) => (
        record.isFrozen ? 'Заморожен' : 'Активен'
      ),
    },
    {
      title: 'Действия',
      key: 'actions',
      render: (_: any, record: Contact) => (
        <Space>
          <Button
            type="primary"
            icon={<EditOutlined />}
            onClick={() => showModal('edit', undefined, record)}
            disabled={!isAdmin}
            title="Редактировать контакт"
          >
            Редактировать
          </Button>
          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={() => deleteContact(record.id)}
            disabled={!isAdmin}
            title="Удалить контакт"
          >
            Удалить
          </Button>
          <Button
            icon={<PauseOutlined />}
            onClick={() => toggleFreezeContact(record.id, record.isFrozen || false)}
            disabled={!isAdmin}
            style={{ background: record.isFrozen ? '#52c41a' : '#faad14', color: 'white' }}
            title={record.isFrozen ? 'Разморозить контакт' : 'Заморозить контакт'}
          >
            {record.isFrozen ? 'Разморозить' : 'Заморозить'}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className={`min-h-screen p-4 md:p-6 ${theme === 'light' ? 'bg-gray-100': 'bg-gray-950'}`}>
      <div className="max-w-7xl mx-auto">
        <button
          onClick={() => navigate('/dashboard')}
          className={`flex items-center mb-3 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium  ${theme === 'light'? 'text-gray-700 hover:bg-gray-50':'text-white hover:bg-gray-700'}`}
        >
          <svg className="h-5 w-5 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Вернуться на главную
        </button>

        <Card
          title="Редактирование контактов Active Directory"
          className={`shadow-sm rounded-lg`}
        >
          <div className="mb-4">
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => showModal('create')}
              disabled={!isAdmin}
              title="Создать новый контакт"
            >
              Добавить контакт
            </Button>
          </div>
          <Input
            placeholder="Поиск по имени, email или логину..."
            prefix={<SearchOutlined />}
            value={searchQuery}
            onChange={handleSearch}
            className={`mb-4 max-w-md rounded-lg border-gray-300`}
            allowClear
            title="Введите имя, email или логин для поиска"
          />

          {isLoading ? (
            <Spin size="large" className="block my-8 mx-auto" />
          ) : (
            <Table
              dataSource={filteredContacts}
              columns={columns}
              rowKey="id"
              pagination={{ pageSize: 30 }}
              locale={{ emptyText: searchQuery ? 'Контакты не найдены' : 'Нет контактов' }}
              className={`overflow-x-auto`}
            />
          )}
        </Card>

        <Modal
          open={modal.visible}
          onCancel={hideModal}
          footer={
            modal.type === 'edit' || modal.type === 'create' ? [
              <Button key="cancel" onClick={hideModal} title="Отменить изменения">Отмена</Button>,
              <Button
                key="submit"
                type="primary"
                loading={isLoading}
                onClick={() => form.submit()}
                icon={<SaveOutlined />}
                title={modal.type === 'create' ? 'Создать контакт' : 'Сохранить изменения'}
              >
                {modal.type === 'create' ? 'Создать' : 'Сохранить'}
              </Button>
            ] : [
              <Button key="ok" type="primary" onClick={hideModal} title="Закрыть">OK</Button>
            ]
          }
          title={modal.type === 'edit' ? 'Редактирование контакта' :
                 modal.type === 'create' ? 'Создание контакта' :
                 modal.type === 'success' ? 'Успешно!' : 'Ошибка'}
        >
          {(modal.type === 'edit' || modal.type === 'create') && (
            <Form
              form={form}
              layout="vertical"
              onFinish={modal.type === 'create' ? createContact : updateContact}
              initialValues={
                modal.type === 'create'
                  ? { isFrozen: false, groups: [] }
                  : {
                      ...modal.contact,
                      phone_internal: formatPhoneNumber(modal.contact?.phone_internal),
                      phone_city: formatPhoneNumber(modal.contact?.phone_city),
                      phone_mobile: formatPhoneNumber(modal.contact?.phone_mobile),
                      groups: modal.contact?.groups || [],
                      sam_account_name: modal.contact?.id || '',
                    }
              }
              className={`space-y-4 ${theme === 'light'? 'text-gray-700':'text-white'}`}
            >
              <div className={`p-4 rounded-md ${theme === 'light' ? 'bg-gray-50':'bg-black'}`}>
                <h4 className="text-sm font-medium   mb-2">Личная информация</h4>
                <Form.Item
                  name="displayName"
                  label="Отображаемое имя"
                  rules={[{ required: true, message: 'Пожалуйста, введите отображаемое имя' }]}
                >
                  <Input placeholder="Введите отображаемое имя" className="rounded-md" title="Введите отображаемое имя сотрудника" />
                </Form.Item>
                <Form.Item
                  name="sam_account_name"
                  label="Имя входа (sAMAccountName)"
                  rules={[
                    { required: modal.type === 'create', message: 'Пожалуйста, введите имя входа' },
                    { pattern: /^[a-zA-Z0-9-.]{1,20}$/, message: 'Имя входа должно содержать 1-20 символов (буквы, цифры, дефис)' },
                    {
                      validator: async (_, value) => {
                        if (modal.type === 'create' && value) {
                          const isAvailable = await checkUsernameAvailability(value);
                          if (!isAvailable) {
                            return Promise.reject('Имя входа уже занято');
                          }
                        }
                        return Promise.resolve();
                      },
                    },
                  ]}
                >
                  <Input placeholder="Введите имя входа (например: user123)" disabled={modal.type === 'edit'} className="rounded-md" title="Введите уникальное имя входа" />
                </Form.Item>
              </div>
              <div className={`${theme === 'light' ? 'bg-gray-50':'bg-black'} p-4 rounded-md`}>
                <h4 className="text-sm font-medium   mb-2">Контактная информация</h4>
                <Form.Item
                  name="email"
                  label="Email"
                  rules={[{ type: 'email', message: 'Введите корректный email' }]}
                >
                  <Input placeholder="Введите email" className="rounded-md" title="Введите email для отправки писем" />
                </Form.Item>
                <Form.Item
                  name="phone_internal"
                  label="Внутренний телефон"
                  normalize={(value) => formatPhoneNumber(value)}
                >
                  <Input 
                    placeholder="Например: 1234" 
                    className="font-mono rounded-md" 
                    title="Введите внутренний номер телефона"
                    onChange={(e) => {
                      const formatted = formatPhoneNumber(e.target.value);
                      if (formatted && formatted !== e.target.value) {
                        form.setFieldsValue({ phone_internal: formatted });
                      }
                    }}
                  />
                </Form.Item>
                <Form.Item
                  name="phone_city"
                  label="Городской телефон"
                  normalize={(value) => formatPhoneNumber(value)}
                >
                  <Input 
                    placeholder="Например: 123456" 
                    className="font-mono rounded-md" 
                    title="Введите городской номер телефона"
                    onChange={(e) => {
                      const formatted = formatPhoneNumber(e.target.value);
                      if (formatted && formatted !== e.target.value) {
                        form.setFieldsValue({ phone_city: formatted });
                      }
                    }}
                  />
                </Form.Item>
                <Form.Item
                  name="phone_mobile"
                  label="Мобильный телефон"
                  normalize={(value) => formatPhoneNumber(value)}
                >
                  <Input 
                    placeholder="Например: 80291234567, 375291234567 или +375 (29) 123-45-67" 
                    className="font-mono rounded-md" 
                    title="Введите мобильный номер телефона"
                    onChange={(e) => {
                      const formatted = formatPhoneNumber(e.target.value);
                      if (formatted && formatted !== e.target.value) {
                        form.setFieldsValue({ phone_mobile: formatted });
                      }
                    }}
                  />
                </Form.Item>
              </div>
              <div className={`${theme === 'light' ? 'bg-gray-50':'bg-black'} p-4 rounded-md`}>
                <h4 className="text-sm font-medium   mb-2">Дополнительная информация</h4>
                <Form.Item
                  name="department"
                  label="Отдел"
                  rules={[{ required: true, message: 'Пожалуйста, выберите отдел' }]}
                >
                  <Select
                    placeholder="Выберите отдел"
                    options={departments.map(dept => ({ value: dept, label: dept }))}
                    showSearch
                    optionFilterProp="label"
                    className="rounded-md"
                    title="Выберите отдел сотрудника"
                  />
                </Form.Item>
                <Form.Item
                  name="position"
                  label="Должность"
                >
                  <Input placeholder="Введите должность" className="rounded-md" title="Введите должность сотрудника" />
                </Form.Item>
                <Form.Item
                  name="groups"
                  label="Группы"
                >
                  <Select
                    mode="multiple"
                    placeholder="Выберите группы"
                    options={groups.map(group => ({ value: group, label: group }))}
                    showSearch
                    optionFilterProp="label"
                    className="rounded-md"
                    title="Выберите группы доступа"
                  />
                </Form.Item>
              </div>
              {modal.type === 'create' && (
                <div className={`${theme === 'light' ? 'bg-gray-50':'bg-black'} p-4 rounded-md`}>
                  <h4 className="text-sm font-medium   mb-2">Пароль</h4>
                  <Form.Item
                    name="password"
                    label="Пароль"
                    rules={[{ required: true, message: 'Пожалуйста, введите пароль' }]}
                  >
                    <Input.Password placeholder="Введите пароль" className="rounded-md" title="Введите пароль для учетной записи" />
                  </Form.Item>
                </div>
              )}
              {modal.type === 'edit' && (
                <div className={`${theme === 'light' ? 'bg-gray-50':'bg-black'} p-4 rounded-md`}>
                  <h4 className="text-sm font-medium   mb-2">Пароль</h4>
                  <Form.Item
                    name="password"
                    label="Новый пароль (опционально)"
                  >
                    <Input.Password placeholder="Введите новый пароль" className="rounded-md" title="Введите новый пароль (если требуется)" />
                  </Form.Item>
                </div>
              )}
            </Form>
          )}
          {(modal.type === 'success' || modal.type === 'error') && (
            <div className="text-center py-6">
              {modal.type === 'success' ? (
                <CheckCircleOutlined className="text-5xl text-green-500 mb-4" />
              ) : (
                <CloseCircleOutlined className="text-5xl text-red-500 mb-4" />
              )}
              <h3 className="text-lg font-medium">{modal.type === 'success' ? 'Успешно!' : 'Ошибка'}</h3>
              <p>{modal.message}</p>
            </div>
          )}
        </Modal>
      </div>
    </div>
  );
};

export default EditADContacts;