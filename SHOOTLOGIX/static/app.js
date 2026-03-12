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

  // ── Auth: permissions & UI restrictions (RBAC V2) ────────
  // V1 fallback tabs (used only when no V2 permissions loaded)
  const ROLE_ALLOWED_TABS = {
    ADMIN:   ['dashboard','pdt','locations','boats','picture-boats','security-boats','transport','fuel','labour','guards','fnb','budget'],
    UNIT:    ['dashboard','pdt','locations','boats','picture-boats','security-boats','transport','fuel','labour','guards','fnb','budget'],
    TRANSPO: ['dashboard','boats','picture-boats','security-boats','transport','fuel'],
    READER:  ['dashboard','pdt','locations','boats','picture-boats','security-boats','transport','fuel','labour','guards','fnb','budget'],
  };

  function _getModulePerm(tab) {
    if (!authState.permissions) return null;
    return authState.permissions[tab] || null;
  }

  function _canViewTab(tab) {
    if (_isAdmin()) return true;
    if (tab === 'dashboard') return true;
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
        for (const mod of ['pdt','locations','boats','picture-boats','security-boats','transport','fuel','labour','guards','fnb','budget']) {
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
    $('ps-welcome').textContent = `Welcome, ${authState.user.nickname}`;
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
      await Promise.all([loadShootingDays(), loadBoatsData(), loadPictureBoatsData(), _loadFuelGlobals()]);
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

  // ── Tab navigation (original — replaced by setTabLazy below) ──
  function setTab(tab) {
    // Delegate to the lazy-loading version defined later
    return setTabLazy(tab);
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


  // ═══════════════════════════════════════════════════════════
  //  MODULE LOADER — AXE 8.2
  // ═══════════════════════════════════════════════════════════

  const _loadedModules = {};
  const MODULE_MAP = {
    'pdt':            '/static/modules/pdt.js',
    'boats':          '/static/modules/boats.js',
    'picture-boats':  '/static/modules/picture-boats.js',
    'budget':         '/static/modules/budget.js',
    'transport':      '/static/modules/transport.js',
    'fuel':           '/static/modules/fuel.js',
    'labour':         '/static/modules/labour.js',
    'security-boats': '/static/modules/security-boats.js',
    'locations':      '/static/modules/locations.js',
    'guards':         '/static/modules/guards.js',
    'fnb':            '/static/modules/fnb.js',
    'dashboard':      '/static/modules/dashboard.js',
    'alerts':         '/static/modules/alerts.js',
    'admin':          '/static/modules/admin.js',
    'activity':       '/static/modules/activity.js',
    'comments':       '/static/modules/comments.js',
    'notifications':  '/static/modules/notifications.js',
  };

  // Dependencies: some modules need other modules loaded first
  const MODULE_DEPS = {
    'budget': ['boats', 'transport', 'fuel', 'labour', 'security-boats', 'locations', 'guards'],
    'dashboard': ['boats'],
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
        cancelConfirm();
        App.closeAddLocationModal?.();
        App.closeAddGuardModal?.();
        App.closeAddSecurityBoatModal?.();
        App.closeAddWorkerModal?.();
        App.closeFnbCatModal?.();
        App.closeFnbItemModal?.();
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


  // ═══════════════════════════════════════════════════════════
  //  FAB — Floating Action Button (mobile, contextual per tab)
  // ═══════════════════════════════════════════════════════════

  const FAB_CONFIG = {
    pdt:              { label: '+ Day',       action: () => App.addDay?.() },
    boats:            { label: '+ Boat',      action: () => App.showAddBoatModal?.() },
    'picture-boats':  { label: '+ Boat',      action: () => App.showAddPictureBoatModal?.() },
    'security-boats': { label: '+ Boat',      action: () => App.showAddSecurityBoatModal?.() },
    transport:        { label: '+ Vehicle',   action: () => App.showAddTransportVehicleModal?.() },
    labour:           { label: '+ Worker',    action: () => App.showAddWorkerModal?.() },
    guards:           { label: '+ Guard',     action: () => App.gcShowAddWorkerModal?.() },
    locations:        { label: '+ Location',  action: () => App.showAddLocationModal?.() },
    fnb:              { label: '+ Category',  action: () => App.showFnbCatModal?.() },
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

    // Load module for this tab
    const moduleKey = tab === 'picture-boats' ? 'picture-boats'
                    : tab === 'security-boats' ? 'security-boats'
                    : tab;
    if (MODULE_MAP[moduleKey]) {
      await _loadModule(moduleKey);
    }

    // Call render functions (now available on App after module load)
    if (tab === 'dashboard')       App.renderDashboard?.();
    if (tab === 'pdt')             { if (typeof _pdtView !== 'undefined' && _pdtView === 'calendar') { App._initCalMonth?.(); App.renderPDTCalendar?.(); } else App.renderPDT?.(); }
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
    state, authState, $, esc, api, toast, fmtMoney, fmtDate, fmtDateLong,
    _localDk, workingDays, activeWorkingDays, computeWd, effectiveStatus,
    waveClass, waveLabel, _morphHTML, _morphChildren, _morphAttributes,
    _debouncedRender, _renderTimers,
    _flashSaved, _flashSavedCard, _queueCellFlash,
    _skeletonCards, _skeletonTable,
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
    closeSchedulePopover: typeof closeSchedulePopover === 'function' ? closeSchedulePopover : () => {},
    renderSchedulePopover: typeof renderSchedulePopover === 'function' ? renderSchedulePopover : () => {},
    _updateBreadcrumb, _updateBottomNav, _updateFab,
    _loadModule,
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
    toggleBottomNavMore, _updateBreadcrumb,
    openShortcutsPanel, closeShortcutsPanel,
    // Search
    _openSearch, _closeSearch,
    // History undo
    _undoFromToast,
    // FAB
    fabAction,
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
