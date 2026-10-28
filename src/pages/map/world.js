import { shell } from '../../components/shell.js';

// Empty map: a grid of placeholder slots to be filled with regions later.
export function render() {
  const slots = Array.from({ length: 48 }, (_, i) =>
    `<div class="map-slot" title="Empty slot #${i + 1}">+</div>`).join('');
  return shell('Map', 'World', `<div class="map-grid">${slots}</div>`);
}
