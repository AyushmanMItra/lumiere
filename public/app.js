// ==========================================================================
// STREAM ROOM - DISCORD-STYLE SYNCHRONIZED THEATER & CALL
// ==========================================================================

(() => {
  // Application State
  function updateDocumentTitle(prefix = '') {
    if (state.inRoom) {
      if (prefix) {
        document.title = `${prefix} — Lumière (${state.roomId})`;
      } else {
        document.title = `Lumière — Room ${state.roomId}`;
      }
    } else {
      document.title = 'Lumière — Frame-Accurate Private Cinema & Watch Party';
    }
  }

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
    remoteScreenStream: null,
    screenShareFocus: 'stage',
    screenSharer: null,
    screenSenders: new Map(), // targetId -> RTCRtpSender
    ytPlayer: null,
    isYtSyncing: false,

    // Ambiance, Subtitles & Activities State
    isAmbientOn: true,
    ambientAnimationId: null,
    subOffset: 0.0,
    subFontScale: 100,
    subTextOpacity: 100,
    subBgBlur: 4,
    subColor: '#ffffff',
    dialogueBoosterEnabled: false,
    movieAudioContext: null,
    movieAudioSource: null,
    movieAudioNodes: null,
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
    isLiveStream: false,
    isMiniPlayer: false
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
    usernameInput: document.getElementById('username') || document.getElementById('usernameInput'),
    roomInput: document.getElementById('room-code') || document.getElementById('roomInput'),
    randomRoomBtn: document.querySelector('[data-purpose="randomize-code-btn"]') || document.getElementById('randomRoomBtn'),
    joinRoomBtn: document.querySelector('form[data-purpose="session-form"] button[type="submit"]') || document.getElementById('joinRoomBtn'),
    createRoomBtn: document.querySelector('[data-purpose="create-screening-button"]') || document.getElementById('createRoomBtn'),
    networkBadge: document.querySelector('form[data-purpose="session-form"] strong') || document.getElementById('networkBadge'),

    aboutPage: document.getElementById('aboutPage'),
    navAboutBtn: document.getElementById('navAboutBtn') || document.querySelector('a[href="#about"]'),
    footerAboutBtn: document.getElementById('footerAboutBtn') || document.querySelector('footer a[href="#about"]'),
    aboutBackBtn: document.getElementById('aboutBackBtn'),
    aboutLaunchBtn: document.getElementById('aboutLaunchBtn'),

    feedbackModal: document.getElementById('feedbackModal'),
    navFeedbackBtn: document.getElementById('navFeedbackBtn') || document.querySelector('a[href="#feedback"]'),
    footerFeedbackBtn: document.getElementById('footerFeedbackBtn') || document.querySelector('footer a[href="#feedback"]'),
    closeFeedbackBtn: document.getElementById('closeFeedbackBtn'),
    cancelFeedbackBtn: document.getElementById('cancelFeedbackBtn'),
    feedbackForm: document.getElementById('feedbackForm'),

    supportModal: document.getElementById('supportModal'),
    navSupportBtn: document.getElementById('navSupportBtn') || document.querySelector('a[href="#support"]'),
    footerSupportBtn: document.getElementById('footerSupportBtn') || document.querySelector('footer a[href="#support"]'),
    aboutSupportBtn: document.getElementById('aboutSupportBtn'),
    closeSupportBtn: document.getElementById('closeSupportBtn'),
    copyUpiBtn: document.getElementById('copyUpiBtn'),

    navApkBtn: document.getElementById('navApkBtn') || document.querySelector('a[href*="lumiere.apk"]'),
    androidTvApkCard: document.getElementById('androidTvApkCard'),

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
    stageCenterAvatar: document.getElementById('stageCenterAvatar'),
    stageAvatarMicBadge: document.getElementById('stageAvatarMicBadge'),
    stageStatusPill: document.getElementById('stageStatusPill'),
    stageVoiceStatusText: document.getElementById('stageVoiceStatusText'),
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
    participantStripArea: document.getElementById('participantStripArea'),
    participantTopArea: document.getElementById('participantTopArea'),
    participantStripTop: document.getElementById('participantStripTop'),
    participantStripAudience: document.getElementById('participantStripAudience'),
    stageSpeakersPartition: document.getElementById('stageSpeakersPartition'),
    stageAudiencePartition: document.getElementById('stageAudiencePartition'),
    stageSpeakersHeader: document.getElementById('stageSpeakersHeader'),
    stageSpeakersCount: document.getElementById('stageSpeakersCount'),
    stageAudienceCount: document.getElementById('stageAudienceCount'),
    stageCinemaGroup: document.getElementById('stageCinemaGroup'),

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
    dockScreenShareBtn: document.getElementById('dockScreenShareBtn'),
    layoutToggleBtn: document.getElementById('layoutToggleBtn'),
    dockReactionsGroup: document.getElementById('dockReactionsGroup'),
    dockReactionsBtn: document.getElementById('dockReactionsBtn'),
    dockReactionsTray: document.getElementById('dockReactionsTray'),
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
    menuStreamingBtn: document.getElementById('menuStreamingBtn'),
    menuTransformBtn: document.getElementById('menuTransformBtn'),
    menuTransformTitle: document.getElementById('menuTransformTitle'),
    cinemaStageWrapper: document.getElementById('cinemaStageWrapper'),
    movieWindowTitleBar: document.getElementById('movieWindowTitleBar'),
    movieWindowSizeBadge: document.getElementById('movieWindowSizeBadge'),
    movieWindowResetBtn: document.getElementById('movieWindowResetBtn'),
    movieWindowDockBtn: document.getElementById('movieWindowDockBtn'),
    videoHoldIndicator: document.getElementById('videoHoldIndicator'),
    holdRingProgress: document.getElementById('holdRingProgress'),
    windowSnapGuide: document.getElementById('windowSnapGuide'),
    miniPlayerControls: document.getElementById('miniPlayerControls'),
    miniPlayerPlayPauseBtn: document.getElementById('miniPlayerPlayPauseBtn'),
    miniPlayerMuteBtn: document.getElementById('miniPlayerMuteBtn'),
    exitMiniPlayerBtn: document.getElementById('exitMiniPlayerBtn'),

    screenSharePlayer: document.getElementById('screenSharePlayer'),
    screenSharePipContainer: document.getElementById('screenSharePipContainer'),
    screenShareFocusBtn: document.getElementById('screenShareFocusBtn'),
    screenSharePipVideo: document.getElementById('screenSharePipVideo'),
    screenSharePipLabel: document.getElementById('screenSharePipLabel'),
    youtubePlayerBox: document.getElementById('youtubePlayerBox'),
    youtubeIframe: document.getElementById('youtubeIframe'),
    streamingPlayerBox: document.getElementById('streamingPlayerBox'),
    streamingBackdrop: document.getElementById('streamingBackdrop'),
    streamingPlatformPill: document.getElementById('streamingPlatformPill'),
    streamingPlatformName: document.getElementById('streamingPlatformName'),
    streamingContentTitle: document.getElementById('streamingContentTitle'),
    streamingContentDesc: document.getElementById('streamingContentDesc'),
    streamingLaunchBtn: document.getElementById('streamingLaunchBtn'),
    streamingLaunchText: document.getElementById('streamingLaunchText'),
    streamingShareTabBtn: document.getElementById('streamingShareTabBtn'),
    streamingExtensionBtn: document.getElementById('streamingExtensionBtn'),
    streamingPlayStatus: document.getElementById('streamingPlayStatus'),
    streamingTimeDisplay: document.getElementById('streamingTimeDisplay'),
    streamingDriftStatus: document.getElementById('streamingDriftStatus'),

    streamingModal: document.getElementById('streamingModal'),
    streamingForm: document.getElementById('streamingForm'),
    streamingPlatformSelector: document.getElementById('streamingPlatformSelector'),
    streamingPlatformInput: document.getElementById('streamingPlatformInput'),
    streamingTitleInput: document.getElementById('streamingTitleInput'),
    streamingUrlInput: document.getElementById('streamingUrlInput'),
    openExtGuideBtn: document.getElementById('openExtGuideBtn'),
    cancelStreamingBtn: document.getElementById('cancelStreamingBtn'),
    startStreamingBtn: document.getElementById('startStreamingBtn'),
    closeStreamingBtn: document.getElementById('closeStreamingBtn'),

    extensionModal: document.getElementById('extensionModal'),
    closeExtensionBtn: document.getElementById('closeExtensionBtn'),
    dismissExtensionBtn: document.getElementById('dismissExtensionBtn'),
    extModalRoomCode: document.getElementById('extModalRoomCode'),
    copyExtRoomCodeBtn: document.getElementById('copyExtRoomCodeBtn'),
    downloadExtZipBtn: document.getElementById('downloadExtZipBtn'),

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
    subtitleModal: document.getElementById('subtitlesModal') || document.getElementById('subtitleModal'),
    subtitlesModal: document.getElementById('subtitlesModal') || document.getElementById('subtitleModal'),
    closeSubtitleModalBtn: document.getElementById('closeSubtitleModalBtn'),
    doneSubtitleBtn: document.getElementById('doneSubtitleBtn'),
    subOffsetDisplay: document.getElementById('subOffsetDisplay'),
    subOffsetResetBtn: document.getElementById('subOffsetResetBtn'),
    customSubFileInput: document.getElementById('customSubFileInput'),

    // Subtitle Live Preview & Customization Sliders (Milestone 4)
    subtitlePreviewCard: document.getElementById('subtitlePreviewCard'),
    subtitlePreviewText: document.getElementById('subtitlePreviewText'),
    subtitlePreviewBox: document.getElementById('subtitlePreviewBox'),
    subFontScaleSlider: document.getElementById('subFontScaleSlider'),
    subTextOpacitySlider: document.getElementById('subTextOpacitySlider'),
    subBgBlurSlider: document.getElementById('subBgBlurSlider'),
    subDelaySlider: document.getElementById('subDelaySlider'),
    subFontScaleValue: document.getElementById('subFontScaleValue'),
    subTextOpacityValue: document.getElementById('subTextOpacityValue'),
    subBgBlurValue: document.getElementById('subBgBlurValue'),
    dialogueBoosterToggle: document.getElementById('dialogueBoosterToggle'),

    mobileGestureOverlay: document.getElementById('mobileGestureOverlay'),
    gestureLeftIndicator: document.getElementById('gestureLeftIndicator'),
    gestureRightIndicator: document.getElementById('gestureRightIndicator'),

    noiseSuppressionToggle: document.getElementById('noiseSuppressionToggle'),
    echoCancellationToggle: document.getElementById('echoCancellationToggle'),

    activityGroup: document.getElementById('activityGroup'),
    activityBtn: document.getElementById('activityBtn'),
    activityMenu: document.getElementById('activityMenu'),
    mobileSheetBackdrop: document.getElementById('mobileSheetBackdrop'),
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
      savedUser = localStorage.getItem('lumiere_username');
    } catch (e) {}
    el.usernameInput.value = savedUser || '';

    const pathMatch = window.location.pathname.match(/^\/(?:room|r)\/([a-zA-Z0-9_-]+)/);
    const pathRoom = pathMatch ? pathMatch[1] : null;
    const hashRoom = window.location.hash.replace('#', '').trim();
    const urlParams = new URLSearchParams(window.location.search);
    const queryRoom = urlParams.get('room');
    el.roomInput.value = pathRoom || hashRoom || queryRoom || generateRandomRoomCode();

    try {
      const res = await fetch('/api/info');
      const data = await res.json();
      const ip = data.tailscaleIp || data.localIp;
      if (el.networkBadge) {
        if (el.networkBadge.tagName === 'STRONG') {
          el.networkBadge.innerText = ip || 'Ready';
        } else {
          el.networkBadge.innerText = ip ? `Connected: ${ip}` : 'Engine Ready';
        }
      }
      el.folderHint.innerText = `Folder: ${data.moviesDir}`;
    } catch (e) {
      if (el.networkBadge) {
        if (el.networkBadge.tagName === 'STRONG') {
          el.networkBadge.innerText = 'Ready';
        } else {
          el.networkBadge.innerText = 'Connected';
        }
      }
    }

    try {
      const savedAmbient = localStorage.getItem('lumiere_ambient');
      if (savedAmbient !== null) {
        state.isAmbientOn = (savedAmbient === '1');
      }
    } catch (e) {}
    updateAmbientGlowUI();
    updateStageMicVisuals();

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
        const isAnyModalOpen = Boolean(document.querySelector('.modal-overlay:not(.hidden)'));
        const isAnyMenuOpen = Boolean(document.querySelector('.action-sheet-dropdown:not(.hidden)')) ||
                              (el.micDeviceMenu && !el.micDeviceMenu.classList.contains('hidden')) ||
                              (el.camDeviceMenu && !el.camDeviceMenu.classList.contains('hidden')) ||
                              (el.moreOptionsMenu && !el.moreOptionsMenu.classList.contains('hidden')) ||
                              (el.activityMenu && !el.activityMenu.classList.contains('hidden'));

        if (!state.chatOpen && !isAnyModalOpen && !isAnyMenuOpen) {
          el.appContainer.classList.add('idle-mode');
          el.topBar.classList.add('idle-hidden');
          el.dockWrapper.classList.add('idle-hidden');
        }
      }, 3000);
    };

    state.resetIdleTimer = resetIdleTimer;

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
    state.inRoom = true;
    try {
      history.replaceState(null, '', `/room/${roomId}`);
    } catch (_) {
      window.location.hash = roomId;
    }
    updateDocumentTitle();

    try {
      localStorage.setItem('lumiere_username', username);
    } catch (e) {}

    el.joinModal.classList.add('hidden');
    document.body.classList.add('in-room');
    if (el.aboutPage) el.aboutPage.classList.add('hidden');
    el.appContainer.classList.remove('hidden');
    el.roomTitleDisplay.innerText = `Lumière - ${roomId}`;
    el.stageUsername.innerText = username;

    // 1. Start in clean media playback mode (no eager mic capture holding phone in Call/Earpiece mode)
    state.isMicMuted = true;
    state.localAudioTrack = null;
    state.localStream = null;
    updateStageMicVisuals();
    enumerateMediaDevices().catch(() => {});

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
      playUIAudio('room-join');
      state.selfId = data.selfId;
      state.isHost = data.isHost;
      state.inRoom = true;

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
        if (data.currentMovie.type === 'streaming') {
          loadStreamingInTheater(data.currentMovie.platform, data.currentMovie.title, data.currentMovie.url, data.currentTime, data.isPlaying);
        } else {
          loadMovieInTheater(data.currentMovie, data.audioTrack, data.subtitleTrack, data.currentTime, data.isPlaying);
        }
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
      if (state.currentMovie?.type === 'streaming' || state.currentMovie?.type === 'youtube') return;
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
      if (state.currentMovie?.type === 'streaming' || state.currentMovie?.type === 'youtube') return;
      el.moviePlayer.pause();
      el.moviePlayer.playbackRate = 1.0;
      updatePlayPauseIcons(false);
      // Gentle pause: never force seek unless drift is massive (> 3.5s) to preserve buffer
      if (Math.abs(getEffectiveCurrentTime() - time) > 3.5) {
        seekMovie(time);
      }
    });

    s.on('sync-seek', ({ time }) => {
      if (state.currentMovie?.type === 'streaming' || state.currentMovie?.type === 'youtube') return;
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

    // Streaming Platform Socket Synchronization (Netflix, Prime Video, JioHotstar, Zee5, etc.)
    s.on('sync-streaming-changed', ({ platform, title, url, sharerName }) => {
      loadStreamingInTheater(platform, title, url, 0, true);
      showToast(`${sharerName || 'Host'} loaded ${platform ? platform.toUpperCase() : 'Streaming'}: ${title}`);
    });

    s.on('sync-streaming-action', ({ action, time }) => {
      if (!state.currentMovie || state.currentMovie.type !== 'streaming') return;
      if (action === 'play') {
        updateStreamingPlaybackState(true, time);
      } else if (action === 'pause') {
        updateStreamingPlaybackState(false, time);
      } else if (action === 'rewind10' || action === 'forward10' || action === 'seek') {
        updateStreamingPlaybackState(state.streamingIsPlaying, time);
      } else if (typeof time === 'number') {
        updateStreamingPlaybackState(state.streamingIsPlaying, time);
      }
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
      if (el.streamingPlayerBox) el.streamingPlayerBox.classList.add('hidden');
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
      state.remoteScreenStream = null;
      state.screenShareFocus = 'stage';
      if (el.screenSharePipContainer) {
        el.screenSharePipContainer.classList.add('hidden');
        el.screenSharePipContainer.classList.remove('pip-showing-screen', 'pip-showing-camera');
      }
      if (el.screenSharePipVideo) {
        el.screenSharePipVideo.srcObject = null;
      }
      if (el.screenShareFocusBtn) {
        el.screenShareFocusBtn.classList.remove('active');
      }
      if (el.screenSharePlayer) {
        el.screenSharePlayer.srcObject = null;
        try { el.screenSharePlayer.load(); } catch (e) {}
        el.screenSharePlayer.classList.add('hidden');
      }
      if (state.currentMovie) {
        if (state.currentMovie.type === 'youtube') {
          if (el.youtubePlayerBox) el.youtubePlayerBox.classList.remove('hidden');
        } else if (state.currentMovie.type === 'streaming') {
          if (el.streamingPlayerBox) el.streamingPlayerBox.classList.remove('hidden');
        } else {
          if (el.moviePlayer) {
        el.moviePlayer.classList.remove('hidden');
        initMovieAudioEngine(el.moviePlayer);
      }
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
        if (el.streamingPlayerBox) el.streamingPlayerBox.classList.add('hidden');
        if (el.stageUsername) el.stageUsername.textContent = `${screenShare.sharerName}'s Screen`;
        return;
      }

      if (!currentMovie) {
        if (state.currentMovie) {
          stopMovieInTheater();
        }
        return;
      }

      if (currentMovie.type === 'streaming') {
        if (!state.currentMovie || state.currentMovie.type !== 'streaming' || state.currentMovie.platform !== currentMovie.platform || state.currentMovie.title !== currentMovie.title) {
          loadStreamingInTheater(currentMovie.platform, currentMovie.title, currentMovie.url, currentTime, isPlaying);
        } else {
          updateStreamingPlaybackState(isPlaying, currentTime);
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
        if (tile) {
          tile.classList.toggle('is-speaking', isSpeaking);
          tile.classList.toggle('stage-speaking-halo', isSpeaking);
        }
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

  async function enableMicrophone() {
    if (!isSecureConnection()) {
      showToast('Microphone requires HTTPS (Port 3443)', 'error');
      return false;
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;

      const audioConstraints = {
        echoCancellation: !!el.echoCancellationToggle ? el.echoCancellationToggle.checked : true,
        noiseSuppression: !!el.noiseSuppressionToggle ? el.noiseSuppressionToggle.checked : true,
        autoGainControl: true
      };
      if (state.selectedMicDeviceId) {
        audioConstraints.deviceId = { exact: state.selectedMicDeviceId };
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false
      });

      state.localStream = stream;
      state.localAudioTrack = stream.getAudioTracks()[0];
      if (state.localAudioTrack) {
        state.localAudioTrack.enabled = true;
      }

      setupSpeakingDetector(stream);
      enumerateMediaDevices().catch(() => {});

      // Attach track to all existing WebRTC peer connections
      for (const pc of state.peerConnections.values()) {
        const senders = pc.getSenders();
        const audioSender = senders.find(s => s.track && s.track.kind === 'audio') ||
                            senders.find(s => !s.track);
        if (audioSender) {
          audioSender.replaceTrack(state.localAudioTrack).catch(() => {});
        } else {
          try { pc.addTrack(state.localAudioTrack, stream); } catch (e) {}
        }
      }
      console.log('[Media] Microphone activated on-demand');
      return true;
    } catch (err) {
      console.warn('Microphone activation failed:', err.message);
      showToast('Could not access microphone', 'error');
      return false;
    }
  }

  function disableMicrophone() {
    if (state.localAudioTrack) {
      try {
        state.localAudioTrack.enabled = false;
        state.localAudioTrack.stop(); // Stops hardware recording immediately, releasing phone from Call Mode!
      } catch (e) {}
      state.localAudioTrack = null;
    }

    if (state.localStream) {
      try {
        state.localStream.getTracks().forEach(t => t.stop());
      } catch (e) {}
      state.localStream = null;
    }

    teardownSpeakingDetector();

    // Detach track from all existing peer connections so silent audio is not held
    for (const pc of state.peerConnections.values()) {
      const senders = pc.getSenders();
      const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
      if (audioSender) {
        audioSender.replaceTrack(null).catch(() => {});
      }
    }
    console.log('[Media] Microphone stopped and hardware released (Normal Media mode active)');
  }

  function setupSpeakingDetector(stream) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const audioCtx = new AudioCtx();
      state.speakingAudioContext = audioCtx;
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

  function teardownSpeakingDetector() {
    if (state.speakingInterval) {
      clearInterval(state.speakingInterval);
      state.speakingInterval = null;
    }
    if (state.isSpeaking) {
      state.isSpeaking = false;
      setLocalSpeaking(false);
    }
    if (state.speakingAudioContext) {
      try {
        state.speakingAudioContext.close().catch(() => {});
      } catch (e) {}
      state.speakingAudioContext = null;
    }
  }

  function setLocalSpeaking(isSpeaking) {
    const tile = document.getElementById(`participant-tile-${state.selfId}`);
    if (tile) {
      tile.classList.toggle('is-speaking', isSpeaking);
      tile.classList.toggle('stage-speaking-halo', isSpeaking);
    }
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
    if (state.localAudioTrack && !state.isMicMuted) {
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
          if (typeof a.setSinkId === 'function') {
            a.setSinkId('').catch(() => {});
          }
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
        el.toggleCameraBtn.classList.add('active-status-ring', 'ring-camera');
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
      el.toggleCameraBtn.classList.remove('active-status-ring', 'ring-camera');
      el.camOnIcon.classList.add('hidden');
      el.camOffIcon.classList.remove('hidden');

      if (state.socket) {
        state.socket.emit('update-cam-status', { roomId: state.roomId, isCamOn: false });
      }
    }
  }

  // Toggle Microphone
  async function toggleMicrophone() {
    if (state.isMicMuted) {
      // User tapped to UNMUTE -> activate microphone on-demand
      const ok = await enableMicrophone();
      if (!ok) return;
      state.isMicMuted = false;
      playUIAudio('mic-unmute');
    } else {
      // User tapped to MUTE -> release microphone hardware immediately so phone stays in Media Loudspeaker mode
      disableMicrophone();
      state.isMicMuted = true;
      playUIAudio('mic-mute');
    }

    if (state.isMicMuted) {
      el.toggleMicBtn.classList.add('pill-btn-muted');
      el.toggleMicBtn.classList.remove('active-status-ring', 'ring-speaking');
      el.micOnIcon.classList.add('hidden');
      el.micOffIcon.classList.remove('hidden');
      setLocalSpeaking(false);
    } else {
      el.toggleMicBtn.classList.remove('pill-btn-muted');
      el.toggleMicBtn.classList.add('active-status-ring', 'ring-speaking');
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

    // Update Stage Center Avatar halo and mic badge
    updateStageMicVisuals();

    if (state.socket) {
      state.socket.emit('update-mic-status', { roomId: state.roomId, isMuted: state.isMicMuted });
    }

    showToast(state.isMicMuted ? 'Microphone Muted (Media Speaker Active)' : 'Microphone Active');
  }

  function updateStageMicVisuals() {
    const isMuted = !!state.isMicMuted;
    if (el.stageCenterAvatar) {
      el.stageCenterAvatar.classList.toggle('mic-muted', isMuted);
      el.stageCenterAvatar.classList.toggle('mic-open', !isMuted);
    }
    if (el.stageAvatarMicBadge) {
      el.stageAvatarMicBadge.setAttribute('title', isMuted ? 'Microphone Muted - Click to Unmute' : 'Microphone Active - Click to Mute');
    }
    if (el.stageStatusPill) {
      el.stageStatusPill.classList.toggle('is-muted', isMuted);
    }
    if (el.stageVoiceStatusText) {
      el.stageVoiceStatusText.textContent = isMuted ? 'STAGE VOICE CHANNEL • MUTED' : 'STAGE VOICE CHANNEL • MIC ACTIVE';
    }
    if (el.stageMicIcon) {
      el.stageMicIcon.classList.toggle('muted', isMuted);
    }
  }

  // ==========================================================================
  // WEBRTC SCREEN SHARING ENGINE
  // ==========================================================================

  function updateScreenShareMenuUI() {
    if (el.dockScreenShareBtn) {
      el.dockScreenShareBtn.classList.toggle('active-status-ring', !!state.isSharingScreen);
      el.dockScreenShareBtn.classList.toggle('ring-screenshare', !!state.isSharingScreen);
    }
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
      if (el.streamingPlayerBox) el.streamingPlayerBox.classList.add('hidden');
      if (el.stageUsername) el.stageUsername.textContent = `${state.username}'s Screen`;

      // Initialize Screen Share PiP container
      state.screenShareFocus = 'stage';
      if (el.screenSharePipContainer) {
        el.screenSharePipContainer.classList.remove('hidden');
        el.screenSharePipContainer.classList.add('pip-showing-camera');
        el.screenSharePipContainer.classList.remove('pip-showing-screen');
      }
      if (el.screenSharePipLabel) {
        el.screenSharePipLabel.textContent = 'Active Speaker';
      }
      if (el.screenShareFocusBtn) {
        el.screenShareFocusBtn.classList.remove('active');
      }
      if (el.screenSharePipVideo) {
        let activeCamStream = (state.isCamOn && state.localVideoStream) ? state.localVideoStream : null;
        if (!activeCamStream) {
          for (const [id, s] of state.remoteStreams.entries()) {
            if (s && s.getVideoTracks().length > 0) {
              activeCamStream = s;
              break;
            }
          }
        }
        el.screenSharePipVideo.srcObject = activeCamStream;
        if (activeCamStream) el.screenSharePipVideo.play().catch(() => {});
      }

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
    state.remoteScreenStream = null;
    state.screenShareFocus = 'stage';
    updateScreenShareMenuUI();

    if (el.screenSharePipContainer) {
      el.screenSharePipContainer.classList.add('hidden');
      el.screenSharePipContainer.classList.remove('pip-showing-screen', 'pip-showing-camera');
    }
    if (el.screenSharePipVideo) {
      el.screenSharePipVideo.srcObject = null;
    }
    if (el.screenShareFocusBtn) {
      el.screenShareFocusBtn.classList.remove('active');
    }

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
      } else if (state.currentMovie.type === 'streaming') {
        if (el.streamingPlayerBox) el.streamingPlayerBox.classList.remove('hidden');
      } else {
        if (el.moviePlayer) {
        el.moviePlayer.classList.remove('hidden');
        initMovieAudioEngine(el.moviePlayer);
      }
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
    state.remoteScreenStream = stream;
    state.screenShareFocus = 'stage';
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
    if (el.streamingPlayerBox) el.streamingPlayerBox.classList.add('hidden');
    const sharerName = state.screenSharer?.sharerName || state.members.get(targetId)?.username || 'Remote User';
    if (el.stageUsername) el.stageUsername.textContent = `${sharerName}'s Screen`;

    // Initialize Screen Share PiP container for remote share
    if (el.screenSharePipContainer) {
      el.screenSharePipContainer.classList.remove('hidden');
      el.screenSharePipContainer.classList.add('pip-showing-camera');
      el.screenSharePipContainer.classList.remove('pip-showing-screen');
    }
    if (el.screenSharePipLabel) {
      el.screenSharePipLabel.textContent = 'Active Speaker';
    }
    if (el.screenShareFocusBtn) {
      el.screenShareFocusBtn.classList.remove('active');
    }
    if (el.screenSharePipVideo) {
      let activeCamStream = (state.isCamOn && state.localVideoStream) ? state.localVideoStream : null;
      if (!activeCamStream) {
        for (const [id, s] of state.remoteStreams.entries()) {
          if (s && s.getVideoTracks().length > 0) {
            activeCamStream = s;
            break;
          }
        }
      }
      el.screenSharePipVideo.srcObject = activeCamStream;
      if (activeCamStream) el.screenSharePipVideo.play().catch(() => {});
    }
  }

  function swapScreenShareFocus() {
    const activeStream = state.screenStream || state.remoteScreenStream || (el.screenSharePlayer ? el.screenSharePlayer.srcObject : null);
    if (!activeStream) {
      showToast('No active screen share to swap focus', 'info');
      return;
    }

    state.screenShareFocus = (state.screenShareFocus === 'pip') ? 'stage' : 'pip';
    const isPip = (state.screenShareFocus === 'pip');

    if (isPip) {
      // Screen share moved to PiP container; center stage focused on webcam/movie
      if (el.screenSharePipContainer) {
        el.screenSharePipContainer.classList.remove('hidden');
        el.screenSharePipContainer.classList.add('pip-showing-screen');
        el.screenSharePipContainer.classList.remove('pip-showing-camera');
      }
      if (el.screenSharePipLabel) {
        el.screenSharePipLabel.textContent = 'Screen Share (PiP)';
      }
      if (el.screenSharePipVideo) {
        el.screenSharePipVideo.srcObject = activeStream;
        el.screenSharePipVideo.play().catch(() => {});
      }

      if (el.screenSharePlayer) {
        el.screenSharePlayer.classList.add('hidden');
      }
      if (state.currentMovie) {
        if (state.currentMovie.type === 'youtube' && el.youtubePlayerBox) {
          el.youtubePlayerBox.classList.remove('hidden');
        } else if (state.currentMovie.type === 'streaming' && el.streamingPlayerBox) {
          el.streamingPlayerBox.classList.remove('hidden');
        } else if (el.moviePlayer) {
          el.moviePlayer.classList.remove('hidden');
        }
      } else if (el.stagePlaceholder) {
        el.stagePlaceholder.classList.remove('hidden');
      }
      showToast('Focused webcam/stage view (Screen Share in PiP)');
    } else {
      // Screen share moved to center stage; PiP shows webcam/active speaker
      if (el.screenSharePlayer) {
        el.screenSharePlayer.srcObject = activeStream;
        el.screenSharePlayer.classList.remove('hidden');
        el.screenSharePlayer.play().catch(() => {});
      }
      if (el.moviePlayer) el.moviePlayer.classList.add('hidden');
      if (el.stagePlaceholder) el.stagePlaceholder.classList.add('hidden');
      if (el.youtubePlayerBox) el.youtubePlayerBox.classList.add('hidden');
      if (el.streamingPlayerBox) el.streamingPlayerBox.classList.add('hidden');

      if (el.screenSharePipContainer) {
        el.screenSharePipContainer.classList.remove('hidden');
        el.screenSharePipContainer.classList.add('pip-showing-camera');
        el.screenSharePipContainer.classList.remove('pip-showing-screen');
      }
      if (el.screenSharePipLabel) {
        el.screenSharePipLabel.textContent = 'Active Speaker';
      }

      let activeCamStream = (state.isCamOn && state.localVideoStream) ? state.localVideoStream : null;
      if (!activeCamStream) {
        for (const [id, s] of state.remoteStreams.entries()) {
          if (s && s.getVideoTracks().length > 0) {
            activeCamStream = s;
            break;
          }
        }
      }
      if (el.screenSharePipVideo) {
        el.screenSharePipVideo.srcObject = activeCamStream;
        if (activeCamStream) el.screenSharePipVideo.play().catch(() => {});
      }
      showToast('Focused Screen Share on Center Stage');
    }

    if (el.screenShareFocusBtn) {
      el.screenShareFocusBtn.classList.toggle('active', isPip);
    }
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
  // STREAMING WATCH PARTY ENGINE (Netflix, Prime Video, JioHotstar, Zee5, etc.)
  // ==========================================================================

  const STREAMING_PLATFORMS = {
    netflix: { name: 'Netflix', color: '#E50914', defaultUrl: 'https://www.netflix.com' },
    primevideo: { name: 'Prime Video', color: '#00A8E1', defaultUrl: 'https://www.primevideo.com' },
    jiohotstar: { name: 'JioHotstar', color: '#0C6EFD', defaultUrl: 'https://www.hotstar.com' },
    zee5: { name: 'Zee5', color: '#8230C6', defaultUrl: 'https://www.zee5.com' },
    disneyplus: { name: 'Disney+', color: '#113CCF', defaultUrl: 'https://www.disneyplus.com' },
    sonyliv: { name: 'SonyLIV', color: '#1F4A85', defaultUrl: 'https://www.sonyliv.com' }
  };

  function openStreamingModal() {
    if (el.streamingModal) {
      el.streamingModal.classList.remove('hidden');
      if (el.streamingTitleInput) {
        el.streamingTitleInput.value = '';
        setTimeout(() => el.streamingTitleInput.focus(), 80);
      }
      if (el.streamingUrlInput) {
        el.streamingUrlInput.value = '';
      }
    }
  }

  function closeStreamingModal() {
    if (el.streamingModal) el.streamingModal.classList.add('hidden');
  }

  function openExtensionModal() {
    if (el.extensionModal) {
      if (el.extModalRoomCode) {
        el.extModalRoomCode.textContent = state.roomId || '---';
      }
      el.extensionModal.classList.remove('hidden');
    }
  }

  function closeExtensionModal() {
    if (el.extensionModal) el.extensionModal.classList.add('hidden');
  }

  function handleStreamingSubmit(e) {
    if (e) e.preventDefault();
    const platform = (el.streamingPlatformInput?.value || 'netflix').toLowerCase();
    const platInfo = STREAMING_PLATFORMS[platform] || { name: platform.toUpperCase(), defaultUrl: '' };
    const titleVal = el.streamingTitleInput?.value?.trim();
    const title = titleVal || `${platInfo.name} Party`;
    const url = el.streamingUrlInput?.value?.trim() || platInfo.defaultUrl || '';

    closeStreamingModal();

    if (state.socket) {
      state.socket.emit('host-set-streaming', {
        roomId: state.roomId,
        platform,
        title,
        url
      });
    }

    loadStreamingInTheater(platform, title, url, 0, true);
  }

  function updateStreamingPlaybackState(isPlaying, time) {
    state.streamingIsPlaying = !!isPlaying;
    if (typeof time === 'number' && !isNaN(time) && time >= 0) {
      state.streamingCurrentTime = time;
    }

    if (el.streamingPlayStatus) {
      el.streamingPlayStatus.textContent = state.streamingIsPlaying ? 'Playing' : 'Paused';
    }
    if (el.streamingTimeDisplay) {
      el.streamingTimeDisplay.textContent = formatTime(state.streamingCurrentTime || 0);
    }
    if (el.currentTimeDisplay) {
      el.currentTimeDisplay.innerText = formatTime(state.streamingCurrentTime || 0);
    }

    updatePlayPauseIcons(state.streamingIsPlaying);

    if (state.streamingTicker) {
      clearInterval(state.streamingTicker);
      state.streamingTicker = null;
    }

    if (state.streamingIsPlaying) {
      state.streamingTicker = setInterval(() => {
        state.streamingCurrentTime = (state.streamingCurrentTime || 0) + 1;
        if (el.streamingTimeDisplay) {
          el.streamingTimeDisplay.textContent = formatTime(state.streamingCurrentTime);
        }
        if (el.currentTimeDisplay) {
          el.currentTimeDisplay.innerText = formatTime(state.streamingCurrentTime);
        }
      }, 1000);
    }
  }

  function loadStreamingInTheater(platform, title, url, startTime = 0, isPlaying = true) {
    const platformKey = (platform || 'netflix').toLowerCase();
    const platInfo = STREAMING_PLATFORMS[platformKey] || { name: platformKey.toUpperCase(), color: '#E50914', defaultUrl: '' };
    const movieTitle = title || `${platInfo.name} Party`;
    const movieUrl = url || platInfo.defaultUrl || '';

    state.currentMovie = {
      type: 'streaming',
      platform: platformKey,
      title: movieTitle,
      url: movieUrl,
      filename: `${platInfo.name}: ${movieTitle}`
    };

    if (el.moviePlayer) {
      el.moviePlayer.pause();
      el.moviePlayer.classList.add('hidden');
    }
    if (el.screenSharePlayer) {
      el.screenSharePlayer.classList.add('hidden');
    }
    if (el.youtubePlayerBox) {
      el.youtubePlayerBox.classList.add('hidden');
      if (state.ytPlayer && typeof state.ytPlayer.stopVideo === 'function') {
        try { state.ytPlayer.stopVideo(); } catch (e) {}
      }
    }
    if (el.stagePlaceholder) {
      el.stagePlaceholder.classList.add('hidden');
    }

    if (el.streamingPlayerBox) {
      el.streamingPlayerBox.classList.remove('hidden');
    }

    if (el.streamingBackdrop) {
      el.streamingBackdrop.className = `streaming-backdrop bg-${platformKey}`;
    }

    if (el.streamingPlatformPill) {
      const dot = el.streamingPlatformPill.querySelector('.streaming-platform-dot');
      if (dot) dot.style.background = platInfo.color;
    }
    if (el.streamingPlatformName) {
      el.streamingPlatformName.textContent = platInfo.name;
    }
    if (el.streamingContentTitle) {
      el.streamingContentTitle.textContent = movieTitle;
    }

    if (el.streamingLaunchBtn) {
      el.streamingLaunchBtn.href = movieUrl || platInfo.defaultUrl || '#';
      if (el.streamingLaunchText) {
        el.streamingLaunchText.textContent = `Open in ${platInfo.name}`;
      }
    }

    if (el.stageUsername) {
      el.stageUsername.textContent = platInfo.name;
    }
    if (el.durationDisplay) {
      el.durationDisplay.innerText = 'Streaming';
    }

    if (el.modalNowPlayingBanner) {
      el.modalNowPlayingBanner.classList.remove('hidden');
    }
    if (el.modalNowPlayingTitle) {
      el.modalNowPlayingTitle.innerText = state.currentMovie.filename;
    }
    if (el.audioPickerGroup) el.audioPickerGroup.classList.add('hidden');
    if (el.subtitlePickerGroup) el.subtitlePickerGroup.classList.add('hidden');

    updateStreamingPlaybackState(isPlaying, startTime || 0);
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

    let lastSampleTime = 0;
    const sampleFrame = (timestamp) => {
      state.ambientAnimationId = requestAnimationFrame(sampleFrame);

      if (!state.isAmbientOn || document.hidden) return;
      if (timestamp && (timestamp - lastSampleTime < 50)) return; // Cap sampling at ~20fps to conserve mobile battery
      lastSampleTime = timestamp || 0;

      if (el.moviePlayer && !el.moviePlayer.paused && !el.moviePlayer.ended && el.moviePlayer.readyState >= 2) {
        try {
          ctx.drawImage(el.moviePlayer, 0, 0, canvas.width, canvas.height);
        } catch (e) {}
      } else if (el.screenSharePlayer && !el.screenSharePlayer.paused && el.screenSharePlayer.readyState >= 2) {
        try {
          ctx.drawImage(el.screenSharePlayer, 0, 0, canvas.width, canvas.height);
        } catch (e) {}
      }
    };

    updateAmbientGlowUI();
    sampleFrame(0);
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
      if (e.target.closest('button, select, input, a, .hud-timeline-container, .device-menu, .active-poll-widget, .window-title-bar, .window-resize-handle')) {
        return;
      }

      const currentTime = Date.now();
      const tapLength = currentTime - lastTapTime;
      const touch = e.changedTouches[0];
      if (typeof windowManager !== 'undefined' && windowManager.suppressClick) {
        windowManager.suppressClick = false;
        return;
      }
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
        if (state.resetIdleTimer) state.resetIdleTimer();
        e.preventDefault(); // Prevents synthetic click from opening modals or accidental pause

        // Toggle the Cinema HUD visibility so mobile users can easily access and tap all controls
        if (el.cinemaControls && state.currentMovie) {
          const isCurrentlyActive = el.cinemaControls.classList.contains('active');
          if (isCurrentlyActive) {
            el.cinemaControls.classList.remove('active');
            clearTimeout(hudHideTimeout);
          } else {
            el.cinemaControls.classList.add('active');
            clearTimeout(hudHideTimeout);
            hudHideTimeout = setTimeout(() => {
              if (el.cinemaControls && !el.cinemaControls.contains(document.activeElement)) {
                el.cinemaControls.classList.remove('active');
              }
            }, 4500);
          }
        }
      }

      lastTapTime = currentTime;
      lastTapX = tapX;
    }, { passive: false });

    // Keep HUD open while user is touching, scrolling or interacting with HUD buttons/selects
    if (el.cinemaControls) {
      const extendHudTimer = () => {
        if (!el.cinemaControls.classList.contains('active')) return;
        clearTimeout(hudHideTimeout);
        hudHideTimeout = setTimeout(() => {
          if (el.cinemaControls && !el.cinemaControls.contains(document.activeElement)) {
            el.cinemaControls.classList.remove('active');
          }
        }, 4500);
      };
      ['touchstart', 'touchmove', 'click', 'input', 'change'].forEach(evt => {
        el.cinemaControls.addEventListener(evt, extendHudTimer, { passive: true });
      });
    }
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
  // WINDOWS-STYLE RESIZABLE & REPOSITIONABLE WINDOW MANAGER
  // (Supports both Entire Movie Screen and Participant Webcam Videos)
  // ==========================================================================

  const windowManager = {
    highestZIndex: 1250,
    suppressClick: false
  };

  const SNAP_DISTANCE = 32;
  let activeSnapTarget = null;

  function calculateWindowSnap(desiredLeft, desiredTop, wWidth, wHeight, winW, winH) {
    const snapEdges = {
      left: 16,
      top: 54,
      right: Math.max(16, winW - wWidth - 16),
      bottom: Math.max(54, winH - wHeight - 74)
    };

    let snappedLeft = null;
    let snappedTop = null;

    if (Math.abs(desiredLeft - snapEdges.left) <= SNAP_DISTANCE) {
      snappedLeft = snapEdges.left;
    } else if (Math.abs(desiredLeft - snapEdges.right) <= SNAP_DISTANCE) {
      snappedLeft = snapEdges.right;
    }

    if (Math.abs(desiredTop - snapEdges.top) <= SNAP_DISTANCE) {
      snappedTop = snapEdges.top;
    } else if (Math.abs(desiredTop - snapEdges.bottom) <= SNAP_DISTANCE) {
      snappedTop = snapEdges.bottom;
    }

    if (snappedLeft !== null || snappedTop !== null) {
      return {
        isSnapped: true,
        snapX: snappedLeft !== null ? snappedLeft : Math.max(10, Math.min(winW - wWidth - 10, desiredLeft)),
        snapY: snappedTop !== null ? snappedTop : Math.max(10, Math.min(winH - 60, desiredTop))
      };
    }

    return {
      isSnapped: false,
      snapX: null,
      snapY: null
    };
  }

  function updateWindowSnapGuide(snapResult, wWidth, wHeight) {
    const guide = el.windowSnapGuide || document.getElementById('windowSnapGuide');
    if (!guide) return;

    if (snapResult && snapResult.isSnapped) {
      guide.style.left = `${Math.round(snapResult.snapX)}px`;
      guide.style.top = `${Math.round(snapResult.snapY)}px`;
      guide.style.width = `${Math.round(wWidth)}px`;
      guide.style.height = `${Math.round(wHeight)}px`;
      guide.classList.remove('hidden');
      guide.style.opacity = '1';
      activeSnapTarget = { left: snapResult.snapX, top: snapResult.snapY };
    } else {
      guide.classList.add('hidden');
      guide.style.opacity = '0';
      activeSnapTarget = null;
    }
  }

  function applyWindowSnapOnRelease(targetWindow) {
    const guide = el.windowSnapGuide || document.getElementById('windowSnapGuide');
    if (guide) {
      guide.classList.add('hidden');
      guide.style.opacity = '0';
    }

    if (activeSnapTarget && targetWindow) {
      targetWindow.style.transition = 'left 0.18s cubic-bezier(0.2, 0.8, 0.2, 1), top 0.18s cubic-bezier(0.2, 0.8, 0.2, 1)';
      targetWindow.style.left = `${Math.round(activeSnapTarget.left)}px`;
      targetWindow.style.top = `${Math.round(activeSnapTarget.top)}px`;
      setTimeout(() => {
        targetWindow.style.transition = '';
      }, 200);
      activeSnapTarget = null;
    }
  }

  const WINDOW_HOLD_DURATION_MS = 1000;
  const HOLD_INDICATOR_DELAY_MS = 200;

  function bringWindowToFront(win) {
    if (!win) return;
    windowManager.highestZIndex += 2;
    win.style.zIndex = windowManager.highestZIndex;
  }

  function initWindowManagement() {
    initMovieWindowHandlers();
    loadSavedMovieWindowLayout();

    window.addEventListener('popstate', () => {
      if (window.location.pathname === '/about') {
        if (el.aboutPage) el.aboutPage.classList.remove('hidden');
      } else if (window.location.pathname === '/' && state.inRoom) {
        window.location.reload();
      } else if (!state.inRoom && el.aboutPage) {
        el.aboutPage.classList.add('hidden');
      }
    });

    window.addEventListener('resize', () => {
      const stage = el.cinemaStageWrapper;
      if (stage && stage.classList.contains('is-floating-window')) {
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        let w = stage.offsetWidth;
        let h = stage.offsetHeight;
        let l = parseInt(stage.style.left, 10) || 20;
        let t = parseInt(stage.style.top, 10) || 50;

        if (w > winW - 20) {
          w = Math.max(360, winW - 20);
          stage.style.width = `${w}px`;
        }
        if (h > winH - 60) {
          h = Math.max(220, winH - 60);
          stage.style.height = `${h}px`;
        }
        const maxL = Math.max(10, winW - w - 10);
        const maxT = Math.max(10, winH - 60);
        stage.style.left = `${Math.max(10, Math.min(maxL, l))}px`;
        stage.style.top = `${Math.max(10, Math.min(maxT, t))}px`;
      }
    });
  }

  function initMovieWindowHandlers() {
    const stage = el.cinemaStageWrapper;
    const box = el.cinemaBox;
    if (!stage || !box) return;

    const titleBar = el.movieWindowTitleBar;
    if (titleBar) {
      titleBar.addEventListener('mousedown', (e) => handleDragStart(e, stage));
      titleBar.addEventListener('touchstart', (e) => handleDragStart(e, stage), { passive: false });

      if (el.movieWindowDockBtn) {
        el.movieWindowDockBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          dockMovieWindow();
        });
      }
      if (el.movieWindowResetBtn) {
        el.movieWindowResetBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          resetMovieWindowSize();
        });
      }
    }

    const handles = stage.querySelectorAll('.window-resize-handle');
    handles.forEach(h => {
      const dir = h.getAttribute('data-direction');
      h.addEventListener('mousedown', (e) => handleResizeStart(e, stage, dir));
      h.addEventListener('touchstart', (e) => handleResizeStart(e, stage, dir), { passive: false });
    });

    // Hold on cinemaBox (1000ms) to pop out when docked, or drag anywhere to reposition when floating.
    let movieHoldTimer = null;
    let movieIndicatorTimer = null;
    let movieHoldStartX = 0;
    let movieHoldStartY = 0;
    let isFloatingDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragGrabOffsetX = 0;
    let dragGrabOffsetY = 0;

    const onBoxDown = (e) => {
      // Ignore interactive controls, buttons, scrubbers, inputs
      if (e.target.closest('button, select, input, a, .hud-timeline-container, .device-menu, .active-poll-widget, .window-title-bar, .window-resize-handle, .cinema-controls')) {
        return;
      }
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      movieHoldStartX = clientX;
      movieHoldStartY = clientY;

      const isFloating = stage.classList.contains('is-floating-window');

      if (isFloating) {
        // Dragging anywhere on the floating movie screen
        bringWindowToFront(stage);
        const rect = stage.getBoundingClientRect();
        dragGrabOffsetX = clientX - rect.left;
        dragGrabOffsetY = clientY - rect.top;
        dragStartX = clientX;
        dragStartY = clientY;
        isFloatingDragging = false;
        return;
      }

      // When docked: Long press (1000ms) pops out into floating screen
      clearTimeout(movieHoldTimer);
      clearTimeout(movieIndicatorTimer);

      movieIndicatorTimer = setTimeout(() => {
        movieIndicatorTimer = null;
        showHoldIndicator(clientX, clientY, 'Hold for Floating Screen', WINDOW_HOLD_DURATION_MS - HOLD_INDICATOR_DELAY_MS);
      }, HOLD_INDICATOR_DELAY_MS);

      movieHoldTimer = setTimeout(() => {
        movieHoldTimer = null;
        windowManager.suppressClick = true;
        if (navigator.vibrate) {
          try { navigator.vibrate(40); } catch (_) {}
        }
        pulseHoldIndicatorSuccess();
        setTimeout(() => {
          hideHoldIndicator();
          popOutMovieWindow();
        }, 220);
      }, WINDOW_HOLD_DURATION_MS);
    };

    const onBoxMove = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      if (stage.classList.contains('is-floating-window')) {
        if (!dragStartX && !dragStartY) return;
        const dist = Math.hypot(clientX - dragStartX, clientY - dragStartY);
        if (!isFloatingDragging && dist > 3) {
          isFloatingDragging = true;
          windowManager.suppressClick = true;
          stage.classList.add('is-dragging-window');
          document.body.classList.add('window-dragging-active');
        }

        if (isFloatingDragging) {
          if (e.cancelable) e.preventDefault();
          const winW = window.innerWidth;
          const winH = window.innerHeight;
          const wWidth = stage.offsetWidth;
          const wHeight = stage.offsetHeight;

          let desiredLeft = clientX - dragGrabOffsetX;
          let desiredTop = clientY - dragGrabOffsetY;

          const minLeft = 10;
          const maxLeft = Math.max(minLeft, winW - wWidth - 10);
          const minTop = 10;
          const maxTop = Math.max(minTop, winH - 60);

          const boundedLeft = Math.max(minLeft, Math.min(maxLeft, desiredLeft));
          const boundedTop = Math.max(minTop, Math.min(maxTop, desiredTop));

          stage.style.left = `${Math.round(boundedLeft)}px`;
          stage.style.top = `${Math.round(boundedTop)}px`;

          const snapResult = calculateWindowSnap(desiredLeft, desiredTop, wWidth, wHeight, winW, winH);
          updateWindowSnapGuide(snapResult, wWidth, wHeight);
        }
        return;
      }

      if (!movieHoldTimer && !movieIndicatorTimer) return;
      if (Math.hypot(clientX - movieHoldStartX, clientY - movieHoldStartY) > 12) {
        clearTimeout(movieHoldTimer);
        clearTimeout(movieIndicatorTimer);
        movieHoldTimer = null;
        movieIndicatorTimer = null;
        hideHoldIndicator();
      }
    };

    const onBoxUp = () => {
      if (isFloatingDragging) {
        isFloatingDragging = false;
        stage.classList.remove('is-dragging-window');
        document.body.classList.remove('window-dragging-active');
        applyWindowSnapOnRelease(stage);
        saveMovieWindowLayout();
        setTimeout(() => {
          windowManager.suppressClick = false;
        }, 80);
      }
      dragStartX = 0;
      dragStartY = 0;

      if (movieIndicatorTimer) {
        clearTimeout(movieIndicatorTimer);
        movieIndicatorTimer = null;
      }
      if (movieHoldTimer) {
        clearTimeout(movieHoldTimer);
        movieHoldTimer = null;
      }
      hideHoldIndicator();
    };

    box.addEventListener('mousedown', onBoxDown);
    box.addEventListener('touchstart', onBoxDown, { passive: true });
    window.addEventListener('mousemove', onBoxMove);
    window.addEventListener('touchmove', onBoxMove, { passive: false });
    window.addEventListener('mouseup', onBoxUp);
    window.addEventListener('touchend', onBoxUp, { passive: false });
    window.addEventListener('touchcancel', onBoxUp, { passive: false });

    if (el.menuTransformBtn) {
      el.menuTransformBtn.onclick = () => {
        closeAllDeviceMenus?.();
        if (stage.classList.contains('is-floating-window')) {
          dockMovieWindow();
        } else {
          popOutMovieWindow();
        }
      };
    }
  }

  function handleDragStart(e, targetWindow) {
    if (e.target.closest('button, select, input, a')) return;
    e.preventDefault();
    e.stopPropagation();

    bringWindowToFront(targetWindow);

    const isTouch = !!e.touches;
    const startPointerX = isTouch ? e.touches[0].clientX : e.clientX;
    const startPointerY = isTouch ? e.touches[0].clientY : e.clientY;

    const rect = targetWindow.getBoundingClientRect();
    // grabOffset is the exact vector between cursor and the window top-left
    const grabOffsetX = startPointerX - rect.left;
    const grabOffsetY = startPointerY - rect.top;

    targetWindow.classList.add('is-dragging-window');
    document.body.classList.add('window-dragging-active');

    const onMove = (moveEvt) => {
      moveEvt.preventDefault();
      const curX = moveEvt.touches ? moveEvt.touches[0].clientX : moveEvt.clientX;
      const curY = moveEvt.touches ? moveEvt.touches[0].clientY : moveEvt.clientY;

      const winW = window.innerWidth;
      const winH = window.innerHeight;
      const wWidth = targetWindow.offsetWidth;
      const wHeight = targetWindow.offsetHeight;

      let desiredLeft = curX - grabOffsetX;
      let desiredTop = curY - grabOffsetY;

      // Keep window cleanly within screen bounds:
      // Minimum 10px from edges, title bar always accessible, window never lost
      const minLeft = 10;
      const maxLeft = Math.max(minLeft, winW - wWidth - 10);
      const minTop = 10;
      const maxTop = Math.max(minTop, winH - 60);

      const boundedLeft = Math.max(minLeft, Math.min(maxLeft, desiredLeft));
      const boundedTop = Math.max(minTop, Math.min(maxTop, desiredTop));

      targetWindow.style.left = `${Math.round(boundedLeft)}px`;
      targetWindow.style.top = `${Math.round(boundedTop)}px`;

      const snapResult = calculateWindowSnap(desiredLeft, desiredTop, wWidth, wHeight, winW, winH);
      updateWindowSnapGuide(snapResult, wWidth, wHeight);
    };

    const onUp = () => {
      targetWindow.classList.remove('is-dragging-window');
      document.body.classList.remove('window-dragging-active');
      applyWindowSnapOnRelease(targetWindow);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
      if (targetWindow === el.cinemaStageWrapper) saveMovieWindowLayout();
    };

    window.addEventListener('mousemove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
  }

  function handleResizeStart(e, targetWindow, direction) {
    e.preventDefault();
    e.stopPropagation();

    bringWindowToFront(targetWindow);

    const isTouch = !!e.touches;
    const startPointerX = isTouch ? e.touches[0].clientX : e.clientX;
    const startPointerY = isTouch ? e.touches[0].clientY : e.clientY;

    const startRect = targetWindow.getBoundingClientRect();
    const startLeft = startRect.left;
    const startTop = startRect.top;
    const startWidth = startRect.width;
    const startHeight = startRect.height;

    const isMovie = targetWindow === el.cinemaStageWrapper;
    const minW = isMovie ? 360 : 180;
    const minH = isMovie ? 220 : 120;

    targetWindow.classList.add('is-resizing');
    document.body.classList.add('window-resizing-active');

    const onMove = (moveEvt) => {
      moveEvt.preventDefault();
      const curX = moveEvt.touches ? moveEvt.touches[0].clientX : moveEvt.clientX;
      const curY = moveEvt.touches ? moveEvt.touches[0].clientY : moveEvt.clientY;
      const dx = curX - startPointerX;
      const dy = curY - startPointerY;

      const winW = window.innerWidth;
      const winH = window.innerHeight;

      let newWidth = startWidth;
      let newHeight = startHeight;
      let newLeft = startLeft;
      let newTop = startTop;

      // Horizontal resize
      if (direction.includes('e')) {
        const maxW = winW - startLeft - 10;
        newWidth = Math.max(minW, Math.min(maxW, startWidth + dx));
      } else if (direction.includes('w')) {
        const maxW = startLeft + startWidth - 10;
        const requestedWidth = startWidth - dx;
        newWidth = Math.max(minW, Math.min(maxW, requestedWidth));
        newLeft = startLeft + (startWidth - newWidth);
      }

      // Vertical resize
      if (direction.includes('s')) {
        const maxH = winH - startTop - 10;
        newHeight = Math.max(minH, Math.min(maxH, startHeight + dy));
      } else if (direction.includes('n')) {
        const maxH = startTop + startHeight - 10;
        const requestedHeight = startHeight - dy;
        newHeight = Math.max(minH, Math.min(maxH, requestedHeight));
        newTop = startTop + (startHeight - newHeight);
      }

      targetWindow.style.width = `${Math.round(newWidth)}px`;
      targetWindow.style.height = `${Math.round(newHeight)}px`;
      targetWindow.style.left = `${Math.round(newLeft)}px`;
      targetWindow.style.top = `${Math.round(newTop)}px`;

      const badge = targetWindow.querySelector('.window-size-badge');
      if (badge) {
        badge.innerText = `${Math.round(newWidth)}×${Math.round(newHeight)}`;
      }
    };

    const onUp = () => {
      targetWindow.classList.remove('is-resizing');
      document.body.classList.remove('window-resizing-active');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
      if (isMovie) saveMovieWindowLayout();
    };

    window.addEventListener('mousemove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
  }

  function popOutMovieWindow(savedLayout = null) {
    const stage = el.cinemaStageWrapper;
    if (!stage) return;
    if (stage.classList.contains('is-floating-window')) return;

    const winW = window.innerWidth;
    const winH = window.innerHeight;

    // Calculate a comfortable, elegant default floating size (~58% viewport width, 16:9 ratio)
    let defaultW = Math.min(winW - 40, Math.max(520, Math.min(920, Math.round(winW * 0.58))));
    let defaultH = Math.round((defaultW * 9 / 16) + 34);

    // Keep within viewport height with safe margin for top nav and bottom controls
    if (defaultH > winH - 120) {
      defaultH = Math.max(300, winH - 120);
      defaultW = Math.round((defaultH - 34) * 16 / 9);
    }

    // Default position: centered horizontally, placed in comfortable upper-mid viewport
    let defaultL = Math.max(20, Math.round((winW - defaultW) / 2));
    let defaultT = Math.max(50, Math.min(winH - defaultH - 80, Math.round((winH - defaultH) / 2 - 20)));

    let width = defaultW;
    let height = defaultH;
    let left = defaultL;
    let top = defaultT;

    if (savedLayout && typeof savedLayout.width === 'number' && typeof savedLayout.height === 'number') {
      width = Math.max(360, Math.min(winW - 20, savedLayout.width));
      height = Math.max(220, Math.min(winH - 20, savedLayout.height));
      const maxL = Math.max(10, winW - width - 10);
      const maxT = Math.max(10, winH - 60);
      left = Math.max(10, Math.min(maxL, savedLayout.left ?? defaultL));
      top = Math.max(10, Math.min(maxT, savedLayout.top ?? defaultT));
    }

    // Create / insert stage placeholder into stage's original spot
    let placeholder = document.getElementById('movieStagePlaceholder');
    if (!placeholder) {
      placeholder = document.createElement('div');
      placeholder.id = 'movieStagePlaceholder';
      placeholder.className = 'cinema-stage-placeholder';
      placeholder.innerHTML = `
        <div class="cinema-stage-placeholder-inner">
          <div class="placeholder-icon-wrap">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
          </div>
          <div class="placeholder-info">
            <span class="placeholder-title">Movie Screen is Floating</span>
            <span class="placeholder-sub">Drag, resize anywhere or click dock to return</span>
          </div>
          <button type="button" class="placeholder-dock-btn" id="moviePlaceholderDockBtn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 14h6m0 0v6m0-6L3 21m17-7h-6m0 0v6m0-6l7 7M4 10h6m0 0V4m0 6L3 3m17 7h-6m0 0V4m0 6l7-7"></path></svg>
            <span>Dock Screen</span>
          </button>
        </div>
      `;
    }

    const wasPlaying = (el.cinemaVideo && !el.cinemaVideo.paused);
    const currTime = el.cinemaVideo ? el.cinemaVideo.currentTime : 0;

    if (stage.parentNode && stage.parentNode !== document.body) {
      stage.parentNode.insertBefore(placeholder, stage);
      const dockBtn = placeholder.querySelector('#moviePlaceholderDockBtn');
      if (dockBtn) {
        dockBtn.onclick = (e) => {
          e.stopPropagation();
          dockMovieWindow();
        };
      }
    }

    // Reparent directly to document.body so containing block is 100% the viewport
    document.body.appendChild(stage);

    if (el.cinemaVideo) {
      if (currTime && Math.abs(el.cinemaVideo.currentTime - currTime) > 0.5) {
        el.cinemaVideo.currentTime = currTime;
      }
      if (wasPlaying) {
        el.cinemaVideo.play().catch(() => {});
      }
    }

    stage.classList.add('is-floating-window');
    stage.style.position = 'fixed';
    stage.style.left = `${left}px`;
    stage.style.top = `${top}px`;
    stage.style.width = `${width}px`;
    stage.style.height = `${height}px`;

    bringWindowToFront(stage);

    if (el.movieWindowTitleBar) {
      el.movieWindowTitleBar.classList.remove('hidden');
    }
    if (el.movieWindowSizeBadge) {
      el.movieWindowSizeBadge.innerText = `${Math.round(width)}×${Math.round(height)}`;
    }
    if (el.menuTransformTitle) {
      el.menuTransformTitle.innerText = 'Dock Movie Window';
    }

    saveMovieWindowLayout();
    showToast('Movie Screen popped out. Drag title bar to move.');
  }

  function dockMovieWindow() {
    const stage = el.cinemaStageWrapper;
    if (!stage) return;

    stage.classList.remove('is-floating-window');
    stage.classList.remove('is-dragging-window');
    stage.classList.remove('is-resizing');

    stage.style.position = '';
    stage.style.left = '';
    stage.style.top = '';
    stage.style.width = '';
    stage.style.height = '';
    stage.style.zIndex = '';

    const wasPlaying = (el.cinemaVideo && !el.cinemaVideo.paused);
    const currTime = el.cinemaVideo ? el.cinemaVideo.currentTime : 0;

    const placeholder = document.getElementById('movieStagePlaceholder');
    if (placeholder && placeholder.parentNode) {
      placeholder.parentNode.insertBefore(stage, placeholder);
      placeholder.remove();
    } else if (el.stageCinemaGroup) {
      el.stageCinemaGroup.insertBefore(stage, el.stageCinemaGroup.firstChild);
    }

    if (el.cinemaVideo) {
      if (currTime && Math.abs(el.cinemaVideo.currentTime - currTime) > 0.5) {
        el.cinemaVideo.currentTime = currTime;
      }
      if (wasPlaying) {
        el.cinemaVideo.play().catch(() => {});
      }
    }

    if (el.movieWindowTitleBar) {
      el.movieWindowTitleBar.classList.add('hidden');
    }
    if (el.menuTransformTitle) {
      el.menuTransformTitle.innerText = 'Pop Out Movie Window';
    }

    try {
      localStorage.removeItem('lumiere_movie_window_layout');
    } catch (_) {}

    showToast('Movie Screen docked to theater');
  }

  function resetMovieWindowSize() {
    const stage = el.cinemaStageWrapper;
    if (!stage || !stage.classList.contains('is-floating-window')) return;
    const winW = window.innerWidth;
    const winH = window.innerHeight;

    let defaultW = Math.min(winW - 60, Math.max(480, Math.min(840, Math.round(winW * 0.55))));
    let defaultH = Math.round((defaultW * 9 / 16) + 34);
    if (defaultH > winH - 120) {
      defaultH = winH - 120;
      defaultW = Math.round((defaultH - 34) * 16 / 9);
    }

    const left = Math.round((winW - defaultW) / 2);
    const top = Math.max(20, Math.round((winH - defaultH) / 2 - 20));

    stage.style.width = `${defaultW}px`;
    stage.style.height = `${defaultH}px`;
    stage.style.left = `${left}px`;
    stage.style.top = `${top}px`;

    if (el.movieWindowSizeBadge) {
      el.movieWindowSizeBadge.innerText = `${defaultW}×${defaultH}`;
    }
    saveMovieWindowLayout();
    showToast('Movie window reset to center');
  }

  function saveMovieWindowLayout() {
    const stage = el.cinemaStageWrapper;
    if (!stage || !stage.classList.contains('is-floating-window')) return;
    try {
      const data = {
        width: parseInt(stage.style.width, 10),
        height: parseInt(stage.style.height, 10),
        left: parseInt(stage.style.left, 10),
        top: parseInt(stage.style.top, 10)
      };
      localStorage.setItem('lumiere_movie_window_layout', JSON.stringify(data));
    } catch (_) {}
  }

  function loadSavedMovieWindowLayout() {
    try {
      const raw = localStorage.getItem('lumiere_movie_window_layout');
      if (raw) {
        const data = JSON.parse(raw);
        if (data && typeof data.width === 'number' && typeof data.height === 'number') {
          const winW = window.innerWidth;
          const winH = window.innerHeight;
          const w = Math.max(360, Math.min(winW - 20, data.width));
          const h = Math.max(220, Math.min(winH - 20, data.height));
          const l = Math.max(10, Math.min(winW - w - 10, data.left ?? 40));
          const t = Math.max(10, Math.min(winH - h - 60, data.top ?? 40));
          popOutMovieWindow({ width: w, height: h, left: l, top: t });
        }
      }
    } catch (_) {}
  }

  function popOutParticipantWindow(tile) {
    if (!tile || tile.classList.contains('is-floating-window')) return;

    const winW = window.innerWidth;
    const winH = window.innerHeight;

    const rect = tile.getBoundingClientRect();
    const defaultW = Math.max(220, Math.min(360, Math.round(rect.width || 240)));
    const defaultH = Math.max(160, Math.min(260, Math.round(rect.height || 160) + 28));
    const defaultL = Math.max(16, Math.min(winW - defaultW - 16, Math.round(rect.left || 30)));
    const defaultT = Math.max(16, Math.min(winH - defaultH - 60, Math.round(rect.top || 80)));

    let placeholder = document.getElementById(`placeholder-${tile.id}`);
    if (!placeholder && tile.parentNode) {
      placeholder = document.createElement('div');
      placeholder.className = 'participant-tile-placeholder';
      placeholder.id = `placeholder-${tile.id}`;
      placeholder.innerText = 'Floating Cam';
      tile.parentNode.insertBefore(placeholder, tile);
    }

    const vid = tile.querySelector('video');
    const wasPlaying = (vid && !vid.paused);
    const stream = vid ? vid.srcObject : null;

    document.body.appendChild(tile);

    if (vid && stream) {
      vid.srcObject = stream;
      if (wasPlaying) vid.play().catch(() => {});
    }

    tile.classList.add('is-floating-window');
    tile.style.position = 'fixed';
    tile.style.left = `${defaultL}px`;
    tile.style.top = `${defaultT}px`;
    tile.style.width = `${defaultW}px`;
    tile.style.height = `${defaultH}px`;

    bringWindowToFront(tile);

    const titleBar = tile.querySelector('.window-title-bar');
    if (titleBar) titleBar.classList.remove('hidden');
    showToast('Webcam tile popped out');
  }

  function dockParticipantWindow(tile) {
    if (!tile) return;

    tile.classList.remove('is-floating-window');
    tile.classList.remove('is-dragging-window');
    tile.classList.remove('is-resizing');

    tile.style.position = '';
    tile.style.left = '';
    tile.style.top = '';
    tile.style.width = '';
    tile.style.height = '';
    tile.style.zIndex = '';

    const titleBar = tile.querySelector('.window-title-bar');
    if (titleBar) titleBar.classList.add('hidden');

    const vid = tile.querySelector('video');
    const wasPlaying = (vid && !vid.paused);
    const stream = vid ? vid.srcObject : null;

    const placeholder = document.getElementById(`placeholder-${tile.id}`);
    if (placeholder && placeholder.parentNode) {
      placeholder.parentNode.insertBefore(tile, placeholder);
      placeholder.remove();
    } else if (el.participantsRow) {
      el.participantsRow.appendChild(tile);
    }

    if (vid && stream) {
      vid.srcObject = stream;
      if (wasPlaying) vid.play().catch(() => {});
    }

    showToast('Webcam tile docked');
  }

  function setupParticipantWindowHandlers(tile) {
    const titleBar = tile.querySelector('.window-title-bar');
    if (titleBar) {
      titleBar.addEventListener('mousedown', (e) => handleDragStart(e, tile));
      titleBar.addEventListener('touchstart', (e) => handleDragStart(e, tile), { passive: false });

      const dockBtn = titleBar.querySelector('.window-dock-btn');
      if (dockBtn) {
        dockBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          dockParticipantWindow(tile);
        });
      }
    }

    const handles = tile.querySelectorAll('.window-resize-handle');
    handles.forEach(h => {
      const dir = h.getAttribute('data-direction');
      h.addEventListener('mousedown', (e) => handleResizeStart(e, tile, dir));
      h.addEventListener('touchstart', (e) => handleResizeStart(e, tile, dir), { passive: false });
    });

    let tileHoldTimer = null;
    let tileIndicatorTimer = null;
    let tileHoldStartX = 0;
    let tileHoldStartY = 0;
    let isFloatingDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragGrabOffsetX = 0;
    let dragGrabOffsetY = 0;

    const onDown = (e) => {
      if (e.target.closest('button, select, input, a, .window-title-bar, .window-resize-handle, .tile-vol-btn, .tile-volume-popover')) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      tileHoldStartX = clientX;
      tileHoldStartY = clientY;

      const isFloating = tile.classList.contains('is-floating-window');

      if (isFloating) {
        // Dragging anywhere on the floating webcam video tile
        bringWindowToFront(tile);
        const rect = tile.getBoundingClientRect();
        dragGrabOffsetX = clientX - rect.left;
        dragGrabOffsetY = clientY - rect.top;
        dragStartX = clientX;
        dragStartY = clientY;
        isFloatingDragging = false;
        return;
      }

      // When docked: Long press (1000ms) pops out into floating webcam tile
      clearTimeout(tileHoldTimer);
      clearTimeout(tileIndicatorTimer);

      tileIndicatorTimer = setTimeout(() => {
        tileIndicatorTimer = null;
        showHoldIndicator(clientX, clientY, 'Hold for Floating Cam', WINDOW_HOLD_DURATION_MS - HOLD_INDICATOR_DELAY_MS);
      }, HOLD_INDICATOR_DELAY_MS);

      tileHoldTimer = setTimeout(() => {
        tileHoldTimer = null;
        windowManager.suppressClick = true;
        if (navigator.vibrate) {
          try { navigator.vibrate(40); } catch (_) {}
        }
        pulseHoldIndicatorSuccess();
        setTimeout(() => {
          hideHoldIndicator();
          popOutParticipantWindow(tile);
        }, 220);
      }, WINDOW_HOLD_DURATION_MS);
    };

    const onMove = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      if (tile.classList.contains('is-floating-window')) {
        if (!dragStartX && !dragStartY) return;
        const dist = Math.hypot(clientX - dragStartX, clientY - dragStartY);
        if (!isFloatingDragging && dist > 3) {
          isFloatingDragging = true;
          windowManager.suppressClick = true;
          tile.classList.add('is-dragging-window');
          document.body.classList.add('window-dragging-active');
        }

        if (isFloatingDragging) {
          if (e.cancelable) e.preventDefault();
          const winW = window.innerWidth;
          const winH = window.innerHeight;
          const tWidth = tile.offsetWidth;
          const tHeight = tile.offsetHeight;

          let desiredLeft = clientX - dragGrabOffsetX;
          let desiredTop = clientY - dragGrabOffsetY;

          const minLeft = 10;
          const maxLeft = Math.max(minLeft, winW - tWidth - 10);
          const minTop = 10;
          const maxTop = Math.max(minTop, winH - 60);

          const boundedLeft = Math.max(minLeft, Math.min(maxLeft, desiredLeft));
          const boundedTop = Math.max(minTop, Math.min(maxTop, desiredTop));

          tile.style.left = `${Math.round(boundedLeft)}px`;
          tile.style.top = `${Math.round(boundedTop)}px`;
        }
        return;
      }

      if (!tileHoldTimer && !tileIndicatorTimer) return;
      if (Math.hypot(clientX - tileHoldStartX, clientY - tileHoldStartY) > 12) {
        clearTimeout(tileHoldTimer);
        clearTimeout(tileIndicatorTimer);
        tileHoldTimer = null;
        tileIndicatorTimer = null;
        hideHoldIndicator();
      }
    };

    const onUp = () => {
      if (isFloatingDragging) {
        isFloatingDragging = false;
        tile.classList.remove('is-dragging-window');
        document.body.classList.remove('window-dragging-active');
        setTimeout(() => {
          windowManager.suppressClick = false;
        }, 80);
      }
      dragStartX = 0;
      dragStartY = 0;

      if (tileIndicatorTimer) {
        clearTimeout(tileIndicatorTimer);
        tileIndicatorTimer = null;
      }
      if (tileHoldTimer) {
        clearTimeout(tileHoldTimer);
        tileHoldTimer = null;
      }
      hideHoldIndicator();
    };

    tile.addEventListener('mousedown', onDown);
    tile.addEventListener('touchstart', onDown, { passive: true });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp, { passive: false });
    tile.addEventListener('touchcancel', onUp, { passive: false });
  }

  function showHoldIndicator(clientX, clientY, label = 'Hold to Pop Out Window', remainingDurationMs = 800) {
    const indicator = el.videoHoldIndicator;
    const ring = el.holdRingProgress;
    if (!indicator || !ring) return;

    indicator.style.left = `${clientX}px`;
    indicator.style.top = `${clientY}px`;
    const badge = indicator.querySelector('.hold-tooltip-badge');
    if (badge) badge.innerText = label;

    indicator.classList.remove('hidden');
    indicator.classList.remove('hold-success');

    ring.style.transition = 'none';
    ring.style.strokeDashoffset = '201.06';
    void ring.offsetWidth;
    ring.style.transition = `stroke-dashoffset ${remainingDurationMs}ms linear`;
    ring.style.strokeDashoffset = '0';
  }

  function hideHoldIndicator() {
    const indicator = el.videoHoldIndicator;
    const ring = el.holdRingProgress;
    if (!indicator) return;
    indicator.classList.add('hidden');
    indicator.classList.remove('hold-success');
    if (ring) {
      ring.style.transition = 'none';
      ring.style.strokeDashoffset = '201.06';
    }
  }

  function pulseHoldIndicatorSuccess() {
    const indicator = el.videoHoldIndicator;
    if (!indicator) return;
    indicator.classList.add('hold-success');
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
    const modal = el.subtitlesModal || el.subtitleModal;
    if (modal) modal.classList.remove('hidden');
    updateSubtitleLivePreview();
    if (el.moviePlayer && (el.moviePlayer.src || state.currentMovie)) {
      enterMiniPlayerMode();
    }
  }

  function closeSubtitleModal() {
    const modal = el.subtitlesModal || el.subtitleModal;
    if (modal) modal.classList.add('hidden');
    if (!state.chatOpen) {
      const isAnyModalOpen = Boolean(document.querySelector('.modal-overlay:not(.hidden), .feedback-modal-overlay:not(.hidden)'));
      if (!isAnyModalOpen) {
        exitMiniPlayerMode();
      }
    }
  }

  function updateSubtitleLivePreview() {
    const fontScale = state.subFontScale !== undefined ? state.subFontScale : 100;
    const textOpacity = (state.subTextOpacity !== undefined ? state.subTextOpacity : 100) / 100;
    const bgBlur = state.subBgBlur !== undefined ? state.subBgBlur : 4;
    const colorVal = state.subColor || '#ffffff';
    const offset = state.subOffset || 0.0;

    if (el.subtitlePreviewText) {
      el.subtitlePreviewText.style.fontSize = Math.round(18 * (fontScale / 100)) + 'px';
      el.subtitlePreviewText.style.opacity = textOpacity.toString();
      el.subtitlePreviewText.style.color = colorVal;
    }

    if (el.subtitlePreviewBox) {
      el.subtitlePreviewBox.style.backdropFilter = `blur(${bgBlur}px)`;
      el.subtitlePreviewBox.style.webkitBackdropFilter = `blur(${bgBlur}px)`;
    }

    if (el.subFontScaleValue) el.subFontScaleValue.textContent = `${fontScale}%`;
    if (el.subTextOpacityValue) el.subTextOpacityValue.textContent = `${Math.round(textOpacity * 100)}%`;
    if (el.subBgBlurValue) el.subBgBlurValue.textContent = `${bgBlur}px`;
    if (el.subOffsetDisplay) {
      el.subOffsetDisplay.textContent = `${offset > 0 ? '+' : ''}${offset.toFixed(1)}s`;
    }
    if (el.subDelaySlider && Math.abs(parseFloat(el.subDelaySlider.value) - offset) > 0.05) {
      el.subDelaySlider.value = offset.toFixed(1);
    }
  }

  function adjustSubtitleOffset(delta) {
    state.subOffset = Math.round((state.subOffset + delta) * 10) / 10;
    updateSubtitleOffsetUI();
    if (el.subDelaySlider) {
      el.subDelaySlider.value = state.subOffset.toFixed(1);
    }
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
    if (el.subDelaySlider) {
      el.subDelaySlider.value = '0.0';
    }
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

    const fontScale = state.subFontScale !== undefined ? state.subFontScale : 100;
    const textOpacity = (state.subTextOpacity !== undefined ? state.subTextOpacity : 100) / 100;
    const bgBlur = state.subBgBlur !== undefined ? state.subBgBlur : 4;
    const colorVal = state.subColor || '#ffffff';

    const calculatedFontSize = Math.round(20 * (fontScale / 100)) + 'px';

    let r = 255, g = 255, b = 255;
    if (colorVal.startsWith('#') && colorVal.length === 7) {
      r = parseInt(colorVal.slice(1, 3), 16);
      g = parseInt(colorVal.slice(3, 5), 16);
      b = parseInt(colorVal.slice(5, 7), 16);
    }
    const rgbaColor = `rgba(${r}, ${g}, ${b}, ${textOpacity})`;

    styleEl.textContent = `
      ::cue {
        font-size: ${calculatedFontSize} !important;
        color: ${rgbaColor} !important;
        background-color: rgba(0, 0, 0, 0.78) !important;
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9) !important;
        backdrop-filter: blur(${bgBlur}px) !important;
        -webkit-backdrop-filter: blur(${bgBlur}px) !important;
        font-family: inherit !important;
      }
    `;

    updateSubtitleLivePreview();
  }

  // ==========================================================================
  // 2B. MOVIE AUDIO ENGINE & DIALOGUE BOOSTER (NIGHT MODE)
  // ==========================================================================

  function initMovieAudioEngine(mediaEl) {
    if (!mediaEl) return null;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;

      if (!state.movieAudioContext) {
        state.movieAudioContext = new AudioCtx();
      }

      const ctx = state.movieAudioContext;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      // Safely creates createMediaElementSource(mediaEl) cached on state.movieAudioSource
      // to prevent duplicate InvalidStateError across playback lifecycle
      if (!state.movieAudioSource) {
        try {
          state.movieAudioSource = ctx.createMediaElementSource(mediaEl);
        } catch (srcErr) {
          console.warn('[AudioEngine] MediaElementSource binding notice:', srcErr.message);
          return null;
        }
      }

      if (state.movieAudioNodes) {
        return state.movieAudioNodes;
      }

      // 1. DynamicsCompressorNode with night-mode parameters:
      // threshold: -28dB, knee: 24dB, ratio: 12:1, attack: 0.003s, release: 0.25s
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-28, ctx.currentTime);
      compressor.knee.setValueAtTime(24, ctx.currentTime);
      compressor.ratio.setValueAtTime(12, ctx.currentTime);
      compressor.attack.setValueAtTime(0.003, ctx.currentTime);
      compressor.release.setValueAtTime(0.25, ctx.currentTime);

      // 2. BiquadFilterNode with speech frequency peaking (~2.2 kHz, Q: 1.2, gain: 4.5 dB)
      const speechFilter = ctx.createBiquadFilter();
      speechFilter.type = 'peaking';
      speechFilter.frequency.setValueAtTime(2200, ctx.currentTime);
      speechFilter.Q.setValueAtTime(1.2, ctx.currentTime);
      speechFilter.gain.setValueAtTime(4.5, ctx.currentTime);

      // 3. Gain nodes for booster and clean bypass
      const boosterGain = ctx.createGain();
      boosterGain.gain.setValueAtTime(state.dialogueBoosterEnabled ? 1.0 : 0.0, ctx.currentTime);

      const bypassGain = ctx.createGain();
      bypassGain.gain.setValueAtTime(state.dialogueBoosterEnabled ? 0.0 : 1.0, ctx.currentTime);

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(1.0, ctx.currentTime);

      // Connect processing path: source -> speechFilter -> compressor -> boosterGain -> masterGain
      state.movieAudioSource.connect(speechFilter);
      speechFilter.connect(compressor);
      compressor.connect(boosterGain);
      boosterGain.connect(masterGain);

      // Connect clean bypass path: source -> bypassGain -> masterGain
      state.movieAudioSource.connect(bypassGain);
      bypassGain.connect(masterGain);

      // Connect master output to audio context destination
      masterGain.connect(ctx.destination);

      state.movieAudioNodes = {
        compressor,
        speechFilter,
        boosterGain,
        bypassGain,
        masterGain
      };

      return state.movieAudioNodes;
    } catch (err) {
      console.warn('[AudioEngine] Audio engine initialization notice:', err.message);
      return null;
    }
  }

  function toggleDialogueBooster(enabled) {
    const isTargetEnabled = (typeof enabled === 'boolean') ? enabled : !state.dialogueBoosterEnabled;
    state.dialogueBoosterEnabled = isTargetEnabled;

    if (el.moviePlayer) {
      initMovieAudioEngine(el.moviePlayer);
    }

    if (state.movieAudioContext && state.movieAudioContext.state === 'suspended') {
      state.movieAudioContext.resume().catch(() => {});
    }

    if (state.movieAudioNodes && state.movieAudioContext) {
      const now = state.movieAudioContext.currentTime;
      if (state.dialogueBoosterEnabled) {
        state.movieAudioNodes.bypassGain.gain.setTargetAtTime(0.0, now, 0.05);
        state.movieAudioNodes.boosterGain.gain.setTargetAtTime(1.0, now, 0.05);
      } else {
        state.movieAudioNodes.boosterGain.gain.setTargetAtTime(0.0, now, 0.05);
        state.movieAudioNodes.bypassGain.gain.setTargetAtTime(1.0, now, 0.05);
      }
    }

    if (el.dialogueBoosterToggle) {
      el.dialogueBoosterToggle.checked = state.dialogueBoosterEnabled;
    }

    showToast(state.dialogueBoosterEnabled 
      ? 'Dialogue Booster (Night Mode) Enabled' 
      : 'Dialogue Booster Disabled'
    );
  }

  // ==========================================================================
  // MINI-PLAYER MODE
  // ==========================================================================

  function enterMiniPlayerMode() {
    if (!el.moviePlayer || state.isMiniPlayer) return;
    const hasActiveMedia = Boolean(el.moviePlayer.src || state.currentMovie);
    if (!hasActiveMedia) return;

    const wasPlaying = !el.moviePlayer.paused;
    const currentTime = el.moviePlayer.currentTime;
    const playbackRate = el.moviePlayer.playbackRate;

    state.isMiniPlayer = true;
    document.body.classList.add('mini-player-active');
    if (el.cinemaStageWrapper) {
      el.cinemaStageWrapper.classList.add('mini-player-active');
    }
    if (el.stageSection) {
      el.stageSection.classList.add('mini-player-active');
    }

    showToast('Mini-Player Mode Activated');

    if (wasPlaying && el.moviePlayer.paused) {
      el.moviePlayer.play().catch(() => {});
    }
  }

  function exitMiniPlayerMode() {
    if (!state.isMiniPlayer && !document.body.classList.contains('mini-player-active')) return;
    const wasPlaying = el.moviePlayer && !el.moviePlayer.paused;
    const currentTime = el.moviePlayer ? el.moviePlayer.currentTime : 0;
    const playbackRate = el.moviePlayer ? el.moviePlayer.playbackRate : 1;

    state.isMiniPlayer = false;
    document.body.classList.remove('mini-player-active');
    if (el.cinemaStageWrapper) {
      el.cinemaStageWrapper.classList.remove('mini-player-active');
      el.cinemaStageWrapper.style.transform = '';
    }
    if (el.stageSection) {
      el.stageSection.classList.remove('mini-player-active');
    }

    showToast('Restored Theater Player');

    if (wasPlaying && el.moviePlayer && el.moviePlayer.paused) {
      el.moviePlayer.play().catch(() => {});
    }
  }

  function setupMiniPlayerControls() {
    if (el.exitMiniPlayerBtn) {
      el.exitMiniPlayerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        exitMiniPlayerMode();
      });
    }
    if (el.miniPlayerPlayPauseBtn) {
      el.miniPlayerPlayPauseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!el.moviePlayer) return;
        if (el.moviePlayer.paused) {
          el.moviePlayer.play().catch(() => {});
        } else {
          el.moviePlayer.pause();
        }
      });
    }
    if (el.miniPlayerMuteBtn) {
      el.miniPlayerMuteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!el.moviePlayer) return;
        el.moviePlayer.muted = !el.moviePlayer.muted;
        showToast(el.moviePlayer.muted ? 'Mini-Player Muted' : 'Mini-Player Unmuted');
      });
    }
  }

  function setupMiniPlayerModalObserver() {
    const modalElements = document.querySelectorAll('.modal-overlay, .feedback-modal-overlay');
    if (window.MutationObserver && modalElements.length) {
      const observer = new MutationObserver(() => {
        const isAnyModalOpen = Boolean(document.querySelector('.modal-overlay:not(.hidden), .feedback-modal-overlay:not(.hidden)'));
        if (isAnyModalOpen) {
          if (el.moviePlayer && (el.moviePlayer.src || state.currentMovie) && !state.isMiniPlayer) {
            enterMiniPlayerMode();
          }
        } else if (!state.chatOpen && state.isMiniPlayer) {
          exitMiniPlayerMode();
        }
      });
      modalElements.forEach(m => {
        observer.observe(m, { attributes: true, attributeFilter: ['class', 'style'] });
      });
    }
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

  // ==========================================================================
  // PROCEDURAL WEB AUDIO MICRO-INTERACTIONS
  // ==========================================================================

  let lastHoverAudioTime = 0;
  function playUIAudio(type) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!state.uiAudioContext) {
        state.uiAudioContext = new AudioCtx();
      }
      const ctx = state.uiAudioContext;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const now = ctx.currentTime;
      if (type === 'hover') {
        const hoverNow = Date.now();
        if (hoverNow - lastHoverAudioTime < 45) return;
        lastHoverAudioTime = hoverNow;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(900, now);
        osc.frequency.exponentialRampToValueAtTime(1300, now + 0.02);
        gain.gain.setValueAtTime(0.015, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.025);
      } else if (type === 'mic-mute') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(330, now + 0.08);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.085);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.085);
      } else if (type === 'mic-unmute') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(330, now);
        osc.frequency.exponentialRampToValueAtTime(520, now + 0.08);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.085);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.085);
      } else if (type === 'room-join') {
        const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const startTime = now + idx * 0.035;
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, startTime);
          gain.gain.setValueAtTime(0.08, startTime);
          gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.32);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(startTime);
          osc.stop(startTime + 0.32);
        });
      }
    } catch (e) {
      // AudioContext unavailable or autoplay prevented
    }
  }

  function getSoundName(id) {
    const names = {
      airhorn: 'Airhorn [HORN]',
      applause: 'Applause [CLAP]',
      drumroll: 'Drumroll [ROLL]',
      sting: 'Dramatic Sting [SHOCK]',
      laugh: 'Laugh Track [LAUGH]',
      rimshot: 'Ba-Dum-Tss [DRUM]'
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

  function isPortraitMode() {
    return window.matchMedia('(orientation: portrait)').matches || (window.innerHeight > window.innerWidth);
  }

  function renderParticipantStrip() {
    if (!el.participantStrip) return;
    state.renderCount = (state.renderCount || 0) + 1;
    el.participantStrip.innerHTML = '';
    if (el.participantStripTop) el.participantStripTop.innerHTML = '';
    if (el.participantStripAudience) el.participantStripAudience.innerHTML = '';

    const members = Array.from(state.members.values());
    const isPortrait = isPortraitMode();
    const isStageGrid = (el.mainWorkspace && (el.mainWorkspace.classList.contains('is-grid-view') || el.mainWorkspace.classList.contains('stage-grid-mode'))) ||
                        (el.participantStripArea && el.participantStripArea.classList.contains('stage-grid-mode'));

    if (el.stageCinemaGroup) el.stageCinemaGroup.dataset.participantCount = String(members.length);
    if (el.stageSection) el.stageSection.dataset.participantCount = String(members.length);

    if (members.length === 0) {
      if (el.participantTopArea) {
        el.participantTopArea.classList.add('hidden');
        el.participantTopArea.dataset.count = '0';
      }
      if (el.participantStripArea) {
        el.participantStripArea.classList.add('hidden');
        el.participantStripArea.dataset.count = '0';
      }
      if (el.stageSpeakersHeader) el.stageSpeakersHeader.classList.add('hidden');
      if (el.stageAudiencePartition) el.stageAudiencePartition.classList.add('hidden');
      document.body.classList.remove('has-participants');
      return;
    }

    document.body.classList.add('has-participants');

    if (isStageGrid) {
      // Discord Stage Grid mode: Partition broadcasters/speakers and passive audience
      if (el.participantTopArea) {
        el.participantTopArea.classList.add('hidden');
        el.participantTopArea.dataset.count = '0';
      }
      if (el.participantStripArea) {
        el.participantStripArea.classList.remove('hidden');
        el.participantStripArea.dataset.count = String(members.length);
      }

      const speakers = [];
      const audience = [];

      members.forEach(m => {
        if (m.isSpeaking || m.isCamOn || !m.isMuted || m.isHost || m.id === state.selfId) {
          speakers.push(m);
        } else {
          audience.push(m);
        }
      });

      if (speakers.length === 0 && members.length > 0) {
        speakers.push(members[0]);
        audience.splice(0, 1);
      }

      if (el.stageSpeakersHeader) {
        el.stageSpeakersHeader.classList.toggle('hidden', audience.length === 0);
      }
      if (el.stageSpeakersCount) el.stageSpeakersCount.textContent = String(speakers.length);
      if (el.stageAudienceCount) el.stageAudienceCount.textContent = String(audience.length);
      if (el.stageAudiencePartition) {
        el.stageAudiencePartition.classList.toggle('hidden', audience.length === 0);
      }

      speakers.forEach(member => {
        el.participantStrip.appendChild(createParticipantTile(member));
      });

      if (el.participantStripAudience) {
        audience.forEach(member => {
          const tile = createParticipantTile(member);
          tile.classList.add('is-audience-tile');
          el.participantStripAudience.appendChild(tile);
        });
      }
      return;
    }

    // Standard theater layout
    if (el.stageSpeakersHeader) el.stageSpeakersHeader.classList.add('hidden');
    if (el.stageAudiencePartition) el.stageAudiencePartition.classList.add('hidden');

    if (!isPortrait || members.length <= 1) {
      if (el.participantTopArea) {
        el.participantTopArea.classList.add('hidden');
        el.participantTopArea.dataset.count = '0';
      }
      if (el.participantStripArea) {
        el.participantStripArea.classList.remove('hidden');
        el.participantStripArea.dataset.count = String(members.length);
      }
      members.forEach(member => {
        el.participantStrip.appendChild(createParticipantTile(member));
      });
    } else {
      // In portrait mode with 2 or more participants:
      // Dynamically distribute participants above and below the cinema screen
      // so the cinema screen always remains in the exact vertical center!
      if (el.participantTopArea) el.participantTopArea.classList.remove('hidden');

      const topCount = Math.floor(members.length / 2);
      const topMembers = members.slice(0, topCount);
      const bottomMembers = members.slice(topCount);

      if (el.participantTopArea) el.participantTopArea.dataset.count = String(topMembers.length);
      if (el.participantStripArea) el.participantStripArea.dataset.count = String(bottomMembers.length);

      if (el.participantStripTop) {
        topMembers.forEach(member => {
          el.participantStripTop.appendChild(createParticipantTile(member));
        });
      }

      bottomMembers.forEach(member => {
        el.participantStrip.appendChild(createParticipantTile(member));
      });
    }
  }

  const participantGainNodes = new Map();

  function setParticipantVolume(memberId, volPercent) {
    state.participantVolumes.set(memberId, volPercent);
    const audioEl = document.getElementById(`remote-audio-${memberId}`);
    if (audioEl) {
      if (volPercent <= 100) {
        audioEl.volume = Math.max(0, volPercent / 100);
      } else {
        audioEl.volume = 1.0;
      }
    }

    // AudioContext GainNode amplification up to 200%
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        if (!state.audioContext) {
          state.audioContext = new AudioCtx();
        }
        if (state.audioContext.state === 'suspended') {
          state.audioContext.resume().catch(() => {});
        }
        let gainNode = participantGainNodes.get(memberId);
        if (!gainNode && audioEl && audioEl.srcObject) {
          const source = state.audioContext.createMediaStreamSource(audioEl.srcObject);
          gainNode = state.audioContext.createGain();
          source.connect(gainNode);
          gainNode.connect(state.audioContext.destination);
          participantGainNodes.set(memberId, gainNode);
        }
        if (gainNode) {
          gainNode.gain.value = volPercent / 100;
        }
      }
    } catch (e) {
      // Fallback to standard audio element volume
    }
  }

  function createParticipantTile(member) {
    const isSelf = (member.id === state.selfId);
    const tile = document.createElement('div');
    tile.className = 'participant-tile';
    tile.id = `participant-tile-${member.id}`;
    if (member.isSpeaking) {
      tile.classList.add('is-speaking', 'stage-speaking-halo');
    }
    if (member.isSpotlight) {
      tile.classList.add('is-spotlighted');
    }

    // Network Connection Quality Indicator
    const netBadge = document.createElement('div');
    netBadge.className = 'tile-network-badge net-good';
    netBadge.id = `tile-net-${member.id}`;
    netBadge.title = 'Connection: Good (24ms)';
    netBadge.setAttribute('aria-label', 'Connection quality: Good');
    netBadge.innerHTML = `
      <span class="net-bar net-bar-1"></span>
      <span class="net-bar net-bar-2"></span>
      <span class="net-bar net-bar-3"></span>
      <span class="net-latency-text">24ms</span>
    `;
    tile.appendChild(netBadge);

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

    tile.appendChild(avatar);
    tile.appendChild(video);
    tile.appendChild(bottomBadge);

    // Quick Action Menu on Hover / Focus
    const quickMenu = document.createElement('div');
    quickMenu.className = 'participant-quick-menu';

    // Spotlight Toggle Button
    const spotBtn = document.createElement('button');
    spotBtn.type = 'button';
    spotBtn.className = `quick-action-btn quick-spot-btn ${member.isSpotlight ? 'active-action' : ''}`;
    spotBtn.title = member.isSpotlight ? 'Unpin participant' : 'Spotlight participant';
    spotBtn.setAttribute('aria-label', 'Toggle Spotlight');
    spotBtn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l2.4 7.4h7.6l-6.1 4.5 2.3 7.1-6.2-4.4-6.2 4.4 2.3-7.1-6.1-4.5h7.6z"/>
      </svg>
    `;
    spotBtn.onclick = (e) => {
      e.stopPropagation();
      member.isSpotlight = !member.isSpotlight;
      tile.classList.toggle('is-spotlighted', Boolean(member.isSpotlight));
      spotBtn.classList.toggle('active-action', Boolean(member.isSpotlight));
      showToast(member.isSpotlight ? `Spotlighted ${member.username}` : `Unpinned ${member.username}`);
      playUIAudio('hover');
    };
    quickMenu.appendChild(spotBtn);

    // Remote Participant Controls (Volume & Mute)
    if (!isSelf) {
      const muteBtn = document.createElement('button');
      muteBtn.type = 'button';
      muteBtn.className = 'quick-action-btn quick-mute-btn';
      const isMutedLocally = (state.participantVolumes.get(member.id) === 0);
      if (isMutedLocally) muteBtn.classList.add('active-action');
      muteBtn.title = `Mute ${member.username} locally`;
      muteBtn.setAttribute('aria-label', `Mute ${member.username}`);
      muteBtn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
        </svg>
      `;

      const volBtn = document.createElement('button');
      volBtn.type = 'button';
      volBtn.className = 'quick-action-btn tile-vol-btn';
      volBtn.title = `Adjust volume for ${member.username}`;
      volBtn.setAttribute('aria-label', `Volume for ${member.username}`);
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
        <input type="range" min="0" max="200" step="5" value="${initialVol}" class="tile-vol-slider" title="Volume slider">
      `;

      muteBtn.onclick = (e) => {
        e.stopPropagation();
        const currentVol = state.participantVolumes.get(member.id) ?? 100;
        const newVol = (currentVol === 0) ? 100 : 0;
        setParticipantVolume(member.id, newVol);
        muteBtn.classList.toggle('active-action', newVol === 0);
        const slider = volPopover.querySelector('.tile-vol-slider');
        const valDisplay = volPopover.querySelector('.tile-vol-val');
        if (slider) slider.value = newVol;
        if (valDisplay) valDisplay.innerText = `${newVol}%`;
        showToast(newVol === 0 ? `Muted ${member.username}` : `Unmuted ${member.username}`);
        playUIAudio('hover');
      };

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
        setParticipantVolume(member.id, v);
        muteBtn.classList.toggle('active-action', v === 0);
      };

      quickMenu.appendChild(muteBtn);
      quickMenu.appendChild(volBtn);
      tile.appendChild(volPopover);
    }

    tile.appendChild(quickMenu);

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

    // Windows-style Title Bar & 8 Resize Handles for Floating Webcam Window
    const titleBar = document.createElement('div');
    titleBar.className = 'window-title-bar participant-window-title-bar hidden';
    titleBar.innerHTML = `
      <div class="window-title-left">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M23 7l-7 5 7 5V7z"></path>
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
        </svg>
        <span class="window-title-name">${member.username}</span>
      </div>
      <div class="window-title-right">
        <button type="button" class="window-action-btn window-dock-btn" title="Dock back into participant strip">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 14h6m0 0v6m0-6L3 21m17-7h-6m0 0v6m0-6l7 7M4 10h6m0 0V4m0 6L3 3m17 7h-6m0 0V4m0 6l7-7"></path></svg>
          <span>Dock</span>
        </button>
      </div>
    `;
    tile.insertBefore(titleBar, tile.firstChild);

    // 8 Windows-style resize handles
    ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].forEach(dir => {
      const h = document.createElement('div');
      h.className = `window-resize-handle handle-${dir}`;
      h.setAttribute('data-direction', dir);
      tile.appendChild(h);
    });

    setupParticipantWindowHandlers(tile);

    return tile;
  }

  function updateParticipantTileState(id) {
    const member = state.members.get(id);
    if (!member) return;

    const tile = document.getElementById(`participant-tile-${id}`);
    if (tile && typeof member.isSpeaking !== 'undefined') {
      tile.classList.toggle('is-speaking', !!member.isSpeaking);
      tile.classList.toggle('stage-speaking-halo', !!member.isSpeaking);
    }

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
    if (state.currentMovie?.type === 'streaming') {
      return 0;
    }
    if (state.movieDuration && isFinite(state.movieDuration) && state.movieDuration > 0) {
      return state.movieDuration;
    }
    if (el.moviePlayer && el.moviePlayer.duration && isFinite(el.moviePlayer.duration) && el.moviePlayer.duration > 0) {
      return el.moviePlayer.duration;
    }
    return 0;
  }

  function getEffectiveCurrentTime() {
    if (state.currentMovie?.type === 'streaming') {
      return state.streamingCurrentTime || 0;
    }
    const rawCur = el.moviePlayer.currentTime || 0;
    if (state.isLiveStream) {
      return (state.streamStartTime || 0) + rawCur;
    }
    return rawCur;
  }

  function seekMovie(seekTime, shouldPlay = null) {
    if (state.currentMovie?.type === 'streaming') {
      const clamped = Math.max(0, seekTime);
      updateStreamingPlaybackState(shouldPlay !== null ? shouldPlay : state.streamingIsPlaying, clamped);
      if (state.socket) {
        state.socket.emit('host-streaming-sync', {
          roomId: state.roomId,
          action: 'seek',
          time: clamped
        });
      }
      return;
    }

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

    if (el.streamingPlayerBox) {
      el.streamingPlayerBox.classList.add('hidden');
    }

    if (state.streamingTicker) {
      clearInterval(state.streamingTicker);
      state.streamingTicker = null;
    }
    state.streamingIsPlaying = false;
    state.streamingCurrentTime = 0;

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

    // 0. Streaming Platform Party (Netflix, Prime Video, JioHotstar, Zee5, etc.)
    if (movie.type === 'streaming') {
      loadStreamingInTheater(movie.platform, movie.title, movie.url, startTime, autoPlay);
      return;
    }

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
      if (el.streamingPlayerBox) el.streamingPlayerBox.classList.add('hidden');
      if (el.screenSharePlayer) el.screenSharePlayer.classList.add('hidden');
      if (el.moviePlayer) {
        el.moviePlayer.classList.remove('hidden');
        initMovieAudioEngine(el.moviePlayer);
      }

      if (el.modalNowPlayingBanner) el.modalNowPlayingBanner.classList.remove('hidden');
      if (el.modalNowPlayingTitle) el.modalNowPlayingTitle.innerText = movie.filename || 'Direct URL Stream';
      if (el.audioPickerGroup) el.audioPickerGroup.classList.add('hidden');
      if (el.subtitlePickerGroup) el.subtitlePickerGroup.classList.add('hidden');

      el.moviePlayer.setAttribute('data-stream-file', movie.url);
      el.moviePlayer.setAttribute('data-stream-src', movie.url);
      if (typeof el.moviePlayer.setSinkId === 'function') {
        el.moviePlayer.setSinkId('').catch(() => {});
      }
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
    if (el.streamingPlayerBox) el.streamingPlayerBox.classList.add('hidden');
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
      if (typeof el.moviePlayer.setSinkId === 'function') {
        el.moviePlayer.setSinkId('').catch(() => {});
      }
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

    if (state.currentMovie?.type === 'streaming') {
      const nextPlaying = !state.streamingIsPlaying;
      updateStreamingPlaybackState(nextPlaying, state.streamingCurrentTime || 0);
      if (state.socket) {
        state.socket.emit('host-streaming-sync', {
          roomId: state.roomId,
          action: nextPlaying ? 'play' : 'pause',
          time: state.streamingCurrentTime || 0
        });
      }
      return;
    }

    if (!state.currentMovie) {
      if (state.isHost) {
        showToast('No movie loaded. Tap "Load Movie" to pick a movie.');
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

      if (state.currentMovie?.type === 'streaming') {
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

    // Timeline hover time preview tooltip across the full timestamp bar with remaining time and clamping
    const updateTimelineTooltip = (clientX) => {
      const rect = el.timelineContainer.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const dur = getEffectiveDuration();
      if (dur > 0 && el.timelineHoverTime) {
        const hoverSec = pos * dur;
        const remSec = Math.max(0, dur - hoverSec);
        el.timelineHoverTime.style.display = 'flex';
        // Clamping to avoid edge clipping
        const tooltipWidth = 110;
        const minLeftPx = tooltipWidth / 2 + 6;
        const maxLeftPx = rect.width - tooltipWidth / 2 - 6;
        const targetPx = pos * rect.width;
        const clampedPx = Math.max(minLeftPx, Math.min(maxLeftPx, targetPx));
        el.timelineHoverTime.style.left = `${clampedPx}px`;

        const hoverTimeText = document.getElementById('hoverTimeText');
        const hoverRemainingText = document.getElementById('hoverRemainingText');
        if (hoverTimeText) hoverTimeText.textContent = formatTime(hoverSec);
        if (hoverRemainingText) hoverRemainingText.textContent = `-${formatTime(remSec)}`;
        else el.timelineHoverTime.innerText = formatTime(hoverSec);
      }
    };

    el.timelineContainer.addEventListener('mousemove', (e) => updateTimelineTooltip(e.clientX));

    el.timelineContainer.addEventListener('mouseleave', () => {
      if (el.timelineHoverTime) {
        el.timelineHoverTime.style.display = 'none';
      }
    });

    let isScrubbing = false;
    el.timelineContainer.addEventListener('touchstart', (e) => {
      isScrubbing = true;
      if (e.touches.length > 0) {
        handleScrub(e.touches[0].clientX);
        updateTimelineTooltip(e.touches[0].clientX);
      }
    }, { passive: true });

    el.timelineContainer.addEventListener('touchmove', (e) => {
      if (isScrubbing && e.touches.length > 0) {
        handleScrub(e.touches[0].clientX);
        updateTimelineTooltip(e.touches[0].clientX);
      }
    }, { passive: true });

    el.timelineContainer.addEventListener('touchend', () => {
      isScrubbing = false;
      if (el.timelineHoverTime) {
        el.timelineHoverTime.style.display = 'none';
      }
    });

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

  let chatClosingTimer = null;
  let chatOpeningTimer = null;
  let closeAllDeviceMenus = null;

  function toggleChat(forceOpen) {
    const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !state.chatOpen;
    if (state.chatOpen === shouldOpen && !chatClosingTimer) return;

    if (chatClosingTimer) {
      clearTimeout(chatClosingTimer);
      chatClosingTimer = null;
    }
    if (chatOpeningTimer) {
      clearTimeout(chatOpeningTimer);
      chatOpeningTimer = null;
    }

    if (shouldOpen) {
      state.chatOpen = true;
      if (el.chatSidebar) {
        el.chatSidebar.classList.remove('hidden', 'chat-panel-closing');
        el.chatSidebar.classList.add('chat-panel-opening');
      }
      document.body.classList.add('chat-is-open');
      document.body.classList.remove('chat-is-closing');
      state.unreadMessages = 0;
      if (el.chatBadge) el.chatBadge.classList.add('hidden');
      if (window.innerWidth > 768 && !window.matchMedia('(pointer: coarse)').matches && el.chatInput) {
        el.chatInput.focus();
      }
      requestAnimationFrame(() => {
        if (el.chatMessages) el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
      });

      chatOpeningTimer = setTimeout(() => {
        if (state.chatOpen && el.chatSidebar) {
          el.chatSidebar.classList.remove('chat-panel-opening');
        }
        chatOpeningTimer = null;
      }, 280);

      if (el.moviePlayer && (el.moviePlayer.src || state.currentMovie)) {
        enterMiniPlayerMode();
      }
    } else {
      state.chatOpen = false;
      document.body.classList.remove('chat-is-open');
      document.body.classList.add('chat-is-closing');

      const isAnyModalOpen = Boolean(document.querySelector('.modal-overlay:not(.hidden), .feedback-modal-overlay:not(.hidden)'));
      if (!isAnyModalOpen) {
        exitMiniPlayerMode();
      }

      if (el.chatSidebar && !el.chatSidebar.classList.contains('hidden')) {
        el.chatSidebar.classList.remove('chat-panel-opening');
        el.chatSidebar.classList.add('chat-panel-closing');

        chatClosingTimer = setTimeout(() => {
          if (!state.chatOpen && el.chatSidebar) {
            el.chatSidebar.classList.add('hidden');
            el.chatSidebar.classList.remove('chat-panel-closing');
            el.chatSidebar.style.height = '';
          }
          document.body.classList.remove('chat-is-closing');
          chatClosingTimer = null;
        }, 240);
      } else {
        if (el.chatSidebar) {
          el.chatSidebar.classList.add('hidden');
          el.chatSidebar.classList.remove('chat-panel-opening', 'chat-panel-closing');
          el.chatSidebar.style.height = '';
        }
        document.body.classList.remove('chat-is-closing');
      }
    }
  }

  function sendChatMessage(e) {
    if (e) e.preventDefault();
    const text = el.chatInput.value.trim();
    if (!text || !state.socket) return;

    state.socket.emit('send-chat', { roomId: state.roomId, text });

    el.chatInput.value = '';
    if (window.innerWidth > 768 && !window.matchMedia('(pointer: coarse)').matches) {
      el.chatInput.focus();
    }
  }

  function appendChatMessage(msg) {
    // Hide welcome hero on first message
    if (el.chatWelcomeHero) {
      el.chatWelcomeHero.style.display = 'none';
    }

    const item = document.createElement('div');
    item.className = 'chat-msg';

    const isHost = Boolean(msg.isHost || (state.members && state.members.get(msg.senderId)?.isHost) || msg.role === 'host');
    const roleBadgeHtml = isHost
      ? '<span class="chat-role-badge role-host">HOST</span>'
      : '<span class="chat-role-badge role-viewer">VIEWER</span>';

    item.innerHTML = `
      <div class="chat-msg-avatar" style="background-color: ${msg.color || '#5865F2'}">
        ${escapeHtml((msg.username || 'U').charAt(0).toUpperCase())}
      </div>
      <div class="chat-msg-content">
        <div class="chat-msg-header">
          <span class="chat-msg-user" style="color: ${msg.color || '#5865F2'}">${escapeHtml(msg.username)}</span>
          ${roleBadgeHtml}
          <span class="chat-msg-time">${msg.timestamp}</span>
        </div>
        <div class="chat-msg-text">${escapeHtml(msg.text)}</div>
      </div>
    `;

    el.chatMessages.appendChild(item);
    requestAnimationFrame(() => {
      el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
    });
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
        { e: ':popcorn:', tags: 'popcorn movie cinema snack' },
        { e: ':clapper:', tags: 'clapper cinema movie action' },
        { e: ':movie_camera:', tags: 'movie camera film recording' },
        { e: ':film_strip:', tags: 'film frames movie projector' },
        { e: ':ticket:', tags: 'admission ticket cinema pass' },
        { e: ':projector:', tags: 'film projector theater' },
        { e: ':tv:', tags: 'television tv screen' },
        { e: ':pizza:', tags: 'pizza slice food snack cheese' },
        { e: ':burger:', tags: 'hamburger burger fastfood' },
        { e: ':fries:', tags: 'fries french fries snack' },
        { e: ':hotdog:', tags: 'hotdog sausage snack' },
        { e: ':drink:', tags: 'soda cup drink beverage cola' },
        { e: ':beers:', tags: 'beer mugs cheers party drinks' },
        { e: ':cheers:', tags: 'champagne glasses toast cheers' },
        { e: ':chocolate:', tags: 'chocolate bar candy sweet' },
        { e: ':couch:', tags: 'couch sofa relax watching' },
        { e: ':masks:', tags: 'theater masks drama arts' },
        { e: ':headphones:', tags: 'headphones audio sound music' },
        { e: ':speaker:', tags: 'speaker loud volume audio' },
        { e: ':sunglasses:', tags: 'sunglasses cool shades 3d' },
        { e: ':cookie:', tags: 'cookie sweet snack biscuit' }
      ]
    },
    popular: {
      title: 'Popular Reactions',
      items: [
        { e: ':laugh:', tags: 'laughing lol tears haha funny' },
        { e: ':rofl:', tags: 'rofl rolling on floor laugh' },
        { e: ':cry:', tags: 'crying tears sad sob' },
        { e: ':skull:', tags: 'skull dead lol dying' },
        { e: ':emotional:', tags: 'emotional holding back tears touched' },
        { e: ':plead:', tags: 'pleading eyes cute please puppy' },
        { e: ':starstruck:', tags: 'starstruck amazed excited wow' },
        { e: ':cool:', tags: 'cool sunglasses chill boss' },
        { e: ':party_face:', tags: 'party face celebrating woo' },
        { e: ':mindblown:', tags: 'exploding head mind blown shock' },
        { e: ':melting:', tags: 'melting face warm awkward' },
        { e: ':cowboy:', tags: 'cowboy hat smiley' },
        { e: ':devil:', tags: 'smiling devil cheeky mischievous' },
        { e: ':angel:', tags: 'angel innocent halo' },
        { e: ':goofy:', tags: 'winking eye tongue out goofy' },
        { e: ':drool:', tags: 'drooling hungry delicious yummy' },
        { e: ':screaming:', tags: 'screaming scared shocked fear' },
        { e: ':yawn:', tags: 'yawning tired sleepy bored' },
        { e: ':sleep:', tags: 'sleeping face zzz bed' },
        { e: ':cold:', tags: 'cold freezing chilled icy' },
        { e: ':hot:', tags: 'hot sweating overwhelmed' }
      ]
    },
    hype: {
      title: 'Hype & Love',
      items: [
        { e: ':fire:', tags: 'fire flame lit hot hype' },
        { e: ':lightning:', tags: 'lightning bolt zap energy speed' },
        { e: ':100:', tags: 'hundred 100 points perfect score' },
        { e: ':rocket:', tags: 'rocket ship blastoff launch moon hype' },
        { e: ':sparkles:', tags: 'sparkles sparkle stars magic' },
        { e: ':boom:', tags: 'boom collision explosion bang' },
        { e: ':party:', tags: 'tada party popper celebration' },
        { e: ':confetti:', tags: 'confetti ball festival party' },
        { e: ':trophy:', tags: 'trophy prize winner champion' },
        { e: ':sparkle_heart:', tags: 'sparkling heart love romance' },
        { e: ':heart:', tags: 'red heart love like romance' },
        { e: ':black_heart:', tags: 'black heart dark aesthetic' },
        { e: ':white_heart:', tags: 'white heart peace pure' },
        { e: ':crown:', tags: 'crown king queen royal goat' },
        { e: ':star:', tags: 'glowing star night shine' },
        { e: ':shooting_star:', tags: 'dizzy star shooting magic' },
        { e: ':target:', tags: 'bullseye direct hit target' },
        { e: ':bomb:', tags: 'bomb explosive lit boom' }
      ]
    },
    gestures: {
      title: 'Claps & Gestures',
      items: [
        { e: ':clap:', tags: 'clapping hands applause bravo' },
        { e: ':praise:', tags: 'raising hands praise celebration' },
        { e: ':thumbs_up:', tags: 'thumbs up like yes agree good' },
        { e: ':thumbs_down:', tags: 'thumbs down dislike bad no' },
        { e: ':fist_bump:', tags: 'fist bump bro punch' },
        { e: ':peace:', tags: 'peace sign victory fingers' },
        { e: ':crossed_fingers:', tags: 'crossed fingers hope luck' },
        { e: ':salute:', tags: 'saluting face respect yes sir' },
        { e: ':handshake:', tags: 'handshake deal agreement' },
        { e: ':heart_hands:', tags: 'heart hands love care' },
        { e: ':shaka:', tags: 'call me shaka hang loose' },
        { e: ':eyes:', tags: 'eyes looking side-eye tea drama' },
        { e: ':eye:', tags: 'single eye watch see' },
        { e: ':brain:', tags: 'brain smart genius 200iq' },
        { e: ':flex:', tags: 'mechanical robot arm flex strength' },
        { e: ':pray:', tags: 'folded hands pray please thanks' }
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
          const emoji = btn.dataset.emoji || 'heart';
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

  function getReactionDisplay(emoji) {
    if (!emoji) return '<span class="reaction-tag-custom">[REACT]</span>';
    const clean = String(emoji).toLowerCase().trim();
    if (clean === 'heart' || clean === 'love' || clean === ':heart:') return '<span class="reaction-tag-love">[LOVE]</span>';
    if (clean === 'fire' || clean === ':fire:') return '<span class="reaction-tag-fire">[FIRE]</span>';
    if (clean === 'popcorn' || clean === ':popcorn:') return '<span class="reaction-tag-popcorn">[POP]</span>';
    if (clean === 'clap' || clean === ':clap:') return '<span class="reaction-tag-clap">[CLAP]</span>';
    if (clean === 'laugh' || clean === ':laugh:') return '<span class="reaction-tag-laugh">[LAUGH]</span>';
    if (clean === 'shock' || clean === 'wow' || clean === ':shock:') return '<span class="reaction-tag-shock">[WOW]</span>';
    if (clean === 'rocket' || clean === 'hype' || clean === ':rocket:') return '<span class="reaction-tag-rocket">[HYPE]</span>';
    if (clean === 'party' || clean === ':party:') return '<span class="reaction-tag-party">[PARTY]</span>';
    if (clean === 'dead' || clean === ':skull:') return '<span class="reaction-tag-dead">[DEAD]</span>';
    if (clean.startsWith(':') && clean.endsWith(':')) {
      const tag = clean.slice(1, -1).toUpperCase();
      return `<span class="reaction-tag-custom">[${escapeHtml(tag)}]</span>`;
    }
    return `<span class="reaction-tag-custom">${escapeHtml(clean.toUpperCase())}</span>`;
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

          let html = `<span class="floating-reaction-emoji">${getReactionDisplay(emoji)}</span>`;
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
          <div class="movie-card-info">
            <div class="movie-card-title">
              <span class="movie-card-filename" title="${m.filename}">${m.filename}</span>
              <span class="movie-card-badge badge-${extTag.toLowerCase()}">${extTag}</span>
            </div>
            <div class="movie-card-size">${m.size}</div>
          </div>
          <button class="btn btn-primary btn-sm play-btn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
            <span>Play in Room</span>
          </button>
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
            state.selectedMicDeviceId = d.deviceId;
            if (!state.isMicMuted) {
              try {
                const stream = await navigator.mediaDevices.getUserMedia({
                  audio: { deviceId: { exact: d.deviceId } },
                  video: false
                });
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
                state.localAudioTrack = track;
                setupSpeakingDetector(state.localStream);
              } catch (e) {}
            }
            el.micDeviceMenu.classList.add('hidden');
            if (el.mobileSheetBackdrop) el.mobileSheetBackdrop.classList.add('hidden');
          };
          el.micDeviceList.appendChild(item);
        } else if (d.kind === 'videoinput') {
          const item = document.createElement('div');
          item.className = 'device-opt';
          item.innerText = d.label || `Camera ${el.camDeviceList.children.length + 1}`;
          item.onclick = () => {
            el.camDeviceMenu.classList.add('hidden');
            if (el.mobileSheetBackdrop) el.mobileSheetBackdrop.classList.add('hidden');
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
    const sessionForm = document.querySelector('form[data-purpose="session-form"]');
    if (sessionForm) {
      sessionForm.addEventListener('submit', (e) => {
        e.preventDefault();
        joinRoom();
      });
    }

    // About Page Navigation
    const showAbout = (e) => {
      if (e) e.preventDefault();
      const storyAbout = document.getElementById('about');
      if (storyAbout && el.joinModal && !el.joinModal.classList.contains('hidden')) {
        storyAbout.scrollIntoView({ behavior: 'smooth' });
        return;
      }
      if (window.location.pathname !== '/about') {
        try { window.history.pushState({}, '', '/about'); } catch (err) {}
      }
      if (el.aboutPage) {
        el.aboutPage.classList.remove('hidden');
        el.aboutPage.scrollTop = 0;
      }
    };
    const hideAbout = (e) => {
      if (e) e.preventDefault();
      if (window.location.pathname === '/about') {
        try { window.history.pushState({}, '', '/'); } catch (err) {}
      }
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

    // ==========================================================================
    // 5. GIVE FEEDBACK MODAL (Stitch Controller)
    // ==========================================================================
    const diagBrowser = document.getElementById('diagBrowser');
    const diagPlatform = document.getElementById('diagPlatform');
    if (diagBrowser && diagPlatform) {
      const ua = navigator.userAgent;
      let bName = 'Browser';
      if (ua.includes('Chrome')) bName = 'Chrome ' + (ua.match(/Chrome\/(\d+)/)?.[1] || '');
      else if (ua.includes('Firefox')) bName = 'Firefox ' + (ua.match(/Firefox\/(\d+)/)?.[1] || '');
      else if (ua.includes('Safari')) bName = 'Safari';

      diagBrowser.textContent = bName;
      diagPlatform.textContent = navigator.userAgentData?.platform || navigator.platform || 'Desktop';
    }

    const openFeedback = (e, preselectedCat) => {
      if (e && e.preventDefault) e.preventDefault();
      if (el.feedbackModal) {
        if (preselectedCat) {
          const pill = el.feedbackModal.querySelector(`.category-pill[data-category="${preselectedCat}"]`);
          if (pill) pill.click();
        }
        el.feedbackModal.classList.remove('hidden');
        document.getElementById('feedbackMessage')?.focus();
      }
    };
    const closeFeedback = () => {
      if (el.feedbackModal) el.feedbackModal.classList.add('hidden');
    };

    if (el.navFeedbackBtn) el.navFeedbackBtn.onclick = openFeedback;
    if (el.footerFeedbackBtn) el.footerFeedbackBtn.onclick = openFeedback;

    const closeFeedbackBtn = document.getElementById('feedbackCloseBtn') || el.closeFeedbackBtn;
    if (closeFeedbackBtn) closeFeedbackBtn.onclick = closeFeedback;
    const cancelFeedbackBtn = document.getElementById('feedbackCancelBtn') || el.cancelFeedbackBtn;
    if (cancelFeedbackBtn) cancelFeedbackBtn.onclick = closeFeedback;

    if (el.feedbackModal) {
      el.feedbackModal.addEventListener('click', (e) => {
        if (e.target === el.feedbackModal) closeFeedback();
      });
    }

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && el.feedbackModal && !el.feedbackModal.classList.contains('hidden')) {
        closeFeedback();
      }
    });

    // Category pill selection
    const categoryPills = document.querySelectorAll('.category-pill');
    categoryPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        categoryPills.forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
      });
    });

    // Screening Quality Rating selector
    const ratingTierText = document.getElementById('ratingTierText');
    const ratingBtns = document.querySelectorAll('.rating-btn');
    ratingBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        ratingBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        if (ratingTierText) {
          ratingTierText.textContent = btn.getAttribute('data-label') || 'Pure Cinema (5/5)';
        }
      });
    });

    // Quick-Insert Tags directly into textarea
    const feedbackMsgInput = document.getElementById('feedbackMessage');
    const tagBtns = document.querySelectorAll('.tag-insert-btn');
    tagBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!feedbackMsgInput) return;
        const tag = btn.getAttribute('data-tag') + ' ';
        feedbackMsgInput.value = (feedbackMsgInput.value ? feedbackMsgInput.value + ' ' : '') + tag;
        feedbackMsgInput.focus();
      });
    });

    // Submit Feedback Handler
    const submitFeedbackBtn = document.getElementById('feedbackSubmitBtn') || document.getElementById('submitFeedbackBtn');
    const feedbackContactInput = document.getElementById('feedbackContact');
    const attachDiagCheckbox = document.getElementById('attachDiagnosticsCheckbox');

    if (submitFeedbackBtn) {
      submitFeedbackBtn.onclick = async () => {
        const text = feedbackMsgInput ? feedbackMsgInput.value.trim() : '';
        if (!text) {
          if (feedbackMsgInput) feedbackMsgInput.focus();
          return;
        }

        const activeCat = document.querySelector('.category-pill.active')?.getAttribute('data-category') || 'bug';
        const activeRating = document.querySelector('.rating-btn.active')?.getAttribute('data-rating') || '5';
        const contact = feedbackContactInput ? feedbackContactInput.value.trim() : '';

        const payload = {
          category: activeCat,
          rating: parseInt(activeRating, 10),
          message: text,
          contact: contact || null,
          diagnostics: (attachDiagCheckbox && attachDiagCheckbox.checked) ? {
            browser: diagBrowser?.textContent || 'Unknown',
            platform: diagPlatform?.textContent || 'Unknown',
            engine: 'Wasm fMP4 Remux v2.4',
            mesh: 'WebRTC Direct OK'
          } : null,
          timestamp: new Date().toISOString()
        };

        submitFeedbackBtn.disabled = true;
        const originalBtnHtml = submitFeedbackBtn.innerHTML;
        submitFeedbackBtn.innerHTML = '<span>Sending...</span>';

        try {
          await fetch('/api/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          submitFeedbackBtn.innerHTML = '<span>Sent! Thank you!</span>';
          showToast('Feedback delivered to Ayushman Mitra!');
          setTimeout(() => {
            closeFeedback();
            submitFeedbackBtn.disabled = false;
            submitFeedbackBtn.innerHTML = originalBtnHtml;
            if (feedbackMsgInput) feedbackMsgInput.value = '';
          }, 1200);
        } catch (err) {
          console.warn('Feedback fallback error:', err);
          showToast('Feedback saved!');
          closeFeedback();
          submitFeedbackBtn.disabled = false;
          submitFeedbackBtn.innerHTML = originalBtnHtml;
        }
      };
    }

    // ==========================================================================
    // ANTI-FRAUD IMMUTABLE MAKER SECURITY BINDING
    // ==========================================================================
    const OFFICIAL_MAKER_SECURITY = Object.freeze({
      makerName: 'Ayushman Mitra',
      githubUser: 'AyushmanMItra',
      upiId: 'ayushmanmitra@upi',
      officialQrUrl: 'https://raw.githubusercontent.com/AyushmanMItra/lumiere/main/public/support-qr.png',
      localQrFallback: 'support-qr.png'
    });

    const initUpiAntiTamperGuard = () => {
      const upiDisplay = document.getElementById('upiValueText');
      const qrImg = document.getElementById('supportQrImage');
      if (!upiDisplay && !qrImg) return;

      const enforce = () => {
        if (upiDisplay && upiDisplay.innerText !== OFFICIAL_MAKER_SECURITY.upiId) {
          upiDisplay.innerText = OFFICIAL_MAKER_SECURITY.upiId;
        }
        if (qrImg && qrImg.src !== OFFICIAL_MAKER_SECURITY.officialQrUrl && !qrImg.src.endsWith(OFFICIAL_MAKER_SECURITY.localQrFallback)) {
          qrImg.src = OFFICIAL_MAKER_SECURITY.officialQrUrl;
        }
      };

      enforce();

      const supportModal = document.getElementById('supportModal');
      if (supportModal && window.MutationObserver) {
        const observer = new MutationObserver(() => enforce());
        observer.observe(supportModal, { childList: true, subtree: true, characterData: true, attributes: true });
      }
    };
    initUpiAntiTamperGuard();

    // Support Modal & Copy UPI
    const showSupport = () => {
      if (el.supportModal) {
        const upiDisplay = document.getElementById('upiValueText');
        if (upiDisplay) upiDisplay.innerText = OFFICIAL_MAKER_SECURITY.upiId;

        const qrImg = document.getElementById('supportQrImage');
        if (qrImg) {
          qrImg.src = OFFICIAL_MAKER_SECURITY.officialQrUrl;
          qrImg.onerror = () => { qrImg.src = OFFICIAL_MAKER_SECURITY.localQrFallback; };
        }

        el.supportModal.classList.remove('hidden');
      }
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
        // Anti-Fraud: Always copy directly from the frozen constant, never trust mutable DOM
        const upiText = OFFICIAL_MAKER_SECURITY.upiId;
        navigator.clipboard?.writeText(upiText).then(() => {
          showToast('Verified Maker UPI ID copied to clipboard!');
          const copyLabel = document.getElementById('copyUpiText');
          if (copyLabel) {
            copyLabel.innerText = 'Copied!';
            setTimeout(() => { copyLabel.innerText = 'Copy'; }, 2000);
          }
        }).catch(() => prompt('Verified UPI ID:', upiText));
      };
    }

    // Android APK Downloads
    const onApkDownloadClick = () => {
      showToast('Starting Android APK download (v2.4.1)...');
    };
    if (el.navApkBtn) el.navApkBtn.addEventListener('click', onApkDownloadClick);
    if (el.androidTvApkCard) el.androidTvApkCard.addEventListener('click', onApkDownloadClick);

    // ==========================================================================
    // LANDING PAGE & FOOTER BUTTON ROUTING
    // ==========================================================================
    // Brand Header Home Link -> Smooth Scroll to Top
    const brandHomeLink = document.getElementById('brandHomeLink') || document.querySelector('[data-purpose="site-brand"]');
    if (brandHomeLink) {
      brandHomeLink.addEventListener('click', (e) => {
        if (window.location.pathname === '/' || window.location.pathname === '') {
          e.preventDefault();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    }

    // Hero Feature Badges -> Smooth Navigation
    const heroSyncBadge = document.getElementById('heroBadgeSync');
    if (heroSyncBadge) {
      heroSyncBadge.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('technology-story')?.scrollIntoView({ behavior: 'smooth' });
      });
    }
    const heroVoiceBadge = document.getElementById('heroBadgeVoice');
    if (heroVoiceBadge) {
      heroVoiceBadge.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('technology-story')?.scrollIntoView({ behavior: 'smooth' });
      });
    }

    // Section 04 CTA: Join Network -> Scroll to Theater Entrance & Focus Room Key
    const ctaJoinNetworkBtn = document.getElementById('ctaJoinNetworkBtn') || document.querySelector('a[href="#android"]');
    if (ctaJoinNetworkBtn) {
      ctaJoinNetworkBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (el.roomInput) {
          setTimeout(() => el.roomInput.focus(), 400);
        }
      });
    }

    // Device Cards: Chrome Extension Card -> Open Extension Modal
    const landingChromeExtCard = document.getElementById('landingChromeExtCard');
    if (landingChromeExtCard) {
      landingChromeExtCard.addEventListener('click', (e) => {
        e.preventDefault();
        openExtensionModal();
      });
    }

    // Tailscale Guide Modal Handlers
    const tailscaleModal = document.getElementById('tailscaleModal');
    const openTailscaleModal = (e) => {
      if (e && e.preventDefault) e.preventDefault();
      if (tailscaleModal) tailscaleModal.classList.remove('hidden');
    };
    const closeTailscaleModal = () => {
      if (tailscaleModal) tailscaleModal.classList.add('hidden');
    };
    const heroTailscaleBadge = document.getElementById('heroBadgeTailscale');
    if (heroTailscaleBadge) heroTailscaleBadge.addEventListener('click', openTailscaleModal);

    const footerTailscaleBtn = document.getElementById('footerTailscaleBtn');
    if (footerTailscaleBtn) footerTailscaleBtn.addEventListener('click', openTailscaleModal);
    const tailscaleCloseBtn = document.getElementById('tailscaleCloseBtn');
    if (tailscaleCloseBtn) tailscaleCloseBtn.addEventListener('click', closeTailscaleModal);
    const tailscaleDoneBtn = document.getElementById('tailscaleDoneBtn');
    if (tailscaleDoneBtn) tailscaleDoneBtn.addEventListener('click', closeTailscaleModal);
    if (tailscaleModal) {
      tailscaleModal.addEventListener('click', (e) => {
        if (e.target === tailscaleModal) closeTailscaleModal();
      });
    }

    // Discord Community Modal Handlers
    const discordModal = document.getElementById('discordModal');
    const openDiscordModal = (e) => {
      if (e && e.preventDefault) e.preventDefault();
      if (discordModal) discordModal.classList.remove('hidden');
    };
    const closeDiscordModal = () => {
      if (discordModal) discordModal.classList.add('hidden');
    };
    const footerDiscordBtn = document.getElementById('footerDiscordBtn');
    if (footerDiscordBtn) footerDiscordBtn.addEventListener('click', openDiscordModal);
    const discordCloseBtn = document.getElementById('discordCloseBtn');
    if (discordCloseBtn) discordCloseBtn.addEventListener('click', closeDiscordModal);
    const discordDoneBtn = document.getElementById('discordDoneBtn');
    if (discordDoneBtn) discordDoneBtn.addEventListener('click', closeDiscordModal);
    if (discordModal) {
      discordModal.addEventListener('click', (e) => {
        if (e.target === discordModal) closeDiscordModal();
      });
    }

    // Close modals on Escape key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (tailscaleModal && !tailscaleModal.classList.contains('hidden')) closeTailscaleModal();
        if (discordModal && !discordModal.classList.contains('hidden')) closeDiscordModal();
      }
    });

    // Footer Items Wiring
    const footerWasmBtn = document.getElementById('footerWasmBtn');
    if (footerWasmBtn) {
      footerWasmBtn.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('technology-story')?.scrollIntoView({ behavior: 'smooth' });
      });
    }

    const footerExtBtn = document.getElementById('footerExtBtn');
    if (footerExtBtn) {
      footerExtBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openExtensionModal();
      });
    }

    const footerFeatureBtn = document.getElementById('footerFeatureBtn');
    if (footerFeatureBtn) {
      footerFeatureBtn.addEventListener('click', (e) => {
        openFeedback(e, 'feature');
      });
    }

    const footerDirectNoteBtn = document.getElementById('footerDirectNoteBtn');
    if (footerDirectNoteBtn) {
      footerDirectNoteBtn.addEventListener('click', (e) => {
        openFeedback(e, 'direct');
      });
    }

    const footerSupportBtn = document.getElementById('footerSupportBtn');
    if (footerSupportBtn) {
      footerSupportBtn.addEventListener('click', (e) => {
        if (e && e.preventDefault) e.preventDefault();
        showSupport();
      });
    }

    const footerAboutBtn = document.getElementById('footerAboutBtn');
    if (footerAboutBtn) {
      footerAboutBtn.addEventListener('click', (e) => {
        showAbout(e);
      });
    }

    // ==========================================================================
    // 6. AUDIENCE DISPATCHES & COMMUNITY REVIEWS CONTROLLER
    // ==========================================================================
    const reviewFilterBtns = document.querySelectorAll('.review-filter-btn');
    const reviewCards = document.querySelectorAll('.review-card');
    const openReviewSubmitBtn = document.getElementById('openReviewSubmitBtn');

    if (reviewFilterBtns.length > 0) {
      reviewFilterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          reviewFilterBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');

          const filter = btn.getAttribute('data-filter') || 'all';

          reviewCards.forEach(card => {
            if (filter === 'all') {
              card.style.display = 'flex';
            } else {
              const categories = card.getAttribute('data-category') || '';
              if (categories.includes(filter)) {
                card.style.display = 'flex';
              } else {
                card.style.display = 'none';
              }
            }
          });
        });
      });
    }

    if (openReviewSubmitBtn) {
      openReviewSubmitBtn.addEventListener('click', (e) => {
        if (e && e.preventDefault) e.preventDefault();
        openFeedback(e, 'cinema');
        const textarea = document.getElementById('feedbackMessage');
        if (textarea) {
          textarea.placeholder = "Tell us about your screening: movie title, container (.mkv, .mp4), distance or network setup, and audio experience...";
          textarea.focus();
        }
      });
    }

    // Top Invite & Dock Invite
    const copyLink = () => {
      const url = `${window.location.origin}/room/${state.roomId}`;
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
    if (el.stageAvatarMicBadge) {
      el.stageAvatarMicBadge.onclick = toggleMicrophone;
    }
    // Helper to bind both click and touchend cleanly without double-triggering
    const bindTap = (button, callback) => {
      if (!button) return;
      let lastTapTime = 0;
      const handler = (e) => {
        const now = Date.now();
        if (now - lastTapTime < 300) return; // Prevent double trigger from touchend + synthetic click
        lastTapTime = now;
        if (e.stopPropagation) e.stopPropagation();
        if (e.cancelable && e.type === 'touchend') e.preventDefault();
        callback(e);
      };
      button.addEventListener('click', handler);
      button.addEventListener('touchend', handler, { passive: false });
    };

    let menuClosingTimer = null;

    const updateMobileSheetBackdrop = () => {
      const isAnyMenuVisible = Boolean(
        (el.micDeviceMenu && !el.micDeviceMenu.classList.contains('hidden') && !el.micDeviceMenu.classList.contains('sheet-closing')) ||
        (el.camDeviceMenu && !el.camDeviceMenu.classList.contains('hidden') && !el.camDeviceMenu.classList.contains('sheet-closing')) ||
        (el.moreOptionsMenu && !el.moreOptionsMenu.classList.contains('hidden') && !el.moreOptionsMenu.classList.contains('sheet-closing')) ||
        (el.activityMenu && !el.activityMenu.classList.contains('hidden') && !el.activityMenu.classList.contains('sheet-closing'))
      );
      if (el.mobileSheetBackdrop) {
        el.mobileSheetBackdrop.classList.toggle('hidden', !isAnyMenuVisible);
      }
      if (el.dockWrapper) {
        el.dockWrapper.classList.toggle('menu-active', isAnyMenuVisible);
      }
    };

    closeAllDeviceMenus = (animate = true) => {
      if (el.dockReactionsBtn) el.dockReactionsBtn.classList.remove('active-status-ring', 'ring-reactions');
      const allMenus = [el.micDeviceMenu, el.camDeviceMenu, el.moreOptionsMenu, el.activityMenu, el.dockReactionsTray];
      const activeMenus = allMenus.filter(m => m && !m.classList.contains('hidden'));
      if (activeMenus.length === 0) return;

      if (!animate) {
        if (menuClosingTimer) {
          clearTimeout(menuClosingTimer);
          menuClosingTimer = null;
        }
        activeMenus.forEach(m => {
          m.classList.add('hidden');
          m.classList.remove('sheet-closing', 'sheet-opening');
        });
        if (el.mobileSheetBackdrop) {
          el.mobileSheetBackdrop.classList.add('hidden');
          el.mobileSheetBackdrop.classList.remove('backdrop-closing');
        }
        if (el.dockWrapper) {
          el.dockWrapper.classList.remove('menu-active');
        }
        return;
      }

      activeMenus.forEach(m => {
        m.classList.remove('sheet-opening');
        m.classList.add('sheet-closing');
      });
      if (el.mobileSheetBackdrop) {
        el.mobileSheetBackdrop.classList.add('backdrop-closing');
      }

      if (menuClosingTimer) clearTimeout(menuClosingTimer);
      menuClosingTimer = setTimeout(() => {
        activeMenus.forEach(m => {
          m.classList.add('hidden');
          m.classList.remove('sheet-closing');
        });
        if (el.mobileSheetBackdrop) {
          el.mobileSheetBackdrop.classList.add('hidden');
          el.mobileSheetBackdrop.classList.remove('backdrop-closing');
        }
        if (el.dockWrapper) {
          el.dockWrapper.classList.remove('menu-active');
        }
        menuClosingTimer = null;
      }, 220);
    };

    const toggleDeviceMenu = (menuToOpen, menusToClose) => {
      if (!menuToOpen) return;
      if (menuClosingTimer) {
        clearTimeout(menuClosingTimer);
        menuClosingTimer = null;
      }

      const isCurrentlyHidden = menuToOpen.classList.contains('hidden') || menuToOpen.classList.contains('sheet-closing');
      menusToClose.forEach(m => {
        m?.classList.add('hidden');
        m?.classList.remove('sheet-closing', 'sheet-opening');
      });

      if (isCurrentlyHidden) {
        menuToOpen.classList.remove('hidden', 'sheet-closing');
        menuToOpen.classList.add('sheet-opening');
        if (state.resetIdleTimer) state.resetIdleTimer();
        updateMobileSheetBackdrop();
      } else {
        closeAllDeviceMenus(true);
        if (state.resetIdleTimer) state.resetIdleTimer();
      }
    };

    // Outside tap listener to dismiss dropdowns & bottom sheets
    const handleOutsideMenuTap = (e) => {
      if (e && e.target && e.target.closest && e.target.closest('.device-menu, .split-dock-btn, .pill-btn, .pill-chevron-btn')) {
        return;
      }
      closeAllDeviceMenus(true);
      document.querySelectorAll('.tile-volume-popover').forEach(p => p.classList.add('hidden'));
    };
    document.addEventListener('click', handleOutsideMenuTap);
    document.addEventListener('touchend', handleOutsideMenuTap, { passive: true });

    if (el.mobileSheetBackdrop) {
      bindTap(el.mobileSheetBackdrop, () => {
        closeAllDeviceMenus(true);
      });
    }

    // Prevent clicks/touches inside menus from bubbling up and closing the menu
    if (el.moreOptionsMenu) {
      el.moreOptionsMenu.addEventListener('click', (e) => e.stopPropagation());
      el.moreOptionsMenu.addEventListener('touchend', (e) => e.stopPropagation(), { passive: true });
    }
    if (el.activityMenu) {
      el.activityMenu.addEventListener('click', (e) => e.stopPropagation());
      el.activityMenu.addEventListener('touchend', (e) => e.stopPropagation(), { passive: true });
    }
    if (el.micDeviceMenu) {
      el.micDeviceMenu.addEventListener('click', (e) => e.stopPropagation());
      el.micDeviceMenu.addEventListener('touchend', (e) => e.stopPropagation(), { passive: true });
    }
    if (el.camDeviceMenu) {
      el.camDeviceMenu.addEventListener('click', (e) => e.stopPropagation());
      el.camDeviceMenu.addEventListener('touchend', (e) => e.stopPropagation(), { passive: true });
    }

    // Mic & Camera Dropdown Chevrons
    bindTap(el.micDeviceDropdownBtn, () => {
      toggleDeviceMenu(el.micDeviceMenu, [el.camDeviceMenu, el.activityMenu, el.moreOptionsMenu]);
    });
    bindTap(el.camDeviceDropdownBtn, () => {
      toggleDeviceMenu(el.camDeviceMenu, [el.micDeviceMenu, el.activityMenu, el.moreOptionsMenu]);
    });

    // Star / Activity Button
    bindTap(el.activityBtn, () => {
      toggleDeviceMenu(el.activityMenu, [el.moreOptionsMenu, el.micDeviceMenu, el.camDeviceMenu]);
    });

    // Three Dots / More Options Button
    bindTap(el.moreOptionsBtn, () => {
      toggleDeviceMenu(el.moreOptionsMenu, [el.activityMenu, el.micDeviceMenu, el.camDeviceMenu]);
    });

    // Activity Menu Items (Poll, Trivia, Soundboard)
    bindTap(el.menuPollBtn, () => {
      closeAllDeviceMenus(false);
      openPollModal();
    });
    bindTap(el.menuTriviaBtn, () => {
      closeAllDeviceMenus(false);
      openTriviaModal();
    });
    bindTap(el.menuSoundboardBtn, () => {
      closeAllDeviceMenus(false);
      if (el.soundboardModal) el.soundboardModal.classList.remove('hidden');
    });

    // More Options Menu Items (Ambient Glow, Screenshare, YouTube, Direct URL)
    bindTap(el.menuAmbientGlowBtn, () => {
      toggleAmbientGlow();
      closeAllDeviceMenus(true);
    });
    bindTap(el.menuScreenshareBtn, () => {
      closeAllDeviceMenus(true);
      toggleScreenShare();
    });
    bindTap(el.menuYouTubeBtn, () => {
      closeAllDeviceMenus(false);
      openYouTubeModal();
    });
    bindTap(el.menuStreamingBtn, () => {
      closeAllDeviceMenus(false);
      openStreamingModal();
    });
    bindTap(el.menuUrlBtn, () => {
      closeAllDeviceMenus(false);
      openUrlModal();
    });

    // YouTube Modal Submit & Close
    if (el.closeYouTubeBtn) el.closeYouTubeBtn.onclick = closeYouTubeModal;
    if (el.cancelYouTubeBtn) el.cancelYouTubeBtn.onclick = closeYouTubeModal;
    if (el.youtubeForm) el.youtubeForm.onsubmit = handleYouTubeSubmit;

    // URL Modal Submit & Close
    if (el.closeUrlBtn) el.closeUrlBtn.onclick = closeUrlModal;
    if (el.cancelUrlBtn) el.cancelUrlBtn.onclick = closeUrlModal;
    if (el.urlForm) el.urlForm.onsubmit = handleUrlSubmit;

    // Streaming Watch Party Modal & Platform Selector
    if (el.closeStreamingBtn) el.closeStreamingBtn.onclick = closeStreamingModal;
    if (el.cancelStreamingBtn) el.cancelStreamingBtn.onclick = closeStreamingModal;
    if (el.streamingForm) el.streamingForm.onsubmit = handleStreamingSubmit;

    if (el.streamingPlatformSelector) {
      const chips = el.streamingPlatformSelector.querySelectorAll('.platform-chip');
      chips.forEach(chip => {
        chip.onclick = () => {
          chips.forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          const plat = chip.getAttribute('data-platform') || 'netflix';
          if (el.streamingPlatformInput) el.streamingPlatformInput.value = plat;
        };
      });
    }

    if (el.openExtGuideBtn) el.openExtGuideBtn.onclick = openExtensionModal;
    if (el.streamingExtensionBtn) el.streamingExtensionBtn.onclick = openExtensionModal;
    if (el.closeExtensionBtn) el.closeExtensionBtn.onclick = closeExtensionModal;
    if (el.dismissExtensionBtn) el.dismissExtensionBtn.onclick = closeExtensionModal;

    if (el.copyExtRoomCodeBtn) {
      el.copyExtRoomCodeBtn.onclick = () => {
        if (state.roomId) {
          navigator.clipboard.writeText(state.roomId).then(() => {
            showToast('Room code copied to clipboard!');
          }).catch(() => {
            showToast(`Room code: ${state.roomId}`);
          });
        }
      };
    }

    if (el.streamingShareTabBtn) {
      el.streamingShareTabBtn.onclick = () => {
        toggleScreenShare();
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

    // Continuous Subtitle Customization Sliders (Real-time input listeners)
    if (el.subFontScaleSlider) {
      el.subFontScaleSlider.addEventListener('input', (e) => {
        state.subFontScale = parseInt(e.target.value, 10) || 100;
        applySubtitleStyling();
      });
    }
    if (el.subTextOpacitySlider) {
      el.subTextOpacitySlider.addEventListener('input', (e) => {
        state.subTextOpacity = parseInt(e.target.value, 10) || 100;
        applySubtitleStyling();
      });
    }
    if (el.subBgBlurSlider) {
      el.subBgBlurSlider.addEventListener('input', (e) => {
        state.subBgBlur = parseInt(e.target.value, 10) || 0;
        applySubtitleStyling();
      });
    }
    if (el.subDelaySlider) {
      el.subDelaySlider.addEventListener('input', (e) => {
        const newOffset = Math.round(parseFloat(e.target.value) * 10) / 10;
        const delta = Math.round((newOffset - state.subOffset) * 10) / 10;
        if (delta !== 0) {
          adjustSubtitleOffset(delta);
        }
      });
    }

    // Dialogue Booster (Night Mode) Toggle
    if (el.dialogueBoosterToggle) {
      el.dialogueBoosterToggle.addEventListener('change', (e) => {
        toggleDialogueBooster(e.target.checked);
      });
    }

    document.querySelectorAll('.sub-style-btn').forEach(btn => {
      btn.onclick = () => {
        const type = btn.getAttribute('data-style-type');
        if (type === 'size') {
          const val = btn.getAttribute('data-val');
          btn.parentElement?.querySelectorAll('.sub-style-btn[data-style-type="size"]').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          if (val === 'normal') state.subFontScale = 100;
          if (val === 'large') state.subFontScale = 135;
          if (val === 'xlarge') state.subFontScale = 175;
          if (el.subFontScaleSlider) el.subFontScaleSlider.value = state.subFontScale;
          applySubtitleStyling();
        } else if (type === 'color') {
          const val = btn.getAttribute('data-val');
          btn.parentElement?.querySelectorAll('.sub-style-btn[data-style-type="color"]').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          state.subColor = val || '#ffffff';
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
    // menuAmbientGlowBtn is already bound via bindTap above
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
      if (confirm('Leave room?')) {
        try {
          if (state.socket) {
            state.socket.emit('leave-room');
            state.socket.disconnect();
          }
          if (state.localStream) {
            state.localStream.getTracks().forEach(t => t.stop());
          }
          if (state.screenStream) {
            state.screenStream.getTracks().forEach(t => t.stop());
          }
        } catch (_) {}
        window.location.href = '/';
      }
    };

    // Layout Toggle (Theater Stage vs Discord Stage Grid View)
    let isGridView = false;
    if (el.layoutToggleBtn) {
      el.layoutToggleBtn.onclick = () => {
        isGridView = !isGridView;
        el.mainWorkspace.classList.toggle('is-grid-view', isGridView);
        el.mainWorkspace.classList.toggle('stage-grid-mode', isGridView);
        if (el.participantStripArea) el.participantStripArea.classList.toggle('stage-grid-mode', isGridView);
        el.layoutToggleBtn.classList.toggle('active-status-ring', isGridView);
        el.layoutToggleBtn.classList.toggle('ring-layout', isGridView);
        renderParticipantStrip();
        showToast(isGridView ? 'Switched to Discord Stage Grid View' : 'Switched to Cinema Stage View');
      };
    }

    // Dock Screen Share Button
    if (el.dockScreenShareBtn) {
      el.dockScreenShareBtn.addEventListener('click', () => {
        toggleScreenShare();
      });
    }

    // Screen Share PiP Focus Button (1-Click Focus Toggle)
    if (el.screenShareFocusBtn) {
      el.screenShareFocusBtn.addEventListener('click', () => {
        swapScreenShareFocus();
      });
    }

    // Dock Reactions Button & Quick Tray
    function toggleDockReactionsTray() {
      if (!el.dockReactionsTray) return;
      const isHidden = el.dockReactionsTray.classList.contains('hidden');
      if (isHidden) {
        closeAllDeviceMenus(false);
        el.dockReactionsTray.classList.remove('hidden');
        if (el.dockReactionsBtn) {
          el.dockReactionsBtn.classList.add('active-status-ring', 'ring-reactions');
        }
      } else {
        closeDockReactionsTray();
      }
    }

    function closeDockReactionsTray() {
      if (el.dockReactionsTray) {
        el.dockReactionsTray.classList.add('hidden');
      }
      if (el.dockReactionsBtn) {
        el.dockReactionsBtn.classList.remove('active-status-ring', 'ring-reactions');
      }
    }

    if (el.dockReactionsBtn) {
      el.dockReactionsBtn.addEventListener('click', (e) => {
        if (e.stopPropagation) e.stopPropagation();
        toggleDockReactionsTray();
      });
    }

    if (el.dockReactionsTray) {
      el.dockReactionsTray.querySelectorAll('.dock-reaction-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
          if (e.stopPropagation) e.stopPropagation();
          const reaction = btn.dataset.reaction || 'heart';
          sendLiveReaction(reaction);
          closeDockReactionsTray();
        });
      });
    }

    // Attach procedural hover sound to all dock and HUD buttons with throttle
    document.addEventListener('mouseover', (e) => {
      const target = e.target.closest && e.target.closest('.pill-btn, .hud-circle-btn, .hud-icon-btn, .pill-chevron-btn, .dock-reaction-item');
      if (target) {
        playUIAudio('hover');
      }
    });

    // 1. Cinema Fullscreen (Red arrow: Cinema Box ONLY - movie theater view)
    const toggleCinemaFullscreen = () => {
      const isCinemaFull = (document.fullscreenElement === el.cinemaBox);
      if (!isCinemaFull) {
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

    // 2. Website Fullscreen (Green arrow: Whole page / F11 mode)
    const toggleWebsiteFullscreen = () => {
      const isFull = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
      if (!isFull) {
        const root = document.documentElement;
        if (root.requestFullscreen) {
          root.requestFullscreen().catch(() => {});
        } else if (root.webkitRequestFullscreen) {
          root.webkitRequestFullscreen();
        } else if (root.msRequestFullscreen) {
          root.msRequestFullscreen();
        }
      } else {
        if (document.fullscreenElement === document.documentElement) {
          if (document.exitFullscreen) {
            document.exitFullscreen().catch(() => {});
          } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
          } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
          }
        } else {
          // If cinema box or another sub-element was fullscreen, promote to website fullscreen
          if (document.exitFullscreen) {
            document.exitFullscreen().then(() => {
              if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen().catch(() => {});
              }
            }).catch(() => {});
          }
        }
      }
    };

    // Red arrow: Movie controls HUD fullscreen button
    if (el.hudFullscreenBtn) el.hudFullscreenBtn.onclick = toggleCinemaFullscreen;
    // Green arrow: Bottom right corner website fullscreen button
    if (el.theaterFullscreenBtn) el.theaterFullscreenBtn.onclick = toggleWebsiteFullscreen;

    document.addEventListener('fullscreenchange', () => {
      const isCinemaFull = (document.fullscreenElement === el.cinemaBox);
      const isDocFull = (document.fullscreenElement === document.documentElement);

      if (el.hudFullscreenExpand && el.hudFullscreenCompress) {
        el.hudFullscreenExpand.classList.toggle('hidden', isCinemaFull);
        el.hudFullscreenCompress.classList.toggle('hidden', !isCinemaFull);
      }

      const theaterExpand = document.getElementById('theaterFullscreenExpand');
      const theaterCompress = document.getElementById('theaterFullscreenCompress');
      if (theaterExpand && theaterCompress) {
        theaterExpand.classList.toggle('hidden', isDocFull);
        theaterCompress.classList.toggle('hidden', !isDocFull);
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
      if (state.currentMovie?.type === 'streaming') {
        const cur = state.streamingCurrentTime || 0;
        const newTime = Math.max(0, cur - 10);
        updateStreamingPlaybackState(state.streamingIsPlaying, newTime);
        if (state.socket) {
          state.socket.emit('host-streaming-sync', { roomId: state.roomId, action: 'rewind10', time: newTime });
        }
        showToast('Rewound 10s');
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
      if (state.currentMovie?.type === 'streaming') {
        const cur = state.streamingCurrentTime || 0;
        const newTime = cur + 10;
        updateStreamingPlaybackState(state.streamingIsPlaying, newTime);
        if (state.socket) {
          state.socket.emit('host-streaming-sync', { roomId: state.roomId, action: 'forward10', time: newTime });
        }
        showToast('Forwarded 10s');
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
      if (el.streamingModal && !el.streamingModal.classList.contains('hidden')) {
        return;
      }
      if (el.extensionModal && !el.extensionModal.classList.contains('hidden')) {
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
        initMovieAudioEngine(el.moviePlayer);
        if (state.movieAudioContext && state.movieAudioContext.state === 'suspended') {
          state.movieAudioContext.resume().catch(() => {});
        }
        if (typeof el.moviePlayer.setSinkId === 'function') {
          el.moviePlayer.setSinkId('').catch(() => {});
        }
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
    if (el.moviePlayer) {
      el.moviePlayer.addEventListener('play', () => {
        initMovieAudioEngine(el.moviePlayer);
        if (state.movieAudioContext && state.movieAudioContext.state === 'suspended') {
          state.movieAudioContext.resume().catch(() => {});
        }
      });
    }
    el.playPauseBtn.onclick = handlePlayPauseToggle;
    if (el.stopMovieBtn) el.stopMovieBtn.onclick = hostStopMovie;
    if (el.modalStopMovieBtn) {
      el.modalStopMovieBtn.onclick = () => {
        hostStopMovie();
        loadMoviesList();
      };
    }
    el.moviePlayer.onclick = (e) => {
      // On mobile / touch devices, tapping the screen toggles HUD controls; desktop clicks toggle play/pause
      if (window.matchMedia('(pointer: coarse)').matches) return;
      if (typeof windowManager !== 'undefined' && windowManager.suppressClick) {
        windowManager.suppressClick = false;
        return;
      }
      handlePlayPauseToggle();
    };
    // Do not open movie library when tapping the stage background/placeholder
    el.openMovieLibraryBtn.onclick = (e) => {
      if (e) e.stopPropagation();
      openMovieModal();
    };
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

  // Plan B: Double-Tap / Gesture Seeking on Cinema Screen
  function initDoubleTapSeeking() {
    const box = el.cinemaBox;
    const rippleLeft = document.getElementById('seekRippleLeft');
    const rippleRight = document.getElementById('seekRippleRight');
    if (!box || !rippleLeft || !rippleRight) return;

    let lastTapTime = 0;
    let lastTapX = 0;

    const handleTap = (clientX, clientY) => {
      const now = Date.now();
      const rect = box.getBoundingClientRect();
      const xRatio = (clientX - rect.left) / rect.width;
      const timeDiff = now - lastTapTime;
      const xDiff = Math.abs(clientX - lastTapX);

      if (timeDiff < 280 && xDiff < 80) {
        if (xRatio <= 0.35) {
          seekRelative(-10);
          rippleLeft.classList.add('active-ripple');
          setTimeout(() => rippleLeft.classList.remove('active-ripple'), 550);
          playUIAudio('hover');
        } else if (xRatio >= 0.65) {
          seekRelative(10);
          rippleRight.classList.add('active-ripple');
          setTimeout(() => rippleRight.classList.remove('active-ripple'), 550);
          playUIAudio('hover');
        }
        lastTapTime = 0;
      } else {
        lastTapTime = now;
        lastTapX = clientX;
      }
    };

    box.addEventListener('click', (e) => {
      if (e.target.closest('#cinemaControls') || e.target.closest('.window-title-bar') || e.target.closest('.window-resize-handle')) {
        return;
      }
      handleTap(e.clientX, e.clientY);
    });

    box.addEventListener('touchend', (e) => {
      if (e.target.closest('#cinemaControls') || e.target.closest('.window-title-bar') || e.target.closest('.window-resize-handle')) {
        return;
      }
      if (e.changedTouches && e.changedTouches[0]) {
        handleTap(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
      }
    }, { passive: true });
  }

  function seekRelative(offsetSec) {
    if (el.moviePlayer && (el.moviePlayer.src || state.currentMovie)) {
      const dur = getEffectiveDuration();
      const newTime = Math.max(0, Math.min(dur, el.moviePlayer.currentTime + offsetSec));
      el.moviePlayer.currentTime = newTime;
      if (state.isHost && state.socket && state.roomId) {
        state.socket.emit('host-seek', {
          roomId: state.roomId,
          currentTime: newTime,
          sentAt: Date.now()
        });
      }
    }
  }

  // Plan B: Cinema Lights-Dimming Focus Mode
  function initCinemaFocusMode() {
    let focusTimeout = null;
    const enterFocus = () => {
      if (el.moviePlayer && !el.moviePlayer.paused && (el.moviePlayer.src || state.currentMovie) && !state.chatOpen) {
        el.appContainer.classList.add('cinema-focus-mode');
      }
    };
    const exitFocus = () => {
      el.appContainer.classList.remove('cinema-focus-mode');
      clearTimeout(focusTimeout);
      if (el.moviePlayer && !el.moviePlayer.paused) {
        focusTimeout = setTimeout(enterFocus, 3000);
      }
    };

    if (el.moviePlayer) {
      el.moviePlayer.addEventListener('play', () => {
        clearTimeout(focusTimeout);
        focusTimeout = setTimeout(enterFocus, 3000);
      });
      el.moviePlayer.addEventListener('pause', exitFocus);
      el.moviePlayer.addEventListener('ended', exitFocus);
    }

    ['mousemove', 'mousedown', 'touchstart', 'touchmove', 'keydown'].forEach(evt => {
      window.addEventListener(evt, exitFocus, { passive: true });
    });
  }

  // Plan A: Network Connection Quality Real-Time Monitor
  function startNetworkQualityMonitor() {
    setInterval(async () => {
      if (!state.inRoom) return;

      const selfBadge = document.getElementById(`tile-net-${state.selfId}`);
      if (selfBadge) {
        const text = selfBadge.querySelector('.net-latency-text');
        if (text) text.textContent = '12ms';
      }

      for (const [peerId, pc] of state.peerConnections.entries()) {
        const badge = document.getElementById(`tile-net-${peerId}`);
        if (!badge || !pc || pc.connectionState === 'closed') continue;

        try {
          const stats = await pc.getStats();
          let rtt = 28;
          stats.forEach(report => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded' && typeof report.currentRoundTripTime === 'number') {
              rtt = Math.round(report.currentRoundTripTime * 1000);
            }
          });

          badge.classList.remove('net-good', 'net-fair', 'net-poor');
          if (rtt <= 80) {
            badge.classList.add('net-good');
            badge.title = `Connection: Good (${rtt}ms)`;
          } else if (rtt <= 200) {
            badge.classList.add('net-fair');
            badge.title = `Connection: Fair (${rtt}ms)`;
          } else {
            badge.classList.add('net-poor');
            badge.title = `Connection: Poor (${rtt}ms)`;
          }
          const text = badge.querySelector('.net-latency-text');
          if (text) text.textContent = `${rtt}ms`;
        } catch (e) {}
      }
    }, 3500);
  }

    setupUploadDropzone();
    setupPlayerEvents();

    initAmbientGlow();
    initMobileGestures();
    initSubtitleDragAndDrop();
    initWindowManagement();
    setupMiniPlayerControls();
    setupMiniPlayerModalObserver();
    initDoubleTapSeeking();
    initCinemaFocusMode();
    startNetworkQualityMonitor();

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => {
        if (state.chatOpen && window.innerWidth <= 768 && el.chatSidebar) {
          el.chatSidebar.style.height = `${window.visualViewport.height}px`;
          if (el.chatMessages) {
            el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
          }
        }
      });
    }

    const handleOrientationOrResize = () => {
      if (state.inRoom) renderParticipantStrip();
    };

    let orientationTimer = null;
    window.addEventListener('resize', () => {
      handleOrientationOrResize();
      clearTimeout(orientationTimer);
      orientationTimer = setTimeout(handleOrientationOrResize, 100);
    });
    window.addEventListener('orientationchange', () => {
      handleOrientationOrResize();
      setTimeout(handleOrientationOrResize, 100);
    });
  }

  // Register PWA Service Worker for mobile standalone display (removes address bar when installed)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }

  window.addEventListener('beforeunload', () => {
    try { disableMicrophone(); } catch (e) {}
  });

  window.__lumiere = {
    state,
    renderParticipantStrip,
    isPortraitMode,
    toggleChat,
    closeAllDeviceMenus: (...args) => closeAllDeviceMenus && closeAllDeviceMenus(...args)
  };

  window.addEventListener('DOMContentLoaded', init);
})();
