import React from 'react';
import { Link } from 'react-router-dom';
import { EditOutlined } from '@ant-design/icons';

interface ServiceCardProps {
  title: string;
  description: string;
  to: string;
  icon: React.ReactNode;
  disabled?: boolean;
}

const ServiceCard: React.FC<ServiceCardProps> = ({ title, description, to, icon, disabled = false }) => {
  return (
    <Link
      to={disabled ? '#' : to}
      className={`block p-6 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300 border border-gray-200 ${
        disabled ? 'opacity-60 cursor-not-allowed' : 'hover:border-blue-300 cursor-pointer'
      }`}
      onClick={(e) => disabled && e.preventDefault()}
    >
      <div className="flex items-center mb-4">
        <div className="text-blue-600 text-3xl mr-4">
          {icon}
        </div>
        <h3 className="text-xl font-semibold text-gray-800">{title}</h3>
      </div>
      <p className="text-gray-600">{description}</p>
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
          {/* Чат */}
          <ServiceCard
            title="Чат"
            description="Общайтесь с коллегами в каналах и личных сообщениях"
            to="/chat"
            icon={<span>💬</span>}
          />

          {/* Справка */}
          <ServiceCard
            title="Служба поддержки"
            description="Создавайте и отслеживайте заявки в IT-поддержку"
            to="/requests_list"
            icon={<span>🎟️</span>}
          />

          {/* Контакты */}
          <ServiceCard
            title="Контакты"
            description="Поиск сотрудников по имени, отделу или должности"
            to="/contacts"
            icon={<span>📞</span>}
          />

          {/* Редактирование контактов (только для admin) */}
          {isAdmin && (
            <ServiceCard
              title="Редактирование контактов"
              description="Управление контактами Active Directory"
              to="/edit-contacts"
              icon={<EditOutlined style={{ fontSize: '24px' }} />}
            />
          )}

          {/* Админ-панель (только для admin) */}
          {isAdmin && (
            <ServiceCard
              title="Админ-панель"
              description="Управление пользователями и настройками системы"
              to="/admin"
              icon={<span>👮‍♂️</span>}
            />
          )}

          {/* Документы */}
          <ServiceCard
            title="Документы"
            description="Центр хранения внутренних документов и инструкций"
            to="/docs"
            icon={<span>📄</span>}
            disabled={false}
          />

          {/* Опросы */}
          <ServiceCard
            title="Опросы"
            description="Участвуйте в корпоративных опросах и голосованиях"
            to="/polls"
            icon={<span>📊</span>}
            disabled={true}
          />
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