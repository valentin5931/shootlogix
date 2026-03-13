/* ============================================================
   ShootLogix — i18n.js
   Internationalization module. English default, extensible to fr/es.
   ============================================================ */

const I18n = (() => {
  'use strict';

  let _locale = 'en';
  let _strings = {};         // current locale strings (flat cache)
  let _rawStrings = {};      // raw nested JSON for current locale
  let _fallbackStrings = {}; // English fallback (flat cache)
  let _ready = false;
  const _readyCallbacks = [];

  // Flatten nested object: { common: { save: "Save" } } => { "common.save": "Save" }
  function _flatten(obj, prefix) {
    const result = {};
    for (const key of Object.keys(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        Object.assign(result, _flatten(obj[key], fullKey));
      } else {
        result[fullKey] = obj[key];
      }
    }
    return result;
  }

  // Load a locale JSON file
  async function _loadLocale(locale) {
    const resp = await fetch(`/static/i18n/${locale}.json`);
    if (!resp.ok) throw new Error(`i18n: could not load ${locale}.json (${resp.status})`);
    return resp.json();
  }

  // Initialize i18n: load English (always as fallback), then user locale if different
  async function init(locale) {
    _locale = locale || localStorage.getItem('locale') || 'en';

    try {
      // Always load English as fallback
      const enData = await _loadLocale('en');
      _fallbackStrings = _flatten(enData);

      if (_locale === 'en') {
        _rawStrings = enData;
        _strings = _fallbackStrings;
      } else {
        try {
          const localeData = await _loadLocale(_locale);
          _rawStrings = localeData;
          _strings = _flatten(localeData);
        } catch (e) {
          console.warn(`i18n: locale "${_locale}" not found, falling back to English`);
          _locale = 'en';
          _rawStrings = enData;
          _strings = _fallbackStrings;
        }
      }
    } catch (e) {
      console.error('i18n: failed to load translations', e);
      // App still works — t() returns the key
    }

    _ready = true;
    _readyCallbacks.forEach(cb => cb());
    _readyCallbacks.length = 0;
  }

  /**
   * Translate a key. Supports interpolation: t('auth.welcome', { name: 'Val' })
   * Falls back to English, then to the raw key.
   *
   * @param {string} key   Dot-notation key, e.g. 'common.save'
   * @param {Object} [params] Interpolation values, e.g. { name: 'Val' }
   * @returns {string}
   */
  function t(key, params) {
    let str = _strings[key] ?? _fallbackStrings[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
      }
    }
    return str;
  }

  // Get current locale
  function getLocale() { return _locale; }

  // Switch locale at runtime
  async function setLocale(locale) {
    localStorage.setItem('locale', locale);
    await init(locale);
  }

  // Register a callback for when i18n is ready
  function onReady(cb) {
    if (_ready) { cb(); return; }
    _readyCallbacks.push(cb);
  }

  // Check if ready
  function isReady() { return _ready; }

  return { init, t, getLocale, setLocale, onReady, isReady };
})();

// Global shortcut — available everywhere after script load
function t(key, params) { return I18n.t(key, params); }

// Expose globally
window.I18n = I18n;
window.t = t;
