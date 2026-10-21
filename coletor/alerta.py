"""Alertas CRÍTICOS por email: só o que exige ação sua.

Críticos: a coleta quebrou; uma fonte principal voltou vazia (API mudou?); o volume caiu muito
em relação às últimas coletas; o ranking perdeu os embeddings. O resto fica só no log.

Uso direto (passo de falha do workflow):  python -m coletor.alerta "título" "detalhe 1" "detalhe 2"
"""
from __future__ import annotations

import logging
import os
import smtplib
import ssl
import sys
from email.message import EmailMessage
from pathlib import Path

log = logging.getLogger(__name__)

# O pipeline cria este arquivo quando já mandou alerta; o passo de falha do workflow não manda de novo.
MARCADOR = Path("saida/.alerta_enviado")
FONTES_PRINCIPAIS = ("gupy", "remotar")


def link_execucao() -> str | None:
    s, r, i = os.getenv("GITHUB_SERVER_URL"), os.getenv("GITHUB_REPOSITORY"), os.getenv("GITHUB_RUN_ID")
    return f"{s}/{r}/actions/runs/{i}" if s and r and i else None


def verificar_saude(execucao: dict, anteriores: list[dict]) -> list[str]:
    """Problemas críticos desta coleta, comparando com as anteriores."""
    problemas: list[str] = []
    coletadas = execucao.get("coletadas") or {}
    for f in FONTES_PRINCIPAIS:
        if coletadas.get(f, 0) == 0:
            problemas.append(f"A fonte {f} não trouxe nenhuma vaga. A API pode ter mudado: rode o workflow com a opção diagnóstico.")
    totais = [sum((e.get("coletadas") or {}).values()) for e in anteriores]
    totais = [t for t in totais if t > 0][:6]
    total = sum(coletadas.values())
    if len(totais) >= 3:
        media = sum(totais) / len(totais)
        if total < 0.4 * media:
            problemas.append(f"Esta coleta leu {total} vagas, bem abaixo da média recente ({media:.0f}).")
    if execucao.get("backend") == "tfidf":
        problemas.append("O ranking rodou sem o modelo de embeddings (caiu para TF-IDF): as notas ficam menos precisas.")
    return problemas


def enviar(titulo: str, linhas: list[str]) -> bool:
    usuario = os.getenv("GMAIL_USER")
    senha = (os.getenv("GMAIL_APP_PASSWORD") or "").replace(" ", "")
    if not usuario or not senha:
        log.warning("alerta: sem GMAIL_USER/GMAIL_APP_PASSWORD, alerta não enviado: %s", titulo)
        return False
    link = link_execucao()
    corpo = "\n".join([*linhas, "", f"Detalhes da execução: {link}" if link else "", "", "busca_vagas"])
    msg = EmailMessage()
    msg["Subject"] = f"[busca_vagas] {titulo}"
    msg["From"] = f"busca_vagas <{usuario}>"
    msg["To"] = os.getenv("RESUMO_PARA") or usuario
    msg.set_content(corpo)
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ssl.create_default_context(), timeout=30) as s:
        s.login(usuario, senha)
        s.send_message(msg)
    from .resumo import _contar_email
    _contar_email("gmail:alerta")
    MARCADOR.parent.mkdir(exist_ok=True)
    MARCADOR.touch()
    log.info("alerta enviado: %s", titulo)
    return True


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    if MARCADOR.exists():
        print("alerta já enviado nesta execução")
        return
    titulo = sys.argv[1] if len(sys.argv) > 1 else "O workflow de coleta falhou"
    enviar(titulo, sys.argv[2:] or ["A execução terminou com erro antes ou depois da coleta (ex.: instalação de pacotes)."])


if __name__ == "__main__":
    main()
