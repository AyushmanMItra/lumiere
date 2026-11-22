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
const compression = require('compression');

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

app.use(compression({
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    if (req.path.startsWith('/stream') || req.path.startsWith('/hls')) return false;
    return compression.filter(req, res);
  }
}));

app.use(cors());
app.use(express.json());

// ------------------------------------------------------------------
// SEO & Canonical Metadata Endpoints
// ------------------------------------------------------------------
app.get('/robots.txt', (req, res) => {
  res.type('text/plain; charset=utf-8');
  res.sendFile(path.join(__dirname, 'public', 'robots.txt'));
});

app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml; charset=utf-8');
  res.sendFile(path.join(__dirname, 'public', 'sitemap.xml'));
});

app.get('/llms.txt', (req, res) => {
  res.type('text/plain; charset=utf-8');
  res.sendFile(path.join(__dirname, 'public', 'llms.txt'));
});

app.get('/favicon.ico', (req, res) => {
  res.type('image/x-icon');
  res.sendFile(path.join(__dirname, 'public', 'favicon.ico'));
});

// ------------------------------------------------------------------
// Clean URL Slugs & Redirects
// ------------------------------------------------------------------
app.get('/about', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'about.html'));
});

app.get(['/room/:roomId', '/r/:roomId'], (req, res, next) => {
  const roomId = req.params.roomId;
  if (roomId && roomId.includes('.')) {
    const assetPath = path.join(__dirname, 'public', roomId);
    if (fs.existsSync(assetPath)) {
      return res.sendFile(assetPath);
    }
    return next();
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get(['/download', '/apk'], (req, res) => {
  res.redirect(302, '/lumiere.apk');
});

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

// Movie Trivia Questions API (proxies OpenTDB with dynamic reservoir fallback)
const SERVER_CINEMA_TRIVIA_SEED = [
  { question: "Which film won the Academy Award for Best Picture in 2020, becoming the first non-English language film to do so?", correct_answer: "Parasite", incorrect_answers: ["Roma", "1917", "Minari"] },
  { question: "Who directed the 1994 masterpiece 'Pulp Fiction'?", correct_answer: "Quentin Tarantino", incorrect_answers: ["Martin Scorsese", "David Fincher", "Paul Thomas Anderson"] },
  { question: "What is the name of the fictional African country ruled by King T'Challa in 'Black Panther'?", correct_answer: "Wakanda", incorrect_answers: ["Genosha", "Latveria", "Sokovia"] },
  { question: "Which 1982 sci-fi film directed by Ridley Scott features humanoid androids known as 'replicants'?", correct_answer: "Blade Runner", incorrect_answers: ["Total Recall", "The Terminator", "RoboCop"] },
  { question: "In 'The Lord of the Rings', what is the name of the volcanic mountain where the One Ring must be destroyed?", correct_answer: "Mount Doom", incorrect_answers: ["Erebor", "Caradhras", "Gundabad"] },
  { question: "Which animated film by Studio Ghibli won the Academy Award for Best Animated Feature in 2003?", correct_answer: "Spirited Away", incorrect_answers: ["Princess Mononoke", "Howl's Moving Castle", "My Neighbor Totoro"] },
  { question: "Who played the iconic role of Vito Corleone in 'The Godfather' (1972)?", correct_answer: "Marlon Brando", incorrect_answers: ["Al Pacino", "Robert De Niro", "James Caan"] },
  { question: "Which movie features the famous line: 'Here's looking at you, kid'?", correct_answer: "Casablanca", incorrect_answers: ["Citizen Kane", "Gone with the Wind", "Sunset Boulevard"] },
  { question: "Who became the first woman to win the Academy Award for Best Director for 'The Hurt Locker' in 2010?", correct_answer: "Kathryn Bigelow", incorrect_answers: ["Sofia Coppola", "Jane Campion", "Greta Gerwig"] },
  { question: "What is the highest-grossing film of all time worldwide (unadjusted for inflation)?", correct_answer: "Avatar", incorrect_answers: ["Avengers: Endgame", "Titanic", "Star Wars: The Force Awakens"] },
  { question: "Which 1968 Stanley Kubrick film features the sentient supercomputer HAL 9000?", correct_answer: "2001: A Space Odyssey", incorrect_answers: ["A Clockwork Orange", "Solaris", "Dr. Strangelove"] },
  { question: "In 'The Matrix' (1999), what color pill does Neo choose to see reality?", correct_answer: "Red", incorrect_answers: ["Blue", "Green", "Yellow"] },
  { question: "Which Christopher Nolan film depicts an astronaut team traveling through a wormhole near Saturn?", correct_answer: "Interstellar", incorrect_answers: ["Inception", "Tenet", "The Prestige"] },
  { question: "Who directed the groundbreaking Japanese samurai film 'Seven Samurai' (1954)?", correct_answer: "Akira Kurosawa", incorrect_answers: ["Yasujiro Ozu", "Kenji Mizoguchi", "Masaki Kobayashi"] },
  { question: "Which movie won 11 Academy Awards in 1998, tying 'Ben-Hur' for the most wins in Oscar history?", correct_answer: "Titanic", incorrect_answers: ["Braveheart", "Forrest Gump", "Gladiator"] },
  { question: "In 'Star Wars: A New Hope', what is the name of Han Solo's starship?", correct_answer: "Millennium Falcon", incorrect_answers: ["Star Destroyer", "Razor Crest", "Slave I"] },
  { question: "Who played the Joker in Christopher Nolan's 'The Dark Knight' (2008), earning a posthumous Oscar?", correct_answer: "Heath Ledger", incorrect_answers: ["Joaquin Phoenix", "Jack Nicholson", "Jared Leto"] },
  { question: "Which Mexican filmmaker directed 'Pan's Labyrinth' (2006) and 'The Shape of Water' (2017)?", correct_answer: "Guillermo del Toro", incorrect_answers: ["Alfonso Cuaron", "Alejandro Gonzalez Inarritu", "Robert Rodriguez"] },
  { question: "What is the first rule of Fight Club in the 1999 film directed by David Fincher?", correct_answer: "You do not talk about Fight Club", incorrect_answers: ["Always bring a partner", "No weapons allowed", "Fights only last one round"] },
  { question: "In 'Jurassic Park' (1993), what type of ancient insect was fossilized in amber with dinosaur blood?", correct_answer: "Mosquito", incorrect_answers: ["Spider", "Dragonfly", "Tick"] },
  { question: "Which 1994 prison drama starring Tim Robbins and Morgan Freeman is ranked #1 on IMDb's Top 250?", correct_answer: "The Shawshank Redemption", incorrect_answers: ["Pulp Fiction", "Forrest Gump", "Schindler's List"] },
  { question: "Which French romantic comedy directed by Jean-Pierre Jeunet stars Audrey Tautou as a Parisian waitress?", correct_answer: "Amelie", incorrect_answers: ["La Haine", "Blue Is the Warmest Color", "The Artist"] },
  { question: "Who directed the suspenseful 1975 blockbuster 'Jaws'?", correct_answer: "Steven Spielberg", incorrect_answers: ["George Lucas", "Brian De Palma", "Francis Ford Coppola"] },
  { question: "What iconic quote does Arnold Schwarzenegger utter in 'The Terminator' (1984)?", correct_answer: "I'll be back", incorrect_answers: ["Hasta la vista, baby", "Get to the chopper", "Consider that a divorce"] },
  { question: "Which 1939 musical fantasy features Dorothy Gale and the song 'Over the Rainbow'?", correct_answer: "The Wizard of Oz", incorrect_answers: ["Singin' in the Rain", "Meet Me in St. Louis", "The Sound of Music"] },
  { question: "In Disney's 'The Lion King' (1994), what does the Swahili phrase 'Hakuna Matata' translate to?", correct_answer: "No worries", incorrect_answers: ["Welcome home", "Be strong", "Circle of life"] },
  { question: "Who voiced Woody the cowboy doll in the original Pixar film 'Toy Story' (1995)?", correct_answer: "Tom Hanks", incorrect_answers: ["Tim Allen", "Billy Crystal", "Robin Williams"] },
  { question: "Which psychological horror film directed by Alfred Hitchcock in 1960 features the Bates Motel shower scene?", correct_answer: "Psycho", incorrect_answers: ["Vertigo", "The Birds", "Rear Window"] },
  { question: "In 'Goodfellas' (1990), who played Tommy DeVito, famous for the line 'Funny how? How am I funny?'?", correct_answer: "Joe Pesci", incorrect_answers: ["Robert De Niro", "Ray Liotta", "Paul Sorvino"] },
  { question: "Which 2002 Brazilian crime drama directed by Fernando Meirelles depicts gang warfare in Rio de Janeiro?", correct_answer: "City of God", incorrect_answers: ["Elite Squad", "Central Station", "Amores Perros"] },
  { question: "What totem object does Dom Cobb spin in 'Inception' (2010) to test reality?", correct_answer: "A spinning top", incorrect_answers: ["A loaded die", "A brass token", "A poker chip"] },
  { question: "Which legendary film saga features the phrase: 'May the Force be with you'?", correct_answer: "Star Wars", incorrect_answers: ["Star Trek", "Dune", "Guardians of the Galaxy"] },
  { question: "Who directed the 2023 biographical epic 'Oppenheimer', winning Best Director and Best Picture?", correct_answer: "Christopher Nolan", incorrect_answers: ["Denis Villeneuve", "Ridley Scott", "Sam Mendes"] },
  { question: "In 'Back to the Future' (1985), what speed must the DeLorean reach to activate time travel?", correct_answer: "88 mph", incorrect_answers: ["75 mph", "99 mph", "100 mph"] },
  { question: "Which film won the inaugural Academy Award for Best Animated Feature in 2002?", correct_answer: "Shrek", incorrect_answers: ["Monsters, Inc.", "Ice Age", "Jimmy Neutron: Boy Genius"] },
  { question: "Who played the whip-wielding archaeologist Indiana Jones in 'Raiders of the Lost Ark' (1981)?", correct_answer: "Harrison Ford", incorrect_answers: ["Tom Selleck", "Kurt Russell", "Mel Gibson"] },
  { question: "In 'The Silence of the Lambs' (1991), what is the medical profession of Dr. Hannibal Lecter?", correct_answer: "Psychiatrist", incorrect_answers: ["Neurosurgeon", "Cardiologist", "Forensic Pathologist"] },
  { question: "Which Italian drama directed by Giuseppe Tornatore won the Oscar for Best Foreign Language Film in 1990?", correct_answer: "Cinema Paradiso", incorrect_answers: ["Life is Beautiful", "La Dolce Vita", "The Great Beauty"] },
  { question: "What is the name of the fictional Scandinavian kingdom in Disney's 'Frozen'?", correct_answer: "Arendelle", incorrect_answers: ["Corona", "DunBroch", "Genovia"] },
  { question: "In 'Forrest Gump' (1994), what does Forrest's mama say life is like?", correct_answer: "A box of chocolates", incorrect_answers: ["A deck of cards", "A marathon race", "A rolling stone"] },
  { question: "Which Denis Villeneuve sci-fi film is based on Frank Herbert's epic 1965 novel about the desert planet Arrakis?", correct_answer: "Dune", incorrect_answers: ["Arrival", "Blade Runner 2049", "Solaris"] },
  { question: "Who directed the legendary mafia film 'The Godfather' (1972)?", correct_answer: "Francis Ford Coppola", incorrect_answers: ["Martin Scorsese", "Sergio Leone", "Brian De Palma"] },
  { question: "What giant prehistoric ape is captured on Skull Island and taken to New York in the 1933 cinema classic?", correct_answer: "King Kong", incorrect_answers: ["Mighty Joe Young", "Godzilla", "Yeti"] },
  { question: "Which courtroom drama features Jack Nicholson roaring: 'You can't handle the truth!'?", correct_answer: "A Few Good Men", incorrect_answers: ["The Shining", "One Flew Over the Cuckoo's Nest", "Chinatown"] },
  { question: "Who composed the iconic musical themes for 'Star Wars', 'Jaws', and 'Indiana Jones'?", correct_answer: "John Williams", incorrect_answers: ["Hans Zimmer", "Ennio Morricone", "Alan Silvestri"] },
  { question: "In 'The Shining' (1980), what is the name of the haunted mountain hotel where Jack Torrance goes mad?", correct_answer: "The Overlook Hotel", incorrect_answers: ["The Bates Motel", "The Grand Budapest", "The Continental"] },
  { question: "Which 1999 sci-fi action film pioneered the multi-camera slow-motion effect known as 'Bullet Time'?", correct_answer: "The Matrix", incorrect_answers: ["Dark City", "Equilibrium", "Minority Report"] },
  { question: "In Ridley Scott's 'Alien' (1979), what is the name of the commercial towing spaceship?", correct_answer: "USCSS Nostromo", incorrect_answers: ["USCSS Prometheus", "USS Sulaco", "Discovery One"] },
  { question: "Which actor portrayed Roman general Maximus Decimus Meridius in 'Gladiator' (2000)?", correct_answer: "Russell Crowe", incorrect_answers: ["Joaquin Phoenix", "Gerard Butler", "Christian Bale"] },
  { question: "What Marvel film became the highest-grossing R-rated movie of all time worldwide in 2024?", correct_answer: "Deadpool & Wolverine", incorrect_answers: ["Joker", "Oppenheimer", "The Passion of the Christ"] },
  { question: "Which Wes Anderson comedy-drama chronicles the adventures of concierge Gustave H. at an alpine hotel?", correct_answer: "The Grand Budapest Hotel", incorrect_answers: ["Moonrise Kingdom", "The French Dispatch", "The Royal Tenenbaums"] },
  { question: "In 'Pulp Fiction' (1994), what dance do Vincent Vega and Mia Wallace enter at Jack Rabbit Slim's?", correct_answer: "The Twist", incorrect_answers: ["The Charleston", "The Tango", "The Macarena"] },
  { question: "Who portrayed the calculating mob boss Michael Corleone across 'The Godfather' trilogy?", correct_answer: "Al Pacino", incorrect_answers: ["Robert De Niro", "James Caan", "Joe Pesci"] },
  { question: "Which 1941 Orson Welles masterpiece tells the story of Charles Foster Kane and the mystery of 'Rosebud'?", correct_answer: "Citizen Kane", incorrect_answers: ["The Magnificent Ambersons", "Touch of Evil", "The Third Man"] },
  { question: "Who directed the 1993 historical Holocaust drama 'Schindler's List'?", correct_answer: "Steven Spielberg", incorrect_answers: ["Roman Polanski", "Oliver Stone", "Clint Eastwood"] }
];

const serverTriviaReservoir = [...SERVER_CINEMA_TRIVIA_SEED];
const serverUsedQuestionKeys = new Set();
let lastServerOpenTdbFetchTime = 0;

function shuffleServerArray(arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

app.get('/api/trivia', async (req, res) => {
  const count = parseInt(req.query.count, 10) || 5;

  // Opportunistically refresh reservoir from OpenTDB if rate limit window has passed (5s)
  if (Date.now() - lastServerOpenTdbFetchTime > 6000) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2200);
      const opentdbUrl = `https://opentdb.com/api.php?amount=15&category=11&type=multiple`;
      const response = await fetch(opentdbUrl, { signal: controller.signal });
      clearTimeout(timeout);
      lastServerOpenTdbFetchTime = Date.now();
      if (response.ok) {
        const data = await response.json();
        if (data && data.response_code === 0 && Array.isArray(data.results)) {
          data.results.forEach(item => {
            const key = (item.question || '').trim().toLowerCase();
            const exists = serverTriviaReservoir.some(r => (r.question || '').trim().toLowerCase() === key);
            if (!exists) {
              serverTriviaReservoir.push({
                question: item.question,
                correct_answer: item.correct_answer,
                incorrect_answers: item.incorrect_answers
              });
            }
          });
        }
      }
    } catch (err) {
      // Offline or network timeout - proceed to dispense from reservoir
    }
  }

  // Pick non-repetitive questions from server reservoir
  let available = serverTriviaReservoir.filter(item => {
    const key = (item.question || '').trim().toLowerCase();
    return !serverUsedQuestionKeys.has(key);
  });

  if (available.length < count) {
    serverUsedQuestionKeys.clear();
    available = [...serverTriviaReservoir];
  }

  const chosen = shuffleServerArray(available).slice(0, count);
  chosen.forEach(item => {
    const key = (item.question || '').trim().toLowerCase();
    if (key) serverUsedQuestionKeys.add(key);
  });

  return res.json({ success: true, questions: chosen });
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
    const { name, contact, message, category, rating, diagnostics, timestamp } = req.body || {};
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, ok: false, error: 'Feedback message is required' });
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
      name: (name && name.trim()) || (contact && contact.trim()) || 'Anonymous Cinephile',
      contact: (contact && contact.trim()) || null,
      message: message.trim(),
      category: category || 'general',
      rating: rating ? parseInt(rating, 10) : 5,
      diagnostics: diagnostics || null,
      timestamp: timestamp || new Date().toISOString()
    };

    feedbacks.push(item);
    fs.writeFileSync(feedbackFile, JSON.stringify(feedbacks, null, 2), 'utf8');

    console.log(`[LUMIÈRE FEEDBACK] [${item.category.toUpperCase()}] (${item.rating}/5) from ${item.name}: ${item.message}`);
    if (item.contact) console.log(`  Contact: ${item.contact}`);
    if (item.diagnostics) console.log(`  Diagnostics:`, item.diagnostics);

    res.json({ success: true, ok: true, status: 'received', item });
  } catch (err) {
    res.status(500).json({ success: false, ok: false, error: err.message });
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

// Avatar background colors
const AVATAR_COLORS = [
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

    const randomColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

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

  socket.on('host-seek', ({ roomId, time, currentTime } = {}) => {
    const room = rooms.get(roomId);
    if (!room || !room.members.has(socket.id)) return;

    const rawTime = (time !== undefined && time !== null) ? time : currentTime;
    const actualTime = (typeof rawTime === 'number' && !isNaN(rawTime) && isFinite(rawTime)) ? Math.max(0, rawTime) : 0;
    room.currentTime = actualTime;
    room.lastUpdate = Date.now();

    socket.to(roomId).emit('sync-seek', { time: actualTime });
    if (room.currentMovie?.type === 'streaming') {
      socket.to(roomId).emit('sync-streaming-action', { action: 'seek', time: actualTime });
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
    const isHost = Boolean(member && (member.isHost || room.hostId === socket.id));
    const role = isHost ? 'host' : 'viewer';
    const msg = {
      id: Date.now() + Math.random().toString(36).substr(2, 4),
      senderId: socket.id,
      username: member ? member.username : 'User',
      color: member ? member.color : '#5865F2',
      text: cleanText.slice(0, 500),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isHost,
      role
    };

    io.in(roomId).emit('chat-message', msg);
  });

  // 5b. Live Cinema & Chat Reactions
  socket.on('send-reaction', ({ roomId, emoji, username }) => {
    const room = rooms.get(roomId);
    if (!room || !room.members.has(socket.id)) return;

    const member = room.members.get(socket.id);
    const senderName = (typeof username === 'string' && username.trim()) ? username.trim().slice(0, 32) : (member ? member.username : 'Viewer');
    const safeEmoji = (typeof emoji === 'string' && emoji.trim()) ? emoji.trim().slice(0, 10) : 'heart';

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

// ------------------------------------------------------------------
// Custom 404 Page & Error Handler
// ------------------------------------------------------------------
app.use((req, res) => {
  res.status(404);
  if (req.accepts('html')) {
    res.sendFile(path.join(__dirname, 'public', '404.html'));
  } else if (req.accepts('json')) {
    res.json({ error: 'Not Found', status: 404, path: req.originalUrl });
  } else {
    res.type('txt').send('404 Not Found');
  }
});

// ==========================================================================
// ADMIN CONSOLE & RESTART CONTROLLER (y/n/r)
// ==========================================================================
let isPromptingShutdown = false;
let adminReadline = null;
let isAdminConsoleInitialized = false;

function restartLumiereServer() {
  console.log('[Server] Shutting down active connections for restart...');
  try {
    rooms.clear();
    if (io) {
      io.disconnectSockets(true);
    }
  } catch (e) {}

  const finalizeRestart = () => {
    if (process.env.LUMIERE_BATCH_RUNNER === '1') {
      console.log('[Server] Handing off to batch runner for fresh reload (code 42)...');
      process.exit(42);
      return;
    }

    console.log('[Server] Launching replacement server process...');
    const { spawn } = require('child_process');
    const child = spawn(process.argv[0], process.argv.slice(1), {
      stdio: 'inherit',
      env: process.env
    });

    child.on('exit', (code) => {
      process.exit(code || 0);
    });

    setTimeout(() => {
      process.exit(0);
    }, 250);
  };

  try {
    httpServer.close(() => {
      if (httpsServer) {
        httpsServer.close(() => {
          finalizeRestart();
        });
      } else {
        finalizeRestart();
      }
    });
  } catch (err) {
    finalizeRestart();
  }
}

function initAdminConsole() {
  if (isAdminConsoleInitialized) return;
  if (require.main !== module) return;
  if (!process.stdin || !process.stdin.isTTY) return;

  isAdminConsoleInitialized = true;
  const readline = require('readline');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
  });
  adminReadline = rl;

  const showPrompt = () => {
    isPromptingShutdown = true;
    process.stdout.write('\nTerminate server or restart (y/n/r)? ');
  };

  process.on('SIGINT', () => {
    if (isPromptingShutdown) {
      console.log('\n[Server] Force terminating on second interrupt.');
      process.exit(0);
      return;
    }
    showPrompt();
  });

  process.on('SIGTERM', () => {
    console.log('\n[Server] SIGTERM received. Shutting down cleanly.');
    process.exit(0);
  });

  rl.on('line', (raw) => {
    const input = (raw || '').trim().toLowerCase();

    if (isPromptingShutdown) {
      if (input === 'y' || input === 'yes') {
        console.log('[Server] Terminating Lumiere Cinema Server. Goodbye.');
        process.exit(0);
      } else if (input === 'n' || input === 'no') {
        console.log('[Server] Resumed. Lumiere Cinema Server is still running.');
        isPromptingShutdown = false;
      } else if (input === 'r' || input === 'restart') {
        isPromptingShutdown = false;
        restartLumiereServer();
      } else {
        process.stdout.write('Please enter y (terminate), n (keep running), or r (restart): ');
      }
    } else {
      if (input === 'r' || input === 'restart') {
        console.log('\n[Admin Console] Restart command received (r).');
        restartLumiereServer();
      } else if (input === 'y' || input === 'exit' || input === 'quit' || input === 'q') {
        showPrompt();
      } else if (input === 'help' || input === '?') {
        console.log('\n================================================================');
        console.log('              LUMIERE ADMIN CONSOLE SHORTCUTS                   ');
        console.log('================================================================');
        console.log('  r           - Restart server immediately');
        console.log('  Ctrl+C / q  - Prompt shutdown options (y/n/r)');
        console.log('  y           - Confirm terminate');
        console.log('  n           - Cancel termination and keep running');
        console.log('================================================================\n');
      }
    }
  });
}

// Start Servers with auto-fallback if port is busy
let isHttpsStarted = false;

function startHttp(port) {
  const onError = (err) => {
    httpServer.removeListener('listening', onListening);
    if (err.code === 'EADDRINUSE') {
      console.log(`[Notice] HTTP Port ${port} is busy, trying ${port + 1}...`);
      startHttp(port + 1);
    } else {
      console.error('[HTTP Error]', err.message);
    }
  };

  const onListening = () => {
    httpServer.removeListener('error', onError);
    const ips = getNetworkIps();
    console.log('================================================================');
    console.log('               [CINEMA] LUMIERE PRIVATE CINEMA SERVER           ');
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
    initAdminConsole();
  };

  httpServer.once('error', onError);
  httpServer.once('listening', onListening);
  httpServer.listen(port, '0.0.0.0');
}

function startHttps(port) {
  if (!httpsServer) {
    console.log('  [Admin Console Controls]');
    console.log('  > Press "r" + Enter:  Restart server');
    console.log('  > Press Ctrl+C:       Shutdown prompt (y/n/r)');
    console.log('================================================================');
    return;
  }

  const onError = (err) => {
    httpsServer.removeListener('listening', onListening);
    if (err.code === 'EADDRINUSE') {
      console.log(`[Notice] HTTPS Port ${port} is busy, trying ${port + 1}...`);
      startHttps(port + 1);
    } else {
      console.error('[HTTPS Error]', err.message);
    }
  };

  const onListening = () => {
    httpsServer.removeListener('error', onError);
    const ips = getNetworkIps();
    console.log('  [HTTPS - Camera & Mic for Tablets / Phones]');
    console.log(`  > Local Host PC:     https://localhost:${port}`);
    if (ips.local !== 'localhost') console.log(`  > Local Wi-Fi:       https://${ips.local}:${port}`);
    if (ips.tailscale) console.log(`  > Tailscale:         https://${ips.tailscale}:${port}`);
    console.log('----------------------------------------------------------------');
    console.log('  [Admin Console Controls]');
    console.log('  > Press "r" + Enter:  Restart server');
    console.log('  > Press Ctrl+C:       Shutdown prompt (y/n/r)');
    console.log('================================================================');
  };

  httpsServer.once('error', onError);
  httpsServer.once('listening', onListening);
  httpsServer.listen(port, '0.0.0.0');
}

startHttp(HTTP_PORT);
