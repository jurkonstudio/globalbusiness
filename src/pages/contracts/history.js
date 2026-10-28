import { shell } from '../../components/shell.js';
import { stateBlock, errorBlock, skeleton } from '../../components/ui.js';
import { fetchContracts, effectiveStatus, myRole, totalOf, contractCard } from '../../components/contracts.js';
import { money2 } from '../../core/format.js';

export function render() {
  return shell('Contracts', 'History', `<div id="ch">${skeleton(3, 110)}</div>`);
}

export async function mount() {
  const el = document.getElementById('ch');
  const { rows, byId, error } = await fetchContracts();
  if (!el) return;
  if (error) { el.innerHTML = errorBlock('Your contracts could not be loaded.'); return; }
  const done = rows.filter((k) => effectiveStatus(k) !== 'pending');
  if (!done.length) {
    el.innerHTML = stateBlock({ icon: 'contract', title: 'No finished contracts yet', text: 'Accepted, declined, withdrawn and expired contracts appear here.', action: { href: '#/contracts/outgoing', label: 'Make an offer' } });
    return;
  }
  const acc = done.filter((k) => k.status === 'accepted');
  const sold = acc.filter((k) => myRole(k) === 'seller').reduce((s, k) => s + totalOf(k), 0);
  const bought = acc.filter((k) => myRole(k) === 'buyer').reduce((s, k) => s + totalOf(k), 0);
  el.innerHTML = `<dl class="sum" style="margin-bottom:.75rem">
      <div><dt>Accepted contracts</dt><dd class="num">${acc.length}</dd></div>
      <div><dt>Sold through contracts</dt><dd class="num">${money2(sold)}</dd></div>
      <div><dt>Bought through contracts</dt><dd class="num">${money2(bought)}</dd></div></dl>
    <div class="stack">${done.map((k) => contractCard(k, byId)).join('')}</div>
    <p class="honest">Shows your latest 200 contracts. Cash movements are in the <a href="#/banking/transactions" class="tag">cash ledger</a>.</p>`;
}
