import { shell } from '../../components/shell.js';
import { fetchLedger, ledgerList, GOODS_KINDS } from '../../components/ledger.js';
import { stateBlock, errorBlock, skeleton } from '../../components/ui.js';

// Goods movements only (NPC and Market trades, freight). The full cash ledger lives under Headquarters > Finance.
export function render() {
  return shell('Warehouse', 'Transactions', `<div id="tx">${skeleton(5, 62)}</div>
    <p class="honest">Showing the latest 100 goods movements. <a href="#/banking/transactions" class="tag">See the full cash ledger</a></p>`);
}

export async function mount() {
  const el = document.getElementById('tx');
  const { rows, error } = await fetchLedger({ kinds: GOODS_KINDS, limit: 100 });
  if (!el) return;
  if (error) { el.innerHTML = errorBlock('The ledger is unavailable. If this is a new database, run migration 007 and 008.'); return; }
  el.innerHTML = rows.length ? ledgerList(rows)
    : stateBlock({ icon: 'doc', title: 'No goods trades yet', text: 'Buying or selling stock will show up here.', action: { href: '#/warehouse/inventory', label: 'Open inventory' } });
}
