"""Análises do mercado para o site: "Mapa das vagas" e "O que estudar".

Roda nas coletas completas, sobre as vagas abertas que passaram pelos filtros de área, nível e local
(as da lista e as que ficaram abaixo da nota mínima) mais as vagas da lista dos últimos 14 dias.

Mapa das vagas
- Cada vaga vira um vetor (embeddings do título e das frases da descrição, o mesmo modelo do ranking).
- K-means agrupa as vagas parecidas; o número de grupos (3 a 6, uns 10 vagas por grupo) é o de melhor silhueta.
- t-SNE leva os vetores para 2 dimensões (o gráfico). O currículo entra no mesmo espaço, como uma estrela.
- Nome de cada grupo: a trilha de cargo mais comum + as 2 habilidades que mais se destacam nele (lift).

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


# ------------------------------------------------------------------ mapa
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


def _em_2d(x: np.ndarray) -> np.ndarray:
    if len(x) >= 12:
        from sklearn.manifold import TSNE

        p = max(5.0, min(30.0, (len(x) - 1) / 3))
        xy = TSNE(n_components=2, perplexity=p, init="pca", metric="cosine", random_state=42).fit_transform(x)
    else:
        from sklearn.decomposition import PCA

        xy = PCA(n_components=2, random_state=42).fit_transform(x)
    lo, hi = xy.min(axis=0), xy.max(axis=0)
    return (xy - lo) / np.where(hi - lo == 0, 1, hi - lo)


def _nome_do_grupo(membros: list[int], vagas: list[Vaga], habs: list[set[str]], usados: set[str] | None = None) -> tuple[str, list[str]]:
    trilha = Counter(vagas[i].trilha or "Dados" for i in membros).most_common(1)[0][0]
    trilha = trilha.replace(" (genérico)", "").replace("Analista de Dados / BI", "Análise de dados e BI")
    total = Counter(h for hs in habs for h in hs)
    no_grupo = Counter(h for i in membros for h in habs[i])
    n, m = len(habs), len(membros)
    # lift: quanto a habilidade aparece mais no grupo do que no conjunto (com um mínimo de presença)
    lift = sorted(((no_grupo[h] / m) / (total[h] / n), h) for h in no_grupo if no_grupo[h] >= max(2, 0.25 * m))
    candidatos = [h for _, h in reversed(lift)] or [h for h, _ in no_grupo.most_common(4)]
    usados = usados or set()
    # Dois grupos não podem ter o mesmo nome: se já existe, usa os próximos termos que mais se destacam.
    for i in range(0, max(1, len(candidatos) - 1)):
        termos = candidatos[i:i + 2]
        nome = f"{trilha} · {' e '.join(termos)}" if termos else trilha
        if nome not in usados:
            break
    if nome in usados:
        nome = f"{nome} ({len(usados) + 1})"
    return nome, [h for h, _ in no_grupo.most_common(5)]


def mapa(vagas: list[Vaga], emb, cv_frases: list[str], catalogo: dict[str, re.Pattern], no_site: set[str]) -> dict:
    if len(vagas) < 6:
        return {"pontos": [], "grupos": [], "cv": None, "vagas": len(vagas)}
    frases = [frases_relevantes(f"{v.titulo}.\n{v.descricao}")[:12] or [v.titulo] for v in vagas]
    textos = cv_frases + [v.titulo for v in vagas] + [f for fs in frases for f in fs]
    m = emb.codificar(textos)
    cv = m[: len(cv_frases)].mean(axis=0)
    cv = cv / max(float(np.linalg.norm(cv)), 1e-9)
    pos = len(cv_frases)
    titulos = m[pos: pos + len(vagas)]
    pos += len(vagas)
    vetores = []
    for t, fs in zip(titulos, frases):
        vetores.append(_vetor_vaga(t, m[pos: pos + len(fs)]))
        pos += len(fs)
    x = np.stack(vetores)
    k, rotulos = _escolher_k(x)
    xy = _em_2d(np.vstack([x, cv]))
    habs = [habilidades_da_vaga(v, catalogo)[0] for v in vagas]
    sim_cv = x @ cv

    grupos = []
    for g in range(k):
        membros = [i for i in range(len(vagas)) if rotulos[i] == g]
        if not membros:
            continue
        nome, principais = _nome_do_grupo(membros, vagas, habs, {g["nome"] for g in grupos})
        notas = [vagas[i].nota for i in membros if vagas[i].nota is not None]
        grupos.append({"id": int(g), "nome": nome, "vagas": len(membros), "habilidades": principais,
                       "proximidade": round(float(np.mean(sim_cv[membros])), 3),
                       "nota_media": round(sum(notas) / len(notas), 1) if notas else None,
                       "na_lista": sum(1 for i in membros if vagas[i].lista in ("principal", "vale_tentar"))})
    # Grupos do mais perto do seu currículo para o mais longe (vira a ordem das cores e da legenda).
    grupos.sort(key=lambda g: -g["proximidade"])
    ordem = {g["id"]: i for i, g in enumerate(grupos)}
    for g in grupos:
        g["id"] = ordem[g["id"]]
    pontos = [{
        "id": v.id, "titulo": v.titulo[:120], "empresa": (v.empresa or "")[:80], "url": v.url, "nota": v.nota,
        "lista": v.lista if v.lista in ("principal", "vale_tentar") else "fora",
        "no_site": v.id in no_site, "x": round(float(xy[i, 0]), 4), "y": round(float(xy[i, 1]), 4),
        "grupo": ordem[int(rotulos[i])],
    } for i, v in enumerate(vagas)]
    return {"pontos": pontos, "grupos": grupos, "cv": {"x": round(float(xy[-1, 0]), 4), "y": round(float(xy[-1, 1]), 4)},
            "vagas": len(vagas), "k": k, "metodo": f"embeddings ({emb.backend}) + k-means + t-SNE"}


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


def gerar(sb, restantes: list[Vaga], emb, cv_frases: list[str], cv_texto: str, cfg: dict) -> dict:
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
    mapa_ = {**mapa(vagas, emb, cv_frases, catalogo, no_site), "gerado_em": agora}
    sb.salvar_analise("estudar", estudar)
    sb.salvar_analise("mapa", mapa_)
    return {"vagas": len(vagas), "grupos": len(mapa_["grupos"]), "habilidades": len(estudar["habilidades"])}

