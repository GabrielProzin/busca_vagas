from datetime import datetime, timedelta, timezone
from pathlib import Path

import yaml

from coletor.filtros import Filtros
from coletor.modelos import Vaga
from coletor.ranking import Embedder, Ranker
from coletor.texto import extrair_emails, limpar_html

RAIZ = Path(__file__).resolve().parent.parent
CFG = yaml.safe_load((RAIZ / "config/preferencias.yaml").read_text(encoding="utf-8"))
# Perfil fictício e fixo: o perfil/ de verdade muda em cada cópia (assistente de instalação) e não pode quebrar os testes.
PERFIL = yaml.safe_load((RAIZ / "tests/dados/perfil.yaml").read_text(encoding="utf-8"))
CV = (RAIZ / "tests/dados/curriculo.md").read_text(encoding="utf-8")
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
    assert "Tem email do recrutador" in html and "Power BI" in html


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


def test_solides_para_vaga():
    from coletor.fontes.solides import _para_vaga

    j = {"id": 1, "slug": "acme", "title": "Analista de Dados", "description": "<p>SQL e Power BI</p>", "companyName": "ACME",
         "city": {"name": "Goiânia"}, "state": {"code": "GO"}, "homeOffice": False, "jobType": "hibrido",
         "seniority": [{"name": "Pleno"}], "hardSkills": [{"name": "Python"}], "createdAt": "2026-10-20"}
    v = _para_vaga(j, "dados")
    assert v.url == "https://acme.vagas.solides.com.br/vaga/1" and v.modalidade == "hibrido" and v.cidade == "Goiânia"
    assert "Pleno" in v.titulo and F.filtrar_titulo(v).startswith("senioridade")  # nível do campo separado é respeitado
    assert "Python" in v.descricao


# ---------------------------------------------------------------- aprendizado e follow-up
from coletor import followup, resumo  # noqa: E402
from coletor.aprendizado import Aprendizado  # noqa: E402

BI = "Construir dashboards no Power BI, medidas DAX e relatórios gerenciais para a diretoria comercial."
ENG = "Construir pipelines de dados em Spark e Kafka, orquestrar com Airflow e manter o data lake na AWS."


def _linhas(n_bi, n_eng):
    linhas = [{"status": "aplicada", "vaga": {"id": f"bi{i}", "titulo": f"Analista de BI Júnior {i}", "descricao": BI}} for i in range(n_bi)]
    linhas += [{"status": "descartada", "vaga": {"id": f"en{i}", "titulo": f"Engenheiro de Dados Júnior {i}", "descricao": ENG}} for i in range(n_eng)]
    return linhas


def test_aprendizado_desligado_com_poucos_exemplos():
    a = Aprendizado.de_linhas(_linhas(2, 5))
    assert not a.pode_treinar
    r = Ranker(PERFIL, CV, CFG, Embedder(forcar_tfidf=True))
    v = vaga("Analista de BI Júnior", BI)
    r.ranquear([v], a)
    assert "historico" not in v.componentes and not a.ativo


def test_aprendizado_puxa_para_o_que_voce_aplica():
    a = Aprendizado.de_linhas(_linhas(6, 6))
    r = Ranker(PERFIL, CV, CFG, Embedder(forcar_tfidf=True))
    bi, eng = vaga("Analista de BI Júnior", BI), vaga("Engenheiro de Dados Júnior", ENG)
    r.ranquear([bi, eng], a)
    assert a.ativo and a.acerto == 1.0
    assert bi.componentes["historico"] > 0 > eng.componentes["historico"]
    assert abs(bi.componentes["historico"]) <= a.max_pontos
    for v in (bi, eng):  # a nota é a soma de sempre mais o ajuste do histórico
        c = v.componentes
        base = 100 * (0.45 * c["semantica"] + 0.40 * c["habilidades"] + 0.15 * c["trilha"]) + (5 if v.nivel == "junior" else 0)
        assert abs(v.nota - (base + c["historico"])) < 0.2
    assert any("você aplicou" in m for m in bi.motivos) and any("você descartou" in m for m in eng.motivos)


def test_followup():
    agora = datetime(2026, 10, 21, 12, tzinfo=timezone.utc)
    antes = lambda d: (agora - timedelta(days=d)).isoformat()  # noqa: E731
    assert followup.situacao({"status": "enviada", "enviada_em": antes(9)}, agora) is None
    assert followup.situacao({"status": "enviada", "enviada_em": antes(16)}, agora) == ("followup", 16)
    assert followup.situacao({"status": "aplicada", "enviada_em": antes(40), "followup_em": antes(5), "followups": 1}, agora) is None
    assert followup.situacao({"status": "aplicada", "enviada_em": antes(60), "followup_em": antes(17), "followups": 2}, agora) == ("encerrar", 17)
    assert followup.situacao({"status": "entrevista", "enviada_em": antes(30)}, agora) is None


def test_resumo_so_com_followup():
    m = resumo.montar([], "https://site", 85, [{"id": "gupy:1", "titulo": "Analista de BI", "empresa": "ACME",
                                                "status": "enviada", "tipo": "followup", "dias": 9}])
    assert m["Subject"] == "busca_vagas: 1 candidatura pede follow-up"
    texto = m.get_body(("plain",)).get_content()
    assert "Email enviado há 9 dias" in texto and "https://site/vaga/gupy%3A1" in texto


# ---------------------------------------------------------------- posts do LinkedIn
from coletor.fontes import linkedin_posts  # noqa: E402

TRILHAS = [p for _, _, p in F.trilhas]


def _post(texto, info="Tech Recruiter na Mynd8 | Pessoas", id_="7390"):
    return {"id": id_, "linkedinUrl": f"https://www.linkedin.com/posts/x-{id_}", "content": texto,
            "author": {"name": "Ana Souza", "info": info}, "postedAt": {"timestamp": "1761058800000"}}


def test_post_de_vaga_com_email_vira_vaga():
    texto = ("🚀 VAGA ABERTA | Analista de Dados Júnior | 100% Remoto\n\nEstamos contratando para o time de BI. "
             "Requisitos: SQL, Power BI e Python.\nInteressados, enviem o currículo para vagas@mynd8.com.br "
             "com o assunto 'Analista de Dados Jr'. #vagas #dados")
    v, motivo = linkedin_posts.post_para_vaga(_post(texto), TRILHAS, "busca")
    assert motivo == "" and v.titulo == "Analista de Dados Júnior"
    assert v.empresa == "Mynd8" and v.emails == ["vagas@mynd8.com.br"] and v.fonte == "linkedin"
    assert F.filtrar_titulo(v) is None and v.nivel == "junior"


def test_post_frase_longa_e_empresa_pelo_email():
    texto = ("Bom dia, rede! Estamos buscando Analista de BI Jr para atuar em Goiânia no modelo híbrido. "
             "Mande seu CV para rh@acmelog.com.br até sexta.")
    v, _ = linkedin_posts.post_para_vaga(_post(texto, info="Gerente de RH"), TRILHAS, "b")
    assert v.titulo.lower().startswith("analista de bi jr") and v.empresa == "Acmelog"


def test_posts_descartados():
    candidato = "Estou em busca de uma oportunidade como Analista de Dados Júnior! Meu email: joao@gmail.com #opentowork"
    assert linkedin_posts.post_para_vaga(_post(candidato), TRILHAS, "b") == (None, "post de candidato")
    sem_email = "Vaga de Analista de Dados Júnior, candidate-se pelo link."
    assert linkedin_posts.post_para_vaga(_post(sem_email), TRILHAS, "b") == (None, "post sem email")
    fora = "Vaga: Vendedor externo. Currículo para rh@loja.com.br"
    assert linkedin_posts.post_para_vaga(_post(fora), TRILHAS, "b") == (None, "cargo fora das trilhas")


def test_local_nao_informado_aceito_so_no_linkedin():
    v = vaga("Analista de Dados", "Envie o currículo para rh@x.com", modalidade=None)
    assert F.filtrar_local(v) == "local não informado"
    v.fonte = "linkedin"
    assert F.filtrar_local(v) is None


def test_post_presencial_em_outro_estado_sai():
    # caso real: post do LinkedIn sem cidade estruturada, "100% presencial, Perus – SP"
    v = vaga("Power BI", "Analista de qualidade logística. Condições: CLT, 100% presencial, Perus – SP. Envie para rh@x.com",
             modalidade=None)
    v.fonte = "linkedin"
    assert F.filtrar_local(v) == "presencial em SP"
    v = vaga("Analista de Dados", "Vaga presencial na Avenida Paulista, São Paulo. Envie para rh@x.com", modalidade=None)
    v.fonte = "linkedin"
    assert F.filtrar_local(v) == "presencial em SP"
    # remoto continua valendo mesmo citando a cidade da empresa
    v = vaga("Analista de Dados", "Empresa de São Paulo/SP contrata, 100% remoto.", modalidade=None)
    assert F.filtrar_local(v) is None
    # a sua região continua valendo
    v = vaga("Analista de Dados", "Presencial em Goiânia - GO.", modalidade=None)
    assert F.filtrar_local(v) is None
    # palavra comum em maiúscula não vira estado ("SE" só conta colado num local)
    v = vaga("Analista de Dados", "SE VOCÊ GOSTA DE DADOS, envie para rh@x.com", modalidade=None)
    v.fonte = "linkedin"
    assert F.filtrar_local(v) is None


def test_linkedin_sem_token_nao_roda():
    vagas, info = linkedin_posts.coletar({"buscas": ["x"]}, TRILHAS, token="")
    assert vagas == [] and info["erro"] == "sem APIFY_TOKEN"


def test_nota_minima_menor_para_posts_do_linkedin():
    r = Ranker(PERFIL, CV, CFG, Embedder(forcar_tfidf=True))
    assert r.minima_por_fonte["linkedin"] == 40 and r.nota_minima == 50


def test_id_do_post_igual_ao_da_extensao():
    assert linkedin_posts.id_do_post({"linkedinUrl": "https://www.linkedin.com/posts/ana_vaga-activity-7390123456789012345-AbCd"}) == "7390123456789012345"
    assert linkedin_posts.id_do_post({"id": "7390123456789012345"}) == "7390123456789012345"
    assert linkedin_posts.id_do_post({"entityId": "urn:li:activity:7390123456789012345"}) == "7390123456789012345"


def test_solides_aceita_junior_mesmo_listando_outros_niveis():
    from coletor.fontes import solides
    base = {"id": 1, "title": "Analista de Dados", "companyName": "X", "description": "SQL", "slug": "x"}
    v = solides._para_vaga({**base, "seniority": [{"name": "Júnior"}, {"name": "Pleno"}, {"name": "Sênior"}]}, "dados")
    assert F.filtrar_titulo(v) is None and v.nivel == "junior"
    v = solides._para_vaga({**base, "seniority": [{"name": "Pleno"}, {"name": "Sênior"}]}, "dados")
    assert F.filtrar_titulo(v).startswith("senioridade")


# ---------------------------------------------------------------- backup
def test_backup_cifra_decifra_e_rejeita_senha_errada():
    import pytest
    from coletor import backup
    dados = b'{"candidaturas": []}'
    c = backup.cifrar(dados, "uma-senha-bem-comprida-123")
    assert c.startswith(b"BVBK1") and dados not in c
    assert backup.decifrar(c, "uma-senha-bem-comprida-123") == dados
    with pytest.raises(Exception):
        backup.decifrar(c, "outra-senha-bem-comprida-123")
    with pytest.raises(ValueError):
        backup.cifrar(dados, "curta")


def test_backup_gera_e_verifica_com_banco_simulado(tmp_path, monkeypatch):
    from coletor import backup
    from coletor.armazenamento import Supabase
    banco = {"candidaturas": [{"vaga_id": "gupy:1", "status": "enviada"}], "vagas": [{"id": "gupy:1", "titulo": "Analista"}],
             "execucoes": [{"id": 1}]}

    class R:
        def __init__(self, dados=None, conteudo=b"", ok=True):
            self._d, self.content, self.ok, self.status_code = dados, conteudo, ok, 200 if ok else 404
        def json(self): return self._d
        def raise_for_status(self): pass

    def falso_get(url, **kw):
        if "/storage/" in url:
            return R(conteudo=b"%PDF-1.7 teste")
        return R(dados=banco[url.rsplit("/", 1)[1]])

    monkeypatch.setattr(backup.requests, "get", falso_get)
    sb = Supabase("https://x.supabase.co", "sb_secret_teste")
    arq = str(tmp_path / "b.bvbk")
    senha = "uma-senha-bem-comprida-123"
    assert backup.gerar(sb, arq, senha) == {"candidaturas": 1, "vagas": 1, "execucoes": 1, "curriculo": True}
    assert backup.verificar(sb, arq, senha)["candidaturas"] == 1
    assert backup.restaurar(sb, arq, senha, de_verdade=False)["simulacao"] is True
    banco["candidaturas"].append({"vaga_id": "gupy:2"})  # banco cresceu depois do backup: verificar acusa
    banco["vagas"].append({"id": "gupy:2"})
    import pytest
    with pytest.raises(SystemExit):
        backup.verificar(sb, arq, senha)
