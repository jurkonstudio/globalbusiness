import { supabase } from '../../core/supabase.js';
import { state } from '../../core/state.js';
import { shell, card } from '../../components/shell.js';

const money = (n) => '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });

export function render() {
  const c = state.company;

  if (!c) {
    return shell('Headquarters', 'Found your company', `
      <div class="card stack" style="max-width:420px">
        <h3>Company name</h3>
        <input id="company-name" placeholder="e.g. Nusantara Trading" maxlength="30" />
        <button class="btn" id="create-company">Found company</button>
        <p class="msg" id="msg"></p>
      </div>`);
  }

  return shell('Headquarters', 'Overview', `
    <div class="grid">
      ${card('Cash', `<div class="stat cash">${money(c.cash)}</div>`)}
      ${card('Company level', `<div class="stat">${c.level}</div>`)}
      ${card('Buildings', `<div class="stat" id="building-count">0</div>`)}
    </div>
    <div class="grid" style="margin-top:.75rem">
      ${card('Getting started', `<ul class="list">
        <li>Build your first production building</li>
        <li>Stock your warehouse</li>
        <li>Sell goods on the marketplace</li></ul>`)}
      ${card('Quick links', `<ul class="list">
        <li><a href="#/buildings/production">Buildings</a></li>
        <li><a href="#/warehouse/inventory">Warehouse</a></li>
        <li><a href="#/marketplace/buy">Marketplace</a></li></ul>`)}
    </div>`);
}

export function mount() {
  const btn = document.getElementById('create-company');
  if (btn) {
    btn.onclick = async () => {
      const name = document.getElementById('company-name').value.trim();
      const msg = document.getElementById('msg');
      if (name.length < 3) { msg.textContent = 'Name must be at least 3 characters.'; return; }
      const { error } = await supabase.rpc('create_company', { company_name: name });
      if (error) msg.textContent = error.message;
      else window.dispatchEvent(new Event('hashchange'));
    };
    return;
  }
  supabase.from('buildings').select('id', { count: 'exact', head: true }).then(({ count }) => {
    const el = document.getElementById('building-count');
    if (el) el.textContent = count ?? 0;
  });
}
