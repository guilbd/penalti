/* Partida online (um contra o outro) e cadastro para o ranking.
   - Identidade: apelido + segredo gerado pelo servidor, salvo no aparelho.
   - Encontro: "Partida rápida" (presença num canal por modo; os dois mais antigos formam par)
     ou "Sala" com código de 4 letras para jogar com um amigo.
   - Partida: canal em tempo real do Supabase. Quem bate envia o chute pronto (com o erro de
     precisão já sorteado); quem defende envia o salto e decide o resultado (engine.js).
   - Ranking: cada um informa o placar; o Elo só muda quando os dois relatos batem (ou W.O.).
   Requer supabase-js (UMD), engine.js e menu.js. Chamar PKOnline.attach(game, ui) na página. */
(function (root) {
  'use strict';
  const SB_URL = 'https://rlxhfldfnyqpvwqzxspx.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJseGhmbGRmbnlxcHZ3cXp4c3B4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMjc1NTUsImV4cCI6MjEwMzgwMzU1NX0.uB94NZLeFHmAEXb8q2EIDycSWd2_wN52RduS8Tsm9p8';
  // ?perfil=x usa outro cadastro salvo no aparelho (útil para testar dois jogadores no mesmo navegador)
  const ID_KEY = 'penalti.online.v1' + ((new URLSearchParams(location.search).get('perfil') || '').replace(/[^a-z0-9]/gi, '').slice(0, 12));
  const MODE_NAME = { penalties: 'Pênaltis', freekick: 'Faltas' };
  let sb = null;
  const client = () => sb || (sb = root.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false } }));
  const load = () => { try { return JSON.parse(localStorage.getItem(ID_KEY)) || null; } catch (e) { return null; } };
  const save = v => { try { localStorage.setItem(ID_KEY, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } };
  const ERR = {
    apelido_em_uso: 'Esse apelido já está em uso. Escolha outro.',
    credenciais_invalidas: 'Seu cadastro neste aparelho não foi reconhecido. Crie um apelido de novo.',
    placar_invalido: 'Placar inválido.'
  };
  const msgOf = e => { const m = (e && (e.message || e.details)) || String(e); for (const k in ERR) if (m.includes(k)) return ERR[k]; return /check constraint|nickname/.test(m) ? 'Use de 3 a 16 letras, números, espaço, ponto, hífen ou _.' : 'Não foi possível falar com o servidor. Verifique a internet e tente de novo.'; };
  async function rpc(name, args) { const { data, error } = await client().rpc(name, args); if (error) throw error; return data; }
  const uuid = () => (root.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });

  let me = load();          // { id, secret, nickname, rating }
  let game = null, ui = null;
  let lobbyCh = null, matchCh = null, match = null, mode = 'penalties', stallT = 0;

  // ---------- estilos ----------
  const st = document.createElement('style');
  st.textContent = `
  .on-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
  .on-row input { flex: 1 1 160px; min-width: 0; font: 600 18px var(--body); background: transparent; color: var(--ink); border: 1px solid var(--line); padding: 10px 12px; }
  .on-row input:focus-visible { outline: 2px solid var(--gold); outline-offset: 1px; }
  .on-row .btn { flex: 0 0 auto; }
  .on-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
  .on-grid .btn { width: 100%; }
  .on-status { min-height: 22px; font-size: 15px; color: var(--ink); margin: 10px 0; }
  .on-status.err { color: #ff8a8a; }
  .on-code { font: 800 44px var(--display); letter-spacing: .3em; color: var(--gold); }
  .on-me { font-family: var(--display); font-size: 18px; letter-spacing: .05em; text-transform: uppercase; }
  .on-me b { color: var(--gold); }
  .on-link { color: var(--gold); font-family: var(--display); font-weight: 700; letter-spacing: .08em; text-transform: uppercase; text-decoration: none; }
  .on-link:hover { text-decoration: underline; }
  .btn.ghost { background: transparent; }
  .on-menu-btn { width: 100%; margin-top: 8px; border-color: var(--gold) !important; color: var(--gold) !important; }
  @media (max-width: 480px) { .on-grid { grid-template-columns: 1fr; } }`;
  document.head.appendChild(st);

  // ---------- tela "Jogar online" ----------
  const ov = document.createElement('div'); ov.className = 'overlay'; ov.id = 'online'; ov.hidden = true;
  ov.innerHTML = `<div class="card" role="dialog" aria-label="Jogar online">
    <div class="eyebrow">Um contra um · ao vivo</div>
    <h1 style="font-size:clamp(36px,7vw,56px)">Jogar online</h1>
    <div id="onWho"></div>
    <div class="eyebrow" style="margin:6px 0 8px">Modo</div>
    <div class="seg" role="group" aria-label="Modo online" id="onModes" style="grid-template-columns:1fr 1fr">
      <button type="button" data-omode="penalties" aria-pressed="true">Pênaltis</button>
      <button type="button" data-omode="freekick" aria-pressed="false">Faltas</button>
    </div>
    <div class="on-grid">
      <button class="btn primary" type="button" id="onQuick">Partida rápida</button>
      <button class="btn" type="button" id="onCreate">Criar sala</button>
    </div>
    <div class="on-row"><input id="onCode" maxlength="4" placeholder="Código da sala" autocomplete="off" aria-label="Código da sala"><button class="btn" type="button" id="onJoin">Entrar</button></div>
    <div class="on-status" id="onStatus" role="status" aria-live="polite"></div>
    <div class="on-row" style="justify-content:space-between"><span><a class="on-link" href="ranking.html">Ver ranking</a> · <a class="on-link" href="ligas.html">Ligas</a></span><button class="btn ghost" type="button" id="onBack">Voltar</button></div>
  </div>`;
  document.getElementById('app').appendChild(ov);
  const $ = id => document.getElementById(id);
  const status = (t, err) => { const s = $('onStatus'); s.textContent = t || ''; s.classList.toggle('err', !!err); };

  function renderWho() {
    const w = $('onWho');
    if (!me) {
      w.innerHTML = `<p style="margin:0 0 8px">Escolha um apelido para aparecer no ranking.</p>
        <div class="on-row"><input id="onNick" maxlength="16" placeholder="Seu apelido" autocomplete="nickname" aria-label="Seu apelido"><button class="btn primary" type="button" id="onReg">Salvar</button></div>`;
      $('onReg').onclick = async () => {
        const nick = $('onNick').value.trim();
        if (nick.length < 3) return status('O apelido precisa de pelo menos 3 caracteres.', true);
        status('Salvando…');
        try { me = await rpc('penalti_register', { p_nickname: nick }); save(me); status(''); renderWho(); }
        catch (e) { status(msgOf(e), true); }
      };
    } else {
      w.innerHTML = `<div class="on-row" style="justify-content:space-between"><div class="on-me">${esc(me.nickname)} · <b>${me.rating ?? 1000}</b> pontos</div><button class="btn ghost" type="button" id="onRename">Trocar apelido</button></div>`;
      $('onRename').onclick = () => {
        w.innerHTML = `<div class="on-row"><input id="onNick" maxlength="16" value="${esc(me.nickname)}" aria-label="Novo apelido"><button class="btn primary" type="button" id="onRen">Salvar</button></div>`;
        $('onRen').onclick = async () => {
          try { const r = await rpc('penalti_rename', { p_id: me.id, p_secret: me.secret, p_nickname: $('onNick').value.trim() }); me.nickname = r.nickname; save(me); status(''); renderWho(); }
          catch (e) { status(msgOf(e), true); if (/credenciais/.test(e.message || '')) { me = null; save(null); renderWho(); } }
        };
      };
      refreshRating();
    }
  }
  const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  async function refreshRating() {
    if (!me) return;
    const { data } = await client().from('penalti_players').select('rating,nickname').eq('id', me.id).maybeSingle();
    if (data) { me.rating = data.rating; me.nickname = data.nickname; save(me); const el = document.querySelector('.on-me'); if (el) el.innerHTML = `${esc(me.nickname)} · <b>${me.rating}</b> pontos`; }
    else if (data === null && me) { /* cadastro apagado no servidor */ }
  }

  $('onModes').addEventListener('click', e => { const b = e.target.closest('[data-omode]'); if (!b) return; mode = b.dataset.omode; document.querySelectorAll('[data-omode]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
  $('onBack').onclick = () => { leaveLobby(); ov.hidden = true; $('menu').hidden = false; status(''); };
  $('onQuick').onclick = () => { if (needId()) return; enterLobby('penalti-lobby-' + mode, `Procurando adversário para ${MODE_NAME[mode]}…`); };
  $('onCreate').onclick = () => {
    if (needId()) return;
    const code = Array.from({ length: 4 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.random() * 31 | 0]).join('');
    enterLobby('penalti-room-' + code + '-' + mode, `Sala criada. Passe o código para seu amigo (modo ${MODE_NAME[mode]}):`, code);
  };
  $('onJoin').onclick = () => {
    if (needId()) return;
    const code = $('onCode').value.trim().toUpperCase();
    if (code.length !== 4) return status('O código tem 4 letras.', true);
    enterLobby('penalti-room-' + code + '-' + mode, `Entrando na sala ${code}… Confira se o modo é o mesmo do seu amigo.`);
  };
  const needId = () => { if (me) return false; status('Escolha um apelido primeiro.', true); return true; };

  // botão no menu principal
  const menuCard = document.querySelector('#menu .card'), startBtn = $('startBtn');
  if (menuCard && startBtn) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn on-menu-btn'; b.id = 'openOnline'; b.textContent = 'Jogar online contra outra pessoa';
    startBtn.after(b);
    b.onclick = () => { $('menu').hidden = true; ov.hidden = false; renderWho(); status(''); };
  }

  // ---------- encontro: partida rápida ou sala ----------
  function leaveLobby() { if (lobbyCh) { client().removeChannel(lobbyCh); lobbyCh = null; } }
  function enterLobby(name, text, code) {
    leaveLobby();
    status(text + (code ? '' : ''));
    if (code) $('onStatus').innerHTML = `${esc(text)}<div class="on-code">${code}</div>Esperando seu amigo entrar…`;
    let paired = false;
    const joinedAt = Date.now();
    const ch = lobbyCh = client().channel(name, { config: { presence: { key: me.id }, broadcast: { self: false } } });
    ch.on('presence', { event: 'sync' }, () => {
      if (paired) return;
      const list = Object.values(ch.presenceState()).map(a => a[0]).filter(Boolean).sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
      const i = list.findIndex(p => p.id === me.id);
      if (i >= 0 && i % 2 === 0 && list[i + 1]) {     // o mais antigo do par cria a partida
        paired = true;
        const opp = list[i + 1], matchId = uuid();
        ch.send({ type: 'broadcast', event: 'pair', payload: { to: opp.id, matchId, host: { id: me.id, nick: me.nickname, rating: me.rating || 1000 } } });
        setTimeout(() => { leaveLobby(); startMatch(matchId, 'A', opp); }, 400);
      }
    });
    ch.on('broadcast', { event: 'pair' }, ({ payload }) => {
      if (paired || payload.to !== me.id) return;
      paired = true; leaveLobby(); startMatch(payload.matchId, 'B', payload.host);
    });
    ch.subscribe(async s => {
      if (s === 'SUBSCRIBED') await ch.track({ id: me.id, nick: me.nickname, rating: me.rating || 1000, at: joinedAt });
      else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') status('Não foi possível conectar ao servidor do jogo. Tente de novo.', true);
    });
  }

  // ---------- partida ----------
  function send(type, payload) { if (matchCh) matchCh.send({ type: 'broadcast', event: type, payload }); }
  function startMatch(matchId, role, opp) {
    status(`Adversário encontrado: ${opp.nick}. Conectando…`);
    match = { id: matchId, role, opp: { id: opp.id, nick: opp.nick, rating: opp.rating }, mode, hello: false, started: false, over: false, pings: [] };
    const ch = matchCh = client().channel('penalti-match-' + matchId, { config: { presence: { key: me.id }, broadcast: { self: false } } });
    const P = root.PKProfile ? root.PKProfile.data : null;
    const hello = () => send('hello', { id: me.id, nick: me.nickname, rating: me.rating || 1000, kit: P && P.kit, gk: P && P.gk, perks: P && P.upgrades });
    ch.on('broadcast', { event: 'hello' }, ({ payload }) => {
      Object.assign(match.opp, { nick: payload.nick, rating: payload.rating, kit: payload.kit, gk: payload.gk, perks: payload.perks || {} });
      if (!match.hello) { match.hello = true; hello(); }
      if (role === 'A' && !match.started) measureAndStart();
    });
    ch.on('broadcast', { event: 'ping' }, ({ payload }) => send('pong', payload));
    ch.on('broadcast', { event: 'pong' }, ({ payload }) => { match.pings.push(performance.now() - payload.t); });
    ch.on('broadcast', { event: 'start' }, ({ payload }) => { if (role === 'B' && !match.started) begin(payload); });
    ch.on('broadcast', { event: 'ready' }, ({ payload }) => game && game.online && game.remoteReady(payload));
    ch.on('broadcast', { event: 'shot' }, ({ payload }) => game && game.online && game.remoteShot(payload));
    ch.on('broadcast', { event: 'dive' }, ({ payload }) => game && game.online && game.remoteDive(payload));
    ch.on('broadcast', { event: 'result' }, ({ payload }) => game && game.online && game.remoteResultMsg(payload));
    ch.on('broadcast', { event: 'bye' }, () => opponentLeft('saiu da partida'));
    ch.on('presence', { event: 'leave' }, ({ key }) => { if (key === match.opp.id && match.started && !match.over) setTimeout(() => { if (matchCh && !Object.keys(matchCh.presenceState()).includes(match.opp.id)) opponentLeft('perdeu a conexão'); }, 4000); });
    ch.on('presence', { event: 'sync' }, () => { if (!match.hello && Object.keys(ch.presenceState()).includes(match.opp.id)) hello(); });
    ch.subscribe(async s => {
      if (s === 'SUBSCRIBED') { await ch.track({ id: me.id }); hello(); }
      else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') status('A conexão com a partida falhou. Volte e tente de novo.', true);
    });
    setTimeout(() => { if (match && match.id === matchId && !match.started) { status('O adversário não respondeu. Tente outra partida.', true); quitMatch(false); } }, 15000);
  }
  async function measureAndStart() {
    match.started = 'starting';
    for (let i = 0; i < 4; i++) { send('ping', { t: performance.now() }); await new Promise(r => setTimeout(r, 150)); }
    await new Promise(r => setTimeout(r, 300));
    const rtt = match.pings.length ? match.pings.sort((a, b) => a - b)[Math.floor(match.pings.length / 2)] / 1000 : 0.15;
    const spots = new PK.Game().makeSpots.call({ mode: match.mode === 'freekick' ? 'freekick' : 'penalties' }).map(s => ({ x: +s.x.toFixed(3), z: +s.z.toFixed(3) }));
    const payload = { seed: Math.random() * 1e9 | 0, spots, mode: match.mode, latency: Math.min(0.4, rtt / 2) };
    send('start', payload);
    begin(payload);
  }
  async function begin(p) {
    match.started = true;
    try { await rpc('penalti_start_match', { p_id: me.id, p_secret: me.secret, p_match: match.id, p_opponent: match.opp.id, p_mode: p.mode }); }
    catch (e) { status(msgOf(e), true); }
    if (root.PKProfile && root.PKProfile.setOpponentKit) root.PKProfile.setOpponentKit(match.opp.kit, match.opp.gk);
    ov.hidden = true; $('menu').hidden = true; $('over').hidden = true;
    const online = {
      role: match.role, seed: p.seed, spots: p.spots, latency: p.latency, oppNick: match.opp.nick, oppPerks: match.opp.perks || {},
      firstTurn: match.role === 'A' ? 'user' : 'cpu', send
    };
    if (ui && ui.sound) ui.sound.init();
    game.start('medium', p.mode, { online });
    const head = document.querySelector('.board-head span'); if (head) head.textContent = `Online · ${MODE_NAME[p.mode]}`;
    const tc = document.querySelector('.team.cpu'); if (tc) tc.textContent = match.opp.nick.slice(0, 8);
    const tu = document.querySelector('.team.user'); if (tu) tu.textContent = 'Você';
    const dl = $('diffLbl'); if (dl) dl.textContent = `vs ${match.opp.rating}`;
    const rc = $('dotsC') && $('dotsC').closest('.row'); if (rc) rc.hidden = false;
    stallT = performance.now();
  }
  function quitMatch(sayBye) {
    if (sayBye) send('bye', {});
    if (matchCh) { client().removeChannel(matchCh); matchCh = null; }
    if (game && game.online) { game.online = null; game.state = 'menu'; }
    if (root.PKProfile && root.PKProfile.setOpponentKit) root.PKProfile.setOpponentKit(null);
    match = null;
  }

  // fim normal: informa o placar e mostra a variação no ranking
  async function report(d, forfeit) {
    if (!match || match.reported) return;
    match.reported = true; match.over = true;
    const my = d.gu, opp = d.gc;
    const box = $('overScore'), extra = document.querySelector('#over .rewards');
    const show = t => { if (extra) extra.textContent = t; };
    show('Registrando no ranking…');
    for (let tries = 0; tries < 8; tries++) {
      try {
        const r = await rpc('penalti_report', { p_id: me.id, p_secret: me.secret, p_match: match.id, p_my: my, p_opp: opp, p_forfeit: !!forfeit });
        if (r.status === 'final') { me.rating = r.rating; save(me); show(`Ranking: ${r.delta >= 0 ? '+' : ''}${r.delta} pontos · agora ${r.rating}${r.wo ? ' (vitória por W.O.)' : ''}`); return; }
        if (r.status === 'disputa') { show('Os placares informados não bateram; a partida não contou para o ranking.'); return; }
        show(forfeit ? 'Aguardando para confirmar a vitória por W.O.…' : 'Aguardando o adversário confirmar o placar…');
      } catch (e) { show(msgOf(e)); }
      await new Promise(r => setTimeout(r, forfeit ? 9000 : 3000));
    }
    show('O adversário não confirmou o placar; a partida não contou para o ranking.');
  }
  function opponentLeft(why) {
    if (!match || match.over) return;
    match.over = true;
    const nick = match.opp.nick;
    const gu = game.score.user.filter(Boolean).length, gc = game.score.cpu.filter(Boolean).length;
    game.state = 'over';
    $('overTitle').textContent = 'Vitória por W.O.';
    $('overScore').textContent = `${nick} ${why}. Placar no momento: você ${gu} × ${gc} ${nick}.`;
    $('over').hidden = false;
    match.reported = false;
    report({ gu, gc }, true);
  }

  function attach(g, u) {
    game = g; ui = u;
    game.on((t, d) => {
      if (!game.online || !match) return;
      if (t === 'over' && d.online) {
        $('overTitle').textContent = d.winner === 'user' ? `Você venceu ${match.opp.nick}!` : `${match.opp.nick} venceu`;
        $('overScore').textContent = `Você ${d.gu} × ${d.gc} ${match.opp.nick} · ${MODE_NAME[d.mode]} online`;
        report(d, false);
        setTimeout(() => { $('over').hidden = false; }, 600);
      }
    });
    // botões da tela final durante o online: nova partida online ou menu
    $('againBtn').addEventListener('click', e => {
      if (!match) return;
      e.stopImmediatePropagation();
      quitMatch(false); $('over').hidden = true; ov.hidden = false; renderWho(); status('');
    }, true);
    $('menuBtn').addEventListener('click', () => { if (match) quitMatch(!match.over); }, true);
    // adversário parado (aba em segundo plano, sem rede) por muito tempo: W.O.
    setInterval(() => {
      if (!match || match.over || !game.online) { stallT = performance.now(); return; }
      if (game.state !== 'waitRemote' && game.state !== 'waitReady') { stallT = performance.now(); return; }
      if (performance.now() - stallT > 45000) opponentLeft('ficou mais de 45 segundos sem jogar');
    }, 2000);
    root.addEventListener('beforeunload', () => { if (match && !match.over) send('bye', {}); });
  }

  root.PKOnline = { attach, get me() { return me; }, SB: { url: SB_URL, key: SB_KEY } };
})(typeof window !== 'undefined' ? window : globalThis);
