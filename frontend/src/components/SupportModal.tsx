import React, { useState, useEffect } from 'react';
import { QuestionMarkCircleIcon, XMarkIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: string;
}

export const SupportModal: React.FC<SupportModalProps> = ({ isOpen, onClose, theme }) => {
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [userInfo, setUserInfo] = useState<any>(null);
  const [isLoadingUserInfo, setIsLoadingUserInfo] = useState(false);

  // Получаем базовые данные из localStorage
  const fullName = localStorage.getItem('username') || 'Неизвестный пользователь';
  const userId = localStorage.getItem('userId') || 'unknown';
  const role = localStorage.getItem('role') || 'user';
  const token = localStorage.getItem('token') || '';

  // Функция для получения расширенной информации о пользователе из AD
  const fetchUserDetails = async () => {
    if (!token) return;
    
    setIsLoadingUserInfo(true);
    try {
      const BASE_URL = import.meta.env.VITE_API_BASE_URL;
      const response = await fetch(`${BASE_URL}/auth/user-details`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const userData = await response.json();
        setUserInfo(userData);
      } else {
        console.warn('Не удалось получить расширенную информацию о пользователе');
        setUserInfo({
          full_name: fullName,
          role: role,
          is_admin: role === 'admin'
        });
      }
    } catch (error) {
      console.error('Error fetching user details:', error);
      setUserInfo({
        full_name: fullName,
        role: role,
        is_admin: role === 'admin'
      });
    } finally {
      setIsLoadingUserInfo(false);
    }
  };

  useEffect(() => {
    if (isOpen && token) {
      fetchUserDetails();
    }
  }, [isOpen, token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus('idle');

    try {
      const BASE_URL = import.meta.env.VITE_API_BASE_URL;
      const supportData = {
        user_info: {
          user_id: userId,
          user_name: fullName,
          user_role: role,
          is_admin: role === 'admin',
          ...(userInfo && {
            ad_username: userInfo.username,
            display_name: userInfo.display_name,
            job_title: userInfo.job_title,
            department: userInfo.department,
            company: userInfo.company,
            telephone_number: userInfo.telephone_number,
            mobile_phone: userInfo.mobile,
            email: userInfo.mail,
          })
        },
        system_info: {
          browser: navigator.userAgent,
          platform: navigator.platform,
          language: navigator.language,
          screen_resolution: `${window.screen.width}x${window.screen.height}`,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          current_url: window.location.href,
        },
        request_info: {
          message: message.trim(),
          timestamp: new Date().toISOString(),
          local_time: new Date().toLocaleString('ru-RU'),
        }
      };

      const response = await fetch(`${BASE_URL}/support/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(supportData),
      });

      if (response.ok) {
        setSubmitStatus('success');
        setMessage('');
        setTimeout(() => {
          onClose();
          setSubmitStatus('idle');
        }, 2000);
      } else {
        const errorText = await response.text();
        console.error('Response error:', errorText);
        throw new Error('Ошибка при отправке запроса');
      }
    } catch (error) {
      console.error('Error sending support request:', error);
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const formatPhone = (phone: string) => {
    if (!phone) return 'Не указан';
    const cleaned = phone.replace(/\D/g, '');
    
    if (cleaned.startsWith('375')) {
      return cleaned.replace(/(\d{3})(\d{2})(\d{3})(\d{2})(\d{2})/, '+$1 ($2) $3-$4-$5');
    }
    
    if (cleaned.length <= 4) {
      return `вн. ${cleaned}`;
    }
    
    return phone;
  };

  const truncateLongText = (text: string, maxLength: number = 30) => {
    if (!text) return '';
    return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={handleOverlayClick}
    >
      <div 
        className={`relative w-full max-w-4xl rounded-3xl shadow-2xl border-2 transform transition-all duration-300 ${
          theme === 'dark'
            ? 'bg-gray-900 border-gray-700'
            : 'bg-white border-gray-200'
        }`}
      >
        {/* Заголовок */}
        <div className={`flex items-center justify-between p-6 border-b ${
          theme === 'dark' ? 'border-gray-700' : 'border-gray-200'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-2xl ${
              theme === 'dark' ? 'bg-cyan-900' : 'bg-cyan-100'
            }`}>
              <QuestionMarkCircleIcon className={`h-6 w-6 ${
                theme === 'dark' ? 'text-cyan-400' : 'text-cyan-600'
              }`} />
            </div>
            <div>
              <h2 className={`text-xl font-bold ${
                theme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>
                Служба поддержки
              </h2>
              <p className={`text-sm ${
                theme === 'dark' ? 'text-gray-300' : 'text-gray-600'
              }`}>
                Опишите вашу проблему или вопрос
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-xl transition-all duration-200 hover:scale-110 ${
              theme === 'dark'
                ? 'text-gray-400 hover:text-white hover:bg-gray-800'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Информация о пользователе */}
        <div className={`p-4 border-b ${
          theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'
        }`}>
          <h3 className={`font-semibold mb-3 ${
            theme === 'dark' ? 'text-cyan-400' : 'text-cyan-600'
          }`}>
            Информация о пользователе
          </h3>
          
          {isLoadingUserInfo ? (
            <div className="flex items-center justify-center py-4">
              <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mr-2" />
              <span className={theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}>
                Загрузка информации из Active Directory...
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>ФИО:</span>
                  <span className={theme === 'dark' ? 'text-white' : 'text-gray-800'}>{userInfo?.full_name || fullName}</span>
                </div>
                <div className="flex justify-between">
                  <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>Логин AD:</span>
                  <span className={theme === 'dark' ? 'text-white' : 'text-gray-800'}>{userInfo?.username || userId}</span>
                </div>
                <div className="flex justify-between">
                  <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>Роль в системе:</span>
                  <span className={theme === 'dark' ? 'text-white' : 'text-gray-800'}>
                    {userInfo?.is_admin ? 'Администратор' : 'Пользователь'}
                  </span>
                </div>
                {userInfo?.job_title && (
                  <div className="flex justify-between">
                    <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>Должность:</span>
                    <span className={theme === 'dark' ? 'text-white' : 'text-gray-800'} title={userInfo.job_title}>
                      {truncateLongText(userInfo.job_title)}
                    </span>
                  </div>
                )}
                {userInfo?.department && (
                  <div className="flex justify-between">
                    <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>Отдел:</span>
                    <span className={theme === 'dark' ? 'text-white' : 'text-gray-800'} title={userInfo.department}>
                      {truncateLongText(userInfo.department)}
                    </span>
                  </div>
                )}
              </div>
              
              <div className="space-y-2">
                {userInfo?.company && (
                  <div className="flex justify-between">
                    <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>Компания:</span>
                    <span className={theme === 'dark' ? 'text-white' : 'text-gray-800'}>{userInfo.company}</span>
                  </div>
                )}
                {userInfo?.office && (
                  <div className="flex justify-between">
                    <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>Офис:</span>
                    <span className={theme === 'dark' ? 'text-white' : 'text-gray-800'}>{userInfo.office}</span>
                  </div>
                )}
                {userInfo?.telephone_number && (
                  <div className="flex justify-between">
                    <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>Рабочий телефон:</span>
                    <span className={theme === 'dark' ? 'text-white' : 'text-gray-800'}>
                      {formatPhone(userInfo.telephone_number)}
                    </span>
                  </div>
                )}
                {userInfo?.mobile && (
                  <div className="flex justify-between">
                    <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>Мобильный телефон:</span>
                    <span className={theme === 'dark' ? 'text-white' : 'text-gray-800'}>
                      {formatPhone(userInfo.mobile)}
                    </span>
                  </div>
                )}
                {userInfo?.mail && (
                  <div className="flex justify-between">
                    <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>Email:</span>
                    <span className={theme === 'dark' ? 'text-white' : 'text-gray-800'}>{userInfo.mail}</span>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {userInfo && (userInfo.manager || userInfo.distinguished_name) && (
            <div className={`mt-4 pt-3 border-t ${
              theme === 'dark' ? 'border-gray-600' : 'border-gray-300'
            }`}>
              <div className="grid grid-cols-1 gap-2 text-xs">
                {userInfo.manager && (
                  <div className="flex justify-between">
                    <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>Руководитель:</span>
                    <span className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} title={userInfo.manager}>
                      {truncateLongText(userInfo.manager, 40)}
                    </span>
                  </div>
                )}
                {userInfo.distinguished_name && (
                  <div className="flex justify-between">
                    <span className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>DN в AD:</span>
                    <span className={theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} title={userInfo.distinguished_name}>
                      {truncateLongText(userInfo.distinguished_name, 50)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="mb-6">
            <label 
              htmlFor="support-message"
              className={`block text-sm font-medium mb-3 ${
                theme === 'dark' ? 'text-gray-200' : 'text-gray-700'
              }`}
            >
              Описание проблемы или вопроса *
            </label>
            <textarea
              id="support-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Подробно опишите вашу проблему, вопрос или предложение. Укажите шаги для воспроизведения проблемы, если это возможно..."
              className={`w-full h-40 px-4 py-3 rounded-2xl border-2 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-transparent transition-all duration-300 resize-none ${
                theme === 'dark'
                  ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-400 hover:border-cyan-600'
                  : 'bg-white border-gray-300 text-gray-800 placeholder-gray-500 hover:border-blue-400'
              }`}
              required
            />
            <div className={`text-xs mt-2 ${
              theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
            }`}>
              Чем подробнее вы опишете проблему, тем быстрее мы сможем помочь
            </div>
          </div>

          {submitStatus === 'success' && (
            <div className={`mb-4 p-3 rounded-2xl border ${
              theme === 'dark' 
                ? 'bg-green-900/20 border-green-700 text-green-300' 
                : 'bg-green-100 border-green-300 text-green-700'
            }`}>
              ✅ Запрос успешно отправлен в службу поддержки
            </div>
          )}

          {submitStatus === 'error' && (
            <div className={`mb-4 p-3 rounded-2xl border ${
              theme === 'dark' 
                ? 'bg-red-900/20 border-red-700 text-red-300' 
                : 'bg-red-100 border-red-300 text-red-700'
            }`}>
              ❌ Ошибка при отправке запроса. Попробуйте позже.
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className={`px-6 py-3 rounded-2xl border-2 transition-all duration-300 font-medium ${
                theme === 'dark'
                  ? 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700 hover:border-gray-500'
                  : 'bg-gray-100 border-gray-300 text-gray-600 hover:bg-gray-200 hover:border-gray-400'
              }`}
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !message.trim()}
              className={`px-6 py-3 rounded-2xl border-2 transition-all duration-300 font-medium flex items-center gap-2 ${
                isSubmitting || !message.trim()
                  ? theme === 'dark'
                    ? 'bg-gray-700 border-gray-600 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-300 border-gray-400 text-gray-500 cursor-not-allowed'
                  : theme === 'dark'
                    ? 'bg-cyan-600 border-cyan-500 text-white hover:bg-cyan-500 hover:border-cyan-400'
                    : 'bg-cyan-500 border-cyan-400 text-white hover:bg-cyan-400 hover:border-cyan-300'
              }`}
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Отправка...
                </>
              ) : (
                <>
                  <PaperAirplaneIcon className="h-4 w-4" />
                  Отправить запрос
                </>
              )}
            </button>
          </div>
        </form>

        <div className={`p-4 rounded-b-3xl ${
          theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'
        }`}>
          <p className={`text-xs text-center ${
            theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
          }`}>
            Запрос будет отправлен на portal@minskhleb.by и обработан в ближайшее время. 
            Вся информация из Active Directory будет включена в запрос для быстрого решения проблемы.
          </p>
        </div>
      </div>
    </div>
  );
};