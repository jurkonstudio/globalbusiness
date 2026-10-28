import { supabase } from '../core/supabase.js';
import { state, isGuest } from '../core/state.js';
import { toast } from './toast.js';

// Login / Create account sheet, opened from the top bar so new players never leave the game.
// Create account = upgrade the current guest (keeps the company). Log in = switch to an existing account.
export function openAuthPanel(tab = 'signup') {
  if (document.getElementById('auth-panel')) return;
  let mode = tab;
  const m = document.createElement('div');
  m.id = 'auth-panel';
  m.className = 'modal sheet';
  m.innerHTML = `<div class="card stack modal-box">
    <div class="seg"><button data-t="signup">Create account</button><button data-t="login">Log in</button></div>
    <p class="muted" id="ap-note"></p>
    <input id="ap-email" type="email" placeholder="Email" autocomplete="email" />
    <input id="ap-pass" type="password" placeholder="Password (min 6 characters)" />
    <button class="btn" id="ap-go"></button>
    <p class="msg" id="ap-msg"></p>
    <button class="btn-ghost" id="ap-close">Keep playing</button></div>`;
  document.body.appendChild(m);
  const $ = (s) => m.querySelector(s);

  const paint = () => {
    m.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.t === mode));
    $('#ap-go').textContent = mode === 'signup' ? 'Create account' : 'Log in';
    $('#ap-pass').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    $('#ap-note').textContent = mode === 'signup'
      ? 'Your current company is kept and tied to this account.'
      : (isGuest() && state.company ? 'Logging in opens your saved company. This guest company will be left behind.' : 'Welcome back.');
    $('#ap-msg').textContent = '';
  };
  paint();

  m.querySelector('.seg').onclick = (e) => { if (e.target.dataset.t) { mode = e.target.dataset.t; paint(); } };
  $('#ap-close').onclick = () => m.remove();
  m.onclick = (e) => { if (e.target === m) m.remove(); };

  $('#ap-go').onclick = async (e) => {
    const email = $('#ap-email').value.trim(), password = $('#ap-pass').value;
    if (!email || password.length < 6) { $('#ap-msg').textContent = 'Enter an email and a password of at least 6 characters.'; return; }
    if (mode === 'login' && isGuest() && state.company && !confirm('Logging in will leave this guest company behind. Continue?')) return;
    e.target.disabled = true;
    let error;
    if (mode === 'signup') {
      ({ error } = await supabase.auth.updateUser({ email, password }));
      if (!error) await supabase.auth.refreshSession();
    } else {
      ({ error } = await supabase.auth.signInWithPassword({ email, password }));
    }
    e.target.disabled = false;
    if (error) { $('#ap-msg').textContent = error.message; return; }
    m.remove();
    toast(mode === 'signup' ? 'Account created. Progress saved!' : 'Welcome back!');
    window.dispatchEvent(new Event('hashchange'));
  };
}
