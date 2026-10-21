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


def test_idioma_e_senioridade_na_descricao():
    en = vaga("Data Analyst", "We are looking for a data analyst to join our team. You will work with the "
              "product team and our stakeholders. Requirements: experience with SQL, skills in Python, "
              "and the ability to work with data in a fast-paced environment. This is your chance to grow with us.")
    assert F.filtrar_idioma(en) == "vaga em inglês"
    pt = vaga("Analista de Dados", "Buscamos uma pessoa para atuar com dados e conhecimento em SQL e Power BI.")
    assert F.filtrar_idioma(pt) is None
    s = vaga("Engenheiro de Dados", "Profissional sênior para liderar o time. Perfil sênior, inglês avançado.")
    assert F.filtrar_senioridade_descricao(s) == "descrição indica pleno/sênior"
    j = vaga("Analista de Dados", "Vaga para início de carreira, nível júnior.")
    assert F.filtrar_senioridade_descricao(j) is None and j.nivel == "junior"
    assert F.filtrar_titulo(vaga("Arquiteto de Dados")).startswith("senioridade")


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


def test_resumo_email():
    from coletor.resumo import montar

    a = vaga("Analista de BI Júnior", emails=["rh@x.com.br"])
    a.nota, a.habilidades_ok = 92.4, ["power_bi", "sql"]
    b = vaga("Engenheiro de Dados Jr")
    b.nota = 87
    msg = montar([b, a], "https://exemplo.vercel.app/", 85)
    assert msg["Subject"] == "busca_vagas: 2 vagas novas com nota 85+"
    texto = msg.get_body(("plain",)).get_content()
    assert texto.index("Analista de BI") < texto.index("Engenheiro")  # ordenado pela nota
    assert "https://exemplo.vercel.app/vaga/teste%3AAnalista%20de%20BI%20J%C3%BAnior" in texto
    html = msg.get_body(("html",)).get_content()
    assert "Tem email do recrutador" in html and "power bi" in html


def test_saude_da_coleta():
    from coletor.alerta import verificar_saude

    normal = {"coletadas": {"gupy": 340, "remotar": 580, "github": 3}, "backend": "fastembed"}
    historico = [{"coletadas": {"gupy": 330, "remotar": 570}}] * 5
    assert verificar_saude(normal, historico) == []
    quebrada = {"coletadas": {"gupy": 0, "remotar": 300, "github": 0}, "backend": "tfidf"}
    p = verificar_saude(quebrada, historico)
    assert any("gupy" in x for x in p) and any("média" in x for x in p) and any("TF-IDF" in x for x in p)
    assert not any("github" in x for x in p)  # fonte secundária vazia não é crítico


def test_contato_so_emails_de_setor():
    from coletor.contato import _classificar, _dominio

    assert _dominio("www.empresa.com.br") == "empresa.com.br"
    assert _classificar("rh@empresa.com.br", "empresa.com.br") == "rh"
    assert _classificar("talentos.ti@empresa.com.br", "empresa.com.br") == "rh"
    assert _classificar("maria.souza@empresa.com.br", "empresa.com.br") is None  # pessoa: nunca
    assert _classificar("rh@outra.com.br", "empresa.com.br") is None  # outro domínio: nunca
    assert _classificar("contato@empresa.com.br", "empresa.com.br") == "contato"
