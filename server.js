const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const os = require('os');
const cors = require('cors');
const multer = require('multer');
const selfsigned = require('selfsigned');

// Configure ffmpeg & ffprobe
const ffmpeg = require('fluent-ffmpeg');
try {
  const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
  const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
  ffmpeg.setFfmpegPath(ffmpegInstaller.path);
  ffmpeg.setFfprobePath(ffprobeInstaller.path);
  console.log('[FFmpeg] Using bundled FFmpeg at:', ffmpegInstaller.path);
  console.log('[FFprobe] Using bundled FFprobe at:', ffprobeInstaller.path);
} catch (err) {
  console.log('[FFmpeg] Bundled installer not found, falling back to system PATH');
}

const app = express();

// Helper: Get local network IPv4 address (e.g. 192.168.x.x or Tailscale 100.x.x.x)
function getNetworkIps() {
  const interfaces = os.networkInterfaces();
  const ips = { local: 'localhost', tailscale: null };
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (iface.address.startsWith('100.')) {
          ips.tailscale = iface.address;
        } else if (!ips.local || ips.local === 'localhost') {
          ips.local = iface.address;
        }
      }
    }
  }
  return ips;
}

const networkIps = getNetworkIps();
const hostIp = networkIps.tailscale || networkIps.local || 'localhost';

// Load or generate self-signed SSL Certificate for HTTPS (required for Camera & Mic on mobile/tablets)
const certPath = path.join(__dirname, 'cert.pem');
const keyPath = path.join(__dirname, 'key.pem');
let sslCredentials = null;

try {
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    sslCredentials = {
      cert: fs.readFileSync(certPath, 'utf8'),
      key: fs.readFileSync(keyPath, 'utf8')
    };
    console.log('[SSL] HTTPS certificates loaded successfully.');
  }
} catch (e) {
  console.warn('[SSL Warning] Could not load SSL certificates:', e.message);
}

// Create HTTP and HTTPS Servers
const HTTP_PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

const httpServer = http.createServer(app);
const httpsServer = sslCredentials ? https.createServer(sslCredentials, app) : null;

// Attach Socket.io to both servers
const io = new Server({
  cors: { origin: '*' }
});
io.attach(httpServer);
if (httpsServer) {
  io.attach(httpsServer);
}
const MOVIES_DIR = path.join(__dirname, 'movies');

if (!fs.existsSync(MOVIES_DIR)) {
  fs.mkdirSync(MOVIES_DIR, { recursive: true });
}

// Multer setup for drag-and-drop movie upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MOVIES_DIR),
  filename: (req, file, cb) => {
    // Preserve original filename
    cb(null, file.originalname);
  }
});
const upload = multer({ storage });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper: Get local network IPv4 address (e.g. 192.168.x.x)
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Format file size
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Format seconds to HH:MM:SS
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00';
  const sec = Math.floor(seconds);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// ------------------------------------------------------------------
// REST APIs
// ------------------------------------------------------------------

// 1. Get Network Info
app.get('/api/info', (req, res) => {
  const ips = getNetworkIps();
  res.json({
    localIp: ips.local,
    tailscaleIp: ips.tailscale,
    httpPort: HTTP_PORT,
    httpsPort: HTTPS_PORT,
    moviesDir: MOVIES_DIR
  });
});

// 2. List Movies (shows all MKV, MP4, WebM movies)
app.get('/api/movies', (req, res) => {
  try {
    const files = fs.readdirSync(MOVIES_DIR);
    const movieExtensions = ['.mp4', '.mkv', '.webm', '.mov', '.avi', '.m4v'];
    
    const filtered = files.filter(file => movieExtensions.includes(path.extname(file).toLowerCase()));

    // Natural alphabetical sort
    filtered.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    const movies = filtered.map(file => {
      const fullPath = path.join(MOVIES_DIR, file);
      const stats = fs.statSync(fullPath);
      return {
        filename: file,
        sizeBytes: stats.size,
        size: formatBytes(stats.size),
        extension: path.extname(file).toLowerCase(),
        modifiedAt: stats.mtime
      };
    });

    res.json({ success: true, movies });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Upload Movie
app.post('/api/upload', upload.single('movie'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }

  res.json({
    success: true,
    file: {
      filename: req.file.originalname,
      size: formatBytes(req.file.size)
    }
  });
});

// 3.5 Feedback Collector
app.post('/api/feedback', (req, res) => {
  try {
    const { name, message, category, rating } = req.body || {};
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Feedback message is required' });
    }

    const feedbackFile = path.join(__dirname, 'feedback.json');
    let feedbacks = [];
    if (fs.existsSync(feedbackFile)) {
      try {
        feedbacks = JSON.parse(fs.readFileSync(feedbackFile, 'utf8'));
      } catch (e) {
        feedbacks = [];
      }
    }

    const item = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      name: (name && name.trim()) || 'Anonymous',
      message: message.trim(),
      category: category || 'general',
      rating: rating || 5,
      timestamp: new Date().toISOString()
    };

    feedbacks.push(item);
    fs.writeFileSync(feedbackFile, JSON.stringify(feedbacks, null, 2), 'utf8');

    console.log(`[Feedback Received] From: ${item.name} (${item.category}): ${item.message}`);
    res.json({ success: true, item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Probe Movie (Audio tracks, Subtitles & Seekability)
app.get('/api/probe', (req, res) => {
  const filename = req.query.file;
  if (!filename) return res.status(400).json({ error: 'file query parameter required' });

  const safePath = path.join(MOVIES_DIR, path.basename(filename));
  if (!fs.existsSync(safePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const fileExt = path.extname(safePath).toLowerCase();
  const isSeekable = fileExt === '.mp4' || fileExt === '.webm';

  ffmpeg.ffprobe(safePath, (err, metadata) => {
    if (err) {
      console.error('[FFprobe Error]', err);
      return res.status(500).json({ error: 'Failed to inspect media', details: err.message });
    }

    const duration = metadata.format.duration || 0;
    const streams = metadata.streams || [];

    // Extract audio tracks
    const audioTracks = streams
      .filter(s => s.codec_type === 'audio')
      .map((s, idx) => {
        const lang = s.tags && (s.tags.language || s.tags.LANGUAGE);
        const title = s.tags && (s.tags.title || s.tags.TITLE);
        let label = title || '';
        if (lang) label = label ? `${label} (${lang})` : `Language: ${lang}`;
        if (!label) label = `Track ${idx + 1} (${s.codec_name})`;

        return {
          streamIndex: s.index,
          trackIndex: idx,
          label: label,
          codec: s.codec_name,
          channels: s.channels
        };
      });

    // Extract subtitle tracks
    const subtitleTracks = streams
      .filter(s => s.codec_type === 'subtitle')
      .map((s, idx) => {
        const lang = s.tags && (s.tags.language || s.tags.LANGUAGE);
        const title = s.tags && (s.tags.title || s.tags.TITLE);
        let label = title || '';
        if (lang) label = label ? `${label} (${lang})` : `Language: ${lang}`;
        if (!label) label = `Subtitle ${idx + 1} (${s.codec_name})`;

        return {
          streamIndex: s.index,
          subtitleIndex: idx,
          label: label,
          codec: s.codec_name
        };
      });

    res.json({
      duration,
      durationFormatted: formatDuration(duration),
      format: metadata.format.format_name,
      isSeekable,
      audioTracks,
      subtitleTracks
    });
  });
});

// Lightweight codec cache to avoid repeated ffprobe calls
const mediaCodecCache = new Map();

function getVideoCodecInfo(filePath, callback) {
  if (mediaCodecCache.has(filePath)) {
    return callback(null, mediaCodecCache.get(filePath));
  }
  ffmpeg.ffprobe(filePath, (err, meta) => {
    if (err) return callback(err, null);
    const vStream = (meta.streams || []).find(s => s.codec_type === 'video');
    const info = {
      codec: vStream ? vStream.codec_name : null,
      colorRange: vStream ? vStream.color_range : null
    };
    mediaCodecCache.set(filePath, info);
    callback(null, info);
  });
}

// 5. Video Stream Endpoint (with multi-audio track mapping & live MKV streaming)
app.get('/api/stream', (req, res) => {
  const filename = req.query.file;
  if (!filename) return res.status(400).send('Missing file parameter');

  const safePath = path.join(MOVIES_DIR, path.basename(filename));
  if (!fs.existsSync(safePath)) return res.status(404).send('File not found');

  const ext = path.extname(safePath).toLowerCase();
  const audioIndex = parseInt(req.query.audio, 10) || 0;
  const startTime = parseFloat(req.query.start) || 0;

  // If natively MP4 or WebM AND using default audio (track 0), serve directly with HTTP 206 Byte Ranges:
  if ((ext === '.mp4' || ext === '.webm') && audioIndex === 0) {
    const stat = fs.statSync(safePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize) {
        res.status(416).set('Content-Range', `bytes */${fileSize}`).send();
        return;
      }

      const chunksize = end - start + 1;
      const fileStream = fs.createReadStream(safePath, { start, end });

      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': ext === '.webm' ? 'video/webm' : 'video/mp4'
      };

      res.writeHead(206, head);
      fileStream.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Accept-Ranges': 'bytes',
        'Content-Type': ext === '.webm' ? 'video/webm' : 'video/mp4'
      };
      res.writeHead(200, head);
      fs.createReadStream(safePath).pipe(res);
    }
    return;
  }

  // When file is MKV OR a non-default audio track is selected:
  // Stream in real-time with FFmpeg, mapping the exact chosen audio track and starting at seek point
  res.writeHead(200, {
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'none',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Connection': 'keep-alive'
  });

  getVideoCodecInfo(safePath, (err, codecInfo) => {
    const vCodec = codecInfo ? codecInfo.codec : null;
    const command = ffmpeg(safePath);

    const inputOptions = [
      '-fflags +genpts+discardcorrupt'
    ];

    if (startTime > 0) {
      inputOptions.push('-noaccurate_seek');
      command.seekInput(startTime);
    }

    command.inputOptions(inputOptions);

    const outputOptions = [
      '-map 0:V:0',
      `-map 0:a:${audioIndex}?`,
      '-c:v copy'
    ];

    // Hardware acceleration and color range tags for mobile/cross-platform players
    if (vCodec === 'hevc') {
      outputOptions.push('-tag:v hvc1');
      outputOptions.push('-bsf:v hevc_metadata=video_full_range_flag=0');
    } else if (vCodec === 'h264') {
      outputOptions.push('-bsf:v h264_metadata=video_full_range_flag=0');
    }

    // Audio filter:
    // When playing from start (startTime === 0), use first_pts=0 to preserve initial container offsets.
    // When seeking (startTime > 0), do NOT use first_pts=0 because -noaccurate_seek already snaps
    // both streams to the keyframe and first_pts=0 would inject seconds of silence!
    const audioFilter = (startTime > 0)
      ? 'aresample=async=1'
      : 'aresample=async=1:first_pts=0';

    outputOptions.push(
      '-c:a aac',
      '-b:a 192k',
      '-ac 2',
      '-ar 48000',
      `-af ${audioFilter}`,
      '-avoid_negative_ts make_zero',
      '-movflags frag_keyframe+empty_moov+default_base_moof',
      '-flush_packets 1',
      '-f mp4'
    );

    command
      .outputOptions(outputOptions)
      .on('start', (cmdLine) => {
        console.log(`[Stream Started] File: ${path.basename(safePath)}, Audio: ${audioIndex}, Start: ${startTime}s, Codec: ${vCodec}`);
      })
      .on('error', (err) => {
        if (!err.message.includes('Output stream closed') && !err.message.includes('SIGKILL')) {
          console.warn('[Stream Notice]', err.message);
        }
      });

    const ffmpegStream = command.pipe();
    ffmpegStream.pipe(res);

    req.on('close', () => {
      try {
        command.kill('SIGKILL');
      } catch (e) {}
    });
  });
});

// 6. Subtitles to WebVTT Endpoint
app.get('/api/subtitles', (req, res) => {
  const filename = req.query.file;
  const subtitleIndex = parseInt(req.query.track, 10) || 0;
  if (!filename) return res.status(400).send('Missing file parameter');

  const safePath = path.join(MOVIES_DIR, path.basename(filename));
  if (!fs.existsSync(safePath)) return res.status(404).send('File not found');

  res.setHeader('Content-Type', 'text/vtt; charset=utf-8');

  const command = ffmpeg(safePath)
    .outputOptions([
      `-map 0:s:${subtitleIndex}`,
      '-f webvtt'
    ])
    .on('error', (err) => {
      console.warn('[Subtitle Stream Error]', err.message);
    });

  command.pipe(res);
});

// ------------------------------------------------------------------
// Socket.io Real-Time Room & Playback Synchronization
// ------------------------------------------------------------------

// Discord-like avatar background colors
const DISCORD_COLORS = [
  '#5865F2', // Blurple
  '#57F287', // Green
  '#FEE75C', // Yellow
  '#EB459E', // Fuchsia
  '#ED4245', // Red
  '#9B59B6', // Purple
  '#E67E22', // Orange
  '#1ABC9C'  // Teal
];

// In-memory room store: roomId -> room object
const rooms = new Map();

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      id: roomId,
      hostId: null,
      currentMovie: null,
      audioTrack: 0,
      subtitleTrack: null,
      currentTime: 0,
      isPlaying: false,
      lastUpdate: Date.now(),
      members: new Map() // socket.id -> member
    });
  }
  return rooms.get(roomId);
}

io.on('connection', (socket) => {
  let currentRoomId = null;

  // 1. Join Room
  socket.on('join-room', ({ roomId, username }) => {
    currentRoomId = roomId;
    socket.join(roomId);

    const room = getOrCreateRoom(roomId);
    const isFirstMember = room.members.size === 0;

    if (isFirstMember || !room.hostId) {
      room.hostId = socket.id;
    }

    const randomColor = DISCORD_COLORS[Math.floor(Math.random() * DISCORD_COLORS.length)];

    const memberInfo = {
      id: socket.id,
      username: username || `User_${socket.id.substring(0, 4)}`,
      color: randomColor,
      isHost: room.hostId === socket.id,
      isMuted: false,
      isDeafened: false,
      isCamOn: false,
      isSpeaking: false
    };

    room.members.set(socket.id, memberInfo);

    // Calculate current estimated playback time if playing
    let estimatedTime = room.currentTime;
    if (room.isPlaying && room.lastUpdate) {
      const elapsed = (Date.now() - room.lastUpdate) / 1000;
      estimatedTime += elapsed;
    }

    // Send full current room state to joining user
    socket.emit('room-joined', {
      roomId,
      selfId: socket.id,
      isHost: memberInfo.isHost,
      hostId: room.hostId,
      currentMovie: room.currentMovie,
      audioTrack: room.audioTrack,
      subtitleTrack: room.subtitleTrack,
      currentTime: estimatedTime,
      isPlaying: room.isPlaying,
      members: Array.from(room.members.values())
    });

    // Notify other participants in the room
    socket.to(roomId).emit('member-joined', memberInfo);

    console.log(`[Room ${roomId}] ${memberInfo.username} joined. Host: ${room.hostId === socket.id}`);
  });

  // Disrupted Member Instant Auto-Resync
  socket.on('request-room-sync', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    let estimatedTime = room.currentTime;
    if (room.isPlaying && room.lastUpdate) {
      const elapsed = (Date.now() - room.lastUpdate) / 1000;
      estimatedTime += elapsed;
    }

    socket.emit('room-synced', {
      currentMovie: room.currentMovie,
      audioTrack: room.audioTrack,
      subtitleTrack: room.subtitleTrack,
      currentTime: estimatedTime,
      isPlaying: room.isPlaying
    });
  });

  // 2. Host Playback Controls
  socket.on('host-play', ({ roomId, time }) => {
    const room = rooms.get(roomId);
    if (!room || room.hostId !== socket.id) return;

    room.isPlaying = true;
    room.currentTime = time;
    room.lastUpdate = Date.now();

    socket.to(roomId).emit('sync-play', { time });
  });

  socket.on('host-pause', ({ roomId, time }) => {
    const room = rooms.get(roomId);
    if (!room || room.hostId !== socket.id) return;

    room.isPlaying = false;
    room.currentTime = time;
    room.lastUpdate = Date.now();

    socket.to(roomId).emit('sync-pause', { time });
  });

  socket.on('host-seek', ({ roomId, time }) => {
    const room = rooms.get(roomId);
    if (!room || room.hostId !== socket.id) return;

    room.currentTime = time;
    room.lastUpdate = Date.now();

    socket.to(roomId).emit('sync-seek', { time });
  });

  socket.on('host-set-movie', ({ roomId, movie, audioTrack, subtitleTrack }) => {
    const room = rooms.get(roomId);
    if (!room || room.hostId !== socket.id) return;

    room.currentMovie = movie;
    room.audioTrack = audioTrack || 0;
    room.subtitleTrack = subtitleTrack !== undefined ? subtitleTrack : null;
    room.currentTime = 0;
    room.isPlaying = false;
    room.lastUpdate = Date.now();

    io.in(roomId).emit('sync-movie-changed', {
      movie: room.currentMovie,
      audioTrack: room.audioTrack,
      subtitleTrack: room.subtitleTrack
    });
  });

  socket.on('host-set-tracks', ({ roomId, audioTrack, subtitleTrack, currentTime }) => {
    const room = rooms.get(roomId);
    if (!room || room.hostId !== socket.id) return;

    room.audioTrack = audioTrack;
    room.subtitleTrack = subtitleTrack;
    if (typeof currentTime === 'number' && !isNaN(currentTime)) {
      room.currentTime = currentTime;
      room.lastUpdate = Date.now();
    }

    io.in(roomId).emit('sync-tracks-changed', {
      audioTrack: room.audioTrack,
      subtitleTrack: room.subtitleTrack,
      currentTime: room.currentTime
    });
  });

  // Host regular heartbeat (every 2-3s) to prevent client drift
  socket.on('host-heartbeat', ({ roomId, time, isPlaying }) => {
    const room = rooms.get(roomId);
    if (!room || room.hostId !== socket.id) return;

    room.currentTime = time;
    room.isPlaying = isPlaying;
    room.lastUpdate = Date.now();

    socket.to(roomId).emit('sync-heartbeat', { time, isPlaying });
  });

  // 3. User Voice / Mic / Cam Status Updates
  socket.on('update-mic-status', ({ roomId, isMuted }) => {
    const room = rooms.get(roomId);
    if (!room || !room.members.has(socket.id)) return;

    const member = room.members.get(socket.id);
    member.isMuted = isMuted;
    if (isMuted) member.isSpeaking = false;

    io.in(roomId).emit('member-status-changed', {
      id: socket.id,
      isMuted: member.isMuted,
      isSpeaking: member.isSpeaking,
      isCamOn: member.isCamOn
    });
  });

  socket.on('update-cam-status', ({ roomId, isCamOn }) => {
    const room = rooms.get(roomId);
    if (!room || !room.members.has(socket.id)) return;

    const member = room.members.get(socket.id);
    member.isCamOn = isCamOn;

    io.in(roomId).emit('member-status-changed', {
      id: socket.id,
      isMuted: member.isMuted,
      isSpeaking: member.isSpeaking,
      isCamOn: member.isCamOn
    });
  });

  socket.on('update-speaking-status', ({ roomId, isSpeaking }) => {
    const room = rooms.get(roomId);
    if (!room || !room.members.has(socket.id)) return;

    const member = room.members.get(socket.id);
    if (member.isMuted) return;
    member.isSpeaking = isSpeaking;

    socket.to(roomId).emit('member-speaking-changed', {
      id: socket.id,
      isSpeaking: member.isSpeaking
    });
  });

  // 4. WebRTC Peer-to-Peer Signaling (for audio & video)
  socket.on('webrtc-offer', ({ targetId, offer }) => {
    io.to(targetId).emit('webrtc-offer', {
      senderId: socket.id,
      offer
    });
  });

  socket.on('webrtc-answer', ({ targetId, answer }) => {
    io.to(targetId).emit('webrtc-answer', {
      senderId: socket.id,
      answer
    });
  });

  socket.on('webrtc-ice', ({ targetId, candidate }) => {
    io.to(targetId).emit('webrtc-ice', {
      senderId: socket.id,
      candidate
    });
  });

  // 5. In-Room Chat Messages
  socket.on('send-chat', ({ roomId, text }) => {
    const room = rooms.get(roomId);
    if (!room || !room.members.has(socket.id)) return;

    const member = room.members.get(socket.id);
    const msg = {
      id: Date.now() + Math.random().toString(36).substr(2, 4),
      senderId: socket.id,
      username: member.username,
      color: member.color,
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    io.in(roomId).emit('chat-message', msg);
  });

  // 6. Handle Disconnect
  socket.on('disconnect', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    const member = room.members.get(socket.id);
    room.members.delete(socket.id);

    console.log(`[Room ${currentRoomId}] ${member ? member.username : socket.id} disconnected.`);

    // If host left, elect the next user as host
    if (room.hostId === socket.id) {
      if (room.members.size > 0) {
        const nextHostId = room.members.keys().next().value;
        room.hostId = nextHostId;
        const nextHost = room.members.get(nextHostId);
        nextHost.isHost = true;
        io.in(currentRoomId).emit('host-changed', {
          newHostId: nextHostId,
          newHostName: nextHost.username
        });
        console.log(`[Room ${currentRoomId}] New host elected: ${nextHost.username}`);
      } else {
        // Room empty, clean up
        rooms.delete(currentRoomId);
        console.log(`[Room ${currentRoomId}] Room closed (empty).`);
        return;
      }
    }

    io.in(currentRoomId).emit('member-left', { id: socket.id });
  });
});

// Start Servers with auto-fallback if port is busy
let isHttpsStarted = false;

function startHttp(port) {
  httpServer.listen(port, '0.0.0.0', () => {
    const ips = getNetworkIps();
    console.log('================================================================');
    console.log('               🎬 LUMIÈRE PRIVATE CINEMA SERVER                 ');
    console.log('================================================================');
    console.log('  [HTTP - Standard Browsing]');
    console.log(`  > Local Host PC:     http://localhost:${port}`);
    if (ips.local !== 'localhost') console.log(`  > Local Wi-Fi:       http://${ips.local}:${port}`);
    if (ips.tailscale) console.log(`  > Tailscale:         http://${ips.tailscale}:${port}`);
    console.log('----------------------------------------------------------------');
    if (!isHttpsStarted) {
      isHttpsStarted = true;
      startHttps(HTTPS_PORT);
    }
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[Notice] HTTP Port ${port} is busy, trying ${port + 1}...`);
      startHttp(port + 1);
    } else {
      console.error('[HTTP Error]', err.message);
    }
  });
}

function startHttps(port) {
  if (!httpsServer) {
    console.log('================================================================');
    return;
  }
  httpsServer.listen(port, '0.0.0.0', () => {
    const ips = getNetworkIps();
    console.log('  [HTTPS - Camera & Mic for Tablets / Phones]');
    console.log(`  > Local Host PC:     https://localhost:${port}`);
    if (ips.local !== 'localhost') console.log(`  > Local Wi-Fi:       https://${ips.local}:${port}`);
    if (ips.tailscale) console.log(`  > Tailscale:         https://${ips.tailscale}:${port}`);
    console.log('================================================================');
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[Notice] HTTPS Port ${port} is busy, trying ${port + 1}...`);
      startHttps(port + 1);
    } else {
      console.error('[HTTPS Error]', err.message);
    }
  });
}

startHttp(HTTP_PORT);
