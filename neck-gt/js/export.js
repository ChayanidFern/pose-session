/* ═══════════════════════════════════════════════════
   Neck GT Controller — Export Functions
   CSV และ Excel (.xlsx) ด้วย SheetJS
   ═══════════════════════════════════════════════════ */

// สร้าง array ของ row objects จาก gtLog
function buildRows(gtLog, sess) {
  const ts = new Date().toISOString();
  const { id, sc, split, pid, rater } = sess;
  return gtLog.map((e, i) => ({
    'ลำดับ':               i + 1,
    'กิจกรรม (activity)':  e.act,
    'ชื่อกิจกรรม':         ACT[e.act] ? ACT[e.act].nameTH : '—',
    'คำสั่ง (instruction)': e.th,
    'เวลาเริ่ม (ms)':       e.onsetMs,
    'เวลาสิ้นสุด (ms)':    e.offsetMs,
    'ระยะเวลา (ms)':        e.durationMs,
    'ระยะเวลา (s)':         (e.durationMs / 1000).toFixed(2),
    'รหัส participant':     pid,
    'ผู้บันทึก':            rater,
    'session':              id,
    'scenario':             sc,
    'split':                split,
    'timestamp':            ts,
  }));
}

// Export CSV (UTF-8 BOM — เปิด Excel ไม่เละ)
function doExportCSV(gtLog, sess) {
  const rows = buildRows(gtLog, sess);
  if (!rows.length) { alert('ยังไม่มีข้อมูล'); return; }
  const keys = Object.keys(rows[0]);
  const lines = [
    keys.join(','),
    ...rows.map(r => keys.map(k => {
      const v = r[k];
      return (typeof v === 'string' && v.includes(',')) ? `"${v}"` : v;
    }).join(','))
  ];
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  triggerDownload(blob, `gt_${sess.id}_${sess.sc}.csv`);
}

// Export Excel .xlsx ด้วย SheetJS (3 sheets)
function doExportExcel(gtLog, sess) {
  if (typeof XLSX === 'undefined') { alert('SheetJS ยังโหลดไม่เสร็จ'); return; }
  const rows = buildRows(gtLog, sess);
  if (!rows.length) { alert('ยังไม่มีข้อมูล'); return; }
  const { id, sc, split, pid, rater } = sess;

  // Sheet 1: ข้อมูลหลัก
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 6 }, { wch: 14 }, { wch: 16 }, { wch: 40 },
    { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 24 }, { wch: 10 }, { wch: 8 }, { wch: 28 }
  ];

  // Sheet 2: สรุปรายกิจกรรม
  const summary = {};
  rows.forEach(r => {
    const k = r['กิจกรรม (activity)'];
    if (!summary[k]) summary[k] = { กิจกรรม: k, ชื่อ: r['ชื่อกิจกรรม'], จำนวน_step: 0, 'รวมเวลา_s': 0 };
    summary[k]['จำนวน_step']++;
    summary[k]['รวมเวลา_s'] += parseFloat(r['ระยะเวลา (s)']);
  });
  const sumRows = Object.values(summary).map(s => ({
    ...s,
    'รวมเวลา_s':   +s['รวมเวลา_s'].toFixed(2),
    'รวมเวลา_min': (s['รวมเวลา_s'] / 60).toFixed(2),
  }));
  const ws2 = XLSX.utils.json_to_sheet(sumRows);
  ws2['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];

  // Sheet 3: Metadata
  const meta = [
    { field: 'Session ID',   value: id },
    { field: 'Scenario',     value: sc },
    { field: 'Participant',  value: pid },
    { field: 'Split',        value: split },
    { field: 'Rater',        value: rater },
    { field: 'Total steps',  value: rows.length },
    { field: 'Export time',  value: new Date().toLocaleString('th-TH') },
  ];
  const ws3 = XLSX.utils.json_to_sheet(meta);
  ws3['!cols'] = [{ wch: 16 }, { wch: 30 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws,  'ข้อมูล GT');
  XLSX.utils.book_append_sheet(wb, ws2, 'สรุปกิจกรรม');
  XLSX.utils.book_append_sheet(wb, ws3, 'Metadata');
  XLSX.writeFile(wb, `gt_${id}_${sc}.xlsx`);
}

// Helper: trigger browser download
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
