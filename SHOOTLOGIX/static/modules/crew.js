/* CREW TAB -- Unified view of Labour + Guards */
/* P3.3 -- reduces navigation from 11 to 8 tabs */

const SL = window._SL;
const { $, _loadModule } = SL;

// Move labour and guards DOM content into crew sub-panels
async function _initCrewPanels() {
  await Promise.all([_loadModule('labour'), _loadModule('guards')]);

  const labourView = $('view-labour');
  const guardsView = $('view-guards');
  const crewLabourPanel = $('crew-labour-panel');
  const crewGuardsPanel = $('crew-guards-panel');

  // Move children from view-labour into crew-labour-panel (if not already moved)
  if (labourView && crewLabourPanel && crewLabourPanel.children.length === 0) {
    while (labourView.firstChild) {
      crewLabourPanel.appendChild(labourView.firstChild);
    }
  }

  // Move children from view-guards into crew-guards-panel (if not already moved)
  if (guardsView && crewGuardsPanel && crewGuardsPanel.children.length === 0) {
    while (guardsView.firstChild) {
      crewGuardsPanel.appendChild(guardsView.firstChild);
    }
  }
}

_initCrewPanels();
