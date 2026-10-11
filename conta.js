/* Conta do jogador em qualquer aparelho: "Entrar com apelido e senha" e "Proteger conta com senha".
   Usado pelo jogo (online.js), pelo quiz e pelas ligas. A identidade fica em localStorage 'penalti.online.v1'
   ({ id, secret, nickname, rating, avatar }); cada aparelho que entra com senha ganha o próprio segredo. */
(function (root) {
  'use strict';
  const SB_URL = 'https://rlxhfldfnyqpvwqzxspx.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJseGhmbGRmbnlxcHZ3cXp4c3B4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMjc1NTUsImV4cCI6MjEwMzgwMzU1NX0.uB94NZLeFHmAEXb8q2EIDycSWd2_wN52RduS8Tsm9p8';
  const ID_KEY = 'penalti.online.v1';
  const ERR = {
    login_invalido: 'Apelido ou senha errados. (A senha só existe se você a criou antes, em "Proteger conta".)',
    bloqueado: 'Muitas tentativas erradas. Espere 15 minutos e tente de novo.', conta_bloqueada: 'Esta conta foi bloqueada pela organização do jogo.',
    senha_curta: 'Use de 6 a 72 caracteres.', credenciais_invalidas: 'Seu cadastro neste aparelho não foi reconhecido.'
  };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  async function rpc(name, args) {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}) });
    let d = null; try { d = await r.json(); } catch (e) { /* vazio */ }
    if (!r.ok) throw new Error('Não foi possível falar com o servidor. Verifique a internet e tente de novo.');
    if (d && d.erro) throw new Error(ERR[d.erro] || d.erro);
    return d;
  }
  const css = document.createElement('style');
  css.textContent = `
  .pk-acc { font: 500 15px var(--body, system-ui, sans-serif); color: var(--ink, #f3f1ea); }
  .pk-acc a.pk-link, .pk-acc button.pk-link { background: none; border: 0; padding: 0; color: var(--gold, #f2b632); font: 700 15px var(--body, system-ui, sans-serif); cursor: pointer; text-decoration: underline; }
  .pk-acc form { display: grid; gap: 8px; margin-top: 10px; }
  .pk-acc input { width: 100%; font: 500 16px var(--body, system-ui, sans-serif); color: var(--ink, #f3f1ea); background: var(--night, #060b16); border: 1px solid var(--line, rgba(255,255,255,.12)); padding: 10px 12px; min-height: 44px; box-sizing: border-box; }
  .pk-acc .pk-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .pk-acc .pk-msg { min-height: 20px; font-size: 14px; } .pk-acc .pk-msg.err { color: #ff8a8a; } .pk-acc .pk-msg.ok { color: var(--win, #3cc47a); }
  .pk-acc .pk-warn { border-left: 4px solid var(--gold, #f2b632); padding: 6px 10px; background: rgba(242,182,50,.08); margin: 0 0 6px; font-size: 14px; line-height: 1.4; }`;
  document.head.appendChild(css);
  const save = me => { try { localStorage.setItem(ID_KEY, JSON.stringify(me)); } catch (e) { /* ok */ } };
  const setMsg = (el, t, kind) => { el.textContent = t || ''; el.className = 'pk-msg' + (kind ? ' ' + kind : ''); };

  // "Já tenho conta": entra com apelido e senha neste aparelho
  function mountLogin(el, opts) {
    if (!el) return;
    opts = opts || {};
    el.classList.add('pk-acc');
    el.innerHTML = `<button type="button" class="pk-link">Já tenho conta: entrar com apelido e senha</button>
      <form hidden><input type="text" name="nick" placeholder="Seu apelido" maxlength="16" autocomplete="username" aria-label="Apelido" required>
        <input type="password" name="pass" placeholder="Senha da conta" autocomplete="current-password" aria-label="Senha" required>
        <div class="pk-row"><button class="btn primary" type="submit">Entrar</button></div><div class="pk-msg" role="status" aria-live="polite"></div></form>`;
    const f = el.querySelector('form'), m = f.querySelector('.pk-msg');
    el.querySelector('.pk-link').onclick = () => { f.hidden = !f.hidden; if (!f.hidden) f.nick.focus(); };
    f.onsubmit = async e => {
      e.preventDefault(); setMsg(m, 'Entrando…');
      try {
        const me = await rpc('penalti_account_login', { p_nick: f.nick.value.trim(), p_pass: f.pass.value });
        save(me); f.pass.value = ''; setMsg(m, 'Pronto!', 'ok');
        if (opts.onLogin) opts.onLogin(me); else location.reload();
      } catch (err) { setMsg(m, err.message, 'err'); }
    };
  }

  // "Proteger conta": cria ou troca a senha e tira a conta de outros aparelhos
  async function mountProtect(el, me) {
    if (!el || !me) return;
    el.classList.add('pk-acc');
    let st; try { st = await rpc('penalti_account_status', { p_id: me.id, p_secret: me.secret }); } catch (e) { el.innerHTML = ''; return; }
    const render = (open) => {
      el.innerHTML = (st.tem_senha
        ? `<div class="pk-row"><span>🔒 Conta protegida: entre em qualquer aparelho com <b>${esc(me.nickname)}</b> e sua senha.</span></div>
           <div class="pk-row" style="margin-top:6px"><button type="button" class="pk-link" data-a="form">Trocar senha</button>${st.aparelhos > 1 ? ` · <button type="button" class="pk-link" data-a="others">Sair dos outros ${st.aparelhos - 1} aparelho(s)</button>` : ''}</div>`
        : `<p class="pk-warn">Sua conta está só neste aparelho. Se trocar de celular ou limpar o navegador, você perde moedas, skills e figurinhas. Crie uma senha para entrar em qualquer aparelho.</p>
           <button type="button" class="btn primary" data-a="form">Criar senha da conta</button>`) +
        `<form ${open ? '' : 'hidden'}><input type="text" name="u" value="${esc(me.nickname)}" autocomplete="username" hidden>
          <input type="password" name="p1" placeholder="Nova senha (mínimo 6 caracteres)" autocomplete="new-password" minlength="6" maxlength="72" required aria-label="Nova senha">
          <input type="password" name="p2" placeholder="Repita a senha" autocomplete="new-password" minlength="6" maxlength="72" required aria-label="Repita a senha">
          <div class="pk-row"><button class="btn primary" type="submit">Salvar senha</button></div></form><div class="pk-msg" role="status" aria-live="polite"></div>`;
      const f = el.querySelector('form'), m = el.querySelector('.pk-msg');
      el.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
        if (b.dataset.a === 'form') { f.hidden = !f.hidden; if (!f.hidden) f.p1.focus(); return; }
        if (!confirm('Sair da conta em todos os outros aparelhos? Eles vão precisar da senha para entrar de novo.')) return;
        try { await rpc('penalti_account_logout_others', { p_id: me.id, p_secret: me.secret }); st.aparelhos = 1; render(false); setMsg(el.querySelector('.pk-msg'), 'Os outros aparelhos saíram da conta.', 'ok'); }
        catch (err) { setMsg(m, err.message, 'err'); }
      });
      f.onsubmit = async e => {
        e.preventDefault();
        if (f.p1.value !== f.p2.value) return setMsg(m, 'As duas senhas não são iguais.', 'err');
        try { await rpc('penalti_account_set_password', { p_id: me.id, p_secret: me.secret, p_new: f.p1.value }); st.tem_senha = true; render(false); setMsg(el.querySelector('.pk-msg'), 'Senha salva! Anote: apelido + senha entram em qualquer aparelho.', 'ok'); }
        catch (err) { setMsg(m, err.message, 'err'); }
      };
    };
    render(false);
  }

  root.PKConta = { mountLogin, mountProtect };
})(typeof window !== 'undefined' ? window : globalThis);
