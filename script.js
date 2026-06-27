const API_URL = 'https://live-status.muhammedkarim.workers.dev/';
const IDLE_IFRAME_URL = 'https://wali-app.co.uk/mosque/zjm';

const KALIMAT_FOLDER = 'kalimat';
const KALIMAT_EXTENSION = 'jpg';

const STATUS_POLL_MS = 2000;
const VERSION_POLL_MS = 60000;

const DIM_ON_BLANK = true;

const idleFrame = document.getElementById('idle-frame');
const blankLayer = document.getElementById('blank-layer');
const dimOverlay = document.getElementById('dim-overlay');
const kalimatImage = document.getElementById('kalimat-image');

let currentKalimat = null;
let currentMode = null;
let currentVersion = null;

idleFrame.src = IDLE_IFRAME_URL;

function showIdleMode() {
  if (currentMode === 'idle') return;

  currentMode = 'idle';
  currentKalimat = null;

  idleFrame.style.display = 'block';
  blankLayer.style.display = 'none';
  dimOverlay.style.display = 'none';
  kalimatImage.style.display = 'none';
  kalimatImage.removeAttribute('src');
}

function showBlankLiveMode() {
  if (currentMode === 'blank') return;

  currentMode = 'blank';
  currentKalimat = null;

  idleFrame.style.display = 'none';
  blankLayer.style.display = 'block';
  dimOverlay.style.display = DIM_ON_BLANK ? 'block' : 'none';
  kalimatImage.style.display = 'none';
  kalimatImage.removeAttribute('src');
}

function showKalimatMode(kalimatName) {
  if (!kalimatName) {
    showBlankLiveMode();
    return;
  }

  if (currentMode === 'kalimat' && currentKalimat === kalimatName) {
    return;
  }

  const timestampedUrl = `${KALIMAT_FOLDER}/${encodeURIComponent(kalimatName)}.${KALIMAT_EXTENSION}?t=${Date.now()}`;
  const testImage = new Image();

  testImage.onload = () => {
    currentMode = 'kalimat';
    currentKalimat = kalimatName;

    kalimatImage.src = timestampedUrl;

    idleFrame.style.display = 'none';
    blankLayer.style.display = 'none';
    dimOverlay.style.display = 'block';
    kalimatImage.style.display = 'block';
  };

  testImage.onerror = () => {
    console.warn(`Kalimat image not found: ${timestampedUrl}`);
    showBlankLiveMode();
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

function fetchDisplayStatus() {
  fetch(`${API_URL}?t=${Date.now()}`)
    .then(res => res.json())
    .then(status => {
      if (!status.isLive) {
        showIdleMode();
        return;
      }

      const kalimatName = normaliseKalimatName(status);

      if (!kalimatName) {
        showBlankLiveMode();
        return;
      }

      showKalimatMode(kalimatName);
    })
    .catch(err => {
      console.error('Failed to fetch live status:', err);
      showIdleMode();
    });
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
    .catch(err => {
      console.warn('Failed to fetch version.json:', err);
    });
}

fetchDisplayStatus();
checkVersionAndReload();

setInterval(fetchDisplayStatus, STATUS_POLL_MS);
setInterval(checkVersionAndReload, VERSION_POLL_MS);