"""Preferências da tela do site aplicadas por cima do config/preferencias.yaml (docs/spec.md, "Preferências")."""
from datetime import datetime, timedelta, timezone
from pathlib import Path

import yaml

from coletor.filtros import Filtros
from coletor.modelos import Vaga
from coletor.preferencias import aplicar, niveis_aceitos

RAIZ = Path(__file__).resolve().parent.parent
CFG = yaml.safe_load((RAIZ / "config/preferencias.yaml").read_text(encoding="utf-8"))


def vaga(titulo="Analista de Dados", descricao="", modalidade="remoto", cidade=None):
    return Vaga(fonte="teste", id_origem=titulo, titulo=titulo, empresa="ACME", url="https://x", descricao=descricao,
                modalidade=modalidade, cidade=cidade, publicada_em=datetime.now(timezone.utc) - timedelta(days=1))


def test_sem_preferencias_o_yaml_vale_igual():
    assert aplicar(CFG, None) is CFG
    assert aplicar(CFG, {}) is CFG


def test_niveis_do_yaml_e_mapeamento_igual_ao_yaml():
    assert niveis_aceitos(CFG) == ["junior"]
    # Aceitar só júnior pela tela bloqueia exatamente os mesmos termos que o YAML de hoje.
    novo = aplicar(CFG, {"niveis": ["junior"]})
    assert set(novo["senioridade_bloqueada"]) == set(CFG["senioridade_bloqueada"])


def test_hibrido_sim_presencial_nao():
    f = Filtros.de_config(aplicar(CFG, {"modalidades": {"remoto": True, "hibrido": True, "presencial": False},
                                        "cidades": ["Goiânia"]}))
    assert f.filtrar_local(vaga(modalidade="hibrido", cidade="Goiânia")) is None
    assert f.filtrar_local(vaga(modalidade="presencial", cidade="Goiânia")) == "presencial não aceito"
    assert f.filtrar_local(vaga(modalidade="remoto")) is None


def test_sem_remoto_e_cidades_novas():
    f = Filtros.de_config(aplicar(CFG, {"modalidades": {"remoto": False, "hibrido": True, "presencial": True},
                                        "cidades": ["Brasília"], "estado": "df"}))
    assert f.filtrar_local(vaga(modalidade="remoto")) == "remoto não aceito"
    assert f.filtrar_local(vaga(modalidade="presencial", cidade="Brasília")) is None
    assert f.filtrar_local(vaga(modalidade="presencial", cidade="Goiânia")) is not None


def test_aceitar_pleno_libera_titulo_e_descricao():
    f = Filtros.de_config(aplicar(CFG, {"niveis": ["junior", "pleno"]}))
    assert f.filtrar_titulo(vaga("Analista de Dados Pleno")) is None
    assert f.filtrar_titulo(vaga("Analista de Dados Sênior")).startswith("senioridade")
    assert f.filtrar_titulo(vaga("Coordenador de Dados")).startswith("senioridade")  # liderança fica sempre de fora
    v = vaga("Analista de Dados", "Buscamos pleno com perfil sênior, pleno de verdade")
    assert f.filtrar_senioridade_descricao(v) is None


def test_palavras_termos_anos_e_ingles():
    novo = aplicar(CFG, {"palavras_bloqueadas": ["Marketing", "c++"], "termos_busca": ["analista de dados"],
                         "max_anos": 3, "aceita_ingles": True})
    f = Filtros.de_config(novo)
    assert f.filtrar_titulo(vaga("Analista de Dados de Marketing")).startswith("bloqueio")
    assert f.filtrar_titulo(vaga("Analista de Dados C++")).startswith("bloqueio")  # o "+" não quebra o regex
    assert novo["termos_busca"] == ["analista de dados"]
    assert f.max_anos == 3 and f.aceita_ingles is True
    assert CFG["max_anos_experiencia"] == 2  # o YAML original não muda


# ---------------------------------------------------------------- cidades escritas de qualquer jeito
def test_cidade_escrita_de_varios_jeitos_e_a_mesma():
    from coletor.texto import separar_cidade
    for escrita in ["Goiânia", "goiania", "GOIÂNIA", "Goiania - GO", "goiânia/go", "Goiânia (GO)", "Goiânia, Goiás",
                    "Goiania-GO", "Goiânia - GO - Brasil", "Gyn"]:
        assert separar_cidade(escrita)[0] == "goiania", escrita
    assert separar_cidade("Santa Bárbara d'Oeste - SP") == separar_cidade("Santa Barbara D Oeste, SP") == ("santa barbara doeste", "sp")
    assert separar_cidade("Mogi-Mirim")[0] == separar_cidade("Mogi Mirim")[0]
    assert separar_cidade("Conceição do Pará")[0] == "conceicao do para"  # nome de estado no meio do nome fica


def test_filtro_aceita_a_cidade_com_acento_ou_sem_e_com_estado():
    f = Filtros.de_config(aplicar(CFG, {"modalidades": {"remoto": True, "hibrido": True, "presencial": True},
                                        "cidades": ["Goiânia - GO", "Brasília - DF"]}))
    for cidade in ["goiania", "GOIANIA - GO", "Goiânia/GO", "Brasilia", "Brasília, Distrito Federal"]:
        assert f.filtrar_local(vaga(modalidade="presencial", cidade=cidade)) is None, cidade
    # No texto, como palavra inteira e sem ligar para acento ou maiúscula.
    assert f.filtrar_local(vaga(modalidade="hibrido", descricao="Atuação híbrida no escritório de GOIANIA.")) is None
    assert f.filtrar_local(vaga(modalidade="hibrido", descricao="Escritório em GYN, 3x por semana.")) is None
    # Dois estados aceitos (GO e DF): DF não é "de fora"; SP é.
    assert f.filtrar_local(vaga(modalidade="presencial", descricao="Presencial em Taguatinga - DF")) != "presencial em DF"
    assert f.filtrar_local(vaga(modalidade="presencial", descricao="Presencial em Campinas - SP")) == "presencial em SP"


def test_mesmo_nome_em_outro_estado_nao_conta():
    f = Filtros.de_config(aplicar(CFG, {"modalidades": {"remoto": True, "hibrido": True, "presencial": True},
                                        "cidades": ["Santa Luzia - MG"]}))
    assert f.filtrar_local(vaga(modalidade="presencial", cidade="Santa Luzia - MG")) is None
    assert f.filtrar_local(vaga(modalidade="presencial", cidade="Santa Luzia - PB")) == "presencial em Santa Luzia - PB"
    assert f.filtrar_local(vaga(modalidade="presencial", cidade="Santa Luzia")) is None  # sem estado: confia no nome


def test_contrato_e_empresas_a_evitar():
    so_clt = Filtros.de_config(aplicar(CFG, {"contratos": {"clt": True, "pj": False}, "empresas_bloqueadas": ["Empresa Chata"]}))
    assert so_clt.filtrar_contrato(vaga(descricao="Contratação PJ, 100% remoto.")) == "contrato PJ"
    assert so_clt.filtrar_contrato(vaga(descricao="Contratação CLT ou PJ, à escolha.")) is None  # oferece os dois
    assert so_clt.filtrar_contrato(vaga(descricao="Sem falar de contrato.")) is None
    so_pj = Filtros.de_config(aplicar(CFG, {"contratos": {"clt": False, "pj": True}}))
    assert so_pj.filtrar_contrato(vaga(descricao="Regime CLT com benefícios.")) == "contrato CLT"
    v = vaga(titulo="Analista de Dados Jr")
    v.empresa = "EMPRESA CHATA LTDA"
    assert so_clt.filtrar_titulo(v) == "empresa bloqueada: empresa chata"
