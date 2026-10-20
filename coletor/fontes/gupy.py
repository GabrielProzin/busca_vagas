"""Vagas do portal público da Gupy (portal.gupy.io), o maior ATS do Brasil.

A Gupy não expõe email de recrutador: a candidatura é feita pelo link da vaga.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime

from ..http import Http
from ..modelos import Vaga
from ..texto import extrair_emails, limpar_html

log = logging.getLogger(__name__)

# Rota usada pelo próprio portal (descoberta com scripts/sondar_fontes.py em out/2026;
# a antiga portal.api.gupy.io/api/v1/jobs passou a responder 404).
API = "https://portal.gupy.io/api/job-search/jobs"
POR_PAGINA = 50
_MODALIDADE = {"remote": "remoto", "hybrid": "hibrido", "on-site": "presencial"}
_NEXT_DATA = re.compile(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.S)


def _data(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def _para_vaga(j: dict, termo: str) -> Vaga:
    modalidade = _MODALIDADE.get(j.get("workplaceType") or "")
    if not modalidade and j.get("isRemoteWork"):
        modalidade = "remoto"
    descricao = limpar_html(j.get("description"))
    return Vaga(
        fonte="gupy",
        id_origem=str(j.get("id")),
        titulo=(j.get("name") or "").strip(),
        empresa=(j.get("careerPageName") or "").strip(),
        url=j.get("jobUrl") or "",
        descricao=descricao,
        cidade=j.get("city") or None,
        estado=j.get("state") or None,
        modalidade=modalidade,
        publicada_em=_data(j.get("publishedDate")),
        emails=extrair_emails(descricao),
        termo_busca=termo,
        tags=[s for s in (j.get("skills") or []) if isinstance(s, str)],
    )


def coletar(http: Http, termos: list[str], max_paginas: int = 4) -> list[Vaga]:
    vagas: dict[str, Vaga] = {}
    for termo in termos:
        offset = 0
        for pagina in range(max_paginas):
            try:
                r = http.get(API, params={"jobName": termo, "limit": POR_PAGINA, "offset": offset})
                r.raise_for_status()
                dados = r.json()
            except Exception as e:  # uma fonte fora do ar não pode derrubar a coleta inteira
                log.warning("gupy: falha em %r pág %d: %s", termo, pagina, e)
                break
            itens = dados.get("data") or []
            for j in itens:
                v = _para_vaga(j, termo)
                if v.id_origem and v.id_origem not in vagas:
                    vagas[v.id_origem] = v
            # A API pode devolver menos que o "limit" pedido; avança pelo que veio de fato.
            offset += len(itens)
            total = (dados.get("pagination") or {}).get("total")
            if not itens or (total is not None and offset >= total):
                break
        log.info("gupy: %r -> acumulado %d vagas", termo, len(vagas))
    return list(vagas.values())


def detalhar(http: Http, vaga: Vaga) -> None:
    """Busca a descrição completa na página da vaga (a listagem às vezes vem resumida)."""
    try:
        r = http.get(vaga.url, headers={"Accept": "text/html"})
        r.raise_for_status()
    except Exception as e:
        log.warning("gupy: não abriu %s: %s", vaga.url, e)
        return
    m = _NEXT_DATA.search(r.text)
    if not m:
        return
    try:
        job = json.loads(m.group(1))["props"]["pageProps"]["job"]
    except (KeyError, json.JSONDecodeError, TypeError):
        return
    partes = [job.get(k) for k in ("description", "responsibilities", "prerequisites", "relevantExperiences")]
    texto = limpar_html("\n".join(p for p in partes if isinstance(p, str)))
    if len(texto) > len(vaga.descricao):
        vaga.descricao = texto
        vaga.emails = extrair_emails(texto) or vaga.emails
