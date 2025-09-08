import React from 'react';
import { Link } from 'react-router-dom';
import { EditOutlined, VideoCameraOutlined, QuestionCircleOutlined } from '@ant-design/icons';

const services = [
  { title: 'Чат', description: 'Общайтесь с коллегами в каналах и личных сообщениях', to: '/chat', icon: '💬' },
  { title: 'Служба поддержки', description: 'Создавайте и отслеживайте заявки в IT-поддержку', to: '/requests_list', icon: '🎟️' },
  { title: 'Контакты', description: 'Поиск сотрудников по имени, отделу или должности', to: '/contacts', icon: '📞' },
  { title: 'Видеоконференции', description: 'Проводите онлайн-встречи и совещания', to: '/jitsi', icon: <VideoCameraOutlined style={{ fontSize: '24px' }} /> },
  { title: 'Редактирование контактов', description: 'Управление контактами Active Directory', to: '/edit-contacts', icon: <EditOutlined style={{ fontSize: '24px' }} />, isAdminOnly: true },
  { title: 'Админ-панель', description: 'Управление пользователями и настройками системы', to: '/admin', icon: '👮‍♂️', isAdminOnly: true },
  { title: 'Документы', description: 'Центр хранения внутренних документов и инструкций', to: '/docs', icon: '📄' },
  { title: 'Статистика серверов', description: 'Просмотр статистики серверов', to: '/serverstats', icon: '📊', disabled: false },
  { title: 'VPN Управление', description: 'Управление подключениями и профилями OpenVPN', to: '/VPNManagement', icon: '🔒', isAdminOnly: true },
  { title: 'Часто задаваемые вопросы', description: 'Ответы на популярные вопросы', to: '/faq', icon: <QuestionCircleOutlined style={{ fontSize: '24px' }} /> },
];
const JITSI_URL = import.meta.env.VITE_API_JITSI_URL;

const ServiceCard: React.FC<{ service: typeof services[number] }> = ({ service }) => {
  const role = localStorage.getItem('role') || 'user';
  const isAdmin = role === 'admin';
  const isDisabled = service.disabled || (service.isAdminOnly && !isAdmin);

  const isVideoConf = service.title === 'Видеоконференции';
  const isVPNManagement = service.title === 'VPN Управление';

  const handleClick = (e: React.MouseEvent) => {
    if (isDisabled) {
      e.preventDefault();
      return;
    }

    e.preventDefault();

    if (isVideoConf) {
      window.open(JITSI_URL, '_blank', 'noopener,noreferrer');
    } else if (isVPNManagement) {
      window.open('https://192.1.66.10:943/admin', '_blank', 'noopener,noreferrer');
    }
  };

  if (isVideoConf || isVPNManagement) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handleClick(e as any);
          }
        }}
        className={`block p-6 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300 border border-gray-200 ${
          isDisabled ? 'opacity-60 cursor-not-allowed' : 'hover:border-blue-300 cursor-pointer'
        }`}
      >
        <div className="flex items-center mb-4">
          <div className="text-blue-600 text-3xl mr-4">{service.icon}</div>
          <h3 className="text-xl font-semibold text-gray-800">{service.title}</h3>
        </div>
        <p className="text-gray-600">{service.description}</p>
      </div>
    );
  }

  return (
    <Link
      to={isDisabled ? '#' : service.to}
      className={`block p-6 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300 border border-gray-200 ${
        isDisabled ? 'opacity-60 cursor-not-allowed' : 'hover:border-blue-300 cursor-pointer'
      }`}
      onClick={(e) => isDisabled && e.preventDefault()}
    >
      <div className="flex items-center mb-4">
        <div className="text-blue-600 text-3xl mr-4">{service.icon}</div>
        <h3 className="text-xl font-semibold text-gray-800">{service.title}</h3>
      </div>
      <p className="text-gray-600">{service.description}</p>
    </Link>
  );
};

export const Dashboard: React.FC = () => {
  const role = localStorage.getItem('role') || 'user';
  const isAdmin = role === 'admin';
  const fullName = localStorage.getItem('username') || 'Пользователь';

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Заголовок */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-800">Добро пожаловать в Корпоративный Портал</h1>
          <p className="text-gray-600 mt-2">Выберите сервис для продолжения работы</p>
        </div>

        {/* Сетка сервисов */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.filter(({ isAdminOnly }) => !isAdminOnly || isAdmin).map((service) => (
            <ServiceCard key={service.title} service={service} />
          ))}
        </div>

        {/* Профиль и выход */}
        <div className="mt-12 text-center">
          <div className="inline-block bg-white rounded-lg shadow px-6 py-4">
            <p className="text-gray-700">
              Вы вошли как{' '}
              <strong>{fullName}</strong>
              <span className={`ml-2 px-2 py-1 text-xs rounded ${
                isAdmin ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
              }`}>
                {role}
              </span>
            </p>
            <button
              onClick={() => {
                localStorage.removeItem('token');
                localStorage.removeItem('role');
                localStorage.removeItem('username');
                window.location.href = '/';
              }}
              className="mt-3 text-sm text-red-600 hover:text-red-800 underline"
            >
              Выйти из системы
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};