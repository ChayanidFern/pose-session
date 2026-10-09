/* ═══════════════════════════════════════════════════
   Neck GT Controller — Export Module
   ═══════════════════════════════════════════════════ */

// ── Build payload ─────────────────────────────────────
function buildPayload(gtLog, sess) {
  return {
    sessId: sess.id,
    pid:    sess.pid,
    sc:     sess.sc || sess.curSC || "ALL",
    split:  sess.split,
    rater:  sess.rater,
    note:   sess.note || "",
    steps:  gtLog.map(e => ({
      sc:         e.sc  || sess.sc || "ALL",  // SC ของแต่ละ step
      act:        e.act,
      onsetMs:    e.onsetMs,
      offsetMs:   e.offsetMs,
      durationMs: e.durationMs,
      th:         e.th,
    })),
  };
}

// ── Auto-save ไป Backend (ไม่ดาวน์โหลดทันที) ──────────
async function autoSaveToBackend(gtLog, sess) {
  if (!gtLog.length) return { ok: false, msg: 'ไม่มีข้อมูล' };
  try {
    const payload = buildPayload(gtLog, sess);
    const result  = await apiSaveSession(payload);
    return { ok: true, filename: result.filename, msg: result.message };
  } catch (err) {
    return { ok: false, msg: err.message };
  }
}

// ── Download all_sessions.xlsx จาก server ─────────────
async function doExportExcel(gtLog, sess) {
  const btn  = document.getElementById("btn-exp-xl");
  const orig = btn?.textContent || "";
  if (btn) { btn.textContent = "⏳ กำลังบันทึก..."; btn.disabled = true; }
  try {
    const r = await autoSaveToBackend(gtLog, sess);
    if (!r.ok) { alert("❌ " + r.msg); return; }
    // ดาวน์โหลด all_sessions.xlsx
    await apiDownloadExcel(r.filename);
    alert(`✅ บันทึกแล้ว\nดาวน์โหลดจากหน้า Sessions ได้ตลอดเวลาค่ะ`);
  } catch (err) {
    alert("❌ " + err.message);
  } finally {
    if (btn) { btn.textContent = orig; btn.disabled = false; }
  }
}

// ── Export CSV fallback ───────────────────────────────
function doExportCSV(gtLog, sess) {
  if (!gtLog.length) { alert("ยังไม่มีข้อมูล"); return; }
  const ts   = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
  const keys = ["ลำดับ","SC","กิจกรรม","คำสั่ง",
    "เวลาเริ่ม_ms","เวลาสิ้นสุด_ms","ระยะเวลา_ms","ระยะเวลา_s",
    "pid","rater","session","split","timestamp"];
  const rows = gtLog.map((e, i) => [
    i+1, e.sc||sess.sc||"", e.act, `"${e.th}"`,
    e.onsetMs, e.offsetMs, e.durationMs,
    (e.durationMs/1000).toFixed(2),
    sess.pid, sess.rater, sess.id, sess.split, `"${ts}"`
  ].join(","));
  const blob = new Blob(["\ufeff" + [keys.join(","), ...rows].join("\n")],
    { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a   = Object.assign(document.createElement("a"),
    { href: url, download: `gt_${sess.id}.csv` });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
