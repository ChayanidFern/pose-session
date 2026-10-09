/* ═══════════════════════════════════════════════════
   Neck GT Controller — Export Module
   ส่งข้อมูลไป Backend แล้ว download Excel กลับมา
   ═══════════════════════════════════════════════════ */

// ── Build payload สำหรับส่ง Backend ─────────────────
function buildPayload(gtLog, sess) {
  return {
    sessId: sess.id,
    pid:    sess.pid,
    sc:     sess.sc,
    split:  sess.split,
    rater:  sess.rater,
    note:   sess.note || "",
    steps:  gtLog.map(e => ({
      act:        e.act,
      onsetMs:    e.onsetMs,
      offsetMs:   e.offsetMs,
      durationMs: e.durationMs,
      th:         e.th,
    })),
  };
}

// ── Export Excel ผ่าน Backend ─────────────────────────
async function doExportExcel(gtLog, sess) {
  if (!gtLog.length) { alert("ยังไม่มีข้อมูล"); return; }

  // แสดง loading state
  const btn = document.getElementById("btn-exp-xl");
  const orig = btn ? btn.textContent : "";
  if (btn) { btn.textContent = "⏳ กำลังสร้าง..."; btn.disabled = true; }

  try {
    const payload  = buildPayload(gtLog, sess);
    const result   = await apiSaveSession(payload);

    // download ทันที
    await apiDownloadExcel(result.filename);

    alert(`✅ ${result.message}\nไฟล์: ${result.filename}`);
  } catch (err) {
    alert("❌ บันทึกไม่สำเร็จ\n" + err.message);
  } finally {
    if (btn) { btn.textContent = orig; btn.disabled = false; }
  }
}

// ── Export CSV (fallback — ทำในฝั่ง browser) ─────────
function doExportCSV(gtLog, sess) {
  if (!gtLog.length) { alert("ยังไม่มีข้อมูล"); return; }

  const ts   = new Date().toISOString();
  const keys = [
    "ลำดับ","กิจกรรม","คำสั่ง",
    "เวลาเริ่ม_ms","เวลาสิ้นสุด_ms","ระยะเวลา_ms","ระยะเวลา_s",
    "pid","rater","session","scenario","split","timestamp"
  ];

  const rows = gtLog.map((e, i) => [
    i + 1, e.act, `"${e.th}"`,
    e.onsetMs, e.offsetMs, e.durationMs,
    (e.durationMs / 1000).toFixed(2),
    sess.pid, sess.rater, sess.id, sess.sc, sess.split, ts
  ].join(","));

  const blob = new Blob(["\ufeff" + [keys.join(","), ...rows].join("\n")],
    { type: "text/csv;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), {
    href:     url,
    download: `gt_${sess.id}_${sess.sc}.csv`,
  });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
