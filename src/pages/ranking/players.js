import { shell } from '../../components/shell.js';
import { skeleton } from '../../components/ui.js';
import { mountRanking } from '../../components/rankingList.js';

// Same ranking as Companies, but only companies whose owner saved the account. Guest companies are not listed.
export function render() {
  return shell('Ranking', 'Players', `<p class="muted" style="margin-top:0">Only players with a saved account are listed. Guests join the ranking once they save their progress.</p>
    <div id="rk" style="margin-top:.6rem">${skeleton(5, 64)}</div>`);
}

export function mount() {
  return mountRanking(document.getElementById('rk'), {
    scope: 'registered', emptyTitle: 'No saved accounts yet', emptyText: 'Save your progress with an email and password to appear here.',
  });
}
