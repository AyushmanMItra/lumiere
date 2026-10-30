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
const zlib = require('zlib');

// Configure ffmpeg & ffprobe
const ffmpeg = require('fluent-ffmpeg');
const isTermux = Boolean(process.env.TERMUX_VERSION || (process.env.PREFIX && process.env.PREFIX.includes('com.termux')));

if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
  console.log('[FFmpeg] Using custom FFMPEG_PATH:', process.env.FFMPEG_PATH);
} else if (!isTermux) {
  try {
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
    if (ffmpegInstaller.path && fs.existsSync(ffmpegInstaller.path)) {
      ffmpeg.setFfmpegPath(ffmpegInstaller.path);
      console.log('[FFmpeg] Using bundled FFmpeg at:', ffmpegInstaller.path);
    }
  } catch (err) {
    console.log('[FFmpeg] Bundled installer not found, falling back to system PATH');
  }
} else {
  console.log('[FFmpeg] Android/Termux environment detected: using system ffmpeg');
}

if (process.env.FFPROBE_PATH) {
  ffmpeg.setFfprobePath(process.env.FFPROBE_PATH);
  console.log('[FFprobe] Using custom FFPROBE_PATH:', process.env.FFPROBE_PATH);
} else if (!isTermux) {
  try {
    const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
    if (ffprobeInstaller.path && fs.existsSync(ffprobeInstaller.path)) {
      ffmpeg.setFfprobePath(ffprobeInstaller.path);
      console.log('[FFprobe] Using bundled FFprobe at:', ffprobeInstaller.path);
    }
  } catch (err) {
    console.log('[FFprobe] Bundled installer not found, falling back to system PATH');
  }
} else {
  console.log('[FFprobe] Android/Termux environment detected: using system ffprobe');
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
  } else {
    console.log('[SSL] Generating self-signed certificates for HTTPS...');
    const pems = selfsigned.generate([{ name: 'commonName', value: 'localhost' }], { days: 365 });
    try {
      fs.writeFileSync(certPath, pems.cert, 'utf8');
      fs.writeFileSync(keyPath, pems.private, 'utf8');
    } catch (writeErr) {
      console.warn('[SSL Notice] Could not save cert files to disk, using in-memory SSL:', writeErr.message);
    }
    sslCredentials = {
      cert: pems.cert,
      key: pems.private
    };
    console.log('[SSL] Generated self-signed certificates successfully.');
  }
} catch (e) {
  console.warn('[SSL Warning] Could not load or generate SSL certificates:', e.message);
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

// 3.6 Official Maker Support & Anti-Fraud Verification
app.get('/api/support-info', (req, res) => {
  res.json({
    verified: true,
    maker: 'Ayushman Mitra',
    github: 'https://github.com/AyushmanMItra',
    upiId: 'ayushmanmitra@upi',
    officialQrUrl: 'https://raw.githubusercontent.com/AyushmanMItra/lumiere/main/public/support-qr.png',
    tamperProtected: true
  });
});

// 3.7 Extension Info and Download
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
  }
  CRC_TABLE[i] = c;
}

function calculateCrc32(buf) {
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

function packageZip(files) {
  const localChunks = [];
  const cdChunks = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name.replace(/\\/g, '/'), 'utf8');
    const dataBuf = f.data;
    const deflated = zlib.deflateRawSync(dataBuf);
    const useDeflate = deflated.length < dataBuf.length;
    const compData = useDeflate ? deflated : dataBuf;
    const method = useDeflate ? 8 : 0;
    const crc = calculateCrc32(dataBuf);

    // Local file header (30 bytes)
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt16LE(0, 6);
    lfh.writeUInt16LE(method, 8);
    lfh.writeUInt16LE(0, 10);
    lfh.writeUInt16LE(0, 12);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(compData.length, 18);
    lfh.writeUInt32LE(dataBuf.length, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);

    localChunks.push(lfh, nameBuf, compData);

    // Central directory header (46 bytes)
    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);
    cdh.writeUInt16LE(20, 4);
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(0, 8);
    cdh.writeUInt16LE(method, 10);
    cdh.writeUInt16LE(0, 12);
    cdh.writeUInt16LE(0, 14);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(compData.length, 20);
    cdh.writeUInt32LE(dataBuf.length, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30);
    cdh.writeUInt16LE(0, 32);
    cdh.writeUInt16LE(0, 34);
    cdh.writeUInt16LE(0, 36);
    cdh.writeUInt32LE(0, 38);
    cdh.writeUInt32LE(offset, 42);

    cdChunks.push(cdh, nameBuf);
    offset += lfh.length + nameBuf.length + compData.length;
  }

  const cdOffset = offset;
  let cdSize = 0;
  for (const c of cdChunks) cdSize += c.length;

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, ...cdChunks, eocd]);
}

app.get('/api/extension/info', (req, res) => {
  res.json({
    name: 'Lumiere - Watch Party Sync',
    version: '1.1.0',
    description: 'Synchronize Netflix, Prime Video, JioHotstar, Zee5, Disney+, and SonyLIV with Lumiere.',
    platforms: [
      { id: 'netflix', name: 'Netflix', color: '#E50914', url: 'https://www.netflix.com' },
      { id: 'primevideo', name: 'Prime Video', color: '#00A8E1', url: 'https://www.primevideo.com' },
      { id: 'jiohotstar', name: 'JioHotstar', color: '#0C2044', url: 'https://www.hotstar.com' },
      { id: 'zee5', name: 'Zee5', color: '#8230C6', url: 'https://www.zee5.com' },
      { id: 'disneyplus', name: 'Disney+', color: '#113CCF', url: 'https://www.disneyplus.com' },
      { id: 'sonyliv', name: 'SonyLIV', color: '#1F4A85', url: 'https://www.sonyliv.com' }
    ],
    downloadUrl: '/api/extension/download'
  });
});

// Android APK Direct Download Endpoint
app.get(['/lumiere.apk', '/download/apk', '/apk'], (req, res) => {
  const apkPath = path.join(__dirname, 'lumiere.apk');
  if (fs.existsSync(apkPath)) {
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="lumiere.apk"');
    res.sendFile(apkPath);
  } else {
    res.status(404).send('APK not found. Run python build_apk.py to generate it.');
  }
});

app.get('/api/extension/download', (req, res) => {
  try {
    const extDir = path.join(__dirname, 'extension');
    if (!fs.existsSync(extDir)) {
      return res.status(404).json({ error: 'Extension directory not found' });
    }

    function collectFiles(dir, baseDir = '') {
      let results = [];
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const fullPath = path.join(dir, file);
        const relPath = path.join(baseDir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          results = results.concat(collectFiles(fullPath, relPath));
        } else {
          results.push({
            name: relPath.replace(/\\/g, '/'),
            data: fs.readFileSync(fullPath)
          });
        }
      }
      return results;
    }

    const files = collectFiles(extDir);
    const zipBuffer = packageZip(files);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="lumiere-watch-party-extension.zip"');
    res.setHeader('Content-Length', zipBuffer.length);
    res.send(zipBuffer);
  } catch (err) {
    console.error('[Extension Download Error]', err);
    res.status(500).json({ error: 'Failed to generate extension zip', details: err.message });
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
      if (!err.message.includes('Output stream closed') && !err.message.includes('SIGKILL')) {
        console.warn('[Subtitle Stream Error]', err.message);
      }
    });

  command.pipe(res);

  req.on('close', () => {
    try {
      command.kill('SIGKILL');
    } catch (e) {}
  });
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
      playbackRate: 1.0,
      activePoll: null,
      activeTrivia: null,
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

    const hostMember = room.members.get(room.hostId);
    const isHost = (room.hostId === socket.id) || Boolean(hostMember && username && hostMember.username === username);

    const memberInfo = {
      id: socket.id,
      username: username || `User_${socket.id.substring(0, 4)}`,
      color: randomColor,
      isHost: isHost,
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
      screenShare: room.screenShare || null,
      audioTrack: room.audioTrack,
      subtitleTrack: room.subtitleTrack,
      playbackRate: room.playbackRate || 1.0,
      activePoll: room.activePoll || null,
      activeTrivia: room.activeTrivia || null,
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
      screenShare: room.screenShare || null,
      audioTrack: room.audioTrack,
      subtitleTrack: room.subtitleTrack,
      playbackRate: room.playbackRate || 1.0,
      activePoll: room.activePoll || null,
      activeTrivia: room.activeTrivia || null,
      currentTime: estimatedTime,
      isPlaying: room.isPlaying
    });
  });

  // 2. Playback & Stream Controls (Host and Room Members)
  socket.on('host-play', ({ roomId, time }) => {
    const room = rooms.get(roomId);
    if (!room || !room.members.has(socket.id)) return;

    room.isPlaying = true;
    if (typeof time === 'number' && !isNaN(time)) {
      room.currentTime = time;
    }
    room.lastUpdate = Date.now();

    socket.to(roomId).emit('sync-play', { time: room.currentTime });
    if (room.currentMovie?.type === 'streaming') {
      socket.to(roomId).emit('sync-streaming-action', { action: 'play', time: room.currentTime });
    }
  });

  socket.on('host-pause', ({ roomId, time }) => {
    const room = rooms.get(roomId);
    if (!room || !room.members.has(socket.id)) return;

    room.isPlaying = false;
    if (typeof time === 'number' && !isNaN(time)) {
      room.currentTime = time;
    }
    room.lastUpdate = Date.now();

    socket.to(roomId).emit('sync-pause', { time: room.currentTime });
    if (room.currentMovie?.type === 'streaming') {
      socket.to(roomId).emit('sync-streaming-action', { action: 'pause', time: room.currentTime });
    }
  });

  socket.on('host-seek', ({ roomId, time }) => {
    const room = rooms.get(roomId);
    if (!room || !room.members.has(socket.id)) return;

    room.currentTime = time;
    room.lastUpdate = Date.now();

    socket.to(roomId).emit('sync-seek', { time });
    if (room.currentMovie?.type === 'streaming') {
      socket.to(roomId).emit('sync-streaming-action', { action: 'seek', time });
    }
  });

  socket.on('host-set-movie', ({ roomId, movie, audioTrack, subtitleTrack }) => {
    const room = rooms.get(roomId);
    if (!room || !room.members.has(socket.id)) return;

    room.currentMovie = movie;
    room.audioTrack = audioTrack || 0;
    room.subtitleTrack = subtitleTrack !== undefined ? subtitleTrack : null;
    room.currentTime = 0;
    room.isPlaying = true;
    room.lastUpdate = Date.now();

    io.in(roomId).emit('sync-movie-changed', {
      movie: room.currentMovie,
      audioTrack: room.audioTrack,
      subtitleTrack: room.subtitleTrack
    });
    console.log(`[Room ${roomId}] Movie changed: ${movie?.filename || 'URL Stream'}`);
  });

  socket.on('host-stop-movie', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || !room.members.has(socket.id)) return;

    room.currentMovie = null;
    room.currentTime = 0;
    room.isPlaying = false;
    room.lastUpdate = Date.now();

    io.in(roomId).emit('sync-movie-stopped');
    console.log(`[Room ${roomId}] Stream stopped. Returning to stage placeholder.`);
  });

  // YouTube Watch Together Socket Events
  socket.on('host-set-youtube', ({ roomId, videoId, title }) => {
    const room = rooms.get(roomId);
    if (!room || !room.members.has(socket.id)) return;

    const member = room.members.get(socket.id);
    const videoTitle = title || 'YouTube Video';
    room.currentMovie = { type: 'youtube', videoId, title: videoTitle, filename: videoTitle };
    room.currentTime = 0;
    room.isPlaying = true;
    room.lastUpdate = Date.now();

    io.in(roomId).emit('sync-youtube-changed', {
      videoId,
      title: videoTitle,
      sharerName: member ? member.username : 'User'
    });
    console.log(`[Room ${roomId}] YouTube stream loaded: ${videoId} by ${member?.username}`);
  });

  socket.on('host-youtube-sync', ({ roomId, action, time }) => {
    const room = rooms.get(roomId);
    if (!room || !room.members.has(socket.id)) return;

    if (action === 'play') room.isPlaying = true;
    if (action === 'pause') room.isPlaying = false;
    if (typeof time === 'number' && !isNaN(time)) {
      room.currentTime = time;
      room.lastUpdate = Date.now();
    }
    socket.to(roomId).emit('sync-youtube-action', { action, time });
  });

  // Streaming Platform Watch Party Socket Events (Netflix, Prime Video, JioHotstar, Zee5, etc.)
  socket.on('host-set-streaming', ({ roomId, platform, title, url }) => {
    const room = rooms.get(roomId);
    if (!room || !room.members.has(socket.id)) return;

    const member = room.members.get(socket.id);
    const plat = (platform || 'netflix').toLowerCase();
    const mediaTitle = (typeof title === 'string' && title.trim()) ? title.trim() : `${plat.toUpperCase()} Party`;
    const mediaUrl = (typeof url === 'string' && url.trim()) ? url.trim() : '';

    room.currentMovie = {
      type: 'streaming',
      platform: plat,
      title: mediaTitle,
      url: mediaUrl,
      filename: `${plat.toUpperCase()}: ${mediaTitle}`
    };
    room.currentTime = 0;
    room.isPlaying = true;
    room.lastUpdate = Date.now();

    io.in(roomId).emit('sync-streaming-changed', {
      platform: room.currentMovie.platform,
      title: room.currentMovie.title,
      url: room.currentMovie.url,
      sharerName: member ? member.username : 'Host'
    });
    console.log(`[Room ${roomId}] Streaming party loaded: ${room.currentMovie.platform} - ${room.currentMovie.title} by ${member?.username}`);
  });

  socket.on('host-streaming-sync', ({ roomId, action, time }) => {
    const room = rooms.get(roomId);
    if (!room || !room.members.has(socket.id)) return;

    if (action === 'play') {
      room.isPlaying = true;
      if (typeof time === 'number' && !isNaN(time) && time >= 0) {
        room.currentTime = time;
      }
      room.lastUpdate = Date.now();
    } else if (action === 'pause') {
      room.isPlaying = false;
      if (typeof time === 'number' && !isNaN(time) && time >= 0) {
        room.currentTime = time;
      }
      room.lastUpdate = Date.now();
    } else if (action === 'rewind10') {
      room.currentTime = Math.max(0, (room.currentTime || 0) - 10);
      room.lastUpdate = Date.now();
    } else if (action === 'forward10') {
      room.currentTime = (room.currentTime || 0) + 10;
      room.lastUpdate = Date.now();
    } else if (action === 'seek') {
      if (typeof time === 'number' && !isNaN(time)) {
        room.currentTime = Math.max(0, time);
      }
      room.lastUpdate = Date.now();
    } else if (typeof time === 'number' && !isNaN(time) && time >= 0) {
      room.currentTime = time;
      room.lastUpdate = Date.now();
    }

    socket.to(roomId).emit('sync-streaming-action', { action, time: room.currentTime });
    if (action === 'play') {
      socket.to(roomId).emit('sync-play', { time: room.currentTime });
    } else if (action === 'pause') {
      socket.to(roomId).emit('sync-pause', { time: room.currentTime });
    } else if (action === 'seek' || action === 'rewind10' || action === 'forward10') {
      socket.to(roomId).emit('sync-seek', { time: room.currentTime });
    }
  });

  // Screen Share WebRTC & Broadcast Events
  socket.on('start-screen-share', ({ roomId, streamId, trackId, username }) => {
    const room = rooms.get(roomId);
    if (!room || !room.members.has(socket.id)) return;

    const sharerName = username || room.members.get(socket.id)?.username || 'User';
    room.screenShare = {
      sharerId: socket.id,
      sharerName,
      streamId,
      trackId
    };

    io.in(roomId).emit('sync-screen-share-started', room.screenShare);
    console.log(`[Room ${roomId}] Screen share started by ${sharerName} (${socket.id})`);
  });

  socket.on('stop-screen-share', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    if (room.screenShare && room.screenShare.sharerId === socket.id) {
      room.screenShare = null;
    }
    io.in(roomId).emit('sync-screen-share-stopped');
    console.log(`[Room ${roomId}] Screen share stopped by ${socket.id}`);
  });

  socket.on('host-set-tracks', ({ roomId, audioTrack, subtitleTrack, currentTime }) => {
    const room = rooms.get(roomId);
    if (!room || !room.members.has(socket.id)) return;

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
    if (!room) return;
    const sender = room.members.get(socket.id);
    const hostMember = room.members.get(room.hostId);
    const isHostSender = (room.hostId === socket.id) || Boolean(sender && hostMember && sender.username === hostMember.username);

    if (!isHostSender && room.currentMovie?.type !== 'streaming') return;

    room.currentTime = time;
    room.isPlaying = isPlaying;
    room.lastUpdate = Date.now();

    socket.to(roomId).emit('sync-heartbeat', { time, isPlaying });
  });

  // Playback Speed Change Synchronization
  socket.on('sync-speed-changed', ({ roomId, speed }) => {
    const room = rooms.get(roomId);
    if (!room || !room.members.has(socket.id)) return;
    room.playbackRate = speed;
    socket.to(roomId).emit('sync-speed-changed', { speed });
  });

  // Watch Party Soundboard Broadcast
  socket.on('play-soundboard', ({ roomId, soundId, senderName }) => {
    const room = rooms.get(roomId);
    if (!room || !room.members.has(socket.id)) return;
    const name = senderName || room.members.get(socket.id)?.username || 'User';
    io.in(roomId).emit('sync-soundboard', { soundId, senderName: name });
  });

  // Live Room Polls & Voting
  socket.on('create-poll', ({ roomId, question, options }) => {
    const room = rooms.get(roomId);
    if (!room || !room.members.has(socket.id)) return;
    const member = room.members.get(socket.id);
    room.activePoll = {
      id: 'poll_' + Date.now(),
      creatorId: socket.id,
      creatorName: member ? member.username : 'User',
      question: question.trim(),
      options: options.map((opt, idx) => ({ id: idx, text: opt.trim(), votes: 0 })),
      voters: {}
    };
    io.in(roomId).emit('sync-poll-updated', room.activePoll);
  });

  socket.on('vote-poll', ({ roomId, optionIndex }) => {
    const room = rooms.get(roomId);
    if (!room || !room.activePoll) return;
    const poll = room.activePoll;
    if (poll.voters[socket.id] !== undefined) {
      const prev = poll.voters[socket.id];
      if (prev === optionIndex) return;
      if (poll.options[prev]) poll.options[prev].votes = Math.max(0, poll.options[prev].votes - 1);
    }
    poll.voters[socket.id] = optionIndex;
    if (poll.options[optionIndex]) poll.options[optionIndex].votes++;
    io.in(roomId).emit('sync-poll-updated', poll);
  });

  socket.on('close-poll', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    room.activePoll = null;
    io.in(roomId).emit('sync-poll-closed');
  });

  // Movie Trivia Game
  socket.on('start-trivia', ({ roomId, triviaRound }) => {
    const room = rooms.get(roomId);
    if (!room || !room.members.has(socket.id)) return;
    room.activeTrivia = {
      ...triviaRound,
      scores: {}
    };
    io.in(roomId).emit('sync-trivia-started', room.activeTrivia);
  });

  socket.on('submit-trivia-answer', ({ roomId, username, isCorrect, points }) => {
    const room = rooms.get(roomId);
    if (!room || !room.activeTrivia) return;
    if (!room.activeTrivia.scores) room.activeTrivia.scores = {};
    if (isCorrect) {
      room.activeTrivia.scores[username] = (room.activeTrivia.scores[username] || 0) + (points || 10);
    }
    io.in(roomId).emit('sync-trivia-scores', room.activeTrivia.scores);
  });

  socket.on('next-trivia-question', ({ roomId, questionIndex }) => {
    const room = rooms.get(roomId);
    if (!room || !room.activeTrivia) return;
    room.activeTrivia.currentQuestion = questionIndex;
    io.in(roomId).emit('sync-trivia-next', { questionIndex });
  });

  socket.on('end-trivia', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const finalScores = room.activeTrivia?.scores || {};
    room.activeTrivia = null;
    io.in(roomId).emit('sync-trivia-ended', { scores: finalScores });
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
    if (typeof text !== 'string') return;
    const cleanText = text.trim();
    if (!cleanText) return;

    const member = room.members.get(socket.id);
    const msg = {
      id: Date.now() + Math.random().toString(36).substr(2, 4),
      senderId: socket.id,
      username: member ? member.username : 'User',
      color: member ? member.color : '#5865F2',
      text: cleanText.slice(0, 500),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    io.in(roomId).emit('chat-message', msg);
  });

  // 5b. Live Cinema & Chat Reactions
  socket.on('send-reaction', ({ roomId, emoji, username }) => {
    const room = rooms.get(roomId);
    if (!room || !room.members.has(socket.id)) return;

    const member = room.members.get(socket.id);
    const senderName = (typeof username === 'string' && username.trim()) ? username.trim().slice(0, 32) : (member ? member.username : 'Viewer');
    const safeEmoji = (typeof emoji === 'string' && emoji.trim()) ? emoji.trim().slice(0, 10) : '❤️';

    io.in(roomId).emit('reaction-burst', {
      emoji: safeEmoji,
      username: senderName,
      senderId: socket.id
    });
  });

  // 6. Handle Disconnect
  socket.on('disconnect', () => {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    const member = room.members.get(socket.id);
    room.members.delete(socket.id);

    console.log(`[Room ${currentRoomId}] ${member ? member.username : socket.id} disconnected.`);

    // If active screensharer left, clean up and reset stage
    if (room.screenShare && room.screenShare.sharerId === socket.id) {
      room.screenShare = null;
      io.in(currentRoomId).emit('sync-screen-share-stopped');
    }

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
      }
    }

    // Unconditional empty room cleanup to prevent memory leaks
    if (room.members.size === 0) {
      rooms.delete(currentRoomId);
      console.log(`[Room ${currentRoomId}] Room closed (empty).`);
      return;
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
