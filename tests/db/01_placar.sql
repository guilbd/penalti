-- Placar online decidido pelo servidor. Roda inteiro numa transação e termina com
-- RAISE 'TESTS_PASSED', que desfaz tudo: nada de teste fica no banco.
do $$
declare a jsonb; b jsonb; m uuid := gen_random_uuid(); m2 uuid := gen_random_uuid(); m3 uuid := gen_random_uuid(); r jsonb; sc record; k boolean;
  ra int; i int;
begin
  a := penalti_register('zzt_a_' || substr(md5(random()::text), 1, 6));
  b := penalti_register('zzt_b_' || substr(md5(random()::text), 1, 6));
  select rating into ra from penalti_players where id = (a->>'id')::uuid;

  -- partida normal: A bate primeiro; A faz 3, B perde 3 -> 3 x 0 decidido
  perform penalti_start_match((a->>'id')::uuid, a->>'secret', m, (b->>'id')::uuid, 'penalties');
  for i in 0..5 loop
    k := i % 2 = 0;  -- cobranças pares são do A
    -- o goleiro informa o resultado; o batedor informa o que ele viu
    if k then
      perform penalti_shot((b->>'id')::uuid, b->>'secret', m, i, false, true);
      perform penalti_shot((a->>'id')::uuid, a->>'secret', m, i, true, true);
    else
      perform penalti_shot((a->>'id')::uuid, a->>'secret', m, i, false, false);
      perform penalti_shot((b->>'id')::uuid, b->>'secret', m, i, true, false);
    end if;
  end loop;
  select * into sc from penalti_match_score(m);
  assert sc.decided, 'placar 3 x 0 deveria estar decidido';
  assert (case when (a->>'id')::uuid < (b->>'id')::uuid then sc.ga else sc.gb end) = 3, 'A deveria ter 3 gols';
  -- o placar informado pelo aparelho é ignorado: vale o das cobranças
  r := penalti_report((a->>'id')::uuid, a->>'secret', m, 9, 0, false);
  assert r->>'status' = 'final', 'partida decidida finaliza na hora: ' || r::text;
  assert (r->>'my')::int = 3 and (r->>'opp')::int = 0, 'placar oficial 3 x 0: ' || r::text;
  assert (r->>'delta')::int > 0, 'vencedor sobe no ranking';

  -- cobrança fora de ordem e batedor repetido são recusados
  perform penalti_start_match((a->>'id')::uuid, a->>'secret', m2, (b->>'id')::uuid, 'penalties');
  assert penalti_shot((a->>'id')::uuid, a->>'secret', m2, 3, true, true)->>'erro' = 'chute_fora_de_ordem', 'pular cobrança';
  perform penalti_shot((a->>'id')::uuid, a->>'secret', m2, 0, true, true);
  assert penalti_shot((a->>'id')::uuid, a->>'secret', m2, 1, true, true)->>'erro' = 'chute_fora_de_ordem', 'mesmo batedor duas vezes';

  -- W.O. não vale se o adversário mandou sinal de vida há pouco
  update penalti_matches set created_at = now() - interval '5 minutes' where id = m2;
  perform penalti_match_alive((b->>'id')::uuid, b->>'secret', m2);
  r := penalti_report((a->>'id')::uuid, a->>'secret', m2, 1, 0, true);
  assert r->>'status' = 'aguardando', 'W.O. com adversário presente deve esperar: ' || r::text;
  -- ...e vale quando ele sumiu há mais de 40 s
  update penalti_matches set seen_a = case when player_a = (b->>'id')::uuid then now() - interval '2 minutes' else seen_a end,
                             seen_b = case when player_b = (b->>'id')::uuid then now() - interval '2 minutes' else seen_b end where id = m2;
  r := penalti_report((a->>'id')::uuid, a->>'secret', m2, 1, 0, true);
  assert r->>'status' = 'final' and (r->>'wo')::boolean, 'W.O. com adversário sumido: ' || r::text;

  -- goleiro que "defende" bolas que o batedor viu entrar: partida vai para análise
  perform penalti_start_match((a->>'id')::uuid, a->>'secret', m3, (b->>'id')::uuid, 'penalties');
  for i in 0..9 loop
    k := i % 2 = 0;
    if k then  -- A bate e vê gol; B (goleiro) diz que defendeu
      perform penalti_shot((a->>'id')::uuid, a->>'secret', m3, i, true, true);
      perform penalti_shot((b->>'id')::uuid, b->>'secret', m3, i, false, false);
    else
      perform penalti_shot((b->>'id')::uuid, b->>'secret', m3, i, true, true);
      perform penalti_shot((a->>'id')::uuid, a->>'secret', m3, i, false, true);
    end if;
    select * into sc from penalti_match_score(m3);
    exit when sc.decided;
  end loop;
  r := penalti_report((b->>'id')::uuid, b->>'secret', m3, 5, 0, false);
  assert r->>'status' = 'disputa', 'divergência repetida deve anular a partida: ' || r::text;

  raise exception 'TESTS_PASSED: placar';
end $$;
