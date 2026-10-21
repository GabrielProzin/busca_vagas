"""Procura um email PÚBLICO de RH no site oficial da empresa, para vagas que não trazem email.

Regras (de propósito restritivas):
- Só endereços de SETOR (rh@, vagas@, carreiras@, talentos@...), nunca nomes de pessoas.
- Só do mesmo domínio do site da empresa.
- Só páginas do próprio site: a inicial e no máximo 4 links de contato/carreiras que ela mesma aponta.
- "contato@"/"atendimento@" entram como segunda opção, marcados como contato geral.
"""
from __future__ import annotations

import logging
import re
from urllib.parse import urljoin, urlparse

import requests

log = logging.getLogger(__name__)

_EMAIL = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
_MAILTO = re.compile(r'mailto:([^"\'?>\s]+)', re.I)
_CFEMAIL = re.compile(r'data-cfemail="([0-9a-fA-F]+)"')
_HREF = re.compile(r'<a\b[^>]*href="([^"#]+)"[^>]*>(.*?)</a>', re.I | re.S)
_LINK_UTIL = re.compile(r"contato|contact|fale|trabalhe|carreira|career|vagas|jobs|talento|rh\b|recrut|junte|work-with", re.I)

RH = {"rh", "recrutamento", "recrutamentoeselecao", "recrutamento.selecao", "selecao", "vagas", "vaga", "carreiras",
      "carreira", "talentos", "talento", "talent", "curriculo", "curriculos", "cv", "jobs", "careers", "trabalheconosco",
      "trabalhe.conosco", "gente", "gentegestao", "pessoas", "people", "hr", "recruiting", "recruitment", "rhvagas", "rh.vagas"}
GERAL = {"contato", "contact", "atendimento", "faleconosco", "fale.conosco", "contato.site"}

UA = {"User-Agent": "Mozilla/5.0 (compatible; busca_vagas/1.0; +https://github.com/GabrielProzin/busca_vagas)",
      "Accept": "text/html,application/xhtml+xml"}


def _dominio(host: str) -> str:
    h = host.lower().removeprefix("www.")
    partes = h.split(".")
    # empresa.com.br -> empresa.com.br ; sub.empresa.com -> empresa.com
    if len(partes) >= 3 and partes[-2] in {"com", "net", "org", "gov", "edu", "ind", "art"} and len(partes[-1]) == 2:
        return ".".join(partes[-3:])
    return ".".join(partes[-2:])


def _decodificar_cf(hexa: str) -> str:
    """E-mails protegidos pelo Cloudflare vêm cifrados com XOR no HTML."""
    try:
        chave = int(hexa[:2], 16)
        return "".join(chr(int(hexa[i:i + 2], 16) ^ chave) for i in range(2, len(hexa), 2))
    except ValueError:
        return ""


def _emails(html: str) -> set[str]:
    achados = set(_EMAIL.findall(html)) | set(_MAILTO.findall(html)) | {_decodificar_cf(h) for h in _CFEMAIL.findall(html)}
    return {e.strip(".").lower() for e in achados if e and not e.lower().endswith((".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif"))}


def _classificar(email: str, dominio: str) -> str | None:
    local, _, dom = email.partition("@")
    if not (dom == dominio or dom.endswith("." + dominio)):
        return None
    if local in RH or any(local.startswith(p) for p in ("rh.", "rh-", "rh_", "vagas.", "talentos.", "recrutamento.", "carreiras.")):
        return "rh"
    if local in GERAL:
        return "contato"
    return None


def buscar_email_empresa(site: str, http: requests.Session | None = None, timeout: float = 12) -> dict | None:
    """{'email': 'rh@empresa.com.br', 'tipo': 'rh'|'contato', 'pagina': url} ou None."""
    if not site or not site.startswith("http"):
        return None
    s = http or requests.Session()
    s.headers.update(UA)
    try:
        r = s.get(site, timeout=timeout, allow_redirects=True)
    except requests.RequestException as e:
        log.debug("contato: %s inacessível: %s", site, e)
        return None
    if r.status_code >= 400 or "html" not in r.headers.get("content-type", ""):
        return None
    dominio = _dominio(urlparse(r.url).hostname or "")
    paginas = [(r.url, r.text[:600_000])]
    links: list[str] = []
    for href, texto in _HREF.findall(r.text):
        url = urljoin(r.url, href)
        host = urlparse(url).hostname or ""
        if url.startswith("http") and _dominio(host) == dominio and (_LINK_UTIL.search(href) or _LINK_UTIL.search(texto)):
            if url not in links and url.rstrip("/") != r.url.rstrip("/"):
                links.append(url)
    for url in links[:4]:
        try:
            p = s.get(url, timeout=timeout)
            if p.ok and "html" in p.headers.get("content-type", ""):
                paginas.append((p.url, p.text[:600_000]))
        except requests.RequestException:
            continue

    melhor: dict | None = None
    for url, html in paginas:
        for e in sorted(_emails(html)):
            tipo = _classificar(e, dominio)
            if tipo == "rh":
                return {"email": e, "tipo": "rh", "pagina": url}
            if tipo == "contato" and melhor is None:
                melhor = {"email": e, "tipo": "contato", "pagina": url}
    return melhor
