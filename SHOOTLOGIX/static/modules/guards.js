/* GUARDS MODULE — ES6 Module */
/* Auto-split from app-monolith.js — AXE 8.2 */

const SL = window._SL;
const { state, authState, $, esc, api, toast, fmtMoney, fmtDate, fmtDateLong,
        _localDk, workingDays, activeWorkingDays, computeWd, effectiveStatus,
        waveClass, waveLabel, _morphHTML, _debouncedRender, _flashSaved,
        _flashSavedCard, _queueCellFlash, _skeletonCards, _skeletonTable,
        _virtualScheduleSetup, _getVisibleColRange, _vcolWidth,
        _saveScheduleScroll, _restoreScheduleScroll, _scheduleCellBg,
        _canEdit, _canEditPrices, _canEditFuelPrices, _isAdmin, _canViewTab,
        _applyPriceRestrictions, authFetch, authDownload,
        STATUS_LABEL, SCHEDULE_START, SCHEDULE_END, EV_DEFAULTS,
        DEFAULT_BOAT_GROUPS, DEFAULT_PB_GROUPS, DEFAULT_TB_GROUPS,
        _groupColor, _groupOrder, _invalidateCache,
        loadShootingDays, loadBoatsData, loadPictureBoatsData,
        showConfirm, cancelConfirm, closeSchedulePopover,
        renderSchedulePopover, _updateBreadcrumb,
        _multiSelect, _onScheduleMouseDown, _onScheduleMouseOver,
        multiSelectFill, multiSelectClear, multiSelectCancel } = SL;

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
          <button class="boat-edit-btn" title="Duplicate" style="font-size:.65rem"
            onclick="event.stopPropagation();App.duplicateEntity('guard_camp',${w.id})">&#x2398;</button>
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
        <button onclick="App.openEditFunctionModal(${func.id})"
          style="color:var(--text-4);background:none;border:none;cursor:pointer;font-size:.8rem;padding:.2rem"
          title="Edit function">✎</button>
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

  // ── Add function modal (Guard Camp) ──────────────────────────
  function gcShowAddFunctionModal() {
    ['nf-name','nf-specs','nf-start','nf-end'].forEach(id => { const el = $(id); if(el) el.value = ''; });
    $('nf-edit-id').value = '';
    $('nf-modal-title').textContent = 'New function';
    $('nf-confirm-btn').textContent = 'Create function';
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




// Register module functions on App
Object.assign(window.App, {
  _gcAssignmentsForFunc,
  _gcDoCellCycle,
  _gcFillDay,
  _gcFilteredWorkers,
  _loadAndRenderGuardCamp,
  _renderGuardsCombinedBudget,
  _updateGcBadge,
  bulkCreateHelpers,
  cards,
  closeAddGuardModal,
  closeBulkHelperModal,
  confirmDeleteGuardCampWorker,
  deleteGuardPost,
  downloadHelperCsvTemplate,
  editGuardPost,
  gcAssignFromDate,
  gcCloseAddWorkerModal,
  gcConfirmDeleteFunc,
  gcCreateWorker,
  gcEditAssignmentById,
  gcExportCSV,
  gcFilterWorkers,
  gcOnDateCellClick,
  gcOnDragLeave,
  gcOnDragOver,
  gcOnDrop,
  gcOnDropZoneClick,
  gcOnFuncCellClick,
  gcOnWorkerDragEnd,
  gcOnWorkerDragStart,
  gcOpenWorkerDetail,
  gcOpenWorkerView,
  gcRemoveAssignmentById,
  gcSetView,
  gcShowAddFunctionModal,
  gcShowAddWorkerModal,
  gcToggleDayLock,
  gcToggleExport,
  gcUndo,
  gdSetSubTab,
  gdSetView,
  gdlCellClick,
  gdlExportCSV,
  gdlRefresh,
  gdlToggleLock,
  importHelpersCsv,
  modal,
  renderGcBudget,
  renderGcRoleCard,
  renderGcRoleCards,
  renderGcSchedule,
  renderGcWorkerList,
  renderGuardCamp,
  renderGuardLocation,
  renderGuards,
  saveGuardPost,
  showAddGuardModal,
  showBulkHelperModal,
});
