/* LOCATIONS MODULE — ES6 Module */
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

    SL.openExportDateModal('locations', 'Locations', [
      { key: 'csv', label: 'CSV' },
    ], (dateFrom, dateTo, fmt) => {
      _doLocExport(schedules, sites, dateFrom, dateTo);
    });
  }

  function _doLocExport(schedules, sites, dateFrom, dateTo) {
    // Filter schedules by date range
    let filtered = schedules;
    if (dateFrom || dateTo) {
      filtered = schedules.filter(s => {
        if (dateFrom && s.date < dateFrom) return false;
        if (dateTo && s.date > dateTo) return false;
        return true;
      });
    }
    if (!filtered.length) { toast('No data in selected date range', 'info'); return; }

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
    filtered.forEach(s => {
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

    const prodName = (state.production && state.production.name) || 'PRODUCTION';
    const now = new Date();
    const yy = String(now.getFullYear()).slice(2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    let fname = `${prodName}_LOCATIONS_${yy}${mm}${dd}`;
    if (dateFrom && dateTo) {
      fname += `_${dateFrom.replace(/-/g,'').slice(2)}-${dateTo.replace(/-/g,'').slice(2)}`;
    }
    fname += '.csv';

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



// Register module functions on App
Object.assign(window.App, {
  _locDates,
  _locModalAddSchedule,
  _locModalRemoveSchedule,
  _renderLocationScheduleInModal,
  closeAddLocationModal,
  deleteLocationSite,
  editLocationSite,
  locAutoFill,
  locCellClick,
  locExportCSV,
  locResyncPdt,
  locSetSubTab,
  locSetView,
  locToggleLock,
  renderLocBudget,
  renderLocSchedule,
  renderLocations,
  saveLocationSite,
  showAddLocationModal,
});
