/* DASHBOARD VIEW — ES6 Module */
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
  //  DASHBOARD VIEW
  // ═══════════════════════════════════════════════════════════

  async function renderDashboard() {
    const container = $('dashboard-content');
    if (!container) return;
    container.innerHTML = '<div style="color:var(--text-3);padding:2rem;text-align:center">Loading dashboard...</div>';

    try {
      const data = await api('GET', `/api/productions/${state.prodId}/dashboard`);
      const { departments, total_estimate, total_actual, kpis, alerts, burn_data } = data;

      const deptNames = {
        locations: 'Locations', boats: 'Boats', picture_boats: 'Picture Boats',
        security_boats: 'Security Boats', transport: 'Transport',
        fuel: 'Fuel', labour: 'Labor', guards: 'Guards (Camp)', fnb: 'Catering'
      };
      const deptColors = {
        locations: '#22C55E', boats: '#3B82F6', picture_boats: '#8B5CF6',
        security_boats: '#EF4444', transport: '#22C55E',
        fuel: '#F59E0B', labour: '#F59E0B', guards: '#06B6D4', fnb: '#F97316'
      };

      // --- KPI cards (with projected total) ---
      const projectedTotal = kpis.projected_total || 0;
      const projOver = projectedTotal > total_estimate;
      const kpiHTML = `
        <div class="dash-kpis">
          <div class="dash-kpi">
            <div class="dash-kpi-value">${fmtMoney(total_estimate)}</div>
            <div class="dash-kpi-label">Total Budget Estimate</div>
          </div>
          <div class="dash-kpi">
            <div class="dash-kpi-value">${fmtMoney(total_actual)}</div>
            <div class="dash-kpi-label">Total Actual</div>
          </div>
          <div class="dash-kpi ${projOver ? 'dash-kpi-projected' : ''}">
            <div class="dash-kpi-value">${fmtMoney(projectedTotal)}</div>
            <div class="dash-kpi-label">Projected Total</div>
          </div>
          <div class="dash-kpi">
            <div class="dash-kpi-value">${kpis.days_elapsed} / ${kpis.shooting_days_total}</div>
            <div class="dash-kpi-label">Days Elapsed</div>
          </div>
          <div class="dash-kpi">
            <div class="dash-kpi-value">${kpis.days_remaining}</div>
            <div class="dash-kpi-label">Days Remaining</div>
          </div>
          <div class="dash-kpi">
            <div class="dash-kpi-value">${fmtMoney(kpis.burn_rate_per_day)}</div>
            <div class="dash-kpi-label">Burn Rate / Day</div>
          </div>
          <div class="dash-kpi">
            <div class="dash-kpi-value">${kpis.fuel_liters?.toLocaleString() || 0} L</div>
            <div class="dash-kpi-label">Total Fuel</div>
          </div>
        </div>`;

      // --- Budget Alerts (75% caution, 90% warning, 100%+ over) ---
      let alertsHTML = '';
      if (alerts.length > 0) {
        const sortedAlerts = [...alerts].sort((a, b) => b.pct - a.pct);
        alertsHTML = `<div class="dash-alerts">
          <h3 style="color:var(--text-1);font-size:.85rem;margin-bottom:.5rem">Budget Alerts</h3>
          ${sortedAlerts.map(a => {
            let cls = 'dash-alert-caution';
            let icon = '!';
            if (a.type === 'over_budget') { cls = 'dash-alert-red'; icon = '!!'; }
            else if (a.type === 'warning') { cls = 'dash-alert-amber'; icon = '!'; }
            return `
            <div class="dash-alert ${cls}">
              <span class="dash-alert-icon">${icon}</span>
              <span>${esc(a.msg)}</span>
            </div>`;
          }).join('')}
        </div>`;
      }

      // --- Scheduling Conflict Alerts (AXE 7.3) ---
      let conflictAlertsHTML = '';
      if (_alertsData.length > 0) {
        conflictAlertsHTML = `<div class="dash-alerts dash-conflict-alerts">
          <h3 style="color:var(--text-1);font-size:.85rem;margin-bottom:.5rem;display:flex;align-items:center;gap:.4rem">
            Scheduling Conflicts
            <span class="dash-conflict-count">${_alertsData.length}</span>
          </h3>
          ${_alertsData.slice(0, 5).map(a => {
            let cls = 'dash-alert-caution';
            let icon = 'i';
            if (a.severity === 'danger') { cls = 'dash-alert-red'; icon = '!!'; }
            else if (a.severity === 'warning') { cls = 'dash-alert-amber'; icon = '!'; }
            return `
            <div class="dash-alert ${cls}">
              <span class="dash-alert-icon">${icon}</span>
              <span>${esc(a.msg)}</span>
            </div>`;
          }).join('')}
          ${_alertsData.length > 5 ? `<div style="text-align:center;padding:.3rem;font-size:.75rem;color:var(--text-3);cursor:pointer" onclick="App.toggleAlertsPanel()">+ ${_alertsData.length - 5} more - View all</div>` : ''}
        </div>`;
      }

      // --- Stacked bar chart: Estimated vs Actual by department ---
      const maxBudget = Math.max(...Object.values(departments).map(d => Math.max(d.estimate || 0, d.actual || 0)), 1);
      const stackedBarsHTML = Object.entries(departments).map(([key, dept]) => {
        const name = deptNames[key] || key;
        const color = deptColors[key] || '#6b7280';
        const est = dept.estimate || 0;
        const act = dept.actual || 0;
        const estW = (est / maxBudget * 100).toFixed(1);
        const actW = (act / maxBudget * 100).toFixed(1);
        const variance = dept.variance_pct || 0;
        const varCls = variance > 0 ? 'var-positive' : variance < 0 ? 'var-negative' : 'var-zero';
        const varLabel = variance > 0 ? `+${variance}%` : `${variance}%`;
        return `
          <div class="dash-stacked-row">
            <div class="dash-stacked-label">${name}</div>
            <div class="dash-stacked-bars">
              <div class="dash-stacked-bar-est" style="width:${estW}%;background:${color}"></div>
              <div class="dash-stacked-bar-act" style="width:${actW}%;background:${color}"></div>
            </div>
            <div class="dash-stacked-amounts">
              <strong>${fmtMoney(act)}</strong><br>
              <span>/ ${fmtMoney(est)}</span>
            </div>
            <div class="dash-dept-variance ${varCls}">${varLabel}</div>
          </div>`;
      }).join('');

      const stackedHTML = `
        <div class="dash-stacked-chart">
          <h3>Estimated vs Actual by Department</h3>
          ${stackedBarsHTML}
          <div class="dash-stacked-legend">
            <span class="dash-legend-est">Estimated</span>
            <span class="dash-legend-act">Actual</span>
          </div>
        </div>`;

      // --- Burn rate SVG chart with projection ---
      let burnHTML = '';
      if (burn_data && burn_data.length > 1) {
        const svgW = 600, svgH = 160, padL = 50, padR = 15, padT = 15, padB = 25;
        const chartW = svgW - padL - padR;
        const chartH = svgH - padT - padB;
        const maxY = Math.max(total_estimate, ...burn_data.map(d => d.cumulative)) * 1.1;
        const n = burn_data.length;

        // Build actual line points
        const actualPts = [];
        const projPts = [];
        let lastActualIdx = -1;

        burn_data.forEach((d, i) => {
          const x = padL + (i / (n - 1)) * chartW;
          const y = padT + chartH - (d.cumulative / maxY) * chartH;
          if (d.is_actual) {
            actualPts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
            lastActualIdx = i;
          }
          if (!d.is_actual || i === lastActualIdx) {
            projPts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
          }
        });
        // Ensure projection starts from last actual
        if (lastActualIdx >= 0 && lastActualIdx < n - 1) {
          const x0 = padL + (lastActualIdx / (n - 1)) * chartW;
          const y0 = padT + chartH - (burn_data[lastActualIdx].cumulative / maxY) * chartH;
          if (!projPts.length || projPts[0] !== `${x0.toFixed(1)},${y0.toFixed(1)}`) {
            projPts.unshift(`${x0.toFixed(1)},${y0.toFixed(1)}`);
          }
        }

        // Budget line Y
        const budgetY = padT + chartH - (total_estimate / maxY) * chartH;

        // Date labels (first, middle, last)
        const dateLabels = [];
        if (n >= 1) dateLabels.push({ i: 0, d: burn_data[0].date });
        if (n >= 3) dateLabels.push({ i: Math.floor(n / 2), d: burn_data[Math.floor(n / 2)].date });
        if (n >= 2) dateLabels.push({ i: n - 1, d: burn_data[n - 1].date });

        // Y axis labels
        const ySteps = 4;
        const yLabels = [];
        for (let s = 0; s <= ySteps; s++) {
          const val = (maxY / ySteps) * s;
          const y = padT + chartH - (val / maxY) * chartH;
          yLabels.push({ y, label: fmtMoney(val) });
        }

        burnHTML = `
        <div class="dash-burn-chart">
          <h3>Burn Rate & Projection</h3>
          <div class="dash-burn-svg-wrap">
            <svg viewBox="0 0 ${svgW} ${svgH}" preserveAspectRatio="xMidYMid meet">
              <!-- Grid lines -->
              ${yLabels.map(yl => `
                <line x1="${padL}" y1="${yl.y.toFixed(1)}" x2="${svgW - padR}" y2="${yl.y.toFixed(1)}" stroke="var(--border)" stroke-width="0.5"/>
                <text x="${padL - 4}" y="${(yl.y + 3).toFixed(1)}" text-anchor="end" fill="var(--text-4)" font-size="8">${yl.label}</text>
              `).join('')}

              <!-- Budget line (dashed) -->
              <line x1="${padL}" y1="${budgetY.toFixed(1)}" x2="${svgW - padR}" y2="${budgetY.toFixed(1)}" stroke="var(--amber)" stroke-width="1.5" stroke-dasharray="6,3"/>
              <text x="${svgW - padR}" y="${(budgetY - 4).toFixed(1)}" text-anchor="end" fill="var(--amber)" font-size="8" font-weight="600">Budget</text>

              <!-- Projection line (dashed) -->
              ${projPts.length > 1 ? `<polyline points="${projPts.join(' ')}" fill="none" stroke="var(--text-4)" stroke-width="1.5" stroke-dasharray="4,3"/>` : ''}

              <!-- Actual line (solid) -->
              ${actualPts.length > 1 ? `<polyline points="${actualPts.join(' ')}" fill="none" stroke="var(--blue)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` : ''}

              <!-- Area under actual -->
              ${actualPts.length > 1 ? `<polygon points="${padL},${(padT + chartH).toFixed(1)} ${actualPts.join(' ')} ${actualPts[actualPts.length - 1].split(',')[0]},${(padT + chartH).toFixed(1)}" fill="var(--blue)" opacity="0.08"/>` : ''}

              <!-- Date labels -->
              ${dateLabels.map(dl => {
                const x = padL + (dl.i / Math.max(n - 1, 1)) * chartW;
                return `<text x="${x.toFixed(1)}" y="${(svgH - 4).toFixed(1)}" text-anchor="middle" fill="var(--text-4)" font-size="8">${dl.d.slice(5)}</text>`;
              }).join('')}
            </svg>
          </div>
          <div class="dash-burn-legend">
            <div class="dash-burn-legend-item">
              <div class="dash-burn-legend-line" style="background:var(--blue)"></div>
              <span>Actual spend</span>
            </div>
            <div class="dash-burn-legend-item">
              <div class="dash-burn-legend-line" style="background:var(--text-4);opacity:.6"></div>
              <span>Projected</span>
            </div>
            <div class="dash-burn-legend-item">
              <div class="dash-burn-budget-line" style="border-color:var(--amber)"></div>
              <span>Total budget</span>
            </div>
          </div>
        </div>`;
      }

      // --- Department budget bars (with variance + alert colors) ---
      const barsHTML = Object.entries(departments).map(([key, dept]) => {
        const name = deptNames[key] || key;
        const color = deptColors[key] || '#6b7280';
        const est = dept.estimate || 0;
        const act = dept.actual || 0;
        const pct = est > 0 ? Math.min(Math.round(act / est * 100), 150) : 0;
        const barWidth = Math.min(pct, 100);
        const overBudget = pct > 100;
        const variance = dept.variance_pct || 0;
        const varCls = variance > 0 ? 'var-positive' : variance < 0 ? 'var-negative' : 'var-zero';
        const varLabel = variance > 0 ? `+${variance}%` : `${variance}%`;
        // Color coding: >100 red, >90 orange, >75 amber
        let pctCls = '';
        let barColor = color;
        if (pct > 100) { pctCls = 'dash-over'; barColor = 'var(--red)'; }
        else if (pct >= 90) { pctCls = 'dash-warning'; barColor = '#f97316'; }
        else if (pct >= 75) { pctCls = 'dash-caution'; barColor = 'var(--amber)'; }
        return `
          <div class="dash-dept-row">
            <div class="dash-dept-name" style="color:${color}">${name}</div>
            <div class="dash-dept-bar-wrap">
              <div class="dash-dept-bar" style="width:${barWidth}%;background:${barColor}"></div>
            </div>
            <div class="dash-dept-values">
              <span class="dash-dept-actual">${fmtMoney(act)}</span>
              <span class="dash-dept-est">/ ${fmtMoney(est)}</span>
              <span class="dash-dept-pct ${pctCls}">${pct}%</span>
              <span class="dash-dept-variance ${varCls}">${varLabel}</span>
            </div>
          </div>`;
      }).join('');

      // --- Next arena ---
      const arenaHTML = kpis.next_arena
        ? `<div style="margin-top:1rem;padding:.5rem .8rem;background:var(--bg-card);border-radius:8px;border:1px solid var(--border)">
            <span style="color:var(--text-3);font-size:.75rem">Next Arena:</span>
            <strong style="color:var(--amber);margin-left:.4rem">${fmtDateLong(kpis.next_arena)}</strong>
          </div>`
        : '';

      // --- Daily Reports section ---
      const today = new Date().toISOString().slice(0, 10);
      const dailyReportHTML = `
        <div class="dash-daily-reports" style="margin-top:1.2rem;padding:1rem;background:var(--bg-card);border-radius:8px;border:1px solid var(--border)">
          <h3 style="color:var(--text-1);font-size:.85rem;margin-bottom:.6rem">Daily Production Report</h3>
          <div style="display:flex;gap:.6rem;align-items:center;flex-wrap:wrap">
            <input type="date" id="daily-report-date" value="${today}"
              style="padding:.35rem .5rem;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-1);font-size:.8rem" />
            <button id="btn-daily-report-preview" class="btn btn-sm"
              style="font-size:.75rem;padding:.35rem .7rem">Preview</button>
            <button id="btn-daily-report-pdf" class="btn btn-sm btn-primary"
              style="font-size:.75rem;padding:.35rem .7rem">Download PDF</button>
          </div>
          <div id="daily-report-preview" style="margin-top:.6rem;font-size:.8rem;color:var(--text-2)"></div>
        </div>`;

      container.innerHTML = `
        ${kpiHTML}
        ${arenaHTML}
        ${alertsHTML}
        ${conflictAlertsHTML}
        ${stackedHTML}
        ${burnHTML}
        <div class="dash-depts">
          <h3 style="color:var(--text-1);font-size:.85rem;margin-bottom:.5rem">Budget by Department</h3>
          ${barsHTML}
        </div>
        ${dailyReportHTML}`;

      // Wire up daily report buttons
      const dateInput = $('daily-report-date');
      const previewBox = $('daily-report-preview');

      const btnPreview = $('btn-daily-report-preview');
      if (btnPreview) btnPreview.onclick = async () => {
        const d = dateInput.value;
        if (!d) return;
        previewBox.innerHTML = '<span style="color:var(--text-3)">Loading...</span>';
        try {
          const info = await api('GET', `/api/productions/${state.prodId}/reports/daily/data?date=${d}`);
          const r = info.resources;
          const dayLabel = info.day_number ? `Day ${info.day_number}` : 'No shooting day';
          const loc = info.location || 'N/A';
          previewBox.innerHTML = `
            <div style="display:flex;gap:1rem;flex-wrap:wrap;align-items:center;margin-top:.4rem">
              <span><strong>${dayLabel}</strong> - ${esc(loc)}</span>
              <span>Boats: <strong>${r.boats}</strong></span>
              <span>PB: <strong>${r.picture_boats}</strong></span>
              <span>SB: <strong>${r.security_boats}</strong></span>
              <span>Transport: <strong>${r.transport}</strong></span>
              <span>Personnel: <strong>${r.personnel}</strong></span>
              <span>Guards: <strong>${r.guards}</strong></span>
              <span>Fuel: <strong>${r.fuel_entries}</strong></span>
              <span style="color:var(--blue)">Total: <strong>${info.total_resources}</strong> resources</span>
            </div>`;
        } catch (err) {
          previewBox.innerHTML = `<span style="color:var(--red)">${esc(err.message)}</span>`;
        }
      };

      const btnPdf = $('btn-daily-report-pdf');
      if (btnPdf) btnPdf.onclick = () => {
        const d = dateInput.value;
        if (!d) return;
        authDownload(`/api/productions/${state.prodId}/reports/daily?date=${d}`);
      };

    } catch (e) {
      container.innerHTML = `<div style="color:var(--red);padding:2rem">${esc(e.message)}</div>`;
    }
  }



// Register module functions on App
Object.assign(window.App, {
  renderDashboard,
});
