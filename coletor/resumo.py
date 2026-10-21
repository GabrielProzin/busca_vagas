"""Email de resumo, mandado para você mesmo: vagas NOVAS desta coleta com nota alta e,
na coleta da manhã, as candidaturas que pedem follow-up.

Usa o mesmo Gmail do site (senha de app). Só envia quando há alguma dessas duas coisas.
"""
from __future__ import annotations

import html
import logging
import os
import smtplib
import ssl
from email.message import EmailMessage
from urllib.parse import quote

from .modelos import Vaga

log = logging.getLogger(__name__)

_MODALIDADE = {"remoto": "Remoto", "hibrido": "Híbrido", "presencial": "Presencial"}


def _local(v: Vaga) -> str:
    m = _MODALIDADE.get(v.modalidade or "", "Local não informado")
    return m if v.modalidade == "remoto" or not v.cidade else f"{m} em {v.cidade}"


_SIGLAS = {"sql": "SQL", "power bi": "Power BI", "etl": "ETL", "dax": "DAX", "apis": "APIs", "llm": "LLM", "bigquery": "BigQuery"}


def _hab(h: str) -> str:
    t = h.replace("_", " ")
    return _SIGLAS.get(t, t[:1].upper() + t[1:])


def _plural(n: int, um: str, varios: str) -> str:
    return f"{n} {um if n == 1 else varios}"


def montar(vagas: list[Vaga], site: str | None, nota_minima: float, followups: list[dict] | None = None) -> EmailMessage:
    """followups: [{"id","titulo","empresa","status","tipo": "followup"|"encerrar","dias"}]"""
    vagas = sorted(vagas, key=lambda v: -(v.nota or 0))
    # Primeiro quem pede follow-up; depois as que só sugerem encerrar.
    followups = sorted(followups or [], key=lambda f: (f["tipo"] != "followup", -f["dias"]))
    n, nf = len(vagas), len(followups)
    partes = []
    if n:
        partes.append(f"{_plural(n, 'vaga nova', 'vagas novas')} com nota {nota_minima:g}+")
    if nf:
        partes.append(_plural(nf, "candidatura pede follow-up", "candidaturas pedem follow-up"))
    msg = EmailMessage()
    msg["Subject"] = "busca_vagas: " + " · ".join(partes)
    base = (site or "").rstrip("/")

    def link(id_: str, url: str | None) -> str:
        return f"{base}/vaga/{quote(id_, safe='')}" if base else (url or "")

    def acao(f: dict) -> str:
        if f["tipo"] == "encerrar":
            return f"{f['dias']} dias sem resposta depois de 2 follow-ups. Talvez seja hora de mover para Não seguiu"
        meio = "Email enviado" if f["status"] == "enviada" else "Candidatura pelo link"
        return f"{meio} há {f['dias']} dias, sem resposta"

    # Texto puro (para quem lê sem HTML)
    linhas = []
    if n:
        linhas += [f"{n} vaga(s) nova(s) com nota {nota_minima:g} ou mais nesta coleta:", ""]
        for v in vagas:
            linhas += [f"{round(v.nota or 0)}  {v.titulo}", f"    {v.empresa or 'Empresa não informada'} · {_local(v)}",
                       *([f"    Email do recrutador: {v.email_contato}"] if v.email_contato else []),
                       f"    {link(v.id, v.url)}", ""]
    if nf:
        linhas += ["Pedem follow-up:", ""]
        for f in followups:
            linhas += [f"- {f['titulo']} ({f['empresa'] or 'empresa não informada'}): {acao(f)}", f"    {link(f['id'], f.get('url'))}"]
    msg.set_content("\n".join(linhas))

    # HTML simples, com estilos inline (clientes de email ignoram <style>)
    fonte = "font:14px/1.45 Arial,sans-serif;color:#172033"
    blocos = []
    if n:
        itens = []
        for v in vagas:
            ok = ", ".join(_hab(h) for h in v.habilidades_ok[:5])
            itens.append(
                f'<tr><td style="padding:14px 16px 14px 0;vertical-align:top;font:700 26px/1 Arial,sans-serif;color:#1f6f78">{round(v.nota or 0)}</td>'
                f'<td style="padding:14px 0;border-bottom:1px solid #e3e7ec;{fonte}">'
                f'<a href="{html.escape(link(v.id, v.url))}" style="font-weight:700;font-size:15px;color:#172033">{html.escape(v.titulo)}</a><br>'
                f'<span style="color:#5b6576">{html.escape(v.empresa or "Empresa não informada")} · {_local(v)}</span>'
                + (f'<br><span style="color:#5b6576">Pede {html.escape(ok)}</span>' if ok else "")
                + (f'<br><b>Tem email do recrutador</b>' if v.email_contato else "")
                + "</td></tr>"
            )
        blocos.append(
            f'<p style="font:15px/1.5 Arial,sans-serif;color:#172033">{_plural(n, "vaga nova", "vagas novas")} '
            f'com nota {nota_minima:g} ou mais nesta coleta.</p>'
            f'<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">{"".join(itens)}</table>')
    if nf:
        itens = "".join(
            f'<li style="margin:0 0 10px">'
            f'<a href="{html.escape(link(f["id"], f.get("url")))}" style="font-weight:700;color:#172033">{html.escape(f["titulo"])}</a>'
            f' <span style="color:#5b6576">· {html.escape(f["empresa"] or "Empresa não informada")}</span><br>'
            f'<span style="color:{"#5b6576" if f["tipo"] == "encerrar" else "#a15c1c"}">{html.escape(acao(f))}</span></li>'
            for f in followups)
        blocos.append(
            f'<p style="font:700 15px/1.5 Arial,sans-serif;color:#172033;margin-top:{"22px" if n else "0"}">'
            f'{_plural(nf, "candidatura pede", "candidaturas pedem")} follow-up</p>'
            f'<ul style="padding-left:18px;margin:0;{fonte}">{itens}</ul>'
            f'<p style="font:13px Arial,sans-serif;color:#5b6576">Abra a vaga no site: o rascunho do follow-up fica pronto lá.</p>')
    msg.add_alternative(
        '<div style="max-width:560px;margin:0 auto;padding:8px">' + "".join(blocos)
        + (f'<p style="font:13px Arial,sans-serif;color:#5b6576;margin-top:18px">Todas as vagas do dia em '
           f'<a href="{html.escape(base)}" style="color:#1f6f78">{html.escape(base)}</a></p>' if base else "")
        + "</div>",
        subtype="html",
    )
    return msg


def enviar(vagas: list[Vaga], nota_minima: float, followups: list[dict] | None = None, teste: bool = False) -> bool:
    usuario = os.getenv("GMAIL_USER")
    senha = (os.getenv("GMAIL_APP_PASSWORD") or "").replace(" ", "")
    if not vagas and not followups:
        log.info("resumo: nenhuma vaga nova com nota >= %s nem follow-up pendente, nada enviado", nota_minima)
        return False
    if not usuario or not senha:
        log.warning("resumo: GMAIL_USER/GMAIL_APP_PASSWORD não configurados nos Secrets, resumo não enviado")
        return False
    msg = montar(vagas, os.getenv("SITE_URL"), nota_minima, followups)
    if teste:
        assunto = msg["Subject"]
        del msg["Subject"]
        msg["Subject"] = f"[teste] {assunto}"
    msg["From"] = f"busca_vagas <{usuario}>"
    msg["To"] = os.getenv("RESUMO_PARA") or usuario
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ssl.create_default_context(), timeout=30) as s:
        s.login(usuario, senha)
        s.send_message(msg)
    log.info("resumo: enviado com %d vaga(s) e %d follow-up(s)", len(vagas), len(followups or []))
    return True
