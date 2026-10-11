// Confere todas as páginas e scripts: JavaScript sem erro de sintaxe e tudo incluído na publicação (build.py).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
const scripts = fs.readdirSync(ROOT).filter(f => f.endsWith('.js'));
const build = fs.readFileSync(path.join(ROOT, 'build.py'), 'utf8');

test('há páginas e scripts para conferir', () => {
  assert.ok(pages.length >= 10, 'páginas encontradas: ' + pages.length);
  assert.ok(scripts.length >= 5);
});

for (const f of pages) {
  test(`página ${f}: scripts sem erro de sintaxe`, () => {
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    blocks.forEach((js, i) => assert.doesNotThrow(() => new vm.Script(js, { filename: `${f}#script${i + 1}` })));
  });
  test(`página ${f}: entra na publicação`, () => assert.ok(build.includes(`"${f}"`), `${f} não está em PAGES do build.py`));
  test(`página ${f}: scripts locais existem`, () => {
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of html.matchAll(/<script src="([^":]+?)"/g)) assert.ok(fs.existsSync(path.join(ROOT, m[1])), `${f} usa ${m[1]}, que não existe`);
  });
}

for (const f of scripts) {
  test(`script ${f}: sem erro de sintaxe e publicado`, () => {
    assert.doesNotThrow(() => new vm.Script(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f }));
    assert.ok(build.includes(`"${f}"`), `${f} não é copiado pelo build.py`);
  });
}

test('páginas não deixam chave secreta do servidor no código', () => {
  for (const f of pages.concat(scripts)) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.ok(!/service_role/.test(s), `${f} menciona service_role`);
    for (const m of s.matchAll(/eyJ[\w-]+\.(eyJ[\w-]+)\.[\w-]+/g)) {
      const payload = JSON.parse(Buffer.from(m[1], 'base64url').toString());
      assert.equal(payload.role, 'anon', `${f} tem uma chave com papel ${payload.role}`);
    }
  }
});
