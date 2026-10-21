"""Respostas e devoluções, lidas da caixa de entrada do Gmail (IMAP, com a mesma senha de app do envio).

Só lê CABEÇALHOS (remetente, data, assunto e a quem a mensagem responde), dos últimos dias, em modo só leitura:
nada é marcado como lido e nenhum conteúdo de email é guardado.

- Resposta: a mensagem responde a um email nosso (In-Reply-To/References com o nosso Message-ID) ou vem do
  endereço para quem enviamos, depois do envio  ->  candidatura vai para "respondeu" (o follow-up para).
- Devolução: aviso do Gmail de que o endereço não existe (mailer-daemon, cabeçalho X-Failed-Recipients)
  ->  candidatura fica marcada como devolvida.
"""
from __future__ import annotations

import imaplib
import logging
import re
from datetime import datetime, timedelta, timezone
from email.parser import BytesHeaderParser
from email.utils import getaddresses, parseaddr, parsedate_to_datetime

log = logging.getLogger(__name__)

_MESES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
_DAEMON = re.compile(r"mailer-daemon|postmaster|mail delivery subsystem", re.I)
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_CAMPOS = "FROM DATE SUBJECT MESSAGE-ID IN-REPLY-TO REFERENCES X-FAILED-RECIPIENTS"


def _data(texto: str | None) -> datetime | None:
    if not texto:
        return None
    try:
        d = parsedate_to_datetime(texto) if " " in texto.strip() else datetime.fromisoformat(texto.replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError, IndexError):
        try:
            return datetime.fromisoformat(texto.replace("Z", "+00:00"))
        except ValueError:
            return None


def classificar(mensagens: list[dict], candidaturas: list[dict], proprio: str | None = None) -> tuple[dict[str, datetime], dict[str, datetime]]:
    """Função pura: devolve ({vaga_id: data da resposta}, {vaga_id: data da devolução}).

    mensagens: [{"from", "date", "message_id", "in_reply_to", "references", "failed", "corpo"}]
    (corpo só para avisos de devolução)
    """
    por_msgid = {c["email_message_id"].strip("<>"): c for c in candidaturas if c.get("email_message_id")}
    por_endereco: dict[str, list[dict]] = {}
    for c in candidaturas:
        por_endereco.setdefault((c.get("email_para") or "").lower(), []).append(c)

    respostas: dict[str, datetime] = {}
    devolvidos: dict[str, datetime] = {}
    for m in mensagens:
        if (m.get("message_id") or "").strip().strip("<>") in por_msgid:
            continue  # é o nosso próprio email (aparece na caixa de entrada quando o destino é você mesmo)
        quando = _data(m.get("date")) or datetime.now(timezone.utc)
        remetente = parseaddr(m.get("from") or "")[1].lower()
        nome_remetente = m.get("from") or ""

        if _DAEMON.search(nome_remetente) or _DAEMON.search(remetente):
            falhos = {e.lower() for e in _EMAIL.findall(m.get("failed") or "")}
            if not falhos:  # sem o cabeçalho: procura os nossos destinatários no texto do aviso
                texto = (m.get("corpo") or "").lower()
                falhos = {end for end in por_endereco if end and end in texto}
            for end in falhos:
                for c in por_endereco.get(end, []):
                    enviada = _data(c.get("enviada_em"))
                    if enviada and quando >= enviada - timedelta(minutes=5):
                        devolvidos.setdefault(c["vaga_id"], quando)
            continue

        ids = {x.strip("<>") for x in re.findall(r"<[^>]+>", f"{m.get('in_reply_to') or ''} {m.get('references') or ''}")}
        alvo = next((por_msgid[i] for i in ids if i in por_msgid), None)
        if alvo:
            respostas.setdefault(alvo["vaga_id"], quando)
            continue
        if proprio and remetente == proprio.lower():
            continue  # email seu (ex.: um teste para você mesmo): só conta como resposta pela conversa, acima
        candidatas = [c for c in por_endereco.get(remetente, []) if (_data(c.get("enviada_em")) or quando) <= quando]
        if candidatas:
            mais_recente = max(candidatas, key=lambda c: _data(c.get("enviada_em")))
            respostas.setdefault(mais_recente["vaga_id"], quando)
    return respostas, devolvidos


def ler_caixa(usuario: str, senha: str, dias: int = 21, limite: int = 2000) -> list[dict]:
    """Cabeçalhos das mensagens recentes da caixa de entrada (só leitura)."""
    desde = datetime.now(timezone.utc) - timedelta(days=dias)
    imap = imaplib.IMAP4_SSL("imap.gmail.com", 993, timeout=60)
    try:
        imap.login(usuario, senha)
        imap.select("INBOX", readonly=True)
        _, dados = imap.search(None, f'(SINCE "{desde.day:02d}-{_MESES[desde.month - 1]}-{desde.year}")')
        ids = dados[0].split()[-limite:] if dados and dados[0] else []
        mensagens = []
        parser = BytesHeaderParser()
        for i in range(0, len(ids), 100):
            lote = b",".join(ids[i:i + 100]).decode()
            _, partes = imap.fetch(lote, f"(BODY.PEEK[HEADER.FIELDS ({_CAMPOS})])")
            for parte in partes:
                if not isinstance(parte, tuple):
                    continue
                h = parser.parsebytes(parte[1])
                mensagens.append({
                    "num": parte[0].split()[0].decode(),
                    "from": str(h.get("From", "")), "date": str(h.get("Date", "")), "subject": str(h.get("Subject", "")),
                    "message_id": str(h.get("Message-ID", "")), "in_reply_to": str(h.get("In-Reply-To", "")), "references": str(h.get("References", "")),
                    "failed": ", ".join(a for _, a in getaddresses([str(h.get("X-Failed-Recipients", ""))]) if a),
                })
        # Avisos de devolução sem X-Failed-Recipients: lê só o começo do texto deles para achar o destinatário.
        for m in mensagens:
            if _DAEMON.search(m["from"]) and not m["failed"]:
                _, partes = imap.fetch(m["num"], "(BODY.PEEK[TEXT]<0.4000>)")
                for parte in partes:
                    if isinstance(parte, tuple):
                        m["corpo"] = parte[1].decode("utf-8", "replace")
        return mensagens
    finally:
        try:
            imap.logout()
        except Exception:
            pass


def verificar(sb, usuario: str, senha: str, dias: int = 21) -> dict:
    """Lê o Gmail e atualiza as candidaturas. Devolve um resumo sem dados pessoais."""
    candidaturas = sb.candidaturas_com_email()
    if not candidaturas:
        return {"mensagens": 0, "respostas": 0, "devolvidos": 0}
    mensagens = ler_caixa(usuario, senha, dias)
    respostas, devolvidos = classificar(mensagens, candidaturas, proprio=usuario)
    atual = {c["vaga_id"]: c for c in candidaturas}
    n_resp = n_dev = 0
    for vaga_id, quando in respostas.items():
        c = atual[vaga_id]
        if c.get("status") in ("enviada", "aplicada"):
            n_resp += len(sb.atualizar_candidatura(vaga_id, {"status": "respondeu", "resposta_em": quando.isoformat()},
                                                   {"status": "in.(enviada,aplicada)"}))
        elif not c.get("resposta_em"):
            sb.atualizar_candidatura(vaga_id, {"resposta_em": quando.isoformat()})
    for vaga_id, quando in devolvidos.items():
        if not atual[vaga_id].get("devolvido_em"):
            n_dev += len(sb.atualizar_candidatura(vaga_id, {"devolvido_em": quando.isoformat()}, {"devolvido_em": "is.null"}))
    log.info("respostas: %d mensagens lidas, %d respostas novas, %d devoluções novas", len(mensagens), n_resp, n_dev)
    return {"mensagens": len(mensagens), "respostas": n_resp, "devolvidos": n_dev}
