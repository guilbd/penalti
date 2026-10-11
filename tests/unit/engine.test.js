// Testes do motor do jogo (engine.js) sem navegador: node --test tests/unit
const test = require('node:test');
const assert = require('node:assert/strict');
require('../../engine.js');
const PK = globalThis.PK;

// placar como lista de cobranças: 'x' = gol, '.' = perdeu
const seq = s => [...s].map(c => c === 'x');
const decided = (mode, u, c) => PK.Game.prototype.decided.call({ mode, score: { user: seq(u), cpu: seq(c) } });

test('disputa de pênaltis: decide quando um lado não alcança mais', () => {
  assert.equal(decided('penalties', 'xxx', '...'), true);       // 3 x 0 com 2 cobranças para cada: acabou
  assert.equal(decided('penalties', 'xx', '..'), false);        // 2 x 0: o adversário ainda empata
  assert.equal(decided('penalties', 'xxx', '..'), false);       // 3 x 0, mas o adversário ainda tem 3 cobranças
  assert.equal(decided('penalties', 'xxxx.', 'xxxxx'), true);   // 4 x 5 depois das 5
  assert.equal(decided('penalties', 'xxxxx', 'xxxxx'), false);  // 5 x 5: morte súbita
});

test('morte súbita: só decide com o mesmo número de cobranças', () => {
  assert.equal(decided('penalties', 'xxxxxx', 'xxxxx'), false);
  assert.equal(decided('penalties', 'xxxxxx', 'xxxxx.'), true);
  assert.equal(decided('penalties', 'xxxxx.', 'xxxxx.'), false);
});

test('faltas usam a mesma regra da disputa', () => {
  assert.equal(decided('freekick', 'xxx', '...'), true);
  assert.equal(decided('freekick', 'x', '.'), false);
});

test('modo alvos termina pelo número de chutes', () => {
  const g = { mode: 'targets', shotsTaken: 10, totalShots: 10, score: { user: [], cpu: [] } };
  assert.equal(PK.Game.prototype.decided.call(g), true);
  g.shotsTaken = 9;
  assert.equal(PK.Game.prototype.decided.call(g), false);
});

test('moedas da partida contra o computador', () => {
  const r = PK.Game.prototype.rewards.call({ mode: 'penalties', stats: { goals: 3, saves: 2 } }, true);
  assert.deepEqual(r, { coins: 3 * 10 + 2 * 12 + 60, xp: 3 * 10 + 2 * 12 + 60 });
  const l = PK.Game.prototype.rewards.call({ mode: 'penalties', stats: { goals: 0, saves: 0 } }, false);
  assert.equal(l.coins, 15);
  const t = PK.Game.prototype.rewards.call({ mode: 'targets', points: 12, stats: {} }, true);
  assert.equal(t.coins, 20 + 36);
});

test('sorteio com semente é igual nos dois aparelhos (partida online)', () => {
  const a = PK.seeded(12345), b = PK.seeded(12345), c = PK.seeded(54321);
  const xa = Array.from({ length: 20 }, a), xb = Array.from({ length: 20 }, b), xc = Array.from({ length: 20 }, c);
  assert.deepEqual(xa, xb);
  assert.notDeepEqual(xa, xc);
  for (const v of xa) assert.ok(v >= 0 && v < 1);
});

test('skills vão até o nível 10', () => assert.equal(PK.PERK_MAX, 10));

test('patrocinador no ar respeita período e pausa', () => {
  const on = (m, d) => PK.sponsorOnAir(m, d);
  assert.equal(on({ ativo: true }, '2026-10-11'), true);
  assert.equal(on({ ativo: false }, '2026-10-11'), false);
  assert.equal(on({ ativo: true, inicio: '2026-10-12' }, '2026-10-11'), false);
  assert.equal(on({ ativo: true, fim: '2026-10-10' }, '2026-10-11'), false);
  assert.equal(on({ ativo: true, inicio: '2026-10-01', fim: '2026-10-11' }, '2026-10-11'), true);
});

test('data de hoje no horário de Brasília', () => {
  assert.match(PK.todayBR(), /^\d{4}-\d{2}-\d{2}$/);
});

test('física: bola parada cai e quica com a gravidade', () => {
  const b = new PK.Ball();
  assert.ok(b && b.p && b.v, 'a bola tem posição e velocidade');
});
