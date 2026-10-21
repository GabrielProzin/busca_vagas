"""Email pronto (sem IA) para o modo automático da fila.

É a mesma regra de `site/lib/ia.ts` (emailModelo) e de `site/lib/formato.ts` (tituloLimpo, deEmpresa):
quem mudar o texto lá muda aqui também (o teste `test_modelo_email_igual_ao_do_site` confere o formato).
"""
from __future__ import annotations

import os
import re
from pathlib import Path

import yaml

from .modelos import Vaga

RAIZ = Path(__file__).resolve().parent.parent

_SIGLAS = ["BI", "TI", "RH", "SQL", "ETL", "CRM", "ERP", "API", "APIs", "AI", "IA", "ML", "PJ", "CLT", "SAP", "AWS",
           "GCP", "KPI", "KPIs", "BA", "UX"]
_MINUSCULAS = {"de", "da", "do", "das", "dos", "e", "em", "para", "a", "o", "com"}
_PREFIXO = re.compile(r"^\s*(trabalhe de casa|home ?office|vaga|oportunidade)\s*[:\-–|]?\s*", re.I)
_MASCULINAS = re.compile(
    r"^(grupo|banco|instituto|hospital|laborat[oó]rio|escrit[oó]rio|col[eé]gio|centro|sistema|clube|portal|supermercado|"
    r"atacad[aã]o|sicoob|sicredi|servi[cç]o|sindicato|hotel|shopping|minist[eé]rio|tribunal|governo|conselho)\b", re.I)


def titulo_limpo(titulo: str) -> str:
    t = _PREFIXO.sub("", titulo).strip() or titulo.strip()
    letras = re.sub(r"[^A-Za-zÀ-ÿ]", "", t)
    if letras and letras == letras.upper() and len(letras) > 4:
        partes = re.split(r"(\s+|[()/&-])", t.lower())
        saida = []
        for i, p in enumerate(partes):
            sigla = next((s for s in _SIGLAS if s.lower() == p), None)
            if sigla:
                saida.append(sigla)
            elif i > 0 and p in _MINUSCULAS:
                saida.append(p)
            else:
                saida.append(p[:1].upper() + p[1:])
        t = "".join(saida)
    return t


def de_empresa(empresa: str) -> str:
    e = empresa.strip()
    return f"{'do' if _MASCULINAS.search(e) else 'da'} {e}"


def carregar_perfil() -> dict:
    return yaml.safe_load((RAIZ / "perfil/perfil.yaml").read_text(encoding="utf-8"))


def assinatura(perfil: dict) -> str:
    links = perfil.get("links") or {}
    linhas = [f"{rotulo}: {links[k]}" for k, rotulo in (("linkedin", "LinkedIn"), ("github", "GitHub"), ("portfolio", "Portfólio"))
              if links.get(k)]
    return "\n".join(x for x in [perfil.get("nome"), perfil.get("cargo"), os.getenv("CONTATO_TELEFONE"), *linhas] if x)


def destaques_para(v: Vaga, perfil: dict, n: int) -> list[str]:
    ok = set(v.habilidades_ok)
    pontuados = sorted(perfil.get("destaques") or [], key=lambda d: -len([q for q in d.get("quando", []) if q in ok]))
    return [d.get("frase") or d.get("texto") for d in pontuados[:n]]


def email_modelo(v: Vaga, perfil: dict | None = None) -> tuple[str, str]:
    """(assunto, corpo) do email pronto."""
    perfil = perfil or carregar_perfil()
    d = destaques_para(v, perfil, 2)
    empresa = f" {de_empresa(v.empresa)}" if v.empresa else ""
    experiencia = perfil.get("experiencia_resumo") or "o que venho fazendo na área"
    corpo = (
        "Olá, tudo bem?\n\n"
        f"Vi a vaga de {titulo_limpo(v.titulo)}{empresa} e quero me candidatar. Pelo que li no anúncio, "
        f"o trabalho tem muito a ver com {experiencia}.\n\n"
        f"{d[0] if d else ''}{' ' + d[1] if len(d) > 1 else ''}\n\n"
        "Mandei o currículo em anexo. Se fizer sentido para vocês, fico à disposição para conversar.\n\n"
        "Obrigado,\n\n"
        f"{assinatura(perfil)}"
    )
    nome_curto = perfil.get("nome_curto") or perfil.get("nome")
    return f"Candidatura: {titulo_limpo(v.titulo)} – {nome_curto}", corpo


def nome_do_pdf(perfil: dict) -> str:
    """Mesmo nome do site: "Gabriel_Mendes_Cientista_de_Dados.pdf"."""
    import unicodedata

    base = " ".join(x for x in [perfil.get("nome_curto") or perfil.get("nome"), perfil.get("cargo")] if x)
    sem_acento = "".join(c for c in unicodedata.normalize("NFD", base) if unicodedata.category(c) != "Mn")
    return (re.sub(r"[^A-Za-z0-9]+", "_", sem_acento).strip("_") or "Curriculo") + ".pdf"
