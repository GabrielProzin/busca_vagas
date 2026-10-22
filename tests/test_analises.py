"""Análises do site: o que estudar (habilidades) e mapa das vagas (grupos + 2D). Vagas fictícias."""
from __future__ import annotations

from pathlib import Path

import yaml

from coletor import analises
from coletor.modelos import Vaga
from coletor.ranking import Embedder

RAIZ = Path(__file__).resolve().parent.parent
CFG = yaml.safe_load((RAIZ / "config/preferencias.yaml").read_text(encoding="utf-8"))
CAT = analises.carregar_catalogo(CFG)
CV = "Python, SQL, Power BI, DAX, Airflow, BigQuery, Docker. Pipelines ETL e dashboards de KPIs."

TEMAS = {
    "bi": ("Analista de BI Júnior", "Análise de Dados / BI",
           "Criar dashboards no Power BI com DAX. Consultas SQL. Indicadores e KPIs para a diretoria. Excel avançado."),
    "eng": ("Engenheiro de Dados Júnior", "Engenharia de Dados",
            "Pipelines de dados com Spark e Databricks na AWS. Python e SQL. Data lake e orquestração com Airflow."),
    "ml": ("Cientista de Dados Júnior", "Ciência de Dados",
           "Modelos de machine learning com scikit-learn. Estatística e testes de hipótese. Python e pandas. NLP."),
}


def vagas(por_tema=7):
    lista = []
    for tema, (titulo, trilha, desc) in TEMAS.items():
        for i in range(por_tema):
            lista.append(Vaga(fonte="teste", id_origem=f"{tema}{i}", titulo=f"{titulo} {i}", empresa=f"Empresa {i}",
                              url="https://x", descricao=f"{desc} Vaga número {i} da equipe {tema}.", trilha=trilha,
                              nota=80 - i, lista="principal" if i < 3 else "descartada"))
    return lista


def test_habilidades_exigidas_e_diferenciais():
    v = Vaga(fonte="t", id_origem="1", titulo="Analista de Dados", empresa="", url="",
             descricao="Requisitos: SQL e Python.\nDiferencial: conhecimento em Spark.")
    exigidas, dif = analises.habilidades_da_vaga(v, CAT)
    assert {"SQL", "Python"} <= exigidas and "Spark" in dif and "Spark" not in exigidas


def test_o_que_estudar():
    r = analises.o_que_estudar(vagas(), CV, CAT, anterior={"habilidades": [{"nome": "Spark", "pct": 10.0}]})
    por = {h["nome"]: h for h in r["habilidades"]}
    assert r["vagas"] == 21
    assert por["Python"]["tenho"] and por["Python"]["destravaria"] == 0
    assert not por["Spark"]["tenho"] and por["Spark"]["vagas"] == 7 and por["Spark"]["pct"] == 33.3
    assert por["Spark"]["variacao"] == 23.3
    # nas vagas de BI, só falta Excel: aprender Excel deixaria as 7 completas
    assert por["Excel"]["destravaria"] == 7


def test_mapa_agrupa_por_tema():
    vs = vagas()
    m = analises.mapa(vs, Embedder(forcar_tfidf=True), [CV], CAT, no_site={v.id for v in vs if v.lista == "principal"})
    assert len(m["pontos"]) == 21 and 2 <= len(m["grupos"]) <= 7 and m["cv"]
    assert all(0 <= p["x"] <= 1 and 0 <= p["y"] <= 1 for p in m["pontos"])
    # vagas do mesmo tema caem no mesmo grupo
    for tema in TEMAS:
        assert len({p["grupo"] for p in m["pontos"] if p["id"].startswith(f"teste:{tema}")}) == 1
    # grupos ordenados do mais perto do currículo para o mais longe, com nome legível
    prox = [g["proximidade"] for g in m["grupos"]]
    assert prox == sorted(prox, reverse=True) and all(" · " in g["nome"] or g["nome"] for g in m["grupos"])
    assert sum(p["no_site"] for p in m["pontos"]) == 9


def test_mapa_com_poucas_vagas_nao_quebra():
    assert analises.mapa(vagas(1), Embedder(forcar_tfidf=True), [CV], CAT, set())["pontos"] == []
