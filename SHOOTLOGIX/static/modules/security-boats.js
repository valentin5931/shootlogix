/* SECURITY BOATS MODULE — ES6 Module */
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
          <button class="boat-edit-btn" title="Duplicate" style="font-size:.65rem"
            onclick="event.stopPropagation();App.duplicateEntity('security_boats',${b.id})">&#x2398;</button>
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
        <button onclick="App.openEditFunctionModal(${func.id})"
          style="color:var(--text-4);background:none;border:none;cursor:pointer;font-size:.8rem;padding:.2rem"
          title="Edit function">✎</button>
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
    // AXE 4.4: load entity history
    if (App._loadDetailHistory) App._loadDetailHistory('security_boats', sbId);
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
  function sbExportCSV()  {
    $('sb-export-menu')?.classList.add('hidden');
    SL.openExportDateModal('security_boats', 'Security Boats', [
      { key: 'csv', label: 'CSV' }, { key: 'json', label: 'JSON' },
    ], (from, to, fmt) => {
      const base = fmt === 'json'
        ? `/api/productions/${state.prodId}/export/security-boats/json`
        : `/api/productions/${state.prodId}/export/security-boats/csv`;
      SL._exportWithDates(base, from, to);
    });
  }
  function sbExportJSON() { sbExportCSV(); }

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
    $('nf-edit-id').value = '';
    $('nf-modal-title').textContent = 'New function';
    $('nf-confirm-btn').textContent = 'Create function';
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





// Register module functions on App
Object.assign(window.App, {
  _loadAndRenderSecurityBoats,
  _openSecurityBoatView,
  _renderSbRoleCard,
  _sbAssignmentsForFunc,
  _sbDoCellCycle,
  _sbFillDay,
  _sbFilteredBoats,
  _sbGroupColor,
  _sbGroupOrder,
  closeAddSecurityBoatModal,
  confirmDeleteSecurityBoat,
  deleteSecurityBoat,
  deleteSecurityBoatFromModal,
  openSecurityBoatDetail,
  renderSbBoatList,
  renderSbBudget,
  renderSbRoleCards,
  renderSbSchedule,
  renderSecurityBoats,
  rowFigeAmount,
  saveSecurityBoat,
  sbAssignFromDate,
  sbConfirmDeleteFunc,
  sbEditAssignmentById,
  sbExportCSV,
  sbExportJSON,
  sbFilterBoats,
  sbOnBoatDragEnd,
  sbOnBoatDragStart,
  sbOnDateCellClick,
  sbOnDragLeave,
  sbOnDragOver,
  sbOnDrop,
  sbOnDropZoneClick,
  sbOnFuncCellClick,
  sbOpenBoatView,
  sbRemoveAssignmentById,
  sbSetView,
  sbShowAddFunctionModal,
  sbToggleDayLock,
  sbToggleExport,
  sbUndoBoat,
  showAddSecurityBoatModal,
});
