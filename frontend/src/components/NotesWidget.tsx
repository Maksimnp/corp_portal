// components/NotesWidget.tsx
import React, { useState, useEffect } from 'react';
import { PencilSquareIcon } from '@heroicons/react/24/outline';

export const NotesWidget: React.FC<{ theme: string }> = ({ theme }) => {
  const [notes, setNotes] = useState('');
  
  useEffect(() => {
    const saved = localStorage.getItem('dashboard-notes');
    if (saved) setNotes(saved);
  }, []);
  
  const saveNotes = (text: string) => {
    setNotes(text);
    localStorage.setItem('dashboard-notes', text);
  };

  return (
    <div className={`p-4 rounded-2xl h-full border backdrop-blur-sm ${
      theme === 'dark'
        ? 'bg-gray-800/60 border-white/10'
        : 'bg-white/80 border-white/20'
    }`}>
      <div className="flex items-center mb-3">
        <PencilSquareIcon className="h-5 w-5 mr-2 text-cyan-500" />
        <h3 className="font-semibold">Мои заметки</h3>
      </div>
      <textarea
        value={notes}
        onChange={(e) => saveNotes(e.target.value)}
        placeholder="Заметки сохраняются автоматически..."
        className={`w-full h-32 resize-none rounded-xl p-3 text-sm border backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 ${
          theme === 'dark'
            ? 'bg-white/5 border-white/10 text-white placeholder-gray-400'
            : 'bg-white/60 border-gray-300 text-gray-800 placeholder-gray-500'
        }`}
      />
    </div>
  );
};