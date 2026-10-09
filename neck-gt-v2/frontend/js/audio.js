/* ═══════════════════════════════════════════════════
   Neck GT Controller — Audio Engine
   แก้เสียงและ tone ที่นี่
   ═══════════════════════════════════════════════════ */

let _actx = null;

function ensureAudio() {
  if (!_actx) _actx = new (window.AudioContext || window.webkitAudioContext)();
  if (_actx.state === 'suspended') _actx.resume();
}

// สร้างเสียง sine wave
// freq: Hz, durMs: ระยะเวลา ms, vol: ความดัง 0–1, delayS: หน่วงก่อนเล่น seconds
function tone(freq, durMs, vol = 0.3, delayS = 0) {
  ensureAudio();
  const t = _actx.currentTime + delayS;
  const o = _actx.createOscillator();
  const g = _actx.createGain();
  o.connect(g);
  g.connect(_actx.destination);
  o.type = 'sine';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.setValueAtTime(vol, t + durMs / 1000 - 0.03);
  g.gain.linearRampToValueAtTime(0, t + durMs / 1000);
  o.start(t);
  o.stop(t + durMs / 1000 + 0.05);
}

// เสียงเริ่ม step ใหม่ — สองโน้ตสั้น ขึ้น
function beepStart(soundMode) {
  if (soundMode === 'off') return;
  tone(880, 90, 0.25);
  tone(1320, 80, 0.2, 0.11);
}

// เสียง tick ระหว่าง countdown
function beepTick(soundMode) {
  if (soundMode === 'off') return;
  tone(660, 70, 0.18);
}

// เสียงครบเวลา — 3 โน้ต C6 → G5 → C5 พร้อม flash
function beepDing(soundMode) {
  if (soundMode === 'off') return;
  tone(1047, 120, 0.32);        // C6
  tone(784,  120, 0.28, 0.14);  // G5
  tone(523,  220, 0.35, 0.28);  // C5
  // flash white overlay
  const el = document.getElementById('ding-overlay');
  if (el) {
    el.style.background = 'rgba(255,255,255,0.18)';
    el.style.opacity = '1';
    setTimeout(() => { el.style.opacity = '0'; }, 320);
  }
}

// เสียงเตือนล่วงหน้า 3 วินาที — โน้ตเบาๆ
function beepWarn(soundMode) {
  if (soundMode === 'off') return;
  tone(880, 80, 0.18);
}
