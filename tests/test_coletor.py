from datetime import datetime, timedelta, timezone
from pathlib import Path

import yaml

from coletor.filtros import Filtros
from coletor.modelos import Vaga
from coletor.ranking import Embedder, Ranker
from coletor.texto import extrair_emails, limpar_html

RAIZ = Path(__file__).resolve().parent.parent
CFG = yaml.safe_load((RAIZ / "config/preferencias.yaml").read_text(encoding="utf-8"))
PERFIL = yaml.safe_load((RAIZ / "perfil/perfil.yaml").read_text(encoding="utf-8"))
CV = (RAIZ / "perfil/curriculo.md").read_text(encoding="utf-8")
F = Filtros.de_config(CFG)


def vaga(titulo, descricao="", modalidade="remoto", cidade=None, emails=None, dias=1):
    return Vaga(fonte="teste", id_origem=titulo, titulo=titulo, empresa="ACME", url="https://x",
                descricao=descricao, modalidade=modalidade, cidade=cidade, emails=emails or [],
                publicada_em=datetime.now(timezone.utc) - timedelta(days=dias))


def test_titulos():
    assert F.filtrar_titulo(vaga("Analista de Dados Júnior")) is None
    assert F.filtrar_titulo(vaga("Analista de BI Jr")) is None
    assert F.filtrar_titulo(vaga("Engenheiro(a) de Dados I")) is None
    assert F.filtrar_titulo(vaga("Cientista de Dados Sênior")).startswith("senioridade")
    assert F.filtrar_titulo(vaga("Analista de Dados Pleno")).startswith("senioridade")
    assert F.filtrar_titulo(vaga("Desenvolvedor Python Jr")).startswith("bloqueio")
    assert F.filtrar_titulo(vaga("Desenvolvedor .NET Júnior")) is not None
    assert F.filtrar_titulo(vaga("Estagiário de Dados")).startswith("senioridade")
    assert F.filtrar_titulo(vaga("Analista Ambiental Junior")) == "título fora das trilhas de dados"
    v = vaga("Analista de BI Júnior")
    F.filtrar_titulo(v)
    assert v.trilha == "Analista de Dados / BI" and v.nivel == "junior"


def test_local():
    assert F.filtrar_local(vaga("x", modalidade="remoto")) is None
    assert F.filtrar_local(vaga("x", modalidade="hibrido", cidade="Goiânia")) is None
    assert F.filtrar_local(vaga("x", modalidade="presencial", cidade="São Paulo")) is not None
    assert F.filtrar_local(vaga("x", "Trabalho 100% remoto", modalidade=None)) is None


def test_experiencia_e_data():
    assert F.filtrar_experiencia(vaga("x", "Experiência de 1 a 3 anos com SQL")) is None
    assert F.filtrar_experiencia(vaga("x", "Mínimo 5 anos de experiência em BI")) is not None
    assert F.filtrar_data(vaga("x", dias=40)) is not None


def test_texto():
    assert limpar_html("<p>A</p><ul><li>B &amp; C</li></ul>") == "A\nB & C"
    assert extrair_emails("Envie para rh@empresa.com.br ou noreply@x.com") == ["rh@empresa.com.br"]


def test_dedup_gupy_remotar():
    import base64, json
    from coletor.pipeline import _deduplicar

    token = base64.urlsafe_b64encode(json.dumps({"jobId": 123, "source": "remotar"}).encode()).decode().rstrip("=")
    g = Vaga(fonte="gupy", id_origem="123", titulo="Analista de Dados", empresa="X", url="https://x.gupy.io/job/abc")
    r = Vaga(fonte="remotar", id_origem="9", titulo="Analista de Dados", empresa="Vagas X",
             url=f"https://x.gupy.io/job/{token}")
    assert len(_deduplicar([g, r])) == 1


def test_ranking_ordena_por_aderencia():
    boa = vaga("Analista de BI Júnior",
               "Requisitos:\n- SQL avançado e Power BI com DAX\n- Python com Pandas para tratamento de dados\n"
               "- Construção de dashboards de indicadores (KPIs) para a diretoria\n- Desejável: Airflow e BigQuery")
    media = vaga("Cientista de Dados Jr",
                 "Requisitos:\n- Python e estatística\n- Experiência com Spark e Databricks obrigatória\n"
                 "- AWS (S3, Glue)\n- Modelos de machine learning em produção")
    fraca = vaga("Analista de Dados", "Atuar no atendimento a clientes e rotinas administrativas do escritório.")
    for v in (boa, media, fraca):
        assert F.filtrar_titulo(v) is None
    r = Ranker(PERFIL, CV, CFG, Embedder(forcar_tfidf=True))
    r.ranquear([boa, media, fraca])
    assert boa.nota > media.nota > fraca.nota
    assert boa.lista == "principal"
    assert media.lista in ("vale_tentar", "descartada")
    assert "spark" in media.habilidades_faltando
    assert any("Power" in m or "power" in m for m in boa.motivos)
