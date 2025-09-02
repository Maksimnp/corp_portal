import React, { useState, useEffect, Component, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios, { AxiosError } from 'axios';
import { 
  Button, Input, Table, message, Spin, Tabs, Popconfirm, Modal, Select, Form, 
  Card, Row, Col, Statistic, Tag, Switch, Divider, Space, Tooltip, Alert, 
  Typography, Grid, Badge, List, Avatar, Progress, Empty, DatePicker
} from 'antd';
import { 
  DownloadOutlined, EditOutlined, DeleteOutlined, UserAddOutlined, 
  ReloadOutlined, PoweroffOutlined, SettingOutlined, EyeOutlined,
  PlayCircleOutlined, PauseCircleOutlined, UserSwitchOutlined,
  TeamOutlined, GlobalOutlined, SafetyCertificateOutlined,
  CloudDownloadOutlined, CloudUploadOutlined, DatabaseOutlined,
  WifiOutlined, UserOutlined, GroupOutlined, DashboardOutlined,
  KeyOutlined, SecurityScanOutlined, SaveOutlined, ApartmentOutlined,
  ArrowLeftOutlined, LineChartOutlined, InfoCircleOutlined,
  HistoryOutlined, CalendarOutlined, FilterOutlined
} from '@ant-design/icons';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, LineChart, Line, BarChart, Bar } from 'recharts';
import type { TabsProps } from 'antd';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;
const { useBreakpoint } = Grid;
const { TextArea } = Input;
const { RangePicker } = DatePicker;

// Error Boundary Component
class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <Alert
          message="Произошла ошибка"
          description={this.state.error?.message || 'Неизвестная ошибка. Пожалуйста, обновите страницу.'}
          type="error"
          showIcon
          action={
            <Button onClick={() => window.location.reload()}>Обновить</Button>
          }
        />
      );
    }
    return this.props.children;
  }
}

// Interfaces
interface LoadData {
  timestamp: number;
  activeClients: number;
  trafficIn: number;
  trafficOut: number;
}

interface ClientStatus {
  commonName: string;
  realAddress: string;
  virtualAddress: string;
  bytesReceived: number;
  bytesSent: number;
  connectedSince: string | number;
  connectedSinceFormatted?: string;
}

interface Profile {
  commonName: string;
  allow_web_login?: string;
  auto_login?: string;
  disabled?: string;
  expiration_date?: string;
  prop_password?: string;
  [key: string]: any;
}

interface ServerStats {
  totalClients: number;
  activeClients: number;
  totalProfiles: number;
  serverStatus: string;
  totalTrafficIn: number;
  totalTrafficOut: number;
}

interface ServerConfig {
  server_port: string;
  protocol: string;
  cipher: string;
  auth: string;
  server_network: string;
  server_netmask: string;
  push_routes: string;
  duplicate_cn: string;
  client_to_client: string;
}

interface Group {
  name: string;
  access: string;
  users: string[];
}

interface HistoricalData {
  timestamp: number;
  active_clients: number;
  traffic_in: number;
  traffic_out: number;
}

const VPNManagement: React.FC = () => {
  const [clients, setClients] = useState<ClientStatus[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [serverStats, setServerStats] = useState<ServerStats>({
    totalClients: 2048,
    activeClients: 0,
    totalProfiles: 0,
    serverStatus: 'unknown',
    totalTrafficIn: 0,
    totalTrafficOut: 0
  });
  const [historicalData, setHistoricalData] = useState<HistoricalData[]>([]);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(7, 'days'),
    dayjs()
  ]);
  const [serverConfig, setServerConfig] = useState<ServerConfig>({
    server_port: '',
    protocol: '',
    cipher: '',
    auth: '',
    server_network: '',
    server_netmask: '',
    push_routes: '',
    duplicate_cn: '',
    client_to_client: ''
  });
  const [loading, setLoading] = useState(false);
  const [loadingHistorical, setLoadingHistorical] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [configModalVisible, setConfigModalVisible] = useState(false);
  const [groupModalVisible, setGroupModalVisible] = useState(false);
  const [userGroupsModalVisible, setUserGroupsModalVisible] = useState(false);
  const [selectedUserForGroups, setSelectedUserForGroups] = useState<Profile | null>(null);
  const [createForm] = Form.useForm();
  const [configForm] = Form.useForm();
  const [groupForm] = Form.useForm();
  const [userGroupsForm] = Form.useForm();
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [editPropKey, setEditPropKey] = useState<string>('allow_web_login');
  const [editPropValue, setEditPropValue] = useState<string>('true');
  const API_URL = process.env.VITE_API_BASE_URL || 'http://192.1.66.117:8000';
  const navigate = useNavigate();
  const screens = useBreakpoint();

  const fetchHistoricalData = async (startDate: dayjs.Dayjs, endDate: dayjs.Dayjs) => {
    setLoadingHistorical(true);
    try {
      const response = await axios.get<{ data: HistoricalData[] }>(`${API_URL}/api/vpn/historical-data`, {
        params: {
          start: startDate.unix(),
          end: endDate.unix()
        }
      });
      setHistoricalData(response.data.data || []);
    } catch (err) {
      const error = err as AxiosError;
      console.error('Ошибка загрузки исторических данных:', error);
      message.error(`Ошибка загрузки исторических данных: ${error.message}`);
      // Fallback to demo data
      generateDemoHistoricalData(startDate, endDate);
    } finally {
      setLoadingHistorical(false);
    }
  };

  const generateDemoHistoricalData = (startDate: dayjs.Dayjs, endDate: dayjs.Dayjs) => {
    const demoData: HistoricalData[] = [];
    const hoursDiff = endDate.diff(startDate, 'hour');
    
    for (let i = 0; i <= hoursDiff; i += 2) {
      const timestamp = startDate.add(i, 'hour').unix();
      const active_clients = Math.floor(Math.random() * 50) + 10;
      const traffic_in = Math.floor(Math.random() * 1000000000) + 500000000;
      const traffic_out = Math.floor(Math.random() * 500000000) + 100000000;
      
      demoData.push({
        timestamp,
        active_clients,
        traffic_in,
        traffic_out
      });
    }
    
    setHistoricalData(demoData);
  };

  const fetchServerConfig = async () => {
    try {
      const response = await axios.get<ServerConfig>(`${API_URL}/api/vpn/server-settings`);
      setServerConfig(response.data);
      configForm.setFieldsValue(response.data);
    } catch (err) {
      const error = err as AxiosError;
      console.error('Ошибка получения конфигурации сервера:', error);
      message.error(`Ошибка получения конфигурации сервера: ${error.message}`);
      // Fallback to default config
      setServerConfig({
        server_port: '943',
        protocol: 'tcp',
        cipher: 'AES-256-GCM',
        auth: 'SHA256',
        server_network: '10.8.0.0',
        server_netmask: '255.255.255.0',
        push_routes: '',
        duplicate_cn: 'false',
        client_to_client: 'false'
      });
    }
  };

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const response = await axios.get<{ clients: ClientStatus[] }>(`${API_URL}/api/vpn/status`);
      const clientsWithFormattedDate = response.data.clients?.map(client => ({
        ...client,
        connectedSinceFormatted: formatDate(client.connectedSince)
      })) || [];
      setClients(clientsWithFormattedDate);
      setServerStats(prev => ({
        ...prev,
        activeClients: clientsWithFormattedDate.length
      }));
    } catch (err) {
      const error = err as AxiosError;
      console.error('Ошибка получения статуса:', error);
      message.error(`Не удалось получить статус: ${error.message}`);
      setClients([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchServerStats = async () => {
    try {
      const response = await axios.get<ServerStats>(`${API_URL}/api/vpn/server-status`);
      setServerStats(prev => ({
        ...prev,
        ...response.data,
        totalClients: 2048
      }));
    } catch (err) {
      const error = err as AxiosError;
      console.error('Ошибка получения статистики сервера:', error);
      message.error(`Ошибка получения статистики сервера: ${error.message}`);
    }
  };

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const response = await axios.get<{ profiles: Profile[] }>(`${API_URL}/api/vpn/profiles`);
      setProfiles(response.data.profiles || []);
      setServerStats(prev => ({
        ...prev,
        totalProfiles: response.data.profiles.length
      }));
    } catch (err) {
      const error = err as AxiosError;
      console.error('Ошибка получения профилей:', error);
      message.error(`Не удалось получить профили: ${error.message}`);
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const response = await axios.get<{ groups: Group[] }>(`${API_URL}/api/vpn/groups`);
      setGroups(response.data.groups || []);
    } catch (err) {
      const error = err as AxiosError;
      console.error('Ошибка получения групп:', error);
      message.error('Не удалось получить группы');
      setGroups([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'dashboard') {
      fetchStatus();
      fetchServerStats();
      fetchServerConfig();
      fetchHistoricalData(dateRange[0], dateRange[1]);
    } else if (activeTab === 'status') {
      fetchStatus();
    } else if (activeTab === 'profiles') {
      fetchProfiles();
    } else if (activeTab === 'groups') {
      fetchGroups();
    }
  }, [activeTab, dateRange]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (value: string | number): string => {
    let date: Date;
    if (typeof value === 'number') {
      date = new Date(value * 1000);
    } else if (typeof value === 'string' && value) {
      date = new Date(value);
    } else {
      return 'N/A';
    }
    return isNaN(date.getTime()) ? 'N/A' : date.toLocaleString();
  };

  const formatDateShort = (timestamp: number): string => {
    return dayjs.unix(timestamp).format('DD.MM HH:mm');
  };

  const createProfile = async (values: any) => {
    if (!values.clientName?.trim()) {
      message.error('Введите имя клиента');
      return;
    }
    setLoading(true);
    try {
      const response = await axios.post(
        `${API_URL}/api/vpn/create-profile`,
        {
          clientName: values.clientName,
          password: values.password,
          allow_web_login: values.allow_web_login ? 'true' : 'false',
          prop_autologin: values.auto_login ? 'true' : 'false',
          expiration_date: values.expiration_date
            ? values.expiration_date.format('YYYY-MM-DD')
            : undefined,
        },
        { responseType: 'blob' }
      );
      const contentDisposition = response.headers['content-disposition'];
      const filenameMatch = contentDisposition?.match(/filename="?([^"]+)"?/);
      const filename = filenameMatch ? filenameMatch[1] : `${values.clientName}.ovpn`;
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      message.success(`Профиль для ${values.clientName} создан и загружен`);
      setCreateModalVisible(false);
      createForm.resetFields();
      fetchProfiles();
      fetchServerStats();
    } catch (err) {
      const error = err as AxiosError;
      let errorMessage = 'Неизвестная ошибка';
      if (error.response && error.response.data instanceof Blob) {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const jsonError = JSON.parse(reader.result as string);
            errorMessage = jsonError.detail || 'Неизвестная ошибка';
          } catch {
            errorMessage = 'Не удалось прочитать ошибку';
          }
          message.error(`Ошибка создания профиля: ${errorMessage}`);
        };
        reader.readAsText(error.response.data);
      } else {
        message.error(`Ошибка создания профиля: ${error.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const downloadProfile = async (username: string) => {
    setLoading(true);
    try {
      const response = await axios.post(
        `${API_URL}/api/vpn/download-profile`,
        { clientName: username },
        { responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${username}.ovpn`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      message.success(`Профиль для ${username} загружен.`);
    } catch (err) {
      const error = err as AxiosError;
      message.error(`Ошибка скачивания: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const deleteProfile = async (username: string) => {
    setLoading(true);
    try {
      await axios.delete(`${API_URL}/api/vpn/delete-profile`, { 
        data: { clientName: username } 
      });
      message.success(`Профиль для ${username} удалён.`);
      fetchProfiles();
      fetchServerStats();
    } catch (err) {
      const error = err as AxiosError;
      message.error(`Ошибка удаления: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const disconnectClient = async (clientName: string, realAddress: string) => {
    try {
      await axios.post(`${API_URL}/api/vpn/disconnect-client`, {
        clientName,
        realAddress
      });
      message.success(`Клиент ${clientName} отключен`);
      fetchStatus();
      fetchServerStats();
    } catch (err) {
      const error = err as AxiosError;
      message.error(`Ошибка отключения: ${error.message}`);
    }
  };

  const updateServerConfig = async (values: ServerConfig) => {
    try {
      await axios.post(`${API_URL}/api/vpn/update-config`, values);
      message.success('Конфигурация сервера обновлена');
      setConfigModalVisible(false);
      fetchServerConfig();
    } catch (err) {
      const error = err as AxiosError;
      message.error(`Ошибка обновления конфигурации: ${error.message}`);
    }
  };

  const createGroup = async (values: { groupName: string }) => {
    try {
      await axios.post(`${API_URL}/api/vpn/create-group`, values);
      message.success(`Группа ${values.groupName} создана`);
      setGroupModalVisible(false);
      groupForm.resetFields();
      fetchGroups();
    } catch (err) {
      const error = err as AxiosError;
      message.error(`Ошибка создания группы: ${error.message}`);
    }
  };

  const updateUserGroups = async (values: { groups: string[] }) => {
    if (!selectedUserForGroups) return;
    try {
      await axios.post(`${API_URL}/api/vpn/update-user-groups`, {
        userName: selectedUserForGroups.commonName,
        groups: values.groups
      });
      message.success(`Группы пользователя ${selectedUserForGroups.commonName} обновлены`);
      setUserGroupsModalVisible(false);
      setSelectedUserForGroups(null);
      fetchProfiles();
      fetchGroups();
    } catch (err) {
      const error = err as AxiosError;
      message.error(`Ошибка обновления групп: ${error.message}`);
    }
  };

  const showEditModal = (profile: Profile) => {
    setEditingProfile(profile);
    setEditPropKey('allow_web_login');
    setEditPropValue(profile.allow_web_login || 'true');
    setIsEditModalVisible(true);
  };

  const handleEditOk = async () => {
    if (!editingProfile) return;
    setLoading(true);
    try {
      await axios.post(`${API_URL}/api/vpn/modify-profile`, {
        clientName: editingProfile.commonName,
        propKey: editPropKey === 'password' ? 'prop_password' : editPropKey,
        propValue: editPropValue,
      });
      message.success(`Профиль для ${editingProfile.commonName} изменён.`);
      setIsEditModalVisible(false);
      fetchProfiles();
    } catch (err) {
      const error = err as AxiosError;
      message.error(`Ошибка изменения: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEditCancel = () => {
    setIsEditModalVisible(false);
    setEditingProfile(null);
  };

  const showUserGroupsModal = (profile: Profile) => {
    setSelectedUserForGroups(profile);
    userGroupsForm.setFieldsValue({
      groups: profile.prop_type ? profile.prop_type.split(',') : []
    });
    setUserGroupsModalVisible(true);
  };

  const historicalChartData = (historicalData || []).map(item => ({
    ...item,
    time: formatDateShort(item.timestamp),
    trafficInMB: item.traffic_in / (1024 * 1024),
    trafficOutMB: item.traffic_out / (1024 * 1024),
    trafficInGB: item.traffic_in / (1024 * 1024 * 1024),
    trafficOutGB: item.traffic_out / (1024 * 1024 * 1024),
  }));

  const statusColumns = [
    { 
      title: 'Имя клиента', 
      dataIndex: 'commonName', 
      key: 'commonName',
      render: (text: string) => (
        <Space>
          <Avatar size="small" icon={<UserOutlined />} />
          <Text strong>{text}</Text>
        </Space>
      )
    },
    { 
      title: 'Реальный IP', 
      dataIndex: 'realAddress', 
      key: 'realAddress',
      render: (text: string) => <Tag color="blue">{text}</Tag>
    },
    { 
      title: 'VPN IP', 
      dataIndex: 'virtualAddress', 
      key: 'virtualAddress',
      render: (text: string) => <Tag color="green">{text || 'N/A'}</Tag>
    },
    { 
      title: 'Получено', 
      dataIndex: 'bytesReceived', 
      key: 'bytesReceived',
      render: (bytes: number) => (
        <Tag icon={<CloudDownloadOutlined />} color="purple">
          {formatBytes(bytes)}
        </Tag>
      )
    },
    { 
      title: 'Отправлено', 
      dataIndex: 'bytesSent', 
      key: 'bytesSent',
      render: (bytes: number) => (
        <Tag icon={<CloudUploadOutlined />} color="cyan">
          {formatBytes(bytes)}
        </Tag>
      )
    },
    {
      title: 'Подключен с',
      dataIndex: 'connectedSinceFormatted',
      key: 'connectedSinceFormatted',
      render: (text: string) => <Tag icon={<GlobalOutlined />}>{text}</Tag>
    },
    {
      title: 'Действия',
      key: 'actions',
      fixed: screens.xs ? undefined : 'right',
      render: (text: string, record: ClientStatus) => (
        <Space>
          <Tooltip title="Отключить">
            <Button 
              danger 
              icon={<PoweroffOutlined />} 
              onClick={() => disconnectClient(record.commonName, record.realAddress)}
              size="small"
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const profilesColumns = [
    { 
      title: 'Имя клиента', 
      dataIndex: 'commonName', 
      key: 'commonName',
      render: (text: string) => (
        <Space>
          <Avatar size="small" icon={<UserOutlined />} />
          <Text strong>{text}</Text>
        </Space>
      )
    },
    {
      title: 'Web доступ',
      dataIndex: 'allow_web_login',
      key: 'webAccess',
      render: (value: string) => (
        <Badge 
          status={value === 'true' ? 'success' : 'error'} 
          text={value === 'true' ? 'Разрешен' : 'Запрещен'} 
        />
      )
    },
    {
      title: 'Статус',
      key: 'status',
      render: (record: Profile) => {
        const isDisabled = record.disabled === 'true';
        return (
          <Badge 
            status={isDisabled ? 'error' : 'success'} 
            text={isDisabled ? 'Отключен' : 'Активен'} 
          />
        );
      }
    },
    {
      title: 'Авто-вход',
      dataIndex: 'auto_login',
      key: 'autoLogin',
      render: (value: string) => (
        <Tag color={value === 'true' ? 'green' : 'default'} icon={value === 'true' ? <SafetyCertificateOutlined /> : undefined}>
          {value === 'true' ? 'Да' : 'Нет'}
        </Tag>
      )
    },
    {
      title: 'Истекает',
      dataIndex: 'expiration_date',
      key: 'expiration',
      render: (date: string) => date ? new Date(date).toLocaleDateString() : 'Бессрочно'
    },
    {
      title: 'Действия',
      key: 'actions',
      fixed: screens.xs ? undefined : 'right',
      render: (text: string, record: Profile) => (
        <Space>
          <Tooltip title="Скачать профиль">
            <Button 
              type="primary" 
              icon={<DownloadOutlined />} 
              onClick={() => downloadProfile(record.commonName)} 
              size="small"
            />
          </Tooltip>
          <Tooltip title="Редактировать">
            <Button 
              icon={<EditOutlined />} 
              onClick={() => showEditModal(record)} 
              size="small"
            />
          </Tooltip>
          <Popconfirm
            title="Удалить профиль?"
            description="Это действие нельзя отменить"
            onConfirm={() => deleteProfile(record.commonName)}
            okText="Да"
            cancelText="Нет"
            icon={<InfoCircleOutlined style={{ color: 'red' }} />}
          >
            <Tooltip title="Удалить">
              <Button 
                danger 
                icon={<DeleteOutlined />} 
                size="small"
              />
            </Tooltip>
          </Popconfirm>
          <Tooltip title="Управление группами">
            <Button 
              icon={<GroupOutlined />} 
              onClick={() => showUserGroupsModal(record)} 
              size="small"
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const groupsColumns = [
    { 
      title: 'Название группы', 
      dataIndex: 'name', 
      key: 'name',
      render: (text: string) => (
        <Space>
          <Avatar size="small" icon={<GroupOutlined />} />
          <Tag color="orange">{text}</Tag>
        </Space>
      )
    },
    { 
      title: 'Доступ', 
      dataIndex: 'access', 
      key: 'access',
      render: (text: string) => (
        <Tag color={text === 'allow' ? 'green' : 'red'} icon={text === 'allow' ? <SafetyCertificateOutlined /> : undefined}>
          {text === 'allow' ? 'Разрешен' : 'Запрещен'}
        </Tag>
      )
    },
    {
      title: 'Пользователи',
      dataIndex: 'users',
      key: 'users',
      render: (users: string[]) => (
        <div>
          {users?.slice(0, 3).map((user: string) => (
            <Tag key={user} color="blue">{user}</Tag>
          ))}
          {users && users.length > 3 && (
            <Tag>+{users.length - 3}</Tag>
          )}
        </div>
      )
    },
    {
      title: 'Действия',
      key: 'actions',
      render: (text: string, record: Group) => (
        <Button 
          type="link" 
          size="small"
          onClick={() => {
            message.info(`Редактирование группы ${record.name} пока не реализовано`);
          }}
        >
          Редактировать
        </Button>
      ),
    },
  ];

  const tabItems: TabsProps['items'] = [
    {
      key: 'dashboard',
      label: (
        <span>
          <DashboardOutlined />
          Дашборд
        </span>
      ),
      children: (
        <div className="space-y-6">
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} lg={6}>
              <Card className="h-full shadow-sm border-t-4 border-t-blue-500" hoverable>
                <Statistic
                  title="Активных клиентов"
                  value={serverStats.activeClients}
                  valueStyle={{ color: '#1890ff' }}
                  prefix={<TeamOutlined />}
                />
                <Progress 
                  percent={Math.round((serverStats.activeClients / 2048) * 100)} 
                  size="small" 
                  status="normal" 
                  strokeColor="#1890ff"
                  className="mt-2"
                />
                <div className="text-xs text-gray-500 mt-1">Максимум: 2048 подключений</div>
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card className="h-full shadow-sm border-t-4 border-t-purple-500" hoverable>
                <Statistic
                  title="Всего профилей"
                  value={serverStats.totalProfiles}
                  valueStyle={{ color: '#722ed1' }}
                  prefix={<UserSwitchOutlined />}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card className="h-full shadow-sm border-t-4 border-t-green-500" hoverable>
                <Statistic
                  title="Входящий трафик"
                  value={formatBytes(serverStats.totalTrafficIn)}
                  valueStyle={{ color: '#52c41a' }}
                  prefix={<CloudDownloadOutlined />}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card className="h-full shadow-sm border-t-4 border-t-red-500" hoverable>
                <Statistic
                  title="Исходящий трафик"
                  value={formatBytes(serverStats.totalTrafficOut)}
                  valueStyle={{ color: '#f5222d' }}
                  prefix={<CloudUploadOutlined />}
                />
              </Card>
            </Col>
          </Row>
          
          <Card 
            title={
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <span className="flex items-center text-lg font-semibold">
                  <LineChartOutlined className="mr-2 text-blue-600" />
                  Исторические данные нагрузки
                </span>
                <RangePicker
                  value={dateRange}
                  onChange={(dates) => dates && setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs])}
                  presets={[
                    { label: 'Последние 7 дней', value: [dayjs().subtract(7, 'days'), dayjs()] },
                    { label: 'Последние 30 дней', value: [dayjs().subtract(30, 'days'), dayjs()] },
                    { label: 'Этот месяц', value: [dayjs().startOf('month'), dayjs()] },
                  ]}
                  format="DD.MM.YYYY"
                  className="w-full sm:w-auto"
                />
              </div>
            } 
            className="shadow-sm border-0"
            loading={loadingHistorical}
          >
            {historicalChartData.length > 0 ? (
              <div className="space-y-8">
                <div>
                  <Title level={5} className="flex items-center mb-4">
                    <TeamOutlined className="mr-2 text-blue-500" />
                    Активные подключения
                  </Title>
                  <div style={{ width: '100%', height: '300px' }}>
                    <ResponsiveContainer>
                      <LineChart data={historicalChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eaeaea" />
                        <XAxis dataKey="time" />
                        <YAxis />
                        <RechartsTooltip />
                        <Line 
                          type="monotone" 
                          dataKey="active_clients" 
                          stroke="#1890ff" 
                          strokeWidth={3}
                          dot={{ fill: '#1890ff', strokeWidth: 2, r: 4 }}
                          activeDot={{ r: 6, stroke: '#1890ff', strokeWidth: 2 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div>
                  <Title level={5} className="flex items-center mb-4">
                    <DatabaseOutlined className="mr-2 text-green-500" />
                    Трафик (GB)
                  </Title>
                  <div style={{ width: '100%', height: '300px' }}>
                    <ResponsiveContainer>
                      <AreaChart data={historicalChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eaeaea" />
                        <XAxis dataKey="time" />
                        <YAxis />
                        <RechartsTooltip 
                          formatter={(value: number) => [`${value.toFixed(2)} GB`, 'Трафик']}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="trafficInGB" 
                          stackId="1" 
                          stroke="#52c41a" 
                          fill="#52c41a" 
                          fillOpacity={0.3}
                          name="Входящий"
                        />
                        <Area 
                          type="monotone" 
                          dataKey="trafficOutGB" 
                          stackId="2" 
                          stroke="#f5222d" 
                          fill="#f5222d" 
                          fillOpacity={0.3}
                          name="Исходящий"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <Row gutter={[16, 16]}>
                  <Col xs={24} sm={12} md={8}>
                    <Card size="small" className="text-center">
                      <Statistic
                        title="Макс. клиентов"
                        value={Math.max(...historicalChartData.map(d => d.active_clients), 0)}
                        prefix={<TeamOutlined />}
                        valueStyle={{ color: '#1890ff' }}
                      />
                    </Card>
                  </Col>
                  <Col xs={24} sm={12} md={8}>
                    <Card size="small" className="text-center">
                      <Statistic
                        title="Ср. входящий трафик"
                        value={(
                          historicalChartData.reduce((sum, d) => sum + d.trafficInGB, 0) / 
                          (historicalChartData.length || 1)
                        ).toFixed(2)}
                        suffix="GB"
                        valueStyle={{ color: '#52c41a' }}
                      />
                    </Card>
                  </Col>
                  <Col xs={24} sm={12} md={8}>
                    <Card size="small" className="text-center">
                      <Statistic
                        title="Ср. исходящий трафик"
                        value={(
                          historicalChartData.reduce((sum, d) => sum + d.trafficOutGB, 0) / 
                          (historicalChartData.length || 1)
                        ).toFixed(2)}
                        suffix="GB"
                        valueStyle={{ color: '#f5222d' }}
                      />
                    </Card>
                  </Col>
                </Row>
              </div>
            ) : (
              <Empty description="Нет исторических данных" />
            )}
          </Card>

          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <Card 
                title="Статус сервера" 
                className="h-full shadow-sm"
                extra={
                  <Badge 
                    status={serverStats.serverStatus === 'online' ? 'success' : 'error'} 
                    text={serverStats.serverStatus === 'online' ? 'Online' : 'Offline'} 
                  />
                }
              >
                <div className="flex items-center space-x-4 mb-4">
                  <div className="bg-gray-100 p-3 rounded-full">
                    <SecurityScanOutlined style={{ fontSize: '24px', color: serverStats.serverStatus === 'online' ? '#52c41a' : '#f5222d' }} />
                  </div>
                  <div>
                    <Text className="text-lg font-medium">
                      Сервер {serverStats.serverStatus === 'online' ? 'онлайн' : 'офлайн'}
                    </Text>
                    <br />
                    <Text type="secondary" className="text-sm">
                      Последнее обновление: {new Date().toLocaleTimeString()}
                    </Text>
                  </div>
                </div>
                <Divider className="my-4" />
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <Text>Порт:</Text>
                    <Tag color="blue">{serverConfig.server_port || 'N/A'}</Tag>
                  </div>
                  <div className="flex justify-between items-center">
                    <Text>Протокол:</Text>
                    <Tag color={serverConfig.protocol === 'udp' ? 'green' : 'volcano'}>
                      {serverConfig.protocol?.toUpperCase() || 'N/A'}
                    </Tag>
                  </div>
                  <div className="flex justify-between items-center">
                    <Text>Шифрование:</Text>
                    <Tag color="purple">{serverConfig.cipher || 'N/A'}</Tag>
                  </div>
                  <div className="flex justify-between items-center">
                    <Text>Аутентификация:</Text>
                    <Tag color="orange">{serverConfig.auth || 'N/A'}</Tag>
                  </div>
                </div>
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card 
                title="Быстрые действия" 
                className="h-full shadow-sm"
              >
                <div className="grid grid-cols-1 gap-3">
                  <Button 
                    icon={<ReloadOutlined />} 
                    onClick={() => {
                      fetchStatus();
                      fetchServerStats();
                      fetchHistoricalData(dateRange[0], dateRange[1]);
                      message.info('Данные обновлены');
                    }}
                    block
                  >
                    Обновить данные
                  </Button>
                  <Button
                    type="primary"
                    icon={<UserAddOutlined />}
                    onClick={() => setCreateModalVisible(true)}
                    block
                  >
                    Создать профиль
                  </Button>
                  <Button
                    icon={<SettingOutlined />}
                    onClick={() => setConfigModalVisible(true)}
                    block
                  >
                    Настроить сервер
                  </Button>
                  <Button
                    icon={<ApartmentOutlined />}
                    onClick={() => setGroupModalVisible(true)}
                    block
                  >
                    Создать группу
                  </Button>
                </div>
              </Card>
            </Col>
          </Row>
        </div>
      ),
    },
    {
      key: 'status',
      label: (
        <span>
          <WifiOutlined />
          Активные подключения
        </span>
      ),
      children: (
        <Card className="shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <Title level={4} className="flex items-center">
              <TeamOutlined className="mr-2" />
              Подключенные клиенты
            </Title>
            <Button icon={<ReloadOutlined />} onClick={fetchStatus} loading={loading}>
              Обновить
            </Button>
          </div>
          <Table
            columns={statusColumns}
            dataSource={clients}
            rowKey="commonName"
            loading={loading}
            pagination={{ pageSize: 10 }}
            scroll={{ x: true }}
            locale={{ emptyText: <Empty description="Нет подключенных клиентов" /> }}
          />
        </Card>
      ),
    },
    {
      key: 'profiles',
      label: (
        <span>
          <UserOutlined />
          Профили
        </span>
      ),
      children: (
        <Card className="shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <Title level={4} className="flex items-center">
              <UserSwitchOutlined className="mr-2" />
              Управление профилями
            </Title>
            <Space>
              <Button
                type="primary"
                icon={<UserAddOutlined />}
                onClick={() => setCreateModalVisible(true)}
              >
                Создать профиль
              </Button>
              <Button icon={<ReloadOutlined />} onClick={fetchProfiles} loading={loading}>
                Обновить
              </Button>
            </Space>
          </div>
          <Table
            columns={profilesColumns}
            dataSource={profiles}
            rowKey="commonName"
            loading={loading}
            pagination={{ pageSize: 10 }}
            scroll={{ x: true }}
            locale={{ emptyText: <Empty description="Нет профилей" /> }}
          />
        </Card>
      ),
    },
    {
      key: 'groups',
      label: (
        <span>
          <GroupOutlined />
          Группы
        </span>
      ),
      children: (
        <Card className="shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <Title level={4} className="flex items-center">
              <ApartmentOutlined className="mr-2" />
              Управление группами
            </Title>
            <Space>
              <Button
                type="primary"
                icon={<ApartmentOutlined />}
                onClick={() => setGroupModalVisible(true)}
              >
                Создать группу
              </Button>
              <Button icon={<ReloadOutlined />} onClick={fetchGroups} loading={loading}>
                Обновить
              </Button>
            </Space>
          </div>
          <Table
            columns={groupsColumns}
            dataSource={groups}
            rowKey="name"
            loading={loading}
            pagination={{ pageSize: 10 }}
            scroll={{ x: true }}
            locale={{ emptyText: <Empty description="Нет групп" /> }}
          />
        </Card>
      ),
    },
  ];

  const renderCreateModal = () => (
    <Modal
      title={
        <span className="flex items-center">
          <UserAddOutlined className="mr-2" />
          Создать новый профиль
        </span>
      }
      open={createModalVisible}
      onCancel={() => {
        setCreateModalVisible(false);
        createForm.resetFields();
      }}
      footer={null}
      destroyOnClose
    >
      <Form
        form={createForm}
        onFinish={createProfile}
        layout="vertical"
        className="mt-4"
      >
        <Form.Item
          name="clientName"
          label="Имя клиента"
          rules={[{ required: true, message: 'Введите имя клиента' }]}
        >
          <Input placeholder="Введите имя клиента" prefix={<UserOutlined />} />
        </Form.Item>
        <Form.Item
          name="password"
          label="Пароль"
          rules={[
            { required: true, message: 'Введите пароль' },
            { min: 8, message: 'Пароль должен содержать минимум 8 символов' },
          ]}
        >
          <Input.Password placeholder="Введите пароль" prefix={<KeyOutlined />} />
        </Form.Item>
        <Form.Item
          name="allow_web_login"
          label="Разрешить веб-доступ"
          valuePropName="checked"
          initialValue={true}
        >
          <Switch defaultChecked />
        </Form.Item>
        <Form.Item
          name="auto_login"
          label="Автоматический вход"
          valuePropName="checked"
          initialValue={false}
        >
          <Switch />
        </Form.Item>
        <Form.Item
          name="expiration_date"
          label="Дата истечения"
        >
          <DatePicker
            format="YYYY-MM-DD"
            style={{ width: '100%' }}
            placeholder="Выберите дату"
          />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              icon={<SaveOutlined />}
            >
              Создать и скачать
            </Button>
            <Button
              onClick={() => {
                setCreateModalVisible(false);
                createForm.resetFields();
              }}
            >
              Отмена
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );

  const renderEditModal = () => (
    <Modal
      title={
        <span className="flex items-center">
          <EditOutlined className="mr-2" />
          Редактировать профиль {editingProfile?.commonName}
        </span>
      }
      open={isEditModalVisible}
      onOk={handleEditOk}
      onCancel={handleEditCancel}
      okText="Сохранить"
      cancelText="Отмена"
      confirmLoading={loading}
    >
      <Form layout="vertical" className="mt-4">
        <Form.Item label="Свойство">
          <Select
            value={editPropKey}
            onChange={setEditPropKey}
            options={[
              { value: 'allow_web_login', label: 'Web доступ' },
              { value: 'auto_login', label: 'Авто-вход' },
              { value: 'disabled', label: 'Статус' },
              { value: 'password', label: 'Пароль' },
            ]}
          />
        </Form.Item>
        <Form.Item label="Значение">
          {editPropKey === 'password' ? (
            <Input.Password
              value={editPropValue}
              onChange={(e) => setEditPropValue(e.target.value)}
              placeholder="Введите новый пароль"
            />
          ) : (
            <Select
              value={editPropValue}
              onChange={setEditPropValue}
              options={
                editPropKey === 'disabled'
                  ? [
                      { value: 'true', label: 'Отключен' },
                      { value: 'false', label: 'Активен' },
                    ]
                  : [
                      { value: 'true', label: 'Да' },
                      { value: 'false', label: 'Нет' },
                    ]
              }
            />
          )}
        </Form.Item>
      </Form>
    </Modal>
  );

  const renderConfigModal = () => (
    <Modal
      title={
        <span className="flex items-center">
          <SettingOutlined className="mr-2" />
          Конфигурация сервера
        </span>
      }
      open={configModalVisible}
      onCancel={() => setConfigModalVisible(false)}
      footer={null}
      destroyOnClose
    >
      <Form
        form={configForm}
        onFinish={updateServerConfig}
        layout="vertical"
        className="mt-4"
      >
        <Form.Item
          name="server_port"
          label="Порт сервера"
          rules={[{ required: true, message: 'Введите порт сервера' }]}
        >
          <Input placeholder="1194" />
        </Form.Item>
        <Form.Item
          name="protocol"
          label="Протокол"
          rules={[{ required: true, message: 'Выберите протокол' }]}
        >
          <Select
            options={[
              { value: 'udp', label: 'UDP' },
              { value: 'tcp', label: 'TCP' },
            ]}
          />
        </Form.Item>
        <Form.Item
          name="cipher"
          label="Шифрование"
          rules={[{ required: true, message: 'Выберите шифрование' }]}
        >
          <Select
            options={[
              { value: 'AES-256-GCM', label: 'AES-256-GCM' },
              { value: 'AES-128-GCM', label: 'AES-128-GCM' },
              { value: 'CHACHA20-POLY1305', label: 'CHACHA20-POLY1305' },
            ]}
          />
        </Form.Item>
        <Form.Item
          name="auth"
          label="Аутентификация"
          rules={[{ required: true, message: 'Выберите метод аутентификации' }]}
        >
          <Select
            options={[
              { value: 'SHA256', label: 'SHA256' },
              { value: 'SHA512', label: 'SHA512' },
            ]}
          />
        </Form.Item>
        <Form.Item
          name="server_network"
          label="Сеть сервера"
          rules={[{ required: true, message: 'Введите сеть сервера' }]}
        >
          <Input placeholder="10.8.0.0" />
        </Form.Item>
        <Form.Item
          name="server_netmask"
          label="Маска подсети"
          rules={[{ required: true, message: 'Введите маску подсети' }]}
        >
          <Input placeholder="255.255.255.0" />
        </Form.Item>
        <Form.Item
          name="push_routes"
          label="Маршруты"
        >
          <Input placeholder="192.168.1.0 255.255.255.0" />
        </Form.Item>
        <Form.Item
          name="duplicate_cn"
          label="Разрешить дублирование CN"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>
        <Form.Item
          name="client_to_client"
          label="Клиент-клиент соединения"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              icon={<SaveOutlined />}
            >
              Сохранить
            </Button>
            <Button onClick={() => setConfigModalVisible(false)}>
              Отмена
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );

  // Модальное окно для создания группы
  const renderGroupModal = () => (
    <Modal
      title={
        <span className="flex items-center">
          <ApartmentOutlined className="mr-2" />
          Создать группу
        </span>
      }
      open={groupModalVisible}
      onCancel={() => {
        setGroupModalVisible(false);
        groupForm.resetFields();
      }}
      footer={null}
      destroyOnClose
    >
      <Form
        form={groupForm}
        onFinish={createGroup}
        layout="vertical"
        className="mt-4"
      >
        <Form.Item
          name="groupName"
          label="Название группы"
          rules={[{ required: true, message: 'Введите название группы' }]}
        >
          <Input placeholder="Введите название группы" prefix={<GroupOutlined />} />
        </Form.Item>
        <Form.Item
          name="access"
          label="Доступ"
          rules={[{ required: true, message: 'Выберите уровень доступа' }]}
        >
          <Select
            options={[
              { value: 'allow', label: 'Разрешен' },
              { value: 'deny', label: 'Запрещен' },
            ]}
          />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              icon={<SaveOutlined />}
            >
              Создать
            </Button>
            <Button
              onClick={() => {
                setGroupModalVisible(false);
                groupForm.resetFields();
              }}
            >
              Отмена
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );

  // Модальное окно для управления группами пользователя
  const renderUserGroupsModal = () => (
    <Modal
      title={
        <span className="flex items-center">
          <UserSwitchOutlined className="mr-2" />
          Группы пользователя {selectedUserForGroups?.commonName}
        </span>
      }
      open={userGroupsModalVisible}
      onCancel={() => {
        setUserGroupsModalVisible(false);
        setSelectedUserForGroups(null);
      }}
      footer={null}
      destroyOnClose
    >
      <Form
        form={userGroupsForm}
        onFinish={updateUserGroups}
        layout="vertical"
        className="mt-4"
      >
        <Form.Item
          name="groups"
          label="Группы"
          rules={[{ required: true, message: 'Выберите группы' }]}
        >
          <Select
            mode="multiple"
            placeholder="Выберите группы"
            options={groups.map(group => ({
              label: group.name,
              value: group.name,
            }))}
          />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              icon={<SaveOutlined />}
            >
              Сохранить
            </Button>
            <Button
              onClick={() => {
                setUserGroupsModalVisible(false);
                setSelectedUserForGroups(null);
              }}
            >
              Отмена
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );

  return (
    <div className="p-4 sm:p-6 bg-gray-50 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <Title level={2} className="flex items-center m-0">
          <SecurityScanOutlined className="mr-2 text-blue-600" />
          Управление VPN
        </Title>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(-1)}
        >
          Назад
        </Button>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        className="mb-6"
      />

      {renderCreateModal()}
      {renderEditModal()}
      {renderConfigModal()}
      {renderGroupModal()}
      {renderUserGroupsModal()}
    </div>
  );
};

export default VPNManagement;