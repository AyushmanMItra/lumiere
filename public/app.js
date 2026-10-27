// ==========================================================================
// STREAM ROOM - DISCORD-STYLE SYNCHRONIZED THEATER & CALL
// ==========================================================================

(() => {
  // Application State
  const state = {
    socket: null,
    roomId: null,
    username: null,
    isHost: false,
    selfId: null,
    members: new Map(), // socketId -> memberData
    currentMovie: null,
    audioTracks: [],
    subtitleTracks: [],
    selectedAudio: 0,
    selectedSubtitle: 'off',

    // Media & WebRTC
    localStream: null,
    localAudioTrack: null,
    localVideoTrack: null,
    isMicMuted: true, // Start muted like in Image 1
    isCamOn: false,   // Start camera off like in Image 1
    peerConnections: new Map(), // targetId -> RTCPeerConnection
    remoteStreams: new Map(),   // targetId -> MediaStream (video stream per peer)
    pendingIceCandidates: new Map(), // targetId -> RTCIceCandidate[]
    audioContext: null,
    analyser: null,
    speakingInterval: null,
    isSpeaking: false,

    // UI & Inactivity timer (Matching Image 2: hide after 3 seconds)
    chatOpen: false,
    unreadMessages: 0,
    idleTimeout: null,
    controlsTimeout: null,
    isDraggingTimeline: false,
    lastSyncSeekTime: 0,
    movieDuration: 0,
    streamStartTime: 0,
    isLiveStream: false
  };

  const ICE_SERVERS = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      // OpenRelay Public TURN Server for Cross-Network NAT/Firewall Traversal
      {
        urls: [
          'turn:openrelay.metered.ca:80',
          'turn:openrelay.metered.ca:443',
          'turn:openrelay.metered.ca:443?transport=tcp'
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ]
  };

  // DOM Elements
  const el = {
    joinModal: document.getElementById('joinModal'),
    usernameInput: document.getElementById('usernameInput'),
    roomInput: document.getElementById('roomInput'),
    randomRoomBtn: document.getElementById('randomRoomBtn'),
    joinRoomBtn: document.getElementById('joinRoomBtn'),
    createRoomBtn: document.getElementById('createRoomBtn'),
    networkBadge: document.getElementById('networkBadge'),

    aboutPage: document.getElementById('aboutPage'),
    navAboutBtn: document.getElementById('navAboutBtn'),
    footerAboutBtn: document.getElementById('footerAboutBtn'),
    theaterAboutBtn: document.getElementById('theaterAboutBtn'),
    aboutBackBtn: document.getElementById('aboutBackBtn'),
    aboutLaunchBtn: document.getElementById('aboutLaunchBtn'),

    feedbackModal: document.getElementById('feedbackModal'),
    navFeedbackBtn: document.getElementById('navFeedbackBtn'),
    footerFeedbackBtn: document.getElementById('footerFeedbackBtn'),
    theaterFeedbackBtn: document.getElementById('theaterFeedbackBtn'),
    closeFeedbackBtn: document.getElementById('closeFeedbackBtn'),
    cancelFeedbackBtn: document.getElementById('cancelFeedbackBtn'),
    feedbackForm: document.getElementById('feedbackForm'),

    supportModal: document.getElementById('supportModal'),
    navSupportBtn: document.getElementById('navSupportBtn'),
    footerSupportBtn: document.getElementById('footerSupportBtn'),
    theaterSupportBtn: document.getElementById('theaterSupportBtn'),
    aboutSupportBtn: document.getElementById('aboutSupportBtn'),
    closeSupportBtn: document.getElementById('closeSupportBtn'),
    copyUpiBtn: document.getElementById('copyUpiBtn'),

    appContainer: document.getElementById('appContainer'),
    topBar: document.getElementById('topBar'),
    roomTitleDisplay: document.getElementById('roomTitleDisplay'),
    hostPill: document.getElementById('hostPill'),
    hostNameDisplay: document.getElementById('hostNameDisplay'),
    topChatBtn: document.getElementById('topChatBtn'),
    chatBadge: document.getElementById('chatBadge'),

    mainWorkspace: document.getElementById('mainWorkspace'),
    stageSection: document.getElementById('stageSection'),
    cinemaBox: document.getElementById('cinemaBox'),
    moviePlayer: document.getElementById('moviePlayer'),
    stagePlaceholder: document.getElementById('stagePlaceholder'),
    stageAvatarImg: document.getElementById('stageAvatarImg'),
    openMovieLibraryBtn: document.getElementById('openMovieLibraryBtn'),
    stageBottomTag: document.getElementById('stageBottomTag'),
    stageUsername: document.getElementById('stageUsername'),
    stageMicIcon: document.getElementById('stageMicIcon'),
    unmuteMovieBanner: document.getElementById('unmuteMovieBanner'),

    cinemaControls: document.getElementById('cinemaControls'),
    timelineContainer: document.getElementById('timelineContainer'),
    timelineBar: document.getElementById('timelineBar'),
    timelineBuffered: document.getElementById('timelineBuffered'),
    timelineProgress: document.getElementById('timelineProgress'),
    timelineThumb: document.getElementById('timelineThumb'),
    timelineHoverTime: document.getElementById('timelineHoverTime'),

    playPauseBtn: document.getElementById('playPauseBtn'),
    playIcon: document.getElementById('playIcon'),
    pauseIcon: document.getElementById('pauseIcon'),
    rewind10Btn: document.getElementById('rewind10Btn'),
    forward10Btn: document.getElementById('forward10Btn'),
    currentTimeDisplay: document.getElementById('currentTimeDisplay'),
    durationDisplay: document.getElementById('durationDisplay'),

    audioPickerGroup: document.getElementById('audioPickerGroup'),
    audioTrackSelect: document.getElementById('audioTrackSelect'),
    subtitlePickerGroup: document.getElementById('subtitlePickerGroup'),
    subtitleTrackSelect: document.getElementById('subtitleTrackSelect'),

    volumeToggleBtn: document.getElementById('volumeToggleBtn'),
    volHighIcon: document.getElementById('volHighIcon'),
    volMuteIcon: document.getElementById('volMuteIcon'),
    volumeSlider: document.getElementById('volumeSlider'),
    cinemaVolumeMeter: document.getElementById('cinemaVolumeMeter'),
    meterVolHighIcon: document.getElementById('meterVolHighIcon'),
    meterVolMuteIcon: document.getElementById('meterVolMuteIcon'),
    meterBarFill: document.getElementById('meterBarFill'),
    meterValueText: document.getElementById('meterValueText'),
    hudFullscreenBtn: document.getElementById('hudFullscreenBtn'),
    hudFullscreenExpand: document.getElementById('hudFullscreenExpand'),
    hudFullscreenCompress: document.getElementById('hudFullscreenCompress'),

    participantStrip: document.getElementById('participantStrip'),

    dockWrapper: document.getElementById('dockWrapper'),
    dockInviteBtn: document.getElementById('dockInviteBtn'),
    toggleMicBtn: document.getElementById('toggleMicBtn'),
    micOnIcon: document.getElementById('micOnIcon'),
    micOffIcon: document.getElementById('micOffIcon'),
    micDeviceDropdownBtn: document.getElementById('micDeviceDropdownBtn'),
    micDeviceMenu: document.getElementById('micDeviceMenu'),
    micDeviceList: document.getElementById('micDeviceList'),

    toggleCameraBtn: document.getElementById('toggleCameraBtn'),
    camOnIcon: document.getElementById('camOnIcon'),
    camOffIcon: document.getElementById('camOffIcon'),
    camDeviceDropdownBtn: document.getElementById('camDeviceDropdownBtn'),
    camDeviceMenu: document.getElementById('camDeviceMenu'),
    camDeviceList: document.getElementById('camDeviceList'),

    hostMovieLibraryDockBtn: document.getElementById('hostMovieLibraryDockBtn'),
    layoutToggleBtn: document.getElementById('layoutToggleBtn'),
    disconnectBtn: document.getElementById('disconnectBtn'),
    theaterFullscreenBtn: document.getElementById('theaterFullscreenBtn'),

    chatSidebar: document.getElementById('chatSidebar'),
    closeChatBtn: document.getElementById('closeChatBtn'),
    chatMessages: document.getElementById('chatMessages'),
    chatWelcomeHero: document.getElementById('chatWelcomeHero'),
    chatForm: document.getElementById('chatForm'),
    chatInput: document.getElementById('chatInput'),
    chatEmojiBtn: document.getElementById('chatEmojiBtn'),
    chatReactionBtn: document.getElementById('chatReactionBtn'),
    chatEmojiPicker: document.getElementById('chatEmojiPicker'),
    chatReactionsTray: document.getElementById('chatReactionsTray'),
    emojiSearchInput: document.getElementById('emojiSearchInput'),
    emojiPickerGrid: document.getElementById('emojiPickerGrid'),
    reactionBurstContainer: document.getElementById('reactionBurstContainer'),
    chatReactionBurstContainer: document.getElementById('chatReactionBurstContainer'),

    movieModal: document.getElementById('movieModal'),
    closeMovieModalBtn: document.getElementById('closeMovieModalBtn'),
    refreshMoviesBtn: document.getElementById('refreshMoviesBtn'),
    folderHint: document.getElementById('folderHint'),
    uploadDropzone: document.getElementById('uploadDropzone'),
    movieFileInput: document.getElementById('movieFileInput'),
    uploadProgress: document.getElementById('uploadProgress'),
    uploadProgressFill: document.getElementById('uploadProgressFill'),
    movieLibraryList: document.getElementById('movieLibraryList'),

    toastContainer: document.getElementById('toastContainer')
  };

  function generateRandomRoomCode() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  async function init() {
    let savedUser = '';
    try {
      savedUser = localStorage.getItem('lumiere_username') || localStorage.getItem('reeltime_username');
    } catch (e) {}
    el.usernameInput.value = savedUser || 'ayushman';

    const hashRoom = window.location.hash.replace('#', '').trim();
    const urlParams = new URLSearchParams(window.location.search);
    const queryRoom = urlParams.get('room');
    el.roomInput.value = hashRoom || queryRoom || generateRandomRoomCode();

    try {
      const res = await fetch('/api/info');
      const data = await res.json();
      const ip = data.tailscaleIp || data.localIp;
      el.networkBadge.innerText = ip ? `Connected: ${ip}` : 'Engine Ready';
      el.folderHint.innerText = `Folder: ${data.moviesDir}`;
    } catch (e) {
      el.networkBadge.innerText = 'Connected';
    }

    attachEventListeners();
    setupIdleDetection(); // 3-second auto-hide feature (Image 2)
  }

  function showToast(msg, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerText = msg;
    el.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 250);
    }, 2800);
  }

  // ==========================================================================
  // IDLE DETECTOR (Matching Image 3: Controls drop after 3s inactivity)
  // ==========================================================================

  function setupIdleDetection() {
    const resetIdleTimer = () => {
      // Wake up: show top bar, bottom dock, and restore full badges
      el.appContainer.classList.remove('idle-mode');
      el.topBar.classList.remove('idle-hidden');
      el.dockWrapper.classList.remove('idle-hidden');

      clearTimeout(state.idleTimeout);
      // After 3 seconds of inactivity, smoothly drop panels (Image 3)
      state.idleTimeout = setTimeout(() => {
        if (!state.chatOpen && el.movieModal.classList.contains('hidden')) {
          el.appContainer.classList.add('idle-mode');
          el.topBar.classList.add('idle-hidden');
          el.dockWrapper.classList.add('idle-hidden');
        }
      }, 3000);
    };

    window.addEventListener('mousemove', resetIdleTimer);
    window.addEventListener('mousedown', resetIdleTimer);
    window.addEventListener('touchstart', resetIdleTimer, { passive: true });
    window.addEventListener('touchmove', resetIdleTimer, { passive: true });
    window.addEventListener('keydown', resetIdleTimer);

    resetIdleTimer();
  }

  // ==========================================================================
  // JOIN ROOM & SOCKET.IO SETUP
  // ==========================================================================

  async function joinRoom() {
    const username = el.usernameInput.value.trim() || 'ayushman';
    const roomId = el.roomInput.value.trim() || generateRandomRoomCode();

    state.username = username;
    state.roomId = roomId;
    window.location.hash = roomId;

    try {
      localStorage.setItem('lumiere_username', username);
    } catch (e) {}

    el.joinModal.classList.add('hidden');
    if (el.aboutPage) el.aboutPage.classList.add('hidden');
    el.appContainer.classList.remove('hidden');
    el.roomTitleDisplay.innerText = `Lumière - ${roomId}`;
    el.stageUsername.innerText = username;

    // 1. Initialize Microphone FIRST so tracks are ready when peers connect
    await initLocalMedia();

    // 2. Connect Socket.io
    if (!state.socket) {
      state.socket = io();
      setupSocketListeners();
    }

    // 3. Emit join-room
    state.socket.emit('join-room', {
      roomId: state.roomId,
      username: state.username
    });
  }

  function setupSocketListeners() {
    const s = state.socket;

    // Room joined callback
    s.on('room-joined', async (data) => {
      state.selfId = data.selfId;
      state.isHost = data.isHost;

      state.members.clear();
      data.members.forEach(m => state.members.set(m.id, m));

      updateHostStatusUI();
      renderParticipantStrip();

      if (data.currentMovie) {
        loadMovieInTheater(data.currentMovie, data.audioTrack, data.subtitleTrack, data.currentTime, data.isPlaying);
      }

      // Connect WebRTC to every existing member in the room
      for (const member of data.members) {
        if (member.id !== state.selfId) {
          await initiateCall(member.id);
        }
      }
    });

    // Member joined
    s.on('member-joined', (member) => {
      state.members.set(member.id, member);
      renderParticipantStrip();
      showToast(`${member.username} joined`);
      getOrCreatePeerConnection(member.id);
    });

    // Member left
    s.on('member-left', ({ id }) => {
      const member = state.members.get(id);
      if (member) {
        showToast(`${member.username} left`);
        state.members.delete(id);
        closePeerConnection(id);
        renderParticipantStrip();
      }
    });

    // Host changed
    s.on('host-changed', ({ newHostId, newHostName }) => {
      state.isHost = (newHostId === state.selfId);
      state.members.forEach(m => m.isHost = (m.id === newHostId));
      updateHostStatusUI();
      renderParticipantStrip();
      showToast(`Host: ${newHostName}`);
    });

    // Synchronized Movie Playback Engine
    s.on('sync-play', ({ time }) => {
      if (Math.abs(getEffectiveCurrentTime() - time) > 2.0) {
        seekMovie(time);
      }
      el.moviePlayer.playbackRate = 1.0;
      el.moviePlayer.play().catch(() => {
        el.unmuteMovieBanner.classList.remove('hidden');
      });
      updatePlayPauseIcons(true);
    });

    s.on('sync-pause', ({ time }) => {
      el.moviePlayer.pause();
      el.moviePlayer.playbackRate = 1.0;
      updatePlayPauseIcons(false);
      // Gentle pause: never force seek unless drift is massive (> 3.5s) to preserve buffer
      if (Math.abs(getEffectiveCurrentTime() - time) > 3.5) {
        seekMovie(time);
      }
    });

    s.on('sync-seek', ({ time }) => {
      seekMovie(time);
    });

    s.on('sync-movie-changed', ({ movie, audioTrack, subtitleTrack }) => {
      loadMovieInTheater(movie, audioTrack, subtitleTrack, 0, false);
      showToast(`Now Playing: ${movie.filename}`);
    });

    s.on('sync-tracks-changed', ({ audioTrack, subtitleTrack, currentTime }) => {
      applyTrackChanges(audioTrack, subtitleTrack, currentTime, !el.moviePlayer.paused);
      const trackObj = state.audioTracks.find(t => t.trackIndex === audioTrack);
      showToast(`Audio Track: ${trackObj ? trackObj.label : `Track ${audioTrack + 1}`}`);
    });

    // Smooth Dynamic Rate Steering & Heartbeat
    s.on('sync-heartbeat', ({ time, isPlaying }) => {
      if (state.isHost) return;

      // 1. If currently in seek cooldown, don't interrupt buffering
      if (Date.now() - state.lastSyncSeekTime < 3500) {
        return;
      }

      // 2. Align play/pause state
      if (isPlaying && el.moviePlayer.paused) {
        el.moviePlayer.play().catch(() => {
          el.unmuteMovieBanner.classList.remove('hidden');
        });
      } else if (!isPlaying && !el.moviePlayer.paused) {
        el.moviePlayer.pause();
        el.moviePlayer.playbackRate = 1.0;
        updatePlayPauseIcons(false);
        return;
      }

      // 3. Dynamic Playback Rate Catchup (works across all native MP4 and live MKV streams)
      // positive drift = member is BEHIND host
      // negative drift = member is AHEAD of host
      const cur = getEffectiveCurrentTime();
      const drift = time - cur;

      if (Math.abs(drift) > 3.5) {
        // Severe drift: seek once and enter cooldown
        console.log(`[Sync] Large drift detected (${drift.toFixed(2)}s). Resyncing...`);
        seekMovie(time);
      } else {
        // Smooth Catchup: gently adjust rate without interrupting stream buffer
        if (drift > 0.25) {
          // Member is slightly behind: accelerate to 1.06x to smoothly close the gap
          el.moviePlayer.playbackRate = 1.06;
        } else if (drift < -0.25) {
          // Member is slightly ahead: gently decelerate to 0.95x
          el.moviePlayer.playbackRate = 0.95;
        } else {
          // Within 250ms of host: perfectly in frame lockstep at 1.0x rate
          if (el.moviePlayer.playbackRate !== 1.0) {
            el.moviePlayer.playbackRate = 1.0;
          }
        }
      }

      updatePlayPauseIcons(!el.moviePlayer.paused);
    });

    // Disrupted Member Auto-Resync Response
    s.on('room-synced', ({ currentMovie, audioTrack, subtitleTrack, currentTime, isPlaying }) => {
      if (state.isHost) return;
      if (!currentMovie) return;

      if (!state.currentMovie || state.currentMovie.filename !== currentMovie.filename) {
        loadMovieInTheater(currentMovie, audioTrack, subtitleTrack, currentTime, isPlaying);
        return;
      }

      const cur = getEffectiveCurrentTime();
      const drift = Math.abs(cur - currentTime);
      if (drift > 2.0) {
        seekMovie(currentTime);
      }

      if (isPlaying && el.moviePlayer.paused) {
        el.moviePlayer.play().catch(() => {
          el.unmuteMovieBanner.classList.remove('hidden');
        });
      } else if (!isPlaying && !el.moviePlayer.paused) {
        el.moviePlayer.pause();
      }
      updatePlayPauseIcons(isPlaying);
    });

    // Auto-reconnect sync
    s.on('connect', () => {
      if (state.roomId) {
        console.log('[Socket] Reconnected, requesting sync...');
        s.emit('request-room-sync', { roomId: state.roomId });
      }
    });

    // Status changed (Mute, Cam, Speaking)
    s.on('member-status-changed', ({ id, isMuted, isCamOn, isSpeaking }) => {
      const member = state.members.get(id);
      if (member) {
        member.isMuted = isMuted;
        member.isCamOn = isCamOn;
        member.isSpeaking = isSpeaking;
        updateParticipantTileState(id);
      }
    });

    s.on('member-speaking-changed', ({ id, isSpeaking }) => {
      const member = state.members.get(id);
      if (member) {
        member.isSpeaking = isSpeaking;
        const tile = document.getElementById(`participant-tile-${id}`);
        if (tile) tile.classList.toggle('is-speaking', isSpeaking);
      }
    });

    // WebRTC Signaling
    s.on('webrtc-offer', async ({ senderId, offer }) => {
      console.log(`[WebRTC] Received offer from ${senderId}`);
      const pc = getOrCreatePeerConnection(senderId);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        // Drain any pending ICE candidates queued before remoteDescription was set
        const pending = state.pendingIceCandidates.get(senderId) || [];
        for (const cand of pending) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
          } catch (e) {}
        }
        state.pendingIceCandidates.delete(senderId);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        s.emit('webrtc-answer', { targetId: senderId, answer });
        updateParticipantTileState(senderId);
      } catch (err) {
        console.error('[WebRTC] Offer error:', err);
      }
    });

    s.on('webrtc-answer', async ({ senderId, answer }) => {
      console.log(`[WebRTC] Received answer from ${senderId}`);
      const pc = state.peerConnections.get(senderId);
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));

          // Drain any pending ICE candidates queued before remoteDescription was set
          const pending = state.pendingIceCandidates.get(senderId) || [];
          for (const cand of pending) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
            } catch (e) {}
          }
          state.pendingIceCandidates.delete(senderId);

          updateParticipantTileState(senderId);
        } catch (err) {
          console.error('[WebRTC] Answer error:', err);
        }
      }
    });

    s.on('webrtc-ice', async ({ senderId, candidate }) => {
      if (!candidate) return;
      const pc = state.peerConnections.get(senderId);
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
        } catch (e) {}
      } else {
        if (!state.pendingIceCandidates.has(senderId)) {
          state.pendingIceCandidates.set(senderId, []);
        }
        state.pendingIceCandidates.get(senderId).push(candidate);
      }
    });

    // Chat Message
    s.on('chat-message', (msg) => {
      appendChatMessage(msg);
      if (!state.chatOpen) {
        state.unreadMessages++;
        el.chatBadge.innerText = state.unreadMessages;
        el.chatBadge.classList.remove('hidden');
      }
    });

    // Live Floating Reaction Burst
    s.on('reaction-burst', ({ emoji, username }) => {
      spawnReactionBurst(emoji, username);
    });
  }

  // ==========================================================================
  // WEBRTC VIDEO & AUDIO ENGINE (Fixes Remote Black Screen)
  // ==========================================================================

  function isSecureConnection() {
    return window.isSecureContext || 
           window.location.hostname === 'localhost' || 
           window.location.hostname === '127.0.0.1';
  }

  async function initLocalMedia() {
    if (!isSecureConnection()) {
      showToast('Camera & Mic require HTTPS (Port 3443)', 'error');
      return;
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      });

      state.localStream = stream;
      state.localAudioTrack = stream.getAudioTracks()[0];
      // Start in muted state matching Image 1
      if (state.localAudioTrack) {
        state.localAudioTrack.enabled = !state.isMicMuted;
      }

      setupSpeakingDetector(stream);
      enumerateMediaDevices();
      console.log('[Media] Microphone ready');
    } catch (err) {
      console.warn('Microphone init:', err.message);
    }
  }

  function setupSpeakingDetector(stream) {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      state.audioContext = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const buffer = new Uint8Array(analyser.frequencyBinCount);

      clearInterval(state.speakingInterval);
      state.speakingInterval = setInterval(() => {
        if (state.isMicMuted || !state.socket) {
          if (state.isSpeaking) {
            state.isSpeaking = false;
            setLocalSpeaking(false);
          }
          return;
        }

        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i];
        const avg = sum / buffer.length;

        const speaking = avg > 18;
        if (speaking !== state.isSpeaking) {
          state.isSpeaking = speaking;
          setLocalSpeaking(speaking);
        }
      }, 100);
    } catch (e) {}
  }

  function setLocalSpeaking(isSpeaking) {
    const tile = document.getElementById(`participant-tile-${state.selfId}`);
    if (tile) tile.classList.toggle('is-speaking', isSpeaking);
    if (state.socket && state.roomId) {
      state.socket.emit('update-speaking-status', { roomId: state.roomId, isSpeaking });
    }
  }

  function getRemoteVideoStream(targetId) {
    if (state.remoteStreams.has(targetId)) {
      const ms = state.remoteStreams.get(targetId);
      if (ms && ms.getVideoTracks().length > 0) return ms;
    }
    const pc = state.peerConnections.get(targetId);
    if (pc) {
      const receivers = pc.getReceivers ? pc.getReceivers() : [];
      const videoReceiver = receivers.find(r => r.track && r.track.kind === 'video' && r.track.readyState !== 'ended');
      if (videoReceiver && videoReceiver.track) {
        const ms = new MediaStream([videoReceiver.track]);
        state.remoteStreams.set(targetId, ms);
        return ms;
      }
    }
    return null;
  }

  function attachRemoteVideo(targetId, stream) {
    if (!stream) return;
    state.remoteStreams.set(targetId, stream);

    const video = document.getElementById(`participant-video-${targetId}`);
    const avatar = document.getElementById(`participant-avatar-${targetId}`);

    if (video) {
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.setAttribute('autoplay', '');

      if (video.srcObject !== stream) {
        video.srcObject = stream;
      }

      video.classList.remove('hidden');
      if (avatar) avatar.classList.add('hidden');

      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.warn('[WebRTC] Autoplay waiting on user touch:', err);
        });
      }
    }
  }

  function detachRemoteVideo(targetId) {
    state.remoteStreams.delete(targetId);
    const video = document.getElementById(`participant-video-${targetId}`);
    const avatar = document.getElementById(`participant-avatar-${targetId}`);
    if (video) {
      video.classList.add('hidden');
      video.srcObject = null;
    }
    if (avatar) avatar.classList.remove('hidden');
  }

  function getOrCreatePeerConnection(targetId) {
    if (state.peerConnections.has(targetId)) {
      return state.peerConnections.get(targetId);
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    state.peerConnections.set(targetId, pc);

    // Add audio track or audio transceiver
    if (state.localAudioTrack) {
      try { pc.addTrack(state.localAudioTrack, state.localStream || new MediaStream([state.localAudioTrack])); } catch (e) {}
    } else {
      try { pc.addTransceiver('audio', { direction: 'sendrecv' }); } catch (e) {}
    }

    // Add video track or video transceiver right away (enables instantaneous camera streaming)
    if (state.localVideoTrack) {
      try { pc.addTrack(state.localVideoTrack, new MediaStream([state.localVideoTrack])); } catch (e) {}
    } else {
      try { pc.addTransceiver('video', { direction: 'sendrecv' }); } catch (e) {}
    }

    // Send ICE candidates
    pc.onicecandidate = (e) => {
      if (e.candidate && state.socket) {
        state.socket.emit('webrtc-ice', { targetId, candidate: e.candidate });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE state with ${targetId}:`, pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        updateParticipantTileState(targetId);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state with ${targetId}:`, pc.connectionState);
      if (pc.connectionState === 'connected') {
        updateParticipantTileState(targetId);
      }
    };

    // Remote Track Arrival (Fixes Remote Video Stream and Black Screen)
    pc.ontrack = (e) => {
      console.log(`[WebRTC] Received ${e.track.kind} track from ${targetId}`);
      if (e.track.kind === 'audio') {
        let a = document.getElementById(`remote-audio-${targetId}`);
        if (!a) {
          a = document.createElement('audio');
          a.id = `remote-audio-${targetId}`;
          a.autoplay = true;
          a.playsInline = true;
          a.setAttribute('playsinline', '');
          document.body.appendChild(a);
        }
        a.srcObject = (e.streams && e.streams[0]) ? e.streams[0] : new MediaStream([e.track]);
        a.play().catch(() => {
          el.unmuteMovieBanner?.classList.remove('hidden');
        });
      } else if (e.track.kind === 'video') {
        const stream = (e.streams && e.streams[0]) ? e.streams[0] : new MediaStream([e.track]);
        state.remoteStreams.set(targetId, stream);
        attachRemoteVideo(targetId, stream);

        e.track.onunmute = () => {
          console.log(`[WebRTC] Video unmuted from ${targetId}`);
          attachRemoteVideo(targetId, stream);
        };
        e.track.onended = () => {
          console.log(`[WebRTC] Video ended from ${targetId}`);
          detachRemoteVideo(targetId);
        };
      }
    };

    return pc;
  }

  async function initiateCall(targetId) {
    const pc = getOrCreatePeerConnection(targetId);
    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await pc.setLocalDescription(offer);
      state.socket.emit('webrtc-offer', { targetId, offer });
    } catch (err) {
      console.error('[WebRTC] Call error:', err);
    }
  }

  function closePeerConnection(targetId) {
    if (state.peerConnections.has(targetId)) {
      state.peerConnections.get(targetId).close();
      state.peerConnections.delete(targetId);
    }
    state.remoteStreams.delete(targetId);
    state.pendingIceCandidates.delete(targetId);
    const a = document.getElementById(`remote-audio-${targetId}`);
    if (a) a.remove();
  }

  // Toggle Camera
  async function toggleCamera() {
    if (!isSecureConnection()) {
      showToast('Camera requires HTTPS (Port 3443)', 'error');
      return;
    }

    state.isCamOn = !state.isCamOn;

    if (state.isCamOn) {
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 360 },
            facingMode: 'user'
          }
        });
        const videoTrack = videoStream.getVideoTracks()[0];
        state.localVideoTrack = videoTrack;

        if (!state.localStream) {
          state.localStream = videoStream;
        } else {
          state.localStream.addTrack(videoTrack);
        }

        // Show local camera in self participant card
        const selfVideo = document.getElementById(`participant-video-${state.selfId}`);
        const selfAvatar = document.getElementById(`participant-avatar-${state.selfId}`);
        if (selfVideo) {
          selfVideo.muted = true;
          selfVideo.defaultMuted = true;
          selfVideo.playsInline = true;
          selfVideo.setAttribute('muted', '');
          selfVideo.setAttribute('playsinline', '');
          selfVideo.setAttribute('webkit-playsinline', '');
          selfVideo.setAttribute('autoplay', '');
          selfVideo.srcObject = new MediaStream([videoTrack]);
          selfVideo.classList.remove('hidden');
          if (selfAvatar) selfAvatar.classList.add('hidden');
          selfVideo.play().catch(() => {});
        }

        // Transmit video track to each connected peer AND send renegotiation offer
        for (const [targetId, pc] of state.peerConnections.entries()) {
          try {
            const transceivers = pc.getTransceivers ? pc.getTransceivers() : [];
            let videoTransceiver = transceivers.find(t => (t.receiver?.track?.kind === 'video') || (t.sender?.track?.kind === 'video'));

            if (videoTransceiver && videoTransceiver.sender) {
              await videoTransceiver.sender.replaceTrack(videoTrack);
              videoTransceiver.direction = 'sendrecv';
            } else {
              const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
              if (videoSender) {
                await videoSender.replaceTrack(videoTrack);
              } else {
                pc.addTrack(videoTrack, new MediaStream([videoTrack]));
              }
            }

            // Always renegotiate offer so remote peer sets up video decoder
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            state.socket.emit('webrtc-offer', { targetId, offer });
          } catch (e) {
            console.warn('[WebRTC] Error updating video track with ' + targetId, e);
          }
        }

        el.toggleCameraBtn.classList.remove('pill-btn-off');
        el.camOnIcon.classList.remove('hidden');
        el.camOffIcon.classList.add('hidden');
      } catch (err) {
        console.error('Camera access failed:', err);
        showToast('Camera access denied or busy', 'error');
        state.isCamOn = false;
        return;
      }
    } else {
      // Turn Camera Off
      if (state.localVideoTrack) {
        state.localVideoTrack.stop();
        if (state.localStream) {
          state.localStream.removeTrack(state.localVideoTrack);
        }
        state.localVideoTrack = null;
      }

      for (const [targetId, pc] of state.peerConnections.entries()) {
        try {
          const transceivers = pc.getTransceivers ? pc.getTransceivers() : [];
          let videoTransceiver = transceivers.find(t => (t.receiver?.track?.kind === 'video') || (t.sender?.track?.kind === 'video'));
          if (videoTransceiver && videoTransceiver.sender) {
            await videoTransceiver.sender.replaceTrack(null);
          } else {
            const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
            if (videoSender) {
              await videoSender.replaceTrack(null);
            }
          }
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          state.socket.emit('webrtc-offer', { targetId, offer });
        } catch (e) {}
      }

      const selfVideo = document.getElementById(`participant-video-${state.selfId}`);
      const selfAvatar = document.getElementById(`participant-avatar-${state.selfId}`);
      if (selfVideo) {
        selfVideo.classList.add('hidden');
        selfVideo.srcObject = null;
      }
      if (selfAvatar) selfAvatar.classList.remove('hidden');

      el.toggleCameraBtn.classList.add('pill-btn-off');
      el.camOnIcon.classList.add('hidden');
      el.camOffIcon.classList.remove('hidden');
    }

    if (state.socket) {
      state.socket.emit('update-cam-status', { roomId: state.roomId, isCamOn: state.isCamOn });
    }
  }

  // Toggle Microphone
  function toggleMicrophone() {
    state.isMicMuted = !state.isMicMuted;

    if (state.localAudioTrack) {
      state.localAudioTrack.enabled = !state.isMicMuted;
    } else if (state.localStream) {
      state.localStream.getAudioTracks().forEach(t => {
        t.enabled = !state.isMicMuted;
      });
    }

    if (state.isMicMuted) {
      el.toggleMicBtn.classList.add('pill-btn-muted');
      el.micOnIcon.classList.add('hidden');
      el.micOffIcon.classList.remove('hidden');
      setLocalSpeaking(false);
    } else {
      el.toggleMicBtn.classList.remove('pill-btn-muted');
      el.micOnIcon.classList.remove('hidden');
      el.micOffIcon.classList.add('hidden');
    }

    // Update self tile badge
    const selfMic = document.getElementById(`tile-mic-${state.selfId}`);
    if (selfMic) {
      selfMic.classList.toggle('muted', state.isMicMuted);
    }

    // Also update stage mic icon if self
    if (el.stageMicIcon) {
      el.stageMicIcon.classList.toggle('muted', state.isMicMuted);
    }

    if (state.socket) {
      state.socket.emit('update-mic-status', { roomId: state.roomId, isMuted: state.isMicMuted });
    }
  }

  // ==========================================================================
  // PARTICIPANT TILE RENDERING (Image 1 Centered beneath stage)
  // ==========================================================================

  function renderParticipantStrip() {
    el.participantStrip.innerHTML = '';

    state.members.forEach(member => {
      const tile = createParticipantTile(member);
      el.participantStrip.appendChild(tile);
    });
  }

  function createParticipantTile(member) {
    const isSelf = (member.id === state.selfId);
    const tile = document.createElement('div');
    tile.className = 'participant-tile';
    tile.id = `participant-tile-${member.id}`;

    // Top chevron + users pill (Image 1: chevron + group)
    const topPill = document.createElement('div');
    topPill.className = 'tile-top-pill';
    topPill.innerHTML = `
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
      </svg>
    `;

    // Center Avatar
    const avatar = document.createElement('div');
    avatar.className = 'tile-avatar-center';
    avatar.id = `participant-avatar-${member.id}`;
    avatar.style.backgroundColor = member.color || '#5865F2';
    avatar.innerText = (member.username || 'U').charAt(0).toUpperCase();

    // Webcam Video Element
    const video = document.createElement('video');
    video.className = 'tile-video hidden';
    video.id = `participant-video-${member.id}`;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.defaultMuted = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('autoplay', '');

    // Bottom name tag with mic icon (Image 1)
    const bottomBadge = document.createElement('div');
    bottomBadge.className = 'tile-bottom-badge';

    const micIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    micIcon.setAttribute('class', `tile-mic-icon ${member.isMuted ? 'muted' : 'active'}`);
    micIcon.setAttribute('id', `tile-mic-${member.id}`);
    micIcon.setAttribute('width', '12');
    micIcon.setAttribute('height', '12');
    micIcon.setAttribute('viewBox', '0 0 24 24');
    micIcon.setAttribute('fill', 'currentColor');
    micIcon.innerHTML = `<path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.12L12 8.14V5a3 3 0 0 1 3 3v3.12zM4.41 2.86L3 4.27l6 6V11a3 3 0 0 0 3 3c.39 0 .76-.08 1.1-.21l2.45 2.45C14.39 16.73 13.24 17 12 17c-3.87 0-7-3.13-7-7H3a9 9 0 0 0 8 8.94V21h2v-2.06c1.38-.17 2.66-.67 3.75-1.42l2.84 2.84 1.41-1.41L4.41 2.86z"/>`;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'tile-username';
    nameSpan.innerText = member.username;

    bottomBadge.appendChild(micIcon);
    bottomBadge.appendChild(nameSpan);

    tile.appendChild(topPill);
    tile.appendChild(avatar);
    tile.appendChild(video);
    tile.appendChild(bottomBadge);

    // Reattach active video feed (local or remote)
    if (isSelf && state.localVideoTrack && state.isCamOn) {
      video.srcObject = new MediaStream([state.localVideoTrack]);
      video.classList.remove('hidden');
      avatar.classList.add('hidden');
      video.play().catch(() => {});
    } else if (!isSelf) {
      const stream = getRemoteVideoStream(member.id);
      if (stream && (member.isCamOn || stream.getVideoTracks().some(t => t.readyState === 'live'))) {
        attachRemoteVideo(member.id, stream);
      }
    }

    return tile;
  }

  function updateParticipantTileState(id) {
    const member = state.members.get(id);
    if (!member) return;

    const mic = document.getElementById(`tile-mic-${id}`);
    if (mic) {
      mic.classList.toggle('muted', member.isMuted);
    }

    if (id === state.selfId) {
      const selfVideo = document.getElementById(`participant-video-${id}`);
      const selfAvatar = document.getElementById(`participant-avatar-${id}`);
      if (selfVideo && selfAvatar) {
        if (state.isCamOn && state.localVideoTrack) {
          selfVideo.muted = true;
          selfVideo.defaultMuted = true;
          selfVideo.playsInline = true;
          selfVideo.setAttribute('muted', '');
          selfVideo.setAttribute('playsinline', '');
          selfVideo.setAttribute('webkit-playsinline', '');
          selfVideo.setAttribute('autoplay', '');
          if (!selfVideo.srcObject || selfVideo.srcObject.getVideoTracks()[0] !== state.localVideoTrack) {
            selfVideo.srcObject = new MediaStream([state.localVideoTrack]);
          }
          selfVideo.classList.remove('hidden');
          selfAvatar.classList.add('hidden');
          selfVideo.play().catch(() => {});
        } else {
          selfVideo.classList.add('hidden');
          selfAvatar.classList.remove('hidden');
          selfVideo.srcObject = null;
        }
      }
    } else {
      const stream = getRemoteVideoStream(id);
      if (stream && (member.isCamOn || stream.getVideoTracks().some(t => t.readyState === 'live'))) {
        attachRemoteVideo(id, stream);
      } else if (!member.isCamOn) {
        detachRemoteVideo(id);
      }
    }
  }

  function updateHostStatusUI() {
    const hostMember = Array.from(state.members.values()).find(m => m.isHost);
    el.hostNameDisplay.innerText = hostMember
      ? (hostMember.id === state.selfId ? 'You (Host)' : hostMember.username)
      : 'Host';

    document.querySelectorAll('.host-only-control, .host-only-btn').forEach(btn => {
      btn.classList.toggle('hidden', !state.isHost);
    });
  }

  // ==========================================================================
  // SYNCHRONIZED MOVIE THEATER & TIMELINE ENGINE
  // ==========================================================================

  function isLiveMode(movieFilename, audioTrack) {
    if (!movieFilename) return false;
    const dotIdx = movieFilename.lastIndexOf('.');
    const ext = dotIdx !== -1 ? movieFilename.substring(dotIdx).toLowerCase() : '';
    if ((ext === '.mp4' || ext === '.webm') && (audioTrack === 0 || audioTrack === '0')) {
      return false;
    }
    return true; // MKV, MOV, AVI, or any non-default audio track (>0)
  }

  function getEffectiveDuration() {
    if (state.movieDuration && isFinite(state.movieDuration) && state.movieDuration > 0) {
      return state.movieDuration;
    }
    if (el.moviePlayer.duration && isFinite(el.moviePlayer.duration) && el.moviePlayer.duration > 0) {
      return el.moviePlayer.duration;
    }
    return 0;
  }

  function getEffectiveCurrentTime() {
    const rawCur = el.moviePlayer.currentTime || 0;
    if (state.isLiveStream) {
      return (state.streamStartTime || 0) + rawCur;
    }
    return rawCur;
  }

  function seekMovie(seekTime, shouldPlay = null) {
    state.lastSyncSeekTime = Date.now();
    const dur = getEffectiveDuration();
    const clampedTime = dur > 0 ? Math.max(0, Math.min(dur, seekTime)) : Math.max(0, seekTime);
    const wasPlaying = shouldPlay !== null ? shouldPlay : !el.moviePlayer.paused;

    if (state.isLiveStream) {
      state.streamStartTime = clampedTime;
      const streamUrl = `/api/stream?file=${encodeURIComponent(state.currentMovie.filename)}&audio=${state.selectedAudio}&start=${clampedTime}&t=${Date.now()}`;
      el.moviePlayer.setAttribute('data-stream-src', streamUrl);
      el.moviePlayer.src = streamUrl;
      if (wasPlaying) {
        el.moviePlayer.play().catch(() => {});
      } else {
        el.moviePlayer.pause();
      }
    } else {
      el.moviePlayer.currentTime = clampedTime;
      if (wasPlaying && el.moviePlayer.paused) {
        el.moviePlayer.play().catch(() => {});
      } else if (!wasPlaying && !el.moviePlayer.paused) {
        el.moviePlayer.pause();
      }
    }

    const pct = dur > 0 ? Math.min(100, Math.max(0, (clampedTime / dur) * 100)) : 0;
    el.timelineProgress.style.width = `${pct}%`;
    el.timelineThumb.style.left = `${pct}%`;
    el.currentTimeDisplay.innerText = formatTime(clampedTime);
  }

  async function loadMovieInTheater(movie, audioTrack = 0, subtitleTrack = 'off', startTime = 0, autoPlay = false) {
    state.currentMovie = movie;
    state.selectedAudio = audioTrack;
    state.selectedSubtitle = subtitleTrack;
    state.streamStartTime = startTime || 0;

    el.stagePlaceholder.classList.add('hidden');

    try {
      const probeRes = await fetch(`/api/probe?file=${encodeURIComponent(movie.filename)}`);
      const probeData = await probeRes.json();
      state.audioTracks = probeData.audioTracks || [];
      state.subtitleTracks = probeData.subtitleTracks || [];
      state.movieDuration = (probeData && probeData.duration) ? Number(probeData.duration) : 0;
      state.isLiveStream = isLiveMode(movie.filename, audioTrack);

      if (state.movieDuration > 0) {
        el.durationDisplay.innerText = probeData.durationFormatted || formatTime(state.movieDuration);
      }
      populateTrackSelects();
    } catch (e) {
      state.isLiveStream = isLiveMode(movie.filename, audioTrack);
    }

    applyTrackChanges(audioTrack, subtitleTrack, startTime, autoPlay);
  }

  function applyTrackChanges(audioTrack, subtitleTrack, seekTime = 0, autoPlay = null) {
    state.selectedAudio = audioTrack;
    state.selectedSubtitle = subtitleTrack;

    if (el.audioTrackSelect) el.audioTrackSelect.value = audioTrack;
    if (el.subtitleTrackSelect) el.subtitleTrackSelect.value = subtitleTrack;

    if (!state.currentMovie) return;

    state.isLiveStream = isLiveMode(state.currentMovie.filename, audioTrack);

    const wasPlaying = autoPlay !== null ? autoPlay : !el.moviePlayer.paused;
    const currentEffective = seekTime > 0 ? seekTime : getEffectiveCurrentTime();

    // Check if video stream needs reloading (audio track changed or new movie)
    const currentStreamFile = el.moviePlayer.getAttribute('data-stream-file');
    const currentStreamAudio = el.moviePlayer.getAttribute('data-stream-audio');
    const needsStreamReload = (currentStreamFile !== state.currentMovie.filename) || (currentStreamAudio !== String(audioTrack));

    if (needsStreamReload) {
      let streamUrl;
      if (state.isLiveStream) {
        state.streamStartTime = currentEffective;
        streamUrl = `/api/stream?file=${encodeURIComponent(state.currentMovie.filename)}&audio=${audioTrack}&start=${currentEffective}&t=${Date.now()}`;
      } else {
        state.streamStartTime = 0;
        streamUrl = `/api/stream?file=${encodeURIComponent(state.currentMovie.filename)}&audio=${audioTrack}`;
      }

      el.moviePlayer.setAttribute('data-stream-file', state.currentMovie.filename);
      el.moviePlayer.setAttribute('data-stream-audio', String(audioTrack));
      el.moviePlayer.setAttribute('data-stream-src', streamUrl);
      el.moviePlayer.src = streamUrl;

      const onMetadata = () => {
        const dur = getEffectiveDuration();
        if (dur > 0) {
          el.durationDisplay.innerText = formatTime(dur);
        }
        if (!state.isLiveStream && currentEffective > 0) {
          el.moviePlayer.currentTime = currentEffective;
          state.lastSyncSeekTime = Date.now();
        }
        if (wasPlaying) {
          el.moviePlayer.play().catch(() => {
            el.unmuteMovieBanner.classList.remove('hidden');
          });
        } else {
          el.moviePlayer.pause();
        }
        el.moviePlayer.removeEventListener('loadedmetadata', onMetadata);
      };

      if (el.moviePlayer.readyState >= 1) {
        onMetadata();
      } else {
        el.moviePlayer.addEventListener('loadedmetadata', onMetadata);
      }
    } else {
      if (!state.isLiveStream && currentEffective > 0 && Math.abs(el.moviePlayer.currentTime - currentEffective) > 1.5) {
        el.moviePlayer.currentTime = currentEffective;
        state.lastSyncSeekTime = Date.now();
      }
      if (wasPlaying && el.moviePlayer.paused) {
        el.moviePlayer.play().catch(() => {
          el.unmuteMovieBanner.classList.remove('hidden');
        });
      }
    }

    // Dynamic Subtitles update
    while (el.moviePlayer.firstChild) {
      el.moviePlayer.removeChild(el.moviePlayer.firstChild);
    }

    if (subtitleTrack !== 'off' && subtitleTrack !== null && subtitleTrack !== undefined) {
      const trackEl = document.createElement('track');
      trackEl.kind = 'subtitles';
      const subObj = state.subtitleTracks.find(s => s.subtitleIndex === subtitleTrack);
      trackEl.label = subObj ? subObj.label : `Track ${parseInt(subtitleTrack, 10) + 1}`;
      trackEl.srclang = 'en';
      trackEl.default = true;
      trackEl.src = `/api/subtitles?file=${encodeURIComponent(state.currentMovie.filename)}&track=${subtitleTrack}`;
      el.moviePlayer.appendChild(trackEl);
    }
  }

  function populateTrackSelects() {
    el.audioTrackSelect.innerHTML = '';
    if (state.audioTracks.length === 0) {
      el.audioTrackSelect.innerHTML = '<option value="0">Default</option>';
    } else {
      state.audioTracks.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.trackIndex;
        opt.innerText = t.label;
        if (t.trackIndex === state.selectedAudio) opt.selected = true;
        el.audioTrackSelect.appendChild(opt);
      });
    }

    el.subtitleTrackSelect.innerHTML = '<option value="off">Off</option>';
    state.subtitleTracks.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.subtitleIndex;
      opt.innerText = s.label;
      if (s.subtitleIndex === state.selectedSubtitle) opt.selected = true;
      el.subtitleTrackSelect.appendChild(opt);
    });
  }

  function handlePlayPauseToggle() {
    if (!state.currentMovie) {
      if (state.isHost) openMovieModal();
      return;
    }

    if (!state.isHost) {
      if (el.moviePlayer.paused) {
        el.moviePlayer.play().then(() => {
          el.unmuteMovieBanner.classList.add('hidden');
          showToast('Resynced with Host');
        }).catch(() => {});
        if (state.socket) {
          state.socket.emit('request-room-sync', { roomId: state.roomId });
        }
      } else {
        showToast('Controlled by Host');
      }
      return;
    }

    const curTime = getEffectiveCurrentTime();
    if (el.moviePlayer.paused) {
      el.moviePlayer.play().then(() => {
        updatePlayPauseIcons(true);
        if (state.socket) {
          state.socket.emit('host-play', { roomId: state.roomId, time: curTime });
        }
      }).catch(() => {});
    } else {
      el.moviePlayer.pause();
      updatePlayPauseIcons(false);
      if (state.socket) {
        state.socket.emit('host-pause', { roomId: state.roomId, time: curTime });
      }
    }
  }

  function updatePlayPauseIcons(isPlaying) {
    if (isPlaying) {
      el.playIcon.classList.add('hidden');
      el.pauseIcon.classList.remove('hidden');
    } else {
      el.playIcon.classList.remove('hidden');
      el.pauseIcon.classList.add('hidden');
    }
  }

  function formatTime(sec) {
    if (!sec || isNaN(sec) || !isFinite(sec) || sec < 0) return '00:00';
    const s = Math.floor(sec);
    const m = Math.floor(s / 60);
    const r = s % 60;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    if (h > 0) return `${h}:${rm < 10 ? '0' : ''}${rm}:${r < 10 ? '0' : ''}${r}`;
    return `${rm}:${r < 10 ? '0' : ''}${r}`;
  }

  function setupPlayerEvents() {
    const player = el.moviePlayer;

    player.addEventListener('timeupdate', () => {
      if (state.isDraggingTimeline) return;
      const cur = getEffectiveCurrentTime();
      const dur = getEffectiveDuration();
      const pct = dur > 0 ? Math.min(100, Math.max(0, (cur / dur) * 100)) : 0;
      el.timelineProgress.style.width = `${pct}%`;
      el.timelineThumb.style.left = `${pct}%`;
      el.currentTimeDisplay.innerText = formatTime(cur);
      if (dur > 0) {
        el.durationDisplay.innerText = formatTime(dur);
      }
    });

    player.addEventListener('loadedmetadata', () => {
      const dur = getEffectiveDuration();
      if (dur > 0) {
        el.durationDisplay.innerText = formatTime(dur);
      }
    });

    player.addEventListener('progress', () => {
      if (player.buffered.length > 0) {
        const dur = getEffectiveDuration();
        if (dur > 0) {
          const end = player.buffered.end(player.buffered.length - 1);
          const effectiveEnd = state.isLiveStream ? (state.streamStartTime || 0) + end : end;
          const pct = Math.min(100, Math.max(0, (effectiveEnd / dur) * 100));
          el.timelineBuffered.style.width = `${pct}%`;
        }
      }
    });

    const handleScrub = (clientX) => {
      if (!state.isHost) {
        showToast('Only Host can seek');
        return;
      }
      const rect = el.timelineContainer.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const dur = getEffectiveDuration();
      if (dur > 0) {
        const seekTime = pos * dur;
        seekMovie(seekTime);
        state.socket.emit('host-seek', { roomId: state.roomId, time: seekTime });
      }
    };

    el.timelineContainer.addEventListener('click', (e) => handleScrub(e.clientX));

    // Timeline hover time preview tooltip across the full timestamp bar
    el.timelineContainer.addEventListener('mousemove', (e) => {
      const rect = el.timelineContainer.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const dur = getEffectiveDuration();
      if (dur > 0 && el.timelineHoverTime) {
        const hoverSec = pos * dur;
        el.timelineHoverTime.style.display = 'block';
        el.timelineHoverTime.style.left = `${pos * 100}%`;
        el.timelineHoverTime.innerText = formatTime(hoverSec);
      }
    });

    el.timelineContainer.addEventListener('mouseleave', () => {
      if (el.timelineHoverTime) {
        el.timelineHoverTime.style.display = 'none';
      }
    });

    let isScrubbing = false;
    el.timelineContainer.addEventListener('touchstart', (e) => {
      isScrubbing = true;
      if (e.touches.length > 0) handleScrub(e.touches[0].clientX);
    }, { passive: true });

    el.timelineContainer.addEventListener('touchmove', (e) => {
      if (isScrubbing && e.touches.length > 0) handleScrub(e.touches[0].clientX);
    }, { passive: true });

    el.timelineContainer.addEventListener('touchend', () => isScrubbing = false);

    // Host heartbeat
    setInterval(() => {
      if (state.isHost && state.socket && state.currentMovie) {
        state.socket.emit('host-heartbeat', {
          roomId: state.roomId,
          time: getEffectiveCurrentTime(),
          isPlaying: !el.moviePlayer.paused
        });
      }
    }, 2500);

    // Auto-Resync triggers for disrupted members (screen lock, background tab, network hiccups)
    const requestSync = () => {
      if (state.roomId && state.socket && !state.isHost) {
        state.socket.emit('request-room-sync', { roomId: state.roomId });
      }
    };

    // When tab/app becomes visible again after being minimized or backgrounded
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !state.isHost) {
        requestSync();
      }
    });

    // When device reconnects to Wi-Fi/cellular
    window.addEventListener('online', () => {
      requestSync();
    });

    // When playback stalls or buffers
    let stallResyncTimer = null;
    player.addEventListener('waiting', () => {
      if (state.isHost) return;
      clearTimeout(stallResyncTimer);
      stallResyncTimer = setTimeout(() => {
        if (player.readyState < 3) {
          requestSync();
        }
      }, 3500);
    });

    player.addEventListener('playing', () => {
      clearTimeout(stallResyncTimer);
    });
  }

  // ==========================================================================
  // DISCORD CHAT PANEL (Matching Image 3)
  // ==========================================================================

  function toggleChat() {
    state.chatOpen = !state.chatOpen;
    el.chatSidebar.classList.toggle('hidden', !state.chatOpen);

    if (state.chatOpen) {
      state.unreadMessages = 0;
      el.chatBadge.classList.add('hidden');
      el.chatInput.focus();
    }
  }

  function sendChatMessage(e) {
    if (e) e.preventDefault();
    const text = el.chatInput.value.trim();
    if (!text || !state.socket) return;

    state.socket.emit('send-chat', { roomId: state.roomId, text });

    el.chatInput.value = '';
    el.chatInput.focus();
  }

  function appendChatMessage(msg) {
    // Hide welcome hero on first message
    if (el.chatWelcomeHero) {
      el.chatWelcomeHero.style.display = 'none';
    }

    const item = document.createElement('div');
    item.className = 'chat-msg';

    item.innerHTML = `
      <div class="chat-msg-avatar" style="background-color: ${msg.color || '#5865F2'}">
        ${escapeHtml((msg.username || 'U').charAt(0).toUpperCase())}
      </div>
      <div class="chat-msg-content">
        <div class="chat-msg-header">
          <span class="chat-msg-user" style="color: ${msg.color || '#5865F2'}">${escapeHtml(msg.username)}</span>
          <span class="chat-msg-time">${msg.timestamp}</span>
        </div>
        <div class="chat-msg-text">${escapeHtml(msg.text)}</div>
      </div>
    `;

    el.chatMessages.appendChild(item);
    el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.innerText = str;
    return div.innerHTML;
  }

  // ==========================================================================
  // EMOJI PICKER & LIVE REACTIONS ENGINE
  // ==========================================================================

  const EMOJI_CATEGORIES = {
    cinema: {
      title: 'Cinema & Vibes',
      items: [
        { e: '🍿', tags: 'popcorn movie cinema snack' },
        { e: '🎬', tags: 'clapper cinema movie action' },
        { e: '🎥', tags: 'movie camera film recording' },
        { e: '🎞️', tags: 'film frames movie projector' },
        { e: '🎟️', tags: 'admission ticket cinema pass' },
        { e: '📽️', tags: 'film projector theater' },
        { e: '📺', tags: 'television tv screen' },
        { e: '🍕', tags: 'pizza slice food snack cheese' },
        { e: '🍔', tags: 'hamburger burger fastfood' },
        { e: '🍟', tags: 'fries french fries snack' },
        { e: '🌭', tags: 'hotdog sausage snack' },
        { e: '🥤', tags: 'soda cup drink beverage cola' },
        { e: '🍻', tags: 'beer mugs cheers party drinks' },
        { e: '🥂', tags: 'champagne glasses toast cheers' },
        { e: '🍫', tags: 'chocolate bar candy sweet' },
        { e: '🛋️', tags: 'couch sofa relax watching' },
        { e: '🎭', tags: 'theater masks drama arts' },
        { e: '🎧', tags: 'headphones audio sound music' },
        { e: '🔊', tags: 'speaker loud volume audio' },
        { e: '🕶️', tags: 'sunglasses cool shades 3d' },
        { e: '🍪', tags: 'cookie sweet snack biscuit' }
      ]
    },
    popular: {
      title: 'Popular Reactions',
      items: [
        { e: '😂', tags: 'laughing lol tears haha funny' },
        { e: '🤣', tags: 'rofl rolling on floor laugh' },
        { e: '😭', tags: 'crying tears sad sob' },
        { e: '💀', tags: 'skull dead lol dying' },
        { e: '🥹', tags: 'emotional holding back tears touched' },
        { e: '🥺', tags: 'pleading eyes cute please puppy' },
        { e: '🤩', tags: 'starstruck amazed excited wow' },
        { e: '😎', tags: 'cool sunglasses chill boss' },
        { e: '🥳', tags: 'party face celebrating woo' },
        { e: '🤯', tags: 'exploding head mind blown shock' },
        { e: '🫠', tags: 'melting face warm awkward' },
        { e: '🤠', tags: 'cowboy hat smiley' },
        { e: '😈', tags: 'smiling devil cheeky mischievous' },
        { e: '😇', tags: 'angel innocent halo' },
        { e: '😜', tags: 'winking eye tongue out goofy' },
        { e: '🤤', tags: 'drooling hungry delicious yummy' },
        { e: '😱', tags: 'screaming scared shocked fear' },
        { e: '🥱', tags: 'yawning tired sleepy bored' },
        { e: '😴', tags: 'sleeping face zzz bed' },
        { e: '🥶', tags: 'cold freezing chilled icy' },
        { e: '🥵', tags: 'hot sweating overwhelmed' }
      ]
    },
    hype: {
      title: 'Hype & Love',
      items: [
        { e: '🔥', tags: 'fire flame lit hot hype' },
        { e: '⚡', tags: 'lightning bolt zap energy speed' },
        { e: '💯', tags: 'hundred 100 points perfect score' },
        { e: '🚀', tags: 'rocket ship blastoff launch moon hype' },
        { e: '✨', tags: 'sparkles sparkle stars magic' },
        { e: '💥', tags: 'boom collision explosion bang' },
        { e: '🎉', tags: 'tada party popper celebration' },
        { e: '🎊', tags: 'confetti ball festival party' },
        { e: '🏆', tags: 'trophy prize winner champion' },
        { e: '💖', tags: 'sparkling heart love romance' },
        { e: '❤️', tags: 'red heart love like romance' },
        { e: '🖤', tags: 'black heart dark aesthetic' },
        { e: '🤍', tags: 'white heart peace pure' },
        { e: '👑', tags: 'crown king queen royal goat' },
        { e: '🌟', tags: 'glowing star night shine' },
        { e: '💫', tags: 'dizzy star shooting magic' },
        { e: '🎯', tags: 'bullseye direct hit target' },
        { e: '💣', tags: 'bomb explosive lit boom' }
      ]
    },
    gestures: {
      title: 'Claps & Gestures',
      items: [
        { e: '👏', tags: 'clapping hands applause bravo' },
        { e: '🙌', tags: 'raising hands praise celebration' },
        { e: '👍', tags: 'thumbs up like yes agree good' },
        { e: '👎', tags: 'thumbs down dislike bad no' },
        { e: '👊', tags: 'fist bump bro punch' },
        { e: '✌️', tags: 'peace sign victory fingers' },
        { e: '🤞', tags: 'crossed fingers hope luck' },
        { e: '🫡', tags: 'saluting face respect yes sir' },
        { e: '🤝', tags: 'handshake deal agreement' },
        { e: '🫶', tags: 'heart hands love care' },
        { e: '🤙', tags: 'call me shaka hang loose' },
        { e: '👀', tags: 'eyes looking side-eye tea drama' },
        { e: '👁️', tags: 'single eye watch see' },
        { e: '🧠', tags: 'brain smart genius 200iq' },
        { e: '🦾', tags: 'mechanical robot arm flex strength' },
        { e: '🙏', tags: 'folded hands pray please thanks' }
      ]
    }
  };

  let activeEmojiCategory = 'cinema';

  function initEmojiPicker() {
    renderEmojiGrid();

    // Tab buttons click
    if (el.chatEmojiPicker) {
      el.chatEmojiPicker.querySelectorAll('.emoji-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          el.chatEmojiPicker.querySelectorAll('.emoji-tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          activeEmojiCategory = btn.dataset.category || 'cinema';
          if (el.emojiSearchInput) el.emojiSearchInput.value = '';
          renderEmojiGrid();
        });
      });
    }

    // Search input
    if (el.emojiSearchInput) {
      el.emojiSearchInput.addEventListener('input', () => {
        const query = el.emojiSearchInput.value.trim().toLowerCase();
        renderEmojiGrid(query);
      });
    }

    // Toggle emoji picker on button click
    if (el.chatEmojiBtn) {
      el.chatEmojiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleEmojiPicker();
      });
    }

    // Toggle reaction tray on button click
    if (el.chatReactionBtn) {
      el.chatReactionBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleReactionsTray();
      });
    }

    // Reaction items in tray
    if (el.chatReactionsTray) {
      el.chatReactionsTray.querySelectorAll('.reaction-item-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const emoji = btn.dataset.emoji || '❤️';
          sendLiveReaction(emoji);
        });
      });
    }

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (el.chatEmojiPicker && !el.chatEmojiPicker.contains(e.target) && e.target !== el.chatEmojiBtn && !el.chatEmojiBtn?.contains(e.target)) {
        closeEmojiPicker();
      }
      if (el.chatReactionsTray && !el.chatReactionsTray.contains(e.target) && e.target !== el.chatReactionBtn && !el.chatReactionBtn?.contains(e.target)) {
        closeReactionsTray();
      }
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeEmojiPicker();
        closeReactionsTray();
      }
    });
  }

  function renderEmojiGrid(searchQuery = '') {
    if (!el.emojiPickerGrid) return;
    el.emojiPickerGrid.innerHTML = '';

    if (searchQuery) {
      // Search all categories
      let matches = [];
      Object.keys(EMOJI_CATEGORIES).forEach(catKey => {
        const cat = EMOJI_CATEGORIES[catKey];
        cat.items.forEach(item => {
          if (item.tags.includes(searchQuery) || item.e.includes(searchQuery)) {
            matches.push(item);
          }
        });
      });

      if (matches.length === 0) {
        el.emojiPickerGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); font-size: 12px; padding: 24px 0;">No emojis found</div>';
        return;
      }

      matches.forEach(item => {
        const btn = createEmojiButton(item.e);
        el.emojiPickerGrid.appendChild(btn);
      });
    } else {
      // Render active category
      const cat = EMOJI_CATEGORIES[activeEmojiCategory] || EMOJI_CATEGORIES.cinema;
      cat.items.forEach(item => {
        const btn = createEmojiButton(item.e);
        el.emojiPickerGrid.appendChild(btn);
      });
    }
  }

  function createEmojiButton(emoji) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'emoji-item-btn';
    btn.innerText = emoji;
    btn.title = emoji;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      insertEmojiIntoChat(emoji);
    });
    return btn;
  }

  function insertEmojiIntoChat(emoji) {
    if (!el.chatInput) return;
    const input = el.chatInput;
    const start = input.selectionStart != null ? input.selectionStart : input.value.length;
    const end = input.selectionEnd != null ? input.selectionEnd : input.value.length;
    const val = input.value;
    input.value = val.substring(0, start) + emoji + val.substring(end);
    const newPos = start + emoji.length;
    input.selectionStart = input.selectionEnd = newPos;
    input.focus();
  }

  function toggleEmojiPicker() {
    if (!el.chatEmojiPicker) return;
    const isHidden = el.chatEmojiPicker.classList.contains('hidden');
    closeReactionsTray();
    if (isHidden) {
      el.chatEmojiPicker.classList.remove('hidden');
      el.chatEmojiBtn?.classList.add('active');
      if (el.emojiSearchInput) el.emojiSearchInput.focus();
    } else {
      closeEmojiPicker();
    }
  }

  function closeEmojiPicker() {
    if (el.chatEmojiPicker) el.chatEmojiPicker.classList.add('hidden');
    el.chatEmojiBtn?.classList.remove('active');
  }

  function toggleReactionsTray() {
    if (!el.chatReactionsTray) return;
    const isHidden = el.chatReactionsTray.classList.contains('hidden');
    closeEmojiPicker();
    if (isHidden) {
      el.chatReactionsTray.classList.remove('hidden');
      el.chatReactionBtn?.classList.add('active');
    } else {
      closeReactionsTray();
    }
  }

  function closeReactionsTray() {
    if (el.chatReactionsTray) el.chatReactionsTray.classList.add('hidden');
    el.chatReactionBtn?.classList.remove('active');
  }

  function sendLiveReaction(emoji) {
    if (!state.socket || !state.roomId) return;
    const username = state.username || 'Viewer';
    state.socket.emit('send-reaction', {
      roomId: state.roomId,
      emoji,
      username
    });
  }

  function spawnReactionBurst(emoji, username) {
    const containers = [el.reactionBurstContainer, el.chatReactionBurstContainer].filter(Boolean);
    if (!containers.length) return;

    containers.forEach((container, cIdx) => {
      // Spawn a cluster of 5 animated emojis
      const count = cIdx === 0 ? 5 : 3;
      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          const wrapper = document.createElement('div');
          wrapper.className = 'floating-reaction';

          const xMid = (Math.random() - 0.5) * 60;
          const xEnd = (Math.random() - 0.5) * 90;
          const rotMid = (Math.random() - 0.5) * 30;
          const rotEnd = (Math.random() - 0.5) * 50;

          wrapper.style.setProperty('--x-mid', `${xMid}px`);
          wrapper.style.setProperty('--x-end', `${xEnd}px`);
          wrapper.style.setProperty('--rot-mid', `${rotMid}deg`);
          wrapper.style.setProperty('--rot-end', `${rotEnd}deg`);

          let html = `<span class="floating-reaction-emoji">${emoji}</span>`;
          if (i === 0 && username && cIdx === 0) {
            html += `<span class="floating-reaction-user">${escapeHtml(username)}</span>`;
          }
          wrapper.innerHTML = html;

          container.appendChild(wrapper);

          setTimeout(() => {
            wrapper.remove();
          }, 2400);
        }, i * 90);
      }
    });
  }

  // ==========================================================================
  // MOVIE LIBRARY
  // ==========================================================================

  async function openMovieModal() {
    el.movieModal.classList.remove('hidden');
    loadMoviesList();
  }

  function closeMovieModal() {
    el.movieModal.classList.add('hidden');
  }

  async function loadMoviesList() {
    el.movieLibraryList.innerHTML = '<div class="loading-state">Scanning movies folder...</div>';

    try {
      const res = await fetch('/api/movies');
      const data = await res.json();

      if (!data.movies || data.movies.length === 0) {
        el.movieLibraryList.innerHTML = '<div class="loading-state">No movies found in movies/ folder. Drop files above to watch.</div>';
        return;
      }

      el.movieLibraryList.innerHTML = '';
      data.movies.forEach(m => {
        const row = document.createElement('div');
        row.className = 'movie-card-row';

        const extTag = (m.extension || '').replace('.', '').toUpperCase();
        row.innerHTML = `
          <div>
            <div class="movie-card-title">
              <span>${m.filename}</span>
              <span class="movie-card-badge badge-${extTag.toLowerCase()}">${extTag}</span>
            </div>
            <div class="movie-card-size">${m.size}</div>
          </div>
          <button class="btn btn-primary btn-sm play-btn">Play in Room</button>
        `;

        row.querySelector('.play-btn').onclick = () => {
          if (!state.isHost) {
            showToast('Only Host can start movies');
            return;
          }
          state.socket.emit('host-set-movie', {
            roomId: state.roomId,
            movie: m,
            audioTrack: 0,
            subtitleTrack: 'off'
          });
          closeMovieModal();
        };

        el.movieLibraryList.appendChild(row);
      });
    } catch (e) {
      el.movieLibraryList.innerHTML = `<div class="loading-state">Error: ${e.message}</div>`;
    }
  }

  function setupUploadDropzone() {
    const dropzone = el.uploadDropzone;
    const fileInput = el.movieFileInput;

    dropzone.onclick = () => fileInput.click();

    ['dragenter', 'dragover'].forEach(name => {
      dropzone.addEventListener(name, (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--blurple)';
      });
    });

    ['dragleave', 'drop'].forEach(name => {
      dropzone.addEventListener(name, (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'rgba(255, 255, 255, 0.15)';
      });
    });

    dropzone.addEventListener('drop', (e) => {
      if (e.dataTransfer.files.length > 0) uploadMovieFile(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) uploadMovieFile(fileInput.files[0]);
    });
  }

  function uploadMovieFile(file) {
    el.uploadProgress.classList.remove('hidden');
    el.uploadProgressFill.style.width = '0%';

    const formData = new FormData();
    formData.append('movie', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        el.uploadProgressFill.style.width = `${pct}%`;
      }
    };

    xhr.onload = () => {
      el.uploadProgress.classList.add('hidden');
      if (xhr.status === 200) {
        showToast(`Uploaded ${file.name}`, 'success');
        loadMoviesList();
      } else {
        showToast('Upload failed', 'error');
      }
    };

    xhr.send(formData);
  }

  // Device selectors
  async function enumerateMediaDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      el.micDeviceList.innerHTML = '';
      el.camDeviceList.innerHTML = '';

      devices.forEach(d => {
        if (d.kind === 'audioinput') {
          const item = document.createElement('div');
          item.className = 'device-opt';
          item.innerText = d.label || `Microphone ${el.micDeviceList.children.length + 1}`;
          item.onclick = async () => {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: d.deviceId } } });
            const track = stream.getAudioTracks()[0];
            if (state.localStream) {
              const old = state.localStream.getAudioTracks()[0];
              if (old) { state.localStream.removeTrack(old); old.stop(); }
              state.localStream.addTrack(track);
              for (const pc of state.peerConnections.values()) {
                const s = pc.getSenders().find(snd => snd.track && snd.track.kind === 'audio');
                if (s) s.replaceTrack(track);
              }
            }
            setupSpeakingDetector(state.localStream);
            el.micDeviceMenu.classList.add('hidden');
          };
          el.micDeviceList.appendChild(item);
        } else if (d.kind === 'videoinput') {
          const item = document.createElement('div');
          item.className = 'device-opt';
          item.innerText = d.label || `Camera ${el.camDeviceList.children.length + 1}`;
          item.onclick = () => {
            el.camDeviceMenu.classList.add('hidden');
          };
          el.camDeviceList.appendChild(item);
        }
      });
    } catch (e) {}
  }

  // ==========================================================================
  // EVENT LISTENERS
  // ==========================================================================

  function attachEventListeners() {
    // Volume Slider & Visual Initialization
    if (el.volumeSlider) {
      el.volumeSlider.value = 100;
      el.volumeSlider.style.setProperty('--vol-fill', '100%');
    }

    // Join & Create Room (Random Alphanumeric Room Codes)
    if (el.randomRoomBtn) {
      el.randomRoomBtn.onclick = () => {
        el.roomInput.value = generateRandomRoomCode();
      };
    }
    if (el.createRoomBtn) {
      el.createRoomBtn.onclick = () => {
        el.roomInput.value = generateRandomRoomCode();
        joinRoom();
      };
    }
    if (el.joinRoomBtn) el.joinRoomBtn.onclick = joinRoom;
    if (el.usernameInput) el.usernameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });
    if (el.roomInput) el.roomInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });

    // About Page Navigation
    const showAbout = () => {
      if (el.aboutPage) {
        el.aboutPage.classList.remove('hidden');
        el.aboutPage.scrollTop = 0;
      }
    };
    const hideAbout = () => {
      if (el.aboutPage) el.aboutPage.classList.add('hidden');
    };

    if (el.navAboutBtn) el.navAboutBtn.onclick = showAbout;
    if (el.footerAboutBtn) el.footerAboutBtn.onclick = showAbout;
    if (el.aboutBackBtn) el.aboutBackBtn.onclick = hideAbout;
    if (el.aboutLaunchBtn) {
      el.aboutLaunchBtn.onclick = (e) => {
        if (e) e.preventDefault();
        hideAbout();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (el.usernameInput) el.usernameInput.focus();
      };
    }

    // Feedback Modal
    const showFeedback = () => {
      if (el.feedbackModal) el.feedbackModal.classList.remove('hidden');
    };
    const hideFeedback = () => {
      if (el.feedbackModal) el.feedbackModal.classList.add('hidden');
    };

    if (el.navFeedbackBtn) el.navFeedbackBtn.onclick = showFeedback;
    if (el.footerFeedbackBtn) el.footerFeedbackBtn.onclick = showFeedback;
    if (el.closeFeedbackBtn) el.closeFeedbackBtn.onclick = hideFeedback;
    if (el.cancelFeedbackBtn) el.cancelFeedbackBtn.onclick = hideFeedback;

    if (el.feedbackForm) {
      el.feedbackForm.onsubmit = async (e) => {
        e.preventDefault();
        const categoryInput = document.querySelector('input[name="feedbackCategory"]:checked');
        const category = categoryInput ? categoryInput.value : 'general';
        const name = (document.getElementById('feedbackName')?.value || '').trim();
        const message = (document.getElementById('feedbackMessage')?.value || '').trim();

        if (!message) return;

        // 1. Direct Email link to Ayushman's Gmail: mitraayushman00@gmail.com
        const mailSubject = encodeURIComponent(`[Lumière Feedback - ${category.toUpperCase()}] from ${name || 'User'}`);
        const mailBody = encodeURIComponent(`Name: ${name || 'Anonymous'}\nCategory: ${category}\n\nFeedback:\n${message}\n\n-- Sent via Lumière`);
        const mailtoLink = `mailto:mitraayushman00@gmail.com?subject=${mailSubject}&body=${mailBody}`;

        try {
          window.open(mailtoLink, '_blank');
        } catch (err) {
          window.location.href = mailtoLink;
        }

        // 2. Also save to server backend
        try {
          await fetch('/api/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, message, category, recipient: 'mitraayushman00@gmail.com' })
          });
        } catch (err) {}

        showToast('Feedback delivered to mitraayushman00@gmail.com!');
        el.feedbackForm.reset();
        hideFeedback();
      };
    }

    // Support Modal & Copy UPI
    const showSupport = () => {
      if (el.supportModal) el.supportModal.classList.remove('hidden');
    };
    const hideSupport = () => {
      if (el.supportModal) el.supportModal.classList.add('hidden');
    };

    if (el.navSupportBtn) el.navSupportBtn.onclick = showSupport;
    if (el.footerSupportBtn) el.footerSupportBtn.onclick = showSupport;
    if (el.aboutSupportBtn) {
      el.aboutSupportBtn.onclick = (e) => {
        if (e) e.preventDefault();
        showSupport();
      };
    }
    if (el.closeSupportBtn) el.closeSupportBtn.onclick = hideSupport;

    if (el.copyUpiBtn) {
      el.copyUpiBtn.onclick = () => {
        const upiText = document.getElementById('upiValueText')?.innerText || 'ayushmanmitra@upi';
        navigator.clipboard?.writeText(upiText).then(() => {
          showToast('UPI ID copied to clipboard!');
          const copyLabel = document.getElementById('copyUpiText');
          if (copyLabel) {
            copyLabel.innerText = 'Copied!';
            setTimeout(() => { copyLabel.innerText = 'Copy'; }, 2000);
          }
        }).catch(() => prompt('UPI ID:', upiText));
      };
    }

    // Top Invite & Dock Invite
    const copyLink = () => {
      const url = `${window.location.origin}/#${state.roomId}`;
      navigator.clipboard?.writeText(url).then(() => {
        showToast('Invite link copied!');
      }).catch(() => prompt('Room Link:', url));
    };
    el.dockInviteBtn.onclick = copyLink;

    // Chat Toggles
    el.topChatBtn.onclick = toggleChat;
    el.closeChatBtn.onclick = toggleChat;
    el.chatForm.onsubmit = sendChatMessage;
    el.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendChatMessage(e);
      }
    });
    initEmojiPicker();

    // Mic & Camera
    el.toggleMicBtn.onclick = toggleMicrophone;
    el.toggleCameraBtn.onclick = toggleCamera;
    el.micDeviceDropdownBtn.onclick = (e) => {
      e.stopPropagation();
      el.micDeviceMenu.classList.toggle('hidden');
      el.camDeviceMenu.classList.add('hidden');
    };
    el.camDeviceDropdownBtn.onclick = (e) => {
      e.stopPropagation();
      el.camDeviceMenu.classList.toggle('hidden');
      el.micDeviceMenu.classList.add('hidden');
    };
    document.addEventListener('click', () => {
      el.micDeviceMenu.classList.add('hidden');
      el.camDeviceMenu.classList.add('hidden');
    });

    // Disconnect
    el.disconnectBtn.onclick = () => {
      if (confirm('Leave room?')) window.location.reload();
    };

    // Layout Toggle (Theater Stage vs Grid Gallery View)
    let isGridView = false;
    if (el.layoutToggleBtn) {
      el.layoutToggleBtn.onclick = () => {
        isGridView = !isGridView;
        el.mainWorkspace.classList.toggle('is-grid-view', isGridView);
        showToast(isGridView ? 'Switched to Grid Gallery View' : 'Switched to Cinema Stage View');
      };
    }

    // Fullscreen (Cinema Box ONLY - hides participant bar and docks)
    const toggleCinemaFullscreen = () => {
      const isFull = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
      if (!isFull) {
        const box = el.cinemaBox || document.documentElement;
        if (box.requestFullscreen) {
          box.requestFullscreen().catch(() => {});
        } else if (box.webkitRequestFullscreen) {
          box.webkitRequestFullscreen();
        } else if (box.msRequestFullscreen) {
          box.msRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
          document.msExitFullscreen();
        }
      }
    };

    if (el.theaterFullscreenBtn) el.theaterFullscreenBtn.onclick = toggleCinemaFullscreen;
    if (el.hudFullscreenBtn) el.hudFullscreenBtn.onclick = toggleCinemaFullscreen;

    document.addEventListener('fullscreenchange', () => {
      const isFull = !!(document.fullscreenElement || document.webkitFullscreenElement);
      if (el.hudFullscreenExpand && el.hudFullscreenCompress) {
        el.hudFullscreenExpand.classList.toggle('hidden', isFull);
        el.hudFullscreenCompress.classList.toggle('hidden', !isFull);
      }
    });

    // ==========================================================================
    // CINEMA VOLUME & MUTE CONTROLLER (Synchronized HUD & Top-Right Meter)
    // ==========================================================================
    let volumeMeterTimeout = null;
    let lastVolumePct = 100;

    function showCinemaVolumeMeter(pct, isMuted) {
      if (!el.cinemaVolumeMeter) return;
      if (isMuted || pct === 0) {
        el.meterVolHighIcon?.classList.add('hidden');
        el.meterVolMuteIcon?.classList.remove('hidden');
        if (el.meterValueText) el.meterValueText.innerText = 'Muted';
        if (el.meterBarFill) el.meterBarFill.style.width = '0%';
      } else {
        el.meterVolHighIcon?.classList.remove('hidden');
        el.meterVolMuteIcon?.classList.add('hidden');
        if (el.meterValueText) el.meterValueText.innerText = `${pct}%`;
        if (el.meterBarFill) el.meterBarFill.style.width = `${pct}%`;
      }

      el.cinemaVolumeMeter.classList.remove('hidden');
      el.cinemaVolumeMeter.classList.remove('fade-out');

      clearTimeout(volumeMeterTimeout);
      volumeMeterTimeout = setTimeout(() => {
        if (el.cinemaVolumeMeter) {
          el.cinemaVolumeMeter.classList.add('fade-out');
          setTimeout(() => {
            if (el.cinemaVolumeMeter && el.cinemaVolumeMeter.classList.contains('fade-out')) {
              el.cinemaVolumeMeter.classList.add('hidden');
              el.cinemaVolumeMeter.classList.remove('fade-out');
            }
          }, 250);
        }
      }, 1300);
    }

    function updateVolumeUI(pct, isMuted, showHUD = true) {
      const isEffectivelyMuted = isMuted || pct === 0;
      if (el.volumeSlider) {
        el.volumeSlider.style.setProperty('--vol-fill', (isEffectivelyMuted ? 0 : pct) + '%');
      }
      if (isEffectivelyMuted) {
        el.volHighIcon?.classList.add('hidden');
        el.volMuteIcon?.classList.remove('hidden');
      } else {
        el.volHighIcon?.classList.remove('hidden');
        el.volMuteIcon?.classList.add('hidden');
      }
      if (showHUD) {
        showCinemaVolumeMeter(pct, isEffectivelyMuted);
      }
    }

    function setVolume(pct, updateSlider = true, showHUD = true) {
      if (!el.moviePlayer) return;
      pct = Math.max(0, Math.min(100, Math.round(pct)));
      if (pct > 0) {
        lastVolumePct = pct;
        el.moviePlayer.muted = false;
        el.moviePlayer.volume = pct / 100;
      } else {
        el.moviePlayer.muted = true;
        el.moviePlayer.volume = 0;
      }

      if (updateSlider && el.volumeSlider) {
        el.volumeSlider.value = pct;
      }
      updateVolumeUI(pct, el.moviePlayer.muted, showHUD);
    }

    const toggleMute = () => {
      if (!el.moviePlayer) return;
      const isMuting = !el.moviePlayer.muted;
      el.moviePlayer.muted = isMuting;
      if (isMuting) {
        const cur = parseInt(el.volumeSlider?.value, 10);
        if (!isNaN(cur) && cur > 0) lastVolumePct = cur;
        if (el.volumeSlider) {
          el.volumeSlider.value = 0;
        }
        updateVolumeUI(0, true, true);
      } else {
        const restorePct = lastVolumePct > 0 ? lastVolumePct : 50;
        setVolume(restorePct, true, true);
      }
    };
    if (el.volumeToggleBtn) el.volumeToggleBtn.onclick = toggleMute;

    // Rewind / Forward 10 Seconds Helpers
    const rewind10Seconds = () => {
      if (!state.isHost) {
        showToast('Only Host can seek');
        return;
      }
      const cur = getEffectiveCurrentTime();
      const newTime = Math.max(0, cur - 10);
      seekMovie(newTime);
      if (state.socket) {
        state.socket.emit('host-seek', { roomId: state.roomId, time: newTime });
      }
      showToast('Rewound 10s');
    };

    const forward10Seconds = () => {
      if (!state.isHost) {
        showToast('Only Host can seek');
        return;
      }
      const cur = getEffectiveCurrentTime();
      const dur = getEffectiveDuration();
      const newTime = dur > 0 ? Math.min(dur, cur + 10) : cur + 10;
      seekMovie(newTime);
      if (state.socket) {
        state.socket.emit('host-seek', { roomId: state.roomId, time: newTime });
      }
      showToast('Forwarded 10s');
    };

    if (el.rewind10Btn) el.rewind10Btn.onclick = rewind10Seconds;
    if (el.forward10Btn) el.forward10Btn.onclick = forward10Seconds;

    // Keyboard Shortcuts (Space/K, F, M, J/Left, L/Right, Up/Down)
    window.addEventListener('keydown', (e) => {
      const activeEl = document.activeElement;
      if (activeEl && (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl.tagName) || activeEl.isContentEditable)) {
        return;
      }
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName) || e.target?.isContentEditable) {
        return;
      }
      if (!el.appContainer || el.appContainer.classList.contains('hidden')) {
        return;
      }
      if (el.movieModal && !el.movieModal.classList.contains('hidden')) {
        return;
      }

      const key = e.key;
      const code = e.code;

      if (code === 'Space' || key === ' ' || key === 'k' || key === 'K') {
        e.preventDefault();
        if (activeEl && activeEl.tagName === 'BUTTON') activeEl.blur();
        handlePlayPauseToggle();
      } else if (key === 'f' || key === 'F') {
        e.preventDefault();
        toggleCinemaFullscreen();
      } else if (key === 'm' || key === 'M') {
        e.preventDefault();
        toggleMute();
      } else if (key === 'j' || key === 'J' || key === 'ArrowLeft') {
        e.preventDefault();
        rewind10Seconds();
      } else if (key === 'l' || key === 'L' || key === 'ArrowRight') {
        e.preventDefault();
        forward10Seconds();
      } else if (key === 'ArrowUp') {
        e.preventDefault();
        if (el.moviePlayer) {
          let curPct = el.moviePlayer.muted ? 0 : Math.round(el.moviePlayer.volume * 100);
          if (el.moviePlayer.muted && lastVolumePct > 0) {
            curPct = lastVolumePct;
          }
          setVolume(Math.min(100, curPct + 5), true, true);
        }
      } else if (key === 'ArrowDown') {
        e.preventDefault();
        if (el.moviePlayer) {
          if (el.moviePlayer.muted) {
            showCinemaVolumeMeter(0, true);
          } else {
            let curPct = Math.round(el.moviePlayer.volume * 100);
            setVolume(Math.max(0, curPct - 5), true, true);
          }
        }
      }
    });

    // Unmute Banner & Audio/Video Unlock
    const unlockAudio = () => {
      if (state.audioContext && state.audioContext.state === 'suspended') {
        state.audioContext.resume().catch(() => {});
      }
      document.querySelectorAll('audio').forEach(a => a.play().catch(() => {}));
      document.querySelectorAll('.tile-video').forEach(v => {
        if (v.srcObject && v.paused) {
          v.play().catch(() => {});
        }
      });
      if (el.moviePlayer) {
        el.moviePlayer.muted = false;
        let curPct = parseInt(el.volumeSlider?.value, 10);
        if (isNaN(curPct) || curPct === 0) curPct = lastVolumePct || 100;
        setVolume(curPct, true, false);
        if (el.moviePlayer.paused && state.currentMovie) {
          el.moviePlayer.play().catch(() => {});
        }
      }
      el.unmuteMovieBanner.classList.add('hidden');
    };

    el.unmuteMovieBanner.onclick = unlockAudio;
    document.addEventListener('touchstart', unlockAudio, { once: true, passive: true });
    document.addEventListener('click', unlockAudio, { once: true });

    // Video Play/Pause & Movie Library
    el.playPauseBtn.onclick = handlePlayPauseToggle;
    el.moviePlayer.onclick = handlePlayPauseToggle;
    el.stagePlaceholder.onclick = () => { if (state.isHost) openMovieModal(); };
    el.openMovieLibraryBtn.onclick = openMovieModal;
    el.hostMovieLibraryDockBtn.onclick = openMovieModal;

    // Track selections
    el.audioTrackSelect.onchange = () => {
      if (!state.isHost) return;
      const curTime = getEffectiveCurrentTime();
      state.socket.emit('host-set-tracks', {
        roomId: state.roomId,
        audioTrack: parseInt(el.audioTrackSelect.value, 10),
        subtitleTrack: state.selectedSubtitle,
        currentTime: curTime
      });
    };

    el.subtitleTrackSelect.onchange = () => {
      if (!state.isHost) return;
      const sub = el.subtitleTrackSelect.value;
      const curTime = getEffectiveCurrentTime();
      state.socket.emit('host-set-tracks', {
        roomId: state.roomId,
        audioTrack: state.selectedAudio,
        subtitleTrack: sub === 'off' ? 'off' : parseInt(sub, 10),
        currentTime: curTime
      });
    };

    // Volume Slider Drag / Input
    if (el.volumeSlider) {
      el.volumeSlider.oninput = () => {
        const pct = parseInt(el.volumeSlider.value, 10);
        setVolume(pct, false, true);
      };
    }

    // Modal
    el.closeMovieModalBtn.onclick = closeMovieModal;
    el.refreshMoviesBtn.onclick = loadMoviesList;

    setupUploadDropzone();
    setupPlayerEvents();
  }

  window.addEventListener('DOMContentLoaded', init);
})();
