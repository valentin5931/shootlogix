/* CHECKLIST — Daily checklist module */

const SL = window._SL;
const { state, $, api, toast } = SL;
const _esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

const _clCategoryIcons = {
  boats: '\u26F5', security: '\uD83D\uDEE1\uFE0F', transport: '\uD83D\uDE9A',
  fuel: '\u26FD', labour: '\uD83D\uDC77', guards: '\uD83D\uDC82',
  locations: '\uD83D\uDCCD', general: '\u2611\uFE0F'
};

async function loadChecklist() {
  const dateEl = $('checklist-date');
  if (!dateEl.value) {
    const today = new Date().toISOString().slice(0, 10);
    dateEl.value = today;
  }
  const date = dateEl.value;
  if (!state.prodId) return;
  try {
    const data = await api('GET', `/api/productions/${state.prodId}/checklists?date=${date}`);
    _renderChecklist(data);
  } catch (e) {
    $('checklist-content').innerHTML = `<p style="color:var(--text-muted)">No checklist for this date.</p>`;
    $('checklist-stats').textContent = '';
  }
}

async function generateChecklist() {
  const dateEl = $('checklist-date');
  if (!dateEl.value || !state.prodId) return;
  try {
    const data = await api('POST', `/api/productions/${state.prodId}/checklists/generate?date=${dateEl.value}`);
    _renderChecklist(data);
    toast(`Checklist generated: ${(data.items || []).length} items`);
  } catch (e) { toast(e.message, 'error'); }
}

async function toggleChecklistItem(itemId, checkbox) {
  if (!state.prodId) return;
  try {
    await api('PUT', `/api/productions/${state.prodId}/checklists/items/${itemId}/check`, {
      checked: checkbox.checked
    });
    const container = $('checklist-content');
    const boxes = container.querySelectorAll('input[type="checkbox"]');
    const total = boxes.length;
    const done = [...boxes].filter(c => c.checked).length;
    $('checklist-stats').textContent = `${done}/${total} completed`;
    const row = checkbox.closest('.cl-item');
    if (row) row.classList.toggle('cl-done', checkbox.checked);
  } catch (e) { toast(e.message, 'error'); checkbox.checked = !checkbox.checked; }
}

function _renderChecklist(data) {
  const container = $('checklist-content');
  if (!data || !data.items || data.items.length === 0) {
    container.innerHTML = `<p style="color:var(--text-muted)">No items. Click <b>Generate</b> to build the checklist from today's assignments.</p>`;
    $('checklist-stats').textContent = '';
    return;
  }
  const items = data.items;
  const total = items.length;
  const done = items.filter(i => i.checked).length;
  $('checklist-stats').textContent = `${done}/${total} completed`;

  const groups = {};
  items.forEach(i => {
    const cat = i.category || 'general';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(i);
  });

  let html = '';
  for (const [cat, catItems] of Object.entries(groups)) {
    const icon = _clCategoryIcons[cat] || '\u2611\uFE0F';
    html += `<div class="cl-group">
      <h3 class="cl-cat-title">${icon} ${cat.charAt(0).toUpperCase() + cat.slice(1)}</h3>`;
    for (const item of catItems) {
      const chk = item.checked ? 'checked' : '';
      const doneClass = item.checked ? ' cl-done' : '';
      html += `<label class="cl-item${doneClass}">
        <input type="checkbox" ${chk} onchange="App.toggleChecklistItem(${item.id}, this)">
        <span class="cl-text">${_esc(item.item_text)}</span>
      </label>`;
    }
    html += '</div>';
  }
  container.innerHTML = html;
}

// Register on App
App.loadChecklist = loadChecklist;
App.generateChecklist = generateChecklist;
App.toggleChecklistItem = toggleChecklistItem;
