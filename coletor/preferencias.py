"""Preferências da busca editadas no site (tela Preferências), por cima do config/preferencias.yaml.

O YAML é o padrão inicial e guarda os ajustes avançados (trilhas, catálogo, regex). O que a pessoa muda na tela fica
na tabela `preferencias` (uma linha, id = 1) e vale a partir da próxima coleta. Ver docs/spec.md, "Preferências".
"""
from __future__ import annotations

import copy
import re

from .texto import normalizar

# Termos de título por nível. Nível não aceito = os termos dele descartam a vaga pelo título.
NIVEIS: dict[str, list[str]] = {
    "estagio": ["estagi", r"intern\b", "trainee", "aprendiz"],
    "junior": ["junior", "júnior", r"\bjr\.?\b"],
    "pleno": ["pleno", r"\bpl\b", r"mid[- ]?level", r"\bii\b"],
    "senior": ["senior", "sênior", r"\bsr\.?\b", "especialista", "specialist", "expert", r"\biii\b"],
}
# Cargos de liderança ficam sempre de fora (não são o público deste radar).
LIDERANCA = ["lead", "lider", "líder", "coordenador", "gerente", "manager", "head", "principal", "staff", "arquitet", "architect"]


def niveis_aceitos(cfg: dict) -> list[str]:
    """Níveis aceitos pelo YAML: os que não têm todos os termos na senioridade_bloqueada."""
    bloq = set(cfg.get("senioridade_bloqueada") or [])
    return [n for n, termos in NIVEIS.items() if not all(t in bloq for t in termos)]


def aplicar(cfg: dict, prefs: dict | None) -> dict:
    """Devolve uma cópia do cfg com as preferências do site aplicadas. prefs vazio ou None = cfg igual."""
    if not prefs:
        return cfg
    novo = copy.deepcopy(cfg)
    loc = novo.setdefault("localizacao", {})
    mod = prefs.get("modalidades") or {}
    if mod:
        loc["aceita_remoto"] = bool(mod.get("remoto", True))
        loc["aceita_hibrido"] = bool(mod.get("hibrido", True))
        loc["aceita_presencial"] = bool(mod.get("presencial", True))
    if isinstance(prefs.get("cidades"), list):
        # "Goiânia - GO": o filtro separa o nome do estado (coletor/texto.py, separar_cidade).
        loc["cidades_presencial_hibrido"] = [str(c).strip() for c in prefs["cidades"] if str(c).strip()]
    if prefs.get("estado"):
        loc["estado"] = str(prefs["estado"]).upper()
    if prefs.get("regiao"):
        loc["rotulo"] = str(prefs["regiao"])
    contratos = prefs.get("contratos")
    if isinstance(contratos, dict) and (contratos.get("clt") or contratos.get("pj")):
        novo["contrato"] = {"clt": bool(contratos.get("clt")), "pj": bool(contratos.get("pj"))}
    empresas = [normalizar(e) for e in prefs.get("empresas_bloqueadas") or [] if str(e).strip()]
    if empresas:
        novo["empresas_bloqueadas"] = list(novo.get("empresas_bloqueadas") or []) + empresas
    if "aceita_ingles" in prefs:
        loc["aceita_vagas_em_ingles"] = bool(prefs["aceita_ingles"])
    niveis = [n for n in prefs.get("niveis") or [] if n in NIVEIS]
    if niveis:
        novo["senioridade_bloqueada"] = [t for n, termos in NIVEIS.items() if n not in niveis for t in termos] + LIDERANCA
        # Quem aceita pleno ou sênior não descarta a vaga só porque a descrição fala nesses níveis.
        if "pleno" in niveis or "senior" in niveis:
            novo["min_mencoes_senioridade_descricao"] = 10**6
    if isinstance(prefs.get("max_anos"), int):
        novo["max_anos_experiencia"] = prefs["max_anos"]
    termos = [str(t).strip() for t in prefs.get("termos_busca") or [] if str(t).strip()]
    if termos:
        novo["termos_busca"] = termos
    # Palavras simples digitadas na tela viram regex literal (sem acento, minúsculo, como o resto do filtro).
    extras = [re.escape(normalizar(p)) for p in prefs.get("palavras_bloqueadas") or [] if str(p).strip()]
    if extras:
        novo["bloqueio_titulo"] = list(novo.get("bloqueio_titulo") or []) + extras
    return novo
