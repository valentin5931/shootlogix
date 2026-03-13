#!/usr/bin/env python3
"""Build the new core app.js from the monolith's core sections + module loader"""

SRC = 'static/app-monolith.js'

with open(SRC, 'r') as f:
    lines = f.readlines()

def extract(start, end):
    """Extract lines (1-indexed, inclusive)"""
    return ''.join(lines[start-1:end])

# Build the new app.js
output = []

# ── Section 1: IIFE header + state + utilities + auth + API + tab nav (lines 1-1000)
output.append(extract(1, 1000))

# ── Section 2: Confirm dialog (lines 6639-6658)
output.append('\n')
output.append(extract(6639, 6658))

# ── Section 3: Theme toggle (lines 11147-11159)
output.append('\n')
output.append(extract(11147, 11159))

# ── Section 4: Global search (lines 11556-11700)
output.append('\n')
output.append(extract(11556, 11700))

# ── Section 5: Init function + groups (lines 11702-11958)
# But first add the module loader infrastructure
output.append('\n')
output.append("""
  // ═══════════════════════════════════════════════════════════
  //  MODULE LOADER — AXE 8.2
  // ═══════════════════════════════════════════════════════════

  const _loadedModules = {};
  const MODULE_MAP = {
    'pdt':            '/static/modules/pdt.js',
    'boats':          '/static/modules/boats.js',
    'picture-boats':  '/static/modules/picture-boats.js',
    'budget':         '/static/modules/budget.js',
    'transport':      '/static/modules/transport.js',
    'fuel':           '/static/modules/fuel.js',
    'labour':         '/static/modules/labour.js',
    'security-boats': '/static/modules/security-boats.js',
    'locations':      '/static/modules/locations.js',
    'guards':         '/static/modules/guards.js',
    'fnb':            '/static/modules/fnb.js',
    'dashboard':      '/static/modules/dashboard.js',
    'alerts':         '/static/modules/alerts.js',
    'admin':          '/static/modules/admin.js',
    'touch-drag':     '/static/modules/touch-drag.js',
  };

  // Dependencies: some modules need other modules loaded first
  const MODULE_DEPS = {
    'budget': ['boats', 'transport', 'fuel', 'labour', 'security-boats', 'locations', 'guards'],
    'dashboard': ['boats'],
  };

  async function _loadModule(name) {
    if (_loadedModules[name]) return;
    // Load dependencies first
    const deps = MODULE_DEPS[name] || [];
    for (const dep of deps) {
      await _loadModule(dep);
    }
    if (_loadedModules[name]) return; // check again after deps
    const url = MODULE_MAP[name];
    if (!url) return;
    try {
      _loadedModules[name] = true; // Mark early to prevent re-entry
      await import(url);
    } catch (e) {
      console.error(`[MODULE] Failed to load ${name}:`, e);
      _loadedModules[name] = false;
    }
  }

  // Preload critical modules on startup
  async function _preloadModules() {
    // PDT and boats are loaded at startup, preload their modules
    await _loadModule('touch-drag');
    await Promise.all([
      _loadModule('pdt'),
      _loadModule('boats'),
      _loadModule('alerts'),
    ]);
  }

""")

# Now add the groups code (lines 11897-11958)
output.append(extract(11897, 11958))

# Add the init function (lines 11702-11896)
# But we need to modify init to include module preloading
init_code = extract(11702, 11896)
# Insert _preloadModules() call after the auth state loading
# Replace the original _selectProject content to preload modules
init_code = init_code.replace(
    "await Promise.all([loadShootingDays(), loadBoatsData(), loadPictureBoatsData(), _loadFuelGlobals()]);",
    "await Promise.all([loadShootingDays(), loadBoatsData(), loadPictureBoatsData(), _loadFuelGlobals()]);\n      await _preloadModules();"
)
output.append('\n')
output.append(init_code)

# ── Section 6: FAB (lines 12250-12286)
output.append('\n')
output.append(extract(12250, 12286))

# ── Section 7: Pull-to-refresh (lines 12287-12383)
output.append('\n')
output.append(extract(12287, 12383))

# Now we need to modify setTab to include lazy loading
# The original setTab is in lines 912-937, already included in section 1
# We'll add a wrapper that loads modules before rendering

output.append("""

  // ═══════════════════════════════════════════════════════════
  //  TAB SWITCHING WITH LAZY MODULE LOADING — AXE 8.2
  // ═══════════════════════════════════════════════════════════

  // Override the original setTab with lazy-loading version
  const _originalSetTab = setTab;

  async function setTabLazy(tab) {
    state.tab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
    const panel = $(`view-${tab}`);
    if (panel) panel.classList.add('active');

    // Load module for this tab
    const moduleKey = tab === 'picture-boats' ? 'picture-boats'
                    : tab === 'security-boats' ? 'security-boats'
                    : tab;
    if (MODULE_MAP[moduleKey]) {
      await _loadModule(moduleKey);
    }

    // Call render functions (now available on App after module load)
    if (tab === 'dashboard')       App.renderDashboard?.();
    if (tab === 'pdt')             { if (typeof _pdtView !== 'undefined' && _pdtView === 'calendar') { App._initCalMonth?.(); App.renderPDTCalendar?.(); } else App.renderPDT?.(); }
    if (tab === 'boats')           { _tabCtx = 'boats';     App.renderBoats?.(); }
    if (tab === 'picture-boats')   { _tabCtx = 'picture';   App.renderPictureBoats?.(); }
    if (tab === 'transport')       { _tabCtx = 'transport'; App._loadAndRenderTransport?.(); }
    if (tab === 'fuel')            App._loadAndRenderFuel?.();
    if (tab === 'budget')          App.renderBudget?.();
    if (tab === 'labour')          { _tabCtx = 'labour'; App._loadAndRenderLabour?.(); }
    if (tab === 'security-boats')  App._loadAndRenderSecurityBoats?.();
    if (tab === 'locations')       { state.locationSchedules = null; App.renderLocations?.(); }
    if (tab === 'guards')          { state.guardSchedules = null; state.locationSchedules = null; state.locationSites = null; App.renderGuards?.(); }
    if (tab === 'fnb')             { state.fnbCategories = null; state.fnbItems = null; state.fnbEntries = null; App.renderFnb?.(); }
    if (tab === 'admin')           App.adminSetTab?.(_adminTab || 'users');
    _updateFab();
    _updateBreadcrumb();
    _updateBottomNav();
  }

""")

# ── Section 8: Expose shared context + Public API
output.append("""
  // ═══════════════════════════════════════════════════════════
  //  SHARED CONTEXT FOR MODULES — AXE 8.2
  // ═══════════════════════════════════════════════════════════

  // Expose shared utilities for module files to access
  window._SL = {
    state, authState, $, esc, api, toast, fmtMoney, fmtDate, fmtDateLong,
    _localDk, workingDays, activeWorkingDays, computeWd, effectiveStatus,
    waveClass, waveLabel, _morphHTML, _morphChildren, _morphAttributes,
    _debouncedRender, _renderTimers,
    _flashSaved, _flashSavedCard, _queueCellFlash,
    _skeletonCards, _skeletonTable,
    _virtualScheduleSetup, _getVisibleColRange, _vcolWidth,
    VCOL_WIDTH_DESKTOP, VCOL_WIDTH_MOBILE, VCOL_BUFFER,
    _saveScheduleScroll, _restoreScheduleScroll, _scheduleCellBg,
    _canEdit, _canEditPrices, _canEditFuelPrices, _isAdmin, _canViewTab,
    _applyPriceRestrictions, _applyUIRestrictions,
    authFetch, authDownload, _getAccessToken,
    STATUS_LABEL, SCHEDULE_START, SCHEDULE_END, EV_DEFAULTS,
    EV_LABEL: typeof EV_LABEL !== 'undefined' ? EV_LABEL : {},
    EV_CLASS: typeof EV_CLASS !== 'undefined' ? EV_CLASS : {},
    DEFAULT_BOAT_GROUPS, DEFAULT_PB_GROUPS, DEFAULT_TB_GROUPS,
    _groupColor, _groupOrder,
    _invalidateCache,
    loadShootingDays, loadBoatsData, loadPictureBoatsData,
    showConfirm, cancelConfirm,
    closeSchedulePopover: typeof closeSchedulePopover === 'function' ? closeSchedulePopover : () => {},
    renderSchedulePopover: typeof renderSchedulePopover === 'function' ? renderSchedulePopover : () => {},
    _updateBreadcrumb, _updateBottomNav, _updateFab,
    _loadModule,
    // Multi-select — these may be defined in boats module, expose stubs
    _multiSelect: typeof _multiSelect !== 'undefined' ? _multiSelect : { active: false, cells: [] },
    _onScheduleMouseDown: typeof _onScheduleMouseDown === 'function' ? _onScheduleMouseDown : () => {},
    _onScheduleMouseOver: typeof _onScheduleMouseOver === 'function' ? _onScheduleMouseOver : () => {},
    multiSelectFill: typeof multiSelectFill === 'function' ? multiSelectFill : () => {},
    multiSelectClear: typeof multiSelectClear === 'function' ? multiSelectClear : () => {},
    multiSelectCancel: typeof multiSelectCancel === 'function' ? multiSelectCancel : () => {},
    // Expose mutable shared vars
    get tabCtx() { return _tabCtx; },
    set tabCtx(v) { _tabCtx = v; },
    get assignCtx() { return _assignCtx; },
    set assignCtx(v) { _assignCtx = v; },
    get schPop() { return _schPop; },
    set schPop(v) { _schPop = v; },
    get drag() { return _drag; },
    set drag(v) { _drag = v; },
    get dragJustEnded() { return _dragJustEnded; },
    set dragJustEnded(v) { _dragJustEnded = v; },
  };

  // ── Public API ─────────────────────────────────────────────
  const App = {
    setTab: setTabLazy,
    // Auth
    logout, authState,
    _canEdit, _canEditPrices, _canEditFuelPrices, _isAdmin, _canViewTab,
    _applyPriceRestrictions,
    // Core UI
    showConfirm, cancelConfirm,
    toggleTheme,
    // Navigation
    toggleBottomNavMore, _updateBreadcrumb,
    openShortcutsPanel, closeShortcutsPanel,
    // Search
    _openSearch, _closeSearch,
    // History undo
    _undoFromToast,
    // FAB
    fabAction,
    // AXE 5.4 — Feedback
    _updateNetIndicator, _updateOfflineCounter,
    // Groups
    openGroupsModal, closeGroupsModal, addGroup, removeGroup,
    // Init
    init,
  };

  // Store reference so modules can add to App
  window.App = App;

  return App;
""")

# Close the IIFE
output.append("})();\n\n")

# ── After IIFE: DOMContentLoaded + SW + offline detection (lines 12519-12544)
output.append(extract(12519, 12544))

# Write the new app.js
with open('static/app.js', 'w') as f:
    f.write(''.join(output))

print(f"Created static/app.js ({sum(len(s.splitlines()) for s in output)} lines)")
