#!/usr/bin/env python3
"""Split app-monolith.js into ES6 modules for ShootLogix AXE 8.2"""

import os

SRC = 'static/app-monolith.js'
MODULES_DIR = 'static/modules'

# Read all lines
with open(SRC, 'r') as f:
    lines = f.readlines()

total = len(lines)
print(f"Total lines: {total}")

# Section boundaries (0-indexed line numbers)
# Format: (start_line_1indexed, end_line_1indexed, module_name, description)
SECTIONS = [
    # Core stays in app.js (lines 1-999 + confirm dialog + theme + search + alerts + fab + pull-to-refresh + init + groups)
    # Module sections:
    (1001, 1998, 'pdt', 'PDT VIEW'),
    (1999, 3796, 'boats', 'BOATS VIEW'),
    (3797, 4426, 'picture-boats', 'PICTURE BOATS TAB'),
    (4427, 5017, 'budget', 'BUDGET (consolidated)'),
    (5018, 5811, 'transport', 'TRANSPORT'),
    (5812, 6638, 'fuel', 'FUEL'),
    # 6639-6658: Confirm dialog -> stays in core
    (6659, 7548, 'labour', 'LABOUR MODULE'),
    (7549, 8445, 'security-boats', 'SECURITY BOATS MODULE'),
    (8446, 9083, 'locations', 'LOCATIONS MODULE'),
    (9084, 10554, 'guards', 'GUARDS MODULE'),
    (10555, 11142, 'fnb', 'FNB MODULE'),
    # 11143-11159: Theme -> core
    (11160, 11455, 'dashboard', 'DASHBOARD VIEW'),
    (11456, 11555, 'alerts', 'SCHEDULING ALERTS'),
    # 11556-11700: Search -> core
    # 11700-11958: Init -> core
    (11959, 12249, 'admin', 'ADMIN PANEL'),
    # 12250+: FAB, Pull-to-refresh, Public API -> core
]

# Shared dependencies that each module needs
SHARED_IMPORTS = """const SL = window._SL;
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
"""

# Extract functions that are in the public API (return block)
# We'll parse the return block to know which functions each module exposes

def extract_module_code(start, end):
    """Extract lines from the monolith (1-indexed, inclusive)"""
    return ''.join(lines[start-1:end])

def find_function_names(code):
    """Find all function definitions in a code block"""
    import re
    names = set()
    # Match: function name(, async function name(, const name = (, let name = (
    for m in re.finditer(r'(?:async\s+)?function\s+(\w+)\s*\(', code):
        names.add(m.group(1))
    return names

def create_module_file(name, code, desc):
    """Create an ES6 module file"""
    # Find all function names defined in this module
    func_names = find_function_names(code)

    # Create the module content
    content = f'/* {desc} — ES6 Module */\n'
    content += f'/* Auto-split from app-monolith.js — AXE 8.2 */\n\n'
    content += SHARED_IMPORTS + '\n'
    content += code + '\n\n'

    # Register public functions on window.App
    if func_names:
        # Filter to only include functions that are in the public API
        content += '// Register module functions on App\n'
        content += 'Object.assign(window.App, {\n'
        for fn in sorted(func_names):
            # Skip private functions (starting with _) that aren't in the public API
            # But some _ functions ARE public (like _setBudgetHistoryTab)
            content += f'  {fn},\n'
        content += '});\n'

    filepath = os.path.join(MODULES_DIR, f'{name}.js')
    with open(filepath, 'w') as f:
        f.write(content)
    print(f"  Created {filepath} ({len(code.splitlines())} lines, {len(func_names)} functions)")

# Create module files
os.makedirs(MODULES_DIR, exist_ok=True)

for start, end, name, desc in SECTIONS:
    code = extract_module_code(start, end)
    create_module_file(name, code, desc)

print(f"\nCreated {len(SECTIONS)} module files")

# Now identify core sections (everything NOT in a module)
core_ranges = []
prev_end = 0
for start, end, name, desc in sorted(SECTIONS, key=lambda x: x[0]):
    if start > prev_end + 1:
        core_ranges.append((prev_end + 1, start - 1))
    prev_end = end
if prev_end < total:
    core_ranges.append((prev_end + 1, total))

print(f"\nCore ranges: {core_ranges}")
core_lines = 0
for s, e in core_ranges:
    core_lines += (e - s + 1)
print(f"Core lines: {core_lines}")
