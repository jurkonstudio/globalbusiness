import { supabase } from '../../core/supabase.js';
import { esc } from '../../core/escape.js';

const hint = (m) => /anonymous/i.test(m) ? 'Fix: in Supabase open Authentication > Sign In / Providers and turn on Anonymous Sign-Ins.'
  : /database error|saving new user/i.test(m) ? 'Fix: a database trigger is failing while creating the player. Re-run migration 004 in the SQL Editor.'
  : /rate|too many|429/i.test(m) ? 'Too many guest sign-ins from this network. Wait a few minutes and tap Play as guest.'
  : 'Tap Play as guest to try again.';

export function render() {
  return `<section class="auth">
    <div class="card stack">
      <h1>Global Business</h1><h2>Log In</h2>
      ${window.__gbNotice ? `<p class="muted">${esc(window.__gbNotice)}</p>` : ''}
      ${window.__gbError ? `<p class="msg">Reason: ${esc(window.__gbError)}<br>${esc(hint(window.__gbError))}</p>` : ''}
      <input id="email" type="email" placeholder="Email" autocomplete="email" />
      <input id="password" type="password" placeholder="Password" autocomplete="current-password" />
      <button class="btn" id="submit">Log In</button>
      <button class="btn-ghost" id="guest">Play as guest</button>
      <p class="msg" id="msg"></p>
      <a href="#/auth/register">Create an account</a>
    </div>
  </section>`;
}

export function mount() {
  const msg = document.getElementById('msg');
  const go = () => { location.hash = '#/headquarters/overview'; window.dispatchEvent(new Event('hashchange')); };
  document.getElementById('submit').onclick = async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) msg.textContent = error.message; else go();
  };
  document.getElementById('guest').onclick = async () => {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) msg.textContent = error.message; else go();
  };
}
