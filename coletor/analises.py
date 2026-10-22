"""Análises do mercado para o site: "Tipos de vaga" e "O que estudar".

Roda nas coletas completas, sobre as vagas abertas que passaram pelos filtros de área, nível e local
(as da lista e as que ficaram abaixo da nota mínima) mais as vagas da lista dos últimos 14 dias.

Tipos de vaga
- Cada vaga vira um vetor (embeddings do título e das frases da descrição, o mesmo modelo do ranking).
- K-means agrupa as vagas parecidas; o número de grupos (3 a 6, uns 10 vagas por grupo) é o de melhor silhueta.
- Nome de cada tipo: a trilha de cargo mais comum + as 2 habilidades que mais se destacam nele (lift).
- Para cada tipo: quantas vagas, quantas na sua lista, nota média (o quanto combina com o seu currículo), o que você
  já tem e o que mais falta.

O que estudar
- Para cada habilidade do catálogo (config/preferencias.yaml -> catalogo_habilidades): em quantas vagas ela é pedida,
  se você tem (aparece no currículo), em quantas é a ÚNICA que falta ("destravaria") e a variação desde a última análise.
"""
from __future__ import annotations

import logging
import re
from collections import Counter
from datetime import datetime, timezone

import numpy as np

from .modelos import Vaga
from .ranking import _DIFERENCIAL, _vetor_vaga
from .texto import compilar, frases_relevantes, normalizar

log = logging.getLogger(__name__)


# ------------------------------------------------------------------ habilidades
def carregar_catalogo(cfg: dict) -> dict[str, re.Pattern]:
    return {nome: compilar(padroes) for nome, padroes in (cfg.get("catalogo_habilidades") or {}).items()}


def habilidades_da_vaga(v: Vaga, catalogo: dict[str, re.Pattern]) -> tuple[set[str], set[str]]:
    """(exigidas, só diferenciais). Uma habilidade citada só em frases de "diferencial" não conta como exigida."""
    texto = normalizar(f"{v.titulo}\n{v.descricao}")
    frases = [f for f in re.split(r"[\n.;]", texto) if f.strip()]
    exigidas, diferenciais = set(), set()
    for nome, padrao in catalogo.items():
        ocorrencias = [f for f in frases if padrao.search(f)]
        if not ocorrencias:
            continue
        (diferenciais if all(_DIFERENCIAL.search(f) for f in ocorrencias) else exigidas).add(nome)
    return exigidas, diferenciais


def o_que_estudar(vagas: list[Vaga], cv_texto: str, catalogo: dict[str, re.Pattern], anterior: dict | None = None) -> dict:
    cv = normalizar(cv_texto)
    tenho = {nome for nome, p in catalogo.items() if p.search(cv)}
    pedidas = [habilidades_da_vaga(v, catalogo) for v in vagas]
    n = len(vagas)
    antes = {h["nome"]: h["pct"] for h in (anterior or {}).get("habilidades", [])}
    linhas = []
    for nome in catalogo:
        idx = [i for i, (ex, _) in enumerate(pedidas) if nome in ex]
        dif = sum(1 for ex, d in pedidas if nome in d and nome not in ex)
        if not idx and not dif:
            continue
        unica = sum(1 for i in idx if (pedidas[i][0] - tenho) == {nome})
        notas = [vagas[i].nota for i in idx if vagas[i].nota is not None]
        pct = round(100 * len(idx) / n, 1) if n else 0.0
        linhas.append({
            "nome": nome, "tenho": nome in tenho, "vagas": len(idx), "pct": pct, "diferencial": dif,
            "destravaria": 0 if nome in tenho else unica,
            "nota_media": round(sum(notas) / len(notas), 1) if notas else None,
            "variacao": round(pct - antes[nome], 1) if nome in antes else None,
            "exemplos": list(dict.fromkeys(vagas[i].titulo for i in idx))[:3],  # títulos sem repetir
        })
    linhas.sort(key=lambda h: (-h["vagas"], h["nome"]))
    completas = sum(1 for ex, _ in pedidas if not (ex - tenho))
    return {"vagas": n, "completas": completas, "habilidades": linhas}


# ------------------------------------------------------------------ tipos de vaga
def _escolher_k(x: np.ndarray, minimo: int = 3, maximo: int = 6) -> tuple[int, np.ndarray]:
    from sklearn.cluster import KMeans
    from sklearn.metrics import silhouette_score

    melhor = (None, -2.0, None)
    # Pelo menos ~10 vagas por grupo: mais grupos que isso vira ruído.
    for k in range(minimo, max(minimo, min(maximo, len(x) // 10)) + 1):
        if k >= len(x):
            break
        rotulos = KMeans(n_clusters=k, n_init=10, random_state=42).fit_predict(x)
        nota = silhouette_score(x, rotulos, metric="cosine") if len(set(rotulos)) > 1 else -1
        if nota > melhor[1]:
            melhor = (k, nota, rotulos)
    if melhor[0] is None:
        return 1, np.zeros(len(x), dtype=int)
    return melhor[0], melhor[2]


def _nome_do_grupo(membros: list[int], vagas: list[Vaga], habs: list[set[str]], usados: set[str]) -> tuple[str, list[str]]:
    """(trilha, 2 termos): trilha de cargo mais comum + as habilidades que mais se destacam no grupo (lift)."""
    trilha = Counter(vagas[i].trilha or "Dados" for i in membros).most_common(1)[0][0]
    trilha = trilha.replace(" (genérico)", "").replace("Analista de Dados / BI", "Análise de dados e BI")
    total = Counter(h for hs in habs for h in hs)
    no_grupo = Counter(h for i in membros for h in habs[i])
    n, m = len(habs), len(membros)
    lift = sorted(((no_grupo[h] / m) / (total[h] / n), h) for h in no_grupo if no_grupo[h] >= max(2, 0.25 * m))
    candidatos = [h for _, h in reversed(lift)] or [h for h, _ in no_grupo.most_common(4)]
    # Dois tipos não podem ter o mesmo nome: se já existe, usa os próximos termos que mais se destacam.
    termos = candidatos[:2]
    for i in range(0, max(1, len(candidatos) - 1)):
        termos = candidatos[i:i + 2]
        if f"{trilha} · {' e '.join(termos)}" not in usados:
            break
    return trilha, termos


def tipos_de_vaga(vagas: list[Vaga], emb, catalogo: dict[str, re.Pattern], cv_texto: str, no_site: set[str]) -> dict:
    """Tipos de vaga, do que mais combina com o seu currículo (nota média) para o que menos."""
    if len(vagas) < 6:
        return {"grupos": [], "vagas": len(vagas)}
    frases = [frases_relevantes(f"{v.titulo}.\n{v.descricao}")[:12] or [v.titulo] for v in vagas]
    m = emb.codificar([v.titulo for v in vagas] + [f for fs in frases for f in fs])
    pos, vetores = len(vagas), []
    for t, fs in zip(m[: len(vagas)], frases):
        vetores.append(_vetor_vaga(t, m[pos: pos + len(fs)]))
        pos += len(fs)
    k, rotulos = _escolher_k(np.stack(vetores))
    habs = [habilidades_da_vaga(v, catalogo)[0] for v in vagas]
    cv = normalizar(cv_texto)
    tenho = {nome for nome, p in catalogo.items() if p.search(cv)}

    grupos, usados = [], set()
    for g in range(k):
        membros = [i for i in range(len(vagas)) if rotulos[i] == g]
        if not membros:
            continue
        trilha, termos = _nome_do_grupo(membros, vagas, habs, usados)
        nome = f"{trilha} · {' e '.join(termos)}" if termos else trilha
        usados.add(nome)
        pedidas = Counter(h for i in membros for h in habs[i])
        notas = [vagas[i].nota for i in membros if vagas[i].nota is not None]
        da_lista = sorted((i for i in membros if vagas[i].id in no_site), key=lambda i: -(vagas[i].nota or 0))
        grupos.append({
            "nome": nome, "trilha": trilha, "termos": " e ".join(termos), "vagas": len(membros),
            "na_lista": sum(1 for i in membros if vagas[i].lista in ("principal", "vale_tentar")),
            "nota_media": round(sum(notas) / len(notas), 1) if notas else None,
            # o que esse tipo de vaga mais pede: o que você tem e o que falta (com % das vagas do tipo)
            "tenho": [h for h, _ in pedidas.most_common() if h in tenho][:4],
            "falta": [{"nome": h, "pct": round(100 * c / len(membros))} for h, c in pedidas.most_common() if h not in tenho][:3],
            "exemplos": [{"id": vagas[i].id, "titulo": vagas[i].titulo[:120], "empresa": (vagas[i].empresa or "")[:80],
                          "nota": vagas[i].nota} for i in da_lista[:5]],
        })
    grupos.sort(key=lambda x: -(x["nota_media"] or 0))
    return {"grupos": grupos, "vagas": len(vagas), "k": k, "metodo": f"embeddings ({emb.backend}) + k-means (silhueta)"}


# ------------------------------------------------------------------ juntando tudo
def conjunto(restantes: list[Vaga], recentes: list[dict]) -> list[Vaga]:
    """Vagas desta coleta que passaram pelos filtros + as da lista dos últimos dias que não vieram agora."""
    vistos = {v.id for v in restantes}
    extra = []
    for d in recentes:
        if d["id"] in vistos or not d.get("descricao"):
            continue
        fonte, _, origem = d["id"].partition(":")
        extra.append(Vaga(fonte=fonte, id_origem=origem, titulo=d.get("titulo") or "", empresa=d.get("empresa") or "",
                          url=d.get("url") or "", descricao=d.get("descricao") or "", nota=d.get("nota"),
                          lista=d.get("lista"), trilha=d.get("trilha")))
    return [*restantes, *extra]


def gerar(sb, restantes: list[Vaga], emb, cv_texto: str, cfg: dict) -> dict:
    catalogo = carregar_catalogo(cfg)
    try:
        recentes = sb.vagas_recentes(14)
    except Exception as e:
        log.warning("análises: não li as vagas recentes: %s", e)
        recentes = []
    vagas = conjunto(restantes, recentes)
    no_site = {d["id"] for d in recentes} | {v.id for v in restantes if v.lista in ("principal", "vale_tentar")}
    agora = datetime.now(timezone.utc).isoformat()
    anterior = None
    try:
        anterior = sb.ler_analise("estudar")
    except Exception:
        pass
    estudar = {**o_que_estudar(vagas, cv_texto, catalogo, anterior), "gerado_em": agora}
    tipos = {**tipos_de_vaga(vagas, emb, catalogo, cv_texto, no_site), "gerado_em": agora}
    sb.salvar_analise("estudar", estudar)
    sb.salvar_analise("tipos", tipos)
    return {"vagas": len(vagas), "grupos": len(tipos["grupos"]), "habilidades": len(estudar["habilidades"])}

