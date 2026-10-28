import { supabase } from '../../core/supabase.js';
import { shell } from '../../components/shell.js';
import { esc } from '../../core/escape.js';
import { stateBlock, errorBlock, statusChip, classifyError } from '../../components/ui.js';
import { qty as fq } from '../../core/format.js';

let seq = 0;   // only the newest search may draw, so a slow answer never replaces a newer one

export function render() {
  return shell('Search', 'Companies', `<div class="stack">
    <div class="fld"><label for="q">Company name</label>
      <input id="q" type="search" placeholder="At least 2 letters" autocomplete="off" maxlength="40" /></div>
    <div id="res" class="stack" aria-live="polite">${stateBlock({ icon: 'search', title: 'Search for a company', text: 'Type part of a company name. You see its level, XP and finished buildings.' })}</div>
    <p class="honest">Search shows public details only. Cash, stock and orders of other companies stay private.</p></div>`);
}

export function mount() {
  const q = document.getElementById('q'), res = document.getElementById('res');
  let t;
  q.oninput = () => {
    clearTimeout(t);
    const v = q.value.trim(), mine = ++seq;
    if (v.length < 2) {
      res.innerHTML = stateBlock({ icon: 'search', title: 'Search for a company', text: 'Type at least 2 letters of a company name.' });
      return;
    }
    t = setTimeout(async () => {
      const { data, error } = await supabase.rpc('search_companies', { p_query: v });
      if (mine !== seq || !res.isConnected) return;
      if (error) {
        res.innerHTML = /search_companies|schema cache|could not find/i.test(error.message)
          ? errorBlock('Company search is not installed in this database yet. Run migration 021 in Supabase.', false)
          : errorBlock(classifyError(error).text, false);
        return;
      }
      res.innerHTML = data.length ? data.map((c) => `<div class="card row" style="justify-content:space-between;flex-wrap:nowrap">
          <div style="min-width:0"><b style="overflow-wrap:anywhere">${esc(c.name)}</b>
            <div class="muted" style="margin:0">Level ${c.level} · ${fq(c.xp)} XP · ${c.buildings} building${c.buildings === 1 ? '' : 's'}</div></div>
          ${c.is_you ? statusChip('You', 'info') : ''}</div>`).join('')
        : stateBlock({ icon: 'search', title: 'No company found', text: `Nothing matches "${v}". Check the spelling or try a shorter part of the name.` });
    }, 250);
  };
}
