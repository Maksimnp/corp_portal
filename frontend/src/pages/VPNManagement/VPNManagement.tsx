import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Button, Input, Table, message, Spin } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';

interface ClientStatus {
  commonName: string;
  realAddress: string;
  bytesReceived: number;
  bytesSent: number;
  connectedSince: string | number;
}

const VPNManagement: React.FC = () => {
  const [clients, setClients] = useState<ClientStatus[]>([]);
  const [clientName, setClientName] = useState('');
  const [loading, setLoading] = useState(false);

  const API_URL = process.env.REACT_APP_BACKEND_URL || 'http://192.1.66.117:8000';

  useEffect(() => {
    fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const response = await axios.get<{ clients: ClientStatus[] }>(`${API_URL}/api/vpn/status`);
      setClients(response.data.clients || []);
    } catch (err) {
      console.error('Ошибка получения статуса:', err);
      message.error('Не удалось получить статус подключений');
      setClients([]);
    } finally {
      setLoading(false);
    }
  };

  const createProfile = async () => {
    if (!clientName.trim()) {
      message.error('Введите имя клиента');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(
        `${API_URL}/api/vpn/create-profile`,
        { clientName },
        { responseType: 'blob' }
      );

      const contentDisposition = response.headers['content-disposition'];
      const filenameMatch = contentDisposition?.match(/filename="?([^"]+)"?/);
      const filename = filenameMatch ? filenameMatch[1] : `${clientName}.ovpn`;

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      message.success(`Профиль для ${clientName} успешно создан и загружен`);
      setClientName('');
      fetchStatus(); // обновим статус, чтобы отобразить нового клиента
    } catch (err) {
      console.error('Ошибка создания профиля:', err);
      message.error('Ошибка при создании профиля');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { title: 'Имя клиента', dataIndex: 'commonName', key: 'commonName' },
    { title: 'IP-адрес', dataIndex: 'realAddress', key: 'realAddress' },
    { title: 'Получено (байт)', dataIndex: 'bytesReceived', key: 'bytesReceived' },
    { title: 'Отправлено (байт)', dataIndex: 'bytesSent', key: 'bytesSent' },
    {
      title: 'Подключен с',
      dataIndex: 'connectedSince',
      key: 'connectedSince',
      render: (value: string | number) => {
        let date: Date;
        if (typeof value === 'number') {
          date = new Date(value * 1000);
        } else if (typeof value === 'string' && value) {
          date = new Date(value);
        } else {
          return 'N/A';
        }
        return isNaN(date.getTime()) ? 'N/A' : date.toLocaleString();
      },
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-6">Управление OpenVPN</h1>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Статус подключений</h2>
          <Spin spinning={loading}>
            <Table
              columns={columns}
              dataSource={clients}
              rowKey={(record) => record.commonName + record.realAddress}
              pagination={false}
              bordered
              locale={{ emptyText: 'Подключений нет' }}
            />
          </Spin>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Создать профиль клиента</h2>
          <div className="flex items-center space-x-4">
            <Input
              placeholder="Имя клиента"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="max-w-xs"
              disabled={loading}
              onPressEnter={createProfile}
            />
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={createProfile}
              loading={loading}
              disabled={!clientName.trim() || loading}
            >
              Создать и скачать
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VPNManagement;
