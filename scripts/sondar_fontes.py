"""Sonda fontes de vagas: descobre endpoints de API em sites públicos e testa candidatos.

Uso (no Actions, modo diagnóstico): python scripts/sondar_fontes.py > saida/sondagem.txt
Não faz parte da coleta diária; serve para quando uma fonte muda e é preciso achar o endpoint novo.
"""
from __future__ import annotations

import re
import sys
from urllib.parse import urljoin

import requests

UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
      "Accept": "application/json, text/html;q=0.9, */*;q=0.8"}

TESTES = [
    "https://employability-portal.gupy.io/api/v1/jobs?jobName=analista%20de%20dados&limit=3&offset=0",
    "https://portal.api.gupy.io/api/v1/jobs?jobName=analista%20de%20dados&limit=3",
    "https://portal.api.gupy.io/api/job?name=analista%20de%20dados&limit=3",
    "https://api.remotar.com.br/jobs?search=dados&page=1",
    "https://remotar.com.br/search/jobs?q=dados",
    "https://programathor.com.br/jobs?search=dados",
    "https://vagas.solides.com.br/vagas/todos/dados",
    "https://www.trampos.co/oportunidades?tr=dados",
    "https://inhire.app/vagas?search=dados",
    "https://www.vagas.com.br/vagas-de-analista-de-dados",
]
PAGINAS_PARA_DESCOBRIR = [
    "https://portal.gupy.io/job-search/term=analista%20de%20dados",
    "https://remotar.com.br/",
    "https://vagas.solides.com.br/",
]
API_RE = re.compile(r"https://[a-z0-9.\-]*(?:api|portal|gateway|apigw|search)[a-z0-9.\-]*\.[a-z.]+(?:/[A-Za-z0-9_\-/.{}$]*)?")


def mostrar(r: requests.Response, n: int = 900) -> None:
    print(f"  -> {r.status_code} {r.headers.get('content-type', '')} {len(r.content)}B final={r.url}")
    print("  " + r.text[:n].replace("\n", " ")[:n])


def main() -> None:
    s = requests.Session()
    s.headers.update(UA)
    print("=== TESTES DIRETOS ===")
    for u in TESTES:
        print(u)
        try:
            mostrar(s.get(u, timeout=20))
        except Exception as e:
            print("  ERRO", e)
    print("\n=== DESCOBERTA EM BUNDLES JS ===")
    for pagina in PAGINAS_PARA_DESCOBRIR:
        print(pagina)
        try:
            r = s.get(pagina, timeout=20)
        except Exception as e:
            print("  ERRO", e)
            continue
        print(f"  {r.status_code} {len(r.text)}B")
        achados = set(API_RE.findall(r.text))
        scripts = re.findall(r'<script[^>]+src="([^"]+\.js[^"]*)"', r.text)[:40]
        for sc in scripts:
            try:
                js = s.get(urljoin(pagina, sc), timeout=20).text
            except Exception:
                continue
            achados |= set(API_RE.findall(js))
            for m in re.finditer(r'["\'`](/api/[A-Za-z0-9_\-/{}$]+)', js):
                achados.add("PATH " + m.group(1))
        for a in sorted(achados)[:80]:
            print("   ", a)
        nd = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.{0,1500})', r.text, re.S)
        if nd:
            print("  NEXT_DATA:", nd.group(1)[:1500].replace("\n", " "))


if __name__ == "__main__":
    sys.exit(main())
