/**
 * checklist.js — Daily Checklist module
 *
 * All logic is integrated in static/app-monolith.js (IIFE pattern).
 * This file serves as a reference entry point.
 *
 * Public API (via App.*):
 *   App.loadChecklist()          — fetch & render checklist for selected date
 *   App.generateChecklist()      — auto-generate checklist from day's assignments
 *   App.toggleChecklistItem(id, checkbox) — check/uncheck an item
 *
 * Endpoints used:
 *   GET  /api/productions/:id/checklists?date=YYYY-MM-DD
 *   POST /api/productions/:id/checklists/generate?date=YYYY-MM-DD
 *   PUT  /api/productions/:id/checklists/items/:itemId/check
 */
