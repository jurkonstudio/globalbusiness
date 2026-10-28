// Quick action panel for the map: tap a building and act on it without leaving the island.
//   status line  -> what the building is doing right now (build, upgrade, producing, ready, missing inputs)
//   buttons      -> Collect | Produce (1 run, default recipe) | Upgrade | Details (full sheet in landGrid.js)
// It calls the same server RPCs as the full sheet, so rules and costs stay on the server.
import { esc } from '../core/escape.js';

const MAX_LEVEL = 6;
let open = null;

export function closeQuick() {
  open?.remove(); open = null;
  document.body.classList.remove('quick-open');
}

// api: { supabase, toast, busy, classifyError, qty, money, dur, upgradeCost, openDetails, refresh }
// ctx: landGrid context { jobOf, recipes, stock }
export function openQuick(api, x, ctx) {
  closeQuick();
  const stage = document.getElementById('map-stage'); if (!stage) return;
  const { supabase, toast, busy, classifyError, qty, money, money2, dur, upgradeCost, buyOnExchange, openDetails, refresh } = api;
  const bt = x.building_types, lvl = x.level ?? 1, now = Date.now();
  const time = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const job = ctx.jobOf[x.id], jobDone = !!job && new Date(job.finish_at) <= now, jobRun = !!job && !jobDone;
  const recipes = ctx.recipes.filter((r) => r.building_type_id === bt.id);
  const retail = bt.category === 'retail', rc = recipes[0];
  const building = !!x.build_finish_at && new Date(x.build_finish_at) > now, upgrading = !!x.upgrade_finish_at;
  const recName = rc?.resources?.name ?? 'goods';
  const ins = rc ? rc.recipe_inputs.map((i) => ({ rid: i.resource_id, name: i.resources?.name ?? 'item', need: i.qty * lvl, have: ctx.stock[i.resource_id] ?? 0 })) : [];
  const short = ins.filter((i) => i.have < i.need);
  const cost = upgradeCost(bt, lvl);

  let status, tone = 'muted';
  if (building) status = `🔨 Under construction · ready ${time(x.build_finish_at)}`;
  else if (upgrading) status = `⬆️ Upgrading to LVL ${x.upgrade_to} · ready ${time(x.upgrade_finish_at)}`;
  else if (jobDone) { status = `✅ ${recName} ready to collect`; tone = 'ok'; }
  else if (jobRun) status = `🏭 Producing ${recName} · ready ${time(job.finish_at)}`;
  else if (retail) status = 'Sells from its shelves automatically. Open Details to set prices.';
  else if (!rc) status = 'No recipe for this building yet.';
  else if (short.length) { tone = 'warn'; status = `Needs ${short.map((i) => `${qty(i.need)} ${i.name} (have ${qty(i.have)})`).join(', ')}`; }
  else { status = `Ready to produce ${recName}`; tone = 'ok'; }

  const btns = [];
  if (jobDone) btns.push(`<button class="btn" data-act="collect">Collect</button>`);
  if (!building && !upgrading && !job && !retail && rc && !short.length)
    btns.push(`<button class="btn" data-act="produce">Produce 1 run</button>`);
  if (lvl < MAX_LEVEL && !building && !upgrading && !job)
    btns.push(`<button class="btn-ghost" data-act="upgrade">Upgrade · ${money(cost)}</button>`);
  if (!building && !upgrading && !job && !retail && short.length)
    for (const i of short) btns.unshift(`<button class="btn" data-act="buy" data-rid="${i.rid}">Buy ${esc(i.name)} · ${qty(i.need - i.have)} on Exchange</button>`);
  btns.push(`<button class="btn-ghost" data-act="details">Details</button>`);

  const el = document.createElement('div');
  el.className = 'map-quick';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', `${bt.name} actions`);
  el.innerHTML = `<div class="mq-head">
      <div><b>${esc(bt.name)} · LVL ${lvl}</b><small class="mq-status tone-${tone}">${esc(status)}</small></div>
      <button class="mq-x" data-act="close" aria-label="Close">×</button>
    </div>
    <div class="mq-actions">${btns.join('')}</div>
    ${retail && !building && !upgrading ? '<div class="mq-shelf muted">Loading shelves…</div>' : ''}`;
  stage.appendChild(el);
  document.body.classList.add('quick-open');
  open = el;

  const shelf = el.querySelector('.mq-shelf');
  if (shelf) (async () => {
    const { data: lst, error } = await supabase.from('store_listings').select('resource_id').eq('building_id', x.id);
    if (!el.isConnected) return;
    const prods = (ctx.resources ?? []).filter((p) => p.retail_ok);
    if (error || !prods.length) { shelf.remove(); return; }
    const on = new Set((lst ?? []).map((l) => l.resource_id)), full = on.size >= 4;
    const rows = prods.filter((p) => !on.has(p.id)).sort((a, b) => (ctx.stock[b.id] ?? 0) - (ctx.stock[a.id] ?? 0)).slice(0, 3).map((p) => {
      const have = ctx.stock[p.id] ?? 0;
      return have >= 1 && !full
        ? `<button class="btn" data-act="sell" data-rid="${p.id}" data-price="${Number(p.retail_ref)}" data-name="${esc(p.name)}">Sell ${esc(p.name)} · ${qty(have)} in stock · ${money2(p.retail_ref)}</button>`
        : have < 1 ? `<button class="btn-ghost" data-act="buy" data-rid="${p.id}">No ${esc(p.name)}: buy on Exchange</button>` : '';
    }).join('');
    shelf.className = 'mq-actions'; shelf.innerHTML = on.size ? `<small class="muted">${on.size} product${on.size > 1 ? 's' : ''} on sale</small>${rows}` : rows;
  })();

  el.onclick = async (e) => {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'close') return closeQuick();
    if (act === 'buy') { closeQuick(); return buyOnExchange(Number(btn.dataset.rid)); }
    if (act === 'sell') return busy(btn, async () => {
      const { error } = await supabase.rpc('set_store_listing', { p_building: x.id, p_resource: Number(btn.dataset.rid), p_price: Number(btn.dataset.price) });
      if (error) return toast(classifyError(error).text, true);
      toast(`${btn.dataset.name} is on sale at ${money2(btn.dataset.price)}`); closeQuick(); refresh();
    });
    if (act === 'details') { closeQuick(); return openDetails(x); }
    if (act === 'collect') return busy(btn, async () => {
      const { data, error } = await supabase.rpc('collect_production', { p_job: job.id });
      if (error) return toast(classifyError(error).text, true);
      toast(`Collected ${qty(data)}`); closeQuick(); refresh();
    });
    if (act === 'produce') return busy(btn, async () => {
      const { data, error } = await supabase.rpc('start_production', { p_building: x.id, p_recipe: rc.id, p_runs: 1 });
      if (error) return toast(classifyError(error).text, true);
      toast(`Production started. Ready ${time(data)}.`); closeQuick(); refresh();
    });
    if (act === 'upgrade') return busy(btn, async () => {
      const { error } = await supabase.rpc('upgrade_building', { p_building: x.id });
      if (error) return toast(classifyError(error).text, true);
      toast('Upgrade started. It will finish even if you leave.'); closeQuick(); refresh();
    });
  };
}
