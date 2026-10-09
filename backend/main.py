# ═══════════════════════════════════════════════════════
#  Neck GT Controller — Backend API
#  FastAPI + openpyxl
#  เพิ่ม endpoint ใหม่ที่นี่
# ═══════════════════════════════════════════════════════

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime
import os

from excel_writer import save_session_to_excel, list_sessions

# ── App ──────────────────────────────────────────────
app = FastAPI(
    title="Neck GT Controller API",
    description="Backend สำหรับเก็บข้อมูลท่านั่ง Text Neck Syndrome",
    version="1.0.0",
)

# ── CORS (อนุญาต frontend เรียก API) ─────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # ✏️ เปลี่ยนเป็น URL จริงเมื่อ deploy
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)


# ── Pydantic Models (โครงสร้างข้อมูลที่รับจาก frontend) ──
class StepLog(BaseModel):
    act:        str            # activity key เช่น REST, NOTE, PC
    onsetMs:    int            # เวลาเริ่ม (ms นับจากต้น session)
    offsetMs:   int            # เวลาสิ้นสุด
    durationMs: int            # ระยะเวลา
    th:         str            # คำสั่งภาษาไทย

class SessionData(BaseModel):
    sessId:  str               # Session label
    pid:     str               # รหัส participant
    sc:      str               # Scenario เช่น SC-01
    split:   str               # train / val / test
    rater:   str               # ชื่อผู้วิจัย
    steps:   List[StepLog]     # ข้อมูลทุก step
    note:    Optional[str] = "" # หมายเหตุเพิ่มเติม (optional)


# ── Endpoints ─────────────────────────────────────────

@app.get("/")
def root():
    """Health check"""
    return {"status": "ok", "service": "Neck GT Controller API", "version": "1.0.0"}


@app.post("/api/save-session")
def save_session(data: SessionData):
    """
    รับข้อมูล session จาก frontend
    สร้าง Excel และบันทึกใน /data/
    คืนค่า filename สำหรับ download
    """
    try:
        filename = save_session_to_excel(data.dict(), DATA_DIR)
        return {
            "status":   "success",
            "filename": filename,
            "download": f"/api/download/{filename}",
            "message":  f"บันทึก {len(data.steps)} steps เรียบร้อย"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/download/{filename}")
def download_excel(filename: str):
    """
    ดาวน์โหลดไฟล์ Excel ที่บันทึกไว้
    """
    # ป้องกัน path traversal
    if ".." in filename or "/" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    filepath = os.path.join(DATA_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="ไม่พบไฟล์นี้")

    return FileResponse(
        path=filepath,
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )


@app.get("/api/sessions")
def get_sessions():
    """
    แสดงรายการ session ทั้งหมดที่บันทึกไว้
    """
    try:
        sessions = list_sessions(DATA_DIR)
        return {"status": "success", "count": len(sessions), "sessions": sessions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/sessions/{filename}")
def delete_session(filename: str):
    """
    ลบไฟล์ Excel session
    """
    if ".." in filename or "/" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    filepath = os.path.join(DATA_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="ไม่พบไฟล์นี้")

    os.remove(filepath)
    return {"status": "success", "message": f"ลบ {filename} แล้ว"}
