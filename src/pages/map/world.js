import { shell } from '../../components/shell.js';
import { mountGlobe } from '../../components/globe.js';
import { landGridHtml, mountLandGrid } from '../../components/landGrid.js';

export function render() {
  return shell('Map', 'World', `
    <div class="globe" id="globe"></div>
    <h3 class="muted" style="margin:1rem 0 .5rem">YOUR LAND</h3>
    ${landGridHtml()}`);
}

export function mount() {
  const g = document.getElementById('globe');
  if (g) mountGlobe(g);
  mountLandGrid();
}
