import { shell } from '../../components/shell.js';
import { toast } from '../../components/toast.js';
import { esc } from '../../core/escape.js';
import { ic } from '../../config/icons.js';
import { statusChip, stateBlock, errorBlock, skeleton, progressBar, busy, classifyError } from '../../components/ui.js';
import { supabase } from '../../core/supabase.js';
import { loadOps, describe } from '../../core/ops.js';
import { duration, clock, qty } from '../../core/format.js';

export function render() {
  return shell('Buildings', 'Production', `<div id="prod">${skeleton(3, 130)}</div>`);
}

const CHIP = { build: ['Under construction', 'info'], upgrade: ['Upgrading', 'info'], running: ['Producing', 'warn'], ready: ['Ready to collect', 'ok'], idle: ['Idle', 'idle'], blocked: ['Cannot start', 'bad'], passive: ['No recipes', 'idle'] };
const CLS = { build: 's-build', upgrade: 's-build', running: 's-run', ready: 's-ready', idle: 's-idle', blocked: 's-idle', passive: 's-idle' };

export async function mount() {
  const el = document.getElementById('prod');
  const ops = await loadOps();
  if (!el) return;
  if (ops.error) { el.innerHTML = errorBlock('Production data could not be loaded.'); return; }
  const list = describe(ops);
  if (!list.length) {
    el.innerHTML = stateBlock({ icon: 'build', title: 'No buildings yet', text: 'Place a building on a land slot, then come back to run production.', action: { href: '#/map/world', label: 'Open map' } });
    return;
  }

  const counts = (s) => list.filter((x) => x.state === s).length;
  const sum = [['ready', 'ok', 'ready'], ['running', 'warn', 'producing'], ['idle', 'idle', 'idle'], ['blocked', 'bad', 'blocked']]
    .filter(([s]) => counts(s)).map(([s, t, l]) => statusChip(`${counts(s)} ${l}`, t)).join('');

  const card = (o) => {
    const head = `<div class="hd"><h3>${esc(o.name)} <span class="muted" style="font-weight:500">LVL ${o.level}</span></h3>${statusChip(...CHIP[o.state])}</div>`;
    const bl = ops.buildings.find((x) => x.id === o.id);
    if (o.state === 'build' || o.state === 'upgrade') {
      return `<div class="bcard ${CLS[o.state]}">${head}<div class="flow"><span>${o.state === 'build' ? 'Being built' : `Upgrading to level ${o.to ?? '?'}`}. Production is paused until it finishes.</span></div>
        <div><span class="timer cd" data-finish="${o.end}">${duration((o.end - Date.now()) / 1000)}</span> <span class="muted">left</span></div>${o.start ? `<div data-p="${o.start}:${o.end}">${progressBar(o.start, o.end)}</div>` : ''}</div>`;
    }
    if (o.state === 'running') {
      return `<div class="bcard ${CLS.running}">${head}<div class="flow"><span>Making <b>${esc(o.out)}</b></span></div>
        <div><span class="timer cd" data-finish="${o.end}">${duration((o.end - Date.now()) / 1000)}</span> <span class="muted">left, done at ${clock(o.end)}</span></div>
        ${o.start ? `<div data-p="${o.start}:${o.end}">${progressBar(o.start, o.end)}</div>` : ''}</div>`;
    }
    if (o.state === 'ready') {
      return `<div class="bcard ${CLS.ready}">${head}<div class="flow"><span><b>${esc(o.out)}</b> is finished.</span></div>
        <button class="btn" data-collect="${o.job}">Collect</button></div>`;
    }
    if (o.state === 'passive') return bl?.building_types?.slug === 'grocery-store'
      ? `<div class="bcard s-ready">${head}<div class="flow"><span>This store sells your goods to customers. Set prices in Retail.</span></div><a class="btn" href="#/retail/stores">Open store</a></div>`
      : `<div class="bcard s-idle">${head}<div class="flow"><span>This building type has no production recipes.</span></div></div>`;
    // idle / blocked: a start form
    const recipes = ops.recipes.filter((r) => r.building_type_id === o.typeId);
    return `<div class="bcard ${CLS[o.state]}" data-b="${o.id}" data-lvl="${o.level}">${head}
      <div class="fld"><label for="r-${o.id}">Recipe</label><select id="r-${o.id}">${recipes.map((r) => `<option value="${r.id}">${esc(r.resources?.name)}</option>`).join('')}</select></div>
      <div class="fld"><label for="n-${o.id}">Runs (1 to 20)</label><input id="n-${o.id}" type="number" inputmode="numeric" min="1" max="20" step="1" value="1" /></div>
      <div class="flow" data-flow></div><p class="why" data-why hidden></p>
      <button class="btn" data-start="${o.id}">Start production</button></div>`;
  };
  el.innerHTML = `<div class="sumrow" aria-label="Summary">${sum}</div><div class="bgrid">${list.map(card).join('')}</div>`;

  // Live flow for every start form: inputs needed (red when short), time, output.
  const paint = (box) => {
    const lvl = Number(box.dataset.lvl), rc = ops.recipes.find((r) => r.id === Number(box.querySelector('select').value));
    const raw = Number(box.querySelector('input').value), runs = Math.floor(raw);
    const btn = box.querySelector('[data-start]'), why = box.querySelector('[data-why]');
    const valid = Number.isInteger(raw) && runs >= 1 && runs <= 20;
    const r = valid ? runs : 1;
    const ins = rc.recipe_inputs.map((x) => ({ name: x.resources?.name, need: x.qty * lvl * r, have: ops.stock[x.resource_id] ?? 0 }));
    const short = ins.filter((x) => x.have < x.need);
    box.querySelector('[data-flow]').innerHTML =
      (ins.length ? ins.map((x) => `<span class="res${x.have < x.need ? ' short' : ''}">${qty(x.need)} ${esc(x.name)} <small>(have ${qty(x.have)})</small></span>`).join('') : '<span class="res">No inputs</span>')
      + `<span class="arrow" aria-hidden="true">${ic('exchange')}</span><span class="res">${duration(rc.duration_seconds * r)}</span><span class="arrow">→</span>`
      + `<span class="res"><b>${qty(rc.output_qty * lvl * r)} ${esc(rc.resources?.name)}</b></span>`;
    const reason = !valid ? 'Enter a whole number of runs from 1 to 20.'
      : short.length ? `Not enough ${short.map((x) => `${x.name} (need ${qty(x.need)}, have ${qty(x.have)})`).join(', ')}. Buy or produce it in the warehouse first.` : '';
    why.hidden = !reason; why.innerHTML = reason ? `${ic('alert')}<span>${esc(reason)}${short.length ? ' <a href="#/warehouse/inventory" class="tag">Open warehouse</a>' : ''}</span>` : '';
    btn.disabled = !!reason;
    box.querySelector('input').setAttribute('aria-invalid', String(!valid));
  };
  el.querySelectorAll('[data-b]').forEach((box) => { paint(box); box.addEventListener('input', () => paint(box)); });
  if (el.querySelector('[data-b] [data-flow]')) el.insertAdjacentHTML('beforeend', '<p class="honest">Yield shown is the base amount. Abundance and island bonuses are applied by the server when you collect.</p>');

  el.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const start = b.dataset.start, collect = b.dataset.collect;
    if (!start && !collect) return;
    busy(b, async () => {
      const res = start
        ? await (() => { const box = b.closest('[data-b]'); return supabase.rpc('start_production', { p_building: start, p_recipe: Number(box.querySelector('select').value), p_runs: Math.floor(Number(box.querySelector('input').value)) || 1 }); })()
        : await supabase.rpc('collect_production', { p_job: collect });
      if (res.error) { toast(classifyError(res.error).text, true); return; }
      toast(start ? `Production started. Ready at ${clock(res.data)}.` : `Collected ${qty(res.data)}`);
      window.dispatchEvent(new Event('hashchange'));
    });
  };

  const timer = setInterval(() => {
    if (!el.isConnected) return clearInterval(timer);
    let done = false;
    el.querySelectorAll('.cd').forEach((c) => {
      const left = (Number(c.dataset.finish) - Date.now()) / 1000;
      if (left <= 0) done = true; else c.textContent = duration(left);
    });
    el.querySelectorAll('[data-p]').forEach((p) => { const [s, e] = p.dataset.p.split(':').map(Number); p.innerHTML = progressBar(s, e); });
    if (done) { clearInterval(timer); window.dispatchEvent(new Event('hashchange')); }
  }, 1000);
}
