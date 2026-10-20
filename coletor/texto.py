"""Utilidades de texto: normalização, limpeza de HTML, emails, frases."""
from __future__ import annotations

import html
import re
import unicodedata

_TAG = re.compile(r"<[^>]+>")
_BLOCO = re.compile(r"</?(p|div|li|ul|ol|br|h\d|tr)[^>]*>", re.I)
_ESPACOS = re.compile(r"[ \t ]+")
_EMAIL = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
# Emails que aparecem em vagas mas não são de recrutador.
_EMAIL_IGNORAR = re.compile(r"(noreply|no-reply|naoresponda|exemplo|example|privacidade|privacy|lgpd|dpo|ouvidoria|sac@)", re.I)


def sem_acento(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def normalizar(s: str | None) -> str:
    """Minúsculo, sem acento, espaços colapsados. Base de toda comparação por regex."""
    if not s:
        return ""
    return _ESPACOS.sub(" ", sem_acento(s).lower()).strip()


def limpar_html(s: str | None) -> str:
    """HTML -> texto com quebras de linha nos blocos (para separar requisitos)."""
    if not s:
        return ""
    s = _BLOCO.sub("\n", s)
    s = _TAG.sub(" ", s)
    s = html.unescape(s)
    linhas = [_ESPACOS.sub(" ", l).strip() for l in s.splitlines()]
    return "\n".join(l for l in linhas if l)


def extrair_emails(texto: str) -> list[str]:
    vistos: list[str] = []
    for e in _EMAIL.findall(texto or ""):
        e = e.strip(".").lower()
        if _EMAIL_IGNORAR.search(e) or e in vistos:
            continue
        if e.endswith((".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp")):
            continue
        vistos.append(e)
    return vistos


def frases_relevantes(texto: str, min_chars: int = 25, max_chars: int = 240, limite: int = 40) -> list[str]:
    """Quebra a descrição em linhas/frases curtas, que é o que o modelo de embeddings compara bem."""
    pedacos: list[str] = []
    for linha in (texto or "").splitlines():
        linha = linha.strip(" -•*·\t")
        if not linha:
            continue
        for frase in re.split(r"(?<=[.;!?])\s+", linha):
            frase = frase.strip()
            if len(frase) < min_chars:
                continue
            pedacos.append(frase[:max_chars])
    # remove duplicatas mantendo a ordem
    vistos, unicos = set(), []
    for p in pedacos:
        k = normalizar(p)
        if k not in vistos:
            vistos.add(k)
            unicos.append(p)
    return unicos[:limite]


def compilar(padroes: list[str]) -> re.Pattern:
    """Lista de regex -> um padrão só, comparável com texto normalizado.

    Os padrões também perdem acento ('sênior' -> 'senior'). Não use escapes em
    maiúscula (\\S, \\W...) nos YAMLs, porque o padrão é passado para minúsculo.
    """
    if not padroes:
        return re.compile(r"(?!x)x")
    return re.compile("|".join(f"(?:{sem_acento(p).lower()})" for p in padroes))
