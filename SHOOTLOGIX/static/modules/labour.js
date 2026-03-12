/* LABOUR MODULE — ES6 Module */
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
          <button class="boat-edit-btn" title="Duplicate" style="font-size:.65rem"
            onclick="event.stopPropagation();App.duplicateEntity('helpers',${w.id})">&#x2398;</button>
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
        <button onclick="App.openEditFunctionModal(${func.id})"
          style="color:var(--text-4);background:none;border:none;cursor:pointer;font-size:.8rem;padding:.2rem"
          title="Edit function">✎</button>
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
    $('nf-edit-id').value = '';
    $('nf-modal-title').textContent = 'New function';
    $('nf-confirm-btn').textContent = 'Create function';
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
  function lbExportCSV()  {
    $('lb-export-menu').classList.add('hidden');
    SL.openExportDateModal('labour', 'Labour', [
      { key: 'csv', label: 'CSV' },
    ], (from, to, fmt) => {
      SL._exportWithDates(`/api/productions/${state.prodId}/export/labour/csv`, from, to);
    });
  }

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




// Register module functions on App
Object.assign(window.App, {
  _lbAssignmentsForFunc,
  _lbDoCellCycle,
  _lbFillDay,
  _lbFilteredWorkers,
  _loadAndRenderLabour,
  cards,
  closeAddWorkerModal,
  confirmDeleteWorker,
  createWorker,
  lbAssignFromDate,
  lbConfirmDeleteFunc,
  lbEditAssignmentById,
  lbExportCSV,
  lbFilterWorkers,
  lbOnDateCellClick,
  lbOnDragLeave,
  lbOnDragOver,
  lbOnDrop,
  lbOnDropZoneClick,
  lbOnFuncCellClick,
  lbOnWorkerDragEnd,
  lbOnWorkerDragStart,
  lbOpenWorkerView,
  lbRemoveAssignmentById,
  lbSaveWorkerRate,
  lbSetView,
  lbShowAddFunctionModal,
  lbStartInlineRateEdit,
  lbToggleDayLock,
  lbToggleExport,
  lbUndo,
  modal,
  openWorkerDetail,
  renderLabour,
  renderLbBudget,
  renderLbRoleCard,
  renderLbRoleCards,
  renderLbSchedule,
  renderLbWorkerList,
  rowFigeAmount,
  showAddWorkerModal,
});
