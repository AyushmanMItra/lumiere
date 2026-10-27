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

    // Screenshare & YouTube Watch Party
    isSharingScreen: false,
    screenStream: null,
    screenSharer: null,
    screenSenders: new Map(), // targetId -> RTCRtpSender
    ytPlayer: null,
    isYtSyncing: false,

    // Ambiance, Subtitles & Activities State
    isAmbientOn: true,
    ambientAnimationId: null,
    subOffset: 0.0,
    activePoll: null,
    activeTrivia: null,
    participantVolumes: new Map(), // targetId -> number (0-200)

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
    stopMovieBtn: document.getElementById('stopMovieBtn'),
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

    moreOptionsGroup: document.getElementById('moreOptionsGroup'),
    moreOptionsBtn: document.getElementById('moreOptionsBtn'),
    moreOptionsMenu: document.getElementById('moreOptionsMenu'),
    menuAmbientGlowBtn: document.getElementById('menuAmbientGlowBtn'),
    moreMenuAmbientStatus: document.getElementById('moreMenuAmbientStatus'),
    menuScreenshareBtn: document.getElementById('menuScreenshareBtn'),
    menuScreenshareText: document.getElementById('menuScreenshareText'),
    menuYouTubeBtn: document.getElementById('menuYouTubeBtn'),
    menuUrlBtn: document.getElementById('menuUrlBtn'),

    screenSharePlayer: document.getElementById('screenSharePlayer'),
    youtubePlayerBox: document.getElementById('youtubePlayerBox'),
    youtubeIframe: document.getElementById('youtubeIframe'),

    youtubeModal: document.getElementById('youtubeModal'),
    youtubeForm: document.getElementById('youtubeForm'),
    youtubeUrlInput: document.getElementById('youtubeUrlInput'),
    closeYouTubeBtn: document.getElementById('closeYouTubeBtn'),
    cancelYouTubeBtn: document.getElementById('cancelYouTubeBtn'),
    startYouTubeBtn: document.getElementById('startYouTubeBtn'),

    urlModal: document.getElementById('urlModal'),
    urlForm: document.getElementById('urlForm'),
    directVideoUrlInput: document.getElementById('directVideoUrlInput'),
    directVideoTitleInput: document.getElementById('directVideoTitleInput'),
    closeUrlBtn: document.getElementById('closeUrlBtn'),
    cancelUrlBtn: document.getElementById('cancelUrlBtn'),
    startUrlStreamBtn: document.getElementById('startUrlStreamBtn'),

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
    modalNowPlayingBanner: document.getElementById('modalNowPlayingBanner'),
    modalNowPlayingTitle: document.getElementById('modalNowPlayingTitle'),
    modalStopMovieBtn: document.getElementById('modalStopMovieBtn'),
    closeMovieModalBtn: document.getElementById('closeMovieModalBtn'),
    refreshMoviesBtn: document.getElementById('refreshMoviesBtn'),
    folderHint: document.getElementById('folderHint'),
    uploadDropzone: document.getElementById('uploadDropzone'),
    movieFileInput: document.getElementById('movieFileInput'),
    uploadProgress: document.getElementById('uploadProgress'),
    uploadProgressFill: document.getElementById('uploadProgressFill'),
    movieLibraryList: document.getElementById('movieLibraryList'),

    // Ambiance, Subtitles & Activities
    ambientGlowCanvas: document.getElementById('ambientGlowCanvas'),
    ambientToggleBtn: document.getElementById('ambientToggleBtn'),
    pipBtn: document.getElementById('pipBtn'),
    speedPickerGroup: document.getElementById('speedPickerGroup'),
    speedSelect: document.getElementById('speedSelect'),

    subtitleDropOverlay: document.getElementById('subtitleDropOverlay'),
    subtitleSettingsBtn: document.getElementById('subtitleSettingsBtn'),
    subtitleModal: document.getElementById('subtitleModal'),
    closeSubtitleModalBtn: document.getElementById('closeSubtitleModalBtn'),
    doneSubtitleBtn: document.getElementById('doneSubtitleBtn'),
    subOffsetDisplay: document.getElementById('subOffsetDisplay'),
    subOffsetResetBtn: document.getElementById('subOffsetResetBtn'),
    customSubFileInput: document.getElementById('customSubFileInput'),

    mobileGestureOverlay: document.getElementById('mobileGestureOverlay'),
    gestureLeftIndicator: document.getElementById('gestureLeftIndicator'),
    gestureRightIndicator: document.getElementById('gestureRightIndicator'),

    noiseSuppressionToggle: document.getElementById('noiseSuppressionToggle'),
    echoCancellationToggle: document.getElementById('echoCancellationToggle'),

    activityGroup: document.getElementById('activityGroup'),
    activityBtn: document.getElementById('activityBtn'),
    activityMenu: document.getElementById('activityMenu'),
    menuPollBtn: document.getElementById('menuPollBtn'),
    menuTriviaBtn: document.getElementById('menuTriviaBtn'),
    menuSoundboardBtn: document.getElementById('menuSoundboardBtn'),

    pollModal: document.getElementById('pollModal'),
    createPollForm: document.getElementById('createPollForm'),
    pollQuestionInput: document.getElementById('pollQuestionInput'),
    pollOpt1: document.getElementById('pollOpt1'),
    pollOpt2: document.getElementById('pollOpt2'),
    pollOpt3: document.getElementById('pollOpt3'),
    pollOpt4: document.getElementById('pollOpt4'),
    cancelPollBtn: document.getElementById('cancelPollBtn'),
    startPollBtn: document.getElementById('startPollBtn'),
    activePollWidget: document.getElementById('activePollWidget'),
    closePollWidgetBtn: document.getElementById('closePollWidgetBtn'),
    pollWidgetQuestion: document.getElementById('pollWidgetQuestion'),
    pollWidgetOptions: document.getElementById('pollWidgetOptions'),
    pollTotalVotesText: document.getElementById('pollTotalVotesText'),

    triviaModal: document.getElementById('triviaModal'),
    closeTriviaModalBtn: document.getElementById('closeTriviaModalBtn'),
    triviaTimerFill: document.getElementById('triviaTimerFill'),
    triviaRoundText: document.getElementById('triviaRoundText'),
    triviaTimerCountdown: document.getElementById('triviaTimerCountdown'),
    triviaQuestionText: document.getElementById('triviaQuestionText'),
    triviaOptionsGrid: document.getElementById('triviaOptionsGrid'),
    triviaFeedback: document.getElementById('triviaFeedback'),
    triviaScoresList: document.getElementById('triviaScoresList'),

    soundboardModal: document.getElementById('soundboardModal'),
    closeSoundboardBtn: document.getElementById('closeSoundboardBtn'),
    doneSoundboardBtn: document.getElementById('doneSoundboardBtn'),

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
    el.usernameInput.value = savedUser || '';

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

    try {
      const savedAmbient = localStorage.getItem('lumiere_ambient');
      if (savedAmbient !== null) {
        state.isAmbientOn = (savedAmbient === '1');
      }
    } catch (e) {}
    updateAmbientGlowUI();

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
    const defaultGuestName = 'Guest ' + Math.floor(100 + Math.random() * 900);
    const username = el.usernameInput.value.trim() || defaultGuestName;
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

      if (data.screenShare) {
        state.screenSharer = data.screenShare;
        if (el.screenSharePlayer) el.screenSharePlayer.classList.remove('hidden');
        if (el.moviePlayer) el.moviePlayer.classList.add('hidden');
        if (el.stagePlaceholder) el.stagePlaceholder.classList.add('hidden');
        if (el.stageUsername) el.stageUsername.textContent = `${data.screenShare.sharerName}'s Screen`;
      } else if (data.currentMovie) {
        loadMovieInTheater(data.currentMovie, data.audioTrack, data.subtitleTrack, data.currentTime, data.isPlaying);
      } else {
        stopMovieInTheater();
      }

      if (data.playbackRate && el.moviePlayer) {
        el.moviePlayer.playbackRate = data.playbackRate;
        if (el.speedSelect) el.speedSelect.value = String(data.playbackRate);
      }
      if (data.activePoll) {
        renderActivePoll(data.activePoll);
      }
      if (data.activeTrivia) {
        startTriviaRound(data.activeTrivia);
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

    s.on('sync-movie-stopped', () => {
      stopMovieInTheater();
      showToast('Movie stopped by Host');
    });

    // YouTube Socket Synchronization
    s.on('sync-youtube-changed', ({ videoId, title, sharerName }) => {
      loadYouTubeInTheater(videoId, 0, true);
      showToast(`${sharerName} loaded YouTube: ${title}`);
    });

    s.on('sync-youtube-action', ({ action, time }) => {
      if (!state.ytPlayer) return;
      state.isYtSyncing = true;
      if (typeof time === 'number' && !isNaN(time)) {
        try {
          const curTime = state.ytPlayer.getCurrentTime ? state.ytPlayer.getCurrentTime() : 0;
          if (Math.abs(curTime - time) > 1.5) {
            state.ytPlayer.seekTo(time, true);
          }
        } catch (e) {}
      }
      if (action === 'play') {
        try { state.ytPlayer.playVideo(); } catch (e) {}
        updatePlayPauseIcons(true);
      } else if (action === 'pause') {
        try { state.ytPlayer.pauseVideo(); } catch (e) {}
        updatePlayPauseIcons(false);
      }
      setTimeout(() => { state.isYtSyncing = false; }, 700);
    });

    // Screen Share Socket Synchronization
    s.on('sync-screen-share-started', (sharer) => {
      state.screenSharer = sharer;
      if (sharer.sharerId === state.selfId) {
        return;
      }
      if (el.stageUsername) el.stageUsername.textContent = `${sharer.sharerName}'s Screen`;
      if (el.moviePlayer) {
        el.moviePlayer.pause();
        el.moviePlayer.classList.add('hidden');
      }
      if (el.stagePlaceholder) el.stagePlaceholder.classList.add('hidden');
      if (el.youtubePlayerBox) el.youtubePlayerBox.classList.add('hidden');
      if (el.screenSharePlayer) el.screenSharePlayer.classList.remove('hidden');

      // Check if peer connection already has the track
      const pc = state.peerConnections.get(sharer.sharerId);
      if (pc) {
        const receivers = pc.getReceivers ? pc.getReceivers() : [];
        const videoReceivers = receivers.filter(r => r.track && r.track.kind === 'video');
        const screenReceiver = videoReceivers.find(r => r.track.id === sharer.trackId) || videoReceivers[videoReceivers.length - 1];
        if (screenReceiver && screenReceiver.track) {
          handleRemoteScreenTrack(new MediaStream([screenReceiver.track]), sharer.sharerId);
        }
      }
      showToast(`${sharer.sharerName} is sharing their screen`);
    });

    s.on('sync-screen-share-stopped', () => {
      state.screenSharer = null;
      if (el.screenSharePlayer) {
        el.screenSharePlayer.srcObject = null;
        try { el.screenSharePlayer.load(); } catch (e) {}
        el.screenSharePlayer.classList.add('hidden');
      }
      if (state.currentMovie) {
        if (state.currentMovie.type === 'youtube') {
          if (el.youtubePlayerBox) el.youtubePlayerBox.classList.remove('hidden');
        } else {
          if (el.moviePlayer) el.moviePlayer.classList.remove('hidden');
        }
      } else {
        if (el.stagePlaceholder) el.stagePlaceholder.classList.remove('hidden');
      }
      if (el.stageUsername) el.stageUsername.textContent = 'Stream';
      if (state.isSharingScreen) {
        stopScreenShare(false);
      }
      showToast('Screen sharing ended');
    });

    s.on('sync-tracks-changed', ({ audioTrack, subtitleTrack, currentTime }) => {
      applyTrackChanges(audioTrack, subtitleTrack, currentTime, !el.moviePlayer.paused);
      const trackObj = state.audioTracks.find(t => t.trackIndex === audioTrack);
      showToast(`Audio Track: ${trackObj ? trackObj.label : `Track ${audioTrack + 1}`}`);
    });

    // Playback Speed Change Synchronization
    s.on('sync-speed-changed', ({ speed }) => {
      if (el.moviePlayer) el.moviePlayer.playbackRate = speed;
      if (el.speedSelect) el.speedSelect.value = String(speed);
      showToast(`Playback speed set to ${speed}x`);
    });

    // Watch Party Soundboard Broadcast
    s.on('sync-soundboard', ({ soundId, senderName }) => {
      playSoundEffect(soundId);
      showToast(`${senderName} played ${getSoundName(soundId)}`);
    });

    // Live Room Polls
    s.on('sync-poll-updated', (poll) => {
      renderActivePoll(poll);
    });

    s.on('sync-poll-closed', () => {
      state.activePoll = null;
      if (el.activePollWidget) el.activePollWidget.classList.add('hidden');
    });

    // Cinema Trivia Challenge
    s.on('sync-trivia-started', (triviaRound) => {
      startTriviaRound(triviaRound);
    });

    s.on('sync-trivia-scores', (scores) => {
      renderTriviaScores(scores);
    });

    s.on('sync-trivia-next', ({ questionIndex }) => {
      displayTriviaQuestion(questionIndex);
    });

    s.on('sync-trivia-ended', ({ scores }) => {
      finishTriviaRound(scores);
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
    s.on('room-synced', ({ currentMovie, screenShare, audioTrack, subtitleTrack, currentTime, isPlaying }) => {
      if (state.isHost) return;

      if (screenShare) {
        state.screenSharer = screenShare;
        if (el.screenSharePlayer) el.screenSharePlayer.classList.remove('hidden');
        if (el.moviePlayer) el.moviePlayer.classList.add('hidden');
        if (el.stagePlaceholder) el.stagePlaceholder.classList.add('hidden');
        if (el.youtubePlayerBox) el.youtubePlayerBox.classList.add('hidden');
        if (el.stageUsername) el.stageUsername.textContent = `${screenShare.sharerName}'s Screen`;
        return;
      }

      if (!currentMovie) {
        if (state.currentMovie) {
          stopMovieInTheater();
        }
        return;
      }

      if (currentMovie.type === 'youtube') {
        if (!state.currentMovie || state.currentMovie.videoId !== currentMovie.videoId) {
          loadYouTubeInTheater(currentMovie.videoId, currentTime, isPlaying);
        }
        return;
      }

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

        preferH264Codecs(pc);
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
      if (ms && ms.getVideoTracks().length > 0 && ms.getVideoTracks()[0].readyState !== 'ended') {
        return ms;
      }
    }
    const pc = state.peerConnections.get(targetId);
    if (pc) {
      const receivers = pc.getReceivers ? pc.getReceivers() : [];
      const videoReceiver = receivers.find(r => r.track && r.track.kind === 'video' && r.track.readyState !== 'ended');
      if (videoReceiver && videoReceiver.track) {
        const ms = new MediaStream([videoReceiver.track]);
        state.remoteStreams.set(targetId, ms);

        videoReceiver.track.onunmute = () => {
          console.log(`[WebRTC] Receiver video track unmuted from ${targetId}`);
          const m = state.members.get(targetId);
          if (m && m.isCamOn) {
            attachRemoteVideo(targetId, ms);
          }
        };
        videoReceiver.track.onended = () => {
          console.log(`[WebRTC] Receiver video track ended from ${targetId}`);
          detachRemoteVideo(targetId);
        };

        return ms;
      }
    }
    return null;
  }

  function attachRemoteVideo(targetId, stream) {
    if (!stream) return;
    const member = state.members.get(targetId);
    if (member && !member.isCamOn) {
      detachRemoteVideo(targetId);
      return;
    }

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
    const video = document.getElementById(`participant-video-${targetId}`);
    const avatar = document.getElementById(`participant-avatar-${targetId}`);
    if (video) {
      video.pause();
      video.srcObject = null;
      video.removeAttribute('src');
      try { video.load(); } catch (e) {}
      video.classList.add('hidden');
    }
    if (avatar) avatar.classList.remove('hidden');
  }

  function preferH264Codecs(pc) {
    if (!RTCRtpReceiver.getCapabilities) return;
    try {
      const transceivers = pc.getTransceivers ? pc.getTransceivers() : [];
      const videoTransceiver = transceivers.find(t => (t.receiver?.track?.kind === 'video') || (t.sender?.track?.kind === 'video'));
      if (videoTransceiver && 'setCodecPreferences' in videoTransceiver) {
        const caps = RTCRtpReceiver.getCapabilities('video');
        if (caps && caps.codecs) {
          const codecs = caps.codecs;
          const h264 = codecs.filter(c => c.mimeType.toLowerCase() === 'video/h264');
          const vp8 = codecs.filter(c => c.mimeType.toLowerCase() === 'video/vp8');
          const others = codecs.filter(c => c.mimeType.toLowerCase() !== 'video/h264' && c.mimeType.toLowerCase() !== 'video/vp8');
          if (h264.length > 0) {
            videoTransceiver.setCodecPreferences([...h264, ...vp8, ...others]);
          }
        }
      }
    } catch (e) {
      console.warn('[WebRTC] Error setting codec preferences:', e);
    }
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

    // If currently sharing screen, attach screen track to this peer connection
    if (state.isSharingScreen && state.screenStream) {
      const screenTrack = state.screenStream.getVideoTracks()[0];
      if (screenTrack) {
        try {
          const sender = pc.addTrack(screenTrack, state.screenStream);
          state.screenSenders = state.screenSenders || new Map();
          state.screenSenders.set(targetId, sender);
        } catch (e) {}
      }
    }

    preferH264Codecs(pc);

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

    // Remote Track Arrival (Handles Camera & Screenshare Streams)
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

        // Detect if incoming track is a screenshare stream
        const isScreen = (state.screenSharer && state.screenSharer.sharerId === targetId && (e.track.id === state.screenSharer.trackId || (e.streams && e.streams[0] && e.streams[0].id === state.screenSharer.streamId))) ||
                         (e.streams && e.streams[0] && (e.streams[0].id.includes('screen') || e.streams[0].id.includes('display'))) ||
                         (e.track.label && (e.track.label.toLowerCase().includes('screen') || e.track.label.toLowerCase().includes('window') || e.track.label.toLowerCase().includes('display')));

        if (isScreen) {
          console.log(`[WebRTC] Attached remote screen share from ${targetId}`);
          handleRemoteScreenTrack(stream, targetId);
          e.track.onended = () => {
            if (el.screenSharePlayer) {
              el.screenSharePlayer.srcObject = null;
              el.screenSharePlayer.classList.add('hidden');
            }
          };
          return;
        }

        state.remoteStreams.set(targetId, stream);
        const member = state.members.get(targetId);
        if (member && member.isCamOn) {
          attachRemoteVideo(targetId, stream);
        } else {
          detachRemoteVideo(targetId);
        }

        e.track.onunmute = () => {
          console.log(`[WebRTC] Video unmuted from ${targetId}`);
          const m = state.members.get(targetId);
          if (m && m.isCamOn) {
            attachRemoteVideo(targetId, stream);
          }
        };
        e.track.onmute = () => {
          console.log(`[WebRTC] Video muted from ${targetId}`);
          const m = state.members.get(targetId);
          if (!m || !m.isCamOn) {
            detachRemoteVideo(targetId);
          }
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
      preferH264Codecs(pc);
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

        // Transmit video track to each connected peer
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

            preferH264Codecs(pc);

            // Renegotiate offer so phone receives video SSRC & initializes H.264 hardware decoder
            if (pc.signalingState === 'stable') {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              state.socket.emit('webrtc-offer', { targetId, offer });
            }
          } catch (e) {
            console.warn('[WebRTC] Error updating video track with ' + targetId, e);
          }
        }

        el.toggleCameraBtn.classList.remove('pill-btn-off');
        el.camOnIcon.classList.remove('hidden');
        el.camOffIcon.classList.add('hidden');

        if (state.socket) {
          state.socket.emit('update-cam-status', { roomId: state.roomId, isCamOn: true });
        }
      } catch (err) {
        console.error('Camera access failed:', err);
        showToast('Camera access denied or busy', 'error');
        state.isCamOn = false;
        if (state.socket) {
          state.socket.emit('update-cam-status', { roomId: state.roomId, isCamOn: false });
        }
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
        } catch (e) {}
      }

      const selfVideo = document.getElementById(`participant-video-${state.selfId}`);
      const selfAvatar = document.getElementById(`participant-avatar-${state.selfId}`);
      if (selfVideo) {
        selfVideo.pause();
        selfVideo.srcObject = null;
        selfVideo.removeAttribute('src');
        try { selfVideo.load(); } catch (e) {}
        selfVideo.classList.add('hidden');
      }
      if (selfAvatar) selfAvatar.classList.remove('hidden');

      el.toggleCameraBtn.classList.add('pill-btn-off');
      el.camOnIcon.classList.add('hidden');
      el.camOffIcon.classList.remove('hidden');

      if (state.socket) {
        state.socket.emit('update-cam-status', { roomId: state.roomId, isCamOn: false });
      }
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
  // WEBRTC SCREEN SHARING ENGINE
  // ==========================================================================

  function updateScreenShareMenuUI() {
    if (!el.menuScreenshareBtn) return;
    if (state.isSharingScreen) {
      el.menuScreenshareBtn.classList.add('active-sharing');
      if (el.menuScreenshareText) el.menuScreenshareText.textContent = 'Stop Screen Share';
    } else {
      el.menuScreenshareBtn.classList.remove('active-sharing');
      if (el.menuScreenshareText) el.menuScreenshareText.textContent = 'Share Screen';
    }
  }

  async function toggleScreenShare() {
    if (state.isSharingScreen) {
      stopScreenShare(true);
    } else {
      await startScreenShare();
    }
  }

  async function startScreenShare() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      showToast('Screen sharing is not supported by your browser', 'error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          displaySurface: 'monitor'
        },
        audio: true
      });

      state.screenStream = stream;
      state.isSharingScreen = true;
      updateScreenShareMenuUI();

      const screenVideoTrack = stream.getVideoTracks()[0];
      if (!screenVideoTrack) {
        throw new Error('No video track available from display media');
      }

      // Handle user clicking native browser "Stop sharing" bar
      screenVideoTrack.onended = () => {
        stopScreenShare(true);
      };

      // Render locally on main cinema stage
      if (el.screenSharePlayer) {
        el.screenSharePlayer.srcObject = stream;
        el.screenSharePlayer.classList.remove('hidden');
        el.screenSharePlayer.play().catch(() => {});
      }
      if (el.moviePlayer) {
        el.moviePlayer.pause();
        el.moviePlayer.classList.add('hidden');
      }
      if (el.stagePlaceholder) el.stagePlaceholder.classList.add('hidden');
      if (el.youtubePlayerBox) el.youtubePlayerBox.classList.add('hidden');
      if (el.stageUsername) el.stageUsername.textContent = `${state.username}'s Screen`;

      // Broadcast to room
      if (state.socket) {
        state.socket.emit('start-screen-share', {
          roomId: state.roomId,
          streamId: stream.id,
          trackId: screenVideoTrack.id,
          username: state.username
        });
      }

      // Add track to all connected peers and renegotiate
      state.screenSenders = state.screenSenders || new Map();
      for (const [targetId, pc] of state.peerConnections.entries()) {
        try {
          const sender = pc.addTrack(screenVideoTrack, stream);
          state.screenSenders.set(targetId, sender);

          const audioTracks = stream.getAudioTracks();
          if (audioTracks.length > 0) {
            try { pc.addTrack(audioTracks[0], stream); } catch (e) {}
          }

          preferH264Codecs(pc);
          if (pc.signalingState === 'stable') {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            state.socket.emit('webrtc-offer', { targetId, offer });
          }
        } catch (e) {
          console.warn('[WebRTC] Error sharing screen to peer ' + targetId, e);
        }
      }

      showToast('Screen sharing started');
    } catch (err) {
      if (err.name !== 'NotAllowedError') {
        console.error('Error starting screen share:', err);
        showToast('Could not share screen: ' + err.message, 'error');
      }
      state.isSharingScreen = false;
      updateScreenShareMenuUI();
    }
  }

  function stopScreenShare(notifyServer = true) {
    if (state.screenStream) {
      state.screenStream.getTracks().forEach(t => {
        try { t.stop(); } catch (e) {}
      });
      state.screenStream = null;
    }

    state.isSharingScreen = false;
    updateScreenShareMenuUI();

    // Remove track from peer connections and renegotiate
    if (state.screenSenders) {
      for (const [targetId, sender] of state.screenSenders.entries()) {
        const pc = state.peerConnections.get(targetId);
        if (pc && sender) {
          try { pc.removeTrack(sender); } catch (e) {}
          if (pc.signalingState === 'stable') {
            pc.createOffer().then(offer => {
              pc.setLocalDescription(offer);
              state.socket.emit('webrtc-offer', { targetId, offer });
            }).catch(() => {});
          }
        }
      }
      state.screenSenders.clear();
    }

    // Reset local player
    if (el.screenSharePlayer) {
      el.screenSharePlayer.srcObject = null;
      try { el.screenSharePlayer.load(); } catch (e) {}
      el.screenSharePlayer.classList.add('hidden');
    }

    if (state.currentMovie) {
      if (state.currentMovie.type === 'youtube') {
        if (el.youtubePlayerBox) el.youtubePlayerBox.classList.remove('hidden');
      } else {
        if (el.moviePlayer) el.moviePlayer.classList.remove('hidden');
      }
      if (el.stageUsername) el.stageUsername.textContent = 'Stream';
    } else {
      if (el.stagePlaceholder) el.stagePlaceholder.classList.remove('hidden');
      if (el.stageUsername) el.stageUsername.textContent = 'Stream';
    }

    if (notifyServer && state.socket) {
      state.socket.emit('stop-screen-share', { roomId: state.roomId });
    }
  }

  function handleRemoteScreenTrack(stream, targetId) {
    if (el.screenSharePlayer) {
      el.screenSharePlayer.srcObject = stream;
      el.screenSharePlayer.classList.remove('hidden');
      el.screenSharePlayer.play().catch(() => {});
    }
    if (el.moviePlayer) {
      el.moviePlayer.pause();
      el.moviePlayer.classList.add('hidden');
    }
    if (el.stagePlaceholder) el.stagePlaceholder.classList.add('hidden');
    if (el.youtubePlayerBox) el.youtubePlayerBox.classList.add('hidden');
    const sharerName = state.screenSharer?.sharerName || state.members.get(targetId)?.username || 'Remote User';
    if (el.stageUsername) el.stageUsername.textContent = `${sharerName}'s Screen`;
  }

  // ==========================================================================
  // YOUTUBE WATCH PARTY ENGINE
  // ==========================================================================

  function extractYouTubeId(urlOrId) {
    if (!urlOrId) return null;
    const trimmed = urlOrId.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
    const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = trimmed.match(regExp);
    return match ? match[1] : null;
  }

  function initYouTubeApi(callback) {
    if (window.YT && window.YT.Player) {
      callback();
      return;
    }
    const prevOnReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prevOnReady === 'function') prevOnReady();
      callback();
    };
    if (!document.getElementById('yt-iframe-script')) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-script';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  }

  function loadYouTubeInTheater(videoId, startTime = 0, autoPlay = true) {
    state.currentMovie = { type: 'youtube', videoId, filename: 'YouTube Video' };
    state.movieDuration = 0;
    state.isLiveStream = false;

    if (el.moviePlayer) {
      el.moviePlayer.pause();
      el.moviePlayer.classList.add('hidden');
    }
    if (el.stagePlaceholder) el.stagePlaceholder.classList.add('hidden');
    if (el.screenSharePlayer) el.screenSharePlayer.classList.add('hidden');
    if (el.youtubePlayerBox) el.youtubePlayerBox.classList.remove('hidden');
    if (el.stageUsername) el.stageUsername.textContent = 'YouTube';
    if (el.durationDisplay) el.durationDisplay.textContent = 'YouTube';
    if (el.audioPickerGroup) el.audioPickerGroup.classList.add('hidden');
    if (el.subtitlePickerGroup) el.subtitlePickerGroup.classList.add('hidden');

    initYouTubeApi(() => {
      if (state.ytPlayer && typeof state.ytPlayer.loadVideoById === 'function') {
        state.isYtSyncing = true;
        state.ytPlayer.loadVideoById({
          videoId: videoId,
          startSeconds: startTime || 0
        });
        if (autoPlay) {
          try { state.ytPlayer.playVideo(); } catch (e) {}
          updatePlayPauseIcons(true);
        } else {
          try { state.ytPlayer.pauseVideo(); } catch (e) {}
          updatePlayPauseIcons(false);
        }
        setTimeout(() => { state.isYtSyncing = false; }, 800);
      } else {
        let ytContainer = document.getElementById('youtubeIframe');
        if (!ytContainer && el.youtubePlayerBox) {
          ytContainer = document.createElement('div');
          ytContainer.id = 'youtubeIframe';
          el.youtubePlayerBox.appendChild(ytContainer);
        }
        try {
          state.ytPlayer = new YT.Player('youtubeIframe', {
            videoId: videoId,
            playerVars: {
              autoplay: autoPlay ? 1 : 0,
              controls: 1,
              modestbranding: 1,
              rel: 0,
              playsinline: 1,
              start: Math.floor(startTime || 0)
            },
            events: {
              onReady: (event) => {
                if (autoPlay) event.target.playVideo();
                updatePlayPauseIcons(autoPlay);
              },
              onStateChange: onYouTubeStateChange
            }
          });
        } catch (e) {
          console.error('[YouTube] Init error:', e);
        }
      }
    });
  }

  function onYouTubeStateChange(event) {
    if (state.isYtSyncing) return;
    if (!state.ytPlayer || !state.socket) return;

    try {
      const curTime = state.ytPlayer.getCurrentTime ? state.ytPlayer.getCurrentTime() : 0;
      if (event.data === YT.PlayerState.PLAYING) {
        updatePlayPauseIcons(true);
        state.socket.emit('host-youtube-sync', { roomId: state.roomId, action: 'play', time: curTime });
      } else if (event.data === YT.PlayerState.PAUSED) {
        updatePlayPauseIcons(false);
        state.socket.emit('host-youtube-sync', { roomId: state.roomId, action: 'pause', time: curTime });
      }
    } catch (e) {}
  }

  function openYouTubeModal() {
    if (el.youtubeModal) {
      el.youtubeModal.classList.remove('hidden');
      if (el.youtubeUrlInput) {
        el.youtubeUrlInput.value = '';
        setTimeout(() => el.youtubeUrlInput.focus(), 80);
      }
    }
  }

  function closeYouTubeModal() {
    if (el.youtubeModal) el.youtubeModal.classList.add('hidden');
  }

  function handleYouTubeSubmit(e) {
    if (e) e.preventDefault();
    const val = el.youtubeUrlInput?.value;
    const videoId = extractYouTubeId(val);
    if (!videoId) {
      showToast('Please enter a valid YouTube link or video ID', 'error');
      return;
    }
    closeYouTubeModal();
    if (state.socket) {
      state.socket.emit('host-set-youtube', { roomId: state.roomId, videoId });
    }
  }

  // ==========================================================================
  // DIRECT URL STREAMING ENGINE
  // ==========================================================================

  function openUrlModal() {
    if (el.urlModal) {
      el.urlModal.classList.remove('hidden');
      if (el.directVideoUrlInput) {
        el.directVideoUrlInput.value = '';
        setTimeout(() => el.directVideoUrlInput.focus(), 80);
      }
    }
  }

  function closeUrlModal() {
    if (el.urlModal) el.urlModal.classList.add('hidden');
  }

  function handleUrlSubmit(e) {
    if (e) e.preventDefault();
    const url = el.directVideoUrlInput?.value?.trim();
    const title = el.directVideoTitleInput?.value?.trim();

    if (!url || (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('blob:'))) {
      showToast('Please enter a valid HTTP/HTTPS video URL', 'error');
      return;
    }

    closeUrlModal();

    let filename = title;
    if (!filename) {
      try {
        const u = new URL(url);
        filename = u.pathname.split('/').pop() || 'Web Video Stream';
      } catch (e) {
        filename = 'Web Video Stream';
      }
    }

    const movie = {
      filename: filename,
      url: url,
      isUrl: true
    };

    if (state.socket) {
      state.socket.emit('host-set-movie', {
        roomId: state.roomId,
        movie: movie
      });
    }
  }

  // ==========================================================================
  // 1. AMBIANCE & VIDEO POLISH (Ambilight, Speed, PiP, Gestures)
  // ==========================================================================

  function updateAmbientGlowUI() {
    if (el.ambientGlowCanvas) {
      el.ambientGlowCanvas.classList.toggle('hidden', !state.isAmbientOn);
    }
    if (el.ambientToggleBtn) {
      el.ambientToggleBtn.classList.toggle('active-toggle', state.isAmbientOn);
      el.ambientToggleBtn.title = state.isAmbientOn
        ? 'Ambient Cinema Glow: ON (Click to turn off)'
        : 'Ambient Cinema Glow: OFF (Click to turn on)';
    }
    if (el.moreMenuAmbientStatus) {
      el.moreMenuAmbientStatus.innerText = state.isAmbientOn ? 'ON' : 'OFF';
      el.moreMenuAmbientStatus.classList.toggle('badge-active', state.isAmbientOn);
    }
  }

  function initAmbientGlow() {
    const canvas = el.ambientGlowCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = 48;
    canvas.height = 27;

    const sampleFrame = () => {
      if (state.isAmbientOn) {
        if (el.moviePlayer && !el.moviePlayer.paused && !el.moviePlayer.ended && el.moviePlayer.readyState >= 2) {
          try {
            ctx.drawImage(el.moviePlayer, 0, 0, canvas.width, canvas.height);
          } catch (e) {}
        } else if (el.screenSharePlayer && !el.screenSharePlayer.paused && el.screenSharePlayer.readyState >= 2) {
          try {
            ctx.drawImage(el.screenSharePlayer, 0, 0, canvas.width, canvas.height);
          } catch (e) {}
        }
      }
      state.ambientAnimationId = requestAnimationFrame(sampleFrame);
    };

    updateAmbientGlowUI();
    sampleFrame();
  }

  function toggleAmbientGlow() {
    state.isAmbientOn = !state.isAmbientOn;
    try {
      localStorage.setItem('lumiere_ambient', state.isAmbientOn ? '1' : '0');
    } catch (e) {}
    updateAmbientGlowUI();
    showToast(state.isAmbientOn ? 'Ambient Lighting: ON' : 'Ambient Lighting: OFF');
  }

  function togglePictureInPicture() {
    if (!document.pictureInPictureEnabled) {
      showToast('Picture-in-Picture not supported by your browser', 'error');
      return;
    }
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    } else if (el.moviePlayer) {
      el.moviePlayer.requestPictureInPicture().catch(() => {});
    }
  }

  function handleSpeedChange(e) {
    const speed = typeof e === 'number' ? e : parseFloat(e?.target ? e.target.value : e);
    if (isNaN(speed)) return;
    if (el.moviePlayer) {
      el.moviePlayer.playbackRate = speed;
    }
    if (el.speedSelect && el.speedSelect.value !== String(speed)) {
      el.speedSelect.value = String(speed);
    }
    if (state.socket) {
      state.socket.emit('sync-speed-changed', { roomId: state.roomId, speed });
    }
    showToast(`Playback speed: ${speed}x`);
  }

  function initMobileGestures() {
    if (!el.cinemaBox) return;
    let lastTapTime = 0;
    let lastTapX = 0;
    let hudHideTimeout = null;

    el.cinemaBox.addEventListener('touchend', (e) => {
      // If user tapped a button, select, or scrubber inside the cinema box, let it interact normally
      if (e.target.closest('button, select, input, a, .hud-timeline-container, .device-menu, .active-poll-widget')) {
        return;
      }

      const currentTime = Date.now();
      const tapLength = currentTime - lastTapTime;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const rect = el.cinemaBox.getBoundingClientRect();
      const tapX = touch.clientX - rect.left;

      if (tapLength < 380 && Math.abs(tapX - lastTapX) < 90) {
        // Double-Tap Detected!
        e.preventDefault();
        const boxWidth = rect.width;
        if (tapX < boxWidth / 3) {
          // Rewind 10s
          rewind10Seconds();
          triggerGestureIndicator('left');
        } else if (tapX > (2 * boxWidth) / 3) {
          // Forward 10s
          forward10Seconds();
          triggerGestureIndicator('right');
        }
      } else {
        // Single Tap Detected on Cinema Screen (Mobile / Touch Devices)
        // Toggle the Cinema HUD visibility so mobile users can easily access and tap all controls
        if (el.cinemaControls && state.currentMovie) {
          e.preventDefault(); // Prevents accidental movie pause on mobile
          const isCurrentlyActive = el.cinemaControls.classList.contains('active');
          if (isCurrentlyActive) {
            el.cinemaControls.classList.remove('active');
            clearTimeout(hudHideTimeout);
          } else {
            el.cinemaControls.classList.add('active');
            clearTimeout(hudHideTimeout);
            hudHideTimeout = setTimeout(() => {
              if (el.cinemaControls) el.cinemaControls.classList.remove('active');
            }, 4000);
          }
        }
      }

      lastTapTime = currentTime;
      lastTapX = tapX;
    }, { passive: false });
  }

  function triggerGestureIndicator(side) {
    if (!el.mobileGestureOverlay) return;
    el.mobileGestureOverlay.classList.remove('hidden');
    const indicator = side === 'left' ? el.gestureLeftIndicator : el.gestureRightIndicator;
    if (indicator) {
      indicator.classList.remove('hidden');
      setTimeout(() => {
        indicator.classList.add('hidden');
        el.mobileGestureOverlay?.classList.add('hidden');
      }, 450);
    }
  }

  // ==========================================================================
  // 2. SUBTITLES & ACCESSIBILITY (Drag-Drop, Offset, Custom Styles)
  // ==========================================================================

  function initSubtitleDragAndDrop() {
    const box = el.cinemaBox;
    if (!box) return;

    box.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.subtitleDropOverlay?.classList.remove('hidden');
    });

    box.addEventListener('dragleave', (e) => {
      if (e.relatedTarget && box.contains(e.relatedTarget)) return;
      el.subtitleDropOverlay?.classList.add('hidden');
    });

    box.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.subtitleDropOverlay?.classList.add('hidden');

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        loadExternalSubtitleFile(files[0]);
      }
    });
  }

  function loadExternalSubtitleFile(file) {
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith('.srt') && !name.endsWith('.vtt')) {
      showToast('Please upload a .srt or .vtt subtitle file', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      let content = e.target.result;
      if (name.endsWith('.srt')) {
        content = srtToVtt(content);
      }
      applyVttSubtitles(content, file.name);
    };
    reader.readAsText(file);
  }

  function srtToVtt(srt) {
    let vtt = 'WEBVTT\n\n';
    vtt += srt
      .replace(/\r\n|\r/g, '\n')
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    return vtt;
  }

  function applyVttSubtitles(vttText, label = 'Custom Subtitle') {
    const blob = new Blob([vttText], { type: 'text/vtt' });
    const blobUrl = URL.createObjectURL(blob);

    const oldTracks = el.moviePlayer.querySelectorAll('track[data-custom="true"]');
    oldTracks.forEach(t => t.remove());

    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.label = label;
    track.srclang = 'en';
    track.default = true;
    track.src = blobUrl;
    track.setAttribute('data-custom', 'true');
    el.moviePlayer.appendChild(track);

    if (el.subtitleTrackSelect) {
      const opt = document.createElement('option');
      opt.value = 'custom';
      opt.innerText = label;
      opt.selected = true;
      el.subtitleTrackSelect.appendChild(opt);
    }

    showToast(`Loaded: ${label}`);
  }

  function openSubtitleModal() {
    if (el.subtitleModal) el.subtitleModal.classList.remove('hidden');
  }

  function closeSubtitleModal() {
    if (el.subtitleModal) el.subtitleModal.classList.add('hidden');
  }

  function adjustSubtitleOffset(delta) {
    state.subOffset = Math.round((state.subOffset + delta) * 10) / 10;
    updateSubtitleOffsetUI();
    try {
      if (el.moviePlayer && el.moviePlayer.textTracks) {
        for (let i = 0; i < el.moviePlayer.textTracks.length; i++) {
          const track = el.moviePlayer.textTracks[i];
          if (track.cues) {
            for (let j = 0; j < track.cues.length; j++) {
              const cue = track.cues[j];
              cue.startTime = Math.max(0, cue.startTime + delta);
              cue.endTime = Math.max(0, cue.endTime + delta);
            }
          }
        }
      }
    } catch (e) {}
  }

  function resetSubtitleOffset() {
    const delta = -state.subOffset;
    state.subOffset = 0.0;
    updateSubtitleOffsetUI();
    try {
      if (el.moviePlayer && el.moviePlayer.textTracks) {
        for (let i = 0; i < el.moviePlayer.textTracks.length; i++) {
          const track = el.moviePlayer.textTracks[i];
          if (track.cues) {
            for (let j = 0; j < track.cues.length; j++) {
              const cue = track.cues[j];
              cue.startTime = Math.max(0, cue.startTime + delta);
              cue.endTime = Math.max(0, cue.endTime + delta);
            }
          }
        }
      }
    } catch (e) {}
  }

  function updateSubtitleOffsetUI() {
    if (el.subOffsetDisplay) {
      el.subOffsetDisplay.textContent = `${state.subOffset > 0 ? '+' : ''}${state.subOffset.toFixed(1)}s`;
    }
    applySubtitleStyling();
  }

  function applySubtitleStyling() {
    let styleEl = document.getElementById('lumiereCustomSubStyles');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'lumiereCustomSubStyles';
      document.head.appendChild(styleEl);
    }

    const sizeBtn = document.querySelector('.sub-style-btn.active[data-style-type="size"]');
    const colorBtn = document.querySelector('.sub-style-btn.active[data-style-type="color"]');
    const sizeVal = sizeBtn ? sizeBtn.dataset.val : 'normal';
    const colorVal = colorBtn ? colorBtn.dataset.val : '#ffffff';

    let fontSize = '20px';
    if (sizeVal === 'large') fontSize = '26px';
    if (sizeVal === 'xlarge') fontSize = '32px';

    styleEl.textContent = `
      ::cue {
        font-size: ${fontSize} !important;
        color: ${colorVal} !important;
        background-color: rgba(0, 0, 0, 0.78) !important;
        text-shadow: 0 1px 3px rgba(0,0,0,0.9) !important;
        font-family: inherit !important;
      }
    `;
  }

  // ==========================================================================
  // 3. VOICE & AUDIO EXPERIENCE (Noise Suppression, Soundboard)
  // ==========================================================================

  function updateAudioProcessingConstraints() {
    if (!state.localAudioTrack) return;
    const noise = !!el.noiseSuppressionToggle?.checked;
    const echo = !!el.echoCancellationToggle?.checked;

    try {
      state.localAudioTrack.applyConstraints({
        noiseSuppression: noise,
        echoCancellation: echo,
        autoGainControl: true
      });
      showToast(`Audio Processing: Noise (${noise ? 'ON' : 'OFF'}), Echo (${echo ? 'ON' : 'OFF'})`);
    } catch (e) {
      console.warn('Error applying audio constraints:', e);
    }
  }

  function getSoundName(id) {
    const names = {
      airhorn: 'Airhorn 📢',
      applause: 'Applause 👏',
      drumroll: 'Drumroll 🥁',
      sting: 'Dramatic Sting 😱',
      laugh: 'Laugh Track 😂',
      rimshot: 'Ba-Dum-Tss 🥁'
    };
    return names[id] || id;
  }

  function playSoundEffect(id) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = state.audioContext || new AudioCtx();
      state.audioContext = ctx;
      if (ctx.state === 'suspended') ctx.resume();

      const now = ctx.currentTime;

      if (id === 'airhorn') {
        [440, 466].forEach(freq => {
          for (let i = 0; i < 2; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq * 1.5, now + i * 0.22);
            gain.gain.setValueAtTime(0.2, now + i * 0.22);
            gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.22 + 0.18);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + i * 0.22);
            osc.stop(now + i * 0.22 + 0.2);
          }
        });
      } else if (id === 'applause') {
        const bufferSize = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 1.4));
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1200;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 1.8);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start(now);
      } else if (id === 'drumroll') {
        for (let i = 0; i < 22; i++) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.value = 180 + Math.random() * 40;
          gain.gain.setValueAtTime(0.05 + (i / 22) * 0.18, now + i * 0.075);
          gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.075 + 0.06);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + i * 0.075);
          osc.stop(now + i * 0.075 + 0.07);
        }
      } else if (id === 'sting') {
        [220, 261.63, 311.13, 440].forEach(freq => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now);
          gain.gain.setValueAtTime(0.01, now);
          gain.gain.linearRampToValueAtTime(0.2, now + 0.2);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 1.6);
        });
      } else if (id === 'laugh') {
        for (let i = 0; i < 5; i++) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(320 + Math.sin(i) * 50, now + i * 0.16);
          osc.frequency.exponentialRampToValueAtTime(260, now + i * 0.16 + 0.14);
          gain.gain.setValueAtTime(0.18, now + i * 0.16);
          gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.16 + 0.14);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + i * 0.16);
          osc.stop(now + i * 0.16 + 0.15);
        }
      } else if (id === 'rimshot') {
        [0, 0.18].forEach((timeOffset, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.setValueAtTime(idx === 0 ? 120 : 160, now + timeOffset);
          gain.gain.setValueAtTime(0.25, now + timeOffset);
          gain.gain.exponentialRampToValueAtTime(0.01, now + timeOffset + 0.12);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + timeOffset);
          osc.stop(now + timeOffset + 0.14);
        });
        const cymbalTime = now + 0.36;
        const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.45, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < buffer.length; i++) data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 5000;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.3, cymbalTime);
        gain.gain.exponentialRampToValueAtTime(0.01, cymbalTime + 0.4);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start(cymbalTime);
      }
    } catch (e) {
      console.warn('[Soundboard] Audio error:', e);
    }
  }

  // ==========================================================================
  // 4. ACTIVITIES & SOCIAL (Polls & Movie Trivia Challenge)
  // ==========================================================================

  function openPollModal() {
    if (el.pollModal) {
      el.pollModal.classList.remove('hidden');
      if (el.pollQuestionInput) {
        el.pollQuestionInput.value = '';
        if (el.pollOpt1) el.pollOpt1.value = '';
        if (el.pollOpt2) el.pollOpt2.value = '';
        if (el.pollOpt3) el.pollOpt3.value = '';
        if (el.pollOpt4) el.pollOpt4.value = '';
        setTimeout(() => el.pollQuestionInput.focus(), 80);
      }
    }
  }

  function closePollModal() {
    if (el.pollModal) el.pollModal.classList.add('hidden');
  }

  function handleCreatePoll(e) {
    if (e) e.preventDefault();
    const question = el.pollQuestionInput?.value?.trim();
    const opt1 = el.pollOpt1?.value?.trim();
    const opt2 = el.pollOpt2?.value?.trim();
    const opt3 = el.pollOpt3?.value?.trim();
    const opt4 = el.pollOpt4?.value?.trim();

    if (!question || !opt1 || !opt2) {
      showToast('Please provide a question and at least 2 options', 'error');
      return;
    }

    const options = [opt1, opt2];
    if (opt3) options.push(opt3);
    if (opt4) options.push(opt4);

    closePollModal();

    if (state.socket) {
      state.socket.emit('create-poll', {
        roomId: state.roomId,
        question,
        options
      });
    }
    showToast('Poll launched!');
  }

  function renderActivePoll(poll) {
    state.activePoll = poll;
    if (!el.activePollWidget) return;
    el.activePollWidget.classList.remove('hidden');

    if (el.pollWidgetQuestion) el.pollWidgetQuestion.textContent = poll.question;

    const totalVotes = poll.options.reduce((sum, o) => sum + (o.votes || 0), 0);
    if (el.pollTotalVotesText) {
      el.pollTotalVotesText.textContent = `${totalVotes} vote${totalVotes === 1 ? '' : 's'}`;
    }

    const myVote = poll.voters ? poll.voters[state.selfId] : undefined;

    if (el.pollWidgetOptions) {
      el.pollWidgetOptions.innerHTML = '';
      poll.options.forEach((opt, idx) => {
        const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
        const isVoted = myVote === idx;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `poll-opt-btn ${isVoted ? 'voted' : ''}`;
        btn.innerHTML = `
          <div class="poll-bar-fill" style="width: ${pct}%"></div>
          <span class="poll-opt-text">${opt.text}</span>
          <span class="poll-opt-pct">${pct}% (${opt.votes})</span>
        `;

        btn.onclick = () => {
          if (state.socket) {
            state.socket.emit('vote-poll', { roomId: state.roomId, optionIndex: idx });
          }
        };

        el.pollWidgetOptions.appendChild(btn);
      });
    }
  }

  const TRIVIA_BANK = [
    {
      q: "Which movie features the famous quote: 'Here's looking at you, kid'?",
      options: ["Casablanca", "Citizen Kane", "Gone with the Wind", "Sunset Boulevard"],
      answer: 0
    },
    {
      q: "What is the highest-grossing film of all time (unadjusted for inflation)?",
      options: ["Titanic", "Avengers: Endgame", "Avatar", "Star Wars: The Force Awakens"],
      answer: 2
    },
    {
      q: "In 'The Matrix', what color pill does Neo take to wake up in reality?",
      options: ["Blue", "Red", "Green", "Yellow"],
      answer: 1
    },
    {
      q: "Which Christopher Nolan movie features dreams nested within dreams?",
      options: ["Interstellar", "Tenet", "Memento", "Inception"],
      answer: 3
    },
    {
      q: "Who voiced Woody in the original Pixar movie 'Toy Story' (1995)?",
      options: ["Tom Hanks", "Tim Allen", "Robin Williams", "Billy Crystal"],
      answer: 0
    },
    {
      q: "Which movie won the first ever Academy Award for Best Animated Feature?",
      options: ["Monsters, Inc.", "Shrek", "Ice Age", "Finding Nemo"],
      answer: 1
    },
    {
      q: "In 'Pulp Fiction', what is the dance performed by Vincent Vega and Mia Wallace?",
      options: ["The Twist", "The Macarena", "The Charleston", "The Tango"],
      answer: 0
    }
  ];

  let triviaTimerInterval = null;

  function openTriviaModal() {
    const shuffled = [...TRIVIA_BANK].sort(() => 0.5 - Math.random()).slice(0, 5);
    const triviaRound = {
      id: 'trivia_' + Date.now(),
      questions: shuffled,
      currentQuestion: 0
    };
    if (state.socket) {
      state.socket.emit('start-trivia', { roomId: state.roomId, triviaRound });
    }
  }

  function startTriviaRound(trivia) {
    state.activeTrivia = trivia;
    if (el.triviaModal) el.triviaModal.classList.remove('hidden');
    displayTriviaQuestion(trivia.currentQuestion || 0);
  }

  function displayTriviaQuestion(idx) {
    if (!state.activeTrivia || !state.activeTrivia.questions[idx]) return;
    const qData = state.activeTrivia.questions[idx];

    if (el.triviaRoundText) el.triviaRoundText.textContent = `Question ${idx + 1} of ${state.activeTrivia.questions.length}`;
    if (el.triviaQuestionText) el.triviaQuestionText.textContent = qData.q;
    if (el.triviaFeedback) el.triviaFeedback.classList.add('hidden');

    if (el.triviaOptionsGrid) {
      el.triviaOptionsGrid.innerHTML = '';
      let hasAnswered = false;

      qData.options.forEach((opt, optIdx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'trivia-opt-btn';
        btn.textContent = opt;

        btn.onclick = () => {
          if (hasAnswered) return;
          hasAnswered = true;
          const isCorrect = optIdx === qData.answer;

          btn.classList.add(isCorrect ? 'correct' : 'wrong');
          if (!isCorrect) {
            const correctBtn = el.triviaOptionsGrid.children[qData.answer];
            if (correctBtn) correctBtn.classList.add('correct');
          }

          if (el.triviaFeedback) {
            el.triviaFeedback.classList.remove('hidden');
            el.triviaFeedback.textContent = isCorrect ? 'Correct! +10 points' : 'Incorrect!';
            el.triviaFeedback.style.color = isCorrect ? '#2ecc71' : '#e74c3c';
          }

          if (state.socket) {
            state.socket.emit('submit-trivia-answer', {
              roomId: state.roomId,
              username: state.username,
              isCorrect,
              points: 10
            });
          }
        };

        el.triviaOptionsGrid.appendChild(btn);
      });
    }

    let timeLeft = 15;
    if (el.triviaTimerCountdown) el.triviaTimerCountdown.textContent = '15s';
    if (el.triviaTimerFill) el.triviaTimerFill.style.width = '100%';

    clearInterval(triviaTimerInterval);
    triviaTimerInterval = setInterval(() => {
      timeLeft--;
      if (el.triviaTimerCountdown) el.triviaTimerCountdown.textContent = `${timeLeft}s`;
      if (el.triviaTimerFill) el.triviaTimerFill.style.width = `${(timeLeft / 15) * 100}%`;

      if (timeLeft <= 0) {
        clearInterval(triviaTimerInterval);
        if (state.isHost) {
          if (idx + 1 < state.activeTrivia.questions.length) {
            setTimeout(() => {
              if (state.socket) state.socket.emit('next-trivia-question', { roomId: state.roomId, questionIndex: idx + 1 });
            }, 1500);
          } else {
            setTimeout(() => {
              if (state.socket) state.socket.emit('end-trivia', { roomId: state.roomId });
            }, 2000);
          }
        }
      }
    }, 1000);
  }

  function renderTriviaScores(scores) {
    if (!el.triviaScoresList) return;
    el.triviaScoresList.innerHTML = '';
    Object.entries(scores).sort((a, b) => b[1] - a[1]).forEach(([name, pts]) => {
      const pill = document.createElement('div');
      pill.className = 'trivia-score-pill';
      pill.innerHTML = `<strong>${name}:</strong> ${pts} pts`;
      el.triviaScoresList.appendChild(pill);
    });
  }

  function finishTriviaRound(scores) {
    clearInterval(triviaTimerInterval);
    if (el.triviaFeedback) {
      el.triviaFeedback.classList.remove('hidden');
      el.triviaFeedback.textContent = 'Round Finished! Great game!';
      el.triviaFeedback.style.color = 'var(--coral)';
    }
    renderTriviaScores(scores);
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

    // Individual Member Volume Button & Popover (for remote participants)
    if (!isSelf) {
      const volBtn = document.createElement('button');
      volBtn.className = 'tile-vol-btn';
      volBtn.title = `Adjust volume for ${member.username}`;
      volBtn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
        </svg>
      `;

      const volPopover = document.createElement('div');
      volPopover.className = 'tile-volume-popover hidden';
      const initialVol = state.participantVolumes.get(member.id) ?? 100;

      volPopover.innerHTML = `
        <div class="tile-volume-header">
          <span>VOLUME</span>
          <span class="tile-vol-val">${initialVol}%</span>
        </div>
        <input type="range" min="0" max="200" step="5" value="${initialVol}" class="tile-vol-slider">
      `;

      volBtn.onclick = (e) => {
        e.stopPropagation();
        document.querySelectorAll('.tile-volume-popover').forEach(p => {
          if (p !== volPopover) p.classList.add('hidden');
        });
        volPopover.classList.toggle('hidden');
      };

      const slider = volPopover.querySelector('.tile-vol-slider');
      const valDisplay = volPopover.querySelector('.tile-vol-val');
      slider.oninput = (e) => {
        const v = parseInt(e.target.value, 10);
        valDisplay.innerText = `${v}%`;
        state.participantVolumes.set(member.id, v);
        const remoteAudio = document.getElementById(`remote-audio-${member.id}`);
        if (remoteAudio) {
          remoteAudio.volume = Math.min(1.0, v / 100);
        }
      };

      tile.appendChild(volBtn);
      tile.appendChild(volPopover);
    }

    // Reattach active video feed (local or remote)
    if (isSelf && state.localVideoTrack && state.isCamOn) {
      video.srcObject = new MediaStream([state.localVideoTrack]);
      video.classList.remove('hidden');
      avatar.classList.add('hidden');
      video.play().catch(() => {});
    } else if (!isSelf) {
      if (member.isCamOn) {
        const stream = getRemoteVideoStream(member.id);
        if (stream) {
          video.muted = true;
          video.defaultMuted = true;
          video.playsInline = true;
          video.autoplay = true;
          video.setAttribute('muted', '');
          video.setAttribute('playsinline', '');
          video.setAttribute('webkit-playsinline', '');
          video.setAttribute('autoplay', '');
          video.srcObject = stream;
          video.classList.remove('hidden');
          avatar.classList.add('hidden');
          video.play().catch(() => {});
        }
      } else {
        video.classList.add('hidden');
        avatar.classList.remove('hidden');
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
      if (member.isCamOn) {
        const stream = getRemoteVideoStream(id);
        if (stream) {
          attachRemoteVideo(id, stream);
        }
      } else {
        detachRemoteVideo(id);
      }
    }
  }

  function updateHostStatusUI() {
    const hostMember = Array.from(state.members.values()).find(m => m.isHost);
    el.hostNameDisplay.innerText = hostMember
      ? (hostMember.id === state.selfId ? 'You (Host)' : `Host: ${hostMember.username}`)
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

  function stopMovieInTheater() {
    state.currentMovie = null;
    state.streamStartTime = 0;
    state.movieDuration = 0;
    state.isLiveStream = false;

    if (el.moviePlayer) {
      el.moviePlayer.pause();
      el.moviePlayer.removeAttribute('src');
      el.moviePlayer.removeAttribute('data-stream-file');
      el.moviePlayer.removeAttribute('data-stream-audio');
      el.moviePlayer.removeAttribute('data-stream-src');
      while (el.moviePlayer.firstChild) {
        el.moviePlayer.removeChild(el.moviePlayer.firstChild);
      }
      try {
        el.moviePlayer.load(); // Resets video element and erases frozen last frame
      } catch (e) {}
    }

    if (el.youtubePlayerBox) {
      el.youtubePlayerBox.classList.add('hidden');
      if (state.ytPlayer && typeof state.ytPlayer.stopVideo === 'function') {
        try { state.ytPlayer.stopVideo(); } catch (e) {}
      }
    }

    if (el.screenSharePlayer) {
      el.screenSharePlayer.srcObject = null;
      try { el.screenSharePlayer.load(); } catch (e) {}
      el.screenSharePlayer.classList.add('hidden');
    }

    if (state.isSharingScreen) {
      stopScreenShare(false);
    }

    if (el.stagePlaceholder) {
      el.stagePlaceholder.classList.remove('hidden');
    }

    if (el.stageUsername) {
      el.stageUsername.textContent = 'Stream';
    }

    if (el.audioPickerGroup) el.audioPickerGroup.classList.remove('hidden');
    if (el.subtitlePickerGroup) el.subtitlePickerGroup.classList.remove('hidden');

    updatePlayPauseIcons(false);
    if (el.timelineProgress) el.timelineProgress.style.width = '0%';
    if (el.timelineThumb) el.timelineThumb.style.left = '0%';
    if (el.timelineBuffered) el.timelineBuffered.style.width = '0%';
    if (el.currentTimeDisplay) el.currentTimeDisplay.innerText = '00:00';
    if (el.durationDisplay) el.durationDisplay.innerText = '00:00';
    if (el.audioTrackSelect) el.audioTrackSelect.innerHTML = '<option value="0">Default</option>';
    if (el.subtitleTrackSelect) el.subtitleTrackSelect.innerHTML = '<option value="off">Off</option>';
    if (el.modalNowPlayingBanner) el.modalNowPlayingBanner.classList.add('hidden');
  }

  function hostStopMovie() {
    stopMovieInTheater();
    if (state.socket) {
      state.socket.emit('host-stop-movie', { roomId: state.roomId });
    }
    showToast('Movie stopped');
  }

  async function loadMovieInTheater(movie, audioTrack = 0, subtitleTrack = 'off', startTime = 0, autoPlay = false) {
    if (!movie) return;

    // 1. YouTube Watch Party Stream
    if (movie.type === 'youtube' || movie.videoId) {
      loadYouTubeInTheater(movie.videoId, startTime, autoPlay);
      return;
    }

    // 2. Direct Web Stream URL
    if (movie.isUrl && movie.url) {
      state.currentMovie = movie;
      state.selectedAudio = 0;
      state.selectedSubtitle = 'off';
      state.streamStartTime = 0;
      state.movieDuration = 0;
      state.isLiveStream = false;

      el.stagePlaceholder.classList.add('hidden');
      if (el.youtubePlayerBox) el.youtubePlayerBox.classList.add('hidden');
      if (el.screenSharePlayer) el.screenSharePlayer.classList.add('hidden');
      if (el.moviePlayer) el.moviePlayer.classList.remove('hidden');

      if (el.modalNowPlayingBanner) el.modalNowPlayingBanner.classList.remove('hidden');
      if (el.modalNowPlayingTitle) el.modalNowPlayingTitle.innerText = movie.filename || 'Direct URL Stream';
      if (el.audioPickerGroup) el.audioPickerGroup.classList.add('hidden');
      if (el.subtitlePickerGroup) el.subtitlePickerGroup.classList.add('hidden');

      el.moviePlayer.setAttribute('data-stream-file', movie.url);
      el.moviePlayer.setAttribute('data-stream-src', movie.url);
      el.moviePlayer.src = movie.url;

      const onUrlMeta = () => {
        if (el.moviePlayer.duration && !isNaN(el.moviePlayer.duration) && isFinite(el.moviePlayer.duration)) {
          state.movieDuration = el.moviePlayer.duration;
          el.durationDisplay.innerText = formatTime(state.movieDuration);
        } else {
          el.durationDisplay.innerText = 'Stream';
        }
        if (startTime > 0) {
          el.moviePlayer.currentTime = startTime;
        }
        if (autoPlay) {
          el.moviePlayer.play().catch(() => {
            el.unmuteMovieBanner?.classList.remove('hidden');
          });
          updatePlayPauseIcons(true);
        } else {
          updatePlayPauseIcons(false);
        }
        el.moviePlayer.removeEventListener('loadedmetadata', onUrlMeta);
      };

      if (el.moviePlayer.readyState >= 1) {
        onUrlMeta();
      } else {
        el.moviePlayer.addEventListener('loadedmetadata', onUrlMeta);
      }
      return;
    }

    // 3. Local Library Movie (FFmpeg Transcoded / Direct Stream)
    if (el.audioPickerGroup) el.audioPickerGroup.classList.remove('hidden');
    if (el.subtitlePickerGroup) el.subtitlePickerGroup.classList.remove('hidden');
    if (el.youtubePlayerBox) el.youtubePlayerBox.classList.add('hidden');
    if (el.screenSharePlayer) el.screenSharePlayer.classList.add('hidden');
    if (el.moviePlayer) el.moviePlayer.classList.remove('hidden');

    state.currentMovie = movie;
    state.selectedAudio = audioTrack;
    state.selectedSubtitle = subtitleTrack;
    state.streamStartTime = startTime || 0;

    el.stagePlaceholder.classList.add('hidden');
    if (el.modalNowPlayingBanner) el.modalNowPlayingBanner.classList.remove('hidden');
    if (el.modalNowPlayingTitle) el.modalNowPlayingTitle.innerText = movie.filename;

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
    if (state.currentMovie?.type === 'youtube' && state.ytPlayer) {
      try {
        const pState = state.ytPlayer.getPlayerState ? state.ytPlayer.getPlayerState() : -1;
        if (pState === 1) { // Playing -> Pause
          state.ytPlayer.pauseVideo();
          updatePlayPauseIcons(false);
          if (state.socket) {
            state.socket.emit('host-youtube-sync', { roomId: state.roomId, action: 'pause', time: state.ytPlayer.getCurrentTime() });
          }
        } else { // Paused / Ended / Other -> Play
          state.ytPlayer.playVideo();
          updatePlayPauseIcons(true);
          if (state.socket) {
            state.socket.emit('host-youtube-sync', { roomId: state.roomId, action: 'play', time: state.ytPlayer.getCurrentTime() });
          }
        }
      } catch (e) {}
      return;
    }

    if (!state.currentMovie) {
      openMovieModal();
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
      if (state.currentMovie?.type === 'youtube' && state.ytPlayer) {
        try {
          const rect = el.timelineContainer.getBoundingClientRect();
          const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
          const dur = state.ytPlayer.getDuration ? state.ytPlayer.getDuration() : 0;
          if (dur > 0) {
            const seekTime = pos * dur;
            state.ytPlayer.seekTo(seekTime, true);
            if (state.socket) {
              state.socket.emit('host-youtube-sync', { roomId: state.roomId, action: 'seek', time: seekTime });
            }
          }
        } catch (e) {}
        return;
      }

      const rect = el.timelineContainer.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const dur = getEffectiveDuration();
      if (dur > 0) {
        const seekTime = pos * dur;
        seekMovie(seekTime);
        if (state.socket) {
          state.socket.emit('host-seek', { roomId: state.roomId, time: seekTime });
        }
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

    player.addEventListener('ended', () => {
      console.log('[Player] Movie ended');
      if (state.isHost) {
        hostStopMovie();
      } else {
        stopMovieInTheater();
      }
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
    if (el.modalNowPlayingBanner) {
      if (state.currentMovie) {
        el.modalNowPlayingBanner.classList.remove('hidden');
        if (el.modalNowPlayingTitle) el.modalNowPlayingTitle.innerText = state.currentMovie.filename;
      } else {
        el.modalNowPlayingBanner.classList.add('hidden');
      }
    }

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
      if (el.moreOptionsMenu) el.moreOptionsMenu.classList.add('hidden');
      if (el.activityMenu) el.activityMenu.classList.add('hidden');
      document.querySelectorAll('.tile-volume-popover').forEach(p => p.classList.add('hidden'));
    });

    // More Options Button & Dropdown Menu (Screenshare, YouTube, Direct URL)
    if (el.moreOptionsBtn) {
      el.moreOptionsBtn.onclick = (e) => {
        e.stopPropagation();
        el.moreOptionsMenu?.classList.toggle('hidden');
        el.micDeviceMenu?.classList.add('hidden');
        el.camDeviceMenu?.classList.add('hidden');
      };
    }
    if (el.moreOptionsMenu) {
      el.moreOptionsMenu.onclick = (e) => e.stopPropagation();
    }
    if (el.menuScreenshareBtn) {
      el.menuScreenshareBtn.onclick = () => {
        el.moreOptionsMenu?.classList.add('hidden');
        toggleScreenShare();
      };
    }
    if (el.menuYouTubeBtn) {
      el.menuYouTubeBtn.onclick = () => {
        el.moreOptionsMenu?.classList.add('hidden');
        openYouTubeModal();
      };
    }
    if (el.menuUrlBtn) {
      el.menuUrlBtn.onclick = () => {
        el.moreOptionsMenu?.classList.add('hidden');
        openUrlModal();
      };
    }

    // Extra Feature Modals (YouTube & URL)
    if (el.closeYouTubeBtn) el.closeYouTubeBtn.onclick = closeYouTubeModal;
    if (el.cancelYouTubeBtn) el.cancelYouTubeBtn.onclick = closeYouTubeModal;
    if (el.youtubeForm) el.youtubeForm.onsubmit = handleYouTubeSubmit;

    if (el.closeUrlBtn) el.closeUrlBtn.onclick = closeUrlModal;
    if (el.cancelUrlBtn) el.cancelUrlBtn.onclick = closeUrlModal;
    if (el.urlForm) el.urlForm.onsubmit = handleUrlSubmit;

    // Activity Button & Menu (Polls, Trivia, Soundboard)
    if (el.activityBtn) {
      el.activityBtn.onclick = (e) => {
        e.stopPropagation();
        el.activityMenu?.classList.toggle('hidden');
        el.micDeviceMenu?.classList.add('hidden');
        el.camDeviceMenu?.classList.add('hidden');
        el.moreOptionsMenu?.classList.add('hidden');
      };
    }
    if (el.activityMenu) {
      el.activityMenu.onclick = (e) => e.stopPropagation();
    }
    if (el.menuPollBtn) {
      el.menuPollBtn.onclick = () => {
        el.activityMenu?.classList.add('hidden');
        openPollModal();
      };
    }
    if (el.menuTriviaBtn) {
      el.menuTriviaBtn.onclick = () => {
        el.activityMenu?.classList.add('hidden');
        openTriviaModal();
      };
    }
    if (el.menuSoundboardBtn) {
      el.menuSoundboardBtn.onclick = () => {
        el.activityMenu?.classList.add('hidden');
        if (el.soundboardModal) el.soundboardModal.classList.remove('hidden');
      };
    }

    // Soundboard Modal
    if (el.closeSoundboardBtn) {
      el.closeSoundboardBtn.onclick = () => {
        el.soundboardModal?.classList.add('hidden');
      };
    }
    if (el.doneSoundboardBtn) {
      el.doneSoundboardBtn.onclick = () => {
        el.soundboardModal?.classList.add('hidden');
      };
    }
    document.querySelectorAll('.soundboard-btn').forEach(btn => {
      btn.onclick = () => {
        const sound = btn.getAttribute('data-sound');
        if (sound) {
          playSoundEffect(sound);
          if (state.socket) {
            state.socket.emit('play-soundboard', { roomId: state.roomId, soundId: sound, senderName: state.username });
          }
        }
      };
    });

    // Subtitle Settings Modal & HUD Controls
    if (el.subtitleSettingsBtn) el.subtitleSettingsBtn.onclick = openSubtitleModal;
    if (el.closeSubtitleModalBtn) el.closeSubtitleModalBtn.onclick = closeSubtitleModal;
    if (el.doneSubtitleBtn) el.doneSubtitleBtn.onclick = closeSubtitleModal;

    document.querySelectorAll('.sub-offset-btn').forEach(btn => {
      btn.onclick = () => {
        const delta = parseFloat(btn.getAttribute('data-delta'));
        if (!isNaN(delta)) adjustSubtitleOffset(delta);
      };
    });
    if (el.subOffsetResetBtn) {
      el.subOffsetResetBtn.onclick = resetSubtitleOffset;
    }
    document.querySelectorAll('.sub-style-btn').forEach(btn => {
      btn.onclick = () => {
        const type = btn.getAttribute('data-style-type');
        if (type) {
          btn.parentElement?.querySelectorAll(`.sub-style-btn[data-style-type="${type}"]`).forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          applySubtitleStyling();
        }
      };
    });
    if (el.customSubFileInput) {
      el.customSubFileInput.onchange = (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          loadExternalSubtitleFile(file);
          closeSubtitleModal();
        }
      };
    }

    // Ambiance, Speed Picker & PiP Controls
    if (el.speedSelect) {
      el.speedSelect.onchange = handleSpeedChange;
    }
    if (el.ambientToggleBtn) {
      el.ambientToggleBtn.onclick = toggleAmbientGlow;
    }
    if (el.menuAmbientGlowBtn) {
      el.menuAmbientGlowBtn.onclick = () => {
        toggleAmbientGlow();
        el.moreOptionsMenu?.classList.add('hidden');
      };
    }
    if (el.pipBtn) {
      el.pipBtn.onclick = togglePictureInPicture;
    }

    // Poll Modal & Poll Widget
    if (el.closePollModalBtn) el.closePollModalBtn.onclick = closePollModal;
    if (el.cancelPollBtn) el.cancelPollBtn.onclick = closePollModal;
    if (el.createPollForm) el.createPollForm.onsubmit = handleCreatePoll;
    if (el.closePollWidgetBtn) {
      el.closePollWidgetBtn.onclick = () => {
        if (state.isHost && state.socket) {
          state.socket.emit('close-poll', { roomId: state.roomId });
        } else {
          el.activePollWidget?.classList.add('hidden');
        }
      };
    }

    // Trivia Modal
    if (el.closeTriviaModalBtn) {
      el.closeTriviaModalBtn.onclick = () => {
        if (state.isHost && state.socket) {
          state.socket.emit('end-trivia', { roomId: state.roomId });
        }
        finishTriviaRound();
      };
    }

    // Audio Processing Constraints Toggles (Noise Suppression, Echo Cancellation)
    if (el.noiseSuppressionToggle) {
      el.noiseSuppressionToggle.onchange = updateAudioProcessingConstraints;
    }
    if (el.echoCancellationToggle) {
      el.echoCancellationToggle.onchange = updateAudioProcessingConstraints;
    }

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
      if (state.currentMovie?.type === 'youtube' && state.ytPlayer) {
        try {
          const t = Math.max(0, state.ytPlayer.getCurrentTime() - 10);
          state.ytPlayer.seekTo(t, true);
          if (state.socket) {
            state.socket.emit('host-youtube-sync', { roomId: state.roomId, action: 'seek', time: t });
          }
          showToast('Rewound 10s');
        } catch (e) {}
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
      if (state.currentMovie?.type === 'youtube' && state.ytPlayer) {
        try {
          const dur = state.ytPlayer.getDuration ? state.ytPlayer.getDuration() : 999999;
          const t = Math.min(dur, state.ytPlayer.getCurrentTime() + 10);
          state.ytPlayer.seekTo(t, true);
          if (state.socket) {
            state.socket.emit('host-youtube-sync', { roomId: state.roomId, action: 'seek', time: t });
          }
          showToast('Forwarded 10s');
        } catch (e) {}
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
      if (el.youtubeModal && !el.youtubeModal.classList.contains('hidden')) {
        return;
      }
      if (el.urlModal && !el.urlModal.classList.contains('hidden')) {
        return;
      }
      if (el.subtitleModal && !el.subtitleModal.classList.contains('hidden')) {
        return;
      }
      if (el.pollModal && !el.pollModal.classList.contains('hidden')) {
        return;
      }
      if (el.triviaModal && !el.triviaModal.classList.contains('hidden')) {
        return;
      }
      if (el.soundboardModal && !el.soundboardModal.classList.contains('hidden')) {
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
      } else if (key === 's' || key === 'S') {
        if (state.isHost && state.currentMovie) {
          e.preventDefault();
          hostStopMovie();
        }
      } else if (key === 'm' || key === 'M') {
        e.preventDefault();
        toggleMute();
      } else if (key === 'p' || key === 'P') {
        e.preventDefault();
        togglePictureInPicture();
      } else if (key === 'a' || key === 'A') {
        e.preventDefault();
        toggleAmbientGlow();
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
    if (el.stopMovieBtn) el.stopMovieBtn.onclick = hostStopMovie;
    if (el.modalStopMovieBtn) {
      el.modalStopMovieBtn.onclick = () => {
        hostStopMovie();
        loadMoviesList();
      };
    }
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

    initAmbientGlow();
    initMobileGestures();
    initSubtitleDragAndDrop();
  }

  // Register PWA Service Worker for mobile standalone display (removes address bar when installed)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }

  window.addEventListener('DOMContentLoaded', init);
})();
