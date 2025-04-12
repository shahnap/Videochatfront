import React, { useEffect, useRef, useState } from 'react';

const VideoCall = ({ socket, callData, currentUser, onEndCall }) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callStatus, setCallStatus] = useState('connecting');
  const [showAcceptReject, setShowAcceptReject] = useState(!callData.isInitiator);
  // Track if the peer connection has been created
  const [peerConnectionCreated, setPeerConnectionCreated] = useState(false);
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const iceCandidatesRef = useRef([]);

  const otherUser = callData.isInitiator ? callData.callee : callData.caller;

  // Close existing peer connection if it exists
  const closePeerConnection = () => {
    if (peerConnectionRef.current) {
      console.log('Closing existing peer connection');
      
      try {
        // Remove all event listeners
        peerConnectionRef.current.onicecandidate = null;
        peerConnectionRef.current.ontrack = null;
        peerConnectionRef.current.onsignalingstatechange = null;
        peerConnectionRef.current.oniceconnectionstatechange = null;
        peerConnectionRef.current.onconnectionstatechange = null;
        
        // Close the connection
        peerConnectionRef.current.close();
      } catch (err) {
        console.error('Error closing peer connection:', err);
      }
      
      peerConnectionRef.current = null;
      setPeerConnectionCreated(false);
    }
  };

  // Initialize WebRTC with improved configuration
 // Initialize WebRTC with improved configuration
// Initialize WebRTC with improved configuration
const initializePeerConnection = () => {
  // If a connection exists, check its state
  if (peerConnectionRef.current) {
    console.log('Existing peer connection found, state:', peerConnectionRef.current.signalingState);
    // If connection is closed, clean it up first
    if (peerConnectionRef.current.signalingState === 'closed') {
      closePeerConnection();
    } else {
      console.log('Peer connection already exists and is not closed');
      return peerConnectionRef.current;
    }
  }
  
  try {
    console.log('Creating new peer connection');
    // Improved ICE server configuration
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        {
          urls: [
            'turn:openrelay.metered.ca:80',
            'turn:openrelay.metered.ca:443',
            'turn:openrelay.metered.ca:443?transport=tcp'
          ],
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ],
      iceCandidatePoolSize: 10
    };

    const pc = new RTCPeerConnection(configuration);
    peerConnectionRef.current = pc;
    setPeerConnectionCreated(true);
    
    // Add debug logging for signaling state changes with timestamps
    pc.addEventListener('signalingstatechange', () => {
      console.log(`Signaling state changed to: ${pc.signalingState} at ${new Date().toISOString()}`);
    });
    
    // Add connection state monitoring
    pc.addEventListener('connectionstatechange', () => {
      console.log(`Connection state changed to: ${pc.connectionState} at ${new Date().toISOString()}`);
      if (pc.connectionState === 'connected') {
        setCallStatus('connected');
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        restartIce();
      } else if (pc.connectionState === 'closed') {
        console.log('Connection was closed');
      }
    });

    pc.addEventListener('iceconnectionstatechange', () => {
      console.log(`ICE connection state changed to: ${pc.iceConnectionState} at ${new Date().toISOString()}`);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setCallStatus('connected');
      } else if (pc.iceConnectionState === 'failed') {
        restartIce();
      }
    });

    // Add the missing ontrack handler
    pc.ontrack = (event) => {
      console.log('Received remote track:', event.track.kind);
      setRemoteStream(event.streams[0]);
      
      if (remoteVideoRef.current && event.streams[0]) {
        console.log('Setting remote video stream');
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    // Set up ICE candidate handling
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Generated local ICE candidate');
        socket.emit('ice-candidate', {
          to: otherUser,
          from: currentUser.username,
          candidate: event.candidate
        });
      }
    };
    
    console.log('Peer connection initialized successfully');
    return pc;
  } catch (error) {
    console.error('Error creating peer connection:', error);
    return null;
  }
};
  // Get user media and initialize call
  const initializeMedia = async () => {
    try {
      // First create peer connection before requesting media
      const pc = initializePeerConnection();
      if (!pc) {
        throw new Error('Failed to create peer connection');
      }

      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Check connection state before adding tracks
      if (pc.signalingState === 'closed') {
        throw new Error('Cannot add tracks to closed connection');
      }

      // Add local tracks to the connection
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      // If initiator, create and send offer
      if (callData.isInitiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        socket.emit('call-user', {
          to: otherUser,
          from: currentUser.username,
          offer: offer
        });
      }

      // Set timeout for connection
      setTimeout(() => {
        if (callStatus === 'connecting' && peerConnectionRef.current) {
          console.log('Connection timeout - restarting ICE');
          restartIce();
        }
      }, 30000);

    } catch (error) {
      console.error('Error initializing media:', error);
      setCallStatus('error');
    }
  };

  // Process queued ICE candidates
  const processQueuedCandidates = async () => {
    if (!peerConnectionRef.current || !peerConnectionRef.current.remoteDescription) return;
    
    console.log(`Processing ${iceCandidatesRef.current.length} queued ICE candidates`);
    
    while (iceCandidatesRef.current.length > 0) {
      const candidate = iceCandidatesRef.current.shift();
      try {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('Added queued ICE candidate');
      } catch (error) {
        console.error('Error adding queued ICE candidate:', error);
      }
    }
  };

  // Initialize media when component mounts or call is accepted
  useEffect(() => {
    if (!showAcceptReject) {
      initializeMedia();
    }

    return () => {
      // Clean up on unmount
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      closePeerConnection();
    };
  }, [showAcceptReject]);

  // Handle ICE restart
  const restartIce = async () => {
    if (!peerConnectionRef.current || 
        peerConnectionRef.current.signalingState === 'closed') {
      console.log('Cannot restart ICE: connection is closed or null');
      return;
    }
    
    try {
      console.log('Attempting to restart ICE connection');
      const offer = await peerConnectionRef.current.createOffer({ iceRestart: true });
      await peerConnectionRef.current.setLocalDescription(offer);
      
      socket.emit('call-user', {
        to: otherUser,
        from: currentUser.username,
        offer: offer
      });
    } catch (error) {
      console.error('Error restarting ICE:', error);
    }
  };

  // Handle incoming call offers (for receiver)
  useEffect(() => {
    if (!socket || !peerConnectionCreated || callData.isInitiator) return;

    const handleCallOffer = async (data) => {
      if (data.from === otherUser) {
        try {
          console.log('Received offer from:', data.from);
          
          // Ensure we have a valid connection
          if (!peerConnectionRef.current || peerConnectionRef.current.signalingState === 'closed') {
            console.log('Connection was closed or null, reinitializing');
            initializePeerConnection();
          }
          
          await peerConnectionRef.current.setRemoteDescription(
            new RTCSessionDescription(data.offer)
          );
          
          // Process any queued ICE candidates
          processQueuedCandidates();
          
          const answer = await peerConnectionRef.current.createAnswer();
          await peerConnectionRef.current.setLocalDescription(answer);
          
          socket.emit('make-answer', {
            to: otherUser,
            from: currentUser.username,
            answer: answer
          });
          
          console.log('Answer sent successfully');
        } catch (error) {
          console.error('Error handling call offer:', error);
        }
      }
    };

    socket.on('call-made', handleCallOffer);

    return () => {
      socket.off('call-made', handleCallOffer);
    };
  }, [socket, otherUser, callData.isInitiator, peerConnectionCreated]);

  // Handle incoming answers (for initiator)
  useEffect(() => {
    if (!socket || !peerConnectionCreated || !callData.isInitiator) return;

    const handleAnswer = async (data) => {
      if (data.from === otherUser) {
        try {
          console.log('Received answer from:', data.from);
          
          // Ensure connection is valid
          if (!peerConnectionRef.current || peerConnectionRef.current.signalingState === 'closed') {
            console.log('Connection was closed or null when receiving answer');
            return;
          }
          
          await peerConnectionRef.current.setRemoteDescription(
            new RTCSessionDescription(data.answer)
          );
          console.log('Remote description set successfully');
          
          // Process any queued ICE candidates after setting remote description
          processQueuedCandidates();
        } catch (error) {
          console.error('Error handling answer:', error);
        }
      }
    };

    socket.on('answer-made', handleAnswer);

    return () => {
      socket.off('answer-made', handleAnswer);
    };
  }, [socket, otherUser, callData.isInitiator, peerConnectionCreated]);

  // Handle incoming ICE candidates
  useEffect(() => {
    if (!socket || !peerConnectionCreated) return;

    const handleIceCandidate = async (data) => {
      if (data.from === otherUser && data.candidate) {
        try {
          // Check if connection still exists
          if (!peerConnectionRef.current || peerConnectionRef.current.signalingState === 'closed') {
            console.log('Connection was closed when receiving ICE candidate');
            return;
          }
          
          if (peerConnectionRef.current.remoteDescription) {
            await peerConnectionRef.current.addIceCandidate(
              new RTCIceCandidate(data.candidate)
            );
            console.log('Added incoming ICE candidate');
          } else {
            // Queue if remote description is not set yet
            console.log('Queuing incoming ICE candidate - no remote description');
            iceCandidatesRef.current.push(data.candidate);
          }
        } catch (error) {
          console.error('Error adding ICE candidate:', error);
        }
      }
    };

    socket.on('ice-candidate', handleIceCandidate);

    return () => {
      socket.off('ice-candidate', handleIceCandidate);
    };
  }, [socket, otherUser, peerConnectionCreated]);

  // Handle call rejection and ending
  useEffect(() => {
    if (!socket) return;

    const handleCallRejected = (data) => {
      if (data.from === otherUser) {
        setCallStatus('rejected');
        onEndCall();
      }
    };

    const handleCallEnded = (data) => {
      if (data.from === otherUser) {
        setCallStatus('ended');
        onEndCall();
      }
    };

    socket.on('call-rejected', handleCallRejected);
    socket.on('call-ended', handleCallEnded);

    return () => {
      socket.off('call-rejected', handleCallRejected);
      socket.off('call-ended', handleCallEnded);
    };
  }, [socket, otherUser, onEndCall]);

  // Handle accepting call (for receiver)
// Handle accepting call (for receiver)
// Handle accepting call (for receiver)
const handleAcceptCall = async () => {
  setShowAcceptReject(false);
  setCallStatus('connecting');
  
  try {
    // Close any existing peer connection first
    closePeerConnection();
    
    // Add more detailed logging
    console.log('Creating new peer connection for accept call flow');
    
    // Get user media first before creating the peer connection
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: true, 
      audio: true 
    });
    
    setLocalStream(stream);
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
    
    // Now create the peer connection after media is ready
    const pc = initializePeerConnection();
    
    // Ensure peer connection was successfully created
    if (!pc) {
      throw new Error('Failed to create peer connection');
    }
    
    console.log('Peer connection created successfully, state:', pc.signalingState);
    
    // Check connection state before continuing
    if (pc.signalingState === 'closed') {
      throw new Error('Peer connection was closed immediately after creation');
    }
    
    // Add tracks to the peer connection with error handling
    try {
      stream.getTracks().forEach(track => {
        console.log('Adding track to peer connection:', track.kind);
        pc.addTrack(track, stream);
      });
      console.log('Successfully added all tracks');
    } catch (trackError) {
      console.error('Error adding tracks:', trackError);
      if (pc.signalingState === 'closed') {
        throw new Error('Connection closed while adding tracks');
      } else {
        throw trackError;
      }
    }
    
    // Set remote description (offer) and create answer
    if (callData.offer) {
      console.log('Setting remote description from offer');
      await pc.setRemoteDescription(
        new RTCSessionDescription(callData.offer)
      );
      
      // Process any queued ICE candidates
      processQueuedCandidates();
      
      console.log('Creating answer');
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      // Send answer to caller
      socket.emit('make-answer', {
        to: callData.caller,
        from: currentUser.username,
        answer: answer
      });
      
      console.log('Call accepted and answer sent');
    } else {
      console.warn('No offer found in call data');
    }
  } catch (error) {
    console.error('Error accepting call:', error);
    setCallStatus('error');
  }
};

  // Handle rejecting call
  const handleRejectCall = () => {
    socket.emit('reject-call', {
      to: otherUser,
      from: currentUser.username
    });
    onEndCall();
  };

  // Handle ending call
  const handleEndCall = () => {
    socket.emit('end-call', {
      to: otherUser,
      from: currentUser.username
    });
    onEndCall();
  };

  // Media control functions
  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsVideoOff(!isVideoOff);
    }
  };

  // Render incoming call UI
  if (showAcceptReject) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
        <div className="bg-white p-6 rounded-lg max-w-md w-full">
          <h3 className="text-xl font-bold mb-4">Incoming Video Call</h3>
          <p className="mb-6">From: {otherUser}</p>
          <div className="flex justify-center space-x-4">
            <button
              onClick={handleAcceptCall}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            >
              Accept
            </button>
            <button
              onClick={handleRejectCall}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            >
              Reject
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render video call UI
  return (
    <div className="fixed inset-0 bg-gray-900 flex flex-col z-50">
      {/* Remote video */}
      <div className="flex-grow relative">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
        
        {/* Local video preview */}
        <div className="absolute bottom-4 right-4 w-32 h-24 rounded-lg overflow-hidden border-2 border-white shadow-lg">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        </div>
        
        {/* Status overlay */}
        {(!remoteStream || callStatus !== 'connected') && (
          <div className="absolute inset-0 bg-black bg-opacity-70 flex items-center justify-center">
            <div className="text-center text-white">
              <p className="text-xl mb-2">
                {callStatus === 'connecting' && 'Connecting...'}
                {callStatus === 'rejected' && 'Call rejected'}
                {callStatus === 'ended' && 'Call ended'}
                {callStatus === 'error' && 'Error occurred'}
              </p>
              {callStatus === 'connecting' && (
                <p>Waiting for {otherUser} to connect...</p>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Controls */}
      <div className="bg-gray-800 p-4 flex justify-center space-x-6">
        <button
          onClick={toggleMute}
          className={`p-3 rounded-full ${isMuted ? 'bg-red-500' : 'bg-gray-600'}`}
        >
          {isMuted ? (
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          ) : (
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          )}
        </button>
        
        <button
          onClick={toggleVideo}
          className={`p-3 rounded-full ${isVideoOff ? 'bg-red-500' : 'bg-gray-600'}`}
        >
          {isVideoOff ? (
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          ) : (
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          )}
        </button>
        
        <button
          onClick={handleEndCall}
          className="p-3 bg-red-500 rounded-full"
        >
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default VideoCall;