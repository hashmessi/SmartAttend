// ═══════════════════════════════════════════════════════════════
// SmartAttend PWA — app.js (iOS Light Theme & Secure Student Kiosk)
// Direct Submission · No Student Photo Views · Server Storage · Admin Passcode 2456
// ═══════════════════════════════════════════════════════════════

'use strict';

// ── State ─────────────────────────────────────────────────────
let students       = [];
let currentForm    = {};
let capturedPhotos = [];
let cameraStream   = null;
let facingMode     = 'user';
let animFrameId    = null;
let lastCheckTime  = 0;
let MAX_PHOTOS     = 8;
let MIN_PHOTOS     = 5;
let deleteTargetId = null;
let isBursting     = false;
let burstTimer     = null;
let isAdmin        = false;
let adminPin       = '';

// ── Face Detection State ───────────────────────────────────────
// Stores the latest quality metrics from the analysis loop
let faceMetrics = {
  facePresent:  false,
  score:        0,
  statusText:   'Align face inside oval',
  statusColor:  '#ef4444',   // red = not ready
};

// Shared off-screen canvas for pixel analysis (64×64 for speed)
const sampleCanvas = document.createElement('canvas');
sampleCanvas.width  = 64;
sampleCanvas.height = 64;
const sampleCtx    = sampleCanvas.getContext('2d', { willReadFrequently: true });

const POSE_STEPS = [
  { max: 2, badge: '1/4', text: '🎯 Look straight at camera' },
  { max: 4, badge: '2/4', text: '👈 Turn head slightly left' },
  { max: 6, badge: '3/4', text: '👉 Turn head slightly right' },
  { max: 8, badge: '4/4', text: '📐 Slight head tilt or smile' },
];

const screens = {
  form:     document.getElementById('screenForm'),
  camera:   document.getElementById('screenCamera'),
  success:  document.getElementById('screenSuccess'),
  students: document.getElementById('screenStudents'),
};

function showScreen(name) {
  if (name === 'students' && !isAdmin) {
    openAdminPinModal();
    return;
  }

  Object.entries(screens).forEach(([k, el]) => {
    if (el) el.classList.toggle('active', k === name);
  });

  window.scrollTo(0, 0);
  if (name !== 'camera') {
    stopCamera();
    stopBurstMode();
  }
}

// ── Toast Notification ────────────────────────────────────────
function toast(msg, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 250);
  }, duration);
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── FORM HANDLER ──────────────────────────────────────────────
document.getElementById('studentForm')?.addEventListener('submit', e => {
  e.preventDefault();
  if (!validateForm()) return;

  currentForm = {
    name:     document.getElementById('inputName').value.trim(),
    regNo:    document.getElementById('inputRegNo').value.trim().toUpperCase(),
    dept:     document.getElementById('inputDept').value,
    section:  document.getElementById('inputSection').value,
    year:     document.getElementById('inputYear').value,
    semester: document.getElementById('inputSemester').value,
  };

  capturedPhotos = [];
  showScreen('camera');
  startCamera();
  updateCameraUI();
});

function validateForm() {
  let ok = true;
  const rules = [
    { id: 'inputName',    err: 'errName',    msg: 'Full name is required' },
    { id: 'inputRegNo',   err: 'errRegNo',   msg: 'Register number is required' },
    { id: 'inputDept',    err: 'errDept',    msg: 'Select department' },
    { id: 'inputSection', err: 'errSection', msg: 'Select section' },
    { id: 'inputYear',    err: 'errYear',    msg: 'Select year' },
  ];
  rules.forEach(({ id, err, msg }) => {
    const el = document.getElementById(id);
    const errEl = document.getElementById(err);
    if (!el || !el.value.trim()) {
      if (el) el.classList.add('invalid');
      if (errEl) errEl.textContent = msg;
      ok = false;
    } else {
      if (el) el.classList.remove('invalid');
      if (errEl) errEl.textContent = '';
    }
  });
  return ok;
}

['inputName','inputRegNo','inputDept','inputSection','inputYear'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', () => {
    document.getElementById(id)?.classList.remove('invalid');
  });
});

// ═══════════════════════════════════════════════════════════════
// Google MediaPipe AI Vision Face Detection Engine
// ═══════════════════════════════════════════════════════════════
let mediaPipeDetector = null;
let isMediaPipeReady  = false;
let isDetecting       = false;

async function initMediaPipe() {
  if (typeof window !== 'undefined' && window.FaceDetection) {
    try {
      mediaPipeDetector = new window.FaceDetection({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`,
      });

      mediaPipeDetector.setOptions({
        model: 'short', // 'short' is ultra-fast for front/selfie cameras
        minDetectionConfidence: 0.60,
      });

      mediaPipeDetector.onResults(onMediaPipeResults);
      isMediaPipeReady = true;
      console.log('🤖 Google MediaPipe Face Detection initialized.');
    } catch (err) {
      console.warn('MediaPipe initialization fallback:', err);
    }
  }
}
initMediaPipe();

// ── Calculate Visible Viewport Crop (matching CSS object-fit: cover)
function getVideoCropRect(video) {
  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;

  const viewport = document.querySelector('.camera-viewport-frame');
  const targetRatio = (viewport && viewport.clientWidth && viewport.clientHeight)
    ? (viewport.clientWidth / viewport.clientHeight)
    : (3 / 4); // Default 3:4 portrait

  const videoRatio = vw / vh;
  let sx = 0, sy = 0, sw = vw, sh = vh;

  if (videoRatio > targetRatio) {
    // Video stream is wider than viewport -> crop left/right
    sw = vh * targetRatio;
    sh = vh;
    sx = (vw - sw) / 2;
    sy = 0;
  } else {
    // Video stream is taller than viewport -> crop top/bottom
    sw = vw;
    sh = vw / targetRatio;
    sx = 0;
    sy = (vh - sh) / 2;
  }

  return { sx, sy, sw, sh };
}

// ── CAMERA HANDLER ────────────────────────────────────────────
async function startCamera() {
  try {
    if (cameraStream) stopCamera();
    const constraints = {
      video: {
        facingMode,
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    };
    cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    const video = document.getElementById('cameraVideo');
    if (!video) return;

    video.srcObject = cameraStream;
    if (facingMode === 'user') {
      video.classList.add('mirror');
    } else {
      video.classList.remove('mirror');
    }
    await video.play();

    // Prepare canvas dimensions immediately
    const canvas = document.getElementById('cameraCanvas');
    if (canvas) {
      canvas.width  = 720;
      canvas.height = 960;
    }

    if (!isMediaPipeReady) {
      await initMediaPipe();
    }

    startQualityLoop();
  } catch (err) {
    toast('Camera access denied.', 'error');
    console.error('Camera error:', err);
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
}

document.getElementById('btnFlipCamera')?.addEventListener('click', () => {
  facingMode = facingMode === 'user' ? 'environment' : 'user';
  startCamera();
});

document.getElementById('btnBackFromCamera')?.addEventListener('click', () => {
  stopCamera();
  stopBurstMode();
  showScreen('form');
});

function startQualityLoop() {
  if (animFrameId) cancelAnimationFrame(animFrameId);
  const loop = async (timestamp) => {
    if (!cameraStream) return;
    const video = document.getElementById('cameraVideo');
    if (video && video.readyState >= 2 && !isDetecting) {
      if (timestamp - lastCheckTime > 120) { // ~8 FPS detection loop
        lastCheckTime = timestamp;
        if (isMediaPipeReady && mediaPipeDetector) {
          isDetecting = true;
          try {
            await mediaPipeDetector.send({ image: video });
          } catch (e) {
            console.warn('MediaPipe send error:', e);
          } finally {
            isDetecting = false;
          }
        } else {
          // Native/Fallback detector while MediaPipe is loading
          analyzeFallbackFrame();
        }
      }
    }
    animFrameId = requestAnimationFrame(loop);
  };
  animFrameId = requestAnimationFrame(loop);
}

// ── Google MediaPipe Face Detection Results Callback ──────────
function onMediaPipeResults(results) {
  const video = document.getElementById('cameraVideo');
  if (!video || !video.videoWidth) return;

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const viewport = document.querySelector('.camera-viewport-frame');
  const containerW = viewport?.clientWidth || 360;
  const containerH = viewport?.clientHeight || 480;

  if (!results.detections || results.detections.length === 0) {
    faceMetrics = {
      facePresent: false,
      score: 0,
      statusText: '👤 Align your face in the oval',
      statusColor: '#ef4444',
      poseOk: false
    };
    updateFaceStatusUI();
    return;
  }

  if (results.detections.length > 1) {
    faceMetrics = {
      facePresent: false,
      score: 0,
      statusText: '⚠️ 1 person only in frame',
      statusColor: '#ef4444',
      poseOk: false
    };
    updateFaceStatusUI();
    return;
  }

  const detection = results.detections[0];
  const box = detection.boundingBox; // { xCenter, yCenter, width, height } normalized
  const landmarks = detection.landmarks || [];

  // Map normalized video coords to screen viewport using object-fit: cover scale
  const scale = Math.max(containerW / vw, containerH / vh);
  const renderedW = vw * scale;
  const renderedH = vh * scale;
  const offsetX = (containerW - renderedW) / 2;
  const offsetY = (containerH - renderedH) / 2;

  // Center position of face in screen coordinates
  const screenFaceX = (box.xCenter * vw) * scale + offsetX;
  const screenFaceY = (box.yCenter * vh) * scale + offsetY;
  const screenFaceH = (box.height * vh) * scale;
  const screenFaceW = (box.width * vw) * scale;

  // Normalized relative to container (0.0 to 1.0)
  const relX = screenFaceX / containerW;
  const relY = screenFaceY / containerH;
  const relH = screenFaceH / containerH;
  const relW = screenFaceW / containerW;

  // Center oval: (0.50, 0.46) with radii (0.30, 0.31)
  const ovalDx = (relX - 0.50) / 0.30;
  const ovalDy = (relY - 0.46) / 0.31;
  const isInsideOval = (ovalDx * ovalDx + ovalDy * ovalDy) <= 1.0;
  const isGoodSize = (relH >= 0.20 && relH <= 0.80);

  // Landmark pose validation (Yaw angle estimation from eye & nose positions)
  let yawOffset = 0;
  if (landmarks.length >= 4) {
    const rightEye = landmarks[0];
    const leftEye = landmarks[1];
    const nose = landmarks[2];
    const eyeDist = Math.abs(leftEye.x - rightEye.x);
    const eyeMidX = (rightEye.x + leftEye.x) / 2;
    if (eyeDist > 0.01) {
      yawOffset = (nose.x - eyeMidX) / eyeDist;
    }
  }

  const currentCount = capturedPhotos.length;
  let poseRequired = 'straight';
  let posePrompt = '🎯 Look straight at camera';

  if (currentCount < 2) {
    poseRequired = 'straight';
    posePrompt = '🎯 Look straight at camera';
  } else if (currentCount < 4) {
    poseRequired = 'left';
    posePrompt = '👈 Turn head slightly left';
  } else if (currentCount < 6) {
    poseRequired = 'right';
    posePrompt = '👉 Turn head slightly right';
  } else {
    poseRequired = 'tilt';
    posePrompt = '📐 Slight head tilt or smile';
  }

  let isPoseSatisfied = true;
  if (poseRequired === 'straight') {
    isPoseSatisfied = Math.abs(yawOffset) < 0.22;
  } else if (poseRequired === 'left') {
    isPoseSatisfied = (facingMode === 'user') ? (yawOffset > 0.08) : (yawOffset < -0.08);
  } else if (poseRequired === 'right') {
    isPoseSatisfied = (facingMode === 'user') ? (yawOffset < -0.08) : (yawOffset > 0.08);
  }

  let statusText = '✅ Face detected — ready!';
  let statusColor = '#10b981';
  let facePresent = false;

  if (!isInsideOval) {
    statusText = '👤 Center your face in the oval';
    statusColor = '#ef4444';
  } else if (!isGoodSize && relH < 0.20) {
    statusText = '📏 Move closer to camera';
    statusColor = '#f59e0b';
  } else if (!isGoodSize && relH > 0.80) {
    statusText = '📏 Move a bit back';
    statusColor = '#f59e0b';
  } else if (!isPoseSatisfied) {
    statusText = posePrompt;
    statusColor = '#f59e0b';
  } else {
    facePresent = true;
    statusText = '✅ Aligned! Hold still';
    statusColor = '#10b981';
  }

  faceMetrics = {
    facePresent,
    score: facePresent ? 5 : 2,
    statusText,
    statusColor,
    poseOk: isPoseSatisfied
  };

  updateFaceStatusUI();
}

// ── Fallback Analysis (used only if MediaPipe CDN is loading) ─
function analyzeFallbackFrame() {
  const video = document.getElementById('cameraVideo');
  if (!video || !video.srcObject || video.readyState < 2) return;
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return;

  const crop = getVideoCropRect(video);
  sampleCtx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, 64, 64);
  const frame = sampleCtx.getImageData(0, 0, 64, 64).data;

  let totalPx = 64 * 64;
  let rSum = 0, gSum = 0, bSum = 0, rSqSum = 0;
  let skinCountCenter = 0, centerPxCount = 0;

  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const idx = (y * 64 + x) * 4;
      const r = frame[idx], g = frame[idx + 1], b = frame[idx + 2];
      rSum += r; gSum += g; bSum += b;
      rSqSum += r * r;

      const Y  = 0.299 * r + 0.587 * g + 0.114 * b;
      const Cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const Cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

      const isSkin = (Cb >= 77 && Cb <= 130) && (Cr >= 133 && Cr <= 178) && (Y >= 40 && Y <= 230) && (r > g && r > b);
      const dx = (x - 32) / 18, dy = (y - 32) / 22;
      if ((dx * dx + dy * dy) <= 1.0) {
        centerPxCount++;
        if (isSkin) skinCountCenter++;
      }
    }
  }

  const brightness = (rSum + gSum + bSum) / (3 * totalPx);
  const variance   = (rSqSum / totalPx) - Math.pow(rSum / totalPx, 2);
  const skinRatio  = skinCountCenter / (centerPxCount || 1);

  const brightOk  = brightness >= 45 && brightness <= 235;
  const blurOk    = variance > 120;
  const skinOk    = skinRatio >= 0.18;

  let statusText = '👤 Align face in oval';
  let statusColor = '#ef4444';
  let facePresent = false;

  if (!brightOk && brightness < 45) {
    statusText  = '🌑 Too dark — face light source';
    statusColor = '#f59e0b';
  } else if (!blurOk) {
    statusText  = '🌀 Hold phone steady';
    statusColor = '#f59e0b';
  } else if (skinOk) {
    facePresent = true;
    statusText  = '✅ Face detected — ready!';
    statusColor = '#10b981';
  }

  faceMetrics = { facePresent, score: facePresent ? 4 : 1, statusText, statusColor };
  updateFaceStatusUI();
}

function updateFaceStatusUI() {
  const el = document.getElementById('faceStatusLabel');
  if (el) {
    el.textContent = faceMetrics.statusText;
    el.style.color = faceMetrics.statusColor;
  }

  // Update SVG oval guide color
  const ellipse = document.getElementById('guideEllipse') || document.querySelector('.guide-svg ellipse');
  if (ellipse) {
    ellipse.setAttribute(
      'stroke',
      faceMetrics.facePresent
        ? 'rgba(16,185,129,0.95)'  // Vibrant Green
        : 'rgba(239,68,68,0.85)'   // Red when misaligned
    );
  }
}

// ── Gate: returns true only when face is strictly validated ──
function validateFacePresent() {
  if (!faceMetrics.facePresent) {
    toast(faceMetrics.statusText, 'warn', 2200);
    return false;
  }
  return true;
}

// ── PHOTO CAPTURE & SUBMISSION (WYSIWYG Centered Capture) ─────
document.getElementById('btnCapture')?.addEventListener('click', () => capturePhoto(false));

function capturePhoto(bypassCheck = false) {
  if (capturedPhotos.length >= MAX_PHOTOS) {
    stopBurstMode();
    return;
  }

  // Enforce Face Alignment Gate
  if (!bypassCheck && !validateFacePresent()) return;

  const video  = document.getElementById('cameraVideo');
  const canvas = document.getElementById('cameraCanvas');
  if (!video || !canvas || !video.videoWidth || !video.videoHeight) return;

  const ctx = canvas.getContext('2d');
  const crop = getVideoCropRect(video);

  // Exact 3:4 High-Resolution Output (720x960)
  canvas.width  = 720;
  canvas.height = 960;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw exactly what the student sees inside the viewport oval
  if (facingMode === 'user') {
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  } else {
    ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
  }

  // Draw Registration Number Watermark
  ctx.save();
  ctx.font = 'bold 42px "SF Pro Display", Inter, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.fillText(currentForm.regNo || 'Unknown', canvas.width - 24, canvas.height - 24);
  ctx.restore();

  const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
  capturedPhotos.push(dataUrl);

  const flash = document.getElementById('shutterFlash');
  if (flash) {
    flash.classList.add('active');
    setTimeout(() => flash.classList.remove('active'), 120);
  }

  updateCameraUI();

  if (capturedPhotos.length >= MAX_PHOTOS) {
    stopBurstMode();
    toast('All metrics captured! Submitting to database...', 'success');
    setTimeout(() => submitStudentDataset(), 500);
  }
}

document.getElementById('btnBurst')?.addEventListener('click', toggleBurstMode);

function toggleBurstMode() {
  if (isBursting) {
    stopBurstMode();
  } else {
    if (capturedPhotos.length >= MAX_PHOTOS) return;
    isBursting = true;
    const btn = document.getElementById('btnBurst');
    if (btn) btn.classList.add('active');
    toast('⚡ Smart Auto: Face must stay aligned in oval', 'info', 2500);

    // Smart burst: only captures when face metrics are actively green
    burstTimer = setInterval(async () => {
      if (capturedPhotos.length >= MAX_PHOTOS) {
        stopBurstMode();
        return;
      }
      await analyzeFaceFrame();
      if (faceMetrics.facePresent) {
        capturePhoto(true);
      }
    }, 1300);
  }
}

function stopBurstMode() {
  isBursting = false;
  if (burstTimer) {
    clearInterval(burstTimer);
    burstTimer = null;
  }
  document.getElementById('btnBurst')?.classList.remove('active');
}

document.getElementById('btnDeleteLast')?.addEventListener('click', () => {
  if (capturedPhotos.length === 0) return;
  capturedPhotos.pop();
  updateCameraUI();
});

function updateCameraUI() {
  const count = capturedPhotos.length;
  const pct   = (count / MAX_PHOTOS) * 100;

  const cntEl = document.getElementById('photoCount');
  if (cntEl) cntEl.textContent = count;

  const fillEl = document.getElementById('progressBarFill');
  if (fillEl) fillEl.style.width = pct + '%';

  let currentStep = POSE_STEPS[0];
  for (const step of POSE_STEPS) {
    if (count < step.max) {
      currentStep = step;
      break;
    }
  }
  if (count >= MAX_PHOTOS) {
    currentStep = { badge: '✓', text: 'All 8 metrics captured!' };
  }

  const badgeEl = document.getElementById('poseStepBadge');
  if (badgeEl) badgeEl.textContent = currentStep.badge;
  const textEl = document.getElementById('poseStepText');
  if (textEl) textEl.textContent = currentStep.text;

  const submitBtn = document.getElementById('btnSubmitMetrics');
  if (submitBtn) {
    submitBtn.disabled = count < MIN_PHOTOS;
    if (count >= MIN_PHOTOS) {
      submitBtn.textContent = `Submit Face Metrics (${count}/8)`;
    } else {
      submitBtn.textContent = `Capture ${MIN_PHOTOS - count} more metrics`;
    }
  }

  const nameEl = document.getElementById('camStudentName');
  if (nameEl) nameEl.textContent = currentForm.name || 'Student Registration';
  const metaEl = document.getElementById('camStudentMeta');
  if (metaEl) metaEl.textContent = `${currentForm.dept || ''}-${currentForm.section || ''} · ${currentForm.regNo || ''}`;
}

document.getElementById('btnSubmitMetrics')?.addEventListener('click', () => {
  if (capturedPhotos.length < MIN_PHOTOS) return;
  stopBurstMode();
  submitStudentDataset();
});

// ── DIRECT SERVER SUBMISSION (No photo previews for students) ──
async function submitStudentDataset() {
  const payload = {
    name:     currentForm.name,
    regNo:    currentForm.regNo,
    dept:     currentForm.dept,
    section:  currentForm.section,
    year:     currentForm.year,
    semester: currentForm.semester,
    photos:   [...capturedPhotos],
  };

  const btn = document.getElementById('btnSubmitMetrics');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Submitting to Database…';
  }

  try {
    const resp = await fetch('/api/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const resData = await resp.json();

    if (resp.ok && resData.success) {
      const studentSummary = { ...currentForm };
      capturedPhotos = []; // WIPE memory photos immediately for student privacy
      showSuccessScreen(studentSummary);
    } else {
      toast(resData.error || 'Database submission failed.', 'error');
    }
  } catch (err) {
    console.error('Submission error:', err);
    toast('Server connection failed.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Submit Face Metrics';
    }
  }
}

// ── THANK YOU COMPLETION SCREEN ───────────────────────────────
function showSuccessScreen(student) {
  const sumName  = document.getElementById('sumName');
  const sumRegNo = document.getElementById('sumRegNo');
  const sumDept  = document.getElementById('sumDept');

  if (sumName)  sumName.textContent  = student.name;
  if (sumRegNo) sumRegNo.textContent = student.regNo;
  if (sumDept)  sumDept.textContent  = `${student.dept}-${student.section}`;

  showScreen('success');
}

// Reset for next student enrollment
document.getElementById('btnDoneNext')?.addEventListener('click', () => {
  capturedPhotos = [];
  document.getElementById('studentForm')?.reset();
  showScreen('form');
  document.getElementById('inputName')?.focus();
});

// ── STAFF ADMIN PORTAL & PASSCODE 2456 ────────────────────────
document.getElementById('btnAdminPortal')?.addEventListener('click', () => {
  if (isAdmin) {
    renderStudentsList();
    showScreen('students');
  } else {
    openAdminPinModal();
  }
});

function openAdminPinModal() {
  const modal = document.getElementById('adminPinModal');
  const pinInput = document.getElementById('inputAdminPin');
  const errEl = document.getElementById('errAdminPin');
  if (pinInput) pinInput.value = '';
  if (errEl) errEl.textContent = '';
  if (modal) modal.style.display = 'flex';
  setTimeout(() => pinInput?.focus(), 100);
}

document.getElementById('btnClosePinModal')?.addEventListener('click', closeAdminPinModal);
document.getElementById('btnCancelPin')?.addEventListener('click', closeAdminPinModal);

function closeAdminPinModal() {
  const modal = document.getElementById('adminPinModal');
  if (modal) modal.style.display = 'none';
}

document.getElementById('adminPinForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const pinInput = document.getElementById('inputAdminPin')?.value.trim();
  const errEl = document.getElementById('errAdminPin');

  if (!pinInput) {
    if (errEl) errEl.textContent = 'Enter passcode';
    return;
  }

  try {
    const resp = await fetch('/api/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pinInput }),
    });

    const data = await resp.json();

    if (resp.ok && data.success) {
      isAdmin = true;
      adminPin = pinInput;
      closeAdminPinModal();

      const btn = document.getElementById('btnAdminPortal');
      if (btn) {
        btn.classList.add('unlocked');
        document.getElementById('adminLockText').textContent = 'Staff Portal ✓';
      }

      toast('Staff passcode verified!');
      renderStudentsList();
      showScreen('students');
    } else {
      if (errEl) errEl.textContent = data.error || 'Incorrect Passcode';
    }
  } catch (err) {
    if (pinInput === '2456') {
      isAdmin = true;
      adminPin = '2456';
      closeAdminPinModal();

      const btn = document.getElementById('btnAdminPortal');
      if (btn) {
        btn.classList.add('unlocked');
        document.getElementById('adminLockText').textContent = 'Staff Portal ✓';
      }

      toast('Staff passcode verified!');
      renderStudentsList();
      showScreen('students');
    } else {
      if (errEl) errEl.textContent = 'Incorrect Passcode';
    }
  }
});

// ── STAFF ADMIN STUDENTS LIST ──────────────────────────────────
document.getElementById('btnBackFromStudents')?.addEventListener('click', () => showScreen('form'));

async function renderStudentsList() {
  if (!isAdmin) return;

  try {
    const resp = await fetch('/api/admin/students', {
      headers: { 'x-admin-pin': adminPin },
    });
    if (resp.ok) {
      const data = await resp.json();
      students = data.students || [];
    }
  } catch (err) {
    console.warn('Could not fetch server students list:', err);
  }

  const search     = document.getElementById('searchInput')?.value.toLowerCase() || '';
  const deptFilter = document.getElementById('filterDept')?.value || '';
  const list       = document.getElementById('studentsList');
  const emptyEl    = document.getElementById('studentsEmpty');

  const filtered = students.filter(s => {
    const matchSearch = !search ||
      s.name.toLowerCase().includes(search) ||
      s.regNo.toLowerCase().includes(search);
    const matchDept = !deptFilter || s.dept === deptFilter;
    return matchSearch && matchDept;
  });

  if (!list) return;

  if (filtered.length === 0) {
    list.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
  } else {
    if (emptyEl) emptyEl.style.display = 'none';
    list.innerHTML = filtered.map(s => `
      <div class="student-ios-card">
        <div class="stu-info">
          <div class="stu-name">${escHtml(s.name)}</div>
          <div class="stu-meta">${escHtml(s.regNo)} · Year ${escHtml(s.year)}</div>
          <span class="stu-badge">${escHtml(s.dept)}-${escHtml(s.section)} · 📸 ${s.photoCount || 8} photos</span>
        </div>
        <button class="btn-del-icon" data-id="${s.id}" title="Delete dataset">🗑️</button>
      </div>
    `).join('');

    list.querySelectorAll('.btn-del-icon').forEach(btn => {
      btn.addEventListener('click', e => {
        deleteTargetId = e.currentTarget.dataset.id;
        const s = students.find(x => x.id === deleteTargetId);
        const modalTxt = document.getElementById('deleteModalText');
        if (modalTxt) modalTxt.textContent = `Delete dataset for "${s?.name}" (${s?.regNo})?`;
        const modal = document.getElementById('deleteModal');
        if (modal) modal.style.display = 'flex';
      });
    });
  }
}

document.getElementById('searchInput')?.addEventListener('input', renderStudentsList);
document.getElementById('filterDept')?.addEventListener('change', renderStudentsList);

document.getElementById('btnCancelDelete')?.addEventListener('click', () => {
  const modal = document.getElementById('deleteModal');
  if (modal) modal.style.display = 'none';
  deleteTargetId = null;
});

document.getElementById('btnConfirmDelete')?.addEventListener('click', async () => {
  if (!deleteTargetId || !isAdmin) return;
  try {
    const resp = await fetch(`/api/admin/students/${deleteTargetId}`, {
      method: 'DELETE',
      headers: { 'x-admin-pin': adminPin },
    });
    if (resp.ok) {
      students = students.filter(s => s.id !== deleteTargetId);
      renderStudentsList();
      const modal = document.getElementById('deleteModal');
      if (modal) modal.style.display = 'none';
      toast('Student dataset deleted.', 'success');
    }
  } catch (err) {
    toast('Delete failed.', 'error');
  }
  deleteTargetId = null;
});

// ── EXPORT DATASET ZIP (ADMIN ONLY) ────────────────────────────
document.getElementById('btnExportFromList')?.addEventListener('click', async () => {
  if (!isAdmin) return;
  toast('Generating Dataset ZIP...');

  try {
    const resp = await fetch(`/api/admin/export?pin=${encodeURIComponent(adminPin)}`);
    if (!resp.ok) throw new Error('Export failed');

    const blob = await resp.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const ts   = new Date().toISOString().slice(0, 10);
    a.href     = url;
    a.download = `SmartAttend_Dataset_${ts}.zip`;
    a.click();
    URL.revokeObjectURL(url);

    toast('Dataset ZIP downloaded!');
  } catch (err) {
    toast('Export failed.', 'error');
    console.error(err);
  }
});

// ── INIT ──────────────────────────────────────────────────────
showScreen('form');
console.log('SmartAttend iOS Light PWA active.');
