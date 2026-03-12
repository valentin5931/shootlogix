/* FNB MODULE — ES6 Module */
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

    // AXE 5.4: skeleton while loading
    if (!state.fnbCategories) container.innerHTML = _skeletonTable(5, 8);
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
    _updateBreadcrumb(tab.charAt(0).toUpperCase() + tab.slice(1));
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
    SL.openExportDateModal('fnb', 'FNB', [
      { key: 'csv', label: 'CSV' },
    ], (from, to, fmt) => {
      SL._exportWithDates(`/api/productions/${state.prodId}/export/fnb-budget/csv`, from, to);
    });
  }






// Register module functions on App
Object.assign(window.App, {
  _fnbLoadAll,
  _fnbPopulateCategorySelect,
  _fnbRenderBudget,
  _fnbRenderGrid,
  _fnbWeekLabel,
  _fnbWeeks,
  _hexToRgb,
  closeFnbCatModal,
  closeFnbItemModal,
  deleteFnbCategory,
  deleteFnbItem,
  editFnbCategory,
  editFnbItem,
  fnbCellClear,
  fnbCellClick,
  fnbExportCSV,
  fnbSetSubTab,
  fnbSetViewMode,
  renderFnb,
  saveFnbCategory,
  saveFnbItem,
  showFnbCatModal,
  showFnbItemModal,
});
