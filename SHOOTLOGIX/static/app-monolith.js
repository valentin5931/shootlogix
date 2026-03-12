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
    memberships: [],    // [{ production_id, production_name, role, ... }]
    currentRole: null,  // role on current project
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

  /** Count actual active days for an assignment, respecting day_overrides and include_sunday. */
  function activeWorkingDays(asgn) {
    if (!asgn.start_date || !asgn.end_date) return 0;
    const overrides = JSON.parse(asgn.day_overrides || '{}');
    const includeSunday = asgn.include_sunday !== 0;
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

  // ── Toast ──────────────────────────────────────────────────
  let toastTimer;
  function toast(msg, type = 'success', undoHistoryId = null) {
    $('toast-icon').textContent = type === 'error' ? '✕' : type === 'info' ? 'ℹ' : '✓';
    const msgEl = $('toast-msg');
    if (undoHistoryId) {
      msgEl.innerHTML = `${esc(msg)} <button class="toast-undo-btn" onclick="App._undoFromToast(${undoHistoryId})">UNDO</button>`;
    } else {
      msgEl.textContent = msg;
    }
    $('toast-inner').className = type;
    $('toast').classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.add('hidden'), undoHistoryId ? 10000 : 3200);
  }

  async function _undoFromToast(historyId) {
    try {
      await api('POST', `/api/history/${historyId}/undo`);
      $('toast').classList.add('hidden');
      toast('Undone', 'success');
      // Reload current tab data
      setTab(state.tab);
    } catch (e) {
      toast('Undo failed: ' + e.message, 'error');
    }
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
      if (label) label.textContent = 'Online';
      // Fade out after 4s when online — stays visible when offline
      _netFadeTimer = setTimeout(() => el.classList.add('fade-out'), 4000);
    } else {
      el.classList.add('offline');
      if (label) label.textContent = 'Offline';
    }
  }

  // ── AXE 5.4 — Unsaved Modifications Counter ───────────────
  function _updateOfflineCounter() {
    const el = $('offline-counter');
    const badge = $('oc-count');
    if (!el || !badge) return;
    const count = _offlineQueue.length;
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

  // ── Auth: permissions & UI restrictions ──────────────────
  const ROLE_ALLOWED_TABS = {
    ADMIN:   ['dashboard','pdt','locations','boats','picture-boats','security-boats','transport','fuel','labour','guards','fnb','budget'],
    UNIT:    ['dashboard','pdt','locations','boats','picture-boats','security-boats','transport','fuel','labour','guards','fnb','budget'],
    TRANSPO: ['dashboard','boats','picture-boats','security-boats','transport','fuel'],
    READER:  ['dashboard','pdt','locations','boats','picture-boats','security-boats','transport','fuel','labour','guards','fnb','budget'],
  };

  function _canViewTab(tab) {
    const role = authState.currentRole || 'READER';
    if (role === 'ADMIN') return true;
    return (ROLE_ALLOWED_TABS[role] || []).includes(tab);
  }

  function _canEdit() {
    const role = authState.currentRole || 'READER';
    return role !== 'READER';
  }

  function _canEditPrices() {
    return authState.currentRole === 'ADMIN';
  }

  function _canEditFuelPrices() {
    const role = authState.currentRole || 'READER';
    return role === 'ADMIN' || role === 'UNIT' || role === 'TRANSPO';
  }

  function _isAdmin() {
    return authState.currentRole === 'ADMIN' || (authState.user && authState.user.is_admin);
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

    // 2. Add CSS class to body for role-based styling
    document.body.classList.remove('role-admin', 'role-unit', 'role-transpo', 'role-reader');
    document.body.classList.add('role-' + role.toLowerCase());

    // 3. If current tab is not allowed, switch to first allowed tab
    if (!_canViewTab(state.tab)) {
      const allowed = ROLE_ALLOWED_TABS[role] || ['boats'];
      setTab(allowed[0]);
    }

    // 4. Disable draggable for READER
    if (role === 'READER') {
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
    $('ps-welcome').textContent = `Welcome, ${authState.user.nickname}`;
    const list = $('ps-list');
    list.innerHTML = '';
    for (const m of authState.memberships) {
      const item = document.createElement('div');
      item.className = 'project-selector-item';
      item.innerHTML = `<span class="ps-name">${esc(m.production_name)}</span>
        <span class="ps-role">${esc(m.role)}</span>`;
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
    localStorage.setItem('currentProdId', prodId);
    localStorage.setItem('currentRole', role);
    _updateTopbarUser();
    _applyUIRestrictions();
    try {
      await Promise.all([loadShootingDays(), loadBoatsData(), loadPictureBoatsData(), _loadFuelGlobals()]);
      renderPDT();
      // Load scheduling alerts in background (AXE 7.3)
      loadAlerts();
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
    badge.innerHTML = `<span class="tu-nickname">${esc(nick)}</span>
      <span class="tu-role">${esc(role)}</span>`;
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
      logoutBtn.textContent = 'Sign Out';
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

  // ── Offline mutation queue ──────────────────────────────────
  let _offlineQueue = [];
  try {
    _offlineQueue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
  } catch (e) { _offlineQueue = []; }

  function _saveOfflineQueue() {
    try { localStorage.setItem('offline_queue', JSON.stringify(_offlineQueue)); } catch (e) {}
  }

  async function _flushOfflineQueue() {
    if (_offlineQueue.length === 0) return;
    const queue = [..._offlineQueue];
    _offlineQueue = [];
    _saveOfflineQueue();
    _updateOfflineCounter();
    let succeeded = 0;
    for (const item of queue) {
      try {
        await api(item.method, item.path, item.body);
        succeeded++;
      } catch (e) {
        console.warn('Offline queue replay failed:', e);
      }
    }
    if (succeeded > 0) {
      toast(`${succeeded} offline change(s) synced`, 'success');
      setTab(state.tab); // Refresh current view
    }
  }

  // Listen for online event to flush queue
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      setTimeout(_flushOfflineQueue, 1000);
    });
  }

  function _invalidateCache(pathPattern) {
    for (const key of Object.keys(_cache)) {
      if (key.includes(pathPattern)) delete _cache[key];
    }
  }

  async function api(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opts.body = JSON.stringify(body);

    // Offline handling for mutations
    if (!navigator.onLine && method !== 'GET') {
      _offlineQueue.push({ method, path, body, ts: Date.now() });
      _saveOfflineQueue();
      _updateOfflineCounter();
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
      // Handle validation errors with field details
      if (res.status === 422 && err.fields) {
        const msgs = Object.values(err.fields).join(', ');
        throw new Error(msgs);
      }
      throw new Error(err.error || `HTTP ${res.status}`);
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

  // ── Tab navigation ─────────────────────────────────────────
  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
    const panel = $(`view-${tab}`);
    if (panel) panel.classList.add('active');

    if (tab === 'dashboard')       renderDashboard();
    if (tab === 'pdt')             { if (_pdtView === 'calendar') { _initCalMonth(); renderPDTCalendar(); } else renderPDT(); }
    if (tab === 'boats')           { _tabCtx = 'boats';     renderBoats(); }
    if (tab === 'picture-boats')   { _tabCtx = 'picture';   renderPictureBoats(); }
    if (tab === 'transport')       { _tabCtx = 'transport'; _loadAndRenderTransport(); }
    if (tab === 'fuel')            _loadAndRenderFuel();
    if (tab === 'budget')          renderBudget();
    if (tab === 'labour')          { _tabCtx = 'labour'; _loadAndRenderLabour(); }
    if (tab === 'security-boats')  _loadAndRenderSecurityBoats();
    if (tab === 'locations')       { state.locationSchedules = null; renderLocations(); }
    if (tab === 'guards')          { state.guardSchedules = null; state.locationSchedules = null; state.locationSites = null; renderGuards(); }
    if (tab === 'fnb')             { state.fnbCategories = null; state.fnbItems = null; state.fnbEntries = null; renderFnb(); }
    if (tab === 'admin')           adminSetTab(_adminTab || 'users');
    _updateFab();
    _updateBreadcrumb();
    _updateBottomNav();
  }

  // ── Breadcrumb ──────────────────────────────────────────────
  const TAB_LABELS = {
    dashboard: 'Dashboard', pdt: 'PDT', locations: 'Locations',
    boats: 'Boats', 'picture-boats': 'Picture Boats', 'security-boats': 'Security Boats',
    transport: 'Transport', fuel: 'Fuel', labour: 'Labour',
    guards: 'Guards', fnb: 'FNB', budget: 'Budget', admin: 'Admin',
  };

  function _updateBreadcrumb(view, entity) {
    const modEl = $('bc-module');
    const viewEl = $('bc-view');
    const entityEl = $('bc-entity');
    const entitySep = document.querySelector('.bc-entity-sep');
    if (!modEl) return;
    modEl.textContent = TAB_LABELS[state.tab] || state.tab;
    viewEl.textContent = view || 'Overview';
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
    const primaryTabs = ['dashboard', 'pdt', 'boats', 'budget'];
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
  //  PDT VIEW
  // ═══════════════════════════════════════════════════════════

  // Event type → badge label + CSS class
  const EV_LABEL = { game: 'GAME', arena: 'ARENA', council: 'COUNCIL', off: 'OFF' };
  const EV_CLASS = { game: 'ev-game', arena: 'ev-arena', council: 'ev-council', off: 'ev-off' };

  function renderPDT() {
    const days = state.shootingDays;
    $('pdt-count').textContent = days.length
      ? `${days.length} shooting days · Mar 25 → Apr 25, 2026`
      : 'No shooting days imported yet.';

    const tbody = $('pdt-tbody');
    if (!days.length) {
      tbody.innerHTML = `<tr><td colspan="13" style="text-align:center;padding:3rem;color:var(--text-4)">
        No shooting days. Click <strong>↓ Import PDF V1</strong> to auto-load all 32 days.
      </td></tr>`;
      return;
    }

    const rows = [];
    for (const d of days) {
      // Use per-event rows when available, fall back to single row from day fields
      const events = (d.events && d.events.length)
        ? d.events
        : [{ event_type: d.conseil_soir ? 'game' : (d.game_name === 'OFF GAME' ? 'off' : 'game'),
             name: d.game_name, location: d.location,
             heure_rehearsal: d.heure_rehearsal, heure_host: d.heure_animateur,
             heure_event: d.heure_game, heure_depart: d.heure_depart_candidats,
             maree_hauteur: d.maree_hauteur, maree_statut: d.maree_statut }];

      const n = events.length;
      const statusLabel = STATUS_LABEL[d.status] || d.status || 'Draft';
      const hasCouncil  = events.some(e => e.event_type === 'council');
      const rowClass    = hasCouncil ? 'conseil-row' : '';

      events.forEach((ev, idx) => {
        const isFirst = idx === 0;
        const etype   = ev.event_type || 'game';
        const evClass = EV_CLASS[etype] || 'ev-game';
        const evLabel = EV_LABEL[etype] || etype.toUpperCase();
        const loc     = ev.location || (isFirst ? d.location : null);
        const name    = ev.name || (isFirst && etype === 'game' ? d.game_name : null);
        const timeVal = ev.heure_event;
        const depArr  = ev.heure_depart || ev.heure_arrivee;
        const tide    = ev.maree_hauteur != null
          ? `<span class="day-tide tide-${ev.maree_statut || ''}">${ev.maree_hauteur}m ${ev.maree_statut || ''}</span>`
          : '<span style="color:var(--text-4)">—</span>';
        const rehearsal = ev.heure_rehearsal || (isFirst ? d.heure_rehearsal : null);
        const host      = ev.heure_host || (isFirst ? d.heure_animateur : null);

        rows.push(`<tr class="${rowClass} ${evClass}-row" onclick="App.editDay(${d.id})"
          onmouseenter="App.showPDTTooltip(event,'${d.date}')" onmouseleave="App.hidePDTTooltip()">
          ${isFirst ? `<td rowspan="${n}" class="td-day-num"><span class="day-num">D${d.day_number}</span></td>` : ''}
          ${isFirst ? `<td rowspan="${n}" class="td-date">
            <div class="day-date">${fmtDateLong(d.date)}</div>
            <div style="font-size:.65rem;color:var(--text-4);font-family:monospace">${d.date || ''}</div>
          </td>` : ''}
          <td><span class="event-badge ${evClass}">${evLabel}</span></td>
          <td><span class="day-location">${esc(loc || '—')}</span></td>
          <td><span class="day-game">${esc(name || '—')}</span></td>
          <td><span class="day-time">${esc(rehearsal || '—')}</span></td>
          <td><span class="day-time">${esc(host || '—')}</span></td>
          <td><span class="day-time ev-time">${esc(timeVal || '—')}</span></td>
          <td><span class="day-time">${esc(depArr || '—')}</span></td>
          <td>${tide}</td>
          ${isFirst ? `<td rowspan="${n}" style="text-align:center;color:var(--text-2)">${d.nb_candidats != null ? d.nb_candidats : '—'}</td>` : ''}
          ${isFirst ? `<td rowspan="${n}"><span class="status-badge status-${d.status || 'brouillon'}">${esc(statusLabel)}</span></td>` : ''}
          ${isFirst ? `<td rowspan="${n}" style="white-space:nowrap">
            <button class="btn btn-icon btn-secondary btn-sm"
              onclick="event.stopPropagation();App.editDay(${d.id})" title="Edit">✎</button>
          </td>` : ''}
        </tr>`);
      });
    }
    tbody.innerHTML = rows.join('');
  }

  // ═══════════════════════════════════════════════════════════
  //  PDT CALENDAR VIEW (AXE 7.1)
  // ═══════════════════════════════════════════════════════════

  let _pdtView = 'table';   // 'table' | 'calendar'
  let _pdtCalMonth = null;   // { year, month } currently displayed
  let _pdtCalExpanded = null; // date string of expanded day (or null)

  function setPDTView(view) {
    _pdtView = view;
    document.querySelectorAll('.pdt-view-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.pdtView === view);
    });
    const tableCt = $('pdt-table-container');
    const calCt   = $('pdt-calendar-container');
    if (view === 'table') {
      tableCt.style.display = '';
      calCt.style.display = 'none';
      renderPDT();
    } else {
      tableCt.style.display = 'none';
      calCt.style.display = '';
      _initCalMonth();
      renderPDTCalendar();
    }
  }

  function _initCalMonth() {
    if (_pdtCalMonth) return;
    const days = state.shootingDays;
    if (days.length) {
      const first = new Date(days[0].date + 'T00:00:00');
      _pdtCalMonth = { year: first.getFullYear(), month: first.getMonth() };
    } else {
      const now = new Date();
      _pdtCalMonth = { year: now.getFullYear(), month: now.getMonth() };
    }
  }

  function pdtCalPrev() {
    _pdtCalMonth.month--;
    if (_pdtCalMonth.month < 0) { _pdtCalMonth.month = 11; _pdtCalMonth.year--; }
    _pdtCalExpanded = null;
    renderPDTCalendar();
  }

  function pdtCalNext() {
    _pdtCalMonth.month++;
    if (_pdtCalMonth.month > 11) { _pdtCalMonth.month = 0; _pdtCalMonth.year++; }
    _pdtCalExpanded = null;
    renderPDTCalendar();
  }

  function renderPDTCalendar() {
    _initCalMonth();
    const { year, month } = _pdtCalMonth;
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    $('pdt-cal-month-label').textContent = `${MONTHS[month]} ${year}`;

    // Build date → shooting day lookup
    const dayMap = {};
    for (const d of state.shootingDays) {
      if (d.date) dayMap[d.date] = d;
    }

    // Calendar grid: starts on Monday (ISO)
    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth  = new Date(year, month + 1, 0);
    const startDow = (firstOfMonth.getDay() + 6) % 7; // 0=Mon
    const daysInMonth = lastOfMonth.getDate();

    const todayStr = new Date().toISOString().slice(0, 10);
    const cells = [];

    // Day-of-week headers
    const DOW = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    for (const dow of DOW) {
      cells.push(`<div class="pdt-cal-dow">${dow}</div>`);
    }

    // Leading empty cells (previous month)
    const prevMonth = new Date(year, month, 0);
    for (let i = startDow - 1; i >= 0; i--) {
      const d = prevMonth.getDate() - i;
      cells.push(`<div class="pdt-cal-cell outside"><span class="pdt-cal-date">${d}</span></div>`);
    }

    // Days of current month
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const sd = dayMap[dateStr];
      const isToday = dateStr === todayStr;
      const isExpanded = dateStr === _pdtCalExpanded;
      const classes = ['pdt-cal-cell'];
      if (sd) classes.push('has-day');
      if (isToday) classes.push('today');
      if (isExpanded) classes.push('expanded');

      let eventsHtml = '';
      if (sd) {
        const events = (sd.events && sd.events.length)
          ? sd.events
          : [{ event_type: sd.conseil_soir ? 'game' : (sd.game_name === 'OFF GAME' ? 'off' : 'game'),
               name: sd.game_name || '', location: sd.location || '' }];
        eventsHtml = '<div class="pdt-cal-events">';
        for (const ev of events) {
          const etype = ev.event_type || 'game';
          const evCls = EV_CLASS[etype] || 'ev-game';
          const label = ev.name || EV_LABEL[etype] || etype.toUpperCase();
          eventsHtml += `<div class="pdt-cal-ev ${evCls}">${esc(label)}</div>`;
        }
        eventsHtml += '</div>';
      }

      const dayNumHtml = sd ? `<span class="pdt-cal-day-num">D${sd.day_number}</span>` : '';
      const onclick = sd ? `onclick="App.pdtCalToggleDay('${dateStr}')"` : '';

      cells.push(`<div class="${classes.join(' ')}" ${onclick}>
        <span class="pdt-cal-date">${d}</span>${dayNumHtml}
        ${eventsHtml}
      </div>`);

      // Insert inline detail row after the end of the week row if this day is expanded
      if (isExpanded && sd) {
        // Figure out position in week (0-based from Monday)
        const cellDow = (new Date(year, month, d).getDay() + 6) % 7;
        // Pad remaining cells to complete the week row
        const remaining = 6 - cellDow;
        for (let r = d + 1; r <= Math.min(d + remaining, daysInMonth); r++) {
          const rDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(r).padStart(2, '0')}`;
          const rSd = dayMap[rDateStr];
          const rIsToday = rDateStr === todayStr;
          const rClasses = ['pdt-cal-cell'];
          if (rSd) rClasses.push('has-day');
          if (rIsToday) rClasses.push('today');

          let rEvHtml = '';
          if (rSd) {
            const revents = (rSd.events && rSd.events.length)
              ? rSd.events
              : [{ event_type: rSd.conseil_soir ? 'game' : (rSd.game_name === 'OFF GAME' ? 'off' : 'game'),
                   name: rSd.game_name || '', location: rSd.location || '' }];
            rEvHtml = '<div class="pdt-cal-events">';
            for (const ev of revents) {
              const etype = ev.event_type || 'game';
              rEvHtml += `<div class="pdt-cal-ev ${EV_CLASS[etype] || 'ev-game'}">${esc(ev.name || EV_LABEL[etype] || etype.toUpperCase())}</div>`;
            }
            rEvHtml += '</div>';
          }
          const rDayNum = rSd ? `<span class="pdt-cal-day-num">D${rSd.day_number}</span>` : '';
          const rOnclick = rSd ? `onclick="App.pdtCalToggleDay('${rDateStr}')"` : '';
          cells.push(`<div class="${rClasses.join(' ')}" ${rOnclick}>
            <span class="pdt-cal-date">${r}</span>${rDayNum}${rEvHtml}
          </div>`);
        }
        // Pad with empty cells if week extends beyond month
        for (let r = daysInMonth + 1; r <= d + remaining; r++) {
          cells.push(`<div class="pdt-cal-cell outside"><span class="pdt-cal-date">${r - daysInMonth}</span></div>`);
        }
        d += remaining; // skip the days we already rendered

        // Now insert the detail row spanning the full week
        cells.push(_buildCalDetail(sd));
      }
    }

    // Trailing empty cells
    const totalCells = cells.length - 7; // minus DOW headers
    const trailingNeeded = (7 - (totalCells % 7)) % 7;
    for (let i = 1; i <= trailingNeeded; i++) {
      cells.push(`<div class="pdt-cal-cell outside"><span class="pdt-cal-date">${i}</span></div>`);
    }

    $('pdt-cal-grid').innerHTML = cells.join('');
  }

  function _buildCalDetail(sd) {
    const events = (sd.events && sd.events.length)
      ? sd.events
      : [{ event_type: sd.conseil_soir ? 'game' : (sd.game_name === 'OFF GAME' ? 'off' : 'game'),
           name: sd.game_name, location: sd.location,
           heure_rehearsal: sd.heure_rehearsal, heure_host: sd.heure_animateur,
           heure_event: sd.heure_game, heure_depart: sd.heure_depart_candidats,
           maree_hauteur: sd.maree_hauteur, maree_statut: sd.maree_statut }];

    let evRows = '';
    for (const ev of events) {
      const etype = ev.event_type || 'game';
      const evCls = EV_CLASS[etype] || 'ev-game';
      const evLbl = EV_LABEL[etype] || etype.toUpperCase();
      const loc = ev.location || sd.location || '';
      const name = ev.name || sd.game_name || '';

      const times = [];
      if (ev.heure_rehearsal) times.push(`<span class="pdt-cal-detail-ev-time"><strong>Rehearsal</strong> ${esc(ev.heure_rehearsal)}</span>`);
      if (ev.heure_host) times.push(`<span class="pdt-cal-detail-ev-time"><strong>Host</strong> ${esc(ev.heure_host)}</span>`);
      if (ev.heure_event) times.push(`<span class="pdt-cal-detail-ev-time"><strong>Event</strong> ${esc(ev.heure_event)}</span>`);
      if (ev.heure_depart) times.push(`<span class="pdt-cal-detail-ev-time"><strong>Dep</strong> ${esc(ev.heure_depart)}</span>`);
      if (ev.heure_arrivee) times.push(`<span class="pdt-cal-detail-ev-time"><strong>Arr</strong> ${esc(ev.heure_arrivee)}</span>`);
      if (ev.heure_teaser) times.push(`<span class="pdt-cal-detail-ev-time"><strong>Teaser</strong> ${esc(ev.heure_teaser)}</span>`);
      if (ev.heure_fin) times.push(`<span class="pdt-cal-detail-ev-time"><strong>End</strong> ${esc(ev.heure_fin)}</span>`);

      const tideHtml = ev.maree_hauteur != null
        ? `<span class="pdt-cal-detail-ev-time"><strong>Tide</strong> ${ev.maree_hauteur}m ${ev.maree_statut || ''}</span>`
        : '';
      if (tideHtml) times.push(tideHtml);

      evRows += `<div class="pdt-cal-detail-ev">
        <span class="event-badge ${evCls}">${evLbl}</span>
        <div class="pdt-cal-detail-ev-info">
          <span class="pdt-cal-detail-ev-name">${esc(name) || evLbl}</span>
          ${loc ? `<span class="pdt-cal-detail-ev-loc">${esc(loc)}</span>` : ''}
          ${times.length ? `<div class="pdt-cal-detail-ev-times">${times.join('')}</div>` : ''}
          ${ev.reward || ev.notes ? `<span class="pdt-cal-detail-ev-time" style="margin-top:2px">${esc(ev.reward || '')} ${esc(ev.notes || '')}</span>` : ''}
        </div>
      </div>`;
    }

    const statusLabel = STATUS_LABEL[sd.status] || sd.status || 'Draft';
    let metaItems = '';
    if (sd.nb_candidats != null) metaItems += `<span>Candidates: ${sd.nb_candidats}</span>`;
    metaItems += `<span>Status: ${esc(statusLabel)}</span>`;
    if (sd.recompense) metaItems += `<span>Reward: ${esc(sd.recompense)}</span>`;
    if (sd.notes) metaItems += `<span>Notes: ${esc(sd.notes)}</span>`;

    return `<div class="pdt-cal-detail">
      <div class="pdt-cal-detail-header">
        <span class="pdt-cal-detail-title">D${sd.day_number}</span>
        <span class="pdt-cal-detail-date">${fmtDateLong(sd.date)} - ${sd.date}</span>
        <button class="pdt-cal-detail-close" onclick="App.pdtCalToggleDay(null)" title="Close">✕</button>
      </div>
      <div class="pdt-cal-detail-events">${evRows}</div>
      <div class="pdt-cal-detail-meta">${metaItems}</div>
      <div class="pdt-cal-detail-edit">
        <button class="btn btn-sm btn-secondary" onclick="App.editDay(${sd.id})">✎ Edit day</button>
      </div>
    </div>`;
  }

  function pdtCalToggleDay(dateStr) {
    if (_pdtCalExpanded === dateStr || dateStr === null) {
      _pdtCalExpanded = null;
    } else {
      _pdtCalExpanded = dateStr;
    }
    renderPDTCalendar();
  }

  // PDT — Import PDF (server-side fallback, kept for backward compat)
  let _pdtImporting = false;

  async function parsePDT() {
    if (_pdtImporting) return;
    if (state.shootingDays.length > 0) {
      showConfirm(
        `${state.shootingDays.length} days already exist. Replace with PDF V1 data?`,
        () => _doParsePDT(true)
      );
    } else {
      await _doParsePDT(false);
    }
  }

  async function _doParsePDT(force) {
    if (_pdtImporting) return;
    _pdtImporting = true;
    try {
      $('pdt-status').textContent = 'Importing…';
      const res = await api('POST', `/api/productions/${state.prodId}/parse-pdt`, { force });
      await loadShootingDays();
      renderPDT();
      toast(`${res.created} days imported from PDF`);
    } catch (e) {
      toast('PDF import error: ' + e.message, 'error');
    } finally {
      $('pdt-status').textContent = '';
      _pdtImporting = false;
    }
  }

  // PDT — Upload PDF from browser file picker
  function triggerPDTUpload() {
    if (_pdtImporting) return;
    $('pdt-file-input').click();
  }

  async function handlePDTFileUpload(inputEl) {
    if (_pdtImporting) return;
    const file = inputEl.files[0];
    inputEl.value = ''; // reset for re-upload
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast('Please select a PDF file', 'error');
      return;
    }
    const hasDays = state.shootingDays.length > 0;
    if (hasDays) {
      showConfirm(
        `${state.shootingDays.length} days already exist. Merge PDF data? (Days with status "Edited" will be kept.)`,
        () => _doUploadPDT(file)
      );
    } else {
      await _doUploadPDT(file);
    }
  }

  async function _doUploadPDT(file) {
    if (_pdtImporting) return;
    _pdtImporting = true;
    try {
      $('pdt-status').textContent = 'Uploading & parsing…';
      const form = new FormData();
      form.append('pdf', file);
      const res = await authFetch(`/api/productions/${state.prodId}/upload-pdt`, {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const result = await res.json();
      await loadShootingDays();
      renderPDT();
      const parts = [];
      if (result.created > 0)  parts.push(`${result.created} created`);
      if (result.updated > 0)  parts.push(`${result.updated} updated`);
      if (result.skipped > 0)  parts.push(`${result.skipped} skipped (edited)`);
      toast(parts.length ? parts.join(', ') : 'No changes from PDF');
    } catch (e) {
      toast('PDF upload error: ' + e.message, 'error');
    } finally {
      $('pdt-status').textContent = '';
      _pdtImporting = false;
    }
  }

  // PDT — Edit day (populate form)
  function editDay(dayId) {
    const d = state.shootingDays.find(x => x.id === dayId);
    if (!d) return;
    state.editingDayId = dayId;
    state.editingDayEvents = JSON.parse(JSON.stringify(d.events || []));
    $('day-modal-title').textContent = `Day ${d.day_number} — ${fmtDateLong(d.date)}`;
    $('dm-date').value           = d.date || '';
    $('dm-day-number').value     = d.day_number || '';

    // Populate top modal fields from the first event if events exist,
    // so the top modal always reflects the actual displayed data
    const firstEv = state.editingDayEvents.length ? state.editingDayEvents[0] : null;
    $('dm-location').value       = (firstEv && firstEv.location) || d.location || '';
    $('dm-game').value           = (firstEv && firstEv.name) || d.game_name || '';
    $('dm-rehearsal').value      = (firstEv && firstEv.heure_rehearsal) || d.heure_rehearsal || '';
    $('dm-animateur').value      = (firstEv && firstEv.heure_host) || d.heure_animateur || '';
    $('dm-game-time').value      = (firstEv && firstEv.heure_event) || d.heure_game || '';
    $('dm-depart').value         = (firstEv && firstEv.heure_depart) || d.heure_depart_candidats || '';
    $('dm-candidats').value      = d.nb_candidats != null ? d.nb_candidats : '';
    const mareeH = firstEv && firstEv.maree_hauteur != null ? firstEv.maree_hauteur : d.maree_hauteur;
    $('dm-maree-h').value        = mareeH != null ? mareeH : '';
    const mareeS = (firstEv && firstEv.maree_statut) || d.maree_statut;
    $('dm-maree-s').value        = mareeS || '';
    $('dm-conseil').value        = d.conseil_soir ? '1' : '0';
    $('dm-recompense').value     = (firstEv && firstEv.reward) || d.recompense || '';
    $('dm-status').value         = d.status || 'brouillon';
    $('dm-notes').value          = d.notes || '';
    $('dm-delete-btn').classList.remove('hidden');
    // Collapse events section by default
    _collapseEventsSection();
    _renderDayEvents();
    $('day-modal-overlay').classList.remove('hidden');
  }

  // Add day (blank form — reset events too)
  function addDay() {
    state.editingDayId = null;
    state.editingDayEvents = [];
    $('day-modal-title').textContent = 'New shooting day';
    $('dm-date').value           = '';
    $('dm-day-number').value     = state.shootingDays.length + 1;
    $('dm-location').value       = '';
    $('dm-game').value           = '';
    $('dm-rehearsal').value      = '';
    $('dm-animateur').value      = '';
    $('dm-game-time').value      = '';
    $('dm-depart').value         = '';
    $('dm-candidats').value      = '';
    $('dm-maree-h').value        = '';
    $('dm-maree-s').value        = '';
    $('dm-conseil').value        = '0';
    $('dm-recompense').value     = '';
    $('dm-status').value         = 'brouillon';
    $('dm-notes').value          = '';
    $('dm-delete-btn').classList.add('hidden');
    // Collapse events section by default
    _collapseEventsSection();
    _renderDayEvents();
    $('day-modal-overlay').classList.remove('hidden');
  }

  // Render the event rows inside the modal — FULL editable fields
  function _renderDayEvents() {
    const el = $('dm-events-list');
    if (!el) return;
    if (!state.editingDayEvents.length) {
      el.innerHTML = `<div style="font-size:.75rem;color:var(--text-4);padding:.2rem 0">No events yet — add one below.</div>`;
      return;
    }
    el.innerHTML = state.editingDayEvents.map((ev, idx) => {
      const etype = ev.event_type || 'game';
      const evClass = EV_CLASS[etype] || 'ev-game';
      const evLabel = EV_LABEL[etype] || etype.toUpperCase();
      return `
        <div class="dm-event-card" data-idx="${idx}">
          <div class="dm-event-header">
            <span class="event-badge ${evClass}">${evLabel}</span>
            <select class="ev-type-sel" data-field="event_type" onchange="App._updateDayEventField(${idx},'event_type',this.value);App._renderDayEvents()">
              <option value="game" ${etype==='game'?'selected':''}>GAME</option>
              <option value="arena" ${etype==='arena'?'selected':''}>ARENA</option>
              <option value="council" ${etype==='council'?'selected':''}>COUNCIL</option>
              <option value="off" ${etype==='off'?'selected':''}>OFF</option>
            </select>
            <button class="btn-del-ev" onclick="App.deleteEventFromDay(${idx})" title="Remove event">✕</button>
          </div>
          <div class="dm-event-fields">
            <div class="dm-ev-row">
              <label>Name</label>
              <input type="text" data-field="name" value="${esc(ev.name || '')}" placeholder="Event name" oninput="App._updateDayEventField(${idx},'name',this.value)">
            </div>
            <div class="dm-ev-row">
              <label>Location</label>
              <input type="text" data-field="location" value="${esc(ev.location || '')}" placeholder="Island / site" oninput="App._updateDayEventField(${idx},'location',this.value)">
            </div>
            <div class="dm-ev-grid-3">
              <div class="dm-ev-row">
                <label>Rehearsal</label>
                <input type="text" data-field="heure_rehearsal" value="${esc(ev.heure_rehearsal || '')}" placeholder="9H30" oninput="App._updateDayEventField(${idx},'heure_rehearsal',this.value)">
              </div>
              <div class="dm-ev-row">
                <label>Host</label>
                <input type="text" data-field="heure_host" value="${esc(ev.heure_host || '')}" placeholder="11H15" oninput="App._updateDayEventField(${idx},'heure_host',this.value)">
              </div>
              <div class="dm-ev-row">
                <label>Event time</label>
                <input type="text" data-field="heure_event" value="${esc(ev.heure_event || '')}" placeholder="12H00" oninput="App._updateDayEventField(${idx},'heure_event',this.value)">
              </div>
            </div>
            <div class="dm-ev-grid-3">
              <div class="dm-ev-row">
                <label>Departure</label>
                <input type="text" data-field="heure_depart" value="${esc(ev.heure_depart || '')}" placeholder="Dep." oninput="App._updateDayEventField(${idx},'heure_depart',this.value)">
              </div>
              <div class="dm-ev-row">
                <label>Arrival</label>
                <input type="text" data-field="heure_arrivee" value="${esc(ev.heure_arrivee || '')}" placeholder="Arr." oninput="App._updateDayEventField(${idx},'heure_arrivee',this.value)">
              </div>
              <div class="dm-ev-row">
                <label>Teaser</label>
                <input type="text" data-field="heure_teaser" value="${esc(ev.heure_teaser || '')}" placeholder="Teaser" oninput="App._updateDayEventField(${idx},'heure_teaser',this.value)">
              </div>
            </div>
            <div class="dm-ev-grid-3">
              <div class="dm-ev-row">
                <label>End</label>
                <input type="text" data-field="heure_fin" value="${esc(ev.heure_fin || '')}" placeholder="End" oninput="App._updateDayEventField(${idx},'heure_fin',this.value)">
              </div>
              <div class="dm-ev-row">
                <label>Tide (m)</label>
                <input type="number" step="0.01" data-field="maree_hauteur" value="${ev.maree_hauteur != null ? ev.maree_hauteur : ''}" oninput="App._updateDayEventField(${idx},'maree_hauteur',this.value!==''?parseFloat(this.value):null)">
              </div>
              <div class="dm-ev-row">
                <label>Tide st.</label>
                <select data-field="maree_statut" onchange="App._updateDayEventField(${idx},'maree_statut',this.value)">
                  <option value="">—</option>
                  <option value="E" ${ev.maree_statut==='E'?'selected':''}>E</option>
                  <option value="D" ${ev.maree_statut==='D'?'selected':''}>D</option>
                  <option value="M" ${ev.maree_statut==='M'?'selected':''}>M</option>
                </select>
              </div>
            </div>
            <div class="dm-ev-grid-2">
              <div class="dm-ev-row">
                <label>Reward</label>
                <input type="text" data-field="reward" value="${esc(ev.reward || '')}" placeholder="Reward" oninput="App._updateDayEventField(${idx},'reward',this.value)">
              </div>
              <div class="dm-ev-row">
                <label>Notes</label>
                <input type="text" data-field="notes" value="${esc(ev.notes || '')}" placeholder="Notes" oninput="App._updateDayEventField(${idx},'notes',this.value)">
              </div>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  // Toggle the advanced events section visibility
  function toggleEventsSection() {
    const sec = $('dm-events-section');
    const label = $('dm-events-toggle-label');
    if (!sec) return;
    if (sec.style.display === 'none') {
      sec.style.display = '';
      if (label) label.textContent = 'Hide advanced events';
    } else {
      sec.style.display = 'none';
      if (label) label.textContent = 'Show advanced events';
    }
  }

  function _collapseEventsSection() {
    const sec = $('dm-events-section');
    const label = $('dm-events-toggle-label');
    if (sec) sec.style.display = 'none';
    if (label) label.textContent = 'Show advanced events';
  }

  // Update a field in the in-modal event list (local state only — saved on saveDay)
  function _updateDayEventField(idx, field, val) {
    if (!state.editingDayEvents[idx]) return;
    // Handle numeric values (e.g. maree_hauteur passed as parseFloat result)
    if (typeof val === 'number') {
      state.editingDayEvents[idx][field] = isNaN(val) ? null : val;
    } else if (val === null || val === undefined) {
      state.editingDayEvents[idx][field] = null;
    } else {
      state.editingDayEvents[idx][field] = String(val).trim() || null;
    }
  }

  function closeDayModal() {
    $('day-modal-overlay').classList.add('hidden');
    state.editingDayId = null;
    state.editingDayEvents = [];
    // Clean up cascade state
    state._cascadeDecision = null;
    state._pendingSaveData = null;
    state._pendingOldDate = null;
  }

  // ── AXE 7.2: Cascade preview modal ───────────────────────────────────────
  function _showCascadePreview(preview, oldDate, newDate) {
    const body = $('cascade-body');
    let html = `<p style="margin:0 0 .75rem"><strong>Date deplacee :</strong> ${oldDate} &rarr; ${newDate}</p>`;
    html += `<p style="margin:0 0 1rem;color:var(--text-2)">Les elements suivants referencent l'ancienne date. Souhaitez-vous les mettre a jour automatiquement ?</p>`;

    // Assignments
    if (preview.assignments.length > 0) {
      html += `<div style="margin-bottom:.75rem">`;
      html += `<div style="font-weight:600;margin-bottom:.25rem">Assignments (${preview.assignments.length})</div>`;
      html += `<div style="border:1px solid var(--border);border-radius:6px;overflow:hidden">`;
      html += `<table style="width:100%;font-size:.8rem;border-collapse:collapse">`;
      html += `<tr style="background:var(--bg-2)"><th style="padding:4px 8px;text-align:left">Module</th><th style="padding:4px 8px;text-align:left">Fonction</th><th style="padding:4px 8px;text-align:left">Entite</th><th style="padding:4px 8px;text-align:left">Impact</th></tr>`;
      for (const a of preview.assignments) {
        html += `<tr style="border-top:1px solid var(--border)"><td style="padding:4px 8px">${a.module}</td><td style="padding:4px 8px">${a.function_name || '-'}</td><td style="padding:4px 8px">${a.entity_name}</td><td style="padding:4px 8px">${(a.impact || []).join(', ')}</td></tr>`;
      }
      html += `</table></div></div>`;
    }

    // Fuel entries
    if (preview.fuel_entries.length > 0) {
      html += `<div style="margin-bottom:.75rem">`;
      html += `<div style="font-weight:600;margin-bottom:.25rem">Fuel entries (${preview.fuel_entries.length})</div>`;
      html += `<div style="border:1px solid var(--border);border-radius:6px;overflow:hidden">`;
      html += `<table style="width:100%;font-size:.8rem;border-collapse:collapse">`;
      html += `<tr style="background:var(--bg-2)"><th style="padding:4px 8px;text-align:left">Type</th><th style="padding:4px 8px;text-align:left">Litres</th><th style="padding:4px 8px;text-align:left">Carburant</th></tr>`;
      for (const f of preview.fuel_entries) {
        html += `<tr style="border-top:1px solid var(--border)"><td style="padding:4px 8px">${f.source_type}</td><td style="padding:4px 8px">${f.liters || 0}L</td><td style="padding:4px 8px">${f.fuel_type}</td></tr>`;
      }
      html += `</table></div></div>`;
    }

    // Location schedules
    if (preview.location_schedules.length > 0) {
      html += `<div style="margin-bottom:.75rem">`;
      html += `<div style="font-weight:600;margin-bottom:.25rem">Location schedules (${preview.location_schedules.length})</div>`;
      html += `<div style="border:1px solid var(--border);border-radius:6px;overflow:hidden">`;
      html += `<table style="width:100%;font-size:.8rem;border-collapse:collapse">`;
      html += `<tr style="background:var(--bg-2)"><th style="padding:4px 8px;text-align:left">Location</th><th style="padding:4px 8px;text-align:left">Statut</th><th style="padding:4px 8px;text-align:left">Verrouille</th></tr>`;
      for (const l of preview.location_schedules) {
        html += `<tr style="border-top:1px solid var(--border)"><td style="padding:4px 8px">${l.location_name}</td><td style="padding:4px 8px">${l.status}</td><td style="padding:4px 8px">${l.locked ? 'Oui' : 'Non'}</td></tr>`;
      }
      html += `</table></div></div>`;
    }

    body.innerHTML = html;
    $('cascade-overlay').classList.remove('hidden');
  }

  function cancelCascade() {
    $('cascade-overlay').classList.add('hidden');
    // Do nothing - user cancelled, day is NOT saved
    state._pendingSaveData = null;
    state._pendingOldDate = null;
  }

  async function applyCascade() {
    $('cascade-overlay').classList.add('hidden');
    state._cascadeDecision = 'apply';
    // Re-trigger saveDay with cascade decision set
    await saveDay();
  }

  async function skipCascade() {
    $('cascade-overlay').classList.add('hidden');
    state._cascadeDecision = 'skip';
    // Re-trigger saveDay without cascade
    await saveDay();
  }

  // Add a new event to a day (creates immediately via API if editing existing day)
  async function addEventToDay(type) {
    const defaults = EV_DEFAULTS[type] || {};
    const ev = {
      event_type: type,
      sort_order: state.editingDayEvents.length,
      name: defaults.name || null,
      location: defaults.location || null,
      heure_rehearsal: defaults.heure_rehearsal || null,
      heure_arrivee:   defaults.heure_arrivee   || null,
      heure_event: null,
    };

    if (state.editingDayId) {
      // Day already exists — create event immediately via API
      try {
        const created = await api('POST',
          `/api/productions/${state.prodId}/shooting-days/${state.editingDayId}/events`,
          { ...ev, shooting_day_id: state.editingDayId });
        state.editingDayEvents.push(created);
        // Keep conseil_soir in sync
        if (type === 'council') $('dm-conseil').value = '1';
      } catch (e) {
        toast('Error adding event: ' + e.message, 'error');
        return;
      }
    } else {
      // New day not saved yet — just add locally
      state.editingDayEvents.push(ev);
      if (type === 'council') $('dm-conseil').value = '1';
    }
    _renderDayEvents();
  }

  // Delete an event from the modal list
  async function deleteEventFromDay(idx) {
    const ev = state.editingDayEvents[idx];
    if (!ev) return;
    if (ev.id && state.editingDayId) {
      try {
        await api('DELETE', `/api/events/${ev.id}`);
      } catch (e) {
        toast('Error deleting event: ' + e.message, 'error');
        return;
      }
    }
    state.editingDayEvents.splice(idx, 1);
    // Re-number sort_order
    state.editingDayEvents.forEach((e, i) => { e.sort_order = i; });
    // Update conseil flag if no council remains
    const hasCouncil = state.editingDayEvents.some(e => e.event_type === 'council');
    if (!hasCouncil) $('dm-conseil').value = '0';
    _renderDayEvents();
  }

  // ─── PDT → Locations sync helper ─────────────────────────────────────────
  // Collects all location names from a shooting day (main + events)
  // and sends them to the backend to sync F days in location_schedules.
  async function _syncPdtLocations(dayDate, dayData, events) {
    if (!dayDate || !state.prodId) return;
    const locs = new Set();
    // Main location on the shooting day
    if (dayData.location && dayData.location.trim()) {
      locs.add(dayData.location.trim());
    }
    // Locations from each event
    if (events && Array.isArray(events)) {
      for (const ev of events) {
        if (ev.location && ev.location.trim()) {
          locs.add(ev.location.trim());
        }
      }
    }
    try {
      await api('POST', `/api/productions/${state.prodId}/sync-pdt-locations`, {
        date: dayDate,
        locations: Array.from(locs),
      });
      // Invalidate location caches so next render picks up changes
      state.locationSites = null;
      state.locationSchedules = null;
    } catch (e) {
      console.warn('PDT→Locations sync warning:', e.message);
    }
  }

  async function _syncPdtLocationsDelete(dayDate) {
    if (!dayDate || !state.prodId) return;
    try {
      await api('POST', `/api/productions/${state.prodId}/sync-pdt-locations`, {
        date: dayDate,
        locations: [],
        deleted: true,
      });
      state.locationSites = null;
      state.locationSchedules = null;
    } catch (e) {
      console.warn('PDT→Locations sync (delete) warning:', e.message);
    }
  }

  async function saveDay() {
    // BUG 3 FIX: validate date is required
    if (!$('dm-date').value) {
      toast('Date is required', 'error');
      return;
    }

    // Read ALL event fields from DOM using data-field attributes (robust, order-independent)
    // (only relevant if advanced events section was opened)
    document.querySelectorAll('.dm-event-card').forEach(card => {
      const idx = parseInt(card.dataset.idx);
      const ev = state.editingDayEvents[idx];
      if (!ev) return;
      card.querySelectorAll('[data-field]').forEach(el => {
        const field = el.dataset.field;
        if (field === 'maree_hauteur') {
          ev[field] = el.value !== '' ? parseFloat(el.value) : null;
        } else {
          ev[field] = (el.value || '').trim() || null;
        }
      });
    });

    // Sync top modal fields to the first event so PDT rendering picks them up.
    // The PDT table renders from events when they exist, so we must keep them in sync.
    if (state.editingDayEvents.length > 0) {
      const firstEv = state.editingDayEvents[0];
      firstEv.location        = $('dm-location').value.trim() || null;
      firstEv.name            = $('dm-game').value.trim() || null;
      firstEv.heure_rehearsal = $('dm-rehearsal').value.trim() || null;
      firstEv.heure_host      = $('dm-animateur').value.trim() || null;
      firstEv.heure_event     = $('dm-game-time').value.trim() || null;
      firstEv.heure_depart    = $('dm-depart').value.trim() || null;
      firstEv.maree_hauteur   = $('dm-maree-h').value !== '' ? parseFloat($('dm-maree-h').value) : null;
      firstEv.maree_statut    = $('dm-maree-s').value || null;
      firstEv.reward          = $('dm-recompense').value.trim() || null;
    } else {
      // No events exist yet -- auto-create a default event from the top modal fields
      // so the PDT table has event data to render from
      const evType = $('dm-conseil').value === '1' ? 'council' : 'game';
      state.editingDayEvents.push({
        event_type:      evType,
        sort_order:      0,
        name:            $('dm-game').value.trim() || null,
        location:        $('dm-location').value.trim() || null,
        heure_rehearsal: $('dm-rehearsal').value.trim() || null,
        heure_host:      $('dm-animateur').value.trim() || null,
        heure_event:     $('dm-game-time').value.trim() || null,
        heure_depart:    $('dm-depart').value.trim() || null,
        maree_hauteur:   $('dm-maree-h').value !== '' ? parseFloat($('dm-maree-h').value) : null,
        maree_statut:    $('dm-maree-s').value || null,
        reward:          $('dm-recompense').value.trim() || null,
        notes:           null,
      });
    }

    const data = {
      date:                   $('dm-date').value,
      day_number:             parseInt($('dm-day-number').value) || null,
      location:               $('dm-location').value.trim() || null,
      game_name:              $('dm-game').value.trim() || null,
      heure_rehearsal:        $('dm-rehearsal').value.trim() || null,
      heure_animateur:        $('dm-animateur').value.trim() || null,
      heure_game:             $('dm-game-time').value.trim() || null,
      heure_depart_candidats: $('dm-depart').value.trim() || null,
      nb_candidats:           $('dm-candidats').value !== '' ? parseInt($('dm-candidats').value) : null,
      maree_hauteur:          $('dm-maree-h').value !== '' ? parseFloat($('dm-maree-h').value) : null,
      maree_statut:           $('dm-maree-s').value || null,
      conseil_soir:           parseInt($('dm-conseil').value),
      recompense:             $('dm-recompense').value.trim() || null,
      status:                 $('dm-status').value,
      notes:                  $('dm-notes').value.trim() || null,
    };

    // BUG 4 FIX: conseil_soir strictly derived from events
    data.conseil_soir = state.editingDayEvents.some(e => e.event_type === 'council') ? 1 : 0;

    // Auto-set status to 'modifié' when editing an existing day (prevents PDF merge from overwriting)
    if (state.editingDayId && data.status === 'brouillon') {
      data.status = 'modifié';
      $('dm-status').value = 'modifié';
    }

    // ── AXE 7.2: Cascade detection ──
    // If editing an existing day AND date changed, check for cascade impacts
    if (state.editingDayId) {
      const oldDay = state.shootingDays.find(d => d.id === state.editingDayId);
      const oldDate = oldDay?.date;
      if (oldDate && oldDate !== data.date && !state._cascadeDecision) {
        // Store pending save data and fetch cascade preview
        state._pendingSaveData = data;
        state._pendingOldDate = oldDate;
        try {
          const preview = await api('POST',
            `/api/productions/${state.prodId}/shooting-days/${state.editingDayId}/cascade-preview`,
            { old_date: oldDate, new_date: data.date });
          const total = preview.summary.assignments + preview.summary.fuel_entries
                        + preview.summary.location_schedules;
          if (total > 0) {
            _showCascadePreview(preview, oldDate, data.date);
            return; // Wait for user decision via modal
          }
          // No cascade needed, proceed normally
        } catch (e) {
          console.warn('Cascade preview failed, proceeding without cascade:', e);
        }
      }
    }
    // Clear cascade decision flag
    const cascadeDecision = state._cascadeDecision;
    state._cascadeDecision = null;
    state._pendingSaveData = null;
    state._pendingOldDate = null;

    try {
      let dayId = state.editingDayId;
      if (dayId) {
        // Capture old date before update so we can clean up if date changed
        const oldDay = state.shootingDays.find(d => d.id === dayId);
        const oldDate = oldDay?.date;
        const updated = await api('PUT',
          `/api/productions/${state.prodId}/shooting-days/${dayId}`, data);
        // Persist ALL inline event edits (every field, not just name/location/time)
        for (const ev of state.editingDayEvents) {
          if (ev.id) {
            await api('PUT', `/api/events/${ev.id}`, {
              sort_order: ev.sort_order, event_type: ev.event_type,
              name: ev.name, location: ev.location,
              heure_rehearsal: ev.heure_rehearsal, heure_host: ev.heure_host,
              heure_event: ev.heure_event, heure_depart: ev.heure_depart,
              heure_arrivee: ev.heure_arrivee, heure_teaser: ev.heure_teaser,
              heure_fin: ev.heure_fin,
              maree_hauteur: ev.maree_hauteur, maree_statut: ev.maree_statut,
              reward: ev.reward, notes: ev.notes,
            });
          }
        }
        // Reload this day's events from API to get fresh data
        const freshEvents = await api('GET',
          `/api/productions/${state.prodId}/shooting-days/${dayId}/events`);
        updated.events = freshEvents;
        const idx = state.shootingDays.findIndex(d => d.id === dayId);
        if (idx >= 0) state.shootingDays[idx] = updated;
        toast('Day updated');
        // If the date changed, clean up F entries on the old date first
        if (oldDate && oldDate !== data.date) {
          await _syncPdtLocationsDelete(oldDate);
        }
        // Sync PDT locations -> Locations tab (Film days)
        await _syncPdtLocations(data.date, data, freshEvents);

        // ── AXE 7.2: Apply cascade if user confirmed ──
        if (cascadeDecision === 'apply' && oldDate && oldDate !== data.date) {
          try {
            const result = await api('POST',
              `/api/productions/${state.prodId}/shooting-days/${dayId}/cascade-apply`,
              { old_date: oldDate, new_date: data.date });
            const a = result.applied;
            toast(`Cascade: ${a.assignments} assignments, ${a.fuel_entries} fuel, ${a.location_schedules} locations mis a jour`);
          } catch (e) {
            toast('Erreur cascade: ' + e.message, 'error');
          }
        }
      } else {
        data.production_id = state.prodId;
        const created = await api('POST',
          `/api/productions/${state.prodId}/shooting-days`, data);
        // Create any events added before day was saved
        for (let i = 0; i < state.editingDayEvents.length; i++) {
          const ev = { ...state.editingDayEvents[i], shooting_day_id: created.id };
          await api('POST',
            `/api/productions/${state.prodId}/shooting-days/${created.id}/events`, ev);
        }
        // Reload with events
        const freshEvents = await api('GET',
          `/api/productions/${state.prodId}/shooting-days/${created.id}/events`);
        created.events = freshEvents;
        state.shootingDays.push(created);
        state.shootingDays.sort((a, b) => (a.day_number || 0) - (b.day_number || 0));
        toast('Day created');
        // Sync PDT locations -> Locations tab (Film days)
        await _syncPdtLocations(data.date, data, freshEvents);
      }
      closeDayModal();
      renderPDT();
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    }
  }

  async function deleteDay() {
    if (!state.editingDayId) return;
    const d = state.shootingDays.find(x => x.id === state.editingDayId);
    showConfirm(`Delete Day ${d?.day_number} (${d?.date})?`, async () => {
      try {
        const dayDate = d?.date;
        await api('DELETE', `/api/productions/${state.prodId}/shooting-days/${state.editingDayId}`);
        state.shootingDays = state.shootingDays.filter(x => x.id !== state.editingDayId);
        // Sync: remove F days from Locations schedule for this deleted day
        if (dayDate) await _syncPdtLocationsDelete(dayDate);
        closeDayModal();
        renderPDT();
        toast('Day deleted');
      } catch (e) {
        toast('Error: ' + e.message, 'error');
      }
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  BOATS VIEW
  // ═══════════════════════════════════════════════════════════

  function renderBoats() {
    renderBoatList();
    if (state.boatView === 'cards')    renderRoleCards();
    else if (state.boatView === 'schedule') renderSchedule();
    else if (state.boatView === 'budget')   renderBoatBudget();
  }

  function setBoatView(view) {
    state.boatView = view;
    closeSchedulePopover();
    ['cards', 'schedule', 'budget'].forEach(v => {
      $(`boats-view-${v}`).classList.toggle('hidden', v !== view);
      $(`btab-${v}`).classList.toggle('active', v === view);
    });
    if (view === 'schedule') renderSchedule();
    else if (view === 'budget') renderBoatBudget();
    else renderRoleCards();
    _updateBreadcrumb(view.charAt(0).toUpperCase() + view.slice(1));
  }

  function filterBoats(f) {
    state.boatFilter = f;
    ['all', 'available', 'assigned', 'external'].forEach(id => {
      $(`boat-filter-${id}`).classList.toggle('active', id === f);
    });
    renderBoatList();
  }

  function _filteredBoats() {
    const assignedIds = new Set(state.assignments.filter(a => a.boat_id).map(a => a.boat_id));
    let boats = [...state.boats];
    if (state.boatFilter === 'available') {
      boats = boats.filter(b => !assignedIds.has(b.id) && b.group_name !== 'External');
    } else if (state.boatFilter === 'assigned') {
      boats = boats.filter(b => assignedIds.has(b.id));
    } else if (state.boatFilter === 'external') {
      boats = boats.filter(b => b.group_name === 'External');
    } else {
      boats = boats.filter(b => b.group_name !== 'External');
    }
    boats.sort((a, b) => (a.boat_nr || 999) - (b.boat_nr || 999));
    return boats;
  }

  function renderBoatList() {
    const boats = _filteredBoats();
    const assignedIds = new Set(state.assignments.filter(a => a.boat_id).map(a => a.boat_id));
    const container = $('boat-list');

    if (!boats.length) {
      container.innerHTML = '<div style="color:var(--text-4);font-size:.8rem;text-align:center;padding:1rem">No boats</div>';
      return;
    }

    container.innerHTML = boats.map(b => {
      const isAssigned = assignedIds.has(b.id);
      const isSelected = state.selectedBoat?.id === b.id;
      const boatAsgns  = state.assignments.filter(a => a.boat_id === b.id);
      const wClass = waveClass(b.wave_rating);

      const thumb = b.image_path
        ? `<img class="boat-thumb" src="/${b.image_path}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
           <div class="boat-thumb-placeholder" style="display:none">#${esc(b.boat_nr || '?')}</div>`
        : `<div class="boat-thumb-placeholder">#${esc(b.boat_nr || '?')}</div>`;

      const nr = b.boat_nr ? `<span style="font-size:.6rem;color:var(--text-4);font-family:monospace">#${esc(b.boat_nr)}</span> ` : '';
      const rateVal = b.daily_rate_estimate || 0;
      const rate = `<div style="font-size:.65rem;color:${rateVal > 0 ? 'var(--green)' : 'var(--text-4)'};margin-top:.1rem;cursor:pointer;display:inline-flex;align-items:center;gap:.2rem"
        onclick="event.stopPropagation();App.openBoatDetail(${b.id})"
        title="Click to edit rate">${rateVal > 0 ? '$' + Math.round(rateVal).toLocaleString('en-US') + '/d' : '+ set rate'}<span style="font-size:.55rem;opacity:.5">&#x270E;</span></div>`;

      return `<div class="boat-card ${isAssigned ? 'assigned' : ''} ${isSelected ? 'selected' : ''}"
        id="boat-card-${b.id}"
        draggable="true"
        ondragstart="App.onBoatDragStart(event,${b.id})"
        ondragend="App.onBoatDragEnd()"
        onclick="App.openBoatView(${b.id})">
        <div class="boat-thumb-wrap">${thumb}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:baseline;gap:.3rem;margin-bottom:.2rem;flex-wrap:wrap">
            ${nr}<span style="font-weight:700;font-size:.82rem;color:var(--text-0);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(b.name)}</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:.2rem;align-items:center;margin-bottom:.1rem">
            <span class="wave-badge ${wClass}">${waveLabel(b.wave_rating)}</span>
            ${b.capacity ? `<span style="font-size:.65rem;color:var(--text-3)">${esc(b.capacity)} pax</span>` : ''}
            ${b.night_ok ? '<span class="night-badge">NIGHT</span>' : ''}
          </div>
          ${b.captain ? `<div style="font-size:.65rem;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">⚓ ${esc(b.captain)}</div>` : ''}
          ${b.vendor  ? `<div style="font-size:.65rem;color:var(--orange);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">🏢 ${esc(b.vendor)}</div>` : ''}
          ${rate}
          ${isAssigned && boatAsgns.length ? `<div style="font-size:.6rem;color:var(--accent);margin-top:.1rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">→ ${boatAsgns.map(a => esc(a.function_name || '')).join(', ')}</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:.15rem;flex-shrink:0;align-self:flex-start">
          <button class="boat-edit-btn" title="Edit boat"
            onclick="event.stopPropagation();App.openBoatDetail(${b.id})">&#x270E;</button>
          <button class="card-delete-btn" title="Delete boat"
            onclick="event.stopPropagation();App.confirmDeleteBoat(${b.id},'${esc(b.name).replace(/'/g,"\\'")}',${boatAsgns.length})">&#x1F5D1;</button>
        </div>
      </div>`;
    }).join('');
  }

  // ── Delete boat from card ──────────────────────────────────
  function confirmDeleteBoat(boatId, boatName, assignmentCount) {
    const impact = assignmentCount > 0 ? `\n${assignmentCount} assignment(s) will also be deleted.` : '';
    showConfirm(`Delete boat "${boatName}"?${impact}`, async () => {
      try {
        await api('DELETE', `/api/boats/${boatId}`);
        state.boats = state.boats.filter(b => b.id !== boatId);
        state.assignments = state.assignments.filter(a => a.boat_id !== boatId);
        closeBoatDetail();
        renderBoats();
        toast('Boat deleted');
      } catch (e) { toast('Error: ' + e.message, 'error'); }
    });
  }

  // ── Role / function cards ──────────────────────────────────
  function _assignmentForFunc(funcId) {
    return state.assignments.find(a => a.boat_function_id === funcId) || null;
  }
  function _assignmentsForFunc(funcId) {
    return state.assignments.filter(a => a.boat_function_id === funcId);
  }

  function renderRoleCards() {
    const container = $('role-groups');
    const grouped = {};
    _groupOrder('boats').forEach(g => { grouped[g] = []; });
    state.functions.forEach(f => {
      const g = f.function_group || 'Special';
      if (!grouped[g]) grouped[g] = [];
      grouped[g].push(f);
    });

    let html = '';
    _groupOrder('boats').forEach(group => {
      const funcs = grouped[group];
      if (!funcs.length) return;
      const color = _groupColor('boats', group);
      html += `
        <div class="role-group-header" style="background:${color}18;border-left:3px solid ${color}">
          <span style="color:${color}">●</span>
          <span style="color:${color}">${esc(group)}</span>
          <span style="color:var(--text-4);font-weight:400;font-size:.65rem;text-transform:none;letter-spacing:0">${funcs.length} function${funcs.length > 1 ? 's' : ''}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:.5rem;margin-bottom:.75rem">
          ${funcs.map(f => renderRoleCard(f, color)).join('')}
        </div>`;
    });

    container.innerHTML = html || '<div style="color:var(--text-4);text-align:center;padding:3rem">No functions. Click + Function to add one.</div>';
  }

  function renderRoleCard(func, color) {
    const asgns = _assignmentsForFunc(func.id);

    let assignedBodies = asgns.map(asgn => {
      const boatName = asgn.boat_name_override || asgn.boat_name || '?';
      const wd   = computeWd(asgn);
      const rate = asgn.price_override || asgn.boat_daily_rate_estimate || 0;
      const total = Math.round(wd * rate);
      const wClass = waveClass(asgn.wave_rating || '');

      return `<div class="assigned-mini" style="margin-bottom:.35rem">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;margin-bottom:.2rem">
              ${asgn.wave_rating ? `<span class="wave-badge ${wClass}">${waveLabel(asgn.wave_rating)}</span>` : ''}
              <span style="font-weight:600;color:var(--text-0);font-size:.82rem">${esc(boatName)}</span>
              ${asgn.captain ? `<span style="color:var(--text-3);font-size:.7rem">· ${esc(asgn.captain)}</span>` : ''}
              ${asgn.include_sunday === 0 ? '<span style="font-size:.6rem;background:var(--orange);color:#000;padding:0 .3rem;border-radius:3px;font-weight:700">NO SUN</span>' : ''}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:.2rem">
            <button class="btn btn-sm btn-secondary btn-icon" onclick="App.editAssignmentById(${asgn.id})" title="Edit">✎</button>
            <button class="btn btn-sm btn-danger btn-icon" onclick="App.removeAssignmentById(${asgn.id})" title="Remove">✕</button>
          </div>
        </div>
      </div>`;
    });

    const dropZone = `<div class="drop-zone" id="drop-${func.id}"
      ondragover="App.onDragOver(event,${func.id})"
      ondragleave="App.onDragLeave(event,${func.id})"
      ondrop="App.onDrop(event,${func.id})"
      onclick="App.onDropZoneClick(${func.id})"
      style="${asgns.length ? 'margin-top:.3rem;padding:.35rem;font-size:.7rem' : ''}">
      ${state.selectedBoat
        ? `<span style="color:var(--accent)">Click to assign <strong>${esc(state.selectedBoat.name)}</strong></span>`
        : (asgns.length ? '<span>+ Add another assignment</span>' : '<span>Drop or click a boat to assign</span>')}
    </div>`;

    const body = assignedBodies.join('') + dropZone;

    return `<div class="role-card" id="role-card-${func.id}"
      style="border-top:3px solid ${color}"
      ondragover="App.onDragOver(event,${func.id})"
      ondragleave="App.onDragLeave(event,${func.id})"
      ondrop="App.onDrop(event,${func.id})">
      <div class="role-card-header">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;color:var(--text-0);font-size:.85rem">${esc(func.name)}</div>
          ${func.specs ? `<div style="font-size:.7rem;color:var(--text-4);margin-top:.1rem">${esc(func.specs)}</div>` : ''}
        </div>
        <button onclick="App.confirmDeleteFunc(${func.id})"
          style="color:var(--text-4);background:none;border:none;cursor:pointer;font-size:.9rem;padding:.2rem"
          title="Delete">✕</button>
      </div>
      <div class="role-card-body">${body}</div>
    </div>`;
  }

  // ── Drag & drop ────────────────────────────────────────────
  function onBoatDragStart(event, boatId) {
    state.dragBoat = state.boats.find(b => b.id === boatId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', boatId);
    document.getElementById(`boat-card-${boatId}`)?.classList.add('dragging');
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.textContent = state.dragBoat?.name || 'Boat';
    document.body.appendChild(ghost);
    event.dataTransfer.setDragImage(ghost, 60, 15);
    setTimeout(() => ghost.remove(), 0);
  }

  function onBoatDragEnd() {
    state.dragBoat = null;
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  }

  function onDragOver(event, funcId) {
    event.preventDefault();
    document.getElementById(`role-card-${funcId}`)?.classList.add('drag-over');
    document.getElementById(`drop-${funcId}`)?.classList.add('drag-over');
  }

  function onDragLeave(event, funcId) {
    document.getElementById(`role-card-${funcId}`)?.classList.remove('drag-over');
    document.getElementById(`drop-${funcId}`)?.classList.remove('drag-over');
  }

  function onDrop(event, funcId) {
    event.preventDefault();
    document.getElementById(`role-card-${funcId}`)?.classList.remove('drag-over');
    document.getElementById(`drop-${funcId}`)?.classList.remove('drag-over');
    const boat = state.dragBoat;
    if (!boat) return;
    state.dragBoat = null;
    openAssignModal(funcId, boat);
  }

  function onBoatClick(boatId) {
    const boat = state.boats.find(b => b.id === boatId);
    if (!boat) return;
    if (state.pendingFuncId) {
      openAssignModal(state.pendingFuncId, boat, null, state.pendingDate);
      state.pendingFuncId = null;
      state.pendingDate   = null;
      state.selectedBoat  = null;
      renderBoatList();
      return;
    }
    state.selectedBoat = state.selectedBoat?.id === boatId ? null : boat;
    if (state.selectedBoat) toast(`${boat.name} selected — click a function to assign`, 'info');
    renderBoatList();
    renderRoleCards();
  }

  function onDropZoneClick(funcId) {
    if (state.selectedBoat) {
      openAssignModal(funcId, state.selectedBoat);
      state.selectedBoat = null;
    } else {
      state.pendingFuncId = funcId;
      state.pendingDate   = null;
      toast('Now click a boat to assign it', 'info');
      renderBoatList();
    }
  }

  // ── Assignment modal ───────────────────────────────────────
  // existingAsgn: if editing a specific assignment by ID
  function openAssignModal(funcId, boat, existingAsgn, prefillStart) {
    _assignCtx = _tabCtx;   // capture which tab opened this modal
    const allFunctions = _tabCtx === 'security'
      ? [...state.securityFunctions, ...state.functions, ...state.pictureFunctions]
      : _tabCtx === 'transport'
        ? [...state.transportFunctions, ...state.functions, ...state.pictureFunctions]
        : _tabCtx === 'labour'
          ? [...state.labourFunctions, ...state.functions, ...state.pictureFunctions]
          : _tabCtx === 'guard_camp'
            ? [...state.gcFunctions, ...state.functions, ...state.pictureFunctions]
            : _tabCtx === 'picture'
              ? [...state.pictureFunctions, ...state.functions]
              : [...state.functions, ...state.pictureFunctions];
    const func = allFunctions.find(f => f.id === funcId);
    if (!func || !boat) return;
    const rate = boat.daily_rate_estimate || 0;

    $('am-func-id').value  = funcId;
    $('am-boat-id').value  = boat.id;
    // Store assignment ID for edit vs create
    $('am-func-id').dataset.assignmentId = existingAsgn?.id || '';
    $('assign-modal-title').textContent = existingAsgn ? 'Edit assignment'
      : _tabCtx === 'labour' ? 'Assign worker'
      : _tabCtx === 'guard_camp' ? 'Assign guard'
      : _tabCtx === 'transport' ? 'Assign vehicle'
      : 'Assign boat';
    $('am-func-name').textContent = func.name;
    $('am-boat-name').textContent = boat.name + (boat.captain ? ` · ${boat.captain}` : '');
    $('am-notes').value = existingAsgn?.notes || '';
    $('am-price-display').textContent = rate > 0 ? `$${rate.toLocaleString()}/day` : 'Rate not set';
    $('am-include-sunday').checked = existingAsgn?.include_sunday !== 0;
    _updateBillingLabel();
    $('am-include-sunday').onchange = _updateBillingLabel;

    const datesInfo = $('am-dates-info');
    if (existingAsgn?.start_date) {
      const wd = computeWd(existingAsgn);
      datesInfo.textContent = `${fmtDate(existingAsgn.start_date)} → ${fmtDate(existingAsgn.end_date)}  ·  ${wd}d  ·  ${fmtMoney(Math.round(wd * rate))}`;
      datesInfo.style.display = '';
    } else {
      datesInfo.style.display = 'none';
    }

    $('assign-modal-overlay').classList.remove('hidden');
  }

  function closeAssignModal() {
    $('assign-modal-overlay').classList.add('hidden');
    state.selectedBoat  = null;
    state.pendingFuncId = null;
  }

  function _updateBillingLabel() {
    const el = $('am-billing-label');
    if (el) el.textContent = $('am-include-sunday').checked ? 'Monthly (7d/7)' : 'Per working day (Mon-Sat)';
  }

  async function confirmAssignment() {
    const funcId       = parseInt($('am-func-id').value);
    const boatId       = parseInt($('am-boat-id').value);
    const assignmentId = $('am-func-id').dataset.assignmentId;
    const notes  = $('am-notes').value;
    const includeSunday = $('am-include-sunday').checked ? 1 : 0;

    try {
      if (_assignCtx === 'security') {
        if (assignmentId) {
          await api('PUT', `/api/security-boat-assignments/${assignmentId}`, {
            security_boat_id: boatId, notes, include_sunday: includeSunday,
          });
        } else {
          await api('POST', `/api/productions/${state.prodId}/security-boat-assignments`, {
            boat_function_id: funcId, security_boat_id: boatId, notes, include_sunday: includeSunday,
          });
        }
        closeAssignModal();
        state.securityAssignments = await api('GET', `/api/productions/${state.prodId}/security-boat-assignments`);
        renderSecurityBoats();
        const func = state.securityFunctions.find(f => f.id === funcId);
        const boat = state.securityBoats.find(b => b.id === boatId);
        toast(assignmentId ? 'Assignment updated' : `${boat?.name || 'Boat'} assigned to ${func?.name || 'function'}`);
      } else if (_assignCtx === 'picture') {
        if (assignmentId) {
          await api('PUT', `/api/picture-boat-assignments/${assignmentId}`, {
            picture_boat_id: boatId, notes, include_sunday: includeSunday,
          });
        } else {
          await api('POST', `/api/productions/${state.prodId}/picture-boat-assignments`, {
            boat_function_id: funcId, picture_boat_id: boatId, notes, include_sunday: includeSunday,
          });
        }
        closeAssignModal();
        state.pictureAssignments = await api('GET', `/api/productions/${state.prodId}/picture-boat-assignments`);
        renderPictureBoats();
        const func = state.pictureFunctions.find(f => f.id === funcId);
        const boat = state.pictureBoats.find(b => b.id === boatId);
        toast(assignmentId ? 'Assignment updated' : `${boat?.name || 'Boat'} assigned to ${func?.name || 'function'}`);
      } else if (_assignCtx === 'transport') {
        if (assignmentId) {
          await api('PUT', `/api/transport-assignments/${assignmentId}`, { vehicle_id: boatId, notes, include_sunday: includeSunday });
        } else {
          await api('POST', `/api/productions/${state.prodId}/transport-assignments`, {
            boat_function_id: funcId, vehicle_id: boatId, notes, include_sunday: includeSunday,
          });
        }
        closeAssignModal();
        state.transportAssignments = await api('GET', `/api/productions/${state.prodId}/transport-assignments`);
        renderTransport();
        const func = state.transportFunctions.find(f => f.id === funcId);
        const vehicle = state.transportVehicles.find(v => v.id === boatId);
        toast(assignmentId ? 'Assignment updated' : `${vehicle?.name || 'Vehicle'} assigned to ${func?.name || 'function'}`);
      } else if (_assignCtx === 'labour') {
        if (assignmentId) {
          await api('PUT', `/api/helper-assignments/${assignmentId}`, { helper_id: boatId, notes, include_sunday: includeSunday });
        } else {
          await api('POST', `/api/productions/${state.prodId}/helper-assignments`, {
            boat_function_id: funcId, helper_id: boatId, notes, include_sunday: includeSunday,
          });
        }
        closeAssignModal();
        state.labourAssignments = await api('GET', `/api/productions/${state.prodId}/helper-assignments`);
        renderLabour();
        const lfunc = state.labourFunctions.find(f => f.id === funcId);
        const worker = state.labourWorkers.find(w => w.id === boatId);
        toast(assignmentId ? 'Assignment updated' : `${worker?.name || 'Worker'} assigned to ${lfunc?.name || 'function'}`);
      } else if (_assignCtx === 'guard_camp') {
        if (assignmentId) {
          await api('PUT', `/api/guard-camp-assignments/${assignmentId}`, { helper_id: boatId, notes, include_sunday: includeSunday });
        } else {
          await api('POST', `/api/productions/${state.prodId}/guard-camp-assignments`, {
            boat_function_id: funcId, helper_id: boatId, notes, include_sunday: includeSunday,
          });
        }
        closeAssignModal();
        state.gcAssignments = await api('GET', `/api/productions/${state.prodId}/guard-camp-assignments`);
        renderGuardCamp();
        const gcfunc = state.gcFunctions.find(f => f.id === funcId);
        const guard = state.gcWorkers.find(w => w.id === boatId);
        toast(assignmentId ? 'Assignment updated' : `${guard?.name || 'Guard'} assigned to ${gcfunc?.name || 'function'}`);
      } else {
        if (assignmentId) {
          await api('PUT', `/api/assignments/${assignmentId}`, {
            boat_id: boatId, notes, include_sunday: includeSunday,
          });
        } else {
          await api('POST', `/api/productions/${state.prodId}/assignments`, {
            boat_function_id: funcId, boat_id: boatId, notes, include_sunday: includeSunday,
          });
        }
        closeAssignModal();
        state.assignments = await api('GET', `/api/productions/${state.prodId}/assignments?context=boats`);
        renderBoats();
        const func = state.functions.find(f => f.id === funcId);
        const boat = state.boats.find(b => b.id === boatId);
        toast(assignmentId ? 'Assignment updated' : `${boat?.name || 'Boat'} assigned to ${func?.name || 'function'}`);
      }
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    }
  }

  function editAssignment(funcId) {
    const asgn = _assignmentForFunc(funcId);
    if (!asgn) return;
    editAssignmentById(asgn.id);
  }

  function editAssignmentById(assignmentId) {
    const asgn = state.assignments.find(a => a.id === assignmentId)
               || state.pictureAssignments.find(a => a.id === assignmentId);
    if (!asgn) return;
    const doEdit = () => {
      const boat = state.boats.find(b => b.id === asgn.boat_id)
        || { id: 0, name: asgn.boat_name_override || asgn.boat_name || '?', daily_rate_estimate: 0 };
      // Set tab context based on which assignments array this came from
      const isPicture = state.pictureAssignments.some(a => a.id === assignmentId);
      const prevCtx = _tabCtx;
      _tabCtx = isPicture ? 'picture' : 'boats';
      openAssignModal(asgn.boat_function_id, boat, asgn);
      _tabCtx = prevCtx;
    };
    doEdit();
  }

  function pbEditAssignmentById(assignmentId) {
    const asgn = state.pictureAssignments.find(a => a.id === assignmentId);
    if (!asgn) return;
    const boat = state.pictureBoats.find(b => b.id === asgn.picture_boat_id)
      || { id: asgn.picture_boat_id || 0, name: asgn.boat_name_override || asgn.boat_name || '?', daily_rate_estimate: 0 };
    _tabCtx = 'picture';
    openAssignModal(asgn.boat_function_id, boat, asgn);
  }

  async function removeAssignment(funcId) {
    const func = state.functions.find(f => f.id === funcId);
    showConfirm(`Remove all assignments from "${func?.name}"?`, async () => {
      try {
        await api('DELETE', `/api/productions/${state.prodId}/assignments/function/${funcId}`);
        state.assignments = state.assignments.filter(a => a.boat_function_id !== funcId);
        renderBoats();
        toast('Assignments removed');
      } catch (e) {
        toast('Error: ' + e.message, 'error');
      }
    });
  }

  async function removeAssignmentById(assignmentId) {
    try {
      await api('DELETE', `/api/assignments/${assignmentId}`);
      state.assignments = state.assignments.filter(a => a.id !== assignmentId);
      closeSchedulePopover();
      renderBoats();
      toast('Assignment removed');
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    }
  }

  async function pbRemoveAssignmentById(assignmentId) {
    try {
      await api('DELETE', `/api/picture-boat-assignments/${assignmentId}`);
      state.pictureAssignments = state.pictureAssignments.filter(a => a.id !== assignmentId);
      renderPictureBoats();
      toast('Assignment removed');
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    }
  }

  // ── Add boat ───────────────────────────────────────────────
  function showAddBoatModal() {
    ['nb-name','nb-price','nb-capacity','nb-captain','nb-notes'].forEach(id => $(id).value = '');
    $('nb-wave').value    = 'Waves';
    $('nb-night').checked = false;
    $('add-boat-overlay').classList.remove('hidden');
    setTimeout(() => $('nb-name').focus(), 80);
  }

  function closeAddBoatModal() { $('add-boat-overlay').classList.add('hidden'); }

  async function createBoat() {
    const name = $('nb-name').value.trim();
    if (!name) { toast('Name is required', 'error'); return; }
    try {
      const boat = await api('POST', `/api/productions/${state.prodId}/boats`, {
        name,
        daily_rate_estimate: parseFloat($('nb-price').value) || 0,
        capacity:   $('nb-capacity').value.trim() || null,
        captain:    $('nb-captain').value.trim() || null,
        wave_rating: $('nb-wave').value,
        night_ok:   $('nb-night').checked ? 1 : 0,
        notes:      $('nb-notes').value.trim() || null,
        group_name: 'Custom',
      });
      state.boats.push(boat);
      closeAddBoatModal();
      renderBoatList();
      toast(`Boat "${boat.name}" created`);
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    }
  }

  // ── Add / edit picture boats ───────────────────────────────
  function showAddPictureBoatModal() {
    ['npb-name','npb-price','npb-capacity','npb-captain','npb-notes'].forEach(id => $(id).value = '');
    $('npb-wave').value    = 'Waves';
    $('npb-night').checked = false;
    $('add-picture-boat-overlay').classList.remove('hidden');
    setTimeout(() => $('npb-name').focus(), 80);
  }

  function closeAddPictureBoatModal() { $('add-picture-boat-overlay').classList.add('hidden'); }

  async function createPictureBoat() {
    const name = $('npb-name').value.trim();
    if (!name) { toast('Name is required', 'error'); return; }
    try {
      const pb = await api('POST', `/api/productions/${state.prodId}/picture-boats`, {
        name,
        daily_rate_estimate: parseFloat($('npb-price').value) || 0,
        capacity:    $('npb-capacity').value.trim() || null,
        captain:     $('npb-captain').value.trim()  || null,
        wave_rating: $('npb-wave').value,
        night_ok:    $('npb-night').checked ? 1 : 0,
        notes:       $('npb-notes').value.trim() || null,
        group_name:  'Custom',
      });
      state.pictureBoats.push(pb);
      closeAddPictureBoatModal();
      renderPbBoatList();
      toast(`Picture boat "${pb.name}" created`);
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    }
  }

  let _detailIsPicture = false;
  let _detailIsTransport = false;
  let _detailIsLabour = false;
  let _detailIsGuardCamp = false;
  let _detailIsSecurityBoat = false;

  function openPictureBoatDetail(pbId) {
    const pb = state.pictureBoats.find(b => b.id === pbId);
    if (!pb) return;
    _detailBoatId   = pbId;
    _detailIsPicture = true;

    const photo = $('bd-photo');
    const placeholder = $('bd-photo-placeholder');
    if (pb.image_path) {
      photo.src = '/' + pb.image_path + '?t=' + Date.now();
      photo.style.display = 'block'; placeholder.style.display = 'none';
    } else {
      photo.style.display = 'none'; placeholder.style.display = 'flex';
      placeholder.textContent = '#' + (pb.boat_nr || '?');
    }

    $('bd-name').value    = pb.name || '';
    $('bd-nr').value      = pb.boat_nr || '';
    $('bd-group').value   = pb.group_name || 'Custom';
    $('bd-category').value = 'picture';
    $('bd-capacity').value = pb.capacity || '';
    $('bd-captain').value  = pb.captain  || '';
    $('bd-vendor').value   = pb.vendor   || '';
    $('bd-waves').value    = pb.wave_rating || 'Waves';
    $('bd-night').checked  = !!pb.night_ok;
    $('bd-rate-est').value = pb.daily_rate_estimate || '';
    $('bd-rate-act').value = pb.daily_rate_actual   || '';
    $('bd-notes').value    = pb.notes || '';

    // Hide category row — not relevant for picture boats
    const catRow = $('bd-category').closest('tr');
    if (catRow) catRow.style.display = 'none';

    const asgns = state.pictureAssignments.filter(a => a.picture_boat_id === pbId);
    $('bd-assignments-list').innerHTML = asgns.length
      ? asgns.map(a => `<div class="bd-asgn-row">
          <span style="font-weight:600;color:var(--text-0)">${esc(a.function_name || '?')}</span>
          <span style="color:var(--text-3);font-size:.72rem">${fmtDate(a.start_date)} → ${fmtDate(a.end_date)}</span>
        </div>`).join('')
      : '<div style="color:var(--text-4);font-size:.78rem">No assignments yet</div>';

    $('bd-delete-btn').classList.remove('hidden');
    $('boat-detail-overlay').classList.remove('hidden');
  }

  function _detailBoatIdForBtn() { return _detailBoatId; }

  async function deletePictureBoat(pbId) {
    showConfirm('Delete this picture boat? All assignments will be lost.', async () => {
      try {
        await api('DELETE', `/api/picture-boats/${pbId}`);
        state.pictureBoats       = state.pictureBoats.filter(b => b.id !== pbId);
        state.pictureAssignments = state.pictureAssignments.filter(a => a.picture_boat_id !== pbId);
        closeBoatDetail();
        renderPictureBoats();
        toast('Picture boat deleted');
      } catch (e) { toast('Error: ' + e.message, 'error'); }
    });
  }

  // ── Add function ───────────────────────────────────────────
  function showAddFunctionModal() {
    ['nf-name','nf-specs','nf-start','nf-end'].forEach(id => $(id).value = '');
    $('nf-group').innerHTML = state.boatGroups.map(g => `<option value="${g.name}">${g.name}</option>`).join('');
    $('nf-group').value = state.boatGroups[0]?.name || '';
    $('nf-color').value = state.boatGroups[0]?.color || '#3B82F6';
    $('nf-group').onchange = (e) => {
      const g = state.boatGroups.find(g => g.name === e.target.value);
      $('nf-color').value = g?.color || '#6b7280';
    };
    $('add-func-overlay').dataset.ctx = 'boats';
    $('add-func-overlay').classList.remove('hidden');
    setTimeout(() => $('nf-name').focus(), 80);
  }

  function pbShowAddFunctionModal() {
    ['nf-name','nf-specs','nf-start','nf-end'].forEach(id => $(id).value = '');
    $('nf-group').innerHTML = state.pbGroups.map(g => `<option value="${g.name}">${g.name}</option>`).join('');
    $('nf-group').value = state.pbGroups[0]?.name || '';
    $('nf-color').value = state.pbGroups[0]?.color || '#6b7280';
    $('nf-group').onchange = (e) => {
      const g = state.pbGroups.find(g => g.name === e.target.value);
      $('nf-color').value = g?.color || '#6b7280';
    };
    $('add-func-overlay').dataset.ctx = 'picture';
    $('add-func-overlay').classList.remove('hidden');
    setTimeout(() => $('nf-name').focus(), 80);
  }

  function closeAddFunctionModal() {
    $('add-func-overlay').classList.add('hidden');
    $('nf-group').onchange = null;
  }

  async function createFunction() {
    const name = $('nf-name').value.trim();
    if (!name) { toast('Name is required', 'error'); return; }
    const ctx = $('add-func-overlay').dataset.ctx || 'boats';
    try {
      const func = await api('POST', `/api/productions/${state.prodId}/boat-functions`, {
        name,
        function_group: $('nf-group').value,
        color:          $('nf-color').value,
        default_start:  $('nf-start').value || null,
        default_end:    $('nf-end').value   || null,
        specs:          $('nf-specs').value.trim() || null,
        sort_order:     ctx === 'picture' ? state.pictureFunctions.length : ctx === 'labour' ? state.labourFunctions.length : ctx === 'guard_camp' ? state.gcFunctions.length : state.functions.length,
        context:        ctx,
      });
      if (ctx === 'picture') {
        state.pictureFunctions.push(func);
        closeAddFunctionModal();
        renderPbRoleCards();
      } else if (ctx === 'transport') {
        state.transportFunctions.push(func);
        closeAddFunctionModal();
        renderTbRoleCards();
      } else if (ctx === 'security') {
        state.securityFunctions.push(func);
        closeAddFunctionModal();
        renderSecurityBoats();
      } else if (ctx === 'labour') {
        state.labourFunctions.push(func);
        closeAddFunctionModal();
        renderLbRoleCards();
      } else if (ctx === 'guard_camp') {
        state.gcFunctions.push(func);
        closeAddFunctionModal();
        renderGcRoleCards();
      } else {
        state.functions.push(func);
        closeAddFunctionModal();
        renderRoleCards();
      }
      toast(`Function "${func.name}" created`);
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    }
  }

  async function confirmDeleteFunc(funcId) {
    const func = state.functions.find(f => f.id === funcId);
    showConfirm(`Delete function "${func?.name}"? The assignment will be lost.`, async () => {
      try {
        await api('DELETE', `/api/boat-functions/${funcId}`);
        state.functions    = state.functions.filter(f => f.id !== funcId);
        state.assignments  = state.assignments.filter(a => a.boat_function_id !== funcId);
        renderRoleCards();
        toast('Function deleted');
      } catch (e) {
        toast('Error: ' + e.message, 'error');
      }
    });
  }

  async function pbConfirmDeleteFunc(funcId) {
    const func = state.pictureFunctions.find(f => f.id === funcId);
    showConfirm(`Delete function "${func?.name}"? The assignment will be lost.`, async () => {
      try {
        await api('DELETE', `/api/boat-functions/${funcId}`);
        state.pictureFunctions   = state.pictureFunctions.filter(f => f.id !== funcId);
        state.pictureAssignments = state.pictureAssignments.filter(a => a.boat_function_id !== funcId);
        renderPbRoleCards();
        toast('Function deleted');
      } catch (e) {
        toast('Error: ' + e.message, 'error');
      }
    });
  }

  // ── Schedule ───────────────────────────────────────────────
  // Returns background color string for a schedule cell based on effective status
  function _scheduleCellBg(status, groupColor, isWeekend) {
    // Solid color — weekend slightly darkened by mixing with black
    if (isWeekend) {
      // Overlay rgba(0,0,0,0.18) on the group color via CSS gradient
      return `linear-gradient(rgba(0,0,0,0.18),rgba(0,0,0,0.18)), ${groupColor}`;
    }
    return groupColor;
  }

  // ── Scroll preservation helper ──────────────────────────────
  // Before re-rendering a schedule via innerHTML, save scroll offsets of
  // scrollable wrappers inside the container, then restore after the update.
  function _saveScheduleScroll(container) {
    const saved = {};
    if (!container) return saved;
    // Save container's own scroll position
    saved.container = { left: container.scrollLeft, top: container.scrollTop };
    const sw = container.querySelector('.schedule-wrap');
    if (sw) { saved.sw = { left: sw.scrollLeft, top: sw.scrollTop }; }
    const sl = container.querySelector('.schedule-lock-outer');
    if (sl) { saved.sl = { left: sl.scrollLeft, top: sl.scrollTop }; }
    const lw = container.querySelector('.loc-schedule-wrap');
    if (lw) { saved.lw = { left: lw.scrollLeft, top: lw.scrollTop }; }
    return saved;
  }
  function _restoreScheduleScroll(container, saved) {
    if (!container || !saved) return;
    if (saved.container) {
      container.scrollLeft = saved.container.left;
      container.scrollTop = saved.container.top;
    }
    if (saved.sw) {
      const sw = container.querySelector('.schedule-wrap');
      if (sw) { sw.scrollLeft = saved.sw.left; sw.scrollTop = saved.sw.top; }
    }
    if (saved.sl) {
      const sl = container.querySelector('.schedule-lock-outer');
      if (sl) { sl.scrollLeft = saved.sl.left; sl.scrollTop = saved.sl.top; }
    }
    if (saved.lw) {
      const lw = container.querySelector('.loc-schedule-wrap');
      if (lw) { lw.scrollLeft = saved.lw.left; lw.scrollTop = saved.lw.top; }
    }
  }

  function renderSchedule() {
    const container = $('schedule-container');
    const days = [];
    const d = new Date(SCHEDULE_START);
    while (d <= SCHEDULE_END) { days.push(new Date(d)); d.setDate(d.getDate() + 1); }

    // Column windowing: determine visible range from current scroll
    const wrapEl = container.querySelector('.schedule-wrap');
    const { start: vColStart, end: vColEnd } = _getVisibleColRange(wrapEl, days.length);

    const pdtByDate = {};
    state.shootingDays.forEach(day => { pdtByDate[day.date] = day; });

    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthGroups = [];
    let prevM = -1, cnt = 0;
    days.forEach(day => {
      if (day.getMonth() !== prevM) {
        if (prevM >= 0) monthGroups.push({ m: prevM, cnt });
        prevM = day.getMonth(); cnt = 1;
      } else cnt++;
    });
    monthGroups.push({ m: prevM, cnt });

    // ── Month header row ──
    let monthRow = '<th class="role-name-cell"></th>';
    monthRow += monthGroups.map(mg =>
      `<th colspan="${mg.cnt}" style="text-align:center;font-size:.65rem">${monthNames[mg.m]}</th>`
    ).join('');

    // ── Day header row ──
    let dayRow = '<th class="role-name-cell"></th>';
    dayRow += days.map(day => {
      const dk = _localDk(day);
      const isWE = day.getDay() === 0 || day.getDay() === 6;
      const isLocked = !!state.lockedDays[dk];
      return `<th class="schedule-day-th ${isWE ? 'weekend-col' : ''} ${pdtByDate[dk] ? 'has-pdt' : ''} ${isLocked ? 'day-locked' : ''}"
        data-date="${dk}"
        onmouseenter="App.showDateTooltip(event,'${dk}')"
        onmouseleave="App.hidePDTTooltip()"
      >${day.getDate()}</th>`;
    }).join('');

    const dailyCnt = {};
    days.forEach(d => { dailyCnt[_localDk(d)] = 0; });

    // ── Function rows ──
    const gOrder = _groupOrder('boats');
    const sortedFuncs = [...state.functions].sort((a, b) => {
      const ga = gOrder.indexOf(a.function_group || 'Special');
      const gb = gOrder.indexOf(b.function_group || 'Special');
      return (ga === -1 ? 999 : ga) - (gb === -1 ? 999 : gb) || a.sort_order - b.sort_order;
    });
    const rowsHTML = sortedFuncs.map(func => {
      const funcAsgns = _assignmentsForFunc(func.id);
      const color = _groupColor('boats', func.function_group);

      // Count active days
      funcAsgns.forEach(asgn => {
        days.forEach(d => {
          const dk = _localDk(d);
          if (effectiveStatus(asgn, dk)) dailyCnt[dk] = (dailyCnt[dk] || 0) + 1;
        });
      });

      // Left column: group + boat name (or function name if unassigned)
      const boatAsgn = funcAsgns.find(a => a.boat_id || a.boat_name_override || a.boat_name);
      const boatLabel = boatAsgn ? (boatAsgn.boat_name_override || boatAsgn.boat_name || null) : null;
      const multiSuffix = funcAsgns.length > 1 ? ` +${funcAsgns.length - 1}` : '';

      let cells = `<td class="role-name-cell sch-func-cell" style="border-top:2px solid ${color}"
        data-func-id="${func.id}" title="${esc(func.name)}" onclick="App.onFuncCellClick(event,${func.id})">
        <div class="rn-group" style="color:${color}">${esc(func.function_group || 'Special')}</div>
        <div class="${boatLabel ? 'rn-boat' : 'rn-empty'}">${esc(boatLabel ? boatLabel + multiSuffix : func.name)}</div>
      </td>`;

      // Date cells: pure click-to-cycle, no text (windowed)
      days.forEach((day, colIdx) => {
        const dk = _localDk(day);
        const isWE = day.getDay() === 0 || day.getDay() === 6;
        const weClass = isWE ? 'weekend-col' : '';

        // Skip full rendering for off-screen columns
        if (colIdx < vColStart || colIdx >= vColEnd) {
          cells += `<td class="schedule-cell ${weClass}"></td>`;
          return;
        }

        // Find first assignment with a non-null status for this day
        let filledAsgn = null, filledStatus = null;
        for (const asgn of funcAsgns) {
          const st = effectiveStatus(asgn, dk);
          if (st) { filledAsgn = asgn; filledStatus = st; break; }
        }

        if (!filledAsgn) {
          cells += `<td class="schedule-cell ${weClass}" data-func="${func.id}" data-date="${dk}" data-asgn=""
            onmousedown="App._onScheduleMouseDown(event,${func.id},null,'${dk}')"
            onmouseover="App._onScheduleMouseOver(event,${func.id},null,'${dk}')"></td>`;
        } else {
          const bg = _scheduleCellBg(filledStatus, color, isWE);
          cells += `<td class="schedule-cell ${weClass}" data-func="${func.id}" data-date="${dk}" data-asgn="${filledAsgn.id}" style="background:${bg}"
            onmousedown="App._onScheduleMouseDown(event,${func.id},${filledAsgn.id},'${dk}')"
            onmouseover="App._onScheduleMouseOver(event,${func.id},${filledAsgn.id},'${dk}')"></td>`;
        }
      });

      return `<tr>${cells}</tr>`;
    }).join('');

    // ── Active boats count row ──
    let countCells = '<td class="role-name-cell" style="color:var(--text-3);font-size:.68rem">Active boats</td>';
    countCells += days.map(day => {
      const dk = _localDk(day);
      const c = dailyCnt[dk] || 0;
      const isWE = day.getDay() === 0 || day.getDay() === 6;
      return `<td class="${isWE ? 'weekend-col' : ''}" style="text-align:center;font-size:.68rem;color:${c ? 'var(--green)' : 'var(--border)'};font-weight:700">${c || ''}</td>`;
    }).join('');

    // ── Lock row (checkboxes per day) ──
    let lockCells = '<td class="role-name-cell sch-lock-label" title="Locking a day prevents accidental changes">🔒 LOCK</td>';
    lockCells += days.map(day => {
      const dk = _localDk(day);
      const isWE = day.getDay() === 0 || day.getDay() === 6;
      const isLocked = !!state.lockedDays[dk];
      return `<td class="sch-lock-cell ${isWE ? 'weekend-col' : ''}">
        <input type="checkbox" class="day-lock-cb" ${isLocked ? 'checked' : ''}
          onchange="App.toggleDayLock('${dk}',this.checked)"
          title="${isLocked ? 'Unlock' : 'Lock this day'}">
      </td>`;
    }).join('');

    const schedHTML = `
      <div class="schedule-wrap"><table class="schedule-table">
        <thead>
          <tr>${monthRow}</tr>
          <tr>${dayRow}</tr>
        </thead>
        <tbody>
          ${rowsHTML}
          <tr class="schedule-count-row">${countCells}</tr>
        </tbody>
      </table></div>
      <div class="schedule-lock-outer"><table class="schedule-table">
        <tbody><tr class="schedule-lock-row">${lockCells}</tr></tbody>
      </table></div>`;
    _morphHTML(container, schedHTML);
    // Sync lock footer scroll + re-render on scroll for column windowing
    const _sw = container.querySelector('.schedule-wrap');
    const _sl = container.querySelector('.schedule-lock-outer');
    if (_sw && _sl) {
      _sw.addEventListener('scroll', () => {
        _sl.scrollLeft = _sw.scrollLeft;
        _debouncedRender('schedule-vscroll', renderSchedule, 100);
      });
    }
  }

  // ── Multi-select state for schedules ─────────────────────────
  let _multiSel = {
    active: false,       // is drag-selecting
    cells: [],           // [{funcId, assignmentId, date, el}]
    lastCell: null,      // {funcId, date} for shift+click anchor
    ctx: 'boats',        // which schedule context
  };

  function _clearMultiSelect() {
    _multiSel.cells.forEach(c => { if (c.el) c.el.classList.remove('sch-multi-selected'); });
    _multiSel.cells = [];
    _multiSel.active = false;
    const bar = $('multi-select-bar');
    if (bar) bar.classList.add('hidden');
  }

  function _addToMultiSelect(funcId, assignmentId, date, el) {
    if (_multiSel.cells.some(c => c.funcId === funcId && c.date === date)) return;
    _multiSel.cells.push({ funcId, assignmentId, date, el });
    if (el) el.classList.add('sch-multi-selected');
    _showMultiSelectBar();
  }

  function _showMultiSelectBar() {
    let bar = $('multi-select-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'multi-select-bar';
      bar.className = 'multi-select-bar hidden';
      bar.innerHTML = `
        <span id="msb-count" style="font-size:.75rem;color:var(--text-1);font-weight:600"></span>
        <button class="btn btn-sm btn-primary" onclick="App.multiSelectFill()">Fill selected</button>
        <select id="msb-status" class="form-control" style="width:auto;display:inline-block;font-size:.7rem;padding:.15rem .3rem;height:auto">
          <option value="">Set status...</option>
          <option value="confirmed">Confirmed</option>
          <option value="tentative">Tentative</option>
          <option value="empty">Empty</option>
        </select>
        <button class="btn btn-sm btn-secondary" onclick="App.multiSelectSetStatus()">Apply Status</button>
        <input id="msb-value" type="text" class="form-control" style="width:60px;display:inline-block;font-size:.7rem;padding:.15rem .3rem;height:auto" placeholder="Value">
        <button class="btn btn-sm btn-secondary" onclick="App.multiSelectSetValue()">Apply Value</button>
        <button class="btn btn-sm btn-secondary" onclick="App.multiSelectClear()">Clear selected</button>
        <button class="btn btn-sm btn-danger" onclick="App.multiSelectCancel()">Cancel</button>
      `;
      document.body.appendChild(bar);
    }
    $('msb-count').textContent = `${_multiSel.cells.length} cell(s) selected`;
    bar.classList.remove('hidden');
  }

  function multiSelectFill() {
    const cells = [..._multiSel.cells];
    _clearMultiSelect();
    cells.forEach(c => {
      if (!c.assignmentId) _fillDay(c.funcId, c.date);
      else _doCellCycle(c.funcId, c.assignmentId, c.date);
    });
  }

  function multiSelectClear() {
    const cells = [..._multiSel.cells];
    _clearMultiSelect();
    cells.forEach(c => {
      if (c.assignmentId) _clearDayOverride(c.assignmentId, c.date);
    });
  }

  function multiSelectSetStatus() {
    const status = $('msb-status')?.value;
    if (!status) { toast('Select a status first', 'error'); return; }
    const cells = [..._multiSel.cells];
    _clearMultiSelect();
    cells.forEach(c => {
      if (c.assignmentId) {
        // Set specific status via day override
        _setDayOverrideStatus(c.assignmentId, c.date, status);
      }
    });
  }

  function multiSelectSetValue() {
    const val = $('msb-value')?.value;
    if (val === '' || val === undefined) { toast('Enter a value', 'error'); return; }
    const cells = [..._multiSel.cells];
    _clearMultiSelect();
    cells.forEach(c => {
      if (c.assignmentId) {
        _setDayOverrideValue(c.assignmentId, c.date, val);
      }
    });
  }

  function _setDayOverrideStatus(assignmentId, date, status) {
    // Find assignment and update its day_overrides
    const asgn = _findAssignment(assignmentId);
    if (!asgn) return;
    const overrides = JSON.parse(asgn.day_overrides || '{}');
    if (status === 'empty') {
      overrides[date] = 'empty';
    } else {
      overrides[date] = status;
    }
    asgn.day_overrides = JSON.stringify(overrides);
    _saveOverrides(assignmentId, overrides);
  }

  function _setDayOverrideValue(assignmentId, date, val) {
    const asgn = _findAssignment(assignmentId);
    if (!asgn) return;
    const overrides = JSON.parse(asgn.day_overrides || '{}');
    overrides[date] = val;
    asgn.day_overrides = JSON.stringify(overrides);
    _saveOverrides(assignmentId, overrides);
  }

  function _findAssignment(assignmentId) {
    // Search all state assignment arrays
    for (const arr of [state.assignments, state.pbAssignments, state.sbAssignments,
                        state.transportAssignments, state.helperAssignments, state.gcAssignments]) {
      if (!arr) continue;
      const found = arr.find(a => a.id === assignmentId);
      if (found) return found;
    }
    return null;
  }

  function multiSelectCancel() {
    _clearMultiSelect();
  }

  function _onScheduleMouseDown(event, funcId, assignmentId, date) {
    if (event.shiftKey && _multiSel.lastCell) {
      // Shift+click: select range from last to current
      event.preventDefault();
      _selectRange(_multiSel.lastCell.funcId, _multiSel.lastCell.date, funcId, date);
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      // Ctrl+click: toggle single cell in selection
      event.preventDefault();
      const el = event.target.closest('td');
      _addToMultiSelect(funcId, assignmentId, date, el);
      _multiSel.lastCell = { funcId, date };
      return;
    }
    // Normal click: start drag-select
    _clearMultiSelect();
    _multiSel.active = true;
    _multiSel.lastCell = { funcId, date };
    const el = event.target.closest('td');
    _addToMultiSelect(funcId, assignmentId, date, el);
  }

  function _onScheduleMouseOver(event, funcId, assignmentId, date) {
    if (!_multiSel.active) return;
    const el = event.target.closest('td');
    _addToMultiSelect(funcId, assignmentId, date, el);
  }

  // Global mouseup to end drag-select
  document.addEventListener('mouseup', () => {
    if (_multiSel.active) {
      _multiSel.active = false;
      if (_multiSel.cells.length <= 1) {
        // Single cell click — do normal action
        const c = _multiSel.cells[0];
        _clearMultiSelect();
        if (c) {
          _multiSel.lastCell = { funcId: c.funcId, date: c.date };
          if (!c.assignmentId) _fillDay(c.funcId, c.date);
          else _doCellCycle(c.funcId, c.assignmentId, c.date);
        }
      }
    }
  });

  function _selectRange(funcId1, date1, funcId2, date2) {
    // For range selection, select all cells in the rectangle
    const schedWrap = document.querySelector('.schedule-wrap');
    if (!schedWrap) return;
    const allCells = schedWrap.querySelectorAll('td.schedule-cell[data-func][data-date]');
    const dates = [date1, date2].sort();
    const funcIds = [funcId1, funcId2];
    // Find row indices
    const rows = schedWrap.querySelectorAll('tbody tr');
    let rowMap = {};
    rows.forEach((row, i) => {
      const fc = row.querySelector('.sch-func-cell');
      if (fc && fc.dataset.funcId) rowMap[fc.dataset.funcId] = i;
    });
    allCells.forEach(cell => {
      const cf = parseInt(cell.dataset.func);
      const cd = cell.dataset.date;
      if (cd >= dates[0] && cd <= dates[1]) {
        const ri1 = rowMap[funcId1] ?? 0, ri2 = rowMap[funcId2] ?? 0;
        const ri = rowMap[cf];
        const minR = Math.min(ri1, ri2), maxR = Math.max(ri1, ri2);
        if (ri !== undefined && ri >= minR && ri <= maxR) {
          _addToMultiSelect(cf, parseInt(cell.dataset.asgn) || null, cd, cell);
        }
      }
    });
  }

  async function _clearDayOverride(assignmentId, date) {
    // Find context and clear the override
    const asgn = state.assignments.find(a => a.id === assignmentId)
      || state.pictureAssignments?.find(a => a.id === assignmentId)
      || state.transportAssignments?.find(a => a.id === assignmentId)
      || state.labourAssignments?.find(a => a.id === assignmentId)
      || state.securityAssignments?.find(a => a.id === assignmentId)
      || state.gcAssignments?.find(a => a.id === assignmentId);
    if (!asgn) return;
    const overrides = JSON.parse(asgn.day_overrides || '{}');
    overrides[date] = 'empty';
    try {
      const endpoint = _getAssignmentEndpoint(asgn);
      if (endpoint) {
        await api('PUT', endpoint, { day_overrides: JSON.stringify(overrides) });
        asgn.day_overrides = JSON.stringify(overrides);
      }
    } catch (e) { /* silent */ }
  }

  function _getAssignmentEndpoint(asgn) {
    if (asgn.boat_id !== undefined && asgn.boat_function_id) return `/api/assignments/${asgn.id}`;
    if (asgn.picture_boat_id !== undefined) return `/api/picture-boat-assignments/${asgn.id}`;
    if (asgn.vehicle_id !== undefined) return `/api/transport-assignments/${asgn.id}`;
    if (asgn.helper_id !== undefined) return `/api/helper-assignments/${asgn.id}`;
    if (asgn.security_boat_id !== undefined) return `/api/security-boat-assignments/${asgn.id}`;
    return null;
  }

  // ── Schedule cell interactions ─────────────────────────────

  // Click on a date cell → fill (if empty) or cycle status (if filled)
  async function onDateCellClick(event, funcId, assignmentId, date) {
    event.stopPropagation();
    closeSchedulePopover();
    const isLocked = !!state.lockedDays[date];
    if (isLocked) {
      toast(`Day ${fmtDateLong(date)} is locked — uncheck to modify`, 'info');
      return;
    }
    if (!assignmentId) await _fillDay(funcId, date);
    else await _doCellCycle(funcId, assignmentId, date);
  }

  // Click on left column (function cell) → show assignment management popover
  function onFuncCellClick(event, funcId) {
    event.stopPropagation();
    const el = $('schedule-popover');
    if (_schPop.funcId === funcId && !el.classList.contains('hidden')) {
      closeSchedulePopover(); return;
    }
    _schPop = { assignmentId: null, funcId, date: null, type: 'func' };
    const func = state.functions.find(f => f.id === funcId);
    const asgns = _assignmentsForFunc(funcId);

    const asgnRows = asgns.length
      ? asgns.map(a => {
          const boatName = a.boat_name_override || a.boat_name || '—';
          const hasOvr = Object.keys(JSON.parse(a.day_overrides || '{}')).length > 0;
          return `<div class="sch-pop-asgn-row">
            <span style="flex:1;font-size:.75rem;overflow:hidden;text-overflow:ellipsis;color:var(--text-0)">${esc(boatName)}</span>
            <button class="btn btn-sm btn-icon btn-secondary"
              onclick="App.editAssignmentById(${a.id});App.closeSchedulePopover()" title="Edit">✎</button>
            ${hasOvr ? `<button class="btn btn-sm btn-icon btn-secondary"
              onclick="App.resetDayOverrides(${a.id})" title="Reset day overrides">↺</button>` : ''}
            <button class="btn btn-sm btn-icon btn-danger"
              onclick="App.removeAssignmentById(${a.id})" title="Remove">✕</button>
          </div>`;
        }).join('')
      : `<div style="color:var(--text-4);font-size:.75rem;padding:.25rem 0">No boat assigned</div>`;

    $('sch-pop-content').innerHTML = `
      <div class="sch-pop-header">
        <strong>${esc(func?.name || '')}</strong>
        <span style="color:var(--text-4);font-size:.65rem;margin-left:.4rem">${esc(func?.function_group || '')}</span>
      </div>
      ${asgnRows}
      <div class="sch-pop-actions" style="margin-top:.4rem">
        <button onclick="App.assignFromDate(${funcId},null)">+ Assign a boat</button>
      </div>`;

    const rect = event.target.getBoundingClientRect();
    el.style.left = (rect.right + 4) + 'px';
    el.style.top  = rect.top + 'px';
    el.classList.remove('hidden');
  }

  // Fill a single day — extends date range if assignment exists, creates bare one if not
  async function _fillDay(funcId, date) {
    const funcAsgns = _assignmentsForFunc(funcId);
    try {
      if (funcAsgns.length > 0) {
        const asgn = funcAsgns[0];
        const overrides = JSON.parse(asgn.day_overrides || '{}');
        overrides[date] = 'on';
        const updates = { day_overrides: JSON.stringify(overrides) };
        const s = (asgn.start_date || '').slice(0, 10);
        const e = (asgn.end_date   || '').slice(0, 10);
        if (!s || date < s) {
          updates.start_date = date;
          // Protect locked days in the newly covered gap [date+1 .. s-1]
          if (s) {
            const cur = new Date(date + 'T00:00:00');
            cur.setDate(cur.getDate() + 1);
            const oldS = new Date(s + 'T00:00:00');
            while (cur < oldS) {
              const dk = _localDk(cur);
              if (state.lockedDays[dk] && !(dk in overrides)) overrides[dk] = 'empty';
              cur.setDate(cur.getDate() + 1);
            }
          }
        }
        if (!e || date > e) {
          updates.end_date = date;
          // Protect locked days in the newly covered gap [e+1 .. date-1]
          if (e) {
            const cur = new Date(e + 'T00:00:00');
            cur.setDate(cur.getDate() + 1);
            const newE = new Date(date + 'T00:00:00');
            while (cur < newE) {
              const dk = _localDk(cur);
              if (state.lockedDays[dk] && !(dk in overrides)) overrides[dk] = 'empty';
              cur.setDate(cur.getDate() + 1);
            }
          }
        }
        updates.day_overrides = JSON.stringify(overrides);
        await api('PUT', `/api/assignments/${asgn.id}`, updates);
      } else {
        await api('POST', `/api/productions/${state.prodId}/assignments`, {
          boat_function_id: funcId,
          start_date: date, end_date: date,
          day_overrides: JSON.stringify({ [date]: 'on' }),
        });
      }
      state.assignments = await api('GET', `/api/productions/${state.prodId}/assignments?context=boats`);
      renderBoats();
      _queueCellFlash(date, funcId);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  }

  // Toggle a filled cell to empty (colored → vide)
  async function _doCellCycle(funcId, assignmentId, date) {
    const asgn = state.assignments.find(a => a.id === assignmentId);
    if (!asgn) return;
    const overrides = JSON.parse(asgn.day_overrides || '{}');
    overrides[date] = 'empty';
    await _saveOverrides(assignmentId, overrides);
  }

  async function _saveOverrides(assignmentId, overrides) {
    try {
      await api('PUT', `/api/assignments/${assignmentId}`, { day_overrides: JSON.stringify(overrides) });
      const idx = state.assignments.findIndex(a => a.id === assignmentId);
      if (idx >= 0) state.assignments[idx].day_overrides = JSON.stringify(overrides);
      const funcId = idx >= 0 ? state.assignments[idx].boat_function_id : null;
      const lastDate = Object.keys(overrides).pop();
      renderBoats();
      // AXE 5.4: flash saved cell after render re-creates DOM
      if (lastDate && funcId) _queueCellFlash(lastDate, funcId);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  }

  // Lock/unlock a day column (stored in localStorage)
  function toggleDayLock(date, locked) {
    if (locked) state.lockedDays[date] = true;
    else delete state.lockedDays[date];
    try { localStorage.setItem('schedule_locked_days', JSON.stringify(state.lockedDays)); } catch(e) {}
    renderSchedule();
  }

  function pbToggleDayLock(date, locked) {
    if (locked) state.pbLockedDays[date] = true;
    else delete state.pbLockedDays[date];
    try { localStorage.setItem('pb_locked_days', JSON.stringify(state.pbLockedDays)); } catch(e) {}
    renderPbSchedule();
  }

  function closeSchedulePopover() {
    $('schedule-popover')?.classList.add('hidden');
    _schPop = { assignmentId: null, funcId: null, date: null, type: null };
  }

  async function resetDayOverrides(assignmentId) {
    try {
      await api('PUT', `/api/assignments/${assignmentId}`, { day_overrides: '{}' });
      state.assignments = await api('GET', `/api/productions/${state.prodId}/assignments?context=boats`);
      closeSchedulePopover();
      renderBoats();
      toast('Day overrides reset');
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  }

  function assignFromDate(funcId, date) {
    closeSchedulePopover();
    if (state.selectedBoat) {
      openAssignModal(funcId, state.selectedBoat, null, date);
      state.selectedBoat = null;
    } else {
      state.pendingFuncId = funcId;
      state.pendingDate   = date;
      toast('Click a boat in the sidebar to assign it', 'info');
    }
  }

  // ── PDT Tooltip ────────────────────────────────────────────
  function showPDTTooltip(event, date) {
    const day = state.shootingDays.find(d => d.date === date);
    if (!day) return;
    const events = day.events?.length ? day.events : (day.game_name ? [{ event_type: 'game', name: day.game_name, location: day.location }] : []);

    // Only show tooltip if there are notes
    const noteLines = [];
    if (day.notes) noteLines.push(`📝 ${esc(day.notes)}`);
    events.forEach(ev => { if (ev.notes) noteLines.push(`${(ev.event_type||'game').toUpperCase()}: ${esc(ev.notes)}`); });
    if (!noteLines.length) return;

    const tip = $('pdt-tooltip');
    tip.innerHTML = `<div class="pdt-tip-note" style="border:none;padding:0;margin:0">${noteLines.join('<br>')}</div>`;

    const rect = event.target.getBoundingClientRect();
    tip.style.left = rect.left + 'px';
    tip.style.top  = (rect.bottom + 4) + 'px';
    tip.classList.remove('hidden');
  }

  function hidePDTTooltip() {
    $('pdt-tooltip')?.classList.add('hidden');
  }

  function showDateTooltip(event, date) {
    const day = state.shootingDays.find(d => d.date === date);
    if (!day) return;
    const events = day.events?.length ? day.events : (day.game_name ? [{ event_type: 'game', name: day.game_name, location: day.location }] : []);
    if (!events.length && !day.location) return;

    const tip = $('pdt-tooltip');
    let html = `<div style="font-weight:700;margin-bottom:.25rem;color:var(--text-0)">J${day.day_number || '?'} — ${date}</div>` +
      events.map(ev => `<div class="pdt-tip-event">
        <span class="event-badge ev-${ev.event_type || 'game'}" style="font-size:.58rem">${(ev.event_type||'game').toUpperCase()}</span>
        <span style="color:var(--text-1)">${esc(ev.name || day.game_name || '—')}</span>
        ${ev.location ? `<span style="color:var(--text-4)">@ ${esc(ev.location)}</span>` : ''}
      </div>`).join('');
    const noteLines = [];
    if (day.notes) noteLines.push(`📝 ${esc(day.notes)}`);
    events.forEach(ev => { if (ev.notes) noteLines.push(`${(ev.event_type||'game').toUpperCase()}: ${esc(ev.notes)}`); });
    if (noteLines.length) html += `<div class="pdt-tip-note">${noteLines.join('<br>')}</div>`;
    tip.innerHTML = html;

    const rect = event.target.getBoundingClientRect();
    tip.style.left = rect.left + 'px';
    tip.style.top  = (rect.bottom + 4) + 'px';
    tip.classList.remove('hidden');
  }

  // ── Boat detail modal ──────────────────────────────────────
  let _detailBoatId = null;

  function openBoatDetail(boatId) {
    const boat = state.boats.find(b => b.id === boatId);
    if (!boat) return;
    _detailBoatId = boatId;

    // Photo
    const photo = $('bd-photo');
    const placeholder = $('bd-photo-placeholder');
    if (boat.image_path) {
      photo.src = '/' + boat.image_path + '?t=' + Date.now();
      photo.style.display = 'block';
      placeholder.style.display = 'none';
    } else {
      photo.style.display = 'none';
      placeholder.style.display = 'flex';
      placeholder.textContent = '#' + (boat.boat_nr || '?');
    }

    // Populate editable fields
    $('bd-name').value    = boat.name || '';
    $('bd-nr').value      = boat.boat_nr || '';
    $('bd-group').value   = boat.group_name || 'Shared';
    $('bd-category').value = boat.category || 'picture';
    $('bd-capacity').value = boat.capacity || '';
    $('bd-captain').value  = boat.captain  || '';
    $('bd-vendor').value   = boat.vendor   || '';
    $('bd-waves').value    = boat.wave_rating || 'Waves';
    $('bd-night').checked  = !!boat.night_ok;
    $('bd-rate-est').value = boat.daily_rate_estimate || '';
    $('bd-rate-act').value = boat.daily_rate_actual   || '';
    $('bd-notes').value    = boat.notes || '';

    // Assignments list (read-only)
    const asgns = state.assignments.filter(a => a.boat_id === boatId);
    $('bd-assignments-list').innerHTML = asgns.length
      ? asgns.map(a => `<div class="bd-asgn-row">
          <span style="font-weight:600;color:var(--text-0)">${esc(a.function_name || '?')}</span>
          <span style="color:var(--text-3);font-size:.72rem">${fmtDate(a.start_date)} → ${fmtDate(a.end_date)}</span>
        </div>`).join('')
      : '<div style="color:var(--text-4);font-size:.78rem">No assignments yet</div>';

    $('boat-detail-overlay').classList.remove('hidden');
  }

  async function saveBoatEdit() {
    if (!_detailBoatId) return;
    const data = {
      name:                $('bd-name').value.trim(),
      boat_nr:             parseInt($('bd-nr').value) || null,
      group_name:          $('bd-group').value,
      capacity:            $('bd-capacity').value.trim() || null,
      captain:             $('bd-captain').value.trim()  || null,
      vendor:              $('bd-vendor').value.trim()   || null,
      wave_rating:         $('bd-waves').value,
      night_ok:            $('bd-night').checked ? 1 : 0,
      daily_rate_estimate: parseFloat($('bd-rate-est').value) || 0,
      daily_rate_actual:   parseFloat($('bd-rate-act').value) || null,
      notes:               $('bd-notes').value.trim() || null,
    };
    if (!data.name) { toast('Name is required', 'error'); return; }
    try {
      // AXE 5.4: flash detail panel on successful save
      const _flashDetail = () => _flashSavedCard($('boat-detail-overlay')?.querySelector('.bd-inner'));
      if (_detailIsSecurityBoat) {
        const updated = await api('PUT', `/api/security-boats/${_detailBoatId}`, data);
        const idx = state.securityBoats.findIndex(b => b.id === _detailBoatId);
        if (idx >= 0) state.securityBoats[idx] = { ...state.securityBoats[idx], ...updated };
        _flashDetail();
        closeBoatDetail();
        renderSbBoatList();
        toast('Security boat updated');
      } else if (_detailIsLabour) {
        const wdata = {
          name:                $('bd-name').value.trim(),
          role:                $('bd-captain').value.trim() || null,
          contact:             $('bd-vendor').value.trim()  || null,
          daily_rate_estimate: parseFloat($('bd-rate-est').value) || 0,
          daily_rate_actual:   parseFloat($('bd-rate-act').value) || null,
          notes:               $('bd-notes').value.trim() || null,
        };
        const updated = await api('PUT', `/api/helpers/${_detailBoatId}`, wdata);
        const idx = state.labourWorkers.findIndex(w => w.id === _detailBoatId);
        if (idx >= 0) state.labourWorkers[idx] = { ...state.labourWorkers[idx], ...updated };
        _flashDetail();
        closeBoatDetail();
        renderLabour();
        toast('Worker updated');
      } else if (_detailIsGuardCamp) {
        const gcdata = {
          name:                $('bd-name').value.trim(),
          role:                $('bd-captain').value.trim() || null,
          contact:             $('bd-vendor').value.trim()  || null,
          daily_rate_estimate: parseFloat($('bd-rate-est').value) || 0,
          daily_rate_actual:   parseFloat($('bd-rate-act').value) || null,
          notes:               $('bd-notes').value.trim() || null,
        };
        const updated = await api('PUT', `/api/guard-camp-workers/${_detailBoatId}`, gcdata);
        const idx = state.gcWorkers.findIndex(w => w.id === _detailBoatId);
        if (idx >= 0) state.gcWorkers[idx] = { ...state.gcWorkers[idx], ...updated };
        _flashDetail();
        closeBoatDetail();
        renderGuardCamp();
        toast('Guard updated');
      } else if (_detailIsTransport) {
        const tdata = {
          name:                $('bd-name').value.trim(),
          vehicle_nr:          parseInt($('bd-nr').value) || null,
          driver:              $('bd-captain').value.trim() || null,
          vendor:              $('bd-vendor').value.trim()  || null,
          daily_rate_estimate: parseFloat($('bd-rate-est').value) || 0,
          daily_rate_actual:   parseFloat($('bd-rate-act').value) || null,
          notes:               $('bd-notes').value.trim() || null,
        };
        const updated = await api('PUT', `/api/transport-vehicles/${_detailBoatId}`, tdata);
        const idx = state.transportVehicles.findIndex(v => v.id === _detailBoatId);
        if (idx >= 0) state.transportVehicles[idx] = { ...state.transportVehicles[idx], ...updated };
        _flashDetail();
        closeBoatDetail();
        renderTbVehicleList();
        toast('Vehicle updated');
      } else if (_detailIsPicture) {
        const updated = await api('PUT', `/api/picture-boats/${_detailBoatId}`, data);
        const idx = state.pictureBoats.findIndex(b => b.id === _detailBoatId);
        if (idx >= 0) state.pictureBoats[idx] = { ...state.pictureBoats[idx], ...updated };
        _flashDetail();
        closeBoatDetail();
        renderPbBoatList();
        toast('Picture boat updated');
      } else {
        data.category = $('bd-category').value;
        const updated = await api('PUT', `/api/boats/${_detailBoatId}`, data);
        const idx = state.boats.findIndex(b => b.id === _detailBoatId);
        if (idx >= 0) state.boats[idx] = { ...state.boats[idx], ...updated };
        _flashDetail();
        closeBoatDetail();
        renderBoatList();
        toast('Boat updated');
      }
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  }

  // ── Context-sensitive labels for reused boat-detail modal ──────────────
  function _setDetailLabels(ctx) {
    const captainLabel = $('bd-captain-label');
    const captainInput = $('bd-captain');
    const nameInput    = $('bd-name');
    const modalTitle   = document.querySelector('#boat-detail-overlay .modal-title');
    const capacityLabel = $('bd-capacity-label');
    if (ctx === 'transport') {
      if (modalTitle)    modalTitle.textContent = 'Edit vehicle';
      if (nameInput)     nameInput.placeholder  = 'Vehicle name';
      if (captainLabel)  captainLabel.textContent = 'Driver';
      if (captainInput)  captainInput.placeholder = 'Driver name';
      if (capacityLabel) capacityLabel.textContent = 'Capacity';
    } else if (ctx === 'labour') {
      if (modalTitle)    modalTitle.textContent = 'Edit worker';
      if (nameInput)     nameInput.placeholder  = 'Worker name';
      if (captainLabel)  captainLabel.textContent = 'Role';
      if (captainInput)  captainInput.placeholder = 'Role / position';
      if (capacityLabel) capacityLabel.textContent = 'Team size';
    } else if (ctx === 'guard_camp') {
      if (modalTitle)    modalTitle.textContent = 'Edit guard';
      if (nameInput)     nameInput.placeholder  = 'Guard name';
      if (captainLabel)  captainLabel.textContent = 'Role';
      if (captainInput)  captainInput.placeholder = 'Guard role / shift';
      if (capacityLabel) capacityLabel.textContent = 'Shift size';
    } else {
      if (modalTitle)    modalTitle.textContent = 'Edit boat';
      if (nameInput)     nameInput.placeholder  = 'Boat name';
      if (captainLabel)  captainLabel.textContent = 'Captain';
      if (captainInput)  captainInput.placeholder = 'Captain name';
      if (capacityLabel) capacityLabel.textContent = 'Capacity';
    }
  }

  function closeBoatDetail() {
    $('boat-detail-overlay').classList.add('hidden');
    // Restore all potentially hidden rows
    ['bd-group', 'bd-category', 'bd-waves', 'bd-night', 'bd-capacity'].forEach(id => {
      const el = $(id); if (el) { const row = el.closest('tr'); if (row) row.style.display = ''; }
    });
    _setDetailLabels('boat');
    $('bd-delete-btn').classList.add('hidden');
    _detailBoatId          = null;
    _detailIsPicture       = false;
    _detailIsTransport     = false;
    _detailIsSecurityBoat  = false;
    _detailIsLabour        = false;
    _detailIsGuardCamp     = false;
    $('bd-photo-input').value = '';
  }

  // ── Boat view popup (large) ────────────────────────────────────────────────
  let _viewBoatId = null;

  function openBoatView(boatId) {
    const boat = state.boats.find(b => b.id === boatId);
    if (!boat) return;

    // In pending-assignment mode → assign instead of viewing
    if (state.pendingFuncId) {
      openAssignModal(state.pendingFuncId, boat, null, state.pendingDate);
      state.pendingFuncId = null;
      state.pendingDate   = null;
      state.selectedBoat  = null;
      renderBoatList();
      return;
    }

    _viewBoatId = boatId;

    // Photo
    const photo = $('bv-photo');
    const phPh  = $('bv-photo-placeholder');
    if (boat.image_path) {
      photo.src           = '/' + boat.image_path + '?t=' + Date.now();
      photo.style.display = 'block';
      phPh.style.display  = 'none';
    } else {
      photo.style.display = 'none';
      phPh.style.display  = 'flex';
      phPh.textContent    = '#' + (boat.boat_nr || '?');
    }

    // Title + subtitle
    $('bv-name').textContent     = boat.name || '?';
    $('bv-nr-group').textContent = [
      boat.boat_nr  ? `#${boat.boat_nr}` : null,
      boat.group_name,
      boat.category,
    ].filter(Boolean).join(' · ');

    // Badges
    const wClass = waveClass(boat.wave_rating);
    $('bv-badges').innerHTML = `
      <span class="wave-badge ${wClass}">${waveLabel(boat.wave_rating)}</span>
      ${boat.capacity ? `<span class="bv-badge-chip">${esc(boat.capacity)} pax</span>` : ''}
      ${boat.night_ok ? '<span class="night-badge">NIGHT</span>' : ''}`;

    // Detail fields
    const fields = [
      boat.captain              ? ['Captain',   boat.captain]  : null,
      boat.vendor               ? ['Vendor',    boat.vendor]   : null,
      boat.daily_rate_estimate > 0 ? ['Rate est.', `$${Math.round(boat.daily_rate_estimate).toLocaleString('en-US')}/day`] : null,
      boat.daily_rate_actual > 0   ? ['Rate act.', `$${Math.round(boat.daily_rate_actual).toLocaleString('en-US')}/day`]   : null,
      boat.notes                ? ['Notes',     boat.notes]    : null,
    ].filter(Boolean);
    $('bv-fields').innerHTML = fields.map(([label, value]) =>
      `<span class="bv-field-label">${esc(label)}</span><span class="bv-field-value">${esc(value)}</span>`
    ).join('');

    // Assignments
    const asgns = state.assignments.filter(a => a.boat_id === boatId);
    $('bv-assignments').innerHTML = asgns.length
      ? asgns.map(a => `<div class="bd-asgn-row">
          <span style="font-weight:600;color:var(--text-0)">${esc(a.function_name || '?')}</span>
          <span style="color:var(--text-3);font-size:.72rem">${fmtDate(a.start_date)} → ${fmtDate(a.end_date)}</span>
        </div>`).join('')
      : '<div style="color:var(--text-4);font-size:.78rem">No assignments yet</div>';

    // Wire up ✎ button with real boatId
    $('bv-edit-btn').onclick = () => { closeBoatView(); openBoatDetail(boatId); };

    $('boat-view-overlay').classList.remove('hidden');
  }

  function closeBoatView() {
    $('boat-view-overlay').classList.add('hidden');
    _viewBoatId = null;
  }

  function triggerPhotoUpload() {
    $('bd-photo-input').click();
  }

  async function uploadBoatPhoto(event) {
    const file = event.target.files[0];
    if (!file || !_detailBoatId) return;
    const formData = new FormData();
    formData.append('image', file);
    const endpoint = _detailIsSecurityBoat
      ? `/api/security-boats/${_detailBoatId}/upload-image`
      : _detailIsLabour
        ? `/api/helpers/${_detailBoatId}/upload-image`
        : _detailIsGuardCamp
          ? `/api/guard-camp-workers/${_detailBoatId}/upload-image`
          : _detailIsTransport
            ? `/api/transport-vehicles/${_detailBoatId}/upload-image`
            : _detailIsPicture
            ? `/api/picture-boats/${_detailBoatId}/upload-image`
            : `/api/boats/${_detailBoatId}/upload-image`;
    try {
      const res = await authFetch(endpoint, {
        method: 'POST', body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
      const boat = await res.json();
      if (_detailIsSecurityBoat) {
        const idx = state.securityBoats.findIndex(b => b.id === _detailBoatId);
        if (idx >= 0) state.securityBoats[idx] = { ...state.securityBoats[idx], ...boat };
        if (boat.image_path) {
          $('bd-photo').src = '/' + boat.image_path + '?t=' + Date.now();
          $('bd-photo').style.display = 'block';
          $('bd-photo-placeholder').style.display = 'none';
        }
        toast('Photo uploaded');
        return;
      }
      if (_detailIsLabour) {
        const idx = state.labourWorkers.findIndex(w => w.id === _detailBoatId);
        if (idx >= 0) state.labourWorkers[idx] = { ...state.labourWorkers[idx], ...boat };
        if (boat.image_path) {
          $('bd-photo').src = '/' + boat.image_path + '?t=' + Date.now();
          $('bd-photo').style.display = 'block';
          $('bd-photo-placeholder').style.display = 'none';
        }
        toast('Photo uploaded');
        return;
      }
      if (_detailIsGuardCamp) {
        const idx = state.gcWorkers.findIndex(w => w.id === _detailBoatId);
        if (idx >= 0) state.gcWorkers[idx] = { ...state.gcWorkers[idx], ...boat };
        if (boat.image_path) {
          $('bd-photo').src = '/' + boat.image_path + '?t=' + Date.now();
          $('bd-photo').style.display = 'block';
          $('bd-photo-placeholder').style.display = 'none';
        }
        toast('Photo uploaded');
        return;
      }
      if (_detailIsTransport) {
        const idx = state.transportVehicles.findIndex(v => v.id === _detailBoatId);
        if (idx >= 0) state.transportVehicles[idx] = { ...state.transportVehicles[idx], ...boat };
        if (boat.image_path) {
          $('bd-photo').src = '/' + boat.image_path + '?t=' + Date.now();
          $('bd-photo').style.display = 'block';
          $('bd-photo-placeholder').style.display = 'none';
        }
        toast('Photo uploaded');
        return;
      }
      if (_detailIsPicture) {
        const idx = state.pictureBoats.findIndex(b => b.id === _detailBoatId);
        if (idx >= 0) state.pictureBoats[idx] = { ...state.pictureBoats[idx], ...boat };
        $('bd-photo').src = '/' + boat.image_path + '?t=' + Date.now();
        $('bd-photo').style.display = 'block';
        toast('Photo uploaded');
        return;
      }
      const idx = state.boats.findIndex(b => b.id === _detailBoatId);
      if (idx >= 0) state.boats[idx] = boat;
      if (boat.image_path) {
        $('bd-photo').src = '/' + boat.image_path + '?t=' + Date.now();
        $('bd-photo').style.display = 'block';
        $('bd-photo-placeholder').style.display = 'none';
      }
      renderBoatList();
      toast('Photo uploaded');
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    }
  }

  // ── Boat budget ────────────────────────────────────────────
  async function renderBoatBudget() {
    try {
      const budget   = await api('GET', `/api/productions/${state.prodId}/budget`);
      const boatRows = (budget.rows || []).filter(r => r.department === 'BOATS');

      function rowFigeAmount(row) {
        if (!row.start_date || !row.end_date || !row.amount_estimate) return 0;
        const cur = new Date(row.start_date + 'T00:00:00');
        const end = new Date(row.end_date   + 'T00:00:00');
        let total = 0, lockedCount = 0;
        while (cur <= end) {
          total++;
          if (state.lockedDays[_localDk(cur)]) lockedCount++;
          cur.setDate(cur.getDate() + 1);
        }
        return total === 0 ? 0 : Math.round(row.amount_estimate * lockedCount / total);
      }

      const totalGlobal   = boatRows.reduce((s, r) => s + (r.amount_estimate || 0), 0);
      const totalFige     = boatRows.reduce((s, r) => s + rowFigeAmount(r), 0);
      const totalEstimate = totalGlobal - totalFige;

      $('boats-budget-content').innerHTML = `
        <div class="stat-grid" style="margin-bottom:.75rem">
          <div class="stat-card" style="border:1px solid var(--border)">
            <div class="stat-val">${fmtMoney(totalGlobal)}</div>
            <div class="stat-lbl">TOTAL GLOBAL</div>
          </div>
          <div class="stat-card" style="border:1px solid var(--green);background:rgba(34,197,94,.07)">
            <div class="stat-val" style="color:var(--green)">${fmtMoney(totalFige)}</div>
            <div class="stat-lbl">UP TO DATE <span style="font-size:.6rem;opacity:.55">(frozen)</span></div>
          </div>
          <div class="stat-card" style="border:1px solid #F59E0B;background:rgba(245,158,11,.07)">
            <div class="stat-val" style="color:#F59E0B">${fmtMoney(totalEstimate)}</div>
            <div class="stat-lbl">ESTIMATE</div>
          </div>
        </div>
        <div class="budget-dept-card">
          <table class="budget-table">
            <thead>
              <tr>
                <th>Function</th>
                <th style="text-align:left">Boat</th>
                <th>Start</th>
                <th>End</th>
                <th>Days</th>
                <th>$/day</th>
                <th>Total $</th>
              </tr>
            </thead>
            <tbody>
              ${boatRows.map((r, i) => `<tr style="${i%2 ? 'background:var(--bg-surface)' : ''}">
                <td style="color:var(--text-1)">${esc(r.name)}</td>
                <td style="color:var(--cyan)">${esc(r.boat || '—')}</td>
                <td style="font-size:.72rem;color:var(--text-3)">${fmtDate(r.start_date)}</td>
                <td style="font-size:.72rem;color:var(--text-3)">${fmtDate(r.end_date)}</td>
                <td style="text-align:right;color:var(--text-2)">${r.working_days ?? '—'}</td>
                <td style="text-align:right;color:var(--text-3)">${fmtMoney(r.unit_price_estimate)}</td>
                <td style="text-align:right;font-weight:700;color:var(--green)">${fmtMoney(r.amount_estimate)}</td>
              </tr>`).join('')}
              <tr class="budget-total-row">
                <td colspan="6" style="text-align:right;color:var(--text-1)">TOTAL BOATS</td>
                <td style="text-align:right;color:var(--green);font-size:1.05rem">${fmtMoney(totalGlobal)}</td>
              </tr>
            </tbody>
          </table>
        </div>`;
    } catch (e) {
      $('boats-budget-content').innerHTML = `<div style="color:var(--red);padding:2rem">${esc(e.message)}</div>`;
    }
  }

  // ── Undo / Export ──────────────────────────────────────────
  async function undoBoat() {
    try {
      const res = await api('POST', `/api/productions/${state.prodId}/undo`);
      toast(res.message || 'Undo done');
      state.assignments = await api('GET', `/api/productions/${state.prodId}/assignments?context=boats`);
      renderBoats();
    } catch (e) {
      toast('Nothing to undo', 'info');
    }
  }

  function toggleExport() { $('export-menu').classList.toggle('hidden'); }
  function exportCSV()  { authDownload(`/api/productions/${state.prodId}/export/csv`);  $('export-menu').classList.add('hidden'); }
  function exportJSON() { authDownload(`/api/productions/${state.prodId}/export/json`); $('export-menu').classList.add('hidden'); }

  // ═══════════════════════════════════════════════════════════
  //  PICTURE BOATS TAB
  // ═══════════════════════════════════════════════════════════

  function _pbAssignmentsForFunc(funcId) {
    return state.pictureAssignments.filter(a => a.boat_function_id === funcId);
  }

  function renderPictureBoats() {
    renderPbBoatList();
    if (state.pbBoatView === 'cards')    renderPbRoleCards();
    else if (state.pbBoatView === 'schedule') renderPbSchedule();
    else if (state.pbBoatView === 'budget')   renderPbBoatBudget();
  }

  function pbSetBoatView(view) {
    state.pbBoatView = view;
    ['cards','schedule','budget'].forEach(v => {
      $(`pb-boats-view-${v}`).classList.toggle('hidden', v !== view);
      $(`pb-btab-${v}`).classList.toggle('active', v === view);
    });
    renderPictureBoats();
    _updateBreadcrumb(view.charAt(0).toUpperCase() + view.slice(1));
  }

  function pbFilterBoats(f) {
    state.pbBoatFilter = f;
    ['all','available','assigned','external'].forEach(id => {
      $(`pb-boat-filter-${id}`).classList.toggle('active', id === f);
    });
    renderPbBoatList();
  }

  function _pbFilteredBoats() {
    const assignedIds = new Set(state.pictureAssignments.filter(a => a.picture_boat_id).map(a => a.picture_boat_id));
    let boats = [...state.pictureBoats];
    if      (state.pbBoatFilter === 'available') boats = boats.filter(b => !assignedIds.has(b.id) && b.group_name !== 'External');
    else if (state.pbBoatFilter === 'assigned')  boats = boats.filter(b => assignedIds.has(b.id));
    else if (state.pbBoatFilter === 'external')  boats = boats.filter(b => b.group_name === 'External');
    else boats = boats.filter(b => b.group_name !== 'External');
    boats.sort((a, b) => (a.boat_nr || 999) - (b.boat_nr || 999));
    return boats;
  }

  function renderPbBoatList() {
    const boats = _pbFilteredBoats();
    const assignedIds = new Set(state.pictureAssignments.filter(a => a.picture_boat_id).map(a => a.picture_boat_id));
    const container = $('pb-boat-list');
    if (!boats.length) {
      container.innerHTML = '<div style="color:var(--text-4);font-size:.8rem;text-align:center;padding:1rem">No picture boats</div>';
      return;
    }
    container.innerHTML = boats.map(b => {
      const isAssigned = assignedIds.has(b.id);
      const boatAsgns  = state.pictureAssignments.filter(a => a.picture_boat_id === b.id);
      const wClass = waveClass(b.wave_rating);
      const thumb = b.image_path
        ? `<img class="boat-thumb" src="/${b.image_path}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
           <div class="boat-thumb-placeholder" style="display:none">#${esc(b.boat_nr || '?')}</div>`
        : `<div class="boat-thumb-placeholder">#${esc(b.boat_nr || '?')}</div>`;
      const nr   = b.boat_nr ? `<span style="font-size:.6rem;color:var(--text-4);font-family:monospace">#${esc(b.boat_nr)}</span> ` : '';
      const pbRateVal = b.daily_rate_estimate || 0;
      const rate = `<div style="font-size:.65rem;color:${pbRateVal > 0 ? 'var(--green)' : 'var(--text-4)'};margin-top:.1rem;cursor:pointer;display:inline-flex;align-items:center;gap:.2rem"
        onclick="event.stopPropagation();App.openPictureBoatDetail(${b.id})"
        title="Click to edit rate">${pbRateVal > 0 ? '$' + Math.round(pbRateVal).toLocaleString('en-US') + '/d' : '+ set rate'}<span style="font-size:.55rem;opacity:.5">&#x270E;</span></div>`;
      return `<div class="boat-card ${isAssigned ? 'assigned' : ''}"
        id="pb-boat-card-${b.id}"
        draggable="true"
        ondragstart="App.pbOnBoatDragStart(event,${b.id})"
        ondragend="App.pbOnBoatDragEnd()"
        onclick="App.pbOpenBoatView(${b.id})">
        <div class="boat-thumb-wrap">${thumb}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:baseline;gap:.3rem;margin-bottom:.2rem;flex-wrap:wrap">
            ${nr}<span style="font-weight:700;font-size:.82rem;color:var(--text-0);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(b.name)}</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:.2rem;align-items:center;margin-bottom:.1rem">
            <span class="wave-badge ${wClass}">${waveLabel(b.wave_rating)}</span>
            ${b.capacity ? `<span style="font-size:.65rem;color:var(--text-3)">${esc(b.capacity)} pax</span>` : ''}
            ${b.night_ok ? '<span class="night-badge">NIGHT</span>' : ''}
          </div>
          ${b.captain ? `<div style="font-size:.65rem;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">⚓ ${esc(b.captain)}</div>` : ''}
          ${b.vendor  ? `<div style="font-size:.65rem;color:var(--orange);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">🏢 ${esc(b.vendor)}</div>` : ''}
          ${rate}
          ${isAssigned && boatAsgns.length ? `<div style="font-size:.6rem;color:var(--accent);margin-top:.1rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">→ ${boatAsgns.map(a => esc(a.function_name || '')).join(', ')}</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:.15rem;flex-shrink:0;align-self:flex-start">
          <button class="boat-edit-btn" title="Edit boat"
            onclick="event.stopPropagation();App.openPictureBoatDetail(${b.id})">&#x270E;</button>
          <button class="card-delete-btn" title="Delete picture boat"
            onclick="event.stopPropagation();App.confirmDeletePictureBoat(${b.id},'${esc(b.name).replace(/'/g,"\\'")}',${boatAsgns.length})">&#x1F5D1;</button>
        </div>
      </div>`;
    }).join('');
  }

  // ── Delete picture boat from card ──────────────────────────
  function confirmDeletePictureBoat(pbId, boatName, assignmentCount) {
    const impact = assignmentCount > 0 ? `\n${assignmentCount} assignment(s) will also be deleted.` : '';
    showConfirm(`Delete picture boat "${boatName}"?${impact}`, async () => {
      try {
        await api('DELETE', `/api/picture-boats/${pbId}`);
        state.pictureBoats = state.pictureBoats.filter(b => b.id !== pbId);
        state.pictureAssignments = state.pictureAssignments.filter(a => a.picture_boat_id !== pbId);
        closeBoatDetail();
        renderPictureBoats();
        toast('Picture boat deleted');
      } catch (e) { toast('Error: ' + e.message, 'error'); }
    });
  }

  function renderPbRoleCards() {
    const container = $('pb-role-groups');
    const grouped = {};
    _groupOrder('picture').forEach(g => { grouped[g] = []; });
    state.pictureFunctions.forEach(f => {
      const g = f.function_group || 'YELLOW';
      if (!grouped[g]) grouped[g] = [];
      grouped[g].push(f);
    });
    let html = '';
    _groupOrder('picture').forEach(group => {
      const funcs = grouped[group];
      if (!funcs.length) return;
      const color = _groupColor('picture', group);
      html += `
        <div class="role-group-header" style="background:${color}18;border-left:3px solid ${color}">
          <span style="color:${color}">●</span>
          <span style="color:${color}">${esc(group)}</span>
          <span style="color:var(--text-4);font-weight:400;font-size:.65rem;text-transform:none;letter-spacing:0">${funcs.length} function${funcs.length > 1 ? 's' : ''}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:.5rem;margin-bottom:.75rem">
          ${funcs.map(f => renderPbRoleCard(f, color)).join('')}
        </div>`;
    });
    container.innerHTML = html || '<div style="color:var(--text-4);text-align:center;padding:3rem">No functions. Click + Function to add one.</div>';
  }

  function renderPbRoleCard(func, color) {
    const asgns = _pbAssignmentsForFunc(func.id);
    const assignedBodies = asgns.map(asgn => {
      const boatName = asgn.boat_name_override || asgn.boat_name || '?';
      const wd   = computeWd(asgn);
      const rate = asgn.price_override || asgn.boat_daily_rate_estimate || 0;
      const total = Math.round(wd * rate);
      const wClass = waveClass(asgn.wave_rating || '');
      return `<div class="assigned-mini" style="margin-bottom:.35rem">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;margin-bottom:.2rem">
              ${asgn.wave_rating ? `<span class="wave-badge ${wClass}">${waveLabel(asgn.wave_rating)}</span>` : ''}
              <span style="font-weight:600;color:var(--text-0);font-size:.82rem">${esc(boatName)}</span>
              ${asgn.captain ? `<span style="color:var(--text-3);font-size:.7rem">· ${esc(asgn.captain)}</span>` : ''}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:.2rem">
            <button class="btn btn-sm btn-secondary btn-icon" onclick="App.pbEditAssignmentById(${asgn.id})" title="Edit">✎</button>
            <button class="btn btn-sm btn-danger btn-icon" onclick="App.pbRemoveAssignmentById(${asgn.id})" title="Remove">✕</button>
          </div>
        </div>
      </div>`;
    });
    const dropZone = `<div class="drop-zone" id="pb-drop-${func.id}"
      ondragover="App.pbOnDragOver(event,${func.id})"
      ondragleave="App.pbOnDragLeave(event,${func.id})"
      ondrop="App.pbOnDrop(event,${func.id})"
      onclick="App.pbOnDropZoneClick(${func.id})"
      style="${asgns.length ? 'margin-top:.3rem;padding:.35rem;font-size:.7rem' : ''}">
      ${state.pbSelectedBoat
        ? `<span style="color:var(--accent)">Click to assign <strong>${esc(state.pbSelectedBoat.name)}</strong></span>`
        : (asgns.length ? '<span>+ Add another assignment</span>' : '<span>Drop or click a boat to assign</span>')}
    </div>`;
    return `<div class="role-card" id="pb-role-card-${func.id}"
      style="border-top:3px solid ${color}"
      ondragover="App.pbOnDragOver(event,${func.id})"
      ondragleave="App.pbOnDragLeave(event,${func.id})"
      ondrop="App.pbOnDrop(event,${func.id})">
      <div class="role-card-header">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;color:var(--text-0);font-size:.85rem">${esc(func.name)}</div>
          ${func.specs ? `<div style="font-size:.7rem;color:var(--text-4);margin-top:.1rem">${esc(func.specs)}</div>` : ''}
        </div>
        <button onclick="App.pbConfirmDeleteFunc(${func.id})"
          style="color:var(--text-4);background:none;border:none;cursor:pointer;font-size:.9rem;padding:.2rem"
          title="Delete">✕</button>
      </div>
      <div class="role-card-body">${assignedBodies.join('') + dropZone}</div>
    </div>`;
  }

  function renderPbSchedule() {
    const container = $('pb-schedule-container');
    const days = [];
    const d = new Date(SCHEDULE_START);
    while (d <= SCHEDULE_END) { days.push(new Date(d)); d.setDate(d.getDate() + 1); }
    const wrapEl = container.querySelector('.schedule-wrap');
    const { start: vColStart, end: vColEnd } = _getVisibleColRange(wrapEl, days.length);
    const pdtByDate = {};
    state.shootingDays.forEach(day => { pdtByDate[day.date] = day; });
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthGroups = [];
    let prevM = -1, cnt = 0;
    days.forEach(day => {
      if (day.getMonth() !== prevM) {
        if (prevM >= 0) monthGroups.push({ m: prevM, cnt });
        prevM = day.getMonth(); cnt = 1;
      } else cnt++;
    });
    monthGroups.push({ m: prevM, cnt });
    let monthRow = '<th class="role-name-cell"></th>';
    monthRow += monthGroups.map(mg =>
      `<th colspan="${mg.cnt}" style="text-align:center;font-size:.65rem">${monthNames[mg.m]}</th>`
    ).join('');
    let dayRow = '<th class="role-name-cell"></th>';
    dayRow += days.map(day => {
      const dk = _localDk(day);
      const isWE = day.getDay() === 0 || day.getDay() === 6;
      const isLocked = !!state.pbLockedDays[dk];
      return `<th class="schedule-day-th ${isWE ? 'weekend-col' : ''} ${pdtByDate[dk] ? 'has-pdt' : ''} ${isLocked ? 'day-locked' : ''}"
        data-date="${dk}"
        onmouseenter="App.showDateTooltip(event,'${dk}')"
        onmouseleave="App.hidePDTTooltip()"
      >${day.getDate()}</th>`;
    }).join('');
    const dailyCnt = {};
    days.forEach(d => { dailyCnt[_localDk(d)] = 0; });
    const gOrder = _groupOrder('picture');
    const sortedFuncs = [...state.pictureFunctions].sort((a, b) => {
      const ga = gOrder.indexOf(a.function_group || 'Special');
      const gb = gOrder.indexOf(b.function_group || 'Special');
      return (ga === -1 ? 999 : ga) - (gb === -1 ? 999 : gb) || a.sort_order - b.sort_order;
    });
    const rowsHTML = sortedFuncs.map(func => {
      const funcAsgns = _pbAssignmentsForFunc(func.id);
      const color = _groupColor('picture', func.function_group);
      funcAsgns.forEach(asgn => {
        days.forEach(d => {
          const dk = _localDk(d);
          if (effectiveStatus(asgn, dk)) dailyCnt[dk] = (dailyCnt[dk] || 0) + 1;
        });
      });
      const boatAsgn = funcAsgns.find(a => a.picture_boat_id || a.boat_name_override || a.boat_name);
      const boatLabel = boatAsgn ? (boatAsgn.boat_name_override || boatAsgn.boat_name || null) : null;
      const multiSuffix = funcAsgns.length > 1 ? ` +${funcAsgns.length - 1}` : '';
      let cells = `<td class="role-name-cell sch-func-cell" style="border-top:2px solid ${color}"
        title="${esc(func.name)}" onclick="App.pbOnFuncCellClick(event,${func.id})">
        <div class="rn-group" style="color:${color}">${esc(func.function_group || 'YELLOW')}</div>
        <div class="${boatLabel ? 'rn-boat' : 'rn-empty'}">${esc(boatLabel ? boatLabel + multiSuffix : func.name)}</div>
      </td>`;
      days.forEach((day, colIdx) => {
        const dk = _localDk(day);
        const isWE = day.getDay() === 0 || day.getDay() === 6;
        const weClass = isWE ? 'weekend-col' : '';
        if (colIdx < vColStart || colIdx >= vColEnd) {
          cells += `<td class="schedule-cell ${weClass}"></td>`;
          return;
        }
        let filledAsgn = null, filledStatus = null;
        for (const asgn of funcAsgns) {
          const st = effectiveStatus(asgn, dk);
          if (st) { filledAsgn = asgn; filledStatus = st; break; }
        }
        if (!filledAsgn) {
          cells += `<td class="schedule-cell ${weClass}"
            onclick="App.pbOnDateCellClick(event,${func.id},null,'${dk}')"></td>`;
        } else {
          const bg = _scheduleCellBg(filledStatus, color, isWE);
          cells += `<td class="schedule-cell ${weClass}" style="background:${bg}"
            onclick="App.pbOnDateCellClick(event,${func.id},${filledAsgn.id},'${dk}')"></td>`;
        }
      });
      return `<tr>${cells}</tr>`;
    }).join('');
    let countCells = '<td class="role-name-cell" style="color:var(--text-3);font-size:.68rem">Active boats</td>';
    countCells += days.map(day => {
      const dk = _localDk(day);
      const c = dailyCnt[dk] || 0;
      const isWE = day.getDay() === 0 || day.getDay() === 6;
      return `<td class="${isWE ? 'weekend-col' : ''}" style="text-align:center;font-size:.68rem;color:${c ? 'var(--green)' : 'var(--border)'};font-weight:700">${c || ''}</td>`;
    }).join('');
    // ── Lock row (checkboxes per day) ──
    let lockCells = '<td class="role-name-cell sch-lock-label" title="Locking a day prevents accidental changes">🔒 LOCK</td>';
    lockCells += days.map(day => {
      const dk = _localDk(day);
      const isWE = day.getDay() === 0 || day.getDay() === 6;
      const isLocked = !!state.pbLockedDays[dk];
      return `<td class="sch-lock-cell ${isWE ? 'weekend-col' : ''}">
        <input type="checkbox" class="day-lock-cb" ${isLocked ? 'checked' : ''}
          onchange="App.pbToggleDayLock('${dk}',this.checked)"
          title="${isLocked ? 'Unlock' : 'Lock this day'}">
      </td>`;
    }).join('');
    const pbSchedHTML = `
      <div class="schedule-wrap"><table class="schedule-table">
        <thead><tr>${monthRow}</tr><tr>${dayRow}</tr></thead>
        <tbody>${rowsHTML}<tr class="schedule-count-row">${countCells}</tr></tbody>
      </table></div>
      <div class="schedule-lock-outer"><table class="schedule-table">
        <tbody><tr class="schedule-lock-row">${lockCells}</tr></tbody>
      </table></div>`;
    _morphHTML(container, pbSchedHTML);
    const _sw = container.querySelector('.schedule-wrap');
    const _sl = container.querySelector('.schedule-lock-outer');
    if (_sw && _sl) {
      _sw.addEventListener('scroll', () => {
        _sl.scrollLeft = _sw.scrollLeft;
        _debouncedRender('pb-schedule-vscroll', renderPbSchedule, 100);
      });
    }
  }

  async function pbOnDateCellClick(event, funcId, assignmentId, date) {
    event.stopPropagation();
    closeSchedulePopover();
    const isLocked = !!state.pbLockedDays[date];
    if (isLocked) {
      toast(`Day ${fmtDateLong(date)} is locked — uncheck to modify`, 'info');
      return;
    }
    if (!assignmentId) await _pbFillDay(funcId, date);
    else await _pbDoCellCycle(funcId, assignmentId, date);
  }

  async function _pbFillDay(funcId, date) {
    const funcAsgns = _pbAssignmentsForFunc(funcId);
    try {
      if (funcAsgns.length > 0) {
        const asgn = funcAsgns[0];
        const overrides = JSON.parse(asgn.day_overrides || '{}');
        overrides[date] = 'on';
        const updates = { day_overrides: JSON.stringify(overrides) };
        const s = (asgn.start_date || '').slice(0, 10);
        const e = (asgn.end_date   || '').slice(0, 10);
        if (!s || date < s) {
          updates.start_date = date;
          // Protect locked days in the newly covered gap [date+1 .. s-1]
          if (s) {
            const cur = new Date(date + 'T00:00:00');
            cur.setDate(cur.getDate() + 1);
            const oldS = new Date(s + 'T00:00:00');
            while (cur < oldS) {
              const dk = _localDk(cur);
              if (state.pbLockedDays[dk] && !(dk in overrides)) overrides[dk] = 'empty';
              cur.setDate(cur.getDate() + 1);
            }
          }
        }
        if (!e || date > e) {
          updates.end_date = date;
          // Protect locked days in the newly covered gap [e+1 .. date-1]
          if (e) {
            const cur = new Date(e + 'T00:00:00');
            cur.setDate(cur.getDate() + 1);
            const newE = new Date(date + 'T00:00:00');
            while (cur < newE) {
              const dk = _localDk(cur);
              if (state.pbLockedDays[dk] && !(dk in overrides)) overrides[dk] = 'empty';
              cur.setDate(cur.getDate() + 1);
            }
          }
        }
        updates.day_overrides = JSON.stringify(overrides);
        await api('PUT', `/api/picture-boat-assignments/${asgn.id}`, updates);
      } else {
        await api('POST', `/api/productions/${state.prodId}/picture-boat-assignments`, {
          boat_function_id: funcId,
          start_date: date, end_date: date,
          day_overrides: JSON.stringify({ [date]: 'on' }),
        });
      }
      state.pictureAssignments = await api('GET', `/api/productions/${state.prodId}/picture-boat-assignments`);
      renderPictureBoats();
      _queueCellFlash(date, funcId);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  }

  async function _pbDoCellCycle(funcId, assignmentId, date) {
    const asgn = state.pictureAssignments.find(a => a.id === assignmentId);
    if (!asgn) return;
    const overrides = JSON.parse(asgn.day_overrides || '{}');
    overrides[date] = 'empty';
    try {
      await api('PUT', `/api/picture-boat-assignments/${assignmentId}`, { day_overrides: JSON.stringify(overrides) });
      const idx = state.pictureAssignments.findIndex(a => a.id === assignmentId);
      if (idx >= 0) state.pictureAssignments[idx].day_overrides = JSON.stringify(overrides);
      renderPictureBoats();
      _queueCellFlash(date, funcId);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  }

  function pbOnFuncCellClick(event, funcId) {
    event.stopPropagation();
    const el = $('schedule-popover');
    if (_schPop.funcId === funcId && !el.classList.contains('hidden')) {
      closeSchedulePopover(); return;
    }
    _schPop = { assignmentId: null, funcId, date: null, type: 'pbfunc' };
    const func = state.pictureFunctions.find(f => f.id === funcId);
    const asgns = _pbAssignmentsForFunc(funcId);
    const asgnRows = asgns.length
      ? asgns.map(a => {
          const boatName = a.boat_name_override || a.boat_name || '—';
          return `<div class="sch-pop-asgn-row">
            <span style="flex:1;font-size:.75rem;overflow:hidden;text-overflow:ellipsis;color:var(--text-0)">${esc(boatName)}</span>
            <button class="btn btn-sm btn-icon btn-secondary"
              onclick="App.pbEditAssignmentById(${a.id});App.closeSchedulePopover()" title="Edit">✎</button>
            <button class="btn btn-sm btn-icon btn-danger"
              onclick="App.pbRemoveAssignmentById(${a.id})" title="Remove">✕</button>
          </div>`;
        }).join('')
      : `<div style="color:var(--text-4);font-size:.75rem;padding:.25rem 0">No boat assigned</div>`;
    $('sch-pop-content').innerHTML = `
      <div class="sch-pop-header">
        <strong>${esc(func?.name || '')}</strong>
        <span style="color:var(--text-4);font-size:.65rem;margin-left:.4rem">${esc(func?.function_group || '')}</span>
      </div>
      ${asgnRows}
      <div class="sch-pop-actions" style="margin-top:.4rem">
        <button onclick="App.pbAssignFromDate(${funcId},null)">+ Assign a boat</button>
      </div>`;
    const rect = event.target.getBoundingClientRect();
    el.style.left = (rect.right + 4) + 'px';
    el.style.top  = rect.top + 'px';
    el.classList.remove('hidden');
  }

  function pbAssignFromDate(funcId, date) {
    closeSchedulePopover();
    _tabCtx = 'picture';
    if (state.pbSelectedBoat) {
      openAssignModal(funcId, state.pbSelectedBoat, null, date);
      state.pbSelectedBoat = null;
    } else {
      state.pbPendingFuncId = funcId;
      state.pbPendingDate   = date;
      toast('Click a boat in the sidebar to assign it', 'info');
    }
  }

  async function renderPbBoatBudget() {
    const pbAsgns = state.pictureAssignments;
    const pbFuncs = state.pictureFunctions;
    const rows = pbAsgns.map(a => {
      const func = pbFuncs.find(f => f.id === a.boat_function_id);
      const wd   = computeWd(a);
      const rate = a.price_override || a.boat_daily_rate_estimate || 0;
      return { name: func?.name || a.function_name || '—', boat: a.boat_name_override || a.boat_name || '—',
               start: a.start_date, end: a.end_date, wd, rate, total: Math.round(wd * rate) };
    });

    function rowFigeAmount(row) {
      if (!row.start || !row.end || !row.total) return 0;
      const cur = new Date(row.start + 'T00:00:00');
      const end = new Date(row.end   + 'T00:00:00');
      let total = 0, lockedCount = 0;
      while (cur <= end) {
        total++;
        if (state.pbLockedDays[_localDk(cur)]) lockedCount++;
        cur.setDate(cur.getDate() + 1);
      }
      return total === 0 ? 0 : Math.round(row.total * lockedCount / total);
    }

    const totalGlobal   = rows.reduce((s, r) => s + r.total, 0);
    const totalFige     = rows.reduce((s, r) => s + rowFigeAmount(r), 0);
    const totalEstimate = totalGlobal - totalFige;

    $('pb-boats-budget-content').innerHTML = `
      <div class="stat-grid" style="margin-bottom:.75rem">
        <div class="stat-card" style="border:1px solid var(--border)">
          <div class="stat-val">${fmtMoney(totalGlobal)}</div>
          <div class="stat-lbl">TOTAL GLOBAL</div>
        </div>
        <div class="stat-card" style="border:1px solid var(--green);background:rgba(34,197,94,.07)">
          <div class="stat-val" style="color:var(--green)">${fmtMoney(totalFige)}</div>
          <div class="stat-lbl">UP TO DATE <span style="font-size:.6rem;opacity:.55">(frozen)</span></div>
        </div>
        <div class="stat-card" style="border:1px solid #F59E0B;background:rgba(245,158,11,.07)">
          <div class="stat-val" style="color:#F59E0B">${fmtMoney(totalEstimate)}</div>
          <div class="stat-lbl">ESTIMATE</div>
        </div>
      </div>
      <div class="budget-dept-card">
        <table class="budget-table">
          <thead>
            <tr>
              <th>Function</th>
              <th style="text-align:left">Boat</th>
              <th>Start</th><th>End</th>
              <th>Days</th><th>$/day</th><th>Total $</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r, i) => `<tr style="${i%2 ? 'background:var(--bg-surface)' : ''}">
              <td style="color:var(--text-1)">${esc(r.name)}</td>
              <td style="color:var(--cyan)">${esc(r.boat)}</td>
              <td style="font-size:.72rem;color:var(--text-3)">${fmtDate(r.start)}</td>
              <td style="font-size:.72rem;color:var(--text-3)">${fmtDate(r.end)}</td>
              <td style="text-align:right;color:var(--text-2)">${r.wd ?? '—'}</td>
              <td style="text-align:right;color:var(--text-3)">${fmtMoney(r.rate)}</td>
              <td style="text-align:right;font-weight:700;color:var(--green)">${fmtMoney(r.total)}</td>
            </tr>`).join('')}
            <tr class="budget-total-row">
              <td colspan="6" style="text-align:right;color:var(--text-1)">TOTAL PICTURE BOATS</td>
              <td style="text-align:right;color:var(--green);font-size:1.05rem">${fmtMoney(totalGlobal)}</td>
            </tr>
          </tbody>
        </table>
      </div>`;
  }

  function pbOpenBoatView(boatId) {
    const boat = state.pictureBoats.find(b => b.id === boatId);
    if (!boat) return;
    if (state.pbPendingFuncId) {
      _tabCtx = 'picture';
      openAssignModal(state.pbPendingFuncId, boat, null, state.pbPendingDate);
      state.pbPendingFuncId = null; state.pbPendingDate = null; state.pbSelectedBoat = null;
      renderPbBoatList();
      return;
    }
    _tabCtx = 'picture';
    // Open the boat view popup using picture boat data
    _openPictureBoatView(boat);
  }

  function _openPictureBoatView(boat) {
    const photo = $('bv-photo');
    const phPh  = $('bv-photo-placeholder');
    if (boat.image_path) {
      photo.src = '/' + boat.image_path + '?t=' + Date.now();
      photo.style.display = 'block'; phPh.style.display = 'none';
    } else {
      photo.style.display = 'none'; phPh.style.display = 'flex';
      phPh.textContent = '#' + (boat.boat_nr || '?');
    }
    $('bv-name').textContent     = boat.name || '?';
    $('bv-nr-group').textContent = [
      boat.boat_nr ? `#${boat.boat_nr}` : null,
      boat.group_name,
    ].filter(Boolean).join(' · ');
    const wClass = waveClass(boat.wave_rating);
    $('bv-badges').innerHTML = `
      <span class="wave-badge ${wClass}">${waveLabel(boat.wave_rating)}</span>
      ${boat.capacity ? `<span class="bv-badge-chip">${esc(boat.capacity)} pax</span>` : ''}
      ${boat.night_ok ? '<span class="night-badge">NIGHT</span>' : ''}`;
    const fields = [
      boat.captain              ? ['Captain',   boat.captain]  : null,
      boat.vendor               ? ['Vendor',    boat.vendor]   : null,
      boat.daily_rate_estimate > 0 ? ['Rate est.', `$${Math.round(boat.daily_rate_estimate).toLocaleString('en-US')}/day`] : null,
      boat.notes                ? ['Notes',     boat.notes]    : null,
    ].filter(Boolean);
    $('bv-fields').innerHTML = fields.map(([label, value]) =>
      `<span class="bv-field-label">${esc(label)}</span><span class="bv-field-value">${esc(value)}</span>`
    ).join('');
    const asgns = state.pictureAssignments.filter(a => a.picture_boat_id === boat.id);
    $('bv-assignments').innerHTML = asgns.length
      ? asgns.map(a => `<div class="bd-asgn-row">
          <span style="font-weight:600;color:var(--text-0)">${esc(a.function_name || '?')}</span>
          <span style="color:var(--text-3);font-size:.72rem">${fmtDate(a.start_date)} → ${fmtDate(a.end_date)}</span>
        </div>`).join('')
      : '<div style="color:var(--text-4);font-size:.78rem">No assignments yet</div>';
    $('bv-edit-btn').onclick = () => { closeBoatView(); openPictureBoatDetail(boat.id); };
    $('boat-view-overlay').classList.remove('hidden');
  }

  // ── Picture Boats drag & drop ───────────────────────────────
  function pbOnBoatDragStart(event, boatId) {
    state.pbDragBoat = state.pictureBoats.find(b => b.id === boatId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', boatId);
    document.getElementById(`pb-boat-card-${boatId}`)?.classList.add('dragging');
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.textContent = state.pbDragBoat?.name || 'Boat';
    document.body.appendChild(ghost);
    event.dataTransfer.setDragImage(ghost, 60, 15);
    setTimeout(() => ghost.remove(), 0);
  }
  function pbOnBoatDragEnd() {
    state.pbDragBoat = null;
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  }
  function pbOnDragOver(event, funcId) {
    event.preventDefault();
    document.getElementById(`pb-role-card-${funcId}`)?.classList.add('drag-over');
    document.getElementById(`pb-drop-${funcId}`)?.classList.add('drag-over');
  }
  function pbOnDragLeave(event, funcId) {
    document.getElementById(`pb-role-card-${funcId}`)?.classList.remove('drag-over');
    document.getElementById(`pb-drop-${funcId}`)?.classList.remove('drag-over');
  }
  function pbOnDrop(event, funcId) {
    event.preventDefault();
    document.getElementById(`pb-role-card-${funcId}`)?.classList.remove('drag-over');
    document.getElementById(`pb-drop-${funcId}`)?.classList.remove('drag-over');
    const boat = state.pbDragBoat;
    if (!boat) return;
    state.pbDragBoat = null;
    _tabCtx = 'picture';
    openAssignModal(funcId, boat);
  }
  function pbOnDropZoneClick(funcId) {
    if (state.pbSelectedBoat) {
      _tabCtx = 'picture';
      openAssignModal(funcId, state.pbSelectedBoat);
      state.pbSelectedBoat = null;
    } else {
      state.pbPendingFuncId = funcId;
      state.pbPendingDate   = null;
      toast('Now click a boat to assign it', 'info');
      renderPbBoatList();
    }
  }

  async function pbUndoBoat() {
    try {
      const res = await api('POST', `/api/productions/${state.prodId}/undo`);
      toast(res.message || 'Undo done');
      state.pictureAssignments = await api('GET', `/api/productions/${state.prodId}/picture-boat-assignments`);
      renderPictureBoats();
    } catch (e) {
      toast('Nothing to undo', 'info');
    }
  }

  function pbToggleExport() { $('pb-export-menu').classList.toggle('hidden'); }
  function pbExportCSV()  { authDownload(`/api/productions/${state.prodId}/export/picture-boats/csv`);  $('pb-export-menu').classList.add('hidden'); }
  function pbExportJSON() { authDownload(`/api/productions/${state.prodId}/export/picture-boats/json`); $('pb-export-menu').classList.add('hidden'); }

  // ═══════════════════════════════════════════════════════════
  //  BUDGET (consolidated)
  // ═══════════════════════════════════════════════════════════

  async function renderBudget() {
    const container = $('budget-content');
    container.innerHTML = '<div style="color:var(--text-3);padding:2rem">Loading…</div>';
    try {
      const budget = await api('GET', `/api/productions/${state.prodId}/budget`);
      const byDept  = budget.by_department || {};
      const allRows = budget.rows || [];

      // Locked days from both schedulers (frontend-only, localStorage)
      const allLocked = Object.assign({}, state.lockedDays, state.pbLockedDays);

      function rowFigeAmount(row, locked) {
        if (!row.start_date || !row.end_date || !row.amount_estimate) return 0;
        const cur = new Date(row.start_date + 'T00:00:00');
        const end = new Date(row.end_date   + 'T00:00:00');
        let total = 0, lockedCount = 0;
        while (cur <= end) {
          total++;
          if (locked[_localDk(cur)]) lockedCount++;
          cur.setDate(cur.getDate() + 1);
        }
        return total === 0 ? 0 : Math.round(row.amount_estimate * lockedCount / total);
      }

      const totalGlobal   = allRows.reduce((s, r) => s + (r.amount_estimate || 0), 0);
      const totalFige     = allRows.reduce((s, r) => s + rowFigeAmount(r, allLocked), 0);
      const totalEstimate = totalGlobal - totalFige;

      const html = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem">
          <div style="font-size:.75rem;color:var(--text-4)">Global budget overview across all departments</div>
          <div style="display:flex;gap:.35rem;flex-wrap:wrap">
            <button class="btn btn-sm btn-primary" onclick="App.budgetExportXlsx()" style="display:flex;align-items:center;gap:.35rem">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              XLSX
            </button>
            <button class="btn btn-sm" onclick="App.budgetExportPdf()" style="display:flex;align-items:center;gap:.35rem;background:#dc2626;color:#fff;border:none">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              PDF
            </button>
            <button class="btn btn-sm" onclick="App.dailyReportPdf()" style="display:flex;align-items:center;gap:.35rem;background:#7c3aed;color:#fff;border:none">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Daily
            </button>
            <button class="btn btn-sm" onclick="App.vendorSummaryExport()" style="display:flex;align-items:center;gap:.35rem;background:#0891b2;color:#fff;border:none">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
              Vendors
            </button>
          </div>
        </div>
        <div class="stat-grid" style="margin-bottom:.75rem">
          <div class="stat-card" style="border:1px solid var(--border)">
            <div class="stat-val" style="font-size:1.75rem">${fmtMoney(totalGlobal)}</div>
            <div class="stat-lbl">TOTAL GLOBAL</div>
          </div>
          <div class="stat-card" style="border:1px solid var(--green);background:rgba(34,197,94,.07)">
            <div class="stat-val" style="font-size:1.75rem;color:var(--green)">${fmtMoney(totalFige)}</div>
            <div class="stat-lbl">UP TO DATE <span style="font-size:.6rem;opacity:.55">(frozen)</span></div>
          </div>
          <div class="stat-card" style="border:1px solid #F59E0B;background:rgba(245,158,11,.07)">
            <div class="stat-val" style="font-size:1.75rem;color:#F59E0B">${fmtMoney(totalEstimate)}</div>
            <div class="stat-lbl">ESTIMATE</div>
          </div>
        </div>
        <div class="stat-grid">
          ${Object.keys(byDept).map(dept => `
          <div class="stat-card" style="text-align:left">
            <div style="font-size:.65rem;font-weight:700;color:var(--text-4);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.25rem">${esc(dept)}</div>
            <div style="font-size:1.1rem;font-weight:700;color:var(--text-0)">${fmtMoney(byDept[dept].total_estimate)}</div>
          </div>`).join('')}
        </div>
        ${Object.entries(byDept).map(([dept, ddata]) => `
        <div class="budget-dept-card">
          <div class="budget-dept-header">
            <span style="font-weight:700;font-size:.82rem;color:var(--text-0)">${esc(dept)}</span>
            <span style="font-weight:700;color:var(--green)">${fmtMoney(ddata.total_estimate)}</span>
          </div>
          <table class="budget-table">
            <thead>
              <tr>
                <th>Item</th>
                <th style="text-align:left">Detail</th>
                <th>Start</th>
                <th>End</th>
                <th>Days</th>
                <th>$/day</th>
                <th>Total $</th>
              </tr>
            </thead>
            <tbody>
              ${(ddata.lines || []).map((r, i) => `<tr style="${i%2 ? 'background:var(--bg-surface)' : ''}">
                <td style="color:var(--text-1)">${esc(r.name || '')}</td>
                <td style="color:var(--text-2)">${esc(r.boat || r.detail || '')}</td>
                <td style="font-size:.7rem;color:var(--text-3)">${fmtDate(r.start_date)}</td>
                <td style="font-size:.7rem;color:var(--text-3)">${fmtDate(r.end_date)}</td>
                <td style="text-align:right;color:var(--text-2)">${r.working_days ?? '—'}</td>
                <td style="text-align:right;color:var(--text-3)">${fmtMoney(r.unit_price_estimate)}</td>
                <td style="text-align:right;font-weight:600;color:var(--green)">${fmtMoney(r.amount_estimate)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`).join('')}`;

      container.innerHTML = html;
      // After rendering department budget, render daily budget below it
      _renderDailyBudget(container);
      // AXE 6.3: render budget history section
      _renderBudgetHistory(container);
    } catch (e) {
      container.innerHTML = `<div style="color:var(--red);padding:2rem">Error: ${esc(e.message)}</div>`;
    }
  }

  // ── Daily Budget (AXE 6.2) ─────────────────────────────────────────────

  let _dailySortDesc = true;

  async function _renderDailyBudget(parentContainer) {
    const wrapper = document.createElement('div');
    wrapper.id = 'daily-budget-section';
    wrapper.style.cssText = 'margin-top:1.5rem';
    wrapper.innerHTML = '<div style="color:var(--text-3);padding:1rem;text-align:center;font-size:.8rem">Loading daily budget...</div>';
    parentContainer.appendChild(wrapper);

    try {
      const data = await api('GET', `/api/productions/${state.prodId}/budget/daily`);
      const days = data.days || [];
      const averages = data.averages || {};
      if (!days.length) {
        wrapper.innerHTML = '<div style="color:var(--text-4);padding:1rem;font-size:.8rem">No shooting days found.</div>';
        return;
      }

      _dailyBudgetData = { days, averages, grandTotal: data.grand_total || 0 };
      _buildDailyBudgetHTML(wrapper);
    } catch (e) {
      wrapper.innerHTML = `<div style="color:var(--red);padding:1rem">Error loading daily budget: ${esc(e.message)}</div>`;
    }
  }

  let _dailyBudgetData = null;

  function _buildDailyBudgetHTML(wrapper) {
    const { days, averages, grandTotal } = _dailyBudgetData;
    const sorted = [...days].sort((a, b) => _dailySortDesc ? b.total - a.total : a.total - b.total);

    // Day type colors and labels
    const typeColors = { game: '#3B82F6', arena: '#22C55E', council: '#EF4444', off: '#6B7280', standard: '#F59E0B' };
    const typeLabels = { game: 'Game', arena: 'Arena', council: 'Council', off: 'Off', standard: 'Standard' };

    // Averages comparison cards
    const avgKeys = Object.keys(averages).sort((a, b) => (averages[b] || 0) - (averages[a] || 0));
    const maxAvg = Math.max(...Object.values(averages), 1);
    const avgHTML = avgKeys.length > 0 ? `
      <div style="margin-bottom:1rem">
        <div style="font-size:.75rem;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.5rem">Average Cost by Day Type</div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap">
          ${avgKeys.map(k => {
            const color = typeColors[k] || '#6b7280';
            const pct = (averages[k] / maxAvg * 100).toFixed(0);
            return `
            <div style="flex:1;min-width:120px;background:var(--bg-card);border-radius:8px;padding:.6rem .8rem;border:1px solid var(--border)">
              <div style="display:flex;align-items:center;gap:.35rem;margin-bottom:.35rem">
                <span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block"></span>
                <span style="font-size:.7rem;font-weight:600;color:var(--text-2);text-transform:uppercase">${typeLabels[k] || k}</span>
              </div>
              <div style="font-size:1.1rem;font-weight:700;color:var(--text-0)">${fmtMoney(averages[k])}</div>
              <div style="margin-top:.3rem;height:4px;background:var(--bg-surface);border-radius:2px;overflow:hidden">
                <div style="width:${pct}%;height:100%;background:${color};border-radius:2px"></div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>` : '';

    // Table header
    const deptCols = [
      { key: 'boats', label: 'Boats' },
      { key: 'picture_boats', label: 'PB' },
      { key: 'security_boats', label: 'SB' },
      { key: 'transport', label: 'Transport' },
      { key: 'labour', label: 'Labour' },
      { key: 'guards', label: 'Guards' },
      { key: 'locations', label: 'Loc.' },
      { key: 'fnb', label: 'FNB' },
      { key: 'fuel', label: 'Fuel' },
    ];

    const sortIcon = _dailySortDesc ? '&#9660;' : '&#9650;';

    const tableHTML = `
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
        <table class="budget-table" style="min-width:700px">
          <thead>
            <tr>
              <th style="position:sticky;left:0;z-index:2;background:var(--bg-card)">Date</th>
              <th>Day</th>
              <th>Type</th>
              ${deptCols.map(c => `<th style="text-align:right;font-size:.65rem">${c.label}</th>`).join('')}
              <th style="text-align:right;cursor:pointer" onclick="App._toggleDailySort()">Total ${sortIcon}</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map((d, i) => {
              const color = typeColors[d.day_type] || '#6b7280';
              const maxDay = sorted[0]?.total || 1;
              const barW = (d.total / maxDay * 100).toFixed(1);
              return `<tr style="${i % 2 ? 'background:var(--bg-surface)' : ''}">
                <td style="position:sticky;left:0;z-index:1;background:inherit;font-size:.72rem;white-space:nowrap;color:var(--text-2)">${fmtDate(d.date)}</td>
                <td style="text-align:center;font-size:.72rem;color:var(--text-3)">J${d.day_number || '?'}</td>
                <td style="text-align:center">
                  <span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:.6rem;font-weight:700;color:#fff;background:${color};text-transform:uppercase">${typeLabels[d.day_type] || d.day_type}</span>
                </td>
                ${deptCols.map(c => `<td style="text-align:right;font-size:.7rem;color:var(--text-3)">${d[c.key] > 0 ? fmtMoney(d[c.key]) : '<span style="opacity:.3">-</span>'}</td>`).join('')}
                <td style="text-align:right;font-weight:700;color:var(--text-0);position:relative">
                  <div style="position:absolute;left:0;top:0;bottom:0;width:${barW}%;background:rgba(59,130,246,.08);border-radius:3px"></div>
                  <span style="position:relative">${fmtMoney(d.total)}</span>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot>
            <tr style="font-weight:700;border-top:2px solid var(--border)">
              <td style="position:sticky;left:0;z-index:1;background:var(--bg-card)">TOTAL</td>
              <td></td>
              <td></td>
              ${deptCols.map(c => {
                const sum = days.reduce((s, d) => s + (d[c.key] || 0), 0);
                return `<td style="text-align:right;font-size:.7rem;color:var(--text-2)">${fmtMoney(sum)}</td>`;
              }).join('')}
              <td style="text-align:right;color:var(--green)">${fmtMoney(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>`;

    wrapper.innerHTML = `
      <div class="budget-dept-card">
        <div class="budget-dept-header">
          <span style="font-weight:700;font-size:.85rem;color:var(--text-0)">Cost per Shooting Day</span>
          <span style="font-size:.7rem;color:var(--text-4)">${days.length} days</span>
        </div>
        ${avgHTML}
        ${tableHTML}
      </div>`;
  }

  function _toggleDailySort() {
    _dailySortDesc = !_dailySortDesc;
    const wrapper = document.getElementById('daily-budget-section');
    if (wrapper && _dailyBudgetData) _buildDailyBudgetHTML(wrapper);
  }

  // ── Budget History (AXE 6.3) ──────────────────────────────────────────────

  let _snapshotCompareA = null;
  let _snapshotCompareB = null;

  async function _renderBudgetHistory(parentContainer) {
    const wrapper = document.createElement('div');
    wrapper.id = 'budget-history-section';
    wrapper.style.cssText = 'margin-top:1.5rem';
    wrapper.innerHTML = '<div style="color:var(--text-3);padding:1rem;text-align:center;font-size:.8rem">Loading budget history...</div>';
    parentContainer.appendChild(wrapper);

    try {
      const [snapshots, priceLog] = await Promise.all([
        api('GET', `/api/productions/${state.prodId}/budget/snapshots`),
        api('GET', `/api/productions/${state.prodId}/budget/price-log?limit=50`),
      ]);
      _buildBudgetHistoryHTML(wrapper, snapshots, priceLog);
    } catch (e) {
      wrapper.innerHTML = `<div style="color:var(--red);padding:1rem">Error loading budget history: ${esc(e.message)}</div>`;
    }
  }

  function _buildBudgetHistoryHTML(wrapper, snapshots, priceLog) {
    const triggerIcons = { lock: '\u{1F512}', manual: '\u{1F4F8}', scheduled: '\u{23F0}' };
    const triggerLabels = { lock: 'Auto (lock)', manual: 'Manual', scheduled: 'Scheduled' };

    // Snapshot list
    const snapshotRows = snapshots.length ? snapshots.map((s, i) => {
      const icon = triggerIcons[s.trigger_type] || '\u{1F4CA}';
      const label = triggerLabels[s.trigger_type] || s.trigger_type;
      const d = new Date(s.created_at + 'Z');
      const timeStr = d.toLocaleDateString('en-GB', { day:'2-digit', month:'short' }) + ' ' +
                      d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
      return `<tr style="${i % 2 ? 'background:var(--bg-surface)' : ''}">
        <td style="font-size:.72rem;color:var(--text-2);white-space:nowrap">${timeStr}</td>
        <td><span style="font-size:.65rem;padding:2px 6px;border-radius:4px;background:${s.trigger_type === 'lock' ? 'rgba(59,130,246,.12)' : 'rgba(168,85,247,.12)'};color:${s.trigger_type === 'lock' ? '#3B82F6' : '#A855F7'}">${icon} ${esc(label)}</span></td>
        <td style="font-size:.72rem;color:var(--text-3);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(s.trigger_detail || '')}">${esc(s.trigger_detail || '-')}</td>
        <td style="font-size:.72rem;color:var(--text-3)">${esc(s.user_nickname || '-')}</td>
        <td style="text-align:right;font-weight:600;color:var(--green);font-size:.8rem">${fmtMoney(s.grand_total_estimate)}</td>
        <td style="text-align:center">
          <label style="display:flex;align-items:center;justify-content:center;gap:2px;cursor:pointer;font-size:.65rem;color:var(--text-4)">
            <input type="radio" name="snap-a" value="${s.id}" ${_snapshotCompareA == s.id ? 'checked' : ''} onchange="App._setSnapshotCompare('a',${s.id})"> A
          </label>
        </td>
        <td style="text-align:center">
          <label style="display:flex;align-items:center;justify-content:center;gap:2px;cursor:pointer;font-size:.65rem;color:var(--text-4)">
            <input type="radio" name="snap-b" value="${s.id}" ${_snapshotCompareB == s.id ? 'checked' : ''} onchange="App._setSnapshotCompare('b',${s.id})"> B
          </label>
        </td>
      </tr>`;
    }).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--text-4);padding:1rem;font-size:.8rem">No snapshots yet. Snapshots are created automatically when you lock days.</td></tr>';

    // Price change log
    const priceRows = priceLog.length ? priceLog.map((p, i) => {
      const d = new Date(p.created_at + 'Z');
      const timeStr = d.toLocaleDateString('en-GB', { day:'2-digit', month:'short' }) + ' ' +
                      d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
      const diff = (p.new_value || 0) - (p.old_value || 0);
      const diffColor = diff > 0 ? 'var(--red)' : diff < 0 ? 'var(--green)' : 'var(--text-3)';
      const diffSign = diff > 0 ? '+' : '';
      return `<tr style="${i % 2 ? 'background:var(--bg-surface)' : ''}">
        <td style="font-size:.72rem;color:var(--text-2);white-space:nowrap">${timeStr}</td>
        <td style="font-size:.72rem;color:var(--text-3)">${esc(p.user_nickname || '-')}</td>
        <td><span style="font-size:.6rem;font-weight:700;padding:2px 5px;border-radius:3px;background:rgba(148,163,184,.12);color:var(--text-3);text-transform:uppercase">${esc(p.entity_type)}</span></td>
        <td style="font-size:.75rem;color:var(--text-1)">${esc(p.entity_name || '-')}</td>
        <td style="font-size:.7rem;color:var(--text-3)">${esc(p.field_changed)}</td>
        <td style="text-align:right;font-size:.75rem;color:var(--text-3)">${p.old_value != null ? fmtMoney(p.old_value) : '-'}</td>
        <td style="text-align:right;font-size:.75rem;font-weight:600;color:var(--text-1)">${fmtMoney(p.new_value)}</td>
        <td style="text-align:right;font-size:.72rem;font-weight:600;color:${diffColor}">${diffSign}${fmtMoney(Math.abs(diff))}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="8" style="text-align:center;color:var(--text-4);padding:1rem;font-size:.8rem">No price changes recorded yet.</td></tr>';

    wrapper.innerHTML = `
      <div class="budget-dept-card">
        <div class="budget-dept-header" style="flex-wrap:wrap;gap:.5rem">
          <span style="font-weight:700;font-size:.85rem;color:var(--text-0)">Budget History</span>
          <div style="display:flex;gap:.35rem;align-items:center">
            <button class="btn btn-sm" onclick="App._createManualSnapshot()" style="font-size:.7rem;display:flex;align-items:center;gap:.3rem;background:var(--bg-surface);border:1px solid var(--border);color:var(--text-1)">
              <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
              Snapshot
            </button>
            <button class="btn btn-sm" id="compare-snapshots-btn" onclick="App._compareSnapshots()" style="font-size:.7rem;display:none;align-items:center;gap:.3rem;background:#3B82F6;color:#fff;border:none">
              Compare A vs B
            </button>
          </div>
        </div>

        <!-- Tabs -->
        <div style="display:flex;gap:0;margin-bottom:.5rem;border-bottom:1px solid var(--border)">
          <button class="btn btn-sm" id="bh-tab-snapshots" onclick="App._setBudgetHistoryTab('snapshots')" style="border:none;border-bottom:2px solid #3B82F6;border-radius:0;font-size:.72rem;font-weight:600;color:#3B82F6;padding:.4rem .8rem">Snapshots (${snapshots.length})</button>
          <button class="btn btn-sm" id="bh-tab-pricelog" onclick="App._setBudgetHistoryTab('pricelog')" style="border:none;border-bottom:2px solid transparent;border-radius:0;font-size:.72rem;font-weight:600;color:var(--text-4);padding:.4rem .8rem">Price Log (${priceLog.length})</button>
        </div>

        <!-- Snapshots tab -->
        <div id="bh-panel-snapshots">
          <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
            <table class="budget-table" style="min-width:600px">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Trigger</th>
                  <th>Detail</th>
                  <th>By</th>
                  <th style="text-align:right">Total Estimate</th>
                  <th style="text-align:center;width:30px">A</th>
                  <th style="text-align:center;width:30px">B</th>
                </tr>
              </thead>
              <tbody>${snapshotRows}</tbody>
            </table>
          </div>
        </div>

        <!-- Price Log tab (hidden by default) -->
        <div id="bh-panel-pricelog" style="display:none">
          <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
            <table class="budget-table" style="min-width:650px">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>By</th>
                  <th>Type</th>
                  <th>Entity</th>
                  <th>Field</th>
                  <th style="text-align:right">Old</th>
                  <th style="text-align:right">New</th>
                  <th style="text-align:right">Diff</th>
                </tr>
              </thead>
              <tbody>${priceRows}</tbody>
            </table>
          </div>
        </div>

        <!-- Comparison result container -->
        <div id="bh-comparison-result"></div>
      </div>`;
  }

  function _setBudgetHistoryTab(tab) {
    const tabs = ['snapshots', 'pricelog'];
    tabs.forEach(t => {
      const panel = document.getElementById(`bh-panel-${t}`);
      const btn = document.getElementById(`bh-tab-${t}`);
      if (panel) panel.style.display = t === tab ? '' : 'none';
      if (btn) {
        btn.style.borderBottomColor = t === tab ? '#3B82F6' : 'transparent';
        btn.style.color = t === tab ? '#3B82F6' : 'var(--text-4)';
      }
    });
  }

  function _setSnapshotCompare(slot, id) {
    if (slot === 'a') _snapshotCompareA = id;
    else _snapshotCompareB = id;
    const btn = document.getElementById('compare-snapshots-btn');
    if (btn) btn.style.display = (_snapshotCompareA && _snapshotCompareB) ? 'flex' : 'none';
  }

  async function _createManualSnapshot() {
    const note = prompt('Snapshot note (optional):');
    if (note === null) return;
    try {
      await api('POST', `/api/productions/${state.prodId}/budget/snapshots`, { note });
      toast('Budget snapshot created', 'success');
      renderBudget();
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    }
  }

  async function _compareSnapshots() {
    if (!_snapshotCompareA || !_snapshotCompareB) {
      toast('Select two snapshots (A and B) to compare', 'info');
      return;
    }
    const container = document.getElementById('bh-comparison-result');
    if (!container) return;
    container.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--text-3);font-size:.8rem">Comparing...</div>';

    try {
      const result = await api('GET', `/api/productions/${state.prodId}/budget/snapshots/compare?a=${_snapshotCompareA}&b=${_snapshotCompareB}`);
      _buildComparisonHTML(container, result);
    } catch (e) {
      container.innerHTML = `<div style="color:var(--red);padding:1rem">${esc(e.message)}</div>`;
    }
  }

  function _buildComparisonHTML(container, data) {
    const sa = data.snapshot_a;
    const sb = data.snapshot_b;
    const totalDiff = data.total_diff;
    const totalColor = totalDiff > 0 ? 'var(--red)' : totalDiff < 0 ? 'var(--green)' : 'var(--text-3)';
    const totalSign = totalDiff > 0 ? '+' : '';

    const fmtSnapDate = (s) => {
      const d = new Date(s.created_at + 'Z');
      return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
    };

    const deptRows = data.departments.map((d, i) => {
      const diffColor = d.difference > 0 ? 'var(--red)' : d.difference < 0 ? 'var(--green)' : 'var(--text-3)';
      const diffSign = d.difference > 0 ? '+' : '';
      const absDiff = Math.abs(d.difference);
      return `<tr style="${i % 2 ? 'background:var(--bg-surface)' : ''}">
        <td style="font-weight:600;font-size:.75rem;color:var(--text-1)">${esc(d.department)}</td>
        <td style="text-align:right;font-size:.75rem;color:var(--text-2)">${fmtMoney(d.snapshot_a)}</td>
        <td style="text-align:right;font-size:.75rem;color:var(--text-2)">${fmtMoney(d.snapshot_b)}</td>
        <td style="text-align:right;font-size:.75rem;font-weight:600;color:${diffColor}">${diffSign}${fmtMoney(absDiff)}</td>
        <td style="text-align:right;font-size:.72rem;color:${diffColor}">${d.change_pct > 0 ? '+' : ''}${d.change_pct}%</td>
      </tr>`;
    }).join('');

    const lineRows = data.line_changes.slice(0, 30).map((l, i) => {
      const diffColor = l.difference > 0 ? 'var(--red)' : l.difference < 0 ? 'var(--green)' : 'var(--text-3)';
      const diffSign = l.difference > 0 ? '+' : '';
      return `<tr style="${i % 2 ? 'background:var(--bg-surface)' : ''}">
        <td style="font-size:.65rem;color:var(--text-3);text-transform:uppercase">${esc(l.department)}</td>
        <td style="font-size:.75rem;color:var(--text-1)">${esc(l.name)}</td>
        <td style="text-align:right;font-size:.75rem;color:var(--text-2)">${fmtMoney(l.snapshot_a)}</td>
        <td style="text-align:right;font-size:.75rem;color:var(--text-2)">${fmtMoney(l.snapshot_b)}</td>
        <td style="text-align:right;font-size:.75rem;font-weight:600;color:${diffColor}">${diffSign}${fmtMoney(Math.abs(l.difference))}</td>
      </tr>`;
    }).join('');

    container.innerHTML = `
      <div style="margin-top:1rem;border:1px solid var(--border);border-radius:8px;padding:.75rem">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem;flex-wrap:wrap;gap:.5rem">
          <div style="font-weight:700;font-size:.82rem;color:var(--text-0)">Snapshot Comparison</div>
          <div style="font-size:1.1rem;font-weight:700;color:${totalColor}">${totalSign}${fmtMoney(Math.abs(totalDiff))}</div>
        </div>

        <div style="display:flex;gap:.5rem;margin-bottom:.75rem;flex-wrap:wrap">
          <div style="flex:1;min-width:140px;padding:.5rem;border-radius:6px;background:rgba(59,130,246,.06);border:1px solid rgba(59,130,246,.15)">
            <div style="font-size:.6rem;font-weight:700;color:#3B82F6;text-transform:uppercase;margin-bottom:.2rem">Snapshot A</div>
            <div style="font-size:.82rem;font-weight:600;color:var(--text-1)">${fmtMoney(sa.grand_total_estimate)}</div>
            <div style="font-size:.65rem;color:var(--text-3)">${fmtSnapDate(sa)} - ${esc(sa.trigger_detail || sa.trigger_type)}</div>
          </div>
          <div style="flex:1;min-width:140px;padding:.5rem;border-radius:6px;background:rgba(168,85,247,.06);border:1px solid rgba(168,85,247,.15)">
            <div style="font-size:.6rem;font-weight:700;color:#A855F7;text-transform:uppercase;margin-bottom:.2rem">Snapshot B</div>
            <div style="font-size:.82rem;font-weight:600;color:var(--text-1)">${fmtMoney(sb.grand_total_estimate)}</div>
            <div style="font-size:.65rem;color:var(--text-3)">${fmtSnapDate(sb)} - ${esc(sb.trigger_detail || sb.trigger_type)}</div>
          </div>
        </div>

        <div style="font-size:.72rem;font-weight:700;color:var(--text-3);text-transform:uppercase;margin-bottom:.3rem">By Department</div>
        <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;margin-bottom:.75rem">
          <table class="budget-table">
            <thead><tr>
              <th>Department</th>
              <th style="text-align:right">A</th>
              <th style="text-align:right">B</th>
              <th style="text-align:right">Diff</th>
              <th style="text-align:right">%</th>
            </tr></thead>
            <tbody>${deptRows}</tbody>
          </table>
        </div>

        ${lineRows ? `
        <div style="font-size:.72rem;font-weight:700;color:var(--text-3);text-transform:uppercase;margin-bottom:.3rem">Changed Line Items${data.line_changes.length > 30 ? ` (showing 30 of ${data.line_changes.length})` : ''}</div>
        <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
          <table class="budget-table">
            <thead><tr>
              <th>Dept</th>
              <th>Item</th>
              <th style="text-align:right">A</th>
              <th style="text-align:right">B</th>
              <th style="text-align:right">Diff</th>
            </tr></thead>
            <tbody>${lineRows}</tbody>
          </table>
        </div>` : ''}
      </div>`;
  }

  // ── Global Budget Export (KLAS7_BUDGET_YYMMDD.xlsx) ──────────────────────

  async function _asyncExport(asyncUrl, fallbackUrl) {
    try {
      toast('Export in progress...', 'info');
      const { job_id } = await api('POST', asyncUrl);
      // Poll for completion
      const poll = async () => {
        const status = await api('GET', `/api/exports/${job_id}`);
        if (status.status === 'done') {
          toast('Export ready - downloading', 'success');
          authDownload(status.download_url);
        } else if (status.status === 'error') {
          toast('Export failed: ' + (status.error || 'unknown'), 'error');
        } else {
          setTimeout(poll, 2000);
        }
      };
      setTimeout(poll, 2000);
    } catch (e) {
      // Fallback to sync export
      authDownload(fallbackUrl);
    }
  }

  function budgetExportXlsx() {
    _asyncExport(
      `/api/productions/${state.prodId}/export/budget-global/async`,
      `/api/productions/${state.prodId}/export/budget-global`
    );
  }

  function budgetExportPdf() {
    authDownload(`/api/productions/${state.prodId}/export/budget-pdf`);
  }

  function dailyReportPdf() {
    authDownload(`/api/productions/${state.prodId}/export/daily-report-pdf`);
  }

  function vendorSummaryExport() {
    // Show format picker: CSV or PDF
    const fmt = confirm('OK = PDF format\nCancel = CSV format') ? 'pdf' : 'csv';
    if (fmt === 'pdf') {
      authDownload(`/api/productions/${state.prodId}/export/vendor-summary-pdf`);
    } else {
      authDownload(`/api/productions/${state.prodId}/export/vendor-summary`);
    }
  }

  function logisticsExportXlsx() {
    _asyncExport(
      `/api/productions/${state.prodId}/export/logistics/async`,
      `/api/productions/${state.prodId}/export/logistics`
    );
  }

  // ═══════════════════════════════════════════════════════════
  //  TRANSPORT
  // ═══════════════════════════════════════════════════════════

  function vehicleTypeBadge(type) {
    const map = {
      'MULE':      { color: '#84CC16', bg: 'rgba(132,204,22,.15)' },
      'GOLF CART': { color: '#06B6D4', bg: 'rgba(6,182,212,.15)'  },
      'PICK UP':   { color: '#F97316', bg: 'rgba(249,115,22,.15)' },
      'SUV':       { color: '#3B82F6', bg: 'rgba(59,130,246,.15)' },
      'TRUCK':     { color: '#EF4444', bg: 'rgba(239,68,68,.15)'  },
    };
    const s = map[type] || { color: '#94A3B8', bg: 'rgba(148,163,184,.15)' };
    return `<span style="font-size:.6rem;font-weight:700;padding:.15rem .4rem;border-radius:4px;background:${s.bg};color:${s.color};text-transform:uppercase;letter-spacing:.04em">${esc(type || '?')}</span>`;
  }

  async function _loadAndRenderTransport() {
    // AXE 5.4: show loading skeletons
    const rg = $('tb-role-groups'); if (rg) rg.innerHTML = _skeletonCards(3);
    const sc = $('tb-schedule-container'); if (sc) sc.innerHTML = _skeletonTable();
    try {
      const [vehicles, functions, assignments] = await Promise.all([
        api('GET', `/api/productions/${state.prodId}/transport-vehicles`),
        api('GET', `/api/productions/${state.prodId}/boat-functions?context=transport`),
        api('GET', `/api/productions/${state.prodId}/transport-assignments`),
      ]);
      state.transportVehicles    = vehicles;
      state.transportFunctions   = functions;
      state.transportAssignments = assignments;
    } catch(e) { toast('Error loading transport: ' + e.message, 'error'); }
    renderTransport();
  }

  function renderTransport() {
    renderTbVehicleList();
    if (state.tbBoatView === 'cards')    renderTbRoleCards();
    else if (state.tbBoatView === 'schedule') renderTbSchedule();
    else if (state.tbBoatView === 'budget')   renderTbBudget();
  }

  function tbSetBoatView(view) {
    state.tbBoatView = view;
    ['cards','schedule','budget'].forEach(v => {
      $(`tb-view-${v}`).classList.toggle('hidden', v !== view);
      $(`tb-btab-${v}`).classList.toggle('active', v === view);
    });
    renderTransport();
    _updateBreadcrumb(view.charAt(0).toUpperCase() + view.slice(1));
  }

  function tbFilterVehicles(f) {
    state.tbVehicleFilter = f;
    ['all','available','assigned'].forEach(id => {
      $(`tb-filter-${id}`).classList.toggle('active', id === f);
    });
    renderTbVehicleList();
  }

  function _tbFilteredVehicles() {
    const assignedIds = new Set(state.transportAssignments.filter(a => a.vehicle_id).map(a => a.vehicle_id));
    let vehicles = [...state.transportVehicles];
    if      (state.tbVehicleFilter === 'available') vehicles = vehicles.filter(v => !assignedIds.has(v.id));
    else if (state.tbVehicleFilter === 'assigned')  vehicles = vehicles.filter(v => assignedIds.has(v.id));
    vehicles.sort((a, b) => (a.vehicle_nr || 999) - (b.vehicle_nr || 999) || (a.name || '').localeCompare(b.name || ''));
    return vehicles;
  }

  function _tbAssignmentsForFunc(funcId) {
    return state.transportAssignments.filter(a => a.boat_function_id === funcId);
  }

  function renderTbVehicleList() {
    const vehicles = _tbFilteredVehicles();
    const assignedIds = new Set(state.transportAssignments.filter(a => a.vehicle_id).map(a => a.vehicle_id));
    const container = $('tb-vehicle-list');
    if (!container) return;
    if (!vehicles.length) {
      container.innerHTML = '<div style="color:var(--text-4);font-size:.8rem;text-align:center;padding:1rem">No vehicles</div>';
      return;
    }
    container.innerHTML = vehicles.map(v => {
      const isAssigned = assignedIds.has(v.id);
      const vAsgns = state.transportAssignments.filter(a => a.vehicle_id === v.id);
      const thumb = v.image_path
        ? `<img class="boat-thumb" src="/${v.image_path}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
           <div class="boat-thumb-placeholder" style="display:none">#${esc(v.vehicle_nr || '?')}</div>`
        : `<div class="boat-thumb-placeholder">#${esc(v.vehicle_nr || '?')}</div>`;
      const nr   = v.vehicle_nr ? `<span style="font-size:.6rem;color:var(--text-4);font-family:monospace">#${esc(v.vehicle_nr)}</span> ` : '';
      const tbRateVal = v.daily_rate_estimate || 0;
      const rate = `<div style="font-size:.65rem;color:${tbRateVal > 0 ? 'var(--green)' : 'var(--text-4)'};margin-top:.1rem;cursor:pointer;display:inline-flex;align-items:center;gap:.2rem"
        onclick="event.stopPropagation();App.openTransportVehicleDetail(${v.id})"
        title="Click to edit rate">${tbRateVal > 0 ? '$' + Math.round(tbRateVal).toLocaleString('en-US') + '/d' : '+ set rate'}<span style="font-size:.55rem;opacity:.5">&#x270E;</span></div>`;
      return `<div class="boat-card ${isAssigned ? 'assigned' : ''}"
        id="tb-vehicle-card-${v.id}"
        draggable="true"
        ondragstart="App.tbOnVehicleDragStart(event,${v.id})"
        ondragend="App.tbOnVehicleDragEnd()"
        onclick="App.tbOpenVehicleView(${v.id})">
        <div class="boat-thumb-wrap">${thumb}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:baseline;gap:.3rem;margin-bottom:.2rem;flex-wrap:wrap">
            ${nr}<span style="font-weight:700;font-size:.82rem;color:var(--text-0);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(v.name)}</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:.2rem;align-items:center;margin-bottom:.1rem">
            ${vehicleTypeBadge(v.type)}
          </div>
          ${v.driver ? `<div style="font-size:.65rem;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">🚗 ${esc(v.driver)}</div>` : ''}
          ${v.vendor ? `<div style="font-size:.65rem;color:var(--orange);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">🏢 ${esc(v.vendor)}</div>` : ''}
          ${rate}
          ${isAssigned && vAsgns.length ? `<div style="font-size:.6rem;color:var(--accent);margin-top:.1rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">→ ${vAsgns.map(a => esc(a.function_name || '')).join(', ')}</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:.15rem;flex-shrink:0;align-self:flex-start">
          <button class="boat-edit-btn" title="Edit vehicle"
            onclick="event.stopPropagation();App.openTransportVehicleDetail(${v.id})">&#x270E;</button>
          <button class="card-delete-btn" title="Delete vehicle"
            onclick="event.stopPropagation();App.confirmDeleteVehicle(${v.id},'${esc(v.name).replace(/'/g,"\\'")}',${vAsgns.length})">&#x1F5D1;</button>
        </div>
      </div>`;
    }).join('');
  }

  // ── Delete vehicle from card ──────────────────────────────
  function confirmDeleteVehicle(vehicleId, vehicleName, assignmentCount) {
    const impact = assignmentCount > 0 ? `\n${assignmentCount} assignment(s) will also be deleted.` : '';
    showConfirm(`Delete vehicle "${vehicleName}"?${impact}`, async () => {
      try {
        await api('DELETE', `/api/transport-vehicles/${vehicleId}`);
        state.transportVehicles = state.transportVehicles.filter(v => v.id !== vehicleId);
        state.transportAssignments = state.transportAssignments.filter(a => a.vehicle_id !== vehicleId);
        closeBoatDetail();
        renderTransport();
        toast('Vehicle deleted');
      } catch (e) { toast('Error: ' + e.message, 'error'); }
    });
  }

  function renderTbRoleCards() {
    const container = $('tb-role-groups');
    if (!container) return;
    const grouped = {};
    _groupOrder('transport').forEach(g => { grouped[g] = []; });
    state.transportFunctions.forEach(f => {
      const g = f.function_group || 'UNIT';
      if (!grouped[g]) grouped[g] = [];
      grouped[g].push(f);
    });
    let html = '';
    _groupOrder('transport').forEach(group => {
      const funcs = grouped[group];
      if (!funcs.length) return;
      const color = _groupColor('transport', group);
      html += `
        <div class="role-group-header" style="background:${color}18;border-left:3px solid ${color}">
          <span style="color:${color}">●</span>
          <span style="color:${color}">${esc(group)}</span>
          <span style="color:var(--text-4);font-weight:400;font-size:.65rem;text-transform:none;letter-spacing:0">${funcs.length} function${funcs.length > 1 ? 's' : ''}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:.5rem;margin-bottom:.75rem">
          ${funcs.map(f => renderTbRoleCard(f, color)).join('')}
        </div>`;
    });
    container.innerHTML = html || '<div style="color:var(--text-4);text-align:center;padding:3rem">No functions. Click + Function to add one.</div>';
  }

  function renderTbRoleCard(func, color) {
    const asgns = _tbAssignmentsForFunc(func.id);
    const assignedBodies = asgns.map(asgn => {
      const vehicleName = asgn.vehicle_name_override || asgn.vehicle_name || '?';
      const wd   = computeWd(asgn);
      const rate = asgn.price_override || asgn.vehicle_daily_rate_estimate || 0;
      const total = Math.round(wd * rate);
      return `<div class="assigned-mini" style="margin-bottom:.35rem">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;margin-bottom:.2rem">
              ${asgn.vehicle_type ? vehicleTypeBadge(asgn.vehicle_type) : ''}
              <span style="font-weight:600;color:var(--text-0);font-size:.82rem">${esc(vehicleName)}</span>
              ${asgn.driver ? `<span style="color:var(--text-3);font-size:.7rem">· ${esc(asgn.driver)}</span>` : ''}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:.2rem">
            <button class="btn btn-sm btn-secondary btn-icon" onclick="App.tbEditAssignmentById(${asgn.id})" title="Edit">✎</button>
            <button class="btn btn-sm btn-danger btn-icon" onclick="App.tbRemoveAssignmentById(${asgn.id})" title="Remove">✕</button>
          </div>
        </div>
      </div>`;
    });
    const dropZone = `<div class="drop-zone" id="tb-drop-${func.id}"
      ondragover="App.tbOnDragOver(event,${func.id})"
      ondragleave="App.tbOnDragLeave(event,${func.id})"
      ondrop="App.tbOnDrop(event,${func.id})"
      onclick="App.tbOnDropZoneClick(${func.id})"
      style="${asgns.length ? 'margin-top:.3rem;padding:.35rem;font-size:.7rem' : ''}">
      ${state.tbSelectedVehicle
        ? `<span style="color:var(--accent)">Click to assign <strong>${esc(state.tbSelectedVehicle.name)}</strong></span>`
        : (asgns.length ? '<span>+ Add another assignment</span>' : '<span>Drop or click a vehicle to assign</span>')}
    </div>`;
    return `<div class="role-card" id="tb-role-card-${func.id}"
      style="border-top:3px solid ${color}"
      ondragover="App.tbOnDragOver(event,${func.id})"
      ondragleave="App.tbOnDragLeave(event,${func.id})"
      ondrop="App.tbOnDrop(event,${func.id})">
      <div class="role-card-header">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;color:var(--text-0);font-size:.85rem">${esc(func.name)}</div>
          ${func.specs ? `<div style="font-size:.7rem;color:var(--text-4);margin-top:.1rem">${esc(func.specs)}</div>` : ''}
        </div>
        <button onclick="App.tbConfirmDeleteFunc(${func.id})"
          style="color:var(--text-4);background:none;border:none;cursor:pointer;font-size:.9rem;padding:.2rem"
          title="Delete">✕</button>
      </div>
      <div class="role-card-body">${assignedBodies.join('') + dropZone}</div>
    </div>`;
  }

  function tbOpenVehicleView(vehicleId) {
    const vehicle = state.transportVehicles.find(v => v.id === vehicleId);
    if (!vehicle) return;
    if (state.tbPendingFuncId) {
      _tabCtx = 'transport';
      openAssignModal(state.tbPendingFuncId, { id: vehicle.id, name: vehicle.name, daily_rate_estimate: vehicle.daily_rate_estimate || 0 }, null, state.tbPendingDate);
      state.tbPendingFuncId = null; state.tbPendingDate = null; state.tbSelectedVehicle = null;
      renderTbVehicleList();
      return;
    }
    _tabCtx = 'transport';
    // Show boat view overlay reusing the shared panel
    const photo = $('bv-photo');
    const phPh  = $('bv-photo-placeholder');
    if (vehicle.image_path) {
      photo.src = '/' + vehicle.image_path + '?t=' + Date.now();
      photo.style.display = 'block'; phPh.style.display = 'none';
    } else {
      photo.style.display = 'none'; phPh.style.display = 'flex';
      phPh.textContent = '#' + (vehicle.vehicle_nr || '?');
    }
    $('bv-name').textContent     = vehicle.name || '?';
    $('bv-nr-group').textContent = [
      vehicle.vehicle_nr ? `#${vehicle.vehicle_nr}` : null,
      vehicle.group_name,
    ].filter(Boolean).join(' · ');
    $('bv-badges').innerHTML = vehicleTypeBadge(vehicle.type);
    const fields = [
      vehicle.driver              ? ['Driver',    vehicle.driver]  : null,
      vehicle.vendor              ? ['Vendor',    vehicle.vendor]  : null,
      vehicle.daily_rate_estimate > 0 ? ['Rate est.', `$${Math.round(vehicle.daily_rate_estimate).toLocaleString('en-US')}/day`] : null,
      vehicle.notes               ? ['Notes',     vehicle.notes]   : null,
    ].filter(Boolean);
    $('bv-fields').innerHTML = fields.map(([label, value]) =>
      `<span class="bv-field-label">${esc(label)}</span><span class="bv-field-value">${esc(value)}</span>`
    ).join('');
    const asgns = state.transportAssignments.filter(a => a.vehicle_id === vehicle.id);
    $('bv-assignments').innerHTML = asgns.length
      ? asgns.map(a => `<div class="bd-asgn-row">
          <span style="font-weight:600;color:var(--text-0)">${esc(a.function_name || '?')}</span>
          <span style="color:var(--text-3);font-size:.72rem">${fmtDate(a.start_date)} → ${fmtDate(a.end_date)}</span>
        </div>`).join('')
      : '<div style="color:var(--text-4);font-size:.78rem">No assignments yet</div>';
    $('bv-edit-btn').onclick = () => { closeBoatView(); openTransportVehicleDetail(vehicle.id); };
    $('boat-view-overlay').classList.remove('hidden');
  }

  function renderTbSchedule() {
    const container = $('tb-schedule-container');
    if (!container) return;
    const days = [];
    const d = new Date(SCHEDULE_START);
    while (d <= SCHEDULE_END) { days.push(new Date(d)); d.setDate(d.getDate() + 1); }
    const wrapEl = container.querySelector('.schedule-wrap');
    const { start: vColStart, end: vColEnd } = _getVisibleColRange(wrapEl, days.length);
    const pdtByDate = {};
    state.shootingDays.forEach(day => { pdtByDate[day.date] = day; });
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthGroups = [];
    let prevM = -1, cnt = 0;
    days.forEach(day => {
      if (day.getMonth() !== prevM) {
        if (prevM >= 0) monthGroups.push({ m: prevM, cnt });
        prevM = day.getMonth(); cnt = 1;
      } else cnt++;
    });
    monthGroups.push({ m: prevM, cnt });
    let monthRow = '<th class="role-name-cell"></th>';
    monthRow += monthGroups.map(mg =>
      `<th colspan="${mg.cnt}" style="text-align:center;font-size:.65rem">${monthNames[mg.m]}</th>`
    ).join('');
    let dayRow = '<th class="role-name-cell"></th>';
    dayRow += days.map(day => {
      const dk = _localDk(day);
      const isWE = day.getDay() === 0 || day.getDay() === 6;
      const isLocked = !!state.tbLockedDays[dk];
      return `<th class="schedule-day-th ${isWE ? 'weekend-col' : ''} ${pdtByDate[dk] ? 'has-pdt' : ''} ${isLocked ? 'day-locked' : ''}"
        data-date="${dk}"
        onmouseenter="App.showDateTooltip(event,'${dk}')"
        onmouseleave="App.hidePDTTooltip()"
      >${day.getDate()}</th>`;
    }).join('');
    const dailyCnt = {};
    days.forEach(d => { dailyCnt[_localDk(d)] = 0; });
    const gOrder = _groupOrder('transport');
    const sortedFuncs = [...state.transportFunctions].sort((a, b) => {
      const ga = gOrder.indexOf(a.function_group || 'UNIT');
      const gb = gOrder.indexOf(b.function_group || 'UNIT');
      return (ga === -1 ? 999 : ga) - (gb === -1 ? 999 : gb) || a.sort_order - b.sort_order;
    });
    const rowsHTML = sortedFuncs.map(func => {
      const funcAsgns = _tbAssignmentsForFunc(func.id);
      const color = _groupColor('transport', func.function_group);
      funcAsgns.forEach(asgn => {
        days.forEach(d => {
          const dk = _localDk(d);
          if (effectiveStatus(asgn, dk)) dailyCnt[dk] = (dailyCnt[dk] || 0) + 1;
        });
      });
      const vAsgn = funcAsgns.find(a => a.vehicle_id || a.vehicle_name_override || a.vehicle_name);
      const vLabel = vAsgn ? (vAsgn.vehicle_name_override || vAsgn.vehicle_name || null) : null;
      const multiSuffix = funcAsgns.length > 1 ? ` +${funcAsgns.length - 1}` : '';
      let cells = `<td class="role-name-cell sch-func-cell" style="border-top:2px solid ${color}"
        title="${esc(func.name)}" onclick="App.tbOnFuncCellClick(event,${func.id})">
        <div class="rn-group" style="color:${color}">${esc(func.function_group || 'UNIT')}</div>
        <div class="${vLabel ? 'rn-boat' : 'rn-empty'}">${esc(vLabel ? vLabel + multiSuffix : func.name)}</div>
      </td>`;
      days.forEach((day, colIdx) => {
        const dk = _localDk(day);
        const isWE = day.getDay() === 0 || day.getDay() === 6;
        const weClass = isWE ? 'weekend-col' : '';
        if (colIdx < vColStart || colIdx >= vColEnd) {
          cells += `<td class="schedule-cell ${weClass}"></td>`;
          return;
        }
        let filledAsgn = null, filledStatus = null;
        for (const asgn of funcAsgns) {
          const st = effectiveStatus(asgn, dk);
          if (st) { filledAsgn = asgn; filledStatus = st; break; }
        }
        if (!filledAsgn) {
          cells += `<td class="schedule-cell ${weClass}"
            onclick="App.tbOnDateCellClick(event,${func.id},null,'${dk}')"></td>`;
        } else {
          const bg = _scheduleCellBg(filledStatus, color, isWE);
          cells += `<td class="schedule-cell ${weClass}" style="background:${bg}"
            onclick="App.tbOnDateCellClick(event,${func.id},${filledAsgn.id},'${dk}')"></td>`;
        }
      });
      return `<tr>${cells}</tr>`;
    }).join('');
    let countCells = '<td class="role-name-cell" style="color:var(--text-3);font-size:.68rem">Active vehicles</td>';
    countCells += days.map(day => {
      const dk = _localDk(day);
      const c = dailyCnt[dk] || 0;
      const isWE = day.getDay() === 0 || day.getDay() === 6;
      return `<td class="${isWE ? 'weekend-col' : ''}" style="text-align:center;font-size:.68rem;color:${c ? 'var(--green)' : 'var(--border)'};font-weight:700">${c || ''}</td>`;
    }).join('');
    let lockCells = '<td class="role-name-cell sch-lock-label" title="Lock a day to prevent accidental changes">🔒 LOCK</td>';
    lockCells += days.map(day => {
      const dk = _localDk(day);
      const isWE = day.getDay() === 0 || day.getDay() === 6;
      const isLocked = !!state.tbLockedDays[dk];
      return `<td class="sch-lock-cell ${isWE ? 'weekend-col' : ''}">
        <input type="checkbox" class="day-lock-cb" ${isLocked ? 'checked' : ''}
          onchange="App.tbToggleDayLock('${dk}',this.checked)"
          title="${isLocked ? 'Unlock' : 'Lock this day'}">
      </td>`;
    }).join('');
    const tbSchedHTML = `
      <div class="schedule-wrap"><table class="schedule-table">
        <thead><tr>${monthRow}</tr><tr>${dayRow}</tr></thead>
        <tbody>${rowsHTML}<tr class="schedule-count-row">${countCells}</tr></tbody>
      </table></div>
      <div class="schedule-lock-outer"><table class="schedule-table">
        <tbody><tr class="schedule-lock-row">${lockCells}</tr></tbody>
      </table></div>`;
    _morphHTML(container, tbSchedHTML);
    const _sw = container.querySelector('.schedule-wrap');
    const _sl = container.querySelector('.schedule-lock-outer');
    if (_sw && _sl) {
      _sw.addEventListener('scroll', () => {
        _sl.scrollLeft = _sw.scrollLeft;
        _debouncedRender('tb-schedule-vscroll', renderTbSchedule, 100);
      });
    }
  }

  async function tbOnDateCellClick(event, funcId, assignmentId, date) {
    event.stopPropagation();
    closeSchedulePopover();
    const isLocked = !!state.tbLockedDays[date];
    if (isLocked) {
      toast(`Day ${fmtDateLong(date)} is locked — uncheck to modify`, 'info');
      return;
    }
    if (!assignmentId) await _tbFillDay(funcId, date);
    else await _tbDoCellCycle(funcId, assignmentId, date);
  }

  async function _tbFillDay(funcId, date) {
    const funcAsgns = _tbAssignmentsForFunc(funcId);
    try {
      if (funcAsgns.length > 0) {
        const asgn = funcAsgns[0];
        const overrides = JSON.parse(asgn.day_overrides || '{}');
        overrides[date] = 'on';
        const updates = { day_overrides: JSON.stringify(overrides) };
        const s = (asgn.start_date || '').slice(0, 10);
        const e = (asgn.end_date   || '').slice(0, 10);
        if (!s || date < s) {
          updates.start_date = date;
          if (s) {
            const cur = new Date(date + 'T00:00:00');
            cur.setDate(cur.getDate() + 1);
            const oldS = new Date(s + 'T00:00:00');
            while (cur < oldS) {
              const dk = _localDk(cur);
              if (state.tbLockedDays[dk] && !(dk in overrides)) overrides[dk] = 'empty';
              cur.setDate(cur.getDate() + 1);
            }
          }
        }
        if (!e || date > e) {
          updates.end_date = date;
          if (e) {
            const cur = new Date(e + 'T00:00:00');
            cur.setDate(cur.getDate() + 1);
            const newE = new Date(date + 'T00:00:00');
            while (cur < newE) {
              const dk = _localDk(cur);
              if (state.tbLockedDays[dk] && !(dk in overrides)) overrides[dk] = 'empty';
              cur.setDate(cur.getDate() + 1);
            }
          }
        }
        updates.day_overrides = JSON.stringify(overrides);
        await api('PUT', `/api/transport-assignments/${asgn.id}`, updates);
      } else {
        await api('POST', `/api/productions/${state.prodId}/transport-assignments`, {
          boat_function_id: funcId,
          start_date: date, end_date: date,
          day_overrides: JSON.stringify({ [date]: 'on' }),
        });
      }
      state.transportAssignments = await api('GET', `/api/productions/${state.prodId}/transport-assignments`);
      renderTransport();
      _queueCellFlash(date, funcId);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  }

  async function _tbDoCellCycle(funcId, assignmentId, date) {
    const asgn = state.transportAssignments.find(a => a.id === assignmentId);
    if (!asgn) return;
    const overrides = JSON.parse(asgn.day_overrides || '{}');
    overrides[date] = 'empty';
    try {
      await api('PUT', `/api/transport-assignments/${assignmentId}`, { day_overrides: JSON.stringify(overrides) });
      const idx = state.transportAssignments.findIndex(a => a.id === assignmentId);
      if (idx >= 0) state.transportAssignments[idx].day_overrides = JSON.stringify(overrides);
      renderTransport();
      _queueCellFlash(date, funcId);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  }

  function tbOnFuncCellClick(event, funcId) {
    event.stopPropagation();
    const el = $('schedule-popover');
    if (_schPop.funcId === funcId && _schPop.type === 'tbfunc' && !el.classList.contains('hidden')) {
      closeSchedulePopover(); return;
    }
    _schPop = { assignmentId: null, funcId, date: null, type: 'tbfunc' };
    const func = state.transportFunctions.find(f => f.id === funcId);
    const asgns = _tbAssignmentsForFunc(funcId);
    const asgnRows = asgns.length
      ? asgns.map(a => {
          const vName = a.vehicle_name_override || a.vehicle_name || '—';
          return `<div class="sch-pop-asgn-row">
            <span style="flex:1;font-size:.75rem;overflow:hidden;text-overflow:ellipsis;color:var(--text-0)">${esc(vName)}</span>
            <button class="btn btn-sm btn-icon btn-secondary"
              onclick="App.tbEditAssignmentById(${a.id});App.closeSchedulePopover()" title="Edit">✎</button>
            <button class="btn btn-sm btn-icon btn-danger"
              onclick="App.tbRemoveAssignmentById(${a.id})" title="Remove">✕</button>
          </div>`;
        }).join('')
      : `<div style="color:var(--text-4);font-size:.75rem;padding:.25rem 0">No vehicle assigned</div>`;
    $('sch-pop-content').innerHTML = `
      <div class="sch-pop-header">
        <strong>${esc(func?.name || '')}</strong>
        <span style="color:var(--text-4);font-size:.65rem;margin-left:.4rem">${esc(func?.function_group || '')}</span>
      </div>
      ${asgnRows}
      <div class="sch-pop-actions" style="margin-top:.4rem">
        <button onclick="App.tbAssignFromDate(${funcId},null)">+ Assign a vehicle</button>
      </div>`;
    const rect = event.target.getBoundingClientRect();
    el.style.left = (rect.right + 4) + 'px';
    el.style.top  = rect.top + 'px';
    el.classList.remove('hidden');
  }

  function tbAssignFromDate(funcId, date) {
    closeSchedulePopover();
    _tabCtx = 'transport';
    if (state.tbSelectedVehicle) {
      openAssignModal(funcId, state.tbSelectedVehicle, null, date);
      state.tbSelectedVehicle = null;
    } else {
      state.tbPendingFuncId = funcId;
      state.tbPendingDate   = date;
      toast('Click a vehicle in the sidebar to assign it', 'info');
    }
  }

  function renderTbBudget() {
    const container = $('tb-budget-content');
    if (!container) return;
    const asgns = state.transportAssignments;
    const funcs = state.transportFunctions;
    const rows = asgns.map(a => {
      const func = funcs.find(f => f.id === a.boat_function_id);
      const wd   = computeWd(a);
      const rate = a.price_override || a.vehicle_daily_rate_estimate || 0;
      return { name: func?.name || a.function_name || '—',
               vehicle: a.vehicle_name_override || a.vehicle_name || '—',
               start: a.start_date, end: a.end_date, wd, rate, total: Math.round(wd * rate) };
    }).filter(r => r.wd > 0);

    function rowFigeAmount(row) {
      if (!row.start || !row.end || !row.total) return 0;
      const cur = new Date(row.start + 'T00:00:00');
      const end = new Date(row.end   + 'T00:00:00');
      let total = 0, lockedCount = 0;
      while (cur <= end) {
        total++;
        if (state.tbLockedDays[_localDk(cur)]) lockedCount++;
        cur.setDate(cur.getDate() + 1);
      }
      return total === 0 ? 0 : Math.round(row.total * lockedCount / total);
    }

    const totalGlobal   = rows.reduce((s, r) => s + r.total, 0);
    const totalFige     = rows.reduce((s, r) => s + rowFigeAmount(r), 0);
    const totalEstimate = totalGlobal - totalFige;

    container.innerHTML = `
      <div class="stat-grid" style="margin-bottom:.75rem">
        <div class="stat-card" style="border:1px solid var(--border)">
          <div class="stat-val">${fmtMoney(totalGlobal)}</div>
          <div class="stat-lbl">TOTAL GLOBAL</div>
        </div>
        <div class="stat-card" style="border:1px solid var(--green);background:rgba(34,197,94,.07)">
          <div class="stat-val" style="color:var(--green)">${fmtMoney(totalFige)}</div>
          <div class="stat-lbl">UP TO DATE <span style="font-size:.6rem;opacity:.55">(frozen)</span></div>
        </div>
        <div class="stat-card" style="border:1px solid #F59E0B;background:rgba(245,158,11,.07)">
          <div class="stat-val" style="color:#F59E0B">${fmtMoney(totalEstimate)}</div>
          <div class="stat-lbl">ESTIMATE</div>
        </div>
      </div>
      <div class="budget-dept-card">
        <table class="budget-table">
          <thead>
            <tr>
              <th>Function</th>
              <th style="text-align:left">Vehicle</th>
              <th>Start</th><th>End</th>
              <th>Days</th><th>$/day</th><th>Total $</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r, i) => `<tr style="${i%2 ? 'background:var(--bg-surface)' : ''}">
              <td style="color:var(--text-1)">${esc(r.name)}</td>
              <td style="color:var(--cyan)">${esc(r.vehicle)}</td>
              <td style="font-size:.72rem;color:var(--text-3)">${fmtDate(r.start)}</td>
              <td style="font-size:.72rem;color:var(--text-3)">${fmtDate(r.end)}</td>
              <td style="text-align:right;color:var(--text-2)">${r.wd ?? '—'}</td>
              <td style="text-align:right;color:var(--text-3)">${fmtMoney(r.rate)}</td>
              <td style="text-align:right;font-weight:700;color:var(--green)">${fmtMoney(r.total)}</td>
            </tr>`).join('')}
            <tr class="budget-total-row">
              <td colspan="6" style="text-align:right;color:var(--text-1)">TOTAL TRANSPORT</td>
              <td style="text-align:right;color:var(--green);font-size:1.05rem">${fmtMoney(totalGlobal)}</td>
            </tr>
          </tbody>
        </table>
      </div>`;
  }

  function tbOnVehicleDragStart(event, vehicleId) {
    state.tbDragVehicle = state.transportVehicles.find(v => v.id === vehicleId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', vehicleId);
    document.getElementById(`tb-vehicle-card-${vehicleId}`)?.classList.add('dragging');
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.textContent = state.tbDragVehicle?.name || 'Vehicle';
    document.body.appendChild(ghost);
    event.dataTransfer.setDragImage(ghost, 60, 15);
    setTimeout(() => ghost.remove(), 0);
  }
  function tbOnVehicleDragEnd() {
    state.tbDragVehicle = null;
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  }
  function tbOnDragOver(event, funcId) {
    event.preventDefault();
    document.getElementById(`tb-role-card-${funcId}`)?.classList.add('drag-over');
    document.getElementById(`tb-drop-${funcId}`)?.classList.add('drag-over');
  }
  function tbOnDragLeave(event, funcId) {
    document.getElementById(`tb-role-card-${funcId}`)?.classList.remove('drag-over');
    document.getElementById(`tb-drop-${funcId}`)?.classList.remove('drag-over');
  }
  function tbOnDrop(event, funcId) {
    event.preventDefault();
    document.getElementById(`tb-role-card-${funcId}`)?.classList.remove('drag-over');
    document.getElementById(`tb-drop-${funcId}`)?.classList.remove('drag-over');
    const vehicle = state.tbDragVehicle;
    if (!vehicle) return;
    state.tbDragVehicle = null;
    _tabCtx = 'transport';
    openAssignModal(funcId, { id: vehicle.id, name: vehicle.name, daily_rate_estimate: vehicle.daily_rate_estimate || 0 });
  }
  function tbOnDropZoneClick(funcId) {
    if (state.tbSelectedVehicle) {
      _tabCtx = 'transport';
      openAssignModal(funcId, state.tbSelectedVehicle);
      state.tbSelectedVehicle = null;
    } else {
      state.tbPendingFuncId = funcId;
      state.tbPendingDate   = null;
      toast('Now click a vehicle to assign it', 'info');
      renderTbVehicleList();
    }
  }

  function tbToggleDayLock(date, locked) {
    if (locked) state.tbLockedDays[date] = true;
    else delete state.tbLockedDays[date];
    try { localStorage.setItem('transport_locked_days', JSON.stringify(state.tbLockedDays)); } catch(e) {}
    renderTbSchedule();
  }

  async function tbUndoVehicle() {
    try {
      const res = await api('POST', `/api/productions/${state.prodId}/undo`);
      toast(res.message || 'Undo done');
      state.transportAssignments = await api('GET', `/api/productions/${state.prodId}/transport-assignments`);
      renderTransport();
    } catch (e) {
      toast('Nothing to undo', 'info');
    }
  }

  function tbToggleExport() { $('tb-export-menu').classList.toggle('hidden'); }
  function tbExportCSV()  { authDownload(`/api/productions/${state.prodId}/export/transport/csv`);  $('tb-export-menu').classList.add('hidden'); }
  function tbExportJSON() { authDownload(`/api/productions/${state.prodId}/export/transport/json`); $('tb-export-menu').classList.add('hidden'); }

  function showAddTransportVehicleModal() {
    ['ntv-name','ntv-price','ntv-driver','ntv-vendor','ntv-notes','ntv-nr'].forEach(id => { const el = $(id); if(el) el.value = ''; });
    const t = $('ntv-type'); if(t) t.value = 'SUV';
    $('add-transport-vehicle-overlay').classList.remove('hidden');
    setTimeout(() => { const el = $('ntv-name'); if(el) el.focus(); }, 80);
  }
  function closeAddTransportVehicleModal() { $('add-transport-vehicle-overlay').classList.add('hidden'); }

  async function createTransportVehicle() {
    const name = $('ntv-name').value.trim();
    if (!name) { toast('Name is required', 'error'); return; }
    try {
      const v = await api('POST', `/api/productions/${state.prodId}/transport-vehicles`, {
        name,
        daily_rate_estimate: parseFloat($('ntv-price').value) || 0,
        vehicle_nr:  parseInt($('ntv-nr').value) || null,
        type:        $('ntv-type').value,
        driver:      $('ntv-driver').value.trim() || null,
        vendor:      $('ntv-vendor').value.trim() || null,
        notes:       $('ntv-notes').value.trim()  || null,
      });
      state.transportVehicles.push(v);
      closeAddTransportVehicleModal();
      renderTbVehicleList();
      toast(`Vehicle "${v.name}" created`);
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    }
  }

  function openTransportVehicleDetail(vehicleId) {
    const v = state.transportVehicles.find(x => x.id === vehicleId);
    if (!v) return;

    _detailBoatId      = vehicleId;
    _detailIsPicture   = false;
    _detailIsTransport = true;

    // Photo
    const photo = $('bd-photo');
    const placeholder = $('bd-photo-placeholder');
    if (v.image_path) {
      photo.src = '/' + v.image_path + '?t=' + Date.now();
      photo.style.display = 'block';
      placeholder.style.display = 'none';
    } else {
      photo.style.display = 'none';
      placeholder.style.display = 'flex';
      placeholder.textContent = v.vehicle_nr ? '#' + v.vehicle_nr : v.name.slice(0, 2).toUpperCase();
    }

    // Fields — reuse boat modal fields that overlap
    $('bd-name').value     = v.name                || '';
    $('bd-nr').value       = v.vehicle_nr          || '';
    $('bd-captain').value  = v.driver              || '';
    $('bd-vendor').value   = v.vendor              || '';
    $('bd-rate-est').value = v.daily_rate_estimate || '';
    $('bd-rate-act').value = v.daily_rate_actual   || '';
    $('bd-notes').value    = v.notes               || '';

    // Context-specific labels
    _setDetailLabels('transport');

    // Hide boat-only fields
    const hideIds = ['bd-group', 'bd-category', 'bd-waves', 'bd-night', 'bd-capacity'];
    hideIds.forEach(id => { const el = $(id); if (el) { const row = el.closest('tr'); if (row) row.style.display = 'none'; } });

    // Show delete button
    $('bd-delete-btn').classList.remove('hidden');
    $('bd-delete-btn').onclick = () => {
      showConfirm(`Delete vehicle "${v.name}"?`, async () => {
        await api('DELETE', `/api/transport-vehicles/${vehicleId}`);
        state.transportVehicles = state.transportVehicles.filter(x => x.id !== vehicleId);
        closeBoatDetail();
        renderTbVehicleList();
        toast('Vehicle deleted');
      });
    };

    // Assignments list
    const asgns = state.transportAssignments.filter(a => a.vehicle_id === vehicleId);
    $('bd-assignments-list').innerHTML = asgns.length
      ? asgns.map(a => `<div class="bd-asgn-row">
          <span style="font-weight:600;color:var(--text-0)">${esc(a.function_name || '?')}</span>
          <span style="color:var(--text-3);font-size:.72rem">${fmtDate(a.start_date)} → ${fmtDate(a.end_date)}</span>
        </div>`).join('')
      : '<div style="color:var(--text-4);font-size:.78rem">No assignments yet</div>';

    $('boat-detail-overlay').classList.remove('hidden');
  }

  function tbShowAddFunctionModal() {
    ['nf-name','nf-specs','nf-start','nf-end'].forEach(id => { const el = $(id); if(el) el.value = ''; });
    $('nf-group').innerHTML = state.tbGroups.map(g => `<option value="${g.name}">${g.name}</option>`).join('');
    $('nf-group').value = state.tbGroups[0]?.name || '';
    $('nf-color').value = state.tbGroups[0]?.color || '#3B82F6';
    $('nf-group').onchange = (e) => {
      const g = state.tbGroups.find(g => g.name === e.target.value);
      $('nf-color').value = g?.color || '#6b7280';
    };
    $('add-func-overlay').dataset.ctx = 'transport';
    $('add-func-overlay').classList.remove('hidden');
    setTimeout(() => { const el = $('nf-name'); if(el) el.focus(); }, 80);
  }

  async function tbConfirmDeleteFunc(funcId) {
    const func = state.transportFunctions.find(f => f.id === funcId);
    showConfirm(`Delete function "${func?.name}"? The assignment will be lost.`, async () => {
      try {
        await api('DELETE', `/api/boat-functions/${funcId}`);
        state.transportFunctions   = state.transportFunctions.filter(f => f.id !== funcId);
        state.transportAssignments = state.transportAssignments.filter(a => a.boat_function_id !== funcId);
        renderTbRoleCards();
        toast('Function deleted');
      } catch (e) {
        toast('Error: ' + e.message, 'error');
      }
    });
  }

  function tbEditAssignmentById(assignmentId) {
    const asgn = state.transportAssignments.find(a => a.id === assignmentId);
    if (!asgn) return;
    const vehicle = state.transportVehicles.find(v => v.id === asgn.vehicle_id)
      || { id: asgn.vehicle_id || 0, name: asgn.vehicle_name_override || asgn.vehicle_name || '?', daily_rate_estimate: 0 };
    _tabCtx = 'transport';
    openAssignModal(asgn.boat_function_id, vehicle, asgn);
  }

  async function tbRemoveAssignmentById(assignmentId) {
    try {
      await api('DELETE', `/api/transport-assignments/${assignmentId}`);
      state.transportAssignments = state.transportAssignments.filter(a => a.id !== assignmentId);
      renderTransport();
      toast('Assignment removed');
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  FUEL — isolated rebuild
  // ═══════════════════════════════════════════════════════════

  const FUEL_DEFAULTS = { boats: 100, picture_boats: 40, security_boats: 40, transport: 20 };
  const _FUEL_TABS = ['boats','picture_boats','security_boats','transport','machinery','budget'];

  // Load global fuel prices and locked price snapshots from DB
  async function _loadFuelGlobals() {
    try {
      const [prices, locked] = await Promise.all([
        api('GET', '/api/fuel-prices'),
        api('GET', '/api/fuel-locked-prices'),
      ]);
      state.fuelPricePerL = { DIESEL: prices.diesel || 0, PETROL: prices.petrol || 0 };
      state.fuelLockedPrices = locked || {};
      // Rebuild fuelLockedDays from DB locked prices
      state.fuelLockedDays = {};
      for (const d of Object.keys(state.fuelLockedPrices)) {
        state.fuelLockedDays[d] = true;
      }
      // Sync localStorage for offline fallback
      try { localStorage.setItem('fuel_locked_days', JSON.stringify(state.fuelLockedDays)); } catch(e) {}
      try { localStorage.setItem('fuel_price_per_l', JSON.stringify(state.fuelPricePerL)); } catch(e) {}
      _renderFuelPriceBar();
    } catch(e) { console.warn('Could not load fuel globals from DB:', e); }
  }

  // Render fuel price inputs inside the FUEL tab (not in global topbar)
  function _renderFuelPriceBar() {
    const bar = $('fuel-price-bar');
    if (!bar) return;
    const pD = state.fuelPricePerL.DIESEL || 0;
    const pP = state.fuelPricePerL.PETROL || 0;
    bar.innerHTML = `
      <span style="font-size:.75rem;color:var(--text-2);font-weight:600;letter-spacing:.03em">FUEL PRICES</span>
      <label style="display:flex;align-items:center;gap:.3rem;font-size:.75rem;color:#3B82F6;font-weight:600">
        <span style="width:8px;height:8px;border-radius:50%;background:#3B82F6"></span>DIESEL
        <input type="number" step="0.01" min="0" value="${pD||''}" placeholder="0.00"
          id="fp-diesel" onchange="App.fuelGlobalPriceChange('DIESEL',this.value)"
          style="width:64px;font-size:.75rem;padding:.2rem .3rem;background:var(--bg-card);border:1px solid var(--border);border-radius:4px;color:var(--text-0);text-align:right"> $/L
      </label>
      <label style="display:flex;align-items:center;gap:.3rem;font-size:.75rem;color:#F97316;font-weight:600">
        <span style="width:8px;height:8px;border-radius:50%;background:#F97316"></span>PETROL
        <input type="number" step="0.01" min="0" value="${pP||''}" placeholder="0.00"
          id="fp-petrol" onchange="App.fuelGlobalPriceChange('PETROL',this.value)"
          style="width:64px;font-size:.75rem;padding:.2rem .3rem;background:var(--bg-card);border:1px solid var(--border);border-radius:4px;color:var(--text-0);text-align:right"> $/L
      </label>`;
  }

  async function fuelGlobalPriceChange(type, val) {
    const price = parseFloat(val) || 0;
    state.fuelPricePerL[type] = price;
    try {
      const payload = type === 'DIESEL' ? { diesel: price } : { petrol: price };
      await api('PUT', '/api/fuel-prices', payload);
      try { localStorage.setItem('fuel_price_per_l', JSON.stringify(state.fuelPricePerL)); } catch(e) {}
      // Re-render fuel budget if currently viewing it
      if (state.tab === 'fuel' && state.fuelTab === 'budget') renderFuelBudget();
    } catch(e) { toast('Error saving fuel price: ' + e.message, 'error'); }
  }

  async function _loadAndRenderFuel() {
    // AXE 5.4: show loading skeleton
    const fc = $('fuel-content'); if (fc) fc.innerHTML = _skeletonTable(8, 12);
    // Always refresh global fuel prices + locked snapshots from DB
    await _loadFuelGlobals();
    try {
      const [entries, machinery] = await Promise.all([
        api('GET', `/api/productions/${state.prodId}/fuel-entries`),
        api('GET', `/api/productions/${state.prodId}/fuel-machinery`),
      ]);
      state.fuelEntries   = entries;
      state.fuelMachinery = machinery;
      // Always reload assignments to reflect changes from BOATS/PB/TRANSPORT/SECURITY tabs
      const [boatAsgns, pbAsgns, tbAsgns, sbAsgns] = await Promise.all([
        api('GET', `/api/productions/${state.prodId}/assignments?context=boats`),
        api('GET', `/api/productions/${state.prodId}/picture-boat-assignments`),
        api('GET', `/api/productions/${state.prodId}/transport-assignments`),
        api('GET', `/api/productions/${state.prodId}/security-boat-assignments`),
      ]);
      state.assignments          = boatAsgns;
      state.pictureAssignments   = pbAsgns;
      state.transportAssignments = tbAsgns;
      state.securityAssignments  = sbAsgns;
    } catch(e) { toast('Error loading fuel data: ' + e.message, 'error'); }
    renderFuelTab();
    // Auto-fill new active days silently with defaults (boats 100L, pb/security 40L, transport 20L)
    if (['boats','picture_boats','security_boats','transport'].includes(state.fuelTab))
      await fuelAutoFill(true);
  }

  function renderFuelTab() {
    const tab = state.fuelTab;
    const isLinkedSchedule = ['boats','picture_boats','security_boats','transport'].includes(tab);
    const isSchedule = isLinkedSchedule || tab === 'machinery';
    // Show toolbar for all schedules; hide auto-fill for machinery (manual only)
    $('fuel-toolbar').classList.toggle('hidden', !isSchedule);
    const autoFillBtn = $('fuel-toolbar')?.querySelector('[onclick*="fuelAutoFill"]');
    if (autoFillBtn) autoFillBtn.classList.toggle('hidden', tab === 'machinery');
    if (isLinkedSchedule)       renderFuelGrid(tab);
    else if (tab==='machinery') renderFuelMachineryGrid();
    else if (tab==='budget')    renderFuelBudget();
  }

  function fuelSetTab(tab) {
    state.fuelTab = tab;
    _FUEL_TABS.forEach(t => $(`fsn-${t}`)?.classList.toggle('active', t === tab));
    renderFuelTab();
    _updateBreadcrumb(tab.charAt(0).toUpperCase() + tab.slice(1));
  }

  // ── Helper: get assignments for a source type ──────────────────────────────

  function _fuelAssignments(sourceType) {
    if (sourceType === 'boats')          return state.assignments         || [];
    if (sourceType === 'picture_boats')  return state.pictureAssignments  || [];
    if (sourceType === 'security_boats') return state.securityAssignments || [];
    if (sourceType === 'transport')      return state.transportAssignments || [];
    return [];
  }

  function _fuelEntriesMap(sourceType) {
    const map = {};
    state.fuelEntries.filter(e => e.source_type === sourceType).forEach(e => {
      map[`${e.assignment_id}:${e.date}`] = e;
    });
    return map;
  }

  // ── Helper: get assignments for a fuel source type ─────────────────────────

  function _fuelAsgns(sourceType) {
    if (sourceType === 'boats')          return state.assignments         || [];
    if (sourceType === 'picture_boats')  return state.pictureAssignments  || [];
    if (sourceType === 'security_boats') return state.securityAssignments || [];
    if (sourceType === 'transport')      return state.transportAssignments || [];
    return [];
  }

  function _fuelEntMap(sourceType) {
    const map = {};
    (state.fuelEntries || []).filter(e => e.source_type === sourceType).forEach(e => {
      map[`${e.assignment_id}:${e.date}`] = e;
    });
    return map;
  }

  // ── Main grid renderer ─────────────────────────────────────────────────────

  function renderFuelGrid(sourceType) {
    const container = $('fuel-content');
    const asgns = _fuelAsgns(sourceType).filter(a => a.start_date && a.end_date);
    const entMap = _fuelEntMap(sourceType);

    if (!asgns.length) {
      container.innerHTML = `<div style="color:var(--text-4);text-align:center;padding:3rem;font-size:.9rem">
        No assignments found for ${sourceType.replace('_',' ').toUpperCase()}.<br>
        <span style="font-size:.75rem;opacity:.6">Create assignments in the source schedule first, then come back here.</span>
      </div>`;
      return;
    }

    // Date range — LOCAL midnight dates, same method as all other schedule grids
    const allDates = [];
    { const c = new Date(SCHEDULE_START.getFullYear(), SCHEDULE_START.getMonth(), SCHEDULE_START.getDate());
      const e = new Date(SCHEDULE_END.getFullYear(),   SCHEDULE_END.getMonth(),   SCHEDULE_END.getDate());
      while (c <= e) { allDates.push(_localDk(c)); c.setDate(c.getDate()+1); } }

    // Month spans
    const monthSpans = [];
    let mCur = null, mN = 0;
    allDates.forEach(dk => {
      const m = dk.slice(0,7);
      if (m !== mCur) { if (mCur) monthSpans.push({m: mCur, n: mN}); mCur = m; mN = 1; } else mN++;
    });
    if (mCur) monthSpans.push({m: mCur, n: mN});

    const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthHdr = monthSpans.map(s => {
      const mo = parseInt(s.m.slice(5,7))-1;
      return `<th colspan="${s.n}" style="text-align:center;font-size:.62rem;color:var(--text-3);padding:.15rem;border-bottom:1px solid var(--border)">${MO[mo]} ${s.m.slice(0,4)}</th>`;
    }).join('');

    const pdtByDate = {};
    state.shootingDays.forEach(d => { pdtByDate[d.date] = d; });

    const dayHdr = allDates.map(dk => {
      const dLocal = new Date(dk+'T00:00:00');  // local midnight → correct getDay/getDate
      const isWe = [0,6].includes(dLocal.getDay());
      const isLk = !!state.fuelLockedDays[dk];
      return `<th class="schedule-day-th ${isWe ? 'weekend-col' : ''} ${pdtByDate[dk] ? 'has-pdt' : ''} ${isLk ? 'day-locked' : ''}"
    data-date="${dk}"
    onmouseenter="App.showDateTooltip(event,'${dk}')"
    onmouseleave="App.hidePDTTooltip()"
  >${dLocal.getDate()}</th>`;
    }).join('');

    // Assignment rows
    const rows = asgns.map(asgn => {
      const vName = asgn.boat_name_override || asgn.boat_name || asgn.vehicle_name_override || asgn.vehicle_name || '?';
      const fName = asgn.function_name || '?';
      // Determine existing fuel type for this row (first entry found)
      const _defaultFt = ['boats','picture_boats','security_boats'].includes(sourceType) ? 'PETROL' : 'DIESEL';
      const existingFt = (state.fuelEntries||[]).find(e => e.source_type === sourceType && e.assignment_id === asgn.id)?.fuel_type || _defaultFt;
      let rowTotal = 0;

      const cells = allDates.map(dk => {
        const isWe = [0,6].includes(new Date(dk+'T00:00:00').getDay());
        const isActive = !!effectiveStatus(asgn, dk);
        const isLocked = !!state.fuelLockedDays[dk];
        const entry = entMap[`${asgn.id}:${dk}`];
        if (entry?.liters) rowTotal += entry.liters;

        const weCls = isWe ? ' weekend-col' : '';
        if (!isActive) return `<td class="fuel-data-cell fuel-inactive${weCls}"></td>`;

        const val = entry ? entry.liters : '';
        const eId = entry ? entry.id : 'null';
        if (isLocked) return `<td class="fuel-data-cell fuel-locked${weCls}"><input type="number" disabled value="${val}"></td>`;
        return `<td class="fuel-data-cell${weCls}"><input type="number" step="1" min="0" value="${val}"
          oninput="App.fuelCellInput('${sourceType}',${asgn.id},'${dk}',this.value,'${existingFt}',${eId})"></td>`;
      }).join('');

      return `<tr>
        <td class="role-name-cell" style="min-width:160px;max-width:195px">
          <div style="font-weight:600;font-size:.73rem;color:var(--text-0);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(vName)}</div>
          <div style="font-size:.62rem;color:var(--text-4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(fName)}</div>
          <select class="fuel-type-sel" onchange="App.fuelRowTypeChange('${sourceType}',${asgn.id},this.value)">
            <option value="DIESEL"${existingFt==='DIESEL'?' selected':''}>DIESEL</option>
            <option value="PETROL"${existingFt==='PETROL'?' selected':''}>PETROL</option>
          </select>
        </td>
        ${cells}
        <td class="role-name-cell" style="text-align:right;font-weight:700;color:var(--accent);font-size:.72rem;padding:.2rem .45rem">${rowTotal>0?Math.round(rowTotal).toLocaleString('fr-FR')+' L':''}</td>
      </tr>`;
    }).join('');

    // Total per day row
    const dayTotals = allDates.map(dk => {
      const isWe = [0,6].includes(new Date(dk+'T00:00:00').getDay());
      const tot = asgns.reduce((s,a) => {
        if (effectiveStatus(a,dk)!=='on') return s;
        return s + (entMap[`${a.id}:${dk}`]?.liters || 0);
      }, 0);
      return `<td style="text-align:center;font-size:.65rem;font-weight:700;padding:.1rem;
        color:${tot>0?'var(--accent)':'var(--border)'};${isWe?'background:rgba(0,0,0,.04)':''}">${tot>0?Math.round(tot):''}</td>`;
    }).join('');

    // Lock row
    const lockCells = allDates.map(dk => {
      const isWe = [0,6].includes(new Date(dk+'T00:00:00').getDay());
      const isLk = !!state.fuelLockedDays[dk];
      return `<td class="sch-lock-cell${isWe?' weekend-col':''}">
        <input type="checkbox" class="day-lock-cb"${isLk?' checked':''} onchange="App.fuelToggleDayLock('${dk}',this.checked)">
      </td>`;
    }).join('');

    const _scrollSaved = _saveScheduleScroll(container);
    container.innerHTML = `
      <div class="schedule-wrap">
        <table class="schedule-table">
          <thead>
            <tr><th class="role-name-cell"></th>${monthHdr}<th></th></tr>
            <tr><th class="role-name-cell"></th>${dayHdr}<th class="role-name-cell" style="font-size:.62rem;color:var(--text-4)">Total</th></tr>
          </thead>
          <tbody>
            ${rows}
            <tr class="schedule-count-row">
              <td class="role-name-cell" style="color:var(--text-3);font-size:.65rem">Total L/day</td>
              ${dayTotals}
              <td></td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="schedule-lock-row fuel-lock-row">
              <td class="role-name-cell sch-lock-label" title="Lock fuel day (read-only)">🔒 LOCK</td>
              ${lockCells}
              <td class="role-name-cell"></td>
            </tr>
          </tfoot>
        </table>
      </div>`;
    _restoreScheduleScroll(container, _scrollSaved);
  }

  // ── Cell input (debounced save) ────────────────────────────────────────────

  const _fuelTimers = {};
  function fuelCellInput(srcType, asgnId, date, value, ft, existingId) {
    const key = `${srcType}:${asgnId}:${date}`;
    clearTimeout(_fuelTimers[key]);
    _fuelTimers[key] = setTimeout(() => _saveFuelEntry(srcType, asgnId, date, value, ft, existingId), 600);
  }

  async function _saveFuelEntry(srcType, asgnId, date, value, ft, existingId) {
    const liters = parseFloat(value);
    if (isNaN(liters) && value !== '') return;
    if ((isNaN(liters) || liters === 0) && !existingId) return;
    try {
      const entry = await api('POST', `/api/productions/${state.prodId}/fuel-entries`, {
        source_type: srcType, assignment_id: asgnId, date,
        liters: isNaN(liters) ? 0 : liters, fuel_type: ft,
      });
      const idx = state.fuelEntries.findIndex(e => e.source_type===srcType && e.assignment_id===asgnId && e.date===date);
      if (idx >= 0) state.fuelEntries[idx] = entry;
      else state.fuelEntries.push(entry);
      // AXE 5.4: flash saved fuel cell
      const fuelCells = document.querySelectorAll('.fuel-data-cell');
      for (const td of fuelCells) {
        const inp = td.querySelector('input');
        if (inp && inp.getAttribute('oninput')?.includes(`'${srcType}',${asgnId},'${date}'`)) {
          _flashSaved(td); break;
        }
      }
    } catch(e) { /* silent */ }
  }

  // ── Fuel type row change ───────────────────────────────────────────────────

  async function fuelRowTypeChange(srcType, asgnId, newType) {
    const toUpdate = (state.fuelEntries||[]).filter(e => e.source_type===srcType && e.assignment_id===asgnId);
    await Promise.all(toUpdate.map(e =>
      api('POST', `/api/productions/${state.prodId}/fuel-entries`, { ...e, fuel_type: newType })
    ));
    state.fuelEntries = (state.fuelEntries||[]).map(e =>
      (e.source_type===srcType && e.assignment_id===asgnId) ? { ...e, fuel_type: newType } : e
    );
    renderFuelGrid(srcType);
  }

  // ── Auto-fill ──────────────────────────────────────────────────────────────

  async function fuelAutoFill(silent = false) {
    const src = state.fuelTab;
    if (!FUEL_DEFAULTS[src]) return;
    const defaultL = FUEL_DEFAULTS[src];
    const asgns = _fuelAsgns(src).filter(a => a.start_date && a.end_date);
    const map = _fuelEntMap(src);
    const toCreate = [];
    for (const asgn of asgns) {
      const _defFt = ['boats','picture_boats','security_boats'].includes(src) ? 'PETROL' : 'DIESEL';
      const ft = (state.fuelEntries||[]).find(e => e.source_type===src && e.assignment_id===asgn.id)?.fuel_type || _defFt;
      const _dk = d => { const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),dy=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dy}`; };
      const cur = new Date(SCHEDULE_START.getFullYear(), SCHEDULE_START.getMonth(), SCHEDULE_START.getDate());
      const end = new Date(SCHEDULE_END.getFullYear(),   SCHEDULE_END.getMonth(),   SCHEDULE_END.getDate());
      while (cur <= end) {
        const dk = _dk(cur);
        if (effectiveStatus(asgn,dk) && !state.fuelLockedDays[dk] && !map[`${asgn.id}:${dk}`])
          toCreate.push({ source_type:src, assignment_id:asgn.id, date:dk, liters:defaultL, fuel_type:ft });
        cur.setDate(cur.getDate()+1);
      }
    }
    if (!toCreate.length) { if (!silent) toast('No empty active cells to fill', 'info'); return; }
    await Promise.all(toCreate.map(e => api('POST', `/api/productions/${state.prodId}/fuel-entries`, e)));
    state.fuelEntries = await api('GET', `/api/productions/${state.prodId}/fuel-entries`);
    renderFuelGrid(src);
    if (!silent) toast(`${toCreate.length} cell${toCreate.length>1?'s':''} filled with ${defaultL} L`);
  }

  // ── Lock day ──────────────────────────────────────────────────────────────

  async function fuelToggleDayLock(date, locked) {
    if (locked) {
      // Snapshot current prices
      const dP = state.fuelPricePerL.DIESEL || 0;
      const pP = state.fuelPricePerL.PETROL || 0;
      state.fuelLockedDays[date] = true;
      state.fuelLockedPrices[date] = { diesel_price: dP, petrol_price: pP };
      try {
        await api('POST', '/api/fuel-locked-prices', { date, diesel_price: dP, petrol_price: pP });
      } catch(e) { console.warn('Failed to persist fuel lock:', e); }
    } else {
      delete state.fuelLockedDays[date];
      delete state.fuelLockedPrices[date];
      try {
        await api('DELETE', `/api/fuel-locked-prices/${date}`);
      } catch(e) { console.warn('Failed to persist fuel unlock:', e); }
    }
    try { localStorage.setItem('fuel_locked_days', JSON.stringify(state.fuelLockedDays)); } catch(e) {}
    const tab = state.fuelTab;
    if (['boats','picture_boats','security_boats','transport'].includes(tab)) renderFuelGrid(tab);
    else if (tab === 'machinery') renderFuelMachineryGrid();
  }

  // ── Machinery (proper day-by-day schedule grid — manual input) ────────────

  function renderFuelMachineryGrid() {
    const container = $('fuel-content');
    const machines = state.fuelMachinery || [];
    const addBtn = `<div style="padding:.75rem 1rem .5rem;display:flex;gap:.5rem;align-items:center">
      <button class="btn btn-sm btn-primary" onclick="App.showFuelMachineryModal()">+ Add machinery</button>
      <span style="font-size:.7rem;color:var(--text-4)">${machines.length} item${machines.length!==1?'s':''}</span>
    </div>`;
    if (!machines.length) {
      container.innerHTML = addBtn + `<div style="color:var(--text-4);font-size:.85rem;padding:.5rem 1rem">No machinery items yet. Add one to start entering fuel consumption.</div>`;
      return;
    }

    // Build fuel_entries map for machinery: key = machineryId:date
    const entMap = {};
    (state.fuelEntries || []).filter(e => e.source_type === 'machinery').forEach(e => {
      entMap[`${e.assignment_id}:${e.date}`] = e;
    });

    // Date range
    const allDates = [];
    { const c = new Date(SCHEDULE_START.getFullYear(), SCHEDULE_START.getMonth(), SCHEDULE_START.getDate());
      const e = new Date(SCHEDULE_END.getFullYear(),   SCHEDULE_END.getMonth(),   SCHEDULE_END.getDate());
      while (c <= e) { allDates.push(_localDk(c)); c.setDate(c.getDate()+1); } }

    // Month spans
    const monthSpans = [];
    let mCur = null, mN = 0;
    allDates.forEach(dk => {
      const m = dk.slice(0,7);
      if (m !== mCur) { if (mCur) monthSpans.push({m: mCur, n: mN}); mCur = m; mN = 1; } else mN++;
    });
    if (mCur) monthSpans.push({m: mCur, n: mN});

    const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthHdr = monthSpans.map(s => {
      const mo = parseInt(s.m.slice(5,7))-1;
      return `<th colspan="${s.n}" style="text-align:center;font-size:.62rem;color:var(--text-3);padding:.15rem;border-bottom:1px solid var(--border)">${MO[mo]} ${s.m.slice(0,4)}</th>`;
    }).join('');

    const pdtByDate = {};
    state.shootingDays.forEach(d => { pdtByDate[d.date] = d; });

    const dayHdr = allDates.map(dk => {
      const dLocal = new Date(dk+'T00:00:00');
      const isWe = [0,6].includes(dLocal.getDay());
      const isLk = !!state.fuelLockedDays[dk];
      return `<th class="schedule-day-th ${isWe ? 'weekend-col' : ''} ${pdtByDate[dk] ? 'has-pdt' : ''} ${isLk ? 'day-locked' : ''}"
    data-date="${dk}"
    onmouseenter="App.showDateTooltip(event,'${dk}')"
    onmouseleave="App.hidePDTTooltip()"
  >${dLocal.getDate()}</th>`;
    }).join('');

    // Machine rows
    const rows = machines.map(machine => {
      const ft = machine.fuel_type || 'DIESEL';
      let rowTotal = 0;

      const cells = allDates.map(dk => {
        const isWe = [0,6].includes(new Date(dk+'T00:00:00').getDay());
        const isLocked = !!state.fuelLockedDays[dk];
        const entry = entMap[`${machine.id}:${dk}`];
        if (entry?.liters) rowTotal += entry.liters;

        const weCls = isWe ? ' weekend-col' : '';
        const val = entry ? entry.liters : '';
        const eId = entry ? entry.id : 'null';
        if (isLocked) return `<td class="fuel-data-cell fuel-locked${weCls}"><input type="number" disabled value="${val}"></td>`;
        return `<td class="fuel-data-cell${weCls}"><input type="number" step="1" min="0" value="${val}"
          oninput="App.fuelMachineryCellInput(${machine.id},'${dk}',this.value,'${ft}',${eId})"></td>`;
      }).join('');

      return `<tr>
        <td class="role-name-cell" style="min-width:170px;max-width:210px">
          <div style="display:flex;align-items:center;gap:.35rem;margin-bottom:.15rem">
            <span style="font-weight:600;font-size:.73rem;color:var(--text-0);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1">${esc(machine.name)}</span>
            <button class="btn btn-sm btn-secondary btn-icon" style="padding:0 .2rem;font-size:.65rem;line-height:1" onclick="App.showFuelMachineryModal(${machine.id})" title="Edit">&#9998;</button>
            <button class="btn btn-sm btn-danger btn-icon" style="padding:0 .2rem;font-size:.65rem;line-height:1" onclick="App.deleteFuelMachinery(${machine.id})" title="Delete">&times;</button>
          </div>
          <div style="display:flex;align-items:center;gap:.35rem">
            <span style="font-size:.62rem;font-weight:700;padding:.1rem .3rem;border-radius:3px;
              background:${ft==='PETROL'?'rgba(249,115,22,.15)':'rgba(59,130,246,.15)'};
              color:${ft==='PETROL'?'#F97316':'#3B82F6'}">${ft}</span>
            <select class="fuel-type-sel" style="font-size:.62rem" onchange="App.fuelMachineryRowTypeChange(${machine.id},this.value)">
              <option value="DIESEL"${ft==='DIESEL'?' selected':''}>DIESEL</option>
              <option value="PETROL"${ft==='PETROL'?' selected':''}>PETROL</option>
            </select>
            ${machine.notes ? `<span style="font-size:.58rem;color:var(--text-4);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:80px" title="${esc(machine.notes||'')}">${esc(machine.notes||'')}</span>` : ''}
          </div>
        </td>
        ${cells}
        <td class="role-name-cell" style="text-align:right;font-weight:700;color:var(--accent);font-size:.72rem;padding:.2rem .45rem">${rowTotal>0?Math.round(rowTotal).toLocaleString('fr-FR')+' L':''}</td>
      </tr>`;
    }).join('');

    // Total per day row
    const dayTotals = allDates.map(dk => {
      const isWe = [0,6].includes(new Date(dk+'T00:00:00').getDay());
      const tot = machines.reduce((s, m) => s + (entMap[`${m.id}:${dk}`]?.liters || 0), 0);
      return `<td style="text-align:center;font-size:.65rem;font-weight:700;padding:.1rem;
        color:${tot>0?'var(--accent)':'var(--border)'};${isWe?'background:rgba(0,0,0,.04)':''}">${tot>0?Math.round(tot):''}</td>`;
    }).join('');

    // Lock row
    const lockCells = allDates.map(dk => {
      const isWe = [0,6].includes(new Date(dk+'T00:00:00').getDay());
      const isLk = !!state.fuelLockedDays[dk];
      return `<td class="sch-lock-cell${isWe?' weekend-col':''}">
        <input type="checkbox" class="day-lock-cb"${isLk?' checked':''} onchange="App.fuelToggleDayLock('${dk}',this.checked)">
      </td>`;
    }).join('');

    const _scrollSaved = _saveScheduleScroll(container);
    container.innerHTML = addBtn + `
      <div class="schedule-wrap">
        <table class="schedule-table">
          <thead>
            <tr><th class="role-name-cell"></th>${monthHdr}<th></th></tr>
            <tr><th class="role-name-cell"></th>${dayHdr}<th class="role-name-cell" style="font-size:.62rem;color:var(--text-4)">Total</th></tr>
          </thead>
          <tbody>
            ${rows}
            <tr class="schedule-count-row">
              <td class="role-name-cell" style="color:var(--text-3);font-size:.65rem">Total L/day</td>
              ${dayTotals}
              <td></td>
            </tr>
          </tbody>
          <tfoot>
            <tr class="schedule-lock-row fuel-lock-row">
              <td class="role-name-cell sch-lock-label" title="Lock fuel day (read-only)">&#128274; LOCK</td>
              ${lockCells}
              <td class="role-name-cell"></td>
            </tr>
          </tfoot>
        </table>
      </div>`;
    _restoreScheduleScroll(container, _scrollSaved);
  }

  // Machinery cell input (debounced) — uses same fuel_entries table with source_type='machinery'
  function fuelMachineryCellInput(machineId, date, value, ft, existingId) {
    const key = `machinery:${machineId}:${date}`;
    clearTimeout(_fuelTimers[key]);
    _fuelTimers[key] = setTimeout(() => _saveFuelEntry('machinery', machineId, date, value, ft, existingId), 600);
  }

  // Change fuel type for all entries of a machinery row + update the machinery record itself
  async function fuelMachineryRowTypeChange(machineId, newType) {
    // Update all existing fuel entries for this machine
    const toUpdate = (state.fuelEntries||[]).filter(e => e.source_type==='machinery' && e.assignment_id===machineId);
    await Promise.all(toUpdate.map(e =>
      api('POST', `/api/productions/${state.prodId}/fuel-entries`, { ...e, fuel_type: newType })
    ));
    state.fuelEntries = (state.fuelEntries||[]).map(e =>
      (e.source_type==='machinery' && e.assignment_id===machineId) ? { ...e, fuel_type: newType } : e
    );
    // Also update the machinery record's fuel_type
    try {
      const updated = await api('PUT', `/api/fuel-machinery/${machineId}`, { fuel_type: newType });
      const idx = (state.fuelMachinery||[]).findIndex(m => m.id === machineId);
      if (idx >= 0) state.fuelMachinery[idx] = updated;
    } catch(e) { /* silent */ }
    renderFuelMachineryGrid();
  }

  function showFuelMachineryModal(editId) {
    $('fm-name').value = ''; $('fm-fuel-type').value = 'DIESEL';
    $('fm-lpd').value = ''; $('fm-start').value = ''; $('fm-end').value = ''; $('fm-notes').value = '';
    $('fm-edit-id').value = editId || '';
    if (editId) {
      const m = (state.fuelMachinery||[]).find(x => x.id === editId);
      if (m) {
        $('fm-name').value = m.name||''; $('fm-fuel-type').value = m.fuel_type||'DIESEL';
        $('fm-lpd').value = m.liters_per_day||''; $('fm-start').value = m.start_date||'';
        $('fm-end').value = m.end_date||''; $('fm-notes').value = m.notes||'';
      }
      $('fuel-machinery-modal-title').textContent = 'Edit Machinery';
      $('fm-confirm-btn').textContent = 'Save';
    } else {
      $('fuel-machinery-modal-title').textContent = 'Add Machinery';
      $('fm-confirm-btn').textContent = 'Add';
    }
    $('fuel-machinery-modal').classList.remove('hidden');
    setTimeout(() => $('fm-name').focus(), 80);
  }

  function closeFuelMachineryModal() {
    $('fuel-machinery-modal').classList.add('hidden');
  }

  async function confirmFuelMachineryModal() {
    const name = $('fm-name').value.trim();
    if (!name) { toast('Name is required', 'error'); return; }
    const data = {
      name,
      fuel_type:      $('fm-fuel-type').value,
      liters_per_day: parseFloat($('fm-lpd').value) || 0,
      start_date:     $('fm-start').value || null,
      end_date:       $('fm-end').value   || null,
      notes:          $('fm-notes').value.trim() || null,
    };
    const editId = parseInt($('fm-edit-id').value) || null;
    try {
      if (editId) {
        const updated = await api('PUT', `/api/fuel-machinery/${editId}`, data);
        const idx = (state.fuelMachinery||[]).findIndex(m => m.id === editId);
        if (idx >= 0) state.fuelMachinery[idx] = updated;
        toast('Machinery updated');
      } else {
        const created = await api('POST', `/api/productions/${state.prodId}/fuel-machinery`, data);
        state.fuelMachinery.push(created);
        toast('Machinery added');
      }
      closeFuelMachineryModal();
      renderFuelMachineryGrid();
    } catch(e) { toast('Error: ' + e.message, 'error'); }
  }

  async function deleteFuelMachinery(id) {
    showConfirm('Delete this machinery row?', async () => {
      await api('DELETE', `/api/fuel-machinery/${id}`);
      state.fuelMachinery = (state.fuelMachinery||[]).filter(m => m.id !== id);
      renderFuelMachineryGrid();
      toast('Deleted');
    });
  }

  // ── Fuel Budget ────────────────────────────────────────────────────────────

  function renderFuelBudget() {
    const container = $('fuel-content');
    const cats = ['boats','picture_boats','security_boats','transport'];
    const catLabels = { boats:'BOATS', picture_boats:'PICTURE BOATS', security_boats:'SECURITY BOATS', transport:'TRANSPORT', machinery:'MACHINERY' };

    const pD = state.fuelPricePerL.DIESEL || 0;
    const pP = state.fuelPricePerL.PETROL || 0;

    // Compute per-category: litres + cost split by locked (Up to Date) vs unlocked (Estimate)
    const catData = {};
    cats.forEach(cat => {
      const es = (state.fuelEntries||[]).filter(e => e.source_type === cat);
      let diesel = 0, petrol = 0, costUtd = 0, costEst = 0;
      es.forEach(e => {
        const l = e.liters || 0;
        const ft = e.fuel_type || 'DIESEL';
        const d = e.date || '';
        if (ft === 'PETROL') petrol += l; else diesel += l;
        // Locked day: use snapshot price; unlocked: use current price
        if (state.fuelLockedPrices[d]) {
          const lp = state.fuelLockedPrices[d];
          costUtd += l * (ft === 'PETROL' ? (lp.petrol_price||0) : (lp.diesel_price||0));
        } else {
          costEst += l * (ft === 'PETROL' ? pP : pD);
        }
      });
      catData[cat] = { diesel: Math.round(diesel), petrol: Math.round(petrol), total: Math.round(diesel+petrol), costUtd: Math.round(costUtd), costEst: Math.round(costEst) };
    });

    // Machinery — computed from actual fuel_entries (source_type='machinery'), same as other categories
    {
      const es = (state.fuelEntries||[]).filter(e => e.source_type === 'machinery');
      let diesel = 0, petrol = 0, costUtd = 0, costEst = 0;
      es.forEach(e => {
        const l = e.liters || 0;
        const ft = e.fuel_type || 'DIESEL';
        const d = e.date || '';
        if (ft === 'PETROL') petrol += l; else diesel += l;
        if (state.fuelLockedPrices[d]) {
          const lp = state.fuelLockedPrices[d];
          costUtd += l * (ft === 'PETROL' ? (lp.petrol_price||0) : (lp.diesel_price||0));
        } else {
          costEst += l * (ft === 'PETROL' ? pP : pD);
        }
      });
      catData['machinery'] = { diesel: Math.round(diesel), petrol: Math.round(petrol), total: Math.round(diesel+petrol), costUtd: Math.round(costUtd), costEst: Math.round(costEst) };
    }

    const allCats = [...cats, 'machinery'];
    const gD = allCats.reduce((s,c) => s+catData[c].diesel, 0);
    const gP = allCats.reduce((s,c) => s+catData[c].petrol, 0);
    const gT = gD + gP;
    const gUtd = allCats.reduce((s,c) => s+catData[c].costUtd, 0);
    const gEst = allCats.reduce((s,c) => s+catData[c].costEst, 0);
    const gTotal = gUtd + gEst;

    // Compute average price per fuel type across all entries
    let dieselCostTotal = 0, petrolCostTotal = 0;
    (state.fuelEntries||[]).forEach(e => {
      const l = e.liters || 0;
      const ft = e.fuel_type || 'DIESEL';
      const d = e.date || '';
      let price;
      if (state.fuelLockedPrices[d]) {
        const lp = state.fuelLockedPrices[d];
        price = ft === 'PETROL' ? (lp.petrol_price||0) : (lp.diesel_price||0);
      } else {
        price = ft === 'PETROL' ? pP : pD;
      }
      if (ft === 'PETROL') petrolCostTotal += l * price;
      else dieselCostTotal += l * price;
    });
    const avgDiesel = gD > 0 ? dieselCostTotal / gD : 0;
    const avgPetrol = gP > 0 ? petrolCostTotal / gP : 0;

    const fmtL = l => l > 0 ? l.toLocaleString('fr-FR')+' L' : '---';
    const fmtC = c => c > 0 ? '$'+c.toLocaleString('fr-FR') : '---';

    const cards = `<div class="stat-grid" style="margin-bottom:.75rem">
      <div class="stat-card" style="border:1px solid #3B82F6;background:rgba(59,130,246,.06)">
        <div class="stat-val" style="color:#3B82F6">${fmtL(gD)}</div>
        <div class="stat-lbl">TOTAL DIESEL</div>
      </div>
      <div class="stat-card" style="border:1px solid #F97316;background:rgba(249,115,22,.06)">
        <div class="stat-val" style="color:#F97316">${fmtL(gP)}</div>
        <div class="stat-lbl">TOTAL PETROL</div>
      </div>
      <div class="stat-card" style="border:1px solid var(--border)">
        <div class="stat-val">${fmtL(gT)}</div>
        <div class="stat-lbl">TOTAL LITRES</div>
      </div>
      <div class="stat-card" style="border:1px solid #10B981;background:rgba(16,185,129,.07)">
        <div class="stat-val" style="color:#10B981">${fmtC(gUtd)}</div>
        <div class="stat-lbl">UP TO DATE (locked)</div>
      </div>
      <div class="stat-card" style="border:1px solid #F59E0B;background:rgba(245,158,11,.07)">
        <div class="stat-val" style="color:#F59E0B">${fmtC(gEst)}</div>
        <div class="stat-lbl">ESTIMATE (unlocked)</div>
      </div>
      ${gTotal>0?`<div class="stat-card" style="border:1px solid var(--green);background:rgba(34,197,94,.07)">
        <div class="stat-val" style="color:var(--green)">${fmtC(gTotal)}</div>
        <div class="stat-lbl">TOTAL COST</div>
      </div>`:''}
    </div>`;

    const priceInputs = `<div style="display:flex;gap:1rem;align-items:center;margin-bottom:1rem;flex-wrap:wrap">
      <span style="font-size:.75rem;color:var(--text-3);font-weight:600">Fuel prices :</span>
      <label style="display:flex;align-items:center;gap:.35rem;font-size:.75rem;color:var(--text-2)">DIESEL
        <input type="number" step="0.01" min="0" value="${pD||''}" placeholder="0.00" onchange="App.fuelPriceChange('DIESEL',this.value)"
          style="width:64px;font-size:.75rem;padding:.2rem .35rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:4px;color:var(--text-0);text-align:right"> $/L
      </label>
      <label style="display:flex;align-items:center;gap:.35rem;font-size:.75rem;color:var(--text-2)">PETROL
        <input type="number" step="0.01" min="0" value="${pP||''}" placeholder="0.00" onchange="App.fuelPriceChange('PETROL',this.value)"
          style="width:64px;font-size:.75rem;padding:.2rem .35rem;background:var(--bg-surface);border:1px solid var(--border);border-radius:4px;color:var(--text-0);text-align:right"> $/L
      </label>
      <div style="flex:1"></div>
      <button class="btn btn-sm btn-primary" onclick="App.fuelBudgetExportCSV()">Export CSV</button>
    </div>`;

    const tableRows = allCats.map((cat,i) => {
      const d = catData[cat];
      return `<tr style="${i%2?'background:var(--bg-surface)':''}">
        <td style="font-weight:600;color:var(--text-0)">${catLabels[cat]}</td>
        <td style="text-align:right;color:#3B82F6">${fmtL(d.diesel)}</td>
        <td style="text-align:right;color:#F97316">${fmtL(d.petrol)}</td>
        <td style="text-align:right;font-weight:700;color:var(--text-1)">${fmtL(d.total)}</td>
        <td style="text-align:right;color:#10B981">${d.costUtd>0?fmtC(d.costUtd):'---'}</td>
        <td style="text-align:right;color:#F59E0B">${d.costEst>0?fmtC(d.costEst):'---'}</td>
        <td style="text-align:right;color:var(--green);font-weight:600">${(d.costUtd+d.costEst)>0?fmtC(d.costUtd+d.costEst):'---'}</td>
      </tr>`;
    }).join('');

    const lockedCount = Object.keys(state.fuelLockedPrices).length;
    const lockedNote = lockedCount > 0
      ? `<div style="font-size:.7rem;color:var(--text-4);margin-top:.5rem">${lockedCount} day${lockedCount>1?'s':''} locked with frozen prices. Up to Date = actual cost at lock-time price. Estimate = projected cost at current price.</div>`
      : `<div style="font-size:.7rem;color:var(--text-4);margin-top:.5rem">No days locked yet. Lock days in the schedule sub-tabs to freeze their fuel cost at the current price.</div>`;

    container.innerHTML = `<div style="padding:1rem">
      ${cards}${priceInputs}
      <div class="budget-dept-card">
        <table class="budget-table">
          <thead><tr>
            <th style="text-align:left">Category</th>
            <th style="text-align:right">DIESEL (L)</th>
            <th style="text-align:right">PETROL (L)</th>
            <th style="text-align:right">Total (L)</th>
            <th style="text-align:right">Up to Date ($)</th>
            <th style="text-align:right">Estimate ($)</th>
            <th style="text-align:right">Total ($)</th>
          </tr></thead>
          <tbody>
            ${tableRows}
            <tr class="budget-total-row">
              <td style="text-align:right;color:var(--text-1)">GRAND TOTAL</td>
              <td style="text-align:right;color:#3B82F6;font-weight:700">${fmtL(gD)}</td>
              <td style="text-align:right;color:#F97316;font-weight:700">${fmtL(gP)}</td>
              <td style="text-align:right;font-weight:700;color:var(--text-0);font-size:1.05rem">${fmtL(gT)}</td>
              <td style="text-align:right;color:#10B981;font-weight:700">${fmtC(gUtd)}</td>
              <td style="text-align:right;color:#F59E0B;font-weight:700">${fmtC(gEst)}</td>
              <td style="text-align:right;color:var(--green);font-weight:700;font-size:1.05rem">${fmtC(gTotal)}</td>
            </tr>
            <tr style="border-top:1px solid var(--border)">
              <td colspan="6" style="text-align:right;font-size:.75rem;color:#3B82F6;font-weight:600">AVG DIESEL PRICE / L</td>
              <td style="text-align:right;font-size:.75rem;color:#3B82F6;font-weight:600">${avgDiesel > 0 ? '$'+avgDiesel.toFixed(4) : '---'}</td>
            </tr>
            <tr>
              <td colspan="6" style="text-align:right;font-size:.75rem;color:#F97316;font-weight:600">AVG PETROL PRICE / L</td>
              <td style="text-align:right;font-size:.75rem;color:#F97316;font-weight:600">${avgPetrol > 0 ? '$'+avgPetrol.toFixed(4) : '---'}</td>
            </tr>
          </tbody>
        </table>
      </div>
      ${lockedNote}
    </div>`;
  }

  async function fuelPriceChange(type, val) {
    state.fuelPricePerL[type] = parseFloat(val) || 0;
    try { localStorage.setItem('fuel_price_per_l', JSON.stringify(state.fuelPricePerL)); } catch(e) {}
    // Persist to DB
    try {
      const payload = type === 'DIESEL' ? { diesel: state.fuelPricePerL.DIESEL } : { petrol: state.fuelPricePerL.PETROL };
      await api('PUT', '/api/fuel-prices', payload);
    } catch(e) { /* silent */ }
    _renderFuelPriceBar();
    renderFuelBudget();
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  // ── Fuel Budget Export (KLAS7_FUEL_YYMMDD.csv) ─────────────────────────────

  function fuelBudgetExportCSV() {
    authDownload(`/api/productions/${state.prodId}/export/fuel-budget/csv`);
  }

  function fuelToggleExport() {
    $('fuel-exp-menu').classList.toggle('hidden');
  }

  function fuelExportCSV() {
    authDownload(`/api/productions/${state.prodId}/export/fuel/csv`);
    $('fuel-exp-menu').classList.add('hidden');
  }

  function fuelExportJSON() {
    authDownload(`/api/productions/${state.prodId}/export/fuel/json`);
    $('fuel-exp-menu').classList.add('hidden');
  }

  // ═══════════════════════════════════════════════════════════
  //  CONFIRM DIALOG
  // ═══════════════════════════════════════════════════════════

  function showConfirm(msg, callback) {
    $('confirm-msg').textContent = msg;
    state.confirmCallback = callback;
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
  //  LABOUR MODULE (ex-HELPERS) — aligned with BOATS pattern
  // ═══════════════════════════════════════════════════════════

  const DEFAULT_LB_GROUPS = [
    { name: 'ART',         color: '#F97316' },
    { name: 'BASECAMP',    color: '#22C55E' },
    { name: 'GAMES',       color: '#3B82F6' },
    { name: 'REALITY',     color: '#8B5CF6' },
    { name: 'SAFETY',      color: '#EF4444' },
    { name: 'TECH',        color: '#06B6D4' },
    { name: 'BODY DOUBLE', color: '#EC4899' },
    { name: 'GENERAL',     color: '#94A3B8' },
  ];

  // Labour state
  Object.assign(state, {
    labourWorkers:     [],
    labourFunctions:   [],
    labourAssignments: [],
    lbView:            'cards',
    lbWorkerFilter:    'all',
    lbSelectedWorker:  null,
    lbDragWorker:      null,
    lbPendingFuncId:   null,
    lbPendingDate:     null,
    lbLockedDays:      {},
    lbGroups:          DEFAULT_LB_GROUPS,
  });

  async function _loadAndRenderLabour() {
    // AXE 5.4: show loading skeletons
    const rg = $('lb-role-groups'); if (rg) rg.innerHTML = _skeletonCards(3);
    const sc = $('lb-schedule-container'); if (sc) sc.innerHTML = _skeletonTable();
    try {
      const [workers, functions, assignments] = await Promise.all([
        api('GET', `/api/productions/${state.prodId}/helpers`),
        api('GET', `/api/productions/${state.prodId}/boat-functions?context=labour`),
        api('GET', `/api/productions/${state.prodId}/helper-assignments`),
      ]);
      state.labourWorkers     = workers;
      state.labourFunctions   = functions;
      state.labourAssignments = assignments;
    } catch(e) { toast('Error loading labour: ' + e.message, 'error'); }
    renderLabour();
  }

  function renderLabour() {
    renderLbWorkerList();
    if (state.lbView === 'cards')         renderLbRoleCards();
    else if (state.lbView === 'schedule') renderLbSchedule();
    else if (state.lbView === 'budget')   renderLbBudget();
  }

  function lbSetView(view) {
    state.lbView = view;
    closeSchedulePopover();
    ['cards','schedule','budget'].forEach(v => {
      $(`lb-view-${v}`)?.classList.toggle('hidden', v !== view);
      $(`lb-btab-${v}`)?.classList.toggle('active', v === view);
    });
    renderLabour();
    _updateBreadcrumb(view.charAt(0).toUpperCase() + view.slice(1));
  }

  // ── Worker sidebar ───────────────────────────────────────────
  function lbFilterWorkers(f) {
    state.lbWorkerFilter = f;
    ['all','available','assigned'].forEach(id => {
      $(`lb-filter-${id}`)?.classList.toggle('active', id === f);
    });
    renderLbWorkerList();
  }

  function _lbFilteredWorkers() {
    const assignedIds = new Set(state.labourAssignments.filter(a => a.helper_id).map(a => a.helper_id));
    let workers = [...state.labourWorkers];
    if      (state.lbWorkerFilter === 'available') workers = workers.filter(w => !assignedIds.has(w.id));
    else if (state.lbWorkerFilter === 'assigned')  workers = workers.filter(w => assignedIds.has(w.id));
    workers.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return workers;
  }

  function _lbAssignmentsForFunc(funcId) {
    return state.labourAssignments.filter(a => a.boat_function_id === funcId);
  }

  function renderLbWorkerList() {
    const workers = _lbFilteredWorkers();
    const assignedIds = new Set(state.labourAssignments.filter(a => a.helper_id).map(a => a.helper_id));
    const container = $('lb-worker-list');
    if (!container) return;
    if (!workers.length) {
      container.innerHTML = '<div style="color:var(--text-4);font-size:.8rem;text-align:center;padding:1rem">No workers</div>';
      return;
    }
    container.innerHTML = workers.map(w => {
      const isAssigned = assignedIds.has(w.id);
      const wAsgns = state.labourAssignments.filter(a => a.helper_id === w.id);
      const groupColor = _groupColor('labour', w.group_name || 'GENERAL');
      const rateVal = w.daily_rate_estimate || 0;
      const rate = `<div class="lb-rate-display" style="font-size:.65rem;color:${rateVal > 0 ? 'var(--green)' : 'var(--text-4)'};margin-top:.1rem;cursor:pointer;display:inline-flex;align-items:center;gap:.2rem"
        onclick="event.stopPropagation();App.lbStartInlineRateEdit(${w.id},this)"
        title="Click to edit rate">${rateVal > 0 ? '$' + Math.round(rateVal).toLocaleString('en-US') + '/d' : '+ set rate'}<span style="font-size:.55rem;opacity:.5">&#x270E;</span></div>`;
      return `<div class="boat-card ${isAssigned ? 'assigned' : ''}"
        id="lb-worker-card-${w.id}"
        draggable="true"
        ondragstart="App.lbOnWorkerDragStart(event,${w.id})"
        ondragend="App.lbOnWorkerDragEnd()"
        onclick="App.lbOpenWorkerView(${w.id})">
        <div class="boat-thumb-wrap">
          <div class="boat-thumb-placeholder" style="background:${groupColor}22;color:${groupColor};font-size:.6rem">${esc((w.name || '?').slice(0, 2).toUpperCase())}</div>
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:baseline;gap:.3rem;margin-bottom:.2rem;flex-wrap:wrap">
            <span style="font-weight:700;font-size:.82rem;color:var(--text-0);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(w.name)}</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:.2rem;align-items:center;margin-bottom:.1rem">
            <span style="font-size:.6rem;font-weight:700;padding:.15rem .4rem;border-radius:4px;background:${groupColor}22;color:${groupColor};text-transform:uppercase;letter-spacing:.04em">${esc(w.group_name || 'GENERAL')}</span>
          </div>
          ${w.role ? `<div style="font-size:.65rem;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(w.role)}</div>` : ''}
          ${rate}
          ${isAssigned && wAsgns.length ? `<div style="font-size:.6rem;color:var(--accent);margin-top:.1rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">&rarr; ${wAsgns.map(a => esc(a.function_name || '')).join(', ')}</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:.15rem;flex-shrink:0;align-self:flex-start">
          <button class="boat-edit-btn" title="Edit worker"
            onclick="event.stopPropagation();App.openWorkerDetail(${w.id})">&#x270E;</button>
          <button class="card-delete-btn" title="Delete worker"
            onclick="event.stopPropagation();App.confirmDeleteWorker(${w.id},'${esc(w.name).replace(/'/g,"\\'")}',${wAsgns.length})">&#x1F5D1;</button>
        </div>
      </div>`;
    }).join('');
  }

  // ── Delete worker from card ──────────────────────────────
  function confirmDeleteWorker(workerId, workerName, assignmentCount) {
    const impact = assignmentCount > 0 ? `\n${assignmentCount} assignment(s) will also be deleted.` : '';
    showConfirm(`Delete worker "${workerName}"?${impact}`, async () => {
      try {
        await api('DELETE', `/api/helpers/${workerId}`);
        state.labourWorkers = state.labourWorkers.filter(w => w.id !== workerId);
        state.labourAssignments = state.labourAssignments.filter(a => a.helper_id !== workerId);
        closeBoatDetail();
        renderLabour();
        toast('Worker deleted');
      } catch (e) { toast('Error: ' + e.message, 'error'); }
    });
  }

  // ── Inline rate editing (Labour) ──────────────────────────────
  function lbStartInlineRateEdit(workerId, el) {
    const worker = state.labourWorkers.find(w => w.id === workerId);
    if (!worker) return;
    const curRate = worker.daily_rate_estimate || 0;
    el.innerHTML = `<input type="number" step="1" min="0" value="${curRate}"
      style="width:70px;font-size:.7rem;padding:.15rem .3rem;background:var(--bg-input);color:var(--text-0);border:1px solid var(--accent);border-radius:4px;outline:none"
      onclick="event.stopPropagation()"
      onkeydown="if(event.key==='Enter'){event.preventDefault();App.lbSaveWorkerRate(${workerId},this.value);}if(event.key==='Escape'){App.renderLbWorkerList();}"
      onblur="App.lbSaveWorkerRate(${workerId},this.value)">`;
    const input = el.querySelector('input');
    if (input) { input.focus(); input.select(); }
  }

  async function lbSaveWorkerRate(workerId, rawValue) {
    const newRate = parseFloat(rawValue) || 0;
    const worker = state.labourWorkers.find(w => w.id === workerId);
    if (!worker) return;
    if (newRate === (worker.daily_rate_estimate || 0)) {
      renderLbWorkerList();
      return;
    }
    try {
      const updated = await api('PUT', `/api/helpers/${workerId}`, {
        name: worker.name,
        daily_rate_estimate: newRate,
      });
      const idx = state.labourWorkers.findIndex(w => w.id === workerId);
      if (idx >= 0) state.labourWorkers[idx] = { ...state.labourWorkers[idx], ...updated };
      toast(`Rate updated: $${Math.round(newRate)}/day`);
      renderLabour();
    } catch (e) {
      toast('Error saving rate: ' + e.message, 'error');
      renderLbWorkerList();
    }
  }

  // ── Role / function cards (Labour) ─────────────────────────────
  function renderLbRoleCards() {
    const container = $('lb-role-groups');
    if (!container) return;
    const grouped = {};
    _groupOrder('labour').forEach(g => { grouped[g] = []; });
    state.labourFunctions.forEach(f => {
      const g = f.function_group || 'GENERAL';
      if (!grouped[g]) grouped[g] = [];
      grouped[g].push(f);
    });
    let html = '';
    _groupOrder('labour').forEach(group => {
      const funcs = grouped[group];
      if (!funcs.length) return;
      const color = _groupColor('labour', group);
      html += `
        <div class="role-group-header" style="background:${color}18;border-left:3px solid ${color}">
          <span style="color:${color}">&bull;</span>
          <span style="color:${color}">${esc(group)}</span>
          <span style="color:var(--text-4);font-weight:400;font-size:.65rem;text-transform:none;letter-spacing:0">${funcs.length} function${funcs.length > 1 ? 's' : ''}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:.5rem;margin-bottom:.75rem">
          ${funcs.map(f => renderLbRoleCard(f, color)).join('')}
        </div>`;
    });
    container.innerHTML = html || '<div style="color:var(--text-4);text-align:center;padding:3rem">No functions. Click + Function to add one.</div>';
  }

  function renderLbRoleCard(func, color) {
    const asgns = _lbAssignmentsForFunc(func.id);
    const assignedBodies = asgns.map(asgn => {
      const workerName = asgn.helper_name_override || asgn.helper_name || '?';
      const wd   = computeWd(asgn);
      const rate = asgn.price_override || asgn.helper_daily_rate_estimate || 0;
      const total = Math.round(wd * rate);
      return `<div class="assigned-mini" style="margin-bottom:.35rem">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;margin-bottom:.2rem">
              <span style="font-weight:600;color:var(--text-0);font-size:.82rem">${esc(workerName)}</span>
              ${asgn.helper_role ? `<span style="color:var(--text-3);font-size:.7rem">&middot; ${esc(asgn.helper_role)}</span>` : ''}
            </div>
            <div style="font-size:.7rem;color:var(--text-3)">${fmtDate(asgn.start_date)} &rarr; ${fmtDate(asgn.end_date)} &middot; ${wd}d &middot; ${fmtMoney(total)}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:.2rem">
            <button class="btn btn-sm btn-secondary btn-icon" onclick="App.lbEditAssignmentById(${asgn.id})" title="Edit">&#x270E;</button>
            <button class="btn btn-sm btn-danger btn-icon" onclick="App.lbRemoveAssignmentById(${asgn.id})" title="Remove">&times;</button>
          </div>
        </div>
      </div>`;
    });
    const dropZone = `<div class="drop-zone" id="lb-drop-${func.id}"
      ondragover="App.lbOnDragOver(event,${func.id})"
      ondragleave="App.lbOnDragLeave(event,${func.id})"
      ondrop="App.lbOnDrop(event,${func.id})"
      onclick="App.lbOnDropZoneClick(${func.id})"
      style="${asgns.length ? 'margin-top:.3rem;padding:.35rem;font-size:.7rem' : ''}">
      ${state.lbSelectedWorker
        ? `<span style="color:var(--accent)">Click to assign <strong>${esc(state.lbSelectedWorker.name)}</strong></span>`
        : (asgns.length ? '<span>+ Add another assignment</span>' : '<span>Drop or click a worker to assign</span>')}
    </div>`;
    return `<div class="role-card" id="lb-role-card-${func.id}"
      style="border-top:3px solid ${color}"
      ondragover="App.lbOnDragOver(event,${func.id})"
      ondragleave="App.lbOnDragLeave(event,${func.id})"
      ondrop="App.lbOnDrop(event,${func.id})">
      <div class="role-card-header">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;color:var(--text-0);font-size:.85rem">${esc(func.name)}</div>
          ${func.specs ? `<div style="font-size:.7rem;color:var(--text-4);margin-top:.1rem">${esc(func.specs)}</div>` : ''}
        </div>
        <button onclick="App.lbConfirmDeleteFunc(${func.id})"
          style="color:var(--text-4);background:none;border:none;cursor:pointer;font-size:.9rem;padding:.2rem"
          title="Delete">&times;</button>
      </div>
      <div class="role-card-body">${assignedBodies.join('') + dropZone}</div>
    </div>`;
  }

  // ── Drag & drop (Labour) ───────────────────────────────────────
  function lbOnWorkerDragStart(event, workerId) {
    state.lbDragWorker = state.labourWorkers.find(w => w.id === workerId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', workerId);
    document.getElementById(`lb-worker-card-${workerId}`)?.classList.add('dragging');
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.textContent = state.lbDragWorker?.name || 'Worker';
    document.body.appendChild(ghost);
    event.dataTransfer.setDragImage(ghost, 60, 15);
    setTimeout(() => ghost.remove(), 0);
  }
  function lbOnWorkerDragEnd() {
    state.lbDragWorker = null;
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  }
  function lbOnDragOver(event, funcId) {
    event.preventDefault();
    document.getElementById(`lb-role-card-${funcId}`)?.classList.add('drag-over');
    document.getElementById(`lb-drop-${funcId}`)?.classList.add('drag-over');
  }
  function lbOnDragLeave(event, funcId) {
    document.getElementById(`lb-role-card-${funcId}`)?.classList.remove('drag-over');
    document.getElementById(`lb-drop-${funcId}`)?.classList.remove('drag-over');
  }
  function lbOnDrop(event, funcId) {
    event.preventDefault();
    document.getElementById(`lb-role-card-${funcId}`)?.classList.remove('drag-over');
    document.getElementById(`lb-drop-${funcId}`)?.classList.remove('drag-over');
    const worker = state.lbDragWorker;
    if (!worker) return;
    state.lbDragWorker = null;
    _tabCtx = 'labour';
    openAssignModal(funcId, { id: worker.id, name: worker.name, daily_rate_estimate: worker.daily_rate_estimate || 0 });
  }
  function lbOnDropZoneClick(funcId) {
    if (state.lbSelectedWorker) {
      _tabCtx = 'labour';
      openAssignModal(funcId, state.lbSelectedWorker);
      state.lbSelectedWorker = null;
    } else {
      state.lbPendingFuncId = funcId;
      state.lbPendingDate   = null;
      toast('Now click a worker to assign it', 'info');
      renderLbWorkerList();
    }
  }

  function lbOpenWorkerView(workerId) {
    const worker = state.labourWorkers.find(w => w.id === workerId);
    if (!worker) return;
    if (state.lbPendingFuncId) {
      _tabCtx = 'labour';
      openAssignModal(state.lbPendingFuncId, { id: worker.id, name: worker.name, daily_rate_estimate: worker.daily_rate_estimate || 0 }, null, state.lbPendingDate);
      state.lbPendingFuncId = null; state.lbPendingDate = null; state.lbSelectedWorker = null;
      renderLbWorkerList();
      return;
    }
    _tabCtx = 'labour';
    const photo = $('bv-photo');
    const phPh  = $('bv-photo-placeholder');
    if (worker.image_path) {
      photo.src = '/' + worker.image_path + '?t=' + Date.now();
      photo.style.display = 'block'; phPh.style.display = 'none';
    } else {
      photo.style.display = 'none'; phPh.style.display = 'flex';
      phPh.textContent = (worker.name || '?').slice(0, 2).toUpperCase();
    }
    $('bv-name').textContent     = worker.name || '?';
    $('bv-nr-group').textContent = [worker.group_name, worker.role].filter(Boolean).join(' / ');
    $('bv-badges').innerHTML = worker.group_name
      ? `<span style="font-size:.6rem;font-weight:700;padding:.15rem .4rem;border-radius:4px;background:${_groupColor('labour', worker.group_name)}22;color:${_groupColor('labour', worker.group_name)};text-transform:uppercase;letter-spacing:.04em">${esc(worker.group_name)}</span>`
      : '';
    const fields = [
      worker.role                    ? ['Role',     worker.role]     : null,
      worker.contact                 ? ['Contact',  worker.contact]  : null,
      worker.notes                   ? ['Notes',     worker.notes]   : null,
    ].filter(Boolean);
    const rateEditHTML = `<span class="bv-field-label">Rate $/day</span><span class="bv-field-value" style="display:flex;align-items:center;gap:.3rem">
      <input type="number" step="1" min="0" value="${worker.daily_rate_estimate || 0}" id="bv-lb-rate-input"
        style="width:80px;font-size:.78rem;padding:.2rem .4rem;background:var(--bg-input);color:var(--text-0);border:1px solid var(--border-lt);border-radius:4px;outline:none"
        onfocus="this.style.borderColor='var(--accent)'"
        onblur="this.style.borderColor='var(--border-lt)';App.lbSaveWorkerRate(${worker.id},this.value)"
        onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">
      <span style="font-size:.65rem;color:var(--text-4)">/day</span>
    </span>`;
    $('bv-fields').innerHTML = fields.map(([label, value]) =>
      `<span class="bv-field-label">${esc(label)}</span><span class="bv-field-value">${esc(value)}</span>`
    ).join('') + rateEditHTML;
    const asgns = state.labourAssignments.filter(a => a.helper_id === worker.id);
    $('bv-assignments').innerHTML = asgns.length
      ? asgns.map(a => `<div class="bd-asgn-row">
          <span style="font-weight:600;color:var(--text-0)">${esc(a.function_name || '?')}</span>
          <span style="color:var(--text-3);font-size:.72rem">${fmtDate(a.start_date)} &rarr; ${fmtDate(a.end_date)}</span>
        </div>`).join('')
      : '<div style="color:var(--text-4);font-size:.78rem">No assignments yet</div>';
    $('bv-edit-btn').onclick = () => { closeBoatView(); openWorkerDetail(worker.id); };
    $('boat-view-overlay').classList.remove('hidden');
  }

  // ── Worker detail (edit) ── reuse boat-detail overlay ──────────
  function openWorkerDetail(workerId) {
    const w = state.labourWorkers.find(x => x.id === workerId);
    if (!w) return;
    _detailBoatId      = workerId;
    _detailIsPicture   = false;
    _detailIsTransport = false;
    _detailIsLabour    = true;
    const photo = $('bd-photo');
    const placeholder = $('bd-photo-placeholder');
    if (w.image_path) {
      photo.src = '/' + w.image_path + '?t=' + Date.now();
      photo.style.display = 'block'; placeholder.style.display = 'none';
    } else {
      photo.style.display = 'none'; placeholder.style.display = 'flex';
      placeholder.textContent = (w.name || '?').slice(0, 2).toUpperCase();
    }
    $('bd-name').value     = w.name                || '';
    $('bd-nr').value       = '';
    $('bd-captain').value  = w.role                || '';
    $('bd-vendor').value   = w.contact             || '';
    $('bd-rate-est').value = w.daily_rate_estimate  || '';
    $('bd-rate-act').value = w.daily_rate_actual    || '';
    $('bd-notes').value    = w.notes               || '';
    _setDetailLabels('labour');
    const hideIds = ['bd-group', 'bd-category', 'bd-waves', 'bd-night', 'bd-capacity'];
    hideIds.forEach(id => { const el = $(id); if (el) { const row = el.closest('tr'); if (row) row.style.display = 'none'; } });
    $('bd-delete-btn').classList.remove('hidden');
    $('bd-delete-btn').onclick = () => {
      showConfirm(`Delete worker "${w.name}"?`, async () => {
        await api('DELETE', `/api/helpers/${workerId}`);
        state.labourWorkers = state.labourWorkers.filter(x => x.id !== workerId);
        closeBoatDetail();
        renderLabour();
        toast('Worker deleted');
      });
    };
    const asgns = state.labourAssignments.filter(a => a.helper_id === workerId);
    $('bd-assignments-list').innerHTML = asgns.length
      ? asgns.map(a => `<div class="bd-asgn-row">
          <span style="font-weight:600;color:var(--text-0)">${esc(a.function_name || '?')}</span>
          <span style="color:var(--text-3);font-size:.72rem">${fmtDate(a.start_date)} &rarr; ${fmtDate(a.end_date)}</span>
        </div>`).join('')
      : '<div style="color:var(--text-4);font-size:.78rem">No assignments yet</div>';
    $('boat-detail-overlay').classList.remove('hidden');
  }

  // ── Add worker modal ─────────────────────────────────────────
  function showAddWorkerModal() {
    ['nw-name','nw-price','nw-role','nw-contact','nw-notes'].forEach(id => { const el = $(id); if(el) el.value = ''; });
    const sel = $('nw-group');
    if (sel) {
      sel.innerHTML = state.lbGroups.map(g => `<option value="${g.name}">${g.name}</option>`).join('');
      sel.value = state.lbGroups[0]?.name || 'GENERAL';
    }
    $('add-worker-overlay').classList.remove('hidden');
    setTimeout(() => { const el = $('nw-name'); if(el) el.focus(); }, 80);
  }
  function closeAddWorkerModal() { $('add-worker-overlay').classList.add('hidden'); }

  async function createWorker() {
    const name = $('nw-name').value.trim();
    if (!name) { toast('Name is required', 'error'); return; }
    try {
      const w = await api('POST', `/api/productions/${state.prodId}/helpers`, {
        name,
        daily_rate_estimate: parseFloat($('nw-price').value) || 0,
        group_name:   $('nw-group').value || 'GENERAL',
        role:         $('nw-role').value.trim()    || null,
        contact:      $('nw-contact').value.trim() || null,
        notes:        $('nw-notes').value.trim()   || null,
      });
      state.labourWorkers.push(w);
      closeAddWorkerModal();
      renderLbWorkerList();
      toast(`Worker "${w.name}" created`);
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    }
  }

  // ── Add function modal (Labour) ──────────────────────────────
  function lbShowAddFunctionModal() {
    ['nf-name','nf-specs','nf-start','nf-end'].forEach(id => { const el = $(id); if(el) el.value = ''; });
    $('nf-group').innerHTML = state.lbGroups.map(g => `<option value="${g.name}">${g.name}</option>`).join('');
    $('nf-group').value = state.lbGroups[0]?.name || '';
    $('nf-color').value = state.lbGroups[0]?.color || '#F97316';
    $('nf-group').onchange = (e) => {
      const g = state.lbGroups.find(g => g.name === e.target.value);
      $('nf-color').value = g?.color || '#6b7280';
    };
    $('add-func-overlay').dataset.ctx = 'labour';
    $('add-func-overlay').classList.remove('hidden');
    setTimeout(() => { const el = $('nf-name'); if(el) el.focus(); }, 80);
  }

  // ── Delete function ──────────────────────────────────────────
  async function lbConfirmDeleteFunc(funcId) {
    const func = state.labourFunctions.find(f => f.id === funcId);
    showConfirm(`Delete function "${func?.name}" and all its assignments?`, async () => {
      try {
        await api('DELETE', `/api/productions/${state.prodId}/helper-assignments/function/${funcId}`);
        await api('DELETE', `/api/boat-functions/${funcId}`);
        state.labourFunctions   = state.labourFunctions.filter(f => f.id !== funcId);
        state.labourAssignments = state.labourAssignments.filter(a => a.boat_function_id !== funcId);
        renderLabour();
        toast('Function deleted');
      } catch(e) { toast('Error: ' + e.message, 'error'); }
    });
  }

  // ── Edit / remove assignment by ID ───────────────────────────
  function lbEditAssignmentById(assignmentId) {
    const asgn = state.labourAssignments.find(a => a.id === assignmentId);
    if (!asgn) return;
    const worker = state.labourWorkers.find(w => w.id === asgn.helper_id);
    const fakeBoat = worker
      ? { id: worker.id, name: worker.name, daily_rate_estimate: worker.daily_rate_estimate || 0 }
      : { id: 0, name: asgn.helper_name_override || asgn.helper_name || '?', daily_rate_estimate: asgn.helper_daily_rate_estimate || 0 };
    _tabCtx = 'labour';
    openAssignModal(asgn.boat_function_id, fakeBoat, asgn);
  }

  async function lbRemoveAssignmentById(assignmentId) {
    showConfirm('Remove this assignment?', async () => {
      try {
        await api('DELETE', `/api/helper-assignments/${assignmentId}`);
        state.labourAssignments = state.labourAssignments.filter(a => a.id !== assignmentId);
        renderLabour();
        toast('Assignment removed');
      } catch(e) { toast('Error: ' + e.message, 'error'); }
    });
  }

  // ── Schedule view ─────────────────────────────────────────────
  function renderLbSchedule() {
    const container = $('lb-schedule-container');
    if (!container) return;
    const days = [];
    const d = new Date(SCHEDULE_START);
    while (d <= SCHEDULE_END) { days.push(new Date(d)); d.setDate(d.getDate() + 1); }
    const wrapEl = container.querySelector('.schedule-wrap');
    const { start: vColStart, end: vColEnd } = _getVisibleColRange(wrapEl, days.length);
    const pdtByDate = {};
    state.shootingDays.forEach(day => { pdtByDate[day.date] = day; });
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthGroups = [];
    let prevM = -1, cnt = 0;
    days.forEach(day => {
      if (day.getMonth() !== prevM) {
        if (prevM >= 0) monthGroups.push({ m: prevM, cnt });
        prevM = day.getMonth(); cnt = 1;
      } else cnt++;
    });
    monthGroups.push({ m: prevM, cnt });
    let monthRow = '<th class="role-name-cell"></th>';
    monthRow += monthGroups.map(mg =>
      `<th colspan="${mg.cnt}" style="text-align:center;font-size:.65rem">${monthNames[mg.m]}</th>`
    ).join('');
    let dayRow = '<th class="role-name-cell"></th>';
    dayRow += days.map(day => {
      const dk = _localDk(day);
      const isWE = day.getDay() === 0 || day.getDay() === 6;
      const isLocked = !!state.lbLockedDays[dk];
      return `<th class="schedule-day-th ${isWE ? 'weekend-col' : ''} ${pdtByDate[dk] ? 'has-pdt' : ''} ${isLocked ? 'day-locked' : ''}"
        data-date="${dk}"
        onmouseenter="App.showDateTooltip(event,'${dk}')"
        onmouseleave="App.hidePDTTooltip()"
      >${day.getDate()}</th>`;
    }).join('');
    const dailyCnt = {};
    days.forEach(d => { dailyCnt[_localDk(d)] = 0; });
    const gOrder = _groupOrder('labour');
    const sortedFuncs = [...state.labourFunctions].sort((a, b) => {
      const ga = gOrder.indexOf(a.function_group || 'Special');
      const gb = gOrder.indexOf(b.function_group || 'Special');
      return (ga === -1 ? 999 : ga) - (gb === -1 ? 999 : gb) || a.sort_order - b.sort_order;
    });
    const rowsHTML = sortedFuncs.map(func => {
      const funcAsgns = _lbAssignmentsForFunc(func.id);
      const color = _groupColor('labour', func.function_group);
      funcAsgns.forEach(asgn => {
        days.forEach(d => {
          const dk = _localDk(d);
          if (effectiveStatus(asgn, dk)) dailyCnt[dk] = (dailyCnt[dk] || 0) + 1;
        });
      });
      const wAsgn = funcAsgns.find(a => a.helper_id || a.helper_name_override || a.helper_name);
      const wLabel = wAsgn ? (wAsgn.helper_name_override || wAsgn.helper_name || null) : null;
      const multiSuffix = funcAsgns.length > 1 ? ` +${funcAsgns.length - 1}` : '';
      const wWorker = wAsgn && wAsgn.helper_id ? state.labourWorkers.find(w => w.id === wAsgn.helper_id) : null;
      const wRate = wWorker ? (wWorker.daily_rate_estimate || 0) : 0;
      const rateHint = wLabel && wRate > 0 ? `<span style="font-size:.55rem;color:var(--green);margin-left:.25rem">$${Math.round(wRate)}</span>` : '';
      let cells = `<td class="role-name-cell sch-func-cell" style="border-top:2px solid ${color}"
        title="${esc(func.name)}${wRate > 0 ? ' - $' + Math.round(wRate) + '/day (click to edit)' : ''}" onclick="App.lbOnFuncCellClick(event,${func.id})">
        <div class="rn-group" style="color:${color}">${esc(func.function_group || 'GENERAL')}</div>
        <div class="${wLabel ? 'rn-boat' : 'rn-empty'}" style="display:flex;align-items:baseline;gap:0">${esc(wLabel ? wLabel + multiSuffix : func.name)}${rateHint}</div>
      </td>`;
      days.forEach((day, colIdx) => {
        const dk = _localDk(day);
        const isWE = day.getDay() === 0 || day.getDay() === 6;
        const weClass = isWE ? 'weekend-col' : '';
        if (colIdx < vColStart || colIdx >= vColEnd) {
          cells += `<td class="schedule-cell ${weClass}"></td>`;
          return;
        }
        let filledAsgn = null, filledStatus = null;
        for (const asgn of funcAsgns) {
          const st = effectiveStatus(asgn, dk);
          if (st) { filledAsgn = asgn; filledStatus = st; break; }
        }
        if (!filledAsgn) {
          cells += `<td class="schedule-cell ${weClass}"
            onclick="App.lbOnDateCellClick(event,${func.id},null,'${dk}')"></td>`;
        } else {
          const bg = _scheduleCellBg(filledStatus, color, isWE);
          cells += `<td class="schedule-cell ${weClass}" style="background:${bg}"
            onclick="App.lbOnDateCellClick(event,${func.id},${filledAsgn.id},'${dk}')"></td>`;
        }
      });
      return `<tr>${cells}</tr>`;
    }).join('');
    let countCells = '<td class="role-name-cell" style="color:var(--text-3);font-size:.68rem">Active workers</td>';
    countCells += days.map(day => {
      const dk = _localDk(day);
      const c = dailyCnt[dk] || 0;
      const isWE = day.getDay() === 0 || day.getDay() === 6;
      return `<td class="${isWE ? 'weekend-col' : ''}" style="text-align:center;font-size:.68rem;color:${c ? 'var(--green)' : 'var(--border)'};font-weight:700">${c || ''}</td>`;
    }).join('');
    let lockCells = '<td class="role-name-cell sch-lock-label" title="Lock a day to prevent accidental changes">&#x1F512; LOCK</td>';
    lockCells += days.map(day => {
      const dk = _localDk(day);
      const isWE = day.getDay() === 0 || day.getDay() === 6;
      const isLocked = !!state.lbLockedDays[dk];
      return `<td class="sch-lock-cell ${isWE ? 'weekend-col' : ''}">
        <input type="checkbox" class="day-lock-cb" ${isLocked ? 'checked' : ''}
          onchange="App.lbToggleDayLock('${dk}',this.checked)"
          title="${isLocked ? 'Unlock' : 'Lock this day'}">
      </td>`;
    }).join('');
    const lbSchedHTML = `
      <div class="schedule-wrap"><table class="schedule-table">
        <thead><tr>${monthRow}</tr><tr>${dayRow}</tr></thead>
        <tbody>${rowsHTML}<tr class="schedule-count-row">${countCells}</tr></tbody>
      </table></div>
      <div class="schedule-lock-outer"><table class="schedule-table">
        <tbody><tr class="schedule-lock-row">${lockCells}</tr></tbody>
      </table></div>`;
    _morphHTML(container, lbSchedHTML);
    const _sw = container.querySelector('.schedule-wrap');
    const _sl = container.querySelector('.schedule-lock-outer');
    if (_sw && _sl) {
      _sw.addEventListener('scroll', () => {
        _sl.scrollLeft = _sw.scrollLeft;
        _debouncedRender('lb-schedule-vscroll', renderLbSchedule, 100);
      });
    }
  }

  // ── Schedule cell click (toggle day on/off) ──────────────────
  async function lbOnDateCellClick(event, funcId, assignmentId, date) {
    event.stopPropagation();
    closeSchedulePopover();
    if (!!state.lbLockedDays[date]) {
      toast(`Day ${fmtDateLong(date)} is locked`, 'info');
      return;
    }
    if (!assignmentId) await _lbFillDay(funcId, date);
    else await _lbDoCellCycle(funcId, assignmentId, date);
  }

  async function _lbFillDay(funcId, date) {
    const funcAsgns = _lbAssignmentsForFunc(funcId);
    try {
      if (funcAsgns.length > 0) {
        const asgn = funcAsgns[0];
        const overrides = JSON.parse(asgn.day_overrides || '{}');
        overrides[date] = 'on';
        const updates = { day_overrides: JSON.stringify(overrides) };
        const s = (asgn.start_date || '').slice(0, 10);
        const e = (asgn.end_date   || '').slice(0, 10);
        if (!s || date < s) {
          updates.start_date = date;
          if (s) {
            const cur = new Date(date + 'T00:00:00');
            cur.setDate(cur.getDate() + 1);
            const oldS = new Date(s + 'T00:00:00');
            while (cur < oldS) {
              const dk = _localDk(cur);
              if (state.lbLockedDays[dk] && !(dk in overrides)) overrides[dk] = 'empty';
              cur.setDate(cur.getDate() + 1);
            }
          }
        }
        if (!e || date > e) {
          updates.end_date = date;
          if (e) {
            const cur = new Date(e + 'T00:00:00');
            cur.setDate(cur.getDate() + 1);
            const newE = new Date(date + 'T00:00:00');
            while (cur < newE) {
              const dk = _localDk(cur);
              if (state.lbLockedDays[dk] && !(dk in overrides)) overrides[dk] = 'empty';
              cur.setDate(cur.getDate() + 1);
            }
          }
        }
        updates.day_overrides = JSON.stringify(overrides);
        await api('PUT', `/api/helper-assignments/${asgn.id}`, updates);
      } else {
        await api('POST', `/api/productions/${state.prodId}/helper-assignments`, {
          boat_function_id: funcId,
          start_date: date, end_date: date,
          day_overrides: JSON.stringify({ [date]: 'on' }),
        });
      }
      state.labourAssignments = await api('GET', `/api/productions/${state.prodId}/helper-assignments`);
      renderLabour();
      _queueCellFlash(date, funcId);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  }

  async function _lbDoCellCycle(funcId, assignmentId, date) {
    const asgn = state.labourAssignments.find(a => a.id === assignmentId);
    if (!asgn) return;
    const overrides = JSON.parse(asgn.day_overrides || '{}');
    overrides[date] = 'empty';
    try {
      await api('PUT', `/api/helper-assignments/${assignmentId}`, { day_overrides: JSON.stringify(overrides) });
      const idx = state.labourAssignments.findIndex(a => a.id === assignmentId);
      if (idx >= 0) state.labourAssignments[idx].day_overrides = JSON.stringify(overrides);
      renderLabour();
      _queueCellFlash(date, funcId);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  }

  // ── Schedule func cell click (popover) ───────────────────────
  function lbOnFuncCellClick(event, funcId) {
    event.stopPropagation();
    const el = $('schedule-popover');
    if (_schPop.funcId === funcId && _schPop.type === 'lbfunc' && !el.classList.contains('hidden')) {
      closeSchedulePopover(); return;
    }
    _schPop = { assignmentId: null, funcId, date: null, type: 'lbfunc' };
    const func = state.labourFunctions.find(f => f.id === funcId);
    const asgns = _lbAssignmentsForFunc(funcId);
    const asgnRows = asgns.length
      ? asgns.map(a => {
          const wName = a.helper_name_override || a.helper_name || '---';
          const worker = a.helper_id ? state.labourWorkers.find(w => w.id === a.helper_id) : null;
          const curRate = worker ? (worker.daily_rate_estimate || 0) : (a.helper_daily_rate_estimate || 0);
          return `<div class="sch-pop-asgn-row" style="flex-wrap:wrap">
            <span style="flex:1;font-size:.75rem;overflow:hidden;text-overflow:ellipsis;color:var(--text-0)">${esc(wName)}</span>
            <button class="btn btn-sm btn-icon btn-secondary"
              onclick="App.lbEditAssignmentById(${a.id});App.closeSchedulePopover()" title="Edit">&#x270E;</button>
            <button class="btn btn-sm btn-icon btn-danger"
              onclick="App.lbRemoveAssignmentById(${a.id})" title="Remove">&times;</button>
          </div>
          ${a.helper_id ? `<div style="display:flex;align-items:center;gap:.3rem;margin-top:.15rem;margin-bottom:.3rem;padding-left:.1rem;width:100%">
            <span style="font-size:.65rem;color:var(--text-3)">$/day:</span>
            <input type="number" step="1" min="0" value="${curRate}"
              style="width:65px;font-size:.7rem;padding:.15rem .3rem;background:var(--bg-input);color:var(--text-0);border:1px solid var(--border-lt);border-radius:4px;outline:none"
              onfocus="this.style.borderColor='var(--accent)'"
              onblur="this.style.borderColor='var(--border-lt)';App.lbSaveWorkerRate(${a.helper_id},this.value)"
              onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">
          </div>` : ''}`;
        }).join('')
      : `<div style="color:var(--text-4);font-size:.75rem;padding:.25rem 0">No worker assigned</div>`;
    $('sch-pop-content').innerHTML = `
      <div class="sch-pop-header">
        <strong>${esc(func?.name || '')}</strong>
        <span style="color:var(--text-4);font-size:.65rem;margin-left:.4rem">${esc(func?.function_group || '')}</span>
      </div>
      ${asgnRows}
      <div class="sch-pop-actions" style="margin-top:.4rem">
        <button onclick="App.lbAssignFromDate(${funcId},null)">+ Assign a worker</button>
      </div>`;
    const rect = event.target.getBoundingClientRect();
    el.style.left = (rect.right + 4) + 'px';
    el.style.top  = rect.top + 'px';
    el.classList.remove('hidden');
  }

  function lbAssignFromDate(funcId, date) {
    closeSchedulePopover();
    _tabCtx = 'labour';
    if (state.lbSelectedWorker) {
      openAssignModal(funcId, state.lbSelectedWorker, null, date);
      state.lbSelectedWorker = null;
    } else {
      state.lbPendingFuncId = funcId;
      state.lbPendingDate   = date;
      toast('Click a worker in the sidebar to assign it', 'info');
    }
  }

  // ── Lock toggle ──────────────────────────────────────────────
  function lbToggleDayLock(date, locked) {
    if (locked) state.lbLockedDays[date] = true;
    else delete state.lbLockedDays[date];
    try { localStorage.setItem('labour_locked_days', JSON.stringify(state.lbLockedDays)); } catch(e) {}
    renderLbSchedule();
  }

  // ── Undo ─────────────────────────────────────────────────────
  async function lbUndo() {
    try {
      const res = await api('POST', `/api/productions/${state.prodId}/undo`);
      toast(res.message || 'Undo done');
      state.labourAssignments = await api('GET', `/api/productions/${state.prodId}/helper-assignments`);
      renderLabour();
    } catch (e) {
      toast('Nothing to undo', 'info');
    }
  }

  // ── Export ───────────────────────────────────────────────────
  function lbToggleExport() { $('lb-export-menu').classList.toggle('hidden'); }
  function lbExportCSV()  { authDownload(`/api/productions/${state.prodId}/export/labour/csv`); $('lb-export-menu').classList.add('hidden'); }

  // ── Budget view ──────────────────────────────────────────────
  function renderLbBudget() {
    const container = $('lb-budget-content');
    if (!container) return;
    const asgns = state.labourAssignments;
    const funcs = state.labourFunctions;
    // Group by function_group
    const byGroup = {};
    state.lbGroups.forEach(g => { byGroup[g.name] = { rows: [], total: 0, color: g.color }; });
    asgns.forEach(a => {
      const func = funcs.find(f => f.id === a.boat_function_id);
      const wd   = computeWd(a);
      const rate = a.price_override || a.helper_daily_rate_estimate || 0;
      const total = Math.round(wd * rate);
      if (wd <= 0) return;
      const g = func?.function_group || a.function_group || 'GENERAL';
      if (!byGroup[g]) byGroup[g] = { rows: [], total: 0, color: '#6B7280' };
      byGroup[g].rows.push({
        funcName: func?.name || a.function_name || '---',
        workerName: a.helper_name_override || a.helper_name || '---',
        start: a.start_date, end: a.end_date, wd, rate, total
      });
      byGroup[g].total += total;
    });

    function rowFigeAmount(row) {
      if (!row.start || !row.end || !row.total) return 0;
      const cur = new Date(row.start + 'T00:00:00');
      const end = new Date(row.end   + 'T00:00:00');
      let total = 0, lockedCount = 0;
      while (cur <= end) {
        total++;
        if (state.lbLockedDays[_localDk(cur)]) lockedCount++;
        cur.setDate(cur.getDate() + 1);
      }
      return total === 0 ? 0 : Math.round(row.total * lockedCount / total);
    }

    const allRows = Object.values(byGroup).flatMap(g => g.rows);
    const totalGlobal   = allRows.reduce((s, r) => s + r.total, 0);
    const totalFige     = allRows.reduce((s, r) => s + rowFigeAmount(r), 0);
    const totalEstimate = totalGlobal - totalFige;

    let html = `
      <div class="stat-grid" style="margin-bottom:.75rem">
        <div class="stat-card" style="border:1px solid var(--border)">
          <div class="stat-val">${fmtMoney(totalGlobal)}</div>
          <div class="stat-lbl">TOTAL GLOBAL</div>
        </div>
        <div class="stat-card" style="border:1px solid var(--green);background:rgba(34,197,94,.07)">
          <div class="stat-val" style="color:var(--green)">${fmtMoney(totalFige)}</div>
          <div class="stat-lbl">UP TO DATE <span style="font-size:.6rem;opacity:.55">(locked)</span></div>
        </div>
        <div class="stat-card" style="border:1px solid #F59E0B;background:rgba(245,158,11,.07)">
          <div class="stat-val" style="color:#F59E0B">${fmtMoney(totalEstimate)}</div>
          <div class="stat-lbl">ESTIMATE</div>
        </div>
      </div>`;

    Object.entries(byGroup).forEach(([name, data]) => {
      if (!data.rows.length) return;
      html += `<div class="budget-dept-card">
        <div class="budget-dept-header">
          <span style="font-weight:700;font-size:.82rem;color:${data.color}">${esc(name)}</span>
          <span style="font-weight:700;color:var(--green)">${fmtMoney(data.total)}</span>
        </div>
        <table class="budget-table">
          <thead>
            <tr>
              <th>Function</th>
              <th style="text-align:left">Worker</th>
              <th>Start</th><th>End</th>
              <th>Days</th><th>$/day</th><th>Total $</th>
            </tr>
          </thead>
          <tbody>
            ${data.rows.map((r, i) => `<tr style="${i%2 ? 'background:var(--bg-surface)' : ''}">
              <td style="color:var(--text-1)">${esc(r.funcName)}</td>
              <td style="color:var(--cyan)">${esc(r.workerName)}</td>
              <td style="font-size:.72rem;color:var(--text-3)">${fmtDate(r.start)}</td>
              <td style="font-size:.72rem;color:var(--text-3)">${fmtDate(r.end)}</td>
              <td style="text-align:right;color:var(--text-2)">${r.wd ?? '---'}</td>
              <td style="text-align:right;color:var(--text-3)">${fmtMoney(r.rate)}</td>
              <td style="text-align:right;font-weight:700;color:var(--green)">${fmtMoney(r.total)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    });

    html += `<div class="budget-dept-card" style="margin-top:.5rem">
      <table class="budget-table">
        <tbody><tr class="budget-total-row">
          <td colspan="6" style="text-align:right;color:var(--text-1)">TOTAL LABOUR</td>
          <td style="text-align:right;color:var(--green);font-size:1.05rem">${fmtMoney(totalGlobal)}</td>
        </tr></tbody>
      </table>
    </div>`;

    container.innerHTML = html;
  }


  // ═══════════════════════════════════════════════════════════
  //  SECURITY BOATS MODULE
  // ═══════════════════════════════════════════════════════════

  const DEFAULT_SB_GROUPS = [
    { name: 'SAFETY',  color: '#EF4444' },
    { name: 'EVAC',    color: '#DC2626' },
    { name: 'MEDICAL', color: '#22C55E' },
    { name: 'STANDBY', color: '#3B82F6' },
  ];

  Object.assign(state, {
    securityBoats:        [],
    securityFunctions:    [],
    securityAssignments:  [],
    sbBoatView:           'cards',
    sbBoatFilter:         'all',
    sbSelectedBoat:       null,
    sbDragBoat:           null,
    sbPendingFuncId:      null,
    sbPendingDate:        null,
    sbLockedDays:         {},
    sbGroups:             DEFAULT_SB_GROUPS,
  });

  // Restore locked days from localStorage
  try { const saved = localStorage.getItem('sb_locked_days'); if (saved) state.sbLockedDays = JSON.parse(saved); } catch(e) {}

  function _sbAssignmentsForFunc(funcId) {
    return state.securityAssignments.filter(a => a.boat_function_id === funcId);
  }

  async function _loadAndRenderSecurityBoats() {
    // AXE 5.4: show loading skeletons
    const rg = $('sb-role-groups'); if (rg) rg.innerHTML = _skeletonCards(3);
    const sc = $('sb-schedule-container'); if (sc) sc.innerHTML = _skeletonTable();
    try {
      const [boats, functions, assignments] = await Promise.all([
        api('GET', `/api/productions/${state.prodId}/security-boats`),
        api('GET', `/api/productions/${state.prodId}/boat-functions?context=security`),
        api('GET', `/api/productions/${state.prodId}/security-boat-assignments`),
      ]);
      state.securityBoats       = boats;
      state.securityFunctions   = functions;
      state.securityAssignments = assignments;
    } catch(e) { toast('Error loading security boats: ' + e.message, 'error'); }
    renderSecurityBoats();
  }

  function renderSecurityBoats() {
    renderSbBoatList();
    if (state.sbBoatView === 'cards')         renderSbRoleCards();
    else if (state.sbBoatView === 'schedule') renderSbSchedule();
    else if (state.sbBoatView === 'budget')   renderSbBudget();
  }

  function sbSetView(view) {
    state.sbBoatView = view;
    ['cards','schedule','budget'].forEach(v => {
      $(`sb-view-${v}`)?.classList.toggle('hidden', v !== view);
      $(`sb-btab-${v}`)?.classList.toggle('active', v === view);
    });
    renderSecurityBoats();
    _updateBreadcrumb(view.charAt(0).toUpperCase() + view.slice(1));
  }

  function sbFilterBoats(f) {
    state.sbBoatFilter = f;
    ['all','available','assigned'].forEach(id => {
      $(`sb-boat-filter-${id}`)?.classList.toggle('active', id === f);
    });
    renderSbBoatList();
  }

  function _sbFilteredBoats() {
    const assignedIds = new Set(state.securityAssignments.filter(a => a.security_boat_id).map(a => a.security_boat_id));
    let boats = [...state.securityBoats];
    if      (state.sbBoatFilter === 'available') boats = boats.filter(b => !assignedIds.has(b.id));
    else if (state.sbBoatFilter === 'assigned')  boats = boats.filter(b => assignedIds.has(b.id));
    boats.sort((a, b) => (a.boat_nr || 999) - (b.boat_nr || 999));
    return boats;
  }

  function renderSbBoatList() {
    const boats = _sbFilteredBoats();
    const assignedIds = new Set(state.securityAssignments.filter(a => a.security_boat_id).map(a => a.security_boat_id));
    const container = $('sb-boat-list');
    if (!container) return;
    if (!boats.length) {
      container.innerHTML = '<div style="color:var(--text-4);font-size:.8rem;text-align:center;padding:1rem">No security boats</div>';
      return;
    }
    container.innerHTML = boats.map(b => {
      const isAssigned = assignedIds.has(b.id);
      const boatAsgns  = state.securityAssignments.filter(a => a.security_boat_id === b.id);
      const wClass = waveClass(b.wave_rating);
      const thumb = b.image_path
        ? `<img class="boat-thumb" src="/${b.image_path}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
           <div class="boat-thumb-placeholder" style="display:none">#${esc(b.boat_nr || '?')}</div>`
        : `<div class="boat-thumb-placeholder">#${esc(b.boat_nr || '?')}</div>`;
      const nr   = b.boat_nr ? `<span style="font-size:.6rem;color:var(--text-4);font-family:monospace">#${esc(b.boat_nr)}</span> ` : '';
      const sbRateVal = b.daily_rate_estimate || 0;
      const rate = `<div style="font-size:.65rem;color:${sbRateVal > 0 ? 'var(--green)' : 'var(--text-4)'};margin-top:.1rem;cursor:pointer;display:inline-flex;align-items:center;gap:.2rem"
        onclick="event.stopPropagation();App.openSecurityBoatDetail(${b.id})"
        title="Click to edit rate">${sbRateVal > 0 ? '$' + Math.round(sbRateVal).toLocaleString('en-US') + '/d' : '+ set rate'}<span style="font-size:.55rem;opacity:.5">&#x270E;</span></div>`;
      return `<div class="boat-card ${isAssigned ? 'assigned' : ''}"
        id="sb-boat-card-${b.id}"
        draggable="true"
        ondragstart="App.sbOnBoatDragStart(event,${b.id})"
        ondragend="App.sbOnBoatDragEnd()"
        onclick="App.sbOpenBoatView(${b.id})">
        <div class="boat-thumb-wrap">${thumb}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:baseline;gap:.3rem;margin-bottom:.2rem;flex-wrap:wrap">
            ${nr}<span style="font-weight:700;font-size:.82rem;color:var(--text-0);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(b.name)}</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:.2rem;align-items:center;margin-bottom:.1rem">
            <span class="wave-badge ${wClass}">${waveLabel(b.wave_rating)}</span>
            ${b.capacity ? `<span style="font-size:.65rem;color:var(--text-3)">${esc(b.capacity)} pax</span>` : ''}
            ${b.night_ok ? '<span class="night-badge">NIGHT</span>' : ''}
          </div>
          ${b.captain ? `<div style="font-size:.65rem;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Capt. ${esc(b.captain)}</div>` : ''}
          ${b.vendor  ? `<div style="font-size:.65rem;color:var(--orange);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(b.vendor)}</div>` : ''}
          ${rate}
          ${isAssigned && boatAsgns.length ? `<div style="font-size:.6rem;color:var(--accent);margin-top:.1rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${boatAsgns.map(a => esc(a.function_name || '')).join(', ')}</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:.15rem;flex-shrink:0;align-self:flex-start">
          <button class="boat-edit-btn" title="Edit boat"
            onclick="event.stopPropagation();App.openSecurityBoatDetail(${b.id})">&#9998;</button>
          <button class="card-delete-btn" title="Delete security boat"
            onclick="event.stopPropagation();App.confirmDeleteSecurityBoat(${b.id},'${esc(b.name).replace(/'/g,"\\'")}',${boatAsgns.length})">&#x1F5D1;</button>
        </div>
      </div>`;
    }).join('');
  }

  // ── Delete security boat from card ──────────────────────────
  function confirmDeleteSecurityBoat(sbId, boatName, assignmentCount) {
    const impact = assignmentCount > 0 ? `\n${assignmentCount} assignment(s) will also be deleted.` : '';
    showConfirm(`Delete security boat "${boatName}"?${impact}`, async () => {
      try {
        await api('DELETE', `/api/security-boats/${sbId}`);
        state.securityBoats = state.securityBoats.filter(b => b.id !== sbId);
        state.securityAssignments = state.securityAssignments.filter(a => a.security_boat_id !== sbId);
        closeBoatDetail();
        renderSecurityBoats();
        toast('Security boat deleted');
      } catch (e) { toast('Error: ' + e.message, 'error'); }
    });
  }

  // ── Security Boats Cards view (role cards with drag-drop) ────
  function renderSbRoleCards() {
    const container = $('sb-role-groups');
    if (!container) return;
    const grouped = {};
    _sbGroupOrder().forEach(g => { grouped[g] = []; });
    state.securityFunctions.forEach(f => {
      const g = f.function_group || 'SAFETY';
      if (!grouped[g]) grouped[g] = [];
      grouped[g].push(f);
    });
    let html = '';
    _sbGroupOrder().forEach(group => {
      const funcs = grouped[group];
      if (!funcs || !funcs.length) return;
      const color = _sbGroupColor(group);
      html += `
        <div class="role-group-header" style="background:${color}18;border-left:3px solid ${color}">
          <span style="color:${color}">&#9679;</span>
          <span style="color:${color}">${esc(group)}</span>
          <span style="color:var(--text-4);font-weight:400;font-size:.65rem;text-transform:none;letter-spacing:0">${funcs.length} function${funcs.length > 1 ? 's' : ''}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:.5rem;margin-bottom:.75rem">
          ${funcs.map(f => _renderSbRoleCard(f, color)).join('')}
        </div>`;
    });
    container.innerHTML = html || '<div style="color:var(--text-4);text-align:center;padding:3rem">No functions. Click + Function to add one.</div>';
  }

  function _sbGroupOrder() {
    return (state.sbGroups || DEFAULT_SB_GROUPS).map(g => g.name);
  }

  function _sbGroupColor(groupName) {
    return (state.sbGroups || DEFAULT_SB_GROUPS).find(g => g.name === groupName)?.color || '#6b7280';
  }

  function _renderSbRoleCard(func, color) {
    const asgns = _sbAssignmentsForFunc(func.id);
    const assignedBodies = asgns.map(asgn => {
      const boatName = asgn.boat_name_override || asgn.boat_name || '?';
      const wd   = computeWd(asgn);
      const rate = asgn.price_override || asgn.boat_daily_rate_estimate || 0;
      const total = Math.round(wd * rate);
      const wClass = waveClass(asgn.wave_rating || '');
      return `<div class="assigned-mini" style="margin-bottom:.35rem">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;margin-bottom:.2rem">
              ${asgn.wave_rating ? `<span class="wave-badge ${wClass}">${waveLabel(asgn.wave_rating)}</span>` : ''}
              <span style="font-weight:600;color:var(--text-0);font-size:.82rem">${esc(boatName)}</span>
              ${asgn.captain ? `<span style="color:var(--text-3);font-size:.7rem">${esc(asgn.captain)}</span>` : ''}
            </div>
            <div style="font-size:.72rem;color:var(--text-3)">${wd} working days</div>
            ${rate > 0 ? `<div style="font-size:.72rem;color:var(--green);margin-top:.1rem">$${rate}/d = ${fmtMoney(total)}</div>` : ''}
          </div>
          <div style="display:flex;flex-direction:column;gap:.2rem">
            <button class="btn btn-sm btn-secondary btn-icon" onclick="App.sbEditAssignmentById(${asgn.id})" title="Edit">&#9998;</button>
            <button class="btn btn-sm btn-danger btn-icon" onclick="App.sbRemoveAssignmentById(${asgn.id})" title="Remove">&#10005;</button>
          </div>
        </div>
      </div>`;
    });
    const dropZone = `<div class="drop-zone" id="sb-drop-${func.id}"
      ondragover="App.sbOnDragOver(event,${func.id})"
      ondragleave="App.sbOnDragLeave(event,${func.id})"
      ondrop="App.sbOnDrop(event,${func.id})"
      onclick="App.sbOnDropZoneClick(${func.id})"
      style="${asgns.length ? 'margin-top:.3rem;padding:.35rem;font-size:.7rem' : ''}">
      ${state.sbSelectedBoat
        ? `<span style="color:var(--accent)">Click to assign <strong>${esc(state.sbSelectedBoat.name)}</strong></span>`
        : (asgns.length ? '<span>+ Add another assignment</span>' : '<span>Drop or click a boat to assign</span>')}
    </div>`;
    return `<div class="role-card" id="sb-role-card-${func.id}"
      style="border-top:3px solid ${color}"
      ondragover="App.sbOnDragOver(event,${func.id})"
      ondragleave="App.sbOnDragLeave(event,${func.id})"
      ondrop="App.sbOnDrop(event,${func.id})">
      <div class="role-card-header">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;color:var(--text-0);font-size:.85rem">${esc(func.name)}</div>
          ${func.specs ? `<div style="font-size:.7rem;color:var(--text-4);margin-top:.1rem">${esc(func.specs)}</div>` : ''}
        </div>
        <button onclick="App.sbConfirmDeleteFunc(${func.id})"
          style="color:var(--text-4);background:none;border:none;cursor:pointer;font-size:.9rem;padding:.2rem"
          title="Delete">&#10005;</button>
      </div>
      <div class="role-card-body">${assignedBodies.join('') + dropZone}</div>
    </div>`;
  }

  // ── Security Boats Schedule view ────────────────────────────
  function renderSbSchedule() {
    const container = $('sb-schedule-container');
    if (!container) return;
    const days = [];
    const d = new Date(SCHEDULE_START);
    while (d <= SCHEDULE_END) { days.push(new Date(d)); d.setDate(d.getDate() + 1); }
    const wrapEl = container.querySelector('.schedule-wrap');
    const { start: vColStart, end: vColEnd } = _getVisibleColRange(wrapEl, days.length);
    const pdtByDate = {};
    state.shootingDays.forEach(day => { pdtByDate[day.date] = day; });
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthGroups = [];
    let prevM = -1, cnt = 0;
    days.forEach(day => {
      if (day.getMonth() !== prevM) {
        if (prevM >= 0) monthGroups.push({ m: prevM, cnt });
        prevM = day.getMonth(); cnt = 1;
      } else cnt++;
    });
    monthGroups.push({ m: prevM, cnt });
    let monthRow = '<th class="role-name-cell"></th>';
    monthRow += monthGroups.map(mg =>
      `<th colspan="${mg.cnt}" style="text-align:center;font-size:.65rem">${monthNames[mg.m]}</th>`
    ).join('');
    let dayRow = '<th class="role-name-cell"></th>';
    dayRow += days.map(day => {
      const dk = _localDk(day);
      const isWE = day.getDay() === 0 || day.getDay() === 6;
      const isLocked = !!state.sbLockedDays[dk];
      return `<th class="schedule-day-th ${isWE ? 'weekend-col' : ''} ${pdtByDate[dk] ? 'has-pdt' : ''} ${isLocked ? 'day-locked' : ''}"
        data-date="${dk}"
        onmouseenter="App.showDateTooltip(event,'${dk}')"
        onmouseleave="App.hidePDTTooltip()"
      >${day.getDate()}</th>`;
    }).join('');
    const dailyCnt = {};
    days.forEach(d => { dailyCnt[_localDk(d)] = 0; });
    const gOrder = _sbGroupOrder();
    const sortedFuncs = [...state.securityFunctions].sort((a, b) => {
      const ga = gOrder.indexOf(a.function_group || 'SAFETY');
      const gb = gOrder.indexOf(b.function_group || 'SAFETY');
      return (ga === -1 ? 999 : ga) - (gb === -1 ? 999 : gb) || a.sort_order - b.sort_order;
    });
    const rowsHTML = sortedFuncs.map(func => {
      const funcAsgns = _sbAssignmentsForFunc(func.id);
      const color = _sbGroupColor(func.function_group);
      funcAsgns.forEach(asgn => {
        days.forEach(d => {
          const dk = _localDk(d);
          if (effectiveStatus(asgn, dk)) dailyCnt[dk] = (dailyCnt[dk] || 0) + 1;
        });
      });
      const boatAsgn = funcAsgns.find(a => a.security_boat_id || a.boat_name_override || a.boat_name);
      const boatLabel = boatAsgn ? (boatAsgn.boat_name_override || boatAsgn.boat_name || null) : null;
      const multiSuffix = funcAsgns.length > 1 ? ` +${funcAsgns.length - 1}` : '';
      let cells = `<td class="role-name-cell sch-func-cell" style="border-top:2px solid ${color}"
        title="${esc(func.name)}" onclick="App.sbOnFuncCellClick(event,${func.id})">
        <div class="rn-group" style="color:${color}">${esc(func.function_group || 'SAFETY')}</div>
        <div class="${boatLabel ? 'rn-boat' : 'rn-empty'}">${esc(boatLabel ? boatLabel + multiSuffix : func.name)}</div>
      </td>`;
      days.forEach((day, colIdx) => {
        const dk = _localDk(day);
        const isWE = day.getDay() === 0 || day.getDay() === 6;
        const weClass = isWE ? 'weekend-col' : '';
        if (colIdx < vColStart || colIdx >= vColEnd) {
          cells += `<td class="schedule-cell ${weClass}"></td>`;
          return;
        }
        let filledAsgn = null, filledStatus = null;
        for (const asgn of funcAsgns) {
          const st = effectiveStatus(asgn, dk);
          if (st) { filledAsgn = asgn; filledStatus = st; break; }
        }
        if (!filledAsgn) {
          cells += `<td class="schedule-cell ${weClass}"
            onclick="App.sbOnDateCellClick(event,${func.id},null,'${dk}')"></td>`;
        } else {
          const bg = _scheduleCellBg(filledStatus, color, isWE);
          cells += `<td class="schedule-cell ${weClass}" style="background:${bg}"
            onclick="App.sbOnDateCellClick(event,${func.id},${filledAsgn.id},'${dk}')"></td>`;
        }
      });
      return `<tr>${cells}</tr>`;
    }).join('');
    let countCells = '<td class="role-name-cell" style="color:var(--text-3);font-size:.68rem">Active boats</td>';
    countCells += days.map(day => {
      const dk = _localDk(day);
      const c = dailyCnt[dk] || 0;
      const isWE = day.getDay() === 0 || day.getDay() === 6;
      return `<td class="${isWE ? 'weekend-col' : ''}" style="text-align:center;font-size:.68rem;color:${c ? 'var(--green)' : 'var(--border)'};font-weight:700">${c || ''}</td>`;
    }).join('');
    // Lock row
    let lockCells = '<td class="role-name-cell sch-lock-label" title="Locking a day prevents accidental changes">LOCK</td>';
    lockCells += days.map(day => {
      const dk = _localDk(day);
      const isWE = day.getDay() === 0 || day.getDay() === 6;
      const isLocked = !!state.sbLockedDays[dk];
      return `<td class="sch-lock-cell ${isWE ? 'weekend-col' : ''}">
        <input type="checkbox" class="day-lock-cb" ${isLocked ? 'checked' : ''}
          onchange="App.sbToggleDayLock('${dk}',this.checked)"
          title="${isLocked ? 'Unlock' : 'Lock this day'}">
      </td>`;
    }).join('');
    const sbSchedHTML = `
      <div class="schedule-wrap"><table class="schedule-table">
        <thead><tr>${monthRow}</tr><tr>${dayRow}</tr></thead>
        <tbody>${rowsHTML}<tr class="schedule-count-row">${countCells}</tr></tbody>
      </table></div>
      <div class="schedule-lock-outer"><table class="schedule-table">
        <tbody><tr class="schedule-lock-row">${lockCells}</tr></tbody>
      </table></div>`;
    _morphHTML(container, sbSchedHTML);
    const _sw = container.querySelector('.schedule-wrap');
    const _sl = container.querySelector('.schedule-lock-outer');
    if (_sw && _sl) {
      _sw.addEventListener('scroll', () => {
        _sl.scrollLeft = _sw.scrollLeft;
        _debouncedRender('sb-schedule-vscroll', renderSbSchedule, 100);
      });
    }
  }

  // ── Security Boats Schedule cell interactions ───────────────
  async function sbOnDateCellClick(event, funcId, assignmentId, date) {
    event.stopPropagation();
    closeSchedulePopover();
    const isLocked = !!state.sbLockedDays[date];
    if (isLocked) {
      toast(`Day ${fmtDateLong(date)} is locked -- uncheck to modify`, 'info');
      return;
    }
    if (!assignmentId) await _sbFillDay(funcId, date);
    else await _sbDoCellCycle(funcId, assignmentId, date);
  }

  async function _sbFillDay(funcId, date) {
    const funcAsgns = _sbAssignmentsForFunc(funcId);
    try {
      if (funcAsgns.length > 0) {
        const asgn = funcAsgns[0];
        const overrides = JSON.parse(asgn.day_overrides || '{}');
        overrides[date] = 'on';
        const updates = { day_overrides: JSON.stringify(overrides) };
        const s = (asgn.start_date || '').slice(0, 10);
        const e = (asgn.end_date   || '').slice(0, 10);
        if (!s || date < s) {
          updates.start_date = date;
          if (s) {
            const cur = new Date(date + 'T00:00:00');
            cur.setDate(cur.getDate() + 1);
            const oldS = new Date(s + 'T00:00:00');
            while (cur < oldS) {
              const dk = _localDk(cur);
              if (state.sbLockedDays[dk] && !(dk in overrides)) overrides[dk] = 'empty';
              cur.setDate(cur.getDate() + 1);
            }
          }
        }
        if (!e || date > e) {
          updates.end_date = date;
          if (e) {
            const cur = new Date(e + 'T00:00:00');
            cur.setDate(cur.getDate() + 1);
            const newE = new Date(date + 'T00:00:00');
            while (cur < newE) {
              const dk = _localDk(cur);
              if (state.sbLockedDays[dk] && !(dk in overrides)) overrides[dk] = 'empty';
              cur.setDate(cur.getDate() + 1);
            }
          }
        }
        updates.day_overrides = JSON.stringify(overrides);
        await api('PUT', `/api/security-boat-assignments/${asgn.id}`, updates);
      } else {
        await api('POST', `/api/productions/${state.prodId}/security-boat-assignments`, {
          boat_function_id: funcId,
          start_date: date, end_date: date,
          day_overrides: JSON.stringify({ [date]: 'on' }),
        });
      }
      state.securityAssignments = await api('GET', `/api/productions/${state.prodId}/security-boat-assignments`);
      renderSecurityBoats();
      _queueCellFlash(date, funcId);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  }

  async function _sbDoCellCycle(funcId, assignmentId, date) {
    const asgn = state.securityAssignments.find(a => a.id === assignmentId);
    if (!asgn) return;
    const overrides = JSON.parse(asgn.day_overrides || '{}');
    overrides[date] = 'empty';
    try {
      await api('PUT', `/api/security-boat-assignments/${assignmentId}`, { day_overrides: JSON.stringify(overrides) });
      const idx = state.securityAssignments.findIndex(a => a.id === assignmentId);
      if (idx >= 0) state.securityAssignments[idx].day_overrides = JSON.stringify(overrides);
      renderSecurityBoats();
      _queueCellFlash(date, funcId);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  }

  function sbOnFuncCellClick(event, funcId) {
    event.stopPropagation();
    const el = $('schedule-popover');
    if (_schPop.funcId === funcId && !el.classList.contains('hidden')) {
      closeSchedulePopover(); return;
    }
    _schPop = { assignmentId: null, funcId, date: null, type: 'sbfunc' };
    const func = state.securityFunctions.find(f => f.id === funcId);
    const asgns = _sbAssignmentsForFunc(funcId);
    const asgnRows = asgns.length
      ? asgns.map(a => {
          const boatName = a.boat_name_override || a.boat_name || '--';
          return `<div class="sch-pop-asgn-row">
            <span style="flex:1;font-size:.75rem;overflow:hidden;text-overflow:ellipsis;color:var(--text-0)">${esc(boatName)}</span>
            <button class="btn btn-sm btn-icon btn-secondary"
              onclick="App.sbEditAssignmentById(${a.id});App.closeSchedulePopover()" title="Edit">&#9998;</button>
            <button class="btn btn-sm btn-icon btn-danger"
              onclick="App.sbRemoveAssignmentById(${a.id})" title="Remove">&#10005;</button>
          </div>`;
        }).join('')
      : `<div style="color:var(--text-4);font-size:.75rem;padding:.25rem 0">No boat assigned</div>`;
    $('sch-pop-content').innerHTML = `
      <div class="sch-pop-header">
        <strong>${esc(func?.name || '')}</strong>
        <span style="color:var(--text-4);font-size:.65rem;margin-left:.4rem">${esc(func?.function_group || '')}</span>
      </div>
      ${asgnRows}
      <div class="sch-pop-actions" style="margin-top:.4rem">
        <button onclick="App.sbAssignFromDate(${funcId},null)">+ Assign a boat</button>
      </div>`;
    const rect = event.target.getBoundingClientRect();
    el.style.left = (rect.right + 4) + 'px';
    el.style.top  = rect.top + 'px';
    el.classList.remove('hidden');
  }

  function sbAssignFromDate(funcId, date) {
    closeSchedulePopover();
    _tabCtx = 'security';
    if (state.sbSelectedBoat) {
      openAssignModal(funcId, state.sbSelectedBoat, null, date);
      state.sbSelectedBoat = null;
    } else {
      state.sbPendingFuncId = funcId;
      state.sbPendingDate   = date;
      toast('Now click a boat in the sidebar to assign it', 'info');
    }
  }

  function sbToggleDayLock(date, locked) {
    if (locked) state.sbLockedDays[date] = true;
    else delete state.sbLockedDays[date];
    try { localStorage.setItem('sb_locked_days', JSON.stringify(state.sbLockedDays)); } catch(e) {}
    renderSbSchedule();
  }

  // ── Security Boats Budget view ──────────────────────────────
  function renderSbBudget() {
    const container = $('sb-budget-content');
    if (!container) return;
    const sbAsgns = state.securityAssignments;
    const sbFuncs = state.securityFunctions;
    const rows = sbAsgns.map(a => {
      const func = sbFuncs.find(f => f.id === a.boat_function_id);
      const wd   = computeWd(a);
      const rate = a.price_override || a.boat_daily_rate_estimate || 0;
      return { name: func?.name || a.function_name || '--', boat: a.boat_name_override || a.boat_name || '--',
               start: a.start_date, end: a.end_date, wd, rate, total: Math.round(wd * rate) };
    });

    function rowFigeAmount(row) {
      if (!row.start || !row.end || !row.total) return 0;
      const cur = new Date(row.start + 'T00:00:00');
      const end = new Date(row.end   + 'T00:00:00');
      let total = 0, lockedCount = 0;
      while (cur <= end) {
        total++;
        if (state.sbLockedDays[_localDk(cur)]) lockedCount++;
        cur.setDate(cur.getDate() + 1);
      }
      return total === 0 ? 0 : Math.round(row.total * lockedCount / total);
    }

    const totalGlobal   = rows.reduce((s, r) => s + r.total, 0);
    const totalFige     = rows.reduce((s, r) => s + rowFigeAmount(r), 0);
    const totalEstimate = totalGlobal - totalFige;

    container.innerHTML = `
      <div class="stat-grid" style="margin-bottom:.75rem">
        <div class="stat-card" style="border:1px solid var(--border)">
          <div class="stat-val">${fmtMoney(totalGlobal)}</div>
          <div class="stat-lbl">TOTAL GLOBAL</div>
        </div>
        <div class="stat-card" style="border:1px solid var(--green);background:rgba(34,197,94,.07)">
          <div class="stat-val" style="color:var(--green)">${fmtMoney(totalFige)}</div>
          <div class="stat-lbl">UP TO DATE <span style="font-size:.6rem;opacity:.55">(locked)</span></div>
        </div>
        <div class="stat-card" style="border:1px solid #F59E0B;background:rgba(245,158,11,.07)">
          <div class="stat-val" style="color:#F59E0B">${fmtMoney(totalEstimate)}</div>
          <div class="stat-lbl">ESTIMATE</div>
        </div>
      </div>
      <div class="budget-dept-card">
        <table class="budget-table">
          <thead>
            <tr>
              <th>Function</th>
              <th style="text-align:left">Boat</th>
              <th>Start</th><th>End</th>
              <th>Days</th><th>$/day</th><th>Total $</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r, i) => `<tr style="${i%2 ? 'background:var(--bg-surface)' : ''}">
              <td style="color:var(--text-1)">${esc(r.name)}</td>
              <td style="color:var(--cyan)">${esc(r.boat)}</td>
              <td style="font-size:.72rem;color:var(--text-3)">${fmtDate(r.start)}</td>
              <td style="font-size:.72rem;color:var(--text-3)">${fmtDate(r.end)}</td>
              <td style="text-align:right;color:var(--text-2)">${r.wd ?? '--'}</td>
              <td style="text-align:right;color:var(--text-3)">${fmtMoney(r.rate)}</td>
              <td style="text-align:right;font-weight:700;color:var(--green)">${fmtMoney(r.total)}</td>
            </tr>`).join('')}
            <tr class="budget-total-row">
              <td colspan="6" style="text-align:right;color:var(--text-1)">TOTAL SECURITY BOATS</td>
              <td style="text-align:right;color:var(--green);font-size:1.05rem">${fmtMoney(totalGlobal)}</td>
            </tr>
          </tbody>
        </table>
      </div>`;
  }

  // ── Security Boats Drag & Drop ──────────────────────────────
  function sbOnBoatDragStart(event, boatId) {
    state.sbDragBoat = state.securityBoats.find(b => b.id === boatId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', boatId);
    document.getElementById(`sb-boat-card-${boatId}`)?.classList.add('dragging');
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.textContent = state.sbDragBoat?.name || 'Boat';
    document.body.appendChild(ghost);
    event.dataTransfer.setDragImage(ghost, 60, 15);
    setTimeout(() => ghost.remove(), 0);
  }
  function sbOnBoatDragEnd() {
    state.sbDragBoat = null;
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  }
  function sbOnDragOver(event, funcId) {
    event.preventDefault();
    document.getElementById(`sb-role-card-${funcId}`)?.classList.add('drag-over');
    document.getElementById(`sb-drop-${funcId}`)?.classList.add('drag-over');
  }
  function sbOnDragLeave(event, funcId) {
    document.getElementById(`sb-role-card-${funcId}`)?.classList.remove('drag-over');
    document.getElementById(`sb-drop-${funcId}`)?.classList.remove('drag-over');
  }
  function sbOnDrop(event, funcId) {
    event.preventDefault();
    document.getElementById(`sb-role-card-${funcId}`)?.classList.remove('drag-over');
    document.getElementById(`sb-drop-${funcId}`)?.classList.remove('drag-over');
    const boat = state.sbDragBoat;
    if (!boat) return;
    state.sbDragBoat = null;
    _tabCtx = 'security';
    openAssignModal(funcId, boat);
  }
  function sbOnDropZoneClick(funcId) {
    if (state.sbSelectedBoat) {
      _tabCtx = 'security';
      openAssignModal(funcId, state.sbSelectedBoat);
      state.sbSelectedBoat = null;
    } else {
      state.sbPendingFuncId = funcId;
      state.sbPendingDate   = null;
      toast('Now click a boat to assign it', 'info');
      renderSbBoatList();
    }
  }

  function sbOpenBoatView(boatId) {
    const boat = state.securityBoats.find(b => b.id === boatId);
    if (!boat) return;
    if (state.sbPendingFuncId) {
      _tabCtx = 'security';
      openAssignModal(state.sbPendingFuncId, boat, null, state.sbPendingDate);
      state.sbPendingFuncId = null; state.sbPendingDate = null; state.sbSelectedBoat = null;
      renderSbBoatList();
      return;
    }
    _tabCtx = 'security';
    _openSecurityBoatView(boat);
  }

  function _openSecurityBoatView(boat) {
    const photo = $('bv-photo');
    const phPh  = $('bv-photo-placeholder');
    if (boat.image_path) {
      photo.src = '/' + boat.image_path + '?t=' + Date.now();
      photo.style.display = 'block'; phPh.style.display = 'none';
    } else {
      photo.style.display = 'none'; phPh.style.display = 'flex';
      phPh.textContent = '#' + (boat.boat_nr || '?');
    }
    $('bv-name').textContent     = boat.name || '?';
    $('bv-nr-group').textContent = [
      boat.boat_nr ? `#${boat.boat_nr}` : null,
      boat.group_name,
    ].filter(Boolean).join(' . ');
    const wClass = waveClass(boat.wave_rating);
    $('bv-badges').innerHTML = `
      <span class="wave-badge ${wClass}">${waveLabel(boat.wave_rating)}</span>
      ${boat.capacity ? `<span class="bv-badge-chip">${esc(boat.capacity)} pax</span>` : ''}
      ${boat.night_ok ? '<span class="night-badge">NIGHT</span>' : ''}`;
    const fields = [
      boat.captain              ? ['Captain',   boat.captain]  : null,
      boat.vendor               ? ['Vendor',    boat.vendor]   : null,
      boat.daily_rate_estimate > 0 ? ['Rate est.', `$${Math.round(boat.daily_rate_estimate).toLocaleString('en-US')}/day`] : null,
      boat.notes                ? ['Notes',     boat.notes]    : null,
    ].filter(Boolean);
    $('bv-fields').innerHTML = fields.map(([label, value]) =>
      `<span class="bv-field-label">${esc(label)}</span><span class="bv-field-value">${esc(value)}</span>`
    ).join('');
    const asgns = state.securityAssignments.filter(a => a.security_boat_id === boat.id);
    $('bv-assignments').innerHTML = asgns.length
      ? asgns.map(a => `<div class="bd-asgn-row">
          <span style="font-weight:600;color:var(--text-0)">${esc(a.function_name || '?')}</span>
          <span style="color:var(--text-3);font-size:.72rem">${fmtDate(a.start_date)} -> ${fmtDate(a.end_date)}</span>
        </div>`).join('')
      : '<div style="color:var(--text-4);font-size:.78rem">No assignments yet</div>';
    $('bv-edit-btn').onclick = () => { closeBoatView(); openSecurityBoatDetail(boat.id); };
    $('boat-view-overlay').classList.remove('hidden');
  }

  // ── Security Boat detail/edit (reuses boat-detail-overlay) ──
  function openSecurityBoatDetail(sbId) {
    const sb = state.securityBoats.find(b => b.id === sbId);
    if (!sb) return;
    _detailBoatId          = sbId;
    _detailIsPicture       = false;
    _detailIsTransport     = false;
    _detailIsSecurityBoat  = true;

    const photo = $('bd-photo');
    const placeholder = $('bd-photo-placeholder');
    if (sb.image_path) {
      photo.src = '/' + sb.image_path + '?t=' + Date.now();
      photo.style.display = 'block'; placeholder.style.display = 'none';
    } else {
      photo.style.display = 'none'; placeholder.style.display = 'flex';
      placeholder.textContent = '#' + (sb.boat_nr || '?');
    }

    $('bd-name').value    = sb.name || '';
    $('bd-nr').value      = sb.boat_nr || '';
    $('bd-group').value   = sb.group_name || 'SAFETY';
    $('bd-category').value = 'security';
    $('bd-capacity').value = sb.capacity || '';
    $('bd-captain').value  = sb.captain  || '';
    $('bd-vendor').value   = sb.vendor   || '';
    $('bd-waves').value    = sb.wave_rating || 'Waves';
    $('bd-night').checked  = !!sb.night_ok;
    $('bd-rate-est').value = sb.daily_rate_estimate || '';
    $('bd-rate-act').value = sb.daily_rate_actual   || '';
    $('bd-notes').value    = sb.notes || '';

    // Hide category row
    const catRow = $('bd-category')?.closest('tr');
    if (catRow) catRow.style.display = 'none';

    const asgns = state.securityAssignments.filter(a => a.security_boat_id === sbId);
    $('bd-assignments-list').innerHTML = asgns.length
      ? asgns.map(a => `<div class="bd-asgn-row">
          <span style="font-weight:600;color:var(--text-0)">${esc(a.function_name || '?')}</span>
          <span style="color:var(--text-3);font-size:.72rem">${fmtDate(a.start_date)} -> ${fmtDate(a.end_date)}</span>
        </div>`).join('')
      : '<div style="color:var(--text-4);font-size:.78rem">No assignments yet</div>';

    $('bd-delete-btn').classList.remove('hidden');
    $('bd-delete-btn').onclick = () => deleteSecurityBoat(sbId);
    $('boat-detail-overlay').classList.remove('hidden');
  }

  async function deleteSecurityBoat(sbId) {
    showConfirm('Delete this security boat? All assignments will be lost.', async () => {
      try {
        await api('DELETE', `/api/security-boats/${sbId}`);
        state.securityBoats       = state.securityBoats.filter(b => b.id !== sbId);
        state.securityAssignments = state.securityAssignments.filter(a => a.security_boat_id !== sbId);
        closeBoatDetail();
        renderSecurityBoats();
        toast('Security boat deleted');
      } catch (e) { toast('Error: ' + e.message, 'error'); }
    });
  }

  // ── Security Boat assignment edit/remove ────────────────────
  function sbEditAssignmentById(assignmentId) {
    const asgn = state.securityAssignments.find(a => a.id === assignmentId);
    if (!asgn) return;
    const boat = state.securityBoats.find(b => b.id === asgn.security_boat_id)
      || { id: asgn.security_boat_id || 0, name: asgn.boat_name_override || asgn.boat_name || '?', daily_rate_estimate: 0 };
    _tabCtx = 'security';
    openAssignModal(asgn.boat_function_id, boat, asgn);
  }

  async function sbRemoveAssignmentById(assignmentId) {
    try {
      await api('DELETE', `/api/security-boat-assignments/${assignmentId}`);
      state.securityAssignments = state.securityAssignments.filter(a => a.id !== assignmentId);
      renderSecurityBoats();
      toast('Assignment removed');
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  }

  async function sbConfirmDeleteFunc(funcId) {
    const func = state.securityFunctions.find(f => f.id === funcId);
    showConfirm(`Delete function "${func?.name}"? The assignment will be lost.`, async () => {
      try {
        await api('DELETE', `/api/boat-functions/${funcId}`);
        state.securityFunctions   = state.securityFunctions.filter(f => f.id !== funcId);
        state.securityAssignments = state.securityAssignments.filter(a => a.boat_function_id !== funcId);
        renderSbRoleCards();
        toast('Function deleted');
      } catch (e) { toast('Error: ' + e.message, 'error'); }
    });
  }

  async function sbUndoBoat() {
    try {
      const res = await api('POST', `/api/productions/${state.prodId}/undo`);
      toast(res.message || 'Undo done');
      state.securityAssignments = await api('GET', `/api/productions/${state.prodId}/security-boat-assignments`);
      renderSecurityBoats();
    } catch (e) {
      toast('Nothing to undo', 'info');
    }
  }

  // ── Security Boats Export ───────────────────────────────────
  function sbToggleExport() { $('sb-export-menu')?.classList.toggle('hidden'); }
  function sbExportCSV()  { authDownload(`/api/productions/${state.prodId}/export/security-boats/csv`);  $('sb-export-menu')?.classList.add('hidden'); }
  function sbExportJSON() { authDownload(`/api/productions/${state.prodId}/export/security-boats/json`); $('sb-export-menu')?.classList.add('hidden'); }

  // ── Security Boat CRUD modals ──────────────────────────────
  function showAddSecurityBoatModal(editId) {
    const el = $('add-security-boat-overlay');
    if (!el) return;
    if (editId) {
      const boat = (state.securityBoats || []).find(b => b.id === editId);
      if (!boat) return;
      $('nsb-name').value = boat.name || '';
      $('nsb-price').value = boat.daily_rate_estimate || '';
      $('nsb-capacity').value = boat.capacity || '';
      $('nsb-captain').value = boat.captain || '';
      $('nsb-wave').value = boat.wave_rating || 'Waves';
      $('nsb-vendor').value = boat.vendor || '';
      $('nsb-notes').value = boat.notes || '';
      $('nsb-edit-id').value = String(boat.id);
      $('nsb-modal-title').textContent = 'Edit security boat';
      $('nsb-confirm-btn').textContent = 'Save';
      $('nsb-delete-btn').classList.remove('hidden');
    } else {
      $('nsb-name').value = '';
      $('nsb-price').value = '';
      $('nsb-capacity').value = '';
      $('nsb-captain').value = '';
      $('nsb-wave').value = 'Waves';
      $('nsb-vendor').value = '';
      $('nsb-notes').value = '';
      $('nsb-edit-id').value = '';
      $('nsb-modal-title').textContent = 'Add a security boat';
      $('nsb-confirm-btn').textContent = 'Create';
      $('nsb-delete-btn').classList.add('hidden');
    }
    el.classList.remove('hidden');
  }

  function closeAddSecurityBoatModal() {
    $('add-security-boat-overlay')?.classList.add('hidden');
  }

  async function saveSecurityBoat() {
    const name = $('nsb-name').value.trim();
    if (!name) { toast('Name is required', 'error'); return; }
    const editId = $('nsb-edit-id').value;
    const data = {
      name,
      daily_rate_estimate: parseFloat($('nsb-price').value) || 0,
      capacity: $('nsb-capacity').value.trim(),
      captain: $('nsb-captain').value.trim(),
      wave_rating: $('nsb-wave').value,
      vendor: $('nsb-vendor').value.trim(),
      notes: $('nsb-notes').value.trim(),
    };
    try {
      if (editId) {
        await api('PUT', `/api/security-boats/${editId}`, data);
        toast('Security boat updated');
      } else {
        data.production_id = state.prodId;
        await api('POST', `/api/productions/${state.prodId}/security-boats`, data);
        toast('Security boat created');
      }
      const [boats, functions, assignments] = await Promise.all([
        api('GET', `/api/productions/${state.prodId}/security-boats`),
        api('GET', `/api/productions/${state.prodId}/boat-functions?context=security`),
        api('GET', `/api/productions/${state.prodId}/security-boat-assignments`),
      ]);
      state.securityBoats     = boats;
      state.securityFunctions = functions;
      state.securityAssignments = assignments;
      closeAddSecurityBoatModal();
      renderSecurityBoats();
    } catch(e) { toast('Error: ' + e.message, 'error'); }
  }

  async function deleteSecurityBoatFromModal() {
    const editId = $('nsb-edit-id').value;
    if (!editId) return;
    const boat = (state.securityBoats || []).find(b => b.id === parseInt(editId));
    if (!confirm(`Delete security boat "${boat?.name}"? This will also remove all its assignments.`)) return;
    try {
      await api('DELETE', `/api/security-boats/${editId}`);
      toast('Security boat deleted');
      const [boats, functions, assignments] = await Promise.all([
        api('GET', `/api/productions/${state.prodId}/security-boats`),
        api('GET', `/api/productions/${state.prodId}/boat-functions?context=security`),
        api('GET', `/api/productions/${state.prodId}/security-boat-assignments`),
      ]);
      state.securityBoats     = boats;
      state.securityFunctions = functions;
      state.securityAssignments = assignments;
      closeAddSecurityBoatModal();
      renderSecurityBoats();
    } catch(e) { toast('Error: ' + e.message, 'error'); }
  }

  function sbShowAddFunctionModal() {
    ['nf-name','nf-specs','nf-start','nf-end'].forEach(id => $(id).value = '');
    $('nf-group').innerHTML = (state.sbGroups || DEFAULT_SB_GROUPS).map(g => `<option value="${g.name}">${g.name}</option>`).join('');
    $('nf-group').value = (state.sbGroups || DEFAULT_SB_GROUPS)[0]?.name || '';
    $('nf-color').value = (state.sbGroups || DEFAULT_SB_GROUPS)[0]?.color || '#EF4444';
    $('nf-group').onchange = (e) => {
      const g = (state.sbGroups || DEFAULT_SB_GROUPS).find(g => g.name === e.target.value);
      $('nf-color').value = g?.color || '#6b7280';
    };
    $('add-func-overlay').dataset.ctx = 'security';
    $('add-func-overlay').classList.remove('hidden');
    setTimeout(() => $('nf-name').focus(), 80);
  }



  // ═══════════════════════════════════════════════════════════
  //  LOCATIONS MODULE (P/F/W Schedule)
  // ═══════════════════════════════════════════════════════════

  // Location sites are now loaded from API into state.locationSites
  // Dates use SCHEDULE_START / SCHEDULE_END (same as BOATS)

  function _locDates() {
    const dates = [];
    const cur = new Date(SCHEDULE_START);
    while (cur <= SCHEDULE_END) {
      dates.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  }

  async function renderLocations() {
    const container = $('view-locations');
    if (!container) return;

    // Load location sites from API
    if (!state.locationSites) {
      try {
        state.locationSites = await api('GET', `/api/productions/${state.prodId}/locations`);
      } catch(e) { state.locationSites = []; }
    }

    // Load location schedules from API
    if (!state.locationSchedules) {
      try {
        state.locationSchedules = await api('GET', `/api/productions/${state.prodId}/location-schedules`);
      } catch(e) { state.locationSchedules = []; }
    }
    if (!state.locSubTab) state.locSubTab = 'all';
    if (!state.locView) state.locView = 'schedule';

    if (state.locView === 'budget') {
      renderLocBudget();
    } else {
      renderLocSchedule();
    }
  }

  function locSetView(view) {
    state.locView = view;
    renderLocations();
    _updateBreadcrumb(view === 'schedule' ? 'Schedule' : 'Sites');
  }

  function renderLocSchedule() {
    const container = $('view-locations');
    if (!container) return;

    const sites = state.locationSites || [];
    const schedules = state.locationSchedules || [];
    const dates = _locDates();

    // PDT lookup for tooltips on day headers
    const pdtByDate = {};
    state.shootingDays.forEach(day => { pdtByDate[day.date] = day; });
    // Build lookup: key = "LOCNAME|DATE" -> {status, locked}
    const lookup = {};
    schedules.forEach(s => {
      lookup[`${s.location_name}|${s.date}`] = s;
    });

    // Filter sites by sub-tab
    const filteredSites = state.locSubTab === 'all' ? sites
      : sites.filter(s => s.location_type === state.locSubTab);

    // Count stats
    const pCount = schedules.filter(s => s.status === 'P').length;
    const fCount = schedules.filter(s => s.status === 'F').length;
    const wCount = schedules.filter(s => s.status === 'W').length;

    // Locked dates set
    const lockedDates = new Set();
    schedules.forEach(s => { if (s.locked) lockedDates.add(s.date); });

    let html = `<div style="padding:1rem">
      <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.75rem;flex-wrap:wrap">
        <span class="section-title" style="margin:0">Filming Locations</span>
        <span style="font-size:.75rem;color:var(--text-3)">${sites.length} sites</span>
        <div class="view-toggle" style="margin-left:1rem">
          <button class="${state.locView === 'schedule' ? 'active' : ''}" onclick="App.locSetView('schedule')">Schedule</button>
          <button class="${state.locView === 'budget' ? 'active' : ''}" onclick="App.locSetView('budget')">Budget</button>
        </div>
        <div style="margin-left:auto;display:flex;gap:.3rem">
          <button class="btn btn-sm btn-primary" onclick="App.showAddLocationModal()">+ Add Location</button>
          <button class="btn btn-sm btn-secondary" onclick="App.locAutoFill()">Auto-fill from PDT</button>
          <button class="btn btn-sm btn-secondary" onclick="App.locResyncPdt()" title="Resync all PDT locations (normalized matching)">Resync PDT</button>
          <button class="btn btn-sm btn-secondary" onclick="App.openCsvImportModal('locations')">Import CSV</button>
          <button class="btn btn-sm btn-secondary" onclick="App.locExportCSV()">Export CSV</button>
        </div>
      </div>
      <div class="stat-grid" style="margin-bottom:.75rem">
        <div class="stat-card" style="border-left:3px solid #EAB308">
          <div class="stat-val" style="font-size:1.3rem;color:#EAB308">${pCount}</div>
          <div class="stat-lbl">PREP (P)</div>
        </div>
        <div class="stat-card" style="border-left:3px solid #22C55E">
          <div class="stat-val" style="font-size:1.3rem;color:#22C55E">${fCount}</div>
          <div class="stat-lbl">FILMING (F)</div>
        </div>
        <div class="stat-card" style="border-left:3px solid #3B82F6">
          <div class="stat-val" style="font-size:1.3rem;color:#3B82F6">${wCount}</div>
          <div class="stat-lbl">WRAP (W)</div>
        </div>
      </div>
      <div style="display:flex;gap:.3rem;margin-bottom:.75rem;flex-wrap:wrap">
        ${['all', 'tribal_camp', 'game', 'reward'].map(t => {
          const label = t === 'all' ? 'ALL' : t === 'tribal_camp' ? 'TRIBAL CAMPS' : t === 'game' ? 'GAMES' : 'REWARDS';
          return `<button class="filter-pill ${state.locSubTab === t ? 'active' : ''}" onclick="App.locSetSubTab('${t}')">${label}</button>`;
        }).join('')}
      </div>
      <div class="loc-schedule-wrap" style="overflow-x:auto">
        <table class="loc-schedule-table">
          <thead>
            ${(() => {
              const _mn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
              const _mg = []; let _pm = -1, _mc = 0;
              dates.forEach(d => {
                const m = new Date(d + 'T00:00:00').getMonth();
                if (m !== _pm) { if (_pm >= 0) _mg.push({ m: _pm, cnt: _mc }); _pm = m; _mc = 1; } else _mc++;
              });
              _mg.push({ m: _pm, cnt: _mc });
              return '<tr><th class="loc-th-name" style="position:sticky;left:0;z-index:3;background:var(--bg-surface);min-width:140px"></th>'
                + _mg.map(mg => '<th colspan="' + mg.cnt + '" style="text-align:center;font-size:.65rem;color:var(--text-3);padding:2px 0">' + _mn[mg.m] + '</th>').join('')
                + '</tr>';
            })()}
            <tr>
              <th class="loc-th-name" style="position:sticky;left:0;z-index:3;background:var(--bg-surface);min-width:140px">Location</th>
              ${dates.map(d => {
                const dt = new Date(d + 'T00:00:00');
                const day = dt.getDate();
                const wd = dt.toLocaleDateString('en-US', { weekday: 'short' }).slice(0,2);
                const isLocked = lockedDates.has(d);
                const hasPdt = !!pdtByDate[d];
                return `<th class="loc-th-date ${isLocked ? 'loc-locked' : ''} ${hasPdt ? 'loc-has-pdt' : ''}" style="min-width:32px;text-align:center;position:relative"
                  onmouseenter="App.showDateTooltip(event,'${d}')"
                  onmouseleave="App.hidePDTTooltip()">
                  <div style="font-size:.6rem;color:var(--text-4)">${wd}</div>
                  <div style="font-size:.7rem">${day}</div>
                </th>`;
              }).join('')}
            </tr>
          </thead>
          <tbody>
            ${filteredSites.map(site => {
              const sType = site.location_type || 'game';
              const typeColor = sType === 'tribal_camp' ? '#EAB308' : sType === 'game' ? '#22C55E' : '#3B82F6';
              return `<tr>
                <td class="loc-td-name" style="position:sticky;left:0;z-index:2;background:var(--bg-card);border-right:1px solid var(--border);cursor:pointer"
                    onclick="App.editLocationSite(${site.id})">
                  <div style="display:flex;align-items:center;gap:.3rem">
                    <span style="width:8px;height:8px;border-radius:2px;background:${typeColor};flex-shrink:0"></span>
                    <span style="font-size:.72rem;font-weight:600;white-space:nowrap">${esc(site.name)}</span>
                  </div>
                </td>
                ${dates.map(d => {
                  const key = `${site.name}|${d}`;
                  const cell = lookup[key];
                  const status = cell ? cell.status : '';
                  const isLocked = cell ? cell.locked : false;
                  const cellClass = status ? `loc-cell-${status}` : 'loc-cell-empty';
                  const lockedClass = isLocked ? ' loc-locked-cell' : '';
                  return `<td class="${cellClass}${lockedClass}" style="text-align:center;cursor:${isLocked ? 'not-allowed' : 'pointer'};min-width:32px;height:28px"
                    onclick="App.locCellClick('${esc(site.name)}','${esc(sType)}','${d}',${isLocked ? 'true' : 'false'})">${status}</td>`;
                }).join('')}
              </tr>`;
            }).join('')}
            <tr class="loc-lock-row">
              <td style="position:sticky;left:0;z-index:2;background:var(--bg-surface);font-size:.65rem;font-weight:700;color:var(--text-4);border-right:1px solid var(--border)">LOCK</td>
              ${dates.map(d => {
                const isLocked = lockedDates.has(d);
                return `<td style="text-align:center;cursor:pointer;font-size:.7rem" onclick="App.locToggleLock('${d}')">
                  ${isLocked ? '<span style="color:#22C55E">&#x1F512;</span>' : '<span style="color:var(--text-4)">&#x1F513;</span>'}
                </td>`;
              }).join('')}
            </tr>
          </tbody>
        </table>
      </div>
    </div>`;
    const _scrollSaved = _saveScheduleScroll(container);
    container.innerHTML = html;
    _restoreScheduleScroll(container, _scrollSaved);
  }

  function renderLocBudget() {
    const container = $('view-locations');
    if (!container) return;

    const sites = state.locationSites || [];
    const schedules = state.locationSchedules || [];

    // Count P/F/W per location
    const byLoc = {};
    schedules.forEach(s => {
      if (!byLoc[s.location_name]) byLoc[s.location_name] = { P: 0, F: 0, W: 0 };
      if (s.status === 'P' || s.status === 'F' || s.status === 'W') {
        byLoc[s.location_name][s.status]++;
      }
    });

    // Build budget rows per location
    const rows = sites.map(site => {
      const counts = byLoc[site.name] || { P: 0, F: 0, W: 0 };
      const priceP = site.price_p || 0;
      const priceF = site.price_f || 0;
      const priceW = site.price_w || 0;
      const globalDeal = site.global_deal || 0;
      const hasGlobalDeal = globalDeal > 0;
      const totalDays = counts.P + counts.F + counts.W;

      let total;
      if (hasGlobalDeal) {
        total = globalDeal;
      } else {
        total = counts.P * priceP + counts.F * priceF + counts.W * priceW;
      }

      const sType = site.location_type || 'game';
      const typeColor = sType === 'tribal_camp' ? '#EAB308' : sType === 'game' ? '#22C55E' : '#3B82F6';
      const typeLabel = sType === 'tribal_camp' ? 'TRIBAL CAMP' : sType === 'game' ? 'GAME' : 'REWARD';

      return {
        name: site.name, sType, typeColor, typeLabel,
        pDays: counts.P, fDays: counts.F, wDays: counts.W,
        totalDays, priceP, priceF, priceW,
        hasGlobalDeal, globalDeal, total
      };
    }).filter(r => r.totalDays > 0 || r.hasGlobalDeal);

    // Sort by total descending
    rows.sort((a, b) => b.total - a.total);

    const grandTotal = rows.reduce((s, r) => s + r.total, 0);
    const totalSites = rows.length;
    const totalDaysAll = rows.reduce((s, r) => s + r.totalDays, 0);
    const globalDealCount = rows.filter(r => r.hasGlobalDeal).length;

    // Locked days: count how many location-schedule cells are locked
    const lockedDates = new Set();
    schedules.forEach(s => { if (s.locked) lockedDates.add(s.date); });

    // Compute locked vs estimate portions per location
    let totalLocked = 0;
    rows.forEach(r => {
      if (r.hasGlobalDeal) {
        // For global deals: if ANY day for this location is locked, count proportionally
        const locSchedules = schedules.filter(s => s.location_name === r.name);
        const locDays = locSchedules.length;
        const locLockedDays = locSchedules.filter(s => lockedDates.has(s.date)).length;
        r.lockedAmount = locDays > 0 ? Math.round(r.total * locLockedDays / locDays) : 0;
      } else {
        // Per-day pricing: sum locked days at their respective rates
        const locSchedules = schedules.filter(s => s.location_name === r.name && lockedDates.has(s.date));
        r.lockedAmount = locSchedules.reduce((sum, s) => {
          if (s.status === 'P') return sum + r.priceP;
          if (s.status === 'F') return sum + r.priceF;
          if (s.status === 'W') return sum + r.priceW;
          return sum;
        }, 0);
      }
      totalLocked += r.lockedAmount;
    });
    const totalEstimate = grandTotal - totalLocked;

    let html = `<div style="padding:1rem">
      <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.75rem;flex-wrap:wrap">
        <span class="section-title" style="margin:0">Filming Locations</span>
        <span style="font-size:.75rem;color:var(--text-3)">${sites.length} sites</span>
        <div class="view-toggle" style="margin-left:1rem">
          <button class="${state.locView === 'schedule' ? 'active' : ''}" onclick="App.locSetView('schedule')">Schedule</button>
          <button class="${state.locView === 'budget' ? 'active' : ''}" onclick="App.locSetView('budget')">Budget</button>
        </div>
        <div style="margin-left:auto;display:flex;gap:.3rem">
          <button class="btn btn-sm btn-primary" onclick="App.showAddLocationModal()">+ Add Location</button>
          <button class="btn btn-sm btn-secondary" onclick="App.openCsvImportModal('locations')">Import CSV</button>
          <button class="btn btn-sm btn-secondary" onclick="App.locExportCSV()">Export CSV</button>
        </div>
      </div>
      <div class="stat-grid" style="margin-bottom:.75rem">
        <div class="stat-card" style="border:1px solid var(--border)">
          <div class="stat-val" style="font-size:1.5rem">${fmtMoney(grandTotal)}</div>
          <div class="stat-lbl">TOTAL LOCATIONS</div>
        </div>
        <div class="stat-card" style="border:1px solid var(--green);background:rgba(34,197,94,.07)">
          <div class="stat-val" style="font-size:1.5rem;color:var(--green)">${fmtMoney(totalLocked)}</div>
          <div class="stat-lbl">UP TO DATE <span style="font-size:.6rem;opacity:.55">(frozen)</span></div>
        </div>
        <div class="stat-card" style="border:1px solid #F59E0B;background:rgba(245,158,11,.07)">
          <div class="stat-val" style="font-size:1.5rem;color:#F59E0B">${fmtMoney(totalEstimate)}</div>
          <div class="stat-lbl">ESTIMATE</div>
        </div>
        <div class="stat-card" style="border-left:3px solid var(--cyan)">
          <div class="stat-val" style="font-size:1.3rem;color:var(--cyan)">${totalSites}</div>
          <div class="stat-lbl">ACTIVE SITES</div>
        </div>
      </div>
      <div class="budget-dept-card">
        <table class="budget-table">
          <thead>
            <tr>
              <th>Location</th>
              <th>Type</th>
              <th style="text-align:center">P days</th>
              <th style="text-align:center">F days</th>
              <th style="text-align:center">W days</th>
              <th style="text-align:right">$/P</th>
              <th style="text-align:right">$/F</th>
              <th style="text-align:right">$/W</th>
              <th style="text-align:right">Global Deal</th>
              <th style="text-align:right">Total $</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r, i) => `<tr style="${i % 2 ? 'background:var(--bg-surface)' : ''}">
              <td style="color:var(--text-1)">
                <div style="display:flex;align-items:center;gap:.3rem">
                  <span style="width:8px;height:8px;border-radius:2px;background:${r.typeColor};flex-shrink:0"></span>
                  ${esc(r.name)}
                </div>
              </td>
              <td style="font-size:.7rem;color:var(--text-3)">${esc(r.typeLabel)}</td>
              <td style="text-align:center;color:#EAB308;font-weight:${r.pDays ? '600' : '400'}">${r.pDays || '-'}</td>
              <td style="text-align:center;color:#22C55E;font-weight:${r.fDays ? '600' : '400'}">${r.fDays || '-'}</td>
              <td style="text-align:center;color:#3B82F6;font-weight:${r.wDays ? '600' : '400'}">${r.wDays || '-'}</td>
              <td style="text-align:right;font-size:.72rem;color:var(--text-3)">${r.hasGlobalDeal ? '-' : (r.priceP ? fmtMoney(r.priceP) : '-')}</td>
              <td style="text-align:right;font-size:.72rem;color:var(--text-3)">${r.hasGlobalDeal ? '-' : (r.priceF ? fmtMoney(r.priceF) : '-')}</td>
              <td style="text-align:right;font-size:.72rem;color:var(--text-3)">${r.hasGlobalDeal ? '-' : (r.priceW ? fmtMoney(r.priceW) : '-')}</td>
              <td style="text-align:right;font-size:.72rem;color:${r.hasGlobalDeal ? 'var(--cyan)' : 'var(--text-4)'};font-weight:${r.hasGlobalDeal ? '600' : '400'}">${r.hasGlobalDeal ? fmtMoney(r.globalDeal) : '-'}</td>
              <td style="text-align:right;font-weight:700;color:var(--green)">${fmtMoney(r.total)}</td>
            </tr>`).join('')}
            ${rows.length === 0 ? `<tr><td colspan="10" style="text-align:center;color:var(--text-4);padding:2rem">No location data yet. Add locations and set their schedule to see budget.</td></tr>` : ''}
            <tr class="budget-total-row">
              <td colspan="9" style="text-align:right;color:var(--text-1)">TOTAL LOCATIONS</td>
              <td style="text-align:right;color:var(--green);font-size:1.05rem">${fmtMoney(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>`;
    container.innerHTML = html;
  }

  function locSetSubTab(tab) {
    state.locSubTab = tab;
    renderLocations();
  }

  async function locCellClick(locName, locType, date, isLocked) {
    if (isLocked) { toast('This date is locked', 'info'); return; }
    const key = `${locName}|${date}`;
    const schedules = state.locationSchedules || [];
    const existing = schedules.find(s => s.location_name === locName && s.date === date);
    const statusCycle = ['P', 'F', 'W'];

    if (!existing) {
      // Empty -> P
      const result = await api('POST', `/api/productions/${state.prodId}/location-schedules`, {
        location_name: locName, location_type: locType, date, status: 'P'
      });
      if (result) state.locationSchedules.push(result);
    } else {
      const idx = statusCycle.indexOf(existing.status);
      if (idx < statusCycle.length - 1) {
        // P -> F -> W
        const newStatus = statusCycle[idx + 1];
        const result = await api('POST', `/api/productions/${state.prodId}/location-schedules`, {
          location_name: locName, location_type: locType, date, status: newStatus
        });
        if (result) {
          const i = state.locationSchedules.findIndex(s => s.location_name === locName && s.date === date);
          if (i >= 0) state.locationSchedules[i] = result;
        }
      } else {
        // W -> empty (delete)
        await api('POST', `/api/productions/${state.prodId}/location-schedules/delete`, {
          location_name: locName, date
        });
        state.locationSchedules = state.locationSchedules.filter(s => !(s.location_name === locName && s.date === date));
      }
    }
    renderLocations();
  }

  async function locToggleLock(date) {
    const schedules = state.locationSchedules || [];
    const isCurrentlyLocked = schedules.some(s => s.date === date && s.locked);
    await api('PUT', `/api/productions/${state.prodId}/location-schedules/lock`, {
      dates: [date], locked: !isCurrentlyLocked
    });
    // Refresh
    state.locationSchedules = await api('GET', `/api/productions/${state.prodId}/location-schedules`);
    renderLocations();
  }

  async function locAutoFill() {
    try {
      const result = await api('POST', `/api/productions/${state.prodId}/location-schedules/auto-fill`);
      toast(`Auto-fill: ${result.created || 0} cells created`);
      state.locationSchedules = await api('GET', `/api/productions/${state.prodId}/location-schedules`);
      renderLocations();
    } catch(e) { toast('Auto-fill error: ' + e.message, 'error'); }
  }

  async function locResyncPdt() {
    try {
      const result = await api('POST', `/api/productions/${state.prodId}/resync-pdt-locations`);
      const msgs = [];
      if (result.created?.length) msgs.push(`Created: ${result.created.join(', ')}`);
      if (result.matched?.length) msgs.push(`Matched: ${result.matched.length} location(s)`);
      toast(msgs.length ? msgs.join(' | ') : 'Resync complete, no changes', 'success');
      // Reload location data
      state.locationSites = await api('GET', `/api/productions/${state.prodId}/locations`);
      state.locationSchedules = await api('GET', `/api/productions/${state.prodId}/location-schedules`);
      renderLocations();
    } catch(e) { toast('Resync error: ' + e.message, 'error'); }
  }

  function locExportCSV() {
    const schedules = state.locationSchedules || [];
    const sites = state.locationSites || [];
    if (!schedules.length) { toast('No location data to export', 'info'); return; }

    // Build pricing lookup from sites
    const pricing = {};
    sites.forEach(s => {
      pricing[s.name] = {
        price_p: s.price_p || 0,
        price_f: s.price_f || 0,
        price_w: s.price_w || 0,
        global_deal: s.global_deal || null,
      };
    });

    // Group schedules by location
    const byLoc = {};
    schedules.forEach(s => {
      if (!byLoc[s.location_name]) byLoc[s.location_name] = [];
      byLoc[s.location_name].push(s);
    });

    let csv = 'Location,Date,Type (P/F/W),Price per P,Price per F,Price per W,Global Deal,Total Price\n';
    const locNames = Object.keys(byLoc).sort();
    for (const locName of locNames) {
      const entries = byLoc[locName].sort((a, b) => a.date.localeCompare(b.date));
      const p = pricing[locName] || { price_p: 0, price_f: 0, price_w: 0, global_deal: null };
      const counts = { P: 0, F: 0, W: 0 };
      entries.forEach(e => { if (counts[e.status] !== undefined) counts[e.status]++; });

      let total;
      if (p.global_deal && p.global_deal > 0) {
        total = p.global_deal;
      } else {
        total = counts.P * p.price_p + counts.F * p.price_f + counts.W * p.price_w;
      }

      // One row per day
      entries.forEach(e => {
        csv += `"${locName}","${e.date}","${e.status}","${p.price_p || ''}","${p.price_f || ''}","${p.price_w || ''}","${p.global_deal || ''}",""\n`;
      });
      // Summary row
      const daysSummary = [];
      if (counts.P) daysSummary.push(`${counts.P}P`);
      if (counts.F) daysSummary.push(`${counts.F}F`);
      if (counts.W) daysSummary.push(`${counts.W}W`);
      csv += `"${locName} - TOTAL","","${daysSummary.join(' + ')}","","","","","${total.toFixed(2)}"\n`;
    }

    const now = new Date();
    const yy = String(now.getFullYear()).slice(2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const fname = `KLAS7_LOCATIONS_${yy}${mm}${dd}.csv`;

    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    a.click();
  }

  // ── Location site CRUD modals ──────────────────────────────
  function showAddLocationModal() {
    $('nl-name').value = '';
    $('nl-type').value = 'game';
    $('nl-notes').value = '';
    $('nl-price-p').value = '';
    $('nl-price-f').value = '';
    $('nl-price-w').value = '';
    $('nl-global-deal').value = '';
    $('nl-edit-id').value = '';
    $('loc-modal-title').textContent = 'Add Location';
    $('nl-confirm-btn').textContent = 'Create';
    $('nl-delete-btn').classList.add('hidden');
    $('nl-schedule-section').style.display = 'none';
    $('add-location-overlay').classList.remove('hidden');
  }

  function editLocationSite(locId) {
    const site = (state.locationSites || []).find(s => s.id === locId);
    if (!site) return;
    $('nl-name').value = site.name || '';
    $('nl-type').value = site.location_type || 'game';
    $('nl-notes').value = site.access_note || '';
    $('nl-price-p').value = site.price_p != null ? site.price_p : '';
    $('nl-price-f').value = site.price_f != null ? site.price_f : '';
    $('nl-price-w').value = site.price_w != null ? site.price_w : '';
    $('nl-global-deal').value = site.global_deal != null ? site.global_deal : '';
    $('nl-edit-id').value = String(site.id);
    $('loc-modal-title').textContent = 'Edit Location';
    $('nl-confirm-btn').textContent = 'Save';
    $('nl-delete-btn').classList.remove('hidden');
    $('nl-schedule-section').style.display = '';
    _renderLocationScheduleInModal(site);
    $('add-location-overlay').classList.remove('hidden');
  }

  function closeAddLocationModal() {
    $('add-location-overlay').classList.add('hidden');
  }

  async function saveLocationSite() {
    const name = $('nl-name').value.trim();
    if (!name) { toast('Name is required', 'error'); return; }
    const editId = $('nl-edit-id').value;
    const pricePVal = $('nl-price-p').value.trim();
    const priceFVal = $('nl-price-f').value.trim();
    const priceWVal = $('nl-price-w').value.trim();
    const globalDealVal = $('nl-global-deal').value.trim();
    const data = {
      name,
      location_type: $('nl-type').value,
      access_note: $('nl-notes').value.trim(),
      price_p: pricePVal !== '' ? parseFloat(pricePVal) : null,
      price_f: priceFVal !== '' ? parseFloat(priceFVal) : null,
      price_w: priceWVal !== '' ? parseFloat(priceWVal) : null,
      global_deal: globalDealVal !== '' ? parseFloat(globalDealVal) : null,
    };
    try {
      if (editId) {
        // Get old name for reference
        const oldSite = (state.locationSites || []).find(s => s.id === parseInt(editId));
        await api('PUT', `/api/locations/${editId}`, data);
        toast('Location updated');
      } else {
        await api('POST', `/api/productions/${state.prodId}/locations`, data);
        toast('Location created');
      }
      // Reload
      state.locationSites = await api('GET', `/api/productions/${state.prodId}/locations`);
      state.locationSchedules = await api('GET', `/api/productions/${state.prodId}/location-schedules`);
      closeAddLocationModal();
      renderLocations();
    } catch(e) { toast('Error: ' + e.message, 'error'); }
  }

  async function deleteLocationSite() {
    const editId = $('nl-edit-id').value;
    if (!editId) return;
    const site = (state.locationSites || []).find(s => s.id === parseInt(editId));
    if (!confirm(`Delete location "${site?.name}"? This will also delete all schedule data for this site.`)) return;
    try {
      await api('DELETE', `/api/locations/${editId}`);
      toast('Location deleted');
      state.locationSites = await api('GET', `/api/productions/${state.prodId}/locations`);
      state.locationSchedules = await api('GET', `/api/productions/${state.prodId}/location-schedules`);
      closeAddLocationModal();
      renderLocations();
    } catch(e) { toast('Error: ' + e.message, 'error'); }
  }



  // ── Location Schedule inside Edit Modal ──────────────────

  function _renderLocationScheduleInModal(site) {
    const schedules = (state.locationSchedules || []).filter(s => s.location_name === site.name);
    const grid = $('nl-schedule-grid');
    if (!schedules.length) {
      grid.innerHTML = '<div style="color:var(--text-4);font-size:.72rem">No schedule entries yet.</div>';
      return;
    }
    const sorted = [...schedules].sort((a,b) => a.date.localeCompare(b.date));
    grid.innerHTML = `<table style="width:100%;font-size:.72rem;border-collapse:collapse">
      <thead><tr style="color:var(--text-3)">
        <th style="text-align:left;padding:.2rem .3rem">Date</th>
        <th style="text-align:center;padding:.2rem .3rem">Status</th>
        <th style="text-align:center;padding:.2rem .3rem"></th>
      </tr></thead>
      <tbody>${sorted.map(s => {
        const clr = s.status === 'P' ? 'var(--amber)' : s.status === 'F' ? 'var(--green)' : 'var(--accent)';
        return `<tr style="border-bottom:1px solid var(--border-lt)">
          <td style="padding:.2rem .3rem">${fmtDate(s.date)}</td>
          <td style="text-align:center"><span style="color:${clr};font-weight:700">${s.status}</span></td>
          <td style="text-align:center"><button class="btn btn-icon btn-sm btn-danger"
            onclick="App._locModalRemoveSchedule('${esc(site.name)}','${s.date}')"
            style="font-size:.55rem">✕</button></td>
        </tr>`;
      }).join('')}</tbody></table>`;
  }

  async function _locModalAddSchedule() {
    const editId = $('nl-edit-id').value;
    const site = (state.locationSites || []).find(s => s.id === parseInt(editId));
    if (!site) return;
    const startDate = $('nl-sched-date-start').value;
    const endDate = $('nl-sched-date-end').value || startDate;
    const status = $('nl-sched-status').value;
    if (!startDate) { toast('Select a start date', 'error'); return; }
    if (endDate < startDate) { toast('End date must be after start date', 'error'); return; }
    const cur = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    while (cur <= end) {
      const d = cur.toISOString().slice(0, 10);
      await api('POST', `/api/productions/${state.prodId}/location-schedules`, {
        location_name: site.name, location_type: site.location_type, date: d, status
      });
      cur.setDate(cur.getDate() + 1);
    }
    state.locationSchedules = await api('GET', `/api/productions/${state.prodId}/location-schedules`);
    _renderLocationScheduleInModal(site);
    renderLocations();
  }

  async function _locModalRemoveSchedule(locName, date) {
    await api('POST', `/api/productions/${state.prodId}/location-schedules/delete`, {
      location_name: locName, date
    });
    state.locationSchedules = state.locationSchedules.filter(s => !(s.location_name === locName && s.date === date));
    const editId = $('nl-edit-id').value;
    const site = (state.locationSites || []).find(s => s.id === parseInt(editId));
    if (site) _renderLocationScheduleInModal(site);
    renderLocations();
  }

  // ═══════════════════════════════════════════════════════════
  //  GUARDS MODULE — Split into Location Guards + Base Camp
  // ═══════════════════════════════════════════════════════════

  // ── Sub-tab state ──────────────────────────────────────────
  if (!state.guardSubTab) state.guardSubTab = 'location';
  if (!state.guardView)   state.guardView   = 'schedule';

  function gdSetSubTab(tab) {
    state.guardSubTab = tab;
    ['location', 'basecamp'].forEach(t => {
      $(`gd-subtab-${t}`)?.classList.toggle('active', t === tab);
    });
    $('gd-location-panel')?.classList.toggle('hidden', tab !== 'location');
    $('gd-basecamp-panel')?.classList.toggle('hidden', tab !== 'basecamp');
    if (tab === 'location') renderGuardLocation();
    else renderGuardCamp();
    _updateBreadcrumb(tab === 'location' ? 'Location Guards' : 'Base Camp');
  }

  function _updateGcBadge() {
    const btn = $('gd-subtab-basecamp');
    if (!btn) return;
    const count = (state.gcAssignments || []).filter(a => a.helper_id).length;
    const badge = btn.querySelector('.gc-badge');
    if (count > 0) {
      if (badge) { badge.textContent = count; }
      else { btn.insertAdjacentHTML('beforeend', ` <span class="gc-badge" style="background:var(--accent);color:#fff;border-radius:9px;font-size:.6rem;padding:0 .35rem;margin-left:.25rem">${count}</span>`); }
    } else if (badge) { badge.remove(); }
  }

  async function renderGuards() {
    // Entry point when GUARDS tab is opened
    // Pre-load base camp data in background so it's ready when sub-tab is clicked
    if (!state.gcWorkers.length && !state._gcPreloading) {
      state._gcPreloading = true;
      _loadAndRenderGuardCamp().catch(() => {}).finally(() => { state._gcPreloading = false; });
    }
    if (state.guardSubTab === 'basecamp') {
      $('gd-location-panel')?.classList.add('hidden');
      $('gd-basecamp-panel')?.classList.remove('hidden');
      $('gd-subtab-location')?.classList.remove('active');
      $('gd-subtab-basecamp')?.classList.add('active');
      await _loadAndRenderGuardCamp();
    } else {
      $('gd-location-panel')?.classList.remove('hidden');
      $('gd-basecamp-panel')?.classList.add('hidden');
      $('gd-subtab-location')?.classList.add('active');
      $('gd-subtab-basecamp')?.classList.remove('active');
      await renderGuardLocation();
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  SUB-TAB A: LOCATION GUARDS (editable, constrained by Locations activity)
  // ═══════════════════════════════════════════════════════════

  const GUARD_RATE_LOCATION = 45; // Fixed $45/guard/day

  // State for guard location schedules
  if (!state.guardLocSchedules) state.guardLocSchedules = [];
  if (!state.guardLocLocked) {
    try { const s = localStorage.getItem('guard_loc_locked_days'); state.guardLocLocked = s ? JSON.parse(s) : {}; }
    catch(e) { state.guardLocLocked = {}; }
  }

  async function renderGuardLocation() {
    const container = $('gd-location-panel');
    if (!container) return;

    // Load location sites
    if (!state.locationSites) {
      try { state.locationSites = await api('GET', `/api/productions/${state.prodId}/locations`); }
      catch(e) { state.locationSites = []; }
    }
    // Load location schedules (for activity lookup)
    if (!state.locationSchedules) {
      try { state.locationSchedules = await api('GET', `/api/productions/${state.prodId}/location-schedules`); }
      catch(e) { state.locationSchedules = []; }
    }

    // Sync guard_location_schedules from location_schedules (creates defaults where missing, removes stale)
    try {
      state.guardLocSchedules = await api('POST', `/api/productions/${state.prodId}/guard-schedules/sync`);
    } catch(e) {
      try { state.guardLocSchedules = await api('GET', `/api/productions/${state.prodId}/guard-schedules`); }
      catch(e2) { state.guardLocSchedules = []; }
    }

    const sites = state.locationSites || [];
    const locSchedules = state.locationSchedules || [];
    const guardSchedules = state.guardLocSchedules || [];
    const dates = _locDates();

    // Build lookup: location_name -> location_type
    const typeByName = {};
    sites.forEach(s => { typeByName[s.name] = s.location_type || 'game'; });

    // Build activity lookup: which location/date pairs have P/F/W
    const activityLookup = {};
    locSchedules.forEach(s => { activityLookup[`${s.location_name}|${s.date}`] = s.status; });

    // Build guard schedule lookup
    const gdLookup = {};
    guardSchedules.forEach(g => { gdLookup[`${g.location_name}|${g.date}`] = g; });

    // PDT lookup for day header tooltips
    const gdPdtByDate = {};
    state.shootingDays.forEach(day => { gdPdtByDate[day.date] = day; });

    // Compute totals per location
    const byLoc = {};
    guardSchedules.forEach(g => {
      const nb = g.nb_guards || 0;
      if (!byLoc[g.location_name]) byLoc[g.location_name] = { type: typeByName[g.location_name] || 'game', days: 0, totalGuardDays: 0, cost: 0 };
      byLoc[g.location_name].days++;
      byLoc[g.location_name].totalGuardDays += nb;
      byLoc[g.location_name].cost += nb * GUARD_RATE_LOCATION;
    });

    const totalGuardDays = Object.values(byLoc).reduce((s, v) => s + v.totalGuardDays, 0);
    const totalBudget = totalGuardDays * GUARD_RATE_LOCATION;

    // Get unique location names that have guard schedule entries
    const activeLocNames = [...new Set(guardSchedules.map(g => g.location_name))];
    activeLocNames.sort((a, b) => {
      const ta = typeByName[a] || 'game', tb = typeByName[b] || 'game';
      if (ta === 'tribal_camp' && tb !== 'tribal_camp') return -1;
      if (tb === 'tribal_camp' && ta !== 'tribal_camp') return 1;
      return a.localeCompare(b);
    });

    const viewBtns = ['schedule', 'budget'].map(v =>
      `<button class="${state.guardView === v ? 'active' : ''}" id="gdl-btab-${v}" onclick="App.gdSetView('${v}')">${v.charAt(0).toUpperCase() + v.slice(1)}</button>`
    ).join('');

    let html = `<div style="padding:1rem">
      <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.75rem;flex-wrap:wrap">
        <span class="section-title" style="margin:0">Location Guards</span>
        <span style="font-size:.72rem;color:var(--text-4);padding:.15rem .5rem;background:var(--bg-surface);border-radius:4px">Editable &mdash; only active location/date cells (P/F/W) can be modified</span>
        <div class="view-toggle">${viewBtns}</div>
        <div style="margin-left:auto;display:flex;gap:.3rem">
          <button class="btn btn-sm btn-secondary" onclick="App.gdlRefresh()">Refresh</button>
          <button class="btn btn-sm btn-secondary" onclick="App.gdlExportCSV()">Export CSV</button>
        </div>
      </div>`;

    if (state.guardView === 'schedule') {
      html += `
      <div class="stat-grid" style="margin-bottom:.75rem">
        <div class="stat-card" style="border-left:3px solid #06B6D4">
          <div class="stat-val" style="font-size:1.3rem;color:#06B6D4">${totalGuardDays}</div>
          <div class="stat-lbl">GUARD-DAYS</div>
        </div>
        <div class="stat-card" style="border-left:3px solid #22C55E">
          <div class="stat-val" style="font-size:1.3rem;color:#22C55E">${fmtMoney(totalBudget)}</div>
          <div class="stat-lbl">TOTAL BUDGET ($${GUARD_RATE_LOCATION}/guard/day)</div>
        </div>
        <div class="stat-card" style="border:1px solid var(--border)">
          <div class="stat-val" style="font-size:1.3rem">${activeLocNames.length}</div>
          <div class="stat-lbl">ACTIVE LOCATIONS</div>
        </div>
      </div>
      <div style="font-size:.72rem;color:var(--text-3);margin-bottom:.5rem">
        Defaults: <strong>TRIBAL CAMP = 4 guards</strong> &middot; All others = 2 guards &middot; Fixed rate: $${GUARD_RATE_LOCATION}/guard/day &middot; Click a cell to edit guard count
      </div>
      <div class="loc-schedule-wrap" style="overflow-x:auto">
        <table class="loc-schedule-table">
          <thead>
            ${(() => {
              const _mn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
              const _mg = []; let _pm = -1, _mc = 0;
              dates.forEach(d => {
                const m = new Date(d + 'T00:00:00').getMonth();
                if (m !== _pm) { if (_pm >= 0) _mg.push({ m: _pm, cnt: _mc }); _pm = m; _mc = 1; } else _mc++;
              });
              _mg.push({ m: _pm, cnt: _mc });
              return '<tr><th class="loc-th-name" style="position:sticky;left:0;z-index:3;background:var(--bg-surface);min-width:160px"></th>'
                + _mg.map(mg => '<th colspan="' + mg.cnt + '" style="text-align:center;font-size:.65rem;color:var(--text-3);padding:2px 0">' + _mn[mg.m] + '</th>').join('')
                + '</tr>';
            })()}
            <tr>
              <th class="loc-th-name" style="position:sticky;left:0;z-index:3;background:var(--bg-surface);min-width:160px">Location</th>
              ${dates.map(d => {
                const dt = new Date(d + 'T00:00:00');
                const day = dt.getDate();
                const wd = dt.toLocaleDateString('en-US', { weekday: 'short' }).slice(0,2);
                const isLocked = !!state.guardLocLocked[d];
                const hasPdt = !!gdPdtByDate[d];
                return `<th class="loc-th-date ${hasPdt ? 'loc-has-pdt' : ''}" style="min-width:32px;text-align:center;cursor:pointer;position:relative${isLocked ? ';background:rgba(34,197,94,.15)' : ''}"
                  onclick="App.gdlToggleLock('${d}')"
                  onmouseenter="App.showDateTooltip(event,'${d}')"
                  onmouseleave="App.hidePDTTooltip()">
                  <div style="font-size:.6rem;color:var(--text-4)">${wd}</div>
                  <div style="font-size:.7rem">${day}</div>
                  ${isLocked ? '<div style="font-size:.5rem;color:var(--green)">&#x1F512;</div>' : ''}
                </th>`;
              }).join('')}
            </tr>
          </thead>
          <tbody>
            ${activeLocNames.map(locName => {
              const locType = typeByName[locName] || 'game';
              const typeColor = locType === 'tribal_camp' ? '#EAB308' : locType === 'game' ? '#22C55E' : '#3B82F6';
              const defaultGuards = locType === 'tribal_camp' ? 4 : 2;
              return `<tr>
              <td class="loc-td-name" style="position:sticky;left:0;z-index:2;background:var(--bg-card);border-right:1px solid var(--border)">
                <div style="display:flex;align-items:center;gap:.3rem">
                  <span style="width:8px;height:8px;border-radius:2px;background:${typeColor};flex-shrink:0"></span>
                  <span style="font-size:.72rem;font-weight:600;white-space:nowrap">${esc(locName)}</span>
                  <span style="font-size:.6rem;color:var(--text-4);font-weight:400">${defaultGuards}g</span>
                </div>
              </td>
              ${dates.map(d => {
                const hasActivity = !!activityLookup[`${locName}|${d}`];
                const gd = gdLookup[`${locName}|${d}`];
                const isLocked = !!state.guardLocLocked[d];

                if (!hasActivity) {
                  // No activity -- greyed out, not editable
                  return `<td style="text-align:center;min-width:32px;height:28px;cursor:default;background:var(--bg-surface);opacity:.3"></td>`;
                }

                const nb = gd ? gd.nb_guards : defaultGuards;
                const actStatus = activityLookup[`${locName}|${d}`];
                const cellClass = 'loc-cell-' + actStatus;

                if (isLocked) {
                  return `<td class="${cellClass}" style="text-align:center;min-width:32px;height:28px;cursor:default;font-size:.7rem;font-weight:600;opacity:.85"
                    title="${actStatus} - ${nb} guard${nb !== 1 ? 's' : ''} (locked)">${nb}</td>`;
                }

                return `<td class="${cellClass}" style="text-align:center;min-width:32px;height:28px;cursor:pointer;font-size:.7rem;font-weight:600"
                  title="${actStatus} - ${nb} guard${nb !== 1 ? 's' : ''} - click to edit"
                  onclick="App.gdlCellClick('${esc(locName)}','${d}',${nb})">${nb}</td>`;
              }).join('')}
            </tr>`;
            }).join('')}
            ${!activeLocNames.length ? '<tr><td colspan="99" style="text-align:center;color:var(--text-4);padding:2rem">No locations with P/F/W schedules yet. Add schedule data in the LOCATIONS tab first.</td></tr>' : ''}
          </tbody>
        </table>
      </div>`;
    } else {
      // Budget view -- now shows combined Location + Base Camp
      await _renderGuardsCombinedBudget(container);
      return;
    }

    html += `</div>`;
    const _scrollSaved = _saveScheduleScroll(container);
    container.innerHTML = html;
    _restoreScheduleScroll(container, _scrollSaved);
  }

  // Combined budget for all guards (Location + Base Camp)
  async function _renderGuardsCombinedBudget(container) {
    const guardSchedules = state.guardLocSchedules || [];
    const sites = state.locationSites || [];
    const typeByName = {};
    sites.forEach(s => { typeByName[s.name] = s.location_type || 'game'; });

    // Location guards totals
    const byLoc = {};
    guardSchedules.forEach(g => {
      const nb = g.nb_guards || 0;
      if (!byLoc[g.location_name]) byLoc[g.location_name] = { type: typeByName[g.location_name] || 'game', days: 0, totalGuardDays: 0, cost: 0 };
      byLoc[g.location_name].days++;
      byLoc[g.location_name].totalGuardDays += nb;
      byLoc[g.location_name].cost += nb * GUARD_RATE_LOCATION;
    });
    const locActiveNames = Object.keys(byLoc).sort();
    const locTotalGuardDays = Object.values(byLoc).reduce((s, v) => s + v.totalGuardDays, 0);
    const locTotalBudget = locTotalGuardDays * GUARD_RATE_LOCATION;

    // Base camp totals
    const gcAsgns = state.gcAssignments || [];
    const gcFuncs = state.gcFunctions || [];
    let bcTotal = 0;
    const bcRows = [];
    gcAsgns.forEach(a => {
      const func = gcFuncs.find(f => f.id === a.boat_function_id);
      const wd = computeWd(a);
      const rate = a.price_override || a.helper_daily_rate_estimate || 0;
      const total = Math.round(wd * rate);
      if (wd <= 0) return;
      bcRows.push({
        funcName: func?.name || a.function_name || '---',
        workerName: a.helper_name_override || a.helper_name || '---',
        group: func?.function_group || a.function_group || 'GENERAL',
        start: a.start_date, end: a.end_date, wd, rate, total
      });
      bcTotal += total;
    });

    const grandTotal = locTotalBudget + bcTotal;

    let html = `<div style="padding:1rem">
      <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.75rem;flex-wrap:wrap">
        <span class="section-title" style="margin:0">Guards Budget</span>
        <div class="view-toggle">
          <button class="${state.guardView === 'schedule' ? 'active' : ''}" onclick="App.gdSetView('schedule')">Schedule</button>
          <button class="${state.guardView === 'budget' ? 'active' : ''}" onclick="App.gdSetView('budget')">Budget</button>
        </div>
      </div>

      <div class="stat-grid" style="margin-bottom:.75rem">
        <div class="stat-card" style="border:1px solid var(--border)">
          <div class="stat-val" style="font-size:1.5rem">${fmtMoney(grandTotal)}</div>
          <div class="stat-lbl">TOTAL GUARDS</div>
        </div>
        <div class="stat-card" style="border-left:3px solid #06B6D4">
          <div class="stat-val" style="font-size:1.3rem;color:#06B6D4">${fmtMoney(locTotalBudget)}</div>
          <div class="stat-lbl">LOCATION GUARDS</div>
        </div>
        <div class="stat-card" style="border-left:3px solid #8B5CF6">
          <div class="stat-val" style="font-size:1.3rem;color:#8B5CF6">${fmtMoney(bcTotal)}</div>
          <div class="stat-lbl">BASE CAMP</div>
        </div>
      </div>

      <div class="budget-dept-card">
        <div class="budget-dept-header">
          <span style="font-weight:700;font-size:.82rem;color:#06B6D4">LOCATION GUARDS</span>
          <span style="font-weight:700;color:var(--green)">${fmtMoney(locTotalBudget)}</span>
        </div>
        <table class="budget-table"><thead><tr>
          <th>Location</th><th>Type</th><th>Active Days</th><th>Guard-Days</th><th>Rate</th><th style="text-align:right">Total</th>
        </tr></thead><tbody>
          ${locActiveNames.map(loc => {
            const info = byLoc[loc];
            return `<tr>
              <td style="font-weight:600">${esc(loc)}</td>
              <td style="font-size:.72rem;color:var(--text-3)">${info.type === 'tribal_camp' ? 'Tribal Camp' : info.type === 'game' ? 'Game' : 'Reward'}</td>
              <td>${info.days}</td>
              <td>${info.totalGuardDays}</td>
              <td>$${GUARD_RATE_LOCATION}</td>
              <td style="text-align:right;font-weight:600;color:var(--green)">${fmtMoney(info.cost)}</td>
            </tr>`;
          }).join('') || '<tr><td colspan="6" style="color:var(--text-4)">No location guard data yet</td></tr>'}
          <tr style="border-top:2px solid var(--border)">
            <td colspan="3" style="font-weight:700;text-align:right">TOTAL LOCATION</td>
            <td style="font-weight:700">${locTotalGuardDays}</td>
            <td></td>
            <td style="text-align:right;font-weight:700;color:var(--green)">${fmtMoney(locTotalBudget)}</td>
          </tr>
        </tbody></table>
      </div>

      ${bcRows.length ? `
      <div class="budget-dept-card">
        <div class="budget-dept-header">
          <span style="font-weight:700;font-size:.82rem;color:#8B5CF6">BASE CAMP GUARDS</span>
          <span style="font-weight:700;color:var(--green)">${fmtMoney(bcTotal)}</span>
        </div>
        <table class="budget-table"><thead><tr>
          <th>Function</th><th style="text-align:left">Guard</th><th>Group</th><th>Start</th><th>End</th><th>Days</th><th>$/day</th><th style="text-align:right">Total</th>
        </tr></thead><tbody>
          ${bcRows.map((r, i) => `<tr style="${i%2 ? 'background:var(--bg-surface)' : ''}">
            <td style="color:var(--text-1)">${esc(r.funcName)}</td>
            <td style="color:var(--cyan)">${esc(r.workerName)}</td>
            <td style="font-size:.72rem;color:var(--text-3)">${esc(r.group)}</td>
            <td style="font-size:.72rem;color:var(--text-3)">${fmtDate(r.start)}</td>
            <td style="font-size:.72rem;color:var(--text-3)">${fmtDate(r.end)}</td>
            <td style="text-align:right">${r.wd ?? '---'}</td>
            <td style="text-align:right">${fmtMoney(r.rate)}</td>
            <td style="text-align:right;font-weight:600;color:var(--green)">${fmtMoney(r.total)}</td>
          </tr>`).join('')}
          <tr style="border-top:2px solid var(--border)">
            <td colspan="7" style="font-weight:700;text-align:right">TOTAL BASE CAMP</td>
            <td style="text-align:right;font-weight:700;color:var(--green)">${fmtMoney(bcTotal)}</td>
          </tr>
        </tbody></table>
      </div>` : ''}

      <div style="margin-top:.75rem;padding:.75rem;background:var(--bg-surface);border-radius:8px;text-align:right">
        <span style="font-size:.85rem;font-weight:700;color:var(--text-0)">GRAND TOTAL GUARDS: </span>
        <span style="font-size:1.1rem;font-weight:700;color:var(--green)">${fmtMoney(grandTotal)}</span>
      </div>
    </div>`;

    container.innerHTML = html;
  }

  function gdSetView(view) {
    state.guardView = view;
    if (state.guardSubTab === 'location') renderGuardLocation();
    else renderGuardCamp();
    const sub = state.guardSubTab === 'location' ? 'Location' : 'Camp';
    _updateBreadcrumb(`${sub} / ${view.charAt(0).toUpperCase() + view.slice(1)}`);
  }

  async function gdlRefresh() {
    state.locationSites = null;
    state.locationSchedules = null;
    state.guardLocSchedules = null;
    await renderGuardLocation();
    toast('Location guards refreshed');
  }

  // Cell click -- prompt for guard count
  async function gdlCellClick(locName, date, currentNb) {
    const newVal = prompt(`Guards for ${locName} on ${date}:`, String(currentNb));
    if (newVal === null) return;
    const nb = parseInt(newVal, 10);
    if (isNaN(nb) || nb < 0) { toast('Invalid number', 'error'); return; }
    try {
      await api('POST', `/api/productions/${state.prodId}/guard-schedules/update-guards`, {
        location_name: locName,
        date: date,
        nb_guards: nb
      });
      // Update local state
      const key = `${locName}|${date}`;
      const existing = state.guardLocSchedules.find(g => g.location_name === locName && g.date === date);
      if (existing) existing.nb_guards = nb;
      renderGuardLocation();
    } catch(e) { toast('Error: ' + e.message, 'error'); }
  }

  // Lock/unlock a day column
  function gdlToggleLock(date) {
    if (state.guardLocLocked[date]) {
      delete state.guardLocLocked[date];
    } else {
      state.guardLocLocked[date] = true;
    }
    localStorage.setItem('guard_loc_locked_days', JSON.stringify(state.guardLocLocked));
    renderGuardLocation();
  }

  function gdlExportCSV() {
    const guardSchedules = state.guardLocSchedules || [];
    const sites = state.locationSites || [];
    if (!guardSchedules.length) { toast('No location guard data to export', 'info'); return; }
    const typeByName = {};
    sites.forEach(s => { typeByName[s.name] = s.location_type || 'game'; });

    const now = new Date();
    const fname = `KLAS7_GUARDS-LOCATION_${String(now.getFullYear()).slice(2)}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.csv`;

    let csv = 'Location,Type,Date,Status,Guards,Rate,Cost\n';
    const byLoc = {};
    guardSchedules.forEach(g => {
      const locType = typeByName[g.location_name] || 'game';
      const nb = g.nb_guards || 0;
      const cost = nb * GUARD_RATE_LOCATION;
      csv += `"${g.location_name}","${locType}","${g.date}","${g.status}",${nb},${GUARD_RATE_LOCATION},${cost}\n`;
      if (!byLoc[g.location_name]) byLoc[g.location_name] = { type: locType, days: 0, totalGuards: 0, totalCost: 0 };
      byLoc[g.location_name].days++;
      byLoc[g.location_name].totalGuards += nb;
      byLoc[g.location_name].totalCost += cost;
    });
    csv += '\n';
    csv += 'SUMMARY\n';
    csv += 'Location,Type,Days,Total Guard-Days,Total Cost\n';
    let grandTotal = 0;
    Object.entries(byLoc).forEach(([loc, info]) => {
      csv += `"${loc}","${info.type}",${info.days},${info.totalGuards},${info.totalCost}\n`;
      grandTotal += info.totalCost;
    });
    csv += `,,,,${grandTotal}\n`;

    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    a.click();
  }

  // Keep old guard post CRUD for legacy compatibility
  function showAddGuardModal() {
    $('ngp-name').value = '';
    $('ngp-rate').value = '45';
    $('ngp-guards-prep').value = '2';
    $('ngp-guards-film').value = '2';
    $('ngp-guards-wrap').value = '2';
    $('ngp-notes').value = '';
    $('ngp-edit-id').value = '';
    $('gp-modal-title').textContent = 'Add Guard Post';
    $('ngp-confirm-btn').textContent = 'Create';
    $('ngp-delete-btn').classList.add('hidden');
    $('add-guard-overlay').classList.remove('hidden');
  }

  function editGuardPost(postId) {
    const post = (state.guardPosts || []).find(p => p.id === postId);
    if (!post) return;
    $('ngp-name').value = post.name || '';
    $('ngp-rate').value = String(post.daily_rate || 45);
    $('ngp-guards-prep').value = String(post.guards_prep ?? 2);
    $('ngp-guards-film').value = String(post.guards_film ?? 2);
    $('ngp-guards-wrap').value = String(post.guards_wrap ?? 2);
    $('ngp-notes').value = post.notes || '';
    $('ngp-edit-id').value = String(post.id);
    $('gp-modal-title').textContent = 'Edit Guard Post';
    $('ngp-confirm-btn').textContent = 'Save';
    $('ngp-delete-btn').classList.remove('hidden');
    $('add-guard-overlay').classList.remove('hidden');
  }

  function closeAddGuardModal() {
    $('add-guard-overlay').classList.add('hidden');
  }

  async function saveGuardPost() {
    const name = $('ngp-name').value.trim();
    if (!name) { toast('Name is required', 'error'); return; }
    const editId = $('ngp-edit-id').value;
    const data = {
      name,
      daily_rate: parseFloat($('ngp-rate').value) || 45,
      guards_prep: parseInt($('ngp-guards-prep').value) || 2,
      guards_film: parseInt($('ngp-guards-film').value) || 2,
      guards_wrap: parseInt($('ngp-guards-wrap').value) || 2,
      notes: $('ngp-notes').value.trim(),
    };
    try {
      if (editId) {
        await api('PUT', `/api/guard-posts/${editId}`, data);
        toast('Guard post updated');
      } else {
        await api('POST', `/api/productions/${state.prodId}/guard-posts`, data);
        toast('Guard post created');
      }
      state.guardPosts = await api('GET', `/api/productions/${state.prodId}/guard-posts`);
      state.guardSchedules = await api('GET', `/api/productions/${state.prodId}/guard-schedules`);
      closeAddGuardModal();
      renderGuards();
    } catch(e) { toast('Error: ' + e.message, 'error'); }
  }

  async function deleteGuardPost() {
    const editId = $('ngp-edit-id').value;
    if (!editId) return;
    const post = (state.guardPosts || []).find(p => p.id === parseInt(editId));
    if (!confirm(`Delete guard post "${post?.name}"? This will also delete all schedule data for this post.`)) return;
    try {
      await api('DELETE', `/api/guard-posts/${editId}`);
      toast('Guard post deleted');
      state.guardPosts = await api('GET', `/api/productions/${state.prodId}/guard-posts`);
      state.guardSchedules = await api('GET', `/api/productions/${state.prodId}/guard-schedules`);
      closeAddGuardModal();
      renderGuards();
    } catch(e) { toast('Error: ' + e.message, 'error'); }
  }

  // ═══════════════════════════════════════════════════════════
  //  SUB-TAB B: BASE CAMP GUARDS (manual, like Labour)
  // ═══════════════════════════════════════════════════════════

  const DEFAULT_GC_GROUPS = [
    { name: 'BASECAMP',   color: '#22C55E' },
    { name: 'PERIMETER',  color: '#EF4444' },
    { name: 'NIGHT',      color: '#8B5CF6' },
    { name: 'ROAMING',    color: '#3B82F6' },
    { name: 'GENERAL',    color: '#94A3B8' },
  ];

  // Guard Camp state
  Object.assign(state, {
    gcWorkers:     [],
    gcFunctions:   [],
    gcAssignments: [],
    gcView:        'cards',
    gcWorkerFilter:'all',
    gcSelectedWorker: null,
    gcDragWorker:     null,
    gcPendingFuncId:  null,
    gcPendingDate:    null,
    gcLockedDays:     {},
    gcGroups:         DEFAULT_GC_GROUPS,
  });

  // Load saved groups & locked days from localStorage
  try {
    const savedGcGroups = localStorage.getItem('guard_camp_groups');
    if (savedGcGroups) state.gcGroups = JSON.parse(savedGcGroups);
  } catch(e) {}
  try {
    const savedGcLocks = localStorage.getItem('guard_camp_locked_days');
    if (savedGcLocks) state.gcLockedDays = JSON.parse(savedGcLocks);
  } catch(e) {}

  async function _loadAndRenderGuardCamp() {
    // AXE 5.4: show loading skeletons
    const rg = $('gc-role-groups'); if (rg) rg.innerHTML = _skeletonCards(3);
    const sc = $('gc-schedule-container'); if (sc) sc.innerHTML = _skeletonTable();
    try {
      const [workers, functions, assignments] = await Promise.all([
        api('GET', `/api/productions/${state.prodId}/guard-camp-workers`),
        api('GET', `/api/productions/${state.prodId}/boat-functions?context=guard_camp`),
        api('GET', `/api/productions/${state.prodId}/guard-camp-assignments`),
      ]);
      state.gcWorkers     = workers;
      state.gcFunctions   = functions;
      state.gcAssignments = assignments;
      _updateGcBadge();
    } catch(e) { toast('Error loading base camp guards: ' + e.message, 'error'); }
    renderGuardCamp();
  }

  function renderGuardCamp() {
    renderGcWorkerList();
    if (state.gcView === 'cards')         renderGcRoleCards();
    else if (state.gcView === 'schedule') renderGcSchedule();
    else if (state.gcView === 'budget')   renderGcBudget();
  }

  function gcSetView(view) {
    state.gcView = view;
    closeSchedulePopover();
    ['cards','schedule','budget'].forEach(v => {
      $(`gc-view-${v}`)?.classList.toggle('hidden', v !== view);
      $(`gc-btab-${v}`)?.classList.toggle('active', v === view);
    });
    renderGuardCamp();
  }

  // ── Worker sidebar ───────────────────────────────────────────
  function gcFilterWorkers(f) {
    state.gcWorkerFilter = f;
    ['all','available','assigned'].forEach(id => {
      $(`gc-filter-${id}`)?.classList.toggle('active', id === f);
    });
    renderGcWorkerList();
  }

  function _gcFilteredWorkers() {
    const assignedIds = new Set(state.gcAssignments.filter(a => a.helper_id).map(a => a.helper_id));
    let workers = [...state.gcWorkers];
    if      (state.gcWorkerFilter === 'available') workers = workers.filter(w => !assignedIds.has(w.id));
    else if (state.gcWorkerFilter === 'assigned')  workers = workers.filter(w => assignedIds.has(w.id));
    workers.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return workers;
  }

  function _gcAssignmentsForFunc(funcId) {
    return state.gcAssignments.filter(a => a.boat_function_id === funcId);
  }

  function renderGcWorkerList() {
    const workers = _gcFilteredWorkers();
    const assignedIds = new Set(state.gcAssignments.filter(a => a.helper_id).map(a => a.helper_id));
    const container = $('gc-worker-list');
    if (!container) return;
    if (!workers.length) {
      container.innerHTML = '<div style="color:var(--text-4);font-size:.8rem;text-align:center;padding:1rem">No guards</div>';
      return;
    }
    container.innerHTML = workers.map(w => {
      const isAssigned = assignedIds.has(w.id);
      const wAsgns = state.gcAssignments.filter(a => a.helper_id === w.id);
      const groupColor = _groupColor('guard_camp', w.group_name || 'GENERAL');
      const gcRateVal = w.daily_rate_estimate || 0;
      const rate = `<div style="font-size:.65rem;color:${gcRateVal > 0 ? 'var(--green)' : 'var(--text-4)'};margin-top:.1rem;cursor:pointer;display:inline-flex;align-items:center;gap:.2rem"
        onclick="event.stopPropagation();App.gcOpenWorkerDetail(${w.id})"
        title="Click to edit rate">${gcRateVal > 0 ? '$' + Math.round(gcRateVal).toLocaleString('en-US') + '/d' : '+ set rate'}<span style="font-size:.55rem;opacity:.5">&#x270E;</span></div>`;
      return `<div class="boat-card ${isAssigned ? 'assigned' : ''}"
        id="gc-worker-card-${w.id}"
        draggable="true"
        ondragstart="App.gcOnWorkerDragStart(event,${w.id})"
        ondragend="App.gcOnWorkerDragEnd()"
        onclick="App.gcOpenWorkerView(${w.id})">
        <div class="boat-thumb-wrap">
          <div class="boat-thumb-placeholder" style="background:${groupColor}22;color:${groupColor};font-size:.6rem">${esc((w.name || '?').slice(0, 2).toUpperCase())}</div>
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:baseline;gap:.3rem;margin-bottom:.2rem;flex-wrap:wrap">
            <span style="font-weight:700;font-size:.82rem;color:var(--text-0);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(w.name)}</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:.2rem;align-items:center;margin-bottom:.1rem">
            <span style="font-size:.6rem;font-weight:700;padding:.15rem .4rem;border-radius:4px;background:${groupColor}22;color:${groupColor};text-transform:uppercase;letter-spacing:.04em">${esc(w.group_name || 'GENERAL')}</span>
          </div>
          ${w.role ? `<div style="font-size:.65rem;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(w.role)}</div>` : ''}
          ${rate}
          ${isAssigned && wAsgns.length ? `<div style="font-size:.6rem;color:var(--accent);margin-top:.1rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">&rarr; ${wAsgns.map(a => esc(a.function_name || '')).join(', ')}</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:.15rem;flex-shrink:0;align-self:flex-start">
          <button class="boat-edit-btn" title="Edit guard"
            onclick="event.stopPropagation();App.gcOpenWorkerDetail(${w.id})">&#x270E;</button>
          <button class="card-delete-btn" title="Delete guard"
            onclick="event.stopPropagation();App.confirmDeleteGuardCampWorker(${w.id},'${esc(w.name).replace(/'/g,"\\'")}',${wAsgns.length})">&#x1F5D1;</button>
        </div>
      </div>`;
    }).join('');
  }

  // ── Delete guard camp worker from card ──────────────────────
  function confirmDeleteGuardCampWorker(workerId, workerName, assignmentCount) {
    const impact = assignmentCount > 0 ? `\n${assignmentCount} assignment(s) will also be deleted.` : '';
    showConfirm(`Delete guard "${workerName}"?${impact}`, async () => {
      try {
        await api('DELETE', `/api/guard-camp-workers/${workerId}`);
        state.gcWorkers = state.gcWorkers.filter(w => w.id !== workerId);
        state.gcAssignments = state.gcAssignments.filter(a => a.helper_id !== workerId);
        closeBoatDetail();
        renderGuardCamp();
        toast('Guard deleted');
      } catch (e) { toast('Error: ' + e.message, 'error'); }
    });
  }

  // ── Role / function cards (Guard Camp) ─────────────────────────
  function renderGcRoleCards() {
    const container = $('gc-role-groups');
    if (!container) return;
    const grouped = {};
    _groupOrder('guard_camp').forEach(g => { grouped[g] = []; });
    state.gcFunctions.forEach(f => {
      const g = f.function_group || 'GENERAL';
      if (!grouped[g]) grouped[g] = [];
      grouped[g].push(f);
    });
    let html = '';
    _groupOrder('guard_camp').forEach(group => {
      const funcs = grouped[group];
      if (!funcs.length) return;
      const color = _groupColor('guard_camp', group);
      html += `
        <div class="role-group-header" style="background:${color}18;border-left:3px solid ${color}">
          <span style="color:${color}">&bull;</span>
          <span style="color:${color}">${esc(group)}</span>
          <span style="color:var(--text-4);font-weight:400;font-size:.65rem;text-transform:none;letter-spacing:0">${funcs.length} function${funcs.length > 1 ? 's' : ''}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:.5rem;margin-bottom:.75rem">
          ${funcs.map(f => renderGcRoleCard(f, color)).join('')}
        </div>`;
    });
    container.innerHTML = html || '<div style="color:var(--text-4);text-align:center;padding:3rem">No functions. Click + Function to add one.</div>';
  }

  function renderGcRoleCard(func, color) {
    const asgns = _gcAssignmentsForFunc(func.id);
    const assignedBodies = asgns.map(asgn => {
      const workerName = asgn.helper_name_override || asgn.helper_name || '?';
      const wd   = computeWd(asgn);
      const rate = asgn.price_override || asgn.helper_daily_rate_estimate || 0;
      const total = Math.round(wd * rate);
      return `<div class="assigned-mini" style="margin-bottom:.35rem">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;margin-bottom:.2rem">
              <span style="font-weight:600;color:var(--text-0);font-size:.82rem">${esc(workerName)}</span>
              ${asgn.helper_role ? `<span style="color:var(--text-3);font-size:.7rem">&middot; ${esc(asgn.helper_role)}</span>` : ''}
            </div>
            <div style="font-size:.7rem;color:var(--text-3)">${fmtDate(asgn.start_date)} &rarr; ${fmtDate(asgn.end_date)} &middot; ${wd}d &middot; ${fmtMoney(total)}</div>
          </div>
          <div style="display:flex;flex-direction:column;gap:.2rem">
            <button class="btn btn-sm btn-secondary btn-icon" onclick="App.gcEditAssignmentById(${asgn.id})" title="Edit">&#x270E;</button>
            <button class="btn btn-sm btn-danger btn-icon" onclick="App.gcRemoveAssignmentById(${asgn.id})" title="Remove">&times;</button>
          </div>
        </div>
      </div>`;
    });
    const dropZone = `<div class="drop-zone" id="gc-drop-${func.id}"
      ondragover="App.gcOnDragOver(event,${func.id})"
      ondragleave="App.gcOnDragLeave(event,${func.id})"
      ondrop="App.gcOnDrop(event,${func.id})"
      onclick="App.gcOnDropZoneClick(${func.id})"
      style="${asgns.length ? 'margin-top:.3rem;padding:.35rem;font-size:.7rem' : ''}">
      ${state.gcSelectedWorker
        ? `<span style="color:var(--accent)">Click to assign <strong>${esc(state.gcSelectedWorker.name)}</strong></span>`
        : (asgns.length ? '<span>+ Add another assignment</span>' : '<span>Drop or click a guard to assign</span>')}
    </div>`;
    return `<div class="role-card" id="gc-role-card-${func.id}"
      style="border-top:3px solid ${color}"
      ondragover="App.gcOnDragOver(event,${func.id})"
      ondragleave="App.gcOnDragLeave(event,${func.id})"
      ondrop="App.gcOnDrop(event,${func.id})">
      <div class="role-card-header">
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;color:var(--text-0);font-size:.85rem">${esc(func.name)}</div>
          ${func.specs ? `<div style="font-size:.7rem;color:var(--text-4);margin-top:.1rem">${esc(func.specs)}</div>` : ''}
        </div>
        <button onclick="App.gcConfirmDeleteFunc(${func.id})"
          style="color:var(--text-4);background:none;border:none;cursor:pointer;font-size:.9rem;padding:.2rem"
          title="Delete">&times;</button>
      </div>
      <div class="role-card-body">${assignedBodies.join('') + dropZone}</div>
    </div>`;
  }

  // ── Drag & drop (Guard Camp) ───────────────────────────────────
  function gcOnWorkerDragStart(event, workerId) {
    state.gcDragWorker = state.gcWorkers.find(w => w.id === workerId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', workerId);
    document.getElementById(`gc-worker-card-${workerId}`)?.classList.add('dragging');
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.textContent = state.gcDragWorker?.name || 'Guard';
    document.body.appendChild(ghost);
    event.dataTransfer.setDragImage(ghost, 60, 15);
    setTimeout(() => ghost.remove(), 0);
  }
  function gcOnWorkerDragEnd() {
    state.gcDragWorker = null;
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
  }
  function gcOnDragOver(event, funcId) {
    event.preventDefault();
    document.getElementById(`gc-role-card-${funcId}`)?.classList.add('drag-over');
    document.getElementById(`gc-drop-${funcId}`)?.classList.add('drag-over');
  }
  function gcOnDragLeave(event, funcId) {
    document.getElementById(`gc-role-card-${funcId}`)?.classList.remove('drag-over');
    document.getElementById(`gc-drop-${funcId}`)?.classList.remove('drag-over');
  }
  function gcOnDrop(event, funcId) {
    event.preventDefault();
    document.getElementById(`gc-role-card-${funcId}`)?.classList.remove('drag-over');
    document.getElementById(`gc-drop-${funcId}`)?.classList.remove('drag-over');
    const worker = state.gcDragWorker;
    if (!worker) return;
    state.gcDragWorker = null;
    _tabCtx = 'guard_camp';
    openAssignModal(funcId, { id: worker.id, name: worker.name, daily_rate_estimate: worker.daily_rate_estimate || 0 });
  }
  function gcOnDropZoneClick(funcId) {
    if (state.gcSelectedWorker) {
      _tabCtx = 'guard_camp';
      openAssignModal(funcId, state.gcSelectedWorker);
      state.gcSelectedWorker = null;
    } else {
      state.gcPendingFuncId = funcId;
      state.gcPendingDate   = null;
      toast('Now click a guard to assign it', 'info');
      renderGcWorkerList();
    }
  }

  function gcOpenWorkerView(workerId) {
    const worker = state.gcWorkers.find(w => w.id === workerId);
    if (!worker) return;
    if (state.gcPendingFuncId) {
      _tabCtx = 'guard_camp';
      openAssignModal(state.gcPendingFuncId, { id: worker.id, name: worker.name, daily_rate_estimate: worker.daily_rate_estimate || 0 }, null, state.gcPendingDate);
      state.gcPendingFuncId = null; state.gcPendingDate = null; state.gcSelectedWorker = null;
      renderGcWorkerList();
      return;
    }
    _tabCtx = 'guard_camp';
    const photo = $('bv-photo');
    const phPh  = $('bv-photo-placeholder');
    if (worker.image_path) {
      photo.src = '/' + worker.image_path + '?t=' + Date.now();
      photo.style.display = 'block'; phPh.style.display = 'none';
    } else {
      photo.style.display = 'none'; phPh.style.display = 'flex';
      phPh.textContent = (worker.name || '?').slice(0, 2).toUpperCase();
    }
    $('bv-name').textContent     = worker.name || '?';
    $('bv-nr-group').textContent = [worker.group_name, worker.role].filter(Boolean).join(' / ');
    $('bv-badges').innerHTML = worker.group_name
      ? `<span style="font-size:.6rem;font-weight:700;padding:.15rem .4rem;border-radius:4px;background:${_groupColor('guard_camp', worker.group_name)}22;color:${_groupColor('guard_camp', worker.group_name)};text-transform:uppercase;letter-spacing:.04em">${esc(worker.group_name)}</span>`
      : '';
    const fields = [
      worker.role                    ? ['Role',     worker.role]     : null,
      worker.contact                 ? ['Contact',  worker.contact]  : null,
      worker.daily_rate_estimate > 0 ? ['Rate est.', `$${Math.round(worker.daily_rate_estimate).toLocaleString('en-US')}/day`] : null,
      worker.notes                   ? ['Notes',     worker.notes]   : null,
    ].filter(Boolean);
    $('bv-fields').innerHTML = fields.map(([label, value]) =>
      `<span class="bv-field-label">${esc(label)}</span><span class="bv-field-value">${esc(value)}</span>`
    ).join('');
    const asgns = state.gcAssignments.filter(a => a.helper_id === worker.id);
    $('bv-assignments').innerHTML = asgns.length
      ? asgns.map(a => `<div class="bd-asgn-row">
          <span style="font-weight:600;color:var(--text-0)">${esc(a.function_name || '?')}</span>
          <span style="color:var(--text-3);font-size:.72rem">${fmtDate(a.start_date)} &rarr; ${fmtDate(a.end_date)}</span>
        </div>`).join('')
      : '<div style="color:var(--text-4);font-size:.78rem">No assignments yet</div>';
    $('bv-edit-btn').onclick = () => { closeBoatView(); gcOpenWorkerDetail(worker.id); };
    $('boat-view-overlay').classList.remove('hidden');
  }

  // ── Worker detail (edit) ── reuse boat-detail overlay ──────────
  function gcOpenWorkerDetail(workerId) {
    const w = state.gcWorkers.find(x => x.id === workerId);
    if (!w) return;
    _detailBoatId      = workerId;
    _detailIsPicture   = false;
    _detailIsTransport = false;
    _detailIsLabour    = false;
    _detailIsGuardCamp = true;
    const photo = $('bd-photo');
    const placeholder = $('bd-photo-placeholder');
    if (w.image_path) {
      photo.src = '/' + w.image_path + '?t=' + Date.now();
      photo.style.display = 'block'; placeholder.style.display = 'none';
    } else {
      photo.style.display = 'none'; placeholder.style.display = 'flex';
      placeholder.textContent = (w.name || '?').slice(0, 2).toUpperCase();
    }
    $('bd-name').value     = w.name                || '';
    $('bd-nr').value       = '';
    $('bd-captain').value  = w.role                || '';
    $('bd-vendor').value   = w.contact             || '';
    $('bd-rate-est').value = w.daily_rate_estimate  || '';
    $('bd-rate-act').value = w.daily_rate_actual    || '';
    $('bd-notes').value    = w.notes               || '';
    _setDetailLabels('guard_camp');
    const hideIds = ['bd-group', 'bd-category', 'bd-waves', 'bd-night', 'bd-capacity'];
    hideIds.forEach(id => { const el = $(id); if (el) { const row = el.closest('tr'); if (row) row.style.display = 'none'; } });
    $('bd-delete-btn').classList.remove('hidden');
    $('bd-delete-btn').onclick = () => {
      showConfirm(`Delete guard "${w.name}"?`, async () => {
        await api('DELETE', `/api/guard-camp-workers/${workerId}`);
        state.gcWorkers = state.gcWorkers.filter(x => x.id !== workerId);
        closeBoatDetail();
        renderGuardCamp();
        toast('Guard deleted');
      });
    };
    const asgns = state.gcAssignments.filter(a => a.helper_id === workerId);
    $('bd-assignments-list').innerHTML = asgns.length
      ? asgns.map(a => `<div class="bd-asgn-row">
          <span style="font-weight:600;color:var(--text-0)">${esc(a.function_name || '?')}</span>
          <span style="color:var(--text-3);font-size:.72rem">${fmtDate(a.start_date)} &rarr; ${fmtDate(a.end_date)}</span>
        </div>`).join('')
      : '<div style="color:var(--text-4);font-size:.78rem">No assignments yet</div>';
    $('boat-detail-overlay').classList.remove('hidden');
  }

  // ── Add worker modal ─────────────────────────────────────────
  function gcShowAddWorkerModal() {
    ['gcw-name','gcw-price','gcw-role','gcw-contact','gcw-notes'].forEach(id => { const el = $(id); if(el) el.value = ''; });
    $('gcw-price').value = '45';
    const sel = $('gcw-group');
    if (sel) {
      sel.innerHTML = state.gcGroups.map(g => `<option value="${g.name}">${g.name}</option>`).join('');
      sel.value = state.gcGroups[0]?.name || 'GENERAL';
    }
    $('add-gc-worker-overlay').classList.remove('hidden');
    setTimeout(() => { const el = $('gcw-name'); if(el) el.focus(); }, 80);
  }
  function gcCloseAddWorkerModal() { $('add-gc-worker-overlay').classList.add('hidden'); }

  async function gcCreateWorker() {
    const name = $('gcw-name').value.trim();
    if (!name) { toast('Name is required', 'error'); return; }
    try {
      const w = await api('POST', `/api/productions/${state.prodId}/guard-camp-workers`, {
        name,
        daily_rate_estimate: parseFloat($('gcw-price').value) || 45,
        group_name:   $('gcw-group').value || 'GENERAL',
        role:         $('gcw-role').value.trim()    || null,
        contact:      $('gcw-contact').value.trim() || null,
        notes:        $('gcw-notes').value.trim()   || null,
      });
      state.gcWorkers.push(w);
      gcCloseAddWorkerModal();
      renderGcWorkerList();
      toast(`Guard "${w.name}" created`);
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    }
  }

  // ── Bulk create helpers / guard camp workers ─────────────────
  function showBulkHelperModal(context) {
    const ctx = context || 'labour';
    $('bh-context').value = ctx;
    $('bh-modal-title').textContent = ctx === 'guard_camp' ? 'Bulk Create Guards' : 'Bulk Create Helpers';
    $('bh-prefix').value = ctx === 'guard_camp' ? 'Guard' : 'Helper';
    $('bh-count').value = '10';
    $('bh-group').value = 'GENERAL';
    $('bh-role').value = '';
    $('bh-rate').value = '45';
    const csvEl = $('bh-csv-file'); if (csvEl) csvEl.value = '';
    $('bulk-helper-overlay').classList.remove('hidden');
  }
  function closeBulkHelperModal() { $('bulk-helper-overlay').classList.add('hidden'); }

  async function bulkCreateHelpers() {
    const ctx = $('bh-context').value;
    const count = parseInt($('bh-count').value) || 0;
    const prefix = $('bh-prefix').value.trim();
    if (!prefix || count < 1) { toast('Prefix and count required', 'error'); return; }
    const data = {
      count, prefix,
      group_name: $('bh-group').value.trim() || 'GENERAL',
      role: $('bh-role').value.trim() || null,
      daily_rate_estimate: parseFloat($('bh-rate').value) || 45,
    };
    const endpoint = ctx === 'guard_camp'
      ? `/api/productions/${state.prodId}/guard-camp-workers/bulk`
      : `/api/productions/${state.prodId}/helpers/bulk`;
    try {
      const res = await api('POST', endpoint, data);
      toast(`${res.created} ${ctx === 'guard_camp' ? 'guards' : 'helpers'} created`);
      closeBulkHelperModal();
      if (ctx === 'guard_camp') {
        state.gcWorkers = await api('GET', `/api/productions/${state.prodId}/guard-camp-workers`);
        renderGcWorkerList();
      } else {
        renderTab('labour');
      }
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  }

  async function importHelpersCsv() {
    const ctx = $('bh-context').value;
    const fileInput = $('bh-csv-file');
    if (!fileInput || !fileInput.files.length) { toast('Select a CSV file', 'error'); return; }
    const fd = new FormData();
    fd.append('file', fileInput.files[0]);
    const endpoint = ctx === 'guard_camp'
      ? `/api/productions/${state.prodId}/guard-camp-workers/import-csv`
      : `/api/productions/${state.prodId}/helpers/import-csv`;
    try {
      const resp = await fetch(endpoint, { method: 'POST', body: fd, headers: { 'Authorization': `Bearer ${state.token}` } });
      if (!resp.ok) throw new Error(await resp.text());
      const res = await resp.json();
      toast(`${res.created} imported from CSV`);
      closeBulkHelperModal();
      if (ctx === 'guard_camp') {
        state.gcWorkers = await api('GET', `/api/productions/${state.prodId}/guard-camp-workers`);
        renderGcWorkerList();
      } else {
        renderTab('labour');
      }
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  }

  function downloadHelperCsvTemplate() {
    const csv = 'name,role,group,rate,notes\nJohn Doe,Setup,GENERAL,45,\nJane Smith,Runner,GENERAL,50,Experienced';
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'helpers_template.csv';
    a.click();
  }

  // ── CSV Import modal (AXE 10.4) ─────────────────────────────
  let _csvImportModule = null;

  const _CSV_MODULE_LABELS = {
    boats: 'Boats',
    picture_boats: 'Picture Boats',
    security_boats: 'Security Boats',
    transport: 'Transport Vehicles',
    locations: 'Locations',
    helpers: 'Helpers/Labour',
    guard_camp: 'Guards',
  };

  function openCsvImportModal(module) {
    _csvImportModule = module;
    $('csv-import-title').textContent = `Import ${_CSV_MODULE_LABELS[module] || module} from CSV`;
    $('csv-import-desc').textContent = `Upload a CSV file. Download the template first to see the expected format.`;
    $('csv-import-file').value = '';
    $('csv-import-errors').style.display = 'none';
    $('csv-import-errors').innerHTML = '';
    $('csv-import-overlay').classList.remove('hidden');
  }

  function closeCsvImportModal() {
    $('csv-import-overlay').classList.add('hidden');
    _csvImportModule = null;
  }

  function downloadCsvTemplate() {
    if (!_csvImportModule) return;
    // Use the API template endpoint
    const a = document.createElement('a');
    a.href = `/api/csv-template/${_csvImportModule}`;
    a.download = `${_csvImportModule}_template.csv`;
    // Add auth header via fetch and download
    fetch(`/api/csv-template/${_csvImportModule}`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    }).then(r => r.blob()).then(blob => {
      a.href = URL.createObjectURL(blob);
      a.click();
    }).catch(e => toast('Download failed: ' + e.message, 'error'));
  }

  async function submitCsvImport() {
    if (!_csvImportModule) return;
    const fileInput = $('csv-import-file');
    if (!fileInput?.files?.length) { toast('Select a CSV file', 'error'); return; }

    const fd = new FormData();
    fd.append('file', fileInput.files[0]);

    // For helpers and guards, use existing endpoints
    let endpoint;
    if (_csvImportModule === 'helpers') {
      endpoint = `/api/productions/${state.prodId}/helpers/import-csv`;
    } else if (_csvImportModule === 'guard_camp') {
      endpoint = `/api/productions/${state.prodId}/guard-camp-workers/import-csv`;
    } else {
      endpoint = `/api/productions/${state.prodId}/import-csv/${_csvImportModule}`;
    }

    try {
      const resp = await fetch(endpoint, {
        method: 'POST', body: fd,
        headers: { 'Authorization': `Bearer ${state.token}` }
      });
      const res = await resp.json();
      if (!resp.ok) throw new Error(res.error || 'Import failed');

      // Show errors if any
      if (res.errors && res.errors.length > 0) {
        const errEl = $('csv-import-errors');
        errEl.innerHTML = `<strong>${res.created} created, ${res.errors.length} error(s):</strong><br>` +
          res.errors.map(e => `Line ${e.line}: ${e.errors.join(', ')}`).join('<br>');
        errEl.style.display = 'block';
      }

      toast(`${res.created} ${_CSV_MODULE_LABELS[_csvImportModule] || _csvImportModule} imported`);
      if (!res.errors || res.errors.length === 0) closeCsvImportModal();
      // Reload current tab
      if (typeof App.renderTab === 'function') App.renderTab(state.activeTab);
    } catch (e) { toast('Import error: ' + e.message, 'error'); }
  }

  // ── Add function modal (Guard Camp) ──────────────────────────
  function gcShowAddFunctionModal() {
    ['nf-name','nf-specs','nf-start','nf-end'].forEach(id => { const el = $(id); if(el) el.value = ''; });
    $('nf-group').innerHTML = state.gcGroups.map(g => `<option value="${g.name}">${g.name}</option>`).join('');
    $('nf-group').value = state.gcGroups[0]?.name || '';
    $('nf-color').value = state.gcGroups[0]?.color || '#22C55E';
    $('nf-group').onchange = (e) => {
      const g = state.gcGroups.find(g => g.name === e.target.value);
      $('nf-color').value = g?.color || '#6b7280';
    };
    $('add-func-overlay').dataset.ctx = 'guard_camp';
    $('add-func-overlay').classList.remove('hidden');
    setTimeout(() => { const el = $('nf-name'); if(el) el.focus(); }, 80);
  }

  // ── Delete function ──────────────────────────────────────────
  async function gcConfirmDeleteFunc(funcId) {
    const func = state.gcFunctions.find(f => f.id === funcId);
    showConfirm(`Delete function "${func?.name}" and all its assignments?`, async () => {
      try {
        await api('DELETE', `/api/productions/${state.prodId}/guard-camp-assignments/function/${funcId}`);
        await api('DELETE', `/api/boat-functions/${funcId}`);
        state.gcFunctions   = state.gcFunctions.filter(f => f.id !== funcId);
        state.gcAssignments = state.gcAssignments.filter(a => a.boat_function_id !== funcId);
        renderGuardCamp();
        toast('Function deleted');
      } catch(e) { toast('Error: ' + e.message, 'error'); }
    });
  }

  // ── Edit / remove assignment by ID ───────────────────────────
  function gcEditAssignmentById(assignmentId) {
    const asgn = state.gcAssignments.find(a => a.id === assignmentId);
    if (!asgn) return;
    const worker = state.gcWorkers.find(w => w.id === asgn.helper_id);
    const fakeBoat = worker
      ? { id: worker.id, name: worker.name, daily_rate_estimate: worker.daily_rate_estimate || 0 }
      : { id: 0, name: asgn.helper_name_override || asgn.helper_name || '?', daily_rate_estimate: asgn.helper_daily_rate_estimate || 0 };
    _tabCtx = 'guard_camp';
    openAssignModal(asgn.boat_function_id, fakeBoat, asgn);
  }

  async function gcRemoveAssignmentById(assignmentId) {
    showConfirm('Remove this assignment?', async () => {
      try {
        await api('DELETE', `/api/guard-camp-assignments/${assignmentId}`);
        state.gcAssignments = state.gcAssignments.filter(a => a.id !== assignmentId);
        renderGuardCamp();
        toast('Assignment removed');
      } catch(e) { toast('Error: ' + e.message, 'error'); }
    });
  }

  // ── Schedule view ─────────────────────────────────────────────
  function renderGcSchedule() {
    const container = $('gc-schedule-container');
    if (!container) return;
    const days = [];
    const d = new Date(SCHEDULE_START);
    while (d <= SCHEDULE_END) { days.push(new Date(d)); d.setDate(d.getDate() + 1); }
    const pdtByDate = {};
    state.shootingDays.forEach(day => { pdtByDate[day.date] = day; });
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthGroups = [];
    let prevM = -1, cnt = 0;
    days.forEach(day => {
      if (day.getMonth() !== prevM) {
        if (prevM >= 0) monthGroups.push({ m: prevM, cnt });
        prevM = day.getMonth(); cnt = 1;
      } else cnt++;
    });
    monthGroups.push({ m: prevM, cnt });
    let monthRow = '<th class="role-name-cell"></th>';
    monthRow += monthGroups.map(mg =>
      `<th colspan="${mg.cnt}" style="text-align:center;font-size:.65rem">${monthNames[mg.m]}</th>`
    ).join('');
    let dayRow = '<th class="role-name-cell"></th>';
    dayRow += days.map(day => {
      const dk = _localDk(day);
      const isWE = day.getDay() === 0 || day.getDay() === 6;
      const isLocked = !!state.gcLockedDays[dk];
      return `<th class="schedule-day-th ${isWE ? 'weekend-col' : ''} ${pdtByDate[dk] ? 'has-pdt' : ''} ${isLocked ? 'day-locked' : ''}"
        data-date="${dk}"
        onmouseenter="App.showDateTooltip(event,'${dk}')"
        onmouseleave="App.hidePDTTooltip()"
      >${day.getDate()}</th>`;
    }).join('');
    const dailyCnt = {};
    days.forEach(d => { dailyCnt[_localDk(d)] = 0; });
    const gOrder = _groupOrder('guard_camp');
    const sortedFuncs = [...state.gcFunctions].sort((a, b) => {
      const ga = gOrder.indexOf(a.function_group || 'Special');
      const gb = gOrder.indexOf(b.function_group || 'Special');
      return (ga === -1 ? 999 : ga) - (gb === -1 ? 999 : gb) || a.sort_order - b.sort_order;
    });
    const rowsHTML = sortedFuncs.map(func => {
      const funcAsgns = _gcAssignmentsForFunc(func.id);
      const color = _groupColor('guard_camp', func.function_group);
      funcAsgns.forEach(asgn => {
        days.forEach(d => {
          const dk = _localDk(d);
          if (effectiveStatus(asgn, dk)) dailyCnt[dk] = (dailyCnt[dk] || 0) + 1;
        });
      });
      const wAsgn = funcAsgns.find(a => a.helper_id || a.helper_name_override || a.helper_name);
      const wLabel = wAsgn ? (wAsgn.helper_name_override || wAsgn.helper_name || null) : null;
      const multiSuffix = funcAsgns.length > 1 ? ` +${funcAsgns.length - 1}` : '';
      let cells = `<td class="role-name-cell sch-func-cell" style="border-top:2px solid ${color}"
        title="${esc(func.name)}" onclick="App.gcOnFuncCellClick(event,${func.id})">
        <div class="rn-group" style="color:${color}">${esc(func.function_group || 'GENERAL')}</div>
        <div class="${wLabel ? 'rn-boat' : 'rn-empty'}">${esc(wLabel ? wLabel + multiSuffix : func.name)}</div>
      </td>`;
      days.forEach(day => {
        const dk = _localDk(day);
        const isWE = day.getDay() === 0 || day.getDay() === 6;
        const weClass = isWE ? 'weekend-col' : '';
        let filledAsgn = null, filledStatus = null;
        for (const asgn of funcAsgns) {
          const st = effectiveStatus(asgn, dk);
          if (st) { filledAsgn = asgn; filledStatus = st; break; }
        }
        if (!filledAsgn) {
          cells += `<td class="schedule-cell ${weClass}"
            onclick="App.gcOnDateCellClick(event,${func.id},null,'${dk}')"></td>`;
        } else {
          const bg = _scheduleCellBg(filledStatus, color, isWE);
          cells += `<td class="schedule-cell ${weClass}" style="background:${bg}"
            onclick="App.gcOnDateCellClick(event,${func.id},${filledAsgn.id},'${dk}')"></td>`;
        }
      });
      return `<tr>${cells}</tr>`;
    }).join('');
    let countCells = '<td class="role-name-cell" style="color:var(--text-3);font-size:.68rem">Active guards</td>';
    countCells += days.map(day => {
      const dk = _localDk(day);
      const c = dailyCnt[dk] || 0;
      const isWE = day.getDay() === 0 || day.getDay() === 6;
      return `<td class="${isWE ? 'weekend-col' : ''}" style="text-align:center;font-size:.68rem;color:${c ? 'var(--green)' : 'var(--border)'};font-weight:700">${c || ''}</td>`;
    }).join('');
    let lockCells = '<td class="role-name-cell sch-lock-label" title="Lock a day to prevent accidental changes">&#x1F512; LOCK</td>';
    lockCells += days.map(day => {
      const dk = _localDk(day);
      const isWE = day.getDay() === 0 || day.getDay() === 6;
      const isLocked = !!state.gcLockedDays[dk];
      return `<td class="sch-lock-cell ${isWE ? 'weekend-col' : ''}">
        <input type="checkbox" class="day-lock-cb" ${isLocked ? 'checked' : ''}
          onchange="App.gcToggleDayLock('${dk}',this.checked)"
          title="${isLocked ? 'Unlock' : 'Lock this day'}">
      </td>`;
    }).join('');
    const _scrollSaved = _saveScheduleScroll(container);
    container.innerHTML = `
      <div class="schedule-wrap"><table class="schedule-table">
        <thead><tr>${monthRow}</tr><tr>${dayRow}</tr></thead>
        <tbody>${rowsHTML}<tr class="schedule-count-row">${countCells}</tr></tbody>
      </table></div>
      <div class="schedule-lock-outer"><table class="schedule-table">
        <tbody><tr class="schedule-lock-row">${lockCells}</tr></tbody>
      </table></div>`;
    const _sw = container.querySelector('.schedule-wrap');
    const _sl = container.querySelector('.schedule-lock-outer');
    if (_sw && _sl) _sw.addEventListener('scroll', () => { _sl.scrollLeft = _sw.scrollLeft; });
    _restoreScheduleScroll(container, _scrollSaved);
  }

  // ── Schedule cell click ────────────────────────────────────────
  async function gcOnDateCellClick(event, funcId, assignmentId, date) {
    event.stopPropagation();
    closeSchedulePopover();
    if (!!state.gcLockedDays[date]) {
      toast(`Day ${fmtDateLong(date)} is locked`, 'info');
      return;
    }
    if (!assignmentId) await _gcFillDay(funcId, date);
    else await _gcDoCellCycle(funcId, assignmentId, date);
  }

  async function _gcFillDay(funcId, date) {
    const funcAsgns = _gcAssignmentsForFunc(funcId);
    try {
      if (funcAsgns.length > 0) {
        const asgn = funcAsgns[0];
        const overrides = JSON.parse(asgn.day_overrides || '{}');
        overrides[date] = 'on';
        const updates = { day_overrides: JSON.stringify(overrides) };
        const s = (asgn.start_date || '').slice(0, 10);
        const e = (asgn.end_date   || '').slice(0, 10);
        if (!s || date < s) updates.start_date = date;
        if (!e || date > e) updates.end_date = date;
        await api('PUT', `/api/guard-camp-assignments/${asgn.id}`, updates);
      } else {
        await api('POST', `/api/productions/${state.prodId}/guard-camp-assignments`, {
          boat_function_id: funcId,
          start_date: date, end_date: date,
          day_overrides: JSON.stringify({ [date]: 'on' }),
        });
      }
      state.gcAssignments = await api('GET', `/api/productions/${state.prodId}/guard-camp-assignments`);
      renderGuardCamp();
      _queueCellFlash(date, funcId);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  }

  async function _gcDoCellCycle(funcId, assignmentId, date) {
    const asgn = state.gcAssignments.find(a => a.id === assignmentId);
    if (!asgn) return;
    const overrides = JSON.parse(asgn.day_overrides || '{}');
    overrides[date] = 'empty';
    try {
      await api('PUT', `/api/guard-camp-assignments/${assignmentId}`, { day_overrides: JSON.stringify(overrides) });
      const idx = state.gcAssignments.findIndex(a => a.id === assignmentId);
      if (idx >= 0) state.gcAssignments[idx].day_overrides = JSON.stringify(overrides);
      renderGuardCamp();
      _queueCellFlash(date, funcId);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  }

  // ── Schedule func cell click (popover) ───────────────────────
  function gcOnFuncCellClick(event, funcId) {
    event.stopPropagation();
    const el = $('schedule-popover');
    if (_schPop.funcId === funcId && _schPop.type === 'gcfunc' && !el.classList.contains('hidden')) {
      closeSchedulePopover(); return;
    }
    _schPop = { assignmentId: null, funcId, date: null, type: 'gcfunc' };
    const func = state.gcFunctions.find(f => f.id === funcId);
    const asgns = _gcAssignmentsForFunc(funcId);
    const asgnRows = asgns.length
      ? asgns.map(a => {
          const wName = a.helper_name_override || a.helper_name || '---';
          return `<div class="sch-pop-asgn-row">
            <span style="flex:1;font-size:.75rem;overflow:hidden;text-overflow:ellipsis;color:var(--text-0)">${esc(wName)}</span>
            <button class="btn btn-sm btn-icon btn-secondary"
              onclick="App.gcEditAssignmentById(${a.id});App.closeSchedulePopover()" title="Edit">&#x270E;</button>
            <button class="btn btn-sm btn-icon btn-danger"
              onclick="App.gcRemoveAssignmentById(${a.id})" title="Remove">&times;</button>
          </div>`;
        }).join('')
      : `<div style="color:var(--text-4);font-size:.75rem;padding:.25rem 0">No guard assigned</div>`;
    $('sch-pop-content').innerHTML = `
      <div class="sch-pop-header">
        <strong>${esc(func?.name || '')}</strong>
        <span style="color:var(--text-4);font-size:.65rem;margin-left:.4rem">${esc(func?.function_group || '')}</span>
      </div>
      ${asgnRows}
      <div class="sch-pop-actions" style="margin-top:.4rem">
        <button onclick="App.gcAssignFromDate(${funcId},null)">+ Assign a guard</button>
      </div>`;
    const rect = event.target.getBoundingClientRect();
    el.style.left = (rect.right + 4) + 'px';
    el.style.top  = rect.top + 'px';
    el.classList.remove('hidden');
  }

  function gcAssignFromDate(funcId, date) {
    closeSchedulePopover();
    _tabCtx = 'guard_camp';
    if (state.gcSelectedWorker) {
      openAssignModal(funcId, state.gcSelectedWorker, null, date);
      state.gcSelectedWorker = null;
    } else {
      state.gcPendingFuncId = funcId;
      state.gcPendingDate   = date;
      toast('Click a guard in the sidebar to assign it', 'info');
    }
  }

  // ── Lock toggle ──────────────────────────────────────────────
  function gcToggleDayLock(date, locked) {
    if (locked) state.gcLockedDays[date] = true;
    else delete state.gcLockedDays[date];
    try { localStorage.setItem('guard_camp_locked_days', JSON.stringify(state.gcLockedDays)); } catch(e) {}
    renderGcSchedule();
  }

  // ── Undo ─────────────────────────────────────────────────────
  async function gcUndo() {
    try {
      const res = await api('POST', `/api/productions/${state.prodId}/undo`);
      toast(res.message || 'Undo done');
      state.gcAssignments = await api('GET', `/api/productions/${state.prodId}/guard-camp-assignments`);
      renderGuardCamp();
    } catch (e) {
      toast('Nothing to undo', 'info');
    }
  }

  // ── Export ───────────────────────────────────────────────────
  function gcToggleExport() { $('gc-export-menu').classList.toggle('hidden'); }
  function gcExportCSV()  { authDownload(`/api/productions/${state.prodId}/export/guard-camp/csv`); $('gc-export-menu').classList.add('hidden'); }

  // ── Budget view (combined: Location + Base Camp) ───────────
  async function renderGcBudget() {
    const container = $('gc-budget-content');
    if (!container) return;

    // Ensure guard location schedules are loaded
    if (!state.guardLocSchedules || !state.guardLocSchedules.length) {
      try {
        state.guardLocSchedules = await api('POST', `/api/productions/${state.prodId}/guard-schedules/sync`);
      } catch(e) {
        try { state.guardLocSchedules = await api('GET', `/api/productions/${state.prodId}/guard-schedules`); }
        catch(e2) { state.guardLocSchedules = []; }
      }
    }
    if (!state.locationSites) {
      try { state.locationSites = await api('GET', `/api/productions/${state.prodId}/locations`); }
      catch(e) { state.locationSites = []; }
    }

    // Location guards totals
    const sites = state.locationSites || [];
    const typeByName = {};
    sites.forEach(s => { typeByName[s.name] = s.location_type || 'game'; });

    const locByLoc = {};
    (state.guardLocSchedules || []).forEach(g => {
      const nb = g.nb_guards || 0;
      if (!locByLoc[g.location_name]) locByLoc[g.location_name] = { type: typeByName[g.location_name] || 'game', days: 0, totalGuardDays: 0, cost: 0 };
      locByLoc[g.location_name].days++;
      locByLoc[g.location_name].totalGuardDays += nb;
      locByLoc[g.location_name].cost += nb * GUARD_RATE_LOCATION;
    });
    const locActiveNames = Object.keys(locByLoc).sort();
    const locTotalBudget = Object.values(locByLoc).reduce((s, v) => s + v.cost, 0);
    const locTotalGuardDays = Object.values(locByLoc).reduce((s, v) => s + v.totalGuardDays, 0);

    // Base Camp totals
    const asgns = state.gcAssignments;
    const funcs = state.gcFunctions;
    const byGroup = {};
    state.gcGroups.forEach(g => { byGroup[g.name] = { rows: [], total: 0, color: g.color }; });
    asgns.forEach(a => {
      const func = funcs.find(f => f.id === a.boat_function_id);
      const wd   = computeWd(a);
      const rate = a.price_override || a.helper_daily_rate_estimate || 0;
      const total = Math.round(wd * rate);
      if (wd <= 0) return;
      const g = func?.function_group || a.function_group || 'GENERAL';
      if (!byGroup[g]) byGroup[g] = { rows: [], total: 0, color: '#6B7280' };
      byGroup[g].rows.push({
        funcName: func?.name || a.function_name || '---',
        workerName: a.helper_name_override || a.helper_name || '---',
        start: a.start_date, end: a.end_date, wd, rate, total
      });
      byGroup[g].total += total;
    });

    const bcTotal = Object.values(byGroup).reduce((s, g) => s + g.total, 0);
    const grandTotal = locTotalBudget + bcTotal;

    let html = `
      <div class="stat-grid" style="margin-bottom:.75rem">
        <div class="stat-card" style="border:1px solid var(--border)">
          <div class="stat-val" style="font-size:1.5rem">${fmtMoney(grandTotal)}</div>
          <div class="stat-lbl">TOTAL GUARDS</div>
        </div>
        <div class="stat-card" style="border-left:3px solid #06B6D4">
          <div class="stat-val" style="font-size:1.3rem;color:#06B6D4">${fmtMoney(locTotalBudget)}</div>
          <div class="stat-lbl">LOCATION GUARDS</div>
        </div>
        <div class="stat-card" style="border-left:3px solid #8B5CF6">
          <div class="stat-val" style="font-size:1.3rem;color:#8B5CF6">${fmtMoney(bcTotal)}</div>
          <div class="stat-lbl">BASE CAMP</div>
        </div>
      </div>`;

    // Location Guards section
    html += `<div class="budget-dept-card">
      <div class="budget-dept-header">
        <span style="font-weight:700;font-size:.82rem;color:#06B6D4">LOCATION GUARDS</span>
        <span style="font-weight:700;color:var(--green)">${fmtMoney(locTotalBudget)}</span>
      </div>
      <table class="budget-table"><thead><tr>
        <th>Location</th><th>Type</th><th>Active Days</th><th>Guard-Days</th><th>Rate</th><th style="text-align:right">Total</th>
      </tr></thead><tbody>
        ${locActiveNames.map(loc => {
          const info = locByLoc[loc];
          return `<tr>
            <td style="font-weight:600">${esc(loc)}</td>
            <td style="font-size:.72rem;color:var(--text-3)">${info.type === 'tribal_camp' ? 'Tribal Camp' : info.type === 'game' ? 'Game' : 'Reward'}</td>
            <td>${info.days}</td>
            <td>${info.totalGuardDays}</td>
            <td>$${GUARD_RATE_LOCATION}</td>
            <td style="text-align:right;font-weight:600;color:var(--green)">${fmtMoney(info.cost)}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="6" style="color:var(--text-4)">No location guard data yet</td></tr>'}
        <tr style="border-top:2px solid var(--border)">
          <td colspan="3" style="font-weight:700;text-align:right">TOTAL LOCATION</td>
          <td style="font-weight:700">${locTotalGuardDays}</td>
          <td></td>
          <td style="text-align:right;font-weight:700;color:var(--green)">${fmtMoney(locTotalBudget)}</td>
        </tr>
      </tbody></table>
    </div>`;

    // Base Camp groups
    Object.entries(byGroup).forEach(([name, data]) => {
      if (!data.rows.length) return;
      html += `<div class="budget-dept-card">
        <div class="budget-dept-header">
          <span style="font-weight:700;font-size:.82rem;color:${data.color}">${esc(name)}</span>
          <span style="font-weight:700;color:var(--green)">${fmtMoney(data.total)}</span>
        </div>
        <table class="budget-table">
          <thead>
            <tr>
              <th>Function</th>
              <th style="text-align:left">Guard</th>
              <th>Start</th><th>End</th>
              <th>Days</th><th>$/day</th><th>Total $</th>
            </tr>
          </thead>
          <tbody>
            ${data.rows.map((r, i) => `<tr style="${i%2 ? 'background:var(--bg-surface)' : ''}">
              <td style="color:var(--text-1)">${esc(r.funcName)}</td>
              <td style="color:var(--cyan)">${esc(r.workerName)}</td>
              <td style="font-size:.72rem;color:var(--text-3)">${fmtDate(r.start)}</td>
              <td style="font-size:.72rem;color:var(--text-3)">${fmtDate(r.end)}</td>
              <td style="text-align:right;color:var(--text-2)">${r.wd ?? '---'}</td>
              <td style="text-align:right;color:var(--text-3)">${fmtMoney(r.rate)}</td>
              <td style="text-align:right;font-weight:700;color:var(--green)">${fmtMoney(r.total)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    });

    html += `<div style="margin-top:.75rem;padding:.75rem;background:var(--bg-surface);border-radius:8px;text-align:right">
      <span style="font-size:.85rem;font-weight:700;color:var(--text-0)">GRAND TOTAL GUARDS: </span>
      <span style="font-size:1.1rem;font-weight:700;color:var(--green)">${fmtMoney(grandTotal)}</span>
    </div>`;

    container.innerHTML = html;
  }


  // ═══════════════════════════════════════════════════════════
  //  FNB MODULE v2 (dynamic categories / items / entries)
  // ═══════════════════════════════════════════════════════════

  async function _fnbLoadAll() {
    if (!state.fnbCategories) {
      try { state.fnbCategories = await api('GET', `/api/productions/${state.prodId}/fnb-categories`); }
      catch(e) { state.fnbCategories = []; }
    }
    if (!state.fnbItems) {
      try { state.fnbItems = await api('GET', `/api/productions/${state.prodId}/fnb-items`); }
      catch(e) { state.fnbItems = []; }
    }
    if (!state.fnbEntries) {
      try { state.fnbEntries = await api('GET', `/api/productions/${state.prodId}/fnb-entries`); }
      catch(e) { state.fnbEntries = []; }
    }
  }

  // Compute weekly date groups from SCHEDULE_START to SCHEDULE_END
  function _fnbWeeks() {
    const dates = _locDates();
    const weeks = [];
    let cur = [];
    dates.forEach(d => {
      cur.push(d);
      if (new Date(d + 'T00:00:00').getDay() === 0 || d === dates[dates.length - 1]) {
        weeks.push([...cur]);
        cur = [];
      }
    });
    if (cur.length) weeks.push(cur);
    return weeks;
  }

  function _fnbWeekLabel(weekDates) {
    const s = new Date(weekDates[0] + 'T00:00:00');
    const e = new Date(weekDates[weekDates.length - 1] + 'T00:00:00');
    const ms = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const me = e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${ms} - ${me}`;
  }

  async function renderFnb() {
    const container = $('view-fnb');
    if (!container) return;
    if (!state.fnbSubTab) state.fnbSubTab = 'achats';
    if (!state.fnbViewMode) state.fnbViewMode = 'week';

    // AXE 5.4: skeleton while loading
    if (!state.fnbCategories) container.innerHTML = _skeletonTable(5, 8);
    await _fnbLoadAll();

    const cats = state.fnbCategories || [];
    const items = state.fnbItems || [];
    const entries = state.fnbEntries || [];

    // Compute totals
    const purchaseEntries = entries.filter(e => e.entry_type === 'purchase');
    const consoEntries = entries.filter(e => e.entry_type === 'consumption');
    const itemMap = {};
    items.forEach(it => { itemMap[it.id] = it; });
    let totalPurchase = 0, totalConso = 0;
    purchaseEntries.forEach(e => { totalPurchase += (e.quantity || 0) * ((itemMap[e.item_id] || {}).unit_price || 0); });
    consoEntries.forEach(e => { totalConso += (e.quantity || 0) * ((itemMap[e.item_id] || {}).unit_price || 0); });
    const balance = totalPurchase - totalConso;

    let html = `<div style="padding:1rem">
      <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.75rem;flex-wrap:wrap">
        <span class="section-title" style="margin:0">Food & Beverage</span>
        <div style="display:flex;gap:.3rem;margin-left:.5rem">
          <button class="filter-pill ${state.fnbSubTab === 'achats' ? 'active' : ''}" onclick="App.fnbSetSubTab('achats')">ACHATS</button>
          <button class="filter-pill ${state.fnbSubTab === 'consommation' ? 'active' : ''}" onclick="App.fnbSetSubTab('consommation')">CONSOMMATION</button>
          <button class="filter-pill ${state.fnbSubTab === 'budget' ? 'active' : ''}" onclick="App.fnbSetSubTab('budget')">BUDGET</button>
        </div>
        <div style="flex:1"></div>
        <button class="btn btn-sm btn-primary" onclick="App.showFnbCatModal()">+ Category</button>
        <button class="btn btn-sm btn-secondary" onclick="App.showFnbItemModal()">+ Item</button>
        <button class="btn btn-sm btn-secondary" onclick="App.fnbExportCSV()">Export CSV</button>
      </div>
      <div class="stat-grid" style="margin-bottom:.75rem">
        <div class="stat-card" style="border:1px solid var(--green);background:rgba(34,197,94,.07)">
          <div class="stat-val" style="font-size:1.3rem;color:var(--green)">${fmtMoney(totalPurchase)}</div>
          <div class="stat-lbl">ACHATS</div>
        </div>
        <div class="stat-card" style="border:1px solid #3B82F6;background:rgba(59,130,246,.07)">
          <div class="stat-val" style="font-size:1.3rem;color:#3B82F6">${fmtMoney(totalConso)}</div>
          <div class="stat-lbl">CONSOMMATION</div>
        </div>
        <div class="stat-card" style="border:1px solid ${balance >= 0 ? 'var(--green)' : '#EF4444'};background:${balance >= 0 ? 'rgba(34,197,94,.07)' : 'rgba(239,68,68,.07)'}">
          <div class="stat-val" style="font-size:1.3rem;color:${balance >= 0 ? 'var(--green)' : '#EF4444'}">${fmtMoney(balance)}</div>
          <div class="stat-lbl">BALANCE</div>
        </div>
        <div class="stat-card" style="border:1px solid var(--border)">
          <div class="stat-val" style="font-size:1.3rem">${cats.length} cat / ${items.length} items</div>
          <div class="stat-lbl">CATALOGUE</div>
        </div>
      </div>`;

    if (state.fnbSubTab === 'achats' || state.fnbSubTab === 'consommation') {
      html += _fnbRenderGrid(state.fnbSubTab === 'achats' ? 'purchase' : 'consumption');
    } else {
      html += _fnbRenderBudget();
    }

    html += `</div>`;
    const _scrollSaved = _saveScheduleScroll(container);
    container.innerHTML = html;
    _restoreScheduleScroll(container, _scrollSaved);
  }

  function _fnbRenderGrid(entryType) {
    const cats = state.fnbCategories || [];
    const items = state.fnbItems || [];
    const entries = (state.fnbEntries || []).filter(e => e.entry_type === entryType);
    const itemMap = {};
    items.forEach(it => { itemMap[it.id] = it; });

    // Build lookup: item_id|date -> entry
    const lookup = {};
    entries.forEach(e => { lookup[`${e.item_id}|${e.date}`] = e; });

    const weeks = _fnbWeeks();
    const viewIsWeek = state.fnbViewMode === 'week';
    const dates = viewIsWeek ? null : _locDates();

    let html = `
      <div style="display:flex;gap:.5rem;margin-bottom:.5rem;align-items:center">
        <button class="filter-pill ${state.fnbViewMode === 'week' ? 'active' : ''}" onclick="App.fnbSetViewMode('week')" style="font-size:.68rem">WEEK</button>
        <button class="filter-pill ${state.fnbViewMode === 'day' ? 'active' : ''}" onclick="App.fnbSetViewMode('day')" style="font-size:.68rem">DAY</button>
        <span style="font-size:.68rem;color:var(--text-4);margin-left:.5rem">Click cell to enter quantity. Right-click to clear.</span>
      </div>
      <div class="loc-schedule-wrap" style="overflow-x:auto">
        <table class="loc-schedule-table">
          <thead>
            <tr>
              <th class="loc-th-name" style="position:sticky;left:0;z-index:3;background:var(--bg-surface);min-width:200px">Item</th>
              <th style="min-width:55px;text-align:right">Price</th>`;

    if (viewIsWeek) {
      weeks.forEach((w, i) => {
        html += `<th class="loc-th-date" style="min-width:65px;text-align:center;font-size:.63rem">${_fnbWeekLabel(w)}<div style="color:var(--text-4);font-size:.55rem">W${i + 1}</div></th>`;
      });
    } else {
      _locDates().forEach(d => {
        const dt = new Date(d + 'T00:00:00');
        const day = dt.getDate();
        const wd = dt.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2);
        html += `<th class="loc-th-date" style="min-width:40px;text-align:center"><div style="font-size:.6rem;color:var(--text-4)">${wd}</div><div style="font-size:.7rem">${day}</div></th>`;
      });
    }

    html += `<th style="min-width:55px;text-align:right">Qty</th>
              <th style="min-width:65px;text-align:right">Total</th>
            </tr>
          </thead>
          <tbody>`;

    cats.forEach(cat => {
      const catItems = items.filter(it => it.category_id === cat.id);
      if (catItems.length === 0 && cats.length > 0) {
        // Show empty category row
        html += `<tr>
          <td class="loc-td-name" colspan="100" style="position:sticky;left:0;z-index:2;background:var(--bg-card);border-right:1px solid var(--border);cursor:pointer"
              onclick="App.editFnbCategory(${cat.id})">
            <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${cat.color};margin-right:.4rem;vertical-align:middle"></span>
            <span style="font-size:.75rem;font-weight:700;color:${cat.color}">${esc(cat.name)}</span>
            <span style="font-size:.65rem;color:var(--text-4);margin-left:.5rem">(empty - click to edit)</span>
          </td>
        </tr>`;
        return;
      }

      // Category header row
      let catQty = 0, catTotal = 0;
      catItems.forEach(it => {
        const q = entries.filter(e => e.item_id === it.id).reduce((s, e) => s + (e.quantity || 0), 0);
        catQty += q;
        catTotal += q * (it.unit_price || 0);
      });

      html += `<tr style="background:rgba(${_hexToRgb(cat.color)},.08)">
        <td class="loc-td-name" style="position:sticky;left:0;z-index:2;background:var(--bg-card);border-right:1px solid var(--border);cursor:pointer"
            onclick="App.editFnbCategory(${cat.id})">
          <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${cat.color};margin-right:.4rem;vertical-align:middle"></span>
          <span style="font-size:.75rem;font-weight:700;color:${cat.color}">${esc(cat.name)}</span>
        </td>
        <td></td>`;

      if (viewIsWeek) {
        weeks.forEach(() => { html += `<td></td>`; });
      } else {
        _locDates().forEach(() => { html += `<td></td>`; });
      }

      html += `<td style="text-align:right;font-size:.7rem;font-weight:600;color:var(--text-2)">${catQty}</td>
               <td style="text-align:right;font-size:.7rem;font-weight:700;color:${cat.color}">${fmtMoney(catTotal)}</td>
             </tr>`;

      // Item rows
      catItems.forEach(it => {
        let itemQty = 0;
        html += `<tr>
          <td class="loc-td-name" style="position:sticky;left:0;z-index:2;background:var(--bg-card);border-right:1px solid var(--border);padding-left:1.5rem;cursor:pointer"
              onclick="App.editFnbItem(${it.id})">
            <span style="font-size:.7rem;color:var(--text-1)">${esc(it.name)}</span>
            <span style="font-size:.6rem;color:var(--text-4);margin-left:.3rem">/${esc(it.unit || 'unit')}</span>
          </td>
          <td style="text-align:right;font-size:.65rem;color:var(--text-3)">$${(it.unit_price || 0).toFixed(2)}</td>`;

        if (viewIsWeek) {
          weeks.forEach((wDates, wIdx) => {
            const weekQty = wDates.reduce((s, d) => {
              const e = lookup[`${it.id}|${d}`];
              return s + (e ? (e.quantity || 0) : 0);
            }, 0);
            itemQty += weekQty;
            const hasBg = weekQty > 0;
            html += `<td style="text-align:center;cursor:pointer;min-width:65px;height:28px;font-size:.65rem;${hasBg ? 'background:rgba(34,197,94,.12);color:var(--green);font-weight:600' : 'color:var(--text-4)'}"
              onclick="App.fnbCellClick(${it.id},'${entryType}','week',${wIdx})"
              oncontextmenu="event.preventDefault();App.fnbCellClear(${it.id},'${entryType}','week',${wIdx})"
              title="${weekQty > 0 ? weekQty + ' x $' + (it.unit_price || 0).toFixed(2) + ' = $' + (weekQty * (it.unit_price || 0)).toFixed(2) : 'Click to add'}">${weekQty || ''}</td>`;
          });
        } else {
          _locDates().forEach(d => {
            const e = lookup[`${it.id}|${d}`];
            const q = e ? (e.quantity || 0) : 0;
            itemQty += q;
            const hasBg = q > 0;
            html += `<td style="text-align:center;cursor:pointer;min-width:40px;height:28px;font-size:.65rem;${hasBg ? 'background:rgba(34,197,94,.12);color:var(--green);font-weight:600' : 'color:var(--text-4)'}"
              onclick="App.fnbCellClick(${it.id},'${entryType}','day','${d}')"
              oncontextmenu="event.preventDefault();App.fnbCellClear(${it.id},'${entryType}','day','${d}')"
              title="${q > 0 ? q + ' x $' + (it.unit_price || 0).toFixed(2) + ' = $' + (q * (it.unit_price || 0)).toFixed(2) : 'Click to add'}">${q || ''}</td>`;
          });
        }

        const itemTotal = itemQty * (it.unit_price || 0);
        html += `<td style="text-align:right;font-size:.65rem;color:var(--text-2)">${itemQty || ''}</td>
                 <td style="text-align:right;font-size:.65rem;font-weight:600;color:var(--green)">${itemTotal > 0 ? fmtMoney(itemTotal) : ''}</td>
               </tr>`;
      });
    });

    if (cats.length === 0) {
      html += `<tr><td colspan="100" style="text-align:center;padding:2rem;color:var(--text-4)">
        No categories yet. Click "+ Category" then "+ Item" to get started.
      </td></tr>`;
    }

    html += `</tbody></table></div>`;
    return html;
  }

  function _fnbRenderBudget() {
    const cats = state.fnbCategories || [];
    const items = state.fnbItems || [];
    const entries = state.fnbEntries || [];
    const itemMap = {};
    items.forEach(it => { itemMap[it.id] = it; });

    let grandPurchase = 0, grandConso = 0;
    const catData = cats.map(cat => {
      const catItems = items.filter(it => it.category_id === cat.id);
      let purchaseTotal = 0, consoTotal = 0;
      catItems.forEach(it => {
        const pQty = entries.filter(e => e.item_id === it.id && e.entry_type === 'purchase').reduce((s, e) => s + (e.quantity || 0), 0);
        const cQty = entries.filter(e => e.item_id === it.id && e.entry_type === 'consumption').reduce((s, e) => s + (e.quantity || 0), 0);
        purchaseTotal += pQty * (it.unit_price || 0);
        consoTotal += cQty * (it.unit_price || 0);
      });
      grandPurchase += purchaseTotal;
      grandConso += consoTotal;
      return { ...cat, purchaseTotal, consoTotal, balance: purchaseTotal - consoTotal, items: catItems };
    });

    let html = `
    <div class="budget-dept-card">
      <div class="budget-dept-header">
        <span style="font-weight:700;font-size:.82rem;color:var(--text-0)">FNB BUDGET SUMMARY</span>
        <span style="font-weight:700;color:var(--green)">${fmtMoney(grandPurchase)}</span>
      </div>
      <table class="budget-table"><thead><tr>
        <th>Category</th><th style="text-align:right">Achats</th><th style="text-align:right">Conso</th><th style="text-align:right">Balance</th><th style="text-align:center">% Used</th>
      </tr></thead><tbody>`;

    catData.forEach(cd => {
      const pct = cd.purchaseTotal > 0 ? Math.round(cd.consoTotal / cd.purchaseTotal * 100) : 0;
      const pctColor = pct > 100 ? '#EF4444' : pct > 80 ? '#EAB308' : '#22C55E';
      const balColor = cd.balance >= 0 ? 'var(--green)' : '#EF4444';
      html += `<tr>
        <td>
          <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${cd.color};margin-right:.4rem;vertical-align:middle"></span>
          <span style="font-weight:600">${esc(cd.name)}</span>
        </td>
        <td style="text-align:right;color:var(--green)">${fmtMoney(cd.purchaseTotal)}</td>
        <td style="text-align:right;color:#3B82F6">${fmtMoney(cd.consoTotal)}</td>
        <td style="text-align:right;font-weight:600;color:${balColor}">${fmtMoney(cd.balance)}</td>
        <td style="text-align:center;font-weight:700;color:${pctColor}">${cd.purchaseTotal > 0 ? pct + '%' : '--'}</td>
      </tr>`;

      // Per-item detail rows
      cd.items.forEach(it => {
        const pQty = entries.filter(e => e.item_id === it.id && e.entry_type === 'purchase').reduce((s, e) => s + (e.quantity || 0), 0);
        const cQty = entries.filter(e => e.item_id === it.id && e.entry_type === 'consumption').reduce((s, e) => s + (e.quantity || 0), 0);
        const pCost = pQty * (it.unit_price || 0);
        const cCost = cQty * (it.unit_price || 0);
        if (pCost > 0 || cCost > 0) {
          const iBal = pCost - cCost;
          html += `<tr style="font-size:.72rem;color:var(--text-3)">
            <td style="padding-left:1.5rem">${esc(it.name)} <span style="color:var(--text-4)">@$${(it.unit_price || 0).toFixed(2)}/${esc(it.unit || 'unit')}</span></td>
            <td style="text-align:right">${pQty > 0 ? fmtMoney(pCost) : '--'}</td>
            <td style="text-align:right">${cQty > 0 ? fmtMoney(cCost) : '--'}</td>
            <td style="text-align:right;color:${iBal >= 0 ? 'var(--green)' : '#EF4444'}">${fmtMoney(iBal)}</td>
            <td></td>
          </tr>`;
        }
      });
    });

    const grandBalance = grandPurchase - grandConso;
    html += `<tr style="border-top:2px solid var(--border)">
      <td style="font-weight:700;text-align:right">TOTAL</td>
      <td style="text-align:right;font-weight:700;color:var(--green)">${fmtMoney(grandPurchase)}</td>
      <td style="text-align:right;font-weight:700;color:#3B82F6">${fmtMoney(grandConso)}</td>
      <td style="text-align:right;font-weight:700;color:${grandBalance >= 0 ? 'var(--green)' : '#EF4444'}">${fmtMoney(grandBalance)}</td>
      <td style="text-align:center;font-weight:700;color:${grandPurchase > 0 ? (grandConso / grandPurchase > 1 ? '#EF4444' : '#22C55E') : 'var(--text-4)'}">${grandPurchase > 0 ? Math.round(grandConso / grandPurchase * 100) + '%' : '--'}</td>
    </tr>`;

    html += `</tbody></table></div>`;
    return html;
  }

  // Helper to convert hex color to rgb values for rgba()
  function _hexToRgb(hex) {
    const h = (hex || '#888888').replace('#', '');
    const r = parseInt(h.substring(0, 2), 16) || 0;
    const g = parseInt(h.substring(2, 4), 16) || 0;
    const b = parseInt(h.substring(4, 6), 16) || 0;
    return `${r},${g},${b}`;
  }

  function fnbSetSubTab(tab) {
    state.fnbSubTab = tab;
    renderFnb();
    _updateBreadcrumb(tab.charAt(0).toUpperCase() + tab.slice(1));
  }

  function fnbSetViewMode(mode) {
    state.fnbViewMode = mode;
    renderFnb();
  }

  async function fnbCellClick(itemId, entryType, mode, ref) {
    const weeks = _fnbWeeks();
    let targetDate;
    if (mode === 'week') {
      const wDates = weeks[ref];
      if (!wDates || wDates.length === 0) return;
      // For week mode, prompt for the total quantity for the week
      // We will store it split evenly across the first day of the week as a single entry
      // Actually simpler: store per-week quantity on the Monday (first day of week)
      targetDate = wDates[0];
      const existing = (state.fnbEntries || []).find(e => e.item_id === itemId && e.entry_type === entryType && e.date === targetDate);
      const curWeekQty = wDates.reduce((s, d) => {
        const e = (state.fnbEntries || []).find(en => en.item_id === itemId && en.entry_type === entryType && en.date === d);
        return s + (e ? (e.quantity || 0) : 0);
      }, 0);
      const qtyStr = prompt(`Quantity for week ${ref + 1} (${_fnbWeekLabel(wDates)}):`, curWeekQty);
      if (qtyStr === null) return;
      const newQty = parseFloat(qtyStr) || 0;
      // Clear all existing entries for this item/type in this week
      for (const d of wDates) {
        const e = (state.fnbEntries || []).find(en => en.item_id === itemId && en.entry_type === entryType && en.date === d);
        if (e) {
          await api('DELETE', `/api/fnb-entries/${e.id}`);
          state.fnbEntries = state.fnbEntries.filter(en => en.id !== e.id);
        }
      }
      // Create single entry on first day of week
      if (newQty > 0) {
        const result = await api('POST', `/api/productions/${state.prodId}/fnb-entries`, {
          item_id: itemId, entry_type: entryType, date: targetDate, quantity: newQty
        });
        if (result) state.fnbEntries.push(result);
      }
    } else {
      targetDate = ref;
      const existing = (state.fnbEntries || []).find(e => e.item_id === itemId && e.entry_type === entryType && e.date === targetDate);
      const curQty = existing ? (existing.quantity || 0) : 0;
      const qtyStr = prompt(`Quantity for ${targetDate}:`, curQty);
      if (qtyStr === null) return;
      const newQty = parseFloat(qtyStr) || 0;
      if (newQty > 0) {
        const result = await api('POST', `/api/productions/${state.prodId}/fnb-entries`, {
          item_id: itemId, entry_type: entryType, date: targetDate, quantity: newQty
        });
        if (result) {
          const i = (state.fnbEntries || []).findIndex(e => e.item_id === itemId && e.entry_type === entryType && e.date === targetDate);
          if (i >= 0) state.fnbEntries[i] = result;
          else state.fnbEntries.push(result);
        }
      } else if (existing) {
        await api('DELETE', `/api/fnb-entries/${existing.id}`);
        state.fnbEntries = state.fnbEntries.filter(e => e.id !== existing.id);
      }
    }
    renderFnb();
  }

  async function fnbCellClear(itemId, entryType, mode, ref) {
    const weeks = _fnbWeeks();
    if (mode === 'week') {
      const wDates = weeks[ref];
      for (const d of wDates) {
        const e = (state.fnbEntries || []).find(en => en.item_id === itemId && en.entry_type === entryType && en.date === d);
        if (e) {
          await api('DELETE', `/api/fnb-entries/${e.id}`);
          state.fnbEntries = state.fnbEntries.filter(en => en.id !== e.id);
        }
      }
    } else {
      const e = (state.fnbEntries || []).find(en => en.item_id === itemId && en.entry_type === entryType && en.date === ref);
      if (e) {
        await api('DELETE', `/api/fnb-entries/${e.id}`);
        state.fnbEntries = state.fnbEntries.filter(en => en.id !== e.id);
      }
    }
    renderFnb();
  }

  // ── FNB Category CRUD modals ─────────────────────────────────
  function showFnbCatModal() {
    $('fc-name').value = '';
    $('fc-color').value = '#F97316';
    $('fc-edit-id').value = '';
    $('fnb-cat-modal-title').textContent = 'Add Category';
    $('fc-confirm-btn').textContent = 'Create';
    $('fc-delete-btn').classList.add('hidden');
    $('fnb-cat-overlay').classList.remove('hidden');
  }

  function closeFnbCatModal() {
    $('fnb-cat-overlay').classList.add('hidden');
  }

  function editFnbCategory(catId) {
    const cat = (state.fnbCategories || []).find(c => c.id === catId);
    if (!cat) return;
    $('fc-name').value = cat.name;
    $('fc-color').value = cat.color || '#F97316';
    $('fc-edit-id').value = cat.id;
    $('fnb-cat-modal-title').textContent = 'Edit Category';
    $('fc-confirm-btn').textContent = 'Save';
    $('fc-delete-btn').classList.remove('hidden');
    $('fnb-cat-overlay').classList.remove('hidden');
  }

  async function saveFnbCategory() {
    const name = $('fc-name').value.trim();
    if (!name) { toast('Name required', 'error'); return; }
    const editId = $('fc-edit-id').value;
    const payload = { name, color: $('fc-color').value };
    try {
      if (editId) {
        await api('PUT', `/api/fnb-categories/${editId}`, payload);
      } else {
        await api('POST', `/api/productions/${state.prodId}/fnb-categories`, payload);
      }
      state.fnbCategories = null;
      state.fnbItems = null;
      closeFnbCatModal();
      toast(editId ? 'Category updated' : 'Category created', 'success');
      renderFnb();
    } catch(e) {
      toast('Error: ' + e.message, 'error');
    }
  }

  async function deleteFnbCategory() {
    const editId = $('fc-edit-id').value;
    if (!editId) return;
    if (!confirm('Delete this category and all its items?')) return;
    try {
      await api('DELETE', `/api/fnb-categories/${editId}`);
      state.fnbCategories = null;
      state.fnbItems = null;
      state.fnbEntries = null;
      closeFnbCatModal();
      toast('Category deleted', 'success');
      renderFnb();
    } catch(e) {
      toast('Error: ' + e.message, 'error');
    }
  }

  // ── FNB Item CRUD modals ──────────────────────────────────────
  function showFnbItemModal() {
    $('fi-name').value = '';
    $('fi-price').value = '';
    $('fi-unit').value = 'unit';
    $('fi-notes').value = '';
    $('fi-edit-id').value = '';
    $('fnb-item-modal-title').textContent = 'Add Item';
    $('fi-confirm-btn').textContent = 'Create';
    $('fi-delete-btn').classList.add('hidden');
    _fnbPopulateCategorySelect('');
    $('fnb-item-overlay').classList.remove('hidden');
  }

  function closeFnbItemModal() {
    $('fnb-item-overlay').classList.add('hidden');
  }

  function editFnbItem(itemId) {
    const it = (state.fnbItems || []).find(i => i.id === itemId);
    if (!it) return;
    $('fi-name').value = it.name;
    $('fi-price').value = it.unit_price || '';
    $('fi-unit').value = it.unit || 'unit';
    $('fi-notes').value = it.notes || '';
    $('fi-edit-id').value = it.id;
    $('fnb-item-modal-title').textContent = 'Edit Item';
    $('fi-confirm-btn').textContent = 'Save';
    $('fi-delete-btn').classList.remove('hidden');
    _fnbPopulateCategorySelect(it.category_id);
    $('fnb-item-overlay').classList.remove('hidden');
  }

  function _fnbPopulateCategorySelect(selectedId) {
    const cats = state.fnbCategories || [];
    $('fi-category').innerHTML = cats.map(c =>
      `<option value="${c.id}" ${c.id == selectedId ? 'selected' : ''}>${esc(c.name)}</option>`
    ).join('');
  }

  async function saveFnbItem() {
    const name = $('fi-name').value.trim();
    const categoryId = $('fi-category').value;
    if (!name) { toast('Name required', 'error'); return; }
    if (!categoryId) { toast('Category required', 'error'); return; }
    const editId = $('fi-edit-id').value;
    const payload = {
      name,
      category_id: parseInt(categoryId),
      unit_price: parseFloat($('fi-price').value) || 0,
      unit: $('fi-unit').value,
      notes: $('fi-notes').value.trim(),
    };
    try {
      if (editId) {
        await api('PUT', `/api/fnb-items/${editId}`, payload);
      } else {
        await api('POST', `/api/productions/${state.prodId}/fnb-items`, payload);
      }
      state.fnbItems = null;
      closeFnbItemModal();
      toast(editId ? 'Item updated' : 'Item created', 'success');
      renderFnb();
    } catch(e) {
      toast('Error: ' + e.message, 'error');
    }
  }

  async function deleteFnbItem() {
    const editId = $('fi-edit-id').value;
    if (!editId) return;
    if (!confirm('Delete this item and all its entries?')) return;
    try {
      await api('DELETE', `/api/fnb-items/${editId}`);
      state.fnbItems = null;
      state.fnbEntries = null;
      closeFnbItemModal();
      toast('Item deleted', 'success');
      renderFnb();
    } catch(e) {
      toast('Error: ' + e.message, 'error');
    }
  }

  // ── FNB Export ────────────────────────────────────────────────
  function fnbExportCSV() {
    // Server-side simplified export (totals by category, Up to Date + Estimate)
    authDownload(`/api/productions/${state.prodId}/export/fnb-budget/csv`);
  }




  // ═══════════════════════════════════════════════════════════
  //  INIT
  // ═══════════════════════════════════════════════════════════

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
  //  DASHBOARD VIEW
  // ═══════════════════════════════════════════════════════════

  async function renderDashboard() {
    const container = $('dashboard-content');
    if (!container) return;
    container.innerHTML = '<div style="color:var(--text-3);padding:2rem;text-align:center">Loading dashboard...</div>';

    try {
      const data = await api('GET', `/api/productions/${state.prodId}/dashboard`);
      const { departments, total_estimate, total_actual, kpis, alerts, burn_data } = data;

      const deptNames = {
        locations: 'Locations', boats: 'Boats', picture_boats: 'Picture Boats',
        security_boats: 'Security Boats', transport: 'Transport',
        fuel: 'Fuel', labour: 'Labour', guards: 'Guards (Camp)', fnb: 'FNB'
      };
      const deptColors = {
        locations: '#22C55E', boats: '#3B82F6', picture_boats: '#8B5CF6',
        security_boats: '#EF4444', transport: '#22C55E',
        fuel: '#F59E0B', labour: '#F59E0B', guards: '#06B6D4', fnb: '#F97316'
      };

      // --- KPI cards (with projected total) ---
      const projectedTotal = kpis.projected_total || 0;
      const projOver = projectedTotal > total_estimate;
      const kpiHTML = `
        <div class="dash-kpis">
          <div class="dash-kpi">
            <div class="dash-kpi-value">${fmtMoney(total_estimate)}</div>
            <div class="dash-kpi-label">Total Budget Estimate</div>
          </div>
          <div class="dash-kpi">
            <div class="dash-kpi-value">${fmtMoney(total_actual)}</div>
            <div class="dash-kpi-label">Total Actual</div>
          </div>
          <div class="dash-kpi ${projOver ? 'dash-kpi-projected' : ''}">
            <div class="dash-kpi-value">${fmtMoney(projectedTotal)}</div>
            <div class="dash-kpi-label">Projected Total</div>
          </div>
          <div class="dash-kpi">
            <div class="dash-kpi-value">${kpis.days_elapsed} / ${kpis.shooting_days_total}</div>
            <div class="dash-kpi-label">Days Elapsed</div>
          </div>
          <div class="dash-kpi">
            <div class="dash-kpi-value">${kpis.days_remaining}</div>
            <div class="dash-kpi-label">Days Remaining</div>
          </div>
          <div class="dash-kpi">
            <div class="dash-kpi-value">${fmtMoney(kpis.burn_rate_per_day)}</div>
            <div class="dash-kpi-label">Burn Rate / Day</div>
          </div>
          <div class="dash-kpi">
            <div class="dash-kpi-value">${kpis.fuel_liters?.toLocaleString() || 0} L</div>
            <div class="dash-kpi-label">Total Fuel</div>
          </div>
        </div>`;

      // --- Budget Alerts (75% caution, 90% warning, 100%+ over) ---
      let alertsHTML = '';
      if (alerts.length > 0) {
        const sortedAlerts = [...alerts].sort((a, b) => b.pct - a.pct);
        alertsHTML = `<div class="dash-alerts">
          <h3 style="color:var(--text-1);font-size:.85rem;margin-bottom:.5rem">Budget Alerts</h3>
          ${sortedAlerts.map(a => {
            let cls = 'dash-alert-caution';
            let icon = '!';
            if (a.type === 'over_budget') { cls = 'dash-alert-red'; icon = '!!'; }
            else if (a.type === 'warning') { cls = 'dash-alert-amber'; icon = '!'; }
            return `
            <div class="dash-alert ${cls}">
              <span class="dash-alert-icon">${icon}</span>
              <span>${esc(a.msg)}</span>
            </div>`;
          }).join('')}
        </div>`;
      }

      // --- Scheduling Conflict Alerts (AXE 7.3) ---
      let conflictAlertsHTML = '';
      if (_alertsData.length > 0) {
        conflictAlertsHTML = `<div class="dash-alerts dash-conflict-alerts">
          <h3 style="color:var(--text-1);font-size:.85rem;margin-bottom:.5rem;display:flex;align-items:center;gap:.4rem">
            Scheduling Conflicts
            <span class="dash-conflict-count">${_alertsData.length}</span>
          </h3>
          ${_alertsData.slice(0, 5).map(a => {
            let cls = 'dash-alert-caution';
            let icon = 'i';
            if (a.severity === 'danger') { cls = 'dash-alert-red'; icon = '!!'; }
            else if (a.severity === 'warning') { cls = 'dash-alert-amber'; icon = '!'; }
            return `
            <div class="dash-alert ${cls}">
              <span class="dash-alert-icon">${icon}</span>
              <span>${esc(a.msg)}</span>
            </div>`;
          }).join('')}
          ${_alertsData.length > 5 ? `<div style="text-align:center;padding:.3rem;font-size:.75rem;color:var(--text-3);cursor:pointer" onclick="App.toggleAlertsPanel()">+ ${_alertsData.length - 5} more - View all</div>` : ''}
        </div>`;
      }

      // --- Stacked bar chart: Estimated vs Actual by department ---
      const maxBudget = Math.max(...Object.values(departments).map(d => Math.max(d.estimate || 0, d.actual || 0)), 1);
      const stackedBarsHTML = Object.entries(departments).map(([key, dept]) => {
        const name = deptNames[key] || key;
        const color = deptColors[key] || '#6b7280';
        const est = dept.estimate || 0;
        const act = dept.actual || 0;
        const estW = (est / maxBudget * 100).toFixed(1);
        const actW = (act / maxBudget * 100).toFixed(1);
        const variance = dept.variance_pct || 0;
        const varCls = variance > 0 ? 'var-positive' : variance < 0 ? 'var-negative' : 'var-zero';
        const varLabel = variance > 0 ? `+${variance}%` : `${variance}%`;
        return `
          <div class="dash-stacked-row">
            <div class="dash-stacked-label">${name}</div>
            <div class="dash-stacked-bars">
              <div class="dash-stacked-bar-est" style="width:${estW}%;background:${color}"></div>
              <div class="dash-stacked-bar-act" style="width:${actW}%;background:${color}"></div>
            </div>
            <div class="dash-stacked-amounts">
              <strong>${fmtMoney(act)}</strong><br>
              <span>/ ${fmtMoney(est)}</span>
            </div>
            <div class="dash-dept-variance ${varCls}">${varLabel}</div>
          </div>`;
      }).join('');

      const stackedHTML = `
        <div class="dash-stacked-chart">
          <h3>Estimated vs Actual by Department</h3>
          ${stackedBarsHTML}
          <div class="dash-stacked-legend">
            <span class="dash-legend-est">Estimated</span>
            <span class="dash-legend-act">Actual</span>
          </div>
        </div>`;

      // --- Burn rate SVG chart with projection ---
      let burnHTML = '';
      if (burn_data && burn_data.length > 1) {
        const svgW = 600, svgH = 160, padL = 50, padR = 15, padT = 15, padB = 25;
        const chartW = svgW - padL - padR;
        const chartH = svgH - padT - padB;
        const maxY = Math.max(total_estimate, ...burn_data.map(d => d.cumulative)) * 1.1;
        const n = burn_data.length;

        // Build actual line points
        const actualPts = [];
        const projPts = [];
        let lastActualIdx = -1;

        burn_data.forEach((d, i) => {
          const x = padL + (i / (n - 1)) * chartW;
          const y = padT + chartH - (d.cumulative / maxY) * chartH;
          if (d.is_actual) {
            actualPts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
            lastActualIdx = i;
          }
          if (!d.is_actual || i === lastActualIdx) {
            projPts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
          }
        });
        // Ensure projection starts from last actual
        if (lastActualIdx >= 0 && lastActualIdx < n - 1) {
          const x0 = padL + (lastActualIdx / (n - 1)) * chartW;
          const y0 = padT + chartH - (burn_data[lastActualIdx].cumulative / maxY) * chartH;
          if (!projPts.length || projPts[0] !== `${x0.toFixed(1)},${y0.toFixed(1)}`) {
            projPts.unshift(`${x0.toFixed(1)},${y0.toFixed(1)}`);
          }
        }

        // Budget line Y
        const budgetY = padT + chartH - (total_estimate / maxY) * chartH;

        // Date labels (first, middle, last)
        const dateLabels = [];
        if (n >= 1) dateLabels.push({ i: 0, d: burn_data[0].date });
        if (n >= 3) dateLabels.push({ i: Math.floor(n / 2), d: burn_data[Math.floor(n / 2)].date });
        if (n >= 2) dateLabels.push({ i: n - 1, d: burn_data[n - 1].date });

        // Y axis labels
        const ySteps = 4;
        const yLabels = [];
        for (let s = 0; s <= ySteps; s++) {
          const val = (maxY / ySteps) * s;
          const y = padT + chartH - (val / maxY) * chartH;
          yLabels.push({ y, label: fmtMoney(val) });
        }

        burnHTML = `
        <div class="dash-burn-chart">
          <h3>Burn Rate & Projection</h3>
          <div class="dash-burn-svg-wrap">
            <svg viewBox="0 0 ${svgW} ${svgH}" preserveAspectRatio="xMidYMid meet">
              <!-- Grid lines -->
              ${yLabels.map(yl => `
                <line x1="${padL}" y1="${yl.y.toFixed(1)}" x2="${svgW - padR}" y2="${yl.y.toFixed(1)}" stroke="var(--border)" stroke-width="0.5"/>
                <text x="${padL - 4}" y="${(yl.y + 3).toFixed(1)}" text-anchor="end" fill="var(--text-4)" font-size="8">${yl.label}</text>
              `).join('')}

              <!-- Budget line (dashed) -->
              <line x1="${padL}" y1="${budgetY.toFixed(1)}" x2="${svgW - padR}" y2="${budgetY.toFixed(1)}" stroke="var(--amber)" stroke-width="1.5" stroke-dasharray="6,3"/>
              <text x="${svgW - padR}" y="${(budgetY - 4).toFixed(1)}" text-anchor="end" fill="var(--amber)" font-size="8" font-weight="600">Budget</text>

              <!-- Projection line (dashed) -->
              ${projPts.length > 1 ? `<polyline points="${projPts.join(' ')}" fill="none" stroke="var(--text-4)" stroke-width="1.5" stroke-dasharray="4,3"/>` : ''}

              <!-- Actual line (solid) -->
              ${actualPts.length > 1 ? `<polyline points="${actualPts.join(' ')}" fill="none" stroke="var(--blue)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` : ''}

              <!-- Area under actual -->
              ${actualPts.length > 1 ? `<polygon points="${padL},${(padT + chartH).toFixed(1)} ${actualPts.join(' ')} ${actualPts[actualPts.length - 1].split(',')[0]},${(padT + chartH).toFixed(1)}" fill="var(--blue)" opacity="0.08"/>` : ''}

              <!-- Date labels -->
              ${dateLabels.map(dl => {
                const x = padL + (dl.i / Math.max(n - 1, 1)) * chartW;
                return `<text x="${x.toFixed(1)}" y="${(svgH - 4).toFixed(1)}" text-anchor="middle" fill="var(--text-4)" font-size="8">${dl.d.slice(5)}</text>`;
              }).join('')}
            </svg>
          </div>
          <div class="dash-burn-legend">
            <div class="dash-burn-legend-item">
              <div class="dash-burn-legend-line" style="background:var(--blue)"></div>
              <span>Actual spend</span>
            </div>
            <div class="dash-burn-legend-item">
              <div class="dash-burn-legend-line" style="background:var(--text-4);opacity:.6"></div>
              <span>Projected</span>
            </div>
            <div class="dash-burn-legend-item">
              <div class="dash-burn-budget-line" style="border-color:var(--amber)"></div>
              <span>Total budget</span>
            </div>
          </div>
        </div>`;
      }

      // --- Department budget bars (with variance + alert colors) ---
      const barsHTML = Object.entries(departments).map(([key, dept]) => {
        const name = deptNames[key] || key;
        const color = deptColors[key] || '#6b7280';
        const est = dept.estimate || 0;
        const act = dept.actual || 0;
        const pct = est > 0 ? Math.min(Math.round(act / est * 100), 150) : 0;
        const barWidth = Math.min(pct, 100);
        const overBudget = pct > 100;
        const variance = dept.variance_pct || 0;
        const varCls = variance > 0 ? 'var-positive' : variance < 0 ? 'var-negative' : 'var-zero';
        const varLabel = variance > 0 ? `+${variance}%` : `${variance}%`;
        // Color coding: >100 red, >90 orange, >75 amber
        let pctCls = '';
        let barColor = color;
        if (pct > 100) { pctCls = 'dash-over'; barColor = 'var(--red)'; }
        else if (pct >= 90) { pctCls = 'dash-warning'; barColor = '#f97316'; }
        else if (pct >= 75) { pctCls = 'dash-caution'; barColor = 'var(--amber)'; }
        return `
          <div class="dash-dept-row">
            <div class="dash-dept-name" style="color:${color}">${name}</div>
            <div class="dash-dept-bar-wrap">
              <div class="dash-dept-bar" style="width:${barWidth}%;background:${barColor}"></div>
            </div>
            <div class="dash-dept-values">
              <span class="dash-dept-actual">${fmtMoney(act)}</span>
              <span class="dash-dept-est">/ ${fmtMoney(est)}</span>
              <span class="dash-dept-pct ${pctCls}">${pct}%</span>
              <span class="dash-dept-variance ${varCls}">${varLabel}</span>
            </div>
          </div>`;
      }).join('');

      // --- Next arena ---
      const arenaHTML = kpis.next_arena
        ? `<div style="margin-top:1rem;padding:.5rem .8rem;background:var(--bg-card);border-radius:8px;border:1px solid var(--border)">
            <span style="color:var(--text-3);font-size:.75rem">Next Arena:</span>
            <strong style="color:var(--amber);margin-left:.4rem">${fmtDateLong(kpis.next_arena)}</strong>
          </div>`
        : '';

      container.innerHTML = `
        ${kpiHTML}
        ${arenaHTML}
        ${alertsHTML}
        ${conflictAlertsHTML}
        ${stackedHTML}
        ${burnHTML}
        <div class="dash-depts">
          <h3 style="color:var(--text-1);font-size:.85rem;margin-bottom:.5rem">Budget by Department</h3>
          ${barsHTML}
        </div>`;
    } catch (e) {
      container.innerHTML = `<div style="color:var(--red);padding:2rem">${esc(e.message)}</div>`;
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  SCHEDULING ALERTS PANEL (AXE 7.3)
  // ═══════════════════════════════════════════════════════════

  let _alertsPanelOpen = false;
  let _alertsData = [];
  let _alertsFilter = 'all';
  let _alertsLoaded = false;

  async function loadAlerts() {
    if (!state.prodId) return;
    try {
      const data = await api('GET', `/api/productions/${state.prodId}/alerts`);
      _alertsData = data.alerts || [];
      _updateAlertsBadge();
      _alertsLoaded = true;
      if (_alertsPanelOpen) _renderAlertsList();
    } catch (e) {
      console.warn('Failed to load alerts:', e);
    }
  }

  function _updateAlertsBadge() {
    const badge = $('alerts-badge');
    if (!badge) return;
    const count = _alertsData.length;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  function toggleAlertsPanel() {
    const panel = $('alerts-panel');
    if (!panel) return;
    _alertsPanelOpen = !_alertsPanelOpen;
    panel.classList.toggle('hidden', !_alertsPanelOpen);
    if (_alertsPanelOpen) {
      if (!_alertsLoaded) loadAlerts();
      else _renderAlertsList();
    }
  }

  function filterAlerts(severity) {
    _alertsFilter = severity;
    // Update filter buttons
    document.querySelectorAll('.alerts-filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === severity);
    });
    _renderAlertsList();
  }

  function _renderAlertsList() {
    const list = $('alerts-panel-list');
    if (!list) return;

    const filtered = _alertsFilter === 'all'
      ? _alertsData
      : _alertsData.filter(a => a.severity === _alertsFilter);

    if (filtered.length === 0) {
      list.innerHTML = `<div class="alerts-empty">
        ${_alertsData.length === 0 ? 'No scheduling conflicts detected' : 'No alerts matching this filter'}
      </div>`;
      return;
    }

    const moduleIcons = {
      boats: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M2 20c2-1 4-2 6-2s4 1 6 2 4 1 6 0"/><path d="M4 18l1-9h14l1 9"/></svg>',
      picture_boats: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M2 20c2-1 4-2 6-2s4 1 6 2 4 1 6 0"/><path d="M4 18l1-9h14l1 9"/></svg>',
      security_boats: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M2 20c2-1 4-2 6-2s4 1 6 2 4 1 6 0"/><path d="M4 18l1-9h14l1 9"/></svg>',
      guards: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    };

    const severityConfig = {
      danger:  { cls: 'alert-item-danger',  icon: '!!', label: 'Critical' },
      warning: { cls: 'alert-item-warning', icon: '!',  label: 'Warning' },
      info:    { cls: 'alert-item-info',    icon: 'i',  label: 'Info' },
    };

    list.innerHTML = filtered.map(a => {
      const sev = severityConfig[a.severity] || severityConfig.info;
      const modIcon = moduleIcons[a.module] || '';
      const modLabel = (a.module || '').replace(/_/g, ' ');
      return `
        <div class="alert-item ${sev.cls}">
          <span class="alert-item-severity">${sev.icon}</span>
          <div class="alert-item-content">
            <div class="alert-item-msg">${esc(a.msg)}</div>
            <div class="alert-item-meta">
              ${modIcon}<span>${modLabel}</span>
              ${a.date ? `<span class="alert-item-date">${a.date}</span>` : ''}
            </div>
          </div>
        </div>`;
    }).join('');
  }

  // ═══════════════════════════════════════════════════════════
  //  GLOBAL SEARCH (Cmd+K)
  // ═══════════════════════════════════════════════════════════

  let _searchOpen = false;

  function _openSearch() {
    if (_searchOpen) return;
    _searchOpen = true;
    let overlay = $('search-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'search-overlay';
      overlay.className = 'search-overlay';
      overlay.innerHTML = `
        <div class="search-modal">
          <input type="text" id="search-input" class="search-input" placeholder="Search boats, vehicles, helpers, guards, locations..." autocomplete="off">
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
    $('search-results').innerHTML = '<div style="color:var(--text-4);padding:1rem;text-align:center;font-size:.8rem">Start typing to search...</div>';

    input.oninput = () => {
      clearTimeout(input._debounce);
      input._debounce = setTimeout(() => _doSearch(input.value.trim()), 150);
    };
    input.onkeydown = e => {
      if (e.key === 'Escape') _closeSearch();
      if (e.key === 'Enter') {
        const first = $('search-results')?.querySelector('.search-result-item');
        if (first) first.click();
      }
    };
  }

  function _closeSearch() {
    _searchOpen = false;
    const overlay = $('search-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.style.display = 'none';
    }
  }

  function _doSearch(query) {
    const container = $('search-results');
    if (!container) return;
    if (!query || query.length < 2) {
      container.innerHTML = '<div style="color:var(--text-4);padding:1rem;text-align:center;font-size:.8rem">Start typing to search...</div>';
      return;
    }

    const q = query.toLowerCase();
    const results = [];

    // Search boats
    (state.boats || []).forEach(b => {
      if ((b.name || '').toLowerCase().includes(q) || (b.vendor || '').toLowerCase().includes(q)) {
        results.push({ type: 'Boat', name: b.name, detail: b.vendor || '', tab: 'boats', id: b.id });
      }
    });

    // Search picture boats
    (state.pictureBoats || []).forEach(b => {
      if ((b.name || '').toLowerCase().includes(q) || (b.vendor || '').toLowerCase().includes(q)) {
        results.push({ type: 'Picture Boat', name: b.name, detail: b.vendor || '', tab: 'picture-boats', id: b.id });
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
        results.push({ type: 'Worker', name: h.name, detail: h.role || '', tab: 'labour', id: h.id });
      }
    });

    // Search security boats
    (state.securityBoats || []).forEach(b => {
      if ((b.name || '').toLowerCase().includes(q) || (b.vendor || '').toLowerCase().includes(q)) {
        results.push({ type: 'Security Boat', name: b.name, detail: b.vendor || '', tab: 'security-boats', id: b.id });
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
        results.push({ type: 'Function', name: f.name, detail: f.function_group || '', tab: 'boats', id: f.id });
      }
    });

    // Search guard camp workers
    (state.gcWorkers || []).forEach(g => {
      if ((g.name || '').toLowerCase().includes(q) || (g.role || '').toLowerCase().includes(q)) {
        results.push({ type: 'Guard', name: g.name, detail: g.role || '', tab: 'guards', id: g.id });
      }
    });

    // Search guard posts
    (state.guardPosts || []).forEach(p => {
      if ((p.name || '').toLowerCase().includes(q) || (p.location || '').toLowerCase().includes(q)) {
        results.push({ type: 'Guard Post', name: p.name, detail: p.location || '', tab: 'guards', id: p.id });
      }
    });

    // Search location sites
    (state.locationSites || []).forEach(l => {
      if ((l.name || '').toLowerCase().includes(q) || (l.location_type || '').toLowerCase().includes(q)) {
        results.push({ type: 'Location', name: l.name, detail: l.location_type || '', tab: 'locations', id: l.id });
      }
    });

    if (results.length === 0) {
      container.innerHTML = '<div style="color:var(--text-4);padding:1rem;text-align:center;font-size:.8rem">No results</div>';
      return;
    }

    container.innerHTML = results.slice(0, 20).map(r => `
      <div class="search-result-item" onclick="App.setTab('${r.tab}');App._closeSearch()">
        <span class="search-result-type">${esc(r.type)}</span>
        <span class="search-result-name">${esc(r.name)}</span>
        <span class="search-result-detail">${esc(r.detail)}</span>
      </div>`).join('');
  }

  async function init() {
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
        // Close alerts panel (AXE 7.3)
        if (_alertsPanelOpen) { toggleAlertsPanel(); }
        closeShortcutsPanel();
        const moreSheet = $('bnav-more-sheet');
        if (moreSheet && !moreSheet.classList.contains('hidden')) { moreSheet.classList.add('hidden'); }
        closeDayModal();
        closeAssignModal();
        closeAddBoatModal();
        closeAddPictureBoatModal();
        closeAddTransportVehicleModal();
        closeAddFunctionModal();
        closeBoatView();
        closeBoatDetail();
        closeSchedulePopover();
        cancelConfirm();
        closeAddLocationModal();
        closeAddGuardModal();
        closeAddSecurityBoatModal();
        closeAddWorkerModal();
        closeFnbCatModal();
        closeFnbItemModal();
        if (state.selectedBoat) {
          state.selectedBoat  = null;
          state.pendingFuncId = null;
          state.pendingDate   = null;
          renderBoatList();
          renderRoleCards();
        }
        if (state.pbSelectedBoat || state.pbPendingFuncId) {
          state.pbSelectedBoat  = null;
          state.pbPendingFuncId = null;
          state.pbPendingDate   = null;
          renderPbBoatList();
          renderPbRoleCards();
        }
        if (state.tbSelectedVehicle || state.tbPendingFuncId) {
          state.tbSelectedVehicle = null;
          state.tbPendingFuncId   = null;
          state.tbPendingDate     = null;
          renderTbVehicleList();
          renderTbRoleCards();
        }
        if (state.sbSelectedBoat || state.sbPendingFuncId) {
          state.sbSelectedBoat  = null;
          state.sbPendingFuncId = null;
          state.sbPendingDate   = null;
          renderSbBoatList();
          renderSbRoleCards();
        }
        if (state.lbSelectedWorker || state.lbPendingFuncId) {
          state.lbSelectedWorker = null;
          state.lbPendingFuncId  = null;
          state.lbPendingDate    = null;
          renderLbWorkerList();
          renderLbRoleCards();
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
        const numTabs = ['dashboard', 'pdt', 'locations', 'boats', 'picture-boats', 'security-boats', 'transport', 'fuel', 'labour', 'guards'];
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
            You are not assigned to any project.<br>
            <small>Ask an administrator to invite you to a project.</small>
          </div>`;
      }
    } catch (e) {
      console.error('Init error:', e);
      if (e.message === 'Session expired') return;
      document.getElementById('main-content').innerHTML =
        `<div style="color:var(--red);padding:3rem;text-align:center">
          Load error: ${esc(e.message)}<br>
          <small>Check that the Flask server is running on port 5002.</small>
        </div>`;
    }
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
    if (ctx === 'security') renderSbRoleCards(); else if (ctx === 'labour') renderLbRoleCards(); else if (ctx === 'guard_camp') renderGcRoleCards(); else if (ctx === 'picture') renderPbRoleCards(); else if (ctx === 'transport') renderTbRoleCards(); else renderRoleCards();
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
    if (ctx === 'security') renderSbRoleCards(); else if (ctx === 'labour') renderLbRoleCards(); else if (ctx === 'guard_camp') renderGcRoleCards(); else if (ctx === 'picture') renderPbRoleCards(); else if (ctx === 'transport') renderTbRoleCards(); else renderRoleCards();
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

  // ═══════════════════════════════════════════════════════════════
  // ADMIN PANEL
  // ═══════════════════════════════════════════════════════════════

  let _adminTab = 'users';
  let _adminUsers = [];
  let _adminProjects = [];
  let _adminMembers = [];
  let _adminModalAction = null;
  let _adminModalData = {};

  function adminSetTab(tab) {
    _adminTab = tab;
    document.querySelectorAll('.admin-tab').forEach(b => b.classList.toggle('active', b.getAttribute('data-atab') === tab));
    document.querySelectorAll('.admin-sub').forEach(el => el.classList.toggle('active', el.id === `admin-${tab}`));
    if (tab === 'users') _adminLoadUsers();
    else if (tab === 'projects') _adminLoadProjects();
    else if (tab === 'invitations') _adminLoadInvitations();
    else if (tab === 'templates') _adminLoadTemplates();
  }

  async function _adminLoadUsers() {
    try {
      _adminUsers = await api('GET', '/api/admin/users');
      _renderAdminUsers();
    } catch (e) { toast('Failed to load users: ' + e.message, 'error'); }
  }

  function _renderAdminUsers() {
    const el = $('admin-users-list');
    if (!el) return;
    if (!_adminUsers.length) { el.innerHTML = '<p style="color:var(--text-3)">No users found.</p>'; return; }
    let html = '<table class="admin-table"><thead><tr><th>Nickname</th><th>Admin</th><th>Projects</th><th>Actions</th></tr></thead><tbody>';
    for (const u of _adminUsers) {
      const projects = (u.memberships || []).map(m =>
        `<span class="badge badge-${m.role.toLowerCase()}">${esc(m.production_name)} (${m.role})</span>`
      ).join(' ');
      html += `<tr>
        <td><strong>${esc(u.nickname)}</strong></td>
        <td>${u.is_admin ? 'Yes' : 'No'}</td>
        <td>${projects || '<span style="color:var(--text-3)">None</span>'}</td>
        <td class="admin-actions">
          <button onclick="App.adminResetPassword(${u.id}, '${esc(u.nickname)}')">Reset pw</button>
          ${u.id !== authState.user?.id ? `<button class="btn-danger-sm" onclick="App.adminDeleteUser(${u.id}, '${esc(u.nickname)}')">Delete</button>` : ''}
        </td>
      </tr>`;
    }
    html += '</tbody></table>';
    el.innerHTML = html;
  }

  async function _adminLoadProjects() {
    try {
      _adminProjects = await api('GET', '/api/admin/projects');
      _renderAdminProjects();
    } catch (e) { toast('Failed to load projects: ' + e.message, 'error'); }
  }

  function _renderAdminProjects() {
    const el = $('admin-projects-list');
    if (!el) return;
    if (!_adminProjects.length) { el.innerHTML = '<p style="color:var(--text-3)">No projects.</p>'; return; }
    let html = '<table class="admin-table"><thead><tr><th>Name</th><th>Status</th><th>Members</th><th>Actions</th></tr></thead><tbody>';
    for (const p of _adminProjects) {
      html += `<tr>
        <td><strong>${esc(p.name)}</strong></td>
        <td>${esc(p.status || 'active')}</td>
        <td>${p.member_count || 0}</td>
        <td class="admin-actions">
          <button onclick="App.adminRenameProject(${p.id}, '${esc(p.name)}')">Rename</button>
          <button onclick="App.adminArchiveProject(${p.id}, '${esc(p.name)}', '${esc(p.status)}')">${p.status === 'archived' ? 'Activate' : 'Archive'}</button>
        </td>
      </tr>`;
    }
    html += '</tbody></table>';
    el.innerHTML = html;
  }

  async function _adminLoadInvitations() {
    try {
      _adminProjects = await api('GET', '/api/admin/projects');
      const sel = $('admin-inv-project');
      if (sel) {
        sel.innerHTML = _adminProjects.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
      }
      await adminLoadMembers();
    } catch (e) { toast('Failed to load invitations: ' + e.message, 'error'); }
  }

  async function adminLoadMembers() {
    const sel = $('admin-inv-project');
    if (!sel || !sel.value) return;
    try {
      _adminMembers = await api('GET', `/api/admin/projects/${sel.value}/members`);
      _renderAdminMembers();
    } catch (e) { toast('Failed to load members: ' + e.message, 'error'); }
  }

  function _renderAdminMembers() {
    const el = $('admin-inv-members');
    if (!el) return;
    if (!_adminMembers.length) { el.innerHTML = '<p style="color:var(--text-3)">No members.</p>'; return; }
    const projId = $('admin-inv-project')?.value;
    let html = '<table class="admin-table"><thead><tr><th>User</th><th>Role</th><th>Actions</th></tr></thead><tbody>';
    for (const m of _adminMembers) {
      html += `<tr>
        <td><strong>${esc(m.nickname)}</strong></td>
        <td><span class="badge badge-${(m.role || '').toLowerCase()}">${esc(m.role)}</span></td>
        <td class="admin-actions">
          <button onclick="App.adminChangeRole(${projId}, ${m.user_id}, '${esc(m.nickname)}', '${esc(m.role)}')">Change role</button>
          ${m.user_id !== authState.user?.id ? `<button class="btn-danger-sm" onclick="App.adminRemoveMember(${projId}, ${m.user_id}, '${esc(m.nickname)}')">Remove</button>` : ''}
        </td>
      </tr>`;
    }
    html += '</tbody></table>';
    el.innerHTML = html;
  }

  function adminShowCreateUser() {
    _adminModalAction = 'create-user';
    $('admin-modal-title').textContent = 'Create User';
    $('admin-modal-body').innerHTML = `
      <div class="form-group"><label class="form-label">Nickname</label>
        <input type="text" id="adm-nickname" class="form-control" placeholder="e.g. JOHN"></div>
      <div class="form-group"><label class="form-label">Password</label>
        <input type="password" id="adm-password" class="form-control" placeholder="Min 6 characters"></div>
    `;
    $('admin-modal-ok').textContent = 'Create';
    $('admin-modal-overlay').classList.remove('hidden');
  }

  function adminShowCreateProject() {
    _adminModalAction = 'create-project';
    $('admin-modal-title').textContent = 'Create Project';
    // Load templates for dropdown
    api('GET', '/api/admin/templates').then(tpls => {
      let tplOpts = '<option value="">-- Blank project --</option>';
      (tpls || []).forEach(t => { tplOpts += `<option value="${t.id}">${t.name}</option>`; });
      const sel = $('adm-proj-template');
      if (sel) sel.innerHTML = tplOpts;
    }).catch(() => {});
    $('admin-modal-body').innerHTML = `
      <div class="form-group"><label class="form-label">Project Name</label>
        <input type="text" id="adm-projname" class="form-control" placeholder="e.g. KLAS8"></div>
      <div class="form-group"><label class="form-label">From Template (optional)</label>
        <select id="adm-proj-template" class="form-control"><option value="">-- Blank project --</option></select></div>
    `;
    $('admin-modal-ok').textContent = 'Create';
    $('admin-modal-overlay').classList.remove('hidden');
  }

  function adminShowInvite() {
    const projId = $('admin-inv-project')?.value;
    if (!projId) return;
    _adminModalAction = 'invite';
    $('admin-modal-title').textContent = 'Invite User to Project';
    $('admin-modal-body').innerHTML = `
      <div class="form-group"><label class="form-label">Nickname</label>
        <input type="text" id="adm-inv-nickname" class="form-control" placeholder="Existing user nickname"></div>
      <div class="form-group"><label class="form-label">Role</label>
        <select id="adm-inv-role" class="form-control">
          <option value="ADMIN">ADMIN</option>
          <option value="UNIT">UNIT</option>
          <option value="TRANSPO">TRANSPO</option>
          <option value="READER" selected>READER</option>
        </select></div>
    `;
    $('admin-modal-ok').textContent = 'Invite';
    $('admin-modal-overlay').classList.remove('hidden');
  }

  function adminCloseModal() {
    $('admin-modal-overlay').classList.add('hidden');
    _adminModalAction = null;
  }

  async function adminModalConfirm() {
    try {
      if (_adminModalAction === 'create-user') {
        const nickname = $('adm-nickname')?.value?.trim();
        const password = $('adm-password')?.value;
        if (!nickname || !password) { toast('Fill all fields', 'error'); return; }
        await api('POST', '/api/admin/users', { nickname, password });
        toast(`User '${nickname}' created`);
        adminCloseModal();
        _adminLoadUsers();
      } else if (_adminModalAction === 'create-project') {
        const name = $('adm-projname')?.value?.trim();
        if (!name) { toast('Enter project name', 'error'); return; }
        const templateId = $('adm-proj-template')?.value;
        if (templateId) {
          await api('POST', '/api/admin/projects/from-template', { name, template_id: parseInt(templateId) });
          toast(`Project '${name}' created from template`);
        } else {
          await api('POST', '/api/admin/projects', { name });
          toast(`Project '${name}' created`);
        }
        adminCloseModal();
        _adminLoadProjects();
        await _loadAuthState();
      } else if (_adminModalAction === 'invite') {
        const projId = $('admin-inv-project')?.value;
        const nickname = $('adm-inv-nickname')?.value?.trim();
        const role = $('adm-inv-role')?.value;
        if (!nickname) { toast('Enter nickname', 'error'); return; }
        await api('POST', `/api/admin/projects/${projId}/members`, { nickname, role });
        toast(`'${nickname}' invited as ${role}`);
        adminCloseModal();
        adminLoadMembers();
      } else if (_adminModalAction === 'change-role') {
        const { projId, userId } = _adminModalData;
        const role = $('adm-role-select')?.value;
        await api('PUT', `/api/admin/projects/${projId}/members/${userId}`, { role });
        toast('Role updated');
        adminCloseModal();
        adminLoadMembers();
      } else if (_adminModalAction === 'reset-password') {
        const { userId } = _adminModalData;
        const password = $('adm-new-password')?.value;
        if (!password || password.length < 6) { toast('Min 6 characters', 'error'); return; }
        await api('PUT', `/api/admin/users/${userId}/password`, { password });
        toast('Password reset');
        adminCloseModal();
      } else if (_adminModalAction === 'rename-project') {
        const { projId } = _adminModalData;
        const name = $('adm-rename')?.value?.trim();
        if (!name) { toast('Enter name', 'error'); return; }
        await api('PUT', `/api/admin/projects/${projId}`, { name });
        toast('Project renamed');
        adminCloseModal();
        _adminLoadProjects();
        await _loadAuthState();
      }
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  function adminResetPassword(userId, nickname) {
    _adminModalAction = 'reset-password';
    _adminModalData = { userId };
    $('admin-modal-title').textContent = `Reset Password: ${nickname}`;
    $('admin-modal-body').innerHTML = `
      <div class="form-group"><label class="form-label">New Password</label>
        <input type="password" id="adm-new-password" class="form-control" placeholder="Min 6 characters"></div>
    `;
    $('admin-modal-ok').textContent = 'Reset';
    $('admin-modal-overlay').classList.remove('hidden');
  }

  async function adminDeleteUser(userId, nickname) {
    if (!confirm(`Delete user '${nickname}'? This cannot be undone.`)) return;
    try {
      await api('DELETE', `/api/admin/users/${userId}`);
      toast(`User '${nickname}' deleted`);
      _adminLoadUsers();
    } catch (e) { toast(e.message, 'error'); }
  }

  function adminRenameProject(projId, currentName) {
    _adminModalAction = 'rename-project';
    _adminModalData = { projId };
    $('admin-modal-title').textContent = 'Rename Project';
    $('admin-modal-body').innerHTML = `
      <div class="form-group"><label class="form-label">New Name</label>
        <input type="text" id="adm-rename" class="form-control" value="${esc(currentName)}"></div>
    `;
    $('admin-modal-ok').textContent = 'Rename';
    $('admin-modal-overlay').classList.remove('hidden');
  }

  async function adminArchiveProject(projId, name, currentStatus) {
    const newStatus = currentStatus === 'archived' ? 'active' : 'archived';
    const action = newStatus === 'archived' ? 'archive' : 'activate';
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} project '${name}'?`)) return;
    try {
      await api('PUT', `/api/admin/projects/${projId}`, { status: newStatus });
      toast(`Project '${name}' ${action}d`);
      _adminLoadProjects();
    } catch (e) { toast(e.message, 'error'); }
  }

  function adminChangeRole(projId, userId, nickname, currentRole) {
    _adminModalAction = 'change-role';
    _adminModalData = { projId, userId };
    $('admin-modal-title').textContent = `Change Role: ${nickname}`;
    $('admin-modal-body').innerHTML = `
      <div class="form-group"><label class="form-label">Role</label>
        <select id="adm-role-select" class="form-control">
          ${['ADMIN','UNIT','TRANSPO','READER'].map(r =>
            `<option value="${r}" ${r === currentRole ? 'selected' : ''}>${r}</option>`
          ).join('')}
        </select></div>
    `;
    $('admin-modal-ok').textContent = 'Update';
    $('admin-modal-overlay').classList.remove('hidden');
  }

  async function adminRemoveMember(projId, userId, nickname) {
    if (!confirm(`Remove '${nickname}' from this project?`)) return;
    try {
      await api('DELETE', `/api/admin/projects/${projId}/members/${userId}`);
      toast(`'${nickname}' removed`);
      adminLoadMembers();
    } catch (e) { toast(e.message, 'error'); }
  }

  // ═══════════════════════════════════════════════════════════
  //  FAB — Floating Action Button (mobile, contextual per tab)
  // ═══════════════════════════════════════════════════════════

  const FAB_CONFIG = {
    pdt:              { label: '+ Day',       action: () => addDay() },
    boats:            { label: '+ Boat',      action: () => showAddBoatModal() },
    'picture-boats':  { label: '+ Boat',      action: () => showAddPictureBoatModal() },
    'security-boats': { label: '+ Boat',      action: () => showAddSecurityBoatModal() },
    transport:        { label: '+ Vehicle',   action: () => showAddTransportVehicleModal() },
    labour:           { label: '+ Worker',    action: () => showAddWorkerModal() },
    guards:           { label: '+ Guard',     action: () => gcShowAddWorkerModal() },
    locations:        { label: '+ Location',  action: () => showAddLocationModal() },
    fnb:              { label: '+ Category',  action: () => showFnbCatModal() },
  };

  function _updateFab() {
    const fab = $('fab-btn');
    if (!fab) return;
    const cfg = FAB_CONFIG[state.tab];
    if (!cfg || !_canEdit()) {
      fab.style.display = 'none';
      return;
    }
    fab.style.display = '';
    const lbl = $('fab-label');
    if (lbl) lbl.textContent = cfg.label;
  }

  function fabAction() {
    const cfg = FAB_CONFIG[state.tab];
    if (cfg) cfg.action();
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
          text.textContent = 'Release to refresh';
          _ptrTriggered = true;
        } else {
          icon.classList.remove('ptr-ready');
          text.textContent = 'Pull to refresh';
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
        text.textContent = 'Refreshing...';
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
            text.textContent = 'Pull to refresh';
            toast('Data refreshed', 'success');
          }, 400);
        });
      } else {
        indicator.classList.remove('ptr-pulling');
        icon.classList.remove('ptr-ready');
        text.textContent = 'Pull to refresh';
      }
      _ptrTriggered = false;
    }, { passive: true });
  }

  async function _reloadCurrentTab() {
    const tab = state.tab;
    try {
      if (tab === 'pdt')             { state.shootingDays = await api('GET', `/api/productions/${state.prodId}/shooting-days`); renderPDT(); }
      else if (tab === 'boats')      { const [b,f,a] = await Promise.all([api('GET',`/api/productions/${state.prodId}/boats`), api('GET',`/api/productions/${state.prodId}/boat-functions?context=boats`), api('GET',`/api/productions/${state.prodId}/assignments`)]); state.boats=b; state.functions=f; state.assignments=a; renderBoats(); }
      else if (tab === 'picture-boats')   { const [b,f,a] = await Promise.all([api('GET',`/api/productions/${state.prodId}/picture-boats`), api('GET',`/api/productions/${state.prodId}/boat-functions?context=picture`), api('GET',`/api/productions/${state.prodId}/picture-boat-assignments`)]); state.pictureBoats=b; state.pbFunctions=f; state.pbAssignments=a; renderPictureBoats(); }
      else if (tab === 'security-boats')  { await _loadAndRenderSecurityBoats(); }
      else if (tab === 'transport')       { await _loadAndRenderTransport(); }
      else if (tab === 'fuel')            { await _loadAndRenderFuel(); }
      else if (tab === 'labour')          { await _loadAndRenderLabour(); }
      else if (tab === 'locations')       { state.locationSchedules = null; renderLocations(); }
      else if (tab === 'guards')          { state.guardSchedules = null; state.locationSchedules = null; state.locationSites = null; renderGuards(); }
      else if (tab === 'fnb')             { state.fnbCategories = null; state.fnbItems = null; state.fnbEntries = null; renderFnb(); }
      else if (tab === 'budget')          { renderBudget(); }
      else if (tab === 'dashboard')       { renderDashboard(); }
    } catch(e) { toast('Refresh failed: ' + e.message, 'error'); }
  }

  // ── Public API ─────────────────────────────────────────────
  return {
    setTab,
    parsePDT, triggerPDTUpload, handlePDTFileUpload,
    setPDTView, pdtCalPrev, pdtCalNext, pdtCalToggleDay,
    addDay, editDay, closeDayModal, saveDay, deleteDay,
    addEventToDay, deleteEventFromDay, _updateDayEventField, _renderDayEvents, toggleEventsSection,
    setBoatView, filterBoats,
    onBoatDragStart, onBoatDragEnd, onDragOver, onDragLeave, onDrop,
    onBoatClick, onDropZoneClick,
    confirmAssignment, closeAssignModal, editAssignment, editAssignmentById,
    removeAssignment, removeAssignmentById,
    showAddBoatModal, closeAddBoatModal, createBoat,
    showAddFunctionModal, closeAddFunctionModal, createFunction,
    confirmDeleteFunc,
    // Schedule — date cells & func cell
    onDateCellClick, onFuncCellClick,
    closeSchedulePopover, assignFromDate,
    editAssignmentById, removeAssignmentById, resetDayOverrides,
    toggleDayLock, pbToggleDayLock,
    showPDTTooltip, showDateTooltip, hidePDTTooltip,
    // Boat view popup + detail / edit
    openBoatView, closeBoatView,
    openBoatDetail, closeBoatDetail, saveBoatEdit, triggerPhotoUpload, uploadBoatPhoto,
    undoBoat, toggleExport, exportCSV, exportJSON, budgetExportXlsx, budgetExportPdf, dailyReportPdf, vendorSummaryExport, logisticsExportXlsx, _toggleDailySort,
    // Budget History (AXE 6.3)
    _setBudgetHistoryTab, _setSnapshotCompare, _createManualSnapshot, _compareSnapshots,
    showConfirm, cancelConfirm, confirmDeleteBoat,
    // Cascade (AXE 7.2)
    cancelCascade, applyCascade, skipCascade,
    _onScheduleMouseDown, _onScheduleMouseOver, multiSelectFill, multiSelectClear, multiSelectCancel,
    multiSelectSetStatus, multiSelectSetValue,
    // Picture Boats
    pbSetBoatView, pbFilterBoats, pbOpenBoatView,
    pbOnBoatDragStart, pbOnBoatDragEnd, pbOnDragOver, pbOnDragLeave, pbOnDrop,
    pbOnDropZoneClick, pbShowAddFunctionModal, pbUndoBoat,
    pbEditAssignmentById, pbRemoveAssignmentById, pbConfirmDeleteFunc,
    pbOnDateCellClick, pbOnFuncCellClick, pbAssignFromDate,
    showAddPictureBoatModal, closeAddPictureBoatModal, createPictureBoat,
    openPictureBoatDetail, deletePictureBoat, confirmDeletePictureBoat, _detailBoatIdForBtn,
    pbToggleExport, pbExportCSV, pbExportJSON,
    openGroupsModal, closeGroupsModal, addGroup, removeGroup,
    // Transport
    tbSetBoatView, tbFilterVehicles, tbOpenVehicleView,
    tbOnVehicleDragStart, tbOnVehicleDragEnd, tbOnDragOver, tbOnDragLeave, tbOnDrop,
    tbOnDropZoneClick, tbShowAddFunctionModal, tbUndoVehicle,
    tbEditAssignmentById, tbRemoveAssignmentById, tbConfirmDeleteFunc,
    tbOnDateCellClick, tbOnFuncCellClick, tbAssignFromDate,
    tbToggleDayLock, tbToggleExport, tbExportCSV, tbExportJSON,
    showAddTransportVehicleModal, closeAddTransportVehicleModal, createTransportVehicle,
    openTransportVehicleDetail, confirmDeleteVehicle,
    // Fuel
    fuelSetTab, fuelAutoFill, fuelToggleDayLock,
    fuelCellInput, fuelRowTypeChange,
    fuelToggleExport, fuelExportCSV, fuelExportJSON,
    showFuelMachineryModal, closeFuelMachineryModal, confirmFuelMachineryModal, deleteFuelMachinery,
    fuelMachineryCellInput, fuelMachineryRowTypeChange,
    fuelPriceChange, fuelGlobalPriceChange, fuelBudgetExportCSV,
    // Labour (ex-Helpers)
    lbSetView, lbFilterWorkers, lbOpenWorkerView,
    lbOnWorkerDragStart, lbOnWorkerDragEnd, lbOnDragOver, lbOnDragLeave, lbOnDrop,
    lbOnDropZoneClick, lbShowAddFunctionModal, lbUndo,
    lbEditAssignmentById, lbRemoveAssignmentById, lbConfirmDeleteFunc,
    lbOnDateCellClick, lbOnFuncCellClick, lbAssignFromDate,
    lbToggleDayLock, lbToggleExport, lbExportCSV,
    showAddWorkerModal, closeAddWorkerModal, createWorker,
    openWorkerDetail, confirmDeleteWorker, lbStartInlineRateEdit, lbSaveWorkerRate, renderLbWorkerList,
    // Security Boats
    sbSetView, sbFilterBoats, sbOpenBoatView,
    sbOnBoatDragStart, sbOnBoatDragEnd, sbOnDragOver, sbOnDragLeave, sbOnDrop,
    sbOnDropZoneClick, sbShowAddFunctionModal, sbUndoBoat,
    sbEditAssignmentById, sbRemoveAssignmentById, sbConfirmDeleteFunc,
    sbOnDateCellClick, sbOnFuncCellClick, sbAssignFromDate,
    sbToggleDayLock, sbToggleExport, sbExportCSV, sbExportJSON,
    showAddSecurityBoatModal, closeAddSecurityBoatModal, saveSecurityBoat,
    deleteSecurityBoatFromModal, openSecurityBoatDetail, deleteSecurityBoat, confirmDeleteSecurityBoat,
    // Locations
    locSetView, locSetSubTab, locCellClick, locToggleLock, locAutoFill, locResyncPdt, locExportCSV,
    showAddLocationModal, closeAddLocationModal, editLocationSite,
    saveLocationSite, deleteLocationSite,
    _locModalAddSchedule, _locModalRemoveSchedule,
    // Guards — sub-tab navigation
    gdSetSubTab, gdSetView,
    // Guards — Location Guards (editable)
    gdlRefresh, gdlExportCSV, gdlCellClick, gdlToggleLock,
    // Guards — legacy guard post CRUD
    showAddGuardModal, closeAddGuardModal, editGuardPost,
    saveGuardPost, deleteGuardPost,
    // Bulk create helpers
    showBulkHelperModal, closeBulkHelperModal, bulkCreateHelpers,
    importHelpersCsv, downloadHelperCsvTemplate,
    // CSV Import (AXE 10.4)
    openCsvImportModal, closeCsvImportModal, downloadCsvTemplate, submitCsvImport,
    // Guards — Base Camp
    gcSetView, gcFilterWorkers, gcOpenWorkerView,
    gcOnWorkerDragStart, gcOnWorkerDragEnd, gcOnDragOver, gcOnDragLeave, gcOnDrop,
    gcOnDropZoneClick, gcShowAddFunctionModal, gcUndo,
    gcEditAssignmentById, gcRemoveAssignmentById, gcConfirmDeleteFunc,
    gcOnDateCellClick, gcOnFuncCellClick, gcAssignFromDate,
    gcToggleDayLock, gcToggleExport, gcExportCSV,
    gcShowAddWorkerModal, gcCloseAddWorkerModal, gcCreateWorker,
    gcOpenWorkerDetail, confirmDeleteGuardCampWorker,
    // FNB
    fnbSetSubTab, fnbSetViewMode, fnbCellClick, fnbCellClear, fnbExportCSV,
    showFnbCatModal, closeFnbCatModal, editFnbCategory, saveFnbCategory, deleteFnbCategory,
    showFnbItemModal, closeFnbItemModal, editFnbItem, saveFnbItem, deleteFnbItem,
    // Auth
    logout, authState,
    _canEdit, _canEditPrices, _canEditFuelPrices, _isAdmin, _canViewTab,
    _applyPriceRestrictions,
    // Admin panel
    adminSetTab, adminLoadMembers,
    adminShowCreateUser, adminShowCreateProject, adminShowInvite,
    adminCloseModal, adminModalConfirm,
    adminResetPassword, adminDeleteUser,
    adminRenameProject, adminArchiveProject,
    adminChangeRole, adminRemoveMember,
    toggleTheme,
    // Dashboard
    renderDashboard,
    // Alerts (AXE 7.3)
    toggleAlertsPanel, filterAlerts, loadAlerts,
    // Search
    _openSearch, _closeSearch,
    // History undo
    _undoFromToast,
    // FAB
    fabAction,
    // Bottom nav & breadcrumb & shortcuts
    toggleBottomNavMore, _updateBreadcrumb,
    openShortcutsPanel, closeShortcutsPanel,
    // AXE 5.4 — Feedback
    _updateNetIndicator, _updateOfflineCounter,
    init,
  };
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
  const banner = document.createElement('div');
  banner.id = 'offline-banner';
  banner.className = 'offline-banner';
  banner.textContent = 'You are offline - changes will sync when connection returns';
  document.body.prepend(banner);
  // AXE 5.4: update network indicator
  if (typeof App !== 'undefined' && App._updateNetIndicator) App._updateNetIndicator(false);
});

window.addEventListener('online', () => {
  const banner = document.getElementById('offline-banner');
  if (banner) banner.remove();
  // AXE 5.4: update network indicator
  if (typeof App !== 'undefined' && App._updateNetIndicator) App._updateNetIndicator(true);
});
