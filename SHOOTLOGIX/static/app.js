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
  function toast(msg, type = 'success') {
    $('toast-icon').textContent = type === 'error' ? '✕' : type === 'info' ? 'ℹ' : '✓';
    $('toast-msg').textContent = msg;
    $('toast-inner').className = type;
    $('toast').classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.add('hidden'), 3200);
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
    ADMIN:   ['pdt','locations','boats','picture-boats','security-boats','transport','fuel','labour','guards','fnb','budget'],
    UNIT:    ['pdt','locations','boats','picture-boats','security-boats','transport','fuel','labour','guards','fnb','budget'],
    TRANSPO: ['boats','picture-boats','security-boats','transport','fuel'],
    READER:  ['pdt','locations','boats','picture-boats','security-boats','transport','fuel','labour','guards','fnb','budget'],
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
  async function api(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await authFetch(path, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
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

    if (tab === 'pdt')             renderPDT();
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
      const rate = b.daily_rate_estimate > 0
        ? `<div style="font-size:.65rem;color:var(--green);margin-top:.1rem">$${Math.round(b.daily_rate_estimate).toLocaleString('en-US')}/j</div>`
        : '';

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
        <button class="boat-edit-btn" title="Edit boat"
          onclick="event.stopPropagation();App.openBoatDetail(${b.id})">✎</button>
      </div>`;
    }).join('');
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
        onmouseenter="App.showPDTTooltip(event,'${dk}')"
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
        title="${esc(func.name)}" onclick="App.onFuncCellClick(event,${func.id})">
        <div class="rn-group" style="color:${color}">${esc(func.function_group || 'Special')}</div>
        <div class="${boatLabel ? 'rn-boat' : 'rn-empty'}">${esc(boatLabel ? boatLabel + multiSuffix : func.name)}</div>
      </td>`;

      // Date cells: pure click-to-cycle, no text
      days.forEach(day => {
        const dk = _localDk(day);
        const isWE = day.getDay() === 0 || day.getDay() === 6;
        const weClass = isWE ? 'weekend-col' : '';

        // Find first assignment with a non-null status for this day
        let filledAsgn = null, filledStatus = null;
        for (const asgn of funcAsgns) {
          const st = effectiveStatus(asgn, dk);
          if (st) { filledAsgn = asgn; filledStatus = st; break; }
        }

        if (!filledAsgn) {
          cells += `<td class="schedule-cell ${weClass}"
            onclick="App.onDateCellClick(event,${func.id},null,'${dk}')"></td>`;
        } else {
          const bg = _scheduleCellBg(filledStatus, color, isWE);
          cells += `<td class="schedule-cell ${weClass}" style="background:${bg}"
            onclick="App.onDateCellClick(event,${func.id},${filledAsgn.id},'${dk}')"></td>`;
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

    const _scrollSaved = _saveScheduleScroll(container);
    container.innerHTML = `
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
    // Sync lock footer scroll with the main horizontal scroll
    const _sw = container.querySelector('.schedule-wrap');
    const _sl = container.querySelector('.schedule-lock-outer');
    _sw.addEventListener('scroll', () => { _sl.scrollLeft = _sw.scrollLeft; });
    _restoreScheduleScroll(container, _scrollSaved);
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
      renderBoats();
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
    if (!events.length && !day.location) return;

    const tip = $('pdt-tooltip');
    let html = `<div style="font-weight:700;margin-bottom:.25rem;color:var(--text-0)">J${day.day_number || '?'} — ${date}</div>` +
      events.map(ev => `<div class="pdt-tip-event">
        <span class="event-badge ev-${ev.event_type || 'game'}" style="font-size:.58rem">${(ev.event_type||'game').toUpperCase()}</span>
        <span style="color:var(--text-1)">${esc(ev.name || day.game_name || '—')}</span>
        ${ev.location ? `<span style="color:var(--text-4)">@ ${esc(ev.location)}</span>` : ''}
      </div>`).join('');
    // Notes section
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

  function hidePDTTooltip() {
    $('pdt-tooltip')?.classList.add('hidden');
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
      if (_detailIsSecurityBoat) {
        const updated = await api('PUT', `/api/security-boats/${_detailBoatId}`, data);
        const idx = state.securityBoats.findIndex(b => b.id === _detailBoatId);
        if (idx >= 0) state.securityBoats[idx] = { ...state.securityBoats[idx], ...updated };
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
        closeBoatDetail();
        renderTbVehicleList();
        toast('Vehicle updated');
      } else if (_detailIsPicture) {
        const updated = await api('PUT', `/api/picture-boats/${_detailBoatId}`, data);
        const idx = state.pictureBoats.findIndex(b => b.id === _detailBoatId);
        if (idx >= 0) state.pictureBoats[idx] = { ...state.pictureBoats[idx], ...updated };
        closeBoatDetail();
        renderPbBoatList();
        toast('Picture boat updated');
      } else {
        data.category = $('bd-category').value;
        const updated = await api('PUT', `/api/boats/${_detailBoatId}`, data);
        const idx = state.boats.findIndex(b => b.id === _detailBoatId);
        if (idx >= 0) state.boats[idx] = { ...state.boats[idx], ...updated };
        closeBoatDetail();
        renderBoatList();
        toast('Boat updated');
      }
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  }

  function closeBoatDetail() {
    $('boat-detail-overlay').classList.add('hidden');
    // Restore all potentially hidden rows
    ['bd-group', 'bd-category', 'bd-waves', 'bd-night', 'bd-capacity'].forEach(id => {
      const el = $(id); if (el) { const row = el.closest('tr'); if (row) row.style.display = ''; }
    });
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
      const rate = b.daily_rate_estimate > 0
        ? `<div style="font-size:.65rem;color:var(--green);margin-top:.1rem">$${Math.round(b.daily_rate_estimate).toLocaleString('en-US')}/j</div>`
        : '';
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
        <button class="boat-edit-btn" title="Edit boat"
          onclick="event.stopPropagation();App.openPictureBoatDetail(${b.id})">✎</button>
      </div>`;
    }).join('');
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
        onmouseenter="App.showPDTTooltip(event,'${dk}')"
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
    const _scrollSaved = _saveScheduleScroll(container);
    container.innerHTML = `
      <div class="schedule-wrap"><table class="schedule-table">
        <thead><tr>${monthRow}</tr><tr>${dayRow}</tr></thead>
        <tbody>${rowsHTML}<tr class="schedule-count-row">${countCells}</tr></tbody>
      </table></div>
      <div class="schedule-lock-outer"><table class="schedule-table">
        <tbody><tr class="schedule-lock-row">${lockCells}</tr></tbody>
      </table></div>`;
    // Sync lock footer scroll with the main horizontal scroll
    const _sw = container.querySelector('.schedule-wrap');
    const _sl = container.querySelector('.schedule-lock-outer');
    _sw.addEventListener('scroll', () => { _sl.scrollLeft = _sw.scrollLeft; });
    _restoreScheduleScroll(container, _scrollSaved);
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
          <button class="btn btn-sm btn-primary" onclick="App.budgetExportXlsx()" style="display:flex;align-items:center;gap:.35rem">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export XLSX
          </button>
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
    } catch (e) {
      container.innerHTML = `<div style="color:var(--red);padding:2rem">Error: ${esc(e.message)}</div>`;
    }
  }

  // ── Global Budget Export (KLAS7_BUDGET_YYMMDD.xlsx) ──────────────────────

  function budgetExportXlsx() {
    authDownload(`/api/productions/${state.prodId}/export/budget-global`);
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
      const rate = v.daily_rate_estimate > 0
        ? `<div style="font-size:.65rem;color:var(--green);margin-top:.1rem">$${Math.round(v.daily_rate_estimate).toLocaleString('en-US')}/j</div>`
        : '';
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
        <button class="boat-edit-btn" title="Edit vehicle"
          onclick="event.stopPropagation();App.openTransportVehicleDetail(${v.id})">✎</button>
      </div>`;
    }).join('');
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
        onmouseenter="App.showPDTTooltip(event,'${dk}')"
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
    $('bd-captain').value  = v.driver              || '';  // driver → captain field
    $('bd-vendor').value   = v.vendor              || '';
    $('bd-rate-est').value = v.daily_rate_estimate || '';
    $('bd-rate-act').value = v.daily_rate_actual   || '';
    $('bd-notes').value    = v.notes               || '';

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
    onmouseenter="App.showPDTTooltip(event,'${dk}')"
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
    onmouseenter="App.showPDTTooltip(event,'${dk}')"
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
        <button class="boat-edit-btn" title="Edit worker"
          onclick="event.stopPropagation();App.openWorkerDetail(${w.id})">&#x270E;</button>
      </div>`;
    }).join('');
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
        onmouseenter="App.showPDTTooltip(event,'${dk}')"
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
      const rate = b.daily_rate_estimate > 0
        ? `<div style="font-size:.65rem;color:var(--green);margin-top:.1rem">$${Math.round(b.daily_rate_estimate).toLocaleString('en-US')}/j</div>`
        : '';
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
        <button class="boat-edit-btn" title="Edit boat"
          onclick="event.stopPropagation();App.openSecurityBoatDetail(${b.id})">&#9998;</button>
      </div>`;
    }).join('');
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
        onmouseenter="App.showPDTTooltip(event,'${dk}')"
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
    const _scrollSaved = _saveScheduleScroll(container);
    container.innerHTML = `
      <div class="schedule-wrap"><table class="schedule-table">
        <thead><tr>${monthRow}</tr><tr>${dayRow}</tr></thead>
        <tbody>${rowsHTML}<tr class="schedule-count-row">${countCells}</tr></tbody>
      </table></div>
      <div class="schedule-lock-outer"><table class="schedule-table">
        <tbody><tr class="schedule-lock-row">${lockCells}</tr></tbody>
      </table></div>`;
    // Sync lock footer scroll with the main horizontal scroll
    const _sw = container.querySelector('.schedule-wrap');
    const _sl = container.querySelector('.schedule-lock-outer');
    if (_sw && _sl) _sw.addEventListener('scroll', () => { _sl.scrollLeft = _sw.scrollLeft; });
    _restoreScheduleScroll(container, _scrollSaved);
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
                  onmouseenter="App.showPDTTooltip(event,'${d}')"
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
    const date = $('nl-sched-date').value;
    const status = $('nl-sched-status').value;
    if (!date) { toast('Select a date', 'error'); return; }
    await api('POST', `/api/productions/${state.prodId}/location-schedules`, {
      location_name: site.name, location_type: site.location_type, date, status
    });
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
  }

  async function renderGuards() {
    // Entry point when GUARDS tab is opened
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
                  onmouseenter="App.showPDTTooltip(event,'${d}')"
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
    try {
      const [workers, functions, assignments] = await Promise.all([
        api('GET', `/api/productions/${state.prodId}/guard-camp-workers`),
        api('GET', `/api/productions/${state.prodId}/boat-functions?context=guard_camp`),
        api('GET', `/api/productions/${state.prodId}/guard-camp-assignments`),
      ]);
      state.gcWorkers     = workers;
      state.gcFunctions   = functions;
      state.gcAssignments = assignments;
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
      const rate = w.daily_rate_estimate > 0
        ? `<div style="font-size:.65rem;color:var(--green);margin-top:.1rem">$${Math.round(w.daily_rate_estimate).toLocaleString('en-US')}/d</div>`
        : '';
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
        <button class="boat-edit-btn" title="Edit guard"
          onclick="event.stopPropagation();App.gcOpenWorkerDetail(${w.id})">&#x270E;</button>
      </div>`;
    }).join('');
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
        onmouseenter="App.showPDTTooltip(event,'${dk}')"
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
    $('admin-modal-body').innerHTML = `
      <div class="form-group"><label class="form-label">Project Name</label>
        <input type="text" id="adm-projname" class="form-control" placeholder="e.g. KLAS8"></div>
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
        await api('POST', '/api/admin/projects', { name });
        toast(`Project '${name}' created`);
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

  // ── Public API ─────────────────────────────────────────────
  return {
    setTab,
    parsePDT, triggerPDTUpload, handlePDTFileUpload,
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
    showPDTTooltip, hidePDTTooltip,
    // Boat view popup + detail / edit
    openBoatView, closeBoatView,
    openBoatDetail, closeBoatDetail, saveBoatEdit, triggerPhotoUpload, uploadBoatPhoto,
    undoBoat, toggleExport, exportCSV, exportJSON, budgetExportXlsx,
    showConfirm, cancelConfirm,
    // Picture Boats
    pbSetBoatView, pbFilterBoats, pbOpenBoatView,
    pbOnBoatDragStart, pbOnBoatDragEnd, pbOnDragOver, pbOnDragLeave, pbOnDrop,
    pbOnDropZoneClick, pbShowAddFunctionModal, pbUndoBoat,
    pbEditAssignmentById, pbRemoveAssignmentById, pbConfirmDeleteFunc,
    pbOnDateCellClick, pbOnFuncCellClick, pbAssignFromDate,
    showAddPictureBoatModal, closeAddPictureBoatModal, createPictureBoat,
    openPictureBoatDetail, deletePictureBoat, _detailBoatIdForBtn,
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
    openTransportVehicleDetail,
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
    openWorkerDetail, lbStartInlineRateEdit, lbSaveWorkerRate, renderLbWorkerList,
    // Security Boats
    sbSetView, sbFilterBoats, sbOpenBoatView,
    sbOnBoatDragStart, sbOnBoatDragEnd, sbOnDragOver, sbOnDragLeave, sbOnDrop,
    sbOnDropZoneClick, sbShowAddFunctionModal, sbUndoBoat,
    sbEditAssignmentById, sbRemoveAssignmentById, sbConfirmDeleteFunc,
    sbOnDateCellClick, sbOnFuncCellClick, sbAssignFromDate,
    sbToggleDayLock, sbToggleExport, sbExportCSV, sbExportJSON,
    showAddSecurityBoatModal, closeAddSecurityBoatModal, saveSecurityBoat,
    deleteSecurityBoatFromModal, openSecurityBoatDetail, deleteSecurityBoat,
    // Locations
    locSetView, locSetSubTab, locCellClick, locToggleLock, locAutoFill, locExportCSV,
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
    // Guards — Base Camp
    gcSetView, gcFilterWorkers, gcOpenWorkerView,
    gcOnWorkerDragStart, gcOnWorkerDragEnd, gcOnDragOver, gcOnDragLeave, gcOnDrop,
    gcOnDropZoneClick, gcShowAddFunctionModal, gcUndo,
    gcEditAssignmentById, gcRemoveAssignmentById, gcConfirmDeleteFunc,
    gcOnDateCellClick, gcOnFuncCellClick, gcAssignFromDate,
    gcToggleDayLock, gcToggleExport, gcExportCSV,
    gcShowAddWorkerModal, gcCloseAddWorkerModal, gcCreateWorker,
    gcOpenWorkerDetail,
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
    init,
  };
})();

document.addEventListener('DOMContentLoaded', App.init);
