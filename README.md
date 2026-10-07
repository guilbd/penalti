# Pênalti

Disputa de pênaltis contra o computador, em HTML puro (sem instalação).

- `penalti-celular.html`: celular, 2D, chute arrastando o dedo
- `penalti-celular-3d.html`: celular, 3D (Three.js), chute arrastando o dedo
- `penalti-2d.html` / `penalti-3d.html`: computador, com mouse
- `realplayers.js` + `assets/web/`: jogadores realistas das versões 3D (personagem e animações da Mixamo), sincronizados com a física: o pé toca a bola no instante do chute e a colisão do goleiro vem dos ossos animados
  - `assets/web/jogador.glb` e `animacoes.glb` são gerados a partir dos FBX originais em `assets/mixamo/` (fora do repositório)
- `engine.js`: física da bola (arrasto e efeito Magnus), batedor, goleiro, IA e regras, compartilhado por todas as versões

## Publicação

O GitHub Pages serve a pasta `docs/`. Depois de editar os arquivos da raiz, rode:

```bash
python build.py
```

e faça commit da pasta `docs/` junto.
