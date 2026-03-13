/* FLEET TAB — Unified view of Boats, Picture Boats & Security Boats */
/* P3.1a — Cards view */
/* P3.1b — Schedule view */
/* P3.1c — Budget view */

const SL = window._SL;
const { state, $, esc, api, toast, fmtMoney, waveClass, waveLabel,
        _loadModule, _morphHTML, _localDk, effectiveStatus,
        _getVisibleColRange, _scheduleCellBg, _debouncedRender,
        _groupColor, _groupOrder, _showLoading, _hideLoading,
        SCHEDULE_START, SCHEDULE_END } = SL;

// ═══════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════

let _fleetFilter = 'all';   // all | boats | picture | security
let _fleetSearch = '';
let _fleetData   = [];       // merged array of vessels
let _fleetView   = 'cards';  // cards | schedule | budget

// Schedule data (loaded separately)
let _fleetFunctions   = { boats: [], picture: [], security: [] };
let _fleetAssignments = { boats: [], picture: [], security: [] };

// ═══════════════════════════════════════════════════════════
//  LOAD & MERGE
// ═══════════════════════════════════════════════════════════

async function _loadFleetData() {
  const prodId = state.prodId;
  if (!prodId) return;

  // Load all 3 modules so their data-fetching utils are ready
  await Promise.all([
    _loadModule('boats'),
    _loadModule('picture-boats'),
    _loadModule('security-boats'),
  ]);

  // Fetch all 3 endpoints in parallel
  const [boats, pictureBoats, securityBoats] = await Promise.all([
    api('GET', `/api/productions/${prodId}/boats`).catch(() => []),
    api('GET', `/api/productions/${prodId}/picture-boats`).catch(() => []),
    api('GET', `/api/productions/${prodId}/security-boats`).catch(() => []),
  ]);

  _fleetData = [
    ...boats.map(b => ({ ...b, _type: 'boat' })),
    ...pictureBoats.map(b => ({ ...b, _type: 'picture' })),
    ...securityBoats.map(b => ({ ...b, _type: 'security' })),
  ];
}

async function _loadFleetScheduleData() {
  const prodId = state.prodId;
  if (!prodId) return;

  const [boatFuncs, pbFuncs, sbFuncs, boatAsgns, pbAsgns, sbAsgns] = await Promise.all([
    api('GET', `/api/productions/${prodId}/boat-functions?context=boats`).catch(() => []),
    api('GET', `/api/productions/${prodId}/boat-functions?context=picture`).catch(() => []),
    api('GET', `/api/productions/${prodId}/boat-functions?context=security`).catch(() => []),
    api('GET', `/api/productions/${prodId}/assignments`).catch(() => []),
    api('GET', `/api/productions/${prodId}/picture-boat-assignments`).catch(() => []),
    api('GET', `/api/productions/${prodId}/security-boat-assignments`).catch(() => []),
  ]);

  _fleetFunctions   = { boats: boatFuncs, picture: pbFuncs, security: sbFuncs };
  _fleetAssignments = { boats: boatAsgns, picture: pbAsgns, security: sbAsgns };
}

// ═══════════════════════════════════════════════════════════
//  FILTER & SEARCH
// ═══════════════════════════════════════════════════════════

function _filteredFleet() {
  let list = _fleetData;
  if (_fleetFilter !== 'all') list = list.filter(b => b._type === _fleetFilter);
  if (_fleetSearch) {
    const q = _fleetSearch.toLowerCase();
    list = list.filter(b => (b.name || '').toLowerCase().includes(q));
  }
  list.sort((a, b) => (a.boat_nr || 999) - (b.boat_nr || 999));
  return list;
}

// ═══════════════════════════════════════════════════════════
//  SUB-VIEW NAV
// ═══════════════════════════════════════════════════════════

function _renderSubNav() {
  const nav = $('fleet-sub-nav');
  if (!nav) return;
  const views = [
    { key: 'cards',    label: 'Cards' },
    { key: 'schedule', label: 'Schedule' },
    { key: 'budget',   label: 'Budget' },
    { key: 'incidents', label: 'Incidents' },
  ];
  nav.innerHTML = `<div class="fleet-sub-nav">${views.map(v =>
    `<button class="fleet-sub-btn ${_fleetView === v.key ? 'active' : ''}"
      onclick="App.fleetSetView('${v.key}')">${v.label}</button>`
  ).join('')}</div>`;
}

function fleetSetView(v) {
  _fleetView = v;
  _renderSubNav();
  const cardsEl = $('fleet-cards');
  const schedEl = $('fleet-schedule-container');
  const budgEl  = $('fleet-budget-container');
  const incEl   = $('fleet-incidents-container');
  if (cardsEl) cardsEl.style.display = v === 'cards' ? '' : 'none';
  if (schedEl) schedEl.style.display = v === 'schedule' ? '' : 'none';
  if (budgEl)  budgEl.style.display  = v === 'budget' ? '' : 'none';
  if (incEl)   incEl.style.display   = v === 'incidents' ? '' : 'none';
  if (v === 'cards') renderFleet();
  if (v === 'schedule') _loadAndRenderFleetSchedule();
  if (v === 'budget') _loadAndRenderFleetBudget();
  if (v === 'incidents') _loadAndRenderFleetIncidents();
  const viewLabel = v.charAt(0).toUpperCase() + v.slice(1);
  SL._updateBreadcrumb(viewLabel);
}

// ═══════════════════════════════════════════════════════════
//  CARDS RENDER
// ═══════════════════════════════════════════════════════════

const TYPE_BADGE = {
  boat:     { label: 'Boat',     bg: '#3B82F6', color: '#fff' },
  picture:  { label: 'Picture',  bg: '#8B5CF6', color: '#fff' },
  security: { label: 'Security', bg: '#EF4444', color: '#fff' },
};

function _typeBadge(type) {
  const t = TYPE_BADGE[type] || TYPE_BADGE.boat;
  return `<span style="display:inline-block;font-size:.55rem;font-weight:700;letter-spacing:.04em;padding:.1rem .35rem;border-radius:4px;background:${t.bg};color:${t.color};text-transform:uppercase">${t.label}</span>`;
}

function _renderCard(b) {
  const wClass = waveClass(b.wave_rating);
  const thumb = b.image_path
    ? `<img class="boat-thumb" src="/${b.image_path}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
       <div class="boat-thumb-placeholder" style="display:none">#${esc(b.boat_nr || '?')}</div>`
    : `<div class="boat-thumb-placeholder">#${esc(b.boat_nr || '?')}</div>`;
  const nr = b.boat_nr ? `<span style="font-size:.6rem;color:var(--text-4);font-family:monospace">#${esc(b.boat_nr)}</span> ` : '';
  const rate = b.daily_rate_estimate || b.daily_rate || 0;
  const rateStr = rate > 0 ? `<div style="font-size:.65rem;color:var(--green);margin-top:.1rem">$${Math.round(rate).toLocaleString('en-US')}/d</div>` : '';

  // Click handler: navigate to the source tab
  const clickTab = b._type === 'picture' ? 'picture-boats' : b._type === 'security' ? 'security-boats' : 'boats';
  const viewFn = b._type === 'picture' ? `App.pbOpenBoatView(${b.id})`
               : b._type === 'security' ? `App.sbOpenBoatView(${b.id})`
               : `App.openBoatView(${b.id})`;

  return `<div class="boat-card fleet-card" onclick="App.setTab('${clickTab}');setTimeout(()=>${viewFn},200)" style="cursor:pointer">
    <div class="boat-thumb-wrap">${thumb}</div>
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:baseline;gap:.3rem;margin-bottom:.15rem;flex-wrap:wrap">
        ${nr}<span style="font-weight:700;font-size:.82rem;color:var(--text-0);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(b.name)}</span>
        ${_typeBadge(b._type)}
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:.2rem;align-items:center;margin-bottom:.1rem">
        ${b.wave_rating ? `<span class="wave-badge ${wClass}">${waveLabel(b.wave_rating)}</span>` : ''}
        ${b.capacity ? `<span style="font-size:.65rem;color:var(--text-3)">${esc(String(b.capacity))} pax</span>` : ''}
        ${b.night_ok ? '<span class="night-badge">NIGHT</span>' : ''}
      </div>
      ${b.captain ? `<div style="font-size:.65rem;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">&#x2693; ${esc(b.captain)}</div>` : ''}
      ${b.vendor ? `<div style="font-size:.65rem;color:var(--orange);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">&#x1F3E2; ${esc(b.vendor)}</div>` : ''}
      ${rateStr}
    </div>
    <div style="display:flex;flex-direction:column;gap:.15rem;flex-shrink:0;align-self:flex-start">
      <button class="fleet-fuel-btn" title="Fuel entries for ${esc(b.name)}"
        onclick="event.stopPropagation();App.fleetGoToFuel('${esc(b.name).replace(/'/g,"\\'")}')"
        style="padding:.2rem .4rem;background:var(--bg-surface);border:1px solid var(--border-lt);border-radius:5px;font-size:.65rem;cursor:pointer;color:var(--orange);white-space:nowrap;transition:all .15s">&#x26FD; Fuel</button>
    </div>
  </div>`;
}

function renderFleet() {
  const container = $('fleet-cards');
  if (!container) return;
  const boats = _filteredFleet();
  const counts = {
    all: _fleetData.length,
    boats: _fleetData.filter(b => b._type === 'boat').length,
    picture: _fleetData.filter(b => b._type === 'picture').length,
    security: _fleetData.filter(b => b._type === 'security').length,
  };

  const filterBtns = ['all', 'boats', 'picture', 'security'].map(f => {
    const label = f === 'all' ? t('common.all') : f === 'boats' ? t('nav.boats') : f === 'picture' ? 'Picture' : 'Security';
    const active = _fleetFilter === f ? 'active' : '';
    const badgeColor = f === 'boats' ? '#3B82F6' : f === 'picture' ? '#8B5CF6' : f === 'security' ? '#EF4444' : 'var(--text-3)';
    return `<button class="fleet-filter-btn ${active}" onclick="App.fleetSetFilter('${f}')" style="${active ? `border-color:${badgeColor}` : ''}">
      ${label} <span style="font-size:.65rem;opacity:.7">(${counts[f]})</span>
    </button>`;
  }).join('');

  const toolbar = `<div class="fleet-toolbar">
    <div class="fleet-filters">${filterBtns}</div>
    <input type="text" class="fleet-search" placeholder="${t('boats.search_by_name')}"
      value="${esc(_fleetSearch)}" oninput="App.fleetSearch(this.value)">
  </div>`;

  if (!boats.length) {
    container.innerHTML = toolbar + SL.emptyState('boat',
      'No vessels registered yet',
      'Add boats, picture boats or security boats to see them here.',
      'Add your first vessel', "App.showAddBoatModal()");
    return;
  }

  container.innerHTML = toolbar + `<div class="fleet-grid">${boats.map(_renderCard).join('')}</div>`;
}

// ═══════════════════════════════════════════════════════════
//  SCHEDULE RENDER
// ═══════════════════════════════════════════════════════════

const FLEET_TYPE_BG = {
  boats:    'rgba(59,130,246,0.08)',  // blue tint
  picture:  'rgba(139,92,246,0.08)',  // purple tint
  security: 'rgba(239,68,68,0.08)',   // red tint
};

const FLEET_TYPE_LABEL = {
  boats:    { text: 'BOATS',    color: '#3B82F6' },
  picture:  { text: 'PICTURE',  color: '#8B5CF6' },
  security: { text: 'SECURITY', color: '#EF4444' },
};

function _fleetAssignmentsForFunc(ctx, funcId) {
  return _fleetAssignments[ctx].filter(a => a.boat_function_id === funcId);
}

async function _loadAndRenderFleetSchedule() {
  const container = $('fleet-schedule-container');
  if (!container) return;
  _showLoading(container, 'table', { rows: 8, cols: 12 });
  try {
    await _loadFleetScheduleData();
    renderFleetSchedule();
    _hideLoading(container);
  } catch (e) {
    toast('Error loading fleet schedule: ' + e.message, 'error');
  }
}

function renderFleetSchedule() {
  const container = $('fleet-schedule-container');
  if (!container) return;

  // Build day array
  const days = [];
  const d = new Date(SCHEDULE_START);
  while (d <= SCHEDULE_END) { days.push(new Date(d)); d.setDate(d.getDate() + 1); }

  // Column virtualization
  const wrapEl = container.querySelector('.schedule-wrap');
  const { start: vColStart, end: vColEnd } = _getVisibleColRange(wrapEl, days.length);

  // PDT overlay
  const pdtByDate = {};
  (state.shootingDays || []).forEach(day => { pdtByDate[day.date] = day; });

  // Month header
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

  // Day header
  let dayRow = '<th class="role-name-cell"></th>';
  dayRow += days.map(day => {
    const dk = _localDk(day);
    const isWE = day.getDay() === 0 || day.getDay() === 6;
    return `<th class="schedule-day-th ${isWE ? 'weekend-col' : ''} ${pdtByDate[dk] ? 'has-pdt' : ''}"
      data-date="${dk}">${day.getDate()}</th>`;
  }).join('');

  // Daily count tracker (all types combined)
  const dailyCnt = {};
  days.forEach(d => { dailyCnt[_localDk(d)] = 0; });

  // Build rows grouped by type
  const sections = ['boats', 'picture', 'security'];
  let rowsHTML = '';

  for (const ctx of sections) {
    const funcs = _fleetFunctions[ctx] || [];
    if (!funcs.length) continue;

    const typeLabel = FLEET_TYPE_LABEL[ctx];
    const typeBg = FLEET_TYPE_BG[ctx];
    const groupCtx = ctx === 'boats' ? 'boats' : ctx === 'picture' ? 'picture' : 'security';

    // Sort functions by group order then sort_order
    const gOrder = _groupOrder(groupCtx);
    const defaultGroup = ctx === 'security' ? 'SAFETY' : ctx === 'picture' ? 'YELLOW' : 'YELLOW';
    const sortedFuncs = [...funcs].sort((a, b) => {
      const ga = gOrder.indexOf(a.function_group || defaultGroup);
      const gb = gOrder.indexOf(b.function_group || defaultGroup);
      return (ga === -1 ? 999 : ga) - (gb === -1 ? 999 : gb) || (a.sort_order || 0) - (b.sort_order || 0);
    });

    // Section header row
    rowsHTML += `<tr class="fleet-section-row" style="background:${typeBg}">
      <td class="role-name-cell" style="font-weight:700;font-size:.7rem;color:${typeLabel.color};letter-spacing:.04em;padding:.3rem .4rem">
        ${typeLabel.text} <span style="opacity:.6;font-weight:400">(${sortedFuncs.length})</span>
      </td>
      ${days.map(() => '<td></td>').join('')}
    </tr>`;

    // Function rows
    for (const func of sortedFuncs) {
      const funcAsgns = _fleetAssignmentsForFunc(ctx, func.id);
      const color = _groupColor(groupCtx, func.function_group);

      // Count active days
      funcAsgns.forEach(asgn => {
        days.forEach(d => {
          const dk = _localDk(d);
          if (effectiveStatus(asgn, dk)) dailyCnt[dk] = (dailyCnt[dk] || 0) + 1;
        });
      });

      // Determine boat label
      const boatIdKey = ctx === 'boats' ? 'boat_id' : ctx === 'picture' ? 'picture_boat_id' : 'security_boat_id';
      const boatAsgn = funcAsgns.find(a => a[boatIdKey] || a.boat_name_override || a.boat_name);
      const boatLabel = boatAsgn ? (boatAsgn.boat_name_override || boatAsgn.boat_name || null) : null;
      const multiSuffix = funcAsgns.length > 1 ? ` +${funcAsgns.length - 1}` : '';

      // Navigate to source module on click
      const clickTab = ctx === 'picture' ? 'picture-boats' : ctx === 'security' ? 'security-boats' : 'boats';

      let cells = `<td class="role-name-cell sch-func-cell" style="border-top:2px solid ${color};cursor:pointer"
        title="${esc(func.name)}" onclick="App.setTab('${clickTab}')">
        <div class="rn-group" style="color:${color}">${esc(func.function_group || defaultGroup)}</div>
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
          cells += `<td class="schedule-cell ${weClass}"></td>`;
        } else {
          const bg = _scheduleCellBg(filledStatus, color, isWE);
          cells += `<td class="schedule-cell ${weClass}" style="background:${bg}"></td>`;
        }
      });
      rowsHTML += `<tr>${cells}</tr>`;
    }
  }

  // Count footer row
  let countCells = '<td class="role-name-cell" style="color:var(--text-3);font-size:.68rem">Active total</td>';
  countCells += days.map(day => {
    const dk = _localDk(day);
    const c = dailyCnt[dk] || 0;
    const isWE = day.getDay() === 0 || day.getDay() === 6;
    return `<td class="${isWE ? 'weekend-col' : ''}" style="text-align:center;font-size:.68rem;color:${c ? 'var(--green)' : 'var(--border)'};font-weight:700">${c || ''}</td>`;
  }).join('');

  const schedHTML = `
    <div class="schedule-wrap"><table class="schedule-table">
      <thead><tr>${monthRow}</tr><tr>${dayRow}</tr></thead>
      <tbody>${rowsHTML}<tr class="schedule-count-row">${countCells}</tr></tbody>
    </table></div>`;

  _morphHTML(container, schedHTML);

  // Wire scroll-based re-render for column virtualization
  const _sw = container.querySelector('.schedule-wrap');
  if (_sw) {
    _sw.addEventListener('scroll', () => {
      _debouncedRender('fleet-schedule-vscroll', renderFleetSchedule, 100);
    });
  }
}

// ═══════════════════════════════════════════════════════════
//  PUBLIC API
// ═══════════════════════════════════════════════════════════

async function loadAndRenderFleet() {
  _renderSubNav();
  const cardsEl = $('fleet-cards');
  const schedEl = $('fleet-schedule-container');
  const budgEl  = $('fleet-budget-container');
  const incEl   = $('fleet-incidents-container');
  if (cardsEl) cardsEl.style.display = _fleetView === 'cards' ? '' : 'none';
  if (schedEl) schedEl.style.display = _fleetView === 'schedule' ? '' : 'none';
  if (budgEl)  budgEl.style.display  = _fleetView === 'budget' ? '' : 'none';
  if (incEl)   incEl.style.display   = _fleetView === 'incidents' ? '' : 'none';

  if (_fleetView === 'cards') {
    _showLoading(cardsEl, 'cards', { count: 6 });
    try {
      await _loadFleetData();
      renderFleet();
      _hideLoading(cardsEl);
    } catch (e) {
      toast('Error loading fleet: ' + e.message, 'error');
    }
  } else if (_fleetView === 'schedule') {
    await _loadAndRenderFleetSchedule();
  } else if (_fleetView === 'budget') {
    await _loadAndRenderFleetBudget();
  } else if (_fleetView === 'incidents') {
    await _loadAndRenderFleetIncidents();
  }
}

function fleetSetFilter(f) {
  _fleetFilter = f;
  renderFleet();
}

function fleetSearch(q) {
  _fleetSearch = q;
  renderFleet();
}

function fleetGoToFuel(boatName) {
  // Navigate to Fuel tab — the fuel module will show entries for all boats
  App.setTab('fuel');
}

// ═══════════════════════════════════════════════════════════
//  BUDGET RENDER
// ═══════════════════════════════════════════════════════════

async function _loadAndRenderFleetBudget() {
  const container = $('fleet-budget-container');
  if (!container) return;
  _showLoading(container, 'stats', { count: 4 });
  try {
    const budget = await api('GET', `/api/productions/${state.prodId}/budget`);
    const byDept = budget.by_department || {};
    const fleetDepts = ['BOATS', 'PICTURE BOATS', 'SECURITY BOATS'];
    const fleetRows = (budget.rows || []).filter(r => fleetDepts.includes(r.department));

    // Group rows by department
    const groups = {};
    for (const dept of fleetDepts) {
      groups[dept] = { rows: [], total: 0 };
    }
    for (const r of fleetRows) {
      const g = groups[r.department];
      if (g) {
        g.rows.push(r);
        g.total += r.amount_estimate || 0;
      }
    }

    const grandTotal = fleetDepts.reduce((s, d) => s + groups[d].total, 0);

    const TYPE_META = {
      'BOATS':          { color: '#3B82F6', bg: 'rgba(59,130,246,.07)' },
      'PICTURE BOATS':  { color: '#8B5CF6', bg: 'rgba(139,92,246,.07)' },
      'SECURITY BOATS': { color: '#EF4444', bg: 'rgba(239,68,68,.07)' },
    };

    let html = `
      <div style="margin-bottom:.75rem">
        <div class="stat-grid">
          ${fleetDepts.map(dept => {
            const m = TYPE_META[dept];
            return `<div class="stat-card" style="border:1px solid ${m.color};background:${m.bg}">
              <div class="stat-val" style="font-size:1.3rem;color:${m.color}">${fmtMoney(groups[dept].total)}</div>
              <div class="stat-lbl">${esc(dept)}</div>
            </div>`;
          }).join('')}
          <div class="stat-card" style="border:1px solid var(--green);background:rgba(34,197,94,.07)">
            <div class="stat-val" style="font-size:1.3rem;color:var(--green)">${fmtMoney(grandTotal)}</div>
            <div class="stat-lbl">FLEET TOTAL</div>
          </div>
        </div>
      </div>`;

    // Table per type
    for (const dept of fleetDepts) {
      const g = groups[dept];
      if (!g.rows.length) continue;
      const m = TYPE_META[dept];
      html += `
        <div class="budget-dept-card" style="margin-bottom:.75rem">
          <div class="budget-dept-header" style="border-left:3px solid ${m.color}">
            <span style="font-weight:700;font-size:.82rem;color:var(--text-0)">${esc(dept)}</span>
            <span style="font-weight:700;color:${m.color}">${fmtMoney(g.total)}</span>
          </div>
          <table class="budget-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Boat</th>
                <th style="text-align:right">Daily Rate</th>
                <th style="text-align:right">Days</th>
                <th style="text-align:right">Total</th>
              </tr>
            </thead>
            <tbody>
              ${g.rows.map((r, i) => `<tr style="${i % 2 ? 'background:var(--bg-surface)' : ''}">
                <td style="color:var(--text-1)">${esc(r.name || '')}</td>
                <td style="color:var(--text-2)">${esc(r.boat || '')}</td>
                <td style="text-align:right;color:var(--text-3)">${fmtMoney(r.unit_price_estimate)}</td>
                <td style="text-align:right;color:var(--text-2)">${r.working_days ?? '-'}</td>
                <td style="text-align:right;font-weight:600;color:var(--green)">${fmtMoney(r.amount_estimate)}</td>
              </tr>`).join('')}
              <tr style="border-top:2px solid var(--border);font-weight:700">
                <td colspan="4" style="text-align:right;color:var(--text-3);padding-right:.5rem">Sub-total</td>
                <td style="text-align:right;color:${m.color}">${fmtMoney(g.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>`;
    }

    // Grand total row
    html += `
      <div style="display:flex;justify-content:flex-end;padding:.5rem .75rem;border-top:2px solid var(--green);margin-top:.25rem">
        <span style="font-weight:700;font-size:.9rem;color:var(--text-3);margin-right:.75rem">FLEET TOTAL</span>
        <span style="font-weight:700;font-size:.9rem;color:var(--green)">${fmtMoney(grandTotal)}</span>
      </div>`;

    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<div style="color:var(--red);padding:2rem">Error: ${esc(e.message)}</div>`;
  }
}

// ═══════════════════════════════════════════════════════════
//  INCIDENTS
// ═══════════════════════════════════════════════════════════

let _incidentsData = [];
let _incidentFilter = 'open'; // open | resolved | all

const INCIDENT_TYPE_LABEL = {
  engine_failure: { label: 'Engine Failure', color: '#EF4444', icon: '\u2699' },
  accident:       { label: 'Accident',       color: '#F59E0B', icon: '\u26A0' },
  delay:          { label: 'Delay',          color: '#3B82F6', icon: '\u23F1' },
  weather:        { label: 'Weather',        color: '#6366F1', icon: '\u26C8' },
  other:          { label: 'Other',          color: '#6B7280', icon: '\u2139' },
};

const ENTITY_TYPE_LABEL = {
  boat:     { label: 'Boat',     color: '#3B82F6' },
  picture:  { label: 'Picture',  color: '#8B5CF6' },
  security: { label: 'Security', color: '#EF4444' },
};

async function _loadAndRenderFleetIncidents() {
  const container = $('fleet-incidents-container');
  if (!container) return;
  _showLoading(container, 'table', { rows: 5, cols: 6 });
  try {
    // Load incidents + fleet data for entity names
    const prodId = state.prodId;
    if (!prodId) return;
    const [incidents] = await Promise.all([
      api('GET', `/api/productions/${prodId}/incidents`),
      _fleetData.length ? Promise.resolve() : _loadFleetData(),
    ]);
    _incidentsData = incidents;
    _renderIncidents();
    _hideLoading(container);
  } catch (e) {
    toast('Error loading incidents: ' + e.message, 'error');
  }
}

function _getEntityName(entityType, entityId) {
  const item = _fleetData.find(b => b._type === entityType && b.id === entityId);
  return item ? (item.name || `#${item.boat_nr || entityId}`) : `#${entityId}`;
}

function _renderIncidents() {
  const container = $('fleet-incidents-container');
  if (!container) return;

  let filtered = _incidentsData;
  if (_incidentFilter !== 'all') {
    filtered = filtered.filter(i => i.status === _incidentFilter);
  }

  const openCount = _incidentsData.filter(i => i.status === 'open').length;
  const resolvedCount = _incidentsData.filter(i => i.status === 'resolved').length;

  const filterBtns = ['open', 'resolved', 'all'].map(f => {
    const active = _incidentFilter === f ? 'active' : '';
    const count = f === 'open' ? openCount : f === 'resolved' ? resolvedCount : _incidentsData.length;
    return `<button class="fleet-filter-btn ${active}" onclick="App.fleetIncidentFilter('${f}')">
      ${f.charAt(0).toUpperCase() + f.slice(1)} <span style="font-size:.65rem;opacity:.7">(${count})</span>
    </button>`;
  }).join('');

  const toolbar = `<div class="fleet-toolbar" style="margin-bottom:.5rem">
    <div class="fleet-filters">${filterBtns}</div>
    <button class="btn btn-sm btn-primary" onclick="App.fleetShowAddIncident()">+ Report Incident</button>
  </div>`;

  if (!filtered.length) {
    container.innerHTML = toolbar + `<div style="text-align:center;padding:2rem;color:var(--text-3)">
      ${_incidentFilter === 'open' ? 'No open incidents' : 'No incidents found'}</div>`;
    return;
  }

  const rows = filtered.map(inc => {
    const it = INCIDENT_TYPE_LABEL[inc.incident_type] || INCIDENT_TYPE_LABEL.other;
    const et = ENTITY_TYPE_LABEL[inc.entity_type] || { label: inc.entity_type, color: '#6B7280' };
    const entityName = _getEntityName(inc.entity_type, inc.entity_id);
    const isOpen = inc.status === 'open';
    const statusBadge = isOpen
      ? '<span style="display:inline-block;font-size:.6rem;font-weight:700;padding:.1rem .3rem;border-radius:4px;background:#FEE2E2;color:#DC2626">OPEN</span>'
      : '<span style="display:inline-block;font-size:.6rem;font-weight:700;padding:.1rem .3rem;border-radius:4px;background:#D1FAE5;color:#059669">RESOLVED</span>';

    return `<tr style="border-bottom:1px solid var(--border-lt)">
      <td style="padding:.4rem .5rem;white-space:nowrap">${statusBadge}</td>
      <td style="padding:.4rem .5rem;white-space:nowrap;font-size:.75rem">${esc(inc.date)}</td>
      <td style="padding:.4rem .5rem">
        <span style="display:inline-block;font-size:.6rem;font-weight:600;padding:.1rem .3rem;border-radius:3px;background:${et.color}20;color:${et.color}">${et.label}</span>
        <span style="font-weight:600;font-size:.8rem;margin-left:.3rem">${esc(entityName)}</span>
      </td>
      <td style="padding:.4rem .5rem">
        <span style="font-size:.75rem">${it.icon} ${it.label}</span>
      </td>
      <td style="padding:.4rem .5rem;font-size:.75rem;color:var(--text-3);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
        title="${esc(inc.description || '')}">${esc(inc.description || '-')}</td>
      <td style="padding:.4rem .5rem;white-space:nowrap">
        ${isOpen ? `<button class="btn btn-sm btn-secondary" onclick="App.fleetResolveIncident(${inc.id})" style="font-size:.65rem">Resolve</button>` : ''}
        <button class="btn btn-sm" onclick="App.fleetDeleteIncident(${inc.id})" style="font-size:.65rem;color:var(--red);background:none;border:none;cursor:pointer">Delete</button>
      </td>
    </tr>`;
  }).join('');

  container.innerHTML = toolbar + `
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="border-bottom:2px solid var(--border);font-size:.7rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.04em">
            <th style="padding:.3rem .5rem;text-align:left">Status</th>
            <th style="padding:.3rem .5rem;text-align:left">Date</th>
            <th style="padding:.3rem .5rem;text-align:left">Vessel</th>
            <th style="padding:.3rem .5rem;text-align:left">Type</th>
            <th style="padding:.3rem .5rem;text-align:left">Description</th>
            <th style="padding:.3rem .5rem;text-align:left">Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function fleetIncidentFilter(f) {
  _incidentFilter = f;
  _renderIncidents();
}

function fleetShowAddIncident() {
  // Build vessel options from fleet data
  const options = _fleetData.map(b => {
    const label = `[${(b._type || '').charAt(0).toUpperCase() + (b._type || '').slice(1)}] ${b.name || '#' + b.boat_nr}`;
    return `<option value="${b._type}:${b.id}">${esc(label)}</option>`;
  }).join('');

  const today = new Date().toISOString().slice(0, 10);

  const html = `<div class="modal-overlay" id="incident-modal" onclick="if(event.target===this)this.remove()">
    <div class="modal-box" style="max-width:420px">
      <h3 style="margin:0 0 .75rem;font-size:1rem">Report Incident</h3>
      <label style="font-size:.75rem;font-weight:600;display:block;margin-bottom:.2rem">Vessel</label>
      <select id="inc-vessel" style="width:100%;padding:.4rem;border:1px solid var(--border);border-radius:6px;margin-bottom:.5rem;background:var(--bg-surface);color:var(--text-0)">
        <option value="">Select vessel...</option>
        ${options}
      </select>
      <label style="font-size:.75rem;font-weight:600;display:block;margin-bottom:.2rem">Type</label>
      <select id="inc-type" style="width:100%;padding:.4rem;border:1px solid var(--border);border-radius:6px;margin-bottom:.5rem;background:var(--bg-surface);color:var(--text-0)">
        <option value="engine_failure">Engine Failure</option>
        <option value="accident">Accident</option>
        <option value="delay">Delay</option>
        <option value="weather">Weather</option>
        <option value="other">Other</option>
      </select>
      <label style="font-size:.75rem;font-weight:600;display:block;margin-bottom:.2rem">Date</label>
      <input type="date" id="inc-date" value="${today}" style="width:100%;padding:.4rem;border:1px solid var(--border);border-radius:6px;margin-bottom:.5rem;background:var(--bg-surface);color:var(--text-0)">
      <label style="font-size:.75rem;font-weight:600;display:block;margin-bottom:.2rem">Description</label>
      <textarea id="inc-desc" rows="3" style="width:100%;padding:.4rem;border:1px solid var(--border);border-radius:6px;margin-bottom:.5rem;resize:vertical;background:var(--bg-surface);color:var(--text-0)" placeholder="What happened..."></textarea>
      <label style="font-size:.75rem;font-weight:600;display:block;margin-bottom:.2rem">Schedule Impact</label>
      <input type="text" id="inc-impact" style="width:100%;padding:.4rem;border:1px solid var(--border);border-radius:6px;margin-bottom:.75rem;background:var(--bg-surface);color:var(--text-0)" placeholder="e.g. Delayed departure by 2h">
      <div style="display:flex;gap:.5rem;justify-content:flex-end">
        <button class="btn btn-secondary" onclick="document.getElementById('incident-modal').remove()">Cancel</button>
        <button class="btn btn-primary" onclick="App.fleetSubmitIncident()">Report</button>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

async function fleetSubmitIncident() {
  const vesselVal = document.getElementById('inc-vessel')?.value;
  if (!vesselVal) { toast('Select a vessel', 'error'); return; }
  const [entityType, entityId] = vesselVal.split(':');
  const data = {
    entity_type: entityType,
    entity_id: parseInt(entityId),
    incident_type: document.getElementById('inc-type')?.value,
    date: document.getElementById('inc-date')?.value,
    description: document.getElementById('inc-desc')?.value || '',
    schedule_impact: document.getElementById('inc-impact')?.value || '',
  };
  try {
    await api('POST', `/api/productions/${state.prodId}/incidents`, data);
    document.getElementById('incident-modal')?.remove();
    toast('Incident reported', 'ok');
    await _loadAndRenderFleetIncidents();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function fleetResolveIncident(iid) {
  try {
    await api('PUT', `/api/productions/${state.prodId}/incidents/${iid}`, { status: 'resolved' });
    toast('Incident resolved', 'ok');
    await _loadAndRenderFleetIncidents();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function fleetDeleteIncident(iid) {
  if (!confirm('Delete this incident?')) return;
  try {
    await api('DELETE', `/api/productions/${state.prodId}/incidents/${iid}`);
    toast('Incident deleted', 'ok');
    await _loadAndRenderFleetIncidents();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════════════════

window.App = window.App || {};
Object.assign(window.App, {
  renderFleet,
  loadAndRenderFleet,
  fleetSetFilter,
  fleetGoToFuel,
  fleetSearch,
  fleetSetView,
  renderFleetSchedule,
  fleetIncidentFilter,
  fleetShowAddIncident,
  fleetSubmitIncident,
  fleetResolveIncident,
  fleetDeleteIncident,
});
