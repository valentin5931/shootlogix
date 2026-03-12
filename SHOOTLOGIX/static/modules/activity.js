/* ACTIVITY FEED — AXE 4.3 & 4.4 */

const SL = window._SL;
const { state, authState, $, esc, api, toast, fmtDate, authFetch,
        _loadModule, _canViewTab } = SL;

// ═══════════════════════════════════════════════════════════
//  ACTIVITY PANEL (AXE 4.3)
// ═══════════════════════════════════════════════════════════

let _activityOpen = false;
let _activityData = [];
let _activityPage = 0;
const PAGE_SIZE = 50;

// Module icons for the activity feed
const MODULE_ICONS = {
  shooting_days: { icon: 'calendar', color: '#94A3B8' },
  boats: { icon: 'anchor', color: '#3B82F6' },
  boat_assignments: { icon: 'anchor', color: '#3B82F6' },
  boat_functions: { icon: 'anchor', color: '#3B82F6' },
  picture_boats: { icon: 'camera', color: '#8B5CF6' },
  picture_boat_assignments: { icon: 'camera', color: '#8B5CF6' },
  security_boats: { icon: 'shield', color: '#EF4444' },
  security_boat_assignments: { icon: 'shield', color: '#EF4444' },
  transport_vehicles: { icon: 'truck', color: '#22C55E' },
  transport_assignments: { icon: 'truck', color: '#22C55E' },
  fuel_entries: { icon: 'droplet', color: '#F59E0B' },
  fuel_machinery: { icon: 'droplet', color: '#F59E0B' },
  helpers: { icon: 'users', color: '#F59E0B' },
  helper_assignments: { icon: 'users', color: '#F59E0B' },
  guard_camp_workers: { icon: 'shield', color: '#06B6D4' },
  guard_camp_assignments: { icon: 'shield', color: '#06B6D4' },
  location_sites: { icon: 'map-pin', color: '#22C55E' },
  location_schedules: { icon: 'map-pin', color: '#22C55E' },
  guard_location_schedules: { icon: 'shield', color: '#06B6D4' },
  guard_posts: { icon: 'shield', color: '#06B6D4' },
  fnb_categories: { icon: 'utensils', color: '#F97316' },
  fnb_items: { icon: 'utensils', color: '#F97316' },
  fnb_entries: { icon: 'utensils', color: '#F97316' },
  fnb_tracking: { icon: 'utensils', color: '#F97316' },
};

// Action icons
const ACTION_ICONS = {
  create: '+',
  update: '~',
  delete: 'x',
  lock: 'L',
  unlock: 'U',
  cascade: 'C',
};

const ACTION_COLORS = {
  create: '#22C55E',
  update: '#3B82F6',
  delete: '#EF4444',
  lock: '#F59E0B',
  unlock: '#8B5CF6',
  cascade: '#06B6D4',
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

function _renderActivityEntry(entry) {
  const mod = MODULE_ICONS[entry.table_name] || { icon: 'circle', color: '#6b7280' };
  const actionColor = ACTION_COLORS[entry.action] || '#6b7280';
  const actionIcon = ACTION_ICONS[entry.action] || '?';
  const desc = entry.human_description || `${entry.action} on ${entry.table_name}`;
  const time = _relativeTime(entry.created_at);
  const user = entry.user_nickname || 'System';

  return `<div class="activity-entry" data-table="${entry.table_name}" data-record="${entry.record_id || ''}"
    onclick="App._activityEntryClick('${entry.table_name}', ${entry.record_id || 'null'})">
    <div class="activity-entry-icon" style="background:${mod.color}20;color:${mod.color}">
      <span class="activity-action-badge" style="background:${actionColor}">${esc(actionIcon)}</span>
    </div>
    <div class="activity-entry-body">
      <div class="activity-entry-desc">${esc(desc)}</div>
      <div class="activity-entry-meta">
        <span class="activity-user">${esc(user)}</span>
        <span class="activity-time">${esc(time)}</span>
      </div>
    </div>
  </div>`;
}

async function toggleActivityPanel() {
  if (_activityOpen) {
    closeActivityPanel();
    return;
  }
  // Load activity module if not loaded
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
  if (module) params.set('entity_type', module);
  if (userId) params.set('user_id', userId);
  if (action) params.set('action_type', action);
  if (dateFrom) params.set('date_from', dateFrom);
  if (dateTo) params.set('date_to', dateTo);

  try {
    const res = await authFetch(`/api/productions/${state.prodId}/history?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to load activity');
    const data = await res.json();

    if (_activityPage === 0) {
      _activityData = data;
    } else {
      _activityData = _activityData.concat(data);
    }

    _renderActivityFeed();

    // Populate user filter dropdown from data
    if (_activityPage === 0) {
      _populateUserFilter(data);
    }

    // Show/hide load more
    const loadMoreBtn = $('activity-load-more');
    if (loadMoreBtn) {
      loadMoreBtn.style.display = data.length >= PAGE_SIZE ? '' : 'none';
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

function _renderActivityFeed() {
  const feed = $('activity-feed');
  if (!feed) return;

  if (_activityData.length === 0) {
    feed.innerHTML = '<div class="activity-empty">No activity found</div>';
    return;
  }

  feed.innerHTML = _activityData.map(e => _renderActivityEntry(e)).join('');
}

function _populateUserFilter(data) {
  const sel = $('activity-filter-user');
  if (!sel) return;
  const currentVal = sel.value;
  const users = new Map();
  for (const entry of data) {
    if (entry.user_id && entry.user_nickname) {
      users.set(entry.user_id, entry.user_nickname);
    }
  }
  // Keep existing options that aren't already in the new data
  const existing = new Map();
  for (const opt of sel.options) {
    if (opt.value) existing.set(opt.value, opt.textContent);
  }
  // Merge
  for (const [id, nick] of users) {
    existing.set(String(id), nick);
  }

  sel.innerHTML = '<option value="">All users</option>';
  for (const [id, nick] of existing) {
    sel.innerHTML += `<option value="${id}">${esc(nick)}</option>`;
  }
  sel.value = currentVal;
}

// Deep link: navigate to entity from activity entry
function _activityEntryClick(tableName, recordId) {
  if (!recordId) return;
  // Map table_name to a tab
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
//  ENTITY HISTORY (AXE 4.4) — reusable from modals
// ═══════════════════════════════════════════════════════════

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

// ── Register on App ──────────────────────────────────────

App.toggleActivityPanel = toggleActivityPanel;
App.closeActivityPanel = closeActivityPanel;
App.loadActivity = loadActivity;
App.loadMoreActivity = loadMoreActivity;
App.loadEntityHistory = loadEntityHistory;
App.renderEntityHistoryHTML = renderEntityHistoryHTML;
App._activityEntryClick = _activityEntryClick;
