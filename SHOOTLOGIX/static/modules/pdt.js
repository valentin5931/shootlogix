/* PDT VIEW — ES6 Module */
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
  //  PDT VIEW
  // ═══════════════════════════════════════════════════════════

  // Tide status → SVG icon (16×16, blue)
  const TIDE_ICONS = {
    E: '<svg class="tide-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 8h12M11 5l3 3-3 3M5 11l-3-3 3-3" stroke="#3B82F6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    D: '<svg class="tide-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 2v12M5 11l3 3 3-3" stroke="#3B82F6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    M: '<svg class="tide-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 14V2M11 5L8 2 5 5" stroke="#3B82F6" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  function tideIcon(statut) {
    return TIDE_ICONS[statut] || esc(statut || '');
  }

  // Event type → badge label + CSS class
  const EV_LABEL = { game: t('pdt.event_game'), arena: t('pdt.event_arena'), council: t('pdt.event_council'), off: t('pdt.event_off') };
  const EV_CLASS = { game: 'ev-game', arena: 'ev-arena', council: 'ev-council', off: 'ev-off' };

  function renderPDT() {
    const days = state.shootingDays;
    $('pdt-count').textContent = days.length
      ? `${days.length} shooting days · Mar 25 → Apr 25, 2026`
      : t('pdt.no_days');

    const tbody = $('pdt-tbody');
    if (!days.length) {
      tbody.innerHTML = `<tr><td colspan="13" style="text-align:center;padding:3rem;color:var(--text-4)">
        ${t('pdt.no_days')}
      </td></tr>`;
      return;
    }

    const rows = [];
    for (const d of days) {
      // Use per-event rows when available, fall back to single row from day fields
      const events = (d.events && d.events.length)
        ? d.events
        : [{ event_type: d.conseil_soir ? 'game' : (d.game_name === 'OFF GAME' ? 'off' : 'game'),
             name: d.game_name, location: d.location,
             heure_rehearsal: d.heure_rehearsal, heure_host: d.heure_animateur,
             heure_event: d.heure_game, heure_depart: d.heure_depart_candidats,
             maree_hauteur: d.maree_hauteur, maree_statut: d.maree_statut }];

      const n = events.length;
      const statusLabel = STATUS_LABEL[d.status] || d.status || 'Draft';
      const hasCouncil  = events.some(e => e.event_type === 'council');
      const rowClass    = hasCouncil ? 'conseil-row' : '';

      events.forEach((ev, idx) => {
        const isFirst = idx === 0;
        const etype   = ev.event_type || 'game';
        const evClass = EV_CLASS[etype] || 'ev-game';
        const evLabel = EV_LABEL[etype] || etype.toUpperCase();
        const loc     = ev.location || (isFirst ? d.location : null);
        const name    = ev.name || (isFirst && etype === 'game' ? d.game_name : null);
        const timeVal = ev.heure_event;
        const depArr  = ev.heure_depart || ev.heure_arrivee;
        const tide    = ev.maree_hauteur != null
          ? `<span class="day-tide tide-${ev.maree_statut || ''}" title="${ev.maree_statut || ''}">${ev.maree_hauteur}m ${tideIcon(ev.maree_statut)}</span>`
          : '<span style="color:var(--text-4)">—</span>';
        const rehearsal = ev.heure_rehearsal || (isFirst ? d.heure_rehearsal : null);
        const host      = ev.heure_host || (isFirst ? d.heure_animateur : null);

        rows.push(`<tr class="${rowClass} ${evClass}-row" onclick="App.editDay(${d.id})"
          onmouseenter="App.showPDTTooltip(event,'${d.date}')" onmouseleave="App.hidePDTTooltip()">
          ${isFirst ? `<td rowspan="${n}" class="td-day-num"><span class="day-num">D${d.day_number}</span></td>` : ''}
          ${isFirst ? `<td rowspan="${n}" class="td-date">
            <div class="day-date">${fmtDateLong(d.date)}</div>
            <div style="font-size:.65rem;color:var(--text-4);font-family:monospace">${d.date || ''}</div>
          </td>` : ''}
          <td><span class="event-badge ${evClass}">${evLabel}</span></td>
          <td><span class="day-location">${esc(loc || '—')}</span></td>
          <td><span class="day-game">${esc(name || '—')}</span></td>
          <td><span class="day-time">${esc(rehearsal || '—')}</span></td>
          <td><span class="day-time">${esc(host || '—')}</span></td>
          <td><span class="day-time ev-time">${esc(timeVal || '—')}</span></td>
          <td><span class="day-time">${esc(depArr || '—')}</span></td>
          <td>${tide}</td>
          ${isFirst ? `<td rowspan="${n}" style="text-align:center;color:var(--text-2)">${d.nb_candidats != null ? d.nb_candidats : '—'}</td>` : ''}
          ${isFirst ? `<td rowspan="${n}"><span class="status-badge status-${d.status || 'brouillon'}">${esc(statusLabel)}</span></td>` : ''}
          ${isFirst ? `<td rowspan="${n}" style="white-space:nowrap">
            <button class="btn btn-icon btn-secondary btn-sm"
              onclick="event.stopPropagation();App.editDay(${d.id})" title="Edit">✎</button>
          </td>` : ''}
        </tr>`);
      });
    }
    tbody.innerHTML = rows.join('');
  }

  // ═══════════════════════════════════════════════════════════
  //  PDT CALENDAR VIEW (AXE 7.1)
  // ═══════════════════════════════════════════════════════════

  let _pdtView = 'table';   // 'table' | 'calendar'
  let _pdtCalMonth = null;   // { year, month } currently displayed
  let _pdtCalExpanded = null; // date string of expanded day (or null)

  function setPDTView(view) {
    _pdtView = view;
    document.querySelectorAll('.pdt-view-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.pdtView === view);
    });
    const tableCt = $('pdt-table-container');
    const calCt   = $('pdt-calendar-container');
    if (view === 'table') {
      tableCt.style.display = '';
      calCt.style.display = 'none';
      renderPDT();
    } else {
      tableCt.style.display = 'none';
      calCt.style.display = '';
      _initCalMonth();
      renderPDTCalendar();
    }
  }

  function _initCalMonth() {
    if (_pdtCalMonth) return;
    const days = state.shootingDays;
    if (days.length) {
      const first = new Date(days[0].date + 'T00:00:00');
      _pdtCalMonth = { year: first.getFullYear(), month: first.getMonth() };
    } else {
      const now = new Date();
      _pdtCalMonth = { year: now.getFullYear(), month: now.getMonth() };
    }
  }

  function pdtCalPrev() {
    _pdtCalMonth.month--;
    if (_pdtCalMonth.month < 0) { _pdtCalMonth.month = 11; _pdtCalMonth.year--; }
    _pdtCalExpanded = null;
    renderPDTCalendar();
  }

  function pdtCalNext() {
    _pdtCalMonth.month++;
    if (_pdtCalMonth.month > 11) { _pdtCalMonth.month = 0; _pdtCalMonth.year++; }
    _pdtCalExpanded = null;
    renderPDTCalendar();
  }

  function renderPDTCalendar() {
    _initCalMonth();
    const { year, month } = _pdtCalMonth;
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    $('pdt-cal-month-label').textContent = `${MONTHS[month]} ${year}`;

    // Build date → shooting day lookup
    const dayMap = {};
    for (const d of state.shootingDays) {
      if (d.date) dayMap[d.date] = d;
    }

    // Calendar grid: starts on Monday (ISO)
    const firstOfMonth = new Date(year, month, 1);
    const lastOfMonth  = new Date(year, month + 1, 0);
    const startDow = (firstOfMonth.getDay() + 6) % 7; // 0=Mon
    const daysInMonth = lastOfMonth.getDate();

    const todayStr = new Date().toISOString().slice(0, 10);
    const cells = [];

    // Day-of-week headers
    const DOW = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    for (const dow of DOW) {
      cells.push(`<div class="pdt-cal-dow">${dow}</div>`);
    }

    // Leading empty cells (previous month)
    const prevMonth = new Date(year, month, 0);
    for (let i = startDow - 1; i >= 0; i--) {
      const d = prevMonth.getDate() - i;
      cells.push(`<div class="pdt-cal-cell outside"><span class="pdt-cal-date">${d}</span></div>`);
    }

    // Days of current month
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const sd = dayMap[dateStr];
      const isToday = dateStr === todayStr;
      const isExpanded = dateStr === _pdtCalExpanded;
      const classes = ['pdt-cal-cell'];
      if (sd) classes.push('has-day');
      if (isToday) classes.push('today');
      if (isExpanded) classes.push('expanded');

      let eventsHtml = '';
      if (sd) {
        const events = (sd.events && sd.events.length)
          ? sd.events
          : [{ event_type: sd.conseil_soir ? 'game' : (sd.game_name === 'OFF GAME' ? 'off' : 'game'),
               name: sd.game_name || '', location: sd.location || '' }];
        eventsHtml = '<div class="pdt-cal-events">';
        for (const ev of events) {
          const etype = ev.event_type || 'game';
          const evCls = EV_CLASS[etype] || 'ev-game';
          const label = ev.name || EV_LABEL[etype] || etype.toUpperCase();
          eventsHtml += `<div class="pdt-cal-ev ${evCls}">${esc(label)}</div>`;
        }
        eventsHtml += '</div>';
      }

      const dayNumHtml = sd ? `<span class="pdt-cal-day-num">D${sd.day_number}</span>` : '';
      const onclick = sd ? `onclick="App.pdtCalToggleDay('${dateStr}')"` : '';

      cells.push(`<div class="${classes.join(' ')}" ${onclick}>
        <span class="pdt-cal-date">${d}</span>${dayNumHtml}
        ${eventsHtml}
      </div>`);

      // Insert inline detail row after the end of the week row if this day is expanded
      if (isExpanded && sd) {
        // Figure out position in week (0-based from Monday)
        const cellDow = (new Date(year, month, d).getDay() + 6) % 7;
        // Pad remaining cells to complete the week row
        const remaining = 6 - cellDow;
        for (let r = d + 1; r <= Math.min(d + remaining, daysInMonth); r++) {
          const rDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(r).padStart(2, '0')}`;
          const rSd = dayMap[rDateStr];
          const rIsToday = rDateStr === todayStr;
          const rClasses = ['pdt-cal-cell'];
          if (rSd) rClasses.push('has-day');
          if (rIsToday) rClasses.push('today');

          let rEvHtml = '';
          if (rSd) {
            const revents = (rSd.events && rSd.events.length)
              ? rSd.events
              : [{ event_type: rSd.conseil_soir ? 'game' : (rSd.game_name === 'OFF GAME' ? 'off' : 'game'),
                   name: rSd.game_name || '', location: rSd.location || '' }];
            rEvHtml = '<div class="pdt-cal-events">';
            for (const ev of revents) {
              const etype = ev.event_type || 'game';
              rEvHtml += `<div class="pdt-cal-ev ${EV_CLASS[etype] || 'ev-game'}">${esc(ev.name || EV_LABEL[etype] || etype.toUpperCase())}</div>`;
            }
            rEvHtml += '</div>';
          }
          const rDayNum = rSd ? `<span class="pdt-cal-day-num">D${rSd.day_number}</span>` : '';
          const rOnclick = rSd ? `onclick="App.pdtCalToggleDay('${rDateStr}')"` : '';
          cells.push(`<div class="${rClasses.join(' ')}" ${rOnclick}>
            <span class="pdt-cal-date">${r}</span>${rDayNum}${rEvHtml}
          </div>`);
        }
        // Pad with empty cells if week extends beyond month
        for (let r = daysInMonth + 1; r <= d + remaining; r++) {
          cells.push(`<div class="pdt-cal-cell outside"><span class="pdt-cal-date">${r - daysInMonth}</span></div>`);
        }
        d += remaining; // skip the days we already rendered

        // Now insert the detail row spanning the full week
        cells.push(_buildCalDetail(sd));
      }
    }

    // Trailing empty cells
    const totalCells = cells.length - 7; // minus DOW headers
    const trailingNeeded = (7 - (totalCells % 7)) % 7;
    for (let i = 1; i <= trailingNeeded; i++) {
      cells.push(`<div class="pdt-cal-cell outside"><span class="pdt-cal-date">${i}</span></div>`);
    }

    $('pdt-cal-grid').innerHTML = cells.join('');
  }

  function _buildCalDetail(sd) {
    const events = (sd.events && sd.events.length)
      ? sd.events
      : [{ event_type: sd.conseil_soir ? 'game' : (sd.game_name === 'OFF GAME' ? 'off' : 'game'),
           name: sd.game_name, location: sd.location,
           heure_rehearsal: sd.heure_rehearsal, heure_host: sd.heure_animateur,
           heure_event: sd.heure_game, heure_depart: sd.heure_depart_candidats,
           maree_hauteur: sd.maree_hauteur, maree_statut: sd.maree_statut }];

    let evRows = '';
    for (const ev of events) {
      const etype = ev.event_type || 'game';
      const evCls = EV_CLASS[etype] || 'ev-game';
      const evLbl = EV_LABEL[etype] || etype.toUpperCase();
      const loc = ev.location || sd.location || '';
      const name = ev.name || sd.game_name || '';

      const times = [];
      if (ev.heure_rehearsal) times.push(`<span class="pdt-cal-detail-ev-time"><strong>Rehearsal</strong> ${esc(ev.heure_rehearsal)}</span>`);
      if (ev.heure_host) times.push(`<span class="pdt-cal-detail-ev-time"><strong>Host</strong> ${esc(ev.heure_host)}</span>`);
      if (ev.heure_event) times.push(`<span class="pdt-cal-detail-ev-time"><strong>Event</strong> ${esc(ev.heure_event)}</span>`);
      if (ev.heure_depart) times.push(`<span class="pdt-cal-detail-ev-time"><strong>Dep</strong> ${esc(ev.heure_depart)}</span>`);
      if (ev.heure_arrivee) times.push(`<span class="pdt-cal-detail-ev-time"><strong>Arr</strong> ${esc(ev.heure_arrivee)}</span>`);
      if (ev.heure_teaser) times.push(`<span class="pdt-cal-detail-ev-time"><strong>Teaser</strong> ${esc(ev.heure_teaser)}</span>`);
      if (ev.heure_fin) times.push(`<span class="pdt-cal-detail-ev-time"><strong>End</strong> ${esc(ev.heure_fin)}</span>`);

      const tideHtml = ev.maree_hauteur != null
        ? `<span class="pdt-cal-detail-ev-time" title="${ev.maree_statut || ''}"><strong>Tide</strong> ${ev.maree_hauteur}m ${tideIcon(ev.maree_statut)}</span>`
        : '';
      if (tideHtml) times.push(tideHtml);

      evRows += `<div class="pdt-cal-detail-ev">
        <span class="event-badge ${evCls}">${evLbl}</span>
        <div class="pdt-cal-detail-ev-info">
          <span class="pdt-cal-detail-ev-name">${esc(name) || evLbl}</span>
          ${loc ? `<span class="pdt-cal-detail-ev-loc">${esc(loc)}</span>` : ''}
          ${times.length ? `<div class="pdt-cal-detail-ev-times">${times.join('')}</div>` : ''}
          ${ev.reward || ev.notes ? `<span class="pdt-cal-detail-ev-time" style="margin-top:2px">${esc(ev.reward || '')} ${esc(ev.notes || '')}</span>` : ''}
        </div>
      </div>`;
    }

    const statusLabel = STATUS_LABEL[sd.status] || sd.status || 'Draft';
    let metaItems = '';
    if (sd.nb_candidats != null) metaItems += `<span>Candidates: ${sd.nb_candidats}</span>`;
    metaItems += `<span>Status: ${esc(statusLabel)}</span>`;
    if (sd.recompense) metaItems += `<span>Reward: ${esc(sd.recompense)}</span>`;
    if (sd.notes) metaItems += `<span>Notes: ${esc(sd.notes)}</span>`;

    return `<div class="pdt-cal-detail">
      <div class="pdt-cal-detail-header">
        <span class="pdt-cal-detail-title">D${sd.day_number}</span>
        <span class="pdt-cal-detail-date">${fmtDateLong(sd.date)} - ${sd.date}</span>
        <button class="pdt-cal-detail-close" onclick="App.pdtCalToggleDay(null)" title="Close">✕</button>
      </div>
      <div class="pdt-cal-detail-events">${evRows}</div>
      <div class="pdt-cal-detail-meta">${metaItems}</div>
      <div class="pdt-cal-detail-edit">
        <button class="btn btn-sm btn-secondary" onclick="App.editDay(${sd.id})">✎ Edit day</button>
      </div>
    </div>`;
  }

  function pdtCalToggleDay(dateStr) {
    if (_pdtCalExpanded === dateStr || dateStr === null) {
      _pdtCalExpanded = null;
    } else {
      _pdtCalExpanded = dateStr;
    }
    renderPDTCalendar();
  }

  // PDT — Import PDF (server-side fallback, kept for backward compat)
  let _pdtImporting = false;

  async function parsePDT() {
    if (_pdtImporting) return;
    if (state.shootingDays.length > 0) {
      showConfirm(
        `${state.shootingDays.length} days already exist. Replace with PDF V1 data?`,
        () => _doParsePDT(true)
      );
    } else {
      await _doParsePDT(false);
    }
  }

  async function _doParsePDT(force) {
    if (_pdtImporting) return;
    _pdtImporting = true;
    try {
      $('pdt-status').textContent = 'Importing…';
      const res = await api('POST', `/api/productions/${state.prodId}/parse-pdt`, { force });
      await loadShootingDays();
      renderPDT();
      toast(`${res.created} days imported from PDF`);
    } catch (e) {
      toast('PDF import error: ' + e.message, 'error');
    } finally {
      $('pdt-status').textContent = '';
      _pdtImporting = false;
    }
  }

  // PDT — Upload PDF from browser file picker
  function triggerPDTUpload() {
    if (_pdtImporting) return;
    $('pdt-file-input').click();
  }

  async function handlePDTFileUpload(inputEl) {
    if (_pdtImporting) return;
    const file = inputEl.files[0];
    inputEl.value = ''; // reset for re-upload
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast('Please select a PDF file', 'error');
      return;
    }
    const hasDays = state.shootingDays.length > 0;
    if (hasDays) {
      showConfirm(
        `${state.shootingDays.length} days already exist. Merge PDF data? (Days with status "Edited" will be kept.)`,
        () => _doUploadPDT(file)
      );
    } else {
      await _doUploadPDT(file);
    }
  }

  async function _doUploadPDT(file) {
    if (_pdtImporting) return;
    _pdtImporting = true;
    try {
      $('pdt-status').textContent = 'Uploading & parsing…';
      const form = new FormData();
      form.append('pdf', file);
      const res = await authFetch(`/api/productions/${state.prodId}/upload-pdt`, {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const result = await res.json();
      await loadShootingDays();
      renderPDT();
      const parts = [];
      if (result.created > 0)  parts.push(`${result.created} created`);
      if (result.updated > 0)  parts.push(`${result.updated} updated`);
      if (result.skipped > 0)  parts.push(`${result.skipped} skipped (edited)`);
      toast(parts.length ? parts.join(', ') : 'No changes from PDF');
    } catch (e) {
      toast('PDF upload error: ' + e.message, 'error');
    } finally {
      $('pdt-status').textContent = '';
      _pdtImporting = false;
    }
  }

  // PDT — Edit day (populate form)
  function editDay(dayId) {
    const d = state.shootingDays.find(x => x.id === dayId);
    if (!d) return;
    state.editingDayId = dayId;
    state.editingDayEvents = JSON.parse(JSON.stringify(d.events || []));
    $('day-modal-title').textContent = `Day ${d.day_number} — ${fmtDateLong(d.date)}`;
    $('dm-date').value           = d.date || '';
    $('dm-day-number').value     = d.day_number || '';

    // Populate top modal fields from the first event if events exist,
    // so the top modal always reflects the actual displayed data
    const firstEv = state.editingDayEvents.length ? state.editingDayEvents[0] : null;
    $('dm-location').value       = (firstEv && firstEv.location) || d.location || '';
    $('dm-game').value           = (firstEv && firstEv.name) || d.game_name || '';
    $('dm-rehearsal').value      = (firstEv && firstEv.heure_rehearsal) || d.heure_rehearsal || '';
    $('dm-animateur').value      = (firstEv && firstEv.heure_host) || d.heure_animateur || '';
    $('dm-game-time').value      = (firstEv && firstEv.heure_event) || d.heure_game || '';
    $('dm-depart').value         = (firstEv && firstEv.heure_depart) || d.heure_depart_candidats || '';
    $('dm-candidats').value      = d.nb_candidats != null ? d.nb_candidats : '';
    const mareeH = firstEv && firstEv.maree_hauteur != null ? firstEv.maree_hauteur : d.maree_hauteur;
    $('dm-maree-h').value        = mareeH != null ? mareeH : '';
    const mareeS = (firstEv && firstEv.maree_statut) || d.maree_statut;
    $('dm-maree-s').value        = mareeS || '';
    $('dm-conseil').value        = d.conseil_soir ? '1' : '0';
    $('dm-recompense').value     = (firstEv && firstEv.reward) || d.recompense || '';
    $('dm-status').value         = d.status || 'brouillon';
    $('dm-notes').value          = d.notes || '';
    $('dm-delete-btn').classList.remove('hidden');
    // Collapse events section by default
    _collapseEventsSection();
    _renderDayEvents();
    $('day-modal-overlay').classList.remove('hidden');
  }

  // Add day (blank form — reset events too)
  function addDay() {
    state.editingDayId = null;
    state.editingDayEvents = [];
    $('day-modal-title').textContent = 'New shooting day';
    $('dm-date').value           = '';
    $('dm-day-number').value     = state.shootingDays.length + 1;
    $('dm-location').value       = '';
    $('dm-game').value           = '';
    $('dm-rehearsal').value      = '';
    $('dm-animateur').value      = '';
    $('dm-game-time').value      = '';
    $('dm-depart').value         = '';
    $('dm-candidats').value      = '';
    $('dm-maree-h').value        = '';
    $('dm-maree-s').value        = '';
    $('dm-conseil').value        = '0';
    $('dm-recompense').value     = '';
    $('dm-status').value         = 'brouillon';
    $('dm-notes').value          = '';
    $('dm-delete-btn').classList.add('hidden');
    // Collapse events section by default
    _collapseEventsSection();
    _renderDayEvents();
    $('day-modal-overlay').classList.remove('hidden');
  }

  // Render the event rows inside the modal — FULL editable fields
  function _renderDayEvents() {
    const el = $('dm-events-list');
    if (!el) return;
    if (!state.editingDayEvents.length) {
      el.innerHTML = `<div style="font-size:.75rem;color:var(--text-4);padding:.2rem 0">No events yet — add one below.</div>`;
      return;
    }
    el.innerHTML = state.editingDayEvents.map((ev, idx) => {
      const etype = ev.event_type || 'game';
      const evClass = EV_CLASS[etype] || 'ev-game';
      const evLabel = EV_LABEL[etype] || etype.toUpperCase();
      return `
        <div class="dm-event-card" data-idx="${idx}">
          <div class="dm-event-header">
            <span class="event-badge ${evClass}">${evLabel}</span>
            <select class="ev-type-sel" data-field="event_type" onchange="App._updateDayEventField(${idx},'event_type',this.value);App._renderDayEvents()">
              <option value="game" ${etype==='game'?'selected':''}>GAME</option>
              <option value="arena" ${etype==='arena'?'selected':''}>ARENA</option>
              <option value="council" ${etype==='council'?'selected':''}>COUNCIL</option>
              <option value="off" ${etype==='off'?'selected':''}>OFF</option>
            </select>
            <button class="btn-del-ev" onclick="App.deleteEventFromDay(${idx})" title="Remove event">✕</button>
          </div>
          <div class="dm-event-fields">
            <div class="dm-ev-row">
              <label>Name</label>
              <input type="text" data-field="name" value="${esc(ev.name || '')}" placeholder="Event name" oninput="App._updateDayEventField(${idx},'name',this.value)">
            </div>
            <div class="dm-ev-row">
              <label>Location</label>
              <input type="text" data-field="location" value="${esc(ev.location || '')}" placeholder="Island / site" oninput="App._updateDayEventField(${idx},'location',this.value)">
            </div>
            <div class="dm-ev-grid-3">
              <div class="dm-ev-row">
                <label>Rehearsal</label>
                <input type="text" data-field="heure_rehearsal" value="${esc(ev.heure_rehearsal || '')}" placeholder="9H30" oninput="App._updateDayEventField(${idx},'heure_rehearsal',this.value)">
              </div>
              <div class="dm-ev-row">
                <label>Host</label>
                <input type="text" data-field="heure_host" value="${esc(ev.heure_host || '')}" placeholder="11H15" oninput="App._updateDayEventField(${idx},'heure_host',this.value)">
              </div>
              <div class="dm-ev-row">
                <label>Event time</label>
                <input type="text" data-field="heure_event" value="${esc(ev.heure_event || '')}" placeholder="12H00" oninput="App._updateDayEventField(${idx},'heure_event',this.value)">
              </div>
            </div>
            <div class="dm-ev-grid-3">
              <div class="dm-ev-row">
                <label>Departure</label>
                <input type="text" data-field="heure_depart" value="${esc(ev.heure_depart || '')}" placeholder="Dep." oninput="App._updateDayEventField(${idx},'heure_depart',this.value)">
              </div>
              <div class="dm-ev-row">
                <label>Arrival</label>
                <input type="text" data-field="heure_arrivee" value="${esc(ev.heure_arrivee || '')}" placeholder="Arr." oninput="App._updateDayEventField(${idx},'heure_arrivee',this.value)">
              </div>
              <div class="dm-ev-row">
                <label>Teaser</label>
                <input type="text" data-field="heure_teaser" value="${esc(ev.heure_teaser || '')}" placeholder="Teaser" oninput="App._updateDayEventField(${idx},'heure_teaser',this.value)">
              </div>
            </div>
            <div class="dm-ev-grid-3">
              <div class="dm-ev-row">
                <label>End</label>
                <input type="text" data-field="heure_fin" value="${esc(ev.heure_fin || '')}" placeholder="End" oninput="App._updateDayEventField(${idx},'heure_fin',this.value)">
              </div>
              <div class="dm-ev-row">
                <label>Tide (m)</label>
                <input type="number" step="0.01" data-field="maree_hauteur" value="${ev.maree_hauteur != null ? ev.maree_hauteur : ''}" oninput="App._updateDayEventField(${idx},'maree_hauteur',this.value!==''?parseFloat(this.value):null)">
              </div>
              <div class="dm-ev-row">
                <label>Tide st.</label>
                <select data-field="maree_statut" onchange="App._updateDayEventField(${idx},'maree_statut',this.value)">
                  <option value="">—</option>
                  <option value="E" ${ev.maree_statut==='E'?'selected':''}>E</option>
                  <option value="D" ${ev.maree_statut==='D'?'selected':''}>D</option>
                  <option value="M" ${ev.maree_statut==='M'?'selected':''}>M</option>
                </select>
              </div>
            </div>
            <div class="dm-ev-grid-2">
              <div class="dm-ev-row">
                <label>Reward</label>
                <input type="text" data-field="reward" value="${esc(ev.reward || '')}" placeholder="Reward" oninput="App._updateDayEventField(${idx},'reward',this.value)">
              </div>
              <div class="dm-ev-row">
                <label>Notes</label>
                <input type="text" data-field="notes" value="${esc(ev.notes || '')}" placeholder="Notes" oninput="App._updateDayEventField(${idx},'notes',this.value)">
              </div>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  // Toggle the advanced events section visibility
  function toggleEventsSection() {
    const sec = $('dm-events-section');
    const label = $('dm-events-toggle-label');
    if (!sec) return;
    if (sec.style.display === 'none') {
      sec.style.display = '';
      if (label) label.textContent = t('pdt.hide_advanced');
    } else {
      sec.style.display = 'none';
      if (label) label.textContent = t('pdt.show_advanced');
    }
  }

  function _collapseEventsSection() {
    const sec = $('dm-events-section');
    const label = $('dm-events-toggle-label');
    if (sec) sec.style.display = 'none';
    if (label) label.textContent = t('pdt.show_advanced');
  }

  // Update a field in the in-modal event list (local state only — saved on saveDay)
  function _updateDayEventField(idx, field, val) {
    if (!state.editingDayEvents[idx]) return;
    // Handle numeric values (e.g. maree_hauteur passed as parseFloat result)
    if (typeof val === 'number') {
      state.editingDayEvents[idx][field] = isNaN(val) ? null : val;
    } else if (val === null || val === undefined) {
      state.editingDayEvents[idx][field] = null;
    } else {
      state.editingDayEvents[idx][field] = String(val).trim() || null;
    }
  }

  function closeDayModal() {
    $('day-modal-overlay').classList.add('hidden');
    state.editingDayId = null;
    state.editingDayEvents = [];
    // Clean up cascade state
    state._cascadeDecision = null;
    state._pendingSaveData = null;
    state._pendingOldDate = null;
  }

  // ── AXE 7.2: Cascade preview modal ───────────────────────────────────────
  function _showCascadePreview(preview, oldDate, newDate) {
    const body = $('cascade-body');
    let html = `<p style="margin:0 0 .75rem"><strong>Date deplacee :</strong> ${oldDate} &rarr; ${newDate}</p>`;
    html += `<p style="margin:0 0 1rem;color:var(--text-2)">Les elements suivants referencent l'ancienne date. Souhaitez-vous les mettre a jour automatiquement ?</p>`;

    // Assignments
    if (preview.assignments.length > 0) {
      html += `<div style="margin-bottom:.75rem">`;
      html += `<div style="font-weight:600;margin-bottom:.25rem">Assignments (${preview.assignments.length})</div>`;
      html += `<div style="border:1px solid var(--border);border-radius:6px;overflow:hidden">`;
      html += `<table style="width:100%;font-size:.8rem;border-collapse:collapse">`;
      html += `<tr style="background:var(--bg-2)"><th style="padding:4px 8px;text-align:left">Module</th><th style="padding:4px 8px;text-align:left">Fonction</th><th style="padding:4px 8px;text-align:left">Entite</th><th style="padding:4px 8px;text-align:left">Impact</th></tr>`;
      for (const a of preview.assignments) {
        html += `<tr style="border-top:1px solid var(--border)"><td style="padding:4px 8px">${a.module}</td><td style="padding:4px 8px">${a.function_name || '-'}</td><td style="padding:4px 8px">${a.entity_name}</td><td style="padding:4px 8px">${(a.impact || []).join(', ')}</td></tr>`;
      }
      html += `</table></div></div>`;
    }

    // Fuel entries
    if (preview.fuel_entries.length > 0) {
      html += `<div style="margin-bottom:.75rem">`;
      html += `<div style="font-weight:600;margin-bottom:.25rem">Fuel entries (${preview.fuel_entries.length})</div>`;
      html += `<div style="border:1px solid var(--border);border-radius:6px;overflow:hidden">`;
      html += `<table style="width:100%;font-size:.8rem;border-collapse:collapse">`;
      html += `<tr style="background:var(--bg-2)"><th style="padding:4px 8px;text-align:left">Type</th><th style="padding:4px 8px;text-align:left">Litres</th><th style="padding:4px 8px;text-align:left">Carburant</th></tr>`;
      for (const f of preview.fuel_entries) {
        html += `<tr style="border-top:1px solid var(--border)"><td style="padding:4px 8px">${f.source_type}</td><td style="padding:4px 8px">${f.liters || 0}L</td><td style="padding:4px 8px">${f.fuel_type}</td></tr>`;
      }
      html += `</table></div></div>`;
    }

    // Location schedules
    if (preview.location_schedules.length > 0) {
      html += `<div style="margin-bottom:.75rem">`;
      html += `<div style="font-weight:600;margin-bottom:.25rem">Location schedules (${preview.location_schedules.length})</div>`;
      html += `<div style="border:1px solid var(--border);border-radius:6px;overflow:hidden">`;
      html += `<table style="width:100%;font-size:.8rem;border-collapse:collapse">`;
      html += `<tr style="background:var(--bg-2)"><th style="padding:4px 8px;text-align:left">Location</th><th style="padding:4px 8px;text-align:left">Statut</th><th style="padding:4px 8px;text-align:left">Verrouille</th></tr>`;
      for (const l of preview.location_schedules) {
        html += `<tr style="border-top:1px solid var(--border)"><td style="padding:4px 8px">${l.location_name}</td><td style="padding:4px 8px">${l.status}</td><td style="padding:4px 8px">${l.locked ? 'Oui' : 'Non'}</td></tr>`;
      }
      html += `</table></div></div>`;
    }

    body.innerHTML = html;
    $('cascade-overlay').classList.remove('hidden');
  }

  function cancelCascade() {
    $('cascade-overlay').classList.add('hidden');
    // Do nothing - user cancelled, day is NOT saved
    state._pendingSaveData = null;
    state._pendingOldDate = null;
  }

  async function applyCascade() {
    $('cascade-overlay').classList.add('hidden');
    state._cascadeDecision = 'apply';
    // Re-trigger saveDay with cascade decision set
    await saveDay();
  }

  async function skipCascade() {
    $('cascade-overlay').classList.add('hidden');
    state._cascadeDecision = 'skip';
    // Re-trigger saveDay without cascade
    await saveDay();
  }

  // Add a new event to a day (creates immediately via API if editing existing day)
  async function addEventToDay(type) {
    const defaults = EV_DEFAULTS[type] || {};
    const ev = {
      event_type: type,
      sort_order: state.editingDayEvents.length,
      name: defaults.name || null,
      location: defaults.location || null,
      heure_rehearsal: defaults.heure_rehearsal || null,
      heure_arrivee:   defaults.heure_arrivee   || null,
      heure_event: null,
    };

    if (state.editingDayId) {
      // Day already exists — create event immediately via API
      try {
        const created = await api('POST',
          `/api/productions/${state.prodId}/shooting-days/${state.editingDayId}/events`,
          { ...ev, shooting_day_id: state.editingDayId });
        state.editingDayEvents.push(created);
        // Keep conseil_soir in sync
        if (type === 'council') $('dm-conseil').value = '1';
      } catch (e) {
        toast('Error adding event: ' + e.message, 'error');
        return;
      }
    } else {
      // New day not saved yet — just add locally
      state.editingDayEvents.push(ev);
      if (type === 'council') $('dm-conseil').value = '1';
    }
    _renderDayEvents();
  }

  // Delete an event from the modal list
  async function deleteEventFromDay(idx) {
    const ev = state.editingDayEvents[idx];
    if (!ev) return;
    if (ev.id && state.editingDayId) {
      try {
        await api('DELETE', `/api/events/${ev.id}`);
      } catch (e) {
        toast('Error deleting event: ' + e.message, 'error');
        return;
      }
    }
    state.editingDayEvents.splice(idx, 1);
    // Re-number sort_order
    state.editingDayEvents.forEach((e, i) => { e.sort_order = i; });
    // Update conseil flag if no council remains
    const hasCouncil = state.editingDayEvents.some(e => e.event_type === 'council');
    if (!hasCouncil) $('dm-conseil').value = '0';
    _renderDayEvents();
  }

  // ─── PDT → Locations sync helper ─────────────────────────────────────────
  // Collects all location names from a shooting day (main + events)
  // and sends them to the backend to sync F days in location_schedules.
  async function _syncPdtLocations(dayDate, dayData, events) {
    if (!dayDate || !state.prodId) return;
    const locs = new Set();
    // Main location on the shooting day
    if (dayData.location && dayData.location.trim()) {
      locs.add(dayData.location.trim());
    }
    // Locations from each event
    if (events && Array.isArray(events)) {
      for (const ev of events) {
        if (ev.location && ev.location.trim()) {
          locs.add(ev.location.trim());
        }
      }
    }
    try {
      await api('POST', `/api/productions/${state.prodId}/sync-pdt-locations`, {
        date: dayDate,
        locations: Array.from(locs),
      });
      // Invalidate location caches so next render picks up changes
      state.locationSites = null;
      state.locationSchedules = null;
    } catch (e) {
      console.warn('PDT→Locations sync warning:', e.message);
    }
  }

  async function _syncPdtLocationsDelete(dayDate) {
    if (!dayDate || !state.prodId) return;
    try {
      await api('POST', `/api/productions/${state.prodId}/sync-pdt-locations`, {
        date: dayDate,
        locations: [],
        deleted: true,
      });
      state.locationSites = null;
      state.locationSchedules = null;
    } catch (e) {
      console.warn('PDT→Locations sync (delete) warning:', e.message);
    }
  }

  async function saveDay() {
    // BUG 3 FIX: validate date is required
    if (!$('dm-date').value) {
      toast('Date is required', 'error');
      return;
    }

    // Read ALL event fields from DOM using data-field attributes (robust, order-independent)
    // (only relevant if advanced events section was opened)
    document.querySelectorAll('.dm-event-card').forEach(card => {
      const idx = parseInt(card.dataset.idx);
      const ev = state.editingDayEvents[idx];
      if (!ev) return;
      card.querySelectorAll('[data-field]').forEach(el => {
        const field = el.dataset.field;
        if (field === 'maree_hauteur') {
          ev[field] = el.value !== '' ? parseFloat(el.value) : null;
        } else {
          ev[field] = (el.value || '').trim() || null;
        }
      });
    });

    // Sync top modal fields to the first event so PDT rendering picks them up.
    // The PDT table renders from events when they exist, so we must keep them in sync.
    if (state.editingDayEvents.length > 0) {
      const firstEv = state.editingDayEvents[0];
      firstEv.location        = $('dm-location').value.trim() || null;
      firstEv.name            = $('dm-game').value.trim() || null;
      firstEv.heure_rehearsal = $('dm-rehearsal').value.trim() || null;
      firstEv.heure_host      = $('dm-animateur').value.trim() || null;
      firstEv.heure_event     = $('dm-game-time').value.trim() || null;
      firstEv.heure_depart    = $('dm-depart').value.trim() || null;
      firstEv.maree_hauteur   = $('dm-maree-h').value !== '' ? parseFloat($('dm-maree-h').value) : null;
      firstEv.maree_statut    = $('dm-maree-s').value || null;
      firstEv.reward          = $('dm-recompense').value.trim() || null;
    } else {
      // No events exist yet -- auto-create a default event from the top modal fields
      // so the PDT table has event data to render from
      const evType = $('dm-conseil').value === '1' ? 'council' : 'game';
      state.editingDayEvents.push({
        event_type:      evType,
        sort_order:      0,
        name:            $('dm-game').value.trim() || null,
        location:        $('dm-location').value.trim() || null,
        heure_rehearsal: $('dm-rehearsal').value.trim() || null,
        heure_host:      $('dm-animateur').value.trim() || null,
        heure_event:     $('dm-game-time').value.trim() || null,
        heure_depart:    $('dm-depart').value.trim() || null,
        maree_hauteur:   $('dm-maree-h').value !== '' ? parseFloat($('dm-maree-h').value) : null,
        maree_statut:    $('dm-maree-s').value || null,
        reward:          $('dm-recompense').value.trim() || null,
        notes:           null,
      });
    }

    const data = {
      date:                   $('dm-date').value,
      day_number:             parseInt($('dm-day-number').value) || null,
      location:               $('dm-location').value.trim() || null,
      game_name:              $('dm-game').value.trim() || null,
      heure_rehearsal:        $('dm-rehearsal').value.trim() || null,
      heure_animateur:        $('dm-animateur').value.trim() || null,
      heure_game:             $('dm-game-time').value.trim() || null,
      heure_depart_candidats: $('dm-depart').value.trim() || null,
      nb_candidats:           $('dm-candidats').value !== '' ? parseInt($('dm-candidats').value) : null,
      maree_hauteur:          $('dm-maree-h').value !== '' ? parseFloat($('dm-maree-h').value) : null,
      maree_statut:           $('dm-maree-s').value || null,
      conseil_soir:           parseInt($('dm-conseil').value),
      recompense:             $('dm-recompense').value.trim() || null,
      status:                 $('dm-status').value,
      notes:                  $('dm-notes').value.trim() || null,
    };

    // BUG 4 FIX: conseil_soir strictly derived from events
    data.conseil_soir = state.editingDayEvents.some(e => e.event_type === 'council') ? 1 : 0;

    // Auto-set status to 'modifié' when editing an existing day (prevents PDF merge from overwriting)
    if (state.editingDayId && data.status === 'brouillon') {
      data.status = 'modifié';
      $('dm-status').value = 'modifié';
    }

    // ── AXE 7.2: Cascade detection ──
    // If editing an existing day AND date changed, check for cascade impacts
    if (state.editingDayId) {
      const oldDay = state.shootingDays.find(d => d.id === state.editingDayId);
      const oldDate = oldDay?.date;
      if (oldDate && oldDate !== data.date && !state._cascadeDecision) {
        // Store pending save data and fetch cascade preview
        state._pendingSaveData = data;
        state._pendingOldDate = oldDate;
        try {
          const preview = await api('POST',
            `/api/productions/${state.prodId}/shooting-days/${state.editingDayId}/cascade-preview`,
            { old_date: oldDate, new_date: data.date });
          const total = preview.summary.assignments + preview.summary.fuel_entries
                        + preview.summary.location_schedules;
          if (total > 0) {
            _showCascadePreview(preview, oldDate, data.date);
            return; // Wait for user decision via modal
          }
          // No cascade needed, proceed normally
        } catch (e) {
          console.warn('Cascade preview failed, proceeding without cascade:', e);
        }
      }
    }
    // Clear cascade decision flag
    const cascadeDecision = state._cascadeDecision;
    state._cascadeDecision = null;
    state._pendingSaveData = null;
    state._pendingOldDate = null;

    try {
      let dayId = state.editingDayId;
      if (dayId) {
        // Capture old date before update so we can clean up if date changed
        const oldDay = state.shootingDays.find(d => d.id === dayId);
        const oldDate = oldDay?.date;
        const updated = await api('PUT',
          `/api/productions/${state.prodId}/shooting-days/${dayId}`, data);
        // Persist ALL inline event edits (every field, not just name/location/time)
        for (const ev of state.editingDayEvents) {
          if (ev.id) {
            await api('PUT', `/api/events/${ev.id}`, {
              sort_order: ev.sort_order, event_type: ev.event_type,
              name: ev.name, location: ev.location,
              heure_rehearsal: ev.heure_rehearsal, heure_host: ev.heure_host,
              heure_event: ev.heure_event, heure_depart: ev.heure_depart,
              heure_arrivee: ev.heure_arrivee, heure_teaser: ev.heure_teaser,
              heure_fin: ev.heure_fin,
              maree_hauteur: ev.maree_hauteur, maree_statut: ev.maree_statut,
              reward: ev.reward, notes: ev.notes,
            });
          }
        }
        // Reload this day's events from API to get fresh data
        const freshEvents = await api('GET',
          `/api/productions/${state.prodId}/shooting-days/${dayId}/events`);
        updated.events = freshEvents;
        const idx = state.shootingDays.findIndex(d => d.id === dayId);
        if (idx >= 0) state.shootingDays[idx] = updated;
        toast('Day updated');
        // If the date changed, clean up F entries on the old date first
        if (oldDate && oldDate !== data.date) {
          await _syncPdtLocationsDelete(oldDate);
        }
        // Sync PDT locations -> Locations tab (Film days)
        await _syncPdtLocations(data.date, data, freshEvents);

        // ── AXE 7.2: Apply cascade if user confirmed ──
        if (cascadeDecision === 'apply' && oldDate && oldDate !== data.date) {
          try {
            const result = await api('POST',
              `/api/productions/${state.prodId}/shooting-days/${dayId}/cascade-apply`,
              { old_date: oldDate, new_date: data.date });
            const a = result.applied;
            toast(`Cascade: ${a.assignments} assignments, ${a.fuel_entries} fuel, ${a.location_schedules} locations mis a jour`);
          } catch (e) {
            toast('Erreur cascade: ' + e.message, 'error');
          }
        }
      } else {
        data.production_id = state.prodId;
        const created = await api('POST',
          `/api/productions/${state.prodId}/shooting-days`, data);
        // Create any events added before day was saved
        for (let i = 0; i < state.editingDayEvents.length; i++) {
          const ev = { ...state.editingDayEvents[i], shooting_day_id: created.id };
          await api('POST',
            `/api/productions/${state.prodId}/shooting-days/${created.id}/events`, ev);
        }
        // Reload with events
        const freshEvents = await api('GET',
          `/api/productions/${state.prodId}/shooting-days/${created.id}/events`);
        created.events = freshEvents;
        state.shootingDays.push(created);
        state.shootingDays.sort((a, b) => (a.day_number || 0) - (b.day_number || 0));
        toast('Day created');
        // Sync PDT locations -> Locations tab (Film days)
        await _syncPdtLocations(data.date, data, freshEvents);
      }
      closeDayModal();
      renderPDT();
    } catch (e) {
      toast('Error: ' + e.message, 'error');
    }
  }

  async function deleteDay() {
    if (!state.editingDayId) return;
    const d = state.shootingDays.find(x => x.id === state.editingDayId);
    showConfirm(`Delete Day ${d?.day_number} (${d?.date})?`, async () => {
      try {
        const dayDate = d?.date;
        await api('DELETE', `/api/productions/${state.prodId}/shooting-days/${state.editingDayId}`);
        state.shootingDays = state.shootingDays.filter(x => x.id !== state.editingDayId);
        // Sync: remove F days from Locations schedule for this deleted day
        if (dayDate) await _syncPdtLocationsDelete(dayDate);
        closeDayModal();
        renderPDT();
        toast('Day deleted');
      } catch (e) {
        toast('Error: ' + e.message, 'error');
      }
    });
  }



// ─── Auto-fill tides (P6.3) ──────────────────────────────────────────────
  async function autoFillTides() {
    const days = state.shootingDays;
    if (!days.length) { toast('No shooting days to fill', 'error'); return; }

    // Determine date range from existing days
    const dates = days.map(d => d.date).filter(Boolean).sort();
    if (!dates.length) { toast('No dates found', 'error'); return; }
    const start = dates[0];
    const end = dates[dates.length - 1];

    toast('Fetching tide data...');
    try {
      const tideData = await api(`/api/tides?lat=8.35&lng=-79.05&start=${start}&end=${end}`);
      const tideMap = {};
      tideData.forEach(t => { tideMap[t.date] = t; });

      let updated = 0;
      for (const day of days) {
        const td = tideMap[day.date];
        if (!td || td.height == null) continue;

        // Skip days where user already set tide manually
        const existingH = day.events && day.events.length
          ? day.events[0].maree_hauteur
          : day.maree_hauteur;
        if (existingH != null) continue;

        // Build update payload with tide data
        const body = {
          maree_hauteur: td.height,
          maree_statut: td.status
        };
        await authFetch(`/api/productions/${state.currentProd}/shooting-days/${day.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        // Also update first event if exists
        if (day.events && day.events.length) {
          const ev = day.events[0];
          await authFetch(`/api/productions/${state.currentProd}/shooting-days/${day.id}/events/${ev.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ maree_hauteur: td.height, maree_statut: td.status })
          });
        }
        updated++;
      }

      // Reload data
      await loadShootingDays(state.currentProd);
      renderPDT();
      toast(`Tides filled for ${updated} day${updated !== 1 ? 's' : ''} (${dates.length - updated} skipped — already set)`);
    } catch (e) {
      toast('Error fetching tides: ' + e.message, 'error');
    }
  }

// Register module functions on App
Object.assign(window.App, {
  _buildCalDetail,
  _collapseEventsSection,
  _doParsePDT,
  _doUploadPDT,
  _initCalMonth,
  _renderDayEvents,
  _showCascadePreview,
  _syncPdtLocations,
  _syncPdtLocationsDelete,
  _updateDayEventField,
  addDay,
  addEventToDay,
  autoFillTides,
  applyCascade,
  cancelCascade,
  closeDayModal,
  deleteDay,
  deleteEventFromDay,
  editDay,
  handlePDTFileUpload,
  parsePDT,
  pdtCalNext,
  pdtCalPrev,
  pdtCalToggleDay,
  renderPDT,
  renderPDTCalendar,
  saveDay,
  setPDTView,
  skipCascade,
  toggleEventsSection,
  triggerPDTUpload,
});
