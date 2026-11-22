/**
 * Hand Gesture Radar & Vision Controller
 * Uses MediaPipe Hands to track 21 3D hand landmarks in real-time,
 * draws a futuristic cybernetic skeleton, and maps gestures to Ultron commands.
 */

const videoEl = document.getElementById('webcam-video');
const canvasEl = document.getElementById('gesture-canvas');
const ctx = canvasEl.getContext('2d');
const gestureBadge = document.getElementById('gesture-detected-badge');
const gestureIconEl = document.getElementById('gesture-icon');
const gestureNameEl = document.getElementById('gesture-name');
const gestureDescEl = document.getElementById('gesture-desc');
const ringFill = document.getElementById('gesture-ring-fill');
const camToggleBtn = document.getElementById('cam-toggle-btn');
const camStateLabel = document.getElementById('cam-state-label');
const camDot = document.getElementById('camera-status-dot');
const camOffOverlay = document.getElementById('camera-off-overlay');
const startCamBtn = document.getElementById('start-cam-btn');

let cameraActive = true;
let cameraStream = null;
let mpHands = null;
let mpCamera = null;

// Gesture State Tracking
let currentGesture = null;
let gestureHoldStartTime = 0;
let lastGestureTriggerTime = 0;
const GESTURE_HOLD_MS = 380;     // Must hold gesture for 380ms to confirm
const GESTURE_COOLDOWN_MS = 1400; // 1.4s cooldown between triggers

// Swipe tracking
let wristHistory = [];

const GESTURE_META = {
  palm: { name: 'OPEN PALM', desc: 'HALT / STOP / MUTE', icon: '✋' },
  fist: { name: 'FIST', desc: 'HIDE HUD TO BACKGROUND', icon: '✊' },
  point: { name: 'POINTING UP', desc: 'LISTEN NOW (MIC)', icon: '☝️' },
  peace: { name: 'PEACE SIGN (V)', desc: 'SWITCH TO VISION', icon: '✌️' },
  thumbs_up: { name: 'THUMBS UP', desc: 'AVENGERS ASSEMBLE', icon: '👍' },
  swipe_left: { name: 'SWIPE LEFT', desc: 'PREVIOUS TRACK', icon: '👈' },
  swipe_right: { name: 'SWIPE RIGHT', desc: 'NEXT TRACK', icon: '👉' },
};

// Hand joint connections for drawing cybernetic skeleton
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],       // Index
  [0, 9], [9, 10], [10, 11], [11, 12],  // Middle
  [0, 13], [13, 14], [14, 15], [15, 16],// Ring
  [0, 17], [17, 18], [18, 19], [19, 20],// Pinky
  [5, 9], [9, 13], [13, 17],            // Palm knuckle bar
];

async function initGestureCamera() {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 480 }, height: { ideal: 360 }, facingMode: 'user' },
    });
    videoEl.srcObject = cameraStream;

    await new Promise((resolve) => {
      videoEl.onloadedmetadata = () => {
        canvasEl.width = videoEl.videoWidth || 480;
        canvasEl.height = videoEl.videoHeight || 360;
        resolve();
      };
    });

    if (window.Hands) {
      mpHands = new window.Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      });

      mpHands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.5,
      });

      mpHands.onResults(onHandResults);

      if (window.Camera) {
        mpCamera = new window.Camera(videoEl, {
          onFrame: async () => {
            if (cameraActive) {
              await mpHands.send({ image: videoEl });
            }
          },
          width: 480,
          height: 360,
        });
        mpCamera.start();
      }
    }
  } catch (err) {
    console.warn('Camera access denied or unavailable:', err.message);
    setCameraUI(false);
  }
}

function onHandResults(results) {
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    hideGestureBadge();
    return;
  }

  const landmarks = results.multiHandLandmarks[0];

  // 1. Draw Holographic Cybernetic Skeleton
  drawCyberneticSkeleton(landmarks);

  // 2. Classify Gesture
  const detected = classifyHandGesture(landmarks);

  // 3. Handle Hold-to-Confirm Animation & Execution
  handleGestureHold(detected);
}

function drawCyberneticSkeleton(lm) {
  const w = canvasEl.width;
  const h = canvasEl.height;

  // Draw connecting cyber-lines
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.7)';
  ctx.shadowColor = '#00f0ff';
  ctx.shadowBlur = 8;

  for (const [p1, p2] of HAND_CONNECTIONS) {
    ctx.beginPath();
    ctx.moveTo(lm[p1].x * w, lm[p1].y * h);
    ctx.lineTo(lm[p2].x * w, lm[p2].y * h);
    ctx.stroke();
  }

  // Draw glowing joint points
  for (let i = 0; i < lm.length; i++) {
    const x = lm[i].x * w;
    const y = lm[i].y * h;
    const isTip = [4, 8, 12, 16, 20].includes(i);

    ctx.beginPath();
    ctx.arc(x, y, isTip ? 5 : 3, 0, 2 * Math.PI);
    ctx.fillStyle = isTip ? '#00ff88' : '#00f0ff';
    ctx.shadowBlur = isTip ? 12 : 6;
    ctx.shadowColor = ctx.fillStyle;
    ctx.fill();
  }
}

function classifyHandGesture(lm) {
  // Distance helper
  const dist = (i1, i2) => {
    const dx = lm[i1].x - lm[i2].x;
    const dy = lm[i1].y - lm[i2].y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Check finger extension (tip higher than PIP joint in normalized canvas coords where y=0 is top)
  const isIndexExt = lm[8].y < lm[6].y;
  const isMiddleExt = lm[12].y < lm[10].y;
  const isRingExt = lm[16].y < lm[14].y;
  const isPinkyExt = lm[20].y < lm[18].y;
  const isThumbExt = dist(4, 9) > dist(2, 9) * 1.15;

  const wrist = lm[0];
  const now = Date.now();

  // Track wrist horizontal velocity for Swipe gesture
  wristHistory.push({ x: wrist.x, time: now });
  wristHistory = wristHistory.filter((item) => now - item.time < 350);

  if (wristHistory.length >= 4) {
    const dx = wristHistory[wristHistory.length - 1].x - wristHistory[0].x;
    if (dx > 0.28) {
      wristHistory = [];
      return 'swipe_left'; // mirrored in camera view
    }
    if (dx < -0.28) {
      wristHistory = [];
      return 'swipe_right';
    }
  }

  // 1. Open Palm (Halt / Stop / Mute)
  if (isIndexExt && isMiddleExt && isRingExt && isPinkyExt && isThumbExt) {
    return 'palm';
  }

  // 2. Fist (Minimize HUD / Background)
  if (!isIndexExt && !isMiddleExt && !isRingExt && !isPinkyExt && !isThumbExt) {
    return 'fist';
  }

  // 3. Pointing Up (Trigger Mic / Voice)
  if (isIndexExt && !isMiddleExt && !isRingExt && !isPinkyExt) {
    return 'point';
  }

  // 4. Peace Sign (V for Vision / Code Mode)
  if (isIndexExt && isMiddleExt && !isRingExt && !isPinkyExt) {
    return 'peace';
  }

  // 5. Thumbs Up (Assemble Team Roll Call)
  if (!isIndexExt && !isMiddleExt && !isRingExt && !isPinkyExt && lm[4].y < lm[3].y && lm[3].y < lm[2].y) {
    return 'thumbs_up';
  }

  return null;
}

function handleGestureHold(gesture) {
  const now = Date.now();

  // If in cooldown after recently triggering a gesture, ignore
  if (now - lastGestureTriggerTime < GESTURE_COOLDOWN_MS) {
    return;
  }

  if (!gesture) {
    hideGestureBadge();
    currentGesture = null;
    gestureHoldStartTime = 0;
    return;
  }

  // Highlight matching legend item in UI
  document.querySelectorAll('.legend-item').forEach((item) => {
    item.classList.toggle('highlight', item.getAttribute('data-gesture') === gesture);
  });

  if (gesture !== currentGesture) {
    currentGesture = gesture;
    gestureHoldStartTime = now;
    showGestureBadge(gesture);
  }

  const elapsed = now - gestureHoldStartTime;
  const progress = Math.min(1.0, elapsed / GESTURE_HOLD_MS);

  // Animate SVG Radial Fill (circumference = 2 * PI * 18 = ~113.1)
  const maxDash = 113.1;
  const offset = maxDash - progress * maxDash;
  ringFill.style.strokeDashoffset = offset;

  // Once held stable for full duration, trigger action!
  if (progress >= 1.0) {
    triggerGestureAction(gesture);
  }
}

function showGestureBadge(gesture) {
  const meta = GESTURE_META[gesture] || { name: gesture.toUpperCase(), desc: 'COMMAND', icon: '✨' };
  gestureIconEl.textContent = meta.icon;
  gestureNameEl.textContent = meta.name;
  gestureDescEl.textContent = meta.desc;
  gestureBadge.classList.remove('hidden');
}

function hideGestureBadge() {
  gestureBadge.classList.add('hidden');
  document.querySelectorAll('.legend-item').forEach((i) => i.classList.remove('highlight'));
}

function triggerGestureAction(gesture) {
  lastGestureTriggerTime = Date.now();
  currentGesture = null;
  gestureHoldStartTime = 0;

  // Visual pulse confirmation
  gestureBadge.style.boxShadow = '0 0 35px var(--neon-green)';
  setTimeout(() => {
    gestureBadge.style.boxShadow = '';
    hideGestureBadge();
  }, 400);

  // Send action to local Ultron server
  fetch('/api/gesture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gesture }),
  }).catch((err) => {
    console.warn('Gesture API error:', err);
  });
}

// Camera Toggle Controls
camToggleBtn.addEventListener('click', toggleCamera);
startCamBtn?.addEventListener('click', toggleCamera);

function toggleCamera() {
  cameraActive = !cameraActive;
  setCameraUI(cameraActive);

  if (cameraActive) {
    if (!cameraStream) initGestureCamera();
  } else {
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    hideGestureBadge();
  }
}

function setCameraUI(active) {
  camStateLabel.textContent = active ? 'ON' : 'OFF';
  camDot.textContent = active ? 'ACTIVE' : 'PAUSED';
  camDot.className = active ? 'status-indicator live' : 'status-indicator';
  camOffOverlay.classList.toggle('hidden', active);
}

// Start
initGestureCamera();
