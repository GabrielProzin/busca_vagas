"""Envio da fila de emails, em segundo plano (GitHub Actions, de hora em hora e quando o site pede).

Cada rodada:
1. lê o Gmail atrás de respostas e devoluções (coletor/respostas.py);
2. dentro do horário (config/preferencias.yaml -> envio.horario, em Brasília), manda até
   `max_por_execucao` emails da fila, sem passar do `limite_diario` (contando os enviados pelo site),
   com uma pausa aleatória entre um e outro (`intervalo_segundos`), para parecer envio à mão;
3. deixa um resumo SEM dados pessoais na página da execução (o repositório é público).

Cada email sai do seu Gmail (fica em Enviados), com o currículo do site em anexo.
Uso:  python -m coletor.envio [--so-respostas]
"""
from __future__ import annotations

import argparse
import logging
import os
import random
import smtplib
import ssl
import time
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from pathlib import Path
from zoneinfo import ZoneInfo

import yaml

from . import respostas
from .armazenamento import Supabase
from .modelo_email import carregar_perfil, nome_do_pdf

log = logging.getLogger("envio")
RAIZ = Path(__file__).resolve().parent.parent
FUSO = ZoneInfo("America/Sao_Paulo")

PADRAO = {"limite_diario": 40, "max_por_execucao": 10, "intervalo_segundos": [60, 120], "horario": [7, 21]}


class ErroLogin(Exception):
    """O Gmail recusou a senha: não adianta tentar os próximos."""


def configuracao() -> tuple[dict, list[str]]:
    cfg = yaml.safe_load((RAIZ / "config/preferencias.yaml").read_text(encoding="utf-8"))
    envio = {**PADRAO, **(cfg.get("envio") or {})}
    return envio, [d.lower().lstrip("@") for d in cfg.get("dominios_email_excluidos") or []]


def dominio_excluido(email: str, excluidos: list[str]) -> bool:
    dominio = email.rsplit("@", 1)[-1].lower()
    return any(dominio == d or dominio.endswith("." + d) for d in excluidos)


def inicio_do_dia(agora: datetime | None = None) -> datetime:
    a = (agora or datetime.now(timezone.utc)).astimezone(FUSO)
    return a.replace(hour=0, minute=0, second=0, microsecond=0)


def no_horario(horario: list[int], agora: datetime | None = None) -> bool:
    hora = (agora or datetime.now(timezone.utc)).astimezone(FUSO).hour
    return horario[0] <= hora < horario[1]


def montar(usuario: str, nome: str, para: str, assunto: str, corpo: str, pdf: bytes | None, nome_pdf: str) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = formataddr((nome, usuario))
    msg["To"] = para
    msg["Subject"] = assunto
    msg["Message-ID"] = make_msgid(domain=usuario.rsplit("@", 1)[-1])
    msg.set_content(corpo)
    if pdf:
        msg.add_attachment(pdf, maintype="application", subtype="pdf", filename=nome_pdf)
    return msg


def _smtp_enviar(usuario: str, senha: str, msg: EmailMessage) -> None:
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ssl.create_default_context(), timeout=60) as s:
        try:
            s.login(usuario, senha)
        except smtplib.SMTPAuthenticationError as e:
            raise ErroLogin(str(e)) from e
        s.send_message(msg)


def enviar_fila(sb, envio: dict, excluidos: list[str], usuario: str, senha: str, perfil: dict,
                mandar=_smtp_enviar, dormir=time.sleep, agora: datetime | None = None) -> dict:
    """Manda o que der da fila agora. Devolve contagens (sem dados pessoais)."""
    r = {"na_fila": 0, "enviados": 0, "falhas": 0, "adiados": 0, "excluidos": 0, "hoje": 0, "limite": envio["limite_diario"],
         "fora_do_horario": False, "sem_curriculo": False, "erro": None}
    fila = sb.fila(limite=100)
    r["na_fila"] = len(fila)
    ja_hoje = sb.enviados_desde(inicio_do_dia(agora).isoformat())
    r["hoje"] = len(ja_hoje)
    if not fila:
        return r
    if not no_horario(envio["horario"], agora):
        r["fora_do_horario"] = True
        return r
    pdf = sb.baixar_curriculo()
    if not pdf:
        r["sem_curriculo"] = True  # sem currículo não sai nada: um email de candidatura sem anexo não serve
        return r
    nome = perfil.get("nome_curto") or perfil.get("nome") or usuario
    nome_pdf = nome_do_pdf(perfil)
    destinos_hoje = set(ja_hoje)
    vaga_rodada = min(envio["max_por_execucao"], envio["limite_diario"] - len(ja_hoje))
    pausa_min, pausa_max = envio["intervalo_segundos"]

    primeiro = True
    for c in fila:
        if vaga_rodada <= 0:
            break
        vaga_id, para = c["vaga_id"], (c.get("email_para") or "").strip().lower()
        if not para or not c.get("email_assunto") or not c.get("email_corpo"):
            sb.atualizar_candidatura(vaga_id, {"fila_em": None, "fila_erro": "Faltou destinatário, assunto ou texto."})
            r["falhas"] += 1
            continue
        if dominio_excluido(para, excluidos):
            sb.atualizar_candidatura(vaga_id, {"fila_em": None, "fila_erro": "Domínio na lista de excluídos."})
            r["excluidos"] += 1
            continue
        if para in destinos_hoje:
            r["adiados"] += 1  # mesmo recrutador já recebeu um email hoje: este fica para amanhã
            continue
        if not primeiro:
            dormir(random.uniform(pausa_min, pausa_max))
        primeiro = False
        if not sb.reservar_envio(vaga_id):
            continue  # o site (ou outra rodada) já mandou
        msg = montar(usuario, nome, para, c["email_assunto"], c["email_corpo"], pdf, nome_pdf)
        try:
            mandar(usuario, senha, msg)
        except Exception as e:
            definitivo = isinstance(e, (smtplib.SMTPRecipientsRefused, smtplib.SMTPDataError, smtplib.SMTPSenderRefused))
            campos = {"status": "nova", "enviada_em": None, "fila_erro": _erro_legivel(e)[:300]}
            if definitivo:
                campos["fila_em"] = None
            if isinstance(e, smtplib.SMTPRecipientsRefused):
                campos["devolvido_em"] = datetime.now(timezone.utc).isoformat()
            sb.atualizar_candidatura(vaga_id, campos)
            r["falhas"] += 1
            if not definitivo:
                r["erro"] = _erro_legivel(e)
                break  # login recusado, limite do Gmail ou rede: para a rodada e tenta na próxima
            continue
        sb.atualizar_candidatura(vaga_id, {"fila_em": None, "fila_erro": None, "email_message_id": msg["Message-ID"]})
        destinos_hoje.add(para)
        r["enviados"] += 1
        r["hoje"] += 1
        vaga_rodada -= 1
    return r


def _erro_legivel(e: Exception) -> str:
    texto = str(e)
    if isinstance(e, ErroLogin) or "535" in texto:
        return "O Gmail recusou o login (confira GMAIL_USER e GMAIL_APP_PASSWORD nos Secrets do GitHub)."
    if "5.4.5" in texto or "limit" in texto.lower():
        return "O Gmail atingiu o limite de envios de hoje."
    if isinstance(e, smtplib.SMTPRecipientsRefused) or "5.1.1" in texto:
        return "O Gmail diz que esse endereço não existe."
    return f"O Gmail recusou o envio ({type(e).__name__})."


def _anotar(texto: str) -> None:
    log.info(texto)
    if os.getenv("GITHUB_ACTIONS") == "true":
        print(f"::notice title=envio::{texto}", flush=True)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    ap = argparse.ArgumentParser()
    ap.add_argument("--so-respostas", action="store_true", help="só lê o Gmail (respostas e devoluções)")
    a = ap.parse_args()

    sb = Supabase.do_ambiente()
    usuario = os.getenv("GMAIL_USER")
    senha = (os.getenv("GMAIL_APP_PASSWORD") or "").replace(" ", "")
    if not sb or not usuario or not senha:
        _anotar("Sem SUPABASE_* ou GMAIL_* nos Secrets: nada a fazer.")
        return

    try:
        lidas = respostas.verificar(sb, usuario, senha)
        _anotar(f"Gmail lido: {lidas['mensagens']} mensagens recentes; {lidas['respostas']} respostas novas; "
                f"{lidas['devolvidos']} devoluções novas")
    except Exception as e:  # ler respostas é um extra: não impede o envio
        _anotar(f"Não consegui ler o Gmail agora ({type(e).__name__}). Para isso o IMAP precisa estar ligado no Gmail.")

    if a.so_respostas:
        return
    envio, excluidos = configuracao()
    if os.getenv("ENVIO_INTERVALO"):  # o teste de ponta a ponta usa uma pausa curta
        envio["intervalo_segundos"] = [int(x) for x in os.environ["ENVIO_INTERVALO"].split(",")]
    r = enviar_fila(sb, envio, excluidos, usuario, senha, carregar_perfil())
    if r["fora_do_horario"]:
        _anotar(f"Fila: {r['na_fila']} esperando; fora do horário de envio ({envio['horario'][0]}h às {envio['horario'][1]}h)")
    elif r["sem_curriculo"]:
        _anotar(f"Fila: {r['na_fila']} esperando, mas não há currículo salvo no site (Configurações).")
    else:
        _anotar(f"Fila: {r['na_fila']} esperando; {r['enviados']} enviados agora; {r['falhas']} falharam; "
                f"{r['adiados']} adiados (mesmo destinatário hoje); {r['excluidos']} de domínio excluído; "
                f"hoje {r['hoje']}/{r['limite']}")
    if r["erro"]:
        _anotar(f"Parei a rodada: {r['erro']}")


if __name__ == "__main__":
    main()
