import React, { useEffect, useRef, useState } from 'react';

const VideoCall = ({ socket, callData, currentUser, onEndCall }) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [connectionState, setConnectionState] = useState('new');
  const [callStatus, setCallStatus] = useState('connecting');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  
  const otherUser = callData.isInitiator ? callData.callee : callData.caller;
  
  // Initialize WebRTC
  useEffect(() => {
    console.log('Initializing media and WebRTC connection...');
    let localMediaStream = null;
    
    const initializeMedia = async () => {
      try {
        console.log('Requesting user media...');
        // First check if we're in a secure context
        if (!window.isSecureContext) {
          const errorMsg = "WebRTC requires HTTPS or localhost. Try accessing via 'localhost' instead of IP address.";
          console.error(errorMsg);
          setCallStatus('error');
          alert(errorMsg);
          return;
        }
        
        console.log('Requesting user media...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
        
        console.log('Local stream obtained successfully');
        setLocalStream(stream);
        localMediaStream = stream;
        
        if (localVideoRef.current) {
          console.log('Setting local video stream');
          localVideoRef.current.srcObject = stream;
        }
        
        // Create peer connection with improved ICE servers
        const configuration = {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            // More reliable TURN servers
            {
              urls: 'turn:openrelay.metered.ca:80',
              username: 'openrelayproject',
              credential: 'openrelayproject'
            },
            {
              urls: 'turn:openrelay.metered.ca:443',
              username: 'openrelayproject',
              credential: 'openrelayproject'
            }
          ],
          iceCandidatePoolSize: 10
        };
        
        console.log('Creating RTCPeerConnection with config:', JSON.stringify(configuration));
        const peerConnection = new RTCPeerConnection(configuration);
        peerConnectionRef.current = peerConnection;
        
        // Set up debugging
        peerConnection.onicegatheringstatechange = (e) => {
          console.log('ICE gathering state: ', peerConnection.iceGatheringState);
        };
        
        // Monitor connection state changes
        peerConnection.onconnectionstatechange = (event) => {
          console.log('Connection state changed:', peerConnection.connectionState);
          setConnectionState(peerConnection.connectionState);
          
          switch (peerConnection.connectionState) {
            case 'connected':
              setCallStatus('connected');
              console.log('Peer connection successful!');
              break;
            case 'disconnected':
              console.log('Peer disconnected');
              setCallStatus('disconnected');
              break;
            case 'failed':
              console.error('Peer connection failed');
              setCallStatus('failed');
              if (reconnectAttempts < 2) {
                console.log('Attempting to reconnect...');
                setReconnectAttempts(prev => prev + 1);
                // Could implement reconnection logic here
              }
              break;
            case 'closed':
              console.log('Peer connection closed');
              setCallStatus('ended');
              break;
          }
        };
        
        peerConnection.oniceconnectionstatechange = (event) => {
          console.log('ICE connection state:', peerConnection.iceConnectionState);
          
          if (peerConnection.iceConnectionState === 'failed') {
            console.log('ICE failure, attempting to restart ICE');
            peerConnection.restartIce();
          }
        };
        
        // Add local stream to peer connection
        console.log('Adding local tracks to peer connection');
        stream.getTracks().forEach(track => {
          peerConnection.addTrack(track, stream);
          console.log(`Added ${track.kind} track to peer connection`);
        });
        
        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
          if (event.candidate) {
            console.log('Generated ICE candidate, sending to:', otherUser);
            socket.emit('ice-candidate', {
              to: otherUser,
              from: currentUser.username,
              candidate: event.candidate
            });
          } else {
            console.log('ICE gathering complete');
          }
        };
        
        // Handle remote stream
        peerConnection.ontrack = (event) => {
          console.log('Received remote track:', event.track.kind);
          if (event.streams && event.streams[0]) {
            console.log('Setting remote stream');
            setRemoteStream(event.streams[0]);
            
            if (remoteVideoRef.current) {
              console.log('Setting remote video stream');
              remoteVideoRef.current.srcObject = event.streams[0];
            }
          } else {
            console.warn('No remote stream available in ontrack event');
          }
        };
        
        // Initiate call if initiator
        if (callData.isInitiator) {
          console.log('I am the initiator, creating offer');
          try {
            const offer = await peerConnection.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true
            });
            console.log('Setting local description (offer):', offer);
            await peerConnection.setLocalDescription(offer);
            
            console.log('Sending call offer to:', otherUser);
            socket.emit('call-user', {
              to: otherUser,
              from: currentUser.username,
              offer: offer
            });
          } catch (error) {
            console.error('Error creating offer:', error);
            setCallStatus('error');
          }
        }
        // Answer call if receiver
        else if (callData.offer) {
          console.log('I am the receiver, processing offer');
          try {
            console.log('Setting remote description (offer):', callData.offer);
            await peerConnection.setRemoteDescription(new RTCSessionDescription(callData.offer));
            
            console.log('Creating answer');
            const answer = await peerConnection.createAnswer();
            console.log('Setting local description (answer):', answer);
            await peerConnection.setLocalDescription(answer);
            
            console.log('Sending answer to:', otherUser);
            socket.emit('make-answer', {
              to: otherUser,
              from: currentUser.username,
              answer: answer
            });
          } catch (error) {
            console.error('Error creating answer:', error);
            setCallStatus('error');
          }
        }
      } catch (error) {
        console.error('Error accessing media devices:', error);
        setCallStatus('error');
        alert(`Media error: ${error.message}. Please check camera/microphone permissions.`);
        if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
          alert('No camera or microphone found. Please connect a device.');
        } else if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          alert('Camera/microphone permission denied. Please allow access in your browser settings.');
        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
          alert('Your camera or microphone is already in use by another application.');
        } else if (error.message && error.message.includes('getUserMedia')) {
          alert('WebRTC is limited on insecure origins. Try using localhost instead of IP address, or enable HTTPS.');
        } else {
          alert(`Media error: ${error.message}. Please check camera/microphone permissions.`);
        }
      }
    };
    
    initializeMedia();
    
    return () => {
      console.log('Cleaning up media and connection');
      // Clean up media streams
      if (localMediaStream) {
        localMediaStream.getTracks().forEach(track => {
          console.log(`Stopping ${track.kind} track`);
          track.stop();
        });
      }
      
      if (peerConnectionRef.current) {
        console.log('Closing peer connection');
        peerConnectionRef.current.close();
      }
    };
  }, [callData.isInitiator, callData.offer, currentUser.username, otherUser, socket, reconnectAttempts]);
  
  // Handle incoming ICE candidates
  useEffect(() => {
    if (!socket || !peerConnectionRef.current) return;
    
    const handleIceCandidate = async (data) => {
      try {
        if (data.from === otherUser) {
          console.log('Received ICE candidate from:', data.from, data.candidate);
          if (peerConnectionRef.current.remoteDescription) {
            const candidate = new RTCIceCandidate(data.candidate);
            await peerConnectionRef.current.addIceCandidate(candidate);
            console.log('Successfully added ICE candidate');
          } else {
            console.warn('Received ICE candidate before remote description was set');
            // Could store candidates and apply later
          }
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
          console.log('Received answer from:', data.from, data.answer);
          const sessionDesc = new RTCSessionDescription(data.answer);
          console.log('Setting remote description (answer)');
          await peerConnectionRef.current.setRemoteDescription(sessionDesc);
          console.log('Remote description set successfully');
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
  
  // Handle call rejection and ending
  useEffect(() => {
    if (!socket) return;
    
    const handleCallRejected = (data) => {
      if (data.from === otherUser) {
        console.log('Call rejected by:', data.from);
        setCallStatus('rejected');
        onEndCall(); // End call on our side
      }
    };
    
    const handleCallEnded = (data) => {
      if (data.from === otherUser) {
        console.log('Call ended by:', data.from);
        setCallStatus('ended');
        onEndCall(); // End call on our side
      }
    };
    
    console.log('Setting up call rejection and ended listeners');
    socket.on('call-rejected', handleCallRejected);
    socket.on('call-ended', handleCallEnded);
    
    return () => {
      console.log('Removing call rejection and ended listeners');
      socket.off('call-rejected', handleCallRejected);
      socket.off('call-ended', handleCallEnded);
    };
  }, [otherUser, socket, onEndCall]);
  
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
  
  const handleEndCall = () => {
    console.log(`Ending call with ${otherUser}`);
    socket.emit('end-call', {
      to: otherUser,
      from: currentUser.username
    });
    onEndCall();
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
          {callStatus === 'disconnected' && 'Disconnected'}
          {callStatus === 'failed' && 'Connection failed'}
          {callStatus === 'rejected' && 'Call rejected'}
          {callStatus === 'ended' && 'Call ended'}
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
        {(!remoteStream || callStatus === 'failed' || callStatus === 'error') && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-70 text-white">
            <div className="text-center">
              <div className="text-xl font-medium mb-2">
                {callStatus === 'connecting' && 'Connecting to remote user...'}
                {callStatus === 'disconnected' && 'Connection lost. Trying to reconnect...'}
                {callStatus === 'failed' && 'Connection failed. Please try again.'}
                {callStatus === 'rejected' && 'Call was rejected'}
                {callStatus === 'ended' && 'Call ended'}
                {callStatus === 'error' && 'Error accessing camera/microphone'}
              </div>
              <div className="text-gray-400">
                {connectionState !== 'connected' && callStatus === 'connecting' && 'Waiting for remote video...'}
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
          onClick={handleEndCall}
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