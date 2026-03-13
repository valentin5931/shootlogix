/* BOATS VIEW — ES6 Module */
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
    _updateBreadcrumb(view.charAt(0).toUpperCase() + view.slice(1));
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

  async function renderBoatList() {
    const boats = _filteredBoats();
    const assignedIds = new Set(state.assignments.filter(a => a.boat_id).map(a => a.boat_id));
    const container = $('boat-list');
    const boatIds = boats.map(b => b.id);
    if (boatIds.length) await App.loadCommentCounts('boats', boatIds);

    if (!boats.length) {
      container.innerHTML = SL.emptyState('boat',
        'No boats registered yet',
        'Add your first boat to start building assignments and schedules.',
        'Add a boat', "App.showAddBoatModal()");
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
      const rateVal = b.daily_rate_estimate || 0;
      const rate = `<div style="font-size:.65rem;color:${rateVal > 0 ? 'var(--green)' : 'var(--text-4)'};margin-top:.1rem;cursor:pointer;display:inline-flex;align-items:center;gap:.2rem"
        onclick="event.stopPropagation();App.openBoatDetail(${b.id})"
        title="Click to edit rate">${rateVal > 0 ? '$' + Math.round(rateVal).toLocaleString('en-US') + '/d' : '+ set rate'}<span style="font-size:.55rem;opacity:.5">&#x270E;</span></div>`;

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
        <div style="display:flex;flex-direction:column;gap:.15rem;flex-shrink:0;align-self:flex-start">
          <button class="boat-edit-btn" title="Edit boat"
            onclick="event.stopPropagation();App.openBoatDetail(${b.id})">&#x270E;</button>
          <button class="boat-edit-btn" title="Duplicate boat" style="font-size:.65rem"
            onclick="event.stopPropagation();App.duplicateEntity('boats',${b.id})">&#x2398;</button>
          ${App.commentBadgeHTML('boats', b.id)}
          <button class="card-delete-btn" title="Delete boat"
            onclick="event.stopPropagation();App.confirmDeleteBoat(${b.id},'${esc(b.name).replace(/'/g,"\\'")}')">&#x1F5D1;</button>
        </div>
      </div>`;
    }).join('');
  }

  // ── Delete boat from card ──────────────────────────────────
  async function confirmDeleteBoat(boatId, boatName) {
    try {
      const impact = await api('GET', `/api/boats/${boatId}/impact`);
      const parts = [];
      if (impact.assignments > 0) parts.push(`${impact.assignments} assignment(s)`);
      if (impact.fuel_entries > 0) parts.push(`${impact.fuel_entries} fuel entry(ies)`);
      const cascade = parts.length > 0 ? `\nThis will also remove ${parts.join(' and ')}.` : '';
      showConfirm(`Delete boat "${boatName}"?${cascade}`, async () => {
        try {
          await api('DELETE', `/api/boats/${boatId}`);
          state.boats = state.boats.filter(b => b.id !== boatId);
          state.assignments = state.assignments.filter(a => a.boat_id !== boatId);
          closeBoatDetail();
          renderBoats();
          toast('Boat deleted');
        } catch (e) { toast('Error: ' + e.message, 'error'); }
      });
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  }

  // ── Duplicate entity (generic) ────────────────────────────
  async function duplicateEntity(type, entityId) {
    const endpoints = {
      boats:          `/api/boats/${entityId}/duplicate`,
      picture_boats:  `/api/picture-boats/${entityId}/duplicate`,
      security_boats: `/api/security-boats/${entityId}/duplicate`,
      transport:      `/api/transport-vehicles/${entityId}/duplicate`,
      helpers:        `/api/helpers/${entityId}/duplicate`,
      guard_camp:     `/api/guard-camp-workers/${entityId}/duplicate`,
    };
    const ep = endpoints[type];
    if (!ep) { toast('Unknown entity type', 'error'); return; }
    try {
      const copy = await api('POST', ep);
      // Add to relevant state array and re-render
      if (type === 'boats') { state.boats.push(copy); renderBoats(); }
      else if (type === 'picture_boats') { state.pictureBoats.push(copy); App.renderPictureBoats?.(); }
      else if (type === 'security_boats') { state.securityBoats.push(copy); App.renderSecurityBoats?.(); }
      else if (type === 'transport') { state.transportVehicles.push(copy); App.renderTransport?.(); }
      else if (type === 'helpers') { state.helpers.push(copy); App.renderLabour?.(); }
      else if (type === 'guard_camp') { state.gcWorkers.push(copy); App.renderGuardCamp?.(); }
      toast(`"${copy.name}" created`);
    } catch (e) { toast('Duplicate error: ' + e.message, 'error'); }
  }

  // ── Bulk card operations (AXE 10.3) ─────────────────────────
  let _bulkSelected = new Set();
  let _bulkEntityType = null;

  function toggleBulkSelect(entityType) {
    if (_bulkEntityType === entityType && _bulkSelected.size >= 0) {
      // Toggle off
      _bulkSelected.clear();
      _bulkEntityType = null;
      _hideBulkBar();
      // Re-render to remove checkboxes
      const tab = state.activeTab || 'boats';
      if (typeof App.renderTab === 'function') App.renderTab(tab);
      return;
    }
    _bulkEntityType = entityType;
    _bulkSelected.clear();
    _showBulkBar();
  }

  function bulkToggleCard(entityId) {
    if (_bulkSelected.has(entityId)) {
      _bulkSelected.delete(entityId);
    } else {
      _bulkSelected.add(entityId);
    }
    // Update checkbox UI
    const cb = document.getElementById(`bulk-cb-${entityId}`);
    if (cb) cb.checked = _bulkSelected.has(entityId);
    _updateBulkBar();
  }

  function _showBulkBar() {
    let bar = $('bulk-card-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'bulk-card-bar';
      bar.className = 'multi-select-bar';
      bar.innerHTML = `
        <span id="bcb-count" style="font-size:.75rem;color:var(--text-1);font-weight:600">0 selected</span>
        <select id="bcb-group" class="form-control" style="width:auto;display:inline-block;font-size:.7rem;padding:.15rem .3rem;height:auto">
          <option value="">Change group...</option>
        </select>
        <button class="btn btn-sm btn-secondary" onclick="App.bulkChangeGroup()">Apply Group</button>
        <input id="bcb-rate" type="number" class="form-control" style="width:80px;display:inline-block;font-size:.7rem;padding:.15rem .3rem;height:auto" placeholder="Rate">
        <button class="btn btn-sm btn-secondary" onclick="App.bulkChangeRate()">Apply Rate</button>
        <button class="btn btn-sm btn-danger" onclick="App.bulkDeleteSelected()">Delete Selected</button>
        <button class="btn btn-sm" onclick="App.toggleBulkSelect(null)">Cancel</button>
      `;
      document.body.appendChild(bar);
    }
    // Populate group options
    const groups = _groupOrder(_bulkEntityType || 'boats');
    const sel = $('bcb-group');
    if (sel) {
      sel.innerHTML = '<option value="">Change group...</option>' +
        groups.map(g => `<option value="${g}">${g}</option>`).join('');
    }
    bar.classList.remove('hidden');
    _updateBulkBar();
  }

  function _hideBulkBar() {
    const bar = $('bulk-card-bar');
    if (bar) bar.classList.add('hidden');
  }

  function _updateBulkBar() {
    const el = $('bcb-count');
    if (el) el.textContent = `${_bulkSelected.size} selected`;
  }

  async function bulkChangeGroup() {
    const group = $('bcb-group')?.value;
    if (!group || !_bulkSelected.size) { toast('Select items and group', 'error'); return; }
    try {
      await api('POST', `/api/productions/${state.prodId}/bulk-update`, {
        entity_type: _bulkEntityType,
        ids: [..._bulkSelected],
        updates: { group_name: group }
      });
      toast(`${_bulkSelected.size} items moved to ${group}`);
      _bulkSelected.clear();
      toggleBulkSelect(null);
      if (typeof App.renderTab === 'function') App.renderTab(state.activeTab);
    } catch (e) { toast(e.message, 'error'); }
  }

  async function bulkChangeRate() {
    const rate = parseFloat($('bcb-rate')?.value);
    if (isNaN(rate) || !_bulkSelected.size) { toast('Select items and enter rate', 'error'); return; }
    try {
      await api('POST', `/api/productions/${state.prodId}/bulk-update`, {
        entity_type: _bulkEntityType,
        ids: [..._bulkSelected],
        updates: { daily_rate_estimate: rate }
      });
      toast(`${_bulkSelected.size} rates updated to $${rate}`);
      _bulkSelected.clear();
      toggleBulkSelect(null);
      if (typeof App.renderTab === 'function') App.renderTab(state.activeTab);
    } catch (e) { toast(e.message, 'error'); }
  }

  async function bulkDeleteSelected() {
    if (!_bulkSelected.size) return;
    showConfirm(`Delete ${_bulkSelected.size} selected items?`, async () => {
      try {
        await api('POST', `/api/productions/${state.prodId}/bulk-delete`, {
          entity_type: _bulkEntityType,
          ids: [..._bulkSelected]
        });
        toast(`${_bulkSelected.size} items deleted`);
        _bulkSelected.clear();
        toggleBulkSelect(null);
        if (typeof App.renderTab === 'function') App.renderTab(state.activeTab);
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  // ── Duplicate assignment (AXE 10.2) ────────────────────────
  async function duplicateAssignment(atype, assignmentId, offsetDays) {
    const offset = offsetDays !== undefined ? offsetDays : 7;
    try {
      const copy = await api('POST', `/api/assignments/${atype}/${assignmentId}/duplicate`, { offset_days: offset });
      toast(`Assignment duplicated (+${offset}d)`);
      // Reload current tab to reflect changes
      const tab = state.activeTab || 'boats';
      if (typeof App.renderTab === 'function') App.renderTab(tab);
      return copy;
    } catch (e) { toast('Duplicate error: ' + e.message, 'error'); return null; }
  }

  // ── Duplicate FNB category (AXE 10.2) ─────────────────────
  async function duplicateFnbCategory(catId) {
    try {
      const result = await api('POST', `/api/fnb-categories/${catId}/duplicate`);
      toast(`Category "${result.category.name}" duplicated with ${result.items.length} items`);
      if (typeof App.renderTab === 'function') App.renderTab('fnb');
      return result;
    } catch (e) { toast('Duplicate error: ' + e.message, 'error'); return null; }
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

    container.innerHTML = html || `<div style="color:var(--text-4);text-align:center;padding:3rem">${t('boats.no_functions')}</div>`;
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
              ${asgn.exclude_holidays === 1 ? '<span style="font-size:.6rem;background:var(--red);color:#fff;padding:0 .3rem;border-radius:3px;font-weight:700">NO HOL</span>' : ''}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:.2rem">
            <button class="btn btn-sm btn-secondary btn-icon" onclick="App.editAssignmentById(${asgn.id})" title="Edit">✎</button>
            <button class="btn btn-sm btn-secondary btn-icon" onclick="App.duplicateAssignment('${state.activeTab === 'transport' ? 'transport' : state.activeTab === 'labour' ? 'helper' : state.activeTab === 'guards' ? 'guard_camp' : state.activeTab === 'picture-boats' ? 'picture_boat' : state.activeTab === 'security-boats' ? 'security_boat' : 'boat'}',${asgn.id})" title="Duplicate (+7d)">&#x2398;</button>
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
      draggable="true"
      ondragstart="App.onFuncDragStart(event,${func.id})"
      ondragend="App.onFuncDragEnd(event)"
      ondragover="App.onFuncDragOver(event,${func.id})"
      ondrop="App.onFuncDrop(event,${func.id})">
      <div class="role-card-header">
        <span style="cursor:grab;color:var(--text-4);font-size:.7rem;margin-right:.3rem" title="Drag to reorder">&#x2630;</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;color:var(--text-0);font-size:.85rem">${esc(func.name)}</div>
          ${func.specs ? `<div style="font-size:.7rem;color:var(--text-4);margin-top:.1rem">${esc(func.specs)}</div>` : ''}
        </div>
        <button onclick="App.openEditFunctionModal(${func.id})"
          style="color:var(--text-4);background:none;border:none;cursor:pointer;font-size:.8rem;padding:.2rem"
          title="Edit function">✎</button>
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
    document.querySelectorAll('.dragging').forEach(el => {
      el.classList.remove('dragging');
      el.classList.add('drag-landing');
      el.addEventListener('animationend', () => el.classList.remove('drag-landing'), { once: true });
    });
  }

  function onDragOver(event, funcId) {
    if (_dragFuncId) return;  // func reorder handled separately
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    document.getElementById(`role-card-${funcId}`)?.classList.add('drag-over');
    document.getElementById(`drop-${funcId}`)?.classList.add('drag-over');
  }

  function onDragLeave(event, funcId) {
    document.getElementById(`role-card-${funcId}`)?.classList.remove('drag-over');
    document.getElementById(`drop-${funcId}`)?.classList.remove('drag-over');
  }

  function onDrop(event, funcId) {
    if (_dragFuncId) return;  // func reorder handled separately
    event.preventDefault();
    document.getElementById(`role-card-${funcId}`)?.classList.remove('drag-over');
    document.getElementById(`drop-${funcId}`)?.classList.remove('drag-over');
    const boat = state.dragBoat;
    if (!boat) return;
    state.dragBoat = null;
    openAssignModal(funcId, boat);
  }

  // ── Function card drag & drop reorder ──────────────────────
  let _dragFuncId = null;

  function onFuncDragStart(event, funcId) {
    _dragFuncId = funcId;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-func-id', funcId);
    event.target.closest('.role-card')?.classList.add('dragging');
  }

  function onFuncDragEnd(event) {
    _dragFuncId = null;
    document.querySelectorAll('.role-card.dragging, .role-card.drag-over').forEach(el => {
      el.classList.remove('dragging', 'drag-over');
    });
  }

  function onFuncDragOver(event, targetFuncId) {
    if (!_dragFuncId || _dragFuncId === targetFuncId) return;
    event.preventDefault();
    event.stopPropagation();
    document.getElementById(`role-card-${targetFuncId}`)?.classList.add('drag-over');
  }

  function onFuncDrop(event, targetFuncId) {
    event.preventDefault();
    event.stopPropagation();
    document.getElementById(`role-card-${targetFuncId}`)?.classList.remove('drag-over');
    if (!_dragFuncId || _dragFuncId === targetFuncId) return;

    // Determine context
    const ctx = _tabCtx || 'boats';
    const funcArrays = {
      boats: 'functions', picture: 'pictureFunctions', transport: 'transportFunctions',
      security: 'securityFunctions', labour: 'labourFunctions', guard_camp: 'gcFunctions',
    };
    const arr = state[funcArrays[ctx] || 'functions'];
    const dragFunc = arr.find(f => f.id === _dragFuncId);
    const dropFunc = arr.find(f => f.id === targetFuncId);
    if (!dragFunc || !dropFunc) return;

    // Move dragged func to target's group if different
    dragFunc.function_group = dropFunc.function_group;

    // Reorder: remove drag, insert at drop position
    const dragIdx = arr.indexOf(dragFunc);
    arr.splice(dragIdx, 1);
    const dropIdx = arr.indexOf(dropFunc);
    arr.splice(dropIdx, 0, dragFunc);

    // Update sort_order
    arr.forEach((f, i) => { f.sort_order = i; });

    _dragFuncId = null;
    _rerenderCtx(ctx);

    // Persist to server
    api('POST', `/api/productions/${state.prodId}/boat-functions/reorder`, {
      items: arr.map(f => ({ id: f.id, sort_order: f.sort_order, function_group: f.function_group })),
    }).catch(e => toast('Reorder save error: ' + e.message, 'error'));
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
    $('assign-modal-title').textContent = existingAsgn ? t('boats.edit_assignment')
      : _tabCtx === 'labour' ? 'Assign worker'
      : _tabCtx === 'guard_camp' ? 'Assign guard'
      : _tabCtx === 'transport' ? 'Assign vehicle'
      : 'Assign boat';
    $('am-func-name').textContent = func.name;
    $('am-boat-name').textContent = boat.name + (boat.captain ? ` · ${boat.captain}` : '');
    $('am-notes').value = existingAsgn?.notes || '';
    $('am-price-display').textContent = rate > 0 ? `$${rate.toLocaleString()}/day` : 'Rate not set';
    // P5.6: price override fields
    const poInput = $('am-price-override');
    const orInput = $('am-override-reason');
    const orGroup = $('am-override-reason-group');
    if (poInput) {
      poInput.value = existingAsgn?.price_override || '';
      poInput.dataset.originalValue = existingAsgn?.price_override || '';
    }
    if (orInput) orInput.value = existingAsgn?.override_reason || '';
    if (orGroup) orGroup.style.display = (existingAsgn?.price_override) ? '' : 'none';
    $('am-include-sunday').checked = existingAsgn?.include_sunday !== 0;
    $('am-exclude-holidays').checked = existingAsgn?.exclude_holidays === 1;
    _updateBillingLabel();
    $('am-include-sunday').onchange = _updateBillingLabel;

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

  function _updateBillingLabel() {
    const el = $('am-billing-label');
    if (el) el.textContent = $('am-include-sunday').checked ? 'Monthly (7d/7)' : 'Per working day (Mon-Sat)';
  }

  // P5.6: show/hide override reason field based on price override value
  function onPriceOverrideChange() {
    const poInput = $('am-price-override');
    const orGroup = $('am-override-reason-group');
    if (!poInput || !orGroup) return;
    const val = parseFloat(poInput.value);
    const orig = parseFloat(poInput.dataset.originalValue);
    // Show reason field if a non-zero override is set and it's different from original
    const changed = val > 0 && (isNaN(orig) || val !== orig);
    orGroup.style.display = (val > 0) ? '' : 'none';
  }

  async function confirmAssignment() {
    const funcId       = parseInt($('am-func-id').value);
    const boatId       = parseInt($('am-boat-id').value);
    const assignmentId = $('am-func-id').dataset.assignmentId;
    const notes  = $('am-notes').value;
    const includeSunday = $('am-include-sunday').checked ? 1 : 0;
    const excludeHolidays = $('am-exclude-holidays').checked ? 1 : 0;
    // P5.6: price override + reason
    const priceOverride = parseFloat($('am-price-override')?.value) || null;
    const overrideReason = ($('am-override-reason')?.value || '').trim();
    const origOverride = parseFloat($('am-price-override')?.dataset.originalValue);
    if (priceOverride && priceOverride > 0 && (isNaN(origOverride) || priceOverride !== origOverride) && !overrideReason) {
      toast('Please provide a reason for the price override', 'error');
      $('am-override-reason')?.focus();
      return;
    }

    try {
      // P5.6: build override fields object
      const _ov = {};
      if (priceOverride) { _ov.price_override = priceOverride; _ov.override_reason = overrideReason; }
      else if ($('am-price-override')?.value === '' || $('am-price-override')?.value === '0') { _ov.price_override = null; _ov.override_reason = null; }

      if (_assignCtx === 'security') {
        if (assignmentId) {
          await api('PUT', `/api/security-boat-assignments/${assignmentId}`, {
            security_boat_id: boatId, notes, include_sunday: includeSunday, exclude_holidays: excludeHolidays, ..._ov,
          });
        } else {
          await api('POST', `/api/productions/${state.prodId}/security-boat-assignments`, {
            boat_function_id: funcId, security_boat_id: boatId, notes, include_sunday: includeSunday, exclude_holidays: excludeHolidays, ..._ov,
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
            picture_boat_id: boatId, notes, include_sunday: includeSunday, exclude_holidays: excludeHolidays, ..._ov,
          });
        } else {
          await api('POST', `/api/productions/${state.prodId}/picture-boat-assignments`, {
            boat_function_id: funcId, picture_boat_id: boatId, notes, include_sunday: includeSunday, exclude_holidays: excludeHolidays, ..._ov,
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
          await api('PUT', `/api/transport-assignments/${assignmentId}`, { vehicle_id: boatId, notes, include_sunday: includeSunday, exclude_holidays: excludeHolidays, ..._ov });
        } else {
          await api('POST', `/api/productions/${state.prodId}/transport-assignments`, {
            boat_function_id: funcId, vehicle_id: boatId, notes, include_sunday: includeSunday, exclude_holidays: excludeHolidays, ..._ov,
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
          await api('PUT', `/api/helper-assignments/${assignmentId}`, { helper_id: boatId, notes, include_sunday: includeSunday, exclude_holidays: excludeHolidays, ..._ov });
        } else {
          await api('POST', `/api/productions/${state.prodId}/helper-assignments`, {
            boat_function_id: funcId, helper_id: boatId, notes, include_sunday: includeSunday, exclude_holidays: excludeHolidays, ..._ov,
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
          await api('PUT', `/api/guard-camp-assignments/${assignmentId}`, { helper_id: boatId, notes, include_sunday: includeSunday, exclude_holidays: excludeHolidays, ..._ov });
        } else {
          await api('POST', `/api/productions/${state.prodId}/guard-camp-assignments`, {
            boat_function_id: funcId, helper_id: boatId, notes, include_sunday: includeSunday, exclude_holidays: excludeHolidays, ..._ov,
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
            boat_id: boatId, notes, include_sunday: includeSunday, exclude_holidays: excludeHolidays, ..._ov,
          });
        } else {
          await api('POST', `/api/productions/${state.prodId}/assignments`, {
            boat_function_id: funcId, boat_id: boatId, notes, include_sunday: includeSunday, exclude_holidays: excludeHolidays, ..._ov,
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
    _SL._snapshotModal('add-boat-overlay');
    setTimeout(() => $('nb-name').focus(), 80);
  }

  function closeAddBoatModal(force) {
    _SL._guardedClose('add-boat-overlay', () => $('add-boat-overlay').classList.add('hidden'), force);
  }

  async function createBoat() {
    const name = $('nb-name').value.trim();
    if (!name) { toast('Name is required', 'error'); return; }
    try {
      const boat = await api('POST', `/api/productions/${state.prodId}/boats`, {
        name,
        daily_rate_estimate: parseFloat($('nb-price').value) || 0,
        currency:   $('nb-currency')?.value || 'USD',
        capacity:   $('nb-capacity').value.trim() || null,
        captain:    $('nb-captain').value.trim() || null,
        wave_rating: $('nb-wave').value,
        night_ok:   $('nb-night').checked ? 1 : 0,
        notes:      $('nb-notes').value.trim() || null,
        group_name: 'Custom',
      });
      state.boats.push(boat);
      closeAddBoatModal(true);
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
    _SL._snapshotModal('add-picture-boat-overlay');
    setTimeout(() => $('npb-name').focus(), 80);
  }

  function closeAddPictureBoatModal(force) {
    _SL._guardedClose('add-picture-boat-overlay', () => $('add-picture-boat-overlay').classList.add('hidden'), force);
  }

  async function createPictureBoat() {
    const name = $('npb-name').value.trim();
    if (!name) { toast('Name is required', 'error'); return; }
    try {
      const pb = await api('POST', `/api/productions/${state.prodId}/picture-boats`, {
        name,
        daily_rate_estimate: parseFloat($('npb-price').value) || 0,
        currency:    $('npb-currency')?.value || 'USD',
        capacity:    $('npb-capacity').value.trim() || null,
        captain:     $('npb-captain').value.trim()  || null,
        wave_rating: $('npb-wave').value,
        night_ok:    $('npb-night').checked ? 1 : 0,
        notes:       $('npb-notes').value.trim() || null,
        group_name:  'Custom',
      });
      state.pictureBoats.push(pb);
      closeAddPictureBoatModal(true);
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
    if ($('bd-currency')) $('bd-currency').value = pb.currency || 'USD';
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
    // AXE 4.4: load entity history
    if (App._loadDetailHistory) App._loadDetailHistory('picture_boats', pbId);
  }

  function _detailBoatIdForBtn() { return _detailBoatId; }

  async function deletePictureBoat(pbId) {
    try {
      const pb = state.pictureBoats.find(b => b.id === pbId);
      const impact = await api('GET', `/api/picture-boats/${pbId}/impact`);
      const parts = [];
      if (impact.assignments > 0) parts.push(`${impact.assignments} assignment(s)`);
      if (impact.fuel_entries > 0) parts.push(`${impact.fuel_entries} fuel entry(ies)`);
      const cascade = parts.length > 0 ? `\nThis will also remove ${parts.join(' and ')}.` : '';
      showConfirm(`Delete picture boat "${pb?.name || '?'}"?${cascade}`, async () => {
        try {
          await api('DELETE', `/api/picture-boats/${pbId}`);
          state.pictureBoats       = state.pictureBoats.filter(b => b.id !== pbId);
          state.pictureAssignments = state.pictureAssignments.filter(a => a.picture_boat_id !== pbId);
          closeBoatDetail();
          renderPictureBoats();
          toast('Picture boat deleted');
        } catch (e) { toast('Error: ' + e.message, 'error'); }
      });
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  }

  // ── Add function ───────────────────────────────────────────
  function showAddFunctionModal() {
    ['nf-name','nf-specs','nf-start','nf-end'].forEach(id => $(id).value = '');
    $('nf-edit-id').value = '';
    $('nf-modal-title').textContent = t('boats.new_function');
    $('nf-confirm-btn').textContent = t('common.create');
    $('nf-group').innerHTML = state.boatGroups.map(g => `<option value="${g.name}">${g.name}</option>`).join('');
    $('nf-group').value = state.boatGroups[0]?.name || '';
    $('nf-color').value = state.boatGroups[0]?.color || '#3B82F6';
    $('nf-group').onchange = (e) => {
      const g = state.boatGroups.find(g => g.name === e.target.value);
      $('nf-color').value = g?.color || '#6b7280';
    };
    $('add-func-overlay').dataset.ctx = 'boats';
    $('add-func-overlay').classList.remove('hidden');
    _SL._snapshotModal('add-func-overlay');
    setTimeout(() => $('nf-name').focus(), 80);
  }

  function pbShowAddFunctionModal() {
    ['nf-name','nf-specs','nf-start','nf-end'].forEach(id => $(id).value = '');
    $('nf-edit-id').value = '';
    $('nf-modal-title').textContent = t('boats.new_function');
    $('nf-confirm-btn').textContent = t('common.create');
    $('nf-group').innerHTML = state.pbGroups.map(g => `<option value="${g.name}">${g.name}</option>`).join('');
    $('nf-group').value = state.pbGroups[0]?.name || '';
    $('nf-color').value = state.pbGroups[0]?.color || '#6b7280';
    $('nf-group').onchange = (e) => {
      const g = state.pbGroups.find(g => g.name === e.target.value);
      $('nf-color').value = g?.color || '#6b7280';
    };
    $('add-func-overlay').dataset.ctx = 'picture';
    $('add-func-overlay').classList.remove('hidden');
    _SL._snapshotModal('add-func-overlay');
    setTimeout(() => $('nf-name').focus(), 80);
  }

  function closeAddFunctionModal(force) {
    _SL._guardedClose('add-func-overlay', () => {
      $('add-func-overlay').classList.add('hidden');
      $('nf-group').onchange = null;
    }, force);
  }

  // ── Edit function: open modal in edit mode ──────────────────
  function openEditFunctionModal(funcId) {
    // Find function across all contexts
    const allFuncs = [
      ...state.functions,
      ...(state.pictureFunctions || []),
      ...(state.transportFunctions || []),
      ...(state.securityFunctions || []),
      ...(state.labourFunctions || []),
      ...(state.gcFunctions || []),
    ];
    const func = allFuncs.find(f => f.id === funcId);
    if (!func) { toast('Function not found', 'error'); return; }

    // Determine context from function
    const ctx = func.context || 'boats';
    const groups = ctx === 'picture' ? state.pbGroups
      : ctx === 'transport' ? state.tbGroups
      : ctx === 'security' ? (state.sbGroups || [])
      : ctx === 'labour' ? state.lbGroups
      : ctx === 'guard_camp' ? state.gcGroups
      : state.boatGroups;

    $('nf-edit-id').value = funcId;
    $('nf-modal-title').textContent = t('boats.edit_function');
    $('nf-confirm-btn').textContent = t('common.save');
    $('nf-name').value = func.name || '';
    $('nf-specs').value = func.specs || '';
    $('nf-start').value = func.default_start || '';
    $('nf-end').value = func.default_end || '';
    $('nf-group').innerHTML = groups.map(g => `<option value="${g.name}">${g.name}</option>`).join('');
    $('nf-group').value = func.function_group || groups[0]?.name || '';
    $('nf-color').value = func.color || '#3B82F6';
    $('nf-group').onchange = (e) => {
      const g = groups.find(g => g.name === e.target.value);
      $('nf-color').value = g?.color || '#6b7280';
    };
    $('add-func-overlay').dataset.ctx = ctx;
    $('add-func-overlay').classList.remove('hidden');
    _SL._snapshotModal('add-func-overlay');
    setTimeout(() => $('nf-name').focus(), 80);
  }

  async function saveFunction() {
    const name = $('nf-name').value.trim();
    if (!name) { toast('Name is required', 'error'); return; }
    const ctx = $('add-func-overlay').dataset.ctx || 'boats';
    const editId = $('nf-edit-id').value;

    const data = {
      name,
      function_group: $('nf-group').value,
      color:          $('nf-color').value,
      default_start:  $('nf-start').value || null,
      default_end:    $('nf-end').value   || null,
      specs:          $('nf-specs').value.trim() || null,
    };

    try {
      if (editId) {
        // UPDATE existing function
        const updated = await api('PUT', `/api/boat-functions/${editId}`, data);
        const funcArrays = {
          boats: 'functions', picture: 'pictureFunctions', transport: 'transportFunctions',
          security: 'securityFunctions', labour: 'labourFunctions', guard_camp: 'gcFunctions',
        };
        const arr = state[funcArrays[ctx] || 'functions'];
        const idx = arr.findIndex(f => f.id === parseInt(editId));
        if (idx !== -1) Object.assign(arr[idx], updated);
        closeAddFunctionModal(true);
        _rerenderCtx(ctx);
        toast(`Function "${updated.name}" updated`);
      } else {
        // CREATE new function
        data.sort_order = ctx === 'picture' ? state.pictureFunctions.length : ctx === 'labour' ? state.labourFunctions.length : ctx === 'guard_camp' ? state.gcFunctions.length : state.functions.length;
        data.context = ctx;
        const func = await api('POST', `/api/productions/${state.prodId}/boat-functions`, data);
        if (ctx === 'picture') state.pictureFunctions.push(func);
        else if (ctx === 'transport') state.transportFunctions.push(func);
        else if (ctx === 'security') state.securityFunctions.push(func);
        else if (ctx === 'labour') state.labourFunctions.push(func);
        else if (ctx === 'guard_camp') state.gcFunctions.push(func);
        else state.functions.push(func);
        closeAddFunctionModal(true);
        _rerenderCtx(ctx);
        toast(`Function "${func.name}" created`);
      }
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    }
  }

  function _rerenderCtx(ctx) {
    if (ctx === 'picture') renderPbRoleCards();
    else if (ctx === 'transport') renderTbRoleCards();
    else if (ctx === 'security') renderSecurityBoats();
    else if (ctx === 'labour') renderLbRoleCards();
    else if (ctx === 'guard_camp') renderGcRoleCards();
    else renderRoleCards();
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

    // Column windowing: determine visible range from current scroll
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
        onmouseenter="App.showDateTooltip(event,'${dk}')"
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
        data-func-id="${func.id}" title="${esc(func.name)}" onclick="App.onFuncCellClick(event,${func.id})">
        <div class="rn-group" style="color:${color}">${esc(func.function_group || 'Special')}</div>
        <div class="${boatLabel ? 'rn-boat' : 'rn-empty'}">${esc(boatLabel ? boatLabel + multiSuffix : func.name)}</div>
      </td>`;

      // Date cells: pure click-to-cycle, no text (windowed)
      days.forEach((day, colIdx) => {
        const dk = _localDk(day);
        const isWE = day.getDay() === 0 || day.getDay() === 6;
        const weClass = isWE ? 'weekend-col' : '';

        // Skip full rendering for off-screen columns
        if (colIdx < vColStart || colIdx >= vColEnd) {
          cells += `<td class="schedule-cell ${weClass}"></td>`;
          return;
        }

        // Find first assignment with a non-null status for this day
        let filledAsgn = null, filledStatus = null;
        for (const asgn of funcAsgns) {
          const st = effectiveStatus(asgn, dk);
          if (st) { filledAsgn = asgn; filledStatus = st; break; }
        }

        if (!filledAsgn) {
          cells += `<td class="schedule-cell ${weClass}" data-func="${func.id}" data-date="${dk}" data-asgn=""
            onmousedown="App._onScheduleMouseDown(event,${func.id},null,'${dk}')"
            onmouseover="App._onScheduleMouseOver(event,${func.id},null,'${dk}')"
            oncontextmenu="App.onScheduleCellContext(event,${func.id},null,'${dk}')"></td>`;
        } else {
          const bg = _scheduleCellBg(filledStatus, color, isWE);
          cells += `<td class="schedule-cell ${weClass}" data-func="${func.id}" data-date="${dk}" data-asgn="${filledAsgn.id}" style="background:${bg}"
            onmousedown="App._onScheduleMouseDown(event,${func.id},${filledAsgn.id},'${dk}')"
            onmouseover="App._onScheduleMouseOver(event,${func.id},${filledAsgn.id},'${dk}')"
            oncontextmenu="App.onScheduleCellContext(event,${func.id},${filledAsgn.id},'${dk}')"></td>`;
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

    const schedHTML = `
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
    _morphHTML(container, schedHTML);
    // Sync lock footer scroll + re-render on scroll for column windowing
    const _sw = container.querySelector('.schedule-wrap');
    const _sl = container.querySelector('.schedule-lock-outer');
    if (_sw && _sl) {
      _sw.addEventListener('scroll', () => {
        _sl.scrollLeft = _sw.scrollLeft;
        _debouncedRender('schedule-vscroll', renderSchedule, 100);
      });
    }
  }

  // ── Multi-select state for schedules ─────────────────────────
  let _multiSel = {
    active: false,       // is drag-selecting
    cells: [],           // [{funcId, assignmentId, date, el}]
    lastCell: null,      // {funcId, date} for shift+click anchor
    ctx: 'boats',        // which schedule context
  };

  function _clearMultiSelect() {
    _multiSel.cells.forEach(c => { if (c.el) c.el.classList.remove('sch-multi-selected'); });
    _multiSel.cells = [];
    _multiSel.active = false;
    const bar = $('multi-select-bar');
    if (bar) bar.classList.add('hidden');
  }

  function _addToMultiSelect(funcId, assignmentId, date, el) {
    if (_multiSel.cells.some(c => c.funcId === funcId && c.date === date)) return;
    _multiSel.cells.push({ funcId, assignmentId, date, el });
    if (el) el.classList.add('sch-multi-selected');
    _showMultiSelectBar();
  }

  function _showMultiSelectBar() {
    let bar = $('multi-select-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'multi-select-bar';
      bar.className = 'multi-select-bar hidden';
      bar.innerHTML = `
        <span id="msb-count" style="font-size:.75rem;color:var(--text-1);font-weight:600"></span>
        <button class="btn btn-sm btn-primary" onclick="App.multiSelectFill()">Fill selected</button>
        <button class="btn btn-sm btn-secondary" onclick="App.multiSelectClear()">Clear selected</button>
        <button class="btn btn-sm btn-danger" onclick="App.multiSelectCancel()">Cancel</button>
      `;
      document.body.appendChild(bar);
    }
    $('msb-count').textContent = `${_multiSel.cells.length} cell(s) selected`;
    bar.classList.remove('hidden');
  }

  function multiSelectFill() {
    const cells = [..._multiSel.cells];
    _clearMultiSelect();
    cells.forEach(c => {
      if (!c.assignmentId) _fillDay(c.funcId, c.date);
      else _doCellCycle(c.funcId, c.assignmentId, c.date);
    });
  }

  function multiSelectClear() {
    const cells = [..._multiSel.cells];
    _clearMultiSelect();
    cells.forEach(c => {
      if (c.assignmentId) _clearDayOverride(c.assignmentId, c.date);
    });
  }

  function multiSelectCancel() {
    _clearMultiSelect();
  }

  function _onScheduleMouseDown(event, funcId, assignmentId, date) {
    if (event.shiftKey && _multiSel.lastCell) {
      // Shift+click: select range from last to current
      event.preventDefault();
      _selectRange(_multiSel.lastCell.funcId, _multiSel.lastCell.date, funcId, date);
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      // Ctrl+click: toggle single cell in selection
      event.preventDefault();
      const el = event.target.closest('td');
      _addToMultiSelect(funcId, assignmentId, date, el);
      _multiSel.lastCell = { funcId, date };
      return;
    }
    // Normal click: start drag-select
    _clearMultiSelect();
    _multiSel.active = true;
    _multiSel.lastCell = { funcId, date };
    const el = event.target.closest('td');
    _addToMultiSelect(funcId, assignmentId, date, el);
  }

  function _onScheduleMouseOver(event, funcId, assignmentId, date) {
    if (!_multiSel.active) return;
    const el = event.target.closest('td');
    _addToMultiSelect(funcId, assignmentId, date, el);
  }

  // Global mouseup to end drag-select
  document.addEventListener('mouseup', () => {
    if (_multiSel.active) {
      _multiSel.active = false;
      if (_multiSel.cells.length <= 1) {
        // Single cell click — do normal action
        const c = _multiSel.cells[0];
        _clearMultiSelect();
        if (c) {
          _multiSel.lastCell = { funcId: c.funcId, date: c.date };
          if (!c.assignmentId) _fillDay(c.funcId, c.date);
          else _doCellCycle(c.funcId, c.assignmentId, c.date);
        }
      }
    }
  });

  function _selectRange(funcId1, date1, funcId2, date2) {
    // For range selection, select all cells in the rectangle
    const schedWrap = document.querySelector('.schedule-wrap');
    if (!schedWrap) return;
    const allCells = schedWrap.querySelectorAll('td.schedule-cell[data-func][data-date]');
    const dates = [date1, date2].sort();
    const funcIds = [funcId1, funcId2];
    // Find row indices
    const rows = schedWrap.querySelectorAll('tbody tr');
    let rowMap = {};
    rows.forEach((row, i) => {
      const fc = row.querySelector('.sch-func-cell');
      if (fc && fc.dataset.funcId) rowMap[fc.dataset.funcId] = i;
    });
    allCells.forEach(cell => {
      const cf = parseInt(cell.dataset.func);
      const cd = cell.dataset.date;
      if (cd >= dates[0] && cd <= dates[1]) {
        const ri1 = rowMap[funcId1] ?? 0, ri2 = rowMap[funcId2] ?? 0;
        const ri = rowMap[cf];
        const minR = Math.min(ri1, ri2), maxR = Math.max(ri1, ri2);
        if (ri !== undefined && ri >= minR && ri <= maxR) {
          _addToMultiSelect(cf, parseInt(cell.dataset.asgn) || null, cd, cell);
        }
      }
    });
  }

  async function _clearDayOverride(assignmentId, date) {
    // Find context and clear the override
    const asgn = state.assignments.find(a => a.id === assignmentId)
      || state.pictureAssignments?.find(a => a.id === assignmentId)
      || state.transportAssignments?.find(a => a.id === assignmentId)
      || state.labourAssignments?.find(a => a.id === assignmentId)
      || state.securityAssignments?.find(a => a.id === assignmentId)
      || state.gcAssignments?.find(a => a.id === assignmentId);
    if (!asgn) return;
    const overrides = JSON.parse(asgn.day_overrides || '{}');
    overrides[date] = 'empty';
    try {
      const endpoint = _getAssignmentEndpoint(asgn);
      if (endpoint) {
        await api('PUT', endpoint, { day_overrides: JSON.stringify(overrides) });
        asgn.day_overrides = JSON.stringify(overrides);
      }
    } catch (e) { /* silent */ }
  }

  function _getAssignmentEndpoint(asgn) {
    if (asgn.boat_id !== undefined && asgn.boat_function_id) return `/api/assignments/${asgn.id}`;
    if (asgn.picture_boat_id !== undefined) return `/api/picture-boat-assignments/${asgn.id}`;
    if (asgn.vehicle_id !== undefined) return `/api/transport-assignments/${asgn.id}`;
    if (asgn.helper_id !== undefined) return `/api/helper-assignments/${asgn.id}`;
    if (asgn.security_boat_id !== undefined) return `/api/security-boat-assignments/${asgn.id}`;
    return null;
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
            <button class="btn btn-sm btn-icon btn-secondary"
              onclick="App.duplicateAssignment('${state.activeTab === 'transport' ? 'transport' : state.activeTab === 'labour' ? 'helper' : state.activeTab === 'guards' ? 'guard_camp' : state.activeTab === 'picture-boats' ? 'picture_boat' : state.activeTab === 'security-boats' ? 'security_boat' : 'boat'}',${a.id});App.closeSchedulePopover()" title="Duplicate (+7d)">&#x2398;</button>
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
      _queueCellFlash(date, funcId);
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
      const funcId = idx >= 0 ? state.assignments[idx].boat_function_id : null;
      const lastDate = Object.keys(overrides).pop();
      renderBoats();
      // AXE 5.4: flash saved cell after render re-creates DOM
      if (lastDate && funcId) _queueCellFlash(lastDate, funcId);
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

    // Only show tooltip if there are notes
    const noteLines = [];
    if (day.notes) noteLines.push(`📝 ${esc(day.notes)}`);
    events.forEach(ev => { if (ev.notes) noteLines.push(`${(ev.event_type||'game').toUpperCase()}: ${esc(ev.notes)}`); });
    if (!noteLines.length) return;

    const tip = $('pdt-tooltip');
    tip.innerHTML = `<div class="pdt-tip-note" style="border:none;padding:0;margin:0">${noteLines.join('<br>')}</div>`;

    const rect = event.target.getBoundingClientRect();
    tip.style.left = rect.left + 'px';
    tip.style.top  = (rect.bottom + 4) + 'px';
    tip.classList.remove('hidden');
  }

  function hidePDTTooltip() {
    $('pdt-tooltip')?.classList.add('hidden');
  }

  function showDateTooltip(event, date) {
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
    if ($('bd-currency')) $('bd-currency').value = boat.currency || 'USD';
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
    // AXE 4.4: load entity history
    if (App._loadDetailHistory) App._loadDetailHistory('boats', boatId);
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
      currency:            $('bd-currency')?.value || 'USD',
      notes:               $('bd-notes').value.trim() || null,
    };
    if (!data.name) { toast('Name is required', 'error'); return; }
    try {
      // AXE 5.4: flash detail panel on successful save
      const _flashDetail = () => _flashSavedCard($('boat-detail-overlay')?.querySelector('.bd-inner'));
      if (_detailIsSecurityBoat) {
        const updated = await api('PUT', `/api/security-boats/${_detailBoatId}`, data);
        const idx = state.securityBoats.findIndex(b => b.id === _detailBoatId);
        if (idx >= 0) state.securityBoats[idx] = { ...state.securityBoats[idx], ...updated };
        _flashDetail();
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
          currency:            $('bd-currency')?.value || 'USD',
          notes:               $('bd-notes').value.trim() || null,
        };
        const updated = await api('PUT', `/api/helpers/${_detailBoatId}`, wdata);
        const idx = state.labourWorkers.findIndex(w => w.id === _detailBoatId);
        if (idx >= 0) state.labourWorkers[idx] = { ...state.labourWorkers[idx], ...updated };
        _flashDetail();
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
          currency:            $('bd-currency')?.value || 'USD',
          notes:               $('bd-notes').value.trim() || null,
        };
        const updated = await api('PUT', `/api/guard-camp-workers/${_detailBoatId}`, gcdata);
        const idx = state.gcWorkers.findIndex(w => w.id === _detailBoatId);
        if (idx >= 0) state.gcWorkers[idx] = { ...state.gcWorkers[idx], ...updated };
        _flashDetail();
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
          currency:            $('bd-currency')?.value || 'USD',
          notes:               $('bd-notes').value.trim() || null,
        };
        const updated = await api('PUT', `/api/transport-vehicles/${_detailBoatId}`, tdata);
        const idx = state.transportVehicles.findIndex(v => v.id === _detailBoatId);
        if (idx >= 0) state.transportVehicles[idx] = { ...state.transportVehicles[idx], ...updated };
        _flashDetail();
        closeBoatDetail();
        renderTbVehicleList();
        toast('Vehicle updated');
      } else if (_detailIsPicture) {
        const updated = await api('PUT', `/api/picture-boats/${_detailBoatId}`, data);
        const idx = state.pictureBoats.findIndex(b => b.id === _detailBoatId);
        if (idx >= 0) state.pictureBoats[idx] = { ...state.pictureBoats[idx], ...updated };
        _flashDetail();
        closeBoatDetail();
        renderPbBoatList();
        toast('Picture boat updated');
      } else {
        data.category = $('bd-category').value;
        const updated = await api('PUT', `/api/boats/${_detailBoatId}`, data);
        const idx = state.boats.findIndex(b => b.id === _detailBoatId);
        if (idx >= 0) state.boats[idx] = { ...state.boats[idx], ...updated };
        _flashDetail();
        closeBoatDetail();
        renderBoatList();
        toast('Boat updated');
      }
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  }

  // ── Context-sensitive labels for reused boat-detail modal ──────────────
  function _setDetailLabels(ctx) {
    const captainLabel = $('bd-captain-label');
    const captainInput = $('bd-captain');
    const nameInput    = $('bd-name');
    const modalTitle   = document.querySelector('#boat-detail-overlay .modal-title');
    const capacityLabel = $('bd-capacity-label');
    if (ctx === 'transport') {
      if (modalTitle)    modalTitle.textContent = 'Edit vehicle';
      if (nameInput)     nameInput.placeholder  = 'Vehicle name';
      if (captainLabel)  captainLabel.textContent = 'Driver';
      if (captainInput)  captainInput.placeholder = 'Driver name';
      if (capacityLabel) capacityLabel.textContent = 'Capacity';
    } else if (ctx === 'labour') {
      if (modalTitle)    modalTitle.textContent = 'Edit worker';
      if (nameInput)     nameInput.placeholder  = 'Worker name';
      if (captainLabel)  captainLabel.textContent = 'Role';
      if (captainInput)  captainInput.placeholder = 'Role / position';
      if (capacityLabel) capacityLabel.textContent = 'Team size';
    } else if (ctx === 'guard_camp') {
      if (modalTitle)    modalTitle.textContent = 'Edit guard';
      if (nameInput)     nameInput.placeholder  = 'Guard name';
      if (captainLabel)  captainLabel.textContent = 'Role';
      if (captainInput)  captainInput.placeholder = 'Guard role / shift';
      if (capacityLabel) capacityLabel.textContent = 'Shift size';
    } else {
      if (modalTitle)    modalTitle.textContent = 'Edit boat';
      if (nameInput)     nameInput.placeholder  = 'Boat name';
      if (captainLabel)  captainLabel.textContent = 'Captain';
      if (captainInput)  captainInput.placeholder = 'Captain name';
      if (capacityLabel) capacityLabel.textContent = 'Capacity';
    }
  }

  function closeBoatDetail() {
    $('boat-detail-overlay').classList.add('hidden');
    // Restore all potentially hidden rows
    ['bd-group', 'bd-category', 'bd-waves', 'bd-night', 'bd-capacity'].forEach(id => {
      const el = $(id); if (el) { const row = el.closest('tr'); if (row) row.style.display = ''; }
    });
    _setDetailLabels('boat');
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
  function exportCSV()  {
    $('export-menu').classList.add('hidden');
    SL.openExportDateModal('boats', 'Boats', [
      { key: 'csv', label: 'CSV' },
      { key: 'json', label: 'JSON' },
    ], (from, to, fmt) => {
      const base = fmt === 'json'
        ? `/api/productions/${state.prodId}/export/json`
        : `/api/productions/${state.prodId}/export/csv`;
      SL._exportWithDates(base, from, to);
    });
  }
  function exportJSON() {
    $('export-menu').classList.add('hidden');
    SL.openExportDateModal('boats', 'Boats', [
      { key: 'csv', label: 'CSV' },
      { key: 'json', label: 'JSON' },
    ], (from, to, fmt) => {
      const base = fmt === 'json'
        ? `/api/productions/${state.prodId}/export/json`
        : `/api/productions/${state.prodId}/export/csv`;
      SL._exportWithDates(base, from, to);
    });
  }



  // ── Context menu on schedule cells (P3.8) ────────────────
  let _longPressTimer = null;

  function onScheduleCellContext(event, funcId, assignmentId, date) {
    event.preventDefault();
    event.stopPropagation();
    _showCellContextMenu(event, funcId, assignmentId, date);
  }

  function _showCellContextMenu(event, funcId, assignmentId, date) {
    closeSchedulePopover();
    _closeCellContextMenu();

    const func = state.functions.find(f => f.id === funcId);
    const asgn = assignmentId ? state.assignments.find(a => a.id === assignmentId) : null;
    const boatName = asgn ? (asgn.boat_name_override || asgn.boat_name || '') : '';
    const isLocked = !!state.lockedDays[date];

    let items = '';
    if (asgn) {
      items += `<button onclick="App.editAssignmentById(${assignmentId});App._closeCellContextMenu()">&#x270E; Edit assignment</button>`;
      items += `<button onclick="App._showCellDetail(${funcId},${assignmentId},'${date}')">&#x1F50D; View details</button>`;
      items += `<button class="danger" onclick="App._contextDeleteAssignment(${assignmentId})">&#x1F5D1; Delete</button>`;
    } else {
      items += `<button onclick="App.assignFromDate(${funcId},'${date}');App._closeCellContextMenu()">+ Assign boat</button>`;
    }

    const menu = document.createElement('div');
    menu.id = 'cell-context-menu';
    menu.className = 'cell-context-menu';
    menu.innerHTML = `
      <div class="ccm-header">${esc(func?.name || '')} &middot; ${fmtDateLong(date)}</div>
      ${boatName ? `<div class="ccm-sub">${esc(boatName)}</div>` : ''}
      ${isLocked ? '<div class="ccm-locked">&#x1F512; Day locked</div>' : ''}
      <div class="ccm-actions">${items}</div>`;

    document.body.appendChild(menu);

    // Position near cursor
    const x = Math.min(event.clientX, window.innerWidth - 200);
    const y = Math.min(event.clientY, window.innerHeight - 180);
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', _closeCellContextMenu, { once: true });
    }, 10);
  }

  function _closeCellContextMenu() {
    const m = document.getElementById('cell-context-menu');
    if (m) m.remove();
  }

  function _showCellDetail(funcId, assignmentId, date) {
    _closeCellContextMenu();
    const asgn = state.assignments.find(a => a.id === assignmentId);
    if (!asgn) return;
    const func = state.functions.find(f => f.id === funcId);
    const boat = state.boats.find(b => b.id === asgn.boat_id);
    const wd = computeWd(asgn);
    const rate = boat?.daily_rate_estimate || 0;

    const el = $('schedule-popover');
    $('sch-pop-content').innerHTML = `
      <div class="sch-pop-header">
        <strong>${esc(func?.name || '')}</strong>
        <span style="color:var(--text-4);font-size:.65rem;margin-left:.4rem">${esc(func?.function_group || '')}</span>
      </div>
      <div style="font-size:.75rem;color:var(--text-1);margin-bottom:.3rem">&#x26F5; ${esc(boat?.name || asgn.boat_name_override || '?')}</div>
      <div style="font-size:.7rem;color:var(--text-3);margin-bottom:.2rem">${fmtDate(asgn.start_date)} &rarr; ${fmtDate(asgn.end_date)}</div>
      <div style="font-size:.7rem;color:var(--text-3);margin-bottom:.3rem">${wd} working day(s) &middot; ${fmtMoney(Math.round(wd * rate))}</div>
      ${asgn.notes ? `<div style="font-size:.68rem;color:var(--text-4);font-style:italic;border-top:1px solid var(--border);padding-top:.3rem;margin-top:.2rem">${esc(asgn.notes)}</div>` : ''}
      <div class="sch-pop-actions" style="margin-top:.4rem">
        <button onclick="App.editAssignmentById(${assignmentId});App.closeSchedulePopover()">&#x270E; Edit</button>
        <button class="danger" onclick="App.removeAssignmentById(${assignmentId})">&#x1F5D1; Delete</button>
      </div>`;

    const rect = document.querySelector(`td[data-func="${funcId}"][data-date="${date}"]`)?.getBoundingClientRect();
    if (rect) {
      el.style.left = (rect.right + 4) + 'px';
      el.style.top = rect.top + 'px';
    }
    el.classList.remove('hidden');
  }

  async function _contextDeleteAssignment(assignmentId) {
    _closeCellContextMenu();
    showConfirm('Delete this assignment?', async () => {
      await removeAssignmentById(assignmentId);
    });
  }

  // Long-press for mobile (touchstart/touchend on schedule cells)
  document.addEventListener('touchstart', e => {
    const cell = e.target.closest('td.schedule-cell[data-func][data-date]');
    if (!cell) return;
    const funcId = parseInt(cell.dataset.func);
    const assignmentId = parseInt(cell.dataset.asgn) || null;
    const date = cell.dataset.date;
    _longPressTimer = setTimeout(() => {
      _longPressTimer = null;
      e.preventDefault();
      const touch = e.touches[0];
      _showCellContextMenu({ clientX: touch.clientX, clientY: touch.clientY, preventDefault() {}, stopPropagation() {} }, funcId, assignmentId, date);
    }, 500);
  }, { passive: false });

  document.addEventListener('touchend', () => {
    if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
  });

  document.addEventListener('touchmove', () => {
    if (_longPressTimer) { clearTimeout(_longPressTimer); _longPressTimer = null; }
  });


// Register module functions on App
Object.assign(window.App, {
  _addToMultiSelect,
  _assignmentForFunc,
  _assignmentsForFunc,
  _clearDayOverride,
  _clearMultiSelect,
  _closeCellContextMenu,
  _contextDeleteAssignment,
  _detailBoatIdForBtn,
  _doCellCycle,
  _fillDay,
  _filteredBoats,
  _getAssignmentEndpoint,
  _onScheduleMouseDown,
  _onScheduleMouseOver,
  _restoreScheduleScroll,
  _saveOverrides,
  _saveScheduleScroll,
  _scheduleCellBg,
  _selectRange,
  _setDetailLabels,
  _showCellDetail,
  _showMultiSelectBar,
  _updateBillingLabel,
  assignFromDate,
  duplicateEntity,
  duplicateAssignment,
  duplicateFnbCategory,
  toggleBulkSelect,
  bulkToggleCard,
  bulkChangeGroup,
  bulkChangeRate,
  bulkDeleteSelected,
  onFuncDragStart,
  onFuncDragEnd,
  onFuncDragOver,
  onFuncDrop,
  closeAddBoatModal,
  closeAddFunctionModal,
  closeAddPictureBoatModal,
  closeAssignModal,
  closeBoatDetail,
  closeBoatView,
  closeSchedulePopover,
  confirmAssignment,
  confirmDeleteBoat,
  confirmDeleteFunc,
  createBoat,
  saveFunction,
  openEditFunctionModal,
  createPictureBoat,
  deletePictureBoat,
  editAssignment,
  editAssignmentById,
  exportCSV,
  exportJSON,
  filterBoats,
  hidePDTTooltip,
  multiSelectCancel,
  multiSelectClear,
  multiSelectFill,
  onBoatClick,
  onPriceOverrideChange,
  onBoatDragEnd,
  onBoatDragStart,
  onDateCellClick,
  onScheduleCellContext,
  onDragLeave,
  onDragOver,
  onDrop,
  onDropZoneClick,
  onFuncCellClick,
  openAssignModal,
  openBoatDetail,
  openBoatView,
  openPictureBoatDetail,
  pbConfirmDeleteFunc,
  pbEditAssignmentById,
  pbRemoveAssignmentById,
  pbShowAddFunctionModal,
  pbToggleDayLock,
  removeAssignment,
  removeAssignmentById,
  renderBoatBudget,
  renderBoatList,
  renderBoats,
  renderRoleCard,
  renderRoleCards,
  renderSchedule,
  resetDayOverrides,
  rowFigeAmount,
  saveBoatEdit,
  setBoatView,
  showAddBoatModal,
  showAddFunctionModal,
  showAddPictureBoatModal,
  showDateTooltip,
  showPDTTooltip,
  toggleDayLock,
  toggleExport,
  triggerPhotoUpload,
  undoBoat,
  uploadBoatPhoto,
});
