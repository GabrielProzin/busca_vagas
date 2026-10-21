"""Sonda o ator de posts do LinkedIn no Apify com variações de busca (5 posts cada, custo mínimo).
Escreve só contagens e nomes de campos nas anotações do Actions (nada de conteúdo dos posts)."""
import os
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import yaml  # noqa: E402

from coletor.filtros import Filtros  # noqa: E402
from coletor.fontes.linkedin_posts import post_para_vaga  # noqa: E402

CFG = yaml.safe_load((Path(__file__).resolve().parent.parent / "config/preferencias.yaml").read_text(encoding="utf-8"))
TRILHAS = [p for _, _, p in Filtros.de_config(CFG).trilhas]
from datetime import datetime, timedelta, timezone

import requests

TOKEN = os.environ["APIFY_TOKEN"]
ATOR = os.getenv("ATOR", "harvestapi~linkedin-post-search")
desde = (datetime.now(timezone.utc) - timedelta(hours=13)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
VARIANTES = {q: {"searchQueries": [q], "postedLimit": "week"} for q in [
    "vaga analista de dados",
    "analista de dados júnior",
    "vaga analista de BI",
    "currículo analista de dados",
    "analista de dados currículo email",
    "vaga cientista de dados",
    "vaga engenheiro de dados",
    "vaga power bi",
]}


def anotar(t):
    print(f"::notice title=sonda linkedin::{t}", flush=True)


for nome, extra in VARIANTES.items():
    entrada = {"maxPosts": int(os.getenv("MAX_POSTS", "20")), "sortBy": "date", "scrapeReactions": False, "scrapeComments": False, **extra}
    try:
        r = requests.post(f"https://api.apify.com/v2/acts/{ATOR}/run-sync-get-dataset-items",
                          params={"token": TOKEN, "timeout": 200}, json=entrada, timeout=260)
        dados = r.json() if r.headers.get("content-type", "").startswith("application/json") else None
        if isinstance(dados, list):
            com_email = sum(bool(EMAIL.search(p.get("content") or "")) for p in dados)
            motivos = Counter(post_para_vaga(p, TRILHAS, nome)[1] or "VIROU VAGA" for p in dados)
            anotar(f"{nome}: {len(dados)} posts, {com_email} com email -> {dict(motivos)}")
        else:
            anotar(f"{nome}: HTTP {r.status_code}, resposta {str(dados or r.text)[:300]}")
    except Exception as e:
        anotar(f"{nome}: erro {type(e).__name__}: {str(e)[:200]}")
