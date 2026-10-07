/* Jogadores realistas para as versões 3D: personagem Mixamo (assets/web/jogador.glb) com
   animações capturadas de pessoas (assets/web/animacoes.glb), sincronizadas com a física:
   - batedor: o clipe de pênalti é posicionado e cronometrado para o pé tocar a bola no
     instante em que engine.js lança a bola;
   - goleiro: o mergulho/defesa é escolhido pelo ponto do salto, acelerado para chegar no
     tempo do motor e deslocado para as mãos alcançarem o alvo. As cápsulas de colisão do
     goleiro passam a vir dos ossos animados (keeper.ext), então a defesa na tela é a defesa
     na física.
   Requer THREE (r128), THREE.GLTFLoader, THREE.SkeletonUtils e PK (engine.js). */
(function (root) {
  'use strict';
  const T = THREE, C = PK.C;
  const strip = n => n.replace(/^mixamorig\d*/, '');
  const load = u => new Promise((res, rej) => new T.GLTFLoader().load(u, res, undefined, rej));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, t) => { t = clamp((t - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const plain = v => ({ x: v.x, y: v.y, z: v.z });

  function bonesOf(model) {
    const B = {};
    model.traverse(o => { if (o.isBone) { const k = strip(o.name); if (!B[k]) B[k] = o; } });
    return B;
  }

  // mede os clipes uma vez (em coordenadas do clipe, metros): contato do chute e trajetória das mãos
  function analyse(cg, clips) {
    const model = T.SkeletonUtils.clone(cg.scene); model.scale.setScalar(0.01);
    const B = bonesOf(model), mixer = new T.AnimationMixer(model);
    const at = (name, t) => { mixer.stopAllAction(); const a = mixer.clipAction(clips[name]); a.play(); mixer.setTime(t); model.updateMatrixWorld(true); };
    const P = k => B[k].getWorldPosition(new T.Vector3());
    const out = {};
    // chute: instante de maior velocidade do pé direito entre 0,5 s e 1,0 s
    let best = 0, tC = 0.78, prev = null;
    for (let t = 0.5; t <= 1.0; t += 1 / 240) {
      at('kick', t); const p = P('RightToeBase');
      if (prev) { const v = p.distanceTo(prev) * 240; if (v > best) { best = v; tC = t - 1 / 480; } }
      prev = p;
    }
    at('kick', tC - 1 / 120); const a = P('RightToeBase'); at('kick', tC + 1 / 120); const b = P('RightToeBase');
    const dir = new T.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
    at('kick', tC); const toe = P('RightToeBase');
    at('kick', 0); const kickStart = P('Hips');
    at('idle', 0); const idleHips = P('Hips');
    out.kick = { tC, dir, ball: toe.clone().addScaledVector(dir, 0.06), idleOff: new T.Vector3(kickStart.x - idleHips.x, 0, kickStart.z - idleHips.z), dur: clips.kick.duration };
    // goleiro: amostras das mãos e do quadril a 30 Hz
    out.gk = {};
    for (const name of ['diveL', 'diveR', 'blockL', 'blockR', 'catchLow', 'catchMid', 'catchHigh']) {
      const s = [], dur = clips[name].duration;
      for (let t = 0; t <= dur; t += 1 / 30) {
        at(name, t);
        const h = P('LeftHand').add(P('RightHand')).multiplyScalar(0.5);
        s.push({ t, hand: h, hips: P('Hips') });
      }
      // início do impulso: primeira vez que o quadril passa de 0,8 m/s
      let ts = 0;
      for (let i = 1; i < s.length; i++) { if (s[i].hips.distanceTo(s[i - 1].hips) * 30 > 0.8) { ts = Math.max(0, s[i].t - 0.12); break; } }
      const peakY = Math.max(...s.map(q => q.hand.y));
      out.gk[name] = { s, ts, dur, peakY };
    }
    mixer.stopAllAction();
    return out;
  }

  class RealPlayer {
    constructor(cg, clips, probe, kit, role) {
      this.role = role; this.probe = probe;
      this.model = T.SkeletonUtils.clone(cg.scene); this.model.scale.setScalar(0.01);
      this.g = new T.Group(); this.g.add(this.model);
      this.B = bonesOf(this.model);
      this.mats = [];
      const tint = (m, c) => m.color.set(c).convertSRGBToLinear();
      this.model.traverse(o => {
        if (!o.isMesh) return;
        o.frustumCulled = false; o.castShadow = true;
        o.material = o.material.clone();
        const n = o.material.name;
        if (/Shirt/.test(n)) tint(o.material, kit.shirt);
        else if (/Shorts/.test(n)) tint(o.material, kit.shorts);
        else if (/Socks/.test(n)) tint(o.material, kit.socks);
        this.mats.push(o.material);
      });
      if (role === 'gk' && kit.gloves) {        // luvas de goleiro presas às mãos
        this.model.updateMatrixWorld(true);
        const gm = new T.MeshStandardMaterial({ roughness: 0.6 }); tint(gm, kit.gloves); this.mats.push(gm);
        for (const s of ['Left', 'Right']) {
          const hand = this.B[s + 'Hand'], mid = this.B[s + 'HandMiddle1'];
          const glove = new T.Mesh(new T.SphereGeometry(1, 16, 12), gm);
          const p0 = hand.getWorldPosition(new T.Vector3()), p1 = mid ? mid.getWorldPosition(new T.Vector3()) : p0;
          glove.position.copy(p0).lerp(p1, 0.7);
          glove.scale.set(0.055, 0.055, 0.055); glove.castShadow = true;
          this.g.add(glove); hand.attach(glove);
        }
      }
      this.mixer = new T.AnimationMixer(this.model);
      this.act = {};
      for (const k in clips) {
        const a = this.mixer.clipAction(clips[k]);
        if (!/idle/i.test(k)) { a.setLoop(T.LoopOnce, 1); a.clampWhenFinished = true; }
        a.play(); a.setEffectiveWeight(0); this.act[k] = a;
      }
      this.caps = []; this.handsPt = { x: 0, y: 1, z: C.KEEPER_Z };
      this.ext = { caps: () => this.caps, hands: () => this.handsPt };
      this.v = new T.Vector3();
    }

    pose(weights, times) {
      for (const k in this.act) { const w = weights[k] || 0; this.act[k].setEffectiveWeight(w); if (w > 0) this.act[k].time = times[k]; }
      this.mixer.update(0);
    }

    // ---------- batedor ----------
    syncKicker(k, now) {
      const pr = this.probe.kick, p = k.chip ? 0.35 : k.power;
      const rate = 0.85 + 0.35 * p;
      const ct = pr.tC + (now - k.contactAt) * rate;
      const yaw = Math.atan2(k.fk.x, k.fk.z) - Math.atan2(pr.dir.x, pr.dir.z);
      const cs = Math.cos(yaw), sn = Math.sin(yaw);
      const rot = (x, z) => [x * cs + z * sn, -x * sn + z * cs];
      const w = smooth(0, 0.22, ct);
      const [bx, bz] = rot(pr.ball.x, pr.ball.z), [ix, iz] = rot(pr.idleOff.x, pr.idleOff.z);
      this.g.rotation.y = yaw;
      this.g.position.set(-bx + ix * (1 - w), 0, -bz + iz * (1 - w));
      this.pose({ idle: 1 - w, kick: w }, { idle: now % this.act.idle.getClip().duration, kick: clamp(ct, 0, pr.dur) });
    }

    // ---------- goleiro ----------
    plan(d) {
      const g = this.probe.gk, Tx = d.T.x - d.hip0.x, Ty = d.T.y, ax = Math.abs(Tx);
      let name;
      if (ax < 0.75) name = ['catchLow', 'catchMid', 'catchHigh'].reduce((a, b) => Math.abs(g[b].peakY - Ty) < Math.abs(g[a].peakY - Ty) ? b : a);
      else name = (Ty < 0.5 && ax < 1.9 ? 'block' : 'dive') + (Tx > 0 ? 'R' : 'L');
      const c = g[name];
      // no mundo o goleiro olha para -z (giro de 180°): x do mundo = -x do clipe
      let tE = c.ts + 0.3, bestD = Infinity;
      for (const q of c.s) {
        if (q.t < c.ts + 0.15 || q.t > c.ts + 1.7) continue;
        const dd = Math.hypot(-q.hand.x - Tx, q.hand.y - Ty);
        if (dd < bestD) { bestD = dd; tE = q.t; }
      }
      const qE = c.s[Math.min(c.s.length - 1, Math.round(tE * 30))];
      return {
        d, name, ts: c.ts, tE, c,
        rate: clamp((tE - c.ts) / d.Td, 0.6, 2.6),
        rx: clamp(Tx - (-qE.hand.x), -1.2, 1.2), ry: clamp(Ty - qE.hand.y, -0.6, 0.9)
      };
    }
    sample(c, t) {           // quadril do clipe no tempo t (interpolado)
      const i = clamp(t * 30, 0, c.s.length - 1), i0 = Math.floor(i), i1 = Math.min(c.s.length - 1, i0 + 1), f = i - i0;
      return c.s[i0].hips.clone().lerp(c.s[i1].hips, f);
    }
    syncKeeper(kp, now) {
      const d = kp.dive;
      this.g.rotation.y = Math.PI;
      const idleT = now % this.act.gkIdle.getClip().duration;
      if (!d) {
        this.cur = null;
        this.g.position.set(kp.x + kp.swayX(now), 0, C.KEEPER_Z);
        this.pose({ gkIdle: 1 }, { gkIdle: idleT });
      } else {
        if (!this.cur || this.cur.d !== d) this.cur = this.plan(d);
        const p = this.cur, t = now - d.t0;
        // até o tempo do motor: clipe acelerado até a extensão; depois fica esticado no ar ~0,4 s e segue a queda
        const after = t - d.Td;
        const ct = Math.min(p.c.dur, after < 0 ? p.ts + t * p.rate : after < 0.4 ? p.tE + after * 0.3 : p.tE + 0.12 + (after - 0.4));
        const prog = smooth(p.ts, p.tE, ct);
        const zc = this.sample(p.c, ct).z - this.sample(p.c, p.ts).z;           // anula o avanço do clipe: o goleiro fica na linha
        const lift = prog * (1 - smooth(p.tE + 0.12, p.tE + 0.55, ct));        // altura extra só no voo
        this.g.position.set(d.hip0.x + p.rx * prog, p.ry * lift, C.KEEPER_Z + zc);
        const w = smooth(0, 0.12, t);
        const weights = { gkIdle: 1 - w }; weights[p.name] = w;
        const times = { gkIdle: idleT }; times[p.name] = ct;
        this.pose(weights, times);
      }
      // cápsulas de colisão a partir dos ossos animados
      this.g.updateMatrixWorld(true);
      const B = this.B, P = n => plain(B[n].getWorldPosition(this.v));
      const hand = s => { const a = B[s + 'Hand'].getWorldPosition(new T.Vector3()), m = B[s + 'HandMiddle1']; if (m) a.lerp(m.getWorldPosition(this.v), 0.6); return plain(a); };
      const hl = hand('Left'), hr = hand('Right'), head = P('Head');
      head.y += 0.08;
      this.caps = [
        { a: P('Hips'), b: P('Spine2'), r: 0.17, grab: true },
        { a: head, b: head, r: 0.12 },
        { a: P('LeftArm'), b: P('LeftForeArm'), r: 0.07 }, { a: P('LeftForeArm'), b: hl, r: 0.065 },
        { a: P('RightArm'), b: P('RightForeArm'), r: 0.07 }, { a: P('RightForeArm'), b: hr, r: 0.065 },
        { a: hl, b: hl, r: 0.11, hand: true, grab: true }, { a: hr, b: hr, r: 0.11, hand: true, grab: true },
        { a: P('LeftUpLeg'), b: P('LeftLeg'), r: 0.1 }, { a: P('LeftLeg'), b: P('LeftFoot'), r: 0.08 },
        { a: P('RightUpLeg'), b: P('RightLeg'), r: 0.1 }, { a: P('RightLeg'), b: P('RightFoot'), r: 0.08 }
      ];
      this.handsPt = { x: (hl.x + hr.x) / 2, y: (hl.y + hr.y) / 2, z: (hl.z + hr.z) / 2 };
    }

    sync(obj, now) { if (this.role === 'gk') this.syncKeeper(obj, now); else this.syncKicker(obj, now); }
  }

  async function loadRealPlayers(base) {
    const [cg, ag] = await Promise.all([load(base + 'jogador.glb'), load(base + 'animacoes.glb')]);
    const clips = {}; ag.animations.forEach(a => { clips[a.name] = a; });
    const probe = analyse(cg, clips);
    return { create: (kit, role) => new RealPlayer(cg, clips, probe, kit, role) };
  }

  root.PKReal = { load: loadRealPlayers };
})(typeof window !== 'undefined' ? window : globalThis);
