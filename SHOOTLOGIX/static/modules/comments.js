/* COMMENTS — AXE 9.1 */

const SL = window._SL;
const { state, authState, $, esc, api, toast, authFetch } = SL;

// ── Comment badge cache ─────────────────────────────────
let _commentCounts = {}; // { 'entity_type:entity_id': count }

async function loadCommentCounts(entityType, entityIds) {
  if (!entityIds || !entityIds.length) return;
  const ids = entityIds.join(',');
  try {
    const res = await authFetch(
      `/api/productions/${state.prodId}/comments/counts?entity_type=${entityType}&entity_ids=${ids}`
    );
    if (!res.ok) return;
    const data = await res.json();
    for (const [eid, cnt] of Object.entries(data)) {
      _commentCounts[`${entityType}:${eid}`] = cnt;
    }
  } catch (e) {
    console.error('[COMMENTS] loadCommentCounts error:', e);
  }
}

function getCommentCount(entityType, entityId) {
  return _commentCounts[`${entityType}:${entityId}`] || 0;
}

function commentBadgeHTML(entityType, entityId) {
  const count = getCommentCount(entityType, entityId);
  const cls = count > 0 ? 'comment-badge has-comments' : 'comment-badge';
  return `<button class="${cls}" onclick="event.stopPropagation();App.openCommentsPanel('${esc(entityType)}',${entityId})" title="Comments">
    <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
    ${count > 0 ? `<span class="comment-count">${count}</span>` : ''}
  </button>`;
}

// ── Comments panel ──────────────────────────────────────
let _commentsPanelOpen = false;
let _commentsEntity = { type: null, id: null };
let _commentsData = [];

async function openCommentsPanel(entityType, entityId) {
  _commentsEntity = { type: entityType, id: entityId };
  _commentsPanelOpen = true;
  const panel = $('comments-panel');
  if (!panel) return;
  panel.classList.remove('hidden');
  $('comments-panel-title').textContent = `Comments: ${_entityLabel(entityType)} #${entityId}`;
  $('comments-input').value = '';
  await _loadComments();
}

function closeCommentsPanel() {
  _commentsPanelOpen = false;
  const panel = $('comments-panel');
  if (panel) panel.classList.add('hidden');
}

function _entityLabel(type) {
  const labels = {
    shooting_day: 'Shooting Day',
    boat_assignments: 'Boat Assignment',
    picture_boat_assignments: 'PB Assignment',
    security_boat_assignments: 'SB Assignment',
    transport_assignments: 'Transport Assignment',
    helper_assignments: 'Labor Assignment',
    guard_camp_assignments: 'Guard Assignment',
    location_sites: 'Location',
    boats: 'Boat',
    picture_boats: 'Picture Boat',
    security_boats: 'Security Boat',
    transport_vehicles: 'Vehicle',
    helpers: 'Worker',
    guards: 'Guard',
  };
  return labels[type] || type;
}

async function _loadComments() {
  const list = $('comments-list');
  if (!list) return;
  list.innerHTML = '<div class="comments-loading">Loading...</div>';
  try {
    const res = await authFetch(
      `/api/productions/${state.prodId}/comments?entity_type=${_commentsEntity.type}&entity_id=${_commentsEntity.id}`
    );
    if (!res.ok) throw new Error('Failed');
    _commentsData = await res.json();
    _renderComments();
  } catch (e) {
    list.innerHTML = '<div class="comments-empty">Failed to load comments</div>';
  }
}

function _renderComments() {
  const list = $('comments-list');
  if (!list) return;
  if (!_commentsData.length) {
    list.innerHTML = '<div class="comments-empty">No comments yet</div>';
    return;
  }
  list.innerHTML = _commentsData.map(c => {
    const time = _fmtTime(c.created_at);
    const canDelete = authState.user && (authState.user.is_admin || c.user_id === authState.user.id);
    return `<div class="comment-item" data-id="${c.id}">
      <div class="comment-header">
        <span class="comment-author">${esc(c.user_nickname || 'Unknown')}</span>
        <span class="comment-time">${esc(time)}</span>
        ${canDelete ? `<button class="comment-delete" onclick="App.deleteComment(${c.id})" title="Delete">&times;</button>` : ''}
      </div>
      <div class="comment-body">${esc(c.body)}</div>
    </div>`;
  }).join('');
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

async function submitComment() {
  const input = $('comments-input');
  const body = (input.value || '').trim();
  if (!body) return;
  input.disabled = true;
  try {
    const res = await authFetch(`/api/productions/${state.prodId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity_type: _commentsEntity.type,
        entity_id: _commentsEntity.id,
        body
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed');
    }
    input.value = '';
    // Update badge count
    const key = `${_commentsEntity.type}:${_commentsEntity.id}`;
    _commentCounts[key] = (_commentCounts[key] || 0) + 1;
    await _loadComments();
    toast('Comment added', 'success');
  } catch (e) {
    toast(e.message || 'Failed to add comment', 'error');
  } finally {
    input.disabled = false;
    input.focus();
  }
}

async function deleteComment(commentId) {
  if (!confirm('Delete this comment?')) return;
  try {
    const res = await authFetch(`/api/comments/${commentId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed');
    // Update badge count
    const key = `${_commentsEntity.type}:${_commentsEntity.id}`;
    _commentCounts[key] = Math.max(0, (_commentCounts[key] || 0) - 1);
    await _loadComments();
    toast('Comment deleted', 'success');
  } catch (e) {
    toast('Failed to delete comment', 'error');
  }
}

function handleCommentKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submitComment();
  }
}

// ── Register on App ─────────────────────────────────────
App.openCommentsPanel = openCommentsPanel;
App.closeCommentsPanel = closeCommentsPanel;
App.submitComment = submitComment;
App.deleteComment = deleteComment;
App.handleCommentKeydown = handleCommentKeydown;
App.loadCommentCounts = loadCommentCounts;
App.getCommentCount = getCommentCount;
App.commentBadgeHTML = commentBadgeHTML;
