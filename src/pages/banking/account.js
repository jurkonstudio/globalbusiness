import { shell } from '../../components/shell.js';
import { state } from '../../core/state.js';
import { metric, stateBlock } from '../../components/ui.js';
import { fetchLedger, sumFlows, ledgerList } from '../../components/ledger.js';
import { money, money2, signed2 } from '../../core/format.js';

export function render() {
  const c = state.company;
  return shell('Finance', 'Account', `<div class="dash">
    <div class="kpis">
      ${metric({ label: 'Cash on hand', value: `<span class="num">${money2(c.cash)}</span>`, sub: 'Spendable balance. Does not include goods or buildings.' })}
      <div id="flow">${metric({ label: 'Net cash flow, last 24 h', value: '<span class="dim">…</span>', tone: 'dim' })}</div>
    </div>
    <section><div class="sec-h"><h2>Latest movements</h2><a href="#/banking/transactions">Full ledger</a></div><div id="recent"></div></section>
    <section><div class="sec-h"><h2>Loans</h2></div>
      ${stateBlock({ icon: 'bank', title: 'Loans are not available yet', text: 'There is no loan system in the game, so no debt or interest is tracked.' })}</section>
  </div>`);
}

export async function mount() {
  const [day, recent] = await Promise.all([
    fetchLedger({ since: Date.now() - 864e5, limit: 1000 }), fetchLedger({ limit: 5 })]);
  const flow = document.getElementById('flow'), rec = document.getElementById('recent');
  if (!flow || !rec) return;
  if (day.error) flow.innerHTML = metric({ label: 'Net cash flow, last 24 h', value: 'Unavailable', tone: 'dim', sub: 'Ledger could not be loaded.' });
  else {
    const f = sumFlows(day.rows);
    flow.innerHTML = metric({ label: 'Net cash flow, last 24 h', value: `<span class="num">${signed2(f.net)}</span>`, tone: f.net < 0 ? 'neg' : f.net > 0 ? 'pos' : '',
      sub: `In ${money(f.income)} · Out ${money(f.expense)}${day.capped ? ' · partial (1,000 row limit)' : ''}` });
  }
  rec.innerHTML = recent.rows.length ? ledgerList(recent.rows) : stateBlock({ icon: 'doc', title: 'No movements yet', text: 'Your first purchase or sale will appear here.' });
}
