// ══════════════════════════════════════════════════════
// PDF SELECT MODAL
// ══════════════════════════════════════════════════════
const PDF_REPORT_TYPES = [
  { key:'overview', icon:'📊', title:'รายงานสรุปภาพรวมยุทธศาสตร์', desc:'สรุปผลการดำเนินงานรายยุทธศาสตร์ทั้ง 5 ยุทธศาสตร์ · งบประมาณ · สถานะโครงการ · ตารางสรุปรวม' },
  { key:'projects', icon:'📝', title:'รายงานสรุปรายโครงการ', desc:'รายละเอียดโครงการแบบเต็มรูปแบบ ทีละโครงการ · หลักการ วัตถุประสงค์ เป้าหมาย แผนดำเนินงาน งบประมาณ ตัวชี้วัด และลงนาม' },
  { key:'full',     icon:'🗂️', title:'รายงานฉบับสมบูรณ์ (ภาพรวม + รายโครงการ)', desc:'สรุปภาพรวมยุทธศาสตร์ก่อน แล้วตามด้วยรายละเอียดโครงการแบบเต็มรูปแบบทีละโครงการ ในฉบับเดียว' },
];
window._pdfSelectedReportType = 'overview';

function openPdfSelectModal() {
  window._pdfSelectedReportType = 'overview';
  const qSel = document.getElementById('pdfQuarterSelect');
  const ql = Q_LABELS[currentYear] || Q_LABELS[2570];
  qSel.innerHTML = ['all','1','2','3','4'].map(k => `<option value="${k}">${ql[k]} (ปีงบประมาณ ${currentYear})</option>`).join('');
  document.getElementById('pdfStrategySelect').value = 'all';
  renderPdfReportTypeList();
  const el = document.getElementById('pdfSelectOverlay');
  el.style.display = 'flex';
}
function closePdfSelectModal() {
  document.getElementById('pdfSelectOverlay').style.display = 'none';
}
function selectPdfReportType(key) {
  window._pdfSelectedReportType = key;
  renderPdfReportTypeList();
}
function renderPdfReportTypeList() {
  const el = document.getElementById('pdfReportTypeList');
  const sel = window._pdfSelectedReportType || 'overview';
  el.innerHTML = PDF_REPORT_TYPES.map(t => {
    const active = t.key === sel;
    return `
    <div onclick="selectPdfReportType('${t.key}')" style="display:flex;align-items:flex-start;gap:12px;padding:12px 14px;border-radius:10px;cursor:pointer;border:1.5px solid ${active?'#ef4444':'#e4e7ed'};background:${active?'#fff5f5':'#fff'};margin-bottom:10px;transition:.15s">
      <div style="width:38px;height:38px;border-radius:8px;background:#fde3e3;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${t.icon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:13.5px;color:#1c2333">${t.title}</div>
        <div style="font-size:11.5px;color:#8a92a3;margin-top:3px;line-height:1.5">${t.desc}</div>
      </div>
    </div>`;
  }).join('');
}

function generateSelectedReportPDF() {
  const reportType = window._pdfSelectedReportType || 'overview';
  const quarter = document.getElementById('pdfQuarterSelect').value || 'all';
  const strategyFilter = document.getElementById('pdfStrategySelect').value || 'all';
  exportReportPDF(reportType, quarter, strategyFilter);
}
