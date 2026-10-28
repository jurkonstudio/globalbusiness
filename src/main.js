import { route } from './core/router.js';

window.addEventListener('hashchange', route);
route();
