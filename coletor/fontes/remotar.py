"""Vagas 100% remotas da Remotar (api.remotar.com.br, a mesma API que o site usa).

Boa parte das vagas da Remotar aponta para a Gupy; o pipeline usa `chave_dedup`
para não mostrar a mesma vaga duas vezes.
"""
from __future__ import annotations

import logging
from datetime import datetime

from ..http import Http
from ..modelos import Vaga
from ..texto import extrair_emails, limpar_html

log = logging.getLogger(__name__)

API = "https://api.remotar.com.br/jobs"


def _para_vaga(j: dict, termo: str) -> Vaga:
    reqs = j.get("jobRequirements") or []
    obrig = [r["description"] for r in reqs if r.get("mandatory") and r.get("description")]
    desej = [r["description"] for r in reqs if not r.get("mandatory") and r.get("description")]
    partes = [j.get("subtitle") or "", limpar_html(j.get("description"))]
    if obrig:
        partes.append("Requisitos obrigatórios:\n" + "\n".join(obrig))
    if desej:
        # A palavra "Diferenciais" faz o ranking não penalizar o que falta aqui.
        partes.append("\n".join(f"Diferencial: {d}" for d in desej))
    descricao = "\n".join(p for p in partes if p)
    empresa = (j.get("companyDisplayName") or (j.get("company") or {}).get("name") or "").strip()
    url = j.get("externalLink") if j.get("isExternalLink") and j.get("externalLink") else f"https://remotar.com.br/job/{j['id']}"
    try:
        criada = datetime.fromisoformat(j.get("createdAt"))
    except (TypeError, ValueError):
        criada = None
    tags = [((t.get("tag") or {}).get("name") or "") for t in j.get("jobTags") or []]
    return Vaga(
        fonte="remotar",
        id_origem=str(j["id"]),
        titulo=(j.get("title") or "").strip(),
        empresa=empresa,
        url=url or "",
        descricao=descricao,
        cidade=j.get("city"),
        estado=j.get("state"),
        modalidade="remoto" if (j.get("type") or "remote") == "remote" else None,
        publicada_em=criada,
        emails=extrair_emails(descricao),
        termo_busca=termo,
        tags=[t for t in tags if t],
    )


def coletar(http: Http, termos: list[str], max_paginas: int = 2) -> list[Vaga]:
    vagas: dict[str, Vaga] = {}
    for termo in termos:
        for pagina in range(1, max_paginas + 1):
            try:
                r = http.get(API, params={"search": termo, "page": pagina})
                r.raise_for_status()
                dados = r.json()
            except Exception as e:
                log.warning("remotar: falha em %r pág %d: %s", termo, pagina, e)
                break
            for j in dados.get("data") or []:
                if j.get("expired") or not j.get("active", True) or "id" not in j:
                    continue
                v = _para_vaga(j, termo)
                vagas.setdefault(v.id_origem, v)
            meta = dados.get("meta") or {}
            if pagina >= int(meta.get("last_page") or 1):
                break
        log.info("remotar: %r -> acumulado %d vagas", termo, len(vagas))
    return list(vagas.values())
