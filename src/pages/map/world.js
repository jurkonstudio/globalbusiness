import { shell } from '../../components/shell.js';
import { mountGlobe } from '../../components/globe.js';

export function render() {
  return shell('Map', 'World', `
    <div class="globe tall" id="globe"></div>
    <p class="muted">The world is empty. Regions and cities will appear here.</p>`);
}

export function mount() {
  const g = document.getElementById('globe');
  if (g) mountGlobe(g);
}
