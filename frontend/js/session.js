/* ═══════════════════════════════════════════════════
   Neck GT Controller — Session Logic
   ควบคุม flow ของ session ทั้งหมด
   ═══════════════════════════════════════════════════ */

'use strict';

// ── DOM Helper ────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Session State ─────────────────────────────────────
const S = {
  phase: 'setup',       // 'setup' | 'running' | 'trans' | 'paused' | 'done'
  sess: { id: '', sc: 'SC-01', split: 'train', pid: 'P00', rater: '' },
  stream:    null,
  recChunks: [], recorder: null, recBytes: 0,
  t0:        null,      // session start time (performance.now())
  pausedMs:  0,         // ms สะสมที่ pause ไว้
  pauseT:    null,      // เวลาที่กด pause ล่าสุด
  stepIdx:   -1,
  stepT:     null,      // เวลาเริ่ม step ปัจจุบัน
  stepDur:   0,         // ms ของ step ปัจจุบัน
  pending:   null,      // { act, onsetMs, step } รอ finalize
  transMs:   3000,      // ms ของ countdown ระหว่าง step
  transIv:   null,
  soundMode: 'all',
  gtLog:     [],        // ผลลัพธ์ที่บันทึกได้
  rafId:     null,
  timer:     null,
};

// ── Ring constants ────────────────────────────────────
const RING_R = 68;
const RING_C = 2 * Math.PI * RING_R; // circumference ≈ 427

// ── Utility ───────────────────────────────────────────
function nowMs() {
  if (!S.t0) return 0;
  let t = performance.now() - S.t0 - S.pausedMs;
  if (S.phase === 'paused') t -= (performance.now() - S.pauseT);
  return Math.max(0, t);
}

function fmtMs(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}.${Math.floor(ms % 1000).toString().padStart(3, '0')}`;
}

function fmtSec(s) {
  return s >= 10 ? s.toFixed(0) + 's' : s.toFixed(1) + 's';
}

// ── Setup: populate SC dropdown & preview ─────────────
function initSetup() {
  const sel = $('inp-sc');
  Object.entries(SC).forEach(([id, sc]) => {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = `${id} — ${sc.nameTH}`;
    sel.appendChild(o);
  });
  sel.addEventListener('change', renderSCPreview);
  renderSCPreview();

  // Sound radio buttons
  document.querySelectorAll('#sound-opts .sound-opt').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('#sound-opts .sound-opt').forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
    });
  });

  // Show iPad warning if file:// or iOS
  if (location.protocol === 'file:' || /iPad|iPhone|iPod/.test(navigator.userAgent)) {
    $('ipad-warn').style.display = 'block';
  }
}

function renderSCPreview() {
  const id = $('inp-sc').value;
  const sc = SC[id];
  if (!sc) return;
  const totalSec = Math.round(sc.steps.reduce((a, s) => a + s.ms, 0) / 1000);
  const m = Math.floor(totalSec / 60), s = totalSec % 60;
  const acts = [...new Set(sc.steps.map(s => s.act))];
  const chips = acts.map(a => {
    const ac = ACT[a] || { color: '#888', label: a };
    return `<span class="sc-act-chip" style="color:${ac.color};border-color:${ac.color}">${ac.label}</span>`;
  }).join('');
  $('sc-preview').innerHTML = `
    <div class="sc-name">${id} — ${sc.nameTH}</div>
    <div>${sc.desc}</div>
    <div style="margin-top:4px;font-size:11px;color:var(--tx3);font-family:var(--mono)">${sc.steps.length} steps · ${m > 0 ? m + 'm ' : ''}${s}s</div>
    <div class="sc-acts">${chips}</div>`;
  $('sc-preview').classList.add('active');
}

// ── Camera + Session Start ─────────────────────────────
async function handleStart() {
  ensureAudio();
  S.sess.id    = $('inp-sess').value.trim()  || `sess_${Date.now()}`;
  S.sess.sc    = $('inp-sc').value;
  S.sess.split = $('inp-split').value;
  S.sess.pid   = $('inp-pid').value.trim()   || 'P00';
  S.sess.rater = $('inp-rater').value.trim() || 'unknown';
  S.soundMode  = document.querySelector('#sound-opts input:checked')?.value || 'all';

  if (location.protocol === 'file:') {
    alert('⚠️ iPad/Safari ต้องการ HTTPS หรือ localhost\n\nวิธีแก้:\n1. รัน python -m http.server 8000 บนเครื่อง\n2. เปิด http://[IP เครื่อง]:8000/index.html บน iPad\nเช่น http://192.168.1.5:8000/index.html');
    return;
  }

  try {
    S.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
  } catch {
    try {
      S.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch (e2) {
      alert('❌ ไม่สามารถเปิดกล้องได้\n\n' + e2.message + '\n\nตรวจสอบ:\n- อนุญาตกล้องใน Settings\n- ใช้ HTTPS หรือ localhost\n- Safari: Settings > Safari > Camera > Allow');
      return;
    }
  }

  $('cam-feed').srcObject  = S.stream;
  $('cam-small').srcObject = S.stream;
  $('setup').style.display = 'none';
  doCountdown();
}

// ── Countdown 3..2..1 ────────────────────────────────
function doCountdown() {
  $('cdown').style.display = 'flex';
  let n = 3;
  $('cdown-n').textContent = n;
  beepTick(S.soundMode);
  const iv = setInterval(() => {
    n--;
    if (n <= 0) { clearInterval(iv); $('cdown').style.display = 'none'; startSession(); }
    else { $('cdown-n').textContent = n; beepTick(S.soundMode); }
  }, 1000);
}

// ── Session Start ─────────────────────────────────────
function startSession() {
  S.phase = 'running'; S.t0 = performance.now();
  S.pausedMs = 0; S.stepIdx = -1; S.gtLog = [];
  S.transMs  = parseInt($('inp-trans').value) || 0;
  S.recChunks = []; S.recBytes = 0;
  $('rec-lbl').textContent = 'REC 0.0 MB';

  // MediaRecorder
  try {
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm';
    S.recorder = new MediaRecorder(S.stream, { mimeType: mime, videoBitsPerSecond: 800000 });
    S.recorder.ondataavailable = e => {
      if (e.data && e.data.size > 0) {
        S.recChunks.push(e.data);
        S.recBytes += e.data.size;
        $('rec-lbl').textContent = `REC ${(S.recBytes / 1048576).toFixed(1)} MB`;
      }
    };
    S.recorder.start(1000);
  } catch (err) { console.warn('MediaRecorder unavailable:', err); S.recorder = null; }

  $('sess').style.display  = 'flex';
  $('h-sess').textContent  = S.sess.id;
  $('h-sc').textContent    = S.sess.sc;
  $('btn-pause').disabled  = false;
  $('btn-skip').disabled   = false;
  $('btn-stop').disabled   = false;
  $('btn-exp').disabled    = true;
  $('btn-exp-xl').disabled = true;

  renderLog();
  nextStep();
  rafLoop();
}

// ── Step Engine ───────────────────────────────────────
function nextStep() {
  const steps = SC[S.sess.sc].steps;
  if (S.stepIdx >= 0) finalizeStep();
  S.stepIdx++;
  if (S.stepIdx >= steps.length) { endSession(); return; }
  if (S.stepIdx > 0 && S.transMs > 0) showTransition(() => doStep());
  else doStep();
}

function showTransition(cb) {
  const step  = SC[S.sess.sc].steps[S.stepIdx];
  const a     = ACT[step.act] || { color: '#8B949E', label: '—' };
  const badge = $('prep-next-badge');
  badge.textContent = a.label;
  badge.style.color = badge.style.borderColor = a.color;
  $('prep-next-th').textContent   = step.th;
  $('prep-next-note').textContent = step.note;
  let n = Math.ceil(S.transMs / 1000);
  $('prep-n').textContent = n;
  $('prep-overlay').classList.add('show');
  S.phase = 'trans';
  beepTick(S.soundMode);
  clearInterval(S.transIv);
  S.transIv = setInterval(() => {
    n--;
    if (n <= 0) {
      clearInterval(S.transIv); S.transIv = null;
      $('prep-overlay').classList.remove('show');
      S.phase = 'running'; cb();
    } else { $('prep-n').textContent = n; beepTick(S.soundMode); }
  }, 1000);
}

function doStep() {
  const steps = SC[S.sess.sc].steps;
  const step  = steps[S.stepIdx];
  const a     = ACT[step.act] || { color: '#8B949E', label: 'ACT', nameTH: '' };
  S.stepT = performance.now(); S.stepDur = step.ms;
  S.pending = { act: step.act, onsetMs: nowMs(), step };

  // Update instruction UI
  const ib = $('i-badge');
  ib.textContent = a.label;
  ib.style.color = ib.style.borderColor = a.color;
  $('i-name').textContent = a.nameTH;
  $('i-name').style.color = a.color;
  $('i-th').textContent   = step.th;
  $('i-note').textContent = step.note;
  $('ring-arc').style.stroke = a.color;
  $('ring-num').style.color  = a.color;

  // Next step preview
  const nxt = steps[S.stepIdx + 1];
  if (nxt) {
    const na = ACT[nxt.act] || { color: '#8B949E', label: '—' };
    const nb = $('i-next-badge');
    nb.textContent = na.label;
    nb.style.color = nb.style.borderColor = na.color;
    $('i-next-th').textContent   = nxt.th;
    $('i-next-note').textContent = nxt.note;
  } else {
    $('i-next-badge').textContent           = '—';
    $('i-next-badge').style.color           = 'var(--tx3)';
    $('i-next-badge').style.borderColor     = 'var(--bdr)';
    $('i-next-th').textContent              = 'ขั้นตอนสุดท้าย';
    $('i-next-note').textContent            = '';
  }

  $('h-steps').textContent        = `${S.stepIdx + 1}/${steps.length}`;
  $('bar-fill').style.width       = `${(S.stepIdx / steps.length) * 100}%`;

  if (S.soundMode === 'all') beepStart(S.soundMode);

  // Schedule ding
  clearTimeout(S.timer);
  const warn3 = step.ms - 3000;
  if (warn3 > 500) setTimeout(() => { if (S.phase === 'running') beepWarn(S.soundMode); }, warn3);
  S.timer = setTimeout(() => { beepDing(S.soundMode); nextStep(); }, step.ms);
}

function finalizeStep() {
  if (!S.pending) return;
  const offMs = nowMs();
  const { act, onsetMs, step } = S.pending;
  S.gtLog.push({ act, onsetMs: Math.round(onsetMs), offsetMs: Math.round(offMs), durationMs: Math.round(offMs - onsetMs), th: step.th });
  S.pending = null;
  renderLog();
}

// ── RAF Loop (ring timer + clock) ─────────────────────
function rafLoop() {
  cancelAnimationFrame(S.rafId);
  function frame() {
    if (S.phase === 'trans') {
      $('h-clock').textContent = fmtMs(nowMs());
      $('ring-arc').style.strokeDashoffset = RING_C;
      $('ring-num').textContent = '—';
      S.rafId = requestAnimationFrame(frame);
      return;
    }
    if (S.phase !== 'running') return;
    $('h-clock').textContent = fmtMs(nowMs());
    const elapsed = performance.now() - S.stepT;
    const frac    = Math.min(1, elapsed / S.stepDur);
    $('ring-arc').style.strokeDashoffset = RING_C * frac;
    const remSec  = Math.max(0, (S.stepDur - elapsed) / 1000);
    $('ring-num').textContent = fmtSec(remSec);
    S.rafId = requestAnimationFrame(frame);
  }
  S.rafId = requestAnimationFrame(frame);
}

// ── Controls ──────────────────────────────────────────
function handlePause() {
  if (S.phase === 'running') {
    S.phase = 'paused'; S.pauseT = performance.now();
    clearTimeout(S.timer); cancelAnimationFrame(S.rafId);
    $('btn-pause').textContent = '▶ ดำเนินต่อ';
    $('btn-pause').className   = 'btn-ctrl play';
    $('rec-lbl').textContent   = 'PAUSED';
  } else if (S.phase === 'paused') {
    const d = performance.now() - S.pauseT;
    S.pausedMs += d; S.stepT += d; S.phase = 'running';
    $('btn-pause').textContent = '⏸ หยุดชั่วคราว';
    $('btn-pause').className   = 'btn-ctrl pause';
    $('rec-lbl').textContent   = 'LIVE';
    const rem = Math.max(0, S.stepDur - (performance.now() - S.stepT));
    S.timer = setTimeout(() => { beepDing(S.soundMode); nextStep(); }, rem);
    rafLoop();
  }
}

function handleSkip() {
  if (S.phase !== 'running' && S.phase !== 'paused') return;
  clearTimeout(S.timer);
  if (S.phase === 'paused') {
    const d = performance.now() - S.pauseT;
    S.pausedMs += d; S.stepT += d; S.phase = 'running';
    $('btn-pause').textContent = '⏸ หยุดชั่วคราว';
    $('btn-pause').className   = 'btn-ctrl pause';
    $('rec-lbl').textContent   = 'LIVE';
  }
  nextStep(); rafLoop();
}

function handleStop() {
  if (!confirm('สิ้นสุด session ก่อนครบทุกขั้นตอน?')) return;
  clearTimeout(S.timer);
  if (S.phase === 'paused') S.pausedMs += performance.now() - S.pauseT;
  finalizeStep(); endSession();
}

function handleAbort() {
  if (!confirm('ยกเลิก session ทั้งหมด (ข้อมูลทั้งหมดจะหาย)?')) return;
  clearTimeout(S.timer); cancelAnimationFrame(S.rafId);
  if (S.recorder && S.recorder.state !== 'inactive') { S.recorder.onstop = null; S.recorder.stop(); }
  S.recorder = null; S.recChunks = [];
  clearInterval(S.transIv); S.transIv = null;
  $('prep-overlay').classList.remove('show');
  if (S.stream) S.stream.getTracks().forEach(t => t.stop());
  S.stream = null; S.phase = 'setup';
  $('sess').style.display  = 'none';
  $('setup').style.display = 'flex';
}

// ── End Session ───────────────────────────────────────async function endSession() {
  S.phase = 'done';
  cancelAnimationFrame(S.rafId);
  // ...โค้ดเดิม...

  // ── Auto-save ไป Backend ทันที ──
  try {
    const payload = buildPayload(S.gtLog, {
      id:    S.sess.id,
      sc:    S.sess.sc || S.curSC,
      split: S.sess.split,
      pid:   S.sess.pid,
      rater: S.sess.rater,
      note:  S.sess.note || '',
    });
    const result = await apiSaveSession(payload);
    if ($('done-txt'))
      $('done-txt').textContent += `\n✅ บันทึกลง Server แล้ว`;
  } catch (e) {
    if ($('done-txt'))
      $('done-txt').textContent += `\n⚠️ บันทึก Server ไม่สำเร็จ — ใช้ปุ่ม CSV แทน`;
  }
}
  if (S.recorder && S.recorder.state !== 'inactive') {
    S.recorder.onstop = () => {
      if (!S.recChunks.length) return;
      const blob = new Blob(S.recChunks, { type: 'video/webm' });
      triggerDownload(blob, `vid_${S.sess.id}.webm`);
      $('rec-lbl').textContent = `VID ${(S.recBytes / 1048576).toFixed(1)} MB ↓`;
    };
    S.recorder.stop();
  }
  $('done').style.display = 'flex';
}

// ── Log Drawer ────────────────────────────────────────
function renderLog() {
  if (!S.gtLog.length) {
    $('log-body').innerHTML = '<div style="color:var(--tx3);font-size:11px;text-align:center;padding:16px">ยังไม่มีข้อมูล</div>';
    $('log-footer').textContent = '0 steps';
    return;
  }
  const rows = [...S.gtLog].reverse().map(e => {
    const c = (ACT[e.act] || { color: '#ccc' }).color;
    return `<div class="log-row">
      <span class="log-act" style="color:${c}">${e.act}</span>
      <span class="log-time">${fmtMs(e.onsetMs)}</span>
      <span class="log-dur">${(e.durationMs / 1000).toFixed(1)}s</span>
    </div>`;
  }).join('');
  $('log-body').innerHTML = rows;
  $('log-footer').textContent = `${S.gtLog.length} steps`;
}

function handleNewSession() {
  $('done').style.display = 'none';
  $('sess').style.display = 'none';
  if (S.stream) S.stream.getTracks().forEach(t => t.stop());
  S.stream = null; S.recorder = null; S.recChunks = [];
  S.phase  = 'setup';
  $('setup').style.display = 'flex';
}
