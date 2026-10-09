# 🦴 Neck GT Controller v2

Full-stack app เก็บข้อมูลท่านั่ง Text Neck Syndrome

---

## โครงสร้างไฟล์

```
neck-gt-v2/
├── frontend/                  ← หน้าเว็บ (deploy บน Railway Static / Vercel)
│   ├── index.html             ← หน้าหลัก session controller
│   ├── sessions.html          ← หน้าดู/download session ทั้งหมด
│   ├── css/
│   │   └── style.css          ← ✏️ แก้สีและ layout ที่นี่
│   ├── js/
│   │   ├── api.js             ← ✏️ แก้ API_BASE_URL เมื่อ deploy
│   │   ├── audio.js           ← เสียงแจ้งเตือน
│   │   ├── export.js          ← ส่งข้อมูลไป backend
│   │   └── session.js         ← logic หลัก step/timer/camera
│   └── data/
│       └── scenarios.js       ← ✏️ แก้/เพิ่ม Scenario ที่นี่
│
└── backend/                   ← Python FastAPI (deploy บน Railway)
    ├── main.py                ← API endpoints
    ├── excel_writer.py        ← ✏️ แก้สไตล์ Excel ที่นี่
    ├── requirements.txt
    ├── Procfile               ← Railway start command
    └── data/                  ← Excel files ถูกเก็บที่นี่
```

---

## Deploy — Railway

### Backend (FastAPI)

1. ไปที่ https://railway.app → New Project → Deploy from GitHub
2. เลือก repo → เลือก folder `backend` เป็น Root Directory
3. Railway จะอ่าน `Procfile` และ `requirements.txt` อัตโนมัติ
4. Copy URL ที่ได้ เช่น `https://neck-gt-backend.up.railway.app`

### Frontend (Static)

1. ใน Railway → New Service → Static Site
2. เลือก folder `frontend` เป็น Root Directory
3. หรือ deploy frontend บน Vercel แยกต่างหากก็ได้

### แก้ URL

เปิด `frontend/js/api.js` บรรทัด 10:
```js
: "https://YOUR-RAILWAY-URL.up.railway.app"  // ← เปลี่ยนตรงนี้
```

---

## API Endpoints

| Method | Path | คำอธิบาย |
|--------|------|----------|
| GET    | `/`  | Health check |
| POST   | `/api/save-session` | รับข้อมูล → สร้าง Excel |
| GET    | `/api/download/{filename}` | ดาวน์โหลด Excel |
| GET    | `/api/sessions` | รายการ session ทั้งหมด |
| DELETE | `/api/sessions/{filename}` | ลบ session |

---

## รัน Local

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```
เปิด http://localhost:8000/docs เพื่อดู API docs

### Frontend
```bash
cd frontend
python -m http.server 3000
```
เปิด http://localhost:3000

---

## แก้ไขทั่วไป

| ต้องการแก้ | แก้ที่ไฟล์ |
|----------|----------|
| เพิ่ม Scenario | `frontend/data/scenarios.js` |
| เปลี่ยนสีเว็บ | `frontend/css/style.css` บน `:root` |
| เปลี่ยนสไตล์ Excel | `backend/excel_writer.py` → COLORS dict |
| เพิ่มคอลัมน์ Excel | `backend/excel_writer.py` → `_write_gt_sheet()` |
| เพิ่ม API endpoint | `backend/main.py` |
