
import React from 'react';

const MessageList = ({ messages, currentUser, messagesEndRef }) => {
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  return (
    <div className="flex-grow overflow-y-auto p-4 bg-gray-50">
      <div className="space-y-4">
        {messages.map((message) => (
          <div
            key={message._id}
            className={`flex ${
              message.sender === currentUser.username ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-xs md:max-w-md lg:max-w-lg px-4 py-2 rounded-lg ${
                message.sender === currentUser.username
                  ? 'bg-teal-600 text-white rounded-br-none'
                  : 'bg-white text-gray-800 rounded-bl-none border'
              }`}
            >
              <div className="break-words">{message.content}</div>
              <div
                className={`text-xs mt-1 ${
                  message.sender === currentUser.username ? 'text-teal-100' : 'text-gray-500'
                }`}
              >
                {formatTime(message.timestamp)}
                {message.sender === currentUser.username && (
                  <span className="ml-2">
                    {message.isRead ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default MessageList;