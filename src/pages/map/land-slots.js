import { shell } from '../../components/shell.js';
import { landGridHtml, mountLandGrid } from '../../components/landGrid.js';

export function render() { return shell('Map', 'Land Slots', landGridHtml()); }
export function mount() { mountLandGrid(); }
