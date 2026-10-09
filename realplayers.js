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
  const tint = (m, c) => m.color.set(c).convertSRGBToLinear();

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

  // ---------- camisa "Next Player 2.2" (preta, gola V e ombros verdes, manga curta com punho verde) ----------
  const NP_CACHE = {};
  const NP = { base: [20, 20, 20], line: [34, 36, 34], green: [43, 181, 43], greenDark: [24, 110, 30], skin: [212, 158, 128] };
  function drawNextPlayerLogo(g, w, h) {           // escudo + "NEXT PLAYER" + U verde vazado
    g.clearRect(0, 0, w, h);
    g.save(); g.lineWidth = h * 0.07; g.strokeStyle = '#2bb52b';
    g.beginPath(); g.moveTo(w * 0.52, h * 0.12); g.lineTo(w * 0.52, h * 0.62); g.quadraticCurveTo(w * 0.52, h * 0.92, w * 0.7, h * 0.92); g.quadraticCurveTo(w * 0.88, h * 0.92, w * 0.88, h * 0.62); g.lineTo(w * 0.88, h * 0.12); g.stroke(); g.restore();
    const sx = w * 0.04, sw = w * 0.26, sy = h * 0.1, sh = h * 0.8;
    const gr = g.createLinearGradient(sx, sy, sx + sw, sy + sh); gr.addColorStop(0, '#e6f23a'); gr.addColorStop(1, '#22a83a');
    const shield = (inset, fill) => { g.beginPath(); g.moveTo(sx + inset, sy + inset); g.quadraticCurveTo(sx + sw / 2, sy + inset - sh * 0.08, sx + sw - inset, sy + inset); g.lineTo(sx + sw - inset, sy + sh * 0.45); g.quadraticCurveTo(sx + sw - inset, sy + sh * 0.8, sx + sw / 2, sy + sh - inset); g.quadraticCurveTo(sx + inset, sy + sh * 0.8, sx + inset, sy + sh * 0.45); g.closePath(); g.fillStyle = fill; g.fill(); };
    shield(0, gr); shield(sw * 0.13, '#111');
    g.fillStyle = gr; g.beginPath(); g.arc(sx + sw / 2, sy + sh * 0.33, sw * 0.12, 0, 7); g.fill();
    g.lineWidth = sw * 0.13; g.strokeStyle = gr; g.lineCap = 'round'; g.beginPath(); g.moveTo(sx + sw * 0.25, sy + sh * 0.38); g.quadraticCurveTo(sx + sw / 2, sy + sh * 0.78, sx + sw * 0.75, sy + sh * 0.38); g.stroke();
    g.fillStyle = '#fff'; g.font = `italic 900 ${h * 0.32}px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`; g.textBaseline = 'alphabetic';
    g.fillText('NEXT', w * 0.32, h * 0.47, w * 0.6); g.fillText('PLAYER', w * 0.32, h * 0.84, w * 0.62);
  }
  function drawBackName(g, w, h, name) {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#2bb52b'; g.font = `900 ${h * 0.86}px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const t = (name || '').toUpperCase().slice(0, 12), sp = t.length > 6 ? 0 : h * 0.06;
    let tw = 0; for (const ch of t) tw += g.measureText(ch).width + sp;
    let x = w / 2 - tw / 2;
    const scale = Math.min(1, w * 0.96 / tw); g.save(); g.translate(w / 2, h / 2); g.scale(scale, 1); g.translate(-w / 2, -h / 2);
    g.textAlign = 'left'; for (const ch of t) { g.fillText(ch, x, h * 0.55); x += g.measureText(ch).width + sp; }
    g.restore();
  }
  // gera a textura da camisa percorrendo cada triângulo no espaço UV e pintando conforme a posição no corpo
  function shirtRest(mesh) {
    const n = mesh.geometry.attributes.uv.count, P = new Float32Array(n * 3), v = new T.Vector3();
    let top = -1e9, bot = 1e9;
    for (let i = 0; i < n; i++) { mesh.boneTransform(i, v); mesh.localToWorld(v); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; top = Math.max(top, v.y); bot = Math.min(bot, v.y); }
    return { P, top, bot };
  }
  function nextPlayerShirtTexture(mesh, srcMap, rest, backName, longSleeve) {
    const src = srcMap.image, S = src.width;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'); g.drawImage(src, 0, 0);
    const img = g.getImageData(0, 0, S, S), D = img.data;
    const L = document.createElement('canvas'); L.width = 512; L.height = 256; drawNextPlayerLogo(L.getContext('2d'), 512, 256);
    const N = document.createElement('canvas'); N.width = 512; N.height = 128; drawBackName(N.getContext('2d'), 512, 128, backName);
    const LD = L.getContext('2d').getImageData(0, 0, 512, 256).data, ND = N.getContext('2d').getImageData(0, 0, 512, 128).data;
    const geo = mesh.geometry, uv = geo.attributes.uv, n = uv.count, idx = geo.index;
    const { P, top, bot } = rest;                 // em metros (modelo em escala 0,01)
    const H = top - bot;                      // ~0,63 m do ombro à barra
    const k = H / 0.63;                       // medidas abaixo em metros para esse tamanho de camisa
    const sample = (data, w, h, u, vv) => { const x = Math.min(w - 1, Math.max(0, u * w | 0)), y = Math.min(h - 1, Math.max(0, vv * h | 0)), o = (y * w + x) * 4; return [data[o], data[o + 1], data[o + 2], data[o + 3] / 255]; };
    const color = (x, y, z, out) => {
      const ax = Math.abs(x), front = z > 0, dTop = top - y;
      // manga curta: o modelo não tem braço sob a manga longa, então a parte de baixo dela vira "pele"
      if (!longSleeve && ax > 0.37 * k) { out[0] = NP.skin[0]; out[1] = NP.skin[1]; out[2] = NP.skin[2]; out[3] = 1; out.skin = true; return; }
      out.skin = false;
      let c = NP.base;
      // losangos discretos no tronco
      if (ax < 0.24 * k) {
        const a = (x + y) / (0.11 * k), b = (x - y) / (0.11 * k), fa = a - Math.floor(a), fb = b - Math.floor(b);
        if (fa < 0.05 || fb < 0.05) c = NP.line;
        // filete verde curvo na lateral inferior
        const yb = y - bot;
        if (yb < 0.24 * k && Math.abs(ax - (0.165 * k + yb * 0.18)) < 0.005 * k) c = NP.greenDark;
      }
      if (longSleeve ? ax > 0.63 * k : ax > 0.33 * k) c = NP.green;                       // punho (no pulso, na camisa de goleiro)
      if (ax > 0.07 * k && ax < 0.27 * k && dTop < (front ? 0.025 * k + (ax - 0.07 * k) * 0.28 : 0.075 * k)) c = NP.green;   // ombros
      if (front && ax < 0.11 * k) {                                                       // gola V: miolo de pele, faixa verde
        const vEdge = 0.11 * k - (ax / (0.085 * k)) * 0.1 * k;
        if (dTop < vEdge) { out[0] = NP.skin[0]; out[1] = NP.skin[1]; out[2] = NP.skin[2]; out[3] = 1; out.skin = true; return; }
        if (dTop < vEdge + 0.026 * k) c = NP.green;
      }
      if (!front && ax < 0.1 * k && dTop < 0.035 * k) c = NP.green;                       // gola atrás
      out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; out[3] = 1;
      // logo no peito esquerdo (lado +x do jogador)
      if (front) {
        const u = (x - 0.025 * k) / (0.14 * k), vv = (dTop - (0.105 * k)) / (0.07 * k);
        if (u >= 0 && u <= 1 && vv >= 0 && vv <= 1) { const s = sample(LD, 512, 256, u, vv); for (let q = 0; q < 3; q++) out[q] = out[q] * (1 - s[3]) + s[q] * s[3]; }
      } else if (backName) {   // nome nas costas (visto por trás, a direita da tela é -x)
        const u = (0.16 * k - x) / (0.32 * k), vv = (dTop - 0.1 * k) / (0.075 * k);
        if (u >= 0 && u <= 1 && vv >= 0 && vv <= 1) { const s = sample(ND, 512, 128, u, vv); for (let q = 0; q < 3; q++) out[q] = out[q] * (1 - s[3]) + s[q] * s[3]; }
      }
    };
    const col = [0, 0, 0, 1], ntri = idx ? idx.count : n, vi = t => idx ? idx.getX(t) : t;
    for (let t = 0; t < ntri; t += 3) {
      const a = vi(t), b = vi(t + 1), d = vi(t + 2);
      const ax = uv.getX(a) * S, ay = uv.getY(a) * S, bx = uv.getX(b) * S, by = uv.getY(b) * S, dx = uv.getX(d) * S, dy = uv.getY(d) * S;
      const den = (by - dy) * (ax - dx) + (dx - bx) * (ay - dy); if (Math.abs(den) < 1e-9) continue;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, dx)) - 1), x1 = Math.min(S - 1, Math.ceil(Math.max(ax, bx, dx)) + 1);
      const y0 = Math.max(0, Math.floor(Math.min(ay, by, dy)) - 1), y1 = Math.min(S - 1, Math.ceil(Math.max(ay, by, dy)) + 1);
      for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
        const qx = px + 0.5, qy = py + 0.5;
        let w0 = ((by - dy) * (qx - dx) + (dx - bx) * (qy - dy)) / den, w1 = ((dy - ay) * (qx - dx) + (ax - dx) * (qy - dy)) / den, w2 = 1 - w0 - w1;
        if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;     // pequena margem para não deixar fresta entre triângulos
        const X = P[a * 3] * w0 + P[b * 3] * w1 + P[d * 3] * w2, Yv = P[a * 3 + 1] * w0 + P[b * 3 + 1] * w1 + P[d * 3 + 1] * w2, Z = P[a * 3 + 2] * w0 + P[b * 3 + 2] * w1 + P[d * 3 + 2] * w2;
        color(X, Yv, Z, col);
        const o = (py * S + px) * 4, lum = (D[o] * 0.3 + D[o + 1] * 0.59 + D[o + 2] * 0.11) / 255;
        const sh = col.skin ? Math.min(1.05, Math.max(0.8, 0.55 + lum * 0.5)) : Math.min(1.15, Math.max(0.45, lum / 0.86));    // mantém as dobras do tecido (suavizadas na "pele")
        D[o] = Math.min(255, col[0] * sh); D[o + 1] = Math.min(255, col[1] * sh); D[o + 2] = Math.min(255, col[2] * sh); D[o + 3] = col[3] ? 255 : 0;
      }
    }
    g.putImageData(img, 0, 0);
    const tx = new T.CanvasTexture(c); tx.flipY = srcMap.flipY; tx.encoding = T.sRGBEncoding; tx.wrapS = srcMap.wrapS; tx.wrapT = srcMap.wrapT;
    return tx;
  }

  class RealPlayer {
    constructor(cg, clips, probe, kit, role) {
      this.role = role; this.probe = probe;
      this.model = T.SkeletonUtils.clone(cg.scene); this.model.scale.setScalar(0.01);
      this.g = new T.Group(); this.g.add(this.model);
      this.B = bonesOf(this.model);
      this.mats = [];
      this.model.traverse(o => {
        if (!o.isMesh) return;
        o.frustumCulled = false; o.castShadow = true;
        o.material = o.material.clone();
        const n = o.material.name;
        if (/Shirt/.test(n)) { tint(o.material, kit.shirt); this.shirt = o; this.shirtMap0 = o.material.map; }
        else if (/Shorts/.test(n)) tint(o.material, kit.shorts);
        else if (/Socks/.test(n)) tint(o.material, kit.socks);
        this.mats.push(o.material);
      });
      if (role === 'gk' && kit.gloves) {        // luvas de goleiro presas às mãos
        this.model.updateMatrixWorld(true);
        const gm = new T.MeshStandardMaterial({ roughness: 0.6 }); tint(gm, kit.gloves); this.mats.push(gm); this.gloveMat = gm;
        for (const s of ['Left', 'Right']) {
          const hand = this.B[s + 'Hand'], mid = this.B[s + 'HandMiddle1'];
          const glove = new T.Mesh(new T.SphereGeometry(1, 16, 12), gm);
          const p0 = hand.getWorldPosition(new T.Vector3()), p1 = mid ? mid.getWorldPosition(new T.Vector3()) : p0;
          glove.position.copy(p0).lerp(p1, 0.7);
          glove.scale.set(0.055, 0.055, 0.055); glove.castShadow = true;
          this.g.add(glove); hand.attach(glove);
        }
      }
      if (this.shirt) { this.model.updateMatrixWorld(true); this.shirtRest = shirtRest(this.shirt); this.applyStyle(kit); }
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
      this.g.position.set(k.ball.x - bx + ix * (1 - w), 0, k.ball.z - bz + iz * (1 - w));
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
        d, name, ts: c.ts, tE, c, qE,
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
        // o reflexo do motor (d.Tadj) move o alvo depois do chute: recalcula o deslocamento das mãos
        const tg = d.Tadj || d.T;
        p.rx = clamp(tg.x - d.hip0.x + p.qE.hand.x, -1.2, 1.2); p.ry = clamp(tg.y - p.qE.hand.y, -0.6, 0.9);
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

    applyStyle(kit) {        // camisa lisa (cor) ou modelo estampado "Next Player 2.2"
      const m = this.shirt && this.shirt.material; if (!m) return;
      const key = kit.style === 'nextplayer' ? 'np:' + (kit.backName || '') + (kit.longSleeve ? '|longa' : '') : 'lisa';
      if (this.styleKey === key) return;
      this.styleKey = key;
      if (kit.style === 'nextplayer') {
        // textura compartilhada entre jogadores (o modelo é o mesmo): gera uma vez por nome
        const long = !!kit.longSleeve, ck = (kit.backName || '') + (long ? '|longa' : '');
        if (!NP_CACHE[ck]) NP_CACHE[ck] = nextPlayerShirtTexture(this.shirt, this.shirtMap0, this.shirtRest, kit.backName, long);
        m.map = NP_CACHE[ck]; m.color.set(0xffffff); m.alphaTest = 0.5;
      } else { m.map = this.shirtMap0; m.alphaTest = 0; tint(m, kit.shirt); }
      m.needsUpdate = true;
    }
    recolor(kit) {           // troca o uniforme (perfil do jogador ou barreira do outro time)
      for (const m of this.mats) {
        if (/Shirt/.test(m.name)) { this.styleKey = null; this.applyStyle(kit); if (kit.style !== 'nextplayer') tint(m, kit.shirt); } else if (/Shorts/.test(m.name)) tint(m, kit.shorts); else if (/Socks/.test(m.name)) tint(m, kit.socks);
      }
      if (this.gloveMat && kit.gloves) tint(this.gloveMat, kit.gloves);
    }
    // jogador da barreira: parado de frente para a bola e subindo no pulo
    syncWall(m, y) {
      this.g.rotation.y = Math.atan2(m.f.x, m.f.z);
      this.g.position.set(m.p.x, y, m.p.z);
      this.pose({ idle: 1 }, { idle: 0.4 + m.delay * 10 });
    }
    sync(obj, now) { if (this.role === 'gk') this.syncKeeper(obj, now); else this.syncKicker(obj, now); }
  }

  async function loadRealPlayers(base) {
    const [cg, ag] = await Promise.all([load(base + 'jogador.glb'), load(base + 'animacoes.glb')]);
    const clips = {}; ag.animations.forEach(a => { clips[a.name] = a; });
    const probe = analyse(cg, clips);
    return { create: (kit, role) => new RealPlayer(cg, clips, probe, kit, role) };
  }

  root.PKReal = { load: loadRealPlayers, drawNextPlayerLogo };
})(typeof window !== 'undefined' ? window : globalThis);
