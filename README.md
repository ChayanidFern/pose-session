# 🦴 Neck GT Controller

ระบบเก็บข้อมูลท่านั่งสำหรับ Text Neck Syndrome Dataset

---

## โครงสร้างไฟล์

```
neck-gt/
├── index.html          ← หน้าหลัก (แก้ HTML โครงสร้างที่นี่)
├── css/
│   └── style.css       ← ทุกสไตล์ / สี / layout / responsive
├── js/
│   ├── audio.js        ← เสียงแจ้งเตือนทุกชนิด
│   ├── export.js       ← export CSV และ Excel (.xlsx)
│   └── session.js      ← logic หลัก: step engine, timer, camera
└── data/
    └── scenarios.js    ← ทุก Scenario และ Activity Definition
```

---

## วิธีแก้ไขแต่ละส่วน

### เพิ่ม / แก้ Scenario
แก้ไขที่ `data/scenarios.js`
- เพิ่ม key ใหม่ใน object `SC`
- กำหนด `nameTH`, `desc`, และ `steps[]`
- แต่ละ step มี `act`, `th`, `note`, `ms`

### แก้สี / ธีม
แก้ไขที่ `css/style.css` บรรทัดแรก (CSS Variables `:root`)

### แก้เสียง
แก้ไขที่ `js/audio.js`
- `beepDing()` — เสียงครบเวลา
- `beepStart()` — เสียงเริ่ม step
- `beepTick()` — เสียง countdown

### แก้ export Excel
แก้ไขที่ `js/export.js`
- เพิ่มคอลัมน์ใน `buildRows()`
- แก้ sheet name หรือ column width

---

## วิธีรัน

### บน PC / Mac
```bash
cd neck-gt
python -m http.server 8000
```
แล้วเปิด http://localhost:8000

### บน iPad
1. รัน server บน PC ก่อน
2. ดู IP ของ PC (เช่น 192.168.1.5)
3. เปิด Safari บน iPad → http://192.168.1.5:8000
4. กด Allow เมื่อถามสิทธิ์กล้อง

### Deploy บน Netlify (ใช้กล้องบน iPad ได้)
1. ไปที่ https://app.netlify.com/drop
2. ลาก **โฟลเดอร์ neck-gt ทั้งโฟลเดอร์** วางลง
3. ได้ HTTPS link ทันที

---

## Scenarios

| SC | Activity | CVA คาด | Risk |
|---|---|---|---|
| SC-01 | Baseline นั่งตรง | ≥53° | Normal |
| SC-02 | จดโน้ตบนกระดาษ | 45–52° | Low–Mid |
| SC-03 | ไอแพดราบโต๊ะ | 42–50° | Mid |
| SC-04 | โทรศัพท์ถือมือ | 38–46° | High |
| SC-05 | คอม จอต่ำ→สูง | 48–60° | Low→Normal |
| SC-06 | Naturalistic 3 นาที | varies | Mixed |
| SC-07 | ไอแพด + stand สูง | 53–60° | Normal |
| SC-08 | โทรศัพท์ยกสูง | 53–58° | Normal |
| SC-09 | โทรศัพท์วางราบโต๊ะ | 38–44° | High |
| SC-RELAX | นั่งสบาย 20 นาที | varies | Mixed |
