// Phase 2 shared UI helpers. Pure functions that return HTML strings, plus a few small behaviours.
// Existing helpers (card, emptyState, shell) stay in shell.js and keep working.
import { ic } from '../config/icons.js';
import { esc } from '../core/escape.js';

// ---- Static building blocks -------------------------------------------------

// Status chip. The tone is never conveyed by colour alone: every tone has its own icon and a text label.
const TONE_ICON = { ok: 'check', warn: 'alert', bad: 'x', info: 'info', idle: 'clock', lock: 'lock' };
export const statusChip = (text, tone = 'info') =>
  `<span class="st st-${tone}">${ic(TONE_ICON[tone] ?? 'info')}<span>${esc(text)}</span></span>`;

// Financial / numeric metric. `value` is trusted HTML (already formatted); `label`/`sub` are escaped.
export const metric = ({ label, value, sub = '', tone = '', href = '' }) => {
  const inner = `<span class="mt-l">${esc(label)}</span><b class="mt-v ${tone}">${value}</b>${sub ? `<span class="mt-s">${esc(sub)}</span>` : ''}`;
  return href ? `<a class="metric" href="${href}">${inner}</a>` : `<div class="metric">${inner}</div>`;
};

// Empty / unavailable / error blocks. `action` = { href, label }.
export const stateBlock = ({ icon = 'info', title, text = '', action = null, tone = '' }) =>
  `<div class="state ${tone}" role="${tone === 'bad' ? 'alert' : 'status'}">${ic(icon)}
    <b>${esc(title)}</b>${text ? `<p>${esc(text)}</p>` : ''}
    ${action ? `<a class="btn" href="${action.href}">${esc(action.label)}</a>` : ''}</div>`;

export const errorBlock = (text, retry = true) =>
  `<div class="state bad" role="alert">${ic('alert')}<b>Could not load this</b><p>${esc(text)}</p>
    ${retry ? '<button class="btn-ghost" data-retry>Try again</button>' : ''}</div>`;

export const skeleton = (n = 3, h = 64) =>
  `<div class="skel-list" aria-busy="true" aria-label="Loading">${Array.from({ length: n }, () => `<div class="skel" style="height:${h}px"></div>`).join('')}</div>`;

// Real progress: derived from two timestamps, never from a fake counter.
export const progressBar = (startMs, finishMs, now = Date.now()) => {
  const pct = Math.max(0, Math.min(100, ((now - startMs) / Math.max(1, finishMs - startMs)) * 100));
  return `<div class="prog" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><i style="width:${pct.toFixed(1)}%"></i></div>`;
};

// ---- Behaviour --------------------------------------------------------------

// Run an async action on a button: disabled + spinner while pending, restored afterwards. Blocks double taps.
export async function busy(btn, fn) {
  if (!btn || btn.disabled || btn.dataset.busy) return undefined;
  btn.dataset.busy = '1'; btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.classList.add('is-busy');
  try { return await fn(); }
  finally {
    delete btn.dataset.busy; btn.classList.remove('is-busy'); btn.removeAttribute('aria-busy');
    if (btn.isConnected) btn.disabled = false;
  }
}

// Sorts a Supabase/RPC error into something the player can act on. Based on the message text only (heuristic):
//   network     -> the request never reached the server
//   validation  -> the server rejected the input
//   transaction -> the rules refused the action (cash, stock, level, busy...)
export function classifyError(err) {
  const msg = String(err?.message ?? err ?? '');
  if (/failed to fetch|networkerror|network request|load failed|timeout|fetch/i.test(msg))
    return { kind: 'network', text: 'No connection to the server. Check your internet and try again.' };
  if (/invalid|at most|at least|must be|too small|enter a/i.test(msg)) return { kind: 'validation', text: msg };
  return { kind: 'transaction', text: msg || 'The action was refused.' };
}

// ---- Dialogs ----------------------------------------------------------------

let lastFocus = null;
export function openDialog({ title, body, sheet = false, labelledBy = '' }) {
  lastFocus = document.activeElement;
  const m = document.createElement('div');
  m.className = 'modal' + (sheet ? ' sheet' : '');
  m.innerHTML = `<div class="card stack modal-box" role="dialog" aria-modal="true" aria-label="${esc(title)}" ${labelledBy}>${body}</div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.addEventListener('click', (e) => { if (e.target === m) close(); });
  return { el: m, box: m.firstElementChild, close };
}

// Promise<boolean>. rows = [[label, value], ...] gives a summary of exactly what is about to happen.
export function confirmDialog({ title, rows = [], note = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const d = openDialog({ title, sheet: true, body: `<h3>${esc(title)}</h3>
      <dl class="sum">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>
      ${note ? `<p class="muted">${esc(note)}</p>` : ''}
      <div class="row end"><button class="btn-ghost" data-no>${esc(cancelLabel)}</button>
      <button class="btn${danger ? ' danger' : ''}" data-yes>${esc(confirmLabel)}</button></div>` });
    let done = false;
    const finish = (v) => { if (done) return; done = true; d.close(); resolve(v); };
    d.box.querySelector('[data-no]').onclick = () => finish(false);
    d.box.querySelector('[data-yes]').onclick = () => finish(true);
    new MutationObserver((_, obs) => { if (!d.el.isConnected) { obs.disconnect(); finish(false); } }).observe(document.body, { childList: true });
  });
}

// One global enhancer makes EVERY existing modal (sheets, auth panel, economy, missions...) accessible without
// rewriting them: dialog semantics, focus moved inside, Escape closes, focus returns to where it was.
export function initModalA11y() {
  if (window.__gbModalA11y) return;
  window.__gbModalA11y = true;
  const seen = new WeakSet();
  new MutationObserver((muts) => {
    for (const mu of muts) for (const n of mu.addedNodes) {
      if (!(n instanceof HTMLElement) || !n.classList.contains('modal') || seen.has(n)) continue;
      seen.add(n);
      const box = n.firstElementChild;
      if (box && !box.getAttribute('role')) { box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', box.querySelector('h3')?.textContent || 'Dialog'); }
      if (!lastFocus || !lastFocus.isConnected) lastFocus = document.activeElement;
      queueMicrotask(() => (n.querySelector('input:not([disabled]), select, button:not([disabled])') || box)?.focus?.({ preventScroll: true }));
    }
  }).observe(document.body, { childList: true });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const top = [...document.querySelectorAll('.modal')].pop();
    if (top) { top.remove(); lastFocus?.focus?.({ preventScroll: true }); e.preventDefault(); }
    else if (document.body.classList.contains('drawer-open')) document.body.classList.remove('drawer-open');
  });
}
