"""Teste de ponta a ponta do envio em lote e da leitura de respostas, com o Gmail e o banco de verdade.

Só manda email para VOCÊ MESMO (GMAIL_USER) e para um endereço em example.com, domínio reservado que não recebe
email de ninguém (serve para provocar uma devolução de verdade). Nenhum recrutador recebe nada.

1. Cria 2 vagas de teste no banco, cada uma com uma candidatura na fila (para você e para o endereço inexistente).
2. Roda o envio da fila (o mesmo código da rodada de hora em hora), com pausa curta.
3. Lê o Gmail: o aviso de devolução deve marcar a 2ª candidatura como devolvida.
4. Responde ao 1º email (como se fosse o recrutador) e lê o Gmail de novo: a 1ª candidatura deve ir para "Respondeu".
5. Apaga as vagas de teste. O resumo vai para a página da execução, sem endereços.

Uso (no Actions, workflow "Envio da fila", opção "teste"):  python scripts/teste_envio.py
"""
from __future__ import annotations

import json
import os
import secrets
import smtplib
import ssl
import sys
import time
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from coletor import envio, respostas  # noqa: E402
from coletor.armazenamento import Supabase  # noqa: E402
from coletor.modelo_email import carregar_perfil, email_modelo  # noqa: E402
from coletor.modelos import Vaga  # noqa: E402


def anotar(texto: str) -> None:
    print(f"::notice title=teste do envio::{texto}" if os.getenv("GITHUB_ACTIONS") == "true" else texto, flush=True)


def hora(iso: str | None = "") -> str:
    """Hora de Brasília: agora (sem argumento) ou de um horário do banco."""
    if iso is None:
        return "-"
    d = datetime.fromisoformat(iso) if iso else datetime.now(timezone.utc)
    return d.astimezone(envio.FUSO).strftime("%H:%M:%S")


class SoTeste:
    """O banco de verdade, mas a fila só enxerga as vagas deste teste (a sua fila real não é tocada)."""

    def __init__(self, sb: Supabase, ids: list[str]):
        self.sb, self.ids = sb, ids

    def __getattr__(self, nome):
        return getattr(self.sb, nome)

    def fila(self, limite):
        return [c for c in self.sb.fila(limite=200) if c["vaga_id"] in self.ids]

    def candidaturas_com_email(self):
        return [c for c in self.sb.candidaturas_com_email() if c["vaga_id"] in self.ids]


def linha(sb: Supabase, vaga_id: str) -> dict:
    r = requests.get(f"{sb.base}/candidaturas", headers=sb.h, timeout=30, params={
        "select": "status,enviada_em,fila_em,fila_erro,resposta_em,devolvido_em,email_message_id", "vaga_id": f"eq.{vaga_id}"})
    r.raise_for_status()
    return r.json()[0]


def main() -> int:
    sb = Supabase.do_ambiente()
    usuario = os.getenv("GMAIL_USER")
    senha = (os.getenv("GMAIL_APP_PASSWORD") or "").replace(" ", "")
    if not sb or not usuario or not senha:
        anotar("Faltam SUPABASE_* ou GMAIL_* nos Secrets.")
        return 1
    perfil = carregar_perfil()
    sufixo = secrets.token_hex(4)
    inexistente = f"naoexiste-{sufixo}@example.com"
    ids = [f"teste:envio-{sufixo}-1", f"teste:envio-{sufixo}-2"]
    agora = datetime.now(timezone.utc).isoformat()
    falhas: list[str] = []
    try:
        # 1. vagas e candidaturas de teste (lista "descartada": não aparecem nas suas listas do site)
        vagas, cands = [], []
        for vaga_id, para in zip(ids, [usuario, inexistente]):
            v = Vaga(fonte="teste", id_origem=vaga_id.split(":", 1)[1], titulo="Analista de Dados Júnior (teste do envio)",
                     empresa="Empresa Fictícia", url="https://github.com/" + os.getenv("GITHUB_REPOSITORY", ""))
            assunto, corpo = email_modelo(v, perfil)
            corpo = ("[TESTE do busca_vagas: este email foi para você mesmo, para provar que a fila funciona. "
                     "Pode apagar.]\n\n" + corpo)
            vagas.append({"id": vaga_id, "fonte": "teste", "titulo": v.titulo, "empresa": v.empresa, "url": v.url,
                          "lista": "descartada", "nota": 0})
            cands.append({"vaga_id": vaga_id, "status": "nova", "email_para": para, "email_assunto": "[TESTE] " + assunto,
                          "email_corpo": corpo, "fila_em": agora, "atualizada_em": agora})
        requests.post(f"{sb.base}/vagas", headers=sb.h, data=json.dumps(vagas), timeout=30).raise_for_status()
        anotar(f"{hora()} 2 vagas de teste criadas e {sb.enfileirar(cands)} candidaturas colocadas na fila "
               f"(1 para você, 1 para um endereço inexistente em example.com)")

        # 2. envio da fila: o mesmo código da rodada de hora em hora
        teste = SoTeste(sb, ids)
        cfg, excluidos = envio.configuracao()
        cfg = {**cfg, "intervalo_segundos": [8, 15], "horario": [0, 24], "max_por_execucao": 2,
               "limite_diario": max(cfg["limite_diario"], len(sb.enviados_desde(envio.inicio_do_dia().isoformat())) + 2)}
        momentos = []
        original = envio._smtp_enviar

        def mandar(u, s, msg):
            original(u, s, msg)
            momentos.append(time.monotonic())

        r = envio.enviar_fila(teste, cfg, excluidos, usuario, senha, perfil, mandar=mandar)
        pausa = f"{momentos[1] - momentos[0]:.0f}s" if len(momentos) == 2 else "-"
        anotar(f"{hora()} Fila enviada: {r['enviados']} enviados, {r['falhas']} falhas, pausa entre os dois: {pausa} "
               f"(sorteada entre 8 e 15s no teste; no uso normal, {envio.configuracao()[0]['intervalo_segundos']}s)")
        c1, c2 = linha(sb, ids[0]), linha(sb, ids[1])
        anotar("Depois do envio: " + " | ".join(
            f"candidatura {i}: status={c['status']}, saiu da fila={c['fila_em'] is None}, "
            f"Message-ID guardado={bool(c['email_message_id'])}, erro={c['fila_erro']}" for i, c in enumerate([c1, c2], 1)))
        if r["enviados"] != 2:
            falhas.append("os 2 emails não saíram")
        # 2b. segunda rodada: nada pode sair de novo
        r2 = envio.enviar_fila(teste, cfg, excluidos, usuario, senha, perfil)
        anotar(f"Segunda rodada logo em seguida: {r2['enviados']} enviados (tem que ser 0: nunca envia duas vezes)")
        if r2["enviados"]:
            falhas.append("a segunda rodada enviou de novo")

        # 3. devolução
        dev = None
        for _ in range(12):
            time.sleep(10)
            lidas = respostas.verificar(teste, usuario, senha, dias=1)
            dev = linha(sb, ids[1])["devolvido_em"]
            if dev:
                break
        anotar(f"{hora()} Devolução: {'detectada' if dev else 'NÃO detectada'} "
               f"(aviso do Gmail lido por IMAP; devolvido_em={hora(dev)})")
        if not dev:
            falhas.append("a devolução não foi detectada")
        if linha(sb, ids[0])["status"] != "enviada":
            falhas.append("o próprio email enviado foi confundido com resposta")

        # 4. resposta simulada: um email que responde ao 1º, como o recrutador faria
        msgid = linha(sb, ids[0])["email_message_id"]
        resp = EmailMessage()
        resp["From"] = formataddr(("Recrutadora (simulação)", usuario))
        resp["To"] = usuario
        resp["Subject"] = "Re: " + cands[0]["email_assunto"]
        resp["Message-ID"] = make_msgid(domain=usuario.rsplit("@", 1)[-1])
        resp["In-Reply-To"] = msgid
        resp["References"] = msgid
        resp.set_content("[TESTE do busca_vagas] Resposta simulada de recrutador. Pode apagar.")
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ssl.create_default_context(), timeout=60) as s:
            s.login(usuario, senha)
            s.send_message(resp)
        anotar(f"{hora()} Resposta simulada enviada (responde ao 1º email, na mesma conversa)")
        status = None
        for _ in range(12):
            time.sleep(10)
            lidas = respostas.verificar(teste, usuario, senha, dias=1)
            c1 = linha(sb, ids[0])
            status = c1["status"]
            if status == "respondeu":
                break
        anotar(f"{hora()} Resposta: candidatura 1 foi de 'enviada' para '{status}' "
               f"(resposta_em={hora(c1['resposta_em'])}); "
               f"última leitura do Gmail: {lidas['mensagens']} mensagens de hoje")
        if status != "respondeu":
            falhas.append("a resposta não foi detectada")
    finally:
        # 5. limpeza (apagar a vaga apaga a candidatura junto)
        r = requests.delete(f"{sb.base}/vagas", headers=sb.h, timeout=30,
                            params={"id": "in.(" + ",".join(f'"{i}"' for i in ids) + ")"})
        anotar(f"Vagas de teste apagadas do banco ({r.status_code}). Os 2 emails de teste ficam no seu Gmail; pode apagar.")
    anotar("RESULTADO: tudo funcionou" if not falhas else "RESULTADO: falhou: " + "; ".join(falhas))
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
