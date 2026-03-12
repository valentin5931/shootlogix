/* ADMIN PANEL — ES6 Module */
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

  // ═══════════════════════════════════════════════════════════════
  // ADMIN PANEL
  // ═══════════════════════════════════════════════════════════════

  let _adminTab = 'users';
  let _adminUsers = [];
  let _adminProjects = [];
  let _adminMembers = [];
  let _adminModalAction = null;
  let _adminModalData = {};

  function adminSetTab(tab) {
    _adminTab = tab;
    document.querySelectorAll('.admin-tab').forEach(b => b.classList.toggle('active', b.getAttribute('data-atab') === tab));
    document.querySelectorAll('.admin-sub').forEach(el => el.classList.toggle('active', el.id === `admin-${tab}`));
    if (tab === 'users') _adminLoadUsers();
    else if (tab === 'projects') _adminLoadProjects();
    else if (tab === 'invitations') _adminLoadInvitations();
  }

  async function _adminLoadUsers() {
    try {
      _adminUsers = await api('GET', '/api/admin/users');
      _renderAdminUsers();
    } catch (e) { toast('Failed to load users: ' + e.message, 'error'); }
  }

  function _renderAdminUsers() {
    const el = $('admin-users-list');
    if (!el) return;
    if (!_adminUsers.length) { el.innerHTML = '<p style="color:var(--text-3)">No users found.</p>'; return; }
    let html = '<table class="admin-table"><thead><tr><th>Nickname</th><th>Admin</th><th>Projects</th><th>Actions</th></tr></thead><tbody>';
    for (const u of _adminUsers) {
      const projects = (u.memberships || []).map(m =>
        `<span class="badge badge-${m.role.toLowerCase()}">${esc(m.production_name)} (${m.role})</span>`
      ).join(' ');
      html += `<tr>
        <td><strong>${esc(u.nickname)}</strong></td>
        <td>${u.is_admin ? 'Yes' : 'No'}</td>
        <td>${projects || '<span style="color:var(--text-3)">None</span>'}</td>
        <td class="admin-actions">
          <button onclick="App.adminResetPassword(${u.id}, '${esc(u.nickname)}')">Reset pw</button>
          ${u.id !== authState.user?.id ? `<button class="btn-danger-sm" onclick="App.adminDeleteUser(${u.id}, '${esc(u.nickname)}')">Delete</button>` : ''}
        </td>
      </tr>`;
    }
    html += '</tbody></table>';
    el.innerHTML = html;
  }

  async function _adminLoadProjects() {
    try {
      _adminProjects = await api('GET', '/api/admin/projects');
      _renderAdminProjects();
    } catch (e) { toast('Failed to load projects: ' + e.message, 'error'); }
  }

  function _renderAdminProjects() {
    const el = $('admin-projects-list');
    if (!el) return;
    if (!_adminProjects.length) { el.innerHTML = '<p style="color:var(--text-3)">No projects.</p>'; return; }
    let html = '<table class="admin-table"><thead><tr><th>Name</th><th>Status</th><th>Members</th><th>Actions</th></tr></thead><tbody>';
    for (const p of _adminProjects) {
      html += `<tr>
        <td><strong>${esc(p.name)}</strong></td>
        <td>${esc(p.status || 'active')}</td>
        <td>${p.member_count || 0}</td>
        <td class="admin-actions">
          <button onclick="App.adminRenameProject(${p.id}, '${esc(p.name)}')">Rename</button>
          <button onclick="App.adminArchiveProject(${p.id}, '${esc(p.name)}', '${esc(p.status)}')">${p.status === 'archived' ? 'Activate' : 'Archive'}</button>
        </td>
      </tr>`;
    }
    html += '</tbody></table>';
    el.innerHTML = html;
  }

  async function _adminLoadInvitations() {
    try {
      _adminProjects = await api('GET', '/api/admin/projects');
      const sel = $('admin-inv-project');
      if (sel) {
        sel.innerHTML = _adminProjects.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
      }
      await adminLoadMembers();
    } catch (e) { toast('Failed to load invitations: ' + e.message, 'error'); }
  }

  async function adminLoadMembers() {
    const sel = $('admin-inv-project');
    if (!sel || !sel.value) return;
    try {
      _adminMembers = await api('GET', `/api/admin/projects/${sel.value}/members`);
      _renderAdminMembers();
    } catch (e) { toast('Failed to load members: ' + e.message, 'error'); }
  }

  function _renderAdminMembers() {
    const el = $('admin-inv-members');
    if (!el) return;
    if (!_adminMembers.length) { el.innerHTML = '<p style="color:var(--text-3)">No members.</p>'; return; }
    const projId = $('admin-inv-project')?.value;
    let html = '<table class="admin-table"><thead><tr><th>User</th><th>Role</th><th>Actions</th></tr></thead><tbody>';
    for (const m of _adminMembers) {
      html += `<tr>
        <td><strong>${esc(m.nickname)}</strong></td>
        <td><span class="badge badge-${(m.role || '').toLowerCase()}">${esc(m.role)}</span></td>
        <td class="admin-actions">
          <button onclick="App.adminChangeRole(${projId}, ${m.user_id}, '${esc(m.nickname)}', '${esc(m.role)}')">Change role</button>
          ${m.user_id !== authState.user?.id ? `<button class="btn-danger-sm" onclick="App.adminRemoveMember(${projId}, ${m.user_id}, '${esc(m.nickname)}')">Remove</button>` : ''}
        </td>
      </tr>`;
    }
    html += '</tbody></table>';
    el.innerHTML = html;
  }

  function adminShowCreateUser() {
    _adminModalAction = 'create-user';
    $('admin-modal-title').textContent = 'Create User';
    $('admin-modal-body').innerHTML = `
      <div class="form-group"><label class="form-label">Nickname</label>
        <input type="text" id="adm-nickname" class="form-control" placeholder="e.g. JOHN"></div>
      <div class="form-group"><label class="form-label">Password</label>
        <input type="password" id="adm-password" class="form-control" placeholder="Min 6 characters"></div>
    `;
    $('admin-modal-ok').textContent = 'Create';
    $('admin-modal-overlay').classList.remove('hidden');
  }

  function adminShowCreateProject() {
    _adminModalAction = 'create-project';
    $('admin-modal-title').textContent = 'Create Project';
    $('admin-modal-body').innerHTML = `
      <div class="form-group"><label class="form-label">Project Name</label>
        <input type="text" id="adm-projname" class="form-control" placeholder="e.g. KLAS8"></div>
    `;
    $('admin-modal-ok').textContent = 'Create';
    $('admin-modal-overlay').classList.remove('hidden');
  }

  function adminShowInvite() {
    const projId = $('admin-inv-project')?.value;
    if (!projId) return;
    _adminModalAction = 'invite';
    $('admin-modal-title').textContent = 'Invite User to Project';
    $('admin-modal-body').innerHTML = `
      <div class="form-group"><label class="form-label">Nickname</label>
        <input type="text" id="adm-inv-nickname" class="form-control" placeholder="Existing user nickname"></div>
      <div class="form-group"><label class="form-label">Role</label>
        <select id="adm-inv-role" class="form-control">
          <option value="ADMIN">ADMIN</option>
          <option value="UNIT">UNIT</option>
          <option value="TRANSPO">TRANSPO</option>
          <option value="READER" selected>READER</option>
        </select></div>
    `;
    $('admin-modal-ok').textContent = 'Invite';
    $('admin-modal-overlay').classList.remove('hidden');
  }

  function adminCloseModal() {
    $('admin-modal-overlay').classList.add('hidden');
    _adminModalAction = null;
  }

  async function adminModalConfirm() {
    try {
      if (_adminModalAction === 'create-user') {
        const nickname = $('adm-nickname')?.value?.trim();
        const password = $('adm-password')?.value;
        if (!nickname || !password) { toast('Fill all fields', 'error'); return; }
        await api('POST', '/api/admin/users', { nickname, password });
        toast(`User '${nickname}' created`);
        adminCloseModal();
        _adminLoadUsers();
      } else if (_adminModalAction === 'create-project') {
        const name = $('adm-projname')?.value?.trim();
        if (!name) { toast('Enter project name', 'error'); return; }
        await api('POST', '/api/admin/projects', { name });
        toast(`Project '${name}' created`);
        adminCloseModal();
        _adminLoadProjects();
        await _loadAuthState();
      } else if (_adminModalAction === 'invite') {
        const projId = $('admin-inv-project')?.value;
        const nickname = $('adm-inv-nickname')?.value?.trim();
        const role = $('adm-inv-role')?.value;
        if (!nickname) { toast('Enter nickname', 'error'); return; }
        await api('POST', `/api/admin/projects/${projId}/members`, { nickname, role });
        toast(`'${nickname}' invited as ${role}`);
        adminCloseModal();
        adminLoadMembers();
      } else if (_adminModalAction === 'change-role') {
        const { projId, userId } = _adminModalData;
        const role = $('adm-role-select')?.value;
        await api('PUT', `/api/admin/projects/${projId}/members/${userId}`, { role });
        toast('Role updated');
        adminCloseModal();
        adminLoadMembers();
      } else if (_adminModalAction === 'reset-password') {
        const { userId } = _adminModalData;
        const password = $('adm-new-password')?.value;
        if (!password || password.length < 6) { toast('Min 6 characters', 'error'); return; }
        await api('PUT', `/api/admin/users/${userId}/password`, { password });
        toast('Password reset');
        adminCloseModal();
      } else if (_adminModalAction === 'rename-project') {
        const { projId } = _adminModalData;
        const name = $('adm-rename')?.value?.trim();
        if (!name) { toast('Enter name', 'error'); return; }
        await api('PUT', `/api/admin/projects/${projId}`, { name });
        toast('Project renamed');
        adminCloseModal();
        _adminLoadProjects();
        await _loadAuthState();
      }
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  function adminResetPassword(userId, nickname) {
    _adminModalAction = 'reset-password';
    _adminModalData = { userId };
    $('admin-modal-title').textContent = `Reset Password: ${nickname}`;
    $('admin-modal-body').innerHTML = `
      <div class="form-group"><label class="form-label">New Password</label>
        <input type="password" id="adm-new-password" class="form-control" placeholder="Min 6 characters"></div>
    `;
    $('admin-modal-ok').textContent = 'Reset';
    $('admin-modal-overlay').classList.remove('hidden');
  }

  async function adminDeleteUser(userId, nickname) {
    if (!confirm(`Delete user '${nickname}'? This cannot be undone.`)) return;
    try {
      await api('DELETE', `/api/admin/users/${userId}`);
      toast(`User '${nickname}' deleted`);
      _adminLoadUsers();
    } catch (e) { toast(e.message, 'error'); }
  }

  function adminRenameProject(projId, currentName) {
    _adminModalAction = 'rename-project';
    _adminModalData = { projId };
    $('admin-modal-title').textContent = 'Rename Project';
    $('admin-modal-body').innerHTML = `
      <div class="form-group"><label class="form-label">New Name</label>
        <input type="text" id="adm-rename" class="form-control" value="${esc(currentName)}"></div>
    `;
    $('admin-modal-ok').textContent = 'Rename';
    $('admin-modal-overlay').classList.remove('hidden');
  }

  async function adminArchiveProject(projId, name, currentStatus) {
    const newStatus = currentStatus === 'archived' ? 'active' : 'archived';
    const action = newStatus === 'archived' ? 'archive' : 'activate';
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} project '${name}'?`)) return;
    try {
      await api('PUT', `/api/admin/projects/${projId}`, { status: newStatus });
      toast(`Project '${name}' ${action}d`);
      _adminLoadProjects();
    } catch (e) { toast(e.message, 'error'); }
  }

  function adminChangeRole(projId, userId, nickname, currentRole) {
    _adminModalAction = 'change-role';
    _adminModalData = { projId, userId };
    $('admin-modal-title').textContent = `Change Role: ${nickname}`;
    $('admin-modal-body').innerHTML = `
      <div class="form-group"><label class="form-label">Role</label>
        <select id="adm-role-select" class="form-control">
          ${['ADMIN','UNIT','TRANSPO','READER'].map(r =>
            `<option value="${r}" ${r === currentRole ? 'selected' : ''}>${r}</option>`
          ).join('')}
        </select></div>
    `;
    $('admin-modal-ok').textContent = 'Update';
    $('admin-modal-overlay').classList.remove('hidden');
  }

  async function adminRemoveMember(projId, userId, nickname) {
    if (!confirm(`Remove '${nickname}' from this project?`)) return;
    try {
      await api('DELETE', `/api/admin/projects/${projId}/members/${userId}`);
      toast(`'${nickname}' removed`);
      adminLoadMembers();
    } catch (e) { toast(e.message, 'error'); }
  }



// Register module functions on App
Object.assign(window.App, {
  _adminLoadInvitations,
  _adminLoadProjects,
  _adminLoadUsers,
  _renderAdminMembers,
  _renderAdminProjects,
  _renderAdminUsers,
  adminArchiveProject,
  adminChangeRole,
  adminCloseModal,
  adminDeleteUser,
  adminLoadMembers,
  adminModalConfirm,
  adminRemoveMember,
  adminRenameProject,
  adminResetPassword,
  adminSetTab,
  adminShowCreateProject,
  adminShowCreateUser,
  adminShowInvite,
});
