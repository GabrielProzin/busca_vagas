"""Execução diária: coleta -> filtra -> detalha -> ranqueia -> grava.

Uso:  python -m coletor.pipeline [--tfidf] [--sem-github] [--max-paginas N]
"""
from __future__ import annotations

import argparse
import base64
import json
import logging
import re
import os
import time
from collections import Counter
from pathlib import Path

import yaml

from . import resumo as resumo_email
from .armazenamento import Supabase, salvar_json
from .filtros import Filtros
from .fontes import github_issues, gupy, remotar
from .http import Http
from .modelos import Vaga
from .ranking import Embedder, Ranker
from .texto import normalizar

log = logging.getLogger("coletor")
RAIZ = Path(__file__).resolve().parent.parent


_GUPY_TOKEN = re.compile(r"gupy\.io/job/([A-Za-z0-9_\-=]+)")


def _chave(v: Vaga) -> tuple:
    """Identidade da vaga entre fontes. Links da Gupy carregam o jobId em base64."""
    if v.fonte == "gupy":
        return ("gupy", v.id_origem)
    if m := _GUPY_TOKEN.search(v.url or ""):
        try:
            token = m.group(1)
            dados = json.loads(base64.urlsafe_b64decode(token + "=" * (-len(token) % 4)))
            return ("gupy", str(dados["jobId"]))
        except Exception:
            pass
    return (normalizar(v.titulo), normalizar(v.empresa)) if v.empresa else (v.id,)


def _deduplicar(vagas: list[Vaga]) -> list[Vaga]:
    """Mesma vaga em duas fontes: fica a que tem email; empate, a primeira (Gupy vem antes)."""
    por_chave: dict[tuple, Vaga] = {}
    for v in vagas:
        chave = _chave(v)
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
    rem = remotar.coletar(http, termos)
    coletadas["remotar"] = len(rem)
    vagas += rem
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
        motivo = (filtros.filtrar_local(v) or filtros.filtrar_idioma(v)
                  or filtros.filtrar_experiencia(v) or filtros.filtrar_senioridade_descricao(v))
        if motivo:
            v.lista, v.motivo_descarte = "descartada", motivo
            # "presencial em Campinas" e "hibrido em Recife" contam como "presencial" / "hibrido"
            chave = motivo.split(" em ")[0] if motivo.startswith(("presencial em", "hibrido em")) else motivo
            descartes[chave] += 1
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
    # Descartadas na etapa de ranking/local: úteis para calibrar pesos e filtros.
    (caminho.parent / "descartadas.json").write_text(json.dumps(
        [{"titulo": v.titulo, "empresa": v.empresa, "fonte": v.fonte, "nota": v.nota, "motivo": v.motivo_descarte,
          "url": v.url, "componentes": v.componentes} for v in candidatas if v.lista == "descartada"],
        ensure_ascii=False, indent=1), encoding="utf-8")
    log.info("json: %s", caminho)
    sb = Supabase.do_ambiente()
    if sb:
        # Novidade = não estava no banco antes desta coleta. Só elas entram no email de resumo.
        existentes = sb.ids_existentes([v.id for v in aprovadas])
        corte = float(cfg.get("resumo", {}).get("nota_minima", 85))
        para_resumo = [v for v in aprovadas if v.id not in existentes and (v.nota or 0) >= corte]
        sb.upsert_vagas(aprovadas)
        sb.registrar_execucao(execucao)
        try:
            resumo_email.enviar(para_resumo, corte)
        except Exception as e:  # o resumo é um extra: falha nele não pode derrubar a coleta
            log.warning("resumo: falha ao enviar: %s", e)
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
