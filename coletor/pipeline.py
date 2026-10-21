"""Coleta: coleta -> filtra -> detalha -> ranqueia -> grava.

Dois tipos (variável COLETA_TIPO):
- completa (padrão; ~11:00 e ~18:30): todas as fontes, inclusive posts do LinkedIn, e o email de resumo;
- rapida (entre as completas): só as plataformas, sem LinkedIn e sem email.

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
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from pathlib import Path

import yaml

from . import alerta
from . import followup
from . import resumo as resumo_email
from .aprendizado import Aprendizado
from .armazenamento import Supabase, salvar_json
from .filtros import Filtros
from .contato import buscar_email_empresa
from .fontes import github_issues, gupy, linkedin_posts, remotar, solides
from .http import Http
from .envio import dominio_excluido
from .modelo_email import email_modelo
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
              f"{execucao['duracao_s']:.0f}s", ""]
    if ap := execucao.get("aprendizado"):
        linhas += [f"Aprendizado: {ap['positivos']} aplicadas, {ap['negativos']} descartadas · "
                   f"{'ligado' if ap['ativo'] else 'ainda desligado'}", ""]
    linhas += ["**Descartes:**"]
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


def _anotar(texto: str, destaque: bool = True) -> None:
    """Linha de resumo que aparece na página da execução do Actions (sem dados pessoais).
    O GitHub mostra só 10 por passo: detalhes de calibração (destaque=False) ficam só no log."""
    log.info(texto)
    if destaque and os.getenv("GITHUB_ACTIONS") == "true":
        print(f"::notice title=coleta::{texto}", flush=True)


def _followups_pendentes(sb: Supabase) -> list[dict]:
    """Só na coleta da manhã (antes das 15h em Brasília), para o lembrete chegar uma vez por dia."""
    if datetime.now(ZoneInfo("America/Sao_Paulo")).hour >= 15 and os.getenv("FOLLOWUP_SEMPRE") != "1":
        return []
    try:
        linhas = sb.candidaturas_abertas()
    except Exception as e:
        log.warning("follow-up: não li as candidaturas: %s", e)
        return []
    pendentes = []
    for c in linhas:
        s = followup.situacao(c)
        v = c.get("vaga") or {}
        if s and v.get("id"):
            pendentes.append({"id": v["id"], "titulo": v.get("titulo") or "Vaga", "empresa": v.get("empresa"),
                              "url": v.get("url"), "status": c["status"], "tipo": s[0], "dias": s[1]})
    log.info("follow-up: %d candidatura(s) pedem atenção", len(pendentes))
    return pendentes


def _vaga_do_banco(d: dict) -> Vaga:
    fonte, _, id_origem = d["id"].partition(":")
    return Vaga(fonte=fonte, id_origem=id_origem, titulo=d.get("titulo") or "", empresa=d.get("empresa") or "",
                url=d.get("url") or "", cidade=d.get("cidade"), modalidade=d.get("modalidade"), nota=d.get("nota"),
                lista=d.get("lista"), habilidades_ok=d.get("habilidades_ok") or [],
                emails=[d["email_contato"]] if d.get("email_contato") else [])


def _novas_para_resumo(sb: Supabase, corte: float, agora: datetime | None = None) -> list[Vaga]:
    """Vagas que chegaram desde a coleta completa anterior (as rápidas do meio do caminho entram aqui),
    com nota de corte, sem as que você já decidiu ou colocou na fila."""
    agora = agora or datetime.now(timezone.utc)
    desde = sb.ultima_completa()
    if not desde:  # sem registro (SQL novo não rodado): usa o intervalo normal entre as completas
        horas = 17 if agora.astimezone(ZoneInfo("America/Sao_Paulo")).hour < 15 else 8
        desde = (agora - timedelta(hours=horas)).isoformat()
    vagas = []
    for d in sb.vagas_novas_desde(desde, corte):
        c = d.get("candidatura")
        c = (c[0] if c else None) if isinstance(c, list) else c
        if c and (c.get("status") != "nova" or c.get("fila_em")):
            continue
        vagas.append(_vaga_do_banco(d))
    return vagas


def _para_fila(aprovadas: list[Vaga], existentes: set[str], automatico: dict, excluidos: list[str]) -> list[dict]:
    """Modo automático: vagas NOVAS com email, nota alta (e na lista principal) vão sozinhas para a fila."""
    if not automatico.get("ligado"):
        return []
    nota = float(automatico.get("nota_minima", 90))
    agora = datetime.now(timezone.utc).isoformat()
    linhas = []
    for v in aprovadas:
        if v.id in existentes or not v.emails or (v.nota or 0) < nota:
            continue
        if automatico.get("so_lista_principal", True) and v.lista != "principal":
            continue
        if dominio_excluido(v.emails[0], excluidos):
            continue
        assunto, corpo = email_modelo(v)
        linhas.append({"vaga_id": v.id, "status": "nova", "email_para": v.emails[0], "email_assunto": assunto,
                       "email_corpo": corpo, "fila_em": agora, "atualizada_em": agora})
    return linhas


def executar(forcar_tfidf: bool = False, usar_github: bool = True, max_paginas: int = 4) -> dict:
    inicio = time.monotonic()
    cfg = yaml.safe_load((RAIZ / "config/preferencias.yaml").read_text(encoding="utf-8"))
    perfil = yaml.safe_load((RAIZ / "perfil/perfil.yaml").read_text(encoding="utf-8"))
    curriculo = (RAIZ / "perfil/curriculo.md").read_text(encoding="utf-8")
    filtros = Filtros.de_config(cfg)
    http = Http()
    termos = cfg["termos_busca"]
    tipo = "rapida" if os.getenv("COLETA_TIPO") == "rapida" else "completa"
    excluidos = [d.lower().lstrip("@") for d in cfg.get("dominios_email_excluidos") or []]
    _anotar(f"Coleta {tipo}")

    # 1. Coleta
    coletadas: dict[str, int] = {}
    vagas = gupy.coletar(http, termos, max_paginas=max_paginas)
    coletadas["gupy"] = len(vagas)
    rem = remotar.coletar(http, termos)
    coletadas["remotar"] = len(rem)
    vagas += rem
    sol = solides.coletar(http, cfg.get("termos_solides", ["dados", "bi", "data"]))
    coletadas["solides"] = len(sol)
    vagas += sol
    if usar_github:
        gh = github_issues.coletar(http, termos, dias=filtros.max_dias)
        coletadas["github"] = len(gh)
        vagas += gh
    # Posts do LinkedIn com email (só com APIFY_TOKEN configurado, e só nas coletas completas: o crédito é pequeno).
    if tipo == "completa":
        li, li_info = linkedin_posts.coletar(cfg.get("linkedin_posts", {}), [p for _, _, p in filtros.trilhas])
        if li_info["erro"] != "sem APIFY_TOKEN":
            coletadas["linkedin"] = li_info["posts"]
        _anotar(f"LinkedIn: {li_info['posts']} posts, {li_info['vagas']} com email e cargo de dados; "
                f"descartes {li_info['descartes']}; erro {li_info['erro']}")
    else:
        li, li_info = [], {"posts": 0, "vagas": 0, "descartes": {}, "erro": None}
    vagas += li
    vagas = _deduplicar(vagas)
    # Domínios que nunca devem receber email (config/preferencias.yaml -> dominios_email_excluidos).
    for v in vagas:
        if excluidos and v.emails:
            v.emails = [e for e in v.emails if not dominio_excluido(e, excluidos)]
    log.info("coleta: %s -> %d únicas", coletadas, len(vagas))

    # 2. Filtros baratos (título, data) antes de baixar descrições
    descartes: Counter = Counter()
    candidatas: list[Vaga] = []
    for v in vagas:
        motivo = filtros.filtrar_titulo(v) or filtros.filtrar_data(v)
        if motivo:
            v.lista, v.motivo_descarte = "descartada", motivo
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

    # 5. Ranking (com o ajuste do que você já aplicou/descartou, quando houver banco)
    sb = Supabase.do_ambiente()
    aprendizado = None
    if sb:
        try:
            aprendizado = Aprendizado.de_linhas(sb.sinais_de_uso())
        except Exception as e:  # o aprendizado é um extra: sem ele, a nota é a de sempre
            log.warning("aprendizado: não li o histórico: %s", e)
    ranker = Ranker(perfil, curriculo, cfg, Embedder(forcar_tfidf=forcar_tfidf))
    ranker.ranquear(restantes, aprendizado)
    for v in restantes:
        if v.lista == "descartada":
            descartes["nota abaixo do mínimo"] += 1
    aprovadas = sorted([v for v in restantes if v.lista != "descartada"], key=lambda v: -(v.nota or 0))
    for v in aprovadas:
        if v.fonte == "linkedin":
            v.motivos.append(f"Post do LinkedIn com o email de quem está contratando ({v.email_contato})")
            if not v.modalidade and not v.cidade:
                v.motivos.append("O post não diz se é remoto nem a cidade: confira antes de enviar")
    # Funil por fonte: onde as vagas de cada fonte ficam pelo caminho (para calibrar filtros).
    for fonte in sorted({v.fonte for v in vagas}):
        da_fonte = [v for v in vagas if v.fonte == fonte]
        motivos = Counter((v.motivo_descarte or "aprovada").split(":")[0].split(" em ")[0] if v.lista == "descartada" or not v.lista
                          else "aprovada" for v in da_fonte)
        _anotar(f"Funil {fonte}: {len(da_fonte)} únicas -> {dict(motivos.most_common(8))}", destaque=False)
    # Sólides: só as de cargo de dados (a busca da Sólides é frouxa e traz de tudo).
    trilhas = [p for _, _, p in filtros.trilhas]
    dados_sol = [v for v in vagas if v.fonte == "solides" and any(p.search(normalizar(v.titulo)) for p in trilhas)]
    _anotar(f"Sólides, só cargos de dados: {len(dados_sol)} -> "
            f"{dict(Counter((v.motivo_descarte or 'aprovada').split(':')[0].split(' em ')[0] for v in dados_sol).most_common(6))}", destaque=False)
    # Amostra: vagas da Sólides com cargo de dados que ficaram de fora (o Actions mostra só 10 anotações por passo).
    amostra = [v for v in vagas if v.fonte == "solides" and v.trilha and v.lista == "descartada"]
    for v in amostra[:4]:
        _anotar(f"Sólides → {v.titulo[:70]} | {v.modalidade} {v.cidade or ''} | {v.motivo_descarte}", destaque=False)
    for v in li:  # o que aconteceu com cada post do LinkedIn (título e motivo, sem conteúdo)
        _anotar(f"LinkedIn → {v.titulo[:60]} | nota {v.nota} | {v.lista or 'ok'} | {v.motivo_descarte or ''}", destaque=False)
    _anotar(f"Aprovadas: {len(aprovadas)} ({sum(v.fonte == 'linkedin' for v in aprovadas)} do LinkedIn); "
            f"com email: {sum(bool(v.emails) for v in aprovadas)}")

    # Vagas aprovadas sem email: procura um email público de RH no site oficial da empresa.
    achados = 0
    for v in aprovadas:
        if v.emails or not v.site_empresa:
            continue
        r = buscar_email_empresa(v.site_empresa)
        if r and not dominio_excluido(r["email"], excluidos):
            v.emails = [r["email"]]
            v.email_origem = f"site_{r['tipo']}"
            v.motivos.append(f"Email {'de RH' if r['tipo'] == 'rh' else 'de contato geral'} encontrado no site da empresa ({r['pagina']})")
            achados += 1
    com_email = sum(bool(v.emails) for v in aprovadas)
    log.info("contato: %d emails achados em sites; %d de %d vagas com email", achados, com_email, len(aprovadas))

    execucao = {
        "duracao_s": round(time.monotonic() - inicio, 1),
        "coletadas": coletadas,
        "descartes": dict(descartes),
        "principal": sum(v.lista == "principal" for v in aprovadas),
        "vale_tentar": sum(v.lista == "vale_tentar" for v in aprovadas),
        "backend": ranker.emb.backend,
        "aprendizado": aprendizado.resumo() if aprendizado else None,
        "tipo": tipo,
    }

    # 6. Gravação
    caminho = salvar_json(aprovadas, execucao)
    # Descartadas na etapa de ranking/local: úteis para calibrar pesos e filtros.
    (caminho.parent / "descartadas.json").write_text(json.dumps(
        [{"titulo": v.titulo, "empresa": v.empresa, "fonte": v.fonte, "nota": v.nota, "motivo": v.motivo_descarte,
          "url": v.url, "componentes": v.componentes} for v in candidatas if v.lista == "descartada"],
        ensure_ascii=False, indent=1), encoding="utf-8")
    log.info("json: %s", caminho)
    if sb:
        # Novidade = não estava no banco antes desta coleta. Só elas entram no email de resumo.
        try:
            anteriores = sb.execucoes_recentes()  # antes de registrar esta, para comparar o volume
        except Exception as e:
            log.warning("saúde: não li as execuções anteriores: %s", e)
            anteriores = []
        existentes = sb.ids_existentes([v.id for v in aprovadas])
        corte = float(cfg.get("resumo", {}).get("nota_minima", 85))
        teste = os.getenv("RESUMO_TESTE") == "1"
        sb.upsert_vagas(aprovadas)
        _anotar(f"Vagas novas nesta coleta: {sum(v.id not in existentes for v in aprovadas)} "
                f"({sum(v.id not in existentes and bool(v.emails) for v in aprovadas)} com email)")
        fila = _para_fila(aprovadas, existentes, (cfg.get("envio") or {}).get("automatico") or {}, excluidos)
        if fila:
            try:
                _anotar(f"Modo automático: {sb.enfileirar(fila)} vaga(s) novas entraram na fila de envio")
            except Exception as e:
                log.warning("fila: não consegui enfileirar: %s", e)
        if tipo == "completa":
            try:
                para_resumo = _novas_para_resumo(sb, corte)
            except Exception as e:
                log.warning("resumo: não li as vagas novas do banco: %s", e)
                para_resumo = [v for v in aprovadas if v.id not in existentes and (v.nota or 0) >= corte]
            if teste and not para_resumo:
                # Resumo de teste (pedido no Actions): mostra o formato com as 3 melhores vagas atuais.
                para_resumo = [v for v in aprovadas if (v.nota or 0) >= corte][:3] or aprovadas[:3]
            pendentes = _followups_pendentes(sb)
            _anotar(f"Resumo: {len(para_resumo)} vaga(s) com nota {corte:g}+ desde a coleta completa anterior; "
                    f"{len(pendentes)} follow-up(s)")
            try:
                resumo_email.enviar(para_resumo, corte, pendentes, teste=teste)
            except Exception as e:  # o resumo é um extra: falha nele não pode derrubar a coleta
                log.warning("resumo: falha ao enviar: %s", e)
        sb.registrar_execucao(execucao)
        problemas = alerta.verificar_saude(execucao, anteriores)
        if li_info["erro"] and li_info["erro"] != "sem APIFY_TOKEN":
            problemas.append(f"Posts do LinkedIn: {li_info['erro']}. Confira o crédito em console.apify.com.")
        if problemas:
            log.warning("saúde: %s", problemas)
            try:
                alerta.enviar("Problema na coleta de vagas", problemas)
            except Exception as e:
                log.warning("alerta: falha ao enviar: %s", e)
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
    try:
        executar(forcar_tfidf=a.tfidf, usar_github=not a.sem_github, max_paginas=a.max_paginas)
    except Exception as e:
        # Erro que derruba a coleta inteira: avisa por email e deixa o Actions marcar a execução como falha.
        log.exception("coleta falhou")
        try:
            alerta.enviar("A coleta de vagas falhou", [f"Erro: {type(e).__name__}: {e}"])
        except Exception as e2:
            log.warning("alerta: falha ao enviar: %s", e2)
        raise


if __name__ == "__main__":
    main()
