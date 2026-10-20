"""Execução diária: coleta -> filtra -> detalha -> ranqueia -> grava.

Uso:  python -m coletor.pipeline [--tfidf] [--sem-github] [--max-paginas N]
"""
from __future__ import annotations

import argparse
import logging
import os
import time
from collections import Counter
from pathlib import Path

import yaml

from .armazenamento import Supabase, salvar_json
from .filtros import Filtros
from .fontes import github_issues, gupy
from .http import Http
from .modelos import Vaga
from .ranking import Embedder, Ranker
from .texto import normalizar

log = logging.getLogger("coletor")
RAIZ = Path(__file__).resolve().parent.parent


def _deduplicar(vagas: list[Vaga]) -> list[Vaga]:
    """Mesma vaga em duas fontes: fica a que tem email (ou a primeira)."""
    por_chave: dict[tuple, Vaga] = {}
    for v in vagas:
        chave = (normalizar(v.titulo), normalizar(v.empresa)) if v.empresa else (v.id,)
        atual = por_chave.get(chave)
        if atual is None or (not atual.emails and v.emails):
            por_chave[chave] = v
    return list(por_chave.values())


def _resumo_md(aprovadas: list[Vaga], execucao: dict, detalhado: bool) -> str:
    linhas = [f"## Coleta de vagas — {execucao['principal']} principais, {execucao['vale_tentar']} vale tentar",
              "", f"Coletadas por fonte: {execucao['coletadas']} · ranking via `{execucao['backend']}` · "
              f"{execucao['duracao_s']:.0f}s", "", "**Descartes:**"]
    linhas += [f"- {m}: {n}" for m, n in sorted(execucao["descartes"].items(), key=lambda x: -x[1])[:12]]
    if detalhado and aprovadas:
        linhas += ["", "| Nota | Vaga | Empresa | Local | Lista | Email |", "|---|---|---|---|---|---|"]
        for v in aprovadas[:40]:
            local = v.modalidade or ""
            if v.cidade and v.modalidade != "remoto":
                local += f" · {v.cidade}"
            linhas.append(f"| {v.nota} | [{v.titulo}]({v.url}) | {v.empresa} | {local} | {v.lista} | "
                          f"{'sim' if v.emails else ''} |")
    return "\n".join(linhas) + "\n"


def executar(forcar_tfidf: bool = False, usar_github: bool = True, max_paginas: int = 4) -> dict:
    inicio = time.monotonic()
    cfg = yaml.safe_load((RAIZ / "config/preferencias.yaml").read_text(encoding="utf-8"))
    perfil = yaml.safe_load((RAIZ / "perfil/perfil.yaml").read_text(encoding="utf-8"))
    curriculo = (RAIZ / "perfil/curriculo.md").read_text(encoding="utf-8")
    filtros = Filtros.de_config(cfg)
    http = Http()
    termos = cfg["termos_busca"]

    # 1. Coleta
    coletadas: dict[str, int] = {}
    vagas = gupy.coletar(http, termos, max_paginas=max_paginas)
    coletadas["gupy"] = len(vagas)
    if usar_github:
        gh = github_issues.coletar(http, termos, dias=filtros.max_dias)
        coletadas["github"] = len(gh)
        vagas += gh
    vagas = _deduplicar(vagas)
    log.info("coleta: %s -> %d únicas", coletadas, len(vagas))

    # 2. Filtros baratos (título, data) antes de baixar descrições
    descartes: Counter = Counter()
    candidatas: list[Vaga] = []
    for v in vagas:
        motivo = filtros.filtrar_titulo(v) or filtros.filtrar_data(v)
        if motivo:
            descartes[motivo.split(":")[0]] += 1
        else:
            candidatas.append(v)
    log.info("filtro de título/data: %d candidatas", len(candidatas))

    # 3. Descrição completa para quem chegou até aqui
    for v in candidatas:
        if v.fonte == "gupy" and len(v.descricao) < 600:
            gupy.detalhar(http, v)

    # 4. Filtros de local e experiência
    restantes = []
    for v in candidatas:
        motivo = filtros.filtrar_local(v) or filtros.filtrar_experiencia(v)
        if motivo:
            v.lista, v.motivo_descarte = "descartada", motivo
            descartes[motivo.split(" em ")[0] if " em " in motivo else motivo] += 1
        else:
            restantes.append(v)

    # 5. Ranking
    ranker = Ranker(perfil, curriculo, cfg, Embedder(forcar_tfidf=forcar_tfidf))
    ranker.ranquear(restantes)
    for v in restantes:
        if v.lista == "descartada":
            descartes["nota abaixo do mínimo"] += 1
    aprovadas = sorted([v for v in restantes if v.lista != "descartada"], key=lambda v: -(v.nota or 0))

    execucao = {
        "duracao_s": round(time.monotonic() - inicio, 1),
        "coletadas": coletadas,
        "descartes": dict(descartes),
        "principal": sum(v.lista == "principal" for v in aprovadas),
        "vale_tentar": sum(v.lista == "vale_tentar" for v in aprovadas),
        "backend": ranker.emb.backend,
    }

    # 6. Gravação
    caminho = salvar_json(aprovadas, execucao)
    log.info("json: %s", caminho)
    sb = Supabase.do_ambiente()
    if sb:
        sb.upsert_vagas(aprovadas)
        sb.registrar_execucao(execucao)
    resumo = os.getenv("GITHUB_STEP_SUMMARY")
    if resumo:
        # O repositório é público: o resumo do Actions só mostra a tabela de vagas se pedido.
        detalhado = os.getenv("RESUMO_DETALHADO") == "1"
        with open(resumo, "a", encoding="utf-8") as f:
            f.write(_resumo_md(aprovadas, execucao, detalhado))
    log.info("fim: %s", execucao)
    return execucao


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    ap = argparse.ArgumentParser()
    ap.add_argument("--tfidf", action="store_true", help="usa TF-IDF em vez de embeddings")
    ap.add_argument("--sem-github", action="store_true")
    ap.add_argument("--max-paginas", type=int, default=4)
    a = ap.parse_args()
    executar(forcar_tfidf=a.tfidf, usar_github=not a.sem_github, max_paginas=a.max_paginas)


if __name__ == "__main__":
    main()
