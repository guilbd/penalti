/* Jogadores 3D com corpo humano real: modelo com esqueleto Mixamo (assets/Xbot.glb),
   uniforme pintado por região do corpo e ossos orientados a cada quadro pelas
   articulações que o motor (engine.js) calcula para o batedor e o goleiro.
   Requer THREE (r128), THREE.GLTFLoader e THREE.SkeletonUtils. */
(function (root) {
  'use strict';
  const T = THREE;

  // osso → [articulação de onde sai, articulação para onde aponta, eixo de referência]
  const DRIVE = [
    ['Hips', 'pelvis', 'chest', 'r'], ['Spine', 'pelvis', 'chest', 'r'], ['Spine1', 'pelvis', 'chest', 'r'], ['Spine2', 'chest', 'neck', 'r'],
    ['Neck', 'neck', 'head', 'r'], ['Head', 'neck', 'head', 'r'],
    ['LeftShoulder', 'clav', 'shL', 'f'], ['LeftArm', 'shL', 'elL', 'f'], ['LeftForeArm', 'elL', 'hdL', 'f'],
    ['RightShoulder', 'clav', 'shR', 'f'], ['RightArm', 'shR', 'elR', 'f'], ['RightForeArm', 'elR', 'hdR', 'f'],
    ['LeftUpLeg', 'hipL', 'knL', 'f'], ['LeftLeg', 'knL', 'anL', 'f'], ['LeftFoot', 'anL', 'toL', 'u'],
    ['RightUpLeg', 'hipR', 'knR', 'f'], ['RightLeg', 'knR', 'anR', 'f'], ['RightFoot', 'anR', 'toR', 'u']
  ];
  const CHILD = {
    Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head', Head: 'HeadTop_End',
    LeftShoulder: 'LeftArm', LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand',
    RightShoulder: 'RightArm', RightArm: 'RightForeArm', RightForeArm: 'RightHand',
    LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', LeftFoot: 'LeftToeBase',
    RightUpLeg: 'RightLeg', RightLeg: 'RightFoot', RightFoot: 'RightToeBase'
  };
  // no modelo em repouso o personagem olha para +Z: direita = -X
  const BIND_REF = { r: new T.Vector3(-1, 0, 0), f: new T.Vector3(0, 0, 1), u: new T.Vector3(0, 1, 0) };
  const short = n => n.replace(/^mixamorig:?/, '');

  const vA = new T.Vector3(), vB = new T.Vector3(), vC = new T.Vector3(), vD = new T.Vector3();
  const m3 = new T.Matrix4(), m4 = new T.Matrix4(), qW = new T.Quaternion(), qP = new T.Quaternion();
  const toV = (p, out) => out.set(p.x, p.y, p.z);
  const GET = ['getX', 'getY', 'getZ', 'getW'], comp = (a, i, k) => a[GET[k]](i);

  function basis(a, b, out) {            // matriz de rotação com colunas (a, b', a×b')
    vC.copy(b).addScaledVector(a, -b.dot(a));
    if (vC.lengthSq() < 1e-6) vC.set(a.y, a.z, a.x).addScaledVector(a, -vC.dot(a));
    vC.normalize(); vD.crossVectors(a, vC);
    return out.makeBasis(a, vC, vD);
  }

  function regionColor(name, t, side, kit, gk) {
    const c = kit;
    switch (name) {
      case 'Hips': return t > 0.1 ? c.shirt : c.shorts;
      case 'Spine': case 'Spine1': case 'Spine2': case 'LeftShoulder': case 'RightShoulder': return c.shirt;
      case 'LeftArm': case 'RightArm': return gk || t < 0.5 ? c.shirt : c.skin;
      case 'LeftForeArm': case 'RightForeArm': return gk ? c.shirt : c.skin;
      case 'Neck': return t < 0.12 ? c.shirt : c.skin;
      case 'Head': case 'HeadTop_End': case 'LeftEye': case 'RightEye': return (t > 0.6 || (t > 0.18 && side < -0.15)) ? c.hair : c.skin;
      case 'LeftUpLeg': case 'RightUpLeg': return t < 0.55 ? c.shorts : c.skin;
      case 'LeftLeg': case 'RightLeg': return t < 0.12 ? c.skin : c.socks;
      case 'LeftFoot': case 'RightFoot': case 'LeftToeBase': case 'RightToeBase': case 'LeftToe_End': case 'RightToe_End': return c.boots;
      default: return /Hand/.test(name) ? (gk ? c.gloves : c.skin) : c.shirt;
    }
  }

  class Human {
    constructor(gltf, kit, gk, scene, numberTexture) {
      const model = T.SkeletonUtils.clone(gltf.scene);
      this.g = new T.Group(); this.g.add(model);
      this.bones = {};
      model.traverse(o => { if (o.isBone) this.bones[short(o.name)] = o; });
      const B = this.bones;
      // escala: comprimento da perna do modelo = perna do motor (0,91 m)
      model.updateMatrixWorld(true);
      const wp = n => B[n].getWorldPosition(new T.Vector3());
      const leg = wp('LeftUpLeg').distanceTo(wp('LeftLeg')) + wp('LeftLeg').distanceTo(wp('LeftFoot'));
      model.scale.multiplyScalar(0.91 / leg);
      model.updateMatrixWorld(true);
      this.hipOff = wp('Hips').y - (wp('LeftUpLeg').y + wp('RightUpLeg').y) / 2;

      // dados de repouso de cada osso guiado: eixo do osso e eixo de referência no espaço local
      this.drive = DRIVE.map(([name, from, to, ref]) => {
        const bone = B[name], q0 = bone.getWorldQuaternion(new T.Quaternion()), qi = q0.clone().invert();
        const a = wp(CHILD[name]).sub(wp(name)).normalize().applyQuaternion(qi);
        const b = BIND_REF[ref].clone().applyQuaternion(qi);
        const L = basis(a.clone(), b, new T.Matrix4());
        return { bone, from, to, ref, Linv: L.clone().transpose(), q: new T.Quaternion() };
      });

      // pinta o uniforme pelos pesos do esqueleto (região dominante de cada vértice)
      const mats = [];
      const col = new T.Color();
      model.traverse(o => {
        if (!o.isSkinnedMesh) return;
        o.geometry = o.geometry.clone();
        const g = o.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
        const bones = o.skeleton.bones, colors = new Float32Array(pos.count * 3);
        const bonePos = bones.map(b => b.getWorldPosition(new T.Vector3()));
        const childPos = bones.map(b => { const c = CHILD[short(b.name)]; return c && B[c] ? wp(c) : null; });
        const headZ = wp('Head').z;
        for (let i = 0; i < pos.count; i++) {
          let best = 0, bw = -1;
          for (let k = 0; k < 4; k++) { const w = comp(sw, i, k); if (w > bw) { bw = w; best = comp(si, i, k); } }
          o.boneTransform(i, vA); o.localToWorld(vA);
          const name = short(bones[best].name), p0 = bonePos[best], p1 = childPos[best];
          let t = 0;
          if (p1) { vB.subVectors(p1, p0); t = vB.dot(vC.subVectors(vA, p0)) / Math.max(1e-6, vB.lengthSq()); }
          const side = (vA.z - headZ) / 0.1;
          col.set(regionColor(name, t, side, kit, gk)).convertSRGBToLinear();
          colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
        }
        g.setAttribute('color', new T.BufferAttribute(colors, 3));
        o.material = new T.MeshStandardMaterial({ vertexColors: true, skinning: true, roughness: 0.72, metalness: 0 });
        o.castShadow = true; o.frustumCulled = false;
        mats.push(o.material);
      });

      // número nas costas, preso ao osso do peito
      if (numberTexture) {
        const nm = new T.MeshStandardMaterial({ map: numberTexture, transparent: true, roughness: 0.8, depthWrite: false });
        const plane = new T.Mesh(new T.PlaneGeometry(0.22, 0.22), nm);
        let backZ = Infinity;
        model.traverse(o => {
          if (!o.isSkinnedMesh || !/Surface/i.test(o.name)) return;
          const pos = o.geometry.attributes.position, y0 = wp('Spine1').y, y1 = wp('Spine2').y + 0.05;
          for (let i = 0; i < pos.count; i += 3) { o.boneTransform(i, vA); o.localToWorld(vA); if (vA.y > y0 && vA.y < y1 && Math.abs(vA.x) < 0.05) backZ = Math.min(backZ, vA.z); }
        });
        if (!isFinite(backZ)) backZ = wp('Spine2').z - 0.12;
        plane.position.set(0, (wp('Spine1').y + wp('Spine2').y) / 2 + 0.03, backZ - 0.012);
        plane.rotation.y = Math.PI; plane.renderOrder = 2;
        this.g.add(plane); B.Spine2.attach(plane);
        mats.push(nm); this.numberMat = nm;
      }
      this.mats = mats;
      scene.add(this.g);
    }

    update(j) {
      const U = toV(j.spine, new T.Vector3()).normalize(), R = toV(j.r, new T.Vector3()).normalize();
      const F = new T.Vector3().crossVectors(U, R).normalize();
      const hint = { r: R, f: F, u: U };
      const pts = {
        pelvis: j.pelvis, chest: j.chest, neck: j.neck, head: j.head,
        clav: { x: (j.chest.x + j.neck.x) / 2, y: (j.chest.y + j.neck.y) / 2, z: (j.chest.z + j.neck.z) / 2 },
        shL: j.shL, shR: j.shR, elL: j.elL, elR: j.elR, hdL: j.hdL, hdR: j.hdR,
        hipL: j.hipL, hipR: j.hipR, knL: j.knL, knR: j.knR, anL: j.anL, anR: j.anR, toL: j.toL, toR: j.toR
      };
      const hips = this.bones.Hips;
      hips.parent.updateMatrixWorld(true);
      // posição do quadril
      toV(j.pelvis, vA).addScaledVector(U, this.hipOff);
      hips.position.copy(hips.parent.worldToLocal(vA));
      // orientação: de cima para baixo na hierarquia, cada osso aponta para a próxima articulação
      const world = new Map();
      for (const d of this.drive) {
        const A = toV(pts[d.to], new T.Vector3()).sub(toV(pts[d.from], vB));
        if (A.lengthSq() < 1e-8) continue;
        A.normalize();
        let H = hint[d.ref];
        if (Math.abs(A.dot(H)) > 0.97) H = d.ref === 'f' ? U : F;
        basis(A, H, m3);
        m4.multiplyMatrices(m3, d.Linv);
        qW.setFromRotationMatrix(m4);
        const par = d.bone.parent;
        if (world.has(par)) qP.copy(world.get(par)); else par.getWorldQuaternion(qP);
        d.bone.quaternion.copy(qP.invert().multiply(qW));
        world.set(d.bone, qW.clone());
      }
      // ossos não guiados (mãos, dedos, pés) herdam a pose; propaga para os filhos
      for (const d of this.drive) if (!world.has(d.bone.parent)) { /* raiz já tratada */ }
    }
  }

  function loadHumans(url) {
    return new Promise((res, rej) => new T.GLTFLoader().load(url, res, undefined, rej));
  }

  root.PKHumans = { loadHumans, Human };
})(typeof window !== 'undefined' ? window : globalThis);
