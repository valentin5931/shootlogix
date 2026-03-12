/* SCHEDULING ALERTS — ES6 Module */
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
  //  SCHEDULING ALERTS PANEL (AXE 7.3)
  // ═══════════════════════════════════════════════════════════

  let _alertsPanelOpen = false;
  let _alertsData = [];
  let _alertsFilter = 'all';
  let _alertsLoaded = false;

  async function loadAlerts() {
    if (!state.prodId) return;
    try {
      const data = await api('GET', `/api/productions/${state.prodId}/alerts`);
      _alertsData = data.alerts || [];
      _updateAlertsBadge();
      _alertsLoaded = true;
      if (_alertsPanelOpen) _renderAlertsList();
    } catch (e) {
      console.warn('Failed to load alerts:', e);
    }
  }

  function _updateAlertsBadge() {
    const badge = $('alerts-badge');
    if (!badge) return;
    const count = _alertsData.length;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  function toggleAlertsPanel() {
    const panel = $('alerts-panel');
    if (!panel) return;
    _alertsPanelOpen = !_alertsPanelOpen;
    panel.classList.toggle('hidden', !_alertsPanelOpen);
    if (_alertsPanelOpen) {
      if (!_alertsLoaded) loadAlerts();
      else _renderAlertsList();
    }
  }

  function filterAlerts(severity) {
    _alertsFilter = severity;
    // Update filter buttons
    document.querySelectorAll('.alerts-filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === severity);
    });
    _renderAlertsList();
  }

  function _renderAlertsList() {
    const list = $('alerts-panel-list');
    if (!list) return;

    const filtered = _alertsFilter === 'all'
      ? _alertsData
      : _alertsData.filter(a => a.severity === _alertsFilter);

    if (filtered.length === 0) {
      list.innerHTML = `<div class="alerts-empty">
        ${_alertsData.length === 0 ? 'No scheduling conflicts detected' : 'No alerts matching this filter'}
      </div>`;
      return;
    }

    const moduleIcons = {
      boats: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M2 20c2-1 4-2 6-2s4 1 6 2 4 1 6 0"/><path d="M4 18l1-9h14l1 9"/></svg>',
      picture_boats: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M2 20c2-1 4-2 6-2s4 1 6 2 4 1 6 0"/><path d="M4 18l1-9h14l1 9"/></svg>',
      security_boats: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M2 20c2-1 4-2 6-2s4 1 6 2 4 1 6 0"/><path d="M4 18l1-9h14l1 9"/></svg>',
      guards: '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    };

    const severityConfig = {
      danger:  { cls: 'alert-item-danger',  icon: '!!', label: 'Critical' },
      warning: { cls: 'alert-item-warning', icon: '!',  label: 'Warning' },
      info:    { cls: 'alert-item-info',    icon: 'i',  label: 'Info' },
    };

    list.innerHTML = filtered.map(a => {
      const sev = severityConfig[a.severity] || severityConfig.info;
      const modIcon = moduleIcons[a.module] || '';
      const modLabel = (a.module || '').replace(/_/g, ' ');
      return `
        <div class="alert-item ${sev.cls}">
          <span class="alert-item-severity">${sev.icon}</span>
          <div class="alert-item-content">
            <div class="alert-item-msg">${esc(a.msg)}</div>
            <div class="alert-item-meta">
              ${modIcon}<span>${modLabel}</span>
              ${a.date ? `<span class="alert-item-date">${a.date}</span>` : ''}
            </div>
          </div>
        </div>`;
    }).join('');
  }



// Register module functions on App
Object.assign(window.App, {
  _renderAlertsList,
  _updateAlertsBadge,
  filterAlerts,
  loadAlerts,
  toggleAlertsPanel,
});
