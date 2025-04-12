import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
const BaseUrl='https://vediochatapp-2.onrender.com'
// const BaseUrl='http://localhost:5000'

const socket = io(BaseUrl); // Replace with your server URL

const App = () => {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');

  useEffect(() => {
    // Listen for incoming messages from the server
    socket.on('message', (message) => {
      console.log("Received message:", message);
      setMessages((prevMessages) => [...prevMessages, message.text]); // Only append message text
    });

    // Clean up socket connection on component unmount
    return () => {
      socket.disconnect();
    };
  }, []); // Only run this effect once on component mount

  const sendMessage = () => {
    if (inputText.trim() !== '') {
      // Emit a 'message' event to the server with the input text
      socket.emit('message', { text: inputText });

      // Clear the input field after sending the message
      setInputText('');
    }
  };

  return (
    <div style={{ textAlign: 'center', marginTop: '100px' }}>
      {/* Display messages */}
      {messages.map((message, index) => (
        <div key={index} className="bg-black text-white p-2 rounded my-1">
          {message}
        </div>
      ))}

      {/* Input for sending messages */}
      <input
        type="text"
        className="bg-slate-600 p-2 rounded"
        placeholder="Type your message..."
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
      />
      <button className="bg-blue-500 text-white px-4 py-2 rounded" onClick={sendMessage}>
        Send
      </button>
    </div>
  );
};

export default App;
