import { shell } from '../../components/shell.js';
import { esc } from '../../core/escape.js';
import { skeleton, errorBlock, stateBlock, statusChip } from '../../components/ui.js';
import { loadGameData, indexBy } from '../../components/gameData.js';
import { loadOps } from '../../core/ops.js';
import { resIcon } from '../../components/resourceIcons.js';
import { qty as fq, duration } from '../../core/format.js';

let filter = 'all';   // all | ready | blocked

export function render() {
  return shell('Buildings', 'Recipes', `<div class="stack">
    <div class="seg" role="group" aria-label="Filter recipes" id="rb-seg"></div>
    <div id="rb-list">${skeleton(3, 130)}</div>
    <p class="honest">Needs are for one run at your building's level (level 3 needs 3 times the inputs and makes 3 times the output).
      Stock is read from your warehouse right now. A building can queue up to 20 runs in a row. See all recipes in the
      <a class="tag" href="#/encyclopedia/recipes-info">Encyclopedia</a>.</p></div>`);
}

export async function mount() {
  const list = document.getElementById('rb-list');
  const [data, ops] = await Promise.all([loadGameData(), loadOps().catch((e) => ({ error: e.message, buildings: [], jobs: [], recipes: [], stock: {} }))]);
  if (!list?.isConnected) return;
  if (data.error || ops.error) { list.innerHTML = errorBlock('Your recipes could not be loaded. Check your connection.'); return; }
  const resById = indexBy(data.resources);

  // One entry per building type the player owns; the highest level decides the capacity shown.
  const owned = new Map();
  for (const b of ops.buildings) {
    const t = b.building_types; if (!t) continue;
    const o = owned.get(t.id) ?? { t, level: 1, count: 0 };
    o.level = Math.max(o.level, b.level ?? 1); o.count++;
    owned.set(t.id, o);
  }

  const evaluate = (rc, level) => {
    const needs = rc.recipe_inputs.map((i) => ({ res: resById[i.resource_id], need: Number(i.qty) * level, have: ops.stock[i.resource_id] ?? 0 }));
    const missing = needs.filter((n) => n.have < n.need);
    const runs = needs.length ? Math.min(20, Math.floor(Math.min(...needs.map((n) => n.have / n.need)))) : 20;
    return { needs, missing, runs };
  };

  const recipeCard = (rc, level) => {
    const out = resById[rc.output_resource_id], ev = evaluate(rc, level);
    return `<li class="card"><div class="row" style="gap:.6rem">${resIcon(out?.slug, 36)}
      <div style="flex:1;min-width:0"><b>${esc(out?.name ?? 'Item')} × ${fq(Number(rc.output_qty) * level)}</b>
        <div class="muted" style="margin:0">${duration(rc.duration_seconds)} per run</div></div>
      ${ev.missing.length ? statusChip('Missing inputs', 'warn') : statusChip(`Ready · up to ${ev.runs} run${ev.runs === 1 ? '' : 's'}`, 'ok')}</div>
      <ul class="list" style="margin-top:.5rem">${ev.needs.length ? ev.needs.map((n) => `<li>${esc(n.res?.name ?? 'Item')}:
        <span class="num">${fq(n.have)}</span> / <span class="num">${fq(n.need)}</span>${n.have < n.need ? ` <span class="muted">(short by ${fq(n.need - n.have)})</span>` : ''}</li>`).join('')
        : '<li class="muted">No ingredients needed</li>'}</ul></li>`;
  };

  const draw = () => {
    document.getElementById('rb-seg').innerHTML = [['all', 'All'], ['ready', 'Ready to run'], ['blocked', 'Missing inputs']]
      .map(([v, l]) => `<button type="button" class="${v === filter ? 'on' : ''}" data-f="${v}" aria-pressed="${v === filter}">${l}</button>`).join('');
    if (!owned.size) {
      list.innerHTML = stateBlock({ icon: 'build', title: 'You have no production buildings yet', text: 'Build one to see which recipes it can run and what each needs.', action: { href: '#/buildings/construction', label: 'Open construction' } });
      return;
    }
    const sections = [...owned.values()].map(({ t, level, count }) => {
      const rows = data.recipes.filter((rc) => rc.building_type_id === t.id).filter((rc) => {
        const m = evaluate(rc, level).missing.length > 0;
        return filter === 'all' || (filter === 'blocked' ? m : !m);
      });
      return rows.length ? `<section aria-label="${esc(t.name)}"><div class="sec-h"><h2>${esc(t.name)}</h2>
        <span class="muted" style="margin:0">${count} building${count === 1 ? '' : 's'} · level ${level}</span></div>
        <ul class="stack" style="list-style:none;padding:0;margin:0">${rows.map((rc) => recipeCard(rc, level)).join('')}</ul></section>` : '';
    }).filter(Boolean);
    list.innerHTML = sections.length ? `<div class="stack">${sections.join('')}
      <a class="btn" href="#/buildings/production">Go to production</a></div>`
      : filter === 'all'
        ? stateBlock({ icon: 'store', title: 'Your buildings have no recipes', text: 'Stores sell goods from your warehouse instead of producing them. Build a farm, mine or factory to produce goods.', action: { href: '#/buildings/construction', label: 'Open construction' } })
      : stateBlock({ icon: 'search', title: filter === 'ready' ? 'Nothing is ready to run' : 'Nothing is missing inputs', text: filter === 'ready' ? 'Buy or produce the missing inputs, then come back.' : 'Every recipe of your buildings has what it needs.', action: filter === 'ready' ? { href: '#/warehouse/inventory', label: 'Open the warehouse' } : null });
  };
  draw();
  document.getElementById('rb-seg').onclick = (e) => { const b = e.target.closest('[data-f]'); if (!b) return; filter = b.dataset.f; draw(); };
}
