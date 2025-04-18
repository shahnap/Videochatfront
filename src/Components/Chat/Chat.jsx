import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import io from 'socket.io-client';
import Sidebar from './Sidebar';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import VideoCall from './VideoCall';

const Chat = ({ setIsAuthenticated }) => {
  const [users, setUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [currentChat, setCurrentChat] = useState(null);
  const [socket, setSocket] = useState(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [callData, setCallData] = useState({
    isReceivingCall: false,
    isInitiator: false,
    caller: null,
    callee: null,
    offer: null
  });
  const BaseUrl = 'https://vediochatapp-2.onrender.com';
  // const BaseUrl='http://localhost:5000'
  const user = JSON.parse(localStorage.getItem('user'));
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);
  
  // Initialize socket connection
  useEffect(() => {
    const newSocket = io(BaseUrl);
    setSocket(newSocket);
    
    // Join personal room
    if (user?.username) {
      newSocket.emit('join', user.username);
    }
    
    return () => {
      newSocket.disconnect();
    };
  }, [user?.username]);
  
  // Load users
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await axios.get(BaseUrl+'/api/users');
        // Filter out current user
        const filteredUsers = response.data.filter(u => u.username !== user.username);
        setUsers(filteredUsers);
      } catch (error) {
        console.error('Error fetching users:', error);
      }
    };
    
    fetchUsers();
  }, [user.username]);
  
  // Handle incoming messages
  useEffect(() => {
    if (!socket) return;
    
    socket.on('receiveMessage', (message) => {
      if (currentChat && (message.sender === currentChat.username || message.receiver === currentChat.username)) {
        setMessages(prevMessages => [...prevMessages, message]);
      }
    });
    
    // Handle WebRTC signaling
    socket.on('call-made', (data) => {
      setCallData({
        isReceivingCall: true,
        isInitiator: false,
        caller: data.from,
        callee: user.username,
        offer: data.offer
      });
    });
    
    socket.on('answer-made', (data) => {
      if (callData.isInitiator) {
        // Handle the answer from the callee
      }
    });
    
    socket.on('ice-candidate', (data) => {
      // Handle ICE candidate
    });
    
    socket.on('call-rejected', () => {
      setIsCallActive(false);
      setCallData({
        isReceivingCall: false,
        isInitiator: false,
        caller: null,
        callee: null,
        offer: null
      });
    });
    
    socket.on('call-ended', () => {
      setIsCallActive(false);
      setCallData({
        isReceivingCall: false,
        isInitiator: false,
        caller: null,
        callee: null,
        offer: null
      });
    });
    
    return () => {
      socket.off('receiveMessage');
      socket.off('call-made');
      socket.off('answer-made');
      socket.off('ice-candidate');
      socket.off('call-rejected');
      socket.off('call-ended');
    };
  }, [socket, currentChat, user.username, callData.isInitiator]);
  
  // Load messages when chat changes
  useEffect(() => {
    const fetchMessages = async () => {
      if (!currentChat) return;
      
      try {
        const response = await axios.get(`${BaseUrl}/api/messages/${user.username}/${currentChat.username}`);
        setMessages(response.data);
      } catch (error) {
        console.error('Error fetching messages:', error);
      }
    };
    
    fetchMessages();
  }, [currentChat, user.username]);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  const handleChatSelect = (selectedUser) => {
    setCurrentChat(selectedUser);
    // On mobile, hide sidebar after selecting a chat
    if (window.innerWidth < 768) {
      setShowSidebar(false);
    }
  };
  
  const handleSendMessage = (content) => {
    if (!socket || !currentChat) return;
    
    const messageData = {
      sender: user.username,
      receiver: currentChat.username,
      content
    };
    
    socket.emit('sendMessage', messageData);
    
    // Optimistically add message to UI
    const newMessage = {
      ...messageData,
      timestamp: new Date(),
      isRead: false,
      _id: Date.now().toString() // Temporary ID until server confirms
    };
    
    setMessages(prevMessages => [...prevMessages, newMessage]);
  };
  
  const handleStartCall = () => {
    if (!currentChat) return;
    
    setIsCallActive(true);
    setCallData({
      isReceivingCall: false,
      isInitiator: true,
      caller: user.username,
      callee: currentChat.username,
      offer: null
    });
  };
  
  const handleAcceptCall = () => {
    setIsCallActive(true);
  };
  
  const handleRejectCall = () => {
    if (!socket || !callData.caller) return;
    
    socket.emit('reject-call', {
      to: callData.caller,
      from: user.username
    });
    
    setCallData({
      isReceivingCall: false,
      isInitiator: false,
      caller: null,
      callee: null,
      offer: null
    });
  };
  
  const handleEndCall = () => {
    if (!socket) return;
    
    const otherUser = callData.isInitiator ? callData.callee : callData.caller;
    
    socket.emit('end-call', {
      to: otherUser,
      from: user.username
    });
    
    setIsCallActive(false);
    setCallData({
      isReceivingCall: false,
      isInitiator: false,
      caller: null,
      callee: null,
      offer: null
    });
  };
  
  const toggleSidebar = () => {
    setShowSidebar(prev => !prev);
  };
  
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
    navigate('/login');
  };
  
  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Mobile sidebar toggle button */}
      {currentChat && !showSidebar && (
        <button 
          onClick={toggleSidebar}
          className="absolute top-4 left-4 z-20 md:hidden bg-gray-200 p-2 rounded-full shadow-md"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}
      
      {/* Sidebar with responsive behavior */}
      <div className={`${showSidebar ? 'flex' : 'hidden'} md:flex md:w-1/3 lg:w-1/4 h-full z-10 ${currentChat ? 'absolute md:relative w-full md:w-1/3 lg:w-1/4 bg-white' : ''}`}>
        <Sidebar
          users={users}
          currentUser={user}
          currentChat={currentChat}
          onChatSelect={handleChatSelect}
          onLogout={handleLogout}
        />
      </div>
      
      {isCallActive ? (
        <VideoCall
          socket={socket}
          callData={callData}
          currentUser={user}
          onEndCall={handleEndCall}
        />
      ) : (
        <div className={`flex flex-col flex-grow h-full bg-gray-50 ${showSidebar && currentChat && window.innerWidth < 768 ? 'hidden' : 'flex'}`}>
          {currentChat ? (
            <>
              <div className="flex items-center justify-between p-4 border-b bg-white">
                <div className="flex items-center">
                  {!showSidebar && (
                    <button onClick={toggleSidebar} className="mr-2 md:hidden">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                      </svg>
                    </button>
                  )}
                  <img
                    src={currentChat.profilePic}
                    alt={currentChat.displayName}
                    className="w-8 h-8 md:w-10 md:h-10 rounded-full object-cover"
                  />
                  <h2 className="ml-2 md:ml-3 text-base md:text-lg font-medium truncate">{currentChat.displayName}</h2>
                </div>
                <div className="flex space-x-2 md:space-x-3">
                  <button
                    onClick={handleStartCall}
                    className="p-1.5 md:p-2 text-white bg-teal-600 rounded-full hover:bg-teal-700 focus:outline-none"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                  <button
                    className="p-1.5 md:p-2 text-white bg-teal-600 rounded-full hover:bg-teal-700 focus:outline-none"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </button>
                </div>
              </div>
              
              <div className="flex-grow overflow-y-auto">
                <MessageList
                  messages={messages}
                  currentUser={user}
                  messagesEndRef={messagesEndRef}
                />
              </div>
              
              <MessageInput onSendMessage={handleSendMessage} />
            </>
          ) : (
            <div className="flex items-center justify-center flex-grow">
              <div className="text-center p-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 md:w-16 md:h-16 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <h3 className="mt-2 text-base md:text-lg font-medium text-gray-700">Select a chat to start messaging</h3>
              </div>
            </div>
          )}
        </div>
      )}
      
      {callData.isReceivingCall && !isCallActive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="p-4 md:p-6 bg-white rounded-lg shadow-xl w-full max-w-sm">
            <h3 className="text-base md:text-lg font-medium text-gray-900 text-center">
              Incoming call from {callData.caller}
            </h3>
            <div className="flex justify-center mt-4 space-x-3">
              <button
                onClick={handleRejectCall}
                className="px-3 py-1.5 md:px-4 md:py-2 text-white bg-red-600 rounded hover:bg-red-700 focus:outline-none"
              >
                Decline
              </button>
              <button
                onClick={handleAcceptCall}
                className="px-3 py-1.5 md:px-4 md:py-2 text-white bg-green-600 rounded hover:bg-green-700 focus:outline-none"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Chat;