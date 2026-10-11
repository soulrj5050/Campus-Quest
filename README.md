# 🗺️ Campus Quest

> **A location-based campus exploration and AR scavenger hunt game – explore, discover, conquer!**

[![PWA Ready](https://img.shields.io/badge/PWA-Ready-orange?logo=pwa)](./manifest.json)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-yellow?logo=javascript)](./app.js)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9.4-brightgreen?logo=leaflet)](https://leafletjs.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Backend%20Sync-blue?logo=supabase)](https://supabase.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---
## 🎮 Play Campus Quest

[**Click here to play Campus Quest**](https://campusquest007.netlify.app)

---

## 📖 Overview

**Campus Quest** turns your university or college campus into an interactive augmented reality (AR) adventure. Players navigate real-world campus coordinates to reach checkpoints, solve clues, unlock virtual treasures via live camera feeds, and climb the leaderboard.

Whether designed for campus orientations, open days, student club events, or just campus exploration, Campus Quest offers a seamless, mobile-first experience without requiring native app installation.

---

## ✨ Features

- 📍 **Live Geolocation Tracking**: Real-time GPS coordinate and accuracy monitoring with visual radius detection.
- 📷 **Camera-First AR Encounters**: Interactive augmented reality view overlaying 3D animated collectibles (chests, relics, crystals, emblems, and portals) directly onto your device's camera stream.
- 🗺️ **Interactive Leaflet Map**: Built-in interactive map highlighting player positions, checkpoint radiuses, and exploration zones.
- 🧩 **Sequential Quest & Clue Progression**: Solve riddles and clues unlocked checkpoint-by-checkpoint to locate the next destination.
- ⚙️ **Comprehensive Admin Suite**:
  - Secure Admin authentication.
  - Interactive map-click coordinate and radius picker.
  - Checkpoint creator with customizable rewards, clues, and 3D object models.
  - JSON configuration export and import for easy backup and sharing between campuses.
  - Built-in Test Mode (bypass camera / preview all checkpoints for testing indoors).
- 📱 **Progressive Web App (PWA)**: Installable directly on iOS and Android home screens with offline caching support via Service Workers.
- ☁️ **Cloud & Local Storage**: Backed by Supabase database synchronization with automatic fallback to browser `localStorage`.

---

## 🛠️ Tech Stack

- **Frontend**: Vanilla HTML5, Modern CSS3, Vanilla JavaScript (ES6+)
- **Mapping**: [Leaflet.js](https://leafletjs.com/) with OpenStreetMap tiles
- **AR & Media**: WebRTC `navigator.mediaDevices.getUserMedia` Camera API
- **Backend / Database**: [Supabase](https://supabase.com/) (PostgreSQL & Supabase Auth)
- **PWA**: Service Worker API, Web App Manifest

---

## 🚀 Getting Started

Because Campus Quest utilizes camera access and geolocation APIs, it must be served over `http://localhost` or `https://`.

### 1. Clone the Repository

```bash
git clone https://github.com/soulrj5050/Campus-Quest.git
cd Campus-Quest
```

### 2. Run Locally

You can use any local static file server:

**Using Python 3:**
```bash
python3 -m http.server 8000
```

**Using Node.js (`npx serve` or `http-server`):**
```bash
npx serve .
# or
npx http-server -p 8000
```

### 3. Open in Browser

Visit [http://localhost:8000](http://localhost:8000) on your desktop or mobile browser.

> 💡 **Mobile Testing Tip**: To test camera and GPS directly on your smartphone, expose your local port over HTTPS using tools like [Cloudflare Tunnel](https://developers.cloudflare.com/pages/how-to/preview-urls/) or [ngrok](https://ngrok.com/):
> ```bash
> npx ngrok http 8000
> ```

---

## 🎮 How to Play

1. **Enter Your Name**: Launch the app, enter your explorer callsign, and press **Start Quest**.
2. **Follow the Clues**: Read the clue on your checkpoint card indicating where to go on campus.
3. **Reach the Coordinates**: Walk to the checkpoint area. The radar indicator will track your proximity.
4. **Spot & Claim Rewards**: When within range, activate your camera to discover the AR object floating on-screen and tap to claim your points.
5. **Progress & Conquer**: Each checkpoint reveals the clue to the next destination until the quest is complete!

---

## ⚙️ Admin Configuration & Setup

### Setting Up Supabase (Optional for Cloud Sync)

To synchronize checkpoints across multiple devices and players:

1. Create a project at [supabase.com](https://supabase.com).
2. Create a `checkpoints` table with your desired schema.
3. Configure your credentials inside [app.js](file:///Users/rajpatidar/.gemini/antigravity/scratch/campus-quest/app.js):
   ```javascript
   const SUPABASE_URL = "YOUR_SUPABASE_URL";
   const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
   ```

### Managing Checkpoints

1. From the welcome screen, tap **⚙️ Admin Mode**.
2. Log in with your admin credentials.
3. Tap **➕ Add Checkpoint**, select a location on the interactive map, set the proximity radius, assign reward points, choose an object style, and write a clue.
4. Save and optionally export the quest configuration as a JSON file.

---

## 📂 Project Structure

```text
Campus-Quest/
├── index.html        # Main app UI structure & screens
├── style.css         # Styling, glassmorphic themes, animations
├── app.js            # Core game logic, GPS, AR camera, Admin CRUD
├── sw.js             # Service Worker for offline asset caching
├── manifest.json     # PWA configuration manifest
├── icon.svg          # App vector icon & PWA logo
└── README.md         # Project documentation
```

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

1. Fork the project.
2. Create your feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
