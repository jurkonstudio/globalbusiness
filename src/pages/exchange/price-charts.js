import { shell } from '../../components/shell.js';
import { supabase } from '../../core/supabase.js';
import { esc } from '../../core/escape.js';
import { skeleton, errorBlock, stateBlock, statusChip } from '../../components/ui.js';
import { money2, qty as fq } from '../../core/format.js';

const RANGES = [['24', '24 h'], ['168', '7 days'], ['720', '30 days']];
let resource = null;
let hours = 168;

export function render() {
  return shell('Exchange', 'Price Charts', `<div id="charts">${skeleton(3, 120)}</div>`);
}

export async function mount() {
  const el = document.getElementById('charts');
  if (!el) return;
  const { data: res, error } = await supabase.from('resources').select('id, slug, name').eq('npc_sells', false).order('name');
  if (!el.isConnected) return;
  if (error || !res?.length) { el.innerHTML = errorBlock('Resources could not be loaded.'); return; }
  if (!resource) resource = res[0].id;
  el.innerHTML = `<div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <select id="pc-res" aria-label="Resource">${res.map((r) => `<option value="${r.id}" ${r.id === resource ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>
      <select id="pc-range" aria-label="Time range">${RANGES.map(([v, l]) => `<option value="${v}" ${Number(v) === hours ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div><div id="pc-body">${skeleton(2, 160)}</div>`;
  document.getElementById('pc-res').onchange = (e) => { resource = Number(e.target.value); draw(); };
  document.getElementById('pc-range').onchange = (e) => { hours = Number(e.target.value); draw(); };
  await draw();
}

async function draw() {
  const body = document.getElementById('pc-body');
  if (!body) return;
  const { data, error } = await supabase.rpc('exchange_price_history', { p_resource: resource, p_hours: hours });
  if (!document.getElementById('pc-body')) return;
  if (error) { body.innerHTML = errorBlock('Price history could not be loaded.'); return; }
  if (!data?.length) {
    body.innerHTML = stateBlock({ icon: 'exchange', title: 'No trades in this range', text: 'Prices will show here once players trade this item.' });
    return;
  }
  const last = data[data.length - 1];
  const closes = data.map((d) => Number(d.close));
  const lo = Math.min(...closes), hi = Math.max(...closes);
  const W = 600, H = 200, pad = 10;
  const x = (i) => (data.length === 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (data.length - 1));
  const y = (v) => (hi === lo ? H / 2 : H - pad - ((v - lo) * (H - 2 * pad)) / (hi - lo));
  const pts = closes.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const totalVol = data.reduce((s, d) => s + Number(d.volume), 0);
  body.innerHTML = `
    <div class="row" style="gap:8px;flex-wrap:wrap">
      ${statusChip(`Last ${money2(last.close)}`, 'ok')}
      ${statusChip(`Low ${money2(lo)} / High ${money2(hi)}`, 'info')}
      ${statusChip(`Volume ${fq(totalVol)}`, 'idle')}
    </div>
    <div class="card" style="margin-top:12px">
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Price line chart" style="width:100%;height:auto">
        <polyline fill="none" stroke="var(--teal, #1f9d8a)" stroke-width="2" points="${pts}"/>
        ${data.map((d, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(Number(d.close)).toFixed(1)}" r="3" fill="var(--coral, #e4572e)"><title>${esc(new Date(d.bucket).toLocaleString('en-US'))}: close ${money2(d.close)}, volume ${fq(d.volume)}</title></circle>`).join('')}
      </svg>
    </div>
    <div class="muted">One point per hour with trades. Hover a point for details.</div>`;
}
