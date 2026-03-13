/* ============================================================
   ShootLogix — errors.js
   Translates technical error messages into human-friendly ones.
   ============================================================ */

const ErrorTranslator = (() => {
  'use strict';

  const _patterns = [
    {
      match: /database is locked/i,
      message: 'Another user is currently editing this data. Please try again in a few seconds.'
    },
    {
      match: /UNIQUE constraint failed/i,
      message: 'This item already exists. Please use a different name.'
    },
    {
      match: /overlap.*?(\w[\w\s]*).*?(\d{4}-\d{2}-\d{2}).*?(\d{4}-\d{2}-\d{2})/i,
      build: (m) => `This boat is already assigned to ${m[1].trim()} from ${m[2]} to ${m[3]}.`
    },
    {
      match: /overlap/i,
      message: 'This boat is already assigned during the selected period.'
    },
    {
      match: /NOT NULL constraint/i,
      message: 'Please fill in all required fields.'
    },
    {
      match: /FOREIGN KEY constraint/i,
      message: 'This item is referenced by other data and cannot be deleted.'
    },
    {
      match: /no such table/i,
      message: 'A system error occurred. Please refresh the page and try again.'
    },
    {
      match: /disk I\/O error/i,
      message: 'A storage error occurred. Please try again in a moment.'
    },
    {
      match: /CHECK constraint failed/i,
      message: 'One or more values are out of the allowed range. Please check your input.'
    }
  ];

  /**
   * Translate a technical error message into a user-friendly one.
   * If no pattern matches, returns the original message unchanged.
   *
   * @param {string} technical  The raw error string
   * @returns {string}  Human-friendly message
   */
  function translateError(technical) {
    if (!technical || typeof technical !== 'string') return technical;

    for (const rule of _patterns) {
      const m = technical.match(rule.match);
      if (m) {
        return rule.build ? rule.build(m) : rule.message;
      }
    }
    return technical;
  }

  return { translateError };
})();

window.translateError = ErrorTranslator.translateError;
