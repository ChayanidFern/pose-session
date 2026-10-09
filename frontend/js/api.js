/* ═══════════════════════════════════════════════════
   Neck GT Controller — API Client
   ติดต่อ Backend FastAPI
   ✏️ แก้ API_BASE_URL เมื่อ deploy จริง
   ═══════════════════════════════════════════════════ */

// ✏️ เปลี่ยนเป็น URL ของ Railway เมื่อ deploy
// เช่น "https://neck-gt-backend.up.railway.app"
const API_BASE_URL = window.location.hostname === "localhost"
  ? "http://localhost:8000"
  : "https://pose-session-production.up.railway.app"; // ← แก้ตรงนี้


// ── Save session to backend → ได้ Excel ──────────────
async function apiSaveSession(sessData) {
  const res = await fetch(`${API_BASE_URL}/api/save-session`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(sessData),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "บันทึกไม่สำเร็จ");
  }
  return res.json(); // { status, filename, download, message }
}


// ── Download Excel file ───────────────────────────────
async function apiDownloadExcel(filename) {
  const url = `${API_BASE_URL}/api/download/${filename}`;
  const a   = Object.assign(document.createElement("a"), {
    href:     url,
    download: filename,
    target:   "_blank",
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}


// ── List all saved sessions ───────────────────────────
async function apiListSessions() {
  const res = await fetch(`${API_BASE_URL}/api/sessions`);
  if (!res.ok) throw new Error("โหลดรายการไม่สำเร็จ");
  return res.json(); // { status, count, sessions: [...] }
}


// ── Delete a session file ─────────────────────────────
async function apiDeleteSession(filename) {
  const res = await fetch(`${API_BASE_URL}/api/sessions/${filename}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "ลบไม่สำเร็จ");
  }
  return res.json();
}


// ── Health check ──────────────────────────────────────
async function apiHealthCheck() {
  try {
    const res = await fetch(`${API_BASE_URL}/`);
    return res.ok;
  } catch {
    return false;
  }
}
