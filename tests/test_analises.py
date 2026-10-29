"""Análises do site: o que estudar (habilidades) e mapa das vagas (grupos + 2D). Vagas fictícias."""
from __future__ import annotations

from pathlib import Path

import yaml

from coletor import analises
from coletor.modelos import Vaga
from coletor.ranking import Embedder

RAIZ = Path(__file__).resolve().parent.parent
CFG = yaml.safe_load((RAIZ / "tests/dados/preferencias.yaml").read_text(encoding="utf-8"))
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


def test_tipos_de_vaga_agrupa_por_tema():
    vs = vagas()
    t = analises.tipos_de_vaga(vs, Embedder(forcar_tfidf=True), CAT, CV, no_site={v.id for v in vs if v.lista == "principal"})
    assert len(t["grupos"]) == 3 and sum(g["vagas"] for g in t["grupos"]) == 21
    # ordem: do que mais combina (nota média) para o que menos
    notas = [g["nota_media"] for g in t["grupos"]]
    assert notas == sorted(notas, reverse=True)
    eng = next(g for g in t["grupos"] if g["trilha"] == "Engenharia de Dados")
    # todas as vagas de engenharia pedem Spark, Databricks, AWS e data lake, que não estão no currículo
    assert {f["nome"] for f in eng["falta"]} <= {"Spark", "Databricks", "AWS", "Data Warehouse"} and len(eng["falta"]) == 3
    assert all(f["pct"] == 100 for f in eng["falta"]) and "Python" in eng["tenho"]
    assert len(eng["exemplos"]) == 3 and eng["exemplos"][0]["nota"] >= eng["exemplos"][-1]["nota"]
    assert len({g["nome"] for g in t["grupos"]}) == 3  # nomes diferentes


def test_tipos_com_poucas_vagas_nao_quebra():
    assert analises.tipos_de_vaga(vagas(1), Embedder(forcar_tfidf=True), CAT, CV, set())["grupos"] == []
