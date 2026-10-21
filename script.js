const API_URL = 'https://live-status.muhammedkarim.workers.dev/';
const DZP_API_URL = 'https://sufi.org.uk/live-dzp';

const IDLE_IFRAME_URL = 'https://wali-app.co.uk/mosque/zjm';

const KALIMAT_FOLDER = 'kalimat';
const KALIMAT_EXTENSION = 'jpg';

const LIVE_CHECK_MS = 5000;
const KALIMAT_POLL_MS = 1000;
const DZP_POLL_MS = 60000;
const VERSION_POLL_MS = 60000;

const PRE_EVENING_BLANK_MINUTES = 20;

const DIM_ON_BLANK = true;

const DIM_ON_PRE_EVENING_BLANK = false;

const idleFrame = document.getElementById('idle-frame');
const blankLayer = document.getElementById('blank-layer');
const dimOverlay = document.getElementById('dim-overlay');
const kalimatImage = document.getElementById('kalimat-image');

let currentKalimat = null;
let currentMode = null;
let currentVersion = null;
let dzpSchedule = null;
let kalimatInterval = null;

const LIVE_STATUS_URL = API_URL;
let liveStatusRequest = null;
let liveStatusCheckInProgress = false;
let kalimatRequestInProgress = false;
let consecutiveOfflineResponses = 0;
let kalimatGeneration = 0;
let kalimatImageRequestId = 0;
let pendingKalimat = null;

async function getValidLiveStatus() {
  // Both pollers share an in-flight request; failures never become offline signals.
  if (liveStatusRequest) return liveStatusRequest;
  liveStatusRequest = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(LIVE_STATUS_URL, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Live-status HTTP ' + response.status);
      const status = await response.json();
      if (!status || typeof status.isLive !== 'boolean' ||
          (status.isLive && (typeof status.kalimat !== 'string' || !status.kalimat.trim()))) {
        throw new Error('Invalid live-status response');
      }
      return status;
    } finally {
      clearTimeout(timeout);
    }
  })();
  try {
    return await liveStatusRequest;
  } finally {
    liveStatusRequest = null;
  }
}

idleFrame.src = IDLE_IFRAME_URL;

function showIdleMode() {
  kalimatImageRequestId++;
  pendingKalimat = null;
  if (currentMode === 'idle') return;

  currentMode = 'idle';
  currentKalimat = null;

  idleFrame.style.display = 'block';
  blankLayer.style.display = 'none';
  dimOverlay.style.display = 'none';
  kalimatImage.style.display = 'none';
  kalimatImage.removeAttribute('src');
}

function showBlankMode(modeName, showDim) {
  kalimatImageRequestId++;
  pendingKalimat = null;
  if (currentMode === modeName) return;

  currentMode = modeName;
  currentKalimat = null;

  idleFrame.style.display = 'none';
  blankLayer.style.display = 'block';
  dimOverlay.style.display = showDim ? 'block' : 'none';
  kalimatImage.style.display = 'none';
  kalimatImage.removeAttribute('src');
}

function showBlankLiveMode() {
  showBlankMode('blank-live', DIM_ON_BLANK);
}

function showPreEveningBlankMode() {
  showBlankMode('pre-evening-blank', DIM_ON_PRE_EVENING_BLANK);
}

function showKalimatMode(kalimatName) {
  if (!kalimatName) {
    showBlankLiveMode();
    return;
  }

  if (pendingKalimat === kalimatName) return;
  const generation = kalimatGeneration;
  const imageRequestId = ++kalimatImageRequestId;
  if (currentMode === 'kalimat' && currentKalimat === kalimatName) {
    pendingKalimat = null;
    return;
  }

  const timestampedUrl = `${KALIMAT_FOLDER}/${encodeURIComponent(kalimatName)}.${KALIMAT_EXTENSION}?t=${Date.now()}`;
  pendingKalimat = kalimatName;
  const testImage = new Image();

  testImage.onload = () => {
    if (!kalimatInterval || generation !== kalimatGeneration || imageRequestId !== kalimatImageRequestId) return;
    pendingKalimat = null;
    currentMode = 'kalimat';
    currentKalimat = kalimatName;

    kalimatImage.src = timestampedUrl;

    idleFrame.style.display = 'none';
    blankLayer.style.display = 'none';
    kalimatImage.style.display = 'block';
    dimOverlay.style.display = 'block';
  };

  testImage.onerror = () => {
    if (imageRequestId === kalimatImageRequestId) pendingKalimat = null;
    console.warn(`Kalimat image not found: ${timestampedUrl}`);
    // Retain the last valid display when an image is missing.
  };

  testImage.src = timestampedUrl;
}

function normaliseKalimatName(status) {
  if (!status || !status.isLive) return null;

  const kalimat = String(status.kalimat || '').trim();

  if (!kalimat) return null;
  if (kalimat.toLowerCase() === 'blank') return null;

  return kalimat;
}

function handleLiveStatus(status) {
  // Blank after dua explicitly returns to the embedded prayer timetable.
  if (status.kalimat.toLowerCase() === 'blank' && (currentKalimat === 'Dua' || currentKalimat === '')) {
    showIdleMode();
    currentKalimat = '';
    return;
  }
  const kalimatName = normaliseKalimatName(status);
  if (!kalimatName) {
    showBlankLiveMode();
    return;
  }
  showKalimatMode(kalimatName);
}

async function checkLiveStatus() {
  if (liveStatusCheckInProgress) return;
  liveStatusCheckInProgress = true;
  try {
    const status = await getValidLiveStatus();
    if (status.isLive) consecutiveOfflineResponses = 0;
    else if (++consecutiveOfflineResponses < 2) return;
    if (status.isLive) startKalimatPolling(status);
    else {
      stopKalimatPolling();
      updateNonLiveDisplay();
    }
  } catch (err) {
    console.error('Failed to fetch live status; keeping existing display:', err);
  } finally {
    liveStatusCheckInProgress = false;
  }
}

function startKalimatPolling(initialStatus) {
  if (!kalimatInterval) kalimatInterval = setInterval(fetchKalimatStatus, KALIMAT_POLL_MS);
  if (initialStatus) handleLiveStatus(initialStatus);
  else fetchKalimatStatus();
}

function stopKalimatPolling() {
  if (!kalimatInterval) return;
  clearInterval(kalimatInterval);
  kalimatInterval = null;
  kalimatGeneration++;
  kalimatImageRequestId++;
  pendingKalimat = null;
  currentKalimat = null;
}

async function fetchKalimatStatus() {
  if (!kalimatInterval || kalimatRequestInProgress) return;
  kalimatRequestInProgress = true;
  const generation = kalimatGeneration;
  try {
    const status = await getValidLiveStatus();
    if (!kalimatInterval || generation !== kalimatGeneration || !status.isLive) return;
    handleLiveStatus(status);
  } catch (err) {
    console.error('Failed to fetch Kalimat; keeping existing display:', err);
  } finally {
    kalimatRequestInProgress = false;
  }
}

function fetchDzpSchedule() {
  fetch(`${DZP_API_URL}?t=${Date.now()}`)
    .then(res => res.json())
    .then(data => {
      dzpSchedule = data;
      updateNonLiveDisplay();
    })
    .catch (err => {
      console.warn('Failed to fetch DZP schedule:', err);
      dzpSchedule = null;
    });
}

function timeStringToTodayDate(timeString) {
  if (!timeString) return null;

  const parts = String(timeString).split(':');
  if (parts.length !== 2) return null;

  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  const date = new Date();
  date.setHours(hours, minutes, 0, 0);

  return date;
}

function shouldShowPreEveningBlank() {
  if (!dzpSchedule || !dzpSchedule.today || !dzpSchedule.today.evening) {
    return false;
  }

  const eveningTime = timeStringToTodayDate(dzpSchedule.today.evening);
  if (!eveningTime) return false;

  const now = new Date();

  const blankStartTime = new Date(
    eveningTime.getTime() - PRE_EVENING_BLANK_MINUTES * 60 * 1000
  );

  return now >= blankStartTime && now < eveningTime;
}

function updateNonLiveDisplay() {
  if (kalimatInterval) return;

  if (shouldShowPreEveningBlank()) {
    showPreEveningBlankMode();
  } else {
    showIdleMode();
  }
}

function checkVersionAndReload() {
  fetch(`version.json?t=${Date.now()}`)
    .then(res => res.json())
    .then(data => {
      if (currentVersion && data.version !== currentVersion) {
        location.reload(true);
      }

      currentVersion = data.version;
    })
    .catch (err => {
      console.warn('Failed to fetch version.json:', err);
    });
}

fetchDzpSchedule();
checkLiveStatus();
checkVersionAndReload();

setInterval(checkLiveStatus, LIVE_CHECK_MS);
setInterval(fetchDzpSchedule, DZP_POLL_MS);
setInterval(checkVersionAndReload, VERSION_POLL_MS);