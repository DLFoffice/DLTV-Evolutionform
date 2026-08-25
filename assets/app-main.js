// Google Apps Script Web App URL (เก็บไว้เป็น fallback/อ้างอิง — ไม่ได้ใช้แล้วหลังย้ายไป Firebase)
const GS_URL = "https://script.google.com/macros/s/AKfycbwEwdO3RKhRwy4027ybKlhj6Q9cAM3HPUYqnQ9YRE608SVMRoWnuPNarmF-gfZCmWCWMw/exec";

/* ════════════════════════════════════════════════════════════════════
 *  CLOUD FIRESTORE (REST) — แหล่งเก็บข้อมูลหลัก (เร็วกว่า Apps Script)
 *  ──────────────────────────────────────────────────────────────────
 *  Firestore ไม่มี "databaseURL" แบบ Realtime Database — มันใช้
 *   • Project ID  (เห็นใน URL ของ console: .../project/<PROJECT_ID>/...)
 *   • Web API Key (Project Settings ⚙️ → General → Web API Key)
 *
 *  วิธีตั้งค่า (ทำครั้งเดียว):
 *   1) ในคอนโซล Firebase เปิดโปรเจกต์ที่สร้างไว้ (เช่น dataevoform)
 *   2) สร้าง Firestore แล้ว (หน้าที่เห็น "Start collection") — ไม่ต้องสร้าง collection เอง
 *      โค้ดจะสร้าง collection: dltv_f0 ... dltv_f5 ให้อัตโนมัติเมื่อบันทึกครั้งแรก
 *   3) เอา Web API Key มาวางใน FS_API_KEY ด้านล่าง
 *      (กดไอคอนเฟือง ⚙️ ข้างเมนู → Project settings → แท็บ General → ช่อง "Web API Key")
 *      *API Key ของ Firebase ออกแบบมาให้เปิดเผยในโค้ดฝั่งหน้าเว็บได้ ความปลอดภัยอยู่ที่ Rules*
 *
 *  ⚠️ ความปลอดภัย: หน้า Firestore → แท็บ Rules ต้องอนุญาตให้อ่าน/เขียนได้
 *     ช่วงทดสอบใช้ allow read, write: if true; ได้ แต่ก่อนใช้งานจริงควรล็อกด้วย Auth
 *     (ดูตัวอย่างใน FIREBASE_SETUP.md)
 * ════════════════════════════════════════════════════════════════════ */
const FS_PROJECT_ID = "dataevoform";   // ← Project ID (เห็นใน URL คอนโซล)
const FS_API_KEY    = "AIzaSyDV1-iHyzq5fillmORHtGUZULy4yritY0Q"; // ← Web API Key (จาก firebaseConfig.apiKey)
const FS_PREFIX     = "dltv";          // ชื่อนำหน้า collection → dltv_f0 ... dltv_f5
const FS_BASE       = "https://firestore.googleapis.com/v1/projects/" + FS_PROJECT_ID + "/databases/(default)/documents";

function _fsCollection(formId) { return FS_PREFIX + "_" + formId; }
function _fsKey() { return FS_API_KEY ? ("key=" + encodeURIComponent(FS_API_KEY)) : ""; }
function _fsUrl(path, extraQuery) {
  let u = FS_BASE + (path ? "/" + path : "");
  const q = [_fsKey(), extraQuery].filter(Boolean).join("&");
  if (q) u += "?" + q;
  return u;
}
// แปลง object ปกติ → Firestore "fields" (เราเก็บทั้งแถวเป็น string ในคีย์ d เพื่อเลี่ยงข้อจำกัดชื่อฟิลด์)
function _fsToFields(rowObj) {
  return { fields: {
    d:         { stringValue: JSON.stringify(rowObj) },
    updatedAt: { integerValue: String(Date.now()) }
  } };
}
// แปลง Firestore document → row object เดิม
function _fsFromDoc(doc) {
  try {
    const f = doc && doc.fields;
    if (f && f.d && typeof f.d.stringValue === "string") {
      const row = JSON.parse(f.d.stringValue);
      // เติม EntryID จาก document id ถ้าไม่มี
      if (row && typeof row === "object" && !row["EntryID"] && !row["entryId"]) {
        const id = String(doc.name || "").split("/").pop();
        if (id) row["EntryID"] = id;
      }
      return row;
    }
  } catch (e) { console.warn("fsFromDoc parse fail", e); }
  return null;
}

/** อ่านทุกรายการของฟอร์มหนึ่ง → คืน array ของ object (โครงสร้างเดิม ใช้กับ dashboard/preview/PDF ได้ทันที) */
async function fbReadForm(formId) {
  const rows = [];
  let pageToken = "";
  do {
    const extra = "pageSize=300" + (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "");
    const res = await fetch(_fsUrl(_fsCollection(formId), extra));
    if (!res.ok) {
      // collection ที่ยังไม่มีเอกสารเลย Firestore จะตอบ 200 + {} ไม่ใช่ error
      // ถ้า 404/403 ให้โยน error เพื่อให้ผู้ใช้รู้ว่า config/rules ผิด
      throw new Error("Firestore อ่าน " + formId + " ไม่สำเร็จ (HTTP " + res.status + ")");
    }
    const data = await res.json(); // { documents:[...], nextPageToken? } หรือ {}
    (data.documents || []).forEach(function (doc) {
      const row = _fsFromDoc(doc);
      if (row && typeof row === "object") rows.push(row);
    });
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return rows;
}

/** เขียน/อัปเดต 1 รายการ — PATCH ตาม EntryID (สร้างใหม่ หรือทับของเดิมที่ EntryID เดียวกัน) */
async function fbWriteEntry(formId, entryId, data, signal) {
  const id = encodeURIComponent(String(entryId || (data && (data["EntryID"] || data["entryId"])) || genEntryId()));
  const res = await fetch(_fsUrl(_fsCollection(formId) + "/" + id), {
    method: "PATCH",   // PATCH = create-or-overwrite เอกสารตาม id
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(_fsToFields(data)),
    signal: signal
  });
  if (!res.ok) {
    let detail = "";
    try { detail = " — " + (await res.text()).slice(0, 200); } catch (e) {}
    throw new Error("Firestore บันทึก " + formId + " ไม่สำเร็จ (HTTP " + res.status + ")" + detail);
  }
  return res.json();
}

/** ลบ 1 รายการออกจาก Firestore (ใช้ตอนลบข้อมูลในแดชบอร์ด ถ้ามีปุ่มลบ) */
async function fbDeleteEntry(formId, entryId) {
  const id = encodeURIComponent(String(entryId || ""));
  if (!id) return;
  const res = await fetch(_fsUrl(_fsCollection(formId) + "/" + id), { method: "DELETE" });
  if (!res.ok) throw new Error("Firestore ลบ " + formId + " ไม่สำเร็จ (HTTP " + res.status + ")");
  return true;
}

let currentTabIdx = 0;
const totalTabs = 6;
let allResponsesData = [];
let currentPreviewIndex = -1;
const gradeList = ["อ.1", "อ.2", "อ.3", "ป.1", "ป.2", "ป.3", "ป.4", "ป.5", "ป.6", "ม.1", "ม.2", "ม.3"];

// Startup logic
window.addEventListener('DOMContentLoaded', () => {
  // Render Academic Matrix
  const acTbody = document.getElementById('academic_tbody');
  if (acTbody) gradeList.forEach(g => {
    acTbody.innerHTML += `
      <tr>
        <td style="font-weight:700;color:#1e3a8a;text-align:center;font-size:13px;">${g}</td>
        <td><input type="text" class="ac-subject" data-grade="${g}" placeholder="เช่น คณิตศาสตร์, ภาษาไทย" style="width:100%;border:1.5px solid #e2e8f0;border-radius:8px;padding:7px 10px;font-size:13px;"></td>
        <td>
          <div style="display:flex;flex-direction:row;gap:6px;flex-wrap:wrap;">
            <label style="display:flex;align-items:center;gap:5px;padding:5px 12px;border:1.5px solid #e2e8f0;border-radius:20px;cursor:pointer;font-size:12px;font-weight:600;color:#475569;transition:all 0.15s;white-space:nowrap;">
              <input type="radio" name="ac_freq_${g}" value="ทุกคาบ" style="accent-color:#1e3a8a;"> ทุกคาบ</label>
            <label style="display:flex;align-items:center;gap:5px;padding:5px 12px;border:1.5px solid #e2e8f0;border-radius:20px;cursor:pointer;font-size:12px;font-weight:600;color:#475569;transition:all 0.15s;white-space:nowrap;">
              <input type="radio" name="ac_freq_${g}" value="บางคาบ" style="accent-color:#1e3a8a;"> บางคาบ</label>
            <label style="display:flex;align-items:center;gap:5px;padding:5px 12px;border:1.5px solid #e2e8f0;border-radius:20px;cursor:pointer;font-size:12px;font-weight:600;color:#475569;transition:all 0.15s;white-space:nowrap;">
              <input type="radio" name="ac_freq_${g}" value="เฉพาะบางกิจกรรม" style="accent-color:#1e3a8a;"> เฉพาะบางกิจกรรม</label>
          </div>
        </td>
        <td><input type="text" class="ac-note" data-grade="${g}" placeholder="หมายเหตุ" style="width:100%;border:1.5px solid #e2e8f0;border-radius:8px;padding:7px 10px;font-size:12px;"></td>
      </tr>`;
  });


  // Render Hardware Matrix
  const hwTbody = document.getElementById('hardware_tbody');
  if (hwTbody) gradeList.forEach(g => {
    hwTbody.innerHTML += `
      <tr>
        <td>${g}</td>
        <td><input type="radio" name="tv_${g}" value="มีและใช้งานได้"></td>
        <td><input type="radio" name="tv_${g}" value="มีแต่ชำรุด"></td>
        <td><input type="radio" name="tv_${g}" value="ไม่มี"></td>
        <td><input type="radio" name="ird_${g}" value="มีและใช้งานได้"></td>
        <td><input type="radio" name="ird_${g}" value="มีแต่ชำรุด"></td>
        <td><input type="radio" name="ird_${g}" value="ไม่มี"></td>
        <td><input type="text" class="hw-note" data-grade="${g}"></td>
      </tr>`;
  });

  // Set default dates
  const today = new Date().toISOString().split('T')[0];
  document.querySelectorAll('input[type=date]').forEach(el => {
    if(!el.value) el.value = today;
  });
});

function showTab(idx) {
  const tabs = document.querySelectorAll('.tab');
  const contents = document.querySelectorAll('.tab-content');
  tabs.forEach((t, i) => t.classList.toggle('active', i === idx));
  contents.forEach((c, i) => c.classList.toggle('active', i === idx));
  currentTabIdx = idx;
  if (typeof updateStepBreadcrumb === 'function') { currentFormId = 'f0'; updateStepBreadcrumb(); }
  window.scrollTo({top: 0, behavior: 'smooth'});
}

function nextTab() { if (currentTabIdx < totalTabs - 1) showTab(currentTabIdx + 1); }
function prevTab() { if (currentTabIdx > 0) showTab(currentTabIdx - 1); }

function switchMode(mode) {
  document.getElementById('modeFormBtn').classList.toggle('active', mode === 'form');
  document.getElementById('modeDashboardBtn').classList.toggle('active', mode === 'dashboard');
  document.getElementById('formModeView').style.display = mode === 'form' ? 'block' : 'none';
  document.getElementById('dashboardModeView').style.display = mode === 'dashboard' ? 'block' : 'none';
  if (mode === 'dashboard') {
    // reset any injected content from old scripts
    const oldSummary = document.getElementById('dltv-dashboard-summary');
    if (oldSummary) oldSummary.remove();
    loadDashboardData();
    setTimeout(loadSavedAiKey, 300);
  }
}

function getVal(id) { return document.getElementById(id) ? document.getElementById(id).value.trim() : ''; }
function getCheckedValues(cls) {
  return Array.from(document.querySelectorAll('.' + cls))
              .filter(cb => cb.checked).map(cb => cb.value);
}
function getRadioVal(name) {
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : '';
}

async function submitForm() {
  const statusEl = document.getElementById('submitStatus');
  const submitBtn = document.getElementById('submitBtn');

  // ===== ตรวจสอบช่องจำเป็นก่อนส่ง: ชื่อโรงเรียน =====
  // (แดชบอร์ดจัดกลุ่มข้อมูลด้วยชื่อโรงเรียน ถ้าว่างจะกลายเป็นแถวกำพร้าที่จับกลุ่มไม่ได้)
  if (!getVal('sch_name')) {
    const f = document.getElementById('sch_name');
    if (typeof showTab === 'function') showTab(1); // ช่องชื่อโรงเรียนอยู่ในแท็บ "ข้อมูลโรงเรียน"
    if (f) {
      f.classList.add('field-error');
      f.focus();
      f.scrollIntoView({ behavior: 'smooth', block: 'center' });
      f.addEventListener('input', () => f.classList.remove('field-error'), { once: true });
    }
    if (statusEl) statusEl.innerHTML = '<span style="color:#dc2626;font-weight:600;">⚠️ กรุณากรอก "ชื่อโรงเรียน" ก่อนบันทึกข้อมูล</span>';
    return;
  }

  // ป้องกันการกดซ้ำ
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.style.opacity = '0.7';
    submitBtn.innerHTML = '<i class="ti ti-loader" style="font-size:20px;animation:spin 1s linear infinite;"></i> กำลังส่งข้อมูล...';
  }
  statusEl.innerHTML = '<span style="color:orange;"><i class="ti ti-loader"></i> ⏳ กำลังบันทึกข้อมูลขึ้น Firebase โปรดรอสักครู่...</span>';

  // ===== ครอบทุกขั้นตอนด้วย try/catch เดียว =====
  // (เดิม การสร้าง payload ทำนอก try/catch — ถ้า element ใดหายไป/เป็น null
  //  จะเกิด Error แล้วโค้ดหยุดทำงานทันที โดยไม่มีใครมาปลดสถานะปุ่ม "กำลังส่งข้อมูล..."
  //  ทำให้ปุ่มหมุนค้างตลอดไป ทั้งที่ยังไม่ได้ยิง fetch ไป Google Sheets เลย)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // timeout 15s

  // 🛟 Watchdog: นาฬิกาสำรองอิสระ ถ้าผ่านไป 20 วิแล้วปุ่มยังไม่ถูกปลดล็อก
  // (เผื่อกรณีที่คาดไม่ถึง เช่น fetch ค้างแบบไม่ throw, AbortController ใช้ไม่ได้บนเบราว์เซอร์เก่า ฯลฯ)
  // จะบังคับปลดสถานะปุ่มเสมอ ไม่ให้ค้างถาวรอีกต่อไป
  const watchdogId = setTimeout(() => {
    if (submitBtn && submitBtn.disabled) {
      submitBtn.disabled = false;
      submitBtn.style.opacity = '1';
      submitBtn.innerHTML = '<i class="ti ti-send" style="font-size:20px;"></i> ✅ บันทึกและส่งข้อมูลเข้าระบบ';
      statusEl.innerHTML = '<span style="color:red;">⏱️ การเชื่อมต่อใช้เวลานานผิดปกติ — กรุณาตรวจสอบอินเทอร์เน็ต หรือลองกดบันทึกอีกครั้ง (ข้อมูลถูกสำรองไว้ใน localStorage แล้ว)</span>';
      console.error('[submitForm] watchdog triggered: button was stuck disabled for 20s+');
    }
  }, 20000);

  try {
    let majorArr = [];
    document.querySelectorAll('#major_table tbody tr').forEach(row => {
      const cntEl = row.querySelector('.mj-count');
      if(cntEl && (cntEl.value > 0)) {
        const subj = cntEl.getAttribute('data-subject') || getVal('mj_other_title');
        const note = row.querySelector('.mj-note') ? row.querySelector('.mj-note').value : getVal('mj_other_note');
        majorArr.push(`${subj}:${cntEl.value}คน(${note||'-'})`);
      }
    });

    let acArr = [];
    gradeList.forEach(g => {
      const subjEl = document.querySelector(`.ac-subject[data-grade="${g}"]`);
      const subj = subjEl ? subjEl.value : '';
      const freq = getRadioVal(`ac_freq_${g}`);
      if(subj || freq) acArr.push(`${g}[วิชา:${subj||'-'}|ความถี่:${freq||'-'}]`);
    });

    let hwArr = [];
    gradeList.forEach(g => {
      const tv = getRadioVal(`tv_${g}`);
      const ird = getRadioVal(`ird_${g}`);
      if(tv || ird) hwArr.push(`${g}[TV:${tv||'-'}|IRD:${ird||'-'}]`);
    });

    const payload = {
    'timestamp': new Date().toLocaleString('th-TH'),
    'EntryID': (isEditMode && currentEditEntryId) ? currentEditEntryId : genEntryId(),
    '2_บทบาทผู้ให้ข้อมูล': getRadioVal('inf_role'),
    '2_ชื่อ-นามสกุลผู้ให้ข้อมูล': getVal('inf_name'),
    '2_ตำแหน่ง': getVal('inf_pos'),
    '2_โทรศัพท์ผู้ให้ข้อมูล': getVal('inf_tel'),
    '2_อีเมล': getVal('inf_email'),
    '2_วันที่ให้ข้อมูล': getVal('inf_date'),
    '3.1_ชื่อโรงเรียน': getVal('sch_name'),
    '3.1_รหัสโรงเรียน10หลัก': getVal('sch_code'),
    '3.1_ตำบล': getVal('sch_tambon'),
    '3.1_อำเภอ': getVal('sch_amphoe'),
    '3.1_จังหวัด': getVal('sch_province'),
    '3.1_รหัสไปรษณีย์': getVal('sch_zip'),
    '3.1_โทรศัพท์โรงเรียน': getVal('sch_tel'),
    '3.1_สำนักงานเขตพื้นที่การศึกษา': getVal('sch_area'),
    '3.1_ประเภทโรงเรียน': getCheckedValues('sch_type').join(', '),
    '3.2_ลักษณะการจัดชั้นเรียน': getCheckedValues('room_style').join(', '),
    '3.2_รายละเอียดข้อจำกัดห้องเรียน': getVal('room_limit_detail'),
    '3.3_ผู้อำนวยการ/ครูใหญ่': getRadioVal('has_director'),
    '3.3_จำนวนรองผอ(คน)': getVal('count_deputy'),
    '3.3_จำนวนครูผู้สอนทั้งหมด(คน)': getVal('count_teacher'),
    '3.3_จำนวนครูอัตราจ้าง(คน)': getVal('count_contract'),
    '3.3_จำนวนเจ้าหน้าที่ธุรการ(คน)': getVal('count_admin'),
    '3.3_ครูตรงเอก_ปฐมวัย': '', '3.3_ครูตรงเอก_ภาษาไทย': '', '3.3_ครูตรงเอก_คณิตศาสตร์': '', '3.3_ครูตรงเอก_วิทยาศาสตร์และเทคโนโลยี': '', '3.3_ครูตรงเอก_ภาษาอังกฤษ': '', '3.3_ครูตรงเอก_สังคมศึกษา': '', '3.3_ครูตรงเอก_ประวัติศาสตร์': '', '3.3_ครูตรงเอก_สุขศึกษาและพลศึกษา': '', '3.3_ครูตรงเอก_การงานอาชีพ': '', '3.3_ครูตรงเอก_ศิลปะ': '', '3.3_ครูตรงเอก_คอมพิวเตอร์': '', '3.3_ครูตรงเอก_อื่นๆชื่อ': '', '3.3_ครูตรงเอก_อื่นๆจำนวน': '', '3.3_ครูตรงเอก_หมายเหตุ': majorArr.join(' | '),
    '4.1_ลักษณะการใช้DLTV': getCheckedValues('usage_style').join(', '),
    '4.2_ระดับชั้นและรายวิชาที่ใช้DLTV(JSON)': acArr.join(' | '),
    '4.3_บทบาทครูปลายทาง': getCheckedValues('teacher_role').join(', '),
    '4.4_การเตรียมการก่อนใช้DLTV': getCheckedValues('prep_style').join(', '),
    '4.5_การติดตามผลการเรียนรู้': getCheckedValues('follow_style').join(', '),
    '5.1_ช่องทางรับชมDLTV': getCheckedValues('watch_channel').join(', '),
    '5.1_รายละเอียดช่องทางรายชั้น': getVal('watch_channel_diff_detail'),
    '5.2-5.3_สถานะอุปกรณ์รายชั้น(JSON)': hwArr.join(' | '),
    '5.4_โครงสร้างพื้นฐาน(JSON)': [
        `ไฟฟ้า:${getRadioVal('inf_elec')}`, `สัญญาณ:${getRadioVal('inf_sig')}`, `เสียง:${getRadioVal('inf_vol')}`, `เน็ต:${getRadioVal('inf_net')}`
    ].join(' | '),
    '5.5_แนวทางการดูแลและซ่อมบำรุง': getRadioVal('maintenance_style'),
    '6_ลักษณะผู้เรียนและข้อจำกัด': getCheckedValues('student_context').join(', '),
    '6_ลักษณะผู้เรียนและข้อจำกัด2': getCheckedValues('limit_factor').join(', '),
    '6_สิ่งที่ครูต้นทางควรรู้เกี่ยวกับผู้เรียน': getVal('what_teacher_should_know'),
    '7_จุดแข็งในการใช้DLTV': getVal('sch_strength'),
    '7_ปัญหาอุปสรรคและความต้องการสนับสนุน': getVal('sch_problem'),
    // support needs merged above,
    '8.1_บริบทสำคัญของโรงเรียน': getVal('s8_1_context'),
    '8.2_ข้อจำกัดสำคัญในการเรียนรู้': getVal('s8_2_limit'),
    '8.3_สิ่งที่ครูต้นทางควรคำนึงถึง': getVal('s8_3_consider'),
    '8.4_ข้อเสนอเบื้องต้นเพื่อสนับสนุน': getVal('s8_4_proposal'),
    'ลงนาม_ผู้ให้ข้อมูล': getVal('sig1_name'),
    'ลงนาม_ตำแหน่ง': getVal('sig1_pos'),
    'ลงนาม_วันที่': getVal('sig1_date'),
    'ลงนาม_ผู้บริหารรับรอง': getVal('sig2_name'),
    'ลงนาม_ตำแหน่งผู้บริหาร': getVal('sig2_pos'),
    'ลงนาม_วันที่ผู้บริหาร': getVal('sig2_date')
    };

    // เก็บ snapshot ตามตำแหน่งช่องจริงของ F0 ลงคอลัมน์เดียว __snapshot__
    // เพื่อให้ดึงกลับมาแก้ไข/พิมพ์ได้ครบและตรงเป๊ะ แม้โหลดจาก Google Sheets
    try { payload['__snapshot__'] = JSON.stringify(serializeFormPanel('f0')); } catch(e) { console.warn('f0 snapshot fail', e); }

    // บันทึกลง localStorage ก่อนส่งเสมอ (กันข้อมูลหาย)
    try { localStorage.setItem('dltv_f0_last_payload', JSON.stringify(payload)); } catch(e) {}

    // ===== SUBMIT WITH TIMEOUT + no-cors fallback =====
    // เนื่องจาก no-cors ไม่สามารถอ่าน response ได้ → ใช้ AbortController + timeout
    // ถ้าส่งสำเร็จ (ไม่ throw) ถือว่า Google Apps Script ได้รับข้อมูลแล้ว
    //
    // 🔧 บั๊กสำคัญที่แก้: เดิมส่ง payload ตรง ๆ (flat object) แต่ Code.gs ฝั่ง doPost()
    // ต้องการรูปแบบ { formId: "...", data: {...} } เท่านั้น (ดู Code.gs บรรทัด
    // formId = payload.formId / data = payload.data) ถ้าไม่มี formId มันจะ throw
    // "ข้อมูลไม่ครบ" และไม่บันทึกลง Sheet เลย แต่เพราะเป็น no-cors ฝั่งหน้าเว็บ
    // อ่าน response ไม่ได้ จึงเข้าใจผิดว่า "บันทึกสำเร็จ" ทั้งที่ Sheet ไม่มีแถวใหม่เพิ่ม
    // ===== บันทึกลง Firebase (PUT ตาม EntryID = สร้างใหม่หรือทับของเดิม) =====
    // Firebase ตอบกลับได้จริง (ไม่ใช่ no-cors) จึงรู้ผลสำเร็จ/ล้มเหลวแน่นอน
    await fbWriteEntry('f0', payload['EntryID'], payload, controller.signal);
    clearTimeout(timeoutId); clearTimeout(watchdogId);

    // ถ้าเป็นโหมดแก้ไข — อัปเดตข้อมูลใน local allResponsesData ด้วย
    if (isEditMode && currentEditSchoolName) {
      const existRow = allResponsesData.find(r => db2GetRowSchoolName(r).trim() === currentEditSchoolName.trim());
      if (existRow) Object.assign(existRow, payload);
      showSuccessPopup(payload['ชื่อโรงเรียน'] || 'โรงเรียน', '✏️ แก้ไข F1 บันทึกบริบทโรงเรียน');
      const banner = document.getElementById('edit-mode-banner');
      if (banner) banner.remove();
      isEditMode = false; currentEditFormId = null; currentEditSchoolName = null; currentEditEntryId = null;
      // ★ FIX: เดิมโค้ดจุดนี้ไม่ปลดสถานะปุ่ม ทำให้ปุ่มค้างที่ "⏳ กำลังส่งข้อมูล..."
      //   ตลอดไปหลังบันทึกสำเร็จในโหมดแก้ไข (isEditMode) — ต้องปลดล็อกปุ่มเหมือน
      //   เส้นทางบันทึกใหม่ปกติ (ดู else branch ด้านล่าง)
      if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = '1'; submitBtn.innerHTML = '<i class="ti ti-send" style="font-size:20px;"></i> ✅ บันทึกและส่งข้อมูลเข้าระบบ'; }
      setTimeout(() => switchMode('dashboard'), 1400);
    } else {
      statusEl.innerHTML = '<span style="color:green;"><i class="ti ti-circle-check"></i> บันทึกข้อมูลสำเร็จเรียบร้อย!</span>';
      showSuccessPopup(payload['3.1_ชื่อโรงเรียน'] || payload['ชื่อโรงเรียน'] || 'โรงเรียน', '🏫 F1 บันทึกบริบทโรงเรียน');
      // Push to local cache so แก้ไข works immediately without dashboard refresh
      allResponsesData.push(Object.assign({}, payload));
      db2MultiFormData.f0 = [...allResponsesData.filter(r => !r._stub)];
      if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = '1'; submitBtn.innerHTML = '<i class="ti ti-send" style="font-size:20px;"></i> ✅ บันทึกและส่งข้อมูลเข้าระบบ'; }
      resetForm();
    }
  } catch (e) {
    // ✅ ตอนนี้ catch ครอบทุกอย่าง (ทั้งตอนสร้าง payload และตอน fetch)
    // ดังนั้นไม่ว่าจะ error จากจุดไหน ปุ่มจะถูกปลดสถานะเสมอ ไม่ค้างอีกต่อไป
    clearTimeout(timeoutId); clearTimeout(watchdogId);
    if (submitBtn) { submitBtn.disabled = false; submitBtn.style.opacity = '1'; }
    if (e.name === 'AbortError') {
      statusEl.innerHTML = '<span style="color:#b45309;"><i class="ti ti-clock"></i> หมดเวลาการตอบสนอง — ข้อมูลอาจถูกบันทึกแล้ว กรุณาตรวจสอบ Firebase</span>';
      showSuccessPopup(payload['3.1_ชื่อโรงเรียน'] || payload['ชื่อโรงเรียน'] || 'โรงเรียน', '🏫 F1 บันทึกบริบทโรงเรียน', true);
      allResponsesData.push(Object.assign({}, payload));
      db2MultiFormData.f0 = [...allResponsesData.filter(r => !r._stub)];
      if (submitBtn) { submitBtn.innerHTML = '<i class="ti ti-send" style="font-size:20px;"></i> ✅ บันทึกและส่งข้อมูลเข้าระบบ'; }
      resetForm();
    } else {
      statusEl.innerHTML = '<span style="color:red;">❌ เกิดข้อผิดพลาด: ' + e.message + ' — ข้อมูลถูกบันทึกไว้ใน localStorage แล้ว (กรุณาแจ้งผู้ดูแลระบบ)</span>';
      if (submitBtn) { submitBtn.innerHTML = '<i class="ti ti-send" style="font-size:20px;"></i> ✅ บันทึกและส่งข้อมูลเข้าระบบ'; }
    }
  }
}

function resetForm() {
  document.querySelectorAll('#formModeView input[type=text], #formModeView textarea').forEach(el => el.value = '');
  document.querySelectorAll('#formModeView input[type=checkbox], #formModeView input[type=radio]').forEach(el => el.checked = false);
  showTab(0);
}

// ════════════════════════════════════════════════════
// DASHBOARD v2 — State
// ════════════════════════════════════════════════════
let db2MultiFormData = {}; // { f0:[...], f1:[...], ... }
let db2FilteredData  = [];
let db2AiScope       = 'overview';

const DB2_FORMS = [
  { id:'f0', label:'F1', name:'บันทึกบริบทโรงเรียน',      emoji:'🏫' },
  { id:'f1', label:'F2', name:'สังเกตความเข้าใจนักเรียน', emoji:'👁️' },
  { id:'f2', label:'F3', name:'กำกับห้องเรียนปลายทาง',    emoji:'🏫' },
  { id:'f3', label:'F4', name:'สังเกตการสอนต้นทาง',       emoji:'👨‍🏫' },
  { id:'f4', label:'F5', name:'เสียงสะท้อนนักเรียน',      emoji:'💬' },
  { id:'f5', label:'F6', name:'สะท้อนผลรวม PLC',           emoji:'📊' },
];

// ── JSONP helper (ไม่มีปัญหา CORS) ──────────────────
function db2JsonpFetch(url, ms=14000) {
  return new Promise((resolve, reject) => {
    const cb = '__db2cb_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const sc = document.createElement('script');
    let done = false;
    const cleanup = () => { done=true; delete window[cb]; sc.parentNode&&sc.parentNode.removeChild(sc); };
    window[cb] = d => { cleanup(); resolve(d); };
    const t = setTimeout(() => { if(!done){ cleanup(); reject(new Error('Timeout')); } }, ms);
    sc.onerror = () => { clearTimeout(t); cleanup(); reject(new Error('Script error')); };
    const sep = url.includes('?') ? '&' : '?';
    sc.src = url + sep + 'callback=' + cb;
    document.head.appendChild(sc);
  });
}

async function db2Fetch(url) {
  // ลอง JSONP ก่อน → fallback fetch
  try { return await db2JsonpFetch(url, 12000); }
  catch(e) {
    const r = await fetch(url);
    return r.json();
  }
}

// ── LOAD ALL DATA ────────────────────────────────────
async function loadDashboardData() {
  const tbody = document.getElementById('dbTableBody');
  tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:36px;color:#64748b;">⏳ กำลังโหลดข้อมูล...</td></tr>';

  db2MultiFormData = {};
  allResponsesData = [];

  try {
    // F0
    const f0 = await fbReadForm('f0');
    db2MultiFormData.f0 = Array.isArray(f0) ? f0 : [];
    allResponsesData = [...db2MultiFormData.f0];

    // F1–F5
    for (const fid of ['f1','f2','f3','f4','f5']) {
      try { const d = await fbReadForm(fid);
            db2MultiFormData[fid] = Array.isArray(d) ? d : []; }
      catch(_) { db2MultiFormData[fid] = []; }
    }

    // รวมโรงเรียนจาก F1–F5 ที่ไม่มี F0 (ชื่อยังไม่อยู่ใน allResponsesData)
    const knownNames = new Set(allResponsesData.map(r => (r['3.1_ชื่อโรงเรียน'] || r['ชื่อโรงเรียน']||'').trim()));
    for (const fid of ['f1','f2','f3','f4','f5']) {
      (db2MultiFormData[fid]||[]).forEach(r => {
        const n = db2GetRowSchoolName(r).trim();
        if (n && !knownNames.has(n)) {
          knownNames.add(n);
          // สร้าง stub row สำหรับโรงเรียนที่มีแค่ F1–F5 ยังไม่มี F0
          allResponsesData.push({
            'ชื่อโรงเรียน': n,
            'จังหวัด': r['จังหวัด'] || r['จังหวัด '] || '-',
            'รหัสโรงเรียน': '',
            'ผู้ให้ข้อมูล_วันที่บันทึก': r['timestamp'] || r['Timestamp'] || '',
            '_stub': true  // ยังไม่มี F0
          });
        }
      });
    }

    db2RenderAll();
    showToast('✅ โหลดข้อมูลสำเร็จ — ' + allResponsesData.length + ' โรงเรียน');

  } catch(err) {
    tbody.innerHTML = `<tr><td colspan="10" style="padding:36px;">
      <div style="text-align:center;color:#dc2626;font-weight:700;">❌ ดึงข้อมูลจาก Firestore ไม่สำเร็จ</div>
      <div style="text-align:center;color:#64748b;font-size:13px;margin-top:6px;">${err.message}</div>
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:9px;padding:12px 16px;margin:14px auto 0;max-width:560px;font-size:13px;line-height:1.8;color:#92400e;">
        <strong>🔧 วิธีแก้:</strong> ตรวจสอบว่า<br>
        1) ตั้งค่า <code>FS_PROJECT_ID</code> ถูกต้อง (เห็นใน URL คอนโซล: .../project/<b>ตรงนี้</b>/...)<br>
        2) วาง <code>FS_API_KEY</code> = Web API Key (Project Settings ⚙️ → General → Web API Key)<br>
        3) หน้า Firestore → แท็บ Rules อนุญาตให้อ่าน/เขียนได้ (ช่วงทดสอบใช้ <code>allow read, write: if true;</code>)
      </div>
    </td></tr>`;
  }
}

// ── RENDER ALL ───────────────────────────────────────
function db2RenderAll() {
  db2FilteredData = [...allResponsesData];
  db2UpdateHero();
  db2UpdateCards();
  db2RenderTable(db2FilteredData);
}

function db2UpdateHero() {
  const total = allResponsesData.length;
  let totalForms = 0;
  DB2_FORMS.forEach(f => { totalForms += (db2MultiFormData[f.id]||[]).length; });
  const pct = total > 0 ? Math.round(totalForms/(total*6)*100) : 0;
  const complete = allResponsesData.filter(r => db2SchoolFormCount(db2GetRowSchoolName(r)) === 6).length;
  document.getElementById('ds-total').textContent    = total;
  document.getElementById('ds-complete').textContent = complete;
  document.getElementById('ds-forms').textContent    = totalForms;
  document.getElementById('ds-pct').textContent      = pct + '%';
}

function db2UpdateCards() {
  const total = allResponsesData.length;
  let c1=0, c2=0, c3=0;
  allResponsesData.forEach(r => {
    const cnt = db2SchoolFormCount(db2GetRowSchoolName(r));
    if(cnt===6) c1++; else if(cnt>=2) c2++; else c3++;
  });
  const totalForms = DB2_FORMS.reduce((a,f)=>a+(db2MultiFormData[f.id]||[]).length,0);
  document.getElementById('db2-c0').textContent = total;
  document.getElementById('db2-c1').textContent = c1;
  document.getElementById('db2-c2').textContent = c2;
  document.getElementById('db2-c4').textContent = totalForms;
}

// หาชื่อโรงเรียนจาก row ของฟอร์มใดก็ได้
// F0 ใช้ label "ชื่อโรงเรียน", F1/F2/F3/F5 ใช้ "ชื่อโรงเรียนปลายทาง", F4 ใช้ "โรงเรียน"
// (autoCollectForm สร้าง key จาก label ของแต่ละฟอร์ม จึงไม่ตรงกัน) ต้องเช็คทุกแบบ
function db2GetRowSchoolName(r) {
  return (r['3.1_ชื่อโรงเรียน'] || r['ชื่อโรงเรียน'] || r['ชื่อโรงเรียนปลายทาง'] || r['โรงเรียนปลายทาง'] || r['โรงเรียน'] || r['school_name'] || '').toString().trim();
}

// สังกัด (สำนักงานเขตพื้นที่การศึกษา) ของโรงเรียน — เอาจาก F0 ก่อน ถ้าไม่มีค่อยหาในฟอร์มอื่น
function db2GetSchoolArea(name, row) {
  const pick = (r) => (r && (r['3.1_สำนักงานเขตพื้นที่การศึกษา'] || r['สำนักงานเขตพื้นที่การศึกษา'] || r['สำนักงานเขตพื้นที่'] || '')).toString().trim();
  let v = pick(row);
  if (v) return v;
  // หาในฟอร์ม f1-f5 ของโรงเรียนเดียวกัน
  for (const f of DB2_FORMS) {
    if (f.id === 'f0') continue;
    const rows = db2GetFormRows(name, f.id);
    for (const r of rows) { const a = pick(r); if (a) return a; }
  }
  return '';
}

function db2SchoolFormStatus(name) {
  const trimmed = name.trim();
  const st = {};
  DB2_FORMS.forEach(f => {
    if (f.id === 'f0') {
      // F0 จริงต้องไม่ใช่ stub row
      st.f0 = allResponsesData.some(r => (r['3.1_ชื่อโรงเรียน'] || r['ชื่อโรงเรียน']||'').trim() === trimmed && !r._stub);
    } else {
      st[f.id] = (db2MultiFormData[f.id]||[]).some(r =>
        db2GetRowSchoolName(r) === trimmed
      );
    }
  });
  return st;
}
function db2SchoolFormCount(name) {
  return Object.values(db2SchoolFormStatus(name)).filter(Boolean).length;
}

// ── TABLE ─────────────────────────────────────────────
function db2RenderTable(data) {
  const tbody = document.getElementById('dbTableBody');
  const badge = document.getElementById('db2TableBadge');
  if(badge) badge.textContent = data.length + ' โรงเรียน';

  if(!data.length) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:40px;color:#94a3b8;">ไม่พบข้อมูลที่ตรงกัน</td></tr>';
    return;
  }

  tbody.innerHTML = data.map((row, idx) => {
    const name    = row['3.1_ชื่อโรงเรียน'] || row['ชื่อโรงเรียน'] || '-';
    const prov    = row['3.1_จังหวัด'] || row['จังหวัด'] || '-';
    const area    = db2GetSchoolArea(name, row);
    const code    = row['3.1_รหัสโรงเรียน10หลัก'] || row['รหัสโรงเรียน'] || (row._stub ? '(ยังไม่มี F1)' : '-');
    const date    = row['2_วันที่ให้ข้อมูล'] || row['ผู้ให้ข้อมูล_วันที่บันทึก'] || row['timestamp'] || '-';
    const isStub  = !!row._stub;
    const st      = db2SchoolFormStatus(name);
    const cnt     = Object.values(st).filter(Boolean).length;
    const pct     = Math.round(cnt/6*100);
    const col     = pct===100 ? '#16a34a' : pct>=50 ? '#d97706' : '#3b82f6';

    const chips = DB2_FORMS.map(f => {
      const safeName = name.replace(/'/g,"\\'");
      const n = st[f.id] ? db2GetFormRows(name, f.id).length : 0;
      if (!n) {
        return `<td style="text-align:center;"><span class="fchip no" style="cursor:pointer;" title="ยังไม่มีข้อมูล ${f.label}"><i class="ti ti-minus"></i></span></td>`;
      }
      const onclick = n > 1
        ? `openFormEntryPicker('${safeName}','${f.id}')`
        : `openFormPreview('${safeName}','${f.id}')`;
      const badge = n > 1
        ? `<span style="position:absolute;top:-6px;right:-8px;background:#ef4444;color:#fff;font-size:9px;font-weight:700;min-width:15px;height:15px;line-height:15px;border-radius:8px;padding:0 3px;">${n}</span>`
        : '';
      const title = n > 1 ? `${f.label}: มี ${n} รายการ (คลิกเพื่อเลือก)` : `คลิกเพื่อดู ${f.label}`;
      return `<td style="text-align:center;"><span class="fchip ok" style="cursor:pointer;position:relative;display:inline-flex;" title="${title}" onclick="${onclick}"><i class="ti ti-check"></i>${badge}</span></td>`;
    }).join('');

    // find original index in allResponsesData for PDF/preview
    const origIdx = allResponsesData.indexOf(row);

    const safeSumName = name.replace(/'/g,"\\'");

    return `<tr${isStub ? ' style="background:#fffbeb;"' : ''}>
      <td>
        <div class="sn">${name}${isStub ? ' <span style="font-size:10px;color:#d97706;background:#fef3c7;padding:1px 6px;border-radius:10px;">ยังไม่มี F1</span>' : ''}</div>
        <div class="si">${code} · ${date}</div>
      </td>
      <td>${prov}</td>
      <td style="font-size:12px;color:#475569;">${area || '<span style="color:#cbd5e1;">—</span>'}</td>
      ${chips}
      <td>
        <div style="display:flex;align-items:center;gap:5px;">
          <span style="font-weight:700;color:${col};font-size:12.5px;">${cnt}/6</span>
          <span style="font-size:11px;color:#94a3b8;">(${pct}%)</span>
        </div>
        <div class="pb-wrap"><div class="pb-fill" style="width:${pct}%;background:${col};"></div></div>
      </td>
      <td>
        <div class="row-actions">
          <button class="ra-btn ra-view" title="ดูสรุป / พรีวิวรายโรงเรียน" onclick="openPreviewModal(${origIdx})"><i class="ti ti-eye"></i><span>ดู</span></button>
          ${isStub ? '' : `<button class="ra-btn ra-pdf" title="ดาวน์โหลด PDF" onclick="downloadSinglePDF(${origIdx})"><i class="ti ti-file-text"></i><span>PDF</span></button>`}
          <button class="ra-btn ra-edit" title="แก้ไขแบบฟอร์ม" onclick="openRowMenu(event,'${safeSumName}')"><i class="ti ti-pencil"></i><span>แก้ไข</span><i class="ti ti-chevron-down ra-caret"></i></button>
          ${isStub ? '<span class="ra-stub" title="ยังไม่มีข้อมูล F1">⚠️ ยังไม่มี F1</span>' : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ── Row edit dropdown menu (popover rendered to <body> so it isn't clipped) ──
function openRowMenu(ev, name) {
  ev.stopPropagation();
  closeRowMenu();
  const safe = name.replace(/'/g, "\\'");
  const st = db2SchoolFormStatus(name);
  const items = DB2_FORMS.filter(f => st[f.id]).map(f => {
    const nrec  = db2GetFormRows(name, f.id).length;
    const click = (nrec > 1) ? `openFormEntryPicker('${safe}','${f.id}')` : `openFormEdit('${safe}','${f.id}')`;
    const badge = nrec > 1 ? `<span class="rm-count">${nrec}</span>` : '';
    return `<button class="rm-item" onclick="closeRowMenu();${click}">
      <span class="rm-emoji">${f.emoji}</span>
      <span class="rm-label">แก้ไข ${f.label} <small>${f.name}</small></span>${badge}</button>`;
  }).join('');

  const menu = document.createElement('div');
  menu.className = 'row-menu';
  menu.id = 'activeRowMenu';
  menu.innerHTML = `<div class="rm-head">เลือกแบบฟอร์มที่จะแก้ไข</div>${items || '<div class="rm-empty">ยังไม่มีแบบฟอร์มให้แก้ไข</div>'}`;
  document.body.appendChild(menu);

  const r = ev.currentTarget.getBoundingClientRect();
  let left = r.right - menu.offsetWidth;
  if (left < 8) left = 8;
  let top = r.bottom + 6;
  if (top + menu.offsetHeight > window.innerHeight - 8) {
    top = Math.max(8, r.top - menu.offsetHeight - 6); // flip up if no room below
  }
  menu.style.left = left + 'px';
  menu.style.top  = top + 'px';

  setTimeout(() => {
    document.addEventListener('click', closeRowMenu, { once: true });
    window.addEventListener('scroll', closeRowMenu, { once: true, capture: true });
    window.addEventListener('resize', closeRowMenu, { once: true });
  }, 0);
}
function closeRowMenu() {
  const m = document.getElementById('activeRowMenu');
  if (m) m.remove();
}

function filterDashboardTable() {
  const q  = (document.getElementById('dbSearchInput')?.value||'').toLowerCase();
  const st = document.getElementById('db2FilterSel')?.value || '';

  db2FilteredData = allResponsesData.filter(row => {
    const name = (row['ชื่อโรงเรียน']||'').toLowerCase();
    const prov = (row['จังหวัด']||'').toLowerCase();
    const code = (row['รหัสโรงเรียน']||'').toLowerCase();
    if(q && !name.includes(q) && !prov.includes(q) && !code.includes(q)) return false;
    if(st) {
      const cnt = db2SchoolFormCount(row['ชื่อโรงเรียน']||'');
      if(st==='complete' && cnt!==6) return false;
      if(st==='partial'  && (cnt<2||cnt===6)) return false;
      if(st==='f0only'   && cnt!==1) return false;
    }
    return true;
  });
  db2RenderTable(db2FilteredData);
}

// legacy compat
function renderDashboardTable(data) { db2RenderTable(data); }
function renderSummaryCards(summary) {} // no-op, cards now auto-computed

// ── AI ANALYSIS ──────────────────────────────────────
function setAiScope(scope, btn) {
  db2AiScope = scope;
  document.querySelectorAll('.sc-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

async function db2AiSchool(name) {
  db2AiScope = 'overview';
  document.querySelectorAll('.sc-btn').forEach((b,i)=>b.classList.toggle('active',i===0));
  const allForms = {};
  DB2_FORMS.forEach(f => {
    allForms[f.id] = (db2MultiFormData[f.id]||[]).filter(r =>
      db2GetRowSchoolName(r) === name
    );
  });
  const f0row = allResponsesData.find(r=>db2GetRowSchoolName(r).trim()===name.trim());
  await db2CallClaude(db2BuildSnippet('overview', allForms, f0row?[f0row]:[]), 'เฉพาะโรงเรียน: '+name);
  document.getElementById('db2AiBody').scrollIntoView({behavior:'smooth',block:'start'});
}

async function runAiAnalysis() {
  if(!allResponsesData.length){ showToast('⚠️ กรุณาโหลดข้อมูลก่อน'); return; }
  const labels = {overview:'ภาพรวมทั้งหมด',f0:'F1 บริบท',f1:'F2 นักเรียน',
    f2f3:'F3+F4 ครู',f4f5:'F5+F6 สะท้อน',issues:'ปัญหา',support:'ความต้องการ'};
  await db2CallClaude(db2BuildSnippet(db2AiScope, db2MultiFormData, allResponsesData), labels[db2AiScope]||db2AiScope);
}

function db2BuildSnippet(scope, formData, f0Rows) {
  const lines = [];
  const incF0 = ['overview','f0','issues','support'].includes(scope);
  if(incF0 && f0Rows.length) {
    lines.push(`=== F0: บริบทโรงเรียนปลายทาง (${f0Rows.length} โรงเรียน) ===`);
    f0Rows.slice(0,25).forEach(r => {
      lines.push(`
โรงเรียน: ${r['3.1_ชื่อโรงเรียน']||r['ชื่อโรงเรียน']||'-'} | จังหวัด: ${r['3.1_จังหวัด']||r['จังหวัด']||'-'} | ประเภท: ${r['3.1_ประเภทโรงเรียน']||r['ประเภทโรงเรียน_รวม']||'-'}`);
      lines.push(`การใช้ DLTV: ${r['4.1_ลักษณะการใช้DLTV']||r['ภาพรวมการใช้_รวม']||'-'} | ข้อจำกัด: ${r['6_ลักษณะผู้เรียนและข้อจำกัด']||r['ข้อจำกัดสำคัญ_รวม']||'-'}`);
      lines.push(`จุดแข็ง: ${r['7_จุดแข็งในการใช้DLTV']||r['จุดแข็งโรงเรียน']||'-'}`);
      lines.push(`ปัญหา: ${r['7_ปัญหาอุปสรรคและความต้องการสนับสนุน']||r['ปัญหาอุปสรรค']||'-'} | ต้องการ: ${r['7_ปัญหาอุปสรรคและความต้องการสนับสนุน']||r['สิ่งที่โรงเรียนต้องการสนับสนุน']||'-'}`);
      lines.push(`ครูต้นทางควรรู้: ${r['6_สิ่งที่ครูต้นทางควรรู้เกี่ยวกับผู้เรียน']||r['ครูต้นทางควรรับรู้']||'-'}`);
      if(r['8.1_บริบทสำคัญของโรงเรียน']) lines.push(`สรุปบริบท: ${r['8.1_บริบทสำคัญของโรงเรียน']}`); else if(r['S8_บริบทสำคัญ']) lines.push(`สรุปบริบท: ${r['S8_บริบทสำคัญ']}`);
    });
  }
  ['f1','f2','f3','f4','f5'].forEach(fid => {
    const need = scope==='overview'||scope===fid||
      (scope==='f2f3'&&(fid==='f2'||fid==='f3'))||
      (scope==='f4f5'&&(fid==='f4'||fid==='f5'))||
      scope==='issues';
    if(need && (formData[fid]||[]).length) {
      const fd = DB2_FORMS.find(f=>f.id===fid);
      lines.push(`
=== ${fid.toUpperCase()}: ${fd?.name} (${formData[fid].length} รายการ) ===`);
      formData[fid].slice(0,10).forEach(r => {
        lines.push(Object.entries(r).filter(([k,v])=>v&&String(v).length>2&&!k.includes('rowIndex')&&!k.startsWith('__'))
          .slice(0,10).map(([k,v])=>`${k}: ${v}`).join(' | '));
      });
    }
  });
  return lines.join('\n');
}

// ── ดึง API key จาก input หรือ sessionStorage ──────────
function getAnthropicKey() {
  const inp = document.getElementById('aiKeyInput');
  const val = inp ? inp.value.trim() : '';
  if (val) { try { sessionStorage.setItem('dltv_ai_key', val); } catch(_){} return val; }
  try { return sessionStorage.getItem('dltv_ai_key') || ''; } catch(_){ return ''; }
}

function saveAiKey(val) {
  const status = document.getElementById('aiKeyStatus');
  if (!status) return;
  if (val && val.startsWith('sk-ant-')) {
    try { sessionStorage.setItem('dltv_ai_key', val); } catch(_){}
    status.textContent = '✅ พร้อมใช้งาน';
    status.style.color = '#16a34a';
  } else if (val) {
    status.textContent = '❌ Key ไม่ถูกต้อง';
    status.style.color = '#dc2626';
  } else {
    status.textContent = '—';
    status.style.color = '#94a3b8';
  }
}

function loadSavedAiKey() {
  try {
    const saved = sessionStorage.getItem('dltv_ai_key');
    const inp = document.getElementById('aiKeyInput');
    if (saved && inp) {
      inp.value = saved;
      saveAiKey(saved);
    }
  } catch(_){}
}

async function db2CallClaude(snippet, scopeLabel) {
  const btn  = document.getElementById('db2AiBtn');
  const body = document.getElementById('db2AiBody');

  // ตรวจ API key
  const apiKey = getAnthropicKey();
  if (!apiKey || !apiKey.startsWith('sk-ant-')) {
    body.innerHTML = `
      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:20px;text-align:center;">
        <div style="font-size:28px;margin-bottom:8px;">🔑</div>
        <div style="font-weight:700;color:#92400e;margin-bottom:6px;">กรุณาใส่ Anthropic API Key ก่อน</div>
        <div style="font-size:13px;color:#64748b;margin-bottom:14px;">วาง key ในช่องด้านบน แล้วกด "วิเคราะห์ด้วย AI" อีกครั้ง</div>
        <a href="https://console.anthropic.com/api-keys" target="_blank"
           style="font-size:13px;color:#6d28d9;font-weight:600;">🔗 ขอ API Key ที่ console.anthropic.com</a>
      </div>`;
    return;
  }

  btn.disabled = true; btn.textContent = '⏳ กำลังวิเคราะห์...';
  body.innerHTML = '<div style="text-align:center;padding:40px;color:#6d28d9;"><div style="font-size:36px;margin-bottom:10px;">🤖</div><div style="font-size:14px;font-weight:700;">AI กำลังวิเคราะห์ข้อมูล...</div></div>';

  const sys = `คุณเป็นผู้เชี่ยวชาญวิเคราะห์ข้อมูลการศึกษา DLTV ตอบเป็นภาษาไทย ใน JSON เท่านั้น ไม่มี backticks:
{"executive_summary":"...","key_findings":["..."],"strengths":["..."],"challenges":["..."],"recommendations":["..."],"urgent_issues":["..."],"tags":{"red":["..."],"amber":["..."],"green":["..."]}}`;

  const scopeMap = {overview:'วิเคราะห์ภาพรวมทั้งหมด',f0:'วิเคราะห์บริบทโรงเรียน F1',f1:'วิเคราะห์ความเข้าใจนักเรียน F2',f2f3:'วิเคราะห์การสอนครูต้นทาง/ปลายทาง F3+F4',f4f5:'วิเคราะห์เสียงสะท้อนและ PLC F5+F6',issues:'ระบุและจัดกลุ่มปัญหาอุปสรรค',support:'วิเคราะห์ความต้องการการสนับสนุน'};

  try {
    // เรียก Anthropic API โดยตรงจาก browser
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system: sys,
        messages: [{ role: 'user', content: `${scopeMap[db2AiScope]||scopeMap.overview}\n\n${snippet}\n\nขอบเขต: ${scopeLabel}` }]
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(()=>({error:{message:res.statusText}}));
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    const raw  = data.content?.[0]?.text || '';
    let parsed;
    try { parsed = JSON.parse(raw.replace(/```json|```/g,'').trim()); } catch(_){}
    if (parsed) db2RenderAiResult(parsed, scopeLabel);
    else body.innerHTML = `<div class="ai-result"><div class="ai-sec"><h5>📄 ผลวิเคราะห์</h5><p style="white-space:pre-wrap;line-height:1.8;">${raw}</p></div></div>`;

  } catch(e) {
    body.innerHTML = `<div style="color:#dc2626;text-align:center;padding:30px;font-size:14px;">❌ ${e.message}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = '✨ วิเคราะห์ด้วย AI';
  }
}

function db2RenderAiResult(d, scopeLabel) {
  const body = document.getElementById('db2AiBody');
  const li   = arr => (arr||[]).map(i=>`<li>${i}</li>`).join('') || '<li>—</li>';
  const tags = (arr,cls) => (arr||[]).map(t=>`<span class="tag ${cls}">${t}</span>`).join('');
  body.innerHTML = `<div class="ai-result">
    <div class="ai-meta"><span class="ai-stag">📊 ${scopeLabel}</span><span>· ${new Date().toLocaleTimeString('th-TH')}</span><span>· ${allResponsesData.length} โรงเรียน</span></div>
    ${d.executive_summary?`<div class="ai-sec"><h5>📌 สรุปผู้บริหาร</h5><p>${d.executive_summary}</p></div>`:''}
    ${(d.key_findings||[]).length?`<div class="ai-sec"><h5>🔍 ข้อค้นพบสำคัญ</h5><ul>${li(d.key_findings)}</ul></div>`:''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px;">
      ${(d.strengths||[]).length?`<div class="ai-sec" style="margin:0;"><h5>💚 จุดแข็ง</h5><ul>${li(d.strengths)}</ul></div>`:''}
      ${(d.challenges||[]).length?`<div class="ai-sec" style="margin:0;"><h5>🔴 ความท้าทาย</h5><ul>${li(d.challenges)}</ul></div>`:''}
    </div>
    ${(d.recommendations||[]).length?`<div class="ai-sec"><h5>💡 ข้อเสนอแนะ</h5><ul>${li(d.recommendations)}</ul></div>`:''}
    ${(d.urgent_issues||[]).length?`<div class="ai-urgent ai-sec"><h5>⚡ ประเด็นเร่งด่วน</h5><ul>${li(d.urgent_issues)}</ul></div>`:''}
    ${d.tags?`<div class="ai-sec"><h5>🏷️ ป้ายกำกับ</h5><div class="tag-row">${tags(d.tags.red,'r')}${tags(d.tags.amber,'a')}${tags(d.tags.green,'g')}</div></div>`:''}
  </div>`;
}


// ════════════════════════════════════════════════════
// SCHOOL SUMMARY PANEL — สรุปประเด็นสำคัญรายโรงเรียน
// ════════════════════════════════════════════════════

function openSchoolSummary(schoolName) {
  const panel = document.getElementById('schoolSummaryPanel');
  const body  = document.getElementById('schoolSummaryBody');
  const title = document.getElementById('schoolSummaryTitle');
  const badge = document.getElementById('schoolSummaryBadge');

  title.textContent = 'สรุปประเด็นสำคัญ — ' + schoolName;
  const st = db2SchoolFormStatus(schoolName);
  const cnt = Object.values(st).filter(Boolean).length;
  badge.textContent = cnt + '/6 ฟอร์ม';

  body.innerHTML = buildSchoolSummaryHTML(schoolName, st);
  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeSchoolSummary() {
  document.getElementById('schoolSummaryPanel').style.display = 'none';
}

function printSchoolSummary() {
  const body = document.getElementById('schoolSummaryBody');
  const printArea = document.getElementById('school-summary-print');
  const title = document.getElementById('schoolSummaryTitle').textContent;
  printArea.innerHTML = '<div style="font-family:Sarabun,sans-serif;padding:10mm 15mm;color:#1e293b;">' +
    '<h2 style="text-align:center;color:#1e3a8a;font-size:18pt;margin:0 0 4px;">' + title + '</h2>' +
    '<p style="text-align:center;color:#64748b;font-size:11pt;margin:0 0 16px;">โครงการ DLTV</p>' +
    body.innerHTML + '</div>';
  const style = document.createElement('style');
  style.id = '__sum_print_style__';
  style.textContent = '@media print{body *{visibility:hidden!important}#school-summary-print,#school-summary-print *{visibility:visible!important;display:block!important}#school-summary-print{position:absolute;top:0;left:0;width:100%;padding:0;}}';
  document.head.appendChild(style);
  printArea.style.display = 'block';
  window.print();
  setTimeout(function() {
    printArea.style.display = 'none';
    var s = document.getElementById('__sum_print_style__');
    if (s) s.remove();
  }, 1000);
}

function _sv(row) {
  var keys = Array.prototype.slice.call(arguments, 1);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (!k) continue;
    var v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    var a = k.replace(/ /g,'_'), b = k.replace(/_/g,' ');
    if (row[a] !== undefined && String(row[a]).trim() !== '') return String(row[a]).trim();
    if (row[b] !== undefined && String(row[b]).trim() !== '') return String(row[b]).trim();
  }
  return '';
}

function _esc2(s) { return String(s == null ? '' : s).replace(/</g,'&lt;').replace(/\n/g,'<br>'); }

function _trow(label, val, bg, color) {
  if (!val) return '';
  return '<tr><td style="width:38%;font-weight:600;background:' + (bg||'#f8fafc') + ';padding:7px 10px;border:1px solid #e2e8f0;vertical-align:top;' + (color?'color:'+color+';':'') + '">' + label + '</td><td style="padding:7px 10px;border:1px solid #e2e8f0;white-space:pre-wrap;">' + _esc2(val) + '</td></tr>';
}

function _fhead(label, count, hasData) {
  var ok = hasData
    ? '<span style="background:#dcfce7;color:#15803d;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;">✓ มีข้อมูล' + (count > 1 ? ' ' + count + ' รายการ' : '') + '</span>'
    : '<span style="background:#f1f5f9;color:#94a3b8;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;">— ยังไม่มีข้อมูล</span>';
  return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 14px;background:linear-gradient(135deg,#1e3a8a,#2563eb);border-radius:10px;margin-bottom:10px;margin-top:18px;"><span style="font-weight:800;color:#fff;font-size:14px;">' + label + '</span>' + ok + '</div>';
}

function _miniCard(icon, label, val, bg, border, color) {
  if (!val) val = '<span style="color:#94a3b8;">— ไม่มีข้อมูล —</span>';
  return '<div style="background:' + (bg||'#f8fafc') + ';border:1.5px solid ' + (border||'#e2e8f0') + ';border-radius:12px;padding:14px 16px;margin-bottom:10px;">' +
    '<div style="font-size:12px;font-weight:700;color:' + (color||'#475569') + ';margin-bottom:6px;">' + icon + ' ' + label + '</div>' +
    '<div style="font-size:13.5px;color:#1e293b;line-height:1.7;white-space:pre-wrap;">' + val + '</div></div>';
}

function buildSchoolSummaryHTML(schoolName, st) {

  /* ── helpers ─────────────────────────────── */
  function sv(row) {
    var keys = Array.prototype.slice.call(arguments, 1);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i]; if (!k) continue;
      if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return String(row[k]).trim();
      var a = k.replace(/ /g,'_'), b = k.replace(/_/g,' ');
      if (row[a] !== undefined && String(row[a]).trim() !== '') return String(row[a]).trim();
      if (row[b] !== undefined && String(row[b]).trim() !== '') return String(row[b]).trim();
    }
    return '';
  }
  function svMatch(row) {
    var kws = Array.prototype.slice.call(arguments, 1);
    var keys = Object.keys(row);
    for (var ki = 0; ki < kws.length; ki++) {
      var kw = kws[ki].toLowerCase();
      for (var ri = 0; ri < keys.length; ri++) {
        var rk = keys[ri];
        if (rk.toLowerCase().indexOf(kw) !== -1) {
          var v = String(row[rk]||'').trim();
          if (v.length > 2) return v;
        }
      }
    }
    return '';
  }
  function esc(s) { return String(s==null?'':s).replace(/</g,'&lt;').replace(/\n/g,'<br>'); }
  function fmtTs(ts) {
    if (!ts) return '';
    try {
      var d = new Date(ts);
      if (isNaN(d.getTime())) return String(ts);
      return d.toLocaleDateString('th-TH',{year:'numeric',month:'short',day:'numeric'}) + ' ' + d.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
    } catch(e) { return String(ts); }
  }
  function trow(label, val, bg, color) {
    if (!val || !String(val).trim()) return '';
    return '<tr><td style="width:36%;font-weight:600;background:'+(bg||'#f8fafc')+';padding:7px 10px;border:1px solid #e2e8f0;vertical-align:top;'+(color?'color:'+color+';':'')+'">'+label+'</td>'
           +'<td style="padding:7px 10px;border:1px solid #e2e8f0;line-height:1.6;white-space:pre-wrap;">'+esc(val)+'</td></tr>';
  }
  function card(icon, label, val, bg, border, color) {
    var content = (val && String(val).trim()) ? esc(val) : '<span style="color:#94a3b8;">— ไม่มีข้อมูล —</span>';
    return '<div style="background:'+(bg||'#f8fafc')+';border:1.5px solid '+(border||'#e2e8f0')+';border-radius:12px;padding:14px 16px;margin-bottom:10px;">'
           +'<div style="font-size:12px;font-weight:700;color:'+(color||'#475569')+';margin-bottom:6px;">'+icon+' '+label+'</div>'
           +'<div style="font-size:13.5px;color:#1e293b;line-height:1.7;white-space:pre-wrap;">'+content+'</div></div>';
  }
  function secHead(emoji, label, count, hasData) {
    var badge = hasData
      ? '<span style="background:#dcfce7;color:#15803d;border-radius:20px;padding:3px 12px;font-size:11px;font-weight:700;">✓ มีข้อมูล'+(count>1?' '+count+' รายการ':'')+'</span>'
      : '<span style="background:#f1f5f9;color:#94a3b8;border-radius:20px;padding:3px 12px;font-size:11px;font-weight:700;">— ยังไม่มีข้อมูล</span>';
    return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:11px 16px;background:linear-gradient(135deg,#1e3a8a,#2563eb);border-radius:10px;margin:18px 0 10px;">'
           +'<span style="font-weight:800;color:#fff;font-size:14px;">'+emoji+' '+label+'</span>'+badge+'</div>';
  }
  function rowMeta(parts) {
    var txt = parts.filter(Boolean).join(' &nbsp;·&nbsp; ');
    if (!txt) return '';
    return '<div style="font-size:12px;color:#64748b;margin-bottom:8px;padding-left:2px;">'+txt+'</div>';
  }
  function fallbackTable(r) {
    var skip = {'rowIndex':1,'Timestamp':1,'timestamp':1,'EntryID':1,'entryId':1,'_stub':1};
    var entries = Object.entries(r).filter(function(e){
      return !skip[e[0]] && !String(e[0]).startsWith('__') && e[1] !== null && e[1] !== undefined && String(e[1]).trim().length > 1;
    });
    if (!entries.length) return '<div style="color:#94a3b8;font-size:13px;padding:6px 0 12px;">— ไม่พบข้อมูลสรุปในฟอร์มนี้</div>';
    var h = '<div style="border:1.5px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:14px;">'
           +'<table style="width:100%;border-collapse:collapse;font-size:12.5px;">';
    entries.slice(0,20).forEach(function(e){ h += trow(String(e[0]).replace(/_/g,' '), String(e[1])); });
    h += '</table></div>';
    return h;
  }
  function entryBanner(idx, obs, ts, total) {
    if (total <= 1) return '';
    var name = obs && String(obs).trim() ? String(obs).trim() : '(ไม่ระบุผู้สังเกต)';
    var time = fmtTs(ts);
    return '<div style="background:#f0f4ff;border-left:3px solid #3b82f6;border-radius:6px;padding:8px 12px;margin-bottom:8px;font-size:12px;font-weight:700;color:#1e3a8a;">'
           +'รายการที่ '+(idx+1)+': '+esc(name)+(time?' &nbsp;·&nbsp; <span style="font-weight:400;color:#64748b;">'+time+'</span>':'')+'</div>';
  }

  var html = '';

  /* ════════════════════════════════════════════
     F1 · บันทึกบริบทโรงเรียน  (allResponsesData, key=f0)
     ════════════════════════════════════════════ */
  var f0 = allResponsesData.find(function(r){ return db2GetRowSchoolName(r).trim()===schoolName && !r._stub; });
  html += secHead('🏫','F1 · บันทึกบริบทโรงเรียน', 1, !!f0);
  if (f0) {
    var prov    = sv(f0,'3.1_จังหวัด','จังหวัด');
    var area    = sv(f0,'3.1_สำนักงานเขตพื้นที่การศึกษา','สำนักงานเขตพื้นที่การศึกษา');
    var type_   = sv(f0,'3.1_ประเภทโรงเรียน','ประเภทโรงเรียน_รวม');
    var usage   = sv(f0,'4.1_ลักษณะการใช้DLTV','ภาพรวมการใช้_รวม');
    var ctx61   = sv(f0,'6_ลักษณะผู้เรียนและข้อจำกัด');
    var ctx62   = sv(f0,'6_ลักษณะผู้เรียนและข้อจำกัด2');
    var tknow   = sv(f0,'6_สิ่งที่ครูต้นทางควรรู้เกี่ยวกับผู้เรียน');
    var str_    = sv(f0,'7_จุดแข็งในการใช้DLTV');
    var prob    = sv(f0,'7_ปัญหาอุปสรรคและความต้องการสนับสนุน');
    var ctx8_1  = sv(f0,'8.1_บริบทสำคัญของโรงเรียน');
    var ctx8_2  = sv(f0,'8.2_ข้อจำกัดสำคัญในการเรียนรู้');
    var ctx8_3  = sv(f0,'8.3_สิ่งที่ครูต้นทางควรคำนึงถึง');
    var ctx8_4  = sv(f0,'8.4_ข้อเสนอเบื้องต้นเพื่อสนับสนุน');
    var inf     = sv(f0,'2_ชื่อ-นามสกุลผู้ให้ข้อมูล','ลงนาม_ผู้ให้ข้อมูล');
    var recDate = sv(f0,'2_วันที่ให้ข้อมูล','ผู้ให้ข้อมูล_วันที่บันทึก');
    html += rowMeta([prov, area, inf?'ผู้ให้ข้อมูล: '+inf:'', recDate?fmtTs(recDate):'']);
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">';
    html += card('🏷️','ประเภทโรงเรียน', type_, '#eff6ff','#93c5fd','#1d4ed8');
    html += card('📺','ภาพรวมการใช้ DLTV', usage, '#eff6ff','#93c5fd','#1d4ed8');
    html += '</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">';
    html += card('💪','จุดแข็งในการใช้ DLTV', str_, '#f0fdf4','#86efac','#15803d');
    html += card('⚠️','ปัญหา / อุปสรรค', prob, '#fffbeb','#fcd34d','#d97706');
    html += '</div>';
    if (ctx61||ctx62) html += card('👥','ลักษณะผู้เรียนและข้อจำกัด', [ctx61,ctx62].filter(Boolean).join('\n'), '#fffbeb','#fcd34d','#d97706');
    if (tknow)        html += card('👩‍🏫','สิ่งที่ครูต้นทางควรรู้เกี่ยวกับผู้เรียน', tknow, '#f8fafc','#e2e8f0','#475569');
    if (ctx8_1||ctx8_2||ctx8_3||ctx8_4) {
      html += '<div style="border:1.5px solid #e2e8f0;border-radius:12px;padding:14px 16px;margin-bottom:10px;">'
             +'<div style="font-weight:700;color:#1e3a8a;margin-bottom:10px;font-size:13px;">📌 สรุปบริบทสำคัญ (หมวด 8)</div>'
             +'<table style="width:100%;border-collapse:collapse;font-size:13px;">'
             +trow('8.1 บริบทสำคัญของโรงเรียน', ctx8_1,'#f8fafc')
             +trow('8.2 ข้อจำกัดสำคัญในการเรียนรู้', ctx8_2,'#fffbeb','#d97706')
             +trow('8.3 สิ่งที่ครูต้นทางควรคำนึงถึง', ctx8_3,'#f8fafc')
             +trow('8.4 ข้อเสนอเบื้องต้น', ctx8_4,'#f0fdf4','#15803d')
             +'</table></div>';
    }
  } else {
    html += '<div style="padding:12px 4px;color:#d97706;font-size:13px;font-weight:600;">⚠️ ยังไม่ได้กรอกแบบฟอร์ม F1 (บริบทโรงเรียน)</div>';
  }

  /* ════════════════════════════════════════════
     F2 · สังเกตความเข้าใจนักเรียน  (db2MultiFormData['f1'])
     key จริง: 14.1_นักเรียนเข้าใจดีในประเด็นใด / 14.2_ / 14.3_ / 14.4_ / 14.5_ / 14.6_ / 14_ความเห็นเพิ่มเติม
     ════════════════════════════════════════════ */
  var f1rows = db2GetFormRows(schoolName,'f1');
  html += secHead('👁️','F2 · สังเกตความเข้าใจนักเรียน', f1rows.length, f1rows.length>0);
  if (f1rows.length) {
    f1rows.forEach(function(r,i){
      var obs  = sv(r,'ผู้สังเกต'); var ts = sv(r,'timestamp','Timestamp');
      var date2= sv(r,'วันที่สังเกต'); var grade=sv(r,'ระดับชั้น'); var subj=sv(r,'ชื่อรายวิชา/ตอน','รายวิชา');
      html += entryBanner(i, obs, ts, f1rows.length);
      html += rowMeta([date2?'📅 '+date2:'', grade?'ชั้น '+grade:'', subj]);
      var v1 = sv(r,'14.1_นักเรียนเข้าใจดีในประเด็นใด') || svMatch(r,'14.1','เข้าใจดี');
      var v2 = sv(r,'14.2_นักเรียนยังไม่เข้าใจประเด็นใด') || svMatch(r,'14.2','ยังไม่เข้าใจ');
      var v3 = sv(r,'14.3_สาเหตุสำคัญ') || svMatch(r,'14.3','สาเหตุ');
      var v4 = sv(r,'14.4_เทปควรปรับช่วงใด') || svMatch(r,'14.4','เทปควรปรับ');
      var v5a= sv(r,'14.5_วิธีอธิบายควรปรับอย่างไร') || svMatch(r,'14.5_วิธีอธิบาย');
      var v5b= sv(r,'14.5_สื่อใบงานควรปรับอย่างไร')   || svMatch(r,'14.5_สื่อ');
      var v6 = sv(r,'14.6_คำแนะนำสำหรับครูปลายทาง')  || svMatch(r,'14.6','คำแนะนำ');
      var note=sv(r,'14_ความเห็นเพิ่มเติม','ความเห็นเพิ่มเติม');
      var any = v1||v2||v3||v4||v5a||v5b||v6||note;
      if (any) {
        html += '<div style="border:1.5px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:14px;">'
               +'<table style="width:100%;border-collapse:collapse;font-size:13px;">'
               +trow('14.1 นักเรียนเข้าใจดีในประเด็นใด', v1,'#f0fdf4','#15803d')
               +trow('14.2 นักเรียนยังไม่เข้าใจ / เข้าใจคลาดเคลื่อน', v2,'#fffbeb','#d97706')
               +trow('14.3 สาเหตุที่ทำให้เข้าใจหรือไม่เข้าใจ', v3,'#f8fafc')
               +trow('14.4 เทปการสอนควรปรับช่วงใด', v4,'#eff6ff','#1d4ed8')
               +trow('14.5 วิธีอธิบาย / คำถามควรปรับอย่างไร', v5a,'#f8fafc')
               +trow('14.5 สื่อ / ใบงาน / กิจกรรม ควรปรับอย่างไร', v5b,'#f8fafc')
               +trow('14.6 คำแนะนำสำหรับครูปลายทาง', v6,'#f8fafc')
               +trow('ความเห็นเพิ่มเติมของผู้สังเกต', note,'#fdf4ff','#7c3aed')
               +'</table></div>';
      } else { html += fallbackTable(r); }
    });
  }

  /* ════════════════════════════════════════════
     F3 · กำกับห้องเรียนครูปลายทาง  (db2MultiFormData['f2'])
     key จริง: 15.1_แนวทางกำกับห้องเรียนที่ได้ผล / 15.2_วิธีที่ช่วยนักเรียนเข้าใจมากขึ้น / 15.3_อุปสรรคสำคัญ / 15.5_เทป/สื่อควรปรับอะไร / ความเห็นเพิ่มเติม
     ════════════════════════════════════════════ */
  var f2rows = db2GetFormRows(schoolName,'f2');
  html += secHead('🏫','F3 · กำกับห้องเรียนครูปลายทาง', f2rows.length, f2rows.length>0);
  if (f2rows.length) {
    f2rows.forEach(function(r,i){
      var obs  = sv(r,'ผู้สังเกต'); var ts=sv(r,'timestamp','Timestamp');
      var date2= sv(r,'วันที่สังเกต'); var grade=sv(r,'ระดับชั้น');
      var tDst = sv(r,'ชื่อครูปลายทางผู้กำกับห้องเรียน');
      var tSrc = sv(r,'ชื่อครูต้นทางเจ้าของเทป');
      html += entryBanner(i, obs, ts, f2rows.length);
      html += rowMeta([date2?'📅 '+date2:'', grade?'ชั้น '+grade:'', tSrc?'ต้นทาง: '+tSrc:'', tDst?'ปลายทาง: '+tDst:'']);
      var v1 = sv(r,'15.1_แนวทางกำกับห้องเรียนที่ได้ผล')        || svMatch(r,'15.1','กำกับ');
      var v2 = sv(r,'15.2_วิธีที่ช่วยนักเรียนเข้าใจมากขึ้น')    || svMatch(r,'15.2','ช่วยนักเรียน');
      var v3 = sv(r,'15.3_อุปสรรคสำคัญ')                        || svMatch(r,'15.3','อุปสรรค');
      var v5 = sv(r,'15.5_เทป/สื่อควรปรับอะไร')                  || svMatch(r,'15.5','เทป','สื่อควรปรับ');
      var note=sv(r,'ความเห็นเพิ่มเติม');
      var any = v1||v2||v3||v5||note;
      if (any) {
        html += '<div style="border:1.5px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:14px;">'
               +'<table style="width:100%;border-collapse:collapse;font-size:13px;">'
               +trow('15.1 แนวทางกำกับห้องเรียนที่ได้ผล', v1,'#f0fdf4','#15803d')
               +trow('15.2 วิธีที่ช่วยให้นักเรียนเข้าใจมากขึ้น', v2,'#f8fafc')
               +trow('15.3 อุปสรรคสำคัญของการกำกับห้องเรียน', v3,'#fffbeb','#d97706')
               +trow('15.5 เทป / สื่อควรปรับอะไรเพื่อช่วยครูปลายทาง', v5,'#eff6ff','#1d4ed8')
               +trow('ความเห็นเพิ่มเติม', note,'#fdf4ff','#7c3aed')
               +'</table></div>';
      } else { html += fallbackTable(r); }
    });
  }

  /* ════════════════════════════════════════════
     F4 · สังเกตการสอนจริงครูต้นทาง  (db2MultiFormData['f3'])
     key จริง: 15.1_นักเรียนเข้าใจ/ไม่เข้าใจประเด็นใด / 15.2_อุปสรรคสำคัญ / 15.3_สิ่งที่แตกต่างจากการสอนออกอากาศ / 15.4_ครูต้นทางปรับเฉพาะหน้าอย่างไร / 13.3_วิธีที่ได้ผลดีและควรใช้ในการออกแบบ
     ════════════════════════════════════════════ */
  var f3rows = db2GetFormRows(schoolName,'f3');
  html += secHead('👨‍🏫','F4 · สังเกตการสอนจริงครูต้นทาง', f3rows.length, f3rows.length>0);
  if (f3rows.length) {
    f3rows.forEach(function(r,i){
      var obs  = sv(r,'ผู้สังเกต'); var ts=sv(r,'timestamp','Timestamp');
      var date2= sv(r,'วันที่สังเกต'); var tSrc=sv(r,'ชื่อครูต้นทาง'); var ttype=sv(r,'ลักษณะการสอน');
      html += entryBanner(i, obs, ts, f3rows.length);
      html += rowMeta([date2?'📅 '+date2:'', tSrc?'ต้นทาง: '+tSrc:'', ttype]);
      var v1 = sv(r,'15.1_นักเรียนเข้าใจ/ไม่เข้าใจประเด็นใด') || svMatch(r,'15.1','นักเรียนเข้าใจ');
      var v2 = sv(r,'15.2_อุปสรรคสำคัญ')                      || svMatch(r,'15.2','อุปสรรค');
      var v3 = sv(r,'15.3_สิ่งที่แตกต่างจากการสอนออกอากาศ')  || svMatch(r,'13.3_วิธีที่ได้ผลดีและควรใช้ในการออกแบบ','15.3','แตกต่าง','ออกแบบ');
      var v4 = sv(r,'15.4_ครูต้นทางปรับเฉพาะหน้าอย่างไร')    || svMatch(r,'15.4','ปรับเฉพาะหน้า');
      var note=sv(r,'ความเห็นเพิ่มเติม');
      var any = v1||v2||v3||v4||note;
      if (any) {
        html += '<div style="border:1.5px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:14px;">'
               +'<table style="width:100%;border-collapse:collapse;font-size:13px;">'
               +trow('15.1 นักเรียนเข้าใจ / ไม่เข้าใจประเด็นใด', v1,'#f8fafc')
               +trow('15.2 อุปสรรคสำคัญ', v2,'#fffbeb','#d97706')
               +trow('15.3 สิ่งที่แตกต่างจากการสอนออกอากาศ / วิธีที่ได้ผลดี', v3,'#f8fafc')
               +trow('15.4 ครูต้นทางปรับเฉพาะหน้าอย่างไร', v4,'#f0fdf4','#15803d')
               +trow('ความเห็นเพิ่มเติม', note,'#fdf4ff','#7c3aed')
               +'</table></div>';
      } else { html += fallbackTable(r); }
    });
  }

  /* ════════════════════════════════════════════
     F5 · เสียงสะท้อนนักเรียน  (db2MultiFormData['f4'])
     key จริง: 6.1_เข้าใจเรื่องใดมากที่สุด / 6.2_ / 6.3_ / 6.4_ / 6.5_ / 7_ข้อค้นพบจากเสียงสะท้อน
     ════════════════════════════════════════════ */
  var f4rows = db2GetFormRows(schoolName,'f4');
  html += secHead('💬','F5 · เสียงสะท้อนนักเรียน', f4rows.length, f4rows.length>0);
  if (f4rows.length) {
    f4rows.forEach(function(r,i){
      var obs  = sv(r,'ผู้สังเกต','ผู้ให้ข้อมูล'); var ts=sv(r,'timestamp','Timestamp');
      var date2= sv(r,'วันที่','วันที่บันทึก'); var grade=sv(r,'ระดับชั้น'); var room=sv(r,'ห้อง');
      var subj = sv(r,'รายวิชา','วิชา'); var topic=sv(r,'เรื่องที่เรียน','หัวข้อ');
      html += entryBanner(i, obs, ts, f4rows.length);
      html += rowMeta([date2?'📅 '+date2:'', grade?'ชั้น '+grade+(room?' ห้อง'+room:''):'', subj, topic]);
      var q1 = sv(r,'6.1_เข้าใจเรื่องใดมากที่สุด')        || svMatch(r,'6.1','เข้าใจมากที่สุด');
      var q2 = sv(r,'6.2_ยังไม่เข้าใจเรื่องใด')           || svMatch(r,'6.2','ยังไม่เข้าใจ');
      var q3 = sv(r,'6.3_สิ่งที่ช่วยให้เรียนได้ดีในวันนี้') || svMatch(r,'6.3','ช่วยให้เรียน');
      var q4 = sv(r,'6.4_สิ่งที่อยากให้ครูช่วยเพิ่มเติม') || svMatch(r,'6.4','อยากให้ครู');
      var q5 = sv(r,'6.5_คะแนนความเข้าใจตนเอง')           || svMatch(r,'6.5','คะแนน');
      var f7 = sv(r,'7_ข้อค้นพบจากเสียงสะท้อน')           || svMatch(r,'7.ข้อค้นพบ','ข้อค้นพบ');
      var any= q1||q2||q3||q4||q5||f7;
      if (any) {
        html += '<div style="border:1.5px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:14px;">'
               +'<table style="width:100%;border-collapse:collapse;font-size:13px;">'
               +trow('6.1 เข้าใจเรื่องใดมากที่สุด', q1,'#f0fdf4','#15803d')
               +trow('6.2 ยังไม่เข้าใจเรื่องใด', q2,'#fffbeb','#d97706')
               +trow('6.3 สิ่งที่ช่วยให้เรียนได้ดีในวันนี้', q3,'#f8fafc')
               +trow('6.4 สิ่งที่อยากให้ครูช่วยเพิ่มเติม', q4,'#f8fafc')
               +trow('6.5 คะแนนความเข้าใจตนเอง (ของนักเรียน)', q5,'#eff6ff','#1d4ed8')
               +trow('7. ข้อค้นพบสำคัญจากเสียงสะท้อน', f7,'#fdf4ff','#7c3aed')
               +'</table></div>';
      } else { html += fallbackTable(r); }
    });
  }

  /* ════════════════════════════════════════════
     F6 · สะท้อนผลรวม PLC  (db2MultiFormData['f5'])
     key จริง: 5.1_บริบทสำคัญที่ส่งผลต่อการใช้ DLTV / 12.1_ / 12.2_ / 12.3_
     ════════════════════════════════════════════ */
  var f5rows = db2GetFormRows(schoolName,'f5');
  html += secHead('📊','F6 · สะท้อนผลรวม PLC', f5rows.length, f5rows.length>0);
  if (f5rows.length) {
    f5rows.forEach(function(r,i){
      var rec  = sv(r,'ผู้บันทึกผลการสะท้อน','ลงนาม_ผู้บันทึก'); var ts=sv(r,'timestamp','Timestamp');
      var vdate= sv(r,'วันที่ลงพื้นที่','วันที่'); var pdate=sv(r,'วันที่ประชุม PLC','วันประชุม PLC','วันประชุม');
      html += entryBanner(i, rec, ts, f5rows.length);
      html += rowMeta([vdate?'📅 ลงพื้นที่: '+vdate:'', pdate?'PLC: '+pdate:'']);
      var ctx5= sv(r,'5.1_บริบทสำคัญที่ส่งผลต่อการใช้ DLTV') || svMatch(r,'5.1','บริบทสำคัญ');
      var s1  = sv(r,'12.1_ข้อค้นพบสำคัญที่สุด')               || svMatch(r,'12.1','ข้อค้นพบ');
      var s2  = sv(r,'12.2_บทเรียนสำคัญสำหรับการพัฒนา DLTV')  || svMatch(r,'12.2','บทเรียนสำคัญ');
      var s3  = sv(r,'12.3_ข้อเสนอหลักที่ควรดำเนินการต่อ')    || svMatch(r,'12.3','ข้อเสนอ');
      var any = ctx5||s1||s2||s3;
      if (any) {
        if (ctx5) html += card('📍','บริบทสำคัญที่ส่งผลต่อการใช้ DLTV (5.1)', ctx5,'#f8fafc','#e2e8f0','#475569');
        html += '<div style="border:1.5px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:14px;">'
               +'<table style="width:100%;border-collapse:collapse;font-size:13px;">'
               +trow('12.1 ข้อค้นพบสำคัญที่สุด', s1,'#fdf4ff','#7c3aed')
               +trow('12.2 บทเรียนสำคัญสำหรับการพัฒนา DLTV', s2,'#eff6ff','#1d4ed8')
               +trow('12.3 ข้อเสนอหลักที่ควรดำเนินการต่อ', s3,'#f0fdf4','#15803d')
               +'</table></div>';
      } else { html += fallbackTable(r); }
    });
  }

  return html || '<p style="color:#94a3b8;text-align:center;padding:24px;">ยังไม่มีข้อมูลแบบฟอร์มใดสำหรับโรงเรียนนี้</p>';
}

// ── end school summary ──────────────────────────────

// ════════════════════════════════════════════════════════════════
//  รายงานเต็ม "ตรงตามแบบฟอร์ม" — ใช้ engine เดียวกับ PDF รายฟอร์ม
//  (buildPDFFromLiveForm + buildFormSchema) เพื่อให้พรีวิว/PDF สรุป
//  แสดงครบทุกข้อ เรียงตามลำดับในแบบฟอร์มจริง
// ════════════════════════════════════════════════════════════════

/** เติมข้อมูล 1 แถวเข้า panel แล้วอ่านออกมาเป็น HTML (ตรงตามแบบฟอร์ม) จากนั้นคืนสภาพเดิม */
function renderFormFaithfulHTML(formId, schoolName, row) {
  if (!row) return '';
  // F1 (บริบทโรงเรียน): render จากคอลัมน์โดยตรง — ครบทุกหมวด มีค่าเสมอ และไม่แตะฟอร์มที่กำลังแก้
  if (formId === 'f0') {
    try { return buildF0FaithfulHTML(row, schoolName); }
    catch (e) { console.warn('buildF0FaithfulHTML fail', e); return ''; }
  }
  const panel = document.getElementById('form-' + formId);
  if (!panel) return '';
  let backup = null;
  try { backup = serializeFormPanel(formId); } catch (e) {}
  let html = '';
  try {
    let filled = false;
    if (row['__snapshot__']) {
      try {
        const snap = (typeof row['__snapshot__'] === 'string') ? JSON.parse(row['__snapshot__']) : row['__snapshot__'];
        const isReal = snap && typeof snap === 'object' &&
          Object.keys(snap).some(k => k.startsWith('__i_') || k.startsWith('__ri_') || k.startsWith('__c_'));
        if (isReal) { restoreFormPanel(formId, snap); filled = true; }
      } catch (e) {}
    }
    if (!filled && Object.keys(row).some(k => k.startsWith('__i_'))) { restoreFormPanel(formId, row); filled = true; }
    if (!filled) { restoreFromSchema(formId, row); filled = true; }
    html = buildPDFFromLiveForm(formId, schoolName);
  } catch (e) {
    console.warn('renderFormFaithfulHTML fail', formId, e);
    html = '';
  } finally {
    if (backup) { try { restoreFormPanel(formId, backup); } catch (e) {} }
  }
  return html;
}

/** แถบหัวข้อฟอร์มสำหรับรายงานรวม */
function _reportFormDivider(fd, count) {
  const badge = count > 0
    ? '<span style="background:rgba(255,255,255,0.22);border-radius:20px;padding:3px 13px;font-size:13px;font-weight:700;">✓ ' + count + ' รายการ</span>'
    : '<span style="background:rgba(255,255,255,0.18);border-radius:20px;padding:3px 13px;font-size:13px;font-weight:700;opacity:.85;">— ยังไม่มีข้อมูล</span>';
  return '<div class="report-form-divider" style="display:flex;align-items:center;justify-content:space-between;gap:10px;'
    + 'background:linear-gradient(135deg,#1e3a8a,#2563eb);color:#fff;border-radius:10px;padding:12px 18px;margin:26px 0 14px;">'
    + '<span style="font-weight:800;font-size:16px;">' + (fd.emoji || '') + ' ' + fd.label + ' · ' + fd.name + '</span>'
    + badge + '</div>';
}

/** แบนเนอร์ระบุรายการ (กรณีหลายคนกรอกฟอร์มเดียวกัน) */
function _reportEntryBanner(idx, total, row) {
  if (total <= 1) return '';
  const obs = _sv(row, 'ผู้สังเกต', 'ผู้ให้ข้อมูล', 'ผู้บันทึกผลการสะท้อน', 'ผู้รวบรวมข้อมูล') || '(ไม่ระบุผู้บันทึก)';
  let ts = _sv(row, 'timestamp', 'Timestamp');
  if (ts) { try { const d = new Date(ts); if (!isNaN(d.getTime())) ts = d.toLocaleDateString('th-TH', {year:'numeric',month:'short',day:'numeric'}); } catch(e){} }
  return '<div style="background:#f0f4ff;border-left:4px solid #3b82f6;border-radius:6px;padding:8px 14px;margin:14px 0 8px;font-size:13px;font-weight:700;color:#1e3a8a;">'
    + 'รายการที่ ' + (idx + 1) + ' / ' + total + ' : ' + _esc2(obs)
    + (ts ? ' &nbsp;·&nbsp; <span style="font-weight:400;color:#64748b;">' + _esc2(ts) + '</span>' : '')
    + '</div>';
}

/**
 * render ฟอร์ม F1 (บริบทโรงเรียน, id=f0) จากคอลัมน์โดยตรง — ครบทุกหมวด มีค่าเสมอ
 * (อิง mapping เดียวกับ downloadSinglePDF ซึ่งทดสอบแล้วว่าครบและถูกต้อง)
 */
function buildF0FaithfulHTML(row, school) {
  const gv = (a, b) => {
    let v = (row[a] !== undefined && row[a] !== null && String(row[a]).trim() !== '') ? row[a]
          : (b !== undefined ? row[b] : '');
    return (v == null ? '' : String(v)).trim();
  };
  const cell = (s) => (s && String(s).trim() !== '') ? _pdfEsc(s) : _pdfMissing();
  const twoCol = (rows) => '<table class="p-row2col">' + rows.map(r =>
      '<tr>' + r.map(c => '<td' + (r.length === 1 ? ' colspan="2"' : '') + '><span class="p-label">' + c[0] + ':</span> <strong>' + cell(c[1]) + '</strong></td>').join('') + '</tr>'
    ).join('') + '</table>';
  const block = (label, val) =>
    '<div class="p-block-wrap"><span class="p-block-label">' + label + '</span><span class="p-block-val">' + cell(val) + '</span></div>';
  const listBlock = (label, val) => {
    const items = (val || '').split(' | ').map(s => s.trim()).filter(Boolean);
    const inner = items.length
      ? items.map(t => '<div style="margin-bottom:2px;">• ' + _pdfEsc(t) + '</div>').join('')
      : '<span style="color:#94a3b8;">' + _pdfMissing() + '</span>';
    return '<div class="p-block-wrap"><span class="p-block-label">' + label + '</span><div style="padding:6px 12px;border:1px solid #e2e8f0;border-radius:6px;background:#f8fafc;">' + inner + '</div></div>';
  };

  let h = pHeader('F1', 'แบบบันทึกบริบทโรงเรียนปลายทางเพื่อการพัฒนา DLTV', school);

  // 1. ผู้ให้ข้อมูล
  h += '<div class="p-title">1. ข้อมูลผู้ให้ข้อมูล</div>';
  h += twoCol([
    [['ชื่อ-นามสกุล', gv('2_ชื่อ-นามสกุลผู้ให้ข้อมูล','ผู้ให้ข้อมูล_ชื่อ')], ['ตำแหน่ง', gv('2_ตำแหน่ง','ผู้ให้ข้อมูล_ตำแหน่ง')]],
    [['บทบาท/สถานะ', gv('2_บทบาทผู้ให้ข้อมูล','ผู้ให้ข้อมูล_สถานะ')], ['โทรศัพท์', gv('2_โทรศัพท์ผู้ให้ข้อมูล','ผู้ให้ข้อมูล_เบอร์โทร')]],
    [['อีเมล', gv('2_อีเมล','ผู้ให้ข้อมูล_อีเมล')], ['วันที่ให้ข้อมูล', gv('2_วันที่ให้ข้อมูล','ผู้ให้ข้อมูล_วันที่บันทึก')]],
  ]);

  // 2. ข้อมูลพื้นฐานของโรงเรียน (3.1, 3.2)
  h += '<div class="p-title">2. ข้อมูลพื้นฐานของโรงเรียน</div>';
  h += twoCol([
    [['ชื่อโรงเรียน', gv('3.1_ชื่อโรงเรียน','ชื่อโรงเรียน')], ['รหัส 10 หลัก', gv('3.1_รหัสโรงเรียน10หลัก','รหัสโรงเรียน')]],
    [['สังกัด สพท.', gv('3.1_สำนักงานเขตพื้นที่การศึกษา','สำนักงานเขตพื้นที่')]],
    [['ที่ตั้ง', 'ต.' + gv('3.1_ตำบล','ตำบล') + ' อ.' + gv('3.1_อำเภอ','อำเภอ') + ' จ.' + gv('3.1_จังหวัด','จังหวัด') + ' ' + gv('3.1_รหัสไปรษณีย์','รหัสไปรษณีย์')]],
  ]);
  h += block('ประเภทโรงเรียน:', gv('3.1_ประเภทโรงเรียน','ประเภทโรงเรียน_รวม'));
  h += block('ลักษณะการจัดชั้นเรียน (3.2):', gv('3.2_ลักษณะการจัดชั้นเรียน','ลักษณะชั้นเรียน_รวม'));
  h += block('รายละเอียดข้อจำกัดห้องเรียน:', gv('3.2_รายละเอียดข้อจำกัดห้องเรียน','ลักษณะชั้นเรียน_รายละเอียดข้อจำกัด'));

  // 3. บุคลากร (3.3)
  h += '<div class="p-title">3. ข้อมูลบุคลากรโดยรวม (3.3)</div>';
  h += twoCol([
    [['ผู้อำนวยการ/ครูใหญ่', gv('3.3_ผู้อำนวยการ/ครูใหญ่','ผอ_ครูใหญ่')], ['รอง ผอ. (คน)', gv('3.3_จำนวนรองผอ(คน)','จำนวนรองผอ')]],
    [['ครูทั้งหมด (คน)', gv('3.3_จำนวนครูทั้งหมด(คน)','จำนวนครูทั้งหมด')], ['ครูอัตราจ้าง (คน)', gv('3.3_จำนวนครูอัตราจ้าง(คน)','จำนวนครูอัตราจ้าง')]],
    [['เจ้าหน้าที่ธุรการ (คน)', gv('3.3_จำนวนเจ้าหน้าที่ธุรการ(คน)','จำนวนธุรการ')]],
  ]);
  h += listBlock('จำนวนครูที่สอนตรงวิชาเอกโดยประมาณ:', gv('3.3_ครูตรงเอก_หมายเหตุ','ตารางครูตรงวิชาเอก_รวม'));

  // 4. การใช้ DLTV และวิชาการ (4.x)
  h += '<div class="p-title">4. การใช้ DLTV และข้อมูลวิชาการ</div>';
  h += block('4.1 ภาพรวมการใช้งาน DLTV:', gv('4.1_ลักษณะการใช้DLTV','ภาพรวมการใช้_รวม'));
  h += listBlock('4.2 ระดับชั้น/รายวิชาที่ใช้ DLTV เป็นประจำ:', gv('4.2_ระดับชั้นและรายวิชาที่ใช้DLTV(JSON)','ตารางวิชาการแยกชั้นปี_รวม'));
  h += block('4.3 บทบาทของครูปลายทาง:', gv('4.3_บทบาทครูปลายทาง','บทบาทครูปลายทาง_รวม'));
  h += block('4.4 การเตรียมการก่อนใช้ DLTV:', gv('4.4_การเตรียมการก่อนใช้DLTV','การเตรียมการก่อนใช้_รวม'));
  h += block('4.5 การติดตามผลการเรียนรู้หลังใช้ DLTV:', gv('4.5_การติดตามผลการเรียนรู้','การติดตามผลหลังเรียน_รวม'));

  // 5. เทคนิคและอุปกรณ์ (5.x)
  h += '<div class="p-title">5. โครงสร้างพื้นฐานและอุปกรณ์ (5.x)</div>';
  h += block('5.1 ช่องทางการรับชม DLTV:', gv('5.1_ช่องทางรับชมDLTV','ช่องทางรับชม_รวม'));
  h += listBlock('5.2–5.3 สถานะอุปกรณ์รับชมรายชั้นเรียน:', gv('5.2-5.3_สถานะอุปกรณ์รายชั้น(JSON)','ตารางอุปกรณ์ทีวีและกล่อง_รวม'));
  h += listBlock('5.4 คุณภาพโครงสร้างพื้นฐานที่เกี่ยวข้อง:', gv('5.4_โครงสร้างพื้นฐาน(JSON)','ตารางโครงสร้างพื้นฐาน_รวม'));
  h += block('5.5 แนวทางการดูแล/ซ่อมบำรุงหลังหมดประกัน:', gv('5.5_แนวทางการดูแลและซ่อมบำรุง','แนวทางซ่อมบำรุงหลังประกัน'));

  // 6. บริบทผู้เรียน + จุดแข็ง/ปัญหา (6,7)
  h += '<div class="p-title">6. บริบทผู้เรียน จุดแข็ง และปัญหาอุปสรรค</div>';
  h += block('6. ลักษณะผู้เรียนและปัจจัยข้อจำกัด:', (gv('6_ลักษณะผู้เรียนและข้อจำกัด','ลักษณะผู้เรียน_รวม') + ' ' + gv('6_ลักษณะผู้เรียนและข้อจำกัด2','ข้อจำกัดสำคัญ_รวม')).trim());
  h += block('6. สิ่งที่ครูต้นทางควรรู้เกี่ยวกับผู้เรียน:', gv('6_สิ่งที่ครูต้นทางควรรู้เกี่ยวกับผู้เรียน','ครูต้นทางควรรับรู้'));
  h += block('7. จุดแข็งของโรงเรียนในการใช้ DLTV:', gv('7_จุดแข็งในการใช้DLTV','จุดแข็งโรงเรียน'));
  h += block('7. ปัญหาอุปสรรคและความต้องการสนับสนุน:', gv('7_ปัญหาอุปสรรคและความต้องการสนับสนุน','ปัญหาอุปสรรค'));

  // 7. สรุปบริบทสำคัญ (8.x)
  h += '<div class="p-title">7. สรุปบริบทสำคัญ (ข้อ 8)</div>';
  h += '<table class="pdf-table"><tbody>'
    + '<tr><td style="width:32%;font-weight:bold;background:#f8fafc;color:#1e3a8a;">8.1 บริบทสำคัญของโรงเรียน</td><td style="white-space:pre-wrap;">' + cell(gv('8.1_บริบทสำคัญของโรงเรียน','S8_บริบทสำคัญ')) + '</td></tr>'
    + '<tr><td style="font-weight:bold;background:#f8fafc;color:#1e3a8a;">8.2 ข้อจำกัดสำคัญในการเรียนรู้</td><td style="white-space:pre-wrap;">' + cell(gv('8.2_ข้อจำกัดสำคัญในการเรียนรู้','S8_ข้อจำกัดการเรียน')) + '</td></tr>'
    + '<tr><td style="font-weight:bold;background:#f8fafc;color:#1e3a8a;">8.3 สิ่งที่ครูต้นทางควรคำนึงถึง</td><td style="white-space:pre-wrap;">' + cell(gv('8.3_สิ่งที่ครูต้นทางควรคำนึงถึง','S8_ข้อควรคำนึงถึง')) + '</td></tr>'
    + '<tr><td style="font-weight:bold;background:#f8fafc;color:#1e3a8a;">8.4 ข้อเสนอเบื้องต้นเพื่อสนับสนุน</td><td style="white-space:pre-wrap;">' + cell(gv('8.4_ข้อเสนอเบื้องต้นเพื่อสนับสนุน','S8_ข้อเสนอแนะเบื้องต้น')) + '</td></tr>'
    + '</tbody></table>';

  // ลงนาม
  h += pSigTable(
    gv('ลงนาม_ผู้ให้ข้อมูล'), gv('ลงนาม_ตำแหน่ง','ลงนาม_ตำแหน่งผู้ให้'), gv('ลงนาม_วันที่','ลงนาม_วันที่ผู้ให้'),
    gv('ลงนาม_ผู้บริหารรับรอง','ลงนาม_ผู้รับข้อมูล'), gv('ลงนาม_ตำแหน่งผู้บริหาร','ลงนาม_ตำแหน่งผู้รับ'), gv('ลงนาม_วันที่ผู้บริหาร','ลงนาม_วันที่ผู้รับ')
  );
  return h;
}

/**
 * รายงานเต็มของโรงเรียน: วนทุกฟอร์ม (F1–F6) แล้ว render แบบตรงตามแบบฟอร์ม
 * opts.pageBreak = true -> ใส่ตัวแบ่งหน้าก่อนแต่ละฟอร์ม (สำหรับ PDF)
 */
function buildFaithfulSchoolReport(schoolName, opts) {
  opts = opts || {};
  let html = '';
  let any = false;
  DB2_FORMS.forEach(function (fd, fi) {
    const rows = db2GetFormRows(schoolName, fd.id) || [];
    const wrapOpen = (fi > 0 && opts.pageBreak)
      ? '<div class="report-form-block" style="page-break-before:always;">'
      : '<div class="report-form-block">';
    html += wrapOpen;
    html += _reportFormDivider(fd, rows.length);
    if (!rows.length) {
      html += '<div style="padding:14px 16px;color:#94a3b8;font-size:14px;border:1px dashed #cbd5e1;border-radius:10px;background:#f8fafc;">— ยังไม่มีการบันทึกข้อมูลในแบบฟอร์มนี้สำหรับโรงเรียนนี้ —</div>';
    } else {
      any = true;
      rows.forEach(function (row, i) {
        html += _reportEntryBanner(i, rows.length, row);
        const body = renderFormFaithfulHTML(fd.id, schoolName, row);
        html += body
          ? '<div class="report-form-body">' + body + '</div>'
          : '<div style="padding:12px 16px;color:#d97706;font-size:13px;">⚠️ ไม่สามารถแสดงรายละเอียดของรายการนี้ได้</div>';
        if (i < rows.length - 1) html += '<hr style="border:none;border-top:1px dashed #cbd5e1;margin:20px 0;">';
      });
    }
    html += '</div>';
  });
  if (!any) {
    // ยังไม่มีข้อมูลเลย — แต่ยังแสดงโครงรายงานว่างไว้ให้เห็นว่าครบทุกฟอร์ม
  }
  return html;
}

function openPreviewModal(index) {
  currentPreviewIndex = index;
  const item = allResponsesData[index];
  if (!item) return;
  const name = db2GetRowSchoolName(item) || item['ชื่อโรงเรียน'] || 'โรงเรียนปลายทาง';
  const st   = db2SchoolFormStatus(name);
  const cnt  = Object.values(st).filter(Boolean).length;

  // ── title ──
  document.getElementById('previewModalTitle').innerHTML =
    `<span style="font-size:16px;">📋 ${name}</span>
     <span style="margin-left:10px;background:#dcfce7;color:#15803d;border-radius:20px;padding:2px 10px;font-size:12px;font-weight:700;">${cnt}/6 ฟอร์ม</span>`;

  // ── body: ค่าเริ่มต้น = มุมมองเต็มตามแบบฟอร์ม ──
  renderPreviewBody(name, st, 'full');

  // ── footer ──
  const safe = name.replace(/'/g,"\\'");
  document.querySelector('.modal-footer').innerHTML = `
    <button class="btn-modal-pdf" onclick="exportSummaryPDF('${safe}')">
      <i class="ti ti-file-text"></i> ออก PDF เต็มตามแบบฟอร์ม
    </button>
    <button class="btn-modal-edit" onclick="closePreviewModal();openFormEdit(db2GetRowSchoolName(allResponsesData[currentPreviewIndex]),'f0')">
      <i class="ti ti-pencil"></i> แก้ไข F1
    </button>
  `;

  document.getElementById('previewModal').classList.add('show');
}

/** สลับมุมมองในพรีวิว: 'full' = เต็มตามแบบฟอร์ม, 'summary' = สรุปย่อ */
function renderPreviewBody(name, st, view) {
  const body = document.getElementById('previewModalBody');
  if (!body) return;
  const safe = name.replace(/'/g, "\\'");
  const tabBtn = (v, label) =>
    `<button onclick="renderPreviewBody('${safe}', db2SchoolFormStatus('${safe}'), '${v}')" style="`
    + `padding:7px 16px;border-radius:30px;font-size:13px;font-weight:700;cursor:pointer;border:1px solid `
    + (view === v ? '#1e3a8a;background:#1e3a8a;color:#fff;' : '#cbd5e1;background:#fff;color:#475569;')
    + `">${label}</button>`;
  const toggle =
    '<div style="display:flex;gap:8px;justify-content:center;margin:2px 0 16px;position:sticky;top:0;background:#fff;padding:6px 0 10px;z-index:2;border-bottom:1px solid #f1f5f9;">'
    + tabBtn('full', '📄 เต็มตามแบบฟอร์ม')
    + tabBtn('summary', '⚡ สรุปย่อ')
    + '</div>';
  const content = (view === 'summary')
    ? buildSchoolSummaryHTML(name, st)
    : buildFaithfulSchoolReport(name, { pageBreak: false });
  body.innerHTML = toggle + '<div class="preview-report-wrap" style="padding:2px 0;">' + content + '</div>';
}



function closePreviewModal() { document.getElementById('previewModal').classList.remove('show'); }

// ═══════════════════════════════════════════════════
// exportSummaryPDF — PDF เต็มรายโรงเรียน F1-F6
//   ใช้ engine เดียวกับ PDF รายฟอร์ม (ตรงตามแบบฟอร์มทุกข้อ)
// ═══════════════════════════════════════════════════
function exportSummaryPDF(schoolName) {
  const st  = db2SchoolFormStatus(schoolName);
  const cnt = Object.values(st).filter(Boolean).length;
  const now = new Date().toLocaleDateString('th-TH',{year:'numeric',month:'long',day:'numeric'});

  // เนื้อหาเต็ม "ตรงตามแบบฟอร์ม" + แบ่งหน้าก่อนแต่ละฟอร์ม
  const reportBody = buildFaithfulSchoolReport(schoolName, { pageBreak: true });

  // CSS: ใช้คลาสเดียวกับ PDF รายฟอร์ม (.p-title/.pdf-table/.p-row2col/.p-block-*) + cover/footer
  const css = `
    @page { size: A4; margin: 16mm 16mm 18mm 16mm; }
    * { box-sizing: border-box; font-family: 'Sarabun', 'TH Sarabun New', sans-serif; }
    body { margin: 0; padding: 0; color: #1e293b; font-size: 12pt; line-height: 1.6; }

    /* ── Cover header ── */
    .pdf-cover { background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); color: #fff; border-radius: 12px; padding: 22px 26px 18px; margin-bottom: 8px; page-break-inside: avoid; }
    .pdf-cover .proj { font-size: 11pt; opacity: 0.85; margin-bottom: 4px; }
    .pdf-cover .title { font-size: 20pt; font-weight: 800; margin: 0 0 6px; }
    .pdf-cover .meta { font-size: 11pt; opacity: 0.9; display: flex; gap: 20px; flex-wrap: wrap; margin-top: 10px; }
    .pdf-cover .badge { background: rgba(255,255,255,0.2); border-radius: 20px; padding: 2px 12px; font-size: 11pt; font-weight: 700; }

    /* ── โครงรายงานต่อฟอร์ม ── */
    .report-form-block { page-break-inside: auto; }
    .report-form-divider { page-break-after: avoid; page-break-inside: avoid; }
    .report-form-body { page-break-inside: auto; }

    /* ── หัวฟอร์ม (pHeader) ── */
    .report-form-body > div:first-child { page-break-inside: avoid; page-break-after: avoid; }

    /* ── หัวข้อย่อย / ตาราง (จาก buildPDFFromLiveForm) ── */
    .p-title { font-weight: bold; font-size: 13pt; background: #f1f5f9; padding: 6px 12px; margin: 14px 0 8px; border-left: 5px solid #1e3a8a; color: #1e3a8a; page-break-after: avoid; }
    .p-label { font-weight: normal; color: #475569; }
    .p-row2col { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
    .p-row2col td { font-size: 11.5pt; padding: 4px 10px 4px 0; vertical-align: top; border: none; }
    .pdf-table { width: 100%; border-collapse: collapse; margin: 6px 0 12px; font-size: 11pt; }
    .pdf-table th, .pdf-table td { border: 1px solid #cbd5e1; padding: 7px 9px; text-align: left; vertical-align: top; word-break: break-word; line-height: 1.5; }
    .pdf-table th { background: #f8fafc; text-align: center; font-weight: bold; color: #1e3a8a; }
    .pdf-table tr { page-break-inside: avoid; }
    .p-block-wrap { margin-bottom: 8px; font-size: 11.5pt; page-break-inside: avoid; }
    .p-block-label { font-weight: bold; display: block; margin-bottom: 3px; color: #1e3a8a; }
    .p-block-val { display: block; border: 1px solid #e2e8f0; padding: 9px 13px; min-height: 30px; white-space: pre-wrap; word-break: break-word; background: #f8fafc; border-radius: 6px; font-size: 11pt; color: #1e293b; line-height: 1.6; }

    /* ── Page footer ── */
    .pdf-footer { position: fixed; bottom: 9mm; left: 16mm; right: 16mm; border-top: 1px solid #cbd5e1; padding-top: 5px; font-size: 9.5pt; color: #94a3b8; display: flex; justify-content: space-between; }
    @media screen { .pdf-footer { display: none; } }
  `;

  const html = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <title>รายงานเต็มรายโรงเรียน — ${schoolName}</title>
  <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>${css}</style>
</head>
<body>
  <div class="pdf-cover">
    <div class="proj">📡 โครงการ DLTV — รายงานเต็มผลการลงพื้นที่ (ตรงตามแบบฟอร์ม)</div>
    <div class="title">📋 ${schoolName}</div>
    <div class="meta">
      <span class="badge">✓ ${cnt}/6 ฟอร์มที่มีข้อมูล</span>
      <span>พิมพ์เมื่อ: ${now}</span>
    </div>
  </div>
  <div class="pdf-footer">
    <span>โครงการ DLTV · รายงานเต็มรายโรงเรียน</span>
    <span>${schoolName}</span>
  </div>
  ${reportBody}
</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) { alert('กรุณาอนุญาต Popup สำหรับหน้านี้แล้วลองใหม่'); return; }
  win.document.write(html);
  win.document.close();
  win.onload = function() {
    if (win.document.fonts && win.document.fonts.ready) {
      win.document.fonts.ready.then(function(){ setTimeout(function(){ win.focus(); win.print(); }, 350); });
    } else {
      setTimeout(function() { win.focus(); win.print(); }, 700);
    }
  };
}


// ============================================================
//  GENERIC FORM PREVIEW / PDF — ใช้ได้กับทุกฟอร์ม (F0–F5)
//  เพราะแต่ละฟอร์มมีโครงสร้าง field ไม่เหมือนกัน จึงแสดงผล
//  แบบ key: value อัตโนมัติ แทนการ hardcode ทีละฟิลด์แบบ F0
// ============================================================
function findFormRow(schoolName, formId, entryId) {
  // ถ้าระบุ entryId (รายการเฉพาะของครูคนนั้น) ให้จับคู่ด้วย id ก่อน
  if (entryId) {
    const byId = db2FindFormRowById(formId, entryId);
    if (byId) return byId;
  }
  if (formId === 'f0') {
    return allResponsesData.find(r => db2GetRowSchoolName(r).trim() === schoolName.trim() && !r._stub);
  }
  return (db2MultiFormData[formId]||[]).find(r =>
    db2GetRowSchoolName(r) === schoolName.trim()
  );
}

// ===== รองรับหลายรายการต่อ (โรงเรียน + ฟอร์ม) เช่น ครู 2 คนกรอกฟอร์มเดียวกัน =====
// คืนทุกรายการของโรงเรียน+ฟอร์มนั้น
function db2GetFormRows(schoolName, formId) {
  const nm = (schoolName||'').trim();
  if (formId === 'f0') {
    return allResponsesData.filter(r => db2GetRowSchoolName(r) === nm && !r._stub);
  }
  return (db2MultiFormData[formId]||[]).filter(r => db2GetRowSchoolName(r) === nm);
}
// id ของรายการ: ใช้ EntryID จริงถ้ามี ไม่งั้นใช้ตำแหน่งใน array เป็น id สำรอง (ข้อมูลเก่า)
function db2EntryId(row, formId) {
  const real = row['EntryID'] || row['entryId'];
  if (real) return String(real);
  const arr = (formId === 'f0') ? allResponsesData : (db2MultiFormData[formId]||[]);
  return '__gidx_' + arr.indexOf(row);
}
function db2FindFormRowById(formId, entryId) {
  const arr = (formId === 'f0') ? allResponsesData : (db2MultiFormData[formId]||[]);
  if (entryId && String(entryId).startsWith('__gidx_')) {
    const i = parseInt(String(entryId).slice(7), 10);
    return arr[i] || null;
  }
  return arr.find(r => String(r['EntryID']||r['entryId']||'') === String(entryId)) || null;
}
// ป้ายกำกับรายการ: ชื่อผู้สังเกต + เวลาบันทึก เพื่อให้แยกครูแต่ละคนได้
function db2FormEntryLabel(row, formId) {
  const teacher = row['ผู้สังเกต'] || row['ลงนาม_ผู้สังเกต'] || row['ผู้บันทึกผลการสะท้อน']
               || row['ลงนาม_ผู้บันทึก'] || row['ผู้ให้ข้อมูล'] || '';
  const ts = row['timestamp'] || row['Timestamp'] || row['2_วันที่ให้ข้อมูล'] || '';
  const t = teacher && String(teacher).trim() ? String(teacher).trim() : '(ไม่ระบุชื่อผู้สังเกต)';
  return ts ? (t + ' · ' + ts) : t;
}

function openFormPreview(schoolName, formId, entryId) {
  const fd  = DB2_FORMS.find(f => f.id === formId);
  const row = findFormRow(schoolName, formId, entryId);

  if (!row) {
    showToast('⚠️ ไม่พบข้อมูลของฟอร์มนี้สำหรับ ' + schoolName);
    return;
  }
  const eid = db2EntryId(row, formId);
  const teacherLabel = db2FormEntryLabel(row, formId);

  document.getElementById('previewModalTitle').textContent =
    `${fd ? fd.emoji : '📋'} ${fd ? fd.name : formId.toUpperCase()} — ${schoolName}`;

  const skipKeys = ['rowIndex', 'Timestamp', 'timestamp'];
  const body = document.getElementById('previewModalBody');
  const rows = Object.entries(row)
    .filter(([k, v]) => !skipKeys.includes(k) && !k.startsWith('__') && v !== undefined && v !== null && String(v).trim() !== '')
    .map(([k, v]) => `
      <div class="preview-item" style="width:100%;margin-bottom:10px;">
        <div class="label">${k}</div>
        <div class="value" style="font-weight:500;white-space:pre-wrap;">${String(v).replace(/</g,'&lt;')}</div>
      </div>`).join('');

  const teacherBar = `<div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:9px;padding:8px 12px;margin-bottom:12px;font-size:13px;color:#3730a3;">👤 ผู้สังเกต/ผู้บันทึก: <strong>${teacherLabel}</strong></div>`;
  body.innerHTML = `<div class="preview-section"><h4>${fd ? fd.emoji+' '+fd.name : formId.toUpperCase()}</h4>${teacherBar}${rows || '<p style="color:#94a3b8;">ไม่มีข้อมูล</p>'}</div>`;

  const safe = schoolName.replace(/'/g,"\\'");
  document.querySelector('.modal-footer').innerHTML = `
    <button class="btn-modal-pdf" onclick="downloadFormPDF('${safe}','${formId}','${eid}')"><i class="ti ti-file-text"></i> ออก PDF</button>
    <button class="btn-modal-edit" onclick="openFormEdit('${safe}','${formId}','${eid}')"><i class="ti ti-pencil"></i> แก้ไขข้อมูล</button>
  `;

  document.getElementById('previewModal').classList.add('show');
}

// เลือกรายการเมื่อมีหลายครูกรอกฟอร์มเดียวกันให้โรงเรียนเดียวกัน
function openFormEntryPicker(schoolName, formId) {
  const rows = db2GetFormRows(schoolName, formId);
  if (rows.length === 0) { showToast('⚠️ ไม่พบข้อมูลของฟอร์มนี้'); return; }
  if (rows.length === 1) { return openFormPreview(schoolName, formId, db2EntryId(rows[0], formId)); }

  const fd = DB2_FORMS.find(f => f.id === formId);
  const safe = schoolName.replace(/'/g,"\\'");
  const items = rows.map((r, i) => {
    const eid = db2EntryId(r, formId);
    const label = db2FormEntryLabel(r, formId);
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;
        border:1px solid #e2e8f0;border-radius:10px;padding:11px 14px;margin-bottom:9px;flex-wrap:wrap;">
      <div style="font-size:13.5px;color:#1e293b;"><strong>${i+1}.</strong> 👤 ${label}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn-modal-edit" style="padding:5px 11px;font-size:12px;" onclick="closeEntryPicker();openFormPreview('${safe}','${formId}','${eid}')"><i class="ti ti-eye"></i> พรีวิว</button>
        <button class="btn-modal-edit" style="padding:5px 11px;font-size:12px;background:#f0fdf4;color:#15803d;border-color:#bbf7d0;" onclick="closeEntryPicker();openFormEdit('${safe}','${formId}','${eid}')"><i class="ti ti-pencil"></i> แก้ไข</button>
        <button class="btn-modal-pdf" style="padding:5px 11px;font-size:12px;" onclick="closeEntryPicker();downloadFormPDF('${safe}','${formId}','${eid}')"><i class="ti ti-file-text"></i> PDF</button>
      </div>
    </div>`;
  }).join('');

  let overlay = document.getElementById('entryPickerOverlay');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'entryPickerOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px;';
  overlay.onclick = (e) => { if (e.target === overlay) closeEntryPicker(); };
  overlay.innerHTML = `<div style="background:#fff;border-radius:16px;max-width:560px;width:100%;max-height:82vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,0.25);">
      <div style="padding:18px 20px;border-bottom:1px solid #eef2f7;display:flex;align-items:center;justify-content:space-between;">
        <div style="font-weight:800;color:#1e293b;font-size:16px;">${fd ? fd.emoji+' '+fd.name : formId.toUpperCase()}</div>
        <button onclick="closeEntryPicker()" style="border:none;background:#f1f5f9;border-radius:8px;width:30px;height:30px;cursor:pointer;font-size:16px;">✕</button>
      </div>
      <div style="padding:10px 20px 6px;color:#64748b;font-size:13px;">🏫 ${schoolName} — พบ <strong>${rows.length}</strong> รายการ (เลือกของผู้สังเกตที่ต้องการ)</div>
      <div style="padding:12px 20px 20px;">${items}</div>
    </div>`;
  document.body.appendChild(overlay);
}
function closeEntryPicker() {
  const o = document.getElementById('entryPickerOverlay');
  if (o) o.remove();
}


let currentEditSchoolName = null;
let currentEditEntryId   = null;  // EntryID เดิมของแถวที่กำลังแก้ไข ใช้จับคู่แทนชื่อโรงเรียน
let isEditMode = false;  // flag บอกว่ากำลัง "แก้ไข" ไม่ใช่ "กรอกใหม่"

// สร้างรหัสเฉพาะต่อ 1 การกรอก (ไม่ผูกกับชื่อโรงเรียน) เพื่อใช้จับคู่ตอนแก้ไข
// ป้องกันปัญหา: โรงเรียนเดียวกันกรอกฟอร์มเดิมซ้ำหลายครั้ง (เช่น F1-F5 กรอกได้หลายรอบ)
// แล้วระบบไปแก้ไข/ทับแถวผิดอันเพราะจับคู่ด้วยชื่อโรงเรียนเพียงอย่างเดียว
function genEntryId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'eid-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
}

// mapping: payload key → { type, selector }
// type: 'text'|'radio'|'checkbox'|'textarea'
const F0_FIELD_MAP = {
  // หมวด 2: ผู้ให้ข้อมูล — ใช้ key ใหม่ตาม gs.txt + legacy fallback
  '2_บทบาทผู้ให้ข้อมูล':                  { type:'radio',    name:'inf_role' },
  '2_ชื่อ-นามสกุลผู้ให้ข้อมูล':            { type:'text',     id:'inf_name' },
  '2_ตำแหน่ง':                              { type:'text',     id:'inf_pos' },
  '2_โทรศัพท์ผู้ให้ข้อมูล':               { type:'text',     id:'inf_tel' },
  '2_อีเมล':                                { type:'text',     id:'inf_email' },
  '2_วันที่ให้ข้อมูล':                     { type:'text',     id:'inf_date' },
  // หมวด 3.1: ข้อมูลโรงเรียน
  '3.1_ชื่อโรงเรียน':                      { type:'text',     id:'sch_name' },
  '3.1_รหัสโรงเรียน10หลัก':               { type:'text',     id:'sch_code' },
  '3.1_ตำบล':                               { type:'text',     id:'sch_tambon' },
  '3.1_อำเภอ':                              { type:'text',     id:'sch_amphoe' },
  '3.1_จังหวัด':                            { type:'text',     id:'sch_province' },
  '3.1_รหัสไปรษณีย์':                      { type:'text',     id:'sch_zip' },
  '3.1_โทรศัพท์โรงเรียน':                  { type:'text',     id:'sch_tel' },
  '3.1_สำนักงานเขตพื้นที่การศึกษา':        { type:'text',     id:'sch_area' },
  '3.1_ประเภทโรงเรียน':                    { type:'checkbox', cls:'sch_type' },
  // หมวด 3.2: การจัดชั้นเรียน
  '3.2_ลักษณะการจัดชั้นเรียน':            { type:'checkbox', cls:'room_style' },
  '3.2_รายละเอียดข้อจำกัดห้องเรียน':      { type:'text',     id:'room_limit_detail' },
  // หมวด 3.3: บุคลากร
  '3.3_ผู้อำนวยการ/ครูใหญ่':              { type:'radio',    name:'has_director' },
  '3.3_จำนวนรองผอ(คน)':                   { type:'text',     id:'count_deputy' },
  '3.3_จำนวนครูทั้งหมด(คน)':              { type:'text',     id:'count_teacher' },
  '3.3_จำนวนครูอัตราจ้าง(คน)':            { type:'text',     id:'count_contract' },
  '3.3_จำนวนเจ้าหน้าที่ธุรการ(คน)':       { type:'text',     id:'count_admin' },
  // หมวด 4: วิชาการ
  '4.1_ลักษณะการใช้DLTV':                  { type:'checkbox', cls:'usage_style' },
  '4.3_บทบาทครูปลายทาง':                   { type:'checkbox', cls:'teacher_role' },
  '4.4_การเตรียมการก่อนใช้DLTV':           { type:'checkbox', cls:'prep_style' },
  '4.5_การติดตามผลการเรียนรู้':             { type:'checkbox', cls:'follow_style' },
  // หมวด 5: เทคนิค
  '5.1_ช่องทางรับชมDLTV':                   { type:'checkbox', cls:'watch_channel' },
  '5.1_รายละเอียดช่องทางรายชั้น':          { type:'text',     id:'watch_channel_diff_detail' },
  '5.5_แนวทางการดูแลและซ่อมบำรุง':         { type:'radio',    name:'maintenance_style' },
  // หมวด 6: บริบทผู้เรียน
  '6_ลักษณะผู้เรียนและข้อจำกัด':          { type:'checkbox', cls:'student_context' },
  '6_ลักษณะผู้เรียนและข้อจำกัด2':         { type:'checkbox', cls:'limit_factor' },
  '6_สิ่งที่ครูต้นทางควรรู้เกี่ยวกับผู้เรียน': { type:'textarea', id:'what_teacher_should_know' },
  // หมวด 7: จุดแข็ง
  '7_จุดแข็งในการใช้DLTV':                 { type:'textarea', id:'sch_strength' },
  '7_ปัญหาอุปสรรคและความต้องการสนับสนุน':  { type:'textarea', id:'sch_problem' },
  // หมวด 8: สรุป
  '8.1_บริบทสำคัญของโรงเรียน':             { type:'textarea', id:'s8_1_context' },
  '8.2_ข้อจำกัดสำคัญในการเรียนรู้':        { type:'textarea', id:'s8_2_limit' },
  '8.3_สิ่งที่ครูต้นทางควรคำนึงถึง':       { type:'textarea', id:'s8_3_consider' },
  '8.4_ข้อเสนอเบื้องต้นเพื่อสนับสนุน':     { type:'textarea', id:'s8_4_proposal' },
  // ลงนาม
  'ลงนาม_ผู้ให้ข้อมูล':                   { type:'text',     id:'sig1_name' },
  'ลงนาม_ตำแหน่ง':                         { type:'text',     id:'sig1_pos' },
  'ลงนาม_วันที่':                           { type:'text',     id:'sig1_date' },
  'ลงนาม_ผู้บริหารรับรอง':                 { type:'text',     id:'sig2_name' },
  'ลงนาม_ตำแหน่งผู้บริหาร':               { type:'text',     id:'sig2_pos' },
  'ลงนาม_วันที่ผู้บริหาร':                 { type:'text',     id:'sig2_date' },
  // Legacy keys — รองรับข้อมูลเก่าที่บันทึกก่อนอัปเดต
  'ผู้ให้ข้อมูล_สถานะ':                    { type:'radio',    name:'inf_role' },
  'ผู้ให้ข้อมูล_ชื่อ':                      { type:'text',     id:'inf_name' },
  'ผู้ให้ข้อมูล_ตำแหน่ง':                  { type:'text',     id:'inf_pos' },
  'ผู้ให้ข้อมูล_เบอร์โทร':                 { type:'text',     id:'inf_tel' },
  'ผู้ให้ข้อมูล_อีเมล':                    { type:'text',     id:'inf_email' },
  'ผู้ให้ข้อมูล_วันที่บันทึก':             { type:'text',     id:'inf_date' },
  'ชื่อโรงเรียน':                           { type:'text',     id:'sch_name' },
  'รหัสโรงเรียน':                           { type:'text',     id:'sch_code' },
  'ตำบล':                                    { type:'text',     id:'sch_tambon' },
  'อำเภอ':                                   { type:'text',     id:'sch_amphoe' },
  'จังหวัด':                                 { type:'text',     id:'sch_province' },
  'รหัสไปรษณีย์':                           { type:'text',     id:'sch_zip' },
  'โทรศัพท์โรงเรียน':                       { type:'text',     id:'sch_tel' },
  'สำนักงานเขตพื้นที่':                     { type:'text',     id:'sch_area' },
  'S8_บริบทสำคัญ':                          { type:'textarea', id:'s8_1_context' },
  'S8_ข้อจำกัดการเรียน':                   { type:'textarea', id:'s8_2_limit' },
  'S8_ข้อควรคำนึงถึง':                     { type:'textarea', id:'s8_3_consider' },
  'S8_ข้อเสนอแนะเบื้องต้น':               { type:'textarea', id:'s8_4_proposal' },
};

// ════════════════════════════════════════════════════
//  ROBUST FORM SERIALIZE / RESTORE  (index-based)
// ════════════════════════════════════════════════════
/** Serialize ทุก input ใน form-FX โดยใช้ DOM index ไม่พึ่ง label
 *  - text/number/date/tel/email/textarea/select -> __i_N = value
 *  - radio  -> __ri_N = checked (true/false) per element index (แก้ปัญหา matrix-table)
 *  - checkbox -> __c_N = checked (true/false)
 */
function serializeFormPanel(formId) {
  const panel = document.getElementById('form-' + formId);
  if (!panel) return {};
  const result = {};
  const SEL = 'input[type=text],input[type=number],input[type=date],input[type=tel],input[type=email],textarea,select';
  panel.querySelectorAll(SEL).forEach((el, i) => { result['__i_' + i] = el.value; });
  // เก็บ radio แบบ index (ไม่ใช้ name เพราะ matrix-table อาจ name ซ้ำหรือไม่มี)
  panel.querySelectorAll('input[type=radio]').forEach((el, i) => { result['__ri_' + i] = el.checked; });
  panel.querySelectorAll('input[type=checkbox]').forEach((el, i) => { result['__c_' + i] = el.checked; });
  return result;
}

/** Restore ทุก input กลับตาม DOM index */
function restoreFormPanel(formId, data) {
  const panel = document.getElementById('form-' + formId);
  if (!panel) return;
  const SEL = 'input[type=text],input[type=number],input[type=date],input[type=tel],input[type=email],textarea,select';
  // เคลียร์ก่อน
  panel.querySelectorAll(SEL).forEach(el => el.value = '');
  panel.querySelectorAll('input[type=radio],input[type=checkbox]').forEach(el => el.checked = false);
  // restore text inputs
  panel.querySelectorAll(SEL).forEach((el, i) => {
    const v = data['__i_' + i];
    if (v !== undefined) el.value = v;
  });
  // restore radio แบบ index (รองรับทั้ง __ri_ และ __r_ สำหรับ backward compat)
  const hasRiKeys = Object.keys(data).some(k => k.startsWith('__ri_'));
  if (hasRiKeys) {
    panel.querySelectorAll('input[type=radio]').forEach((el, i) => {
      const saved = data['__ri_' + i];
      if (saved !== undefined) el.checked = !!saved;
    });
  } else {
    // fallback: __r_name based (ข้อมูลเก่า)
    panel.querySelectorAll('input[type=radio]').forEach(el => {
      const saved = data['__r_' + el.name];
      if (saved !== undefined && el.value === saved) el.checked = true;
    });
  }
  // restore checkbox
  panel.querySelectorAll('input[type=checkbox]').forEach((el, i) => {
    const saved = data['__c_' + i];
    if (saved !== undefined) el.checked = !!saved;
  });
}


/* ===== INJECTED SCHEMA-DRIVEN CORE (newcore) ===== */
/* ============================================================
 *  SCHEMA-DRIVEN CORE (ใหม่) — แก้ปัญหาแก้ไขฟอร์ม + PDF เรียงตามข้อ
 *  หลักการ:
 *   1) เก็บ "snapshot ตามตำแหน่งช่องจริง" (serializeFormPanel) ลงคอลัมน์เดียว
 *      __snapshot__ เพื่อให้ดึงกลับมาเติม/พิมพ์ได้ครบและตรงเป๊ะ
 *   2) สร้าง PDF โดยไล่อ่านจากฟอร์มจริงตามลำดับข้อ (schema) -> เรียงตามแบบฟอร์มเสมอ
 *   3) ถ้าไม่มี snapshot (ข้อมูลเก่า) ใช้ schema + data-key เป็น fallback
 * ============================================================ */
const SCHEMA_TEXT_SEL = 'input[type=text],input[type=number],input[type=date],input[type=tel],input[type=email],textarea,select';

function _schemaSectionTitle(el){ const s=el.closest('.section'); const t=s?s.querySelector('.section-title'):null; return t?t.textContent.trim():''; }
function _fieldLabel(f){ const l=f.querySelector('label'); return l?(l.childNodes[0]?.textContent.trim()||l.textContent.trim()):''; }
function _cbTitle(g){ let t=g.previousElementSibling; while(t&&!t.matches('label,.section-title,[data-key]')) t=t.previousElementSibling; return t?t.textContent.trim():''; }

/** สร้าง schema (ลำดับตาม DOM = ลำดับข้อในแบบฟอร์ม) */
function buildFormSchema(formId){
  const panel=document.getElementById('form-'+formId);
  if(!panel) return [];
  const schema=[];
  panel.querySelectorAll('.tab-content').forEach(tab=>{
    // ---- คำนวณ key ให้ตรง autoCollectPanel (เผื่อใช้ fallback อ่านจาก row) ----
    const keyMap=new Map();
    tab.querySelectorAll('.field[data-key]').forEach(f=>{ if(!keyMap.has(f)) keyMap.set(f,f.dataset.key); });
    tab.querySelectorAll('.cb-group[data-key]').forEach(g=>{ if(!keyMap.has(g)) keyMap.set(g,g.dataset.key); });
    tab.querySelectorAll('table.matrix-table[data-key]').forEach(t=>{ if(!keyMap.has(t)) keyMap.set(t,t.dataset.key); });
    const counter={};
    const nextKey=(base)=>{ const k=base||'field'; if(counter[k]===undefined){counter[k]=0;return k;} counter[k]++; return `${k}_${counter[k]+1}`; };
    tab.querySelectorAll('.field:not([data-key])').forEach(f=>{ if(!f.querySelector('input,textarea,select')) return; keyMap.set(f,nextKey(_fieldLabel(f)||'field')); });
    tab.querySelectorAll('.cb-group:not([data-key])').forEach(g=>{ keyMap.set(g,nextKey(_cbTitle(g)||'ตัวเลือก')); });

    // ---- เดินตามลำดับ DOM ----
    tab.querySelectorAll('.field, .cb-group, table.matrix-table').forEach(el=>{
      // cb-group ที่อยู่ใน .field -> ให้ field จัดการ (ไม่ทำซ้ำ)
      if(el.classList.contains('cb-group') && el.closest('.field')) return;

      if(el.matches('table.matrix-table')){
        const dk=el.dataset.key;
        const rows=[...el.querySelectorAll('tbody tr')].map(tr=>({
          rowKey: tr.dataset.key||'',
          rowLabel: tr.querySelector('td:first-child')?.textContent.trim()||'',
          tr
        }));
        const evEl=el.nextElementSibling?el.nextElementSibling.querySelector('textarea, input[type=text]'):null;
        const headers=[...el.querySelectorAll('thead th')].map(th=>th.textContent.trim());
        // ตารางที่ "ไม่มี radio" (เช่น ตารางพิมพ์อิสระ/เกณฑ์) -> แสดงเฉพาะถ้ามีช่องกรอก
        const hasInputs = !!el.querySelector('tbody input, tbody select, tbody textarea');
        schema.push({ kind:'matrix', el, dataKey:dk||'', aggKey:(dk||'')+'(ตาราง)',
          evidenceKey: el.dataset.evidenceKey||'', evEl, rows, headers, hasInputs,
          section:_schemaSectionTitle(el), label:_schemaSectionTitle(el) });
        return;
      }

      if(el.classList.contains('field')){
        const first=el.querySelector('input,textarea,select');
        if(!first) return;
        const innerGroup=el.querySelector('.cb-group');
        const isChoice=(first.type==='radio'||first.type==='checkbox');
        schema.push({
          kind:'field', el, first,
          key: keyMap.get(el)||_fieldLabel(el),
          groupKey: innerGroup? keyMap.get(innerGroup): undefined, // key ของ cb-group ซ้อนใน field (label-based)
          label:_fieldLabel(el),
          inputType: isChoice? first.type : (first.tagName.toLowerCase()==='select'?'select':(first.type||'text')),
          section:_schemaSectionTitle(el)
        });
        return;
      }

      // cb-group เดี่ยว (ไม่อยู่ใน field)
      if(el.classList.contains('cb-group')){
        schema.push({ kind:'cbgroup', el, key:keyMap.get(el)||_cbTitle(el), label:_cbTitle(el), section:_schemaSectionTitle(el) });
      }
    });
  });
  return schema;
}

/** ---------- ตัวเก็บข้อมูลแบบ schema: หนึ่งคอลัมน์ต่อหนึ่งข้อ เรียงตาม DOM ----------
 *  ใช้เป็นแหล่งความจริงเดียวทั้ง payload ที่ส่งขึ้นชีต และลำดับคอลัมน์ (SHEET_HEADERS)
 *  จึงได้คอลัมน์ที่เรียงตามข้อในแบบฟอร์มเป๊ะ ไม่มีคีย์ซ้ำ/ตัวต่อท้ายแบบมั่ว
 */
function _matrixRowHasRadio(rowInfo){ return !!rowInfo.tr.querySelector('td:not(:first-child) input[type=radio]'); }
function _matrixRowHasText(rowInfo){ return !!rowInfo.tr.querySelector('td:not(:first-child) input[type=text],td:not(:first-child) input[type=number],td:not(:first-child) select'); }

function collectFormBySchema(formId){
  const schema = buildFormSchema(formId);
  const out = [];          // [{key, value}] รักษาลำดับตาม DOM
  const seen = {};
  const put = (rawKey, val) => {
    let key = (rawKey || 'field').trim();
    if (seen[key] !== undefined) { seen[key]++; key = key + '_' + (seen[key] + 1); }
    else { seen[key] = 0; }
    out.push({ key: key, value: (val == null ? '' : val) });
  };
  schema.forEach(entry => {
    if (entry.kind === 'field' || entry.kind === 'cbgroup') {
      put(entry.key, readEntryFromDOM(entry));
      return;
    }
    if (entry.kind === 'matrix') {
      if (entry.hasInputs === false) return;             // ตารางเกณฑ์/อ้างอิง ไม่เก็บ
      const hasRadio = !!entry.el.querySelector('tbody input[type=radio]');
      const base = entry.dataKey || entry.section || 'ตาราง';

      if (hasRadio) {
        // ตารางให้คะแนน: ระดับ (+ หลักฐานต่อแถวถ้ามี)
        entry.rows.forEach((ri, idx) => {
          const rowLabel = ri.rowLabel || ('แถว' + (idx + 1));
          const cells = readMatrixRowFromDOM(ri);
          const radioCell = cells.find(c => c.type === 'radio');
          const textCell  = cells.find(c => c.type === 'text' || c.type === 'select');
          put(base + ' — ' + rowLabel, radioCell ? radioCell.val : '');
          if (_matrixRowHasText(ri)) put(base + ' — ' + rowLabel + ' (หลักฐาน)', textCell ? textCell.val : '');
        });
      } else {
        // ตารางกรอกอิสระ: หนึ่งคอลัมน์ต่อหนึ่งช่องกรอก (ตามหัวตาราง)
        entry.rows.forEach((ri, idx) => {
          const tds = [...ri.tr.querySelectorAll('td')];
          const labelParts = [];
          const inputCells = [];
          tds.forEach((td, ci) => {
            if (td.querySelector('input,select,textarea')) inputCells.push({ ci: ci, val: _cellValue(td) });
            else labelParts.push(td.textContent.trim());
          });
          const rowName = (labelParts.join(' ').trim()) || ri.rowKey || ('แถว' + (idx + 1));
          inputCells.forEach(c => {
            const header = entry.headers[c.ci] || ('คอลัมน์' + (c.ci + 1));
            put(base + ' — ' + rowName + ' — ' + header, c.val);
          });
        });
      }
      if (entry.evEl) put(base + ' (หลักฐานประกอบ)', entry.evEl.value || '');
      return;
    }
  });
  return out;
}
/** ลำดับชื่อคอลัมน์ของฟอร์ม (สำหรับสร้าง SHEET_HEADERS) — โครงสร้างคงที่ไม่ขึ้นกับค่าที่กรอก */
function formColumnOrder(formId){ return collectFormBySchema(formId).map(o => o.key); }
/** payload object พร้อมส่งขึ้นชีต (คีย์ = ชื่อคอลัมน์ตามข้อ) */
function collectFormPayload(formId){
  const o = {}; collectFormBySchema(formId).forEach(p => { o[p.key] = p.value; }); return o;
}

/** อ่านค่าจาก row หลาย key (กันชื่อคอลัมน์ต่างเล็กน้อย) */
function schemaRowVal(row, ...keys){
  for(const k of keys){
    if(!k) continue;
    if(row[k]!==undefined && row[k]!==null && String(row[k]).trim()!=='') return String(row[k]);
    const a1=k.replace(/ /g,'_'), a2=k.replace(/_/g,' ');
    if(row[a1]!==undefined && String(row[a1]).trim()!=='') return String(row[a1]);
    if(row[a2]!==undefined && String(row[a2]).trim()!=='') return String(row[a2]);
  }
  return '';
}

/* ---------- อ่านค่าปัจจุบันจากฟอร์มจริง (ใช้หลัง restore snapshot) ---------- */
function _readChoiceLabels(scopeEl, type){
  return [...scopeEl.querySelectorAll(`input[type=${type}]:checked`)].map(c=>{
    const l=c.closest('label'); return (l?l.textContent.trim():'') || c.value;
  });
}
function readEntryFromDOM(entry){
  if(entry.kind==='field'){
    const f=entry.first;
    if(f.type==='radio') return _readChoiceLabels(entry.el,'radio').join(', ');
    if(f.type==='checkbox') return _readChoiceLabels(entry.el,'checkbox').join(', ');
    if(f.tagName && f.tagName.toLowerCase()==='select'){
      const opt=f.options[f.selectedIndex]; return (opt&&opt.value)?opt.textContent.trim():'';
    }
    return f.value||'';
  }
  if(entry.kind==='cbgroup'){
    const r=_readChoiceLabels(entry.el,'radio'); const c=_readChoiceLabels(entry.el,'checkbox');
    return r.concat(c).join(', ');
  }
  return '';
}
function readMatrixRowFromDOM(rowInfo){
  // คืน array ของค่าต่อ cell (ข้ามคอลัมน์แรกที่เป็นป้ายข้อ)
  const cells=[];
  rowInfo.tr.querySelectorAll('td:not(:first-child)').forEach(td=>{
    const radio=td.querySelector('input[type=radio]:checked');
    const text=td.querySelector('input[type=text],input[type=number]');
    const sel=td.querySelector('select');
    if(radio) cells.push({type:'radio', val:radio.value});
    else if(text) cells.push({type:'text', val:text.value||''});
    else if(sel){ const o=sel.options[sel.selectedIndex]; cells.push({type:'select', val:(o&&o.value)?o.textContent.trim():''}); }
  });
  return cells;
}

/* ---------- PDF (อ่านจากฟอร์มจริงตามลำดับข้อ) ---------- */
function _pdfEsc(s){ return String(s==null?'':s).replace(/</g,'&lt;').replace(/\n/g,'<br>'); }
function _pdfMissing(){ return '<span style="color:#94a3b8;">—</span>'; }
/** อ่านค่าของ cell ตาราง: ช่องกรอก -> ค่าที่กรอก, เซลล์คงที่ -> ข้อความ (label/เลขลำดับ) */
function _cellValue(td){
  const inp=td.querySelector('input[type=text],input[type=number],input[type=tel],input[type=email],textarea');
  if(inp) return inp.value||'';
  const sel=td.querySelector('select');
  if(sel){ const o=sel.options[sel.selectedIndex]; return (o&&o.value&&o.value!=='--')?o.textContent.trim():''; }
  const r=td.querySelector('input[type=radio]:checked'); if(r) return r.value;
  const cbs=td.querySelectorAll('input[type=checkbox]:checked');
  if(cbs.length) return [...cbs].map(c=>{const l=c.closest('label');return l?l.textContent.trim():c.value;}).join(', ');
  if(td.querySelector('input,select,textarea')) return ''; // ช่องว่างที่ยังไม่กรอก
  return td.textContent.trim();
}

function buildPDFFromLiveForm(formId, school){
  const fd=(typeof DB2_FORMS!=='undefined')?DB2_FORMS.find(f=>f.id===formId):null;
  let html=(typeof pHeader==='function')? pHeader(fd?fd.label:formId.toUpperCase(), fd?fd.name:'', school)
        : `<h2>${_pdfEsc(fd?fd.name:formId)}</h2><h3>${_pdfEsc(school)}</h3>`;
  const schema=buildFormSchema(formId);
  let curSection=null, kvOpen=false;
  const closeKV=()=>{ if(kvOpen){ html+='</tbody></table>'; kvOpen=false; } };
  const sect=(t)=>{ if(t&&t!==curSection){ closeKV(); curSection=t; html+=`<div class="p-title">${_pdfEsc(t)}</div>`; } };
  const openKV=()=>{ if(!kvOpen){ html+='<table class="pdf-table"><tbody>'; kvOpen=true; } };
  const kv=(label,val)=> html+=`<tr><td style="width:40%;font-weight:600;background:#f8fafc;color:#1e3a8a;vertical-align:top;">${_pdfEsc(label)}</td><td style="white-space:pre-wrap;">${val===''?_pdfMissing():_pdfEsc(val)}</td></tr>`;

  schema.forEach(entry=>{
    sect(entry.section||'ข้อมูล');
    if(entry.kind==='field'||entry.kind==='cbgroup'){
      const v=readEntryFromDOM(entry);
      openKV(); kv(entry.label||entry.key, v);
    }
    else if(entry.kind==='matrix'){
      if(!entry.hasInputs) return; // ตารางเกณฑ์ (ไม่มีช่องกรอก) ข้าม
      closeKV();
      const hasRadio = !!entry.el.querySelector('tbody input[type=radio]');

      if(hasRadio){
        // ── ตารางให้คะแนน: รูปแบบกระชับ [ป้ายข้อ | ระดับ/หลักฐาน] ──
        let rowsHtml=''; let any=false;
        entry.rows.forEach(ri=>{
          const cells=readMatrixRowFromDOM(ri);
          const rating=cells.filter(c=>c.type==='radio').map(c=>c.val);
          const texts =cells.filter(c=>c.type!=='radio').map(c=>c.val).filter(x=>x!=='');
          const valStr=rating.concat(texts).join(' / ');
          if(valStr!=='') any=true;
          if(ri.rowLabel || valStr!==''){
            rowsHtml+=`<tr><td style="width:58%;font-size:10pt;">${_pdfEsc(ri.rowLabel)}</td><td style="font-size:10pt;">${valStr===''?_pdfMissing():_pdfEsc(valStr)}</td></tr>`;
          }
        });
        if(any || rowsHtml){
          html+=`<table class="pdf-table" style="font-size:10pt;"><thead><tr><th style="width:58%;">${_pdfEsc(entry.headers[0]||'รายการ')}</th><th>${_pdfEsc(entry.headers.slice(1).join(' / ')||'ระดับ')}</th></tr></thead><tbody>${rowsHtml}</tbody></table>`;
        }
      } else {
        // ── ตารางกรอกอิสระ: แสดงครบทุกคอลัมน์ตามหัวตาราง ──
        const ncol=entry.headers.length || (entry.rows[0]?entry.rows[0].tr.querySelectorAll('td').length:0);
        let rowsHtml=''; let any=false;
        entry.rows.forEach((ri,idx)=>{
          const tds=[...ri.tr.querySelectorAll('td')];
          const vals=tds.map(td=>_cellValue(td));
          if(vals.some(v=>String(v).trim()!=='')) any=true;
          rowsHtml+='<tr>'+vals.map(v=>`<td style="font-size:10pt;vertical-align:top;white-space:pre-wrap;">${String(v).trim()===''?_pdfMissing():_pdfEsc(v)}</td>`).join('')+'</tr>';
        });
        if(any){
          const thead=entry.headers.map(h=>`<th>${_pdfEsc(h)}</th>`).join('');
          html+=`<table class="pdf-table" style="font-size:9.5pt;"><thead><tr>${thead}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
        }
      }
      if(entry.evEl){ const ev=entry.evEl.value||''; if(ev) html+=`<div class="p-block-wrap"><span class="p-block-label">หลักฐาน/ข้อสังเกต:</span> <span class="p-block-val">${_pdfEsc(ev)}</span></div>`; }
    }
  });
  closeKV();
  return html;
}

/** เติมข้อมูลจาก row กลับเข้าฟอร์มด้วย schema (FALLBACK สำหรับข้อมูลเก่าที่ไม่มี __snapshot__) */
function restoreFromSchema(formId, row){
  const panel=document.getElementById('form-'+formId);
  if(!panel) return;
  panel.querySelectorAll(SCHEMA_TEXT_SEL).forEach(el=>{ el.value=''; });
  panel.querySelectorAll('input[type=radio],input[type=checkbox]').forEach(el=>{ el.checked=false; });

  const setChoice=(scopeEl,type,val)=>{
    const vals=val.split(/,\s*/).map(s=>s.trim()).filter(Boolean);
    scopeEl.querySelectorAll(`input[type=${type}]`).forEach(inp=>{
      const lbl=inp.closest('label')?inp.closest('label').textContent.trim():inp.value;
      if(vals.some(v=>v===inp.value||v===lbl)) inp.checked=true;
    });
  };

  buildFormSchema(formId).forEach(entry=>{
    if(entry.kind==='field'){
      const f=entry.first;
      if(f.type==='radio'||f.type==='checkbox'){
        const val=schemaRowVal(row, entry.groupKey, entry.key, entry.label);
        if(val) setChoice(entry.el, f.type, val);
      } else if(f.tagName.toLowerCase()==='select'){
        const val=schemaRowVal(row, entry.key, entry.label);
        if(val){ [...f.options].forEach(o=>{ if(o.textContent.trim()===val||o.value===val) f.value=o.value; }); }
      } else {
        const val=schemaRowVal(row, entry.key, entry.label);
        if(val) f.value=val;
      }
    }
    else if(entry.kind==='cbgroup'){
      const val=schemaRowVal(row, entry.key, entry.label);
      if(val){ setChoice(entry.el,'radio',val); setChoice(entry.el,'checkbox',val); }
    }
    else if(entry.kind==='matrix'){
      if(entry.evidenceKey && entry.evEl){ const ev=schemaRowVal(row,entry.evidenceKey); if(ev) entry.evEl.value=ev; }
      const aggVal=schemaRowVal(row,entry.aggKey);
      const aggRows=aggVal?aggVal.split(' | '):[];
      entry.rows.forEach((ri,idx)=>{
        let cellStr = ri.rowKey? schemaRowVal(row,ri.rowKey):'';
        if(cellStr==='' && aggRows[idx]){ const p=aggRows[idx]; const ci=p.indexOf(':'); cellStr=ci>=0?p.slice(ci+1).trim():p; }
        if(cellStr==='') return;
        const cellVals=cellStr.split('/').map(s=>s.trim());
        const radios=ri.tr.querySelectorAll('td:not(:first-child) input[type=radio]');
        const txtsel=ri.tr.querySelectorAll('td:not(:first-child) input[type=text],td:not(:first-child) input[type=number],td:not(:first-child) select');
        let vi=0;
        const radioOpts=new Set([...radios].map(r=>r.value));
        if(radios.length && cellVals.length && radioOpts.has(cellVals[0])){
          const rv=cellVals[vi]; vi++;
          radios.forEach(r=>{ if(r.value===rv) r.checked=true; });
        }
        txtsel.forEach(inp=>{ const cv=cellVals[vi]||''; vi++; if(inp.tagName.toLowerCase()==='select'){ [...inp.options].forEach(o=>{ if(o.textContent.trim()===cv||o.value===cv) inp.value=o.value; }); } else { inp.value=cv; } });
      });
    }
  });
}

/* ===== END INJECTED CORE ===== */

function fillFormWithData(formId, storedData) {
  // ★ ทางลัดที่แม่นที่สุด: ถ้ามี __snapshot__ (index-based) ใช้ได้กับทุกฟอร์มรวม F0
  //   ต้องตรวจว่าเป็น snapshot จริง (มี key __i_/__ri_/__c_) เพื่อกัน snapshot ว่าง/เสีย
  //   มาล้างฟอร์มจนข้อมูลหาย — ถ้าไม่ใช่ของจริงให้ตกไปใช้ schema restore แทน
  if (storedData && storedData['__snapshot__']) {
    try {
      const snap = (typeof storedData['__snapshot__'] === 'string')
        ? JSON.parse(storedData['__snapshot__']) : storedData['__snapshot__'];
      const isReal = snap && typeof snap === 'object' &&
        Object.keys(snap).some(k => k.startsWith('__i_') || k.startsWith('__ri_') || k.startsWith('__c_'));
      if (isReal) { restoreFormPanel(formId, snap); return; }
    } catch (e) { console.warn('restore __snapshot__ fail, fallback', e); }
  }

  if (formId === 'f0') {
    const panel = document.getElementById('form-f0');
    if (!panel) return;
    panel.querySelectorAll('input[type=text],input[type=tel],input[type=email],input[type=date],input[type=number],textarea').forEach(el => el.value = '');
    panel.querySelectorAll('input[type=checkbox],input[type=radio]').forEach(el => el.checked = false);

    // ── restore ฟิลด์มาตรฐานผ่าน F0_FIELD_MAP ──
    Object.entries(F0_FIELD_MAP).forEach(([key, field]) => {
      const val = storedData[key];
      if (!val) return;
      if (field.type === 'text' || field.type === 'textarea') {
        const el = document.getElementById(field.id);
        if (el) el.value = val;
      } else if (field.type === 'radio') {
        const el = document.querySelector(`input[name="${field.name}"][value="${val}"]`);
        if (el) el.checked = true;
      } else if (field.type === 'checkbox') {
        val.split(/,\s*/).forEach(v => {
          const el = document.querySelector(`.${field.cls}[value="${v.trim()}"]`);
          if (el) el.checked = true;
        });
      }
    });

    // ── restore ตารางครูตรงวิชาเอก ──
    // format: "ปฐมวัย:3คน(หมายเหตุ) | ภาษาไทย:2คน(-)"
    const majorRaw = storedData['3.3_ครูตรงเอก_หมายเหตุ'] || storedData['ตารางครูตรงวิชาเอก_รวม'] || '';
    if (majorRaw) {
      majorRaw.split(' | ').forEach(entry => {
        // entry = "วิชา:จำนวนคน(หมายเหตุ)"
        const m = entry.match(/^(.+?):(\d+)คน\((.*)?\)$/);
        if (!m) return;
        const [, subj, cnt, note] = m;
        // หา input ที่ data-subject ตรง
        const cntEl = document.querySelector(`#major_table .mj-count[data-subject="${subj}"]`);
        const noteEl = document.querySelector(`#major_table .mj-note[data-subject="${subj}"]`);
        if (cntEl) cntEl.value = cnt;
        if (noteEl && note && note !== '-') noteEl.value = note;
        // กรณี "อื่น ๆ"
        if (!cntEl) {
          const otherTitle = document.getElementById('mj_other_title');
          const otherCount = document.getElementById('mj_other_count');
          const otherNote  = document.getElementById('mj_other_note');
          if (otherTitle) otherTitle.value = subj;
          if (otherCount) otherCount.value = cnt;
          if (otherNote && note && note !== '-') otherNote.value = note;
        }
      });
    }

    // ── restore ตารางวิชาการแยกชั้นปี (4.2) ──
    // format: "อ.1[วิชา:คณิต|ความถี่:ทุกคาบ] | ป.1[...]"
    const acRaw = storedData['4.2_ระดับชั้นและรายวิชาที่ใช้DLTV(JSON)'] || storedData['ตารางวิชาการแยกชั้นปี_รวม'] || '';
    if (acRaw) {
      acRaw.split(' | ').forEach(entry => {
        const m = entry.match(/^(.+?)\[วิชา:(.+?)\|ความถี่:(.+?)\]$/);
        if (!m) return;
        const [, grade, subj, freq] = m;
        const subjEl = document.querySelector(`.ac-subject[data-grade="${grade}"]`);
        if (subjEl && subj !== '-') subjEl.value = subj;
        if (freq && freq !== '-') {
          const freqEl = document.querySelector(`input[name="ac_freq_${grade}"][value="${freq}"]`);
          if (freqEl) freqEl.checked = true;
        }
        // หมายเหตุ
        const noteEl = document.querySelector(`.ac-note[data-grade="${grade}"]`);
        if (noteEl) noteEl.value = '';
      });
    }

    // ── restore ตารางอุปกรณ์ TV/IRD ──
    // format: "อ.1[TV:x|IRD:y] | ..."
    const hwRaw = storedData['5.2-5.3_สถานะอุปกรณ์รายชั้น(JSON)'] || storedData['ตารางอุปกรณ์ทีวีและกล่อง_รวม'] || '';
    if (hwRaw) {
      hwRaw.split(' | ').forEach(entry => {
        const m = entry.match(/^(.+?)\[TV:(.+?)\|IRD:(.+?)\]$/);
        if (!m) return;
        const [, grade, tv, ird] = m;
        if (tv && tv !== '-') {
          const tvEl = document.querySelector(`input[name="tv_${grade}"][value="${tv}"]`);
          if (tvEl) tvEl.checked = true;
        }
        if (ird && ird !== '-') {
          const irdEl = document.querySelector(`input[name="ird_${grade}"][value="${ird}"]`);
          if (irdEl) irdEl.checked = true;
        }
      });
    }

    // ── restore โครงสร้างพื้นฐาน ──
    // format: "ไฟฟ้า:x | สัญญาณ:y | เสียง:z | เน็ต:w"
    const infraRaw = storedData['5.4_โครงสร้างพื้นฐาน(JSON)'] || storedData['ตารางโครงสร้างพื้นฐาน_รวม'] || '';
    if (infraRaw) {
      const infraMap = { 'ไฟฟ้า': 'inf_elec', 'สัญญาณ': 'inf_sig', 'เสียง': 'inf_vol', 'เน็ต': 'inf_net' };
      infraRaw.split(' | ').forEach(part => {
        const [k, v] = part.split(':');
        const name = infraMap[(k||'').trim()];
        if (name && v) {
          const el = document.querySelector(`input[name="${name}"][value="${v.trim()}"]`);
          if (el) el.checked = true;
        }
      });
    }

    return;
  }

  // F1–F5: ถ้ามี __i_ key ใช้ index-based restore (เร็วและแม่น)
  if (storedData && Object.keys(storedData).some(k => k.startsWith('__i_'))) {
    restoreFormPanel(formId, storedData);
    return;
  }

  // ★ ข้อมูลเก่าที่ไม่มี snapshot — ใช้ schema-driven restore (อ่านตาม data-key + label)
  try {
    restoreFromSchema(formId, storedData);
    return;
  } catch (e) {
    console.warn('restoreFromSchema fail, fallback to legacy label-based', e);
  }

  // ── label-based restore (legacy fallback) ────────────────────────────
  // จำลอง autoCollectPanel ทุกขั้นตอนแบบ "reverse" เพื่อให้ key ตรง 100%
  const panel = document.getElementById('form-' + formId);
  if (!panel) return;

  // เคลียร์ทั้งหมด
  panel.querySelectorAll('input[type=text],input[type=number],input[type=date],input[type=tel],input[type=email],textarea,select')
    .forEach(el => el.value = '');
  panel.querySelectorAll('input[type=checkbox],input[type=radio]').forEach(el => el.checked = false);

  // วน tab-content เหมือน autoCollectForm
  panel.querySelectorAll('.tab-content').forEach(tabEl => {
    const counter = {};
    function nextKey(baseKey) {
      const k = baseKey || 'field';
      if (counter[k] === undefined) { counter[k] = 0; return k; }
      counter[k]++; return `${k}_${counter[k] + 1}`;
    }

    // 1) .field elements — เหมือน autoCollectPanel ทุกบรรทัด
    tabEl.querySelectorAll('.field').forEach(fieldDiv => {
      const label = fieldDiv.querySelector('label');
      const labelText = label
        ? (label.childNodes[0]?.textContent.trim() || label.textContent.trim())
        : 'field';
      const input = fieldDiv.querySelector('input, textarea, select');
      if (!input) return;
      const key = nextKey(labelText);
      const val = storedData[key];
      if (val === undefined || val === null || val === '') return;

      if (input.type === 'radio') {
        const r = fieldDiv.querySelector(`input[type=radio][value="${val}"]`);
        if (r) r.checked = true;
      } else if (input.type === 'checkbox') {
        const vals = val.split(/,\s*/);
        fieldDiv.querySelectorAll('input[type=checkbox]').forEach(cb => {
          const cbLbl = cb.closest('label')?.textContent.trim() || cb.value;
          if (vals.some(v => v.trim() === cbLbl || v.trim() === cb.value)) cb.checked = true;
        });
      } else {
        input.value = val;
      }
    });

    // 2) .cb-group elements
    tabEl.querySelectorAll('.cb-group').forEach(group => {
      let titleEl = group.previousElementSibling;
      while (titleEl && !titleEl.matches('label, .section-title'))
        titleEl = titleEl.previousElementSibling;
      const groupLabel = titleEl ? titleEl.textContent.trim() : 'ตัวเลือก';
      const key = nextKey(groupLabel);
      const val = storedData[key];
      if (!val) return;
      const vals = val.split(/,\s*/);
      group.querySelectorAll('input[type=checkbox], input[type=radio]').forEach(inp => {
        const lbl = inp.closest('label');
        const lblText = lbl ? lbl.textContent.trim() : inp.value;
        if (vals.some(v => v.trim() === lblText || v.trim() === inp.value)) inp.checked = true;
      });
    });

    // 3) matrix-table — parse "rowLabel: v1/v2 | ..." กลับใส่ cell
    tabEl.querySelectorAll('table.matrix-table').forEach((table, tIdx) => {
      const sec = table.closest('.section');
      const titleEl = sec ? sec.querySelector('.section-title') : null;
      const tableTitle = titleEl ? titleEl.textContent.trim() : `ตาราง${tIdx + 1}`;
      const key = nextKey(tableTitle + '(ตาราง)');
      const val = storedData[key];
      if (!val) return;

      const rowEntries = val.split(' | ');
      table.querySelectorAll('tbody tr').forEach((tr, rIdx) => {
        const entry = rowEntries[rIdx];
        if (!entry) return;
        const colonIdx = entry.indexOf(':');
        const cellsPart = colonIdx >= 0 ? entry.slice(colonIdx + 1).trim() : entry;
        const cellVals = cellsPart.split('/');
        let ci = 0;
        tr.querySelectorAll('td').forEach((td, colIdx) => {
          if (colIdx === 0) return; // skip row-label column
          const cellVal = (cellVals[ci] || '').trim();
          ci++;
          const radio = td.querySelector('input[type=radio]');
          const text  = td.querySelector('input[type=text], input[type=number]');
          const sel   = td.querySelector('select');
          if (radio) {
            const r = td.querySelector(`input[type=radio][value="${cellVal}"]`);
            if (r) r.checked = true;
          } else if (text) { text.value = cellVal; }
          else if (sel) { sel.value = cellVal; }
        });
      });
    });
  });
}

function openFormEdit(schoolName, formId, entryId) {
  closePreviewModal();
  const row = findFormRow(schoolName, formId, entryId);
  if (!row) { showToast('⚠️ ไม่พบข้อมูลของฟอร์มนี้'); return; }

  currentEditFormId     = formId;
  currentEditSchoolName = schoolName;
  currentEditEntryId    = row['EntryID'] || row['entryId'] || null;
  isEditMode = true;

  // สลับไปหน้าฟอร์มก่อน แล้วค่อยเติมข้อมูล (DOM ต้อง visible ก่อน)
  switchMode('form');
  switchForm(formId);
  // เปิดทุก tab-content ชั่วคราว (visibility:hidden) เพื่อให้ DOM พร้อมรับค่า
  const _prePanel = document.getElementById('form-' + formId);
  if (_prePanel) {
    _prePanel.querySelectorAll('.tab-content').forEach(tc => {
      tc.style.display = 'block';
      tc.style.visibility = 'hidden';
      tc.style.pointerEvents = 'none';
    });
  }
  if (formId === 'f0') showTab(0);
  else showSubTab(formId, 0);

  // เติมข้อมูลลงฟอร์ม — ใช้ setTimeout ให้ DOM render ก่อน
  // รอบที่ 1 (150ms): fill ด้วย label-based หรือ index-based ที่มีอยู่
  setTimeout(() => {
    // ถ้ามี __i_ key ให้ใช้ index-based restore โดยตรง (แม่นยำสุด)
    if (formId !== 'f0' && Object.keys(row).some(k => k.startsWith('__i_'))) {
      restoreFormPanel(formId, row);
    } else {
      fillFormWithData(formId, row);
    }

    // คืน visibility ของ tab-content ทุก tab (ที่ซ่อนไว้ตอนเตรียม DOM)
    const panelRestore = document.getElementById('form-' + formId);
    if (panelRestore) {
      panelRestore.querySelectorAll('.tab-content').forEach(tc => {
        tc.style.visibility = '';
        tc.style.pointerEvents = '';
        // คืน display ให้ CSS class จัดการ (active = block, ไม่ active = none)
        if (!tc.classList.contains('active')) tc.style.display = '';
      });
    }

    // แสดง banner แก้ไข
    const panel = document.getElementById('form-' + formId);
    const oldBanner = document.getElementById('edit-mode-banner');
    if (oldBanner) oldBanner.remove();
    const fd = DB2_FORMS.find(f => f.id === formId);
    const banner = document.createElement('div');
    banner.id = 'edit-mode-banner';
    banner.innerHTML = `
      <div style="background:linear-gradient(135deg,#fef3c7,#fff7ed);border:2px solid #f59e0b;border-radius:12px;
        padding:14px 18px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div>
          <div style="font-weight:800;color:#92400e;font-size:15px;">✏️ โหมดแก้ไขข้อมูล</div>
          <div style="font-size:13px;color:#b45309;margin-top:2px;">${fd ? fd.emoji+' '+fd.name : formId.toUpperCase()} — ${schoolName}</div>
          <div style="font-size:12px;color:#78716c;margin-top:4px;">แก้ไขข้อมูลในฟอร์มด้านล่าง แล้วกดปุ่มบันทึกที่ท้ายฟอร์ม</div>
        </div>
        <button onclick="cancelEditMode()" style="background:#fff;border:1.5px solid #f59e0b;color:#92400e;
          padding:8px 16px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;">
          ✕ ยกเลิกการแก้ไข
        </button>
      </div>`;
    panel.insertBefore(banner, panel.firstChild);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(`✏️ โหลดข้อมูลเดิมแล้ว — แก้ไขได้เลยครับ`);

    // รอบที่ 2: แสดงทุก tab พร้อมกัน fill ข้อมูล แล้วซ่อนกลับ
    // ไม่วน loop ทีละ tab เพื่อไม่ให้ UI ค้างและ tab navigation พัง
    if (formId !== 'f0') {
      const panel2 = document.getElementById('form-' + formId);
      if (panel2) {
        const hasSnapshot = Object.keys(row).some(k => k.startsWith('__i_'));
        setTimeout(() => {
          // แสดงทุก tab-content พร้อมกัน (visibility:hidden ไม่ block DOM)
          const allTabs = panel2.querySelectorAll('.tab-content');
          allTabs.forEach(tc => {
            tc.style.display = 'block';
            tc.style.visibility = 'hidden';
          });
          // Fill ข้อมูลครั้งเดียวในขณะที่ทุก tab visible
          if (hasSnapshot) {
            restoreFormPanel(formId, row);
          } else {
            fillFormWithData(formId, row);
            const snap = serializeFormPanel(formId);
            Object.assign(row, snap);
          }
          // คืนค่า display ให้ CSS class จัดการ แล้วกลับ tab แรก
          allTabs.forEach(tc => {
            tc.style.display = '';
            tc.style.visibility = '';
          });
          showSubTab(formId, 0);
          showToast('✅ โหลดข้อมูลครบทุกหน้าแล้ว');
        }, 200);
      }
    }
  }, 150);
}

function cancelEditMode() {
  isEditMode = false;
  currentEditFormId = null;
  currentEditSchoolName = null;
  currentEditEntryId = null;
  const banner = document.getElementById('edit-mode-banner');
  if (banner) banner.remove();
  // reset ฟอร์ม
  document.querySelectorAll('#formModeView input[type=text],#formModeView textarea').forEach(el => el.value = '');
  document.querySelectorAll('#formModeView input[type=checkbox],#formModeView input[type=radio]').forEach(el => el.checked = false);
  showToast('ยกเลิกการแก้ไขแล้ว');
}

function downloadFormPDF(schoolName, formId, entryId) {
  const fd  = DB2_FORMS.find(f => f.id === formId);
  const row = findFormRow(schoolName, formId, entryId);
  if (!row) { showToast('⚠️ ไม่พบข้อมูลของฟอร์มนี้'); return; }

  // F0 ใช้เทมเพลตเดิมที่ออกแบบไว้แล้ว (สวยกว่า, ครบหมวดหมู่)
  if (formId === 'f0') {
    const idx = allResponsesData.indexOf(row);
    if (idx >= 0) { downloadSinglePDF(idx); return; }
  }

  // F1–F5: สร้าง PDF โดย "ไล่อ่านจากฟอร์มจริงตามลำดับข้อ" เสมอ (เรียงตรง + ครบ)
  // ขั้นตอน: สำรองสภาพฟอร์มปัจจุบัน -> เติมข้อมูลของแถวนี้เข้าฟอร์ม
  //          (ใช้ snapshot ถ้ามีของจริง ไม่งั้นสร้างใหม่จากคอลัมน์ด้วย restoreFromSchema)
  //          -> อ่านออกมาเป็น PDF -> คืนสภาพฟอร์มเดิม
  let html = '';
  let usedLive = false;
  const panel = document.getElementById('form-' + formId);
  if (panel) {
    let backup = null;
    try { backup = serializeFormPanel(formId); } catch (e) {}
    try {
      let filled = false;
      // 1) snapshot ของจริง (มี key __i_/__ri_/__c_)
      if (row['__snapshot__']) {
        try {
          const snap = (typeof row['__snapshot__'] === 'string') ? JSON.parse(row['__snapshot__']) : row['__snapshot__'];
          const isReal = snap && typeof snap === 'object' &&
            Object.keys(snap).some(k => k.startsWith('__i_') || k.startsWith('__ri_') || k.startsWith('__c_'));
          if (isReal) { restoreFormPanel(formId, snap); filled = true; }
        } catch (e) { console.warn('pdf snapshot parse fail', e); }
      }
      // 2) ข้อมูลที่มี index snapshot กระจายใน row (เซสชันเดียวกัน)
      if (!filled && Object.keys(row).some(k => k.startsWith('__i_'))) {
        restoreFormPanel(formId, row); filled = true;
      }
      // 3) สร้างใหม่จากคอลัมน์มาตรฐาน (ข้อมูลเก่าที่ไม่มี snapshot) — รวมตาราง/เรดิโอ
      if (!filled) { restoreFromSchema(formId, row); filled = true; }

      html = buildPDFFromLiveForm(formId, schoolName);
      usedLive = true;
    } catch (e) {
      console.warn('buildPDFFromLiveForm fail, fallback to legacy template', e);
    } finally {
      if (backup) { try { restoreFormPanel(formId, backup); } catch (e) {} }
    }
  }

  if (!usedLive) {
    // last resort: เทมเพลตเดิม / generic
    const formTemplates = { f1: buildPDF_F1, f2: buildPDF_F2, f3: buildPDF_F3, f4: buildPDF_F4, f5: buildPDF_F5 };
    const buildFn = formTemplates[formId];
    if (buildFn) {
      html = buildFn(row, schoolName);
    } else {
      const skipKeys = ['rowIndex', 'Timestamp', 'timestamp', '__snapshot__'];
      const rowsHtml = Object.entries(row)
        .filter(([k, v]) => !skipKeys.includes(k) && !k.startsWith('__') && v !== undefined && v !== null && String(v).trim() !== '')
        .map(([k, v]) => `<tr><td style="width:32%;font-weight:bold;background:#f8fafc;">${k}</td><td style="white-space:pre-wrap;">${String(v).replace(/</g,'&lt;')}</td></tr>`)
        .join('');
      html = `<h2>${fd ? fd.name : formId.toUpperCase()}</h2>
      <h3>โครงการจัดการเรียนรู้ด้วยการศึกษาทางไกลผ่านดาวเทียม (DLTV) — ${schoolName}</h3>
      <table class="pdf-table">${rowsHtml}</table>`;
    }
  }

  let area = document.getElementById('generic-pdf-print-area');
  if (area) area.remove();
  area = document.createElement('div');
  area.id = 'generic-pdf-print-area';
  area.className = 'generic-pdf-print';
  area.innerHTML = html;
  document.body.appendChild(area);
  area.style.display = 'block';

  const oldTitle = document.title;
  document.title = `DLTV_${formId.toUpperCase()}_${schoolName}`;
  document.fonts.ready.then(() => {
    window.print();
    document.title = oldTitle;
    area.remove();
  });
}

// ─────────────────────────────────────────────
// PDF BUILDER HELPERS — อิงจากชื่อ column ใน gs.txt
// ─────────────────────────────────────────────
function pv(row, key) {
  const v = row[key];
  return (v !== undefined && v !== null && String(v).trim() !== '') ? String(v).replace(/</g,'&lt;').replace(/\n/g,'<br>') : '<span style="color:#94a3b8;">—</span>';
}
function pRow2(label1, val1, label2, val2) {
  return `<tr><td><span class="p-label">${label1}:</span> <strong>${val1}</strong></td>
  <td><span class="p-label">${label2}:</span> <strong>${val2}</strong></td></tr>`;
}
function pRow1(label, val) {
  return `<tr><td colspan="2"><span class="p-label">${label}:</span> <strong>${val}</strong></td></tr>`;
}
function pFindingRow(label, key, row) {
  return `<tr><td style="width:38%;font-weight:700;background:#f8fafc;color:#1e3a8a;">${label}</td><td style="white-space:pre-wrap;">${pv(row,key)}</td></tr>`;
}
function pHeader(formLabel, formName, schoolName) {
  return `
  <div style="text-align:center;border-bottom:3px solid #1e3a8a;padding-bottom:12px;margin-bottom:16px;">
    <div style="font-size:11pt;color:#64748b;margin-bottom:4px;">โครงการจัดการเรียนรู้ด้วยการศึกษาทางไกลผ่านดาวเทียม (DLTV)</div>
    <div style="font-size:18pt;font-weight:800;color:#1e3a8a;">${formLabel} ${formName}</div>
    <div style="font-size:12pt;color:#334155;margin-top:6px;">${schoolName}</div>
  </div>`;
}
function pSectionTitle(title) {
  return `<div class="p-title">${title}</div>`;
}
function pSigTable(name1, pos1, date1, name2, pos2, date2) {
  const sig1 = `<td style="text-align:center;padding:10px;vertical-align:top;width:50%;"><div>ลงชื่อ ..................................................</div><div>( ${name1} )</div><div style="color:#64748b;font-size:10pt;">ตำแหน่ง: ${pos1}</div><div style="color:#64748b;font-size:10pt;">วันที่: ${date1}</div></td>`;
  const sig2 = name2 ? `<td style="text-align:center;padding:10px;vertical-align:top;width:50%;"><div>ลงชื่อ ..................................................</div><div>( ${name2} )</div><div style="color:#64748b;font-size:10pt;">ตำแหน่ง: ${pos2}</div><div style="color:#64748b;font-size:10pt;">วันที่: ${date2}</div></td>` : '';
  return `<table style="width:100%;border-collapse:collapse;margin-top:32px;">${sig1}${sig2}</table>`;
}

function buildPDF_F1(row, school) {
  return pHeader('F2','แบบสังเกตความเข้าใจของนักเรียนปลายทาง ผ่านเทปออกอากาศของครูต้นทาง', school)
  + pSectionTitle('1. ข้อมูลการสังเกต')
  + `<table class="p-row2col">`
  + pRow2('ผู้ใช้แบบสังเกต', pv(row,'ผู้ใช้แบบสังเกต'), 'โรงเรียนปลายทาง', pv(row,'โรงเรียนปลายทาง'))
  + pRow2('จังหวัด', pv(row,'จังหวัด'), 'สพท.', pv(row,'สำนักงานเขตพื้นที่การศึกษา'))
  + pRow2('วันที่สังเกต', pv(row,'วันที่สังเกต'), 'ระดับชั้น/ห้อง', pv(row,'ระดับชั้น')+'/'+pv(row,'ห้อง'))
  + pRow2('จำนวนนักเรียน', pv(row,'จำนวนนักเรียน(คน)'), 'ชื่อครูต้นทาง', pv(row,'ชื่อครูต้นทางเจ้าของเทป'))
  + pRow2('ชื่อครูปลายทาง', pv(row,'ชื่อครูปลายทาง'), 'ผู้สังเกต', pv(row,'ผู้สังเกต'))
  + pRow2('ตำแหน่ง/บทบาท', pv(row,'ตำแหน่ง/บทบาทผู้สังเกต'), 'วันที่ออกอากาศ', pv(row,'วันที่ออกอากาศ'))
  + pRow2('รายวิชา/ตอน', pv(row,'ชื่อรายวิชา/ตอน'), 'ช่วงเวลา (นาที)', pv(row,'นาทีที่เริ่ม')+' – '+pv(row,'ถึงนาทีที่'))
  + pRow1('จุดประสงค์การเรียนรู้', pv(row,'จุดประสงค์การเรียนรู้'))
  + `</table>`
  + pSectionTitle('2. สรุปข้อค้นพบสำคัญ (ข้อ 14)')
  + `<table class="pdf-table">`
  + pFindingRow('14.1 นักเรียนเข้าใจดีในประเด็นใด','14.1_นักเรียนเข้าใจดีในประเด็นใด',row)
  + pFindingRow('14.2 นักเรียนยังไม่เข้าใจประเด็นใด','14.2_นักเรียนยังไม่เข้าใจประเด็นใด',row)
  + pFindingRow('14.3 สาเหตุสำคัญ','14.3_สาเหตุสำคัญ',row)
  + pFindingRow('14.4 เทปควรปรับช่วงใด','14.4_เทปควรปรับช่วงใด',row)
  + pFindingRow('14_ความเห็นเพิ่มเติม','14_ความเห็นเพิ่มเติม',row)
  + `</table>`
  + pSigTable(pv(row,'ลงนาม_ผู้สังเกต'), pv(row,'ลงนาม_ตำแหน่ง'), pv(row,'ลงนาม_วันที่'), '', '', '');
}

function buildPDF_F2(row, school) {
  // แสดงเรตติ้งแกนสังเกตในรูปตาราง
  function ratingRow(label, key) {
    const v = pv(row, key);
    return `<tr><td style="width:60%;font-size:10pt;">${label}</td><td style="width:40%;text-align:center;font-size:10pt;">${v}</td></tr>`;
  }
  function ratingSection(title, pairs) {
    return `<div style="margin:8px 0;"><div style="font-weight:700;color:#1e3a8a;font-size:11pt;margin-bottom:4px;">${title}</div>
    <table class="pdf-table" style="font-size:10pt;">
      <thead><tr><th style="width:60%;">รายการ</th><th style="width:40%;text-align:center;">ระดับ (3/2/1)</th></tr></thead>
      <tbody>${pairs.map(([lbl,key]) => ratingRow(lbl,key)).join('')}</tbody>
    </table></div>`;
  }

  return pHeader('F3','แบบสังเกตการกำกับห้องเรียนของครูปลายทาง ระหว่างใช้เทปออกอากาศ', school)
  + pSectionTitle('1. ข้อมูลการสังเกต')
  + `<table class="p-row2col">`
  + pRow2('ผู้ใช้แบบสังเกต', pv(row,'ผู้ใช้แบบสังเกต'), 'โรงเรียนปลายทาง', pv(row,'โรงเรียนปลายทาง'))
  + pRow2('จังหวัด', pv(row,'จังหวัด'), 'สพท.', pv(row,'สำนักงานเขตพื้นที่การศึกษา'))
  + pRow2('วันที่สังเกต', pv(row,'วันที่สังเกต'), 'ระดับชั้น/ห้อง', pv(row,'ระดับชั้น')+'/'+pv(row,'ห้อง'))
  + pRow2('จำนวนนักเรียน', pv(row,'จำนวนนักเรียน(คน)'), 'ชื่อครูต้นทาง', pv(row,'ชื่อครูต้นทางเจ้าของเทป'))
  + pRow2('ชื่อครูปลายทาง', pv(row,'ชื่อครูปลายทางผู้กำกับห้องเรียน'), 'ผู้สังเกต', pv(row,'ผู้สังเกต'))
  + pRow2('ตำแหน่ง/บทบาท', pv(row,'ตำแหน่ง/บทบาทผู้สังเกต'), 'วันที่ออกอากาศ', pv(row,'วันที่ออกอากาศ'))
  + pRow2('รายวิชา/ตอน', pv(row,'ชื่อรายวิชา/ตอน'), 'ช่วงเวลา (นาที)', pv(row,'นาทีที่เริ่ม')+' – '+pv(row,'ถึงนาทีที่'))
  + pRow1('จุดประสงค์การเรียนรู้', pv(row,'จุดประสงค์การเรียนรู้'))
  + `</table>`
  + pSectionTitle('2. ข้อ 6: ความพร้อมก่อนใช้เทป')
  + ratingSection('', [
      ['ห้องเรียนและอุปกรณ์พร้อม','6_ความพร้อม_ร1_ห้องอุปกรณ์พร้อม'],
      ['ครูเตรียมใบงาน','6_ความพร้อม_ร2_ครูเตรียมใบงาน'],
      ['ครูเตรียมนักเรียน','6_ความพร้อม_ร3_ครูเตรียมนักเรียน'],
      ['ครูชี้แจงเป้าหมาย','6_ความพร้อม_ร4_ครูชี้แจงเป้าหมาย'],
      ['ครูชี้แจงสิ่งที่นักเรียนต้องทำ','6_ความพร้อม_ร5_ครูชี้แจงสิ่งที่นักเรียนต้องทำ'],
    ])
  + `<div class="p-block-wrap"><span class="p-block-label">ข้อสังเกตก่อนเปิดเทป:</span><span class="p-block-val">${pv(row,'6_ข้อสังเกตก่อนเปิดเทป')}</span></div>`
  + pSectionTitle('3. แกนสังเกต 7–11')
  + ratingSection('7: การนำเทปไปใช้', [
      ['สอดคล้องจุดประสงค์','7_แกน1_ร1_สอดคล้องจุดประสงค์'],
      ['เลือกช่วงเทปเหมาะสม','7_แกน1_ร2_เลือกช่วงเทปเหมาะสม'],
      ['เทปเชื่อมโยงกิจกรรม','7_แกน1_ร3_เทปเชื่อมโยงกิจกรรม'],
      ['เทป ใบงาน กิจกรรมสัมพันธ์','7_แกน1_ร4_เทปใบงานกิจกรรมสัมพันธ์'],
      ['นักเรียนมีบทบาท','7_แกน1_ร5_ให้โอกาสนักเรียนมีบทบาท'],
    ])
  + ratingSection('8: การสอนเสริม', [
      ['อธิบายเสริมเมื่อไม่เข้าใจ','8_แกน2_ร1_อธิบายเสริมเมื่อไม่เข้าใจ'],
      ['ยกตัวอย่างใกล้ตัว','8_แกน2_ร2_ยกตัวอย่างใกล้ตัว'],
      ['ใช้คำถามช่วยคิด','8_แกน2_ร3_ใช้คำถามช่วยคิดตามเทป'],
      ['ทำภาษายากให้ง่ายขึ้น','8_แกน2_ร4_ทำภาษายากให้เข้าใจง่าย'],
      ['สรุปประเด็นสำคัญ','8_แกน2_ร5_สรุปประเด็นสำคัญเป็นช่วงๆ'],
      ['ใช้คำตอบผิดสอนเสริม','8_แกน2_ร6_ใช้คำตอบผิดเป็นโอกาสสอนเสริม'],
      ['ส่งเสริมกล้าถาม','8_แกน2_ร7_ส่งเสริมให้นักเรียนกล้าถาม'],
    ])
  + pSectionTitle('4. สรุปข้อค้นพบ (ข้อ 15)')
  + `<table class="pdf-table">`
  + pFindingRow('15.1 แนวทางกำกับห้องเรียนที่ได้ผล','15.1_แนวทางกำกับห้องเรียนที่ได้ผล',row)
  + pFindingRow('15.2 วิธีที่ช่วยนักเรียนเข้าใจมากขึ้น','15.2_วิธีที่ช่วยนักเรียนเข้าใจมากขึ้น',row)
  + pFindingRow('15.3 อุปสรรคสำคัญ','15.3_อุปสรรคสำคัญ',row)
  + pFindingRow('15.5 เทป/สื่อควรปรับอะไร','15.5_เทป/สื่อควรปรับอะไร',row)
  + pFindingRow('15.6 แนวปฏิบัติที่ควรขยายผล','15.6_แนวปฏิบัติที่ควรขยายผล',row)
  + pFindingRow('ความเห็นเพิ่มเติม','ความเห็นเพิ่มเติม',row)
  + `</table>`
  + pSigTable(pv(row,'ลงนาม_ผู้สังเกต'), pv(row,'ลงนาม_ตำแหน่ง'), pv(row,'ลงนาม_วันที่'), '', '', '');
}

function buildPDF_F3(row, school) {
  return pHeader('F4','แบบสังเกตการสอนจริงของครูต้นทาง กับบริบทผู้เรียนจริง', school)
  + pSectionTitle('1. ข้อมูลการสังเกต')
  + `<table class="p-row2col">`
  + pRow2('ผู้ใช้แบบสังเกต', pv(row,'ผู้ใช้แบบสังเกต'), 'โรงเรียนปลายทาง', pv(row,'โรงเรียนปลายทาง'))
  + pRow2('จังหวัด', pv(row,'จังหวัด'), 'สพท.', pv(row,'สำนักงานเขตพื้นที่การศึกษา'))
  + pRow2('วันที่สังเกต', pv(row,'วันที่สังเกต'), 'ชื่อครูต้นทาง', pv(row,'ชื่อครูต้นทาง'))
  + pRow2('ชื่อครูปลายทาง', pv(row,'ชื่อครูปลายทางประจำห้อง'), 'ผู้สังเกต', pv(row,'ผู้สังเกต'))
  + pRow2('ตำแหน่ง/บทบาท', pv(row,'ตำแหน่ง/บทบาทผู้สังเกต'), 'ระดับชั้น/ห้อง', pv(row,'ระดับชั้น')+' '+pv(row,'ห้อง'))
  + pRow1('ลักษณะการสอน', pv(row,'ลักษณะการสอน'))
  + pRow1('จุดประสงค์การเรียนรู้', pv(row,'จุดประสงค์การเรียนรู้'))
  + `</table>`
  + pSectionTitle('2. สรุปข้อค้นพบสำคัญ (ข้อ 15)')
  + `<table class="pdf-table">`
  + pFindingRow('15.1 นักเรียนเข้าใจ/ไม่เข้าใจประเด็นใด','15.1_นักเรียนเข้าใจ/ไม่เข้าใจประเด็นใด',row)
  + pFindingRow('15.2 อุปสรรคสำคัญ','15.2_อุปสรรคสำคัญ',row)
  + pFindingRow('15.3 สิ่งที่แตกต่างจากการสอนออกอากาศ','15.3_สิ่งที่แตกต่างจากการสอนออกอากาศ',row)
  + pFindingRow('15.4 ครูต้นทางปรับเฉพาะหน้าอย่างไร','15.4_ครูต้นทางปรับเฉพาะหน้าอย่างไร',row)
  + pFindingRow('15.5 เทป/วิธีสอนควรปรับอะไร','15.5_เทป/วิธีสอนควรปรับอะไร',row)
  + pFindingRow('ความเห็นเพิ่มเติม','ความเห็นเพิ่มเติม',row)
  + `</table>`
  + pSigTable(pv(row,'ลงนาม_ผู้สังเกต'), pv(row,'ลงนาม_ตำแหน่ง'), pv(row,'ลงนาม_วันที่'), '', '', '');
}

function buildPDF_F4(row, school) {
  return pHeader('F5','แบบสอบถามเสียงสะท้อนของนักเรียนปลายทาง ต่อการจัดการเรียนรู้ด้วย DLTV', school)
  + pSectionTitle('1. ข้อมูลทั่วไป')
  + `<table class="p-row2col">`
  + pRow2('โรงเรียน', pv(row,'โรงเรียน'), 'จังหวัด', pv(row,'จังหวัด'))
  + pRow2('ระดับชั้น/ห้อง', pv(row,'ระดับชั้น')+'/'+pv(row,'ห้อง'), 'รายวิชา', pv(row,'รายวิชา'))
  + pRow2('เรื่องที่เรียน', pv(row,'เรื่องที่เรียน'), 'วันที่ตอบแบบสอบถาม', pv(row,'วันที่ตอบแบบสอบถาม'))
  + pRow1('ลักษณะการเรียนในครั้งนี้', pv(row,'ลักษณะการเรียนในครั้งนี้'))
  + `</table>`
  + pSectionTitle('2. สรุปเสียงสะท้อนนักเรียน (ข้อ 6 และ 7)')
  + `<table class="pdf-table">`
  + pFindingRow('6.1 เข้าใจเรื่องใดมากที่สุด','6.1_เข้าใจเรื่องใดมากที่สุด',row)
  + pFindingRow('6.2 ยังไม่เข้าใจเรื่องใด','6.2_ยังไม่เข้าใจเรื่องใด',row)
  + pFindingRow('6.3 สิ่งที่ช่วยให้เรียนได้ดีในวันนี้','6.3_สิ่งที่ช่วยให้เรียนได้ดีในวันนี้',row)
  + pFindingRow('6.4 สิ่งที่อยากให้ครูช่วยเพิ่มเติม','6.4_สิ่งที่อยากให้ครูช่วยเพิ่มเติม',row)
  + pFindingRow('6.5 คะแนนความเข้าใจตนเอง','6.5_คะแนนความเข้าใจตนเอง',row)
  + pFindingRow('7. จำนวนนักเรียนที่ตอบ','7_จำนวนนักเรียนที่ตอบ',row)
  + pFindingRow('7. ข้อค้นพบจากเสียงสะท้อน','7_ข้อค้นพบจากเสียงสะท้อน',row)
  + `</table>`
  + pSigTable(pv(row,'ลงนาม_ผู้รวบรวมข้อมูล'), pv(row,'ลงนาม_ตำแหน่ง'), pv(row,'ลงนาม_วันที่'), '', '', '');
}

function buildPDF_F5(row, school) {
  return pHeader('F6','แบบสะท้อนผลรวมหลังการลงพื้นที่ / หลังการประชุม PLC', school)
  + pSectionTitle('1. ข้อมูลทั่วไป')
  + `<table class="p-row2col">`
  + pRow2('โรงเรียนปลายทาง', pv(row,'โรงเรียนปลายทาง'), 'จังหวัด', pv(row,'จังหวัด'))
  + pRow2('สพท.', pv(row,'สำนักงานเขตพื้นที่การศึกษา'), 'ระดับชั้น/รายวิชา', pv(row,'ระดับชั้น/รายวิชาที่เกี่ยวข้อง'))
  + pRow2('วันที่ลงพื้นที่', pv(row,'วันที่ลงพื้นที่'), 'วันที่ประชุม PLC', pv(row,'วันที่ประชุม PLC/สะท้อนผล'))
  + pRow2('ชื่อครูต้นทาง', pv(row,'ชื่อครูต้นทาง'), 'ชื่อครูปลายทาง', pv(row,'ชื่อครูปลายทาง'))
  + pRow2('ผู้บันทึก', pv(row,'ผู้บันทึกผลการสะท้อน'), 'ตำแหน่ง/บทบาท', pv(row,'ตำแหน่ง/บทบาท'))
  + `</table>`
  + pSectionTitle('2. บริบทสำคัญ (ข้อ 5)')
  + `<div class="p-block-wrap"><span class="p-block-label">5.1 บริบทสำคัญที่ส่งผลต่อการใช้ DLTV:</span><span class="p-block-val">${pv(row,'5.1_บริบทสำคัญที่ส่งผลต่อการใช้DLTV')}</span></div>`
  + pSectionTitle('3. สรุปภาพรวมข้อค้นพบ (ข้อ 12)')
  + `<table class="pdf-table">`
  + pFindingRow('12.1 ข้อค้นพบสำคัญที่สุด','12.1_ข้อค้นพบสำคัญที่สุด',row)
  + pFindingRow('12.2 บทเรียนสำคัญสำหรับการพัฒนา DLTV','12.2_บทเรียนสำคัญสำหรับการพัฒนา DLTV',row)
  + pFindingRow('12.3 ข้อเสนอหลักที่ควรดำเนินการต่อ','12.3_ข้อเสนอหลักที่ควรดำเนินการต่อ',row)
  + `</table>`
  + pSigTable(pv(row,'ลงนาม_ผู้บันทึก'), pv(row,'ลงนาม_ตำแหน่งผู้บันทึก'), pv(row,'ลงนาม_วันที่ผู้บันทึก'),
              pv(row,'ลงนาม_ผู้รับรอง'), pv(row,'ลงนาม_ตำแหน่งผู้รับรอง'), pv(row,'ลงนาม_วันที่ผู้รับรอง'));
}


function closeSuccessPopup() { document.getElementById('successOverlay').classList.remove('show'); }

// แสดง popup แจ้งเตือนเด่นชัดทุกครั้งที่บันทึกข้อมูลสำเร็จ (ใช้ร่วมกันทุกฟอร์ม F0–F5)
function showSuccessPopup(schoolName, formLabel, isWarning) {
  const titleEl = document.getElementById('successTitle');
  const circleEl = document.querySelector('#successOverlay .check-circle');
  if (isWarning) {
    titleEl.textContent = '⏱️ ส่งข้อมูลแล้ว (รอผลยืนยัน)';
    titleEl.style.color = '#b45309';
    if (circleEl) circleEl.style.background = 'linear-gradient(135deg,#d97706,#f59e0b)';
  } else {
    titleEl.textContent = '✅ บันทึกข้อมูลสำเร็จ!';
    titleEl.style.color = '#15803d';
    if (circleEl) circleEl.style.background = 'linear-gradient(135deg,#16a34a,#22c55e)';
  }
  document.getElementById('successFormLabel').textContent = formLabel || '';
  document.getElementById('successSchoolName').textContent = schoolName || 'โรงเรียน';
  document.getElementById('successOverlay').classList.add('show');
}

function downloadSinglePDF(index) {
  const item = allResponsesData[index];
  if(!item) return;

  // Helper: ดึงค่าโดยลองทั้ง key ใหม่ (gs.txt) และ key เก่า (legacy)
  function gv(newKey, oldKey) {
    return item[newKey] || item[oldKey] || '';
  }

  const fields = {
    'p_inf_name':    gv('2_ชื่อ-นามสกุลผู้ให้ข้อมูล', 'ผู้ให้ข้อมูล_ชื่อ'),
    'p_inf_pos':     gv('2_ตำแหน่ง', 'ผู้ให้ข้อมูล_ตำแหน่ง'),
    'p_role':        gv('2_บทบาทผู้ให้ข้อมูล', 'ผู้ให้ข้อมูล_สถานะ'),
    'p_inf_tel':     gv('2_โทรศัพท์ผู้ให้ข้อมูล', 'ผู้ให้ข้อมูล_เบอร์โทร'),
    'p_inf_email':   gv('2_อีเมล', 'ผู้ให้ข้อมูล_อีเมล'),
    'p_inf_date':    gv('2_วันที่ให้ข้อมูล', 'ผู้ให้ข้อมูล_วันที่บันทึก'),
    'p_sch_name':    gv('3.1_ชื่อโรงเรียน', 'ชื่อโรงเรียน'),
    'p_sch_code':    gv('3.1_รหัสโรงเรียน10หลัก', 'รหัสโรงเรียน'),
    'p_sch_area':    gv('3.1_สำนักงานเขตพื้นที่การศึกษา', 'สำนักงานเขตพื้นที่'),
    'p_sch_t':       gv('3.1_ตำบล', 'ตำบล'),
    'p_sch_a':       gv('3.1_อำเภอ', 'อำเภอ'),
    'p_sch_j':       gv('3.1_จังหวัด', 'จังหวัด'),
    'p_sch_z':       gv('3.1_รหัสไปรษณีย์', 'รหัสไปรษณีย์'),
    'p_sch_types':   gv('3.1_ประเภทโรงเรียน', 'ประเภทโรงเรียน_รวม'),
    'p_room_styles': gv('3.2_ลักษณะการจัดชั้นเรียน', 'ลักษณะชั้นเรียน_รวม'),
    'p_room_limit':  gv('3.2_รายละเอียดข้อจำกัดห้องเรียน', 'ลักษณะชั้นเรียน_รายละเอียดข้อจำกัด'),
    'p_has_dir':     gv('3.3_ผู้อำนวยการ/ครูใหญ่', 'ผอ_ครูใหญ่'),
    'p_c_deputy':    gv('3.3_จำนวนรองผอ(คน)', 'จำนวนรองผอ'),
    'p_c_tch':       gv('3.3_จำนวนครูทั้งหมด(คน)', 'จำนวนครูทั้งหมด'),
    'p_c_con':       gv('3.3_จำนวนครูอัตราจ้าง(คน)', 'จำนวนครูอัตราจ้าง'),
    'p_c_adm':       gv('3.3_จำนวนเจ้าหน้าที่ธุรการ(คน)', 'จำนวนธุรการ'),
    'p_usage_styles':  gv('4.1_ลักษณะการใช้DLTV', 'ภาพรวมการใช้_รวม'),
    'p_teacher_roles': gv('4.3_บทบาทครูปลายทาง', 'บทบาทครูปลายทาง_รวม'),
    'p_prep_styles':   gv('4.4_การเตรียมการก่อนใช้DLTV', 'การเตรียมการก่อนใช้_รวม'),
    'p_follow_styles': gv('4.5_การติดตามผลการเรียนรู้', 'การติดตามผลหลังเรียน_รวม'),
    'p_watch_channels':gv('5.1_ช่องทางรับชมDLTV', 'ช่องทางรับชม_รวม'),
    'p_maint_style':   gv('5.5_แนวทางการดูแลและซ่อมบำรุง', 'แนวทางซ่อมบำรุงหลังประกัน'),
    'p_std_context': (gv('6_ลักษณะผู้เรียนและข้อจำกัด','ลักษณะผู้เรียน_รวม')) + ' ' + (item['6_ลักษณะผู้เรียนและข้อจำกัด2'] || item['ข้อจำกัดสำคัญ_รวม'] || ''),
    'p_tch_know':    gv('6_สิ่งที่ครูต้นทางควรรู้เกี่ยวกับผู้เรียน', 'ครูต้นทางควรรับรู้'),
    'p_strength':    gv('7_จุดแข็งในการใช้DLTV', 'จุดแข็งโรงเรียน'),
    'p_sup_needs':   (gv('7_ปัญหาอุปสรรคและความต้องการสนับสนุน','ปัญหาอุปสรรค')),
    'p_sig1_n':      gv('ลงนาม_ผู้ให้ข้อมูล', 'ลงนาม_ผู้ให้ข้อมูล'),
    'p_sig1_p':      gv('ลงนาม_ตำแหน่ง', 'ลงนาม_ตำแหน่งผู้ให้'),
    'p_sig1_d':      gv('ลงนาม_วันที่', 'ลงนาม_วันที่ผู้ให้'),
    'p_sig2_n':      gv('ลงนาม_ผู้บริหารรับรอง', 'ลงนาม_ผู้รับข้อมูล'),
    'p_sig2_p':      gv('ลงนาม_ตำแหน่งผู้บริหาร', 'ลงนาม_ตำแหน่งผู้รับ'),
    'p_sig2_d':      gv('ลงนาม_วันที่ผู้บริหาร', 'ลงนาม_วันที่ผู้รับ')
  };

  for(let id in fields) {
    const el = document.getElementById(id);
    if(el) el.innerText = fields[id] || '-';
  }

  const nl2br = (s) => (s || '-').replace(/\n/g, '<br>');
  document.getElementById('p_s8_1').innerHTML = nl2br(item['8.1_บริบทสำคัญของโรงเรียน'] || item.S8_บริบทสำคัญ);
  document.getElementById('p_s8_2').innerHTML = nl2br(item['8.2_ข้อจำกัดสำคัญในการเรียนรู้'] || item.S8_ข้อจำกัดการเรียน);
  document.getElementById('p_s8_3').innerHTML = nl2br(item['8.3_สิ่งที่ครูต้นทางควรคำนึงถึง'] || item.S8_ข้อควรคำนึงถึง);
  document.getElementById('p_s8_4').innerHTML = nl2br(item['8.4_ข้อเสนอเบื้องต้นเพื่อสนับสนุน'] || item.S8_ข้อเสนอแนะเบื้องต้น);

  const listFields = {
    'p_major_list':    item['3.3_ครูตรงเอก_หมายเหตุ'] || item.ตารางครูตรงวิชาเอก_รวม,
    'p_academic_list': item['4.2_ระดับชั้นและรายวิชาที่ใช้DLTV(JSON)'] || item.ตารางวิชาการแยกชั้นปี_รวม,
    'p_hw_list':       item['5.2-5.3_สถานะอุปกรณ์รายชั้น(JSON)'] || item.ตารางอุปกรณ์ทีวีและกล่อง_รวม,
    'p_infra_list':    item['5.4_โครงสร้างพื้นฐาน(JSON)'] || item.ตารางโครงสร้างพื้นฐาน_รวม
  };
  for(let id in listFields) {
    const el = document.getElementById(id);
    if(el && listFields[id]) {
      el.innerHTML = listFields[id].split(' | ').map(t => `<div style="margin-bottom:2px;">• ${t}</div>`).join('');
    } else if(el) el.innerText = '-';
  }

  const element = document.getElementById('pdf-print-area');
  element.style.display = 'block';
  
  // Set temporary document title for filename when saving as PDF
  const oldTitle = document.title;
  document.title = `DLTV_Context_${item['3.1_ชื่อโรงเรียน'] || item.ชื่อโรงเรียน || 'โรงเรียน'}`;
  
  document.fonts.ready.then(() => {
    window.print();
    document.title = oldTitle;
    element.style.display = 'none';
  });
}

// ============================================================
// MULTI-FORM SYSTEM: switchForm, showSubTab, Save/Load, Dashboard
// ============================================================

// --- Form Switcher ---
function switchForm(formId) {
  document.querySelectorAll('.form-panel').forEach(p => p.classList.remove('active-panel'));
  document.querySelectorAll('.form-launcher-card').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById('form-' + formId);
  if (panel) panel.classList.add('active-panel');
  const btns = document.querySelectorAll('.form-launcher-card');
  btns.forEach(b => { if (b.getAttribute('onclick') && b.getAttribute('onclick').includes("'" + formId + "'")) b.classList.add('active'); });
  currentFormId = formId;
  updateStepBreadcrumb();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- Sub-tab switcher for each form ---
function showSubTab(formId, idx) {
  const panel = document.getElementById('form-' + formId);
  if (!panel) return;
  panel.querySelectorAll('.tab-content').forEach((c, i) => {
    c.classList.toggle('active', i === idx);
  });
  panel.querySelectorAll('.tabs .tab').forEach((t, i) => {
    t.classList.toggle('active', i === idx);
  });
  updateStepBreadcrumb();
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// --- Sticky breadcrumb: shows which form + which step the user is on ---
const FORM_LABELS = {
  f0: { emoji:'🏫', name:'บันทึกบริบทโรงเรียน' },
  f1: { emoji:'👁️', name:'สังเกตความเข้าใจนักเรียน' },
  f2: { emoji:'🏫', name:'กำกับห้องเรียนครูปลายทาง' },
  f3: { emoji:'👨‍🏫', name:'สังเกตการสอนครูต้นทาง' },
  f4: { emoji:'💬', name:'เสียงสะท้อนนักเรียน' },
  f5: { emoji:'📊', name:'สะท้อนผลรวม PLC' },
};
function updateStepBreadcrumb() {
  const fId = (typeof currentFormId !== 'undefined' && currentFormId) ? currentFormId : 'f0';
  const panel = document.getElementById('form-' + fId);
  const bc = document.getElementById('stepBreadcrumb');
  if (!panel || !bc) return;
  const tabs = panel.querySelectorAll('.tabs .tab');
  const activeIdx = Array.from(tabs).findIndex(t => t.classList.contains('active'));
  const total = tabs.length;
  const info = FORM_LABELS[fId] || { emoji:'📝', name: fId.toUpperCase() };
  const formEl = document.getElementById('sbFormText') || document.querySelector('.sb-form');
  if (formEl) formEl.textContent = info.emoji + ' ' + fId.toUpperCase() + ' · ' + info.name;
  const stepEl = document.getElementById('sbStepText');
  const fillEl = document.getElementById('sbFill');
  if (total > 0) {
    const stepNum = activeIdx >= 0 ? activeIdx + 1 : 1;
    if (stepEl) stepEl.textContent = 'ขั้นตอนที่ ' + stepNum + ' / ' + total;
    if (fillEl) fillEl.style.width = Math.round((stepNum / total) * 100) + '%';
    bc.style.display = 'flex';
  } else {
    bc.style.display = 'none';
  }
}
let currentFormId = 'f0';

// --- Auto-save to localStorage ---
function getFormData(formId) {
  const panel = document.getElementById('form-' + formId);
  if (!panel) return {};
  const data = {};
  panel.querySelectorAll('input[type=text], input[type=number], input[type=date], textarea, select').forEach((el, i) => {
    const key = el.id || (formId + '_field_' + i);
    data[key] = el.value;
  });
  panel.querySelectorAll('input[type=radio]:checked').forEach(el => {
    if (el.name) data['radio_' + el.name] = el.value;
  });
  panel.querySelectorAll('input[type=checkbox]').forEach((el, i) => {
    const key = 'cb_' + (el.name || formId + '_cb_' + i) + '_' + i;
    data[key] = el.checked;
  });
  return data;
}

function restoreFormData(formId) {
  const saved = localStorage.getItem('dltv_form_' + formId);
  if (!saved) return;
  try {
    const data = JSON.parse(saved);
    const panel = document.getElementById('form-' + formId);
    if (!panel) return;
    panel.querySelectorAll('input[type=text], input[type=number], input[type=date], textarea, select').forEach((el, i) => {
      const key = el.id || (formId + '_field_' + i);
      if (data[key] !== undefined) el.value = data[key];
    });
    panel.querySelectorAll('input[type=radio]').forEach(el => {
      if (el.name && data['radio_' + el.name] !== undefined) {
        el.checked = (el.value === data['radio_' + el.name]);
      }
    });
    panel.querySelectorAll('input[type=checkbox]').forEach((el, i) => {
      const key = 'cb_' + (el.name || formId + '_cb_' + i) + '_' + i;
      if (data[key] !== undefined) el.checked = data[key];
    });
  } catch(e) { console.warn('Restore error', formId, e); }
}

function saveFormData(formId) {
  const data = getFormData(formId);
  localStorage.setItem('dltv_form_' + formId, JSON.stringify(data));
  showToast('💾 บันทึกข้อมูลแบบฟอร์มแล้ว');
}

function clearFormData(formId) {
  if (!confirm('ล้างข้อมูลทั้งหมดในแบบฟอร์มนี้?')) return;
  localStorage.removeItem('dltv_form_' + formId);
  const panel = document.getElementById('form-' + formId);
  if (!panel) return;
  panel.querySelectorAll('input[type=text], input[type=number], textarea').forEach(el => el.value = '');
  panel.querySelectorAll('input[type=date]').forEach(el => el.value = '');
  panel.querySelectorAll('select').forEach(el => el.selectedIndex = 0);
  panel.querySelectorAll('input[type=radio], input[type=checkbox]').forEach(el => el.checked = false);
  showToast('🗑️ ล้างข้อมูลแบบฟอร์มแล้ว');
}

// --- Auto-save on input change ---
function setupAutoSave(formId) {
  const panel = document.getElementById('form-' + formId);
  if (!panel) return;
  let timer;
  panel.addEventListener('change', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const data = getFormData(formId);
      localStorage.setItem('dltv_form_' + formId, JSON.stringify(data));
      updateSaveIndicator(formId);
    }, 800);
  });
  panel.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const data = getFormData(formId);
      localStorage.setItem('dltv_form_' + formId, JSON.stringify(data));
      updateSaveIndicator(formId);
    }, 800);
  });
}

function updateSaveIndicator(formId) {
  const indicator = document.getElementById('save-indicator-' + formId);
  if (indicator) {
    indicator.textContent = '✅ บันทึกอัตโนมัติแล้ว ' + new Date().toLocaleTimeString('th-TH');
    indicator.style.opacity = '1';
    setTimeout(() => { indicator.style.opacity = '0.5'; }, 2000);
  }
}

// --- Toast notification ---
function showToast(msg) {
  let toast = document.getElementById('dltv-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'dltv-toast';
    toast.style.cssText = 'position:fixed;bottom:28px;right:28px;background:#1e293b;color:#fff;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);transition:opacity 0.4s;pointer-events:none;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 2500);
}

// upgradeDashboard removed — dashboard v2 handles all rendering

