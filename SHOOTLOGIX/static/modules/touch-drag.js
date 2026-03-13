/* TOUCH DRAG — Pointer Events polyfill for HTML5 Drag & Drop */
/* Enables drag & drop on touch devices via Pointer Events API */

(function () {
  'use strict';

  // Only activate on touch-capable devices
  if (!('PointerEvent' in window)) return;

  let _dragEl = null;
  let _ghost = null;
  let _startX = 0;
  let _startY = 0;
  let _isDragging = false;
  const DRAG_THRESHOLD = 8; // px before drag starts

  function _findDraggable(el) {
    while (el && el !== document.body) {
      if (el.getAttribute('draggable') === 'true') return el;
      el = el.parentElement;
    }
    return null;
  }

  function _findDropZone(x, y) {
    const els = document.elementsFromPoint(x, y);
    for (const el of els) {
      if (el.classList.contains('drop-zone')) return el;
      if (el.classList.contains('role-card') || el.closest('.role-card')) {
        const card = el.classList.contains('role-card') ? el : el.closest('.role-card');
        const dz = card.querySelector('.drop-zone');
        if (dz) return dz;
      }
    }
    return null;
  }

  function _createGhost(el) {
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost touch-drag-ghost';
    ghost.textContent = el.querySelector('[style*="font-weight:700"]')?.textContent?.trim() || 'Item';
    ghost.style.cssText = `
      position: fixed; z-index: 10000; pointer-events: none;
      background: var(--accent); color: #fff;
      padding: 6px 14px; border-radius: 8px;
      font-size: 0.8rem; font-weight: 700;
      box-shadow: 0 4px 12px rgba(0,0,0,.3);
      transform: translate(-50%, -50%);
      transition: none;
    `;
    document.body.appendChild(ghost);
    return ghost;
  }

  let _lastDropZone = null;

  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    const draggable = _findDraggable(e.target);
    if (!draggable) return;

    _dragEl = draggable;
    _startX = e.clientX;
    _startY = e.clientY;
    _isDragging = false;
  }, { passive: true });

  document.addEventListener('pointermove', (e) => {
    if (!_dragEl || e.pointerType !== 'touch') return;

    const dx = e.clientX - _startX;
    const dy = e.clientY - _startY;

    if (!_isDragging) {
      if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
      _isDragging = true;
      _dragEl.classList.add('dragging');
      _ghost = _createGhost(_dragEl);

      // Fire the ondragstart handler
      const handler = _dragEl.getAttribute('ondragstart');
      if (handler) {
        const fakeEvent = {
          dataTransfer: {
            effectAllowed: 'move',
            setData: () => {},
            setDragImage: () => {},
          },
          preventDefault: () => {},
          stopPropagation: () => {},
          target: _dragEl,
        };
        try { new Function('event', handler)(fakeEvent); } catch (err) { /* ignore */ }
      }

      e.preventDefault();
    }

    if (_ghost) {
      _ghost.style.left = e.clientX + 'px';
      _ghost.style.top = e.clientY + 'px';
    }

    // Highlight drop zones
    const dz = _findDropZone(e.clientX, e.clientY);
    if (dz !== _lastDropZone) {
      if (_lastDropZone) {
        _lastDropZone.classList.remove('drag-over');
        _lastDropZone.closest('.role-card')?.classList.remove('drag-over');
      }
      if (dz) {
        dz.classList.add('drag-over');
        dz.closest('.role-card')?.classList.add('drag-over');
      }
      _lastDropZone = dz;
    }
  }, { passive: false });

  document.addEventListener('pointerup', (e) => {
    if (!_dragEl || e.pointerType !== 'touch') return;

    if (_isDragging) {
      const dz = _findDropZone(e.clientX, e.clientY);
      if (dz) {
        // Fire ondrop
        const handler = dz.getAttribute('ondrop');
        if (handler) {
          const fakeEvent = {
            preventDefault: () => {},
            stopPropagation: () => {},
            dataTransfer: { getData: () => '' },
            target: dz,
          };
          try { new Function('event', handler)(fakeEvent); } catch (err) { /* ignore */ }
        }
        dz.classList.remove('drag-over');
        dz.closest('.role-card')?.classList.remove('drag-over');
      }

      // Fire ondragend
      const endHandler = _dragEl.getAttribute('ondragend');
      if (endHandler) {
        try { new Function('event', endHandler)({}); } catch (err) { /* ignore */ }
      }

      _dragEl.classList.remove('dragging');
      if (_ghost) { _ghost.remove(); _ghost = null; }
      if (_lastDropZone) {
        _lastDropZone.classList.remove('drag-over');
        _lastDropZone.closest('.role-card')?.classList.remove('drag-over');
        _lastDropZone = null;
      }
    }

    _dragEl = null;
    _isDragging = false;
  }, { passive: true });

  document.addEventListener('pointercancel', () => {
    if (_dragEl) {
      _dragEl.classList.remove('dragging');
      if (_ghost) { _ghost.remove(); _ghost = null; }
      if (_lastDropZone) {
        _lastDropZone.classList.remove('drag-over');
        _lastDropZone.closest('.role-card')?.classList.remove('drag-over');
        _lastDropZone = null;
      }
    }
    _dragEl = null;
    _isDragging = false;
  }, { passive: true });

})();
