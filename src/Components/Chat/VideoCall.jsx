import React, { useEffect, useRef, useState } from 'react';

const VideoCall = ({ socket, callData, currentUser, onEndCall }) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callStatus, setCallStatus] = useState('connecting');
  const [showAcceptReject, setShowAcceptReject] = useState(!callData.isInitiator);
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const iceCandidatesRef = useRef([]);

  const otherUser = callData.isInitiator ? callData.callee : callData.caller;

  // Initialize WebRTC with improved configuration
  const initializePeerConnection = () => {
    if (peerConnectionRef.current) {
      console.log('Peer connection already exists');
      return peerConnectionRef.current;
    }
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
    
    // Add connection state monitoring
    pc.addEventListener('connectionstatechange', () => {
      console.log('Connection state:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        setCallStatus('connected');
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        restartIce();
      }
    });

    pc.addEventListener('iceconnectionstatechange', () => {
      console.log('ICE connection state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setCallStatus('connected');
      } else if (pc.iceConnectionState === 'failed') {
        restartIce();
      }
    });

    pc.addEventListener('signalingstatechange', () => {
      console.log('Signaling state:', pc.signalingState);
    });

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('New ICE candidate:', event.candidate.candidate);
        
        // Send if remote description is set, otherwise queue
        if (pc.remoteDescription) {
          socket.emit('ice-candidate', {
            to: otherUser,
            from: currentUser.username,
            candidate: event.candidate
          });
        } else {
          console.log('Queuing ICE candidate - no remote description yet');
          iceCandidatesRef.current.push(event.candidate);
        }
      } else {
        console.log('ICE gathering complete');
      }
    };

    // Handle remote tracks
    pc.ontrack = (event) => {
      console.log('Received remote track:', event.track.kind);
      
      if (event.streams && event.streams.length > 0) {
        setRemoteStream(event.streams[0]);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      } else {
        // Create a new stream if none exists
        const newStream = new MediaStream();
        newStream.addTrack(event.track);
        setRemoteStream(newStream);
        
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = newStream;
        }
      }
    };

    return pc;
  };

  // Get user media and initialize call
  const initializeMedia = async () => {
    try {
      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Create peer connection if it doesn't exist
      if (!peerConnectionRef.current) {
        initializePeerConnection();
      }

      // Add local tracks to the connection
      stream.getTracks().forEach(track => {
        peerConnectionRef.current.addTrack(track, stream);
      });

      // If initiator, create and send offer
      if (callData.isInitiator) {
        const offer = await peerConnectionRef.current.createOffer();
        await peerConnectionRef.current.setLocalDescription(offer);
        
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
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
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
    if (!socket || !peerConnectionRef.current || callData.isInitiator) return;

    const handleCallOffer = async (data) => {
      if (data.from === otherUser) {
        try {
          console.log('Received offer from:', data.from);
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
  }, [socket, otherUser, callData.isInitiator]);

  // Handle incoming answers (for initiator)
  useEffect(() => {
    if (!socket || !peerConnectionRef.current || !callData.isInitiator) return;

    const handleAnswer = async (data) => {
      if (data.from === otherUser) {
        try {
          console.log('Received answer from:', data.from);
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
  }, [socket, otherUser, callData.isInitiator]);

  // Handle incoming ICE candidates
  useEffect(() => {
    if (!socket || !peerConnectionRef.current) return;

    const handleIceCandidate = async (data) => {
      if (data.from === otherUser && data.candidate) {
        try {
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
  }, [socket, otherUser]);

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
const handleAcceptCall = async () => {
  setShowAcceptReject(false);
  setCallStatus('connecting');
  
  try {
    // Initialize peer connection FIRST - before trying to add tracks
    if (!peerConnectionRef.current) {
      initializePeerConnection();
    }
    
    // IMPORTANT: Make sure peer connection exists before continuing
    if (!peerConnectionRef.current) {
      throw new Error('Failed to create peer connection');
    }
    
    // Get user media if not already obtained
    if (!localStream) {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      
      // Now that we're sure peerConnectionRef.current exists, add tracks
      stream.getTracks().forEach(track => {
        peerConnectionRef.current.addTrack(track, stream);
      });
    } else {
      // Add tracks from existing stream
      localStream.getTracks().forEach(track => {
        peerConnectionRef.current.addTrack(track, localStream);
      });
    }
    
    // Set remote description (offer) and create answer
    if (callData.offer) {
      await peerConnectionRef.current.setRemoteDescription(
        new RTCSessionDescription(callData.offer)
      );
      
      // Process any queued ICE candidates
      processQueuedCandidates();
      
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      
      // Send answer to caller
      socket.emit('make-answer', {
        to: callData.caller,
        from: currentUser.username,
        answer: answer
      });
      
      console.log('Call accepted and answer sent');
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