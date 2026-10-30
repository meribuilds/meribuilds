/* Meri Curates Studio sign-in gate. Uses the same Supabase project and session as the dashboard,
   so anyone already signed in there walks straight in. Clients are kept out; team and superadmin get in. */
(() => {
  'use strict';
  const cfg = window.STUDIO_AUTH; if (!cfg) return;
  const $ = (id) => document.getElementById(id);
  const gate = $('gate'), msg = $('gateErr'), form = $('gateForm');
  const show = (text) => { gate.hidden = false; form.hidden = false; $('gateDenied').hidden = true; msg.textContent = text || ''; };
  const deny = (email) => { gate.hidden = false; form.hidden = true; $('gateDenied').hidden = false; $('gateWho').textContent = email || 'This account'; };
  const enter = (email) => { gate.hidden = true; document.body.classList.remove('locked'); $('studioWho').textContent = email || ''; $('studioOut').hidden = false; };
  if (!window.supabase || !window.supabase.createClient) { show('Could not reach the sign-in service. Check your connection and reload.'); return; }
  const sb = window.supabase.createClient(cfg.url, cfg.key);
  async function check() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return show('');
    const { data: prof, error } = await sb.from('profiles').select('role').eq('user_id', user.id).single();
    if (error && error.code !== 'PGRST116') return show('Signed in, but your profile did not load: ' + error.message);
    const role = prof?.role || 'client';
    if (role === 'client') return deny(user.email);
    enter(user.email);
  }
  $('gateGo').onclick = async (e) => {
    e.preventDefault(); msg.textContent = 'Signing in…';
    const { error } = await sb.auth.signInWithPassword({ email: $('gateEmail').value.trim(), password: $('gatePw').value });
    if (error) { msg.textContent = error.message; return; }
    msg.textContent = ''; check().catch((err) => show(err.message));
  };
  const out = async () => { await sb.auth.signOut(); location.reload(); };
  $('studioOut').onclick = out; $('gateOut').onclick = out;
  check().catch((err) => show(err.message));
})();
