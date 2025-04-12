
import React from 'react';

const Sidebar = ({ users, currentUser, currentChat, onChatSelect, onLogout }) => {
  return (
    <div className="w-80 h-full flex flex-col border-r bg-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center">
          <img
            src={currentUser.profilePic}
            alt={currentUser.displayName}
            className="w-10 h-10 rounded-full"
          />
          <h1 className="ml-3 text-xl font-semibold">{currentUser.displayName}</h1>
        </div>
        <button
          onClick={onLogout}
          className="p-2 text-gray-600 hover:text-gray-900 focus:outline-none"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>
      
      {/* Search */}
      <div className="p-4 border-b">
        <div className="relative">
          <input
            type="text"
            placeholder="Search contacts"
            className="w-full py-2 pl-10 pr-4 text-gray-700 bg-gray-100 rounded-full focus:outline-none focus:bg-white focus:ring-2 focus:ring-teal-500"
          />
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
      </div>
      hello worrld
      {/* Contacts */}
      <div className="flex-grow overflow-y-auto">
        <h2 className="px-4 pt-4 pb-2 text-xs font-semibold text-gray-600 uppercase">Contacts</h2>
        <div className="space-y-1">
          {users.map(user => (
            <div
              key={user._id}
              className={`flex items-center px-4 py-3 cursor-pointer ${
                currentChat && currentChat._id === user._id ? 'bg-gray-100' : 'hover:bg-gray-50'
              }`}
              onClick={() => onChatSelect(user)}
            >
              <img
                src={user.profilePic}
                alt={user.displayName}
                className="w-12 h-12 rounded-full"
              />
              <div className="ml-3">
                <div className="font-medium">{user.displayName}</div>
                <div className="text-sm text-gray-600 truncate">
                  {user.status || 'Online'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;