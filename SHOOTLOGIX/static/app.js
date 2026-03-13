/* ============================================================
   ShootLogix — app.js
   Full SPA: PDT + BOATS + BUDGET + department tabs
   ============================================================ */

const App = (() => {

  // ── State ─────────────────────────────────────────────────
  // Council / Arena add defaults
  const EV_DEFAULTS = {
    council: { location: 'CONTADORA', heure_arrivee: '18H00', heure_rehearsal: '19H00' },
    arena:   { location: 'SABOGA' },
    game:    {},
    off:     { name: 'OFF GAME' },
  };

  // Auth state
  let authState = {
    user: null,         // { id, nickname, is_admin }
    memberships: [],    // [{ production_id, production_name, role, permissions, global_permissions }]
    currentRole: null,  // role on current project
    permissions: null,  // V2: { module: { access, can_export, can_import, money_read, money_write } }
    globalPermissions: null,  // V2: { can_lock_unlock, can_view_history }
  };

  let state = {
    prodId: null,
    tab: 'pdt',
    // PDT
    shootingDays: [],
    editingDayId: null,
    editingDayEvents: [],  // events shown in the modal
    // BOATS
    boats: [],
    functions: [],
    assignments: [],
    boatView: 'cards',
    boatFilter: 'all',
    selectedBoat: null,
    dragBoat: null,
    pendingFuncId: null,
    pendingDate: null,
    confirmCallback: null,
    lockedDays: {},     // {date: true} — days frozen by the lock row
    pbLockedDays: {},   // {date: true} — days frozen in Picture Boats
    // PICTURE BOATS
    pictureBoats: [],
    pictureFunctions: [],
    pictureAssignments: [],
    pbBoatView: 'cards',
    pbBoatFilter: 'all',
    pbSelectedBoat: null,
    pbDragBoat: null,
    pbPendingFuncId: null,
    pbPendingDate: null,
    // TRANSPORT
    tbLockedDays: {},
    transportVehicles: [],
    transportFunctions: [],
    transportAssignments: [],
    tbBoatView: 'cards',
    tbVehicleFilter: 'all',
    tbSelectedVehicle: null,
    tbDragVehicle: null,
    tbPendingFuncId: null,
    tbPendingDate: null,
    // Dynamic groups (loaded from localStorage)
    boatGroups: [],
    pbGroups:   [],
    tbGroups:   [],
    // FUEL
    fuelEntries:    [],
    fuelMachinery:  [],
    fuelTab:        'boats',
    fuelLockedDays: {},
    fuelLockedPrices: {},   // {date: {diesel_price, petrol_price}} — snapshots from DB
    fuelPricePerL:  { DIESEL: 0, PETROL: 0 },
    // P5.10: holiday dates cache
    holidayDates: new Set(),
  };

  const DEFAULT_BOAT_GROUPS = [
    { name: 'Games',        color: '#3B82F6' },
    { name: 'Reality',      color: '#8B5CF6' },
    { name: 'Construction', color: '#F97316' },
    { name: 'Crew',         color: '#22C55E' },
    { name: 'Contestants',  color: '#06B6D4' },
    { name: 'Special',      color: '#EF4444' },
  ];
  const DEFAULT_PB_GROUPS = [
    { name: 'YELLOW',  color: '#EAB308' },
    { name: 'RED',     color: '#EF4444' },
    { name: 'NEUTRAL', color: '#94A3B8' },
    { name: 'EXILE',   color: '#8B5CF6' },
  ];
  const DEFAULT_TB_GROUPS = [
    { name: 'INDIVIDUALS', color: '#22C55E' },
    { name: 'UNIT',        color: '#3B82F6' },
    { name: 'CONSTRUCTION',color: '#F97316' },
  ];
  const SCHEDULE_START = new Date('2026-02-15');
  const SCHEDULE_END   = new Date('2026-05-05');

  // ── Group helpers (dynamic) ────────────────────────────────
  function _groupColor(ctx, groupName) {
    const groups = ctx === 'security' ? state.sbGroups : ctx === 'labour' ? state.lbGroups : ctx === 'guard_camp' ? state.gcGroups : ctx === 'picture' ? state.pbGroups : ctx === 'transport' ? state.tbGroups : state.boatGroups;
    return groups.find(g => g.name === groupName)?.color || '#6b7280';
  }
  function _groupOrder(ctx) {
    const groups = ctx === 'security' ? state.sbGroups : ctx === 'labour' ? state.lbGroups : ctx === 'guard_camp' ? state.gcGroups : ctx === 'picture' ? state.pbGroups : ctx === 'transport' ? state.tbGroups : state.boatGroups;
    return groups.map(g => g.name);
  }

  // Tab / modal context tracking
  let _tabCtx    = 'boats';   // 'boats' | 'picture' | 'transport' | 'labour' — which tab is active
  let _assignCtx = 'boats';   // which context opened the assign modal

  // Schedule popover state
  let _schPop = { assignmentId: null, funcId: null, date: null, type: null };
  // Schedule drag state
  let _drag = { active: false, assignmentId: null, type: null };
  let _dragJustEnded = false;

  // Status display map (DB values → English labels)
  const STATUS_LABEL = { brouillon: 'Draft', 'validé': 'Approved', 'modifié': 'Edited' };

  // ── Utilities ─────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const fmtMoney = n => n == null ? '—' : '$' + Math.round(Number(n)).toLocaleString('en-US');
  const fmtDate = s => {
    if (!s) return '';
    const d = new Date(s + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
  };
  const fmtDateLong = s => {
    if (!s) return '';
    const d = new Date(s + 'T00:00:00');
    const days   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()}`;
  };

  // Local-date key: avoids UTC-offset drift (toISOString gives UTC date which differs from local date in non-UTC timezones)
  function _localDk(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function workingDays(start, end) {
    // Count actual calendar days (no 6/7 formula).
    // For backward compatibility this counts all days in the range.
    if (!start || !end) return 0;
    const s = new Date(start + 'T00:00:00'), e = new Date(end + 'T00:00:00');
    const total = Math.round((e - s) / 86400000) + 1;
    return Math.max(0, total);
  }

  /** Count actual active days for an assignment, respecting day_overrides, include_sunday and exclude_holidays. */
  function activeWorkingDays(asgn) {
    if (!asgn.start_date || !asgn.end_date) return 0;
    const overrides = JSON.parse(asgn.day_overrides || '{}');
    const includeSunday = asgn.include_sunday !== 0;
    const excludeHolidays = asgn.exclude_holidays === 1;
    const s = new Date(asgn.start_date.slice(0,10) + 'T00:00:00');
    const e = new Date(asgn.end_date.slice(0,10) + 'T00:00:00');
    let count = 0;
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const dk = d.toISOString().slice(0,10);
      if (dk in overrides) {
        if (overrides[dk] && overrides[dk] !== 'empty') count++;
      } else {
        // Skip Sundays if not included
        if (!includeSunday && d.getDay() === 0) continue;
        // Skip holidays if excluded
        if (excludeHolidays && state.holidayDates.has(dk)) continue;
        count++; // default: day in range is active
      }
    }
    // Add overrides outside range that are explicitly active
    const sStr = asgn.start_date.slice(0,10), eStr = asgn.end_date.slice(0,10);
    for (const [dk, status] of Object.entries(overrides)) {
      if (dk < sStr || dk > eStr) {
        if (status && status !== 'empty') count++;
      }
    }
    return count;
  }

  /** Compute working days for an assignment. Uses include_sunday flag. */
  function computeWd(asgn) {
    if (asgn.working_days != null) return asgn.working_days;
    return activeWorkingDays(asgn);
  }

  // Returns 'on' if this day is active for the assignment, null if empty/excluded.
  function effectiveStatus(asgn, date) {
    const overrides = JSON.parse(asgn.day_overrides || '{}');
    if (date in overrides) {
      const v = overrides[date];
      return (v && v !== 'empty') ? 'on' : null;
    }
    const start = (asgn.start_date || '').slice(0, 10);
    const end   = (asgn.end_date   || '').slice(0, 10);
    if (start && end && date >= start && date <= end) return 'on';
    return null;
  }

  function waveClass(r) {
    if (!r) return 'wave-waves';
    const l = r.toLowerCase();
    if (l.includes('big')) return 'wave-big';
    if (l.includes('high')) return 'wave-high';
    if (l.includes('dr')) return 'wave-dr';
    return 'wave-waves';
  }
  function waveLabel(r) {
    if (!r) return 'OK';
    const l = r.toLowerCase();
    if (l.includes('big')) return 'Big';
    if (l.includes('high')) return 'High';
    if (l.includes('dr')) return 'Dr';
    return 'OK';
  }

  // ── Empty state helper ────────────────────────────────────
  const _emptyIcons = {
    boat: '<svg viewBox="0 0 24 24"><path d="M2 20l2-4h16l2 4"/><path d="M4 16l1-4h14l1 4"/><path d="M12 4v8"/><path d="M8 8h8"/></svg>',
    truck: '<svg viewBox="0 0 24 24"><rect x="1" y="6" width="15" height="10" rx="1"/><path d="M16 10h4l3 3v3h-7V10z"/><circle cx="6" cy="18" r="2"/><circle cx="20" cy="18" r="2"/></svg>',
    fuel: '<svg viewBox="0 0 24 24"><rect x="4" y="2" width="12" height="18" rx="2"/><path d="M8 6h4"/><path d="M20 6v8a2 2 0 01-2 2h-2"/><path d="M16 6l4-2"/><rect x="2" y="20" width="16" height="2" rx="1"/></svg>',
    worker: '<svg viewBox="0 0 24 24"><circle cx="12" cy="7" r="4"/><path d="M5.5 21a6.5 6.5 0 0113 0"/></svg>',
    shield: '<svg viewBox="0 0 24 24"><path d="M12 2l8 4v6c0 5.5-3.8 10.3-8 12-4.2-1.7-8-6.5-8-12V6l8-4z"/></svg>',
    location: '<svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>',
    camera: '<svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="14" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M7 6l1-3h8l1 3"/></svg>',
    food: '<svg viewBox="0 0 24 24"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>',
    calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  };
  function emptyState(icon, title, hint, btnLabel, btnAction) {
    const svg = _emptyIcons[icon] || _emptyIcons.calendar;
    const btn = btnLabel && btnAction
      ? `<button class="btn-empty-action" onclick="${btnAction}">${btnLabel}</button>`
      : '';
    return `<div class="sl-empty-state">${svg}<div class="empty-title">${title}</div><div class="empty-hint">${hint}</div>${btn}</div>`;
  }

  // ── Toast ──────────────────────────────────────────────────
  let toastTimer;
  function toast(msg, type = 'success', undoHistoryId = null) {
    $('toast-icon').textContent = type === 'error' ? '✕' : type === 'info' ? 'ℹ' : '✓';
    const msgEl = $('toast-msg');
    msgEl.textContent = msg;
    $('toast-inner').className = type;
    $('toast').classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.add('hidden'), 3200);
    // Track undoable action in persistent undo bar
    if (undoHistoryId) {
      _pushUndo(undoHistoryId, msg);
    }
  }

  // ── Persistent Undo Bar (P2.6) ──────────────────────────────
  const _undoStack = []; // { id, description, ts }
  const UNDO_STACK_MAX = 50;

  function _pushUndo(historyId, description) {
    _undoStack.unshift({ id: historyId, description, ts: Date.now() });
    if (_undoStack.length > UNDO_STACK_MAX) _undoStack.pop();
    _renderUndoBar();
  }

  function _renderUndoBar() {
    let bar = $('undo-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'undo-bar';
      bar.className = 'undo-bar hidden';
      document.body.appendChild(bar);
    }
    const active = _undoStack.filter(u => !u.done);
    if (!active.length) {
      bar.classList.add('hidden');
      return;
    }
    const last = active[0];
    const count = active.length;
    bar.innerHTML = `
      <div class="undo-bar-inner">
        <span class="undo-bar-msg">${esc(last.description)}</span>
        <button class="undo-bar-btn" onclick="App._undoLast()">UNDO</button>
        ${count > 1 ? `<button class="undo-bar-expand" onclick="App._toggleUndoPanel()">
          ${count} actions
        </button>` : ''}
        <button class="undo-bar-close" onclick="App._closeUndoBar()">&times;</button>
      </div>
      <div id="undo-panel" class="undo-panel hidden"></div>`;
    bar.classList.remove('hidden');
  }

  async function _undoLast() {
    const active = _undoStack.filter(u => !u.done);
    if (!active.length) return;
    const entry = active[0];
    try {
      const pid = state.production?.id;
      const url = pid
        ? `/api/productions/${pid}/history/${entry.id}/undo`
        : `/api/history/${entry.id}/undo`;
      await api('POST', url);
      entry.done = true;
      toast('Undone', 'success');
      _renderUndoBar();
      setTab(state.tab);
    } catch (e) {
      toast('Undo failed: ' + e.message, 'error');
    }
  }

  async function _undoEntry(historyId) {
    const entry = _undoStack.find(u => u.id === historyId);
    if (!entry || entry.done) return;
    try {
      const pid = state.production?.id;
      const url = pid
        ? `/api/productions/${pid}/history/${historyId}/undo`
        : `/api/history/${historyId}/undo`;
      await api('POST', url);
      entry.done = true;
      toast('Undone', 'success');
      _renderUndoBar();
      _renderUndoPanel();
      setTab(state.tab);
    } catch (e) {
      toast('Undo failed: ' + e.message, 'error');
    }
  }

  function _toggleUndoPanel() {
    const panel = $('undo-panel');
    if (!panel) return;
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) _renderUndoPanel();
  }

  function _renderUndoPanel() {
    const panel = $('undo-panel');
    if (!panel) return;
    const active = _undoStack.filter(u => !u.done);
    panel.innerHTML = active.map(u => `
      <div class="undo-panel-row">
        <span>${esc(u.description)}</span>
        <button class="undo-bar-btn" onclick="App._undoEntry(${u.id})">UNDO</button>
      </div>`).join('');
  }

  function _closeUndoBar() {
    // Mark all as dismissed
    _undoStack.forEach(u => u.done = true);
    _renderUndoBar();
  }

  // Legacy compat
  async function _undoFromToast(historyId) {
    _pushUndo(historyId, 'Action');
    await _undoLast();
  }

  // ── AXE 5.4 — Loading Skeletons ────────────────────────────
  function _skeletonCards(count = 4) {
    return Array.from({ length: count }, () =>
      '<div class="skeleton skeleton-card"></div>'
    ).join('');
  }

  function _skeletonTable(rows = 6, cols = 10) {
    let html = '<div class="skeleton-table"><div class="skeleton skeleton-header"></div>';
    for (let r = 0; r < rows; r++) {
      html += '<div class="skeleton-row" style="display:flex;gap:2px;margin-bottom:3px">';
      html += '<div class="skeleton" style="width:120px;height:28px;flex-shrink:0;border-radius:4px"></div>';
      for (let c = 0; c < cols; c++) {
        html += '<div class="skeleton skeleton-cell"></div>';
      }
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  // ── P4.7 — Loading Indicators ─────────────────────────────
  function _showLoading(containerId, type = 'spinner', opts = {}) {
    const el = typeof containerId === 'string' ? $(containerId) : containerId;
    if (!el) return;
    const msg = opts.message || '';
    if (type === 'spinner') {
      el.innerHTML = `<div class="loading-container">
        <div class="loading-spinner${opts.size ? ' ' + opts.size : ''}"></div>
        ${msg ? `<div>${esc(msg)}</div>` : ''}
      </div>`;
    } else if (type === 'cards') {
      el.innerHTML = `<div class="skeleton-list">${Array.from({ length: opts.count || 4 }, () =>
        '<div class="skeleton skeleton-bar"></div>').join('')}</div>`;
    } else if (type === 'table') {
      el.innerHTML = _skeletonTable(opts.rows || 6, opts.cols || 10);
    } else if (type === 'stats') {
      el.innerHTML = `<div class="stat-grid">${Array.from({ length: opts.count || 3 }, () =>
        '<div class="skeleton skeleton-stat"></div>').join('')}</div>`;
    }
  }

  function _hideLoading(containerId) {
    const el = typeof containerId === 'string' ? $(containerId) : containerId;
    if (!el) return;
    el.classList.add('loaded-fade');
    el.addEventListener('animationend', () => el.classList.remove('loaded-fade'), { once: true });
  }

  // ── AXE 5.4 — Save Flash (green flash on cell/element) ────
  let _pendingFlash = null; // { selector, timeout }
  function _flashSaved(el) {
    if (!el) return;
    el.classList.remove('cell-saved');
    void el.offsetWidth; // force reflow for re-trigger
    el.classList.add('cell-saved');
    el.addEventListener('animationend', () => el.classList.remove('cell-saved'), { once: true });
  }

  function _flashSavedCard(el) {
    if (!el) return;
    el.classList.remove('save-flash');
    void el.offsetWidth;
    el.classList.add('save-flash');
    el.addEventListener('animationend', () => el.classList.remove('save-flash'), { once: true });
  }

  // Queue a flash for after the next render (cell will be re-created by render)
  function _queueCellFlash(date, funcId) {
    clearTimeout(_pendingFlash);
    _pendingFlash = setTimeout(() => {
      const cell = document.querySelector(`.schedule-cell[data-date="${date}"][data-func="${funcId}"]`);
      _flashSaved(cell);
    }, 50);
  }

  // ── AXE 5.4 — Network Indicator ──────────────────────────
  let _netFadeTimer = null;
  function _updateNetIndicator(online) {
    const el = $('net-indicator');
    if (!el) return;
    const label = $('net-label');
    clearTimeout(_netFadeTimer);
    el.classList.remove('online', 'offline', 'fade-out');
    if (online) {
      el.classList.add('online');
      if (label) label.textContent = t('common.online');
      // Fade out after 4s when online — stays visible when offline
      _netFadeTimer = setTimeout(() => el.classList.add('fade-out'), 4000);
    } else {
      el.classList.add('offline');
      if (label) label.textContent = t('common.offline');
    }
  }

  // ── AXE 5.4 — Unsaved Modifications Counter ───────────────
  async function _updateOfflineCounter() {
    const el = $('offline-counter');
    const badge = $('oc-count');
    if (!el || !badge) return;
    const count = window.OfflineQueue ? await window.OfflineQueue.getPendingCount() : 0;
    badge.textContent = count;
    el.querySelector('span:last-child').textContent = count === 1 ? 'unsaved change' : 'unsaved changes';
    el.classList.toggle('visible', count > 0);
  }

  // ── Virtual Schedule (column windowing) ─────────────────────
  // Only renders visible date columns + buffer to avoid rendering 80+ columns
  const VCOL_WIDTH_DESKTOP = 26; // px per column (matches .schedule-cell min-width desktop)
  const VCOL_WIDTH_MOBILE  = 44; // px per column on mobile (44px touch-friendly)
  const VCOL_BUFFER = 10; // extra columns rendered on each side
  function _vcolWidth() { return window.innerWidth <= 768 ? VCOL_WIDTH_MOBILE : VCOL_WIDTH_DESKTOP; }

  function _virtualScheduleSetup(wrapEl, totalCols) {
    if (!wrapEl) return null;
    const viewWidth = wrapEl.clientWidth;
    const funcColWidth = window.innerWidth <= 768 ? 90 : 130;
    const visibleCols = Math.ceil((viewWidth - funcColWidth) / _vcolWidth());
    return {
      totalCols,
      visibleCols,
      funcColWidth,
    };
  }

  function _getVisibleColRange(wrapEl, totalCols) {
    if (!wrapEl) return { start: 0, end: totalCols };
    const scrollLeft = wrapEl.scrollLeft;
    const viewWidth = wrapEl.clientWidth;
    const funcColWidth = window.innerWidth <= 768 ? 90 : 130;
    const effectiveScroll = Math.max(0, scrollLeft);
    const cw = _vcolWidth();
    const startCol = Math.max(0, Math.floor(effectiveScroll / cw) - VCOL_BUFFER);
    const endCol = Math.min(totalCols, Math.ceil((effectiveScroll + viewWidth) / cw) + VCOL_BUFFER);
    return { start: startCol, end: endCol };
  }

  // ── Smooth DOM update (morphs existing DOM instead of full innerHTML replace) ──
  function _morphHTML(container, newHTML) {
    if (!container) return;
    const saved = _saveScheduleScroll(container);

    // Parse new HTML into a temporary container
    const temp = document.createElement(container.tagName || 'div');
    temp.innerHTML = newHTML;

    // Morph children: match by id or position, update only what changed
    _morphChildren(container, temp);
    _restoreScheduleScroll(container, saved);
  }

  function _morphChildren(existing, incoming) {
    const existingNodes = Array.from(existing.childNodes);
    const incomingNodes = Array.from(incoming.childNodes);

    // Build id map from existing children for fast lookup
    const existingById = {};
    existingNodes.forEach(n => {
      if (n.id) existingById[n.id] = n;
    });

    let ei = 0;
    for (let ii = 0; ii < incomingNodes.length; ii++) {
      const newNode = incomingNodes[ii];
      let oldNode = null;

      // Try to match by id first
      if (newNode.id && existingById[newNode.id]) {
        oldNode = existingById[newNode.id];
        // Move it into position if needed
        if (oldNode !== existing.childNodes[ei]) {
          existing.insertBefore(oldNode, existing.childNodes[ei] || null);
        }
      } else if (ei < existingNodes.length) {
        oldNode = existingNodes[ei];
        // Only reuse if same tag and no conflicting ids
        if (oldNode.nodeType !== newNode.nodeType ||
            (oldNode.nodeType === 1 && oldNode.tagName !== newNode.tagName) ||
            (newNode.id && oldNode.id !== newNode.id)) {
          oldNode = null;
        }
      }

      if (!oldNode) {
        // Insert new node
        const clone = newNode.cloneNode(true);
        existing.insertBefore(clone, existing.childNodes[ei] || null);
        ei++;
        continue;
      }

      // Text nodes: update if different
      if (oldNode.nodeType === 3) {
        if (oldNode.textContent !== newNode.textContent) {
          oldNode.textContent = newNode.textContent;
        }
        ei++;
        continue;
      }

      // Element nodes: update attributes, then recurse into children
      if (oldNode.nodeType === 1) {
        _morphAttributes(oldNode, newNode);
        // For input/select/textarea, preserve focus but sync value
        if (oldNode.tagName === 'INPUT' || oldNode.tagName === 'SELECT' || oldNode.tagName === 'TEXTAREA') {
          if (document.activeElement !== oldNode && oldNode.value !== newNode.value) {
            oldNode.value = newNode.value || '';
          }
        } else {
          // Recurse for non-input elements
          _morphChildren(oldNode, newNode);
        }
      }
      ei++;
    }

    // Remove extra old nodes
    while (existing.childNodes.length > incomingNodes.length) {
      existing.removeChild(existing.lastChild);
    }
  }

  function _morphAttributes(oldEl, newEl) {
    // Remove old attributes not in new
    const oldAttrs = Array.from(oldEl.attributes);
    for (const attr of oldAttrs) {
      if (!newEl.hasAttribute(attr.name)) {
        oldEl.removeAttribute(attr.name);
      }
    }
    // Set/update new attributes
    const newAttrs = Array.from(newEl.attributes);
    for (const attr of newAttrs) {
      if (oldEl.getAttribute(attr.name) !== attr.value) {
        oldEl.setAttribute(attr.name, attr.value);
      }
    }
  }

  // ── Debounce render calls to avoid multiple rapid DOM rebuilds ──
  const _renderTimers = {};
  function _debouncedRender(key, fn, delay = 50) {
    clearTimeout(_renderTimers[key]);
    _renderTimers[key] = setTimeout(fn, delay);
  }

  // ── Auth helpers ─────────────────────────────────────────────
  function _getAccessToken() {
    return localStorage.getItem('access_token');
  }

  function _getRefreshToken() {
    return localStorage.getItem('refresh_token');
  }

  async function _refreshAccessToken() {
    const rt = _getRefreshToken();
    if (!rt) return false;
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: rt }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      localStorage.setItem('access_token', data.access_token);
      if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
      return true;
    } catch { return false; }
  }

  function _redirectToLogin() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  }

  function _authHeaders(extraHeaders) {
    const h = { ...(extraHeaders || {}) };
    const token = _getAccessToken();
    if (token) h['Authorization'] = `Bearer ${token}`;
    // Send current project ID for routes without prod_id in URL
    if (state.prodId) h['X-Project-Id'] = String(state.prodId);
    return h;
  }

  // Wrapper around fetch that adds auth header and handles 401 with token refresh
  async function authFetch(url, opts = {}) {
    opts.headers = _authHeaders(opts.headers);
    let res = await fetch(url, opts);
    if (res.status === 401) {
      const refreshed = await _refreshAccessToken();
      if (refreshed) {
        opts.headers = _authHeaders(opts.headers);
        res = await fetch(url, opts);
      }
      if (res.status === 401) {
        _redirectToLogin();
        throw new Error('Session expired');
      }
    }
    return res;
  }

  async function authDownload(url) {
    const res = await authFetch(url);
    if (!res.ok) { alert('Export failed'); return; }
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename=(.+)/);
    const filename = match ? match[1].replace(/"/g, '') : 'export';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  // ── Auth: permissions & UI restrictions (RBAC V2) ────────
  // V1 fallback tabs (used only when no V2 permissions loaded)
  const ROLE_ALLOWED_TABS = {
    ADMIN:   ['today','dashboard','pdt','locations','fleet','boats','picture-boats','security-boats','transport','fuel','crew','labour','guards','fnb','budget'],
    UNIT:    ['today','dashboard','pdt','locations','fleet','boats','picture-boats','security-boats','transport','fuel','crew','labour','guards','fnb','budget'],
    TRANSPO: ['today','dashboard','fleet','boats','picture-boats','security-boats','transport','fuel'],
    READER:  ['today','dashboard','pdt','locations','fleet','boats','picture-boats','security-boats','transport','fuel','crew','labour','guards','fnb','budget'],
  };

  function _getModulePerm(tab) {
    if (!authState.permissions) return null;
    return authState.permissions[tab] || null;
  }

  function _canViewTab(tab) {
    if (_isAdmin()) return true;
    if (tab === 'dashboard' || tab === 'today' || tab === 'timeline') return true;
    // Crew meta-tab: accessible if labour OR guards is accessible
    if (tab === 'crew') return _canViewTab('labour') || _canViewTab('guards');
    // Fleet meta-tab: accessible if any boat type is accessible
    if (tab === 'fleet') return _canViewTab('boats') || _canViewTab('picture-boats') || _canViewTab('security-boats');
    // V2: check per-module permission
    const perm = _getModulePerm(tab);
    if (perm) return perm.access !== 'none';
    // V1 fallback
    const role = authState.currentRole || 'READER';
    return (ROLE_ALLOWED_TABS[role] || []).includes(tab);
  }

  function _canEdit(tab) {
    if (_isAdmin()) return true;
    // V2: check write access for the given tab (or current tab)
    const t = tab || state.tab;
    const perm = _getModulePerm(t);
    if (perm) return perm.access === 'write';
    // V1 fallback
    const role = authState.currentRole || 'READER';
    return role !== 'READER';
  }

  function _canEditPrices(tab) {
    if (_isAdmin()) return true;
    // V2: check money_write for the given tab
    const t = tab || state.tab;
    const perm = _getModulePerm(t);
    if (perm) return !!perm.money_write;
    return false;
  }

  function _canEditFuelPrices() {
    if (_isAdmin()) return true;
    const perm = _getModulePerm('fuel');
    if (perm) return !!perm.money_write;
    // V1 fallback
    const role = authState.currentRole || 'READER';
    return role === 'UNIT' || role === 'TRANSPO';
  }

  function _isAdmin() {
    return authState.currentRole === 'ADMIN' || (authState.user && authState.user.is_admin);
  }

  function _canExport(tab) {
    if (_isAdmin()) return true;
    const t = tab || state.tab;
    const perm = _getModulePerm(t);
    if (perm) return !!perm.can_export;
    return authState.currentRole !== 'READER';
  }

  function _canImport(tab) {
    if (_isAdmin()) return true;
    const t = tab || state.tab;
    const perm = _getModulePerm(t);
    if (perm) return !!perm.can_import && perm.access === 'write';
    return false;
  }

  function _canViewMoney(tab) {
    if (_isAdmin()) return true;
    const t = tab || state.tab;
    const perm = _getModulePerm(t);
    if (perm) return !!perm.money_read;
    return true; // V1: all roles except TRANSPO could see money
  }

  function _applyUIRestrictions() {
    const role = authState.currentRole || 'READER';

    // 1. Hide/show tabs in topbar based on role
    document.querySelectorAll('#topbar .tab-btn').forEach(btn => {
      const tab = btn.getAttribute('data-tab');
      if (!tab) return;
      btn.style.display = _canViewTab(tab) ? '' : 'none';
    });

    // Also hide separators adjacent to hidden tabs (cleanup visual)
    // Simple approach: hide all seps, then show ones between visible tabs
    const btns = Array.from(document.querySelectorAll('#topbar .tab-btn, #topbar .topbar-sep'));
    let lastWasVisible = false;
    btns.forEach(el => {
      if (el.classList.contains('topbar-sep')) {
        el.style.display = lastWasVisible ? '' : 'none';
        lastWasVisible = false;
      } else if (el.classList.contains('tab-btn')) {
        const tab = el.getAttribute('data-tab');
        const visible = !tab || _canViewTab(tab);
        el.style.display = visible ? '' : 'none';
        if (visible) lastWasVisible = true;
      }
    });

    // 2. Add CSS class to body for role-based styling (V2: admin or user)
    document.body.classList.remove('role-admin', 'role-unit', 'role-transpo', 'role-reader', 'role-user');
    document.body.classList.add(_isAdmin() ? 'role-admin' : 'role-user');

    // 3. If current tab is not allowed, switch to first allowed tab
    if (!_canViewTab(state.tab)) {
      // V2: find first accessible tab from permissions
      let firstAllowed = 'dashboard';
      if (authState.permissions) {
        for (const mod of ['pdt','locations','fleet','transport','fuel','crew','fnb','budget']) {
          const p = authState.permissions[mod];
          if (p && p.access !== 'none') { firstAllowed = mod; break; }
        }
      } else {
        const allowed = ROLE_ALLOWED_TABS[role] || ['boats'];
        firstAllowed = allowed[0];
      }
      setTab(firstAllowed);
    }

    // 4. Activity button visibility (requires can_view_history or admin)
    const activityBtn = $('activity-btn');
    if (activityBtn) {
      const canViewHistory = _isAdmin() || (authState.globalPermissions && authState.globalPermissions.can_view_history);
      activityBtn.style.display = canViewHistory ? '' : 'none';
    }

    // 5. Disable draggable for read-only users
    if (!_canEdit()) {
      document.querySelectorAll('[draggable="true"]').forEach(el => {
        el.setAttribute('draggable', 'false');
      });
    }
  }

  // Apply price field restrictions after rendering
  function _applyPriceRestrictions() {
    if (_canEditPrices()) return; // ADMIN can edit all prices

    // Mark price-related inputs as readonly
    // Selectors for price inputs in boat/assignment modals and inline edits
    const priceSelectors = [
      'input[name*="price"]',
      'input[name*="rate"]',
      'input[name*="cost"]',
      'input[data-field*="price"]',
      'input[data-field*="rate"]',
      'input[data-field*="cost"]',
      'input[data-field*="daily_rate"]',
      '.price-input',
      '.rate-input',
    ];

    document.querySelectorAll(priceSelectors.join(',')).forEach(el => {
      // Exception: fuel prices (diesel/petrol) can be edited by UNIT and TRANSPO
      if (_canEditFuelPrices() && el.closest('#view-fuel')) return;
      el.classList.add('price-readonly');
      el.setAttribute('tabindex', '-1');
    });
  }

  // ── Auth: project selector & user state ──────────────────
  async function _loadAuthState() {
    const data = await api('GET', '/api/auth/me');
    authState.user = { id: data.id, nickname: data.nickname, is_admin: data.is_admin };
    authState.memberships = data.memberships || [];
    localStorage.setItem('user', JSON.stringify(authState.user));
  }

  function _showProjectSelector() {
    const el = $('project-selector');
    if (!el) return;
    $('ps-welcome').textContent = t('auth.welcome', { name: authState.user.nickname });
    const list = $('ps-list');
    list.innerHTML = '';
    for (const m of authState.memberships) {
      const item = document.createElement('div');
      item.className = 'project-selector-item';
      const displayType = (authState.user && authState.user.is_admin) || m.role === 'ADMIN' ? 'ADMIN' : 'USER';
      item.innerHTML = `<span class="ps-name">${esc(m.production_name)}</span>
        <span class="ps-role">${esc(displayType)}</span>`;
      item.onclick = () => _selectProject(m.production_id, m.role);
      list.appendChild(item);
    }
    el.style.display = 'flex';
  }

  function _hideProjectSelector() {
    const el = $('project-selector');
    if (el) el.style.display = 'none';
  }

  async function _selectProject(prodId, role) {
    _hideProjectSelector();
    state.prodId = prodId;
    authState.currentRole = role;
    // V2: load permissions from membership data
    const membership = authState.memberships.find(m => m.production_id == prodId);
    if (membership && membership.permissions) {
      authState.permissions = membership.permissions;
      authState.globalPermissions = membership.global_permissions || {};
    } else if (authState.user && authState.user.is_admin) {
      authState.permissions = null; // Admin = full access
      authState.globalPermissions = { can_lock_unlock: true, can_view_history: true };
    } else {
      authState.permissions = {};
      authState.globalPermissions = {};
    }
    localStorage.setItem('currentProdId', prodId);
    localStorage.setItem('currentRole', role);
    _updateTopbarUser();
    _applyUIRestrictions();
    try {
      await Promise.all([loadShootingDays(), loadBoatsData(), loadPictureBoatsData(), _loadFuelGlobals(), _loadHolidays()]);
      await _preloadModules();
      App.renderPDT?.();
      // Load scheduling alerts in background (AXE 7.3)
      App.loadAlerts?.();
      // Start notification polling (AXE 9.2)
      App.startNotifPolling?.();
    } catch (e) {
      console.error('Load error after project select:', e);
      toast('Failed to load project data: ' + e.message, 'error');
    }
  }

  function _updateTopbarUser() {
    const topbar = document.getElementById('topbar');

    // Admin panel link (only for ADMIN)
    let adminLink = document.getElementById('topbar-admin-link');
    if (!adminLink) {
      adminLink = document.createElement('button');
      adminLink.id = 'topbar-admin-link';
      adminLink.className = 'tab-btn admin-only';
      adminLink.innerHTML = '<span class="dot" style="background:#EF4444"></span>ADMIN';
      adminLink.onclick = () => setTab('admin');
      // Insert before the flex spacer
      const spacer = topbar.querySelector('div[style*="flex:1"]');
      if (spacer) topbar.insertBefore(adminLink, spacer);
    }

    // User badge
    let badge = document.getElementById('topbar-user-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'topbar-user-badge';
      badge.className = 'topbar-user';
      topbar.appendChild(badge);
    }
    const nick = authState.user ? authState.user.nickname : '';
    const role = authState.currentRole || '';
    const displayType = (authState.user && authState.user.is_admin) || role === 'ADMIN' ? 'ADMIN' : 'USER';
    badge.innerHTML = `<span class="tu-nickname">${esc(nick)}</span>
      <span class="tu-role">${esc(displayType)}</span>`;
    badge.onclick = () => {
      if (authState.memberships.length > 1) {
        _showProjectSelector();
      }
    };

    // Logout button
    let logoutBtn = document.getElementById('topbar-logout-btn');
    if (!logoutBtn) {
      logoutBtn = document.createElement('button');
      logoutBtn.id = 'topbar-logout-btn';
      logoutBtn.className = 'tab-btn';
      logoutBtn.style.cssText = 'color:var(--text-3);font-size:0.75rem;';
      logoutBtn.textContent = t('common.sign_out');
      logoutBtn.onclick = logout;
      topbar.appendChild(logoutBtn);
    }
  }

  function logout() {
    const rt = _getRefreshToken();
    if (rt) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: rt }),
      }).catch(() => {});
    }
    _redirectToLogin();
  }

  // ── API ────────────────────────────────────────────────────
  // ── Client cache (ETag-based) ────────────────────────────
  const _cache = {};  // { path: { data, etag, ts } }
  const CACHE_TTL = 30000; // 30s - use cache without revalidation

  // ── Offline mutation queue (P6.1 - delegated to OfflineQueue IndexedDB module) ──
  // Legacy references kept for backward compat with _updateOfflineCounter
  async function _flushOfflineQueue() {
    if (window.OfflineQueue) await window.OfflineQueue.flush();
  }
  // Online flush is handled by OfflineQueue module's own listener

  function _invalidateCache(pathPattern) {
    for (const key of Object.keys(_cache)) {
      if (key.includes(pathPattern)) delete _cache[key];
    }
  }

  async function api(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opts.body = JSON.stringify(body);

    // Offline handling for mutations (P6.1 - IndexedDB queue)
    if (!navigator.onLine && method !== 'GET') {
      if (window.OfflineQueue) {
        await window.OfflineQueue.enqueue({ url: path, method, body, timestamp: Date.now() });
        window.OfflineQueue.updateBanner();
      }
      toast('Saved offline - will sync when back online', 'info');
      return body || {};
    }

    // For GET requests, use ETag cache
    if (method === 'GET' && _cache[path]) {
      const cached = _cache[path];
      // If fresh enough, return from cache immediately (no network)
      if (Date.now() - cached.ts < CACHE_TTL) {
        return cached.data;
      }
      // Otherwise, revalidate with ETag
      if (cached.etag) {
        opts.headers['If-None-Match'] = cached.etag;
      }
    }

    const res = await authFetch(path, opts);

    // 304 Not Modified: use cached data
    if (res.status === 304 && _cache[path]) {
      _cache[path].ts = Date.now();
      return _cache[path].data;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      const _te = typeof translateError === 'function' ? translateError : (s) => s;
      // Handle validation errors with field details
      if (res.status === 422 && err.fields) {
        const msgs = Object.values(err.fields).join(', ');
        throw new Error(_te(msgs));
      }
      throw new Error(_te(err.error || `HTTP ${res.status}`));
    }

    const data = await res.json();

    // Cache GET responses with ETags
    if (method === 'GET') {
      const etag = res.headers.get('ETag');
      if (etag) {
        _cache[path] = { data, etag, ts: Date.now() };
      }
    }

    // Invalidate relevant caches on mutations
    if (method !== 'GET') {
      // Extract the resource type from path to invalidate related caches
      const parts = path.split('/');
      // Invalidate production-level list caches
      if (state.prodId) {
        const prodPrefix = `/api/productions/${state.prodId}`;
        // Specific invalidation patterns
        if (path.includes('assignment')) _invalidateCache(prodPrefix);
        else if (path.includes('boat')) _invalidateCache(prodPrefix);
        else if (path.includes('helper')) _invalidateCache(prodPrefix);
        else if (path.includes('transport')) _invalidateCache(prodPrefix);
        else if (path.includes('fuel')) _invalidateCache(prodPrefix);
        else if (path.includes('shooting-day')) _invalidateCache(prodPrefix);
        else if (path.includes('guard')) _invalidateCache(prodPrefix);
        else if (path.includes('location')) _invalidateCache(prodPrefix);
        else if (path.includes('fnb')) _invalidateCache(prodPrefix);
        else _invalidateCache(prodPrefix);
      }
    }

    return data;
  }

  // ── Data loading ───────────────────────────────────────────
  async function loadProduction() {
    const prods = await api('GET', '/api/productions');
    if (!prods.length) throw new Error('No production found. Make sure the Flask server ran bootstrap().');
    state.prodId = prods[0].id;
    return prods[0];
  }

  async function loadShootingDays() {
    state.shootingDays = await api('GET', `/api/productions/${state.prodId}/shooting-days`);
  }

  async function loadBoatsData() {
    const [boats, functions, assignments] = await Promise.all([
      api('GET', `/api/productions/${state.prodId}/boats`),
      api('GET', `/api/productions/${state.prodId}/boat-functions?context=boats`),
      api('GET', `/api/productions/${state.prodId}/assignments?context=boats`),
    ]);
    state.boats = boats;
    state.functions = functions;
    state.assignments = assignments;
  }

  async function loadPictureBoatsData() {
    const [pictureBoats, functions, assignments] = await Promise.all([
      api('GET', `/api/productions/${state.prodId}/picture-boats`),
      api('GET', `/api/productions/${state.prodId}/boat-functions?context=picture`),
      api('GET', `/api/productions/${state.prodId}/picture-boat-assignments`),
    ]);
    state.pictureBoats       = pictureBoats;
    state.pictureFunctions   = functions;
    state.pictureAssignments = assignments;
  }

  // P5.10: Load holiday dates for working-day calculations
  async function _loadHolidays() {
    try {
      const holidays = await api('GET', '/api/holidays');
      state.holidayDates = new Set(holidays.map(h => h.date));
    } catch (e) {
      console.warn('Failed to load holidays:', e);
      state.holidayDates = new Set();
    }
  }

  // ── Tab navigation (original — replaced by setTabLazy below) ──
  function setTab(tab) {
    // Delegate to the lazy-loading version defined later
    return setTabLazy(tab);
  }

  // ── Breadcrumb ──────────────────────────────────────────────
  const TAB_LABELS = {
    today: 'Today', dashboard: 'Dashboard', pdt: 'Schedule', locations: 'Locations',
    fleet: 'Fleet', crew: 'Crew',
    boats: 'Boats', 'picture-boats': 'Picture Boats', 'security-boats': 'Security Boats',
    transport: 'Transport', fuel: 'Fuel', labour: 'Labor',
    guards: 'Guards', fnb: 'Catering', budget: 'Budget', documents: 'Documents', timeline: 'Timeline', admin: 'Admin',
  };

  // Parent tab mapping: sub-tabs that belong to a unified view
  const TAB_PARENT = {
    boats: 'fleet', 'picture-boats': 'fleet', 'security-boats': 'fleet',
    labour: 'crew', guards: 'crew',
  };

  function _updateBreadcrumb(view, entity) {
    const modEl = $('bc-module');
    const viewEl = $('bc-view');
    const entityEl = $('bc-entity');
    const entitySep = document.querySelector('.bc-entity-sep');
    if (!modEl) return;

    const tab = state.tab;
    const parentTab = TAB_PARENT[tab];

    modEl.textContent = parentTab ? TAB_LABELS[parentTab] : (TAB_LABELS[tab] || tab);
    modEl.onclick = () => {
      if (parentTab) setTab(parentTab);
      else setTab(tab);
    };

    // If there's a parent, show the sub-tab as the view level
    if (parentTab) {
      viewEl.textContent = view ? `${TAB_LABELS[tab]} / ${view}` : (TAB_LABELS[tab] || tab);
    } else {
      viewEl.textContent = view || 'Overview';
    }
    viewEl.onclick = () => {
      if (parentTab) { setTab(tab); }
      else if (view) { setTab(tab); }
    };

    if (entity) {
      entityEl.textContent = entity;
      entityEl.style.display = '';
      if (entitySep) entitySep.style.display = '';
    } else {
      entityEl.style.display = 'none';
      if (entitySep) entitySep.style.display = 'none';
    }
  }

  // ── Bottom nav sync ────────────────────────────────────────
  function _updateBottomNav() {
    const nav = $('bottom-nav');
    if (!nav) return;
    // Primary tabs in bottom bar
    nav.querySelectorAll('.bnav-btn[data-tab]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === state.tab);
    });
    // "More" button active if current tab is one of the secondary tabs
    const primaryTabs = ['today', 'pdt', 'fleet', 'budget'];
    const moreBtn = $('bnav-more-btn');
    if (moreBtn) {
      moreBtn.classList.toggle('active', !primaryTabs.includes(state.tab) && state.tab !== 'admin');
    }
    // Update active state in more sheet grid
    document.querySelectorAll('.bnav-more-item[data-tab]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === state.tab);
    });
  }

  function toggleBottomNavMore() {
    const sheet = $('bnav-more-sheet');
    if (sheet) sheet.classList.toggle('hidden');
  }

  // ── Mobile menu (burger) ────────────────────────────────────
  function toggleMobileMenu() {
    const menu = $('mobile-menu');
    if (!menu) return;
    const isOpen = !menu.classList.contains('hidden');
    if (isOpen) {
      menu.classList.add('hidden');
      document.body.style.overflow = '';
    } else {
      menu.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      // Sync active state
      menu.querySelectorAll('.mobile-menu-item[data-tab]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === state.tab);
      });
    }
  }

  // ── Keyboard shortcuts help panel ──────────────────────────
  function openShortcutsPanel() {
    const overlay = $('shortcuts-overlay');
    if (overlay) overlay.classList.remove('hidden');
  }

  function closeShortcutsPanel() {
    const overlay = $('shortcuts-overlay');
    if (overlay) overlay.classList.add('hidden');
  }


  // ═══════════════════════════════════════════════════════════
  //  CONFIRM DIALOG
  // ═══════════════════════════════════════════════════════════

  function showConfirm(msg, callback, opts) {
    $('confirm-msg').textContent = msg;
    state.confirmCallback = callback;
    const cancelBtn = $('confirm-overlay').querySelector('.btn-secondary');
    const okBtn = $('confirm-ok');
    if (cancelBtn) cancelBtn.textContent = opts?.cancelLabel || 'Cancel';
    if (okBtn) {
      okBtn.textContent = opts?.okLabel || 'Confirm';
      okBtn.className = opts?.okClass ? `btn ${opts.okClass}` : 'btn btn-danger';
    }
    $('confirm-overlay').classList.remove('hidden');
  }

  function cancelConfirm() {
    $('confirm-overlay').classList.add('hidden');
    state.confirmCallback = null;
  }

  function _confirmOk() {
    $('confirm-overlay').classList.add('hidden');
    if (state.confirmCallback) { state.confirmCallback(); state.confirmCallback = null; }
  }


  // ═══════════════════════════════════════════════════════════
  //  DIRTY STATE TRACKING — P4.5
  // ═══════════════════════════════════════════════════════════

  const _dirtySnapshots = {};

  function _snapshotModal(overlayId) {
    const overlay = $(overlayId);
    if (!overlay) return;
    const snapshot = {};
    overlay.querySelectorAll('input, select, textarea').forEach(el => {
      const key = el.id || el.name;
      if (!key) return;
      snapshot[key] = el.type === 'checkbox' ? el.checked : el.value;
    });
    _dirtySnapshots[overlayId] = snapshot;
  }

  function _isModalDirty(overlayId) {
    const snapshot = _dirtySnapshots[overlayId];
    if (!snapshot) return false;
    const overlay = $(overlayId);
    if (!overlay) return false;
    let dirty = false;
    overlay.querySelectorAll('input, select, textarea').forEach(el => {
      const key = el.id || el.name;
      if (!key || !(key in snapshot)) return;
      const current = el.type === 'checkbox' ? el.checked : el.value;
      if (snapshot[key] !== current) dirty = true;
    });
    return dirty;
  }

  function _clearSnapshot(overlayId) {
    delete _dirtySnapshots[overlayId];
  }

  function _guardedClose(overlayId, closeFn, force) {
    const overlay = $(overlayId);
    if (!overlay || overlay.classList.contains('hidden')) return;
    if (!force && _isModalDirty(overlayId)) {
      showConfirm('You have unsaved changes. Discard?', () => {
        _clearSnapshot(overlayId);
        closeFn();
      }, { cancelLabel: 'Keep Editing', okLabel: 'Discard', okClass: 'btn-warning' });
      return;
    }
    _clearSnapshot(overlayId);
    closeFn();
  }


  // ── Theme toggle ──────────────────────────────────────────────────────────
  function _applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const btn = $('theme-toggle-btn');
    if (btn) btn.textContent = theme === 'light' ? '☀️' : '🌙';
  }

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', next);
    _applyTheme(next);
  }


  // ═══════════════════════════════════════════════════════════
  //  COMMAND PALETTE (Cmd+K) — Search + Quick Actions
  // ═══════════════════════════════════════════════════════════

  let _searchOpen = false;
  let _cmdSelectedIdx = -1;

  // Quick actions available in the command palette
  const QUICK_ACTIONS = [
    { id: 'today',       icon: '📅', get label() { return t('cmd.view_today'); },  keywords: 'today schedule jour planning',    action: () => { App.setTab('today'); } },
    { id: 'new-boat',    icon: '🚤', get label() { return t('cmd.new_boat'); },  keywords: 'boat assign bateau affectation',  action: () => { App.setTab('fleet'); setTimeout(() => App.showAddBoatModal?.(), 200); } },
    { id: 'add-fuel',    icon: '⛽', get label() { return t('cmd.add_fuel'); },       keywords: 'fuel carburant essence',          action: () => { App.setTab('fuel'); setTimeout(() => App.showFuelMachineryModal?.(), 200); } },
    { id: 'export-budget', icon: '📊', get label() { return t('cmd.export_budget'); },      keywords: 'export budget xlsx download',     action: () => { App.setTab('budget'); setTimeout(() => App.budgetExportXlsx?.(), 300); } },
    { id: 'add-day',     icon: '➕', get label() { return t('cmd.add_day'); },     keywords: 'day jour tournage add',           action: () => { App.setTab('pdt'); setTimeout(() => App.addDay?.(), 200); } },
    { id: 'add-vehicle', icon: '🚐', get label() { return t('cmd.add_vehicle'); }, keywords: 'vehicle vehicule transport add', action: () => { App.setTab('transport'); setTimeout(() => App.showAddTransportVehicleModal?.(), 200); } },
    { id: 'add-worker',  icon: '👷', get label() { return t('cmd.add_worker'); },           keywords: 'worker helper labour travailleur', action: () => { App.setTab('crew'); App.crewSetSubTab('labour'); setTimeout(() => App.showAddWorkerModal?.(), 200); } },
    { id: 'add-location', icon: '📍', get label() { return t('cmd.add_location'); },       keywords: 'location lieu site add',          action: () => { App.setTab('locations'); setTimeout(() => App.showAddLocationModal?.(), 200); } },
    { id: 'add-guard',   icon: '🛡️', get label() { return t('cmd.add_guard'); },           keywords: 'guard securite add',              action: () => { App.setTab('crew'); App.crewSetSubTab('guards'); setTimeout(() => App.gcShowAddWorkerModal?.(), 200); } },
    { id: 'toggle-theme', icon: '🌓', get label() { return t('cmd.toggle_theme'); }, keywords: 'theme dark light mode sombre', action: () => { App.toggleTheme(); } },
    { id: 'shortcuts',   icon: '⌨️', get label() { return t('cmd.show_shortcuts'); }, keywords: 'keyboard shortcuts raccourcis clavier', action: () => { App.openShortcutsPanel(); } },
  ];

  function _openSearch() {
    if (_searchOpen) return;
    _searchOpen = true;
    _cmdSelectedIdx = -1;
    let overlay = $('search-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'search-overlay';
      overlay.className = 'search-overlay';
      overlay.innerHTML = `
        <div class="search-modal">
          <div class="cmd-input-row">
            <span class="cmd-icon">⌘K</span>
            <input type="text" id="search-input" class="search-input" placeholder="${t('cmd.search_placeholder')}" autocomplete="off">
          </div>
          <div id="search-results" class="search-results"></div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.addEventListener('click', e => { if (e.target === overlay) _closeSearch(); });
    }
    overlay.classList.remove('hidden');
    overlay.style.display = 'flex';
    const input = $('search-input');
    input.value = '';
    input.focus();
    _renderCommandPalette('');

    input.oninput = () => {
      clearTimeout(input._debounce);
      input._debounce = setTimeout(() => {
        _cmdSelectedIdx = -1;
        _renderCommandPalette(input.value.trim());
      }, 120);
    };
    input.onkeydown = e => {
      if (e.key === 'Escape') { _closeSearch(); return; }
      const items = $('search-results')?.querySelectorAll('.search-result-item') || [];
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        _cmdSelectedIdx = Math.min(_cmdSelectedIdx + 1, items.length - 1);
        _cmdHighlight(items);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        _cmdSelectedIdx = Math.max(_cmdSelectedIdx - 1, 0);
        _cmdHighlight(items);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const sel = _cmdSelectedIdx >= 0 ? items[_cmdSelectedIdx] : items[0];
        if (sel) sel.click();
      }
    };
  }

  function _cmdHighlight(items) {
    items.forEach((el, i) => el.classList.toggle('cmd-active', i === _cmdSelectedIdx));
    if (_cmdSelectedIdx >= 0 && items[_cmdSelectedIdx]) {
      items[_cmdSelectedIdx].scrollIntoView({ block: 'nearest' });
    }
  }

  function _closeSearch() {
    _searchOpen = false;
    const overlay = $('search-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.style.display = 'none';
    }
  }

  function _renderCommandPalette(query) {
    const container = $('search-results');
    if (!container) return;

    const q = (query || '').toLowerCase();
    let html = '';

    // Filter quick actions
    const filteredActions = QUICK_ACTIONS.filter(a => {
      if (!q) return true;
      return a.label.toLowerCase().includes(q) || a.keywords.toLowerCase().includes(q);
    });

    if (filteredActions.length > 0) {
      html += `<div class="cmd-section-label">${t('cmd.quick_actions')}</div>`;
      html += filteredActions.map((a, i) => {
        return `<div class="search-result-item cmd-action-item" data-cmd-idx="${i}" onclick="App._cmdExec('${a.id}')">
          <span class="cmd-action-icon">${a.icon}</span>
          <span class="search-result-name">${esc(a.label)}</span>
          <span class="cmd-action-hint">↵</span>
        </div>`;
      }).join('');
    }

    // Entity search (only if query >= 2 chars)
    if (q.length >= 2) {
      const results = _searchEntities(q);
      if (results.length > 0) {
        html += `<div class="cmd-section-label">${t('cmd.results')}</div>`;
        html += results.slice(0, 15).map(r => {
          const extra = r.crewSub ? `App.crewSetSubTab('${r.crewSub}');` : '';
          return `<div class="search-result-item" onclick="App.setTab('${r.tab}');${extra}App._closeSearch()">
            <span class="search-result-type">${esc(r.type)}</span>
            <span class="search-result-name">${esc(r.name)}</span>
            <span class="search-result-detail">${esc(r.detail)}</span>
          </div>`;
        }).join('');
      }
    }

    if (!html) {
      html = `<div style="color:var(--text-4);padding:1.5rem;text-align:center;font-size:.8rem">${t('common.no_results')}</div>`;
    }

    container.innerHTML = html;
  }

  function _cmdExec(actionId) {
    const action = QUICK_ACTIONS.find(a => a.id === actionId);
    if (action) {
      _closeSearch();
      action.action();
    }
  }

  function _searchEntities(q) {
    const results = [];

    // Search boats
    (state.boats || []).forEach(b => {
      if ((b.name || '').toLowerCase().includes(q) || (b.vendor || '').toLowerCase().includes(q)) {
        results.push({ type: 'Boat', name: b.name, detail: b.vendor || '', tab: 'fleet', id: b.id });
      }
    });

    // Search picture boats
    (state.pictureBoats || []).forEach(b => {
      if ((b.name || '').toLowerCase().includes(q) || (b.vendor || '').toLowerCase().includes(q)) {
        results.push({ type: 'Picture Boat', name: b.name, detail: b.vendor || '', tab: 'fleet', id: b.id });
      }
    });

    // Search transport vehicles
    (state.transportVehicles || []).forEach(v => {
      if ((v.name || '').toLowerCase().includes(q) || (v.vehicle_type || '').toLowerCase().includes(q)) {
        results.push({ type: 'Vehicle', name: v.name, detail: v.vehicle_type || '', tab: 'transport', id: v.id });
      }
    });

    // Search helpers/labour
    (state.lbWorkers || []).forEach(h => {
      if ((h.name || '').toLowerCase().includes(q) || (h.role || '').toLowerCase().includes(q)) {
        results.push({ type: 'Worker', name: h.name, detail: h.role || '', tab: 'crew', id: h.id });
      }
    });

    // Search security boats
    (state.securityBoats || []).forEach(b => {
      if ((b.name || '').toLowerCase().includes(q) || (b.vendor || '').toLowerCase().includes(q)) {
        results.push({ type: 'Security Boat', name: b.name, detail: b.vendor || '', tab: 'fleet', id: b.id });
      }
    });

    // Search shooting days
    (state.shootingDays || []).forEach(d => {
      const dayName = d.game_name || d.location || d.notes || '';
      if (dayName.toLowerCase().includes(q) || (d.date || '').includes(q)) {
        results.push({ type: 'Day', name: `Day ${d.day_number || '?'} - ${d.date}`, detail: dayName, tab: 'pdt', id: d.id });
      }
    });

    // Search functions/roles
    (state.functions || []).forEach(f => {
      if ((f.name || '').toLowerCase().includes(q)) {
        results.push({ type: 'Function', name: f.name, detail: f.function_group || '', tab: 'fleet', id: f.id });
      }
    });

    // Search guard camp workers
    (state.gcWorkers || []).forEach(g => {
      if ((g.name || '').toLowerCase().includes(q) || (g.role || '').toLowerCase().includes(q)) {
        results.push({ type: 'Guard', name: g.name, detail: g.role || '', tab: 'crew', id: g.id, crewSub: 'guards' });
      }
    });

    // Search guard posts
    (state.guardPosts || []).forEach(p => {
      if ((p.name || '').toLowerCase().includes(q) || (p.location || '').toLowerCase().includes(q)) {
        results.push({ type: 'Guard Post', name: p.name, detail: p.location || '', tab: 'crew', id: p.id, crewSub: 'guards' });
      }
    });

    // Search location sites
    (state.locationSites || []).forEach(l => {
      if ((l.name || '').toLowerCase().includes(q) || (l.location_type || '').toLowerCase().includes(q)) {
        results.push({ type: 'Location', name: l.name, detail: l.location_type || '', tab: 'locations', id: l.id });
      }
    });

    return results;
  }

  // Legacy compat
  function _doSearch(query) { _renderCommandPalette(query); }


  // ═══════════════════════════════════════════════════════════
  //  MODULE LOADER — AXE 8.2
  // ═══════════════════════════════════════════════════════════

  const _loadedModules = {};
  const MODULE_MAP = {
    'today':          '/static/modules/today.js',
    'fleet':          '/static/modules/fleet.js',
    'pdt':            '/static/modules/pdt.js',
    'boats':          '/static/modules/boats.js',
    'picture-boats':  '/static/modules/picture-boats.js',
    'budget':         '/static/modules/budget.js',
    'transport':      '/static/modules/transport.js',
    'fuel':           '/static/modules/fuel.js',
    'labour':         '/static/modules/labour.js',
    'security-boats': '/static/modules/security-boats.js',
    'locations':      '/static/modules/locations.js',
    'crew':           '/static/modules/crew.js',
    'guards':         '/static/modules/guards.js',
    'fnb':            '/static/modules/fnb.js',
    'dashboard':      '/static/modules/dashboard.js',
    'alerts':         '/static/modules/alerts.js',
    'admin':          '/static/modules/admin.js',
    'activity':       '/static/modules/activity.js',
    'comments':       '/static/modules/comments.js',
    'notifications':  '/static/modules/notifications.js',
    'documents':      '/static/modules/documents.js',
  };

  // Dependencies: some modules need other modules loaded first
  const MODULE_DEPS = {
    'budget': ['boats', 'transport', 'fuel', 'labour', 'security-boats', 'locations', 'guards'],
    'dashboard': ['boats'],
    'fleet': ['boats', 'picture-boats', 'security-boats'],
    'crew': ['labour', 'guards'],
  };

  async function _loadModule(name) {
    if (_loadedModules[name]) return;
    // Load dependencies first
    const deps = MODULE_DEPS[name] || [];
    for (const dep of deps) {
      await _loadModule(dep);
    }
    if (_loadedModules[name]) return; // check again after deps
    const url = MODULE_MAP[name];
    if (!url) return;
    try {
      _loadedModules[name] = true; // Mark early to prevent re-entry
      await import(url);
    } catch (e) {
      console.error(`[MODULE] Failed to load ${name}:`, e);
      _loadedModules[name] = false;
    }
  }

  // Preload critical modules on startup
  async function _preloadModules() {
    // PDT and boats are loaded at startup, preload their modules
    await Promise.all([
      _loadModule('pdt'),
      _loadModule('boats'),
      _loadModule('alerts'),
      _loadModule('activity'),
      _loadModule('comments'),
      _loadModule('notifications'),
    ]);
  }

  // ── Group management ──────────────────────────────────────
  function openGroupsModal(ctx) {
    $('groups-modal-overlay').dataset.ctx = ctx;
    $('ng-name').value  = '';
    $('ng-color').value = '#6b7280';
    _renderGroupsList(ctx);
    $('groups-modal-overlay').classList.remove('hidden');
  }

  function closeGroupsModal() { $('groups-modal-overlay').classList.add('hidden'); }

  function _renderGroupsList(ctx) {
    const groups = ctx === 'security' ? state.sbGroups : ctx === 'labour' ? state.lbGroups : ctx === 'guard_camp' ? state.gcGroups : ctx === 'picture' ? state.pbGroups : ctx === 'transport' ? state.tbGroups : state.boatGroups;
    $('groups-list').innerHTML = groups.map((g, i) => `
      <div style="display:flex;align-items:center;gap:.5rem;padding:.3rem .4rem;border-radius:6px;background:var(--bg-surface)">
        <span style="width:14px;height:14px;border-radius:3px;background:${g.color};flex-shrink:0"></span>
        <span style="flex:1;font-size:.82rem;color:var(--text-0)">${esc(g.name)}</span>
        <button class="btn btn-sm btn-danger btn-icon" onclick="App.removeGroup('${ctx}',${i})" title="Delete">✕</button>
      </div>`).join('') || '<div style="color:var(--text-4);font-size:.8rem">No groups</div>';
  }

  function addGroup() {
    const ctx  = $('groups-modal-overlay').dataset.ctx;
    const name = $('ng-name').value.trim();
    if (!name) { toast('Name required', 'error'); return; }
    const groups = ctx === 'security' ? state.sbGroups : ctx === 'labour' ? state.lbGroups : ctx === 'guard_camp' ? state.gcGroups : ctx === 'picture' ? state.pbGroups : ctx === 'transport' ? state.tbGroups : state.boatGroups;
    if (groups.find(g => g.name === name)) { toast('This group already exists', 'error'); return; }
    groups.push({ name, color: $('ng-color').value });
    _saveGroups(ctx);
    _renderGroupsList(ctx);
    $('ng-name').value = '';
    if (ctx === 'security') App.renderSbRoleCards?.(); else if (ctx === 'labour') App.renderLbRoleCards?.(); else if (ctx === 'guard_camp') App.renderGcRoleCards?.(); else if (ctx === 'picture') App.renderPbRoleCards?.(); else if (ctx === 'transport') App.renderTbRoleCards?.(); else App.renderRoleCards?.();
  }

  function removeGroup(ctx, idx) {
    const groups = ctx === 'security' ? state.sbGroups : ctx === 'labour' ? state.lbGroups : ctx === 'guard_camp' ? state.gcGroups : ctx === 'picture' ? state.pbGroups : ctx === 'transport' ? state.tbGroups : state.boatGroups;
    const group  = groups[idx];
    const funcs  = ctx === 'security' ? state.securityFunctions : ctx === 'labour' ? state.labourFunctions : ctx === 'guard_camp' ? state.gcFunctions : ctx === 'picture' ? state.pictureFunctions : ctx === 'transport' ? state.transportFunctions : state.functions;
    const inUse  = funcs.some(f => f.function_group === group.name);
    if (inUse) { toast(`Group "${group.name}" is used by functions`, 'error'); return; }
    groups.splice(idx, 1);
    _saveGroups(ctx);
    _renderGroupsList(ctx);
    if (ctx === 'security') App.renderSbRoleCards?.(); else if (ctx === 'labour') App.renderLbRoleCards?.(); else if (ctx === 'guard_camp') App.renderGcRoleCards?.(); else if (ctx === 'picture') App.renderPbRoleCards?.(); else if (ctx === 'transport') App.renderTbRoleCards?.(); else App.renderRoleCards?.();
  }

  function _saveGroups(ctx) {
    if (ctx === 'security') {
      try { localStorage.setItem('sb_groups', JSON.stringify(state.sbGroups)); } catch(e) {}
    } else if (ctx === 'picture') {
      try { localStorage.setItem('pb_groups', JSON.stringify(state.pbGroups)); } catch(e) {}
    } else if (ctx === 'transport') {
      try { localStorage.setItem('transport_groups', JSON.stringify(state.tbGroups)); } catch(e) {}
    } else if (ctx === 'labour') {
      try { localStorage.setItem('labour_groups', JSON.stringify(state.lbGroups)); } catch(e) {}
    } else if (ctx === 'guard_camp') {
      try { localStorage.setItem('guard_camp_groups', JSON.stringify(state.gcGroups)); } catch(e) {}
    } else {
      try { localStorage.setItem('boat_groups', JSON.stringify(state.boatGroups)); } catch(e) {}
    }
  }


  async function init() {
    // Load i18n translations before rendering
    if (typeof I18n !== 'undefined') await I18n.init(localStorage.getItem('locale') || 'en');

    // Apply saved theme
    _applyTheme(localStorage.getItem('theme') || 'dark');

    // Auth: redirect to login if no access token
    if (!_getAccessToken()) {
      window.location.href = '/login';
      return;
    }

    $('confirm-ok').onclick = _confirmOk;

    // Restore locked days from localStorage
    try {
      state.lockedDays   = JSON.parse(localStorage.getItem('schedule_locked_days') || '{}');
    } catch(e) { state.lockedDays = {}; }
    try {
      state.pbLockedDays = JSON.parse(localStorage.getItem('pb_locked_days') || '{}');
    } catch(e) { state.pbLockedDays = {}; }
    // Restore dynamic groups from localStorage
    try {
      state.boatGroups = JSON.parse(localStorage.getItem('boat_groups') || 'null') || DEFAULT_BOAT_GROUPS;
    } catch(e) { state.boatGroups = DEFAULT_BOAT_GROUPS; }
    try {
      state.pbGroups   = JSON.parse(localStorage.getItem('pb_groups')   || 'null') || DEFAULT_PB_GROUPS;
    } catch(e) { state.pbGroups = DEFAULT_PB_GROUPS; }
    try {
      state.tbLockedDays = JSON.parse(localStorage.getItem('transport_locked_days') || '{}');
    } catch(e) { state.tbLockedDays = {}; }
    try {
      state.tbGroups   = JSON.parse(localStorage.getItem('transport_groups') || 'null') || DEFAULT_TB_GROUPS;
    } catch(e) { state.tbGroups = DEFAULT_TB_GROUPS; }
    try {
      state.sbGroups   = JSON.parse(localStorage.getItem('sb_groups') || 'null') || DEFAULT_SB_GROUPS;
    } catch(e) { state.sbGroups = DEFAULT_SB_GROUPS; }
    try {
      state.lbGroups   = JSON.parse(localStorage.getItem('labour_groups') || 'null') || DEFAULT_LB_GROUPS;
    } catch(e) { state.lbGroups = DEFAULT_LB_GROUPS; }
    try {
      state.lbLockedDays = JSON.parse(localStorage.getItem('labour_locked_days') || '{}');
    } catch(e) { state.lbLockedDays = {}; }
    // Fuel prices + locked days are now loaded from DB (see _loadFuelGlobals below)
    // Keep localStorage as fallback for initial render before async load completes
    try {
      state.fuelLockedDays = JSON.parse(localStorage.getItem('fuel_locked_days') || '{}');
    } catch(e) { state.fuelLockedDays = {}; }
    try {
      const fp = JSON.parse(localStorage.getItem('fuel_price_per_l') || 'null');
      if (fp) state.fuelPricePerL = fp;
    } catch(e) {}

    document.addEventListener('click', e => {
      const wrap = $('export-wrap');
      if (wrap && !wrap.contains(e.target)) $('export-menu').classList.add('hidden');
      const pbWrap = $('pb-export-wrap');
      if (pbWrap && !pbWrap.contains(e.target)) $('pb-export-menu')?.classList.add('hidden');
      const tbWrap = $('tb-export-wrap');
      if (tbWrap && !tbWrap.contains(e.target)) $('tb-export-menu')?.classList.add('hidden');
      const lbWrap = $('lb-export-wrap');
      if (lbWrap && !lbWrap.contains(e.target)) $('lb-export-menu')?.classList.add('hidden');
      const fuelWrap = $('fuel-exp-wrap');
      if (fuelWrap && !fuelWrap.contains(e.target)) $('fuel-exp-menu')?.classList.add('hidden');
      // Close schedule popover if clicking outside
      const pop = $('schedule-popover');
      if (pop && !pop.classList.contains('hidden') && !pop.contains(e.target)) {
        closeSchedulePopover();
      }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        // If confirm dialog is visible, dismiss it first and stop
        const confirmOv = $('confirm-overlay');
        if (confirmOv && !confirmOv.classList.contains('hidden')) {
          cancelConfirm();
          return;
        }
        // Close alerts panel (AXE 7.3)
        if (_alertsPanelOpen) { App.toggleAlertsPanel?.(); }
        closeShortcutsPanel();
        const moreSheet = $('bnav-more-sheet');
        if (moreSheet && !moreSheet.classList.contains('hidden')) { moreSheet.classList.add('hidden'); }
        App.closeDayModal?.();
        App.closeAssignModal?.();
        App.closeAddBoatModal?.();
        App.closeAddPictureBoatModal?.();
        App.closeAddTransportVehicleModal?.();
        App.closeAddFunctionModal?.();
        App.closeBoatView?.();
        App.closeBoatDetail?.();
        closeSchedulePopover();
        App.closeAddLocationModal?.();
        App.closeAddGuardModal?.();
        App.closeAddSecurityBoatModal?.();
        App.closeAddWorkerModal?.();
        App.closeFnbCatModal?.();
        App.closeFnbItemModal?.();
        App.closeFuelMachineryModal?.();
        if (state.selectedBoat) {
          state.selectedBoat  = null;
          state.pendingFuncId = null;
          state.pendingDate   = null;
          App.renderBoatList?.();
          App.renderRoleCards?.();
        }
        if (state.pbSelectedBoat || state.pbPendingFuncId) {
          state.pbSelectedBoat  = null;
          state.pbPendingFuncId = null;
          state.pbPendingDate   = null;
          App.renderPbBoatList?.();
          App.renderPbRoleCards?.();
        }
        if (state.tbSelectedVehicle || state.tbPendingFuncId) {
          state.tbSelectedVehicle = null;
          state.tbPendingFuncId   = null;
          state.tbPendingDate     = null;
          App.renderTbVehicleList?.();
          App.renderTbRoleCards?.();
        }
        if (state.sbSelectedBoat || state.sbPendingFuncId) {
          state.sbSelectedBoat  = null;
          state.sbPendingFuncId = null;
          state.sbPendingDate   = null;
          App.renderSbBoatList?.();
          App.renderSbRoleCards?.();
        }
        if (state.lbSelectedWorker || state.lbPendingFuncId) {
          state.lbSelectedWorker = null;
          state.lbPendingFuncId  = null;
          state.lbPendingDate    = null;
          App.renderLbWorkerList?.();
          App.renderLbRoleCards?.();
        }
      }
      // Enter key — submit visible modal (AXE 1.12)
      if (e.key === 'Enter') {
        const tag = (e.target.tagName || '').toLowerCase();
        // Don't intercept Enter in textareas (newlines) — use Ctrl+Enter there
        if (tag === 'textarea') {
          if (e.ctrlKey || e.metaKey) {
            // Ctrl+Enter in textarea = submit the modal
            e.preventDefault();
            const overlay = e.target.closest('.modal-overlay');
            if (overlay) {
              const btn = overlay.querySelector('.modal-footer .btn-primary');
              if (btn) btn.click();
            }
          }
          return;
        }
        // For inputs/selects inside a modal, Enter submits
        if (tag === 'input' || tag === 'select') {
          const overlay = e.target.closest('.modal-overlay');
          if (overlay && !overlay.classList.contains('hidden')) {
            e.preventDefault();
            const btn = overlay.querySelector('.modal-footer .btn-primary');
            if (btn) btn.click();
          }
        }
      }
      // ? key — open shortcuts help (only when not in an input)
      const tag = (e.target.tagName || '').toLowerCase();
      const isInput = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
      if (e.key === '?' && !isInput && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        openShortcutsPanel();
      }
      // Number keys 1-0 for quick tab navigation (not in inputs)
      if (!isInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const numTabs = ['today', 'pdt', 'locations', 'fleet', 'transport', 'fuel', 'crew', 'fnb', 'budget'];
        const idx = '1234567890'.indexOf(e.key);
        if (idx >= 0 && idx < numTabs.length) {
          e.preventDefault();
          setTab(numTabs[idx]);
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        _openSearch();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && state.tab === 'boats') {
        e.preventDefault();
        undoBoat();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && state.tab === 'picture-boats') {
        e.preventDefault();
        pbUndoBoat();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && state.tab === 'security-boats') {
        e.preventDefault();
        sbUndoBoat();
      }
    });

    // Initialize pull-to-refresh gesture
    _initPullToRefresh();

    // AXE 5.4: Init network indicator + offline counter
    _updateNetIndicator(navigator.onLine);
    // P6.1: Init IndexedDB offline queue (migrates localStorage queue)
    if (window.OfflineQueue) await window.OfflineQueue.init();
    _updateOfflineCounter();

    try {
      // Auth: fetch user info and show project selector
      await _loadAuthState();
      if (authState.memberships.length === 1) {
        // Auto-select if only one project
        await _selectProject(authState.memberships[0].production_id, authState.memberships[0].role);
      } else if (authState.memberships.length > 1) {
        _showProjectSelector();
      } else {
        document.getElementById('main-content').innerHTML =
          `<div style="color:var(--text-3);padding:3rem;text-align:center">
            ${t('auth.no_project')}<br>
            <small>${t('auth.ask_admin')}</small>
          </div>`;
      }
    } catch (e) {
      console.error('Init error:', e);
      if (e.message === 'Session expired') return;
      document.getElementById('main-content').innerHTML =
        `<div style="color:var(--red);padding:3rem;text-align:center">
          ${t('auth.load_error', { message: esc(e.message) })}<br>
          <small>${t('auth.check_server')}</small>
        </div>`;
    }
  }


  // ═══════════════════════════════════════════════════════════
  //  FAB — Floating Action Button (mobile, contextual per tab)
  // ═══════════════════════════════════════════════════════════

  const FAB_CONFIG = {
    pdt:              { get label() { return t('fab.day'); },       action: () => App.addDay?.() },
    boats:            { get label() { return t('fab.boat'); },      action: () => App.showAddBoatModal?.() },
    'picture-boats':  { get label() { return t('fab.boat'); },      action: () => App.showAddPictureBoatModal?.() },
    'security-boats': { get label() { return t('fab.boat'); },      action: () => App.showAddSecurityBoatModal?.() },
    transport:        { get label() { return t('fab.vehicle'); },   action: () => App.showAddTransportVehicleModal?.() },
    crew:             { get label() { return t('fab.worker'); },    action: () => { const sub = App._crewSubTab || 'labour'; sub === 'guards' ? App.gcShowAddWorkerModal?.() : App.showAddWorkerModal?.(); } },
    labour:           { get label() { return t('fab.worker'); },    action: () => App.showAddWorkerModal?.() },
    guards:           { get label() { return t('fab.guard'); },     action: () => App.gcShowAddWorkerModal?.() },
    locations:        { get label() { return t('fab.location'); },  action: () => App.showAddLocationModal?.() },
    fnb:              { get label() { return t('fab.category'); },  action: () => App.showFnbCatModal?.() },
  };

  // Contextual actions per module (for FAB long-press menu)
  const FAB_CONTEXT_ACTIONS = {
    fleet: [
      { get label() { return t('fab.add_boat'); }, action: () => App.showAddBoatModal?.() },
      { get label() { return t('fab.add_picture_boat'); }, action: () => App.showAddPictureBoatModal?.() },
      { get label() { return t('fab.add_security_boat'); }, action: () => App.showAddSecurityBoatModal?.() },
    ],
    pdt: [
      { get label() { return t('fab.add_shooting_day'); }, action: () => App.addDay?.() },
    ],
    transport: [
      { get label() { return t('fab.add_vehicle'); }, action: () => App.showAddTransportVehicleModal?.() },
    ],
    fuel: [
      { get label() { return t('fab.add_fuel_entry'); }, action: () => App.showFuelMachineryModal?.() },
    ],
    crew: [
      { get label() { return t('fab.add_worker'); }, action: () => { App.crewSetSubTab('labour'); setTimeout(() => App.showAddWorkerModal?.(), 100); } },
      { get label() { return t('fab.add_guard'); }, action: () => { App.crewSetSubTab('guards'); setTimeout(() => App.gcShowAddWorkerModal?.(), 100); } },
    ],
    locations: [
      { get label() { return t('fab.add_location'); }, action: () => App.showAddLocationModal?.() },
    ],
    fnb: [
      { get label() { return t('fab.add_category'); }, action: () => App.showFnbCatModal?.() },
      { get label() { return t('fab.add_item'); }, action: () => App.showFnbItemModal?.() },
    ],
    budget: [
      { get label() { return t('fab.export_budget_xlsx'); }, action: () => App.budgetExportXlsx?.() },
    ],
  };

  function _updateFab() {
    const fab = $('fab-btn');
    if (!fab) return;
    const cfg = FAB_CONFIG[state.tab];
    if (!cfg || !_canEdit()) {
      fab.style.display = 'none';
      _closeFabMenu();
      return;
    }
    fab.style.display = 'flex';
    const lbl = $('fab-label');
    if (lbl) lbl.textContent = cfg.label;
  }

  let _fabMenuOpen = false;

  function fabAction() {
    const cfg = FAB_CONFIG[state.tab];
    if (cfg) cfg.action();
  }

  function _toggleFabMenu() {
    if (_fabMenuOpen) { _closeFabMenu(); return; }
    const ctx = FAB_CONTEXT_ACTIONS[state.tab];
    if (!ctx || ctx.length <= 1) return; // No menu if single action
    _fabMenuOpen = true;
    let menu = $('fab-context-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'fab-context-menu';
      menu.className = 'fab-context-menu';
      document.body.appendChild(menu);
    }
    menu.innerHTML = ctx.map((a, i) =>
      `<button class="fab-ctx-item" onclick="App._fabCtxAction(${i})">${esc(a.label)}</button>`
    ).join('');
    menu.classList.remove('hidden');
    menu.style.display = 'flex';
    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', _fabMenuOutside, { once: true });
    }, 10);
  }

  function _fabMenuOutside(e) {
    const menu = $('fab-context-menu');
    const fab = $('fab-btn');
    if (menu && !menu.contains(e.target) && fab && !fab.contains(e.target)) {
      _closeFabMenu();
    }
  }

  function _closeFabMenu() {
    _fabMenuOpen = false;
    const menu = $('fab-context-menu');
    if (menu) { menu.classList.add('hidden'); menu.style.display = 'none'; }
  }

  function _fabCtxAction(idx) {
    const ctx = FAB_CONTEXT_ACTIONS[state.tab];
    if (ctx && ctx[idx]) {
      _closeFabMenu();
      ctx[idx].action();
    }
  }

  // Hook into setTab to update FAB
  const _origSetTab = setTab;


  // ═══════════════════════════════════════════════════════════
  //  Pull-to-Refresh (touch gesture on view panels)
  // ═══════════════════════════════════════════════════════════

  let _ptrStartY = 0;
  let _ptrActive = false;
  let _ptrTriggered = false;

  function _initPullToRefresh() {
    const mc = $('main-content');
    if (!mc) return;

    mc.addEventListener('touchstart', (e) => {
      // Only activate if scrolled to top
      const panel = mc.querySelector('.view-panel.active');
      if (!panel || panel.scrollTop > 5) return;
      _ptrStartY = e.touches[0].clientY;
      _ptrActive = true;
      _ptrTriggered = false;
    }, { passive: true });

    mc.addEventListener('touchmove', (e) => {
      if (!_ptrActive) return;
      const dy = e.touches[0].clientY - _ptrStartY;
      const indicator = $('ptr-indicator');
      const icon = $('ptr-icon');
      const text = $('ptr-text');
      if (dy > 10 && dy < 150) {
        indicator.classList.add('ptr-pulling');
        if (dy > 70) {
          icon.classList.add('ptr-ready');
          text.textContent = t('ptr.release');
          _ptrTriggered = true;
        } else {
          icon.classList.remove('ptr-ready');
          text.textContent = t('ptr.pull');
          _ptrTriggered = false;
        }
      }
    }, { passive: true });

    mc.addEventListener('touchend', () => {
      if (!_ptrActive) return;
      _ptrActive = false;
      const indicator = $('ptr-indicator');
      const icon = $('ptr-icon');
      const text = $('ptr-text');

      if (_ptrTriggered) {
        // Show refreshing state
        icon.innerHTML = '';
        const spinner = document.createElement('span');
        spinner.className = 'ptr-spinner';
        icon.parentNode.insertBefore(spinner, icon);
        icon.style.display = 'none';
        text.textContent = t('ptr.refreshing');
        indicator.classList.remove('ptr-pulling');
        indicator.classList.add('ptr-refreshing');

        // Reload current tab data
        _reloadCurrentTab().finally(() => {
          setTimeout(() => {
            indicator.classList.remove('ptr-refreshing');
            spinner.remove();
            icon.style.display = '';
            icon.innerHTML = '\u2193';
            icon.classList.remove('ptr-ready');
            text.textContent = t('ptr.pull');
            toast(t('common.data_refreshed'), 'success');
          }, 400);
        });
      } else {
        indicator.classList.remove('ptr-pulling');
        icon.classList.remove('ptr-ready');
        text.textContent = t('ptr.pull');
      }
      _ptrTriggered = false;
    }, { passive: true });
  }

  async function _reloadCurrentTab() {
    const tab = state.tab;
    try {
      if (tab === 'pdt')             { state.shootingDays = await api('GET', `/api/productions/${state.prodId}/shooting-days`); App.renderPDT?.(); }
      else if (tab === 'boats')      { const [b,f,a] = await Promise.all([api('GET',`/api/productions/${state.prodId}/boats`), api('GET',`/api/productions/${state.prodId}/boat-functions?context=boats`), api('GET',`/api/productions/${state.prodId}/assignments`)]); state.boats=b; state.functions=f; state.assignments=a; App.renderBoats?.(); }
      else if (tab === 'picture-boats')   { const [b,f,a] = await Promise.all([api('GET',`/api/productions/${state.prodId}/picture-boats`), api('GET',`/api/productions/${state.prodId}/boat-functions?context=picture`), api('GET',`/api/productions/${state.prodId}/picture-boat-assignments`)]); state.pictureBoats=b; state.pictureFunctions=f; state.pictureAssignments=a; App.renderPictureBoats?.(); }
      else if (tab === 'security-boats')  { App._loadAndRenderSecurityBoats?.(); }
      else if (tab === 'transport')       { App._loadAndRenderTransport?.(); }
      else if (tab === 'fuel')            { App._loadAndRenderFuel?.(); }
      else if (tab === 'labour')          { App._loadAndRenderLabour?.(); }
      else if (tab === 'locations')       { state.locationSchedules = null; App.renderLocations?.(); }
      else if (tab === 'guards')          { state.guardSchedules = null; state.locationSchedules = null; state.locationSites = null; App.renderGuards?.(); }
      else if (tab === 'fnb')             { state.fnbCategories = null; state.fnbItems = null; state.fnbEntries = null; App.renderFnb?.(); }
      else if (tab === 'budget')          { App.renderBudget?.(); }
      else if (tab === 'dashboard')       { App.renderDashboard?.(); }
    } catch(e) { toast('Refresh failed: ' + e.message, 'error'); }
  }


  // ═══════════════════════════════════════════════════════════
  //  TAB SWITCHING WITH LAZY MODULE LOADING — AXE 8.2
  // ═══════════════════════════════════════════════════════════

  // Override the original setTab with lazy-loading version
  const _originalSetTab = setTab;

  async function setTabLazy(tab) {
    state.tab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
    const panel = $(`view-${tab}`);
    if (panel) panel.classList.add('active');

    // P4.7 — Show immediate skeleton feedback while module loads
    const _loadingTargets = {
      pdt: () => { const tb = $('pdt-tbody'); if (tb) tb.innerHTML = `<tr><td colspan="13">${_skeletonTable(8, 12)}</td></tr>`; },
      fleet: () => _showLoading('fleet-cards', 'cards', { count: 6 }),
      budget: () => _showLoading('budget-content', 'stats', { count: 3 }),
    };
    if (_loadingTargets[tab]) _loadingTargets[tab]();

    // Load module for this tab
    const moduleKey = tab === 'picture-boats' ? 'picture-boats'
                    : tab === 'security-boats' ? 'security-boats'
                    : tab;
    if (MODULE_MAP[moduleKey]) {
      await _loadModule(moduleKey);
    }

    // Call render functions (now available on App after module load)
    if (tab === 'today')           App.renderToday?.();
    if (tab === 'fleet')           App.loadAndRenderFleet?.();
    if (tab === 'crew')            App._renderCrewSubTab?.();
    if (tab === 'dashboard')       App.renderDashboard?.();
    if (tab === 'pdt')             { if (typeof _pdtView !== 'undefined' && _pdtView === 'calendar') { App._initCalMonth?.(); App.renderPDTCalendar?.(); } else App.renderPDT?.(); _hideLoading('pdt-tbody'); }
    if (tab === 'boats')           { _tabCtx = 'boats';     App.renderBoats?.(); }
    if (tab === 'picture-boats')   { _tabCtx = 'picture';   App.renderPictureBoats?.(); }
    if (tab === 'transport')       { _tabCtx = 'transport'; App._loadAndRenderTransport?.(); }
    if (tab === 'fuel')            App._loadAndRenderFuel?.();
    if (tab === 'budget')          App.renderBudget?.();
    if (tab === 'labour')          { _tabCtx = 'labour'; App._loadAndRenderLabour?.(); }
    if (tab === 'security-boats')  App._loadAndRenderSecurityBoats?.();
    if (tab === 'locations')       { state.locationSchedules = null; App.renderLocations?.(); }
    if (tab === 'guards')          { state.guardSchedules = null; state.locationSchedules = null; state.locationSites = null; App.renderGuards?.(); }
    if (tab === 'fnb')             { state.fnbCategories = null; state.fnbItems = null; state.fnbEntries = null; App.renderFnb?.(); }
    if (tab === 'documents')       App.renderDocuments?.();
    if (tab === 'timeline')        App.renderTimeline?.();
    if (tab === 'admin')           App.adminSetTab?.(_adminTab || 'users');
    _updateFab();
    _updateBreadcrumb();
    _updateBottomNav();
  }


  // ═══════════════════════════════════════════════════════════
  //  SHARED CONTEXT FOR MODULES — AXE 8.2
  // ═══════════════════════════════════════════════════════════

  // Expose shared utilities for module files to access
  window._SL = {
    state, authState, $, esc, api, toast, _pushUndo, fmtMoney, fmtDate, fmtDateLong,
    _localDk, workingDays, activeWorkingDays, computeWd, effectiveStatus,
    waveClass, waveLabel, _morphHTML, _morphChildren, _morphAttributes,
    _debouncedRender, _renderTimers,
    _flashSaved, _flashSavedCard, _queueCellFlash,
    _skeletonCards, _skeletonTable, _showLoading, _hideLoading,
    _virtualScheduleSetup, _getVisibleColRange, _vcolWidth,
    VCOL_WIDTH_DESKTOP, VCOL_WIDTH_MOBILE, VCOL_BUFFER,
    _saveScheduleScroll, _restoreScheduleScroll, _scheduleCellBg,
    _canEdit, _canEditPrices, _canEditFuelPrices, _isAdmin, _canViewTab,
    _canExport, _canImport, _canViewMoney, _getModulePerm,
    _applyPriceRestrictions, _applyUIRestrictions,
    authFetch, authDownload, _getAccessToken,
    STATUS_LABEL, SCHEDULE_START, SCHEDULE_END, EV_DEFAULTS,
    EV_LABEL: typeof EV_LABEL !== 'undefined' ? EV_LABEL : {},
    EV_CLASS: typeof EV_CLASS !== 'undefined' ? EV_CLASS : {},
    DEFAULT_BOAT_GROUPS, DEFAULT_PB_GROUPS, DEFAULT_TB_GROUPS,
    _groupColor, _groupOrder,
    _invalidateCache,
    loadShootingDays, loadBoatsData, loadPictureBoatsData,
    showConfirm, cancelConfirm,
    _snapshotModal, _isModalDirty, _clearSnapshot, _guardedClose,
    closeSchedulePopover: typeof closeSchedulePopover === 'function' ? closeSchedulePopover : () => {},
    renderSchedulePopover: typeof renderSchedulePopover === 'function' ? renderSchedulePopover : () => {},
    _updateBreadcrumb, _updateBottomNav, _updateFab,
    _loadModule,
    emptyState,
    // Multi-select — these may be defined in boats module, expose stubs
    _multiSelect: typeof _multiSelect !== 'undefined' ? _multiSelect : { active: false, cells: [] },
    _onScheduleMouseDown: typeof _onScheduleMouseDown === 'function' ? _onScheduleMouseDown : () => {},
    _onScheduleMouseOver: typeof _onScheduleMouseOver === 'function' ? _onScheduleMouseOver : () => {},
    multiSelectFill: typeof multiSelectFill === 'function' ? multiSelectFill : () => {},
    multiSelectClear: typeof multiSelectClear === 'function' ? multiSelectClear : () => {},
    multiSelectCancel: typeof multiSelectCancel === 'function' ? multiSelectCancel : () => {},
    // Expose mutable shared vars
    get tabCtx() { return _tabCtx; },
    set tabCtx(v) { _tabCtx = v; },
    get assignCtx() { return _assignCtx; },
    set assignCtx(v) { _assignCtx = v; },
    get schPop() { return _schPop; },
    set schPop(v) { _schPop = v; },
    get drag() { return _drag; },
    set drag(v) { _drag = v; },
    get dragJustEnded() { return _dragJustEnded; },
    set dragJustEnded(v) { _dragJustEnded = v; },
    // Export date range (AXE 2.1)
    openExportDateModal, closeExportDateModal, confirmExportDate,
    exportDateShortcut, _selectExportFormat, _exportWithDates,
  };

  // ── Export Date Range Modal (AXE 2.1) ─────────────────────
  let _exportDateCallback = null;
  let _exportDateModule = null;

  function openExportDateModal(module, title, formats, callback) {
    _exportDateCallback = callback;
    _exportDateModule = module;
    const overlay = $('export-date-overlay');
    const titleEl = $('export-date-title');
    const subtitleEl = $('export-date-subtitle');
    const formatsEl = $('export-date-formats');
    if (!overlay) return callback(null, null, formats?.[0]?.key || 'csv');

    titleEl.textContent = title || 'Export';
    subtitleEl.textContent = `Select date range for ${title || 'export'}`;

    // Format buttons
    if (formats && formats.length > 1) {
      formatsEl.innerHTML = `
        <div style="font-size:.7rem;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:.35rem">Format</div>
        <div style="display:flex;gap:.35rem;flex-wrap:wrap" id="export-format-btns">
          ${formats.map((f, i) => `
            <button class="btn btn-sm export-fmt-btn" data-fmt="${f.key}"
              style="font-size:.72rem;padding:.25rem .6rem;border:1px solid var(--border);${i === 0 ? 'background:#3B82F6;color:#fff;border-color:#3B82F6' : 'background:var(--bg-surface);color:var(--text-2)'}"
              onclick="App._selectExportFormat('${f.key}')">${f.label}</button>
          `).join('')}
        </div>`;
    } else {
      formatsEl.innerHTML = '';
    }

    // Load smart defaults
    _loadExportDefaults(module);

    overlay.classList.remove('hidden');
    // Focus the from field
    setTimeout(() => $('export-date-from')?.focus(), 100);
  }

  function closeExportDateModal() {
    const overlay = $('export-date-overlay');
    if (overlay) overlay.classList.add('hidden');
    _exportDateCallback = null;
    _exportDateModule = null;
  }

  function _selectExportFormat(fmt) {
    const btns = document.querySelectorAll('.export-fmt-btn');
    btns.forEach(b => {
      if (b.dataset.fmt === fmt) {
        b.style.background = '#3B82F6';
        b.style.color = '#fff';
        b.style.borderColor = '#3B82F6';
      } else {
        b.style.background = 'var(--bg-surface)';
        b.style.color = 'var(--text-2)';
        b.style.borderColor = 'var(--border)';
      }
    });
  }

  function _getSelectedExportFormat() {
    const active = document.querySelector('.export-fmt-btn[style*="#3B82F6"]');
    return active ? active.dataset.fmt : 'csv';
  }

  async function _loadExportDefaults(module) {
    const fromEl = $('export-date-from');
    const toEl = $('export-date-to');
    if (!fromEl || !toEl) return;
    try {
      const defaults = await api('GET', `/api/productions/${state.prodId}/export-defaults/${module}`);
      if (defaults.from) fromEl.value = defaults.from;
      if (defaults.to) toEl.value = defaults.to;
    } catch (e) {
      // Fallback: use production dates
      if (state.production) {
        fromEl.value = state.production.start_date || '';
        toEl.value = state.production.end_date || '';
      }
    }
  }

  async function confirmExportDate() {
    const fromEl = $('export-date-from');
    const toEl = $('export-date-to');
    const dateFrom = fromEl ? fromEl.value : '';
    const dateTo = toEl ? toEl.value : '';
    const fmt = _getSelectedExportFormat();

    // Save preference
    if (_exportDateModule && state.prodId) {
      api('POST', `/api/productions/${state.prodId}/export-defaults/${_exportDateModule}`,
          { from: dateFrom, to: dateTo }).catch(() => {});
    }

    closeExportDateModal();

    if (_exportDateCallback) {
      _exportDateCallback(dateFrom, dateTo, fmt);
    }
  }

  function exportDateShortcut(type) {
    const fromEl = $('export-date-from');
    const toEl = $('export-date-to');
    if (!fromEl || !toEl) return;

    const now = new Date();
    if (type === 'week') {
      const day = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      fromEl.value = monday.toISOString().slice(0, 10);
      toEl.value = sunday.toISOString().slice(0, 10);
    } else if (type === 'last-week') {
      const day = now.getDay();
      const lastMonday = new Date(now);
      lastMonday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) - 7);
      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastMonday.getDate() + 6);
      fromEl.value = lastMonday.toISOString().slice(0, 10);
      toEl.value = lastSunday.toISOString().slice(0, 10);
    } else if (type === 'all') {
      fromEl.value = '';
      toEl.value = '';
    }
  }

  // Helper: trigger export with date range via authDownload
  function _exportWithDates(baseUrl, dateFrom, dateTo) {
    let url = baseUrl;
    const params = [];
    if (dateFrom) params.push(`from=${dateFrom}`);
    if (dateTo) params.push(`to=${dateTo}`);
    if (params.length) url += (url.includes('?') ? '&' : '?') + params.join('&');
    authDownload(url);
  }

  // ── Crew unified tab (Labour + Guards sub-tabs) ────────────
  let _crewSubTab = 'labour';  // 'labour' | 'guards'

  function crewSetSubTab(sub) {
    _crewSubTab = sub;
    const labourPanel = $('crew-labour-panel');
    const guardsPanel = $('crew-guards-panel');
    const labourBtn = $('crew-subtab-labour');
    const guardsBtn = $('crew-subtab-guards');
    if (labourBtn) labourBtn.classList.toggle('active', sub === 'labour');
    if (guardsBtn) guardsBtn.classList.toggle('active', sub === 'guards');
    if (labourPanel) labourPanel.classList.toggle('hidden', sub !== 'labour');
    if (guardsPanel) guardsPanel.classList.toggle('hidden', sub !== 'guards');
    // Load and render the selected sub-module
    if (sub === 'labour') {
      _tabCtx = 'labour';
      App._loadAndRenderLabour?.();
    } else {
      state.guardSchedules = null;
      state.locationSchedules = null;
      state.locationSites = null;
      App.renderGuards?.();
    }
    _updateFab();
    _updateBreadcrumb(sub === 'labour' ? 'Labor' : 'Guards');
  }

  function _renderCrewSubTab() {
    crewSetSubTab(_crewSubTab);
  }

  // ── Public API ─────────────────────────────────────────────
  const App = {
    setTab: setTabLazy,
    // Auth
    logout, authState,
    _canEdit, _canEditPrices, _canEditFuelPrices, _isAdmin, _canViewTab,
    _canExport, _canImport, _canViewMoney, _getModulePerm,
    _applyPriceRestrictions,
    // Core UI
    showConfirm, cancelConfirm,
    toggleTheme,
    // Navigation
    toggleBottomNavMore, toggleMobileMenu, _updateBreadcrumb,
    // Crew unified tab
    crewSetSubTab, _renderCrewSubTab, get _crewSubTab() { return _crewSubTab; },
    openShortcutsPanel, closeShortcutsPanel,
    // Search / Command palette
    _openSearch, _closeSearch, _cmdExec,
    // History undo (P2.6 persistent)
    _undoFromToast, _undoLast, _undoEntry, _toggleUndoPanel, _closeUndoBar,
    // FAB
    fabAction, _toggleFabMenu, _fabCtxAction,
    // AXE 5.4 — Feedback
    _updateNetIndicator, _updateOfflineCounter,
    // Groups
    openGroupsModal, closeGroupsModal, addGroup, removeGroup,
    // Export date range modal (AXE 2.1)
    openExportDateModal, closeExportDateModal, confirmExportDate,
    exportDateShortcut, _selectExportFormat, _exportWithDates,
    // Activity panel (AXE 4.3) — populated by activity module
    toggleActivityPanel: () => {}, closeActivityPanel: () => {},
    loadActivity: () => {}, loadMoreActivity: () => {},
    loadEntityHistory: () => Promise.resolve([]),
    // Init
    init,
  };

  // Store reference so modules can add to App
  window.App = App;

  return App;
})();

document.addEventListener('DOMContentLoaded', App.init);

// ── Service Worker registration ──────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/static/sw.js')
    .then(reg => console.log('SW registered:', reg.scope))
    .catch(err => console.log('SW registration failed:', err));
}

// ── Offline/Online detection ─────────────────────────────────
window.addEventListener('offline', () => {
  // AXE 5.4: update network indicator
  if (typeof App !== 'undefined' && App._updateNetIndicator) App._updateNetIndicator(false);
  // P6.1: OfflineQueue banner handles the visual feedback
  if (window.OfflineQueue) window.OfflineQueue.updateBanner();
});

window.addEventListener('online', () => {
  // AXE 5.4: update network indicator
  if (typeof App !== 'undefined' && App._updateNetIndicator) App._updateNetIndicator(true);
  // P6.1: OfflineQueue handles flush + banner update
  if (window.OfflineQueue) window.OfflineQueue.updateBanner();
});

// ── P4.5: Protect against browser close with unsaved modal changes ───
window.addEventListener('beforeunload', e => {
  if (typeof window._SL === 'undefined') return;
  const overlays = document.querySelectorAll('.modal-overlay[id]');
  for (const ov of overlays) {
    if (!ov.classList.contains('hidden') && window._SL._isModalDirty(ov.id)) {
      e.preventDefault();
      return;
    }
  }
});
