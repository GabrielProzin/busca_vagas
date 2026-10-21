"""Sonda fontes de vagas: testa endpoints, procura rotas de API nos bundles JS e mostra o formato dos dados.

Uso (no Actions, modo diagnóstico): python scripts/sondar_fontes.py > saida/sondagem.txt
Não faz parte da coleta; serve para quando uma fonte muda ou para avaliar uma fonte nova.
"""
from __future__ import annotations

import json
import re
from urllib.parse import urljoin

import requests

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
      "Accept": "application/json, text/html;q=0.9, */*;q=0.8", "Accept-Language": "pt-BR,pt;q=0.9"}
s = requests.Session()
s.headers.update(UA)


def chaves(d, prof=0, max_prof=2):
    pad = "    " * prof
    if isinstance(d, dict):
        for k, v in list(d.items())[:40]:
            amostra = "" if isinstance(v, (dict, list)) else repr(v)[:90]
            print(f"{pad}{k}: {type(v).__name__} {amostra}")
            if prof < max_prof and isinstance(v, (dict, list)):
                chaves(v, prof + 1, max_prof)
    elif isinstance(d, list) and d:
        print(f"{pad}[{len(d)} itens] primeiro:")
        chaves(d[0], prof + 1, max_prof)


def get(u, **kw):
    print("\n#", u, kw.get("params") or "")
    try:
        r = s.get(u, timeout=25, **kw)
    except Exception as e:
        print("  ERRO", e)
        return None
    print(f"  -> {r.status_code} {r.headers.get('content-type', '')} {len(r.content)}B final={r.url}")
    return r


def varrer_bundles(pagina: str, termos: list[str], max_js: int = 80) -> None:
    """Procura nos JS da página strings de API que contenham algum dos termos."""
    r = get(pagina)
    if r is None:
        return
    srcs = set(re.findall(r'(?:src|href)="([^"]+?\.js)"', r.text))
    srcs |= set(re.findall(r'(/_next/static/chunks/[A-Za-z0-9_\-/.\[\]%]+?\.js)', r.text))
    srcs |= set(re.findall(r'(static/js/[A-Za-z0-9_\-.]+\.js)', r.text))
    print(f"  {len(srcs)} scripts")
    achados: dict[str, str] = {}
    for src in list(srcs)[:max_js]:
        try:
            js = s.get(urljoin(r.url, src if src.startswith(("/", "http")) else "/" + src), timeout=20).text
        except Exception:
            continue
        for m in re.finditer(r'["\'`]((?:https?:)?//[a-zA-Z0-9.\-]+(?:/[A-Za-z0-9_\-/.{}$:]*)?|/[a-zA-Z0-9_\-]+/[A-Za-z0-9_\-/.{}$:]*)["\'`]', js):
            alvo = m.group(1)
            if any(t in alvo.lower() for t in termos) and alvo not in achados:
                achados[alvo] = js[max(0, m.start() - 80): m.end() + 80].replace("\n", " ")
    for a, ctx in list(achados.items())[:60]:
        print("   ", a, "  ::", ctx[:200])


def mostrar_json(r, n=1):
    if r is not None and r.ok and "json" in r.headers.get("content-type", ""):
        try:
            chaves(r.json())
        except Exception as e:
            print("  json inválido", e)
    elif r is not None:
        print("  ", re.sub(r"\s+", " ", r.text[:600]))


print("=" * 20, "SOLIDES")
for u in ["https://apigw.solides.com.br/jobs/v3/home/vacancy?title=analista%20de%20dados&page=1",
          "https://apigw.solides.com.br/jobs/v2/home/vacancy?title=analista%20de%20dados&page=1",
          "https://vagas.solides.com.br/api/vacancies?title=analista%20de%20dados",
          "https://vagas.solides.com.br/api/vagas?search=analista%20de%20dados"]:
    mostrar_json(get(u))
varrer_bundles("https://vagas.solides.com.br/vagas/todos/analista-de-dados", ["vacanc", "vaga", "job", "apigw", "api."])

print("\n" + "=" * 20, "INHIRE")
for u in ["https://api.inhire.app/job-posts/public/search?query=dados",
          "https://api.inhire.app/job-posts/public/pages?search=dados"]:
    mostrar_json(get(u))
varrer_bundles("https://inhire.app/vagas?search=dados", ["job", "vaga", "api."])

print("\n" + "=" * 20, "TRAMPOS")
for u in ["https://trampos.co/api/v2/opportunities?tr=dados&page=1", "https://trampos.co/api/opportunities?tr=dados"]:
    mostrar_json(get(u))
r = get("https://trampos.co/oportunidades?tr=analista%20de%20dados")
if r is not None and r.ok:
    print("  links /oportunidades/:", re.findall(r'href="(/oportunidades/\d+[^"]*)"', r.text)[:8])
    print("  json embutido:", [m[:200] for m in re.findall(r'(\{"opportunit[^<]{0,400})', r.text)[:2]])
varrer_bundles("https://trampos.co/oportunidades?tr=dados", ["opportun", "api"])

print("\n" + "=" * 20, "GUPY: dados da empresa na página da vaga")
r = get("https://portal.gupy.io/api/job-search/jobs", params={"jobName": "analista de dados", "limit": 2})
if r is not None and r.ok:
    job = r.json()["data"][0]
    p = get(job["jobUrl"], headers={"Accept": "text/html"})
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', p.text, re.S) if p is not None else None
    if m:
        pp = json.loads(m.group(1))["props"]["pageProps"]
        print("  pageProps:", list(pp.keys()))
        for k in ("job", "careerPage", "company"):
            if isinstance(pp.get(k), dict):
                print(f"  {k}:")
                chaves({kk: vv for kk, vv in pp[k].items() if kk not in ("description", "responsibilities", "prerequisites")}, 2, 1)
        print("  urls no HTML:", sorted(set(u for u in re.findall(r'https?://[a-zA-Z0-9.\-]+', p.text) if "gupy" not in u))[:20])
        print("  emails no HTML:", sorted(set(re.findall(r"[\w.+-]+@[\w-]+\.[\w.]+", p.text)))[:10])

print("\n" + "=" * 20, "TESTE: email de RH no site da empresa")
for site in ["https://www.simplesdental.com/", "https://www.piracanjuba.com.br/", "https://www.spread.com.br/"]:
    for caminho in ["", "contato", "trabalhe-conosco", "carreiras"]:
        r = get(urljoin(site, caminho))
        if r is not None and r.ok:
            print("  emails:", sorted(set(e.lower() for e in re.findall(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+", r.text) if not e.endswith((".png", ".jpg", ".webp", ".svg"))))[:10])
