import { landGridHtml, mountLandGrid } from '../../components/landGrid.js';

// Full-bleed map, no page header (Sim Companies style). 3D island (session 1). Session 2: regions, shared world, roads/transport.
export function render() {
  return landGridHtml();
}

export function mount() {
  mountLandGrid();
}
