import React, { useState } from 'react';

interface UserProfileModalProps {
  initialName: string;
  initialAvatar: string;
  onSave: (newName: string, newAvatar: string) => void;
  onClose: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  initialName,
  initialAvatar,
  onSave,
  onClose,
}) => {
  const [name, setName] = useState(initialName);
  const [avatar, setAvatar] = useState(initialAvatar);
  const [file, setFile] = useState<File | null>(null);

  const handleSave = () => {
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          onSave(name, reader.result);
        } else {
          console.error('Ошибка: reader.result не является строкой');
        }
      };
      reader.onerror = () => {
        console.error('Ошибка чтения файла');
      };
      reader.readAsDataURL(file);
    } else {
      onSave(name, avatar);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded shadow w-1/3">
        <h2 className="text-xl font-bold mb-4">Профиль</h2>
        <div className="mb-4 flex flex-col items-center">
          <img src={avatar} alt="Аватар" className="w-24 h-24 rounded-full mb-2" />
          <input
            type="file"
            accept="image/*"
            onChange={(e) => e.target.files && setFile(e.target.files[0])}
          />
        </div>
        <div className="mb-4">
          <label className="block mb-2">Имя</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border w-full p-2 rounded"
          />
        </div>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="mr-2 px-4 py-2 bg-gray-300 rounded"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-500 text-white rounded"
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
};