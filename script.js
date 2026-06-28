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

function showBlankMode(modeName, showDim) {
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
    kalimatImage.style.display = 'block';
    dimOverlay.style.display = 'block';
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

function handleLiveStatus(status) {
  if (!status || !status.isLive) {
    stopKalimatPolling();
    updateNonLiveDisplay();
    return;
  }

  const kalimatName = normaliseKalimatName(status);

  if (!kalimatName) {
    showBlankLiveMode();
    return;
  }

  showKalimatMode(kalimatName);
}

function checkLiveStatus() {
  fetch(`${API_URL}?t=${Date.now()}`)
    .then(res => res.json())
    .then(status => {
      if (status.isLive) {
        startKalimatPolling(status);
      } else {
        stopKalimatPolling();
        updateNonLiveDisplay();
      }
    })
    .catch(err => {
      console.error('Failed to fetch live status:', err);
      stopKalimatPolling();
      updateNonLiveDisplay();
    });
}

function startKalimatPolling(initialStatus) {
  if (initialStatus) {
    handleLiveStatus(initialStatus);
  } else {
    fetchKalimatStatus();
  }

  if (!kalimatInterval) {
    kalimatInterval = setInterval(fetchKalimatStatus, KALIMAT_POLL_MS);
  }
}

function stopKalimatPolling() {
  if (kalimatInterval) {
    clearInterval(kalimatInterval);
    kalimatInterval = null;
  }

  currentKalimat = null;
}

function fetchKalimatStatus() {
  fetch(`${API_URL}?t=${Date.now()}`)
    .then(res => res.json())
    .then(status => {
      handleLiveStatus(status);
    })
    .catch(err => {
      console.error('Failed to fetch Kalimat status:', err);
    });
}

function fetchDzpSchedule() {
  fetch(`${DZP_API_URL}?t=${Date.now()}`)
    .then(res => res.json())
    .then(data => {
      dzpSchedule = data;
      updateNonLiveDisplay();
    })
    .catch(err => {
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
    .catch(err => {
      console.warn('Failed to fetch version.json:', err);
    });
}

fetchDzpSchedule();
checkLiveStatus();
checkVersionAndReload();

setInterval(checkLiveStatus, LIVE_CHECK_MS);
setInterval(fetchDzpSchedule, DZP_POLL_MS);
setInterval(checkVersionAndReload, VERSION_POLL_MS);