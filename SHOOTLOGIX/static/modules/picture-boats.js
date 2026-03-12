/* PICTURE BOATS TAB — ES6 Module */
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



// Register module functions on App
Object.assign(window.App, {
  _openPictureBoatView,
  _pbAssignmentsForFunc,
  _pbDoCellCycle,
  _pbFillDay,
  _pbFilteredBoats,
  confirmDeletePictureBoat,
  pbAssignFromDate,
  pbExportCSV,
  pbExportJSON,
  pbFilterBoats,
  pbOnBoatDragEnd,
  pbOnBoatDragStart,
  pbOnDateCellClick,
  pbOnDragLeave,
  pbOnDragOver,
  pbOnDrop,
  pbOnDropZoneClick,
  pbOnFuncCellClick,
  pbOpenBoatView,
  pbSetBoatView,
  pbToggleExport,
  pbUndoBoat,
  renderPbBoatBudget,
  renderPbBoatList,
  renderPbRoleCard,
  renderPbRoleCards,
  renderPbSchedule,
  renderPictureBoats,
  rowFigeAmount,
});
