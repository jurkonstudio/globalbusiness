export function shell(module, section, body) {
  return `<section class="page">
    <h1>${module}</h1>
    <h2>${section}</h2>
    <div class="content">${body}</div>
  </section>`;
}
