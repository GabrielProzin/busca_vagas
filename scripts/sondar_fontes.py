"""Sonda fontes de vagas e a busca de email de RH (só para diagnóstico, fora da coleta).

Uso (no Actions, modo diagnóstico): python scripts/sondar_fontes.py > saida/sondagem.txt
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
      "Accept": "application/json, text/html;q=0.9, */*;q=0.8", "Accept-Language": "pt-BR,pt;q=0.9"}
s = requests.Session()
s.headers.update(UA)


def chaves(d, prof=0, max_prof=1):
    pad = "    " * prof
    if isinstance(d, dict):
        for k, v in list(d.items())[:40]:
            amostra = "" if isinstance(v, (dict, list)) else repr(v)[:100]
            print(f"{pad}{k}: {type(v).__name__} {amostra}")
            if prof < max_prof and isinstance(v, (dict, list)):
                chaves(v, prof + 1, max_prof)
    elif isinstance(d, list) and d:
        print(f"{pad}[{len(d)} itens] primeiro:")
        chaves(d[0], prof + 1, max_prof)


def j(u, **kw):
    try:
        r = s.get(u, timeout=25, **kw)
        return r.status_code, (r.json() if "json" in r.headers.get("content-type", "") else r.text[:300])
    except Exception as e:
        return 0, str(e)


print("=" * 20, "SOLIDES: parâmetro de busca")
for params in [{"title": "analista de dados"}, {"search": "analista de dados"}, {"jobTitle": "analista de dados"},
               {"q": "analista de dados"}, {"keyword": "analista de dados"}, {"title": "analista de dados", "page": 2},
               {"title": "dados", "locations": "Goiânia"}, {"title": "analista de dados", "homeOffice": "true"}]:
    st, d = j("https://vagas.solides.com.br/api/vacancies", params=params)
    if isinstance(d, dict):
        print(params, st, "count", d.get("count"), "pages", d.get("totalPages"), [x.get("title") for x in d.get("data", [])[:6]])
    else:
        print(params, st, d)
st, d = j("https://vagas.solides.com.br/api/vacancies", params={"title": "analista de dados"})
if isinstance(d, dict) and d.get("data"):
    x = d["data"][0]
    for k in ("state", "city", "address", "salary", "seniority", "occupationAreas", "hardSkills", "recruitmentContractType"):
        print(f"  {k}:", json.dumps(x.get(k), ensure_ascii=False)[:250])
    print("  slug/id/redirect:", x.get("slug"), x.get("id"), x.get("redirectLink"))
    for u in [f"https://{x.get('slug')}.vagas.solides.com.br/vaga/{x.get('id')}", f"https://vagas.solides.com.br/vaga/{x.get('id')}"]:
        try:
            r = s.get(u, timeout=20)
            print("  ", u, r.status_code, r.url, len(r.text))
        except Exception as e:
            print("  ", u, e)

print("\n" + "=" * 20, "TRAMPOS: detalhe")
st, d = j("https://trampos.co/api/v2/opportunities", params={"tr": "analista de dados"})
if isinstance(d, dict) and d.get("opportunities"):
    print("  títulos:", [o["name"] for o in d["opportunities"][:12]], "total", d.get("pagination"))
    st2, det = j(f"https://trampos.co/api/v2/opportunities/{d['opportunities'][0]['id']}")
    print("  detalhe", st2)
    if isinstance(det, dict):
        chaves(det, 0, 2)

print("\n" + "=" * 20, "GUPY: empresa e careerPage")
st, d = j("https://portal.gupy.io/api/job-search/jobs", params={"jobName": "analista de dados", "limit": 1})
if isinstance(d, dict):
    url = d["data"][0]["jobUrl"]
    r = s.get(url, headers={"Accept": "text/html"}, timeout=25)
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', r.text, re.S)
    job = json.loads(m.group(1))["props"]["pageProps"]["job"]
    print("  company:", json.dumps(job.get("company"), ensure_ascii=False)[:600])
    print("  careerPage:", json.dumps(job.get("careerPage"), ensure_ascii=False)[:600])

print("\n" + "=" * 20, "COBERTURA DE EMAIL: empresas das vagas reais")
try:
    from coletor.contato import buscar_email_empresa
    sites = []
    for termo in ("analista de dados", "analista de bi", "engenheiro de dados"):
        st, d = j("https://portal.gupy.io/api/job-search/jobs", params={"jobName": termo, "limit": 6})
        for x in (d.get("data", []) if isinstance(d, dict) else []):
            try:
                r = s.get(x["jobUrl"], headers={"Accept": "text/html"}, timeout=20)
                m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', r.text, re.S)
                job = json.loads(m.group(1))["props"]["pageProps"]["job"]
                site = (job.get("careerPage") or {}).get("companySite") or (job.get("company") or {}).get("site") or ""
                sites.append((x.get("careerPageName"), site))
            except Exception as e:
                sites.append((x.get("careerPageName"), f"erro {e}"))
    achou = 0
    for nome, site in sites:
        r = buscar_email_empresa(site) if site.startswith("http") else None
        achou += bool(r)
        print(f"  {nome!r:40} {site!r:40} -> {r}")
    print(f"  cobertura: {achou}/{len(sites)}")
except Exception as e:
    import traceback
    traceback.print_exc()
