import React from 'react';

const VideoConferenceButton: React.FC = () => {
  const openConference = () => {
    window.open('https://192.1.66.117:8444/', '_blank', 'noopener,noreferrer');
  };

  return (
    <button onClick={openConference}>
      Видеоконференции
    </button>
  );
};

export default VideoConferenceButton;
