# Pênalti

Futebol contra o computador em HTML puro (sem instalação): disputa de pênaltis, duelo de faltas com barreira e desafio dos alvos com chute carregado, com evolução e personalização do jogador.

- `penalti-celular.html`: celular, 2D, chute arrastando o dedo
- `penalti-celular-3d.html`: celular, 3D (Three.js), chute arrastando o dedo
- `penalti-2d.html` / `penalti-3d.html`: computador, com mouse
- `realplayers.js` + `assets/web/`: jogadores realistas das versões 3D (personagem e animações da Mixamo), sincronizados com a física: o pé toca a bola no instante do chute e a colisão do goleiro vem dos ossos animados
  - `assets/web/jogador.glb` e `animacoes.glb` são gerados a partir dos FBX originais em `assets/mixamo/` (fora do repositório)
- `menu.js`: perfil do jogador salvo no aparelho (moedas, nível, evolução, uniforme, recorde), escolha de modo e tela "Seu jogador"
- `online.js` + `ranking.html`: partida online um contra um (Supabase Realtime) e ranking Elo (tabelas `penalti_*` no Supabase)
- `engine.js`: física da bola (arrasto e efeito Magnus), batedor, goleiro, IA e regras, compartilhado por todas as versões

## Publicação

O GitHub Pages serve a pasta `docs/`. Depois de editar os arquivos da raiz, rode:

```bash
python build.py
```

e faça commit da pasta `docs/` junto.

## Testes

- `npm test`: motor do jogo (regras da disputa, moedas, sorteio com semente, patrocínio) e todas as páginas (sintaxe dos scripts, arquivos incluídos no `build.py`, nenhuma chave secreta no código). Não precisa instalar nada além do Node 22.
- `npm run test:db`: regras do banco (placar online decidido pelo servidor, W.O., contas com senha, sessão do gestor, limites de moedas, quiz, bônus, missões, loja e conquistas). Cada arquivo de `tests/db/` roda numa transação que é desfeita no fim, então nada fica gravado. Precisa de `npm install pg` e da variável `SUPABASE_DB_URL` (texto de conexão do banco, em Supabase → Connect).
- No GitHub, `.github/workflows/testes.yml` roda tudo a cada envio. Os testes do banco só rodam se o segredo `SUPABASE_DB_URL` estiver cadastrado no repositório (Settings → Secrets and variables → Actions).

## Funções no servidor

`supabase/functions/` guarda o código das funções do Supabase: `penalti-push` (avisos no celular, a cada minuto) e `penalti-quiz-sync` (toda segunda confere no Wikidata o clube atual dos jogadores do quiz e deixa sugestões para o gestor aprovar no cadastro).
