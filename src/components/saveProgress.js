import { openAuthPanel } from './authPanel.js';

// Same panel as the top-bar button, opened on the "Create account" tab.
export const openSaveProgress = () => openAuthPanel('signup');

// Shown once, right after the first building, to turn a guest into a real account.
export function promptOnce() {
  try {
    if (localStorage.getItem('gb_save_prompted')) return;
    localStorage.setItem('gb_save_prompted', '1');
  } catch { /* ignore */ }
  openSaveProgress();
}
