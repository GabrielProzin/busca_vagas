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
