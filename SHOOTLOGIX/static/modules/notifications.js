/* NOTIFICATIONS — AXE 9.2 */

const SL = window._SL;
const { state, authState, $, esc, authFetch, toast } = SL;

let _notifPanelOpen = false;
let _notifData = [];
let _unreadCount = 0;
let _pollTimer = null;

// ── Badge polling ───────────────────────────────────────

async function pollNotificationCount() {
  if (!state.prodId) return;
  try {
    const res = await authFetch(`/api/notifications/count?production_id=${state.prodId}`);
    if (!res.ok) return;
    const data = await res.json();
    _unreadCount = data.count || 0;
    _updateBadge();
  } catch {
    // silent
  }
}

function startNotifPolling() {
  if (_pollTimer) clearInterval(_pollTimer);
  pollNotificationCount();
  _pollTimer = setInterval(pollNotificationCount, 30000); // every 30s
}

function stopNotifPolling() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
}

function _updateBadge() {
  const badge = $('notif-badge');
  if (!badge) return;
  if (_unreadCount > 0) {
    badge.textContent = _unreadCount > 99 ? '99+' : _unreadCount;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

// ── Panel ───────────────────────────────────────────────

async function toggleNotifPanel() {
  _notifPanelOpen = !_notifPanelOpen;
  const panel = $('notif-panel');
  if (!panel) return;
  panel.classList.toggle('hidden', !_notifPanelOpen);
  if (_notifPanelOpen) {
    await _loadNotifications();
  }
}

function closeNotifPanel() {
  _notifPanelOpen = false;
  const panel = $('notif-panel');
  if (panel) panel.classList.add('hidden');
}

async function _loadNotifications() {
  const list = $('notif-list');
  if (!list) return;
  list.innerHTML = '<div class="notif-loading">Loading...</div>';
  try {
    const res = await authFetch(
      `/api/notifications?production_id=${state.prodId}&limit=50`
    );
    if (!res.ok) throw new Error('Failed');
    _notifData = await res.json();
    _renderNotifications();
  } catch {
    list.innerHTML = '<div class="notif-empty">Failed to load notifications</div>';
  }
}

function _renderNotifications() {
  const list = $('notif-list');
  if (!list) return;
  if (!_notifData.length) {
    list.innerHTML = '<div class="notif-empty">No notifications</div>';
    return;
  }
  list.innerHTML = _notifData.map(n => {
    const time = _fmtTime(n.created_at);
    const unread = !n.is_read;
    const icon = _typeIcon(n.type);
    return `<div class="notif-item ${unread ? 'notif-unread' : ''}" data-id="${n.id}" onclick="App.clickNotification(${n.id})">
      <div class="notif-icon">${icon}</div>
      <div class="notif-content">
        <div class="notif-title">${esc(n.title)}</div>
        ${n.body ? `<div class="notif-body">${esc(n.body)}</div>` : ''}
        <div class="notif-time">${esc(time)}</div>
      </div>
      ${unread ? '<div class="notif-dot"></div>' : ''}
    </div>`;
  }).join('');
}

function _typeIcon(type) {
  const icons = {
    assignment_created: '<svg width="14" height="14" fill="none" stroke="#22C55E" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    assignment_updated: '<svg width="14" height="14" fill="none" stroke="#3B82F6" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    assignment_deleted: '<svg width="14" height="14" fill="none" stroke="#EF4444" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>',
    pdt_modified: '<svg width="14" height="14" fill="none" stroke="#94A3B8" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    budget_exceeded: '<svg width="14" height="14" fill="none" stroke="#F59E0B" stroke-width="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    comment_added: '<svg width="14" height="14" fill="none" stroke="#8B5CF6" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
  };
  return icons[type] || icons.assignment_updated;
}

function _fmtTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso + 'Z');
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

async function clickNotification(notifId) {
  // Mark as read
  try {
    await authFetch(`/api/notifications/${notifId}/read`, { method: 'POST' });
    const n = _notifData.find(x => x.id === notifId);
    if (n) n.is_read = 1;
    _unreadCount = Math.max(0, _unreadCount - 1);
    _updateBadge();
    _renderNotifications();
  } catch {
    // silent
  }
}

async function markAllRead() {
  try {
    await authFetch(`/api/notifications/read-all?production_id=${state.prodId}`, { method: 'POST' });
    _notifData.forEach(n => n.is_read = 1);
    _unreadCount = 0;
    _updateBadge();
    _renderNotifications();
    toast('All notifications marked as read', 'success');
  } catch {
    toast('Failed to mark all as read', 'error');
  }
}

// ── Register on App ─────────────────────────────────────
App.toggleNotifPanel = toggleNotifPanel;
App.closeNotifPanel = closeNotifPanel;
App.clickNotification = clickNotification;
App.markAllNotificationsRead = markAllRead;
App.pollNotificationCount = pollNotificationCount;
App.startNotifPolling = startNotifPolling;
App.stopNotifPolling = stopNotifPolling;
