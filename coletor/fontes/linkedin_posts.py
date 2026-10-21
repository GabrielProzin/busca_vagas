"""Posts de vaga do LinkedIn com email do recrutador, via Apify (ator harvestapi/linkedin-post-search).

Por que assim:
- Os emails de recrutador quase só aparecem em POSTS ("envie seu CV para fulana@empresa.com"),
  não nas vagas formais do LinkedIn nem nas plataformas (Gupy etc.).
- O LinkedIn não tem API pública de posts. O ator do Apify busca posts por palavra-chave na
  infraestrutura dele, SEM login e SEM cookie: a sua conta do LinkedIn nunca é usada.
- Custo: ~US$ 1,50–2 por 1.000 posts, pago com o crédito grátis do Apify (US$ 5/mês).
  Por isso as buscas são poucas, só das últimas horas e só ficam os posts que têm email.

Sem APIFY_TOKEN nos Secrets, esta fonte simplesmente não roda.
"""
from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timedelta, timezone

import requests

from ..modelos import Vaga
from ..texto import extrair_emails, normalizar

log = logging.getLogger(__name__)

ATOR_PADRAO = "harvestapi~linkedin-post-search"

# Post de quem está CONTRATANDO (e não de quem procura emprego, que também põe o próprio email).
_SINAL_VAGA = re.compile(
    r"\b(vaga|vagas|contratando|estamos (buscando|procurando|contratando)|buscamos|procuramos|seleciona|recrutando|"
    r"processo seletivo|oportunidade (de|para)|hiring|envie (seu|o seu|seu cv|o cv)|enviar (o )?(curriculo|cv)|"
    r"curriculos? para|cv para)\b")
_CANDIDATO = re.compile(
    r"(estou|sigo|ando) (em busca|procurando|a procura)|busco (uma )?(nova )?(oportunidade|recolocacao)|#opentowork|"
    r"aberto a (novas )?oportunidades|disponivel para (novas )?oportunidades|minha (primeira )?vaga|fui contratad|"
    r"consegui (minha|uma) vaga|recem[- ]formad[oa] em busca|me (indica|indiquem)")
_EMAIL_PESSOAL = re.compile(r"@(gmail|hotmail|outlook|live|yahoo|icloud|bol|uol)\.", re.I)
_CARGO = re.compile(
    r"\b(analista|cientista|engenheir[oa]|especialista|assistente|desenvolvedor[a]?|arquitet[oa]|consultor[a]?|"
    r"data|business|bi\b|power bi)\b[^\n.,;:!?()|•\-–]{0,60}", re.I)
_ENFEITE = re.compile(r"[#][\w-]+|[\U0001F000-\U0001FAFF☀-➿⬀-⯿️‍]+")
_PREFIXO = re.compile(r"^(nova |novas )?(vagas?|oportunidades?|estamos contratando|contratando|hiring)\b\s*(aberta|de|para|:)?\s*", re.I)
_EMPRESA_HEADLINE = re.compile(r"(?:\bna\b|\bno\b|\bat\b|@|\bem\b)\s+([A-Z0-9][\w&.\- ]{1,40}?)(?:\s*[|·,•]|\s+-\s|$)")


def _limpar(linha: str) -> str:
    linha = _ENFEITE.sub(" ", linha)
    return re.sub(r"\s+", " ", linha).strip(" -–:|*•!.")


def titulo_do_post(texto: str, trilhas: list[re.Pattern]) -> str | None:
    """Cargo da vaga: primeiro trecho das primeiras linhas que bate com uma trilha de dados."""
    def ok(t: str) -> bool:
        n = normalizar(t)
        return any(p.search(n) for p in trilhas)

    for linha in (texto or "").splitlines()[:20]:
        limpa = _limpar(linha)
        if not limpa:
            continue
        # Cabeçalho curto ("Analista de Dados Jr | Remoto | CLT"): fica a parte que tem o cargo.
        if len(limpa) <= 90:
            for parte in re.split(r"\s+[|/–-]\s+|\s*\|\s*", limpa):
                parte = _PREFIXO.sub("", parte).strip(" -–:|")
                if 4 <= len(parte) <= 80 and ok(parte):
                    return parte
        # Frase longa ("Estamos contratando Analista de Dados Júnior para atuar..."): recorta o cargo.
        for m in _CARGO.finditer(limpa):
            trecho = " ".join(m.group(0).split()[:7])
            trecho = re.split(r"\s+(para|pra|que|com|em|no|na|e)\s+", trecho, maxsplit=1)[0]
            if ok(trecho):
                return trecho.strip()
    return None


def empresa_do_post(info: str | None, emails: list[str]) -> str:
    """Empresa pela headline do autor ("Tech Recruiter na Mynd8 | ...") ou pelo domínio do email."""
    if info and (m := _EMPRESA_HEADLINE.search(info)):
        return m.group(1).strip()
    for e in emails:
        if not _EMAIL_PESSOAL.search(e):
            dominio = e.split("@")[1].split(".")[0]
            return dominio.capitalize()
    return ""


def post_para_vaga(p: dict, trilhas: list[re.Pattern], busca: str) -> tuple[Vaga | None, str]:
    """Converte um post em vaga. Devolve (vaga, "") ou (None, motivo do descarte)."""
    texto = (p.get("content") or "").strip()
    if not texto:
        return None, "post vazio"
    emails = extrair_emails(texto)
    if not emails:
        return None, "post sem email"
    n = normalizar(texto)
    if _CANDIDATO.search(n):
        return None, "post de candidato"
    if not _SINAL_VAGA.search(n):
        return None, "post não é vaga"
    titulo = titulo_do_post(texto, trilhas)
    if not titulo:
        return None, "cargo fora das trilhas"
    autor = p.get("author") or {}
    quando = None
    try:
        ts = (p.get("postedAt") or {}).get("timestamp")
        quando = datetime.fromtimestamp(int(ts) / 1000, tz=timezone.utc) if ts else None
    except (TypeError, ValueError):
        pass
    quem = autor.get("name")
    descricao = texto + (f"\n\nPublicado por {quem}" + (f" ({autor['info']})" if autor.get("info") else "") if quem else "")
    return Vaga(
        fonte="linkedin",
        id_origem=str(p.get("id") or p.get("linkedinUrl")),
        titulo=titulo,
        empresa=empresa_do_post(autor.get("info"), emails),
        url=p.get("linkedinUrl") or "",
        descricao=descricao,
        publicada_em=quando,
        emails=emails,
        email_origem="vaga",
        termo_busca=busca,
    ), ""


def coletar(cfg: dict, trilhas: list[re.Pattern], token: str | None = None) -> tuple[list[Vaga], dict]:
    """Roda as buscas configuradas. Devolve as vagas e um resumo {posts, com_email, vagas, erro}."""
    token = token or os.getenv("APIFY_TOKEN")
    info = {"posts": 0, "vagas": 0, "descartes": {}, "erro": None}
    if not token:
        info["erro"] = "sem APIFY_TOKEN"
        return [], info
    ator = cfg.get("ator", ATOR_PADRAO)
    horas = float(cfg.get("horas", 13))
    desde = (datetime.now(timezone.utc) - timedelta(hours=horas)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    vagas: dict[str, Vaga] = {}
    for busca in cfg.get("buscas", []):
        entrada = {"searchQueries": [busca], "maxPosts": int(cfg.get("max_posts_por_busca", 20)),
                   "postedLimit": "24h", "postedLimitDate": desde, "sortBy": "date",
                   "scrapeReactions": False, "scrapeComments": False}
        try:
            r = requests.post(f"https://api.apify.com/v2/acts/{ator}/run-sync-get-dataset-items",
                              params={"token": token, "timeout": 240}, json=entrada, timeout=300)
            if r.status_code in (402, 403):
                info["erro"] = "crédito do Apify esgotado ou token sem permissão"
                log.warning("linkedin: %s (%s)", info["erro"], r.text[:200])
                break
            r.raise_for_status()
            posts = r.json()
        except Exception as e:
            info["erro"] = f"{type(e).__name__}: {e}"[:200]
            log.warning("linkedin: busca %r falhou: %s", busca, e)
            continue
        info["posts"] += len(posts)
        for p in posts:
            v, motivo = post_para_vaga(p, trilhas, busca)
            if v:
                vagas.setdefault(v.id, v)
            else:
                info["descartes"][motivo] = info["descartes"].get(motivo, 0) + 1
    info["vagas"] = len(vagas)
    log.info("linkedin: %d posts lidos, %d viraram vaga com email; descartes %s", info["posts"], info["vagas"], info["descartes"])
    return list(vagas.values()), info
