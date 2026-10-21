"""Vagas do portal da Sólides (vagas.solides.com.br), um dos maiores ATS do Brasil.

A busca por título da API é "frouxa": casa qualquer palavra. Por isso buscamos por palavras
curtas e específicas ("dados", "bi") e deixamos os filtros do pipeline separarem o que interessa.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

from ..http import Http
from ..modelos import Vaga
from ..texto import extrair_emails, limpar_html

log = logging.getLogger(__name__)

API = "https://vagas.solides.com.br/api/vacancies"
_MODALIDADE = {"remoto": "remoto", "home office": "remoto", "hibrido": "hibrido", "híbrido": "hibrido", "presencial": "presencial"}


def _data(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        d = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _para_vaga(j: dict, termo: str) -> Vaga:
    tipo = (j.get("jobType") or "").strip().lower()
    modalidade = "remoto" if j.get("homeOffice") else _MODALIDADE.get(tipo)
    partes = [limpar_html(j.get("description"))]
    for campo, rotulo in (("hardSkills", "Habilidades"), ("education", "Formação"), ("language", "Idiomas")):
        nomes = [x.get("name") for x in j.get(campo) or [] if isinstance(x, dict) and x.get("name")]
        if nomes:
            partes.append(f"{rotulo}: {', '.join(nomes)}")
    sal = j.get("salary") or {}
    if sal.get("finalRange"):
        partes.append(f"Salário: até R$ {sal['finalRange']}")
    descricao = "\n".join(p for p in partes if p)
    senioridade = [x.get("name", "") for x in j.get("seniority") or [] if isinstance(x, dict)]
    titulo = (j.get("title") or "").strip()
    # O nível vem num campo separado e costuma listar TODOS os níveis aceitos ("Júnior, Pleno, Sênior").
    # Se aceita júnior (ou trainee), a vaga conta como júnior; senão, os níveis vão para o título
    # só para o filtro de senioridade enxergar.
    aceita_junior = any(re.search(r"j[uú]nior|\bjr\b|trainee", n, re.I) for n in senioridade)
    if aceita_junior and not re.search(r"j[uú]nior|\bjr\b", titulo, re.I):
        titulo_filtro = f"{titulo} (Júnior)"
    elif senioridade and not aceita_junior and not any(n.lower() in titulo.lower() for n in senioridade):
        titulo_filtro = f"{titulo} ({', '.join(senioridade)})"
    else:
        titulo_filtro = titulo
    slug, vid = j.get("slug"), j.get("id")
    return Vaga(
        fonte="solides",
        id_origem=str(vid),
        titulo=titulo_filtro,
        empresa=(j.get("companyName") or "").strip(),
        url=f"https://{slug}.vagas.solides.com.br/vaga/{vid}" if slug else f"https://vagas.solides.com.br/vaga/{vid}",
        descricao=descricao,
        cidade=(j.get("city") or {}).get("name"),
        estado=(j.get("state") or {}).get("code"),
        modalidade=modalidade,
        publicada_em=_data(j.get("createdAt")),
        emails=extrair_emails(descricao),
        termo_busca=termo,
        tags=[x.get("name") for x in j.get("occupationAreas") or [] if isinstance(x, dict) and x.get("name")],
    )


def coletar(http: Http, termos: list[str], max_paginas: int = 8) -> list[Vaga]:
    vagas: dict[str, Vaga] = {}
    for termo in termos:
        for pagina in range(1, max_paginas + 1):
            try:
                r = http.get(API, params={"title": termo, "page": pagina})
                r.raise_for_status()
                dados = r.json()
            except Exception as e:
                log.warning("solides: falha em %r pág %d: %s", termo, pagina, e)
                break
            for j in dados.get("data") or []:
                if j.get("isHiddenJob") or j.get("currentState") not in (None, "em_andamento"):
                    continue
                v = _para_vaga(j, termo)
                vagas.setdefault(v.id_origem, v)
            if pagina >= int(dados.get("totalPages") or 1):
                break
        log.info("solides: %r -> acumulado %d vagas", termo, len(vagas))
    return list(vagas.values())
