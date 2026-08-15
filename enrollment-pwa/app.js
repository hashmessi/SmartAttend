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

// ── CAMERA HANDLER ────────────────────────────────────────────
async function startCamera() {
  try {
    if (cameraStream) stopCamera();
    const constraints = {
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
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

    const canvas = document.getElementById('cameraCanvas');
    video.addEventListener('loadedmetadata', () => {
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
    }, { once: true });

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
  const loop = (timestamp) => {
    if (!cameraStream) return;
    // Run analysis ~6× per second (every ~167ms) — fast enough for live feedback
    if (timestamp - lastCheckTime > 167) {
      lastCheckTime = timestamp;
      analyzeFaceFrame();
    }
    animFrameId = requestAnimationFrame(loop);
  };
  animFrameId = requestAnimationFrame(loop);
}

// ── Pixel-level face presence analysis ────────────────────────
//  Runs every ~167ms. Updates global `faceMetrics` and the UI overlay.
//  Heuristics used (no ML, pure pixel math):
//   1. Brightness — reject too dark / blown-out frames
//   2. Skin-tone pixel ratio — detect human face-like hue/saturation in HSV
//   3. Center-weight  — skin pixels must be concentrated in the oval zone
//   4. Blur estimate  — pixel variance; very low variance = blurry / blank wall
function analyzeFaceFrame() {
  const video = document.getElementById('cameraVideo');
  if (!video || !video.srcObject || video.readyState < 2) return;
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return;

  // ── 1. Sample the full frame at 64×64 ─────────────────────
  sampleCtx.drawImage(video, 0, 0, vw, vh, 0, 0, 64, 64);
  const full = sampleCtx.getImageData(0, 0, 64, 64).data;

  // ── 2. Sample the CENTRE oval zone at 64×64 ───────────────
  //    Oval covers roughly the centre 40% width × 60% height of the frame
  const cx = vw * 0.30, cy = vh * 0.15, cw = vw * 0.40, ch = vh * 0.70;
  sampleCtx.drawImage(video, cx, cy, cw, ch, 0, 0, 64, 64);
  const centre = sampleCtx.getImageData(0, 0, 64, 64).data;

  let totalPx = 64 * 64;

  // ── Compute per-channel sums & variance (blur proxy) ──────
  let rSum = 0, gSum = 0, bSum = 0;
  let rSqSum = 0;
  for (let i = 0; i < full.length; i += 4) {
    const r = full[i], g = full[i+1], b = full[i+2];
    rSum   += r;  gSum   += g;  bSum   += b;
    rSqSum += r * r;
  }
  const rMean      = rSum / totalPx;
  const brightness = (rSum + gSum + bSum) / (3 * totalPx); // 0-255
  const variance   = (rSqSum / totalPx) - (rMean * rMean); // blur proxy

  // ── Count skin-tone pixels in centre zone ─────────────────
  //  Skin heuristic (works for all skin tones, including dark skin):
  //    R > 60, G > 40, B > 20
  //    R > G and R > B
  //    |R-G| > 10  (not grey/white/ceiling)
  //    max(R,G,B) - min(R,G,B) > 15  (some chrominance — not blank wall)
  let skinCount = 0;
  for (let i = 0; i < centre.length; i += 4) {
    const r = centre[i], g = centre[i+1], b = centre[i+2];
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    if (
      r > 60 && g > 40 && b > 20 &&
      r > g  && r > b  &&
      Math.abs(r - g) > 10 &&
      (maxC - minC) > 15
    ) {
      skinCount++;
    }
  }
  const skinRatio = skinCount / totalPx; // 0-1

  // ── Scoring ───────────────────────────────────────────────
  // We want: brightness 60-230, variance > 200, skinRatio > 0.12
  const brightOk  = brightness >= 55 && brightness <= 235;
  const blurOk    = variance   > 200;
  const skinOk    = skinRatio  >= 0.12;

  let score = 0;
  if (brightOk) score += 1;
  if (blurOk)   score += 1;
  if (skinOk)   score += 2;   // skin is the strongest signal

  const facePresent = score >= 3; // need brightness + blur + skin

  // ── Build human-readable status ───────────────────────────
  let statusText, statusColor;
  if (!brightOk && brightness < 55) {
    statusText  = '🌑 Too dark — find better lighting';
    statusColor = '#f59e0b';
  } else if (!brightOk && brightness > 235) {
    statusText  = '☀️ Too bright / overexposed';
    statusColor = '#f59e0b';
  } else if (!blurOk) {
    statusText  = '🌀 Hold camera steady';
    statusColor = '#f59e0b';
  } else if (!skinOk) {
    statusText  = '👤 Align your face inside the oval';
    statusColor = '#ef4444';
  } else {
    statusText  = '✅ Face detected — ready!';
    statusColor = '#10b981';
  }

  faceMetrics = { facePresent, score, statusText, statusColor };
  updateFaceStatusUI();
}

function updateFaceStatusUI() {
  const el = document.getElementById('faceStatusLabel');
  if (!el) return;
  el.textContent   = faceMetrics.statusText;
  el.style.color   = faceMetrics.statusColor;

  // Also colour the oval guide border
  const ellipse = document.querySelector('.guide-svg ellipse');
  if (ellipse) {
    ellipse.setAttribute(
      'stroke',
      faceMetrics.facePresent
        ? 'rgba(16,185,129,0.95)'   // green when face detected
        : 'rgba(255,255,255,0.75)'  // white otherwise
    );
  }
}

// ── Gate: returns true only when frame is acceptable to capture ─
function validateFacePresent() {
  if (!faceMetrics.facePresent) {
    toast(faceMetrics.statusText, 'warn', 2000);
    return false;
  }
  return true;
}

// ── PHOTO CAPTURE & SUBMISSION ────────────────────────────────
document.getElementById('btnCapture')?.addEventListener('click', capturePhoto);

function capturePhoto(bypassCheck = false) {
  if (capturedPhotos.length >= MAX_PHOTOS) {
    stopBurstMode();
    return;
  }

  // ── Face-presence gate ────────────────────────────────────
  // Allow bypass=true only from burst's confirmed-green path
  if (!bypassCheck && !validateFacePresent()) return;

  const video  = document.getElementById('cameraVideo');
  const canvas = document.getElementById('cameraCanvas');
  const ctx    = canvas.getContext('2d');

  if (!video || !video.videoWidth) return;

  if (facingMode === 'user') {
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    ctx.restore();
  } else {
    ctx.drawImage(video, 0, 0);
  }

  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  capturedPhotos.push(dataUrl);

  const flash = document.getElementById('shutterFlash');
  if (flash) {
    flash.classList.add('active');
    setTimeout(() => flash.classList.remove('active'), 100);
  }

  updateCameraUI();

  if (capturedPhotos.length >= MAX_PHOTOS) {
    stopBurstMode();
    toast('Metrics complete! Submitting dataset...', 'success');
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
    toast('⚡ Auto-capture: face must be in oval to shoot', 'info', 2500);

    // Smart burst: only capture when face is present
    burstTimer = setInterval(() => {
      if (capturedPhotos.length >= MAX_PHOTOS) {
        stopBurstMode();
        return;
      }
      // Re-run analysis right before each burst shot to get latest frame data
      analyzeFaceFrame();
      if (faceMetrics.facePresent) {
        capturePhoto(true); // bypass redundant check — we just validated
      }
      // If face not present, silently skip this tick (no toast spam)
    }, 1200);
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
