export const card = (title, body) =>
  `<div class="card"><h3>${title}</h3>${body}</div>`;

export const emptyState = (text) => `<div class="empty">${text}</div>`;

export function shell(module, section, body) {
  const html = body.trim().startsWith('<') ? body : emptyState(body);
  return `<section class="page">
    <div class="page-head"><h1>${module}</h1><h2>${section}</h2></div>
    ${html}
  </section>`;
}
