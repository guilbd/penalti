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
    reset() {
      this.p = V(0, C.BR, 0); this.v = V(); this.w = V(); this.q = [1, 0, 0, 0];
      this.live = false; this.inGoal = false; this.goal = false; this.post = false;
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

  function stepBall(b, dt, keeper, now, emit) {
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

    // goleiro (cápsulas do corpo)
    if (keeper && keeper.caps) {
      for (const c of keeper.caps) {
        const q = closestOnSeg(p, c.a, c.b), d = sub(p, q), dl = len(d), m = c.r + R;
        if (dl < m && dl > 1e-6) {
          const n = mul(d, 1 / dl);
          p.x = q.x + n.x * m; p.y = q.y + n.y * m; p.z = q.z + n.z * m;
          const sp = len(v);
          if (dot(v, n) < 0) {
            b.touched = true;
            if (c.grab && sp < 19 && keeper.canCatch()) { b.held = true; emit('catch', sp); return; }
            reflect(v, n, c.hand ? 0.32 : 0.45);
            v.x += n.x * 1.2; v.y += n.y * 1.2; v.z += n.z * 1.2;
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
      this.ball = V(0, C.BR, 0);
      this.fk = norm(V(this.target.x * 0.35, 0, C.GZ));
      const rk = rightOf(this.fk);
      this.aCon = 0.45; this.kCon = 0.7;
      const ch = legChain(mul(rk, 0.1), this.fk, this.aCon, this.kCon);
      const contact = add(ch.ankle, mul(ch.fd, 0.09));               // peito do pé
      const ballBack = V(-this.fk.x * C.BR, C.BR - 0.03, -this.fk.z * C.BR);
      this.Pc = sub(ballBack, contact);                                // pelve no instante do contato
      this.S = V(1.9, this.Pc.y, -3.4);                                // início da corrida (lado esquerdo)
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
  const REACH = 1.08;            // do quadril às mãos com o corpo esticado
  class Keeper {
    constructor() { this.x = 0; this.reset(0); }
    reset(now) { this.x = 0; this.dive = null; this.theta = 0; this.update(now); }
    swayX(now) { return 0.12 * Math.sin(now * 1.7) + 0.04 * Math.sin(now * 4.1); }
    readyFeet(px, z) { return [V(px - 0.3, 0.06, z + 0.02), V(px + 0.3, 0.06, z + 0.02)]; }
    readyHands(hip) { return [add(hip, V(-0.46, 0.22, -0.34)), add(hip, V(0.46, 0.22, -0.34))]; }
    startDive(T, now) {
      if (this.dive) return;
      const hip0 = V(this.x + this.swayX(now), 0.84, C.KEEPER_Z);
      const Dx = T.x - hip0.x, Dy = T.y - hip0.y, dist = Math.hypot(Dx, Dy);
      const big = dist >= REACH * 0.9;
      let disp;
      if (!big) disp = V(Dx * 0.35, Math.min(0, Dy) * 0.25, 0);
      else { const need = Math.min(dist - REACH, 2.6); disp = V(Dx / dist * need, Dy / dist * need, 0); }
      const hipF = add(hip0, disp); hipF.y = Math.max(0.24, hipF.y); hipF.z = C.KEEPER_Z - 0.35;
      const bd = norm(V(T.x - hipF.x, T.y - hipF.y, 0));
      const thetaF = clamp(Math.atan2(bd.x, bd.y), -1.75, 1.75);
      const Td = 0.15 + 0.165 * Math.hypot(disp.x, disp.y);
      this.dive = { T: V(T.x, T.y, C.KEEPER_Z - 0.4), t0: now, hip0, hipF, thetaF, Td, big, feet0: this.readyFeet(hip0.x, C.KEEPER_Z) };
    }
    canCatch() { return !this.dive || Math.abs(this.theta) < 0.7; }
    // ext: corpo animado externo (versão 3D com animações reais) que fornece cápsulas e mãos
    handsMid() { return this.ext ? this.ext.hands() : lerp(this.j.hdL, this.j.hdR, 0.5); }
    update(now) {
      const j = { f: V(0, 0, -1) };
      let hands, feet, bend = V(0, 0.1, -1);
      if (!this.dive) {
        const pel = V(this.x + this.swayX(now), 0.84 + 0.02 * Math.sin(now * 6.5), C.KEEPER_Z);
        this.theta = 0;
        torso(j, pel, norm(V(0, 1, -0.3)), V(1, 0, 0));
        hands = this.readyHands(pel); feet = this.readyFeet(pel.x, C.KEEPER_Z);
      } else {
        const d = this.dive, t = now - d.t0;
        const p = clamp(t / d.Td, 0, 1), e = 1 - Math.pow(1 - p, 2.2);
        const hip = lerp(d.hip0, d.hipF, e);
        hip.y += (d.big ? 0.22 : 0.08) * Math.sin(Math.PI * p);
        let th = d.thetaF * e;
        const fall = clamp((t - d.Td) / 0.5, 0, 1), g = fall * fall;
        const lateral = Math.abs(d.thetaF) > 0.55;
        if (fall > 0) {
          if (lateral) { hip.y = lerpN(hip.y, 0.2, g); th = lerpN(th, Math.sign(d.thetaF) * 1.6, g); }
          else { hip.y = lerpN(hip.y, 0.84, g); th = lerpN(th, 0, g); }
        }
        this.theta = th;
        const spine = norm(V(Math.sin(th), Math.cos(th), -0.3 * (1 - e)));
        const r = V(Math.cos(th), -Math.sin(th), 0);
        torso(j, hip, spine, r);
        const aimP = (fall > 0 && lateral) ? add(j.chest, mul(spine, 0.62)) : d.T;
        const toA = sub(aimP, j.chest), ad = norm(toA), hc = add(j.chest, mul(ad, Math.min(0.6, len(toA))));
        const dh = [add(hc, mul(r, -0.09)), add(hc, mul(r, 0.09))];
        const rh = this.readyHands(hip);
        const w = smooth(0, 0.35, p) * (lateral ? 1 : 1 - g);
        hands = [lerp(rh[0], dh[0], w), lerp(rh[1], dh[1], w)];
        const push = smooth(0.1, 0.55, p) * (lateral ? 1 : 1 - g);
        const trailA = add(hip, add(mul(spine, -0.88), mul(r, -0.14)));
        const trailB = add(hip, add(mul(spine, -0.6), mul(r, 0.2)));
        const rf = this.readyFeet(hip.x, hip.z);
        const base = lateral ? d.feet0 : rf;
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
      this.caps = [
        { a: j.pelvis, b: j.chest, r: 0.17, grab: true },
        { a: j.head, b: j.head, r: 0.12 },
        { a: j.shL, b: j.elL, r: 0.07 }, { a: j.elL, b: j.hdL, r: 0.07 },
        { a: j.shR, b: j.elR, r: 0.07 }, { a: j.elR, b: j.hdR, r: 0.07 },
        { a: j.hdL, b: j.hdL, r: 0.13, hand: true, grab: true }, { a: j.hdR, b: j.hdR, r: 0.13, hand: true, grab: true },
        { a: j.hipL, b: j.knL, r: 0.1 }, { a: j.knL, b: j.anL, r: 0.08 },
        { a: j.hipR, b: j.knR, r: 0.1 }, { a: j.knR, b: j.anR, r: 0.08 }
      ];
      if (this.ext) this.caps = this.ext.caps();
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
    easy: { name: 'Fácil', kSkill: 1.35, read: 0.12, noise: 0.95, stay: 0.14, react: 0.1, retarget: 0.15, chip: 0 },
    medium: { name: 'Médio', kSkill: 1.0, read: 0.3, noise: 0.6, stay: 0.1, react: 0.04, retarget: 0.45, chip: 0.03 },
    hard: { name: 'Difícil', kSkill: 0.72, read: 0.45, noise: 0.42, stay: 0.08, react: 0, retarget: 0.75, chip: 0.05 }
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
      this.emitFn = (t, d) => this.emit(t, d);
    }
    on(fn) { this.handlers.push(fn); }
    emit(t, d) { for (const h of this.handlers) h(t, d); }
    get D() { return DIFF[this.diff]; }
    get slowmo() { const b = this.ball; return this.state === 'flight' && b.live && !!this.keeper.dive && b.p.z > C.GZ - 2.6 && b.p.z < C.GZ + 0.3; }
    start(diff) {
      if (diff) this.diff = diff;
      this.score = { user: [], cpu: [] }; this.turn = 'user'; this.memory = { shots: [], dives: [] };
      this.emit('start'); this.setupKick();
    }
    setupKick() {
      this.ball.reset(); this.keeper.reset(this.now);
      this.result = null; this.info = null; this.plan = null; this.power = 0;
      if (this.turn === 'user') {
        this.kicker = new Kicker({ t0: this.now, wait: 1e9, kit: 'user' });
        this.state = 'aim';
      } else {
        this.kicker = new Kicker(Object.assign({ t0: this.now, wait: 1.8, kit: 'cpu' }, this.cpuShot()));
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
      this.kicker = new Kicker({ t0: this.now, wait: 0.12, power: p, target: { x: this.aim.x, y: this.aim.y }, curve: this.curve, chip: this.chip, skill: 1, kit: 'user' });
      this.memory.shots.push(Math.sign(this.aim.x));
      this.plan = this.cpuKeeperPlan();
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
      const speed = k.chip ? rand(12, 13.5) : 15 + 17 * k.power;
      const spin = k.chip ? V(-30, 0, 0) : V(4 + 8 * k.power, -k.curve * 55, 0);
      const b = this.ball;
      b.v = solveShot(b.p, tgt, speed, spin); b.w = spin; b.live = true;
      this.flightT0 = this.now; this.state = 'flight';
      this.info = { kmh: Math.round(speed * 3.6), foot: speed / 1.2, chip: k.chip };
      this.emit('kick', { speed });
    }
    update(dt) {
      dt = Math.min(dt, 0.05);
      const n = Math.max(1, Math.ceil(dt / (1 / 480))), h = dt / n;
      for (let i = 0; i < n; i++) { this.now += h; this.tick(h); }
    }
    tick(h) {
      const now = this.now, k = this.kicker, st = this.state;
      if (st === 'charging') this.power = Math.min(1, (now - this.chargeT0) / 1.05);
      if ((st === 'runup' || st === 'flight') && this.plan && !this.keeper.dive && now >= this.plan.at) this.keeper.startDive(this.plan.T, now);
      if (st === 'runup' && now >= k.contactAt) this.launch();
      this.keeper.update(now);
      stepBall(this.ball, h, this.keeper, now, this.emitFn);
      if (this.state === 'flight') { const o = this.outcome(now - this.flightT0); if (o) this.finish(o); }
      else if (this.state === 'result' && now - this.resultT > 2.9) this.next();
    }
    outcome(tf) {
      const b = this.ball, sp = len(b.v);
      if (b.goal) return 'goal';
      if (b.held) return 'save';
      const fail = () => b.touched ? 'save' : (b.post ? 'post' : 'miss');
      if (tf > 4) return fail();
      if ((b.p.z > C.GZ + 0.3 && !b.inGoal) || (b.v.z < 0 && b.p.z < C.GZ) || (sp < 1.5 && b.p.y < 0.2)) return fail();
      return null;
    }
    finish(o) {
      const c = this.ball.cross;
      this.result = { outcome: o, turn: this.turn, high: o === 'miss' && c && c.y > C.GH };
      this.score[this.turn].push(o === 'goal');
      this.state = 'result'; this.resultT = this.now;
      this.emit('result', this.result);
    }
    decided() {
      const u = this.score.user, c = this.score.cpu;
      const gu = u.filter(Boolean).length, gc = c.filter(Boolean).length;
      if (u.length <= 5 && c.length <= 5 && !(u.length === 5 && c.length === 5)) return gu + 5 - u.length < gc || gc + 5 - c.length < gu;
      return u.length === c.length && gu !== gc;
    }
    next() {
      if (this.decided()) {
        const gu = this.score.user.filter(Boolean).length, gc = this.score.cpu.filter(Boolean).length;
        this.state = 'over'; this.emit('over', { winner: gu > gc ? 'user' : 'cpu', gu, gc }); return;
      }
      this.turn = this.turn === 'user' ? 'cpu' : 'user';
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
    const begin = () => { sound.init(); el.menu.hidden = true; el.over.hidden = true; game.start(diff); el.diffLbl.textContent = DIFF[diff].name; };
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
        const txt = {
          goal: [mine ? 'GOL!' : 'GOL DA CPU', kmh, mine ? 'good' : 'bad'],
          save: [mine ? 'DEFENDEU O GOLEIRO' : 'QUE DEFESA!', kmh, mine ? 'bad' : 'good'],
          post: ['NA TRAVE!', kmh, mine ? 'bad' : 'good'],
          miss: [d.high ? 'POR CIMA!' : 'PRA FORA!', kmh, mine ? 'bad' : 'good']
        }[d.outcome];
        show(txt[0], txt[1], txt[2]);
      }
      if (t === 'over') {
        el.overTitle.textContent = d.winner === 'user' ? 'Você venceu a disputa!' : 'A CPU venceu a disputa';
        el.overScore.textContent = `Você ${d.gu} × ${d.gc} CPU`;
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

    const dots = (arr, n) => { let h = ''; for (let i = 0; i < n; i++) h += `<i class="${i < arr.length ? (arr[i] ? 'g' : 'x') : 'e'}"></i>`; return h; };
    let lastKey = '';
    function frame() {
      const s = game.score, n = Math.max(5, s.user.length, s.cpu.length);
      const key = s.user.join() + '|' + s.cpu.join();
      if (key !== lastKey) {
        lastKey = key;
        el.dotsU.innerHTML = dots(s.user, n); el.dotsC.innerHTML = dots(s.cpu, n);
        el.scU.textContent = s.user.filter(Boolean).length; el.scC.textContent = s.cpu.filter(Boolean).length;
      }
      const st = game.state, mine = game.turn === 'user', playing = st !== 'menu' && st !== 'over';
      const sd = s.user.length >= 5 && s.cpu.length >= 5 ? ' · morte súbita' : '';
      el.role.textContent = playing ? (mine ? 'Sua cobrança' : 'Você no gol') + sd : '';
      el.meter.hidden = !(playing && mine && (st === 'aim' || st === 'charging'));
      el.fill.style.width = (game.power * 100).toFixed(1) + '%';
      el.fill.classList.toggle('hot', game.power > 0.82);
      const c = game.curve;
      el.curve.textContent = c === 0 ? 'sem efeito' : (c < 0 ? '← ' : '→ ') + Math.abs(c * 100) + '%';
      el.chip.textContent = game.chip ? 'ligada' : 'desligada';
      el.chip.classList.toggle('on', game.chip);
      let help = '';
      if (playing && mine && (st === 'aim' || st === 'charging')) help = opt.helpShoot || 'Mire com o mouse. Segure o clique (ou Espaço) para carregar a força e solte para chutar. Q/E ou roda do mouse: efeito. C: cavadinha.';
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
    Ball, Keeper, Kicker, Game, Sound, DIFF, netLines, netOffset, netBackZ, shotSigma, solveShot, bindUI
  };
})(typeof window !== 'undefined' ? window : globalThis);
