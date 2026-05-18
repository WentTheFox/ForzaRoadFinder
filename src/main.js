import { marked } from 'marked';
import readmeText from 'bundle-text:../README.md';
import previewUrl from 'url:../preview.png';

// Info modal
const infoBtn     = document.getElementById('infoBtn');
const infoOverlay = document.getElementById('info-overlay');
const infoClose   = document.getElementById('info-close');
const infoContent = document.getElementById('info-content');

let readmeHtml = null;

function loadReadme() {
  const text = readmeText.replace('https://raw.githubusercontent.com/WentTheFox/ForzaRoadFinder/main/preview.png', previewUrl);
  readmeHtml = marked.parse(text);
  infoContent.innerHTML = readmeHtml;
}

infoBtn.addEventListener('click', () => {
  infoOverlay.classList.add('open');
  if (!readmeHtml) loadReadme();
});

infoClose.addEventListener('click', () => infoOverlay.classList.remove('open'));

infoOverlay.addEventListener('click', e => {
  if (e.target === infoOverlay) infoOverlay.classList.remove('open');
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') infoOverlay.classList.remove('open');
});

const canvas      = document.getElementById('canvas');
const ctx         = canvas.getContext('2d', { willReadFrequently: true });
const startBtn    = document.getElementById('startBtn');
const pauseBtn    = document.getElementById('pauseBtn');
const stopBtn     = document.getElementById('stopBtn');
const saveBtn     = document.getElementById('saveBtn');
const scaleBtn    = document.getElementById('scaleBtn');
const canvasWrap  = document.getElementById('canvas-wrap');
const fpsRange    = document.getElementById('fps');
const fpsNum      = document.getElementById('fpsNum');
const tolRange    = document.getElementById('tolerance');
const tolNum      = document.getElementById('tolNum');
const colorTarget  = document.getElementById('colorTarget');
const colorReplace = document.getElementById('colorReplace');
const greyscaleCb  = document.getElementById('greyscale');
const statusEl     = document.getElementById('status');
const placeholder  = document.getElementById('placeholder');
const placeholderHint = document.getElementById('placeholder-hint');

// Keep range and number inputs in sync
function syncPair(range, num) {
  range.addEventListener('input', () => { num.value = range.value; });
  num.addEventListener('input', () => {
    const v = Math.min(+num.max, Math.max(+num.min, +num.value));
    range.value = v;
    num.value = v;
  });
}
syncPair(fpsRange, fpsNum);
syncPair(tolRange, tolNum);

let stream  = null;
let video   = null;
let timer   = null;
let running = false;
let paused  = false;

// Uint32 layout (little-endian ImageData): R | G<<8 | B<<16 | A<<24
let targetRgb  = [0, 0, 0];
let replaceRgb = [0, 0, 0];
let targetU32  = 0;
let replaceU32 = 0;

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xFF, (n >> 8) & 0xFF, n & 0xFF];
}

function rgbToU32(r, g, b) {
  return (r | (g << 8) | (b << 16) | (0xFF << 24)) | 0;
}

function updateColors() {
  targetRgb  = hexToRgb(colorTarget.value);
  replaceRgb = hexToRgb(colorReplace.value);
  targetU32  = rgbToU32(...targetRgb);
  replaceU32 = rgbToU32(...replaceRgb);
  placeholderHint.textContent = `Undiscovered roads (${colorTarget.value.toUpperCase()}) will be highlighted in ${colorReplace.value.toUpperCase()}.`;
}

colorTarget.addEventListener('input', updateColors);
colorReplace.addEventListener('input', updateColors);
updateColors();

startBtn.addEventListener('click', async () => {
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 5, width: { ideal: 2560 }, height: { ideal: 1440 } },
      audio: false,
    });
    video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();

    // Wait for actual dimensions
    if (!video.videoWidth) {
      await new Promise(res => video.addEventListener('loadedmetadata', res, { once: true }));
    }

    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.style.display = 'block';
    placeholder.style.display = 'none';

    stream.getVideoTracks()[0].addEventListener('ended', stopCapture);

    running = true;
    paused  = false;
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    stopBtn.disabled  = false;
    processFrame();
  } catch (e) {
    statusEl.textContent = 'Error: ' + (e.message || e);
  }
});

scaleBtn.addEventListener('click', () => {
  const full = canvasWrap.classList.toggle('full-scale');
  scaleBtn.textContent = full ? 'Fit to Window' : '100% Scale';
});

saveBtn.addEventListener('click', () => {
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `forza-roads-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
});

pauseBtn.addEventListener('click', () => {
  if (!running) return;
  paused = !paused;
  pauseBtn.textContent = paused ? 'Resume' : 'Pause';
  if (!paused) processFrame();
  else { clearTimeout(timer); statusEl.textContent = 'Paused'; }
});

stopBtn.addEventListener('click', stopCapture);

function stopCapture() {
  running = false;
  paused  = false;
  clearTimeout(timer);
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  video = null;
  startBtn.disabled = false;
  pauseBtn.disabled = true;
  pauseBtn.textContent = 'Pause';
  stopBtn.disabled  = true;
  saveBtn.disabled  = true;
  statusEl.textContent = 'Stopped';
}

function processFrame() {
  if (!running || paused) return;

  const t0 = performance.now();
  const W  = canvas.width;
  const H  = canvas.height;

  ctx.drawImage(video, 0, 0, W, H);

  const imageData = ctx.getImageData(0, 0, W, H);
  const data      = imageData.data;
  const tol       = parseInt(tolRange.value, 10);

  const grey = greyscaleCb.checked;

  if (tol === 0 && !grey) {
    // Fast exact-match path via 32-bit view (no greyscale needed)
    const buf32 = new Uint32Array(data.buffer);
    const len = buf32.length;
    for (let i = 0; i < len; i++) {
      if (buf32[i] === targetU32) buf32[i] = replaceU32;
    }
  } else {
    const [tr, tg, tb] = targetRgb;
    const [rr, rg, rb] = replaceRgb;
    const len = data.length;
    for (let i = 0; i < len; i += 4) {
      if (Math.abs(data[i]   - tr) <= tol &&
          Math.abs(data[i+1] - tg) <= tol &&
          Math.abs(data[i+2] - tb) <= tol) {
        data[i]   = rr;
        data[i+1] = rg;
        data[i+2] = rb;
      } else if (grey) {
        const l = (0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2]) | 0;
        data[i] = data[i+1] = data[i+2] = l;
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  saveBtn.disabled = false;

  const elapsed = performance.now() - t0;
  const fps = parseFloat(fpsRange.value);
  statusEl.textContent = `${W}×${H} — frame ${elapsed.toFixed(0)} ms — next in ${(1000/fps).toFixed(0)} ms`;

  timer = setTimeout(processFrame, 1000 / fps);
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(new URL('./sw.js', import.meta.url));
}
