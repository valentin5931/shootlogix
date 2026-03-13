/**
 * P6.1 - Offline Queue Mutations
 * IndexedDB-backed queue for POST/PUT/DELETE mutations when offline.
 * Replays in chronological order on reconnect. Stores 409 conflicts for manual resolution.
 */
(function () {
  'use strict';

  const DB_NAME = 'shootlogix_offline';
  const DB_VERSION = 1;
  const STORE_PENDING = 'pending_mutations';
  const STORE_CONFLICTS = 'conflicts';

  let _db = null;
  let _syncing = false;

  // ── IndexedDB setup ──────────────────────────────────────────
  function _openDB() {
    return new Promise((resolve, reject) => {
      if (_db) return resolve(_db);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_PENDING)) {
          db.createObjectStore(STORE_PENDING, { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains(STORE_CONFLICTS)) {
          db.createObjectStore(STORE_CONFLICTS, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  // ── Generic IDB helpers ──────────────────────────────────────
  function _txStore(storeName, mode) {
    const tx = _db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  function _idbRequest(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // ── Pending mutations CRUD ───────────────────────────────────
  async function enqueue(mutation) {
    const db = await _openDB();
    const store = _txStore(STORE_PENDING, 'readwrite');
    await _idbRequest(store.add({
      url: mutation.url,
      method: mutation.method,
      body: mutation.body,
      timestamp: mutation.timestamp || Date.now()
    }));
    _updateBanner();
  }

  async function getPendingCount() {
    try {
      const db = await _openDB();
      const store = _txStore(STORE_PENDING, 'readonly');
      return await _idbRequest(store.count());
    } catch (e) { return 0; }
  }

  async function getAllPending() {
    const db = await _openDB();
    const store = _txStore(STORE_PENDING, 'readonly');
    return await _idbRequest(store.getAll());
  }

  async function removePending(id) {
    const db = await _openDB();
    const store = _txStore(STORE_PENDING, 'readwrite');
    await _idbRequest(store.delete(id));
  }

  // ── Conflicts CRUD ───────────────────────────────────────────
  async function addConflict(mutation, serverResponse) {
    const db = await _openDB();
    const store = _txStore(STORE_CONFLICTS, 'readwrite');
    await _idbRequest(store.add({
      url: mutation.url,
      method: mutation.method,
      body: mutation.body,
      timestamp: mutation.timestamp,
      serverResponse: serverResponse,
      detectedAt: Date.now()
    }));
  }

  async function getConflictCount() {
    try {
      const db = await _openDB();
      const store = _txStore(STORE_CONFLICTS, 'readonly');
      return await _idbRequest(store.count());
    } catch (e) { return 0; }
  }

  async function getAllConflicts() {
    const db = await _openDB();
    const store = _txStore(STORE_CONFLICTS, 'readonly');
    return await _idbRequest(store.getAll());
  }

  async function removeConflict(id) {
    const db = await _openDB();
    const store = _txStore(STORE_CONFLICTS, 'readwrite');
    await _idbRequest(store.delete(id));
  }

  async function clearConflicts() {
    const db = await _openDB();
    const store = _txStore(STORE_CONFLICTS, 'readwrite');
    await _idbRequest(store.clear());
  }

  // ── Sync (replay) ───────────────────────────────────────────
  async function flush() {
    if (_syncing) return;
    const pending = await getAllPending();
    if (pending.length === 0) return;

    _syncing = true;
    _updateBanner();

    // Sort by timestamp ascending
    pending.sort((a, b) => a.timestamp - b.timestamp);

    let succeeded = 0;
    let conflicts = 0;

    for (const item of pending) {
      try {
        const opts = {
          method: item.method,
          headers: { 'Content-Type': 'application/json' }
        };
        if (item.body !== undefined && item.body !== null) {
          opts.body = JSON.stringify(item.body);
        }

        // Use App.authFetch if available (handles JWT), else raw fetch
        const fetchFn = (typeof App !== 'undefined' && App.authFetch) ? App.authFetch : fetch;
        const res = await fetchFn(item.url, opts);

        if (res.status === 409) {
          // Conflict - store for manual resolution
          let serverData = null;
          try { serverData = await res.json(); } catch (e) {}
          await addConflict(item, serverData);
          conflicts++;
        } else if (!res.ok) {
          console.warn('[OfflineQueue] Replay failed:', res.status, item.url);
          // Non-conflict error: re-enqueue? No - drop it to avoid infinite loop.
          // Log it instead.
        } else {
          succeeded++;
        }

        // Remove from pending regardless (either succeeded, conflict-stored, or dropped)
        await removePending(item.id);
      } catch (e) {
        console.warn('[OfflineQueue] Network error during replay:', e);
        // Network error during sync - stop trying, we might be offline again
        break;
      }
    }

    _syncing = false;
    _updateBanner();

    // Notify app
    if (succeeded > 0 && typeof App !== 'undefined') {
      if (App.toast) App.toast(succeeded + ' offline change(s) synced', 'success');
      if (App.setTab && App.state) App.setTab(App.state.tab); // Refresh current view
    }
    if (conflicts > 0 && typeof App !== 'undefined' && App.toast) {
      App.toast(conflicts + ' conflict(s) need attention', 'warning');
    }
  }

  // ── Banner management ────────────────────────────────────────
  function _ensureBannerEl() {
    let banner = document.getElementById('offline-sync-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'offline-sync-banner';
      banner.className = 'offline-sync-banner hidden';
      banner.innerHTML = '<span class="osb-icon"></span><span class="osb-text"></span>';
      document.body.prepend(banner);
    }
    return banner;
  }

  async function _updateBanner() {
    const banner = _ensureBannerEl();
    const pendingN = await getPendingCount();
    const conflictN = await getConflictCount();
    const online = navigator.onLine;

    // Priority: conflict > syncing > offline with pending > hide
    if (conflictN > 0) {
      banner.className = 'offline-sync-banner conflict';
      banner.querySelector('.osb-text').textContent =
        conflictN + ' conflict' + (conflictN > 1 ? 's' : '') + ' need your attention';
      return;
    }

    if (_syncing && pendingN > 0) {
      banner.className = 'offline-sync-banner syncing';
      banner.querySelector('.osb-text').textContent =
        'Syncing ' + pendingN + ' change' + (pendingN > 1 ? 's' : '') + '...';
      return;
    }

    if (!online && pendingN > 0) {
      banner.className = 'offline-sync-banner offline';
      banner.querySelector('.osb-text').textContent =
        'You are offline. ' + pendingN + ' change' + (pendingN > 1 ? 's' : '') + ' pending sync.';
      return;
    }

    if (!online) {
      banner.className = 'offline-sync-banner offline';
      banner.querySelector('.osb-text').textContent = 'You are offline.';
      return;
    }

    // Online, no pending, no conflicts - hide
    banner.className = 'offline-sync-banner hidden';
  }

  // ── Connection listeners ─────────────────────────────────────
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      setTimeout(() => flush(), 1000);
      _updateBanner();
    });
    window.addEventListener('offline', () => {
      _updateBanner();
    });
  }

  // ── Init ─────────────────────────────────────────────────────
  async function init() {
    await _openDB();
    // Migrate any existing localStorage queue to IndexedDB
    try {
      const old = JSON.parse(localStorage.getItem('offline_queue') || '[]');
      if (old.length > 0) {
        for (const item of old) {
          await enqueue({
            url: item.path,
            method: item.method,
            body: item.body,
            timestamp: item.ts || Date.now()
          });
        }
        localStorage.removeItem('offline_queue');
      }
    } catch (e) {}
    _updateBanner();
  }

  // ── Public API ───────────────────────────────────────────────
  window.OfflineQueue = {
    init,
    enqueue,
    flush,
    getPendingCount,
    getAllPending,
    getConflictCount,
    getAllConflicts,
    removeConflict,
    clearConflicts,
    updateBanner: _updateBanner,
    isSyncing: () => _syncing
  };
})();
