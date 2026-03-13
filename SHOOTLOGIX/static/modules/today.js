/* TODAY VIEW — P3.2 */
/* Daily operations overview: all active resources for a given date */

const SL = window._SL;
const { state, $, esc, api, fmtMoney, fmtDate, fmtDateLong, _canViewTab } = SL;

// Tide status → SVG icon (16×16, blue)
const TIDE_ICONS = {
  E: '<svg class="tide-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 8h12M11 5l3 3-3 3M5 11l-3-3 3-3" stroke="#3B82F6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  D: '<svg class="tide-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 2v12M5 11l3 3 3-3" stroke="#3B82F6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  M: '<svg class="tide-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 14V2M11 5L8 2 5 5" stroke="#3B82F6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
function tideIcon(statut) {
  return TIDE_ICONS[statut] || esc(statut || '');
}

// ── State ──
let _todayDate = new Date().toISOString().slice(0, 10);
let _todayData = null;

// ── Helpers ──
function _statusBadge(status) {
  const colors = {
    confirmed: '#22C55E', tentative: '#F59E0B', pending: '#94A3B8',
    cancelled: '#EF4444', option: '#8B5CF6',
  };
  const c = colors[status] || '#94A3B8';
  return `<span class="today-badge" style="background:${c}20;color:${c};border:1px solid ${c}40">${esc(status || 'n/a')}</span>`;
}

function _sectionHeader(icon, title, count, color) {
  return `
    <div class="today-section-header">
      <span class="today-section-icon" style="color:${color}">${icon}</span>
      <span class="today-section-title">${title}</span>
      <span class="today-section-count" style="background:${color}20;color:${color}">${count}</span>
    </div>`;
}

function _card(name, subtitle, status, color, notes, extra) {
  return `
    <div class="today-card" style="border-left:3px solid ${color || '#64748B'}">
      <div class="today-card-header">
        <span class="today-card-name">${esc(name)}</span>
        ${_statusBadge(status)}
      </div>
      <div class="today-card-sub">${esc(subtitle || '')}</div>
      ${extra ? `<div class="today-card-extra">${extra}</div>` : ''}
      ${notes ? `<div class="today-card-notes">${esc(notes)}</div>` : ''}
    </div>`;
}

// ── Date navigation ──
function _prevDay() {
  const d = new Date(_todayDate);
  d.setDate(d.getDate() - 1);
  _todayDate = d.toISOString().slice(0, 10);
  renderToday();
}

function _nextDay() {
  const d = new Date(_todayDate);
  d.setDate(d.getDate() + 1);
  _todayDate = d.toISOString().slice(0, 10);
  renderToday();
}

function _goToday() {
  _todayDate = new Date().toISOString().slice(0, 10);
  renderToday();
}

function _pickDate(e) {
  _todayDate = e.target.value;
  renderToday();
}

// ── Render ──
async function renderToday() {
  const container = $('today-content');
  if (!container) return;

  container.innerHTML = '<div class="today-loading">Loading...</div>';

  try {
    _todayData = await api('GET', `/api/productions/${state.prodId}/today?date=${_todayDate}`);
  } catch (err) {
    container.innerHTML = `<div class="today-error">Failed to load data</div>`;
    return;
  }

  const d = _todayData;
  const isToday = _todayDate === new Date().toISOString().slice(0, 10);
  const dateObj = new Date(_todayDate + 'T12:00:00');
  const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
  const dateDisplay = dateObj.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  let html = '';

  // ── Date nav toolbar ──
  html += `
    <div class="today-toolbar">
      <button class="btn btn-sm btn-secondary" onclick="App._todayPrev()">&#9664;</button>
      <button class="btn btn-sm ${isToday ? 'btn-primary' : 'btn-secondary'}" onclick="App._todayGoToday()">Today</button>
      <button class="btn btn-sm btn-secondary" onclick="App._todayNext()">&#9654;</button>
      <input type="date" class="today-date-picker" value="${_todayDate}" onchange="App._todayPickDate(event)">
      <span class="today-date-label">${dateDisplay}</span>
    </div>`;

  // ── Schedule / PDT section ──
  html += `<div class="today-section">`;
  html += _sectionHeader('&#128197;', 'Schedule', d.schedule ? `Day ${d.schedule.day_number || '?'}` : 'No PDT', '#94A3B8');
  if (d.schedule) {
    const s = d.schedule;
    html += `<div class="today-schedule-grid">`;
    if (s.location) html += `<div class="today-schedule-item"><span class="today-sch-label">Location</span><span class="today-sch-value">${esc(s.location)}</span></div>`;
    if (s.game_name) html += `<div class="today-schedule-item"><span class="today-sch-label">Game / Activity</span><span class="today-sch-value">${esc(s.game_name)}</span></div>`;
    if (s.status) html += `<div class="today-schedule-item"><span class="today-sch-label">Status</span><span class="today-sch-value">${esc(s.status)}</span></div>`;
    if (s.heure_rehearsal) html += `<div class="today-schedule-item"><span class="today-sch-label">Rehearsal</span><span class="today-sch-value">${esc(s.heure_rehearsal)}</span></div>`;
    if (s.heure_game) html += `<div class="today-schedule-item"><span class="today-sch-label">Game Time</span><span class="today-sch-value">${esc(s.heure_game)}</span></div>`;
    if (s.heure_animateur) html += `<div class="today-schedule-item"><span class="today-sch-label">Host</span><span class="today-sch-value">${esc(s.heure_animateur)}</span></div>`;
    if (s.heure_depart_candidats) html += `<div class="today-schedule-item"><span class="today-sch-label">Contestants Dep.</span><span class="today-sch-value">${esc(s.heure_depart_candidats)}</span></div>`;
    if (s.nb_candidats) html += `<div class="today-schedule-item"><span class="today-sch-label">Contestants</span><span class="today-sch-value">${s.nb_candidats}</span></div>`;
    if (s.maree_statut) html += `<div class="today-schedule-item"><span class="today-sch-label">Tide</span><span class="today-sch-value" title="${esc(s.maree_statut)}">${tideIcon(s.maree_statut)}${s.maree_hauteur ? ' (' + esc(s.maree_hauteur) + ')' : ''}</span></div>`;
    if (s.conseil_soir) html += `<div class="today-schedule-item"><span class="today-sch-label">Council</span><span class="today-sch-value">${esc(s.conseil_soir)}</span></div>`;
    html += `</div>`;
    if (s.events && s.events.length) {
      html += `<div class="today-events-list">`;
      for (const ev of s.events) {
        const evColors = { game: '#3B82F6', council: '#F59E0B', arena: '#EF4444', off: '#94A3B8' };
        const evColor = evColors[ev.event_type] || '#64748B';
        html += `<div class="today-event-chip" style="border-left:3px solid ${evColor}">
          <span class="today-event-type" style="color:${evColor}">${esc(ev.event_type || '').toUpperCase()}</span>
          ${ev.name ? `<span>${esc(ev.name)}</span>` : ''}
          ${ev.location ? `<span class="today-event-loc">${esc(ev.location)}</span>` : ''}
        </div>`;
      }
      html += `</div>`;
    }
    if (s.notes) html += `<div class="today-schedule-notes">${esc(s.notes)}</div>`;
  } else {
    html += `<div class="today-empty">No shooting day scheduled</div>`;
  }
  html += `</div>`;

  // ── Locations ──
  if (d.locations && d.locations.length) {
    html += `<div class="today-section">`;
    html += _sectionHeader('&#128205;', 'Locations', d.locations.length, '#22C55E');
    html += `<div class="today-cards-grid">`;
    for (const loc of d.locations) {
      const statusLabels = { P: 'Prep', F: 'Film', W: 'Wrap' };
      html += `<div class="today-card" style="border-left:3px solid #22C55E">
        <div class="today-card-header">
          <span class="today-card-name">${esc(loc.location_name)}</span>
          <span class="today-badge" style="background:#22C55E20;color:#22C55E">${statusLabels[loc.status] || loc.status || ''}</span>
        </div>
        ${loc.notes ? `<div class="today-card-notes">${esc(loc.notes)}</div>` : ''}
      </div>`;
    }
    html += `</div></div>`;
  }

  // ── Fleet (Boats + Picture + Security) ──
  const fleetTotal = d.counts.fleet_total;
  if (fleetTotal > 0) {
    html += `<div class="today-section">`;
    html += _sectionHeader('&#9973;', 'Fleet', fleetTotal, '#3B82F6');
    html += `<div class="today-cards-grid">`;
    for (const b of d.boats) {
      html += _card(b.boat_name, b.function_name, b.status, b.color || '#3B82F6', b.notes,
        `${b.captain ? 'Capt: ' + esc(b.captain) : ''}${b.capacity ? ' | Cap: ' + b.capacity : ''}`);
    }
    for (const b of d.picture_boats) {
      html += _card(b.boat_name, `Picture - ${b.function_name || ''}`, b.status, b.color || '#8B5CF6', b.notes);
    }
    for (const b of d.security_boats) {
      html += _card(b.boat_name, `Security - ${b.function_name || ''}`, b.status, b.color || '#EF4444', b.notes);
    }
    html += `</div></div>`;
  }

  // ── Transport ──
  if (d.transport.length) {
    html += `<div class="today-section">`;
    html += _sectionHeader('&#128663;', 'Transport', d.transport.length, '#22C55E');
    html += `<div class="today-cards-grid">`;
    for (const v of d.transport) {
      html += _card(v.vehicle_name, v.function_name, v.status, v.color || '#22C55E', v.notes,
        v.vehicle_type ? `Type: ${esc(v.vehicle_type)}` : '');
    }
    html += `</div></div>`;
  }

  // ── Crew (Labor + Guards) ──
  const crewTotal = d.counts.crew_total;
  if (crewTotal > 0) {
    html += `<div class="today-section">`;
    html += _sectionHeader('&#128100;', 'Crew', crewTotal, '#F59E0B');
    html += `<div class="today-cards-grid">`;
    for (const h of d.labour) {
      html += _card(h.helper_name, h.function_name, h.status, h.color || '#F59E0B', h.notes,
        h.role ? `Role: ${esc(h.role)}` : '');
    }
    for (const g of d.guards) {
      html += _card(g.helper_name, `Guard - ${g.function_name || ''}`, g.status, g.color || '#06B6D4', g.notes,
        g.role ? `Role: ${esc(g.role)}` : '');
    }
    html += `</div></div>`;
  }

  // ── Fuel ──
  html += `<div class="today-section">`;
  html += _sectionHeader('&#9981;', 'Fuel', `${d.fuel.total_liters} L`, '#F59E0B');
  html += `<div class="today-fuel-grid">
    <div class="today-fuel-stat">
      <span class="today-fuel-value">${d.fuel.total_liters} L</span>
      <span class="today-fuel-label">Consumption</span>
    </div>
    <div class="today-fuel-stat">
      <span class="today-fuel-value">${fmtMoney(d.fuel.total_cost)}</span>
      <span class="today-fuel-label">Estimated Cost</span>
    </div>
    <div class="today-fuel-stat">
      <span class="today-fuel-value">${d.fuel.entries}</span>
      <span class="today-fuel-label">Entries</span>
    </div>
  </div>`;
  html += `</div>`;

  // ── Summary bar ──
  if (!d.schedule && fleetTotal === 0 && d.transport.length === 0 && crewTotal === 0) {
    html += `<div class="today-empty-state">
      <div class="today-empty-icon">&#128197;</div>
      <div>No operations scheduled for this date</div>
      <div class="today-empty-hint">Use the date picker to navigate to an active day</div>
    </div>`;
  }

  container.innerHTML = html;
}

// ── Register ──
Object.assign(window.App, {
  renderToday,
  _todayPrev: _prevDay,
  _todayNext: _nextDay,
  _todayGoToday: _goToday,
  _todayPickDate: _pickDate,
});
