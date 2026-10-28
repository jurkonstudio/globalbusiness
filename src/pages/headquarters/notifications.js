import { shell } from '../../components/shell.js';
import { ic } from '../../config/icons.js';
import { esc } from '../../core/escape.js';
import { stateBlock, errorBlock, skeleton } from '../../components/ui.js';
import { loadOps, describe } from '../../core/ops.js';

// There is no notifications table yet, so this page shows LIVE operational alerts worked out from your buildings and stock.
// They are not stored: when the cause goes away, the alert goes away.
export function render() {
  return shell('Headquarters', 'Alerts', `<div id="al">${skeleton(3, 62)}</div>
    <p class="honest">Alerts are calculated from your current buildings, production and warehouse. There is no saved message history yet.</p>`);
}

export async function mount() {
  const el = document.getElementById('al');
  const ops = await loadOps();
  if (!el) return;
  if (ops.error) { el.innerHTML = errorBlock('Alerts could not be loaded.'); return; }
  const list = describe(ops), items = [];
  for (const o of list) {
    if (o.state === 'ready') items.push({ tone: 'ok', icon: 'check', t: `${o.name}: ${o.out} is ready`, d: 'Collect it to add it to your warehouse.', to: '#/buildings/production', go: 'Collect' });
    if (o.state === 'blocked') items.push({ tone: 'bad', icon: 'alert', t: `${o.name} cannot start`, d: 'Missing ' + o.missing.map((m) => `${m.name} (${m.have} of ${m.need})`).join(', '), to: '#/warehouse/inventory', go: 'Restock' });
    if (o.state === 'idle') items.push({ tone: '', icon: 'clock', t: `${o.name} is idle`, d: 'All inputs are in stock.', to: '#/buildings/production', go: 'Start' });
  }
  el.innerHTML = items.length ? `<ul class="alerts">${items.map((a) => `<li class="alert ${a.tone}">${ic(a.icon)}<div class="tx"><b>${esc(a.t)}</b><small>${esc(a.d)}</small></div><a class="go" href="${a.to}">${a.go}</a></li>`).join('')}</ul>`
    : stateBlock({ icon: 'check', title: 'No alerts right now', text: list.length ? 'Everything is running or still under construction.' : 'Build something on the map to start.', tone: 'ok' });
}
