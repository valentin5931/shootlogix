/* ACTIVITY FEED — P5.3 Readable history timeline */

const SL = window._SL;
const { state, authState, $, esc, api, toast, fmtDate, authFetch,
        _loadModule, _canViewTab } = SL;

// ═══════════════════════════════════════════════════════════
//  ACTIVITY PANEL (P5.3)
// ═══════════════════════════════════════════════════════════

let _activityOpen = false;
let _activityData = [];
let _activityGrouped = {};
let _activityPage = 0;
const PAGE_SIZE = 100;

// Module icons for the activity feed
const MODULE_ICONS = {
  pdt: { icon: '📅', color: '#94A3B8' },
  fleet: { icon: '⚓', color: '#3B82F6' },
  'picture-boats': { icon: '📷', color: '#8B5CF6' },
  'security-boats': { icon: '🛡', color: '#EF4444' },
  transport: { icon: '🚛', color: '#22C55E' },
  fuel: { icon: '⛽', color: '#F59E0B' },
  labour: { icon: '👥', color: '#F59E0B' },
  guards: { icon: '💂', color: '#06B6D4' },
  locations: { icon: '📍', color: '#22C55E' },
  fnb: { icon: '🍽', color: '#F97316' },
};

// Legacy table_name -> module mapping for entity history
const TABLE_MODULE_MAP = {
  shooting_days: 'pdt',
  boats: 'fleet', boat_assignments: 'fleet', boat_functions: 'fleet',
  picture_boats: 'picture-boats', picture_boat_assignments: 'picture-boats',
  security_boats: 'security-boats', security_boat_assignments: 'security-boats',
  transport_vehicles: 'transport', transport_assignments: 'transport',
  fuel_entries: 'fuel', fuel_machinery: 'fuel',
  helpers: 'labour', helper_assignments: 'labour',
  guard_camp_workers: 'guards', guard_camp_assignments: 'guards',
  guard_location_schedules: 'guards', guard_posts: 'guards',
  location_sites: 'locations', location_schedules: 'locations',
  fnb_categories: 'fnb', fnb_items: 'fnb', fnb_entries: 'fnb', fnb_tracking: 'fnb',
};

// Action config
const ACTION_CONFIG = {
  create: { label: 'Added', badge: '+', color: '#22C55E', bg: '#22C55E18' },
  update: { label: 'Updated', badge: '~', color: '#3B82F6', bg: '#3B82F618' },
  delete: { label: 'Removed', badge: '×', color: '#EF4444', bg: '#EF444418' },
  lock:   { label: 'Locked', badge: '🔒', color: '#F59E0B', bg: '#F59E0B18' },
  unlock: { label: 'Unlocked', badge: '🔓', color: '#8B5CF6', bg: '#8B5CF618' },
  cascade:{ label: 'Cascaded', badge: '↗', color: '#06B6D4', bg: '#06B6D418' },
};

// Module labels for filter dropdown
const MODULE_LABELS = {
  pdt: 'PDT (Schedule)',
  fleet: 'Fleet (Boats)',
  'picture-boats': 'Picture Boats',
  'security-boats': 'Security Boats',
  transport: 'Transport',
  fuel: 'Fuel',
  labour: 'Labour',
  guards: 'Guards',
  locations: 'Locations',
  fnb: 'FNB (Food & Beverage)',
};

function _relativeTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00Z'));
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return dateStr.slice(0, 10);
}

function _formatTime(dateStr) {
  if (!dateStr || dateStr.length < 16) return '';
  return dateStr.slice(11, 16);
}

function _formatDateHeader(dateStr) {
  if (!dateStr || dateStr === 'unknown') return 'Unknown date';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (dateStr === today.toISOString().slice(0, 10)) return 'Today';
    if (dateStr === yesterday.toISOString().slice(0, 10)) return 'Yesterday';

    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function _renderChangeDetail(change) {
  const oldVal = change.old === null || change.old === undefined ? 'empty' : change.old;
  const newVal = change.new === null || change.new === undefined ? 'empty' : change.new;
  return `<div class="activity-change-row">
    <span class="activity-change-field">${esc(change.field)}</span>
    <span class="activity-change-old">${esc(String(oldVal))}</span>
    <span class="activity-change-arrow">&rarr;</span>
    <span class="activity-change-new">${esc(String(newVal))}</span>
  </div>`;
}

function _renderActivityEntry(entry) {
  const mod = MODULE_ICONS[entry.module] || { icon: '⚙', color: '#6b7280' };
  const act = ACTION_CONFIG[entry.action] || ACTION_CONFIG.update;
  const time = _formatTime(entry.timestamp);
  const relTime = _relativeTime(entry.timestamp);
  const undoneClass = entry.undone ? ' activity-entry-undone' : '';

  // Changes detail (for updates with field diffs)
  let changesHTML = '';
  if (entry.changes && entry.changes.length > 0) {
    changesHTML = `<div class="activity-changes">
      ${entry.changes.slice(0, 5).map(c => _renderChangeDetail(c)).join('')}
      ${entry.changes.length > 5 ? `<div class="activity-change-more">+${entry.changes.length - 5} more changes</div>` : ''}
    </div>`;
  }

  return `<div class="activity-entry${undoneClass}" data-module="${entry.module}" data-record="${entry.record_id || ''}"
    onclick="App._activityEntryClick('${entry.table_name}', ${entry.record_id || 'null'})">
    <div class="activity-timeline-dot">
      <div class="activity-timeline-line"></div>
      <div class="activity-dot" style="background:${act.color}"></div>
    </div>
    <div class="activity-entry-content">
      <div class="activity-entry-header">
        <span class="activity-module-icon">${mod.icon}</span>
        <span class="activity-action-tag" style="background:${act.bg};color:${act.color}">${esc(act.label)}</span>
        <span class="activity-entry-time" title="${esc(entry.timestamp)}">${esc(time)} - ${esc(relTime)}</span>
      </div>
      <div class="activity-entry-desc">${esc(entry.description)}</div>
      ${changesHTML}
      <div class="activity-entry-user">${esc(entry.user)}</div>
    </div>
  </div>`;
}

function _renderGroupedTimeline() {
  const feed = $('activity-feed');
  if (!feed) return;

  if (_activityData.length === 0) {
    feed.innerHTML = '<div class="activity-empty">No activity found</div>';
    return;
  }

  let html = '';
  const dates = Object.keys(_activityGrouped).sort().reverse();
  for (const date of dates) {
    const entries = _activityGrouped[date];
    html += `<div class="activity-date-group">
      <div class="activity-date-header">
        <span class="activity-date-label">${esc(_formatDateHeader(date))}</span>
        <span class="activity-date-count">${entries.length} action${entries.length > 1 ? 's' : ''}</span>
      </div>
      <div class="activity-date-entries">
        ${entries.map(e => _renderActivityEntry(e)).join('')}
      </div>
    </div>`;
  }

  feed.innerHTML = html;
}

async function toggleActivityPanel() {
  if (_activityOpen) {
    closeActivityPanel();
    return;
  }
  await _loadModule('activity');
  _activityOpen = true;
  const overlay = $('activity-overlay');
  if (overlay) overlay.classList.remove('hidden');
  loadActivity();
}

function closeActivityPanel() {
  _activityOpen = false;
  const overlay = $('activity-overlay');
  if (overlay) overlay.classList.add('hidden');
}

async function loadActivity() {
  _activityPage = 0;
  _activityData = [];
  _activityGrouped = {};
  const feed = $('activity-feed');
  if (feed) feed.innerHTML = '<div class="activity-loading">Loading...</div>';
  await _fetchActivity();
}

async function _fetchActivity() {
  if (!state.prodId) return;

  const module = $('activity-filter-module')?.value || '';
  const userId = $('activity-filter-user')?.value || '';
  const action = $('activity-filter-action')?.value || '';
  const dateFrom = $('activity-filter-from')?.value || '';
  const dateTo = $('activity-filter-to')?.value || '';

  const params = new URLSearchParams();
  params.set('limit', PAGE_SIZE);
  if (module) params.set('module', module);
  if (userId) params.set('user_id', userId);
  if (action) params.set('action_type', action);
  if (dateFrom) params.set('date_from', dateFrom);
  if (dateTo) params.set('date_to', dateTo);

  try {
    const res = await authFetch(`/api/productions/${state.prodId}/activity?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to load activity');
    const data = await res.json();

    // Handle action_type filter client-side (not in API)
    let entries = data.entries || [];
    if (action) {
      entries = entries.filter(e => e.action === action);
    }

    _activityData = entries;
    _activityGrouped = {};
    for (const e of entries) {
      const dk = e.date || 'unknown';
      if (!_activityGrouped[dk]) _activityGrouped[dk] = [];
      _activityGrouped[dk].push(e);
    }

    _renderGroupedTimeline();

    // Populate module filter from available modules
    if (_activityPage === 0 && data.modules) {
      _populateModuleFilter(data.modules);
    }

    // Populate user filter from entries
    if (_activityPage === 0) {
      _populateUserFilter(entries);
    }

    // Show/hide load more
    const loadMoreBtn = $('activity-load-more');
    if (loadMoreBtn) {
      loadMoreBtn.style.display = entries.length >= PAGE_SIZE ? '' : 'none';
    }
  } catch (e) {
    const feed = $('activity-feed');
    if (feed) feed.innerHTML = '<div class="activity-empty">Failed to load activity</div>';
  }
}

function loadMoreActivity() {
  _activityPage++;
  _fetchActivity();
}

function _populateModuleFilter(modules) {
  const sel = $('activity-filter-module');
  if (!sel) return;
  const currentVal = sel.value;
  sel.innerHTML = '<option value="">All modules</option>';
  for (const mod of modules) {
    const label = MODULE_LABELS[mod] || mod;
    sel.innerHTML += `<option value="${mod}">${esc(label)}</option>`;
  }
  sel.value = currentVal;
}

function _populateUserFilter(data) {
  const sel = $('activity-filter-user');
  if (!sel) return;
  const currentVal = sel.value;
  const users = new Map();
  for (const entry of data) {
    if (entry.user_id && entry.user) {
      users.set(entry.user_id, entry.user);
    }
  }
  sel.innerHTML = '<option value="">All users</option>';
  for (const [id, nick] of users) {
    sel.innerHTML += `<option value="${id}">${esc(nick)}</option>`;
  }
  sel.value = currentVal;
}

// Deep link: navigate to entity from activity entry
function _activityEntryClick(tableName, recordId) {
  if (!recordId) return;
  const TAB_MAP = {
    shooting_days: 'pdt',
    boats: 'boats', boat_assignments: 'boats', boat_functions: 'boats',
    picture_boats: 'picture-boats', picture_boat_assignments: 'picture-boats',
    security_boats: 'security-boats', security_boat_assignments: 'security-boats',
    transport_vehicles: 'transport', transport_assignments: 'transport',
    fuel_entries: 'fuel', fuel_machinery: 'fuel',
    helpers: 'labour', helper_assignments: 'labour',
    guard_camp_workers: 'guards', guard_camp_assignments: 'guards',
    location_sites: 'locations', location_schedules: 'locations',
    guard_location_schedules: 'guards', guard_posts: 'guards',
    fnb_categories: 'fnb', fnb_items: 'fnb', fnb_entries: 'fnb', fnb_tracking: 'fnb',
  };
  const tab = TAB_MAP[tableName];
  if (tab) {
    closeActivityPanel();
    App.setTab(tab);
  }
}

// ═══════════════════════════════════════════════════════════
//  ENTITY HISTORY (AXE 4.4) -- reusable from modals
// ═══════════════════════════════════════════════════════════

const ACTION_COLORS = {
  create: '#22C55E', update: '#3B82F6', delete: '#EF4444',
  lock: '#F59E0B', unlock: '#8B5CF6', cascade: '#06B6D4',
};
const ACTION_ICONS = {
  create: '+', update: '~', delete: 'x',
  lock: 'L', unlock: 'U', cascade: 'C',
};

async function loadEntityHistory(tableName, entityId) {
  if (!state.prodId || !entityId) return [];
  try {
    const params = new URLSearchParams({
      entity_type: tableName,
      entity_id: entityId,
      limit: '100',
    });
    const res = await authFetch(`/api/productions/${state.prodId}/history?${params.toString()}`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

function renderEntityHistoryHTML(entries) {
  if (!entries || entries.length === 0) {
    return '<div class="entity-history-empty">No history for this entity</div>';
  }
  return `<div class="entity-history-list">
    ${entries.map(e => {
      const actionColor = ACTION_COLORS[e.action] || '#6b7280';
      const time = _relativeTime(e.created_at);
      const user = e.user_nickname || 'System';
      const desc = e.human_description || `${e.action} on ${e.table_name}`;
      return `<div class="entity-history-entry">
        <span class="entity-history-action" style="color:${actionColor}">${esc(ACTION_ICONS[e.action] || '?')}</span>
        <span class="entity-history-desc">${esc(desc)}</span>
        <span class="entity-history-meta">${esc(user)} - ${esc(time)}</span>
      </div>`;
    }).join('')}
  </div>`;
}

// Detail modal history loader (AXE 4.4)
async function _loadDetailHistory(tableName, entityId) {
  const container = document.getElementById('bd-history-list');
  if (!container) return;
  container.innerHTML = '<div class="entity-history-empty">Loading...</div>';
  const entries = await loadEntityHistory(tableName, entityId);
  container.innerHTML = renderEntityHistoryHTML(entries);
}

// ── Register on App ──────────────────────────────────────

App.toggleActivityPanel = toggleActivityPanel;
App.closeActivityPanel = closeActivityPanel;
App.loadActivity = loadActivity;
App.loadMoreActivity = loadMoreActivity;
App.loadEntityHistory = loadEntityHistory;
App.renderEntityHistoryHTML = renderEntityHistoryHTML;
App._activityEntryClick = _activityEntryClick;
App._loadDetailHistory = _loadDetailHistory;
