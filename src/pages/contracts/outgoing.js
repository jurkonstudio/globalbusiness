import { supabase } from '../../core/supabase.js';
import { state } from '../../core/state.js';
import { shell } from '../../components/shell.js';
import { toast } from '../../components/toast.js';
import { esc } from '../../core/escape.js';
import { errorBlock, skeleton, confirmDialog, busy, classifyError } from '../../components/ui.js';
import { twoDecimals, cents } from '../../components/market.js';
import { fetchContracts, effectiveStatus, isMine, contractCard, refreshPage } from '../../components/contracts.js';
import { money2, qty as fq } from '../../core/format.js';

const EXPIRY = [[6, '6 hours'], [24, '1 day'], [48, '2 days'], [168, '7 days']];

export function render() {
  return shell('Contracts', 'Outgoing', `<div id="co">${skeleton(2, 140)}</div>`);
}

export async function mount() {
  const el = document.getElementById('co');
  const [{ rows, byId, error }, inv] = await Promise.all([fetchContracts(), supabase.from('inventory').select('resource_id, quantity')]);
  if (!el) return;
  if (error || inv.error) { el.innerHTML = errorBlock('Your contracts could not be loaded.'); return; }
  const stock = Object.fromEntries((inv.data ?? []).map((x) => [x.resource_id, Number(x.quantity)]));
  const resources = Object.values(byId).sort((a, b) => a.name.localeCompare(b.name));
  const mine = rows.filter((k) => isMine(k) && effectiveStatus(k) === 'pending');

  el.innerHTML = `<form class="stack" id="cf" novalidate onsubmit="return false">
      <div class="fld"><label for="cn">Company name</label><input id="cn" type="text" autocomplete="off" maxlength="30" placeholder="Exact company name" /><span class="err" id="cne" role="alert"></span></div>
      <div class="fld"><label for="cr">You want to</label><select id="cr"><option value="seller">Sell to them</option><option value="buyer">Buy from them</option></select></div>
      <div class="fld"><label for="cs">Resource</label><select id="cs">${resources.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select><span class="hint" id="csh"></span></div>
      <div class="fld"><label for="cq">Quantity</label><input id="cq" type="number" inputmode="decimal" min="0.01" step="0.01" value="1" /><span class="err" id="cqe" role="alert"></span></div>
      <div class="fld"><label for="cp">Price per unit ($)</label><input id="cp" type="number" inputmode="decimal" min="0.01" max="1000000" step="0.01" /><span class="hint" id="cph"></span><span class="err" id="cpe" role="alert"></span></div>
      <div class="fld"><label for="ch">Offer stays open for</label><select id="ch">${EXPIRY.map(([h, t]) => `<option value="${h}"${h === 48 ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
      <dl class="sum"><div class="tot"><dt>Contract total</dt><dd class="num" id="ct">-</dd></div></dl>
      <button class="btn" id="cgo">Review offer</button></form>
    <p class="honest">Nothing is reserved while the offer is open. The trade happens when they accept, if stock and cash are available on both sides then.</p>
    <h3 style="margin:1rem 0 .5rem">Open offers (${mine.length})</h3>
    ${mine.length ? `<div class="stack" id="cl">${mine.map((k) => contractCard(k, byId, `<button class="btn-ghost" data-cancel="${k.id}">Withdraw offer</button>`)).join('')}</div>` : '<p class="muted">You have no open offers.</p>'}`;

  const $ = (id) => document.getElementById(id);
  const refresh = (resourceChanged) => {
    const r = byId[$('cs').value];
    if (resourceChanged) $('cp').value = r ? Number(r.base_price).toFixed(2) : '';
    $('csh').textContent = `You have ${fq(stock[$('cs').value] ?? 0)} in stock. Reference price ${money2(r?.base_price ?? 0)}.`;
    const n = Number($('cq').value), p = Number($('cp').value), name = $('cn').value.trim();
    const ne = !name ? 'Enter the company name.' : name.toLowerCase() === String(state.company.name).toLowerCase() ? 'You cannot contract with yourself.' : '';
    const qe = !(n >= 0.01) ? 'Enter at least 0.01.' : !twoDecimals(n) ? 'Use at most 2 decimals.' : n > 100000 ? 'Maximum quantity is 100,000.' : '';
    const pe = !(p >= 0.01) ? 'Enter a price of at least $0.01.' : !twoDecimals(p) ? 'Use at most 2 decimals.' : p > 1000000 ? 'Maximum price is $1,000,000.' : '';
    $('cne').textContent = $('cn').dataset.touched ? ne : ''; $('cqe').textContent = qe; $('cpe').textContent = pe;
    $('ct').textContent = qe || pe ? '-' : money2(cents(n * p));
    const ok = !(ne || qe || pe);
    $('cgo').disabled = !ok;
    return { ok, n, p, name, r };
  };
  $('cs').onchange = () => refresh(true);
  $('cn').addEventListener('input', () => { $('cn').dataset.touched = '1'; });
  $('cf').addEventListener('input', () => refresh(false));
  refresh(true);

  $('cgo').onclick = async (e) => {
    const btn = e.currentTarget;
    const { ok, n, p, name, r } = refresh(false);
    if (!ok) return;
    const sell = $('cr').value === 'seller', hours = Number($('ch').value);
    const total = cents(n * p);
    const yes = await confirmDialog({ title: 'Send contract offer', confirmLabel: 'Send offer',
      rows: [['To', esc(name)], ['You', sell ? 'Sell' : 'Buy'], ['Resource', esc(r?.name ?? '')], ['Quantity', fq(n)],
        ['Price per unit', money2(p)], [sell ? 'You receive' : 'You pay', `<b>${money2(total)}</b>`],
        ['Open for', EXPIRY.find(([h]) => h === hours)?.[1] ?? `${hours} hours`]],
      note: sell && (stock[r.id] ?? 0) < n ? `You only have ${fq(stock[r.id] ?? 0)} in stock now. You will need the full amount when they accept.` : '' });
    if (!yes) return;
    busy(btn, async () => {
      const { error: err } = await supabase.rpc('create_contract', { p_to_name: name, p_role: $('cr').value, p_resource: r.id, p_qty: n, p_price: p, p_hours: hours });
      if (err) { toast(classifyError(err).text, true); return; }
      toast('Offer sent to ' + name);
      refreshPage();
    });
  };

  const list = $('cl');
  if (list) list.onclick = async (e) => {
    const b = e.target.closest('[data-cancel]');
    if (!b) return;
    const yes = await confirmDialog({ title: 'Withdraw this offer?', confirmLabel: 'Withdraw', cancelLabel: 'Keep it', danger: true, rows: [] });
    if (!yes) return;
    busy(b, async () => {
      const { error: err } = await supabase.rpc('cancel_contract', { p_contract: b.dataset.cancel });
      if (err) { toast(classifyError(err).text, true); refreshPage(); return; }
      toast('Offer withdrawn');
      refreshPage();
    });
  };
}
