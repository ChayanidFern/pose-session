/* ═══════════════════════════════════════════════════
   Neck GT Controller v3 — Session Logic
   - ไม่มีกล้อง
   - เลือก SC เดียว รันอันนั้น
   - ส่งข้อมูลเมื่อจบแต่ละ SC อัตโนมัติ
   - หยุดกลางคัน → confirm → กลับหน้าหลักทันที
   ═══════════════════════════════════════════════════ */

'use strict';

const $ = id => document.getElementById(id);

// ── State ─────────────────────────────────────────────
const S = {
  phase:    'setup',   // 'setup'|'running'|'trans'|'paused'|'done'
  sess:     { id: '', sc: 'SC-01', split: 'train', pid: 'P00', rater: '', note: '' },
  t0:       null,
  pausedMs: 0, pauseT: null,
  stepIdx:  -1,
  stepT:    null, stepDur: 0,
  pending:  null,
  transMs:  3000,
  transIv:  null,
  soundMode:'all',
  gtLog:    [],
  rafId:    null,
  timer:    null,
  _startTime: '',
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
  return `${m}:${(s%60).toString().padStart(2,'0')}.${Math.floor(ms%1000).toString().padStart(3,'0')}`;
}
function fmtSec(s) { return s >= 10 ? s.toFixed(0)+'s' : s.toFixed(1)+'s'; }
function nowTH() {
  return new Date().toLocaleString('th-TH', {
    year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit',
    hour12: false, timeZone:'Asia/Bangkok'
  });
}

// ── Setup ─────────────────────────────────────────────
function initSetup() {
  const sel = $('inp-sc');
  if (sel) {
    Object.entries(SC).forEach(([id, sc]) => {
      const o = document.createElement('option');
      o.value = id;
      o.textContent = `${id} — ${sc.nameTH}`;
      sel.appendChild(o);
    });
    sel.addEventListener('change', renderSCPreview);
    renderSCPreview();
  }

  document.querySelectorAll('#sound-opts .sound-opt').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('#sound-opts .sound-opt').forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
    });
  });
}

function renderSCPreview() {
  const id = $('inp-sc')?.value;
  const sc = SC[id];
  if (!sc || !$('sc-preview')) return;
  const totalSec = Math.round(sc.steps.reduce((a,s) => a+s.ms, 0) / 1000);
  const m = Math.floor(totalSec/60), s = totalSec%60;
  const acts = [...new Set(sc.steps.map(s => s.act))];
  const chips = acts.map(a => {
    const ac = ACT[a] || { color:'#888', label:a };
    return `<span class="sc-act-chip" style="color:${ac.color};border-color:${ac.color}">${ac.label}</span>`;
  }).join('');
  $('sc-preview').innerHTML = `
    <div class="sc-name">${id} — ${sc.nameTH}</div>
    <div>${sc.desc}</div>
    <div style="margin-top:4px;font-size:11px;color:var(--tx3);font-family:var(--mono)">${sc.steps.length} steps · ${m>0?m+'m ':''}${s}s</div>
    <div class="sc-acts">${chips}</div>`;
  $('sc-preview').classList.add('active');
}

// ── Start (ไม่มีกล้อง) ────────────────────────────────
function handleStart() {
  ensureAudio();
  S.sess.id    = ($('inp-sess')?.value.trim()) || `sess_${Date.now()}`;
  S.sess.sc    = $('inp-sc')?.value            || 'SC-01';
  S.sess.split = $('inp-split')?.value         || 'train';
  S.sess.pid   = ($('inp-pid')?.value.trim())  || 'P00';
  S.sess.rater = ($('inp-rater')?.value.trim())|| 'unknown';
  S.sess.note  = ($('inp-note')?.value.trim()) || '';
  S.soundMode  = document.querySelector('#sound-opts input:checked')?.value || 'all';

  if ($('setup')) $('setup').style.display = 'none';
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
  S.phase      = 'running';
  S.t0         = performance.now();
  S.pausedMs   = 0;
  S.stepIdx    = -1;
  S.gtLog      = [];
  S._startTime = nowTH();
  S.transMs    = parseInt($('inp-trans')?.value) || 3000;

  if ($('sess'))       $('sess').style.display  = 'flex';
  if ($('h-sess'))     $('h-sess').textContent  = S.sess.id;
  if ($('h-sc'))       $('h-sc').textContent    = S.sess.sc;
  if ($('btn-pause'))  $('btn-pause').disabled  = false;
  if ($('btn-skip'))   $('btn-skip').disabled   = false;
  if ($('btn-stop'))   $('btn-stop').disabled   = false;

  renderLog();
  nextStep();
  rafLoop();
}

// ── Step Engine ───────────────────────────────────────
function nextStep() {
  const steps = SC[S.sess.sc]?.steps || [];
  if (S.stepIdx >= 0) finalizeStep();
  S.stepIdx++;

  if (S.stepIdx >= steps.length) {
    // จบ SC → auto-save แล้วกลับหน้าหลัก
    endSession();
    return;
  }

  if (S.stepIdx > 0 && S.transMs > 0) showTransition(() => doStep());
  else doStep();
}

// ── Step Transition ───────────────────────────────────
function showTransition(cb) {
  const step  = SC[S.sess.sc]?.steps[S.stepIdx];
  if (!step) { cb(); return; }
  const a = ACT[step.act] || { color:'#8B949E', label:'—' };
  const badge = $('prep-next-badge');
  if (badge) { badge.textContent = a.label; badge.style.color = badge.style.borderColor = a.color; }
  if ($('prep-next-th'))   $('prep-next-th').textContent   = step.th;
  if ($('prep-next-note')) $('prep-next-note').textContent = step.note;
  let n = Math.ceil(S.transMs / 1000);
  if ($('prep-n')) $('prep-n').textContent = n;
  $('prep-overlay')?.classList.add('show');
  S.phase = 'trans'; beepTick(S.soundMode);
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
  const steps = SC[S.sess.sc]?.steps || [];
  const step  = steps[S.stepIdx];
  if (!step) { nextStep(); return; }
  const a = ACT[step.act] || { color:'#8B949E', label:'ACT', nameTH:'' };

  S.stepT   = performance.now();
  S.stepDur = step.ms;
  S.pending = { act: step.act, onsetMs: nowMs(), step, sc: S.sess.sc };

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
    const na = ACT[nxt.act] || { color:'#8B949E', label:'—' };
    if (nextNb) { nextNb.textContent = na.label; nextNb.style.color = nextNb.style.borderColor = na.color; }
    if ($('i-next-th'))   $('i-next-th').textContent   = nxt.th;
    if ($('i-next-note')) $('i-next-note').textContent = nxt.note;
  } else {
    if (nextNb) { nextNb.textContent = '—'; nextNb.style.color = 'var(--tx3)'; nextNb.style.borderColor = 'var(--bdr)'; }
    if ($('i-next-th'))   $('i-next-th').textContent   = 'ขั้นตอนสุดท้ายของ SC นี้';
    if ($('i-next-note')) $('i-next-note').textContent = 'ข้อมูลจะถูกบันทึกอัตโนมัติ';
  }

  $('h-steps')  && ($('h-steps').textContent = `${S.stepIdx+1}/${steps.length}`);
  $('bar-fill') && ($('bar-fill').style.width = `${(S.stepIdx/steps.length)*100}%`);

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
    sc, act,
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
    if (S.phase === 'trans') {
      if ($('h-clock')) $('h-clock').textContent = fmtMs(nowMs());
      if ($('ring-arc')) $('ring-arc').style.strokeDashoffset = RING_C;
      if ($('ring-num')) $('ring-num').textContent = '—';
      S.rafId = requestAnimationFrame(frame); return;
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
  } else if (S.phase === 'paused') {
    const d = performance.now() - S.pauseT;
    S.pausedMs += d; S.stepT += d; S.phase = 'running';
    if ($('btn-pause')) { $('btn-pause').textContent = '⏸ หยุดชั่วคราว'; $('btn-pause').className = 'btn-ctrl pause'; }
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
  }
  nextStep(); rafLoop();
}

// ── หยุดบันทึก → confirm → บันทึก → กลับหน้าหลักทันที
async function handleStop() {
  if (!confirm('⏹ ยืนยันหยุดบันทึก?\n\nข้อมูลจะถูกบันทึกลง Server อัตโนมัติ')) return;

  clearTimeout(S.timer); cancelAnimationFrame(S.rafId);
  clearInterval(S.transIv); S.transIv = null;
  $('prep-overlay')?.classList.remove('show');
  if (S.phase === 'paused') S.pausedMs += performance.now() - S.pauseT;
  S.phase = 'saving';
  finalizeStep();

  // กลับหน้าหลักทันที ไม่รอ
  resetToSetup();

  // บันทึกใน background
  const endTime = nowTH();
  const isPartial = S.gtLog.length < (SC[S.sess.sc]?.steps.length || 0);
  autoSaveToBackend(S.gtLog, {
    id:    S.sess.id,
    sc:    S.sess.sc,
    split: S.sess.split,
    pid:   S.sess.pid,
    rater: S.sess.rater,
    note:  `${S.sess.note || ''} | start:${S._startTime} end:${endTime}${isPartial ? ' [PARTIAL]' : ''}`.trim(),
  }).then(r => {
    if (!r.ok) console.warn('บันทึกไม่สำเร็จ:', r.msg);
  });
}
  // แสดง saving indicator
   // แสดง saving indicator
  if ($('sess')) {
    const ind = document.createElement('div');
    ind.id = 'saving-indicator';
    ind.style.cssText = '...';
    ind.innerHTML = '...';
    document.body.appendChild(ind);
  }

  // บันทึกข้อมูล
  const endTime = nowTH();
  const isPartial = S.gtLog.length < (SC[S.sess.sc]?.steps.length || 0);


  // กลับหน้าหลักทันที ไม่แสดง done modal
  document.getElementById('saving-indicator')?.remove();
  resetToSetup();

 if (!result.ok) {
    alert('⚠️ บันทึก Server ไม่สำเร็จ\nกรุณา export CSV แทน\n' + result.msg);
  }
}

// ── End Session (ครบ SC) → auto-save → done screen ──
async function endSession() {
  S.phase = 'done'; cancelAnimationFrame(S.rafId);
  if ($('bar-fill')) $('bar-fill').style.width = '100%';

  const endTime   = nowTH();
  const isPartial = false;

  // auto-save
  const result = await autoSaveToBackend(S.gtLog, {
    id:    S.sess.id,
    sc:    S.sess.sc,
    split: S.sess.split,
    pid:   S.sess.pid,
    rater: S.sess.rater,
    note:  `${S.sess.note || ''} | start:${S._startTime} end:${endTime}`.trim(),
  });

  if ($('done-txt')) $('done-txt').textContent =
    `✅ ครบ SC แล้ว!\n` +
    `บันทึก ${S.gtLog.length} steps\n` +
    `Session: ${S.sess.id} · ${S.sess.sc}\n` +
    `เริ่ม: ${S._startTime}\nจบ: ${endTime}\n\n` +
    (result.ok ? '✅ บันทึกลง Server แล้ว' : '⚠️ Server offline — กด CSV แทน');

  if ($('done')) $('done').style.display = 'flex';
}

// ── Reset กลับหน้า setup ─────────────────────────────
function resetToSetup() {
  S.phase    = 'setup';
  S.gtLog    = [];
  S.stepIdx  = -1;
  S.pending  = null;
  S.pausedMs = 0;
  S.t0       = null;
  if ($('sess'))  $('sess').style.display  = 'none';
  if ($('done'))  $('done').style.display  = 'none';
  if ($('setup')) $('setup').style.display = 'flex';
  if ($('btn-pause')) { $('btn-pause').textContent = '⏸ หยุดชั่วคราว'; $('btn-pause').className = 'btn-ctrl pause'; }
}

function handleNewSession() {
  resetToSetup();
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
    const c = (ACT[e.act] || { color:'#ccc' }).color;
    return `<div class="log-row">
      <span class="log-act" style="color:${c}">${e.sc}·${e.act}</span>
      <span class="log-time">${fmtMs(e.onsetMs)}</span>
      <span class="log-dur">${(e.durationMs/1000).toFixed(1)}s</span>
    </div>`;
  }).join('');
  if (footer) footer.textContent = `${S.gtLog.length} steps`;
}
