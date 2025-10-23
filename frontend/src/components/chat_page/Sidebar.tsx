import { MagnifyingGlass, Plus, Users, User, Broadcast, ArrowLeft, Moon, Sun, Check, Checks, ArrowBendUpLeft } from "phosphor-react";
import type React from "react";
import { formatTimestamp, getChatDisplayIcon, getChatDisplayName, getTypingText, formatTimestampSidebar, messageIsPhoto, resolveFileUrl } from '../../utils/chat';
import type { Chat, Message, Contact } from '../../types/chat';
import type { NewLifecycle } from "react";
import { useTheme } from '../../hooks/ThemeContext';
import { Link } from "react-router-dom";

interface RenderSidebarProps {
	searchQuery: string;
	setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
	setShowCreateOptions: React.Dispatch<React.SetStateAction<boolean>>;
	showCreateOptions: boolean;
	createOptionsRef: React.RefObject<HTMLDivElement | null>;
	setShowContactSearch: React.Dispatch<React.SetStateAction<boolean>>;
	setShowCreateGroup: React.Dispatch<React.SetStateAction<boolean>>;
	setShowCreateChannel: React.Dispatch<React.SetStateAction<boolean>>;
	isLoadingChats: boolean;
	filteredChats: Chat[];
	setActiveChat: React.Dispatch<React.SetStateAction<string | null>>;
	userStatuses: { [username: string]: string };
	contactMap: { [key: string]: string };
	unreadCounts: { [key: string]: number };
	messagesByChat: { [key: string]: Message[] };
	activeChat: string | null;
	username: string | null;
	typingUsers: Map<string, Set<string>>;
  	currentChat: Chat | undefined;
	setShouldScrollToBottom: React.Dispatch<React.SetStateAction<boolean>>;
	quotedMessageData: Record<string, Message | null>;
	fetchQuotedMessageData: (id: string) => Promise<Message | null>;
}

const RenderSidebar: React.FC<RenderSidebarProps> = ({
	searchQuery,
	setSearchQuery,
	setShowCreateOptions,
	showCreateOptions,
	createOptionsRef,
	setShowContactSearch,
	setShowCreateGroup,
	setShowCreateChannel,
	isLoadingChats,
	filteredChats,
	setActiveChat,
	userStatuses,
	contactMap,
	unreadCounts,
	messagesByChat,
	activeChat,
	username,
	typingUsers,
	currentChat,
	setShouldScrollToBottom,
	quotedMessageData,
	fetchQuotedMessageData
}) => {
	const { theme, toggleTheme } = useTheme();
	const API_BASE = import.meta.env.VITE_API_BASE_URL;
	const handleCreatePersonalChat = () => {
		console.log("Creating personal chat...");
		setShowContactSearch(true);
		setShowCreateOptions(false);
	};

	const handleCreateGroup = () => {
		console.log("Creating group...");
		setShowCreateGroup(true);
		setShowCreateOptions(false);
	};

	const handleCreateChannel = () => {
		console.log("Creating channel...");
		setShowCreateChannel(true);
		setShowCreateOptions(false);
	};

	const getContentForwardMsg = (msg: Message) => {
		const curQotMsg = quotedMessageData[msg.forward_message_id!];
		const isDataLoaded = curQotMsg !== undefined;
		if (!isDataLoaded) {
			fetchQuotedMessageData(msg.forward_message_id!).catch(() => {});
		}
		return curQotMsg?.content;
	}
	return (
		<div className={`flex flex-col w-full md:w-110 border-r ${theme === 'light' ? 'border-slate-200/60 bg-white/95' : 'border-slate-700/60 bg-slate-900/95'} backdrop-blur-2xl relative z-0`}>
			{/* Header */}
			<div className="flex justify-between pt-3 pb-3 pr-6 pl-6">
				<Link
					to="/dashboard"
					className={`flex w-full text-sm items-center gap-2 px-4 py-2 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 text-white hover:from-blue-600 hover:to-purple-600 shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center group hover:scale-105 transform z-20`}
				>
					<ArrowLeft size={16} />Вернуться на главную
				</Link>
				
			</div>
			<div className={`flex  items-center justify-between pr-6 pl-6 pb-6 border-b ${theme === 'light' ? 'border-slate-200/60 bg-white/90' : 'border-slate-700/60 bg-slate-900/90'} backdrop-blur-2xl relative z-10`}>
				

				<div className="flex items-center space-x-4">
					<div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-lg">
						<Users size={24} className="text-white" weight="fill" />
					</div>
					<div>
						<h2 className={`text-2xl font-bold ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
							Чаты
						</h2>
						<p className={`text-sm ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'} mt-1`}>
							{filteredChats.length} {filteredChats.length === 1 ? 'диалог' : filteredChats.length < 5 ? 'диалога' : 'диалогов'}
						</p>
					</div>
				</div>
				
				<div className="flex gap-2 relative">
					<button 
						onClick={toggleTheme}
						className={`w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 ${theme === 'light' ? 'text-black':'text-white'}  hover:from-blue-600 hover:to-purple-600 shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center group hover:scale-105 transform z-20`}
						title={theme === 'light' ? 'Темная тема' : 'Светлая тема'}
					>
						{theme === 'light' ? 
						<Moon size={22} weight="regular"/> 
						: <Sun size={22} weight="regular" />}
					</button>
					<button 
						onClick={() => setShowCreateOptions(!showCreateOptions)} 
						className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 text-white hover:from-blue-600 hover:to-purple-600 shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center group hover:scale-105 transform z-20"
					>
						<Plus size={20} weight="bold" />
					</button>
					
					{showCreateOptions && (
						<div 
							ref={createOptionsRef} 
							className={`absolute right-0 top-14 w-64 ${theme === 'light' ? 'bg-white' : 'bg-slate-800'} rounded-2xl shadow-2xl border ${theme === 'light' ? 'border-slate-200/80' : 'border-slate-700/80'} backdrop-blur-2xl z-[100] animate-in fade-in-0 zoom-in-95 origin-top-right`}
						>
							<div className="p-3">
								<div className="px-3 py-2">
									<h3 className={`text-sm font-semibold ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'} uppercase tracking-wide`}>
										Создать новый
									</h3>
								</div>
								
								<button 
									onClick={handleCreatePersonalChat}
									className={`w-full flex items-center px-4 py-4 text-sm ${theme === 'light' ? 'text-slate-700 hover:bg-blue-50' : 'text-slate-200 hover:bg-blue-500/10'} rounded-xl transition-all duration-200 group`}
								>
									<div className={`w-12 h-12 rounded-xl ${theme === 'light' ? 'bg-blue-100 group-hover:bg-blue-200' : 'bg-blue-500/20 group-hover:bg-blue-500/30'} flex items-center justify-center mr-4 transition-colors`}>
										<User size={20} className={`${theme === 'light' ? 'text-blue-600' : 'text-blue-400'}`} weight="fill" />
									</div>
									<div className="text-left">
										<div className={`font-semibold ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>Личный чат</div>
										<div className={`text-xs ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>Начать диалог с пользователем</div>
									</div>
								</button>
								
								<button 
									onClick={handleCreateGroup}
									className={`w-full flex items-center px-4 py-4 text-sm ${theme === 'light' ? 'text-slate-700 hover:bg-green-50' : 'text-slate-200 hover:bg-green-500/10'} rounded-xl transition-all duration-200 group mt-2`}
								>
									<div className={`w-12 h-12 rounded-xl ${theme === 'light' ? 'bg-green-100 group-hover:bg-green-200' : 'bg-green-500/20 group-hover:bg-green-500/30'} flex items-center justify-center mr-4 transition-colors`}>
										<Users size={20} className={`${theme === 'light' ? 'text-green-600' : 'text-green-400'}`} weight="fill" />
									</div>
									<div className="text-left">
										<div className={`font-semibold ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>Группа</div>
										<div className={`text-xs ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>Создать групповой чат</div>
									</div>
								</button>
								
								<button 
									onClick={handleCreateChannel}
									className={`w-full flex items-center px-4 py-4 text-sm ${theme === 'light' ? 'text-slate-700 hover:bg-purple-50' : 'text-slate-200 hover:bg-purple-500/10'} rounded-xl transition-all duration-200 group mt-2`}
								>
									<div className={`w-12 h-12 rounded-xl ${theme === 'light' ? 'bg-purple-100 group-hover:bg-purple-200' : 'bg-purple-500/20 group-hover:bg-purple-500/30'} flex items-center justify-center mr-4 transition-colors`}>
										<Broadcast size={20} className={`${theme === 'light' ? 'text-purple-600' : 'text-purple-400'}`} weight="fill" />
									</div>
									<div className="text-left">
										<div className={`font-semibold ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>Канал</div>
										<div className={`text-xs ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>Создать канал для публикаций</div>
									</div>
								</button>
							</div>
						</div>
					)}
				</div>
			</div>

			{/* Search */}
			<div className={`p-6 border-b ${theme === 'light' ? 'border-slate-200/60 bg-white/80' : 'border-slate-700/60 bg-slate-900/80'} backdrop-blur-2xl relative z-0`}>
				<div className="relative">
					<MagnifyingGlass size={20} className={`absolute left-4 top-1/2 transform -translate-y-1/2`} />
					<input
						type="text"
						placeholder="Поиск чатов..."
						className={`w-full pl-12 pr-4 py-4 rounded-2xl border ${theme === 'light' ? 'border-slate-200/60 bg-slate-100/80 text-slate-900 placeholder-slate-500' : 'border-slate-700/60 bg-slate-800/80 text-white placeholder-slate-400'} focus:outline-none focus:ring-3 focus:ring-blue-500/30 focus:border-blue-500 transition-all duration-300 text-lg backdrop-blur-sm`}
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
					/>
				</div>
			</div>

			{/* Chat List */}
			<div className={`flex-1 overflow-y-auto relative z-0`} 
				style={{ 
				scrollbarWidth: "thin",
				scrollbarColor: `${theme === 'light' ? "gray white" : "white #1d293d"}`
				}}
			>
				{isLoadingChats ? (
					<div className="flex flex-col items-center justify-center py-16">
						<div className={`w-10 h-10 border-3 ${theme === 'light' ? 'border-slate-300' : 'border-slate-600'} border-t-blue-500 rounded-full animate-spin mb-4`}></div>
						<div className={`text-lg ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>Загрузка чатов...</div>
					</div>
				) : filteredChats.length > 0 ? (
					<div className="p-4 space-y-2">
						{filteredChats.map((chat) => {
							const isActive = activeChat === chat.id;
							const unreadCount = unreadCounts[chat.id] || 0;
							const lastMessage = messagesByChat[chat.id]?.[messagesByChat[chat.id].length - 1] || chat.last_message;
							const displayName = getChatDisplayName(chat, 'full', contactMap, username);
							
							return (
								<div
									key={chat.id}
									onClick={() => {
										setActiveChat(chat.id); setShouldScrollToBottom(true);
									}}
									className={`relative flex items-center p-4 rounded-2xl cursor-pointer transition-all duration-300 group ${
										isActive 
											? 'bg-gradient-to-br from-blue-500 to-purple-500 shadow-2xl transform scale-[1.02]' 
											: `${theme === 'light' ? 'bg-white/50 hover:bg-slate-50/80 border-slate-200/40' : 'bg-slate-800/50 hover:bg-slate-700/80 border-slate-700/40'} hover:shadow-lg border`
									}`}
								>
									{/* Avatar with status */}
									<div className="flex-shrink-0 mr-4 relative">
										<div className={`w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 p-0.5 ${
											isActive ? 'ring-2 ring-white/40' : ''
										}`}>
											<div className={`w-full h-full rounded-2xl ${theme === 'light' ? 'bg-white' : 'bg-slate-900'} flex items-center justify-center`}>
												{getChatDisplayIcon(chat, 44, theme)}
											</div>
										</div>
										{userStatuses[getChatDisplayName(chat, "short", contactMap, username)] === "online" && (
											<div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 ${
												isActive ? 'border-blue-500 bg-white' : `${theme === 'light' ? 'border-white' : 'border-slate-900'} bg-green-500`
											} flex items-center justify-center`}>
												<div className={`w-1.5 h-1.5 rounded-full ${
													isActive ? 'bg-blue-500' : 'bg-white'
												}`}></div>
											</div>
										)}
									</div>

									{/* Chat info */}
									<div className="flex-1 min-w-0">
										<div className="flex items-center justify-between mb-2">
											<div className={`font-bold truncate max-w-50 ${
												isActive ? 'text-white' : `${theme === 'light' ? 'text-slate-900' : 'text-white'}`
											}`}>
												{displayName}
											</div>
											<div className="flex items-center space-x-2">
												{lastMessage && (
													<span className={`text-xs font-medium ${
														isActive ? 'text-white/80' : `${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`
													}`}>
														{formatTimestampSidebar(lastMessage.timestamp)}
													</span>
												)}
												{unreadCount > 0 && !isActive && (
													<span className="inline-flex items-center justify-center min-w-6 h-6 px-2 text-xs font-bold text-white bg-red-500 rounded-full shadow-lg">
														{unreadCount}
													</span>
												)}
											</div>
										</div>
										
										<div className={`text-sm truncate ${
												isActive ? 'text-white/90' : `${theme === 'light' ? 'text-slate-600' : 'text-slate-300'}`
											}`}>
												{typingUsers.get(chat.id) !== undefined && (
													<div className="flex items-center space-x-2 text-xs font-sans">
														<div className="flex space-x-1">
															<div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
															<div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
															<div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
														</div>
														<span className={`font-medium font-sans ${theme === 'light' ? 'text-blue-600' : 'text-blue-400'}`}>{getTypingText(chat.is_group, typingUsers.get(chat.id))}</span>
													</div>
												)}
												{typingUsers.get(chat.id) === undefined && lastMessage ? (
													<div className="flex justify-between items-center">
														<div className="flex items-center gap-1 truncate">
															{lastMessage.file_name && /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(lastMessage.file_name) ? (
																<div className="flex gap-2">
																	<img src={resolveFileUrl(lastMessage.file_url)} loading="lazy" alt={lastMessage.file_name} className="rounded max-h-6 object-contain"/>
																	<p className="font-medium">Photo</p>
																</div>
															) : (
																<span className="truncate">
																	{lastMessage.forward_message_id ? 
																		<div className="flex gap-2">
																			<ArrowBendUpLeft size={17}/>{getContentForwardMsg(lastMessage)}
																			{messageIsPhoto(quotedMessageData[lastMessage.forward_message_id]) && 
																				(<div className="flex gap-1">
																					<img src={resolveFileUrl(quotedMessageData[lastMessage.forward_message_id]?.file_url)} loading="lazy" className="rounded-lg max-h-6 mr-1 object-contain" />
																					<span className="font-bold">Photo</span>
																				</div>)
																			}
																		</div>
																		 : 
																		 ''}{lastMessage.content?.split('\n')[0] || lastMessage.file_name}
																</span>
															)}
														</div>
														<div className="flex">
															{lastMessage.sender === username && (
																<span className={`flex-shrink-0 ${
																	isActive ? 'text-white/90' : `${theme === 'light' ? 'text-blue-500' : 'text-blue-400'}`
																}`}>
																	{lastMessage.is_read ? <Checks className="text-xl"/> : <Check className="text-xl"/>}
																</span>
															)}
														</div>
													</div>
												) : (
													<span className={`${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>{lastMessage ? '':"Нет сообщений"}</span>
												)}
											
											{isActive && unreadCount > 0 && (
												<span className="inline-flex items-center justify-center min-w-6 h-6 px-2 text-xs font-bold text-blue-600 bg-white rounded-full shadow-lg">
													{unreadCount}
												</span>
											)}
										</div>
									</div>

									{/* Active indicator */}
									{isActive && (
										<div className={`absolute -left-2 top-1/2 transform -translate-y-1/2 w-1 h-10 ${theme === 'light' ? 'bg-black' : 'bg-white'} rounded-full`}></div>
									)}
								</div>
							);
						})}
					</div>
				) : (
					<div className="flex flex-col items-center justify-center py-20 px-6 text-center">
						<div className={`w-24 h-24 bg-gradient-to-br ${theme === 'light' ? 'from-slate-100 to-slate-200' : 'from-slate-800 to-slate-700'} rounded-3xl flex items-center justify-center mb-6 shadow-lg`}>
							<Users size={32} className={`${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`} />
						</div>
						<h3 className={`text-xl font-bold ${theme === 'light' ? 'text-slate-800' : 'text-slate-200'} mb-3`}>
							{searchQuery ? 'Чаты не найдены' : 'Нет чатов'}
						</h3>
						<p className={`text-lg leading-relaxed mb-6 ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
							{searchQuery 
								? 'Попробуйте изменить поисковый запрос' 
								: 'Создайте первый чат, чтобы начать общение'
							}
						</p>
						{!searchQuery && (
							<button 
								onClick={() => setShowCreateOptions(true)}
								className="px-6 py-3 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 text-white hover:from-blue-600 hover:to-purple-600 shadow-lg hover:shadow-xl transition-all duration-300 font-semibold"
							>
								Создать чат
							</button>
						)}
					</div>
				)}
			</div>
		</div>
	);
};

export default RenderSidebar;