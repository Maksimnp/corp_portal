import React from 'react';

const BASE_URL_JITSI = import.meta.env.VITE_API_JITSI_URL;

const VideoConferenceButton: React.FC = () => {
  const openConference = () => {
    window.open(BASE_URL_JITSI, '_blank', 'noopener,noreferrer');
  };

  return (
    <button onClick={openConference}>
      Видеоконференции
    </button>
  );
};

export default VideoConferenceButton;
