/* Pênalti — motor compartilhado pelas versões 2D e 3D.
   Física da bola (gravidade, arrasto quadrático e efeito Magnus), cinemática do batedor
   e do goleiro, IA, regras da disputa, som sintetizado e HUD.
   Unidades SI. Marca do pênalti em z = 0, linha do gol em z = 11, x lateral, y para cima. */
(function (root) {
  'use strict';

  const C = {
    G: 9.81,
    GW: 7.32, GH: 2.44, GZ: 11,     // largura e altura do gol, linha do gol
    BR: 0.11, PR: 0.06,             // raio da bola, raio da trave
    NET_TOP: 1.0, NET_BOT: 2.0,     // profundidade da rede no travessão e no chão
    KEEPER_Z: 10.75, BOARDS_Z: 15.5,
    KD: 0.0135,                     // arrasto: a = -KD |v| v   (ρ·Cd·A / 2m)
    KM: 0.0042                      // Magnus: a = KM (ω × v)
  };

  // ---------- vetores ----------
  const V = (x = 0, y = 0, z = 0) => ({ x, y, z });
  const add = (a, b) => V(a.x + b.x, a.y + b.y, a.z + b.z);
  const sub = (a, b) => V(a.x - b.x, a.y - b.y, a.z - b.z);
  const mul = (a, s) => V(a.x * s, a.y * s, a.z * s);
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const cross = (a, b) => V(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  const len = a => Math.hypot(a.x, a.y, a.z);
  const norm = a => { const l = len(a) || 1; return V(a.x / l, a.y / l, a.z / l); };
  const lerp = (a, b, t) => V(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
  const lerpN = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, t) => { t = clamp((t - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const rand = (a, b) => a + Math.random() * (b - a);
  const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const UP = V(0, 1, 0);
  const rightOf = f => V(-f.z, 0, f.x);          // f × up

  function rotVec(q, v) {                          // q = [w, x, y, z]
    const [w, x, y, z] = q;
    const tx = 2 * (y * v.z - z * v.y), ty = 2 * (z * v.x - x * v.z), tz = 2 * (x * v.y - y * v.x);
    return V(v.x + w * tx + (y * tz - z * ty), v.y + w * ty + (z * tx - x * tz), v.z + w * tz + (x * ty - y * tx));
  }
  function spinQuat(q, w, dt) {
    const [qw, qx, qy, qz] = q, hx = 0.5 * dt * w.x, hy = 0.5 * dt * w.y, hz = 0.5 * dt * w.z;
    q[0] = qw - hx * qx - hy * qy - hz * qz;
    q[1] = qx + hx * qw + hy * qz - hz * qy;
    q[2] = qy + hy * qw + hz * qx - hx * qz;
    q[3] = qz + hz * qw + hx * qy - hy * qx;
    const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    q[0] /= l; q[1] /= l; q[2] /= l; q[3] /= l;
  }
  const PHI = (1 + Math.sqrt(5)) / 2;
  const ICO = [[0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI], [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0], [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1]]
    .map(a => norm(V(a[0], a[1], a[2])));     // centros dos 12 pentágonos da bola

  // ---------- bola ----------
  function aero(b, dt) {
    const v = b.v, w = b.w, sp = len(v);
    const ax = -C.KD * sp * v.x + C.KM * (w.y * v.z - w.z * v.y);
    const ay = -C.G - C.KD * sp * v.y + C.KM * (w.z * v.x - w.x * v.z);
    const az = -C.KD * sp * v.z + C.KM * (w.x * v.y - w.y * v.x);
    v.x += ax * dt; v.y += ay * dt; v.z += az * dt;
    b.p.x += v.x * dt; b.p.y += v.y * dt; b.p.z += v.z * dt;
    const k = 1 - 0.12 * dt; w.x *= k; w.y *= k; w.z *= k;
  }

  class Ball {
    constructor() { this.reset(); }
    reset(spot) {
      this.p = V(spot ? spot.x : 0, C.BR, spot ? spot.z : 0); this.v = V(); this.w = V(); this.q = [1, 0, 0, 0];
      this.live = false; this.inGoal = false; this.goal = false; this.post = false; this.wallHit = false;
      this.touched = false; this.held = false; this.cross = null; this.netHits = [];
    }
  }

  const netBackZ = y => C.GZ + C.NET_BOT - (C.NET_BOT - C.NET_TOP) * clamp(y / C.GH, 0, 1);
  function reflect(v, n, e) {
    const vn = dot(v, n); if (vn >= 0) return false;
    v.x -= (1 + e) * vn * n.x; v.y -= (1 + e) * vn * n.y; v.z -= (1 + e) * vn * n.z; return true;
  }
  function closestOnSeg(p, a, b) {
    const ab = sub(b, a), l2 = dot(ab, ab); if (l2 < 1e-9) return a;
    return add(a, mul(ab, clamp(dot(sub(p, a), ab) / l2, 0, 1)));
  }
  function netHit(b, now, n, sp, emit) {
    b.netHits.push({ p: V(b.p.x, b.p.y, b.p.z), n, t: now, s: clamp(sp * 0.02, 0.06, 0.5) });
    if (b.netHits.length > 6) b.netHits.shift();
    if (sp > 2.5) emit('net', sp);
  }

  function stepBall(b, dt, keeper, now, emit, wall) {
    if (!b.live) return;
    if (b.held) { const h = keeper.handsMid(); b.p = V(h.x, h.y, h.z - 0.08); b.v = V(); b.w = V(); return; }
    const z0 = b.p.z;
    aero(b, dt); spinQuat(b.q, b.w, dt);
    const p = b.p, v = b.v, R = C.BR;

    if (z0 < C.GZ && p.z >= C.GZ && !b.cross) {
      b.cross = { x: p.x, y: p.y };
      if (Math.abs(p.x) < C.GW / 2 && p.y < C.GH) b.inGoal = true;
    }
    if (b.inGoal && !b.goal && p.z > C.GZ + R && Math.abs(p.x) < C.GW / 2 && p.y < C.GH) { b.goal = true; emit('goal'); }

    // gramado: quique, atrito de rolamento e rotação de rolamento
    if (p.y < R) {
      p.y = R;
      if (v.y < -0.6) { emit('bounce', -v.y); v.y = -v.y * 0.5; v.x *= 0.86; v.z *= 0.86; }
      else {
        v.y = 0;
        const hs = Math.hypot(v.x, v.z);
        if (hs > 0) { const k = Math.max(0, hs - 0.9 * dt) / hs; v.x *= k; v.z *= k; }
        b.w = V(v.z / R, b.w.y * 0.97, -v.x / R);
      }
    }
    // traves e travessão (cilindros)
    for (const sx of [-1, 1]) {
      const px = sx * (C.GW / 2 + C.PR), dx = p.x - px, dz = p.z - C.GZ, d = Math.hypot(dx, dz), m = R + C.PR;
      if (d < m && d > 1e-6 && p.y < C.GH + 2 * C.PR) {
        const n = V(dx / d, 0, dz / d); p.x = px + n.x * m; p.z = C.GZ + n.z * m;
        const sp = len(v); if (reflect(v, n, 0.62)) { b.post = true; emit('post', sp); }
      }
    }
    if (Math.abs(p.x) < C.GW / 2 + 2 * C.PR) {
      const cy = C.GH + C.PR, dy = p.y - cy, dz = p.z - C.GZ, d = Math.hypot(dy, dz), m = R + C.PR;
      if (d < m && d > 1e-6) {
        const n = V(0, dy / d, dz / d); p.y = cy + n.y * m; p.z = C.GZ + n.z * m;
        const sp = len(v); if (reflect(v, n, 0.62)) { b.post = true; emit('post', sp); }
      }
    }
    // rede por dentro
    if (b.inGoal && p.z > C.GZ) {
      const zb = netBackZ(p.y) - R;
      if (p.z > zb) { p.z = zb; if (v.z > 0) { netHit(b, now, V(0, 0.4, 1), len(v), emit); v.z *= -0.1; v.x *= 0.4; v.y *= 0.4; } }
      const hw = C.GW / 2 - R;
      if (Math.abs(p.x) > hw) { const s = Math.sign(p.x); p.x = s * hw; if (v.x * s > 0) { netHit(b, now, V(s, 0, 0), len(v), emit); v.x *= -0.1; v.z *= 0.6; v.y *= 0.6; } }
      if (p.y > C.GH - R) { p.y = C.GH - R; if (v.y > 0) { netHit(b, now, V(0, 1, 0), len(v), emit); v.y *= -0.1; v.z *= 0.6; } }
    }
    // rede por fora (a famosa "bola na rede pelo lado de fora")
    if (!b.inGoal && p.z > C.GZ + C.PR && p.z < netBackZ(Math.min(p.y, C.GH)) && p.y < C.GH + R) {
      const ax = Math.abs(p.x), s = Math.sign(p.x);
      if (ax < C.GW / 2 + R && ax > C.GW / 2 - 0.3 && p.y < C.GH) { p.x = s * (C.GW / 2 + R); if (v.x * s < 0) { netHit(b, now, V(-s, 0, 0), len(v), emit); v.x *= -0.15; v.z *= 0.5; } }
      else if (ax < C.GW / 2 && p.y > C.GH - 0.3) { p.y = C.GH + R; if (v.y < 0) { netHit(b, now, V(0, -1, 0), len(v), emit); v.y *= -0.2; } }
    }
    // placas de publicidade
    if (p.z > C.BOARDS_Z - R && p.y < 0.95 && v.z > 0) { p.z = C.BOARDS_Z - R; emit('boards', len(v)); v.z *= -0.35; }

    // barreira: cada jogador é uma cápsula do tornozelo aos ombros mais a cabeça (sobe quando pula)
    if (wall) {
      for (const c of wall.caps(now)) {
        const q = closestOnSeg(p, c.a, c.b), d = sub(p, q), dl = len(d), m = c.r + R;
        if (dl < m && dl > 1e-6) {
          const n = mul(d, 1 / dl);
          p.x = q.x + n.x * m; p.y = q.y + n.y * m; p.z = q.z + n.z * m;
          const sp = len(v);
          if (reflect(v, n, 0.3)) { v.x *= 0.45; v.y *= 0.45; v.z *= 0.45;   // corpo amortece: a bola perde boa parte da velocidade
            b.w = mul(b.w, 0.3); if (!b.wallHit) emit('wall', sp); b.wallHit = true; }
        }
      }
    }
    // goleiro (cápsulas do corpo, cada uma com a própria velocidade)
    if (keeper && keeper.caps) {
      for (const c of keeper.caps) {
        const ab = sub(c.b, c.a), l2 = dot(ab, ab), tt = l2 < 1e-9 ? 0 : clamp(dot(sub(p, c.a), ab) / l2, 0, 1);
        const q = add(c.a, mul(ab, tt)), d = sub(p, q), dl = len(d), m = c.r + R;
        if (dl < m && dl > 1e-6) {
          const n = mul(d, 1 / dl);
          p.x = q.x + n.x * m; p.y = q.y + n.y * m; p.z = q.z + n.z * m;
          const vk = c.va ? lerp(c.va, c.vb, tt) : V();
          const vr = sub(v, vk), vn = dot(vr, n), sp = len(vr);
          if (vn < 0) {
            b.touched = true;
            // encaixe: bola de frente, velocidade controlável, mãos juntas (ou no peito)
            const headOn = -vn / (sp || 1);
            if (c.grab && sp < (c.hand ? 17 : 14) && headOn > 0.7 && keeper.canCatch() && (!c.hand || keeper.handsGap() < 0.45)) { b.held = true; emit('catch', sp); return; }
            // espalmada: a luva amortece, há atrito, e a mão em movimento empurra a bola
            const e = c.hand ? 0.22 : c.leg ? 0.5 : 0.38, mu = c.hand ? 0.7 : 0.85;
            const vt = sub(vr, mul(n, vn)), nv = add(add(mul(vt, mu), mul(n, -vn * e)), vk);
            v.x = nv.x; v.y = nv.y; v.z = nv.z;
            if (c.hand && sp > 8) v.x += Math.sign(p.x || n.x) * 0.8;     // tende a espalmar para fora do gol
            b.w = mul(b.w, 0.3);
            emit('save', sp);
          }
        }
      }
    }
  }

  // Encontra a velocidade inicial que leva a bola ao alvo considerando arrasto e efeito.
  function solveShot(start, tgt, speed, spin) {
    const dz = C.GZ - start.z, t = dz / speed;
    let ax = tgt.x, ay = tgt.y + 0.5 * C.G * t * t, vel = V(0, 0, speed);
    for (let i = 0; i < 10; i++) {
      vel = mul(norm(V(ax - start.x, ay - start.y, dz)), speed);
      const s = { p: V(start.x, start.y, start.z), v: V(vel.x, vel.y, vel.z), w: V(spin.x, spin.y, spin.z) };
      let hit = null;
      for (let n = 0; n < 1500; n++) {
        const px = s.p.x, py = s.p.y, pz = s.p.z;
        aero(s, 1 / 240);
        if (s.p.z >= C.GZ) { const f = (C.GZ - pz) / (s.p.z - pz); hit = { x: px + (s.p.x - px) * f, y: py + (s.p.y - py) * f }; break; }
        if (s.v.z <= 0) break;
      }
      if (!hit) { ay += 1; continue; }
      const ex = tgt.x - hit.x, ey = tgt.y - hit.y;
      ax += ex; ay += ey;
      if (Math.abs(ex) < 0.004 && Math.abs(ey) < 0.004) break;
    }
    return vel;
  }

  function predictCross(b, zPlane) {          // onde e quando a bola cruza o plano z = zPlane
    const s = { p: V(b.p.x, b.p.y, b.p.z), v: V(b.v.x, b.v.y, b.v.z), w: V(b.w.x, b.w.y, b.w.z) };
    if (s.p.z >= zPlane || s.v.z <= 0) return null;
    for (let i = 0; i < 300; i++) {
      const pz = s.p.z; aero(s, 1 / 120);
      if (s.p.y < C.BR) { s.p.y = C.BR; if (s.v.y < 0) s.v.y *= -0.5; }
      if (s.p.z >= zPlane) { const f = (zPlane - pz) / (s.p.z - pz || 1); return { x: s.p.x, y: Math.max(C.BR, s.p.y), t: (i + f) / 120 }; }
    }
    return null;
  }
  // velocidade do chute: força + evolução + um acréscimo pela distância (de longe ninguém chuta "colocado" devagar)
  const shotSpeed = (power, dist, bonus) => 15 + 17 * power + (bonus || 0) + Math.max(0, dist - 12) * 0.6 * (0.55 + 0.45 * power);
  const shotSigma = (power, skill) => skill * (0.08 + 0.32 * power * power + 2.6 * Math.max(0, power - 0.82));
  function shotError(t, power, skill, chip) {
    if (chip) return { x: t.x + gauss() * 0.25 * skill, y: t.y + gauss() * 0.2 * skill };
    const s = shotSigma(power, skill), over = Math.max(0, power - 0.82);
    return { x: t.x + gauss() * s, y: Math.max(0.05, t.y + gauss() * s * 0.6 + over * 5) };
  }

  // ---------- cinemática: pernas ----------
  const L1 = 0.46, L2 = 0.45, LF = 0.2;
  function legChain(hip, f, a, k) {          // a: ângulo da coxa, k: flexão do joelho
    const knee = add(hip, add(mul(f, L1 * Math.sin(a)), mul(UP, -L1 * Math.cos(a))));
    const s = a - k;
    const ankle = add(knee, add(mul(f, L2 * Math.sin(s)), mul(UP, -L2 * Math.cos(s))));
    const fd = add(mul(f, Math.cos(s)), mul(UP, Math.sin(s)));
    return { knee, ankle, toe: add(ankle, mul(fd, LF)), fd };
  }
  function ik(root0, target, l1, l2, bend) {  // IK de dois ossos
    let d = sub(target, root0), dl = len(d);
    const maxL = l1 + l2 - 1e-3;
    if (dl > maxL) { target = add(root0, mul(d, maxL / dl)); d = sub(target, root0); dl = maxL; }
    if (dl < 1e-4) return { mid: add(root0, mul(bend, l1)), end: target };
    const dn = mul(d, 1 / dl);
    const a = (l1 * l1 - l2 * l2 + dl * dl) / (2 * dl), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const b = norm(sub(bend, mul(dn, dot(bend, dn))));
    return { mid: add(add(root0, mul(dn, a)), mul(b, h)), end: target };
  }
  function torso(j, pel, spine, r) {
    j.pelvis = pel; j.spine = spine; j.r = r;
    j.chest = add(pel, mul(spine, 0.48)); j.neck = add(pel, mul(spine, 0.57)); j.head = add(pel, mul(spine, 0.71));
    j.shL = add(j.chest, mul(r, -0.19)); j.shR = add(j.chest, mul(r, 0.19));
    j.hipL = add(pel, mul(r, -0.1)); j.hipR = add(pel, mul(r, 0.1));
  }

  // ---------- batedor (destro) ----------
  class Kicker {
    constructor(o) {
      this.t0 = o.t0; this.kit = o.kit || 'user';
      this.power = o.power ?? 0.7; this.target = o.target || { x: 0, y: 1 };
      this.curve = o.curve || 0; this.chip = !!o.chip; this.skill = o.skill ?? 1;
      this.shotTarget = null;
      const p = this.chip ? 0.35 : this.power;
      this.speedBonus = o.speedBonus || 0; this.curveMul = o.curveMul || 1;
      this.ball = o.ball ? V(o.ball.x, C.BR, o.ball.z) : V(0, C.BR, 0);
      const fg = norm(V(-this.ball.x, 0, C.GZ - this.ball.z));                       // direção do centro do gol
      const ft = norm(V(this.target.x - this.ball.x, 0, C.GZ - this.ball.z));         // direção do alvo
      this.fk = norm(lerp(fg, ft, 0.35));
      const rk = rightOf(this.fk), rg = rightOf(fg);
      this.aCon = 0.45; this.kCon = 0.7;
      const ch = legChain(mul(rk, 0.1), this.fk, this.aCon, this.kCon);
      const contact = add(ch.ankle, mul(ch.fd, 0.09));               // peito do pé
      const ballBack = V(this.ball.x - this.fk.x * C.BR, C.BR - 0.03, this.ball.z - this.fk.z * C.BR);
      this.Pc = sub(ballBack, contact);                                // pelve no instante do contato
      this.S = add(add(V(this.ball.x, this.Pc.y, this.ball.z), mul(fg, -3.4)), mul(rg, -1.9));   // início da corrida (lado esquerdo)
      this.S.y = this.Pc.y;
      this.D = Math.hypot(this.Pc.x - this.S.x, this.Pc.z - this.S.z);
      this.runSpeed = 3.2 + 2.6 * p;
      this.tWait = o.wait ?? 0.35;
      this.Tc = this.tWait + this.D / this.runSpeed;
      this.swingT = 0.26 - 0.08 * p;
      this.aBack = -0.45 - 0.55 * p; this.kBack = 1.45 + 0.45 * p; this.aFT = 1.0 + 0.5 * p;
      this.fRun = norm(V(this.Pc.x - this.S.x, 0, this.Pc.z - this.S.z));
      this.plant = add(add(this.ball, mul(rk, -0.3)), mul(this.fk, -0.12)); this.plant.y = 0.07;
    }
    get contactAt() { return this.t0 + this.Tc; }
    pose(now) {
      const t = now - this.t0, Tc = this.Tc;
      const tr = clamp((t - this.tWait) / (Tc - this.tWait), 0, 1);
      let pel, dist;
      if (t <= Tc) { pel = lerp(this.S, this.Pc, tr); dist = tr * this.D; }
      else { const k = 1 - Math.exp(-3 * (t - Tc)); pel = add(this.Pc, mul(this.fk, 0.9 * k)); dist = this.D + 0.9 * k; }
      const f = norm(lerp(this.fRun, this.fk, smooth(0.5, 1, tr)));
      const r = rightOf(f), l = mul(r, -1);
      const ph = dist / 0.8 * Math.PI;
      const tsw = Tc - this.swingT;
      const kick = smooth(tsw - 0.24, tsw - 0.02, t);
      const amp = 0.6 * smooth(this.tWait, this.tWait + 0.25, t) * (1 - smooth(Tc + 0.2, Tc + 0.9, t));
      pel = V(pel.x, pel.y + (1 - kick) * amp * 0.06 * Math.cos(2 * ph) - amp * 0.03, pel.z);

      const gaitA = q => amp * Math.sin(q);
      const gaitK = q => 0.1 + (amp / 0.6) * 0.85 * Math.max(0, Math.cos(q)) + (amp / 0.6) * 0.15;
      let aR = gaitA(ph + Math.PI), kR = gaitK(ph + Math.PI);
      const aL = gaitA(ph), kL = gaitK(ph);
      let ka, kk;
      if (t < tsw) { ka = this.aBack; kk = this.kBack; }
      else if (t < Tc) { const u = (t - tsw) / this.swingT; ka = lerpN(this.aBack, this.aCon, u * u); kk = lerpN(this.kBack, this.kCon, Math.pow(u, 1.4)); }
      else {
        const u = clamp((t - Tc) / 0.28, 0, 1), eo = 1 - (1 - u) * (1 - u);
        ka = lerpN(this.aCon, this.aFT, eo); kk = lerpN(this.kCon, 0.12, eo);
        const back = smooth(Tc + 0.45, Tc + 1.1, t); ka = lerpN(ka, 0.04, back); kk = lerpN(kk, 0.1, back);
      }
      aR = lerpN(aR, ka, kick); kR = lerpN(kR, kk, kick);

      const lean = lerpN(0.14 * amp / 0.6, -0.12, kick);
      const spine = norm(add(add(UP, mul(f, lean)), mul(l, 0.1 * kick)));
      const j = { f };
      torso(j, pel, spine, r);
      const legR = legChain(j.hipR, f, aR, kR);
      let legL = legChain(j.hipL, f, aL, kL);
      const plantW = smooth(tsw - 0.16, tsw, t) * (1 - smooth(Tc + 0.35, Tc + 0.8, t));
      if (plantW > 0) {
        const s = ik(j.hipL, this.plant, L1, L2, add(f, V(0, 0.1, 0)));
        legL = { knee: lerp(legL.knee, s.mid, plantW), ankle: lerp(legL.ankle, s.end, plantW), toe: lerp(legL.toe, add(s.end, mul(this.fk, LF)), plantW) };
      }
      j.knL = legL.knee; j.anL = legL.ankle; j.toL = legL.toe;
      j.knR = legR.knee; j.anR = legR.ankle; j.toR = legR.toe;

      const arm = (sh, q, s) => {
        const al = 1.25 * amp * Math.sin(q) + 0.05;
        const el = add(add(sh, add(mul(f, 0.29 * Math.sin(al)), mul(UP, -0.29 * Math.cos(al)))), mul(r, 0.05 * s));
        const a2 = al + 0.25 + 1.0 * amp / 0.6;
        return [el, add(el, add(mul(f, 0.27 * Math.sin(a2)), mul(UP, -0.27 * Math.cos(a2))))];
      };
      let [elL, hdL] = arm(j.shL, ph + Math.PI, -1), [elR, hdR] = arm(j.shR, ph, 1);
      const kw = kick * (1 - smooth(Tc + 0.5, Tc + 1.2, t));
      if (kw > 0) {
        const elLk = add(j.shL, mul(norm(add(add(mul(l, 0.9), mul(UP, 0.15)), mul(f, 0.25))), 0.29));
        const hdLk = add(elLk, mul(norm(add(add(mul(l, 0.55), mul(UP, 0.45)), mul(f, 0.35))), 0.27));
        const elRk = add(j.shR, mul(norm(add(add(mul(r, 0.35), mul(UP, -0.8)), mul(f, -0.35))), 0.29));
        const hdRk = add(elRk, mul(norm(add(add(mul(l, 0.25), mul(UP, -0.4)), mul(f, 0.5))), 0.27));
        elL = lerp(elL, elLk, kw); hdL = lerp(hdL, hdLk, kw); elR = lerp(elR, elRk, kw); hdR = lerp(hdR, hdRk, kw);
      }
      j.elL = elL; j.hdL = hdL; j.elR = elR; j.hdR = hdR;
      return j;
    }
  }

  // ---------- goleiro ----------
  // Mergulho balístico: impulso de ~0,1 s e depois voo sob gravidade. Velocidade de saída
  // limitada (lateral 5 m/s, vertical 3,8 m/s), então o ângulo alto fica fora de alcance como
  // na vida real. Depois do chute, com tempo de reação humano, as mãos se ajustam à bola.
  const REACH = 1.08;            // do quadril às mãos com o corpo esticado
  const VX_MAX = 5.0, VY_MAX = 3.4, PUSH_T = 0.1, HAND_SPEED = 6.5, ADJ_MAX = 0.5;
  const PERK_MAX = 5;
  class Keeper {
    constructor() { this.x = 0; this.reset(0); }
    setPerks(reach, reflex) { this.vxMax = VX_MAX + 0.12 * reach; this.vyMax = VY_MAX + 0.06 * reach; this.handSpeed = HAND_SPEED + 0.4 * reflex; }
    reset(now) { this.x = 0; this.dive = null; this.readErr = null; if (this.readNoise == null) this.readNoise = 0; if (this.vxMax == null) this.setPerks(0, 0); this.theta = 0; this.capsPrev = null; this.capsPrevT = null; this.lastNow = now; this.update(now); }
    swayX(now) { return 0.12 * Math.sin(now * 1.7) + 0.04 * Math.sin(now * 4.1); }
    readyFeet(px, z) { return [V(px - 0.3, 0.06, z + 0.02), V(px + 0.3, 0.06, z + 0.02)]; }
    readyHands(hip) { return [add(hip, V(-0.46, 0.22, -0.34)), add(hip, V(0.46, 0.22, -0.34))]; }
    startDive(T, now) {
      if (this.dive) return;
      this.dive = this.planDive(T, now);
    }
    planDive(T, now) {
      const hip0 = V(this.x + this.swayX(now), 0.84, C.KEEPER_Z);
      const Dx = T.x - hip0.x, Dy = T.y - hip0.y, dist = Math.hypot(Dx, Dy);
      const big = dist >= REACH * 0.9;
      const d = { T: V(T.x, T.y, C.KEEPER_Z - 0.4), t0: now, hip0, big, feet0: this.readyFeet(hip0.x, C.KEEPER_Z), aim: null };
      if (!big) {
        const disp = V(Dx * 0.35, Math.min(0, Dy) * 0.25, 0);
        d.hipF = add(hip0, disp); d.hipF.z = C.KEEPER_Z - 0.2;
        d.Td = 0.12 + 0.2 * Math.hypot(disp.x, disp.y);
      } else {
        const need = Math.min(dist - REACH, 2.6);
        let dx = Dx / dist * need, dy = Math.max(0.24 - hip0.y, Dy / dist * need);
        const sx = Math.sign(dx) || 1, hipP = add(hip0, V(sx * Math.min(0.1, Math.abs(dx) * 0.3), -0.06, 0));
        dx = hip0.x + dx - hipP.x; dy = hip0.y + dy - hipP.y;
        // tempo de voo: o mínimo que a velocidade lateral permite; aumenta se a altura exigir
        let tf = Math.max(0.2, Math.abs(dx) / this.vxMax), ok = false;
        const VY = this.vyMax;
        for (let k = 0; k < 40; k++) { if (dy <= VY * tf - 4.9 * tf * tf) { ok = true; break; } tf += 0.01; }
        if (!ok) { tf = Math.max(tf - 0.4, VY / 9.8); dy = Math.min(dy, VY * tf - 4.9 * tf * tf); }   // fora do alcance: sobe o máximo possível
        d.hipP = hipP; d.vx = dx / tf; d.vy = (dy + 4.9 * tf * tf) / tf; d.tf = tf;
        d.hipF = V(hipP.x + dx, hipP.y + dy, C.KEEPER_Z - 0.35);
        d.Td = PUSH_T + tf;
        d.lateral = Math.abs(dx) > 0.9;
        d.floorY = d.lateral ? 0.22 : 0.84;
        const c = hipP.y - d.floorY;                       // instante em que volta ao chão
        d.tLand = PUSH_T + (d.vy + Math.sqrt(Math.max(0, d.vy * d.vy + 19.6 * c))) / 9.8;
      }
      const bd = norm(V(T.x - d.hipF.x, T.y - d.hipF.y, 0));
      d.thetaF = clamp(Math.atan2(bd.x, bd.y), -1.75, 1.75);
      if (!big) { d.thetaF *= 0.6 * clamp(dist / REACH, 0, 1); d.lateral = Math.abs(Dx) > 0.6; }   // defesa curta: corpo quase em pé
      return d;
    }
    // previsão da bola (instante e ponto em que cruza a frente do goleiro): ajusta as mãos ou dispara um reflexo
    react(pr, now, wide) {
      const d = this.dive;
      if (d) {
        const ex = d.err ? d.err.x * 0.8 : 0, ey = d.err ? d.err.y * 0.8 : 0;
        const dx = pr.x + ex - d.T.x, dy = pr.y + ey - d.T.y, l = Math.hypot(dx, dy), k = l > ADJ_MAX ? ADJ_MAX / l : 1;
        d.Tadj = V(d.T.x + dx * k, d.T.y + dy * k, d.T.z);
      } else if (pr.t > 0.04) {
        // alcance do reflexo: só perto do corpo, ou (goleiro do computador) até onde o mergulho chega.
        // Salta só quando o tempo do mergulho bate com a chegada da bola, senão cai antes dela passar.
        const hx = this.x + this.swayX(now), dist = Math.hypot(pr.x - hx, pr.y - 0.84);
        const range = wide ? REACH + 2.6 : REACH + 1.1;
        if (dist < range) {
          // leitura imperfeita da trajetória: o canto escolhido tem um erro que diminui com a bola perto
          if (!this.readErr) this.readErr = V(gauss() * this.readNoise, gauss() * this.readNoise * 0.6, 0);
          const k = clamp(pr.t / 0.6, 0.3, 1), e = mul(this.readErr, k);
          const d = this.planDive(V(pr.x + e.x, clamp(pr.y + e.y, 0.15, 2.5), 0), now);
          if (pr.t <= d.Td + 0.06) { d.err = e; this.dive = d; }
        }
      }
    }
    canCatch() { return !this.dive || Math.abs(this.theta) < 0.7; }
    // ext: corpo animado externo (versão 3D com animações reais) que fornece cápsulas e mãos
    handsMid() { return this.ext ? this.ext.hands() : lerp(this.j.hdL, this.j.hdR, 0.5); }
    handsGap() {
      const h = this.caps.filter(c => c.hand);
      return h.length === 2 ? len(sub(h[0].a, h[1].a)) : 1;
    }
    hipAt(d, t) {               // quadril e ângulo do corpo no instante t do mergulho
      if (!d.big) {
        const p = clamp(t / d.Td, 0, 1), e = 1 - Math.pow(1 - p, 2.2);
        const hip = lerp(d.hip0, d.hipF, e); hip.y += 0.08 * Math.sin(Math.PI * p);
        const fall = clamp((t - d.Td) / 0.5, 0, 1), g = fall * fall;
        let th = d.thetaF * e;
        if (fall > 0) { if (d.lateral) { hip.y = lerpN(hip.y, 0.2, g); th = lerpN(th, Math.sign(d.thetaF) * 1.6, g); } else { hip.y = lerpN(hip.y, 0.84, g); th = lerpN(th, 0, g); } }
        return { hip, th, p, e, landed: g };
      }
      let hip, landed = 0;
      if (t < PUSH_T) hip = lerp(d.hip0, d.hipP, smooth(0, PUSH_T, t));
      else {
        const tau = Math.min(t, d.tLand) - PUSH_T;
        // o impulso lateral leva o quadril até o ponto escolhido; dali em diante só a gravidade age
        hip = V(d.hipP.x + d.vx * Math.min(tau, d.tf), d.hipP.y + d.vy * tau - 4.9 * tau * tau, 0);
        if (t > d.tLand) {     // no chão: escorrega e perde velocidade
          const s = t - d.tLand; hip.x += d.vx * 0.22 * (1 - Math.exp(-s * 5)); hip.y = d.floorY;
          // mergulho lateral: deita no chão; esticão em pé: segura o braço esticado ~0,45 s antes de voltar
          landed = d.lateral ? smooth(0, 0.3, s) : smooth(d.Td + 0.45, d.Td + 0.8, t);
        }
        hip.y = Math.max(hip.y, 0.2);
      }
      hip.z = lerpN(d.hip0.z, d.hipF.z, smooth(0, d.Td, t));
      const p = clamp(t / d.Td, 0, 1), e = smooth(0, 1, p);
      let th = d.thetaF * smooth(0, d.Td * 0.85, t);
      if (landed > 0) th = d.lateral ? lerpN(th, Math.sign(d.thetaF) * 1.6, landed) : lerpN(th, 0, landed);
      return { hip, th, p, e, landed };
    }
    update(now) {
      const dt = clamp(now - this.lastNow, 0, 0.05); this.lastNow = now;
      const j = { f: V(0, 0, -1) };
      let hands, feet, bend = V(0, 0.1, -1);
      if (!this.dive) {
        const pel = V(this.x + this.swayX(now), 0.84 + 0.02 * Math.sin(now * 6.5), C.KEEPER_Z);
        this.theta = 0;
        torso(j, pel, norm(V(0, 1, -0.3)), V(1, 0, 0));
        hands = this.readyHands(pel); feet = this.readyFeet(pel.x, C.KEEPER_Z);
      } else {
        const d = this.dive, t = now - d.t0;
        const { hip, th, p, e, landed } = this.hipAt(d, t);
        const lateral = d.lateral, g = landed;
        this.theta = th;
        const spine = norm(V(Math.sin(th), Math.cos(th), -0.3 * (1 - e)));
        const r = V(Math.cos(th), -Math.sin(th), 0);
        torso(j, hip, spine, r);
        // mãos: vão até o alvo (ajustado pelo reflexo) com velocidade limitada
        const target = (g > 0 && lateral) ? add(j.chest, mul(spine, 0.62)) : (d.Tadj || d.T);
        if (!d.aim) d.aim = V(target.x, target.y, target.z);
        const delta = sub(target, d.aim), dl = len(delta), step = this.handSpeed * dt;
        d.aim = dl > step ? add(d.aim, mul(delta, step / dl)) : V(target.x, target.y, target.z);
        const toA = sub(d.aim, j.chest), ad = norm(toA), hc = add(j.chest, mul(ad, Math.min(0.6, len(toA))));
        const dh = [add(hc, mul(r, -0.09)), add(hc, mul(r, 0.09))];
        const rh = this.readyHands(hip);
        const w = smooth(0, 0.35, p) * (lateral ? 1 : 1 - g);
        hands = [lerp(rh[0], dh[0], w), lerp(rh[1], dh[1], w)];
        const push = smooth(0.1, 0.55, p) * (lateral ? 1 : 1 - g);
        const trailA = add(hip, add(mul(spine, -0.88), mul(r, -0.14)));
        const trailB = add(hip, add(mul(spine, -0.6), mul(r, 0.2)));
        const base = lateral ? d.feet0 : this.readyFeet(hip.x, hip.z);
        feet = [lerp(base[0], trailA, push), lerp(base[1], trailB, push)];
        feet.forEach(q => { q.y = Math.max(0.06, q.y); });
        bend = norm(add(V(0, 0, -1), mul(spine, 0.4)));
      }
      const la = ik(j.hipL, feet[0], L1, L2, bend), lb = ik(j.hipR, feet[1], L1, L2, bend);
      j.knL = la.mid; j.anL = la.end; j.knR = lb.mid; j.anR = lb.end;
      const toeDir = norm(add(j.f, mul(UP, 0.2)));
      j.toL = add(j.anL, mul(toeDir, LF)); j.toR = add(j.anR, mul(toeDir, LF));
      const ha = ik(j.shL, hands[0], 0.3, 0.29, mul(j.r, -1)), hb = ik(j.shR, hands[1], 0.3, 0.29, j.r);
      j.elL = ha.mid; j.hdL = ha.end; j.elR = hb.mid; j.hdR = hb.end;
      this.j = j;
      let caps = [
        { a: j.pelvis, b: j.chest, r: 0.17, grab: true },
        { a: j.head, b: j.head, r: 0.12 },
        { a: j.shL, b: j.elL, r: 0.07 }, { a: j.elL, b: j.hdL, r: 0.07 },
        { a: j.shR, b: j.elR, r: 0.07 }, { a: j.elR, b: j.hdR, r: 0.07 },
        { a: j.hdL, b: j.hdL, r: 0.11, hand: true, grab: true }, { a: j.hdR, b: j.hdR, r: 0.11, hand: true, grab: true },
        { a: j.hipL, b: j.knL, r: 0.1, leg: true }, { a: j.knL, b: j.anL, r: 0.08, leg: true },
        { a: j.hipR, b: j.knR, r: 0.1, leg: true }, { a: j.knR, b: j.anR, r: 0.08, leg: true }
      ];
      if (this.ext) caps = this.ext.caps();
      // velocidade de cada parte do corpo, usada no contato com a bola
      if (caps !== this.caps) {
        const prev = this.capsPrev, pdt = this.capsPrevT == null ? 0 : now - this.capsPrevT;
        const vel = (a0, a1) => { if (pdt <= 1e-4) return V(); const v = mul(sub(a1, a0), 1 / pdt), l = len(v); return l > 9 ? mul(v, 9 / l) : v; };
        for (let i = 0; i < caps.length; i++) {
          const c = caps[i], q = prev && prev.length === caps.length ? prev[i] : null;
          c.va = q ? vel(q.a, c.a) : V(); c.vb = q ? vel(q.b, c.b) : V();
        }
        this.capsPrev = caps; this.capsPrevT = now;
      }
      this.caps = caps;
    }
  }

  // ---------- barreira ----------
  // Fica a 9,15 m da bola cobrindo a trave do lado da bola; o primeiro jogador fica um pouco
  // por fora da linha da trave e os outros em direção ao centro. Pula logo depois do chute.
  class Wall {
    constructor(spot, n, side) {
      this.n = n; this.side = side; this.jumpT = null;
      const ball = V(spot.x, 0, spot.z), post = V(side * (C.GW / 2 + 0.2), 0, C.GZ);
      const toPost = norm(sub(post, ball)), c = add(ball, mul(toPost, 9.15));
      let perp = norm(V(-toPost.z, 0, toPost.x));
      if (dot(perp, sub(V(0, 0, C.GZ), c)) < 0) perp = mul(perp, -1);              // os demais vão para o centro
      this.members = [];
      for (let i = 0; i < n; i++) this.members.push({ p: add(c, mul(perp, (i - 0.4) * 0.5)), f: mul(toPost, -1), delay: rand(0, 0.08), h: rand(0.3, 0.42) });
    }
    jump(now) { if (this.jumpT == null) this.jumpT = now + 0.05; }
    jumpY(m, now) {
      if (this.jumpT == null) return 0;
      const u = (now - this.jumpT - m.delay) / 0.5;
      return u <= 0 || u >= 1 ? 0 : m.h * Math.sin(Math.PI * u);
    }
    caps(now) {
      const out = [];
      for (const m of this.members) {
        const y = this.jumpY(m, now), b = V(m.p.x, y, m.p.z);
        out.push({ a: add(b, V(0, 0.2, 0)), b: add(b, V(0, 1.42, 0)), r: 0.21 }, { a: add(b, V(0, 1.64, 0)), b: add(b, V(0, 1.64, 0)), r: 0.11 });
      }
      return out;
    }
    pose(i, now) {             // articulações no mesmo formato do batedor e do goleiro
      const m = this.members[i], y = this.jumpY(m, now), f = m.f, r = rightOf(f);
      const j = { f };
      const pel = V(m.p.x, 0.93 + y, m.p.z);
      torso(j, pel, UP, r);
      j.elL = add(j.shL, V(0, -0.27, 0)); j.elR = add(j.shR, V(0, -0.27, 0));
      j.elL = add(j.elL, mul(f, 0.08)); j.elR = add(j.elR, mul(f, 0.08));
      j.hdL = add(add(pel, mul(f, 0.15)), add(mul(r, -0.06), V(0, -0.05, 0)));
      j.hdR = add(add(pel, mul(f, 0.16)), add(mul(r, 0.06), V(0, 0.02, 0)));
      for (const s of ['L', 'R']) {
        const hip = j['hip' + s], feet = add(V(hip.x, 0.05 + y * 0.9, hip.z), mul(r, s === 'L' ? -0.03 : 0.03));
        const k = ik(hip, feet, L1, L2, add(f, V(0, 0.1, 0)));
        j['kn' + s] = k.mid; j['an' + s] = k.end; j['to' + s] = add(k.end, mul(f, LF));
      }
      return j;
    }
  }

  // ---------- rede: linhas da malha e deformação ----------
  function netLines() {
    const L = [], hw = C.GW / 2 + C.PR, H = C.GH + C.PR, nx = 30, ny = 10, nd = 5;
    const back = (x, y) => ({ p: V(x, y, netBackZ(y) + 0.02), n: V(0, 0.35, 1) });
    for (let i = 0; i <= nx; i++) { const x = -hw + 2 * hw * i / nx, pl = []; for (let k = 0; k <= 8; k++) pl.push(back(x, H * k / 8)); L.push(pl); }
    for (let k = 0; k <= ny; k++) { const y = H * k / ny, pl = []; for (let i = 0; i <= 20; i++) pl.push(back(-hw + 2 * hw * i / 20, y)); L.push(pl); }
    for (let i = 0; i <= nx; i++) { const x = -hw + 2 * hw * i / nx, pl = []; for (let k = 0; k <= 4; k++) pl.push({ p: V(x, H, C.GZ + C.NET_TOP * k / 4), n: V(0, 1, 0.2) }); L.push(pl); }
    for (let k = 1; k <= nd; k++) { const z = C.GZ + C.NET_TOP * k / nd, pl = []; for (let i = 0; i <= 20; i++) pl.push({ p: V(-hw + 2 * hw * i / 20, H, z), n: V(0, 1, 0.2) }); L.push(pl); }
    for (const s of [-1, 1]) {
      for (let k = 1; k <= 8; k++) { const f = k / 8, pl = []; for (let m = 0; m <= 8; m++) { const y = H * m / 8, z = C.GZ + (netBackZ(y) - C.GZ) * f; pl.push({ p: V(s * hw, y, z), n: V(s, 0, 0) }); } L.push(pl); }
      for (let m = 0; m <= ny; m++) { const y = H * m / ny, pl = []; for (let k = 0; k <= 6; k++) pl.push({ p: V(s * hw, y, C.GZ + (netBackZ(y) - C.GZ) * k / 6), n: V(s, 0, 0) }); L.push(pl); }
    }
    return L;
  }
  function netOffset(pt, hits, now) {
    let s = 0;
    for (const h of hits) {
      const dt = now - h.t; if (dt < 0 || dt > 3) continue;
      const dx = pt.p.x - h.p.x, dy = pt.p.y - h.p.y, dz = pt.p.z - h.p.z;
      s += h.s * Math.exp(-(dx * dx + dy * dy + dz * dz) / 0.35) * Math.exp(-dt * 2.4) * (1 - Math.exp(-dt * 40));
    }
    return s ? mul(norm(pt.n), s) : null;
  }

  // ---------- dificuldade ----------
  const DIFF = {
    easy: { name: 'Fácil', gkReact: 0.32, gkRead: 1.0, kSkill: 1.35, read: 0.12, noise: 0.95, stay: 0.14, react: 0.1, retarget: 0.15, chip: 0 },
    medium: { name: 'Médio', gkReact: 0.25, gkRead: 0.72, kSkill: 1.0, read: 0.3, noise: 0.6, stay: 0.1, react: 0.04, retarget: 0.45, chip: 0.03 },
    hard: { name: 'Difícil', gkReact: 0.19, gkRead: 0.48, kSkill: 0.72, read: 0.45, noise: 0.42, stay: 0.08, react: 0, retarget: 0.75, chip: 0.05 }
  };

  // ---------- partida ----------
  class Game {
    constructor() {
      this.now = 0; this.ball = new Ball(); this.keeper = new Keeper();
      this.kicker = new Kicker({ t0: 0, wait: 1e9, kit: 'user' });
      this.state = 'menu'; this.diff = 'medium'; this.handlers = [];
      this.aim = { x: -2.2, y: 1.1 }; this.curve = 0; this.chip = false; this.power = 0;
      this.score = { user: [], cpu: [] }; this.turn = 'user'; this.result = null; this.info = null; this.plan = null;
      this.memory = { shots: [], dives: [] };
      this.mode = 'penalties'; this.spot = V(0, 0, 0); this.wall = null; this.targets = [];
      this.points = 0; this.charge = 0; this.charged = false; this.shotsTaken = 0; this.perks = {};
      this.stats = { goals: 0, saves: 0, targets: 0 };
      this.emitFn = (t, d) => this.emit(t, d);
    }
    get totalShots() { return this.mode === 'targets' ? 10 : 5; }
    on(fn) { this.handlers.push(fn); }
    emit(t, d) { for (const h of this.handlers) h(t, d); }
    get D() { return DIFF[this.diff]; }
    get slowmo() { const b = this.ball; return this.state === 'flight' && b.live && !!this.keeper.dive && b.p.z > C.GZ - 2.6 && b.p.z < C.GZ + 0.3; }
    start(diff, mode) {
      if (diff) this.diff = diff;
      if (mode) this.mode = mode;
      this.score = { user: [], cpu: [] }; this.turn = 'user'; this.memory = { shots: [], dives: [] };
      this.points = 0; this.charge = 0; this.charged = false; this.shotsTaken = 0;
      this.stats = { goals: 0, saves: 0, targets: 0 };
      const P = root.PKProfile && root.PKProfile.perks ? root.PKProfile.perks() : {};
      this.perks = Object.assign({ power: 0, accuracy: 0, curve: 0, reflex: 0, reach: 0 }, P);
      this.spots = this.makeSpots();
      this.emit('start'); this.setupKick();
    }
    makeSpots() {           // posições das cobranças: faltas entre 17,5 e 26 m, fora da grande área
      const fk = () => { const zd = rand(17.5, 26), x = rand(-12, 12); return V(x, 0, C.GZ - zd); };
      const out = [];
      for (let i = 0; i < 12; i++) out.push(this.mode === 'penalties' || (this.mode === 'targets' && i < 3) ? V(0, 0, 0) : fk());
      return out;
    }
    spotFor() {
      if (this.mode === 'penalties') return V(0, 0, 0);
      if (this.mode === 'targets') return this.spots[Math.min(this.shotsTaken, this.spots.length - 1)];
      const round = this.turn === 'user' ? this.score.user.length : this.score.cpu.length;   // os dois batem do mesmo lugar em cada rodada
      return this.spots[round % this.spots.length];
    }
    makeTargets() {         // três alvos dentro do gol: pequeno vale 5, médio 3, grande 2
      const out = [];
      for (const [r, pts] of [[0.32, 5], [0.45, 3], [0.6, 2]]) {
        for (let k = 0; k < 60; k++) {
          const t = { x: rand(-C.GW / 2 + r + 0.08, C.GW / 2 - r - 0.08), y: rand(r + 0.06, C.GH - r - 0.06), r, pts };
          if (out.every(o => Math.hypot(o.x - t.x, o.y - t.y) > o.r + t.r + 0.1)) { out.push(t); break; }
        }
      }
      return out;
    }
    get distance() { return Math.hypot(this.spot.x, C.GZ - this.spot.z); }
    setupKick() {
      const spot = this.spot = this.spotFor();
      this.ball.reset(spot);
      const pk = this.perks;
      if (this.turn === 'cpu') this.keeper.setPerks(pk.reach, pk.reflex); else this.keeper.setPerks(0, 0);
      this.keeper.reset(this.now);
      const isFK = Math.hypot(spot.x, C.GZ - spot.z) > 16;
      const side = Math.abs(spot.x) > 1.5 ? Math.sign(spot.x) : (Math.random() < 0.5 ? -1 : 1);
      this.wall = isFK ? new Wall(spot, Math.hypot(spot.x, C.GZ - spot.z) < 22 ? 4 : 3, side) : null;
      this.keeper.x = isFK ? -side * 0.35 : 0;                     // com barreira, o goleiro cobre o outro lado
      this.keeper.update(this.now);
      this.targets = this.mode === 'targets' ? this.makeTargets() : [];
      this.result = null; this.info = null; this.plan = null; this.power = 0; this.pendingDive = null; this.passWallT = null;
      this.keeper.readNoise = this.turn === 'user' ? this.D.gkRead : 0;
      if (this.turn === 'user') {
        this.kicker = new Kicker({ t0: this.now, wait: 1e9, kit: 'user', ball: spot });
        this.state = 'aim';
      } else {
        this.kicker = new Kicker(Object.assign({ t0: this.now, wait: 1.8, kit: 'cpu', ball: spot }, this.wall ? this.cpuFreeKick() : this.cpuShot()));
        this.aim = { x: 0, y: 1.0 };
        this.state = 'runup';
      }
      this.emit('setup', { turn: this.turn });
    }
    cpuShot() {
      const D = this.D, r = Math.random();
      let target, chip = false;
      if (r < D.chip) { chip = true; target = { x: rand(-0.4, 0.4), y: rand(1.3, 1.7) }; }
      else if (r < D.chip + 0.1) target = { x: rand(-0.8, 0.8), y: rand(0.3, 1.7) };
      else {
        const dv = this.memory.dives, pos = dv.filter(s => s > 0).length;
        const pPos = dv.length > 1 ? clamp(1 - (pos + 1) / (dv.length + 2), 0.25, 0.75) : 0.5;
        const s = Math.random() < pPos ? 1 : -1;
        target = { x: s * rand(1.7, 3.15), y: Math.random() < 0.6 ? rand(0.25, 0.9) : rand(0.9, 2.05) };
      }
      return { target, power: rand(0.55, 0.86), curve: rand(-0.35, 0.35), chip, skill: D.kSkill };
    }
    cpuFreeKick() {
      const D = this.D, spot = this.spot, side = this.wall.side;
      const tryUse = Math.random() < ({ easy: 0.45, medium: 0.7, hard: 0.9 })[this.diff];
      let pick = null;
      for (let i = 0; i < 14; i++) {
        const over = Math.random() < 0.6;          // por cima da barreira no canto dela, ou no canto do goleiro
        const target = over ? { x: side * rand(2.3, 3.3), y: rand(1.5, 2.2) } : { x: -side * rand(2.0, 3.2), y: rand(0.3, 1.7) };
        const cand = { target, power: over ? rand(0.5, 0.72) : rand(0.6, 0.85), curve: over ? -side * rand(0.4, 0.85) : rand(-0.3, 0.3), chip: false, skill: D.kSkill };
        pick = cand;
        if (!tryUse || this.simulateClear(cand)) break;
      }
      return pick;
    }
    simulateClear(c) {       // a bola passa pela barreira e entra (sem goleiro)?
      const b = new Ball(); b.reset(this.spot);
      const k = new Kicker(Object.assign({ t0: 0, wait: 0, ball: this.spot }, c));
      const speed = shotSpeed(c.power, Math.hypot(this.spot.x, C.GZ - this.spot.z), 0), spin = V(4 + 8 * c.power + 28 * Math.abs(c.curve), -c.curve * 55, 0);
      b.v = solveShot(b.p, c.target, speed, spin); b.w = spin; b.live = true;
      const w = new Wall(this.spot, this.wall.n, this.wall.side); w.members = this.wall.members.map(m => Object.assign({}, m)); w.jump(0);
      for (let t = 0; t < 2.5; t += 1 / 240) { stepBall(b, 1 / 240, null, t, () => {}, w); if (b.goal) return true; if (b.wallHit || b.v.z < 0) return false; }
      return false;
    }
    cpuKeeperPlan() {
      const D = this.D, k = this.kicker, aim = k.target, r = Math.random();
      let T;
      if (r < D.stay) T = { x: rand(-0.3, 0.3), y: rand(0.6, 1.4) };
      else if (r < D.stay + D.read) T = { x: aim.x + gauss() * D.noise, y: clamp(aim.y + gauss() * D.noise * 0.6, 0.2, 2.3) };
      else {
        const sh = this.memory.shots, pos = sh.filter(s => s > 0).length, pPos = (pos + 1) / (sh.length + 2);
        const s = Math.random() < pPos ? 1 : -1;
        T = { x: s * rand(1.6, 2.9), y: rand(0.45, 1.5) };
      }
      return { T, at: k.contactAt - rand(0.1, 0.26) + D.react };
    }
    setAim(x, y) {
      const st = this.state;
      const ok = st === 'aim' || st === 'charging' || (this.turn === 'cpu' && !this.keeper.dive && (st === 'runup' || st === 'flight'));
      if (ok) this.aim = { x: clamp(x, -5.2, 5.2), y: clamp(y, 0.05, 3.6) };
    }
    adjustCurve(d) { if (this.turn === 'user' && (this.state === 'aim' || this.state === 'charging')) this.curve = clamp(Math.round((this.curve + d) * 4) / 4, -1, 1); }
    toggleChip() { if (this.turn === 'user' && (this.state === 'aim' || this.state === 'charging')) this.chip = !this.chip; }
    pressStart() { if (this.state === 'aim') { this.state = 'charging'; this.chargeT0 = this.now; this.power = 0; } }
    pressEnd() {
      if (this.state !== 'charging') return;
      const p = Math.max(0.05, this.power);
      const pk = this.perks;
      this.kicker = new Kicker({ t0: this.now, wait: 0.12, power: p, target: { x: this.aim.x, y: this.aim.y }, curve: this.curve, chip: this.chip,
        skill: 1 - 0.08 * pk.accuracy, speedBonus: 0.6 * pk.power, curveMul: 1 + 0.12 * pk.curve, kit: 'user', ball: this.spot });
      this.memory.shots.push(Math.sign(this.aim.x));
      this.plan = this.wall ? null : this.cpuKeeperPlan();     // na falta o goleiro espera a bola
      this.state = 'runup';
    }
    shoot(o) {                       // chute vindo de um gesto (celular): alvo, força e efeito de uma vez
      if (this.state !== 'aim' && this.state !== 'charging') return false;
      this.aim = { x: clamp(o.x, -5.2, 5.2), y: clamp(o.y, 0.05, 3.6) };
      this.curve = clamp(o.curve || 0, -1, 1); this.power = clamp(o.power, 0.05, 1);
      if (o.chip != null) this.chip = !!o.chip;
      this.state = 'charging'; this.pressEnd();
      return true;
    }
    dive() {
      if (this.turn !== 'cpu' || this.keeper.dive || (this.state !== 'runup' && this.state !== 'flight')) return;
      const k = this.kicker;
      if (this.wall) {        // falta: a bola demora ~1 s; o goleiro guarda o canto escolhido e salta na hora certa
        if (!this.pendingDive) { this.memory.dives.push(Math.sign(this.aim.x)); this.emit('dive'); }
        this.pendingDive = { x: this.aim.x, y: this.aim.y };          // dá para trocar de canto até o salto
        return;
      }
      if (this.state === 'runup' && this.now < k.contactAt - 0.28 && Math.random() < this.D.retarget) {
        const s = this.aim.x > 0.6 ? -1 : this.aim.x < -0.6 ? 1 : (Math.random() < 0.5 ? -1 : 1);
        k.shotTarget = { x: s * rand(1.9, 3.0), y: rand(0.3, 1.5) };
      }
      this.memory.dives.push(Math.sign(this.aim.x));
      this.keeper.startDive({ x: this.aim.x, y: this.aim.y }, this.now);
      this.emit('dive');
    }
    launch() {
      const k = this.kicker;
      const tgt = shotError(k.shotTarget || k.target, k.power, k.skill, k.chip);
      const dist = Math.hypot(this.ball.p.x, C.GZ - this.ball.p.z);
      const speed = k.chip ? rand(12, 13.5) + Math.max(0, dist - 12) * 0.35 : shotSpeed(k.power, dist, k.speedBonus);
      // chute com efeito tem o eixo de giro inclinado: além de curvar, a bola cai (topspin)
      const spin = k.chip ? V(-30, 0, 0) : V(4 + 8 * k.power + 28 * Math.abs(k.curve), -k.curve * 55 * k.curveMul, 0);
      if (this.wall) this.wall.jump(this.now);
      const b = this.ball;
      b.v = solveShot(b.p, tgt, speed, spin); b.w = spin; b.live = true;
      this.flightT0 = this.now; this.state = 'flight';
      this.info = { kmh: Math.round(speed * 3.6), foot: speed / 1.2, chip: k.chip, charged: this.mode === 'targets' && this.charged };
      this.emit('kick', { speed });
    }
    update(dt) {
      dt = Math.min(dt, 0.05);
      const n = Math.max(1, Math.ceil(dt / (1 / 480))), h = dt / n;
      for (let i = 0; i < n; i++) { this.now += h; this.tick(h); }
    }
    tick(h) {
      const now = this.now, k = this.kicker, st = this.state;
      // reflexo do goleiro: depois do tempo de reação, prevê onde a bola cruza e reage
      if (st === 'flight' && this.ball.live && !this.ball.touched && !this.ball.held) {
        const react = this.turn === 'user' ? this.D.gkReact : 0.22 - 0.015 * this.perks.reflex;
        if (this.wall && this.passWallT == null) {
          const s = this.spot, b = this.ball.p, f = norm(V(-s.x, 0, C.GZ - s.z));
          if ((b.x - s.x) * f.x + (b.z - s.z) * f.z > 9.4) this.passWallT = now;
        }
        const seen = !this.wall || (this.passWallT != null && now - this.passWallT >= 0.08);
        if (seen && now - this.flightT0 >= react && now - (this.lastPred || -9) >= 1 / 30) {
          this.lastPred = now;
          const pr = predictCross(this.ball, C.KEEPER_Z - 0.3);
          if (pr) this.keeper.react(pr, now, this.turn === 'user');
        }
      }
      if (this.pendingDive && !this.keeper.dive && st === 'flight' && this.ball.live && !this.ball.touched && now - (this.lastPend || -9) >= 1 / 120) {
        this.lastPend = now;
        const pr = predictCross(this.ball, C.KEEPER_Z - 0.3), pd = this.pendingDive;
        const d = this.keeper.planDive(V(pd.x, pd.y, 0), now);
        if (!pr || pr.t <= d.Td + 0.05) { this.keeper.dive = d; this.pendingDive = null; }
      }
      if (st === 'charging') this.power = Math.min(1, (now - this.chargeT0) / 1.05);
      if ((st === 'runup' || st === 'flight') && this.plan && !this.keeper.dive && now >= this.plan.at) this.keeper.startDive(this.plan.T, now);
      if (st === 'runup' && now >= k.contactAt) this.launch();
      this.keeper.update(now);
      stepBall(this.ball, h, this.keeper, now, this.emitFn, this.wall);
      if (this.state === 'flight') { const o = this.outcome(now - this.flightT0); if (o) this.finish(o); }
      else if (this.state === 'result' && now - this.resultT > 2.9) this.next();
    }
    outcome(tf) {
      const b = this.ball, sp = len(b.v);
      if (b.goal) return 'goal';
      if (b.held) return 'save';
      const fail = () => b.touched ? 'save' : b.wallHit ? 'wall' : (b.post ? 'post' : 'miss');
      if (tf > 4) return fail();
      if ((b.p.z > C.GZ + 0.3 && !b.inGoal) || (b.v.z < 0 && b.p.z < C.GZ) || (sp < 1.5 && b.p.y < 0.2)) return fail();
      return null;
    }
    finish(o) {
      const c = this.ball.cross;
      this.result = { outcome: o, turn: this.turn, high: o === 'miss' && c && c.y > C.GH };
      this.score[this.turn].push(o === 'goal');
      if (this.turn === 'user' && o === 'goal') this.stats.goals++;
      if (this.turn === 'cpu' && o === 'save') this.stats.saves++;
      if (this.mode === 'targets') {
        // pontos: alvo vale o número dele, gol fora do alvo vale 1; chute carregado dobra
        const hit = o === 'goal' && c ? this.targets.find(t => Math.hypot(c.x - t.x, c.y - t.y) <= t.r) : null;
        let pts = o === 'goal' ? (hit ? hit.pts : 1) : 0;
        const was = this.charged;
        if (was) pts *= 2;
        this.points += pts;
        if (hit) { this.stats.targets++; hit.hit = true; }
        if (was) { this.charged = false; this.charge = 0; }
        else if (hit) { this.charge = Math.min(1, this.charge + 0.34); if (this.charge >= 1) this.charged = true; }
        Object.assign(this.result, { pts, hit: hit ? hit.pts : 0, doubled: was && pts > 0 });
      }
      this.state = 'result'; this.resultT = this.now;
      this.emit('result', this.result);
    }
    decided() {
      if (this.mode === 'targets') return this.shotsTaken >= this.totalShots;
      const u = this.score.user, c = this.score.cpu;
      const gu = u.filter(Boolean).length, gc = c.filter(Boolean).length;
      if (u.length <= 5 && c.length <= 5 && !(u.length === 5 && c.length === 5)) return gu + 5 - u.length < gc || gc + 5 - c.length < gu;
      return u.length === c.length && gu !== gc;
    }
    rewards(win) {           // moedas e experiência da partida
      const s = this.stats;
      if (this.mode === 'targets') { const c = 20 + this.points * 3; return { coins: c, xp: c }; }
      const c = s.goals * 10 + s.saves * 12 + (win ? 60 : 15);
      return { coins: c, xp: c };
    }
    next() {
      if (this.mode === 'targets') this.shotsTaken++;
      if (this.decided()) {
        const gu = this.score.user.filter(Boolean).length, gc = this.score.cpu.filter(Boolean).length;
        const win = this.mode === 'targets' ? true : gu > gc;
        this.state = 'over';
        this.emit('over', { mode: this.mode, winner: win ? 'user' : 'cpu', gu, gc, points: this.points, stats: Object.assign({}, this.stats), rewards: this.rewards(win) });
        return;
      }
      if (this.mode !== 'targets') this.turn = this.turn === 'user' ? 'cpu' : 'user';
      this.setupKick();
    }
  }

  // ---------- som sintetizado (torcida, chute, apito, trave, rede) ----------
  class Sound {
    constructor() { this.ctx = null; this.muted = false; this.lastSave = 0; }
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return;
      const ctx = this.ctx = new AC();
      this.master = ctx.createGain(); this.master.gain.value = 0.85; this.master.connect(ctx.destination);
      const n = ctx.sampleRate * 2, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
      let last = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; last = (last + 0.04 * w) / 1.04; d[i] = last * 3 + w * 0.15; }
      this.noise = buf;
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      this.crowdF = ctx.createBiquadFilter(); this.crowdF.type = 'bandpass'; this.crowdF.frequency.value = 650; this.crowdF.Q.value = 0.5;
      this.crowd = ctx.createGain(); this.crowd.gain.value = 0;
      src.connect(this.crowdF); this.crowdF.connect(this.crowd); this.crowd.connect(this.master); src.start();
      this.crowdTo(0.14, 1.5);
    }
    crowdTo(v, tau, freq) {
      if (!this.ctx) return; const t = this.ctx.currentTime;
      this.crowd.gain.cancelScheduledValues(t); this.crowd.gain.setTargetAtTime(v, t, tau / 3);
      if (freq) { this.crowdF.frequency.cancelScheduledValues(t); this.crowdF.frequency.setTargetAtTime(freq, t, 0.1); }
    }
    swell(peak, freq, hold) {
      if (!this.ctx) return; const t = this.ctx.currentTime, g = this.crowd.gain, f = this.crowdF.frequency;
      g.cancelScheduledValues(t); g.setTargetAtTime(peak, t, 0.12); g.setTargetAtTime(0.14, t + hold, hold * 0.6);
      f.cancelScheduledValues(t); f.setTargetAtTime(freq, t, 0.1); f.setTargetAtTime(650, t + hold, hold * 0.5);
    }
    burst(dur, type, freq, gain) {
      const ctx = this.ctx, t = ctx.currentTime, s = ctx.createBufferSource(); s.buffer = this.noise;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
      const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
    }
    tone(freq, dur, gain, type = 'sine', toFreq) {
      const ctx = this.ctx, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t); if (toFreq) o.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
      g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
    }
    play(ev, d) {
      if (!this.ctx || this.muted) return;
      switch (ev) {
        case 'kick': this.tone(130, 0.16, 0.9, 'sine', 45); this.burst(0.06, 'highpass', 1800, 0.5); this.swell(0.24, 800, 0.4); break;
        case 'whistle': {
          const ctx = this.ctx, t = ctx.currentTime, o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain();
          o.frequency.value = 2900; lfo.frequency.value = 38; lg.gain.value = 140; lfo.connect(lg); lg.connect(o.frequency);
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09, t + 0.03); g.gain.setValueAtTime(0.09, t + 0.32); g.gain.linearRampToValueAtTime(0, t + 0.4);
          o.connect(g); g.connect(this.master); o.start(t); lfo.start(t); o.stop(t + 0.45); lfo.stop(t + 0.45); break;
        }
        case 'post': this.tone(1150, 1.1, 0.25); this.tone(1730, 0.8, 0.16); this.tone(2420, 0.5, 0.1); this.burst(0.05, 'highpass', 3000, 0.4); break;
        case 'net': this.burst(0.3, 'bandpass', 1400, 0.35); break;
        case 'bounce': this.tone(90, 0.08, Math.min(0.4, d / 15), 'sine', 50); break;
        case 'wall': this.tone(105, 0.14, 0.7, 'sine', 55); this.burst(0.09, 'bandpass', 700, 0.45); this.swell(0.3, 420, 0.8); break;
        case 'boards': this.tone(160, 0.2, 0.35, 'triangle', 70); this.burst(0.1, 'lowpass', 600, 0.4); break;
        case 'save': case 'catch':
          if (this.ctx.currentTime - this.lastSave > 0.4) { this.lastSave = this.ctx.currentTime; this.tone(110, 0.12, 0.6, 'sine', 60); this.burst(0.08, 'bandpass', 900, 0.4); }
          break;
        case 'goal': this.swell(0.75, 900, 2.2); break;
        case 'result':
          if (d.outcome === 'save') this.swell(0.42, 420, 1.2);
          else if (d.outcome !== 'goal') this.swell(0.32, 380, 1.0);
          break;
      }
    }
  }

  // ---------- HUD, menu e controles ----------
  function bindUI(game, opt) {
    const $ = id => document.getElementById(id);
    const sound = new Sound();
    const el = {
      menu: $('menu'), over: $('over'), overTitle: $('overTitle'), overScore: $('overScore'),
      dotsU: $('dotsU'), dotsC: $('dotsC'), scU: $('scU'), scC: $('scC'), diffLbl: $('diffLbl'),
      role: $('role'), banner: $('banner'), bBig: $('bannerBig'), bSmall: $('bannerSmall'),
      meter: $('meter'), fill: $('powerFill'), curve: $('curveVal'), chip: $('chipVal'),
      help: $('help'), info: $('info'), mute: $('muteBtn')
    };
    let diff = 'medium';
    document.querySelectorAll('[data-diff]').forEach(b => b.addEventListener('click', () => {
      diff = b.dataset.diff;
      document.querySelectorAll('[data-diff]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    }));
    const MODE_NAME = { penalties: 'Disputa de pênaltis', freekick: 'Duelo de faltas', targets: 'Desafio dos alvos' };
    const head = document.querySelector('.board-head span'), rowC = el.dotsC && el.dotsC.closest('.row'), teamU = document.querySelector('.team.user');
    const charge = document.createElement('div'); charge.className = 'charge'; charge.hidden = true;
    charge.innerHTML = '<span id="chargeLbl">Chute carregado</span><div class="cb"><i id="chargeFill"></i></div>';
    (document.querySelector('.hud') || document.body).appendChild(charge);
    const rewardsEl = document.createElement('div'); rewardsEl.className = 'rewards';
    el.overScore.after(rewardsEl);
    const begin = () => {
      sound.init(); el.menu.hidden = true; el.over.hidden = true;
      const mb = document.querySelector('[data-mode][aria-pressed="true"]');
      game.start(diff, mb ? mb.dataset.mode : 'penalties');
      el.diffLbl.textContent = DIFF[diff].name;
      if (head) head.textContent = MODE_NAME[game.mode];
      if (rowC) rowC.hidden = game.mode === 'targets';
      if (teamU) teamU.textContent = game.mode === 'targets' ? 'Pts' : 'Você';
      lastKey = '';
    };
    $('startBtn').addEventListener('click', begin);
    $('againBtn').addEventListener('click', begin);
    $('menuBtn').addEventListener('click', () => { el.over.hidden = true; el.menu.hidden = false; game.state = 'menu'; });
    el.mute.addEventListener('click', () => { sound.muted = !sound.muted; el.mute.textContent = sound.muted ? 'Som: desligado' : 'Som: ligado'; if (sound.ctx) sound.crowdTo(sound.muted ? 0 : 0.14, 0.3); });

    let bannerT = 0;
    const show = (big, small, cls) => { el.bBig.textContent = big; el.bSmall.textContent = small || ''; el.banner.className = 'banner ' + (cls || ''); el.banner.hidden = false; bannerT = performance.now(); };
    game.on((t, d) => {
      sound.play(t, d);
      if (t === 'setup') { el.banner.hidden = true; sound.play('whistle'); }
      if (t === 'result') {
        const kmh = game.info ? game.info.kmh + ' km/h' : '';
        const mine = d.turn === 'user';
        if (game.mode === 'targets') {
          const t = d.outcome !== 'goal' ? [{ save: 'DEFENDEU', wall: 'NA BARREIRA', post: 'NA TRAVE', miss: d.high ? 'POR CIMA' : 'PRA FORA' }[d.outcome], '0 ponto', 'bad']
            : [d.hit ? `ALVO! +${d.pts}` : `GOL +${d.pts}`, (d.doubled ? 'chute carregado · pontos em dobro · ' : '') + kmh, 'good'];
          show(t[0], t[1], t[2]);
          return;
        }
        const txt = {
          wall: ['NA BARREIRA', kmh, mine ? 'bad' : 'good'],
          goal: [mine ? 'GOL!' : 'GOL DA CPU', kmh, mine ? 'good' : 'bad'],
          save: [mine ? 'DEFENDEU O GOLEIRO' : 'QUE DEFESA!', kmh, mine ? 'bad' : 'good'],
          post: ['NA TRAVE!', kmh, mine ? 'bad' : 'good'],
          miss: [d.high ? 'POR CIMA!' : 'PRA FORA!', kmh, mine ? 'bad' : 'good']
        }[d.outcome];
        show(txt[0], txt[1], txt[2]);
      }
      if (t === 'over') {
        const r = root.PKProfile ? root.PKProfile.addRewards(d) : null;
        if (d.mode === 'targets') {
          el.overTitle.textContent = `${d.points} pontos`;
          el.overScore.textContent = `${d.stats.targets} alvos acertados em 10 chutes.` + (r ? (r.record ? ' Novo recorde!' : ` Recorde: ${r.best} pontos.`) : '');
        } else {
          const what = d.mode === 'freekick' ? 'o duelo de faltas' : 'a disputa';
          el.overTitle.textContent = d.winner === 'user' ? `Você venceu ${what}!` : `A CPU venceu ${what}`;
          el.overScore.textContent = `Você ${d.gu} × ${d.gc} CPU · ${d.stats.goals} gols e ${d.stats.saves} defesas suas`;
        }
        rewardsEl.textContent = r ? `+${d.rewards.coins} moedas · +${d.rewards.xp} XP` + (r.levelUp ? ` · subiu para o nível ${r.level}!` : '') : '';
        setTimeout(() => { el.over.hidden = false; }, 600);
      }
    });

    const canvas = opt.canvas;
    if (opt.pointer !== false) {
      const move = e => { const g = opt.toGoal(e.clientX, e.clientY); if (g) game.setAim(g.x, g.y); };
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerdown', e => {
        sound.init(); move(e);
        if (game.turn === 'user') game.pressStart(); else game.dive();
      });
      root.addEventListener('pointerup', () => game.pressEnd());
      canvas.addEventListener('wheel', e => { e.preventDefault(); game.adjustCurve(e.deltaY > 0 ? 0.25 : -0.25); }, { passive: false });
    }
    root.addEventListener('keydown', e => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'q') game.adjustCurve(-0.25);
      else if (k === 'e') game.adjustCurve(0.25);
      else if (k === 'c') game.toggleChip();
      else if (k === 'm') el.mute.click();
      else if (e.code === 'Space') { e.preventDefault(); sound.init(); if (game.turn === 'user') game.pressStart(); else game.dive(); }
    });
    root.addEventListener('keyup', e => { if (e.code === 'Space') game.pressEnd(); });

    let lastKey = '';
    const dots = (arr, n) => { let h = ''; for (let i = 0; i < n; i++) h += `<i class="${i < arr.length ? (arr[i] ? 'g' : 'x') : 'e'}"></i>`; return h; };
    function frame() {
      const s = game.score, tg = game.mode === 'targets', n = tg ? 10 : Math.max(5, s.user.length, s.cpu.length);
      const key = s.user.join() + '|' + s.cpu.join() + '|' + game.points + game.mode;
      if (key !== lastKey) {
        lastKey = key;
        el.dotsU.innerHTML = dots(s.user, n); el.dotsC.innerHTML = dots(s.cpu, n);
        el.scU.textContent = tg ? game.points : s.user.filter(Boolean).length; el.scC.textContent = s.cpu.filter(Boolean).length;
      }
      const st = game.state, mine = game.turn === 'user', playing = st !== 'menu' && st !== 'over';
      const sd = !tg && s.user.length >= 5 && s.cpu.length >= 5 ? ' · morte súbita' : '';
      const where = game.wall ? `Falta · ${Math.round(game.distance)} m · ` : '';
      el.role.textContent = playing ? (tg ? `${where}Chute ${Math.min(10, game.shotsTaken + 1)} de 10` : where + (mine ? 'Sua cobrança' : 'Você no gol') + sd) : '';
      charge.hidden = !(playing && tg);
      if (!charge.hidden) {
        document.getElementById('chargeFill').style.width = (game.charged ? 100 : game.charge * 100) + '%';
        charge.classList.toggle('full', game.charged);
        document.getElementById('chargeLbl').textContent = game.charged ? 'Carregado: próximo chute vale o dobro' : 'Chute carregado · acerte alvos';
      }
      el.meter.hidden = !(playing && mine && (st === 'aim' || st === 'charging'));
      el.fill.style.width = (game.power * 100).toFixed(1) + '%';
      el.fill.classList.toggle('hot', game.power > 0.82);
      const c = game.curve;
      el.curve.textContent = c === 0 ? 'sem efeito' : (c < 0 ? '← ' : '→ ') + Math.abs(c * 100) + '%';
      el.chip.textContent = game.chip ? 'ligada' : 'desligada';
      el.chip.classList.toggle('on', game.chip);
      let help = '';
      if (playing && mine && (st === 'aim' || st === 'charging')) help = opt.helpShoot || 'Mire com o mouse. Segure o clique (ou Espaço) para carregar a força e solte para chutar. Q/E ou roda do mouse: efeito. C: cavadinha.';
      else if (playing && !mine && game.wall && !game.keeper.dive && (st === 'runup' || st === 'flight')) help = game.pendingDive ? 'Canto escolhido. O goleiro salta na hora certa; você ainda pode trocar.' : 'Escolha o canto onde a bola vai entrar. O goleiro espera e salta no tempo certo.';
      else if (playing && !mine && st === 'runup' && !game.keeper.dive) help = opt.helpKeep || 'Mova o mouse até o canto e clique para saltar. Se saltar cedo demais, o batedor pode trocar de lado.';
      el.help.textContent = help; el.help.hidden = !help;
      if (game.info && (st === 'flight' || st === 'result')) {
        el.info.textContent = game.info.chip ? `Cavadinha · ${game.info.kmh} km/h` : `Bola ${game.info.kmh} km/h · pé ${game.info.foot.toFixed(1)} m/s`;
        el.info.hidden = false;
      } else el.info.hidden = true;
      if (!el.banner.hidden && performance.now() - bannerT > 2700) el.banner.hidden = true;
    }
    return { frame, sound };
  }

  root.PK = {
    C, V, add, sub, mul, dot, cross, len, norm, lerp, lerpN, clamp, smooth, UP, rightOf, rotVec, ICO,
    Ball, Keeper, Kicker, Game, Wall, PERK_MAX, Sound, DIFF, netLines, netOffset, netBackZ, shotSigma, solveShot, bindUI
  };
})(typeof window !== 'undefined' ? window : globalThis);
