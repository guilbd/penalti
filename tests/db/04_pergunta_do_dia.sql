-- Pergunta do dia: quem erra a primeira chance perto do fim ganha 15 s novos para a segunda. Desfaz tudo no fim.
do $$ declare p jsonb; pid uuid; s text; v jsonb; c int; begin
  p := penalti_register('zzt_d_' || substr(md5(random()::text), 1, 6)); pid := (p->>'id')::uuid; s := p->>'secret';
  perform penalti_quiz_daily_start(pid, s, 'br');
  update penalti_quiz_plays set started_at = now() - interval '19 seconds' where player = pid and mode = 'br';   -- errou aos 19 s
  select (question->>'certa')::int into c from penalti_quiz_plays where player = pid and mode = 'br' and day = penalti_quiz_day();
  v := penalti_quiz_guess(pid, s, 'br', (c + 1) % 4);
  assert not (v->>'terminou')::boolean, 'segunda chance continua aberta: ' || v::text;
  assert (v->>'segundos')::int = 15 and (v->>'restante')::numeric > 14, 'segunda chance tem 15 s novos: ' || v::text;
  v := penalti_quiz_today(pid, s, 'br');
  assert not (v->>'terminou')::boolean, 'ao recarregar a tela, ainda dá para responder';
  v := penalti_quiz_guess(pid, s, 'br', c);
  assert (v->>'acertou')::boolean and (v->>'ganhou')::int between 50 and 60, 'acerto na segunda chance paga até 60: ' || v::text;
  raise exception 'TESTS_PASSED: pergunta do dia';
end $$;
