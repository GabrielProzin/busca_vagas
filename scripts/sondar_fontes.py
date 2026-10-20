"""Sonda fontes de vagas: testa endpoints e mostra o formato dos dados.

Uso (no Actions, modo diagnóstico): python scripts/sondar_fontes.py > saida/sondagem.txt
Não faz parte da coleta diária; serve para quando uma fonte muda e é preciso achar o endpoint novo.
"""
from __future__ import annotations

import json
import re
from urllib.parse import urljoin

import requests

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
      "Accept": "application/json, text/html;q=0.9, */*;q=0.8"}
s = requests.Session()
s.headers.update(UA)


def chaves(d, prof=0, max_prof=2):
    """Esqueleto de um JSON: chaves e tipos, com amostra curta dos valores."""
    pad = "    " * prof
    if isinstance(d, dict):
        for k, v in d.items():
            amostra = "" if isinstance(v, (dict, list)) else repr(v)[:80]
            print(f"{pad}{k}: {type(v).__name__} {amostra}")
            if prof < max_prof and isinstance(v, (dict, list)):
                chaves(v, prof + 1, max_prof)
    elif isinstance(d, list) and d:
        print(f"{pad}[{len(d)} itens] primeiro:")
        chaves(d[0], prof + 1, max_prof)


def testar(u, mostrar_json=True):
    print("\n#", u)
    try:
        r = s.get(u, timeout=25)
    except Exception as e:
        print("  ERRO", e)
        return None
    print(f"  -> {r.status_code} {r.headers.get('content-type', '')} {len(r.content)}B")
    if r.ok and "json" in r.headers.get("content-type", "") and mostrar_json:
        chaves(r.json())
    return r


print("=== GUPY: rotas da API ===")
for base in ("https://portal.gupy.io", "https://employability-portal.gupy.io"):
    for rota in ("/api/job-search/jobs?jobName=analista%20de%20dados&limit=3&offset=0",
                 "/api/job-search/jobs?term=analista%20de%20dados&limit=3&offset=0",
                 "/api/v1/jobs?jobName=analista%20de%20dados&limit=3&offset=0"):
        testar(base + rota)

print("\n=== GUPY: __NEXT_DATA__ da página de busca ===")
for u in ("https://portal.gupy.io/job-search/term=analista%20de%20dados",
          "https://portal.gupy.io/job-search/term=analista%20de%20dados&workplaceTypes[]=remote",
          "https://portal.gupy.io/job-search/term=analista%20de%20dados&page=2"):
    r = testar(u, mostrar_json=False)
    if not r:
        continue
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', r.text, re.S)
    if not m:
        print("  sem NEXT_DATA")
        continue
    nd = json.loads(m.group(1))
    pp = nd["props"]["pageProps"]
    print("  pageProps:", list(pp.keys()))
    jl = pp.get("initialJobList") or {}
    print("  initialJobList keys:", list(jl.keys()), "pagination:", jl.get("pagination"))
    dados = jl.get("data") or []
    print("  n vagas:", len(dados), "ids:", [d.get("id") for d in dados[:5]])
    if dados and u.endswith("dados"):
        chaves({k: v for k, v in dados[0].items() if k != "description"}, 1, 1)
        print("  len description:", len(dados[0].get("description") or ""))

print("\n=== REMOTAR ===")
r = testar("https://api.remotar.com.br/jobs?search=analista%20de%20dados&page=1", mostrar_json=False)
if r is not None and r.ok:
    j = r.json()
    print("  meta:", j.get("meta"))
    if j.get("data"):
        item = j["data"][0]
        chaves({k: v for k, v in item.items() if k != "description"}, 1, 2)
        print("  titulos:", [d.get("title") for d in j["data"][:15]])
for u in ("https://api.remotar.com.br/jobs?search=dados&page=1&perPage=5",
          "https://api.remotar.com.br/jobs?q=analista%20de%20dados&page=1"):
    r = testar(u, mostrar_json=False)
    if r is not None and r.ok:
        j = r.json()
        print("  meta:", j.get("meta"), "titulos:", [d.get("title") for d in j.get("data", [])[:8]])

print("\n=== SOLIDES: procurando a API nos bundles ===")
r = s.get("https://vagas.solides.com.br/vagas/todos/analista-de-dados", timeout=25)
print(r.status_code, len(r.text))
urls = set(re.findall(r"https://[a-zA-Z0-9.\-]+(?:/[A-Za-z0-9_\-/.]*)?", r.text))
for sc in re.findall(r'src="(/_next/static/chunks/[^"]+\.js)"', r.text)[:60]:
    try:
        urls |= set(re.findall(r"https://[a-zA-Z0-9.\-]+(?:/[A-Za-z0-9_\-/.]*)?", s.get(urljoin(r.url, sc), timeout=20).text))
    except Exception:
        pass
for u in sorted(x for x in urls if "solides" in x or "api" in x)[:60]:
    print("   ", u)
print("  'analista' no HTML:", r.text.count("nalista"), "| trecho:", re.sub(r"\s+", " ", r.text[r.text.find("nalista") - 300: r.text.find("nalista") + 300])[:600])
