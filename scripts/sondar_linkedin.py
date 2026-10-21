"""Sonda o ator de posts do LinkedIn no Apify com variações de busca (5 posts cada, custo mínimo).
Escreve só contagens e nomes de campos nas anotações do Actions (nada de conteúdo dos posts)."""
import os
import re
from datetime import datetime, timedelta, timezone

import requests

TOKEN = os.environ["APIFY_TOKEN"]
ATOR = os.getenv("ATOR", "harvestapi~linkedin-post-search")
desde = (datetime.now(timezone.utc) - timedelta(hours=13)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
VARIANTES = {
    "simples": {"searchQueries": ["vaga analista de dados"]},
    "simples+24h": {"searchQueries": ["vaga analista de dados"], "postedLimit": "24h"},
    "simples+data": {"searchQueries": ["vaga analista de dados"], "postedLimitDate": desde},
    "booleana+24h": {"searchQueries": ['vaga AND (currículo OR curriculo) AND ("analista de dados" OR "analista de BI")'], "postedLimit": "24h"},
    "curriculo+24h": {"searchQueries": ["vaga analista de dados currículo"], "postedLimit": "24h"},
    "email+week": {"searchQueries": ["vaga analista de dados enviar currículo email"], "postedLimit": "week"},
}


def anotar(t):
    print(f"::notice title=sonda linkedin::{t}", flush=True)


for nome, extra in VARIANTES.items():
    entrada = {"maxPosts": 5, "sortBy": "date", "scrapeReactions": False, "scrapeComments": False, **extra}
    try:
        r = requests.post(f"https://api.apify.com/v2/acts/{ATOR}/run-sync-get-dataset-items",
                          params={"token": TOKEN, "timeout": 200}, json=entrada, timeout=260)
        dados = r.json() if r.headers.get("content-type", "").startswith("application/json") else None
        if isinstance(dados, list):
            com_email = sum(bool(EMAIL.search(p.get("content") or "")) for p in dados)
            chaves = sorted(dados[0].keys())[:12] if dados else []
            datas = [((p.get("postedAt") or {}).get("date") or "")[:10] for p in dados]
            anotar(f"{nome}: HTTP {r.status_code}, {len(dados)} itens, {com_email} com email, datas {datas}, campos {chaves}")
        else:
            anotar(f"{nome}: HTTP {r.status_code}, resposta {str(dados or r.text)[:300]}")
    except Exception as e:
        anotar(f"{nome}: erro {type(e).__name__}: {str(e)[:200]}")
