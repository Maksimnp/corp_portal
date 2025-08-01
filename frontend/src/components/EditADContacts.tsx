import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Card, Spin, Form, Modal, Table, Space, message, Select } from 'antd';
import { ArrowLeftOutlined, SaveOutlined, CheckCircleOutlined, CloseCircleOutlined, EditOutlined, SearchOutlined, PlusOutlined, DeleteOutlined, PauseOutlined } from '@ant-design/icons';
import { useAuth } from '../pages/AuthContext';

interface Contact {
  id: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
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

const EditADContacts: React.FC = () => {
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

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://192.1.66.117:8000';

  useEffect(() => {
    console.log('[EditADContacts] token:', token);
    console.log('[EditADContacts] isAdmin:', isAdmin);
  }, [token, isAdmin]);

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
        [contact.full_name, contact.first_name, contact.last_name, contact.email]
          .filter(Boolean)
          .some((field) => field?.toLowerCase().includes(searchQuery.toLowerCase()))
      )
      .sort((a, b) => {
        const nameA = a.full_name || `${a.first_name || ''} ${a.last_name || ''}`.trim() || '';
        const nameB = b.full_name || `${b.first_name || ''} ${b.last_name || ''}`.trim() || '';
        return nameA.localeCompare(nameB, 'ru', { sensitivity: 'base' });
      });
    setFilteredContacts(filtered);
  }, [searchQuery, contacts]);

  const showModal = (type: 'success' | 'error' | 'info' | 'edit' | 'create', message?: string, contact?: Contact) => {
    setModal({ visible: true, type, message, contact });
    if (type === 'edit' && contact) {
      form.setFieldsValue({
        ...contact,
        groups: contact.groups || [],
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
      setFilteredContacts(
        data.sort((a, b) => {
          const nameA = a.full_name || `${a.first_name || ''} ${a.last_name || ''}`.trim() || '';
          const nameB = b.full_name || `${b.first_name || ''} ${b.last_name || ''}`.trim() || '';
          return nameA.localeCompare(nameB, 'ru', { sensitivity: 'base' });
        })
      );
    } catch (err: any) {
      console.error('[EditADContacts] Ошибка при загрузке контактов:', err);
      if (err instanceof TypeError && err.message.includes('fetch')) {
        showModal('error', 'Не удалось подключиться к серверу. Проверьте сетевое соединение и доступность сервера.');
      } else {
        showModal('error', err.message || 'Неизвестная ошибка при загрузке контактов.');
      }
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
        const errorText = await response.text();
        console.error('[EditADContacts] Departments fetch response:', response.status, errorText);
        let errorMessage = `Ошибка HTTP: ${response.status} - ${errorText}`;
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
            const errorText = await response.text();
            console.error('[EditADContacts] Groups fetch response:', response.status, errorText);
            let errorMessage = `Ошибка HTTP: ${response.status} - ${errorText}`;
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
        console.log('[EditADContacts] Groups fetched:', data);
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
      const response = await fetch(`${API_BASE_URL}/check-username?username=${encodeURIComponent(username)}`, {
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

  const validatePassword = (password: string, first_name: string, last_name: string) => {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  const hasNoName = !first_name || !last_name || (
    !password.toLowerCase().includes(first_name.toLowerCase()) &&
    !password.toLowerCase().includes(last_name.toLowerCase())
  );

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
    return 'Пароль не должен содержать имя или фамилию';
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

      const passwordError = validatePassword(values.password, values.first_name, values.last_name);
      if (passwordError) {
        throw new Error(passwordError);
      }

      const contactData: Contact = {
        id: values.sam_account_name?.trim(), 
        first_name: values.first_name?.trim(),
        last_name: values.last_name?.trim(),
        email: values.email?.trim() || null,
        phone_internal: values.phone_internal?.replace(/[^0-9]/g, '') || null,
        phone_city: values.phone_city?.replace(/[^0-9]/g, '') || null,
        phone_mobile: values.phone_mobile?.replace(/[^0-9]/g, '') || null,
        department: values.department?.trim() || null,
        position: values.position?.trim() || null,
        password: values.password,
        isFrozen: false,
        groups: values.groups || [],
        sam_account_name: values.sam_account_name?.trim(),
      };

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
        let errorDetail = null;
        try {
          const errorData = await response.json();
          errorDetail = errorData.detail || errorData.message || null;
          if (response.status === 400 && errorDetail.includes('Пароль')) {
            errorMessage = errorDetail;
          } else if (response.status === 500 && errorDetail.includes('WILL_NOT_PERFORM')) {
            errorMessage = 'Ошибка создания пользователя в Active Directory. Проверьте настройки сервера или политику паролей.';
          } else if (errorDetail) {
            errorMessage = `Ошибка: ${errorDetail}`;
          }
        } catch (e) {}

        if (response.status === 401) {
          errorMessage = 'Сессия истекла. Пожалуйста, войдите снова.';
          logout();
          setTimeout(() => navigate('/'), 2000);
        }

        throw new Error(errorMessage);
      }

      const newContact = await response.json();
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

    const passwordError = values.password ? validatePassword(values.password, values.first_name, values.last_name) : null;
    if (passwordError) {
      showModal('error', passwordError);
      return;
    }

    const normalizedValues: Contact = {
      id: modal.contact.id,
      first_name: values.first_name?.trim(),
      last_name: values.last_name?.trim(),
      email: values.email?.trim() || null,
      phone_internal: values.phone_internal?.replace(/[^0-9]/g, '') || null,
      phone_city: values.phone_city?.replace(/[^0-9]/g, '') || null,
      phone_mobile: values.phone_mobile?.replace(/[^0-9]/g, '') || null,
      department: values.department?.trim() || null,
      position: values.position?.trim() || null,
      password: values.password || undefined,
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
            body: JSON.stringify(normalizedValues),
          });

          if (!response.ok) {
            let errorMessage = `Ошибка HTTP: ${response.status}`;
            let errorDetail = null;
            try {
              const errorData = await response.json();
              errorDetail = errorData.detail || errorData.message || null;
              if (response.status === 400 && errorDetail.includes('Пароль')) {
                errorMessage = errorDetail;
              } else if (response.status === 500 && errorDetail.includes('WILL_NOT_PERFORM')) {
                errorMessage = 'Ошибка обновления пользователя в Active Directory. Проверьте настройки сервера или политику паролей.';
              } else if (errorDetail) {
                errorMessage = `Ошибка: ${errorDetail}`;
              }
            } catch (e) {}

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
            let errorDetail = null;
            try {
              const errorData = await response.json();
              errorDetail = errorData.detail || errorData.message || null;
            } catch (e) {}

            if (response.status === 401) {
              errorMessage = 'Сессия истекла. Пожалуйста, войдите снова.';
              logout();
              setTimeout(() => navigate('/'), 2000);
            } else if (errorDetail) {
              errorMessage = `Ошибка: ${errorDetail}`;
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
            let errorDetail = null;
            try {
              const errorData = await response.json();
              errorDetail = errorData.detail || errorData.message || null;
              console.error('[EditADContacts] Freeze error detail:', errorDetail);
            } catch (e) {}

            if (response.status === 401) {
              errorMessage = 'Сессия истекла. Пожалуйста, войдите снова.';
              logout();
              setTimeout(() => navigate('/'), 2000);
            } else if (errorDetail) {
              errorMessage = `Ошибка: ${errorDetail}`;
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
      title: 'Полное имя',
      dataIndex: 'full_name',
      key: 'full_name',
      sorter: (a: Contact, b: Contact) => {
        const nameA = a.full_name || `${a.first_name || ''} ${a.last_name || ''}`.trim() || '';
        const nameB = b.full_name || `${b.first_name || ''} ${b.last_name || ''}`.trim() || '';
        return nameA.localeCompare(nameB, 'ru', { sensitivity: 'base' });
      },
      render: (text: string, record: Contact) =>
        text || `${record.first_name || ''} ${record.last_name || ''}`.trim() || 'Не указано',
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      sorter: (a: Contact, b: Contact) => (a.email || '').localeCompare(b.email || '', 'ru', { sensitivity: 'base' }),
      render: (text: string) => text || 'Нет email',
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
          >
            Редактировать
          </Button>
          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={() => deleteContact(record.id)}
            disabled={!isAdmin}
          >
            Удалить
          </Button>
          <Button
            icon={<PauseOutlined />}
            onClick={() => toggleFreezeContact(record.id, record.isFrozen || false)}
            disabled={!isAdmin}
            style={{ background: record.isFrozen ? '#52c41a' : '#faad14', color: 'white' }}
          >
            {record.isFrozen ? 'Разморозить' : 'Заморозить'}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <Button
        type="link"
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/dashboard')}
        style={{ marginBottom: '16px' }}
      >
        Назад в Dashboard
      </Button>

      <Card
        title="Редактирование контактов Active Directory"
        variant="outlined"
        style={{ boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)' }}
      >
        <div style={{ marginBottom: '16px' }}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => showModal('create')}
            disabled={!isAdmin}
          >
            Добавить контакт
          </Button>
        </div>
        <Input
          placeholder="Поиск по имени или email..."
          prefix={<SearchOutlined />}
          value={searchQuery}
          onChange={handleSearch}
          style={{ marginBottom: '16px', maxWidth: '400px' }}
          allowClear
        />

        {isLoading ? (
          <Spin size="large" style={{ display: 'block', margin: '20px auto' }} />
        ) : (
          <Table
            dataSource={filteredContacts}
            columns={columns}
            rowKey="id"
            pagination={{ pageSize: 30 }}
            locale={{ emptyText: searchQuery ? 'Контакты не найдены' : 'Нет контактов' }}
          />
        )}
      </Card>

      <Modal
        open={modal.visible}
        onCancel={hideModal}
        footer={
          modal.type === 'edit' || modal.type === 'create' ? [
            <Button key="cancel" onClick={hideModal}>Отмена</Button>,
            <Button
              key="submit"
              type="primary"
              loading={isLoading}
              onClick={() => form.submit()}
              icon={<SaveOutlined />}
            >
              {modal.type === 'create' ? 'Создать' : 'Сохранить'}
            </Button>
          ] : [
            <Button key="ok" type="primary" onClick={hideModal}>OK</Button>
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
            initialValues={modal.type === 'create' ? { isFrozen: false, groups: [] } : undefined}
          >
            <Form.Item
              name="first_name"
              label="Имя"
              rules={[{ required: true, message: 'Пожалуйста, введите имя' }]}
            >
              <Input placeholder="Введите имя" />
            </Form.Item>
            <Form.Item
              name="last_name"
              label="Фамилия"
              rules={[{ required: true, message: 'Пожалуйста, введите фамилию' }]}
            >
              <Input placeholder="Введите фамилию" />
            </Form.Item>
            <Form.Item
  name="sam_account_name"
  label="Имя входа (sAMAccountName)"
  rules={[
    { required: true, message: 'Пожалуйста, введите имя входа' },
    { pattern: /^[a-zA-Z0-9-]{1,20}$/, message: 'Имя входа должно содержать 1-20 символов (буквы, цифры, дефис)' },
  ]}
>
  <Input placeholder="Введите имя входа (например: user123)" />
</Form.Item>
            <Form.Item
              name="email"
              label="Email"
              rules={[{ type: 'email', message: 'Введите корректный email' }]}
            >
              <Input placeholder="Введите email" />
            </Form.Item>
            <Form.Item
              name="phone_internal"
              label="Внутренний телефон"
              rules={[{ pattern: /^\d{4,}$|^(\+\d{1,3}\s?\(?[0-9]{3}\)?\s?[0-9]{3}-[0-9]{2}-[0-9]{1,2})$/, message: 'Введите корректный номер телефона' }]}
            >
              <Input placeholder="Например: 1234" />
            </Form.Item>
            <Form.Item
              name="phone_city"
              label="Городской телефон"
              rules={[{ pattern: /^\d{4,}$|^(\+\d{1,3}\s?\(?[0-9]{3}\)?\s?[0-9]{3}-[0-9]{2}-[0-9]{1,2})$/, message: 'Введите корректный номер телефона' }]}
            >
              <Input placeholder="Например: 456-78-90" />
            </Form.Item>
            <Form.Item
              name="phone_mobile"
              label="Мобильный телефон"
              rules={[{ pattern: /^\d{4,}$|^(\+\d{1,3}\s?\(?[0-9]{3}\)?\s?[0-9]{3}-[0-9]{2}-[0-9]{1,2})$|^(\+\d{1,3}[0-9]{9})$/, message: 'Введите корректный мобильный номер' }]}
            >
              <Input placeholder="Например: +375 (29) 456-78-90 или +375292314233" />
            </Form.Item>
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
              />
            </Form.Item>
            <Form.Item
              name="position"
              label="Должность"
            >
              <Input placeholder="Введите должность" />
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
              />
            </Form.Item>
            {modal.type === 'create' && (
              <Form.Item
                name="password"
                label="Пароль"
                rules={[{ required: true, message: 'Пожалуйста, введите пароль' }]}
              >
                <Input.Password placeholder="Введите пароль" />
              </Form.Item>
            )}
            {modal.type === 'edit' && (
              <Form.Item
                name="password"
                label="Новый пароль (опционально)"
              >
                <Input.Password placeholder="Введите новый пароль" />
              </Form.Item>
            )}
          </Form>
        )}
        {(modal.type === 'success' || modal.type === 'error') && (
          <div style={{ textAlign: 'center', padding: '24px' }}>
            {modal.type === 'success' ? (
              <CheckCircleOutlined style={{ fontSize: '48px', color: '#52c41a', marginBottom: '16px' }} />
            ) : (
              <CloseCircleOutlined style={{ fontSize: '48px', color: '#ff4d4f', marginBottom: '16px' }} />
            )}
            <h3 style={{ marginBottom: '8px' }}>{modal.type === 'success' ? 'Успешно!' : 'Ошибка'}</h3>
            <p>{modal.message}</p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default EditADContacts;