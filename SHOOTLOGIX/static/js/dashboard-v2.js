/* ============================================================
   ShootLogix — dashboard-v2.js (P5.1)
   Executive Dashboard: KPI cards, department traffic lights,
   burn rate chart, and active alerts panel.
   ============================================================ */

const DashboardV2 = (() => {
  'use strict';

  // ── Helpers ──────────────────────────────────────────────────
  const fmtMoney = n => n == null ? '---' : '$' + Math.round(Number(n)).toLocaleString('en-US');
  const esc = s => {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  };

  async function _fetch(url) {
    const token = localStorage.getItem('sl_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  // ── Traffic light color logic ────────────────────────────────
  function trafficColor(pct) {
    if (pct >= 100) return { cls: 'tl-red', label: 'Over', bg: '#EF4444' };
    if (pct >= 85) return { cls: 'tl-orange', label: 'Warning', bg: '#F59E0B' };
    return { cls: 'tl-green', label: 'OK', bg: '#22C55E' };
  }

  function kpiColor(pct) {
    if (pct >= 90) return '#22C55E';
    if (pct >= 70) return '#F59E0B';
    return '#EF4444';
  }

  function severityStyle(severity) {
    if (severity === 'danger') return 'background:rgba(239,68,68,.12);border-left:3px solid #EF4444;color:#EF4444';
    if (severity === 'warning') return 'background:rgba(245,158,11,.12);border-left:3px solid #F59E0B;color:#F59E0B';
    return 'background:rgba(34,197,94,.12);border-left:3px solid #22C55E;color:#22C55E';
  }

  // ── Burn rate SVG chart ──────────────────────────────────────
  function renderBurnSVG(burnData, totalEstimate, totalSpent) {
    if (!burnData || burnData.length < 2) return '<div style="color:var(--text-3);font-size:.8rem;padding:1rem">No burn data available yet.</div>';

    const W = 640, H = 180, pL = 55, pR = 15, pT = 15, pB = 28;
    const cW = W - pL - pR, cH = H - pT - pB;

    // Compute projected cumulative for future days
    const actualDays = burnData.filter(d => d.is_actual);
    const lastActualCum = actualDays.length ? actualDays[actualDays.length - 1].cumulative : 0;
    const dailyRate = actualDays.length ? lastActualCum / actualDays.length : 0;

    let projCum = lastActualCum;
    const enriched = burnData.map(d => {
      if (d.is_actual) return { ...d, proj: d.cumulative };
      projCum += dailyRate;
      return { ...d, proj: projCum };
    });

    const maxY = Math.max(totalEstimate, ...enriched.map(d => Math.max(d.cumulative || 0, d.proj || 0))) * 1.1;
    const n = enriched.length;

    const x = i => pL + (i / (n - 1)) * cW;
    const y = v => pT + cH - (v / maxY) * cH;

    // Actual line
    const actualPts = enriched
      .filter(d => d.is_actual && d.cumulative != null)
      .map((d, _, arr) => {
        const idx = enriched.indexOf(d);
        return `${x(idx).toFixed(1)},${y(d.cumulative).toFixed(1)}`;
      });

    // Projection line (from last actual to end)
    const lastActIdx = enriched.reduce((acc, d, i) => d.is_actual ? i : acc, -1);
    const projPts = enriched
      .filter((d, i) => i >= lastActIdx)
      .map(d => {
        const idx = enriched.indexOf(d);
        const val = d.is_actual ? d.cumulative : d.proj;
        return `${x(idx).toFixed(1)},${y(val).toFixed(1)}`;
      });

    // Budget line
    const budgetY = y(totalEstimate);

    // Y-axis labels
    const ySteps = 4;
    let yLabels = '';
    for (let s = 0; s <= ySteps; s++) {
      const val = (maxY / ySteps) * s;
      const yy = y(val);
      yLabels += `<line x1="${pL}" y1="${yy.toFixed(1)}" x2="${W - pR}" y2="${yy.toFixed(1)}" stroke="var(--border,#333)" stroke-width="0.5"/>`;
      yLabels += `<text x="${pL - 4}" y="${(yy + 3).toFixed(1)}" text-anchor="end" fill="var(--text-4,#888)" font-size="8">${fmtMoney(val)}</text>`;
    }

    // Date labels
    const indices = [0, Math.floor(n / 2), n - 1];
    const dateLabels = indices.map(i => {
      const d = enriched[i];
      return `<text x="${x(i).toFixed(1)}" y="${(H - 5).toFixed(1)}" text-anchor="middle" fill="var(--text-4,#888)" font-size="8">${(d.date || '').slice(5)}</text>`;
    }).join('');

    // Area under actual
    let area = '';
    if (actualPts.length > 1) {
      const firstX = actualPts[0].split(',')[0];
      const lastX = actualPts[actualPts.length - 1].split(',')[0];
      area = `<polygon points="${firstX},${(pT + cH).toFixed(1)} ${actualPts.join(' ')} ${lastX},${(pT + cH).toFixed(1)}" fill="var(--blue,#3B82F6)" opacity="0.1"/>`;
    }

    return `
    <div class="dv2-burn-chart">
      <h3 class="dv2-section-title">Burn Rate & Projection</h3>
      <div style="overflow-x:auto">
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="width:100%;max-width:${W}px;height:auto">
          ${yLabels}
          <line x1="${pL}" y1="${budgetY.toFixed(1)}" x2="${W - pR}" y2="${budgetY.toFixed(1)}" stroke="var(--amber,#F59E0B)" stroke-width="1.5" stroke-dasharray="6,3"/>
          <text x="${W - pR}" y="${(budgetY - 4).toFixed(1)}" text-anchor="end" fill="var(--amber,#F59E0B)" font-size="8" font-weight="600">Budget</text>
          ${projPts.length > 1 ? `<polyline points="${projPts.join(' ')}" fill="none" stroke="var(--text-4,#888)" stroke-width="1.5" stroke-dasharray="4,3"/>` : ''}
          ${area}
          ${actualPts.length > 1 ? `<polyline points="${actualPts.join(' ')}" fill="none" stroke="var(--blue,#3B82F6)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
          ${dateLabels}
        </svg>
      </div>
      <div style="display:flex;gap:1rem;font-size:.7rem;color:var(--text-3,#999);margin-top:.3rem;flex-wrap:wrap">
        <span style="display:flex;align-items:center;gap:.3rem"><span style="width:16px;height:2px;background:var(--blue,#3B82F6);display:inline-block"></span>Actual</span>
        <span style="display:flex;align-items:center;gap:.3rem"><span style="width:16px;height:2px;background:var(--text-4,#888);display:inline-block;border-top:1px dashed var(--text-4,#888)"></span>Projected</span>
        <span style="display:flex;align-items:center;gap:.3rem"><span style="width:16px;height:0;border-top:2px dashed var(--amber,#F59E0B);display:inline-block"></span>Budget</span>
      </div>
    </div>`;
  }

  // ── Main render ──────────────────────────────────────────────
  async function render(prodId) {
    const container = document.getElementById('dashboard-v2-content');
    if (!container) return;
    if (!prodId) { container.innerHTML = ''; return; }

    container.innerHTML = `
      <div class="dv2-loading">
        <div class="dv2-skel-row"><div class="dv2-skel"></div><div class="dv2-skel"></div><div class="dv2-skel"></div><div class="dv2-skel"></div></div>
      </div>`;

    try {
      // Fetch all 3 endpoints in parallel
      const [kpis, alertsData, burnrate] = await Promise.all([
        _fetch(`/api/productions/${prodId}/dashboard/kpis`),
        _fetch(`/api/productions/${prodId}/dashboard/alerts`),
        _fetch(`/api/productions/${prodId}/dashboard/burnrate`),
      ]);

      const alerts = alertsData.alerts || [];

      // ── KPI Cards ──────────────────────────────────────────
      const kpiCards = `
        <div class="dv2-kpis">
          <div class="dv2-kpi-card">
            <div class="dv2-kpi-icon" style="background:${kpiColor(kpis.fleet_coverage)}20;color:${kpiColor(kpis.fleet_coverage)}">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17l3-3h2l2-6h4l2 6h2l3 3"/><path d="M6 17v2"/><path d="M18 17v2"/></svg>
            </div>
            <div class="dv2-kpi-data">
              <div class="dv2-kpi-value" style="color:${kpiColor(kpis.fleet_coverage)}">${kpis.fleet_coverage}%</div>
              <div class="dv2-kpi-label">Fleet Coverage (3d)</div>
            </div>
          </div>
          <div class="dv2-kpi-card">
            <div class="dv2-kpi-icon" style="background:${kpiColor(kpis.crew_coverage)}20;color:${kpiColor(kpis.crew_coverage)}">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <div class="dv2-kpi-data">
              <div class="dv2-kpi-value" style="color:${kpiColor(kpis.crew_coverage)}">${kpis.crew_coverage}%</div>
              <div class="dv2-kpi-label">Crew Coverage (3d)</div>
            </div>
          </div>
          <div class="dv2-kpi-card">
            <div class="dv2-kpi-icon" style="background:${kpis.unconfirmed_assignments > 0 ? '#F59E0B20' : '#22C55E20'};color:${kpis.unconfirmed_assignments > 0 ? '#F59E0B' : '#22C55E'}">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <div class="dv2-kpi-data">
              <div class="dv2-kpi-value" style="color:${kpis.unconfirmed_assignments > 0 ? '#F59E0B' : '#22C55E'}">${kpis.unconfirmed_assignments}</div>
              <div class="dv2-kpi-label">Unconfirmed (J-2)</div>
            </div>
          </div>
          <div class="dv2-kpi-card">
            <div class="dv2-kpi-icon" style="background:${kpis.breakdowns > 0 ? '#EF444420' : '#22C55E20'};color:${kpis.breakdowns > 0 ? '#EF4444' : '#22C55E'}">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            </div>
            <div class="dv2-kpi-data">
              <div class="dv2-kpi-value" style="color:${kpis.breakdowns > 0 ? '#EF4444' : '#22C55E'}">${kpis.breakdowns}</div>
              <div class="dv2-kpi-label">Breakdowns</div>
            </div>
          </div>
        </div>`;

      // ── Department traffic lights ──────────────────────────
      const deptNames = {
        boats: 'Boats', picture_boats: 'Picture Boats',
        security_boats: 'Security Boats', transport: 'Transport',
        labour: 'Labour', guards: 'Guards',
      };

      // Use burnrate data which has dept estimates/actuals
      // We need the main dashboard data for dept breakdown - fetch it
      let deptHTML = '';
      try {
        const mainDash = await _fetch(`/api/productions/${prodId}/dashboard`);
        const depts = mainDash.departments || {};
        const deptRows = Object.entries(depts).map(([key, d]) => {
          const name = deptNames[key] || {
            locations: 'Locations', fuel: 'Fuel', fnb: 'Catering'
          }[key] || key;
          const est = d.estimate || 0;
          const act = d.actual || 0;
          const pct = est > 0 ? Math.round(act / est * 100) : 0;
          const tl = trafficColor(pct);
          return `
            <div class="dv2-dept-row">
              <div class="dv2-tl" style="background:${tl.bg}"></div>
              <div class="dv2-dept-name">${esc(name)}</div>
              <div class="dv2-dept-bar-wrap">
                <div class="dv2-dept-bar" style="width:${Math.min(pct, 100)}%;background:${tl.bg}"></div>
              </div>
              <div class="dv2-dept-pct" style="color:${tl.bg}">${pct}%</div>
              <div class="dv2-dept-amounts">${fmtMoney(act)} / ${fmtMoney(est)}</div>
            </div>`;
        }).join('');

        deptHTML = `
          <div class="dv2-depts">
            <h3 class="dv2-section-title">Department Status</h3>
            ${deptRows}
          </div>`;
      } catch (e) {
        deptHTML = '';
      }

      // ── Burn rate chart ────────────────────────────────────
      const burnHTML = renderBurnSVG(
        burnrate.burn_data,
        burnrate.total_estimate,
        burnrate.total_spent
      );

      // ── Budget summary bar ─────────────────────────────────
      const consumed = burnrate.budget_consumed_pct || 0;
      const budgetSummary = `
        <div class="dv2-budget-summary">
          <div class="dv2-budget-header">
            <span class="dv2-section-title" style="margin:0">Budget</span>
            <span style="font-size:.8rem;color:var(--text-3,#999)">${fmtMoney(burnrate.total_spent)} / ${fmtMoney(burnrate.total_estimate)}</span>
          </div>
          <div class="dv2-budget-bar-outer">
            <div class="dv2-budget-bar-inner" style="width:${Math.min(consumed, 100)}%;background:${consumed > 100 ? '#EF4444' : consumed > 85 ? '#F59E0B' : '#22C55E'}"></div>
          </div>
          <div class="dv2-budget-meta">
            <span>${consumed}% consumed</span>
            <span>Daily rate: ${fmtMoney(burnrate.daily_rate)}</span>
            <span>Projected: ${fmtMoney(burnrate.projected_total)}</span>
          </div>
        </div>`;

      // ── Alerts list ────────────────────────────────────────
      let alertsHTML = '';
      if (alerts.length > 0) {
        const sorted = [...alerts].sort((a, b) => {
          const sev = { danger: 0, warning: 1, info: 2 };
          return (sev[a.severity] || 2) - (sev[b.severity] || 2);
        });
        alertsHTML = `
          <div class="dv2-alerts">
            <h3 class="dv2-section-title">Active Alerts <span class="dv2-alert-badge">${alerts.length}</span></h3>
            ${sorted.map(a => `
              <div class="dv2-alert-item" style="${severityStyle(a.severity)}">
                <span class="dv2-alert-type">${esc(a.type.replace('_', ' '))}</span>
                <span class="dv2-alert-msg">${esc(a.msg)}</span>
              </div>
            `).join('')}
          </div>`;
      } else {
        alertsHTML = `
          <div class="dv2-alerts dv2-alerts-empty">
            <h3 class="dv2-section-title">Active Alerts</h3>
            <div style="color:var(--text-3,#999);font-size:.8rem;padding:.5rem 0">No active alerts</div>
          </div>`;
      }

      // ── Assemble ───────────────────────────────────────────
      container.innerHTML = `
        <div class="dv2-wrapper">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem">
            <h2 class="dv2-title" style="margin:0">Executive Dashboard</h2>
            <button id="dv2-export-pdf-btn" class="sl-btn sl-btn-outline" style="font-size:.8rem;padding:.4rem .8rem;display:flex;align-items:center;gap:.4rem" title="Export PDF">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              Export PDF
            </button>
          </div>
          ${kpiCards}
          ${budgetSummary}
          <div class="dv2-grid">
            <div class="dv2-grid-left">
              ${deptHTML}
              ${alertsHTML}
            </div>
            <div class="dv2-grid-right">
              ${burnHTML}
            </div>
          </div>
        </div>`;

      // ── Export PDF button handler ────────────────────────
      const pdfBtn = document.getElementById('dv2-export-pdf-btn');
      if (pdfBtn) {
        pdfBtn.addEventListener('click', async () => {
          pdfBtn.disabled = true;
          pdfBtn.textContent = 'Generating...';
          try {
            const token = localStorage.getItem('sl_token');
            const headers = {};
            if (token) headers['Authorization'] = 'Bearer ' + token;
            const res = await fetch(`/api/productions/${prodId}/export/dashboard-pdf`, { headers });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `dashboard_${prodId}_${new Date().toISOString().slice(0,10)}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          } catch (err) {
            alert('PDF export failed: ' + err.message);
          } finally {
            pdfBtn.disabled = false;
            pdfBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> Export PDF`;
          }
        });
      }

    } catch (e) {
      container.innerHTML = `<div style="color:#EF4444;padding:1rem;font-size:.85rem">Executive dashboard error: ${esc(e.message)}</div>`;
    }
  }

  return { render };
})();
