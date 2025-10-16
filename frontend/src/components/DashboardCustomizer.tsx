// components/DashboardCustomizer.tsx
import React, { useState, useEffect } from 'react';
import { 
  Cog6ToothIcon,
  PlusIcon,
  TrashIcon,
  EyeIcon,
  EyeSlashIcon,
  BellIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon
} from '@heroicons/react/24/outline';
import { useTheme } from '../hooks/ThemeContext';

export interface CustomCard {
  id: string;
  title: string;
  type: 'service' | 'widget' | 'custom';
  serviceId?: string;
  position: { x: number; y: number };
  size: 'small' | 'medium' | 'large';
  isVisible: boolean;
  settings?: any;
}

export interface ServiceNotification {
  serviceId: string;
  enabled: boolean;
  types: string[];
  frequency: 'instant' | 'daily' | 'weekly';
  email: boolean;
  push: boolean;
}

interface DashboardCustomizerProps {
  isOpen: boolean;
  onClose: () => void;
}

const DashboardCustomizer: React.FC<DashboardCustomizerProps> = ({ isOpen, onClose }) => {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<'cards' | 'notifications' | 'layout'>('cards');
  const [customCards, setCustomCards] = useState<CustomCard[]>([]);
  const [notifications, setNotifications] = useState<ServiceNotification[]>([]);
  const [availableServices, setAvailableServices] = useState<any[]>([]);

  // Загрузка данных при открытии
  useEffect(() => {
    if (isOpen) {
      loadUserPreferences();
    }
  }, [isOpen]);

  const loadUserPreferences = async () => {
    try {
      const savedCards = localStorage.getItem('dashboard-cards');
      const savedNotifications = localStorage.getItem('dashboard-notifications');
      
      if (savedCards) {
        setCustomCards(JSON.parse(savedCards));
      }
      
      if (savedNotifications) {
        setNotifications(JSON.parse(savedNotifications));
      }
      
      // Загружаем доступные сервисы
      const role = localStorage.getItem('role') || 'user';
      const isAdmin = role === 'admin';
      const services = [
        { id: 'chat', title: 'Чат', description: 'Мессенджер' },
        { id: 'support', title: 'Поддержка', description: 'Тикеты' },
        { id: 'contacts', title: 'Контакты', description: 'Сотрудники' },
        { id: 'meetings', title: 'Встречи', description: 'Видеоконференции' },
        { id: 'docs', title: 'Документы', description: 'Файлы' },
        { id: 'stats', title: 'Статистика', description: 'Метрики' },
        { id: 'vpn', title: 'VPN', description: 'Подключения' },
        { id: 'faq', title: 'FAQ', description: 'Помощь' },
        { id: 'software', title: 'ПО', description: 'Программы' },
      ].filter(service => service.id !== 'admin' || isAdmin);
      
      setAvailableServices(services);
    } catch (error) {
      console.error('Error loading preferences:', error);
    }
  };

  const savePreferences = () => {
    localStorage.setItem('dashboard-cards', JSON.stringify(customCards));
    localStorage.setItem('dashboard-notifications', JSON.stringify(notifications));
  };

  const addCard = (serviceId: string) => {
    const newCard: CustomCard = {
      id: `card-${Date.now()}`,
      title: availableServices.find(s => s.id === serviceId)?.title || 'Новая карточка',
      type: 'service',
      serviceId,
      position: { x: 0, y: customCards.length * 100 },
      size: 'medium',
      isVisible: true
    };
    
    setCustomCards(prev => [...prev, newCard]);
  };

  const removeCard = (cardId: string) => {
    setCustomCards(prev => prev.filter(card => card.id !== cardId));
  };

  const toggleCardVisibility = (cardId: string) => {
    setCustomCards(prev => 
      prev.map(card => 
        card.id === cardId ? { ...card, isVisible: !card.isVisible } : card
      )
    );
  };

  const updateCardSize = (cardId: string, size: 'small' | 'medium' | 'large') => {
    setCustomCards(prev => 
      prev.map(card => 
        card.id === cardId ? { ...card, size } : card
      )
    );
  };

  const updateNotification = (serviceId: string, updates: Partial<ServiceNotification>) => {
    setNotifications(prev => {
      const existing = prev.find(n => n.serviceId === serviceId);
      if (existing) {
        return prev.map(n => n.serviceId === serviceId ? { ...n, ...updates } : n);
      } else {
        return [...prev, { serviceId, enabled: true, types: [], frequency: 'instant', email: false, push: true, ...updates }];
      }
    });
  };

  const handleSave = () => {
    savePreferences();
    onClose();
    // Можно добавить уведомление об успешном сохранении
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Overlay */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />
      
      {/* Модальное окно */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className={`relative w-full max-w-4xl rounded-3xl shadow-2xl border backdrop-blur-2xl transform transition-all ${
            theme === 'dark'
              ? 'bg-gray-800/95 border-white/10'
              : 'bg-white/95 border-white/20'
          }`}
        >
          {/* Заголовок */}
          <div className={`p-6 border-b ${
            theme === 'dark' ? 'border-white/10' : 'border-gray-200'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Cog6ToothIcon className="h-8 w-8 text-cyan-500" />
                <div>
                  <h2 className="text-2xl font-bold">Настройка дашборда</h2>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    Настройте внешний вид и уведомления
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className={`p-2 rounded-xl transition-all duration-200 ${
                  theme === 'dark'
                    ? 'hover:bg-white/10 text-gray-400 hover:text-white'
                    : 'hover:bg-black/10 text-gray-500 hover:text-gray-800'
                }`}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Табы */}
          <div className={`border-b ${
            theme === 'dark' ? 'border-white/10' : 'border-gray-200'
          }`}>
            <nav className="flex space-x-8 px-6">
              {[
                { id: 'cards' as const, name: 'Карточки', icon: PlusIcon },
                { id: 'notifications' as const, name: 'Уведомления', icon: BellIcon },
                { id: 'layout' as const, name: 'Расположение', icon: ArrowsPointingOutIcon },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-all duration-200 ${
                    activeTab === tab.id
                      ? theme === 'dark'
                        ? 'border-cyan-500 text-cyan-400'
                        : 'border-cyan-600 text-cyan-600'
                      : theme === 'dark'
                      ? 'border-transparent text-gray-400 hover:text-gray-300'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <tab.icon className="h-4 w-4" />
                  <span>{tab.name}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* Контент */}
          <div className="p-6 max-h-96 overflow-y-auto">
            {activeTab === 'cards' && (
              <div className="space-y-6">
                {/* Доступные сервисы */}
                <div>
                  <h3 className={`text-lg font-semibold mb-4 ${
                    theme === 'dark' ? 'text-white' : 'text-gray-900'
                  }`}>
                    Добавить карточки
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {availableServices.map(service => (
                      <button
                        key={service.id}
                        onClick={() => addCard(service.id)}
                        className={`p-4 rounded-2xl text-left transition-all duration-200 border backdrop-blur-sm ${
                          theme === 'dark'
                            ? 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-cyan-500/20'
                            : 'bg-black/5 border-gray-200 hover:bg-black/10 hover:border-cyan-300/50'
                        }`}
                      >
                        <h4 className={`font-medium mb-1 ${
                          theme === 'dark' ? 'text-white' : 'text-gray-900'
                        }`}>
                          {service.title}
                        </h4>
                        <p className={`text-sm ${
                          theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                        }`}>
                          {service.description}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Мои карточки */}
                <div>
                  <h3 className={`text-lg font-semibold mb-4 ${
                    theme === 'dark' ? 'text-white' : 'text-gray-900'
                  }`}>
                    Мои карточки ({customCards.length})
                  </h3>
                  {customCards.length === 0 ? (
                    <div className={`text-center py-8 rounded-2xl ${
                      theme === 'dark' ? 'bg-white/5' : 'bg-black/5'
                    }`}>
                      <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>
                        Добавьте карточки сервисов для отображения на дашборде
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {customCards.map(card => (
                        <div
                          key={card.id}
                          className={`p-4 rounded-2xl border backdrop-blur-sm ${
                            theme === 'dark'
                              ? 'bg-white/5 border-white/10'
                              : 'bg-black/5 border-gray-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <button
                                onClick={() => toggleCardVisibility(card.id)}
                                className={`p-2 rounded-xl transition-all duration-200 ${
                                  theme === 'dark'
                                    ? 'hover:bg-white/10'
                                    : 'hover:bg-black/10'
                                }`}
                              >
                                {card.isVisible ? (
                                  <EyeIcon className="h-4 w-4 text-green-500" />
                                ) : (
                                  <EyeSlashIcon className="h-4 w-4 text-gray-500" />
                                )}
                              </button>
                              <div>
                                <h4 className={`font-medium ${
                                  theme === 'dark' ? 'text-white' : 'text-gray-900'
                                }`}>
                                  {card.title}
                                </h4>
                                <p className={`text-sm ${
                                  theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                                }`}>
                                  Размер: {card.size === 'small' ? 'Маленький' : card.size === 'medium' ? 'Средний' : 'Большой'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              {/* Селектор размера */}
                              <select
                                value={card.size}
                                onChange={(e) => updateCardSize(card.id, e.target.value as any)}
                                className={`text-sm rounded-lg px-3 py-1 border backdrop-blur-sm ${
                                  theme === 'dark'
                                    ? 'bg-white/5 border-white/10 text-white'
                                    : 'bg-white border-gray-300 text-gray-900'
                                }`}
                              >
                                <option value="small">Маленький</option>
                                <option value="medium">Средний</option>
                                <option value="large">Большой</option>
                              </select>
                              
                              <button
                                onClick={() => removeCard(card.id)}
                                className={`p-2 rounded-xl transition-all duration-200 ${
                                  theme === 'dark'
                                    ? 'hover:bg-red-500/20 text-red-400'
                                    : 'hover:bg-red-500/10 text-red-500'
                                }`}
                              >
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="space-y-6">
                <h3 className={`text-lg font-semibold ${
                  theme === 'dark' ? 'text-white' : 'text-gray-900'
                }`}>
                  Настройка уведомлений
                </h3>
                
                <div className="space-y-4">
                  {availableServices.map(service => {
                    const notification = notifications.find(n => n.serviceId === service.id);
                    const isEnabled = notification?.enabled ?? false;
                    
                    return (
                      <div
                        key={service.id}
                        className={`p-4 rounded-2xl border backdrop-blur-sm ${
                          theme === 'dark'
                            ? 'bg-white/5 border-white/10'
                            : 'bg-black/5 border-gray-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className={`font-medium ${
                              theme === 'dark' ? 'text-white' : 'text-gray-900'
                            }`}>
                              {service.title}
                            </h4>
                            <p className={`text-sm ${
                              theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                            }`}>
                              {service.description}
                            </p>
                          </div>
                          
                          <div className="flex items-center space-x-4">
                            {/* Тумблер уведомлений */}
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isEnabled}
                                onChange={(e) => updateNotification(service.id, { enabled: e.target.checked })}
                                className="sr-only peer"
                              />
                              <div className={`w-11 h-6 rounded-full peer ${
                                theme === 'dark'
                                  ? 'bg-gray-700 peer-checked:bg-cyan-600'
                                  : 'bg-gray-300 peer-checked:bg-cyan-500'
                              } transition-colors duration-200`}>
                                <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200 ${
                                  isEnabled ? 'translate-x-5' : ''
                                }`} />
                              </div>
                            </label>
                          </div>
                        </div>
                        
                        {/* Дополнительные настройки уведомлений */}
                        {isEnabled && (
                          <div className="mt-4 pl-8 space-y-3">
                            <div className="flex items-center space-x-4">
                              <label className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  checked={notification?.push ?? true}
                                  onChange={(e) => updateNotification(service.id, { push: e.target.checked })}
                                  className="rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                                />
                                <span className={`text-sm ${
                                  theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                                }`}>
                                  Push-уведомления
                                </span>
                              </label>
                              
                              <label className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  checked={notification?.email ?? false}
                                  onChange={(e) => updateNotification(service.id, { email: e.target.checked })}
                                  className="rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                                />
                                <span className={`text-sm ${
                                  theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                                }`}>
                                  Email
                                </span>
                              </label>
                            </div>
                            
                            <div>
                              <label className={`block text-sm font-medium mb-2 ${
                                theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                              }`}>
                                Частота уведомлений
                              </label>
                              <select
                                value={notification?.frequency || 'instant'}
                                onChange={(e) => updateNotification(service.id, { frequency: e.target.value as any })}
                                className={`w-full text-sm rounded-lg px-3 py-2 border backdrop-blur-sm ${
                                  theme === 'dark'
                                    ? 'bg-white/5 border-white/10 text-white'
                                    : 'bg-white border-gray-300 text-gray-900'
                                }`}
                              >
                                <option value="instant">Мгновенно</option>
                                <option value="daily">Ежедневно</option>
                                <option value="weekly">Еженедельно</option>
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'layout' && (
              <div className="space-y-6">
                <h3 className={`text-lg font-semibold ${
                  theme === 'dark' ? 'text-white' : 'text-gray-900'
                }`}>
                  Настройка расположения
                </h3>
                
                <div className={`p-4 rounded-2xl ${
                  theme === 'dark' ? 'bg-white/5' : 'bg-black/5'
                }`}>
                  <p className={`text-sm ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    Перетаскивайте карточки на главном экране для изменения их расположения.
                    Изменения сохраняются автоматически.
                  </p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    onClick={() => {
                      // Сброс к расположению по умолчанию
                      const defaultCards = customCards.map((card, index) => ({
                        ...card,
                        position: { x: 0, y: index * 100 }
                      }));
                      setCustomCards(defaultCards);
                    }}
                    className={`p-4 rounded-2xl text-center transition-all duration-200 border backdrop-blur-sm ${
                      theme === 'dark'
                        ? 'bg-white/5 border-white/10 hover:bg-white/10'
                        : 'bg-black/5 border-gray-200 hover:bg-black/10'
                    }`}
                  >
                    <ArrowsPointingOutIcon className="h-8 w-8 mx-auto mb-2 text-cyan-500" />
                    <span className={theme === 'dark' ? 'text-white' : 'text-gray-900'}>
                      Сбросить расположение
                    </span>
                  </button>
                  
                  <button
                    onClick={() => {
                      // Экспорт настроек
                      const config = {
                        cards: customCards,
                        notifications: notifications,
                        exportedAt: new Date().toISOString()
                      };
                      const dataStr = JSON.stringify(config, null, 2);
                      const dataBlob = new Blob([dataStr], { type: 'application/json' });
                      const url = URL.createObjectURL(dataBlob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = 'dashboard-config.json';
                      link.click();
                    }}
                    className={`p-4 rounded-2xl text-center transition-all duration-200 border backdrop-blur-sm ${
                      theme === 'dark'
                        ? 'bg-white/5 border-white/10 hover:bg-white/10'
                        : 'bg-black/5 border-gray-200 hover:bg-black/10'
                    }`}
                  >
                    <Cog6ToothIcon className="h-8 w-8 mx-auto mb-2 text-cyan-500" />
                    <span className={theme === 'dark' ? 'text-white' : 'text-gray-900'}>
                      Экспорт настроек
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Футер */}
          <div className={`p-6 border-t ${
            theme === 'dark' ? 'border-white/10' : 'border-gray-200'
          }`}>
            <div className="flex justify-end space-x-3">
              <button
                onClick={onClose}
                className={`px-6 py-2 rounded-2xl font-medium transition-all duration-200 ${
                  theme === 'dark'
                    ? 'bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white'
                    : 'bg-black/5 border border-gray-300 text-gray-700 hover:bg-black/10 hover:text-gray-900'
                }`}
              >
                Отмена
              </button>
              <button
                onClick={handleSave}
                className="px-6 py-2 rounded-2xl font-medium bg-cyan-500 text-white hover:bg-cyan-600 transition-all duration-200 shadow-lg hover:shadow-cyan-500/25"
              >
                Сохранить изменения
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardCustomizer;