import React, { useEffect, useRef, useState } from 'react';

const VideoCall = ({ socket, callData, currentUser, onEndCall }) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [connectionState, setConnectionState] = useState('new');
  const [callStatus, setCallStatus] = useState('connecting');
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  
  const otherUser = callData.isInitiator ? callData.callee : callData.caller;
  
  // Initialize WebRTC
  useEffect(() => {
    console.log('Initializing media and WebRTC connection...');
    
    const initializeMedia = async () => {
      try {
        console.log('Initializing media...');
        
        // 1. Verify secure context
        if (!window.isSecureContext) {
          throw new Error("WebRTC requires HTTPS or localhost.");
        }
    
        // 2. Get user media
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
        setLocalStream(stream);
        localVideoRef.current.srcObject = stream;
    
        // 3. Configure ICE servers (fixed version)
        const configuration = {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }, // Fixed URL
            {
              urls: 'turn:numb.viagenie.ca',
              credential: 'muazkh',
              username: 'webrtc@live.com'
            }
          ]
        };
    
        // 4. Create peer connection
        const peerConnection = new RTCPeerConnection(configuration);
        peerConnectionRef.current = peerConnection;
    
        // Rest of your peer connection setup...
        
      } catch (error) {
        console.error('Initialization error:', error);
        // Handle errors as shown above
      }
    };
    
    initializeMedia();
    
    return () => {
      console.log('Cleaning up media and connection');
      // Clean up media streams
      if (localStream) {
        localStream.getTracks().forEach(track => {
          console.log(`Stopping ${track.kind} track`);
          track.stop();
        });
      }
      
      if (peerConnectionRef.current) {
        console.log('Closing peer connection');
        peerConnectionRef.current.close();
      }
    };
  }, [callData.isInitiator, callData.offer, currentUser.username, otherUser, socket]);
  
  // Handle incoming ICE candidates
  useEffect(() => {
    if (!socket || !peerConnectionRef.current) return;
    
    const handleIceCandidate = async (data) => {
      try {
        if (data.from === otherUser) {
          console.log('Received ICE candidate:', JSON.stringify(data.candidate));
          const candidate = new RTCIceCandidate(data.candidate);
          await peerConnectionRef.current.addIceCandidate(candidate);
        }
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    };
    
    console.log('Setting up ice-candidate listener');
    socket.on('ice-candidate', handleIceCandidate);
    
    return () => {
      console.log('Removing ice-candidate listener');
      socket.off('ice-candidate', handleIceCandidate);
    };
  }, [otherUser, socket]);
  
  // Handle incoming answers
  useEffect(() => {
    if (!socket || !peerConnectionRef.current || !callData.isInitiator) return;
    
    const handleAnswer = async (data) => {
      try {
        if (data.from === otherUser) {
          console.log('Received answer from:', data.from);
          const sessionDesc = new RTCSessionDescription(data.answer);
          console.log('Setting remote description (answer)');
          await peerConnectionRef.current.setRemoteDescription(sessionDesc);
        }
      } catch (error) {
        console.error('Error setting remote description:', error);
      }
    };
    
    console.log('Setting up answer-made listener');
    socket.on('answer-made', handleAnswer);
    
    return () => {
      console.log('Removing answer-made listener');
      socket.off('answer-made', handleAnswer);
    };
  }, [callData.isInitiator, otherUser, socket]);
  
  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
        console.log(`Audio ${track.enabled ? 'unmuted' : 'muted'}`);
      });
      setIsMuted(!isMuted);
    }
  };
  
  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
        console.log(`Video ${track.enabled ? 'enabled' : 'disabled'}`);
      });
      setIsVideoOff(!isVideoOff);
    }
  };
  
  return (
    <div className="flex-grow flex flex-col bg-gray-900 text-white">
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <h2 className="ml-2 text-lg font-medium">
            {callData.isInitiator ? `Call with ${callData.callee}` : `Call from ${callData.caller}`}
          </h2>
        </div>
        <div className="text-sm text-gray-400">
          {callStatus === 'connecting' && 'Connecting...'}
          {callStatus === 'connected' && 'Connected'}
          {callStatus === 'failed' && 'Connection failed'}
          {callStatus === 'error' && 'Error'}
        </div>
      </div>
      
      <div className="flex-grow flex items-center justify-center p-4 relative">
        {/* Remote video (full screen) */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover rounded-lg"
        />
        
        {/* Local video (picture-in-picture) */}
        <div className="absolute bottom-8 right-8 w-48 h-36 rounded-lg overflow-hidden border-2 border-white shadow-lg">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        </div>
        
        {/* Connection status overlay */}
        {!remoteStream && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-70 text-white">
            <div className="text-center">
              <div className="text-xl font-medium mb-2">
                {callStatus === 'connecting' && 'Connecting to remote user...'}
                {callStatus === 'failed' && 'Connection failed'}
                {callStatus === 'error' && 'Error accessing camera/microphone'}
              </div>
              <div className="text-gray-400">
                {connectionState !== 'connected' && 'Waiting for remote video...'}
              </div>
            </div>
          </div>
        )}
      </div>
      
      <div className="p-4 flex justify-center space-x-4">
        <button
          onClick={toggleMute}
          className={`p-3 rounded-full ${isMuted ? 'bg-red-600' : 'bg-gray-700'} hover:opacity-90 focus:outline-none`}
        >
          {isMuted ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          )}
        </button>
        
        <button
          onClick={toggleVideo}
          className={`p-3 rounded-full ${isVideoOff ? 'bg-red-600' : 'bg-gray-700'} hover:opacity-90 focus:outline-none`}
        >
          {isVideoOff ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          )}
        </button>
        
        <button
          onClick={onEndCall}
          className="p-3 bg-red-600 rounded-full hover:bg-red-700 focus:outline-none"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default VideoCall;