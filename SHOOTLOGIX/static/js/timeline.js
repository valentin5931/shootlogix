/* ============================================================
   ShootLogix — timeline.js (P6.8)
   Multi-resource Gantt timeline using SVG.
   Groups: Boats, Vehicles, Crew, Locations.
   ============================================================ */

const Timeline = (() => {
  'use strict';

  // ── Config ──────────────────────────────────────────────────
  const ROW_H = 28;
  const GROUP_H = 32;
  const HEADER_H = 60;
  const DAY_W = 36;
  const LABEL_W = 180;
  const BAR_PAD = 4;
  const COLORS = {
    boat:          '#3B82F6',
    picture_boat:  '#6366F1',
    security_boat: '#0EA5E9',
    vehicle:       '#F59E0B',
    labour:        '#10B981',
    guard:         '#EF4444',
    location:      '#8B5CF6',
  };
  const STATUS_COLORS = {
    confirmed:  null, // use type color
    estimate:   '#94A3B8',
    follow_up:  '#FB923C',
    off:        '#CBD5E1',
    breakdown:  '#EF4444',
  };
  const GROUP_ORDER = ['Boats', 'Vehicles', 'Crew', 'Locations'];

  // ── State ──────────────────────────────────────────────────
  let _data = null;
  let _filters = { group: 'all', status: 'all', search: '' };
  let _tooltip = null;
  let _dates = [];
  let _container = null;

  // ── Helpers ────────────────────────────────────────────────
  function _api(url) {
    const token = localStorage.getItem('sl_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return fetch(url, { headers }).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
  }

  function _esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function _daysBetween(a, b) {
    return Math.round((new Date(b) - new Date(a)) / 86400000);
  }

  function _buildDateRange(start, end) {
    const dates = [];
    const d = new Date(start + 'T00:00:00');
    const e = new Date(end + 'T00:00:00');
    while (d <= e) {
      dates.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }
    return dates;
  }

  function _dateIdx(date) {
    const idx = _dates.indexOf(date);
    return idx >= 0 ? idx : -1;
  }

  function _shortDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return d.getDate() + ' ' + months[d.getMonth()];
  }

  function _dayOfWeek(iso) {
    return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(iso + 'T00:00:00').getDay()];
  }

  // ── Filter resources ──────────────────────────────────────
  function _filteredResources() {
    if (!_data) return [];
    let res = _data.resources;
    if (_filters.group !== 'all') {
      res = res.filter(r => r.group === _filters.group);
    }
    if (_filters.status !== 'all') {
      res = res.filter(r =>
        r.assignments.some(a => (a.status || 'confirmed') === _filters.status)
      );
    }
    if (_filters.search) {
      const q = _filters.search.toLowerCase();
      res = res.filter(r => r.name.toLowerCase().includes(q));
    }
    // Sort by group order, then subgroup, then name
    res.sort((a, b) => {
      const ga = GROUP_ORDER.indexOf(a.group), gb = GROUP_ORDER.indexOf(b.group);
      if (ga !== gb) return ga - gb;
      if (a.subgroup !== b.subgroup) return (a.subgroup || '').localeCompare(b.subgroup || '');
      return (a.name || '').localeCompare(b.name || '');
    });
    return res;
  }

  // ── Build function lookup ─────────────────────────────────
  function _funcName(funcId) {
    if (!_data || !_data.functions || !funcId) return '';
    const f = _data.functions.find(fn => fn.id === funcId);
    return f ? f.name : '';
  }

  // ── Shooting day lookup ───────────────────────────────────
  function _dayInfo(date) {
    if (!_data) return null;
    return _data.shooting_days.find(d => d.date === date);
  }

  // ── Render ─────────────────────────────────────────────────
  function render() {
    _container = document.getElementById('timeline-content');
    if (!_container) return;

    if (!_data) {
      _container.innerHTML = '<div style="padding:2rem;color:var(--text-3)">Loading timeline...</div>';
      _loadData();
      return;
    }

    const resources = _filteredResources();
    if (!resources.length) {
      _container.innerHTML = `
        ${_renderToolbar()}
        <div style="padding:2rem;color:var(--text-3)">No resources match your filters.</div>`;
      _bindToolbar();
      return;
    }

    // Build row layout: group headers + resource rows
    const rows = [];
    let currentGroup = null;
    for (const r of resources) {
      if (r.group !== currentGroup) {
        rows.push({ type: 'group', label: r.group });
        currentGroup = r.group;
      }
      rows.push({ type: 'resource', resource: r });
    }

    const totalDays = _dates.length;
    const svgW = LABEL_W + totalDays * DAY_W + 20;
    let svgH = HEADER_H;
    for (const row of rows) {
      svgH += row.type === 'group' ? GROUP_H : ROW_H;
    }

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" class="tl-svg">`;

    // ── Background ──
    svg += `<rect width="${svgW}" height="${svgH}" fill="var(--bg-1, #111)" />`;

    // ── Day columns header ──
    svg += _renderHeader(totalDays, svgW);

    // ── Weekend/today stripes ──
    const today = new Date().toISOString().slice(0, 10);
    for (let i = 0; i < totalDays; i++) {
      const dow = new Date(_dates[i] + 'T00:00:00').getDay();
      if (dow === 0 || dow === 6) {
        svg += `<rect x="${LABEL_W + i * DAY_W}" y="${HEADER_H}" width="${DAY_W}" height="${svgH - HEADER_H}" fill="rgba(255,255,255,0.03)" />`;
      }
      if (_dates[i] === today) {
        svg += `<rect x="${LABEL_W + i * DAY_W}" y="0" width="${DAY_W}" height="${svgH}" fill="rgba(59,130,246,0.08)" />`;
        svg += `<line x1="${LABEL_W + i * DAY_W + DAY_W / 2}" y1="0" x2="${LABEL_W + i * DAY_W + DAY_W / 2}" y2="${svgH}" stroke="#3B82F6" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.5" />`;
      }
    }

    // ── Rows ──
    let y = HEADER_H;
    for (const row of rows) {
      if (row.type === 'group') {
        svg += _renderGroupRow(row.label, y, svgW);
        y += GROUP_H;
      } else {
        svg += _renderResourceRow(row.resource, y, svgW);
        y += ROW_H;
      }
    }

    // ── Grid lines ──
    for (let i = 0; i <= totalDays; i++) {
      svg += `<line x1="${LABEL_W + i * DAY_W}" y1="${HEADER_H}" x2="${LABEL_W + i * DAY_W}" y2="${svgH}" stroke="rgba(255,255,255,0.06)" stroke-width="0.5" />`;
    }

    svg += '</svg>';

    _container.innerHTML = `
      ${_renderToolbar()}
      <div class="tl-scroll-wrap">
        <div class="tl-svg-container">${svg}</div>
      </div>
      <div id="tl-tooltip" class="tl-tooltip hidden"></div>
    `;
    _bindToolbar();
    _bindTooltips();

    // Scroll to today if visible
    const todayIdx = _dateIdx(today);
    if (todayIdx >= 0) {
      const wrap = _container.querySelector('.tl-scroll-wrap');
      if (wrap) {
        const scrollTo = LABEL_W + todayIdx * DAY_W - wrap.clientWidth / 2;
        wrap.scrollLeft = Math.max(0, scrollTo);
      }
    }
  }

  // ── Toolbar ────────────────────────────────────────────────
  function _renderToolbar() {
    return `
    <div class="tl-toolbar">
      <div class="tl-toolbar-left">
        <select id="tl-filter-group" class="tl-select">
          <option value="all"${_filters.group === 'all' ? ' selected' : ''}>All groups</option>
          ${GROUP_ORDER.map(g => `<option value="${g}"${_filters.group === g ? ' selected' : ''}>${g}</option>`).join('')}
        </select>
        <select id="tl-filter-status" class="tl-select">
          <option value="all"${_filters.status === 'all' ? ' selected' : ''}>All statuses</option>
          <option value="confirmed"${_filters.status === 'confirmed' ? ' selected' : ''}>Confirmed</option>
          <option value="estimate"${_filters.status === 'estimate' ? ' selected' : ''}>Estimate</option>
          <option value="follow_up"${_filters.status === 'follow_up' ? ' selected' : ''}>Follow-up</option>
        </select>
      </div>
      <div class="tl-toolbar-right">
        <input type="text" id="tl-search" class="tl-input" placeholder="Search resource..." value="${_esc(_filters.search)}">
        <span class="tl-stats">${_filteredResources().length} resources</span>
      </div>
    </div>`;
  }

  function _bindToolbar() {
    const grp = document.getElementById('tl-filter-group');
    const sts = document.getElementById('tl-filter-status');
    const srch = document.getElementById('tl-search');
    if (grp) grp.onchange = () => { _filters.group = grp.value; render(); };
    if (sts) sts.onchange = () => { _filters.status = sts.value; render(); };
    if (srch) {
      let debounce;
      srch.oninput = () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => { _filters.search = srch.value; render(); }, 250);
      };
    }
  }

  // ── SVG Header ─────────────────────────────────────────────
  function _renderHeader(totalDays, svgW) {
    let h = '';
    // Background
    h += `<rect x="0" y="0" width="${svgW}" height="${HEADER_H}" fill="var(--bg-2, #1a1a2e)" />`;
    // Label column header
    h += `<text x="10" y="24" fill="var(--text-2, #ccc)" font-size="11" font-weight="600">RESOURCE</text>`;
    h += `<text x="10" y="48" fill="var(--text-3, #888)" font-size="9">Name</text>`;

    // Date headers
    for (let i = 0; i < totalDays; i++) {
      const x = LABEL_W + i * DAY_W;
      const date = _dates[i];
      const dow = _dayOfWeek(date);
      const day = new Date(date + 'T00:00:00').getDate();
      const isWeekend = dow === 'Sat' || dow === 'Sun';
      const dayData = _dayInfo(date);

      // Month label on 1st of month or first day
      if (i === 0 || day === 1) {
        const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
        const m = months[new Date(date + 'T00:00:00').getMonth()];
        h += `<text x="${x + DAY_W / 2}" y="14" fill="var(--accent, #3B82F6)" font-size="9" font-weight="600" text-anchor="middle">${m}</text>`;
      }

      // Day number
      h += `<text x="${x + DAY_W / 2}" y="30" fill="${isWeekend ? 'var(--text-3, #666)' : 'var(--text-2, #ccc)'}" font-size="11" font-weight="${isWeekend ? '400' : '600'}" text-anchor="middle">${day}</text>`;
      // DOW
      h += `<text x="${x + DAY_W / 2}" y="42" fill="var(--text-3, #888)" font-size="8" text-anchor="middle">${dow}</text>`;
      // Shooting day number if available
      if (dayData && dayData.day_number) {
        h += `<text x="${x + DAY_W / 2}" y="54" fill="var(--accent, #3B82F6)" font-size="8" font-weight="600" text-anchor="middle">J${dayData.day_number}</text>`;
      }
    }

    // Bottom line
    h += `<line x1="0" y1="${HEADER_H}" x2="${svgW}" y2="${HEADER_H}" stroke="rgba(255,255,255,0.1)" stroke-width="1" />`;
    return h;
  }

  // ── Group row ──────────────────────────────────────────────
  function _renderGroupRow(label, y, svgW) {
    const iconMap = {
      Boats: '\u2693',     // anchor
      Vehicles: '\uD83D\uDE97', // car (won't render in SVG text, use simple label)
      Crew: '\uD83D\uDC64',
      Locations: '\uD83D\uDCCD',
    };
    let g = '';
    g += `<rect x="0" y="${y}" width="${svgW}" height="${GROUP_H}" fill="rgba(255,255,255,0.04)" />`;
    g += `<line x1="0" y1="${y}" x2="${svgW}" y2="${y}" stroke="rgba(255,255,255,0.08)" />`;
    g += `<text x="12" y="${y + GROUP_H / 2 + 5}" fill="var(--text-1, #fff)" font-size="12" font-weight="700" letter-spacing="0.5">${_esc(label.toUpperCase())}</text>`;
    return g;
  }

  // ── Resource row ───────────────────────────────────────────
  function _renderResourceRow(resource, y, svgW) {
    let r = '';
    // Alternating row bg
    r += `<rect x="0" y="${y}" width="${svgW}" height="${ROW_H}" fill="transparent" />`;
    r += `<line x1="0" y1="${y + ROW_H}" x2="${svgW}" y2="${y + ROW_H}" stroke="rgba(255,255,255,0.04)" />`;

    // Resource label (clipped)
    const typeColor = COLORS[resource.type] || '#888';
    r += `<circle cx="14" cy="${y + ROW_H / 2}" r="4" fill="${typeColor}" />`;
    r += `<text x="24" y="${y + ROW_H / 2 + 4}" fill="var(--text-2, #ccc)" font-size="11" clip-path="url(#labelClip)">${_esc(resource.name)}</text>`;

    // Assignment bars
    for (const a of resource.assignments) {
      r += _renderBar(a, resource, y);
    }
    return r;
  }

  // ── Assignment bar ─────────────────────────────────────────
  function _renderBar(assignment, resource, rowY) {
    const startIdx = _dateIdx(assignment.start_date);
    const endIdx = _dateIdx(assignment.end_date);
    if (startIdx < 0 && endIdx < 0) return '';

    const s = Math.max(0, startIdx);
    const e = Math.min(_dates.length - 1, endIdx >= 0 ? endIdx : _dates.length - 1);
    const x = LABEL_W + s * DAY_W + 2;
    const w = (e - s + 1) * DAY_W - 4;
    const barY = rowY + BAR_PAD;
    const barH = ROW_H - BAR_PAD * 2;

    if (w <= 0) return '';

    const statusColor = STATUS_COLORS[assignment.status];
    const color = statusColor || COLORS[resource.type] || '#3B82F6';
    const opacity = assignment.status === 'off' ? 0.3 : 0.85;

    const funcLabel = _funcName(assignment.function_id);
    const phasesLabel = assignment.phases || '';
    const label = phasesLabel || funcLabel;

    // Tooltip data attributes
    const tipData = `data-tip-name="${_esc(resource.name)}" data-tip-type="${_esc(resource.type)}" data-tip-status="${_esc(assignment.status)}" data-tip-start="${assignment.start_date}" data-tip-end="${assignment.end_date}" data-tip-func="${_esc(funcLabel)}" data-tip-phases="${_esc(phasesLabel)}"`;

    let bar = '';
    bar += `<rect x="${x}" y="${barY}" width="${w}" height="${barH}" rx="4" fill="${color}" opacity="${opacity}" class="tl-bar" ${tipData} style="cursor:pointer" />`;

    // Label inside bar (only if wide enough)
    if (w > 40 && label) {
      const maxChars = Math.floor((w - 8) / 6);
      const txt = label.length > maxChars ? label.slice(0, maxChars - 1) + '\u2026' : label;
      bar += `<text x="${x + 6}" y="${barY + barH / 2 + 4}" fill="#fff" font-size="9" font-weight="500" pointer-events="none">${_esc(txt)}</text>`;
    }

    // Day overrides: mark off days with X pattern
    if (assignment.day_overrides) {
      for (const [date, val] of Object.entries(assignment.day_overrides)) {
        if (val === null || val === 'empty') {
          const di = _dateIdx(date);
          if (di >= s && di <= e) {
            const ox = LABEL_W + di * DAY_W;
            bar += `<rect x="${ox + 2}" y="${barY}" width="${DAY_W - 4}" height="${barH}" fill="var(--bg-1, #111)" opacity="0.6" rx="2" />`;
          }
        }
      }
    }

    return bar;
  }

  // ── Tooltips ───────────────────────────────────────────────
  function _bindTooltips() {
    const tipEl = document.getElementById('tl-tooltip');
    if (!tipEl) return;
    const svgContainer = _container.querySelector('.tl-svg-container');
    if (!svgContainer) return;

    svgContainer.addEventListener('mousemove', (e) => {
      const bar = e.target.closest('.tl-bar');
      if (!bar) {
        tipEl.classList.add('hidden');
        return;
      }
      const name = bar.getAttribute('data-tip-name');
      const type = bar.getAttribute('data-tip-type');
      const status = bar.getAttribute('data-tip-status');
      const start = bar.getAttribute('data-tip-start');
      const end = bar.getAttribute('data-tip-end');
      const func = bar.getAttribute('data-tip-func');
      const phases = bar.getAttribute('data-tip-phases');

      let html = `<div class="tl-tip-title">${name}</div>`;
      html += `<div class="tl-tip-row"><span class="tl-tip-label">Type:</span> ${type.replace('_', ' ')}</div>`;
      if (func) html += `<div class="tl-tip-row"><span class="tl-tip-label">Function:</span> ${func}</div>`;
      if (phases) html += `<div class="tl-tip-row"><span class="tl-tip-label">Phases:</span> ${phases}</div>`;
      html += `<div class="tl-tip-row"><span class="tl-tip-label">Period:</span> ${_shortDate(start)} - ${_shortDate(end)}</div>`;
      const days = _daysBetween(start, end) + 1;
      html += `<div class="tl-tip-row"><span class="tl-tip-label">Duration:</span> ${days} day${days > 1 ? 's' : ''}</div>`;
      html += `<div class="tl-tip-row"><span class="tl-tip-label">Status:</span> <span class="tl-tip-status tl-tip-status-${status}">${status}</span></div>`;

      tipEl.innerHTML = html;
      tipEl.classList.remove('hidden');

      // Position
      const rect = _container.getBoundingClientRect();
      let tx = e.clientX - rect.left + 12;
      let ty = e.clientY - rect.top - 10;
      if (tx + 220 > rect.width) tx = e.clientX - rect.left - 230;
      if (ty + 120 > rect.height) ty = ty - 100;
      tipEl.style.left = tx + 'px';
      tipEl.style.top = ty + 'px';
    });

    svgContainer.addEventListener('mouseleave', () => {
      tipEl.classList.add('hidden');
    });
  }

  // ── Data loading ───────────────────────────────────────────
  async function _loadData() {
    const prodId = window._SL ? window._SL.state.prodId : null;
    if (!prodId) {
      _container.innerHTML = '<div style="padding:2rem;color:var(--text-3)">No production selected.</div>';
      return;
    }
    try {
      _data = await _api(`/api/productions/${prodId}/timeline`);
      if (_data.start_date && _data.end_date) {
        _dates = _buildDateRange(_data.start_date, _data.end_date);
      } else if (_data.shooting_days && _data.shooting_days.length) {
        const sorted = _data.shooting_days.map(d => d.date).sort();
        _dates = _buildDateRange(sorted[0], sorted[sorted.length - 1]);
      } else {
        _dates = [];
      }
      render();
    } catch (err) {
      console.error('[Timeline] Load error:', err);
      _container.innerHTML = `<div style="padding:2rem;color:#EF4444">Failed to load timeline: ${_esc(err.message)}</div>`;
    }
  }

  // ── Public API ─────────────────────────────────────────────
  function init() {
    _data = null;
    _filters = { group: 'all', status: 'all', search: '' };
    render();
  }

  return { init, render };
})();

// Register on App for tab system
if (typeof App !== 'undefined') {
  App.renderTimeline = () => Timeline.init();
}
