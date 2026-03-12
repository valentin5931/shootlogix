/* TRANSPORT — ES6 Module */
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
          <button class="boat-edit-btn" title="Duplicate" style="font-size:.65rem"
            onclick="event.stopPropagation();App.duplicateEntity('transport',${v.id})">&#x2398;</button>
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
        <button onclick="App.openEditFunctionModal(${func.id})"
          style="color:var(--text-4);background:none;border:none;cursor:pointer;font-size:.8rem;padding:.2rem"
          title="Edit function">✎</button>
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
  function tbExportCSV()  {
    $('tb-export-menu').classList.add('hidden');
    SL.openExportDateModal('transport', 'Transport', [
      { key: 'csv', label: 'CSV' }, { key: 'json', label: 'JSON' },
    ], (from, to, fmt) => {
      const base = fmt === 'json'
        ? `/api/productions/${state.prodId}/export/transport/json`
        : `/api/productions/${state.prodId}/export/transport/csv`;
      SL._exportWithDates(base, from, to);
    });
  }
  function tbExportJSON() { tbExportCSV(); }

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
    $('nf-edit-id').value = '';
    $('nf-modal-title').textContent = 'New function';
    $('nf-confirm-btn').textContent = 'Create function';
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



// Register module functions on App
Object.assign(window.App, {
  _loadAndRenderTransport,
  _tbAssignmentsForFunc,
  _tbDoCellCycle,
  _tbFillDay,
  _tbFilteredVehicles,
  closeAddTransportVehicleModal,
  confirmDeleteVehicle,
  createTransportVehicle,
  openTransportVehicleDetail,
  renderTbBudget,
  renderTbRoleCard,
  renderTbRoleCards,
  renderTbSchedule,
  renderTbVehicleList,
  renderTransport,
  rowFigeAmount,
  showAddTransportVehicleModal,
  tbAssignFromDate,
  tbConfirmDeleteFunc,
  tbEditAssignmentById,
  tbExportCSV,
  tbExportJSON,
  tbFilterVehicles,
  tbOnDateCellClick,
  tbOnDragLeave,
  tbOnDragOver,
  tbOnDrop,
  tbOnDropZoneClick,
  tbOnFuncCellClick,
  tbOnVehicleDragEnd,
  tbOnVehicleDragStart,
  tbOpenVehicleView,
  tbRemoveAssignmentById,
  tbSetBoatView,
  tbShowAddFunctionModal,
  tbToggleDayLock,
  tbToggleExport,
  tbUndoVehicle,
  vehicleTypeBadge,
});
