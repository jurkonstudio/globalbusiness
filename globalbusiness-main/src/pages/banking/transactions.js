import { shell } from '../../components/shell.js';
import { fetchLedger, ledgerList } from '../../components/ledger.js';
import { stateBlock, errorBlock, skeleton } from '../../components/ui.js';

let filter = 'all', limit = 100;

export function render() {
  return shell('Finance', 'Cash ledger', `<div class="seg wide" id="lf" role="group" aria-label="Filter">
      <button data-f="all">All</button><button data-f="in">Income</button><button data-f="out">Expenses</button></div>
    <div id="tx">${skeleton(5, 62)}</div><div id="more"></div>`);
}

export async function mount() {
  const el = document.getElementById('tx');
  const paint = (rows, capped) => {
    document.querySelectorAll('#lf button').forEach((b) => { b.classList.toggle('on', b.dataset.f === filter); b.setAttribute('aria-pressed', String(b.dataset.f === filter)); });
    const shown = rows.filter((t) => filter === 'all' || (filter === 'in' ? Number(t.amount) >= 0 : Number(t.amount) < 0));
    el.innerHTML = shown.length ? ledgerList(shown)
      : stateBlock({ icon: 'doc', title: rows.length ? 'Nothing matches this filter' : 'No cash movements yet', text: rows.length ? 'Try another filter.' : 'Every purchase, sale, build and reward is recorded here.' });
    const more = document.getElementById('more');
    more.innerHTML = rows.length >= limit && !capped ? `<button class="btn-ghost" id="load-more" style="width:100%;margin-top:.6rem">Load 100 more</button>`
      : rows.length ? `<p class="honest">${capped ? 'Showing the first 1,000 entries (server limit).' : `Showing all ${rows.length} entries.`}</p>` : '';
    const lm = document.getElementById('load-more');
    if (lm) lm.onclick = () => { limit += 100; load(); };
  };
  const load = async () => {
    const { rows, error, capped } = await fetchLedger({ limit });
    if (!document.getElementById('tx')) return;
    if (error) { el.innerHTML = errorBlock('The ledger is unavailable. If this is a new database, run migration 007 and 008.'); return; }
    paint(rows, capped);
    document.getElementById('lf').onclick = (e) => { if (e.target.dataset.f) { filter = e.target.dataset.f; paint(rows, capped); } };
  };
  limit = 100;
  await load();
}
