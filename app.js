/* ============================================================
   CAMPUS QUEST – Main Application Logic
   ============================================================
   All game state, GPS, map, encounters, camera, admin CRUD,
   import/export and persistence in one well-commented file.
   ============================================================ */
// ──────────────────────────────────────────────────────────────
// SUPABASE CONFIGURATION
// Create a free Supabase project, create a 'checkpoints' table,
// and paste your credentials here.
// ──────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://sxvlrorvcyjwzgcrtwbi.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4dmxyb3J2Y3lqd3pnY3J0d2JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2MzM2NTQsImV4cCI6MjEwNzIwOTY1NH0.7oANdC8gdGaNYCb9y5qWjW87Qg2eCNmc8Sh37tbHPlk" ;

let sbClient = null;
if (typeof window.supabase !== 'undefined' && SUPABASE_URL !== 'YOUR_SUPABASE_URL') {
  sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
// ──────────────────────────────────────────────────────────────
// SECTION 1 — OBJECT / CREATURE TYPES
// Each checkpoint shows one of these objects over the camera.
// ──────────────────────────────────────────────────────────────
const OBJECT_TYPES = {
  treasure:  { emoji: '📦', name: 'Treasure Chest', color: '#FFD700' },
  artifact:  { emoji: '💎', name: 'Glowing Artifact', color: '#00FFFF' },
  mystery:   { emoji: '🎁', name: 'Mystery Box',     color: '#FF69B4' },
  portal:    { emoji: '🌀', name: 'Portal',          color: '#9B59B6' },
  emblem:    { emoji: '🏛️', name: 'Campus Emblem',   color: '#3498DB' },
  key:       { emoji: '🔑', name: 'Golden Key',      color: '#F39C12' },
  star:      { emoji: '⭐', name: 'Star',            color: '#F1C40F' },
  guardian:  { emoji: '🛡️', name: 'Guardian',        color: '#2ECC71' }
};

// ──────────────────────────────────────────────────────────────
// SECTION 2 — GAME STATE
// Everything the game needs to track at runtime.
// ──────────────────────────────────────────────────────────────
const state = {
  // Player
  playerName: '',
  score: 0,
  completedCheckpoints: [],   // array of checkpoint IDs
  currentCheckpointIndex: 0,  // index into sorted checkpoints

  // GPS
  position: null,       // { lat, lng, accuracy }
  gpsWatchId: null,
  gpsActive: false,

  // Checkpoints (the configured list)
  checkpoints: [],

  // Map objects (Leaflet references)
  map: null,
  playerMarker: null,
  accuracyCircle: null,
  cpLayerGroup: null,

  // Admin
  formMap: null,
  formMarker: null,
  formCircle: null,
  editingId: null,       // checkpoint ID being edited, or null

  // Encounter
  currentEncounter: null, // checkpoint object being encountered
  cameraStream: null,

  // Settings (persisted)
  testMode: false,       // skip camera requirement (admin)
  showAll: false,        // show all checkpoints on map (admin)

  // Misc
  toastTimer: null
};

// ──────────────────────────────────────────────────────────────
// SECTION 3 — STORAGE  (localStorage)
// Keys:  cq_player  cq_checkpoints  cq_settings
// ──────────────────────────────────────────────────────────────

/** Save player progress (name, score, completed list, current index). */
function savePlayer() {
  localStorage.setItem('cq_player', JSON.stringify({
    name: state.playerName,
    score: state.score,
    completed: state.completedCheckpoints,
    currentIndex: state.currentCheckpointIndex
  }));
}

/** Load player progress. Returns true if a save exists. */
function loadPlayer() {
  const raw = localStorage.getItem('cq_player');
  if (!raw) return false;
  try {
    const d = JSON.parse(raw);
    state.playerName = d.name || '';
    state.score = d.score || 0;
    state.completedCheckpoints = d.completed || [];
    state.currentCheckpointIndex = d.currentIndex || 0;
    return true;
  } catch { return false; }
}

/* ---------- CHECKPOINTS ----------
   Stored as JSON array in localStorage under key "cq_checkpoints".
   Each checkpoint object:
   {
     id:        "cp_abc123",
     name:      "Library",
     latitude:  22.xxxxx,
     longitude: 75.xxxxx,
     radius:    50,          // metres
     reward:    100,         // points
     clue:      "Where knowledge lives…",
     creature:  "treasure",  // key from OBJECT_TYPES
     order:     1            // sequence order
   }
*/
async function saveCheckpoints(list) {
  const data = list || state.checkpoints;
  
  // If connected to Supabase, sync to the cloud
  if (sbClient) {
    const { error } = await sbClient.from('checkpoints').upsert(
      data.map(cp => ({ ...cp }))
    );
    if (error) {
      console.error('Supabase save error:', error);
      showToast('Error syncing to database', 'error');
    }
  }
  
  // Always keep a local backup for seamless offline play or migration
  localStorage.setItem('cq_checkpoints', JSON.stringify(data));
}

async function loadCheckpoints() {
  if (sbClient) {
    const { data, error } = await sbClient
      .from('checkpoints')
      .select('*')
      .order('order', { ascending: true });
      
    if (!error && data && data.length > 0) {
      // Keep local backup updated
      localStorage.setItem('cq_checkpoints', JSON.stringify(data));
      return data;
    } else if (error) {
      console.warn('Could not load from Supabase, falling back to local storage:', error);
    }
  }
  
  // Fallback to local storage
  const raw = localStorage.getItem('cq_checkpoints');
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function saveSettings() {
  localStorage.setItem('cq_settings', JSON.stringify({
    testMode: state.testMode,
    showAll: state.showAll
  }));
}

function loadSettings() {
  const raw = localStorage.getItem('cq_settings');
  if (!raw) return;
  try {
    const d = JSON.parse(raw);
    state.testMode = !!d.testMode;
    state.showAll = !!d.showAll;
  } catch { /* ignore */ }
}

// ──────────────────────────────────────────────────────────────
// SECTION 4 — UTILITIES
// ──────────────────────────────────────────────────────────────

/** Generate a short unique ID. */
function uid() {
  return 'cp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Escape HTML to prevent XSS in dynamic content. */
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/** Haversine distance between two GPS points, in METRES.
 *  This is the correct geographic distance formula. */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in metres
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Format distance for display. */
function fmtDist(m) {
  if (m < 1000) return Math.round(m) + 'm';
  return (m / 1000).toFixed(1) + 'km';
}

// ──────────────────────────────────────────────────────────────
// SECTION 5 — SCREEN MANAGEMENT
// Only one .screen can have the .active class at a time.
// ──────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');

  // When switching to the game screen, make sure the map renders correctly
  if (id === 'game-screen' && state.map) {
    setTimeout(() => state.map.invalidateSize(), 100);
  }
}

// ──────────────────────────────────────────────────────────────
// SECTION 6 — TOAST NOTIFICATIONS
// ──────────────────────────────────────────────────────────────
function showToast(msg, type) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + (type || '');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// ──────────────────────────────────────────────────────────────
// SECTION 7 — GPS SYSTEM
// Uses watchPosition for continuous tracking.
// ──────────────────────────────────────────────────────────────

function startGPS() {
  if (!navigator.geolocation) {
    updateGPSUI('error', 'GPS not supported on this device');
    showToast('Geolocation is not available', 'error');
    return;
  }

  updateGPSUI('searching', 'Acquiring GPS…');

  state.gpsWatchId = navigator.geolocation.watchPosition(
    onGPSSuccess,
    onGPSError,
    {
      enableHighAccuracy: true,
      maximumAge: 5000,   // Accept cached positions up to 5 s old
      timeout: 20000      // Wait up to 20 s per attempt
    }
  );
}

function stopGPS() {
  if (state.gpsWatchId !== null) {
    navigator.geolocation.clearWatch(state.gpsWatchId);
    state.gpsWatchId = null;
  }
  state.gpsActive = false;
  closeCamera();
}

function onGPSSuccess(pos) {
  state.position = {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy
  };
  state.gpsActive = true;

  // Determine quality label
  const acc = state.position.accuracy;
  if (acc <= 15) {
    updateGPSUI('active', '📍 GPS Active', 'Accuracy: ' + Math.round(acc) + 'm');
  } else if (acc <= 50) {
    updateGPSUI('active', '📍 GPS Active', 'Accuracy: ~' + Math.round(acc) + 'm');
  } else {
    updateGPSUI('warning', '⚠️ Low accuracy', '~' + Math.round(acc) + 'm – move outdoors');
  }

  updatePlayerOnMap();
  checkProximity();
}

function onGPSError(err) {
  state.gpsActive = false;
  let msg = 'GPS error';
  if (err.code === 1) msg = 'Location permission denied. Please enable it in browser/device settings.';
  else if (err.code === 2) msg = 'Position unavailable. Try moving outdoors.';
  else if (err.code === 3) msg = 'GPS timeout. Retrying…';
  updateGPSUI('error', msg);
  if (err.code === 1) showToast(msg, 'error');
}

function updateGPSUI(status, text, detail) {
  const dot = document.getElementById('gps-dot');
  const statusEl = document.getElementById('gps-status-text');
  const accEl = document.getElementById('gps-accuracy-text');

  dot.className = 'gps-dot ' + (status || '');
  if (text) statusEl.textContent = text;
  accEl.textContent = detail || '';
}

// ──────────────────────────────────────────────────────────────
// SECTION 8 — MAP (Leaflet + OpenStreetMap)
// ──────────────────────────────────────────────────────────────

function initMap() {
  if (state.map) return; // already initialised

  state.map = L.map('map-container', {
    zoomControl: false,
    attributionControl: false
  }).setView([22.7196, 75.8577], 17); // Default view (Indore, India)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(state.map);

  // Player marker
  const playerIcon = L.divIcon({ className: 'player-marker', iconSize: [18, 18] });
  state.playerMarker = L.marker([0, 0], { icon: playerIcon, zIndex: 1000 });
  state.accuracyCircle = L.circle([0, 0], { radius: 0, className: 'accuracy-circle' });

  state.cpLayerGroup = L.layerGroup().addTo(state.map);
}

function updatePlayerOnMap() {
  if (!state.map || !state.position) return;
  const { lat, lng, accuracy } = state.position;

  state.playerMarker.setLatLng([lat, lng]).addTo(state.map);
  state.accuracyCircle.setLatLng([lat, lng]).setRadius(accuracy).addTo(state.map);

  // Centre map on first fix
  if (!state._mapCentred) {
    state.map.setView([lat, lng], 17);
    state._mapCentred = true;
  }

  updateCheckpointMarkers();
}

function centreMapOnPlayer() {
  if (state.position && state.map) {
    state.map.setView([state.position.lat, state.position.lng], 17, { animate: true });
  }
}

/** Redraw all checkpoint markers on the game map. */
function updateCheckpointMarkers() {
  if (!state.cpLayerGroup) return;
  state.cpLayerGroup.clearLayers();

  const sorted = getSortedCheckpoints();
  sorted.forEach((cp, idx) => {
    const isCompleted = state.completedCheckpoints.includes(cp.id);
    const isActive = idx === state.currentCheckpointIndex;
    
    // Check if the player has physically reached the active checkpoint
    let isReached = false;
    if (isActive && state.position) {
      const d = haversine(state.position.lat, state.position.lng, cp.latitude, cp.longitude);
      if (d <= cp.radius) {
        isReached = true;
      }
    }
    
    // Hide active checkpoint from map unless reached or admin showAll is checked
    const isVisible = state.showAll || isCompleted || (isActive && isReached);

    if (!isVisible) return;

    // Determine marker state
    let markerClass = 'cp-marker';
    let radiusClass = 'cp-radius-default';
    if (isCompleted) {
      markerClass += ' completed';
      radiusClass = 'cp-radius-completed';
    } else if (isActive && state.position) {
      const d = haversine(state.position.lat, state.position.lng, cp.latitude, cp.longitude);
      if (d <= cp.radius) {
        markerClass += ' available';
        radiusClass = 'cp-radius-available';
      }
    } else {
      markerClass += ' locked';
    }

    const obj = OBJECT_TYPES[cp.creature] || OBJECT_TYPES.treasure;
    const icon = L.divIcon({
      className: markerClass,
      html: isCompleted ? '✓' : obj.emoji,
      iconSize: [32, 32]
    });

    L.marker([cp.latitude, cp.longitude], { icon }).addTo(state.cpLayerGroup);
    L.circle([cp.latitude, cp.longitude], {
      radius: cp.radius,
      className: radiusClass
    }).addTo(state.cpLayerGroup);
  });
}

// ──────────────────────────────────────────────────────────────
// SECTION 9 — CHECKPOINT LOGIC
// Sequential progression: one active checkpoint at a time.
// Note: As a serverless PWA, all checkpoint data remains client-side.
// However, future checkpoint details (name, map pin) are strictly
// hidden from the player UI until the clue is solved and location reached.
// ──────────────────────────────────────────────────────────────

/** Return checkpoints sorted by their `order` field. */
function getSortedCheckpoints() {
  return [...state.checkpoints].sort((a, b) => (a.order || 0) - (b.order || 0));
}

/** Get the currently active (not completed) checkpoint, or null. */
function getActiveCheckpoint() {
  const sorted = getSortedCheckpoints();
  if (state.currentCheckpointIndex >= sorted.length) return null;
  return sorted[state.currentCheckpointIndex];
}

/**
 * Check player proximity to the active checkpoint.
 * Updates the bottom panel UI accordingly.
 *
 * GPS ACCURACY SAFETY:
 * If the player's GPS accuracy exceeds 2× the checkpoint radius,
 * we do NOT mark the checkpoint as reachable, to prevent false triggers.
 */
function checkProximity() {
  const cp = getActiveCheckpoint();
  if (!cp || !state.position) {
    updateCheckpointPanel(null);
    hideAREncounter();
    return;
  }

  // Already completed? Show completed state.
  if (state.completedCheckpoints.includes(cp.id)) {
    updateCheckpointPanel(cp, null, 'completed');
    hideAREncounter();
    return;
  }

  const dist = haversine(state.position.lat, state.position.lng, cp.latitude, cp.longitude);
  const acc  = state.position.accuracy;

  // GPS accuracy safety: if accuracy is worse than 2× radius, don't confirm
  if (dist <= cp.radius) {
    if (acc > cp.radius * 2) {
      updateCheckpointPanel(cp, dist, 'low-accuracy');
      hideAREncounter();
    } else {
      updateCheckpointPanel(cp, dist, 'available');
      triggerAREncounter(cp);
    }
  } else if (dist <= cp.radius * 3) {
    updateCheckpointPanel(cp, dist, 'nearby');
    hideAREncounter();
  } else {
    updateCheckpointPanel(cp, dist, 'locked');
    hideAREncounter();
  }
}

/** Update the bottom checkpoint info panel. */
function updateCheckpointPanel(cp, dist, cpState) {
  const nameEl   = document.getElementById('cp-name');
  const distEl   = document.getElementById('cp-distance');
  const iconEl   = document.getElementById('cp-status-icon');
  const badgeEl  = document.getElementById('cp-state-badge');
  const clueText = document.getElementById('cp-clue-text');
  const openBtn  = document.getElementById('open-checkpoint-btn');
  const doneMsg  = document.getElementById('cp-completed-msg');

  // No checkpoints overlay
  const noCP = document.getElementById('no-checkpoints-overlay');
  if (state.checkpoints.length === 0) {
    noCP.style.display = 'flex';
    return;
  } else {
    noCP.style.display = 'none';
  }

  if (!cp) {
    nameEl.textContent = 'All Checkpoints Complete!';
    distEl.textContent = '';
    iconEl.textContent = '🎊';
    badgeEl.textContent = 'DONE';
    badgeEl.className = 'badge badge-completed';
    openBtn.style.display = 'none';
    doneMsg.style.display = 'none';
    clueText.textContent = 'Congratulations – you conquered Campus Quest!';
    closeCamera();
    return;
  }

  // Hide the checkpoint name until it is reached
  if (state.showAll || cpState === 'available' || cpState === 'completed') {
    nameEl.textContent = cp.name;
  } else {
    const sorted = getSortedCheckpoints();
    const cpIdx = sorted.indexOf(cp);
    nameEl.textContent = 'Mystery Checkpoint ' + (cpIdx + 1);
  }

  const obj = OBJECT_TYPES[cp.creature] || OBJECT_TYPES.treasure;

  // Clue: show the clue from the PREVIOUS completed checkpoint, if any
  const sorted = getSortedCheckpoints();
  const cpIdx = sorted.indexOf(cp);
  if (cpIdx > 0 && state.completedCheckpoints.includes(sorted[cpIdx - 1].id)) {
    clueText.textContent = sorted[cpIdx - 1].clue || 'No clue set.';
  } else if (cpIdx === 0) {
    clueText.textContent = 'Find the first checkpoint – explore the map!';
  } else {
    clueText.textContent = 'Complete the previous checkpoint to get a clue.';
  }

  switch (cpState) {
    case 'locked':
      iconEl.textContent = '🔒';
      distEl.textContent = dist != null ? fmtDist(dist) + ' away' : '';
      badgeEl.textContent = 'LOCKED';
      badgeEl.className = 'badge badge-locked';
      openBtn.style.display = 'none';
      doneMsg.style.display = 'none';
      break;

    case 'nearby':
      iconEl.textContent = '📍';
      distEl.textContent = fmtDist(dist) + ' away – getting closer!';
      badgeEl.textContent = 'NEARBY';
      badgeEl.className = 'badge badge-nearby';
      openBtn.style.display = 'none';
      doneMsg.style.display = 'none';
      break;

    case 'available':
      iconEl.textContent = '🎯';
      distEl.textContent = 'Checkpoint reached!';
      badgeEl.textContent = 'REACHED';
      badgeEl.className = 'badge badge-available';
      openBtn.style.display = 'block';
      doneMsg.style.display = 'none';
      break;

    case 'low-accuracy':
      iconEl.textContent = '⚠️';
      distEl.textContent = 'GPS accuracy too low to verify (' + Math.round(state.position.accuracy) + 'm)';
      badgeEl.textContent = 'WAIT';
      badgeEl.className = 'badge badge-nearby';
      openBtn.style.display = 'none';
      doneMsg.style.display = 'none';
      break;

    case 'completed':
      iconEl.textContent = '✅';
      distEl.textContent = '';
      badgeEl.textContent = 'COMPLETED';
      badgeEl.className = 'badge badge-completed';
      openBtn.style.display = 'none';
      doneMsg.style.display = 'block';
      break;
  }

  // Update header score & progress
  document.getElementById('player-score').textContent = state.score;
  document.getElementById('checkpoint-progress').textContent =
    state.completedCheckpoints.length + '/' + state.checkpoints.length;
}

// ──────────────────────────────────────────────────────────────
// SECTION 10 — ENCOUNTER / CAMERA SYSTEM
// ──────────────────────────────────────────────────────────────

/** Automatically show the AR object when in radius */
function triggerAREncounter(cp) {
  if (state.currentEncounter && state.currentEncounter.id === cp.id) return; // already showing
  state.currentEncounter = cp;

  const obj = OBJECT_TYPES[cp.creature] || OBJECT_TYPES.treasure;
  document.getElementById('ar-object-emoji').textContent = obj.emoji;
  document.getElementById('ar-object-name').textContent = obj.name;
  
  const overlay = document.getElementById('ar-overlay');
  overlay.style.display = 'flex';
  
  // Re-trigger entrance animation
  const arObj = document.getElementById('ar-object');
  arObj.style.animation = 'none';
  arObj.offsetHeight; // reflow
  arObj.style.animation = '';
}

/** Hide AR object when leaving radius */
function hideAREncounter() {
  state.currentEncounter = null;
  document.getElementById('ar-overlay').style.display = 'none';
}

/** Request the rear camera and show the live feed as background. */
async function openCamera() {
  const video = document.getElementById('camera-video');
  const errorDiv = document.getElementById('camera-error');
  
  // If test mode (admin), mock success
  if (state.testMode) {
    video.style.display = 'none';
    errorDiv.style.display = 'none';
    return;
  }

  try {
    if (state.cameraStream) return; // already open
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });
    state.cameraStream = stream;
    video.srcObject = stream;
    video.style.display = 'block';
    errorDiv.style.display = 'none';
  } catch (err) {
    console.warn('Camera error:', err);
    showCameraError(err);
  }
}

/** Stop the camera feed (only when exiting game). */
function closeCamera() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach(t => t.stop());
    state.cameraStream = null;
  }
  const video = document.getElementById('camera-video');
  video.srcObject = null;
  video.style.display = 'none';
}

/** Show camera error with fallback option (in test mode). */
function showCameraError(err) {
  const video = document.getElementById('camera-video');
  video.style.display = 'none';
  
  const errorDiv = document.getElementById('camera-error');
  errorDiv.style.display = 'flex';

  let msg = 'Camera access is required to play.';
  if (err && err.name === 'NotAllowedError') {
    msg = 'Camera permission was denied. Please enable it in your browser settings.';
  } else if (err && err.name === 'NotFoundError') {
    msg = 'No camera found on this device.';
  } else if (err && err.name === 'NotReadableError') {
    msg = 'Camera is already in use by another application.';
  }
  document.getElementById('camera-error-text').textContent = msg;

  const fallbackBtn = document.getElementById('fallback-claim-btn');
  fallbackBtn.style.display = state.testMode ? 'block' : 'none';
}

/** Claim the reward: mark checkpoint as completed, award points. */
function claimReward() {
  const cp = state.currentEncounter;
  if (!cp) return;

  // Prevent double-claiming
  if (state.completedCheckpoints.includes(cp.id)) {
    showToast('Already completed!', 'warning');
    return;
  }

  // Award points
  state.score += cp.reward;
  state.completedCheckpoints.push(cp.id);
  state.currentCheckpointIndex++;

  // Persist
  savePlayer();

  // Hide AR overlay but keep camera running for next checkpoint
  hideAREncounter();

  // Show reward screen
  showRewardScreen(cp);
}

/** Display the reward + next clue screen. */
function showRewardScreen(cp) {
  showScreen('reward-screen');

  document.getElementById('reward-checkpoint-name').textContent = cp.name;
  document.getElementById('reward-points-earned').textContent = '+' + cp.reward;
  document.getElementById('reward-total-score').textContent = state.score;

  // Next clue
  const sorted = getSortedCheckpoints();
  const cpIdx = sorted.findIndex(c => c.id === cp.id);
  const nextExists = cpIdx < sorted.length - 1;

  const clueContainer = document.getElementById('next-clue-container');
  const allDone = document.getElementById('all-complete-msg');

  if (nextExists) {
    // Show THIS checkpoint's clue (it leads to the next checkpoint)
    clueContainer.style.display = 'block';
    allDone.style.display = 'none';
    document.getElementById('next-clue-text').textContent =
      cp.clue || 'Explore the map to find the next checkpoint!';
  } else {
    // All done!
    clueContainer.style.display = 'none';
    allDone.style.display = 'block';
  }

  // Confetti!
  createConfetti();
}

/** Simple confetti animation using CSS. */
function createConfetti() {
  const container = document.getElementById('confetti-container');
  container.innerHTML = '';
  const colors = ['#ff6b35','#00d4ff','#ffd700','#00ff88','#ff69b4','#9b59b6'];
  for (let i = 0; i < 40; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + '%';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = Math.random() * 1 + 's';
    piece.style.animationDuration = (1.5 + Math.random()) + 's';
    piece.style.width = (6 + Math.random() * 8) + 'px';
    piece.style.height = (6 + Math.random() * 8) + 'px';
    container.appendChild(piece);
  }
}

// ──────────────────────────────────────────────────────────────
// SECTION 11 — ADMIN SYSTEM
// Create, edit, delete checkpoints. Import/export JSON.
// ──────────────────────────────────────────────────────────────

/** Render the admin checkpoint list. */
function renderAdminList() {
  const container = document.getElementById('admin-checkpoint-list');
  const cps = getSortedCheckpoints();

  if (cps.length === 0) {
    container.innerHTML = '<p class="empty-msg">No checkpoints configured. Tap ➕ to create one!</p>';
    return;
  }

  container.innerHTML = cps.map((cp, i) => {
    const obj = OBJECT_TYPES[cp.creature] || OBJECT_TYPES.treasure;
    return `
      <div class="admin-cp-card" data-id="${cp.id}">
        <div class="cp-order">${cp.order || (i + 1)}</div>
        <div class="cp-details">
          <div class="cp-card-name">${obj.emoji} ${esc(cp.name)}</div>
          <div class="cp-card-meta">${cp.radius}m · ${cp.reward}pts · ${cp.latitude.toFixed(5)}, ${cp.longitude.toFixed(5)}</div>
        </div>
        <div class="cp-card-actions">
          <button class="icon-btn edit-cp-btn" data-id="${cp.id}" aria-label="Edit">✏️</button>
          <button class="icon-btn delete-cp-btn" data-id="${cp.id}" aria-label="Delete">🗑️</button>
        </div>
      </div>`;
  }).join('');

  // Attach listeners
  container.querySelectorAll('.edit-cp-btn').forEach(btn =>
    btn.addEventListener('click', () => openForm(btn.dataset.id))
  );
  container.querySelectorAll('.delete-cp-btn').forEach(btn =>
    btn.addEventListener('click', () => deleteCheckpoint(btn.dataset.id))
  );
}

/** Open the checkpoint form for creating or editing. */
function openForm(existingId) {
  showScreen('checkpoint-form-screen');
  state.editingId = existingId || null;

  const title = document.getElementById('form-title');
  const deleteBtn = document.getElementById('form-delete-btn');

  // Initialise form map
  if (!state.formMap) {
    state.formMap = L.map('form-map-container', {
      zoomControl: false,
      attributionControl: false
    }).setView([22.7196, 75.8577], 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(state.formMap);

    // Click to set checkpoint location
    state.formMap.on('click', onFormMapClick);
  }

  // Force re-render after screen transition
  setTimeout(() => state.formMap.invalidateSize(), 150);

  // Clear previous markers
  if (state.formMarker) { state.formMap.removeLayer(state.formMarker); state.formMarker = null; }
  if (state.formCircle) { state.formMap.removeLayer(state.formCircle); state.formCircle = null; }

  if (existingId) {
    // EDIT mode
    title.textContent = 'Edit Checkpoint';
    deleteBtn.style.display = 'block';
    const cp = state.checkpoints.find(c => c.id === existingId);
    if (cp) {
      document.getElementById('form-name').value = cp.name;
      document.getElementById('form-lat').value = cp.latitude;
      document.getElementById('form-lng').value = cp.longitude;
      document.getElementById('form-radius').value = cp.radius;
      document.getElementById('form-reward').value = cp.reward;
      document.getElementById('form-clue').value = cp.clue || '';
      document.getElementById('form-creature').value = cp.creature || 'treasure';
      document.getElementById('form-order').value = cp.order || 1;

      // Show marker on map
      state.formMap.setView([cp.latitude, cp.longitude], 17);
      placeFormMarker(cp.latitude, cp.longitude, cp.radius);
    }
  } else {
    // CREATE mode
    title.textContent = 'Create Checkpoint';
    deleteBtn.style.display = 'none';
    document.getElementById('form-name').value = '';
    document.getElementById('form-lat').value = '';
    document.getElementById('form-lng').value = '';
    document.getElementById('form-radius').value = 50;
    document.getElementById('form-reward').value = 100;
    document.getElementById('form-clue').value = '';
    document.getElementById('form-creature').value = 'treasure';
    document.getElementById('form-order').value = state.checkpoints.length + 1;

    // If we have GPS, centre form map on player position
    if (state.position) {
      state.formMap.setView([state.position.lat, state.position.lng], 17);
    }
  }
}

function onFormMapClick(e) {
  const lat = e.latlng.lat;
  const lng = e.latlng.lng;
  document.getElementById('form-lat').value = lat.toFixed(6);
  document.getElementById('form-lng').value = lng.toFixed(6);

  const radius = parseInt(document.getElementById('form-radius').value) || 50;
  placeFormMarker(lat, lng, radius);
}

function placeFormMarker(lat, lng, radius) {
  if (state.formMarker) state.formMap.removeLayer(state.formMarker);
  if (state.formCircle) state.formMap.removeLayer(state.formCircle);

  state.formMarker = L.marker([lat, lng]).addTo(state.formMap);
  state.formCircle = L.circle([lat, lng], {
    radius,
    color: '#ff6b35',
    fillColor: '#ff6b35',
    fillOpacity: 0.12,
    dashArray: '6 4'
  }).addTo(state.formMap);
}

/** Save the form as a new or updated checkpoint. */
async function saveForm() {
  const name = document.getElementById('form-name').value.trim();
  const lat = parseFloat(document.getElementById('form-lat').value);
  const lng = parseFloat(document.getElementById('form-lng').value);
  const radius = parseInt(document.getElementById('form-radius').value) || 50;
  const reward = parseInt(document.getElementById('form-reward').value) || 100;
  const clue = document.getElementById('form-clue').value.trim();
  const creature = document.getElementById('form-creature').value;
  const order = parseInt(document.getElementById('form-order').value) || 1;

  // Validation
  if (!name) { showToast('Please enter a checkpoint name', 'error'); return; }
  if (isNaN(lat) || isNaN(lng)) { showToast('Please tap the map to set a location', 'error'); return; }

  if (state.editingId) {
    // Update existing
    const idx = state.checkpoints.findIndex(c => c.id === state.editingId);
    if (idx >= 0) {
      state.checkpoints[idx] = {
        ...state.checkpoints[idx],
        name, latitude: lat, longitude: lng, radius, reward, clue, creature, order
      };
    }
  } else {
    // Create new
    state.checkpoints.push({
      id: uid(), name, latitude: lat, longitude: lng, radius, reward, clue, creature, order
    });
  }

  await saveCheckpoints();
  showToast('Checkpoint saved!', 'success');
  showScreen('admin-screen');
  renderAdminList();
}

/** Delete a checkpoint after confirmation. */
async function deleteCheckpoint(id) {
  const cp = state.checkpoints.find(c => c.id === id);
  if (!cp) return;
  if (!confirm('Delete checkpoint "' + cp.name + '"?')) return;

  if (sbClient) {
    const { error } = await sbClient.from('checkpoints').delete().eq('id', id);
    if (error) {
      showToast('Error deleting from database', 'error');
      console.error(error);
      return;
    }
  }

  state.checkpoints = state.checkpoints.filter(c => c.id !== id);
  await saveCheckpoints();
  renderAdminList();
  showToast('Checkpoint deleted', 'warning');

  // If we were editing this one, go back to admin list
  if (state.editingId === id) {
    state.editingId = null;
    showScreen('admin-screen');
  }
}

/** Export checkpoints as a downloadable JSON file. */
function exportCheckpoints() {
  if (state.checkpoints.length === 0) {
    showToast('No checkpoints to export', 'warning');
    return;
  }
  const json = JSON.stringify(state.checkpoints, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'campus-quest-checkpoints.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Exported ' + state.checkpoints.length + ' checkpoints', 'success');
}

/** Import checkpoints from a JSON file. */
function importCheckpoints(file) {
  const reader = new FileReader();
  reader.onload = async function (e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) throw new Error('File must contain a JSON array');

      // Validate & normalise each checkpoint
      const imported = data.map((cp, i) => {
        if (!cp.name || cp.latitude == null || cp.longitude == null) {
          throw new Error('Checkpoint #' + (i + 1) + ' is missing name, latitude or longitude');
        }
        return {
          id: cp.id || uid(),
          name: cp.name,
          latitude: parseFloat(cp.latitude),
          longitude: parseFloat(cp.longitude),
          radius: parseInt(cp.radius) || 50,
          reward: parseInt(cp.reward) || 100,
          clue: cp.clue || '',
          creature: cp.creature || 'treasure',
          order: parseInt(cp.order) || (i + 1)
        };
      });

      state.checkpoints = imported;
      await saveCheckpoints();
      renderAdminList();
      showToast('Imported ' + imported.length + ' checkpoints!', 'success');
    } catch (err) {
      showToast('Import failed: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

// ──────────────────────────────────────────────────────────────
// SECTION 12 — GAME FLOW HELPERS
// ──────────────────────────────────────────────────────────────

/** Start a new game with the entered name. */
function startNewGame(name) {
  state.playerName = name;
  state.score = 0;
  state.completedCheckpoints = [];
  state.currentCheckpointIndex = 0;
  savePlayer();
  enterGame();
}

/** Continue an existing game. */
function continueGame() {
  enterGame();
}

/** Common game-entry: switch to game screen, start GPS, init map. */
async function enterGame() {
  document.getElementById('player-display-name').textContent = state.playerName;
  document.getElementById('player-score').textContent = state.score;

  // Load checkpoints
  state.checkpoints = await loadCheckpoints();

  showScreen('game-screen');
  
  // Update progress display
  document.getElementById('checkpoint-progress').textContent =
    state.completedCheckpoints.length + '/' + state.checkpoints.length;
    
  // Start GPS and Camera immediately (requests permissions)
  startGPS();
  await openCamera();

  // Initial panel update
  checkProximity();
}

/** Reset all player progress (but keep checkpoints). */
function resetProgress() {
  if (!confirm('Reset all progress? Score and completed checkpoints will be lost.')) return;
  state.score = 0;
  state.completedCheckpoints = [];
  state.currentCheckpointIndex = 0;
  state.playerName = '';
  localStorage.removeItem('cq_player');
  stopGPS();
  showScreen('welcome-screen');
  setupWelcome();
  showToast('Progress reset', 'warning');
}

// ──────────────────────────────────────────────────────────────
// SECTION 13 — EVENT LISTENERS & INITIALISATION
// ──────────────────────────────────────────────────────────────

function setupWelcome() {
  const hasSave = loadPlayer();
  const newSection = document.getElementById('new-game-section');
  const contSection = document.getElementById('continue-game-section');

  if (hasSave && state.playerName) {
    newSection.style.display = 'none';
    contSection.style.display = 'block';
    document.getElementById('welcome-back-msg').textContent =
      'Welcome back, ' + state.playerName + '! Score: ' + state.score;
  } else {
    newSection.style.display = 'block';
    contSection.style.display = 'none';
  }
}

async function init() {
  // Load persisted data
  loadSettings();
  state.checkpoints = await loadCheckpoints();

  // Apply saved settings to admin toggles
  document.getElementById('admin-test-mode').checked = state.testMode;
  document.getElementById('admin-show-all').checked = state.showAll;

  // Show splash, then welcome
  setTimeout(() => {
    showScreen('welcome-screen');
    setupWelcome();
  }, 2000);

  // ─── WELCOME SCREEN ───
  const nameInput = document.getElementById('player-name-input');
  const startBtn = document.getElementById('start-game-btn');

  nameInput.addEventListener('input', () => {
    startBtn.disabled = nameInput.value.trim().length === 0;
  });

  startBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    if (name) startNewGame(name);
  });

  // Allow Enter to start
  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && nameInput.value.trim()) startNewGame(nameInput.value.trim());
  });

  document.getElementById('continue-game-btn').addEventListener('click', continueGame);

  document.getElementById('new-game-btn').addEventListener('click', async () => {
    localStorage.removeItem('cq_player');
    state.playerName = '';
    state.score = 0;
    state.completedCheckpoints = [];
    state.currentCheckpointIndex = 0;
    document.getElementById('new-game-section').style.display = 'block';
    document.getElementById('continue-game-section').style.display = 'none';
    document.getElementById('player-name-input').value = '';
    document.getElementById('start-game-btn').disabled = true;
  });

  // ─── ADMIN AUTHENTICATION FLOW ───
  async function openAdminMode() {
    state.checkpoints = await loadCheckpoints();
    
    if (sbClient) {
      const { data: { session } } = await sbClient.auth.getSession();
      if (!session) {
        showScreen('admin-login-screen');
        return;
      }
    }
    
    renderAdminList();
    showScreen('admin-screen');
  }

  document.getElementById('admin-mode-btn').addEventListener('click', openAdminMode);

  // Login Handlers
  document.getElementById('admin-login-btn').addEventListener('click', async () => {
    const email = document.getElementById('admin-email').value;
    const password = document.getElementById('admin-password').value;
    const errorEl = document.getElementById('admin-login-error');
    
    if (!sbClient) {
      errorEl.textContent = 'Supabase is not configured yet.';
      errorEl.style.display = 'block';
      return;
    }
    
    const { error } = await sbClient.auth.signInWithPassword({ email, password });
    if (error) {
      errorEl.textContent = error.message;
      errorEl.style.display = 'block';
    } else {
      errorEl.style.display = 'none';
      document.getElementById('admin-password').value = '';
      openAdminMode();
    }
  });

  document.getElementById('admin-login-cancel-btn').addEventListener('click', () => {
    showScreen('welcome-screen');
  });

  document.getElementById('admin-logout-btn').addEventListener('click', async () => {
    if (sbClient) await sbClient.auth.signOut();
    showScreen('welcome-screen');
    showToast('Logged out of Admin', 'success');
  });

  // ─── GAME SCREEN ───
  document.getElementById('center-map-btn').addEventListener('click', centreMapOnPlayer);

  document.getElementById('back-menu-btn').addEventListener('click', async () => {
    document.getElementById('menu-overlay').style.display = 'flex';
  });

  document.getElementById('go-admin-btn').addEventListener('click', async () => {
    stopGPS();
    openAdminMode();
  });

  // ─── MENU OVERLAY ───
  document.getElementById('menu-continue').addEventListener('click', async () => {
    document.getElementById('menu-overlay').style.display = 'none';
  });
  document.getElementById('menu-backdrop').addEventListener('click', async () => {
    document.getElementById('menu-overlay').style.display = 'none';
  });
  document.getElementById('menu-admin').addEventListener('click', async () => {
    document.getElementById('menu-overlay').style.display = 'none';
    stopGPS();
    openAdminMode();
  });
  document.getElementById('menu-reset').addEventListener('click', async () => {
    document.getElementById('menu-overlay').style.display = 'none';
    resetProgress();
  });

  // ─── ENCOUNTER SCREEN ───


  // Claim reward by tapping AR object OR claim button
  document.getElementById('ar-object').addEventListener('click', claimReward);
  document.getElementById('claim-reward-btn').addEventListener('click', claimReward);
  document.getElementById('fallback-claim-btn').addEventListener('click', claimReward);
  document.getElementById('retry-camera-btn').addEventListener('click', async () => {
    document.getElementById('camera-error').style.display = 'none';
    openCamera();
  });

  // ─── REWARD SCREEN ───
  document.getElementById('reward-continue-btn').addEventListener('click', async () => {
    showScreen('game-screen');
    // Refresh map & panel
    if (state.map) state.map.invalidateSize();
    updateCheckpointMarkers();
    checkProximity();
  });

  // ─── ADMIN SCREEN ───
  document.getElementById('admin-back-btn').addEventListener('click', async () => {
    showScreen('welcome-screen');
    setupWelcome();
  });

  document.getElementById('admin-add-btn').addEventListener('click', () => openForm(null));

  document.getElementById('admin-export-btn').addEventListener('click', exportCheckpoints);

  document.getElementById('admin-import-btn').addEventListener('click', async () => {
    document.getElementById('admin-import-file').click();
  });

  document.getElementById('admin-import-file').addEventListener('change', e => {
    if (e.target.files[0]) importCheckpoints(e.target.files[0]);
    e.target.value = ''; // reset so same file can be re-imported
  });

  document.getElementById('admin-test-mode').addEventListener('change', e => {
    state.testMode = e.target.checked;
    saveSettings();
  });

  document.getElementById('admin-show-all').addEventListener('change', e => {
    state.showAll = e.target.checked;
    saveSettings();
  });

  // ─── CHECKPOINT FORM ───
  document.getElementById('form-cancel-btn').addEventListener('click', async () => {
    showScreen('admin-screen');
    renderAdminList();
  });

  document.getElementById('form-save-btn').addEventListener('click', saveForm);

  document.getElementById('form-delete-btn').addEventListener('click', async () => {
    if (state.editingId) deleteCheckpoint(state.editingId);
  });

  // Update radius circle in real-time when radius input changes
  document.getElementById('form-radius').addEventListener('input', () => {
    const lat = parseFloat(document.getElementById('form-lat').value);
    const lng = parseFloat(document.getElementById('form-lng').value);
    const radius = parseInt(document.getElementById('form-radius').value) || 50;
    if (!isNaN(lat) && !isNaN(lng) && state.formMarker) {
      placeFormMarker(lat, lng, radius);
    }
  });

  // ─── SERVICE WORKER REGISTRATION ───
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err =>
      console.warn('SW registration failed:', err)
    );
  }
}

// Start the app when the DOM is ready
document.addEventListener('DOMContentLoaded', init);
