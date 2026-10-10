/* Perfil do jogador: moedas, experiência, evolução (atributos), uniforme e recorde.
   Salvo no próprio aparelho (localStorage). Também monta a escolha de modo no menu e a tela
   "Seu jogador". Carregar depois de engine.js e antes de PK.bindUI. */
(function (root) {
  'use strict';
  const KEY = 'penalti.perfil.v1';
  const DEF = {
    coins: 0, xp: 0, played: 0,
    upgrades: { power: 0, accuracy: 0, curve: 0, reflex: 0, reach: 0 },
    // uniforme padrão: Next Player 2.2 (preto com detalhes verdes, nome nas costas)
    kit: { shirt: '#f2c230', shorts: '#17181c', socks: '#17181c', boots: '#111318', skin: '#c48a63', hair: '#1b1410', num: '10', style: 'nextplayer', backName: 'HULK' },
    gk: { shirt: '#18a36a', shorts: '#17181c', socks: '#17181c', gloves: '#2bb52b', style: 'nextplayer' },
    best: { targets: 0 }
  };
  const clone = o => JSON.parse(JSON.stringify(o));
  let data = clone(DEF);
  try {
    const raw = root.localStorage && localStorage.getItem(KEY);
    if (raw) { const d = JSON.parse(raw); data = Object.assign(clone(DEF), d, { upgrades: Object.assign(clone(DEF.upgrades), d.upgrades), kit: Object.assign(clone(DEF.kit), d.kit), gk: Object.assign(clone(DEF.gk), d.gk), best: Object.assign(clone(DEF.best), d.best) }); }
  } catch (e) { /* sem armazenamento: usa o padrão */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignora */ } };

  // nível n exige 100 + 200 + ... + 100n de experiência
  const levelOf = xp => Math.floor((Math.sqrt(1 + 8 * xp / 100) - 1) / 2) + 1;
  const xpFor = lv => 100 * (lv - 1) * lv / 2;

  // skills: o efeito de cada nível segue os números usados em engine.js
  const UPG = [
    { k: 'power', name: 'Força', who: 'Batedor', desc: 'Bola mais rápida no chute forte: o goleiro tem menos tempo.', lvl: '+0,6 m/s por nível' },
    { k: 'accuracy', name: 'Precisão', who: 'Batedor', desc: 'A bola sai mais perto de onde você mirou.', lvl: '−8% de desvio por nível' },
    { k: 'curve', name: 'Efeito', who: 'Batedor', desc: 'Curva mais forte no chute com efeito.', lvl: '+12% de curva por nível' },
    { k: 'reflex', name: 'Reflexo', who: 'Goleiro', desc: 'Seu goleiro move as mãos mais rápido para alcançar a bola.', lvl: '+6% de velocidade das mãos por nível' },
    { k: 'reach', name: 'Impulsão', who: 'Goleiro', desc: 'Seu goleiro salta mais longe e mais alto.', lvl: '+2,4% de alcance por nível' }
  ];
  const cost = lv => 60 * (lv + 1);
  // cores: [valor, nome, nível necessário]
  const SHIRTS = [['#f2c230', 'Amarelo', 1], ['#e9edf2', 'Branco', 1], ['#c8102e', 'Vermelho', 1], ['#1d4fb8', 'Azul', 2], ['#0f8a4a', 'Verde', 2], ['#17181c', 'Preto', 3], ['#f07a1a', 'Laranja', 4], ['#6b2fa0', 'Roxo', 5], ['#5bb8f0', 'Celeste', 6], ['#e85a9b', 'Rosa', 7], ['#8a1538', 'Grená', 8], ['#b89436', 'Dourado', 10]];
  const SHORTS = [['#1d3f8f', 'Azul', 1], ['#e9edf2', 'Branco', 1], ['#17181c', 'Preto', 1], ['#c8102e', 'Vermelho', 2], ['#0f8a4a', 'Verde', 3], ['#f2c230', 'Amarelo', 4]];
  const SOCKS = [['#f4f4f4', 'Branco', 1], ['#17181c', 'Preto', 1], ['#1d3f8f', 'Azul', 1], ['#c8102e', 'Vermelho', 2], ['#f2c230', 'Amarelo', 3], ['#0f8a4a', 'Verde', 3]];
  const BOOTS = [['#111318', 'Preta', 1], ['#f3f3f3', 'Branca', 1], ['#e8432e', 'Vermelha', 3], ['#2fd17a', 'Verde-limão', 5], ['#f2c230', 'Dourada', 9]];
  const SKIN = [['#f1c9a5', 'Clara', 1], ['#e0b08c', 'Média-clara', 1], ['#c48a63', 'Média', 1], ['#8d5a3b', 'Morena', 1], ['#5b3a26', 'Escura', 1]];
  const HAIR = [['#1b1410', 'Preto', 1], ['#5a3a1c', 'Castanho', 1], ['#b07a3a', 'Loiro escuro', 1], ['#e3c27a', 'Loiro', 2], ['#9a3b1e', 'Ruivo', 3], ['#d9d9d9', 'Platinado', 6]];
  const GK_SHIRTS = [['#18a36a', 'Verde', 1], ['#f07a1a', 'Laranja', 1], ['#17181c', 'Preto', 1], ['#a6e22e', 'Limão', 2], ['#e85a9b', 'Rosa', 4], ['#5bb8f0', 'Celeste', 5]];
  const GLOVES = [['#2bb52b', 'Verdes', 1], ['#f5f5f5', 'Brancas', 1], ['#17181c', 'Pretas', 1], ['#a6e22e', 'Limão', 2], ['#f07a1a', 'Laranjas', 3]];

  const kitBindings = [];
  // modelo "Next Player 2.2": camisa preta com gola, ombros e punhos verdes e nome verde nas costas
  const NP_GREEN = '#2bb52b';
  function kitFor(k) {
    if (k.style === 'nextplayer') return { shirt: '#141414', shorts: k.shorts, socks: k.socks, boots: k.boots, skin: k.skin, hair: k.hair, style: 'nextplayer', backName: k.backName || '', accent: NP_GREEN, num: (k.backName || k.num || '').toUpperCase(), numColor: NP_GREEN };
    return { shirt: k.shirt, shorts: k.shorts, socks: k.socks, boots: k.boots, skin: k.skin, hair: k.hair, style: 'lisa', backName: '', accent: null, num: k.num, numColor: contrast(k.shirt, k.shorts) };
  }
  function kitForGk(g, k) {        // goleiro: mesmo modelo, com manga longa e o nome nas costas
    if (g.style === 'nextplayer') return { shirt: '#141414', shorts: g.shorts, socks: g.socks, gloves: g.gloves, skin: k.skin, hair: k.hair, style: 'nextplayer', longSleeve: true, accent: NP_GREEN, backName: k.backName || '', num: (k.backName || '1').toUpperCase(), numColor: NP_GREEN };
    return { shirt: g.shirt, shorts: g.shorts, socks: g.socks, gloves: g.gloves, skin: k.skin, hair: k.hair, style: 'lisa', longSleeve: false, accent: null, backName: '', num: '1', numColor: contrast(g.shirt, '#ffffff') };
  }
  function applyKits(KITS) {
    const k = data.kit, g = data.gk;
    Object.assign(KITS.user, kitFor(k));
    Object.assign(KITS.gkUser, kitForGk(g, k));
  }
  function contrast(bg, pref) {          // cor do número legível sobre a camisa
    const lum = h => { const n = parseInt(h.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
    return Math.abs(lum(bg) - lum(pref)) > 0.35 ? pref : (lum(bg) > 0.55 ? '#14161c' : '#ffffff');
  }
  function changed() { save(); kitBindings.forEach(([K, fn]) => { applyKits(K); if (fn) fn(); }); renderStrip(); }

  const P = root.PKProfile = {
    get data() { return data; },
    level: () => levelOf(data.xp),
    perks: () => Object.assign({}, data.upgrades),
    bindKits(KITS, onChange) { kitBindings.push([KITS, onChange]); applyKits(KITS); },
    // partida online: o time "cpu" passa a usar o uniforme do adversário (null volta ao padrão)
    setOpponentKit(kit, gk) {
      kitBindings.forEach(([K, fn]) => {
        if (!K.__cpu0) { K.__cpu0 = Object.assign({}, K.cpu); K.__gk0 = Object.assign({}, K.gkCpu); }
        Object.assign(K.cpu, K.__cpu0); Object.assign(K.gkCpu, K.__gk0);
        if (kit && (kit.shirt !== data.kit.shirt || kit.style !== data.kit.style)) Object.assign(K.cpu, kitFor(Object.assign({ style: 'lisa' }, kit)));
        if (gk && (gk.shirt !== data.gk.shirt || gk.style !== data.gk.style)) Object.assign(K.gkCpu, kitForGk(Object.assign({ style: 'lisa' }, gk), Object.assign({}, data.kit, kit || {})));
        if (fn) fn();
      });
    },
    // moedas vindas de fora da partida (prêmio da rodada das ligas)
    addCoins(n) { data.coins += Math.max(0, n | 0); save(); renderStrip(); },
    addRewards(d) {
      const before = levelOf(data.xp);
      data.coins += d.rewards.coins; data.xp += d.rewards.xp; data.played++;
      let record = false;
      if (d.mode === 'targets' && d.points > data.best.targets) { data.best.targets = d.points; record = true; }
      save(); renderStrip();
      const after = levelOf(data.xp);
      return { levelUp: after > before, level: after, record, best: data.best.targets };
    }
  };

  // ---------- estilos das telas novas ----------
  const css = `
  .overlay { overflow-y: auto; place-items: safe center; }
  .modes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 18px; }
  .modes button { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left; padding: 10px; font-family: var(--display); font-size: 18px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; border: 1px solid var(--line); background: transparent; color: var(--ink); cursor: pointer; min-width: 0; }
  .modes button small { font-family: var(--body); font-size: 12px; font-weight: 500; letter-spacing: 0; text-transform: none; color: var(--muted); line-height: 1.3; }
  .modes button[aria-pressed="true"] { border-color: var(--gold); box-shadow: inset 0 0 0 1px var(--gold); }
  .modes button[aria-pressed="true"] small { color: var(--ink); }
  .pstrip { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; background: rgba(255,255,255,.04); border: 1px solid var(--line); padding: 10px 12px; margin: 0 0 18px; }
  .pstrip .lv { font-family: var(--display); font-weight: 700; font-size: 17px; letter-spacing: .06em; text-transform: uppercase; }
  .pstrip .lv b { color: var(--gold); }
  .pstrip .xpbar { height: 4px; background: rgba(255,255,255,.1); margin-top: 6px; width: 160px; max-width: 100%; }
  .pstrip .xpbar i { display: block; height: 100%; background: var(--gold); }
  .pstrip button, .pl-tabs button, .upg button { font-family: var(--display); font-weight: 700; letter-spacing: .08em; text-transform: uppercase; border: 1px solid var(--line); background: transparent; color: var(--ink); padding: 8px 12px; cursor: pointer; font-size: 15px; }
  .pstrip button:focus-visible, .pl-tabs button:focus-visible, .sw:focus-visible, .upg button:focus-visible, .modes button:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
  .player .card { width: min(620px, 100%); max-height: calc(100vh - 32px); overflow: auto; }
  .pl-top { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  .pl-coins { font-family: var(--display); font-size: 20px; font-weight: 800; color: var(--gold); font-variant-numeric: tabular-nums; }
  .pl-tabs { display: flex; gap: 6px; margin: 14px 0 16px; flex-wrap: wrap; }
  .pl-tabs button[aria-selected="true"] { background: var(--ink); color: var(--night); border-color: var(--ink); }
  .pl-preview { display: grid; grid-template-columns: 110px 1fr; gap: 16px; align-items: start; }
  .pl-preview svg { width: 110px; height: auto; }
  .opt-row { margin-bottom: 12px; min-width: 0; }
  .opt-row .lbl { font-family: var(--display); font-size: 13px; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); margin-bottom: 6px; }
  .sws { display: flex; flex-wrap: wrap; gap: 6px; }
  .sw { width: 30px; height: 30px; border: 2px solid rgba(255,255,255,.18); cursor: pointer; padding: 0; position: relative; }
  .sw[aria-pressed="true"] { border-color: var(--gold); box-shadow: 0 0 0 2px var(--night), 0 0 0 4px var(--gold); }
  .sw:disabled { cursor: not-allowed; opacity: .35; }
  .sw:disabled::after { content: attr(data-lv); position: absolute; inset: 0; display: grid; place-items: center; font: 700 11px var(--display); color: #fff; text-shadow: 0 1px 2px #000; }
  .np-opt { font-family: var(--display); font-weight: 700; font-size: 15px; letter-spacing: .06em; text-transform: uppercase; border: 1px solid var(--line); background: transparent; color: var(--ink); padding: 7px 12px; cursor: pointer; }
  .np-opt[aria-pressed="true"] { background: #2bb52b; border-color: #2bb52b; color: #08140a; }
  .num-in { width: 70px; font: 700 20px var(--display); background: transparent; color: var(--ink); border: 1px solid var(--line); padding: 6px 8px; }
  .upg { display: grid; grid-template-columns: 1fr auto; gap: 10px 14px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--line); }
  .upg .nm { font-family: var(--display); font-weight: 700; font-size: 18px; letter-spacing: .05em; text-transform: uppercase; }
  .upg .ds { color: var(--muted); font-size: 13px; margin-top: 2px; }
  .upg .pips { display: flex; gap: 4px; margin-top: 6px; }
  .upg .who { font-family: var(--display); font-weight: 700; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); border: 1px solid var(--line); padding: 0 6px; margin-left: 8px; vertical-align: middle; }
  .upg .lvl { color: var(--gold); font-size: 13px; margin-top: 2px; }
  .sk-help { background: rgba(242,194,48,.08); border: 1px solid rgba(242,194,48,.35); padding: 12px 14px; margin-bottom: 8px; font-size: 14px; line-height: 1.5; }
  .sk-help summary { font-family: var(--display); font-weight: 700; font-size: 16px; letter-spacing: .06em; text-transform: uppercase; color: var(--gold); cursor: pointer; }
  .sk-help ul { margin: 8px 0 0; padding-left: 18px; } .sk-help li { margin: 4px 0; }
  .sk-coins { font-family: var(--display); font-weight: 800; font-size: 22px; margin: 4px 0 6px; } .sk-coins b { color: var(--gold); }
  .upg .pips i { width: 18px; height: 6px; background: rgba(255,255,255,.12); }
  .upg .pips i.on { background: var(--gold); }
  .upg button:disabled { opacity: .45; cursor: not-allowed; }
  .rewards { font-family: var(--display); font-size: 18px; letter-spacing: .06em; text-transform: uppercase; color: var(--gold); margin: -6px 0 18px; }
  .charge { position: absolute; left: 16px; top: calc(140px + env(safe-area-inset-top, 0px)); width: 210px; background: var(--panel); border-left: 4px solid var(--gold); padding: 8px 12px; font-family: var(--display); text-transform: uppercase; letter-spacing: .1em; font-size: 13px; color: var(--muted); }
  .charge .cb { height: 8px; background: rgba(255,255,255,.1); margin-top: 6px; }
  .charge .cb i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #f29a32, #f2c230); transition: width .3s; }
  .charge.full { color: var(--gold); }
  .charge.full .cb i { background: linear-gradient(90deg, #f2c230, #fff3b0); animation: glow 0.8s ease-in-out infinite alternate; }
  @keyframes glow { from { filter: brightness(1); } to { filter: brightness(1.5); } }
  @media (max-width: 640px) { .modes button { font-size: 15px; padding: 8px; } .modes button small { display: none; } .pl-preview { grid-template-columns: 1fr; } .pl-preview svg { width: 90px; } .charge { top: calc(104px + env(safe-area-inset-top, 0px)); left: 12px; width: 170px; } }
  @media (prefers-reduced-motion: reduce) { .charge.full .cb i { animation: none; } }`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  // ---------- menu: modos e faixa do jogador ----------
  const card = document.querySelector('#menu .card');
  let strip;
  if (card) {
    const diffLabel = [...card.querySelectorAll('.eyebrow')].find(e => /Dificuldade/i.test(e.textContent));
    const modeLabel = document.createElement('div'); modeLabel.className = 'eyebrow'; modeLabel.style.marginBottom = '8px'; modeLabel.textContent = 'Modo';
    const modes = document.createElement('div'); modes.className = 'modes'; modes.setAttribute('role', 'group'); modes.setAttribute('aria-label', 'Modo de jogo');
    modes.innerHTML = [
      ['penalties', 'Pênaltis', '5 cobranças e morte súbita'],
      ['freekick', 'Faltas', 'Duelo com barreira, de 17 a 26 m'],
      ['targets', 'Alvos', '10 chutes, alvos e chute carregado']
    ].map(([k, n, d], i) => `<button type="button" id="mode-${k}" data-mode="${k}" aria-pressed="${i === 0}">${n}<small>${d}</small></button>`).join('');
    strip = document.createElement('div'); strip.className = 'pstrip';
    if (diffLabel) { card.insertBefore(strip, diffLabel); card.insertBefore(modeLabel, diffLabel); card.insertBefore(modes, diffLabel); }
    modes.addEventListener('click', e => {
      const b = e.target.closest('[data-mode]'); if (!b) return;
      modes.querySelectorAll('[data-mode]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    });
  }
  function renderStrip() {
    if (!strip) return;
    const lv = levelOf(data.xp), a = xpFor(lv), b = xpFor(lv + 1), pct = Math.round((data.xp - a) / (b - a) * 100);
    strip.innerHTML = `<div><div class="lv">Nível <b>${lv}</b> · ${data.coins} moedas</div><div class="xpbar" title="${data.xp - a} de ${b - a} XP"><i style="width:${pct}%"></i></div></div><button type="button" id="openPlayer">Jogador e skills</button>`;
    strip.querySelector('#openPlayer').addEventListener('click', openPlayer);
  }
  renderStrip();

  // ---------- tela "Seu jogador" ----------
  const ov = document.createElement('div'); ov.className = 'overlay player'; ov.id = 'player'; ov.hidden = true;
  ov.innerHTML = `<div class="card" role="dialog" aria-label="Seu jogador">
    <div class="pl-top"><div><div class="eyebrow">Seu jogador</div><h1 style="font-size:clamp(34px,6vw,48px);margin:4px 0 0">Vestiário</h1></div><div class="pl-coins" id="plCoins"></div></div>
    <div class="pl-tabs" role="tablist"><button type="button" role="tab" data-tab="kit" aria-selected="true">Batedor</button><button type="button" role="tab" data-tab="gk" aria-selected="false">Goleiro</button><button type="button" role="tab" data-tab="upg" aria-selected="false">Skills</button></div>
    <div id="plBody"></div>
    <button class="btn primary" id="plClose" type="button" style="margin-top:18px">Voltar ao menu</button></div>`;
  document.getElementById('app').appendChild(ov);
  let tab = 'kit';
  ov.querySelector('.pl-tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (!b) return; tab = b.dataset.tab; renderPlayer(); });
  ov.querySelector('#plClose').addEventListener('click', () => { ov.hidden = true; document.getElementById('menu').hidden = false; });
  function openPlayer() { document.getElementById('menu').hidden = true; ov.hidden = false; renderPlayer(); }

  function preview(k, gk) {      // camisa, calção, meião e chuteira em silhueta
    const np = k.style === 'nextplayer';
    return `<svg viewBox="0 0 110 170" aria-hidden="true">
      <circle cx="55" cy="18" r="13" fill="${k.skin || data.kit.skin}"/><path d="M42 13 q13 -14 26 0 q-2 -6 -13 -8 q-11 2 -13 8z" fill="${data.kit.hair}"/>
      <path d="M30 36 L80 36 L96 66 L84 72 L78 60 L78 100 L32 100 L32 60 L26 72 L14 66 Z" fill="${np ? '#141414' : k.shirt}"/>
      ${np ? `<path d="M30 36 L46 36 L55 52 L64 36 L80 36 L84 44 L70 42 L55 60 L40 42 L26 44 Z" fill="${NP_GREEN}"/><path d="M14 66 L26 72 L28 67 L16 61 Z M96 66 L84 72 L82 67 L94 61 Z" fill="${NP_GREEN}"/><text x="60" y="58" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-weight="800" font-style="italic" font-size="7" fill="#fff">NEXT</text><text x="60" y="65" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-weight="800" font-style="italic" font-size="7" fill="#fff">PLAYER</text>` : ''}
      ${gk && np ? `<path d="M14 66 L26 72 L22 82 L12 76 Z M96 66 L84 72 L88 82 L98 76 Z" fill="#141414"/>` : ''}
      ${gk ? `<circle cx="17" cy="80" r="7" fill="${k.gloves}"/><circle cx="93" cy="80" r="7" fill="${k.gloves}"/>` : `<rect x="12" y="66" width="10" height="16" fill="${data.kit.skin}"/><rect x="88" y="66" width="10" height="16" fill="${data.kit.skin}"/>`}
      <text x="55" y="80" text-anchor="middle" font-family="Barlow Condensed, Arial Narrow, sans-serif" font-weight="800" font-size="24" fill="${np ? NP_GREEN : contrast(k.shirt, '#ffffff')}">${np ? '' : gk ? '1' : data.kit.num}</text>
      <path d="M32 100 L78 100 L80 124 L58 124 L55 112 L52 124 L30 124 Z" fill="${k.shorts}"/>
      <rect x="35" y="124" width="14" height="14" fill="${data.kit.skin}"/><rect x="61" y="124" width="14" height="14" fill="${data.kit.skin}"/>
      <rect x="35" y="138" width="14" height="20" fill="${k.socks}"/><rect x="61" y="138" width="14" height="20" fill="${k.socks}"/>
      <path d="M33 158 h18 v8 h-22 z M59 158 h18 v8 h-14 z" fill="${gk ? '#111318' : data.kit.boots}"/></svg>`;
  }
  function swatches(label, list, obj, key) {
    const lv = levelOf(data.xp);
    return `<div class="opt-row"><div class="lbl">${label}</div><div class="sws">${list.map(([c, n, need]) =>
      `<button type="button" class="sw" style="background:${c}" title="${n}${need > lv ? ' · nível ' + need : ''}" aria-label="${n}${need > lv ? ', libera no nível ' + need : ''}" aria-pressed="${obj[key] === c}" data-set="${key}" data-val="${c}" data-lv="N${need}" ${need > lv ? 'disabled' : ''}></button>`).join('')}</div></div>`;
  }
  function renderPlayer() {
    ov.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    ov.querySelector('#plCoins').textContent = `${data.coins} moedas · nível ${levelOf(data.xp)}`;
    const body = ov.querySelector('#plBody');
    if (tab === 'kit') {
      const k = data.kit;
      const np = k.style === 'nextplayer';
      body.innerHTML = `<div class="pl-preview">${preview(k, false)}<div>
        <div class="opt-row"><div class="lbl">Modelo da camisa</div><div class="sws" role="group" aria-label="Modelo da camisa">
          <button type="button" class="np-opt" data-style="lisa" aria-pressed="${!np}">Lisa</button><button type="button" class="np-opt" data-style="nextplayer" aria-pressed="${np}">Next Player 2.2</button></div></div>
        ${np ? `<div class="opt-row"><div class="lbl">Nome nas costas</div><input class="num-in" style="width:160px" id="plBack" maxlength="10" value="${(k.backName || '').replace(/"/g, '')}" placeholder="HULK" aria-label="Nome nas costas"></div>` : swatches('Camisa', SHIRTS, k, 'shirt')}${swatches('Calção', SHORTS, k, 'shorts')}${swatches('Meião', SOCKS, k, 'socks')}${swatches('Chuteira', BOOTS, k, 'boots')}${swatches('Pele', SKIN, k, 'skin')}${swatches('Cabelo', HAIR, k, 'hair')}
        <div class="opt-row"><div class="lbl">Número</div><input class="num-in" id="plNum" type="number" min="1" max="99" value="${k.num}" aria-label="Número da camisa"></div></div></div>
        <p style="font-size:13px;margin:8px 0 0">Nas versões 3D com jogador realista, pele e cabelo vêm do modelo e não mudam.</p>`;
      body.onclick = e => {
        const st = e.target.closest('[data-style]');
        if (st) {
          k.style = st.dataset.style;
          if (k.style === 'nextplayer') { if (!k.backName) k.backName = 'HULK'; k.shorts = '#17181c'; k.socks = '#17181c'; }
          changed(); renderPlayer(); return;
        }
        const b = e.target.closest('[data-set]'); if (!b || b.disabled) return; k[b.dataset.set] = b.dataset.val; changed(); renderPlayer();
      };
      const back = body.querySelector('#plBack');
      if (back) back.onchange = e => { k.backName = e.target.value.replace(/[^A-Za-zÀ-ÿ0-9 .-]/g, '').trim().slice(0, 10).toUpperCase(); changed(); renderPlayer(); };
      body.querySelector('#plNum').onchange = e => { const n = Math.max(1, Math.min(99, parseInt(e.target.value, 10) || 10)); k.num = String(n); changed(); renderPlayer(); };
    } else if (tab === 'gk') {
      const g = data.gk;
      const gnp = g.style === 'nextplayer';
      body.innerHTML = `<div class="pl-preview">${preview(Object.assign({}, g, { boots: '#111318' }), true)}<div>
        <div class="opt-row"><div class="lbl">Modelo da camisa</div><div class="sws" role="group" aria-label="Modelo da camisa do goleiro">
          <button type="button" class="np-opt" data-gstyle="lisa" aria-pressed="${!gnp}">Lisa</button><button type="button" class="np-opt" data-gstyle="nextplayer" aria-pressed="${gnp}">Next Player 2.2</button></div></div>
        ${gnp ? '' : swatches('Camisa', GK_SHIRTS, g, 'shirt')}${swatches('Calção', SHORTS, g, 'shorts')}${swatches('Meião', GK_SHIRTS.concat(SOCKS), g, 'socks')}${swatches('Luvas', GLOVES, g, 'gloves')}</div></div>`;
      body.onclick = e => {
        const st = e.target.closest('[data-gstyle]');
        if (st) { g.style = st.dataset.gstyle; if (g.style === 'nextplayer') { g.shorts = '#17181c'; g.socks = '#17181c'; g.gloves = '#2bb52b'; } changed(); renderPlayer(); return; }
        const b = e.target.closest('[data-set]'); if (!b || b.disabled) return; g[b.dataset.set] = b.dataset.val; changed(); renderPlayer();
      };
    } else {
      body.innerHTML = `<div class="sk-coins">Você tem <b>${data.coins}</b> moedas</div>
        <details class="sk-help" ${data.upgrades && Object.values(data.upgrades).some(v => v > 0) ? '' : 'open'}><summary>Como funcionam as skills</summary><ul>
          <li><b>O que são:</b> melhorias do seu jogador. Força, Precisão e Efeito deixam seu <b>chute</b> melhor; Reflexo e Impulsão deixam seu <b>goleiro</b> melhor.</li>
          <li><b>Onde valem:</b> em todas as partidas, inclusive nas <b>partidas online contra outras pessoas</b> e nos jogos das ligas e do mata-mata. O adversário também joga com as skills dele.</li>
          <li><b>Como comprar:</b> toque em "Melhorar". Cada skill tem 5 níveis e o preço sobe a cada nível: 60, 120, 180, 240 e 300 moedas.</li>
          <li><b>Como ganhar moedas:</b> fazendo gols, defesas e vencendo partidas (contra o computador ou online), acertando alvos no modo Alvos e com o <b>prêmio da rodada</b> das ligas (até 300 moedas por semana).</li>
          <li>Moedas e skills ficam salvas neste aparelho.</li></ul></details>` +
        UPG.map(u => {
        const lv = data.upgrades[u.k], max = lv >= PK.PERK_MAX, c = cost(lv);
        return `<div class="upg"><div><div class="nm">${u.name}<span class="who">${u.who}</span></div><div class="ds">${u.desc}</div><div class="lvl">${u.lvl} · nível ${lv} de ${PK.PERK_MAX}</div><div class="pips">${Array.from({ length: PK.PERK_MAX }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div></div>
          <button type="button" data-buy="${u.k}" ${max || data.coins < c ? 'disabled' : ''} aria-label="${max ? u.name + ' no máximo' : `Melhorar ${u.name} por ${c} moedas`}">${max ? 'Máximo' : `Melhorar · ${c}`}</button></div>`;
      }).join('') + `<p style="font-size:13px;margin:12px 0 0">Recorde no modo Alvos: ${data.best.targets} pontos.</p>`;
      body.onclick = e => {
        const b = e.target.closest('[data-buy]'); if (!b || b.disabled) return;
        const k = b.dataset.buy, c = cost(data.upgrades[k]);
        if (data.coins >= c && data.upgrades[k] < PK.PERK_MAX) { data.coins -= c; data.upgrades[k]++; changed(); renderPlayer(); }
      };
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
