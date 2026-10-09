/* ═══════════════════════════════════════════════════
   Neck GT Controller — Session Logic
   โหมด Full Run: รัน SC ทุกตัวต่อกันในครั้งเดียว
   ═══════════════════════════════════════════════════ */

'use strict';

const $ = id => document.getElementById(id);

// ── State ─────────────────────────────────────────────
const S = {
  phase:    'setup',   // 'setup'|'running'|'trans'|'sc-trans'|'paused'|'done'
  sess:     { id: '', split: 'train', pid: 'P00', rater: '', note: '' },

  // Full-run playlist
  scList:   [],        // ['SC-01','SC-02',...] ลำดับ SC ทั้งหมด
  scIdx:    0,         // SC ปัจจุบัน index ใน scList
  get curSC() { return this.scList[this.scIdx]; },

  stream:    null,
  recChunks: [], recorder: null, recBytes: 0,
  t0:        null,
  pausedMs:  0, pauseT: null,
  stepIdx:   -1,
  stepT:     null, stepDur: 0,
  pending:   null,
  transMs:   3000,
  transIv:   null,
  soundMode: 'all',
  gtLog:     [],
  rafId:     null,
  timer:     null,
};

const RING_R = 68;
const RING_C = 2 * Math.PI * RING_R;

// ── Utility ───────────────────────────────────────────
function nowMs() {
  if (!S.t0) return 0;
  let t = performance.now() - S.t0 - S.pausedMs;
  if (S.phase === 'paused') t -= (performance.now() - S.pauseT);
  return Math.max(0, t);
}
function fmtMs(ms) {
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2,'0')}.${Math.floor(ms%1000).toString().padStart(3,'0')}`;
}
function fmtSec(s) { return s >= 10 ? s.toFixed(0)+'s' : s.toFixed(1)+'s'; }

function totalStepsAll() {
  return S.scList.reduce((a, id) => a + (SC[id]?.steps.length || 0), 0);
}
function stepsCompletedBefore(scIdx) {
  return S.scList.slice(0, scIdx).reduce((a, id) => a + (SC[id]?.steps.length || 0), 0);
}

// ── Setup ─────────────────────────────────────────────
function initSetup() {
  // Preview ของ Full Run
  const totalSec = Object.values(SC).reduce((a, sc) =>
    a + sc.steps.reduce((b, s) => b + s.ms, 0), 0) / 1000;
  const m = Math.floor(totalSec / 60), s = Math.round(totalSec % 60);
  if ($('sc-preview')) {
    $('sc-preview').innerHTML = `
      <div class="sc-name">Full Run — SC-01 ถึง SC-RELAX ทั้งหมด</div>
      <div>รัน ${Object.keys(SC).length} scenarios ต่อกันในครั้งเดียว มีแจ้งเตือนเมื่อเปลี่ยน SC</div>
      <div style="margin-top:4px;font-size:11px;color:var(--tx3);font-family:var(--mono)">
        ${Object.keys(SC).length} SC · รวม ~${m}m ${s}s
      </div>`;
    $('sc-preview').classList.add('active');
  }

  document.querySelectorAll('#sound-opts .sound-opt').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('#sound-opts .sound-opt').forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
    });
  });

  if (location.protocol === 'file:' || /iPad|iPhone|iPod/.test(navigator.userAgent)) {
    if ($('ipad-warn')) $('ipad-warn').style.display = 'block';
  }
}

// ── Camera + Start ────────────────────────────────────
async function handleStart() {
  ensureAudio();
  S.sess.id    = ($('inp-sess')?.value.trim())  || `sess_${Date.now()}`;
  S.sess.split = $('inp-split')?.value          || 'train';
  S.sess.pid   = ($('inp-pid')?.value.trim())   || 'P00';
  S.sess.rater = ($('inp-rater')?.value.trim()) || 'unknown';
  S.sess.note  = ($('inp-note')?.value.trim())  || '';
  S.soundMode  = document.querySelector('#sound-opts input:checked')?.value || 'all';

  if (location.protocol === 'file:') {
    alert('⚠️ iPad/Safari ต้องการ HTTPS หรือ localhost');
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
      alert('❌ เปิดกล้องไม่ได้\n' + e2.message);
      return;
    }
  }

  if ($('cam-feed'))  $('cam-feed').srcObject  = S.stream;
  if ($('cam-small')) $('cam-small').srcObject = S.stream;
  if ($('setup'))     $('setup').style.display = 'none';
  doCountdown();
}

// ── Countdown 3..2..1 ─────────────────────────────────
function doCountdown() {
  if ($('cdown')) $('cdown').style.display = 'flex';
  let n = 3;
  if ($('cdown-n')) $('cdown-n').textContent = n;
  beepTick(S.soundMode);
  const iv = setInterval(() => {
    n--;
    if (n <= 0) {
      clearInterval(iv);
      if ($('cdown')) $('cdown').style.display = 'none';
      startSession();
    } else {
      if ($('cdown-n')) $('cdown-n').textContent = n;
      beepTick(S.soundMode);
    }
  }, 1000);
}

// ── Session Start ─────────────────────────────────────
function startSession() {
  S.phase     = 'running';
  S.t0        = performance.now();
  S.pausedMs  = 0;
  // บันทึกเวลาเริ่มจริงๆ
  S._startTime = new Date().toLocaleString('th-TH', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: 'Asia/Bangkok'
  });
  S.stepIdx   = -1;
  S.gtLog     = [];
  S.scIdx     = 0;
  S.scList    = Object.keys(SC);   // SC ทุกตัวตามลำดับใน scenarios.js
  S.transMs   = parseInt($('inp-trans')?.value) || 3000;
  S.recChunks = []; S.recBytes = 0;
  if ($('rec-lbl')) $('rec-lbl').textContent = 'REC 0.0 MB';

  // MediaRecorder
  try {
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm';
    S.recorder = new MediaRecorder(S.stream, { mimeType: mime, videoBitsPerSecond: 800000 });
    S.recorder.ondataavailable = e => {
      if (e.data?.size > 0) {
        S.recChunks.push(e.data);
        S.recBytes += e.data.size;
        if ($('rec-lbl')) $('rec-lbl').textContent = `REC ${(S.recBytes/1048576).toFixed(1)} MB`;
      }
    };
    S.recorder.start(1000);
  } catch (err) { console.warn('MediaRecorder unavailable:', err); S.recorder = null; }

  if ($('sess'))        $('sess').style.display  = 'flex';
  if ($('h-sess'))      $('h-sess').textContent  = S.sess.id;
  if ($('h-sc'))        $('h-sc').textContent    = S.curSC;
  if ($('btn-pause'))   $('btn-pause').disabled  = false;
  if ($('btn-skip'))    $('btn-skip').disabled   = false;
  if ($('btn-stop'))    $('btn-stop').disabled   = false;
  if ($('btn-exp'))     $('btn-exp').disabled    = true;
  if ($('btn-exp-xl'))  $('btn-exp-xl').disabled = true;

  renderLog();
  nextStep();
  rafLoop();
}

// ── Step Engine ───────────────────────────────────────
function nextStep() {
  const steps = SC[S.curSC]?.steps || [];
  if (S.stepIdx >= 0) finalizeStep();
  S.stepIdx++;

  if (S.stepIdx >= steps.length) {
    // SC นี้จบแล้ว → SC ถัดไป?
    S.scIdx++;
    if (S.scIdx >= S.scList.length) {
      endSession(); return;
    }
    S.stepIdx = -1;
    // แสดง SC Transition 10 วินาที
    showSCTransition(() => {
      S.stepIdx = 0;
      S.pending = null;
      if ($('h-sc')) $('h-sc').textContent = S.curSC;
      doStep();
    });
    return;
  }

  if (S.stepIdx > 0 && S.transMs > 0) showTransition(() => doStep());
  else doStep();
}

// ── SC Transition (เปลี่ยน SC) — 10 วินาที ────────────
function showSCTransition(cb) {
  const nextSC = S.scList[S.scIdx];
  const scData = SC[nextSC];
  const el     = $('sc-trans-overlay');
  if (!el) { cb(); return; }

  // เสียง ding แจ้งเตือนเปลี่ยน SC
  beepDing(S.soundMode);

  $('sc-trans-id').textContent   = nextSC;
  $('sc-trans-name').textContent = scData?.nameTH || '';
  $('sc-trans-desc').textContent = scData?.desc   || '';

  let n = 10;
  $('sc-trans-n').textContent = n;
  el.classList.add('show');
  S.phase = 'sc-trans';

  clearInterval(S.transIv);
  S.transIv = setInterval(() => {
    n--;
    if ($('sc-trans-n')) $('sc-trans-n').textContent = n;
    beepTick(S.soundMode);
    if (n <= 0) {
      clearInterval(S.transIv); S.transIv = null;
      el.classList.remove('show');
      S.phase = 'running';
      cb();
    }
  }, 1000);
}

// ── Step Transition (เปลี่ยน step ภายใน SC) ───────────
function showTransition(cb) {
  const step  = SC[S.curSC]?.steps[S.stepIdx];
  if (!step) { cb(); return; }
  const a     = ACT[step.act] || { color: '#8B949E', label: '—' };
  const badge = $('prep-next-badge');
  if (badge) {
    badge.textContent = a.label;
    badge.style.color = badge.style.borderColor = a.color;
  }
  if ($('prep-next-th'))   $('prep-next-th').textContent   = step.th;
  if ($('prep-next-note')) $('prep-next-note').textContent = step.note;
  let n = Math.ceil(S.transMs / 1000);
  if ($('prep-n')) $('prep-n').textContent = n;
  $('prep-overlay')?.classList.add('show');
  S.phase = 'trans';
  beepTick(S.soundMode);
  clearInterval(S.transIv);
  S.transIv = setInterval(() => {
    n--;
    if (n <= 0) {
      clearInterval(S.transIv); S.transIv = null;
      $('prep-overlay')?.classList.remove('show');
      S.phase = 'running'; cb();
    } else {
      if ($('prep-n')) $('prep-n').textContent = n;
      beepTick(S.soundMode);
    }
  }, 1000);
}

// ── Do Step ───────────────────────────────────────────
function doStep() {
  const steps = SC[S.curSC]?.steps || [];
  const step  = steps[S.stepIdx];
  if (!step) { nextStep(); return; }
  const a = ACT[step.act] || { color: '#8B949E', label: 'ACT', nameTH: '' };

  S.stepT   = performance.now();
  S.stepDur = step.ms;
  S.pending = { act: step.act, onsetMs: nowMs(), step, sc: S.curSC };

  // UI
  const ib = $('i-badge');
  if (ib) { ib.textContent = a.label; ib.style.color = ib.style.borderColor = a.color; }
  if ($('i-name')) { $('i-name').textContent = a.nameTH; $('i-name').style.color = a.color; }
  if ($('i-th'))   $('i-th').textContent   = step.th;
  if ($('i-note')) $('i-note').textContent = step.note;
  if ($('ring-arc')) $('ring-arc').style.stroke = a.color;
  if ($('ring-num')) $('ring-num').style.color  = a.color;

  // Next preview
  const nxt    = steps[S.stepIdx + 1];
  const nextNb = $('i-next-badge');
  if (nxt) {
    const na = ACT[nxt.act] || { color: '#8B949E', label: '—' };
    if (nextNb) { nextNb.textContent = na.label; nextNb.style.color = nextNb.style.borderColor = na.color; }
    if ($('i-next-th'))   $('i-next-th').textContent   = nxt.th;
    if ($('i-next-note')) $('i-next-note').textContent = nxt.note;
  } else {
    // จบ SC นี้แล้ว — แสดง SC ถัดไป
    const nextSCId   = S.scList[S.scIdx + 1];
    const nextSCData = SC[nextSCId];
    if (nextNb) { nextNb.textContent = nextSCId || '—'; nextNb.style.color = '#22D3EE'; nextNb.style.borderColor = '#22D3EE'; }
    if ($('i-next-th'))   $('i-next-th').textContent   = nextSCData ? `▶ ${nextSCData.nameTH}` : 'สิ้นสุดทุก Scenario';
    if ($('i-next-note')) $('i-next-note').textContent = nextSCData ? 'SC ถัดไป — จะมีการแจ้งเตือน 10 วินาที' : '';
  }

  // Progress — คำนวณจากทุก SC
  const doneSteps  = stepsCompletedBefore(S.scIdx) + S.stepIdx;
  const totalSteps = totalStepsAll();
  if ($('h-steps')) $('h-steps').textContent = `${S.curSC} · ${S.stepIdx+1}/${steps.length}`;
  if ($('bar-fill')) $('bar-fill').style.width = `${(doneSteps / totalSteps) * 100}%`;

  if (S.soundMode === 'all') beepStart(S.soundMode);

  clearTimeout(S.timer);
  const warn3 = step.ms - 3000;
  if (warn3 > 500) setTimeout(() => { if (S.phase === 'running') beepWarn(S.soundMode); }, warn3);
  S.timer = setTimeout(() => { beepDing(S.soundMode); nextStep(); }, step.ms);
}

function finalizeStep() {
  if (!S.pending) return;
  const offMs = nowMs();
  const { act, onsetMs, step, sc } = S.pending;
  S.gtLog.push({
    sc,
    act,
    onsetMs:    Math.round(onsetMs),
    offsetMs:   Math.round(offMs),
    durationMs: Math.round(offMs - onsetMs),
    th:         step.th,
  });
  S.pending = null;
  renderLog();
}

// ── RAF Loop ──────────────────────────────────────────
function rafLoop() {
  cancelAnimationFrame(S.rafId);
  function frame() {
    if (S.phase === 'trans' || S.phase === 'sc-trans') {
      if ($('h-clock')) $('h-clock').textContent = fmtMs(nowMs());
      if ($('ring-arc')) $('ring-arc').style.strokeDashoffset = RING_C;
      if ($('ring-num')) $('ring-num').textContent = '—';
      S.rafId = requestAnimationFrame(frame);
      return;
    }
    if (S.phase !== 'running') return;
    if ($('h-clock')) $('h-clock').textContent = fmtMs(nowMs());
    const elapsed = performance.now() - S.stepT;
    const frac    = Math.min(1, elapsed / S.stepDur);
    if ($('ring-arc')) $('ring-arc').style.strokeDashoffset = RING_C * frac;
    const remSec = Math.max(0, (S.stepDur - elapsed) / 1000);
    if ($('ring-num')) $('ring-num').textContent = fmtSec(remSec);
    S.rafId = requestAnimationFrame(frame);
  }
  S.rafId = requestAnimationFrame(frame);
}

// ── Controls ──────────────────────────────────────────
function handlePause() {
  if (S.phase === 'running') {
    S.phase = 'paused'; S.pauseT = performance.now();
    clearTimeout(S.timer); cancelAnimationFrame(S.rafId);
    if ($('btn-pause')) { $('btn-pause').textContent = '▶ ดำเนินต่อ'; $('btn-pause').className = 'btn-ctrl play'; }
    if ($('rec-lbl')) $('rec-lbl').textContent = 'PAUSED';
  } else if (S.phase === 'paused') {
    const d = performance.now() - S.pauseT;
    S.pausedMs += d; S.stepT += d; S.phase = 'running';
    if ($('btn-pause')) { $('btn-pause').textContent = '⏸ หยุดชั่วคราว'; $('btn-pause').className = 'btn-ctrl pause'; }
    if ($('rec-lbl')) $('rec-lbl').textContent = 'LIVE';
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
    if ($('btn-pause')) { $('btn-pause').textContent = '⏸ หยุดชั่วคราว'; $('btn-pause').className = 'btn-ctrl pause'; }
    if ($('rec-lbl')) $('rec-lbl').textContent = 'LIVE';
  }
  nextStep(); rafLoop();
}

function handleStop() {
  if (!confirm('สิ้นสุด session ก่อนครบทุก SC?\nข้อมูลที่เก็บได้จนถึงตอนนี้จะถูกบันทึก')) return;
  clearTimeout(S.timer);
  if (S.phase === 'paused') S.pausedMs += performance.now() - S.pauseT;
  finalizeStep();
  endSession(); // endSession จะ auto-save เองค่ะ
}

function handleAbort() {
  if (!confirm('ยกเลิก session ทั้งหมด (ข้อมูลทั้งหมดจะหาย)?')) return;
  clearTimeout(S.timer); cancelAnimationFrame(S.rafId);
  if (S.recorder?.state !== 'inactive') { S.recorder.onstop = null; S.recorder?.stop(); }
  S.recorder = null; S.recChunks = [];
  clearInterval(S.transIv); S.transIv = null;
  $('prep-overlay')?.classList.remove('show');
  $('sc-trans-overlay')?.classList.remove('show');
  S.stream?.getTracks().forEach(t => t.stop());
  S.stream = null; S.phase = 'setup';
  if ($('sess'))  $('sess').style.display  = 'none';
  if ($('setup')) $('setup').style.display = 'flex';
}

// ── End Session ───────────────────────────────────────
async function endSession() {
  S.phase = 'done'; cancelAnimationFrame(S.rafId);
  if ($('bar-fill'))   $('bar-fill').style.width = '100%';
  if ($('btn-exp'))    $('btn-exp').disabled      = false;
  if ($('btn-exp-xl')) $('btn-exp-xl').disabled   = false;

  // บันทึก endTime จริงๆ ณ เวลานี้
  S.sess.endTime = new Date().toLocaleString('th-TH', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: 'Asia/Bangkok'
  });
  S.sess.startTime = S._startTime || '—';

  const scsDone   = [...new Set(S.gtLog.map(e => e.sc))];
  const scTotal   = S.scList.length;
  const isPartial = scsDone.length < scTotal;

  if ($('done-txt')) $('done-txt').textContent =
    `${isPartial ? '⚠️ หยุดกลางคัน' : '✅ ครบทุก SC'}\n` +
    `บันทึก ${S.gtLog.length} steps · ${scsDone.length}/${scTotal} SC\n` +
    `Session: ${S.sess.id}\n` +
    `เริ่ม: ${S.sess.startTime}  จบ: ${S.sess.endTime}`;

  // ── Auto-save ไป Backend ทันที ────────────────────
  if ($('done-txt')) $('done-txt').textContent += '\n\n⏳ กำลังบันทึกลง Server...';
  try {
    const payload = buildPayload(S.gtLog, {
      id:        S.sess.id,
      sc:        scsDone.join('+') || S.curSC,
      split:     S.sess.split,
      pid:       S.sess.pid,
      rater:     S.sess.rater,
      note:      `${S.sess.note || ''} | start:${S.sess.startTime} end:${S.sess.endTime}${isPartial ? ' [PARTIAL]' : ''}`.trim(),
    });
    const result = await apiSaveSession(payload);
    if ($('done-txt')) {
      $('done-txt').textContent = $('done-txt').textContent
        .replace('⏳ กำลังบันทึกลง Server...', `✅ บันทึกลง Server แล้ว\nไฟล์: ${result.filename}`);
    }
  } catch (e) {
    if ($('done-txt')) {
      $('done-txt').textContent = $('done-txt').textContent
        .replace('⏳ กำลังบันทึกลง Server...', '⚠️ Server offline — กด CSV เพื่อบันทึกแทน');
    }
  }

  // stop video recorder
  if (S.recorder?.state !== 'inactive') {
    S.recorder.onstop = () => {
      if (!S.recChunks.length) return;
      const blob = new Blob(S.recChunks, { type: 'video/webm' });
      triggerDownload(blob, `vid_${S.sess.id}.webm`);
      if ($('rec-lbl')) $('rec-lbl').textContent = `VID ${(S.recBytes/1048576).toFixed(1)} MB ↓`;
    };
    S.recorder.stop();
  }

  if ($('done')) $('done').style.display = 'flex';
}

// ── Log ───────────────────────────────────────────────
function renderLog() {
  const body   = $('log-body');
  const footer = $('log-footer');
  if (!body) return;
  if (!S.gtLog.length) {
    body.innerHTML = '<div style="color:var(--tx3);font-size:11px;text-align:center;padding:16px">ยังไม่มีข้อมูล</div>';
    if (footer) footer.textContent = '0 steps';
    return;
  }
  body.innerHTML = [...S.gtLog].reverse().map(e => {
    const c = (ACT[e.act] || { color: '#ccc' }).color;
    return `<div class="log-row">
      <span class="log-act" style="color:${c}">${e.sc}·${e.act}</span>
      <span class="log-time">${fmtMs(e.onsetMs)}</span>
      <span class="log-dur">${(e.durationMs/1000).toFixed(1)}s</span>
    </div>`;
  }).join('');
  if (footer) footer.textContent = `${S.gtLog.length} steps`;
}

function handleNewSession() {
  if ($('done')) $('done').style.display = 'none';
  if ($('sess')) $('sess').style.display = 'none';
  S.stream?.getTracks().forEach(t => t.stop());
  S.stream = null; S.recorder = null; S.recChunks = [];
  S.phase = 'setup';
  if ($('setup')) $('setup').style.display = 'flex';
}
