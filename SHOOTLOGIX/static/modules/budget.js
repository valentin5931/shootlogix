/* BUDGET (consolidated) — ES6 Module */
/* Auto-split from app-monolith.js — AXE 8.2 */

const SL = window._SL;
const { state, authState, $, esc, api, toast, fmtMoney, fmtDate, fmtDateLong,
        _localDk, workingDays, activeWorkingDays, computeWd, effectiveStatus,
        waveClass, waveLabel, _morphHTML, _debouncedRender, _flashSaved,
        _flashSavedCard, _queueCellFlash, _skeletonCards, _skeletonTable,
        _showLoading, _hideLoading,
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
  //  BUDGET (consolidated)
  // ═══════════════════════════════════════════════════════════

  let _budgetRefCurrency = 'USD';

  function _currencySymbol(cur) {
    const syms = { USD: '$', EUR: '\u20AC', GBP: '\u00A3', PAB: 'B/.' };
    return syms[cur] || cur + ' ';
  }

  function fmtMoneyRef(n, cur) {
    if (n == null) return '\u2014';
    return _currencySymbol(cur || _budgetRefCurrency) + Math.round(Number(n)).toLocaleString('en-US');
  }

  async function renderBudget() {
    const container = $('budget-content');
    _showLoading(container, 'stats', { count: 3 });
    try {
      const budget = await api('GET', `/api/productions/${state.prodId}/budget?currency=${_budgetRefCurrency}`);
      const byDept  = budget.by_department || {};
      const allRows = budget.rows || {};
      const refCur = budget.ref_currency || 'USD';

      // Locked days from both schedulers (frontend-only, localStorage)
      const allLocked = Object.assign({}, state.lockedDays, state.pbLockedDays);

      function rowFigeAmount(row, locked) {
        if (!row.start_date || !row.end_date || !row.amount_estimate) return 0;
        const cur = new Date(row.start_date + 'T00:00:00');
        const end = new Date(row.end_date   + 'T00:00:00');
        let total = 0, lockedCount = 0;
        while (cur <= end) {
          total++;
          if (locked[_localDk(cur)]) lockedCount++;
          cur.setDate(cur.getDate() + 1);
        }
        return total === 0 ? 0 : Math.round(row.amount_estimate * lockedCount / total);
      }

      const totalGlobal   = allRows.reduce((s, r) => s + (r.amount_estimate_ref || r.amount_estimate || 0), 0);
      const totalFige     = allRows.reduce((s, r) => s + rowFigeAmount(r, allLocked), 0);
      const totalEstimate = totalGlobal - totalFige;

      const html = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem;flex-wrap:wrap;gap:.5rem">
          <div style="display:flex;align-items:center;gap:.5rem">
            <span style="font-size:.75rem;color:var(--text-4)">Global budget overview</span>
            <select id="budget-ref-currency" onchange="App._changeBudgetCurrency(this.value)"
              style="font-size:.7rem;padding:2px 6px;border-radius:4px;border:1px solid var(--border);background:var(--bg-surface);color:var(--text-1)">
              <option value="USD" ${refCur==='USD'?'selected':''}>USD ($)</option>
              <option value="EUR" ${refCur==='EUR'?'selected':''}>EUR (\u20AC)</option>
            </select>
            ${_isAdmin() ? '<button class="btn btn-sm" onclick="App._showExchangeRateModal()" style="font-size:.65rem;background:var(--bg-surface);border:1px solid var(--border);color:var(--text-2)">Exchange Rates</button>' : ''}
          </div>
          <div style="display:flex;gap:.35rem;flex-wrap:wrap">
            <button class="btn btn-sm btn-primary" onclick="App.budgetExportXlsx()" style="display:flex;align-items:center;gap:.35rem">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              XLSX
            </button>
            <button class="btn btn-sm" onclick="App.budgetExportXlsxEnriched()" style="display:flex;align-items:center;gap:.35rem;background:#059669;color:#fff;border:none">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              XLSX+
            </button>
            <button class="btn btn-sm" onclick="App.budgetExportPdf()" style="display:flex;align-items:center;gap:.35rem;background:#dc2626;color:#fff;border:none">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              PDF
            </button>
            <button class="btn btn-sm" onclick="App.dailyReportPdf()" style="display:flex;align-items:center;gap:.35rem;background:#7c3aed;color:#fff;border:none">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Daily
            </button>
            <button class="btn btn-sm" onclick="App.vendorSummaryExport()" style="display:flex;align-items:center;gap:.35rem;background:#0891b2;color:#fff;border:none">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
              Vendors
            </button>
          </div>
        </div>
        <div class="stat-grid" style="margin-bottom:.75rem">
          <div class="stat-card" style="border:1px solid var(--border)">
            <div class="stat-val" style="font-size:1.75rem">${fmtMoneyRef(totalGlobal, refCur)}</div>
            <div class="stat-lbl">TOTAL GLOBAL (${refCur})</div>
          </div>
          <div class="stat-card" style="border:1px solid var(--green);background:rgba(34,197,94,.07)">
            <div class="stat-val" style="font-size:1.75rem;color:var(--green)">${fmtMoneyRef(totalFige, refCur)}</div>
            <div class="stat-lbl">UP TO DATE <span style="font-size:.6rem;opacity:.55">(frozen)</span></div>
          </div>
          <div class="stat-card" style="border:1px solid #F59E0B;background:rgba(245,158,11,.07)">
            <div class="stat-val" style="font-size:1.75rem;color:#F59E0B">${fmtMoneyRef(totalEstimate, refCur)}</div>
            <div class="stat-lbl">ESTIMATE</div>
          </div>
        </div>
        <div class="stat-grid">
          ${Object.keys(byDept).map(dept => `
          <div class="stat-card" style="text-align:left">
            <div style="font-size:.65rem;font-weight:700;color:var(--text-4);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.25rem">${esc(dept)}</div>
            <div style="font-size:1.1rem;font-weight:700;color:var(--text-0)">${fmtMoneyRef(byDept[dept].total_estimate, refCur)}</div>
          </div>`).join('')}
        </div>
        ${Object.entries(byDept).map(([dept, ddata]) => `
        <div class="budget-dept-card">
          <div class="budget-dept-header">
            <span style="font-weight:700;font-size:.82rem;color:var(--text-0)">${esc(dept)}</span>
            <span style="font-weight:700;color:var(--green)">${fmtMoneyRef(ddata.total_estimate, refCur)}</span>
          </div>
          <table class="budget-table">
            <thead>
              <tr>
                <th>Item</th>
                <th style="text-align:left">Detail</th>
                <th>Start</th>
                <th>End</th>
                <th>Days</th>
                <th>Rate</th>
                <th>Cur</th>
                <th>Total (${refCur})</th>
              </tr>
            </thead>
            <tbody>
              ${(ddata.lines || []).map((r, i) => `<tr style="${i%2 ? 'background:var(--bg-surface)' : ''}">
                <td style="color:var(--text-1)">${esc(r.name || '')}</td>
                <td style="color:var(--text-2)">${esc(r.boat || r.detail || '')}</td>
                <td style="font-size:.7rem;color:var(--text-3)">${fmtDate(r.start_date)}</td>
                <td style="font-size:.7rem;color:var(--text-3)">${fmtDate(r.end_date)}</td>
                <td style="text-align:right;color:var(--text-2)">${r.working_days ?? '\u2014'}</td>
                <td style="text-align:right;color:var(--text-3)">${fmtMoney(r.unit_price_estimate)}</td>
                <td style="text-align:center;font-size:.7rem;color:var(--text-4)">${esc(r.currency || 'USD')}${r.rate_to_ref ? ' <span title="Rate: '+r.rate_to_ref+'" style="opacity:.6">\u00D7'+Number(r.rate_to_ref).toFixed(3)+'</span>' : ''}</td>
                <td style="text-align:right;font-weight:600;color:var(--green)">${fmtMoneyRef(r.amount_estimate_ref ?? r.amount_estimate, refCur)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`).join('')}`;

      container.innerHTML = html;
      _hideLoading(container);
      // After rendering department budget, render daily budget below it
      _renderDailyBudget(container);
      // P5.5: render variance analysis
      _renderBudgetVariance(container);
      // AXE 6.3: render budget history section
      _renderBudgetHistory(container);
    } catch (e) {
      container.innerHTML = `<div style="color:var(--red);padding:2rem">Error: ${esc(e.message)}</div>`;
    }
  }

  // ── Currency controls (P6.4) ────────────────────────────────────────────

  function _changeBudgetCurrency(cur) {
    _budgetRefCurrency = cur.toUpperCase();
    renderBudget();
  }

  async function _showExchangeRateModal() {
    let rates = [];
    try { rates = await api('GET', '/api/exchange-rates'); } catch(e) {}
    const overlay = document.createElement('div');
    overlay.id = 'exchange-rate-overlay';
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45)';
    overlay.innerHTML = `
      <div style="background:var(--bg-surface);border-radius:12px;padding:1.5rem;max-width:500px;width:95%;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.25)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
          <h3 style="margin:0;font-size:.95rem;color:var(--text-0)">Exchange Rates</h3>
          <button onclick="document.getElementById('exchange-rate-overlay').remove()" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--text-3)">\u00D7</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr auto;gap:.5rem;align-items:end;margin-bottom:1rem">
          <div><label style="font-size:.65rem;color:var(--text-4)">Date</label><input type="date" id="er-date" value="${new Date().toISOString().slice(0,10)}" style="width:100%;font-size:.75rem;padding:4px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg)"></div>
          <div><label style="font-size:.65rem;color:var(--text-4)">From</label><select id="er-from" style="width:100%;font-size:.75rem;padding:4px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg)"><option>EUR</option><option>USD</option><option>GBP</option><option>PAB</option></select></div>
          <div><label style="font-size:.65rem;color:var(--text-4)">To</label><select id="er-to" style="width:100%;font-size:.75rem;padding:4px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg)"><option>USD</option><option>EUR</option><option>GBP</option><option>PAB</option></select></div>
          <div><label style="font-size:.65rem;color:var(--text-4)">Rate</label><input type="number" step="0.0001" id="er-rate" placeholder="1.0850" style="width:100%;font-size:.75rem;padding:4px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg)"></div>
          <button onclick="App._saveExchangeRate()" style="padding:4px 12px;font-size:.75rem;background:var(--green);color:#fff;border:none;border-radius:4px;cursor:pointer;white-space:nowrap">Add</button>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:.72rem">
          <thead><tr style="border-bottom:1px solid var(--border)">
            <th style="text-align:left;padding:4px;color:var(--text-4)">Date</th>
            <th style="text-align:left;padding:4px;color:var(--text-4)">From</th>
            <th style="text-align:left;padding:4px;color:var(--text-4)">To</th>
            <th style="text-align:right;padding:4px;color:var(--text-4)">Rate</th>
          </tr></thead>
          <tbody>${rates.slice(0, 50).map((r, i) => `<tr style="${i%2?'background:var(--bg)':''}">
            <td style="padding:4px;color:var(--text-2)">${esc(r.date)}</td>
            <td style="padding:4px;color:var(--text-2)">${esc(r.from_currency)}</td>
            <td style="padding:4px;color:var(--text-2)">${esc(r.to_currency)}</td>
            <td style="padding:4px;text-align:right;color:var(--text-1);font-weight:600">${Number(r.rate).toFixed(4)}</td>
          </tr>`).join('') || '<tr><td colspan="4" style="padding:1rem;text-align:center;color:var(--text-4)">No rates yet</td></tr>'}</tbody>
        </table>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  }

  async function _saveExchangeRate() {
    const date = document.getElementById('er-date').value;
    const from_currency = document.getElementById('er-from').value;
    const to_currency = document.getElementById('er-to').value;
    const rate = parseFloat(document.getElementById('er-rate').value);
    if (!date || !from_currency || !to_currency || !rate) { toast('All fields required', 'error'); return; }
    if (from_currency === to_currency) { toast('From and To must differ', 'error'); return; }
    try {
      await api('POST', '/api/exchange-rates', { date, from_currency, to_currency, rate });
      toast('Exchange rate saved');
      document.getElementById('exchange-rate-overlay').remove();
      _showExchangeRateModal();
    } catch(e) { toast('Error: ' + e.message, 'error'); }
  }

  // ── Daily Budget (AXE 6.2) ─────────────────────────────────────────────

  let _dailySortDesc = true;

  async function _renderDailyBudget(parentContainer) {
    const wrapper = document.createElement('div');
    wrapper.id = 'daily-budget-section';
    wrapper.style.cssText = 'margin-top:1.5rem';
    wrapper.innerHTML = `<div style="color:var(--text-3);padding:1rem;text-align:center;font-size:.8rem">${t('budget.loading_daily')}</div>`;
    parentContainer.appendChild(wrapper);

    try {
      const data = await api('GET', `/api/productions/${state.prodId}/budget/daily`);
      const days = data.days || [];
      const averages = data.averages || {};
      if (!days.length) {
        wrapper.innerHTML = `<div style="color:var(--text-4);padding:1rem;font-size:.8rem">${t('budget.no_days')}</div>`;
        return;
      }

      _dailyBudgetData = { days, averages, grandTotal: data.grand_total || 0 };
      _buildDailyBudgetHTML(wrapper);
    } catch (e) {
      wrapper.innerHTML = `<div style="color:var(--red);padding:1rem">Error loading daily budget: ${esc(e.message)}</div>`;
    }
  }

  let _dailyBudgetData = null;

  function _buildDailyBudgetHTML(wrapper) {
    const { days, averages, grandTotal } = _dailyBudgetData;
    const sorted = [...days].sort((a, b) => _dailySortDesc ? b.total - a.total : a.total - b.total);

    // Day type colors and labels
    const typeColors = { game: '#3B82F6', arena: '#22C55E', council: '#EF4444', off: '#6B7280', standard: '#F59E0B' };
    const typeLabels = { game: 'Game', arena: 'Arena', council: 'Council', off: 'Off', standard: 'Standard' };

    // Averages comparison cards
    const avgKeys = Object.keys(averages).sort((a, b) => (averages[b] || 0) - (averages[a] || 0));
    const maxAvg = Math.max(...Object.values(averages), 1);
    const avgHTML = avgKeys.length > 0 ? `
      <div style="margin-bottom:1rem">
        <div style="font-size:.75rem;font-weight:700;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:.5rem">Average Cost by Day Type</div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap">
          ${avgKeys.map(k => {
            const color = typeColors[k] || '#6b7280';
            const pct = (averages[k] / maxAvg * 100).toFixed(0);
            return `
            <div style="flex:1;min-width:120px;background:var(--bg-card);border-radius:8px;padding:.6rem .8rem;border:1px solid var(--border)">
              <div style="display:flex;align-items:center;gap:.35rem;margin-bottom:.35rem">
                <span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block"></span>
                <span style="font-size:.7rem;font-weight:600;color:var(--text-2);text-transform:uppercase">${typeLabels[k] || k}</span>
              </div>
              <div style="font-size:1.1rem;font-weight:700;color:var(--text-0)">${fmtMoney(averages[k])}</div>
              <div style="margin-top:.3rem;height:4px;background:var(--bg-surface);border-radius:2px;overflow:hidden">
                <div style="width:${pct}%;height:100%;background:${color};border-radius:2px"></div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>` : '';

    // Table header
    const deptCols = [
      { key: 'boats', label: 'Boats' },
      { key: 'picture_boats', label: 'PB' },
      { key: 'security_boats', label: 'SB' },
      { key: 'transport', label: 'Transport' },
      { key: 'labour', label: 'Labor' },
      { key: 'guards', label: 'Guards' },
      { key: 'locations', label: 'Loc.' },
      { key: 'fnb', label: 'Catering' },
      { key: 'fuel', label: 'Fuel' },
    ];

    const sortIcon = _dailySortDesc ? '&#9660;' : '&#9650;';

    const tableHTML = `
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
        <table class="budget-table" style="min-width:700px">
          <thead>
            <tr>
              <th style="position:sticky;left:0;z-index:2;background:var(--bg-card)">Date</th>
              <th>Day</th>
              <th>Type</th>
              ${deptCols.map(c => `<th style="text-align:right;font-size:.65rem">${c.label}</th>`).join('')}
              <th style="text-align:right;cursor:pointer" onclick="App._toggleDailySort()">Total ${sortIcon}</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map((d, i) => {
              const color = typeColors[d.day_type] || '#6b7280';
              const maxDay = sorted[0]?.total || 1;
              const barW = (d.total / maxDay * 100).toFixed(1);
              return `<tr style="${i % 2 ? 'background:var(--bg-surface)' : ''}">
                <td style="position:sticky;left:0;z-index:1;background:inherit;font-size:.72rem;white-space:nowrap;color:var(--text-2)">${fmtDate(d.date)}</td>
                <td style="text-align:center;font-size:.72rem;color:var(--text-3)">J${d.day_number || '?'}</td>
                <td style="text-align:center">
                  <span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:.6rem;font-weight:700;color:#fff;background:${color};text-transform:uppercase">${typeLabels[d.day_type] || d.day_type}</span>
                </td>
                ${deptCols.map(c => `<td style="text-align:right;font-size:.7rem;color:var(--text-3)">${d[c.key] > 0 ? fmtMoney(d[c.key]) : '<span style="opacity:.3">-</span>'}</td>`).join('')}
                <td style="text-align:right;font-weight:700;color:var(--text-0);position:relative">
                  <div style="position:absolute;left:0;top:0;bottom:0;width:${barW}%;background:rgba(59,130,246,.08);border-radius:3px"></div>
                  <span style="position:relative">${fmtMoney(d.total)}</span>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot>
            <tr style="font-weight:700;border-top:2px solid var(--border)">
              <td style="position:sticky;left:0;z-index:1;background:var(--bg-card)">TOTAL</td>
              <td></td>
              <td></td>
              ${deptCols.map(c => {
                const sum = days.reduce((s, d) => s + (d[c.key] || 0), 0);
                return `<td style="text-align:right;font-size:.7rem;color:var(--text-2)">${fmtMoney(sum)}</td>`;
              }).join('')}
              <td style="text-align:right;color:var(--green)">${fmtMoney(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>`;

    wrapper.innerHTML = `
      <div class="budget-dept-card">
        <div class="budget-dept-header">
          <span style="font-weight:700;font-size:.85rem;color:var(--text-0)">Cost per Shooting Day</span>
          <span style="font-size:.7rem;color:var(--text-4)">${days.length} days</span>
        </div>
        ${avgHTML}
        ${tableHTML}
      </div>`;
  }

  function _toggleDailySort() {
    _dailySortDesc = !_dailySortDesc;
    const wrapper = document.getElementById('daily-budget-section');
    if (wrapper && _dailyBudgetData) _buildDailyBudgetHTML(wrapper);
  }

  // ── Budget Variance (P5.5) ─────────────────────────────────────────────────

  let _varianceData = null;
  let _varianceExpandedDept = null;

  async function _renderBudgetVariance(parentContainer) {
    const wrapper = document.createElement('div');
    wrapper.id = 'budget-variance-section';
    wrapper.style.cssText = 'margin-top:1.5rem';
    wrapper.innerHTML = '<div style="color:var(--text-3);padding:1rem;text-align:center;font-size:.8rem">Loading variance analysis...</div>';
    parentContainer.appendChild(wrapper);

    try {
      _varianceData = await api('GET', `/api/productions/${state.prodId}/budget/variance`);
      _buildVarianceHTML(wrapper);
    } catch (e) {
      wrapper.innerHTML = `<div style="color:var(--red);padding:1rem">Error loading variance: ${esc(e.message)}</div>`;
    }
  }

  function _varianceColor(pct) {
    const abs = Math.abs(pct);
    if (pct <= 0) return 'var(--green)';
    if (abs <= 10) return '#F59E0B';
    return 'var(--red)';
  }

  function _varianceBadge(pct) {
    const color = _varianceColor(pct);
    const sign = pct > 0 ? '+' : '';
    return `<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:.65rem;font-weight:700;color:#fff;background:${color}">${sign}${pct}%</span>`;
  }

  function _toggleVarianceDept(dept) {
    _varianceExpandedDept = _varianceExpandedDept === dept ? null : dept;
    const wrapper = document.getElementById('budget-variance-section');
    if (wrapper && _varianceData) _buildVarianceHTML(wrapper);
  }

  function _buildVarianceHTML(wrapper) {
    const data = _varianceData;
    const depts = data.departments || [];

    const grandColor = _varianceColor(data.grand_variance_percent);
    const grandSign = data.grand_variance > 0 ? '+' : '';

    const deptRows = depts.map((d, i) => {
      const color = _varianceColor(d.variance_percent);
      const sign = d.variance > 0 ? '+' : '';
      const isExpanded = _varianceExpandedDept === d.department_name;
      const hasActual = d.actual_total > 0;
      const barMax = Math.max(...depts.map(x => Math.max(x.estimated_total, x.actual_total)), 1);
      const estW = (d.estimated_total / barMax * 100).toFixed(1);
      const actW = (d.actual_total / barMax * 100).toFixed(1);

      let drillDown = '';
      if (isExpanded && d.lines && d.lines.length) {
        const lineRows = d.lines.map((l, j) => {
          const lColor = _varianceColor(l.variance_percent);
          const lSign = l.variance > 0 ? '+' : '';
          return `<tr style="${j % 2 ? 'background:var(--bg-surface)' : ''}">
            <td style="font-size:.72rem;color:var(--text-1);padding-left:1.5rem">${esc(l.name)}</td>
            <td style="font-size:.72rem;color:var(--text-3)">${esc(l.detail)}</td>
            <td style="text-align:right;font-size:.72rem;color:var(--text-2)">${fmtMoney(l.estimated)}</td>
            <td style="text-align:right;font-size:.72rem;color:var(--text-2)">${fmtMoney(l.actual)}</td>
            <td style="text-align:right;font-size:.72rem;font-weight:600;color:${lColor}">${lSign}${fmtMoney(Math.abs(l.variance))}</td>
            <td style="text-align:right">${_varianceBadge(l.variance_percent)}</td>
          </tr>`;
        }).join('');
        drillDown = `<tr><td colspan="6" style="padding:0">
          <table class="budget-table" style="margin:0;border:none;width:100%">
            <thead><tr style="background:var(--bg-surface)">
              <th style="font-size:.65rem">Item</th>
              <th style="font-size:.65rem">Detail</th>
              <th style="text-align:right;font-size:.65rem">Estimated</th>
              <th style="text-align:right;font-size:.65rem">Actual</th>
              <th style="text-align:right;font-size:.65rem">Variance</th>
              <th style="text-align:right;font-size:.65rem">%</th>
            </tr></thead>
            <tbody>${lineRows}</tbody>
          </table>
        </td></tr>`;
      }

      return `<tr style="${i % 2 ? 'background:var(--bg-surface)' : ''};cursor:pointer" onclick="App._toggleVarianceDept('${esc(d.department_name)}')">
        <td style="font-weight:600;font-size:.78rem;color:var(--text-0)">
          <span style="display:inline-block;width:12px;font-size:.6rem;color:var(--text-4)">${isExpanded ? '&#9660;' : '&#9654;'}</span>
          ${esc(d.department_name)}
        </td>
        <td style="text-align:right;font-size:.78rem;color:var(--text-2)">${fmtMoney(d.estimated_total)}</td>
        <td style="text-align:right;font-size:.78rem;color:var(--text-2)">${hasActual ? fmtMoney(d.actual_total) : '<span style="opacity:.35">-</span>'}</td>
        <td style="text-align:right;font-size:.78rem;font-weight:600;color:${color}">${hasActual ? sign + fmtMoney(Math.abs(d.variance)) : '<span style="opacity:.35">-</span>'}</td>
        <td style="text-align:right">${hasActual ? _varianceBadge(d.variance_percent) : '<span style="font-size:.65rem;color:var(--text-4)">No data</span>'}</td>
        <td style="width:120px">
          <div style="position:relative;height:16px;background:var(--bg-surface);border-radius:3px;overflow:hidden">
            <div style="position:absolute;left:0;top:0;height:8px;width:${estW}%;background:#3B82F6;border-radius:3px 3px 0 0;opacity:.6" title="Estimated"></div>
            <div style="position:absolute;left:0;bottom:0;height:8px;width:${actW}%;background:${color};border-radius:0 0 3px 3px;opacity:.8" title="Actual"></div>
          </div>
        </td>
      </tr>${drillDown}`;
    }).join('');

    wrapper.innerHTML = `
      <div class="budget-dept-card">
        <div class="budget-dept-header">
          <span style="font-weight:700;font-size:.85rem;color:var(--text-0)">Estimated vs Actual Variance</span>
          <div style="display:flex;align-items:center;gap:.75rem">
            <span style="font-size:.75rem;color:var(--text-3)">Grand: ${fmtMoney(data.grand_estimated)} est. / ${fmtMoney(data.grand_actual)} act.</span>
            <span style="font-size:1rem;font-weight:700;color:${grandColor}">${grandSign}${fmtMoney(Math.abs(data.grand_variance))}</span>
            ${_varianceBadge(data.grand_variance_percent)}
          </div>
        </div>
        <div style="display:flex;gap:.5rem;margin-bottom:.75rem;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:.3rem;font-size:.65rem;color:var(--text-4)">
            <span style="width:10px;height:6px;background:var(--green);border-radius:2px;display:inline-block"></span> Under budget
          </div>
          <div style="display:flex;align-items:center;gap:.3rem;font-size:.65rem;color:var(--text-4)">
            <span style="width:10px;height:6px;background:#F59E0B;border-radius:2px;display:inline-block"></span> 0-10% over
          </div>
          <div style="display:flex;align-items:center;gap:.3rem;font-size:.65rem;color:var(--text-4)">
            <span style="width:10px;height:6px;background:var(--red);border-radius:2px;display:inline-block"></span> >10% over
          </div>
        </div>
        <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
          <table class="budget-table" style="min-width:600px">
            <thead>
              <tr>
                <th>Department</th>
                <th style="text-align:right">Estimated</th>
                <th style="text-align:right">Actual</th>
                <th style="text-align:right">Variance</th>
                <th style="text-align:right">%</th>
                <th style="text-align:center;font-size:.65rem">Est. vs Act.</th>
              </tr>
            </thead>
            <tbody>
              ${deptRows}
              <tr style="font-weight:700;border-top:2px solid var(--border)">
                <td style="color:var(--text-0)">TOTAL</td>
                <td style="text-align:right;color:var(--text-1)">${fmtMoney(data.grand_estimated)}</td>
                <td style="text-align:right;color:var(--text-1)">${fmtMoney(data.grand_actual)}</td>
                <td style="text-align:right;color:${grandColor}">${grandSign}${fmtMoney(Math.abs(data.grand_variance))}</td>
                <td style="text-align:right">${_varianceBadge(data.grand_variance_percent)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>`;
  }

  // ── Budget History (AXE 6.3) ──────────────────────────────────────────────

  let _snapshotCompareA = null;
  let _snapshotCompareB = null;

  async function _renderBudgetHistory(parentContainer) {
    const wrapper = document.createElement('div');
    wrapper.id = 'budget-history-section';
    wrapper.style.cssText = 'margin-top:1.5rem';
    wrapper.innerHTML = '<div style="color:var(--text-3);padding:1rem;text-align:center;font-size:.8rem">Loading budget history...</div>';
    parentContainer.appendChild(wrapper);

    try {
      const [snapshots, priceLog] = await Promise.all([
        api('GET', `/api/productions/${state.prodId}/budget/snapshots`),
        api('GET', `/api/productions/${state.prodId}/budget/price-log?limit=50`),
      ]);
      _buildBudgetHistoryHTML(wrapper, snapshots, priceLog);
    } catch (e) {
      wrapper.innerHTML = `<div style="color:var(--red);padding:1rem">Error loading budget history: ${esc(e.message)}</div>`;
    }
  }

  function _buildBudgetHistoryHTML(wrapper, snapshots, priceLog) {
    const triggerIcons = { lock: '\u{1F512}', manual: '\u{1F4F8}', scheduled: '\u{23F0}' };
    const triggerLabels = { lock: 'Auto (lock)', manual: 'Manual', scheduled: 'Scheduled' };

    // Snapshot list
    const snapshotRows = snapshots.length ? snapshots.map((s, i) => {
      const icon = triggerIcons[s.trigger_type] || '\u{1F4CA}';
      const label = triggerLabels[s.trigger_type] || s.trigger_type;
      const d = new Date(s.created_at + 'Z');
      const timeStr = d.toLocaleDateString('en-GB', { day:'2-digit', month:'short' }) + ' ' +
                      d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
      return `<tr style="${i % 2 ? 'background:var(--bg-surface)' : ''}">
        <td style="font-size:.72rem;color:var(--text-2);white-space:nowrap">${timeStr}</td>
        <td><span style="font-size:.65rem;padding:2px 6px;border-radius:4px;background:${s.trigger_type === 'lock' ? 'rgba(59,130,246,.12)' : 'rgba(168,85,247,.12)'};color:${s.trigger_type === 'lock' ? '#3B82F6' : '#A855F7'}">${icon} ${esc(label)}</span></td>
        <td style="font-size:.72rem;color:var(--text-3);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(s.trigger_detail || '')}">${esc(s.trigger_detail || '-')}</td>
        <td style="font-size:.72rem;color:var(--text-3)">${esc(s.user_nickname || '-')}</td>
        <td style="text-align:right;font-weight:600;color:var(--green);font-size:.8rem">${fmtMoney(s.grand_total_estimate)}</td>
        <td style="text-align:center">
          <label style="display:flex;align-items:center;justify-content:center;gap:2px;cursor:pointer;font-size:.65rem;color:var(--text-4)">
            <input type="radio" name="snap-a" value="${s.id}" ${_snapshotCompareA == s.id ? 'checked' : ''} onchange="App._setSnapshotCompare('a',${s.id})"> A
          </label>
        </td>
        <td style="text-align:center">
          <label style="display:flex;align-items:center;justify-content:center;gap:2px;cursor:pointer;font-size:.65rem;color:var(--text-4)">
            <input type="radio" name="snap-b" value="${s.id}" ${_snapshotCompareB == s.id ? 'checked' : ''} onchange="App._setSnapshotCompare('b',${s.id})"> B
          </label>
        </td>
      </tr>`;
    }).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--text-4);padding:1rem;font-size:.8rem">No snapshots yet. Snapshots are created automatically when you lock days.</td></tr>';

    // Price change log
    const priceRows = priceLog.length ? priceLog.map((p, i) => {
      const d = new Date(p.created_at + 'Z');
      const timeStr = d.toLocaleDateString('en-GB', { day:'2-digit', month:'short' }) + ' ' +
                      d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
      const diff = (p.new_value || 0) - (p.old_value || 0);
      const diffColor = diff > 0 ? 'var(--red)' : diff < 0 ? 'var(--green)' : 'var(--text-3)';
      const diffSign = diff > 0 ? '+' : '';
      return `<tr style="${i % 2 ? 'background:var(--bg-surface)' : ''}">
        <td style="font-size:.72rem;color:var(--text-2);white-space:nowrap">${timeStr}</td>
        <td style="font-size:.72rem;color:var(--text-3)">${esc(p.user_nickname || '-')}</td>
        <td><span style="font-size:.6rem;font-weight:700;padding:2px 5px;border-radius:3px;background:rgba(148,163,184,.12);color:var(--text-3);text-transform:uppercase">${esc(p.entity_type)}</span></td>
        <td style="font-size:.75rem;color:var(--text-1)">${esc(p.entity_name || '-')}</td>
        <td style="font-size:.7rem;color:var(--text-3)">${esc(p.field_changed)}</td>
        <td style="text-align:right;font-size:.75rem;color:var(--text-3)">${p.old_value != null ? fmtMoney(p.old_value) : '-'}</td>
        <td style="text-align:right;font-size:.75rem;font-weight:600;color:var(--text-1)">${fmtMoney(p.new_value)}</td>
        <td style="text-align:right;font-size:.72rem;font-weight:600;color:${diffColor}">${diffSign}${fmtMoney(Math.abs(diff))}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="8" style="text-align:center;color:var(--text-4);padding:1rem;font-size:.8rem">No price changes recorded yet.</td></tr>';

    wrapper.innerHTML = `
      <div class="budget-dept-card">
        <div class="budget-dept-header" style="flex-wrap:wrap;gap:.5rem">
          <span style="font-weight:700;font-size:.85rem;color:var(--text-0)">Budget History</span>
          <div style="display:flex;gap:.35rem;align-items:center">
            <button class="btn btn-sm" onclick="App._createManualSnapshot()" style="font-size:.7rem;display:flex;align-items:center;gap:.3rem;background:var(--bg-surface);border:1px solid var(--border);color:var(--text-1)">
              <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
              Snapshot
            </button>
            <button class="btn btn-sm" id="compare-snapshots-btn" onclick="App._compareSnapshots()" style="font-size:.7rem;display:none;align-items:center;gap:.3rem;background:#3B82F6;color:#fff;border:none">
              Compare A vs B
            </button>
          </div>
        </div>

        <!-- Tabs -->
        <div style="display:flex;gap:0;margin-bottom:.5rem;border-bottom:1px solid var(--border)">
          <button class="btn btn-sm" id="bh-tab-snapshots" onclick="App._setBudgetHistoryTab('snapshots')" style="border:none;border-bottom:2px solid #3B82F6;border-radius:0;font-size:.72rem;font-weight:600;color:#3B82F6;padding:.4rem .8rem">Snapshots (${snapshots.length})</button>
          <button class="btn btn-sm" id="bh-tab-pricelog" onclick="App._setBudgetHistoryTab('pricelog')" style="border:none;border-bottom:2px solid transparent;border-radius:0;font-size:.72rem;font-weight:600;color:var(--text-4);padding:.4rem .8rem">Price Log (${priceLog.length})</button>
        </div>

        <!-- Snapshots tab -->
        <div id="bh-panel-snapshots">
          <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
            <table class="budget-table" style="min-width:600px">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Trigger</th>
                  <th>Detail</th>
                  <th>By</th>
                  <th style="text-align:right">Total Estimate</th>
                  <th style="text-align:center;width:30px">A</th>
                  <th style="text-align:center;width:30px">B</th>
                </tr>
              </thead>
              <tbody>${snapshotRows}</tbody>
            </table>
          </div>
        </div>

        <!-- Price Log tab (hidden by default) -->
        <div id="bh-panel-pricelog" style="display:none">
          <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
            <table class="budget-table" style="min-width:650px">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>By</th>
                  <th>Type</th>
                  <th>Entity</th>
                  <th>Field</th>
                  <th style="text-align:right">Old</th>
                  <th style="text-align:right">New</th>
                  <th style="text-align:right">Diff</th>
                </tr>
              </thead>
              <tbody>${priceRows}</tbody>
            </table>
          </div>
        </div>

        <!-- Comparison result container -->
        <div id="bh-comparison-result"></div>
      </div>`;
  }

  function _setBudgetHistoryTab(tab) {
    const tabs = ['snapshots', 'pricelog'];
    tabs.forEach(t => {
      const panel = document.getElementById(`bh-panel-${t}`);
      const btn = document.getElementById(`bh-tab-${t}`);
      if (panel) panel.style.display = t === tab ? '' : 'none';
      if (btn) {
        btn.style.borderBottomColor = t === tab ? '#3B82F6' : 'transparent';
        btn.style.color = t === tab ? '#3B82F6' : 'var(--text-4)';
      }
    });
  }

  function _setSnapshotCompare(slot, id) {
    if (slot === 'a') _snapshotCompareA = id;
    else _snapshotCompareB = id;
    const btn = document.getElementById('compare-snapshots-btn');
    if (btn) btn.style.display = (_snapshotCompareA && _snapshotCompareB) ? 'flex' : 'none';
  }

  async function _createManualSnapshot() {
    const note = prompt('Snapshot note (optional):');
    if (note === null) return;
    try {
      await api('POST', `/api/productions/${state.prodId}/budget/snapshots`, { note });
      toast('Budget snapshot created', 'success');
      renderBudget();
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    }
  }

  async function _compareSnapshots() {
    if (!_snapshotCompareA || !_snapshotCompareB) {
      toast('Select two snapshots (A and B) to compare', 'info');
      return;
    }
    const container = document.getElementById('bh-comparison-result');
    if (!container) return;
    container.innerHTML = `<div style="padding:1rem;text-align:center;color:var(--text-3);font-size:.8rem">${t('budget.comparing')}</div>`;

    try {
      const result = await api('GET', `/api/productions/${state.prodId}/budget/snapshots/compare?a=${_snapshotCompareA}&b=${_snapshotCompareB}`);
      _buildComparisonHTML(container, result);
    } catch (e) {
      container.innerHTML = `<div style="color:var(--red);padding:1rem">${esc(e.message)}</div>`;
    }
  }

  function _buildComparisonHTML(container, data) {
    const sa = data.snapshot_a;
    const sb = data.snapshot_b;
    const totalDiff = data.total_diff;
    const totalColor = totalDiff > 0 ? 'var(--red)' : totalDiff < 0 ? 'var(--green)' : 'var(--text-3)';
    const totalSign = totalDiff > 0 ? '+' : '';

    const fmtSnapDate = (s) => {
      const d = new Date(s.created_at + 'Z');
      return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
    };

    const deptRows = data.departments.map((d, i) => {
      const diffColor = d.difference > 0 ? 'var(--red)' : d.difference < 0 ? 'var(--green)' : 'var(--text-3)';
      const diffSign = d.difference > 0 ? '+' : '';
      const absDiff = Math.abs(d.difference);
      return `<tr style="${i % 2 ? 'background:var(--bg-surface)' : ''}">
        <td style="font-weight:600;font-size:.75rem;color:var(--text-1)">${esc(d.department)}</td>
        <td style="text-align:right;font-size:.75rem;color:var(--text-2)">${fmtMoney(d.snapshot_a)}</td>
        <td style="text-align:right;font-size:.75rem;color:var(--text-2)">${fmtMoney(d.snapshot_b)}</td>
        <td style="text-align:right;font-size:.75rem;font-weight:600;color:${diffColor}">${diffSign}${fmtMoney(absDiff)}</td>
        <td style="text-align:right;font-size:.72rem;color:${diffColor}">${d.change_pct > 0 ? '+' : ''}${d.change_pct}%</td>
      </tr>`;
    }).join('');

    const lineRows = data.line_changes.slice(0, 30).map((l, i) => {
      const diffColor = l.difference > 0 ? 'var(--red)' : l.difference < 0 ? 'var(--green)' : 'var(--text-3)';
      const diffSign = l.difference > 0 ? '+' : '';
      return `<tr style="${i % 2 ? 'background:var(--bg-surface)' : ''}">
        <td style="font-size:.65rem;color:var(--text-3);text-transform:uppercase">${esc(l.department)}</td>
        <td style="font-size:.75rem;color:var(--text-1)">${esc(l.name)}</td>
        <td style="text-align:right;font-size:.75rem;color:var(--text-2)">${fmtMoney(l.snapshot_a)}</td>
        <td style="text-align:right;font-size:.75rem;color:var(--text-2)">${fmtMoney(l.snapshot_b)}</td>
        <td style="text-align:right;font-size:.75rem;font-weight:600;color:${diffColor}">${diffSign}${fmtMoney(Math.abs(l.difference))}</td>
      </tr>`;
    }).join('');

    container.innerHTML = `
      <div style="margin-top:1rem;border:1px solid var(--border);border-radius:8px;padding:.75rem">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem;flex-wrap:wrap;gap:.5rem">
          <div style="font-weight:700;font-size:.82rem;color:var(--text-0)">Snapshot Comparison</div>
          <div style="font-size:1.1rem;font-weight:700;color:${totalColor}">${totalSign}${fmtMoney(Math.abs(totalDiff))}</div>
        </div>

        <div style="display:flex;gap:.5rem;margin-bottom:.75rem;flex-wrap:wrap">
          <div style="flex:1;min-width:140px;padding:.5rem;border-radius:6px;background:rgba(59,130,246,.06);border:1px solid rgba(59,130,246,.15)">
            <div style="font-size:.6rem;font-weight:700;color:#3B82F6;text-transform:uppercase;margin-bottom:.2rem">Snapshot A</div>
            <div style="font-size:.82rem;font-weight:600;color:var(--text-1)">${fmtMoney(sa.grand_total_estimate)}</div>
            <div style="font-size:.65rem;color:var(--text-3)">${fmtSnapDate(sa)} - ${esc(sa.trigger_detail || sa.trigger_type)}</div>
          </div>
          <div style="flex:1;min-width:140px;padding:.5rem;border-radius:6px;background:rgba(168,85,247,.06);border:1px solid rgba(168,85,247,.15)">
            <div style="font-size:.6rem;font-weight:700;color:#A855F7;text-transform:uppercase;margin-bottom:.2rem">Snapshot B</div>
            <div style="font-size:.82rem;font-weight:600;color:var(--text-1)">${fmtMoney(sb.grand_total_estimate)}</div>
            <div style="font-size:.65rem;color:var(--text-3)">${fmtSnapDate(sb)} - ${esc(sb.trigger_detail || sb.trigger_type)}</div>
          </div>
        </div>

        <div style="font-size:.72rem;font-weight:700;color:var(--text-3);text-transform:uppercase;margin-bottom:.3rem">By Department</div>
        <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;margin-bottom:.75rem">
          <table class="budget-table">
            <thead><tr>
              <th>Department</th>
              <th style="text-align:right">A</th>
              <th style="text-align:right">B</th>
              <th style="text-align:right">Diff</th>
              <th style="text-align:right">%</th>
            </tr></thead>
            <tbody>${deptRows}</tbody>
          </table>
        </div>

        ${lineRows ? `
        <div style="font-size:.72rem;font-weight:700;color:var(--text-3);text-transform:uppercase;margin-bottom:.3rem">Changed Line Items${data.line_changes.length > 30 ? ` (showing 30 of ${data.line_changes.length})` : ''}</div>
        <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
          <table class="budget-table">
            <thead><tr>
              <th>Dept</th>
              <th>Item</th>
              <th style="text-align:right">A</th>
              <th style="text-align:right">B</th>
              <th style="text-align:right">Diff</th>
            </tr></thead>
            <tbody>${lineRows}</tbody>
          </table>
        </div>` : ''}
      </div>`;
  }

  // ── Global Budget Export (KLAS7_BUDGET_YYMMDD.xlsx) ──────────────────────

  async function _asyncExport(asyncUrl, fallbackUrl, dateFrom, dateTo) {
    // Append date params to URLs
    const params = [];
    if (dateFrom) params.push(`from=${dateFrom}`);
    if (dateTo) params.push(`to=${dateTo}`);
    const qs = params.length ? '?' + params.join('&') : '';

    try {
      toast('Export in progress...', 'info');
      const { job_id } = await api('POST', asyncUrl + qs);
      // Poll for completion
      const poll = async () => {
        const status = await api('GET', `/api/exports/${job_id}`);
        if (status.status === 'done') {
          toast('Export ready - downloading', 'success');
          authDownload(status.download_url);
        } else if (status.status === 'error') {
          toast('Export failed: ' + (status.error || 'unknown'), 'error');
        } else {
          setTimeout(poll, 2000);
        }
      };
      setTimeout(poll, 2000);
    } catch (e) {
      // Fallback to sync export
      SL._exportWithDates(fallbackUrl, dateFrom, dateTo);
    }
  }

  function budgetExportXlsx() {
    SL.openExportDateModal('budget', 'Budget (XLSX)', [
      { key: 'xlsx', label: 'XLSX' },
    ], (from, to, fmt) => {
      _asyncExport(
        `/api/productions/${state.prodId}/export/budget-global/async`,
        `/api/productions/${state.prodId}/export/budget-global`,
        from, to
      );
    });
  }

  function budgetExportPdf() {
    SL.openExportDateModal('budget', 'Budget (PDF)', [
      { key: 'pdf', label: 'PDF' },
    ], (from, to, fmt) => {
      SL._exportWithDates(`/api/productions/${state.prodId}/export/budget-pdf`, from, to);
    });
  }

  function dailyReportPdf() {
    SL.openExportDateModal('budget', 'Daily Report', [
      { key: 'pdf', label: 'PDF' },
    ], (from, to, fmt) => {
      SL._exportWithDates(`/api/productions/${state.prodId}/export/daily-report-pdf`, from, to);
    });
  }

  function vendorSummaryExport() {
    SL.openExportDateModal('budget', 'Vendor Summary', [
      { key: 'csv', label: 'CSV' }, { key: 'pdf', label: 'PDF' },
    ], (from, to, fmt) => {
      const base = fmt === 'pdf'
        ? `/api/productions/${state.prodId}/export/vendor-summary-pdf`
        : `/api/productions/${state.prodId}/export/vendor-summary`;
      SL._exportWithDates(base, from, to);
    });
  }

  function budgetExportXlsxEnriched() {
    window.location.href = `/api/productions/${state.prodId}/export/budget-xlsx`;
  }

  function logisticsExportXlsx() {
    SL.openExportDateModal('budget', 'Logistics (XLSX)', [
      { key: 'xlsx', label: 'XLSX' },
    ], (from, to, fmt) => {
      _asyncExport(
        `/api/productions/${state.prodId}/export/logistics/async`,
        `/api/productions/${state.prodId}/export/logistics`,
        from, to
      );
    });
  }



// Register module functions on App
Object.assign(window.App, {
  _asyncExport,
  _buildBudgetHistoryHTML,
  _buildComparisonHTML,
  _buildDailyBudgetHTML,
  _buildVarianceHTML,
  _changeBudgetCurrency,
  _compareSnapshots,
  _createManualSnapshot,
  _renderBudgetHistory,
  _renderBudgetVariance,
  _renderDailyBudget,
  _saveExchangeRate,
  _setBudgetHistoryTab,
  _setSnapshotCompare,
  _showExchangeRateModal,
  _toggleDailySort,
  _toggleVarianceDept,
  budgetExportPdf,
  budgetExportXlsx,
  budgetExportXlsxEnriched,
  dailyReportPdf,
  logisticsExportXlsx,
  renderBudget,
  rowFigeAmount,
  vendorSummaryExport,
});
