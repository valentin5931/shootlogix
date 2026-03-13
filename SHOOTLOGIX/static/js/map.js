/* MAP MODULE — Leaflet map view for locations */
/* P6.2 — Vue carte interactive */

(function() {
  const SL = window._SL;
  const { state, $, esc, api } = SL;

  let _map = null;
  let _markers = [];

  // Marker colors by location_type
  const MARKER_COLORS = {
    game:        '#EF4444', // red
    tribal_camp: '#3B82F6', // blue
    reward:      '#22C55E', // green
    crew_base:   '#6B7280', // gray
  };

  function _createIcon(color) {
    return L.divIcon({
      className: 'loc-map-marker',
      html: `<div style="
        width:14px;height:14px;border-radius:50%;
        background:${color};border:2px solid #fff;
        box-shadow:0 1px 4px rgba(0,0,0,.4);
      "></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      popupAnchor: [0, -10],
    });
  }

  function _todayStatus(site) {
    const today = new Date().toISOString().slice(0, 10);
    const schedules = state.locationSchedules || [];
    const entry = schedules.find(s => s.location_name === site.name && s.date === today);
    if (!entry) return null;
    return entry.status;
  }

  function _statusBadge(status) {
    if (!status) return '<span style="color:var(--text-4);font-size:.7rem">No activity today</span>';
    const colors = { P: '#EAB308', F: '#22C55E', W: '#3B82F6' };
    const labels = { P: 'PREP', F: 'FILMING', W: 'WRAP' };
    return `<span style="display:inline-block;padding:1px 6px;border-radius:3px;font-size:.65rem;font-weight:700;color:#fff;background:${colors[status]}">${labels[status]}</span>`;
  }

  function renderLocMap() {
    const container = $('view-locations');
    if (!container) return;

    const sites = state.locationSites || [];

    // Build header (same structure as schedule/budget views)
    const typeLabel = t => t === 'tribal_camp' ? 'TRIBAL CAMPS' : t === 'game' ? 'GAMES' : t === 'reward' ? 'REWARDS' : 'ALL';

    let html = `<div style="padding:1rem">
      <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.75rem;flex-wrap:wrap">
        <span class="section-title" style="margin:0">Filming Locations</span>
        <span style="font-size:.75rem;color:var(--text-3)">${sites.length} sites</span>
        <div class="view-toggle" style="margin-left:1rem">
          <button class="${state.locView === 'schedule' ? 'active' : ''}" onclick="App.locSetView('schedule')">Schedule</button>
          <button class="${state.locView === 'budget' ? 'active' : ''}" onclick="App.locSetView('budget')">Budget</button>
          <button class="${state.locView === 'map' ? 'active' : ''}" onclick="App.locSetView('map')">Map</button>
        </div>
        <div style="margin-left:auto;display:flex;gap:.3rem">
          <button class="btn btn-sm btn-primary" onclick="App.showAddLocationModal()">+ Add Location</button>
        </div>
      </div>
      <div id="loc-map-container" style="height:calc(100vh - 180px);min-height:400px;border-radius:8px;overflow:hidden;border:1px solid var(--border)"></div>
      <div style="display:flex;gap:1rem;margin-top:.5rem;flex-wrap:wrap;font-size:.7rem;color:var(--text-3)">
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#EF4444;margin-right:3px"></span>Game</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#3B82F6;margin-right:3px"></span>Tribal Camp</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#22C55E;margin-right:3px"></span>Reward</span>
        <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#6B7280;margin-right:3px"></span>Crew Base</span>
      </div>
    </div>`;

    container.innerHTML = html;

    // Initialize map
    const mapEl = document.getElementById('loc-map-container');
    if (!mapEl) return;

    // Destroy previous map if exists
    if (_map) { _map.remove(); _map = null; }
    _markers = [];

    _map = L.map(mapEl).setView([8.35, -79.05], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(_map);

    // Add markers for sites with coordinates
    const bounds = [];
    sites.forEach(site => {
      if (site.lat == null || site.lng == null) return;
      const lat = parseFloat(site.lat);
      const lng = parseFloat(site.lng);
      if (isNaN(lat) || isNaN(lng)) return;

      const locType = site.location_type || 'game';
      const color = MARKER_COLORS[locType] || MARKER_COLORS.game;
      const icon = _createIcon(color);
      const status = _todayStatus(site);
      const typeLabels = { game: 'Game Site', tribal_camp: 'Tribal Camp', reward: 'Reward', crew_base: 'Crew Base' };

      const popupContent = `
        <div style="min-width:160px;font-family:inherit">
          <div style="font-weight:700;font-size:.85rem;margin-bottom:4px">${esc(site.name)}</div>
          <div style="font-size:.72rem;color:#666;margin-bottom:4px">${typeLabels[locType] || locType}</div>
          <div style="margin-bottom:4px">${_statusBadge(status)}</div>
          ${site.access_note ? `<div style="font-size:.7rem;color:#555;border-top:1px solid #eee;padding-top:4px;margin-top:4px">${esc(site.access_note)}</div>` : ''}
        </div>`;

      const marker = L.marker([lat, lng], { icon }).addTo(_map);
      marker.bindPopup(popupContent);
      _markers.push(marker);
      bounds.push([lat, lng]);
    });

    // Fit bounds if we have markers
    if (bounds.length > 1) {
      _map.fitBounds(bounds, { padding: [30, 30] });
    } else if (bounds.length === 1) {
      _map.setView(bounds[0], 14);
    }

    // Fix Leaflet rendering issue when container size changes
    setTimeout(() => { if (_map) _map.invalidateSize(); }, 200);
  }

  // Register on App
  Object.assign(window.App, {
    renderLocMap,
  });
})();
