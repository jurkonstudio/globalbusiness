import { landGridHtml, mountLandGrid } from '../../components/landGrid.js';

// Full-bleed map, no page header (Sim Companies style). Session 2: mount the 3D scene into #map-stage.
export function render() {
  return landGridHtml();
}

export function mount() {
  mountLandGrid();
}
