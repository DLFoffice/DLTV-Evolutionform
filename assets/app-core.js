// ===== DATA =====
// ปี 2570 — เริ่มต้นว่างเปล่า ไม่มี default seed
// โหลดข้อมูลจาก localStorage (key: dltv_projects_2570_v2) หรือ Google Sheet เท่านั้น
const DEFAULT_PROJECTS = [];
let projects = [];

// ===== CONSTANTS =====
const S_NAMES = {1:'ยุทธศาสตร์ที่ 1',2:'ยุทธศาสตร์ที่ 2',3:'ยุทธศาสตร์ที่ 3',4:'ยุทธศาสตร์ที่ 4',5:'งบบริหารสำนักงาน'};
const S_FULL  = {1:'การพัฒนาการจัดการศึกษาทางไกล',2:'การพัฒนาครูและโรงเรียนต้นทาง',3:'การพัฒนาครูและโรงเรียนปลายทาง',4:'การพัฒนาระบบการบริหารจัดการ',5:'งบดำเนินการสำนักงาน'};
const S_COLORS= {1:'#3b72f0',2:'#059669',3:'#d97706',4:'#9333ea',5:'#0891b2'};
const S_BADGE = {1:'badge-s1',2:'badge-s2',3:'badge-s3',4:'badge-s4',5:'badge-s5'};
const S_KEYS  = [1,2,3,4,5];
const STATUS_LABEL = {done:'แล้วเสร็จ',progress:'อยู่ระหว่างดำเนิน',pending:'ยังไม่เริ่ม'};
const STATUS_CLASS  = {done:'badge-done',progress:'badge-progress',pending:'badge-pending'};
const Q_LABELS = {
  2569: {all:'ทุกไตรมาส','1':'ไตรมาส 1 (ต.ค.–ธ.ค. 68)','2':'ไตรมาส 2 (ม.ค.–มี.ค. 69)','3':'ไตรมาส 3 (เม.ย.–มิ.ย. 69)','4':'ไตรมาส 4 (ก.ค.–ก.ย. 69)'},
  2570: {all:'ทุกไตรมาส','1':'ไตรมาส 1 (ต.ค.–ธ.ค. 69)','2':'ไตรมาส 2 (ม.ค.–มี.ค. 70)','3':'ไตรมาส 3 (เม.ย.–มิ.ย. 70)','4':'ไตรมาส 4 (ก.ค.–ก.ย. 70)'}
};
let Q_LABEL = Q_LABELS[2570];

// ── งบประมาณที่ได้รับจัดสรรประจำปี (ตั้งค่าได้ในระบบ) ──────────────
// ค่าเริ่มต้นตามที่ได้รับจัดสรรปีงบประมาณ พ.ศ. 2570 = 498,584,400 บาท
// ผู้ใช้สามารถแก้ไขตัวเลขนี้ได้ภายหลังผ่านหน้าตั้งค่า โดยไม่ต้องแก้ไขโค้ด
const DEFAULT_ALLOCATED_BUDGET = 498584400;
const ALLOCATED_BUDGET_KEY = 'dltv_allocated_budget_2570';
function getAllocatedBudget() {
  try {
    const v = localStorage.getItem(ALLOCATED_BUDGET_KEY);
    if (v === null) return DEFAULT_ALLOCATED_BUDGET;
    const n = Number(v);
    return (isFinite(n) && n >= 0) ? n : DEFAULT_ALLOCATED_BUDGET;
  } catch(e) { return DEFAULT_ALLOCATED_BUDGET; }
}
function setAllocatedBudget(n) {
  try { localStorage.setItem(ALLOCATED_BUDGET_KEY, String(Math.max(0, Number(n)||0))); } catch(e) {}
}

// ── Year state ──────────────────────────────────────────────────
// ถ้า URL มี ?year=2570 ให้ใช้ปีนั้นในแท็บนี้ (localStorage แยกต่อแท็บไม่ได้ แต่ URL ได้)
// ไฟล์นี้เป็นปี 2570 เท่านั้น
let currentYear = 2570;

function switchYear(year){ /* ปี 2570 เท่านั้น */ }

// ── ─────────────────────────────────────────────────────────────
let editingId = null, deleteId = null, currentPage = 1;
const PAGE_SIZE = 10;
let tempKPIs = [];
let chartBudget = null, chartStatus = null, chartUtilization = null, chartBudgetGauge = null, chartCommitteeBudget = null;
let currentQuarter = 'all';

// ===== UTILS =====
function fmt(n) {
  n = n||0;
  if (n>=1000000) return (n/1000000).toFixed(2)+'M';
  if (n>=1000) return (n/1000).toFixed(0)+'K';
  return n.toLocaleString('th-TH');
}
function fmtFull(n) { return (n||0).toLocaleString('th-TH'); }

// ── หน้าตั้งค่า: งบประมาณที่ได้รับจัดสรรประจำปี ─────────────────────
function openAllocatedBudgetModal() {
  const inp = document.getElementById('allocatedBudgetInput');
  if (inp) inp.value = getAllocatedBudget();
  const el = document.getElementById('allocatedBudgetOverlay');
  if (el) el.classList.add('open');
  setTimeout(()=>{ if(inp) inp.focus(); }, 100);
}
function closeAllocatedBudgetModal() {
  const el = document.getElementById('allocatedBudgetOverlay');
  if (el) el.classList.remove('open');
}
function saveAllocatedBudgetFromModal() {
  const inp = document.getElementById('allocatedBudgetInput');
  const val = inp ? Number(inp.value) : NaN;
  if (!isFinite(val) || val < 0) {
    showToast('กรุณากรอกจำนวนเงินให้ถูกต้อง');
    return;
  }
  setAllocatedBudget(val);
  closeAllocatedBudgetModal();
  showToast('บันทึกงบประมาณที่ได้รับจัดสรรเรียบร้อยแล้ว');
  updateDashboard();
}

function showToast(msg, dur=2500) {
  // ── inject styles once ──────────────────────────────────────
  if (!document.getElementById('_ntfSt')) {
    const s = document.createElement('style');
    s.id = '_ntfSt';
    s.textContent = `
      @keyframes _ntfIn  { 0%{opacity:0;transform:translateY(-28px) scale(.92)} 60%{transform:translateY(4px) scale(1.02)} 100%{opacity:1;transform:translateY(0) scale(1)} }
      @keyframes _ntfOut { 0%{opacity:1;transform:translateY(0) scale(1)} 100%{opacity:0;transform:translateY(-20px) scale(.94)} }
      @keyframes _ntfBar { from{width:100%} to{width:0%} }
      ._ntf-overlay { position:fixed;inset:0;z-index:99999;display:flex;align-items:flex-start;justify-content:center;padding-top:32px;pointer-events:none; }
      ._ntf-box {
        pointer-events:auto;
        min-width:280px;max-width:440px;
        background:#fff;
        border-radius:14px;
        box-shadow:0 8px 32px rgba(0,0,0,.14),0 2px 8px rgba(0,0,0,.08);
        overflow:hidden;
        animation:_ntfIn .42s cubic-bezier(.22,.68,0,1.2) forwards;
        font-family:'Sarabun',sans-serif;
        cursor:pointer;
      }
      ._ntf-inner { display:flex;align-items:center;gap:14px;padding:16px 20px; }
      ._ntf-icon-wrap {
        width:40px;height:40px;border-radius:10px;
        display:flex;align-items:center;justify-content:center;
        font-size:20px;flex-shrink:0;
      }
      ._ntf-text { flex:1;min-width:0; }
      ._ntf-title { font-size:13.5px;font-weight:700;color:#1c2333;line-height:1.4; }
      ._ntf-sub   { font-size:11.5px;color:#6b7280;margin-top:2px;line-height:1.4; }
      ._ntf-bar   { height:3px;border-radius:0 0 14px 14px; }
      ._ntf-bar-fill { height:100%;border-radius:0 0 14px 14px;animation:_ntfBar var(--dur,2.5s) linear forwards; }
      ._ntf-close { flex-shrink:0;width:26px;height:26px;border-radius:50%;border:none;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:16px;transition:background .15s;margin-left:4px; }
      ._ntf-close:hover { background:#f3f4f6;color:#374151; }
    `;
    document.head.appendChild(s);
  }

  // ── classify message ────────────────────────────────────────
  let icon='ℹ️', iconBg='#eff6ff', iconColor='#3b82f6', barColor='#3b82f6', borderL='#3b82f6';
  const m = msg;
  if (m.includes('✅')||m.includes('สำเร็จ')||m.includes('บันทึก')||m.includes('ยินดีต้อนรับ')||m.includes('โหลด')) {
    icon='✅'; iconBg='#f0fdf4'; iconColor='#16a34a'; barColor='#22c55e'; borderL='#22c55e';
  } else if (m.includes('❌')||m.includes('ผิดพลาด')||m.includes('ไม่สำเร็จ')||m.includes('error')) {
    icon='❌'; iconBg='#fff1f2'; iconColor='#e11d48'; barColor='#f43f5e'; borderL='#f43f5e';
  } else if (m.includes('⚠️')||m.includes('แจ้งเตือน')||m.includes('ระวัง')) {
    icon='⚠️'; iconBg='#fffbeb'; iconColor='#d97706'; barColor='#f59e0b'; borderL='#f59e0b';
  } else if (m.includes('🔒')||m.includes('ล็อค')||m.includes('ไม่อนุญาต')) {
    icon='🔒'; iconBg='#faf5ff'; iconColor='#7c3aed'; barColor='#8b5cf6'; borderL='#8b5cf6';
  } else if (m.includes('🔄')||m.includes('⏳')||m.includes('กำลัง')||m.includes('sync')) {
    icon='🔄'; iconBg='#f0f9ff'; iconColor='#0284c7'; barColor='#0ea5e9'; borderL='#0ea5e9';
  } else if (m.includes('👋')||m.includes('ออกจากระบบ')) {
    icon='👋'; iconBg='#fafafa'; iconColor='#374151'; barColor='#6b7280'; borderL='#6b7280';
  } else if (m.includes('👁')||m.includes('ผู้เยี่ยมชม')) {
    icon='👁'; iconBg='#f8fafc'; iconColor='#475569'; barColor='#64748b'; borderL='#64748b';
  }

  // strip leading emoji for main text
  const cleanText = m.replace(/^\p{Emoji}+\s*/u,'').trim();
  // split first line as title, rest as subtitle
  const lines = cleanText.split(/[·|·]|(?<=\S{6,})\s{2,}/);
  const title = lines[0]?.trim() || cleanText;
  const sub   = lines.slice(1).join(' ').trim();

  // ── build DOM ───────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.className = '_ntf-overlay';

  const box = document.createElement('div');
  box.className = '_ntf-box';
  box.style.borderLeft = '4px solid '+borderL;
  box.innerHTML = `
    <div class="_ntf-inner">
      <div class="_ntf-icon-wrap" style="background:${iconBg};color:${iconColor}">${icon}</div>
      <div class="_ntf-text">
        <div class="_ntf-title">${title}</div>
        ${sub ? '<div class="_ntf-sub">'+sub+'</div>' : ''}
      </div>
      <button class="_ntf-close" title="ปิด">✕</button>
    </div>
    <div class="_ntf-bar"><div class="_ntf-bar-fill" style="background:${barColor};--dur:${dur/1000}s"></div></div>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // ── close logic ─────────────────────────────────────────────
  const close = () => {
    box.style.animation = '_ntfOut .3s cubic-bezier(.4,0,1,1) forwards';
    overlay.style.pointerEvents = 'none';
    setTimeout(() => { if(overlay.parentNode) overlay.remove(); }, 300);
  };
  box.querySelector('._ntf-close').addEventListener('click', e => { e.stopPropagation(); close(); });
  box.addEventListener('click', close);
  setTimeout(close, dur);
}

// ===== QUARTER FILTER =====
function _showLoginSuccess(name, position, dept, isOffline=false) {
  // ── inject styles once ──
  if (!document.getElementById('_wlcSt')) {
    const s = document.createElement('style');
    s.id = '_wlcSt';
    s.textContent = `
      @keyframes _wlcOverlayIn { from{opacity:0} to{opacity:1} }
      @keyframes _wlcOverlayOut { from{opacity:1} to{opacity:0} }
      @keyframes _wlcCardIn {
        0%  { opacity:0; transform:translateY(32px) scale(.94) }
        65% { transform:translateY(-6px) scale(1.01) }
        100%{ opacity:1; transform:translateY(0) scale(1) }
      }
      @keyframes _wlcCardOut {
        0%  { opacity:1; transform:scale(1) }
        100%{ opacity:0; transform:scale(.9) translateY(20px) }
      }
      @keyframes _wlcShimmer {
        0%  { background-position:200% center }
        100%{ background-position:-200% center }
      }
      @keyframes _wlcPulse {
        0%,100%{ box-shadow:0 0 0 0 rgba(34,197,94,.4) }
        50%    { box-shadow:0 0 0 10px rgba(34,197,94,0) }
      }
      @keyframes _wlcBar { from{width:0} to{width:100%} }
      ._wlc-overlay {
        position:fixed;inset:0;z-index:99999;
        display:flex;align-items:center;justify-content:center;
        background:rgba(15,23,42,.55);
        backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);
        animation:_wlcOverlayIn .3s ease forwards;
      }
      ._wlc-card {
        background:#fff;
        border-radius:20px;
        box-shadow:0 24px 64px rgba(0,0,0,.22),0 4px 16px rgba(0,0,0,.1);
        width:340px;
        overflow:hidden;
        animation:_wlcCardIn .45s cubic-bezier(.22,.68,0,1.15) forwards;
        font-family:'Sarabun',sans-serif;
      }
      ._wlc-header {
        padding:28px 24px 20px;
        background:linear-gradient(135deg,#0f4c81 0%,#1a6bb0 50%,#0d7a4e 100%);
        background-size:200% auto;
        animation:_wlcShimmer 3s linear infinite;
        text-align:center;position:relative;
      }
      ._wlc-avatar {
        width:64px;height:64px;border-radius:50%;
        background:rgba(255,255,255,.2);
        border:3px solid rgba(255,255,255,.6);
        display:flex;align-items:center;justify-content:center;
        font-size:26px;font-weight:700;color:#fff;
        margin:0 auto 12px;
        animation:_wlcPulse 2s ease infinite;
      }
      ._wlc-greeting { font-size:13px;color:rgba(255,255,255,.8);margin-bottom:4px;letter-spacing:.3px; }
      ._wlc-name { font-size:18px;font-weight:700;color:#fff;line-height:1.3; }
      ._wlc-body { padding:20px 24px 8px; }
      ._wlc-row {
        display:flex;align-items:center;gap:10px;
        padding:10px 14px;border-radius:10px;
        background:#f8fafc;border:1px solid #e2e8f0;
        margin-bottom:8px;
      }
      ._wlc-row-icon { font-size:18px;flex-shrink:0; }
      ._wlc-row-label { font-size:10.5px;color:#94a3b8;margin-bottom:1px; }
      ._wlc-row-val { font-size:13.5px;font-weight:600;color:#1e293b;line-height:1.3; }
      ._wlc-offline {
        margin:0 24px 12px;padding:7px 12px;border-radius:8px;
        background:#fffbeb;border:1px solid #fde68a;
        font-size:11.5px;color:#92400e;text-align:center;
      }
      ._wlc-footer { padding:0 24px 20px;margin-top:4px; }
      ._wlc-btn {
        width:100%;padding:11px;border:none;border-radius:10px;
        background:linear-gradient(135deg,#0f4c81,#1a6bb0);
        color:#fff;font-size:14px;font-weight:600;
        font-family:'Sarabun',sans-serif;cursor:pointer;
        transition:opacity .15s,transform .15s;
      }
      ._wlc-btn:hover { opacity:.9;transform:translateY(-1px); }
      ._wlc-progress { height:3px;background:#f1f5f9; }
      ._wlc-progress-fill {
        height:100%;background:linear-gradient(90deg,#0f4c81,#22c55e);
        animation:_wlcBar var(--d,3.5s) linear forwards;
      }
    `;
    document.head.appendChild(s);
  }

  const initial = (name||'?').replace(/^(นาย|นาง|นางสาว|ดร\.?|ศ\.?|รศ\.?|ผศ\.?|พญ\.?|นพ\.?|ว่าที่)\s*/,'').trim().charAt(0).toUpperCase();
  const dur = 3800;

  const overlay = document.createElement('div');
  overlay.className = '_wlc-overlay';

  const posRow = position ? `
    <div class="_wlc-row">
      <div class="_wlc-row-icon">💼</div>
      <div><div class="_wlc-row-label">ตำแหน่ง</div><div class="_wlc-row-val">${position}</div></div>
    </div>` : '';
  const deptRow = dept ? `
    <div class="_wlc-row">
      <div class="_wlc-row-icon">🏢</div>
      <div><div class="_wlc-row-label">สังกัด</div><div class="_wlc-row-val">${dept}</div></div>
    </div>` : '';
  const offlineBadge = isOffline ? '<div class="_wlc-offline">⚠️ ใช้ข้อมูลในเครื่อง (ไม่ได้เชื่อมต่อเซิร์ฟเวอร์)</div>' : '';

  overlay.innerHTML = `
    <div class="_wlc-card">
      <div class="_wlc-header">
        <div class="_wlc-avatar">${initial}</div>
        <div class="_wlc-greeting">ยินดีต้อนรับเข้าสู่ระบบ</div>
        <div class="_wlc-name">${name}</div>
      </div>
      <div class="_wlc-body">
        ${posRow}${deptRow}
      </div>
      ${offlineBadge}
      <div class="_wlc-footer">
        <button class="_wlc-btn" id="_wlcCloseBtn">เข้าสู่ระบบ →</button>
      </div>
      <div class="_wlc-progress"><div class="_wlc-progress-fill" style="--d:${dur/1000}s"></div></div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => {
    overlay.style.animation = '_wlcOverlayOut .3s ease forwards';
    overlay.querySelector('._wlc-card').style.animation = '_wlcCardOut .3s ease forwards';
    setTimeout(() => { if(overlay.parentNode) overlay.remove(); }, 300);
  };

  overlay.querySelector('#_wlcCloseBtn').addEventListener('click', close);
  overlay.addEventListener('click', e => { if(e.target === overlay) close(); });
  setTimeout(close, dur);
}

function getFilteredProjects() {
  if (currentQuarter==='all') return projects;
  return projects.filter(p => p.quarter===currentQuarter || p.quarter==='all');
}

function onQuarterChange() {
  currentQuarter = document.getElementById('quarterSelect').value;
  const qL = Q_LABEL[currentQuarter];
  document.getElementById('quarterLabel').textContent = 'แสดงข้อมูล: '+qL;
  document.getElementById('quarterBadge').textContent = qL;
  document.getElementById('summaryQuarterLabel').textContent = qL+' · ปีงบประมาณ พ.ศ. '+currentYear;
  const qbEl=document.getElementById('quarterBadge');
  if(qbEl) qbEl.textContent='ปีงบ '+currentYear+(currentQuarter!=='all'?' Q'+currentQuarter:'');
  document.getElementById('sidebar-footer') && (document.getElementById('sidebar-footer').textContent = qL);
  updateDashboard();
}

// ===== STORAGE =====
function saveToLocal(silent) {
  try {
    localStorage.setItem('dltv_projects_2570_v2', JSON.stringify(projects));
    if(!silent) showToast('💾 บันทึกข้อมูลแล้ว');
  } catch(e){}
}
function loadFromLocal() {
  try {
    const d = localStorage.getItem('dltv_projects_2570_v2');
    if(d){
      const p = JSON.parse(d);
      if(Array.isArray(p) && p.length > 0){
        projects = p;
        return true;
      }
    }
  } catch(e){ console.warn('loadFromLocal error:', e); }
  return false;
}
function resetToDefault() {
  if(!confirm('ยืนยันการรีเซ็ตข้อมูลทั้งหมด?\nโครงการทั้งหมดในปี 2570 จะถูกลบออกจาก Browser นี้')) return;
  try{ localStorage.removeItem('dltv_projects_2570_v2'); }catch(e){}
  location.reload();
}

// ── รวมข้อมูล "ผลการดำเนินงาน" (Sheet: ReportResult) เข้ากับโครงการ (Sheet: Project70) ──
// ตั้งค่า default ให้โครงการที่ยังไม่เคยมีการรายงานผล (ไม่มีแถวใน ReportResult) เพื่อไม่ให้ค่า undefined
const REPORT_DEFAULTS = { status:'pending', quarter:'all', spent:0, po:0, result:'', problems:'', solutions:'', images:[], lastEditedBy:'', lastEditedByPosition:'', lastEditedAt:'' };
function mergeReportsIntoProjects(projArr, reportRows){
  const byId = {};
  (reportRows||[]).forEach(r=>{ byId[String(r.id)] = r; });
  return (projArr||[]).map(p=>{
    const r = byId[String(p.id)];
    return { ...p, ...REPORT_DEFAULTS, ...(r||{}) };
  });
}
function fetchAllReports(){
  return fetch(`${_gasUrl}?action=getAllReport`, { redirect:'follow' })
    .then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
    .then(res=> (res && res.success) ? (res.data||[]) : [])
    .catch(()=>[]);
}

// ===== NAVIGATION =====
function showPage(page, strategyFilter, navEl) {
  ['dashboard','projects','gsheet','gantt','actlog','risk','report'].forEach(p => {
    const el = document.getElementById('page-'+p);
    if (el) el.style.display = p===page ? 'block' : 'none';
  });
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
  const activeEl = navEl || (typeof event !== 'undefined' && event && event.currentTarget) || null;
  if(activeEl) activeEl.classList.add('active');

  const titles = {
    dashboard: ['Dashboard สรุปภาพรวม','รายงานแผนปฏิบัติการประจำปี งบประมาณ พ.ศ. '+currentYear],
    projects:  ['รายการโครงการ','โครงการทั้งหมด 5 ยุทธศาสตร์'],
    gsheet:    ['Google Sheets','นำเข้า / ส่งออกข้อมูล'],
    gantt:     ['แผน Gantt Chart','ระยะเวลาดำเนินงานโครงการ ปีงบประมาณ พ.ศ. '+currentYear],
    actlog:    ['ประวัติการแก้ไข','บันทึกการเพิ่ม / แก้ไข / ลบโครงการ'],
    risk:      ['บริหารความเสี่ยง (PRM)','แบบประเมินและบริหารความเสี่ยงของโครงการ ปีงบประมาณ พ.ศ. '+currentYear],
    report:    ['รายงานผลการดำเนินงาน','เลือกโครงการที่กรอกไว้แล้ว เพื่ออัปเดตสถานะและผลการดำเนินงาน']
  };
  if(titles[page]){
    document.getElementById('topbar-title').textContent=titles[page][0];
    document.getElementById('topbar-sub').textContent=titles[page][1];
  }

  if(page==='dashboard') updateDashboard();
  if(page==='gantt') renderGantt();
  if(page==='actlog') renderActlog();
  if(page==='risk') initRiskPageWithSync();
  if(page==='report') openReportPage();
  if(page==='projects'){
    if(strategyFilter!==undefined) document.getElementById('filterStrategy').value=strategyFilter;
    currentPage=1; renderTable();
  }
}

function filterByCommittee(comKey) {
  showPage('projects');
  setTimeout(() => {
    // กรอง dropdown ยุทธศาสตร์ทั้งหมด แล้วค้นหาด้วยชื่ออนุกรรมการ
    const filterEl = document.getElementById('strategyFilter');
    if (filterEl) { filterEl.value = ''; }
    const searchEl = document.getElementById('searchInput');
    // หาชื่ออนุกรรมการจาก COM_LIST
    const com = [...COM_LIST, COM_UNASSIGNED].find(c => c.key === comKey);
    if (searchEl && com && comKey !== 'unassigned') {
      searchEl.value = com.label;
      searchEl.dispatchEvent(new Event('input'));
    } else if (searchEl) {
      searchEl.value = '';
      searchEl.dispatchEvent(new Event('input'));
    }
    renderTable();
  }, 100);
}

function filterByStatus(status) {
  document.getElementById('filterStatus').value=status;
  renderTable();
}

function goToStrategy(s) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.remove('active');
    if(el.getAttribute('onclick') && el.getAttribute('onclick').includes("'projects'")) el.classList.add('active');
  });
  showPage('projects', s);
}

// ===== DASHBOARD =====
function updateDashboard() {
  // ── อัปเดต Year Banner และ theme ────────────────────────────────
  const is2570 = currentYear === 2570;
  // body theme class
  document.body.classList.toggle('year-2570', is2570);
  // year banner
  const banner = document.getElementById('yearBanner');
  if(banner) banner.className = 'year-banner ' + (is2570?'banner-2570':'banner-2569');
  const bannerNum = document.getElementById('yearBannerNum');
  if(bannerNum){ bannerNum.textContent = currentYear; bannerNum.className = 'year-banner-year'+(is2570?' y2570':''); }
  // year labels ทั่ว dashboard
  ['budgetBarYear','summaryQuarterLabel','committeeQuarterLabel'].forEach(id=>{
    const el = document.getElementById(id);
    if(el && el.id==='budgetBarYear') el.textContent = currentYear;
  });
  // summaryQuarterLabel (full text)
  const sqlEl = document.getElementById('summaryQuarterLabel');
  if(sqlEl) sqlEl.textContent = 'ปีงบประมาณ พ.ศ. '+currentYear;
  const cqlEl = document.getElementById('committeeQuarterLabel');
  if(cqlEl) cqlEl.textContent = 'ปีงบประมาณ พ.ศ. '+currentYear;
  // quarterBadge
  const qb = document.getElementById('quarterBadge');
  if(qb) qb.textContent = 'ปีงบ '+currentYear + (currentQuarter!=='all'?' Q'+currentQuarter:'');
  // ─────────────────────────────────────────────────────────────────

  const fp = getFilteredProjects();
  const done = fp.filter(p=>p.status==='done').length;
  const prog = fp.filter(p=>p.status==='progress').length;
  const pend = fp.filter(p=>p.status==='pending').length;
  const tb   = fp.reduce((s,p)=>s+(p.budget||0),0);
  const totalSpent  = fp.reduce((s,p)=>s+(p.spent||0),0);
  const totalPo     = fp.reduce((s,p)=>s+(p.po||0),0);
  const totalPlan   = totalSpent + totalPo;
  const totalRemaining = tb - totalSpent - totalPo;
  const spentPct = tb>0?Math.round(totalSpent/tb*100):0;
  const planPct  = tb>0?Math.round(totalPlan/tb*100):0;
  const remPct   = tb>0?Math.round((tb-totalSpent)/tb*100):100;

  document.getElementById('m-total').textContent = fp.length;
  document.getElementById('m-total-sub').textContent = `${S_KEYS.length} ยุทธศาสตร์`;
  document.getElementById('m-budget').textContent = fmtFull(tb);
  document.getElementById('m-spent').textContent  = fmtFull(totalSpent);
  document.getElementById('m-spent-sub').textContent = `คิดเป็น ${spentPct}% ของงบรวม`;
  document.getElementById('m-spent-bar').style.width = Math.min(spentPct,100)+'%';
  document.getElementById('m-remaining').textContent = fmtFull(tb-totalSpent);
  document.getElementById('m-remaining-sub').textContent = `คิดเป็น ${remPct}% ของงบรวม`;
  document.getElementById('m-remaining-bar').style.width = Math.min(remPct,100)+'%';
  document.getElementById('m-plan').textContent = fmtFull(totalPlan);
  document.getElementById('m-plan-sub').textContent = `คิดเป็น ${planPct}% ของงบรวม`;
  document.getElementById('m-plan-bar').style.width = Math.min(planPct,100)+'%';
  document.getElementById('m-po').textContent = fmtFull(totalPo);
  document.getElementById('m-net-remaining').textContent = fmtFull(totalRemaining);

  document.getElementById('p-done').textContent = done;
  document.getElementById('p-progress').textContent = prog;
  document.getElementById('p-pending').textContent = pend;

  renderBudgetBar(fp, tb, totalSpent, totalPo, totalRemaining);
  renderAllocatedBudgetCard(fp);
  renderStrategyCards(fp);
  renderSummaryTable(fp);
  renderCommitteeSection(fp);
  requestAnimationFrame(()=>{ renderCharts(fp); renderUtilizationChart(fp); renderCommitteeChart(fp); });
}

function renderBudgetBar(fp, tb, ts, tp, rem) {
  const bar = document.getElementById('budgetMegaBar');
  const leg = document.getElementById('budgetBarLegend');
  const qEl = document.getElementById('budgetBarQuarter');
  if(qEl) qEl.textContent = Q_LABEL[currentQuarter];
  if(!bar) return;
  const spentPct  = tb>0 ? Math.max((ts/tb)*100, 0) : 0;
  const poPct     = tb>0 ? Math.max((tp/tb)*100, 0) : 0;
  const remPct    = tb>0 ? Math.max((Math.max(rem,0)/tb)*100, 0) : 100;
  bar.innerHTML = `
    <div style="width:${spentPct.toFixed(1)}%;background:linear-gradient(90deg,#059669,#34c179);transition:width .6s;min-width:${spentPct>0?2:0}px" title="ใช้ไปแล้ว ${spentPct.toFixed(1)}%"></div>
    <div style="width:${poPct.toFixed(1)}%;background:linear-gradient(90deg,#d97706,#f59e0b);transition:width .6s;min-width:${poPct>0?2:0}px" title="PO ผูกพัน ${poPct.toFixed(1)}%"></div>
    <div style="flex:1;background:var(--surface2)"></div>
  `;
  const usedTotal = ts + tp;
  const usedPct = tb>0?((usedTotal/tb)*100).toFixed(1):0;
  leg.innerHTML = `
    <span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:3px;background:linear-gradient(90deg,#059669,#34c179);display:inline-block"></span>ใช้ไปแล้ว <strong>${fmtFull(ts)} บาท</strong> (${spentPct.toFixed(1)}%)</span>
    <span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:3px;background:linear-gradient(90deg,#d97706,#f59e0b);display:inline-block"></span>PO ผูกพัน <strong>${fmtFull(tp)} บาท</strong> (${poPct.toFixed(1)}%)</span>
    <span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:3px;background:var(--surface2);border:1px solid var(--border2);display:inline-block"></span>คงเหลือ <strong style="color:${rem<0?'var(--red)':'var(--text)'}">${fmtFull(rem)} บาท</strong> (${remPct.toFixed(1)}%)</span>
    <span style="margin-left:auto;font-weight:700;color:var(--accent)">รวมเบิกจ่าย+PO: ${usedPct}% จากงบ ${fmtFull(tb)} บาท</span>
  `;
}

// ── การ์ดเปรียบเทียบ: งบประมาณที่ได้รับจัดสรร vs ยอดรวมงบประมาณที่กรอกตามยุทธศาสตร์ ──
function renderAllocatedBudgetCard(fp) {
  const el = document.getElementById('allocatedBudgetCard');
  if (!el) return;
  const allocated = getAllocatedBudget();
  const entered = fp.reduce((a,p)=>a+(p.budget||0),0);
  const diff = allocated - entered;
  const usedPct = allocated>0 ? Math.round(entered/allocated*100) : 0;
  const usedPctClamped = Math.min(Math.max(usedPct,0),100);
  const over = diff < 0;
  const diffLabel = over ? 'เกินวงเงินที่ได้รับจัดสรร' : 'คงเหลือ (ยังไม่จัดทำโครงการ)';
  const statusColor = over ? 'var(--red)' : (usedPct>=90 ? 'var(--amber)' : 'var(--green)');
  const statusBg    = over ? 'rgba(220,38,38,.1)' : (usedPct>=90 ? 'rgba(217,119,6,.1)' : 'rgba(5,150,105,.1)');
  const statusText  = over ? '⚠️ เกินวงเงินจัดสรร' : (usedPct>=90 ? '⏳ ใกล้เต็มวงเงิน' : '✅ อยู่ในวงเงินจัดสรร');
  const diffIcon = over
    ? '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'
    : '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>';

  el.innerHTML = `
  <div class="card" style="margin-bottom:0">
    <div class="card-header" style="flex-wrap:wrap;gap:.5rem">
      <span class="card-title">💼 งบประมาณตามยุทธศาสตร์ เทียบกับงบที่ได้รับจัดสรร</span>
      <div style="display:flex;align-items:center;gap:8px;margin-left:auto">
        <span style="font-size:11px;font-weight:700;padding:4px 11px;border-radius:99px;background:${statusBg};color:${statusColor}">${statusText}</span>
        <button class="btn btn-sm" style="font-size:11px;padding:4px 10px" onclick="openAllocatedBudgetModal()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:4px;vertical-align:-1px"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82A1.65 1.65 0 0 0 3 13.09H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>ตั้งค่างบจัดสรร
        </button>
      </div>
    </div>
    <div class="card-body" style="padding:1rem 1.25rem">
      <div class="metrics-mid" style="margin-bottom:14px">
        <div class="metric-card c-blue-deep">
          <div class="metric-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg></div>
          <div class="metric-label">งบที่ได้รับจัดสรรประจำปี</div>
          <div class="metric-value">${fmtFull(allocated)}</div>
          <div class="metric-sub">บาท · ปีงบประมาณ พ.ศ. ${currentYear}</div>
        </div>
        <div class="metric-card c-amber-deep">
          <div class="metric-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div>
          <div class="metric-label">ยอดรวมงบที่กรอกเข้าระบบ</div>
          <div class="metric-value">${fmtFull(entered)}</div>
          <div class="metric-sub">บาท · คิดเป็น ${usedPct}% ของงบจัดสรร</div>
          <div class="metric-progress"><div class="metric-progress-track"><div class="metric-progress-fill" style="width:${usedPctClamped}%;background:${over?'#b91c1c':'#b26e07'}"></div></div></div>
        </div>
        <div class="metric-card ${over?'c-red-deep':'c-green-deep'}">
          <div class="metric-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${diffIcon}</svg></div>
          <div class="metric-label">${diffLabel}</div>
          <div class="metric-value">${fmtFull(Math.abs(diff))}</div>
          <div class="metric-sub">บาท</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <span style="font-size:11.5px;font-weight:600;color:var(--text2)">สัดส่วนงบที่กรอกแล้ว เทียบกับวงเงินจัดสรรทั้งหมด</span>
        <span style="font-size:11.5px;font-weight:700;color:${over?'var(--red)':'var(--text)'}">${usedPct}%</span>
      </div>
      <div style="height:14px;border-radius:99px;overflow:hidden;background:var(--surface2)">
        <div style="height:100%;width:${usedPctClamped}%;background:linear-gradient(90deg,${over?'#b91c1c,#dc2626':'#1d3f9e,#2554c7'});border-radius:99px;transition:width .6s"></div>
      </div>
    </div>
  </div>`;
}

function renderStrategyCards(fp) {
  const el = document.getElementById('strategy-summary-top');
  if (!el) return;

  const S_BG     = {'1':'rgba(59,114,240,.08)','2':'rgba(5,150,105,.08)','3':'rgba(217,119,6,.08)','4':'rgba(139,92,246,.08)','5':'rgba(107,114,128,.08)'};
  const S_BORDER = {'1':'rgba(59,114,240,.28)','2':'rgba(5,150,105,.28)','3':'rgba(217,119,6,.28)','4':'rgba(139,92,246,.28)','5':'rgba(107,114,128,.28)'};

  const cards = S_KEYS.map(s => {
    const ps     = fp.filter(p => p.strategy == s);
    const budget = ps.reduce((a,p) => a+(p.budget||0), 0);
    const spent  = ps.reduce((a,p) => a+(p.spent||0),  0);
    const po     = ps.reduce((a,p) => a+(p.po||0),     0);
    const rem    = budget - spent - po;
    const pct    = budget > 0 ? Math.round((spent+po)/budget*100) : 0;
    const done   = ps.filter(p=>p.status==='done').length;
    const prog   = ps.filter(p=>p.status==='progress').length;
    const pend   = ps.filter(p=>p.status==='pending').length;
    const barCol = pct>=90?'var(--red)':pct>=70?'var(--amber)':S_COLORS[s];
    const remCol = rem<0?'var(--red)':'var(--green)';
    return `<div onclick="goToStrategy('${s}')"
      style="background:${S_BG[s]};border:1.5px solid ${S_BORDER[s]};border-radius:14px;padding:14px 16px;cursor:pointer;transition:all .18s;position:relative;overflow:hidden"
      onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 24px rgba(0,0,0,.1)'"
      onmouseout="this.style.transform='';this.style.boxShadow=''">
      <div style="position:absolute;top:0;left:0;width:4px;height:100%;background:${S_COLORS[s]};border-radius:14px 0 0 14px"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;padding-left:6px">
        <span class="badge ${S_BADGE[s]}" style="font-size:10px">${S_NAMES[s]}</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${S_COLORS[s]}" stroke-width="2.5" style="opacity:.5;flex-shrink:0"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
      <div style="font-size:11.5px;font-weight:700;color:var(--text);line-height:1.35;margin-bottom:8px;padding-left:6px">${S_FULL[s]}</div>
      <div style="display:flex;align-items:flex-end;gap:4px;margin-bottom:2px;padding-left:6px">
        <span style="font-size:26px;font-weight:800;color:${S_COLORS[s]};line-height:1">${ps.length}</span>
        <span style="font-size:11px;color:var(--text2);margin-bottom:3px;font-weight:600">โครงการ</span>
      </div>
      <div style="font-size:12px;color:var(--text2);font-weight:600;padding-left:6px;margin-bottom:7px">${fmtFull(budget)} บาท</div>
      <div style="height:4px;background:rgba(0,0,0,.08);border-radius:99px;overflow:hidden;margin-bottom:5px">
        <div style="height:100%;width:${Math.min(pct,100)}%;background:${barCol};border-radius:99px;transition:width .5s"></div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;font-size:10.5px;padding-left:4px">
        <div style="display:flex;gap:7px">
          <span style="color:var(--green)">✅ ${done}</span>
          <span style="color:var(--accent)">⏳ ${prog}</span>
          <span style="color:var(--text3)">⭕ ${pend}</span>
        </div>
        <span style="color:${barCol};font-weight:700">${pct}%</span>
      </div>
      <div style="font-size:10.5px;color:var(--text3);margin-top:5px;padding-left:4px">
        คงเหลือ <strong style="color:${remCol}">${fmtFull(rem)}</strong> บาท
      </div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:14px 16px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        <span style="font-size:15px">🎯</span>
        <span style="font-size:14px;font-weight:700">สรุปตามยุทธศาสตร์</span>
        <span style="font-size:11px;color:var(--text3);margin-left:auto">คลิกที่การ์ดเพื่อดูโครงการ →</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px">${cards}</div>
    </div>`;
}

function renderCharts(fp) {
  const budgets = S_KEYS.map(s=>fp.filter(p=>p.strategy==s).reduce((a,p)=>a+(p.budget||0),0));
  const colors  = S_KEYS.map(s=>S_COLORS[s]);
  const chartFont = { family: "'Sarabun', sans-serif", size: 11 };
  const tb = fp.reduce((a,p)=>a+(p.budget||0),0);

  // helper: safely get a fresh canvas by replacing it
  function freshCanvas(id) {
    const old = document.getElementById(id);
    if(!old) return null;
    const parent = old.parentNode;
    const clone = document.createElement('canvas');
    clone.id = id;
    parent.replaceChild(clone, old);
    return clone;
  }

  // ── Doughnut: Budget by strategy ──
  chartBudget = new Chart(freshCanvas('chartBudget'),{
    type:'doughnut',
    data:{
      labels: S_KEYS.map(s=>S_NAMES[s]),
      datasets:[{
        data: budgets, backgroundColor: colors,
        borderWidth: 4, borderColor:'#fff',
        hoverOffset: 10, hoverBorderWidth: 0
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      cutout:'70%',
      plugins:{
        legend:{display:false},
        tooltip:{
          backgroundColor:'rgba(28,35,51,.92)', padding:10, cornerRadius:8,
          callbacks:{ label:ctx=>`  ${fmtFull(ctx.parsed)} บาท  (${tb>0?Math.round(ctx.parsed/tb*100):0}%)` },
          bodyFont:chartFont, titleFont:{...chartFont,weight:'700'}
        }
      },
      animation:{ animateRotate:true, duration:700 }
    }
  });
  const centerEl = document.getElementById('chartBudgetCenter');
  if(centerEl) centerEl.innerHTML = `<div style="font-size:10px;color:var(--text3);font-weight:600">งบรวม</div><div style="font-size:15px;font-weight:800;color:var(--text);margin-top:1px">${fmtFull(tb)}</div><div style="font-size:9px;color:var(--text3)">บาท</div>`;

  const leg = document.getElementById('chartBudgetLegend');
  if(leg) leg.innerHTML = S_KEYS.map((s,i)=>`
    <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
      <div style="display:flex;align-items:center;gap:6px">
        <span style="width:8px;height:8px;border-radius:50%;background:${colors[i]};flex-shrink:0;display:inline-block"></span>
        <span style="font-size:12px;color:var(--text2)">${S_NAMES[s]}</span>
      </div>
      <span style="font-weight:700;color:var(--text);font-size:14px">${fmtFull(budgets[i])}</span>
    </div>`).join('');

  // ── Bar: Project status ──
  const done=fp.filter(p=>p.status==='done').length;
  const prog=fp.filter(p=>p.status==='progress').length;
  const pend=fp.filter(p=>p.status==='pending').length;

  chartStatus = new Chart(freshCanvas('chartStatus'),{
    type:'bar',
    data:{
      labels:['แล้วเสร็จ','กำลังดำเนิน','ยังไม่เริ่ม'],
      datasets:[{
        data:[done,prog,pend],
        backgroundColor:['rgba(132,177,121,.8)','rgba(229,186,65,.8)','rgba(255,147,126,.8)'],
        borderColor:['#A2CB8B','#F08787','#6D94C5'],
        borderWidth:0, borderRadius:10, borderSkipped:false,
        hoverBackgroundColor:['rgba(26,154,92,0.3)','rgba(59,114,240,0.3)','rgba(154,163,178,0.3)']
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{
          backgroundColor:'rgba(28,35,51,.92)', padding:10, cornerRadius:8,
          callbacks:{ label:ctx=>`  ${ctx.parsed.y} โครงการ` },
          bodyFont:chartFont, titleFont:{...chartFont,weight:'700'}
        }
      },
      scales:{
        x:{ grid:{display:false}, ticks:{font:chartFont,color:'#5a6477'}, border:{display:false} },
        y:{ beginAtZero:true, ticks:{stepSize:1,font:chartFont,color:'#9aa3b2'}, grid:{color:'rgba(0,0,0,.04)'}, border:{display:false} }
      },
      animation:{ duration:600 }
    }
  });
  const sLeg = document.getElementById('statusLegend');
  if(sLeg) sLeg.innerHTML = [
    ['#A2CB8B','✅ แล้วเสร็จ',done],
    ['#E9B63B','⏳ กำลังดำเนิน',prog],
    ['#B77466','⭕ ยังไม่เริ่ม',pend]
  ].map(([c,l,n])=>`<span style="display:flex;align-items:center;gap:4px;font-size:14px;font-weight:600;color:${c}"><span style="width:8px;height:8px;border-radius:50%;background:${c};display:inline-block"></span>${l} <strong>${n}</strong></span>`).join('');

  // ── Doughnut: Budget plan vs remaining (gauge) ──
  const ts = fp.reduce((a,p)=>a+(p.spent||0),0);
  const tp = fp.reduce((a,p)=>a+(p.po||0),0);
  const rem = tb - ts - tp;

  chartBudgetGauge = new Chart(freshCanvas('chartBudgetGauge'),{
    type:'doughnut',
    data:{
      labels:['ใช้ไปแล้ว','PO ผูกพัน','คงเหลือ'],
      datasets:[{
        data:[ts, tp, Math.max(rem, 0)],
        backgroundColor:['rgba(240,135,135,.8)','rgba(222,195,132,.8)','rgba(162,203,139,.8)'],
        borderColor:['#F08787','#DEC384','#A2CB8B'],
        borderWidth:0, hoverOffset:8, hoverBorderWidth:0
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      cutout:'70%',
      plugins:{
        legend:{display:false},
        tooltip:{
          backgroundColor:'rgba(28,35,51,.92)', padding:10, cornerRadius:8,
          callbacks:{ label:ctx=>`  ${fmtFull(ctx.parsed)} บาท` },
          bodyFont:chartFont, titleFont:{...chartFont,weight:'700'}
        }
      },
      animation:{ animateRotate:true, duration:700 }
    }
  });
  const usedPct = tb>0?Math.round((ts+tp)/tb*100):0;
  const gCenter = document.getElementById('chartGaugeCenter');
  if(gCenter) gCenter.innerHTML = `<div style="font-size:14px;color:var(--text3);font-weight:600">เบิกจ่าย+PO</div><div style="font-size:18px;font-weight:800;color:var(--accent);margin-top:1px">${usedPct}%</div><div style="font-size:9px;color:var(--text3)">ของงบรวม</div>`;
  const gLeg = document.getElementById('gaugeLegend');
  if(gLeg) gLeg.innerHTML = [
    ['#F08787','ใช้ไปแล้ว',ts],
    ['#DEC384','PO ผูกพัน',tp],
    ['#A2CB8B','คงเหลือสุทธิ',rem]
  ].map(([c,l,n])=>`<div style="display:flex;align-items:center;justify-content:space-between"><div style="display:flex;align-items:center;gap:5px"><span style="width:8px;height:8px;border-radius:50%;background:${c};flex-shrink:0;display:inline-block"></span><span style="color:var(--text2)">${l}</span></div><span style="font-weight:700;color:${n<0?'var(--red)':'var(--text)'}">${fmtFull(n)} บาท</span></div>`).join('');
}

function totalBudget(fp){ return fp.reduce((a,p)=>a+(p.budget||0),0); }

function renderUtilizationChart(fp) {
  const labels    = S_KEYS.map(s=>S_NAMES[s].replace('ยุทธศาสตร์ที่ ','ย.'));
  const budgets   = S_KEYS.map(s=>fp.filter(p=>p.strategy==s).reduce((a,p)=>a+(p.budget||0),0));
  const spents    = S_KEYS.map(s=>fp.filter(p=>p.strategy==s).reduce((a,p)=>a+(p.spent||0),0));
  const pos       = S_KEYS.map(s=>fp.filter(p=>p.strategy==s).reduce((a,p)=>a+(p.po||0),0));
  const remainings= S_KEYS.map((s,i)=>Math.max(budgets[i]-spents[i]-pos[i],0));
  const spentPOs  = S_KEYS.map((s,i)=>spents[i]+pos[i]);
  const chartFont = { family:"'Sarabun', sans-serif", size:11 };

  const old = document.getElementById('chartUtilization');
  if(old) { const clone=document.createElement('canvas'); clone.id='chartUtilization'; old.parentNode.replaceChild(clone,old); }

  chartUtilization = new Chart(document.getElementById('chartUtilization'),{
    type:'bar',
    data:{
      labels,
      datasets:[
        { label:'งบอนุมัติ',     data:budgets,   backgroundColor:'rgba(109,148,197,.8)', borderColor:'#6D94C5', borderWidth:0, borderRadius:8, borderSkipped:false },
        { label:'ใช้ไปแล้ว+PO', data:spentPOs,  backgroundColor:'rgba(240,135,135,.8)', borderColor:'#F08787', borderWidth:0, borderRadius:8, borderSkipped:false },
        { label:'PO ผูกพัน',    data:pos,        backgroundColor:'rgba(222,195,132,.8)', borderColor:'#DEC384', borderWidth:0, borderRadius:8, borderSkipped:false },
        { label:'คงเหลือ',      data:remainings, backgroundColor:'rgba(162,203,139,.8)', borderColor:'#A2CB8B', borderWidth:0, borderRadius:8, borderSkipped:false }
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ position:'bottom', labels:{ font:chartFont, boxWidth:10, padding:16, usePointStyle:true, pointStyle:'circle' } },
        tooltip:{
          backgroundColor:'rgba(28,35,51,.92)', padding:10, cornerRadius:8,
          callbacks:{
            label:ctx=>` ${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString('th-TH')} บาท`,
            afterBody:ctx=>{
              const i=ctx[0]?.dataIndex; if(i===undefined) return;
              const pct=budgets[i]>0?Math.round(spentPOs[i]/budgets[i]*100):0;
              return [`  เบิกจ่าย+PO: ${pct}% ของงบอนุมัติ`];
            }
          },
          bodyFont:chartFont, titleFont:{...chartFont,weight:'700'}
        }
      },
      scales:{
        x:{ grid:{display:false}, ticks:{font:chartFont,color:'#5a6477'}, border:{display:false} },
        y:{ beginAtZero:true, grid:{color:'rgba(0,0,0,.04)'}, border:{display:false},
            ticks:{ callback:v=>v>=1000000?(v/1000000).toFixed(1)+'M':v>=1000?(v/1000).toFixed(0)+'K':v, font:chartFont, color:'#9aa3b2' } }
      },
      animation:{ duration:600 }
    },
    plugins:[{
      id:'strategyDividers',
      afterDraw(chart){
        const {ctx, chartArea:{top,bottom}, scales:{x}} = chart;
        ctx.save();
        for(let i=0; i<labels.length-1; i++){
          const xPos = (x.getPixelForValue(i) + x.getPixelForValue(i+1)) / 2;
          ctx.beginPath();
          ctx.moveTo(xPos, top - 8);
          ctx.lineTo(xPos, bottom);
          ctx.setLineDash([5,4]);
          ctx.strokeStyle = 'rgba(90,100,120,0.25)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ctx.restore();
      }
    }]
  });
}

function renderSummaryTable(fp) {
  const el = document.getElementById('summaryTableBody'); if(!el) return;
  const rows = S_KEYS.map(s=>{
    const ps = fp.filter(p=>p.strategy==s);
    const budget = ps.reduce((a,p)=>a+(p.budget||0),0);
    const spent  = ps.reduce((a,p)=>a+(p.spent||0),0);
    const po     = ps.reduce((a,p)=>a+(p.po||0),0);
    const remaining = budget-spent-po;
    const pct = budget>0?Math.round((spent+po)/budget*100):0;
    const done=ps.filter(p=>p.status==='done').length;
    const prog=ps.filter(p=>p.status==='progress').length;
    const pend=ps.filter(p=>p.status==='pending').length;
    return `<tr>
      <td><span class="badge ${S_BADGE[s]}">${S_NAMES[s]}</span><div style="font-size:11px;color:var(--text3);margin-top:2px">${S_FULL[s]}</div></td>
      <td style="text-align:center">${ps.length}</td>
      <td class="td-num">${fmtFull(budget)}</td>
      <td class="td-num">${fmtFull(spent)}</td>
      <td class="td-num">${fmtFull(po)}</td>
      <td class="td-num" style="${remaining<0?'color:var(--red)':''}">${fmtFull(remaining)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:7px">
          <div style="flex:1;height:5px;background:var(--surface2);border-radius:99px;overflow:hidden">
            <div style="height:100%;width:${Math.min(pct,100)}%;background:${S_COLORS[s]};border-radius:99px"></div>
          </div>
          <span style="font-size:11px;color:var(--text2);min-width:30px;text-align:right">${pct}%</span>
        </div>
      </td>
      <td style="text-align:center;font-size:12px">
        <span style="color:var(--green);margin-right:4px">✅${done}</span>
        <span style="color:var(--accent);margin-right:4px">⏳${prog}</span>
        <span style="color:var(--text3)">○${pend}</span>
      </td>
    </tr>`;
  });
  // Total
  const tb = fp.reduce((a,p)=>a+(p.budget||0),0);
  const ts = fp.reduce((a,p)=>a+(p.spent||0),0);
  const tp = fp.reduce((a,p)=>a+(p.po||0),0);
  const tr2 = tb-ts-tp;
  const tpct = tb>0?Math.round((ts+tp)/tb*100):0;
  rows.push(`<tr style="background:var(--surface2);font-weight:700">
    <td>รวมทั้งหมด (${S_KEYS.length} ยุทธศาสตร์)</td>
    <td style="text-align:center">${fp.length}</td>
    <td class="td-num">${fmtFull(tb)}</td>
    <td class="td-num">${fmtFull(ts)}</td>
    <td class="td-num">${fmtFull(tp)}</td>
    <td class="td-num" style="${tr2<0?'color:var(--red)':''}">${fmtFull(tr2)}</td>
    <td>
      <div style="display:flex;align-items:center;gap:7px">
        <div style="flex:1;height:5px;background:var(--border2);border-radius:99px;overflow:hidden">
          <div style="height:100%;width:${Math.min(tpct,100)}%;background:var(--accent);border-radius:99px"></div>
        </div>
        <span style="font-size:11px;color:var(--text2);min-width:30px;text-align:right">${tpct}%</span>
      </div>
    </td>
    <td style="text-align:center;font-size:12px">
      <span style="color:var(--green);margin-right:4px">✅${fp.filter(p=>p.status==='done').length}</span>
      <span style="color:var(--accent);margin-right:4px">⏳${fp.filter(p=>p.status==='progress').length}</span>
      <span style="color:var(--text3)">○${fp.filter(p=>p.status==='pending').length}</span>
    </td>
  </tr>`);
  el.innerHTML = rows.join('');
}

// ===== TABLE =====
function renderTable() {
  const filtered = getFiltered();
  const total=filtered.length;
  const pages=Math.max(1,Math.ceil(total/PAGE_SIZE));
  if(currentPage>pages) currentPage=pages;
  const start=(currentPage-1)*PAGE_SIZE;
  const slice=filtered.slice(start,start+PAGE_SIZE);
  const tbody=document.getElementById('tableBody');
  if(!slice.length){
    tbody.innerHTML=`<tr><td colspan="11"><div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <p>ไม่พบโครงการที่ค้นหา</p></div></td></tr>`;
  } else {
    tbody.innerHTML = slice.map((p,i)=>{
      const budget   = p.budget||0;
      const spent    = p.spent||0;
      const po       = p.po||0;
      const usedTotal= spent + po;
      const remaining= budget - usedTotal;
      const usedPct  = budget>0 ? Math.min(Math.round(usedTotal/budget*100),100) : 0;
      const kpiCount = (p.kpi||[]).length;
      const barColor = usedPct>=90?'var(--red)': usedPct>=70?'var(--amber)': 'var(--green)';
      return `<tr class="data-row" onclick="openDetail(${p.id})">
        <td style="color:var(--text3);text-align:center;font-size:12px;width:32px">${start+i+1}</td>
        <td class="td-name">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span style="user-select:text">${p.name.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>
            ${p.quarter&&p.quarter!=='all'?`<span style="font-size:10px;background:var(--accent-light);color:var(--accent);padding:1px 6px;border-radius:4px;font-weight:600;flex-shrink:0">Q${p.quarter}</span>`:''}
          </div>
        </td>
        <td><span class="badge ${S_BADGE[p.strategy]}">${S_NAMES[p.strategy]}</span></td>
        <td class="td-num" style="font-weight:600">${fmtFull(budget)}</td>
        <td class="td-num" style="color:var(--green)">${fmtFull(spent)}</td>
        <td class="td-num" style="color:var(--amber)">${po>0?fmtFull(po):'<span style="color:var(--text3)">—</span>'}</td>
        <td class="td-num">
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px">
            <span style="font-weight:700;color:${usedPct>=90?'var(--red)':'var(--text)'}">${fmtFull(usedTotal)}</span>
            <div style="width:64px;height:4px;background:var(--surface2);border-radius:99px;overflow:hidden">
              <div style="height:100%;width:${usedPct}%;background:${barColor};border-radius:99px;transition:width .4s"></div>
            </div>
            <span style="font-size:10px;color:var(--text3)">${usedPct}% ของงบ</span>
          </div>
        </td>
        <td class="td-num" style="font-weight:600;color:${remaining<0?'var(--red)':remaining===0?'var(--text3)':'var(--text)'}">${fmtFull(remaining)}</td>
        <td><span class="badge ${STATUS_CLASS[p.status]}">${STATUS_LABEL[p.status]}</span></td>
        <td style="text-align:center">
          ${kpiCount>0?`<span class="badge badge-s1">${kpiCount} ตัวชี้วัด</span>`:'<span style="color:var(--text3);font-size:11px">—</span>'}
        </td>
        <td class="td-actions" onclick="event.stopPropagation()">
          <div class="td-actions-inner">
            <button class="btn btn-sm btn-icon" title="ดูรายละเอียด" onclick="openDetail(${p.id})" style="color:var(--s5)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            ${_isEditable() ? `
            <button class="btn btn-sm btn-icon" title="แก้ไข" onclick="openEdit(${p.id})" style="color:var(--accent)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn btn-sm btn-icon btn-danger" title="ลบ" onclick="confirmDelete(${p.id})">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
            ` : ''}
          </div>
        </td>
      </tr>`;
    }).join('');
    // ── Footer totals row ──
    const allFiltered = getFiltered();
    const fTotalBudget = allFiltered.reduce((a,p)=>a+(p.budget||0),0);
    const fTotalSpent  = allFiltered.reduce((a,p)=>a+(p.spent||0),0);
    const fTotalPo     = allFiltered.reduce((a,p)=>a+(p.po||0),0);
    const fTotalUsed   = fTotalSpent + fTotalPo;
    const fTotalRem    = fTotalBudget - fTotalUsed;
    const fUsedPct     = fTotalBudget>0?Math.round(fTotalUsed/fTotalBudget*100):0;
    tbody.innerHTML += `<tr style="background:linear-gradient(135deg,var(--surface2),#eef2fd);font-weight:700;border-top:2px solid var(--border2)">
      <td colspan="3" style="font-size:12px;color:var(--text2);padding-left:1rem">รวมทั้งหมด ${allFiltered.length} โครงการ (กรองแล้ว)</td>
      <td class="td-num" style="font-weight:800">${fmtFull(fTotalBudget)}</td>
      <td class="td-num" style="color:var(--green);font-weight:700">${fmtFull(fTotalSpent)}</td>
      <td class="td-num" style="color:var(--amber);font-weight:700">${fmtFull(fTotalPo)}</td>
      <td class="td-num">
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px">
          <span style="font-weight:800;color:var(--accent)">${fmtFull(fTotalUsed)}</span>
          <div style="width:72px;height:4px;background:var(--border2);border-radius:99px;overflow:hidden">
            <div style="height:100%;width:${fUsedPct}%;background:var(--accent);border-radius:99px"></div>
          </div>
          <span style="font-size:10px;color:var(--text3)">${fUsedPct}% ของงบ</span>
        </div>
      </td>
      <td class="td-num" style="font-weight:800;color:${fTotalRem<0?'var(--red)':'var(--text)'}">${fmtFull(fTotalRem)}</td>
      <td colspan="3"></td>
    </tr>`;
  }
  document.getElementById('paginationInfo').textContent=`แสดง ${Math.min(start+1,total)}–${Math.min(start+PAGE_SIZE,total)} จากทั้งหมด ${total} โครงการ`;
  const btns=document.getElementById('paginationBtns');
  let html=`<button class="page-btn" onclick="goPage(${currentPage-1})" ${currentPage<=1?'disabled':''}>‹</button>`;
  for(let i=1;i<=pages;i++){
    if(pages<=7||Math.abs(i-currentPage)<=1||i===1||i===pages){
      html+=`<button class="page-btn ${i===currentPage?'active':''}" onclick="goPage(${i})">${i}</button>`;
    } else if(Math.abs(i-currentPage)===2){
      html+=`<button class="page-btn" disabled>…</button>`;
    }
  }
  html+=`<button class="page-btn" onclick="goPage(${currentPage+1})" ${currentPage>=pages?'disabled':''}>›</button>`;
  btns.innerHTML=html;
}

function goPage(p){
  const filtered=getFiltered();
  const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  currentPage=Math.max(1,Math.min(p,pages));
  renderTable();
}
function getFiltered(){
  const q=(document.getElementById('searchInput').value||'').toLowerCase();
  const fs=document.getElementById('filterStrategy').value;
  const fst=document.getElementById('filterStatus').value;
  const fq=(document.getElementById('filterQuarterTable')||{}).value||'';
  return projects.filter(p=>
    (!q||p.name.toLowerCase().includes(q)) &&
    (!fs||p.strategy==fs) &&
    (!fst||p.status===fst) &&
    (!fq||p.quarter===fq||p.quarter==='all')
  );
}

// ===== MODAL =====
function openAdd(){
  if(!_isEditable()){ showToast('🔒 กรุณาเข้าสู่ระบบก่อนเพิ่มโครงการ', 2500); openAuthModal('login'); return; }
  editingId=null; tempKPIs=[]; docFiles=[];
  document.getElementById('modalTitle').textContent='เพิ่มโครงการใหม่';
  ['editId','fName','fRationale','fObjective','fTargetQuantity','fTarget','fOwner','fApprover','fApproverPos',
   'fProposer','fProposerPos','fAuthorizer','fAuthorizerPos','fCoordinator','fPosition','fDuration',
   'fActivities','fBudgetDetail','fEvalMethod','fEvaluator','fRisk','fExpectedBenefit',
   'fSubStrategy','fDocFiles'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  _setStrategyCheckbox('1');
  document.getElementById('fBudget').value='0';
  setComCheckboxes([]);
  // init tables
  loadGanttFromData([]); loadBudgetFromData([]); loadEvalFromData([],[],[]); renderDocFileList();
  document.getElementById('modalOverlay').classList.add('open');
  setTimeout(()=>document.getElementById('fName').focus(),100);
}

function openEdit(id){
  if(!_isEditable()){ showToast('🔒 กรุณาเข้าสู่ระบบก่อนแก้ไขโครงการ', 2500); openAuthModal('login'); return; }
  const p=projects.find(x=>x.id==id); if(!p) return;
  editingId=id; tempKPIs=[...(p.kpi||[])];
  document.getElementById('modalTitle').textContent='แก้ไขโครงการ';
  document.getElementById('editId').value=id;
  document.getElementById('fName').value=p.name||'';
  document.getElementById('fRationale')&&(document.getElementById('fRationale').value=p.rationale||'');
  document.getElementById('fObjective')&&(document.getElementById('fObjective').value=p.objective||'');
  document.getElementById('fTargetQuantity')&&(document.getElementById('fTargetQuantity').value=p.targetQuantity||'');
  document.getElementById('fTarget')&&(document.getElementById('fTarget').value=p.target||'');
  _setStrategyCheckbox(p.strategy||'1');
  document.getElementById('fOwner').value=p.owner||'';
  document.getElementById('fSubStrategy')&&(document.getElementById('fSubStrategy').value=p.subStrategy||'');
  document.getElementById('fDept')&&(document.getElementById('fDept').value=p.dept||'');
  document.getElementById('fApprover')&&(document.getElementById('fApprover').value=p.approver||'');
  document.getElementById('fApproverPos')&&(document.getElementById('fApproverPos').value=p.approverPos||'');
  document.getElementById('fProposer')&&(document.getElementById('fProposer').value=p.proposer||'');
  document.getElementById('fProposerPos')&&(document.getElementById('fProposerPos').value=p.proposerPos||'');
  document.getElementById('fAuthorizer')&&(document.getElementById('fAuthorizer').value=p.authorizer||'');
  document.getElementById('fAuthorizerPos')&&(document.getElementById('fAuthorizerPos').value=p.authorizerPos||'');
  document.getElementById('fCoordinator')&&(document.getElementById('fCoordinator').value=p.coordinator||'');
  document.getElementById('fPosition')&&(document.getElementById('fPosition').value=p.position||'');
  document.getElementById('fDuration')&&(document.getElementById('fDuration').value=p.duration||'');
  document.getElementById('fBudget').value=p.budget||0;
  document.getElementById('fExpectedBenefit')&&(document.getElementById('fExpectedBenefit').value=p.expectedBenefit||'');
  setComCheckboxes(p.committees||[]);
  // load tables
  loadGanttFromData(p.activities||[]);
  loadBudgetFromData(p.budgetDetail||[]);
  loadEvalFromData(p.kpi||[], p.evalMethod||'', p.evaluator||'');
  docFiles = (p.docFiles||[]).map(f=>({...f,status:'saved'})); renderDocFileList();
  document.getElementById('modalOverlay').classList.add('open');
  closeDetail();
}

function closeModal(){ document.getElementById('modalOverlay').classList.remove('open'); }

function saveProject(){
  const name=document.getElementById('fName').value.trim();
  if(!name){alert('กรุณากรอกชื่อโครงการ');return;}

  // รอไฟล์เอกสารแนบที่กำลังอัปโหลดขึ้น Drive ให้เสร็จก่อน
  const stillUploadingDocs = docFiles.filter(f=>f._uploading);
  if(stillUploadingDocs.length){
    showToast(`⏳ รอไฟล์เอกสาร ${stillUploadingDocs.length} ไฟล์อัปโหลดขึ้น Drive ให้เสร็จก่อนครับ`, 3000);
    return;
  }

  const gv=(id,def='')=>{const el=document.getElementById(id);return el?(el.value.trim()||def):def;};
  const gn=(id)=>parseFloat(document.getElementById(id)&&document.getElementById(id).value)||0;

  // sync tables → hidden fields before reading
  syncGanttToHidden(); syncBudgetHidden(); syncEvalHidden();

  // parse gantt/budget/eval from state arrays (most up-to-date)
  const activitiesData = ganttRows.length ? ganttRows : [];
  const budgetDetailData = budgetRows.length ? budgetRows : [];
  const evalData = evalRows.length ? evalRows : [];
  const kpiFromEval = evalData.map(r=>r.kpi).filter(Boolean);

  const data={
    name,
    subStrategy:     gv('fSubStrategy'),
    rationale:       gv('fRationale'),
    objective:       gv('fObjective'),
    targetQuantity:  gv('fTargetQuantity'),
    target:          gv('fTarget'),
    strategy:        gv('fStrategy','1'),
    owner:           gv('fOwner'),
    dept:            gv('fDept'),
    coordinator:     gv('fCoordinator'),
    position:        gv('fPosition'),
    duration:        gv('fDuration'),
    projectType:     (()=>{ const el=document.querySelector('input[name="fProjectType"]:checked'); return el?el.value:'ต่อเนื่อง'; })(),
    proposer:        gv('fProposer'),
    proposerPos:     gv('fProposerPos'),
    approver:        gv('fApprover'),
    approverPos:     gv('fApproverPos'),
    authorizer:      gv('fAuthorizer'),
    authorizerPos:   gv('fAuthorizerPos'),
    activities:      activitiesData,
    budgetSource:    '',
    budget:          gn('fBudget'),
    budgetDetail:    budgetDetailData,
    evalRows:        evalData,
    evalMethod:      JSON.stringify(evalData.map(r=>r.method)),
    evaluator:       JSON.stringify(evalData.map(r=>r.tool)),
    risk:            '',
    expectedBenefit: gv('fExpectedBenefit'),
    progress:        0,
    kpi:             kpiFromEval,
    committees:      getComCheckboxes(),
    docFiles:        docFiles.map(f=>({name:f.name,size:f.size,type:f.type,url:f.url||'',fileId:f.fileId||''}))
  };
  // ── ผลการดำเนินงาน (สถานะ/งบที่ใช้ไป/PO/ผลการดำเนินงาน/รูปภาพ) จัดการผ่านหน้า "รายงานผลการดำเนินงาน" แยกต่างหาก
  // ตั้งค่าเริ่มต้นเฉพาะตอนสร้างโครงการใหม่เท่านั้น — ตอนแก้ไขแผนจะไม่แตะต้อง/ล้างข้อมูลผลการดำเนินงานที่มีอยู่แล้ว
  if(!editingId){
    data.status    = 'pending';
    data.quarter   = 'all';
    data.spent     = 0;
    data.po        = 0;
    data.result    = '';
    data.problems  = '';
    data.solutions = '';
    data.images    = [];
  }
  const imgCount = 0;
  const imgLabel = '';

  if(editingId){
    data.id=editingId;
    const i=projects.findIndex(p=>p.id==editingId);
    // snapshot ก่อน override (สำหรับ actlog)
    const _oldSnap = i>=0 ? JSON.parse(JSON.stringify(projects[i])) : null;
    if(i>=0) projects[i]={...projects[i],...data};
    // บันทึก actlog
    if(_oldSnap && typeof actlogRecord === 'function'){
      const _changed = typeof _diffProject==='function' ? _diffProject(_oldSnap, projects[i]) : [];
      actlogRecord('แก้ไข', projects[i], _changed, _oldSnap);
    }
    // บันทึก local และ render ทันที — ข้อมูลถูกต้องอยู่แล้ว ไม่ต้องรอ Sheet
    window._pendingSaveTs = Date.now();
    saveToLocal(true); closeModal(); renderTable(); updateDashboard();
    if(GAS_ENABLED){
      showToast('⏳ กำลังบันทึกขึ้น Google Sheet...', 2000);
      gasPost('update',{data})
        .then(res=>{
          if(res && res.success){
            showToast(`✅ อัปเดตสำเร็จ${imgLabel}`, 2800);
          } else {
            showToast('⚠️ GAS ตอบกลับผิดปกติ — ข้อมูลบันทึกในเครื่องแล้ว', 3000);
          }
        })
        .catch(()=>showToast('⚠️ บันทึกในเครื่องแล้ว แต่ Sync Sheet ไม่สำเร็จ', 3000));
    } else {
      showToast(`✅ อัปเดตสำเร็จ${imgLabel}`, 2800);
    }
  } else {
    const maxId=projects.reduce((m,p)=>Math.max(m,Number(p.id)||0),0);
    data.id=maxId+1;
    projects.push(data);
    // บันทึก actlog
    if(typeof actlogRecord === 'function') actlogRecord('เพิ่ม', data, [], null);
    // บันทึก local และ render ทันที — ข้อมูลถูกต้องอยู่แล้ว ไม่ต้องรอ Sheet
    window._pendingSaveTs = Date.now();
    saveToLocal(true); closeModal(); renderTable(); updateDashboard();
    if(GAS_ENABLED){
      showToast('⏳ กำลังบันทึกขึ้น Google Sheet...', 2000);
      gasPost('save',{data})
        .then(res=>{
          if(res && res.success){
            showToast(`✅ บันทึกสำเร็จ${imgLabel}`, 2800);
          } else {
            showToast('⚠️ GAS ตอบกลับผิดปกติ — ข้อมูลบันทึกในเครื่องแล้ว', 3000);
          }
        })
        .catch(()=>showToast('⚠️ บันทึกในเครื่องแล้ว แต่ Sync Sheet ไม่สำเร็จ', 3000));
      // สร้างแถวเริ่มต้นใน Sheet "ผลการดำเนินงาน" (ReportResult) ให้โครงการใหม่ทันที
      gasPost('saveReport',{data: buildReportPayload(data)}).catch(()=>{});
    } else {
      showToast(`✅ บันทึกสำเร็จ${imgLabel}`, 2800);
    }
  }
}

// ===== รายงานผลการดำเนินงาน (หน้าแยกใน Sidebar) =====
let reportSelectedId = null;

function openReportPage(){
  reportSelectedId = null;
  tempImages = [];
  reportTempKpiResults = [];
  renderReportProjectOptions();
  renderReportProjectGroups();
  const sel = document.getElementById('reportProjectSelect');
  if(sel) sel.value = '';
  const info = document.getElementById('reportProjectInfo');
  if(info) info.innerHTML = '';
  const selectSection = document.getElementById('reportSelectSection');
  if(selectSection) selectSection.style.display = 'block';
  const selectedBar = document.getElementById('reportSelectedBar');
  if(selectedBar) selectedBar.style.display = 'none';
  const panel = document.getElementById('reportFormPanel');
  if(panel) panel.style.display = 'none';
}

// รายการโครงการแบ่งตามยุทธศาสตร์ (ตารางคลิกเลือกได้ เหมือนหน้าโครงการทั้งหมด)
function renderReportProjectGroups(){
  const wrap = document.getElementById('reportProjectListWrap');
  if(!wrap) return;

  const groupsHtml = S_KEYS.map(s=>{
    const ps = projects.filter(p=>p.strategy==s);
    if(!ps.length) return '';

    const rows = ps.map((p,i)=>{
      const budget = p.budget||0;
      const spent  = p.spent||0;
      const isSel  = reportSelectedId!=null && String(reportSelectedId)===String(p.id);
      return `<tr class="data-row${isSel?' report-row-active':''}" onclick="selectReportProject(${p.id})" style="cursor:pointer">
        <td style="color:var(--text3);text-align:center;font-size:12px;width:32px">${i+1}</td>
        <td class="td-name">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span style="user-select:text">${escapeHtml(p.name)}</span>
            ${p.quarter&&p.quarter!=='all'?`<span style="font-size:10px;background:var(--accent-light);color:var(--accent);padding:1px 6px;border-radius:4px;font-weight:600;flex-shrink:0">Q${p.quarter}</span>`:''}
          </div>
        </td>
        <td><span class="badge ${S_BADGE[p.strategy]}">${S_NAMES[p.strategy]}</span></td>
        <td class="td-num" style="font-weight:700;background:#fff7e6;color:#92400e">${fmtFull(budget)}</td>
        <td class="td-num" style="color:var(--green)">${fmtFull(spent)}</td>
      </tr>`;
    }).join('');

    const gBudget = ps.reduce((a,p)=>a+(p.budget||0),0);
    const gSpent  = ps.reduce((a,p)=>a+(p.spent||0),0);

    return `
      <div class="card" style="margin-bottom:1.25rem">
        <div class="card-header">
          <span class="card-title"><span class="badge ${S_BADGE[s]}">${S_NAMES[s]}</span> — ${escapeHtml(S_FULL[s])}</span>
          <span style="font-size:11px;color:var(--text3)">${ps.length} โครงการ</span>
        </div>
        <div style="overflow-x:auto">
          <table>
            <thead>
              <tr>
                <th style="width:32px">#</th>
                <th>ชื่อโครงการ (คลิกบรรทัดเพื่อเลือกรายงานผล)</th>
                <th>ยุทธศาสตร์</th>
                <th class="td-num" style="background:#fff7e6;color:#92400e">งบอนุมัติ (บาท)</th>
                <th class="td-num">ใช้ไป (บาท)</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr style="background:linear-gradient(135deg,var(--surface2),#eef2fd);font-weight:700;border-top:2px solid var(--border2)">
                <td colspan="3" style="font-size:12px;color:var(--text2);padding-left:1rem">รวมทั้งหมด ${ps.length} โครงการ (กรองแล้ว)</td>
                <td class="td-num" style="font-weight:800;background:#fff7e6;color:#92400e">${fmtFull(gBudget)}</td>
                <td class="td-num" style="color:var(--green);font-weight:700">${fmtFull(gSpent)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>`;
  }).join('');

  wrap.innerHTML = groupsHtml || `<div class="empty-state"><p>ยังไม่มีโครงการในระบบ</p></div>`;
}

// เลือกโครงการจากตารางรายยุทธศาสตร์ — sync กับ dropdown เดิมแล้วเปิดฟอร์มรายงานผล
function selectReportProject(id){
  const sel = document.getElementById('reportProjectSelect');
  if(sel) sel.value = id;
  onReportProjectChange();
}

// จัดกลุ่มรายชื่อโครงการตามยุทธศาสตร์ (optgroup) เพื่อให้เลือกได้ถูกหมวดหมู่
function renderReportProjectOptions(){
  const sel = document.getElementById('reportProjectSelect');
  if(!sel) return;
  const groups = S_KEYS.map(s=>{
    const ps = projects.filter(p=>p.strategy==s);
    if(!ps.length) return '';
    const opts = ps.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    return `<optgroup label="${escapeHtml(S_NAMES[s])} — ${escapeHtml(S_FULL[s])}">${opts}</optgroup>`;
  }).join('');
  sel.innerHTML = `<option value="">— เลือกโครงการ —</option>${groups}`;
}

function onReportProjectChange(){
  const sel = document.getElementById('reportProjectSelect');
  const id = sel ? sel.value : '';
  const panel = document.getElementById('reportFormPanel');
  const info = document.getElementById('reportProjectInfo');
  const selectSection = document.getElementById('reportSelectSection');
  const selectedBar = document.getElementById('reportSelectedBar');
  if(!id){
    reportSelectedId = null;
    if(panel) panel.style.display='none';
    if(selectedBar) selectedBar.style.display='none';
    if(selectSection) selectSection.style.display='block';
    if(info) info.innerHTML='';
    reportTempKpiResults = [];
    renderReportKpiResults();
    renderReportProjectGroups();
    return;
  }
  if(!_isEditable()){
    showToast('🔒 กรุณาเข้าสู่ระบบก่อนรายงานผล', 2500);
    openAuthModal('login');
    if(sel) sel.value='';
    reportSelectedId = null;
    return;
  }
  const p = projects.find(x=>x.id==id);
  if(!p) return;
  reportSelectedId = id;

  if(info) info.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span class="badge ${S_BADGE[p.strategy]}">${S_NAMES[p.strategy]}</span>
      <strong style="font-size:13px">${escapeHtml(p.name)}</strong>
      <span style="margin-left:auto;font-size:12px;color:var(--text2)">งบอนุมัติ ${fmtFull(p.budget)} บาท</span>
    </div>`;
  // ขั้นที่เลือกโครงการแล้ว — ซ่อนรายการทั้งหมด เหลือแค่โครงการที่เลือก + ฟอร์มรายงานผล
  if(selectSection) selectSection.style.display='none';
  if(selectedBar) selectedBar.style.display='block';
  if(panel) panel.style.display='block';

  // โหลดรูปเดิม — แต่ละรูปมี url และ driveId อยู่แล้ว ไม่ต้อง upload ซ้ำ
  tempImages = (p.images||[]).map(img=>({
    name:     img.name     || '',
    url:      img.url      || img.dataUrl || '',
    publicId: img.publicId || img.driveId  || '',
    _uploading: false,
    _dataUrl: img.url || img.dataUrl || ''
  }));
  document.getElementById('fStatus').value = p.status||'pending';
  document.getElementById('fQuarter').value = p.quarter||'all';
  document.getElementById('fSpent').value = p.spent||0;
  document.getElementById('fPO').value = p.po||0;
  document.getElementById('fResult').value = p.result||'';
  document.getElementById('fProblems').value = p.problems||'';
  document.getElementById('fSolutions').value = p.solutions||'';
  document.getElementById('fEditorName').value = (typeof _editorDisplayName==='function'?_editorDisplayName():'')||'— กรุณาเข้าสู่ระบบ —';
  document.getElementById('fEditedAt').value = p.lastEditedAt
    ? (p.lastEditedAt+(p.lastEditedBy?' โดย '+p.lastEditedBy+(p.lastEditedByPosition?' ('+p.lastEditedByPosition+')':''):''))
    : '— ยังไม่เคยแก้ไข —';
  renderImgPreview();
  // โหลดผลตัวชี้วัด (KPI) ที่เคยกรอกไว้เอง สำหรับรายงานนี้ (ไม่ใช่ตัวชี้วัดเป้าหมายของโครงการ)
  reportTempKpiResults = Array.isArray(p.kpiResults) ? [...p.kpiResults] : [];
  renderReportKpiResults();
}

// ===== ตัวชี้วัด (KPI) ที่ผู้กรอกรายงานผลเพิ่มเข้ามาเอง (แยกจากตัวชี้วัดเป้าหมายของโครงการ) =====
let reportTempKpiResults = [];

function addReportKpiResult(){
  const inp = document.getElementById('reportKpiInput');
  const v = inp ? inp.value.trim() : '';
  if(!v) return;
  reportTempKpiResults.push(v);
  if(inp) inp.value = '';
  renderReportKpiResults();
}
function removeReportKpiResult(i){
  reportTempKpiResults.splice(i,1);
  renderReportKpiResults();
}
function renderReportKpiResults(){
  const el = document.getElementById('reportKpiList');
  if(!el) return;
  if(!reportTempKpiResults.length){
    el.innerHTML = `<span style="font-size:11px;color:var(--text3)">ยังไม่มีรายการ — พิมพ์ผลที่ทำได้แล้วกด + เพิ่ม</span>`;
    return;
  }
  el.innerHTML = reportTempKpiResults.map((k,i)=>
    `<span class="kpi-tag">${escapeHtml(k)}<button onclick="removeReportKpiResult(${i})" title="ลบ">×</button></span>`
  ).join('');
}

function resetReportForm(){ openReportPage(); }

function saveResultReport(){
  if(!_isEditable()){ showToast('🔒 กรุณาเข้าสู่ระบบก่อนบันทึกรายงานผล', 2500); openAuthModal('login'); return; }
  if(!reportSelectedId){ showToast('กรุณาเลือกโครงการก่อนบันทึกรายงานผล'); return; }

  const stillUploading = tempImages.filter(i=>i._uploading);
  if(stillUploading.length){
    showToast(`⏳ รอรูปภาพ ${stillUploading.length} รูปอัปโหลดให้เสร็จก่อนครับ`, 3000);
    return;
  }

  const i = projects.findIndex(p=>p.id==reportSelectedId);
  if(i<0){ showToast('⚠️ ไม่พบโครงการนี้แล้ว — อาจถูกลบไปแล้ว', 3000); return; }

  const cleanImages = tempImages.map(img=>({ name:img.name||'', url:img.url||'', publicId:img.publicId||'' }));
  const _oldSnap = JSON.parse(JSON.stringify(projects[i]));

  const patch = {
    status:    document.getElementById('fStatus').value,
    quarter:   document.getElementById('fQuarter').value,
    spent:     parseFloat(document.getElementById('fSpent').value)||0,
    po:        parseFloat(document.getElementById('fPO').value)||0,
    result:    document.getElementById('fResult').value.trim(),
    problems:  document.getElementById('fProblems').value.trim(),
    solutions: document.getElementById('fSolutions').value.trim(),
    images:    cleanImages,
    kpiResults: [...reportTempKpiResults],
    lastEditedBy:         (typeof _currentUser!=='undefined' && _currentUser) ? (_currentUser.name||'ผู้ใช้') : 'ผู้ใช้',
    lastEditedByPosition: (typeof _currentUser!=='undefined' && _currentUser) ? (_currentUser.position||'') : '',
    lastEditedAt:         new Date().toLocaleString('th-TH',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})
  };
  projects[i] = {...projects[i], ...patch};

  if(typeof actlogRecord === 'function'){
    const _changed = typeof _diffProject==='function' ? _diffProject(_oldSnap, projects[i]) : [];
    actlogRecord('รายงานผล', projects[i], _changed, _oldSnap);
  }

  window._pendingSaveTs = Date.now();
  saveToLocal(true);
  renderTable();
  updateDashboard();

  const imgCount = cleanImages.length;
  const imgLabel = imgCount>0 ? ` · รูปภาพ ${imgCount} รูป (Cloudinary)` : '';

  if(GAS_ENABLED){
    showToast('⏳ กำลังบันทึกขึ้น Google Sheet...', 2000);
    gasPost('saveReport',{data: buildReportPayload(projects[i])})
      .then(res=>{
        if(res && res.success){ showToast(`✅ บันทึกรายงานผลสำเร็จ${imgLabel}`, 2800); }
        else { showToast('⚠️ GAS ตอบกลับผิดปกติ — ข้อมูลบันทึกในเครื่องแล้ว', 3000); }
      })
      .catch(()=>showToast('⚠️ บันทึกในเครื่องแล้ว แต่ Sync Sheet ไม่สำเร็จ', 3000));
  } else {
    showToast(`✅ บันทึกรายงานผลสำเร็จ${imgLabel}`, 2800);
  }
  // รีเฟรชค่า "แก้ไขล่าสุด" ในฟอร์มให้ทันที
  onReportProjectChange();
}

// ===== KPI =====
function addKPI(){
  const v=document.getElementById('kpiInput').value.trim(); if(!v) return;
  tempKPIs.push(v); document.getElementById('kpiInput').value=''; renderKPIList();
}
function removeKPI(i){ tempKPIs.splice(i,1); renderKPIList(); }
function renderKPIList(){
  const el=document.getElementById('kpiList');
  if(!tempKPIs.length){el.innerHTML='<span style="font-size:11px;color:var(--text3)">ยังไม่มีตัวชี้วัด</span>';return;}
  el.innerHTML=tempKPIs.map((k,i)=>`<span class="kpi-tag">${k}<button onclick="removeKPI(${i})" title="ลบ">×</button></span>`).join('');
}

// ===== DETAIL =====
function openDetail(id){
  const p=projects.find(x=>x.id==id); if(!p) return;
  document.getElementById('detailTitle').textContent=p.name;
  document.getElementById('detailEditBtn').onclick=()=>openEdit(id);
  document.getElementById('detailExportPdfBtn').onclick=()=>exportFormPDF(id);
  const remaining=(p.budget||0)-(p.spent||0)-(p.po||0);
  const kpis=p.kpi||[];
  const evalData = Array.isArray(p.evalRows)&&p.evalRows.length ? p.evalRows
    : kpis.map(k=>({kpi:k,method:'',tool:''}));

  const ganttHtml = (p.activities&&p.activities.length) ? `
    <div class="detail-section">
      <div class="detail-section-title">📅 แผนการดำเนินงาน (Gantt)</div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:var(--surface2)">
            <th style="padding:6px 8px;text-align:left;border:1px solid var(--border)">กิจกรรม</th>
            <th style="padding:6px 8px;text-align:left;border:1px solid var(--border);white-space:nowrap">ผู้รับผิดชอบ</th>
            ${['ต.ค.','พ.ย.','ธ.ค.','ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.'].map(m=>`<th style="padding:4px;text-align:center;border:1px solid var(--border);font-size:10px">${m}</th>`).join('')}
          </tr></thead>
          <tbody>${p.activities.map(a=>`<tr>
            <td style="padding:5px 8px;border:1px solid var(--border)">${escapeHtml(a.name||'')}</td>
            <td style="padding:5px 8px;border:1px solid var(--border);white-space:nowrap">${escapeHtml(a.person||'')}</td>
            ${(a.months||Array(12).fill(false)).map(m=>`<td style="text-align:center;border:1px solid var(--border);background:${m?'var(--accent-light)':''};">${m?'<span style="color:var(--accent);font-weight:700">✓</span>':''}</td>`).join('')}
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>` : '';

  const budgetHtml = (p.budgetDetail&&p.budgetDetail.length) ? `
    <div class="detail-section">
      <div class="detail-section-title">💰 รายละเอียดงบประมาณ</div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:var(--surface2)">
            <th style="padding:6px 8px;text-align:left;border:1px solid var(--border)">รายการ</th>
            <th style="padding:6px 8px;text-align:right;border:1px solid var(--border)">ค่าตอบแทน</th>
            <th style="padding:6px 8px;text-align:right;border:1px solid var(--border)">ค่าใช้สอย</th>
            <th style="padding:6px 8px;text-align:right;border:1px solid var(--border)">ค่าวัสดุ</th>
            <th style="padding:6px 8px;text-align:right;border:1px solid var(--border);font-weight:700">รวม</th>
          </tr></thead>
          <tbody>${p.budgetDetail.map(r=>{
            const tot=(Number(r.comp)||0)+(Number(r.op)||0)+(Number(r.mat)||0);
            return `<tr>
              <td style="padding:5px 8px;border:1px solid var(--border)">${escapeHtml(r.name||'')}</td>
              <td style="padding:5px 8px;border:1px solid var(--border);text-align:right">${Number(r.comp||0).toLocaleString('th-TH')}</td>
              <td style="padding:5px 8px;border:1px solid var(--border);text-align:right">${Number(r.op||0).toLocaleString('th-TH')}</td>
              <td style="padding:5px 8px;border:1px solid var(--border);text-align:right">${Number(r.mat||0).toLocaleString('th-TH')}</td>
              <td style="padding:5px 8px;border:1px solid var(--border);text-align:right;font-weight:700;color:var(--accent)">${tot.toLocaleString('th-TH')}</td>
            </tr>`;
          }).join('')}</tbody>
          <tfoot><tr style="background:var(--surface2)">
            <td colspan="4" style="padding:6px 8px;border:1px solid var(--border);font-weight:700;text-align:right">รวมทั้งสิ้น</td>
            <td style="padding:6px 8px;border:1px solid var(--border);font-weight:700;color:var(--accent);text-align:right">${(p.budgetDetail.reduce((s,r)=>(s+(Number(r.comp)||0)+(Number(r.op)||0)+(Number(r.mat)||0)),0)).toLocaleString('th-TH')}</td>
          </tr></tfoot>
        </table>
      </div>
    </div>` : '';

  const evalHtml = evalData.length ? `
    <div class="detail-section">
      <div class="detail-section-title">📊 การวัดและประเมินผล (KPI)</div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="background:var(--surface2)">
            <th style="padding:6px 8px;text-align:left;border:1px solid var(--border)">#</th>
            <th style="padding:6px 8px;text-align:left;border:1px solid var(--border)">ตัวชี้วัด (KPI)</th>
            <th style="padding:6px 8px;text-align:left;border:1px solid var(--border)">วิธีการประเมิน</th>
            <th style="padding:6px 8px;text-align:left;border:1px solid var(--border)">เครื่องมือ / ผู้ประเมิน</th>
          </tr></thead>
          <tbody>${evalData.map((r,i)=>`<tr>
            <td style="padding:5px 8px;border:1px solid var(--border);color:var(--text3)">${i+1}</td>
            <td style="padding:5px 8px;border:1px solid var(--border);font-weight:600">${escapeHtml(r.kpi||'')}</td>
            <td style="padding:5px 8px;border:1px solid var(--border)">${escapeHtml(r.method||'')}</td>
            <td style="padding:5px 8px;border:1px solid var(--border)">${escapeHtml(r.tool||'')}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>` : '';

  const sigHtml = (p.proposer||p.approver||p.authorizer) ? `
    <div class="detail-section">
      <div class="detail-section-title">✍️ ลายมือชื่อ</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
        ${[['ผู้เสนอโครงการ',p.proposer,p.proposerPos],['ผู้เห็นชอบโครงการ',p.approver,p.approverPos],['ผู้อนุมัติโครงการ',p.authorizer,p.authorizerPos]].map(([lbl,name,pos])=>`
          <div style="border:1px solid var(--border);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:11px;color:var(--text3);margin-bottom:4px">${lbl}</div>
            <div style="font-weight:700;font-size:13px">${escapeHtml(name||'—')}</div>
            <div style="font-size:11px;color:var(--text2)">${escapeHtml(pos||'')}</div>
          </div>`).join('')}
      </div>
    </div>` : '';

  document.getElementById('detailBody').innerHTML=`
    <div class="detail-section">
      <div class="detail-section-title">ข้อมูลทั่วไป</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="detail-item-label">ยุทธศาสตร์</div><div class="detail-item-value"><span class="badge ${S_BADGE[p.strategy]}">${S_NAMES[p.strategy]}</span></div></div>
        <div class="detail-item"><div class="detail-item-label">สถานะ</div><div class="detail-item-value"><span class="badge ${STATUS_CLASS[p.status]}">${STATUS_LABEL[p.status]}</span></div></div>
        <div class="detail-item"><div class="detail-item-label">ไตรมาส</div><div class="detail-item-value">${Q_LABEL[p.quarter||'all']}</div></div>
        <div class="detail-item"><div class="detail-item-label">ลักษณะโครงการ</div><div class="detail-item-value">${escapeHtml(p.projectType||'ต่อเนื่อง')}</div></div>
        <div class="detail-item"><div class="detail-item-label">ฝ่าย / กลุ่มงาน</div><div class="detail-item-value">${escapeHtml(p.owner||'—')}</div></div>
        <div class="detail-item"><div class="detail-item-label">หน่วยงาน</div><div class="detail-item-value">${escapeHtml(p.dept||'—')}</div></div>
        <div class="detail-item"><div class="detail-item-label">ผู้รับผิดชอบ</div><div class="detail-item-value">${escapeHtml(p.coordinator||'—')}</div></div>
        <div class="detail-item"><div class="detail-item-label">ตำแหน่งงาน</div><div class="detail-item-value">${escapeHtml(p.position||'—')}</div></div>
        <div class="detail-item" style="grid-column:1/-1"><div class="detail-item-label">ระยะเวลาดำเนินการ</div><div class="detail-item-value">${escapeHtml(p.duration||'—')}</div></div>
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-section-title">💰 งบประมาณ</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="detail-item-label">งบประมาณที่อนุมัติ</div><div class="detail-item-value" style="font-size:15px;font-weight:700;color:var(--accent)">${fmtFull(p.budget)} บาท</div></div>
        <div class="detail-item"><div class="detail-item-label">งบประมาณที่ใช้ไป</div><div class="detail-item-value">${fmtFull(p.spent)} บาท</div></div>
        <div class="detail-item"><div class="detail-item-label">PO ผูกพัน</div><div class="detail-item-value">${fmtFull(p.po)} บาท</div></div>
        <div class="detail-item"><div class="detail-item-label">งบประมาณคงเหลือสุทธิ</div><div class="detail-item-value" style="${remaining<0?'color:var(--red);font-weight:700':''}">${fmtFull(remaining)} บาท</div></div>
        ${p.budgetSource?`<div class="detail-item" style="grid-column:1/-1"><div class="detail-item-label">แหล่งงบประมาณ</div><div class="detail-item-value">${escapeHtml(p.budgetSource)}</div></div>`:''}
      </div>
    </div>
    <div class="detail-section">
      <div class="detail-section-title">👥 ผู้รับผิดชอบและอนุกรรมการ</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="detail-item-label">ฝ่าย / กลุ่มงาน</div><div class="detail-item-value">${escapeHtml(p.owner||'—')}</div></div>
        <div class="detail-item"><div class="detail-item-label">ผู้รับผิดชอบ</div><div class="detail-item-value">${escapeHtml(p.coordinator||'—')}</div></div>
        <div class="detail-item" style="grid-column:1/-1">
          <div class="detail-item-label">อนุกรรมการที่เกี่ยวข้อง</div>
          <div class="detail-item-value" style="margin-top:4px">
            ${(p.committees&&p.committees.length)
              ? p.committees.map(c=>`<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:600;background:var(--accent-light);color:var(--accent);margin:2px 3px 2px 0">🏛 ${escapeHtml(c)}</span>`).join('')
              : '<span style="color:var(--text3);font-weight:400;font-size:12px">ไม่ได้ระบุ</span>'}
          </div>
        </div>
      </div>
    </div>
    ${p.rationale?`<div class="detail-section"><div class="detail-section-title">📝 หลักการและเหตุผล</div><div class="detail-text">${escapeHtml(p.rationale)}</div></div>`:''}
    ${p.objective?`<div class="detail-section"><div class="detail-section-title">🎯 วัตถุประสงค์</div><div class="detail-text">${escapeHtml(p.objective)}</div></div>`:''}
    ${(p.targetQuantity||p.target)?`<div class="detail-section"><div class="detail-section-title">📌 เป้าหมาย</div>${p.targetQuantity?`<div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:4px">เชิงปริมาณ</div><div class="detail-text" style="margin-bottom:8px">${escapeHtml(p.targetQuantity)}</div>`:''} ${p.target?`<div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:4px">เชิงคุณภาพ</div><div class="detail-text">${escapeHtml(p.target)}</div>`:''}</div>`:''}
    ${ganttHtml}
    ${budgetHtml}
    ${evalHtml}
    ${p.expectedBenefit?`<div class="detail-section"><div class="detail-section-title">✨ ผลที่คาดว่าจะได้รับ</div><div class="detail-text">${escapeHtml(p.expectedBenefit)}</div></div>`:''}
    ${p.result?`<div class="detail-section"><div class="detail-section-title">📈 ผลการดำเนินงาน</div><div class="detail-text">${escapeHtml(p.result)}</div></div>`:''}
    ${p.problems?`<div class="detail-section"><div class="detail-section-title">⚠️ ปัญหาและอุปสรรค</div><div class="problem-box">${escapeHtml(p.problems)}</div></div>`:''}
    ${p.solutions?`<div class="detail-section"><div class="detail-section-title">💡 แนวทางแก้ไข</div><div class="solution-box">${escapeHtml(p.solutions)}</div></div>`:''}
    ${sigHtml}
    ${(p.images&&p.images.length)?`
    <div class="detail-section">
      <div class="detail-section-title">📸 รูปภาพประกอบ (${p.images.length} รูป)</div>
      <div class="detail-img-gallery">
        ${p.images.map((img,i)=>`<div class="detail-img-item" onclick="openDetailImgLightbox(${p.id},${i})">
          <img src="${driveImgUrl(img)}" alt="${escapeHtml(img.name||'รูปภาพ')}" onerror="onImgError(this)">
        </div>`).join('')}
      </div>
    </div>`:''}
    ${(p.docFiles&&p.docFiles.length)?`
    <div class="detail-section">
      <div class="detail-section-title">📎 เอกสารแนบ (${p.docFiles.length} ไฟล์)</div>
      <div>
        ${p.docFiles.map(f=>{
          const icons = {pdf:'📄',doc:'📝',docx:'📝',xls:'📊',xlsx:'📊',ppt:'📋',pptx:'📋',jpg:'🖼️',jpeg:'🖼️',png:'🖼️',gif:'🖼️',webp:'🖼️'};
          const ext = (f.name||'').split('.').pop().toLowerCase();
          const ico = icons[ext]||'📎';
          const sz = f.size > 1024*1024 ? (f.size/1024/1024).toFixed(1)+' MB' : Math.round((f.size||0)/1024)+' KB';
          return f.url
            ? `<a href="${f.url}" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid var(--border);border-radius:7px;margin-bottom:5px;background:var(--surface2);text-decoration:none;color:inherit">
                <span style="font-size:18px">${ico}</span>
                <div style="flex:1;min-width:0">
                  <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(f.name)}</div>
                  <div style="font-size:10.5px;color:var(--text3)">${sz} · เปิดใน Drive</div>
                </div>
              </a>`
            : `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid var(--border);border-radius:7px;margin-bottom:5px;background:var(--surface2)">
                <span style="font-size:18px">${ico}</span>
                <div style="flex:1;min-width:0">
                  <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(f.name)}</div>
                  <div style="font-size:10.5px;color:var(--text3)">${sz}</div>
                </div>
              </div>`;
        }).join('')}
      </div>
    </div>`:''}
    ${p.lastEditedAt?`<div style="text-align:right;font-size:11px;color:var(--text3);margin-top:10px;border-top:1px solid var(--border);padding-top:8px">
      ✏️ แก้ไขล่าสุด ${escapeHtml(p.lastEditedAt)}${p.lastEditedBy?` โดย ${escapeHtml(p.lastEditedBy)}${p.lastEditedByPosition?` (${escapeHtml(p.lastEditedByPosition)})`:''}`:''}
    </div>`:''}
  `;
  document.getElementById('detailOverlay').classList.add('open');
}
function closeDetail(){ document.getElementById('detailOverlay').classList.remove('open'); }
function escapeHtml(str){ return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>'); }

// ดึง URL รูปภาพ — Cloudinary URL อยู่ใน img.url แล้ว
// รองรับข้อมูลเก่าที่มี driveId
function driveImgUrl(img){
  if(!img) return '';
  if(img.url && !img.url.includes('thumbnail?id=')) return img.url;
  if(img.driveId) return 'https://lh3.googleusercontent.com/d/' + img.driveId;
  return img.dataUrl || '';
}

function onImgError(el, img){
  // Cloudinary URLs ไม่ต้อง fallback แต่รองรับรูปเก่าจาก Drive
  const id = el.dataset.driveId;
  if(!id) return;
  const tried = parseInt(el.dataset.tried||'0');
  const fallbacks = [
    'https://lh3.googleusercontent.com/d/' + id,
    'https://drive.google.com/uc?export=view&id=' + id
  ];
  if(tried < fallbacks.length){
    el.dataset.tried = tried + 1;
    el.src = fallbacks[tried];
  }
}
function openDetailImgLightbox(projectId, idx){
  const p = projects.find(x=>x.id==projectId); if(!p||!p.images) return;
  openLightboxGallery(p.images.map(i=>driveImgUrl(i)), idx);
}

// ===== DELETE =====
function confirmDelete(id){
  if(!_isEditable()){ showToast('🔒 กรุณาเข้าสู่ระบบก่อนลบโครงการ', 2500); openAuthModal('login'); return; }
  const p=projects.find(x=>x.id==id); if(!p) return;
  deleteId=id;
  document.getElementById('deleteName').textContent=p.name;
  document.getElementById('confirmDeleteBtn').onclick=()=>doDelete();
  document.getElementById('deleteOverlay').classList.add('open');
}
function doDelete(){
  const p=projects.find(x=>x.id==deleteId);
  // 🔔 บันทึก activity log ก่อนลบ
  if (p && typeof actlogRecord === 'function') actlogRecord('ลบ', p, [], null);
  // ลบรูปภาพออกจาก Drive ด้วย (async)
  if(p&&p.images&&GAS_ENABLED){
    p.images.forEach(img=>{ if(img.publicId) gasPost('deleteCloudinaryImage',{publicId:img.publicId}).catch(()=>{}); });
  }
  projects=projects.filter(p=>p.id!=deleteId);
  document.getElementById('deleteOverlay').classList.remove('open');
  saveToLocal(); renderTable(); updateDashboard();
  if(GAS_ENABLED) gasPost('delete',{id:deleteId})
    .then(()=>showToast('🗑️ ลบโครงการสำเร็จ',2500))
    .catch(()=>showToast('⚠️ ลบในเครื่องแล้ว แต่ Sync Sheet ไม่สำเร็จ',3000));
  if(GAS_ENABLED) gasPost('deleteReport',{id:deleteId}).catch(()=>{});
}

// ===== IMAGE UPLOAD (Cloudinary) =====
// tempImages เก็บ {name, url, publicId, _dataUrl(ชั่วคราวสำหรับ preview), _uploading}
let tempImages = [];
let lightboxImages = [];
let lightboxIdx = 0;

function handleImgSelect(e){
  addImagesToTemp(Array.from(e.target.files));
  e.target.value = '';
}
function handleImgDragOver(e){ e.preventDefault(); document.getElementById('imgUploadZone').classList.add('drag-over'); }
function handleImgDragLeave(e){ document.getElementById('imgUploadZone').classList.remove('drag-over'); }
function handleImgDrop(e){
  e.preventDefault();
  document.getElementById('imgUploadZone').classList.remove('drag-over');
  addImagesToTemp(Array.from(e.dataTransfer.files).filter(f=>f.type.startsWith('image/')));
}

function addImagesToTemp(files){
  const remaining = 10 - tempImages.length;
  if(remaining <= 0){ showToast('อัปโหลดรูปได้สูงสุด 10 รูปเท่านั้น'); return; }
  const toAdd = files.slice(0, remaining);
  if(files.length > remaining) showToast(`เพิ่มได้อีก ${remaining} รูป`);

  toAdd.forEach(file => {
    if(file.size > 20*1024*1024){ showToast(`${file.name}: ไฟล์ใหญ่เกิน 20MB`); return; }

    // สร้าง placeholder ก่อนเพื่อ preview ทันที
    const placeholder = { name: file.name, url: '', publicId: '', _uploading: true, _dataUrl: '', _progress: 0 };
    tempImages.push(placeholder);
    renderImgPreview();

    // resize + compress ก่อน upload
    resizeImage(file).then(base64Full => {
      placeholder._dataUrl = base64Full;
      renderImgPreview();

      const kb = Math.round(base64Full.length * 0.75 / 1024);
      showToast(`⏳ กำลังอัปโหลด "${file.name}" (${kb} KB)...`, 1500);

      function doUpload(attempt){
        cloudinaryUpload(base64Full, file.name)
          .then(res => {
            placeholder.url        = res.url;
            placeholder.publicId   = res.publicId;
            placeholder._uploading = false;
            placeholder._dataUrl   = res.url; // ใช้ Cloudinary URL แทน base64 ประหยัด memory
            renderImgPreview();
            showToast(`✅ "${file.name}" อัปโหลดสำเร็จ${attempt>1?' (retry)':''}`, 2500);
          })
          .catch(err => {
            console.error(`Upload attempt ${attempt} failed:`, err.message);
            if(attempt < 3){
              showToast(`⏳ retry ${attempt}/2 — "${file.name}"`, 1500);
              setTimeout(()=>doUpload(attempt+1), 2000);
            } else {
              placeholder.url        = base64Full;
              placeholder._uploading = false;
              placeholder._uploadError = true;
              renderImgPreview();
              showToast(`⚠️ อัปโหลดไม่สำเร็จหลัง 3 ครั้ง: ${err.message}`, 5000);
            }
          });
      }
      doUpload(1);
    });
  });
}

// ── Resize + Compress รูปก่อน upload ────────────────────────
// - resize ด้านยาวสุดไม่เกิน 1400px (คมชัด พอสำหรับรายงาน)
// - บีบอัดเป็น JPEG quality 0.82 → ลดขนาด ~70-85% จากต้นฉบับ
// - PNG/GIF ก็แปลงเป็น JPEG เพื่อลดขนาด (ยกเว้น WebP ซึ่งบีบดีอยู่แล้ว)
const IMG_MAX_PX      = 1400;   // px ด้านยาวสุด
const IMG_JPEG_QUALITY = 0.82;  // 0.82 = คมชัด, ไฟล์เล็ก

function resizeImage(file, _unused){
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        // resize ถ้าเกิน max
        if(w > IMG_MAX_PX || h > IMG_MAX_PX){
          if(w > h){ h = Math.round(h * IMG_MAX_PX / w); w = IMG_MAX_PX; }
          else      { w = Math.round(w * IMG_MAX_PX / h); h = IMG_MAX_PX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        // แปลงทุก format เป็น JPEG เพื่อขนาดเล็กที่สุด (ยกเว้น WebP)
        const outType = file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
        resolve(canvas.toDataURL(outType, IMG_JPEG_QUALITY));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function removeImgTemp(i){
  const img = tempImages[i];
  // ลบออกจาก Cloudinary (ผ่าน GAS เพราะต้องใช้ API secret)
  if(img && img.publicId && GAS_ENABLED){
    gasPost('deleteCloudinaryImage', { publicId: img.publicId }).catch(()=>{});
  }
  tempImages.splice(i, 1);
  renderImgPreview();

  // อัปเดต images_json ใน Sheet ทันที ไม่รอกดบันทึก
  if(editingId && GAS_ENABLED){
    const cleanImages = tempImages.map(img=>({
      name: img.name || '', url: img.url || '', publicId: img.publicId || ''
    }));
    const proj = projects.find(p=>p.id==editingId);
    if(proj){
      proj.images = cleanImages;
      saveToLocal(true);
      gasPost('updateImages', { id: String(editingId), images: JSON.stringify(cleanImages) })
        .catch(()=>showToast('⚠️ ลบรูปแล้ว แต่ Sync Sheet ไม่สำเร็จ', 3000));
    }
  }
}

function renderImgPreview(){
  const grid     = document.getElementById('imgPreviewGrid');
  const info     = document.getElementById('imgCountInfo');
  const countTxt = document.getElementById('imgCountText');
  if(!grid) return;
  if(!tempImages.length){ grid.innerHTML=''; if(info) info.style.display='none'; return; }

  grid.innerHTML = tempImages.map((img, i) => {
    const src = img._dataUrl || driveImgUrl(img) || '';
    const uploading = img._uploading;
    const hasError  = img._driveError;
    return `
    <div class="img-preview-item" style="position:relative">
      ${src ? `<img src="${src}" alt="${escapeHtml(img.name)}" onclick="${uploading?'':'openLightboxTemp('+i+')'}">` : '<div style="width:100%;height:100%;background:var(--surface2)"></div>'}
      ${uploading ? `<div style="position:absolute;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;border-radius:var(--radius)">
        <div style="width:22px;height:22px;border:3px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite"></div>
      </div>` : ''}
      ${hasError ? `<div style="position:absolute;top:3px;left:3px;background:var(--amber);color:#fff;font-size:9px;padding:1px 4px;border-radius:3px">⚠️</div>` : ''}
      ${!uploading ? `<button class="img-remove" onclick="removeImgTemp(${i})" title="ลบรูป">✕</button>` : ''}
      <div class="img-caption">${escapeHtml(img.name)}</div>
    </div>`;
  }).join('');

  if(info) info.style.display = 'inline-flex';
  const ready = tempImages.filter(i=>!i._uploading).length;
  const total = tempImages.length;
  if(countTxt) countTxt.textContent = total===ready ? `${total} รูป (พร้อมใช้งาน)` : `${ready}/${total} รูป (กำลังอัปโหลด...)`;
}

function openLightboxTemp(idx){
  // ถ้ายังมีรูปที่กำลัง upload อยู่ ข้ามไป
  const ready = tempImages.filter(i=>!i._uploading);
  if(!ready.length) return;
  // สร้าง index mapping
  const readyIdx = tempImages.filter((img,i)=>!img._uploading);
  lightboxImages = readyIdx.map(i=>i.url||i._dataUrl);
  lightboxIdx = Math.min(idx, lightboxImages.length-1);
  showLightbox();
}

function openLightboxGallery(images, idx){
  lightboxImages = images;
  lightboxIdx = idx;
  showLightbox();
}

function showLightbox(){
  document.getElementById('lightboxImg').src = lightboxImages[lightboxIdx];
  document.getElementById('lightboxCounter').textContent = `${lightboxIdx+1} / ${lightboxImages.length}`;
  document.getElementById('lightboxOverlay').classList.add('open');
}

function closeLightbox(){ document.getElementById('lightboxOverlay').classList.remove('open'); }

function lightboxNav(dir){
  lightboxIdx = (lightboxIdx + dir + lightboxImages.length) % lightboxImages.length;
  showLightbox();
}

// ===== COMMITTEE DROPDOWN =====
const COM_OPTIONS = [
  {id:'chkPolicy',   value:'นโยบายและแผนงาน'},
  {id:'chkAcademic', value:'วิชาการ'},
  {id:'chkTech',     value:'เทคนิคและเทคโนโลยีดิจิทัล'},
  {id:'chkHR',       value:'บริหารงานบุคคล'},
];

function toggleComPanel(){
  const trigger = document.getElementById('comTrigger');
  const panel   = document.getElementById('comPanel');
  const isOpen  = panel.classList.contains('open');
  if(isOpen){ panel.classList.remove('open'); trigger.classList.remove('open'); }
  else       { panel.classList.add('open');   trigger.classList.add('open'); }
}

function updateComTrigger(){
  const selected = getComCheckboxes();
  const textEl   = document.getElementById('comTriggerText');
  if(!selected.length){
    textEl.innerHTML = '<span class="com-placeholder">— เลือกอนุกรรมการที่เกี่ยวข้อง —</span>';
  } else {
    textEl.innerHTML = selected.map(v=>`<span class="com-tag">อนุฯ ${v}</span>`).join('');
  }
}

function getComCheckboxes(){
  return COM_OPTIONS.filter(o=>document.getElementById(o.id)?.checked).map(o=>o.value);
}

function setComCheckboxes(arr){
  COM_OPTIONS.forEach(o=>{
    const el = document.getElementById(o.id);
    if(el) el.checked = arr.includes(o.value);
  });
  updateComTrigger();
}

// Close dropdown when clicking outside
document.addEventListener('click', e=>{
  const wrap = document.getElementById('comDropdownWrap');
  if(wrap && !wrap.contains(e.target)){
    document.getElementById('comPanel')?.classList.remove('open');
    document.getElementById('comTrigger')?.classList.remove('open');
  }
});

// ===== COMMITTEE SUMMARY =====

const COM_LIST = [
  { key: 'นโยบายและแผนงาน',           label: 'ด้านนโยบายและแผนงาน',           color: '#3b72f0', colorLight: '#eef2fd', icon: '📋' },
  { key: 'วิชาการ',                    label: 'ด้านวิชาการ',                   color: '#059669', colorLight: '#ecfdf5', icon: '📚' },
  { key: 'เทคนิคและเทคโนโลยีดิจิทัล', label: 'ด้านเทคนิคและเทคโนโลยีดิจิทัล', color: '#d97706', colorLight: '#fffbeb', icon: '💻' },
  { key: 'บริหารงานบุคคล',             label: 'ด้านบริหารงานบุคคล',             color: '#9333ea', colorLight: '#faf5ff', icon: '👥' },
];
// โครงการที่ไม่ถูก assign อนุกรรมการ
const COM_UNASSIGNED = { key: '__none__', label: 'ไม่ได้ระบุอนุกรรมการ', color: '#9aa3b2', colorLight: '#f9fafb', icon: '—' };

function _getCommittees(p) {
  // committees อาจเป็น array ของ string หรือ object {name, role}
  const raw = p.committees || [];
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.map(c => (typeof c === 'string' ? c : (c.name || c.key || ''))).filter(Boolean);
}

// คำนวณ stats per committee key
function _comStats(fp) {
  const map = {};
  [...COM_LIST, COM_UNASSIGNED].forEach(c => {
    map[c.key] = { projects: [], budget: 0, spent: 0, po: 0, done: 0, progress: 0, pending: 0 };
  });

  fp.forEach(p => {
    const coms = _getCommittees(p);
    const targets = coms.length > 0 ? coms : [COM_UNASSIGNED.key];
    // โครงการ 1 โครงการอาจอยู่ในหลายอนุกรรมการ — นับโครงการซ้ำได้ แต่งบประมาณ pro-rate
    const share = 1 / targets.length;
    targets.forEach(key => {
      const validKey = COM_LIST.find(c => c.key === key) ? key : COM_UNASSIGNED.key;
      const d = map[validKey];
      if (!d.projects.includes(p.id)) d.projects.push(p.id);
      d.budget  += (p.budget || 0) * share;
      d.spent   += (p.spent  || 0) * share;
      d.po      += (p.po     || 0) * share;
      if (p.status === 'done')     d.done++;
      else if (p.status === 'progress') d.progress++;
      else d.pending++;
    });
  });
  return map;
}

function renderCommitteeSection(fp) {
  const qEl = document.getElementById('committeeQuarterLabel');
  if (qEl) qEl.textContent = Q_LABEL[currentQuarter] + ' · ปีงบประมาณ พ.ศ. '+currentYear;

  const map = _comStats(fp);
  const totalBudget = fp.reduce((a, p) => a + (p.budget || 0), 0);

  // ── Metric cards ──
  const metricsEl = document.getElementById('committeeMetrics');
  if (metricsEl) {
     metricsEl.innerHTML = COM_LIST.map(c => {
      const d = map[c.key];
      const pct = d.budget > 0 ? Math.round((d.spent + d.po) / d.budget * 100) : 0;
      const remaining = d.budget - d.spent - d.po;
      const barColor = pct >= 90 ? 'var(--red)' : pct >= 70 ? 'var(--amber)' : c.color;
      return `
        <div onclick="filterByCommittee('${c.key}')" title="คลิกเพื่อดูโครงการของ ${c.label}"
          style="background:${c.colorLight};border:2px solid ${c.color}55;border-radius:14px;padding:14px 16px;cursor:pointer;transition:all .18s;position:relative;overflow:hidden"
          onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(0,0,0,.12)'"
          onmouseout="this.style.transform='';this.style.boxShadow=''">
          <div style="position:absolute;top:0;left:0;width:4px;height:100%;background:${c.color};border-radius:14px 0 0 14px"></div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <div style="display:flex;align-items:center;gap:7px">
              <span style="font-size:18px">${c.icon}</span>
              <span style="font-size:10.5px;font-weight:700;color:${c.color};line-height:1.3">อนุกรรมการ<br>${c.label}</span>
            </div>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${c.color}" stroke-width="2.5" style="opacity:.5;flex-shrink:0"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
          <div style="font-size:22px;font-weight:800;color:${c.color};line-height:1.1;margin-bottom:2px">${fmtFull(d.budget)}</div>
          <div style="font-size:11px;color:var(--text2);margin-bottom:6px">${d.projects.length} โครงการ · คงเหลือ <strong style="color:${remaining < 0 ? 'var(--red)' : 'var(--green)'}">${fmtFull(remaining)}</strong></div>
          <div style="height:4px;background:rgba(0,0,0,.1);border-radius:99px;overflow:hidden">
            <div style="height:100%;width:${Math.min(pct, 100)}%;background:${barColor};border-radius:99px;transition:width .5s"></div>
          </div>
          <div style="font-size:10px;color:var(--text3);margin-top:3px">ใช้+PO: <strong style="color:${barColor}">${pct}%</strong></div>
        </div>`;
    }).join('');
  }

  // ── Detail table ──
  const tbody = document.getElementById('committeeTableBody');
  if (!tbody) return;

  const allComs = [...COM_LIST, COM_UNASSIGNED];
  const rows = allComs.map((c, idx) => {
    const d = map[c.key];
    if (d.projects.length === 0 && c.key === COM_UNASSIGNED.key) return ''; // ซ่อนถ้าไม่มี
    const remaining = d.budget - d.spent - d.po;
    const pct = d.budget > 0 ? Math.round((d.spent + d.po) / d.budget * 100) : 0;
    const barColor = pct >= 90 ? '#dc2626' : pct >= 70 ? '#d97706' : c.color;
    const budgetShare = totalBudget > 0 ? Math.round(d.budget / totalBudget * 100) : 0;
    return `<tr onclick="filterByCommittee('${c.key}')" style="cursor:pointer" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <td>
        <div style="display:flex;align-items:center;gap:7px">
          <span style="font-size:15px">${c.icon}</span>
          <div>
            <div style="font-weight:700;font-size:12px;color:${c.color}">${c.label}</div>
            <div style="font-size:10px;color:var(--text3)">สัดส่วนงบ ${budgetShare}% · คลิกเพื่อดูโครงการ</div>
          </div>
        </div>
      </td>
      <td style="text-align:center">${d.projects.length}</td>
      <td class="td-num">${fmtFull(Math.round(d.budget))}</td>
      <td class="td-num">${fmtFull(Math.round(d.spent))}</td>
      <td class="td-num">${fmtFull(Math.round(d.po))}</td>
      <td class="td-num" style="${remaining < 0 ? 'color:var(--red)' : ''}">${fmtFull(Math.round(remaining))}</td>
      <td>
        <div style="display:flex;align-items:center;gap:7px">
          <div style="flex:1;height:5px;background:var(--surface2);border-radius:99px;overflow:hidden">
            <div style="height:100%;width:${Math.min(pct, 100)}%;background:${barColor};border-radius:99px;transition:width .5s"></div>
          </div>
          <span style="font-size:11px;color:var(--text2);min-width:32px;text-align:right">${pct}%</span>
        </div>
      </td>
      <td style="text-align:center;font-size:12px">
        <span style="color:var(--green);margin-right:3px">✅${d.done}</span>
        <span style="color:var(--accent);margin-right:3px">⏳${d.progress}</span>
        <span style="color:var(--text3)">○${d.pending}</span>
      </td>
    </tr>`;
  }).filter(Boolean);

  // Total row
  const totBudget  = allComs.reduce((a, c) => a + map[c.key].budget, 0);
  const totSpent   = allComs.reduce((a, c) => a + map[c.key].spent, 0);
  const totPo      = allComs.reduce((a, c) => a + map[c.key].po, 0);
  const totRem     = totBudget - totSpent - totPo;
  const totPct     = totBudget > 0 ? Math.round((totSpent + totPo) / totBudget * 100) : 0;
  const totProj    = fp.length;
  rows.push(`<tr style="background:var(--surface2);font-weight:700">
    <td>รวมทั้งหมด (${COM_LIST.length} อนุกรรมการ)</td>
    <td style="text-align:center">${totProj}</td>
    <td class="td-num">${fmtFull(Math.round(totBudget))}</td>
    <td class="td-num">${fmtFull(Math.round(totSpent))}</td>
    <td class="td-num">${fmtFull(Math.round(totPo))}</td>
    <td class="td-num" style="${totRem < 0 ? 'color:var(--red)' : ''}">${fmtFull(Math.round(totRem))}</td>
    <td>
      <div style="display:flex;align-items:center;gap:7px">
        <div style="flex:1;height:5px;background:var(--border2);border-radius:99px;overflow:hidden">
          <div style="height:100%;width:${Math.min(totPct, 100)}%;background:var(--accent);border-radius:99px"></div>
        </div>
        <span style="font-size:11px;color:var(--text2);min-width:32px;text-align:right">${totPct}%</span>
      </div>
    </td>
    <td style="text-align:center;font-size:12px">
      <span style="color:var(--green);margin-right:3px">✅${fp.filter(p=>p.status==='done').length}</span>
      <span style="color:var(--accent);margin-right:3px">⏳${fp.filter(p=>p.status==='progress').length}</span>
      <span style="color:var(--text3)">○${fp.filter(p=>p.status==='pending').length}</span>
    </td>
  </tr>`);

  tbody.innerHTML = rows.join('');
}

function renderCommitteeChart(fp) {
  const map = _comStats(fp);
  const chartFont = { family: "'Sarabun', sans-serif", size: 11 };

  // destroy & recreate canvas
  const old = document.getElementById('chartCommitteeBudget');
  if (!old) return;
  const clone = document.createElement('canvas');
  clone.id = 'chartCommitteeBudget';
  old.parentNode.replaceChild(clone, old);

  const labels  = COM_LIST.map(c => c.label.replace('ด้าน', ''));
  const budgets = COM_LIST.map(c => Math.round(map[c.key].budget));
  const spents  = COM_LIST.map(c => Math.round(map[c.key].spent));
  const pos     = COM_LIST.map(c => Math.round(map[c.key].po));
  const rems    = COM_LIST.map((c, i) => Math.max(budgets[i] - spents[i] - pos[i], 0));
  const colors  = COM_LIST.map(c => c.color);

  chartCommitteeBudget = new Chart(clone, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'ใช้ไปแล้ว',
          data: spents,
          backgroundColor: colors.map(c => c + 'cc'),
          borderColor: colors,
          borderWidth: 0,
          borderRadius: { topLeft: 0, topRight: 0, bottomLeft: 6, bottomRight: 6 },
          borderSkipped: false
        },
        {
          label: 'PO ผูกพัน',
          data: pos,
          backgroundColor: ['#d97706cc', '#d97706cc', '#d97706cc', '#d97706cc'],
          borderWidth: 0,
          borderRadius: 0,
          borderSkipped: false
        },
        {
          label: 'คงเหลือ',
          data: rems,
          backgroundColor: ['#e2e8f0bb', '#e2e8f0bb', '#e2e8f0bb', '#e2e8f0bb'],
          borderWidth: 0,
          borderRadius: { topLeft: 6, topRight: 6, bottomLeft: 0, bottomRight: 0 },
          borderSkipped: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(28,35,51,.92)',
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString('th-TH')} บาท`
          },
          bodyFont: chartFont,
          titleFont: { ...chartFont, weight: '700' }
        }
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: { font: { family: "'Sarabun', sans-serif", size: 10 }, color: '#5a6477', maxRotation: 0 },
          border: { display: false }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          grid: { color: 'rgba(0,0,0,.04)' },
          border: { display: false },
          ticks: {
            font: chartFont,
            color: '#9aa3b2',
            callback: v => v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v
          }
        }
      },
      animation: { duration: 600 }
    }
  });

  // Legend
  const leg = document.getElementById('chartCommitteeLegend');
  if (leg) {
    leg.innerHTML = [
      ['', 'งบอนุมัติแยกตามอนุกรรมการ', ''],
      ...COM_LIST.map((c, i) => [c.color, c.label.replace('ด้าน', ''), fmtFull(budgets[i]) + ' บาท'])
    ].slice(1).map(([color, label, val]) => `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
        <div style="display:flex;align-items:center;gap:5px">
          <span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0"></span>
          <span style="font-size:11px;color:var(--text2)">${label}</span>
        </div>
        <span style="font-weight:700;font-size:12px;color:var(--text)">${val}</span>
      </div>`).join('');
  }
}

// ===== GOOGLE SHEETS =====
// *** URL ตายตัว — ดึงข้อมูลจาก Sheet นี้เท่านั้น ***
const GAS_URL_2570 = 'https://script.google.com/macros/s/AKfycbwUkoA5OwJAOx92PUjtT2rn9AICy30C1ZnY78_bTTx6kDH8VCl_NaXsc2hqQWWwZh4P/exec';
let _gasUrl = GAS_URL_2570;
let GAS_ENABLED = true;

// ── gasPost: ส่งผ่าน GET parameter เพื่อหลีกเลี่ยงปัญหา CORS/redirect ──
// GAS Web App จาก browser ภายนอก: POST body มักหายระหว่าง redirect
// วิธีที่เสถียรที่สุดคือส่งทุกอย่างผ่าน GET query string
// ── gasJsonp: เรียก GAS ด้วย JSONP (ใช้สำหรับ getAll เท่านั้น) ──────
function gasJsonp(params){
  return new Promise((resolve, reject) => {
    const cbName = '_gasCb_' + Date.now() + '_' + Math.floor(Math.random()*10000);
    const timeout = setTimeout(() => {
      delete window[cbName];
      if(script.parentNode) script.remove();
      reject(new Error('GAS timeout'));
    }, 30000);

    window[cbName] = function(data){
      clearTimeout(timeout);
      delete window[cbName];
      if(script.parentNode) script.remove();
      resolve(data);
    };

    const p = new URLSearchParams({ ...params, callback: cbName });
    const script = document.createElement('script');
    script.src = _gasUrl + '?' + p.toString();
    script.onerror = () => {
      clearTimeout(timeout);
      delete window[cbName];
      if(script.parentNode) script.remove();
      reject(new Error('Script load error'));
    };
    document.head.appendChild(script);
  });
}

// ── gasPost: ส่งข้อมูลขึ้น GAS ด้วย JSONP (รับ response จริง ไม่มีปัญหา CORS) ──────
// เข้ารหัส payload เป็น base64 เพื่อหลีกเลี่ยง URL limit และอักขระพิเศษ
function gasPost(action, payload){
  // หากข้อมูลมีขนาดใหญ่เกินไป (เช่น มีรูปภาพเยอะหรือตารางยาว) การใช้ JSONP (GET) อาจล้มเหลวเนื่องจาก URL ยาวเกินไป
  // เราจะพยายามใช้ fetch POST ก่อน ถ้าติด CORS ค่อย fallback ไป JSONP ที่ปลอดภัยขึ้น
  const bodyData = JSON.stringify({ action, ...payload });
  
  // ตรวจสอบขนาดข้อมูลเบื้องต้น (ถ้าเกิน 4KB แนะนำให้ใช้ POST)
  const isLargeData = bodyData.length > 4000;

  return new Promise((resolve, reject) => {
    // พยายามส่งด้วย fetch POST (ต้องตั้งค่า GAS ให้รองรับ OPTIONS/CORS หรือใช้ mode: 'no-cors')
    // แต่ GAS Web App ไม่รองรับ CORS แบบเต็มรูปแบบสำหรับ POST จาก domain อื่น
    // ดังนั้นเราจะใช้ฟอร์มซ่อน (Hidden Form) เพื่อส่ง POST ข้าม domain โดยไม่ติด CORS
    
    if (isLargeData) {
      console.log('Large data detected, using form submission fallback');
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = _gasUrl;
      form.target = 'gas-post-iframe';
      form.style.display = 'none';

      const input = document.createElement('input');
      input.name = 'payload';
      input.value = bodyData;
      form.appendChild(input);

      let iframe = document.getElementById('gas-post-iframe');
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'gas-post-iframe';
        iframe.name = 'gas-post-iframe';
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
      }

      document.body.appendChild(form);
      form.submit();
      
      // เนื่องจากส่งผ่าน iframe เราจะไม่ได้รับ response กลับมาตรงๆ 
      // จึงขอสมมติว่าสำเร็จหลังจากผ่านไป 3 วินาที (หรือผู้ใช้สามารถตรวจสอบผ่านการ sync ภายหลัง)
      setTimeout(() => {
        if (form.parentNode) form.remove();
        // ลองยิง sync เงียบๆ เพื่อเช็คว่าข้อมูลเข้าจริงไหม
        if (typeof _syncFromSheetSilent === 'function') _syncFromSheetSilent();
        resolve({ success: true, method: 'form-post' });
      }, 4000);
      return;
    }

    // สำหรับข้อมูลขนาดเล็ก ใช้ JSONP ตามเดิมแต่ปรับปรุงการเข้ารหัส
    const cbName = '_gasCb_' + Date.now() + '_' + Math.floor(Math.random()*10000);
    const timeout = setTimeout(() => {
      delete window[cbName];
      if (script && script.parentNode) script.remove();
      resolve({ success: true, _timeout: true });
    }, 30000);

    window[cbName] = function(data){
      clearTimeout(timeout);
      delete window[cbName];
      if (script && script.parentNode) script.remove();
      resolve(data);
    };

    let payloadStr;
    try { 
      // ใช้การเข้ารหัสที่ปลอดภัยสำหรับภาษาไทย
      payloadStr = btoa(encodeURIComponent(bodyData).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode('0x' + p1))); 
    } catch(e) { 
      payloadStr = encodeURIComponent(bodyData); 
    }

    const p = new URLSearchParams({ action, payload: payloadStr, callback: cbName });
    const script = document.createElement('script');
    script.src = _gasUrl + '?' + p.toString();
    script.onerror = () => {
      clearTimeout(timeout);
      delete window[cbName];
      if (script && script.parentNode) script.remove();
      reject(new Error('Network error — ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต'));
    };
    document.head.appendChild(script);
  });
}

// ── gasFetchPost: ส่งข้อมูลไป GAS ด้วย fetch POST + รับ JSON ตอบกลับจริง ──────
// ใช้สำหรับงานที่ต้องรอผลลัพธ์ทันที เช่น อัปโหลด/ลบไฟล์เอกสารแนบบน Drive
// Content-Type: text/plain เพื่อหลีกเลี่ยง CORS preflight (OPTIONS) ที่ GAS ไม่รองรับ
function gasFetchPost(action, data){
  return fetch(_gasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, data })
  }).then(res => {
    if(!res.ok) throw new Error('GAS HTTP ' + res.status);
    return res.json();
  });
}

// ── fileToBase64: แปลงไฟล์เป็น base64 (ไม่รวม data: prefix) ──────
function fileToBase64(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    reader.readAsDataURL(file);
  });
}

// ── uploadDocFileToGas: อัปโหลดไฟล์เอกสารแนบ (PDF/Word/Excel ฯลฯ) ──────
// ขึ้น Google Drive folder ที่กำหนดไว้ใน GAS (DOC_FOLDER_ID) ผ่าน action 'uploadDocFile'
async function uploadDocFileToGas(file){
  const base64Data = await fileToBase64(file);
  const res = await gasFetchPost('uploadDocFile', {
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    base64Data
  });
  if(!res || !res.success) throw new Error((res && res.message) || 'Upload failed');
  return res;
}

// ── cloudinaryUpload: อัปโหลดตรงจาก browser → Cloudinary ──────
// ไม่ผ่าน GAS เลย → เร็วกว่าเดิมมาก ไม่มีปัญหา chunk/JSONP
const CLOUDINARY_CLOUD  = 'deyqenuv3';
const CLOUDINARY_PRESET = 'DLFProject';

async function cloudinaryUpload(dataUrl, fileName){
  const formData = new FormData();
  formData.append('file', dataUrl);
  formData.append('upload_preset', CLOUDINARY_PRESET);
  formData.append('public_id', fileName.replace(/[^a-zA-Z0-9_-]/g, '_') + '_' + Date.now());

  const res = await fetch(
    'https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD + '/image/upload',
    { method: 'POST', body: formData }
  );
  if(!res.ok) throw new Error('Cloudinary HTTP ' + res.status);
  const data = await res.json();
  if(data.error) throw new Error(data.error.message);
  return { url: data.secure_url, publicId: data.public_id };
}

function applyGasUrl(){
  const val = document.getElementById('gasUrlInput').value.trim();
  if(!val || !val.startsWith('https://script.google.com')){
    document.getElementById('gasUrlStatus').innerHTML='<span style="color:var(--red)">❌ URL ไม่ถูกต้อง ต้องขึ้นต้นด้วย https://script.google.com</span>';
    return;
  }
  _gasUrl = val;
  GAS_ENABLED = true;
  localStorage.setItem('gasUrl_'+currentYear, val);
  document.getElementById('gasUrlStatus').innerHTML='<span style="color:var(--green)">✅ ตั้งค่าสำเร็จ (ปี '+currentYear+') — การเปลี่ยนแปลงทุกครั้งจะ Sync ขึ้น Sheet อัตโนมัติ</span>';
}

function _initGasUI(){
  // URL ตายตัว — ไม่ให้เปลี่ยน
  _gasUrl = GAS_URL_2570;
  GAS_ENABLED = true;
  const el = document.getElementById('gasUrlInput');
  if(el){ el.value = GAS_URL_2570; el.disabled = true; el.style.background='var(--surface2)'; el.style.color='var(--text3)'; }
  const st = document.getElementById('gasUrlStatus');
  if(st) st.innerHTML='<span style="color:var(--green)">🔒 URL ล็อคแล้ว — เชื่อมต่อ Google Sheet ปี 2570 อัตโนมัติ</span>';
}

function copyGASTemplate(){
  var tpl = `// ===== Google Apps Script สำหรับ DLTV Report 2570 (Full Fields + JSONP) =====
// วางโค้ดนี้ใน Google Apps Script แล้ว Deploy เป็น Web App
// Execute as: Me | Who has access: Anyone

function doGet(e) {
  const cb = e.parameter.callback;
  const action = e.parameter.action;

  function jsonp(obj) {
    const json = JSON.stringify(obj);
    if (cb) {
      return ContentService.createTextOutput(cb + '(' + json + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(json)
      .setMimeType(ContentService.MimeType.JSON);
  }

  try {
    if (action === 'getAll') return jsonp(getAllData());

    if (e.parameter.payload) {
      let data;
      try {
        const decoded = Utilities.newBlob(Utilities.base64Decode(e.parameter.payload)).getDataAsString();
        data = JSON.parse(decoded);
      } catch(ex) {
        data = JSON.parse(decodeURIComponent(e.parameter.payload));
      }
      const act = data.action || action;
      if (act === 'save' || act === 'update') return jsonp(saveProject(data.data));
      if (act === 'delete') return jsonp(deleteProject(data.id));
      if (act === 'bulkSave') return jsonp(bulkSave(data.data));
      if (act === 'updateImages') return jsonp(updateImages(data.id, data.images));
      if (act === 'deleteCloudinaryImage') return jsonp({success:true});
    }

    return jsonp({success:false, message:'Unknown action: ' + action});
  } catch(err) {
    return jsonp({success:false, message: err.message});
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;
    if (action === 'save' || action === 'update') return ok(saveProject(payload.data));
    if (action === 'delete')   return ok(deleteProject(payload.id));
    if (action === 'bulkSave') return ok(bulkSave(payload.data));
    return ok({message:'Unknown action'});
  } catch(err) {
    return err_(err.message);
  }
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName('Project70') || ss.getSheets()[0];
}

function getHeaders() {
  return [
    'id', 'name', 'strategy', 'subStrategy', 'budget', 'spent', 'po', 'status', 'progress',
    'result', 'kpi', 'problems', 'solutions', 'quarter',
    'owner', 'dept', 'coordinator', 'position', 'duration', 'projectType',
    'rationale', 'objective', 'targetQuantity', 'target', 'expectedBenefit',
    'proposer', 'proposerPos', 'approver', 'approverPos', 'authorizer', 'authorizerPos',
    'committees', 'activities_json', 'budget_detail_json', 'eval_rows_json',
    'image_count', 'images_json'
  ];
}

function ensureHeaders() {
  const sheet = getSheet();
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(getHeaders());
    sheet.getRange(1, 1, 1, getHeaders().length)
      .setBackground('#3b72f0').setFontColor('#ffffff').setFontWeight('bold');
  }
}

function rowToObj(row) {
  const h = getHeaders();
  const obj = {};
  h.forEach((k, i) => { obj[k] = row[i] !== undefined ? row[i] : ''; });
  obj.budget   = Number(obj.budget)   || 0;
  obj.spent    = Number(obj.spent)    || 0;
  obj.po       = Number(obj.po)       || 0;
  obj.progress = Number(obj.progress) || 0;
  obj.kpi      = obj.kpi ? String(obj.kpi).split('|').filter(Boolean) : [];
  try { obj.committees   = obj.committees         ? JSON.parse(obj.committees)         : []; } catch(e){ obj.committees=[]; }
  try { obj.activities   = obj.activities_json    ? JSON.parse(obj.activities_json)    : []; } catch(e){ obj.activities=[]; }
  try { obj.budgetDetail = obj.budget_detail_json ? JSON.parse(obj.budget_detail_json) : []; } catch(e){ obj.budgetDetail=[]; }
  try { obj.evalRows     = obj.eval_rows_json     ? JSON.parse(obj.eval_rows_json)     : []; } catch(e){ obj.evalRows=[]; }
  try { obj.images       = obj.images_json        ? JSON.parse(obj.images_json)        : []; } catch(e){ obj.images=[]; }
  delete obj.activities_json; delete obj.budget_detail_json;
  delete obj.eval_rows_json; delete obj.images_json; delete obj.image_count;
  return obj;
}

function objToRow(d) {
  const images = d.images || [];
  return [
    d.id, d.name, d.strategy||1, d.subStrategy||'',
    d.budget||0, d.spent||0, d.po||0,
    d.status||'pending', d.progress||0,
    d.result||'', (d.kpi||[]).join('|'),
    d.problems||'', d.solutions||'', d.quarter||'all',
    d.owner||'', d.dept||'', d.coordinator||'', d.position||'',
    d.duration||'', d.projectType||'ต่อเนื่อง',
    d.rationale||'', d.objective||'', d.targetQuantity||'', d.target||'', d.expectedBenefit||'',
    d.proposer||'', d.proposerPos||'', d.approver||'', d.approverPos||'',
    d.authorizer||'', d.authorizerPos||'',
    JSON.stringify(d.committees||[]),
    JSON.stringify(d.activities||[]),
    JSON.stringify(d.budgetDetail||[]),
    JSON.stringify(d.evalRows||[]),
    images.length,
    JSON.stringify(images.map(i=>({name:i.name||'', url:i.url||'', publicId:i.publicId||''})))
  ];
}

function getAllData() {
  ensureHeaders();
  const sheet = getSheet();
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return {success:true, data:[]};
  return {success:true, data: rows.slice(1).map(rowToObj)};
}

function saveProject(d) {
  ensureHeaders();
  const sheet = getSheet();
  const rows = sheet.getDataRange().getValues();
  let rowIdx = -1;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(d.id)) { rowIdx = i + 1; break; }
  }
  const row = objToRow(d);
  if (rowIdx > 0) {
    sheet.getRange(rowIdx, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
  return {success:true};
}

function deleteProject(id) {
  const sheet = getSheet();
  const rows = sheet.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0]) === String(id)) { sheet.deleteRow(i + 1); break; }
  }
  return {success:true};
}

function updateImages(id, imagesJson) {
  const sheet = getSheet();
  const rows = sheet.getDataRange().getValues();
  const h = getHeaders();
  const imgColIdx = h.indexOf('images_json') + 1;
  const cntColIdx = h.indexOf('image_count') + 1;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) {
      try {
        const imgs = typeof imagesJson === 'string' ? JSON.parse(imagesJson) : imagesJson;
        sheet.getRange(i + 1, imgColIdx).setValue(JSON.stringify(imgs));
        sheet.getRange(i + 1, cntColIdx).setValue(imgs.length);
      } catch(e) {}
      break;
    }
  }
  return {success:true};
}

function bulkSave(data) {
  ensureHeaders();
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
  if (data && data.length) {
    const rows = data.map(objToRow);
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
  return {success:true, count: data ? data.length : 0};
}

function ok(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function err_(msg) {
  return ContentService.createTextOutput(JSON.stringify({success:false, message:msg}))
    .setMimeType(ContentService.MimeType.JSON);
}`;
  navigator.clipboard.writeText(tpl).then(()=>{
    document.getElementById('gasTemplateCopyStatus').textContent = '✅ คัดลอก GAS Template สำเร็จ (รองรับ owner + อนุกรรมการ + รูปภาพ)';
    setTimeout(()=>{ document.getElementById('gasTemplateCopyStatus').textContent=''; }, 4000);
  }).catch(()=>{
    document.getElementById('gasTemplateCopyStatus').textContent = '❌ ไม่สามารถคัดลอกอัตโนมัติได้ กรุณาคัดลอกโค้ดด้วยตนเอง';
  });
}

function loadFromSheet(){
  if(!confirm('⚠️ การโหลดจาก Sheet จะแทนที่ข้อมูลปัจจุบันในหน้าเว็บทั้งหมด\nยืนยันหรือไม่?')) return;
  const statusEl=document.getElementById('gsStatus');
  statusEl && (statusEl.innerHTML='<div class="status-msg status-info">⏳ กำลังโหลดข้อมูลจาก Google Sheet...</div>');
  fetch(`${_gasUrl}?action=getAll`, { redirect: 'follow' })
    .then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
    .then(res=>{
      if(!res.success) throw new Error(res.message);
      return fetchAllReports().then(reportRows=>{
        projects = mergeReportsIntoProjects(res.data, reportRows);
        statusEl && (statusEl.innerHTML=`<div class="status-msg status-ok">✅ โหลดสำเร็จ ${projects.length} โครงการ (จาก Google Sheet)</div>`);
        saveToLocal(true); renderTable(); updateDashboard();
      });
    })
    .catch(e=>{
      statusEl && (statusEl.innerHTML=`<div class="status-msg status-err">❌ โหลดไม่สำเร็จ: ${e.message}</div>`);
    });
}

function syncAllToSheet(){
  const statusEl=document.getElementById('gsStatus');
  statusEl && (statusEl.innerHTML='<div class="status-msg status-info">⏳ กำลัง Sync ข้อมูลทั้งหมดขึ้น Google Sheet...</div>');
  // ส่งทีละโครงการ (upsert) แทน bulkSave เพื่อหลีกเลี่ยงปัญหา payload ใหญ่เกินไป
  // ส่งทั้งข้อมูลแผน (Project70) และผลการดำเนินงาน (ReportResult) แยกกัน
  const tasks = projects.map(p => gasPost('update', { data: p }));
  const reportTasks = projects.map(p => gasPost('saveReport', { data: buildReportPayload(p) }));
  Promise.all([...tasks, ...reportTasks])
    .then(()=>{
      statusEl && (statusEl.innerHTML=`<div class="status-msg status-ok">✅ Sync สำเร็จ ${projects.length} โครงการขึ้น Google Sheet แล้ว</div>`);
    })
    .catch(e=>{ statusEl && (statusEl.innerHTML=`<div class="status-msg status-err">❌ ${e.message}</div>`); });
}

// สร้าง payload สำหรับ Sheet "ผลการดำเนินงาน" (ReportResult) จากข้อมูลโครงการที่รวมอยู่ใน memory
function buildReportPayload(p){
  return {
    id: p.id, name: p.name, strategy: p.strategy,
    status: p.status||'pending', quarter: p.quarter||'all',
    spent: p.spent||0, po: p.po||0,
    result: p.result||'', problems: p.problems||'', solutions: p.solutions||'',
    images: p.images||[],
    lastEditedBy: p.lastEditedBy||'', lastEditedByPosition: p.lastEditedByPosition||'', lastEditedAt: p.lastEditedAt||''
  };
}

function exportCSV(){
  const headers=['id','name','strategy','budget','spent','po','status','result','kpi','problems','solutions','quarter','image_count','lastEditedBy','lastEditedByPosition','lastEditedAt'];
  const rows=[headers,...projects.map(p=>[
    p.id,'"'+(p.name||'').replace(/"/g,'""')+'"',
    p.strategy,p.budget||0,p.spent||0,p.po||0,p.status,
    '"'+(p.result||'').replace(/"/g,'""')+'"',
    '"'+(p.kpi||[]).join('|').replace(/"/g,'""')+'"',
    '"'+(p.problems||'').replace(/"/g,'""')+'"',
    '"'+(p.solutions||'').replace(/"/g,'""')+'"',
    p.quarter||'all',
    (p.images||[]).length,
    '"'+(p.lastEditedBy||'').replace(/"/g,'""')+'"',
    '"'+(p.lastEditedByPosition||'').replace(/"/g,'""')+'"',
    '"'+(p.lastEditedAt||'').replace(/"/g,'""')+'"'
  ])];
  const csv=rows.map(r=>r.join(',')).join('\n');
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='รายงานผลดำเนินงาน_DLTV_'+currentYear+'.csv';
  a.click();
  document.getElementById('gsStatus').innerHTML='<div class="status-msg status-ok">✅ ดาวน์โหลด CSV สำเร็จ (รูปภาพถูกส่งใน JSON แยกต่างหาก)</div>';
}

// ===== ACTIVITY LOG =====
const ACTLOG_KEY  = 'dltv_actlog_2570';
const ACTLOG_PAGE = 15; // rows per page
let _actlogPage   = 1;

// ── Field label map ─────────────────────────────────────────
const FIELD_LABELS = {
  name:'ชื่อโครงการ', strategy:'ยุทธศาสตร์', subStrategy:'กลยุทธ์', owner:'ฝ่าย/กลุ่ม',
  dept:'หน่วยงาน', coordinator:'ผู้รับผิดชอบ', position:'ตำแหน่ง', duration:'ระยะเวลา',
  projectType:'ลักษณะโครงการ', budget:'งบประมาณ', spent:'งบที่ใช้', po:'PO',
  status:'สถานะ', progress:'ความคืบหน้า(%)', result:'ผลการดำเนินงาน',
  problems:'ปัญหา/อุปสรรค', solutions:'แนวทางแก้ไข', objective:'วัตถุประสงค์',
  rationale:'หลักการและเหตุผล', target:'เป้าหมาย', targetQuantity:'เป้าหมายเชิงปริมาณ',
  expectedBenefit:'ผลที่คาดว่าจะได้รับ', proposer:'ผู้เสนอ', approver:'ผู้เห็นชอบ',
  authorizer:'ผู้อนุมัติ', kpi:'KPI', activities:'แผนกิจกรรม (Gantt)',
  budgetDetail:'รายละเอียดงบ', images:'รูปภาพ', docFiles:'เอกสารแนบ',
  committees:'อนุกรรมการ', evalRows:'การประเมิน', quarter:'ไตรมาส'
};

// ── อ่าน / เขียน log ────────────────────────────────────────
function _readActlog() {
  try { return JSON.parse(localStorage.getItem(ACTLOG_KEY) || '[]'); } catch(e){ return []; }
}
function _writeActlog(logs) {
  // เก็บไม่เกิน 500 รายการ (กัน localStorage เต็ม)
  try { localStorage.setItem(ACTLOG_KEY, JSON.stringify(logs.slice(-500))); } catch(e){}
}

// ── diff สองโครงการ หา field ที่เปลี่ยน ────────────────────
function _diffProject(oldP, newP) {
  const changed = [];
  const SKIP = ['id','images','docFiles','activities','budgetDetail','evalRows','committees'];
  for (const key of Object.keys(FIELD_LABELS)) {
    if (SKIP.includes(key)) continue;
    const ov = Array.isArray(oldP[key]) ? oldP[key].join(', ') : String(oldP[key] ?? '');
    const nv = Array.isArray(newP[key]) ? newP[key].join(', ') : String(newP[key] ?? '');
    if (ov !== nv) changed.push({ key, label: FIELD_LABELS[key], from: ov, to: nv });
  }
  // ตรวจ array fields แบบ shallow (เปรียบเทียบ JSON)
  const ARR = ['images','activities','budgetDetail','evalRows'];
  for (const key of ARR) {
    if (JSON.stringify(oldP[key]) !== JSON.stringify(newP[key]))
      changed.push({ key, label: FIELD_LABELS[key], from: '(เดิม)', to: '(ใหม่)' });
  }
  return changed;
}

// ── บันทึก log ──────────────────────────────────────────────
function actlogRecord(action, project, changedFields, oldProject) {
  const user = (typeof _currentUser !== 'undefined' && _currentUser)
    ? (_currentUser.isGuest ? 'ผู้เยี่ยมชม' : _currentUser.name)
    : 'ไม่ระบุ';
  const email = (typeof _currentUser !== 'undefined' && _currentUser && !_currentUser.isGuest)
    ? (_currentUser.email || '') : '';
  const position = (typeof _currentUser !== 'undefined' && _currentUser && !_currentUser.isGuest)
    ? (_currentUser.position || '') : '';
  const logs = _readActlog();
  logs.push({
    id:        Date.now(),
    ts:        new Date().toISOString(),
    action,
    user,
    email,
    position,
    projectId: project.id,
    projectName: project.name || '(ไม่มีชื่อ)',
    fields:    changedFields || [],
    snapshot:  action === 'ลบ' ? { name: project.name, strategy: project.strategy, budget: project.budget } : null
  });
  _writeActlog(logs);
}

// ── render ──────────────────────────────────────────────────
function renderActlog() {
  const search   = (document.getElementById('actlogSearch')?.value || '').toLowerCase();
  const filterAc = document.getElementById('actlogFilterAction')?.value || '';

  let logs = _readActlog().reverse(); // ใหม่ก่อน

  if (search) logs = logs.filter(l =>
    l.user.toLowerCase().includes(search) ||
    l.projectName.toLowerCase().includes(search) ||
    (l.email || '').toLowerCase().includes(search)
  );
  if (filterAc) logs = logs.filter(l => l.action === filterAc);

  // Summary bar
  const all   = _readActlog();
  const sumEl = document.getElementById('actlogSummaryBar');
  if (sumEl) {
    const cnt = (a) => all.filter(l=>l.action===a).length;
    const uniqueUsers = [...new Set(all.map(l=>l.user))];
    sumEl.innerHTML = [
      `<span style="font-size:12px;color:var(--text2)">รายการทั้งหมด <strong style="color:var(--text)">${all.length}</strong> รายการ</span>`,
      `<span style="background:var(--green-light);color:var(--green);border:1px solid #86d9b0;border-radius:99px;padding:3px 10px;font-size:12px;font-weight:600">➕ เพิ่ม ${cnt('เพิ่ม')}</span>`,
      `<span style="background:var(--amber-light);color:var(--amber);border:1px solid #f6cc70;border-radius:99px;padding:3px 10px;font-size:12px;font-weight:600">✏️ แก้ไข ${cnt('แก้ไข')}</span>`,
      `<span style="background:var(--red-light);color:var(--red);border:1px solid #fca5a5;border-radius:99px;padding:3px 10px;font-size:12px;font-weight:600">🗑️ ลบ ${cnt('ลบ')}</span>`,
      `<span style="font-size:12px;color:var(--text3);margin-left:auto">ผู้ใช้ทั้งหมด ${uniqueUsers.length} คน</span>`
    ].join('');
  }

  const tbody  = document.getElementById('actlogBody');
  const empty  = document.getElementById('actlogEmpty');
  const pager  = document.getElementById('actlogPager');
  if (!tbody) return;

  if (!logs.length) {
    tbody.innerHTML = ''; empty.style.display = ''; pager.innerHTML = ''; return;
  }
  empty.style.display = 'none';

  // Pagination
  const totalPages = Math.ceil(logs.length / ACTLOG_PAGE);
  _actlogPage = Math.min(_actlogPage, totalPages);
  const slice = logs.slice((_actlogPage-1)*ACTLOG_PAGE, _actlogPage*ACTLOG_PAGE);
  const globalOffset = (_actlogPage-1)*ACTLOG_PAGE;

  // Action badge
  const badge = (a) => {
    const map = {
      'เพิ่ม':  ['#dcfce7','#166534','➕ เพิ่ม'],
      'แก้ไข': ['#fef9c3','#92400e','✏️ แก้ไข'],
      'ลบ':   ['#fee2e2','#991b1b','🗑️ ลบ']
    };
    const [bg,col,label] = map[a] || ['var(--surface2)','var(--text2)',a];
    return `<span style="background:${bg};color:${col};padding:2px 9px;border-radius:99px;font-size:11px;font-weight:700">${label}</span>`;
  };

  tbody.innerHTML = slice.map((l, i) => {
    const dt = new Date(l.ts);
    const dateStr = dt.toLocaleDateString('th-TH',{day:'2-digit',month:'short',year:'2-digit'});
    const timeStr = dt.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
    const rowNum  = globalOffset + i + 1;
    const initials = l.user === 'ผู้เยี่ยมชม' ? '👁' : l.user.slice(0,1).toUpperCase();
    const fieldList = l.fields.length
      ? l.fields.slice(0,4).map(f=>`<span style="display:inline-block;background:var(--accent-light);color:var(--accent);border-radius:4px;padding:1px 6px;font-size:11px;margin:1px">${f.label}</span>`).join('') + (l.fields.length>4?`<span style="font-size:11px;color:var(--text3)"> +${l.fields.length-4}</span>`:'')
      : (l.action==='เพิ่ม' ? '<span style="font-size:11px;color:var(--text3)">โครงการใหม่</span>'
       : l.action==='ลบ'  ? '<span style="font-size:11px;color:var(--text3)">—</span>'
       : '<span style="font-size:11px;color:var(--text3)">ไม่มีการเปลี่ยนแปลง</span>');

    const detailBtn = l.fields.length
      ? `<button onclick="showActlogDetail(${l.id})" style="border:none;background:none;cursor:pointer;font-size:11px;color:var(--accent);text-decoration:underline;padding:0">ดูเพิ่ม</button>`
      : '—';

    return `<tr style="border-bottom:1px solid var(--border);transition:background .12s" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <td style="padding:10px 14px;color:var(--text3);font-size:12px">${rowNum}</td>
      <td style="padding:10px 14px;white-space:nowrap">
        <div style="font-weight:600;font-size:13px">${dateStr}</div>
        <div style="font-size:11px;color:var(--text3)">${timeStr}</div>
      </td>
      <td style="padding:10px 14px">
        <div style="display:flex;align-items:center;gap:7px">
          <span style="width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#059669,#3b72f0);color:#fff;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">${initials}</span>
          <div>
            <div style="font-weight:600;font-size:13px">${escapeHtml(l.user)}</div>
            ${l.position ? `<div style="font-size:11px;color:var(--accent);font-weight:600">${escapeHtml(l.position)}</div>` : ''}
            ${l.email ? `<div style="font-size:11px;color:var(--text3)">${escapeHtml(l.email)}</div>` : ''}
          </div>
        </div>
      </td>
      <td style="padding:10px 14px">${badge(l.action)}</td>
      <td style="padding:10px 14px;max-width:200px">
        <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${l.projectName}">${l.projectName}</div>
        <div style="font-size:11px;color:var(--text3)">ID: ${l.projectId ?? '—'}</div>
      </td>
      <td style="padding:10px 14px">${fieldList}</td>
      <td style="padding:10px 14px;text-align:center">${detailBtn}</td>
    </tr>`;
  }).join('');

  // Pager
  if (totalPages <= 1) { pager.innerHTML = ''; return; }
  let ph = '';
  for (let p = 1; p <= totalPages; p++) {
    ph += `<button onclick="_actlogPage=${p};renderActlog()" style="padding:4px 10px;border:1px solid ${p===_actlogPage?'var(--accent)':'var(--border)'};border-radius:6px;background:${p===_actlogPage?'var(--accent)':'var(--surface)'};color:${p===_actlogPage?'#fff':'var(--text)'};cursor:pointer;font-size:12px">${p}</button>`;
  }
  pager.innerHTML = ph;
}

// ── modal รายละเอียด diff ────────────────────────────────────
function showActlogDetail(logId) {
  const log = _readActlog().find(l => l.id === logId);
  if (!log) return;
  const dt  = new Date(log.ts).toLocaleString('th-TH');
  const rows = log.fields.map(f => `
    <tr style="border-bottom:1px solid var(--border)">
      <td style="padding:8px 12px;font-weight:700;font-size:13px;white-space:nowrap;color:var(--accent)">${f.label}</td>
      <td style="padding:8px 12px;font-size:12px;color:var(--red);max-width:200px;word-break:break-word">${f.from || '—'}</td>
      <td style="padding:8px 12px;font-size:13px;color:var(--text3)">→</td>
      <td style="padding:8px 12px;font-size:12px;color:var(--green);max-width:200px;word-break:break-word">${f.to || '—'}</td>
    </tr>`).join('');

  const html = `<div style="position:fixed;inset:0;background:rgba(10,15,30,.6);backdrop-filter:blur(5px);z-index:2000;display:flex;align-items:center;justify-content:center;padding:1rem" onclick="if(event.target===this)this.remove()">
    <div style="background:var(--surface);border-radius:14px;box-shadow:0 8px 40px rgba(0,0,0,.2);width:min(640px,100%);max-height:80vh;display:flex;flex-direction:column;overflow:hidden">
      <div style="padding:1.25rem 1.5rem;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;justify-content:space-between;gap:1rem">
        <div>
          <div style="font-size:15px;font-weight:700">📋 รายละเอียดการแก้ไข</div>
          <div style="font-size:12px;color:var(--text3);margin-top:3px">${escapeHtml(log.user)}${log.position ? ' (' + escapeHtml(log.position) + ')' : ''} · ${dt}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:2px">โครงการ: <strong>${log.projectName}</strong></div>
        </div>
        <button onclick="this.closest('[style*=fixed]').remove()" style="border:none;background:none;cursor:pointer;font-size:20px;color:var(--text3);line-height:1;flex-shrink:0">×</button>
      </div>
      <div style="overflow-y:auto;flex:1">
        ${rows ? `<table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:var(--surface2)">
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:var(--text2)">ฟิลด์</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:var(--red)">ก่อน</th>
            <th style="padding:8px 2px;width:24px"></th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:var(--green)">หลัง</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>` : `<div style="padding:2rem;text-align:center;color:var(--text3);font-size:13px">ไม่มีรายละเอียดเพิ่มเติม</div>`}
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

// ── ล้าง log ─────────────────────────────────────────────────
function clearActlog() {
  if (!confirm('ยืนยันการล้างประวัติการแก้ไขทั้งหมด?\nข้อมูลนี้ไม่สามารถกู้คืนได้')) return;
  localStorage.removeItem(ACTLOG_KEY);
  _actlogPage = 1;
  renderActlog();
  showToast('🗑️ ล้างประวัติแล้ว', 2000);
}

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    if(document.getElementById('lightboxOverlay').classList.contains('open')){ closeLightbox(); return; }
    closeDetail();
    document.getElementById('deleteOverlay').classList.remove('open');
  }
  if(document.getElementById('lightboxOverlay').classList.contains('open')){
    if(e.key==='ArrowLeft') lightboxNav(-1);
    if(e.key==='ArrowRight') lightboxNav(1);
  }
});

// modalOverlay: ลบ click-outside ออก — ปิดได้แค่ปุ่ม "ยกเลิก" หรือ "บันทึก" เท่านั้น
document.getElementById('detailOverlay').addEventListener('click',e=>{ if(e.target===e.currentTarget) closeDetail(); });
document.getElementById('deleteOverlay').addEventListener('click',e=>{ if(e.target===e.currentTarget) e.currentTarget.classList.remove('open'); });


// ════════════════════════════════════════════════════════
// ── Quarter checkbox helper ──────────────────────────────
function onQuarterCheckChange(val) {
  if(val==='all') {
    ['fQ1','fQ2','fQ3','fQ4'].forEach(id=>{ const el=document.getElementById(id); if(el) el.checked=false; });
    const fq = document.getElementById('fQuarter'); if(fq) fq.value='all';
  } else {
    const allEl = document.getElementById('fQAll');
    if(allEl) allEl.checked=false;
    const checked = ['1','2','3','4'].filter(q=>{const el=document.getElementById('fQ'+q);return el&&el.checked;});
    const fq = document.getElementById('fQuarter');
    if(fq) fq.value = checked.length===1 ? checked[0] : (checked.length>1 ? checked.join(',') : 'all');
  }
  ['All','1','2','3','4'].forEach(q=>{
    const lbl=document.getElementById('qLabel'+q);
    const inp=document.getElementById('fQ'+q);
    if(lbl&&inp) lbl.style.borderColor = inp.checked ? 'var(--accent)' : 'var(--border)';
    if(lbl&&inp) lbl.style.background  = inp.checked ? 'var(--accent-light)' : '';
  });
}

// ── Strategy checkbox ──────────────────────────────────
function onStrategyCheck(val) {
  // single-select behavior: uncheck others
  document.querySelectorAll('input[name="fStrategyCheck"]').forEach(cb => {
    if (parseInt(cb.value) !== val) cb.checked = false;
  });
  const checked = document.querySelector('input[name="fStrategyCheck"]:checked');
  const fStr = document.getElementById('fStrategy');
  if (fStr) fStr.value = checked ? checked.value : '1';
}
function _setStrategyCheckbox(val) {
  document.querySelectorAll('input[name="fStrategyCheck"]').forEach(cb => {
    cb.checked = (cb.value == val);
  });
  const fStr = document.getElementById('fStrategy');
  if (fStr) fStr.value = val || '1';
}

// ── Gantt Table ────────────────────────────────────────
let ganttRows = [];
function _mkGanttRow(idx, name='', person='', months=[]) {
  return { idx, name, person, months: months.length===12 ? [...months] : Array(12).fill(false) };
}
function renderGanttTable() {
  const tbody = document.getElementById('ganttBodyModal'); if(!tbody) return;
  const monthBg = ['#e8f0fb','#e8f0fb','#e8f0fb','#e8f5e9','#e8f5e9','#e8f5e9','#fff8e8','#fff8e8','#fff8e8','#fce4ec','#fce4ec','#fce4ec'];
  tbody.innerHTML = ganttRows.map((row, i) => `
    <tr>
      <td style="border:1px solid #ccd5e4;padding:4px;text-align:center;font-size:12px">${i+1}</td>
      <td style="border:1px solid #ccd5e4;padding:4px">
        <input type="text" value="${row.name}" oninput="ganttRows[${i}].name=this.value;syncGanttToHidden()"
          style="width:100%;border:none;outline:none;font-size:12px;font-family:inherit;background:transparent" placeholder="ชื่อกิจกรรม...">
      </td>
      <td style="border:1px solid #ccd5e4;padding:4px">
        <input type="text" value="${row.person}" oninput="ganttRows[${i}].person=this.value;syncGanttToHidden()"
          style="width:100%;border:none;outline:none;font-size:12px;font-family:inherit;background:transparent" placeholder="ผู้รับผิดชอบ...">
      </td>
      ${row.months.map((checked, mi) => `
        <td style="border:1px solid #ccd5e4;padding:0;text-align:center;background:${monthBg[mi]};cursor:pointer"
            onclick="toggleGanttMonth(${i},${mi})" title="คลิกเพื่อเลือก">
          <div style="width:100%;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px">
            ${checked ? '<span style="color:#5459AC;font-weight:700">✔</span>' : '<span style="color:#ccc">·</span>'}
          </div>
        </td>`).join('')}
      <td style="border:1px solid #ccd5e4;padding:0;text-align:center">
        <button type="button" onclick="removeGanttRow(${i})" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:14px;width:28px;height:28px">×</button>
      </td>
    </tr>`).join('');
  syncGanttToHidden();
}
function toggleGanttMonth(rowIdx, monthIdx) {
  ganttRows[rowIdx].months[monthIdx] = !ganttRows[rowIdx].months[monthIdx];
  renderGanttTable();
}
function addGanttRow() {
  ganttRows.push(_mkGanttRow(ganttRows.length));
  renderGanttTable();
}
function removeGanttRow(i) {
  ganttRows.splice(i,1);
  renderGanttTable();
}
function syncGanttToHidden() {
  const el = document.getElementById('fActivities');
  if(el) el.value = JSON.stringify(ganttRows);
}
function loadGanttFromData(data) {
  try {
    const arr = typeof data==='string' ? JSON.parse(data||'[]') : (data||[]);
    ganttRows = Array.isArray(arr) ? arr.map((r,i)=>_mkGanttRow(i, r.name||r||'', r.person||'', r.months||[])) : [];
  } catch(e) {
    // legacy textarea format
    ganttRows = (data||'').split('\n').filter(l=>l.trim()).map((l,i)=>_mkGanttRow(i,l.replace(/^\d+[\.\)]\s*/,''),'',[]));
  }
  if(!ganttRows.length) ganttRows = [_mkGanttRow(0),_mkGanttRow(1),_mkGanttRow(2)];
  renderGanttTable();
}

// ── Budget Table ────────────────────────────────────────
let budgetRows = [];
function _mkBudgetRow(name='', comp=0, op=0, mat=0) {
  return { name, comp: comp||0, op: op||0, mat: mat||0 };
}
function renderBudgetTable() {
  const tbody = document.getElementById('budgetBody'); if(!tbody) return;
  tbody.innerHTML = budgetRows.map((row, i) => `
    <tr>
      <td style="border:1px solid #ccd5e4;padding:4px;text-align:center;font-size:12px">${i+1}</td>
      <td style="border:1px solid #ccd5e4;padding:4px">
        <input type="text" value="${row.name}" oninput="budgetRows[${i}].name=this.value;syncBudgetHidden()"
          style="width:100%;border:none;outline:none;font-size:12px;font-family:inherit;background:transparent" placeholder="ชื่อกิจกรรม / รายการ...">
      </td>
      <td style="border:1px solid #ccd5e4;padding:4px">
        <input type="number" value="${row.comp||''}" min="0" oninput="budgetRows[${i}].comp=parseFloat(this.value)||0;calcBudgetTotals()"
          style="width:90px;border:none;outline:none;font-size:12px;font-family:inherit;background:transparent;text-align:right" placeholder="0">
      </td>
      <td style="border:1px solid #ccd5e4;padding:4px">
        <input type="number" value="${row.op||''}" min="0" oninput="budgetRows[${i}].op=parseFloat(this.value)||0;calcBudgetTotals()"
          style="width:90px;border:none;outline:none;font-size:12px;font-family:inherit;background:transparent;text-align:right" placeholder="0">
      </td>
      <td style="border:1px solid #ccd5e4;padding:4px">
        <input type="number" value="${row.mat||''}" min="0" oninput="budgetRows[${i}].mat=parseFloat(this.value)||0;calcBudgetTotals()"
          style="width:90px;border:none;outline:none;font-size:12px;font-family:inherit;background:transparent;text-align:right" placeholder="0">
      </td>
      <td style="border:1px solid #ccd5e4;padding:4px 8px;text-align:right;font-size:12px;color:#059669;font-weight:600" id="budgetRowTotal_${i}">
        ${((row.comp||0)+(row.op||0)+(row.mat||0)).toLocaleString('th-TH')}
      </td>
      <td style="border:1px solid #ccd5e4;padding:0;text-align:center">
        <button type="button" onclick="removeBudgetRow(${i})" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:14px;width:28px;height:28px">×</button>
      </td>
    </tr>`).join('');
  calcBudgetTotals();
}
function calcBudgetTotals() {
  let sC=0,sO=0,sM=0;
  budgetRows.forEach((r,i)=>{
    const t=(r.comp||0)+(r.op||0)+(r.mat||0);
    const el=document.getElementById('budgetRowTotal_'+i); if(el) el.textContent=t.toLocaleString('th-TH');
    sC+=r.comp||0; sO+=r.op||0; sM+=r.mat||0;
  });
  const fmt = n=>n.toLocaleString('th-TH');
  const sc=document.getElementById('budgetSumComp'); if(sc) sc.textContent=fmtFull(sC);
  const so=document.getElementById('budgetSumOp');   if(so) so.textContent=fmtFull(sO);
  const sm=document.getElementById('budgetSumMat');  if(sm) sm.textContent=fmtFull(sM);
  const st=document.getElementById('budgetSumTotal');if(st) st.textContent=fmtFull(sC+sO+sM)+' บาท';
  syncBudgetHidden();
  // auto-fill budget field
  const bf=document.getElementById('fBudget');
  if(bf && (!bf.value || bf.value==='0')) bf.value=sC+sO+sM||'';
}
function syncBudgetTotal() {
  // manual override — don't auto-fill from table
}
function addBudgetActivityRow() {
  budgetRows.push(_mkBudgetRow());
  renderBudgetTable();
}
function removeBudgetRow(i) {
  budgetRows.splice(i,1);
  renderBudgetTable();
}
function syncBudgetHidden() {
  const el=document.getElementById('fBudgetDetail');
  if(el) el.value=JSON.stringify(budgetRows);
}
function loadBudgetFromData(data) {
  try {
    const arr = typeof data==='string' ? JSON.parse(data||'[]') : (data||[]);
    budgetRows = Array.isArray(arr) ? arr.map(r=>_mkBudgetRow(r.name||'',r.comp||0,r.op||0,r.mat||0)) : [];
  } catch(e) { budgetRows=[]; }
  if(!budgetRows.length) budgetRows=[_mkBudgetRow(),_mkBudgetRow(),_mkBudgetRow()];
  renderBudgetTable();
}

// ── Eval Table ─────────────────────────────────────────
let evalRows = [];
function _mkEvalRow(kpi='', method='', tool='') { return {kpi,method,tool}; }
function renderEvalTable() {
  const tbody=document.getElementById('evalBody'); if(!tbody) return;
  tbody.innerHTML = evalRows.map((row,i) => `
    <tr>
      <td style="border:1px solid #ccd5e4;padding:4px;text-align:center;font-size:12px">${i+1}</td>
      <td style="border:1px solid #ccd5e4;padding:4px">
        <textarea oninput="evalRows[${i}].kpi=this.value;syncEvalHidden()"
          style="width:100%;border:none;outline:none;font-size:12px;font-family:inherit;background:transparent;resize:vertical;min-height:48px" placeholder="ตัวชี้วัด...">${row.kpi}</textarea>
      </td>
      <td style="border:1px solid #ccd5e4;padding:4px">
        <textarea oninput="evalRows[${i}].method=this.value;syncEvalHidden()"
          style="width:100%;border:none;outline:none;font-size:12px;font-family:inherit;background:transparent;resize:vertical;min-height:48px" placeholder="วิธีการประเมิน...">${row.method}</textarea>
      </td>
      <td style="border:1px solid #ccd5e4;padding:4px">
        <textarea oninput="evalRows[${i}].tool=this.value;syncEvalHidden()"
          style="width:100%;border:none;outline:none;font-size:12px;font-family:inherit;background:transparent;resize:vertical;min-height:48px" placeholder="เครื่องมือ...">${row.tool}</textarea>
      </td>
      <td style="border:1px solid #ccd5e4;padding:0;text-align:center">
        <button type="button" onclick="removeEvalRow(${i})" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:14px;width:28px;height:28px">×</button>
      </td>
    </tr>`).join('');
  syncEvalHidden();
}
function addEvalRow() { evalRows.push(_mkEvalRow()); renderEvalTable(); }
function removeEvalRow(i) { evalRows.splice(i,1); renderEvalTable(); }
function syncEvalHidden() {
  const em=document.getElementById('fEvalMethod'); if(em) em.value=JSON.stringify(evalRows.map(r=>r.method));
  const ev=document.getElementById('fEvaluator');  if(ev) ev.value=JSON.stringify(evalRows.map(r=>r.tool));
  // also sync to kpi array for backward compat
  tempKPIs = evalRows.map(r=>r.kpi).filter(Boolean);
}
function loadEvalFromData(kpis, evalMethod, evaluator) {
  let methods=[],tools=[];
  try { methods = typeof evalMethod==='string'&&evalMethod.startsWith('[') ? JSON.parse(evalMethod) : (evalMethod?[evalMethod]:[]); } catch(e){ methods=[evalMethod||'']; }
  try { tools   = typeof evaluator==='string'&&evaluator.startsWith('[')   ? JSON.parse(evaluator)   : (evaluator?[evaluator]:[]); } catch(e){ tools=[evaluator||'']; }
  const kpiArr = Array.isArray(kpis) ? kpis : (kpis||'').split('\n').filter(Boolean);
  const len = Math.max(kpiArr.length, methods.length, tools.length, 2);
  evalRows = Array.from({length:len},(_,i)=>_mkEvalRow(kpiArr[i]||'',methods[i]||'',tools[i]||''));
  if(!evalRows.length) evalRows=[_mkEvalRow(),_mkEvalRow()];
  renderEvalTable();
}

// ── Document Upload ────────────────────────────────────
let docFiles = [];
function handleDocDragOver(e) { e.preventDefault(); document.getElementById('docUploadZone').style.borderColor='var(--accent)'; }
function handleDocDragLeave(e) { document.getElementById('docUploadZone').style.borderColor='var(--border)'; }
function handleDocDrop(e) {
  e.preventDefault(); document.getElementById('docUploadZone').style.borderColor='var(--border)';
  processDocFiles([...e.dataTransfer.files]);
}
function handleDocSelect(e) { processDocFiles([...e.target.files]); }
function processDocFiles(files) {
  files.forEach(f => {
    if(docFiles.length>=10){ showToast('⚠️ สูงสุด 10 ไฟล์',2000); return; }
    if(f.size>20*1024*1024){ showToast('⚠️ ไฟล์ '+f.name+' ใหญ่เกิน 20MB',2500); return; }

    // สร้าง placeholder ก่อนเพื่อแสดงสถานะ "กำลังอัปโหลด"
    const placeholder = { name:f.name, size:f.size, type:f.type, url:'', fileId:'', _uploading:true, status:'uploading' };
    docFiles.push(placeholder);
    renderDocFileList();

    if(!GAS_ENABLED){
      placeholder._uploading = false;
      placeholder.status = 'ready';
      renderDocFileList();
      return;
    }

    function doUpload(attempt){
      uploadDocFileToGas(f)
        .then(res => {
          placeholder.url      = res.url || '';
          placeholder.fileId   = res.fileId || '';
          placeholder._uploading = false;
          placeholder.status   = 'saved';
          renderDocFileList();
          showToast(`✅ "${f.name}" อัปโหลดขึ้น Drive สำเร็จ${attempt>1?' (retry)':''}`, 2200);
        })
        .catch(err => {
          console.error(`DocFile upload attempt ${attempt} failed:`, err.message);
          if(attempt < 3){
            showToast(`⏳ retry ${attempt}/2 — "${f.name}"`, 1500);
            setTimeout(()=>doUpload(attempt+1), 2000);
          } else {
            placeholder._uploading = false;
            placeholder._uploadError = true;
            placeholder.status = 'error';
            renderDocFileList();
            showToast(`⚠️ อัปโหลด "${f.name}" ไม่สำเร็จ: ${err.message}`, 4000);
          }
        });
    }
    doUpload(1);
  });
}
function renderDocFileList() {
  const el=document.getElementById('docFileList'); if(!el) return;
  const icons = {pdf:'📄',doc:'📝',docx:'📝',xls:'📊',xlsx:'📊',ppt:'📋',pptx:'📋',jpg:'🖼️',jpeg:'🖼️',png:'🖼️',gif:'🖼️',webp:'🖼️'};
  el.innerHTML = docFiles.length ? docFiles.map((f,i)=>{
    const ext = f.name.split('.').pop().toLowerCase();
    const ico = icons[ext]||'📎';
    const sz = f.size > 1024*1024 ? (f.size/1024/1024).toFixed(1)+' MB' : Math.round(f.size/1024)+' KB';
    let statusHtml;
    if(f._uploading){
      statusHtml = `<div style="font-size:10.5px;color:var(--accent)">⏳ กำลังอัปโหลดขึ้น Drive...</div>`;
    } else if(f._uploadError){
      statusHtml = `<div style="font-size:10.5px;color:#ef4444">⚠️ อัปโหลดไม่สำเร็จ — ลบแล้วลองใหม่</div>`;
    } else if(f.url){
      statusHtml = `<a href="${f.url}" target="_blank" rel="noopener" style="font-size:10.5px;color:var(--accent);text-decoration:underline">📎 เปิดไฟล์ใน Drive · ${sz}</a>`;
    } else {
      statusHtml = `<div style="font-size:10.5px;color:var(--text3)">${sz}</div>`;
    }
    return `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid var(--border);border-radius:7px;margin-bottom:5px;background:var(--surface2)">
      <span style="font-size:18px">${ico}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.name}</div>
        ${statusHtml}
      </div>
      <button type="button" onclick="removeDocFile(${i})" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:16px;width:24px;height:24px;flex-shrink:0">×</button>
    </div>`;
  }).join('') : '';
  const fd=document.getElementById('fDocFiles'); if(fd) fd.value=JSON.stringify(docFiles.map(f=>({name:f.name,size:f.size,type:f.type,url:f.url||'',fileId:f.fileId||''})));
}
function removeDocFile(i) {
  const f = docFiles[i];
  // ลบไฟล์ออกจาก Drive ด้วย (best-effort, ไม่บล็อก UI)
  if(f && f.fileId && GAS_ENABLED){
    gasFetchPost('deleteDriveFile', { fileId: f.fileId }).catch(()=>{});
  }
  docFiles.splice(i, 1);
  renderDocFileList();
}


function _setQuarterCheckboxes(val) {
  // reset
  ['fQAll','fQ1','fQ2','fQ3','fQ4'].forEach(id=>{const el=document.getElementById(id);if(el)el.checked=false;});
  ['All','1','2','3','4'].forEach(q=>{
    const lbl=document.getElementById('qLabel'+q);
    if(lbl){lbl.style.borderColor='var(--border)';lbl.style.background='';}
  });
  if(!val||val==='all') {
    const el=document.getElementById('fQAll'); if(el) el.checked=true;
    const lbl=document.getElementById('qLabelAll');
    if(lbl){lbl.style.borderColor='var(--accent)';lbl.style.background='var(--accent-light)';}
  } else {
    String(val).split(',').forEach(q=>{
      const el=document.getElementById('fQ'+q); if(el) el.checked=true;
      const lbl=document.getElementById('qLabel'+q);
      if(lbl){lbl.style.borderColor='var(--accent)';lbl.style.background='var(--accent-light)';}
    });
  }
}

// ── char counter ────────────────────────────────────────
function updateCharCount(inputId, countId, max) {
  const el=document.getElementById(inputId); const ct=document.getElementById(countId);
  if(!el||!ct) return;
  ct.textContent = el.value.length;
  ct.style.color = el.value.length > max*0.9 ? '#ef4444' : 'var(--text3)';
}

// ════════════════════════════════════════════════════════
// PLAN PAGE
// ════════════════════════════════════════════════════════
// ===== GANTT CHART =====
// Month definitions for fiscal year 2570 (ต.ค. 2569 – ก.ย. 2570) and 2571
const GANTT_MONTHS_2570 = [
  {label:'ต.ค.',year:'69',q:1,fy:2570},
  {label:'พ.ย.',year:'69',q:1,fy:2570},
  {label:'ธ.ค.',year:'69',q:1,fy:2570},
  {label:'ม.ค.',year:'70',q:2,fy:2570},
  {label:'ก.พ.',year:'70',q:2,fy:2570},
  {label:'มี.ค.',year:'70',q:2,fy:2570},
  {label:'เม.ย.',year:'70',q:3,fy:2570},
  {label:'พ.ค.',year:'70',q:3,fy:2570},
  {label:'มิ.ย.',year:'70',q:3,fy:2570},
  {label:'ก.ค.',year:'70',q:4,fy:2570},
  {label:'ส.ค.',year:'70',q:4,fy:2570},
  {label:'ก.ย.',year:'70',q:4,fy:2570},
];
const GANTT_MONTHS_2569 = [
  {label:'ต.ค.',year:'68',q:1,fy:2569},
  {label:'พ.ย.',year:'68',q:1,fy:2569},
  {label:'ธ.ค.',year:'68',q:1,fy:2569},
  {label:'ม.ค.',year:'69',q:2,fy:2569},
  {label:'ก.พ.',year:'69',q:2,fy:2569},
  {label:'มี.ค.',year:'69',q:2,fy:2569},
  {label:'เม.ย.',year:'69',q:3,fy:2569},
  {label:'พ.ค.',year:'69',q:3,fy:2569},
  {label:'มิ.ย.',year:'69',q:3,fy:2569},
  {label:'ก.ค.',year:'69',q:4,fy:2569},
  {label:'ส.ค.',year:'69',q:4,fy:2569},
  {label:'ก.ย.',year:'69',q:4,fy:2569},
];

// Parse quarter/months field into month indices (0-11)
function getActiveMonths(p) {
  const quarters = String(p.quarters || p.quarter || 'all');
  const qs = quarters.split(',').map(q=>q.trim());
  const active = new Set();
  qs.forEach(q => {
    if(q==='all' || q==='') { for(let i=0;i<12;i++) active.add(i); }
    else if(q==='1') { [0,1,2].forEach(i=>active.add(i)); }
    else if(q==='2') { [3,4,5].forEach(i=>active.add(i)); }
    else if(q==='3') { [6,7,8].forEach(i=>active.add(i)); }
    else if(q==='4') { [9,10,11].forEach(i=>active.add(i)); }
  });
  return active;
}

// Parse activities text into list of {name, months}
function parseActivities(p) {
  const text = (p.activities || '').trim();
  if(!text) return [];
  const lines = text.split(/\n/).filter(l=>l.trim());
  // Try to find lines that look like numbered steps
  const acts = [];
  let actIndex = 0;
  lines.forEach(line => {
    const m = line.match(/^(\d+\.?|[•\-*])\s*(.+)/);
    const name = m ? m[2].trim() : line.trim();
    if(!name) return;
    // Try to infer quarter from keywords in the activity name
    let months = new Set();
    const lower = name.toLowerCase();
    if(/ภาคเรียนที่ 1|ภาค 1|ต\.ค\.|พ\.ย\.|ธ\.ค\.|ม\.ค\.|ก\.พ\.|มี\.ค\./.test(name)) {
      if(/ภาคเรียนที่ 1|ต\.ค\.|พ\.ย\.|ธ\.ค\./.test(name)) { [0,1,2].forEach(i=>months.add(i)); }
      if(/ม\.ค\.|ก\.พ\.|มี\.ค\./.test(name)) { [3,4,5].forEach(i=>months.add(i)); }
    }
    if(/ภาคเรียนที่ 2|เม\.ย\.|พ\.ค\.|มิ\.ย\./.test(name)) { [6,7,8].forEach(i=>months.add(i)); }
    if(/ก\.ค\.|ส\.ค\.|ก\.ย\./.test(name)) { [9,10,11].forEach(i=>months.add(i)); }
    // Default: spread evenly based on activity index
    if(months.size===0) {
      // Distribute activities across project's active months
      const projMonths = getActiveMonths(p);
      const projArr = [...projMonths].sort((a,b)=>a-b);
      const chunkSize = Math.max(1, Math.ceil(projArr.length / Math.max(lines.length,1)));
      const start = Math.min(actIndex * chunkSize, projArr.length - 1);
      const end = Math.min(start + chunkSize, projArr.length);
      for(let i=start; i<end; i++) months.add(projArr[i]);
    }
    acts.push({name, months});
    actIndex++;
  });
  return acts;
}

// ACTIVITIES from the project form (structured)
// For project 10 (ใบงาน) we have exact activities from the docx
const PROJECT_ACTIVITIES = {
  10: [
    {name:'จัดเตรียม file ชุดกิจกรรมฯ ต้นฉบับ', months: new Set([0,1,2,6,7,8])},
    {name:'ประสานขอข้อมูลจำนวนนักเรียน (ภาคเรียนที่ 1)', months: new Set([0,1,2])},
    {name:'ประสานขอข้อมูลจำนวนนักเรียน (ภาคเรียนที่ 2)', months: new Set([6])},
    {name:'ตรวจสอบการรับรองจำนวนการจัดสรร (ภาคเรียนที่ 1)', months: new Set([2,3])},
    {name:'ตรวจสอบการรับรองจำนวนการจัดสรร (ภาคเรียนที่ 2)', months: new Set([8,9])},
    {name:'กำหนดขอบเขตการดำเนินงาน TOR (ภาคเรียนที่ 1)', months: new Set([2,3])},
    {name:'กำหนดขอบเขตการดำเนินงาน TOR (ภาคเรียนที่ 2)', months: new Set([8,9])},
    {name:'จัดจ้างผลิตและจัดส่ง (ภาคเรียนที่ 1)', months: new Set([3,4,5])},
    {name:'จัดจ้างผลิตและจัดส่ง (ภาคเรียนที่ 2)', months: new Set([6,7])},
    {name:'ติดตามรายงานผลและความพึงพอใจ', months: new Set([4,5,6,7,8,9,10,11])},
  ]
};

let ganttExpandState = {}; // {projectId: true/false}

function renderGantt() {
  const search = (document.getElementById('ganttSearch')||{}).value||'';
  const filterSt = (document.getElementById('ganttFilterStrategy')||{}).value||'';
  const filterStatus = (document.getElementById('ganttFilterStatus')||{}).value||'';
  const showActs = document.getElementById('ganttShowActivities')?.checked||false;

  const months = currentYear===2570 ? GANTT_MONTHS_2570 : GANTT_MONTHS_2569;
  const Q_COLORS = {1:'#3b72f0',2:'#059669',3:'#d97706',4:'#7c3aed'};
  const Q_NAMES = {1:'ไตรมาส 1',2:'ไตรมาส 2',3:'ไตรมาส 3',4:'ไตรมาส 4'};
  const STRAT_COLORS = ['','#3b72f0','#059669','#d97706','#7c3aed','#0891b2'];
  const STRAT_NAMES = ['','ย.1','ย.2','ย.3','ย.4','งบบ.'];

  // Filter projects
  let list = projects.filter(p => {
    if(filterSt && String(p.strategy)!==filterSt) return false;
    if(filterStatus && p.status!==filterStatus) return false;
    if(search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const head = document.getElementById('ganttHead');
  const body = document.getElementById('ganttBody');
  if(!head||!body) return;

  if(!list.length) {
    head.innerHTML='';
    body.innerHTML=`<tr><td class="gantt-empty" colspan="${2+months.length}">ไม่พบโครงการ</td></tr>`;
    return;
  }

  // ── Build header ──────────────────────────────────────────────
  // Row 1: Quarter groups
  let headRow1 = '<tr>';
  headRow1 += '<th class="th-left" rowspan="2" style="min-width:220px">ชื่อโครงการ / กิจกรรม</th>';
  headRow1 += '<th rowspan="2" style="min-width:60px;text-align:center">สถานะ</th>';
  // Group months by quarter
  let prevQ = null;
  let qSpan = 0; let qStart = 0; let qGroups = [];
  months.forEach((m,i)=>{
    if(m.q!==prevQ) {
      if(prevQ!==null) qGroups.push({q:prevQ, span:qSpan, start:qStart});
      qStart=i; qSpan=1; prevQ=m.q;
    } else qSpan++;
  });
  if(prevQ!==null) qGroups.push({q:prevQ, span:qSpan, start:qStart});
  qGroups.forEach(({q,span})=>{
    headRow1 += `<th colspan="${span}" style="text-align:center;background:${Q_COLORS[q]};color:#fff;font-size:10px;font-weight:800;letter-spacing:.05em;padding:5px 4px">${Q_NAMES[q]}</th>`;
  });
  headRow1 += '</tr>';

  // Row 2: Month names
  let headRow2 = '<tr>';
  months.forEach((m,i)=>{
    const isQSep = i>0 && months[i].q !== months[i-1].q;
    headRow2 += `<th class="gantt-month-th${isQSep?' gantt-q-sep':''}" style="font-size:10px;font-weight:600;color:var(--text2);padding:5px 4px;min-width:52px">${m.label}<br><span style="font-size:8px;color:var(--text3)">${m.year}</span></th>`;
  });
  headRow2 += '</tr>';
  head.innerHTML = headRow1 + headRow2;

  // ── Build body ────────────────────────────────────────────────
  const BAR_CLASS = {done:'bar-done',progress:'bar-progress',pending:'bar-pending'};
  const STATUS_EMOJI = {done:'✅',progress:'⏳',pending:'⭕'};
  const STATUS_TEXT = {done:'แล้วเสร็จ',progress:'กำลังดำเนิน',pending:'ยังไม่เริ่ม'};

  let rows = '';
  list.forEach((p,pi) => {
    const activeMonths = getActiveMonths(p);
    const barClass = BAR_CLASS[p.status]||'bar-pending';
    const s = Number(p.strategy)||1;
    const expanded = ganttExpandState[p.id] || false;
    const hasActs = !!(p.activities && p.activities.trim());
    const sColor = STRAT_COLORS[s]||'#9aa3b2';

    // Project row
    rows += `<tr>`;
    rows += `<td style="padding:6px 8px">
      <div style="display:flex;align-items:center;gap:6px">
        ${showActs && hasActs ? `<button class="gantt-expand-btn" onclick="ganttExpandState[${p.id}]=!ganttExpandState[${p.id}];renderGantt()" title="${expanded?'ซ่อน':'แสดง'}กิจกรรมย่อย">${expanded?'▾':'▸'}</button>` : '<span style="width:16px;display:inline-block"></span>'}
        <span style="width:6px;height:14px;border-radius:2px;background:${sColor};flex-shrink:0;display:inline-block"></span>
        <span class="gantt-project-name" onclick="openDetail(${p.id})" title="${p.name}">${p.name.length>45?p.name.substring(0,45)+'…':p.name}</span>
      </div>
    </td>`;
    rows += `<td style="text-align:center;white-space:nowrap">
      <span style="font-size:11px">${STATUS_EMOJI[p.status]||'⭕'}</span>
    </td>`;
    months.forEach((m,mi) => {
      const isQSep = mi>0 && months[mi].q!==months[mi-1].q;
      const isActive = activeMonths.has(mi);
      rows += `<td class="gantt-bar-cell${isQSep?' gantt-q-sep':''}" style="padding:3px 4px">`;
      if(isActive) {
        rows += `<div class="gantt-bar ${barClass}"></div>`;
      }
      rows += `</td>`;
    });
    rows += `</tr>`;

    // Activity sub-rows
    if(showActs && expanded && hasActs) {
      const acts = PROJECT_ACTIVITIES[p.id] || parseActivities(p);
      acts.forEach(act => {
        rows += `<tr class="gantt-activity-row">`;
        rows += `<td style="padding:3px 8px;padding-left:32px">
          <span class="gantt-activity-name">↳ ${act.name.length>50?act.name.substring(0,50)+'…':act.name}</span>
        </td>`;
        rows += `<td></td>`;
        months.forEach((m,mi) => {
          const isQSep = mi>0 && months[mi].q!==months[mi-1].q;
          const isActive = act.months.has(mi);
          rows += `<td class="gantt-bar-cell${isQSep?' gantt-q-sep':''}" style="padding:3px 4px">`;
          if(isActive) {
            rows += `<div class="gantt-bar bar-activity"></div>`;
          }
          rows += `</td>`;
        });
        rows += `</tr>`;
      });
    }
  });

  body.innerHTML = rows;
}


// ===== INIT =====
// _pendingSaveTs = timestamp ล่าสุดที่กดบันทึก (ใช้กัน Sheet ทับข้อมูลใหม่)
window._pendingSaveTs = 0;

(function initApp(){
  // ── ไฟล์นี้คือปี 2570 เท่านั้น ──
  Q_LABEL = Q_LABELS[2570];
  document.getElementById('sidebarYearBadge').textContent = 'ปีงบประมาณ พ.ศ. 2570';
  document.getElementById('sidebarYearBadge').className = 'badge-year badge-year-2570';
  const _tyEl = document.getElementById('topbarYear'); if(_tyEl) _tyEl.textContent = '2570';
  document.title = 'ระบบรายงานผลฯ พ.ศ. 2570 | มูลนิธิการศึกษาทางไกลผ่านดาวเทียม';

  _initGasUI();

  // ── โหลด localStorage ──
  const hadData = loadFromLocal();
  const overlay = document.getElementById('initLoadingOverlay');
  if(overlay) overlay.style.display='none';

  if(!hadData || projects.length === 0){
    projects = [];
    saveToLocal(true);
  }

  // ── route ไปหน้า dashboard ก่อน (ต้อง display:block ก่อน Chart.js render) ──
  showPage('dashboard');

  // ── Auth UI ──
  if (typeof _applyAuthUI === 'function') _applyAuthUI();

  // render dashboard หลัง page แสดงแล้ว
  updateDashboard();
  renderTable();

  // ── Sync จาก Sheet (ทำหลัง render เพื่อไม่บล็อก UI) ──
  function syncFromSheet(showToast_, safe){
    if(!GAS_ENABLED || !_gasUrl || _gasUrl.includes('YOUR_GAS')) return Promise.resolve();
    const st = document.getElementById('gsStatus');
    return fetch(`${_gasUrl}?action=getAll`, { redirect:'follow' })
      .then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(res=>{
        if(!res.success) throw new Error(res.message||'GAS error');
        if(safe && Date.now() - window._pendingSaveTs < 30000){
          console.log('syncFromSheet: skipped — recent save within 30s');
          return;
        }
        if(res.data && res.data.length > 0){
          // เปรียบเทียบ timestamp: ถ้า Sheet มีข้อมูลมากกว่าหรือใหม่กว่า ค่อย override
          // (ป้องกัน Sheet เก่า sync ทับข้อมูลใหม่ที่เพิ่งกดบันทึก)
          const sheetIds  = new Set(res.data.map(p=>String(p.id)));
          const localIds  = new Set(projects.map(p=>String(p.id)));
          // ถ้า Sheet มี id ที่ local ไม่มี หรือ local ไม่มีข้อมูลเลย → sync
          const sheetHasNew = [...sheetIds].some(id => !localIds.has(id));
          if (projects.length === 0 || sheetHasNew || res.data.length !== projects.length) {
            return fetchAllReports().then(reportRows=>{
              projects = mergeReportsIntoProjects(res.data, reportRows);
              saveToLocal(true);
              renderTable();
              updateDashboard();
              const now2 = new Date().toLocaleTimeString('th-TH');
              if(st) st.innerHTML=`<div class="status-msg status-ok">✅ โหลดข้อมูลล่าสุดสำเร็จ ${projects.length} โครงการ · ${now2}</div>`;
              if(showToast_) showToast(`🔄 ข้อมูลล่าสุดจาก Sheet (${projects.length} โครงการ)`, 2500);
            });
          }
        }
        const now2 = new Date().toLocaleTimeString('th-TH');
        if(st) st.innerHTML=`<div class="status-msg status-ok">✅ โหลดข้อมูลล่าสุดสำเร็จ ${projects.length} โครงการ · ${now2}</div>`;
        if(showToast_) showToast(`🔄 ข้อมูลล่าสุดจาก Sheet (${projects.length} โครงการ)`, 2500);
      })
      .catch(err=>{
        console.warn('Sheet sync failed:', err.message);
        if(st) st.innerHTML=`<div class="status-msg status-err">⚠️ โหลดจาก Sheet ไม่สำเร็จ — ใช้ข้อมูลในเครื่อง (${err.message})</div>`;
      });
  }

  window._syncFromSheetSilent = ()=>syncFromSheet(false, true);

  // sync หลัง render เสร็จ
  setTimeout(()=> syncFromSheet(false, true), 500);

  window._pendingSaveTs = 0;
})();
