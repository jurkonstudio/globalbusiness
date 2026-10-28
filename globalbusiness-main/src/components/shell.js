import { ic } from '../config/icons.js';
import { esc } from '../core/escape.js';

export const card = (title, body) =>
  `<div class="card"><h3>${title}</h3>${body}</div>`;

export const emptyState = (text) => `<div class="empty">${text}</div>`;

// Pages that are not built yet pass a plain sentence. Show it as an honest "not available" state instead of a dead end.
const isPlaceholder = (t) => /under construction/i.test(t);
const comingSoon = (module, section) => `<div class="state" role="status">${ic('clock')}
  <b>${esc(section)} is not available yet</b>
  <p>This part of ${esc(module)} has no game feature behind it so far. Nothing here is saved or simulated.</p>
  <a class="btn" href="#/headquarters/overview">Back to Headquarters</a></div>`;

export function shell(module, section, body) {
  const html = body.trim().startsWith('<') ? body : isPlaceholder(body) ? comingSoon(module, section) : emptyState(body);
  return `<section class="page">
    <header class="page-head"><span class="crumb">${esc(module)}</span><h1>${esc(section)}</h1></header>
    ${html}
  </section>`;
}
