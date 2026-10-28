// Toasts sit at the TOP of the screen (under the command card) so they never cover dock buttons or sheet actions.
// Errors stay a little longer. A polite live region announces them to screen readers.
let host;
function getHost() {
  if (host?.isConnected) return host;
  host = document.createElement('div');
  host.id = 'toasts'; host.setAttribute('role', 'status'); host.setAttribute('aria-live', 'polite');
  document.body.appendChild(host);
  return host;
}

export function toast(text, bad = false) {
  const h = getHost();
  [...h.children].forEach((c) => { if (c.textContent === text) c.remove(); });   // no stacked duplicates
  while (h.children.length >= 2) h.firstChild.remove();
  const t = document.createElement('div');
  t.className = 'toast' + (bad ? ' bad' : '');
  t.textContent = text;
  h.appendChild(t);
  setTimeout(() => t.remove(), bad ? 5200 : 3200);
}
