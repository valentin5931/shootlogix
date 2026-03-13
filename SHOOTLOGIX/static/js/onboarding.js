/* ============================================================
   ShootLogix — Onboarding Guide & Contextual Help Tooltips
   P6.6
   ============================================================ */

const Onboarding = (() => {

  const STORAGE_KEY = 'onboarding_completed';

  const STEPS = [
    {
      selector: '.tab-btn[data-tab="pdt"]',
      fallback: '#view-pdt',
      title: 'Schedule',
      text: 'This is your shooting schedule. Each row is a day, each column a department.',
    },
    {
      selector: '.tab-btn[data-tab="fleet"]',
      fallback: '#view-fleet',
      title: 'Fleet',
      text: 'Manage all boats here: assignments, schedules, and budget.',
    },
    {
      selector: '.tab-btn[data-tab="fuel"]',
      fallback: '#view-fuel',
      title: 'Fuel',
      text: 'Track daily fuel consumption for each vessel.',
    },
    {
      selector: '.tab-btn[data-tab="budget"]',
      fallback: '#view-budget',
      title: 'Budget',
      text: 'Monitor spending by department with real-time variance analysis.',
    },
    {
      selector: '.tab-btn[onclick*="logisticsExportXlsx"]',
      fallback: null,
      title: 'Export',
      text: 'Export your data to PDF or Excel at any time.',
    },
  ];

  let currentStep = 0;
  let overlay = null;

  /* ── Public ──────────────────────────────────────────────── */

  function init() {
    injectHelpIcons();
    if (localStorage.getItem(STORAGE_KEY)) return;
    // small delay so the UI is fully rendered
    setTimeout(() => start(), 600);
  }

  function start() {
    currentStep = 0;
    createOverlay();
    showStep();
  }

  /* ── Overlay ─────────────────────────────────────────────── */

  function createOverlay() {
    if (overlay) overlay.remove();

    overlay = document.createElement('div');
    overlay.className = 'onboarding-overlay';
    overlay.innerHTML = `
      <div class="onboarding-backdrop"></div>
      <div class="onboarding-spotlight"></div>
      <div class="onboarding-card">
        <div class="onboarding-step-indicator"></div>
        <h3 class="onboarding-title"></h3>
        <p class="onboarding-text"></p>
        <div class="onboarding-actions">
          <button class="btn btn-ghost btn-sm onboarding-skip">Skip</button>
          <button class="btn btn-primary btn-sm onboarding-next">Next</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('.onboarding-skip').addEventListener('click', finish);
    overlay.querySelector('.onboarding-next').addEventListener('click', next);
    overlay.querySelector('.onboarding-backdrop').addEventListener('click', finish);
  }

  function showStep() {
    if (!overlay) return;
    const step = STEPS[currentStep];
    const el = document.querySelector(step.selector) || (step.fallback && document.querySelector(step.fallback));

    const card = overlay.querySelector('.onboarding-card');
    const spotlight = overlay.querySelector('.onboarding-spotlight');
    const indicator = overlay.querySelector('.onboarding-step-indicator');
    const nextBtn = overlay.querySelector('.onboarding-next');

    // indicator dots
    indicator.innerHTML = STEPS.map((_, i) =>
      `<span class="onboarding-dot${i === currentStep ? ' active' : ''}"></span>`
    ).join('');

    overlay.querySelector('.onboarding-title').textContent = step.title;
    overlay.querySelector('.onboarding-text').textContent = step.text;
    nextBtn.textContent = currentStep === STEPS.length - 1 ? 'Done' : 'Next';

    if (el) {
      const rect = el.getBoundingClientRect();
      const pad = 6;
      spotlight.style.display = 'block';
      spotlight.style.top = (rect.top - pad) + 'px';
      spotlight.style.left = (rect.left - pad) + 'px';
      spotlight.style.width = (rect.width + pad * 2) + 'px';
      spotlight.style.height = (rect.height + pad * 2) + 'px';

      // Position card below or above the element
      const cardH = 180;
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow > cardH + 20) {
        card.style.top = (rect.bottom + 16) + 'px';
      } else {
        card.style.top = Math.max(8, rect.top - cardH - 16) + 'px';
      }
      // Horizontal: center on element but clamp to viewport
      const cardW = 340;
      let left = rect.left + rect.width / 2 - cardW / 2;
      left = Math.max(12, Math.min(left, window.innerWidth - cardW - 12));
      card.style.left = left + 'px';
    } else {
      spotlight.style.display = 'none';
      card.style.top = '50%';
      card.style.left = '50%';
      card.style.transform = 'translate(-50%, -50%)';
    }
  }

  function next() {
    currentStep++;
    if (currentStep >= STEPS.length) {
      finish();
    } else {
      showStep();
    }
  }

  function finish() {
    localStorage.setItem(STORAGE_KEY, 'true');
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
  }

  /* ── Help icons (?) with tooltips ────────────────────────── */

  const HELP_TIPS = [
    { selector: '#view-pdt .view-panel, #pdt-toolbar', attr: 'pdt', text: 'PDT = Plan De Travail. Your day-by-day shooting schedule with events, departments, and notes.' },
    { selector: '.tab-btn[data-tab="fleet"]', attr: 'fleet', text: 'Fleet shows all vessels: boats, picture boats, and security boats in a unified view.' },
    { selector: '.tab-btn[data-tab="fuel"]', attr: 'fuel', text: 'Fuel tracks diesel/petrol consumption per vessel per day, with automatic cost calculations.' },
    { selector: '.tab-btn[data-tab="budget"]', attr: 'budget', text: 'Budget shows actual vs. estimated spending per department with variance tracking.' },
    { selector: '.tab-btn[data-tab="fnb"]', attr: 'fnb', text: 'FNB = Food & Beverage. Track catering costs per head per day across all crew.' },
    { selector: '.tab-btn[data-tab="crew"]', attr: 'crew', text: 'Crew manages labour and guard rosters, rates, and attendance.' },
  ];

  function injectHelpIcons() {
    HELP_TIPS.forEach(tip => {
      const el = document.querySelector(tip.selector);
      if (!el || el.querySelector('.help-icon')) return;

      const icon = document.createElement('span');
      icon.className = 'help-icon';
      icon.setAttribute('data-tooltip', tip.text);
      icon.textContent = '?';
      icon.addEventListener('click', e => e.stopPropagation());
      el.appendChild(icon);
    });
  }

  /* ── Expose ──────────────────────────────────────────────── */

  return { init, start };

})();

// Auto-init after DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Onboarding.init());
} else {
  Onboarding.init();
}
