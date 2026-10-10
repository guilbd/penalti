/* Patrocinadores: envio das estatísticas do painel de LED e tela "Patrocinadores" no menu.
   - O painel (engine.js, LedBoard) soma exibições e segundos de tela de cada marca em PK.sponsorStats.
   - A cada 30 s, e quando a aba é fechada ou escondida, os valores vão para o Supabase
     (penalti_sponsor_track), identificados só por um código aleatório do aparelho.
   - Na tela "Patrocinadores", cada clique em "Visitar" também é contado.
   Os números aparecem em relatorio-patrocinadores.html.
   Requer engine.js, patrocinadores.js e online.js (endereço do servidor). */
(function (root) {
  'use strict';
  const PK = root.PK, SB = root.PKOnline && root.PKOnline.SB;
  if (!PK || !PK.sponsorList) return;
  const cfg = root.PK_SPONSORS || {};
  // em teste local não envia nada (para não misturar com os números reais), a não ser com ?stats=1
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && !/[?&]stats=1/.test(location.search);

  // ---------- código anônimo do aparelho (conta pessoas diferentes alcançadas) ----------
  const uuid = () => (root.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  let device = null;
  try { device = localStorage.getItem('penalti.aparelho.v1'); if (!device) localStorage.setItem('penalti.aparelho.v1', device = uuid()); } catch (e) { device = device || uuid(); }

  // ---------- envio ----------
  function take() {
    const items = [];
    for (const id in PK.sponsorStats) {
      const s = PK.sponsorStats[id];
      if (s.v || s.c || s.t >= 1) { items.push({ s: id, v: s.v, t: Math.round(s.t * 10) / 10, c: s.c }); s.v = 0; s.t = 0; s.c = 0; }
    }
    return items.slice(0, 30);
  }
  function giveBack(items) { items.forEach(i => { const s = PK.sponsorStat(i.s); s.v += i.v; s.t += i.t; s.c += i.c; }); }
  function flush(keepalive) {
    if (!SB || local) return;
    const items = take(); if (!items.length) return;
    fetch(SB.url + '/rest/v1/rpc/penalti_sponsor_track', {
      method: 'POST', keepalive: !!keepalive,
      headers: { apikey: SB.key, Authorization: 'Bearer ' + SB.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_device: device, p_items: items })
    }).then(r => { if (!r.ok) throw new Error(r.status); }).catch(() => giveBack(items));
  }
  setInterval(() => flush(false), 30000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(true); });
  root.addEventListener('pagehide', () => flush(true));

  // ---------- tela "Patrocinadores" ----------
  const st = document.createElement('style');
  st.textContent = `
  .sp-list { display: grid; gap: 10px; margin: 14px 0; }
  .sp-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; border: 1px solid var(--line); padding: 10px; background: rgba(255,255,255,.03); }
  .sp-item canvas { width: 100%; height: auto; aspect-ratio: 8 / 1; display: block; image-rendering: auto; }
  .sp-name { font-family: var(--display); font-weight: 700; letter-spacing: .06em; text-transform: uppercase; font-size: 15px; margin-top: 6px; color: var(--ink); }
  .sp-item .btn { text-decoration: none; white-space: nowrap; }
  .sp-cta { color: var(--muted); line-height: 1.5; margin: 6px 0 14px; }
  .sp-cta a { color: var(--gold); }
  .sp-menu-btn { width: 100%; margin-top: 8px; background: transparent !important; }
  @media (max-width: 480px) { .sp-item { grid-template-columns: 1fr; } .sp-item .btn { width: 100%; text-align: center; } }`;
  document.head.appendChild(st);

  const app = document.getElementById('app'), menu = document.getElementById('menu');
  if (!app || !menu) return;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = u => /^(https?:|mailto:|tel:)/i.test(String(u || '').trim()) ? String(u).trim() : '';

  const ov = document.createElement('div'); ov.className = 'overlay'; ov.id = 'sponsors'; ov.hidden = true;
  ov.innerHTML = `<div class="card" role="dialog" aria-label="Patrocinadores">
    <div class="eyebrow">Quem apoia o jogo</div>
    <h1 style="font-size:clamp(36px,7vw,56px)">Patrocinadores</h1>
    <div class="sp-list" id="spList"></div>
    <p class="sp-cta" id="spCta"></p>
    <button class="btn" type="button" id="spBack">Voltar ao menu</button></div>`;
  app.appendChild(ov);

  let board = null;
  function render() {
    board = board || new PK.LedBoard();          // reaproveita a arte de cada marca desenhada para o painel
    const seen = {}, list = document.getElementById('spList');
    list.innerHTML = '';
    board.list.forEach((m, i) => {
      if (m.exemplo || seen[m.id]) return; seen[m.id] = 1;
      const link = safeUrl(m.link);
      const it = document.createElement('div'); it.className = 'sp-item';
      it.innerHTML = `<div><div class="sp-art"></div><div class="sp-name">${esc(m.nome || (m.tipo === 'nextplayer' ? 'Next Player' : m.id))}</div></div>` +
        (link ? `<a class="btn" href="${esc(link)}" target="_blank" rel="noopener sponsored">Visitar</a>` : '');
      const art = document.createElement('canvas'); art.width = board.W; art.height = board.H;
      art.setAttribute('role', 'img'); art.setAttribute('aria-label', m.nome || m.id);
      const draw = () => art.getContext('2d').drawImage(board.tiles[i], 0, 0);
      draw(); setTimeout(draw, 600);              // de novo quando a fonte e o logo terminarem de carregar
      it.querySelector('.sp-art').appendChild(art);
      const a = it.querySelector('a');
      if (a) a.addEventListener('click', () => { PK.sponsorStat(m.id).c++; flush(true); });
      list.appendChild(it);
    });
    const contato = safeUrl(cfg.contato);
    document.getElementById('spCta').innerHTML = contato
      ? `Quer sua marca no painel de LED do estádio? <a href="${esc(contato)}" target="_blank" rel="noopener">Fale com a gente</a>.`
      : 'Quer sua marca no painel de LED do estádio? Fale com a gente.';
  }
  const back = () => { ov.hidden = true; menu.hidden = false; };
  document.getElementById('spBack').addEventListener('click', back);
  ov.addEventListener('keydown', e => { if (e.key === 'Escape') back(); });

  const anchor = document.getElementById('openOnline') || document.getElementById('startBtn');
  if (anchor) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sp-menu-btn'; b.id = 'openSponsors'; b.textContent = 'Patrocinadores';
    anchor.after(b);
    b.addEventListener('click', () => { menu.hidden = true; ov.hidden = false; render(); document.getElementById('spBack').focus(); });
  }
})(typeof window !== 'undefined' ? window : globalThis);
