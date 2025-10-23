import React, { useState } from 'react';
import { ArrowBendUpLeft, ArrowBendUpRight, Download, X, MagnifyingGlassPlus, MagnifyingGlassMinus, ArrowLeft, ArrowRight } from 'phosphor-react';
import type { Chat, Message } from '../../../types/chat';
import { useTheme } from '../../../hooks/ThemeContext';
import { formatTimestamp, getChatDisplayIcon, getChatDisplayName, getTypingText, formatTimestampSidebar, resolveFileUrl } from '../../../utils/chat';
import { DeleteOutlined } from '@ant-design/icons';
import './ImageModal.css';
interface ImageModalProps {
    handleContextMenuQuote: () => void;
    showImageModal: boolean;
    setShowImageModal: React.Dispatch<React.SetStateAction<boolean>>;
    imageUrl: Message | null;
    currentChat: Chat | undefined;
    contactMap: { [key: string]: string };
    username: string | null;
    deleteMessage: (msg: Message) => Promise<void>;
    setQuotedMessage: React.Dispatch<React.SetStateAction<Message | null>>;
}

const ImageModal: React.FC<ImageModalProps> = ({
    handleContextMenuQuote,
    showImageModal,
    setShowImageModal,
    imageUrl,
    currentChat,
    contactMap,
    username,
    deleteMessage,
    setQuotedMessage
}) => {
    const { theme } = useTheme();
    const API_BASE = import.meta.env.VITE_API_BASE_URL;
    const [zoomScale, setZoomScale] = useState<string>("100");
    const [isDragging, setIsDragging] = useState<boolean>(false);
    if (!showImageModal || !currentChat) return null;


    const handleDownload = () => {
        if (!imageUrl?.file_url) return;

        const filename = imageUrl.file_url.split('/').pop();
        if (!filename) return;

        const link = document.createElement('a');
        link.href = `${API_BASE}/chat/download/chat_file/${filename}`;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const toggleImageZoom = () => {
        setZoomScale(prev => prev === "100" ? "200" : "100");
    };

    const handleSliderMouseUp = () => {
        setIsDragging(false);
        if (parseInt(zoomScale) <= 100) {
        setZoomScale("100");
        }
    };

    const handleSliderMouseDown = () => {
        setIsDragging(true);
    };

    const handleSliderBlur = () => {
        if (isDragging && parseInt(zoomScale) <= 100) {
        setZoomScale("100");
        }
        setIsDragging(false);
    };

    const handleBackdropClick = () => {
        setShowImageModal(false);
    };

    const handleContentClick = (e: React.MouseEvent) => {
        e.stopPropagation();
    };

    return (
    <div className="fixed flex flex-col inset-0 bg-black/60 z-[200] backdrop-blur-md animate-in fade-in-0" onClick={handleBackdropClick}>
            <div className="flex justify-between w-full h-16 z-[210]" onClick={(e) => {e.stopPropagation();}}>
                <div className='flex items-center gap-2 pr-2 pl-2'>
                    <span className='text-white'>{getChatDisplayIcon(currentChat, 30, theme)}</span>
                    <span className='text-white'>{imageUrl?.sender && contactMap[imageUrl?.sender]}</span>
                </div>
                <div className='flex items-center justify-center gap-2'>
                    <button
                        onClick={() => {setQuotedMessage(imageUrl);setTimeout(() => setShowImageModal(false), 100);}}
                        className={`font-semibold w-10 h-10 rounded-full text-sm ${theme === 'light' ? 'text-white hover:bg-gray-500/50' : 'text-gray-400 hover:bg-gray-700/75 hover:text-white'} cursor-pointer flex items-center justify-center`}
                    >
                        <ArrowBendUpLeft className="text-2xl" />
                    </button>
                    {imageUrl?.sender === username && (
                    <>
                        <button
                        onClick={() => {deleteMessage(imageUrl)}}
                        className={`w-10 h-10 rounded-full font-semibold text-sm ${theme === 'light' ? 'text-red-600 hover:bg-red-100' : 'text-red-500 hover:bg-red-900/50'} cursor-pointer flex items-center justify-center`}
                        >
                            <DeleteOutlined className="text-xl" />
                        </button>
                    </>
                    )}
                    <button
                        onClick={handleDownload}
                        className={`font-semibold w-10 h-10 rounded-full text-sm ${theme === 'light' ? 'text-white hover:bg-gray-500/50' : 'text-gray-400 hover:bg-gray-700/75 hover:text-white'} cursor-pointer flex items-center justify-center`}
                    >
                        <Download className="text-xl" />
                    </button>
                    <button
                        onClick={toggleImageZoom}
                        className={`font-semibold w-10 h-10 rounded-full text-sm ${theme === 'light' ? 'text-white hover:bg-gray-500/50' : 'text-gray-400 hover:bg-gray-700/75 hover:text-white'} cursor-pointer flex items-center justify-center`}
                    >
                        {zoomScale === '100' ? <MagnifyingGlassPlus className="text-xl" /> : <MagnifyingGlassMinus className="text-xl" />}
                    </button>
                    <button
                        onClick={() => {setShowImageModal(false)}}
                        className={`font-semibold w-10 h-10 rounded-full text-sm ${theme === 'light' ? 'text-white hover:bg-gray-500/50' : 'text-gray-400 hover:bg-gray-700/75 hover:text-white'} cursor-pointer flex items-center justify-center`}
                    >
                        <X className="text-xl" />
                    </button>
                </div>
            </div>
            <div className='flex items-center justify-between h-full'>
                <div className='w-25 h-full flex items-center justify-center cursor-pointer opacity-0 hover:opacity-100 transition-opacity transform-opacity duration-300' onClick={(e) => {e.stopPropagation();}}>
                    <ArrowLeft className='text-5xl text-white'/>
                </div>
                <div className='flex flex-col items-center justify-center' onClick={handleContentClick}>
                    <img 
                        src={resolveFileUrl(imageUrl?.file_url)}  
                        className={`rounded-lg object-contain max-h-250 duration-300 transition-transform`}
                        style={{ transform: `scale(${Number(zoomScale) / 100})` }}   
                        onClick={(e) => e.stopPropagation()} 
                    />
                    <span className={`mt-5 ${theme === 'light' ? 'text-black' : 'text-white'}`}>{imageUrl?.content}</span>
                    {parseInt(zoomScale) != 100 && (<div className='flex items-center justify-center bg-black/25 p-3 rounded-full gap-3 z-[210]' >
                        <MagnifyingGlassPlus className="text-4xl text-white" />
                        <input 
                            type='range'
                            min="50"
                            max="400"
                            value={zoomScale}
                            onChange={(e) => setZoomScale(e.target.value)}
                            onMouseDown={handleSliderMouseDown}
                            onMouseUp={handleSliderMouseUp}
                            onBlur={handleSliderBlur} 
                            className="image-zoom-slider"
                        ></input>
                        <MagnifyingGlassMinus className="text-4xl text-white" />
                    </div>)}
                </div>
                <div className='w-25 h-full flex items-center justify-center cursor-pointer opacity-0 hover:opacity-100 transition-opacity transform-opacity duration-300' onClick={(e) => {e.stopPropagation();}}>
                    <ArrowRight className='text-5xl text-white'/>
                </div>
            </div>
    </div>
  );
};

export default ImageModal;