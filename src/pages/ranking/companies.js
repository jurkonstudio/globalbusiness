import { shell } from '../../components/shell.js';
import { skeleton } from '../../components/ui.js';
import { mountRanking } from '../../components/rankingList.js';

export function render() {
  return shell('Ranking', 'Companies', `<div id="rk">${skeleton(5, 64)}</div>`);
}

export function mount() {
  return mountRanking(document.getElementById('rk'), {
    scope: 'all', emptyTitle: 'No companies yet', emptyText: 'Companies appear here as soon as players start building.',
  });
}
