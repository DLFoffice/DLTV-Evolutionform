// ============================================================
//  เก็บข้อมูลฟอร์ม f1-f5 อัตโนมัติ + ส่งเข้า Google Sheets
//  (ใช้ mode "dynamic" เหมือน f0 — ไม่ต้องไปไล่ผูกชื่อ field กับ
//   SHEET_HEADERS ทีละตัว ป้องกันปัญหาข้อมูลเข้า Sheet แต่เป็นค่าว่าง)
// ============================================================

function autoCollectPanel(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return {};
  const result = {};

  // Helper: prefer data-key attribute, then label text, as the storage key
  function getKey(el, fallback) {
    return el?.dataset?.key || fallback || 'field';
  }

  // 1. Individual .field containers (text, radio, checkbox, textarea, select)
  panel.querySelectorAll(".field[data-key]").forEach(fieldDiv => {
    const key = fieldDiv.dataset.key;
    if (!key || result[key] !== undefined) return;
    const inputs = fieldDiv.querySelectorAll("input, textarea, select");
    if (!inputs.length) return;
    const first = inputs[0];
    if (first.type === "radio") {
      const checked = fieldDiv.querySelector(`input[name="${first.name}"]:checked`);
      result[key] = checked ? checked.value : "";
    } else if (first.type === "checkbox") {
      const checked = Array.from(fieldDiv.querySelectorAll("input[type=checkbox]:checked"))
        .map(c => c.value || c.closest("label")?.textContent.trim() || "");
      result[key] = checked.join(", ");
    } else {
      result[key] = first.value || "";
    }
  });

  // 2. .cb-group with data-key (checkbox groups / radio groups)
  panel.querySelectorAll(".cb-group[data-key]").forEach(group => {
    const key = group.dataset.key;
    if (!key || result[key] !== undefined) return;
    const checked = Array.from(group.querySelectorAll("input[type=checkbox]:checked, input[type=radio]:checked"))
      .map(c => {
        const lbl = c.closest("label");
        return lbl ? lbl.textContent.trim() : c.value;
      });
    result[key] = checked.join(", ");
  });

  // 3. matrix-table with data-key (observation rating tables)
  panel.querySelectorAll("table.matrix-table[data-key]").forEach(table => {
    const keyPrefix = table.dataset.key;   // e.g. "6_ความพร้อม"
    const evidenceKey = table.dataset.evidenceKey; // e.g. "6_ความพร้อม_หลักฐาน(JSON)"
    const rowsData = [];
    const evidenceRows = [];
    table.querySelectorAll("tbody tr").forEach(tr => {
      const rowKey  = tr.dataset.key || "";   // e.g. "6_ความพร้อม_ร1_ห้องอุปกรณ์พร้อม"
      const rowLabel = tr.querySelector("td:first-child")?.textContent.trim() || "";
      const rowValues = [];
      tr.querySelectorAll("td:not(:first-child)").forEach(td => {
        const radio = td.querySelector("input[type=radio]:checked");
        const text  = td.querySelector("input[type=text], input[type=number]");
        const sel   = td.querySelector("select");
        if (radio) rowValues.push(radio.value);
        else if (text) rowValues.push(text.value);
        else if (sel) rowValues.push(sel.value);
      });
      if (rowKey) {
        // Store individual row rating directly
        result[rowKey] = rowValues.join('/') || "";
      }
      if (rowLabel || rowValues.some(v => v)) {
        rowsData.push(`${rowLabel}: ${rowValues.join('/')}`);
      }
    });
    // Also store evidence/note field if present
    const evidenceInput = table.nextElementSibling?.querySelector?.('textarea, input[type=text]');
    if (evidenceKey && evidenceInput) {
      result[evidenceKey] = evidenceInput.value || "";
    }
    if (keyPrefix && !result[keyPrefix]) {
      result[keyPrefix + "(ตาราง)"] = rowsData.join(' | ');
    }
  });

  // 4. Fallback: fields WITHOUT data-key — use label text (legacy behaviour)
  let counter = {};
  panel.querySelectorAll(".field:not([data-key])").forEach(fieldDiv => {
    const label = fieldDiv.querySelector("label");
    const labelText = label ? (label.childNodes[0]?.textContent.trim() || label.textContent.trim()) : "field";
    const input = fieldDiv.querySelector("input, textarea, select");
    if (!input) return;
    let key = labelText;
    if (counter[key] === undefined) counter[key] = 0;
    else { counter[key]++; key = `${key}_${counter[key] + 1}`; }
    if (result[key] !== undefined) return;
    if (input.type === "radio") {
      const checked = fieldDiv.querySelector(`input[name="${input.name}"]:checked`);
      result[key] = checked ? checked.value : "";
    } else if (input.type === "checkbox") {
      const checked = Array.from(fieldDiv.querySelectorAll("input[type=checkbox]:checked"))
        .map(c => c.value || c.closest("label")?.textContent.trim() || "");
      result[key] = checked.join(", ");
    } else {
      result[key] = input.value || "";
    }
  });

  panel.querySelectorAll(".cb-group:not([data-key])").forEach(group => {
    let titleEl = group.previousElementSibling;
    while (titleEl && !titleEl.matches("label, .section-title, [data-key]")) {
      titleEl = titleEl.previousElementSibling;
    }
    const groupLabel = titleEl ? titleEl.textContent.trim() : "ตัวเลือก";
    let key = groupLabel;
    if (counter[key] === undefined) counter[key] = 0;
    else { counter[key]++; key = `${key}_${counter[key]+1}`; }
    if (result[key] !== undefined) return;
    const checked = Array.from(group.querySelectorAll("input[type=checkbox]:checked, input[type=radio]:checked"))
      .map(c => { const lbl = c.closest("label"); return lbl ? lbl.textContent.trim() : c.value; });
    result[key] = checked.join(", ");
  });

  return result;
}

function autoCollectForm(formPanelId) {
  const formPanel = document.getElementById(formPanelId);
  if (!formPanel) return {};
  let merged = {};
  formPanel.querySelectorAll(".tab-content").forEach(tab => {
    merged = Object.assign(merged, autoCollectPanel(tab.id));
  });
  return merged;
}

// ===== ส่งข้อมูลขึ้น Google Sheets พร้อมระบบกันค้าง (เหมือน f0) =====
async function submitFormGeneric(formId, panelId, btnEl, statusElId) {
  const statusEl = statusElId ? document.getElementById(statusElId) : null;
  if (btnEl) {
    btnEl.disabled = true;
    btnEl.dataset.originalText = btnEl.dataset.originalText || btnEl.innerHTML;
    btnEl.style.opacity = '0.7';
    btnEl.innerHTML = '⏳ กำลังส่งข้อมูล...';
  }
  if (statusEl) statusEl.innerHTML = '<span style="color:orange;">⏳ กำลังบันทึกข้อมูลขึ้น Firebase โปรดรอสักครู่...</span>';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  const watchdogId = setTimeout(() => {
    if (btnEl && btnEl.disabled) {
      btnEl.disabled = false;
      btnEl.style.opacity = '1';
      btnEl.innerHTML = btnEl.dataset.originalText || '✅ บันทึก';
      if (statusEl) statusEl.innerHTML = '<span style="color:red;">⏱️ ใช้เวลานานผิดปกติ — กรุณาลองใหม่อีกครั้ง</span>';
      console.error('[submitFormGeneric] watchdog triggered for', formId);
    }
  }, 20000);

  try {
    const rawData = autoCollectForm(panelId);
    // ★ ใช้ payload แบบ schema (หนึ่งคอลัมน์ต่อข้อ เรียงตาม DOM = ตรงกับ SHEET_HEADERS เป๊ะ)
    //   remapFormData ยังเก็บไว้เผื่อส่วนอื่นเรียกใช้ แต่ไม่ใช้เป็น payload หลักแล้ว
    const data = collectFormPayload(formId);

    // ===== ตรวจสอบช่องจำเป็นก่อนส่ง: ชื่อโรงเรียน =====
    // (แดชบอร์ดจัดกลุ่มข้อมูลด้วยชื่อโรงเรียน ถ้าว่างจะกลายเป็นแถวกำพร้าที่จับกลุ่มไม่ได้)
    if (!db2GetRowSchoolName(data)) {
      clearTimeout(timeoutId); clearTimeout(watchdogId);
      const panel = document.getElementById(panelId);
      const schInput = panel ? panel.querySelector('[data-key="โรงเรียนปลายทาง"] input, [data-key="โรงเรียน"] input') : null;
      if (schInput) {
        schInput.classList.add('field-error');
        schInput.focus();
        schInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        schInput.addEventListener('input', () => schInput.classList.remove('field-error'), { once: true });
      }
      if (btnEl) { btnEl.disabled = false; btnEl.style.opacity = '1'; btnEl.innerHTML = btnEl.dataset.originalText || '✅ บันทึก'; }
      if (statusEl) statusEl.innerHTML = '<span style="color:#dc2626;font-weight:600;">⚠️ กรุณากรอก "ชื่อโรงเรียน" ก่อนบันทึกข้อมูล</span>';
      return;
    }

    // เก็บ snapshot ตามตำแหน่งช่องจริง (index-based) ลงคอลัมน์เดียว __snapshot__
    // เพื่อให้ดึงกลับมาแก้ไข/พิมพ์ PDF ได้ครบและตรงเป๊ะ แม้โหลดจาก Google Sheets
    try { data['__snapshot__'] = JSON.stringify(serializeFormPanel(formId)); } catch(e) { console.warn('snapshot fail', e); }
    data['EntryID'] = (isEditMode && currentEditFormId === formId && currentEditEntryId) ? currentEditEntryId : genEntryId();
    try { localStorage.setItem('dltv_' + formId + '_last_payload', JSON.stringify(data)); } catch(e) {}

    // ===== บันทึกลง Firebase (PUT ตาม EntryID) =====
    await fbWriteEntry(formId, data['EntryID'], data, controller.signal);
    clearTimeout(timeoutId); clearTimeout(watchdogId);
    if (statusEl) statusEl.innerHTML = '<span style="color:green;">✅ บันทึกข้อมูลสำเร็จเรียบร้อย!</span>';

    // ถ้าเป็นโหมดแก้ไข — อัปเดต local data แล้วกลับ dashboard
    if (isEditMode && currentEditFormId === formId && currentEditSchoolName) {
      // จับคู่ด้วย EntryID ของรายการที่กำลังแก้ (กันไปทับรายการของครูคนอื่นในโรงเรียนเดียวกัน)
      const existRow = findFormRow(currentEditSchoolName, formId, currentEditEntryId);
      // เก็บทั้ง label-based (data) และ index-based snapshot ไว้ใน row
      if (existRow) {
        Object.assign(existRow, data);
        // เก็บ index-based snapshot เพื่อให้ restore ครั้งต่อไปแม่นยำ
        const snapshot = serializeFormPanel(formId);
        Object.assign(existRow, snapshot);
      }
      const fd2 = (typeof DB2_FORMS !== 'undefined') ? DB2_FORMS.find(f => f.id === formId) : null;
      const sName = currentEditSchoolName;
      showSuccessPopup(sName, (fd2 ? fd2.emoji + ' ' + fd2.label + ' ' + fd2.name : formId.toUpperCase()));
      const banner = document.getElementById('edit-mode-banner');
      if (banner) banner.remove();
      isEditMode = false; currentEditFormId = null; currentEditSchoolName = null; currentEditEntryId = null;
      const panel2 = document.getElementById(panelId);
      if (panel2) {
        panel2.querySelectorAll('input[type=text],textarea').forEach(el => el.value = '');
        panel2.querySelectorAll('input[type=checkbox],input[type=radio]').forEach(el => el.checked = false);
      }
      // ★ FIX: เดิมโค้ด return ตรงนี้โดยไม่ปลดสถานะปุ่ม ทำให้ปุ่มค้างที่
      //   "⏳ กำลังส่งข้อมูล..." ตลอดไปหลังบันทึกสำเร็จในโหมดแก้ไข (isEditMode)
      //   ต้องปลดล็อกปุ่มเหมือนเส้นทางบันทึกใหม่ปกติ (ดูบรรทัดด้านล่าง ~238)
      if (btnEl) { btnEl.disabled = false; btnEl.style.opacity = '1'; btnEl.innerHTML = btnEl.dataset.originalText || '✅ บันทึก'; }
      setTimeout(() => switchMode('dashboard'), 1400);
      return;
    }

    showToast('✅ บันทึก ' + formId.toUpperCase() + ' เข้า Firebase สำเร็จ');
    const fdMeta = (typeof DB2_FORMS !== 'undefined') ? DB2_FORMS.find(f => f.id === formId) : null;
    const schoolName = (typeof db2GetRowSchoolName === 'function' ? db2GetRowSchoolName(data) : null) || data['ชื่อโรงเรียนปลายทาง'] || data['โรงเรียนปลายทาง'] || data['ชื่อโรงเรียน'] || data['โรงเรียน'] || 'โรงเรียน';

    // บันทึก row ใหม่ลง db2MultiFormData พร้อม index-based snapshot เพื่อให้แก้ไขได้ทันที
    // ★ จับคู่ด้วย EntryID (ไม่ใช่ชื่อโรงเรียน) เพื่อให้ครูหลายคนกรอกฟอร์มเดียวกัน
    //   ให้โรงเรียนเดียวกันได้โดยไม่ทับกัน — ทับเฉพาะตอนแก้ไขรายการเดิม (EntryID เดิม)
    if (typeof db2MultiFormData !== 'undefined' && formId !== 'f0') {
      if (!db2MultiFormData[formId]) db2MultiFormData[formId] = [];
      const eid = String(data['EntryID'] || '');
      const existIdx = eid
        ? db2MultiFormData[formId].findIndex(r => String(r['EntryID'] || r['entryId'] || '') === eid)
        : -1;
      const snapshot = serializeFormPanel(formId);
      const newRow = Object.assign({}, data, snapshot);
      if (existIdx >= 0) { db2MultiFormData[formId][existIdx] = newRow; }
      else { db2MultiFormData[formId].push(newRow); }
    }

    showSuccessPopup(schoolName, (fdMeta ? fdMeta.emoji + ' ' + fdMeta.label + ' ' + fdMeta.name : formId.toUpperCase()));
    if (btnEl) { btnEl.disabled = false; btnEl.style.opacity = '1'; btnEl.innerHTML = btnEl.dataset.originalText || '✅ บันทึก'; }
  } catch (e) {
    clearTimeout(timeoutId); clearTimeout(watchdogId);
    if (btnEl) { btnEl.disabled = false; btnEl.style.opacity = '1'; btnEl.innerHTML = btnEl.dataset.originalText || '✅ บันทึก'; }
    if (e.name === 'AbortError') {
      if (statusEl) statusEl.innerHTML = '<span style="color:#b45309;">⏱️ หมดเวลาการตอบสนอง — ข้อมูลอาจถูกบันทึกแล้ว กรุณาตรวจสอบ Firebase</span>';
      showToast('⏱️ หมดเวลา — ตรวจสอบ Firebase');
      const fdMetaW = (typeof DB2_FORMS !== 'undefined') ? DB2_FORMS.find(f => f.id === formId) : null;
      showSuccessPopup('โรงเรียน', (fdMetaW ? fdMetaW.emoji + ' ' + fdMetaW.label + ' ' + fdMetaW.name : formId.toUpperCase()), true);
    } else {
      if (statusEl) statusEl.innerHTML = '<span style="color:red;">❌ เกิดข้อผิดพลาด: ' + e.message + '</span>';
      showToast('❌ บันทึกไม่สำเร็จ: ' + e.message);
      console.error('[submitFormGeneric]', formId, e);
    }
  }
}


// ════════════════════════════════════════════════════
//  remapFormData — map autoCollect label-keys → gs.txt SHEET_HEADERS column names
//  โครงสร้าง gs.txt ใช้ชื่อ column ที่เฉพาะเจาะจง ต้องส่งให้ตรง
// ════════════════════════════════════════════════════
function remapFormData(formId, rawData) {
  // สำหรับ f0 ทำ mapping ผ่าน submitForm() โดยตรงอยู่แล้ว
  // f1-f5 ใช้ autoCollect → ต้องเพิ่ม mapping เพื่อให้ column ตรงกับ gs.txt

  const schoolName = rawData['ชื่อโรงเรียนปลายทาง'] || rawData['ชื่อโรงเรียน'] || rawData['โรงเรียน'] || '';

  if (formId === 'f1') {
    return Object.assign({
      'ผู้ใช้แบบสังเกต': rawData['โปรดทำเครื่องหมาย ✓ ในช่องที่ตรงกับผู้ใช้แบบสังเกต'] || '',
      'โรงเรียนปลายทาง': schoolName,
      'จังหวัด': rawData['จังหวัด'] || '',
      'สำนักงานเขตพื้นที่การศึกษา': rawData['สำนักงานเขตพื้นที่การศึกษา'] || '',
      'วันที่สังเกต': rawData['วันที่สังเกต'] || '',
      'ระดับชั้น': rawData['ระดับชั้น'] || '',
      'ห้อง': rawData['ห้อง'] || '',
      'จำนวนนักเรียน(คน)': rawData['จำนวนนักเรียน (คน)'] || '',
      'ชื่อครูต้นทางเจ้าของเทป': rawData['ชื่อครูต้นทางเจ้าของเทป'] || '',
      'ชื่อครูปลายทาง': rawData['ชื่อครูปลายทางประจำห้อง'] || '',
      'ผู้สังเกต': rawData['ผู้สังเกต'] || '',
      'ตำแหน่ง/บทบาทผู้สังเกต': rawData['ตำแหน่ง/บทบาทของผู้สังเกต'] || '',
      'วันที่ออกอากาศ': rawData['วันที่ออกอากาศของเทป'] || '',
      'ชื่อรายวิชา/ตอน': rawData['ชื่อรายวิชา / ตอน'] || '',
      'นาทีที่เริ่ม': rawData['เริ่มที่นาทีที่'] || '',
      'ถึงนาทีที่': rawData['ถึงนาทีที่'] || '',
      'จุดประสงค์การเรียนรู้': rawData['จุดประสงค์การเรียนรู้ของช่วงเทปออกอากาศที่ใช้สังเกต'] || '',
      '14.1_นักเรียนเข้าใจดีในประเด็นใด': rawData['14.1 นักเรียนเข้าใจดีในประเด็นใด'] || '',
      '14.2_นักเรียนยังไม่เข้าใจประเด็นใด': rawData['14.2 นักเรียนยังไม่เข้าใจหรือเข้าใจคลาดเคลื่อนในประเด็นใด'] || '',
      '14.3_สาเหตุสำคัญ': rawData['14.3 สาเหตุสำคัญที่ทำให้นักเรียนเข้าใจหรือไม่เข้าใจ'] || '',
      '14.4_เทปควรปรับช่วงใด': rawData['14.4 เทปการสอนควรปรับช่วงใด'] || '',
      '14_ความเห็นเพิ่มเติม': rawData['ความเห็นเพิ่มเติมของผู้สังเกต'] || '',
      'ลงนาม_ผู้สังเกต': rawData['ลงชื่อผู้สังเกต (ชื่อ-นามสกุล)'] || '',
      'ลงนาม_ตำแหน่ง': rawData['ตำแหน่ง / บทบาท'] || '',
      'ลงนาม_วันที่': rawData['วันที่ลงนาม'] || '',
    }, rawData);
  }

  if (formId === 'f2') {
    return Object.assign({
      'ผู้ใช้แบบสังเกต': rawData['โปรดทำเครื่องหมาย ✓ ในช่องที่ตรงกับผู้ใช้แบบสังเกต'] || '',
      'โรงเรียนปลายทาง': schoolName,
      'จังหวัด': rawData['จังหวัด'] || '',
      'สำนักงานเขตพื้นที่การศึกษา': rawData['สำนักงานเขตพื้นที่การศึกษา'] || '',
      'วันที่สังเกต': rawData['วันที่สังเกต'] || '',
      'ระดับชั้น': rawData['ระดับชั้น'] || '',
      'ห้อง': rawData['ห้อง'] || '',
      'จำนวนนักเรียน(คน)': rawData['จำนวนนักเรียน (คน)'] || '',
      'ชื่อครูต้นทางเจ้าของเทป': rawData['ชื่อครูต้นทางเจ้าของเทป'] || '',
      'ชื่อครูปลายทางผู้กำกับห้องเรียน': rawData['ชื่อครูปลายทางผู้กำกับห้องเรียน'] || '',
      'ผู้สังเกต': rawData['ผู้สังเกต'] || '',
      'ตำแหน่ง/บทบาทผู้สังเกต': rawData['ตำแหน่ง/บทบาทของผู้สังเกต'] || '',
      'วันที่ออกอากาศ': rawData['วันที่ออกอากาศ'] || '',
      'ชื่อรายวิชา/ตอน': rawData['ชื่อรายวิชา / ตอน'] || '',
      'นาทีที่เริ่ม': rawData['เริ่มที่นาทีที่'] || '',
      'ถึงนาทีที่': rawData['ถึงนาทีที่'] || '',
      'จุดประสงค์การเรียนรู้': rawData['จุดประสงค์การเรียนรู้'] || '',
      '15.1_แนวทางกำกับห้องเรียนที่ได้ผล': rawData['15.1 ครูปลายทางมีแนวทางกำกับห้องเรียนใดที่ได้ผล'] || '',
      '15.2_วิธีที่ช่วยนักเรียนเข้าใจมากขึ้น': rawData['15.2 วิธีใดช่วยให้นักเรียนเข้าใจหรือมีส่วนร่วมมากขึ้น'] || '',
      '15.3_อุปสรรคสำคัญ': rawData['15.3 อุปสรรคสำคัญของการกำกับห้องเรียนระหว่างใช้เทป'] || '',
      '15.5_เทป/สื่อควรปรับอะไร': rawData['15.5 เทปออกอากาศหรือสื่อประกอบควรปรับอะไรเพื่อช่วยครูปลายทาง'] || '',
      'ความเห็นเพิ่มเติม': rawData['ความเห็นเพิ่มเติมของผู้สังเกต'] || '',
      'ลงนาม_ผู้สังเกต': rawData['ลงชื่อผู้สังเกต (ชื่อ-นามสกุล)'] || '',
      'ลงนาม_ตำแหน่ง': rawData['ตำแหน่ง / บทบาท'] || '',
      'ลงนาม_วันที่': rawData['วันที่ลงนาม'] || '',
    }, rawData);
  }

  if (formId === 'f3') {
    return Object.assign({
      'ผู้ใช้แบบสังเกต': rawData['โปรดทำเครื่องหมาย ✓ ในช่องที่ตรงกับผู้ใช้แบบสังเกต'] || '',
      'โรงเรียนปลายทาง': schoolName,
      'จังหวัด': rawData['จังหวัด'] || '',
      'สำนักงานเขตพื้นที่การศึกษา': rawData['สำนักงานเขตพื้นที่การศึกษา'] || '',
      'วันที่สังเกต': rawData['วันที่สังเกต'] || '',
      'ชื่อครูต้นทาง': rawData['ชื่อครูต้นทาง'] || '',
      'ชื่อครูปลายทางประจำห้อง': rawData['ชื่อครูปลายทางประจำห้อง'] || '',
      'ผู้สังเกต': rawData['ผู้สังเกต'] || '',
      'ตำแหน่ง/บทบาทผู้สังเกต': rawData['ตำแหน่ง/บทบาทของผู้สังเกต'] || '',
      'ลักษณะการสอน': rawData['ลักษณะการสอนในคาบนี้'] || '',
      'จุดประสงค์การเรียนรู้': rawData['จุดประสงค์การเรียนรู้ของคาบนี้'] || '',
      '15.1_นักเรียนเข้าใจ/ไม่เข้าใจประเด็นใด': rawData['15.1 นักเรียนเข้าใจหรือไม่เข้าใจประเด็นใด'] || '',
      '15.2_อุปสรรคสำคัญ': rawData['15.2 อุปสรรคสำคัญของการเรียนรู้ในบริบทผู้เรียนจริง'] || '',
      '15.3_สิ่งที่แตกต่างจากการสอนออกอากาศ': rawData['15.3 สิ่งที่แตกต่างจากการสอนออกอากาศหรือการสอนในห้องส่ง'] || '',
      '15.4_ครูต้นทางปรับเฉพาะหน้าอย่างไร': rawData['15.4 ครูต้นทางปรับวิธีสอนเฉพาะหน้าอย่างไร และผลเป็นอย่างไร'] || '',
      '15.5_เทป/วิธีสอนควรปรับอะไร': rawData['15.5 เทปการสอนหรือวิธีสอนออกอากาศควรปรับอะไร'] || '',
      'ความเห็นเพิ่มเติม': rawData['ความเห็นเพิ่มเติมของผู้สังเกต'] || '',
      'ลงนาม_ผู้สังเกต': rawData['ลงชื่อผู้สังเกต (ชื่อ-นามสกุล)'] || '',
      'ลงนาม_ตำแหน่ง': rawData['ตำแหน่ง / บทบาท'] || '',
      'ลงนาม_วันที่': rawData['วันที่ลงนาม'] || '',
    }, rawData);
  }

  if (formId === 'f4') {
    return Object.assign({
      'โรงเรียน': rawData['โรงเรียน'] || rawData['ชื่อโรงเรียนปลายทาง'] || schoolName,
      'จังหวัด': rawData['จังหวัด'] || '',
      'ระดับชั้น': rawData['ระดับชั้น'] || '',
      'ห้อง': rawData['ห้อง'] || '',
      'รายวิชา': rawData['รายวิชา'] || '',
      'เรื่องที่เรียน': rawData['เรื่องที่เรียน'] || '',
      'วันที่ตอบแบบสอบถาม': rawData['วันที่ตอบแบบสอบถาม'] || '',
      'ลักษณะการเรียนในครั้งนี้': rawData['ลักษณะการเรียนในครั้งนี้'] || '',
      '6.1_เข้าใจเรื่องใดมากที่สุด': rawData['6.1 วันนี้ฉันเข้าใจเรื่องใดมากที่สุด'] || '',
      '6.2_ยังไม่เข้าใจเรื่องใด': rawData['6.2 วันนี้ฉันยังไม่เข้าใจเรื่องใด หรือยังทำได้ไม่ดีตรงไหน'] || '',
      '6.3_สิ่งที่ช่วยให้เรียนได้ดีในวันนี้': rawData['6.3 สิ่งที่ช่วยให้ฉันเรียนรู้ได้ดีในวันนี้คืออะไร'] || '',
      '6.4_สิ่งที่อยากให้ครูช่วยเพิ่มเติม': rawData['6.4 สิ่งที่ฉันอยากให้ครูช่วยเพิ่มเติมในการเรียนครั้งต่อไป'] || '',
      '6.5_คะแนนความเข้าใจตนเอง': rawData['ถ้าให้คะแนนความเข้าใจของตนเองในวันนี้ ฉันให้คะแนนตนเองเท่าไร'] || '',
      '7_จำนวนนักเรียนที่ตอบ': rawData['จำนวนนักเรียนที่ตอบแบบสอบถามทั้งหมด'] || '',
      '7_ข้อค้นพบจากเสียงสะท้อน': rawData['ข้อค้นพบสำคัญจากเสียงสะท้อนของนักเรียน'] || '',
      'ลงนาม_ผู้รวบรวมข้อมูล': rawData['ลงชื่อผู้รวบรวมข้อมูล (ชื่อ-นามสกุล)'] || '',
      'ลงนาม_ตำแหน่ง': rawData['ตำแหน่ง / บทบาท'] || '',
      'ลงนาม_วันที่': rawData['วันที่ลงนาม'] || '',
    }, rawData);
  }

  if (formId === 'f5') {
    return Object.assign({
      'โรงเรียนปลายทาง': rawData['ชื่อโรงเรียนปลายทาง'] || schoolName,
      'จังหวัด': rawData['จังหวัด'] || '',
      'สำนักงานเขตพื้นที่การศึกษา': rawData['สำนักงานเขตพื้นที่การศึกษา'] || '',
      'วันที่ลงพื้นที่': rawData['วันที่ลงพื้นที่'] || '',
      'วันที่ประชุม PLC/สะท้อนผล': rawData['วันที่ประชุม PLC / สะท้อนผล'] || '',
      'ระดับชั้น/รายวิชาที่เกี่ยวข้อง': rawData['ระดับชั้น / รายวิชาที่เกี่ยวข้อง'] || '',
      'ชื่อครูต้นทาง': rawData['ชื่อครูต้นทาง'] || '',
      'ชื่อครูปลายทาง': rawData['ชื่อครูปลายทาง'] || '',
      'ผู้บันทึกผลการสะท้อน': rawData['ผู้บันทึกผลการสะท้อน'] || '',
      'ตำแหน่ง/บทบาท': rawData['ตำแหน่ง / บทบาท'] || '',
      '5.1_บริบทสำคัญที่ส่งผลต่อการใช้DLTV': rawData['5.1 บริบทสำคัญที่ส่งผลต่อการใช้ DLTV'] || '',
      '12.1_ข้อค้นพบสำคัญที่สุด': rawData['12.1 ข้อค้นพบสำคัญที่สุดจากโรงเรียนปลายทางแห่งนี้'] || '',
      '12.2_บทเรียนสำคัญสำหรับการพัฒนา DLTV': rawData['12.2 บทเรียนสำคัญสำหรับการพัฒนาการเรียนการสอนออกอากาศ DLTV'] || '',
      '12.3_ข้อเสนอหลักที่ควรดำเนินการต่อ': rawData['12.3 ข้อเสนอหลักที่ควรนำกลับไปดำเนินการต่อ'] || '',
      'ลงนาม_ผู้บันทึก': rawData['ลงชื่อผู้บันทึกผลการสะท้อน (ชื่อ-นามสกุล)'] || '',
      'ลงนาม_ตำแหน่งผู้บันทึก': rawData['ตำแหน่ง / บทบาท'] || '',
      'ลงนาม_วันที่ผู้บันทึก': rawData['วันที่ลงนาม'] || '',
      'ลงนาม_ผู้รับรอง': rawData['ลงชื่อผู้รับรอง / ผู้ประสานงานหลัก (ชื่อ-นามสกุล)'] || '',
    }, rawData);
  }

  return rawData; // default: pass through
}

function saveF1(e) { submitFormGeneric('f1', 'form-f1', (e&&e.currentTarget)||(window.event&&window.event.currentTarget)); }
function saveF2(e) { submitFormGeneric('f2', 'form-f2', (e&&e.currentTarget)||(window.event&&window.event.currentTarget)); }
function saveF3(e) { submitFormGeneric('f3', 'form-f3', (e&&e.currentTarget)||(window.event&&window.event.currentTarget)); }
function saveF4(e) { submitFormGeneric('f4', 'form-f4', (e&&e.currentTarget)||(window.event&&window.event.currentTarget)); }
function saveF5(e) { submitFormGeneric('f5', 'form-f5', (e&&e.currentTarget)||(window.event&&window.event.currentTarget)); }
