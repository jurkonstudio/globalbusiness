import { supabase } from '../../core/supabase.js';

export function render() {
  return `<section class="page auth">
    <h1>Global Business</h1><h2>Register</h2>
    <input id="email" type="email" placeholder="Email" />
    <input id="password" type="password" placeholder="Password" />
    <button id="submit">Register</button>
    <p id="msg"></p>
    <a href="#/auth/login">I already have an account</a>
  </section>`;
}

export function mount() {
  document.getElementById('submit').onclick = async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) document.getElementById('msg').textContent = error.message;
    else location.hash = '#/headquarters/overview';
  };
}
