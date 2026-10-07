# Pênalti

Disputa de pênaltis contra o computador, em HTML puro (sem instalação).

- `penalti-celular.html`: celular, 2D, chute arrastando o dedo
- `penalti-celular-3d.html`: celular, 3D (Three.js), chute arrastando o dedo
- `penalti-2d.html` / `penalti-3d.html`: computador, com mouse
- `players3d.js` + `assets/Xbot.glb`: corpo humano com esqueleto (modelo X Bot da Mixamo, dos exemplos do three.js) usado nas versões 3D, com uniforme pintado por região
- `engine.js`: física da bola (arrasto e efeito Magnus), batedor, goleiro, IA e regras, compartilhado por todas as versões

## Publicação

O GitHub Pages serve a pasta `docs/`. Depois de editar os arquivos da raiz, rode:

```bash
python build.py
```

e faça commit da pasta `docs/` junto.
