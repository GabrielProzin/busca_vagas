"""Os arquivos de configuração DESTA cópia (config/preferencias.yaml e perfil/) abrem e têm o formato certo.

Os outros testes usam cópias fixas em tests/dados/, porque cada pessoa muda a configuração para a própria área
(dados, suporte, desenvolvimento...). Aqui só se confere o formato, nunca o conteúdo: qualquer área passa.
"""
import re
from pathlib import Path

import yaml

from coletor.filtros import Filtros

RAIZ = Path(__file__).resolve().parent.parent


def _regex_ok(onde: str, padroes):
    for p in padroes or []:
        try:
            re.compile(str(p))
        except re.error as e:
            raise AssertionError(f"{onde}: o padrão {p!r} não é uma regex válida ({e}).") from None


def test_preferencias_yaml_abre_e_tem_o_formato_certo():
    cfg = yaml.safe_load((RAIZ / "config/preferencias.yaml").read_text(encoding="utf-8"))
    assert isinstance(cfg, dict), "config/preferencias.yaml está vazio ou não é um YAML de chave: valor."
    assert cfg.get("termos_busca"), "config/preferencias.yaml: falta pelo menos um item em termos_busca."
    assert cfg.get("trilhas"), "config/preferencias.yaml: falta pelo menos uma trilha em trilhas."
    for t in cfg["trilhas"]:
        assert {"nome", "peso", "padroes"} <= set(t), f"config/preferencias.yaml: a trilha {t} precisa de nome, peso e padroes."
        _regex_ok(f"trilhas → {t['nome']}", t["padroes"])
    for chave in ("senioridade_bloqueada", "senioridade_alvo", "bloqueio_titulo"):
        _regex_ok(chave, cfg.get(chave))
    for nome, padroes in (cfg.get("catalogo_habilidades") or {}).items():
        _regex_ok(f"catalogo_habilidades → {nome}", padroes)
    Filtros.de_config(cfg)  # monta os filtros do jeito que a coleta monta


def test_perfil_abre_e_tem_o_formato_certo():
    perfil = yaml.safe_load((RAIZ / "perfil/perfil.yaml").read_text(encoding="utf-8"))
    assert isinstance(perfil, dict) and perfil.get("nome"), "perfil/perfil.yaml: falta o nome."
    assert perfil.get("habilidades"), "perfil/perfil.yaml: falta pelo menos uma habilidade."
    for nome, h in perfil["habilidades"].items():
        assert isinstance(h, dict) and h.get("padroes"), f"perfil/perfil.yaml: a habilidade {nome} precisa de padroes."
        _regex_ok(f"habilidades → {nome}", h["padroes"])
    assert (RAIZ / "perfil/curriculo.md").read_text(encoding="utf-8").strip(), "perfil/curriculo.md está vazio."
