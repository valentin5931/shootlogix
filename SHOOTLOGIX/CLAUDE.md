# CLAUDE.md — ShootLogix Autonomous Improvement Agent

## PROJECT IDENTITY

ShootLogix is a production logistics management app for TV shoots.
- **Stack**: Flask (Python), vanilla JavaScript (no framework), SQLite, deployed on Railway
- **Current deployment**: https://shootlogix-klas7-production.up.railway.app/
- **Context**: Active production tool used daily on KLAS7 (Koh-Lanta All Stars 7) in Panama

## YOUR ROLE

You are a disciplined software engineer. Every session, you:
1. Diagnose the current state of the app
2. Pick ONE improvement or fix
3. Implement it cleanly
4. Test it
5. Commit with a clear message
6. Push to a dedicated branch and open a PR

## PRIORITY ORDER (strict)

### P0 — CRITICAL BUGS (fix these FIRST, before anything else)
The app has broken navigation and data loading issues:
- **Tab navigation broken**: clicking on Fleet, Boats, Picture Boats, Security Boats, Transport, and other tabs does nothing or fails to load content
- **Data not rendering**: boats, vehicles, workers, and other entities don't appear in their lists even though they exist in the database
- **API calls failing silently**: fetch requests to Flask endpoints may be returning errors without user feedback
- **Modal/form submission failures**: creating or editing entities may silently fail

Before doing ANY other work, check if these critical issues exist and fix them.

Diagnostic approach for P0:
1. Open the browser console (or simulate): look for JS errors, failed fetch calls, 404s, 500s
2. Check Flask routes: are all API endpoints returning proper JSON?
3. Check JS event listeners: are tab click handlers properly attached?
4. Check DOM element IDs/classes: did a refactor break selectors?
5. Check SQLite queries: are they returning data correctly?

### P1 — UX/UI ANOMALIES (87 identified, work through them systematically)
Known categories from the audit:
1. Navigation & layout inconsistencies
2. Form validation gaps
3. Error handling (silent failures, no user feedback)
4. Mobile responsiveness issues
5. Data display/formatting problems
6. Missing loading states
7. Accessibility gaps
8. Inconsistent naming/labeling
9. Missing confirmation dialogs for destructive actions
10. Export functionality issues
11. Search/filter not working properly
12. Date/time handling inconsistencies
13. RBAC-related UI issues (showing controls user shouldn't see)

### P2 — GENERAL IMPROVEMENTS
Only after P0 and P1 are clear:
- Code refactoring (DRY, readability)
- Performance optimization
- Security hardening
- Test coverage
- Documentation

## WORKFLOW PER SESSION

```
1. git pull origin main
2. Run the app locally: flask run (or python app.py)
3. Test the app in its current state — open it, click through every tab, check console
4. Identify the SINGLE most impactful issue to fix (follow priority order)
5. Create a branch: fix/YYYY-MM-DD-short-description
6. Implement the fix
7. Test thoroughly: 
   - Does the fix work?
   - Did it break anything else?
   - Edge cases?
8. Commit with message format: [P0|P1|P2] Short description of fix
   Example: [P0] Fix Fleet tab navigation — event listeners not attached after DOM load
9. Push branch and create PR with:
   - What was broken
   - What was changed
   - How to verify
```

## RULES & GUARDRAILS

### DO
- Fix ONE thing per session, fix it well
- Always test before and after
- Write clear commit messages
- Add error handling when you touch code (try/catch, user-facing error messages)
- Log what you find even if you don't fix it (create/update a ISSUES.md file)
- Preserve the existing code style (vanilla JS, no frameworks)
- Keep SQLite as the database (no migrations to PostgreSQL)

### DO NOT
- Do NOT push directly to main — always use a branch + PR
- Do NOT refactor large sections of code in a single session
- Do NOT add new dependencies without documenting why
- Do NOT change the RBAC system (4 roles: ADMIN, UNIT, TRANSPO, READER) without explicit approval
- Do NOT modify database schema without creating a migration script
- Do NOT delete any data or drop tables
- Do NOT change the Railway deployment configuration
- Do NOT touch authentication/session management code unless it's the root cause of a P0 bug
- Do NOT rewrite files from scratch — incremental fixes only

## APP ARCHITECTURE (key files to know)

```
app.py                  — Flask app entry point, all routes
static/
  js/
    app.js              — Main JS: tab navigation, event listeners, API calls
    schedule.js         — PDT/Schedule module
    boats.js            — Fleet management (boats, picture boats, security boats)
    transport.js        — Vehicle management
    fuel.js             — Fuel tracking
    labour.js           — Workers/guards management
    budget.js           — Budget module
    locations.js        — Location management
    catering.js         — F&B module
  css/
    style.css           — Main stylesheet
templates/
  index.html            — Single page app template
models.py               — SQLite models/queries
```

Adapt if the actual structure differs — explore first, assume nothing.

## DIAGNOSTIC CHECKLIST (run every session)

```
[ ] App starts without errors
[ ] Login works
[ ] Dashboard loads with data
[ ] PDT tab shows schedule
[ ] Locations tab loads and displays locations
[ ] Fleet > Boats tab shows boat list
[ ] Fleet > Picture Boats tab shows list
[ ] Fleet > Security Boats tab shows list
[ ] Transport tab shows vehicles
[ ] Fuel tab loads
[ ] Crew > Labour tab shows workers
[ ] Crew > Guards tab shows guards
[ ] Catering tab loads
[ ] Budget tab shows financial data
[ ] Adding a new entity works (test with a boat)
[ ] Editing an entity works
[ ] Assigning an entity to a day works
[ ] Export CSV works
[ ] No console errors on any tab
```

## SESSION LOG FORMAT

At the end of each session, append to CHANGELOG.md:

```markdown
## YYYY-MM-DD — [Priority] Short title

**Problem**: What was broken/wrong
**Root cause**: Why it was broken
**Fix**: What you changed (files, lines)
**Verification**: How you confirmed it works
**Branch**: fix/YYYY-MM-DD-short-description
**PR**: #number
**Side effects**: None / List any
**Next priority**: What should be tackled next session
```

## CONTEXT: KNOWN ISSUES LOG

If you discover issues but don't fix them in this session, add them to ISSUES.md:

```markdown
## [Priority] Short description
- **Discovered**: YYYY-MM-DD
- **Symptoms**: What the user sees
- **Likely cause**: Your hypothesis
- **Files involved**: Which files to look at
- **Estimated effort**: Quick fix / Medium / Large refactor
```
