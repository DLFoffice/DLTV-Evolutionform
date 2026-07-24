// ===== FORM COMPLETION STATUS TRACKER =====
function calcFormCompletion(formId) {
  const panel = document.getElementById('form-' + formId);
  if (!panel) {
    const saved = localStorage.getItem('dltv_form_' + formId);
    if (!saved) return { pct: 0, filled: 0, total: 0 };
    try {
      const data = JSON.parse(saved);
      const vals = Object.values(data);
      const total = vals.length;
      const filled = vals.filter(v => v !== '' && v !== false && v !== null && v !== undefined).length;
      return { pct: total > 0 ? Math.round(filled/total*100) : 0, filled, total };
    } catch(e) { return { pct: 0, filled: 0, total: 0 }; }
  }
  const inputs = Array.from(panel.querySelectorAll('input[type=text], input[type=tel], input[type=email], input[type=date], input[type=number], textarea, select'));
  const radioGroups = {};
  panel.querySelectorAll('input[type=radio]').forEach(r => {
    if (!radioGroups.hasOwnProperty(r.name)) radioGroups[r.name] = false;
    if (r.checked) radioGroups[r.name] = true;
  });
  const checkboxGroups = {};
  panel.querySelectorAll('input[type=checkbox]').forEach(c => {
    const grp = c.name || (c.closest('.cb-group') ? c.closest('.cb-group').id || 'cbg' : 'cbg');
    if (!checkboxGroups.hasOwnProperty(grp)) checkboxGroups[grp] = false;
    if (c.checked) checkboxGroups[grp] = true;
  });
  const total = inputs.length + Object.keys(radioGroups).length + Object.keys(checkboxGroups).length;
  const filled = inputs.filter(i => i.value && i.value.trim() !== '').length
    + Object.values(radioGroups).filter(Boolean).length
    + Object.values(checkboxGroups).filter(Boolean).length;
  return { pct: total > 0 ? Math.round(filled/total*100) : 0, filled, total };
}

function updateCompletionBadge(formId) {
  const badge = document.getElementById('badge-' + formId);
  const bar = document.getElementById('progressbar-' + formId);
  if (!badge) return;
  const { pct } = calcFormCompletion(formId);
  if (bar) bar.style.width = pct + '%';
  badge.className = 'form-completion-badge';
  if (pct >= 80) {
    badge.className += ' completion-done';
    badge.textContent = '\u2705 ' + pct + '%';
  } else if (pct >= 15) {
    badge.className += ' completion-partial';
    badge.textContent = '\u23f3 ' + pct + '%';
  } else {
    badge.className += ' completion-none';
    badge.textContent = pct > 0 ? '\ud83d\udcdd ' + pct + '%' : '\u2b55';
  }
}

function updateAllBadges() {
  ['f0','f1','f2','f3','f4','f5'].forEach(id => updateCompletionBadge(id));
}

// Hook auto-update on input events
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(function() {
    document.querySelectorAll('.form-panel').forEach(function(panel) {
      var formId = panel.id.replace('form-', '');
      panel.addEventListener('change', function() { setTimeout(function(){ updateCompletionBadge(formId); }, 200); });
      panel.addEventListener('input', function() { setTimeout(function(){ updateCompletionBadge(formId); }, 200); });
    });
    // f0 main form
    var mainForm = document.getElementById('form-f0');
    if (mainForm) {
      mainForm.addEventListener('change', function() { setTimeout(function(){ updateCompletionBadge('f0'); }, 200); });
      mainForm.addEventListener('input', function() { setTimeout(function(){ updateCompletionBadge('f0'); }, 200); });
    }
    updateAllBadges();
    if (typeof updateStepBreadcrumb === 'function') updateStepBreadcrumb();
  }, 800);
});
