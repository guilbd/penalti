// Envia as notificações do Pênalti (web push). Chamado a cada minuto pelo pg_cron (penalti_push_kick)
// com o token guardado em penalti_push_config. Na primeira chamada gera as chaves VAPID e as guarda no banco.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const b64u = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

async function makeKeys() {
  const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const j = await crypto.subtle.exportKey('jwk', k.privateKey);
  const pub = new Uint8Array(65); pub[0] = 4; pub.set(fromB64u(j.x!), 1); pub.set(fromB64u(j.y!), 33);
  return { vapid_public: b64u(pub), vapid_private: j.d! };
}

Deno.serve(async req => {
  const { data: cfg } = await sb.from('penalti_push_config').select('*').eq('id', 1).single();
  if (!cfg || req.headers.get('x-penalti-token') !== cfg.token) return new Response('forbidden', { status: 403 });
  let { vapid_public, vapid_private } = cfg;
  if (!vapid_public) {
    ({ vapid_public, vapid_private } = await makeKeys());
    await sb.from('penalti_push_config').update({ vapid_public, vapid_private }).eq('id', 1);
  }
  webpush.setVapidDetails('https://guilbd.github.io/penalti/', vapid_public, vapid_private);

  const { data: queue } = await sb.from('penalti_push_queue').select('*').is('sent_at', null).order('id').limit(300);
  let sent = 0, gone = 0;
  for (const q of queue || []) {
    await sb.from('penalti_push_queue').update({ sent_at: new Date().toISOString() }).eq('id', q.id);
    const { data: subs } = await sb.from('penalti_push_subs').select('*').eq('player', q.player);
    const payload = JSON.stringify({ title: q.title, body: q.body, url: q.url, tag: q.tag });
    for (const s of subs || []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 6 * 3600, urgency: 'normal' });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) { await sb.from('penalti_push_subs').delete().eq('endpoint', s.endpoint); gone++; }
      }
    }
  }
  return new Response(JSON.stringify({ sent, gone, queue: (queue || []).length }), { headers: { 'Content-Type': 'application/json' } });
});
