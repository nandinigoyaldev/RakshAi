// KAVACH Frontend Logic (app.js)
// ---------------------------------------------------------------
// Global state
let geoLocation = { lat: null, lng: null };
let isSosInProgress = false;
let autoTriggered = false;
let sosCountdownTimer = null;

// ---------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return Array.from(document.querySelectorAll(sel)); }

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function updateTimeDisplay() {
  $('#timeDisplay').textContent = formatTime(new Date());
}
setInterval(updateTimeDisplay, 1000);
updateTimeDisplay();

// ---------------------------------------------------------------
// Geolocation
// ---------------------------------------------------------------
if (navigator.geolocation) {
  navigator.geolocation.watchPosition(
    (pos) => {
      geoLocation.lat = pos.coords.latitude;
      geoLocation.lng = pos.coords.longitude;
    },
    (err) => {
      console.warn('Geolocation error:', err.message);
    },
    { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 }
  );
} else {
  console.warn('Geolocation not supported');
}

// ---------------------------------------------------------------
// Camera Setup
// ---------------------------------------------------------------
const video = $('#video');
const canvas = $('#overlayCanvas');
const ctx = canvas.getContext('2d');

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    video.srcObject = stream;
    video.onloadedmetadata = () => {
      video.play();
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    };
  } catch (e) {
    console.error('Camera error:', e);
    alert('Unable to access camera.');
  }
}
startCamera();

// ---------------------------------------------------------------
// Meter Helpers
// ---------------------------------------------------------------
function setMeter(meterId, percent, stateText, colorClass) {
  const meter = $(`#${meterId}`);
  const circle = meter.querySelector('.circle');
  const percentEl = meter.querySelector('.percentage');
  const stateEl = meter.querySelector('.meter-state');
  const dash = `${percent}, 100`;
  circle.setAttribute('stroke-dasharray', dash);
  percentEl.textContent = `${percent}%`;
  stateEl.textContent = stateText;
  // Reset color classes then add new one
  circle.classList.remove('green', 'amber', 'red');
  circle.classList.add(colorClass);
}

function levelToMeterInfo(level) {
  // level: 0,1,2 → percent, text, color
  switch (level) {
    case 0: return { percent: 0, text: 'NORMAL', color: 'green' };
    case 1: return { percent: 50, text: 'ELEVATED', color: 'amber' };
    case 2: return { percent: 100, text: 'DISTRESS', color: 'red' };
    default: return { percent: 0, text: 'UNKNOWN', color: 'green' };
  }
}

// ---------------------------------------------------------------
// API Calls
// ---------------------------------------------------------------
async function postAnalyze(imageBase64) {
  const payload = { image: imageBase64, location: geoLocation };
  const resp = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error('Analyze API error');
  return resp.json();
}

async function postSOS(triggeredBy, assessment, timestamp) {
  const payload = {
    location: geoLocation,
    assessment,
    triggered_by: triggeredBy,
    timestamp,
  };
  const resp = await fetch('/api/sos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error('SOS API error');
  return resp.json();
}

async function fetchArduino() {
  const resp = await fetch('/api/arduino');
  if (!resp.ok) return null;
  return resp.json();
}

async function loadContacts() {
  const resp = await fetch('/api/contacts');
  if (!resp.ok) return [];
  return resp.json();
}

async function addContact(name, phone) {
  const resp = await fetch('/api/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, phone }),
  });
  if (!resp.ok) throw new Error('Add contact failed');
  return resp.json();
}

async function deleteContact(phone) {
  const resp = await fetch(`/api/contacts/${encodeURIComponent(phone)}`, { method: 'DELETE' });
  if (!resp.ok) throw new Error('Delete contact failed');
  return resp.json();
}

// ---------------------------------------------------------------
// UI Rendering for Contacts
// ---------------------------------------------------------------
async function renderContacts() {
  const list = $('#contactsList');
  list.innerHTML = '';
  const contacts = await loadContacts();
  contacts.forEach(c => {
    const li = document.createElement('li');
    li.textContent = `${c.name} (${c.phone})`;
    const delBtn = document.createElement('button');
    delBtn.textContent = '✖';
    delBtn.className = 'delete-btn';
    delBtn.onclick = async () => {
      await deleteContact(c.phone);
      await renderContacts();
    };
    li.appendChild(delBtn);
    list.appendChild(li);
  });
}
renderContacts();

$('#addContactForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#contactName').value.trim();
  const phone = $('#contactPhone').value.trim();
  if (!name || !phone) return;
  try {
    await addContact(name, phone);
    $('#contactName').value = '';
    $('#contactPhone').value = '';
    await renderContacts();
  } catch (err) {
    console.error(err);
    alert('Failed to add contact');
  }
});

// ---------------------------------------------------------------
// Visual Effects
// ---------------------------------------------------------------
function flashRedOverlay(times = 3) {
  const overlay = document.createElement('div');
  overlay.id = 'autoTriggerOverlay';
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(255,0,64,0.3)';
  overlay.style.zIndex = '4';
  document.body.appendChild(overlay);
  let count = 0;
  const interval = setInterval(() => {
    overlay.style.display = overlay.style.display === 'none' ? 'block' : 'none';
    count++;
    if (count >= times * 2) {
      clearInterval(interval);
      overlay.remove();
    }
  }, 200);
}

function startSOSCountdown(triggeredBy, assessment) {
  if (isSosInProgress) return;
  isSosInProgress = true;
  // Flash + vibrate
  flashRedOverlay(3);
  if (navigator.vibrate) navigator.vibrate([500, 200, 500]);

  const modal = $('#sosCountdownModal');
  const countSpan = $('#countdownNumber');
  let count = 5;
  countSpan.textContent = count;
  modal.classList.add('show');

  const cancelBtn = $('#cancelSosBtn');
  const cancelHandler = () => {
    clearInterval(sosCountdownTimer);
    modal.classList.remove('show');
    isSosInProgress = false;
    cancelBtn.removeEventListener('click', cancelHandler);
  };
  cancelBtn.addEventListener('click', cancelHandler);

  sosCountdownTimer = setInterval(async () => {
    count--;
    if (count <= 0) {
      clearInterval(sosCountdownTimer);
      modal.classList.remove('show');
      const timestamp = new Date().toISOString();
      try {
        await postSOS(triggeredBy, assessment, timestamp);
        showSuccessOverlay();
      } catch (e) {
        console.error(e);
        alert('SOS failed');
      }
      isSosInProgress = false;
    } else {
      countSpan.textContent = count;
    }
  }, 1000);
}

function showSuccessOverlay() {
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(0,255,136,0.2)';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.zIndex = '5';
  overlay.innerHTML = `<div style="color:#00ff88; font-size:1.5rem; text-align:center;">
    ✓ ${$('#contactsList').children.length} CONTACTS ALERTED<br>Location shared<br>Stay calm. Help is coming.
  </div>`;
  document.body.appendChild(overlay);
  setTimeout(() => overlay.remove(), 5000);
}

// ---------------------------------------------------------------
// Fake Call UI
// ---------------------------------------------------------------
$('#fakeCallBtn').addEventListener('click', () => {
  $('#fakeCallModal').classList.add('show');
});
$('#fakeCallModal .btn-accept, #fakeCallModal .btn-decline').forEach(btn => {
  btn.addEventListener('click', () => {
    $('#fakeCallModal').classList.remove('show');
  });
});

// ---------------------------------------------------------------
// Manual SOS Button
// ---------------------------------------------------------------
$('#manualSosBtn').addEventListener('click', () => {
  startSOSCountdown('manual', 'User triggered SOS');
});

$('#resetAlertBtn').addEventListener('click', () => {
  // Reset UI to safe state
  $('#triggerStatus').textContent = 'ALL CLEAR — Monitoring Active';
  $('#triggerStatus').className = 'trigger-status green';
  autoTriggered = false;
});

// ---------------------------------------------------------------
// Periodic Tasks
// ---------------------------------------------------------------
async function analyzeLoop() {
  if (!video.srcObject) return; // camera not ready
  // Capture frame to canvas
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
  const base64 = dataUrl.split(',')[1];
  try {
    const result = await postAnalyze(base64);
    // Update posture meter
    const pInfo = levelToMeterInfo(result.posture_level);
    setMeter('postureMeter', pInfo.percent, pInfo.text, pInfo.color);
    $('#postureDesc').textContent = result.description || '';

    // Arduino meters
    const hrInfo = levelToMeterInfo(result.hr_level);
    setMeter('hrMeter', hrInfo.percent, hrInfo.text, hrInfo.color);
    const motInfo = levelToMeterInfo(result.mot_level);
    setMeter('motionMeter', motInfo.percent, motInfo.text, motInfo.color);

    // BPM / motion display
    $('#bpmDisplay').textContent = `BPM: ${result.bpm}`;
    $('#motionDisplay').textContent = `Motion: ${result.motion}`;

    // Layer count UI
    const layersActive = result.layers_triggered;
    $('#layersActive').textContent = `${layersActive}/3 LAYERS ACTIVE`;
    if (layersActive >= 2) {
      $('#layersActive').classList.add('alert');
    } else {
      $('#layersActive').classList.remove('alert');
    }

    // Trigger status UI
    if (result.auto_trigger) {
      $('#triggerStatus').textContent = '⚠ AUTO‑TRIGGER IMMINENT';
      $('#triggerStatus').className = 'trigger-status red';
      if (!autoTriggered) {
        autoTriggered = true;
        startSOSCountdown('auto', result.description || 'Distress detected');
      }
    } else {
      $('#triggerStatus').textContent = 'ALL CLEAR — Monitoring Active';
      $('#triggerStatus').className = 'trigger-status green';
      autoTriggered = false;
    }

    // Arduino connection dot
    const arduinoDot = $('#arduinoDot');
    if (result.arduino_connected) {
      arduinoDot.classList.remove('red');
      arduinoDot.classList.add('green');
    } else {
      arduinoDot.classList.remove('green');
      arduinoDot.classList.add('red');
    }
  } catch (err) {
    console.error('Analyze error:', err);
  }
}

setInterval(analyzeLoop, 3000);

async function arduinoPoll() {
  try {
    const state = await fetchArduino();
    if (!state) return;
    // Update meters if Arduino disconnected we already handle in analyzeLoop
    // but also update BPM/motion directly for quick feedback
    $('#bpmDisplay').textContent = `BPM: ${state.bpm || '—'}`;
    $('#motionDisplay').textContent = `Motion: ${state.motion || '—'}`;
    const arduinoDot = $('#arduinoDot');
    if (state.connected) {
      arduinoDot.classList.remove('red');
      arduinoDot.classList.add('green');
    } else {
      arduinoDot.classList.remove('green');
      arduinoDot.classList.add('red');
    }
  } catch (e) {
    console.warn('Arduino poll error', e);
  }
}
setInterval(arduinoPoll, 1000);

// ---------------------------------------------------------------
// Initial UI State
// ---------------------------------------------------------------
$('#triggerStatus').className = 'trigger-status green';

// End of app.js
