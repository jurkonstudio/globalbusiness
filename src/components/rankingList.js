// Shared by Ranking > Companies and Ranking > Players. Data comes from ranking_companies() (migration 021).
import { supabase } from '../core/supabase.js';
import { esc } from '../core/escape.js';
import { errorBlock, stateBlock, statusChip } from './ui.js';
import { qty as fq } from '../core/format.js';

const LIMIT = 50;

export const RULE_TEXT = 'Ranked by XP. Equal XP is decided by company level, then by the older company. XP comes from building, upgrading, harvesting and completing missions.';

export async function mountRanking(el, { scope, emptyTitle, emptyText }) {
  if (!el) return;
  const { data, error } = await supabase.rpc('ranking_companies', { p_scope: scope, p_limit: LIMIT });
  if (!el.isConnected) return;
  if (error) {
    el.innerHTML = errorBlock(/ranking_companies|schema cache|could not find/i.test(error.message)
      ? 'Ranking is not installed in this database yet. Run migration 021 in Supabase.' : 'The ranking could not be loaded.');
    return;
  }
  if (!data?.length) { el.innerHTML = stateBlock({ icon: 'trophy', title: emptyTitle, text: emptyText }); return; }

  const me = data.find((r) => r.is_you);
  let prev = 0;
  const rows = data.map((r) => {
    const gap = prev && Number(r.pos) > prev + 1;   // your own row can be far below the top list
    prev = Number(r.pos);
    return `${gap ? '<li class="muted" aria-hidden="true" style="text-align:center;list-style:none">…</li>' : ''}
      <li class="card" style="list-style:none;${r.is_you ? 'border-color:var(--brand)' : ''}">
        <div class="row" style="gap:.7rem;flex-wrap:nowrap">
          <b class="num" style="min-width:2.4rem;font-size:1.05rem" aria-label="Rank ${r.pos}">#${r.pos}</b>
          <div style="flex:1;min-width:0"><b style="overflow-wrap:anywhere">${esc(r.name)}</b>
            <div class="muted" style="margin:0">Level ${r.level} · ${r.buildings} building${r.buildings === 1 ? '' : 's'}</div></div>
          <div style="text-align:right"><b class="num">${fq(r.xp)}</b><div class="muted" style="margin:0">XP</div></div>
          ${r.is_you ? statusChip('You', 'info') : ''}</div></li>`;
  });
  el.innerHTML = `${me ? `<p class="honest" style="margin:0 0 .6rem">Your position: <b>#${me.pos}</b></p>` : ''}
    <ol class="stack" style="padding:0;margin:0" aria-label="Ranking">${rows.join('')}</ol>
    <p class="honest">Showing the top ${LIMIT}${me && Number(me.pos) > LIMIT ? ' and your own company' : ''}. ${RULE_TEXT}</p>`;
}
