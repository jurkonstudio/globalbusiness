import { shell } from '../../components/shell.js';

// Empty land slots: placeholders to be linked to the map_slots table later.
export function render() {
  const slots = Array.from({ length: 48 }, (_, i) =>
    `<div class="map-slot" title="Empty slot #${i + 1}">+</div>`).join('');
  return shell('Map', 'Land Slots', `<div class="map-grid">${slots}</div>`);
}
