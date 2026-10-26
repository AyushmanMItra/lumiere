<div align="center">

# 🎬 Lumière
### Watch together. Synchronized to the frame.

A decentralized, private screening platform that turns the host's PC into an on-the-fly streaming engine with frame-accurate playback, multi-track MKV streaming, and WebRTC voice/video for friends.

[![Node.js](https://img.shields.io/badge/Node.js-20+-68a063?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.8-010101?style=for-the-badge&logo=socket.io&logoColor=white)](https://socket.io)
[![WebRTC](https://img.shields.io/badge/WebRTC-P2P_Voice_&_Video-333333?style=for-the-badge&logo=webrtc&logoColor=white)](https://webrtc.org)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-On--The--Fly_Remuxing-007808?style=for-the-badge&logo=ffmpeg&logoColor=white)](https://ffmpeg.org)
[![Tailscale](https://img.shields.io/badge/Tailscale-VPN_Mesh_Ready-4f46e5?style=for-the-badge&logo=tailscale&logoColor=white)](https://tailscale.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-eb3b5a?style=for-the-badge)](LICENSE)

</div>

---

## 📖 The Story Behind Lumière

> *"A developer from India who kept getting locked out of movie nights with friends — so I built the movie night I wanted to be in."*  
> — **Ayushman Mitra (Maker)**

Watching high-quality local movie files (2GB+ `.mkv` or `.mp4` rips) remotely with friends was fundamentally broken:
- **Walled Gardens (Teleparty, Amazon Watch Party):** Restricted strictly to licensed Netflix/Prime catalogs. Your own `.mkv` rips or school films aren't allowed.
- **Screen Sharing (Discord, Zoom):** Choppy 15fps compression, heavy upload bandwidth overhead, and audio drifting out of sync.
- **Cloud-Sync Sites:** Waiting hours to upload a 3GB file to third-party servers, only to hit storage limits.

**The Spark:** The momentum behind Lumière came from conversations between Ayushman and his friend **Yashvi Singh**, who pointed out why watching movies with friends was still awkward in 2026 and what a truly great watch party tool should feel like.

---

## ✨ Features

- **Decentralized Host Engine:** The movie never moves. It stays on the host's hard drive and streams on-the-fly directly to connected peers over Tailscale or local Wi-Fi.
- **Universal Container Support (MKV, MP4, WebM):**
  - Instant memory remuxing via bundled FFmpeg (`-c:v copy`). Zero disk wear, zero duplicate files, and negligible CPU overhead.
  - **Dynamic Audio Track Switching:** Mid-movie switching between English, Japanese, Hindi, or commentary tracks without losing playback position.
  - **Embedded Subtitle Extraction:** Extracts `.srt` and `.ass` subtitles on-the-fly as WebVTT streams.
- **Frame-Perfect Playback Synchronization:**
  - Micro-drift rate steering (adjusts member playback rate between `0.92x` and `1.08x` with pitch preservation) to eliminate stutter.
  - Disrupted member auto-resync upon tab refocus or network reconnect.
- **Discord-Themed Voice & Video Stage:**
  - Full-mesh WebRTC voice and camera feeds with real-time speaking detection (green ring glow).
  - Floating dock with mic/camera toggles, device selector, and theater cinema controls.
- **Built-In Discord Chat:**
  - Collapsible side panel with timestamps and user-colored badges.
- **Random Alphanumeric Room Codes:**
  - Fast, clean, shareable 6-character room codes (e.g. `K9X2M4`).
- **No Logins, No Subscriptions:**
  - Zero accounts, zero analytics, zero ads. Jump in with just a display name and room code.

---

## 🛠️ Architecture & Tech Stack

```text
[Host Machine (movies/)]
       │
       ├── FFmpeg (On-the-fly fragmented MP4 stream & WebVTT subtitles)
       ├── Express Server (HTTP 3000 & HTTPS 3443 with self-signed SSL)
       │
       ├── Socket.io Signaling (Room heartbeat, play/pause/seek sync)
       │       ▼
  ┌────┴───────────────────────────┐
  │                                │
[Member 1 (Tailscale / Wi-Fi)]   [Member 2 (Tailscale / Wi-Fi)]
  │                                │
  └──────── WebRTC Mesh ───────────┘
     (Peer-to-peer Voice & Video)
```

- **Backend:** Node.js, Express, Socket.io, `fluent-ffmpeg`, `@ffmpeg-installer`, `@ffprobe-installer`
- **Frontend:** HTML5 Video, WebRTC (`RTCPeerConnection`), Canvas Web Audio API, Vanilla CSS (Discord Cinema Dark)
- **Networking:** Local Wi-Fi + Tailscale VPN Mesh

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js** v18 or later ([Download Node.js](https://nodejs.org))

### 2. Clone & Install
```bash
git clone https://github.com/<your-username>/lumiere.git
cd lumiere
npm install
```

### 3. Add Movies
Place your video files (`.mkv`, `.mp4`, `.webm`) into the `movies/` directory:
```text
movies/
  ├── MyMovie.mkv
  └── HolidayTrip.mp4
```

### 4. Start the Engine
```bash
npm start
```

Your terminal will display your active connection addresses:
```text
================================================================
               🎬 LUMIÈRE PRIVATE CINEMA SERVER
================================================================
  [HTTP - Standard Browsing]
  > Local Host PC:     http://localhost:3000
  > Local Wi-Fi:       http://192.168.x.x:3000
  > Tailscale:         http://100.x.x.x:3000
----------------------------------------------------------------
  [HTTPS - Camera & Mic for Tablets / Phones]
  > Local Host PC:     https://localhost:3443
  > Local Wi-Fi:       https://192.168.x.x:3443
  > Tailscale:         https://100.x.x.x:3443
================================================================
```

---

## 🌐 Connecting With Friends

### On the Same Wi-Fi (LAN):
- Open `http://<your-local-ip>:3000` or `https://<your-local-ip>:3443` on any phone, tablet, or laptop connected to your home Wi-Fi.

### With Remote Friends Anywhere in the World (Tailscale):
1. Install [Tailscale](https://tailscale.com) on your PC and your friend's device.
2. Sign in with the same account (or use Tailscale Node Sharing to invite your friend's device).
3. Send your friend your Tailscale link: `http://100.x.x.x:3000` (or `https://100.x.x.x:3443`).
4. Enjoy private cinema without port forwarding or third-party cloud uploads!

---

## 📁 Project Structure

```text
lumiere/
├── movies/                 # Put your .mkv, .mp4, and .webm movies here
│   └── .gitkeep
├── public/                 # Modern web interface
│   ├── app.js              # Cinema sync engine & WebRTC signaling
│   ├── ayushman.jpg        # Builder avatar
│   ├── support-qr.png      # UPI QR code
│   ├── index.html          # Cinematic landing, theater stage & about page
│   ├── manifest.json       # PWA installation manifest
│   └── style.css           # Discord-inspired dark cinema theme
├── cert.pem / key.pem      # Auto-generated self-signed SSL for WebRTC
├── package.json
├── server.js               # Express, Socket.io, FFmpeg streaming pipeline
└── README.md
```

---

## 👥 Credits & Acknowledgements

- **Built by:** [Ayushman Mitra](https://github.com/AyushmanMItra) (India)
- **Special Mention:** **Yashvi Singh** for sparking the concept and providing real-user feedback that shaped the product.
- **Feedback & Contact:** [mitraayushman00@gmail.com](mailto:mitraayushman00@gmail.com)

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
