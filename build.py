"""Gera a pasta docs/ servida pelo GitHub Pages.

As páginas na raiz não têm <!doctype> porque também são publicadas como Artifacts
(que adicionam o esqueleto do documento). Aqui o esqueleto é adicionado para que
o navegador use o modo padrão.
Uso: python build.py
"""
import pathlib
import shutil

ROOT = pathlib.Path(__file__).parent
DOCS = ROOT / "docs"
PAGES = ["index.html", "ranking.html", "penalti-2d.html", "penalti-3d.html", "penalti-celular.html", "penalti-celular-3d.html"]

if DOCS.exists():
    shutil.rmtree(DOCS)
DOCS.mkdir()
for name in PAGES:
    body = (ROOT / name).read_text(encoding="utf-8")
    (DOCS / name).write_text('<!doctype html>\n<html lang="pt-BR">\n' + body + "\n</html>\n", encoding="utf-8")
for name in ["engine.js", "menu.js", "online.js", "realplayers.js"]:
    shutil.copy(ROOT / name, DOCS / name)
shutil.copytree(ROOT / "assets" / "web", DOCS / "assets" / "web")
(DOCS / ".nojekyll").write_text("")
print("docs/ gerado com", len(PAGES), "páginas")
