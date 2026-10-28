import { supabase } from '../../core/supabase.js';

export function render() {
  return `<section class="auth">
    <div class="card stack">
      <h1>Global Business</h1><h2>Register</h2>
      <input id="email" type="email" placeholder="Email" autocomplete="email" />
      <input id="password" type="password" placeholder="Password" autocomplete="current-password" />
      <button class="btn" id="submit">Register</button>
      <p class="msg" id="msg"></p>
      <a href="#/auth/login">I already have an account</a>
    </div>
  </section>`;
}

export function mount() {
  document.getElementById('submit').onclick = async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) document.getElementById('msg').textContent = error.message;
    else { location.hash = '#/headquarters/overview'; window.dispatchEvent(new Event('hashchange')); }
  };
}
