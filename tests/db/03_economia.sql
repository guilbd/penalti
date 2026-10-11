-- Moedas, quiz, álbum, bônus, missões, loja e conquistas. Desfaz tudo no fim.
do $$
declare p jsonb; pid uuid; s text; w jsonb; q jsonb; r jsonb; certa int; i int; c0 int; c1 int;
begin
  p := penalti_register('zzt_e_' || substr(md5(random()::text), 1, 6)); pid := (p->>'id')::uuid; s := p->>'secret';

  -- importação do aparelho tem teto (contra carteira falsa)
  w := penalti_wallet_import(pid, s, 50000, '{"power": 10, "accuracy": 10}'::jsonb);
  assert (w->>'coins')::int <= 1000, 'importação limitada a 1000 moedas: ' || w::text;
  assert (w->'upgrades'->>'power')::int <= 2, 'importação limitada ao nível 2';
  -- ganho contra o computador: no máximo 250 por vez e 45 s entre um e outro
  update penalti_wallets set coins = 0 where player = pid;
  w := penalti_wallet_earn(pid, s, 99999);
  assert (w->>'coins')::int <= 250, 'ganho limitado a 250: ' || w::text;
  c0 := (w->>'coins')::int;
  w := penalti_wallet_earn(pid, s, 100);
  assert (w->>'coins')::int = c0, 'segundo ganho em menos de 45 s não conta: ' || w::text;
  -- skill sem moedas suficientes não compra
  update penalti_wallets set coins = 10 where player = pid;
  w := penalti_wallet_buy(pid, s, 'power');
  assert w ? 'erro', 'comprar skill sem moedas: ' || w::text;

  -- treino: 3 perguntas grátis por dia
  update penalti_wallets set coins = 0 where player = pid;
  for i in 1..3 loop
    q := penalti_quiz_free_start(pid, s, 'br', 'facil');
    select (question->>'certa')::int into certa from penalti_quiz_free where id = (q->>'id')::uuid;
    r := penalti_quiz_free_guess(pid, s, (q->>'id')::uuid, certa);
    assert (r->>'acertou')::boolean, 'resposta certa conta: ' || r::text;
  end loop;
  assert penalti_quiz_free_start(pid, s, 'br', 'facil')->>'erro' = 'limite_diario', 'quarta pergunta grátis é recusada';
  select coins into c1 from penalti_wallets where player = pid;
  assert c1 > 0, 'acertos dão moedas';
  -- pergunta extra custa 50
  update penalti_wallets set coins = 10 where player = pid;
  assert penalti_quiz_free_buy(pid, s)->>'erro' = 'moedas_insuficientes', 'comprar pergunta sem moedas é recusado';
  update penalti_wallets set coins = 100 where player = pid;
  assert not (penalti_quiz_free_buy(pid, s) ? 'erro'), 'com moedas compra a pergunta extra';
  assert (select coins from penalti_wallets where player = pid) = 50, 'pergunta extra custa 50';
  assert not (penalti_quiz_free_start(pid, s, 'br', 'facil') ? 'erro'), 'pergunta extra liberada';

  -- álbum: acerto de pergunta sobre jogador vira figurinha
  assert (select count(*) from penalti_album where player = pid) =
         (select count(distinct (question->>'jogador')::int) from penalti_quiz_free where player = pid and solved and question->>'jogador' is not null), 'figurinhas = jogadores acertados';

  -- bônus diário: uma vez por dia
  r := penalti_bonus_claim(pid, s);
  assert (r->>'ganhou')::int = 20, 'primeiro dia vale 20: ' || r::text;
  assert penalti_bonus_claim(pid, s)->>'erro' = 'ja_pegou', 'segunda vez no mesmo dia é recusada';

  -- missões: 3 por dia, só resgata pronta e uma vez
  r := penalti_missions(pid, s);
  assert jsonb_array_length(r->'missoes') = 3, '3 missões por dia';
  assert penalti_mission_claim(pid, s, 'todas')->>'erro' = 'missao_incompleta', 'bônus das 3 só com as 3 feitas';

  -- loja: sem moedas não compra; com moedas compra uma vez
  update penalti_wallets set coins = 0 where player = pid;
  assert penalti_shop_buy(pid, s, 'chuteira-neon')->>'erro' = 'moedas_insuficientes', 'loja sem moedas';
  update penalti_wallets set coins = 1000 where player = pid;
  r := penalti_shop_buy(pid, s, 'chuteira-neon');
  assert not (r ? 'erro'), 'compra na loja: ' || r::text;
  assert (select coins from penalti_wallets where player = pid) = 400, 'preço descontado';
  assert penalti_shop_buy(pid, s, 'chuteira-neon')->>'erro' = 'ja_tem', 'não compra o mesmo item duas vezes';

  -- conquistas: o primeiro acerto paga uma vez só
  r := penalti_achievements_check(pid, s);
  assert exists (select 1 from jsonb_array_elements(r->'novas') x where x->>'titulo' = 'Primeiro acerto'), 'conquista do primeiro acerto: ' || r::text;
  r := penalti_achievements_check(pid, s);
  assert jsonb_array_length(r->'novas') = 0, 'conquista não paga duas vezes';

  raise exception 'TESTS_PASSED: economia';
end $$;
