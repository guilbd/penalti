-- Contas de jogador (senha, aparelhos, bloqueio) e sessão do gestor. Desfaz tudo no fim.
do $$
declare p jsonb; d jsonb; r jsonb; nick text := 'zzt_c_' || substr(md5(random()::text), 1, 6); i int; tok text; adm text := 'zzt-' || substr(md5(random()::text), 1, 6) || '@teste.local';
begin
  p := penalti_register(nick);
  assert penalti_check((p->>'id')::uuid, p->>'secret'), 'segredo do cadastro vale';
  assert not penalti_check((p->>'id')::uuid, 'errado'), 'segredo errado não vale';

  -- sem senha não entra em outro aparelho
  assert penalti_account_login(nick, 'qualquer')->>'erro' = 'login_invalido', 'conta sem senha';
  assert penalti_account_set_password((p->>'id')::uuid, p->>'secret', '123')->>'erro' = 'senha_curta', 'senha curta';
  perform penalti_account_set_password((p->>'id')::uuid, p->>'secret', 'senhaBoa1');
  d := penalti_account_login(upper(nick), 'senhaBoa1');
  assert d ? 'secret', 'entra com apelido (sem diferenciar maiúsculas) e senha: ' || d::text;
  assert penalti_check((d->>'id')::uuid, d->>'secret'), 'novo aparelho vale';
  assert penalti_check((p->>'id')::uuid, p->>'secret'), 'aparelho antigo continua valendo';

  -- 5 erros seguidos bloqueiam por 15 minutos
  for i in 1..5 loop r := penalti_account_login(nick, 'errada'); end loop;
  assert r->>'erro' = 'bloqueado', 'quinto erro bloqueia: ' || r::text;
  assert penalti_account_login(nick, 'senhaBoa1')->>'erro' = 'bloqueado', 'bloqueio vale mesmo com a senha certa';

  -- conta bloqueada pelo gestor não usa nada
  update penalti_players set blocked = true where id = (p->>'id')::uuid;
  assert not penalti_check((p->>'id')::uuid, p->>'secret'), 'conta bloqueada';
  update penalti_players set blocked = false where id = (p->>'id')::uuid;

  -- gestor: sessão no lugar da senha
  insert into penalti_admins (email, pass_hash, must_change) values (adm, extensions.crypt('provisoria1', extensions.gen_salt('bf')), true);
  r := penalti_admin_login(adm, 'provisoria1');
  tok := r->>'sessao';
  assert tok like 'sess\_%' and (r->>'trocar')::boolean, 'login devolve sessão e pede troca: ' || r::text;
  assert penalti_admin_gate(adm, tok) = 'trocar_senha', 'senha provisória trava o painel';
  assert penalti_admin_password(adm, tok, 'novaSenha99')->>'erro' = 'senha_atual', 'trocar senha exige a senha atual';
  r := penalti_admin_password(adm, 'provisoria1', 'novaSenha99');
  assert r ? 'sessao', 'troca devolve sessão nova';
  assert penalti_admin_ok(adm, tok) = 'sessao_expirada', 'sessão antiga cai na troca de senha';
  assert penalti_admin_gate(adm, r->>'sessao') is null, 'sessão nova abre o painel';
  assert penalti_admin_ok(adm, 'sess_inventada') = 'sessao_expirada', 'sessão inventada não vale';
  assert penalti_admin_login(adm, r->>'sessao')->>'erro' = 'senha_invalida', 'sessão não serve como senha no login';
  perform penalti_admin_logout(adm, r->>'sessao');
  assert penalti_admin_ok(adm, r->>'sessao') = 'sessao_expirada', 'sair encerra a sessão';

  raise exception 'TESTS_PASSED: contas';
end $$;
