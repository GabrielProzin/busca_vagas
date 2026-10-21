"""Fila de envio, respostas/devoluções no Gmail e coleta rápida x completa. Dados fictícios (@exemplo.com)."""
from __future__ import annotations

import smtplib
from datetime import datetime, timedelta, timezone

from coletor import envio, respostas
from coletor.followup import situacao
from coletor.modelo_email import email_modelo, nome_do_pdf
from coletor.modelos import Vaga
from coletor.pipeline import _novas_para_resumo, _para_fila

PERFIL = {"nome": "Pessoa Teste", "nome_curto": "Pessoa Teste", "cargo": "Cientista de Dados",
          "experiencia_resumo": "análise de dados", "destaques": []}
ENVIO = {"limite_diario": 3, "max_por_execucao": 10, "intervalo_segundos": [60, 120], "horario": [7, 21]}
MEIO_DIA = datetime(2026, 10, 21, 15, 0, tzinfo=timezone.utc)  # 12:00 em Brasília


class BancoFalso:
    """Imita o Supabase em memória (só o que o envio usa)."""

    def __init__(self, fila, ja_hoje=None, pdf=b"%PDF-1.4"):
        self.linhas = {c["vaga_id"]: {"status": "nova", "fila_em": "2026-10-21T10:00:00+00:00", **c} for c in fila}
        self.ja_hoje = ja_hoje or []
        self.pdf = pdf

    def fila(self, limite):
        return [dict(c) for c in self.linhas.values() if c.get("fila_em") and c["status"] == "nova"][:limite]

    def enviados_desde(self, desde):
        return list(self.ja_hoje) + [c["email_para"] for c in self.linhas.values() if c["status"] == "enviada"]

    def baixar_curriculo(self):
        return self.pdf

    def reservar_envio(self, vaga_id):
        c = self.linhas[vaga_id]
        if c["status"] != "nova" or not c.get("fila_em"):
            return False
        c.update(status="enviada", enviada_em=MEIO_DIA.isoformat())
        return True

    def atualizar_candidatura(self, vaga_id, campos, filtro_extra=None):
        self.linhas[vaga_id].update(campos)
        return [self.linhas[vaga_id]]


def item(n, para=None):
    return {"vaga_id": f"teste:{n}", "email_para": para or f"rh{n}@empresa{n}.exemplo.com",
            "email_assunto": f"Candidatura: Analista {n}", "email_corpo": "Olá, tudo bem? " * 10}


def rodar(sb, excluidos=(), mandar=None, agora=MEIO_DIA):
    enviados, pausas = [], []
    r = envio.enviar_fila(sb, ENVIO, list(excluidos), "eu@exemplo.com", "x", PERFIL,
                          mandar=mandar or (lambda u, s, msg: enviados.append(msg)), dormir=pausas.append, agora=agora)
    return r, enviados, pausas


def test_fila_respeita_limite_diario_e_intervalo():
    sb = BancoFalso([item(i) for i in range(5)], ja_hoje=["alguem@exemplo.com"])
    r, enviados, pausas = rodar(sb)
    assert r["enviados"] == 2 and r["hoje"] == 3  # 1 já enviado hoje + 2 = limite de 3
    assert len(pausas) == 1 and 60 <= pausas[0] <= 120  # pausa só ENTRE emails
    msg = enviados[0]
    assert msg["To"] == "rh0@empresa0.exemplo.com" and msg["Message-ID"]
    assert [p.get_filename() for p in msg.iter_attachments()] == [nome_do_pdf(PERFIL)]
    assert sb.linhas["teste:0"]["fila_em"] is None and sb.linhas["teste:0"]["email_message_id"] == msg["Message-ID"]
    assert sb.linhas["teste:4"]["fila_em"]  # o resto continua na fila para amanhã


def test_fila_fora_do_horario_nao_envia():
    sb = BancoFalso([item(1)])
    r, enviados, _ = rodar(sb, agora=datetime(2026, 10, 21, 2, 0, tzinfo=timezone.utc))  # 23:00 em Brasília
    assert r["fora_do_horario"] and not enviados


def test_fila_nunca_envia_duas_vezes():
    sb = BancoFalso([item(1)])
    rodar(sb)
    _, enviados, _ = rodar(sb)  # segunda rodada: nada mais na fila
    assert enviados == []


def test_fila_mesmo_destinatario_um_por_dia_e_dominio_excluido():
    sb = BancoFalso([item(1, "rh@mesma.exemplo.com"), item(2, "rh@mesma.exemplo.com"), item(3, "vagas@bloqueada.exemplo.com")])
    r, enviados, _ = rodar(sb, excluidos=["bloqueada.exemplo.com"])
    assert len(enviados) == 1 and r["adiados"] == 1 and r["excluidos"] == 1
    assert sb.linhas["teste:3"]["fila_em"] is None and "excluídos" in sb.linhas["teste:3"]["fila_erro"]


def test_fila_endereco_recusado_sai_da_fila_e_volta_a_nova():
    def recusa(u, s, msg):
        raise smtplib.SMTPRecipientsRefused({msg["To"]: (550, b"5.1.1 user unknown")})

    sb = BancoFalso([item(1)])
    r, _, _ = rodar(sb, mandar=recusa)
    c = sb.linhas["teste:1"]
    assert r["falhas"] == 1 and c["status"] == "nova" and c["enviada_em"] is None
    assert c["fila_em"] is None and c["devolvido_em"] and "não existe" in c["fila_erro"]


def test_fila_login_recusado_para_a_rodada_e_mantem_na_fila():
    def sem_login(u, s, msg):
        raise envio.ErroLogin("535 BadCredentials")

    sb = BancoFalso([item(1), item(2)])
    r, _, _ = rodar(sb, mandar=sem_login)
    assert r["falhas"] == 1 and "login" in r["erro"]
    assert sb.linhas["teste:1"]["status"] == "nova" and sb.linhas["teste:1"]["fila_em"]  # tenta de novo na próxima


def test_sem_curriculo_nao_envia():
    sb = BancoFalso([item(1)], pdf=None)
    r, enviados, _ = rodar(sb)
    assert r["sem_curriculo"] and not enviados


# ------------------------------------------------------------------ respostas e devoluções

ENVIADA = (MEIO_DIA - timedelta(days=2)).isoformat()
CANDS = [
    {"vaga_id": "a", "status": "enviada", "email_para": "rh@alfa.exemplo.com", "email_message_id": "<id-a@exemplo.com>", "enviada_em": ENVIADA},
    {"vaga_id": "b", "status": "enviada", "email_para": "talentos@beta.exemplo.com", "email_message_id": "<id-b@exemplo.com>", "enviada_em": ENVIADA},
    {"vaga_id": "c", "status": "aplicada", "email_para": "naoexiste@gama.exemplo.com", "email_message_id": None, "enviada_em": ENVIADA},
]
DATA = "Wed, 21 Oct 2026 12:00:00 -0300"


def test_resposta_pela_conversa_e_pelo_remetente():
    msgs = [
        {"from": "Recrutadora <outra@alfa.exemplo.com>", "date": DATA, "in_reply_to": "<id-a@exemplo.com>", "references": ""},
        {"from": "Beta RH <talentos@beta.exemplo.com>", "date": DATA, "in_reply_to": "", "references": ""},
        {"from": "Newsletter <news@exemplo.com>", "date": DATA, "in_reply_to": "", "references": ""},
        # o nosso próprio email, quando aparece na caixa de entrada, não é resposta
        {"from": "rh@alfa.exemplo.com", "date": DATA, "message_id": "<id-b@exemplo.com>", "in_reply_to": "", "references": ""},
    ]
    resp, dev = respostas.classificar(msgs, CANDS)
    assert set(resp) == {"a", "b"} and dev == {}


def test_devolucao_pelo_cabecalho_e_pelo_texto():
    msgs = [{"from": "Mail Delivery Subsystem <mailer-daemon@googlemail.com>", "date": DATA, "failed": "naoexiste@gama.exemplo.com"}]
    assert set(respostas.classificar(msgs, CANDS)[1]) == {"c"}
    msgs = [{"from": "Mail Delivery Subsystem <mailer-daemon@googlemail.com>", "date": DATA, "failed": "",
             "corpo": "Address not found. Your message wasn't delivered to naoexiste@gama.exemplo.com because..."}]
    resp, dev = respostas.classificar(msgs, CANDS)
    assert set(dev) == {"c"} and resp == {}


def test_mensagem_antes_do_envio_nao_conta_como_resposta():
    msgs = [{"from": "rh@alfa.exemplo.com", "date": "Mon, 12 Oct 2026 09:00:00 -0300", "in_reply_to": "", "references": ""}]
    assert respostas.classificar(msgs, CANDS) == ({}, {})


def test_verificar_atualiza_o_banco(monkeypatch):
    class Sb:
        def __init__(self):
            self.mudancas = []

        def candidaturas_com_email(self):
            return CANDS

        def atualizar_candidatura(self, vaga_id, campos, filtro=None):
            self.mudancas.append((vaga_id, campos))
            return [1]

    monkeypatch.setattr(respostas, "ler_caixa", lambda *a, **k: [
        {"from": "rh@alfa.exemplo.com", "date": DATA, "in_reply_to": "<id-a@exemplo.com>"},
        {"from": "MAILER-DAEMON@googlemail.com", "date": DATA, "failed": "naoexiste@gama.exemplo.com"},
    ])
    sb = Sb()
    r = respostas.verificar(sb, "eu@exemplo.com", "x")
    assert r == {"mensagens": 2, "respostas": 1, "devolvidos": 1}
    assert ("a", {"status": "respondeu", "resposta_em": "2026-10-21T12:00:00-03:00"}) in sb.mudancas
    assert sb.mudancas[1][0] == "c" and "devolvido_em" in sb.mudancas[1][1]


def test_followup_ignora_email_devolvido():
    antigo = (datetime.now(timezone.utc) - timedelta(days=20)).isoformat()
    assert situacao({"status": "enviada", "enviada_em": antigo})[0] == "followup"
    assert situacao({"status": "enviada", "enviada_em": antigo, "devolvido_em": antigo}) is None


# ------------------------------------------------------------------ coleta: modo automático e resumo

def vaga(n, nota, lista="principal", email=True):
    return Vaga(fonte="teste", id_origem=str(n), titulo=f"Analista de Dados Júnior {n}", empresa="Fictícia",
                url="https://x", nota=nota, lista=lista, emails=[f"rh@f{n}.exemplo.com"] if email else [])


def test_modo_automatico_desligado_por_padrao_e_criterios():
    vagas = [vaga(1, 95), vaga(2, 95, lista="vale_tentar"), vaga(3, 80), vaga(4, 95, email=False), vaga(5, 96), vaga(6, 97)]
    assert _para_fila(vagas, set(), {"ligado": False}, []) == []
    fila = _para_fila(vagas, {"teste:5"}, {"ligado": True, "nota_minima": 90, "so_lista_principal": True}, ["f6.exemplo.com"])
    assert [f["vaga_id"] for f in fila] == ["teste:1"]
    assert fila[0]["email_assunto"] == email_modelo(vagas[0])[0] and fila[0]["fila_em"]


def test_resumo_usa_vagas_desde_a_completa_anterior():
    class Sb:
        desde = None

        def ultima_completa(self):
            return "2026-10-20T21:30:00+00:00"

        def vagas_novas_desde(self, desde, nota):
            Sb.desde = desde
            return [
                {"id": "gupy:1", "titulo": "Analista de Dados Jr", "nota": 90, "candidatura": []},
                {"id": "gupy:2", "titulo": "Já descartada", "nota": 92, "candidatura": [{"status": "descartada"}]},
                {"id": "gupy:3", "titulo": "Na fila", "nota": 91, "candidatura": [{"status": "nova", "fila_em": "x"}]},
            ]

    vagas = _novas_para_resumo(Sb(), 85)
    assert Sb.desde == "2026-10-20T21:30:00+00:00" and [v.id for v in vagas] == ["gupy:1"]
