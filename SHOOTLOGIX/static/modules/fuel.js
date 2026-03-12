/* FUEL — ES6 Module */
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
    SL.openExportDateModal('fuel', 'Fuel Budget', [
      { key: 'csv', label: 'CSV' },
    ], (from, to, fmt) => {
      SL._exportWithDates(`/api/productions/${state.prodId}/export/fuel-budget/csv`, from, to);
    });
  }

  function fuelToggleExport() {
    $('fuel-exp-menu').classList.toggle('hidden');
  }

  function fuelExportCSV() {
    $('fuel-exp-menu').classList.add('hidden');
    SL.openExportDateModal('fuel', 'Fuel', [
      { key: 'csv', label: 'CSV' }, { key: 'json', label: 'JSON' },
    ], (from, to, fmt) => {
      const base = fmt === 'json'
        ? `/api/productions/${state.prodId}/export/fuel/json`
        : `/api/productions/${state.prodId}/export/fuel/csv`;
      SL._exportWithDates(base, from, to);
    });
  }

  function fuelExportJSON() {
    $('fuel-exp-menu').classList.add('hidden');
    fuelExportCSV();
  }



// Register module functions on App
Object.assign(window.App, {
  _fuelAsgns,
  _fuelAssignments,
  _fuelEntMap,
  _fuelEntriesMap,
  _loadAndRenderFuel,
  _loadFuelGlobals,
  _renderFuelPriceBar,
  _saveFuelEntry,
  closeFuelMachineryModal,
  confirmFuelMachineryModal,
  deleteFuelMachinery,
  fuelAutoFill,
  fuelBudgetExportCSV,
  fuelCellInput,
  fuelExportCSV,
  fuelExportJSON,
  fuelGlobalPriceChange,
  fuelMachineryCellInput,
  fuelMachineryRowTypeChange,
  fuelPriceChange,
  fuelRowTypeChange,
  fuelSetTab,
  fuelToggleDayLock,
  fuelToggleExport,
  renderFuelBudget,
  renderFuelGrid,
  renderFuelMachineryGrid,
  renderFuelTab,
  showFuelMachineryModal,
});
