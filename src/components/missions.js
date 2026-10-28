import { supabase } from '../core/supabase.js';
import { state } from '../core/state.js';
import { toast } from './toast.js';

const money = (n) => '$' + Number(n).toLocaleString('en-US');

// Missions are checked and paid by the server (claim_mission). Returns null when migration 005 is missing.
export async function loadMissions() {
  const { data, error } = await supabase.rpc('mission_status');
  return error ? null : data;
}
export const claimable = (list) => (list ?? []).filter((m) => m.done && !m.claimed).length;

export async function openMissions(onChange) {
  const m = document.createElement('div');
  m.className = 'modal sheet';
  m.innerHTML = '<div class="card stack modal-box ms-box"><h3>Missions</h3><p class="muted">Loading…</p></div>';
  document.body.appendChild(m);
  m.onclick = (e) => { if (e.target === m || e.target.id === 'ms-close') m.remove(); };

  async function draw() {
    const list = await loadMissions();
    const box = m.querySelector('.modal-box');
    if (!list) { box.innerHTML = '<h3>Missions</h3><p class="muted">Missions are not available yet. Run migration 005.</p><button class="btn-ghost" id="ms-close">Close</button>'; return; }
    const open = state.company?.tutorial_done;
    const done = list.filter((x) => x.claimed).length;
    box.innerHTML = `<h3>Missions · ${done}/${list.length}</h3>
      ${open ? '' : '<p class="muted">Finish the tutorial to start earning mission rewards.</p>'}
      <div class="ms-list">${list.map((x) => `<div class="ms-row ${x.claimed ? 'claimed' : x.done ? 'ready' : ''}">
        <div><b>${x.title}</b><small>${x.descr}</small><em>${money(x.reward_cash)} · ${x.reward_xp} XP</em></div>
        ${x.claimed ? '<span class="ms-tag">✓</span>'
          : x.done && open ? `<button class="btn" data-claim="${x.id}">Claim</button>`
          : '<span class="ms-tag dim">…</span>'}</div>`).join('')}</div>
      <button class="btn-ghost" id="ms-close">Close</button>`;
  }
  m.addEventListener('click', async (e) => {
    const id = e.target.dataset?.claim;
    if (!id) return;
    e.target.disabled = true;
    const { data, error } = await supabase.rpc('claim_mission', { p_id: id });
    if (error) { toast(error.message, true); e.target.disabled = false; return; }
    toast(`Mission complete! +${money(data)}`);
    await draw();
    onChange?.();
    window.dispatchEvent(new Event('hashchange'));   // refresh cash / level in the top bar
  });
  draw();
}
