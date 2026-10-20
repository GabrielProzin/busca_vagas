"""Vagas publicadas como issues em repositórios de vagas do GitHub (backend-br/vagas e afins).

Essas vagas costumam trazer email ou link direto do recrutador no corpo da issue,
então são a principal fonte para o envio por email.
"""
from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timedelta, timezone

from ..http import Http
from ..modelos import Vaga
from ..texto import extrair_emails, normalizar

log = logging.getLogger(__name__)

API = "https://api.github.com/search/issues"
# Repositório de vagas = nome do repo contém "vaga" ou "jobs" (descoberta automática).
_REPO_DE_VAGAS = re.compile(r"/repos/([^/]+/[^/]*(vaga|jobs|empregos)[^/]*)$", re.I)
_URL = re.compile(r"https?://[^\s)>\]]+")


def _modalidade(labels: list[str], texto: str) -> str | None:
    tudo = " ".join(labels) + " " + texto[:1500]
    if re.search(r"\bremot", tudo):
        return "remoto"
    if re.search(r"\bhibrid", tudo):
        return "hibrido"
    if re.search(r"\bpresencial\b", tudo):
        return "presencial"
    return None


def _empresa(titulo: str, corpo: str) -> str:
    # Convenção comum nesses repos: "[Cidade] Cargo na Empresa" ou "Cargo @ Empresa"
    m = re.search(r"(?:\bna\b|\bno\b|@|\bat\b)\s+([A-Z][\w&.\- ]{1,40})$", titulo.strip())
    if m:
        return m.group(1).strip()
    m = re.search(r"(?im)^\W*(?:empresa|company)\W*\s*[:\-]?\s*\n?\s*([^\n]{2,60})", corpo)
    return m.group(1).strip(" *#:") if m else ""


def coletar(http: Http, termos: list[str], dias: int = 14) -> list[Vaga]:
    token = os.getenv("GITHUB_TOKEN")
    if not token:
        log.warning("github: sem GITHUB_TOKEN, fonte ignorada")
        return []
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    desde = (datetime.now(timezone.utc) - timedelta(days=dias)).date().isoformat()
    vagas: dict[str, Vaga] = {}
    for termo in termos:
        q = f'"{termo}" in:title is:issue is:open created:>={desde}'
        try:
            r = http.get(API, params={"q": q, "per_page": 100, "sort": "created"}, headers=headers)
            r.raise_for_status()
            itens = r.json().get("items") or []
        except Exception as e:
            log.warning("github: falha em %r: %s", termo, e)
            continue
        for it in itens:
            m = _REPO_DE_VAGAS.search(it.get("repository_url", ""))
            if not m:
                continue
            repo = m.group(1)
            corpo = it.get("body") or ""
            labels = [normalizar(l.get("name", "")) for l in it.get("labels") or []]
            criada = datetime.fromisoformat(it["created_at"].replace("Z", "+00:00"))
            v = Vaga(
                fonte="github",
                id_origem=f"{repo}#{it['number']}",
                titulo=it.get("title", "").strip(),
                empresa=_empresa(it.get("title", ""), corpo),
                url=it.get("html_url", ""),
                descricao=corpo,
                modalidade=_modalidade(labels, normalizar(corpo)),
                publicada_em=criada,
                emails=extrair_emails(corpo),
                termo_busca=termo,
                tags=labels,
            )
            vagas.setdefault(v.id_origem, v)
        log.info("github: %r -> acumulado %d vagas", termo, len(vagas))
    return list(vagas.values())
