"""Email de resumo: vagas NOVAS desta coleta com nota alta, mandado para você mesmo.

Usa o mesmo Gmail do site (senha de app). Só envia quando há pelo menos uma vaga nova acima do corte.
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


def montar(vagas: list[Vaga], site: str | None, nota_minima: float) -> EmailMessage:
    vagas = sorted(vagas, key=lambda v: -(v.nota or 0))
    n = len(vagas)
    msg = EmailMessage()
    msg["Subject"] = f"busca_vagas: {n} vaga{'s' if n > 1 else ''} nova{'s' if n > 1 else ''} com nota {nota_minima:g}+"
    base = (site or "").rstrip("/")

    def link(v: Vaga) -> str:
        return f"{base}/vaga/{quote(v.id, safe='')}" if base else v.url

    # Texto puro (para quem lê sem HTML)
    linhas = [f"{n} vaga(s) nova(s) com nota {nota_minima:g} ou mais nesta coleta:", ""]
    for v in vagas:
        linhas += [f"{round(v.nota or 0)}  {v.titulo}", f"    {v.empresa or 'Empresa não informada'} · {_local(v)}",
                   *( [f"    Email do recrutador: {v.email_contato}"] if v.email_contato else [] ), f"    {link(v)}", ""]
    msg.set_content("\n".join(linhas))

    # HTML simples, com estilos inline (clientes de email ignoram <style>)
    itens = []
    for v in vagas:
        ok = ", ".join(h.replace("_", " ") for h in v.habilidades_ok[:5])
        itens.append(
            f'<tr><td style="padding:14px 16px 14px 0;vertical-align:top;font:700 26px/1 Arial,sans-serif;color:#1f6f78">{round(v.nota or 0)}</td>'
            f'<td style="padding:14px 0;border-bottom:1px solid #e3e7ec;font:14px/1.45 Arial,sans-serif;color:#172033">'
            f'<a href="{html.escape(link(v))}" style="font-weight:700;font-size:15px;color:#172033">{html.escape(v.titulo)}</a><br>'
            f'<span style="color:#5b6576">{html.escape(v.empresa or "Empresa não informada")} · {_local(v)}</span>'
            + (f'<br><span style="color:#5b6576">Pede {html.escape(ok)}</span>' if ok else "")
            + (f'<br><b>Tem email do recrutador</b>' if v.email_contato else "")
            + "</td></tr>"
        )
    msg.add_alternative(
        f'<div style="max-width:560px;margin:0 auto;padding:8px">'
        f'<p style="font:15px/1.5 Arial,sans-serif;color:#172033">{n} vaga{"s" if n > 1 else ""} nova{"s" if n > 1 else ""} '
        f'com nota {nota_minima:g} ou mais nesta coleta.</p>'
        f'<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">{"".join(itens)}</table>'
        + (f'<p style="font:13px Arial,sans-serif;color:#5b6576;margin-top:18px">Todas as vagas do dia em '
           f'<a href="{html.escape(base)}" style="color:#1f6f78">{html.escape(base)}</a></p>' if base else "")
        + "</div>",
        subtype="html",
    )
    return msg


def enviar(vagas: list[Vaga], nota_minima: float) -> bool:
    usuario = os.getenv("GMAIL_USER")
    senha = (os.getenv("GMAIL_APP_PASSWORD") or "").replace(" ", "")
    if not vagas:
        log.info("resumo: nenhuma vaga nova com nota >= %s, nada enviado", nota_minima)
        return False
    if not usuario or not senha:
        log.warning("resumo: GMAIL_USER/GMAIL_APP_PASSWORD não configurados nos Secrets, resumo não enviado")
        return False
    msg = montar(vagas, os.getenv("SITE_URL"), nota_minima)
    msg["From"] = f"busca_vagas <{usuario}>"
    msg["To"] = os.getenv("RESUMO_PARA") or usuario
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ssl.create_default_context(), timeout=30) as s:
        s.login(usuario, senha)
        s.send_message(msg)
    log.info("resumo: enviado com %d vaga(s)", len(vagas))
    return True
