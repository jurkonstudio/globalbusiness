import { supabase } from '../core/supabase.js';
import { toast } from './toast.js';

// Shown in the middle of the game (after the first building) to turn a guest into a real account.
export function openSaveProgress() {
  if (document.getElementById('modal')) return;
  const m = document.createElement('div');
  m.id = 'modal';
  m.className = 'modal';
  m.innerHTML = `<div class="card stack modal-box">
    <h3>Save your progress</h3>
    <p class="muted">Create an account so you don't lose your company.</p>
    <input id="sp-email" type="email" placeholder="Email" autocomplete="email" />
    <input id="sp-pass" type="password" placeholder="Password (min 6 characters)" autocomplete="new-password" />
    <button class="btn" id="sp-save">Save progress</button>
    <p class="msg" id="sp-msg"></p>
    <button class="btn-ghost" id="sp-later">Later</button>
    <button class="btn-ghost" id="sp-login">I already have an account</button>
  </div>`;
  document.body.appendChild(m);
  const close = () => m.remove();

  m.querySelector('#sp-later').onclick = close;
  m.querySelector('#sp-login').onclick = async () => {
    if (!confirm('Logging into another account will leave this guest company behind. Continue?')) return;
    await supabase.auth.signOut();
    location.hash = '#/auth/login';
    location.reload();
  };
  m.querySelector('#sp-save').onclick = async () => {
    const email = m.querySelector('#sp-email').value.trim();
    const password = m.querySelector('#sp-pass').value;
    const { error } = await supabase.auth.updateUser({ email, password });
    if (error) { m.querySelector('#sp-msg').textContent = error.message; return; }
    await supabase.auth.refreshSession();
    close();
    toast('Progress saved!');
    window.dispatchEvent(new Event('hashchange'));
  };
}

export function promptOnce() {
  try {
    if (localStorage.getItem('gb_save_prompted')) return;
    localStorage.setItem('gb_save_prompted', '1');
  } catch { /* ignore */ }
  openSaveProgress();
}
